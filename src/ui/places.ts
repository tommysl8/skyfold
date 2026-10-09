/**
 * Places in the app (state/place.ts is the data and its link): capturePlace reads the view as a place, applyPlace puts
 * the camera and the clock back there, and placeUrl / sharePlace pass one on as a link.
 *
 * Capturing is exact where the camera is: in orbit, the orbit's own offset (controller.orbitOffsetKm; world − world is
 * 10⁵ km coarse at 40 Mpc); about a black hole, the hole-relative place and the exact height above the horizon
 * (controller.holeRelative, holeHeightKm). Roaming or flying the ship, the camera's place is kept as an orbit pose about
 * the body Roam takes its pace from (or the nearest body), from the world positions. Mid-slew, the slew's end; mid-trip
 * (a relativistic flight, or a fall into a black hole), the trip's destination at its framing distance, as it would be
 * framed on arrival: a place to go back to, not a moment of a flight, which cannot be restarted halfway.
 *
 * Applying sets the clock as a date scene does (content/scenes.ts jumpTo, backToPresent) and places the camera at once
 * (controller.placeAt, with the exact height over a black hole), or with the usual slew from a menu. A body whose data
 * are still loading is waited for, looking every quarter second as the scenes' whenLensReady does, with a quiet note
 * over the view ("Loading the star catalogue…"); one registered only on demand (a catalogue star, an asteroid, an NGC
 * object, a planet of the exoplanet archive) is registered the way Where to? does it. It gives up at once when its data
 * failed, when everything that could have it has loaded without it (an id renamed since: "not found"), or after a
 * minute; the view then stays where it is, and the note says so. Near a black hole it also waits for the lens's
 * programs (render/lens/lensState.ts lensProgramsReady), without which the hole is not drawn. The visitor moving the
 * camera or starting a trip meanwhile cancels it, as it cancels a scene's waiting step.
 */
import { useSyncExternalStore } from 'react';
import { Vector3 } from 'three';
import { blackHoleRsKm, controller, hoverFloorKm, MAX_DIST_KM } from '../controls/cameraController';
import { framingDistance, minDistance } from '../controls/framing';
import { surroundings } from '../controls/roam';
import { bodyName, isBody, type BodyId } from '../sim/bodies';
import { sim } from '../sim/sim';
import { travel } from '../sim/travel';
import { resetToNow, setEpoch, setPaused, setWarp } from '../sim/clock';
import { updateEphemeris } from '../sim/ephemeris';
import { lensProgramsReady } from '../render/lens/lensState';
import { ensureCatalogueStar, starStatus } from '../sim/stars';
import { solarSystemStatus } from '../sim/solarSystem';
import { galaxyStatus, nebulaStatus } from '../sim/galaxy/load';
import { cosmosStatus } from '../sim/cosmos/load';
import { catalogueStatus, ensureHost, exoplanetData, featuredStatus, hostBodyId, loadExoplanetCatalogue, planetBodyId } from '../sim/exoplanets';
import { ALL_DEEP_SKY, deepSkyGate, requestDeepSky } from '../sim/deepsky';
import { loadSmallNames, smallNames } from '../sim/asteroids/names';
import { locateNumber } from '../sim/asteroids/format';
import { ensureSmallBody, type SmallRef } from '../sim/asteroids/bodies';
import { normalise } from '../content/destinations';
import { cancelSceneStep, ready, targetData, targetName } from '../content/scenes';
import { useUI } from '../state/ui';
import { dateLabel, encodePlace, type Place, type PlaceDir } from '../state/place';
import { notice } from './notices';

// ─── Capturing ──────────────────────────────────────────────────────────────────────────

const rel = new Vector3();

const unit = (v: Readonly<Vector3>): PlaceDir | undefined => {
  const l = v.length();
  return l > 0 ? { x: v.x / l, y: v.y / l, z: v.z / l } : undefined;
};

/** The view now as a place (null when there is nothing to stand by: the camera's body has left the registry). */
export function capturePlace(): Place | null {
  const ui = useUI.getState();
  const c = controller;
  const clock = { t: sim.live ? ('now' as const) : sim.timeMs, w: sim.warp, p: sim.paused };
  const sel = ui.selected && isBody(ui.selected) ? { sel: ui.selected } : {};
  // Mid-trip (a relativistic flight, or a fall into a black hole: both hold tripActive) the place is the trip's
  // destination, framed as on arrival (its framing distance, the app's own direction): a flight cannot be resumed
  // halfway, and the view from the ship belongs to the trip.
  if (ui.tripActive) {
    const dest = ui.fallActive ? c.target : travel.trip?.dest;
    return dest && isBody(dest) ? { at: dest, ...clock, ...sel } : null;
  }
  // Mid-slew: where it ends.
  const slew = c.slewGoal;
  if (slew) {
    const pose = Number.isNaN(slew.heightKm) ? { r: slew.distKm } : { h: slew.heightKm };
    return isBody(slew.id) ? { at: slew.id, dir: unit(slew.dir), ...pose, ...clock, ...sel } : null;
  }
  // About a black hole (hovering, Roam or the ship near it, a circular orbit, a snapshot): exact, relative to the hole.
  const hole = c.holeRelative(rel);
  if (hole && isBody(hole) && Number.isFinite(c.holeHeightKm)) {
    return { at: hole, dir: unit(rel), h: Math.max(hoverFloorKm(hole), c.holeHeightKm), ...clock, ...sel };
  }
  // In orbit: the orbit's own offset, exact.
  if (c.mode === 'orbit' && isBody(c.target) && c.orbitOffsetKm(c.target, rel)) {
    return { at: c.target, dir: unit(rel), r: rel.length(), ...clock, ...sel };
  }
  // Roaming or flying the ship: an orbit pose about the body Roam takes its pace from, or the nearest one.
  const near = c.mode === 'roam' && surroundings.id && sim.bodies[surroundings.id]?.present ? surroundings.id : c.nearestBody();
  const b = sim.bodies[near];
  if (!b) return null;
  rel.copy(sim.camera.pos).sub(b.pos);
  const r = rel.length();
  return r > 0 ? { at: near, dir: unit(rel), r, ...clock, ...sel } : { at: near, ...clock, ...sel };
}

/** A body's name for a place: its registry name, a known target's, or its id. */
export const placeName = (id: string): string => (isBody(id) ? bodyName(id) : targetName(id));

/** "Betelgeuse · 3 Mar 2031": the default name of a saved place (the date the clock shows, when it is "now"). */
export function defaultLabel(p: Place, name = placeName(p.at)): string {
  return `${name} · ${dateLabel(p.t === 'now' ? sim.timeMs : p.t)}`;
}

// ─── The note over the view ─────────────────────────────────────────────────────────────

/** What applying a place is doing, for the note over the view (ui/overlays/PlacePrompt.tsx). */
export interface PlaceNote {
  kind: 'loading' | 'failed';
  text: string;
}

let note: PlaceNote | null = null;
const noteListeners = new Set<() => void>();
let noteTimer: ReturnType<typeof setTimeout> | undefined;

function setNote(n: PlaceNote | null): void {
  if (note?.kind === n?.kind && note?.text === n?.text) return;
  note = n;
  clearTimeout(noteTimer);
  // A failure is said for a few seconds, then the view is left alone.
  if (n?.kind === 'failed') noteTimer = setTimeout(() => setNote(null), 9000);
  noteListeners.forEach((f) => f());
}

export const usePlaceNote = (): PlaceNote | null =>
  useSyncExternalStore(
    (f) => {
      noteListeners.add(f);
      return () => noteListeners.delete(f);
    },
    () => note,
  );

/** The note now (outside React: the tests). */
export const placeNote = (): PlaceNote | null => note;

/** Say briefly that a place could not be gone to. */
export const sayPlace = (text: string): void => setNote({ kind: 'failed', text });

/** Put the note away (its close button). */
export const dismissPlaceNote = (): void => setNote(null);

// ─── Finding the body ───────────────────────────────────────────────────────────────────

type Found = { state: 'ready'; id: BodyId } | { state: 'wait'; text: string } | { state: 'failed'; text: string };

/** What has been asked for on the place's behalf (each once), and whether an on-demand search came back empty. */
interface Hunt {
  asked: Set<string>;
  empty: boolean;
}

const LOOKING = 'Looking for this place…';
const NOT_FOUND = (id: string) => `“${placeName(id)}” was not found (it may have been renamed), so the view stays here.`;

/** A comet's id as the small-body layer makes it (sim/asteroids/bodies.ts smallBodyId). */
const cometId = (designation: string) =>
  `comet-${designation
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

/** An asteroid by number or a comet by designation, as Where to? registers one (content/asteroidDestinations.ts). */
async function ensureSmall(id: string): Promise<BodyId | null> {
  const f = await loadSmallNames(normalise);
  if (!f) return null;
  const num = /^asteroid-(\d+)$/.exec(id);
  let ref: SmallRef | null = null;
  if (num) ref = locateNumber(f.sectionOf, Number(num[1]));
  else {
    const c = smallNames.comets.find(([des]) => cometId(des) === id);
    if (c) ref = { section: c[1], index: c[2] };
  }
  return ref ? ensureSmallBody(ref) : null;
}

/** A host or a planet of the exoplanet archive by its id, as Where to? registers one (content/exoplanetDestinations.ts). */
function ensureArchive(id: string): BodyId | null {
  const cat = exoplanetData.catalogue;
  if (!cat) return null;
  for (let h = 0; h < cat.hosts.count; h++) if (hostBodyId(h) === id) return ensureHost(h);
  for (let i = 0; i < cat.planets.count; i++) {
    if (planetBodyId(i) !== id) continue;
    const host = ensureHost(cat.planets.host[i]);
    // The planet itself if it is a body now; failing that its star.
    return isBody(id) ? id : host;
  }
  return null;
}

const settled = (s: string) => s === 'ready' || s === 'failed';

function findBody(id: string, hunt: Hunt): Found {
  if (isBody(id)) return { state: 'ready', id };
  // A catalogue star found by name or approached (star-27989): registered once the catalogue is in (its texts are
  // those of any named star, which come with the same catalogue).
  const star = /^star-(\d+)$/.exec(id);
  if (star) {
    const s = starStatus();
    if (s === 'failed') return { state: 'failed', text: targetData('betelgeuse').failed };
    if (s === 'ready' && !hunt.asked.has('star')) {
      hunt.asked.add('star');
      void ensureCatalogueStar(Number(star[1])).then((b) => (hunt.empty = !b));
    }
    return hunt.empty ? { state: 'failed', text: NOT_FOUND(id) } : { state: 'wait', text: targetData('betelgeuse').loading };
  }
  // An asteroid by number, or a comet: their names are loaded, then the body's own file.
  if (/^asteroid-\d+$|^comet-/.test(id)) {
    if (!hunt.asked.has('small')) {
      hunt.asked.add('small');
      void ensureSmall(id).then((b) => (hunt.empty = !b));
    }
    return hunt.empty ? { state: 'failed', text: NOT_FOUND(id) } : { state: 'wait', text: 'Loading its orbit…' };
  }
  // One of the targets the app knows: its data say.
  const data = targetData(id);
  if (data.known) {
    if (data.status === 'failed') return { state: 'failed', text: data.failed };
    if (data.status === 'ready') return { state: 'failed', text: NOT_FOUND(id) };
    return { state: 'wait', text: data.loading };
  }
  // Anything else: once everything that loads with the page is in, the catalogues loaded on demand (the deep-sky
  // objects, the planets of other stars) are asked; not found when they have all loaded (or failed) without it.
  const page = [solarSystemStatus(), starStatus(), featuredStatus(), galaxyStatus(), nebulaStatus(), cosmosStatus()];
  if (page.some((s) => s === 'loading')) return { state: 'wait', text: LOOKING };
  if (!hunt.asked.has('catalogues')) {
    hunt.asked.add('catalogues');
    requestDeepSky(ALL_DEEP_SKY);
    void loadExoplanetCatalogue();
  }
  const deep = deepSkyGate.runtime;
  const got = deep?.ensureId(id) ?? null;
  if (got) return { state: 'ready', id: got };
  if (exoplanetData.catalogue && !hunt.asked.has('archive')) {
    hunt.asked.add('archive');
    const host = ensureArchive(id);
    if (host) return { state: 'ready', id: host };
  }
  if (deep?.settled() && settled(catalogueStatus())) return { state: 'failed', text: NOT_FOUND(id) };
  return { state: 'wait', text: LOOKING };
}

// ─── Applying ───────────────────────────────────────────────────────────────────────────

/** How often a place waiting for its body looks again, ms (as the scenes' whenLensReady). */
const POLL_MS = 250;
/** A note shows only for a wait longer than this, ms (a body that is there at once needs none). */
const QUIET_MS = 400;
/** Data still not in after this long, ms: give up. */
const GIVE_UP_MS = 60_000;
const LENS_WAITS = 'Going there as soon as the black hole can be drawn: the graphics card is still preparing it.';
const IN_FLIGHT = 'Not in flight: finish or abort the trip first.';

let cancelPending: (() => void) | null = null;

/** Whether a place is being waited for. */
export const placePending = (): boolean => cancelPending !== null;

/** Drop the place being waited for (and its note). */
export function cancelPlace(): void {
  cancelPending?.();
  cancelPending = null;
}

/** The clock as the place has it, as a date scene sets it. */
function setClock(p: Place): void {
  if (p.t === 'now') resetToNow();
  else setEpoch(p.t, true);
  if (sim.warp !== p.w) setWarp(p.w);
  setPaused(p.p);
  // So the body is placed where it is at the new date.
  updateEphemeris();
}

/** Put the camera at the place, about `id` (the place's body, or the one found for it). */
function put(p: Place, id: BodyId, smooth: boolean): boolean {
  if (!ready()) return false;
  cancelSceneStep();
  setClock(p);
  if (!sim.bodies[id]?.present) {
    setNote({ kind: 'failed', text: `${placeName(id)} is not there at the date of this place, so the view stays here.` });
    return false;
  }
  useUI.setState({ journeyNote: null, journeysOpen: false, searchOpen: false });
  const dir = p.dir ? new Vector3(p.dir.x, p.dir.y, p.dir.z) : undefined;
  const rs = blackHoleRsKm(id);
  if (rs > 0) {
    const floor = hoverFloorKm(id, rs);
    let h = p.h ?? (p.r !== undefined ? p.r - rs : framingDistance(id) - rs);
    // Written to 12 figures, a hover on the floor comes back within 5 × 10⁻¹² of it: it is the floor.
    if (Math.abs(h - floor) <= floor * 1e-11) h = floor;
    h = Math.max(floor, h);
    controller.placeAt(id, rs + h, dir, h);
  } else {
    const dist = Math.min(MAX_DIST_KM, Math.max(minDistance(id), p.r ?? framingDistance(id)));
    if (smooth) controller.goTo(id, { distance: dist, direction: dir });
    else controller.placeAt(id, dist, dir);
  }
  useUI.getState().select(p.sel && isBody(p.sel) && sim.bodies[p.sel]?.present ? p.sel : null);
  return true;
}

/**
 * Go to a place: the clock and the camera, at once (or with the usual slew from a menu, `smooth`, except over a black
 * hole, which is placed exactly). Waits for a body still loading (see the file comment); `done` hears whether it got
 * there. False when it cannot even start (on a trip).
 */
export function applyPlace(p: Place, opts: { smooth?: boolean; done?: (ok: boolean) => void } = {}): boolean {
  cancelPlace();
  if (useUI.getState().tripActive) {
    notice(IN_FLIGHT);
    opts.done?.(false);
    return false;
  }
  const start = performance.now();
  const move = controller.moves;
  const hunt: Hunt = { asked: new Set(), empty: false };
  let timer: ReturnType<typeof setInterval> | undefined;
  let over = false;
  const finish = (ok: boolean) => {
    if (over) return;
    over = true;
    clearInterval(timer);
    cancelPending = null;
    opts.done?.(ok);
  };
  const tick = () => {
    if (over) return;
    // The visitor moved on (a slew, a scene, a trip): the place is no longer wanted.
    if (controller.moves !== move || useUI.getState().tripActive) {
      setNote(null);
      return finish(false);
    }
    const waited = performance.now() - start;
    const f = findBody(p.at, hunt);
    if (f.state === 'ready') {
      if (blackHoleRsKm(f.id) > 0 && !lensProgramsReady()) {
        if (waited > QUIET_MS) setNote({ kind: 'loading', text: LENS_WAITS });
        return;
      }
      setNote(null);
      return finish(put(p, f.id, !!opts.smooth));
    }
    if (f.state === 'failed' || waited > GIVE_UP_MS) {
      setNote({ kind: 'failed', text: f.state === 'failed' ? f.text : NOT_FOUND(p.at) });
      return finish(false);
    }
    if (waited > QUIET_MS) setNote({ kind: 'loading', text: f.text });
  };
  cancelPending = () => {
    if (over) return;
    setNote(null);
    finish(false);
  };
  tick();
  if (!over) timer = setInterval(tick, POLL_MS);
  return true;
}

// ─── Links ──────────────────────────────────────────────────────────────────────────────

/** The link to a place: this page's address with the place as its query (and no reading page). */
export const placeUrl = (p: Place): string => `${location.origin}${location.pathname}?${encodePlace(p)}`;

/** Copy text to the clipboard (the older way where the Clipboard API is missing: an insecure page). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** A phone or a tablet (a touch screen as the main pointer): the system's share sheet is the natural way there. */
const touchFirst = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Pass a place on: the share sheet on a phone (where the browser has one), otherwise the link copied to the
 * clipboard. 'cancelled' when the share sheet was closed; 'failed' when neither worked.
 */
export async function sharePlace(p: Place, name = placeName(p.at)): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = placeUrl(p);
  if (touchFirst() && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `${name} in Skyfold`, url });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}
