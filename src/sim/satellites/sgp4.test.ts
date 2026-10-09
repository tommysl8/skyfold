import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/sgp4-verification.json';
import { parseTle, propagate, sgp4init, gstime } from './sgp4';

interface Case {
  satnum: string;
  line1: string;
  line2: string;
  states: number[][];
}

const cases = (fixture as { cases: Case[] }).cases;

describe('SGP4 against the Vallado et al. (2006) verification output', () => {
  it('has every published case', () => {
    expect(cases.length).toBe(33);
    expect(cases.reduce((s, c) => s + c.states.length, 0)).toBe(667);
  });

  // 33334 is the paper's "error 2" case: its element set fails at once, and tcppver.out repeats the
  // previous satellite's last state under its number. It is checked separately below.
  for (const c of cases.filter((k) => k.satnum !== '33334')) {
    it(`reproduces ${c.satnum} (${c.states.length} states)`, () => {
      const rec = sgp4init(parseTle(c.line1, c.line2));
      const r = new Float64Array(3);
      const v = new Float64Array(3);
      let worstR = 0;
      let worstV = 0;
      for (const [t, x, y, z, vx, vy, vz] of c.states) {
        const err = propagate(rec, t, r, v);
        // The reference prints the state of a decaying orbit (error 6) too; other errors print nothing.
        expect(err === 0 || err === 6).toBe(true);
        worstR = Math.max(worstR, Math.hypot(r[0] - x, r[1] - y, r[2] - z));
        worstV = Math.max(worstV, Math.hypot(v[0] - vx, v[1] - vy, v[2] - vz));
      }
      // tcppver.out prints 8 decimals of km and 9 of km/s; the long deep-space integrations agree to
      // well under a millimetre.
      expect(worstR).toBeLessThan(1e-6);
      expect(worstV).toBeLessThan(1e-9);
    });
  }

  it('fails where the reference fails', () => {
    const bad = (id: string) => {
      const c = cases.find((k) => k.satnum === id)!;
      return sgp4init(parseTle(c.line1, c.line2));
    };
    const r = new Float64Array(3);
    const v = new Float64Array(3);
    // 33333: eccentricity 0.995 decays; the reference prints nothing after 20 minutes (error 4 at 25).
    expect(propagate(bad('33333'), 25, r, v)).toBe(4);
    // 33334: a mean motion of 0.00001 rev/day is no orbit at all.
    expect(propagate(bad('33334'), 0, r, v)).not.toBe(0);
  });

  it('gives Greenwich sidereal time at J2000 (Vallado 2004, eq. 3-45)', () => {
    // 18.697374558 h at 2000-01-01 12:00 UT1.
    expect((gstime(2451545) * 12) / Math.PI).toBeCloseTo(18.697374558, 8);
  });
});
