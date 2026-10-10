import { describe, expect, it } from 'vitest';
import {
  eepAtAge,
  engulfmentAgeYr,
  lifeTrack,
  mestelCoolingYr,
  mestelLuminosity,
  planetaryNebula,
  PLANET_A_AU,
  PN_EXPANSION_KMS,
  stageOf,
  stateAtAge,
  stateAtEep,
  SUN_AGE_TODAY_YR,
  sunAt,
  sunModel,
  trackForMass,
  TRACK_MASS_RANGE,
  whiteDwarfRadiusRsun,
} from './evolution';
import { SUN_TEFF_K } from './constants';

const sun = sunModel();
const marks = sun.track.marks;
const RSUN_AU = 695_700 / 149_597_870.7;
const ageAt = (eep: number) => stateAtEep(sun.track, eep).ageYr;

describe('tracks from the formulae', () => {
  it('have rising ages, every stage marked in order, and end as the formulae say', () => {
    for (const m of [0.8, 1, 1.5, 2, 3, 5]) {
      const t = lifeTrack(m);
      for (let i = 1; i < t.ageYr.length; i++) expect(t.ageYr[i]).toBeGreaterThan(t.ageYr[i - 1]);
      expect(t.end).toBe('white-dwarf');
    }
    expect(marks.tms).toBeLessThan(marks.bgb);
    expect(marks.bgb).toBeLessThan(marks.hei);
    expect(marks.hei).toBeLessThan(marks.bagb);
    expect(marks.bagb).toBeLessThan(marks.tpagb);
    expect(marks.tpagb).toBeLessThan(marks.wd);
    // Massive stars end in a supernova (the track stops there).
    expect(lifeTrack(15).end).toBe('supernova');
  });

  it('interpolate in the life coordinate and invert age', () => {
    const t = sun.track;
    const s = stateAtEep(t, marks.tms);
    expect(eepAtAge(t, s.ageYr)).toBeCloseTo(marks.tms, 6);
    const k = 40;
    const mid = stateAtEep(t, k + 0.5);
    expect(mid.logL).toBeCloseTo(0.5 * (t.logL[k] + t.logL[k + 1]), 10);
  });

  it('give main-sequence lifetimes falling with mass (Hurley et al.: 11.0 Gyr for 1 M☉, 0.38 Gyr for 3 M☉)', () => {
    const tms = (m: number) => lifeTrack(m).ageYr[lifeTrack(m).marks.tms] / 1e9;
    expect(tms(1)).toBeCloseTo(11.0, 1);
    expect(tms(1.2)).toBeLessThan(tms(1));
    expect(tms(3)).toBeCloseTo(0.378, 2);
    // The card's tracks are clamped to the range the formulae are drawn for.
    expect(trackForMass(60).massMsun).toBe(TRACK_MASS_RANGE[1]);
  });

  it('give white dwarfs of about 0.5–0.8 M☉ from 1–3 M☉ stars (Hurley et al.’s initial–final mass relation, Fig. 18)', () => {
    const final = (m: number) => {
      const t = lifeTrack(m);
      return t.massNow[t.massNow.length - 1];
    };
    expect(final(1)).toBeGreaterThan(0.5);
    expect(final(1)).toBeLessThan(0.55);
    expect(final(2)).toBeGreaterThan(final(1));
    expect(final(3)).toBeGreaterThan(0.7);
    expect(final(3)).toBeLessThan(0.85);
  });
});

describe('the Sun’s life', () => {
  it('is the nominal Sun today', () => {
    const s = sunAt(sun, SUN_AGE_TODAY_YR);
    expect(s.lsun).toBeCloseTo(1, 6);
    expect(s.rsun).toBeCloseTo(1, 6);
    expect(s.teffK).toBeCloseTo(SUN_TEFF_K, 0);
    expect(s.massMsun).toBeCloseTo(1, 9);
    expect(s.orbitScale).toBeCloseTo(1, 9);
    expect(s.absMagV).toBeCloseTo(4.81, 1);
    expect(s.stage).toBe('Main sequence');
  });

  it('brightens on the main sequence, about 10% a billion years, to twice today at its end', () => {
    const in1 = sunAt(sun, SUN_AGE_TODAY_YR + 1e9);
    expect(in1.lsun).toBeGreaterThan(1.07);
    expect(in1.lsun).toBeLessThan(1.13);
    const tms = sunAt(sun, ageAt(marks.tms));
    expect(tms.lsun).toBeGreaterThan(1.9);
    expect(tms.rsun).toBeGreaterThan(1.4);
  });

  it('reaches about 0.88 au at the tip of the red-giant branch, having lost about a quarter of its mass (Reimers, η = 0.5)', () => {
    const tip = sunAt(sun, ageAt(marks.hei));
    expect(tip.rsun * RSUN_AU).toBeGreaterThan(0.8);
    expect(tip.rsun * RSUN_AU).toBeLessThan(0.95);
    expect(tip.lsun).toBeGreaterThan(2500);
    expect(tip.teffK).toBeLessThan(3200);
    expect(tip.massMsun).toBeGreaterThan(0.72);
    expect(tip.massMsun).toBeLessThan(0.82);
    expect(tip.stage).toBe('Red giant');
  });

  it('settles into the red clump, swells again on the AGB, and ends a white dwarf of about 0.52 M☉', () => {
    const hb = sunAt(sun, ageAt(marks.hei + 20));
    expect(hb.stage).toBe('Horizontal branch (red clump)');
    expect(hb.rsun).toBeGreaterThan(7);
    expect(hb.rsun).toBeLessThan(15);
    let maxR = 0;
    for (let e = marks.bagb; e < marks.wd; e++) maxR = Math.max(maxR, sunAt(sun, ageAt(e)).rsun);
    expect(maxR * RSUN_AU).toBeGreaterThan(1.0);
    expect(maxR * RSUN_AU).toBeLessThan(1.25);
    const end = sunAt(sun, sun.endAgeYr);
    expect(end.massMsun).toBeGreaterThan(0.5);
    expect(end.massMsun).toBeLessThan(0.55);
    expect(end.rsun).toBeLessThan(0.02);
    expect(end.stage).toBe('White dwarf');
  });

  it('crosses from the AGB to a hot white dwarf in about a hundred thousand years', () => {
    expect(sun.ionYr - sun.leaveYr).toBeGreaterThan(5000);
    expect(sun.ionYr - sun.leaveYr).toBeLessThan(50_000);
    expect(sun.endAgeYr - sun.leaveYr).toBeLessThan(200_000);
    expect(sunAt(sun, sun.endAgeYr).teffK).toBeGreaterThan(80_000);
  });

  it('cools as a white dwarf: Mestel’s law through Sirius B, to the cold radius of its mass', () => {
    expect(mestelCoolingYr(1.018, 10 ** -1.248)).toBeCloseTo(1.26e8, -3);
    expect(mestelLuminosity(1.018, 1.26e8)).toBeCloseTo(10 ** -1.248, 8);
    expect(whiteDwarfRadiusRsun(0.6)).toBeCloseTo(0.0125, 3);
    expect(whiteDwarfRadiusRsun(1.018)).toBeCloseTo(0.0081, 3);
    const late = sunAt(sun, sun.lastAgeYr);
    expect(late.lsun).toBeLessThan(2e-3);
    expect(late.lsun).toBeGreaterThan(1e-4);
    expect(late.rsun).toBeCloseTo(whiteDwarfRadiusRsun(late.massMsun), 4);
    expect(late.teffK).toBeGreaterThan(5000);
    expect(late.teffK).toBeLessThan(12000);
  });

  it('widens the planets’ orbits as a ∝ 1/M', () => {
    for (const age of [SUN_AGE_TODAY_YR, ageAt(marks.hei), sun.endAgeYr]) {
      const s = sunAt(sun, age);
      expect(s.orbitScale * s.massMsun).toBeCloseTo(1, 9);
    }
    expect(sunAt(sun, sun.endAgeYr).orbitScale).toBeGreaterThan(1.8);
  });

  it('swallows Mercury near the tip of the red-giant branch; Venus and Earth, their orbits widened, escape (tides left out)', () => {
    const mercury = engulfmentAgeYr(sun, PLANET_A_AU.mercury)!;
    expect(mercury).toBeGreaterThan(ageAt(marks.bgb));
    expect(mercury).toBeLessThanOrEqual(ageAt(marks.hei));
    expect(engulfmentAgeYr(sun, PLANET_A_AU.venus)).toBeNull();
    expect(engulfmentAgeYr(sun, PLANET_A_AU.earth)).toBeNull();
    expect(engulfmentAgeYr(sun, PLANET_A_AU.mars)).toBeNull();
    // At the moment it is reached, Mercury's widened orbit is the Sun's radius.
    const s = sunAt(sun, mercury);
    expect(s.rsun * RSUN_AU).toBeCloseTo(PLANET_A_AU.mercury * s.orbitScale, 3);
    // Venus escapes narrowly: at the tip its widened orbit is within 10% of the Sun's radius.
    const tip = sunAt(sun, ageAt(marks.hei));
    expect(PLANET_A_AU.venus * tip.orbitScale).toBeLessThan(1.1 * tip.rsun * RSUN_AU);
  });

  it('gives each stage a name in order', () => {
    const stages = [0, marks.tms + 5, marks.bgb + 100, marks.hei + 1, marks.hei + 20, marks.bagb + 10, marks.tpagb + 1, marks.wd].map((e) => stageOf(sun.track, e));
    expect(stages).toEqual(['Main sequence', 'Subgiant', 'Red giant', 'Helium flash', 'Horizontal branch (red clump)', 'Asymptotic giant branch', 'Thermally pulsing AGB', 'White dwarf']);
    expect(stateAtAge(sun.track, 0).eep).toBe(0);
    expect(sunAt(sun, sun.ionYr + 5000).stage).toBe('Planetary nebula');
  });
});

describe('the Sun’s planetary nebula (a model)', () => {
  it('is lit once the core passes 25,000 K, grows at 25 km/s from the AGB’s end, and is gone 30,000 years later', () => {
    expect(planetaryNebula(sun, sun.leaveYr - 1)).toBeNull();
    const pn = planetaryNebula(sun, sun.ionYr + 5000)!;
    expect(pn.glow).toBeCloseTo(1, 6);
    expect(pn.radiusAu).toBeCloseTo((PN_EXPANSION_KMS * (sun.ionYr + 5000 - sun.leaveYr) * 365.25 * 86_400) / 149_597_870.7, 3);
    expect(planetaryNebula(sun, sun.ionYr + 31_000)).toBeNull();
  });
});
