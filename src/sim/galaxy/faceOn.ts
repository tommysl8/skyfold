/**
 * The Milky Way model seen face-on, for the view from outside it (render/shaders/galaxyFace.frag.glsl): two maps over
 * ±FACE_EXTENT_KPC of frame G, built once by scripts/build-galaxy-face.mjs into public/textures/galaxy-face-*.png and
 * decoded with faceOn.json's ranges.
 *  - young: the young arm stars' surface brightness for a total luminosity of 1 L☉ (L☉/pc²), from 160 times as many of
 *    the model's own young arm stars as the app draws (the builder's), each spread over its 8th neighbours, so their
 *    clumps show; times the luminosity their particles hold at run time;
 *  - bar: the long bar's thin and super-thin parts the same way, for 1 L☉ in all, times their particles' light;
 *  - dust: the face-on V-band extinction through the whole disc, A_V (mag): the disc's sech² layer, ∫ a sech²(z/h) dz
 *    = 2 a h, and the arm lanes' Gaussian, ∫ a e^(−z²/w²) dz = √π a w (model.ts dustMidplane).
 * The thin and thick discs are smooth in radius: the shader has their laws (glow.ts glowDisc) and needs no map.
 *
 * The particles of the discs and the young arm stars blur this structure over their 8th neighbours (hundreds of parsecs
 * between the arms); these maps hold it at FACE_EXTENT_KPC × 2 / FACE_RES = 9.8 pc, finer than a pixel of the view from
 * outside at full resolution.
 */
import { createGalaxyModel, dustMaps, type GalaxyModelJson } from './model';

export const FACE_RES = 4096;
export const FACE_EXTENT_KPC = 20;

/** A map's 8-bit log encoding: e = ln(1 + v / v0) / ln(1 + vmax / v0) × 255. */
export interface LogRange {
  v0: number;
  vmax: number;
}

export const encodeLog = (v: number, r: LogRange): number => Math.max(0, Math.min(255, Math.round((Math.log1p(Math.max(0, v) / r.v0) / Math.log1p(r.vmax / r.v0)) * 255)));
export const decodeLog = (byte: number, r: LogRange): number => r.v0 * Math.expm1((byte / 255) * Math.log1p(r.vmax / r.v0));

/** The face-on A_V map, row 0 at y = −extent and column 0 at x = −extent (as the dust maps). */
export function faceOnDust(json: GalaxyModelJson, res = FACE_RES, extent = FACE_EXTENT_KPC): Float32Array {
  const d = dustMaps(createGalaxyModel(json), res, extent);
  const av = new Float32Array(res * res);
  for (let i = 0; i < res * res; i++) av[i] = 2 * d[4 * i] * d[4 * i + 1] + Math.sqrt(Math.PI) * d[4 * i + 2] * d[4 * i + 3];
  return av;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The face's share comes in as the camera rises from FACE_HEIGHT_KPC[0] to [1] above the midplane… */
export const FACE_HEIGHT_KPC: readonly [number, number] = [1.5, 3];
/** …and as its elevation seen from the Galaxy's centre, sin = |z| / r, rises between these (edge-on, the discs' thickness shows). */
export const FACE_ELEVATION: readonly [number, number] = [0.25, 0.4];

/**
 * The face-on maps' share of the discs' light for a camera at g (frame G, kpc): none in or near the disc, where its
 * thickness and the glow near the camera matter, nor seen nearly edge-on; all of it from a few kiloparsecs above it.
 */
export function faceShare(g: readonly number[]): number {
  const h = Math.abs(g[2]);
  const r = Math.hypot(g[0], g[1], g[2]);
  return r > 0 ? smooth(FACE_HEIGHT_KPC[0], FACE_HEIGHT_KPC[1], h) * smooth(FACE_ELEVATION[0], FACE_ELEVATION[1], h / r) : 0;
}

/** The Galaxy layer's resolution inside the Milky Way (render/galaxyLayer.ts: smooth light, many splats overlapping). */
export const LAYER_RES_INSIDE = 0.25;
/** Beyond this distance from the Galaxy's centre (kpc) only galaxies are in the layer: few splats, drawn sharp. */
export const OUTSIDE_KPC: readonly [number, number] = [35, 40];

/**
 * The Galaxy layer's resolution (target pixels per device pixel): full where the face draws most of the Milky Way or
 * the camera is out among the galaxies (few splats: on the target laptop's integrated GPU, 2560 px wide, full
 * resolution cost 0.45 ms more than half there), a quarter inside it; with a margin either way, so that it does not
 * flip back and forth (each change resizes the targets).
 */
export function layerResolution(current: number, face: number, rKpc: number): number {
  const sharp = 1;
  const isSharp = current > LAYER_RES_INSIDE;
  if (isSharp) return face < 0.3 && rKpc < OUTSIDE_KPC[0] ? LAYER_RES_INSIDE : sharp;
  return face > 0.6 || rKpc > OUTSIDE_KPC[1] ? sharp : LAYER_RES_INSIDE;
}
