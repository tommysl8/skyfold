/**
 * The Galaxy's particles, drawn into a target of their own at a fraction of the view's resolution
 * and added to the view by one full-screen pass.
 *
 * Seen from inside the disc or from far above it, hundreds of thousands of soft splats overlap:
 * drawn at full resolution they would cost tens of millions of blended pixels a frame, several
 * milliseconds on an integrated GPU. The Galaxy's light is smooth at the scale of a few pixels, so
 * drawing it at a quarter of the resolution in each direction (a sixteenth of the pixels) and adding
 * the result with bilinear filtering looks the same and costs a sixteenth. The scene pass
 * (LightspeedScenePass.ts) renders the target before each half of the view, with that half's point
 * uniforms (classical or relativistic), so it is aberrated and Doppler shifted like the stars.
 *
 * Inside the Galaxy (in the bulge, or in the disc, and in flight near the centre, where the sky
 * crowds ahead) the large splats near the camera are most of the pixels blended. Every splat over 4
 * target pixels (1σ, half the budget over which they are drawn by lot: galaxy.vert.glsl) goes into
 * a second target of half the resolution, where it costs a quarter as much and looks the same (it
 * is smooth over several of that target's pixels); the composite adds the two. Measured on the
 * target laptop, this saves up to 3 ms a frame where there are many (the bulge seen from inside the
 * disc, the flight to the centre) and costs up to 0.8 ms where there are few (the second pass over
 * every particle). Each half of the split view draws all of its splats in one pass instead.
 *
 * The particles add linear light; the composite turns the sum into what is drawn with the same law
 * as the sky from the Sun (shaders/galaxyComposite.glsl, shared with the lens), and drops what the eye
 * could not see: the summed light fades out between the surface brightnesses of MW_MU_FADE. The Milky
 * Way model's glow near the camera (shaders/galaxyGlow.frag.glsl) is a quad drawn into the coarse
 * target, in its pass, and in a half of the split view on its own (layer GALAXY_GLOW_LAYER): drawn into
 * the finer target, with that half's splats, it cost four times as much (about 1 ms a half on the
 * target laptop) and looked the same.
 *
 * Near a black hole (render/lens/lensState.ts: lens.active) the layer's light is resampled through the
 * lens inside the lens box (render/lens/lensComposite.ts reads these targets); the plain composite then
 * draws only the frame round the box (shaders/lensBox.vert.glsl places both from the half's box). For
 * that the layer changes three things, and nothing at all with no lens:
 *  - the glow gets a target of its own (rtGlow, the size of rtBig) whenever the layer is drawn over the
 *    whole width: the particles' targets hold flux per pixel (a splat's kernel is fixed in pixels, and a
 *    pinhole pixel at θ from the view's axis sees ω² cos³θ), the glow radiance, so the lens must scale
 *    the two differently (render/lens/lensComposite.ts); with no lens the glow's input is a 1 × 1 black texture and
 *    the plain composite's sum is today's;
 *  - within 3,000 M of the hole, or with an Einstein ring over 100 px, the targets carry mipmaps
 *    (lens.mipmaps), which the lens reads at the level of each pixel's footprint on the sky (about
 *    0.35–0.5 ms a frame: only there); they are dropped 30 s after they are last wanted;
 *  - a half of the split view is drawn over its own columns plus the lens box's and one coarse texel
 *    (columnsFor): every primary image's source lies on the arc from its pixel to the hole, inside the
 *    box; never the whole width for nothing (that cost 0.65 ms).
 * renderSkyCubeFace draws the layer into a face of the hole's sky cube (render/lens/skyCube.ts).
 */
import {
  AdditiveBlending,
  type Camera,
  Color,
  DataTexture,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  RGBAFormat,
  type Scene,
  ShaderMaterial,
  type Texture,
  Vector2,
  type WebGLCubeRenderTarget,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import lensBoxVert from './shaders/lensBox.vert.glsl?raw';
import { galaxyUniforms, psfUniforms } from './materials';
import { MW_MU_FADE, patchFlux } from '../sim/galaxy/background';
import { lens } from './lens/lensState';
import { lensUniforms } from './lens/lensUniforms';
import { createFrameGeometry } from './lens/lensGeometry';

/** Layer of the Galaxy's particles: drawn only into the Galaxy's target. */
export const GALAXY_LAYER = 4;
/** Layer of the Milky Way model's glow near the camera: drawn only into the Galaxy's coarse target. */
export const GALAXY_GLOW_LAYER = 5;
/** The targets' mipmaps (and the glow's own target) are dropped this long after the lens last wanted them, ms. */
const LENS_TARGETS_KEPT_MS = 30_000;

/**
 * The target holds linear light: at each pixel, the flux (in V = 0 stars) that falls within a
 * faint star's image area, f. It is drawn as the stars and the sky from the Sun are: luminance
 * uGain √f (a faint star of flux f peaks at uStarGain √f), with the stars' raised saturation, and
 * faded out below what the eye could see (uFade: f at 24 and at 22 mag/arcsec²): the law is the chunk
 * lightspeed_galaxycomposite. The glow's own target (near a black hole) is added in; it is black otherwise.
 */
const COMPOSITE_FRAG = /* glsl */ `
#include <lightspeed_galaxycomposite>
uniform sampler2D uGalaxy;
uniform sampler2D uGalaxyBig;
uniform sampler2D uGalaxyGlow;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uGalaxy, vUv) + texture2D(uGalaxyBig, vUv) + texture2D(uGalaxyGlow, vUv);
  gl_FragColor = vec4(galaxyDisplay(t), 1.0);
}
`;

/** A 1 × 1 black texture: the glow's input while it has no target of its own. */
function blackTexture(): DataTexture {
  const t = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export class GalaxyLayer {
  /**
   * Who has something to draw this frame: the model of the Milky Way (scene/GalaxyModel.tsx), the
   * galaxies beyond it (scene/Galaxies.tsx) and their photographs (scene/GalaxyPictures.tsx).
   */
  readonly wants = { milkyWay: false, galaxies: false, pictures: false };
  /** The Milky Way model's share of the view near the Sun (scene/GalaxyModel.tsx; see COMPOSITE_FRAG). */
  modelShare = 1;
  /** Whether there is anything to draw this frame. */
  get active(): boolean {
    return this.wants.milkyWay || this.wants.galaxies || this.wants.pictures;
  }
  /** Target pixels per device pixel. */
  resScale = 0.25;
  /** The large splats' target, as a share of the main one's resolution. */
  readonly bigScale = 0.5;
  private rt: WebGLRenderTarget | null = null;
  private rtBig: WebGLRenderTarget | null = null;
  /** The glow on its own (the whole width while a lens is drawn). */
  private rtGlow: WebGLRenderTarget | null = null;
  private readonly black = blackTexture();
  private clearColor = new Color();
  /** The targets carry mipmaps; and when the lens last wanted them, or its own glow target (performance.now). */
  private mips = false;
  private mipsWantedAt = -Infinity;
  private glowWantedAt = -Infinity;
  /**
   * What the plain and the lensed composites read, shared by reference (render/lens/lensComposite.ts): the
   * targets, whether rtBig holds the glow (a half of the split view) or large splats, whether they carry
   * mipmaps, and the display law's settings.
   */
  readonly inputs = {
    uGalaxy: { value: null as Texture | null },
    uGalaxyBig: { value: null as Texture | null },
    uGalaxyGlow: { value: null as Texture | null },
    uGalaxyBigIsGlow: { value: 0 },
    uMipmaps: { value: 0 },
    /** The columns drawn this pass, NDC x (a half of the split view: its own and the lens box's). */
    uColumns: { value: new Vector2(-1, 1) },
    uFade: { value: new Vector2(0, 1e-9) },
    uGain: { value: 1.6 },
    uModelShare: { value: 1 },
  };
  readonly composite: ShaderMaterial;
  /** The full-screen quad that adds the target to the view (a mesh of the scene: scene/GalaxyModel.tsx mounts it). */
  readonly quad: Mesh;

  constructor() {
    const i = this.inputs;
    i.uGalaxyGlow.value = this.black;
    this.composite = new ShaderMaterial({
      uniforms: { uGalaxy: i.uGalaxy, uGalaxyBig: i.uGalaxyBig, uGalaxyGlow: i.uGalaxyGlow, uFade: i.uFade, uGain: i.uGain, uModelShare: i.uModelShare, uLensBox: lensUniforms.uLensBox },
      vertexShader: lensBoxVert,
      fragmentShader: COMPOSITE_FRAG,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    // The frame round the lens box; with no lens its first rectangle is the full-screen quad (lensGeometry.ts).
    this.quad = new Mesh(createFrameGeometry(), this.composite);
    this.quad.frustumCulled = false;
  }

  /** The small splats' target (the lens reads it). */
  get rtTexture(): Texture | null {
    return this.rt?.texture ?? null;
  }
  /** The large splats' target, or the glow in a half of the split view. */
  get rtBigTexture(): Texture | null {
    return this.rtBig?.texture ?? null;
  }
  /** 1 when rtBig holds the glow (a half of the split view), 0 when it holds large splats. */
  get bigIsGlow(): number {
    return this.inputs.uGalaxyBigIsGlow.value;
  }
  /** The glow on its own (while the lens is drawn over the whole width), else a 1 × 1 black texture. */
  get glowTexture(): Texture | null {
    return this.inputs.uGalaxyGlow.value;
  }

  /**
   * The settings every splat shares, for a view whose height is `heightCss` CSS px at `pixelRatio`
   * and whose vertical field is 2 atan(tanHalf): the target's pixels per radian, and what the eye
   * could see of the summed light (the same thresholds as the sky from the Sun). Called each frame
   * by whoever draws into the layer (the same values whoever calls).
   */
  display(tanHalf: number, heightCss: number, pixelRatio: number): void {
    const u = galaxyUniforms;
    u.uResScale.value = this.resScale;
    u.uPxPerRad.value = ((heightCss * pixelRatio) / 2 / tanHalf) * this.resScale;
    const cssPixel = (2 * tanHalf) / Math.max(1, heightCss);
    const m0 = psfUniforms.uMagZero.value;
    const faintest = patchFlux(MW_MU_FADE[1], cssPixel, m0);
    this.inputs.uFade.value.set(faintest, patchFlux(MW_MU_FADE[0], cssPixel, m0));
    this.inputs.uGain.value = psfUniforms.uStarGain.value;
    u.uFluxCut.value = 0.02 * faintest;
  }

  /** A target of `scale` × w × h pixels (the old one, resized; made again when its mipmaps come or go). */
  private static sized(rt: WebGLRenderTarget | null, w: number, h: number, scale: number, mips = false): WebGLRenderTarget {
    const tw = Math.max(1, Math.ceil(w * scale));
    const th = Math.max(1, Math.ceil(h * scale));
    if (rt && rt.texture.generateMipmaps !== mips) {
      rt.dispose();
      rt = null;
    }
    if (!rt) {
      return new WebGLRenderTarget(tw, th, {
        type: HalfFloatType,
        depthBuffer: false,
        minFilter: mips ? LinearMipmapLinearFilter : LinearFilter,
        magFilter: LinearFilter,
        generateMipmaps: mips,
      });
    }
    if (rt.width !== tw || rt.height !== th) rt.setSize(tw, th);
    return rt;
  }

  /**
   * The columns a half of the split view draws (shares of the width): its own, halfX0 … halfX1, and the lens box's
   * (NDC box[0] … box[2]) with one coarse texel either side, as one range. With no box, its own.
   */
  columnsFor(_half: 0 | 1, halfX0: number, halfX1: number, box: readonly [number, number, number, number], widthPx = 1): [number, number] {
    if (!(box[2] > box[0])) return [halfX0, halfX1];
    const texel = 1 / Math.max(1, widthPx * this.resScale * this.bigScale);
    const bx0 = 0.5 * (box[0] + 1) - texel;
    const bx1 = 0.5 * (box[2] + 1) + texel;
    return [Math.max(0, Math.min(halfX0, bx0)), Math.min(1, Math.max(halfX1, bx1))];
  }

  /** One pass: the small splats (0), the large ones (1) or all of them (−1), into `target`. */
  private static pass(renderer: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget, pass: number, x0: number, x1: number): void {
    galaxyUniforms.uBigPass.value = pass;
    // Only the columns shown (one half of the split view), and a texel either side for the filtering.
    const tw = target.width;
    const a = x0 > 0 ? Math.max(0, Math.floor(x0 * tw) - 1) : 0;
    const b = x1 < 1 ? Math.min(tw, Math.ceil(x1 * tw) + 1) : tw;
    target.scissor.set(a, 0, b - a, target.height);
    target.scissorTest = a > 0 || b < tw;
    renderer.setRenderTarget(target);
    renderer.clear(true, false, false);
    renderer.render(scene, camera);
    target.scissorTest = false;
  }

  /**
   * Draw the particles (layer GALAXY_LAYER of `scene`) and the glow (GALAXY_GLOW_LAYER) into the
   * targets, for a view of w × h device pixels, then give the render target back. The point uniforms
   * must already be the ones of the half of the view about to be drawn; x0 and x1 (shares of the
   * width) bound the columns it shows.
   */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, back: WebGLRenderTarget | null, w: number, h: number, x0 = 0, x1 = 1): void {
    this.quad.visible = this.active;
    if (!this.active) return;
    const now = performance.now();
    const lensOn = lens.active;
    if (lensOn && lens.mipmaps) this.mipsWantedAt = now;
    const mips = lensOn && lens.mipmaps ? true : this.mips && now - this.mipsWantedAt < LENS_TARGETS_KEPT_MS;
    this.mips = mips;
    const half = x0 > 0 || x1 < 1;
    const glowApart = lensOn && !half;
    if (glowApart) this.glowWantedAt = now;
    const rt = (this.rt = GalaxyLayer.sized(this.rt, w, h, this.resScale, mips));
    const big = (this.rtBig = GalaxyLayer.sized(this.rtBig, w, h, this.resScale * this.bigScale, mips));
    const inp = this.inputs;
    inp.uGalaxy.value = rt.texture;
    inp.uGalaxyBig.value = big.texture;
    inp.uGalaxyBigIsGlow.value = half ? 1 : 0;
    inp.uMipmaps.value = lensOn && lens.mipmaps ? 1 : 0;
    inp.uModelShare.value = this.wants.milkyWay ? this.modelShare : 1;
    if (glowApart) {
      const glow = (this.rtGlow = GalaxyLayer.sized(this.rtGlow, w, h, this.resScale * this.bigScale, mips));
      inp.uGalaxyGlow.value = glow.texture;
    } else {
      inp.uGalaxyGlow.value = this.black;
      if (this.rtGlow && now - this.glowWantedAt > LENS_TARGETS_KEPT_MS) {
        this.rtGlow.dispose();
        this.rtGlow = null;
      }
    }
    // A half of the split view near a hole: its own columns plus the lens box's.
    let c0 = x0;
    let c1 = x1;
    if (half && lensOn) {
      const h1 = x0 > 0 ? 1 : 0;
      [c0, c1] = this.columnsFor(h1, x0, x1, lens.view[h1].box, w);
    }
    inp.uColumns.value.set(2 * c0 - 1, 2 * c1 - 1);
    const mask = camera.layers.mask;
    const autoClear = renderer.autoClear;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setClearColor(0x000000, 0);
    camera.layers.set(GALAXY_LAYER);
    renderer.autoClear = false;
    galaxyUniforms.uBigScale.value = this.bigScale;
    if (half) {
      // Half of the split view: its fill is halved already, and the particles are gone through
      // twice a frame (once for each half); a third and fourth time would cost more than it saves.
      // The glow is one quad: it still goes into the coarse target.
      GalaxyLayer.pass(renderer, scene, camera, rt, -1, c0, c1);
      camera.layers.set(GALAXY_GLOW_LAYER);
      GalaxyLayer.pass(renderer, scene, camera, big, 1, c0, c1);
    } else if (glowApart && this.rtGlow) {
      // The lens is drawn: the large splats and the glow in targets of their own.
      GalaxyLayer.pass(renderer, scene, camera, rt, 0, c0, c1);
      GalaxyLayer.pass(renderer, scene, camera, big, 1, c0, c1);
      camera.layers.set(GALAXY_GLOW_LAYER);
      GalaxyLayer.pass(renderer, scene, camera, this.rtGlow, 1, c0, c1);
    } else {
      GalaxyLayer.pass(renderer, scene, camera, rt, 0, c0, c1);
      camera.layers.enable(GALAXY_GLOW_LAYER);
      GalaxyLayer.pass(renderer, scene, camera, big, 1, c0, c1);
    }
    galaxyUniforms.uBigPass.value = 0;
    renderer.autoClear = autoClear;
    camera.layers.mask = mask;
    renderer.setClearColor(this.clearColor, clearAlpha);
    renderer.setRenderTarget(back);
  }

  /**
   * One face of the hole's sky cube (render/lens/skyCube.ts): the particles (glow false) or the glow (true), all
   * splats in one pass, seen through faceCam (90°, at the camera) into face `face` of `target`, with the splats'
   * kernel matched in angle to the screen's at its centre (σ_face = ½ facePxPerRad / cssPxPerRad); the layer's
   * settings are put back after. The point uniforms must already be the hole frame's (at rest there, exposure 0).
   */
  renderSkyCubeFace(renderer: WebGLRenderer, scene: Scene, faceCam: Camera, target: WebGLCubeRenderTarget, face: number, facePxPerRad: number, cssPxPerRad: number, glow: boolean): void {
    const u = galaxyUniforms;
    const pxPerRad = u.uPxPerRad.value;
    const resScale = u.uResScale.value;
    const bigPass = u.uBigPass.value;
    const mask = faceCam.layers.mask;
    const autoClear = renderer.autoClear;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    u.uPxPerRad.value = facePxPerRad;
    u.uResScale.value = facePxPerRad / (cssPxPerRad * Math.max(1e-3, psfUniforms.uPixelRatio.value));
    u.uBigPass.value = -1;
    faceCam.layers.set(glow ? GALAXY_GLOW_LAYER : GALAXY_LAYER);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.setRenderTarget(target, face);
    renderer.clear(true, false, false);
    renderer.render(scene, faceCam);
    u.uPxPerRad.value = pxPerRad;
    u.uResScale.value = resScale;
    u.uBigPass.value = bigPass;
    faceCam.layers.mask = mask;
    renderer.autoClear = autoClear;
    renderer.setClearColor(this.clearColor, clearAlpha);
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
    this.rtBig?.dispose();
    this.rtBig = null;
    this.rtGlow?.dispose();
    this.rtGlow = null;
    this.black.dispose();
    this.composite.dispose();
    this.quad.geometry.dispose();
  }
}

/** The one Galaxy layer of the app. */
export const galaxyLayer = new GalaxyLayer();
