import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  HOMUNCULUS_BIRTH_YR,
  HOMUNCULUS_SHAPE,
  homunculusAxis,
  homunculusRadiusAu,
  homunculusScale,
  homunculusSpeedKms,
  wr104ArmAngleDeg,
  wr104CoilAu,
  wr104Frame,
  wr104SpeedAuPerDay,
  wr104StandoffAu,
  WR104_EPOCH_JD,
  WR104_PERIOD_D,
} from './stellarNebulae';
import { raDecToWorld } from '../frames';

const DEG = Math.PI / 180;
/** Eta Carinae and WR 104 on the sky (SIMBAD / Gaia DR3), deg. */
const ETA = raDecToWorld(161.265, -59.6845);
const WR104 = raDecToWorld(270.5172, -23.6284);

describe('the Homunculus (Smith 2006, Table 1)', () => {
  it('has the measured shape: 2,100 au at the equator, widest short of the pole, 21,690 au at the pole', () => {
    expect(HOMUNCULUS_SHAPE).toHaveLength(47);
    expect(homunculusRadiusAu(0)).toBe(2100);
    expect(homunculusRadiusAu(89.1)).toBe(21_690);
    expect(Math.max(...HOMUNCULUS_SHAPE.map((r) => r[1]))).toBe(22_014);
    // Interpolated between rows, and symmetric about the equator.
    expect(homunculusRadiusAu(1)).toBeCloseTo((2100 + 2349) / 2, 6);
    expect(homunculusRadiusAu(-45.5)).toBe(homunculusRadiusAu(45.5));
  });
  it('expands as a Hubble flow from 1845: Smith’s speeds are the radii over 160 years', () => {
    // Table 1 lists 648 km/s at the pole and 62 km/s at the equator (Smith converts at 33.5 au per km/s, 1% off 160 years).
    expect(Math.abs(homunculusSpeedKms(21_690) - 648) / 648).toBeLessThan(0.01);
    expect(homunculusSpeedKms(2100)).toBeCloseTo(62, 0);
    expect(homunculusScale(2005.17)).toBeCloseTo(1, 9);
    expect(homunculusScale(HOMUNCULUS_BIRTH_YR - 1)).toBe(0);
    expect(homunculusScale(1925.17)).toBeCloseTo(0.5, 9);
  });
  it('tilts its axis 41° from our line of sight, the south-east lobe towards us', () => {
    const axis = homunculusAxis(ETA);
    const toEarth = ETA.clone().negate();
    expect(Math.acos(axis.dot(toEarth)) / DEG).toBeCloseTo(41, 6);
    // South-east: below the celestial equator's direction and towards increasing RA… on our sky.
    const south = raDecToWorld(161.265, -60.6845).sub(ETA);
    const east = raDecToWorld(162.265, -59.6845).sub(ETA);
    expect(axis.dot(south)).toBeGreaterThan(0);
    expect(axis.dot(east)).toBeGreaterThan(0);
  });
});

describe('WR 104’s pinwheel (Tuthill et al. 2008)', () => {
  it('expands 0.28 mas a day at 2.6 kpc: 1,260 km/s, 176 au between coils, dust from 35 au', () => {
    expect((wr104SpeedAuPerDay() * 149_597_870.7) / 86_400).toBeCloseTo(1261, -1);
    expect(wr104CoilAu()).toBeCloseTo(175.8, 1);
    expect(wr104StandoffAu()).toBeCloseTo(34.58, 2);
  });
  it('is an Archimedean spiral: a turn of angle per coil outwards, at 269° at the standoff on 1998 April 14', () => {
    const r0 = wr104StandoffAu();
    expect(wr104ArmAngleDeg(r0, WR104_EPOCH_JD)).toBeCloseTo(269, 9);
    expect(wr104ArmAngleDeg(r0 + wr104CoilAu(), WR104_EPOCH_JD)).toBeCloseTo(269, 9);
    expect(wr104ArmAngleDeg(r0 + 0.25 * wr104CoilAu(), WR104_EPOCH_JD)).toBeCloseTo(359, 9);
  });
  it('turns clockwise on the sky once in 241.5 days', () => {
    const r0 = wr104StandoffAu();
    expect(wr104ArmAngleDeg(r0, WR104_EPOCH_JD + WR104_PERIOD_D)).toBeCloseTo(269, 6);
    // A quarter period later the arm's position angle has fallen by 90°.
    expect(wr104ArmAngleDeg(r0, WR104_EPOCH_JD + WR104_PERIOD_D / 4)).toBeCloseTo(179, 6);
  });
  it('lies within 12° of the sky’s plane, its frame orthonormal', () => {
    const f = wr104Frame(WR104);
    const toEarth = WR104.clone().negate();
    // The normal points away from us (tilted 12° from straight away).
    expect(Math.acos(f.normal.dot(toEarth.clone().negate())) / DEG).toBeCloseTo(12, 6);
    for (const v of [f.north, f.east, f.normal]) expect(v.length()).toBeCloseTo(1, 9);
    expect(f.north.dot(f.east)).toBeCloseTo(0, 9);
    expect(f.north.dot(f.normal)).toBeCloseTo(0, 9);
    // On our sky north turns into east counter-clockwise, a positive turn about the direction towards us: north × east
    // points at us, against the normal. Clockwise on the sky is then a positive turn about the normal.
    expect(new Vector3().crossVectors(f.north, f.east).dot(f.normal)).toBeLessThan(-0.99);
  });
});
