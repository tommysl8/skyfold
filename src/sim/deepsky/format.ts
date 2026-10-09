/**
 * The deep-sky catalogues' files (public/data/deepsky/, built by scripts/build-ngc.mjs, build-pulsars.mjs,
 * build-snrs.mjs and build-gw-events.mjs; docs/data/deepsky.md): what each holds, and the readers that turn them
 * into the objects the app uses. Each file is gzipped JSON of { meta, columns, rows }, a row's values in the order of
 * its columns, so the column names are written once rather than with every object.
 *
 * Pure functions of the parsed JSON: the tests call them with the files read from disk.
 */
import type { Vec3 } from '../galaxy/frames';

/** The five catalogues, each loaded on its own when it becomes relevant (load.ts). */
export type DeepSkySetId = 'ngc-galactic' | 'snrs' | 'pulsars' | 'ngc-galaxies' | 'gw-events';

/** Those within the Milky Way (and the Magellanic Clouds): heliocentric galactic places in parsecs. */
export const GALACTIC_SETS = ['ngc-galactic', 'snrs', 'pulsars'] as const;
/** Those beyond it: comoving places in megaparsecs, world axes, in the expanding universe. */
export const EXTRAGALACTIC_SETS = ['ngc-galaxies', 'gw-events'] as const;
export const DEEP_SKY_SETS: readonly DeepSkySetId[] = [...GALACTIC_SETS, ...EXTRAGALACTIC_SETS];

/** Each catalogue's file, under public/. */
export const DEEP_SKY_FILES: Record<DeepSkySetId, string> = {
  'ngc-galactic': 'data/deepsky/ngc-galactic.json.gz',
  snrs: 'data/deepsky/snrs.json.gz',
  pulsars: 'data/deepsky/pulsars.json.gz',
  'ngc-galaxies': 'data/deepsky/ngc-galaxies.json.gz',
  'gw-events': 'data/deepsky/gw-events.json.gz',
};
/** The NGC/IC designations of the objects the app already has (they keep their own records). */
export const NGC_EXISTING_FILE = 'data/deepsky/ngc-existing.json.gz';
/** The magnetars of the McGill catalogue, loaded with the pulsars and merged into them (mergeMagnetars). */
export const MAGNETARS_FILE = 'data/deepsky/magnetars.json.gz';

const SCHEMAS: Record<DeepSkySetId | 'ngc-existing' | 'magnetars', string> = {
  'ngc-galactic': 'lightspeed.ngc-galactic/1',
  snrs: 'lightspeed.snrs/1',
  pulsars: 'lightspeed.pulsars/1',
  'ngc-galaxies': 'lightspeed.ngc-galaxies/1',
  'gw-events': 'lightspeed.gw-events/1',
  'ngc-existing': 'lightspeed.ngc-existing/1',
  magnetars: 'lightspeed.magnetars/1',
};

export interface ColumnFile {
  meta: Record<string, unknown> & { schema?: string };
  columns: string[];
  rows: unknown[][];
}

/** A file's rows as maps from column to value, after checking it is the file expected. */
function rowsOf(file: ColumnFile, which: keyof typeof SCHEMAS, need: readonly string[]): ((k: string) => unknown)[] {
  if (file?.meta?.schema !== SCHEMAS[which]) throw new Error(`${which}: unexpected schema ${String(file?.meta?.schema)}`);
  const at = new Map(file.columns.map((c, i) => [c, i]));
  for (const c of need) if (!at.has(c)) throw new Error(`${which}: no column ${c}`);
  return file.rows.map((r) => (k: string) => r[at.get(k)!]);
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);

// ─── NGC and IC: the Milky Way and the Magellanic Clouds ───────────────────────────────

/** Where an NGC/IC cluster's or nebula's distance comes from. */
export type GalacticSource = 'hr24' | 'bv21' | 'harris' | 'gaia-pn' | 'lmc' | 'smc';

export interface NgcGalactic {
  /** "NGC 2516", "IC 4593". */
  designation: string;
  /** Messier numbers, the other catalogue's designations, common names. */
  aliases: string[];
  /** OpenNGC's type: OCl, GCl, Cl+N, PN, HII, Neb, EmN, RfN. */
  type: string;
  raDeg: number;
  decDeg: number;
  distPc: number;
  distLoPc: number;
  distHiPc: number;
  source: GalacticSource;
  /** Heliocentric galactic place, pc. */
  pos: Vec3;
  /** Major axis on the sky, arcmin (NaN: not catalogued). */
  sizeArcmin: number;
  /** V (else B) magnitude (NaN: not catalogued). */
  mag: number;
  /** Per source: open clusters' members, log age, r50 (pc) and mass; globulars' r_h, M_V and [Fe/H]; a nebula's parallax. */
  extra: Record<string, number | string | null> | null;
}

export function parseNgcGalactic(file: ColumnFile): NgcGalactic[] {
  return rowsOf(file, 'ngc-galactic', ['name', 'aliases', 'type', 'raDeg', 'decDeg', 'distPc', 'distLoPc', 'distHiPc', 'source', 'xPc', 'yPc', 'zPc', 'sizeArcmin', 'mag', 'extra']).map((g) => {
    const d = num(g('distPc'));
    return {
      designation: String(g('name')),
      aliases: strs(g('aliases')),
      type: String(g('type')),
      raDeg: num(g('raDeg')),
      decDeg: num(g('decDeg')),
      distPc: d,
      distLoPc: num(g('distLoPc')),
      distHiPc: num(g('distHiPc')),
      source: String(g('source')) as GalacticSource,
      pos: [num(g('xPc')), num(g('yPc')), num(g('zPc'))],
      sizeArcmin: num(g('sizeArcmin')),
      mag: num(g('mag')),
      extra: (g('extra') as NgcGalactic['extra']) ?? null,
    };
  });
}

// ─── NGC and IC: galaxies ──────────────────────────────────────────────────────────────

/** Where an NGC/IC galaxy's place comes from: Cosmicflows-4, or a DESI or SDSS redshift. */
export type GalaxySource = 'cf4' | 'desi' | 'sdss';

export interface NgcGalaxy {
  designation: string;
  aliases: string[];
  /** G, GPair, GTrpl, GGroup. */
  type: string;
  /** Morphological type (HyperLEDA's, via OpenNGC): "Sb", "E-S0", "SABc". */
  hubble: string | null;
  raDeg: number;
  decDeg: number;
  majArcmin: number;
  minArcmin: number;
  paDeg: number;
  mag: number;
  source: GalaxySource;
  /** Cosmicflows-4: the galaxy's row in the cosmic web's file; a survey: its catalogue's code (sim/surveys/format.ts). */
  ref: number;
  /** Cosmicflows-4: the bits of its distance methods (sim/cosmos/cosmicWeb.ts METHOD). */
  methods: number;
  /** Comoving distance where it is placed, Mpc, and the range its measurement allows. */
  distMpc: number;
  distLoMpc: number;
  distHiMpc: number;
  /** Cosmicflows-4: the uncertainty of its distance modulus, mag. */
  edm: number;
  /** Comoving place, world axes, Mpc; and its anchor in the expanding universe (its group's, or its own). */
  pos: Vec3;
  anchor: Vec3;
}

export function parseNgcGalaxies(file: ColumnFile): NgcGalaxy[] {
  const cols = ['name', 'aliases', 'type', 'hubble', 'raDeg', 'decDeg', 'majArcmin', 'minArcmin', 'paDeg', 'mag', 'source', 'ref', 'methods', 'distMpc', 'distLoMpc', 'distHiMpc', 'edm', 'x', 'y', 'z', 'ax', 'ay', 'az'];
  return rowsOf(file, 'ngc-galaxies', cols).map((g) => {
    const pos: Vec3 = [num(g('x')), num(g('y')), num(g('z'))];
    const ax = num(g('ax'));
    return {
      designation: String(g('name')),
      aliases: strs(g('aliases')),
      type: String(g('type')),
      hubble: str(g('hubble')),
      raDeg: num(g('raDeg')),
      decDeg: num(g('decDeg')),
      majArcmin: num(g('majArcmin')),
      minArcmin: num(g('minArcmin')),
      paDeg: num(g('paDeg')),
      mag: num(g('mag')),
      source: String(g('source')) as GalaxySource,
      ref: num(g('ref')),
      methods: num(g('methods')) || 0,
      distMpc: num(g('distMpc')),
      distLoMpc: num(g('distLoMpc')),
      distHiMpc: num(g('distHiMpc')),
      edm: num(g('edm')),
      pos,
      // A survey galaxy is its own anchor (the tiles know of no groups: sim/surveys).
      anchor: Number.isFinite(ax) ? [ax, num(g('ay')), num(g('az'))] : pos,
    };
  });
}

/** The NGC/IC designations of bodies the app already has: [designation, the name the app's search finds it by]. */
export function parseNgcExisting(file: ColumnFile): [string, string][] {
  return rowsOf(file, 'ngc-existing', ['designation', 'body']).map((g) => [String(g('designation')), String(g('body'))]);
}

// ─── Pulsars ────────────────────────────────────────────────────────────────────────────

/**
 * How a pulsar's distance was found, as the ATNF catalogue's best estimate (DIST) takes it: an independent distance (its
 * globular cluster's, an association's, HI absorption), its parallax, published limits, or its dispersion measure and
 * the YMW16 model of the Galaxy's free electrons.
 */
export type PulsarDistanceMethod = 'independent' | 'parallax' | 'limits' | 'dm';

export interface Pulsar {
  /** "J0437-4715". */
  jname: string;
  /** "B0531+21", or null. */
  bname: string | null;
  raDeg: number;
  decDeg: number;
  distPc: number;
  distLoPc: number;
  distHiPc: number;
  method: PulsarDistanceMethod;
  /** Spin period, s, and its rate of change (NaN: not measured). */
  p0: number;
  p1: number;
  /** Dispersion measure, pc cm⁻³. */
  dm: number;
  /** Orbital period of its binary, days (NaN: single). */
  pbDays: number;
  /** Its companion's kind in the catalogue's code (He, CO, NS, MS, UL…), or null. */
  companion: string | null;
  /** The catalogue's TYPE codes: HE (seen at high energies), NRAD (not in radio), RRAT, AXP (magnetar), XINS. */
  types: string[];
  /** Associations: "GC:47Tuc(NGC104)", "SNR:Crab", "EXGAL:LMC"… */
  assoc: string[];
  pos: Vec3;
  /** A magnetar of the McGill catalogue (mergeMagnetars): its values there. */
  magnetar?: Magnetar;
}

export function parsePulsars(file: ColumnFile): Pulsar[] {
  const cols = ['name', 'bname', 'raDeg', 'decDeg', 'distPc', 'distLoPc', 'distHiPc', 'method', 'p0', 'p1', 'dm', 'pbDays', 'companion', 'type', 'assoc', 'xPc', 'yPc', 'zPc'];
  return rowsOf(file, 'pulsars', cols).map((g) => ({
    jname: String(g('name')),
    bname: str(g('bname')),
    raDeg: num(g('raDeg')),
    decDeg: num(g('decDeg')),
    distPc: num(g('distPc')),
    distLoPc: num(g('distLoPc')),
    distHiPc: num(g('distHiPc')),
    method: String(g('method')) as PulsarDistanceMethod,
    p0: num(g('p0')),
    p1: num(g('p1')),
    dm: num(g('dm')),
    pbDays: num(g('pbDays')),
    companion: str(g('companion')),
    types: (str(g('type')) ?? '').split(',').filter(Boolean),
    assoc: (str(g('assoc')) ?? '').split(',').filter(Boolean),
    pos: [num(g('xPc')), num(g('yPc')), num(g('zPc'))],
  }));
}

// ─── Magnetars ───────────────────────────────────────────────────────────────────────────

/** A magnetar of the McGill Online Magnetar Catalog (Olausen & Kaspi 2014, ApJS 212, 6; scripts/build-magnetars.mjs). */
export interface Magnetar {
  /** "SGR 1806-20", "1E 2259+586". */
  name: string;
  /** Soft gamma repeater, anomalous X-ray pulsar, or a radio pulsar with magnetar outbursts (PSR J1846−0258). */
  kind: 'SGR' | 'AXP' | 'PSR';
  /** 'candidate' (the catalogue's #), 'high-B pulsar' (##), or null. */
  flag: string | null;
  /** The ATNF catalogue's J name of the same object, if it has one. */
  atnf: string | null;
  raDeg: number;
  decDeg: number;
  /** Distance, pc, with its uncertainties (NaN: none given) and whether it is only approximate. */
  distPc: number;
  distUpPc: number;
  distDnPc: number;
  distApprox: boolean;
  /** The catalogue's reference for the distance: its code and ADS bibcode ("bcfc08 2008MNRAS.386L..23B"), or a citation. */
  distRef: string | null;
  /** Spin period, s; its derivative (NaN: not measured), an upper limit when p1Upper. */
  p0: number;
  p1: number;
  p1Upper: boolean;
  /** Surface dipole field inferred from P and Ṗ, G; spin-down power, erg/s; characteristic age, yr; X-ray luminosity, erg/s. */
  bG: number;
  edotErgS: number;
  ageYr: number;
  lxErgS: number;
  /** Associations ("SNR CTB 109", "Westerlund 1"), bands seen in (X, O, I, R, H: hard X-rays, G: gamma) and activity (B bursts, G glitches, F giant flares, T transient, A anti-glitch). */
  assoc: string | null;
  bands: string;
  activity: string;
  pos: Vec3;
}

export function parseMagnetars(file: ColumnFile): Magnetar[] {
  const cols = ['name', 'kind', 'flag', 'atnf', 'raDeg', 'decDeg', 'distPc', 'distUpPc', 'distDnPc', 'distLim', 'distRef', 'p0', 'p1', 'p1Lim', 'bG', 'edotErgS', 'ageYr', 'lxErgS', 'lxLim', 'assoc', 'bands', 'activity', 'xPc', 'yPc', 'zPc'];
  return rowsOf(file, 'magnetars', cols).map((g) => ({
    name: String(g('name')),
    kind: String(g('kind')) as Magnetar['kind'],
    flag: str(g('flag')),
    atnf: str(g('atnf')),
    raDeg: num(g('raDeg')),
    decDeg: num(g('decDeg')),
    distPc: num(g('distPc')),
    distUpPc: num(g('distUpPc')),
    distDnPc: num(g('distDnPc')),
    distApprox: g('distLim') === 'approx',
    distRef: str(g('distRef')),
    p0: num(g('p0')),
    p1: num(g('p1')),
    p1Upper: g('p1Lim') === 'upper',
    bG: num(g('bG')),
    edotErgS: num(g('edotErgS')),
    ageYr: num(g('ageYr')),
    lxErgS: num(g('lxErgS')),
    assoc: str(g('assoc')),
    bands: str(g('bands')) ?? '',
    activity: str(g('activity')) ?? '',
    pos: [num(g('xPc')), num(g('yPc')), num(g('zPc'))],
  }));
}

/**
 * The pulsars with the magnetars merged in: an ATNF pulsar that is a McGill magnetar keeps its entry and gains the
 * catalogue's values (and its distance, the magnetar catalogue's compilation); a magnetar the ATNF catalogue lacks is
 * added (its J name its own name, to keep ids unique). The ATNF's own magnetar flag (AXP) stays as it was.
 */
export function mergeMagnetars(pulsars: readonly Pulsar[], magnetars: readonly Magnetar[]): Pulsar[] {
  const byName = new Map(magnetars.filter((m) => m.atnf).map((m) => [m.atnf!, m]));
  const out = pulsars.map((p) => {
    const m = byName.get(p.jname);
    if (!m) return p;
    const d = Math.hypot(...p.pos);
    const k = d > 0 ? m.distPc / d : 1;
    return {
      ...p,
      magnetar: m,
      distPc: m.distPc,
      distLoPc: Number.isFinite(m.distDnPc) ? m.distPc - m.distDnPc : NaN,
      distHiPc: Number.isFinite(m.distUpPc) ? m.distPc + m.distUpPc : NaN,
      method: 'independent' as const,
      pos: [p.pos[0] * k, p.pos[1] * k, p.pos[2] * k] as Vec3,
    };
  });
  for (const m of magnetars) {
    if (m.atnf) continue;
    out.push({
      jname: m.name,
      bname: null,
      raDeg: m.raDeg,
      decDeg: m.decDeg,
      distPc: m.distPc,
      distLoPc: Number.isFinite(m.distDnPc) ? m.distPc - m.distDnPc : NaN,
      distHiPc: Number.isFinite(m.distUpPc) ? m.distPc + m.distUpPc : NaN,
      method: 'independent',
      p0: m.p0,
      p1: m.p1,
      dm: NaN,
      pbDays: NaN,
      companion: null,
      types: [],
      assoc: [],
      pos: m.pos,
      magnetar: m,
    });
  }
  return out;
}

// ─── Supernova remnants ─────────────────────────────────────────────────────────────────

export interface Snr {
  /** Green's name, "G263.9-3.3". */
  name: string;
  /** Common names ("Vela Supernova Remnant", "W44"). */
  aliases: string[];
  lDeg: number;
  bDeg: number;
  raDeg: number;
  decDeg: number;
  distPc: number;
  distLoPc: number;
  distHiPc: number;
  /** The method as Ranasinghe & Leahy (2022) name it ("Kinematic distance", "Sedov estimates"…), or '' . */
  method: string;
  /** 'uncertain': its nature as a remnant needs more evidence; 'new': not in Green 2019. */
  flag: 'uncertain' | 'new' | null;
  /** The papers behind its distance ("Cha et al. 1999"). */
  ref: string | null;
  pos: Vec3;
}

export interface SnrFile {
  snrs: Snr[];
  /** Each method's words for the card, and whether it is a model's estimate rather than a measurement. */
  methods: Record<string, { text: string; estimate: boolean }>;
  /** Remnants the app already has: [name, the name the app's search finds it by]. */
  existing: [string, string][];
}

export function parseSnrs(file: ColumnFile): SnrFile {
  const cols = ['name', 'aliases', 'lDeg', 'bDeg', 'raDeg', 'decDeg', 'distPc', 'distLoPc', 'distHiPc', 'method', 'flag', 'ref', 'xPc', 'yPc', 'zPc'];
  const snrs = rowsOf(file, 'snrs', cols).map(
    (g): Snr => ({
      name: String(g('name')),
      aliases: strs(g('aliases')),
      lDeg: num(g('lDeg')),
      bDeg: num(g('bDeg')),
      raDeg: num(g('raDeg')),
      decDeg: num(g('decDeg')),
      distPc: num(g('distPc')),
      distLoPc: num(g('distLoPc')),
      distHiPc: num(g('distHiPc')),
      method: str(g('method')) ?? '',
      flag: (str(g('flag')) as Snr['flag']) ?? null,
      ref: str(g('ref')),
      pos: [num(g('xPc')), num(g('yPc')), num(g('zPc'))],
    }),
  );
  const methods = (file.meta.methods ?? {}) as SnrFile['methods'];
  const existing = (Array.isArray(file.meta.existing) ? file.meta.existing : []) as [string, string][];
  return { snrs, methods, existing };
}

// ─── Gravitational-wave events ──────────────────────────────────────────────────────────

/** What merged, by the masses' medians: two black holes, a black hole and a neutron star, two neutron stars. */
export type MergerKind = 'bhbh' | 'bhns' | 'nsns';

export interface GwEvent {
  /** "GW150914", "GW230529_181500". */
  name: string;
  /** The catalogue release it comes from ("GWTC-2.1-confident", "GWTC-4.1"). */
  catalog: string;
  /** GPS time of the merger's signal at Earth, s. */
  gps: number;
  /** Source-frame masses, M☉, with their 90 % credible intervals as offsets (lo negative). */
  m1: number;
  m1Lo: number;
  m1Hi: number;
  m2: number;
  m2Lo: number;
  m2Hi: number;
  /** Mass of the remnant, M☉ (NaN: not estimated). */
  mFinal: number;
  /** Luminosity distance, Mpc, with its 90 % interval (absolute bounds). */
  dlMpc: number;
  dlLoMpc: number;
  dlHiMpc: number;
  z: number;
  chiEff: number;
  snr: number;
  /** Probability it is astrophysical (NaN: not given: the earliest events, beyond doubt). */
  pAstro: number;
  /** Most probable direction (the sky map's peak), deg. */
  raDeg: number;
  decDeg: number;
  /** Area of the 90 % credible region, deg². */
  area90Deg2: number;
  /** Share of that region's probability within 1.5 radii of the peak: low for maps in two or more patches. */
  onePatch: number;
  kind: MergerKind;
  /** Comoving distance of the median and of the 90 % interval's ends, Mpc (Planck 2018). */
  dcMpc: number;
  dcLoMpc: number;
  dcHiMpc: number;
  /** Comoving place of the region's centre, world axes, Mpc. */
  pos: Vec3;
}

export function parseGwEvents(file: ColumnFile): GwEvent[] {
  const cols = ['name', 'catalog', 'gps', 'm1', 'm1Lo', 'm1Hi', 'm2', 'm2Lo', 'm2Hi', 'mFinal', 'dlMpc', 'dlLoMpc', 'dlHiMpc', 'z', 'chiEff', 'snr', 'pAstro', 'raDeg', 'decDeg', 'area90Deg2', 'onePatch', 'kind', 'dcMpc', 'dcLoMpc', 'dcHiMpc', 'x', 'y', 'z3'];
  return rowsOf(file, 'gw-events', cols).map((g) => ({
    name: String(g('name')),
    catalog: String(g('catalog')),
    gps: num(g('gps')),
    m1: num(g('m1')),
    m1Lo: num(g('m1Lo')),
    m1Hi: num(g('m1Hi')),
    m2: num(g('m2')),
    m2Lo: num(g('m2Lo')),
    m2Hi: num(g('m2Hi')),
    mFinal: num(g('mFinal')),
    dlMpc: num(g('dlMpc')),
    dlLoMpc: num(g('dlLoMpc')),
    dlHiMpc: num(g('dlHiMpc')),
    z: num(g('z')),
    chiEff: num(g('chiEff')),
    snr: num(g('snr')),
    pAstro: num(g('pAstro')),
    raDeg: num(g('raDeg')),
    decDeg: num(g('decDeg')),
    area90Deg2: num(g('area90Deg2')),
    onePatch: num(g('onePatch')),
    kind: String(g('kind')) as MergerKind,
    dcMpc: num(g('dcMpc')),
    dcLoMpc: num(g('dcLoMpc')),
    dcHiMpc: num(g('dcHiMpc')),
    pos: [num(g('x')), num(g('y')), num(g('z3'))],
  }));
}

/** The 90 % region's angular radius, rad: the radius of a circle of its area (at most a hemisphere's). */
export const regionRadiusRad = (area90Deg2: number): number => Math.min(Math.PI / 2, Math.sqrt((area90Deg2 * (Math.PI / 180) ** 2) / Math.PI));

/** GPS seconds to Unix milliseconds: GPS runs ahead of UTC by the leap seconds since 1980 (17 until 2017, 18 since). */
export function gpsToUnixMs(gps: number): number {
  const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
  const leap = gps >= 1_167_264_018 ? 18 : gps >= 1_119_744_016 ? 17 : 16;
  return GPS_EPOCH_MS + (gps - leap) * 1000;
}
