/**
 * The phenomena's pure parts: light curves read between their points, the supernovae's records and debris, the chirp of
 * GW170817 and its kilonova's light, relativistic beaming and the jets, the auroral oval about the date's geomagnetic
 * pole.
 */
import { describe, expect, it } from 'vitest';
import { msFromCivil } from '../../lib/time';
import { PARSEC_KM } from '../../physics/constants';
import { FAINT, interpolate, lastDayBrighterThan, magnitudeAt, NONE, segmentOf, temperatureAt, type LightCurve } from './lightCurve';
import { grownShare, msFromJulianCalendar, nakedEyeEndMs, remnantRadiusKm, shockRadiusKm, supernovaAt, supernovaById, SUPERNOVAE } from './supernovae';
import { chirpMass, cyclesFrom, frequencyAtSeparationHz, gwFrequencyHz, gwPhase, separationKm, SUN_TIME_S, timeToMergeS } from './chirp';
import { inspiralAt, kilonovaAt, MC_DETECTOR_MSUN, MERGER_MS, vMagnitudeOf, vShareRelSun } from './kilonova';
import { apparentSpeed, beamingBoost, betaFromApparent, betaOf, dopplerFactor, jetCounterJetRatio, lorentz } from './beaming';
import { abMagnitude, beamingFrom, cenABlobs, m87JetBlobs, M87_KNOTS, skyDirection } from './jets';
import { alFromKp, arcStrength, auroraBrightness, dipoleAt, edgeColatitude, fluxPerKr, geomagneticPole, lineColour, magneticLocalTime, ovalTable } from './aurora';
import { GW170817_POS_MPC } from './records';
import { gunzipFile } from '../../test/stars';

const DAY = 86_400_000;

describe('light curves', () => {
  const c: LightCurve = { days: [0, 10, 30], vmag: [-2, 0, 3], riseDays: 5, tailMagPerDay: 0.1, teffDays: [0, 30], teffK: [10000, 4000] };

  it('find the segment and read linearly between the points', () => {
    expect(segmentOf([0, 1, 5, 9], 4.9)).toBe(1);
    expect(segmentOf([0, 1, 5, 9], 5)).toBe(2);
    expect(interpolate([0, 10], [1, 3], 2.5)).toBeCloseTo(1.5, 12);
    expect(interpolate([0, 10], [1, 3], -4)).toBe(1);
    expect(magnitudeAt(c, 5)).toBeCloseTo(-1, 12);
    expect(magnitudeAt(c, 20)).toBeCloseTo(1.5, 12);
  });

  it('rise from nothing before the first point and fall at the tail’s slope after the last', () => {
    expect(magnitudeAt(c, -6)).toBe(NONE);
    expect(magnitudeAt(c, -2.5)).toBeCloseTo((FAINT + -2) / 2, 12);
    expect(magnitudeAt(c, 40)).toBeCloseTo(4, 12);
    // Fainter than FAINT: nothing.
    expect(magnitudeAt(c, 30 + (FAINT - 3) / 0.1 + 1)).toBe(NONE);
  });

  it('read the colour temperature in ln T, held beyond its points', () => {
    expect(temperatureAt(c, 15)).toBeCloseTo(Math.sqrt(10000 * 4000), 6);
    expect(temperatureAt(c, -3)).toBe(10000);
    expect(temperatureAt(c, 99)).toBe(4000);
  });

  it('find when the light falls past a magnitude', () => {
    expect(lastDayBrighterThan(c, 1.5)).toBeCloseTo(20, 12);
    expect(lastDayBrighterThan(c, 4)).toBeCloseTo(40, 12);
  });
});

describe('the supernovae', () => {
  it('convert the Julian calendar: 4 October 1582 (Julian) was 14 October (Gregorian)', () => {
    expect(msFromJulianCalendar(1582, 10, 4)).toBe(msFromCivil(1582, 10, 14));
    // 4 July 1054 (Julian) is 10 July in the proleptic Gregorian calendar, 6 days on.
    expect(msFromJulianCalendar(1054, 7, 4)).toBe(msFromCivil(1054, 7, 10));
    expect(msFromJulianCalendar(1181, 8, 6)).toBe(msFromCivil(1181, 8, 13));
  });

  it('peak as recorded', () => {
    const peak = (id: string) => Math.min(...supernovaById(id)!.curve.vmag);
    expect(peak('sn-1006')).toBeCloseTo(-7.5, 6);
    expect(peak('sn-1054')).toBeCloseTo(-4.5, 6);
    expect(peak('sn-1572')).toBeCloseTo(-4.0, 6);
    expect(peak('sn-1604')).toBeCloseTo(-2.95, 6);
    expect(peak('supernova-1987a')).toBeCloseTo(2.96, 6);
  });

  it('stay visible to the naked eye for as long as the records say', () => {
    const years = (id: string) => (nakedEyeEndMs(supernovaById(id)!) - supernovaById(id)!.firstSeenMs) / (365.25 * DAY);
    // SN 1054: to 6 April 1056 (Julian), 642 days after 4 July 1054.
    expect((nakedEyeEndMs(supernovaById('sn-1054')!) - supernovaById('sn-1054')!.firstSeenMs) / DAY).toBeCloseTo(642, 0);
    // Tycho's: to March 1574 (V 5.3 on 15 February, gone by mid-March).
    expect(years('sn-1572')).toBeGreaterThan(1.25);
    expect(years('sn-1572')).toBeLessThan(1.45);
    // Kepler's: Kepler last saw it a year on, at V 4.7, before the Sun's glare closed in (it would have faded past 6 some months
    // later); SN 1181: 185 days; SN 1987A: to about December 1987.
    expect(years('sn-1604')).toBeGreaterThan(1.0);
    expect(years('sn-1604')).toBeLessThan(1.3);
    expect((nakedEyeEndMs(supernovaById('sn-1181')!) - supernovaById('sn-1181')!.firstSeenMs) / DAY).toBeCloseTo(185, 0);
    expect(nakedEyeEndMs(supernovaById('supernova-1987a')!)).toBeGreaterThan(msFromCivil(1987, 12, 1));
    expect(nakedEyeEndMs(supernovaById('supernova-1987a')!)).toBeLessThan(msFromCivil(1988, 1, 1));
  });

  it('shine only when seen: nothing before the first light, and SN 1987A at magnitude 3 in May 1987', () => {
    const sn = supernovaById('supernova-1987a')!;
    expect(supernovaAt(sn, msFromCivil(1987, 2, 1)).vmag).toBe(NONE);
    expect(supernovaAt(sn, msFromCivil(1987, 5, 19)).vmag).toBeCloseTo(2.96, 1);
    expect(supernovaAt(supernovaById('sn-1054')!, msFromCivil(2026, 1, 1)).vmag).toBe(NONE);
  });

  it('grow to today’s remnants: radius from the angle and distance, and the shock never faster than the ejecta', () => {
    for (const sn of SUPERNOVAE) {
      const ref = (msFromCivil(Math.floor(sn.remnant.epochYear), 1, 1) - sn.explosionMs) / 1000;
      const r = shockRadiusKm(sn, ref);
      // At its reference epoch the shock is today's remnant (SN 1987A's piecewise radii and Pa 30's ballistic shell within a few per cent).
      expect(r / remnantRadiusKm(sn), sn.id).toBeGreaterThan(sn.id === 'sn-1181' ? 0.8 : 0.95);
      expect(r / remnantRadiusKm(sn), sn.id).toBeLessThan(1.05);
      for (const years of [0.01, 1, 10, 100]) expect(shockRadiusKm(sn, years * 3.156e7), sn.id).toBeLessThanOrEqual(sn.ejectaKmS * years * 3.156e7 * (1 + 1e-12));
    }
    // Tycho's remnant: 4′ at 4 kpc is 4.65 pc.
    expect(remnantRadiusKm(supernovaById('sn-1572')!) / PARSEC_KM).toBeCloseTo(4.65, 2);
  });

  it('grow the Crab’s picture from nothing in 1054 to its full size now', () => {
    const crab = supernovaById('sn-1054')!;
    expect(grownShare(crab, msFromCivil(1054, 6, 1))).toBe(0);
    expect(grownShare(crab, msFromCivil(1500, 1, 1))).toBeGreaterThan(0.4);
    expect(grownShare(crab, msFromCivil(1500, 1, 1))).toBeLessThan(0.5);
    expect(grownShare(crab, msFromCivil(2000, 1, 1))).toBeCloseTo(1, 2);
  });
});

describe('the chirp of GW170817', () => {
  it('has the chirp mass of its masses and spends about 100 s from 24 Hz to the merger', () => {
    expect(SUN_TIME_S).toBeCloseTo(4.9255e-6, 9);
    expect(chirpMass(1.46, 1.27)).toBeCloseTo(1.186, 2);
    // Abbott et al. 2017: about 100 s in band from 24 Hz; the formula with 𝓜 = 1.21 M☉ at 100 Hz gives Maggiore's 2.18 s.
    expect(timeToMergeS(24, MC_DETECTOR_MSUN)).toBeCloseTo(100, -1);
    expect(timeToMergeS(100, 1.21)).toBeCloseTo(2.186, 2);
    // About 2,700 cycles from 30 Hz (Abbott et al. 2019).
    expect(cyclesFrom(30, MC_DETECTOR_MSUN)).toBeGreaterThan(2500);
    expect(cyclesFrom(30, MC_DETECTOR_MSUN)).toBeLessThan(2800);
  });

  it('inverts frequency and time, and its phase rate is the frequency', () => {
    for (const tau of [0.01, 1, 100, 1e5]) expect(timeToMergeS(gwFrequencyHz(tau, 1.2), 1.2)).toBeCloseTo(tau, 6);
    const tau = 10;
    const h = 1e-4;
    const rate = (gwPhase(tau - h, 1.2) - gwPhase(tau + h, 1.2)) / (2 * h);
    expect(rate / (2 * Math.PI)).toBeCloseTo(gwFrequencyHz(tau, 1.2), 4);
  });

  it('brings the stars together by Kepler’s law: 400 km apart at 24 Hz, touching about a millisecond before the end', () => {
    expect(separationKm(24, 2.73)).toBeCloseTo(400, -1);
    expect(frequencyAtSeparationHz(separationKm(300, 2.73), 2.73)).toBeCloseTo(300, 8);
    const a = inspiralAt(MERGER_MS - 60_000);
    expect(a.merged).toBe(false);
    expect(a.r1Km + a.r2Km).toBeCloseTo(a.separationKm, 9);
    expect(a.r1Km).toBeLessThan(a.r2Km); // the heavier star nearer the centre of mass
    expect(inspiralAt(MERGER_MS - 0.5).merged).toBe(true);
  });
});

describe('the kilonova AT 2017gfo', () => {
  it('peaks near M_V = −16 at half a day, as Drout et al. measured (−16.04 ± 0.23)', () => {
    const k = kilonovaAt(MERGER_MS + 0.5 * DAY);
    expect(k.absV).toBeGreaterThan(-16.5);
    expect(k.absV).toBeLessThan(-15.6);
    // About magnitude 17 from Earth: far below the naked eye's limit.
    expect(k.vmag).toBeGreaterThan(16.5);
    expect(k.vmag).toBeLessThan(17.6);
  });

  it('is blue, then red: 10,000 K at half a day, under 4,000 K by two and a half days, and fades', () => {
    expect(kilonovaAt(MERGER_MS + 0.5 * DAY).teffK).toBeCloseTo(10266, 0);
    expect(kilonovaAt(MERGER_MS + 2.5 * DAY).teffK).toBeLessThan(4000);
    expect(kilonovaAt(MERGER_MS + 5 * DAY).absV).toBeGreaterThan(kilonovaAt(MERGER_MS + 1 * DAY).absV + 3);
    expect(kilonovaAt(MERGER_MS - DAY).lErgS).toBe(0);
  });

  it('sees the Sun in V as it should: a 5,772 K blackbody’s share is 1, a cool one’s much less', () => {
    expect(vShareRelSun(5772)).toBeCloseTo(1, 12);
    expect(vShareRelSun(2500)).toBeLessThan(0.3);
    expect(vMagnitudeOf(3.828e33, 5772)).toBeCloseTo(4.81, 6);
  });

  it('sits where the gravitational-wave catalogue places GW170817', () => {
    const file = JSON.parse(new TextDecoder().decode(gunzipFile('public/data/deepsky/gw-events.json.gz'))) as { columns: string[]; rows: unknown[][] };
    const row = file.rows.find((r) => r[0] === 'GW170817')!;
    const col = (n: string) => row[file.columns.indexOf(n)] as number;
    expect([col('x'), col('y'), col('z3')]).toEqual([...GW170817_POS_MPC]);
  });
});

describe('relativistic beaming', () => {
  it('has the textbook Doppler factors', () => {
    expect(dopplerFactor(0, 1)).toBe(1);
    // Head on: √((1 + β)/(1 − β)).
    expect(dopplerFactor(0.6, 0)).toBeCloseTo(2, 12);
    // Side on: 1/Γ.
    expect(dopplerFactor(0.6, Math.PI / 2)).toBeCloseTo(0.8, 12);
    expect(lorentz(betaOf(6))).toBeCloseTo(6, 12);
  });

  it('makes a jet and its counter-jet differ by ((1 + β cos θ)/(1 − β cos θ))^(2+α)', () => {
    const beta = 0.85;
    const th = (17 * Math.PI) / 180;
    const r = jetCounterJetRatio(beta, th, 0.9);
    expect(r).toBeCloseTo(beamingBoost(beta, th, 0.9) / beamingBoost(beta, Math.PI - th, 0.9), 6);
    // M87's kpc jet: over 450 times brighter than its counter-jet (Stiavelli et al. 1992).
    expect(r).toBeGreaterThan(450);
  });

  it('turns HST-1’s 6.1c on the sky at 17° into Γ ≈ 11 (Walker et al. 2018)', () => {
    const th = (17 * Math.PI) / 180;
    const b = betaFromApparent(6.1, th);
    expect(apparentSpeed(b, th)).toBeCloseTo(6.1, 10);
    expect(lorentz(b)).toBeCloseTo(10.9, 0);
  });
});

describe('the jets', () => {
  it('puts M87’s knots as Hubble sees them and as bright as measured from Earth', () => {
    const blobs = m87JetBlobs([1, 1, 1]);
    const a = blobs[M87_KNOTS.findIndex((k) => k.name === 'A')];
    // Knot A: 12.43″ from the core on the sky, at position angle 290°.
    const sky = Math.hypot(a.pos[0], a.pos[1]) * 1000;
    expect(sky / ((16.8e6 / 206_264.806))).toBeCloseTo(12.43, 2);
    expect((Math.atan2(a.pos[0], a.pos[1]) * 180) / Math.PI + 360).toBeCloseTo(290, 6);
    // Its light from Earth is its flux (1,086 µJy, V ≈ 16.3); from Earth no beaming is added.
    expect(abMagnitude(1086)).toBeCloseTo(16.31, 2);
    expect(beamingFrom(a, [0, 0, 1])).toBeCloseTo(1, 12);
    // From straight down the jet it is brighter still, from the side over a hundred times fainter; the counter-jet faint from Earth.
    expect(beamingFrom(a, a.axis)).toBeGreaterThan(1.5);
    const side = [a.axis[1], -a.axis[0], 0].map((v) => v / Math.hypot(a.axis[0], a.axis[1]));
    expect(beamingFrom(a, side)).toBeLessThan(0.01);
    const counter = blobs[blobs.length / 2 + M87_KNOTS.findIndex((k) => k.name === 'A')];
    expect(a.lumEarth / counter.lumEarth).toBeGreaterThan(450);
  });

  it('lays Centaurus A’s jet at position angle 55° and its giant lobes about 600 kpc from end to end', () => {
    const blobs = cenABlobs([1, 1, 1], [1, 1, 1]);
    const d = skyDirection(55, 50);
    expect(blobs[0].axis).toEqual(d);
    const north = blobs[blobs.length - 2];
    const south = blobs[blobs.length - 1];
    const span = Math.hypot(north.pos[0] - south.pos[0], north.pos[1] - south.pos[1]) + 2 * (north.sigAlong + south.sigAlong);
    expect(span).toBeGreaterThan(450);
    expect(span).toBeLessThan(700);
  });
});

describe('the aurora', () => {
  it('puts the geomagnetic pole where NOAA puts it: 80.59° N 72.68° W in 2020, 80.79° N 72.76° W in 2025 (geocentric)', () => {
    const p20 = geomagneticPole(2020);
    expect(p20.latDeg).toBeCloseTo(80.59, 2);
    expect(p20.lonDeg).toBeCloseTo(-72.68, 2);
    const p25 = geomagneticPole(2025);
    expect(p25.latDeg).toBeCloseTo(80.79, 2);
    expect(p25.lonDeg).toBeCloseTo(-72.76, 2);
    // 1900 and before: held at 1900's (78.61° N 68.79° W).
    expect(geomagneticPole(1054).latDeg).toBeCloseTo(78.61, 2);
    expect(dipoleAt(2027.5)[0]).toBeCloseTo(-29350 + 2.5 * 12.6, 9);
  });

  it('turns Kp into AL as Starkov does, and gives the oval at Kp 3 as Sigernes et al. evaluate it', () => {
    expect(alFromKp(3)).toBeCloseTo(171.9, 6);
    // Midnight: 63.8°–71.9°; noon: 73.3°–75.7° geomagnetic latitude.
    expect(90 - edgeColatitude('equatorward', 3, 0)).toBeCloseTo(63.77, 1);
    expect(90 - edgeColatitude('poleward', 3, 0)).toBeCloseTo(71.89, 1);
    expect(90 - edgeColatitude('equatorward', 3, 12)).toBeCloseTo(73.34, 1);
    expect(90 - edgeColatitude('poleward', 3, 12)).toBeCloseTo(75.71, 1);
    // A storm pushes it towards the equator at midnight (Kp 7: 59.9°).
    expect(90 - edgeColatitude('equatorward', 7, 0)).toBeCloseTo(59.9, 0);
  });

  it('measures magnetic local time from the Sun: noon under it, midnight opposite, dusk to the east', () => {
    const m = [0, 0, 1];
    const sun = [1, 0, 0];
    expect(magneticLocalTime([1, 0, 0], m, sun)).toBeCloseTo(12, 12);
    expect(magneticLocalTime([-1, 0, 0], m, sun)).toBeCloseTo(0, 12);
    // East of the noon meridian (towards +y about +z) is the afternoon and dusk.
    expect(magneticLocalTime([0, 1, 0], m, sun)).toBeCloseTo(18, 12);
    expect(magneticLocalTime([0, -1, 0], m, sun)).toBeCloseTo(6, 12);
  });

  it('builds the shader’s table, its arcs strongest before midnight, and colours and brightnesses of the lines', () => {
    const t = ovalTable(3, 48);
    expect(t.length).toBe(192);
    for (let i = 0; i < 48; i++) expect(t[4 * i]).toBeLessThan(t[4 * i + 1]);
    expect(arcStrength(22)).toBeCloseTo(1, 12);
    expect(arcStrength(10)).toBeLessThan(0.4);
    expect(fluxPerKr(557.7)).toBeGreaterThan(60);
    expect(fluxPerKr(557.7)).toBeLessThan(90);
    expect(fluxPerKr(630) / fluxPerKr(557.7)).toBeLessThan(0.35);
    const g = lineColour(557.7);
    expect(g[1]).toBeGreaterThan(g[0]);
    expect(g[1]).toBeGreaterThan(g[2]);
    const r = lineColour(630);
    expect(r[0]).toBeGreaterThan(r[1]);
    expect(auroraBrightness(3).greenKr).toBeGreaterThan(auroraBrightness(1).greenKr);
    // Storms: brighter arcs only up to a soft limit, the red share held at Kp 3's; Kp 3 itself as before.
    expect(auroraBrightness(3).greenKr).toBeCloseTo(3 * 10 ** 0.6, 9);
    expect(auroraBrightness(5).greenKr).toBeGreaterThan(auroraBrightness(3).greenKr);
    expect(auroraBrightness(5).greenKr).toBeLessThan(auroraBrightness(9).greenKr);
    expect(auroraBrightness(9).greenKr).toBeLessThan(30);
    expect(auroraBrightness(9).redShare).toBeCloseTo(auroraBrightness(3).redShare, 12);
  });
});
