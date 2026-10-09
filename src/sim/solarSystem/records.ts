/**
 * The complete Solar System as registry records: 25 moons on their fitted orbit models, Pluto
 * on its own orbit about the Pluto–Charon barycentre, and the dwarf planets, trans-Neptunian
 * objects, comets, interstellar objects and spacecraft on their Chebyshev tracks, with the
 * sizes, rotation models, maps, shapes, rings, facts and discovery notes of bodies.json.
 *
 * Pure: `solarSystemRecords` turns the parsed data files into records (load.ts fetches them and
 * registers the result). The conventions are docs/bodies.md's:
 *  - Time: AstroTime.tt is passed to both evaluators as TDB days (TT and TDB differ by 2 ms).
 *  - Moons of Mars … Neptune are placed about their planet; Charon, Nix and Hydra about the
 *    Pluto–Charon barycentre (parent Pluto), and Pluto itself gets its model with
 *    replaceBodies. The Galilean moons use the fitted models, not astronomy-engine's
 *    JupiterMoons (10 to 30 times further from JPL: docs/data/moons.md).
 *  - The tracks' `pluto` centre is the barycentre; `ssb` comes from barycentreFromSun, the same
 *    barycentre the tracks' extrapolated states were stored against.
 *  - Positions in the data are J2000 ecliptic km; velocities of the moon models are km/day.
 *  - Voyager 1 moves onto its track (replaceBodies), keeping its two-body extension after 2099
 *    (the track's own fallback, labelled extrapolated).
 *
 * Jumps in the tracks (where Horizons joins separately fitted files, or a comet moves from one
 * JPL solution to the next: up to 126,500 km, Pioneer 10 in 1983) are kept exactly as the data
 * have them, with no smoothing. The app draws no trails of past positions: orbit lines are
 * osculating conics through where the body is now, so a jump moves the line with the body and
 * there is nothing to break. The marker steps only if a jump happens on screen, and it does not
 * show: at the time rates where a step could be seen the camera follows the body it looks at, and
 * seen from elsewhere the largest step, 126,500 km, spans under a pixel from further than about
 * 10⁸ km (a tenth of Jupiter's distance from the Sun), while the steps near planets are at most
 * 19,000 km, and happen weeks from the flybys (docs/data/tracks.md, "Jumps").
 */
import { DAY_S, GM_SOLAR_SYSTEM_KM3_S2, J2000_JD } from '../../physics/constants';
import {
  ALWAYS,
  PLUTO_BARYCENTRE,
  moonState,
  policyAvailability,
  relativeOrbitProvider,
  trackProvider,
  ttDaysFromMs,
  type Availability,
  type BodyKind,
  type BodyRecord,
  type BodyVisual,
  type PositionProvider,
  type RingArcs,
  type RingSpec,
  type RotationSpec,
} from '../bodies';
import { moonRegime, type MoonModel } from '../moonModels';
import type { BodyIndex, Tracks } from '../tracks';
import { barycentreFromSun } from '../voyager';
import { Vector3 } from 'three';
import type { BodiesFile, DataBody, DataRing, DataRotation, RingSystem, RingsFile } from './data';
import { visitorFact, VISITORS } from './interstellar';

export interface SolarSystemData {
  bodies: BodiesFile;
  rings: RingsFile;
  /** moons.json indexed by id (indexMoonCatalog). */
  moons: Record<string, MoonModel>;
  tracks: Tracks;
}

/** The built-in records this data enriches (read from the registry by the caller). */
export interface CoreRecords {
  pluto: BodyRecord;
  voyager1: BodyRecord;
  jupiter: BodyRecord;
  uranus: BodyRecord;
  neptune: BodyRecord;
}

// ─── Small helpers ──────────────────────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "20 August 1977" from an ISO date (or "1705", "June 2005" for partial dates). */
export function longDate(iso: string): string {
  const m = iso.match(/^(-?\d{1,5})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  if (!mo) return y;
  if (!d) return `${MONTHS[Number(mo) - 1]} ${y}`;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
}

/** Calendar year of a TDB day number (days since J2000), good to a day. */
function yearOf(tdbDays: number): number {
  return new Date(Date.UTC(2000, 0, 1, 12) + tdbDays * 86_400_000).getUTCFullYear();
}

/** Two significant figures, grouped: 39.68 → "40", 1482 → "1,500", 0.6 → "0.6". */
export function twoFigures(x: number): string {
  const v = Number(x.toPrecision(2));
  return v >= 1000 ? v.toLocaleString('en-GB') : String(v);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];

/** Names people type, beyond the one in the data. */
const ALIASES: Record<string, string[]> = {
  halley: ['1P/Halley', 'Comet Halley', 'Halley', '1P'],
  encke: ['2P/Encke', 'Encke’s Comet', 'Encke', '2P'],
  'churyumov-gerasimenko': ['67P', 'Comet 67P', 'Churyumov–Gerasimenko', 'Rosetta’s comet'],
  'hale-bopp': ['C/1995 O1', 'Hale–Bopp', 'Hale Bopp'],
  oumuamua: ['ʻOumuamua', 'Oumuamua', '1I', '1I/2017 U1'],
  borisov: ['Borisov', 'Comet Borisov', '2I', '2I/2019 Q4'],
  'atlas-3i': ['3I', 'ATLAS', 'C/2025 N1'],
  ceres: ['1 Ceres'],
  vesta: ['4 Vesta'],
  eris: ['136199 Eris'],
  haumea: ['136108 Haumea'],
  makemake: ['136472 Makemake'],
  gonggong: ['2007 OR10', '225088 Gonggong'],
  quaoar: ['50000 Quaoar'],
  sedna: ['90377 Sedna'],
  orcus: ['90482 Orcus'],
  arrokoth: ['2014 MU69', 'Ultima Thule', '486958 Arrokoth'],
  voyager2: ['V2'],
  'new-horizons': ['NH'],
  pioneer10: ['Pioneer', 'Pioneer F'],
  'parker-solar-probe': ['Parker', 'PSP', 'Solar Probe Plus'],
  jwst: ['JWST', 'Webb', 'James Webb'],
};

/** What some bodies are, in a few words, where the kind alone says too little. */
const KIND_TEXT: Record<string, string> = {
  halley: 'Comet 1P/Halley',
  encke: 'Comet 2P/Encke',
  'hale-bopp': 'Comet C/1995 O1',
  borisov: 'Interstellar comet',
  'atlas-3i': 'Interstellar comet',
};

/**
 * Comets whose coma and tails are drawn (the interstellar comets had them too; ʻOumuamua showed none), with the
 * magnitude law that sets how strong and long they are: total magnitude M1 + 5 log10 Δ + K1 log10 r, from JPL's
 * Small-Body Database (retrieved 2026-10-09; Halley's from the ICQ Comet Handbook 2005, the others fitted with JPL's
 * orbit solutions: Encke K273/21, 67P K284/1, Hale–Bopp 226, Borisov 54, 3I/ATLAS 54).
 */
const TAILS: Record<string, { m1: number; k1: number }> = {
  halley: { m1: 5.5, k1: 8 },
  encke: { m1: 15.7, k1: 4.5 },
  'churyumov-gerasimenko': { m1: 12.9, k1: 7.5 },
  'hale-bopp': { m1: 4.8, k1: 4 },
  borisov: { m1: 13.8, k1: 4.5 },
  'atlas-3i': { m1: 12.5, k1: 4.5 },
};

/** Shorter names for labels. */
const SHORT: Record<string, string> = {
  halley: 'Halley',
  encke: 'Encke',
  'churyumov-gerasimenko': '67P',
  'hale-bopp': 'Hale–Bopp',
  jwst: 'Webb',
  'parker-solar-probe': 'Parker',
};

/**
 * The Learn article that tells each body's story. Moons default to the article on moons
 * (bodyArticles.ts); Ceres and Vesta are in no article.
 */
function articleOf(b: DataBody): string | undefined {
  if (b.parent === 'pluto') return 'edges-of-the-solar-system';
  if (b.kind === 'moon') return undefined;
  if (b.kind === 'comet') return 'clockwork-and-chaos';
  if (b.kind === 'interstellar' || b.kind === 'tno') return 'edges-of-the-solar-system';
  if (b.kind === 'dwarf-planet') return b.id === 'ceres' ? undefined : 'edges-of-the-solar-system';
  switch (b.id) {
    case 'voyager1':
    case 'voyager2':
    case 'new-horizons':
      return 'edges-of-the-solar-system';
    case 'pioneer10':
      return 'how-big-is-the-solar-system';
    case 'parker-solar-probe':
      return 'rockets-to-the-stars';
    case 'jwst':
      return 'other-worlds';
  }
  return undefined;
}

/**
 * The registry kind. The data's `tno` is not one: the large trans-Neptunian objects the IAU
 * has not classified are listed with the dwarf planets as candidates (and say so), Arrokoth
 * with the asteroids as a Kuiper belt object.
 */
function kindOf(b: DataBody): { kind: BodyKind; kindText?: string } {
  switch (b.kind) {
    case 'tno':
      return b.dwarfPlanetCandidate ? { kind: 'dwarf-planet', kindText: 'Dwarf planet candidate' } : { kind: 'asteroid', kindText: 'Kuiper belt object' };
    case 'asteroid':
      return { kind: 'asteroid' };
    case 'spacecraft':
      return b.id === 'jwst' ? { kind: 'spacecraft', kindText: 'Space telescope' } : { kind: 'spacecraft' };
    default:
      return { kind: b.kind };
  }
}

// ─── Rotation ───────────────────────────────────────────────────────────────────────────

/**
 * Tumblers with no predictive model: the rates and cone are illustrative, chosen from what was
 * seen (Halley: a long axis precessing every ~3.7 d while spinning about itself every ~7.1 d,
 * Belton et al. 1991; Hyperion: turning roughly about its long axis, the axis wandering over
 * weeks). Both shape models have the long axis along z.
 */
const TUMBLES: Record<string, { periodH: number; precessionH: number; coneDeg: number }> = {
  halley: { periodH: 7.1 * 24, precessionH: 3.7 * 24, coneDeg: 60 },
  // ʻOumuamua: its long axis turning end over end every 8.67 h, the light curve's main period, and wobbling every
  // 54.48 h, its likeliest second period (Belton et al. 2018, ApJL 856, L21); the cone is illustrative.
  oumuamua: { periodH: 8.67, precessionH: 54.48, coneDeg: 25 },
  hyperion: { periodH: 5 * 24, precessionH: 21 * 24, coneDeg: 30 },
};

/** A bodies.json rotation record as a registry rotation model (undefined: none). */
export function rotationOf(b: DataBody, phaseAngles: BodiesFile['phaseAngles']): RotationSpec | undefined {
  const r = b.rotation;
  switch (r.model) {
    case 'iau-2015':
    case 'fitted':
      return {
        model: 'iau',
        poleRaDeg: r.poleRaDeg!,
        poleDecDeg: r.poleDecDeg!,
        pmDeg: r.pmDeg!,
        phaseAngles: r.phaseSystem ? phaseAngles[r.phaseSystem] : undefined,
        raTerms: r.raTerms,
        decTerms: r.decTerms,
        pmTerms: r.pmTerms,
      };
    case 'snapshot':
      // The pole from the 2015 images, the spin at the known period with an arbitrary phase.
      return { model: 'spin', periodH: r.periodH!, poleRaDeg: r.poleRaDeg![0], poleDecDeg: r.poleDecDeg![0] };
    case 'period-only':
      return r.periodH ? { model: 'spin', periodH: r.periodH } : undefined;
    case 'chaotic':
    case 'complex': {
      const t = TUMBLES[b.id];
      if (t) return { model: 'tumble', ...t };
      return r.periodH ? { model: 'spin', periodH: r.periodH } : undefined;
    }
    default:
      // unknown (no rotation drawn); attitude-controlled (the renderer points the craft).
      return undefined;
  }
}

/** One line on the rotation model, when it is not simply the IAU one. */
function rotationNote(b: DataBody, name: string): string | null {
  const r = b.rotation;
  switch (r.model) {
    case 'fitted':
      return b.id === 'haumea'
        ? 'Rotation phase from the 2017 occultation: good to about 5° in 2026, less further away.'
        : `Rotation phase good near January 2019; it drifts by tens of degrees a decade away from it.`;
    case 'snapshot':
      return `Rotation illustrative: the pole is the one seen in July 2015, and ${name} tumbles chaotically.`;
    case 'period-only':
      return b.id === 'eris'
        ? 'Rotation illustrative: Eris turns once per orbit of its moon Dysnomia (15.8 days), about a pole not known.'
        : 'Rotation illustrative: the period is known, the pole is not.';
    case 'chaotic':
      return `Rotation illustrative: ${name} tumbles chaotically, and no model predicts which way it faces.`;
    case 'complex':
      return `Rotation illustrative: ${name} tumbles, and no model predicts which way it faces.`;
    case 'unknown':
      return 'Rotation not known: drawn without spin.';
    default:
      return null;
  }
}

// ─── Visuals ────────────────────────────────────────────────────────────────────────────

/** Faint rings get at least this opacity (scaled down by optical depth), so they can be seen. */
const FAINT_RING_FLOOR = 0.1;
/** …and at least this luminance (linear), since the dusty ones are as dark as soot (albedo 0.015). */
const FAINT_RING_LUMINANCE = 0.22;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** The same hue, lifted to at least `minLum` linear luminance (sRGB hex in and out). */
export function lighten(hex: string, minLum: number): string {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255));
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  if (lum >= minLum || lum <= 0) return hex;
  const k = minLum / lum;
  return `#${rgb.map((v) => Math.round(255 * toSrgb(Math.min(1, v * k))).toString(16).padStart(2, '0')).join('')}`;
}

/** A ring's edges, km. */
function ringExtent(r: DataRing): { innerKm: number; outerKm: number } {
  if (r.innerKm !== undefined && r.outerKm !== undefined) return { innerKm: r.innerKm, outerKm: r.outerKm };
  const w = r.widthKm ?? 1;
  return { innerKm: r.radiusKm! - w / 2, outerKm: r.radiusKm! + w / 2 };
}

/**
 * A ring system as bands: opacity 1 − e^(−τ) from the normal optical depth (the apparent one
 * where only that was measured; 10⁻⁴ where none was, as for Neptune's Arago and Galatea rings).
 * Rings too faint to see at all (Jupiter's, τ ~ 10⁻⁶; Neptune's dusty ones) are drawn more
 * visible than they are: at least FAINT_RING_FLOOR × (τ/τ_max)^½ opaque, which keeps the
 * fainter ones fainter, and lightened to FAINT_RING_LUMINANCE. The dense rings (Uranus's,
 * Haumea's) keep their real opacity and colour. `boosted` says whether any ring was lifted.
 */
export function ringSpec(sys: RingSystem): { spec: RingSpec; boosted: boolean } {
  const tau = (r: DataRing) => r.opticalDepth ?? r.opticalDepthApparent ?? 1e-4;
  const tauMax = Math.max(...sys.rings.map(tau));
  let boosted = false;
  const bands = sys.rings.map((r) => {
    const t = tau(r);
    const physical = 1 - Math.exp(-t);
    const floor = FAINT_RING_FLOOR * Math.sqrt(t / tauMax);
    const lifted = floor > 1.5 * physical;
    if (lifted) boosted = true;
    return { ...ringExtent(r), opacity: Math.max(physical, floor), colour: lifted ? lighten(r.colour, FAINT_RING_LUMINANCE) : r.colour };
  });
  const spec: RingSpec = { kind: 'bands', bands };
  const plane = sys.plane;
  if (plane !== 'parent-equator' && plane.poleRaDeg !== null && plane.poleDecDeg !== null) spec.pole = { raDeg: plane.poleRaDeg, decDeg: plane.poleDecDeg };
  const withArcs = sys.rings.find((r) => r.arcs);
  if (withArcs?.arcs) {
    const a = withArcs.arcs;
    const ext = ringExtent(withArcs);
    const arcs: RingArcs = {
      ...ext,
      // Denser than their ring by τ_arc/τ_ring, shown with the same compression as the rings.
      opacity: Math.max(1 - Math.exp(-(a.opticalDepth ?? 0.1)), Math.min(1, FAINT_RING_FLOOR * Math.sqrt((a.opticalDepth ?? 0.1) / tauMax))),
      // As dark as the ring they are in, and lifted the same way when it is.
      colour: boosted ? lighten(withArcs.colour, FAINT_RING_LUMINANCE) : withArcs.colour,
      spans: a.list.slice(0, 8).map((s) => [s.fromDeg, s.toDeg] as const),
      meanMotionDegPerDay: a.meanMotionDegPerDay,
      // The arcs' absolute phase is not modelled (rings.json): an arbitrary one.
      phaseDeg: 0,
    };
    spec.arcs = arcs;
  }
  return { spec, boosted };
}

function visualOf(b: DataBody, rings: RingsFile): BodyVisual {
  if (b.kind === 'spacecraft') return { renderer: 'spacecraft', craft: b.id === 'jwst' ? 'jwst' : b.id === 'parker-solar-probe' ? 'parker' : 'probe' };
  const v: BodyVisual = {};
  const tex = b.assets.texture;
  const info = b.assets.textureInfo;
  if (tex && info) {
    v.map = tex;
    v.mapChannels = info.channels;
    // Greyscale maps tinted with the body's hue at full brightness.
    if (info.channels === 1) v.mapTint = b.colourHue;
  }
  if (b.assets.model) v.shape = b.assets.model;
  if (b.id === 'titan') {
    // In visible light Titan is a featureless orange haze: the 938 nm surface map shows faintly through it.
    v.atmo = '#e0a050';
    v.atmoStrength = 0.55;
    v.mapMix = 0.3;
  }
  if (TAILS[b.id]) {
    v.tails = true;
    v.tailMagnitudes = TAILS[b.id];
  }
  const ringRef = b.assets.rings?.split('#')[1];
  const sys = ringRef ? rings.systems.find((s) => s.parent === ringRef) : undefined;
  if (sys) v.rings = ringSpec(sys).spec;
  return v;
}

/** The largest distance of each shape model's surface from its centre, km (the LSM1 headers; a test checks them). */
export const SHAPE_MAX_RADIUS_KM: Record<string, number> = {
  phobos: 13.931,
  deimos: 8.707,
  hyperion: 187.758,
  proteus: 232.5,
  nix: 25,
  hydra: 32.5,
  vesta: 292.58,
  haumea: 1161,
  arrokoth: 19.492,
  halley: 8.909,
  'churyumov-gerasimenko': 2.644,
};

/** Where each shape model comes from (docs/data/assets.md, §3). */
const SHAPE_SOURCES: Record<string, string> = {
  phobos: 'R. Gaskell’s model from Viking and Phobos 2 images',
  deimos: 'P. Thomas’s model from Viking images',
  hyperion: 'P. Thomas’s model from Voyager 2 images',
  proteus: 'P. Stooke’s model from Voyager 2 images',
  halley: 'P. Stooke’s model from the Giotto and Vega images of 1986',
  vesta: 'the DLR terrain model from Dawn',
  arrokoth: 'the New Horizons model (Porter et al. 2024)',
  'churyumov-gerasimenko': 'the Rosetta model by R. Gaskell, L. Jorda and colleagues (SHAP5)',
};

/** Notes on how the body is drawn: its map, shape, colour and size. */
function drawingNotes(b: DataBody): string[] {
  const out: string[] = [];
  const info = b.assets.textureInfo;
  if (b.kind === 'spacecraft') {
    out.push(
      b.id === 'jwst'
        ? 'Drawn as a simple sunshield and mirror at Webb’s size, sunshield towards the Sun.'
        : b.id === 'parker-solar-probe'
          ? 'Drawn as a simple heat shield and bus at Parker’s size, shield towards the Sun.'
          : b.id === 'voyager1' || b.id === 'voyager2'
            ? 'Drawn as a simplified Voyager, its dish pointed at Earth.'
            : `Drawn as a generic probe at ${b.name}’s size, its dish pointed at Earth.`,
    );
    return out;
  }
  if (!b.assets.texture) {
    const measured = !b.colourSource.startsWith('No disk-integrated colour');
    out.push(measured ? 'No surface map exists: shown in its measured colour.' : 'No surface map exists: shown in neutral grey at its albedo (its colour has not been measured).');
  } else if (info) {
    if (b.id === 'titan') out.push('The surface map is Titan at 938 nm, seen through the haze, shown faintly: to the eye Titan is a featureless orange ball.');
    else if (b.id === 'ganymede') out.push('Surface map in enhanced colour.');
    else if (b.id === 'triton') out.push('Surface map in enhanced colour (orange, violet and ultraviolet filters).');
    else if (b.id === 'iapetus') out.push('Surface map brightness evened out: the dark side is darker than shown.');
    const imaged = info.imagedFraction ?? 1;
    if (imaged < 0.95) out.push(`${Math.round(imaged * 100)}% of the surface has been imaged; the rest of the map is a flat fill.`);
  }
  if (b.assets.model) {
    if (b.id === 'nix' || b.id === 'hydra') out.push('Shape: the ellipsoid measured by New Horizons (Weaver et al. 2016).');
    else if (b.id === 'haumea') out.push('Shape: the ellipsoid from the 2017 occultation (Ortiz et al. 2017).');
    else out.push(`Shape: ${SHAPE_SOURCES[b.id] ?? 'a published shape model'}, simplified to 4,000 triangles.`);
  }
  if (b.radiusType === 'placeholder') out.push('Size uncertain: only its order of magnitude is known.');
  if (b.id === 'quaoar') out.push('Ring plane assumed (Quaoar’s pole is not known); the faint Q2R ring is drawn more opaque than it is.');
  return out;
}

// ─── Positions ──────────────────────────────────────────────────────────────────────────

/**
 * A fitted moon (or Pluto about the barycentre): position and velocity in one pass
 * (moonState, bit-identical to the evaluator's positions), allocation-free.
 */
export function fittedMoonProvider(m: MoonModel): PositionProvider {
  const spareVel: [number, number, number] = [0, 0, 0];
  return relativeOrbitProvider(
    {
      position: (t, out) => moonState(m, t, out, spareVel),
      state: (t, pos, vel) => moonState(m, t, pos, vel),
      regime: (t) => moonRegime(m, t),
    },
    { velocityUnit: 'km/day', label: `Orbit model fitted to JPL Horizons (${m.horizons.ephemeris.toUpperCase()})` },
  );
}

/** The registry body for each track centre ('sun' is the origin, 'ssb' is resolved apart). */
export const TRACK_CENTRES: Record<string, string> = {
  earth: 'earth',
  venus: 'venus',
  jupiter: 'jupiter',
  saturn: 'saturn',
  uranus: 'uranus',
  neptune: 'neptune',
  // The tracks' 'pluto' is Horizons @9, the Pluto–Charon barycentre, not Pluto's body.
  pluto: PLUTO_BARYCENTRE,
  arrokoth: 'arrokoth',
};

const ssbWorld = new Vector3();
/** Heliocentric J2000 ecliptic km of the Solar System barycentre (the tracks' 'ssb'). */
function ssbEcliptic(time: Parameters<typeof barycentreFromSun>[0], out: { x: number; y: number; z: number }): void {
  const w = barycentreFromSun(time, ssbWorld);
  out.x = w.x;
  out.y = -w.z;
  out.z = w.y;
}

/** The last day of a track's precise span, as an ISO date. */
const preciseEndIso = (info: BodyIndex): string => ((info.preciseIso as string[] | undefined)?.[1] ?? '').slice(0, 10);

/** TT days of a UTC time, remembered for the last time asked (availability is asked for every body at the frame's time). */
const ttMemo = { ms: NaN, tt: 0 };
function ttAt(ms: number): number {
  if (ms !== ttMemo.ms) {
    ttMemo.ms = ms;
    ttMemo.tt = ttDaysFromMs(ms);
  }
  return ttMemo.tt;
}

/** A track as a provider: exact positions (jumps kept), availability from the index alone. */
export function trackBodyProvider(tracks: Tracks, id: string, name: string, launchIso?: string): PositionProvider {
  const info = tracks.info(id);
  const notYet: Availability = {
    available: false,
    reason: `${name} had not been launched yet${launchIso ? `: it left Earth on ${longDate(launchIso.slice(0, 10))}` : ''}.`,
    regime: 'unknown',
  };
  const ended: Availability = {
    available: false,
    reason: `Where ${name} is after ${longDate(preciseEndIso(info))} is not known: its planned trajectory ends then.`,
    regime: 'unknown',
  };
  return trackProvider(
    { evaluate: (t, withVelocity) => tracks.sample(id, t, withVelocity), regime: (t) => tracks.regimeAt(id, t) },
    {
      name,
      centres: TRACK_CENTRES,
      ssb: ssbEcliptic,
      label: 'Chebyshev fit to JPL Horizons',
      availability(ms) {
        const t = ttAt(ms);
        const r = tracks.regimeAt(id, t);
        if (r === 'precise') return ALWAYS.precise;
        if (r === 'extrapolated') return ALWAYS.extrapolated;
        return t < info.precise[0] ? notYet : ended;
      },
    },
  );
}

/** Registry bodies a track reads (its centres), for `dependsOn`. */
function trackDependencies(tracks: Tracks, id: string): string[] {
  const info = tracks.info(id);
  const names = new Set<string>([...info.pieces.map((p) => p.centre), info.before.centre, info.after.centre]);
  const out = new Set<string>();
  for (const n of names) if (TRACK_CENTRES[n]) out.add(TRACK_CENTRES[n]);
  return [...out];
}

/** Pluto: its fitted orbit about the barycentre, trusted as far as the barycentre's model is too. */
function plutoProvider(m: MoonModel): PositionProvider {
  const inner = fittedMoonProvider(m);
  return {
    label: `${inner.label}, about astronomy-engine’s Pluto–Charon barycentre`,
    availability(ms) {
      const a = inner.availability(ms);
      const b = policyAvailability(ms);
      if (a.regime === 'illustrative' || b.regime === 'illustrative') return ALWAYS.illustrative;
      if (b.regime === 'approximate') return ALWAYS.approximate;
      return a;
    },
    positionAt: (time, pos, vel) => inner.positionAt(time, pos, vel),
  };
}

// ─── Notes on accuracy ──────────────────────────────────────────────────────────────────

function moonPositionNote(m: MoonModel): string {
  const y0 = yearOf(m.window[0]);
  const y1 = yearOf(m.window[1] - 1e-6);
  return `Position: fitted to JPL Horizons, within ~${twoFigures(m.accuracy.maxKm)} km in ${y0}–${y1}; outside those years its mean orbit (illustrative).`;
}

function trackPositionNote(tracks: Tracks, id: string, kind: DataBody['kind']): string {
  const info = tracks.info(id);
  const acc = info.accuracy as { maxKm: number; flyby?: { maxKm: number } };
  const y0 = yearOf(info.precise[0]);
  const y1 = yearOf(info.precise[1] - 1e-6);
  const flyby = acc.flyby && kind === 'spacecraft' && id !== 'jwst' ? ` (within ${twoFigures(acc.flyby.maxKm)} km near its flybys)` : '';
  let after: string;
  if (info.after.regime === 'unknown') after = `; not modelled after ${longDate(preciseEndIso(info))}`;
  else if (kind === 'spacecraft') after = `; after ${y1} a two-body extrapolation`;
  else after = `; outside those years a two-body orbit (extrapolated)`;
  return `Position: fitted to JPL Horizons, within ~${twoFigures(acc.maxKm)} km${flyby} in ${y0}–${y1}${after}.`;
}

/** What the trajectory data are, where that matters (docs/data/tracks.md, "Known limits"). */
const TRACK_CAVEATS: Record<string, string> = {
  voyager1: 'Before 1981 JPL’s mission-design trajectory (“rough”, in JPL’s word); after 1992 a prediction from the 1981–1992 tracking.',
  voyager2: 'Before 29 August 1989 (the flybys included) JPL’s mission-design trajectory (“rough”); after 1992 a prediction from the tracking.',
  'new-horizons': 'A prediction after its tracking data end, on 20 July 2026.',
  pioneer10: 'JPL’s historical trajectory, for general purposes rather than precision; it steps by up to 126,500 km where files join.',
  'parker-solar-probe': 'Reconstructed to 27 January 2026, then NASA’s planning trajectory; no Venus flybys after 2030.',
  jwst: 'A prediction after 20 September 2026 (Goddard’s station-keeping plan), to September 2031.',
  encke: 'Where JPL’s orbit solutions hand over, at aphelion, the position steps by up to 13,300 km: the solutions differ by that much.',
  'churyumov-gerasimenko': 'Where JPL’s orbit solutions hand over, at aphelion, the position steps by up to 12,500 km: the solutions differ by that much.',
  arrokoth: 'Follows the New Horizons project orbit in 1995–2033 and JPL’s ground-based one outside it; they differ by 48,000–65,000 km at the switches.',
  oumuamua: 'Its small non-gravitational push is assumed outside the 2017 observations, so positions far from 2017 are much less certain.',
  'atlas-3i': 'An early orbit solution (observations to 19 February 2026): later ones may move it.',
};

// ─── Records ────────────────────────────────────────────────────────────────────────────

/** "Kiss et al. 2016" from a rotation's source line ("Kiss et al. 2016, MNRAS 457, 2908, https://…"). */
const shortSource = (s: string | undefined): string | null => (s ? s.split(',')[0].trim() || null : null);

/** Where a moon's rotation comes from, in the words of its model: only the IAU models are the IAU's. */
export function rotationSource(r: DataRotation): string {
  const src = shortSource(r.source);
  switch (r.model) {
    case 'iau-2015':
      return 'rotation: IAU WGCCRE 2015';
    case 'fitted':
      return `rotation: fitted${src ? ` (${src})` : ''}`;
    case 'snapshot':
      return `rotation: the pole and period seen in 2015${src ? ` (${src})` : ''}, at an illustrative phase`;
    case 'period-only':
      return `rotation: the period only${src ? ` (${src})` : ''}, about an assumed pole`;
    case 'chaotic':
    case 'complex':
      return 'rotation: an illustrative tumble (it cannot be predicted)';
    default:
      return 'rotation: not known';
  }
}

const moonDataSource = (b: DataBody): string => `Sizes and masses: JPL Solar System Dynamics; ${rotationSource(b.rotation)}; orbit fitted to JPL Horizons.`;

function common(b: DataBody, name = b.name): Omit<BodyRecord, 'id' | 'name' | 'kind' | 'parent' | 'provider' | 'physical'> & { physical: BodyRecord['physical'] } {
  const r = b.rotation;
  const retro = r.sense?.startsWith('retrograde');
  const extraAliases = ALIASES[b.id] ?? [];
  const aliases = [...extraAliases];
  if (b.kind === 'moon' && b.parent && b.naifId !== undefined) {
    const n = b.naifId % 100;
    if (ROMAN[n]) aliases.push(`${cap(b.parent)} ${ROMAN[n]}`);
  }
  const shape = b.assets.model ? SHAPE_MAX_RADIUS_KM[b.id] : undefined;
  const dims = b.dimensionsKm ? Math.max(...b.dimensionsKm) / 2 : undefined;
  const maxRadius = shape ?? dims;
  const kindText = kindOf(b).kindText;
  const notes = [rotationNote(b, name), ...drawingNotes(b)].filter((x): x is string => !!x);
  return {
    aliases,
    shortName: SHORT[b.id],
    kindText,
    physical: {
      radiusKm: b.radiusKm,
      radiusSigmaKm: b.radiusSigmaKm ?? undefined,
      radiusRough: b.radiusType === 'placeholder' || undefined,
      triaxialRadiiKm: b.triaxialRadiiKm,
      maxRadiusKm: maxRadius,
      gmKm3S2: b.gmKm3S2,
      massKg: b.massKg,
      geometricAlbedo: b.geometricAlbedo ?? undefined,
      semiMajorAxisKm: b.orbit?.aKm,
      orbitalPeriodD: b.orbit?.periodD,
      siderealRotationH: r.periodH !== undefined && (r.model === 'iau-2015' || r.model === 'fitted' || r.model === 'period-only' || r.model === 'snapshot') ? (retro ? -r.periodH : r.periodH) : undefined,
      colour: b.colour,
    },
    facts: b.facts,
    factSources: b.factSources,
    discovery: b.discovery,
    mission: b.spacecraft
      ? {
          launch: b.spacecraft.launch,
          vehicle: b.spacecraft.launchVehicle,
          site: b.spacecraft.launchSite,
          summary: b.spacecraft.mission,
          status: b.spacecraft.status,
          statusAsOf: b.spacecraft.statusAsOf,
          statusSource: b.spacecraft.statusSource,
        }
      : undefined,
    modelNotes: notes,
    article: articleOf(b),
  };
}

function moonRecord(b: DataBody, m: MoonModel, data: SolarSystemData): BodyRecord {
  const c = common(b);
  return {
    ...c,
    id: b.id,
    name: b.name,
    kind: 'moon',
    parent: b.parent!,
    // Pluto's moons are placed about the system's barycentre (the models are relative to it).
    centre: b.parent === 'pluto' ? PLUTO_BARYCENTRE : undefined,
    rotation: rotationOf(b, data.bodies.phaseAngles),
    visual: visualOf(b, data.rings),
    provider: fittedMoonProvider(m),
    // The effective GM the fit calibrated (moons.md): with the planet's point-mass GM, its
    // oblateness would show as a spurious eccentricity in the osculating orbit line.
    orbitLine: { muKm3S2: m.mu / (DAY_S * DAY_S) },
    dataSource: moonDataSource(b),
    positionNote: moonPositionNote(m),
  };
}

/** UTC ms (to about a minute) of a track's planetary flybys, from the closest approaches in the index. */
function flybyDatesMs(tracks: Tracks, id: string): number[] {
  const out: number[] = [];
  for (const p of tracks.info(id).pieces) {
    const ca = (p as unknown as { closestApproach?: { t: number } }).closestApproach;
    if (ca) out.push(Date.UTC(2000, 0, 1, 12) + ca.t * 86_400_000);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Orbit lines of the tracked bodies: none for Webb (its heliocentric conic would only repeat
 * Earth's); for craft leaving the Solar System, the conic about its whole mass, drawn back to
 * the last flyby (they have coasted on it since). Spacecraft and the dwarf planet candidates only
 * when looked at, like asteroids and comets (the IAU dwarf planets are drawn, as Pluto's always
 * was): seen from inside the Solar System, long, steeply tilted orbits cross the whole sky.
 */
function orbitLineOf(b: DataBody, tracks: Tracks, escaping: boolean): BodyRecord['orbitLine'] {
  if (b.id === 'jwst') return false;
  if (escaping) return { muKm3S2: GM_SOLAR_SYSTEM_KM3_S2, trailFromMs: flybyDatesMs(tracks, b.id), onDemand: true };
  if (b.kind === 'spacecraft' || b.kind === 'tno') return { onDemand: true };
  return undefined;
}

function trackRecord(b: DataBody, data: SolarSystemData): BodyRecord {
  const { kind } = kindOf(b);
  const info = data.tracks.info(b.id);
  // Comets go by the names in the track file ("Halley’s Comet"), with the designation as their kind.
  const comet = b.kind === 'comet';
  const name = comet ? info.name : b.name;
  const c = common(b, name);
  const aliases = comet && info.name !== b.name ? [...(c.aliases ?? []), b.name] : c.aliases;
  const kindText = KIND_TEXT[b.id] ?? c.kindText;
  const caveat = TRACK_CAVEATS[b.id];
  const escaping = ['voyager1', 'voyager2', 'new-horizons', 'pioneer10'].includes(b.id);
  return {
    ...c,
    id: b.id,
    name,
    aliases,
    kindText,
    kind,
    parent: 'sun',
    dependsOn: trackDependencies(data.tracks, b.id),
    rotation: rotationOf(b, data.bodies.phaseAngles),
    visual: visualOf(b, data.rings),
    provider: trackBodyProvider(data.tracks, b.id, name, b.spacecraft?.launch),
    // Escaping craft: the conic about the whole Solar System's mass (as their extrapolation).
    orbitLine: orbitLineOf(b, data.tracks, escaping),
    // Pulse detectors: Webb's would repeat Earth's reading; the candidates are left out like moons of their size.
    detector: b.id === 'jwst' || (b.kind === 'tno' && b.dwarfPlanetCandidate) ? false : undefined,
    dataSource:
      b.kind === 'spacecraft'
        ? 'NASA mission pages; trajectory fitted to JPL Horizons.'
        : 'Physical data: JPL Small-Body Database and the papers linked below; orbit fitted to JPL Horizons.',
    positionNote: trackPositionNote(data.tracks, b.id, b.kind),
    modelNotes: caveat ? [caveat, ...(c.modelNotes ?? [])] : c.modelNotes,
  };
}

/**
 * ʻOumuamua's shape, a model: never resolved, but its light varied tenfold as it turned, so it is long or flat. Drawn
 * as the cigar of Meech et al. (2017, Nature 552, 378) for an albedo of 0.04, about 230 × 35 m, its long axis the
 * body's x axis, square to the axis the tumble spins it about.
 */
const OUMUAMUA_RADII_KM: readonly [number, number, number] = [0.115, 0.0175, 0.0175];
const OUMUAMUA_NOTE =
  'Shape a model: a cigar about 230 × 35 m (Meech et al. 2017, for a dark surface). It was never resolved; a flat disc about 115 × 111 × 19 m fits the light curve as well (Mashchenko 2019). Its tumble is drawn with the light curve’s periods, end over end every 8.67 hours and wobbling every 54.5 hours (Belton et al. 2018), at an illustrative phase.';

/** An interstellar visitor's own parts: where it came from and how fast on the card, and ʻOumuamua's shape. */
function visitorRecord(r: BodyRecord): BodyRecord {
  const v = VISITORS[r.id as keyof typeof VISITORS];
  if (!v) return r;
  const out: BodyRecord = {
    ...r,
    facts: [...(r.facts ?? []), visitorFact(v)],
    factSources: r.factSources ? [...r.factSources, `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${r.id === 'oumuamua' ? '1I' : r.id === 'borisov' ? '2I' : '3I'}`] : r.factSources,
    // Its path through the Solar System is drawn by scene/VisitorPaths.tsx, from its track.
    orbitLine: false,
  };
  if (r.id === 'oumuamua') {
    out.physical = { ...r.physical, triaxialRadiiKm: OUMUAMUA_RADII_KM, maxRadiusKm: OUMUAMUA_RADII_KM[0] };
    out.modelNotes = [OUMUAMUA_NOTE, ...(r.modelNotes ?? []).filter((n) => !n.startsWith('Rotation illustrative'))];
  }
  return out;
}

/** Rings for a built-in planet, with the note they need. */
function planetWithRings(core: BodyRecord, sys: RingSystem | undefined): BodyRecord {
  if (!sys) return core;
  const { spec, boosted } = ringSpec(sys);
  const notes: string[] = [];
  if (core.id === 'jupiter') notes.push('Its rings are faint dust (optical depth about 10⁻⁶), drawn far more opaque than they are so they can be seen.');
  else if (boosted) notes.push(`${core.name}’s faint dusty rings are drawn more opaque than they are, so they can be seen.`);
  if (core.id === 'uranus') notes.push('Most of the rings are a few km wide and as dark as charcoal: close up they are thin dark lines.');
  if (spec.kind === 'bands' && spec.arcs) notes.push('The Adams ring’s arcs are drawn as Voyager 2 saw them in 1989, at an assumed place along the ring; two have since faded.');
  // (A second registration starts from the record the first one made: keep each note once.)
  return { ...core, visual: { ...core.visual, rings: spec }, modelNotes: [...(core.modelNotes ?? []).filter((n) => !notes.includes(n)), ...notes] };
}

/**
 * Records for the registry: `add` to register (in one call), `replace` for bodies already
 * registered (Pluto on its own orbit, Voyager 1 on its track, and Jupiter, Uranus and Neptune
 * with their rings).
 */
export function solarSystemRecords(data: SolarSystemData, core: CoreRecords): { add: BodyRecord[]; replace: BodyRecord[] } {
  const add: BodyRecord[] = [];
  const replace: BodyRecord[] = [];
  let voyager1: BodyRecord | null = null;
  for (const b of data.bodies.bodies) {
    if (b.kind === 'moon') {
      const m = data.moons[b.id];
      if (!m) throw new Error(`solar system: no orbit model for the moon '${b.id}'`);
      add.push(moonRecord(b, m, data));
    } else {
      if (!data.tracks.has(b.id)) throw new Error(`solar system: no track for '${b.id}'`);
      const r = trackRecord(b, data);
      if (b.id === 'voyager1') voyager1 = r;
      else add.push(b.kind === 'interstellar' ? visitorRecord(r) : r);
    }
  }

  // Pluto: its own orbit about the barycentre, opposite Charon.
  const pm = data.moons.pluto;
  if (!pm) throw new Error('solar system: no orbit model for Pluto');
  replace.push({
    ...core.pluto,
    provider: plutoProvider(pm),
    positionNote: `Position: the Pluto–Charon barycentre from astronomy-engine, and Pluto about it fitted to JPL Horizons, within ~${twoFigures(pm.accuracy.maxKm)} km in ${yearOf(pm.window[0])}–${yearOf(pm.window[1] - 1e-6)}.`,
  });

  // Voyager 1 onto its track: the built-in record keeps its key, label rank and framing.
  if (voyager1) {
    replace.push({
      ...core.voyager1,
      provider: voyager1.provider,
      dependsOn: voyager1.dependsOn,
      orbitLine: { muKm3S2: GM_SOLAR_SYSTEM_KM3_S2, trailFromMs: flybyDatesMs(data.tracks, 'voyager1') },
      aliases: [...new Set([...(core.voyager1.aliases ?? []), ...(voyager1.aliases ?? [])])],
      facts: voyager1.facts,
      factSources: voyager1.factSources,
      mission: voyager1.mission,
      physical: { ...core.voyager1.physical, massKg: voyager1.physical.massKg },
      dataSource: voyager1.dataSource,
      positionNote: voyager1.positionNote,
      modelNotes: voyager1.modelNotes,
      visual: voyager1.visual,
    });
  }

  const sys = (id: string) => data.rings.systems.find((s) => s.parent === id);
  replace.push(planetWithRings(core.jupiter, sys('jupiter')), planetWithRings(core.uranus, sys('uranus')), planetWithRings(core.neptune, sys('neptune')));
  return { add, replace };
}

/** TDB days since J2000 of a Julian date (for tests and notes). */
export const tdbDaysOfJd = (jd: number): number => jd - J2000_JD;
