import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '../test/files';
import { parseTracks, type TracksIndex } from './tracks';
import {
  CROSSINGS,
  eclipticDir,
  heliopauseAu,
  HELIOPAUSE,
  heliosphereFade,
  HILLS_OUTER_AU,
  NORTH,
  NOSE,
  noseFrameDir,
  OORT_INNER_AU,
  OORT_OUTER_AU,
  oortCloudPoints,
  oortFade,
  oortFractionBeyond,
  PORT,
  terminationShockAu,
  type V3,
} from './heliosphere';

const AU_KM = 149_597_870.7;
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const tracks = parseTracks(readJson<TracksIndex>('public/data/tracks.json'), readBytes('public/data/tracks.bin'));
/** TDB days since J2000 of noon UTC on a date. */
const days = (iso: string) => (Date.parse(`${iso}T12:00:00Z`) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
/** A Voyager from the Sun on a date, au (ecliptic). */
function voyager(id: string, iso: string): V3 {
  // The barycentre's 0.01 au from the Sun is left out: a ten-thousandth of these distances.
  const p = tracks.evalHelio(id, days(iso), () => [0, 0, 0]).pos;
  return { x: p[0] / AU_KM, y: p[1] / AU_KM, z: p[2] / AU_KM };
}
const norm = (a: V3) => Math.hypot(a.x, a.y, a.z);
const unit = (a: V3) => ({ x: a.x / norm(a), y: a.y / norm(a), z: a.z / norm(a) });

describe('the interstellar wind', () => {
  it('comes from ecliptic longitude 255.7°, latitude +5.1°, with north and port square to it', () => {
    expect(Math.atan2(NOSE.y, NOSE.x) * (180 / Math.PI) + 360).toBeCloseTo(255.7, 9);
    expect(Math.asin(NOSE.z) * (180 / Math.PI)).toBeCloseTo(5.1, 9);
    expect(dot(NOSE, NORTH)).toBeCloseTo(0, 12);
    expect(dot(NOSE, PORT)).toBeCloseTo(0, 12);
    expect(dot(NORTH, PORT)).toBeCloseTo(0, 12);
    expect(NORTH.z).toBeGreaterThan(0.99);
  });
});

describe('the Voyagers’ crossings', () => {
  it('are where the tracks put the craft on those days', () => {
    for (const c of CROSSINGS) {
      const p = voyager(c.craft, c.date);
      expect(norm(p)).toBeCloseTo(c.au, 1);
      expect(Math.acos(Math.min(1, dot(unit(p), eclipticDir(c.lonDeg, c.latDeg)))) * (180 / Math.PI)).toBeLessThan(0.05);
    }
  });

  it('lie on the heliopause, which passes exactly through both', () => {
    for (const c of CROSSINGS.filter((c) => c.boundary === 'heliopause')) expect(heliopauseAu(eclipticDir(c.lonDeg, c.latDeg))).toBeCloseTo(c.au, 9);
    // The nose at about 112 au, the south pushed in by a few per cent.
    expect(HELIOPAUSE.L0).toBeGreaterThan(105);
    expect(HELIOPAUSE.L0).toBeLessThan(120);
    expect(HELIOPAUSE.A).toBeGreaterThan(0);
    expect(HELIOPAUSE.A).toBeLessThan(0.15);
  });

  it('lie within a few au of the termination shock’s sphere (McComas et al. 2019)', () => {
    for (const c of CROSSINGS.filter((c) => c.boundary === 'termination-shock')) expect(Math.abs(terminationShockAu(eclipticDir(c.lonDeg, c.latDeg)) - c.au)).toBeLessThan(2.5);
  });
});

describe('the shapes', () => {
  it('put the shock 73–161 au from the Sun, always inside the heliopause', () => {
    let lo = Infinity;
    let hi = 0;
    for (let t = 0; t <= 180; t += 5)
      for (let p = 0; p < 360; p += 10) {
        const d = noseFrameDir(t, p);
        const ts = terminationShockAu(d);
        lo = Math.min(lo, ts);
        hi = Math.max(hi, ts);
        if (t <= 160) expect(heliopauseAu(d)).toBeGreaterThan(ts + 10);
      }
    expect(lo).toBeGreaterThan(72);
    expect(lo).toBeLessThan(75);
    expect(hi).toBeGreaterThan(159);
    expect(hi).toBeLessThan(162);
  });

  it('widen the heliopause down the tail to a cylinder of twice the nose distance', () => {
    const flank = noseFrameDir(90, 90);
    expect(heliopauseAu(flank) / HELIOPAUSE.L0).toBeCloseTo(Math.SQRT2 * (1 + HELIOPAUSE.A * flank.z), 9);
    const d = noseFrameDir(179, 90);
    const r = heliopauseAu(d);
    expect((r * Math.sin((179 * Math.PI) / 180)) / HELIOPAUSE.L0).toBeCloseTo(2 * (1 + HELIOPAUSE.A * d.z), 2);
  });

  it('leave both Voyagers outside the heliopause today', () => {
    for (const id of ['voyager1', 'voyager2']) {
      const p = voyager(id, '2026-10-09');
      expect(norm(p)).toBeGreaterThan(heliopauseAu(unit(p)) + 20);
    }
  });
});

describe('the Oort cloud model', () => {
  it('puts a fifth of its members in the outer cloud', () => {
    expect(oortFractionBeyond(OORT_INNER_AU)).toBe(1);
    expect(oortFractionBeyond(OORT_OUTER_AU)).toBe(0);
    expect(oortFractionBeyond(HILLS_OUTER_AU)).toBeCloseTo(0.2, 1);
  });

  it('draws points that follow it, the same each time', () => {
    const pts = oortCloudPoints(20000);
    expect(oortCloudPoints(20000)).toEqual(pts);
    let outer = 0;
    let north = 0;
    for (let i = 0; i < 20000; i++) {
      const r = Math.hypot(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]);
      expect(r).toBeGreaterThanOrEqual(OORT_INNER_AU * 0.9999);
      expect(r).toBeLessThanOrEqual(OORT_OUTER_AU * 1.0001);
      if (r > HILLS_OUTER_AU) outer++;
      if (pts[3 * i + 2] > 0) north++;
    }
    expect(outer / 20000).toBeCloseTo(oortFractionBeyond(HILLS_OUTER_AU), 1);
    expect(north / 20000).toBeCloseTo(0.5, 1);
  });
});

describe('when they show', () => {
  it('shows the heliosphere from hundreds of au, the Oort cloud from thousands, and neither among the planets', () => {
    expect(heliosphereFade(30, 1e4)).toBe(0);
    expect(heliosphereFade(600, 300)).toBe(1);
    expect(heliosphereFade(1e6, 2)).toBe(0);
    expect(oortFade(600, 1e5)).toBe(0);
    expect(oortFade(3e5, 400)).toBe(1);
  });
});
