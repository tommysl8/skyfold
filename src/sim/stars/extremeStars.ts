/**
 * The extreme stars: what each famous one looks like up close (CLOSE_UPS, read by closeup.ts starSurface through
 * records.ts), and the ones systems.json does not have, registered as named stars here (EXTREME_STARS). Every number
 * is quoted from the paper named with it; docs/data/stars.md §13 lists them.
 *
 * Distances. A star whose catalogue parallax is poor or absent is placed at the distance its size was measured at
 * (Mu Cephei, VY Canis Majoris, Eta Carinae), along its catalogue direction, keeping its brightness as seen from the
 * Sun; the stars the catalogue lacks (UY Scuti, Stephenson 2-18, WR 104) at their Gaia DR3 position and the distance
 * named. Their motions are not followed (their catalogue velocities rest on the poor parallaxes).
 */
import type { CloseUpSpec } from './closeup';
import { omegaFromFlattening, poleTemperatureFromMean } from './closeup';
import type { StarJson } from './orbits';

const DEG = Math.PI / 180;
const doi = (d: string) => `https://doi.org/${d}`;

/** The papers cited here: key → citation, and the link the cards use. */
export const EXTREME_REFS: Record<string, { cite: string; url: string }> = {
  monnier2007: { cite: 'Monnier J. D. et al. 2007, Science 317, 342 (Table 1, β-free model)', url: doi('10.1126/science.1143205') },
  monnier2012: { cite: 'Monnier J. D. et al. 2012, ApJL 761, L3 (Table 2, concordance model)', url: doi('10.1088/2041-8205/761/1/L3') },
  che2011: { cite: 'Che X. et al. 2011, ApJ 732, 68 (Table 4, modified von Zeipel model)', url: doi('10.1088/0004-637X/732/2/68') },
  domiciano2014: { cite: 'Domiciano de Souza A. et al. 2014, A&A 569, A10', url: doi('10.1051/0004-6361/201424144') },
  domiciano2012: { cite: 'Domiciano de Souza A. et al. 2012, A&A 545, A130 (mean temperature 15,000 K after Vinicius et al. 2006; mass 6.1 M☉ after Harmanec 1988)', url: doi('10.1051/0004-6361/201218782') },
  montarges2019: { cite: 'Montargès M. et al. 2019, MNRAS 485, 2417 (Table 2)', url: doi('10.1093/mnras/stz397') },
  perrin2005: { cite: 'Perrin G. et al. 2005, A&A 436, 317', url: doi('10.1051/0004-6361:20042313') },
  wittkowski2012: { cite: 'Wittkowski M. et al. 2012, A&A 540, L12 (Table 2; distance the mean of Choi et al. 2008 and Zhang et al. 2012)', url: doi('10.1051/0004-6361/201219126') },
  arroyo2013: { cite: 'Arroyo-Torres B. et al. 2013, A&A 554, A76 (Tables 2 and 3)', url: doi('10.1051/0004-6361/201220920') },
  gaiaDr3: { cite: 'Gaia Collaboration, Vallenari A. et al. 2023, A&A 674, A1 (Gaia DR3)', url: doi('10.1051/0004-6361/202243940') },
  davies2007: { cite: 'Davies B. et al. 2007, ApJ 671, 781 (the cluster’s kinematic distance)', url: doi('10.1086/522224') },
  fok2012: { cite: 'Fok T. K. T. et al. 2012, ApJ 760, 65 (Table 5: T = 3,200 K, log L = 5.64)', url: doi('10.1088/0004-637X/760/1/65') },
  humphreys2020: { cite: 'Humphreys R. M. et al. 2020, AJ 160, 145', url: doi('10.3847/1538-3881/abab15') },
  siebert2026: { cite: 'Siebert M. A. et al. 2026, arXiv:2609.31362', url: 'https://arxiv.org/abs/2609.31362' },
  smith2006: { cite: 'Smith N. 2006, ApJ 644, 1151', url: doi('10.1086/503766') },
  vanBoekel2003: { cite: 'van Boekel R. et al. 2003, A&A 410, L37', url: doi('10.1051/0004-6361:20031500') },
  davidson1997: { cite: 'Davidson K., Humphreys R. M. 1997, ARA&A 35, 1', url: doi('10.1146/annurev.astro.35.1.1') },
  damineli1996: { cite: 'Damineli A. 1996, ApJ 460, L49', url: doi('10.1086/309961') },
  tuthill2008: { cite: 'Tuthill P. G. et al. 2008, ApJ 675, 698', url: doi('10.1086/527286') },
  crowther2007: { cite: 'Crowther P. A. 2007, ARA&A 45, 177', url: doi('10.1146/annurev.astro.45.051806.110615') },
  haubois2009: { cite: 'Haubois X. et al. 2009, A&A 508, 923', url: doi('10.1051/0004-6361/200912927') },
  chiavassa2010: { cite: 'Chiavassa A. et al. 2010, A&A 515, A12', url: doi('10.1051/0004-6361/200913907') },
  ohnaka2017: { cite: 'Ohnaka K. et al. 2017, Nature 548, 310', url: doi('10.1038/nature23445') },
  benedict1998: { cite: 'Benedict G. F. et al. 1998, AJ 116, 429', url: doi('10.1086/300420') },
  davenport2016: { cite: 'Davenport J. R. A. et al. 2016, ApJL 829, L31', url: doi('10.3847/2041-8205/829/2/L31') },
  donahue1996: { cite: 'Donahue R. A., Saar S. H., Baliunas S. L. 1996, ApJ 466, 384', url: doi('10.1086/177517') },
  berdyugina2005: { cite: 'Berdyugina S. V. 2005, Living Rev. Sol. Phys. 2, 8', url: doi('10.12942/lrsp-2005-8') },
};

const cite = (...keys: string[]): string => keys.map((k) => EXTREME_REFS[k].cite.replace(/ \(.*\)$/, '')).join('; ');

/** A red supergiant's giant cells: about thirty over the whole star (a dozen or so on the side we see), turning over in about a year (a model). */
const RSG_CELLS = { count: 30, turnoverS: 3.156e7, ref: cite('haubois2009', 'chiavassa2010', 'ohnaka2017') };

/** Achernar's shape: R_eq/R_pole = 1.352 (Domiciano de Souza et al. 2014). */
export const ACHERNAR_FLATTENING = 1.352;
const ACHERNAR_OMEGA = omegaFromFlattening(ACHERNAR_FLATTENING);
const ACHERNAR_BETA = 0.166;
/** Its mean effective temperature, K, as Domiciano de Souza et al. (2012) adopt it (Vinicius et al. 2006). */
const ACHERNAR_MEAN_K = 15_000;

/** What each star looks like up close, by app id: shapes and temperatures, cells, spots and flares. */
export const CLOSE_UPS: Readonly<Record<string, CloseUpSpec>> = {
  altair: {
    // v sin i = 240 km/s at i = 57.2°.
    rotator: { omega: 0.923, beta: 0.19, teffPoleK: 8450, inclinationDeg: 57.2, poleAngleDeg: -61.8, vEqKms: 240 / Math.sin(57.2 * DEG), ref: cite('monnier2007') },
  },
  vega: {
    rotator: { omega: 0.774, beta: 0.231, teffPoleK: 10_070, inclinationDeg: 6.2, poleAngleDeg: -58, periodDays: 0.71, ref: cite('monnier2012') },
  },
  regulus: {
    // 1.64 turns a day; v sin i = 336 km/s at i = 86.3°.
    rotator: { omega: 0.962, beta: 0.188, teffPoleK: 14_520, inclinationDeg: 86.3, poleAngleDeg: 258, periodDays: 1 / 1.64, ref: cite('che2011') },
  },
  achernar: {
    rotator: {
      omega: ACHERNAR_OMEGA,
      beta: ACHERNAR_BETA,
      teffPoleK: poleTemperatureFromMean(ACHERNAR_MEAN_K, ACHERNAR_OMEGA, ACHERNAR_BETA),
      inclinationDeg: 60.6,
      poleAngleDeg: 216.9,
      vEqKms: 298.8,
      ref: cite('domiciano2014'),
    },
  },
  betelgeuse: { giantCells: RSG_CELLS },
  antares: { giantCells: RSG_CELLS },
  'mu-cephei': { giantCells: RSG_CELLS },
  'vy-canis-majoris': { giantCells: RSG_CELLS },
  'uy-scuti': { giantCells: RSG_CELLS },
  'stephenson-2-18': { giantCells: RSG_CELLS },
  proxima: {
    spots: { count: 5, radiusRad: 0.2, deltaTK: -400, periodDays: 83.5, ref: `${cite('benedict1998')} for the rotation; spots a few hundred kelvin cooler, as on other M dwarfs (${cite('berdyugina2005')})` },
    // 66 flares in 37.6 days above 10²⁹ erg; extended down to 0.5% in brightness, 63 a day.
    flares: { perDay: 63, durationS: 600, ref: cite('davenport2016') },
  },
  'epsilon-eridani': {
    spots: { count: 4, radiusRad: 0.18, deltaTK: -400, periodDays: 11.68, ref: `${cite('donahue1996')} for the rotation; ${cite('berdyugina2005')} for spot temperatures` },
  },
  'eta-carinae': {
    // The wind is elongated along the Homunculus's axis, de-projected about 1.5 to 1 (van Boekel et al. 2003), whose
    // axis is tilted 41° from our line of sight at position angle 310° (Smith 2006).
    wind: { elongation: 1.5, inclinationDeg: 41, poleAngleDeg: 310, ref: cite('vanBoekel2003', 'smith2006') },
  },
};

/** A star of EXTREME_STARS: its systems.json-style entry, where it is, and what its card adds. */
export interface ExtremeStarDef {
  json: StarJson;
  /** Its place: along its catalogue direction, or at a position of its own (ICRS, deg). */
  raDeg?: number;
  decDeg?: number;
  distancePc: number;
  /** How the distance was found, for the card; and its precision in words. */
  distanceSource: string;
  distancePrecision: string;
  /** For a star the catalogue lacks: its apparent V from the Sun, and where that comes from. */
  vMag?: number;
  vMagNote?: string;
  notes: string[];
  facts: [string, string][];
  article?: string;
}

const R_SUN_AU = 695_700 / 149_597_870.7;
/** Radius, R☉, of a disc `thetaMas` across at `dPc`: θ/2 · d. */
export const radiusFromAngularDiameter = (thetaMas: number, dPc: number): number => (thetaMas / 2 / 1000) * dPc / R_SUN_AU;
/** Radius, R☉, from luminosity (L☉) and effective temperature by Stefan–Boltzmann. */
export const radiusFromLT = (lSun: number, teffK: number): number => Math.sqrt(lSun) * (5772 / teffK) ** 2;

/** UY Scuti's Gaia DR3 parallax, mas, with the global zero-point of −0.017 mas the catalogue uses where the recipe is not applied (docs/data/stars.md §4.2). */
const UY_SCT_PARALLAX_MAS = 0.5166 + 0.017;
export const UY_SCT_DISTANCE_PC = 1000 / UY_SCT_PARALLAX_MAS;
/** Stephenson 2's kinematic distance, pc (Davies et al. 2007). */
export const STEPHENSON_2_PC = 5830;

const star = (j: Partial<StarJson> & Pick<StarJson, 'id' | 'name' | 'refs'>): StarJson => ({
  altNames: [],
  system: null,
  catalogueIndex: null,
  hip: null,
  gaiaDr3: null,
  spectralType: null,
  catalogueDistancePc: null,
  ...j,
});

/** The extreme stars systems.json does not have. */
export const EXTREME_STARS: readonly ExtremeStarDef[] = [
  {
    json: star({
      id: 'mu-cephei',
      name: 'Mu Cephei',
      altNames: ['Garnet Star', 'Herschel’s Garnet Star', 'μ Cep', 'mu Cep', 'HIP 107259'],
      catalogueIndex: 660,
      hip: 107_259,
      radiusRsun: 972,
      radiusErr: 228,
      teffK: 3551,
      teffErr: 136,
      luminosityLsun: Math.round(10 ** 5.13),
      refs: { all: 'montarges2019' },
    }),
    distancePc: 641,
    distanceSource: `641 (+148/−144) pc, scaled from Betelgeuse’s by the size of their molecular layers (${cite('montarges2019')}); its Hipparcos parallax, 0.55 ± 0.20 mas, gives only a rough 1,800 pc`,
    distancePrecision: 'about 23%',
    notes: [`Its photosphere is ${14.11} mas across in the near-infrared (${cite('perrin2005')}); its size and luminosity scale with its uncertain distance.`],
    facts: [
      ['A red supergiant about 970 times the Sun’s radius, one of the largest stars in the Milky Way: in the Sun’s place it would reach beyond the orbit of Jupiter.', 'montarges2019'],
      ['William Herschel called it the Garnet Star for its deep red colour.', 'montarges2019'],
    ],
    article: 'what-stars-are-made-of',
  },
  {
    json: star({
      id: 'vy-canis-majoris',
      name: 'VY Canis Majoris',
      altNames: ['VY CMa', 'HIP 35793', 'HD 58061'],
      catalogueIndex: 50_094,
      hip: 35_793,
      spectralType: 'M4',
      radiusRsun: 1420,
      radiusErr: 120,
      teffK: 3490,
      teffErr: 90,
      luminosityLsun: 270_000,
      massMsun: 17,
      massErr: 8,
      refs: { all: 'wittkowski2012' },
    }),
    distancePc: 1170,
    distanceSource: `1.17 ± 0.08 kpc from the parallaxes of its masers (${cite('wittkowski2012')})`,
    distancePrecision: 'about 7%',
    notes: [`Its radius is where the Rosseland optical depth reaches 2/3, from a near-infrared diameter of 11.3 ± 0.3 mas (${cite('wittkowski2012')}). It sits in a nebula of its own dust, not drawn.`],
    facts: [
      ['A red supergiant about 1,420 times the Sun’s radius: in the Sun’s place its surface would lie beyond Jupiter’s orbit.', 'wittkowski2012'],
      ['Its atmosphere is lumpy and lopsided, with layers of water and carbon monoxide well above its surface.', 'wittkowski2012'],
    ],
    article: 'what-stars-are-made-of',
  },
  {
    json: star({
      id: 'uy-scuti',
      name: 'UY Scuti',
      altNames: ['UY Sct', 'BD−12 5055', 'BD-12 5055', 'Gaia DR3 4152993273702130432'],
      gaiaDr3: '4152993273702130432',
      radiusRsun: radiusFromAngularDiameter(5.48, UY_SCT_DISTANCE_PC),
      teffK: 3365,
      teffErr: 134,
      refs: { radius: 'arroyo2013', teff: 'arroyo2013', distance: 'gaiaDr3' },
    }),
    raDeg: 276.902_199_408_6,
    decDeg: -12.466_372_792_96,
    distancePc: UY_SCT_DISTANCE_PC,
    distanceSource: `its Gaia DR3 parallax, 0.517 ± 0.049 mas, with the global zero-point (${cite('gaiaDr3')})`,
    distancePrecision: 'about 10%',
    vMag: 9.0,
    vMagNote: `V = 9.0 (${cite('arroyo2013')}, Table 2)`,
    notes: [
      `Its size is its near-infrared diameter, 5.48 ± 0.10 mas (${cite('arroyo2013')}), at Gaia’s distance: about 1,100 solar radii. At the 2.9 kpc assumed before Gaia the same diameter gave 1,708 ± 192, the figure often quoted.`,
    ],
    facts: [
      ['Once called the largest known star, 1,708 times the Sun’s radius at the 2.9 kpc then assumed; at the distance Gaia measured the same angular size gives about 1,100.', 'arroyo2013'],
      ['Its surface is about 3,365 K, cooler than a candle flame’s hottest part.', 'arroyo2013'],
    ],
    article: 'what-stars-are-made-of',
  },
  {
    json: star({
      id: 'stephenson-2-18',
      name: 'Stephenson 2-18',
      altNames: ['St2-18', 'St 2-18', 'Stephenson 2 DFK 1', 'DFK 1', 'RSGC2-01', 'Stephenson 2-18 (St2-18)', 'Gaia DR3 4253084565963481856'],
      gaiaDr3: '4253084565963481856',
      radiusRsun: radiusFromLT(10 ** 5.64, 3200),
      teffK: 3200,
      luminosityLsun: Math.round(10 ** 5.64),
      refs: { all: 'fok2012', distance: 'davies2007' },
    }),
    raDeg: 279.759_865_251_8,
    decDeg: -6.086_286_370_06,
    distancePc: STEPHENSON_2_PC,
    distanceSource: `the kinematic distance of the cluster Stephenson 2, 5.83 (+1.91/−0.78) kpc (${cite('davies2007')}), if it is a member`,
    distancePrecision: 'uncertain: its membership of the cluster is in doubt',
    vMag: 15.3,
    vMagNote: `its Gaia DR3 G magnitude, 15.30, standing in for V (a red star this reddened is fainter still in V)`,
    notes: [
      `Its size is disputed. The 2,150 solar radii often quoted follow by Stefan–Boltzmann from 3,200 K and 440,000 L☉ (${cite('fok2012')}), but 3,200 K is the input of a dust model, not a measured temperature, and the luminosity assumes the cluster’s distance. Humphreys et al. (2020) find its light peculiar and doubt it belongs to the cluster; Siebert et al. (2026) note it may be a nearer star. Nearer, it would be smaller in proportion. Drawn at 2,150 R☉, the cluster-distance figure.`,
    ],
    facts: [
      ['Often called the largest known star, about 2,150 times the Sun’s radius, but the figure is disputed: the temperature and luminosity behind it are uncertain, and so is its distance.', 'fok2012'],
      ['It may not even be in the cluster it is named for: its light is peculiar and its speed differs from the cluster’s.', 'humphreys2020'],
    ],
    article: 'what-stars-are-made-of',
  },
  {
    json: star({
      id: 'eta-carinae',
      name: 'Eta Carinae',
      altNames: ['η Car', 'eta Car', 'Eta Car', 'HD 93308', 'Homunculus Nebula', 'Homunculus'],
      catalogueIndex: 52_994,
      // Half its near-infrared light comes from within 5 mas, 11 au at 2.3 kpc (van Boekel et al. 2003).
      radiusRsun: radiusFromAngularDiameter(5, 2350),
      luminosityLsun: 5_000_000,
      refs: { radius: 'vanBoekel2003', luminosity: 'davidson1997', distance: 'smith2006' },
    }),
    distancePc: 2350,
    distanceSource: `2,350 ± 50 pc from the expansion of its nebula, the Homunculus (${cite('smith2006')})`,
    distancePrecision: 'about 2%',
    notes: [
      `What is drawn is its own dense wind, which hides the star: a glowing ball the size of the region giving half its near-infrared light, about 12 au across, stretched 1.5 to 1 along the nebula’s axis (${cite('vanBoekel2003')}); its colour is its catalogue colour, reddened by dust.`,
      `A pair of stars hides inside: they swing close every five and a half years (${cite('damineli1996')}); the companion is not drawn.`,
    ],
    facts: [
      ['In the 1840s it erupted and threw off the Homunculus, the double-lobed cloud round it, which is still flying out at up to 650 km/s.', 'smith2006'],
      ['One of the most luminous stars in the Galaxy, about five million times the Sun.', 'davidson1997'],
      ['Two stars, not one: they swing close every five and a half years.', 'damineli1996'],
    ],
    article: 'what-stars-are-made-of',
  },
  {
    json: star({
      id: 'achernar',
      name: 'Achernar',
      altNames: ['α Eri', 'alpha Eri', 'Alpha Eridani', 'HIP 7588'],
      catalogueIndex: 7,
      hip: 7588,
      spectralType: 'B6 Vpe',
      radiusRsun: 9.16,
      radiusErr: 0.23,
      radiusPolarRsun: 9.16 / ACHERNAR_FLATTENING,
      teffK: ACHERNAR_MEAN_K,
      massMsun: 6.1,
      refs: { radius: 'domiciano2014', teff: 'domiciano2012', mass: 'domiciano2012' },
    }),
    distancePc: NaN,
    distanceSource: '',
    distancePrecision: '',
    notes: [],
    facts: [
      ['The flattest star measured: spinning at about 300 km/s at its equator, it is 35% wider there than from pole to pole.', 'domiciano2014'],
      ['Its rapid spin flings gas off its equator into a disc that comes and goes (it is a Be star).', 'domiciano2014'],
    ],
  },
  {
    json: star({
      id: 'wr-104',
      name: 'WR 104',
      altNames: ['Pinwheel Nebula', 'WR104', 'Wolf-Rayet 104', 'Gaia DR3 4069167258796371712'],
      gaiaDr3: '4069167258796371712',
      spectralType: 'WC9 + OB',
      radiusRsun: 5,
      teffK: 40_000,
      refs: { distance: 'tuthill2008', teff: 'crowther2007' },
    }),
    raDeg: 270.517_183_147_5,
    decDeg: -23.628_381_585_45,
    distancePc: 2600,
    distanceSource: `2.6 ± 0.7 kpc, from its dust spiral’s expansion of 0.28 mas a day and the Wolf-Rayet star’s wind speed (${cite('tuthill2008')})`,
    distancePrecision: 'about 27%',
    vMag: 12.9,
    vMagNote: 'its Gaia DR3 G magnitude, 12.90, standing in for V',
    notes: [
      `Neither star’s size or temperature is measured: drawn as a ball of 5 R☉ at 40,000 K, typical of late WC stars (${cite('crowther2007')}).`,
    ],
    facts: [
      ['A Wolf-Rayet star and a hot companion whose colliding winds make dust: as they orbit every 241.5 days the dust streams out in a spiral, like water from a garden sprinkler.', 'tuthill2008'],
      ['Its spiral is seen almost face on, tilted no more than about 16° from our line of sight.', 'tuthill2008'],
    ],
    article: 'what-stars-are-made-of',
  },
];
