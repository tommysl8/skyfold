/**
 * A place: the view as data, so that it can be saved in this browser (pick up where you left off, the saved places)
 * and passed on as a link. It holds where the camera is, as an orbit pose about a body (the body, the direction
 * from it to the camera and the distance, or over a black hole the height above its horizon), the date (or "now":
 * the clock live at real time), the pace of time and whether it is paused, and the body selected. Nothing else:
 * no preferences, nothing about the visitor.
 *
 * As a link it is a short, readable query (encodePlace, decodePlace):
 *
 *   ?at=betelgeuse&r=4.50923e9&dir=0.31,-0.12,0.94&t=2031-03-03T12:00:00Z&w=1000&p=1&sel=betelgeuse
 *
 *   at    the body's id (required)
 *   r     the distance from its centre, km, to 6 significant figures (absent: its framing distance, as Go there)
 *   h     over a black hole, the height above the horizon instead, km, to 12 significant figures, so a hover just
 *         above the horizon (r_s·10⁻⁶ up: 12.7 km at Sgr A*) comes back as it was placed
 *   dir   the unit vector from the body to the camera, world axes, to 6 decimals (absent: the app's own view)
 *   t     the date, ISO 8601 UTC for the years 0 to 9999, ms since 1970 beyond; absent: now
 *   w     the pace, simulated seconds per second (absent: 1)
 *   p     1 when the clock is paused
 *   sel   the body selected
 *
 * Decoding is forgiving field by field: a value that is malformed or out of range is dropped, and the place falls
 * back to the default for it (the framing distance, the app's own direction, now, real time). Only a missing or
 * malformed `at` makes no place at all. An id the app does not know is not an error here: ids can be renamed between
 * versions, and whoever applies the place says it could not be found.
 *
 * Pure: no three.js, no app state (ui/places.ts captures and applies places; ui/resume.ts saves them).
 */
import { civilFromMs, daysInMonth, msFromCivil } from '../lib/time';

export interface PlaceDir {
  x: number;
  y: number;
  z: number;
}

export interface Place {
  /** The body the camera is at (the orbit target). */
  at: string;
  /** Unit vector from the body to the camera, world axes; absent: the app's own view of it (as Go there frames it). */
  dir?: PlaceDir;
  /** Distance from the body's centre, km; absent: its framing distance. */
  r?: number;
  /** Over a black hole: the height above its horizon, km (used instead of r). */
  h?: number;
  /** The date, ms since 1970 (UTC), or 'now': the clock live at real time. */
  t: number | 'now';
  /** The pace: simulated seconds per real second (sim.warp). */
  w: number;
  /** The clock paused. */
  p: boolean;
  /** The body selected, if any. */
  sel?: string;
}

/** The query keys a place uses (stripped from the address once a link has been opened). */
export const PLACE_KEYS = ['at', 'r', 'h', 'dir', 't', 'w', 'p', 'sel'] as const;

/** Where the app opens: in orbit about Earth, 26,000 km from its centre (scene/SimDriver.tsx), at the present. */
export const DEFAULT_START_KM = 26_000;

/** Farthest orbit distance, km (controls/cameraController.ts MAX_DIST_KM). */
const MAX_KM = 1e24;
/** The clock's limits (sim/clock.ts TIME_MIN_MS, TIME_MAX_MS): the Big Bang and ten trillion years ahead. */
export const PLACE_TIME_MIN_MS = msFromCivil(-13.8e9, 1, 1);
export const PLACE_TIME_MAX_MS = msFromCivil(1e13, 1, 1);
/** The paces accepted: slower than real time is not offered, faster than 10¹⁶ (the fastest step) is refused. */
const MIN_PACE = 1e-3;
const MAX_PACE = 1e16;
/** Significant figures kept: the distance, and a black hole's height (finer: a hover can sit 10⁻⁶ r_s up). */
export const R_FIGURES = 6;
export const H_FIGURES = 12;
const DIR_DECIMALS = 6;

const ID_RE = /^[a-z0-9][a-z0-9._+*-]{0,127}$/i;

/**
 * A number to n significant figures, written short: "26000", "1000000" as they are, "4.50923e9" past seven
 * characters (no "+": it would need escaping).
 */
export function sigText(x: number, n: number): string {
  const v = Number(x.toPrecision(n));
  const plain = String(v);
  const exp = v.toExponential().replace('e+', 'e');
  return plain.length > 7 && exp.length < plain.length ? exp : plain.replace('e+', 'e');
}

/** A component of the direction: at most 6 decimals, no trailing zeros ("0.5", "-0.123457", "0"). */
function dirText(x: number): string {
  const s = String(Number(x.toFixed(DIR_DECIMALS)));
  return s === '-0' ? '0' : s;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** "2031-03-03T12:00:00Z" for the years 0 to 9999 (with ".250" when there are milliseconds); ms since 1970 beyond. */
export function timeText(ms: number): string {
  const t = Math.round(ms);
  const c = civilFromMs(t);
  if (c.year < 0 || c.year > 9999) return String(t).replace('e+', 'e');
  const whole = msFromCivil(c.year, c.month, c.day, c.hour, c.minute, 0);
  const msOfMinute = t - whole;
  const s = Math.floor(msOfMinute / 1000);
  const frac = msOfMinute - s * 1000;
  return `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}:${pad(s)}${frac ? `.${pad(frac, 3)}` : ''}Z`;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?Z?)?$/;
const NUM_RE = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;

/** A date as timeText writes it (or a date alone, or ms since 1970), within the clock's range; NaN if not. */
export function parseTime(s: string): number {
  const m = ISO_RE.exec(s);
  if (m) {
    const [y, mo, d, h = 0, mi = 0, sec = 0] = m.slice(1, 7).map((v) => (v === undefined ? 0 : Number(v)));
    const frac = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || sec > 59) return NaN;
    return msFromCivil(y, mo, d, h, mi, sec) + frac;
  }
  if (!NUM_RE.test(s)) return NaN;
  const ms = Number(s);
  return Number.isFinite(ms) && ms >= PLACE_TIME_MIN_MS && ms <= PLACE_TIME_MAX_MS ? ms : NaN;
}

/** The place as a query string (without the "?"), short and readable; see the file comment. */
export function encodePlace(p: Place): string {
  const q = new URLSearchParams();
  q.set('at', p.at);
  if (p.h !== undefined) q.set('h', sigText(p.h, H_FIGURES));
  else if (p.r !== undefined) q.set('r', sigText(p.r, R_FIGURES));
  if (p.dir) q.set('dir', [p.dir.x, p.dir.y, p.dir.z].map(dirText).join(','));
  if (p.t !== 'now') q.set('t', timeText(p.t));
  if (p.w !== 1) q.set('w', sigText(p.w, R_FIGURES));
  if (p.p) q.set('p', '1');
  if (p.sel) q.set('sel', p.sel);
  // The commas of dir and the colons of the time read better as they are (both are allowed in a query).
  return q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':');
}

const positive = (s: string | null, max: number): number | undefined => {
  if (s === null || !NUM_RE.test(s)) return undefined;
  const x = Number(s);
  return Number.isFinite(x) && x > 0 && x <= max ? x : undefined;
};

function parseDir(s: string | null): PlaceDir | undefined {
  if (s === null) return undefined;
  const parts = s.split(',');
  if (parts.length !== 3 || !parts.every((v) => NUM_RE.test(v.trim()))) return undefined;
  const [x, y, z] = parts.map(Number);
  const len = Math.hypot(x, y, z);
  // Written to 6 decimals, a unit vector's length is within 10⁻⁶ of 1: anything far off is not one.
  if (!(len > 0.99 && len < 1.01)) return undefined;
  return { x: x / len, y: y / len, z: z / len };
}

/**
 * A place from a query string (with or without its "?") or its parameters; null without a well-formed `at`. Each
 * other field that is malformed or out of range is dropped (its default stands): see the file comment.
 */
export function decodePlace(query: string | URLSearchParams): Place | null {
  const q = typeof query === 'string' ? new URLSearchParams(query.startsWith('?') ? query.slice(1) : query) : query;
  const at = q.get('at');
  if (!at || !ID_RE.test(at)) return null;
  const place: Place = { at, t: 'now', w: 1, p: false };
  const h = positive(q.get('h'), MAX_KM);
  const r = positive(q.get('r'), MAX_KM);
  if (h !== undefined) place.h = h;
  else if (r !== undefined) place.r = r;
  const dir = parseDir(q.get('dir'));
  if (dir) place.dir = dir;
  const t = q.get('t');
  if (t !== null && t !== 'now') {
    const ms = parseTime(t);
    if (Number.isFinite(ms)) place.t = ms;
  }
  const w = q.get('w');
  if (w !== null && NUM_RE.test(w)) {
    const x = Number(w);
    if (x >= MIN_PACE && x <= MAX_PACE) place.w = x;
  }
  place.p = q.get('p') === '1';
  const sel = q.get('sel');
  if (sel && ID_RE.test(sel)) place.sel = sel;
  return place;
}

/** Whether a query carries a place link at all (an `at`, well formed or not). */
export const hasPlaceLink = (query: string): boolean => new URLSearchParams(query.startsWith('?') ? query.slice(1) : query).has('at');

/** The query without a place's keys (other parameters kept), with its "?" when anything is left. */
export function withoutPlace(query: string): string {
  const q = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  for (const k of PLACE_KEYS) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Two places that would be written the same (and so are the same view, to the figures kept). */
export const samePlace = (a: Place, b: Place): boolean => encodePlace(a) === encodePlace(b);

/**
 * Whether a place is where the app opens anyway: about Earth at the start distance (to 1 %), at the present in real
 * time. The direction is left out: the opening view's depends on the date, and a turn about Earth is not a place
 * worth offering to go back to.
 */
export function isDefaultStart(p: Place): boolean {
  const near = p.r === undefined || Math.abs(p.r / DEFAULT_START_KM - 1) < 0.01;
  return p.at === 'earth' && p.h === undefined && near && p.t === 'now' && p.w === 1 && !p.p;
}

// ─── Saving ─────────────────────────────────────────────────────────────────────────────

/**
 * Writes at most every `minMs` while the value changes (the view moving), and at once when the page goes away
 * (flush). `offer` and `flush` say whether to write now, and take the value as written if so.
 */
export function createThrottle(minMs: number) {
  let last: string | null = null;
  let lastAt = -Infinity;
  return {
    /** What is stored already (nothing to write until it changes). */
    seed(value: string | null): void {
      last = value;
    },
    offer(value: string, nowMs: number): boolean {
      if (value === last || nowMs - lastAt < minMs) return false;
      last = value;
      lastAt = nowMs;
      return true;
    },
    flush(value: string, nowMs: number): boolean {
      if (value === last) return false;
      last = value;
      lastAt = nowMs;
      return true;
    },
  };
}

/** The place last seen in this browser, as saved (localStorage `lightspeed.place`). */
export interface LastPlace {
  /** The place's query (encodePlace): decoded, and so checked, when read back. */
  q: string;
  /** The body's name when saved (its data may not have loaded yet when it is offered again). */
  name: string;
  /** When it was saved, ms since 1970 (the computer's clock). */
  savedAt: number;
}

/** A saved place (localStorage `lightspeed.places`, newest first). */
export interface SavedPlace extends LastPlace {
  id: string;
  /** The body's name and the date, or the visitor's own name for it. */
  label: string;
}

/** At most this many saved places are kept (the oldest go). */
export const MAX_SAVED = 50;
const MAX_LABEL = 80;

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

/** A last place read back from storage, or null if it is not one (or its place does not decode). */
export function parseLastPlace(v: unknown): LastPlace | null {
  const o = v as Partial<LastPlace> | null;
  const q = str(o?.q, 2000);
  if (!q || !decodePlace(q)) return null;
  return { q, name: str(o?.name, 200) ?? '', savedAt: typeof o?.savedAt === 'number' && Number.isFinite(o.savedAt) ? o.savedAt : 0 };
}

/** The saved places read back from storage: the well-formed ones, each id once, at most MAX_SAVED. */
export function parseSavedPlaces(v: unknown): SavedPlace[] {
  if (!Array.isArray(v)) return [];
  const out: SavedPlace[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const last = parseLastPlace(x);
    const id = str((x as Partial<SavedPlace> | null)?.id, 64);
    const label = str((x as Partial<SavedPlace> | null)?.label, MAX_LABEL);
    if (!last || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...last, id, label: label?.trim() || last.name || decodePlace(last.q)!.at });
    if (out.length >= MAX_SAVED) break;
  }
  return out;
}

/** A label as kept: trimmed, at most 80 characters; empty gives the fallback. */
export const cleanLabel = (label: string, fallback: string): string => label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL) || fallback;

/** The list with a new place first (the oldest dropped past MAX_SAVED). */
export const addSaved = (list: readonly SavedPlace[], entry: SavedPlace): SavedPlace[] => [entry, ...list.filter((s) => s.id !== entry.id)].slice(0, MAX_SAVED);

export const renameSaved = (list: readonly SavedPlace[], id: string, label: string): SavedPlace[] =>
  list.map((s) => (s.id === id ? { ...s, label: cleanLabel(label, s.label) } : s));

export const removeSaved = (list: readonly SavedPlace[], id: string): SavedPlace[] => list.filter((s) => s.id !== id);

// ─── Offering it again ───────────────────────────────────────────────────────────────────

/**
 * Whether to offer the last place on opening the app: there is one, it is not where the app opens anyway, no link
 * was opened (the link's place wins) and the welcome screen is not showing (a first visit: it is for returning
 * visitors).
 */
export function offerResume(last: LastPlace | null, opts: { link: boolean; welcome: boolean }): boolean {
  if (!last || opts.link || opts.welcome) return false;
  const p = decodePlace(last.q);
  return !!p && !isDefaultStart(p);
}

// ─── Words ──────────────────────────────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "3 March 2031" (long) or "3 Mar 2031"; "500 BCE" style years and the far future as the date chip has them. */
export function dateLabel(ms: number, long = false): string {
  const c = civilFromMs(ms);
  const month = long ? MONTHS[c.month - 1] : MONTHS[c.month - 1].slice(0, 3);
  if (c.year >= 1 && c.year <= 9999) return `${c.day} ${month} ${c.year}`;
  if (c.year < 1 && c.year > -10_000) return `${c.day} ${month} ${1 - c.year} BCE`;
  const y = c.year >= 1 ? c.year : 1 - c.year;
  const big = y >= 1e9 ? `${Number((y / 1e9).toPrecision(3))} billion` : y >= 1e6 ? `${Number((y / 1e6).toPrecision(3))} million` : Math.round(y).toLocaleString('en-GB');
  return c.year >= 1 ? `year ${big}` : `${big} years BCE`;
}
