/**
 * Body records for stars: the five star systems of systems.json as barycentres with their stars
 * on Kepler orbits, the other named stars on straight-line motion, and any catalogue star on
 * demand (search, or the camera coming within PROMOTE_PC). Pure functions of the data: the tests
 * call them with the files read from disk. See docs/bodies.md and docs/data/stars.md.
 *
 * Positions are where the stars are (coordinate positions, J2000 ecliptic km from the Sun): the
 * catalogue's astrometric J2000 position carried by the space velocity for (t − 2000) plus the
 * light-time d/c, and each orbit a light-time ahead of the date, because published orbits are
 * what is seen from Earth. The light-time correction then shows exactly the catalogue and the
 * published orbits from the Sun. Beyond ±1 Myr from J2000 everything stands still (labelled).
 */
import { Color, LinearSRGBColorSpace } from 'three';
import { JULIAN_YEAR_S } from '../../physics/constants';
import { blackbodyRgb } from '../../physics/blackbody';
import { ALWAYS, type Availability, type BodyRecord, type PositionProvider, type StarInfo } from '../bodies';
import {
  DISTANCE_PRECISION_TEXT,
  DISTANCE_SOURCE_TEXT,
  distancePrecision,
  distanceSource,
  colourSource,
  ColourSource,
  originText,
  teffIsBorrowed,
  velocityNote,
  type Stars3D,
  type Stars3DExtra,
} from './catalogue';
import { AU_KM, AU_PER_PC, C_PC_PER_YR, GM_SUN_KM3_S2, JD_J2000, KMS_TO_PC_PER_YR, MOTION_VALID_YEARS, PARSEC_KM, SUN_RADIUS_KM } from './constants';
import { eclipticToWorld, equatorialToEcliptic, unitFromRaDec, type Vec3 } from './frames';
import { orbitRelativeState, orbitStateInto, type OrbitJson, type StarJson, type SystemJson, type SystemsFile } from './orbits';
import { luminosityFromAbsMag, radiusFromLuminosity } from './photometry';
import { STAR_FACTS } from './facts';
import { starSurface } from './closeup';
import { CLOSE_UPS, EXTREME_REFS, EXTREME_STARS, type ExtremeStarDef } from './extremeStars';
import { catalogueNumber, starDisplayName, starLabels, type StarNameTable } from './names';

/** Registry ids of the systems.json stars whose app id differs (the primaries take the system's name, as the articles do). */
export const STAR_APP_IDS: Readonly<Record<string, string>> = {
  'alpha-cen-a': 'alpha-centauri-a',
  'alpha-cen-b': 'alpha-centauri-b',
  'sirius-a': 'sirius',
  'procyon-a': 'procyon',
  '61-cyg-a': '61-cygni',
  '61-cyg-b': '61-cygni-b',
  'capella-aa': 'capella',
};

/** The registry id of a systems.json star. */
export const appStarId = (jsonId: string): string => STAR_APP_IDS[jsonId] ?? jsonId;

/** The registry id of a catalogue star registered on demand. */
export const catalogueStarId = (index: number): string => `star-${index}`;

/** The id of a system's barycentre. */
export const barycentreId = (systemId: string): string => `${systemId}-barycentre`;

/** Learn articles for the named stars (the rest have none): planet hosts go to other-worlds. */
const ARTICLES: Readonly<Record<string, string>> = {
  'alpha-centauri-a': 'how-far-are-the-stars',
  'alpha-centauri-b': 'how-far-are-the-stars',
  proxima: 'how-far-are-the-stars',
  'barnards-star': 'other-worlds',
  sirius: 'how-far-are-the-stars',
  'sirius-b': 'what-stars-are-made-of',
  procyon: 'how-far-are-the-stars',
  '61-cygni': 'how-far-are-the-stars',
  '61-cygni-b': 'how-far-are-the-stars',
  'wolf-359': 'how-far-are-the-stars',
  'tau-ceti': 'other-worlds',
  'epsilon-eridani': 'other-worlds',
  betelgeuse: 'what-stars-are-made-of',
  rigel: 'what-stars-are-made-of',
  deneb: 'what-stars-are-made-of',
  antares: 'what-stars-are-made-of',
  aldebaran: 'what-stars-are-made-of',
  arcturus: 'what-stars-are-made-of',
  vega: 'what-stars-are-made-of',
  altair: 'what-stars-are-made-of',
  polaris: 'what-stars-are-made-of',
  capella: 'what-stars-are-made-of',
  canopus: 'what-stars-are-made-of',
  'trappist-1': 'other-worlds',
  'hr-8799': 'other-worlds',
  '51-pegasi': 'other-worlds',
  'gliese-581': 'other-worlds',
  achernar: 'what-stars-are-made-of',
  regulus: 'what-stars-are-made-of',
};

// ─── Providers ───────────────────────────────────────────────────────────────────────────

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const YEAR_MS = JULIAN_YEAR_S * 1000;
const MAX_DAYS = MOTION_VALID_YEARS * 365.25;

/** Straight-line motion within a million years of J2000; frozen (illustrative) beyond. */
export function starAvailability(ms: number): Availability {
  return Math.abs(ms - J2000_MS) <= MOTION_VALID_YEARS * YEAR_MS ? ALWAYS.approximate : ALWAYS.illustrative;
}

/**
 * A star (or a system's barycentre) moving in a straight line: the catalogue's astrometric J2000
 * position `posPc` and velocity `velKms` (J2000 ecliptic, heliocentric), placed where it is at
 * each date (the light-time |r0|/c added). Frozen beyond ±1 Myr.
 */
export function linearStarProvider(posPc: Readonly<Vec3>, velKms: Readonly<Vec3>, label: string): PositionProvider {
  const x0 = posPc[0] * PARSEC_KM;
  const y0 = posPc[1] * PARSEC_KM;
  const z0 = posPc[2] * PARSEC_KM;
  const [vx, vy, vz] = velKms;
  const lightS = (Math.hypot(posPc[0], posPc[1], posPc[2]) / C_PC_PER_YR) * JULIAN_YEAR_S;
  return {
    label,
    availability: starAvailability,
    positionAt(time, pos, vel) {
      const tt = time.tt;
      const days = tt > MAX_DAYS ? MAX_DAYS : tt < -MAX_DAYS ? -MAX_DAYS : tt;
      const s = days * 86_400 + lightS;
      pos.x = x0 + vx * s;
      pos.y = y0 + vy * s;
      pos.z = z0 + vz * s;
      if (vel) {
        const moving = days === tt;
        vel.x = moving ? vx : 0;
        vel.y = moving ? vy : 0;
        vel.z = moving ? vz : 0;
      }
    },
  };
}

interface OrbitTerm {
  orbit: OrbitJson;
  /** Share of the relative orbit this body moves by: −m2/(m1+m2) for group 1, m1/(m1+m2) for group 2. */
  f: number;
  /**
   * How much farther from the Sun than the system's barycentre the pair on this orbit is, pc
   * (Alpha Centauri A and B sit a few hundred au from the barycentre that includes Proxima).
   */
  offsetPc: number;
}

/** A system's barycentre in straight-line motion, for the orbits' light-time. */
export interface SystemMotion {
  posPc: Readonly<Vec3>;
  velKms: Readonly<Vec3>;
}

/**
 * A body displaced from its centre by its share of one or more Kepler orbits. Published orbits
 * are fitted to what Earth sees, so their times are times of observation: the pair is where the
 * orbit puts it at t + D(t)/c, D its distance from the Sun at time t (which the system's motion
 * changes: Alpha Centauri comes 118 au closer every 25 years, which would otherwise shift its
 * orbit by 0.7 days).
 */
export function orbitStarProvider(terms: readonly OrbitTerm[], system: SystemMotion, label: string): PositionProvider {
  const p = new Float64Array(3);
  const v = new Float64Array(3);
  const n = terms.length;
  const [bx, by, bz] = system.posPc;
  const kv = KMS_TO_PC_PER_YR;
  const [vx, vy, vz] = [system.velKms[0] * kv, system.velKms[1] * kv, system.velKms[2] * kv];
  const light0 = Math.hypot(bx, by, bz) / C_PC_PER_YR;
  return {
    label,
    availability: starAvailability,
    positionAt(time, pos, vel) {
      const tt = time.tt;
      const days = tt > MAX_DAYS ? MAX_DAYS : tt < -MAX_DAYS ? -MAX_DAYS : tt;
      const moving = days === tt;
      // The system's distance now (pc), where its motion has taken it.
      const yr = days / 365.25 + light0;
      const d = Math.sqrt((bx + vx * yr) ** 2 + (by + vy * yr) ** 2 + (bz + vz * yr) ** 2);
      pos.x = pos.y = pos.z = 0;
      if (vel) vel.x = vel.y = vel.z = 0;
      for (let i = 0; i < n; i++) {
        const t = terms[i];
        const jd = JD_J2000 + days + ((d + t.offsetPc) / C_PC_PER_YR) * 365.25;
        orbitStateInto(t.orbit, jd, p, vel && moving ? v : null);
        const k = t.f * AU_KM;
        pos.x += k * p[0];
        pos.y += k * p[1];
        pos.z += k * p[2];
        if (vel && moving) {
          vel.x += t.f * v[0];
          vel.y += t.f * v[1];
          vel.z += t.f * v[2];
        }
      }
    },
  };
}

// ─── What a star is ──────────────────────────────────────────────────────────────────────

/** The spectral classes, hottest first. */
const CLASSES = 'OBAFGKM';

/**
 * The class a temperature belongs to, as an index into OBAFGKM (O stars counted with the B stars:
 * colour temperatures of the hottest stars come out far too cool). Giants of a class run a few
 * hundred kelvin cooler than its dwarfs, well inside one class.
 */
const classOfTeff = (t: number): number => (t >= 10_000 ? 1 : t >= 7300 ? 2 : t >= 6000 ? 3 : t >= 5300 ? 4 : t >= 3900 ? 5 : 6);

/** The brightest M_V of a main-sequence star of each class, with a margin for a pair's combined light (Pecaut & Mamajek 2013: O5 V to M0 V). */
const DWARF_BRIGHTEST: Record<string, number> = { O: -5.7, B: -4.2, A: 0.4, F: 1.9, G: 3.9, K: 5.5, M: 8.0 };
/** How much brighter than that a star may be and still be called a dwarf, mag. */
const DWARF_MARGIN = 2.5;

/** The spectral class of a type ("dF3" → F, "sdB5" → B, "K0 III" → K), if it has one. */
const classOf = (s: string): string | undefined => s.match(/^(?:esd|sd|d|g|c)?([OBAFGKMLTY])/)?.[1];

/**
 * A catalogue spectral type, or undefined where it contradicts the star's own colour or
 * brightness: two classes or more from its colour temperature (a companion's type given to the
 * primary, a cross-match slip: Almach "B8V" at 4,000 K, the carbon star 19 Psc "F8/G0 V", Bunda
 * "K0 III" at 8,360 K), a dwarf class for a star far too luminous to be one (Dubhe, a K0 giant,
 * listed "F7V comp"), or a white dwarf that is not faint. Dust reddens distant supergiants and
 * bright giants, so their colour may run up to three classes cooler than their type; nothing
 * makes a star look hotter. With no temperature known, the type stands.
 */
export function plausibleSpectralType(sp: string | undefined, teffK: number, absMagV: number, teffKnown = true): string | undefined {
  const s = (sp ?? '').trim();
  if (!s) return undefined;
  if (/white dwarf/i.test(s) || /^D[ABOQZCX]/.test(s)) return absMagV > 8 ? s : undefined;
  // Carbon and S stars are cool giants.
  if (/^(C|R|N|S|MS|SC)[\d\s.(-]/.test(s)) return !teffKnown || teffK < 4500 ? s : undefined;
  const cls = classOf(s);
  const k = cls ? CLASSES.indexOf(cls) : -1;
  if (k < 0) return s;
  const lum = luminosityClass(s);
  if (teffKnown) {
    const off = classOfTeff(teffK) - Math.max(k, 1); // > 0: the colour is cooler than the type
    const reddened = /^(Ia\+|Iab|Ia|Ib|I|II)$/.test(lum ?? '');
    if (off <= -2 || off >= (reddened ? 4 : 2)) return undefined;
  }
  if ((lum === 'V' || lum === 'IV-V') && Number.isFinite(absMagV) && absMagV < DWARF_BRIGHTEST[cls!] - DWARF_MARGIN) return undefined;
  return s;
}

/** The luminosity class: after a space or the subclass digits ("A0 V", "K5III", "B8 IVn", "M1-M2 Ia-ab"). */
const luminosityClass = (s: string): string | undefined => s.match(/(?:[\s\d.:/-])(Ia\+|Iab|Ia|Ib|III|II|IV|V|I)(?=$|[^IV])/)?.[1];

/**
 * A star's kind in a word or two, from its spectral type: "Red dwarf", "Blue supergiant", "White
 * dwarf". With no type, from its temperature and M_V when given: a supergiant by its brightness,
 * a star far brighter than a dwarf of its colour a giant ("Orange giant"), else just a star.
 */
export function starKindText(spectralType: string | undefined, teffK: number, absMagV = NaN): string {
  const s = (spectralType ?? '').trim();
  if (!s && Number.isFinite(absMagV) && teffK > 0) {
    const c = CLASSES[classOfTeff(teffK)];
    // No colour word for a supergiant: dust may have reddened it (a far one's colour misleads).
    if (absMagV < -4) return 'Supergiant';
    if (absMagV < DWARF_BRIGHTEST[c] - DWARF_MARGIN && teffK < 6000) return teffK < 3900 ? 'Red giant' : teffK < 5300 ? 'Orange giant' : 'Yellow giant';
    return 'Star';
  }
  if (/white dwarf/i.test(s) || /^D[ABOQZCX]/.test(s)) return 'White dwarf';
  const cls = classOf(s);
  if (cls === 'L' || cls === 'T' || cls === 'Y') return 'Brown dwarf';
  const lum = luminosityClass(s);
  const colour = (c: string | undefined, t: number) =>
    c === 'M' || (!c && t < 3900) ? 'Red' : c === 'K' || (!c && t < 5200) ? 'Orange' : c === 'G' || c === 'F' || (!c && t < 7500) ? 'Yellow' : c === 'A' ? 'White' : 'Blue';
  if (lum && /^(Ia|Ia\+|Iab|Ib|I)$/.test(lum)) return `${colour(cls, teffK)} supergiant`;
  if (lum === 'II') return 'Bright giant';
  if (lum === 'III') return cls === 'M' ? 'Red giant' : cls === 'K' ? 'Orange giant' : cls === 'G' ? 'Yellow giant' : 'Giant star';
  if (lum === 'IV') return 'Subgiant';
  if (lum === 'V' || !lum) {
    if (cls === 'M') return 'Red dwarf';
    if (cls === 'K') return 'Orange dwarf';
    if (cls) return 'Main-sequence star';
  }
  return 'Star';
}

/** Display colour of a blackbody (sRGB hex), for markers and the point's tint. */
export function starColour(teffK: number): string {
  const [r, g, b] = blackbodyRgb(teffK);
  const m = Math.max(r, g, b, 1e-6);
  return `#${new Color().setRGB(r / m, g / m, b / m, LinearSRGBColorSpace).getHexString()}`;
}

/** Label priority of a star: after the Solar System's bodies, brighter stars (from the Sun) first. */
export const starLabelRank = (vFromSun: number): number => 12 + Math.min(0.98, Math.max(0, (vFromSun + 1.5) / 20));

// ─── Records ─────────────────────────────────────────────────────────────────────────────

const round = (x: number, digits: number) => Number(x.toPrecision(digits));
const TEN_PC_KM = 10 * PARSEC_KM;

interface StarBasis {
  id: string;
  name: string;
  index: number | null;
  /** Where the star's row is in `stars` when that is not `index` (a band file of the catalogue's extension). */
  local?: number;
  json: StarJson | null;
  parent: string | null;
  centre?: string;
  provider: PositionProvider;
  positionNote: string;
  aliases: string[];
  spectralType?: string;
  designations?: string[];
  constellation?: string;
  orbitLine?: boolean;
  refs: Readonly<Record<string, string>>;
  /**
   * Placed by a paper rather than the catalogue (extremeStars.ts): its place, how its distance was found, and its M_V
   * (the catalogue's, moved to this distance so it looks as bright from the Sun; or from its own V).
   */
  place?: { posPc: Vec3; source: string; precision: string; absMagV: number };
  /** Facts of its own (extremeStars.ts), with the keys of their sources in EXTREME_REFS. */
  facts?: readonly (readonly [string, string])[];
}

/** The physical side of a star record, from the catalogue row and (for the named stars) the literature. */
function starRecord(stars: Stars3D, b: StarBasis): BodyRecord {
  const i = b.index === null ? null : (b.local ?? b.index);
  const j = b.json;
  const flags = i !== null ? stars.flags[i] : 0;
  const pos: Vec3 = b.place ? b.place.posPc : i !== null ? [stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]] : [0, 0, 0];
  const distancePc = Math.hypot(pos[0], pos[1], pos[2]);
  const absMagV = b.place ? b.place.absMagV : i !== null ? stars.absMag[i] : NaN;
  const vFromSun = absMagV + 5 * Math.log10(distancePc) - 5;
  const catTeff = i !== null ? stars.teff[i] : 0;
  const placed = b.place !== undefined;
  // A companion's temperature is only its pair's (catalogue.ts borrowCompanionTemperatures): not its own.
  const borrowed = i !== null && teffIsBorrowed(stars, i);
  // A measured temperature as the paper gives it (the catalogue rounds it to 10 K), else the colour temperature.
  const teffK = j?.teffK || catTeff || 5772;
  const teffSource: StarInfo['teffSource'] =
    (!catTeff || borrowed) && !j?.teffK ? 'unknown' : colourSource(flags) === ColourSource.Literature || ((!catTeff || borrowed) && j?.teffK) ? 'literature' : 'colour';
  const litL = j?.luminosityLsun;
  const luminosityLsun = litL ?? luminosityFromAbsMag(absMagV, teffK);
  const eq = j?.radiusRsun;
  const pol = j?.radiusPolarRsun;
  const litR = eq !== undefined ? (pol !== undefined ? Math.cbrt(eq * eq * pol) : eq) : undefined;
  const radiusRsun = litR ?? radiusFromLuminosity(luminosityLsun, teffK);
  const massMsun = j?.massMsun;
  // A paper's type as given; the catalogue's only where it agrees with the star's colour and brightness.
  const spectralType = j?.spectralType ?? plausibleSpectralType(b.spectralType, teffK, absMagV, teffSource !== 'unknown');

  const notes: string[] = [];
  if (pol !== undefined && eq !== undefined)
    notes.push(`Drawn as a sphere of its mean radius: it spins fast, ${eq} solar radii at the equator and ${pol} at the poles.`);
  if (litR === undefined)
    notes.push(
      litL === undefined
        ? 'Radius and luminosity estimated from its brightness and colour temperature (Stefan–Boltzmann, Flower’s bolometric correction): uncertain by tens of per cent.'
        : 'Radius estimated from its luminosity and colour temperature (Stefan–Boltzmann).',
    );
  if (teffSource === 'colour')
    notes.push(
      teffK > 10_000
        ? 'Its temperature is its B−V colour temperature, which for a star this hot is too cool (its effective temperature is higher).'
        : 'Its temperature is its B−V colour temperature (no measured value).',
    );
  if (b.spectralType && !spectralType)
    notes.push(`Its catalogue spectral type, ${b.spectralType}, contradicts its colour or brightness (probably a companion’s, or a mismatch in the catalogue): left out.`);
  if (teffSource === 'unknown')
    notes.push(borrowed ? `No colour of its own is known: drawn at the temperature of the star it pairs with, ${teffK} K.` : 'No colour is known: drawn at the Sun’s temperature.');
  if (j?.distancePc) notes.push(`Placed at its catalogue distance, ${round(distancePc, 4)} pc; the paper behind its size and luminosity adopts ${j.distancePc} pc.`);
  const vNote = i !== null && !placed ? velocityNote(flags) : null;
  if (vNote) notes.push(vNote);
  if (distancePc > 100) notes.push('Its brightness and colour are as seen from the Sun, with the dust in between.');
  if (j?.id === 'spica') notes.push('Spica is a close pair drawn as one star; its companion is left out.');

  const refs = j ? [...new Set(Object.values(j.refs))].map((k) => b.refs[k] ?? k) : undefined;
  const star: StarInfo = {
    catalogueIndex: b.index ?? undefined,
    spectralType,
    teffK,
    teffSource,
    luminosityLsun: litL ?? round(luminosityLsun, 4),
    luminositySource: litL !== undefined ? 'literature' : 'estimated',
    radiusRsun: litR !== undefined ? round(litR, 6) : round(radiusRsun, 4),
    radiusSource: litR !== undefined ? 'literature' : 'estimated',
    equatorialRadiusRsun: pol !== undefined ? eq : undefined,
    polarRadiusRsun: pol,
    massMsun,
    massRangeMsun: j?.massMsunRange,
    absMagV: round(absMagV, 4),
    vFromSun: round(vFromSun, 4),
    distancePc: round(distancePc, 7),
    distanceSource: b.place?.source ?? DISTANCE_SOURCE_TEXT[distanceSource(flags)] ?? 'unknown',
    distancePrecision: b.place?.precision ?? DISTANCE_PRECISION_TEXT[distancePrecision(flags)] ?? 'unknown',
    altDistancePc: j?.distancePc,
    altDistanceNote: j?.distancePc ? j.notes : undefined,
    designations: b.designations,
    constellation: b.constellation,
    refs,
  };
  const own = b.facts
    ? { facts: b.facts.map((x) => x[0]), sources: b.facts.map((x) => EXTREME_REFS[x[1]].url), labels: b.facts.map((x) => EXTREME_REFS[x[1]].cite.replace(/ d{4},.*$/, (m) => m.match(/ d{4}/)![0])) }
    : undefined;
  const facts = own ?? (j ? STAR_FACTS[j.id] : undefined);
  // The close-up: its shape, limb darkening, cells, spots and flares (closeup.ts).
  const dirW = eclipticToWorld(pos);
  const surface = starSurface({
    teffK,
    radiusRsun,
    massMsun,
    dirWorld: distancePc > 0 ? [dirW[0] / distancePc, dirW[1] / distancePc, dirW[2] / distancePc] : undefined,
    spec: CLOSE_UPS[b.id],
  });
  notes.push(...surface.notes);
  const physical: BodyRecord['physical'] = {
    radiusKm: radiusRsun * SUN_RADIUS_KM,
    colour: starColour(teffK),
    luminous: { vmag: absMagV, atKm: TEN_PC_KM, teffK },
  };
  // A fast rotator keeps its mean radius here (it is drawn as a sphere); its two radii are in `star`.
  if (massMsun !== undefined) physical.gmKm3S2 = massMsun * GM_SUN_KM3_S2;
  const lineageRefs = j ? `; size, temperature and mass: ${refs?.join('; ')}` : '';
  return {
    id: b.id,
    name: b.name,
    aliases: [...new Set(b.aliases.filter((a) => a && a !== b.name))],
    kind: 'star',
    kindText: starKindText(spectralType, teffK, absMagV),
    parent: b.parent,
    centre: b.centre,
    physical,
    visual: { renderer: 'star' },
    facts: facts?.facts,
    factSources: facts?.sources,
    factSourceLabels: facts?.labels,
    dataSource: `${originText(i !== null && stars.origin ? stars.origin[i] : 0)}${lineageRefs}`,
    positionNote: b.positionNote,
    modelNotes: notes,
    provider: b.provider,
    labelRank: starLabelRank(vFromSun),
    orbitLine: b.orbitLine ? {} : false,
    article: ARTICLES[b.id],
    star,
    starSurface: surface,
  };
}

function distanceWords(stars: Stars3D, i: number): string {
  const f = stars.flags[i];
  return `distance ${DISTANCE_PRECISION_TEXT[distancePrecision(f)]}, from ${DISTANCE_SOURCE_TEXT[distanceSource(f)]}`;
}

const LINEAR_NOTE = 'Position: straight-line motion from its catalogue place and velocity, for a million years either side of 2000';

/** Ref keys of systems.json → citations (the file's own text). */
function refText(file: SystemsFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(file.refs)) out[k] = v.split(' — ')[0];
  return out;
}

/** Records of one star system: its barycentre, a barycentre for each inner pair, and its stars. */
export function systemRecords(file: SystemsFile, sys: SystemJson, stars: Stars3D): BodyRecord[] {
  const refs = refText(file);
  const rootId = barycentreId(sys.id);
  const out: BodyRecord[] = [];
  const b = sys.barycentre;
  out.push({
    id: rootId,
    name: sys.name,
    kind: 'barycentre',
    parent: null,
    physical: { radiusKm: 0, colour: '#ffffff', gmKm3S2: b.massMsun * GM_SUN_KM3_S2 },
    provider: linearStarProvider(b.posPc, b.velKms, `Centre of mass of ${sys.name}: straight-line motion from ${(b.refs ?? []).map((r) => refs[r] ?? r).join('; ')}`),
    orbitLine: false,
    detector: false,
    destination: false,
  });
  const motion: SystemMotion = { posPc: b.posPc, velKms: b.velKms };
  // How much farther than the barycentre each orbit's pair is (at J2000: it changes over the
  // outer orbit's half a million years, not over the few years of light-time it corrects).
  const b0 = b.posPc;
  const d0 = Math.hypot(...b0);
  const offsetPc = (o: OrbitJson): number => {
    const pair = [...o.primary, ...o.secondary];
    const shift = [0, 0, 0];
    for (const outer of sys.orbits) {
      if (outer === o) continue;
      const inPrimary = pair.every((m) => outer.primary.includes(m));
      const inSecondary = pair.every((m) => outer.secondary.includes(m));
      if (!inPrimary && !inSecondary) continue;
      const m1 = outer.massPrimaryMsun;
      const m2 = outer.massSecondaryMsun;
      const f = inPrimary ? -m2 / (m1 + m2) : m1 / (m1 + m2);
      const r = orbitRelativeState(outer, JD_J2000).posAu;
      for (let k = 0; k < 3; k++) shift[k] += (f * r[k]) / AU_PER_PC;
    }
    return Math.hypot(b0[0] + shift[0], b0[1] + shift[1], b0[2] + shift[2]) - d0;
  };
  const suffix = (id: string) => id.split('-').pop()!;
  // A barycentre for each group of two or more stars that orbits as one (Alpha Centauri A and B around which Proxima goes).
  const groupNode = new Map<string, { id: string; orbit: OrbitJson; members: string[] }>();
  for (const o of sys.orbits) {
    for (const [group, f] of [
      [o.primary, -o.massSecondaryMsun / (o.massPrimaryMsun + o.massSecondaryMsun)],
      [o.secondary, o.massPrimaryMsun / (o.massPrimaryMsun + o.massSecondaryMsun)],
    ] as const) {
      if (group.length < 2) continue;
      const id = `${sys.id}-${group.map(suffix).join('')}-barycentre`;
      const mass = group === o.primary ? o.massPrimaryMsun : o.massSecondaryMsun;
      groupNode.set(group.join(' '), { id, orbit: o, members: group });
      out.push({
        id,
        name: `${sys.name} ${group.map((m) => suffix(m).toUpperCase()).join('')}`,
        kind: 'barycentre',
        parent: rootId,
        centre: rootId,
        physical: { radiusKm: 0, colour: '#ffffff', gmKm3S2: mass * GM_SUN_KM3_S2 },
        provider: orbitStarProvider([{ orbit: o, f, offsetPc: offsetPc(o) }], motion, `On the orbit ${o.id} (${o.source})`),
        orbitLine: false,
        detector: false,
        destination: false,
      });
    }
  }
  for (const memberId of sys.members) {
    const j = file.stars.find((s) => s.id === memberId);
    if (!j) throw new Error(`stars: ${memberId} of ${sys.id} is not in systems.json's stars`);
    const node = [...groupNode.values()].find((g) => g.members.includes(memberId));
    const terms: OrbitTerm[] = [];
    for (const o of sys.orbits) {
      if (node && o === node.orbit) continue;
      const m1 = o.massPrimaryMsun;
      const m2 = o.massSecondaryMsun;
      if (o.primary.includes(memberId)) terms.push({ orbit: o, f: -m2 / (m1 + m2), offsetPc: offsetPc(o) });
      else if (o.secondary.includes(memberId)) terms.push({ orbit: o, f: m1 / (m1 + m2), offsetPc: offsetPc(o) });
    }
    const centre = node?.id ?? rootId;
    const orbits = sys.orbits.filter((o) => o.primary.includes(memberId) || o.secondary.includes(memberId));
    const orbitRefs = [...new Set(orbits.flatMap((o) => ((o.published as { refs?: string[]; ref?: string }).refs ?? [(o.published as { ref?: string }).ref]).filter((r): r is string => !!r)))];
    const preliminary = orbits.some((o) => /preliminary|grade 4/.test(JSON.stringify(o.published)));
    const i = j.catalogueIndex;
    const id = appStarId(j.id);
    out.push(
      starRecord(stars, {
        id,
        name: j.name,
        index: i,
        json: j,
        parent: centre,
        centre,
        provider: orbitStarProvider(terms, motion, `Orbit in ${sys.name} (${orbits.map((o) => o.source).join('; ')}), about its barycentre`),
        positionNote: `Position: the system’s centre of mass in straight-line motion, and ${orbits.length > 1 ? 'its orbits' : 'its orbit'} (${orbitRefs.map((r) => refs[r] ?? r).join('; ')})${preliminary ? ', which is preliminary' : ''}; ${i !== null ? distanceWords(stars, i) : ''}. Good for a million years either side of 2000.`,
        aliases: [...j.altNames, ...(j.hip ? [`HIP ${j.hip}`] : []), ...(id === '61-cygni' ? ['61 Cygni', '61 Cyg A'] : []), ...(id === 'alpha-centauri-a' ? ['Alpha Centauri', 'α Cen A'] : [])],
        orbitLine: true,
        refs,
      }),
    );
  }
  return out;
}

/** Records of the named single stars of systems.json (not the Sun, not the system members). */
export function namedStarRecords(file: SystemsFile, stars: Stars3D): BodyRecord[] {
  const refs = refText(file);
  const out: BodyRecord[] = [];
  for (const j of file.stars) {
    if (j.system || j.id === 'sun' || j.catalogueIndex === null) continue;
    const i = j.catalogueIndex;
    const pos: Vec3 = [stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]];
    const vel: Vec3 = [0, 1, 2].map((k) => stars.velocitiesInt16[3 * i + k] * stars.velocityUnitKms) as Vec3;
    out.push(
      starRecord(stars, {
        id: appStarId(j.id),
        name: j.name,
        index: i,
        json: j,
        parent: null,
        provider: linearStarProvider(pos, vel, 'Straight-line motion from the AT-HYG v4.0 / Gaia DR3 catalogue'),
        positionNote: `${LINEAR_NOTE}; ${distanceWords(stars, i)}.`,
        aliases: [...j.altNames, ...(j.hip ? [`HIP ${j.hip}`] : [])],
        refs,
      }),
    );
  }
  return out;
}

/** Citations of EXTREME_REFS, by key, for starRecord. */
const EXTREME_CITES: Record<string, string> = Object.fromEntries(Object.entries(EXTREME_REFS).map(([k, v]) => [k, v.cite]));

/** M_V of a star of apparent V at d pc. */
const absMagAt = (v: number, dPc: number): number => v - 5 * Math.log10(dPc / 10);

/**
 * The record of one of the extreme stars systems.json lacks (extremeStars.ts): from its catalogue row where it has
 * one, placed at its paper's distance where that is given (held there), else in straight-line motion from the row.
 */
export function extremeStarRecord(def: ExtremeStarDef, stars: Stars3D): BodyRecord | null {
  const j = def.json;
  const i = j.catalogueIndex;
  if (i !== null && i >= stars.count) return null;
  const cat: Vec3 | null = i !== null ? [stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]] : null;
  const label = 'Held at its place (its motion is not followed)';
  let place: StarBasis['place'];
  let provider: PositionProvider;
  if (Number.isFinite(def.distancePc)) {
    let unit: Vec3;
    let absMagV: number;
    if (cat) {
      const d = Math.hypot(...cat);
      unit = [cat[0] / d, cat[1] / d, cat[2] / d];
      // As bright from the Sun as the catalogue has it.
      absMagV = stars.absMag[i!] + 5 * Math.log10(d / def.distancePc);
    } else {
      unit = equatorialToEcliptic(unitFromRaDec(def.raDeg!, def.decDeg!));
      absMagV = absMagAt(def.vMag ?? NaN, def.distancePc);
    }
    const posPc: Vec3 = [unit[0] * def.distancePc, unit[1] * def.distancePc, unit[2] * def.distancePc];
    place = { posPc, source: def.distanceSource, precision: def.distancePrecision, absMagV };
    provider = linearStarProvider(posPc, [0, 0, 0], label);
  } else if (cat) {
    const vel: Vec3 = [0, 1, 2].map((k) => stars.velocitiesInt16[3 * i! + k] * stars.velocityUnitKms) as Vec3;
    provider = linearStarProvider(cat, vel, 'Straight-line motion from the AT-HYG v4.0 / Gaia DR3 catalogue');
  } else return null;
  const rec = starRecord(stars, {
    id: j.id,
    name: j.name,
    index: i,
    json: j,
    parent: null,
    provider,
    positionNote: place ? `Position: ${label.toLowerCase()}, at ${Math.round(def.distancePc).toLocaleString('en-GB')} pc: ${def.distanceSource}.` : `${LINEAR_NOTE}; ${distanceWords(stars, i!)}.`,
    aliases: [...j.altNames, ...(j.hip ? [`HIP ${j.hip}`] : [])],
    refs: EXTREME_CITES,
    place,
    facts: def.facts,
  });
  const notes = [...(rec.modelNotes ?? [])];
  if (def.vMagNote) notes.push(`Its point’s brightness is ${def.vMagNote}.`);
  notes.unshift(...def.notes);
  // A star the catalogue lacks: its place is Gaia DR3's.
  const dataSource = i === null ? `Position: Gaia DR3 ${j.gaiaDr3} (${EXTREME_REFS.gaiaDr3.cite}); ${rec.star?.refs?.length ? `size, temperature and distance: ${rec.star.refs.join('; ')}` : ''}` : rec.dataSource;
  return { ...rec, modelNotes: notes, article: def.article ?? rec.article, dataSource, kindText: def.kindText ?? rec.kindText };
}

/** Every star record from the data: systems first (barycentres, then their stars), then the named stars, then the extreme stars. */
export function starRecords(file: SystemsFile, stars: Stars3D): BodyRecord[] {
  const extreme = EXTREME_STARS.map((d) => extremeStarRecord(d, stars)).filter((r): r is BodyRecord => r !== null);
  return [...file.systems.flatMap((s) => systemRecords(file, s, stars)), ...namedStarRecords(file, stars), ...extreme];
}

/** The star-system records merged with the built-in Proxima's (its key, detector, short name, aliases and article stay). */
export function mergeCoreProxima(records: BodyRecord[], core: BodyRecord): BodyRecord[] {
  return records.map((r) =>
    r.id === core.id
      ? {
          ...r,
          shortName: core.shortName,
          aliases: [...new Set([...(core.aliases ?? []), ...(r.aliases ?? [])])],
          detector: core.detector,
          key: core.key,
          // Its label ranks by its brightness now, like every star's, so Alpha Centauri's own label wins beside it.
          article: core.article ?? r.article,
        }
      : r,
  );
}

/**
 * A catalogue star registered on demand (found by search, or the camera within PROMOTE_PC of it):
 * straight-line motion, its size estimated from its brightness and colour, named from the names
 * table when that has loaded.
 */
export function catalogueStarRecord(stars: Stars3D, i: number, names: StarNameTable | null, extra: Stars3DExtra | null, local = i): BodyRecord {
  const L = local;
  const pos: Vec3 = [stars.positions[3 * L], stars.positions[3 * L + 1], stars.positions[3 * L + 2]];
  const vel: Vec3 = [0, 1, 2].map((k) => stars.velocitiesInt16[3 * L + k] * stars.velocityUnitKms) as Vec3;
  const labels = names ? starLabels(names, i) : [];
  const name = names ? starDisplayName(names, i) : `Star ${i.toLocaleString('en-GB')} of the catalogue`;
  const spectral = extra && names ? names.spectralTypes[extra.spectralType[L]] || undefined : undefined;
  const con = extra && names && extra.constellation[L] ? names.constellations[extra.constellation[L] - 1]?.[1] : undefined;
  const hip = names ? catalogueNumber(names, 'hip', i) : null;
  const rec = starRecord(stars, {
    id: catalogueStarId(i),
    name,
    index: i,
    local: L,
    json: null,
    parent: null,
    provider: linearStarProvider(pos, vel, 'Straight-line motion from the AT-HYG v4.0 / Gaia DR3 catalogue'),
    positionNote: `${LINEAR_NOTE}; ${distanceWords(stars, L)}.`,
    aliases: labels.slice(1),
    spectralType: spectral,
    designations: labels.length ? labels : hip !== null ? [`HIP ${hip}`] : undefined,
    constellation: con,
    refs: {},
  });
  return { ...rec, onDemand: true };
}
