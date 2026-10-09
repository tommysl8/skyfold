/**
 * The thirteen bodies built into the app, registered first: the Sun, the planets, the Moon,
 * Pluto (on its system's barycentre), Voyager 1 and Proxima Centauri. Their numbers are in
 * physics/constants.ts; this file says where each one is, how it turns and how it looks.
 */
import { Body } from 'astronomy-engine';
import {
  AU_KM,
  BODIES,
  GM_SOLAR_SYSTEM_KM3_S2,
  PROXIMA_DEC_DEG,
  PROXIMA_DISTANCE_KM,
  PROXIMA_RA_DEG,
  PROXIMA_TEFF_K,
  PROXIMA_VMAG,
  SATURN_RING_INNER_KM,
  SATURN_RING_OUTER_KM,
  SUN_TEFF_K,
  SUN_VMAG_AT_1AU,
  type BodyData,
  type CoreBodyId,
} from '../../physics/constants';
import { engineRotation, moonProvider, planetProvider, policyAvailability, sunProvider, type EnginePlanet } from './providers/engine';
import { atCentreProvider, fixedStarProvider, VOYAGER1_MODEL_START_MS, voyager1Provider } from './providers/simple';
import { registerBodies } from './registry';
import type { BodyRecord, BodyVisual, PositionProvider, RotationSpec } from './types';

/** The Pluto–Charon barycentre: astronomy-engine's (and JPL's @9) "Pluto". Pluto and its moons are placed about it. */
export const PLUTO_BARYCENTRE = 'pluto-barycentre';

/**
 * Textures: Solar System Scope (CC BY 4.0), except Pluto: NASA/JHUAPL/SwRI New Horizons global
 * colour mosaic (public domain). Its left edge is longitude 0, so it is offset by half a turn;
 * the southern latitudes New Horizons never saw are filled procedurally.
 */
const VISUALS: Record<CoreBodyId, BodyVisual> = {
  sun: { renderer: 'sun', map: '2k_sun.jpg' },
  mercury: { map: '2k_mercury.jpg' },
  venus: { map: '2k_venus_atmosphere.jpg', atmo: '#ffe7b8', atmoStrength: 0.3 },
  earth: {
    map: '2k_earth_daymap.jpg',
    night: '2k_earth_nightmap.jpg',
    clouds: '2k_earth_clouds.jpg',
    atmo: '#5f9dff',
    atmoStrength: 0.75,
  },
  moon: { map: '2k_moon.jpg' },
  mars: { map: '2k_mars.jpg', atmo: '#e9a07c', atmoStrength: 0.18 },
  jupiter: { map: '2k_jupiter.jpg', banded: true, atmo: '#f3e2c7', atmoStrength: 0.18 },
  saturn: {
    map: '2k_saturn.jpg',
    banded: true,
    atmo: '#f1e3bf',
    atmoStrength: 0.16,
    rings: { kind: 'texture', texture: '2k_saturn_ring_alpha.png', innerKm: SATURN_RING_INNER_KM, outerKm: SATURN_RING_OUTER_KM, shadow: true },
  },
  uranus: { map: '2k_uranus.jpg', banded: true, atmo: '#c4f4f7', atmoStrength: 0.28 },
  neptune: { map: '2k_neptune.jpg', banded: true, atmo: '#8fa8ff', atmoStrength: 0.3 },
  pluto: { map: 'pluto_nh_color.jpg', lonOffset: 0.5, fillBlack: true },
  voyager1: { renderer: 'spacecraft' },
  proxima: { renderer: 'star' },
};

/** Keys that go there. */
const KEYS: Partial<Record<CoreBodyId, string>> = {
  sun: '0',
  mercury: '1',
  venus: '2',
  earth: '3',
  mars: '4',
  jupiter: '5',
  saturn: '6',
  uranus: '7',
  neptune: '8',
  pluto: '9',
  moon: 'M',
  voyager1: 'V',
};

/** Which label wins where two overlap (lower first). */
const LABEL_RANK: Record<CoreBodyId, number> = {
  sun: 0,
  jupiter: 1,
  saturn: 2,
  earth: 3,
  venus: 4,
  mars: 5,
  uranus: 6,
  neptune: 7,
  mercury: 8,
  pluto: 9,
  moon: 10,
  voyager1: 11,
  proxima: 12,
};

const ALIASES: Partial<Record<CoreBodyId, string[]>> = {
  sun: ['Sol', 'our star'],
  venus: ['morning star', 'evening star'],
  earth: ['home', 'Terra'],
  moon: ['Luna'],
  mars: ['red planet'],
  jupiter: ['Jove'],
  pluto: ['134340'],
  voyager1: ['Voyager', 'V1'],
  proxima: ['Alpha Centauri C', 'nearest star', 'Proxima Cen'],
};

/** The Learn article that tells each body's story (moons: the article on moons, by default in bodyArticles.ts). */
const ARTICLES: Partial<Record<CoreBodyId, string>> = {
  sun: 'what-stars-are-made-of',
  // Le Verrier found Neptune from its pull on Uranus; Mercury's perihelion was the first crack in Newton.
  mercury: 'clockwork-and-chaos',
  neptune: 'clockwork-and-chaos',
  jupiter: 'worlds-around-worlds',
  saturn: 'worlds-around-worlds',
  pluto: 'edges-of-the-solar-system',
  voyager1: 'edges-of-the-solar-system',
  proxima: 'how-far-are-the-stars',
};

const FACT_SHEETS = 'NASA Planetary Fact Sheets (NSSDCA)';

/**
 * How far to trust each built-in body's position, for the card and the data sheet: the date
 * policy of ephemerisPolicy.ts in words (the card also flags an illustrative date by itself).
 */
const PLANET_POSITION =
  'Position: VSOP87 via astronomy-engine in 1700–2200, within about an arcminute of JPL’s DE405; JPL’s approximate orbital elements (Standish) in 3000 BCE–3000 CE outside that, good to about half a degree; beyond, illustrative: the orbit is right, the place along it is not.';
const POSITION_NOTES: Partial<Record<CoreBodyId, string>> = {
  sun: 'Position: the centre of the app’s frame; every other position is measured from the Sun’s centre.',
  moon: 'Position: Brown’s lunar theory via astronomy-engine, within about an arcminute in 1700–2200 and less exact further out; beyond 3000 BCE–3000 CE its mean orbit, illustrative.',
  pluto:
    'Position: the Pluto–Charon barycentre (astronomy-engine in 1700–2200, JPL’s approximate elements to 3000 BCE–3000 CE, illustrative beyond); Pluto’s own swing about it, about 2,100 km, arrives with the moon data.',
  voyager1: 'Position: a JPL Horizons state (2026) carried as a two-body orbit about the Solar System’s centre of mass, until its fitted trajectory loads.',
  proxima: 'Position: its catalogue place (Gaia DR3), without its motion, until the star catalogue loads.',
};

/** What else is a model in how the built-in bodies are drawn (their maps), one line each. */
const MODEL_NOTES: Partial<Record<CoreBodyId, string[]>> = {
  sun: ['Surface: an illustrative map (Solar System Scope), not the Sun as it is today.'],
  venus: ['Clouds: an illustrative map (Solar System Scope); the real cloud tops race round the planet every four days.'],
  earth: ['Clouds: one fixed map (Solar System Scope), not today’s weather.'],
  jupiter: ['Clouds: one fixed map (Solar System Scope); the real bands drift and change.'],
  saturn: ['Clouds: one fixed map (Solar System Scope); the real bands drift and change.'],
  uranus: ['Surface: an illustrative map (Solar System Scope) of a nearly featureless planet.'],
  neptune: ['Surface: an illustrative map (Solar System Scope); its dark storms come and go over a few years.'],
  pluto: ['Map: New Horizons’ 2015 global mosaic; the southern latitudes it never saw are filled in.'],
};

function physical(d: BodyData): BodyRecord['physical'] {
  return {
    radiusKm: d.radiusKm,
    equatorialRadiusKm: d.equatorialRadiusKm,
    polarRadiusKm: d.polarRadiusKm,
    gmKm3S2: d.gmKm3S2,
    siderealRotationH: d.siderealRotationH,
    solarDayH: d.solarDayH,
    orbitalPeriodD: d.orbitalPeriodD,
    semiMajorAxisKm: d.semiMajorAxisKm,
    obliquityDeg: d.obliquityDeg,
    geometricAlbedo: d.geometricAlbedo,
    colour: d.color,
  };
}

function core(id: CoreBodyId, provider: PositionProvider, rotation: RotationSpec | undefined, extra: Partial<BodyRecord> = {}): BodyRecord {
  const d = BODIES[id];
  return {
    id,
    name: d.name,
    aliases: ALIASES[id] ?? [],
    kind: d.kind,
    parent: d.parent ?? 'sun',
    physical: physical(d),
    rotation,
    visual: VISUALS[id],
    facts: d.facts,
    dataSource: FACT_SHEETS,
    provider,
    key: KEYS[id],
    labelRank: LABEL_RANK[id],
    article: ARTICLES[id],
    positionNote: POSITION_NOTES[id] ?? (d.kind === 'planet' ? PLANET_POSITION : undefined),
    modelNotes: MODEL_NOTES[id],
    ...extra,
  };
}

const engine = (body: Body, lockedToMoon = false): RotationSpec => ({ model: 'provider', provider: engineRotation(body, lockedToMoon) });

const PLANETS: [CoreBodyId & EnginePlanet, Body][] = [
  ['mercury', Body.Mercury],
  ['venus', Body.Venus],
  ['earth', Body.Earth],
];
const OUTER: [CoreBodyId & EnginePlanet, Body][] = [
  ['mars', Body.Mars],
  ['jupiter', Body.Jupiter],
  ['saturn', Body.Saturn],
  ['uranus', Body.Uranus],
  ['neptune', Body.Neptune],
];

/** The built-in bodies' records, in registration order. */
export function coreBodyRecords(): BodyRecord[] {
  const barycentre = planetProvider('pluto');
  return [
    core('sun', sunProvider, engine(Body.Sun), {
      parent: null,
      kindText: 'Our star',
      // Variable: shown at another age, its light and colour change (sim/stars/sunFuture.ts).
      physical: { ...physical(BODIES.sun), luminous: { vmag: SUN_VMAG_AT_1AU, atKm: AU_KM, teffK: SUN_TEFF_K, variable: true } },
      framing: { radii: 5 },
      orbitLine: false,
      detector: true,
      dataSource: 'IAU 2015 nominal values; NASA Sun Fact Sheet',
    }),
    ...PLANETS.map(([id, b]) => core(id, planetProvider(id), engine(b))),
    core('moon', moonProvider, engine(Body.Moon, true)),
    ...OUTER.map(([id, b]) => core(id, planetProvider(id), engine(b), id === 'saturn' ? { framing: { radii: 9 } } : {})),
    {
      id: PLUTO_BARYCENTRE,
      name: 'Pluto–Charon barycentre',
      kind: 'barycentre',
      parent: 'sun',
      physical: { radiusKm: 0, colour: BODIES.pluto.color },
      provider: barycentre,
      orbitLine: false,
      detector: false,
      destination: false,
    },
    // Pluto sits on the barycentre until an orbit model for it (and Charon) is registered.
    core('pluto', atCentreProvider({ availability: policyAvailability, positionAt: () => {} }, 'On the Pluto–Charon barycentre (astronomy-engine)'), engine(Body.Pluto), {
      centre: PLUTO_BARYCENTRE,
    }),
    core('voyager1', voyager1Provider, undefined, {
      framing: { distanceKm: 0.03, minKm: 0.004 },
      orbitLine: { muKm3S2: GM_SOLAR_SYSTEM_KM3_S2, trailFromMs: VOYAGER1_MODEL_START_MS },
      dataSource: 'Trajectory: JPL Horizons',
    }),
    core('proxima', fixedStarProvider(PROXIMA_RA_DEG, PROXIMA_DEC_DEG, PROXIMA_DISTANCE_KM), undefined, {
      parent: null,
      shortName: 'Proxima',
      physical: { ...physical(BODIES.proxima), luminous: { vmag: PROXIMA_VMAG, atKm: PROXIMA_DISTANCE_KM, teffK: PROXIMA_TEFF_K } },
      framing: { radii: 5 },
      orbitLine: false,
      detector: true,
      dataSource: 'Gaia DR3; Boyajian et al. 2012',
    }),
  ];
}

let registered = false;

/** Register the built-in bodies (once). */
export function registerCoreBodies(): void {
  if (registered) return;
  registered = true;
  registerBodies(coreBodyRecords());
}
