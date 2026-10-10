import { describe, expect, it } from 'vitest';
import {
  addMags,
  ALGOL_DEC_DEG,
  ALGOL_EPHEMERIS,
  ALGOL_PARALLAX_MAS,
  ALGOL_RA_DEG,
  ALGOL_STARS,
  algolAbsMags,
  algolMembersAu,
  algolOrbits,
  BETA_LYR,
  betaLyrEpoch,
  betaLyrMinimumJd,
  betaLyrPeriod,
  betaLyrV,
  betelgeuseV,
  GREAT_DIMMING,
  hiddenShare,
  occultedFraction,
  phaseAt,
  polarisDeltaV,
  POLARIS_PULSATION,
  pulsatorAt,
  pulsatorV,
  PULSATORS,
  VARIABLE_REFS,
} from './variables';
import { orbitStateInto } from './orbits';
import { equatorialToEcliptic, unitFromRaDec, type Vec3 } from './frames';
import { bolometricCorrection, SUN_M_BOL } from './photometry';
import { limbDarkening, loggCgs } from './closeup';
import { loadNames } from '../../test/stars';
import { starsByNumber } from './names';

describe('eclipses of limb-darkened discs', () => {
  it('hides nothing apart, everything behind a bigger disc, p² of a uniform disc for a small one inside', () => {
    expect(occultedFraction(0.5, 1.6, 0.6)).toBe(0);
    expect(occultedFraction(2, 0.5, 0.6)).toBe(1);
    expect(occultedFraction(0.1, 0, 0)).toBeCloseTo(0.01, 3);
    expect(occultedFraction(0.1, 0.5, 0)).toBeCloseTo(0.01, 3);
    // Limb darkening: a small disc at the centre hides more than its area (I(0)/<I> = 1/(1 − u/3)), at the limb less.
    expect(occultedFraction(0.05, 0, 0.6)).toBeCloseTo(0.0025 / (1 - 0.6 / 3), 4);
    expect(occultedFraction(0.05, 0.9, 0.6)).toBeLessThan(0.0025);
  });

  it('grows steadily as the disc moves in', () => {
    let last = 0;
    for (let z = 2; z >= 0; z -= 0.05) {
      const f = occultedFraction(0.8, z, 0.4);
      expect(f).toBeGreaterThanOrEqual(last - 1e-12);
      last = f;
    }
  });
});

describe('Algol', () => {
  const orbits = algolOrbits();
  const solve = (o: (typeof orbits)[number], jd: number, out: number[]) => orbitStateInto(o, jd, out, null);
  const abs = algolAbsMags(bolometricCorrection, SUN_M_BOL);
  // Seen from the Sun: the system along its direction, at the orbits' parallax distance (au).
  const dAu = (1000 / ALGOL_PARALLAX_MAS) * 206_264.806;
  const dir = equatorialToEcliptic(unitFromRaDec(ALGOL_RA_DEG, ALGOL_DEC_DEG));
  const centre: Vec3 = [dir[0] * dAu, dir[1] * dAu, dir[2] * dAu];
  const R_AU = 695_700 / 149_597_870.7;
  const u = (s: { teffK: number; radiusRsun: number; massMsun: number }) => limbDarkening(s.teffK, loggCgs(s.massMsun, s.radiusRsun))[1];
  const vFromSun = (jd: number) => {
    const m = algolMembersAu(jd, orbits, solve);
    const at = (p: Vec3): Vec3 => [centre[0] + p[0], centre[1] + p[1], centre[2] + p[2]];
    const A = { pos: at(m.a), radius: ALGOL_STARS.a.radiusRsun * R_AU, u: u(ALGOL_STARS.a) };
    const B = { pos: at(m.b), radius: ALGOL_STARS.b.radiusRsun * R_AU, u: u(ALGOL_STARS.b) };
    const C = { pos: at(m.c), radius: ALGOL_STARS.c.radiusRsun * R_AU, u: u(ALGOL_STARS.c) };
    const o: Vec3 = [0, 0, 0];
    const fa = 1 - hiddenShare(A, B, o) - hiddenShare(A, C, o);
    const fb = 1 - hiddenShare(B, A, o) - hiddenShare(B, C, o);
    const dm = 5 * Math.log10(dAu / 206_264.806) - 5;
    return addMags(abs.a + dm - 2.5 * Math.log10(Math.max(fa, 1e-9)), abs.b + dm - 2.5 * Math.log10(Math.max(fb, 1e-9)), abs.c + dm);
  };

  it('adds up to its measured brightness out of eclipse (V = 2.12 at maximum, GCVS)', () => {
    const out = vFromSun(ALGOL_EPHEMERIS.minJd + 0.25 * ALGOL_EPHEMERIS.periodDays);
    expect(out).toBeGreaterThan(2.0);
    expect(out).toBeLessThan(2.2);
  });

  it('is eclipsed at the GCVS times, about 1.3 mag deep, with a shallow secondary eclipse half a period later', () => {
    const n = 5000; // a primary minimum in 2022
    const t0 = ALGOL_EPHEMERIS.minJd + n * ALGOL_EPHEMERIS.periodDays;
    const out = vFromSun(t0 + 0.25 * ALGOL_EPHEMERIS.periodDays);
    // The deepest point of the eclipse is at the predicted time, to a few minutes.
    let best = t0;
    let bestV = -Infinity;
    for (let dt = -0.3; dt <= 0.3; dt += 0.001) {
      const v = vFromSun(t0 + dt);
      if (v > bestV) {
        bestV = v;
        best = t0 + dt;
      }
    }
    expect(Math.abs(best - t0) * 1440).toBeLessThan(5);
    // GCVS: 2.12 to 3.39, 1.27 mag; Baron et al.'s geometry with Kolbas et al.'s temperatures gives about that.
    expect(bestV - out).toBeGreaterThan(1.0);
    expect(bestV - out).toBeLessThan(1.6);
    const secondary = vFromSun(t0 + 0.5 * ALGOL_EPHEMERIS.periodDays);
    expect(secondary - out).toBeGreaterThan(0.01);
    expect(secondary - out).toBeLessThan(0.15);
    // The eclipse lasts about 10 hours (GCVS D = 14% of the period: 9.6 h).
    let first = 0;
    for (let dt = -0.4; dt < 0; dt += 0.002)
      if (vFromSun(t0 + dt) - out > 0.01) {
        first = dt;
        break;
      }
    expect(-2 * first * 24).toBeGreaterThan(8);
    expect(-2 * first * 24).toBeLessThan(11);
  });

  it('has the orbital sizes and masses of Baron et al. (2012)', () => {
    const [inner, outer] = orbits;
    expect(inner.aAu / R_AU).toBeCloseTo(13.3, 1);
    expect(outer.massSecondaryMsun / outer.massPrimaryMsun).toBeCloseTo(0.456, 2);
    // p̂ and q̂ are orthonormal.
    const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const o of orbits) {
      expect(dot(o.pHat, o.pHat)).toBeCloseTo(1, 12);
      expect(dot(o.qHat, o.qHat)).toBeCloseTo(1, 12);
      expect(dot(o.pHat, o.qHat)).toBeCloseTo(0, 12);
    }
    // At the epoch B is straight in front of A (towards the Sun), 98.7° inclination: 2 R☉ off centre.
    const m = algolMembersAu(ALGOL_EPHEMERIS.minJd, orbits, solve);
    const rel: Vec3 = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]];
    expect(dot(rel, dir)).toBeLessThan(0);
    const along = dot(rel, dir);
    const across = Math.sqrt(dot(rel, rel) - along * along);
    expect(across / R_AU).toBeCloseTo(13.3 * Math.abs(Math.cos(98.7 * (Math.PI / 180))), 1);
  });
});

describe('pulsating stars', () => {
  it('follow their GCVS ranges, maxima at the epochs, rising in the share of the cycle given', () => {
    for (const d of PULSATORS) {
      expect(pulsatorV(d, 0)).toBeCloseTo(d.vMax, 9);
      expect(pulsatorV(d, 1 - d.rise)).toBeCloseTo(d.vMin, 9);
      expect(pulsatorAt(d, d.epochJd + 7 * d.periodDays).v).toBeCloseTo(d.vMax, 6);
      for (let p = 0; p < 1; p += 0.01) {
        const v = pulsatorV(d, p);
        expect(v).toBeGreaterThanOrEqual(d.vMax - 1e-9);
        expect(v).toBeLessThanOrEqual(d.vMin + 1e-9);
      }
    }
  });

  it('δ Cephei: hottest at maximum light, ±3% in radius; Mira ±10%, 3,200 to 2,900 K', () => {
    const dc = PULSATORS.find((d) => d.id === 'delta-cephei')!;
    const max = pulsatorAt(dc, dc.epochJd);
    const min = pulsatorAt(dc, dc.epochJd + (1 - dc.rise) * dc.periodDays);
    expect(max.teffK).toBe(6900);
    expect(min.teffK).toBe(5600);
    // Nardetto et al. 2016: 1.450 and 1.535 mas at phases 0.05 and 0.48.
    const r05 = pulsatorAt(dc, dc.epochJd + 0.05 * dc.periodDays).radiusRsun!;
    const r48 = pulsatorAt(dc, dc.epochJd + 0.48 * dc.periodDays).radiusRsun!;
    expect(r48 / r05).toBeCloseTo(1.535 / 1.45, 1);
    const mira = PULSATORS.find((d) => d.id === 'mira')!;
    expect(mira.vMin - mira.vMax).toBeGreaterThan(5.5);
    expect(pulsatorAt(mira, mira.epochJd + 0.4 * mira.periodDays).radiusRsun!).toBeCloseTo(314 * 1.095, 0);
  });

  it('Polaris: 0.04 mag peak to peak every 3.97 days', () => {
    const p = POLARIS_PULSATION;
    expect(polarisDeltaV(p.epochJd) - polarisDeltaV(p.epochJd + p.periodDays / 2)).toBeCloseTo(-0.04, 9);
    const ph = phaseAt(p.epochJd, p.periodDays, p.epochJd + 10 * p.periodDays);
    expect(Math.min(ph, 1 - ph)).toBeCloseTo(0, 6);
  });

  it('are the catalogue stars of their HIP numbers', () => {
    const names = loadNames();
    for (const d of PULSATORS) expect(starsByNumber(names, 'hip', d.hip)).toContain(d.catalogueIndex);
  });
});

describe('Betelgeuse and β Lyrae', () => {
  it('passes through the Great Dimming’s measured points, deepest in February 2020', () => {
    for (const p of GREAT_DIMMING.slice(1, -1)) expect(betelgeuseV(p.jd)).toBeCloseTo(p.v, 6);
    const feb = GREAT_DIMMING[2].jd;
    expect(betelgeuseV(feb)).toBeCloseTo(1.614, 3);
    expect(betelgeuseV(feb - 400)).toBeLessThan(1);
    expect(betelgeuseV(feb + 1000)).toBeLessThan(1);
    // Its usual cycle: between about 0.25 and 0.85.
    for (let jd = feb + 200; jd < feb + 3000; jd += 37) {
      expect(betelgeuseV(jd)).toBeGreaterThan(0.2);
      expect(betelgeuseV(jd)).toBeLessThan(0.9);
    }
  });

  it('β Lyrae: the quadratic ephemeris, its period now 12.94 days, the GCVS maximum and minima', () => {
    expect(betaLyrEpoch(BETA_LYR.t0)).toBe(0);
    expect(betaLyrEpoch(betaLyrMinimumJd(4000))).toBeCloseTo(4000, 6);
    const now = 2_461_000; // 2025
    expect(betaLyrPeriod(now)).toBeCloseTo(12.944, 2);
    // 19 s a year.
    expect((betaLyrPeriod(now + 365.25) - betaLyrPeriod(now)) * 86_400).toBeCloseTo(19, 0);
    const e = Math.round(betaLyrEpoch(now));
    expect(betaLyrV(betaLyrMinimumJd(e))).toBeCloseTo(4.36, 6);
    expect(betaLyrV(0.5 * (betaLyrMinimumJd(e) + betaLyrMinimumJd(e + 1)))).toBeCloseTo(3.85, 2);
    let max = Infinity;
    for (let k = 0; k < 200; k++) max = Math.min(max, betaLyrV(betaLyrMinimumJd(e) + (k / 200) * 12.94));
    expect(max).toBeCloseTo(3.25, 1);
  });

  it('cites every source it names', () => {
    for (const d of PULSATORS) for (const [, ref] of d.facts) expect(VARIABLE_REFS[ref]).toBeDefined();
  });
});
