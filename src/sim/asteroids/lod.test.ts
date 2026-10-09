import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '../../test/files';
import { asteroidMagnitude, BARY_MU, conicPosition, cometMagnitude, ellipticPosition } from './conic';
import { barycentreState } from './barycentre';
import { decodeOrbitFile, FRAME_BARY, GROUPS, SHAPE_ELLIPSE, unquantH, unquantK1, unquantM1, unquantU16, type Section } from './format';
import { boundsOf, type AsteroidIndex } from './load';
import { DRAW_BUDGET, drawnStrength, exposureShift, LIMIT_MAG, limitWithNear, NEAR_CAP, planDraw, sectionBrightest } from './lod';
import { nearSelect } from './near';

const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as {
  gunzipSync(b: Uint8Array): Uint8Array;
};
const ix = readJson<AsteroidIndex>('public/data/asteroids/index.json');
const plan = ix.files.flatMap((f) => f.sections.map((s) => ({ ...boundsOf(s), id: s.id, count: s.count })));

/** Every file: the near search reads all the sections the camera is inside. */
const all: Section[] = ix.files.flatMap((f) => {
  const b = zlib.gunzipSync(readBytes(`public/data/asteroids/${f.file}`));
  return decodeOrbitFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer).sections;
});
/** The bodies checked one by one: every file (the first holds every group's brightest and every comet; the second the rest and the sample). */
const SAMPLE = new Set(ix.files.map((f) => f.file.slice(0, 2)).flatMap((n) => ix.files.find((f) => f.file === `${n}.bin.gz`)!.sections.map((s) => s.id)));
const sections = all.filter((s) => SAMPLE.has(s.id));

const DAYS = 150; // days after the reference epoch (2026-12)
const ssb = barycentreState(ix.refEpochJd + DAYS).r;

/** Each body's apparent magnitude from `cam` (au, J2000 ecliptic), in float64: what the shader computes in float32. */
function* magnitudes(s: Section, cam: { x: number; y: number; z: number }): Generator<[number, number]> {
  const mu = s.frame === FRAME_BARY ? BARY_MU : 1;
  const off = s.frame === FRAME_BARY ? ssb : { x: 0, y: 0, z: 0 };
  const p = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < s.count; k++) {
    const angles = { i: unquantU16(s.cols.i[k]) * Math.PI, node: unquantU16(s.cols.node[k]) * 2 * Math.PI, peri: unquantU16(s.cols.peri[k]) * 2 * Math.PI };
    if (s.shape === SHAPE_ELLIPSE) ellipticPosition({ a: s.cols.a[k], e: unquantU16(s.cols.e[k]), M0: unquantU16(s.cols.M[k]) * 2 * Math.PI, mu, ...angles }, DAYS, p);
    else conicPosition({ q: s.cols.q[k], e: s.cols.e[k], tp: s.cols.tp[k], mu, ...angles }, DAYS, p);
    const x = p.x + off.x;
    const y = p.y + off.y;
    const z = p.z + off.z;
    const r = Math.hypot(x, y, z);
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const delta = Math.hypot(dx, dy, dz);
    let mag: number;
    if (s.shape === SHAPE_ELLIPSE) {
      const alpha = Math.acos(Math.max(-1, Math.min(1, (x * dx + y * dy + z * dz) / (r * delta))));
      mag = asteroidMagnitude(unquantH(s.cols.H[k], s.hMin, s.hMax), r, delta, alpha);
    } else {
      const M1 = unquantM1(s.cols.M1[k]);
      const K1 = unquantK1(s.cols.K1[k]);
      mag = cometMagnitude(Number.isNaN(M1) ? 15 : M1, Number.isNaN(K1) ? 10 : K1, r, delta);
    }
    yield [k, mag];
  }
}

const VIEWS: [string, { x: number; y: number; z: number }][] = [
  ['above the inner Solar System, 7 au', { x: 0.1, y: 0.2, z: 7 }],
  ['in the ecliptic at 3 au', { x: -3, y: 0.4, z: 0.05 }],
  ['near Earth', { x: 0.2, y: -0.98, z: 0 }],
  ['near Jupiter’s leading Trojans', { x: 2.6, y: 4.5, z: 0.5 }],
  ['in the Kuiper belt, 45 au', { x: 30, y: -33, z: 3 }],
  ['out at 110 au', { x: 10, y: 20, z: 108 }],
];

describe('small bodies: the draw keeps every body brighter than the layer’s limit', () => {
  for (const [name, cam] of VIEWS) {
    it(name, { timeout: 120_000 }, () => {
      const camAu = Math.hypot(cam.x, cam.y, cam.z);
      const p = planDraw(plan, camAu, DRAW_BUDGET);
      const { counts, drawn } = p;
      expect(drawn).toBeLessThanOrEqual(DRAW_BUDGET);
      // Inside a left-out section's shell, the near search, as the layer asks it (nearClient.ts, at rest: 0.01 au).
      const inside = p.left.filter((l) => l.bound === -Infinity);
      const found = inside.length
        ? nearSelect(all, { days: DAYS, cam, ssb, limit: p.display, marginAu: 0.01, from: new Map(inside.map((l) => [l.id, l.from])), cap: NEAR_CAP })
        : { picks: new Map<number, Uint32Array>(), limit: -Infinity };
      const limit = inside.length ? limitWithNear(p, new Set(inside.map((l) => l.id)), found.limit) : p.limit;
      const picked = (s: number, k: number) => {
        const l = found.picks.get(s);
        if (!l) return false;
        let lo = 0;
        let hi = l.length;
        while (lo < hi) {
          const m = (lo + hi) >> 1;
          if (l[m] < k) lo = m + 1;
          else hi = m;
        }
        return l[lo] === k;
      };
      expect(limit).toBeLessThanOrEqual(LIMIT_MAG + exposureShift(camAu));
      let brighter = 0;
      for (const s of sections) {
        const bound = sectionBrightest(boundsOf(s), camAu);
        const n = counts.get(s.id) ?? 0;
        for (const [k, mag] of magnitudes(s, cam)) {
          // The section's bound holds for each of its bodies (the slack is for the barycentre's offset).
          expect(mag).toBeGreaterThanOrEqual(bound - 1e-6);
          if (mag > limit) continue;
          brighter++;
          expect(k < n || picked(s.id, k), `${GROUPS[s.group]} section ${s.id}: body ${k} at V ${mag.toFixed(2)} (limit ${limit.toFixed(2)})`).toBe(true);
          // …and the shader draws it: brighter than the limit, it is not faded out.
          expect(drawnStrength(mag, camAu)).toBeGreaterThan(0);
        }
      }
      // Not a vacuous check: some bodies are that bright from every view (inside the belt the promise is the near
      // search's, to about V 12, behind 200,000 bodies drawn by H).
      expect(brighter).toBeGreaterThan(0);
      expect(limit).toBeGreaterThan(9);
    });
  }
});
