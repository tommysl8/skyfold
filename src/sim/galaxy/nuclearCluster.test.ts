/**
 * The nuclear star cluster's field round Sgr A* (sim/galaxy/nuclearCluster.ts, public/data/nsc-stars.bin.gz,
 * nuclearGlow.json from scripts/build-nsc.py), checked against the file itself, the Galaxy model it replaces
 * and fine quadratures of its own laws (docs/data/blackholes.md §6):
 *  - the file decodes, is the one the JSON describes (its SHA-256), is sorted brightest first as seen from the
 *    hole, and holds no star within 0.04 pc of it (only GRAVITY's four S-stars are there, as bodies);
 *  - its points and its glow hold, within 50 pc, the light the Galaxy model gives its nuclear cluster and disc
 *    (to 1 %);
 *  - the crossfade between the field and the model's particles keeps the light seen from 45 pc (to 5 %);
 *  - the points left out beside the camera come back as the glow's stand-in with their light (to 2 %);
 *  - the field's share w, the point share and the young stars' law behave;
 *  - the glow takes out the points' light only while they are drawn (the file loaded, the program ready).
 * Tolerances: the glow integrals are quadratures of 1e-3 or better; the 1 % and 5 % are what the model is built to hold.
 */
import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { gunzipFile } from '../../test/stars';
import { readBytes, readJson } from '../../test/files';
import { apply, GAL_TO_G_ROT, mul, WORLD_TO_GAL, type Vec3 } from './frames';
import { nscLaw, nsdLaw, nuclearGlowAt, nuclearLocalColumn, nuclearMarch, nuclearPointsAt, nuclearShare, youngLaw } from './glow';
import {
  decodeNuclearStars,
  loadNuclearStars,
  NSC_EXCLUDE_PC,
  nscFieldShare,
  nscGlowShare,
  nscGlowUniforms,
  nscPointsGate,
  nscStatus,
  NUCLEAR_GLOW,
  nuclearGlow,
  pointShare,
  updateNuclear,
} from './nuclearCluster';
import { PARSEC_KM } from '../../physics/constants';

// The field's file, fetched: failing once, then the shipped file (the loader's retry). The factory imports nothing
// that imports the module it replaces (that would wait on itself).
const fetches = vi.hoisted(() => ({ fail: 1, calls: 0, file: null as ArrayBuffer | null }));
vi.mock('../stars/catalogue', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../stars/catalogue')>();
  return {
    ...orig,
    fetchGzip: async () => {
      fetches.calls++;
      if (fetches.fail-- > 0 || !fetches.file) throw new Error('offline');
      return fetches.file;
    },
  };
});

interface NodeCrypto {
  createHash(alg: string): { update(b: Uint8Array): { digest(enc: string): string } };
}
const crypto = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:crypto') as NodeCrypto;

const laws = nuclearGlow.laws;
const json = NUCLEAR_GLOW;
const raw = gunzipFile('public/data/nsc-stars.bin.gz');
const field = decodeNuclearStars(raw);
fetches.file = raw;
const M_V_SUN = 4.83;
/** A star's V luminosity, L☉. */
const lumV = (i: number) => 10 ** (-0.4 * (field.absMagInt16[i] / 100 - M_V_SUN));

/** J2000 ecliptic → frame G's axes (a rotation: ecliptic (x, y, z) is world (x, z, −y)). */
const ECL_TO_WORLD = [
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
] as [Vec3, Vec3, Vec3];
const ECL_TO_G = mul(mul(GAL_TO_G_ROT, WORLD_TO_GAL), ECL_TO_WORLD);

/** ∫ f(R, z) dV over the sphere r < rMax (f symmetric in z), in shells uniform in ln r from 1e-3 pc, by the midpoint rule. */
function volume(f: (R: number, z: number) => number, rMax: number, nr = 1500, nmu = 200): number {
  const l0 = Math.log(1e-3);
  const l1 = Math.log(rMax);
  const dl = (l1 - l0) / nr;
  let sum = 0;
  for (let i = 0; i < nr; i++) {
    const r = Math.exp(l0 + (i + 0.5) * dl);
    let shell = 0;
    for (let k = 0; k < nmu; k++) {
      const mu = (k + 0.5) / nmu;
      shell += f(r * Math.sqrt(1 - mu * mu), r * mu);
    }
    sum += (shell / nmu) * 4 * Math.PI * r * r * r * dl;
  }
  return sum;
}

/** The Galaxy model's nuclear cluster: a Plummer sphere of half-light radius r_h flattened to q, cut at m = rmax (model.json). */
const model = readJson<{ components: { nuclearStarCluster: { rh: { value: number }; q: { value: number }; rmax: { value: number } } } }>('src/sim/galaxy/model.json');
const pl = model.components.nuclearStarCluster;
const plA = (pl.rh.value * 1000) / 1.305;
const plummerShape = (R: number, z: number) => {
  const m2 = R * R + (z / pl.q.value) ** 2;
  return m2 <= (pl.rmax.value * 1000) ** 2 ? (1 + m2 / (plA * plA)) ** -2.5 : 0;
};
const plummerNorm = json.modelShares.nscLsun / volume(plummerShape, 60);
const modelLaw = (R: number, z: number) => plummerShape(R, z) * plummerNorm + nsdLaw(laws, R, z);

describe('the field’s file', () => {
  it('decodes: 60,000 stars, the header the JSON describes, the bytes it names (SHA-256), gzipped reproducibly', () => {
    expect(field.count).toBe(60000);
    expect(field.count).toBe(json.count);
    expect(field.splitAbsMag).toBeCloseTo(json.splitAbsMag, 4);
    expect(field.innerPc).toBeCloseTo(json.innerPc, 6);
    expect(field.outerPc).toBe(json.outerPc);
    const hash = crypto.createHash('sha256').update(new Uint8Array(raw)).digest('hex');
    expect(hash).toBe(readJson<{ sha256: string }>('src/sim/galaxy/nuclearGlow.json').sha256);
    // gzip's modification time is zero (bytes 4–7), so the same seed gives the same file (build-nsc.py --verify).
    const gz = readBytes('public/data/nsc-stars.bin.gz');
    expect([gz[4], gz[5], gz[6], gz[7]]).toEqual([0, 0, 0, 0]);
  });

  it('is sorted brightest first as seen from the hole, with no star within 0.04 pc of it', () => {
    let prev = -Infinity;
    let rMin = Infinity;
    let rMax = 0;
    for (let i = 0; i < field.count; i++) {
      const p = field.positionsPc;
      const r = Math.hypot(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
      rMin = Math.min(rMin, r);
      rMax = Math.max(rMax, r);
      const m = field.absMagInt16[i] / 100 + 5 * Math.log10(r) - 5;
      // Magnitudes are stored to 0.01 (so two neighbours can swap by up to 0.01) and positions as float32.
      expect(m).toBeGreaterThanOrEqual(prev - 0.011);
      prev = Math.max(prev, m);
    }
    expect(rMin).toBeGreaterThanOrEqual(0.04 * (1 - 1e-6));
    // The farthest are the nuclear disc's few supergiants of M_V −7 to −7.7, out to 85 pc.
    expect(rMax).toBeLessThan(100);
    // The brightest are the young stars of the central half parsec: dozens brighter than the full Moon from the hole.
    const p = field.positionsPc;
    const m0 = field.absMagInt16[0] / 100 + 5 * Math.log10(Math.hypot(p[0], p[1], p[2])) - 5;
    expect(m0).toBeLessThan(-15);
  });

  it('puts the cluster’s stars flattened along the galactic pole, as its law (q = 0.71)', () => {
    // Which stars are points depends on r alone (their brightness seen from the hole), so on each sphere about
    // the hole the points follow the law's own angular profile: their mean cos²θ (θ from frame G's z axis)
    // matches the law's at their radii. Between 0.7 and 3 pc they are all the cluster's (the young stars lie
    // within 0.5 pc, the disc's beyond R = 3 pc).
    let got = 0;
    let want = 0;
    let n = 0;
    const mu2 = (r: number) => {
      let a = 0;
      let b = 0;
      for (let k = 0; k < 200; k++) {
        const mu = (k + 0.5) / 200;
        const j = nscLaw(laws, r * Math.sqrt(1 - mu * mu), r * mu);
        a += j * mu * mu;
        b += j;
      }
      return a / b;
    };
    for (let i = 0; i < field.count; i++) {
      const e = [field.positionsPc[3 * i], field.positionsPc[3 * i + 1], field.positionsPc[3 * i + 2]] as Vec3;
      const g = apply(ECL_TO_G, e);
      const r = Math.hypot(g[0], g[1], g[2]);
      if (r < 0.7 || r > 3) continue;
      got += (g[2] / r) ** 2;
      want += mu2(r);
      n++;
    }
    expect(n).toBeGreaterThan(10000);
    // Flatter than round (1/3), and as flat as the law: the scatter of the mean is about 0.3/√n.
    expect(want / n).toBeLessThan(0.3);
    expect(Math.abs(got / n - want / n)).toBeLessThan(0.01);
  });
});

describe('the field’s light', () => {
  it('points and glow hold the Galaxy model’s nuclear cluster and disc light within 50 pc, to 1 %, with 60,000, 30,000 or 10,000 points drawn', () => {
    const want = volume(modelLaw, 50);
    const e = [0, 0];
    expect(laws.counts).toEqual([60000, 30000, 10000]);
    for (let t = 0; t < laws.counts.length; t++) {
      let points = 0;
      for (let i = 0; i < laws.counts[t]; i++) {
        const p = field.positionsPc;
        if (Math.hypot(p[3 * i], p[3 * i + 1], p[3 * i + 2]) < 50) points += lumV(i);
      }
      const glow = volume((R, z) => {
        nuclearGlowAt(laws, R, 0, z, e, t);
        return e[0] + e[1];
      }, 50);
      expect(Math.abs((points + glow) / want - 1), `${laws.counts[t]} points`).toBeLessThan(0.01);
    }
    // And the cluster's alone: the Plummer model's whole share (m ≤ 50 pc lies inside r < 50 pc).
    const nscGlow = volume((R, z) => nuclearGlowAt(laws, R, 0, z, e)[0], 50);
    expect(nscGlow).toBeGreaterThan(0.5 * json.nsc.lightLsun);
  });

  it('the points’ law (the laws times their shares, and the young stars) holds the light of the points drawn, to 2 %', () => {
    for (let t = 0; t < laws.counts.length; t++) {
      let points = 0;
      for (let i = 0; i < laws.counts[t]; i++) points += lumV(i);
      const law = volume((R, z) => nuclearPointsAt(laws, R, 0, z, t), 300, 2500);
      expect(Math.abs(law / points - 1), `${laws.counts[t]} points`).toBeLessThan(0.02);
    }
  });

  it('the young stars’ law holds their light', () => {
    let sum = 0;
    const n = 20000;
    const a = Math.log(laws.young.rInPc);
    const b = Math.log(laws.young.rOutPc);
    for (let i = 0; i < n; i++) {
      const r = Math.exp(a + ((i + 0.5) * (b - a)) / n);
      sum += youngLaw(laws, r) * 4 * Math.PI * r * r * r * ((b - a) / n);
    }
    expect(sum / json.young.lightLsun).toBeCloseTo(1, 4);
  });

  it('the crossfade keeps the light seen from 30, 45 and 55 pc, to 5 %', () => {
    // Flux at the camera (L☉ / 4π pc² units) seen in 4π from the field (points × w and the glow of each law times
    // u − w s) and from the model's laws, both without dust, at six directions from Sgr A* at each distance.
    const dirs: Vec3[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    const N = 400;
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const q = Math.sqrt(1 - y * y);
      dirs.push([q * Math.cos(golden * i), q * Math.sin(golden * i), y]);
    }
    const col = [0, 0];
    const unit: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [-0.7071, 0.7071, 0],
      [0.578, 0, -0.816],
      [0, -0.889, 0.458],
    ];
    for (const [dist, c] of unit.flatMap((e) => [30, 45, 55].map((k) => [k, [e[0] * k, e[1] * k, e[2] * k] as Vec3] as const))) {
      const w = nscFieldShare(dist);
      const u = nscGlowShare(dist);
      let glow = 0;
      let model = 0;
      for (const d of dirs) {
        nuclearMarch(laws, c, d, 16, col, 0, w, u);
        glow += (col[0] + col[1]) / N;
        model += rayColumn(modelLaw, c, d) / N;
      }
      // Points: each L / (4π d²). The glow's and the model's: the column S along a line of sight is a radiance
      // S / 4π per steradian, so over the sky they give the mean column.
      let points = 0;
      const g = [0, 0, 0] as Vec3;
      for (let i = 0; i < field.count; i++) {
        const e = [field.positionsPc[3 * i], field.positionsPc[3 * i + 1], field.positionsPc[3 * i + 2]] as Vec3;
        const p = apply(ECL_TO_G, e);
        g[0] = p[0] - c[0];
        g[1] = p[1] - c[1];
        g[2] = p[2] - c[2];
        points += lumV(i) / (4 * Math.PI * (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]));
      }
      expect(Math.abs((w * points + glow) / model - 1), `${dist} pc`).toBeLessThan(0.05);
    }
  }, 60_000);
});

/** A fine quadrature of ∫ j ds along the ray from c in direction d (pc), for any law of (R, z): 4,000 steps uniform in ln s. */
function rayColumn(j: (R: number, z: number) => number, c: Vec3, d: Vec3): number {
  const n = 4000;
  const l0 = Math.log(1e-5);
  const l1 = Math.log(700);
  const dl = (l1 - l0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.exp(l0 + (i + 0.5) * dl);
    const x = c[0] + s * d[0];
    const y = c[1] + s * d[1];
    const z = c[2] + s * d[2];
    sum += j(Math.hypot(x, y), z) * s * dl;
  }
  return sum;
}

describe('the points left out beside the camera', () => {
  it('come back as the glow’s stand-in with their light, to 2 %', () => {
    // The expected points' flux from within 0.01 pc, ∫ j/(4π s²) dV = ∫ dΩ/4π ∫ j ds, against the stand-in column.
    const R = NSC_EXCLUDE_PC;
    for (const c of [
      [0.05, 0, 0],
      [0, 0.1, 0.02],
      [0.3, -0.2, 0.1],
      [1, 1, 0.3],
      [4, 0, 0],
      [10, -5, 2],
    ] as Vec3[]) {
      const stand = nuclearLocalColumn(laws, c, R);
      let want = 0;
      const nd = 300;
      const ns = 200;
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < nd; i++) {
        const y = 1 - (2 * (i + 0.5)) / nd;
        const q = Math.sqrt(1 - y * y);
        const d = [q * Math.cos(golden * i), q * Math.sin(golden * i), y];
        let s = 0;
        for (let k = 0; k < ns; k++) {
          const t = ((k + 0.5) * R) / ns;
          s += nuclearPointsAt(laws, c[0] + t * d[0], c[1] + t * d[1], c[2] + t * d[2]);
        }
        want += (s * R) / ns / nd;
      }
      expect(stand).toBeGreaterThan(0);
      expect(Math.abs(stand / want - 1)).toBeLessThan(0.02);
    }
    // Nothing inside the field's inner hole (the camera 4,000 au from the hole sees only the S-stars there).
    expect(nuclearLocalColumn(laws, [0.019, 0, 0], R)).toBe(0);
  });
});

describe('the field’s shares', () => {
  it('w: all the points within 30 pc of Sgr A*, none beyond 60, half at 45; u: all the laws’ light within 500 pc, none beyond 1 kpc', () => {
    expect(nscFieldShare(0)).toBe(1);
    expect(nscFieldShare(30)).toBe(1);
    expect(nscFieldShare(45)).toBeCloseTo(0.5, 12);
    expect(nscFieldShare(60)).toBe(0);
    expect(nscFieldShare(1e4)).toBe(0);
    expect(nscGlowShare(60)).toBe(1);
    expect(nscGlowShare(500)).toBe(1);
    expect(nscGlowShare(750)).toBeCloseTo(0.5, 12);
    expect(nscGlowShare(1000)).toBe(0);
    // The points are only drawn where the glow holds everything else: w ≤ u everywhere, so u − w s ≥ 0.
    for (let d = 1; d < 2000; d *= 1.1) expect(nscFieldShare(d)).toBeLessThanOrEqual(nscGlowShare(d));
  });

  it('beyond the points’ reach the glow is the whole of both laws, and there the field and the model’s particles share them', () => {
    // At 200 pc (w = 0, u = 1): the march is each law's full column, against a fine quadrature of the laws (rays
    // that pass 5–20 pc from the hole: the quadrature's steps, uniform in ln s from the camera, are a parsec
    // long there and would miss the cusp of a ray through it).
    const col = [0, 0];
    const unitOf = (v: Vec3): Vec3 => {
      const l = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    };
    for (const [c, d] of [
      [[200, 0, 0], unitOf([-1, 0.05, 0])],
      [[0, 200, 10], unitOf([0.1, -1, -0.05])],
      [[150, 0, 50], unitOf([-0.9487, 0.03, -0.3162])],
      [[-120, 90, -30], unitOf([1, -0.6, 0.3])],
    ] as [Vec3, Vec3][]) {
      nuclearMarch(laws, c, d, 16, col, 0, 0, 1);
      const want = rayColumn((R, z) => nscLaw(laws, R, z) + nsdLaw(laws, R, z), c, d);
      expect(Math.abs((col[0] + col[1]) / want - 1)).toBeLessThan(0.02);
      // Half of it at 750 pc from the hole (u = 0.5).
      nuclearMarch(laws, c, d, 16, col, 0, 0, 0.5);
      expect(Math.abs((col[0] + col[1]) / (0.5 * want) - 1)).toBeLessThan(0.02);
    }
  });

  it('the point share: most of the light near the hole, little beyond 10 pc, none outside the field', () => {
    expect(pointShare(0.01)).toBe(0);
    expect(pointShare(0.1)).toBeGreaterThan(0.9);
    expect(pointShare(20)).toBeLessThan(0.3);
    // Out at 100 pc only the disc's rare supergiants are bright enough from the hole.
    expect(pointShare(100)).toBeLessThan(0.001);
    expect(pointShare(400)).toBe(0);
    for (let r = 0.04; r < 300; r *= 1.3) {
      const s = pointShare(r);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
    // Each component's share is the table's, linear in ln r between its nodes.
    expect(nuclearShare(laws, 0, json.share.rPc[10])).toBeCloseTo(json.share.nsc[0][10], 6);
    expect(nuclearShare(laws, 1, json.share.rPc[20])).toBeCloseTo(json.share.nsd[0][20], 6);
    // Fewer points drawn: a smaller share at every radius, so the glow holds more.
    for (let r = 0.05; r < 40; r *= 1.5) {
      expect(pointShare(r, 1)).toBeLessThanOrEqual(pointShare(r, 0) + 1e-12);
      expect(pointShare(r, 2)).toBeLessThanOrEqual(pointShare(r, 1) + 1e-12);
    }
  });

  it('the laws: the cluster flattened along z and cut at m = 50 pc, the disc from R = 3 to 230 pc', () => {
    expect(nscLaw(laws, 2, 0)).toBeGreaterThan(nscLaw(laws, 0, 2));
    expect(nscLaw(laws, 0.03, 0)).toBe(0);
    expect(nscLaw(laws, 51, 0)).toBe(0);
    expect(nsdLaw(laws, 2.9, 0)).toBe(0);
    expect(nsdLaw(laws, 3.1, 0)).toBeGreaterThan(0);
    expect(nsdLaw(laws, 231, 0)).toBe(0);
  });
});

describe('the glow while the points are not drawn', () => {
  it('keeps their light until the field has loaded and their program is ready, and tries a failed load again', async () => {
    const on = nscGlowUniforms.uNscGlowOn.value;
    const cam = new Vector3(10 * PARSEC_KM, 0, 0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      // Not loaded: the glow holds all the light (w out of it 0), and the local stand-in with it.
      updateNuclear(cam, 0, null);
      expect(on.x).toBe(0);
      expect(on.w).toBe(1);
      // The first fetch fails; the next call tries again and loads.
      await expect(loadNuclearStars()).rejects.toThrow('offline');
      expect(nscStatus()).toBe('failed');
      updateNuclear(cam, 0, null);
      expect(on.x).toBe(0);
      await loadNuclearStars();
      expect(nscStatus()).toBe('ready');
      expect(fetches.calls).toBe(2);
      updateNuclear(cam, 0, null);
      expect(on.x).toBe(nscFieldShare(10));
      expect(on.x).toBe(1);
      // Loaded, but the points' program still compiling: the glow keeps their light.
      nscPointsGate.programsReady = () => false;
      updateNuclear(cam, 0, null);
      expect(on.x).toBe(0);
      nscPointsGate.programsReady = () => true;
      updateNuclear(cam, 0, null);
      expect(on.x).toBe(1);
    } finally {
      nscPointsGate.programsReady = () => true;
      warn.mockRestore();
      updateNuclear(null, 0, null);
    }
  });
});
