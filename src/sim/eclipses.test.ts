import { describe, expect, it } from 'vitest';
import { Quaternion } from 'three';
import { Observer, ObserverVector } from 'astronomy-engine';
import { astroTimeAt } from '../lib/time';
import { earthShadow, greatestSolarEclipse, lunarContacts, moonShadow } from './eclipses';
import { bodyOrientation } from './bodies';
import { eqjToWorld } from './frames';

/**
 * NASA's predictions (F. Espenak, NASA GSFC: eclipse.gsfc.nasa.gov, the SEpath tables and the LEplot of
 * 2025 Sep 07; quoted with citation). Central-line points are degrees and minutes; west longitudes negative.
 */
const dm = (deg: number, min: number, sign = 1) => sign * (deg + min / 60);
const N = 1;
const W = -1;

const ECLIPSE_2017 = {
  greatest: Date.UTC(2017, 7, 21, 18, 25, 31.8),
  at: [dm(36, 58.0, N), dm(87, 40.3, W)],
  durationS: 160.1,
  widthKm: 114.7,
  line: [
    ['17:20', dm(44, 44.0, N), dm(121, 38.0, W)],
    ['17:40', dm(43, 13.7, N), dm(108, 28.5, W)],
    ['18:00', dm(40, 50.3, N), dm(98, 18.3, W)],
    ['18:20', dm(37, 52.2, N), dm(89, 49.6, W)],
    ['18:40', dm(34, 26.9, N), dm(82, 15.9, W)],
  ] as const,
};
const ECLIPSE_2024 = {
  greatest: Date.UTC(2024, 3, 8, 18, 17, 18.3),
  at: [dm(25, 17.2, N), dm(104, 8.3, W)],
  durationS: 268.1,
  widthKm: 197.5,
  line: [
    ['17:50', dm(17, 24.5, N), dm(111, 25.8, W)],
    ['18:10', dm(23, 11.9, N), dm(106, 6.8, W)],
    ['18:30', dm(28, 53.6, N), dm(100, 30.7, W)],
    ['19:00', dm(37, 19.7, N), dm(89, 46.6, W)],
    ['19:20', dm(42, 47.8, N), dm(78, 59.2, W)],
  ] as const,
};

const utc = (dayMs: number, hhmm: string) => {
  const d = new Date(dayMs);
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);
};

/** Great-circle distance between two lat/lon points, km. */
function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

describe('total solar eclipses from the app’s Sun, Moon and Earth, against NASA', () => {
  for (const [name, e] of [
    ['2017-08-21 (USA)', ECLIPSE_2017],
    ['2024-04-08 (Mexico, Texas, the north-east)', ECLIPSE_2024],
  ] as const) {
    it(`${name}: greatest eclipse within 10 s, within 5 km of NASA's place`, () => {
      const g = greatestSolarEclipse(astroTimeAt(e.greatest + 20 * 60_000), 2);
      const ms = (g.ut + 10957.5) * 86_400_000;
      expect(Math.abs(ms - e.greatest) / 1000).toBeLessThan(10);
      const s = moonShadow(g);
      expect(s.central).toBe(true);
      expect(kmBetween(s.latDeg, s.lonDeg, e.at[0], e.at[1])).toBeLessThan(5);
      // A total eclipse: the umbra reaches the ground, about as wide as NASA's path (whose width is along the
      // ground, so up to a few tens of percent wider than the cone's cross-section where the shadow falls slanting).
      expect(s.umbraKm).toBeGreaterThan(0);
      expect(2 * s.umbraKm).toBeGreaterThan(0.6 * e.widthKm);
      expect(2 * s.umbraKm).toBeLessThan(1.05 * e.widthKm);
    });

    it(`${name}: the umbra's track follows NASA's central line`, () => {
      for (const [hhmm, lat, lon] of e.line) {
        const s = moonShadow(astroTimeAt(utc(e.greatest, hhmm)));
        expect(s.central).toBe(true);
        // NASA's central line is for the same instant; the Moon's shadow moves 0.5–5 km a second over the ground.
        expect(kmBetween(s.latDeg, s.lonDeg, lat, lon), `${hhmm} UT`).toBeLessThan(10);
      }
    });
  }

  it('misses Earth on an ordinary new Moon (2026-10-10, no eclipse)', () => {
    const s = moonShadow(astroTimeAt(Date.UTC(2026, 9, 10, 15, 50)));
    expect(s.central).toBe(false);
  });
});

describe('the total lunar eclipse of 2025 September 7, against NASA (Danjon’s rule)', () => {
  // NASA/GSFC (Espenak), LEplot 2025 Sep 07: U1 16:27:02, U2 17:30:41, greatest 18:11:43, U3 18:52:47, U4 19:56:26,
  // P1 15:28:21, P4 20:55:00 UT; umbral magnitude 1.3619. (Computed in 2009 with ΔT = 75 s; ΔT turned out about 69 s,
  // which moves these UT times by about 6 s.)
  const c = lunarContacts(astroTimeAt(Date.UTC(2025, 8, 7, 18, 0)));
  const at = (t: { ut: number } | null) => (t ? (t.ut + 10957.5) * 86_400_000 : NaN);
  const near = (t: { ut: number } | null, h: number, m: number, s: number) => Math.abs(at(t) - Date.UTC(2025, 8, 7, h, m, s)) / 1000;

  it('has every contact within 15 seconds', () => {
    expect(near(c.p1, 15, 28, 21)).toBeLessThan(15);
    expect(near(c.u1, 16, 27, 2)).toBeLessThan(15);
    expect(near(c.u2, 17, 30, 41)).toBeLessThan(15);
    expect(near(c.greatest, 18, 11, 43)).toBeLessThan(15);
    expect(near(c.u3, 18, 52, 47)).toBeLessThan(15);
    expect(near(c.u4, 19, 56, 26)).toBeLessThan(15);
    expect(near(c.p4, 20, 55, 0)).toBeLessThan(15);
  });

  it('has the umbral magnitude NASA gives (1.362)', () => {
    expect(c.umbralMagnitude).toBeCloseTo(1.362, 2);
  });

  it('puts the Moon wholly in the umbra at greatest eclipse, and outside the penumbra a day later', () => {
    const g = earthShadow(c.greatest);
    expect(g.sepRad + g.moonRad).toBeLessThan(g.umbraRad);
    const later = earthShadow(c.greatest.AddDays(1));
    expect(later.sepRad - later.moonRad).toBeGreaterThan(later.penumbraRad);
  });
});

describe('Earth’s drawn orientation (the map under the shadows)', () => {
  it('puts Greenwich where astronomy-engine’s sidereal time does, 1700–2200', () => {
    for (const year of [1700, 1979, 2000, 2024, 2026, 2100, 2199]) {
      const t = astroTimeAt(Date.UTC(year, 5, 1, 7, 30));
      for (const lon of [0, 90, -120]) {
        const v = ObserverVector(t, new Observer(0, lon, 0), false);
        const w = eqjToWorld(v.x, v.y, v.z).applyQuaternion(bodyOrientation('earth', t, new Quaternion()).invert());
        const got = (Math.atan2(-w.z, w.x) * 180) / Math.PI;
        expect(Math.abs(((got - lon + 540) % 360) - 180), `${year}, ${lon}°`).toBeLessThan(1e-6);
      }
    }
  });
});
