/**
 * The galaxies beyond the Milky Way as bodies: the 169 galaxies of the Local Group and its
 * surroundings (the CC0 Local Volume Database), the named galaxies, clusters and record-holding
 * young galaxies of named.json, and the Local Group itself. Pure functions of the two files (the
 * tests call them with the files read from disk). Each galaxy also gets a shape for the renderer
 * (GalaxyShape): which particle template it is drawn with (templates.ts), its size, how it is
 * tilted, how bright it is and how dusty.
 */
import { KPC_KM, LIGHT_YEAR_KM, MPC_KM, PARSEC_KM } from '../../physics/constants';
import { bvToTemperature } from '../../physics/blackbody';
import { sig } from '../../lib/sci';
import { ALWAYS } from '../bodies/providers/simple';
import type { BodyRecord, DeepSkyImage, DeepSkyInfo, PositionProvider } from '../bodies/types';
import { msFromAstroTime } from '../../lib/time';
import { isBoundToLocalGroup } from '../../physics/cosmology/policy';
import { cosmicAtMemo } from '../cosmicTime';
import { EARLIEST_GALAXIES_GYR } from './expansion';
import { add, apply, cross, dot, eclToWorld, ICRS_TO_ECL, norm, scale, skyBasis, skyDirectionWorld, type Vec3 } from './frames';
import { discAxesEcl, type DiscInfo, type GalaxyClass, type LocalGalaxiesDoc, type LocalGalaxy, type NamedDoc, type NamedObject } from './localGalaxies';
import { apparentV, DISC_TEMPLATES, inclinationFromAxisRatio, templateForHubble, type MoreGalaxiesDoc, type MoreGalaxy } from './moreGalaxies';
import { templateFor, type TemplateId } from './templates';

export const LOCAL_GROUP_ID = 'local-group';
export const ARTICLE_GALAXIES = 'island-universes';
export const ARTICLE_EXPANDING = 'the-expanding-universe';
export const ARTICLE_EDGE = 'the-edge-of-reach';

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const YEAR_MS = 365.25 * 86_400_000;
/** Galaxies move a few hundred km/s: under a kiloparsec in a million years. Beyond that they stand still, illustrative. */
const GALAXY_YEARS = 1e6;
const M_V_SUN = 4.83;
const LY_PER_PC = PARSEC_KM / LIGHT_YEAR_KM;
const doiUrl = (doi: string) => `https://doi.org/${doi}`;
const adsUrl = (bibcode: string) => `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(bibcode)}`;

const LVDB = 'Local Volume Database v1.1.1 (Pace 2025, The Open Journal of Astrophysics 8, 142)';
const LVDB_DOI = '10.33232/001c.144859';
const RC3 = 'RC3 (de Vaucouleurs et al. 1991)';
const KARACHENTSEV_2009 = 'Karachentsev, Kashibadze, Makarov et al. 2009, MNRAS 393, 1265';
const FSI95 = 'Fukugita, Shimasaku & Ichikawa 1995, PASP 107, 945';

/**
 * The Local Group's zero-velocity surface: radius 0.96 ± 0.03 Mpc about the barycentre, which lies
 * 0.55 ± 0.05 of the way from the Milky Way to M31 (Karachentsev et al. 2009).
 */
export const LOCAL_GROUP_RADIUS_MPC = 0.96;
export const LOCAL_GROUP_BARYCENTRE_SHARE = 0.55;

/** Distance words: "162,000 light-years", "2.48 million light-years", "33.9 billion light-years". */
export function lightYearsWords(pc: number): string {
  const ly = pc * LY_PER_PC;
  if (ly >= 1e9) return `${sig(ly / 1e9, 3)} billion light-years`;
  if (ly >= 1e6) return `${sig(ly / 1e6, 3)} million light-years`;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(ly)) - 2);
  return `${(Math.round(ly / step) * step).toLocaleString('en-GB')} light-years`;
}
/** A luminosity in Suns, in words ("1.5 billion", "280,000"). */
function sunsWords(l: number): string {
  if (l >= 1e9) return `${sig(l / 1e9, 2)} billion`;
  if (l >= 1e6) return `${sig(l / 1e6, 2)} million`;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(l)) - 1);
  return (Math.round(l / step) * step).toLocaleString('en-GB');
}

// ─── Shapes for the renderer ─────────────────────────────────────────────────────────────

export interface GalaxyDust {
  /** Face-on optical depth in V at the centre (or on the ring). */
  tau0: number;
  /** Exponential scale length of the dust, kpc; for a ring, minus its thickness (0: no dust). */
  scaleKpc: number;
  /** A ring of dust instead (the Sombrero Galaxy): its radius and Gaussian width, kpc (0: none). */
  ringKpc: number;
  ringWidthKpc: number;
}

export interface GalaxyShape {
  id: string;
  template: TemplateId;
  /** One template unit, kpc. */
  scaleKpc: number;
  /** World-axis directions of the template's x, y and z, each scaled by its stretch (unitless). */
  axes: [Vec3, Vec3, Vec3];
  /** The disc's normal (world axes, unit): the plane its dust lies in. */
  normal: Vec3;
  /** Total V-band luminosity, L☉. */
  lumV: number;
  /** Projected half-light radius, kpc (the size of its single splat from afar). */
  halfLightKpc: number;
  /** Its light is part of the sky from the Sun (the Milky Way's satellites): it fades in with the model of the Galaxy. */
  inSkyMap: boolean;
  dust: GalaxyDust;
}

const NO_DUST: GalaxyDust = { tau0: 0, scaleKpc: 0, ringKpc: 0, ringWidthKpc: 0 };

/**
 * Typical B − V of each type (Fukugita, Shimasaku & Ichikawa 1995: E 0.96, S0 0.85, Sab 0.78,
 * Sbc 0.57, Scd 0.50; irregulars about 0.4), to turn a B magnitude into V and to colour the label.
 */
export function typicalBV(template: TemplateId): number {
  switch (template) {
    case 'elliptical':
    case 'cluster':
      return 0.96;
    case 'lenticular':
      return 0.85;
    case 'spiral-early':
      return 0.78;
    case 'spiral':
    case 'barred':
      return 0.68;
    case 'spiral-late':
      return 0.5;
    case 'magellanic':
    case 'irregular':
      return 0.45;
    case 'spheroidal':
      return 0.72;
    case 'compact':
      return -0.1;
    default:
      return 0.7;
  }
}

/** Ellipticals: half-light radius as a share of the isophotal radius R25 when only R25 is known (M87: 0.32; Centaurus A: 0.39). */
export const RE_PER_R25 = 0.35;

/** Dust of each template: typical face-on optical depths (Xilouris et al. 1999, A&A 344, 868: dust scale length about 1.4 stellar ones). */
function dustFor(template: TemplateId, unitKpc: number): GalaxyDust {
  const disc = (tau0: number): GalaxyDust => ({ tau0, scaleKpc: 0.35 * unitKpc, ringKpc: 0, ringWidthKpc: 0 });
  switch (template) {
    case 'spiral-early':
    case 'spiral':
    case 'barred':
      return disc(1.0);
    case 'spiral-late':
      return disc(0.6);
    case 'magellanic':
      return disc(0.3);
    case 'lenticular':
      return { tau0: 3, scaleKpc: -0.03 * unitKpc, ringKpc: 0.5 * unitKpc, ringWidthKpc: 0.08 * unitKpc };
    case 'irregular':
      return { tau0: 0.15, scaleKpc: 0.8 * unitKpc, ringKpc: 0, ringWidthKpc: 0 };
    default:
      return NO_DUST;
  }
}

const toWorld = (ecl: Readonly<Vec3>): Vec3 => eclToWorld(ecl);
const unit = (v: Vec3): Vec3 => scale(v, 1 / norm(v));

/**
 * Axes of a galaxy with a disc of known orientation (named.json's axesEcl). Spiral arms in the
 * templates trail a rotation clockwise about their +z: where the sense of rotation is known the
 * template is turned so that its arms trail (flipping y and z when the spin is along the normal).
 */
function discAxesWorld(d: { axesEcl: DiscInfo['axesEcl'] }, stretch: Vec3 = [1, 1, 1]): { axes: [Vec3, Vec3, Vec3]; normal: Vec3 } {
  const a = d.axesEcl.major;
  let m = d.axesEcl.minor;
  let n = d.axesEcl.normal;
  if (d.axesEcl.spin && dot(d.axesEcl.spin, n) > 0) {
    m = scale(m, -1);
    n = scale(n, -1);
  }
  return {
    axes: [scale(toWorld(a), stretch[0]), scale(toWorld(m), stretch[1]), scale(toWorld(n), stretch[2])],
    normal: unit(toWorld(n)),
  };
}

/**
 * Axes of a galaxy seen only as an ellipse on the sky: x along its major axis (position angle),
 * y across it, z towards the Sun; its depth along our line of sight is not known and is taken as
 * its width (a prolate body along the major axis).
 */
export function skyAxesWorld(raDeg: number, decDeg: number, paDeg: number, axisRatio: number): { axes: [Vec3, Vec3, Vec3]; normal: Vec3 } {
  const x = skyDirectionWorld(raDeg, decDeg, paDeg);
  const y = skyDirectionWorld(raDeg, decDeg, paDeg + 90);
  const z = cross(x, y);
  return { axes: [x, scale(y, axisRatio), scale(z, axisRatio)], normal: z };
}

// ─── Providers ───────────────────────────────────────────────────────────────────────────

/**
 * A galaxy bound to the Local Group, or to a galaxy or cluster (its parent): held at a fixed place
 * (ecliptic km), given relative to its parent's place. Bound structures do not take part in the
 * expansion, so its distance from its parent never grows.
 */
function fixedProvider(helioEclKm: Readonly<Vec3>, parentEclKm: Readonly<Vec3> | null, label: string, regime: 'approximate' | 'illustrative' = 'approximate'): PositionProvider {
  const p = parentEclKm ? [helioEclKm[0] - parentEclKm[0], helioEclKm[1] - parentEclKm[1], helioEclKm[2] - parentEclKm[2]] : [...helioEclKm];
  return {
    label,
    static: true,
    availability: (ms) => (regime === 'approximate' && Math.abs(ms - J2000_MS) <= GALAXY_YEARS * YEAR_MS ? ALWAYS.approximate : ALWAYS.illustrative),
    positionAt(_t, pos, vel) {
      pos.x = p[0];
      pos.y = p[1];
      pos.z = p[2];
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
}

const TOO_EARLY = {
  available: false,
  reason: 'Too early: the earliest galaxies seen shine 283 million years after the Big Bang, and where galaxies were before that is not modelled',
  regime: 'unknown',
} as const;

/**
 * A galaxy (or cluster) that takes part in the expansion of the universe: held at its comoving
 * place x (heliocentric ecliptic km at the present), it is at a(t) x at the clock's time
 * (sim/cosmicTime.ts; sim/cosmos/expansion.ts). Its own motion (a few hundred km/s) is not
 * followed: within a million years of the present the place is good to a kiloparsec
 * ('approximate'), further away it is illustrative. The expansion is not a velocity here (the
 * redshift of its light comes from the cosmology: expansion.ts), so the velocity is zero.
 */
function expandingProvider(helioEclKm: Readonly<Vec3>, label: string): PositionProvider {
  const x = [helioEclKm[0], helioEclKm[1], helioEclKm[2]];
  return {
    label,
    availability: (ms) => {
      if (Math.abs(ms - J2000_MS) <= GALAXY_YEARS * YEAR_MS) return ALWAYS.approximate;
      return cosmicAtMemo(ms).ageGyr < EARLIEST_GALAXIES_GYR ? TOO_EARLY : ALWAYS.illustrative;
    },
    positionAt(t, pos, vel) {
      const am1 = cosmicAtMemo(msFromAstroTime(t)).am1;
      pos.x = x[0] + am1 * x[0];
      pos.y = x[1] + am1 * x[1];
      pos.z = x[2] + am1 * x[2];
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
}

/** Where a galaxy is held and why, the end of its card's position line. */
const HELD_BOUND = 'held fixed (it moves less than a kiloparsec in a million years; further from the present its orbit is not followed). Gravity holds the Local Group together: it does not take part in the expansion of the universe.';
const HELD_EXPANDING = 'held at its place in the expanding universe: as space expands it is carried away with it (at the present its own motion, a few hundred km/s, moves it less than a kiloparsec in a million years; further from the present that motion is not followed).';

// ─── Words ───────────────────────────────────────────────────────────────────────────────

const CLASS_TEXT: Record<GalaxyClass, string> = {
  spiral: 'Spiral galaxy',
  'magellanic-spiral': 'Magellanic spiral galaxy',
  'magellanic-irregular': 'Irregular dwarf galaxy',
  irregular: 'Irregular galaxy',
  'dwarf-irregular': 'Dwarf irregular galaxy',
  transition: 'Transition dwarf galaxy',
  'dwarf-spheroidal': 'Dwarf spheroidal galaxy',
  'dwarf-elliptical': 'Dwarf elliptical galaxy',
  'compact-elliptical': 'Compact elliptical galaxy',
  elliptical: 'Elliptical galaxy',
  lenticular: 'Lenticular galaxy',
  'lenticular-peculiar': 'Elliptical galaxy with a dust lane',
  cluster: 'Cluster of galaxies',
  'high-z': 'Galaxy of the early universe',
  unknown: 'Faint dwarf galaxy or star cluster',
};

const CLASS_WORD: Record<GalaxyClass, string> = {
  spiral: 'spiral galaxy',
  'magellanic-spiral': 'Magellanic spiral',
  'magellanic-irregular': 'irregular dwarf galaxy',
  irregular: 'irregular galaxy',
  'dwarf-irregular': 'gas-rich dwarf galaxy',
  transition: 'dwarf galaxy with a little gas',
  'dwarf-spheroidal': 'dwarf galaxy of old stars',
  'dwarf-elliptical': 'dwarf elliptical galaxy',
  'compact-elliptical': 'compact elliptical galaxy',
  elliptical: 'elliptical galaxy',
  lenticular: 'lenticular galaxy (a disc without spiral arms)',
  'lenticular-peculiar': 'elliptical galaxy',
  cluster: 'cluster of galaxies',
  'high-z': 'young galaxy',
  unknown: 'faint object',
};

const RELATION: Record<string, string> = {
  MW: 'orbiting the Milky Way',
  M31: 'orbiting the Andromeda Galaxy',
  LG: 'in the Local Group',
  nearby: 'just beyond the Local Group',
};

/** The body id of a row of the local file: its id with the database key's underscores as hyphens ("lg-draco-2"). */
export const bodyIdOf = (rowId: string): string => rowId.replace(/_/g, '-').toLowerCase();

/** "Longeard et al. 2018" from an LVDB reference key ("Longeard2018MNRAS.480.2609L"). */
export function authorYear(key: string): string {
  const m = key.match(/^([A-Za-z-]+?)(\d{4})/);
  return m ? `${m[1].replace(/([a-z]{3,})([A-Z])/g, '$1 $2')} et al. ${m[2]}` : key;
}

/**
 * The name shown: "M 32" → "M32" (the database spaces Messier numbers), and a dwarf named after its
 * constellation alone ("Fornax", "Carina", "Sagittarius") → "Fornax Dwarf", so it is not mistaken for
 * the constellation, the nebula or the black hole of the same name (the database's name stays an alias).
 */
export const tidyName = (name: string): string => name.replace(/^M (\d+)$/, 'M$1').replace(/^([A-Z][a-z]+)$/, '$1 Dwarf');

/** Dynamical mass within the half-light radius, M☉ (Wolf et al. 2010, MNRAS 406, 1220: M½ ≈ 930 σ² R_e, σ in km/s, R_e in pc). */
export const wolfMass = (sigmaKmS: number, rhPc: number): number => 930 * sigmaKmS * sigmaKmS * rhPc;

// ─── The Local Group's galaxies ──────────────────────────────────────────────────────────

/** Inputs every galaxy record needs from outside the files: where the Milky Way's centre is (ecliptic km from the Sun). */
export interface CosmosContext {
  milkyWayEclKm: Vec3;
}

/** The size of a galaxy in the template's unit, kpc, and its projected half-light radius, kpc. */
function sizes(template: TemplateId, rhKpc: number | undefined, r25Kpc: number | undefined, halfLightPerR25: number): { unitKpc: number; halfLightKpc: number } {
  if (template === 'cluster') return { unitKpc: 1000, halfLightKpc: 400 };
  if (template === 'point') return { unitKpc: rhKpc ?? 1, halfLightKpc: rhKpc ?? 1 };
  if (TEMPLATE_UNIT_R25.has(template)) {
    const r25 = r25Kpc ?? (rhKpc !== undefined ? rhKpc / halfLightPerR25 : 10);
    return { unitKpc: r25, halfLightKpc: r25 * halfLightPerR25 };
  }
  const rh = rhKpc ?? (r25Kpc !== undefined ? RE_PER_R25 * r25Kpc : 0.3);
  return { unitKpc: rh, halfLightKpc: rh };
}

/** The templates in units of R25 (the discs). */
export const TEMPLATE_UNIT_R25: ReadonlySet<TemplateId> = new Set(['spiral-early', 'spiral', 'spiral-late', 'barred', 'magellanic', 'lenticular']);

/** Face-on half-light radius of each disc template in R25 units (measured from the templates; checked by the tests). */
export const DISC_HALF_LIGHT_PER_R25: Partial<Record<TemplateId, number>> = {
  'spiral-early': 0.27,
  spiral: 0.32,
  'spiral-late': 0.39,
  barred: 0.31,
  magellanic: 0.35,
  lenticular: 0.2,
};

/** A typical half-light radius for a dwarf of absolute magnitude M_V, pc, when the database has none: the median of those within a magnitude. */
function typicalRh(all: readonly LocalGalaxy[], absMagV: number): number {
  const near = all.filter((g) => g.rhPc !== undefined && g.absMagV !== undefined && Math.abs(g.absMagV - absMagV) <= 1).map((g) => g.rhPc!);
  near.sort((a, b) => a - b);
  return near.length ? near[near.length >> 1] : 300;
}

/** The default magnitude drawn for a galaxy the database gives no brightness (one gas-rich dwarf). */
const DEFAULT_ABS_MAG_V = -12;

interface Built {
  record: BodyRecord;
  /** None for the Virgo and Coma clusters: they are drawn as their members, the cosmic web's points. */
  shape: GalaxyShape | null;
  /** Its anchor in the expanding universe (expansion.ts). */
  anchor: ExpansionAnchor;
}

/**
 * A galaxy's anchor: the comoving place (world axes, km at the present) about which it keeps its
 * physical distance; home (the origin) for the Local Group's members.
 */
export interface ExpansionAnchor {
  id: string;
  anchorWorldKm: Vec3;
  home: boolean;
}

/**
 * The Bullet Cluster's light, drawn illustratively: M_V ≈ −26, about 3 × 10¹² Suns, what a cluster of
 * about 10¹⁵ solar masses shines with at a mass-to-light ratio of a few hundred.
 */
const BULLET_ABS_MAG_V = -26;

function localGalaxy(g: LocalGalaxy, doc: LocalGalaxiesDoc, named: Map<string, NamedObject>, ctx: CosmosContext, andromedaEclKm: Vec3): Built {
  const n = named.get(g.id);
  const template = templateFor(g.class, n?.morphology.type ?? g.morphology, g.id);
  const bv = typicalBV(template);
  const absMagV = g.absMagV ?? (n?.size?.absMagB !== undefined ? n.size.absMagB - bv : DEFAULT_ABS_MAG_V);
  const lumV = g.lumV ?? 10 ** (-0.4 * (absMagV - M_V_SUN));
  const rhPc = g.rhPc ?? (template === 'irregular' || template === 'spheroidal' || template === 'elliptical' ? typicalRh(doc.galaxies, absMagV) : undefined);
  const size = sizes(template, rhPc !== undefined ? rhPc / 1000 : undefined, n?.size?.r25Kpc ?? g.size?.r25Kpc, DISC_HALF_LIGHT_PER_R25[template] ?? 0.35);
  const disc = n?.disc ?? g.disc;
  const e = g.ellipticity ?? 0;
  const orientation = disc
    ? discAxesWorld(disc)
    : skyAxesWorld(g.ra, g.dec, g.pa ?? 0, g.pa !== undefined ? 1 - e : 1);
  const posKm = scale(g.positionEclKpc, KPC_KM);
  const parent = g.id === 'andromeda' ? null : g.subgroup === 'MW' ? 'milky-way' : g.subgroup === 'M31' ? 'andromeda' : null;
  const parentKm = parent === 'milky-way' ? ctx.milkyWayEclKm : parent === 'andromeda' ? andromedaEclKm : null;
  // Bound to the Local Group: a satellite, or inside its zero-velocity surface; the rest take part in the expansion.
  const bound = parent !== null || isBoundToLocalGroup(scale(posKm, 1 / MPC_KM), scale(andromedaEclKm, 1 / MPC_KM));
  const name = tidyName(g.name);
  const distPc = g.distanceKpc * 1000;
  const [ePlus, eMinus] = g.dmodErr;
  const loPc = eMinus != null ? 10 ** ((g.dmod - eMinus + 5) / 5) : undefined;
  const hiPc = ePlus != null ? 10 ** ((g.dmod + ePlus + 5) / 5) : undefined;
  const distKey = g.distanceRef.split(' ')[0];
  const bigRef = n?.distance?.ref;

  // The card and data sheet.
  const rows: { l: string; v: string; u?: string; title?: string }[] = [];
  rows.push({ l: 'Absolute magnitude M_V', v: absMagV.toFixed(2), title: g.absMagV !== undefined ? `${LVDB}: V − distance modulus` : `From its B magnitude (${RC3}) and a B − V typical of its type (${FSI95})` });
  rows.push({ l: 'Luminosity', v: sig(lumV, 2), u: 'L☉', title: 'V band, M_V☉ = 4.83' });
  if (g.vHelio !== undefined) rows.push({ l: 'Radial velocity', v: g.vHelio.toFixed(1), u: 'km/s', title: 'Heliocentric: negative is towards us' });
  if (g.mHI !== undefined) rows.push({ l: 'Hydrogen gas', v: sig(g.mHI * 1e6, 2), u: 'M☉', title: 'Neutral hydrogen (HI)' });
  if (g.sigmaStar !== undefined) rows.push({ l: 'Velocity dispersion', v: String(g.sigmaStar), u: 'km/s', title: 'Of its stars along the line of sight' });
  if (g.feh !== undefined) rows.push({ l: 'Metallicity [Fe/H]', v: g.feh.toFixed(2), title: `${g.fehType ?? ''}: ${sig(10 ** g.feh * 100, 2)}% of the Sun's iron`.trim() });
  if (g.muVHalf !== undefined) rows.push({ l: 'Surface brightness', v: g.muVHalf.toFixed(1), u: 'mag/arcsec²', title: 'Mean V within the half-light radius: the darkest skies on Earth are about 22' });
  const sizeRows: { label: string; pc: number; title?: string }[] = [];
  if (g.rhPc !== undefined) sizeRows.push({ label: 'Half-light radius (major axis)', pc: g.rhPc, title: `${g.rhArcmin}′ on the sky (${LVDB})` });
  else if (rhPc !== undefined) sizeRows.push({ label: 'Half-light radius (typical, not measured)', pc: rhPc, title: 'The database has no size for it: the median of galaxies within a magnitude of it is drawn' });
  const r25 = n?.size?.r25Kpc ?? g.size?.r25Kpc;
  if (r25 !== undefined) sizeRows.push({ label: 'Radius to 25 mag/arcsec² (R25)', pc: r25 * 1000, title: `${sig((n?.size ?? g.size)!.d25Arcmin, 3)}′ across on the sky (${RC3})` });

  const refs = [
    `${n?.distance?.ref ?? g.distanceRef} (distance)`,
    `${LVDB} (${g.refs?.length ?? 0} papers cited per value)`,
    ...(disc ? [`${disc.ref} (disc orientation)`] : []),
    ...(r25 !== undefined ? [`${RC3} (size)`] : []),
  ];
  const info: DeepSkyInfo = {
    type: CLASS_TEXT[g.class],
    distancePc: distPc,
    distanceLoPc: loPc,
    distanceHiPc: hiPc,
    distanceSource: n?.distance ? `${n.distance.method} (${bigRef})` : `distance modulus ${g.dmod} (${authorYear(distKey)}${/scaled/.test(g.distanceRef) ? ', scaled to Andromeda’s Cepheid distance' : ''}, via the Local Volume Database)`,
    sizes: sizeRows,
    rows,
    refs,
  };

  // Facts.
  const relation = RELATION[g.subgroup ?? 'nearby'] ?? 'nearby';
  const facts: string[] = [];
  const sources: string[] = [];
  const labels: string[] = [];
  const own = NAMED_FACTS[g.id];
  if (own) {
    facts.push(...own.facts);
    sources.push(...own.sources);
    labels.push(...own.labels);
  } else {
    facts.push(
      `A ${CLASS_WORD[g.class]} ${relation}, ${lightYearsWords(distPc)} from the Sun, shining with the light of ${sunsWords(lumV)} Suns.`,
    );
    const bib = doc.references[distKey] ?? null;
    sources.push(bib ? adsUrl(bib) : doiUrl(LVDB_DOI));
    labels.push(bib ? authorYear(distKey) : 'Pace 2025');
    if (g.mHI !== undefined && g.mHI >= 1) facts.push(`It holds ${sunsWords(g.mHI * 1e6)} Suns’ worth of hydrogen gas, fuel for new stars.`);
    else if (g.class === 'dwarf-spheroidal') facts.push('No gas has been found in it: it stopped making stars long ago, and its stars are old.');
    if (facts.length === 2) {
      sources.push(doiUrl(LVDB_DOI));
      labels.push('Pace 2025');
    }
    if (g.sigmaStar !== undefined && g.rhPc !== undefined && !g.ambiguous) {
      const m = wolfMass(g.sigmaStar, g.rhPc);
      const ratio = m / (lumV / 2);
      if (ratio > 5) {
        facts.push(
          `Its stars move at ${g.sigmaStar} km/s. To hold them it must weigh about ${sunsWords(m)} Suns within its half-light radius, ${sig(ratio, 2)} times what its stars there account for: it is mostly dark matter.`,
        );
        sources.push(doiUrl('10.1111/j.1365-2966.2010.16753.x'));
        labels.push('Wolf et al. 2010');
      }
    }
  }

  const notes: string[] = [];
  notes.push(templateNote(template, !!disc, disc?.nearSideAssumed ?? false, g.pa === undefined && !disc));
  if (g.rhPc === undefined && rhPc !== undefined) notes.push('The database gives no size for it: a size typical of galaxies as bright is drawn.');
  if (g.lumV === undefined && n?.size?.absMagB === undefined) notes.push('The database gives no brightness for it: a typical dwarf’s is drawn.');
  if (g.ambiguous) notes.push('The Local Volume Database does not confirm it as a galaxy: it may be a star cluster.');
  if (g.subgroup === 'MW') notes.push('From near the Sun its light is part of the Milky Way’s sky map (Gaia saw its stars): the model takes over a few hundred parsecs out.');

  const radiusKm = (TEMPLATE_UNIT_R25.has(template) ? size.unitKpc : 2 * size.halfLightKpc) * KPC_KM;
  const record: BodyRecord = {
    id: bodyIdOf(g.id),
    name,
    aliases: [...new Set([...(g.aliases ?? []), ...(name !== g.name ? [g.name] : []), ...(n?.aliases ?? []), ...(SEARCH_SHORT[bodyIdOf(g.id)] ?? [])])],
    kind: 'galaxy',
    kindText: g.id === 'triangulum' ? 'Spiral galaxy' : CLASS_TEXT[g.class],
    parent,
    physical: {
      radiusKm,
      colour: bvColour(bv),
      luminous: { vmag: absMagV, atKm: 10 * PARSEC_KM, teffK: bvToTemperature(bv) },
    },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 4 * radiusKm, minKm: 0.02 * radiusKm },
    labelRank: labelRankFor(absMagV),
    detector: false,
    orbitLine: false,
    deepSky: info,
    facts,
    factSources: sources.slice(0, facts.length),
    factSourceLabels: labels.slice(0, facts.length),
    // The Local Group's file keeps the named entry's position for M31 and M33, and the database's own
    // centre for the Magellanic Clouds.
    positionNote: `Position: ${n && Math.abs(n.ra - g.ra) < 1e-6 && Math.abs(n.dec - g.dec) < 1e-6 ? n.positionRef.split(';')[0] : 'the Local Volume Database’s centre'}, at its measured distance, ${bound ? HELD_BOUND : HELD_EXPANDING}`,
    modelNotes: notes,
    dataSource: n ? `${LVDB}; ${bigRef}` : LVDB,
    article: ARTICLE_GALAXIES,
    provider: bound
      ? fixedProvider(posKm, parentKm, parent ? 'Measured place, relative to the galaxy it orbits' : 'Measured place (heliocentric), bound to the Local Group')
      : expandingProvider(posKm, 'Measured place (heliocentric), carried by the expansion of the universe'),
  };
  const shape: GalaxyShape = {
    id: bodyIdOf(g.id),
    template,
    scaleKpc: size.unitKpc,
    axes: orientation.axes,
    normal: orientation.normal,
    lumV,
    halfLightKpc: size.halfLightKpc,
    inSkyMap: g.subgroup === 'MW',
    dust: dustFor(template, size.unitKpc),
  };
  return { record, shape, anchor: { id: record.id, anchorWorldKm: bound ? [0, 0, 0] : eclToWorld(posKm), home: bound } };
}

/** A position basis in named.json that divides a measured (luminosity) distance by 1 + z to place the galaxy where it is now. */
const DIVIDED_BASIS = /^measured distance \/ \(1 \+ z_cmb\)/;

/** named.json's position basis in words for a card. */
function basisWords(basis: string): string {
  if (DIVIDED_BASIS.test(basis)) return 'its measured distance, divided by 1 + its redshift to give where it is now';
  if (basis.startsWith('comoving distance from z_cmb')) return 'the comoving distance of its redshift (Planck 2018)';
  return basis.replace(/ \(Planck.*\)$/, '');
}

/**
 * The short names people search by, for the famous object that bears them: "Andromeda" is the galaxy,
 * not the dwarf Andromeda X, whose name only begins with it (an exact alias outranks a prefix of a name).
 */
const SEARCH_SHORT: Record<string, readonly string[]> = {
  andromeda: ['Andromeda', 'Andromeda Nebula'],
  triangulum: ['Triangulum'],
  'virgo-cluster': ['Virgo'],
  'coma-cluster': ['Coma'],
};

/** Label priority: the bright galaxies first, the faintest dwarfs (fainter than M_V = −8) after everything else. */
const labelRankFor = (absMagV: number): number => (absMagV < -18 ? 13.2 : absMagV < -14 ? 14 + (absMagV + 18) * 0.1 : absMagV < -8 ? 14.5 + (absMagV + 14) * 0.05 : 17 + (absMagV + 8) * 0.01);

/** A label colour from a B − V. */
function bvColour(bv: number): string {
  return bv > 0.9 ? '#ffd9a8' : bv > 0.6 ? '#f2e2c4' : bv > 0.3 ? '#dfe4f2' : '#c8d6ff';
}

/** What is model about how a galaxy is drawn, in one line. */
function templateNote(template: TemplateId, disc: boolean, nearSideAssumed: boolean, orientationUnknown: boolean): string {
  const kind: Record<TemplateId, string> = {
    'spiral-early': 'an early spiral (a big bulge and tightly wound arms)',
    spiral: 'a spiral',
    'spiral-late': 'a late spiral (a small bulge and open arms)',
    barred: 'a barred spiral',
    magellanic: 'a Magellanic spiral (an off-centre bar and one main arm)',
    lenticular: 'a disc galaxy dominated by its bulge',
    irregular: 'an irregular galaxy (a thick body with clumps of young stars)',
    spheroidal: 'a dwarf spheroidal (old stars in a smooth ball)',
    elliptical: 'an elliptical',
    compact: 'a compact young galaxy',
    cluster: 'a cluster of galaxies',
    point: 'a galaxy',
  };
  // What of its structure is typical rather than mapped: arms and dust for the discs, clumps for the irregulars; a smooth ball has none.
  const typical: Partial<Record<TemplateId, string>> = {
    'spiral-early': 'Its arms and dust',
    spiral: 'Its arms and dust',
    'spiral-late': 'Its arms and dust',
    barred: 'Its bar, arms and dust',
    magellanic: 'Its bar, arm and clumps',
    lenticular: 'Its disc and dust',
    irregular: 'Its clumps',
    compact: 'Its clumps',
  };
  const parts = typical[template];
  let s = `Drawn as a model: a few thousand points following the light of ${kind[template]}, scaled to its measured size and brightness.${parts ? ` ${parts} are typical of its type, not a map of this galaxy.` : ' How its light falls off is typical of its type, not a map of this galaxy.'}`;
  if (disc) s += ' Its disc is tilted as measured.';
  if (nearSideAssumed) s += ' Which side of the disc is nearer to us is not known: seen from elsewhere, the real tilt could be the mirror image of the one drawn.';
  if (!disc && !orientationUnknown) s += ' Its shape on the sky is measured; its depth along our line of sight is not, and is drawn as deep as it is wide.';
  if (orientationUnknown) s += ' Its orientation is not measured: it is drawn round.';
  return s;
}

// ─── Hand-written facts of the galaxies the articles name ────────────────────────────────

interface Facts {
  facts: string[];
  sources: string[];
  labels: string[];
}

const NAMED_FACTS: Record<string, Facts> = {
  andromeda: {
    facts: [
      'The nearest big galaxy, 761,000 parsecs (2.48 million light-years) away: the most distant thing most people can see without a telescope.',
      'Its disc is tilted 77.7° to our line of sight, so from Earth it looks like a long oval about 3° across, six times the width of the full Moon.',
      'It is coming towards us at about 300 km/s, but whether it merges with the Milky Way within the next 10 billion years is about an even chance.',
    ],
    sources: [doiUrl('10.3847/1538-4357/ac1597'), doiUrl('10.1051/0004-6361/200913297'), doiUrl('10.1038/s41550-025-02563-1')],
    labels: ['Li et al. 2021', 'Corbelli et al. 2010', 'Sawala et al. 2025'],
  },
  triangulum: {
    facts: [
      'A smaller spiral 840,000 parsecs (2.74 million light-years) away, a companion of the Andromeda Galaxy.',
      'Its disc is tilted 52° to our line of sight; its light is spread over an area on the sky larger than the full Moon.',
    ],
    sources: [adsUrl('2023ApJ...951..118B'), adsUrl('2017AJ....154...41K')],
    labels: ['Breuval et al. 2023', 'Kam et al. 2017'],
  },
  lmc: {
    facts: [
      'The biggest of the Milky Way’s satellite galaxies, 49,590 parsecs (162,000 light-years) away.',
      'Its distance, measured with pairs of stars that eclipse each other to within 1%, anchors the ladder of distances out to the rest of the universe.',
      'It holds the Tarantula Nebula, the busiest star-forming region in the Local Group, and the remains of supernova 1987A.',
    ],
    sources: [doiUrl('10.1038/s41586-019-0999-4'), doiUrl('10.1038/s41586-019-0999-4'), doiUrl('10.1088/0004-637X/781/2/121')],
    labels: ['Pietrzyński et al. 2019', 'Pietrzyński et al. 2019', 'van der Marel & Kallivayalil 2014'],
  },
  smc: {
    facts: [
      'A dwarf galaxy 62,440 parsecs (204,000 light-years) away, the Large Magellanic Cloud’s smaller neighbour.',
      'Its older stars form an elongated body stretched along our line of sight; a bridge of hydrogen gas joins it to the Large Cloud.',
    ],
    sources: [doiUrl('10.3847/1538-4357/abbb2b'), adsUrl('2019MNRAS.483..392D')],
    labels: ['Graczyk et al. 2020', 'Di Teodoro et al. 2019'],
  },
};

// ─── The named galaxies beyond the Local Group ───────────────────────────────────────────

const NAMED_EXTRA: Record<string, Facts> = {
  m81: {
    facts: [
      'A grand-design spiral 3.63 million parsecs (11.8 million light-years) away, the brightest galaxy of a group in Ursa Major.',
      'Its pull has disturbed its neighbours M82 and NGC 3077: streams of hydrogen gas run between the three.',
    ],
    sources: [doiUrl('10.3847/1538-4357/ac94d8'), doiUrl('10.1038/372530a0')],
    labels: ['Tully et al. 2023', 'Yun, Ho & Lo 1994'],
  },
  m87: {
    facts: [
      'The giant elliptical at the heart of the Virgo Cluster, 16.8 million parsecs (55 million light-years) away.',
      'In 2019 the Event Horizon Telescope showed the shadow of its central black hole, M87*, 6.5 billion times the mass of the Sun.',
      'Hubble watched knots in its jet appear to move at up to about six times the speed of light: an illusion of matter moving at close to c almost towards us.',
    ],
    sources: [adsUrl('2019ApJ...875L...6E'), adsUrl('2019ApJ...875L...6E'), adsUrl('1999ApJ...520..621B')],
    labels: ['EHT Collaboration 2019', 'EHT Collaboration 2019', 'Biretta, Sparks & Macchetto 1999'],
  },
  'centaurus-a': {
    facts: [
      'The nearest galaxy whose central black hole shoots out radio jets, 3.64 million parsecs (11.9 million light-years) away.',
      'A dark lane of dust crosses its bright body: the remains of a gas-rich galaxy it swallowed.',
    ],
    sources: [doiUrl('10.3847/1538-4357/ac94d8'), adsUrl('1998A&ARv...8..237I')],
    labels: ['Tully et al. 2023', 'Israel 1998'],
  },
  sombrero: {
    facts: [
      'A disc galaxy 9.55 million parsecs (31 million light-years) away, seen almost edge-on: a ring of dust crosses a huge glowing bulge.',
      'Its distance comes from the brightest red giant stars in Hubble’s pictures of it (the tip of the red giant branch).',
    ],
    sources: [doiUrl('10.3847/0004-6256/152/5/144'), doiUrl('10.3847/0004-6256/152/5/144')],
    labels: ['McQuinn et al. 2016', 'McQuinn et al. 2016'],
  },
  whirlpool: {
    facts: [
      'A spiral seen nearly face-on, 8.58 million parsecs (28 million light-years) away, pulling on its small companion NGC 5195.',
      'The first galaxy whose spiral shape anyone saw: Lord Rosse sketched its arms in 1845 through his 72-inch telescope.',
    ],
    sources: [doiUrl('10.3847/0004-637X/826/1/21'), adsUrl('1850RSPT..140..499R')],
    labels: ['McQuinn et al. 2016', 'Rosse 1850'],
  },
  'virgo-cluster': {
    facts: [
      'The nearest big cluster of galaxies, 16.5 million parsecs (54 million light-years) away; the Local Group lies on its outskirts.',
      'About 2,000 galaxies have been catalogued in it. Its sixty brightest are drawn here as galaxies of their own, most at their measured distances; the rest of the 164 whose distances Cosmicflows-4 measured are points of the cosmic web.',
    ],
    sources: [adsUrl('2007ApJ...655..144M'), adsUrl('1985AJ.....90.1681B')],
    labels: ['Mei et al. 2007', 'Binggeli, Sandage & Tammann 1985'],
  },
  'coma-cluster': {
    facts: [
      'A rich cluster of more than a thousand galaxies, 98.5 million parsecs (321 million light-years) away.',
      'In 1933 Fritz Zwicky found its galaxies moving far too fast for the mass their light shows: the first strong hint of dark matter.',
      'Calibrated with the Planck value of the Hubble constant, the same supernovae put it at 111.8 million parsecs: the Hubble tension, on one cluster.',
    ],
    sources: [doiUrl('10.3847/2041-8213/ada0bd'), 'https://ui.adsabs.harvard.edu/abs/1933AcHPh...6..110Z', doiUrl('10.3847/2041-8213/ada0bd')],
    labels: ['Scolnic et al. 2025', 'Zwicky 1933', 'Scolnic et al. 2025'],
  },
  'bullet-cluster': {
    facts: [
      'Two clusters of galaxies that passed through each other, seen as they were 3.5 billion years ago.',
      'Their hot gas was slowed by the collision, while their galaxies and most of their mass, mapped by gravitational lensing, went on through: evidence that most of the mass is dark matter.',
    ],
    sources: [doiUrl('10.1086/508162'), doiUrl('10.1086/508162')],
    labels: ['Clowe et al. 2006', 'Clowe et al. 2006'],
  },
  'gn-z11': {
    facts: [
      'Seen as it was 435 million years after the Big Bang, at redshift 10.6.',
      'Found with Hubble in 2016 and confirmed by JWST, which found signs of a black hole growing at its centre.',
    ],
    sources: [adsUrl('2023A&A...677A..88B'), adsUrl('2024Natur.627...59M')],
    labels: ['Bunker et al. 2023', 'Maiolino et al. 2024'],
  },
  'jades-gs-z14-0': {
    facts: [
      'Seen as it was 290 million years after the Big Bang, at redshift 14.18.',
      'It held the record for the most distant galaxy known from May 2024 until MoM-z14. ALMA found oxygen in it: stars had already lived and died there.',
    ],
    sources: [adsUrl('2024Natur.633..318C'), adsUrl('2025A&A...696A..87C')],
    labels: ['Carniani et al. 2024', 'Carniani et al. 2025'],
  },
  'mom-z14': {
    facts: [
      'The most distant galaxy confirmed as of September 2026: redshift 14.44, seen 283 million years after the Big Bang.',
      'Its light has travelled for 13.5 billion years; in that time space has stretched so much that the galaxy itself is now about 34 billion light-years away.',
    ],
    sources: [doiUrl('10.33232/001c.156033'), doiUrl('10.33232/001c.156033')],
    labels: ['Naidu et al. 2026', 'Naidu et al. 2026'],
  },
};

/**
 * The young galaxies' sizes and ultraviolet magnitudes (rest frame, AB), which stand in for M_V:
 * a young galaxy's spectrum is nearly flat in frequency from the ultraviolet to the visible.
 */
export const HIGH_Z: Record<string, { rePc: number; muv: number; ref: string }> = {
  'gn-z11': { rePc: 64, muv: -21.5, ref: 'Tacchella et al. 2023, ApJ 952, 74 (r_e = 64 ± 20 pc); Bunker et al. 2023 (M_UV)' },
  'jades-gs-z14-0': { rePc: 260, muv: -20.81, ref: 'Carniani et al. 2024, Nature 633, 318 (r_e = 260 ± 20 pc, M_UV = −20.81)' },
  'mom-z14': { rePc: 74, muv: -20.2, ref: 'Naidu et al. 2026, The Open Journal of Astrophysics 9 (r_e = 74 pc, M_UV = −20.2)' },
};

/**
 * Half the Cosmicflows-4 members of each cluster lie within this distance of its centre on the
 * sky (from cosmic-web.bin.gz; the tests check them): the size drawn and framed.
 */
export const CLUSTER_RADIUS_MPC: Record<string, number> = { 'virgo-cluster': 0.91, 'coma-cluster': 1.36, 'bullet-cluster': 1 };

function namedObject(o: NamedObject, ctx: { virgoEclKm: Vec3 | null }): Built {
  const cls = o.morphology.class;
  const template = templateFor(cls, o.morphology.type, o.id);
  const bv = typicalBV(template);
  const posKm = scale(o.positionEclMpc, MPC_KM);
  const highZ = HIGH_Z[o.id];
  const isCluster = o.kind === 'cluster';
  const absMagV = highZ ? highZ.muv : o.size?.absMagB !== undefined ? o.size.absMagB - bv : isCluster ? BULLET_ABS_MAG_V : -20;
  const lumV = 10 ** (-0.4 * (absMagV - M_V_SUN));
  const size = sizes(template, highZ ? highZ.rePc / 1000 : undefined, o.size?.r25Kpc, DISC_HALF_LIGHT_PER_R25[template] ?? 0.35);
  const orientation = o.disc
    ? discAxesWorld(o.disc)
    : o.id === 'bullet-cluster'
      ? skyAxesWorld(o.ra, o.dec, 270, 1)
      : skyAxesWorld(o.ra, o.dec, o.size?.pa ?? 0, o.size?.pa != null && o.size.axisRatio != null ? o.size.axisRatio : 1);
  const parent = o.id === 'm87' ? 'virgo-cluster' : null;
  // The card's distance is where it is placed: a measured distance divided by 1 + z for the galaxies
  // beyond the Local Group (a luminosity distance, turned into where it is now), the comoving distance of
  // its redshift for the young galaxies and the Bullet Cluster. The measured value stays in the facts.
  const placedMpc = norm(o.positionEclMpc);
  const divided = !!o.distance && DIVIDED_BASIS.test(o.positionBasis);
  const toPlaced = divided ? placedMpc / o.distance!.mpc : 1;
  const distMpc = o.distance ? o.distance.mpc * toPlaced : (o.cosmology?.comovingDistanceMpc ?? placedMpc);
  const facts = NAMED_EXTRA[o.id] ?? { facts: [`${o.name}.`], sources: [], labels: [] };
  const rows: { l: string; v: string; u?: string; title?: string }[] = [];
  if (o.zHelio) rows.push({ l: 'Redshift z', v: String(o.zHelio.value), title: o.zHelio.ref });
  else if (o.vHelio) rows.push({ l: 'Radial velocity', v: String(o.vHelio.value), u: 'km/s', title: o.vHelio.ref });
  if (o.cosmology) {
    // As seen from the Solar System at the present (the card says what the camera sees now: expansion.ts).
    const seen = 'Seen from the Solar System at the present';
    rows.push({ l: 'Light set out', v: sig(o.cosmology.lookbackTimeGyr, 3), u: 'billion years ago', title: `${seen}: the lookback time in the Planck 2018 cosmology` });
    rows.push({ l: 'Age of the universe then', v: o.cosmology.ageAtEmissionGyr < 1 ? `${Math.round(o.cosmology.ageAtEmissionGyr * 1000)}` : sig(o.cosmology.ageAtEmissionGyr, 3), u: o.cosmology.ageAtEmissionGyr < 1 ? 'million years' : 'billion years', title: seen });
    rows.push({ l: 'Distance when the light set out', v: lightYearsWords((o.cosmology.angularDiameterDistanceMpc * 1e6)).replace(' light-years', ''), u: 'light-years', title: `${seen}: the proper distance at emission (the angular-diameter distance)` });
  }
  if (!isCluster && !highZ) rows.push({ l: 'Absolute magnitude M_V', v: absMagV.toFixed(2), title: `From its B magnitude (${RC3}) and a B − V typical of its type (${FSI95})` });
  if (highZ) rows.push({ l: 'Ultraviolet magnitude M_UV', v: highZ.muv.toFixed(2), title: highZ.ref });
  const sizeRows: { label: string; pc: number; title?: string }[] = [];
  if (o.size?.r25Kpc) sizeRows.push({ label: 'Radius to 25 mag/arcsec² (R25)', pc: o.size.r25Kpc * 1000, title: `${sig(o.size.d25Arcmin, 3)}′ across on the sky (${RC3})` });
  if (highZ) sizeRows.push({ label: 'Half-light radius', pc: highZ.rePc, title: highZ.ref });
  if (isCluster) sizeRows.push({ label: 'Half its measured galaxies lie within', pc: CLUSTER_RADIUS_MPC[o.id] * 1e6, title: 'On the sky, from Cosmicflows-4 (the Bullet Cluster: about a megaparsec)' });

  const distanceLine = o.distance
    ? `${o.distance.method} (${o.distance.ref})${divided ? ', divided by 1 + its redshift to give where it is now' : ''}`
    : `its redshift in the Planck 2018 cosmology: a comoving distance, where it is now (${o.zHelio?.ref.split(' (')[0] ?? 'redshift'})`;
  const info: DeepSkyInfo = {
    type: isCluster ? 'Cluster of galaxies' : CLASS_TEXT[cls],
    distancePc: distMpc * 1e6,
    ...(o.distance && typeof o.distance.errMpc === 'number'
      ? { distanceLoPc: (o.distance.mpc - o.distance.errMpc) * toPlaced * 1e6, distanceHiPc: (o.distance.mpc + o.distance.errMpc) * toPlaced * 1e6 }
      : o.distance && Array.isArray(o.distance.errMpc)
        ? { distanceLoPc: (o.distance.mpc - o.distance.errMpc[1]) * toPlaced * 1e6, distanceHiPc: (o.distance.mpc + o.distance.errMpc[0]) * toPlaced * 1e6 }
        : {}),
    distanceSource: distanceLine,
    distanceNow: !o.distance || divided,
    sizes: sizeRows,
    rows,
    refs: [
      `${o.positionRef} (position)`,
      ...(o.distance ? [`${o.distance.ref} (distance)`] : []),
      ...(o.zHelio ? [`${o.zHelio.ref} (redshift)`] : []),
      ...(o.disc ? [`${o.disc.ref} (disc)`] : []),
      ...(o.size ? [`${RC3} (size)`] : []),
      ...(highZ ? [highZ.ref] : []),
    ],
  };
  const notes: string[] = [];
  if (highZ) {
    notes.push(
      `Placed where it is now, ${lightYearsWords(distMpc * 1e6)} away as space has stretched. What you would see from here is its light from ${sig(o.cosmology!.lookbackTimeGyr, 3)} billion years ago: the galaxy as it was ${Math.round(o.cosmology!.ageAtEmissionGyr * 1000)} million years after the Big Bang. It is drawn that way, as JWST saw it; what it has become since, nobody knows.`,
      'Seen from here its light is drawn redshifted and dimmed as the expansion of the universe has stretched it, with the spectrum of a hot black body (its ultraviolet magnitude stands in for its visible one). In truth hydrogen in the young universe absorbed all its light bluer than 121.6 nm, which the redshift has carried to 1.4 micrometres and beyond: to the eye it would be entirely dark, and only infrared telescopes such as JWST see it.',
    );
  } else if (isCluster && o.id !== 'bullet-cluster') {
    notes.push(
      o.id === 'virgo-cluster'
        ? 'Drawn as its galaxies: its sixty brightest as galaxies of their own (at their measured distances where those are precise, else at the cluster’s), the rest with measured distances as points of the cosmic web (Cosmicflows-4); many fainter members are in neither.'
        : 'Drawn as its galaxies: its brightest thirty-odd as galaxies of their own, all at the cluster’s distance (their own are not precise enough to place them in depth), the rest with measured distances as points of the cosmic web (Cosmicflows-4); many fainter members are in neither.',
    );
  } else if (o.id === 'bullet-cluster') {
    notes.push('Illustrative: its galaxies are drawn as two groups about its two brightest galaxies, 0.7 Mpc apart on the sky (Clowe et al. 2006); where each galaxy sits is a random draw, and their total light (about 3 × 10¹² Suns) is typical of so massive a cluster.');
    notes.push('View › Dark matter adds its hot gas (Chandra’s X-ray picture) and its mass (a smooth model of Clowe et al.’s lensing map, fitted to their published peaks) as a card on the sky: a picture of where the matter is, the gas in pink, the mass in blue.');
    notes.push('Placed where it is now, at the comoving distance of its redshift.');
  } else {
    notes.push(templateNote(template, !!o.disc, o.disc?.nearSideAssumed ?? false, !o.disc && (o.size?.pa == null || o.size?.axisRatio == null)));
    if (o.id === 'centaurus-a') notes.push('Its warped dust lane and radio jets are not drawn.');
    if (o.id === 'm87') notes.push('Its jet, about 5,000 light-years long, is not drawn.');
    if (o.id === 'sombrero') notes.push('Its inclination (84°) is approximate, and its dust ring is drawn at half the disc’s radius with an illustrative depth.');
    if (o.id === 'whirlpool') notes.push('Its companion NGC 5195 is not drawn.');
  }
  const radiusKm = (isCluster ? CLUSTER_RADIUS_MPC[o.id] * 1000 : TEMPLATE_UNIT_R25.has(template) ? size.unitKpc : 2 * size.halfLightKpc) * KPC_KM;
  const record: BodyRecord = {
    id: o.id,
    name: o.name.replace(/'/g, '’'),
    aliases: [
      ...new Set([
        ...o.aliases,
        ...(o.name.includes("'") ? [o.name] : []),
        ...(o.id === 'mom-z14' ? ['most distant galaxy', 'MoM z14'] : o.id === 'jades-gs-z14-0' ? ['JADES GS z14 0'] : []),
        ...(SEARCH_SHORT[o.id] ?? []),
      ]),
    ],
    kind: isCluster ? 'cluster' : 'galaxy',
    kindText: isCluster ? 'Cluster of galaxies' : o.id === 'm81' ? 'Spiral galaxy' : CLASS_TEXT[cls],
    parent,
    physical: {
      radiusKm,
      colour: bvColour(bv),
      luminous: isCluster ? undefined : { vmag: absMagV, atKm: 10 * PARSEC_KM, teffK: bvToTemperature(bv) },
    },
    visual: { renderer: 'layer' },
    // A young galaxy is compact and very bright: framed from farther out, to see its clumps.
    framing: { distanceKm: (highZ ? 12 : 4) * radiusKm, minKm: 0.02 * radiusKm },
    labelRank: isCluster ? 13.1 : highZ ? 13.4 : 13.3,
    detector: false,
    orbitLine: false,
    deepSky: info,
    facts: facts.facts,
    factSources: facts.sources,
    factSourceLabels: facts.labels,
    positionNote: highZ
      ? `Position: ${o.positionRef.split(';')[0]}, at the comoving distance of its redshift (Planck 2018): where the galaxy is at the present, not where its light left it; carried away with space as the universe expands.`
      : parent
        ? `Position: ${o.positionRef.split(';')[0]}, at ${basisWords(o.positionBasis)}; held fixed in its cluster, which gravity holds together: the cluster as a whole is carried away as the universe expands.`
        : `Position: ${o.positionRef.split(';')[0]}, at ${basisWords(o.positionBasis)}; ${HELD_EXPANDING}`,
    modelNotes: notes,
    dataSource: `named.json: ${o.positionRef.split(';')[0]}; ${o.distance?.ref ?? o.zHelio?.ref ?? ''}`,
    // The young galaxies belong to the story of how far we can reach, Virgo and Coma to that of the
    // expanding universe (the cosmic web they are knots of), the rest to that of the galaxies.
    article: highZ ? ARTICLE_EDGE : o.id === 'virgo-cluster' || o.id === 'coma-cluster' ? ARTICLE_EXPANDING : ARTICLE_GALAXIES,
    provider: parent
      ? fixedProvider(posKm, ctx.virgoEclKm, 'Measured place, relative to its cluster')
      : expandingProvider(posKm, 'Measured place (heliocentric), carried by the expansion of the universe'),
  };
  const shape: GalaxyShape | null = isCluster && o.id !== 'bullet-cluster' ? null : {
    id: o.id,
    template,
    scaleKpc: size.unitKpc,
    axes: orientation.axes,
    normal: orientation.normal,
    lumV,
    halfLightKpc: size.halfLightKpc,
    inSkyMap: false,
    dust: dustFor(template, size.unitKpc),
  };
  // A galaxy in a cluster keeps its place in it: the cluster's anchor.
  const anchorKm = parent && ctx.virgoEclKm ? ctx.virgoEclKm : posKm;
  return { record, shape, anchor: { id: record.id, anchorWorldKm: eclToWorld(anchorKm), home: false } };
}

// ─── More galaxies: famous ones beyond the Local Group, and the Virgo and Coma clusters' brightest ─────

const OPENNGC = 'OpenNGC (Verga; from HyperLEDA, NED and SIMBAD)';
const OPENNGC_URL = 'https://github.com/mattiaverga/OpenNGC';
const CF4_REF = 'Tully et al. 2023, ApJ 944, 94 (Cosmicflows-4)';
const MEI_2007 = 'Mei et al. 2007, ApJ 655, 144';

/** "3.63 million parsecs (11.8 million light-years)". */
const mpcWords = (mpc: number): string => `${sig(mpc, 3)} million parsecs (${lightYearsWords(mpc * 1e6)})`;

/** What a galaxy's picture is, on its card (scene/GalaxyPictures.tsx; sim/cosmos/pictures.ts). */
export const PICTURE_NOTE =
  'Seen from near our line of sight it is drawn with a photograph (credited on its card), laid on its disc as we see it: a photograph shows the galaxy only from about where it was taken, so as you move away from our line of sight, or come close enough for its pixels to show, the picture fades into the model. Its light is the galaxy’s measured light, spread as the photograph spreads it.';

/** Hand-written facts of the famous ones (the rest get a line from their measurements). */
const MORE_FACTS: Record<string, Facts> = {
  m82: {
    facts: [
      'A starburst galaxy in the M81 group: a close pass of M81 a few hundred million years ago set off a burst of star formation in its centre.',
      'Winds from its many young stars and supernovae blow gas out above and below its disc, seen as red filaments in pictures.',
    ],
    sources: [doiUrl('10.1038/372530a0'), doiUrl('10.1086/305102')],
    labels: ['Yun, Ho & Lo 1994', 'Shopbell & Bland-Hawthorn 1998'],
  },
  m64: {
    facts: [
      'A band of dust in front of its bright centre gives it its name.',
      'The gas in its outer disc turns the opposite way to the gas and stars of its inner disc: perhaps the remains of a small galaxy it swallowed.',
    ],
    sources: [doiUrl('10.3847/1538-4357/ac94d8'), doiUrl('10.1038/360442a0')],
    labels: ['Tully et al. 2023', 'Braun, Walterbos & Kennicutt 1992'],
  },
  'ngc-4038': {
    facts: [
      'Two spiral galaxies in collision, NGC 4038 and NGC 4039. Stars flung out by the encounter form two long tails, the antennae.',
      'The collision has set off a burst of star formation: Hubble found thousands of young, massive star clusters where the two discs meet.',
    ],
    sources: [doiUrl('10.3847/1538-4357/ac94d8'), doiUrl('10.1086/117334')],
    labels: ['Tully et al. 2023', 'Whitmore & Schweizer 1995'],
  },
  'ngc-4039': {
    facts: ['The smaller of the two colliding spirals of the Antennae Galaxies, with NGC 4038.'],
    sources: [doiUrl('10.1086/117334')],
    labels: ['Whitmore & Schweizer 1995'],
  },
  m101: {
    facts: [
      'A big spiral seen face-on in Ursa Major.',
      'In 2011 it hosted SN 2011fe, the nearest type Ia supernova in decades, found within a day of its explosion.',
    ],
    sources: [doiUrl('10.3847/1538-4357/ac94d8'), doiUrl('10.1038/nature10644')],
    labels: ['Tully et al. 2023', 'Nugent et al. 2011'],
  },
  'ngc-3628': {
    facts: ['The edge-on member of the Leo Triplet, with M65 and M66. Its encounters with them have pulled out a long tail of stars.'],
    sources: [adsUrl('1974AJ.....79..671K')],
    labels: ['Kormendy & Bahcall 1974'],
  },
  m100: {
    facts: ['A grand-design spiral in the Virgo Cluster. In 1994 Hubble found Cepheid variable stars in it, giving one of the first precise distances to the cluster, about 17 million parsecs.'],
    sources: [doiUrl('10.1038/371757a0')],
    labels: ['Freedman et al. 1994'],
  },
};

/** Words for the members of a cluster. */
const CLUSTER_OF: Record<string, string> = { virgo: 'the Virgo Cluster', coma: 'the Coma Cluster' };

/**
 * A galaxy that keeps its place in its group, which takes part in the expansion: at comoving place x with its group's
 * anchor c, it is at a c + (x − c) = x + (a − 1) c at the clock's time (as the cosmic web's points are).
 */
function anchoredProvider(helioEclKm: Readonly<Vec3>, anchorEclKm: Readonly<Vec3>): PositionProvider {
  const x = [helioEclKm[0], helioEclKm[1], helioEclKm[2]];
  const c = [anchorEclKm[0], anchorEclKm[1], anchorEclKm[2]];
  return {
    label: 'Measured place (heliocentric), held in its group, which is carried by the expansion of the universe',
    availability: (ms) => {
      if (Math.abs(ms - J2000_MS) <= GALAXY_YEARS * YEAR_MS) return ALWAYS.approximate;
      return cosmicAtMemo(ms).ageGyr < EARLIEST_GALAXIES_GYR ? TOO_EARLY : ALWAYS.illustrative;
    },
    positionAt(t, pos, vel) {
      const am1 = cosmicAtMemo(msFromAstroTime(t)).am1;
      pos.x = x[0] + am1 * c[0];
      pos.y = x[1] + am1 * c[1];
      pos.z = x[2] + am1 * c[2];
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
}

/**
 * A galaxy of more-galaxies.json.gz as a body. The famous ones are placed where the cosmic web places their row, and
 * take part in the expansion with their group (its anchor: the deep-sky layer's); the clusters' members are held in
 * their cluster, relative to its place, as M87 is in Virgo.
 */
function moreGalaxy(g: MoreGalaxy, clusterEclKm: Record<string, Vec3 | null>, image: DeepSkyImage | undefined): Built {
  const template = templateForHubble(g.hubble);
  const bv = typicalBV(template);
  const db = g.distance;
  const dMpc = db.placedMpc;
  const mag = apparentV(g, bv);
  const absMagV = mag ? mag.v - 5 * Math.log10((db.measuredMpc ?? dMpc) * 1e5) : -20;
  const lumV = 10 ** (-0.4 * (absMagV - M_V_SUN));
  const majArcmin = g.majArcmin ?? 1;
  const q = g.minArcmin && g.majArcmin ? Math.min(1, g.minArcmin / g.majArcmin) : 1;
  const r25Kpc = dMpc * 1000 * Math.tan(((majArcmin / 2) * Math.PI) / 10800);
  const size = sizes(template, undefined, r25Kpc, DISC_HALF_LIGHT_PER_R25[template] ?? 0.35);
  const disc = DISC_TEMPLATES.has(template) && g.pa !== null;
  const inclination = inclinationFromAxisRatio(q);
  const orientation = disc ? discAxesWorld({ axesEcl: discAxesEcl(g.ra, g.dec, { inclination, pa: g.pa! }) }) : skyAxesWorld(g.ra, g.dec, g.pa ?? 0, g.pa !== null ? q : 1);
  const posKm = scale(g.positionEclMpc, MPC_KM);
  const parent = g.set === 'virgo' ? 'virgo-cluster' : g.set === 'coma' ? 'coma-cluster' : null;
  const clusterKm = parent ? clusterEclKm[g.set] : null;
  const where = parent ? CLUSTER_OF[g.set] : null;
  const cls: GalaxyClass = template === 'elliptical' ? 'elliptical' : template === 'lenticular' ? 'lenticular' : template === 'irregular' ? 'irregular' : 'spiral';
  const fromMei = db.ref.startsWith('Mei');

  const facts: string[] = [`A ${CLASS_WORD[cls]}${where ? ` in ${where}` : ''}, ${mpcWords(db.measuredMpc ?? dMpc)} from the Sun, shining with the light of ${sunsWords(lumV)} Suns.`];
  const sources: string[] = [fromMei || (g.set === 'virgo' && db.basis === 'cluster') ? adsUrl('2007ApJ...655..144M') : g.set === 'coma' ? doiUrl('10.3847/2041-8213/ada0bd') : doiUrl('10.3847/1538-4357/ac94d8')];
  const labels: string[] = [fromMei || (g.set === 'virgo' && db.basis === 'cluster') ? 'Mei et al. 2007' : g.set === 'coma' ? 'Scolnic et al. 2025' : 'Tully et al. 2023'];
  const own = MORE_FACTS[g.id];
  if (own) {
    facts.push(...own.facts);
    sources.push(...own.sources);
    labels.push(...own.labels);
  }
  if (g.vHelio !== null && g.vHelio < 0) {
    facts.push(`Its light is blueshifted: it is coming towards us at ${Math.abs(g.vHelio)} km/s, its fall through the cluster outrunning the expansion of the universe.`);
    sources.push(OPENNGC_URL);
    labels.push('OpenNGC');
  }

  const rows: { l: string; v: string; u?: string; title?: string }[] = [];
  if (g.hubble) rows.push({ l: 'Type', v: g.hubble, title: `Hubble type (${OPENNGC})` });
  rows.push({
    l: 'Absolute magnitude M_V',
    v: absMagV.toFixed(2),
    title: mag?.fromB ? `From its B magnitude (${OPENNGC}) and a B − V typical of its type (${FSI95}); not corrected for the Milky Way’s dust` : `V magnitude (${OPENNGC}) − distance modulus; not corrected for the Milky Way’s dust`,
  });
  rows.push({ l: 'Luminosity', v: sig(lumV, 2), u: 'L☉', title: 'V band, M_V☉ = 4.83' });
  if (g.vHelio !== null) rows.push({ l: 'Radial velocity', v: String(g.vHelio), u: 'km/s', title: `Heliocentric (${OPENNGC}): negative is towards us` });
  if (disc) rows.push({ l: 'Inclination', v: `${Math.round(inclination)}°`, title: `From its axis ratio ${sig(q, 2)}, for a disc a fifth as thick as it is wide (Hubble 1926)` });
  const methodText = db.methods ? cf4Methods(db.methods) : '';
  const distanceSource =
    db.basis === 'cluster'
      ? `the cluster’s distance (${db.ref.split(' (')[0]}): its own is not measured well enough to place it within the cluster`
      : db.basis === 'pair'
        ? `its partner NGC 4038’s (${CF4_REF}, as the cosmic web places it)`
        : db.basis === 'web'
          ? `${methodText ? `${methodText} in its group, ` : ''}its group’s distance (${CF4_REF}), as the cosmic web places it`
          : fromMei
            ? `surface brightness fluctuations (${MEI_2007})`
            : `${methodText} (${CF4_REF}), on the scale of ${MEI_2007}`;
  const info: DeepSkyInfo = {
    type: CLASS_TEXT[cls],
    distancePc: dMpc * 1e6,
    distanceLoPc: db.loMpc * 1e6,
    distanceHiPc: db.hiMpc * 1e6,
    distanceSource: `${distanceSource}${parent ? '; placed as its cluster is, where it is now' : ''}`,
    sizes: [{ label: 'Radius to 25 mag/arcsec² (R25)', pc: r25Kpc * 1000, title: `${sig(majArcmin, 3)}′ across on the sky (${OPENNGC})` }],
    rows,
    ...(image ? { image } : {}),
    refs: [`${OPENNGC} (position, type, size, brightness, velocity)`, `${db.ref} (distance)`],
  };
  const notes: string[] = [templateNote(template, disc, disc, !disc && g.pa === null)];
  if (disc) notes.push(`Its tilt (${Math.round(inclination)}° from face-on) is worked out from its shape on the sky, not measured from how its gas turns.`);
  if (db.basis === 'cluster') notes.push(`Its own distance is not measured well enough: it is placed at ${where}’s distance, in its own direction, so where it lies in depth within the cluster is not known.`);
  if (image) notes.push(PICTURE_NOTE);
  const radiusKm = (TEMPLATE_UNIT_R25.has(template) ? size.unitKpc : 2 * size.halfLightKpc) * KPC_KM;
  const record: BodyRecord = {
    id: g.id,
    name: g.name.replace(/'/g, '’'),
    aliases: [...new Set([...g.aliases, ...(g.name.includes("'") ? [g.name] : [])])],
    kind: 'galaxy',
    kindText: CLASS_TEXT[cls],
    parent,
    physical: { radiusKm, colour: bvColour(bv), luminous: { vmag: absMagV, atKm: 10 * PARSEC_KM, teffK: bvToTemperature(bv) } },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 4 * radiusKm, minKm: 0.02 * radiusKm },
    labelRank: g.set === 'famous' ? 13.3 : labelRankFor(absMagV) + 0.3,
    detector: false,
    orbitLine: false,
    deepSky: info,
    facts,
    factSources: sources.slice(0, facts.length),
    factSourceLabels: labels.slice(0, facts.length),
    positionNote: parent
      ? `Position: ${OPENNGC}, at ${db.basis === 'cluster' ? 'its cluster’s distance' : 'its measured distance'} (as the cluster is placed: divided by 1 + its redshift, where it is now); held fixed in its cluster, which gravity holds together: the cluster as a whole is carried away as the universe expands.`
      : `Position: ${OPENNGC}, at its group’s distance (${CF4_REF}), where the cosmic web places it; held in its group, which is carried away as the universe expands.`,
    modelNotes: notes,
    dataSource: `${OPENNGC}; ${db.ref}`,
    article: ARTICLE_GALAXIES,
    provider: parent && clusterKm ? fixedProvider(posKm, clusterKm, 'Measured place, relative to its cluster') : anchoredProvider(posKm, scale(g.anchorEclMpc, MPC_KM)),
  };
  const shape: GalaxyShape = {
    id: g.id,
    template,
    scaleKpc: size.unitKpc,
    axes: orientation.axes,
    normal: orientation.normal,
    lumV,
    halfLightKpc: size.halfLightKpc,
    inSkyMap: false,
    // A generic lenticular has no ring of dust (the lenticular template's ring is the Sombrero's): none is drawn.
    dust: template === 'lenticular' ? NO_DUST : dustFor(template, size.unitKpc),
  };
  const anchorKm = parent && clusterKm ? clusterKm : scale(g.anchorEclMpc, MPC_KM);
  return { record, shape, anchor: { id: record.id, anchorWorldKm: eclToWorld(anchorKm), home: false } };
}

/** Cosmicflows-4's distance methods (its method bits, cosmicWeb.ts METHOD) in words, the most precise first. */
const CF4_METHODS: [number, string][] = [
  [64, 'Cepheids'],
  [32, 'the tip of the red giant branch'],
  [1, 'type Ia supernovae'],
  [128, 'a water maser'],
  [8, 'surface brightness fluctuations'],
  [16, 'type II supernovae'],
  [4, 'the fundamental plane'],
  [2, 'the Tully–Fisher relation'],
];
const cf4Methods = (bits: number): string => {
  const w = CF4_METHODS.filter(([b]) => bits & b).map(([, t]) => t);
  return w.length <= 1 ? (w[0] ?? '') : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
};

// ─── The Local Group ─────────────────────────────────────────────────────────────────────

function localGroupRecord(ctx: CosmosContext, andromedaEclKm: Vec3, members: number): BodyRecord {
  const mw = ctx.milkyWayEclKm;
  const at = add(mw, scale([andromedaEclKm[0] - mw[0], andromedaEclKm[1] - mw[1], andromedaEclKm[2] - mw[2]], LOCAL_GROUP_BARYCENTRE_SHARE));
  const distPc = norm(at) / PARSEC_KM;
  return {
    id: LOCAL_GROUP_ID,
    name: 'Local Group',
    aliases: ['our group of galaxies', 'Local Group of galaxies'],
    kind: 'cluster',
    kindText: 'Group of galaxies',
    parent: null,
    physical: { radiusKm: LOCAL_GROUP_RADIUS_MPC * MPC_KM, colour: '#e8dcc8' },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 3 * MPC_KM, minKm: 0.05 * MPC_KM },
    labelRank: 13,
    detector: false,
    orbitLine: false,
    deepSky: {
      type: 'Group of galaxies',
      distancePc: distPc,
      distanceSource: `its barycentre, 0.55 of the way from the Milky Way to Andromeda (${KARACHENTSEV_2009})`,
      sizes: [{ label: 'Zero-velocity surface, radius', pc: LOCAL_GROUP_RADIUS_MPC * 1e6, title: `0.96 ± 0.03 Mpc: inside it gravity has stopped the expansion (${KARACHENTSEV_2009})` }],
      rows: [{ l: 'Galaxies drawn inside it', v: String(members), title: 'The Milky Way, Andromeda and their companions in the Local Volume Database' }],
      refs: [KARACHENTSEV_2009, LVDB],
    },
    facts: [
      `The group of galaxies we live in: the Milky Way, Andromeda, Triangulum and ${members - 3} smaller galaxies known, within about a million parsecs (3 million light-years).`,
      'Gravity holds it together: inside its zero-velocity surface, 0.96 million parsecs from its centre, the expansion of the universe has stopped, and its galaxies no longer move apart.',
    ],
    factSources: [doiUrl(LVDB_DOI), doiUrl('10.1111/j.1365-2966.2008.14300.x')],
    factSourceLabels: ['Pace 2025', 'Karachentsev et al. 2009'],
    positionNote: `Position: its barycentre, 0.55 ± 0.05 of the way from the Milky Way’s centre to Andromeda’s (${KARACHENTSEV_2009}).`,
    modelNotes: [
      'The group is its galaxies: its zero-velocity surface is where the expansion wins, a sphere in the model; nothing is drawn for the group itself.',
      'In the model the whole group is one bound place: its galaxies keep their places at every date, while the galaxies beyond it recede as the universe expands. Their orbits (and a possible merger of the Milky Way and Andromeda) are not followed.',
    ],
    dataSource: KARACHENTSEV_2009,
    article: ARTICLE_GALAXIES,
    provider: fixedProvider(at, null, 'Barycentre of the Milky Way and Andromeda'),
  };
}

// ─── Everything ──────────────────────────────────────────────────────────────────────────

export interface CosmosBuild {
  records: BodyRecord[];
  shapes: GalaxyShape[];
  /** Every body's anchor in the expanding universe (the Local Group's members: home). */
  anchors: ExpansionAnchor[];
}

/**
 * Every galaxy as a body: the rows of the local file (all of them), the named objects, and the more galaxies (famous ones
 * and the clusters' brightest), with the pictures of those that have one (sim/cosmos/pictures.ts) on their cards.
 */
export function cosmosRecords(local: LocalGalaxiesDoc, named: NamedDoc, ctx: CosmosContext, more: MoreGalaxiesDoc | null = null, images: ReadonlyMap<string, DeepSkyImage> = new Map()): CosmosBuild {
  const byId = new Map(named.objects.map((o) => [o.id, o]));
  const m31 = local.galaxies.find((g) => g.id === 'andromeda');
  if (!m31) throw new Error('local-galaxies: no Andromeda');
  const andromedaEclKm = scale(m31.positionEclKpc, KPC_KM);
  const built = local.galaxies.map((g) => localGalaxy(g, local, byId, ctx, andromedaEclKm));
  const localIds = new Set(local.galaxies.map((g) => g.id));
  const virgo = byId.get('virgo-cluster');
  const virgoEclKm = virgo ? scale(virgo.positionEclMpc, MPC_KM) : null;
  // Clusters first, so a galaxy in one (M87) can name it as parent.
  const others = named.objects.filter((o) => !localIds.has(o.id)).sort((a, b) => Number(b.kind === 'cluster') - Number(a.kind === 'cluster'));
  for (const o of others) built.push(namedObject(o, { virgoEclKm }));
  const coma = byId.get('coma-cluster');
  const clusters = { virgo: virgoEclKm, coma: coma ? scale(coma.positionEclMpc, MPC_KM) : null };
  const ids = new Set(built.map((b) => b.record.id));
  for (const g of more?.galaxies ?? []) if (!ids.has(g.id)) built.push(moreGalaxy(g, clusters, images.get(g.id)));
  // The local and named galaxies with a picture: on their cards, with what it is.
  for (const b of built) {
    const image = images.get(b.record.id);
    if (!image || !b.record.deepSky || b.record.deepSky.image) continue;
    b.record.deepSky = { ...b.record.deepSky, image };
    b.record.modelNotes = [...(b.record.modelNotes ?? []), PICTURE_NOTE];
  }
  const members = local.galaxies.filter((g) => g.subgroup === 'MW' || g.subgroup === 'M31' || g.subgroup === 'LG').length + 1;
  const records = [localGroupRecord(ctx, andromedaEclKm, members), ...built.map((b) => b.record)];
  return {
    records,
    shapes: built.flatMap((b) => (b.shape ? [b.shape] : [])),
    anchors: [{ id: LOCAL_GROUP_ID, anchorWorldKm: [0, 0, 0], home: true }, ...built.map((b) => b.anchor)],
  };
}

/** A body's heliocentric ecliptic place in km, given in Mpc (named.json's positions). */
export const mpcToEclKm = (v: Readonly<Vec3>): Vec3 => scale(v, MPC_KM);

/** An ICRS direction as world axes (for the tests and the renderer). */
export const raDecWorld = (raDeg: number, decDeg: number): Vec3 => eclToWorld(apply(ICRS_TO_ECL, skyBasis(raDeg, decDeg).r));
