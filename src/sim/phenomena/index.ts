/**
 * Phenomena (docs/data/phenomena.md): the historical supernovae, the kilonova of GW170817, the relativistic jets of M87
 * and Centaurus A, and Earth's aurora. This module is the small part that comes with the app: it registers the
 * supernovae and the kilonova as bodies (kind 'transient'), sets each one's brightness and colour from its light
 * curve every frame (so from Earth the new star shines where and as it was seen), and decides when any model is near
 * enough to draw. The models themselves (scene/Phenomena.tsx, its materials and shaders) are a chunk of their own,
 * fetched the first time one is wanted; until then nothing of them is downloaded.
 *
 * Cost: six light curves read a frame (a bisection each) and a few distance tests.
 */
import { KPC_KM } from '../../physics/constants';
import { getBody, isBody, registerBodies } from '../bodies';
import { sim } from '../sim';
import { useUI } from '../../state/ui';
import { formatSimDate } from '../../lib/time';
import { formatIsoDate } from '../../content/learn/catalogue';
import { grownShare, nakedEyeEndMs, SUPERNOVAE, supernovaAt, type SupernovaState } from './supernovae';
import { KILONOVA_ID, kilonovaRecord, supernovaRecord } from './records';
import { kilonovaAt, MERGER_MS, type KilonovaState } from './kilonova';
import { updatePace } from './pace';

export { SUPERNOVAE, supernovaById } from './supernovae';
export { KILONOVA_ID } from './records';

/** What the phenomena's chunk needs to know this frame (written by updatePhenomena). */
export const phenomena = {
  /** The chunk has been asked for (App.tsx mounts it from then on). */
  started: false,
  /** Which models are wanted now. */
  want: { supernovae: false, kilonova: false, jets: false, aurora: false },
  /** The supernovae whose model is near enough to draw this frame. */
  near: new Set<string>(),
  /** Each supernova's state this frame, by id. */
  sn: new Map<string, SupernovaState>(),
  kilonova: null as KilonovaState | null,
  /** The models' materials, by name, for the development tools (window.__ls.phenomena.materials). */
  materials: {} as Record<string, unknown>,
  version: 0,
};

const listeners = new Set<() => void>();
export const phenomenaVersion = (): number => phenomena.version;
export function subscribePhenomena(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * The supernova remnants of the deep-sky catalogue whose marker is hidden while their model is drawn (scene/DeepSky.tsx
 * reads it, as it does the pulsars drawn up close).
 */
export const remnantShown: { ids: string[] } = { ids: [] };

let registered = false;
/** Register the supernovae and the kilonova (once; at start-up, main.tsx, and in the tests' universe). */
export function registerPhenomena(): void {
  if (registered || isBody('sn-1054')) return;
  registered = true;
  registerBodies([...SUPERNOVAE.map(supernovaRecord), kilonovaRecord()]);
}

/**
 * A supernova's remnant drawn by a picture (scene/Nebulae.tsx): its size at the date shown as a share of the picture's,
 * 0 before its light reached Earth. The Crab's picture grows with its filaments; SN 1987A's (Hubble's view of its ring
 * and the stars round it) is simply not there before 1987, nor while its model is drawn up close.
 */
export function remnantScale(id: string, ms: number): number {
  for (const sn of SUPERNOVAE) {
    if (sn.remnant.bodyId !== id) continue;
    if (sn.pictureRemnant) return grownShare(sn, ms);
    return ms > sn.explosionMs && !phenomena.near.has(sn.id) ? 1 : 0;
  }
  return 1;
}

/** A model is drawn within this many of its sizes (the remnant's or the fireball's radius). */
export const MODEL_REACH = 200;
/** The kilonova's model is drawn within this distance, km (its debris after a year is 2 × 10¹² km across). */
export const KILONOVA_REACH_KM = 1e14;
/** Jets are wanted once their galaxy is this many px across, and the camera has left the Milky Way (as the deep-sky galaxies: 30 kpc). */
const JET_PX = 4;
const JETS_FROM_KM = 30 * KPC_KM;

/**
 * Once a frame, after the ephemeris (scene/SimDriver.tsx): each transient's light from its curve, and which models are
 * near. Asks for the chunk the first time one is.
 */
export function updatePhenomena(): void {
  updatePace();
  const ms = sim.timeMs;
  let snNear = false;
  phenomena.near.clear();
  for (const sn of SUPERNOVAE) {
    const rec = getBody(sn.id);
    const b = sim.bodies[sn.id];
    if (!rec || !b) continue;
    const st = supernovaAt(sn, ms, phenomena.sn.get(sn.id));
    phenomena.sn.set(sn.id, st);
    const lum = rec.physical.luminous!;
    lum.vmag = st.vmag;
    lum.teffK = st.teffK;
    const size = Math.max(st.shockKm, st.photosphereKm);
    if (st.ageS > 0 && size > 0 && b.distCamera < MODEL_REACH * size) {
      snNear = true;
      phenomena.near.add(sn.id);
    }
  }
  const kn = getBody(KILONOVA_ID) ? sim.bodies[KILONOVA_ID] : undefined;
  phenomena.kilonova = kilonovaAt(ms, phenomena.kilonova ?? undefined);
  const knNear = !!kn && kn.distCamera < KILONOVA_REACH_KM && ms > MERGER_MS - 2 * 86_400_000;
  const ui = useUI.getState();
  const earth = sim.bodies.earth;
  const aurora = ui.aurora && !!earth?.present && earth.radiusPx > 1.5;
  const m87 = sim.bodies.m87;
  const cenA = sim.bodies['centaurus-a'];
  const jets = ui.jets && sim.camera.pos.length() > JETS_FROM_KM && ((!!m87 && m87.present && m87.radiusPx > JET_PX) || (!!cenA && cenA.present && cenA.radiusPx > JET_PX / 20));
  const w = phenomena.want;
  w.supernovae = snNear;
  w.kilonova = knNear;
  w.jets = jets;
  w.aurora = aurora;
  if (!phenomena.started && (snNear || knNear || jets || aurora)) {
    phenomena.started = true;
    phenomena.version++;
    listeners.forEach((f) => f());
  }
}

/** The scene that shows each transient (content/scenes.ts). */
export const TRANSIENT_SCENES: Record<string, string> = {
  'sn-1006': 'sn-1006-from-earth',
  'sn-1054': 'sn-1054-from-earth',
  'sn-1181': 'sn-1181-from-earth',
  'sn-1572': 'sn-1572-from-earth',
  'sn-1604': 'sn-1604-from-earth',
  'supernova-1987a': 'sn-1987a-from-earth',
  [KILONOVA_ID]: 'kilonova-gw170817',
};

const dateText = (ms: number) => formatIsoDate(formatSimDate(ms, 'date'));
const magText = (m: number) => m.toFixed(1).replace('-', '−');

/** The card's line on a transient at the date shown: how it looks from Earth, or when it can be seen. */
export function transientNow(id: string): string | null {
  const ms = sim.timeMs;
  if (id === KILONOVA_ID) {
    const k = phenomena.kilonova ?? kilonovaAt(ms);
    if (ms < MERGER_MS) return `Its gravitational waves reach Earth on ${dateText(MERGER_MS)}, its light half a day later.`;
    if (k.days < 30) return `Now ${Math.round(k.teffK).toLocaleString('en-GB')} K and magnitude ${magText(k.vmag)} from Earth: too faint to see without a telescope.`;
    return `Faded within weeks of ${dateText(MERGER_MS)}.`;
  }
  const sn = SUPERNOVAE.find((s) => s.id === id);
  if (!sn) return null;
  const st = phenomena.sn.get(id) ?? supernovaAt(sn, ms);
  if (st.vmag < 6.5) return `Seen from Earth now at magnitude ${magText(st.vmag)}.`;
  if (ms < sn.firstSeenMs) return `Not yet seen at this date: its light reaches Earth on ${dateText(sn.firstSeenMs)}.`;
  return `Faded from the naked eye by ${dateText(nakedEyeEndMs(sn))}; its remnant is ${sn.remnant.name === sn.name ? 'still there' : sn.remnant.name}.`;
}
