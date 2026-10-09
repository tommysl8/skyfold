/**
 * The shape of blackholes.json (format 'lightspeed.black-holes', version 1): the real black holes the app
 * draws (Sagittarius A*'s entry carries only what its record adds to sstars.json), their companions and the
 * binaries' orbits, every value with the key of its reference. Written by scripts/build-blackholes.mjs from
 * the table in that script. Frame and orbit conventions are those of src/sim/stars/systems.json (positions
 * pc and velocities km/s, heliocentric, J2000 ecliptic axes; the black hole is group 1 of its orbit, the star
 * group 2), so each orbit is also a systems.json OrbitJson and the stars' providers place it.
 *
 * Twins: the table in scripts/build-blackholes.mjs (what each field holds, and how the computed ones are
 * computed); the records built from it in ./records.ts; docs/data/blackholes.md §5.
 */
import type { BodyId, DeepSkyImage } from '../bodies/types';
import type { OrbitJson } from '../stars/orbits';

/**
 * A value with its source, as the data file keeps it. `unc` is a 1σ uncertainty: one number, the pair
 * [below, above] where the paper gives them unequal, or a statistical and a systematic part.
 */
export interface Sourced<T = number> {
  value: T;
  unc?: number | [number, number] | { stat: number; sys: number };
  ref: string;
  note?: string;
}

/** The Event Horizon Telescope's picture, with its licence's credit and the ring's measured size. */
export type EhtImageJson = DeepSkyImage & { ringDiameterUas: number; ringSource: string };

/** One black hole. */
export interface HoleJson {
  id: BodyId;
  name: string;
  shortName?: string;
  aliases: string[];
  class: 'supermassive' | 'stellar';
  /**
   * 'sgr-a-star' keeps sstars.json as its source (no position here). 'galaxy-centre': at the centre of a galaxy the
   * app registers with the others (M87*, M31*); 'catalogue-galaxy': at the centre of a galaxy of the NGC catalogue,
   * which the app registers only on demand, so the hole carries its galaxy's place (`galaxy`).
   */
  placement: 'sstars' | 'galaxy-centre' | 'catalogue-galaxy' | 'binary' | 'isolated';
  /**
   * placement 'galaxy-centre': the galaxy's id (M87*: 'm87'). placement 'binary': the galaxy the binary lies in when it
   * is not the Milky Way (LMC X-1: 'lmc').
   */
  host?: BodyId;
  /** The host galaxy's name, for a binary in another galaxy or a hole in a catalogue galaxy ("Large Magellanic Cloud"). */
  hostName?: string;
  /** placement 'catalogue-galaxy': its galaxy as the NGC catalogue places it (public/data/deepsky/ngc-galaxies.json.gz). */
  galaxy?: CatalogueGalaxyJson;
  /** The IAU constellation it lies in, as seen from the Sun. */
  constellation?: string;
  /** placement 'isolated': ICRS position, distance, proper motion, radial velocity. */
  astrometry?: {
    raDeg: number;
    decDeg: number;
    epochJyr: number;
    distancePc: Sourced;
    pmRaMasYr?: number;
    pmDecMasYr?: number;
    rvKms?: number;
    positionNote?: string;
  };
  mass: Sourced;
  massNote?: string;
  /**
   * A supermassive hole's mass as published, at the distance the paper assumed (Mpc). A mass from motions seen on the
   * sky grows in proportion to the distance assumed, so `mass` is this scaled to the distance the app places its galaxy
   * at (scripts/build-blackholes.mjs).
   */
  massPublished?: Sourced & { distMpc: number };
  /** How the mass was measured, in a few plain words ("the motions of its stars"); the card's line under the mass. */
  massMethod?: string;
  spin: { value: number | null; status: 'unknown' | 'estimated'; note: string; ref?: string };
  facts: { text: string; source: string; label: string }[];
  /** At most three one-line notes reach the card; the rest go to the data sheet and the Guide. */
  modelNotes: string[];
  /** The notes the card leaves out, for the data sheet. */
  sheetNotes?: string[];
  refs: string[];
  fallAllowed: boolean;
  /** false for M87* and OGLE-2011-BLG-0462 (no orbit to draw). */
  orbitLine: boolean;
  /** The accretion flow drawn for it (only Sgr A*'s). */
  flow?: 'sgr-a-star-riaf';
  /** A thin accretion disc drawn for it (Cygnus X-1's: docs/data/blackholes.md §12). */
  disk?: DiskJson;
  /** The EHT's picture for its card (Sgr A*, M87*). */
  ehtImage?: EhtImageJson;
}

/**
 * A thin accretion disc (physics/thinDisk.ts): Novikov–Thorne, from the innermost stable orbit out to rOutCm, its
 * luminosity a share of the Eddington luminosity, in the plane of the binary's orbit and turning with it.
 */
export interface DiskJson {
  model: 'novikov-thorne';
  /** L / L_Edd of the disc's thermal light. */
  eddingtonFraction: Sourced;
  /** The Eddington luminosity the fraction is of, erg/s. */
  lEddErgS: Sourced;
  /** Its outer edge, cm. */
  rOutCm: Sourced;
  /** Its plane: the binary's orbit. */
  plane: 'orbit';
  /** How many times slower than real its gas is drawn turning. */
  slowdown: number;
  refs: string[];
}

/**
 * A galaxy of the NGC catalogue as the deep-sky layer places it (src/sim/deepsky/format.ts parseNgcGalaxies; copied by
 * scripts/build-blackholes.mjs from public/data/deepsky/ngc-galaxies.json.gz): its comoving place and the anchor of its
 * group, world axes (x_ecl, z_ecl, −y_ecl), Mpc, and its distance with its source.
 */
export interface CatalogueGalaxyJson {
  designation: string;
  name: string;
  aliases: string[];
  raDeg: number;
  decDeg: number;
  /** Cosmicflows-4's distance and its range, Mpc; the methods (src/sim/cosmos/cosmicWeb.ts METHOD bits) and ±mag. */
  distMpc: number;
  distLoMpc: number;
  distHiMpc: number;
  methods: number;
  edm: number;
  posMpc: [number, number, number];
  anchorMpc: [number, number, number];
}

/** A black hole's companion star. */
export interface CompanionJson {
  id: BodyId;
  name: string;
  aliases: string[];
  /** Catalogue designations, most prominent first (the data sheet's). */
  designations?: string[];
  /** stars3d index (Cygnus X-1: 111021) or null (Gaia BH companions, X-ray binary donors). */
  catalogueIndex: number | null;
  spectralType: string;
  /** What it is, in a word or two ("Red giant"), when its spectral type says it badly. */
  kindText?: string;
  massMsun: Sourced;
  radiusRsun: Sourced;
  teffK: Sourced;
  /** Visual magnitude as observed from Earth, through the dust (for the card), when V is known. */
  vMag?: Sourced;
  /** Gaia's G magnitude as observed, where V is not given. */
  gMag?: Sourced;
  luminosityLsun?: Sourced;
  /** What is estimated rather than measured, in words. */
  estimated?: string[];
}

/**
 * The systems.json orbit format (orbitModel) with the black hole as group 1. For the X-ray binaries, whose T0
 * is the donor's inferior conjunction: ω★ = 90° and tPeriJD = T0 − P/2.
 */
export interface HoleOrbitJson extends OrbitJson {
  pHat: [number, number, number];
  qHat: [number, number, number];
  /** What was assumed (Ω, sense of revolution, e = 0), shown on the card. */
  assumed: string[];
}

/** A binary with a black hole: its barycentre and orbit. */
export interface HoleSystemJson {
  id: string;
  name: string;
  members: BodyId[];
  barycentre: {
    /** The astrometry the barycentre comes from, at the adopted distance (parallaxMas is 1000 / distance). */
    astrometry: { raDeg: number; decDeg: number; epochJyr: number; parallaxMas: number; pmRaMasYr: number; pmDecMasYr: number; rvKms: number };
    rvNote?: string;
    /** The adopted distance with its source. */
    distance: Sourced;
    refs: string[];
    posPc: [number, number, number];
    velKms: [number, number, number];
    distancePc: number;
    massMsun: number;
  };
  orbits: HoleOrbitJson[];
  /**
   * The X-ray binaries with no ephemeris used for their phase: the donor is put nearest to us at J2000.0 (assumed, and
   * said on the card), so where the two are on their orbit is illustrative.
   */
  phaseAssumed?: boolean;
  /** What the build checked (Kepler's law against the published orbit, the donor in front at T0). */
  checks?: string[];
}

/** The whole file. */
export interface BlackHolesFile {
  format: 'lightspeed.black-holes';
  version: 1;
  generatedBy: string;
  frame: string;
  orbitModel?: string;
  /** Reference key → "citation — what is taken from it". */
  refs: Record<string, string>;
  holes: HoleJson[];
  companions: CompanionJson[];
  systems: HoleSystemJson[];
}
