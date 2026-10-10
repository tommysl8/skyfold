/**
 * SGP4's frame, TEME (true equator, mean equinox of date), to the app's frames.
 *
 * TEME's x axis is the mean equinox measured along the true equator of date, so it differs from the true equator
 * and equinox of date (astronomy-engine's EQD) by a turn about the pole of the equation of the equinoxes,
 * Δψ cos ε (at most about 1.2″): r_EQD = R_z(+Δψ cos ε) r_TEME (Vallado et al. 2006, §B; Vallado 2013, §3.7).
 * astronomy-engine then takes EQD to J2000 (precession and IAU 2000B nutation), and frames.ts's J2000 obliquity
 * to the ecliptic. `temeToEcliptic` holds the product as one matrix for a moment, cached by time, so a frame's
 * satellites cost one 3 × 3 product each.
 */
import { e_tilt, Rotation_EQD_EQJ, type AstroTime } from 'astronomy-engine';
import { OBLIQUITY_J2000_DEG } from '../../physics/constants';
import { gstime } from './sgp4';

const EPS = (OBLIQUITY_J2000_DEG * Math.PI) / 180;
const COS_E = Math.cos(EPS);
const SIN_E = Math.sin(EPS);

/** Row-major 3 × 3: out = M · v. */
export type Mat3 = Float64Array;

let cachedTt = NaN;
const cached = new Float64Array(9);

/**
 * The rotation from TEME of `time` to the J2000 ecliptic (row-major, out = M · v), cached for the last time asked.
 * Allocates only when the time changes (astronomy-engine's matrix).
 */
export function temeToEcliptic(time: AstroTime, out: Mat3 = new Float64Array(9)): Mat3 {
  if (time.tt !== cachedTt) {
    const ee = (e_tilt(time).ee * 15 * Math.PI) / (180 * 3600); // equation of the equinoxes, rad
    const c = Math.cos(ee);
    const s = Math.sin(ee);
    // astronomy-engine's convention: v′ᵢ = Σⱼ rot[j][i] vⱼ.
    const q = Rotation_EQD_EQJ(time).rot;
    for (let col = 0; col < 3; col++) {
      // Column `col` of R_z(ee): the TEME basis vector it maps to in EQD.
      const ex = col === 0 ? c : col === 1 ? -s : 0;
      const ey = col === 0 ? s : col === 1 ? c : 0;
      const ez = col === 2 ? 1 : 0;
      // EQD → EQJ
      const jx = q[0][0] * ex + q[1][0] * ey + q[2][0] * ez;
      const jy = q[0][1] * ex + q[1][1] * ey + q[2][1] * ez;
      const jz = q[0][2] * ex + q[1][2] * ey + q[2][2] * ez;
      // EQJ → J2000 ecliptic
      cached[col] = jx;
      cached[3 + col] = COS_E * jy + SIN_E * jz;
      cached[6 + col] = -SIN_E * jy + COS_E * jz;
    }
    cachedTt = time.tt;
  }
  out.set(cached);
  return out;
}

/** out = M · (x, y, z). */
export function applyMat3(m: Mat3, x: number, y: number, z: number, out: { x: number; y: number; z: number }): void {
  out.x = m[0] * x + m[1] * y + m[2] * z;
  out.y = m[3] * x + m[4] * y + m[5] * z;
  out.z = m[6] * x + m[7] * y + m[8] * z;
}

/** Minutes from a GP element set's epoch (Julian date, UTC) to `time` (astronomy-engine's `ut` is UTC days since J2000). */
export const minutesSinceEpoch = (time: AstroTime, epochJd: number): number => (time.ut + 2451545 - epochJd) * 1440;

/** WGS-84 ellipsoid, for ground points. */
const WGS84_A = 6378.137;
const WGS84_F = 1 / 298.257223563;

/**
 * Geodetic latitude, longitude (degrees, east positive) and height (km) of a TEME position at `jdUt1`, the usual
 * way for SGP4 (Vallado 2013, alg. 12): through the pseudo-Earth-fixed frame with SGP4's own sidereal time, polar
 * motion ignored. The tests compare it with the app's chain (temeToEcliptic and astronomy-engine's Earth).
 */
export function temeToGeodetic(r: ArrayLike<number>, jdUt1: number): { latDeg: number; lonDeg: number; heightKm: number } {
  const g = gstime(jdUt1);
  const x = Math.cos(g) * r[0] + Math.sin(g) * r[1];
  const y = -Math.sin(g) * r[0] + Math.cos(g) * r[1];
  const z = r[2];
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  const e2 = WGS84_F * (2 - WGS84_F);
  let lat = Math.atan2(z, p * (1 - e2));
  let h = 0;
  for (let i = 0; i < 6; i++) {
    const sl = Math.sin(lat);
    const n = WGS84_A / Math.sqrt(1 - e2 * sl * sl);
    h = p / Math.cos(lat) - n;
    lat = Math.atan2(z, p * (1 - (e2 * n) / (n + h)));
  }
  return { latDeg: (lat * 180) / Math.PI, lonDeg: (lon * 180) / Math.PI, heightKm: h };
}
