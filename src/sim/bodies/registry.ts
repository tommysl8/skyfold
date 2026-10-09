/**
 * The body registry: every body the app knows, data-driven. Today it holds the 13 bodies built
 * into the app (core.ts); later phases register moons, dwarf planets, comets, spacecraft,
 * stars, exoplanets and galaxies with registerBodies, and every part of the app (the scene,
 * labels, picking, search, the Bodies list, flights, the instruments) picks them up.
 *
 * Three orders:
 *  - registration order, as bodies arrive;
 *  - display order ("the registered order"): a depth-first walk of the parent tree, roots and
 *    siblings in registration order. Parents come before their children: Sun, Mercury, …,
 *    Earth, Moon, Mars, … . sim.bodyList and bodyIds() follow it;
 *  - evaluation order: every body after its centre and the bodies it depends on, so one pass
 *    places everything (see world.ts).
 */
import { Quaternion, Vector3 } from 'three';
import { makeBody, sim, type BodyState } from '../sim';
import { compileRotation } from './rotation';
import type { BodyId, BodyKind, BodyRecord, RelativeState, RotationProvider } from './types';

/** Internal: one registered body or barycentre, with its state and scratch space. */
export interface Entry {
  readonly id: BodyId;
  readonly record: BodyRecord;
  /** A barycentre: evaluated like a body, but not in sim.bodies and never drawn or listed. */
  readonly isNode: boolean;
  readonly state: BodyState;
  parent: Entry | null;
  centre: Entry | null;
  deps: Entry[];
  rotation: RotationProvider | null;
  children: Entry[];
  /** Entries whose positions are measured from this one (its `centre` users): a barycentre's members. */
  placed: Entry[];
  /** Head of the body's light-time group: the ancestor just below a root (a planet for its moons). */
  group: Entry;
  /** The root of its parent tree: the Sun for the Solar System, a star or a star system's barycentre beyond it. */
  root: Entry;
  displayIndex: number;
  evalIndex: number;
  /** Walk stamp of the last per-frame evaluation (world.ts). */
  stamp: number;
  /** Scratch for derived.ts: the smallest separation from a moon (visible-size caps). */
  capSep: number;
  /** State relative to the centre at the last walk, world axes (km, km/s). */
  rel: RelativeState;
  /** Scratch for evaluations at another time (light-time): world position, velocity and orientation. */
  t: { pos: Vector3; vel: Vector3; quat: Quaternion; rel: RelativeState };
}

export interface Group {
  head: Entry;
  /** The head and everything placed relative to it, in evaluation order. */
  members: Entry[];
}

const entries = new Map<BodyId, Entry>();
let registration: Entry[] = [];
let display: Entry[] = [];
let evaluation: Entry[] = [];
let bodies: Entry[] = [];
let groups: Group[] = [];
let ids: BodyId[] = [];
let records: BodyRecord[] = [];

let version = 0;
const listeners = new Set<() => void>();

/** Bumped whenever bodies are registered or removed. */
export const registryVersion = (): number => version;

/** Hear about bodies being registered or removed. Returns the unsubscribe function. */
export function subscribeRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function makeEntry(record: BodyRecord, state: BodyState = makeBody(record.id)): Entry {
  const isNode = record.kind === 'barycentre';
  return {
    id: record.id,
    record,
    isNode,
    state,
    parent: null,
    centre: null,
    deps: [],
    rotation: null,
    children: [],
    placed: [],
    group: null as unknown as Entry,
    root: null as unknown as Entry,
    displayIndex: -1,
    evalIndex: -1,
    stamp: -1,
    capSep: Infinity,
    rel: { pos: new Vector3(), vel: new Vector3() },
    t: { pos: new Vector3(), vel: new Vector3(), quat: new Quaternion(), rel: { pos: new Vector3(), vel: new Vector3() } },
  };
}

/** Navigation keys are matched case-insensitively ("m" and "M" are one key). */
const keyOf = (r: BodyRecord): string | undefined => r.key?.toLowerCase();

/** Keys in use by registered bodies, except the ids given (being replaced). */
function keysInUse(except: ReadonlySet<BodyId> = new Set()): Map<string, BodyId> {
  const out = new Map<string, BodyId>();
  for (const e of registration) {
    const k = keyOf(e.record);
    if (k && !except.has(e.id)) out.set(k, e.id);
  }
  return out;
}

function check(record: BodyRecord, known: (id: BodyId) => boolean, keys: Map<string, BodyId>): void {
  const where = `body '${record.id}'`;
  if (!ID_RE.test(record.id)) throw new Error(`registry: ${where}: ids are lower-case words joined by hyphens`);
  if (entries.has(record.id)) throw new Error(`registry: ${where} is already registered`);
  if (record.parent !== null && !known(record.parent)) throw new Error(`registry: ${where}: unknown parent '${record.parent}'`);
  if (record.centre !== undefined && !known(record.centre)) throw new Error(`registry: ${where}: unknown centre '${record.centre}'`);
  for (const d of record.dependsOn ?? []) if (!known(d)) throw new Error(`registry: ${where}: unknown dependency '${d}'`);
  const r = record.physical.radiusKm;
  // A destination is framed from its radius: 0 would put the camera on its centre (and the
  // zoom path's scale at 0). Only points that are never visited may have none.
  const point = record.kind === 'barycentre' || record.destination === false;
  if (!(point ? r >= 0 : r > 0) || !Number.isFinite(r)) {
    throw new Error(`registry: ${where}: radiusKm must be a finite number ${point ? '≥ 0' : '> 0 (a destination is framed from it)'}`);
  }
  if (!record.provider || typeof record.provider.positionAt !== 'function') throw new Error(`registry: ${where}: no position provider`);
  const k = keyOf(record);
  if (k) {
    const owner = keys.get(k);
    if (owner !== undefined && owner !== record.id) throw new Error(`registry: ${where}: key '${record.key}' already goes to '${owner}'`);
    keys.set(k, record.id);
  }
}

/**
 * Register bodies. Within one call they may come in any order; each one's parent, centre and
 * dependencies must be registered already or be in the same call. Throws (registering none)
 * on a duplicate or malformed id, an unknown reference, a cycle, a navigation key another body
 * has, or a destination without a positive radius.
 */
export function registerBodies(list: readonly BodyRecord[]): void {
  if (!list.length) return;
  const batch = new Map<BodyId, BodyRecord>();
  for (const r of list) {
    if (batch.has(r.id)) throw new Error(`registry: body '${r.id}' is twice in one call`);
    batch.set(r.id, r);
  }
  const known = (id: BodyId) => entries.has(id) || batch.has(id);
  const keys = keysInUse();
  for (const r of list) check(r, known, keys);

  // Insert references first (a topological order of the batch that keeps its given order otherwise).
  const placed = new Set<BodyId>();
  const visiting = new Set<BodyId>();
  const out: BodyRecord[] = [];
  const visit = (r: BodyRecord) => {
    if (placed.has(r.id)) return;
    if (visiting.has(r.id)) throw new Error(`registry: body '${r.id}' depends on itself`);
    visiting.add(r.id);
    for (const ref of [r.parent, r.centre, ...(r.dependsOn ?? [])]) {
      const dep = ref ? batch.get(ref) : undefined;
      if (dep) visit(dep);
    }
    visiting.delete(r.id);
    placed.add(r.id);
    out.push(r);
  };
  for (const r of list) visit(r);

  // Compile the rotation models first: a bad one throws before anything is registered.
  const made = out.map((r) => {
    const e = makeEntry(r);
    e.rotation = compileRotation(r.rotation);
    return e;
  });
  for (const e of made) {
    entries.set(e.id, e);
    registration.push(e);
  }
  rebuild();
}

/** Register one body (its parent, centre and dependencies must be registered already). */
export function registerBody(record: BodyRecord): void {
  registerBodies([record]);
}

/**
 * Replace the records of registered bodies with richer ones (Pluto with its orbit about the
 * barycentre, Voyager 1 with its fitted track, a planet with more data), keeping each body's
 * place in every order, its state and everything placed on it. A body cannot become a
 * barycentre or the reverse. Throws (replacing none) on an unknown id or reference.
 */
export function replaceBodies(list: readonly BodyRecord[]): void {
  if (!list.length) return;
  const incoming = new Map(list.map((r) => [r.id, r]));
  const known = (id: BodyId) => entries.has(id);
  const keys = keysInUse(new Set(incoming.keys()));
  for (const r of list) {
    const old = entries.get(r.id);
    if (!old) throw new Error(`registry: body '${r.id}' is not registered, so cannot be replaced`);
    if ((r.kind === 'barycentre') !== old.isNode) throw new Error(`registry: body '${r.id}' cannot change between a body and a barycentre`);
    const saved = entries.get(r.id)!;
    entries.delete(r.id); // check() refuses ids already registered
    try {
      check(r, (id) => known(id) || id === r.id, keys);
    } finally {
      entries.set(r.id, saved);
    }
  }
  // No cycles through the new references (a centre inside its own subtree).
  const refs = (id: BodyId): (BodyId | undefined | null)[] => {
    const r = incoming.get(id) ?? entries.get(id)?.record;
    return r ? [r.parent, r.centre, ...(r.dependsOn ?? [])] : [];
  };
  for (const r of list) {
    const seen = new Set<BodyId>();
    const stack = refs(r.id).filter((x): x is BodyId => !!x);
    while (stack.length) {
      const id = stack.pop()!;
      if (id === r.id) throw new Error(`registry: body '${r.id}' would depend on itself`);
      if (seen.has(id)) continue;
      seen.add(id);
      for (const x of refs(id)) if (x) stack.push(x);
    }
  }
  const made = list.map((r) => {
    const e = makeEntry(r, entries.get(r.id)!.state);
    e.rotation = compileRotation(r.rotation);
    return e;
  });
  for (const e of made) {
    entries.set(e.id, e);
    const i = registration.findIndex((x) => x.id === e.id);
    registration[i] = e;
  }
  rebuild();
}

/**
 * Remove bodies (with everything that orbits them, is placed relative to them or depends on
 * them). Unknown ids are ignored.
 */
export function unregisterBodies(idList: readonly BodyId[]): void {
  const gone = new Set<BodyId>();
  const mark = (id: BodyId) => {
    if (gone.has(id) || !entries.has(id)) return;
    gone.add(id);
    for (const e of registration) {
      const r = e.record;
      if (r.parent === id || r.centre === id || r.dependsOn?.includes(id)) mark(e.id);
    }
  };
  idList.forEach(mark);
  if (!gone.size) return;
  for (const id of gone) entries.delete(id);
  registration = registration.filter((e) => !gone.has(e.id));
  rebuild();
}

export const unregisterBody = (id: BodyId): void => unregisterBodies([id]);

/** Recompute the orders, groups and sim.bodies after a change. */
function rebuild(): void {
  for (const e of registration) {
    const r = e.record;
    e.parent = r.parent !== null ? entries.get(r.parent)! : null;
    e.centre = r.centre !== undefined ? entries.get(r.centre)! : e.parent;
    e.deps = (r.dependsOn ?? []).map((d) => entries.get(d)!);
    e.children = [];
    e.placed = [];
  }
  const roots: Entry[] = [];
  for (const e of registration) {
    (e.parent ? e.parent.children : roots).push(e);
    if (e.centre) e.centre.placed.push(e);
    let r = e;
    while (r.parent) r = r.parent;
    e.root = r;
  }

  // Display order: depth first, parents before children.
  display = [];
  const walk = (e: Entry) => {
    e.displayIndex = display.length;
    display.push(e);
    for (const c of e.children) walk(c);
  };
  roots.forEach(walk);

  // Evaluation order: the display order, with centres and dependencies moved ahead as needed.
  evaluation = [];
  const done = new Set<Entry>();
  const visit = (e: Entry) => {
    if (done.has(e)) return;
    done.add(e);
    if (e.centre) visit(e.centre);
    e.deps.forEach(visit);
    e.evalIndex = evaluation.length;
    evaluation.push(e);
  };
  display.forEach(visit);

  // Light-time groups: each system is evaluated at one retarded time (lightDelay.ts).
  const byHead = new Map<Entry, Group>();
  groups = [];
  for (const e of evaluation) {
    let h = e;
    while (h.centre && h.centre.centre) h = h.centre;
    e.group = h;
    let g = byHead.get(h);
    if (!g) {
      g = { head: h, members: [] };
      byHead.set(h, g);
      groups.push(g);
    }
    g.members.push(e);
  }

  bodies = display.filter((e) => !e.isNode);
  ids = bodies.map((e) => e.id);
  records = bodies.map((e) => e.record);

  // sim.bodies and sim.bodyList are mutated in place: other modules hold on to them.
  for (const k of Object.keys(sim.bodies)) if (!entries.has(k) || entries.get(k)!.isNode) delete sim.bodies[k];
  for (const e of bodies) sim.bodies[e.id] = e.state;
  sim.bodyList.length = 0;
  for (const e of bodies) sim.bodyList.push(e.state);

  version++;
  listeners.forEach((f) => f());
}

// ─── Lookups ─────────────────────────────────────────────────────────────────────────────

/** Whether `id` is a registered body (not a barycentre). */
export const isBody = (id: BodyId | null | undefined): id is BodyId => !!id && entries.has(id) && !entries.get(id)!.isNode;

/**
 * Whether a body has been placed since it was registered: a new body sits at the origin until
 * the next pass over the bodies (updateWorld), so its distance means nothing before then.
 */
export const isPlaced = (id: BodyId): boolean => (entries.get(id)?.stamp ?? -1) >= 0;

/** The record of a body or barycentre, or undefined. */
export const getBody = (id: BodyId): BodyRecord | undefined => entries.get(id)?.record;

/** The record of a registered body or barycentre; throws for an unknown id. */
export function bodyRecord(id: BodyId): BodyRecord {
  const e = entries.get(id);
  if (!e) throw new Error(`registry: unknown body '${id}'`);
  return e.record;
}

/** A body's name ("the unknown body 'x'" never reaches the interface: an unknown id gives the id). */
export const bodyName = (id: BodyId): string => entries.get(id)?.record.name ?? id;

/** Every body's id, in display order (parents before children, the Sun outwards). */
export const bodyIds = (): readonly BodyId[] => ids;

/** Every body's record, in display order. */
export const bodyRecords = (): readonly BodyRecord[] => records;

/** The bodies orbiting `id` (as people put it), in display order. Barycentres are skipped through. */
export function childrenOf(id: BodyId): BodyRecord[] {
  const e = entries.get(id);
  if (!e) return [];
  const out: BodyRecord[] = [];
  const add = (c: Entry) => {
    if (c.isNode) c.children.forEach(add);
    else out.push(c.record);
  };
  e.children.forEach(add);
  return out;
}

/** A body and what it orbits, outermost first, barycentres left out: Earth, Moon. */
export function lineage(id: BodyId): BodyRecord[] {
  const out: BodyRecord[] = [];
  for (let e = entries.get(id); e; e = e.parent ?? undefined) if (!e.isNode) out.unshift(e.record);
  return out;
}

/** The outermost body of the tree `id` belongs to (the Sun for everything in the Solar System). */
export function rootOf(id: BodyId): BodyRecord | undefined {
  let e = entries.get(id);
  while (e?.parent) e = e.parent;
  return e?.record;
}

/**
 * The system a body belongs to: the body just below the root on its parent chain (Saturn for
 * Titan, Earth for the Moon, the Sun for the Sun). Barycentres are skipped.
 */
export function systemOf(id: BodyId): BodyRecord | undefined {
  let e = entries.get(id);
  if (!e) return undefined;
  while (e.parent && e.parent.parent) e = e.parent;
  while (e.isNode && e.children.length) e = e.children.find((c) => !c.isNode) ?? e.children[0];
  return e.record;
}

/** Whether `ancestor` is `id` or one of the bodies it orbits. */
export function isWithin(id: BodyId, ancestor: BodyId): boolean {
  for (let e = entries.get(id); e; e = e.parent ?? undefined) if (e.id === ancestor) return true;
  return false;
}

// ─── Derived record data ─────────────────────────────────────────────────────────────────

/** Radius used for sizes on screen and framing: equatorial, else the largest triaxial radius, else the mean. */
export function displayRadiusKm(r: BodyRecord): number {
  const p = r.physical;
  return p.equatorialRadiusKm ?? p.triaxialRadiiKm?.[0] ?? p.radiusKm;
}

const KIND_TEXT: Record<BodyKind, string> = {
  star: 'Star',
  planet: 'Planet',
  'dwarf-planet': 'Dwarf planet',
  moon: 'Moon',
  asteroid: 'Asteroid',
  comet: 'Comet',
  interstellar: 'Interstellar object',
  spacecraft: 'Spacecraft',
  exoplanet: 'Exoplanet',
  galaxy: 'Galaxy',
  cluster: 'Star cluster',
  nebula: 'Nebula',
  'black-hole': 'Black hole',
  pulsar: 'Pulsar',
  merger: 'Gravitational-wave event',
  transient: 'Supernova',
  barycentre: 'Barycentre',
};

/** What a body is, in a word or two: "Planet", "Moon of Earth", "Our star". */
export function kindText(id: BodyId): string {
  const r = getBody(id);
  if (!r) return '';
  if (r.kindText) return r.kindText;
  if (r.kind === 'moon' && r.parent) return `Moon of ${bodyName(r.parent)}`;
  if (r.kind === 'exoplanet' && r.parent) return `Planet of ${bodyName(r.parent)}`;
  return KIND_TEXT[r.kind];
}

/** The plain name of a kind ("Dwarf planet"). */
export const kindName = (kind: BodyKind): string => KIND_TEXT[kind];

// ─── Internal access for the world update, light-time and rendering ─────────────────────

const serials = new WeakMap<BodyRecord, number>();
let nextSerial = 1;

/**
 * A number that changes when a body's record is replaced (unregistered and registered again):
 * React keys built from it remount what was drawn from the old record.
 */
export function recordSerial(id: BodyId): number {
  const r = entries.get(id)?.record;
  if (!r) return 0;
  let s = serials.get(r);
  if (s === undefined) {
    s = nextSerial++;
    serials.set(r, s);
  }
  return s;
}

/** Internal: the entry of a body or barycentre. */
export const entryOf = (id: BodyId): Entry | undefined => entries.get(id);
/** Internal: every entry in evaluation order. */
export const evalEntries = (): readonly Entry[] => evaluation;
/** Internal: bodies (not barycentres) in display order. */
export const bodyEntries = (): readonly Entry[] => bodies;
/** Internal: light-time groups, in evaluation order of their heads. */
export const lightTimeGroups = (): readonly Group[] => groups;
