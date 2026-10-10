/**
 * Scenes: the one place that sets the view up from a short text spec. The Learn articles'
 * "See it in Skyfold" buttons, the journeys and (later) search all go through here.
 *
 *   go:<target>                 fly the camera to a target and show its card
 *   fly:<target>                a 1 g flip-and-burn flight from Earth, paced by ship time
 *   fly:<target>?beta=<0..1>    a constant-speed flight from Earth
 *   sky-from:<target>           stand beyond a target and look back towards the Sun
 *   date:<YYYY-MM-DD>           set the simulation date
 *   <name>                      a named scene: race-sunlight, year-in-30s, mars-opposition …
 *
 * Targets are the ids in KNOWN_TARGETS (the contract with the articles); resolveTarget turns
 * one into something the camera and the planner can use: any body in the registry
 * (sim/bodies), so a target resolves as soon as data registers its body. Every target and every
 * named scene is in the app once its data have loaded (articleScenes.test.ts checks each see-it
 * block of the articles). Until then a spec says what it is waiting for ("Loading the
 * galaxies…"), or that its data did not load, and its button is disabled.
 *
 * Black holes (the last section): exact Schwarzschild holes, so a scene near one is set up in the
 * hole's own terms. The camera slews to the hole and is then placed exactly from float64 relative to
 * it (controller.hoverAt: a world coordinate is 32 km coarse at Sgr A*'s distance), hovering, in a
 * circular orbit, in a snapshot at speed or falling (the controller's hole modes, sim/fall.ts).
 * sky-from:<black hole> hovers on the line along which the Sun's light reaches the hole
 * (sim/lensBodies.ts alignBehind: at a moving hole the straight line is off by the aberration of that
 * light), where the Sun's Einstein ring has the Moon's apparent radius; a hole in a binary swings off
 * that line within seconds (its orbital velocity changes the aberration), so there the clock is paused
 * at the alignment and the note says for how long the ring would hold. The notes of the named scenes
 * are fixed strings, each at a fixed radius, and blackHoleScenes.test.ts runs every scene and checks
 * each number against the physics (physics/) and what the card and the HUD show there (holeView).
 * The scenes made to show the lens switch the accretion flow off and say so; the next scene puts it
 * back (SCENE_VIEWS). Cost: when a scene starts, the S2 scene's search for a pericentre (about 600
 * orbit evaluations, 0.3 ms) and the sky from a hole's ring timing (about 100 state evaluations, 0.1 ms);
 * nothing per frame.
 *
 * Twins: sim/lensBodies.ts holeView (the card's and the HUD's numbers, which the notes quote),
 * content/journeys.ts (the fall's journey), src/content/blackHoleScenes.test.ts.
 */
import { SearchRelativeLongitude, Body } from 'astronomy-engine';
import { Vector3 } from 'three';
import { AU_KM, C_KM_S, KPC_KM, LIGHT_YEAR_KM, MPC_KM, SUN_RADIUS_KM } from '../physics/constants';
import { einsteinAngle } from '../physics/schwarzschild';
import { bodyName, bodyPositionAt, bodyStateAt, childrenOf, displayRadiusKm, getBody, isBody, type BodyId } from '../sim/bodies';
import { blackHoleRsKm, controller, type HoldStep } from '../controls/cameraController';
import { framingDistance, systemFramingDistance } from '../controls/framing';
import { galacticToWorld } from '../sim/frames';
import { apply as applyMat3, GAL_TO_WORLD } from '../sim/galaxy/frames';
import { RADCLIFFE_ID } from '../sim/dust/clouds';
import { RADCLIFFE_FIT } from '../sim/dust/radcliffe';
import { blackHoleStatus } from '../sim/blackholes';
import { STELLAR_FRAMING_RS } from '../sim/blackholes/records';
import { SGRA_FLOW } from '../sim/blackholes/accretion';
import { fall, startFall } from '../sim/fall';
import { alignBehind } from '../sim/lensBodies';
import { lensProgramsReady } from '../render/lens/lensState';
import { apparentMagnitude } from '../sim/derived';
import { resetToNow, setEpoch, setPaused, setWarp } from '../sim/clock';
import { updateEphemeris } from '../sim/ephemeris';
import { PRECISE_END_MS, PRECISE_START_MS } from '../sim/ephemerisPolicy';
import { sim } from '../sim/sim';
import { solarSystemStatus } from '../sim/solarSystem';
import { starStatus } from '../sim/stars/load';
import { featuredStatus } from '../sim/exoplanets/load';
import { galaxyStatus, nebulaStatus } from '../sim/galaxy/load';
import { cosmosStatus } from '../sim/cosmos/load';
import { planFlight, planTrip, type Drive, type TripPlan } from '../sim/travel';
import { refusalText } from '../ui/flight/tripText';
import { astroTimeAt, daysInMonth, formatDurationShort, formatSimDate, msFromAstroTime, msFromCivil } from '../lib/time';
import { useUI, type UIState } from '../state/ui';
import { emitPulse } from '../sim/pulses';
import { frameCosmicWeb, frameFromOurSide, frameLocalGroup, frameMilkyWay, goToBody, goToStarSystem, goToSystem, showCmbMap } from '../ui/navigation';
import { afterArrival, planOneG, startTrip } from '../ui/tripActions';
import { formatIsoDate } from './learn/catalogue';
import { eqjToWorld } from '../sim/frames';
import { KILONOVA_ID, supernovaById } from '../sim/phenomena';
import { nakedEyeEndMs, shockRadiusKm } from '../sim/phenomena/supernovae';
import { inspiralAt, kilonovaAt, MERGER_MS } from '../sim/phenomena/kilonova';
import { startPace } from '../sim/phenomena/pace';
import { bodyFixedDir, geomagneticPole } from '../sim/phenomena/aurora';
import { registerDestinations, type Destination } from './destinations';

// ─── Targets ────────────────────────────────────────────────────────────────────────────

/** Every target the articles name, with its display name. */
const TARGET_NAMES = {
  sun: 'Sun',
  mercury: 'Mercury',
  venus: 'Venus',
  earth: 'Earth',
  moon: 'Moon',
  mars: 'Mars',
  phobos: 'Phobos',
  deimos: 'Deimos',
  jupiter: 'Jupiter',
  io: 'Io',
  europa: 'Europa',
  ganymede: 'Ganymede',
  callisto: 'Callisto',
  saturn: 'Saturn',
  mimas: 'Mimas',
  enceladus: 'Enceladus',
  tethys: 'Tethys',
  dione: 'Dione',
  rhea: 'Rhea',
  titan: 'Titan',
  hyperion: 'Hyperion',
  iapetus: 'Iapetus',
  uranus: 'Uranus',
  miranda: 'Miranda',
  ariel: 'Ariel',
  umbriel: 'Umbriel',
  titania: 'Titania',
  oberon: 'Oberon',
  neptune: 'Neptune',
  triton: 'Triton',
  proteus: 'Proteus',
  nereid: 'Nereid',
  pluto: 'Pluto',
  charon: 'Charon',
  nix: 'Nix',
  hydra: 'Hydra',
  ceres: 'Ceres',
  vesta: 'Vesta',
  eris: 'Eris',
  haumea: 'Haumea',
  makemake: 'Makemake',
  gonggong: 'Gonggong',
  quaoar: 'Quaoar',
  sedna: 'Sedna',
  orcus: 'Orcus',
  arrokoth: 'Arrokoth',
  halley: 'Halley’s Comet',
  encke: 'Comet Encke',
  'churyumov-gerasimenko': 'Comet 67P/Churyumov–Gerasimenko',
  'hale-bopp': 'Comet Hale–Bopp',
  oumuamua: 'ʻOumuamua',
  borisov: '2I/Borisov',
  'atlas-3i': '3I/ATLAS',
  voyager1: 'Voyager 1',
  voyager2: 'Voyager 2',
  pioneer10: 'Pioneer 10',
  'new-horizons': 'New Horizons',
  'parker-solar-probe': 'Parker Solar Probe',
  jwst: 'James Webb Space Telescope',
  proxima: 'Proxima Centauri',
  'alpha-centauri-a': 'Alpha Centauri A',
  'alpha-centauri-b': 'Alpha Centauri B',
  'barnards-star': 'Barnard’s Star',
  sirius: 'Sirius',
  vega: 'Vega',
  betelgeuse: 'Betelgeuse',
  rigel: 'Rigel',
  polaris: 'Polaris',
  '61-cygni': '61 Cygni',
  'trappist-1': 'TRAPPIST-1',
  'tau-ceti': 'Tau Ceti',
  'epsilon-eridani': 'Epsilon Eridani',
  'wolf-359': 'Wolf 359',
  altair: 'Altair',
  aldebaran: 'Aldebaran',
  antares: 'Antares',
  deneb: 'Deneb',
  arcturus: 'Arcturus',
  'hr-8799': 'HR 8799',
  '51-pegasi': '51 Pegasi',
  'kepler-90': 'Kepler-90',
  'toi-700': 'TOI-700',
  'kepler-16': 'Kepler-16',
  'sgr-a-star': 'Sagittarius A*',
  s2: 'S2',
  'gaia-bh1': 'Gaia BH1',
  'gaia-bh2': 'Gaia BH2',
  'gaia-bh3': 'Gaia BH3',
  'cyg-x-1': 'Cygnus X-1',
  'ogle-2011-blg-0462': 'OGLE-2011-BLG-0462',
  'grs-1915': 'GRS 1915+105',
  'gro-j0422': 'GRO J0422+32',
  'lmc-x-1': 'LMC X-1',
  'm33-x-7': 'M33 X-7',
  'orion-nebula': 'Orion Nebula',
  'crab-nebula': 'Crab Nebula',
  'eagle-nebula': 'Eagle Nebula',
  'ring-nebula': 'Ring Nebula',
  'helix-nebula': 'Helix Nebula',
  'carina-nebula': 'Carina Nebula',
  pleiades: 'Pleiades',
  hyades: 'Hyades',
  'omega-centauri': 'Omega Centauri',
  '47-tucanae': '47 Tucanae',
  andromeda: 'Andromeda Galaxy',
  triangulum: 'Triangulum Galaxy',
  lmc: 'Large Magellanic Cloud',
  smc: 'Small Magellanic Cloud',
  m81: 'Bode’s Galaxy (M81)',
  m87: 'M87',
  'm87-star': 'M87*',
  'm31-star': 'M31*',
  'ngc-4258-bh': 'M106’s black hole',
  'ngc-4889-bh': 'NGC 4889’s black hole',
  'centaurus-a': 'Centaurus A',
  sombrero: 'Sombrero Galaxy',
  whirlpool: 'Whirlpool Galaxy',
  'virgo-cluster': 'Virgo Cluster',
  'coma-cluster': 'Coma Cluster',
  'bullet-cluster': 'Bullet Cluster',
  'gn-z11': 'GN-z11',
  'jades-gs-z14-0': 'JADES-GS-z14-0',
  'mom-z14': 'MoM-z14',
} as const;

export type TargetId = keyof typeof TARGET_NAMES;

/** Every target the articles use, in the order above (Solar System outwards). */
export const KNOWN_TARGETS = Object.keys(TARGET_NAMES) as TargetId[];

export const isKnownTarget = (id: string): id is TargetId => Object.hasOwn(TARGET_NAMES, id);

/** What a target resolves to: something the camera can orbit and the planner can fly to. */
export type TargetRef = { kind: 'body'; id: BodyId; name: string };

/** Turns a target id into a TargetRef, or null when it does not handle that id. */
export type TargetResolver = (id: string) => TargetRef | null;

/** Every registered body (body ids are target ids). */
const bodyResolver: TargetResolver = (id) => (isBody(id) ? { kind: 'body', id, name: bodyName(id) } : null);

const resolvers: TargetResolver[] = [bodyResolver];

/**
 * Add a resolver (a later update's moons, stars or galaxies). Resolvers added later are asked
 * first. Returns a function that removes it again.
 */
export function addTargetResolver(fn: TargetResolver): () => void {
  resolvers.unshift(fn);
  return () => {
    const i = resolvers.indexOf(fn);
    if (i >= 0) resolvers.splice(i, 1);
  };
}

/** The camera and planner's handle on a target, or null if it is not in the app yet. */
export function resolveTarget(id: string): TargetRef | null {
  for (const r of resolvers) {
    const ref = r(id);
    if (ref) return ref;
  }
  return null;
}

/** A target's display name, whether or not it resolves yet. */
export const targetName = (id: string): string => resolveTarget(id)?.name ?? (isKnownTarget(id) ? TARGET_NAMES[id] : id);

// ─── Specs ──────────────────────────────────────────────────────────────────────────────

export const NAMED_SCENES = [
  'race-sunlight',
  'year-in-30s',
  'moon-month',
  'split-0.999c',
  'light-time-correction',
  'mars-opposition',
  'jupiter-moons',
  'galactic-centre-orbits',
  'milky-way-outside',
  'into-the-orion-clouds',
  'radcliffe-wave',
  'local-group',
  'cosmic-web',
  'famous-galaxies',
  'virgo-cluster-close',
  'coma-cluster-close',
  'cmb-map',
  'cmb-glow',
  'edge-of-reach',
  'voyager2-neptune',
  'halley-2061',
  'trappist-1-worlds',
  'sgr-a-star-shadow',
  'photon-ring',
  'sgr-a-star-einstein-ring',
  'hover-at-the-horizon',
  'isco-orbit',
  'fall-into-sgr-a-star',
  'dive-and-climb',
  'sgr-a-star-flyby',
  's2-behind-sgr-a-star',
  'sgr-a-star-flow',
  'sgr-a-star-radio',
  'm87-star-close',
  'cyg-x-1-disk',
  'cyg-x-1-from-above',
  'lmc-x-1-disk',
  'grs-1915-disk',
  'black-hole-tour',
  'monsters-among-the-stars',
  'sn-1006-from-earth',
  'sn-1054-from-earth',
  'sn-1181-from-earth',
  'sn-1572-from-earth',
  'sn-1604-from-earth',
  'sn-1987a-from-earth',
  'sn-1572-up-close',
  'sn-1987a-up-close',
  'kilonova-gw170817',
  'm87-jet',
  'centaurus-a-jets',
  'aurora',
] as const;
export type NamedSceneId = (typeof NAMED_SCENES)[number];

const isNamed = (s: string): s is NamedSceneId => (NAMED_SCENES as readonly string[]).includes(s);

export type Scene =
  | { kind: 'go'; target: string }
  /** beta null: the 1 g rocket; otherwise a constant speed, as a fraction of c. */
  | { kind: 'fly'; target: string; beta: number | null }
  | { kind: 'sky-from'; target: string }
  | { kind: 'date'; date: string; ms: number }
  | { kind: 'named'; name: NamedSceneId };

const TARGET_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A target in KNOWN_TARGETS, or any id a resolver added later knows. */
const isTarget = (id: string) => isKnownTarget(id) || (TARGET_RE.test(id) && resolveTarget(id) !== null);

/** A spec read into its parts, or null when it is not one (unknown kind or target, bad speed or date). */
export function parseScene(spec: string): Scene | null {
  const s = spec.trim();
  if (isNamed(s)) return { kind: 'named', name: s };
  const m = s.match(/^(go|fly|sky-from|date):([^?\s]+)(?:\?(\S*))?$/);
  if (!m) return null;
  const [, kind, arg, query] = m;
  if (kind === 'date') {
    const d = query === undefined ? arg.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
    if (!d) return null;
    const [y, mo, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
    if (mo < 1 || mo > 12 || day < 1 || day > daysInMonth(y, mo)) return null;
    return { kind: 'date', date: arg, ms: msFromCivil(y, mo, day) };
  }
  if (!isTarget(arg)) return null;
  if (kind === 'fly') {
    if (query === undefined) return { kind: 'fly', target: arg, beta: null };
    const b = query.match(/^beta=(\d*\.?\d+)$/);
    const beta = b ? Number(b[1]) : NaN;
    return beta > 0 && beta < 1 ? { kind: 'fly', target: arg, beta } : null;
  }
  if (query !== undefined) return null;
  return kind === 'go' ? { kind: 'go', target: arg } : { kind: 'sky-from', target: arg };
}

/** The canonical spec of a scene ("fly:saturn?beta=0.9"). */
export function specOf(s: Scene): string {
  switch (s.kind) {
    case 'named':
      return s.name;
    case 'date':
      return `date:${s.date}`;
    case 'fly':
      return s.beta === null ? `fly:${s.target}` : `fly:${s.target}?beta=${s.beta}`;
    default:
      return `${s.kind}:${s.target}`;
  }
}

// ─── Named scenes ───────────────────────────────────────────────────────────────────────

/** A flight: where to, how, and at what cruise speed. */
export interface Flight {
  dest: BodyId;
  drive: Drive;
  /** Cruise speed as a fraction of c (ignored by the rocket drive). */
  beta: number;
  /** Show the classical sky beside the relativistic one. */
  split?: boolean;
}

export interface SceneDef {
  label: string;
  /** What to look for, shown while the scene runs (the caller may pass its own). */
  note?: string;
  /** A scene that is a flight from Earth, for predictions. */
  flight?: Flight;
  /** Why the scene cannot run right now, or null. */
  unavailable?: () => string | null;
  /** Set the scene up; false when it could not start. */
  run: (note: string) => boolean;
}

const NAMED = new Map<NamedSceneId, SceneDef>();

/** What each named scene is, for its button before its definition is in (every one is below). */
const PENDING_LABELS: Record<NamedSceneId, string> = {
  'race-sunlight': 'Race sunlight to Earth',
  'year-in-30s': 'A year in half a minute',
  'moon-month': 'Watch the Moon go round',
  'split-0.999c': 'The sky at 0.999c, split screen',
  'light-time-correction': 'Light-time correction',
  'mars-opposition': 'The next opposition of Mars',
  'jupiter-moons': 'Jupiter’s moons',
  'galactic-centre-orbits': 'Stars orbiting the centre of the Galaxy',
  'milky-way-outside': 'The Milky Way from outside',
  'into-the-orion-clouds': 'Into the Orion clouds',
  'radcliffe-wave': 'The Radcliffe Wave',
  'local-group': 'The Local Group',
  'cosmic-web': 'The cosmic web',
  'famous-galaxies': 'Famous galaxies, as photographed',
  'virgo-cluster-close': 'The Virgo Cluster',
  'coma-cluster-close': 'The Coma Cluster',
  'cmb-map': 'The cosmic microwave background',
  'cmb-glow': 'The Big Bang’s glow, seen at speed',
  'edge-of-reach': 'The edge of reach',
  'voyager2-neptune': 'Ride Voyager 2 past Neptune',
  'halley-2061': 'Halley comes back',
  'trappist-1-worlds': 'Seven worlds of TRAPPIST-1',
  'sgr-a-star-shadow': 'The shadow of Sgr A*',
  'photon-ring': 'The photon ring',
  'sgr-a-star-einstein-ring': 'Sgr A*’s Einstein ring',
  'hover-at-the-horizon': 'Hovering at the horizon',
  'isco-orbit': 'The innermost stable orbit',
  'fall-into-sgr-a-star': 'Fall into Sgr A*',
  'dive-and-climb': 'Same place, three speeds',
  'sgr-a-star-flyby': 'Flying past Sgr A*',
  's2-behind-sgr-a-star': 'S2 behind the black hole',
  'sgr-a-star-flow': 'The gas round Sgr A*',
  'sgr-a-star-radio': 'Sagittarius A* in radio light',
  'm87-star-close': 'M87* from 1,000 au',
  'cyg-x-1-disk': 'The disc of Cygnus X-1',
  'cyg-x-1-from-above': 'Cygnus X-1 from above',
  'lmc-x-1-disk': 'A black hole in another galaxy',
  'grs-1915-disk': 'GRS 1915+105 as we see it',
  'black-hole-tour': 'A tour of black holes',
  'monsters-among-the-stars': 'Monsters among the stars',
  'sn-1006-from-earth': 'The brightest star in history: SN 1006',
  'sn-1054-from-earth': 'The new star of 1054',
  'sn-1181-from-earth': 'The new star of 1181',
  'sn-1572-from-earth': 'Tycho’s new star, 1572',
  'sn-1604-from-earth': 'Kepler’s star beside Jupiter, 1604',
  'sn-1987a-from-earth': 'Supernova 1987A',
  'sn-1572-up-close': 'Tycho’s star explodes (a model)',
  'sn-1987a-up-close': 'SN 1987A and its ring (a model)',
  'kilonova-gw170817': 'Two neutron stars collide: GW170817',
  'm87-jet': 'The jet of M87',
  'centaurus-a-jets': 'The jets and lobes of Centaurus A',
  'aurora': 'The northern lights from space',
};

/** Define (or replace) a named scene. */
export function defineScene(name: NamedSceneId, def: SceneDef): void {
  NAMED.set(name, def);
}

// ─── Status ─────────────────────────────────────────────────────────────────────────────

export interface SceneStatus {
  ok: boolean;
  /** Why not, when not ok. */
  reason?: string;
  /** What the scene is, in a few words ("Fly to Saturn at 0.9c"). */
  label: string;
}

/**
 * What a spec says when what it needs is not in the app and its data are not on the way: never
 * for the articles' targets and scenes in the app, whose loaders all start with the page
 * (main.tsx), so they are loading, loaded or failed.
 */
export const LATER = 'Not in Skyfold yet';
const LOADING = 'Loading the Solar System data…';
const LOADING_STARS = 'Loading the star catalogue…';
/** What a spec says when its data did not load. */
const failedText = (what: string) => `${what} did not load: reload the page to try again`;

/** The targets that are stars (and star systems): they resolve once the star catalogue is in (sim/stars). */
const STAR_TARGETS: ReadonlySet<string> = new Set([
  'alpha-centauri-a',
  'alpha-centauri-b',
  'barnards-star',
  'sirius',
  'vega',
  'betelgeuse',
  'rigel',
  'polaris',
  '61-cygni',
  'trappist-1',
  'tau-ceti',
  'epsilon-eridani',
  'wolf-359',
  'altair',
  'aldebaran',
  'antares',
  'deneb',
  'arcturus',
  'hr-8799',
  '51-pegasi',
  // The extreme stars (sim/stars/extremeStars.ts).
  'mu-cephei',
  'vy-canis-majoris',
  'uy-scuti',
  'stephenson-2-18',
  'eta-carinae',
  'achernar',
  'wr-104',
  'regulus',
]);
/**
 * Hosts of the featured exoplanet systems that the star catalogue lacks, and a planet the scenes
 * use: they arrive with the planets (sim/exoplanets).
 */
const EXOPLANET_TARGETS: ReadonlySet<string> = new Set(['kepler-90', 'toi-700', 'kepler-16', 'trappist-1-h']);
const LOADING_EXOPLANETS = 'Loading the planetary systems…';
/**
 * The Milky Way's bodies: the star clusters resolve once its data are in; the Galaxy itself, Sgr A*
 * and the S-stars are registered as that load starts (sim/galaxy).
 */
const CLUSTER_TARGETS: ReadonlySet<string> = new Set(['pleiades', 'hyades', 'omega-centauri', '47-tucanae', 'milky-way', 'sgr-a-star', 's2']);
/** The nebulae: their file is a chunk of its own, in soon after start-up (sim/galaxy). */
const NEBULA_TARGETS: ReadonlySet<string> = new Set(['orion-nebula', 'crab-nebula', 'eagle-nebula', 'ring-nebula', 'helix-nebula', 'carina-nebula']);
const LOADING_GALAXY = 'Loading the Milky Way…';
/** The galaxies beyond the Milky Way and the Local Group: they resolve once the Local Group's file is in (sim/cosmos). */
const GALAXY_TARGETS: ReadonlySet<string> = new Set([
  'local-group',
  'andromeda',
  'triangulum',
  'lmc',
  'smc',
  'm81',
  'm87',
  'centaurus-a',
  'sombrero',
  'whirlpool',
  'm82',
  'm101',
  'm64',
  'm63',
  'm83',
  'ngc-253',
  'm86',
  'm100',
  'ngc-4874',
  'ngc-4889',
  'virgo-cluster',
  'coma-cluster',
  'bullet-cluster',
  'gn-z11',
  'jades-gs-z14-0',
  'mom-z14',
]);
const LOADING_GALAXIES = 'Loading the galaxies…';
/**
 * The black holes besides Sgr A* (sim/blackholes): the binaries (those in the Magellanic Clouds and M33 too) and the
 * lone hole arrive with the star catalogue, M87* and the other galaxies' holes with the galaxies (blackHoleStatus says
 * which).
 */
const STELLAR_HOLE_TARGETS: ReadonlySet<string> = new Set(['gaia-bh1', 'gaia-bh2', 'gaia-bh3', 'cyg-x-1', 'ogle-2011-blg-0462', 'grs-1915', 'gro-j0422', 'lmc-x-1', 'm33-x-7']);
const GALAXY_HOLE_TARGETS: ReadonlySet<string> = new Set(['m87-star', 'm31-star', 'ngc-4258-bh', 'ngc-4889-bh']);
const BUSY = 'A flight is under way: finish it or abort it first';
/** A fall into a black hole holds tripActive as a flight does, but is stopped rather than aborted. */
const FALLING = 'A fall into a black hole is under way: stop it (Stop the fall) or let it end first';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Where a target's data come from: how far their loading has got, and what to say meanwhile. */
interface DataSource {
  has: (id: string) => boolean;
  status: (id: string) => LoadStatus;
  loading: string;
  failed: string;
}

/** The files the targets come from, the Solar System's last (it takes every other target). */
const SOURCES: DataSource[] = [
  { has: (id) => STAR_TARGETS.has(id), status: starStatus, loading: LOADING_STARS, failed: failedText('The star catalogue') },
  { has: (id) => EXOPLANET_TARGETS.has(id), status: featuredStatus, loading: LOADING_EXOPLANETS, failed: failedText('The planetary systems') },
  { has: (id) => CLUSTER_TARGETS.has(id), status: galaxyStatus, loading: LOADING_GALAXY, failed: failedText('The Milky Way’s data') },
  { has: (id) => NEBULA_TARGETS.has(id), status: nebulaStatus, loading: LOADING_GALAXY, failed: failedText('The nebulae') },
  { has: (id) => GALAXY_TARGETS.has(id), status: cosmosStatus, loading: LOADING_GALAXIES, failed: failedText('The galaxies') },
  { has: (id) => STELLAR_HOLE_TARGETS.has(id), status: blackHoleStatus, loading: LOADING_STARS, failed: failedText('The star catalogue') },
  { has: (id) => GALAXY_HOLE_TARGETS.has(id), status: blackHoleStatus, loading: LOADING_GALAXIES, failed: failedText('The galaxies') },
  { has: () => true, status: solarSystemStatus, loading: LOADING, failed: failedText('The Solar System data') },
];

/**
 * Why a body the app should have is not registered: its data are loading or did not load. LATER
 * when neither (its loader was never asked, as in tests).
 */
function missingReason(id: string): string {
  const src = SOURCES.find((s) => s.has(id))!;
  const status = src.status(id);
  return status === 'loading' ? src.loading : status === 'failed' ? src.failed : LATER;
}

/**
 * Where the data a body would come from stand, and what to say while they load or if they did not (a saved place or a
 * link waiting for its body, ui/places.ts). `known`: the id is one of the targets above, whose data say whether it
 * exists; for any other id (a catalogue star, an NGC object, an id renamed since) the Solar System's are reported.
 */
export function targetData(id: string): { known: boolean; status: LoadStatus; loading: string; failed: string } {
  const src = SOURCES.find((s) => s.has(id))!;
  const known = isKnownTarget(id) || src !== SOURCES[SOURCES.length - 1];
  return { known, status: src.status(id), loading: src.loading, failed: src.failed };
}

/** Why a scene that needs these bodies cannot run yet, or null when they are all in. */
const needs =
  (...ids: string[]) =>
  (): string | null => {
    const missing = ids.find((id) => !isBody(id));
    return missing === undefined ? null : missingReason(missing);
  };

function labelOf(s: Scene): string {
  switch (s.kind) {
    case 'named':
      return NAMED.get(s.name)?.label ?? PENDING_LABELS[s.name];
    case 'date':
      return `Go to ${formatIsoDate(s.date)}`;
    case 'go':
      return `Go to ${theName(targetName(s.target))}`;
    case 'sky-from':
      return `The sky from ${theName(targetName(s.target))}`;
    case 'fly':
      return `Fly to ${theName(targetName(s.target))} ${s.beta === null ? 'at 1 g' : `at ${s.beta}c`}`;
  }
}

/** A body that does not exist at the date shown (Voyager 1 before 1977) cannot be visited. */
const absent = (ref: TargetRef) => !sim.bodies[ref.id]?.present;

/** A flight as it would leave Earth now (null: out of reach). */
export function predictFlight(f: Flight): TripPlan | null {
  return planTrip(f.dest, f.beta, sim.bodies.earth.pos.clone(), sim.astroTime, f.drive);
}

function flightTo(ref: TargetRef, beta: number | null): Flight {
  return beta === null ? { dest: ref.id, drive: 'rocket', beta: 0 } : { dest: ref.id, drive: 'cruise', beta };
}

function flightBlocker(f: Flight, name: string): string | null {
  if (f.dest === 'earth') return 'Flights leave from Earth';
  if (!sim.bodies[f.dest]?.present) return `${name} is not there at the date shown`;
  const r = planFlight(f.dest, f.beta, sim.bodies.earth.pos.clone(), sim.astroTime, f.drive);
  if (r.ok) return null;
  // The planner's reason in a few words ("beyond the cosmic event horizon").
  const why = r.refusal ? refusalText(r.refusal, name).title : '';
  return why ? `${name} cannot be reached from Earth: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : `${name} is out of reach from Earth today`;
}

function blocker(s: Scene): string | null {
  // What is not in the app yet comes first: that answer does not depend on the moment.
  const def = s.kind === 'named' ? NAMED.get(s.name) : undefined;
  const ref = s.kind === 'go' || s.kind === 'fly' || s.kind === 'sky-from' ? resolveTarget(s.target) : null;
  if (s.kind === 'named' && !def) return LATER;
  // A target whose data are still on their way, or did not load.
  if (s.kind !== 'named' && s.kind !== 'date' && !ref) return isKnownTarget(s.target) ? missingReason(s.target) : LATER;
  const ui = useUI.getState();
  if (ui.tripActive) return ui.fallActive ? FALLING : BUSY;
  switch (s.kind) {
    case 'named':
      return def?.unavailable?.() ?? null;
    case 'date':
      return null;
    case 'fly':
      return flightBlocker(flightTo(ref!, s.beta), ref!.name);
    default:
      return absent(ref!) ? `${ref!.name} is not there at the date shown` : null;
  }
}

/** Whether a spec can run now, why not, and what it is. */
export function sceneStatus(spec: string): SceneStatus {
  const s = parseScene(spec);
  if (!s) return { ok: false, reason: 'Not a scene Skyfold knows', label: spec };
  const label = labelOf(s);
  const reason = blocker(s);
  return reason ? { ok: false, reason, label } : { ok: true, label };
}

// ─── Notes ──────────────────────────────────────────────────────────────────────────────

/** Notes written for particular flights (the journeys'); other flights get a generic one. */
const FLIGHT_NOTES: Record<string, string> = {
  'fly:saturn?beta=0.9':
    'The stars gather ahead of you and turn blue. Your clock runs at less than half the rate of the clock at home. Drag to look around; Astern shows the Sun reddened.',
  'fly:voyager1?beta=0.99':
    'Voyager 1 is almost a light-day from Earth. At 0.99c the trip takes about a day by Earth’s clocks and under four hours by yours. Look astern: the Sun has become a faint red star.',
  'fly:trappist-1':
    'TRAPPIST-1 is 40 light-years away. A steady push of one Earth gravity gets you there in about 7.3 years of your time while 42 years pass on Earth. Skip to arrival when you have seen enough.',
  'fly:proxima':
    'A steady push of one Earth gravity takes you to the nearest star in 3.5 years of your time while 5.9 years pass on Earth. Each second here is three weeks on board; Skip to arrival when you have seen enough.',
  'fly:sgr-a-star':
    'The black hole at the centre of the Galaxy is 8,277 parsecs (27,000 light-years) away. A steady push of one Earth gravity, turning round halfway to brake, gets you there in about 20 years of your time while about 27,000 years pass at home. Inside the Galaxy space is taken as static: no expansion to allow for. You stop 4,000 au out, where the black hole is far too small to see but bends the light from behind it into a ring 0.75° across.',
};

/** A name as a sentence uses it: "the Andromeda Galaxy", "the Sun", but "Proxima Centauri", "Bode’s Galaxy (M81)". */
export function theName(name: string): string {
  return /^(?:Sun|Moon|Milky Way|Pleiades|Hyades)$|^[^’']*\b(?:Galaxy|Cluster|Nebula|Cloud|Group|Telescope)$/.test(name) ? `the ${name}` : name;
}

/** The flight as planned from Earth now, or null (out of reach, or not plannable yet). */
function plannedFlight(f: Flight): TripPlan | null {
  try {
    return predictFlight(f);
  } catch {
    return null;
  }
}

/** What a flight through the expanding universe assumes (sim/travel.ts). */
const EXPANDING = ' The universe expands on the way: the flight is a model, with a perfect engine and galaxies carried along by the expansion.';

function flightNote(f: Flight, name: string): string {
  const plan = plannedFlight(f);
  const expanding = plan?.model === 'flrw' ? EXPANDING : '';
  if (f.drive === 'rocket') {
    const times = plan && plan.shipTime > 0 && plan.earthTime > 0 ? `: about ${formatDurationShort(plan.shipTime)} on board and ${formatDurationShort(plan.earthTime)} at home` : '';
    const turn = plan?.model === 'flrw' ? 'turning round a little after halfway' : 'turning round halfway';
    return `A rocket pushing at one Earth gravity, ${turn} to arrive at ${theName(name)} at rest${times}.${expanding} Watch your clock fall behind the one at home; Skip to arrival when you have seen enough.`;
  }
  const rate = Math.sqrt(1 - f.beta * f.beta);
  const pct = rate < 0.1 ? (rate * 100).toPrecision(2) : String(Math.round(rate * 100));
  const clock = pct === '100' ? 'at almost exactly the rate of Earth’s' : `at ${pct}% of the rate of Earth’s`;
  const sky = f.beta >= 0.5 ? ' The stars gather ahead of you and turn blue; drag to look around.' : '';
  return `A steady ${f.beta}c from Earth to ${theName(name)}. Your clock, τ, runs ${clock}, t.${expanding}${sky}`;
}

/** What to look for while a scene runs (null: none, as for go:). */
export function sceneNote(spec: string): string | null {
  const s = parseScene(spec);
  if (!s) return null;
  switch (s.kind) {
    case 'named':
      return NAMED.get(s.name)?.note ?? null;
    case 'go':
      return null;
    case 'date':
      return `The date is now ${formatIsoDate(s.date)}. Press N to come back to today.`;
    case 'sky-from': {
      const ref = resolveTarget(s.target);
      if (ref && isStar(ref.id)) return starSkyNote(ref);
      if (ref && isHole(ref.id)) return holeSkyNote(ref);
      return `Beyond ${theName(targetName(s.target))}, looking back towards ${ref?.id === 'sun' ? 'Earth' : 'the Sun'}. Drag to look around.`;
    }
    case 'fly': {
      const ref = resolveTarget(s.target);
      return FLIGHT_NOTES[specOf(s)] ?? (ref ? flightNote(flightTo(ref, s.beta), ref.name) : null);
    }
  }
}

/** The flight a spec makes from Earth, if it is one (for predictions). */
export function flightOf(spec: string): Flight | null {
  const s = parseScene(spec);
  if (s?.kind === 'named') return NAMED.get(s.name)?.flight ?? null;
  if (s?.kind !== 'fly') return null;
  const ref = resolveTarget(s.target);
  return ref ? flightTo(ref, s.beta) : null;
}

// ─── Running ────────────────────────────────────────────────────────────────────────────

/**
 * Leave orbit, Roam and free flight behind, and a black hole's own modes (a circular orbit or a snapshot
 * at speed ends with the camera hovering where it is); false when a trip or a fall is under way (a
 * fall holds tripActive). The card of the last fall's end goes too: it would hide the new scene's note.
 */
export function ready(): boolean {
  const ui = useUI.getState();
  if (ui.tripActive) return false;
  if (ui.controlMode === 'free') controller.exitFreeFlight();
  if (ui.controlMode === 'roam') controller.exitRoam();
  controller.leaveHoleModes();
  fall.lastEnd = null;
  return true;
}

/** The one scene step waiting for a slew to end (cancelled by the next scene). */
let pendingStep: (() => void) | null = null;

/** Where a camera at rest can be: in orbit, or about a black hole in one of the hole's own modes. */
const SETTLED_MODES: ReadonlySet<string> = new Set(['orbit', 'circular', 'hold', 'fall']);

/** Drop a scene step still waiting for its slew. */
export function cancelSceneStep(): void {
  pendingStep?.();
  pendingStep = null;
}

/**
 * Run a scene's next step once the camera has finished the slew to `target` that the scene has
 * just started (at once if it is already there). If the visitor moves the camera first, the
 * step is dropped: time must not jump to a million times faster over Mars because a Sun scene
 * was left mid-slew. Only one step waits at a time, so starting a scene again does not run it
 * twice. About a black hole the camera may rest in one of the hole's own modes rather than in
 * orbit (a circular orbit, a snapshot, a fall): that counts as settled too, as long as nothing has
 * moved the camera since.
 */
export function afterSlew(target: BodyId, fn: () => void): void {
  cancelSceneStep();
  const move = controller.moves;
  const settled = (s: { controlMode: string; focus: BodyId }) =>
    SETTLED_MODES.has(s.controlMode) && s.focus === target && controller.moves === move;
  const now = useUI.getState();
  if (now.controlMode !== 'transition') {
    if (settled(now)) fn();
    return;
  }
  const unsub = useUI.subscribe((s) => {
    if (s.controlMode === 'transition') return;
    cancelSceneStep();
    if (settled(s)) fn();
  });
  pendingStep = unsub;
}

/** How often a scene step waiting for the lens's programs looks again, ms. */
const LENS_POLL_MS = 250;

/**
 * Run a scene's step once every lensed program has compiled (render/lens/lensState.ts lensProgramsReady: until
 * then no black hole is drawn at all): at once when they have, which is usual. Right after the app opens they
 * may still be compiling in the background (a minute on a slow machine), and the step waits, looking again
 * every quarter second, while the camera hovers where the slew left it; `waiting` runs once if it has to. Like
 * afterSlew's, the step is dropped if the visitor moves the camera or another scene starts first.
 */
function whenLensReady(fn: () => void, waiting?: () => void): void {
  cancelSceneStep();
  if (lensProgramsReady()) {
    fn();
    return;
  }
  waiting?.();
  const move = controller.moves;
  const timer = setInterval(() => {
    if (controller.moves !== move || useUI.getState().tripActive) {
      cancelSceneStep();
      return;
    }
    if (!lensProgramsReady()) return;
    cancelSceneStep();
    fn();
  }, LENS_POLL_MS);
  pendingStep = () => clearInterval(timer);
}

const ABOVE = new Vector3(0.18, 1, 0.32);
const UP = new Vector3(0, 1, 0);

function fly(f: Flight, note: string): boolean {
  if (!ready()) return false;
  // Flights leave from Earth: put the camera there now (a flight departs from the camera).
  controller.placeAt('earth', 26_000);
  controller.update(0, 0);
  // The trip paces itself by ship time (about a minute); only the pause needs lifting.
  if (!startTrip(f.dest, f.beta, f.drive)) return false;
  setPaused(false);
  useUI.setState((s) => ({ journeyNote: note, journeysOpen: false, relMode: f.split ? 'split' : s.relMode === 'off' ? 'on' : s.relMode }));
  return true;
}

function scene(note: string, setUp: () => void): boolean {
  if (!ready()) return false;
  useUI.setState({ journeyNote: note, journeysOpen: false, selected: null });
  setUp();
  return true;
}

function go(ref: TargetRef): boolean {
  if (!ready()) return false;
  useUI.setState({ journeyNote: null, journeysOpen: false });
  // A star with known planets: the whole planetary system, orbits and names shown.
  if (hasPlanets(ref.id)) {
    useUI.setState({ showOrbits: true, showLabels: true });
    goToSystem(ref.id);
  } else if (hasCompanion(ref.id)) {
    // A star in a pair (Sirius A with Sirius B): far enough out to see both.
    useUI.setState({ showLabels: true });
    goToStarSystem(ref.id);
  } else goToBody(ref.id);
  return true;
}

/** A star with another star in its system (its parent a barycentre with more than one star). */
const hasCompanion = (id: BodyId): boolean => {
  const parent = getBody(id)?.kind === 'star' ? getBody(id)?.parent : undefined;
  return !!parent && getBody(parent)?.kind === 'barycentre' && childrenOf(parent).filter((c) => c.kind === 'star').length > 1;
};

/** A star (other than the Sun) with planets registered about it. */
const hasPlanets = (id: BodyId): boolean => id !== 'sun' && getBody(id)?.kind === 'star' && childrenOf(id).some((c) => c.kind === 'exoplanet');

/** A star other than the Sun: its sky is seen from beside it, looking back at the Sun. */
const isStar = (id: BodyId): boolean => id !== 'sun' && getBody(id)?.kind === 'star';

/** A black hole: its sky is seen from exactly behind it, with the Sun's light bent into a ring. */
const isHole = (id: BodyId): boolean => getBody(id)?.kind === 'black-hole' && blackHoleRsKm(id) > 0;

/** What the Sun looks like from a star: its distance and magnitude. */
function starSkyNote(ref: TargetRef): string {
  const d = sim.bodies[ref.id]?.pos.length() ?? 0;
  if (!(d > 0)) return `At ${ref.name}, looking back at the Sun. Drag to look around.`;
  const ly = d / LIGHT_YEAR_KM;
  // The Sun as the card shows it from where the scene puts the camera.
  const vSun = apparentMagnitude('sun', skyFromStarKm(ref));
  const lyText = ly < 100 ? ly.toFixed(ly < 10 ? 2 : 1) : Math.round(ly).toLocaleString('en-GB');
  const seen = vSun < 6 ? `the star in the middle, at magnitude ${vSun.toFixed(1)}` : `too faint to see without a telescope (magnitude ${vSun.toFixed(1)}), in the middle of the view`;
  return `At ${ref.name}, ${lyText} light-years out, looking back: the Sun is ${seen}. The constellations are those seen from here. Drag to look around.`;
}

/**
 * The sky from a star: the camera beside it, on the side facing the Sun (the star just behind
 * you, out of the view), looking back at the Sun. The constellation figures show there by
 * themselves ('auto' draws them beyond 0.2 pc, and every star is farther than that); the scene
 * leaves the saved setting alone, so someone who turned them off keeps them off.
 */
function skyFromStar(ref: TargetRef, note: string): boolean {
  return scene(note, () => {
    const at = sim.bodies[ref.id]!.pos;
    useUI.setState({ showLabels: true, selected: ref.id });
    controller.goTo('sun', { distance: skyFromStarKm(ref), direction: at.clone().normalize() });
  });
}

/** How far from the Sun the sky from a star is seen, km: beside the star (100 of its radii, at least 1 au) on the Sun's side. */
function skyFromStarKm(ref: TargetRef): number {
  const d = sim.bodies[ref.id]!.pos.length();
  const rec = getBody(ref.id);
  const beside = Math.max(rec ? 100 * displayRadiusKm(rec) : 0, AU_KM);
  return Math.max(d - beside, 0.5 * d);
}

function skyFrom(ref: TargetRef, note: string): boolean {
  if (isStar(ref.id)) return skyFromStar(ref, note);
  if (isHole(ref.id)) return skyFromHole(ref, note);
  return scene(note, () => {
    const at = sim.bodies[ref.id]!.pos;
    const home = ref.id === 'sun' ? sim.bodies.earth.pos : sim.bodies.sun.pos;
    // Beyond the body on the far side from home, raised a little, so home shows beside it.
    const dir = at.clone().sub(home);
    if (!(dir.lengthSq() > 0)) dir.copy(ABOVE);
    dir.normalize().addScaledVector(UP, 0.18).normalize();
    useUI.setState({ showLabels: true, selected: ref.id });
    controller.goTo(ref.id, { distance: framingDistance(ref.id) * 2.5, direction: dir });
  });
}

function jumpTo(ms: number, note: string): boolean {
  if (!ready() || !setEpoch(ms)) return false;
  updateEphemeris(); // so anything framed next sees the new date
  setWarp(1);
  setPaused(false);
  useUI.setState({ journeyNote: note, journeysOpen: false });
  return true;
}

/**
 * Set a scene up. `note` replaces the scene's own line on what to look for. False when it
 * cannot run (see sceneStatus for why).
 */
export function runScene(spec: string, opts: { note?: string } = {}): boolean {
  const s = parseScene(spec);
  if (!s || !sceneStatus(spec).ok) return false;
  // A new scene replaces anything the last one still had to do, and the views it turned on.
  cancelSceneStep();
  restoreSceneViews();
  // Scenes are written for the present at real time: each starts there (a date scene sets its own date,
  // and a scene that runs time faster sets its own pace), not at the date or the pace the last one left.
  if (s.kind !== 'date') backToPresent();
  // A scene takes over the view: nothing modal stays over it.
  useUI.setState({ welcomeOpen: false, tourStep: null, keysOpen: false, searchOpen: false });
  const note = opts.note ?? sceneNote(spec) ?? '';
  const before = currentViews();
  try {
    return start(s, note);
  } finally {
    recordSceneViews(before);
  }
}

/** The present at real time, unless the clock is already there (or a flight is under way, when time cannot jump). */
function backToPresent(): void {
  if (useUI.getState().tripActive) return;
  if (!sim.live || sim.paused || sim.warp !== 1) {
    resetToNow();
    updateEphemeris(); // so the scene frames what is there now, and its note is worded for now
  }
}

function start(s: Scene, note: string): boolean {
  switch (s.kind) {
    case 'named':
      return NAMED.get(s.name)!.run(note);
    case 'date':
      return jumpTo(s.ms, note);
    case 'go':
      return go(resolveTarget(s.target)!);
    case 'sky-from':
      return skyFrom(resolveTarget(s.target)!, note);
    case 'fly':
      return fly(flightTo(resolveTarget(s.target)!, s.beta), note);
  }
}

/**
 * Views a scene may turn on for itself: the CMB map over the sky, light-time correction, the
 * relativistic view (split, or with its Doppler colours), the cosmic web, and near a black hole
 * its lens, the accretion flow and the flow's band and blur (the scenes made to show the lens
 * switch the flow off), and the thin accretion discs (whose scenes hide the orbit lines, which run through the
 * disc's plane). What one scene turned on, the next scene turns back (unless the visitor
 * has changed it since), so the CMB map does not stay over Jupiter after the CMB scene, nor the
 * flow stay hidden after a lens scene.
 */
const SCENE_VIEWS = ['showCmb', 'showOrbits', 'retarded', 'relMode', 'relDoppler', 'cosmicWeb', 'lensing', 'accretionFlow', 'accretionDisks', 'accretionBand', 'ehtBlur'] as const;
type SceneView = (typeof SCENE_VIEWS)[number];
type SceneViews = Partial<Pick<UIState, SceneView>>;

/** What the last scene changed: each view as it was before, and as the scene left it. */
let sceneViews: { was: SceneViews; set: SceneViews } = { was: {}, set: {} };

function currentViews(): Pick<UIState, SceneView> {
  const s = useUI.getState();
  return {
    showCmb: s.showCmb,
    showOrbits: s.showOrbits,
    retarded: s.retarded,
    relMode: s.relMode,
    relDoppler: s.relDoppler,
    cosmicWeb: s.cosmicWeb,
    lensing: s.lensing,
    accretionFlow: s.accretionFlow,
    accretionDisks: s.accretionDisks,
    accretionBand: s.accretionBand,
    ehtBlur: s.ehtBlur,
  };
}

/** Turn back what the last scene turned on, where the visitor has not changed it since. */
function restoreSceneViews(): void {
  const now = currentViews();
  const back: SceneViews = {};
  for (const k of SCENE_VIEWS) if (k in sceneViews.set && now[k] === sceneViews.set[k]) Object.assign(back, { [k]: sceneViews.was[k] });
  sceneViews = { was: {}, set: {} };
  if (Object.keys(back).length) useUI.setState(back);
}

/** Note the views a scene has just changed, to turn them back when the next scene starts. */
function recordSceneViews(before: Pick<UIState, SceneView>): void {
  const after = currentViews();
  for (const k of SCENE_VIEWS)
    if (after[k] !== before[k]) {
      Object.assign(sceneViews.was, { [k]: before[k] });
      Object.assign(sceneViews.set, { [k]: after[k] });
    }
}

// ─── The scenes built today ─────────────────────────────────────────────────────────────

defineScene('race-sunlight', {
  label: 'Race sunlight to Earth',
  // Worded for the date: Earth's distance from the Sun changes the time by 17 seconds over the year.
  get note() {
    const s = (id: BodyId) => (sim.bodies[id]?.present ? sim.bodies[id].pos.distanceTo(sim.bodies.sun.pos) / C_KM_S : NaN);
    const earth = Math.round(s('earth'));
    const jupiter = Math.round(s('jupiter') / 60);
    const toEarth = Number.isFinite(earth) ? `${Math.floor(earth / 60)} minutes ${earth % 60} seconds today (8 minutes 19 seconds on average over the year)` : 'about 8 minutes 19 seconds';
    return `The growing ring is a pulse of light leaving the Sun. It reaches Earth after ${toEarth}, Mars a few minutes later and Jupiter after ${Number.isFinite(jupiter) ? jupiter : 'about 43'} minutes.`;
  },
  run: (note) =>
    scene(note, () => {
      setWarp(1);
      setPaused(false);
      controller.goTo('sun', { distance: 13 * AU_KM, direction: ABOVE });
      afterSlew('sun', () => {
        emitPulse('sun');
        setWarp(100);
      });
    }),
});

defineScene('year-in-30s', {
  label: 'A year in half a minute',
  note: 'The inner planets from above. Mercury laps the Sun every 88 days, speeding up near the Sun, and Earth once in the 31 seconds a year takes here; Mars gets about half way round. Bodies are drawn enlarged (T for true size). Press Space to pause; N comes back to today.',
  run: (note) =>
    scene(note, () => {
      useUI.setState({ sizeMode: 'visible', showOrbits: true, showLabels: true });
      setWarp(1);
      setPaused(false);
      // Close enough that Mercury's orbit is plain to see, wide enough for Mars's (1.67 au at most).
      controller.goTo('sun', { distance: 6 * AU_KM, direction: new Vector3(0.05, 1, 0.12) });
      afterSlew('sun', () => setWarp(1_000_000));
    }),
});

defineScene('moon-month', {
  label: 'Watch the Moon go round',
  note: 'A month passes in 25 seconds. The Moon keeps the same face towards Earth as it goes. Bodies are drawn enlarged (T for true size); the Moon is 1.3 light-seconds away.',
  run: (note) =>
    scene(note, () => {
      useUI.setState({ sizeMode: 'visible', showOrbits: true, showLabels: true });
      setWarp(1);
      setPaused(false);
      controller.goTo('earth', { distance: 1.3e6, direction: ABOVE });
      afterSlew('earth', () => setWarp(100_000));
    }),
});

const SPLIT_FLIGHT: Flight = { dest: 'neptune', drive: 'cruise', beta: 0.999, split: true };
defineScene('split-0.999c', {
  label: 'The sky at 0.999c, split screen',
  note: 'Left of the divider is the sky as it really lies; right of it is what you see at 0.999c: the whole sky squeezed into a cone ahead of you. Drag the divider.',
  flight: SPLIT_FLIGHT,
  unavailable: () => flightBlocker(SPLIT_FLIGHT, 'Neptune'),
  run: (note) => fly(SPLIT_FLIGHT, note),
});

defineScene('light-time-correction', {
  label: 'Light-time correction',
  note: 'Light-time correction is on: every body is drawn where it was when the light now reaching you left it. Jupiter is seen as it was 33 to 54 minutes ago, the Moon as it was 1.3 seconds ago.',
  run: (note) =>
    scene(note, () => {
      useUI.setState({ retarded: true, sizeMode: 'visible', showLabels: true, showOrbits: true, selected: 'jupiter' });
      // Just off Earth, with Jupiter showing past it: the light from there is the oldest in view.
      const e = sim.bodies.earth.pos;
      const dir = e.clone().sub(sim.bodies.jupiter.pos).normalize().addScaledVector(UP, 0.22).normalize();
      controller.goTo('earth', { distance: 60_000, direction: dir });
    }),
});

defineScene('mars-opposition', {
  label: 'The next opposition of Mars',
  // The scene words its own note with the date and distance it finds; this is for the button.
  note: 'The next opposition of Mars: Earth passes between Mars and the Sun, as it does every 26 months, and Mars is near its closest and brightest. How close depends on the opposition, from about 0.37 to 0.68 au, because Mars’s orbit is eccentric.',
  run: (fallbackNote) => {
    if (!ready()) return false;
    // The next opposition after the date shown (after today when that is outside the span
    // where astronomy-engine's planets are checked, 1700–2200).
    const YEARS_3 = 3 * 365.25 * 86_400_000;
    const from = sim.timeMs >= PRECISE_START_MS && sim.timeMs < PRECISE_END_MS - YEARS_3 ? sim.timeMs : Date.now();
    const ms = msFromAstroTime(SearchRelativeLongitude(Body.Mars, 0, astroTimeAt(from)));
    if (!setEpoch(ms)) return false;
    updateEphemeris();
    setWarp(1);
    setPaused(false);
    const e = sim.bodies.earth.pos;
    const toMars = sim.bodies.mars.pos.clone().sub(e);
    const d = toMars.length();
    const note =
      d > 0
        ? `Opposition of Mars, ${formatIsoDate(formatSimDate(ms, 'date'))}: Earth passes between Mars and the Sun. Mars is ${(d / AU_KM).toFixed(2)} au away, ${(d / C_KM_S / 60).toFixed(1)} light-minutes.`
        : fallbackNote;
    useUI.setState({ journeyNote: note, journeysOpen: false, sizeMode: 'visible', showLabels: true, showOrbits: true, selected: 'mars' });
    // Above Earth and a little behind it, so Mars shows beyond Earth in the same view.
    const dir = UP.clone().multiplyScalar(0.9).addScaledVector(toMars.normalize(), -0.45).normalize();
    controller.goTo('earth', { distance: Math.max(2.4 * d, 1e6), direction: dir });
    return true;
  },
});

defineScene('jupiter-moons', {
  label: 'Jupiter’s moons',
  note: 'Io, Europa, Ganymede and Callisto circle Jupiter, seen from above with time running 10,000 times faster than real: Io laps it every 15 seconds. Their orbits are fitted to JPL Horizons; the moons are drawn enlarged (T for true size). Press Space to pause; N comes back to today.',
  run: (note) =>
    scene(note, () => {
      useUI.setState({ sizeMode: 'visible', showOrbits: true, showLabels: true, selected: 'jupiter' });
      setWarp(1);
      setPaused(false);
      // Wide enough for Callisto's orbit, 1.9 million km out.
      controller.goTo('jupiter', { distance: 5e6, direction: ABOVE });
      afterSlew('jupiter', () => setWarp(10_000));
    }),
});

// ─── Scenes with the Solar System data (sim/solarSystem) ────────────────────────────────

/** Voyager 2's closest approach to Neptune: 1989-08-25 03:56:36 TDB (JPL Horizons), 03:55:40 UTC. */
const V2_NEPTUNE_MS = msFromCivil(1989, 8, 25, 3, 55, 40);
/** Its closest approach to Triton, about 39,800 km, five hours later (09:11 UTC). */
const V2_TRITON_MS = msFromCivil(1989, 8, 25, 9, 11);

defineScene('voyager2-neptune', {
  label: 'Ride Voyager 2 past Neptune',
  note: 'Voyager 2 skims 4,950 km above Neptune’s clouds, the closest pass of its whole journey, then crosses Triton’s orbit about five hours later. Here a second is five minutes, so the flyby plays in about a minute. Its path is JPL’s mission-design trajectory for the flyby.',
  unavailable: needs('voyager2', 'triton'),
  run: (note) => {
    if (!ready() || !setEpoch(V2_NEPTUNE_MS - 20 * 60_000)) return false;
    updateEphemeris();
    if (!sim.bodies.voyager2?.present) return false;
    setWarp(1);
    setPaused(true);
    useUI.setState({ journeyNote: note, journeysOpen: false, sizeMode: 'true', showLabels: true, showOrbits: true, selected: 'voyager2' });
    // Just behind the craft, looking half-way between where Neptune is at closest approach and
    // where Triton is at its own, five hours later (44° apart): both pass through the view.
    const ca = astroTimeAt(V2_NEPTUNE_MS);
    const tca = astroTimeAt(V2_TRITON_MS);
    const toNeptune = bodyPositionAt('neptune', ca).sub(bodyPositionAt('voyager2', ca)).normalize();
    const toTriton = bodyPositionAt('triton', tca).sub(bodyPositionAt('voyager2', tca)).normalize();
    const dir = toNeptune.add(toTriton).negate().normalize();
    controller.goTo('voyager2', { distance: 0.06, direction: dir });
    afterSlew('voyager2', () => {
      setWarp(300);
      setPaused(false);
    });
    return true;
  },
});

/** Halley's perihelion: 2061-07-28 17:17 TDB (JPL Horizons, solution JPL#75). */
const HALLEY_2061_MS = msFromCivil(2061, 7, 28, 17, 16);

defineScene('halley-2061', {
  label: 'Halley comes back',
  note: 'Halley’s Comet rounds the Sun on 28 July 2061, 0.59 au out. Its dust tail curves back along its orbit; the fainter blue ion tail points straight down the solar wind. The tails come from a simple physical model; a day passes in under 9 seconds.',
  unavailable: needs('halley'),
  run: (note) => {
    if (!ready() || !setEpoch(HALLEY_2061_MS - 6 * 86_400_000)) return false;
    updateEphemeris();
    const h = sim.bodies.halley;
    if (!h?.present) return false;
    setWarp(1);
    setPaused(true);
    useUI.setState({ journeyNote: note, journeysOpen: false, sizeMode: 'visible', showLabels: true, showOrbits: true, selected: 'halley' });
    // From above the orbit and a little sunward, so both tails are seen side on.
    const r = h.pos.clone().normalize();
    const n = r.clone().cross(h.vel).normalize();
    const dir = n.addScaledVector(r, -0.35).normalize();
    controller.goTo('halley', { distance: 8e7, direction: dir });
    afterSlew('halley', () => {
      setWarp(10_000);
      setPaused(false);
    });
    return true;
  },
});

// ─── The Milky Way (sim/galaxy) ─────────────────────────────────────────────────────────

/** A year of S2's orbit, in seconds of the view: its 16-year orbit in about half a minute. */
export const S2_ORBIT_WARP = Math.round((16.05 * 365.25 * 86_400) / 30);

defineScene('galactic-centre-orbits', {
  label: 'Stars orbiting the centre of the Galaxy',
  note: 'S2 whips round its 16-year orbit in about half a minute here, while S29, S38 and S55 cross at other angles. Every orbit shares one focus, the black hole Sgr A*: from 6,000 au its shadow is far below a pixel, but its lens bends the light of stars passing behind it within about 0.3° of it, and the bright point at the centre is a model of the gas falling in. The orbits are GRAVITY’s (2022), turning slowly as general relativity says; other published orbits exist but are not licensed for reuse.',
  unavailable: needs('sgr-a-star', 's2'),
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showOrbits: true, showLabels: true, selected: 's2' });
      setWarp(1);
      setPaused(false);
      // Face-on to S2's orbit, tipped a little, far enough to see the whole ellipse.
      const s2 = sim.bodies.s2;
      const bh = sim.bodies['sgr-a-star'];
      const normal = s2.pos.clone().sub(bh.pos).cross(s2.vel.clone().sub(bh.vel));
      if (!(normal.lengthSq() > 0)) normal.copy(ABOVE);
      normal.normalize().addScaledVector(UP, 0.25).normalize();
      controller.goTo('sgr-a-star', { distance: 6000 * AU_KM, direction: normal });
      afterSlew('sgr-a-star', () => setWarp(S2_ORBIT_WARP));
    }),
});

defineScene('milky-way-outside', {
  label: 'The Milky Way from outside',
  note: `The Milky Way from 100,000 light-years out, above its disc, with the Sun marked about halfway from the centre to the edge. Seen from here it turns clockwise, far too slowly to notice: the Sun takes over 200 million years to go round. The Galaxy here is a model built from measurements; its far side is extrapolated.`,
  // The Galaxy is a body as soon as its data start loading; the scene needs its particle model too.
  unavailable: () => needs('milky-way')() ?? (galaxyStatus() === 'loading' || galaxyStatus() === 'failed' ? missingReason('milky-way') : null),
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true });
      frameMilkyWay();
    }),
});

// ─── The neighbourhood's dust (sim/dust) ──────────────────────────────────────────────

/** A heliocentric galactic direction (x towards l = 0°, y towards l = 90°, z north) in world axes, normalised. */
const galDir = (x: number, y: number, z: number): Vector3 => new Vector3(...applyMat3(GAL_TO_WORLD, [x, y, z])).normalize();

defineScene('into-the-orion-clouds', {
  label: 'Into the Orion clouds',
  note: 'The Orion clouds, about 1,400 light-years from the Sun, seen from 260 light-years beyond them and off to one side, looking back towards the inner Galaxy: dark lanes of dust and gas against the Milky Way, with the Orion Nebula glowing in Orion A. The clouds are the 3D dust map of Edenhofer et al. (2024), sharp to about 4 parsecs here; their faint brown glow is starlight the dust scatters.',
  unavailable: needs('orion-a-cloud'),
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true });
      // From beyond the clouds and off to one side, looking back: they stand against the brighter inner Galaxy.
      const away = sim.bodies['orion-a-cloud'].pos.clone().normalize();
      const side = new Vector3().crossVectors(galDir(0, 0, 1), away).normalize();
      controller.goTo('orion-a-cloud', { distance: 0.08 * KPC_KM, direction: away.multiplyScalar(0.55).addScaledVector(side, 0.85).normalize() });
    }),
});

defineScene('radcliffe-wave', {
  label: 'The Radcliffe Wave',
  note: 'The Radcliffe Wave from the side, about 10,000 light-years out: a chain of the Sun’s nearest star-forming clouds 2.5 kiloparsecs long, from Canis Major through Orion and Perseus to Cygnus, rising and falling through the plane of the Galaxy by up to 220 parsecs. Its faint line is the model fitted to its clouds and young stars by Konietzka et al. (2024), who found it is oscillating, like a wave travelling outwards.',
  unavailable: needs(RADCLIFFE_ID),
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true });
      // Across the Wave's length in the plane, from its outer side and a little above it: the inner Galaxy behind it.
      const f = RADCLIFFE_FIT;
      const along = new Vector3(f.x2 - f.x0, f.y2 - f.y0, 0).normalize();
      controller.goTo(RADCLIFFE_ID, { distance: 3.2 * KPC_KM, direction: galDir(-along.y, along.x, 0.12) });
    }),
});

// ─── The extreme stars (sim/stars/extremeStars.ts) ──────────────────────────────────────

/** Solar radii per au. */
const RSUN_PER_AU = AU_KM / 695_700;

/**
 * One stop of the extreme stars' tour: a star, how close (in its radii; or km), how long to stay (s), and what to say
 * (worked out when the stop starts, from the records, so the sizes are the cards').
 */
interface MonsterStop {
  id: BodyId;
  radii?: number;
  km?: number;
  holdS: number;
  /** Time runs this many times faster once there. */
  warp?: number;
  note: () => string;
}

/** A star's radius, R☉, from its record. */
const rsunOf = (id: BodyId): number => getBody(id)?.star?.radiusRsun ?? 0;
/** "1,420 times the Sun’s radius (6.6 au)". */
const sizeWords = (id: BodyId): string => {
  const r = rsunOf(id);
  return `${Math.round(r).toLocaleString('en-GB')} times the Sun’s radius (${(r / RSUN_PER_AU).toFixed(1)} au)`;
};

const MONSTER_STOPS: readonly MonsterStop[] = [
  {
    id: 'betelgeuse',
    radii: 2.6,
    holdS: 14,
    note: () =>
      `Betelgeuse, ${sizeWords('betelgeuse')}: in the Sun’s place its surface would lie past the asteroid belt. Its surface boils with a few giant convection cells, as interferometers see it; they live about a year and are shown a million times faster. The Sun beside it would be a dot a 760th of its width.`,
  },
  {
    id: 'stephenson-2-18',
    radii: 2.6,
    holdS: 14,
    note: () =>
      `Stephenson 2-18, often called the largest known star: ${sizeWords('stephenson-2-18')}, nearly three Betelgeuses across; in the Sun’s place it would swallow Saturn’s orbit. But the figure is disputed: it rests on a temperature from a dust model and the distance of a cluster it may not belong to.`,
  },
  {
    id: 'uy-scuti',
    radii: 2.6,
    holdS: 10,
    note: () =>
      `UY Scuti was billed the largest star at 1,708 solar radii; at the distance Gaia measured, its measured angular size makes it ${sizeWords('uy-scuti')}.`,
  },
  {
    id: 'vy-canis-majoris',
    radii: 2.6,
    holdS: 10,
    note: () => `VY Canis Majoris, ${sizeWords('vy-canis-majoris')}, wrapped in the dust it is shedding (not drawn).`,
  },
  {
    id: 'altair',
    radii: 3.2,
    holdS: 10,
    note: () =>
      'Altair spins once in under nine hours, at 92% of the speed that would tear it apart: it is a quarter wider at the equator than pole to pole, and its poles are 1,600 K hotter and brighter than its equator, as CHARA imaged it in 2007.',
  },
  {
    id: 'achernar',
    radii: 3.2,
    holdS: 10,
    note: () => 'Achernar, the flattest star measured: 35% wider at the equator than from pole to pole.',
  },
  {
    id: 'eta-carinae',
    km: 90_000 * AU_KM,
    holdS: 16,
    note: () =>
      'Eta Carinae and the Homunculus, the two lobes it threw off in the 1840s, still flying apart at up to 650 km/s; their shape is measured, and grows with the date. The star itself is hidden in its own wind.',
  },
  {
    id: 'wr-104',
    km: 1800 * AU_KM,
    holdS: 18,
    warp: 1_000_000,
    note: () =>
      'WR 104: as its two stars orbit every 241.5 days, the dust their colliding winds make streams out in a spiral, like water from a garden sprinkler. Time runs a million times faster: a turn every 21 seconds. The dust glows in the infrared, shown in false colour.',
  },
];

/** Run the tour from stop i; each stop waits for the camera's slew, then for its hold. */
function monsterStop(i: number): void {
  const s = MONSTER_STOPS[i];
  if (!s || !isBody(s.id)) return;
  setWarp(1);
  useUI.setState({ journeyNote: `${i + 1} of ${MONSTER_STOPS.length}. ${s.note()}`, selected: s.id, showLabels: true });
  const b = sim.bodies[s.id];
  // From the Sun's side, a little above.
  const dir = b ? b.pos.clone().negate().normalize().addScaledVector(UP, 0.25).normalize() : ABOVE.clone().normalize();
  const distance = s.km ?? (s.radii ?? 3) * displayRadiusKm(getBody(s.id)!);
  controller.goTo(s.id, { distance, direction: dir });
  afterSlew(s.id, () => {
    if (s.warp) setWarp(s.warp);
    if (i + 1 >= MONSTER_STOPS.length) return;
    const timer = setTimeout(() => {
      pendingStep = null;
      monsterStop(i + 1);
    }, s.holdS * 1000);
    pendingStep = () => clearTimeout(timer);
  });
}

defineScene('monsters-among-the-stars', {
  label: 'Monsters among the stars',
  note: 'A tour of the extreme stars: the largest, the most flattened and the most violent, each drawn as it is measured up close.',
  unavailable: needs(...MONSTER_STOPS.map((s) => s.id)),
  run: (note) =>
    scene(note, () => {
      monsterStop(0);
    }),
});

// ─── Planets of other stars (sim/exoplanets) ────────────────────────────────────────────

const TRAPPIST_FLIGHT: Flight = { dest: 'trappist-1', drive: 'rocket', beta: 0 };

/** What to look for once the ship has arrived at TRAPPIST-1. */
export const SEVEN_WORLDS_NOTE =
  'The seven planets of TRAPPIST-1, seen from above their orbits with time running 20,000 times faster than real: b laps the star every 6.5 seconds, h every 81. All seven would fit inside Mercury’s orbit. They are drawn at true size, so they are points; the colours are illustrative.';

/**
 * The view over a planetary system: from above the orbits (the normal of `planet`'s orbit),
 * tilted a little towards the Sun, at the distance that frames the outermost orbit.
 */
function frameSystem(host: BodyId, planet: BodyId): { distance: number; direction: Vector3 } {
  const h = sim.bodies[host].pos;
  const p = sim.bodies[planet];
  const normal = p.pos.clone().sub(h).cross(p.vel.clone().sub(sim.bodies[host].vel));
  if (!(normal.lengthSq() > 0)) normal.copy(ABOVE);
  normal.normalize();
  const toSun = h.clone().negate().normalize();
  return { distance: systemFramingDistance(host), direction: normal.multiplyScalar(0.85).addScaledVector(toSun, 0.5).normalize() };
}

defineScene('trappist-1-worlds', {
  label: 'Seven worlds of TRAPPIST-1',
  note: FLIGHT_NOTES['fly:trappist-1'],
  flight: TRAPPIST_FLIGHT,
  unavailable: () => needs('trappist-1', 'trappist-1-h')() ?? flightBlocker(TRAPPIST_FLIGHT, 'TRAPPIST-1'),
  run: (note) => {
    if (!fly(TRAPPIST_FLIGHT, note)) return false;
    afterArrival(() => {
      if (!isBody('trappist-1-h')) return;
      useUI.setState({ journeyNote: SEVEN_WORLDS_NOTE, showOrbits: true, showLabels: true, selected: 'trappist-1-e' });
      setWarp(1);
      setPaused(false);
      controller.goTo('trappist-1', frameSystem('trappist-1', 'trappist-1-h'));
      afterSlew('trappist-1', () => setWarp(20_000));
    });
    return true;
  },
});

// ─── Beyond the Milky Way (sim/cosmos) ──────────────────────────────────────────────────

/** Why a scene beyond the Milky Way cannot run yet. */
const galaxiesUnavailable = needs('local-group');

defineScene('local-group', {
  label: 'The Local Group',
  note: 'The Local Group from 3 million parsecs (10 million light-years) out: the Milky Way, Andromeda and Triangulum with more than a hundred smaller galaxies, held together by gravity. From this far the big galaxies are faint smudges and most dwarfs are too faint to see at all; the Bodies list names them all. Their shapes are models built from their measured sizes, tilts and brightness.',
  unavailable: galaxiesUnavailable,
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true });
      frameLocalGroup();
    }),
});

defineScene('cosmic-web', {
  label: 'The cosmic web',
  note: 'The galaxies around us to about 500 million parsecs (1.6 billion light-years), as points: the 55,877 with measured distances in Cosmicflows-4 (the nearest are drawn as galaxies of their own), turning slowly, 200 million parsecs out from the Local Group. They gather in walls and filaments round empty voids. Orange points are elliptical galaxies, blue ones spirals. The survey covers the northern galactic sky best and misses what lies behind the Milky Way’s disc, so emptiness there is not all real.',
  unavailable: galaxiesUnavailable,
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true });
      frameCosmicWeb();
    }),
});

defineScene('famous-galaxies', {
  label: 'Famous galaxies, as photographed',
  note: 'The Whirlpool Galaxy, 8.6 million parsecs (28 million light-years) away, seen from our side and drawn with Hubble’s photograph of it, as bright as its measured light. A photograph shows a galaxy only from about where it was taken: turn the view away from our line of sight, or come close, and it gives way to the model built from the galaxy’s size, tilt and brightness. Andromeda, Triangulum, Bode’s Galaxy, the Cigar, the Sombrero, the Pinwheel, the Southern Pinwheel, the Sculptor and Black Eye galaxies, the Leo Triplet and the Antennae have photographs too: find them in Where to?',
  unavailable: needs('whirlpool'),
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true });
      useUI.getState().select('whirlpool');
      frameFromOurSide('whirlpool', 90 * KPC_KM);
    }),
});

defineScene('virgo-cluster-close', {
  label: 'The Virgo Cluster',
  note: 'The nearest big cluster of galaxies, about 16.5 million parsecs (54 million light-years) away, from 2.5 million parsecs out, a little off our line of sight. Its sixty brightest galaxies are drawn as galaxies of their own, at their measured distances where those are known well (most of the ellipticals, from the fluctuations of their surface brightness) and at the cluster’s distance where not; the giant ellipticals M87, M49, M86 and M60 are its brightest. As bright as they really are, most are faint smudges from here: the dark sky between them is real. The cosmic web is turned off to show the cluster alone; the View menu turns it back on.',
  unavailable: needs('virgo-cluster', 'm86'),
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true, cosmicWeb: 'off' });
      frameFromOurSide('virgo-cluster', 2.5 * MPC_KM, 25);
    }),
});

defineScene('coma-cluster-close', {
  label: 'The Coma Cluster',
  note: 'A rich cluster of more than a thousand galaxies, 98.5 million parsecs (321 million light-years) away, from 6 million parsecs out along our line of sight. Its brightest galaxies are drawn as galaxies of their own: the two giant ellipticals NGC 4889 and NGC 4874 at its heart, and some thirty more. Their own distances are not measured well enough to place them in depth, so all are at the cluster’s distance, each in its own direction: seen from the side they would lie in a sheet. The cosmic web is turned off; the View menu turns it back on.',
  unavailable: needs('coma-cluster', 'ngc-4874'),
  run: (note) =>
    scene(note, () => {
      useUI.setState({ showLabels: true, cosmicWeb: 'off' });
      frameFromOurSide('coma-cluster', 6 * MPC_KM, 0);
    }),
});

defineScene('cmb-map', {
  label: 'The cosmic microwave background',
  note: 'The oldest light in the universe, released about 370,000 years after the Big Bang, mapped by WMAP over the whole sky. Blue is colder and red warmer than the average of 2.7255 K, by up to 250 millionths of a kelvin, about 1 part in 11,000: the contrast is enhanced about 10,000 times, and the sky turns slowly so all of it goes by. The View menu turns the map off.',
  unavailable: galaxiesUnavailable,
  run: (note) =>
    scene(note, () => {
      showCmbMap();
    }),
});

// ─── Flights through the expanding universe (sim/travelCosmic.ts) ───────────────────────

/** The flight of 'cmb-glow': 1 g to the Virgo cluster, looking ahead. */
const GLOW_FLIGHT: Flight = { dest: 'virgo-cluster', drive: 'rocket', beta: 0 };

defineScene('cmb-glow', {
  label: 'The Big Bang’s glow, seen at speed',
  get note() {
    const plan = plannedFlight(GLOW_FLIGHT);
    const times = plan ? ` About ${formatDurationShort(plan.shipTime)} on board and ${formatDurationShort(plan.earthTime)} at home.` : '';
    return `Look ahead, just above this panel. The cosmic microwave background, 2.7 K and invisible at rest, is Doppler shifted by your motion to T′ = T × D ahead, with D = γ(1 + β) ≈ 2γ: past γ ≈ 500, some seven years in, it glows red, then white, then blue-white, and by the flip it is over a hundred million kelvin (the view stops down so you can still look).${times}${EXPANDING}`;
  },
  flight: GLOW_FLIGHT,
  unavailable: () => needs('virgo-cluster')() ?? flightBlocker(GLOW_FLIGHT, 'Virgo Cluster'),
  run: (note) => {
    if (!fly(GLOW_FLIGHT, note)) return false;
    // The glow is Doppler shift: keep it on. Face the way the ship is going, tipped down a little so the
    // glow straight ahead shows above the flight panel.
    useUI.setState((s) => ({ relDoppler: true, relMode: s.relMode === 'off' ? 'on' : s.relMode }));
    controller.setTravelLook(0, -0.22);
    return true;
  },
});

defineScene('edge-of-reach', {
  label: 'The edge of reach',
  note: 'JADES-GS-z14-0 is one of the most distant galaxies known, seen as it was about 290 million years after the Big Bang. The flight planner has tried a 1 g flight there from Earth and refused it: the galaxy lies beyond the cosmic event horizon, about 16.6 billion light-years away. The expansion of the universe is speeding up, so light sent from here today will never reach it, and nothing can outrun light. Anything closer than the horizon can still be reached at 1 g in under 75 years aboard, though billions of years pass at home.',
  unavailable: needs('jades-gs-z14-0'),
  run: (note) =>
    scene(note, () => {
      // From home: flights leave from the camera.
      controller.placeAt('earth', 26_000);
      controller.update(0, 0);
      planOneG('jades-gs-z14-0');
    }),
});

// ─── Black holes (sim/gravity.ts, sim/fall.ts, sim/lensBodies.ts) ───────────────────────

const SGR_A: BodyId = 'sgr-a-star';

/** M = GM/c² of a black hole, km (half its horizon radius r_s); 0 for anything else. */
const holeMKm = (id: BodyId): number => blackHoleRsKm(id) / 2;

/**
 * "In the plane": from Sgr A* towards galactic longitude 90°, latitude 0 (world axes). Looking back at the
 * hole from there, the band of the Milky Way runs straight through the view behind it.
 */
export const IN_THE_PLANE: Readonly<Vector3> = galacticToWorld(90, 0);
/** The north galactic pole (world axes): the normal of the innermost stable orbit's plane. */
export const GALACTIC_NORTH: Readonly<Vector3> = galacticToWorld(0, 90);
/** Across the line of sight in the plane (towards galactic longitude 180° from Sgr A*): the flyby's course. */
export const ACROSS_THE_PLANE: Readonly<Vector3> = new Vector3().crossVectors(GALACTIC_NORTH, IN_THE_PLANE).normalize();

/** How the notes of the scenes made to show the lens end: they switch the flow off, whose glare would hide the bent starlight. */
export const FLOW_OFF = 'The glowing gas is hidden here so the bent starlight shows (View › Accretion flow brings it back).';

/**
 * What a black-hole scene turns on for itself (the next scene turns it back): the lens always (with it
 * off a black hole cannot be seen at all); the flow as the scene wants it, in visible light when on (or in radio
 * light, at 1.3 mm, for the radio scene); a thin disc where the scene shows one;
 * and, for the scenes about motion, the relativistic view, as a flight turns it on. The hole's panel
 * opens too: the visitor asked for the scene (ui/flight/HoleStrip.tsx; it stays closed otherwise).
 */
function holeViews(hole: BodyId, o: { flow?: boolean; radio?: boolean; disk?: boolean; moving?: boolean }): void {
  useUI.setState((s) => ({
    holePanel: { hole, open: true },
    lensing: true,
    ...(o.flow === undefined ? {} : o.flow ? { accretionFlow: true, accretionBand: o.radio ? ('mm' as const) : ('visible' as const) } : { accretionFlow: false }),
    ...(o.disk ? { accretionDisks: true, showOrbits: false } : {}),
    ...(o.moving && s.relMode === 'off' ? { relMode: 'on' as const } : {}),
  }));
}

/**
 * Slew to a black hole, to r (units of M) from its centre along dirOut (world axes, from the hole), and
 * once there run `then`, which places the camera exactly (the slew ends within a few float64 steps of it)
 * and starts any mode of the hole's own. If the visitor moves the camera first, `then` is dropped.
 */
function toHole(hole: BodyId, rM: number, dirOut: Readonly<Vector3>, then: () => void): void {
  controller.goTo(hole, { distance: rM * holeMKm(hole), direction: dirOut.clone() });
  afterSlew(hole, then);
}

/** Unit vector from a black hole towards the Sun (world axes), for the scenes seen at our own angle. */
function sunward(hole: BodyId): Vector3 {
  const d = sim.bodies.sun.pos.clone().sub(sim.bodies[hole].pos);
  return d.lengthSq() > 0 ? d.normalize() : IN_THE_PLANE.clone();
}

/** A hover as a scene step, looking at the hole or along `look`. */
const hoverStep = (hole: BodyId, rM: number, dirOut: Readonly<Vector3>, look?: Readonly<Vector3>) => () => {
  controller.hoverAt(hole, rM, dirOut, look);
};

defineScene('sgr-a-star-shadow', {
  label: 'The shadow of Sgr A*',
  note: `Hovering ten horizon radii (0.85 au) from Sagittarius A*, in the plane of the Galaxy. The shadow is 28.5° across, two and a half times what the horizon would cover if light went straight. Light from straight behind the hole arrives in an Einstein ring 59.7° across, and inside it the whole sky appears again, mirrored, down to 14.61° from the centre, just outside the shadow’s edge (14.27°); here the central cluster’s stars fill the sky almost evenly, so look for them crowding and doubling near the edge rather than for a bright ring. Your clock runs at 0.9487 of home’s, starlight arrives 1.054 times bluer, and hovering here takes a thrust of 3,806 g. ${FLOW_OFF}`,
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: false });
      useUI.setState({ selected: SGR_A });
      toHole(SGR_A, 20, IN_THE_PLANE, hoverStep(SGR_A, 20, IN_THE_PLANE));
    }),
});

/** The photon ring's view: 45° from the hole towards galactic north, at the shadow's edge. */
export const PHOTON_RING_LOOK: Readonly<Vector3> = IN_THE_PLANE.clone().negate().add(GALACTIC_NORTH).normalize();

defineScene('photon-ring', {
  label: 'The photon ring',
  note: `Three horizon radii (0.25 au) from Sagittarius A*, looking at the edge of its shadow, 45.00° from the centre. Just outside it, a band only 0.64° wide (out to 45.64°) holds light that has gone round the hole at least once: a whole copy of the sky, squeezed, and inside it more copies, the next within 0.03° of the edge (45.027°), and so on without end. ${FLOW_OFF}`,
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: false });
      toHole(SGR_A, 6, IN_THE_PLANE, hoverStep(SGR_A, 6, IN_THE_PLANE, PHOTON_RING_LOOK));
    }),
});

defineScene('sgr-a-star-einstein-ring', {
  label: 'Sgr A*’s Einstein ring',
  note: `Fifty horizon radii (4.24 au) from Sagittarius A*, in the plane of the Galaxy. Light from straight behind the black hole closes into a ring 24.6° across. Inside the ring lies a mirror image of the whole sky, down to 3.035° from the centre; below that, in a sliver above the shadow’s edge at 2.949°, more copies made by light that went all the way round. Here the central cluster’s stars fill the sky almost evenly, so the ring shows in the stars it crowds and doubles, not as a bright band. ${FLOW_OFF}`,
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: false });
      useUI.setState({ selected: SGR_A });
      toHole(SGR_A, 100, IN_THE_PLANE, hoverStep(SGR_A, 100, IN_THE_PLANE));
    }),
});

defineScene('hover-at-the-horizon', {
  label: 'Hovering at the horizon',
  note: `One per cent above the horizon of Sagittarius A* (127,000 km up), looking straight up. The black hole fills the whole sky but a disc 14.8° in radius overhead, where everything else is crowded in, ten times bluer. Every hour here is ten hours at home (your clock runs at 0.0995 of home’s), and the rocket holding you up pushes at 3.6 million g. ${FLOW_OFF}`,
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: false });
      toHole(SGR_A, 2.02, IN_THE_PLANE, hoverStep(SGR_A, 2.02, IN_THE_PLANE, IN_THE_PLANE));
    }),
});

/** The orbit's view at the start: halfway between the direction of motion and the hole. */
export const ISCO_LOOK: Readonly<Vector3> = ACROSS_THE_PLANE.clone().sub(IN_THE_PLANE).normalize();

defineScene('isco-orbit', {
  label: 'The innermost stable orbit',
  note: `In orbit three horizon radii (0.25 au) from Sagittarius A*, the closest a circular orbit can be and stay stable. No engine is needed: you move at half the speed of light past the observers hovering here and go round in 23.0 minutes by your own clock, 32.6 minutes by a distant one (your clock runs at 0.7071 of home’s). Looking 45° from the hole towards where you are going, the shadow is 81.8° across and pulled 22.2° forward of the hole’s direction. ${FLOW_OFF}`,
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: false, moving: true });
      useUI.setState({ selected: SGR_A });
      toHole(SGR_A, 6, IN_THE_PLANE, () => {
        controller.hoverAt(SGR_A, 6, IN_THE_PLANE);
        controller.startCircularOrbit(SGR_A, 6, GALACTIC_NORTH, ISCO_LOOK);
      });
    }),
});

/** What the fall's note says while it waits for the lens (whenLensReady). */
export const FALL_WAITS = 'The fall starts as soon as the black hole can be drawn: the graphics card is still preparing it.';

defineScene('fall-into-sgr-a-star', {
  label: 'Fall into Sgr A*',
  note: `Falling into Sagittarius A* from ten horizon radii (0.85 au), as if dropped from rest far away. It takes 864 s by your clock to reach the horizon: the first 813 s play in 20 s, the last 80 s of the fall in real time. Nothing marks the crossing: the dark patch ahead is 84.2° across, wider than the view, but the rest of the sky is still there round it (drag to look), and the tides are only 1.1 × 10⁻³ m/s². From the horizon the end is 28.2 s away; halfway to the centre, 18 s after the horizon, the dark patch is 107° across. The fall ends where the tides reach 1,000 m/s², 0.03 s before the centre. Home’s clock, shown on the clocks of observers falling freely beside you (a convention: hovering observers would say you never cross), keeps your pace; seen overhead it runs at half speed as you cross. ${FLOW_OFF}`,
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: false });
      toHole(SGR_A, 20, IN_THE_PLANE, () => {
        // Falling with no black hole drawn would show nothing: hover at the start until the lens can draw it.
        let waited = false;
        whenLensReady(
          () => {
            // After a wait the visitor may have dragged round the hole: fall from where the camera is.
            startFall({ hole: SGR_A, r0: 20, e: 1, dirOut: waited ? undefined : IN_THE_PLANE, rate: 'auto' });
            if (waited) useUI.setState({ journeyNote: note });
          },
          () => {
            waited = true;
            controller.hoverAt(SGR_A, 20, IN_THE_PLANE);
            useUI.setState({ journeyNote: `${FALL_WAITS} ${note}` });
          },
        );
      });
    }),
});

/** The snapshot's three speeds past the hovering observers, 10 s each: hovering, 0.9c inward, 0.9c outward. */
export const DIVE_AND_CLIMB: readonly HoldStep[] = [
  { atS: 0, betaVec: { x: 0, y: 0, z: 0 } },
  { atS: 10, betaVec: { x: -0.9 * IN_THE_PLANE.x, y: -0.9 * IN_THE_PLANE.y, z: -0.9 * IN_THE_PLANE.z } },
  { atS: 20, betaVec: { x: 0.9 * IN_THE_PLANE.x, y: 0.9 * IN_THE_PLANE.y, z: 0.9 * IN_THE_PLANE.z } },
];
export const DIVE_AND_CLIMB_PERIOD_S = 30;

defineScene('dive-and-climb', {
  label: 'Same place, three speeds',
  note: `Ten horizon radii from Sagittarius A*, one moment (the clock is paused) seen at three speeds, 10 s each. Hovering, the shadow is 28.5° across; diving in at 0.9c it shrinks to 6.6°; climbing out at 0.9c it swells to 114°, wider than the view. Moving changes nothing about the hole, only the directions its light arrives from. Any touch of the controls ends the snapshot. ${FLOW_OFF}`,
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: false, moving: true });
      toHole(SGR_A, 20, IN_THE_PLANE, () => {
        controller.hoverAt(SGR_A, 20, IN_THE_PLANE);
        controller.holdWithVelocity(SGR_A, DIVE_AND_CLIMB, DIVE_AND_CLIMB_PERIOD_S);
      });
    }),
});

/** The flyby: 0.9c across the line to the hole, looking ahead. */
export const FLYBY: readonly HoldStep[] = [{ atS: 0, betaVec: { x: 0.9 * ACROSS_THE_PLANE.x, y: 0.9 * ACROSS_THE_PLANE.y, z: 0.9 * ACROSS_THE_PLANE.z } }];

defineScene('sgr-a-star-flyby', {
  label: 'Flying past Sgr A*',
  note: `Sweeping past Sagittarius A* at 0.9c, five horizon radii (0.42 au) from it, looking ahead with the hole to your left (the clock is paused). Hovering here the shadow would be 55.4° across, square to your path at 90°; at this speed it is 25.8° across and centred 28.7° from straight ahead, in front of you rather than beside you. ${FLOW_OFF}`,
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: false, moving: true });
      toHole(SGR_A, 10, IN_THE_PLANE, () => {
        // Galactic north up: the hole lies level with the view's centre, to the left, so the whole shadow fits across it.
        controller.hoverAt(SGR_A, 10, IN_THE_PLANE, ACROSS_THE_PLANE, GALACTIC_NORTH);
        controller.holdWithVelocity(SGR_A, FLYBY);
      });
    }),
});

/** A Julian year, ms. */
const YEAR_MS = 365.25 * 86_400_000;
/** The S2 scene: time at 30 minutes a second, starting a minute of real time before the alignment. */
export const S2_BEHIND_WARP = 1800;
export const S2_LEAD_S = 60;
/** The camera's distance from Sgr A* and how far the line from it through the hole passes from S2, au. */
export const S2_CAMERA_AU = 300;
export const S2_MISS_AU = 1;

/**
 * The time of S2's pericentre in the app's own positions nearest `ms` (within ±9 years; its period is 16):
 * a scan every 0.05 years for the closest samples, each refined by golden-section search to a second (to
 * within the two minutes that the 32-km grid of heliocentric positions leaves S2's distance flat there).
 * (The registry holds where S2 is now, a light-time of 27,000 years ahead of the epochs its orbit was
 * measured at, so its pericentres here are not May 2018's.) Null when S2 or Sgr A* is not registered.
 */
export function s2PericentreNear(ms: number): number | null {
  if (!isBody('s2') || !isBody(SGR_A)) return null;
  const a = new Vector3();
  const b = new Vector3();
  const sep = (t: number) => bodyPositionAt('s2', astroTimeAt(t), a).distanceTo(bodyPositionAt(SGR_A, astroTimeAt(t), b));
  const step = 0.05 * YEAR_MS;
  const g = (Math.sqrt(5) - 1) / 2;
  const refine = (lo: number, hi: number): number => {
    let c = hi - g * (hi - lo);
    let d = lo + g * (hi - lo);
    let fc = sep(c);
    let fd = sep(d);
    while (hi - lo > 1000) {
      if (fc < fd) {
        hi = d;
        d = c;
        fd = fc;
        c = hi - g * (hi - lo);
        fc = sep(c);
      } else {
        lo = c;
        c = d;
        fc = fd;
        d = lo + g * (hi - lo);
        fd = sep(d);
      }
    }
    return (lo + hi) / 2;
  };
  let best: number | null = null;
  // On a grid fixed in time (not started at ms), so every search near one pericentre finds it to the same bit.
  const start = Math.floor((ms - 9 * YEAR_MS) / step) * step;
  let prev2 = sep(start - step);
  let prev = sep(start);
  for (let t = start + step; t <= ms + 9 * YEAR_MS + step; t += step) {
    const d = sep(t);
    if (prev < prev2 && prev <= d) {
      const tp = refine(t - 2 * step, t);
      if (best === null || Math.abs(tp - ms) < Math.abs(best - ms)) best = tp;
    }
    prev2 = prev;
    prev = d;
  }
  return best;
}

/**
 * Where the S2 scene puts the camera for S2's pericentre at `tp` (ms): hovering 300 au from Sgr A* on the far
 * side from S2 (the direction from the hole, world axes, and r in units of M), its line through the hole
 * passing 1 au from S2 across S2's orbit (so S2 is closest to the line at the pericentre itself); and the
 * time to start at, a minute of real time before, at 30 minutes a second of the hovering clock (home's runs
 * 1/α faster there).
 */
export function s2BehindSetUp(tp: number): { dirOut: Vector3; rM: number; startMs: number } | null {
  const m = holeMKm(SGR_A);
  if (!(m > 0) || !isBody('s2')) return null;
  const t = astroTimeAt(tp);
  const s2 = bodyStateAt('s2', t);
  const hole = bodyStateAt(SGR_A, t);
  const h = s2.pos.sub(hole.pos);
  const n = h.clone().cross(s2.vel.sub(hole.vel));
  if (!(h.lengthSq() > 0) || !(n.lengthSq() > 0)) return null;
  const sinE = (S2_MISS_AU * AU_KM) / h.length();
  // From the camera through the hole: along S2's direction, tipped 1 au (at S2) across its orbit.
  const through = h.normalize().multiplyScalar(Math.sqrt(1 - sinE * sinE)).addScaledVector(n.normalize(), sinE);
  const rM = (S2_CAMERA_AU * AU_KM) / m;
  const alpha = Math.sqrt(1 - 2 / rM);
  return { dirOut: through.negate(), rM, startMs: tp - (S2_LEAD_S * S2_BEHIND_WARP * 1000) / alpha };
}

defineScene('s2-behind-sgr-a-star', {
  label: 'S2 behind the black hole',
  note: `S2 at its closest to Sagittarius A*, 120 au behind it, seen from 300 au out on the far side. Its light comes round both sides of the hole: two images, 0.81° and 0.68° from the centre, together 5.4 times brighter than S2 alone, either side of the ring 0.74° in radius where S2 would appear exactly behind. Time runs at 30 minutes a second, and the line to the hole passes 1 au from S2 a minute after the start. S2 then moves at 7,750 km/s, and its clock loses 60 s a day. The date moves to the nearest of S2’s closest approaches where the app places S2 now, its orbit carried on through the 27,000 years its light takes to reach us (the one we saw was in May 2018). ${FLOW_OFF}`,
  unavailable: needs(SGR_A, 's2'),
  run: (note) => {
    if (!ready()) return false;
    const tp = s2PericentreNear(sim.timeMs);
    const at = tp === null ? null : s2BehindSetUp(tp);
    if (!at || !setEpoch(at.startMs)) return false;
    updateEphemeris();
    setWarp(1);
    setPaused(true);
    holeViews(SGR_A, { flow: false });
    useUI.setState({ journeyNote: note, journeysOpen: false, showLabels: true, showOrbits: true, selected: 's2' });
    toHole(SGR_A, at.rM, at.dirOut, () => {
      controller.hoverAt(SGR_A, at.rM, at.dirOut);
      setWarp(S2_BEHIND_WARP);
      setPaused(false);
    });
    return true;
  },
});

/** The flow scene's numbers, computed by the flow's reference ray tracer for its camera (sgraFlow.json). */
const FLOW_SCENE = SGRA_FLOW.scenes['sgr-a-star-flow'];
const minus = (s: string) => s.replace('-', '−');

defineScene('sgr-a-star-flow', {
  label: 'The gas round Sgr A*',
  note: `Ten horizon radii (0.85 au) from Sagittarius A*, on the line to the Sun: the gas falling into the hole at our own viewing angle, two billion times closer than Earth. The glow is a model of that hot, thin gas, fitted to its radio-to-infrared spectrum; its visible light has never been seen. Bent round the hole, it makes a ring ${FLOW_SCENE.ringRadiusDeg.toFixed(2)}° in radius just outside the shadow’s edge (${FLOW_SCENE.shadowRadiusDeg.toFixed(2)}°), brightest where the gas comes towards you, and shines at magnitude ${minus(FLOW_SCENE.vMag.toFixed(1))} in all, brighter than the Sun from Earth. On the card, switch to 1.3 mm, as the Event Horizon Telescope sees it, and compare with its picture.`,
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: true });
      useUI.setState({ selected: SGR_A });
      const dir = sunward(SGR_A);
      toHole(SGR_A, 20, dir, hoverStep(SGR_A, 20, dir));
    }),
});

/** The radio scene's camera: 30 horizon radii out, where the ring and its shadow fill the middle of the view. */
export const SGRA_RADIO_M = 60;

defineScene('sgr-a-star-radio', {
  label: 'Sagittarius A* in radio light',
  note: 'Thirty horizon radii (2.5 au) from Sagittarius A*, seeing in radio light (1.3 mm) as the Event Horizon Telescope does: the model of its hot gas in false colour, an orange ring round the dark shadow, brightest where the gas comes towards you. Stars do not show at this wavelength. From Earth the ring is 52 millionths of an arcsecond across. View › Radio eyes switches back to visible light.',
  unavailable: needs(SGR_A),
  run: (note) =>
    scene(note, () => {
      holeViews(SGR_A, { flow: true, radio: true });
      useUI.setState({ selected: SGR_A });
      const dir = sunward(SGR_A);
      toHole(SGR_A, SGRA_RADIO_M, dir, hoverStep(SGR_A, SGRA_RADIO_M, dir));
    }),
});

const M87_STAR: BodyId = 'm87-star';
export const M87_CLOSE_AU = 1000;

defineScene('m87-star-close', {
  label: 'M87* from 1,000 au',
  note: 'Hovering 1,000 au from M87*, on our side of it, 7.8 horizon radii out: its horizon alone would reach three times Pluto’s distance from the Sun. The shadow is 36.3° across; light from straight behind it would close into a ring 69° across, but M87’s own starlight glows so evenly all round that the lens barely changes it. Your clock runs at 0.9336 of home’s, the tides are far too weak to feel, and hovering takes only 4.2 g (1 g from 2,015 au). A model of M87’s own starlight glows all round; the galaxy’s jet is not drawn.',
  unavailable: needs(M87_STAR),
  run: (note) =>
    scene(note, () => {
      holeViews(M87_STAR, {});
      useUI.setState({ selected: M87_STAR });
      const dir = sunward(M87_STAR);
      const rM = (M87_CLOSE_AU * AU_KM) / holeMKm(M87_STAR);
      toHole(M87_STAR, rM, dir, hoverStep(M87_STAR, rM, dir));
    }),
});

// ─── Phenomena (sim/phenomena) ──────────────────────────────────────────────────────────

/** A supernova seen from Earth at the time: each one's scene and what its note says (the curve's sources are on its card). */
const SN_SKY: Record<string, { scene: NamedSceneId; note: string }> = {
  'sn-1006': {
    scene: 'sn-1006-from-earth',
    note: 'Spring 1006, looking from Earth towards Lupus, low in the south for the observers of China, Egypt and Iraq. On 30 April (Julian; 6 May in the app’s Gregorian dates) a new star appeared there and rose to about magnitude −7.5, many times brighter than Venus: the brightest star in recorded history. Watch it fade over two years as the clock runs faster and faster. Its own records are sparse: the shape of its light curve is Tycho’s supernova’s.',
  },
  'sn-1054': {
    scene: 'sn-1054-from-earth',
    note: 'July 1054, looking from Earth towards Taurus, near the Sun: on 4 July (Julian; 10 July in the app’s Gregorian dates) Song dynasty astronomers recorded a “guest star” there, as bright as Venus and seen in daylight for 23 days. It stayed visible at night for 642 days. Its debris is the Crab Nebula. Between the three recorded points the light curve is a model.',
  },
  'sn-1181': {
    scene: 'sn-1181-from-earth',
    note: 'August 1181, looking from Earth towards Cassiopeia: a new star recorded in China and Japan from 6 August (Julian; 13 August in the app’s dates), about magnitude −0.5 and seen for 185 days. Its remnant is the nebula Pa 30. The shape of its light curve is a type Iax template.',
  },
  'sn-1572': {
    scene: 'sn-1572-from-earth',
    note: 'November 1572, looking from Earth towards Cassiopeia: the star Tycho Brahe saw on 11 November (Julian) rises to magnitude −4, as bright as Venus, then fades and reddens as he recorded, and is gone by March 1574. Its light curve is Tycho’s and his contemporaries’ estimates.',
  },
  'sn-1604': {
    scene: 'sn-1604-from-earth',
    note: 'October 1604, looking from Earth towards Ophiuchus, where Jupiter, Saturn and Mars were gathered: on 9 October a new star appeared beside them and rose to magnitude −3, brighter than Jupiter. Kepler followed it for a year. Its light curve is the European and Korean records’.',
  },
  'supernova-1987a': {
    scene: 'sn-1987a-from-earth',
    note: 'February 1987, looking from Earth towards the Large Magellanic Cloud: on 24 February a star of magnitude 5 appeared beside the Tarantula Nebula, the first supernova seen by eye since Kepler’s. It brightened to 3 by May, then faded, measured night by night.',
  },
};

/** Watch a supernova from Earth: the clock two days before its first sighting, the camera just beyond Earth towards it, time speeding up as its light fades. */
function supernovaFromEarth(id: string, note: string): boolean {
  const sn = supernovaById(id);
  if (!sn || !ready() || !setEpoch(sn.firstSeenMs - 2 * 86_400_000)) return false;
  updateEphemeris();
  const at = sim.bodies[id];
  const earth = sim.bodies.earth;
  if (!at?.present || !earth) return false;
  setWarp(1);
  setPaused(false);
  useUI.setState({ journeyNote: note, journeysOpen: false, selected: id, showLabels: true, sizeMode: 'true' });
  // Orbiting the supernova from just beyond Earth (40,000 km out, on its side), looking at it: the sky from Earth.
  const toEarth = earth.pos.clone().sub(at.pos);
  const d = toEarth.length();
  controller.goTo(id, { distance: d - 40_000, direction: toEarth.normalize() });
  afterSlew(id, () => {
    startPace({ target: id, zeroMs: sn.explosionMs, realUntilMs: -Infinity, efoldS: 7, maxWarp: 2e6, endMs: nakedEyeEndMs(sn) + 60 * 86_400_000, distanceKm: () => NaN });
  });
  return true;
}

for (const [id, { scene: name, note }] of Object.entries(SN_SKY)) {
  defineScene(name, { label: PENDING_LABELS[name], note, unavailable: needs(id, 'earth'), run: (n) => supernovaFromEarth(id, n) });
}

/** A supernova up close: from its first days to its remnant today, the camera easing out with the shock, each few seconds e times older. */
function supernovaUpClose(id: string, note: string, startDays: number): boolean {
  const sn = supernovaById(id);
  if (!sn || !ready()) return false;
  const start = sn.explosionMs + startDays * 86_400_000;
  if (!setEpoch(start)) return false;
  updateEphemeris();
  setWarp(1);
  setPaused(false);
  useUI.setState({ journeyNote: note, journeysOpen: false, selected: id, showLabels: false });
  const size = (ms: number) => {
    const age = (ms - sn.explosionMs) / 1000;
    return Math.max(shockRadiusKm(sn, age), sn.photosphereKmS * Math.min(age, 200 * 86_400));
  };
  const at = sim.bodies[id];
  const earth = sim.bodies.earth;
  // From a little off our line of sight, so the shell is seen much as Earth sees it.
  const dir = earth.pos.clone().sub(at.pos).normalize().addScaledVector(UP, 0.35).normalize();
  controller.goTo(id, { distance: 4 * size(start), direction: dir });
  afterSlew(id, () => {
    startPace({ target: id, zeroMs: sn.explosionMs, realUntilMs: -Infinity, efoldS: 3.5, maxWarp: 3e9, endMs: Date.now(), distanceKm: (ms) => 3.6 * size(ms) });
  });
  return true;
}

defineScene('sn-1572-up-close', {
  label: PENDING_LABELS['sn-1572-up-close'],
  note: 'A model of Tycho’s supernova from a few days after its light reached Earth: the white-hot fireball swelling at 10,000 km/s and fading as its light curve says, then its debris, the forward shock running out at the measured speeds and slowing to today’s 4′ remnant. Each few seconds here the explosion is e times older; the camera eases out with it. The remnant shines mostly in X-rays: its shell is shown in false colour.',
  unavailable: needs('sn-1572'),
  run: (note) => supernovaUpClose('sn-1572', note, 3),
});

defineScene('sn-1987a-up-close', {
  label: PENDING_LABELS['sn-1987a-up-close'],
  note: 'A model of SN 1987A from its first day: the fireball, then the ring of gas the star had shed 20,000 years before, lit up by the explosion’s flash, and from 1995 the blast reaching it and lighting it in a string of hot spots. The ring is drawn at its measured size and tilt; its brightness through the years and the shock inside it (in false colour) are a model.',
  unavailable: needs('supernova-1987a'),
  run: (note) => supernovaUpClose('supernova-1987a', note, 1),
});

defineScene('kilonova-gw170817', {
  label: PENDING_LABELS['kilonova-gw170817'],
  note: 'NGC 4993, 17 August 2017: two neutron stars of 1.46 and 1.27 solar masses, a few hundred kilometres apart and closing, the last minute of an inspiral heard by LIGO and Virgo. The chirp runs at its real pace (the orbit is drawn 100 times slower than it turned). They merge at 12:41:04 UTC; then the clock speeds up as the debris glows, blue at first and red within days, as the kilonova AT 2017gfo was seen. The debris’s shape is a model.',
  unavailable: needs(KILONOVA_ID),
  run: (note) =>
    scene(note, () => {
      setWarp(1);
      setPaused(false);
      useUI.setState({ selected: KILONOVA_ID, showLabels: false });
      const at = sim.bodies[KILONOVA_ID];
      const dir = sim.bodies.earth.pos.clone().sub(at.pos).normalize().addScaledVector(UP, 0.5).normalize();
      controller.goTo(KILONOVA_ID, { distance: 2500, direction: dir });
      afterSlew(KILONOVA_ID, () => {
        if (!setEpoch(MERGER_MS - 45_000)) return;
        updateEphemeris();
        setWarp(1);
        setPaused(false);
        startPace({
          target: KILONOVA_ID,
          zeroMs: MERGER_MS,
          realUntilMs: MERGER_MS + 1500,
          efoldS: 2.5,
          maxWarp: 2e5,
          endMs: MERGER_MS + 21 * 86_400_000,
          distanceKm: (ms) => (ms < MERGER_MS ? Math.max(5 * inspiralAt(ms).separationKm, 250) : Math.max(3.4 * kilonovaAt(ms).blueKm, 250)),
        });
      });
    }),
});

/** A view of a galaxy's jets: `offDeg` off our line of sight towards position angle `paDeg`, at `distanceKm`. */
function jetView(id: string, note: string, distanceKm: number, offDeg: number, paDeg: number): boolean {
  return scene(note, () => {
    useUI.setState({ jets: true, selected: id, showLabels: true });
    const at = sim.bodies[id];
    const toEarth = sim.bodies.earth.pos.clone().sub(at.pos).normalize();
    // The sky's east and north there (as sim/phenomena/jets.ts lays the jets out), and a direction off our line.
    const pole = eqjToWorld(0, 0, 1);
    const away = toEarth.clone().negate();
    const east = new Vector3().crossVectors(pole, away).normalize();
    const north = new Vector3().crossVectors(away, east);
    const pa = (paDeg * Math.PI) / 180;
    const side = east.multiplyScalar(Math.sin(pa)).addScaledVector(north, Math.cos(pa));
    const o = (offDeg * Math.PI) / 180;
    controller.goTo(id, { distance: distanceKm, direction: toEarth.multiplyScalar(Math.cos(o)).addScaledVector(side, Math.sin(o)).normalize() });
  });
}

defineScene('m87-jet', {
  label: PENDING_LABELS['m87-jet'],
  note: 'M87’s jet in its own light, 5,000 light-years long on our sky and nearly 20,000 along the jet, leaving the black hole M87* at almost the speed of light. Its knots (HST-1, D, E, F, I, A, B, C) sit where Hubble sees them, as bright as measured from Earth; seen from here, 40° off our line, the jet coming towards us is dimmer than from Earth and the counter-jet still hundreds of times fainter: relativistic beaming. Its width and the light between the knots are a model.',
  unavailable: needs('m87'),
  run: (note) => jetView('m87', note, 10 * KPC_KM, 40, 290),
});

defineScene('centaurus-a-jets', {
  label: PENDING_LABELS['centaurus-a-jets'],
  note: 'Centaurus A, the nearest radio galaxy: its jet runs out north-east at about half the speed of light into the inner lobe, a fainter counter-jet the other way, and the giant lobes reach about 600 kiloparsecs from end to end, 16 full Moons across our sky. All of it is radio and X-ray light, shown in false colour at a brightness chosen to be seen; how the lobes lie along our line of sight is not known.',
  unavailable: needs('centaurus-a'),
  run: (note) => jetView('centaurus-a', note, 650 * KPC_KM, 25, 55),
});

defineScene('aurora', {
  label: PENDING_LABELS.aurora,
  note: 'The northern auroral oval from 10,000 km above the night side: green light of oxygen 100–150 km up, red above it, round the geomagnetic pole of the date (IGRF), where Starkov’s model puts the oval for the activity chosen in View › Aurora (Kp 3, a moderate night, by default). The ovals stay facing the Sun as Earth turns beneath them; the curtains’ folds and motion are a model.',
  unavailable: needs('earth', 'sun'),
  run: (note) =>
    scene(note, () => {
      setWarp(1);
      setPaused(false);
      useUI.setState({ aurora: true, selected: null });
      const e = sim.bodies.earth;
      const sun = sim.bodies.sun.pos.clone().sub(e.pos).normalize();
      const year = 1970 + sim.timeMs / (365.2425 * 86_400_000);
      const p = geomagneticPole(year);
      const b = bodyFixedDir(p.latDeg, p.lonDeg);
      const pole = new Vector3(b[0], b[1], b[2]).applyQuaternion(e.quat).normalize();
      // Above the oval's midnight side: over the pole, tipped away from the Sun.
      controller.goTo('earth', { distance: 16_400, direction: pole.multiplyScalar(0.75).addScaledVector(sun, -0.65).normalize() });
    }),
});

/** The phenomena that are views rather than bodies, for "Where to?": the aurora and the jets. */
const PHENOMENA_VIEWS: readonly Destination[] = (
  [
    ['aurora-view', 'Aurora (northern lights)', ['aurora', 'northern lights', 'aurora borealis', 'southern lights', 'aurora australis', 'auroral oval'], 'Earth’s auroral ovals', 'sun-planets', 'aurora', ['earth']],
    ['m87-jet-view', 'The jet of M87', ['M87 jet', 'relativistic jet', 'jet', 'HST-1', 'Virgo A jet'], 'A relativistic jet', 'galaxies', 'm87-jet', ['m87']],
    ['centaurus-a-jets-view', 'The jets and lobes of Centaurus A', ['Centaurus A jets', 'Cen A lobes', 'radio lobes', 'radio galaxy'], 'Radio jets and lobes (false colour)', 'galaxies', 'centaurus-a-jets', ['centaurus-a']],
  ] as const
).map(([id, name, aliases, kind, group, spec, bodies]) => ({
  id,
  name,
  aliases,
  kind,
  group,
  distanceKm: () => NaN,
  unavailable: () => (bodies.every((b) => isBody(b)) ? null : 'Loading…'),
  go: () => {
    runScene(spec);
  },
}));
registerDestinations(() => (isBody('m87') ? PHENOMENA_VIEWS : PHENOMENA_VIEWS.slice(0, 1)));

// ─── Cygnus X-1's disc ──────────────────────────────────────────────────────────────────

const CYG_X1: BodyId = 'cyg-x-1';

/**
 * A direction from Cygnus X-1 at `elevationDeg` above its disc's plane (world axes), on the side away from its
 * companion turned a quarter round the disc (so the supergiant, 37,000 times farther than the camera, sits off to
 * one side and the disc's far side is seen against the sky).
 */
export function cygX1View(elevationDeg: number): Vector3 {
  const n = getBody(CYG_X1)?.blackHole?.disk?.normalWorld ?? [0, 1, 0];
  const normal = new Vector3(n[0], n[1], n[2]);
  const star = sim.bodies['hde-226868']?.present ? sim.bodies['hde-226868'].pos.clone().sub(sim.bodies[CYG_X1].pos) : new Vector3(1, 0, 0);
  const across = new Vector3().crossVectors(normal, star);
  if (across.lengthSq() < 1e-30) across.set(1, 0, 0).cross(normal);
  across.normalize();
  const el = (elevationDeg * Math.PI) / 180;
  return across.multiplyScalar(Math.cos(el)).addScaledVector(normal, Math.sin(el)).normalize();
}

/** The disc scenes' camera: r (units of M) and elevation above the disc's plane (degrees). */
export const CYG_X1_DISK_VIEW = { rM: 60, elevationDeg: 8 };
/** "From above" is from our own side: on the line to the Sun, 27° from the disc's axis, as Earth sees it. */
export const CYG_X1_ABOVE_VIEW = { rM: 150 };

/** Hover for a disc scene along dir: looking at the hole with the disc's axis up, so its plane lies level across the view. */
function cygX1Hover(rM: number, dir: Vector3): void {
  const n = getBody(CYG_X1)?.blackHole?.disk?.normalWorld ?? [0, 1, 0];
  controller.hoverAt(CYG_X1, rM, dir, dir.clone().negate(), { x: n[0], y: n[1], z: n[2] });
}

/** How the disc scenes' notes end: what is a model. */
const DISK_MODEL =
  'The disc is a model: a thin disc at 2 % of its Eddington luminosity, each ring a blackbody, drawn without the hole’s fast spin; its gas turns 1,000 times slower than real, and its swirls are illustrative.';

defineScene('cyg-x-1-disk', {
  label: 'The disc of Cygnus X-1',
  note: `Thirty horizon radii (1,900 km) from Cygnus X-1, just above its disc of hot gas. Its inner rings blaze, and its far side is bent up over the black hole, with a thin ring of its light hugging the shadow. The side whose gas comes towards you is far brighter. ${DISK_MODEL}`,
  unavailable: needs(CYG_X1),
  run: (note) =>
    scene(note, () => {
      holeViews(CYG_X1, { disk: true });
      useUI.setState({ selected: CYG_X1 });
      const dir = cygX1View(CYG_X1_DISK_VIEW.elevationDeg);
      toHole(CYG_X1, CYG_X1_DISK_VIEW.rM, dir, () => cygX1Hover(CYG_X1_DISK_VIEW.rM, cygX1View(CYG_X1_DISK_VIEW.elevationDeg)));
    }),
});

defineScene('cyg-x-1-from-above', {
  label: 'Cygnus X-1 from above',
  note: `Seventy-five horizon radii (4,700 km) from Cygnus X-1, on our side of it: its disc seen at the angle we see it from Earth, 27° from its axis. Its inner edge, three horizon radii out, is as close as gas can circle without falling in; just outside the shadow a thin ring shows the disc’s underside, its light bent round the hole. The side whose gas comes towards you is brighter. ${DISK_MODEL}`,
  unavailable: needs(CYG_X1),
  run: (note) =>
    scene(note, () => {
      holeViews(CYG_X1, { disk: true });
      useUI.setState({ selected: CYG_X1 });
      const dir = sunward(CYG_X1);
      toHole(CYG_X1, CYG_X1_ABOVE_VIEW.rM, dir, () => cygX1Hover(CYG_X1_ABOVE_VIEW.rM, sunward(CYG_X1)));
    }),
});

// ─── The other discs, and a tour of black holes ────────────────────────────────────────────

const LMC_X1: BodyId = 'lmc-x-1';
const GRS_1915: BodyId = 'grs-1915';

/**
 * A direction from a black hole with a thin disc at `elevationDeg` above the disc's plane (world axes), on the side
 * away from its companion turned a quarter round the disc, as cygX1View does for Cygnus X-1: the companion sits off to
 * one side and the disc's far side is seen against the sky.
 */
export function discView(hole: BodyId, elevationDeg: number): Vector3 {
  const bh = getBody(hole)?.blackHole;
  const n = bh?.disk?.normalWorld ?? [0, 1, 0];
  const normal = new Vector3(n[0], n[1], n[2]);
  const c = bh?.companion;
  const star = c && sim.bodies[c]?.present ? sim.bodies[c].pos.clone().sub(sim.bodies[hole].pos) : new Vector3(1, 0, 0);
  const across = new Vector3().crossVectors(normal, star);
  if (across.lengthSq() < 1e-30) across.set(1, 0, 0).cross(normal);
  across.normalize();
  const el = (elevationDeg * Math.PI) / 180;
  return across.multiplyScalar(Math.cos(el)).addScaledVector(normal, Math.sin(el)).normalize();
}

/** Hover for a disc scene along dir: looking at the hole with the disc's axis up, so its plane lies level across the view. */
function discHover(hole: BodyId, rM: number, dir: Vector3): void {
  const n = getBody(hole)?.blackHole?.disk?.normalWorld ?? [0, 1, 0];
  controller.hoverAt(hole, rM, dir, dir.clone().negate(), { x: n[0], y: n[1], z: n[2] });
}

/** The angle between the disc's axis and a direction from the hole (folded to 0–90°: either face), degrees. */
export function discTiltDeg(hole: BodyId, dir: Vector3): number {
  const n = getBody(hole)?.blackHole?.disk?.normalWorld;
  if (!n) return NaN;
  const c = Math.abs(new Vector3(n[0], n[1], n[2]).dot(dir.clone().normalize()));
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}

/** "160,000 light-years", "2.7 million light-years", from where a body is now. */
function lightYearsAway(id: BodyId): string {
  const b = sim.bodies[id];
  const ly = b?.present ? b.pos.distanceTo(sim.bodies.sun.pos) / LIGHT_YEAR_KM : NaN;
  if (!Number.isFinite(ly)) return 'far';
  if (ly >= 1e6) return `${Number((ly / 1e6).toPrecision(2))} million light-years`;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(ly)) - 1);
  return `${(Math.round(ly / step) * step).toLocaleString('en-GB')} light-years`;
}

/** A mass in words: "10.9 solar masses", "140 million solar masses", "21 billion solar masses". */
function massWords(m: number): string {
  if (!Number.isFinite(m)) return 'its mass still loading';
  if (m >= 1e9) return `${Number((m / 1e9).toPrecision(2))} billion solar masses`;
  if (m >= 1e6) return `${Number((m / 1e6).toPrecision(2))} million solar masses`;
  return `${Number(m.toPrecision(3))} solar masses`;
}

const holeMass = (id: BodyId): number => getBody(id)?.blackHole?.massMsun ?? NaN;
/** r = rM M from a hole, km, rounded to `step`, in words ("6,400 km"). */
const rKmWords = (id: BodyId, rM: number, step = 100): string => `${(Math.round((rM * holeMKm(id)) / step) * step).toLocaleString('en-GB')} km`;

/** How a disc scene's note ends: what is a model, with the disc's own luminosity. */
function discModel(hole: BodyId): string {
  const d = getBody(hole)?.blackHole?.disk;
  const pct = d ? Math.round(d.eddingtonFraction * 100) : NaN;
  return `The disc is a model: a thin disc at ${pct} % of its Eddington luminosity, a typical state rather than today’s, each ring a blackbody, drawn without the hole’s spin; its gas turns ${(d?.slowdown ?? 1000).toLocaleString('en-GB')} times slower than real, and its swirls are illustrative.`;
}

/** LMC X-1's disc scene: r (units of M) and elevation above the disc's plane (degrees). */
export const LMC_X1_DISK_VIEW = { rM: 60, elevationDeg: 10 };
/** GRS 1915+105 at our own angle: on the line to the Sun. */
export const GRS_1915_VIEW = { rM: 120 };

defineScene('lmc-x-1-disk', {
  label: 'A black hole in another galaxy',
  get note() {
    const { rM, elevationDeg } = LMC_X1_DISK_VIEW;
    return `${rM / 2} horizon radii (${rKmWords(LMC_X1, rM)}) from LMC X-1, ${elevationDeg}° above its disc, in the Large Magellanic Cloud ${lightYearsAway(LMC_X1)} away: a black hole of ${massWords(holeMass(LMC_X1))} drinking the wind of a giant O star. Its inner rings blaze; its far side is bent up over the black hole, and the side whose gas comes towards you is far brighter. ${discModel(LMC_X1)}`;
  },
  unavailable: needs(LMC_X1),
  run: (note) =>
    scene(note, () => {
      holeViews(LMC_X1, { disk: true });
      useUI.setState({ selected: LMC_X1 });
      const { rM, elevationDeg } = LMC_X1_DISK_VIEW;
      toHole(LMC_X1, rM, discView(LMC_X1, elevationDeg), () => discHover(LMC_X1, rM, discView(LMC_X1, elevationDeg)));
    }),
});

defineScene('grs-1915-disk', {
  label: 'GRS 1915+105 as we see it',
  get note() {
    const { rM } = GRS_1915_VIEW;
    const tilt = isBody(GRS_1915) ? Math.round(discTiltDeg(GRS_1915, sunward(GRS_1915))) : NaN;
    return `${rM / 2} horizon radii (${rKmWords(GRS_1915, rM)}) from GRS 1915+105, ${lightYearsAway(GRS_1915)} away, on the line to the Sun: its disc as we see it, ${tilt}° from its axis, the far side bent up over the shadow. From 1992 to 2018 it was one of the brightest X-ray sources in the sky, flaring and firing jets; since then it has been mostly hidden behind its own gas. ${discModel(GRS_1915)}`;
  },
  unavailable: needs(GRS_1915),
  run: (note) =>
    scene(note, () => {
      holeViews(GRS_1915, { disk: true });
      useUI.setState({ selected: GRS_1915 });
      const { rM } = GRS_1915_VIEW;
      toHole(GRS_1915, rM, sunward(GRS_1915), () => discHover(GRS_1915, rM, sunward(GRS_1915)));
    }),
});

/**
 * One stop of the tour: the hole, where the camera hovers (r in units of M) and what to say. The view: 'sun', on the
 * line to the Sun (the hole as we see it); a number, that many degrees above its disc's plane; 'milky-way', beyond the
 * hole on the line from the Milky Way's centre, so the Galaxy behind it is bent into a ring.
 */
export interface TourStop {
  hole: BodyId;
  rM: number;
  view: 'sun' | number | 'milky-way';
  text: () => string;
}

/** How long the tour holds at each stop, s. */
export const TOUR_STOP_S = 16;

/** M31*'s stop: where a source far behind it closes into a ring 1.5° in radius, r = 4M/θ² (units of M). */
export const M31_RING_RADIUS_DEG = 1.5;
export const M31_RING_RM = 4 / ((M31_RING_RADIUS_DEG * Math.PI) / 180) ** 2;

/**
 * The tour of black holes, each held TOUR_STOP_S seconds: the lightest known, then three discs (each a model of a
 * typical state) from across the Galaxy to M33, then a supermassive hole with the Milky Way bent round it. (The holes
 * at the centres of the far galaxies are not stops: from beside them the app's sky is nearly black, with only their
 * galaxies' markers to bend.)
 */
export const BLACK_HOLE_TOUR: readonly TourStop[] = [
  {
    hole: 'gro-j0422',
    rM: 2 * STELLAR_FRAMING_RS,
    view: 'sun',
    text: () => `GRO J0422+32, ${massWords(holeMass('gro-j0422'))}, ${lightYearsAway('gro-j0422')} away in Perseus: one of the lightest black holes known, between the heaviest neutron stars and the other black holes, seen from 10,000 horizon radii; its small red companion circles it every 5.1 hours.`,
  },
  {
    hole: GRS_1915,
    rM: GRS_1915_VIEW.rM,
    view: 'sun',
    text: () => `GRS 1915+105, ${massWords(holeMass(GRS_1915))}, ${lightYearsAway(GRS_1915)} away across the Galaxy, seen as we see it: its disc of hot gas as it shone in its bright years, 1992–2018.`,
  },
  {
    hole: LMC_X1,
    rM: LMC_X1_DISK_VIEW.rM,
    view: LMC_X1_DISK_VIEW.elevationDeg,
    text: () => `LMC X-1, ${massWords(holeMass(LMC_X1))}, in the Large Magellanic Cloud ${lightYearsAway(LMC_X1)} away: its disc, fed by the wind of a giant O star, has shone steadily since it was found in 1969.`,
  },
  {
    hole: 'm33-x-7',
    rM: 100,
    view: 'sun',
    text: () => `M33 X-7, ${massWords(holeMass('m33-x-7'))}, ${lightYearsAway('m33-x-7')} away in the Triangulum Galaxy, its disc seen nearly edge-on as we see it: once an orbit its giant companion eclipses it.`,
  },
  {
    hole: 'm31-star',
    rM: M31_RING_RM,
    view: 'milky-way',
    text: () =>
      `M31*, ${massWords(holeMass('m31-star'))}, at the centre of the Andromeda Galaxy, weighed by the motions of the stars round it, seen from ${Math.round((M31_RING_RM * holeMKm('m31-star')) / AU_KM / 100) * 100} au beyond it: the Milky Way, 2.5 million light-years behind it, is bent into a ring ${(2 * (einsteinAngle({ frame: 'static', r: M31_RING_RM }) * 180) / Math.PI).toFixed(1)}° across. Andromeda’s own stars close by are not drawn.`,
  },
];

/** The tour's note at stop i: where it is, and how it goes on. */
export function tourNote(i: number): string {
  const n = BLACK_HOLE_TOUR.length;
  const next = i + 1 < n ? ` The tour moves on in ${TOUR_STOP_S} s; move the camera to stay.` : ' The last stop: the tour ends here.';
  return `Stop ${i + 1} of ${n}. ${BLACK_HOLE_TOUR[i].text()}${next} The discs are models of a typical state, drawn without spin; the holes are drawn exactly, as general relativity says one that does not spin looks.`;
}

/** Where the tour's camera hovers at a stop, from the hole (world axes). */
function tourDir(stop: TourStop): Vector3 {
  if (stop.view === 'sun') return sunward(stop.hole);
  if (stop.view === 'milky-way') {
    const d = sim.bodies[stop.hole].pos.clone().sub(sim.bodies[SGR_A].pos);
    return d.lengthSq() > 0 ? d.normalize() : IN_THE_PLANE.clone();
  }
  return discView(stop.hole, stop.view);
}

/** Go to stop i of the tour, and once there wait TOUR_STOP_S seconds for the next (dropped if the camera is moved or another scene starts). */
function tourStop(i: number): void {
  const stop = BLACK_HOLE_TOUR[i];
  if (!stop) return;
  if (!isBody(stop.hole)) {
    tourStop(i + 1);
    return;
  }
  useUI.setState({ selected: stop.hole, holePanel: { hole: stop.hole, open: true }, journeyNote: tourNote(i) });
  toHole(stop.hole, stop.rM, tourDir(stop), () => {
    const dir = tourDir(stop);
    if (getBody(stop.hole)?.blackHole?.disk) discHover(stop.hole, stop.rM, dir);
    else controller.hoverAt(stop.hole, stop.rM, dir);
    if (i + 1 < BLACK_HOLE_TOUR.length) tourNext(i + 1);
  });
}

function tourNext(i: number): void {
  cancelSceneStep();
  const move = controller.moves;
  const timer = setTimeout(() => {
    pendingStep = null;
    if (controller.moves !== move || useUI.getState().tripActive) return;
    tourStop(i);
  }, TOUR_STOP_S * 1000);
  pendingStep = () => clearTimeout(timer);
}

/** Step the tour on at once (for the tests, which cannot wait): the stop it would go to next. */
export function tourAdvanceForTests(i: number): void {
  cancelSceneStep();
  tourStop(i);
}

defineScene('black-hole-tour', {
  label: 'A tour of black holes',
  get note() {
    return tourNote(0);
  },
  unavailable: needs(...BLACK_HOLE_TOUR.map((s) => s.hole)),
  run: (note) =>
    scene(note, () => {
      // Every view the tour needs, turned on at its start (so the next scene turns them back).
      useUI.setState({ lensing: true, accretionDisks: true, showOrbits: false, accretionFlow: false });
      tourStop(0);
    }),
});

// ─── The sky from a black hole ──────────────────────────────────────────────────────────

/** The Moon's mean apparent radius, rad (0.259°, 15.5′). */
const MOON_RADIUS_RAD = (0.259 * Math.PI) / 180;
/** Sgr A*'s sky is seen from 10,000 au (the Moon's rule would give 8,303 au; the Learn article uses 10,000). */
const SGR_A_SKY_FROM_KM = 10_000 * AU_KM;
/** A ring that holds longer than this with the clock running is shown with the clock running (a day). */
const RING_HOLDS_RUNNING_S = 86_400;
/**
 * How fast Sgr A* really moves across our line of sight to it, km/s: its apparent motion, 6.411 mas/yr (Reid &
 * Brunthaler 2020, ApJ 892, 39: the reflex of the Sun's orbit round the Galaxy), at 8.277 kpc. The app holds it at
 * rest relative to the Sun, so its sky-from note says what that leaves out.
 */
const SGR_A_ACROSS_KM_S = 252;

/**
 * How far beyond a black hole its sky is seen from, km: where the Sun's Einstein ring has the Moon's apparent
 * radius (D = 4M/θ², the Sun far behind): 2.68 million km beyond Gaia BH1; Sgr A* from 10,000 au.
 */
export function skyFromHoleKm(id: BodyId): number {
  return id === SGR_A ? SGR_A_SKY_FROM_KM : (4 * holeMKm(id)) / (MOON_RADIUS_RAD * MOON_RADIUS_RAD);
}

const skyA = new Vector3();
const skyB = new Vector3();

/**
 * The direction the Sun's light comes from as black hole `id` sees it at time `ms` (unit, world axes): the
 * direction to the Sun aberrated by the hole's velocity relative to it (exact at any speed). A camera hovering
 * by the hole sees the Sun exactly behind the hole when it sits on the line through the hole along this.
 */
function sunFromHole(id: BodyId, ms: number, out: Vector3): Vector3 {
  const t = astroTimeAt(ms);
  const h = bodyStateAt(id, t);
  const s = bodyStateAt('sun', t);
  const n = s.pos.sub(h.pos).normalize();
  const b = h.vel.sub(s.vel).divideScalar(C_KM_S);
  const bb = b.lengthSq();
  if (!(bb > 0)) return out.copy(n);
  const g = 1 / Math.sqrt(1 - bb);
  const nb = n.dot(b);
  return out
    .copy(n)
    .addScaledVector(b, ((g - 1) * nb) / bb + g)
    .divideScalar(g * (1 + nb))
    .normalize();
}

/** The angle between two unit vectors, from their chord (no cancellation at tiny angles). */
const chordAngle = (a: Vector3, b: Vector3): number => 2 * Math.atan2(skyB.subVectors(a, b).length(), Math.sqrt(Math.max(0, 4 - skyB.lengthSq())));

/**
 * How long after `ms` a camera hovering exactly behind hole `id` keeps the Sun within its own radius of the line
 * (z = 1: the ring then starts to open into two arcs), s; Infinity for a hole at rest relative to the Sun. The Sun's
 * direction as the hole sees it drifts with the hole's motion across the line and, far faster for a hole in a
 * binary, with the aberration of its changing orbital velocity: the Sun is 4.7 × 10⁻¹¹ rad across from Gaia BH1, so
 * a change of 1.4 cm/s in the hole's velocity is enough, about 5 s of its orbit, and a millisecond at an X-ray
 * binary. Found by doubling then bisection over the providers' own states.
 */
function ringHoldsS(id: BodyId, ms: number, sunRadiusRad: number): number {
  const d0 = sunFromHole(id, ms, new Vector3());
  const off = (s: number) => chordAngle(sunFromHole(id, ms + 1000 * s, skyA), d0);
  let hi = 1e-3;
  while (off(hi) < sunRadiusRad) {
    hi *= 2;
    if (hi > 1e9) return Infinity;
  }
  let lo = hi / 2;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (off(mid) < sunRadiusRad) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** The numbers of the sky from a black hole (its note's, and the scene tests'). */
export interface HoleSky {
  /** How far the Sun is behind the hole, and the camera beyond it, km. */
  sunBehindKm: number;
  cameraKm: number;
  /** The Sun's Einstein ring's radius, rad (exact for the static observer; the Sun's finite distance to first order). */
  ringRad: number;
  /** The ring's V magnitude at perfect alignment: a uniform disc through a point lens, μ = √(1 + 4/ρ²); no dust. */
  ringMag: number;
  /** How long the ring stays closed with the clock running, s (Infinity: for good). */
  ringHoldsS: number;
}

/** What the Sun looks like from behind black hole `id` now (null when the hole or the Sun is missing). */
export function holeSky(id: BodyId): HoleSky | null {
  const hole = sim.bodies[id];
  const sun = sim.bodies.sun;
  const m = holeMKm(id);
  if (!hole || !sun || !(m > 0)) return null;
  const cameraKm = skyFromHoleKm(id);
  const sunBehindKm = hole.pos.distanceTo(sun.pos);
  if (!(sunBehindKm > 0)) return null;
  const toSunKm = sunBehindKm + cameraKm;
  const ringRad = einsteinAngle({ frame: 'static', r: cameraKm / m }) * Math.sqrt(sunBehindKm / toSunKm);
  const rho = SUN_RADIUS_KM / toSunKm / ringRad;
  const ringMag = apparentMagnitude('sun', toSunKm) - 2.5 * Math.log10(Math.sqrt(1 + 4 / (rho * rho)));
  return { sunBehindKm, cameraKm, ringRad, ringMag, ringHoldsS: ringHoldsS(id, sim.timeMs, SUN_RADIUS_KM / sunBehindKm) };
}

/**
 * The sky from a black hole: hovering exactly behind it as the Sun's light reaches it (alignBehind: the Sun's
 * image closes into a ring only within a few kilometres of that line at Sgr A*, 13 cm at Gaia BH1), at
 * skyFromHoleKm, looking back at the hole and the Sun behind it. The line is found again when the slew ends. A
 * hole at rest relative to the Sun (Sgr A*, M87*, OGLE-2011-BLG-0462 as drawn) keeps the ring: the clock runs at
 * real time. A hole in a binary swings off the line within seconds (ringHoldsS): the clock is paused at the
 * alignment, a snapshot, and the note says so. Where a flow is drawn (Sgr A*) it is switched off, as in the lens
 * scenes: from 10,000 au its point (V −8.9) would drown the Sun's ring 6 device px from it.
 */
function skyFromHole(ref: TargetRef, note: string): boolean {
  return scene(note, () => {
    const id = ref.id;
    const dKm = skyFromHoleKm(id);
    const rM = dKm / holeMKm(id);
    const rel = alignBehind(id, 'sun', dKm, new Vector3());
    if (!rel) return;
    const snapshot = ringHoldsS(id, sim.timeMs, SUN_RADIUS_KM / Math.max(1, sim.bodies[id].pos.distanceTo(sim.bodies.sun.pos))) < RING_HOLDS_RUNNING_S;
    holeViews(id, hasFlow(id) ? { flow: false } : {});
    setWarp(1);
    useUI.setState({ showLabels: true, selected: id });
    toHole(id, rM, rel.normalize(), () => {
      const now = alignBehind(id, 'sun', dKm, new Vector3());
      if (now) controller.hoverAt(id, rM, now.normalize());
      if (snapshot) setPaused(true);
    });
  });
}

/** Whether a black hole has an accretion flow drawn (Sgr A*'s model). */
const hasFlow = (id: BodyId): boolean => !!getBody(id)?.blackHole?.flow;

/** A distance as a note gives it: "1,570 light-years", "54.5 million light-years". */
function lightYearsText(km: number): string {
  const ly = km / LIGHT_YEAR_KM;
  if (ly >= 1e6) return `${Number((ly / 1e6).toPrecision(3)).toLocaleString('en-GB')} million light-years`;
  return `${Number(ly.toPrecision(3)).toLocaleString('en-GB')} light-years`;
}

/** A hover's distance: "2.68 million km", "10,000 au", "199 light-years". */
function hoverDistanceText(km: number): string {
  if (km < 1e9) return `${Number((km / 1e6).toPrecision(3))} million km`;
  if (km < 1e5 * AU_KM) return `${Math.round(km / AU_KM).toLocaleString('en-GB')} au`;
  return lightYearsText(km);
}

/** A short span as a note gives it: "5 s", "4 minutes", "3.1 hours", "a millisecond". */
function spanText(s: number): string {
  if (s < 0.0015) return 'a millisecond';
  if (s < 1) return `${Number((s * 1000).toPrecision(2))} milliseconds`;
  if (s < 120) return `${Math.round(s)} s`;
  if (s < 7200) return `${Math.round(s / 60)} minutes`;
  return `${Number((s / 3600).toPrecision(2))} hours`;
}

/** The note of the sky from a black hole, worded for the moment (the hole's motion, the Sun's distance). */
function holeSkyNote(ref: TargetRef): string {
  const sky = holeSky(ref.id);
  if (!sky) return `Beyond ${ref.name}, looking back towards the Sun.`;
  const deg = (sky.ringRad * 360) / Math.PI;
  const across = deg < 1 ? deg.toPrecision(3) : deg.toFixed(1);
  const moon = ref.id === SGR_A ? '' : ', the size of the full Moon in our sky';
  const dust = ref.id === SGR_A ? ' (in visible light that dust takes away about 30 magnitudes)' : '';
  // A hole drawn at rest relative to the Sun (Sgr A*, M87*, OGLE-2011-BLG-0462) is a model there: really it moves
  // across the line at v, and the ring opens once the line has moved the Sun's radius, R☉ / v later.
  const held =
    sky.ringHoldsS < RING_HOLDS_RUNNING_S
      ? ` The clock is paused at the alignment: running, the hole’s motion would carry that line off the Sun within ${spanText(sky.ringHoldsS)}, and the ring would open into two arcs, then two points fading as they part.`
      : ref.id === SGR_A
        ? ` The hole is held at rest relative to the Sun here, so the ring holds with the clock running; really the Sun’s orbit round the Galaxy carries it across that line at ${SGR_A_ACROSS_KM_S} km/s, and the ring would open into two arcs within ${spanText(SUN_RADIUS_KM / SGR_A_ACROSS_KM_S)}.`
        : ' Here the hole is drawn with no motion across that line relative to the Sun, so the ring holds with the clock running; really its motion and the Sun’s carry the line off the Sun, and the ring would open into two arcs within hours.';
  // The full Moon's size at the scenes' 50° field of view: a few pixels.
  const point = ' At this field of view a ring that size is only a few pixels across, so it shows as a bright point.';
  // Near Sgr A* the view is stopped down for the cluster's glare (render/lens/skyMeter.ts): the ring shows only a few
  // levels above the sky (measured 29 September 2026: 135 against 130 out of 255).
  const glare = ref.id === SGR_A ? ' Here the light of the stars round the centre fills the sky, and the view is stopped down for its glare, so the ring can barely be picked out in it.' : '';
  const flow = hasFlow(ref.id) ? ` ${FLOW_OFF}` : '';
  return `The Sun, ${lightYearsText(sky.sunBehindKm)} behind ${theName(ref.name)}, bent round it into a ring ${across}° across${moon}, shining at magnitude ${minus(sky.ringMag.toFixed(1))} without the dust in between${dust}. You hover ${hoverDistanceText(sky.cameraKm)} beyond the hole, on the line along which the Sun’s light reaches it.${point}${glare}${held}${flow}`;
}
