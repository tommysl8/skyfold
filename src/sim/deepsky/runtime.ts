/**
 * The deep-sky catalogues at run time (a chunk of its own, fetched by index.ts the first time one is wanted): each
 * file fetched once when wanted, tried again after 2 s, 4, 8… up to a minute if it fails (lib/retry.ts), read
 * (format.ts) and named (records.ts); the best-known objects of each registered as bodies while it is loaded (labels,
 * the Bodies list); any other object registered when it is chosen (picked, found in "Where to?", flown to) and
 * released a few seconds after nothing holds it, so the registry carries a handful, never thousands. Picking and search
 * work on the catalogues themselves.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import { MPC_KM, PARSEC_KM } from '../../physics/constants';
import { retryAfterMs } from '../../lib/retry';
import { assetUrl } from '../../render/textures';
import { fetchGzip } from '../stars/catalogue';
import { bodyRecords, getBody, isBody, registerBodies, unregisterBodies, type BodyId, type BodyRecord } from '../bodies';
import { updateEphemeris } from '../ephemeris';
import { screenOf } from '../derived';
import { sim, type ScreenPoint } from '../sim';
import { cosmicSky, removeExpansionMembers, setExpansionMembers } from '../cosmos/expansion';
import { apply, GAL_TO_WORLD, type Vec3 } from '../galaxy/frames';
import { findDestination, normalise, type Destination, type DestinationGroup } from '../../content/destinations';
import { goToBody } from '../../ui/navigation';
import { useUI } from '../../state/ui';
import { controller } from '../../controls/cameraController';
import { deepSkyChanged, type DeepSkyPick, type DeepSkyRuntime, type DeepSkySetId, type DeepSkyShown } from './index';
import {
  DEEP_SKY_FILES,
  MAGNETARS_FILE,
  mergeMagnetars,
  NGC_EXISTING_FILE,
  parseMagnetars,
  parseGwEvents,
  parseNgcExisting,
  parseNgcGalactic,
  parseNgcGalaxies,
  parsePulsars,
  parseSnrs,
  regionRadiusRad,
  type ColumnFile,
  type GwEvent,
  type NgcGalactic,
  type NgcGalaxy,
  type Pulsar,
  type SnrFile,
} from './format';
import {
  galaxyRadiusKpc,
  gwEntry,
  gwRecord,
  ngcGalacticEntry,
  ngcGalacticRecord,
  ngcGalaxyEntry,
  ngcGalaxyRecord,
  pulsarEntry,
  pulsarRecord,
  shownPulse,
  snrEntry,
  snrRecord,
  type DeepSkyEntry,
} from './records';
import MORE_GALAXY_NAMES from '../cosmos/moreGalaxyNames.json';
import { COMPACT_PX, galacticAlpha, galaxyAlpha, MIN_RING_PX, PICK_MIN_ALPHA, regionAlpha, STYLE } from './markers';

// ─── The loaded catalogues ──────────────────────────────────────────────────────────────

/** A galactic catalogue ready to draw and pick: heliocentric places in world axes, pc. */
export interface GalacticArrays {
  count: number;
  /** World axes, pc (float64 for picking; the scene takes float32 galactic ones). */
  worldPc: Float64Array;
  /** Heliocentric galactic, pc. */
  galPc: Float32Array;
  /** Radius drawn, pc (0: a compact mark). */
  radiusPc: Float32Array;
  style: Uint8Array;
  /** Pulsars: the period the marker pulses at, s (0: none). */
  pulseS: Float32Array;
}

/** An extragalactic catalogue ready to draw and pick: comoving places and anchors, world axes, Mpc. */
export interface ExtragalacticArrays {
  count: number;
  posMpc: Float64Array;
  anchorMpc: Float64Array;
  /** Galaxies: radius, Mpc; mergers: the region's angular radius, rad. */
  size: Float32Array;
  /** Mergers: the comoving distances of the near and far ends of the region, Mpc. */
  nearMpc: Float32Array;
  farMpc: Float32Array;
  /** Mergers: 0 two black holes, 1 a black hole and a neutron star, 2 two neutron stars. */
  kind: Uint8Array;
}

export interface LoadedSet {
  id: DeepSkySetId;
  entries: DeepSkyEntry[];
  /** Normalised names of each entry (its name, then its aliases), and the same without spaces. */
  names: string[][];
  compact: string[][];
  indexById: Map<string, number>;
  galactic?: GalacticArrays;
  extragalactic?: ExtragalacticArrays;
  record(index: number, entry: DeepSkyEntry): BodyRecord;
  /** The Bodies-list group of an entry. */
  group(index: number): DestinationGroup;
}

type Status = 'idle' | 'loading' | 'ready' | 'failed';

/** What has loaded, by catalogue. */
export const deepSky = {
  sets: new Map<DeepSkySetId, LoadedSet>(),
  status: new Map<DeepSkySetId, Status>(),
  failures: new Map<DeepSkySetId, number>(),
  retryAt: new Map<DeepSkySetId, number>(),
  /** Designations of bodies the app already has (normalised, and without spaces) → the name its search finds the body by. */
  existing: new Map<string, string>(),
  existingStatus: 'idle' as Status,
};

/** The downloads, and the clock their retries wait by (the tests replace both). */
export const deepSkyIO = {
  fetch: (path: string): Promise<ArrayBuffer> => fetchGzip(typeof location !== 'undefined' ? new URL(assetUrl(path), location.href).href : assetUrl(path)),
  now: (): number => performance.now(),
};

async function readJson(path: string): Promise<ColumnFile> {
  return JSON.parse(new TextDecoder().decode(await deepSkyIO.fetch(path))) as ColumnFile;
}

const tight = (s: string): string => s.replace(/ /g, '');

/** A catalogue's entries with their search names. */
function withNames(id: DeepSkySetId, entries: DeepSkyEntry[], rest: Omit<LoadedSet, 'id' | 'entries' | 'names' | 'compact' | 'indexById'>): LoadedSet {
  const names = entries.map((e) => [e.name, ...e.aliases].map(normalise));
  return { id, entries, names, compact: names.map((n) => n.map(tight)), indexById: new Map(entries.map((e, i) => [e.id, i])), ...rest };
}

const STYLE_OF_TYPE: Record<string, number> = { OCl: STYLE.openCluster, GCl: STYLE.globular, 'Cl+N': STYLE.nebula, PN: STYLE.planetary, HII: STYLE.nebula, Neb: STYLE.nebula, EmN: STYLE.nebula, RfN: STYLE.nebula };

function galacticArrays(list: readonly { pos: Vec3 }[], radiusPc: (i: number) => number, style: (i: number) => number, pulse: (i: number) => number = () => 0): GalacticArrays {
  const n = list.length;
  const out: GalacticArrays = { count: n, worldPc: new Float64Array(3 * n), galPc: new Float32Array(3 * n), radiusPc: new Float32Array(n), style: new Uint8Array(n), pulseS: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const g = list[i].pos;
    const w = apply(GAL_TO_WORLD, g);
    out.worldPc.set(w, 3 * i);
    out.galPc.set(g, 3 * i);
    out.radiusPc[i] = radiusPc(i);
    out.style[i] = style(i);
    out.pulseS[i] = pulse(i);
  }
  return out;
}

/** The radius an NGC/IC object of the Milky Way is drawn at, pc (its half-member or half-light radius, else half its size; 0 if unknown). */
function ngcRadiusPc(o: NgcGalactic): number {
  const e = o.extra as { r50?: number; rh?: number } | null;
  if (e?.r50) return e.r50;
  if (e?.rh) return e.rh;
  return o.sizeArcmin > 0 ? (o.distPc * o.sizeArcmin * Math.PI) / (180 * 60) / 2 : 0;
}

function buildGalacticNgc(list: NgcGalactic[]): LoadedSet {
  const entries = list.map(ngcGalacticEntry);
  return withNames('ngc-galactic', entries, {
    galactic: galacticArrays(list, (i) => ngcRadiusPc(list[i]), (i) => STYLE_OF_TYPE[list[i].type] ?? STYLE.nebula),
    record: (i, e) => ngcGalacticRecord(list[i], e),
    group: (i) => (['OCl', 'GCl', 'Cl+N'].includes(list[i].type) ? 'clusters' : 'nebulae'),
  });
}

function buildSnrs(file: SnrFile): LoadedSet {
  const entries = file.snrs.map(snrEntry);
  for (const [name, body] of file.existing) addExisting(name, body);
  return withNames('snrs', entries, {
    galactic: galacticArrays(file.snrs, () => 0, () => STYLE.remnant),
    record: (i, e) => snrRecord(file.snrs[i], e, file.methods),
    group: () => 'nebulae',
  });
}

function buildPulsars(list: Pulsar[], shown: (p0: number) => number): LoadedSet {
  const entries = list.map(pulsarEntry);
  return withNames('pulsars', entries, {
    galactic: galacticArrays(list, () => 0, (i) => (list[i].magnetar ? STYLE.magnetar : STYLE.pulsar), (i) => shown(list[i].p0)),
    record: (i, e) => pulsarRecord(list[i], e),
    group: () => 'pulsars',
  });
}

/**
 * The galaxies drawn as bodies of their own beyond the Local Group (sim/cosmos: the famous ones and the Virgo and Coma
 * clusters' brightest, public/data/more-galaxies.json.gz), by designation → the body's name: left out of the catalogue,
 * and their designations lead to the bodies.
 */
const MORE_GALAXIES = new Map(MORE_GALAXY_NAMES.names.map(([d, body]) => [d, body] as const));

function buildGalaxies(all: NgcGalaxy[]): LoadedSet {
  for (const [d, body] of MORE_GALAXIES) addExisting(d, body);
  const list = all.filter((o) => !MORE_GALAXIES.has(o.designation));
  const n = list.length;
  const x: ExtragalacticArrays = { count: n, posMpc: new Float64Array(3 * n), anchorMpc: new Float64Array(3 * n), size: new Float32Array(n), nearMpc: new Float32Array(n), farMpc: new Float32Array(n), kind: new Uint8Array(n) };
  list.forEach((o, i) => {
    x.posMpc.set(o.pos, 3 * i);
    x.anchorMpc.set(o.anchor, 3 * i);
    x.size[i] = galaxyRadiusKpc(o) / 1000;
  });
  return withNames('ngc-galaxies', list.map(ngcGalaxyEntry), { extragalactic: x, record: (i, e) => ngcGalaxyRecord(list[i], e), group: () => 'galaxies' });
}

function buildMergers(list: GwEvent[]): LoadedSet {
  const n = list.length;
  const x: ExtragalacticArrays = { count: n, posMpc: new Float64Array(3 * n), anchorMpc: new Float64Array(3 * n), size: new Float32Array(n), nearMpc: new Float32Array(n), farMpc: new Float32Array(n), kind: new Uint8Array(n) };
  list.forEach((e, i) => {
    x.posMpc.set(e.pos, 3 * i);
    x.anchorMpc.set(e.pos, 3 * i);
    x.size[i] = regionRadiusRad(e.area90Deg2);
    x.nearMpc[i] = e.dcLoMpc;
    x.farMpc[i] = e.dcHiMpc;
    x.kind[i] = e.kind === 'bhbh' ? 0 : e.kind === 'bhns' ? 1 : 2;
  });
  return withNames('gw-events', list.map(gwEntry), { extragalactic: x, record: (i, e) => gwRecord(list[i], e), group: () => 'mergers' });
}

function addExisting(designation: string, body: string): void {
  const n = normalise(designation);
  deepSky.existing.set(n, body);
  deepSky.existing.set(tight(n), body);
}

/** Read a catalogue's file into its set (the tests call this with the file from disk); the pulsars take the magnetars' file too. */
export function buildSet(id: DeepSkySetId, file: ColumnFile, magnetars?: ColumnFile | null): LoadedSet {
  switch (id) {
    case 'ngc-galactic':
      return buildGalacticNgc(parseNgcGalactic(file));
    case 'snrs':
      return buildSnrs(parseSnrs(file));
    case 'pulsars': {
      const list = parsePulsars(file);
      return buildPulsars(magnetars ? mergeMagnetars(list, parseMagnetars(magnetars)) : list, (p0) => shownPulse(p0).periodS);
    }
    case 'ngc-galaxies':
      return buildGalaxies(parseNgcGalaxies(file));
    case 'gw-events':
      return buildMergers(parseGwEvents(file));
  }
}

/** Take in a built set: its best-known objects become bodies, and the app hears of it. */
export function adoptSet(set: LoadedSet): void {
  deepSky.sets.set(set.id, set);
  deepSky.status.set(set.id, 'ready');
  const records: BodyRecord[] = [];
  set.entries.forEach((e, i) => {
    if (!e.prominent || getBody(e.id)) return;
    const r = set.record(i, e);
    records.push({ ...r, onDemand: false });
  });
  if (records.length) {
    registerBodies(records);
    joinExpansion(set, records.map((r) => set.indexById.get(r.id)!));
  }
  deepSkyChanged();
}

async function loadExisting(): Promise<void> {
  if (deepSky.existingStatus !== 'idle') return;
  deepSky.existingStatus = 'loading';
  try {
    for (const [d, body] of parseNgcExisting(await readJson(NGC_EXISTING_FILE))) addExisting(d, body);
    deepSky.existingStatus = 'ready';
  } catch (err) {
    deepSky.existingStatus = 'idle';
    console.warn(`[lightspeed] the NGC/IC names of the app's own objects did not load (${err})`);
  }
}

async function load(id: DeepSkySetId): Promise<void> {
  deepSky.status.set(id, 'loading');
  deepSkyChanged();
  try {
    if (id === 'ngc-galactic' || id === 'ngc-galaxies') void loadExisting();
    // The magnetars come with the pulsars (a small file); without it the pulsars still load.
    const extra = id === 'pulsars' ? readJson(MAGNETARS_FILE).catch((err) => (console.warn(`[lightspeed] the magnetars did not load (${err})`), null)) : null;
    const set = buildSet(id, await readJson(DEEP_SKY_FILES[id]), await extra);
    deepSky.failures.delete(id);
    adoptSet(set);
  } catch (err) {
    const f = (deepSky.failures.get(id) ?? 0) + 1;
    deepSky.failures.set(id, f);
    deepSky.retryAt.set(id, deepSkyIO.now() + retryAfterMs(f));
    deepSky.status.set(id, 'failed');
    console.warn(`[lightspeed] the deep-sky catalogue ${id} did not load; trying again in ${retryAfterMs(f) / 1000} s (${err})`);
    deepSkyChanged();
  }
}

const wantedSets = new Set<DeepSkySetId>();

/** Load what is wanted and not loaded (a failed one once its wait is over). */
function want(sets: readonly DeepSkySetId[]): void {
  for (const s of sets) wantedSets.add(s);
  const now = deepSkyIO.now();
  for (const s of wantedSets) {
    const st = deepSky.status.get(s) ?? 'idle';
    if (st === 'idle' || (st === 'failed' && now >= (deepSky.retryAt.get(s) ?? 0))) void load(s);
  }
}

// ─── Bodies on demand ───────────────────────────────────────────────────────────────────

/** Bodies registered on demand (not the best-known), with the frame each was last held. */
const onDemand = new Map<BodyId, number>();
/** A body nothing holds is released after this many frames (a couple of seconds). */
const RELEASE_AFTER_FRAMES = 150;
let frame = 0;

const isExtragalactic = (set: LoadedSet) => !!set.extragalactic;

/** Galaxies and mergers take part in the expansion of the universe: their anchors join it (sim/cosmos/expansion.ts). */
function joinExpansion(set: LoadedSet, indices: readonly number[]): void {
  const x = set.extragalactic;
  if (!x) return;
  setExpansionMembers(
    indices.map((i) => ({
      id: set.entries[i].id,
      anchorWorldKm: [x.anchorMpc[3 * i] * MPC_KM, x.anchorMpc[3 * i + 1] * MPC_KM, x.anchorMpc[3 * i + 2] * MPC_KM],
      home: false,
    })),
  );
}

/** The body of entry `index` of a catalogue, registering it if need be (null: its id is some other body's). */
function ensure(setId: DeepSkySetId, index: number): BodyId | null {
  const set = deepSky.sets.get(setId);
  const e = set?.entries[index];
  if (!set || !e) return null;
  const own = getBody(e.id);
  if (own) {
    if (own.deepSky && own.kindText === e.kindText) {
      if (onDemand.has(e.id)) onDemand.set(e.id, frame);
      return e.id;
    }
    return null;
  }
  registerBodies([set.record(index, e)]);
  if (isExtragalactic(set)) joinExpansion(set, [index]);
  onDemand.set(e.id, frame);
  // Placed at once, so the camera can go there this frame.
  updateEphemeris();
  return e.id;
}

/** Once a frame: hold what is looked at, selected or flown to; release the rest after a while. */
function update(keep: (id: BodyId) => boolean, shown: DeepSkyShown): void {
  frame++;
  lastShown = shown;
  if (wantedSets.size && frame % 30 === 0) want([]);
  // Not while the camera moves from one object to another: the one it leaves is still in its path.
  if (frame % 30 !== 0 || !onDemand.size || controller.mode === 'transition') return;
  const release: BodyId[] = [];
  for (const [id, last] of onDemand) {
    if (!isBody(id)) {
      onDemand.delete(id);
      continue;
    }
    if (keep(id)) onDemand.set(id, frame);
    else if (frame - last > RELEASE_AFTER_FRAMES) release.push(id);
  }
  if (release.length) {
    for (const id of release) onDemand.delete(id);
    unregisterBodies(release);
    removeExpansionMembers(release);
  }
}

/** The bodies registered on demand now (for the tests). */
export const onDemandBodies = (): ReadonlySet<BodyId> => new Set(onDemand.keys());

// ─── Where each is ──────────────────────────────────────────────────────────────────────

let lastShown: DeepSkyShown = { ngc: false, ngcGalaxies: false, pulsars: false, gw: false };

/** Entry `i` of a catalogue, from the camera, world km (into `out`): its place now, at the clock's scale factor. */
function relativeKm(set: LoadedSet, i: number, out: Vector3): Vector3 {
  const c = sim.camera.pos;
  if (set.galactic) {
    const w = set.galactic.worldPc;
    return out.set(w[3 * i] * PARSEC_KM - c.x, w[3 * i + 1] * PARSEC_KM - c.y, w[3 * i + 2] * PARSEC_KM - c.z);
  }
  const x = set.extragalactic!;
  const am1 = cosmicSky.am1;
  return out.set(
    (x.posMpc[3 * i] + am1 * x.anchorMpc[3 * i]) * MPC_KM - c.x,
    (x.posMpc[3 * i + 1] + am1 * x.anchorMpc[3 * i + 1]) * MPC_KM - c.y,
    (x.posMpc[3 * i + 2] + am1 * x.anchorMpc[3 * i + 2]) * MPC_KM - c.z,
  );
}

const relScratch = new Vector3();

/** Distance from the camera to entry `i`, km (its body's when it is one). */
export function entryDistanceKm(set: LoadedSet, i: number): number {
  const b = sim.bodies[set.entries[i].id];
  if (b) return b.pos.distanceTo(sim.camera.pos);
  return relativeKm(set, i, relScratch).length();
}

// ─── Picking ────────────────────────────────────────────────────────────────────────────

/** Pointer reach around a small marker, CSS px (as scene/picking.ts PICK_REACH_PX). */
const REACH_PX = 14;
/** A big ring is picked within this much of its centre, px: inside it the pointer is on what the ring holds. */
const RING_REACH_PX = 40;
const scr: ScreenPoint = { x: 0, y: 0, onScreen: false, inFront: false };

const setShown = (id: DeepSkySetId, s: DeepSkyShown): boolean =>
  id === 'pulsars' ? s.pulsars : id === 'gw-events' ? s.gw : id === 'ngc-galaxies' ? s.ngcGalaxies : s.ngc;

/** The marker nearest the pointer, among those drawn strongly enough (markers.ts's rules: the scene's). */
function pick(x: number, y: number, camera: PerspectiveCamera): DeepSkyPick | null {
  const pxPerRad = sim.viewport.height / 2 / Math.tan((camera.fov * Math.PI) / 360);
  const selected = useUI.getState().selected;
  let best: DeepSkyPick | null = null;
  let bestScore = Infinity;
  for (const set of deepSky.sets.values()) {
    if (!setShown(set.id, lastShown)) continue;
    const n = set.entries.length;
    for (let i = 0; i < n; i++) {
      // A body already: scene/picking.ts finds it as one.
      if (isBody(set.entries[i].id)) continue;
      const rel = relativeKm(set, i, relScratch);
      const d = rel.length();
      let alpha: number;
      let rPx: number;
      if (set.galactic) {
        const g = set.galactic;
        const dPc = d / PARSEC_KM;
        rPx = (g.radiusPc[i] / dPc) * pxPerRad;
        alpha = galacticAlpha(g.style[i], dPc, rPx, g.radiusPc[i]);
        rPx = g.radiusPc[i] > 0 && !COMPACT_PX[g.style[i]] ? Math.max(rPx, MIN_RING_PX) : (COMPACT_PX[g.style[i]] ?? MIN_RING_PX);
      } else if (set.id === 'ngc-galaxies') {
        rPx = ((set.extragalactic!.size[i] * MPC_KM) / d) * pxPerRad;
        alpha = galaxyAlpha(rPx);
        rPx = Math.max(rPx, MIN_RING_PX);
      } else {
        rPx = (Math.sin(set.extragalactic!.size[i]) * (1 + cosmicSky.am1) * Math.hypot(set.extragalactic!.posMpc[3 * i], set.extragalactic!.posMpc[3 * i + 1], set.extragalactic!.posMpc[3 * i + 2]) * MPC_KM * pxPerRad) / d;
        alpha = regionAlpha(rPx, set.entries[i].id === selected);
      }
      if (alpha < PICK_MIN_ALPHA && set.entries[i].id !== selected) continue;
      screenOf(rel, camera, scr);
      if (!scr.inFront || !scr.onScreen) continue;
      const reach = Math.max(REACH_PX, Math.min(rPx, RING_REACH_PX));
      const dx = scr.x - x;
      const dy = scr.y - y;
      if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
      const px = Math.hypot(dx, dy);
      if (px > reach) continue;
      const score = px / reach + d * 1e-30;
      if (score < bestScore) {
        bestScore = score;
        best = { set: set.id, index: i, x: scr.x, y: scr.y, px };
      }
    }
  }
  return best;
}

function describe(setId: DeepSkySetId, index: number): { name: string; sub: string } {
  const e = deepSky.sets.get(setId)?.entries[index];
  return e ? { name: e.name, sub: e.kindText } : { name: '', sub: '' };
}

// ─── Search ─────────────────────────────────────────────────────────────────────────────

/**
 * How well a normalised query matches a normalised name: the whole name, its start, the start of a later word, or
 * anywhere inside, as "Where to?" scores names (content/destinations.ts matchScore), without its fuzzy matches among
 * so many names; and the same without spaces, so "ngc1234" finds "NGC 1234" and "psr j0437" "PSR J0437−4715".
 */
function score(q: string, qt: string, t: string, tt: string): number {
  if (t === q || tt === qt) return 1000;
  if (t.startsWith(q)) return 900 - Math.min(99, t.length - q.length);
  if (qt.length >= 3 && tt.startsWith(qt)) return 890 - Math.min(99, tt.length - qt.length);
  const w = t.indexOf(` ${q}`);
  if (w >= 0) return 800 - Math.min(99, w);
  if (q.length >= 3) {
    const k = t.indexOf(q);
    if (k >= 0) return 700 - Math.min(99, k);
  }
  return 0;
}

/** An entry as a "Where to?" destination (its registry entry once it is a body). */
function destinationOf(set: LoadedSet, i: number): Destination | undefined {
  const e = set.entries[i];
  if (isBody(e.id)) return findDestination(e.id);
  if (getBody(e.id)) return undefined;
  return {
    id: e.id,
    name: e.name,
    aliases: e.aliases,
    kind: e.kindText,
    group: set.group(i),
    body: e.id,
    distanceKm: () => entryDistanceKm(set, i),
    unavailable: () => null,
    prepare: () => {
      ensure(set.id, i);
    },
    go: () => {
      const id = ensure(set.id, i);
      if (id) goToBody(id);
    },
  };
}

/**
 * The catalogues' objects whose names or designations match the query, best first, as destinations: the app's own
 * body for a designation it already has ("NGC 224" is the Andromeda Galaxy), and one of the catalogues' otherwise.
 */
function search(query: string, limit = 12): Destination[] {
  const q = normalise(query);
  if (!q) return [];
  const qt = tight(q);
  const hits: { s: number; set: LoadedSet; i: number }[] = [];
  for (const set of deepSky.sets.values()) {
    for (let i = 0; i < set.names.length; i++) {
      const names = set.names[i];
      const compact = set.compact[i];
      let s = 0;
      for (let k = 0; k < names.length; k++) {
        const v = score(q, qt, names[k], compact[k]) - (k > 0 ? 10 : 0);
        if (v > s) s = v;
      }
      // The best-known first among equals.
      if (s > 0) hits.push({ s: s + (set.entries[i].prominent ? 5 : 0), set, i });
    }
  }
  hits.sort((a, b) => b.s - a.s);
  const out: Destination[] = [];
  const seen = new Set<string>();
  // A designation of one of the app's own bodies leads to that body.
  const existing = deepSky.existing.get(q) ?? deepSky.existing.get(qt);
  if (existing) {
    const id = bodyNamed(existing);
    const d = id ? findDestination(id) : undefined;
    if (d) {
      out.push(d);
      seen.add(d.id);
    }
  }
  for (const h of hits) {
    if (out.length >= limit) break;
    const d = destinationOf(h.set, h.i);
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}

/** The registered body with this name or alias. */
function bodyNamed(name: string): BodyId | undefined {
  const n = normalise(name);
  return bodyRecords().find((r) => normalise(r.name) === n || (r.aliases ?? []).some((a) => normalise(a) === n))?.id;
}

// ─── The runtime ────────────────────────────────────────────────────────────────────────

export const deepSkyRuntime: DeepSkyRuntime = { want, update, pick, ensure, describe, search, state: deepSky };

