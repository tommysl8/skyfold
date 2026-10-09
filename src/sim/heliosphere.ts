/**
 * The edge of the Solar System as models: the heliosphere (the bubble the solar wind blows in the interstellar gas)
 * and the Oort cloud of comets. Pure functions; scene/Heliosphere.tsx draws them, ui/RegionNames.tsx names them.
 * docs/data/heliosphere.md has the sources and what is model.
 *
 * Frame: J2000 ecliptic, au, centred on the Sun (world = x, z, −y, as everywhere).
 *
 *  The interstellar wind. The Sun moves through the local interstellar gas, which therefore blows past it from
 *  ecliptic longitude 255.7°, latitude +5.1° (the nose, where it comes from), at 25.4 km/s (IBEX, McComas et al.
 *  2015, ApJS 220, 22; Ulysses found 26.3 km/s from 255.4°, +5.2°: Witte 2004, A&A 426, 835).
 *
 *  The termination shock, where the solar wind drops from supersonic to subsonic: the sphere McComas, Rankin,
 *  Schwadron & Swaczyna (2019, ApJ 884, 145) fit to where the two Voyagers crossed it and where each lost touch with
 *  the anomalous cosmic rays' source: radius 117 au, its centre 32 au tailward of the Sun, 27 au north and 12 au to
 *  port (taken here as: north, ecliptic north made square to the nose; port, to the left looking upwind with north
 *  up). It passes within 2 au of both crossings and spans 73 to 161 au from the Sun, as the paper says.
 *
 *  The heliopause, where the Sun's plasma meets the interstellar plasma: Parker's (1961, ApJ 134, 20) shape for a
 *  subsonic interstellar wind round the solar wind's pressure, the Rankine half-body of a source in a uniform
 *  stream, r = L0 / cos(θ/2) with θ the angle from the nose: round at the front, a cylinder of radius 2 L0 down the
 *  tail. The two Voyagers crossed it at different distances than one such shape allows (Voyager 2's crossing, 53°
 *  from the nose, was nearer than Voyager 1's at 30°: the interstellar magnetic field pushes the southern side in;
 *  Opher et al. 2007, Science 316, 875), so a north–south term is added, r = L0 (1 + A sin β) / cos(θ/2) with β the
 *  ecliptic latitude, and L0 and A are solved to pass exactly through both crossings. Elsewhere it is a model: the
 *  real heliopause is blunter at the nose than this (IBEX-Lo helium: Isenberg, Kucharek & Park 2017,
 *  arXiv:1711.09823) and its tail is debated (Opher et al. 2020, Nature Astronomy 4, 675, find it short and round),
 *  so the tail is drawn fading out from 250 au downstream.
 *
 *  The Oort cloud, a model: no member has been seen there. Comets on orbits spread round the Sun from an inner edge
 *  at 2,000 au (NASA: 2,000–5,000 au) to 100,000 au (NASA: 10,000–100,000 au; Oort 1950 put it at 50,000–150,000), with
 *  the density falling as r^−3.5 (the simulations of Duncan, Quinn & Tremaine 1987, AJ 94, 1330), split at 20,000 au
 *  into the inner (Hills) cloud and the outer (Oort) cloud: about a fifth lie beyond. Isotropic (the inner cloud may be
 *  somewhat flattened, and the galactic tide stretches the outer one: left out). Its members, 10¹¹–10¹² of them (Oort
 *  1950; Kaib & Volk 2022), are far too faint to see; the points drawn stand for the shape, each for millions.
 */

export type V3 = { x: number; y: number; z: number };

const DEG = Math.PI / 180;

/** Where the interstellar wind comes from (the nose), ecliptic longitude and latitude, degrees (IBEX, McComas et al. 2015). */
export const NOSE_LON_DEG = 255.7;
export const NOSE_LAT_DEG = 5.1;
/** Its speed relative to the Sun, km/s (IBEX; Ulysses: 26.3). */
export const INFLOW_KM_S = 25.4;

/** A unit vector from ecliptic longitude and latitude (degrees). */
export function eclipticDir(lonDeg: number, latDeg: number): V3 {
  const cb = Math.cos(latDeg * DEG);
  return { x: cb * Math.cos(lonDeg * DEG), y: cb * Math.sin(lonDeg * DEG), z: Math.sin(latDeg * DEG) };
}

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
function unit(a: V3): V3 {
  const n = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / n, y: a.y / n, z: a.z / n };
}
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** The nose (upwind), and the two directions square to it: north (ecliptic north made square) and port (left, looking upwind). */
export const NOSE: V3 = eclipticDir(NOSE_LON_DEG, NOSE_LAT_DEG);
export const NORTH: V3 = unit(cross(cross(NOSE, { x: 0, y: 0, z: 1 }), NOSE));
export const PORT: V3 = unit(cross(NORTH, NOSE));

/** Where each Voyager crossed the boundaries: date, distance and direction (au, degrees; the app's own tracks on those days). */
export interface Crossing {
  craft: 'voyager1' | 'voyager2';
  boundary: 'termination-shock' | 'heliopause';
  date: string;
  au: number;
  lonDeg: number;
  latDeg: number;
}

/**
 * The four crossings (NASA; Stone et al. 2005, 2008, 2013, 2019): Voyager 1 the termination shock on 16 December 2004
 * at 94 au and the heliopause on 25 August 2012 at 121.6 au; Voyager 2 the shock on 30 August 2007 at 84 au and the
 * heliopause on 5 November 2018 at 119.0 au. Distances and directions from the tracks (JPL Horizons) on those days.
 */
export const CROSSINGS: readonly Crossing[] = [
  { craft: 'voyager1', boundary: 'termination-shock', date: '2004-12-16', au: 94.03, lonDeg: 253.0, latDeg: 34.71 },
  { craft: 'voyager1', boundary: 'heliopause', date: '2012-08-25', au: 121.61, lonDeg: 254.88, latDeg: 34.95 },
  { craft: 'voyager2', boundary: 'termination-shock', date: '2007-08-30', au: 83.66, lonDeg: 288.65, latDeg: -31.61 },
  { craft: 'voyager2', boundary: 'heliopause', date: '2018-11-05', au: 119.02, lonDeg: 290.08, latDeg: -36.5 },
];

// ─── The termination shock ───────────────────────────────────────────────────────────────

/** The shock's sphere (McComas et al. 2019): radius, au… */
export const TS_RADIUS_AU = 117;
/** …and its centre from the Sun, au: tailward, north and to port. */
export const TS_OFFSET_AU = { tail: 32, north: 27, port: 12 } as const;
export const TS_CENTRE: V3 = {
  x: -TS_OFFSET_AU.tail * NOSE.x + TS_OFFSET_AU.north * NORTH.x + TS_OFFSET_AU.port * PORT.x,
  y: -TS_OFFSET_AU.tail * NOSE.y + TS_OFFSET_AU.north * NORTH.y + TS_OFFSET_AU.port * PORT.y,
  z: -TS_OFFSET_AU.tail * NOSE.z + TS_OFFSET_AU.north * NORTH.z + TS_OFFSET_AU.port * PORT.z,
};

/** Distance from the Sun to the termination shock along the unit vector `d`, au. */
export function terminationShockAu(d: V3): number {
  const b = dot(d, TS_CENTRE);
  const c2 = dot(TS_CENTRE, TS_CENTRE);
  return b + Math.sqrt(b * b - c2 + TS_RADIUS_AU * TS_RADIUS_AU);
}

// ─── The heliopause ──────────────────────────────────────────────────────────────────────

/** The shape without its scale: (1 + A sin β) / cos(θ/2) for the unit vector `d`. */
function hpShape(d: V3, A: number): number {
  const cosT = Math.max(-1, Math.min(1, dot(d, NOSE)));
  return (1 + A * d.z) / Math.sqrt((1 + cosT) / 2);
}

/** L0 (au) and A through the two heliopause crossings (solved in closed form). */
export function fitHeliopause(cs: readonly Crossing[] = CROSSINGS): { L0: number; A: number } {
  const [c1, c2] = cs.filter((c) => c.boundary === 'heliopause');
  const d1 = eclipticDir(c1.lonDeg, c1.latDeg);
  const d2 = eclipticDir(c2.lonDeg, c2.latDeg);
  // r_i cos(θ_i/2) = L0 (1 + A z_i) for both: two linear equations in L0 and L0·A.
  const k1 = c1.au * Math.sqrt((1 + dot(d1, NOSE)) / 2);
  const k2 = c2.au * Math.sqrt((1 + dot(d2, NOSE)) / 2);
  const LA = (k1 - k2) / (d1.z - d2.z);
  const L0 = k1 - LA * d1.z;
  return { L0, A: LA / L0 };
}

export const HELIOPAUSE = fitHeliopause();

/** Distance from the Sun to the heliopause along the unit vector `d`, au (Infinity straight down the tail). */
export function heliopauseAu(d: V3): number {
  const cosT = dot(d, NOSE);
  if (cosT <= -1 + 1e-12) return Infinity;
  return HELIOPAUSE.L0 * hpShape(d, HELIOPAUSE.A);
}

/** The heliopause is drawn to this angle from the nose, degrees, and fades out from DOWNSTREAM_FADE_AU down the tail. */
export const HP_MAX_THETA_DEG = 160;
export const DOWNSTREAM_FADE_AU: readonly [number, number] = [250, 650];

/** A point of the nose frame: the unit vector at θ from the nose (degrees) and φ round it from north. */
export function noseFrameDir(thetaDeg: number, phiDeg: number): V3 {
  const st = Math.sin(thetaDeg * DEG);
  const ct = Math.cos(thetaDeg * DEG);
  const cp = Math.cos(phiDeg * DEG);
  const sp = Math.sin(phiDeg * DEG);
  return {
    x: ct * NOSE.x + st * (cp * NORTH.x + sp * PORT.x),
    y: ct * NOSE.y + st * (cp * NORTH.y + sp * PORT.y),
    z: ct * NOSE.z + st * (cp * NORTH.z + sp * PORT.z),
  };
}

// ─── The Oort cloud ──────────────────────────────────────────────────────────────────────

/** The model cloud's edges and the inner (Hills) cloud's outer edge, au. */
export const OORT_INNER_AU = 2000;
export const HILLS_OUTER_AU = 20000;
export const OORT_OUTER_AU = 100000;
/** Points drawn. */
export const OORT_POINTS = 24000;

/** The fraction of the cloud's members beyond `rAu` (density ∝ r^−3.5 from OORT_INNER_AU to OORT_OUTER_AU). */
export function oortFractionBeyond(rAu: number): number {
  const a = OORT_INNER_AU ** -0.5;
  const b = OORT_OUTER_AU ** -0.5;
  const r = Math.min(OORT_OUTER_AU, Math.max(OORT_INNER_AU, rAu));
  return (r ** -0.5 - b) / (a - b);
}

/** A small seeded generator (mulberry32), so the cloud is the same each time. */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The model cloud's points, au (x, y, z ecliptic, interleaved): directions at random over the sphere, distances drawn
 * so the density falls as r^−3.5 (the number in a shell as r^−1.5 dr: r^−½ uniform between the edges).
 */
export function oortCloudPoints(n = OORT_POINTS, seed = 1950): Float32Array {
  const next = rng(seed);
  const out = new Float32Array(3 * n);
  const a = OORT_INNER_AU ** -0.5;
  const b = OORT_OUTER_AU ** -0.5;
  for (let i = 0; i < n; i++) {
    const r = (a - next() * (a - b)) ** -2;
    const z = 2 * next() - 1;
    const phi = 2 * Math.PI * next();
    const s = Math.sqrt(1 - z * z);
    out[3 * i] = r * s * Math.cos(phi);
    out[3 * i + 1] = r * s * Math.sin(phi);
    out[3 * i + 2] = r * z;
  }
  return out;
}

// ─── When they show ──────────────────────────────────────────────────────────────────────

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How strongly the heliosphere is drawn (0–1) with the camera `camAu` from the Sun and the heliopause's nose
 * distance `radiusPx` across on screen: from hundreds of au out (not from inside it, where it would hang over every
 * view of the planets), until it has shrunk to a few pixels.
 */
export const heliosphereFade = (camAu: number, radiusPx: number): number => smoothstep(150, 400, camAu) * smoothstep(6, 24, radiusPx);

/** How strongly the Oort cloud is drawn: from thousands of au out, until it is small on screen. */
export const oortFade = (camAu: number, radiusPx: number): number => smoothstep(3000, 12000, camAu) * smoothstep(15, 60, radiusPx);

/** The heliopause's and termination shock's names: only out there, and while the bubble is large enough to name. */
export const heliosphereNameFade = (camAu: number, radiusPx: number): number => smoothstep(250, 500, camAu) * smoothstep(50, 90, radiusPx);

/** The Oort cloud's name. */
export const oortNameFade = (camAu: number, radiusPx: number): number => smoothstep(15000, 40000, camAu) * smoothstep(60, 120, radiusPx);
