import { describe, expect, it } from 'vitest';
import { incomingDirection, raDecOf, vInfinityKmS, visitorFact, VISITORS } from './interstellar';

/** Angle between two directions on the sky, degrees. */
function sep(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const d = Math.PI / 180;
  const c = Math.sin(dec1 * d) * Math.sin(dec2 * d) + Math.cos(dec1 * d) * Math.cos(dec2 * d) * Math.cos((ra1 - ra2) * d);
  return Math.acos(Math.min(1, c)) / d;
}

describe('the visitors from other stars', () => {
  it('came in at the speeds published for them', () => {
    // ʻOumuamua 26.3 km/s (Mamajek 2017, RNAAS 1, 21); Borisov 32.3 (Jewitt & Luu 2019); 3I/ATLAS 58 (NASA).
    expect(vInfinityKmS(VISITORS.oumuamua)).toBeCloseTo(26.3, 0);
    expect(vInfinityKmS(VISITORS.borisov)).toBeCloseTo(32.2, 0);
    expect(vInfinityKmS(VISITORS['atlas-3i'])).toBeGreaterThan(57);
    expect(vInfinityKmS(VISITORS['atlas-3i'])).toBeLessThan(59);
  });

  it('came from the directions published for them', () => {
    // ʻOumuamua's radiant: RA 279.8°, Dec +33.9°, 6° from Vega (Mamajek 2017).
    const o = raDecOf(incomingDirection(VISITORS.oumuamua));
    expect(sep(o.raDeg, o.decDeg, 279.8, 33.9)).toBeLessThan(1);
    expect(sep(o.raDeg, o.decDeg, 279.23, 38.78)).toBeLessThan(7);
    // Borisov's: RA 2h 11m 10s, Dec +59° 26′, in Cassiopeia near Perseus (de León et al. 2020, MNRAS 495, 2053, arXiv:2005.00786).
    const b = raDecOf(incomingDirection(VISITORS.borisov));
    expect(sep(b.raDeg, b.decDeg, 32.8, 59.4)).toBeLessThan(1);
    // 3I/ATLAS from Sagittarius, near the direction of the Galaxy's centre (RA 266°, Dec −29°) but not at it.
    const a = raDecOf(incomingDirection(VISITORS['atlas-3i']));
    expect(a.raDeg).toBeGreaterThan(270);
    expect(a.raDeg).toBeLessThan(305);
    expect(a.decDeg).toBeGreaterThan(-30);
    expect(a.decDeg).toBeLessThan(-10);
  });

  it('says so on the card', () => {
    expect(visitorFact(VISITORS.oumuamua)).toMatch(/^It came from the direction of RA 18h 38m, Dec \+34° \(in Lyra, near Vega\), at 26\.\d km\/s/);
  });
});
