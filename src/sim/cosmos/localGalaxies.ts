/**
 * The galaxies of the Local Group and its surroundings (public/data/local-galaxies.json.gz, from
 * the CC0 Local Volume Database v1.1.1, Pace 2025) and the named galaxies, clusters and
 * record-holding galaxies the Learn articles use (named.json), both built by
 * scripts/build-local-galaxies.mjs (docs/data/cosmos.md): their types, and the geometry that tilts a
 * disc galaxy as it really lies.
 */
import { add, apply, cross, DEG, ICRS_TO_ECL, scale, skyBasis, type Vec3 } from './frames';

export type GalaxyClass =
  | 'spiral'
  | 'magellanic-spiral'
  | 'magellanic-irregular'
  | 'irregular'
  | 'dwarf-irregular'
  | 'transition'
  | 'dwarf-spheroidal'
  | 'dwarf-elliptical'
  | 'compact-elliptical'
  | 'elliptical'
  | 'lenticular'
  | 'lenticular-peculiar'
  | 'cluster'
  | 'high-z'
  | 'unknown';

export interface DiscInfo {
  inclination: number;
  recedingPA?: number;
  majorAxisPA?: number;
  nearSidePA: number | null;
  rotationOnSky?: 'clockwise' | 'counterclockwise';
  approximate?: boolean;
  ref: string;
  note?: string;
  /** Unit vectors in the ecliptic frame (see DiscAxes). */
  axesEcl: { major: Vec3; minor: Vec3; normal: Vec3; spin: Vec3 | null };
  normalGalactic: { l: number; b: number };
  spinGalactic: { l: number; b: number } | null;
  /** True when the near side is not known and the side at PA + 90° was assumed near. */
  nearSideAssumed: boolean;
}

export interface SizeInfo {
  d25Arcmin: number;
  axisRatio: number | null;
  pa: number | null;
  bT: number | null;
  aG: number | null;
  r25Kpc?: number;
  absMagB?: number;
  ref: string;
}

export interface CosmicWebLink {
  index?: number;
  groupPgc: number;
  members?: { first: number; count: number };
}

export interface LocalGalaxy {
  id: string;
  name: string;
  catalogueName: string;
  aliases?: string[];
  subgroup: 'MW' | 'M31' | 'LG' | 'nearby' | null;
  morphology: string | null;
  class: GalaxyClass;
  ambiguous?: boolean;
  ra: number;
  dec: number;
  l: number;
  b: number;
  distanceKpc: number;
  dmod: number;
  dmodErr: [number | null, number | null];
  distanceRef: string;
  positionEclKpc: Vec3;
  vHelio?: number;
  vHelioErr?: [number | null, number | null];
  vmag?: number;
  absMagV?: number;
  lumV?: number;
  pa?: number;
  ellipticity?: number;
  rhArcmin?: number;
  rhPc?: number;
  /** Mean V surface brightness within the half-light radius, mag/arcsec². */
  muVHalf?: number;
  sigmaStar?: number;
  /** Neutral hydrogen, 10⁶ M☉. */
  mHI?: number;
  feh?: number;
  fehType?: string;
  pmRef?: string;
  pmra?: number;
  pmdec?: number;
  velocityHelioEclKmS?: Vec3;
  disc?: DiscInfo;
  size?: SizeInfo;
  cosmicWeb?: CosmicWebLink;
  /** LVDB reference keys (author + year + ADS bibcode); LocalGalaxiesDoc.references has the bibcodes. */
  refs?: string[];
}

export interface LocalGalaxiesDoc {
  format: 'lightspeed-local-galaxies';
  version: 1;
  generated: string;
  description: string;
  credit: string;
  licence: string;
  /** Reference key → ADS bibcode (https://ui.adsabs.harvard.edu/abs/<bibcode>). */
  references: Record<string, string | null>;
  galaxies: LocalGalaxy[];
}

export interface NamedObject {
  id: string;
  name: string;
  aliases: string[];
  kind: 'galaxy' | 'cluster' | 'high-z-galaxy';
  recordHolder?: boolean;
  ra: number;
  dec: number;
  positionRef: string;
  galactic: { l: number; b: number };
  ecliptic: { lon: number; lat: number };
  morphology: { type: string; class: GalaxyClass; ref: string };
  vHelio?: { value: number; err?: number; ref: string };
  zHelio?: { value: number; err?: number; ref: string; note?: string };
  zCmb?: number;
  distance?: { mpc: number; errMpc?: number | [number, number]; dmod?: number; dmodErr?: number; method: string; ref: string; note?: string };
  cosmology?: {
    comovingDistanceMpc: number;
    luminosityDistanceMpc: number;
    angularDiameterDistanceMpc: number;
    lookbackTimeGyr: number;
    ageAtEmissionGyr: number;
    lightTravelDistanceGly: number;
  };
  positionEclMpc: Vec3;
  positionBasis: string;
  disc?: DiscInfo;
  size?: SizeInfo;
  cosmicWeb?: CosmicWebLink;
}

export interface NamedDoc {
  format: 'lightspeed-named-extragalactic';
  version: 1;
  generated: string;
  cosmology: { H0: number; OmegaM: number; OmegaR: number; OmegaL: number; ageGyr: number };
  cmbDipole: { speedKmS: number; l: number; b: number; ref: string };
  redshiftRecord: { asOf: string; id: string; z: number; previous: { id: string; z: number } };
  objects: NamedObject[];
}

// ─── Disc geometry ───────────────────────────────────────────────────────────────────────

export interface DiscInput {
  /** Degrees, 0 = face-on. */
  inclination: number;
  /** PA (degrees east of north) of the receding half of the major axis, if known. */
  recedingPA?: number;
  /** PA of the major axis (either end) when the receding end is unknown. */
  pa?: number;
  /** PA of the near side of the minor axis, if known. */
  nearSidePA?: number | null;
  rotationOnSky?: 'clockwise' | 'counterclockwise';
}

export interface DiscAxes {
  /** In-plane unit vector along the major axis (towards the receding end when known). */
  major: Vec3;
  /** In-plane unit vector perpendicular to `major`, projecting onto the sky towards PA + 90°. */
  minor: Vec3;
  /** The disc's normal on the observer's side: normal · lineOfSight = −cos i. */
  normal: Vec3;
  /** Angular-momentum direction, or null when the sense of rotation is unknown. */
  spin: Vec3 | null;
  nearSideAssumed: boolean;
}

/**
 * Orientation of a thin disc at (RA, Dec) from its inclination, position angle and, when known,
 * near side and rotation, in ICRS. With a the PA direction (the receding end), b the direction at
 * PA + 90° on the sky and r the line of sight: m = cos(i) b − s sin(i) r (s = +1 if the side at
 * PA + 90° is near), normal = a × m, spin = −s normal (receding end and near side known) or ±normal
 * (counterclockwise / clockwise on the sky). Without a known near side the plane could be its
 * mirror image in the sky plane: the side at PA + 90° is taken as near and nearSideAssumed is set.
 * scripts/build-local-galaxies.mjs made named.json's axesEcl this way; the tests check they agree.
 */
export function discAxes(raDeg: number, decDeg: number, d: DiscInput): DiscAxes {
  const { r, e, n } = skyBasis(raDeg, decDeg);
  const paDeg = d.recedingPA ?? d.pa;
  if (paDeg == null) throw new Error('disc needs recedingPA or pa');
  const pa = paDeg * DEG;
  const i = d.inclination * DEG;
  const a = add(scale(n, Math.cos(pa)), scale(e, Math.sin(pa)));
  const b = add(scale(n, -Math.sin(pa)), scale(e, Math.cos(pa)));
  let s = 1;
  let assumed = true;
  if (d.nearSidePA != null) {
    s = Math.cos((d.nearSidePA - (paDeg + 90)) * DEG) >= 0 ? 1 : -1;
    assumed = false;
  }
  const m = add(scale(b, Math.cos(i)), scale(r, -s * Math.sin(i)));
  const normal = cross(a, m);
  let spin: Vec3 | null = null;
  if (d.recedingPA != null && d.nearSidePA != null) spin = scale(normal, -s);
  else if (d.rotationOnSky === 'counterclockwise') spin = normal;
  else if (d.rotationOnSky === 'clockwise') spin = scale(normal, -1);
  return { major: a, minor: m, normal, spin, nearSideAssumed: assumed };
}

/** The same axes in the ecliptic frame. */
export function discAxesEcl(raDeg: number, decDeg: number, d: DiscInput): DiscAxes {
  const ax = discAxes(raDeg, decDeg, d);
  const t = (v: Vec3) => apply(ICRS_TO_ECL, v);
  return { ...ax, major: t(ax.major), minor: t(ax.minor), normal: t(ax.normal), spin: ax.spin ? t(ax.spin) : null };
}

/** A point of the disc at radius R and in-plane azimuth φ from the major axis towards the minor axis. */
export function discPoint(ax: Pick<DiscAxes, 'major' | 'minor'>, radius: number, phiRad: number): Vec3 {
  return add(scale(ax.major, radius * Math.cos(phiRad)), scale(ax.minor, radius * Math.sin(phiRad)));
}
