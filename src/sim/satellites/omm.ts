/**
 * CelesTrak's GP data in its CSV form of the CCSDS Orbit Mean-Elements Message (OMM): one element set per row,
 * the same mean elements as a TLE, but with room for the six-digit catalogue numbers given since July 2026, which
 * TLEs cannot carry (https://celestrak.org/NORAD/documentation/gp-data-formats.php).
 *
 * Columns: OBJECT_NAME, OBJECT_ID, EPOCH, MEAN_MOTION, ECCENTRICITY, INCLINATION, RA_OF_ASC_NODE, ARG_OF_PERICENTER,
 * MEAN_ANOMALY, EPHEMERIS_TYPE, CLASSIFICATION_TYPE, NORAD_CAT_ID, ELEMENT_SET_NO, REV_AT_EPOCH, BSTAR,
 * MEAN_MOTION_DOT, MEAN_MOTION_DDOT. Pure functions; the worker and the tests use them.
 */
import type { GpElements } from './sgp4';

export interface GpRecord extends GpElements {
  name: string;
  /** International designator (COSPAR), "1998-067A". */
  cosparId: string;
  /** NORAD catalogue number. */
  norad: number;
}

/** Splits one CSV line, allowing double-quoted fields. */
function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** "2026-10-08T23:34:55.716384" (UTC) → Julian date (a double resolves about 40 µs at that size). */
export function epochToJd(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?/.exec(iso.trim());
  if (!m) return NaN;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const frac = m[7] ? parseFloat(m[7]) : 0;
  return 2440587.5 + (ms / 1000 + frac) / 86400;
}

/** Parses a CelesTrak CSV (with its header row). Rows that do not parse are skipped. */
export function parseOmmCsv(text: string): GpRecord[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = splitCsv(lines[0]).map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  const c = {
    name: col('OBJECT_NAME'),
    id: col('OBJECT_ID'),
    epoch: col('EPOCH'),
    n: col('MEAN_MOTION'),
    e: col('ECCENTRICITY'),
    i: col('INCLINATION'),
    raan: col('RA_OF_ASC_NODE'),
    argp: col('ARG_OF_PERICENTER'),
    m: col('MEAN_ANOMALY'),
    norad: col('NORAD_CAT_ID'),
    bstar: col('BSTAR'),
    ndot: col('MEAN_MOTION_DOT'),
    nddot: col('MEAN_MOTION_DDOT'),
  };
  if (c.epoch < 0 || c.n < 0 || c.norad < 0) return [];
  const out: GpRecord[] = [];
  for (let k = 1; k < lines.length; k++) {
    const f = splitCsv(lines[k]);
    const rec: GpRecord = {
      name: (f[c.name] ?? '').trim(),
      cosparId: (f[c.id] ?? '').trim(),
      norad: parseInt(f[c.norad], 10),
      epochJd: epochToJd(f[c.epoch] ?? ''),
      meanMotion: parseFloat(f[c.n]),
      eccentricity: parseFloat(f[c.e]),
      inclinationDeg: parseFloat(f[c.i]),
      raanDeg: parseFloat(f[c.raan]),
      argPericentreDeg: parseFloat(f[c.argp]),
      meanAnomalyDeg: parseFloat(f[c.m]),
      bstar: parseFloat(f[c.bstar]) || 0,
      meanMotionDot: parseFloat(f[c.ndot]) || 0,
      meanMotionDdot: parseFloat(f[c.nddot]) || 0,
    };
    if (![rec.norad, rec.epochJd, rec.meanMotion, rec.eccentricity, rec.inclinationDeg, rec.raanDeg, rec.argPericentreDeg, rec.meanAnomalyDeg].every(Number.isFinite)) continue;
    if (rec.meanMotion <= 0 || rec.eccentricity < 0 || rec.eccentricity >= 1) continue;
    out.push(rec);
  }
  return out;
}

/**
 * What kind of object a row is, for its colour in the swarm and the words on its card. By name for the
 * constellations people look for, by orbit for the rest:
 *  0 low Earth orbit; 1 Starlink; 2 medium orbit (the navigation constellations, about 2 revolutions a day);
 *  3 geosynchronous (about 1 a day, nearly circular); 4 highly elliptical (Molniya, transfer orbits); 5 debris.
 */
export const SAT_CLASSES = ['Satellite in low orbit', 'Starlink satellite', 'Satellite in medium orbit', 'Geosynchronous satellite', 'Satellite on an elliptical orbit', 'Debris'] as const;
export type SatClass = 0 | 1 | 2 | 3 | 4 | 5;

export function classify(r: GpRecord, debris = false): SatClass {
  if (debris || / DEB\b|\bDEB$|R\/B\b/.test(r.name)) return 5;
  if (/^STARLINK/.test(r.name)) return 1;
  const n = r.meanMotion;
  if (r.eccentricity > 0.25) return 4;
  if (n > 0.9 && n < 1.1) return 3;
  if (n < 6) return 2;
  return 0;
}

/** Perigee and apogee heights above WGS-72's equatorial radius (km), and the period (min), from the mean elements. */
export function orbitSummary(r: GpElements): { perigeeKm: number; apogeeKm: number; periodMin: number } {
  const mu = 398600.8;
  const nRadS = (r.meanMotion * 2 * Math.PI) / 86400;
  const a = Math.cbrt(mu / (nRadS * nRadS));
  return { perigeeKm: a * (1 - r.eccentricity) - 6378.135, apogeeKm: a * (1 + r.eccentricity) - 6378.135, periodMin: 1440 / r.meanMotion };
}
