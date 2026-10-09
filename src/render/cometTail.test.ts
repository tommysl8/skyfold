import { describe, expect, it } from 'vitest';
import { AU_KM, GM_SUN_KM3_S2 } from '../physics/constants';
import { propagateTwoBody } from '../physics/kepler';
import {
  cometActivity,
  dustAgeS,
  dustOffset,
  heliocentricMagnitude,
  ionTailDirection,
  ionTailKm,
  ION_TAIL_RANGE_KM,
  keplerPosition,
  SOLAR_WIND_KM_S,
  tailBrightness,
  type V3,
} from './cometTail';

const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const norm = (a: V3) => Math.hypot(a.x, a.y, a.z);
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

describe('comet activity', () => {
  it('switches on inside 5 au and is full inside 3 au', () => {
    expect(cometActivity(1)).toBe(1);
    expect(cometActivity(3)).toBe(1);
    expect(cometActivity(4)).toBeCloseTo(0.5, 12);
    expect(cometActivity(5)).toBe(0);
    expect(cometActivity(30)).toBe(0);
    expect(cometActivity(0)).toBe(0);
  });

  // JPL SBDB magnitude laws (M1, K1): Halley 5.5, 8.0; Hale–Bopp 4.8, 4.0; Encke 15.7, 4.5; 2I/Borisov 13.8, 4.5.
  it('reads each comet’s own magnitude law', () => {
    expect(heliocentricMagnitude(5.5, 8, 1)).toBe(5.5);
    expect(heliocentricMagnitude(5.5, 8, 0.587)).toBeCloseTo(5.5 + 8 * Math.log10(0.587), 12);
    // No law in the data: JPL's usual defaults, as the layer draws them.
    expect(heliocentricMagnitude(NaN, NaN, 2)).toBeCloseTo(15 + 10 * Math.log10(2), 12);
  });

  it('draws the tails stronger nearer the Sun, and the great comets strongest', () => {
    for (const [m1, k1] of [
      [5.5, 8],
      [4.8, 4],
      [15.7, 4.5],
    ])
      for (let r = 0.3; r < 6; r += 0.1) expect(tailBrightness(r, m1, k1)).toBeGreaterThanOrEqual(tailBrightness(r + 0.1, m1, k1));
    // Halley at its 1986 perihelion (0.587 au) and Hale–Bopp at its 1997 one (0.914 au): nearly full strength.
    expect(tailBrightness(0.587, 5.5, 8)).toBeGreaterThan(0.9);
    expect(tailBrightness(0.914, 4.8, 4)).toBeGreaterThan(0.8);
    // Encke and Borisov: faint, but there.
    expect(tailBrightness(0.34, 15.7, 4.5)).toBeGreaterThan(0.1);
    expect(tailBrightness(0.34, 15.7, 4.5)).toBeLessThan(0.4);
    expect(tailBrightness(2.01, 13.8, 4.5)).toBeGreaterThan(0.05);
    expect(tailBrightness(2.01, 13.8, 4.5)).toBeLessThan(0.3);
    // Gone far out, whatever the comet.
    expect(tailBrightness(5.5, 4.8, 4)).toBe(0);
    expect(tailBrightness(4.5, 5.5, 8)).toBeLessThan(0.2 * tailBrightness(3, 5.5, 8));
  });

  it('lengthens the tails as the comet brightens, within what is seen', () => {
    expect(ionTailKm(0.587, 5.5, 8)).toBeGreaterThan(ionTailKm(1.5, 5.5, 8));
    expect(ionTailKm(1.5, 5.5, 8)).toBeGreaterThan(ionTailKm(1.5, 15.7, 4.5));
    expect(dustAgeS(0.587, 5.5, 8)).toBeGreaterThan(dustAgeS(2, 5.5, 8));
    // Halley 1986: tens of millions of km.
    expect(ionTailKm(0.587, 5.5, 8)).toBeGreaterThan(5e7);
    expect(ionTailKm(0.587, 5.5, 8)).toBeLessThan(1.5e8);
    expect(ionTailKm(0.34, 15.7, 4.5)).toBe(ION_TAIL_RANGE_KM[0]);
    expect(ionTailKm(0.05, 0, 15)).toBe(ION_TAIL_RANGE_KM[1]);
  });
});

describe('two-body motion', () => {
  it('matches the app’s propagator on ellipses and hyperbolas', () => {
    const r = { x: 0.59 * AU_KM, y: 0.1 * AU_KM, z: 0.02 * AU_KM };
    for (const v of [v3(-3, 54, 5), v3(10, 70, -3), v3(0, 30, 0)]) {
      for (const dt of [-30 * 86_400, -86_400, 3600, 20 * 86_400]) {
        const want = propagateTwoBody(r, v, dt, GM_SUN_KM3_S2).r;
        const got = keplerPosition(r, v, dt, GM_SUN_KM3_S2, v3());
        expect(Math.hypot(got.x - want.x, got.y - want.y, got.z - want.z) / norm(want)).toBeLessThan(1e-9);
      }
    }
  });

  it('moves in a straight line with no gravity', () => {
    const p = keplerPosition(v3(1e8, 0, 0), v3(0, 10, 0), 1000, 0, v3());
    expect(p).toEqual({ x: 1e8, y: 10_000, z: 0 });
  });
});

describe('the tails', () => {
  // Halley near its 2061 perihelion: 0.59 au, about 55 km/s, retrograde.
  const r = v3(0.59 * AU_KM, 0, 0);
  const v = v3(0, -54.5, 8);

  it('points the ion tail down the solar wind, a few degrees off the anti-solar direction', () => {
    const d = ionTailDirection(r, v, v3());
    const cos = dot(d, r) / norm(r);
    const deg = (Math.acos(cos) * 180) / Math.PI;
    expect(deg).toBeGreaterThan(1);
    // The aberration: atan(v⊥ / v_sw).
    expect(deg).toBeCloseTo((Math.atan(Math.hypot(v.y, v.z) / SOLAR_WIND_KM_S) * 180) / Math.PI, 6);
    // Swept back, away from the direction of motion.
    expect(dot(d, v)).toBeLessThan(0);
  });

  it('pushes fresh dust straight out from the Sun by ½βgt²', () => {
    const t = 3600;
    const beta = 0.5;
    const g = GM_SUN_KM3_S2 / norm(r) ** 2;
    const d = dustOffset(r, v, beta, t, v3());
    expect(d.x / (0.5 * beta * g * t * t)).toBeCloseTo(1, 2);
    expect(Math.hypot(d.y, d.z) / norm(d)).toBeLessThan(0.05);
    // No radiation pressure: the grain stays with the nucleus.
    expect(norm(dustOffset(r, v, 0, 10 * 86_400, v3()))).toBeLessThan(1);
  });

  it('points the ion tail away from the Sun', () => {
    const d = ionTailDirection(r, v, v3());
    expect(dot(d, r) / norm(r)).toBeGreaterThan(0.99);
    // At rest, exactly anti-sunward.
    const still = ionTailDirection(r, v3(), v3());
    expect(dot(still, r) / norm(r)).toBeCloseTo(1, 12);
  });

  it('keeps the dust tail in the orbit’s plane, behind the comet', () => {
    const h = { x: r.y * v.z - r.z * v.y, y: r.z * v.x - r.x * v.z, z: r.x * v.y - r.y * v.x };
    for (const beta of [0.06, 0.35, 1])
      for (const days of [2, 10, 30]) {
        const d = dustOffset(r, v, beta, days * 86_400, v3());
        // Out of the plane by under a thousandth of its length: the grains share the comet's plane.
        expect(Math.abs(dot(d, h)) / (norm(h) * norm(d))).toBeLessThan(1e-3);
        // Behind the comet along its motion, and away from the Sun.
        expect(dot(d, v)).toBeLessThan(0);
        expect(dot(d, r)).toBeGreaterThan(0);
      }
  });

  it('bends older dust back along the orbit, finer dust further out', () => {
    const old = dustOffset(r, v, 0.5, 20 * 86_400, v3());
    expect(dot(old, v)).toBeLessThan(0);
    expect(dot(old, r)).toBeGreaterThan(0);
    const fine = dustOffset(r, v, 1, 20 * 86_400, v3());
    expect(norm(fine)).toBeGreaterThan(norm(old));
    // Tens of millions of km: the length of real dust tails near 0.6 au.
    expect(norm(fine)).toBeGreaterThan(1e7);
    expect(norm(fine)).toBeLessThan(2e8);
  });
});
