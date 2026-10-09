import { describe, expect, it } from 'vitest';
import { buildFieldLines, DEFAULT_SEEDS, DEFAULT_TRACE, fieldG, fieldLineSeeds, packLines, traceHalf, traceLine, type FieldFn, type Vec3 } from './fieldLines';
import { G_TO_UF23, UF23_BASE } from './magneticField';

const DEG = Math.PI / 180;

describe('the adaptive RK4 tracer', () => {
  it('follows a circular field round and closes it, keeping its radius', () => {
    // B = φ̂ (1 µG): every field line is a circle about the z axis.
    const circle: FieldFn = (x, y, _z, out) => {
      const r = Math.hypot(x, y);
      out[0] = -y / r;
      out[1] = x / r;
      out[2] = 0;
      return out;
    };
    const h = traceHalf(circle, [5, 0, 0.3], 1);
    expect(h.end).toBe('closed');
    expect(h.length).toBeCloseTo(2 * Math.PI * 5, 1);
    for (const p of h.points) {
      expect(Math.hypot(p[0], p[1])).toBeCloseTo(5, 4);
      expect(p[2]).toBeCloseTo(0.3, 9);
    }
    // Steps limited by the turn allowed: no fewer than 2π / 4°.
    expect(h.points.length).toBeGreaterThanOrEqual(90);
  });

  it('follows a helix exactly enough (pitch kept over several turns)', () => {
    const k = 0.1; // B_z / B_φ
    const helix: FieldFn = (x, y, _z, out) => {
      const r = Math.hypot(x, y);
      out[0] = -y / r;
      out[1] = x / r;
      out[2] = k;
      return out;
    };
    const o = { ...DEFAULT_TRACE, maxLength: 60, zMax: 100 };
    const h = traceHalf(helix, [2, 0, 0], 1, o);
    const last = h.points[h.points.length - 1];
    // Climbs k per unit of azimuthal path: z = k s / √(1 + k²).
    expect(last[2]).toBeCloseTo((k * h.length) / Math.hypot(1, k), 3);
    expect(Math.hypot(last[0], last[1])).toBeCloseTo(2, 3);
  });

  it('stops where the field fades below its floor and where it leaves the volume', () => {
    const fading: FieldFn = (x, _y, _z, out) => {
      out[0] = Math.exp(-x);
      out[1] = 0;
      out[2] = 0;
      return out;
    };
    const h = traceHalf(fading, [0, 0, 0], 1, { ...DEFAULT_TRACE, minField: 0.05 });
    expect(h.end).toBe('weak');
    expect(h.points[h.points.length - 1][0]).toBeCloseTo(-Math.log(0.05), 0);
    const up: FieldFn = (_x, _y, _z, out) => {
      out[0] = 0;
      out[1] = 0;
      out[2] = 1;
      return out;
    };
    const u = traceHalf(up, [0, 0, 0], 1);
    expect(u.end).toBe('outside');
    expect(u.points[u.points.length - 1][2]).toBeGreaterThan(DEFAULT_TRACE.zMax);
  });
});

describe('field lines of UF23 base in frame G', () => {
  it('follow the disc’s logarithmic spiral at the fitted pitch in the outer plane', () => {
    // At z = 0 beyond r_p the X-field is gone and the halo nil: the line is r ∝ exp(φ tan α) exactly.
    const seed: Vec3 = [-12 / G_TO_UF23, 0, 0];
    const h = traceHalf(fieldG, seed, 1, { ...DEFAULT_TRACE, maxLength: 20 });
    const tanA = Math.tan(UF23_BASE.disc.pitchDeg * DEG);
    let phiPrev = Math.atan2(seed[1], seed[0]);
    let dphi = 0;
    for (const p of h.points.slice(1)) {
      const phi = Math.atan2(p[1], p[0]);
      let d = phi - phiPrev;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      dphi += d;
      phiPrev = phi;
    }
    const end = h.points[h.points.length - 1];
    const lnr = Math.log(Math.hypot(end[0], end[1]) / Math.hypot(seed[0], seed[1]));
    expect(Math.abs(dphi)).toBeGreaterThan(0.5);
    expect(lnr / dphi).toBeCloseTo(tanA, 3);
    for (const p of h.points) expect(Math.abs(p[2])).toBeLessThan(1e-3);
  });

  it('run along B: each segment points the way of the field at its ends', () => {
    const seeds = fieldLineSeeds({ disc: 6, toroidal: 3, poloidal: 4 });
    for (const s of seeds) {
      const l = traceLine(fieldG, s.p, s.part);
      for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1];
        const b = l.points[i];
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const f = l.fields[i];
        const cos = (d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / (Math.hypot(d[0], d[1], d[2]) * Math.hypot(f[0], f[1], f[2]));
        if (Math.hypot(d[0], d[1], d[2]) > 1e-9) expect(cos).toBeGreaterThan(Math.cos(5 * DEG));
      }
      for (let i = 1; i < l.arc.length; i++) expect(l.arc[i]).toBeGreaterThanOrEqual(l.arc[i - 1]);
    }
  });

  it('seed the three parts deterministically, in the numbers asked', () => {
    const a = fieldLineSeeds();
    const b = fieldLineSeeds();
    expect(a).toEqual(b);
    const count = (part: string) => a.filter((s) => s.part === part).length;
    expect(count('disc')).toBe(DEFAULT_SEEDS.disc);
    expect(count('toroidal')).toBe(2 * DEFAULT_SEEDS.toroidal);
    expect(count('poloidal')).toBe(DEFAULT_SEEDS.poloidal);
    // Halo seeds above and below the disc, X-field seeds in the plane inside r_p.
    for (const s of a.filter((x) => x.part === 'toroidal')) expect(Math.abs(s.p[2])).toBeGreaterThan(1);
    for (const s of a.filter((x) => x.part === 'poloidal')) {
      expect(s.p[2]).toBe(0);
      expect(Math.hypot(s.p[0], s.p[1]) * G_TO_UF23).toBeLessThan(UF23_BASE.poloidal.rp + 0.5);
    }
  });

  it('pack into segments that join each line’s consecutive points only', () => {
    const p = buildFieldLines(fieldLineSeeds({ disc: 4, toroidal: 2, poloidal: 3 }));
    expect(p.lines).toBe(4 + 4 + 3);
    expect(p.position.length).toBe(3 * p.points);
    expect(p.index.length).toBe(2 * (p.points - p.lines));
    for (let s = 0; s < p.index.length; s += 2) expect(p.index[s + 1]).toBe(p.index[s] + 1);
    const empty = packLines([]);
    expect(empty.points).toBe(0);
  });

  it('trace the whole default set quickly enough to do on first use (a few tenths of a second)', () => {
    const t = performance.now();
    const p = buildFieldLines();
    const ms = performance.now() - t;
    expect(p.lines).toBe(DEFAULT_SEEDS.disc + 2 * DEFAULT_SEEDS.toroidal + DEFAULT_SEEDS.poloidal);
    expect(p.points).toBeLessThan(60_000);
    // Generous for a loaded machine: about 0.2 s on the development machine.
    expect(ms).toBeLessThan(3000);
  });
});
