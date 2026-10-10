/**
 * The scene render at the start of the post-processing chain. It replaces postprocessing's
 * RenderPass, so bloom and tone mapping run after the relativistic stage, in the observer's frame.
 *
 * Naive (classical) view: render the scene normally.
 *
 * Relativistic view:
 *   1. Render everything except point sources into an HDR cube map from the ship's position.
 *      All cameras sit at the floating origin, and alpha records surface coverage.
 *   2. Draw the point sources (stars, glints, belts). Their shaders apply exact per-point
 *      aberration, Doppler shift and brightness change.
 *   3. Composite the cube map, remapped per pixel by aberration and recoloured by Doppler and
 *      beaming, over them (premultiplied "over"), with the cosmic microwave background, seen
 *      through its own Doppler factor, behind every surface. All of it works from the ship's
 *      rapidity, so it holds from rest to γ ≈ 10¹⁷ (see shaders/remap.frag.glsl).
 * Split view: the left part of the screen shows the naive render, the right the relativistic one.
 *
 * The cube map costs about 2 ms of GPU a frame on an integrated GPU (mostly its half-float
 * mipmaps), so it is only redrawn while something is in it: in interstellar flight, where no
 * body is wider than a pixel, it is cleared once and left alone, and the remap pass is skipped
 * while the CMB is not drawn per pixel either (remapAddsNothing). After the relativistic view has
 * been off for half a minute its memory (about 88 MiB at 1024 px a face) is given back.
 *
 * Near a black hole (render/lens/lensState.ts) each half draws with its own lens view beside its point
 * uniforms (setLensView: the lens box, the shadow's circle, the diffuse zone in that half's observer's
 * frame), the Galaxy layer of a half over its own columns and the lens box's, and the surfaces drawn
 * directly (planets, the Sun) with the classical view's exposure (materials.ts surfaceUniforms; 0 for the
 * relativistic cube, whose remap applies its own). The remap lenses the Milky Way from the Sun and the CMB (with its
 * material's LENS variant, drawn only while a lens is: far from holes the remap's program is exactly as it was).
 * During a fall the relativistic path runs throughout (relativisticView.ts). The lens's debug skies
 * (dev/lensTest.ts) draw only the lens's passes (LENS_DEBUG_LAYER), for comparison with the reference
 * pictures; with no hole every render is exactly as before. Near a hole the frame is then metered for the sky's
 * own glare (render/lens/skyMeter.ts), which sets the next frames' exposure.
 */
import {
  CubeCamera,
  CustomBlending,
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  type Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type PerspectiveCamera,
  type WebGLRenderer,
  type WebGLRenderTarget,
  WebGLCubeRenderTarget,
  Color,
  Vector3,
} from 'three';
import { Pass } from 'postprocessing';
import { buildDopplerLut, DOPPLER_LUT_LN_MAX, DOPPLER_LUT_LN_MIN, DOPPLER_LUT_SIZE } from '../physics/dopplerColor';
import { LN_SUN_SURFACE_RADIANCE, relView, setPointUniforms } from './relativisticView';
import { blackbodyRange, blackbodyTexture, milkyWayUniforms, surfaceUniforms } from './materials';
import { lens, lensOverride, setLensView } from './lens/lensState';
import { lensUniforms } from './lens/lensUniforms';
import { quality } from './quality';
import { GALAXY_GLOW_LAYER, GALAXY_LAYER, galaxyLayer } from './galaxyLayer';
import { SURVEY_GLOW_LAYER, surveyGlow } from './surveyGlow';
import { dustLayer } from './dustLayer';
import { meterSky } from './lens/skyMeter';
import { lensedVariant } from './lensVariants';
import remapVert from './shaders/remap.vert.glsl?raw';
import remapFrag from './shaders/remap.frag.glsl?raw';

/** Layer drawn into the relativistic cube map: the meshes (bodies and rings). */
const CUBE_LAYER_MASK = 1 << 0;
/** The cube map's memory is released once the relativistic view has been off this long, ms. */
const RELEASE_AFTER_MS = 30_000;

/** Whether anything visible under `o` (itself included) would be drawn on the layers of `mask`. */
export function anyVisibleOn(o: Object3D, mask: number): boolean {
  if (!o.visible) return false;
  const drawable = o as Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean };
  if ((drawable.isMesh || drawable.isLine || drawable.isPoints) && (o.layers.mask & mask) !== 0) return true;
  const kids = o.children;
  for (let i = 0; i < kids.length; i++) if (anyVisibleOn(kids[i], mask)) return true;
  return false;
}

/**
 * Whether the remap pass would leave the picture as it is: nothing in the cube map (alpha 0
 * everywhere, so the premultiplied "over" adds nothing), the CMB not drawn per pixel (its
 * gain is 0 while it is too faint to show, and once a point source draws it) and the Milky Way
 * from the Sun not drawn (its gain is 0 beyond the Sun's neighbourhood).
 */
export const remapAddsNothing = (cubeHasContent: boolean, cmbGain: number, milkyWayGain = 0): boolean =>
  !cubeHasContent && !(cmbGain > 0) && !(milkyWayGain > 0);

/** Layer for point sources drawn analytically in the ship frame (stars, glints, belts). */
export const POINTS_LAYER = 1;
/**
 * Layer for guides (orbit lines). They are not light sources, so Doppler shifting them would be
 * meaningless. They appear in the classical view and are left out of the relativistic one.
 */
export const GUIDES_LAYER = 2;
/**
 * Layer for the classical view's background (the Milky Way from the Sun). The relativistic view
 * draws the same sky in its remap pass, aberrated and Doppler shifted, so it leaves this out.
 */
export const BACKGROUND_LAYER = 3;
/**
 * Layer of the lens's own passes when a debug sky is drawn (dev/lensTest.ts): only they are drawn then, straight to
 * the screen (render/RenderPipeline.tsx leaves out bloom and tone mapping), to compare with the reference pictures.
 */
export const LENS_DEBUG_LAYER = 6;

export class LightspeedScenePass extends Pass {
  private readonly world: Scene;
  private readonly viewCam: PerspectiveCamera;
  private cubeRT: WebGLCubeRenderTarget;
  private cubeCam: CubeCamera;
  private quadScene = new Scene();
  private quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private remap: ShaderMaterial;
  /** The remap's LENS variant (every uniform shared), drawn while a black hole's lens is; its own scene, to compile it. */
  private remapLensed: ShaderMaterial;
  private remapQuad: Mesh;
  private lensedQuadScene = new Scene();
  private clearColor = new Color();
  faceSize: number;
  /** The cube holds something drawn since it was last cleared. */
  private cubeDirty = true;
  /** When the relativistic view went off (performance.now), or −1 while it is on. */
  private offSince = -1;
  private cubeReleased = false;

  constructor(scene: Scene, camera: PerspectiveCamera, faceSize = 1024) {
    super('LightspeedScenePass', scene, camera);
    this.world = scene;
    this.viewCam = camera;
    this.needsSwap = false;
    this.faceSize = faceSize;

    this.cubeRT = LightspeedScenePass.makeCubeTarget(faceSize);
    this.cubeCam = new CubeCamera(camera.near, camera.far, this.cubeRT);
    for (const c of this.cubeCam.children) c.layers.set(0);

    const lut = new DataTexture(buildDopplerLut(DOPPLER_LUT_SIZE), DOPPLER_LUT_SIZE, 3, RGBAFormat, FloatType);
    lut.minFilter = NearestFilter;
    lut.magFilter = NearestFilter;
    lut.needsUpdate = true;

    this.remap = new ShaderMaterial({
      uniforms: {
        ...milkyWayUniforms,
        ...lensUniforms,
        uCmbHoleDir: { value: new Vector3(0, 0, -1) },
        uCmbHoleEPhi: { value: 1 },
        uCmbHoleEmPhi: { value: 1 },
        uCube: { value: this.cubeRT.texture },
        uCubeLive: { value: 1 },
        uDopplerLut: { value: lut },
        uDopplerLutRange: { value: new Vector3(DOPPLER_LUT_LN_MIN, DOPPLER_LUT_LN_MAX, DOPPLER_LUT_SIZE) },
        uBlackbody: { value: blackbodyTexture() },
        uBbRange: { value: blackbodyRange() },
        uProjInv: { value: camera.projectionMatrixInverse },
        uCamWorld: { value: camera.matrixWorld },
        uVelDir: { value: relView.velDir },
        uEPhi: { value: 1 },
        uEmPhi: { value: 1 },
        uLnPixelOverTexel: { value: 0 },
        uMaxLod: { value: Math.log2(faceSize) },
        uDoppler: { value: 1 },
        uLnExposure: { value: 0 },
        uLnSunRadiance: { value: LN_SUN_SURFACE_RADIANCE },
        uCmbDir: { value: new Vector3(0, 0, -1) },
        uCmbEPhi: { value: 1 },
        uCmbEmPhi: { value: 1 },
        uLnTCmb: { value: 0 },
        uCmbGain: { value: 0 },
      },
      vertexShader: remapVert,
      fragmentShader: remapFrag,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.remap);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.remapQuad = quad;
    this.remapLensed = lensedVariant(this.remap);
    const lensedQuad = new Mesh(quad.geometry, this.remapLensed);
    lensedQuad.frustumCulled = false;
    this.lensedQuadScene.add(lensedQuad);
  }

  private static makeCubeTarget(size: number): WebGLCubeRenderTarget {
    return new WebGLCubeRenderTarget(size, {
      type: HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
    });
  }

  /** The remap's own scene and camera, to compile its shader ahead of the first flight (precompile.ts). */
  get remapScene(): readonly [Scene, OrthographicCamera] {
    return [this.quadScene, this.quadCamera];
  }

  /** The same with the remap's LENS variant, which the lens waits for (precompile.ts lensPassesReady). */
  get remapLensedScene(): readonly [Scene, OrthographicCamera] {
    return [this.lensedQuadScene, this.quadCamera];
  }

  /** The view's layers: every one but the Galaxy's own (its particles and glow: galaxyLayer.ts) and the surveys' glows (surveyGlow.ts). */
  private static viewLayers(camera: PerspectiveCamera): void {
    camera.layers.enableAll();
    camera.layers.disable(GALAXY_LAYER);
    camera.layers.disable(GALAXY_GLOW_LAYER);
    camera.layers.disable(SURVEY_GLOW_LAYER);
  }

  /** Change the cube-map resolution (adaptive quality). */
  private resizeCube(size: number): void {
    this.cubeRT.dispose();
    this.cubeRT = LightspeedScenePass.makeCubeTarget(size);
    this.cubeCam.renderTarget = this.cubeRT;
    this.faceSize = size;
    const u = this.remap.uniforms;
    u.uCube.value = this.cubeRT.texture;
    u.uMaxLod.value = Math.log2(size);
    this.cubeDirty = true;
  }

  render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget | null): void {
    const target = this.renderToScreen ? null : inputBuffer;
    this.renderScene(renderer, target);
    // Near a black hole the sky's glare sets the exposure (render/lens/skyMeter.ts): metered on this frame's linear
    // light, before bloom and tone mapping. Far from holes it only eases a leftover stop-down back to 0.
    if (target) meterSky(renderer, target, relView.lnExposure);
  }

  private renderScene(renderer: WebGLRenderer, target: WebGLRenderTarget | null): void {
    if (quality.cubeFace !== this.faceSize) this.resizeCube(quality.cubeFace);
    const scene = this.world;
    const camera = this.viewCam;
    const autoClear = renderer.autoClear;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);

    // Everything but the Galaxy's particles and glow and the surveys' glows, drawn into their own targets (galaxyLayer.ts, surveyGlow.ts).
    LightspeedScenePass.viewLayers(camera);

    // A debug sky of the lens's checks: only the lens's own passes, each half with its observer.
    if (lensOverride.debug > 0 && lens.active) {
      const dw = target ? target.width : renderer.domElement.width;
      const dh = target ? target.height : renderer.domElement.height;
      renderer.setClearColor(0x000000, 1);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.autoClear = false;
      camera.layers.set(LENS_DEBUG_LAYER);
      const xs = Math.round(relView.splitX * dw);
      for (const rel of relView.split ? [false, true] : [relView.active]) {
        setPointUniforms(rel);
        setLensView(rel);
        if (relView.split) this.setScissor(renderer, target, rel ? xs : 0, 0, rel ? dw - xs : xs, dh, true);
        renderer.render(scene, camera);
      }
      if (relView.split) this.setScissor(renderer, target, 0, 0, dw, dh, false);
      LightspeedScenePass.viewLayers(camera);
      renderer.setClearColor(this.clearColor, clearAlpha);
      renderer.autoClear = autoClear;
      return;
    }

    if (!relView.active) {
      const now = performance.now();
      if (this.offSince < 0) this.offSince = now;
      else if (!this.cubeReleased && now - this.offSince > RELEASE_AFTER_MS) {
        // three.js makes the render target again when it is next drawn into.
        this.cubeRT.dispose();
        this.cubeReleased = true;
        this.cubeDirty = true;
      }
      setPointUniforms(false);
      setLensView(false);
      surfaceUniforms.uLnExposureSurface.value = relView.lnExposureClassical;
      dustLayer.render(renderer, camera, target, target ? target.width : renderer.domElement.width, target ? target.height : renderer.domElement.height);
      galaxyLayer.render(renderer, scene, camera, target, target ? target.width : renderer.domElement.width, target ? target.height : renderer.domElement.height);
      surveyGlow.render(renderer, scene, camera, target, target ? target.width : renderer.domElement.width, target ? target.height : renderer.domElement.height);
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.autoClear = autoClear;
      return;
    }
    this.offSince = -1;
    this.cubeReleased = false;

    // 1. Cube map of the rest-frame scene (no point sources), transparent background. Nothing
    // in it (no body a pixel wide): cleared once, then left as it is.
    const content = anyVisibleOn(scene, CUBE_LAYER_MASK);
    // The cube holds the surfaces at rest, unexposed: the remap applies the exposure.
    surfaceUniforms.uLnExposureSurface.value = 0;
    if (content || this.cubeDirty) {
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 0);
      this.cubeCam.position.set(0, 0, 0);
      this.cubeCam.updateMatrixWorld(true);
      this.cubeCam.update(renderer, scene);
      this.cubeDirty = content;
    }

    renderer.setClearColor(this.clearColor, clearAlpha);
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    const w = target ? target.width : renderer.domElement.width;
    const h = target ? target.height : renderer.domElement.height;

    // Split view: the naive (classical) render on the left, in its own columns only (the
    // relativistic half clears and draws the rest).
    let x0 = 0;
    if (relView.split) {
      setPointUniforms(false);
      setLensView(false);
      surfaceUniforms.uLnExposureSurface.value = relView.lnExposureClassical;
      dustLayer.render(renderer, camera, target, w, h, 0, relView.splitX);
      galaxyLayer.render(renderer, scene, camera, target, w, h, 0, relView.splitX);
      surveyGlow.render(renderer, scene, camera, target, w, h, 0, relView.splitX);
      x0 = Math.round(relView.splitX * w);
      this.setScissor(renderer, target, 0, 0, x0, h, true);
      renderer.clear();
      renderer.render(scene, camera);
      this.setScissor(renderer, target, x0, 0, w - x0, h, true);
    }

    // 2. Point sources in the ship frame (the Galaxy's particles first, into their own target).
    setPointUniforms(true);
    setLensView(true);
    dustLayer.render(renderer, camera, target, w, h, relView.split ? relView.splitX : 0, 1);
    galaxyLayer.render(renderer, scene, camera, target, w, h, relView.split ? relView.splitX : 0, 1);
    surveyGlow.render(renderer, scene, camera, target, w, h, relView.split ? relView.splitX : 0, 1);
    renderer.clear();
    camera.layers.set(POINTS_LAYER);
    renderer.render(scene, camera);
    LightspeedScenePass.viewLayers(camera);

    // 3. Remapped scene composited on top. With nothing in the cube (interstellar flight) and the
    // CMB not drawn per pixel, the pass would add nothing: skip it (about 1.5 ms on an integrated
    // GPU, and a resolve of the multisampled buffer).
    const cmb = relView.cmb;
    const cmbGain = cmb.visible ? cmb.resolved : 0;
    if (remapAddsNothing(content, cmbGain, milkyWayUniforms.uMwGain.value)) {
      if (relView.split) this.setScissor(renderer, target, 0, 0, w, h, false);
      renderer.autoClear = autoClear;
      return;
    }
    const u = this.remap.uniforms;
    u.uEPhi.value = relView.k;
    u.uEmPhi.value = Math.exp(-relView.phi);
    u.uDoppler.value = relView.doppler ? 1 : 0;
    u.uLnExposure.value = relView.lnExposure;
    const pixelAngle = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, h);
    const texelAngle = Math.PI / 2 / this.faceSize;
    u.uLnPixelOverTexel.value = Math.log(pixelAngle / texelAngle);
    // An empty cube (interstellar flight, only the sky behind) is not read at all.
    u.uCubeLive.value = content ? 1 : 0;
    u.uCmbDir.value.set(cmb.motion.dir.x, cmb.motion.dir.y, cmb.motion.dir.z);
    u.uCmbEPhi.value = Math.exp(cmb.motion.phi);
    u.uCmbEmPhi.value = Math.exp(-cmb.motion.phi);
    u.uLnTCmb.value = Math.log(cmb.temperature);
    u.uCmbGain.value = cmbGain;
    // Near a black hole: the hole frame's own motion through the CMB (the lensed pixels read it at their escape direction).
    const hm = cmb.holeMotion;
    u.uCmbHoleDir.value.set(hm.dir.x, hm.dir.y, hm.dir.z);
    u.uCmbHoleEPhi.value = Math.exp(hm.phi);
    u.uCmbHoleEmPhi.value = Math.exp(-hm.phi);
    // The lens's program only while a lens is drawn (it is compiled by then); the plain one, as before, otherwise.
    this.remapQuad.material = lensUniforms.uLensOn.value > 0.5 ? this.remapLensed : this.remap;
    renderer.render(this.quadScene, this.quadCamera);

    if (relView.split) this.setScissor(renderer, target, 0, 0, w, h, false);
    renderer.autoClear = autoClear;
  }

  private setScissor(
    renderer: WebGLRenderer,
    target: WebGLRenderTarget | null,
    x: number,
    y: number,
    w: number,
    h: number,
    enabled: boolean,
  ): void {
    if (target) {
      target.scissor.set(x, y, w, h);
      target.scissorTest = enabled;
      renderer.setRenderTarget(target); // re-apply the target's scissor state
    } else {
      const pr = renderer.getPixelRatio();
      renderer.setScissor(x / pr, y / pr, w / pr, h / pr);
      renderer.setScissorTest(enabled);
    }
  }

  dispose(): void {
    this.cubeRT.dispose();
    this.remap.dispose();
    this.remapLensed.dispose();
    super.dispose();
  }
}
