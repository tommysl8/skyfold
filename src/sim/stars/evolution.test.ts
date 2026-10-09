import { describe, expect, it } from 'vitest';
import {
  decodeTracks,
  EEP,
  eepAtAge,
  engulfmentAgeYr,
  mestelCoolingYr,
  mestelLuminosity,
  PLANET_A_AU,
  stageOf,
  stateAtAge,
  stateAtEep,
  SUN_AGE_TODAY_YR,
  sunAt,
  sunModel,
  trackForMass,
  whiteDwarfRadiusRsun,
  type TrackFile,
} from './evolution';
import { SUN_TEFF_K } from './constants';
import { readJson } from '../../test/files';

const file = readJson<TrackFile>('public/data/stellar-tracks.json');
const tracks = decodeTracks(file);
const sun = sunModel(tracks);
const RSUN_AU = 695_700 / 149_597_870.7;

describe('the track table', () => {
  it('has the solar-metallicity grid, each track from the ZAMS with rising ages and its primary EEPs', () => {
    expect(tracks.map((t) => t.massMsun)).toEqual([0.5, 0.8, 1, 1.2, 1.5, 2, 3, 5, 8, 15, 40]);
    for (const t of tracks) {
      expect(t.eep[0]).toBe(EEP.zams);
      for (let i = 1; i < t.eep.length; i++) {
        expect(t.eep[i]).toBeGreaterThan(t.eep[i - 1]);
        expect(t.ageYr[i]).toBeGreaterThan(t.ageYr[i - 1]);
      }
      for (const e of t.primaryEeps) expect([...t.eep]).toContain(e);
    }
  });

  it('interpolates in EEP and inverts age', () => {
    const t = sun.track;
    const s = stateAtEep(t, EEP.tams);
    expect(eepAtAge(t, s.ageYr)).toBeCloseTo(EEP.tams, 6);
    // Halfway between two kept points, the mean of their values.
    const k = 40;
    const mid = stateAtEep(t, 0.5 * (t.eep[k] + t.eep[k + 1]));
    expect(mid.logL).toBeCloseTo(0.5 * (t.logL[k] + t.logL[k + 1]), 10);
  });

  it('interpolates between masses: a track at a grid mass is that track, and lifetimes fall with mass', () => {
    const exact = trackForMass(tracks, 1.5);
    expect(exact.massMsun).toBe(1.5);
    const m13 = trackForMass(tracks, 1.3);
    const tams = (m: number) => stateAtEep(trackForMass(tracks, m), EEP.tams).ageYr;
    expect(tams(1.3)).toBeLessThan(tams(1.2));
    expect(tams(1.3)).toBeGreaterThan(tams(1.5));
    // Main-sequence lifetimes: about 10 Gyr for the Sun, a few hundred Myr for 3 M☉ (MIST: 9.9 and 0.38 Gyr).
    expect(tams(1) / 1e9).toBeCloseTo(9.92, 1);
    expect(tams(3) / 1e9).toBeGreaterThan(0.3);
    expect(tams(3) / 1e9).toBeLessThan(0.45);
    expect(m13.ageYr.every((a, i) => i === 0 || a > m13.ageYr[i - 1])).toBe(true);
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
    // M_V = 4.81 (Willmer 2018) to the bolometric correction's precision.
    expect(s.absMagV).toBeCloseTo(4.81, 1);
    expect(s.stage).toBe('Main sequence');
  });

  it('brightens on the main sequence: about 10% a billion years', () => {
    const in1 = sunAt(sun, SUN_AGE_TODAY_YR + 1e9);
    expect(in1.lsun).toBeGreaterThan(1.07);
    expect(in1.lsun).toBeLessThan(1.13);
    // The end of core hydrogen burning, near 10 Gyr: about twice as bright, half again as large.
    const tams = sunAt(sun, stateAtEep(sun.track, EEP.tams).ageYr);
    expect(tams.lsun).toBeGreaterThan(1.9);
    expect(tams.rsun).toBeGreaterThan(1.4);
  });

  it('reaches about 0.8 au at the tip of the red-giant branch, having lost about 5% of its mass', () => {
    const tip = sunAt(sun, stateAtEep(sun.track, EEP.rgbTip).ageYr);
    expect(tip.rsun * RSUN_AU).toBeGreaterThan(0.75);
    expect(tip.rsun * RSUN_AU).toBeLessThan(0.85);
    expect(tip.lsun).toBeGreaterThan(1800);
    expect(tip.teffK).toBeLessThan(3200);
    expect(tip.massMsun).toBeGreaterThan(0.94);
    expect(tip.massMsun).toBeLessThan(0.97);
    expect(tip.stage).toBe('Helium flash');
  });

  it('settles into the red clump, swells again on the AGB, and ends a white dwarf of about 0.54 M☉', () => {
    const hb = sunAt(sun, stateAtEep(sun.track, 650).ageYr);
    expect(hb.stage).toBe('Horizontal branch (red clump)');
    expect(hb.rsun).toBeGreaterThan(7);
    expect(hb.rsun).toBeLessThan(15);
    let maxR = 0;
    for (let e = EEP.tpagb; e < EEP.postAgb; e++) maxR = Math.max(maxR, sunAt(sun, stateAtEep(sun.track, e).ageYr).rsun);
    expect(maxR * RSUN_AU).toBeGreaterThan(1.4);
    const end = sunAt(sun, sun.endAgeYr);
    expect(end.massMsun).toBeGreaterThan(0.5);
    expect(end.massMsun).toBeLessThan(0.58);
    expect(end.rsun).toBeLessThan(0.03);
    expect(stageOf(sun.track, EEP.wd)).toBe('White dwarf');
  });

  it('cools as a white dwarf: Mestel’s law through Sirius B, to the cold radius of its mass', () => {
    // Sirius B (Bond et al. 2017): 126 Myr to 0.0565 L☉ at 1.018 M☉, both ways.
    expect(mestelCoolingYr(1.018, 10 ** -1.248)).toBeCloseTo(1.26e8, -3);
    expect(mestelLuminosity(1.018, 1.26e8)).toBeCloseTo(10 ** -1.248, 8);
    // Nauenberg: about 0.0128 R☉ at 0.6 M☉ (Earth-sized); Sirius B's measured 0.0081 R☉ near its mass.
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
    for (const age of [SUN_AGE_TODAY_YR, stateAtEep(sun.track, EEP.rgbTip).ageYr, sun.endAgeYr]) {
      const s = sunAt(sun, age);
      expect(s.orbitScale * s.massMsun).toBeCloseTo(1, 9);
    }
    expect(sunAt(sun, sun.endAgeYr).orbitScale).toBeGreaterThan(1.7);
  });

  it('swallows Mercury and Venus on the red-giant branch, reaches Earth only on the AGB (tides left out), never Mars', () => {
    const tipAge = stateAtEep(sun.track, EEP.rgbTip).ageYr;
    const agbAge = stateAtEep(sun.track, EEP.tpagb).ageYr;
    const mercury = engulfmentAgeYr(sun, PLANET_A_AU.mercury)!;
    const venus = engulfmentAgeYr(sun, PLANET_A_AU.venus)!;
    const earth = engulfmentAgeYr(sun, PLANET_A_AU.earth)!;
    expect(mercury).toBeLessThan(venus);
    expect(venus).toBeLessThanOrEqual(tipAge);
    expect(mercury).toBeGreaterThan(stateAtEep(sun.track, EEP.tams).ageYr);
    expect(earth).toBeGreaterThan(agbAge);
    expect(engulfmentAgeYr(sun, PLANET_A_AU.mars)).toBeNull();
    // At the moment it is reached, the planet's widened orbit is the Sun's radius.
    const s = sunAt(sun, venus);
    expect(s.rsun * RSUN_AU).toBeCloseTo(PLANET_A_AU.venus * s.orbitScale, 3);
  });

  it('gives each stage a name in order', () => {
    const stages = [EEP.zams, 300, 470, 560, 610, 650, 740, 900, EEP.wd].map((e) => stageOf(sun.track, e));
    expect(stages).toEqual([
      'Main sequence',
      'Main sequence',
      'Subgiant',
      'Red giant',
      'Helium flash',
      'Horizontal branch (red clump)',
      'Asymptotic giant branch',
      'Thermally pulsing AGB',
      'White dwarf',
    ]);
    expect(stateAtAge(sun.track, 0).eep).toBe(EEP.zams);
  });
});
