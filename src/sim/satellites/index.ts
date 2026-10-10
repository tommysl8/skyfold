/**
 * Satellites (docs/data/near-earth.md): the International Space Station, Tiangong and Hubble as bodies, always, and
 * behind the View menu's Satellites switch every active satellite CelesTrak lists (about 15,000), with the tracked
 * debris of four break-ups as a sub-switch.
 *
 * This module is the small part that comes with the app: it registers the three craft (placed by a provider that
 * waits for their elements), and keeps the state the rest reads. Their elements, SGP4 and the swarm's scene are a
 * chunk of their own (named.ts, scene/Satellites.tsx), fetched once the browser is idle after start-up; the swarm's
 * 15,000 element sets are fetched only when the switch is first turned on.
 */
import type { AstroTime } from 'astronomy-engine';
import { registerBodies, type Availability, type BodyRecord, type PositionProvider, type Vec3Like } from '../bodies';
import { GOOD_DAYS, NAMED_CRAFT, SHOWN_DAYS, type NamedCraft } from './records';
import type { SatRec } from './sgp4';

export { GOOD_DAYS, SHOWN_DAYS };

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** One of the three craft once its elements are in (named.ts fills it). */
export interface NamedState {
  /** Element set epoch (Julian date, UTC). */
  epochJd: number;
  /** Launch (ms since 1970). */
  launchMs: number;
  /** SGP4's state for its element set (the trace propagates it directly). */
  rec: SatRec;
  /** Writes the position (J2000 ecliptic km from Earth's centre) and velocity (km/s) at `time`, by SGP4. */
  place(time: AstroTime, pos: Vec3Like, vel?: Vec3Like | null): void;
}

export const satellites = {
  /** The chunk (named.ts and the scene) has been asked for: App.tsx mounts the scene from then on. */
  started: false,
  namedStatus: 'idle' as LoadStatus,
  namedError: null as string | null,
  named: new Map<string, NamedState>(),
  /** The swarm (scene/Satellites.tsx writes it): what loaded, from when, and why it is hidden if it is. */
  swarm: {
    status: 'idle' as LoadStatus,
    message: null as string | null,
    count: 0,
    debrisCount: 0,
    /** Median epoch of the element sets (Julian date, UTC), and when they were downloaded (ms). */
    epochJd: NaN,
    fetchedAt: 0,
    stale: false,
    /** 0–1: how much of the swarm shows at the date shown (it fades out 14–30 days from the elements). */
    shown: 0,
  },
  /**
   * Set by the scene chunk: the swarm satellite nearest a screen point (CSS px), and registering it as a body. The
   * click handler (scene/SimDriver.tsx) asks after the bodies and the small bodies.
   */
  pick: null as ((x: number, y: number) => { index: number; px: number } | null) | null,
  ensure: null as ((index: number) => Promise<string | null>) | null,
  version: 0,
};

const listeners = new Set<() => void>();
export function subscribeSatellites(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
export function notifySatellites(): void {
  satellites.version++;
  for (const f of listeners) f();
}

/** Availability objects, made once per craft and state, so the per-frame calls return shared objects. */
function availabilities(c: NamedCraft) {
  const make = (reason: string): Availability => ({ available: false, reason, regime: 'unknown' });
  return {
    loading: make(`The ${c.shortName ?? c.name}’s orbit is on its way from CelesTrak.`),
    failed: make(''),
    before: make(`The ${c.shortName ?? c.name} had not been launched yet.`),
    far: make(''),
    approximate: { available: true, reason: null, regime: 'approximate' } as Availability,
    illustrative: { available: true, reason: null, regime: 'illustrative' } as Availability,
  };
}

function namedProvider(c: NamedCraft): PositionProvider {
  const a = availabilities(c);
  const name = c.shortName ?? c.name;
  return {
    label: 'SGP4 from CelesTrak’s GP elements',
    availability(timeMs) {
      const s = satellites.named.get(c.id);
      if (!s) {
        if (satellites.namedStatus === 'idle' || satellites.namedStatus === 'loading') return a.loading;
        (a.failed as { reason: string }).reason = `${name}: ${satellites.namedError ?? 'its orbital elements could not be fetched.'}`;
        return a.failed;
      }
      if (timeMs < s.launchMs) return a.before;
      const days = Math.abs(timeMs / 86400000 + 2440587.5 - s.epochJd);
      if (days > SHOWN_DAYS) {
        if (!a.far.reason) {
          const d = new Date((s.epochJd - 2440587.5) * 86400000).toISOString().slice(0, 10);
          (a.far as { reason: string }).reason =
            `Skyfold places the ${name} from its current orbital elements (${d}); SGP4 cannot say where it was or will be months from them, so it is not shown at this date.`;
        }
        return a.far;
      }
      return days <= GOOD_DAYS ? a.approximate : a.illustrative;
    },
    positionAt(time, pos, vel) {
      const s = satellites.named.get(c.id);
      if (s) s.place(time, pos, vel);
      else {
        pos.x = pos.y = pos.z = 0;
        if (vel) vel.x = vel.y = vel.z = 0;
      }
    },
  };
}

/** The record of one of the three, before or after its elements arrive (`positionNote` then says from when). */
export function namedRecord(c: NamedCraft, positionNote?: string): BodyRecord {
  return {
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    aliases: c.aliases,
    kind: 'spacecraft',
    kindText: c.kindText,
    parent: 'earth',
    physical: { radiusKm: c.radiusKm, massKg: c.massKg, geometricAlbedo: 0.3, colour: c.colour },
    visual: { renderer: 'spacecraft', craft: c.craft },
    facts: c.facts,
    factSources: c.factSources,
    mission: c.mission,
    dataSource: 'NASA and CMSA mission pages; orbit: CelesTrak GP elements (US Space Force), SGP4.',
    positionNote: positionNote ?? 'Position: SGP4 from current orbital elements, fetched from CelesTrak once the app is running.',
    modelNotes: [
      c.sizeNote,
      'A simple model of its shape at true size; its attitude is the usual one, not tracked.',
      'Its orbit is drawn as a short trace while it is selected.',
    ],
    // The trace (scene/Satellites.tsx) replaces the orbit line; its pulses would repeat Earth's.
    orbitLine: false,
    detector: false,
    labelRank: 40,
    framing: { distanceKm: Math.max(0.15, c.radiusKm * 14) },
    article: c.article,
    provider: namedProvider(c),
  };
}

let registered = false;
/** Register the three craft (once, at start-up; main.tsx) and start fetching their elements when the browser is idle. */
export function registerSatellites(opts: { idle?: boolean } = {}): void {
  if (registered) return;
  registered = true;
  registerBodies(NAMED_CRAFT.map((c) => namedRecord(c)));
  const start = () => {
    satellites.started = true;
    notifySatellites();
    void import('./named').then((m) => m.loadNamedCraft());
  };
  if (!opts.idle) start();
  else if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 1500);
}
