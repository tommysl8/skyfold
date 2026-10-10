import { AstroTime, Body, HelioVector } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { parseTracks, propagateConic, solveKeplerElliptic, solveKeplerHyperbolic, type TracksIndex, type Vec3 } from './tracks';
import { readBytes, readJson } from '../test/files';

// Data files: public/data/tracks.{json,bin}; checkpoints: independent JPL Horizons states.
const index = readJson<TracksIndex>('public/data/tracks.json');
const binary = readBytes('public/data/tracks.bin');
const fixture = readJson<{ checkpoints: Checkpoint[] }>('src/sim/__fixtures__/track-checkpoints.json');
const tracks = parseTracks(index, binary);

interface Checkpoint {
  body: string;
  kind: string;
  tdb: number;
  centre: string;
  regime: string;
  pos?: Vec3;
  tolKm?: number;
  iso?: string;
  expectDate?: string;
}

// astronomy-engine as the app uses it: heliocentric EQJ au → ecliptic J2000 km.
const AU_KM = 149_597_870.7;
const EPS = (84381.448 / 3600) * (Math.PI / 180);
const AE: Record<string, Body> = {
  ssb: Body.SSB,
  earth: Body.Earth,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};
function aeHelio(centre: string, t: number): Vec3 {
  const v = HelioVector(AE[centre], AstroTime.FromTerrestrialTime(t));
  const [x, y, z] = [v.x * AU_KM, v.y * AU_KM, v.z * AU_KM];
  return [x, Math.cos(EPS) * y + Math.sin(EPS) * z, -Math.sin(EPS) * y + Math.cos(EPS) * z];
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

const EXPECTED_BODIES = [
  'ceres',
  'vesta',
  'eris',
  'haumea',
  'makemake',
  'gonggong',
  'quaoar',
  'sedna',
  'orcus',
  'arrokoth',
  'halley',
  'encke',
  'churyumov-gerasimenko',
  'hale-bopp',
  'oumuamua',
  'borisov',
  'atlas-3i',
  'voyager1',
  'voyager2',
  'new-horizons',
  'pioneer10',
  'parker-solar-probe',
  'jwst',
  'juno',
  'europa-clipper',
  'soho',
];

describe('tracks file', () => {
  it('contains every body', () => {
    expect(new Set(tracks.bodies)).toEqual(new Set(EXPECTED_BODIES));
  });

  it('fits in the 2 MB budget', () => {
    expect(binary.byteLength).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('meets the stated error bounds in its own accuracy table', () => {
    for (const id of tracks.bodies) {
      const a = index.bodies[id].accuracy as { requirementKm: number; maxKm: number; flyby?: { requirementKm: number; maxKm: number } };
      expect(a.maxKm, id).toBeLessThanOrEqual(a.requirementKm);
      if (a.flyby) expect(a.flyby.maxKm, id).toBeLessThanOrEqual(a.flyby.requirementKm);
    }
  });
});

// ─── Horizons checkpoints ────────────────────────────────────────────────────────────────

const byBody = new Map<string, Checkpoint[]>();
for (const c of fixture.checkpoints) byBody.set(c.body, [...(byBody.get(c.body) ?? []), c]);

describe.each([...byBody.keys()])('%s against Horizons', (id) => {
  const list = byBody.get(id)!;

  it('matches every precise checkpoint within its bound (default output)', () => {
    for (const c of list.filter((x) => x.regime === 'precise' && x.pos)) {
      const r = tracks.evalTrack(id, c.tdb);
      expect(r.regime, `${c.kind} ${c.tdb}`).toBe('precise');
      const rep = r.centre === c.centre ? r.pos : r.blend?.centre === c.centre ? r.blend.pos : undefined;
      expect(rep, `${c.kind} at ${c.tdb}: no representation relative to ${c.centre} (got ${r.centre})`).toBeDefined();
      expect(dist(rep!, c.pos!), `${c.kind} at ${c.tdb} rel. ${c.centre}`).toBeLessThanOrEqual(c.tolKm!);
    }
  });

  it('reports the right regime outside the data', () => {
    for (const c of list.filter((x) => x.kind === 'regime')) {
      const r = tracks.evalTrack(id, c.tdb);
      expect(r.regime).toBe(c.regime);
      expect(r.centre).toBe(c.centre);
      expect(r.pos.every(Number.isFinite)).toBe(true);
    }
  });

  it('extrapolates plausibly where Horizons still has data', () => {
    for (const c of list.filter((x) => x.kind === 'extrapolated')) {
      const r = tracks.evalHelio(id, c.tdb, aeHelio);
      expect(r.regime).toBe('extrapolated');
      expect(dist(r.pos, c.pos!), `${c.tdb}`).toBeLessThanOrEqual(c.tolKm!);
    }
  });
});

describe('special epochs', () => {
  it('puts Halley’s next perihelion on 2061-07-28, as JPL predicts', () => {
    const c = fixture.checkpoints.find((x) => x.body === 'halley' && x.kind === 'perihelion')!;
    expect(c.iso!.slice(0, 10)).toBe('2061-07-28');
    // Golden-section search for the minimum heliocentric distance of the fitted track.
    let a = c.tdb - 5;
    let b = c.tdb + 5;
    const r = (t: number) => norm(tracks.evalTrack('halley', t).pos);
    const g = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 80; i++) {
      const x1 = b - g * (b - a);
      const x2 = a + g * (b - a);
      if (r(x1) < r(x2)) b = x2;
      else a = x1;
    }
    const tp = (a + b) / 2;
    expect(Math.abs(tp - c.tdb)).toBeLessThan(0.01);
    const date = new Date((tp + 10957.5) * 86400000).toISOString().slice(0, 10);
    expect(date).toBe('2061-07-28');
  });

  it('stores every flyby relative to its planet, closest approach within 1 km', () => {
    const cas = fixture.checkpoints.filter((x) => x.kind === 'closest-approach');
    const centres = new Set(cas.map((c) => `${c.body}:${c.centre}`));
    for (const want of [
      'voyager1:jupiter',
      'voyager1:saturn',
      'voyager2:jupiter',
      'voyager2:saturn',
      'voyager2:uranus',
      'voyager2:neptune',
      'new-horizons:jupiter',
      'new-horizons:pluto',
      'new-horizons:arrokoth',
      'pioneer10:jupiter',
      'parker-solar-probe:venus',
      'juno:earth',
      'europa-clipper:mars',
      'europa-clipper:earth',
    ])
      expect(centres.has(want), want).toBe(true);
    for (const c of cas) {
      const r = tracks.evalTrack(c.body, c.tdb, { raw: true });
      const rep = r.centre === c.centre ? r.pos : r.blend?.pos;
      expect(dist(rep!, c.pos!), `${c.body} ${c.centre}`).toBeLessThanOrEqual(1);
    }
  });

  it('keeps flyby geometry exact against the app’s own planet (heliocentric, as drawn)', () => {
    for (const c of fixture.checkpoints.filter((x) => x.kind === 'closest-approach')) {
      const craft = tracks.evalHelio(c.body, c.tdb, aeHelio).pos;
      const planet = c.centre === 'arrokoth' ? tracks.evalHelio('arrokoth', c.tdb, aeHelio).pos : aeHelio(c.centre, c.tdb);
      expect(Math.abs(dist(craft, planet) - norm(c.pos!)), `${c.body} at ${c.centre}`).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Structure and continuity ────────────────────────────────────────────────────────────

/** Segment table straight from the binary, to test the joins. */
function segmentTable() {
  const dv = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const n = dv.getUint32(8, true);
  const off = dv.getUint32(16, true);
  const out: { t0: number; t1: number; flags: number }[] = [];
  for (let k = 0; k < n; k++) out.push({ t0: dv.getFloat64(off + 24 * k, true), t1: dv.getFloat64(off + 24 * k + 8, true), flags: dv.getUint16(off + 24 * k + 22, true) });
  return out;
}

describe('continuity', () => {
  it('joins consecutive segments with continuous position and velocity', () => {
    const table = segmentTable();
    let joins = 0;
    for (const id of tracks.bodies) {
      for (const p of index.bodies[id].pieces) {
        for (let k = p.seg0; k < p.seg0 + p.segCount - 1; k++) {
          if (table[k].flags & 1) continue; // a jump in the Horizons source itself
          const t = table[k].t1;
          const h = 1e-9; // days: short enough that curvature over h is negligible
          // Probe this piece on both sides of the join and extrapolate each side to the join.
          const at = (dt: number) => {
            const s = tracks.evalState(id, t + dt, { raw: true });
            return s.centre === p.centre ? s : s.blend!;
          };
          const [l2, l1, r1, r2] = [at(-2 * h), at(-h), at(h), at(2 * h)];
          const hs = h * 86400;
          const pl: Vec3 = [0, 1, 2].map((d) => l1.pos[d] + l1.vel[d] * hs) as Vec3;
          const pr: Vec3 = [0, 1, 2].map((d) => r1.pos[d] - r1.vel[d] * hs) as Vec3;
          const vl: Vec3 = [0, 1, 2].map((d) => 2 * l1.vel[d] - l2.vel[d]) as Vec3;
          const vr: Vec3 = [0, 1, 2].map((d) => 2 * r1.vel[d] - r2.vel[d]) as Vec3;
          expect(dist(pl, pr), `${id} position at join ${t}`).toBeLessThanOrEqual(1e-12 * norm(l1.pos) + 1e-5);
          // Velocity is a derivative over the segment's half-length, so rounding in the
          // position coefficients (~1e-16 |p|) shows up divided by it on very short segments.
          const halfSeconds = (Math.min(table[k].t1 - table[k].t0, table[k + 1].t1 - table[k + 1].t0) / 2) * 86400;
          // SOHO's thirty years of Earth-centred segments meet to within about 40 µm/s (the rounding of the constrained
          // solve on long segments of a slow body); the bound for it is 0.1 mm/s.
          const slack = id === 'soho' ? 1e-7 : 1e-9;
          expect(dist(vl, vr), `${id} velocity at join ${t}`).toBeLessThanOrEqual(1e-9 * norm(l1.vel) + slack + (1e-15 * norm(l1.pos)) / halfSeconds);
          joins++;
        }
      }
    }
    expect(joins).toBeGreaterThan(100);
  });

  it('is continuous (in the app frame) where the fit hands over to extrapolation', () => {
    for (const id of tracks.bodies) {
      const b = index.bodies[id];
      for (const [t, dir] of [
        [b.precise[0], -1],
        [b.precise[1], 1],
      ] as const) {
        const h = 1e-6;
        const inside = tracks.evalHelio(id, t - dir * h, aeHelio);
        const inside2 = tracks.evalHelio(id, t - dir * 2 * h, aeHelio);
        const outside = tracks.evalHelio(id, t + dir * h, aeHelio);
        // Heliocentric speed (km/day) just inside the edge; the step across is 2h. Spacecraft
        // before launch sit at their first sample, so their only gap is that motion.
        const speed = dist(inside.pos, inside2.pos) / h;
        expect(dist(inside.pos, outside.pos), `${id} edge ${t}`).toBeLessThanOrEqual(speed * 2 * h * 1.5 + 0.01);
      }
    }
  });

  it('flags every join listed as a jump', () => {
    const table = segmentTable();
    for (const id of tracks.bodies) {
      for (const p of index.bodies[id].pieces) {
        const flagged: number[] = [];
        for (let k = p.seg0; k < p.seg0 + p.segCount - 1; k++) if (table[k].flags & 1) flagged.push(table[k + 1].t0);
        // Every listed jump sits on a flagged join (a few more flagged joins are velocity-only breaks).
        for (const j of p.jumps ?? []) expect(flagged.some((f) => Math.abs(f - j.t) < 2 / 86400), `${id} jump at ${j.t}`).toBe(true);
      }
    }
  });

  it('returns jumps exactly by default, and smooths them only on request', () => {
    let seen = 0;
    let switches = 0;
    for (const id of tracks.bodies) {
      for (const p of index.bodies[id].pieces) {
        for (const j of p.jumps ?? []) {
          const pick = (r: { pos: Vec3; centre: string; blend?: { pos: Vec3; centre: string } }) => (r.centre === p.centre ? r.pos : r.blend!.pos);
          const e = 1e-7;
          const smooth = { smoothJumps: true };
          // Default: the data as they are, jump included, nothing adjusted.
          const before = tracks.evalTrack(id, j.t - e);
          const after = tracks.evalTrack(id, j.t + e);
          expect(dist(pick(before), pick(after)), `${id} jump`).toBeGreaterThan(0.9 * j.jumpKm);
          expect(before.adjustedKm).toBeUndefined();
          expect(tracks.evalTrack(id, j.t - j.rampDays / 4).adjustedKm).toBeUndefined();
          // raw: true is the same as the default.
          expect(dist(pick(tracks.evalTrack(id, j.t - e, { raw: true })), pick(before))).toBe(0);
          // smoothJumps: continuous across the jump, never more than half the jump away.
          const sb = tracks.evalTrack(id, j.t - e, smooth);
          const sa = tracks.evalTrack(id, j.t + e, smooth);
          const s = tracks.evalState(id, j.t + e);
          const speed = norm(s.centre === p.centre ? s.vel : s.blend!.vel) * 86400;
          expect(dist(pick(sb), pick(sa)), `${id} smoothed`).toBeLessThanOrEqual(speed * 2 * e * 1.5 + 1e-3);
          expect(sb.adjustedKm! / j.jumpKm, id).toBeCloseTo(0.5, 3);
          expect(sa.adjustedKm! / j.jumpKm, id).toBeCloseTo(0.5, 3);
          for (const f of [-0.45, -0.25, 0.25, 0.45]) {
            const r = tracks.evalTrack(id, j.t + f * j.rampDays, smooth);
            expect(r.adjustedKm!, `${id} ramp ${f}`).toBeLessThanOrEqual(0.5 * j.jumpKm + 1e-6);
            expect(r.adjustedKm!).toBeGreaterThan(0);
          }
          expect(tracks.evalTrack(id, j.t - j.rampDays * 0.51, smooth).adjustedKm).toBeUndefined();
          expect(tracks.evalTrack(id, j.t + j.rampDays * 0.51, smooth).adjustedKm).toBeUndefined();
          // The ramp stays inside its piece.
          expect(j.t - j.rampDays / 2, `${id} ramp start`).toBeGreaterThan(p.t0);
          expect(j.t + j.rampDays / 2, `${id} ramp end`).toBeLessThan(p.t1);
          // The smoothed velocity is the derivative of the smoothed position.
          const h = 1e-5 * j.rampDays;
          const tv = j.t + 0.3 * j.rampDays;
          const sv = tracks.evalState(id, tv, smooth);
          const vel = sv.centre === p.centre ? sv.vel : sv.blend!.vel;
          const fd = [0, 1, 2].map((d) => (pick(tracks.evalTrack(id, tv + h, smooth))[d] - pick(tracks.evalTrack(id, tv - h, smooth))[d]) / (2 * h * 86400)) as Vec3;
          expect(dist(fd, vel), `${id} smoothed velocity`).toBeLessThanOrEqual(1e-4 * norm(vel) + 1e-5);
          if (j.cause === 'solution-switch') switches++;
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(15);
    expect(switches).toBe(15); // Encke 8, 67P 5, Arrokoth 2
  });

  it('blends planet-centred pieces in and out with a weight from 0 to 1', () => {
    for (const id of tracks.bodies) {
      for (const p of index.bodies[id].pieces) {
        if (p.role !== 'inner' || !p.blendIn) continue;
        const start = tracks.evalTrack(id, p.t0 + 1e-9);
        const mid = tracks.evalTrack(id, p.t0 + p.blendIn / 2);
        const end = tracks.evalTrack(id, p.t0 + p.blendIn * 1.01);
        expect(start.blend?.centre, id).toBe(p.centre);
        expect(start.blend!.weight).toBeLessThan(1e-6);
        expect(mid.blend!.weight).toBeCloseTo(0.5, 6);
        expect(end.centre).toBe(p.centre);
        expect(end.blend).toBeUndefined();
      }
    }
  });
});

describe('regimes and robustness', () => {
  it('returns finite positions for any finite time', () => {
    const times = [-Number.MAX_VALUE, -1e300, -1e15, -1e12, -1e9, -1e6, -2e5, -36525, 0, 36525, 1e5, 1e6, 1e9, 1e12, 1e15, 1e300, Number.MAX_VALUE];
    for (const id of tracks.bodies) {
      for (const t of times) {
        const r = tracks.evalState(id, t);
        expect(r.pos.every(Number.isFinite), `${id} at ${t}`).toBe(true);
        expect(r.vel.every(Number.isFinite), `${id} velocity at ${t}`).toBe(true);
      }
    }
  });

  it('keeps extrapolated bodies moving far from the data (no freeze)', () => {
    let checked = 0;
    for (const id of tracks.bodies) {
      const b = index.bodies[id];
      for (const [f, sign] of [
        [b.before, -1],
        [b.after, 1],
      ] as const) {
        if (f.regime !== 'extrapolated') continue;
        // Years ±30,000, ±1 million and ±1 billion: positions a day apart differ by the speed.
        for (const years of [3e4, 1e6, 1e9]) {
          const t = sign * years * 365.25;
          const s = tracks.evalState(id, t);
          const step = dist(s.pos, tracks.evalTrack(id, t + 1).pos);
          const speed = norm(s.vel) * 86400;
          expect(speed, `${id} speed at ${sign * years} yr`).toBeGreaterThan(0);
          expect(step / speed, `${id} at ${sign * years} yr`).toBeGreaterThan(0.9);
          expect(step / speed, `${id} at ${sign * years} yr`).toBeLessThan(1.1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    // Ceres at year 1,000,000: about 3.5 au per year along its orbit (it no longer stops at ±27,000 years).
    const t = (1e6 - 2000) * 365.25;
    const moved = dist(tracks.evalTrack('ceres', t).pos, tracks.evalTrack('ceres', t + 365.25 / 12).pos) / 149_597_870.7;
    expect(moved * 12).toBeGreaterThan(2);
    expect(moved * 12).toBeLessThan(5);
  });

  it('handles near-parabolic fallbacks (universal variables) at any date', () => {
    // No body in the file needs this path today; a synthetic one-segment file exercises it.
    const mu = 1.3271244e11;
    const q = 1.5e8;
    for (const de of [-1e-7, 1e-7, 5e-7]) {
      const vp = Math.sqrt((mu * (2 + de)) / q);
      const buf = new ArrayBuffer(32 + 24 + 8 * 12);
      const dv = new DataView(buf);
      [0x4c, 0x54, 0x52, 0x4b].forEach((c, i) => dv.setUint8(i, c));
      [1, 1, 12, 32, 56, buf.byteLength].forEach((x, i) => dv.setUint32(4 + 4 * i, x, true));
      dv.setFloat64(40, 1, true);
      dv.setUint16(52, 3, true);
      dv.setFloat64(56, q, true);
      const fb = { regime: 'extrapolated' as const, model: 'two-body' as const, centre: 'sun', epoch: 1, r: [q, 0, 0] as Vec3, v: [0, vp, 0] as Vec3, mu };
      const piece = { centre: 'sun', role: 'outer' as const, t0: 0, t1: 1, seg0: 0, segCount: 1, blendIn: 0, blendOut: 0, tolKm: 1 };
      const file = { format: 'lightspeed-tracks' as const, version: 1, centres: {}, bodies: { x: { name: 'x', kind: 'comet', precise: [0, 1] as [number, number], pieces: [piece], before: fb, after: fb, accuracy: { requirementKm: 1, maxKm: 1, rmsKm: 1 } } } };
      const tr = parseTracks(file, new Uint8Array(buf));
      let last = 0;
      for (const days of [10, 1e5, 1e6 - 1, 1e6 + 1, 1e9, 1e12, 1e15, 1e300]) {
        for (const sign of [1, -1]) {
          const s = tr.evalState('x', 1 + sign * days);
          expect(s.pos.every(Number.isFinite) && s.vel.every(Number.isFinite), `e−1=${de} at ${sign * days}`).toBe(true);
        }
        const r = norm(tr.evalTrack('x', 1 + days).pos);
        expect(r, `recedes, e−1=${de} at ${days}`).toBeGreaterThanOrEqual(last * 0.999999);
        last = r;
      }
    }
  });

  it('keeps elliptic fallbacks on their ellipse at any date', () => {
    for (const id of ['ceres', 'vesta', 'encke', 'churyumov-gerasimenko', 'halley', 'eris', 'sedna']) {
      const f = index.bodies[id].after as unknown as { r: Vec3; v: Vec3; mu: number };
      const r0 = norm(f.r);
      const a = 1 / (2 / r0 - norm(f.v) ** 2 / f.mu);
      expect(a, id).toBeGreaterThan(0);
      for (const t of [1e7, 1e9, 1e12, 1e300]) {
        const r = norm(tracks.evalTrack(id, t).pos);
        expect(r / a, `${id} at ${t}`).toBeGreaterThan(0);
        expect(r / a, `${id} at ${t}`).toBeLessThan(2.0001);
      }
    }
  });

  it('labels spacecraft before launch, after their data, and JWST after 2031', () => {
    expect(tracks.evalTrack('voyager2', -8200).regime).toBe('before-launch');
    expect(tracks.evalTrack('voyager2', -8200).centre).toBe('earth');
    expect(tracks.evalTrack('voyager1', 40000).regime).toBe('extrapolated');
    expect(tracks.evalTrack('voyager1', 40000).centre).toBe('ssb');
    expect(tracks.evalTrack('jwst', 12000).regime).toBe('unknown');
    expect(tracks.evalTrack('jwst', 9000).regime).toBe('precise');
    expect(tracks.evalTrack('jwst', 9000).centre).toBe('earth');
    expect(tracks.evalTrack('ceres', -8000).regime).toBe('extrapolated');
    expect(tracks.evalTrack('ceres', 0).regime).toBe('precise');
  });

  it('sends interstellar objects away on hyperbolas outside the Horizons span', () => {
    for (const id of ['oumuamua', 'borisov', 'atlas-3i']) {
      const [t0, t1] = index.bodies[id].precise;
      const far = [t0 - 365250, t0 - 36525, t1 + 36525, t1 + 365250].map((t) => norm(tracks.evalHelio(id, t, aeHelio).pos));
      const edge = [t0, t1].map((t) => norm(tracks.evalHelio(id, t, aeHelio).pos));
      expect(far[0]).toBeGreaterThan(far[1]);
      expect(far[1]).toBeGreaterThan(edge[0]);
      expect(far[2]).toBeGreaterThan(edge[1]);
      expect(far[3]).toBeGreaterThan(far[2]);
    }
  });

  it('rejects NaN times and unknown bodies', () => {
    expect(() => tracks.evalTrack('ceres', Number.NaN)).toThrow();
    expect(() => tracks.evalTrack('nibiru', 0)).toThrow();
  });
});

// ─── Two-body solvers ────────────────────────────────────────────────────────────────────

describe('Kepler solvers', () => {
  it('solves the elliptic equation to machine precision for any M and e < 1', () => {
    for (const e of [0, 1e-6, 0.1, 0.5, 0.9, 0.99, 0.999, 0.999999]) {
      for (const M of [-1e4, -7, -1, 0, 1e-9, 0.5, 3, Math.PI, 6.28, 100, 1e5]) {
        const E = solveKeplerElliptic(M, e);
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-12 * Math.max(1, Math.abs(M)));
      }
    }
  });

  it('solves the hyperbolic equation for e from 1.0001 to 50 and |M| up to 1e12', () => {
    for (const e of [1.0001, 1.2, 3.356, 6.14, 50]) {
      for (const M of [1e-10, 1e-3, 0.5, 1, 10, 1e3, 1e6, 1e9, 1e12]) {
        for (const s of [1, -1]) {
          const H = solveKeplerHyperbolic(s * M, e);
          const f = e * Math.sinh(H) - H - s * M;
          expect(Math.abs(f), `e=${e} M=${s * M}`).toBeLessThanOrEqual(1e-12 * Math.max(1, M) + 1e-15);
        }
      }
    }
  });

  it('propagates a 3I/ATLAS-like hyperbola (e ≈ 6.1) forward and back', () => {
    const mu = 1.3271244e11;
    // Perihelion 1.356 au at 68 km/s: e = r v²/mu − 1 ≈ 6.1.
    const q = 1.356 * AU_KM;
    const vp = Math.sqrt((mu * (1 + 6.14)) / q);
    const r0: Vec3 = [q, 0, 0];
    const v0: Vec3 = [0, vp * Math.cos(0.1), vp * Math.sin(0.1)];
    for (const dt of [86400, 3.15e7, 3.15e9, 3.15e11]) {
      const f = propagateConic(r0, v0, dt, mu);
      const back = propagateConic(f.r, f.v, -dt, mu);
      expect(dist(back.r, r0) / q).toBeLessThan(1e-9);
      const energy0 = (vp * vp) / 2 - mu / q;
      const energy = (norm(f.v) ** 2) / 2 - mu / norm(f.r);
      expect(Math.abs(energy - energy0) / Math.abs(energy0)).toBeLessThan(1e-9);
    }
  });

  it('propagates ellipses over many orbits without drift', () => {
    const mu = 1.3271244e11;
    const r0: Vec3 = [0.586 * AU_KM, 0, 0];
    const vp = Math.sqrt((mu * (1 + 0.967)) / (0.586 * AU_KM));
    const v0: Vec3 = [0, vp, 0];
    const a = (0.586 * AU_KM) / (1 - 0.967);
    const period = 2 * Math.PI * Math.sqrt(a ** 3 / mu);
    const after = propagateConic(r0, v0, 40 * period, mu);
    expect(dist(after.r, r0) / (0.586 * AU_KM)).toBeLessThan(1e-7);
  });
});
