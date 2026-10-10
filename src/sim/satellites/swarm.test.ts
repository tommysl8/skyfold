import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/sgp4-verification.json';
import { parseTle, propagate, sgp4init } from './sgp4';
import { PACK, packOne, packedPosition, REBASE_MIN } from './swarm';
import { classify, epochToJd, orbitSummary, parseOmmCsv } from './omm';

const cases = (fixture as { cases: { satnum: string; line1: string; line2: string }[] }).cases;
const byNum = (n: string) => {
  const c = cases.find((k) => k.satnum === n)!;
  return sgp4init(parseTle(c.line1, c.line2));
};

/** Worst distance (km) between the swarm's mean-element ellipse and full SGP4 over the minutes the shader covers. */
function worstKm(satnum: string, startMin: number): number {
  const rec = byNum(satnum);
  const packed = new Float32Array(PACK);
  const jd0 = rec.epochJd + startMin / 1440;
  packOne(rec, 0, jd0, packed, 0);
  const p = { x: 0, y: 0, z: 0 };
  const r = new Float64Array(3);
  const v = new Float64Array(3);
  let worst = 0;
  // From the reference time to past the rebase interval (the worker answers within a frame or two).
  for (let dt = 0; dt <= REBASE_MIN + 60; dt += 7) {
    expect(packedPosition(packed, 0, dt, p)).toBe(true);
    propagate(rec, startMin + dt, r, v);
    worst = Math.max(worst, Math.hypot(p.x - r[0], p.y - r[1], p.z - r[2]));
  }
  return worst;
}

describe('the swarm’s mean-element orbits against full SGP4', () => {
  it('stays within a few hundred metres in low orbit', () => {
    // 06251: perigee 377 km, moderate drag; 28057: a 98° sun-synchronous orbit.
    expect(worstKm('6251', 0)).toBeLessThan(0.3);
    expect(worstKm('6251', 2000)).toBeLessThan(0.3);
    expect(worstKm('28057', 1000)).toBeLessThan(0.3);
  });

  it('stays within a kilometre or two for the deep-space orbits (geosynchronous, Molniya, a 4-day orbit)', () => {
    expect(worstKm('14128', 1000)).toBeLessThan(1); // Eutelsat 1-F1, geosynchronous
    // A 97-hour orbit, e 0.79, whose inclination the Moon turns by 10⁻⁴ rad an hour: the rates' own change shows.
    expect(worstKm('20413', 1000)).toBeLessThan(2.5);
    expect(worstKm('8195', 1000)).toBeLessThan(1); // Molniya 2-14
  });

  it('hides an element set SGP4 rejects', () => {
    const c = cases.find((k) => k.satnum === '33334')!;
    const rec = sgp4init(parseTle(c.line1, c.line2));
    const packed = new Float32Array(PACK);
    packOne(rec, 0, rec.epochJd, packed, 0);
    expect(packedPosition(packed, 0, 0, { x: 0, y: 0, z: 0 })).toBe(false);
  });
});

describe('CelesTrak OMM CSV', () => {
  // A made-up row in CelesTrak's layout (not real data).
  const csv =
    'OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT\r\n' +
    'TEST SAT,2026-999A,2026-10-08T12:00:00.500000,15.5,.0005,51.6,96.9,239.5,120.4,0,U,100001,999,1,.11E-3,.5E-4,0\r\n' +
    'STARLINK-99999,2026-998B,2026-10-08T00:00:00,15.06,.0001,53.0,10,20,30,0,U,99999,999,1,.1E-3,0,0\r\n' +
    'BROKEN,,not a date,1,0,0,0,0,0,0,U,3,999,1,0,0,0\r\n';

  it('reads every column, six-digit catalogue numbers included, and skips broken rows', () => {
    const rows = parseOmmCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].norad).toBe(100001);
    expect(rows[0].cosparId).toBe('2026-999A');
    expect(rows[0].bstar).toBeCloseTo(1.1e-4, 12);
    expect(rows[0].epochJd).toBeCloseTo(2461322.0 + 0.5 / 86400, 9);
    expect(classify(rows[1])).toBe(1);
  });

  it('turns an OMM epoch into a Julian date (to a double’s resolution there, about 40 µs)', () => {
    expect(epochToJd('2000-01-01T12:00:00')).toBe(2451545);
    expect((epochToJd('2000-01-01T12:00:00.001') - 2451545) * 86400e3).toBeCloseTo(1, 1);
  });

  it('summarises an orbit (the ISS: about 420 km, 92.9 minutes)', () => {
    const s = orbitSummary({ epochJd: 0, meanMotion: 15.5, eccentricity: 0.0005, inclinationDeg: 51.6, raanDeg: 0, argPericentreDeg: 0, meanAnomalyDeg: 0, bstar: 0 });
    expect(s.periodMin).toBeCloseTo(92.9, 1);
    expect(s.perigeeKm).toBeGreaterThan(400);
    expect(s.apogeeKm).toBeLessThan(440);
  });
});
