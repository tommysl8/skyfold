/**
 * The Milky Way's bodies: the Galaxy itself (the model), Sagittarius A* and the four stars whose
 * orbits round it are openly published, the 45 nebulae with pictures, and the famous star clusters.
 * Pure functions of the data files (the tests call them with the files read from disk).
 */
import type { AstroTime } from 'astronomy-engine';
import { AU_KM, C_KM_S, GM_SUN_KM3_S2, JULIAN_YEAR_S, LIGHT_YEAR_KM, PARSEC_KM } from '../../physics/constants';
import { bvToTemperature } from '../../physics/blackbody';
import { sig } from '../../lib/sci';
import { ALWAYS } from '../bodies/providers/simple';
import type { Availability, BodyRecord, DeepSkyInfo, PositionProvider, StarInfo, Vec3Like } from '../bodies/types';
import { luminosityFromAbsMag, radiusFromLuminosity } from '../stars/photometry';
import { equatorialToEcliptic, unitFromRaDec } from '../stars/frames';
import { apply, ECL_TO_GAL, transpose, type Vec3 } from './frames';
import {
  clusterAliases,
  clusterDisplayName,
  clusterId,
  GLOBULAR_BV,
  isFamousCluster,
  type Cluster,
  type GlobularCluster,
  type OpenCluster,
} from './clusters';
import { loadOrbits, skyStateInto, skyToEclipticMatrix, type Orbit, type SStarsJson } from './sstars';
import { HOVER_FLOOR_RADIUS_RS, SGR_A_BLACK_HOLE, sgrABlackHole } from '../blackholes/records';
import { fieldFact } from '../blackholes/holeField';

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const YEAR_MS = JULIAN_YEAR_S * 1000;
const GAL_TO_ECL = transpose(ECL_TO_GAL);
const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
const doiUrl = (doi: string) => `https://doi.org/${doi}`;

/** Deep-sky objects stay where they are: good to ±100,000 years, illustrative beyond (they move a few parsecs in that time). */
const DEEP_SKY_YEARS = 100_000;

const galEcl = (x: number, y: number, z: number): Vec3 => apply(GAL_TO_ECL, [x, y, z]);

/** A body held at a fixed place, given in heliocentric galactic coordinates (pc), relative to its centre. */
export function fixedGalacticProvider(galPc: Readonly<Vec3>, label: string, goodYears = DEEP_SKY_YEARS): PositionProvider {
  const e = galEcl(galPc[0] * PARSEC_KM, galPc[1] * PARSEC_KM, galPc[2] * PARSEC_KM);
  return {
    label,
    static: true,
    availability: (ms) => (Math.abs(ms - J2000_MS) <= goodYears * YEAR_MS ? ALWAYS.approximate : ALWAYS.illustrative),
    positionAt(_time: AstroTime, pos: Vec3Like, vel?: Vec3Like | null) {
      pos.x = e[0];
      pos.y = e[1];
      pos.z = e[2];
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
}

// ─── Sagittarius A* ──────────────────────────────────────────────────────────────────────

export const SGR_A_ID = 'sgr-a-star';
/** Sgr A*'s field, as the EHT's polarisation shows it (its card's last line). */
const SGR_A_FIELD = fieldFact(SGR_A_ID)!;
export const MILKY_WAY_ID = 'milky-way';

/** Sgr A*: GRAVITY Collaboration (2022) mass and distance, Reid & Brunthaler (2004) position. */
export interface SgrA {
  massMsun: number;
  massStatMsun: number;
  massSysMsun: number;
  distancePc: number;
  distanceStatPc: number;
  distanceSysPc: number;
  raDeg: number;
  decDeg: number;
}

export function sgrAFrom(json: SStarsJson & { blackHole: { mass: { value: number; unc?: number; uncSys?: number }; distance: { value: number; unc?: number; uncSys?: number } } }): SgrA {
  const bh = json.blackHole;
  return {
    massMsun: bh.mass.value,
    massStatMsun: bh.mass.unc ?? 0,
    massSysMsun: bh.mass.uncSys ?? 0,
    distancePc: bh.distance.value,
    distanceStatPc: bh.distance.unc ?? 0,
    distanceSysPc: bh.distance.uncSys ?? 0,
    raDeg: bh.icrs.raDeg,
    decDeg: bh.icrs.decDeg,
  };
}

/** GM/c² of a mass, km. */
export const gravitationalRadiusKm = (massMsun: number): number => (massMsun * GM_SUN_KM3_S2) / (C_KM_S * C_KM_S);
/** Radius of a non-spinning black hole's shadow as seen from afar, √27 GM/c², km. */
export const shadowRadiusKm = (massMsun: number): number => Math.sqrt(27) * gravitationalRadiusKm(massMsun);
/** Its event horizon (Schwarzschild radius), 2GM/c², km. */
export const schwarzschildRadiusKm = (massMsun: number): number => 2 * gravitationalRadiusKm(massMsun);

/** Sgr A*'s place, J2000 ecliptic km from the Sun. */
export function sgrAPositionEcl(s: SgrA): Vec3 {
  const e = equatorialToEcliptic(unitFromRaDec(s.raDeg, s.decDeg));
  const d = s.distancePc * PARSEC_KM;
  return [e[0] * d, e[1] * d, e[2] * d];
}

const GRAVITY_2022 = 'GRAVITY Collaboration 2022, A&A 657, L12';
const GRAVITY_2022_DOI = '10.1051/0004-6361/202142465';

export function sgrARecord(s: SgrA): BodyRecord {
  const rs = schwarzschildRadiusKm(s.massMsun);
  const shadow = shadowRadiusKm(s.massMsun);
  const at = sgrAPositionEcl(s);
  const shadowMicroArcsec = ((2 * shadow) / (s.distancePc * PARSEC_KM)) * (180 / Math.PI) * 3600e6;
  const provider: PositionProvider = {
    label: 'Radio position (Reid & Brunthaler 2004) at the distance from the orbits of the S-stars (GRAVITY 2022), held fixed',
    static: true,
    availability: () => ALWAYS.approximate,
    positionAt(_t, pos, vel) {
      pos.x = at[0];
      pos.y = at[1];
      pos.z = at[2];
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
  const info: DeepSkyInfo = {
    type: 'Supermassive black hole at the centre of the Milky Way',
    distancePc: s.distancePc,
    distanceLoPc: s.distancePc - Math.hypot(s.distanceStatPc, s.distanceSysPc),
    distanceHiPc: s.distancePc + Math.hypot(s.distanceStatPc, s.distanceSysPc),
    distanceSource: `the orbits of four stars round it (${GRAVITY_2022}): ±${s.distanceStatPc} pc statistical, ±${s.distanceSysPc} pc systematic`,
    rows: [
      { l: 'Mass', v: `${sig(s.massMsun / 1e6, 4)} × 10⁶`, u: 'M☉', title: `±${sig(s.massStatMsun / 1e6, 2)} × 10⁶ statistical, ±${sig(s.massSysMsun / 1e6, 2)} × 10⁶ systematic (${GRAVITY_2022}). ${SGR_A_BLACK_HOLE.massNote ?? ''}`.trim() },
      { l: 'Event horizon radius 2GM/c²', v: sig(rs / AU_KM, 3), u: 'au', title: `${sig(rs, 3)} km, for a black hole that does not spin` },
      { l: 'Shadow radius √27 GM/c²', v: sig(shadow / AU_KM, 3), u: 'au', title: `${sig(shadow, 3)} km: the shadow as seen from far away (the photon ring's apparent radius); nearer, the lens makes it larger` },
      { l: 'Shadow from Earth', v: sig(shadowMicroArcsec, 3), u: 'µas', title: 'Predicted diameter. The Event Horizon Telescope measured a ring of 51.8 ± 2.3 µas (EHT Collaboration 2022)' },
    ],
    refs: [`${GRAVITY_2022} (mass, distance)`, 'Reid & Brunthaler 2004, ApJ 616, 872 (position)', 'Event Horizon Telescope Collaboration 2022, ApJL 930, L12 (ring)'],
  };
  return {
    id: SGR_A_ID,
    name: 'Sagittarius A*',
    shortName: 'Sgr A*',
    aliases: ['Sgr A*', 'Sgr A star', 'Sagittarius A star', 'Galactic Centre black hole', 'Galactic Center', 'black hole'],
    kind: 'black-hole',
    kindText: 'Supermassive black hole',
    parent: null,
    physical: {
      // Its size is its horizon; what it looks like (the shadow, bigger than the horizon and bigger still
      // close to) is the lens's to draw.
      radiusKm: rs,
      gmKm3S2: s.massMsun * GM_SUN_KM3_S2,
      colour: '#000000',
    },
    // The lens draws it: its shadow is the light the lens does not bring (render/lens/).
    visual: { renderer: 'lens' },
    // Framed from 4,000 au; the camera may hover down to r_s(1 + 10⁻⁶), 12.7 km above the horizon, which only
    // the controller's hole-relative float64 camera can hold (a heliocentric step is 32 km there).
    framing: { distanceKm: 4000 * AU_KM, minKm: rs * HOVER_FLOOR_RADIUS_RS },
    labelRank: 14,
    detector: false,
    orbitLine: false,
    deepSky: info,
    facts: [
      `A black hole of ${sig(s.massMsun / 1e6, 3)} million solar masses, weighed by the orbits of the stars that swing round it; S2 goes round every 16 years.`,
      `Its shadow, the dark patch its gravity carves out of the light behind it, is ${sig((2 * shadow) / AU_KM, 2)} au across, smaller than Mercury’s orbit. From Earth that is ${Math.round(shadowMicroArcsec)} millionths of an arcsecond; the Event Horizon Telescope’s picture (observed in 2017, published in 2022) shows a glowing ring 51.8 ± 2.3 of them across.`,
      'Dust between us and the centre dims its light about a trillion times in visible light (30 magnitudes) but only about ten times in the near-infrared, where astronomers follow its stars.',
      SGR_A_FIELD.text,
    ],
    factSources: [doiUrl(GRAVITY_2022_DOI), doiUrl('10.3847/2041-8213/ac6674'), doiUrl('10.1103/RevModPhys.82.3121'), SGR_A_FIELD.source],
    factSourceLabels: ['GRAVITY 2022', 'EHT Collaboration 2022', 'Genzel, Eisenhauer & Gillessen 2010', SGR_A_FIELD.label],
    positionNote: 'Position: radio position (Reid & Brunthaler 2004) at the GRAVITY (2022) distance, held fixed; its apparent drift of 6.4 milliarcseconds a year, a reflection of the Sun’s own orbit, is left out.',
    // At most three one-line notes reach the card; the rest are the data sheet's (blackHole.sheetNotes).
    modelNotes: SGR_A_BLACK_HOLE.modelNotes.slice(0, 3),
    dataSource: GRAVITY_2022,
    // No article of its own: every black hole's Read button follows its kind (content/bodyArticles.ts).
    blackHole: sgrABlackHole(s.massMsun, s.massStatMsun, s.massSysMsun),
    provider,
  };
}

// ─── The stars round Sgr A* ──────────────────────────────────────────────────────────────

/** K-band extinction towards the central parsec (Fritz et al. 2011, ApJ 737, 73). */
export const A_K_CENTRE = 2.42;

/** Intrinsic V − K colour taken for each class of S-star (typical of B dwarfs and K giants). */
const V_MINUS_K = { early: -0.8, late: 3.0 } as const;
/** Temperature taken for each class, K (for the colour of its light; not measured). */
const CLASS_TEFF = { early: 22_000, late: 4_200 } as const;

export interface SStarJsonEntry {
  id: string;
  altNames?: string[];
  mK?: number;
  spectralType?: string;
  note?: string;
}

/** Whether a star is of an early (hot) or late (cool) type, from sstars.json's spectral type. */
export function sStarClass(spectralType: string | undefined): 'early' | 'late' {
  return spectralType && /late/i.test(spectralType) ? 'late' : 'early';
}

/**
 * Absolute V magnitude estimated from the K-band magnitude: M_K = K − 5 log10(d / 10 pc) − A_K, and
 * V − K of the star's class.
 */
export function sStarAbsMagV(mK: number, distancePc: number, cls: 'early' | 'late'): number {
  return mK - 5 * Math.log10(distancePc / 10) - A_K_CENTRE + V_MINUS_K[cls];
}

/** Observer epochs (decimal years) within this far of the orbits' reference epochs count as measured. */
const S_STAR_OBSERVED_YEARS = 40;
const S_STAR_EPOCH = 2010;

/**
 * An S-star on its orbit about Sgr A*, relative to it, in the app's convention: a body is placed
 * where it is at the date shown, so the orbit (whose epochs are when its light reaches us) is
 * evaluated a light-time D/c later, with D Sgr A*'s distance (the Roemer delay across the orbit,
 * up to 8 days for S2, is left out, as in the fit). General relativity's precession of the
 * pericentre is included (f_SP = 1, which GRAVITY measured as 0.997 ± 0.144).
 */
export function sStarProvider(o: Orbit, s: SgrA): PositionProvider {
  const m = skyToEclipticMatrix(s.raDeg, s.decDeg);
  const lightYears = (s.distancePc * PARSEC_KM) / LIGHT_YEAR_KM;
  const p = new Float64Array(3);
  const v = new Float64Array(3);
  const epochAt = (tt: number) => 2000 + tt / 365.25 + lightYears;
  return {
    label: `${GRAVITY_2022} orbit with general relativity's precession, carried a light-time (${Math.round(lightYears).toLocaleString('en-GB')} years) on`,
    availability(ms: number): Availability {
      const tObs = 2000 + (ms - J2000_MS) / YEAR_MS + lightYears;
      return Math.abs(tObs - S_STAR_EPOCH) <= S_STAR_OBSERVED_YEARS ? ALWAYS.approximate : ALWAYS.illustrative;
    },
    positionAt(time, pos, vel) {
      skyStateInto(o, epochAt(time.tt), 1, p, v);
      pos.x = (m[0] * p[0] + m[1] * p[1] + m[2] * p[2]) * AU_KM;
      pos.y = (m[3] * p[0] + m[4] * p[1] + m[5] * p[2]) * AU_KM;
      pos.z = (m[6] * p[0] + m[7] * p[1] + m[8] * p[2]) * AU_KM;
      if (vel) {
        vel.x = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
        vel.y = m[3] * v[0] + m[4] * v[1] + m[5] * v[2];
        vel.z = m[6] * v[0] + m[7] * v[1] + m[8] * v[2];
      }
    },
  };
}

export function sStarRecords(json: SStarsJson): BodyRecord[] {
  const s = sgrAFrom(json as Parameters<typeof sgrAFrom>[0]);
  const orbits = loadOrbits(json);
  const entries = (json as unknown as { stars: SStarJsonEntry[] }).stars;
  return orbits.map((o, i) => {
    const e = entries[i];
    const cls = sStarClass(e.spectralType);
    const known = e.spectralType && !/unknown/i.test(e.spectralType);
    const absMagV = sStarAbsMagV(e.mK ?? 17, s.distancePc, cls);
    const teffK = CLASS_TEFF[cls];
    const lum = luminosityFromAbsMag(absMagV, teffK);
    const radiusRsun = radiusFromLuminosity(lum, teffK);
    const id = o.id.toLowerCase();
    const periodYr = o.P;
    const periAu = o.aAu * (1 - o.e);
    const star: StarInfo = {
      spectralType: known ? (/^(early|late)$/i.test(e.spectralType!) ? `${e.spectralType}-type` : e.spectralType) : undefined,
      teffK,
      teffSource: 'unknown',
      luminosityLsun: lum,
      luminositySource: 'estimated',
      radiusRsun,
      radiusSource: 'estimated',
      absMagV,
      vFromSun: absMagV + 5 * Math.log10(s.distancePc / 10),
      distancePc: s.distancePc,
      distanceSource: `the distance of Sgr A* (${GRAVITY_2022})`,
      distancePrecision: `±${s.distanceStatPc} pc statistical, ±${s.distanceSysPc} pc systematic`,
      designations: [o.id, ...(e.altNames ?? [])],
      constellation: 'Sagittarius',
      refs: [`${GRAVITY_2022} (orbit, K magnitude)`, `Fritz et al. 2011, ApJ 737, 73 (A_K = ${A_K_CENTRE})`],
    };
    const facts = [
      `Goes round Sagittarius A* every ${sig(periodYr, 4)} years on an orbit of eccentricity ${o.e}, coming within ${Math.round(periAu).toLocaleString('en-GB')} au of it.`,
    ];
    if (e.note) facts.push(e.note.replace(/([^.])$/, '$1.'));
    return {
      id,
      name: o.id,
      aliases: [...(e.altNames ?? []), `${o.id} star`],
      kind: 'star',
      kindText: 'Star orbiting Sgr A*',
      parent: SGR_A_ID,
      physical: {
        radiusKm: radiusFromLuminosity(lum, teffK) * 695_700,
        colour: '#cfd8ff',
        semiMajorAxisKm: o.aAu * AU_KM,
        orbitalPeriodD: periodYr * 365.25,
        luminous: { vmag: absMagV, atKm: 10 * PARSEC_KM, teffK },
      },
      star,
      orbitLine: {},
      framing: { distanceKm: 3 * o.aAu * (1 + o.e) * AU_KM },
      labelRank: 13,
      detector: false,
      facts,
      factSources: [doiUrl(GRAVITY_2022_DOI), doiUrl(GRAVITY_2022_DOI)].slice(0, facts.length),
      factSourceLabels: ['GRAVITY 2022', 'GRAVITY 2022'].slice(0, facts.length),
      positionNote:
        'Position: the GRAVITY (2022) orbit with general relativity’s precession of the pericentre. Its light takes 27,000 years to reach us, so where it is now is that orbit carried 27,000 years on: its path is measured, its place along it is not.',
      modelNotes: [
        `Brightness estimated from its K-band magnitude (${e.mK}), ${A_K_CENTRE} magnitudes of dust in the K band and a typical colour for a ${cls === 'early' ? 'hot young' : 'cool'} star; its temperature is not measured.`,
        'Four S-stars are shown: other published orbits exist (Gillessen et al. 2017 list 40), but their tables are not licensed for reuse.',
      ],
      dataSource: GRAVITY_2022,
      article: 'our-galaxy',
      provider: sStarProvider(o, s),
    } satisfies BodyRecord;
  });
}

// ─── The Milky Way ───────────────────────────────────────────────────────────────────────

/** The camera distance of the view from outside: 100,000 light-years. */
/** A number of Suns in words, to two figures: "510,000", "1.2 million". */
function sunsWords(l: number): string {
  if (l >= 1e9) return `${sig(l / 1e9, 2)} billion`;
  if (l >= 1e6) return `${sig(l / 1e6, 2)} million`;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(l)) - 1);
  return (Math.round(l / step) * step).toLocaleString('en-GB');
}

export const OUTSIDE_VIEW_KM = 100_000 * LIGHT_YEAR_KM;

/** The wording the task and the Guide use for what the Galaxy model is. */
export const MILKY_WAY_MODEL_LABEL =
  'Model built from published measurements (Reid et al. 2019 arms, Wegg et al. bar, Drimmel and Spergel dust). The points are not real stars, and the far side of the Galaxy has never been mapped directly: its arms are extrapolated beyond the parallax data.';

export function milkyWayRecord(s: SgrA): BodyRecord {
  const at = sgrAPositionEcl(s);
  return {
    id: MILKY_WAY_ID,
    name: 'Milky Way',
    aliases: ['the Galaxy', 'our galaxy', 'Milky Way Galaxy', 'home galaxy'],
    kind: 'galaxy',
    kindText: 'Our galaxy: a barred spiral',
    parent: null,
    physical: {
      // Its disc has no edge: 15 kpc holds nearly all of its light.
      radiusKm: 15_000 * PARSEC_KM,
      colour: '#e8dcc8',
    },
    visual: { renderer: 'layer' },
    framing: { distanceKm: OUTSIDE_VIEW_KM, minKm: 500 * PARSEC_KM },
    labelRank: 14,
    detector: false,
    orbitLine: false,
    deepSky: {
      type: 'Barred spiral galaxy (model)',
      distancePc: s.distancePc,
      distanceSource: `its centre, Sgr A* (${GRAVITY_2022})`,
      sizes: [
        { label: 'Disc scale length (thin disc)', pc: 2600, title: 'Bland-Hawthorn & Gerhard 2016: 2.6 ± 0.5 kpc' },
        { label: 'Bar half-length', pc: 5000, title: 'Wegg, Gerhard & Portail 2015: 5.0 ± 0.2 kpc' },
        { label: 'Sun above the midplane', pc: 20.8, title: 'Bennett & Bovy 2019: 20.8 ± 0.3 pc' },
      ],
      rows: [
        { l: 'Absolute magnitude M_V', v: '−21.37', title: 'Licquia, Newman & Brinchmann 2015, via Bland-Hawthorn & Gerhard 2016' },
        { l: 'Luminosity', v: '3.0 × 10¹⁰', u: 'L☉', title: 'V band, from M_V with M_V☉ = 4.83' },
        { l: 'Central black hole', v: `${sig(s.massMsun / 1e6, 4)} × 10⁶`, u: 'M☉', title: GRAVITY_2022 },
        {
          l: 'Mass within 200 kpc',
          v: '1.3 × 10¹²',
          u: 'M☉',
          title: 'McMillan 2017, MNRAS 465, 76: about 95 % of it dark matter. Other estimates range from about 0.2 to 2 × 10¹² (Ou et al. 2024; Watkins et al. 2019)',
        },
      ],
      refs: [
        'Reid et al. 2019, ApJ 885, 131 (spiral arms)',
        'Wegg & Gerhard 2013, MNRAS 435, 1874; Wegg, Gerhard & Portail 2015, MNRAS 450, 4050 (bulge and bar)',
        'Drimmel & Spergel 2001, ApJ 556, 181 (dust)',
        'Bland-Hawthorn & Gerhard 2016, ARA&A 54, 529 (discs, halo, light)',
        'Chen et al. 2019, Nature Astronomy 3, 320 (warp)',
        'McMillan 2017, MNRAS 465, 76 (mass model and dark halo)',
        `${GRAVITY_2022}; Bennett & Bovy 2019, MNRAS 482, 1417 (the Sun's place)`,
      ],
    },
    facts: [
      'The Sun lies 8.28 kiloparsecs (27,000 light-years) from the centre and 21 parsecs above the midplane of the disc.',
      'A bar of old stars about 10 kpc long crosses the centre, and four major spiral arms wind outwards from it, traced by the parallaxes of about 200 masers in star-forming regions.',
      'All its stars together shine with the visible light of about 30 billion Suns.',
      'Most of its mass is dark matter: about 95 % of the 1.3 × 10¹² Suns’ worth within 200 kpc, in a fitted mass model. Stars far out orbit too fast for the stars and gas alone to hold them; how heavy the dark halo is remains uncertain by a factor of several.',
    ],
    factSources: [doiUrl(GRAVITY_2022_DOI), doiUrl('10.3847/1538-4357/ab4a11'), doiUrl('10.1146/annurev-astro-081915-023441'), doiUrl('10.1093/mnras/stw2759')],
    factSourceLabels: ['GRAVITY 2022; Bennett & Bovy 2019', 'Wegg et al. 2015; Reid et al. 2019', 'Bland-Hawthorn & Gerhard 2016', 'McMillan 2017'],
    positionNote: 'Its centre is Sgr A*.',
    modelNotes: [
      MILKY_WAY_MODEL_LABEL,
      'The dust dims each point by the model’s extinction along its line of sight (Drimmel & Spergel 2001). Near the camera the discs and the young stars of the arms are drawn as a smooth glow worked out from the model’s laws, and the points take over a few kiloparsecs out.',
      'Near the Sun the sky is the real one (NASA SVS, from Gaia, with the light of the star catalogue’s stars too faint to draw as points): the model takes over a few hundred parsecs out. Its dust is smooth, so it has none of the gaps through which the real sky shows the bright star clouds of Sagittarius and Scutum: that way the model is about a magnitude fainter.',
      'View › Dark matter draws its dark halo (McMillan’s 2017 model, an NFW halo cut off at 224 kpc) as a faint blue fog of its density summed along each line of sight: where the mass is, not light. Dark matter gives out none.',
    ],
    dataSource: 'Parametric model of the Galaxy (src/sim/galaxy/model.json); its mass model, McMillan 2017 (src/sim/galaxy/darkMatter.ts)',
    article: 'our-galaxy',
    provider: {
      label: 'Centred on Sgr A*',
      static: true,
      availability: () => ALWAYS.approximate,
      positionAt(_t, pos, vel) {
        pos.x = at[0];
        pos.y = at[1];
        pos.z = at[2];
        if (vel) vel.x = vel.y = vel.z = 0;
      },
    },
  };
}

// ─── Nebulae ─────────────────────────────────────────────────────────────────────────────

export interface NebulaJson {
  id: string;
  name: string;
  otherNames?: string[];
  kind: string;
  parent: string | null;
  position: { raDeg: number; decDeg: number; lDeg: number; bDeg: number; source: string };
  distance: { pc: number; minusPc: number; plusPc: number; method: string; ref: string; doi?: string };
  helioGalacticPc: [number, number, number];
  catalogueSizeArcmin?: number | null;
  catalogueSizePc?: number | null;
  billboard: {
    image: string;
    centerRaDeg: number;
    centerDecDeg: number;
    widthArcmin: number;
    heightArcmin: number;
    northAngleDeg: number;
    widthPc: number;
    heightPc: number;
    helioGalacticPc: [number, number, number];
  };
  imageSource: { archive: string; id: string; title?: string; page: string; band: string; cropped?: boolean };
  credit: string;
  licence: string;
  modificationNote: string;
  blurb: string;
}

export interface NebulaeFile {
  schema: string;
  objects: NebulaJson[];
}

/** The galaxy each nebula outside the Milky Way lies in. */
const HOST_GALAXY: Record<string, string> = {
  'tarantula-nebula': 'Large Magellanic Cloud',
  'sn-1987a': 'Large Magellanic Cloud',
  'ngc-346': 'Small Magellanic Cloud',
};

/** What each kind of nebula is, in words. */
const NEBULA_TYPES: Record<string, string> = {
  'HII region': 'Star-forming region (glowing hydrogen)',
  'dark nebula': 'Dark cloud of dust and gas',
  'reflection nebula': 'Reflection nebula (dust lit by stars)',
  'planetary nebula': 'Planetary nebula (a dying star’s shed layers)',
  'pre-planetary nebula': 'Pre-planetary nebula',
  'supernova remnant': 'Supernova remnant',
  'Wolf-Rayet nebula': 'Shell blown by a Wolf–Rayet star',
  'LBV nebula': 'Shell thrown off by a massive star',
  'wind-blown bubble': 'Bubble blown by a massive star’s wind',
};

/** Kinds about how stars live and die: their card's Read opens the article on what stars are made of. */
const STAR_LIVES = new Set(['planetary nebula', 'pre-planetary nebula', 'supernova remnant', 'Wolf-Rayet nebula', 'LBV nebula']);

export const nebulaArticle = (n: Pick<NebulaJson, 'kind'>): string => (STAR_LIVES.has(n.kind) ? 'what-stars-are-made-of' : 'our-galaxy');

/** A short name for a citation ("Kounkel et al. 2017"), from the file's reference. */
function shortRef(ref: string): string {
  const m = ref.match(/^([^,(]+?)(?: et al\.)?(?:,| )[^0-9]*?(\d{4})/);
  if (!m) return ref.split(',')[0];
  const who = m[1].replace(/\s+[A-Z]\.(?:[A-Z]\.)*$/, '').trim();
  return `${who}${/ et al\./.test(ref) ? ' et al.' : ''} ${m[2]}`;
}

const ARCHIVE_NAMES: Record<string, string> = { ESO: 'ESO', 'ESA/Hubble': 'ESA/Hubble', 'ESA/Webb': 'ESA/Webb', 'NSF NOIRLab': 'NSF NOIRLab' };

/** A nebula as a body; one inside another (the Pillars of Creation in the Eagle) is placed relative to it. */
export function nebulaRecord(n: NebulaJson, parentJson?: NebulaJson): BodyRecord {
  const b = n.billboard;
  const parent = n.parent ?? null;
  const d = n.distance;
  const host = HOST_GALAXY[n.id];
  const sizePc = n.catalogueSizePc ?? 0.6 * Math.min(b.widthPc, b.heightPc);
  const info: DeepSkyInfo = {
    type: NEBULA_TYPES[n.kind] ?? n.kind,
    distancePc: d.pc,
    distanceLoPc: d.pc - d.minusPc,
    distanceHiPc: d.pc + d.plusPc,
    distanceSource: `${d.method} (${shortRef(d.ref)})`,
    sizes: [
      ...(n.catalogueSizePc ? [{ label: 'Size in the catalogues', pc: n.catalogueSizePc, title: `${n.catalogueSizeArcmin}′ across at its distance` }] : []),
      { label: 'Picture, width', pc: b.widthPc, title: `${sig(b.widthArcmin, 3)}′ of sky at its distance` },
      { label: 'Picture, height', pc: b.heightPc, title: `${sig(b.heightArcmin, 3)}′ of sky at its distance` },
    ],
    image: {
      file: b.image,
      credit: n.credit,
      // The file's note points to its own processing field; on screen it ends at the changes.
      modificationNote: n.modificationNote.replace(/\s*\(see imageProcessing\)/, ''),
      page: n.imageSource.page,
      source: `${ARCHIVE_NAMES[n.imageSource.archive] ?? n.imageSource.archive} ${n.imageSource.id}`,
      licence: n.licence,
      licenceUrl: CC_BY,
      band: n.imageSource.band,
    },
    hostGalaxy: host,
    refs: [`${d.ref}${d.doi ? `, doi:${d.doi}` : ''} (distance)`, `${n.position.source} (position)`],
  };
  const p = parentJson?.helioGalacticPc;
  const place: Vec3 = p ? [n.helioGalacticPc[0] - p[0], n.helioGalacticPc[1] - p[1], n.helioGalacticPc[2] - p[2]] : n.helioGalacticPc;
  return {
    id: n.id,
    name: n.name,
    // "Carina" is the nebula people search for, not the dwarf galaxy Carina (an exact alias outranks a prefix).
    aliases: [...(n.otherNames ?? []), ...(n.id === 'carina-nebula' ? ['Carina'] : [])],
    kind: 'nebula',
    kindText: info.type.replace(/ \(.*\)$/, ''),
    parent,
    physical: { radiusKm: (sizePc / 2) * PARSEC_KM, colour: '#c8a2c8' },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 1.25 * Math.max(b.widthPc, b.heightPc) * PARSEC_KM },
    detector: false,
    orbitLine: false,
    deepSky: info,
    facts: [n.blurb],
    factSources: d.doi ? [doiUrl(d.doi)] : [],
    factSourceLabels: d.doi ? [shortRef(d.ref)] : [],
    positionNote: `Position: ${n.position.source}, at ${Math.round(d.pc).toLocaleString('en-GB')} pc (${d.method}; ${shortRef(d.ref)}), held fixed.`,
    modelNotes: [
      `The picture (${n.imageSource.band === 'visible' ? 'visible light' : 'near-infrared light'}) is how the nebula looks from Earth. It is a cloud in three dimensions, but only this view of it exists, so from any other direction it is drawn as a flat card facing the Sun: seen edge-on it fades away, and from the far side it shows the same picture mirrored, as a thin glowing cloud would look from behind (its dark dust would not).`,
      'The picture’s brightness is set for display, like a long-exposure photograph: to the eye a nebula is fainter and less colourful.',
    ],
    dataSource: `${n.position.source}; distance: ${shortRef(d.ref)}; picture: ${n.credit}`,
    article: nebulaArticle(n),
    provider: fixedGalacticProvider(place, 'SIMBAD position at the adopted distance'),
  };
}

/** The nebulae as bodies (one inside another is placed relative to it). */
export function nebulaRecords(file: NebulaeFile): BodyRecord[] {
  const byId = new Map(file.objects.map((o) => [o.id, o]));
  return file.objects.map((n) => nebulaRecord(n, n.parent ? byId.get(n.parent) : undefined));
}

// ─── Star clusters ───────────────────────────────────────────────────────────────────────

const HR24 = 'Hunt & Reffert 2024, A&A 686, A42';
const HR24_DOI = '10.1051/0004-6361/202348662';
const BV21 = 'Baumgardt & Vasiliev 2021, MNRAS 505, 5957';
const VB21 = 'Vasiliev & Baumgardt 2021, MNRAS 505, 5978';
const HARRIS = 'Harris 1996, AJ 112, 1487 (2010 edition)';

const ageText = (logAge: number): string => {
  const yr = 10 ** logAge;
  return yr >= 1e9 ? `${sig(yr / 1e9, 2)} billion years` : `${sig(yr / 1e6, 2)} million years`;
};

function openClusterRecord(c: OpenCluster, id: string): BodyRecord {
  const ly = (c.distPc * PARSEC_KM) / LIGHT_YEAR_KM;
  const rows = [
    { l: 'Members seen by Gaia', v: c.members.toLocaleString('en-GB') },
    { l: 'Age', v: ageText(c.logAge[1]), title: `16th–84th percentiles: ${ageText(c.logAge[0])} to ${ageText(c.logAge[2])}` },
    ...(c.massTotalMsun ? [{ l: 'Mass', v: `≈ ${sig(c.massTotalMsun, 2)}`, u: 'M☉', title: 'Photometric: the stars Gaia sees, corrected for those it misses' }] : []),
    ...(c.av !== null ? [{ l: 'Extinction A_V', v: sig(c.av, 2), u: 'mag' }] : []),
  ];
  return {
    id,
    name: clusterDisplayName(c),
    aliases: clusterAliases(c),
    kind: 'cluster',
    kindText: 'Open cluster',
    parent: null,
    physical: { radiusKm: c.radiusPc * PARSEC_KM, colour: '#bcd2ff' },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 6 * c.radiusPc * PARSEC_KM },
    detector: false,
    orbitLine: false,
    deepSky: {
      type: 'Open cluster',
      distancePc: c.distPc,
      distanceLoPc: c.distLoPc,
      distanceHiPc: c.distHiPc,
      distanceSource: `Gaia DR3 parallaxes of its members (${HR24}); add about 0.015 mas of systematic error`,
      sizes: [
        { label: 'Radius holding half its members', pc: c.radiusPc },
        ...(c.rJacobiPc ? [{ label: 'Jacobi (tidal) radius', pc: c.rJacobiPc, title: 'Where the Galaxy’s tide takes over' }] : []),
      ],
      rows,
      refs: [`${HR24}; Hunt & Reffert 2023, A&A 673, A114 (Gaia DR3)`],
    },
    facts: [
      `A cluster of stars born together about ${ageText(c.logAge[1])} ago, ${ly < 1000 ? Math.round(ly) : Math.round(ly / 10) * 10} light-years away. Gaia counts ${c.members.toLocaleString('en-GB')} of its stars.`,
    ],
    factSources: [doiUrl(HR24_DOI)],
    factSourceLabels: ['Hunt & Reffert 2024'],
    positionNote: `Position: the densest point of its members in Gaia DR3 (${HR24}), held fixed.`,
    modelNotes: ['Its brighter stars are drawn by the star catalogue; the ring marks the radius holding half its members.'],
    dataSource: HR24,
    article: 'our-galaxy',
    provider: fixedGalacticProvider([c.xPc, c.yPc, c.zPc], 'Gaia DR3 position at the adopted distance'),
  };
}

function globularClusterRecord(c: GlobularCluster, id: string): BodyRecord {
  const teffK = bvToTemperature(GLOBULAR_BV);
  const ly = (c.distPc * PARSEC_KM) / LIGHT_YEAR_KM;
  const distRef = c.distSource === 'BV21' ? BV21 : HARRIS;
  const rows = [
    ...(c.mv !== null ? [{ l: 'Absolute magnitude M_V', v: c.mv.toFixed(2), title: `${HARRIS}, at the adopted distance` }] : []),
    ...(c.massEstimateMsun ? [{ l: 'Mass', v: `≈ ${sig(c.massEstimateMsun, 2)}`, u: 'M☉', title: 'An estimate from its light (1.9 L_V): Baumgardt et al. 2020 find 1.4 < M/L_V < 2.5' }] : []),
    ...(c.feH !== null ? [{ l: 'Metallicity [Fe/H]', v: c.feH.toFixed(2), title: `${HARRIS}: ${sig(10 ** c.feH * 100, 2)}% of the Sun's iron` }] : []),
    ...(c.concentration !== null ? [{ l: 'Concentration c', v: c.concentration.toFixed(2), title: c.coreCollapsed ? 'Core collapsed' : 'log10(tidal / core radius)' }] : []),
  ];
  return {
    id,
    name: clusterDisplayName(c),
    aliases: clusterAliases(c),
    kind: 'cluster',
    kindText: 'Globular cluster',
    parent: null,
    physical: {
      radiusKm: c.radiusPc * PARSEC_KM,
      colour: '#ffe2b8',
      luminous: { vmag: c.mv ?? -6, atKm: 10 * PARSEC_KM, teffK },
    },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 8 * c.radiusPc * PARSEC_KM },
    detector: false,
    orbitLine: false,
    deepSky: {
      type: 'Globular cluster',
      distancePc: c.distPc,
      distanceLoPc: c.distLoPc,
      distanceHiPc: c.distHiPc,
      distanceSource: c.distSource === 'BV21' ? `the mean of many methods (${BV21})` : HARRIS,
      sizes: [
        { label: 'Half-light radius', pc: c.radiusPc, title: c.radiusDefault ? 'Not in the Harris catalogue: 3 pc is drawn' : HARRIS },
        ...(c.rcPc ? [{ label: 'Core radius', pc: c.rcPc, title: HARRIS }] : []),
      ],
      rows,
      refs: [`${VB21} (position)`, `${distRef} (distance)`, `${HARRIS} (magnitude, radii, metallicity)`],
    },
    facts: [
      `A ball of old stars ${Math.round(ly / 100) * 100 >= 1000 ? (Math.round(ly / 100) * 100).toLocaleString('en-GB') : Math.round(ly)} light-years away, shining like ${sunsWords(10 ** (-0.4 * ((c.mv ?? -6) - 4.83)))} Suns${c.mv === null ? ' (its brightness is not catalogued: a typical value is drawn)' : ''}.`,
    ],
    factSources: ['https://physics.mcmaster.ca/~harris/mwgc.dat'],
    factSourceLabels: ['Harris 2010'],
    positionNote: `Position: ${VB21}; distance: ${distRef}; held fixed.`,
    modelNotes: [
      'Drawn as a glow with its measured brightness and half-light radius, with points that show how its light gathers to the centre (illustrative: not its real stars). Its colour is a typical globular cluster’s.',
    ],
    dataSource: `${VB21}; ${distRef}; ${HARRIS}`,
    article: 'our-galaxy',
    provider: fixedGalacticProvider([c.xPc, c.yPc, c.zPc], 'Catalogue position at the adopted distance'),
  };
}

/** The famous clusters as bodies, with ids that do not collide with `taken` (nebula ids and the like). */
export function clusterRecords(clusters: readonly Cluster[], taken: ReadonlySet<string> = new Set()): BodyRecord[] {
  const used = new Set(taken);
  const out: BodyRecord[] = [];
  for (const c of clusters) {
    if (!isFamousCluster(c)) continue;
    const id = clusterId(c, used);
    if (used.has(id)) continue;
    used.add(id);
    out.push(c.kind === 'open' ? openClusterRecord(c, id) : globularClusterRecord(c, id));
  }
  return out;
}

/** Light-years of a distance in parsecs (for text). */
export const lightYears = (pc: number): number => (pc * PARSEC_KM) / LIGHT_YEAR_KM;
