/**
 * Picking a body of the small-body layer (scene/Asteroids.tsx) under the pointer, on the GPU: the visible sections
 * are drawn again, with the same vertex shader (PICKING defined), into a target of PICK_PX × PICK_PX pixels round
 * the pointer (the camera's view offset), each point as its section and vertex in RGBA and the brightest in front;
 * the pixel nearest the pointer names the body. Solving 1.4 million orbits on the CPU for a click would take a
 * third of a second; this is one more draw of the layer and a read of 169 pixels, on a click only.
 */
import {
  BufferGeometry,
  NoBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
  type WebGLRenderer,
  Color,
} from 'three';
import { createAsteroidMaterial } from '../render/materials';
import { sim } from '../sim/sim';
import type { SmallRef } from '../sim/asteroids/bodies';

/** How far from the pointer a body can be picked, CSS px (the belt is dense: a short reach keeps empty clicks empty). */
export const PICK_REACH_PX = 6;
const PICK_PX = 2 * PICK_REACH_PX + 1;

const PICK_FRAG = /* glsl */ `
varying vec4 vPick;
varying float vRank;
void main() {
  gl_FragColor = vPick;
  gl_FragDepth = vRank;
}
`;

/** A drawn section, as the layer keeps it. */
export interface LayerSection {
  id: number;
  conic: boolean;
  /** A sample of the bodies without a card (sim/asteroids/format.ts): drawn, never picked. */
  sample: boolean;
  points: Points;
  material: ShaderMaterial;
  /** The bodies the near search added (sim/asteroids/near.ts): the same attributes, drawn through an index. */
  near: Points | null;
}

/** The layer's sections, by id (scene/Asteroids.tsx fills it). */
export const layerSections = new Map<number, LayerSection>();

const pickScene = new Scene();
const pickPoints = new Map<number, Points<BufferGeometry, ShaderMaterial>>();
let target: WebGLRenderTarget | null = null;
const pickCamera = new PerspectiveCamera();
const pixels = new Uint8Array(PICK_PX * PICK_PX * 4);
const clear = new Color();

function pickPointsOf(s: LayerSection, key: number, source: Points): Points<BufferGeometry, ShaderMaterial> {
  let p = pickPoints.get(key);
  if (!p) {
    const m = createAsteroidMaterial(s.conic);
    m.defines = { ...m.defines, PICKING: '' };
    m.fragmentShader = PICK_FRAG;
    m.blending = NoBlending;
    m.transparent = false;
    m.depthWrite = true;
    m.depthTest = true;
    // Its own size and section; everything else shared with the drawn material.
    m.uniforms = { ...s.material.uniforms, uPointSize: { value: 1.6 }, uPickSection: { value: s.id + 1 } };
    p = new Points(source.geometry, m);
    p.frustumCulled = false;
    pickPoints.set(key, p);
    pickScene.add(p);
  }
  return p;
}

let warmed = false;

/**
 * Compile the picking programs in the background (they are two, for ellipses and conics), so the first click does
 * not wait a second for them. Called by the layer once its first file is in.
 */
export function warmPick(gl: WebGLRenderer, camera: PerspectiveCamera): void {
  if (warmed) return;
  const ell = [...layerSections.values()].find((s) => !s.conic);
  const con = [...layerSections.values()].find((s) => s.conic);
  if (!ell || !con) return;
  warmed = true;
  pickPointsOf(ell, ell.id, ell.points);
  pickPointsOf(con, con.id, con.points);
  void gl.compileAsync(pickScene, camera).catch(() => {
    warmed = false;
  });
}

/** The body of the layer drawn nearest CSS pixel (x, y), within PICK_REACH_PX, or null. */
export function pickSmallBody(gl: WebGLRenderer, camera: PerspectiveCamera, x: number, y: number): (SmallRef & { px: number }) | null {
  let any = false;
  for (const s of layerSections.values()) {
    if (s.sample) continue;
    // Its prefix (key: its id), and its near picks (key: −1 − its id).
    for (const [key, source] of [[s.id, s.points], [-1 - s.id, s.near]] as const) {
      if (!source) continue;
      const shown = source.visible && !!source.parent?.visible;
      const p = shown ? pickPointsOf(s, key, source) : pickPoints.get(key);
      if (p) p.visible = shown;
      any ||= shown;
    }
  }
  if (!any) return null;
  target ??= new WebGLRenderTarget(PICK_PX, PICK_PX, { type: UnsignedByteType, depthBuffer: true });
  pickCamera.copy(camera);
  pickCamera.layers.set(0);
  pickCamera.setViewOffset(sim.viewport.width, sim.viewport.height, x - PICK_REACH_PX, y - PICK_REACH_PX, PICK_PX, PICK_PX);
  pickCamera.updateProjectionMatrix();
  const before = gl.getRenderTarget();
  const alpha = gl.getClearAlpha();
  gl.getClearColor(clear);
  gl.setRenderTarget(target);
  gl.setClearColor(0x000000, 0);
  gl.clear(true, true, false);
  gl.render(pickScene, pickCamera);
  gl.readRenderTargetPixels(target, 0, 0, PICK_PX, PICK_PX, pixels);
  gl.setRenderTarget(before);
  gl.setClearColor(clear, alpha);
  let best: (SmallRef & { px: number }) | null = null;
  for (let row = 0; row < PICK_PX; row++) {
    for (let col = 0; col < PICK_PX; col++) {
      const k = (row * PICK_PX + col) * 4;
      if (pixels[k + 3] === 0) continue;
      // Rows come bottom first.
      const px = Math.hypot(col - PICK_REACH_PX, PICK_PX - 1 - row - PICK_REACH_PX);
      if (px > PICK_REACH_PX || (best && px >= best.px)) continue;
      best = { section: pixels[k + 3] - 1, index: pixels[k] | (pixels[k + 1] << 8) | (pixels[k + 2] << 16), px };
    }
  }
  return best;
}
