import { describe, expect, it } from 'vitest';
import { loadNames, loadStars } from '../../test/stars';
import { starsByNumber } from './names';
import { positionSeenFromSun } from './motion';
import type { Vec3 } from './frames';

// The Big Dipper by HIP number: Dubhe, Merak, Phecda, Megrez, Alioth, Mizar, Alkaid.
const DIPPER = { dubhe: 54061, merak: 53910, phecda: 58001, megrez: 59774, alioth: 62956, mizar: 65378, alkaid: 67301 };

describe('the constellations drift (the journey’s premise: motion.ts)', () => {
  const stars = loadStars();
  const names = loadNames();
  const idx = Object.fromEntries(Object.entries(DIPPER).map(([k, hip]) => [k, starsByNumber(names, 'hip', hip)[0]])) as Record<keyof typeof DIPPER, number>;
  const dir = (i: number, jy: number): Vec3 => {
    const p = positionSeenFromSun(stars, i, jy);
    const r = Math.hypot(...p);
    return [p[0] / r, p[1] / r, p[2] / r];
  };
  const sepDeg = (a: number, b: number, jy: number) => {
    const u = dir(a, jy);
    const v = dir(b, jy);
    return (Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])) * 180) / Math.PI;
  };

  it('finds the seven stars', () => {
    for (const i of Object.values(idx)) expect(i).toBeGreaterThanOrEqual(0);
  });

  it('keeps the moving group together and pulls Dubhe and Alkaid away over ±100,000 years', () => {
    // The five members of the Ursa Major moving group share a motion: their separations hardly change.
    const group = [idx.merak, idx.phecda, idx.megrez, idx.alioth, idx.mizar];
    for (let a = 0; a < group.length; a++)
      for (let b = a + 1; b < group.length; b++) {
        const now = sepDeg(group[a], group[b], 2000);
        expect(Math.abs(sepDeg(group[a], group[b], 102_000) - now)).toBeLessThan(0.25 * now + 1);
      }
    // Dubhe and Alkaid move against the group: the dipper's ends change by more than a degree either way.
    const ends = (jy: number) => sepDeg(idx.dubhe, idx.alkaid, jy);
    expect(Math.abs(ends(102_000) - ends(2000))).toBeGreaterThan(1);
    expect(Math.abs(ends(-98_000) - ends(2000))).toBeGreaterThan(1);
    // Over a lifetime, nothing to see: under a hundredth of a degree.
    expect(Math.abs(ends(2080) - ends(2000))).toBeLessThan(0.01);
  });
});
