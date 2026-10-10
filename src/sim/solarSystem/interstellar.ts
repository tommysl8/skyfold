/**
 * The three visitors from other stars, 1I/ʻOumuamua, 2I/Borisov and 3I/ATLAS: their hyperbolic orbits as JPL's
 * Small-Body Database gives them (heliocentric osculating elements, J2000 ecliptic, retrieved 2026-10-09), and what
 * follows from them: the speed each had before the Sun's pull (v∞ = √(GM☉/|a|)) and the direction it came from, the
 * incoming asymptote of its hyperbola (the true anomaly −arccos(−1/e)). The app moves the bodies on their own tracks
 * (fitted to JPL Horizons: docs/data/tracks.md); these elements are for the card's numbers. Pure.
 */
import { GM_SUN_KM3_S2, AU_KM, OBLIQUITY_J2000_DEG } from '../../physics/constants';

export interface Visitor {
  /** JPL's orbit solution (ʻOumuamua's of 2018-06-26, Borisov's of 2024-06-24, 3I/ATLAS's of 2026-02-19). */
  solution: string;
  e: number;
  /** Perihelion distance, au. */
  q: number;
  /** Inclination, longitude of the ascending node and argument of perihelion, degrees. */
  i: number;
  node: number;
  peri: number;
  /** Time of perihelion, Julian date (TDB). */
  tpJd: number;
  /** The constellation its incoming direction lies in, and a guide star near it (for the card). */
  from: string;
}

/** SBDB's elements (sbdb.api, full precision), each with its solution. */
export const VISITORS: Record<'oumuamua' | 'borisov' | 'atlas-3i', Visitor> = {
  oumuamua: {
    solution: '16',
    e: 1.201133796102373,
    q: 0.2559115812959116,
    i: 122.7417062847286,
    node: 24.59690955523242,
    peri: 241.8105360304898,
    tpJd: 2458006.007321375,
    from: 'in Lyra, near Vega',
  },
  borisov: {
    solution: '54',
    e: 3.356475782676596,
    q: 2.006520878500843,
    i: 44.05264247909138,
    node: 308.1477292269942,
    peri: 209.1236864378081,
    tpJd: 2458826.052845906,
    from: 'in Cassiopeia',
  },
  'atlas-3i': {
    solution: '54',
    e: 6.141351449317625,
    q: 1.356481057231181,
    i: 175.1164570850441,
    node: 322.1696089290778,
    peri: 128.0228697185194,
    tpJd: 2460977.995262848,
    from: 'in Sagittarius',
  },
};

export type V3 = { x: number; y: number; z: number };

const DEG = Math.PI / 180;

/** Speed before the Sun's pull, km/s: √(GM☉ / |a|), a = q / (1 − e). */
export function vInfinityKmS(v: Pick<Visitor, 'q' | 'e'>): number {
  const aKm = (v.q / (v.e - 1)) * AU_KM;
  return Math.sqrt(GM_SUN_KM3_S2 / aKm);
}

/**
 * The direction it came from (unit vector, J2000 ecliptic): the incoming asymptote, pointing out from the Sun along
 * the arm of the hyperbola it arrived on, at true anomaly −ν∞ with cos ν∞ = −1/e.
 */
export function incomingDirection(v: Visitor): V3 {
  const w = v.peri * DEG;
  const n = v.node * DEG;
  const inc = v.i * DEG;
  const P = { x: Math.cos(w) * Math.cos(n) - Math.sin(w) * Math.sin(n) * Math.cos(inc), y: Math.cos(w) * Math.sin(n) + Math.sin(w) * Math.cos(n) * Math.cos(inc), z: Math.sin(w) * Math.sin(inc) };
  const Q = { x: -Math.sin(w) * Math.cos(n) - Math.cos(w) * Math.sin(n) * Math.cos(inc), y: -Math.sin(w) * Math.sin(n) + Math.cos(w) * Math.cos(n) * Math.cos(inc), z: Math.cos(w) * Math.sin(inc) };
  const nu = Math.acos(-1 / v.e);
  const c = Math.cos(nu);
  const s = Math.sin(nu);
  return { x: c * P.x - s * Q.x, y: c * P.y - s * Q.y, z: c * P.z - s * Q.z };
}

/** An ecliptic unit vector as right ascension and declination (J2000), degrees. */
export function raDecOf(d: V3): { raDeg: number; decDeg: number } {
  const e = OBLIQUITY_J2000_DEG * DEG;
  const x = d.x;
  const y = Math.cos(e) * d.y - Math.sin(e) * d.z;
  const z = Math.sin(e) * d.y + Math.cos(e) * d.z;
  return { raDeg: ((Math.atan2(y, x) / DEG) % 360 + 360) % 360, decDeg: Math.asin(Math.max(-1, Math.min(1, z))) / DEG };
}

/** "18h 40m" from degrees of right ascension. */
function hours(raDeg: number): string {
  let m = Math.round((raDeg / 15) * 60);
  m %= 24 * 60;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** The card's line on where it came from and how fast. */
export function visitorFact(v: Visitor): string {
  const { raDeg, decDeg } = raDecOf(incomingDirection(v));
  const dec = Math.round(decDeg);
  return `It came from the direction of RA ${hours(raDeg)}, Dec ${dec < 0 ? '−' : '+'}${Math.abs(dec)}° (${v.from}), at ${vInfinityKmS(v).toFixed(1)} km/s before the Sun’s pull sped it up, and leaves as fast (JPL orbit solution ${v.solution}).`;
}
