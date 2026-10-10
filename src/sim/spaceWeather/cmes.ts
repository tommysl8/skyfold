/**
 * The coronal mass ejections in the app (public/data/space-weather/cmes.json.gz, made by
 * scripts/build-space-weather.mjs; docs/data/space-weather.md): reading the table, which are in flight at a date, and
 * where each one's front is. Pure.
 *
 * Each CME flies out from the Sun along its axis, its front a cone of the drawn half-width: from the Sun's surface at
 * its catalogued speed to 21.5 solar radii (where the catalogue's analysis places it), then by the drag-based model
 * (dbm.ts) with the drag parameter and wind fitted to its measured arrival at Earth, or the typical ones. It is shown
 * until its apex is FADE_END_AU from the Sun.
 */
import { SUN_RADIUS_KM, AU_KM } from '../../physics/constants';
import { dbmAt, dbmTimeTo, element, R0_KM, type Dbm } from './dbm';
import { eclipticDegToWorld, type Vec3 } from './geometry';

export interface Cme {
  /** DONKI's activity ID ("2024-05-08T05:36:00-CME-001"), or 'carrington-1859'. */
  id: string;
  /** First seen (DONKI: in a coronagraph; 1859: the flare), and at 21.5 solar radii, ms since 1970 (UTC). */
  startMs: number;
  t21Ms: number;
  /** The analysed direction, Stonyhurst degrees (longitude west positive), half-width and speed (km/s), DONKI's type. */
  latDeg: number;
  lonDeg: number;
  halfAngleDeg: number;
  speed: number;
  type: string | null;
  /** The source on the Sun ("S20W17") and its NOAA active region, when known. */
  source: string | null;
  region: number | null;
  /** The axis, a unit vector in world axes. */
  axis: Vec3;
  /** The drawn cone's half-width, radians (wider than analysed when the measured shock at Earth lay outside it). */
  halfWidth: number;
  /** The model: drag parameter, km⁻¹, and the wind's speed, km/s. */
  gamma: number;
  w: number;
  /** The shock at Earth DONKI links to it (ms), and whether the model is fitted to it (else another CME of the same shock is). */
  arrivalMs: number | null;
  fitted: boolean;
  /** When the drawn front reaches Earth (ms, null: it misses), and its speed then, km/s. */
  drawnArrivalMs: number | null;
  arrivalSpeed: number | null;
  /** When the typical model (γ = 0.2 × 10⁻⁷ km⁻¹, w = 400 km/s) brings it to Earth. */
  typicalArrivalMs: number | null;
  /** The largest Kp in the two days from the shock (or the linked storm's start), GFZ. */
  kp: number | null;
  /** DONKI's page number (https://ccmc.gsfc.nasa.gov/DONKI/view/CME/<link>/-1). */
  link: number | null;
  /** A measured arrival elsewhere, or the sources of a historical event. */
  note: { at?: string; time?: string; cite?: string; modelled?: string } | null;
  /** Leaves the Sun's surface, and fades out, ms. */
  launchMs: number;
  endMs: number;
}

/** The table's file, as the build script writes it. */
export interface CmeFile {
  version: number;
  columns: string[];
  rows: unknown[][];
}

/** The front fades out between these distances of its apex from the Sun, au (beyond, the Parker spirals end too). */
export const FADE_END_AU = 3;
export const FADE_FROM_AU = 1.8;

const isoMs = (s: unknown): number | null => (typeof s === 'string' ? Date.parse(s.endsWith('Z') ? s : `${s}Z`) : null);

/** The apex's model (from 21.5 solar radii at t21). */
export const apexModel = (c: Cme): Dbm => ({ r0: R0_KM, v0: c.speed, gamma: c.gamma, w: c.w });

/** Read the table, sorted by the time at 21.5 solar radii. */
export function parseCmes(doc: CmeFile): Cme[] {
  if (doc.version !== 1) throw new Error('cmes.json: not version 1');
  const col = (name: string) => {
    const i = doc.columns.indexOf(name);
    if (i < 0) throw new Error(`cmes.json: no column ${name}`);
    return i;
  };
  const C = Object.fromEntries(
    ['id', 'start', 't21', 'lat', 'lon', 'halfAngle', 'speed', 'type', 'source', 'region', 'axisLon', 'axisLat', 'drawnHalfAngle', 'gamma', 'w', 'arrival', 'fitted', 'drawnArrival', 'arrivalSpeed', 'typicalArrival', 'kp', 'link', 'note'].map((k) => [k, col(k)]),
  );
  const out: Cme[] = doc.rows.map((r) => {
    const t21Ms = isoMs(r[C.t21])!;
    const speed = r[C.speed] as number;
    const c: Cme = {
      id: r[C.id] as string,
      startMs: isoMs(r[C.start])!,
      t21Ms,
      latDeg: r[C.lat] as number,
      lonDeg: r[C.lon] as number,
      halfAngleDeg: r[C.halfAngle] as number,
      speed,
      type: (r[C.type] as string | null) ?? null,
      source: (r[C.source] as string | null) ?? null,
      region: (r[C.region] as number | null) ?? null,
      axis: eclipticDegToWorld(r[C.axisLon] as number, r[C.axisLat] as number),
      halfWidth: ((r[C.drawnHalfAngle] as number) * Math.PI) / 180,
      gamma: (r[C.gamma] as number) * 1e-7,
      w: r[C.w] as number,
      arrivalMs: isoMs(r[C.arrival]),
      fitted: r[C.fitted] === 1,
      drawnArrivalMs: isoMs(r[C.drawnArrival]),
      arrivalSpeed: (r[C.arrivalSpeed] as number | null) ?? null,
      typicalArrivalMs: isoMs(r[C.typicalArrival]),
      kp: (r[C.kp] as number | null) ?? null,
      link: (r[C.link] as number | null) ?? null,
      note: (r[C.note] as Cme['note']) ?? null,
      launchMs: t21Ms - ((R0_KM - SUN_RADIUS_KM) / speed) * 1000,
      endMs: 0,
    };
    c.endMs = c.t21Ms + dbmTimeTo(apexModel(c), FADE_END_AU * AU_KM) * 1000;
    return c;
  });
  return out.sort((a, b) => a.t21Ms - b.t21Ms);
}

const scratch = { r: 0, v: 0 };

/**
 * The distance from the Sun (km) of a CME's front at an angle φ (radians) from its axis at a date, or 0 before it
 * leaves the Sun. Before 21.5 solar radii the element flies at its starting speed.
 */
export function frontKm(c: Cme, phi: number, ms: number): number {
  if (ms < c.launchMs) return 0;
  const el = element(apexModel(c), phi, c.halfWidth);
  const t = (ms - c.t21Ms) / 1000;
  if (t < 0) return Math.max(SUN_RADIUS_KM, el.r0 + el.v0 * t);
  return dbmAt(el, t, scratch).r;
}

/** The apex's speed at a date, km/s. */
export function apexSpeed(c: Cme, ms: number): number {
  const t = (ms - c.t21Ms) / 1000;
  return t <= 0 ? c.speed : dbmAt(apexModel(c), t, scratch).v;
}

/** The longest any CME of the table is shown, ms (for the search below). */
export function longestFlight(cmes: readonly Cme[]): number {
  let m = 0;
  for (const c of cmes) m = Math.max(m, c.endMs - c.launchMs);
  return m;
}

/** The CMEs shown at a date (launched, apex not yet past FADE_END_AU), into `out`. `cmes` sorted by t21. */
export function inFlight(cmes: readonly Cme[], ms: number, longest: number, out: Cme[]): Cme[] {
  out.length = 0;
  // Every CME launched in (ms − longest, ms]: its t21 is within that window shifted by its corona crossing (< 1 day).
  let lo = 0;
  let hi = cmes.length;
  const from = ms - longest - 86_400_000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmes[mid].t21Ms < from) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < cmes.length && cmes[i].launchMs <= ms + 86_400_000; i++) {
    const c = cmes[i];
    if (c.launchMs <= ms && ms < c.endMs) out.push(c);
  }
  return out;
}

/** How much of a CME's front shows at a date, 0–1: in as it leaves the corona, out between FADE_FROM_AU and FADE_END_AU. */
export function frontShare(c: Cme, ms: number): number {
  if (ms < c.launchMs || ms >= c.endMs) return 0;
  const r = frontKm(c, 0, ms) / AU_KM;
  const rise = Math.min(1, (r * AU_KM) / SUN_RADIUS_KM / 4);
  const t = Math.min(1, Math.max(0, (r - FADE_FROM_AU) / (FADE_END_AU - FADE_FROM_AU)));
  return rise * (1 - t * t * (3 - 2 * t));
}
