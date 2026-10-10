/**
 * The neighbourhood's dust: its bodies at once (nine named clouds and the Radcliffe Wave: labels, cards, search),
 * its grids only when wanted (scene/DustClouds.tsx asks): the outer one (1.8 MB) once the camera is a few parsecs
 * from the Sun and within reach of the neighbourhood, the inner one (1.8 MB) once it is near the inner box. From
 * home neither is fetched: the sky from Earth already holds the real dust (render/dustLayer.ts).
 */
import { isBody, registerBodies } from '../bodies';
import { assetUrl } from '../../render/textures';
import { fetchGzip } from '../stars/catalogue';
import { dustRecords } from './clouds';
import { decodeDustGrid, DUST_FILES, type DustGrid, type DustGridName } from './volume';

export type DustStatus = 'idle' | 'loading' | 'ready' | 'failed';

export const dustState = {
  status: { outer: 'idle', inner: 'idle' } as Record<DustGridName, DustStatus>,
  grids: { outer: null, inner: null } as Record<DustGridName, DustGrid | null>,
  version: 0,
};

const listeners = new Set<() => void>();
function changed(): void {
  dustState.version++;
  listeners.forEach((f) => f());
}
export const dustVersion = (): number => dustState.version;
export function subscribeDust(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The named clouds and the Radcliffe Wave (once). */
export function registerDustClouds(): void {
  const records = dustRecords().filter((r) => !isBody(r.id));
  if (records.length) registerBodies(records);
}

/** Fetch a grid (once; a failed one may be asked for again after a minute). */
export function wantDustGrid(name: DustGridName): void {
  if (dustState.status[name] !== 'idle') return;
  dustState.status[name] = 'loading';
  changed();
  void (async () => {
    try {
      const buf = await fetchGzip(assetUrl(DUST_FILES[name]));
      dustState.grids[name] = decodeDustGrid(buf);
      dustState.status[name] = 'ready';
    } catch (err) {
      console.warn(`[lightspeed] the dust map (${name}) did not load; the sky is unaffected (${err})`);
      dustState.status[name] = 'failed';
      setTimeout(() => {
        dustState.status[name] = 'idle';
      }, 60_000);
    }
    changed();
  })();
}
