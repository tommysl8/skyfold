/**
 * The deep-sky catalogues (docs/data/deepsky.md): the NGC and IC objects that have a measured distance (OpenNGC), the
 * pulsars of the ATNF catalogue, the Milky Way's supernova remnants with distances and the mergers heard in
 * gravitational waves (GWOSC). Each can be found in "Where to?", picked in the view, visited, and read about on a short
 * card; the markers are scene/DeepSky.tsx's.
 *
 * This module is the small part that comes with the app: it decides, each frame, which catalogues are wanted (their
 * layer shows where the camera is: ui/deepSkyLayers.ts; "Where to?" is open; one is turned on) and hands over to the
 * runtime (runtime.ts: the readers, records, search and picking, a chunk of its own) the first time any is. Until then
 * nothing of it is downloaded, code or data.
 */
import type { PerspectiveCamera } from 'three';
import { retryAfterMs } from '../../lib/retry';
import type { BodyId } from '../bodies';
import type { Destination } from '../../content/destinations';
import type { DeepSkySetId } from './format';

export type { DeepSkySetId } from './format';

/** What is under the pointer: a marker of a catalogue that is not a body (yet). */
export interface DeepSkyPick {
  set: DeepSkySetId;
  index: number;
  /** Its marker on screen, CSS px, and the pointer's distance from it. */
  x: number;
  y: number;
  px: number;
}

/** Which layers show now (ui/deepSkyLayers.ts deepSkyLayersNow). */
export interface DeepSkyShown {
  ngc: boolean;
  ngcGalaxies: boolean;
  pulsars: boolean;
  gw: boolean;
}

/** What the runtime chunk provides once loaded. */
export interface DeepSkyRuntime {
  want(sets: readonly DeepSkySetId[]): void;
  update(keep: (id: BodyId) => boolean, shown: DeepSkyShown): void;
  pick(x: number, y: number, camera: PerspectiveCamera): DeepSkyPick | null;
  ensure(set: DeepSkySetId, index: number): BodyId | null;
  /** The body with this id in any catalogue loaded, registered if need be (null: none has it). */
  ensureId(id: string): BodyId | null;
  /** Every catalogue asked for has loaded or failed. */
  settled(): boolean;
  /** The name and what it is, for the hover tag. */
  describe(set: DeepSkySetId, index: number): { name: string; sub: string };
  search(query: string, limit?: number): Destination[];
  /** What has loaded (runtime.ts deepSky), for the development tools (window.__ls.deepSky). */
  readonly state: unknown;
}

/** The catalogues' state, as the rest of the app reads it. Subscribe to hear of changes. */
export const deepSkyGate = {
  runtime: null as DeepSkyRuntime | null,
  /** The runtime has been asked for (the scene mounts the layer from then on). */
  started: false,
  wanted: new Set<DeepSkySetId>(),
  shown: { ngc: false, ngcGalaxies: false, pulsars: false, gw: false } as DeepSkyShown,
  version: 0,
};

const listeners = new Set<() => void>();
export function deepSkyChanged(): void {
  deepSkyGate.version++;
  listeners.forEach((f) => f());
}
export const deepSkyVersion = (): number => deepSkyGate.version;
export function subscribeDeepSky(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let importing: Promise<void> | null = null;
let importFailures = 0;
let importRetryAt = 0;

/** Ask for catalogues: the runtime is fetched the first time (and tried again, after a wait, if that fails). */
export function requestDeepSky(sets: readonly DeepSkySetId[]): void {
  let added = false;
  for (const s of sets) {
    if (!deepSkyGate.wanted.has(s)) {
      deepSkyGate.wanted.add(s);
      added = true;
    }
  }
  if (deepSkyGate.runtime) {
    if (added) deepSkyGate.runtime.want([...deepSkyGate.wanted]);
    return;
  }
  if (importing || !deepSkyGate.wanted.size || performance.now() < importRetryAt) return;
  if (!deepSkyGate.started) {
    deepSkyGate.started = true;
    deepSkyChanged();
  }
  importing = import('./runtime')
    .then((m) => {
      deepSkyGate.runtime = m.deepSkyRuntime;
      importFailures = 0;
      m.deepSkyRuntime.want([...deepSkyGate.wanted]);
      deepSkyChanged();
    })
    .catch((err) => {
      importFailures++;
      importRetryAt = performance.now() + retryAfterMs(importFailures);
      console.warn(`[lightspeed] the deep-sky catalogues did not load; trying again (${err})`);
    })
    .finally(() => {
      importing = null;
    });
}

/** Every catalogue: for "Where to?", which searches them all. */
export const ALL_DEEP_SKY: readonly DeepSkySetId[] = ['ngc-galactic', 'snrs', 'pulsars', 'ngc-galaxies', 'gw-events'];

/**
 * Once a frame (scene/SimDriver.tsx): ask for the catalogues whose layer shows, and let the runtime keep its bodies
 * (registering the ones chosen, releasing those left behind: `keep` says which are looked at, selected or flown to).
 */
export function updateDeepSky(keep: (id: BodyId) => boolean, shown: DeepSkyShown): void {
  deepSkyGate.shown = shown;
  if (shown.ngc && !deepSkyGate.wanted.has('ngc-galactic')) requestDeepSky(['ngc-galactic', 'snrs']);
  if (shown.pulsars && !deepSkyGate.wanted.has('pulsars')) requestDeepSky(['pulsars']);
  if (shown.ngcGalaxies && !deepSkyGate.wanted.has('ngc-galaxies')) requestDeepSky(['ngc-galaxies']);
  if (shown.gw && !deepSkyGate.wanted.has('gw-events')) requestDeepSky(['gw-events']);
  // A failed fetch of the runtime is tried again while anything is wanted.
  if (!deepSkyGate.runtime && deepSkyGate.wanted.size && !importing && performance.now() >= importRetryAt) requestDeepSky([]);
  deepSkyGate.runtime?.update(keep, shown);
}

/** The marker under the pointer, if any (scene/picking.ts). */
export const pickDeepSky = (x: number, y: number, camera: PerspectiveCamera): DeepSkyPick | null => deepSkyGate.runtime?.pick(x, y, camera) ?? null;

/** The body for a picked marker, registering it if need be. */
export const ensureDeepSkyBody = (p: Pick<DeepSkyPick, 'set' | 'index'>): BodyId | null => deepSkyGate.runtime?.ensure(p.set, p.index) ?? null;

/** "Where to?"'s matches among the catalogues (empty until they have loaded). */
export const deepSkyDestinations = (query: string, limit?: number): Destination[] => deepSkyGate.runtime?.search(query, limit) ?? [];
