/**
 * The black holes' body records, from blackholes.json: M87* at the centre of M87 and the other supermassive holes at
 * the centres of nearby galaxies (those the app registers with the galaxies, and those of the NGC catalogue, which
 * the app registers only on demand: such a hole carries its galaxy's place), the binaries (each a barycentre in
 * straight-line motion, the hole and its companion star on their published orbit about it; three of them in the
 * Magellanic Clouds and M33) and OGLE-2011-BLG-0462 alone; and the black-hole block of Sagittarius A*'s record
 * (sim/galaxy/records.ts keeps its mass and place, from sstars.json).
 *
 * How: pure functions of the files (the tests call them with the files read from disk). The binaries use the
 * stars' own providers (sim/stars/records.ts: linearStarProvider for the barycentre, orbitStarProvider for the
 * two members, the published orbits evaluated a light-time on, as for every star system), so a hole in a
 * binary moves exactly as a star in one would. A hole's size is its horizon, r_s = 2GM/c²; the camera may
 * come down to r_s(1 + 10⁻⁶) (the hover floor: 27 mm above Gaia BH1's horizon, 12.7 km above Sgr A*'s),
 * which only the hole-relative camera of controls/cameraController.ts can hold. The companions are drawn
 * from the papers' radii, temperatures and luminosities with Flower's bolometric correction, as the stars'
 * literature values are, and without the dust between us and them (the card says how much dimmer they look
 * from Earth).
 *
 * Why here: the records are the one place the data become bodies; everything else (lens, clocks, card,
 * labels, search) reads the record's `blackHole` block and the registry.
 *
 * Cost: built once at registration (a few dozen records); nothing per frame.
 *
 * Twins: scripts/build-blackholes.mjs (the data and how the orbits were made); src/sim/stars/records.ts (the
 * providers and the star records this mirrors); docs/data/blackholes.md §5.
 */
import type { AstroTime } from 'astronomy-engine';
import { AU_KM, C_KM_S, GM_SUN_KM3_S2, MPC_KM, PARSEC_KM } from '../../physics/constants';
import { msFromAstroTime } from '../../lib/time';
import { sig } from '../../lib/sci';
import { ALWAYS, atCentreProvider, fixedStarProvider } from '../bodies/providers/simple';
import type { Availability, BlackHoleDisk, BlackHoleInfo, BodyId, BodyRecord, DeepSkyInfo, PositionProvider, StarInfo, Vec3Like } from '../bodies/types';
import { cosmicAtMemo } from '../cosmicTime';
import { EARLIEST_GALAXIES_GYR } from '../cosmos/expansion';
import { ISCO_M, mdotFromEddington, NT_PEAK_M, ntLnTemperature, ntLnTStar } from '../../physics/thinDisk';
import type { Stars3D } from '../stars/catalogue';
import { SUN_RADIUS_KM, SUN_TEFF_K } from '../stars/constants';
import { bolometricCorrection, SUN_M_BOL } from '../stars/photometry';
import { barycentreId, linearStarProvider, orbitStarProvider, starColour, starKindText, starLabelRank, type SystemMotion } from '../stars/records';
import blackHolesJson from './blackholes.json';
import { fieldFact } from './holeField';
import type { BlackHolesFile, CatalogueGalaxyJson, CompanionJson, DiskJson, HoleJson, HoleOrbitJson, HoleSystemJson, Sourced } from './types';

/** The data file as shipped. */
export const BLACK_HOLES = blackHolesJson as unknown as BlackHolesFile;

/** The camera's closest approach to a hole, in horizon radii: r_s(1 + 10⁻⁶), where the hovering clock runs at α = 10⁻³. */
export const HOVER_FLOOR_RADIUS_RS = 1 + 1e-6;
/**
 * A stellar hole is framed from 10⁴ r_s (2.7 × 10⁵ km at Gaia BH1, where the Einstein ring of the sky behind it
 * is 0.014 rad in radius, 1.6° across); M87* from 50 r_s (6,400 au, outside the flight planner's 30 r_s refusal).
 */
export const STELLAR_FRAMING_RS = 1e4;
export const M87_FRAMING_RS = 50;
/** Label priorities: a stellar hole ranks with the stars (12), M87* just ahead of its galaxy (13.3). */
export const STELLAR_LABEL_RANK = 12;
export const M87_LABEL_RANK = 13.2;
/**
 * The other supermassive holes at galaxies' centres are framed and ranked as M87* is: from 50 r_s (2.5 au at M32's,
 * 1.4 × 10⁵ au at NGC 4889's), just ahead of their galaxy's label.
 */
export const GALAXY_HOLE_FRAMING_RS = M87_FRAMING_RS;
export const GALAXY_HOLE_LABEL_RANK = M87_LABEL_RANK;
/** How long an isolated hole's fixed place is trusted either side of J2000: at 51 km/s it moves 10 au a year. */
const ISOLATED_GOOD_YEARS = 100;
/**
 * A binary's present phase is called illustrative when the published period's uncertainty, carried over the
 * light-time to it (the orbit is evaluated that far after the epochs it was measured at), reaches this share of
 * an orbit.
 */
export const PHASE_ILLUSTRATIVE_ORBITS = 0.25;
/** The search words every stellar hole in a binary answers to besides its names ("black hole" finds them all). */
export const STELLAR_HOLE_ALIAS = 'stellar-mass black hole';

/**
 * How uncertain a binary's present phase is, in orbits: the published period's uncertainty times the orbits in the
 * light-time to it (the providers evaluate the orbit a light-time after the epochs of the observations).
 */
export function phaseUncertaintyOrbits(sys: HoleSystemJson): number {
  const orbit = sys.orbits[0];
  const p = (orbit.published as { periodDays?: Sourced }).periodDays;
  const unc = p?.unc;
  const sigmaP = typeof unc === 'number' ? unc : Array.isArray(unc) ? Math.max(unc[0], unc[1]) : 0;
  const lightDays = (sys.barycentre.distancePc * PARSEC_KM) / C_KM_S / 86_400;
  return (lightDays / orbit.periodDays) * (sigmaP / orbit.periodDays);
}

const TEN_PC_KM = 10 * PARSEC_KM;
const round = (x: number, digits: number) => Number(x.toPrecision(digits));

/** GM of a mass, km³/s². */
export const gmOf = (massMsun: number): number => massMsun * GM_SUN_KM3_S2;
/** The horizon radius 2GM/c² of a non-spinning hole, km. */
export const horizonRadiusKm = (massMsun: number): number => (2 * gmOf(massMsun)) / (C_KM_S * C_KM_S);

/** A hole's card lines: its file's, and its field's where one is drawn (holeField.ts fieldFact). */
const factsOf = (h: HoleJson): HoleJson['facts'] => {
  const f = fieldFact(h.id);
  return f ? [...h.facts, f] : h.facts;
};

/** A reference key's citation: the part of the file's text before " — ". */
export function citation(file: BlackHolesFile, key: string): string {
  return (file.refs[key] ?? key).split(' — ')[0];
}

/** Each key's citation once, in order. */
const citations = (file: BlackHolesFile, keys: readonly string[]): string[] => [...new Set(keys.map((k) => citation(file, k)))];

/**
 * A thin disc as drawn, from its record: the accretion rate a disc of no spin needs for the published luminosity
 * (the luminosity is what is measured; Ṁ follows from the efficiency, 5.7 % here where the real spinning hole's is
 * higher), its temperatures and edges in units of M = GM/c², and the real period at its inner edge.
 */
export function diskInfo(json: DiskJson, massMsun: number, orbit: HoleOrbitJson, file: BlackHolesFile = BLACK_HOLES): BlackHoleDisk {
  const mdotGs = mdotFromEddington(json.eddingtonFraction.value, json.lEddErgS.value);
  const lnTStarK = ntLnTStar(massMsun, mdotGs);
  const mCm = (gmOf(massMsun) / (C_KM_S * C_KM_S)) * 1e5;
  const mS = gmOf(massMsun) / C_KM_S ** 3;
  // The disc turns with the orbit: its axis is the orbit's angular momentum, p̂ × q̂ (J2000 ecliptic; world = (x, z, −y)).
  const [p, q] = [orbit.pHat, orbit.qHat];
  const n = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const nl = Math.hypot(n[0], n[1], n[2]);
  return {
    normalWorld: [n[0] / nl, n[2] / nl, -n[1] / nl],
    eddingtonFraction: json.eddingtonFraction.value,
    lEddErgS: json.lEddErgS.value,
    luminositySource: citation(file, json.eddingtonFraction.ref),
    mdotGs,
    lnTStarK,
    peakTK: Math.exp(ntLnTemperature(NT_PEAK_M, lnTStarK)),
    rInM: ISCO_M,
    rOutM: json.rOutCm.value / mCm,
    rOutSource: citation(file, json.rOutCm.ref),
    slowdown: json.slowdown,
    innerPeriodS: 2 * Math.PI * ISCO_M ** 1.5 * mS,
    refs: citations(file, json.refs),
  };
}

/** An uncertainty in words: "±0.10", "+0.23 −0.17", "±0.012 statistical, ±0.040 systematic". */
export function uncertaintyText(s: Sourced, scale = 1, digits = 2): string {
  const u = s.unc;
  const f = (x: number) => sig(x / scale, digits);
  if (u === undefined) return '';
  if (typeof u === 'number') return `±${f(u)}`;
  if (Array.isArray(u)) return `+${f(u[1])} −${f(u[0])}`;
  return `±${f(u.stat)} statistical, ±${f(u.sys)} systematic`;
}

/** A distance and its uncertainty as published: "480 ± 5 pc", "2,220 +180 −170 pc". */
function distanceText(d: Sourced): string {
  const u = d.unc;
  const n = (x: number) => x.toLocaleString('en-GB');
  const unc = typeof u === 'number' ? ` ± ${n(u)}` : Array.isArray(u) ? ` +${n(u[1])} −${n(u[0])}` : '';
  return `${n(d.value)}${unc} pc`;
}

/** Every entry of the file, by id. */
const holeJsonById = new Map<BodyId, HoleJson>(BLACK_HOLES.holes.map((h) => [h.id, h]));
/** The file's entry for a black hole, if it has one. */
export const holeJson = (id: BodyId): HoleJson | undefined => holeJsonById.get(id);

/** Sagittarius A*'s entry: what its record adds to sstars.json (spin, notes, the flow, the EHT's picture). */
export const SGR_A_BLACK_HOLE: HoleJson = holeJsonById.get('sgr-a-star')!;

/**
 * A black hole's block for its record. `orbit` and `companion`: the binary it is in. The mass is the file's;
 * `massMsun` overrides it (Sgr A*: sstars.json's, which the S-star orbits are fitted in; the tests check the
 * two agree).
 */
export function blackHoleInfoFrom(json: HoleJson, file: BlackHolesFile = BLACK_HOLES, orbit?: HoleOrbitJson, companion?: BodyId, massMsun = json.mass.value): BlackHoleInfo {
  const u = json.mass.unc;
  const pair = Array.isArray(u) ? u : undefined;
  const split = u !== undefined && typeof u === 'object' && !Array.isArray(u) ? u : undefined;
  const info: BlackHoleInfo = {
    class: json.class,
    massMsun,
    massStatMsun: typeof u === 'number' ? u : pair ? Math.max(pair[0], pair[1]) : (split?.stat ?? 0),
    massSysMsun: split?.sys ?? 0,
    massSource: citation(file, json.mass.ref),
    gmKm3S2: gmOf(massMsun),
    rsKm: horizonRadiusKm(massMsun),
    spin: { value: json.spin.value, status: json.spin.status, note: json.spin.note },
    fallAllowed: json.fallAllowed,
    refs: citations(file, json.refs),
  };
  if (pair) info.massUncMsun = [pair[0], pair[1]];
  if (json.massNote) info.massNote = json.massNote;
  if (json.massMethod) info.massMethod = json.massMethod;
  const host = hostGalaxyOf(json);
  if (host) info.hostGalaxy = host;
  if (json.flow) info.flow = json.flow;
  if (json.disk) {
    if (!orbit) throw new Error(`${json.id}: a disc is drawn in its binary's orbital plane, and it has no orbit`);
    info.disk = diskInfo(json.disk, massMsun, orbit, file);
  }
  if (json.ehtImage) info.ehtImage = json.ehtImage;
  if (companion) info.companion = companion;
  if (orbit?.assumed.length) info.assumed = orbit.assumed;
  if (json.sheetNotes?.length) info.sheetNotes = json.sheetNotes;
  return info;
}

/**
 * The galaxy a hole lies in when that is not the Milky Way and not its record's parent: a binary's host (LMC X-1's Large
 * Magellanic Cloud), or a catalogue galaxy (its deep-sky body's id, as src/sim/deepsky/records.ts makes it).
 */
function hostGalaxyOf(json: HoleJson): { id: BodyId; name: string } | undefined {
  if (json.placement === 'binary' && json.host) return { id: json.host, name: json.hostName ?? json.host };
  // A galaxy's hole is its galaxy's child too (M87*, which names no hostName, keeps its record as it was).
  if (json.placement === 'galaxy-centre' && json.host && json.hostName) return { id: json.host, name: json.hostName };
  if (json.placement === 'catalogue-galaxy' && json.galaxy) return { id: catalogueGalaxyId(json.galaxy.designation), name: json.galaxy.name };
  return undefined;
}

/** A designation's body id as the deep-sky layer makes it (src/sim/deepsky/records.ts slug): "NGC 4258" → "ngc-4258". */
export const catalogueGalaxyId = (designation: string): BodyId =>
  designation
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** "the Large Magellanic Cloud", "the Triangulum Galaxy", but "M84": a galaxy's name as a sentence uses it. */
export const galaxyInWords = (name: string): string => (/\b(Galaxy|Cloud)$/.test(name) ? `the ${name}` : name);

/** Sgr A*'s block, with the mass its record already has (sstars.json). */
export const sgrABlackHole = (massMsun: number, massStatMsun: number, massSysMsun: number): BlackHoleInfo => ({
  ...blackHoleInfoFrom(SGR_A_BLACK_HOLE, BLACK_HOLES, undefined, undefined, massMsun),
  massStatMsun,
  massSysMsun,
});

/** A distance with its uncertainty as the low and high ends, pc. */
function distanceRange(d: Sourced): { lo: number; hi: number } {
  const u = d.unc;
  if (typeof u === 'number') return { lo: d.value - u, hi: d.value + u };
  if (Array.isArray(u)) return { lo: d.value - u[0], hi: d.value + u[1] };
  return { lo: d.value, hi: d.value };
}

/** The data sheet's rows for a hole: its mass, horizon and the shadow seen from far away. */
function holeRows(file: BlackHolesFile, json: HoleJson, distancePc: number): NonNullable<DeepSkyInfo['rows']> {
  const m = json.mass.value;
  const rs = horizonRadiusKm(m);
  const shadow = (Math.sqrt(27) / 2) * rs;
  const power = m >= 1e5 ? Math.floor(Math.log10(m)) : 0;
  const unit = power ? ` × 10${superscript(power)}` : '';
  const unc = uncertaintyText(json.mass, 10 ** power);
  const shadowUas = ((2 * shadow) / (distancePc * PARSEC_KM)) * (180 / Math.PI) * 3600e6;
  return [
    { l: 'Mass', v: `${sig(m / 10 ** power, 3)}${unit}`, u: 'M☉', title: `${unc ? `${unc}${unit} M☉ ` : ''}(${citation(file, json.mass.ref)})${json.massNote ? `; ${json.massNote}` : ''}` },
    rs >= 0.01 * AU_KM
      ? { l: 'Event horizon radius 2GM/c²', v: sig(rs / AU_KM, 3), u: 'au', title: `${sig(rs, 3)} km, for a black hole that does not spin` }
      : { l: 'Event horizon radius 2GM/c²', v: sig(rs, 3), u: 'km', title: 'For a black hole that does not spin' },
    {
      l: 'Shadow from Earth',
      v: sig(shadowUas, 3),
      u: 'µas',
      title: `Diameter of the shadow seen from far away, 2√27 GM/c² (${sig(2 * shadow, 3)} km across): nearer, the lens makes it larger`,
    },
    ...(json.massMethod ? [{ l: 'Weighed by', v: json.massMethod, title: citation(file, json.mass.ref) }] : []),
  ];
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (n: number): string => String(n).replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]);

// ─── The binaries ────────────────────────────────────────────────────────────────────────

/** The companion's luminosity, L☉: the paper's, else from its radius and temperature (Stefan–Boltzmann). */
function companionLuminosity(c: CompanionJson): { lSun: number; published: boolean } {
  if (c.luminosityLsun) return { lSun: c.luminosityLsun.value, published: true };
  const r = c.radiusRsun.value;
  const t = c.teffK.value / SUN_TEFF_K;
  return { lSun: r * r * t * t * t * t, published: false };
}

/** Absolute V magnitude drawn for a companion, from its luminosity and temperature (Flower's bolometric correction, as starRecord's). */
export function companionAbsMagV(c: CompanionJson): number {
  return SUN_M_BOL - 2.5 * Math.log10(companionLuminosity(c).lSun) - bolometricCorrection(c.teffK.value);
}

/** The catalogue indices of the companions that are catalogue stars (Cygnus X-1's HDE 226868). */
export function holeCompanionIndices(file: BlackHolesFile = BLACK_HOLES): number[] {
  return file.companions.map((c) => c.catalogueIndex).filter((i): i is number => i !== null);
}

/**
 * Records of one binary with a black hole: its barycentre (not a destination), the hole (group 1 of the
 * orbit) and its companion star (group 2). `stars` (the catalogue, when loaded) only adds, for a companion
 * that is a catalogue star, what the catalogue says of it on its card.
 */
export function holeSystemRecords(file: BlackHolesFile, sys: HoleSystemJson, stars: Stars3D | null = null): BodyRecord[] {
  const orbit = sys.orbits[0];
  const holeId = orbit.primary[0];
  const starId = orbit.secondary[0];
  const hole = file.holes.find((h) => h.id === holeId);
  const comp = file.companions.find((c) => c.id === starId);
  if (!hole || !comp) throw new Error(`blackholes: ${sys.id} names ${holeId} and ${starId}, which the file does not have`);
  const rootId = barycentreId(sys.id);
  const b = sys.barycentre;
  const motion: SystemMotion = { posPc: b.posPc, velKms: b.velKms };
  const m1 = orbit.massPrimaryMsun;
  const m2 = orbit.massSecondaryMsun;
  const assumed = orbit.assumed.length > 0;
  const astroRefs = citations(file, b.refs).join('; ');
  const orbitRefs = citations(file, orbitRefKeys(orbit)).join('; ');
  const distancePc = b.distancePc;
  const range = distanceRange(b.distance);
  const howFar = `${b.distance.note ? `${b.distance.note}; ` : ''}${citation(file, b.distance.ref)}`;
  const phase = phaseUncertaintyOrbits(sys);
  const lightYears = Math.round((distancePc * PARSEC_KM) / C_KM_S / (365.25 * 86_400) / 10) * 10;
  const phaseNote = sys.phaseAssumed
    ? ` ${ASSUMED_PHASE_NOTE}`
    : phase >= PHASE_ILLUSTRATIVE_ORBITS
      ? ` Where the two are on their orbit now is illustrative: over the ${lightYears.toLocaleString('en-GB')} years their light takes to reach us, the period’s uncertainty adds up to ${phase >= 1 ? `${sig(phase, 2)} orbits` : `${sig(phase, 2)} of an orbit`} (with light-delayed positions on, the place shown is the one we see).`
      : '';
  const inGalaxy = hole.hostName ? ` in ${galaxyInWords(hole.hostName)}` : '';
  const place = `the system’s centre of mass${inGalaxy} in straight-line motion (${astroRefs}) at ${distanceText(b.distance)} (${howFar}), and the orbit about it (${orbitRefs})${assumed ? `, its orientation on the sky${sys.phaseAssumed ? ' and its phase' : ''} assumed` : ''}. Good for a million years either side of 2000.${phaseNote}`;

  const barycentre: BodyRecord = {
    id: rootId,
    name: sys.name,
    kind: 'barycentre',
    parent: null,
    physical: { radiusKm: 0, colour: '#ffffff', gmKm3S2: gmOf(b.massMsun) },
    provider: linearStarProvider(b.posPc, b.velKms, `Centre of mass of ${sys.name}: straight-line motion from ${astroRefs}`),
    orbitLine: false,
    detector: false,
    destination: false,
  };

  const rs = horizonRadiusKm(m1);
  const holeRecord: BodyRecord = {
    id: hole.id,
    name: hole.name,
    shortName: hole.shortName,
    aliases: [...hole.aliases, STELLAR_HOLE_ALIAS],
    kind: 'black-hole',
    kindText: 'Stellar-mass black hole',
    parent: rootId,
    centre: rootId,
    physical: { radiusKm: rs, gmKm3S2: gmOf(m1), colour: '#000000', orbitalPeriodD: orbit.periodDays },
    visual: { renderer: 'lens' },
    framing: { radii: STELLAR_FRAMING_RS, minKm: rs * HOVER_FLOOR_RADIUS_RS },
    orbitLine: hole.orbitLine ? {} : false,
    labelRank: STELLAR_LABEL_RANK,
    detector: false,
    deepSky: {
      type: 'Stellar-mass black hole in a binary',
      ...(hole.hostName ? { hostGalaxy: hole.hostName } : {}),
      distancePc,
      distanceLoPc: range.lo,
      distanceHiPc: range.hi,
      distanceSource: `the system’s, ${distanceText(b.distance)} (${howFar})`,
      rows: [
        ...holeRows(file, hole, distancePc),
        { l: 'Orbital period', v: orbit.periodDays >= 10 ? sig(orbit.periodDays, 5) : sig(orbit.periodDays * 24, 4), u: orbit.periodDays >= 10 ? 'days' : 'hours', title: orbitRefs },
        { l: 'Separation from its star', v: sig(orbit.aAu, 3), u: 'au', title: `Semi-major axis of the relative orbit, from Kepler’s third law with ${m1} + ${m2} M☉${orbit.e > 0 ? `; eccentricity ${orbit.e}` : ' (circular, assumed)'}` },
        { l: 'Companion', v: comp.name, title: comp.spectralType },
      ],
      refs: citations(file, [...hole.refs, ...b.refs]),
    },
    facts: factsOf(hole).map((f) => f.text),
    factSources: factsOf(hole).map((f) => f.source),
    factSourceLabels: factsOf(hole).map((f) => f.label),
    dataSource: `${citation(file, hole.mass.ref)} (mass); ${orbitRefs} (orbit)`,
    positionNote: `Position: ${place}`,
    modelNotes: hole.modelNotes.slice(0, 3),
    blackHole: blackHoleInfoFrom(hole, file, orbit, comp.id),
    provider: orbitStarProvider([{ orbit, f: -m2 / (m1 + m2), offsetPc: 0 }], motion, `Orbit in ${sys.name} (${orbitRefs}), about its centre of mass`),
  };

  return [barycentre, holeRecord, companionRecord(file, sys, comp, hole, motion, place, stars)];
}

/** The position note's end for an X-ray binary with no ephemeris used for its phase (HoleSystemJson.phaseAssumed). */
export const ASSUMED_PHASE_NOTE = 'Where the two are on their orbit is illustrative: no ephemeris is used for its phase, and the companion is put nearest to us at the start of 2000.';

/** The reference keys an orbit's published elements cite. */
function orbitRefKeys(orbit: HoleOrbitJson): string[] {
  const keys: string[] = [];
  for (const v of Object.values(orbit.published)) {
    const ref = (v as { ref?: unknown } | null)?.ref;
    if (typeof ref === 'string') keys.push(ref);
  }
  return keys;
}

/** The companion star of a binary with a black hole. */
function companionRecord(file: BlackHolesFile, sys: HoleSystemJson, c: CompanionJson, hole: HoleJson, motion: SystemMotion, place: string, stars: Stars3D | null): BodyRecord {
  const orbit = sys.orbits[0];
  const m1 = orbit.massPrimaryMsun;
  const m2 = orbit.massSecondaryMsun;
  const teffK = c.teffK.value;
  const radiusRsun = c.radiusRsun.value;
  const lum = companionLuminosity(c);
  const absMagV = companionAbsMagV(c);
  const distancePc = sys.barycentre.distancePc;
  const vFromSun = absMagV + 5 * Math.log10(distancePc) - 5;
  const estimated = (what: string) => !!c.estimated?.some((e) => e.startsWith(what));
  const teffEstimated = estimated('temperature');
  const radiusEstimated = estimated('radius');

  const notes: string[] = [];
  if (c.vMag) {
    const dust = c.vMag.value - vFromSun;
    notes.push(
      `Drawn without the dust between it and us: from Earth it shines at V ${c.vMag.value}${dust > 0.05 ? `, about ${sig(dust, 2)} magnitudes fainter than drawn` : ''}.`,
    );
  } else if (c.gMag) {
    notes.push(`Drawn without the dust between it and us: from Earth Gaia sees it at G ${c.gMag.value}${c.gMag.note ? ` (${c.gMag.note})` : ''}.`);
  }
  if (radiusEstimated) notes.push(`It fills its Roche lobe: its radius, ${sig(radiusRsun, 3)} solar radii, is the lobe’s (Eggleton 1983), and its brightness follows from that radius and its temperature.`);
  if (teffEstimated) notes.push(`Its temperature is not measured: ${teffK.toLocaleString('en-GB')} K is taken for its spectral type (${c.spectralType}).`);
  const i = c.catalogueIndex;
  if (i !== null) {
    const catTeff = stars && i < stars.count ? stars.teff[i] : 0;
    notes.push(
      `It is star ${i.toLocaleString('en-GB')} of the star catalogue, whose ${catTeff ? `${catTeff.toLocaleString('en-GB')} K ` : ''}colour temperature comes from its colour as seen from the Sun, through the dust: its measured ${teffK.toLocaleString('en-GB')} K and luminosity are used instead.`,
    );
  }

  const refKeys = [c.massMsun.ref, c.radiusRsun.ref, c.teffK.ref, ...(c.luminosityLsun ? [c.luminosityLsun.ref] : [])];
  const star: StarInfo = {
    catalogueIndex: i ?? undefined,
    spectralType: c.spectralType,
    teffK,
    teffSource: teffEstimated ? 'unknown' : 'literature',
    luminosityLsun: round(lum.lSun, 4),
    luminositySource: lum.published ? 'literature' : 'estimated',
    radiusRsun: round(radiusRsun, 4),
    radiusSource: radiusEstimated ? 'estimated' : 'literature',
    massMsun: c.massMsun.value,
    absMagV: round(absMagV, 4),
    vFromSun: round(vFromSun, 4),
    distancePc: round(distancePc, 7),
    distanceSource: `the system’s (${sys.barycentre.distance.note ? `${sys.barycentre.distance.note}; ` : ''}${citation(file, sys.barycentre.distance.ref)})`,
    distancePrecision: distanceText(sys.barycentre.distance),
    designations: c.designations,
    constellation: hole.constellation,
    refs: citations(file, refKeys),
  };
  return {
    id: c.id,
    name: c.name,
    aliases: c.aliases.filter((a) => a && a !== c.name),
    kind: 'star',
    kindText: c.kindText ?? starKindText(c.spectralType, teffK, absMagV),
    parent: barycentreId(sys.id),
    centre: barycentreId(sys.id),
    physical: {
      radiusKm: radiusRsun * SUN_RADIUS_KM,
      colour: starColour(teffK),
      luminous: { vmag: absMagV, atKm: TEN_PC_KM, teffK },
      gmKm3S2: gmOf(m2),
    },
    visual: { renderer: 'star' },
    dataSource: `${sys.name}: ${citations(file, refKeys).join('; ')}`,
    positionNote: `Position: ${place}`,
    modelNotes: notes,
    provider: orbitStarProvider([{ orbit, f: m1 / (m1 + m2), offsetPc: 0 }], motion, `Orbit in ${sys.name} about its centre of mass`),
    labelRank: starLabelRank(vFromSun),
    orbitLine: {},
    star,
  };
}

/** Every binary's records. */
export const binaryHoleRecords = (file: BlackHolesFile = BLACK_HOLES, stars: Stars3D | null = null): BodyRecord[] =>
  file.systems.flatMap((s) => holeSystemRecords(file, s, stars));

// ─── Alone, and at a galaxy's centre ─────────────────────────────────────────────────────

/** A black hole with no companion (OGLE-2011-BLG-0462), held at its measured place. */
export function isolatedHoleRecord(json: HoleJson, file: BlackHolesFile = BLACK_HOLES): BodyRecord {
  const a = json.astrometry;
  if (!a) throw new Error(`blackholes: ${json.id} has no position`);
  const d = a.distancePc;
  const range = distanceRange(d);
  const m = json.mass.value;
  const rs = horizonRadiusKm(m);
  return {
    id: json.id,
    name: json.name,
    shortName: json.shortName,
    aliases: json.aliases,
    kind: 'black-hole',
    kindText: 'Stellar-mass black hole',
    parent: null,
    physical: { radiusKm: rs, gmKm3S2: gmOf(m), colour: '#000000' },
    visual: { renderer: 'lens' },
    framing: { radii: STELLAR_FRAMING_RS, minKm: rs * HOVER_FLOOR_RADIUS_RS },
    orbitLine: false,
    labelRank: STELLAR_LABEL_RANK,
    detector: false,
    deepSky: {
      type: 'Isolated stellar-mass black hole',
      distancePc: d.value,
      distanceLoPc: range.lo,
      distanceHiPc: range.hi,
      distanceSource: `its lensing of a star behind it: ${citation(file, d.ref)}`,
      rows: holeRows(file, json, d.value),
      refs: citations(file, json.refs),
    },
    facts: factsOf(json).map((f) => f.text),
    factSources: factsOf(json).map((f) => f.source),
    factSourceLabels: factsOf(json).map((f) => f.label),
    dataSource: citations(file, json.refs).join('; '),
    positionNote: `Position: ${a.positionNote ?? 'its measured place'}, at ${distanceText(d)} (${citation(file, d.ref)}), held fixed: its motion of about 51 km/s past the stars round it is not followed.`,
    modelNotes: json.modelNotes.slice(0, 3),
    blackHole: blackHoleInfoFrom(json, file),
    provider: fixedStarProvider(a.raDeg, a.decDeg, d.value * PARSEC_KM, ISOLATED_GOOD_YEARS),
  };
}

/**
 * M87*, at the centre of M87 (a child of its galaxy's record, at its place): its distance is the galaxy's
 * placed distance, and in the expanding universe it goes where M87 goes (sim/blackholes/load.ts gives it
 * M87's anchor), so its light-time and redshift are the galaxy's.
 */
export function m87StarRecord(json: HoleJson, m87: BodyRecord, file: BlackHolesFile = BLACK_HOLES): BodyRecord {
  const m = json.mass.value;
  const rs = horizonRadiusKm(m);
  const g = m87.deepSky;
  const distancePc = g?.distancePc ?? 16.8e6;
  const ring = json.ehtImage;
  return {
    id: json.id,
    name: json.name,
    shortName: json.shortName,
    aliases: json.aliases,
    kind: 'black-hole',
    kindText: 'Supermassive black hole',
    parent: m87.id,
    physical: { radiusKm: rs, gmKm3S2: gmOf(m), colour: '#000000' },
    visual: { renderer: 'lens' },
    framing: { radii: M87_FRAMING_RS, minKm: rs * HOVER_FLOOR_RADIUS_RS },
    orbitLine: false,
    labelRank: M87_LABEL_RANK,
    detector: false,
    destination: true,
    deepSky: {
      type: `Supermassive black hole at the centre of ${m87.name}`,
      distancePc,
      distanceLoPc: g?.distanceLoPc,
      distanceHiPc: g?.distanceHiPc,
      // "Distance: its galaxy’s, the average of…" (a leading capital lowered unless it starts an abbreviation).
      distanceSource: g?.distanceSource ? `its galaxy’s, the ${/^[A-Z][a-z]/.test(g.distanceSource) ? g.distanceSource[0].toLowerCase() + g.distanceSource.slice(1) : g.distanceSource}` : 'its galaxy’s',
      distanceNow: g?.distanceNow,
      hostGalaxy: m87.name,
      rows: [
        ...holeRows(file, json, distancePc),
        ...(ring ? [{ l: 'Ring seen by the EHT', v: String(ring.ringDiameterUas), u: 'µas', title: ring.ringSource }] : []),
      ],
      refs: citations(file, json.refs),
    },
    facts: factsOf(json).map((f) => f.text),
    factSources: factsOf(json).map((f) => f.source),
    factSourceLabels: factsOf(json).map((f) => f.label),
    dataSource: citations(file, json.refs).join('; '),
    positionNote: `Position: at the centre of ${m87.name}, where the galaxy is placed (its radio core, ICRF3); it moves with its galaxy and cluster as the universe expands.`,
    modelNotes: json.modelNotes.slice(0, 3),
    blackHole: blackHoleInfoFrom(json, file),
    provider: atCentreProvider(undefined, `At the centre of ${m87.name}`),
  };
}

/**
 * A supermassive black hole at the centre of a galaxy the app registers with the others (M31* in the Andromeda Galaxy,
 * M81*, the holes of M32, Centaurus A, the Sombrero Galaxy, NGC 404, M84, M60, M49 and NGC 4889): a child of its
 * galaxy's record at its place, as M87*
 * is (sim/blackholes/load.ts gives it its galaxy's anchor in the expanding universe). No starlight of its galaxy is
 * drawn round it (M87's alone has a model), so no fall is offered.
 */
export function galaxyHoleRecord(json: HoleJson, host: BodyRecord, file: BlackHolesFile = BLACK_HOLES): BodyRecord {
  const m = json.mass.value;
  const rs = horizonRadiusKm(m);
  const g = host.deepSky;
  const distancePc = g?.distancePc ?? 1e6;
  const hostName = galaxyInWords(host.name);
  return {
    id: json.id,
    name: json.name,
    shortName: json.shortName,
    aliases: json.aliases,
    kind: 'black-hole',
    kindText: 'Supermassive black hole',
    parent: host.id,
    physical: { radiusKm: rs, gmKm3S2: gmOf(m), colour: '#000000' },
    visual: { renderer: 'lens' },
    framing: { radii: GALAXY_HOLE_FRAMING_RS, minKm: rs * HOVER_FLOOR_RADIUS_RS },
    orbitLine: false,
    labelRank: GALAXY_HOLE_LABEL_RANK,
    detector: false,
    destination: true,
    deepSky: {
      type: `Supermassive black hole at the centre of ${hostName}`,
      distancePc,
      distanceLoPc: g?.distanceLoPc,
      distanceHiPc: g?.distanceHiPc,
      distanceSource: g?.distanceSource ? `its galaxy’s, the ${/^[A-Z][a-z]/.test(g.distanceSource) ? g.distanceSource[0].toLowerCase() + g.distanceSource.slice(1) : g.distanceSource}` : 'its galaxy’s',
      distanceNow: g?.distanceNow,
      hostGalaxy: host.name,
      rows: holeRows(file, json, distancePc),
      refs: citations(file, json.refs),
    },
    facts: factsOf(json).map((f) => f.text),
    factSources: factsOf(json).map((f) => f.source),
    factSourceLabels: factsOf(json).map((f) => f.label),
    dataSource: citations(file, json.refs).join('; '),
    positionNote: `Position: at the centre of ${hostName}, where the galaxy is placed; it moves with its galaxy.`,
    modelNotes: json.modelNotes.slice(0, 3),
    blackHole: blackHoleInfoFrom(json, file),
    provider: atCentreProvider(undefined, `At the centre of ${host.name}`),
  };
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
 * A place in the expanding universe: comoving place x with anchor c (world axes, Mpc) is at x + (a − 1) c at the
 * clock's time, so a galaxy keeps its place in its group while the space between groups grows. Positions are J2000
 * ecliptic km: world (x, y, z) is ecliptic (x, −z, y). The twin of src/sim/deepsky/records.ts expandingPlaceProvider,
 * which places the catalogue's galaxies (that module is the deep-sky layer's own chunk).
 */
export function expandingPlace(posMpc: Readonly<[number, number, number]>, anchorMpc: Readonly<[number, number, number]>, label: string): PositionProvider {
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

/** "Cosmicflows-4 (Tully et al. 2023): …, distance modulus ±0.03 mag", as the deep-sky galaxies' cards say it. */
function catalogueDistanceSource(g: CatalogueGalaxyJson): string {
  return `Cosmicflows-4 (Tully et al. 2023, ApJ 944, 94)${Number.isFinite(g.edm) ? `, distance modulus ±${g.edm.toFixed(2)} mag` : ''}; placed as the cosmic web places it (its group’s distance)`;
}

/**
 * A supermassive black hole at the centre of a galaxy that is only in the NGC catalogue (M106, M105, the Spindle
 * Galaxy), which the app registers only on demand: a body of its own at its galaxy's place in the expanding
 * universe (the deep-sky layer's, copied into the data file), with its galaxy's anchor (sim/blackholes/load.ts), so
 * its light-time and redshift are its galaxy's. No parent: its galaxy comes and goes.
 */
export function catalogueGalaxyHoleRecord(json: HoleJson, file: BlackHolesFile = BLACK_HOLES): BodyRecord {
  const g = json.galaxy;
  if (!g) throw new Error(`blackholes: ${json.id} has no galaxy`);
  const m = json.mass.value;
  const rs = horizonRadiusKm(m);
  const distancePc = g.distMpc * 1e6;
  const hostName = galaxyInWords(g.name);
  return {
    id: json.id,
    name: json.name,
    shortName: json.shortName,
    aliases: json.aliases,
    kind: 'black-hole',
    kindText: 'Supermassive black hole',
    parent: null,
    physical: { radiusKm: rs, gmKm3S2: gmOf(m), colour: '#000000' },
    visual: { renderer: 'lens' },
    framing: { radii: GALAXY_HOLE_FRAMING_RS, minKm: rs * HOVER_FLOOR_RADIUS_RS },
    orbitLine: false,
    labelRank: GALAXY_HOLE_LABEL_RANK,
    detector: false,
    destination: true,
    deepSky: {
      type: `Supermassive black hole at the centre of ${hostName}`,
      distancePc,
      ...(g.distLoMpc > 0 && g.distHiMpc > g.distLoMpc ? { distanceLoPc: g.distLoMpc * 1e6, distanceHiPc: g.distHiMpc * 1e6 } : {}),
      distanceSource: `its galaxy’s, ${catalogueDistanceSource(g)}`,
      distanceNow: true,
      hostGalaxy: g.name,
      rows: holeRows(file, json, distancePc),
      refs: citations(file, json.refs),
    },
    facts: factsOf(json).map((f) => f.text),
    factSources: factsOf(json).map((f) => f.source),
    factSourceLabels: factsOf(json).map((f) => f.label),
    dataSource: `${citations(file, json.refs).join('; ')}; place: OpenNGC and Cosmicflows-4 (Tully et al. 2023), as the deep-sky layer has its galaxy`,
    positionNote: `Position: at the centre of ${hostName} (${g.designation}), at its galaxy’s place as OpenNGC and Cosmicflows-4 give it, held there in the expanding universe (its own motion, a few hundred km/s, is not followed).`,
    modelNotes: json.modelNotes.slice(0, 3),
    blackHole: blackHoleInfoFrom(json, file),
    provider: expandingPlace(g.posMpc, g.anchorMpc, `At the centre of ${g.name}: its measured place, carried by the expansion of the universe`),
  };
}
