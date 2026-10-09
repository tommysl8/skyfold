/**
 * The deep-sky catalogues' objects as the app names them and as bodies: what "Where to?" finds each by, what it is in
 * a word or two, and the record its card and data sheet read once it is chosen (registered on demand: load.ts). Pure
 * functions of the parsed files (format.ts): the tests call them with the files read from disk.
 *
 * The cards are short on purpose: what it is, how far it is and how well that is known, one sentence with its key
 * numbers, and one plain line where its place is a model or uncertain. How each number was found goes under the
 * card's folded Sources.
 */
import type { AstroTime } from 'astronomy-engine';
import { LIGHT_YEAR_KM, MPC_KM, PARSEC_KM } from '../../physics/constants';
import { MINUS } from '../../lib/sci';
import { msFromAstroTime } from '../../lib/time';
import { ALWAYS } from '../bodies/providers/simple';
import type { Availability, BodyRecord, DeepSkyInfo, PositionProvider, Vec3Like } from '../bodies/types';
import { cosmicAtMemo } from '../cosmicTime';
import { EARLIEST_GALAXIES_GYR } from '../cosmos/expansion';
import { fixedGalacticProvider } from '../galaxy/records';
import { METHOD } from '../cosmos/cosmicWeb';
import { SURVEY_SOURCES } from '../surveys/format.ts';
import type { Vec3 } from '../galaxy/frames';
import { gpsToUnixMs, regionRadiusRad, type DeepSkySetId, type GwEvent, type Magnetar, type NgcGalactic, type NgcGalaxy, type Pulsar, type Snr, type SnrFile } from './format';
import { NS_RADIUS_KM, pulsarModel, radioMagnetar, shownPulse } from './pulsarModel';

const LY_PER_PC = PARSEC_KM / LIGHT_YEAR_KM;
const doiUrl = (doi: string) => `https://doi.org/${doi}`;

/** What "Where to?", the picker and the labels need of one object, before it is a body. */
export interface DeepSkyEntry {
  set: DeepSkySetId;
  index: number;
  /** Its body id once registered ("ngc-2516", "psr-j0437-4715", "snr-g263-9-3-3", "gw150914"). */
  id: string;
  name: string;
  /** Other names and designations it is found by. */
  aliases: string[];
  /** What it is, in a word or two, for search results and the card ("Open cluster · NGC 2516"). */
  kindText: string;
  /** Known well enough to be a body while its catalogue is loaded: a common name, a Messier number, a famous one. */
  prominent: boolean;
}

// ─── Words ──────────────────────────────────────────────────────────────────────────────

/** A number to two or three significant figures in words: "2,700", "1.2 million". */
function rounded(x: number, digits = 2): string {
  if (!(x > 0)) return String(x);
  if (x >= 1e9) return `${rounded(x / 1e9, digits)} billion`;
  if (x >= 1e6) return `${rounded(x / 1e6, digits)} million`;
  const step = 10 ** (Math.floor(Math.log10(x)) - digits + 1);
  const r = Math.round(x / step) * step;
  return r.toLocaleString('en-GB', { maximumFractionDigits: Math.max(0, -Math.floor(Math.log10(step))) });
}

/** A length in parsecs in light-years, in words: "2,700 light-years". */
const lyWords = (pc: number, digits = 2): string => `${rounded(pc * LY_PER_PC, digits)} light-years`;

/** "J0437-4715" with a proper minus sign: "J0437−4715" (the catalogue's hyphen stays an alias). */
const minus = (s: string): string => s.replace(/(\d)-(\d)/g, `$1${MINUS}$2`).replace(/([JBG]\d+(?:\.\d+)?)-/g, `$1${MINUS}`);

/** A designation's slug for a body id (a sign kept as p or m: G24.7+0.6 and G24.7−0.6 are two remnants). */
const slug = (s: string): string =>
  s
    .replace(/\+/g, 'p')
    .replace(/(\d)[-−](\d)/g, '$1m$2')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** An alias that is a catalogue designation, not a common name ("M 41", "NGC 2451A", "IC 2395"). */
const isDesignation = (s: string): boolean => /^(M|Messier|NGC|IC)\s?\d/i.test(s);

/** The Messier number among an object's aliases, if any. */
function messierOf(aliases: readonly string[]): number | null {
  for (const a of aliases) {
    const m = a.match(/^M(\d+)$/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** The name an NGC/IC object goes by: its first common name, else its Messier number ("M41"), else its designation. */
function ngcName(designation: string, aliases: readonly string[]): string {
  const common = aliases.find((a) => !isDesignation(a));
  if (common) return common;
  const m = messierOf(aliases);
  return m !== null ? `M${m}` : designation;
}

/** "What it is · NGC 1234" when the name is not the designation itself. */
const withDesignation = (what: string, name: string, designation: string): string => (name === designation ? what : `${what} · ${designation}`);

// ─── NGC and IC: the Milky Way and the Clouds ──────────────────────────────────────────

const GALACTIC_WHAT: Record<string, string> = {
  OCl: 'Open cluster',
  GCl: 'Globular cluster',
  'Cl+N': 'Young cluster in a nebula',
  PN: 'Planetary nebula',
  HII: 'Star-forming region',
  Neb: 'Nebula',
  EmN: 'Emission nebula',
  RfN: 'Reflection nebula',
  SNR: 'Supernova remnant',
};

const CLOUD_NAME = { lmc: 'Large Magellanic Cloud', smc: 'Small Magellanic Cloud' } as const;

export function ngcGalacticEntry(o: NgcGalactic, index: number): DeepSkyEntry {
  const name = ngcName(o.designation, o.aliases);
  return {
    set: 'ngc-galactic',
    index,
    id: slug(o.designation),
    name,
    aliases: [...new Set([o.designation, ...o.aliases])].filter((a) => a !== name),
    kindText: withDesignation(GALACTIC_WHAT[o.type] ?? 'Deep-sky object', name, o.designation),
    prominent: name !== o.designation,
  };
}

const HR24 = 'Hunt & Reffert 2024, A&A 686, A42';
const BV21 = 'Baumgardt & Vasiliev 2021, MNRAS 505, 5957';
const HARRIS = 'Harris 1996, AJ 112, 1487 (2010 edition)';
const OPENNGC = 'OpenNGC (M. Verga), CC BY-SA 4.0';
const OPENNGC_URL = 'https://github.com/mattiaverga/OpenNGC';

/** How an NGC/IC object's distance was found, for its Sources. */
function galacticDistanceSource(o: NgcGalactic): string {
  switch (o.source) {
    case 'hr24':
      return `Gaia DR3 parallaxes of its member stars (${HR24})`;
    case 'bv21':
      return `the mean of many methods (${BV21})`;
    case 'harris':
      return HARRIS;
    case 'gaia-pn': {
      const p = o.extra as { plx?: number; plxErr?: number } | null;
      return `the Gaia EDR3 parallax of its central star, ${p?.plx?.toFixed(3)} ± ${p?.plxErr?.toFixed(3)} mas (ESA/Gaia/DPAC, via SIMBAD), with the zero point of Lindegren et al. 2021`;
    }
    case 'lmc':
      return 'the Large Magellanic Cloud’s distance from eclipsing binaries (Pietrzyński et al. 2019, Nature 567, 200), on its disc as tilted by van der Marel & Kallivayalil 2014';
    case 'smc':
      return 'the Small Magellanic Cloud’s distance from eclipsing binaries (Graczyk et al. 2020, ApJ 904, 13)';
  }
}

/** The radius it is drawn and framed at, pc: its half-member radius, its half-light radius, else half its catalogued size. */
function galacticRadiusPc(o: NgcGalactic): number {
  const e = o.extra as { r50?: number; rh?: number } | null;
  if (e?.r50) return e.r50;
  if (e?.rh) return e.rh;
  if (o.sizeArcmin > 0) return (o.distPc * o.sizeArcmin * Math.PI) / (180 * 60) / 2;
  return 1;
}

export function ngcGalacticRecord(o: NgcGalactic, entry: DeepSkyEntry): BodyRecord {
  const what = GALACTIC_WHAT[o.type] ?? 'Deep-sky object';
  const cloud = o.source === 'lmc' || o.source === 'smc' ? CLOUD_NAME[o.source] : undefined;
  const r = galacticRadiusPc(o);
  const e = (o.extra ?? {}) as { n?: number; age?: number; mass?: number; mv?: number; feh?: number };
  const facts: string[] = [];
  if (o.type === 'OCl' && o.source === 'hr24' && e.age && e.n) {
    const yr = 10 ** e.age;
    facts.push(`A cluster of stars born together about ${yr >= 1e9 ? `${rounded(yr / 1e9)} billion` : `${rounded(yr / 1e6)} million`} years ago; Gaia counts ${e.n.toLocaleString('en-GB')} of its stars.`);
  } else if (o.type === 'GCl' && typeof e.mv === 'number') {
    facts.push(`A ball of old stars shining like ${rounded(10 ** (-0.4 * (e.mv - 4.83)))} Suns.`);
  } else if (o.type === 'PN') {
    facts.push(`The outer layers a dying star has shed, lit by its hot core${o.sizeArcmin > 0 ? `; about ${lyWords(2 * (o.distPc * o.sizeArcmin * Math.PI) / (180 * 60) / 2, 1)} across` : ''}.`);
  } else if (o.type === 'Cl+N') {
    facts.push('A young star cluster with the glowing gas it was born from.');
  } else if (o.type === 'GCl' || o.type === 'OCl') {
    facts.push(`A star cluster${o.sizeArcmin > 0 ? ` about ${lyWords((o.distPc * o.sizeArcmin * Math.PI) / (180 * 60), 1)} across` : ''}.`);
  } else {
    facts.push(`A cloud of gas and dust${o.sizeArcmin > 0 ? ` about ${lyWords((o.distPc * o.sizeArcmin * Math.PI) / (180 * 60), 1)} across` : ''}.`);
  }
  const rows: { l: string; v: string; u?: string; title?: string }[] = [];
  if (typeof e.mass === 'number' && e.mass > 0) rows.push({ l: 'Mass', v: `≈ ${rounded(e.mass)}`, u: 'M☉', title: `Photometric (${HR24})` });
  if (typeof e.feh === 'number') rows.push({ l: 'Metallicity [Fe/H]', v: e.feh.toFixed(2), title: HARRIS });
  if (Number.isFinite(o.mag)) rows.push({ l: 'Apparent magnitude', v: o.mag.toFixed(1), title: OPENNGC });
  const info: DeepSkyInfo = {
    type: what,
    distancePc: o.distPc,
    ...(o.distLoPc > 0 && o.distHiPc > o.distLoPc ? { distanceLoPc: o.distLoPc, distanceHiPc: o.distHiPc } : {}),
    distanceSource: galacticDistanceSource(o),
    sizes: o.sizeArcmin > 0 ? [{ label: 'Size on the sky, at its distance', pc: (o.distPc * o.sizeArcmin * Math.PI) / (180 * 60), title: `${o.sizeArcmin}′ (${OPENNGC})` }] : [],
    rows,
    hostGalaxy: cloud,
    cardNote: cloud ? `Placed at the ${cloud}’s distance: where it lies within the Cloud, along our line of sight, is not measured.` : undefined,
    refs: [`${OPENNGC} (name, position, size)`, `${galacticDistanceSource(o)} (distance)`],
  };
  const isCluster = o.type === 'OCl' || o.type === 'GCl' || o.type === 'Cl+N';
  return {
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases,
    kind: isCluster ? 'cluster' : 'nebula',
    kindText: entry.kindText,
    parent: null,
    physical: { radiusKm: r * PARSEC_KM, colour: isCluster ? '#bcd2ff' : o.type === 'PN' ? '#8fe0c8' : '#c8a2c8' },
    visual: { renderer: 'layer' },
    // From far enough that its ring is under 200 px (markers.ts BIG_GONE_PX).
    framing: { distanceKm: Math.max(8 * r, 2) * PARSEC_KM },
    detector: false,
    orbitLine: false,
    onDemand: true,
    deepSky: info,
    facts,
    factSources: [OPENNGC_URL, ...(o.source === 'hr24' ? [doiUrl('10.1051/0004-6361/202348662')] : o.source === 'bv21' ? [doiUrl('10.1093/mnras/stab1474')] : [])],
    factSourceLabels: ['OpenNGC', ...(o.source === 'hr24' ? ['Hunt & Reffert 2024'] : o.source === 'bv21' ? ['Baumgardt & Vasiliev 2021'] : [])],
    positionNote: `Position: ${OPENNGC}, at the adopted distance, held fixed.`,
    modelNotes: [
      `Shown as a marker the size of the ${isCluster ? 'cluster' : 'nebula'} (or a small one, if smaller): its stars are the star catalogue’s where it has them, and it has no picture.`,
    ],
    dataSource: `${OPENNGC}; distance: ${galacticDistanceSource(o).replace(/^the /, '')}`,
    article: o.type === 'PN' ? 'what-stars-are-made-of' : 'our-galaxy',
    provider: fixedGalacticProvider(o.pos, 'Catalogue position at the adopted distance'),
  };
}

// ─── NGC and IC: galaxies ──────────────────────────────────────────────────────────────

/** A galaxy's kind in words, from its morphological type. */
export function galaxyWhat(type: string, hubble: string | null): string {
  if (type === 'GPair') return 'Pair of galaxies';
  if (type === 'GTrpl') return 'Triplet of galaxies';
  if (type === 'GGroup') return 'Group of galaxies';
  const h = (hubble ?? '').trim();
  if (/^E(?![-–]S0)/.test(h) && !/^E-S0/.test(h)) return 'Elliptical galaxy';
  if (/^(E-S0|S0|SA0|SAB0|SB0)/.test(h)) return 'Lenticular galaxy';
  if (/^(I|IB|IAB|Sm|SBm|SABm|IBm|Im)/.test(h)) return 'Irregular galaxy';
  if (/^SB/.test(h)) return 'Barred spiral galaxy';
  if (/^S/.test(h)) return 'Spiral galaxy';
  return 'Galaxy';
}

export function ngcGalaxyEntry(o: NgcGalaxy, index: number): DeepSkyEntry {
  const name = ngcName(o.designation, o.aliases);
  return {
    set: 'ngc-galaxies',
    index,
    id: slug(o.designation),
    name,
    aliases: [...new Set([o.designation, ...o.aliases])].filter((a) => a !== name),
    kindText: withDesignation(galaxyWhat(o.type, o.hubble), name, o.designation),
    prominent: name !== o.designation,
  };
}

const CF4 = 'Cosmicflows-4 (Tully et al. 2023, ApJ 944, 94)';
const CF4_DOI = '10.3847/1538-4357/ac94d8';
const METHOD_WORDS: [number, string][] = [
  [METHOD.cepheids, 'Cepheids'],
  [METHOD.trgb, 'the tip of the red giant branch'],
  [METHOD.snIa, 'type Ia supernovae'],
  [METHOD.snII, 'type II supernovae'],
  [METHOD.maser, 'a water maser'],
  [METHOD.sbf, 'surface brightness fluctuations'],
  [METHOD.fundamentalPlane, 'the fundamental plane'],
  [METHOD.tullyFisher, 'the Tully–Fisher relation'],
];
/** Cosmicflows-4's methods in words: "Cepheids and the Tully–Fisher relation". */
export function cf4MethodWords(bits: number): string {
  const w = METHOD_WORDS.filter(([b]) => bits & b).map(([, t]) => t);
  return w.length <= 1 ? (w[0] ?? 'its distance indicators') : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}

/** Peculiar motions blur a redshift distance by about 300 km/s over H0, some 4 Mpc (the build's PECULIAR_KM_S). */
const REDSHIFT_BLUR_MPC = 4;

function galaxyDistanceSource(o: NgcGalaxy): string {
  if (o.source === 'cf4') return `${CF4}: ${cf4MethodWords(o.methods)}${Number.isFinite(o.edm) ? `, distance modulus ±${o.edm.toFixed(2)} mag` : ''}; placed as the cosmic web places it (its group’s distance, beyond 30 Mpc blended into its group’s redshift)`;
  const survey = SURVEY_SOURCES[o.ref]?.name ?? (o.source === 'desi' ? 'DESI DR1' : 'the SDSS');
  return `its redshift in the ${survey}, in the Planck 2018 cosmology: where it is now, placed as the galaxy surveys place it`;
}

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const YEAR_MS = 365.25 * 86_400_000;
/** Galaxies move a few hundred km/s: under a kiloparsec in a million years (as sim/cosmos/records.ts). */
const GALAXY_YEARS = 1e6;
const TOO_EARLY: Availability = {
  available: false,
  reason: 'Too early: the earliest galaxies seen shine 283 million years after the Big Bang, and where galaxies were before that is not modelled',
  regime: 'unknown',
};

/**
 * A place in the expanding universe (sim/cosmos/expansion.ts): comoving place x with anchor c (world axes, Mpc) is at
 * x + (a − 1) c at the clock's time, so a galaxy keeps its place in its group while the space between groups grows.
 * Positions are J2000 ecliptic km: world (x, y, z) is ecliptic (x, −z, y).
 */
export function expandingPlaceProvider(posMpc: Readonly<Vec3>, anchorMpc: Readonly<Vec3>, label: string): PositionProvider {
  const x = [posMpc[0] * MPC_KM, -posMpc[2] * MPC_KM, posMpc[1] * MPC_KM];
  const c = [anchorMpc[0] * MPC_KM, -anchorMpc[2] * MPC_KM, anchorMpc[1] * MPC_KM];
  return {
    label,
    availability: (ms) => {
      if (Math.abs(ms - J2000_MS) <= GALAXY_YEARS * YEAR_MS) return ALWAYS.approximate;
      return cosmicAtMemo(ms).ageGyr < EARLIEST_GALAXIES_GYR ? TOO_EARLY : ALWAYS.illustrative;
    },
    positionAt(t: AstroTime, pos: Vec3Like, vel?: Vec3Like | null) {
      const am1 = cosmicAtMemo(msFromAstroTime(t)).am1;
      pos.x = x[0] + am1 * c[0];
      pos.y = x[1] + am1 * c[1];
      pos.z = x[2] + am1 * c[2];
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
}

/** A galaxy's radius, kpc: half its major axis at its distance (5 kpc, typical, where the catalogue gives none). */
export const galaxyRadiusKpc = (o: Pick<NgcGalaxy, 'majArcmin' | 'distMpc'>): number => (o.majArcmin > 0 ? (o.distMpc * 1000 * o.majArcmin * Math.PI) / (180 * 60) / 2 : 5);

export function ngcGalaxyRecord(o: NgcGalaxy, entry: DeepSkyEntry): BodyRecord {
  const what = galaxyWhat(o.type, o.hubble);
  const rKpc = galaxyRadiusKpc(o);
  const sizePc = o.majArcmin > 0 ? 2 * rKpc * 1000 : 0;
  const info: DeepSkyInfo = {
    type: what,
    distancePc: o.distMpc * 1e6,
    ...(o.distLoMpc > 0 && o.distHiMpc > o.distLoMpc ? { distanceLoPc: o.distLoMpc * 1e6, distanceHiPc: o.distHiMpc * 1e6 } : {}),
    distanceSource: galaxyDistanceSource(o),
    distanceNow: true,
    sizes: sizePc ? [{ label: 'Major axis, at its distance', pc: sizePc, title: `${o.majArcmin}′ (${OPENNGC}, from HyperLEDA)` }] : [],
    rows: [
      ...(o.hubble ? [{ l: 'Morphological type', v: o.hubble, title: `${OPENNGC}, from HyperLEDA` }] : []),
      ...(Number.isFinite(o.mag) ? [{ l: 'Apparent magnitude', v: o.mag.toFixed(1), title: OPENNGC }] : []),
    ],
    cardNote: o.source === 'cf4' ? undefined : `Placed by its redshift: its own motion through space blurs that distance by about ${REDSHIFT_BLUR_MPC} Mpc.`,
    refs: [`${OPENNGC} (name, position, size, type)`, `${galaxyDistanceSource(o)} (distance)`],
  };
  const radiusKm = rKpc * 1000 * PARSEC_KM;
  return {
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases,
    kind: 'galaxy',
    kindText: entry.kindText,
    parent: null,
    physical: { radiusKm, colour: '#e8dcc8' },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 8 * radiusKm, minKm: 0.05 * radiusKm },
    labelRank: 13.6,
    detector: false,
    orbitLine: false,
    onDemand: true,
    deepSky: info,
    facts: [`${sizePc ? `A ${what.toLowerCase()} about ${lyWords(sizePc)} across` : `A ${what.toLowerCase()}`}; ${o.source === 'cf4' ? `its distance was measured with ${cf4MethodWords(o.methods)}` : 'its distance comes from its redshift'}.`],
    factSources: [OPENNGC_URL, o.source === 'cf4' ? doiUrl(CF4_DOI) : o.source === 'desi' ? 'https://data.desi.lbl.gov/doc/releases/dr1/' : 'https://www.sdss.org/dr17/'],
    factSourceLabels: ['OpenNGC', o.source === 'cf4' ? 'Tully et al. 2023' : o.source === 'desi' ? 'DESI DR1' : 'SDSS DR17'],
    positionNote: `Position: ${OPENNGC}, at its distance; held at its place in the expanding universe (its own motion, a few hundred km/s, is not followed).`,
    modelNotes: ['Shown as a marker the size of the galaxy; how it looks is not drawn (its point in the cosmic web or the galaxy surveys is the same galaxy).'],
    dataSource: `${OPENNGC}; distance: ${o.source === 'cf4' ? CF4 : galaxyDistanceSource(o)}`,
    article: 'island-universes',
    provider: expandingPlaceProvider(o.pos, o.anchor, 'Measured place (heliocentric), carried by the expansion of the universe'),
  };
}

// ─── Pulsars ────────────────────────────────────────────────────────────────────────────

/** Pulsars known by a name of their own, with a line on why (by J name). */
export const FAMOUS_PULSARS: Record<string, { names: string[]; note?: string }> = {
  'J0534+2200': { names: ['Crab Pulsar'], note: 'The neutron star left by the supernova Chinese astronomers saw in 1054.' },
  'J0835-4510': { names: ['Vela Pulsar'], note: 'Left by a supernova about 11,000 years ago; the brightest pulsar in radio.' },
  'J1921+2153': { names: ['CP 1919', 'first pulsar', 'LGM-1'], note: 'The first pulsar found, by Jocelyn Bell Burnell and Antony Hewish in 1967.' },
  'J1915+1606': { names: ['Hulse–Taylor binary', 'Hulse-Taylor pulsar', 'binary pulsar'], note: 'Its orbit shrinks exactly as gravitational waves carry energy away: the first evidence of them (Nobel Prize 1993).' },
  'J0737-3039A': { names: ['Double Pulsar'], note: 'The only known pair of pulsars, a precise test of general relativity.' },
  'J0633+1746': { names: ['Geminga'], note: 'A pulsar seen in gamma rays and X-rays but hardly in radio.' },
  'J1748-2446ad': { names: ['fastest-spinning pulsar'], note: 'The fastest-spinning pulsar known, in the globular cluster Terzan 5.' },
  'J0437-4715': { names: [], note: 'The nearest and brightest millisecond pulsar; NICER measured its size.' },
  'J0740+6620': { names: ['heaviest neutron star'], note: 'One of the heaviest neutron stars weighed, about 2.1 solar masses.' },
  'J1959+2048': { names: ['Black Widow Pulsar'], note: 'It is slowly evaporating its small companion star.' },
  'J0030+0451': { names: [], note: 'NICER mapped the hot spots on its surface.' },
};

/** "PSR J0437−4715". */
export const pulsarName = (p: Pick<Pulsar, 'jname'>): string => `PSR ${minus(p.jname)}`;

/** Its kind in a few words, from the catalogue's types and its spin. */
export function pulsarWhat(p: Pick<Pulsar, 'p0' | 'types'> & { magnetar?: Pick<Magnetar, 'kind' | 'flag'> }): string {
  if (p.magnetar?.kind === 'PSR') return 'Pulsar with magnetar outbursts';
  if (p.magnetar?.flag === 'candidate') return 'Magnetar candidate';
  if (p.magnetar || p.types.includes('AXP')) return 'Magnetar';
  if (p.types.some((t) => t.startsWith('RRAT'))) return 'Rotating radio transient';
  if (p.types.includes('XINS')) return 'Isolated neutron star';
  if (p.p0 < 0.03) return 'Millisecond pulsar';
  return 'Pulsar';
}

/** A pulsar's body id from its J name. */
export const pulsarId = (jname: string): string => `psr-${slug(jname)}`;

/** Magnetars known for an event of their own (by the McGill catalogue's name), with their sources (DOIs). */
export const FAMOUS_MAGNETARS: Record<string, { note: string; dois: string[]; labels: string[] }> = {
  'SGR 1806-20': {
    note: 'On 27 December 2004 it let out a giant flare, the brightest burst of light from beyond the Solar System ever recorded at Earth: in about a fifth of a second some 2 × 10⁴⁶ erg if it is 15 kpc away (a third of that at the 8.7 kpc used here), more than the Sun gives out in a hundred thousand years.',
    dois: ['10.1038/nature03519', '10.1038/nature03525'],
    labels: ['Hurley et al. 2005', 'Palmer et al. 2005'],
  },
  'SGR 1935+2154': {
    note: 'On 28 April 2020 it sent out a fast radio burst, the first seen from inside the Milky Way, tying those millisecond flashes to magnetars.',
    dois: ['10.1038/s41586-020-2863-y', '10.1038/s41586-020-2872-x'],
    labels: ['CHIME/FRB Collaboration 2020', 'Bochenek et al. 2020'],
  },
  'SGR 0526-66': {
    note: 'Its giant flare of 5 March 1979, seen from the Large Magellanic Cloud by spacecraft across the Solar System, was the first sign that such objects exist.',
    dois: ['10.1038/282587a0'],
    labels: ['Mazets et al. 1979'],
  },
  'SGR 1900+14': {
    note: 'It gave out a giant flare on 27 August 1998, pulsing with its 5.2-second spin as it faded.',
    dois: ['10.1038/16199'],
    labels: ['Hurley et al. 1999'],
  },
};

const MCGILL = 'McGill Online Magnetar Catalog (Olausen & Kaspi 2014, ApJS 212, 6)';
const MCGILL_URL = 'https://www.physics.mcgill.ca/~pulsar/magnetar/main.html';

export function pulsarEntry(p: Pulsar, index: number): DeepSkyEntry {
  const m = p.magnetar;
  const famous = FAMOUS_PULSARS[p.jname];
  const own = !!m && !m.atnf;
  // A magnetar goes by its own name ("SGR 1806−20"); its ATNF designation stays an alias.
  const name = m ? minus(m.name) : famous?.names[0] && !/^(first|fastest|heaviest|binary)/.test(famous.names[0]) ? famous.names[0] : pulsarName(p);
  const designations = own
    ? [m.name, minus(m.name)]
    : [pulsarName(p), `PSR ${p.jname}`, p.jname, minus(p.jname), ...(p.bname ? [`PSR ${minus(p.bname)}`, `PSR ${p.bname}`, p.bname, minus(p.bname)] : []), ...(m ? [m.name, minus(m.name)] : [])];
  const kind = m?.kind === 'SGR' ? ' (soft gamma repeater)' : m?.kind === 'AXP' ? ' (anomalous X-ray pulsar)' : '';
  return {
    set: 'pulsars',
    index,
    id: own ? `magnetar-${slug(m.name)}` : pulsarId(p.jname),
    name,
    aliases: [...new Set([...designations, ...(famous?.names ?? []), ...(m ? ['magnetar'] : [])])].filter((a) => a !== name),
    kindText: m ? `${pulsarWhat(p)}${kind}` : name === pulsarName(p) ? pulsarWhat(p) : `${pulsarWhat(p)} · ${pulsarName(p)}`,
    // Every magnetar is a body while the catalogue is loaded: there are only some thirty.
    prominent: !!famous || !!m,
  };
}

/** "3.9 × 10¹⁴". */
function sci(x: number, digits = 2): string {
  const e = Math.floor(Math.log10(Math.abs(x)));
  const sup = String(e)
    .replace(/-/g, '⁻')
    .replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  return `${(x / 10 ** e).toFixed(digits - 1)} × 10${sup}`;
}

/** Where a magnetar's distance comes from, in words, with the paper the catalogue cites (its ADS bibcode). */
function magnetarDistanceSource(m: Magnetar): string {
  const ref = m.distRef ?? '';
  const bib = ref.split(' ')[1];
  const paper = bib && /^\d{4}/.test(bib) ? `ADS ${bib}` : ref;
  return `${m.distApprox ? 'an approximate distance' : 'the distance'} the ${MCGILL} adopts${paper ? ` (${paper})` : ''}`;
}

export { shownPulse, WATCHABLE_PERIOD_S } from './pulsarModel';

const ATNF = 'ATNF Pulsar Catalogue (Manchester et al. 2005, AJ 129, 1993)';
const ATNF_URL = 'https://www.atnf.csiro.au/research/pulsar/psrcat/';

/** Its globular cluster or galaxy, from the catalogue's associations ("GC:47Tuc(NGC104)" → "47 Tuc (NGC 104)"). */
function pulsarHome(p: Pulsar): { cluster?: string; galaxy?: 'Large Magellanic Cloud' | 'Small Magellanic Cloud' } {
  const gc = p.assoc.find((a) => a.startsWith('GC:'));
  const ex = p.assoc.find((a) => a.startsWith('EXGAL:'));
  // "M3(NGC5272)" → "M3 (NGC 5272)", "47Tuc(NGC104)" → "47 Tuc (NGC 104)", "Terzan5" → "Terzan 5".
  const cluster = gc
    ? gc
        .slice(3)
        .replace(/([A-Za-z]{2,})(\d)/g, '$1 $2')
        .replace(/^(\d+)([A-Za-z])/, '$1 $2')
        .replace(/\s*\(/, ' (')
    : undefined;
  const galaxy = ex?.includes('LMC') ? 'Large Magellanic Cloud' : ex?.includes('SMC') ? 'Small Magellanic Cloud' : undefined;
  return { cluster, galaxy };
}

const COMPANION: Record<string, string> = { He: 'a helium white dwarf', CO: 'a white dwarf', ONeMg: 'a white dwarf', NS: 'another neutron star', MS: 'a main-sequence star', UL: 'a very light star', BH: 'a black hole' };

function pulsarDistanceSource(p: Pulsar): string {
  switch (p.method) {
    case 'parallax':
      return `its parallax (${ATNF})`;
    case 'independent':
      return `an independent measurement: its globular cluster’s or nebula’s distance, a parallax or the hydrogen in front of it (DIST_A, ${ATNF})`;
    case 'limits':
      return `between published limits (${ATNF})`;
    case 'dm':
      return `its dispersion measure, ${p.dm} pc cm⁻³, through the YMW16 model of the Galaxy’s free electrons (Yao, Manchester & Wang 2017, ApJ 835, 29; ${ATNF})`;
  }
}

/** The card's line for a distance from the dispersion measure. */
export const DM_DISTANCE_NOTE =
  'Its distance comes from its dispersion measure (how much its radio pulses are delayed by free electrons) and a model of those electrons: often off by a quarter, sometimes by a factor of two.';

export function pulsarRecord(p: Pulsar, entry: DeepSkyEntry): BodyRecord {
  if (p.magnetar) return magnetarRecord(p, p.magnetar, entry);
  const famous = FAMOUS_PULSARS[p.jname];
  const spin = 1 / p.p0;
  const pulse = shownPulse(p.p0);
  const model = pulsarModel(p);
  const home = pulsarHome(p);
  const facts: string[] = [];
  if (Number.isFinite(spin)) {
    const rate = spin >= 2 ? `spinning ${rounded(spin, 3)} times a second` : `turning once every ${rounded(p.p0, 3)} seconds`;
    const shown = pulse.slowedBy === 1 ? 'it is shown turning at that rate' : `it is shown turning ${pulse.slowedBy.toLocaleString('en-GB')} times slower`;
    facts.push(`A neutron star ${rate}, its radio beam sweeping past us each turn; ${shown}.`);
  }
  if (Number.isFinite(p.pbDays)) facts.push(`It orbits ${p.companion && COMPANION[p.companion] ? COMPANION[p.companion] : 'a companion'} every ${p.pbDays < 1 ? `${rounded(p.pbDays * 24)} hours` : `${rounded(p.pbDays)} days`}${home.cluster ? `, in the globular cluster ${home.cluster}` : ''}.`);
  else if (home.cluster) facts.push(`In the globular cluster ${home.cluster}.`);
  if (famous?.note) facts.push(famous.note);
  const charAgeYr = p.p1 > 0 ? p.p0 / (2 * p.p1) / (365.25 * 86400) : NaN;
  const info: DeepSkyInfo = {
    type: pulsarWhat(p),
    distancePc: p.distPc,
    ...(p.distLoPc > 0 && p.distHiPc > p.distLoPc ? { distanceLoPc: p.distLoPc, distanceHiPc: p.distHiPc } : {}),
    distanceSource: pulsarDistanceSource(p),
    rows: [
      ...(Number.isFinite(p.p0) ? [{ l: 'Spin period', v: p.p0 < 0.1 ? (p.p0 * 1000).toPrecision(6) : p.p0.toPrecision(6), u: p.p0 < 0.1 ? 'ms' : 's', title: ATNF }] : []),
      ...(Number.isFinite(p.dm) ? [{ l: 'Dispersion measure', v: String(p.dm), u: 'pc cm⁻³', title: ATNF }] : []),
      ...(Number.isFinite(charAgeYr) ? [{ l: 'Characteristic age P/2Ṗ', v: rounded(charAgeYr), u: 'years', title: 'An upper limit on its true age if it was born spinning fast' }] : []),
      ...(Number.isFinite(p.pbDays) ? [{ l: 'Orbital period', v: rounded(p.pbDays, 4), u: 'days', title: ATNF }] : []),
    ],
    hostGalaxy: home.galaxy,
    cardNote: p.method === 'dm' ? DM_DISTANCE_NOTE : undefined,
    refs: [`${ATNF} (position, spin, distance)`],
  };
  const slowed = pulse.slowedBy === 1 ? 'at its real rate' : `${pulse.slowedBy.toLocaleString('en-GB')} times slower than it really does`;
  const pair = model?.pair;
  const modelNotes = [
    model
      ? `Up close: the neutron star, about 24 km across, its two radio beams and its magnetic field, turning ${slowed}. Radio is invisible to the eye: the beams are shown in false colour, their width from its spin (Rankin 1993). From afar it is a small marker that pulses with it.`
      : 'Shown as a small marker. A neutron star about 24 km across, it is far too small and faint to see.',
    ...(model?.orientation === 'measured'
      ? ['The tilt of its spin axis is measured (from the X-ray rings round it, or from its orbit); its beam sweeps over us each turn, as it must for us to see it pulse.']
      : model
        ? ['Which way its spin axis points is not known: it is chosen so that a beam sweeps over us each turn, as it must for us to see it pulse.']
        : []),
    ...(pair
      ? [
          `Its companion, ${pair.companionName ?? 'a neutron star'}, and their orbits round their centre of mass: the period from the catalogue, ${pair.eKnown ? 'the masses and the orbit’s shape published' : 'the masses taken as 1.35 and 1.25 Suns and the orbit drawn as a circle (its shape is not in our data)'}, its size from Kepler’s law; the orbit’s orientation in space is chosen.`,
        ]
      : []),
    ...(p.method === 'dm' ? [DM_DISTANCE_NOTE] : []),
  ];
  return {
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases,
    kind: 'pulsar',
    kindText: entry.kindText,
    parent: null,
    // A neutron star's radius, about 12 km (NICER's measurements: Riley et al. 2021, Miller et al. 2021).
    physical: { radiusKm: NS_RADIUS_KM, colour: '#9fd8ff' },
    visual: { renderer: 'layer' },
    // Framed by its light cylinder, or a pair by its orbit; as close as three of its radii.
    framing: { distanceKm: model ? (model.pair ? 2.5 : 4) * model.sizeKm : 1e8, minKm: 3 * NS_RADIUS_KM },
    detector: false,
    orbitLine: false,
    onDemand: true,
    deepSky: info,
    ...(model ? { pulsar: model } : {}),
    facts,
    factSources: [ATNF_URL, doiUrl('10.1086/428488')],
    factSourceLabels: ['ATNF Pulsar Catalogue', 'Manchester et al. 2005'],
    positionNote: `Position: ${ATNF}, at its distance, held fixed (its motion across the sky is not followed).`,
    modelNotes,
    dataSource: ATNF,
    article: 'what-stars-are-made-of',
    provider: fixedGalacticProvider(p.pos, 'Catalogue position at the catalogue’s distance'),
  };
}

/** A magnetar's record: the McGill catalogue's numbers, its twisted field up close, and its story where it has one. */
function magnetarRecord(p: Pulsar, m: Magnetar, entry: DeepSkyEntry): BodyRecord {
  const model = pulsarModel(p);
  const famous = FAMOUS_MAGNETARS[m.name];
  const pulse = shownPulse(m.p0);
  const radio = radioMagnetar(m);
  const home = m.assoc?.includes('LMC') ? ('Large Magellanic Cloud' as const) : m.assoc?.includes('SMC') ? ('Small Magellanic Cloud' as const) : undefined;
  const facts: string[] = [];
  const field = Number.isFinite(m.bG)
    ? `a magnetic field of about ${sci(m.bG)} gauss at its surface${m.bG > 1e14 ? ', hundreds of times a typical pulsar’s and a thousand million million times Earth’s' : ''}`
    : 'a field too strong to measure from its spin alone';
  facts.push(`A magnetar: a neutron star with ${field}, inferred from how fast its ${rounded(m.p0, 3)}-second spin is slowing.`);
  if (Number.isFinite(m.lxErgS) && Number.isFinite(m.edotErgS) && m.lxErgS > m.edotErgS)
    facts.push('It shines in X-rays more brightly than its slowing spin could power: the energy comes from its decaying magnetic field.');
  if (famous) facts.push(famous.note);
  else if (m.activity.includes('F')) facts.push('It has given out a giant flare.');
  const info: DeepSkyInfo = {
    type: pulsarWhat(p),
    distancePc: p.distPc,
    ...(p.distLoPc > 0 && p.distHiPc > p.distLoPc ? { distanceLoPc: p.distLoPc, distanceHiPc: p.distHiPc } : {}),
    distanceSource: magnetarDistanceSource(m),
    rows: [
      { l: 'Spin period', v: m.p0 < 0.1 ? (m.p0 * 1000).toPrecision(6) : m.p0.toPrecision(6), u: m.p0 < 0.1 ? 'ms' : 's', title: MCGILL },
      ...(Number.isFinite(m.p1) ? [{ l: 'Spin-down Ṗ', v: `${m.p1Upper ? '< ' : ''}${sci(m.p1)}`, u: 's/s', title: MCGILL }] : []),
      ...(Number.isFinite(m.bG) ? [{ l: 'Surface magnetic field', v: `${m.p1Upper ? '< ' : ''}${sci(m.bG)}`, u: 'G', title: `3.2 × 10¹⁹ (P Ṗ)^½ G: ${MCGILL}` }] : []),
      ...(Number.isFinite(m.edotErgS) ? [{ l: 'Spin-down power', v: sci(m.edotErgS), u: 'erg/s', title: MCGILL }] : []),
      ...(Number.isFinite(m.lxErgS) ? [{ l: 'X-ray luminosity (2–10 keV)', v: sci(m.lxErgS), u: 'erg/s', title: MCGILL }] : []),
      ...(Number.isFinite(m.ageYr) ? [{ l: 'Characteristic age P/2Ṗ', v: rounded(m.ageYr), u: 'years', title: 'An upper limit on its true age if it was born spinning fast' }] : []),
    ],
    hostGalaxy: home,
    cardNote: m.flag === 'candidate' ? 'A candidate magnetar: its nature is not yet certain.' : undefined,
    refs: [`${MCGILL} (period, spin-down, field, distance)`, ...(m.atnf ? [`${ATNF} (position)`] : []), ...(famous?.labels ?? [])],
  };
  const slowed = pulse.slowedBy === 1 ? 'at its real rate' : `${pulse.slowedBy.toLocaleString('en-GB')} times slower than it really does`;
  const modelNotes = [
    `Up close: the neutron star, about 24 km across, turning ${slowed}, with hot spots where its strongest field lines meet the surface, and its magnetosphere drawn as dipole loops a few star radii across, twisted about the magnetic axis by about a radian, as Thompson, Lyutikov & Kulkarni (2002) describe magnetars. The loops are a model, in false colour.`,
    radio
      ? 'It has been seen pulsing in radio: its radio beams are drawn, their width from its spin (Rankin 1993).'
      : 'It has not been seen pulsing in radio: no beams are drawn. It is seen in X-rays.',
    'Which way its spin axis points is not known: it is chosen.',
  ];
  return {
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases,
    kind: 'pulsar',
    kindText: entry.kindText,
    parent: null,
    physical: { radiusKm: NS_RADIUS_KM, colour: '#ff8fe0' },
    visual: { renderer: 'layer' },
    framing: { distanceKm: model ? 3 * model.sizeKm : 1e8, minKm: 3 * NS_RADIUS_KM },
    detector: false,
    orbitLine: false,
    onDemand: true,
    deepSky: info,
    ...(model ? { pulsar: model } : {}),
    facts,
    factSources: [MCGILL_URL, doiUrl('10.1088/0067-0049/212/1/6'), ...(famous?.dois.map(doiUrl) ?? [])].slice(0, facts.length),
    factSourceLabels: ['McGill Online Magnetar Catalog', 'Olausen & Kaspi 2014', ...(famous?.labels ?? [])].slice(0, facts.length),
    positionNote: `Position: ${m.atnf ? ATNF : MCGILL}, at the magnetar catalogue’s distance, held fixed.`,
    modelNotes,
    dataSource: m.atnf ? `${MCGILL}; position ${ATNF}` : MCGILL,
    article: 'what-stars-are-made-of',
    provider: fixedGalacticProvider(p.pos, 'Catalogue position at the magnetar catalogue’s distance'),
  };
}

// ─── Supernova remnants ─────────────────────────────────────────────────────────────────

/** "G263.9−3.3". */
export const snrDesignation = (s: Pick<Snr, 'name'>): string => minus(s.name);

export function snrEntry(s: Snr, index: number): DeepSkyEntry {
  const g = snrDesignation(s);
  const name = s.aliases[0] ?? `SNR ${g}`;
  return {
    set: 'snrs',
    index,
    id: `snr-${slug(s.name)}`,
    name,
    aliases: [...new Set([`SNR ${g}`, g, s.name, `SNR ${s.name}`, ...s.aliases])].filter((a) => a !== name),
    kindText: `${s.flag === 'uncertain' ? 'Possible supernova remnant' : 'Supernova remnant'}${s.aliases[0] ? ` · ${g}` : ''}`,
    prominent: s.aliases.length > 0,
  };
}

const RL22 = 'Ranasinghe & Leahy 2022, ApJ 940, 63';
const RL22_DOI = '10.3847/1538-4357/ac940a';

export function snrRecord(s: Snr, entry: DeepSkyEntry, methods: SnrFile['methods']): BodyRecord {
  const how = methods[s.method] ?? { text: 'the literature', estimate: false };
  const info: DeepSkyInfo = {
    type: s.flag === 'uncertain' ? 'Possible supernova remnant' : 'Supernova remnant',
    distancePc: s.distPc,
    ...(s.distLoPc > 0 && s.distHiPc > s.distLoPc ? { distanceLoPc: s.distLoPc, distanceHiPc: s.distHiPc } : {}),
    distanceSource: `${how.text}${s.ref ? ` (${s.ref})` : ''}, as compiled by ${RL22}`,
    cardNote: how.estimate ? 'Its distance is a model’s estimate, not a measurement.' : undefined,
    refs: [`${RL22} (distance)`, 'Green 2025, J. Astrophys. Astron. 46, 14 (the catalogue of remnants and its names)'],
  };
  // Its size is not in the open data used: drawn and framed as a few parsecs, typical of a young remnant.
  const rPc = 5;
  return {
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases,
    kind: 'nebula',
    kindText: entry.kindText,
    parent: null,
    physical: { radiusKm: rPc * PARSEC_KM, colour: '#ffb380' },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 8 * rPc * PARSEC_KM },
    detector: false,
    orbitLine: false,
    onDemand: true,
    deepSky: info,
    facts: [
      `The expanding debris of a star that exploded, sweeping up the gas around it${s.flag === 'uncertain' ? ' (that it is a remnant still needs confirming)' : ''}.`,
    ],
    factSources: [doiUrl(RL22_DOI)],
    factSourceLabels: ['Ranasinghe & Leahy 2022'],
    positionNote: `Position: the galactic longitude and latitude its name gives (to 0.1°), at the adopted distance, held fixed.`,
    modelNotes: ['Shown as a marker of fixed size: its size, shape and look are not drawn.'],
    dataSource: RL22,
    article: 'what-stars-are-made-of',
    provider: fixedGalacticProvider(s.pos, 'Galactic coordinates of its name at the adopted distance'),
  };
}

// ─── Gravitational-wave events ──────────────────────────────────────────────────────────

/** The best-known mergers: bodies (with labels) while their catalogue is loaded. */
export const FAMOUS_MERGERS = new Set(['GW150914', 'GW170817', 'GW190521', 'GW190814', 'GW230529_181500', 'GW250114_082203']);

const MERGER_WHAT = { bhbh: 'Black hole merger', bhns: 'Black hole–neutron star merger', nsns: 'Neutron star merger' } as const;

export function gwEntry(e: GwEvent, index: number): DeepSkyEntry {
  const short = e.name.replace(/_\d{6}$/, '');
  return {
    set: 'gw-events',
    index,
    id: slug(e.name),
    name: e.name,
    aliases: [...new Set([short, e.name.replace(/_/g, ' '), `${short} merger`])].filter((a) => a !== e.name),
    kindText: MERGER_WHAT[e.kind],
    prominent: FAMOUS_MERGERS.has(e.name),
  };
}

/** The 90 % region's size, Mpc: across the sky at its distance, and its depth along the line of sight (half of each). */
export function regionHalfSizesMpc(e: Pick<GwEvent, 'dcMpc' | 'dcLoMpc' | 'dcHiMpc' | 'area90Deg2'>): { across: number; deep: number } {
  return { across: e.dcMpc * Math.sin(regionRadiusRad(e.area90Deg2)), deep: (e.dcHiMpc - e.dcLoMpc) / 2 };
}

const GWOSC = 'LIGO, Virgo and KAGRA, via GWOSC (CC BY 4.0)';
const NS_WORD = (m: number) => (m < 3 ? 'neutron star' : 'black hole');

/** "1.46 and 1.27" solar masses, rounded to what the 90 % intervals allow. */
const massText = (m: number): string => (m >= 10 ? Math.round(m).toString() : m.toFixed(m >= 3 ? 1 : 2));

export function gwRecord(e: GwEvent, entry: DeepSkyEntry): BodyRecord {
  const when = new Date(gpsToUnixMs(e.gps));
  const date = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const { across, deep } = regionHalfSizesMpc(e);
  const radiusKm = Math.max(across, deep) * MPC_KM;
  const patchy = e.onePatch < 0.75;
  const pair = e.kind === 'bhbh' ? 'Black holes' : e.kind === 'nsns' ? 'Neutron stars' : `A ${NS_WORD(e.m1)} and a ${NS_WORD(e.m2)}`;
  const facts = [
    `${pair} of ${massText(e.m1)} and ${massText(e.m2)} solar masses merged${Number.isFinite(e.mFinal) ? ` into one of ${massText(e.mFinal)}` : ''}; the gravitational waves reached Earth on ${date}.`,
  ];
  if (e.name === 'GW170817') facts.push('Light from the collision (a kilonova) pinned it to the galaxy NGC 4993: the only merger yet seen in light as well.');
  if (e.name === 'GW150914') facts.push('The first gravitational waves ever detected.');
  const info: DeepSkyInfo = {
    type: MERGER_WHAT[e.kind],
    distancePc: e.dcMpc * 1e6,
    distanceLoPc: e.dcLoMpc * 1e6,
    distanceHiPc: e.dcHiMpc * 1e6,
    distanceNow: true,
    distanceSource: `the waves’ strength: luminosity distance ${Math.round(e.dlMpc)} Mpc (90 %: ${Math.round(e.dlLoMpc)} to ${Math.round(e.dlHiMpc)}), turned into where it is now in the Planck 2018 cosmology (${e.catalog}; ${GWOSC})`,
    sizes: [
      { label: 'Region drawn, across (90 % of the sky’s probability)', pc: 2 * across * 1e6, title: `${Math.round(e.area90Deg2).toLocaleString('en-GB')} deg² of sky` },
      { label: 'Region drawn, deep (90 % of the distance’s probability)', pc: 2 * deep * 1e6 },
    ],
    rows: [
      { l: 'Masses', v: `${massText(e.m1)} + ${massText(e.m2)}`, u: 'M☉', title: `Source frame, 90 %: ${massText(e.m1 + e.m1Lo)}–${massText(e.m1 + e.m1Hi)} and ${massText(e.m2 + e.m2Lo)}–${massText(e.m2 + e.m2Hi)}` },
      ...(Number.isFinite(e.mFinal) ? [{ l: 'Remnant mass', v: massText(e.mFinal), u: 'M☉' }] : []),
      { l: 'Sky area (90 %)', v: Math.round(e.area90Deg2).toLocaleString('en-GB'), u: 'deg²' },
      ...(Number.isFinite(e.chiEff) ? [{ l: 'Effective spin χ_eff', v: e.chiEff.toFixed(2) }] : []),
      ...(Number.isFinite(e.snr) ? [{ l: 'Signal-to-noise ratio', v: e.snr.toFixed(1) }] : []),
    ],
    cardNote:
      e.name === 'GW170817'
        ? `Drawn as the region the waves alone allow (${Math.round(e.area90Deg2)} deg² of sky), centred on NGC 4993.`
        : `Where it happened is uncertain: drawn as a soft region of ${Math.round(e.area90Deg2).toLocaleString('en-GB')} deg² of sky${patchy ? ' (in truth in two or more patches; drawn round the most probable)' : ''} and ${lyWords(2 * deep * 1e6)} deep.`,
    refs: [`${e.catalog} parameter estimates and sky map (${GWOSC})`],
  };
  return {
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases,
    kind: 'merger',
    kindText: entry.kindText,
    parent: null,
    physical: { radiusKm, colour: '#c9b8ff' },
    visual: { renderer: 'layer' },
    // From far enough that its region is under 250 px across (gwRegion.vert.glsl draws no larger).
    framing: { distanceKm: 6 * radiusKm, minKm: 0.01 * radiusKm },
    labelRank: 13.8,
    detector: false,
    orbitLine: false,
    onDemand: true,
    deepSky: info,
    facts,
    factSources: [`https://gwosc.org/eventapi/html/${e.catalog}/`],
    factSourceLabels: [`GWOSC ${e.catalog}`],
    positionNote:
      e.name === 'GW170817'
        ? 'Position: its galaxy NGC 4993 (OpenNGC), at the waves’ distance; carried by the expansion of the universe.'
        : 'Position: the most probable direction of its sky map, at the median of its distance; carried by the expansion of the universe.',
    modelNotes: [
      'Its light, if any, was not seen (but for GW170817): the region is where the waves say it probably was, not a picture of anything.',
      'Masses are source-frame medians; a component lighter than 3 solar masses is counted a neutron star, as the catalogue’s papers class them.',
    ],
    dataSource: `${e.catalog} (${GWOSC})`,
    article: 'black-holes',
    provider: expandingPlaceProvider(e.pos, e.pos, 'Most probable place, carried by the expansion of the universe'),
  };
}
