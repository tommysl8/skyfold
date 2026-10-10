/**
 * Where a CME goes, in the app's world frame (sim/frames.ts), from the direction a catalogue gives
 * (docs/data/space-weather.md §2). Pure; plain arrays, so the build script can use it too.
 *
 * DONKI's CME analyses give the direction of the CME's axis in Stonyhurst heliographic coordinates (Thompson 2006,
 * A&A 449, 791): latitude from the Sun's equator, longitude from the central meridian as seen from Earth, positive to
 * the west (the limb on the right as seen from Earth, the way Earth moves along its orbit). That is the heliocentric
 * Earth equatorial frame: x towards Earth projected on the Sun's equator, z the Sun's rotation axis, y = z × x.
 * The Sun's north pole: RA 286.13°, Dec 63.87° (J2000; Archinal et al. 2018, Celest. Mech. Dyn. Astr. 130, 22).
 */
import { OBLIQUITY_J2000_DEG } from '../../physics/constants.ts';

export type Vec3 = [number, number, number];

const D = Math.PI / 180;

/** J2000 equatorial → world (x, ecliptic north, −ecliptic y), as sim/frames.ts eqjToWorld. */
export function eqjToWorldArr(x: number, y: number, z: number): Vec3 {
  const e = OBLIQUITY_J2000_DEG * D;
  const ye = Math.cos(e) * y + Math.sin(e) * z;
  const ze = -Math.sin(e) * y + Math.cos(e) * z;
  return [x, ze, -ye];
}

/** The Sun's rotation axis, world. */
export const SUN_POLE: Vec3 = eqjToWorldArr(Math.cos(63.87 * D) * Math.cos(286.13 * D), Math.cos(63.87 * D) * Math.sin(286.13 * D), Math.sin(63.87 * D));

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: readonly number[]): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * The unit direction (world) of Stonyhurst latitude and longitude (degrees, west positive), for Earth's heliocentric
 * position `earth` (world, any length) at the time.
 */
export function stonyhurstToWorld(latDeg: number, lonDeg: number, earth: readonly number[]): Vec3 {
  const z = SUN_POLE;
  const ez = dot(earth, z);
  const x = norm([earth[0] - ez * z[0], earth[1] - ez * z[1], earth[2] - ez * z[2]]);
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const cl = Math.cos(latDeg * D);
  const a = cl * Math.cos(lonDeg * D);
  const b = cl * Math.sin(lonDeg * D);
  const c = Math.sin(latDeg * D);
  return norm([a * x[0] + b * y[0] + c * z[0], a * x[1] + b * y[1] + c * z[1], a * x[2] + b * y[2] + c * z[2]]);
}

/** The angle between two directions, radians. */
export function angleBetween(a: readonly number[], b: readonly number[]): number {
  const c = dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));
  return Math.acos(Math.min(1, Math.max(-1, c)));
}

/** A world direction as ecliptic longitude and latitude, degrees (world = (x, ecliptic z, −ecliptic y)). */
export function worldToEclipticDeg(v: readonly number[]): { lonDeg: number; latDeg: number } {
  const l = Math.hypot(v[0], v[1], v[2]);
  let lon = Math.atan2(-v[2], v[0]) / D;
  if (lon < 0) lon += 360;
  return { lonDeg: lon, latDeg: Math.asin(v[1] / l) / D };
}

/** Ecliptic longitude and latitude (degrees) → a unit world direction. */
export function eclipticDegToWorld(lonDeg: number, latDeg: number): Vec3 {
  const cl = Math.cos(latDeg * D);
  return [cl * Math.cos(lonDeg * D), Math.sin(latDeg * D), -cl * Math.sin(lonDeg * D)];
}
