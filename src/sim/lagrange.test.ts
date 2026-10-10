import { describe, expect, it } from 'vitest';
import { L1_FRACTION, L2_FRACTION, lagrangeFraction } from './lagrange';

describe('the Sun–Earth L1 and L2 points', () => {
  it('lie about 1.50 and 1.51 million km from the Earth–Moon barycentre (1 au)', () => {
    const au = 149_597_870.7;
    expect(L1_FRACTION * au).toBeGreaterThan(1.49e6);
    expect(L1_FRACTION * au).toBeLessThan(1.5e6);
    expect(L2_FRACTION * au).toBeGreaterThan(1.5e6);
    expect(L2_FRACTION * au).toBeLessThan(1.515e6);
    // L1 is nearer than L2, both near the Hill radius (μ/3)^⅓.
    expect(L1_FRACTION).toBeLessThan(L2_FRACTION);
  });

  it('balance gravity and the orbit there (the defining equations)', () => {
    const mu = 0.001; // a heavier secondary, so the terms are well away from round-off
    const x1 = lagrangeFraction(-1, mu);
    const x2 = lagrangeFraction(1, mu);
    expect((1 - mu) / (1 - x1) ** 2 - mu / x1 ** 2).toBeCloseTo(1 - mu - x1, 12);
    expect((1 - mu) / (1 + x2) ** 2 + mu / x2 ** 2).toBeCloseTo(1 - mu + x2, 12);
    // Murray & Dermott's series: x ≈ h − h²/3 (L1) and h + h²/3 (L2), h = (μ/3)^⅓.
    const h = Math.cbrt(mu / 3);
    expect(x1).toBeCloseTo(h - (h * h) / 3, 3);
    expect(x2).toBeCloseTo(h + (h * h) / 3, 3);
  });
});
