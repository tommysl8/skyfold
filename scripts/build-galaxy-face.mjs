// Builds the Milky Way model's face-on maps for the view from outside it (src/sim/galaxy/faceOn.ts):
//   public/textures/galaxy-face-young.png   the young arm stars' surface brightness for 1 L☉ in all: the model's own
//                                           young arm stars (scripts/build-galaxy.mjs sampleArms, with its clumps),
//                                           YOUNG_COUNT of them, each a Gaussian as wide as the distance to its 8th
//                                           nearest neighbour (as the app's particles, but 160 times as many, so 13
//                                           times finer), down to half a texel
//   public/textures/galaxy-face-bar.png     the long bar's thin and super-thin parts the same way, for 1 L☉ in all
//                                           (each part with its share of the light, model.json), BAR_FACTOR times as
//                                           many as the app's particles
//   public/textures/galaxy-face-dust.png    the face-on V-band extinction through the disc
//   src/sim/galaxy/faceOn.json              the maps' log ranges (faceOn.ts decodeLog), and their grid
// Each a grey PNG, 8-bit log, FACE_RES square over ±FACE_EXTENT_KPC of frame G, row 0 at y = +extent (the top of
// the image; the app's textures are flipped on upload, so v = 0 is y = −extent, as the dust maps' row 0).
// The model's own code is run through Vite (it is TypeScript), so the maps are those of the app's model.json.
// Run: npm run data:galaxy-face   (about 20 minutes, most of it the young arm stars' neighbours);
//      add -- --only=bar,dust to rebuild some of the maps (the others' entries in faceOn.json are kept).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { png } from './build-faint-stars.mjs';
import { COUNTS, SEED, knnRadius, loadModel, makeRng, prepareArms, sampleArms, sampleBar } from './build-galaxy.mjs';

/** The young arm stars drawn into the map: 160 times the app's particles. */
const YOUNG_COUNT = 160 * COUNTS.youngArmStars;
/** The bar's stars: this many times the app's particles of each of its parts. */
const BAR_FACTOR = 160;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '--only=young,bar,dust').slice(7).split(',');

/**
 * Points (frame G, kpc) carrying `weights` of light (L☉, one per point) spread over the grid, each a Gaussian as wide
 * as its 8th neighbour (at least half a texel): surface brightness, L☉ per pc².
 */
function splat(pos, weights, res, extent) {
  const n = pos.length / 3;
  const h = knnRadius(pos, n, 8);
  const texel = (2 * extent) / res;
  const grid = new Float64Array(res * res);
  for (let p = 0; p < n; p++) {
    const x = pos[3 * p], y = pos[3 * p + 1];
    const sig = Math.max(0.5 * texel, h[p]);
    const ci = (x + extent) / texel - 0.5, cj = (y + extent) / texel - 0.5;
    const r = Math.ceil((3 * sig) / texel);
    const i0 = Math.max(0, Math.floor(ci) - r), i1 = Math.min(res - 1, Math.ceil(ci) + r);
    const j0 = Math.max(0, Math.floor(cj) - r), j1 = Math.min(res - 1, Math.ceil(cj) + r);
    if (i0 > i1 || j0 > j1) continue;
    const k = (texel * texel) / (2 * sig * sig);
    let w = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) w += Math.exp(-k * ((i - ci) ** 2 + (j - cj) ** 2));
    if (w <= 0) continue;
    const per = weights[p] / w;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * res + i] += per * Math.exp(-k * ((i - ci) ** 2 + (j - cj) ** 2));
  }
  // L☉ per texel → per pc².
  const area = (texel * 1000) ** 2;
  const out = new Float32Array(res * res);
  for (let i = 0; i < out.length; i++) out[i] = grid[i] / area;
  return out;
}

/** The young arm stars' face-on surface brightness for 1 L☉ in all. */
function youngMap(res, extent) {
  const model = loadModel();
  const yc = model.components.youngArmStars;
  // As generate(): 70% in clumps of 8, 30 pc across.
  const pos = sampleArms(model, prepareArms(model), YOUNG_COUNT, makeRng(SEED + 1), yc.hz.value ?? yc.hz, 0.7, 8, 0.03);
  const n = pos.length / 3;
  return splat(pos, new Float64Array(n).fill(1 / n), res, extent);
}

/** The bar's face-on surface brightness for 1 L☉ in all, its two parts each with its share of the light. */
function barMap(res, extent) {
  const model = loadModel();
  const rng = makeRng(SEED + 2);
  const bar = model.components.longBar;
  const f = model.luminosity.fractions;
  const parts = [
    [sampleBar(model, bar.thin, BAR_FACTOR * COUNTS.barThin, rng), f.barThin],
    [sampleBar(model, bar.superThin, BAR_FACTOR * COUNTS.barSuperThin, rng), f.barSuperThin],
  ];
  const total = parts.reduce((s, [, share]) => s + share, 0);
  const out = new Float32Array(res * res);
  for (const [pos, share] of parts) {
    const n = pos.length / 3;
    const m = splat(pos, new Float64Array(n).fill(share / total / n), res, extent);
    for (let i = 0; i < out.length; i++) out[i] += m[i];
  }
  return out;
}

const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const face = await server.ssrLoadModule('/src/sim/galaxy/faceOn.ts');
  const json = (await server.ssrLoadModule('/src/sim/galaxy/model.json')).default;
  const res = face.FACE_RES;
  const extent = face.FACE_EXTENT_KPC;
  const metaPath = resolve(ROOT, 'src/sim/galaxy/faceOn.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  // A change of grid rebuilds them all.
  if (meta.res !== res) only.splice(0, only.length, 'young', 'bar', 'dust');
  const max = (a) => a.reduce((m, v) => (v > m ? v : m), 0);
  const write = (name, map, range) => {
    const bytes = new Uint8Array(res * res);
    // Image row 0 is the top: y = +extent (the last row of the map).
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) bytes[j * res + i] = face.encodeLog(map[(res - 1 - j) * res + i], range);
    const out = png(bytes, res, res);
    writeFileSync(resolve(ROOT, 'public/textures', name), out);
    return out.length;
  };
  const t0 = Date.now();
  const bytes = {};
  // Ranges: the stars down to 10⁻⁴ of their brightest (far below what shows), the dust from 0.01 mag (nothing
  // visible) to its densest.
  if (only.includes('young')) {
    const young = youngMap(res, extent);
    meta.young = { v0: max(young) * 1e-4, vmax: max(young) };
    bytes.young = write('galaxy-face-young.png', young, meta.young);
  }
  if (only.includes('bar')) {
    const bar = barMap(res, extent);
    meta.bar = { v0: max(bar) * 1e-4, vmax: max(bar) };
    bytes.bar = write('galaxy-face-bar.png', bar, meta.bar);
  }
  if (only.includes('dust')) {
    const av = face.faceOnDust(json, res, extent);
    meta.dust = { v0: 0.01, vmax: max(av) };
    bytes.dust = write('galaxy-face-dust.png', av, meta.dust);
  }
  const out = { res, extentKpc: extent, young: meta.young, bar: meta.bar, dust: meta.dust };
  writeFileSync(metaPath, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ ...out, bytes, seconds: (Date.now() - t0) / 1000 }));
} finally {
  await server.close();
}
