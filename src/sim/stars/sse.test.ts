import { describe, expect, it } from 'vitest';
import {
  aH,
  evolve,
  growth,
  lBgb,
  lFromMc,
  lHeI,
  lZams,
  mcBagb,
  mcBgb,
  mcFromL,
  mcl,
  M_FGB,
  M_HEF,
  msState,
  rAgb,
  rGb,
  rWd,
  rZams,
  SSE_CHECK,
  tBgb,
  tHe,
  timeAtL,
  tMs,
  windMsunPerMyr,
} from './sse';

describe('Hurley, Pols & Tout (2000) at Z = 0.02: the coefficients and worked values the paper quotes', () => {
  it('has the GB radius of eq. (48), R ≈ 1.1 M^−0.3 (L^0.4 + 0.383 L^0.76), and the AGB radius of a 1 M☉ star, ≈ 0.95 (L^0.4 + 0.383 L^0.74)', () => {
    expect(SSE_CHECK.b1).toBeCloseTo(0.4, 2);
    expect(SSE_CHECK.b2).toBeCloseTo(0.383, 3);
    expect(SSE_CHECK.b3).toBeCloseTo(0.76, 2);
    for (const l of [10, 100, 1000]) {
      expect(rGb(1, l) / (1.1 * (l ** 0.4 + 0.383 * l ** 0.76))).toBeGreaterThan(0.85);
      expect(rGb(1, l) / (1.1 * (l ** 0.4 + 0.383 * l ** 0.76))).toBeLessThan(1.1);
    }
    // The AGB's coefficient for 1 M☉ (the paper's example has the exponent 0.74; b3 itself is 0.755 at Z = 0.02).
    expect(rAgb(1, 1) / (1 + SSE_CHECK.b2)).toBeCloseTo(0.95, 2);
    // The Appendix's clamps at ζ = 0.
    expect(SSE_CHECK.a17).toBeCloseTo(1.4, 3);
    expect(SSE_CHECK.a33).toBe(1.4);
    expect(SSE_CHECK.b17).toBeCloseTo(0.612, 3);
  });

  it('has the critical masses of eqs. (1)–(3) and Table 1’s rate constants and timescales', () => {
    expect(M_HEF).toBe(1.995);
    expect(M_FGB).toBeCloseTo(13.03, 2);
    expect(Math.log10(aH(1))).toBeCloseTo(-4.8, 6);
    expect(Math.log10(aH(2))).toBeCloseTo(-4.1, 1);
    expect(Math.log10(aH(5))).toBeCloseTo(-3.4, 1);
    // t_BGB ≈ 10⁴, 10³, 10² Myr for 1, 2, 5 M☉; (t_HeI − t_BGB)/t_BGB ≈ 6.4 × 10⁻², 2.0 × 10⁻², 2.4 × 10⁻³.
    const gb = (m: number) => {
      const g = growth(mcl(m), aH(m), tBgb(m), lBgb(m));
      return (timeAtL(g, lHeI(m)) - tBgb(m)) / tBgb(m);
    };
    expect(Math.log10(tBgb(1))).toBeCloseTo(4, 0);
    expect(Math.log10(tBgb(2))).toBeCloseTo(3, 0);
    expect(Math.log10(tBgb(5))).toBeCloseTo(2, 0);
    expect(gb(1)).toBeGreaterThan(0.04);
    expect(gb(1)).toBeLessThan(0.09);
    expect(gb(2)).toBeGreaterThan(0.01);
    expect(gb(2)).toBeLessThan(0.03);
  });

  it('has the ZAMS of Tout et al. (1996): a 1 M☉ star 0.70 L☉ and 0.89 R☉; ZAMS radii and luminosities rise with mass', () => {
    expect(lZams(1)).toBeCloseTo(0.698, 3);
    expect(rZams(1)).toBeCloseTo(0.888, 3);
    for (const m of [0.3, 0.6, 1.5, 4, 10, 30]) {
      expect(lZams(m * 1.1)).toBeGreaterThan(lZams(m));
      expect(rZams(m * 1.1)).toBeGreaterThan(rZams(m));
    }
  });

  it('starts the MS at the ZAMS and ends it at the TMS values, through the hook above M_hook', () => {
    for (const m of [0.8, 1, 1.5, 3, 10]) {
      const { tMs: tm } = tMs(m);
      expect(msState(m, 0).l).toBeCloseTo(lZams(m), 8);
      expect(msState(m, 0).r).toBeCloseTo(rZams(m), 8);
      expect(msState(m, tm).l / msState(m, 0).l).toBeGreaterThan(1.5);
    }
  });

  it('inverts its core mass–luminosity relation, and its BAGB core mass is eq. (66) (≈ 0.098 M^1.35 at the BGB for large M)', () => {
    for (const m of [1, 3, 8]) {
      const r = mcl(m);
      for (const l of [100, 1e3, 1e4]) expect(lFromMc(r, mcFromL(r, l))).toBeCloseTo(l, 6);
    }
    expect(mcBagb(1)).toBeCloseTo((4.36e-4 + 6.84e-2) ** 0.25, 2);
    expect(mcBgb(10) / (0.098 * 10 ** 1.35)).toBeCloseTo(1, 1);
    expect(tHe(3, mcBgb(3))).toBeGreaterThan(0.1 * tBgb(3));
  });

  it('loses mass by Reimers’ law on the GB (η = 0.5: 2 × 10⁻¹³ LR/M per year)', () => {
    expect(windMsunPerMyr(3, 1, 1000, 100, 2)).toBeCloseTo(2e-13 * 1000 * 100 * 1e6, 10);
    expect(windMsunPerMyr(1, 1, 1, 1, 2)).toBe(0);
  });

  it('ends low and intermediate masses as white dwarfs of radius eq. (91), and supernovae above about 8 M☉', () => {
    for (const m of [1, 2, 4]) {
      const life = evolve(m);
      expect(life.end).toBe('white-dwarf');
      const wd = life.points[life.points.length - 1];
      expect(wd.r).toBeCloseTo(rWd(wd.m), 8);
      expect(wd.k).toBe(11);
    }
    expect(evolve(12).end).toBe('supernova');
  });
});
