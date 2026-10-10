/**
 * CelesTrak's GP data, fetched from the visitor's browser and kept in its Cache Storage.
 *
 * Why at run time and not a file in public/: the GP element sets come from the US Space Force's catalogue through
 * Space-Track, and CelesTrak (Dr T. S. Kelso) redistributes them freely but states no licence for passing them on,
 * so Skyfold does not ship a copy. CelesTrak answers browsers from any site (Access-Control-Allow-Origin: *).
 *
 * CelesTrak's usage policy (https://celestrak.org/usage-policy.php; gp-data-formats.php): GP data are updated
 * every two hours; download each set at most once per update; stop at once on any answer but 200 (a 403 also
 * means "you already have this update"), and do not hammer the server. So:
 *  - a set fetched less than two hours ago is read from the cache and not asked for again;
 *  - an older one is asked for once; if CelesTrak says no (403, 404, 5xx) or the network is down, the cached copy
 *    is used however old it is, and this set is not asked for again until the page is reloaded;
 *  - nothing is fetched until it is wanted (the stations at start-up, the 15,000 active satellites only when the
 *    View menu's Satellites switch is turned on, the debris only with its own switch).
 * One network (one IP address) may fetch each update once: a second browser behind the same address within the
 * same two hours gets CelesTrak's 403 and falls back on its own cache, if it has one.
 */

const BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const CACHE_NAME = 'skyfold-celestrak-gp-1';
/** CelesTrak updates GP data every two hours. */
const FRESH_MS = 2 * 3600 * 1000;
const FETCHED_HEADER = 'x-skyfold-fetched';

export interface GpText {
  text: string;
  /** When it was downloaded (ms since 1970). */
  fetchedAt: number;
  /** Older than one update, used because a fresh copy could not be had. */
  stale: boolean;
}
export interface GpFailure {
  error: string;
}

/** The query URL of a group (GROUP=stations) or a catalogue number (CATNR=20580), in CSV. */
export function gpUrl(query: { group: string } | { catnr: number }): string {
  const q = 'group' in query ? `GROUP=${encodeURIComponent(query.group)}` : `CATNR=${query.catnr}`;
  return `${BASE}?${q}&FORMAT=csv`;
}

/** Sets CelesTrak has refused this session: never asked again until a reload. */
const refused = new Set<string>();
const inFlight = new Map<string, Promise<GpText | GpFailure>>();

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function cached(cache: Cache | null, url: string): Promise<GpText | null> {
  if (!cache) return null;
  try {
    const r = await cache.match(url);
    if (!r) return null;
    const fetchedAt = Number(r.headers.get(FETCHED_HEADER)) || 0;
    return { text: await r.text(), fetchedAt, stale: Date.now() - fetchedAt > FRESH_MS };
  } catch {
    return null;
  }
}

/** A CSV with CelesTrak's header row and at least one element set. */
const looksLikeGp = (text: string) => text.startsWith('OBJECT_NAME,') && text.indexOf('\n') > 0 && text.trim().split('\n').length > 1;

async function load(url: string): Promise<GpText | GpFailure> {
  const cache = await openCache();
  const old = await cached(cache, url);
  if (old && !old.stale) return old;
  if (refused.has(url)) return old ?? { error: 'CelesTrak did not send the orbital elements this session.' };
  let res: Response;
  try {
    res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  } catch {
    refused.add(url);
    return old ? { ...old, stale: true } : { error: 'The orbital elements could not be fetched from CelesTrak (offline?).' };
  }
  const text = res.ok ? await res.text() : '';
  if (!res.ok || !looksLikeGp(text)) {
    // Any answer but a 200 with data: stop asking (CelesTrak's policy).
    refused.add(url);
    if (old) return { ...old, stale: true };
    return {
      error:
        res.status === 403
          ? 'CelesTrak sends each set once per two-hourly update to a network, and it has already gone to this one: try again later.'
          : `CelesTrak did not send the orbital elements (HTTP ${res.status}).`,
    };
  }
  const fetchedAt = Date.now();
  try {
    await cache?.put(url, new Response(text, { headers: { 'content-type': 'text/csv', [FETCHED_HEADER]: String(fetchedAt) } }));
  } catch {
    // A full or blocked cache: the data still serve this visit.
  }
  return { text, fetchedAt, stale: false };
}

/** The CSV of one set: from the cache while fresh, otherwise from CelesTrak once per session (see above). */
export function fetchGp(query: { group: string } | { catnr: number }): Promise<GpText | GpFailure> {
  const url = gpUrl(query);
  let p = inFlight.get(url);
  if (!p) {
    p = load(url).finally(() => inFlight.delete(url));
    inFlight.set(url, p);
  }
  return p;
}

export const isFailure = (x: GpText | GpFailure): x is GpFailure => 'error' in x;
