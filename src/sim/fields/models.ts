/**
 * The bodies' magnetic fields (docs/data/fields.md §2–3): each one's model, its coefficients quoted from the paper
 * with its citation, the frame they are in, the surface the lines start on, and its magnetopause.
 *
 *  - Mercury: MESSENGER's axisymmetric offset dipole (Anderson et al. 2012, J. Geophys. Res. 117, E00L12): g₁⁰ = −190,
 *    g₂⁰ = −74.6, g₃⁰ = −22.0, g₄⁰ = −5.7 nT at R_M = 2,440 km, a dipole 479 km north of the centre written as
 *    zonal terms (g_n⁰ = n (d/R)^(n−1) g₁⁰).
 *  - Earth: IGRF-14 to degree 13 at the date (sim/fields/earth.ts), a = 6,371.2 km, geographic (the app's Earth turns
 *    by Greenwich).
 *  - Jupiter: JRM33 (Connerney et al. 2022, J. Geophys. Res. Planets 127, e2021JE007055) to degree 13, as the authors
 *    recommend (Wilson et al. 2023's community code), from the paper's supporting file SI-S02; System III (1965),
 *    right-handed, R_J = 71,492 km. The app's Jupiter turns by the IAU's System III.
 *  - Saturn: Cassini 11+ (Cao et al. 2020, Icarus 344, 113541, table 5), axisymmetric to degree 14 from the Grand
 *    Finale orbits, R_S = 60,268 km; its dipole is tilted less than 0.007°.
 *  - Uranus: AH5 (Herbert 2009, J. Geophys. Res. 114, A11206) to degree 4, in the Uranian Longitude System of Ness
 *    et al. 1986: right-handed, its z along the spin (the IAU's south pole), placed in the IAU frame as NAIF's frame
 *    kernel vg2_uls_v01.tf does (180° about x, then −226.46° about z; Lamy et al. 2017), R_U = 25,559 km.
 *  - Neptune: O8 (Connerney, Acuña & Ness 1991, J. Geophys. Res. 96, 19023) to degree 3, R_N = 24,765 km, in the
 *    Neptune longitude system of Voyager 2's radio period, taken here as the IAU's.
 *  - Ganymede: its permanent dipole (Kivelson, Khurana & Volwerk 2002, Icarus 157, 507): 719 nT at the equator, the
 *    axis 176° from the spin axis with its southern end turned 24° from the sub-Jovian meridian towards the trailing
 *    side; R_G = 2,631 km. (The part induced by Jupiter's changing field is left out.)
 *
 * Uranus's and Neptune's longitudes rest on Voyager 2's rotation periods (17.24 ± 0.01 h and 16.11 h), uncertain by
 * about 100° a year since: the shape of their fields is measured, how they are turned at a date today is not.
 */
import { fromRows, type Harmonics } from './harmonics';
import { arridge2006, scaledStandoff, shue1998, windPressure, type Magnetopause } from './magnetopause';
import { earthCoefficients } from './earth';

/** A 3 × 3 matrix, row-major: model frame → the app's body-fixed frame. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/**
 * The app's body-fixed frame (sim/bodies/rotation.ts): +x the prime meridian, +y the north pole, −z longitude 90° E.
 * A model's frame (z north, x the prime meridian, y 90° E) maps to it as (x, y, z) → (x, z, −y).
 */
export const IAU_TO_BODY: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];

export const mul3 = (a: Mat3, b: Mat3): Mat3 => {
  const o: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]);
  return o as unknown as Mat3;
};

/**
 * The Uranian Longitude System in IAU_URANUS axes (NAIF vg2_uls_v01.tf): ULS z = −z_IAU; ULS x at IAU longitude
 * 226.46°, ULS y at 136.46°. Columns are the ULS axes.
 */
const A_ULS = (226.46 * Math.PI) / 180;
export const ULS_TO_IAU: Mat3 = [Math.cos(A_ULS), Math.sin(A_ULS), 0, Math.sin(A_ULS), -Math.cos(A_ULS), 0, 0, 0, -1];

export interface FieldModel {
  /** The body's id in the registry. */
  id: string;
  /** The model's name and its paper, for the card ("JRM33 (Connerney et al. 2022)"). */
  model: string;
  cite: string;
  doi: string;
  /** Reference radius, km. */
  radiusKm: number;
  /** The surface lines start and end on: an oblate spheroid of this polar / equatorial ratio (model z). */
  polarRatio: number;
  /** Coefficients, nT (Earth's at the date). */
  coefficients: (year: number) => Harmonics;
  /** Model frame → body frame. */
  toBody: Mat3;
  /** The boundary the lines are cut at, and where the boundary's nose points (the Sun, or for Ganymede upstream). */
  magnetopause: Magnetopause;
  /** Ganymede: the nose faces the plasma flowing past (body frame); otherwise the Sun. */
  noseBody?: readonly [number, number, number];
  /** Drawing limit, radii: on the night side the real field is stretched into a tail (not modelled). */
  limit: number;
}

const fixed = (c: Harmonics) => () => c;

/** JRM33 to degree 13, nT: rows [n, m, g, h] (Connerney et al. 2022, supporting information SI-S02). */
const JRM33: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 410993.4, 0], [1, 1, -71305.9, 20958.4],
  [2, 0, 11796.7, 0], [2, 1, -56972.4, -42549], [2, 2, 48250.2, 20221.5],
  [3, 0, 2799.3, 0], [3, 1, -37488.4, -32890.6], [3, 2, 15396.8, 42518.4], [3, 3, -1489.8, -27397.7],
  [4, 0, -34402, 0], [4, 1, -8080.8, 32452.4], [4, 2, -2440.5, 27438.6], [4, 3, -10848.3, -501.4], [4, 4, -17919.1, -1325.1],
  [5, 0, -18265.7, 0], [5, 1, 4221.8, 45363.1], [5, 2, 16599.5, -826.2], [5, 3, -17345.8, 6000.6], [5, 4, -2544.5, 10568.8], [5, 5, -4987.7, 10091.5],
  [6, 0, -20968, 0], [6, 1, 9887.6, 14016.9], [6, 2, 12192.4, -10119.1], [6, 3, -12548.7, -294.9], [6, 4, 2742.2, 13948.3], [6, 5, 1557.6, -3686.9], [6, 6, 8018.2, 4783.1],
  [7, 0, 59.9, 0], [7, 1, 5366.1, -7654.8], [7, 2, -7099.5, -11398.6], [7, 3, -1533.4, 2171], [7, 4, -7055.7, 5301.6], [7, 5, 3060.6, -6618.1], [7, 6, -2488.3, -1933.8], [7, 7, 3700.8, -5802.9],
  [8, 0, 10849.5, 0], [8, 1, 1323.8, -2297.4], [8, 2, -6952.2, -12833.5], [8, 3, -95, 10019.6], [8, 4, -4746.6, -1725.6], [8, 5, -1301.7, 2387.1], [8, 6, -4284.6, -3237.1], [8, 7, -1436.7, 906.1], [8, 8, -3024.6, -3178.3],
  [9, 0, 8914.4, 0], [9, 1, -3506.7, -7899.6], [9, 2, 288.1, -1328.3], [9, 3, 773.6, 6566.5], [9, 4, 3592.7, -1275.3], [9, 5, -3170.8, 3617.1], [9, 6, 1406.3, -194.8], [9, 7, -1526.6, 1960.3], [9, 8, 1313.3, 956.9], [9, 9, -2314.6, 1831.7],
  [10, 0, -2516.5, 0], [10, 1, 1883.2, -5689.8], [10, 2, 2836.1, 5570.3], [10, 3, 4259.4, -2541.6], [10, 4, 3776.7, -1795.2], [10, 5, 764.4, -217.8], [10, 6, 2112.3, -628.3], [10, 7, 724.8, -1619.6], [10, 8, 2496.3, 454.6], [10, 9, 840.1, -840], [10, 10, 1179.4, 1581.4],
  [11, 0, 1311.6, 0], [11, 1, 3056.9, 549.1], [11, 2, -2060.6, 4527.6], [11, 3, 3550.1, -4223], [11, 4, 589.7, -2761.9], [11, 5, 194.8, -476], [11, 6, -1073.3, -2714.4], [11, 7, -521.7, -1349.2], [11, 8, 685.3, -1649], [11, 9, 350.2, -1471.5], [11, 10, -326.6, -583], [11, 11, 1088.8, -499.8],
  [12, 0, 2300.5, 0], [12, 1, 1688.4, 4204.2], [12, 2, -291.7, 2228], [12, 3, 483.2, -1901.1], [12, 4, -581.9, -1271.2], [12, 5, -818.4, 1073.4], [12, 6, -1095.6, -1111.9], [12, 7, -1987.8, 872.9], [12, 8, 484.5, -837.9], [12, 9, -1473.1, -462.8], [12, 10, -666.5, -22], [12, 11, -755.4, 110.3], [12, 12, -220.8, -712.7],
  [13, 0, 751.5, 0], [13, 1, -456.4, 4125.6], [13, 2, 1160.4, -44], [13, 3, -2307.8, -455.4], [13, 4, -77.1, 2160.6], [13, 5, -16.9, 255.4], [13, 6, 594.8, 1105.1], [13, 7, -950.7, 1214.2], [13, 8, 1042.3, 196.1], [13, 9, -641.8, -207.7], [13, 10, 41.6, 1195.7], [13, 11, -229.1, 472.4], [13, 12, -40.3, 721.6], [13, 13, -287.8, 51.3],
];

/** Cassini 11+, nT (Cao et al. 2020, table 5): g_n⁰ for n = 1 … 14. */
const CASSINI_11P = [21141, 1583, 2262, 95, 10.3, 17.4, -68.8, -15.5, -24.2, 9.0, 11.3, -2.8, -2.4, -0.8];

/** AH5, nT (Herbert 2009, table 2), ULS. */
const AH5: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 11278, 0], [1, 1, 10928, -16049],
  [2, 0, -9648, 0], [2, 1, -12284, 6405], [2, 2, 1453, 4220],
  [3, 0, -1265, 0], [3, 1, 2778, -1548], [3, 2, -4535, -2165], [3, 3, -6297, -3036],
  [4, 0, 3388, 0], [4, 1, -29, -2036], [4, 2, 955, -3437], [4, 3, 5588, -1154], [4, 4, 8136, -2920],
];

/** O8, nT (Connerney, Acuña & Ness 1991, table 2: 0.09732 G and so on). */
const O8: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 9732, 0], [1, 1, 3220, -9889],
  [2, 0, 7448, 0], [2, 1, 664, 11230], [2, 2, 4499, -70],
  [3, 0, -6592, 0], [3, 1, 4098, -3669], [3, 2, -3581, 1791], [3, 3, 484, -770],
];

/** Mercury, nT (Anderson et al. 2012): g_n⁰ for n = 1 … 4. */
const MERCURY = [-190, -74.6, -22.0, -5.7];

/** Ganymede's permanent dipole (Kivelson et al. 2002): B₀ = 719 nT, 176° from the spin axis, 24° towards the trailing side. */
const GANYMEDE_B0 = 719;
const GANYMEDE_TILT = (176 * Math.PI) / 180;
const GANYMEDE_AZ = (24 * Math.PI) / 180;

const zonal = (g: readonly number[]) => fromRows(g.map((v, i) => [i + 1, 0, v, 0] as const));

/** Saturn's magnetopause for the typical wind at its mean distance (Arridge et al. 2006). */
const SATURN_MP = arridge2006(windPressure(9.537));

export const FIELD_MODELS: readonly FieldModel[] = [
  {
    id: 'mercury',
    model: 'MESSENGER offset dipole',
    cite: 'Anderson et al. 2012',
    doi: 'https://doi.org/10.1029/2012JE004159',
    radiusKm: 2440,
    polarRatio: 1,
    coefficients: fixed(zonal(MERCURY)),
    toBody: IAU_TO_BODY,
    magnetopause: { kind: 'shue', r0: 1.45, alpha: 0.5, zOffset: 479 / 2440 },
    limit: 2.9,
  },
  {
    id: 'earth',
    model: 'IGRF-14',
    cite: 'IAGA; Beggan et al. 2026',
    doi: 'https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field',
    radiusKm: 6371.2,
    polarRatio: 6356.752 / 6378.137,
    coefficients: earthCoefficients,
    toBody: IAU_TO_BODY,
    magnetopause: { kind: 'shue', ...shue1998(windPressure(1)) },
    limit: 2 * shue1998(windPressure(1)).r0,
  },
  {
    id: 'jupiter',
    model: 'JRM33',
    cite: 'Connerney et al. 2022',
    doi: 'https://doi.org/10.1029/2021JE007055',
    radiusKm: 71_492,
    polarRatio: 66_854 / 71_492,
    coefficients: fixed(fromRows(JRM33)),
    toBody: IAU_TO_BODY,
    magnetopause: { kind: 'joy', pressure: windPressure(5.203) },
    limit: 160,
  },
  {
    id: 'saturn',
    model: 'Cassini 11+',
    cite: 'Cao et al. 2020',
    doi: 'https://doi.org/10.1016/j.icarus.2019.113541',
    radiusKm: 60_268,
    polarRatio: 54_364 / 60_268,
    coefficients: fixed(zonal(CASSINI_11P)),
    toBody: IAU_TO_BODY,
    magnetopause: { kind: 'shue', ...SATURN_MP },
    limit: 2 * SATURN_MP.r0,
  },
  {
    id: 'uranus',
    model: 'AH5',
    cite: 'Herbert 2009',
    doi: 'https://doi.org/10.1029/2009JA014394',
    radiusKm: 25_559,
    polarRatio: 24_973 / 25_559,
    coefficients: fixed(fromRows(AH5)),
    toBody: mul3(IAU_TO_BODY, ULS_TO_IAU),
    magnetopause: { kind: 'shue', r0: scaledStandoff(22_454, windPressure(19.19)), alpha: 0.5 },
    limit: 2 * scaledStandoff(22_454, windPressure(19.19)),
  },
  {
    id: 'neptune',
    model: 'O8',
    cite: 'Connerney, Acuña & Ness 1991',
    doi: 'https://doi.org/10.1029/91JA01165',
    radiusKm: 24_765,
    polarRatio: 24_341 / 24_764,
    coefficients: fixed(fromRows(O8)),
    toBody: IAU_TO_BODY,
    magnetopause: { kind: 'shue', r0: scaledStandoff(14_243, windPressure(30.07)), alpha: 0.5 },
    limit: 2 * scaledStandoff(14_243, windPressure(30.07)),
  },
  {
    id: 'ganymede',
    model: 'permanent dipole',
    cite: 'Kivelson et al. 2002',
    doi: 'https://doi.org/10.1006/icar.2002.6834',
    radiusKm: 2631.2,
    polarRatio: 1,
    coefficients: fixed(
      fromRows([[1, 0, GANYMEDE_B0 * Math.cos(GANYMEDE_TILT), 0], [1, 1, GANYMEDE_B0 * Math.sin(GANYMEDE_TILT) * Math.cos(GANYMEDE_AZ), GANYMEDE_B0 * Math.sin(GANYMEDE_TILT) * Math.sin(GANYMEDE_AZ)]]),
    ),
    toBody: IAU_TO_BODY,
    // Jupiter's plasma overtakes Ganymede and meets it on its trailing side (90° E: body −z); the boundary stands about
    // 2 R_G upstream (Kivelson et al. 1998).
    magnetopause: { kind: 'shue', r0: 2, alpha: 0.5 },
    noseBody: [0, 0, -1],
    limit: 4,
  },
];

export const fieldModel = (id: string): FieldModel | undefined => FIELD_MODELS.find((m) => m.id === id);
