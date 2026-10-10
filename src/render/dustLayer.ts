/**
 * The Sun's neighbourhood in 3D dust on the GPU: the map of Edenhofer et al. (2024) as two 3D textures, ray-marched
 * into a "dust sky" round the camera that the sky map, the Galaxy layer and the stars read (shaders/localDust.frag.glsl,
 * localDustView.frag.glsl, localDustRead.glsl; docs/data/dust.md).
 *
 * The grids (sim/dust/volume.ts) are uploaded as half floats of mag/kpc with their mipmaps (the march reads the level of
 * its step's length, so a long step averages the dust it crosses), each with a texture of its 8³ blocks' largest
 * density (nearest) for stepping over empty space: about 20 MB on the GPU for both (the dust skies below take 33 MB
 * more). Once a grid is in, the Sun's sky is
 * marched once (1,024 × 512, galactic plate carrée, the column at the eight distances of SUN_KNOTS_PC), for the stars
 * and the sky map to take out the dust already in what Earth sees.
 *
 * What the dust does depends on where the camera is, not on where it looks, so the march is not redone each frame: it
 * fills the camera's dust sky (the same plate carrée, from the camera's place), a band of SKY_ROWS_PER_FRAME rows a
 * frame, and only once the camera has moved by more than a small share of its distance to the nearest dust (a parallax
 * under about 0.25°). The place it is marched from is where the camera will be when the band reaches the last row (its
 * velocity carries it on), and the finished sky fades in over FADE_MS from the one before. Each frame a plain lookup
 * turns it into the view, at a quarter of the view's resolution each way, in each half of the view with that half's
 * observer (the remap's rest-frame rays: in flight the clouds are aberrated as the sky is), into three small targets
 * the readers take with bilinear filtering. So turning the view, or a camera at rest, costs only that lookup, and a
 * moving camera one band a frame (docs/data/dust.md §5 has the measurements). Nothing at all is done while `strength`
 * is 0 (scene/DustClouds.tsx: near the Sun, beyond the neighbourhood, before the map has loaded): the readers skip it.
 */
import {
  ClampToEdgeWrapping,
  Data3DTexture,
  DataUtils,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  type PerspectiveCamera,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import remapVert from './shaders/remap.vert.glsl?raw';
import localDustFrag from './shaders/localDust.frag.glsl?raw';
import localDustViewFrag from './shaders/localDustView.frag.glsl?raw';
import { galaxyUniforms, relativityUniforms } from './materials';
import { localDustBlack, localDustUniforms } from './localDustUniforms';
import { blockMax, densityTable, DUST_OUTER_PC, gridBox, SUN_KNOTS_PC, type DustGrid } from '../sim/dust/volume';
import { DUST_ALBEDO_V } from '../sim/dust/light';
import { WORLD_TO_GAL, type Mat3 } from '../sim/galaxy/frames';

/** Voxels a side of a block whose largest density decides whether the march steps over it. */
export const DUST_BLOCK = 8;
/** A block whose largest density is under this (mag/kpc) is stepped over: 0.02 mag/kpc adds < 0.002 mag in 80 pc. */
export const DUST_SKIP_BELOW = 0.02;
/** The march's step: max(voxel, STEP_K · distance). */
export const DUST_STEP_K = 0.02;
/** The dust skies' size (galactic plate carrée: 0.35° texels). */
export const SKY_W = 1024;
export const SKY_H = 512;
/** Rows of the camera's dust sky marched a frame while it is being redone. */
export const SKY_ROWS_PER_FRAME = 16;
/** A finished dust sky fades in over this long, ms. */
export const FADE_MS = 250;
/**
 * The camera's dust sky is redone once the camera has moved by more than this share of its distance to the nearest
 * dust (or of 2 pc, if nearer): a parallax of at most about 0.25°, under a texel of the sky.
 */
export const REDO_SHARE = 0.004;
/** A star is made at most this much brighter (mag) than its catalogue magnitude: the map is a mean, its small scales uncertain. */
export const STAR_DEREDDEN_MAX = 1.5;
/** The sky map is lightened by at most this much (mag) where the camera sees less dust than the Sun did. */
export const SKY_DEREDDEN_MAX = 1.5;
/** A block counts as a cloud for the nearest-dust distance from this largest density, mag/kpc (diffuse dust is about 1). */
const NEAR_DUST_MAG_PER_KPC = 10;

const matrix3 = (m: Mat3, out = new Matrix3()): Matrix3 => out.set(m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]);

/** A grid as a half-float 3D texture of mag/kpc, with mipmaps (or of blocks' maxima, nearest). */
function volumeTexture(data: Uint16Array, nx: number, ny: number, nz: number, mips: boolean): Data3DTexture {
  const t = new Data3DTexture(data, nx, ny, nz);
  t.format = RedFormat;
  t.type = HalfFloatType;
  t.minFilter = mips ? LinearMipmapLinearFilter : NearestFilter;
  t.magFilter = mips ? LinearFilter : NearestFilter;
  t.wrapS = t.wrapT = t.wrapR = ClampToEdgeWrapping;
  t.generateMipmaps = mips;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

interface Uploaded {
  grid: DustGrid;
  tex: Data3DTexture;
  max: Data3DTexture;
  /** The block texture's extent, pc. */
  maxSize: Vector3;
  /** The centres (pc) of the blocks that hold dust, 3 a block, for the nearest-dust distance. */
  dusty: Float32Array;
  /** Half a block's diagonal, pc. */
  blockReach: number;
}

/** A grid's textures: its densities (mag/kpc) and its blocks' maxima; and where its dusty blocks are. */
function upload(grid: DustGrid): Uploaded {
  const table = densityTable(grid);
  const half = new Uint16Array(256);
  for (let c = 0; c < 256; c++) half[c] = DataUtils.toHalfFloat(1000 * table[c]);
  const n = grid.codes.length;
  const data = new Uint16Array(n);
  const codes = grid.codes;
  for (let i = 0; i < n; i++) data[i] = half[codes[i]];
  const bm = blockMax(grid, table, DUST_BLOCK);
  const maxData = new Uint16Array(bm.data.length);
  const centres: number[] = [];
  const s = DUST_BLOCK * grid.voxelPc;
  const box = gridBox(grid);
  for (let i = 0; i < maxData.length; i++) {
    maxData[i] = DataUtils.toHalfFloat(1000 * bm.data[i]);
    if (1000 * bm.data[i] >= NEAR_DUST_MAG_PER_KPC) {
      const x = i % bm.bx;
      const y = Math.floor(i / bm.bx) % bm.by;
      const z = Math.floor(i / (bm.bx * bm.by));
      centres.push(box.min[0] + (x + 0.5) * s, box.min[1] + (y + 0.5) * s, box.min[2] + (z + 0.5) * s);
    }
  }
  return {
    grid,
    tex: volumeTexture(data, grid.nx, grid.ny, grid.nz, true),
    max: volumeTexture(maxData, bm.bx, bm.by, bm.bz, false),
    maxSize: new Vector3(bm.bx * s, bm.by * s, bm.bz * s),
    dusty: new Float32Array(centres),
    blockReach: (Math.sqrt(3) / 2) * s,
  };
}

/** The distance (pc) from p to the nearest block of a grid that holds dust (to its edge, roughly), or Infinity. */
function nearestDust(u: Uploaded | null, p: Vector3): number {
  if (!u) return Infinity;
  const c = u.dusty;
  let best = Infinity;
  for (let i = 0; i < c.length; i += 3) {
    const dx = c[i] - p.x;
    const dy = c[i + 1] - p.y;
    const dz = c[i + 2] - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) best = d2;
  }
  return Math.max(0, Math.sqrt(best) - u.blockReach);
}

/** The march's material (also compiled ahead: render/precompile.ts). */
export function createLocalDustMaterial(): ShaderMaterial {
  const g = galaxyUniforms;
  return new ShaderMaterial({
    glslVersion: GLSL3,
    uniforms: {
      uOuter: { value: null },
      uInner: { value: null },
      uOuterMax: { value: null },
      uInnerMax: { value: null },
      uOuterMaxSize: { value: new Vector3(1, 1, 1) },
      uInnerMaxSize: { value: new Vector3(1, 1, 1) },
      uOuterMin: { value: new Vector3() },
      uOuterSize: { value: new Vector3(1, 1, 1) },
      uOuterVoxel: { value: 10 },
      uInnerMin: { value: new Vector3() },
      uInnerSize: { value: new Vector3(1, 1, 1) },
      uInnerVoxel: { value: 4 },
      uInnerOn: { value: 0 },
      uMapRadius: { value: DUST_OUTER_PC },
      uSkipBelow: { value: DUST_SKIP_BELOW },
      uStepK: { value: DUST_STEP_K },
      uMode: { value: 0 },
      uSunKnots: { value: [...SUN_KNOTS_PC] },
      uOrigin: { value: new Vector3() },
      uAlbedo: { value: DUST_ALBEDO_V },
      uModelOn: { value: 0 },
      uDust: g.uDust,
      uWarpMap: g.uWarpMap,
      uDustExtent: g.uDustExtent,
      uGalToG: g.uGalToG,
      uSunG: g.uSunG,
      uDiscH: { value: 300 },
      uMidZ: { value: -20.8 },
      uFarPc: { value: 1000 },
    },
    vertexShader: remapVert,
    fragmentShader: localDustFrag,
    depthTest: false,
    depthWrite: false,
  });
}

/** The view's lookup of the camera's dust sky (also compiled ahead). */
export function createLocalDustViewMaterial(): ShaderMaterial {
  const black = localDustBlack();
  return new ShaderMaterial({
    glslVersion: GLSL3,
    uniforms: {
      uMap0: { value: black },
      uMap1: { value: black },
      uPrev0: { value: black },
      uPrev1: { value: black },
      uFade: { value: 1 },
      uSun1: { value: black },
      uProjInv: { value: new Matrix4() },
      uCamWorld: { value: new Matrix4() },
      uWorldToGal: { value: matrix3(WORLD_TO_GAL) },
      uVelDir: relativityUniforms.uVelDir,
      uEPhi: relativityUniforms.uEPhi,
      uDeredMax: { value: SKY_DEREDDEN_MAX },
    },
    vertexShader: remapVert,
    fragmentShader: localDustViewFrag,
    depthTest: false,
    depthWrite: false,
  });
}

/** A dust sky: two half-float targets (galactic plate carrée), wrapping in longitude. */
function skyTarget(): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(SKY_W, SKY_H, { count: 2, type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
  for (const t of rt.textures) {
    t.wrapS = RepeatWrapping;
    t.wrapT = ClampToEdgeWrapping;
  }
  return rt;
}

/** A material on a quad of its own scene. */
function quadScene(m: ShaderMaterial): Scene {
  const scene = new Scene();
  const quad = new Mesh(new PlaneGeometry(2, 2), m);
  quad.frustumCulled = false;
  scene.add(quad);
  return scene;
}

export class DustLayer {
  /** How much of the dust's effect is drawn (0 to 1): scene/DustClouds.tsx sets it each frame. */
  strength = 0;
  /** A strength to draw instead of the place's (comparisons and measurements: window.__ls.dust.layer), or null. */
  forceStrength: number | null = null;
  /** Redo the camera's dust sky without end, as a camera always moving would (measurements). */
  alwaysRedo = false;
  /** The camera, heliocentric galactic pc, and its velocity, pc/s (scene/DustClouds.tsx). */
  readonly camPc = new Vector3();
  readonly velPcS = new Vector3();
  /** The frame's length, s. */
  dt = 1 / 60;
  /** View-target pixels per device pixel. */
  resScale = 0.25;
  /** How many bands have been marched (for the measurements), and when the last camera sky was finished. */
  readonly stats = { bands: 0, skies: 0, nearestDustPc: Infinity };
  private outer: Uploaded | null = null;
  private inner: Uploaded | null = null;
  private sunRt: WebGLRenderTarget | null = null;
  private sunDirty = true;
  /** The next row of the Sun's sky to march (it is marched in bands too: in one draw it can stall the GPU). */
  private sunRow = 0;
  /** The Sun's sky has been completed once (a redone one is shown as it is marched: the grids differ only in detail). */
  private sunReady = false;
  /** The camera's dust skies: the one shown, the one before it (fading out) and the one being marched. */
  private skies: WebGLRenderTarget[] = [];
  private front = -1;
  private prev = -1;
  private building: { index: number; row: number; origin: Vector3 } | null = null;
  private readonly frontOrigin = new Vector3();
  private fadeStart = -Infinity;
  private skyDirty = true;
  private modelWas = false;
  /** The frame the march last ran in (a frame is marched once, whatever the halves). */
  private marchedFrame = -1;
  frame = 0;
  private viewRt: WebGLRenderTarget | null = null;
  private march: ShaderMaterial | null = null;
  private view: ShaderMaterial | null = null;
  private marchScene: Scene | null = null;
  private viewScene: Scene | null = null;
  private readonly quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** The renderer last drawn with (for probe). */
  private renderer: WebGLRenderer | null = null;

  /** Whether anything is drawn this frame. */
  get active(): boolean {
    return this.strength > 0 && !!this.outer;
  }

  /** The grids drawn: uploaded when they change (once each). */
  setGrids(outer: DustGrid | null, inner: DustGrid | null): void {
    if (outer && this.outer?.grid !== outer) {
      this.outer?.tex.dispose();
      this.outer?.max.dispose();
      this.outer = upload(outer);
      this.sunDirty = this.skyDirty = true;
    }
    if (inner && this.inner?.grid !== inner) {
      this.inner?.tex.dispose();
      this.inner?.max.dispose();
      this.inner = upload(inner);
      this.sunDirty = this.skyDirty = true;
    }
  }

  private marchMat(): ShaderMaterial {
    if (!this.march) {
      this.march = createLocalDustMaterial();
      this.marchScene = quadScene(this.march);
    }
    return this.march;
  }

  private viewMat(): ShaderMaterial {
    if (!this.view) {
      this.view = createLocalDustViewMaterial();
      this.viewScene = quadScene(this.view);
    }
    return this.view;
  }

  /** The grids' uniforms. */
  private bindGrids(u: ShaderMaterial['uniforms']): void {
    const o = this.outer!;
    const ob = gridBox(o.grid);
    u.uOuter.value = o.tex;
    u.uOuterMax.value = o.max;
    u.uOuterMaxSize.value.copy(o.maxSize);
    u.uOuterMin.value.set(...ob.min);
    u.uOuterSize.value.set(...ob.size);
    u.uOuterVoxel.value = o.grid.voxelPc;
    const i = this.inner;
    u.uInnerOn.value = i ? 1 : 0;
    // An unused sampler still needs a texture of its kind: the outer one stands in.
    u.uInner.value = i ? i.tex : o.tex;
    u.uInnerMax.value = i ? i.max : o.max;
    if (i) {
      const ib = gridBox(i.grid);
      u.uInnerMaxSize.value.copy(i.maxSize);
      u.uInnerMin.value.set(...ib.min);
      u.uInnerSize.value.set(...ib.size);
      u.uInnerVoxel.value = i.grid.voxelPc;
    }
  }

  /**
   * A band of the Sun's sky: the column from the Sun at the eight knots, for every direction (redone once a grid
   * changes, before the camera's). Returns whether it is complete.
   */
  private marchSunBand(renderer: WebGLRenderer): boolean {
    if (this.sunDirty) {
      this.sunDirty = false;
      this.sunRow = 0;
      this.skyDirty = true;
    }
    if (this.sunRow >= SKY_H) return true;
    const u = this.marchMat().uniforms;
    this.bindGrids(u);
    this.sunRt ??= skyTarget();
    u.uMode.value = 1;
    u.uModelOn.value = 0;
    const rows = Math.min(SKY_ROWS_PER_FRAME, SKY_H - this.sunRow);
    const rt = this.sunRt;
    rt.scissor.set(0, this.sunRow, SKY_W, rows);
    rt.scissorTest = true;
    renderer.setRenderTarget(rt);
    renderer.render(this.marchScene!, this.quadCam);
    rt.scissorTest = false;
    u.uMode.value = 0;
    this.sunRow += rows;
    this.stats.bands++;
    if (this.sunRow < SKY_H) return false;
    const lu = localDustUniforms;
    lu.uLocalDustSun0.value = rt.textures[0];
    lu.uLocalDustSun1.value = rt.textures[1];
    this.sunReady = true;
    return true;
  }

  /** One band of the camera's dust sky (once a frame): started when the camera has moved enough, swapped in when done. */
  private marchBand(renderer: WebGLRenderer): void {
    if (this.marchedFrame === this.frame) return;
    this.marchedFrame = this.frame;
    // The Sun's sky first (its band is this frame's march).
    if (!this.marchSunBand(renderer)) return;
    const model = !!galaxyUniforms.uDust.value;
    if (model !== this.modelWas || this.alwaysRedo) this.skyDirty = true;
    this.modelWas = model;
    if (!this.building) {
      const near = Math.min(nearestDust(this.outer, this.camPc), nearestDust(this.inner, this.camPc));
      this.stats.nearestDustPc = near;
      const moved = this.camPc.distanceTo(this.frontOrigin);
      if (this.front >= 0 && !this.skyDirty && moved <= REDO_SHARE * Math.max(near, 2)) return;
      while (this.skies.length < 3) this.skies.push(skyTarget());
      const index = [0, 1, 2].find((k) => k !== this.front && k !== this.prev) ?? 0;
      // Marched from where the camera will be when the last band is done.
      const ahead = (SKY_H / SKY_ROWS_PER_FRAME) * this.dt;
      this.building = { index, row: 0, origin: this.camPc.clone().addScaledVector(this.velPcS, ahead) };
      this.skyDirty = false;
    }
    const b = this.building;
    const u = this.marchMat().uniforms;
    this.bindGrids(u);
    u.uOrigin.value.copy(b.origin);
    u.uModelOn.value = model ? 1 : 0;
    const rt = this.skies[b.index];
    const rows = Math.min(SKY_ROWS_PER_FRAME, SKY_H - b.row);
    rt.scissor.set(0, b.row, SKY_W, rows);
    rt.scissorTest = true;
    renderer.setRenderTarget(rt);
    renderer.render(this.marchScene!, this.quadCam);
    rt.scissorTest = false;
    b.row += rows;
    this.stats.bands++;
    if (b.row >= SKY_H) {
      this.prev = this.front;
      this.front = b.index;
      this.frontOrigin.copy(b.origin);
      this.fadeStart = this.prev >= 0 ? performance.now() : -Infinity;
      this.building = null;
      this.stats.skies++;
    }
  }

  /**
   * The dust in the view (w × h device pixels), for the columns x0 … x1 (shares of the width: a half of the split view)
   * with that half's observer already in the relativity uniforms; marching a band of the camera's dust sky first, once
   * a frame, when it is being redone. Gives the render target back.
   */
  render(renderer: WebGLRenderer, camera: PerspectiveCamera, back: WebGLRenderTarget | null, w: number, h: number, x0 = 0, x1 = 1): void {
    const lu = localDustUniforms;
    if (!this.active) {
      lu.uLocalDustOn.value.x = 0;
      return;
    }
    this.renderer = renderer;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.marchBand(renderer);
    if (this.front < 0 || !this.sunReady) {
      // The first dust sky is still being marched: nothing to show yet.
      lu.uLocalDustOn.value.x = 0;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(back);
      return;
    }
    const u = this.viewMat().uniforms;
    const f = this.skies[this.front];
    u.uMap0.value = f.textures[0];
    u.uMap1.value = f.textures[1];
    const fade = this.prev >= 0 ? Math.min(1, (performance.now() - this.fadeStart) / FADE_MS) : 1;
    const p = this.prev >= 0 && fade < 1 ? this.skies[this.prev] : f;
    u.uPrev0.value = p.textures[0];
    u.uPrev1.value = p.textures[1];
    u.uFade.value = fade;
    u.uSun1.value = this.sunRt!.textures[1];
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    const tw = Math.max(1, Math.ceil(w * this.resScale));
    const th = Math.max(1, Math.ceil(h * this.resScale));
    if (!this.viewRt) this.viewRt = new WebGLRenderTarget(tw, th, { count: 3, type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
    else if (this.viewRt.width !== tw || this.viewRt.height !== th) this.viewRt.setSize(tw, th);
    const rt = this.viewRt;
    // Only the columns shown (a half of the split view), and a texel either side for the filtering.
    const a = x0 > 0 ? Math.max(0, Math.floor(x0 * tw) - 1) : 0;
    const b = x1 < 1 ? Math.min(tw, Math.ceil(x1 * tw) + 1) : tw;
    rt.scissor.set(a, 0, b - a, th);
    rt.scissorTest = a > 0 || b < tw;
    renderer.setRenderTarget(rt);
    renderer.render(this.viewScene!, this.quadCam);
    rt.scissorTest = false;
    renderer.autoClear = autoClear;
    renderer.setRenderTarget(back);
    lu.uLocalDust0.value = rt.textures[0];
    lu.uLocalDust1.value = rt.textures[1];
    lu.uLocalDust2.value = rt.textures[2];
    lu.uLocalDustOn.value.set(this.strength, 1 / Math.max(1, w), 1 / Math.max(1, h), STAR_DEREDDEN_MAX);
  }

  /**
   * What the view's targets hold at a place of the view (shares of its width and height from the bottom left), for
   * checks: the four knots' columns, then t0, t1 and the scattered share, then A_sky and A_model.
   */
  probe(u: number, v: number): number[][] {
    const rt = this.viewRt;
    const renderer = this.renderer;
    if (!rt || !renderer) return [];
    const x = Math.min(rt.width - 1, Math.floor(u * rt.width));
    const y = Math.min(rt.height - 1, Math.floor(v * rt.height));
    const out: number[][] = [];
    for (let k = 0; k < 3; k++) {
      const buf = new Uint16Array(4);
      renderer.readRenderTargetPixels(rt, x, y, 1, 1, buf, undefined, k);
      out.push(Array.from(buf, (h) => DataUtils.fromHalfFloat(h)));
    }
    return out;
  }

  dispose(): void {
    this.outer?.tex.dispose();
    this.outer?.max.dispose();
    this.inner?.tex.dispose();
    this.inner?.max.dispose();
    this.outer = this.inner = null;
    this.viewRt?.dispose();
    this.sunRt?.dispose();
    for (const s of this.skies) s.dispose();
    this.skies = [];
    this.viewRt = this.sunRt = null;
    this.march?.dispose();
    this.view?.dispose();
  }
}

/** The one dust layer of the app. */
export const dustLayer = new DustLayer();
