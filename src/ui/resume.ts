/**
 * Picking up where you left off, and links (state/place.ts, ui/places.ts). No accounts: on this device the place last
 * seen is kept in localStorage (`lightspeed.place`), and a link carries a place to any device.
 *
 *  - Opening the app with a link (?at=…) goes straight there: the welcome screen and the offer below are skipped for
 *    that visit (the welcome is not marked as seen), and the place's keys are taken out of the address
 *    (history.replaceState), so the address does not go stale as the visitor moves on. The reading pages' #/… routes
 *    (state/route.ts) are left as they are.
 *  - Otherwise, a returning visitor whose last place is not where the app opens anyway is offered it ("Pick up where you
 *    left off?", ui/overlays/PlacePrompt.tsx): Resume goes there, Start fresh forgets it. The offer goes by itself once
 *    the visitor starts something else (moves the camera, searches, takes a journey or a flight). A first visit gets the
 *    welcome screen, as always.
 *  - The view is saved every couple of seconds at most while it changes, and when the page is hidden or closed; never
 *    before the app has drawn its first frame, nor while the last place is still on offer or a place is being gone
 *    to (either would overwrite it with the opening view), nor during a slew (a scene's has steps still to come).
 *    Storage can be unavailable (blocked, private windows): then nothing is saved, and nothing breaks.
 *
 * Cost: one capture and one string compared every second (microseconds); a write only when the view has changed.
 */
import { useSyncExternalStore } from 'react';
import { controller } from '../controls/cameraController';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { createThrottle, decodePlace, encodePlace, hasPlaceLink, offerResume, parseLastPlace, withoutPlace, type LastPlace } from '../state/place';
import { applyPlace, capturePlace, placeName, sayPlace } from './places';

export const LAST_PLACE_KEY = 'lightspeed.place';
/** Saving while the view moves: at most this often, ms. */
const SAVE_EVERY_MS = 2000;

function readJson(key: string): unknown {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : JSON.parse(v);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

// ─── The offer ──────────────────────────────────────────────────────────────────────────

let offer: LastPlace | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** The last place on offer ("Pick up where you left off?"), or null. */
export const useResumeOffer = (): LastPlace | null =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => offer,
  );

let stopWatching: (() => void) | null = null;

function setOffer(o: LastPlace | null): void {
  if (o === offer) return;
  offer = o;
  stopWatching?.();
  stopWatching = o ? watchForOtherThings() : null;
  emit();
}

/** Going there. */
export function resume(): void {
  const o = offer;
  setOffer(null);
  const p = o ? decodePlace(o.q) : null;
  if (p) goTo(p);
}

/** Not this time: the last place is forgotten (the next one saved replaces it anyway). */
export function startFresh(): void {
  setOffer(null);
  writeJson(LAST_PLACE_KEY, null);
  throttle.seed(null);
}

/**
 * The offer goes once the visitor does something else: a drag, the wheel or a key in the view, a slew or a scene
 * (the camera's moves), Where to?, the journeys, the tour, a flight, Roam.
 */
function watchForOtherThings(): () => void {
  const away = () => setOffer(null);
  // On the window: the offer is made before the view is rendered.
  const inView = (e: Event) => {
    if ((e.target as Element | null)?.closest?.('.app-view') && !(e.target as Element).closest('[data-place-prompt]')) away();
  };
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('[data-place-prompt]') || ['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    away();
  };
  window.addEventListener('pointerdown', inView);
  window.addEventListener('wheel', inView, { passive: true });
  window.addEventListener('keydown', onKey);
  let moves = -1;
  const timer = window.setInterval(() => {
    // From the first frame on (it places the camera at the opening view: that is no move of the visitor's).
    if (sim.frame === 0) return;
    if (moves < 0) moves = controller.moves;
    else if (controller.moves !== moves) away();
  }, 250);
  const unsub = useUI.subscribe((s, prev) => {
    if (
      (s.searchOpen && !prev.searchOpen) ||
      (s.journeysOpen && !prev.journeysOpen) ||
      (s.tourStep !== null && prev.tourStep === null) ||
      (s.tripActive && !prev.tripActive) ||
      (s.plannerOpen && !prev.plannerOpen) ||
      (s.welcomeOpen && !prev.welcomeOpen) ||
      s.controlMode !== prev.controlMode
    )
      away();
  });
  return () => {
    window.removeEventListener('pointerdown', inView);
    window.removeEventListener('wheel', inView);
    window.removeEventListener('keydown', onKey);
    window.clearInterval(timer);
    unsub();
  };
}

// ─── Going to a place ───────────────────────────────────────────────────────────────────

/** A place being gone to: nothing is saved meanwhile (the opening view would replace the place wanted). */
let going = false;

/** Once the first frame has placed the camera at the opening view (scene/SimDriver.tsx), go to the place. */
function goTo(p: NonNullable<ReturnType<typeof decodePlace>>): void {
  going = true;
  const go = () => {
    if (sim.frame === 0) return;
    window.clearInterval(wait);
    applyPlace(p, { done: () => (going = false) });
  };
  const wait = window.setInterval(go, 100);
  go();
}

// ─── Saving ─────────────────────────────────────────────────────────────────────────────

const throttle = createThrottle(SAVE_EVERY_MS);
let stopped = false;

/** Save nothing more this visit (the preferences are being reset: a last save on the way out would undo it). */
export function stopSavingPlace(): void {
  stopped = true;
}

/** Save the view if it has changed (`now`: when the page goes away, without waiting for the throttle). */
function save(now = false): void {
  if (stopped || offer || going || sim.frame === 0 || controller.mode === 'transition') return;
  const p = capturePlace();
  if (!p) return;
  const q = encodePlace(p);
  const t = performance.now();
  if (now ? throttle.flush(q, t) : throttle.offer(q, t)) writeJson(LAST_PLACE_KEY, { q, name: placeName(p.at), savedAt: Date.now() } satisfies LastPlace);
}

// ─── Start-up ───────────────────────────────────────────────────────────────────────────

let started = false;

/**
 * At start-up, before the first render (main.tsx): a link's place is gone to, or the last place offered; and the view
 * is saved from then on.
 */
export function startPlaces(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const search = window.location.search;
  const last = parseLastPlace(readJson(LAST_PLACE_KEY));
  throttle.seed(last?.q ?? null);
  if (hasPlaceLink(search)) {
    // Straight there: no welcome (not marked as seen: the next visit without a link still gets it), no offer.
    useUI.setState({ welcomeOpen: false });
    window.history.replaceState(window.history.state, '', window.location.pathname + withoutPlace(search) + window.location.hash);
    const p = decodePlace(search);
    if (p) goTo(p);
    else sayPlace('This link could not be read, so the view starts here.');
  } else if (offerResume(last, { link: false, welcome: useUI.getState().welcomeOpen })) setOffer(last);
  window.setInterval(() => save(), 1000);
  window.addEventListener('pagehide', () => save(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save(true);
  });
}
