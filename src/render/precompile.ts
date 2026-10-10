/**
 * Shader programs compiled ahead, in the background.
 *
 * three.js compiles a material's program when it is first drawn, and the frame waits for it. On an
 * integrated GPU the first compile of a large shader takes a tenth to a quarter of a second or more
 * (Intel Xe, Chrome/ANGLE: the Milky Way model's glow 270 ms, its particles 240, the cosmic web 130),
 * so the first time the camera leaves the Sun's neighbourhood, a flight starts, the CMB map or the
 * cosmic web shows, a frame would stop for that long. Once start-up's loading is over, these are
 * compiled with KHR_parallel_shader_compile (three.js compileAsync) on the driver's threads while
 * frames go on, one at a time, and what draws them later finds the program ready: three.js shares
 * one program between materials with the same shaders and settings. Browsers keep compiled programs
 * between visits, so this matters on a first visit and after an update that changes a shader.
 * Nothing drawn changes.
 *
 * What start-up itself draws (the stars, the nebulae, the galaxies beyond and the rest) is left to
 * compile when it first shows: compiled in the background at the same time, they only made those
 * frames wait longer (measured with every program compiled afresh: 0.95 s of stopped frames after
 * the first instead of 0.75 s), as the driver works through its compiles in turn.
 *
 * The order: the three materials first drawn on the way out of the Solar neighbourhood, then the
 * relativistic view's remap (a flight's first frame draws it: measured on the target laptop, with it
 * behind the lens's list a flight started in the first ~50 s after a cold load froze for 0.7–1.0 s
 * while it compiled), then the lens's own passes, the lensed variants of the layers that place light per
 * vertex, the ring sprites and the accretion flow's map (their first compiles take 0.1–2.4 s on the
 * target laptop, never at start-up), then the cosmic web. The lens is drawn only once the remap and
 * every program of the lens's list are ready (lensPassesReady: a fall runs the relativistic path, so its
 * remap must not compile mid-fall either), and a hole met before start-up's delay has passed starts the
 * compiles at once (precompileSoon).
 */
import { BufferAttribute, BufferGeometry, type Camera, HalfFloatType, LineSegments, Mesh, PlaneGeometry, Points, Scene, type ShaderMaterial, type WebGLRenderer, WebGLRenderTarget } from 'three';
import cosmicWebVert from './shaders/cosmicWeb.vert.glsl?raw';
import { createCmbMapMaterial, createCosmicWebMaterial, createGalaxyGlowMaterial, createGalaxyMaterial } from './materials';
import { createLocalDustMaterial, createLocalDustViewMaterial } from './dustLayer';
import { LENS_LATER } from './lens/lensMaterials';
import { VERTEX_LENS_LATER } from './lensVariants';
import { RING_LATER } from './lensRingMaterial';
import { FLOW_LATER } from './flow/flowMap';
import { cosmicSky } from '../sim/cosmos/expansion';

/** How a material is drawn when it is compiled: as points, as a quad, or as line segments. */
export type Drawn = 'points' | 'quad' | 'lines';

/** A material to compile in the background, and how it is drawn. */
export type LaterMaterial = readonly [() => ShaderMaterial, Drawn];

/** The materials first drawn on the way out of the Solar neighbourhood or on demand, and what draws them. */
export const OUTWARD_LATER: readonly LaterMaterial[] = [
  [createGalaxyGlowMaterial, 'quad'],
  [() => createGalaxyMaterial(1, 0), 'points'],
  [createCmbMapMaterial, 'quad'],
  // The neighbourhood's dust: its march, first drawn a few parsecs from the Sun (render/dustLayer.ts).
  [createLocalDustMaterial, 'quad'],
  [createLocalDustViewMaterial, 'quad'],
];

/**
 * The lens's own passes, the lensed variants of the layers that place light per vertex, the ring sprites and the
 * accretion flow's map, all first drawn near a black hole: the lens waits for every one (lensPassesReady).
 */
export const LENS_WAITS_FOR: readonly LaterMaterial[] = [...LENS_LATER, ...VERTEX_LENS_LATER, ...RING_LATER, ...FLOW_LATER];

/** Every material compiled in the background, in its order (the relativistic view's remap goes between the two lists). */
export const LATER_MATERIALS: readonly LaterMaterial[] = [...OUTWARD_LATER, ...LENS_WAITS_FOR];

/**
 * The cosmic web's material as scene/CosmicWeb.tsx draws it once the cosmology module's emission
 * lookup has replaced the stub (render/materials.ts withEmission), or null before its table arrives.
 */
export function cosmicWebMaterialWithTable(): ShaderMaterial | null {
  const t = cosmicSky.table;
  if (!t) return null;
  const m = createCosmicWebMaterial();
  m.vertexShader = cosmicWebVert.replace('//#emission', t.table.glsl);
  return m;
}

/** A geometry of `n` points: with a position attribute, as every real one has (three.js keys programs on that too). */
function points(n: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(3 * n), 3));
  return g;
}

/** A scene of one object drawing `m`: a point, a quad or one line segment. */
function sceneOf(m: ShaderMaterial, kind: Drawn): Scene {
  const scene = new Scene();
  const o = kind === 'points' ? new Points(points(1), m) : kind === 'lines' ? new LineSegments(points(2), m) : new Mesh(new PlaneGeometry(2, 2), m);
  o.frustumCulled = false;
  scene.add(o);
  return scene;
}

/** Compile a scene's materials in the background; resolves when their programs are ready. */
function compile(renderer: WebGLRenderer, scene: Scene, camera: Camera): Promise<void> {
  // All of them draw into render targets (the scene pass's buffer, the Galaxy layer's), never the
  // canvas, and three.js keys a program on that (no tone mapping or output colour conversion).
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  const back = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const ready = renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(back);
  const done = () => target.dispose();
  return ready.then(done, done);
}

/** How often, and for how long, to look for the cosmology module's emission table, ms. */
const TABLE_POLL_MS = 1000;
const TABLE_WAIT_MS = 300_000;

let started = false;
/** How many of LENS_WAITS_FOR have compiled. */
let compiled = 0;
/** The extra scenes (the relativistic view's remap) have compiled. */
let extraDone = false;
/** The lens's extra scenes (the remap's LENS variant) have compiled. */
let lensExtraDone = false;
/** What starts the background compiles (render/RenderPipeline.tsx registers it), for precompileSoon. */
let starter: (() => void) | null = null;

/**
 * Whether the relativistic view's remap and every material of LENS_WAITS_FOR have compiled (the lens's passes and
 * the lensed variants included): the lens is drawn only then (render/lens/lensState.ts lensProgramsReady), so no
 * program the lens or a fall draws ever compiles mid-flight.
 */
export function lensPassesReady(): boolean {
  return extraDone && lensExtraDone && compiled >= LENS_WAITS_FOR.length;
}

/** Registers what starts the background compiles (render/RenderPipeline.tsx), for precompileSoon. */
export function setPrecompileStarter(start: (() => void) | null): void {
  starter = start;
}

/**
 * Start the background compiles now rather than after start-up's delay (a black hole is near: the lens waits
 * for its programs). Nothing when they have started or no pipeline is up.
 */
export function precompileSoon(): void {
  if (!started && starter) starter();
}

/**
 * Compile OUTWARD_LATER, then the `extra` scenes (the relativistic view's remap), then LENS_WAITS_FOR and the
 * `lensExtra` scenes (the remap's LENS variant), then the cosmic web once the emission table has arrived, one after
 * another in the background; once. Resolves when all of them are ready (or the table did not come).
 */
export async function precompileLater(
  renderer: WebGLRenderer,
  camera: Camera,
  extra: readonly (readonly [Scene, Camera])[] = [],
  lensExtra: readonly (readonly [Scene, Camera])[] = [],
): Promise<void> {
  if (started) return;
  started = true;
  for (const [make, kind] of OUTWARD_LATER) await compile(renderer, sceneOf(make(), kind), camera);
  for (const [scene, cam] of extra) await compile(renderer, scene, cam);
  extraDone = true;
  for (const [make, kind] of LENS_WAITS_FOR) {
    await compile(renderer, sceneOf(make(), kind), camera);
    compiled++;
  }
  for (const [scene, cam] of lensExtra) await compile(renderer, scene, cam);
  lensExtraDone = true;
  const t0 = performance.now();
  for (;;) {
    const web = cosmicWebMaterialWithTable();
    if (web) return compile(renderer, sceneOf(web, 'points'), camera);
    if (performance.now() - t0 > TABLE_WAIT_MS) return;
    await new Promise((resolve) => setTimeout(resolve, TABLE_POLL_MS));
  }
}
