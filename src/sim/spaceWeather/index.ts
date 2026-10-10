/**
 * Space weather (docs/data/space-weather.md): real coronal mass ejections flying out from the Sun on the date, their
 * hit on Earth's magnetosphere, and the measured Kp the aurora follows. The small part that comes with the app: it
 * decides, once a frame, whether anything of it is wanted, loads the tables when first needed (the CMEs, 49 kB, once
 * the camera is among the planets at a date the table covers; the Kp index, 134 kB, once the aurora is drawn with
 * Kp "Auto"), and works out which CMEs are in flight and how hard one presses on Earth. The fronts themselves
 * (scene/SpaceWeather.tsx and its material) are a chunk of their own, fetched the first time a CME is in flight near
 * the camera; while none is, nothing of them is drawn.
 *
 * Cost: a binary search and a few comparisons a frame once loaded.
 */
import { AU_KM } from '../../physics/constants';
import { assetUrl } from '../../render/textures';
import { useUI } from '../../state/ui';
import { solarSystemHidden } from '../derived';
import { sim } from '../sim';
import { fetchGzip } from '../stars/catalogue';
import { cmeCard, type CmeCard } from './cards';
import { inFlight, longestFlight, parseCmes, type Cme, type CmeFile } from './cmes';
import { kpAt, parseKp, type KpTable } from './kp';
import { earthStorm, QUIET_PRESSURE, type EarthStorm } from './storm';
import { shue1998 } from '../fields/magnetopause';

/** The dates the CME table covers (the Carrington event's week, and DONKI's years), ms. */
const SPANS: readonly (readonly [number, number])[] = [
  [Date.UTC(1859, 7, 31), Date.UTC(1859, 8, 8)],
  [Date.UTC(2010, 0, 1), Date.UTC(2026, 10, 1)],
];
/** The fronts are drawn while the camera is this near the Sun (the Parker spirals' reach and well beyond). */
export const CME_REACH_KM = 60 * AU_KM;

/** Kp the aurora is drawn at when "Auto" has no measurement for the date (before 1932, or after the table's end). */
export const KP_FALLBACK = 3;

const quiet = shue1998(QUIET_PRESSURE, 0);

export const spaceWeather = {
  /** The fronts' chunk has been asked for (App.tsx mounts it from then on). */
  started: false,
  /** The table, once loaded (null until then, or if it failed). */
  cmes: null as Cme[] | null,
  longest: 0,
  /** The CMEs in flight at the date (whether or not drawn). */
  flying: [] as Cme[],
  /** The fronts are wanted this frame: the layer on, a CME in flight and the camera among the planets. */
  want: false,
  /** How much of each CME's front shows on the screen now, 0–1, by id (written by the chunk; the cards read it). */
  shown: new Map<string, number>(),
  /** What presses on Earth's magnetosphere now. */
  earth: { pressure: QUIET_PRESSURE, bz: 0, r0: quiet.r0, alpha: quiet.alpha, cme: null } as EarthStorm,
  /** GFZ's Kp index, once loaded, and its value at the date (null: none measured, or not loaded). */
  kp: null as KpTable | null,
  kpNow: null as number | null,
  version: 0,
};

const listeners = new Set<() => void>();
export function subscribeSpaceWeather(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
const changed = () => {
  spaceWeather.version++;
  listeners.forEach((f) => f());
};

let cmesLoading = false;
function loadCmes(): void {
  if (cmesLoading) return;
  cmesLoading = true;
  fetchGzip(assetUrl('data/space-weather/cmes.json.gz'))
    .then((b) => {
      const list = parseCmes(JSON.parse(new TextDecoder().decode(b)) as CmeFile);
      spaceWeather.cmes = list;
      spaceWeather.longest = longestFlight(list);
      changed();
    })
    .catch((err) => console.warn('[space weather] the CME table did not load', err));
}

let kpLoading = false;
function loadKp(): void {
  if (kpLoading) return;
  kpLoading = true;
  fetchGzip(assetUrl('data/space-weather/kp.bin.gz'))
    .then((b) => {
      spaceWeather.kp = parseKp(b);
      changed();
    })
    .catch((err) => console.warn('[space weather] the Kp index did not load', err));
}

/** Ask for the Kp index (the aurora's chunk does, when it draws with Kp "Auto"). */
export const wantKp = (): void => loadKp();

const covered = (ms: number) => SPANS.some(([a, b]) => ms >= a && ms < b);

/** Once a frame, after the ephemeris (scene/SimDriver.tsx). */
export function updateSpaceWeather(): void {
  const ms = sim.timeMs;
  const ui = useUI.getState();
  const sun = sim.bodies.sun;
  const near = !!sun?.present && !solarSystemHidden() && sim.camera.pos.distanceTo(sun.pos) < CME_REACH_KM;
  if (!spaceWeather.cmes && near && covered(ms)) loadCmes();
  const list = spaceWeather.cmes;
  if (list) inFlight(list, ms, spaceWeather.longest, spaceWeather.flying);
  else spaceWeather.flying.length = 0;
  earthStorm(spaceWeather.flying, ms, spaceWeather.earth);
  spaceWeather.want = ui.cmes && near && spaceWeather.flying.length > 0;
  if (spaceWeather.want && !spaceWeather.started) {
    spaceWeather.started = true;
    changed();
  }
  if (ui.auroraKp === 'auto') {
    const k = spaceWeather.kp;
    spaceWeather.kpNow = k ? kpAt(k, ms) : null;
  }
}

/** The Kp the aurora is drawn at now: the visitor's, or with "Auto" the measured one (KP_FALLBACK where there is none). */
export function auroraKpNow(): number {
  const kp = useUI.getState().auroraKp;
  if (kp !== 'auto') return kp;
  return spaceWeather.kpNow ?? KP_FALLBACK;
}

/** The CMEs whose cards show: up to two of those drawn now, those heading for Earth first, then the most visible. */
export function cmeCardsNow(): CmeCard[] {
  const out: { c: Cme; s: number }[] = [];
  for (const c of spaceWeather.flying) {
    const s = spaceWeather.shown.get(c.id) ?? 0;
    if (s >= 0.25) out.push({ c, s: s + (c.drawnArrivalMs !== null ? 1 : 0) + (c.arrivalMs !== null ? 1 : 0) });
  }
  out.sort((a, b) => b.s - a.s);
  return out.slice(0, 2).map((o) => cmeCard(o.c));
}

/** How many CMEs are in flight now beyond those with cards. */
export const cmesInFlight = (): number => spaceWeather.flying.length;

export { CARRINGTON_ID } from './cards';

// For the development tools: window.__spaceWeather.
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __spaceWeather: spaceWeather });
