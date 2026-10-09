/**
 * Two nebulae made by stars, as 3D models built from their measured geometry (scene/StellarNebulae.tsx draws them;
 * docs/data/stars.md §13.5):
 *
 *  - the Homunculus round Eta Carinae, thrown off in the Great Eruption of the 1840s: two polar lobes whose radius at
 *    each latitude is Smith's (2006, ApJ 644, 1151, Table 1) model shape from the Doppler shifts of its molecular
 *    hydrogen skin, about 21,700 au from pole to centre in 2005, an age of 160 years. The flow is a Hubble flow
 *    (each part moving at a constant speed from one moment), so the shape grows in proportion to the time since then;
 *  - the dust spiral of WR 104 (Tuthill et al. 2008, ApJ 675, 698): an Archimedean spiral turning once every
 *    241.5 ± 0.5 days and expanding at 0.28 ± 0.02 mas a day, its dust starting 13.3 mas from the centre, seen within
 *    16° of face on, at 2.6 kpc.
 */
import { Vector3 } from 'three';
import { poleFromDirection } from './closeup';

const AU_KM = 149_597_870.7;


// ─── The Homunculus ─────────────────────────────────────────────────────────────────────

/**
 * Smith (2006) Table 1: latitude (deg, from the equator) and radius from the star (au) of the outer H₂ shell, for a
 * distance of 2,350 pc and an age of 160 years in March 2005.
 */
export const HOMUNCULUS_SHAPE: readonly (readonly [number, number])[] = [
  [0.0, 2100], [2.0, 2349], [4.0, 2997], [8.6, 3709], [13.9, 4365], [18.7, 4961], [21.9, 5608], [25.3, 6276],
  [28.6, 6858], [31.6, 7422], [34.2, 7999], [36.5, 8654], [38.7, 9259], [40.7, 9935], [42.1, 10545], [43.9, 11200],
  [45.5, 11880], [46.8, 12487], [48.3, 13156], [49.4, 13823], [50.5, 14472], [51.6, 15044], [52.6, 15622],
  [53.8, 16275], [54.7, 16886], [55.8, 17503], [56.9, 18097], [58.1, 18716], [59.1, 19255], [60.2, 19779],
  [61.4, 20374], [62.9, 20898], [64.3, 21323], [65.9, 21641], [67.7, 21906], [69.5, 22014], [71.3, 22012],
  [73.1, 22001], [74.9, 21967], [76.6, 21932], [78.3, 21892], [79.9, 21873], [81.8, 21833], [83.8, 21774],
  [85.6, 21730], [87.3, 21711], [89.1, 21690],
];

/** Smith's (2006) observations were in March 2005 (2005.17), when he puts the nebula's age at 160 years. */
export const HOMUNCULUS_EPOCH_YR = 2005.17;
export const HOMUNCULUS_AGE_YR = 160;
/** The year the Hubble flow started from: 1845.2. */
export const HOMUNCULUS_BIRTH_YR = HOMUNCULUS_EPOCH_YR - HOMUNCULUS_AGE_YR;
/** The skin's thickness is about an eighth of its radius (Smith 2006 §3). */
export const HOMUNCULUS_THICKNESS = 1 / 8;
/** Its axis: tilted 41° ± 0.5° from our line of sight, the south-east lobe towards us at position angle 130° (Smith 2006). */
export const HOMUNCULUS_INCLINATION_DEG = 41;
export const HOMUNCULUS_NEAR_LOBE_PA_DEG = 130;

/** How big the Homunculus is at a year, relative to 2005 (0 before 1845.2: it had not been thrown off yet). */
export const homunculusScale = (year: number): number => Math.max(0, (year - HOMUNCULUS_BIRTH_YR) / HOMUNCULUS_AGE_YR);

/** The expansion speed at a latitude, km/s: its 2005 radius over 160 years (Smith's Table 1 lists the same). */
export const homunculusSpeedKms = (radiusAu: number): number => (radiusAu * AU_KM) / (HOMUNCULUS_AGE_YR * 365.25 * 86_400);

/** The lobe's radius (au, in 2005) at a latitude (deg; symmetric about the equator), interpolated in Table 1. */
export function homunculusRadiusAu(latDeg: number): number {
  const lat = Math.min(90, Math.abs(latDeg));
  const t = HOMUNCULUS_SHAPE;
  if (lat >= t[t.length - 1][0]) return t[t.length - 1][1];
  let i = 0;
  while (t[i + 1][0] < lat) i++;
  const f = (lat - t[i][0]) / (t[i + 1][0] - t[i][0]);
  return t[i][1] + f * (t[i + 1][1] - t[i][1]);
}

/** The near (south-east) lobe's axis in world axes, from the star's direction from the Sun. */
export const homunculusAxis = (dirWorld: Readonly<Vector3>): Vector3 => poleFromDirection(dirWorld, HOMUNCULUS_INCLINATION_DEG, HOMUNCULUS_NEAR_LOBE_PA_DEG);

// ─── WR 104's pinwheel ──────────────────────────────────────────────────────────────────

/** Tuthill et al. (2008): the spiral's period, days; its angular expansion, mas a day; the distance they derive, pc. */
export const WR104_PERIOD_D = 241.5;
export const WR104_EXPANSION_MAS_PER_D = 0.28;
export const WR104_DISTANCE_PC = 2600;
/** Where the dust begins: 13.3 mas from the spiral's centre. */
export const WR104_STANDOFF_MAS = 13.3;
/** The spiral's position angle at their first epoch, 1998 April 14 (JD 2450918), deg; it turns clockwise on the sky. */
export const WR104_PA0_DEG = 269;
export const WR104_EPOCH_JD = 2_450_918;
/** Inclination of the spiral's plane to the sky (best fit 12°, 0–16° at 1σ) and the position angle of that tilt, deg. */
export const WR104_INCLINATION_DEG = 12;
export const WR104_TILT_PA_DEG = 84;

/** The outflow speed the expansion implies at the distance, au a day: 0.28 mas/d × 2.6 kpc = 0.73 au/d (1,260 km/s). */
export const wr104SpeedAuPerDay = (distancePc = WR104_DISTANCE_PC): number => (WR104_EXPANSION_MAS_PER_D / 1000) * distancePc;
/** The distance between successive coils, au: the speed times the period (176 au; Tuthill et al. quote 170). */
export const wr104CoilAu = (distancePc = WR104_DISTANCE_PC): number => wr104SpeedAuPerDay(distancePc) * WR104_PERIOD_D;
/** Where the dust begins, au. */
export const wr104StandoffAu = (distancePc = WR104_DISTANCE_PC): number => (WR104_STANDOFF_MAS / 1000) * distancePc;

/**
 * The position angle on the sky (deg, east of north, in [0, 360)) of the spiral's arm at radius r (au) at a date
 * (JD): an Archimedean spiral, the angle growing by a full turn per coil outwards, the whole pattern turning
 * clockwise (position angle falling) once a period.
 */
export function wr104ArmAngleDeg(rAu: number, jd: number, distancePc = WR104_DISTANCE_PC): number {
  const turns = (jd - WR104_EPOCH_JD) / WR104_PERIOD_D;
  const out = (rAu - wr104StandoffAu(distancePc)) / wr104CoilAu(distancePc);
  const a = WR104_PA0_DEG - 360 * turns + 360 * out;
  return ((a % 360) + 360) % 360;
}

/**
 * The spiral's frame in world axes: its plane's normal (pointing away from us, so the pattern turns
 * counter-clockwise about it and clockwise as we see it), and the in-plane directions of north and east on our sky.
 */
export function wr104Frame(dirWorld: Readonly<Vector3>): { normal: Vector3; north: Vector3; east: Vector3 } {
  const normal = poleFromDirection(dirWorld, WR104_INCLINATION_DEG, WR104_TILT_PA_DEG).negate();
  // North and east on our sky at the star (position angles 0° and 90° across the line of sight), into the plane.
  const north = poleFromDirection(dirWorld, 90, 0);
  north.addScaledVector(normal, -north.dot(normal)).normalize();
  const east = poleFromDirection(dirWorld, 90, 90);
  east.addScaledVector(normal, -east.dot(normal)).addScaledVector(north, -east.dot(north)).normalize();
  return { normal, north, east };
}

