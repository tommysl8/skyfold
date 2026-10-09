/**
 * Famous galaxies beyond the Local Group and the brightest members of the Virgo and Coma clusters
 * (public/data/more-galaxies.json.gz, built by scripts/build-more-galaxies.mjs from OpenNGC, Cosmicflows-4
 * and Mei et al. 2007; docs/data/cosmos.md, "More galaxies"): the file's types, and the pure rules that turn
 * a catalogue row into what the renderer needs (its template, the tilt of its disc, its magnitude).
 */
import type { TemplateId } from './templates';
import type { Vec3 } from './frames';

export interface MoreGalaxy {
  id: string;
  /** The name shown: its common name, else its Messier number, else its NGC or IC designation. */
  name: string;
  designation: string;
  aliases: string[];
  /** Which set: the famous galaxies, or the members of the Virgo or Coma cluster. */
  set: 'famous' | 'virgo' | 'coma';
  ra: number;
  dec: number;
  /** OpenNGC's Hubble type (from HyperLEDA): "E", "S0-a", "SABc", "S?"… */
  hubble: string | null;
  majArcmin: number | null;
  minArcmin: number | null;
  /** Position angle of the major axis, deg east of north. */
  pa: number | null;
  bMag: number | null;
  vMag: number | null;
  /** Heliocentric radial velocity, km/s (OpenNGC). */
  vHelio: number | null;
  pgc: number | null;
  distance: {
    /** The measured distance (Virgo and Coma). */
    measuredMpc?: number;
    /** Where it is placed now (as named.json places the clusters). */
    placedMpc: number;
    loMpc: number;
    hiMpc: number;
    /** 'web': where the cosmic web places its row; 'pair': its partner's; 'individual': its own; 'cluster': the cluster's. */
    basis: 'web' | 'pair' | 'individual' | 'cluster';
    /** Cosmicflows-4's method bits (cosmicWeb.ts METHOD), 0 if none. */
    methods: number;
    ref: string;
  };
  /** Its row of the cosmic web (left out of the web's points), or null. */
  cfRow: number | null;
  positionEclMpc: Vec3;
  /** Its group's or cluster's place in the expanding universe. */
  anchorEclMpc: Vec3;
}

export interface MoreGalaxiesDoc {
  format: 'lightspeed-more-galaxies';
  version: 1;
  generated: string;
  credit: string;
  licence: string;
  galaxies: MoreGalaxy[];
}

/**
 * The template of an OpenNGC (HyperLEDA) Hubble type. Ellipticals (E, E-S0, cD) are ellipticals; S0 and S0/a the
 * bulge-dominated disc; barred spirals the barred template; spirals by their stage (a–ab early, b–bc, c and later
 * late); Magellanic types, irregulars and the unclassified "S?" (M82) the irregular. Unknown: a spiral.
 */
export function templateForHubble(hubble: string | null): TemplateId {
  const t = (hubble ?? '').trim();
  if (/^(E|cD)/.test(t)) return 'elliptical';
  if (/^(S0|SB0|SAB0)/.test(t)) return 'lenticular';
  if (/^(I|S\?|S(AB|B)?m)/.test(t)) return 'irregular';
  const stage = t.match(/^S(AB|B|A)?([a-d]{1,2})/);
  if (!stage) return 'spiral';
  if (stage[1] === 'B') return 'barred';
  const s = stage[2];
  if (s === 'a' || s === 'ab') return 'spiral-early';
  if (s === 'b' || s === 'bc') return 'spiral';
  return 'spiral-late';
}

/**
 * Inclination (deg, 0 face-on) of a thin disc from its apparent axis ratio q = b/a, with an intrinsic thickness
 * q0 = 0.2 (Hubble 1926, ApJ 64, 321; Holmberg 1958): cos² i = (q² − q0²) / (1 − q0²). Rounder than q0: edge-on.
 */
export const DISC_Q0 = 0.2;
export function inclinationFromAxisRatio(q: number, q0 = DISC_Q0): number {
  const c2 = (q * q - q0 * q0) / (1 - q0 * q0);
  return (Math.acos(Math.sqrt(Math.min(1, Math.max(0, c2)))) * 180) / Math.PI;
}

/**
 * Its apparent V magnitude: OpenNGC's V where its B − V is that of a galaxy (0.2 to 1.2: a few V magnitudes in the
 * catalogue are of something else, NGC 253's 11.1 against its B of 8.0), else its B less the B − V typical of its
 * type. Not corrected for the Milky Way's dust.
 */
export function apparentV(g: Pick<MoreGalaxy, 'bMag' | 'vMag'>, typicalBV: number): { v: number; fromB: boolean } | null {
  if (g.vMag !== null && (g.bMag === null || (g.bMag - g.vMag >= 0.2 && g.bMag - g.vMag <= 1.2))) return { v: g.vMag, fromB: false };
  if (g.bMag !== null) return { v: g.bMag - typicalBV, fromB: true };
  return null;
}

/** The discs among the templates: drawn tilted by their inclination. */
export const DISC_TEMPLATES: ReadonlySet<TemplateId> = new Set(['spiral-early', 'spiral', 'spiral-late', 'barred', 'lenticular']);
