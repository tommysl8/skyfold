import { describe, expect, test } from 'vitest';
import { loadStars } from '../../test/stars';
import { discLight, DUST_ALBEDO_V, extinctionRgb, ISRF_FLUX_PER_SR, ISRF_MU_V, ISRF_RGB, scatteredShare, tauFromMag } from './light';

describe('the light of the dust', () => {
  test('J: Mathis, Mezger & Panagia (1983), a whole sky of V = −6.54', () => {
    expect(ISRF_FLUX_PER_SR).toBeCloseTo(32.9, 1);
    expect(ISRF_MU_V).toBeCloseTo(22.78, 2);
    expect(0.2126 * ISRF_RGB[0] + 0.7152 * ISRF_RGB[1] + 0.0722 * ISRF_RGB[2]).toBeCloseTo(1, 9);
    expect(ISRF_RGB[0]).toBeGreaterThan(ISRF_RGB[2]);
  });

  test('the sky Skyfold draws from the Sun is about twice as bright: its stars brighter than V = 11 alone are half of J', () => {
    const s = loadStars();
    let f = 0;
    for (let i = 0; i < s.count; i++) {
      const d = Math.hypot(s.positions[3 * i], s.positions[3 * i + 1], s.positions[3 * i + 2]);
      const v = s.absMag[i] + 5 * Math.log10(Math.max(d, 1e-6) / 10);
      if (v < 11) f += 10 ** (-0.4 * v);
    }
    const perSr = f / (4 * Math.PI);
    expect(perSr).toBeGreaterThan(14);
    expect(perSr).toBeLessThan(18);
  });

  test('single scattering: none through no dust, half of J (the albedo) through an opaque cloud', () => {
    expect(scatteredShare(0)).toBe(0);
    expect(scatteredShare(50)).toBeCloseTo(DUST_ALBEDO_V, 9);
    expect(scatteredShare(tauFromMag(1.0857362047581294))).toBeCloseTo(DUST_ALBEDO_V * (1 - Math.exp(-1)), 9);
  });

  test('reddening: blue dimmed most', () => {
    const [r, g, b] = extinctionRgb(1);
    expect(g).toBeCloseTo(10 ** -0.4, 12);
    expect(r).toBeGreaterThan(g);
    expect(b).toBeLessThan(g);
  });

  test('the thin disc’s light along a line: the exact integral against a fine sum', () => {
    const h = 300;
    const cases: [number, number, number, number][] = [
      [20, 0, 0, 1000],
      [2000, -0.9, 1500, 2500],
      [-50, 0.3, 0, 800],
      [0, -0.05, 100, 3000],
    ];
    for (const [z0, ez, ta, tb] of cases) {
      let sum = 0;
      const n = 20000;
      const dt = (tb - ta) / n;
      for (let i = 0; i < n; i++) sum += Math.exp(-Math.abs(z0 + ez * (ta + (i + 0.5) * dt) + 20.8) / h) * dt;
      expect(discLight(z0, ez, ta, tb, h, -20.8)).toBeCloseTo(sum, 3);
    }
    expect(discLight(0, 0.5, 10, 10, h)).toBe(0);
  });
});
