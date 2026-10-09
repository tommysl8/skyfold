/**
 * Destinations: everything "Where to?" can find and the Bodies list can show.
 *
 * The list is built from providers. The first is the body registry (sim/bodies): every
 * registered body is a destination, so the moons, dwarf planets, comets, spacecraft and stars
 * that later data registers appear in search and in the Bodies list by themselves. Places that
 * are not bodies can be added with registerDestinations.
 *
 * Matching is fuzzy and forgiving: prefixes and whole words first, then letters in order
 * ("jptr"), then one slip of the keyboard ("satrun").
 */
import { bodyRecords, childrenOf, getBody, isBody, isPlaced, kindText, registryVersion, subscribeRegistry, type BodyId, type BodyRecord } from '../sim/bodies';
import { PARSEC_KM } from '../physics/constants';
import { sim } from '../sim/sim';
import { frameCosmicWeb, goToBody, goToPlanetarySystem, goToStarSystem, showCmbMap } from '../ui/navigation';
import { systemFramingDistance } from '../controls/framing';
import { cosmicLevel } from '../ui/location';
import { ARTICLE_EDGE } from '../sim/cosmos/records';

// ─── The registry ───────────────────────────────────────────────────────────────────────

/** How the Bodies list groups destinations, in the order it shows them. */
export const DESTINATION_GROUPS = [
  { id: 'sun-planets', title: 'Sun and planets' },
  { id: 'dwarf-planets', title: 'Dwarf planets and candidates' },
  { id: 'moons', title: 'Moons' },
  { id: 'small-bodies', title: 'Asteroids and Kuiper belt objects' },
  { id: 'comets', title: 'Comets' },
  { id: 'interstellar', title: 'Interstellar visitors' },
  { id: 'spacecraft', title: 'Spacecraft' },
  { id: 'stars', title: 'Stars' },
  { id: 'exoplanets', title: 'Exoplanets' },
  { id: 'milky-way', title: 'The Milky Way' },
  { id: 'clusters', title: 'Star clusters' },
  { id: 'nebulae', title: 'Nebulae' },
  { id: 'pulsars', title: 'Pulsars' },
  { id: 'transients', title: 'Supernovae and a kilonova' },
  { id: 'galaxies', title: 'Galaxies' },
  { id: 'universe', title: 'Clusters, the cosmic web and the CMB' },
  { id: 'mergers', title: 'Gravitational-wave events' },
] as const;

export type DestinationGroup = (typeof DESTINATION_GROUPS)[number]['id'];

export interface Destination {
  /** Unique id. For bodies, the body id (which is also its scene target id). */
  id: string;
  name: string;
  /** A shorter name where room is tight ("Proxima"). */
  shortName?: string;
  /** Other names people type: "Luna", "red planet", "Alpha Centauri C". */
  aliases: readonly string[];
  /** What it is, in a word or two: "Planet", "Moon of Earth", "Spacecraft". */
  kind: string;
  group: DestinationGroup;
  /** The body the camera and the flight planner use (destinations that are not bodies have none yet). */
  body?: BodyId;
  /** The destination it orbits, for nesting in lists (Jupiter for Io; a star system for its stars). */
  parent?: string;
  /** A sub-heading within its group (the Stars: "Within 16 light-years", "Stars with planets" …). */
  section?: string;
  /** The single key that goes there ("6"), if any. */
  key?: string;
  /** Distance from the camera now, km (NaN when not known). */
  distanceKm: () => number;
  /** Why the camera cannot go there now, or null when it can. */
  unavailable: () => string | null;
  /** Take the camera there (a camera move, not a journey). */
  go: () => void;
  /**
   * Register the body `body` names, if it is not yet (a catalogue star found by name): called
   * before Go, Fly and planning a flight there.
   */
  prepare?: () => void;
}

export type DestinationProvider = () => readonly Destination[];

const providers: DestinationProvider[] = [];

let version = 0;
const listeners = new Set<() => void>();

/** Bumped whenever the destinations may have changed (for lists that are open meanwhile). */
export const destinationsVersion = (): number => version;
export function subscribeDestinations(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/**
 * Tell open lists that the destinations changed: called on registering a provider, and by a
 * provider whose list grows after it registered (data that loads later).
 */
export function destinationsChanged(): void {
  version++;
  listeners.forEach((f) => f());
}

/**
 * Add destinations (a later update's moons, stars or galaxies). A provider registered later
 * wins when two give the same id, so an update can replace a body's entry with a richer one.
 * Returns a function that removes the provider again.
 */
export function registerDestinations(provider: DestinationProvider): () => void {
  providers.unshift(provider);
  destinationsChanged();
  return () => {
    const i = providers.indexOf(provider);
    if (i >= 0) providers.splice(i, 1);
    destinationsChanged();
  };
}

/** Every destination, each id once, in the order of the groups (then as each provider lists them). */
export function allDestinations(): Destination[] {
  // From the first provider registered to the last: a later entry replaces an earlier one
  // with the same id but keeps its place (Map.set on an existing key does not move it).
  const byId = new Map<string, Destination>();
  for (let i = providers.length - 1; i >= 0; i--) for (const d of providers[i]()) byId.set(d.id, d);
  const rank = new Map<string, number>(DESTINATION_GROUPS.map((g, i) => [g.id, i]));
  // Array sort is stable, so each group keeps the providers' order.
  return [...byId.values()].sort((a, b) => rank.get(a.group)! - rank.get(b.group)!);
}

export const findDestination = (id: string): Destination | undefined => allDestinations().find((d) => d.id === id);

/**
 * The destinations shown before anything is typed, from near to far: the Moon to the nearest
 * star, then the Galactic Centre and Andromeda (these two join once the galaxy data are in).
 */
export const FEATURED_IDS = ['moon', 'mars', 'saturn', 'pluto', 'voyager1', 'proxima', 'sgr-a-star', 'andromeda'] as const;

export function featuredDestinations(list: readonly Destination[] = allDestinations()): Destination[] {
  return FEATURED_IDS.map((id) => list.find((d) => d.id === id)).filter((d): d is Destination => !!d);
}

/** The destinations in each group, in order, leaving out empty groups. */
export function groupedDestinations(list: readonly Destination[] = allDestinations()): { id: DestinationGroup; title: string; items: Destination[] }[] {
  return DESTINATION_GROUPS.map((g) => ({ id: g.id, title: g.title, items: list.filter((d) => d.group === g.id) })).filter((g) => g.items.length > 0);
}

/**
 * Groups whose members are listed under what they orbit when that is listed too: moons under
 * their planet, planets under their star, the stars of a system under the system.
 */
const NESTED_GROUPS: ReadonlySet<DestinationGroup> = new Set(['moons', 'exoplanets', 'stars', 'milky-way', 'nebulae', 'galaxies']);

/** Sub-headings of the Stars, in order (starSection). */
export const STAR_SECTIONS = ['Within 16 light-years', 'Stars with planets', 'Bright stars', 'Found in search or nearby'] as const;
/** Sub-headings of the star clusters and the nebulae, in order (deepSkySection). */
export const DEEP_SKY_SECTIONS = ['Open clusters', 'Globular clusters', 'Where stars are born', 'Shed by dying stars', 'In the Magellanic Clouds'] as const;
/** Sub-headings of the galaxies, in order (galaxySection). */
export const GALAXY_SECTIONS = ['The Local Group', 'Beyond the Local Group', 'The most distant known'] as const;
/** Every sub-heading, in order. */
const SECTION_ORDER: readonly string[] = [...STAR_SECTIONS, ...DEEP_SKY_SECTIONS, ...GALAXY_SECTIONS];

export interface NestedItem {
  destination: Destination;
  /** 0 for the top level, 1 for a moon under its planet, and so on. */
  depth: number;
  /** How many listed destinations sit directly under this one. */
  children: number;
  /** A sub-heading starts here (the first top-level item of each section). */
  heading?: string;
}

/**
 * The Bodies list: grouped by kind, and within that by what each body orbits: Jupiter's moons
 * right under Jupiter, Charon under Pluto. Moons whose planet is not listed keep a group of
 * their own. Empty groups are left out.
 */
export function nestedDestinations(list: readonly Destination[] = allDestinations()): { id: DestinationGroup; title: string; items: NestedItem[] }[] {
  const byId = new Map(list.map((d) => [d.id, d]));
  const nests = (d: Destination) => NESTED_GROUPS.has(d.group) && !!d.parent && d.parent !== d.id && byId.has(d.parent);
  const under = new Map<string, Destination[]>();
  for (const d of list) {
    if (!nests(d)) continue;
    const arr = under.get(d.parent!) ?? [];
    // A black hole in a binary (the one body The Milky Way nests) leads the star it is known by.
    if (d.group === 'milky-way') arr.unshift(d);
    else arr.push(d);
    under.set(d.parent!, arr);
  }
  const placed = new Set<string>();
  const add = (d: Destination, depth: number, out: NestedItem[]) => {
    if (placed.has(d.id)) return;
    placed.add(d.id);
    const kids = under.get(d.id) ?? [];
    out.push({ destination: d, depth, children: kids.length });
    for (const k of kids) add(k, depth + 1, out);
  };
  const sectionRank = (d: Destination) => (d.section ? SECTION_ORDER.indexOf(d.section) : -1);
  return DESTINATION_GROUPS.map((g) => {
    const items: NestedItem[] = [];
    // Top-level members, by section (stable: each section keeps the providers' order).
    const top = list.filter((d) => d.group === g.id && !nests(d));
    if (top.some((d) => d.section)) top.sort((a, b) => sectionRank(a) - sectionRank(b));
    let section: string | undefined;
    for (const d of top) {
      const at = items.length;
      add(d, 0, items);
      if (items.length > at && d.section && d.section !== section) {
        items[at].heading = d.section;
        section = d.section;
      }
    }
    return { id: g.id, title: g.title, items };
  }).filter((g) => g.items.length > 0);
}

// ─── The registered bodies ──────────────────────────────────────────────────────────────

/** What a body is, in a word or two: "Planet", "Moon of Earth", "Our star". */
export const bodyKindText = (id: BodyId): string => kindText(id);

/** The Bodies-list group of a registered body. */
export function bodyGroup(r: BodyRecord): DestinationGroup {
  switch (r.kind) {
    case 'star':
      return r.id === 'sun' ? 'sun-planets' : 'stars';
    case 'planet':
      return 'sun-planets';
    case 'dwarf-planet':
      return 'dwarf-planets';
    case 'moon':
      return 'moons';
    case 'asteroid':
      return 'small-bodies';
    case 'comet':
      return 'comets';
    case 'interstellar':
      return 'interstellar';
    case 'spacecraft':
      return 'spacecraft';
    case 'exoplanet':
      return 'exoplanets';
    case 'cluster':
      return isGalaxyCluster(r) ? 'universe' : 'clusters';
    case 'nebula':
      return 'nebulae';
    case 'black-hole':
      return holeGroup(r);
    case 'pulsar':
      return 'pulsars';
    case 'merger':
      return 'mergers';
    case 'transient':
      return 'transients';
    case 'galaxy':
      return r.id === 'milky-way' ? 'milky-way' : 'galaxies';
    default:
      return 'stars';
  }
}

/**
 * Where a black hole is listed: at a galaxy's centre (M87*) with its galaxy; in the Milky Way (Sgr A*, a lone
 * hole) under The Milky Way, and so is a binary with a black hole, the hole and its star listed under the
 * system's row; in another galaxy that is not its parent (LMC X-1 in the Large Magellanic Cloud, the hole at the
 * centre of a galaxy of the NGC catalogue) under the galaxies.
 */
function holeGroup(r: BodyRecord): DestinationGroup {
  const host = r.parent ? getBody(r.parent) : undefined;
  if (host?.kind === 'galaxy') return bodyGroup(host);
  return r.blackHole?.hostGalaxy ? 'galaxies' : 'milky-way';
}

/** A group or cluster of galaxies (not of stars). */
const isGalaxyCluster = (r: BodyRecord): boolean => r.kind === 'cluster' && /galaxies/.test(r.kindText ?? '');

/** The sub-heading of a galaxy: in the Local Group, beyond it, or among the most distant known. */
function galaxySection(r: BodyRecord): string | undefined {
  if (r.kind !== 'galaxy' || r.id === 'milky-way') return undefined;
  if (r.article === ARTICLE_EDGE) return GALAXY_SECTIONS[2];
  return cosmicLevel(r) === 'local-group' ? GALAXY_SECTIONS[0] : GALAXY_SECTIONS[1];
}

/** Kinds of nebula that are made by dying stars (sim/galaxy/records.ts NEBULA_TYPES). */
const SHED_BY_STARS = /planetary|supernova|Wolf|thrown off|bubble/i;

/** The sub-heading of a star cluster or a nebula. */
function deepSkySection(r: BodyRecord): string | undefined {
  if (r.kind === 'cluster') return r.kindText === 'Globular cluster' ? DEEP_SKY_SECTIONS[1] : DEEP_SKY_SECTIONS[0];
  if (r.kind !== 'nebula') return undefined;
  if (r.deepSky?.hostGalaxy) return DEEP_SKY_SECTIONS[4];
  return SHED_BY_STARS.test(r.deepSky?.type ?? '') ? DEEP_SKY_SECTIONS[3] : DEEP_SKY_SECTIONS[2];
}

/** The outermost barycentre above a body: its star system (Alpha Centauri for Alpha Centauri B). */
function systemRoot(id: BodyId | null): BodyRecord | undefined {
  let s: BodyRecord | undefined;
  for (let r = id ? getBody(id) : undefined; r?.kind === 'barycentre'; r = r.parent ? getBody(r.parent) : undefined) s = r;
  return s;
}

/**
 * Where a body is listed: under what it orbits; a star of a system under the system's row; a
 * planet placed on its star's barycentre (it orbits the pair) under the system too.
 */
function listParent(r: BodyRecord): string | undefined {
  if (r.parent === null) return undefined;
  const p = getBody(r.parent);
  if (p?.kind === 'barycentre') return systemRoot(r.parent)?.id;
  if (r.centre && r.centre !== r.parent && p?.parent === r.centre) return systemRoot(r.centre)?.id ?? r.parent;
  return r.parent;
}

/** The distance from the Sun of a star, pc (its catalogue's, or where it is). */
function starDistancePc(r: BodyRecord): number {
  if (r.star) return r.star.distancePc;
  const b = sim.bodies[r.id];
  return b && isPlaced(r.id) ? b.pos.length() / PARSEC_KM : Infinity;
}

/** The Stars' sub-heading of a star, or of a system from its brightest star. */
function starSection(r: BodyRecord, members: readonly BodyRecord[] = [r]): string {
  if (r.onDemand) return STAR_SECTIONS[3];
  if (starDistancePc(r) < 5) return STAR_SECTIONS[0];
  if (members.some((m) => childrenOf(m.id).some((c) => c.kind === 'exoplanet'))) return STAR_SECTIONS[1];
  return STAR_SECTIONS[2];
}

/** The brightest star of a system (its primary): the least absolute magnitude. */
function primaryOf(stars: readonly BodyRecord[]): BodyRecord {
  return stars.reduce((a, b) => ((b.star?.absMagV ?? 99) < (a.star?.absMagV ?? 99) ? b : a));
}

/**
 * A star system (Alpha Centauri, Sirius, Kepler-16) as a row of its own, its stars listed under
 * it. Going there frames its brightest star with the star it pairs with. A binary with a black hole
 * (Gaia BH1) is listed under The Milky Way with the other black holes, and going there frames its star
 * with the hole in view.
 */
function systemDestination(root: BodyRecord, members: readonly BodyRecord[]): Destination | null {
  const stars = members.filter((m) => m.kind === 'star');
  const holes = members.filter((m) => m.kind === 'black-hole');
  if (!stars.length) return null;
  const primary = primaryOf(stars);
  const p = bodyDestination(primary);
  return {
    id: root.id,
    name: root.name,
    aliases: root.aliases ?? [],
    kind: holes.length ? `Black hole and ${stars.length === 1 ? 'star' : `${stars.length} stars`}` : `System of ${stars.length} stars`,
    group: holes.length ? holeGroup(holes[0]) : 'stars',
    section: holes.length ? undefined : starSection(primary, stars),
    body: primary.id,
    distanceKm: p.distanceKm,
    unavailable: p.unavailable,
    go: () => (holes.length ? goToPair(primary.id, holes[0].id) : goToStarSystem(primary.id)),
  };
}

/** Frame a star with the black hole it orbits: from far enough to hold both (three times their separation). */
function goToPair(star: BodyId, hole: BodyId): void {
  const a = sim.bodies[star];
  const b = sim.bodies[hole];
  const reach = a && b ? a.pos.distanceTo(b.pos) : 0;
  goToBody(star, { distance: Math.max(systemFramingDistance(star), reach * 3) });
}

function bodyDestination(r: BodyRecord): Destination {
  const id = r.id;
  const parent = listParent(r);
  return {
    id,
    name: r.name,
    shortName: r.shortName,
    aliases: r.aliases ?? [],
    kind: kindText(id),
    group: bodyGroup(r),
    section: r.kind === 'star' && id !== 'sun' && !parent ? starSection(r) : !parent ? (deepSkySection(r) ?? galaxySection(r)) : undefined,
    body: id,
    parent,
    key: r.key,
    // Measured now, not read from the last frame (distTrue): a body registered a moment ago
    // (a star chosen in search) has no frame yet. Not known until it has been placed at all.
    distanceKm: () => (isPlaced(id) && sim.bodies[id] ? sim.bodies[id].pos.distanceTo(sim.camera.pos) : NaN),
    // A spacecraft before its launch, say: not there at the date shown.
    unavailable: () => (sim.bodies[id]?.present ? null : `${r.name} is not there at the date shown`),
    // A planet of another star: its star's system, with the planet selected.
    go: () => (r.kind === 'exoplanet' ? goToPlanetarySystem(id) : goToBody(id)),
  };
}

/** Every registered body that is a destination, rebuilt when the registry changes. */
const fromRegistry = { version: -1, list: [] as readonly Destination[] };
function bodyDestinations(): readonly Destination[] {
  const v = registryVersion();
  if (fromRegistry.version !== v) {
    const list = bodyRecords()
      .filter((r) => r.destination !== false)
      .map(bodyDestination);
    // A row for each star system, ahead of its stars (and its black hole).
    const systems = new Map<BodyRecord, BodyRecord[]>();
    for (const r of bodyRecords()) {
      const root = (r.kind === 'star' || r.kind === 'black-hole') && r.parent ? systemRoot(r.parent) : undefined;
      if (root) systems.set(root, [...(systems.get(root) ?? []), r]);
    }
    for (const [root, members] of systems) {
      const d = systemDestination(root, members);
      if (!d) continue;
      const at = list.findIndex((x) => members.some((s) => s.id === x.id));
      list.splice(at < 0 ? list.length : at, 0, d);
    }
    // The Milky Way's rows: the Galaxy, then Sgr A*, then the other black holes, whatever loaded first.
    const later = list.filter((d) => d.group === 'milky-way' && d.id !== 'milky-way' && d.id !== 'sgr-a-star');
    fromRegistry.list = [...list.filter((d) => !later.includes(d)), ...later];
    fromRegistry.version = v;
  }
  return fromRegistry.list;
}

registerDestinations(bodyDestinations);
subscribeRegistry(destinationsChanged);

// ─── The layers of the universe ─────────────────────────────────────────────────────────

/** The cosmic web and the CMB map: places to go that are views, not bodies (they need the galaxies registered). */
const LAYER_DESTINATIONS: readonly Destination[] = [
  {
    id: 'cosmic-web',
    name: 'The cosmic web',
    aliases: ['cosmic web', 'large-scale structure', 'Cosmicflows-4', 'galaxy filaments', 'Laniakea', 'supercluster', 'local universe'],
    kind: 'Map of 55,877 galaxies',
    group: 'universe',
    distanceKm: () => NaN,
    unavailable: () => (isBody('local-group') ? null : 'Loading the galaxies…'),
    go: frameCosmicWeb,
  },
  {
    id: 'cmb',
    name: 'Cosmic microwave background',
    aliases: ['CMB', 'CMB map', 'microwave background', 'WMAP', 'Big Bang', 'oldest light'],
    kind: 'Map of the sky (WMAP)',
    group: 'universe',
    distanceKm: () => NaN,
    unavailable: () => (isBody('local-group') ? null : 'Loading the galaxies…'),
    go: showCmbMap,
  },
];
registerDestinations(() => (isBody('local-group') ? LAYER_DESTINATIONS : []));

// ─── Matching ───────────────────────────────────────────────────────────────────────────

/**
 * Letters and digits with their case, accents and apostrophes gone, anything else a single
 * space, and a leading "the" dropped ("the red planet", "The Moon").
 */
function tidy(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[’'ʻ‘`]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .replace(/^the (?=\S)/i, '');
}

/** Lower case, accents and apostrophes gone, anything else that is not a letter or digit a single space; no leading "the". */
export const normalise = (s: string): string => tidy(s).toLowerCase();

/**
 * Whether the query's letters have the case of the name's where it can mean something: every
 * letter but the first of a word (people rarely type capitals), so a lone letter counts.
 * Planets take lower-case letters and stars of a system capitals: "kepler-16 b" is the
 * planet, "Kepler-16 B" the second star.
 */
export function sameCase(query: string, name: string): boolean {
  const a = tidy(query);
  const b = tidy(name);
  if (a.length !== b.length || a.toLowerCase() !== b.toLowerCase()) return false;
  for (let i = 0; i < a.length; i++) {
    const wordStart = i === 0 || a[i - 1] === ' ';
    const lone = wordStart && (i + 1 === a.length || a[i + 1] === ' ');
    if (wordStart && !lone) continue;
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Restricted Damerau–Levenshtein distance (a swap of neighbours counts as one slip). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/**
 * Letters of the query in order through the text ("jptr" in "jupiter"): 1–199, higher for
 * runs of consecutive letters and for letters that start words; 0 when they are not all there.
 */
function subsequenceScore(q: string, t: string): number {
  let score = 0;
  let j = 0;
  let last = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    while (j < t.length && t[j] !== ch) j++;
    if (j >= t.length) return 0;
    if (j === last + 1) score += 3;
    if (j === 0 || t[j - 1] === ' ') score += 4;
    score -= Math.min(3, j - last - 1);
    last = j;
    j++;
  }
  return Math.max(1, Math.min(199, 100 + score));
}

/**
 * How well a normalised query matches a normalised name: 0 for not at all; otherwise higher
 * is better. The whole name beats its start, which beats the start of a later word, which
 * beats anywhere inside, which beats letters in order, which beats a near miss.
 */
export function matchScore(q: string, t: string): number {
  if (!q || !t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - Math.min(99, t.length - q.length);
  const w = t.indexOf(` ${q}`);
  if (w >= 0) return 800 - Math.min(99, w);
  const i = t.indexOf(q);
  if (i >= 0) return 700 - Math.min(99, i);
  // Letters in order, starting at the start of a word ("jptr" in "jupiter", not "orion" in "new horizons").
  if (q.length >= 3 && (t.startsWith(q[0]) || t.includes(` ${q[0]}`))) {
    const s = subsequenceScore(q, t);
    if (s > 0) return 300 + s;
  }
  if (q.length >= 4) {
    // A slip of the keyboard: compare with the start of each word, as long as the query.
    const allowed = q.length >= 7 ? 2 : 1;
    let best = Infinity;
    for (let k = 0; k < t.length; k++) {
      if (k > 0 && t[k - 1] !== ' ') continue;
      for (const len of [q.length - 1, q.length, q.length + 1]) {
        if (k + len > t.length) continue;
        best = Math.min(best, editDistance(q, t.slice(k, k + len)));
      }
    }
    if (best <= allowed) return 200 - 50 * best;
  }
  return 0;
}

export interface DestinationMatch {
  destination: Destination;
  score: number;
}

/** A whole-name match typed in the name's own case beats any other ("kepler-16 b", the planet, over the star Kepler-16 B). */
const SAME_CASE_BONUS = 15;

/**
 * A name ending in "*" (M87*, Sagittarius A*) scores as an alias, a shade below one that matches as well,
 * unless the query ends in "*" too: "M87" is the galaxy, "M87*" its black hole.
 */
const STAR_NAME_PENALTY = 10.5;

/** The destinations matching a query, best first (names count a little more than aliases). */
export function searchDestinations(query: string, list: readonly Destination[] = allDestinations(), limit = 30): DestinationMatch[] {
  const q = normalise(query);
  if (!q) return [];
  const out: DestinationMatch[] = [];
  const scoreOf = (text: string, penalty: number): number => {
    const s = matchScore(q, normalise(text));
    if (s <= 0) return 0;
    return s - penalty + (s === 1000 && sameCase(query, text) ? SAME_CASE_BONUS : 0);
  };
  const starred = /\*\s*$/.test(query);
  const namePenalty = (name: string, base: number) => (!starred && /\*$/.test(name.trim()) ? STAR_NAME_PENALTY : base);
  for (const d of list) {
    let score = scoreOf(d.name, namePenalty(d.name, 0));
    if (d.shortName) score = Math.max(score, scoreOf(d.shortName, namePenalty(d.shortName, 1)));
    for (const a of d.aliases) score = Math.max(score, scoreOf(a, 10));
    if (score > 0) out.push({ destination: d, score });
  }
  // Stable: equal scores keep the registry's order (Sun outwards).
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.score - a.m.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.m);
}
