import { describe, expect, it } from 'vitest';
import {
  EHT_M87,
  EHT_SGRA,
  ehtFieldAngleFromRadial,
  HOLE_FIELDS,
  holeFieldLines,
  horizonKerr,
  modelFieldAngleFromRadial,
  omegaField,
  omegaHole,
  paraboloidLine,
  paraboloidPsi,
  paraboloidTheta,
  PSI_HORIZON,
} from './holeField';
import { BLACK_HOLES } from './records';

describe('the field threading a black hole', () => {
  it('Ω_H = a/2r₊: 0.35 c³/GM at a = 0.94, and zero without spin', () => {
    expect(horizonKerr(0)).toBe(2);
    expect(horizonKerr(1)).toBe(1);
    expect(omegaHole(0)).toBe(0);
    expect(omegaHole(0.94)).toBeCloseTo(0.3504, 4);
    expect(omegaHole(1)).toBe(0.5);
    expect(omegaField(0.94) / omegaHole(0.94)).toBe(0.5);
  });

  it('the paraboloid: ψ = 0 on the axis, 4 ln 2 at the horizon’s equator, the jet’s lines threading the horizon', () => {
    expect(paraboloidPsi(2, 0)).toBeCloseTo(0, 12);
    expect(paraboloidPsi(50, 0)).toBeCloseTo(0, 12);
    expect(paraboloidPsi(2, Math.PI / 2)).toBeCloseTo(PSI_HORIZON, 12);
    // Every line with ψ < 4 ln 2 meets the horizon; far out it is the paraboloid r(1 − cos θ) ≈ ψ.
    const th = paraboloidTheta(2, 0.5 * PSI_HORIZON);
    expect(paraboloidPsi(2, th)).toBeCloseTo(0.5 * PSI_HORIZON, 9);
    const far = paraboloidTheta(1e4, 1);
    expect(1e4 * (1 - Math.cos(far))).toBeCloseTo(1, 2);
    // A disc line starts on the equator at its radius.
    expect(paraboloidTheta(9, 9 - 2 + PSI_HORIZON)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('wound at the Blandford–Znajek rate: the jet’s lines turn back Ω_H/2 radians per unit of poloidal length', () => {
    const a = 0.94;
    const f = holeFieldLines(a, 60, 1);
    const line = paraboloidLine(0.55 * PSI_HORIZON, 2.0001, 60);
    // The third horizon line's first (north) copy: segments 2·96 … in the set (two lines of 96 before it, one azimuth).
    const n = line.varpi.length - 1;
    const start = 2 * 2 * n;
    const p = f.positions;
    const phiAt = (seg: number) => Math.atan2(p[6 * seg + 1], p[6 * seg]);
    const i0 = start + 20;
    const i1 = start + 60;
    let dPhi = phiAt(i1) - phiAt(i0);
    dPhi = ((((dPhi + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const ds = line.s[60] - line.s[20];
    expect(dPhi / ds).toBeCloseTo(-omegaField(a), 4);
    expect(dPhi / ds / omegaHole(a)).toBeCloseTo(-0.5, 4);
  });

  it('north out of the hole, south into it; every segment knows its other end', () => {
    const f = holeFieldLines(0.5, 40, 4);
    for (let i = 0; i < f.pol.length; i++) {
      const z = f.positions[3 * i + 2];
      if (Math.abs(z) > 1) expect(Math.sign(z)).toBe(f.pol[i]);
    }
    for (let s = 0; s < f.arc.length / 2; s++)
      for (let k = 0; k < 3; k++) {
        expect(f.other[6 * s + k]).toBe(f.positions[6 * s + 3 + k]);
        expect(f.other[6 * s + 3 + k]).toBe(f.positions[6 * s + k]);
      }
  });

  it('the pitch against the EHT: the drawn field’s angle from radial on the ring falls in what ∠β₂ implies', () => {
    const m87 = ehtFieldAngleFromRadial(EHT_M87);
    expect(m87[0]).toBeCloseTo(8.5, 9);
    expect(m87[1]).toBeCloseTo(25.5, 9);
    const sgra = ehtFieldAngleFromRadial(EHT_SGRA);
    expect(sgra[0]).toBeCloseTo(6, 9);
    expect(sgra[1]).toBeCloseTo(47.5, 9);
    const mM87 = modelFieldAngleFromRadial(HOLE_FIELDS['m87-star'].spin);
    const mSgra = modelFieldAngleFromRadial(HOLE_FIELDS['sgr-a-star'].spin);
    expect(mM87).toBeCloseTo(21.7, 0);
    expect(mSgra).toBeCloseTo(46.2, 0);
    expect(mM87).toBeGreaterThan(m87[0]);
    expect(mM87).toBeLessThan(m87[1]);
    expect(mSgra).toBeGreaterThan(sgra[0]);
    expect(mSgra).toBeLessThan(sgra[1]);
  });

  it('drawn for the holes with a disc or a jet, with their records’ spin estimates', () => {
    for (const [id, spec] of Object.entries(HOLE_FIELDS)) {
      const hole = BLACK_HOLES.holes.find((h) => h.id === id);
      expect(hole, id).toBeDefined();
      if (spec.axis === 'disc') {
        expect(hole!.disk, id).toBeDefined();
        expect(spec.spin, id).toBe(hole!.spin.value);
      }
    }
    for (const h of BLACK_HOLES.holes) if (h.disk) expect(HOLE_FIELDS[h.id], h.id).toBeDefined();
  });
});
