/**
 * Variable stars (docs/data/stars.md §15): Algol and β Lyrae, which eclipse; the Cepheids δ Cephei and Polaris, the
 * RR Lyrae star RR Lyrae, the Mira variable Mira, which pulsate; and Betelgeuse, semi-regular, with its Great Dimming of
 * 2019–20. Pure functions of the date: the light each sends (V), and for the pulsators its colour temperature and size.
 * sim/stars/variability.ts applies them to the stars' records each frame.
 *
 * Ephemerides are the General Catalogue of Variable Stars' (Samus et al. 2017, Astron. Rep. 61, 80; VizieR B/gcvs) unless
 * said otherwise. Phases are of the light reaching the Sun (Earth) at the date; elsewhere the light-time difference shifts
 * them (variability.ts).
 *
 * Algol is drawn as the triple it is (Baron et al. 2012, ApJ 752, 20: radii, masses and both orbits from CHARA's images;
 * Kolbas et al. 2015, MNRAS 451, 4150: temperatures), and its eclipses are not a light curve but geometry: each frame the
 * light of each star that one of the others hides, from where the camera is. From the Sun the primary eclipse comes at the
 * GCVS ephemeris's times, about 1.3 mag deep; from another direction it is shallower, or never happens.
 */
import { equatorialToEcliptic, skyBasis, type Vec3 } from './frames';
import type { OrbitJson } from './orbits';

const DEG = Math.PI / 180;
const frac = (x: number): number => x - Math.floor(x);

// ─── Pulsators ───────────────────────────────────────────────────────────────────────────

export interface PulsatorDef {
  /** Registry id. */
  id: string;
  name: string;
  aliases: string[];
  /** Catalogue row (stars3d), and its HIP number (the tests check the pair). */
  catalogueIndex: number;
  hip: number;
  /** GCVS type. */
  type: string;
  /** V at maximum and at minimum light. */
  vMax: number;
  vMin: number;
  /** A maximum light, JD (HJD), and the period, days. */
  epochJd: number;
  periodDays: number;
  /** The share of the cycle spent rising from minimum to maximum (GCVS M − m); 0.5 is a sinusoid. */
  rise: number;
  /** Temperature at maximum and minimum light, K (following the light between); absent: unchanged. */
  teff?: { max: number; min: number };
  /** Radius: mean (R☉), half-range as a share of it, and the phase of the largest radius (after maximum light). */
  radius?: { meanRsun: number; amplitude: number; maxPhase: number };
  /** One line for the card. */
  line: string;
  /** Model notes and facts with their sources. */
  notes: string[];
  facts: [string, string][];
}

/** V of a pulsator at phase φ (0 = maximum): a smooth fall over 1 − rise of the cycle and a rise over the rest. */
export function pulsatorV(d: Pick<PulsatorDef, 'vMax' | 'vMin' | 'rise'>, phase: number): number {
  const p = frac(phase);
  const fall = 1 - d.rise;
  const x = p < fall ? p / fall : (1 - p) / d.rise;
  return d.vMax + (d.vMin - d.vMax) * 0.5 * (1 - Math.cos(Math.PI * x));
}

/** Phase of a periodic variable at JD (0 at the epoch). */
export const phaseAt = (epochJd: number, periodDays: number, jd: number): number => frac((jd - epochJd) / periodDays);

export interface PulsatorState {
  v: number;
  teffK: number | null;
  radiusRsun: number | null;
}

export function pulsatorAt(d: PulsatorDef, jd: number): PulsatorState {
  const ph = phaseAt(d.epochJd, d.periodDays, jd);
  const v = pulsatorV(d, ph);
  const s = (d.vMin - v) / (d.vMin - d.vMax); // 1 at maximum light
  return {
    v,
    teffK: d.teff ? d.teff.min + (d.teff.max - d.teff.min) * s : null,
    radiusRsun: d.radius ? d.radius.meanRsun * (1 + d.radius.amplitude * Math.cos(2 * Math.PI * (ph - d.radius.maxPhase))) : null,
  };
}

export const PULSATORS: readonly PulsatorDef[] = [
  {
    id: 'delta-cephei',
    name: 'Delta Cephei',
    aliases: ['δ Cep', 'del Cep', 'Delta Cep', 'HIP 110991', 'HR 8571'],
    catalogueIndex: 596,
    hip: 110991,
    type: 'DCEP',
    vMax: 3.48,
    vMin: 4.37,
    epochJd: 2_455_479.905,
    periodDays: 5.366_208,
    rise: 0.25,
    teff: { max: 6900, min: 5600 },
    // Nardetto et al. 2016 (A&A 593, A45): limb-darkened diameters 1.450 ± 0.010 mas at phase 0.05 and 1.535 ± 0.017 mas at
    // 0.48; mean 1.49 mas at the catalogue's 279.5 pc is 44.8 R☉, ±3%.
    radius: { meanRsun: 44.8, amplitude: 0.029, maxPhase: 0.45 },
    line: 'A Cepheid: it swells and shrinks every 5.37 days, from V = 3.5 to 4.4.',
    notes: [
      'Its light follows the GCVS: V 3.48 to 4.37 every 5.366208 days, rising in a quarter of the cycle; the curve between is a smooth model, not a fit to photometry.',
      'Its size swings ±3% about 44.8 solar radii (the diameters Nardetto et al. 2016 measured at two phases, at the catalogue distance) and its temperature between 6,900 K near maximum light and 5,600 K (the model atmospheres they adopt at those phases); the curves between are a model.',
    ],
    facts: [
      ['The prototype of the Cepheids, the standard candles that measure the distances to galaxies: the longer a Cepheid’s period, the more luminous it is.', 'gcvs'],
      ['John Goodricke found its variation in 1784.', 'gcvs'],
    ],
  },
  {
    id: 'mira',
    name: 'Mira',
    aliases: ['ο Cet', 'omi Cet', 'Omicron Ceti', 'o Ceti', 'HIP 10826', 'HR 681'],
    catalogueIndex: 8509,
    hip: 10826,
    type: 'M',
    // A typical cycle; the GCVS's extremes are 2.0 and 10.1.
    vMax: 3.5,
    vMin: 9.5,
    epochJd: 2_444_839.0,
    periodDays: 331.96,
    rise: 0.38,
    // Woodruff et al. 2004 (A&A 421, 703): 3,192 ± 200 K at phase 0.13, 2,918 ± 183 K at 0.26; Rosseland diameters 28.9
    // and 34.9 mas at phases 0.13 and 0.40: 314 R☉ mean at the catalogue's 91.7 pc, ±9.5%.
    teff: { max: 3200, min: 2900 },
    radius: { meanRsun: 314, amplitude: 0.095, maxPhase: 0.4 },
    line: 'The first known variable: from naked-eye bright to invisible and back every 332 days.',
    notes: [
      'Its light follows a typical cycle, V 3.5 to 9.5 every 331.96 days (GCVS period and epoch), rising in 38% of it; real maxima range from 2 to 5 and minima from 8.5 to 10.1. The curve between is a smooth model.',
      'Its size swells about ±10% about 314 solar radii and its temperature runs from 3,200 K near maximum to 2,900 K, after the VLTI diameters and temperatures of Woodruff et al. (2004) at a few phases; between them a model. Most of its fading in V is molecules (TiO) forming in its cooling atmosphere, which this does not draw.',
    ],
    facts: [
      ['Named “the wonderful” (Mira) by Hevelius in 1662; David Fabricius saw it fade in 1596.', 'gcvs'],
      ['A red giant on the asymptotic giant branch, as the Sun will be: it sheds its outer layers, leaving a tail 13 light-years long behind it.', 'martin2007'],
    ],
  },
  {
    id: 'rr-lyrae',
    name: 'RR Lyrae',
    aliases: ['RR Lyr', 'HIP 95497', 'HD 182989'],
    catalogueIndex: 40074,
    hip: 95497,
    type: 'RRAB',
    vMax: 7.06,
    vMin: 8.12,
    epochJd: 2_442_923.4193,
    periodDays: 0.566_867_76,
    rise: 0.19,
    line: 'An old, pulsating star of the Galaxy’s halo: a magnitude brighter every 13.6 hours.',
    notes: [
      'Its light follows the GCVS: V 7.06 to 8.12 every 0.5669 days, rising in a fifth of the cycle; the curve between is a smooth model. Its 39-day Blazhko modulation and its colour changing with the light are not drawn.',
    ],
    facts: [['The prototype of the RR Lyrae stars, old helium-burning stars that all have about the same luminosity: standard candles for the Galaxy’s halo and globular clusters.', 'gcvs']],
  },
];

/** Polaris: a Cepheid of tiny amplitude now (a few hundredths of a magnitude), nearly sinusoidal. */
export const POLARIS_PULSATION = {
  id: 'polaris',
  epochJd: 2_431_495.813,
  periodDays: 3.9696,
  /** Peak-to-peak V (a model of the amplitude after its 20th-century decline: Bruntt et al. 2008, ApJ 683, 433). */
  amplitudeV: 0.04,
  line: 'A Cepheid of tiny amplitude: it brightens and fades by about 0.04 mag every 3.97 days.',
  note: 'It pulsates every 3.9696 days (GCVS) by a few hundredths of a magnitude in V, as since the 1990s (Bruntt et al. 2008): drawn as a sinusoid of 0.04 mag; its period lengthens by 4.5 s a year (Turner et al. 2005), so the phase shown is not today’s.',
} as const;

/** Polaris's V offset from its mean at JD. */
export const polarisDeltaV = (jd: number): number => -0.5 * POLARIS_PULSATION.amplitudeV * Math.cos(2 * Math.PI * phaseAt(POLARIS_PULSATION.epochJd, POLARIS_PULSATION.periodDays, jd));

// ─── Betelgeuse ──────────────────────────────────────────────────────────────────────────

const jdOf = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d) / 86_400_000 + 2_440_587.5;

/** The Great Dimming, V at dates (JD): measured points and the model's joins. */
export const GREAT_DIMMING: readonly { jd: number; v: number; source: string }[] = [
  { jd: jdOf(2019, 9, 15), v: 0.6, source: 'about 1 mag above its February minimum (Guinan et al. 2020, ATel 13512)' },
  { jd: jdOf(2019, 12, 7), v: 1.12, source: 'Guinan, Wasatonic & Calderwood 2019, ATel 13341' },
  { jd: jdOf(2020, 2, 10), v: 1.614, source: 'mean minimum 7–13 February 2020, Guinan et al. 2020, ATel 13512' },
  { jd: jdOf(2020, 2, 22), v: 1.522, source: 'Guinan et al. 2020, ATel 13512' },
  { jd: jdOf(2020, 3, 31), v: 0.93, source: 'Sigismondi 2020, ATel 13601 (visual)' },
  { jd: jdOf(2020, 4, 30), v: 0.55, source: 'a model: back to its usual cycle' },
];

/** Betelgeuse's usual light: a mean V of 0.55 with its 416-day pulsation (±0.2, a model) and 2,335-day long secondary period (±0.1). */
export function betelgeuseUsualV(jd: number): number {
  // Phased so that both cycles' minima fall on the Great Dimming's (ATel 13365: "near the minimum of the 5.9 yr light-cycle as well as near the deeper than usual minimum of the 425 day period").
  const t = jd - GREAT_DIMMING[2].jd;
  return 0.55 + 0.2 * Math.cos((2 * Math.PI * t) / 416) + 0.1 * Math.cos((2 * Math.PI * t) / 2335);
}

/** Betelgeuse's V at JD: the usual cycle, and the Great Dimming through its measured points (smoothly joined). */
export function betelgeuseV(jd: number): number {
  const pts = GREAT_DIMMING;
  if (jd <= pts[0].jd || jd >= pts[pts.length - 1].jd) return betelgeuseUsualV(jd);
  let k = 0;
  while (pts[k + 1].jd < jd) k++;
  const a = pts[k];
  const b = pts[k + 1];
  const f = (jd - a.jd) / (b.jd - a.jd);
  const s = f * f * (3 - 2 * f);
  return a.v + (b.v - a.v) * s;
}

export const BETELGEUSE_VARIABILITY = {
  line: 'A semi-regular variable: about 0.3 to 0.8 every 416 days; in February 2020 it fell to 1.6, the Great Dimming.',
  note: 'Its light is a model of its semi-regular cycles, a 416-day pulsation (Joyce et al. 2020) of ±0.2 mag about V = 0.55 and the 2,335-day long secondary period of the GCVS (±0.1 mag), with the Great Dimming of 2019–20 through the measured V of Guinan et al. (ATel 13341, 13512) and a visual estimate (ATel 13601). The dimming was a dust cloud it shed over its southern half (Montargès et al. 2021); its temperature hardly changed (Levesque & Massey 2020), so its colour is kept.',
} as const;

// ─── β Lyrae ─────────────────────────────────────────────────────────────────────────────

/** β Lyrae's primary minima: HJD 2408247.966 + 12.913780 E + 3.87196 × 10⁻⁶ E² (Harmanec & Scholz 1993, A&A 279, 131). */
export const BETA_LYR = { t0: 2_408_247.966, p0: 12.91378, q: 3.87196e-6, vMax: 3.25, vMinI: 4.36, vMinII: 3.85 } as const;

/** The (fractional) epoch E of β Lyrae at JD: the root of q E² + p0 E + t0 − jd = 0. */
export function betaLyrEpoch(jd: number): number {
  const { t0, p0, q } = BETA_LYR;
  return (-p0 + Math.sqrt(p0 * p0 + 4 * q * (jd - t0))) / (2 * q);
}

/** The time of β Lyrae's primary minimum number E, JD. */
export const betaLyrMinimumJd = (e: number): number => BETA_LYR.t0 + BETA_LYR.p0 * e + BETA_LYR.q * e * e;

/** The period of β Lyrae at JD, days: lengthening by 19 s a year as mass flows from one star to the other. */
export const betaLyrPeriod = (jd: number): number => BETA_LYR.p0 + 2 * BETA_LYR.q * betaLyrEpoch(jd);

/**
 * β Lyrae's V at JD: the two-term cosine curve through the GCVS maximum (3.25) and minima (4.36 and 3.85), the shape of
 * a pair of stars distorted by each other's gravity that never stop eclipsing.
 */
export function betaLyrV(jd: number): number {
  const ph = 2 * Math.PI * frac(betaLyrEpoch(jd));
  const { vMinI, vMinII } = BETA_LYR;
  // m = a0 + a1 cos φ + a2 cos 2φ: φ = 0 the primary minimum, π the secondary; a0 − a2 sets the quadratures to 3.25.
  const a1 = (vMinI - vMinII) / 2;
  const a0PlusA2 = (vMinI + vMinII) / 2;
  const a0MinusA2 = BETA_LYR.vMax;
  return 0.5 * (a0PlusA2 + a0MinusA2) + a1 * Math.cos(ph) + 0.5 * (a0PlusA2 - a0MinusA2) * Math.cos(2 * ph);
}

export const BETA_LYR_DEF = {
  id: 'beta-lyrae',
  name: 'Sheliak',
  aliases: ['Beta Lyrae', 'β Lyr', 'bet Lyr', 'HIP 92420', 'HR 7106'],
  catalogueIndex: 341,
  hip: 92420,
  line: 'An eclipsing pair that never stops changing: V 3.3 to 4.4 every 12.94 days.',
  notes: [
    'Its light is a two-term cosine curve through the GCVS maximum (V 3.25) and its two minima (4.36 and 3.85), the shape of the light of two stars pulled out of round by each other, eclipsing in turn; the timing is the quadratic ephemeris of Harmanec & Scholz (1993): the period grows by 19 seconds a year as one star pours its gas onto the other. It is drawn as one star.',
  ],
  facts: [
    ['Two stars so close that one, stripped to 3 solar masses, is pouring its gas onto the other, a 13-solar-mass star hidden in the thick disc that gas has made; its period grows by 19 seconds a year.', 'harmanec2002'],
  ],
} as const;

// ─── Eclipses ────────────────────────────────────────────────────────────────────────────

/** I(r)/I(0) of a linearly limb-darkened disc of unit radius: 1 − u (1 − μ), μ = √(1 − r²). */
const intensity = (r: number, u: number): number => 1 - u * (1 - Math.sqrt(Math.max(0, 1 - r * r)));

const RINGS = 64;

/**
 * The share of a linearly limb-darkened star's light (radius 1) hidden by an opaque disc of radius p whose centre is z
 * from the star's, on the sky: the rings of the star the disc reaches (64 of them), each by the arc of it inside the
 * disc, over the star's whole light, π (1 − u/3).
 */
export function occultedFraction(p: number, z: number, u: number): number {
  if (p <= 0 || z >= 1 + p) return 0;
  if (z + 1 <= p) return 1;
  const r0 = Math.max(0, z - p);
  const r1 = Math.min(1, z + p);
  const dr = (r1 - r0) / RINGS;
  let hidden = 0;
  for (let k = 0; k < RINGS; k++) {
    const r = r0 + (k + 0.5) * dr;
    let arc: number;
    if (r + z <= p) arc = 2 * Math.PI;
    else if (r >= z + p || z >= r + p) arc = 0;
    else arc = 2 * Math.acos(Math.max(-1, Math.min(1, (r * r + z * z - p * p) / (2 * r * z))));
    hidden += intensity(r, u) * r * arc * dr;
  }
  return Math.min(1, hidden / (Math.PI * (1 - u / 3)));
}

// ─── Algol ───────────────────────────────────────────────────────────────────────────────

/** Algol's J2000 direction (GCVS) for its orbits' orientation on the sky. */
export const ALGOL_RA_DEG = (3 + 8 / 60 + 10.13 / 3600) * 15;
export const ALGOL_DEC_DEG = 40 + 57 / 60 + 20.4 / 3600;

/** The GCVS ephemeris of Algol's primary minima (JD), the TIDAK database's: within about 0.2 d over 236 years (Jetsu 2021, ApJ 920, 137). */
export const ALGOL_EPHEMERIS = { minJd: 2_445_641.5135, periodDays: 2.867_304_3 } as const;

/** The orbital parallax Baron et al. (2012) adopt to turn their orbits into au, mas (Zavala et al. 2010; Peterson et al. 2011). */
export const ALGOL_PARALLAX_MAS = 34.7;

/** The three stars: radius and mass (Baron et al. 2012, Table 4), temperature (Kolbas et al. 2015, Table 5). */
export const ALGOL_STARS = {
  a: { radiusRsun: 2.73, massMsun: 3.17, teffK: 12_550, spectralType: 'B8 V' },
  b: { radiusRsun: 3.48, massMsun: 0.7, teffK: 4900, spectralType: 'K0 IV' },
  c: { radiusRsun: 1.73, massMsun: 1.76, teffK: 7550, spectralType: 'Am' },
} as const;

/** Campbell (visual-binary) elements on the sky → orbit basis p̂, q̂ in the J2000 ecliptic (scripts/build-stars3d.mjs campbellBasis). */
export function campbellBasisEcliptic(iDeg: number, OmegaDeg: number, omegaDeg: number, raDeg: number, decDeg: number): { pHat: Vec3; qHat: Vec3 } {
  const i = iDeg * DEG;
  const O = OmegaDeg * DEG;
  const w = omegaDeg * DEG;
  const { toward: s, east, north } = skyBasis(raDeg, decDeg);
  // Thiele–Innes constants per unit semi-major axis (x north, y east, z away from the observer).
  const A = Math.cos(w) * Math.cos(O) - Math.sin(w) * Math.sin(O) * Math.cos(i);
  const B = Math.cos(w) * Math.sin(O) + Math.sin(w) * Math.cos(O) * Math.cos(i);
  const F = -Math.sin(w) * Math.cos(O) - Math.cos(w) * Math.sin(O) * Math.cos(i);
  const G = -Math.sin(w) * Math.sin(O) + Math.cos(w) * Math.cos(O) * Math.cos(i);
  const C = Math.sin(w) * Math.sin(i);
  const H = Math.cos(w) * Math.sin(i);
  const P: Vec3 = [0, 1, 2].map((k) => A * north[k] + B * east[k] + C * s[k]) as Vec3;
  const Q: Vec3 = [0, 1, 2].map((k) => F * north[k] + G * east[k] + H * s[k]) as Vec3;
  return { pHat: equatorialToEcliptic(P), qHat: equatorialToEcliptic(Q) };
}

/**
 * Algol's two orbits as the app's orbit records. Inner (Baron et al. 2012, Table 6): P = 2.867328 d (here the GCVS's
 * 2.8673043 d, with its epoch, so the eclipses keep today's times), a = 2.15 mas, i = 98.70°, Ω = 43.43°, circular. With
 * e = 0, ω = 270° puts B straight in front of A (z towards us) at the epoch: the primary eclipse. Outer (Table 5): P =
 * 680.168 d, a = 93.43 mas, e = 0.227, i = 83.66°, Ω = 132.66°, ω = 310.02°, periastron JD 2446927.22,
 * m_C/(m_A + m_B) = 0.456.
 */
export function algolOrbits(): OrbitJson[] {
  const inner = campbellBasisEcliptic(98.7, 43.43, 270, ALGOL_RA_DEG, ALGOL_DEC_DEG);
  const outer = campbellBasisEcliptic(83.66, 132.66, 310.02, ALGOL_RA_DEG, ALGOL_DEC_DEG);
  const { a, b, c } = ALGOL_STARS;
  return [
    {
      id: 'algol-ab',
      primary: ['algol-a'],
      secondary: ['algol-b'],
      massPrimaryMsun: a.massMsun,
      massSecondaryMsun: b.massMsun,
      aAu: 2.15 / ALGOL_PARALLAX_MAS,
      e: 0,
      periodDays: ALGOL_EPHEMERIS.periodDays,
      tPeriJD: ALGOL_EPHEMERIS.minJd,
      pHat: inner.pHat,
      qHat: inner.qHat,
      eclipticAngles: { iDeg: 98.7, OmegaDeg: 43.43, omegaDeg: 270 },
      source: 'Baron et al. 2012 (CHARA), timed by the GCVS ephemeris',
      published: { kind: 'visual orbit', refs: ['baron2012'] },
    },
    {
      id: 'algol-ab-c',
      primary: ['algol-a', 'algol-b'],
      secondary: ['algol-c'],
      massPrimaryMsun: a.massMsun + b.massMsun,
      massSecondaryMsun: c.massMsun,
      aAu: 93.43 / ALGOL_PARALLAX_MAS,
      e: 0.227,
      periodDays: 680.168,
      tPeriJD: 2_446_927.22,
      pHat: outer.pHat,
      qHat: outer.qHat,
      eclipticAngles: { iDeg: 83.66, OmegaDeg: 132.66, omegaDeg: 310.02 },
      source: 'Baron et al. 2012 (CHARA)',
      published: { kind: 'visual orbit', refs: ['baron2012'] },
    },
  ];
}

/**
 * The share of one star's light another hides, seen from `observer` (positions in any one unit, radii in the same): none
 * unless the other is nearer. The separation on the sky comes from the stars' difference (exact however far away they are).
 */
export function hiddenShare(
  star: { pos: Readonly<Vec3>; radius: number; u: number },
  occ: { pos: Readonly<Vec3>; radius: number },
  observer: Readonly<Vec3>,
): number {
  const sx = star.pos[0] - observer[0];
  const sy = star.pos[1] - observer[1];
  const sz = star.pos[2] - observer[2];
  const rx = occ.pos[0] - star.pos[0];
  const ry = occ.pos[1] - star.pos[1];
  const rz = occ.pos[2] - star.pos[2];
  const ls = Math.hypot(sx, sy, sz);
  const lo = Math.hypot(sx + rx, sy + ry, sz + rz);
  if (lo >= ls) return 0;
  const cx = sy * rz - sz * ry;
  const cy = sz * rx - sx * rz;
  const cz = sx * ry - sy * rx;
  const dot = ls * ls + sx * rx + sy * ry + sz * rz;
  const sep = Math.atan2(Math.hypot(cx, cy, cz), dot);
  const as = Math.asin(Math.min(1, star.radius / ls));
  const ao = Math.asin(Math.min(1, occ.radius / lo));
  return occultedFraction(ao / as, sep / as, star.u);
}

/** Each Algol star's absolute V from its radius and temperature (Stefan–Boltzmann and Flower's bolometric correction, as corrected by Torres 2010). */
export function algolAbsMags(bc: (teffK: number) => number, mBolSun: number): { a: number; b: number; c: number } {
  const m = (s: { radiusRsun: number; teffK: number }) => mBolSun - 2.5 * Math.log10(s.radiusRsun ** 2 * (s.teffK / 5772) ** 4) - bc(s.teffK);
  return { a: m(ALGOL_STARS.a), b: m(ALGOL_STARS.b), c: m(ALGOL_STARS.c) };
}

/** Sum of magnitudes. */
export const addMags = (...ms: number[]): number => -2.5 * Math.log10(ms.reduce((s, m) => s + 10 ** (-0.4 * m), 0));

/** Algol's stars relative to the triple's centre of mass at JD (au, ecliptic): the inner orbit about the pair's centre, the pair about C. */
export function algolMembersAu(jd: number, orbits: readonly OrbitJson[], solve: (o: OrbitJson, jd: number, out: number[]) => void): { a: Vec3; b: Vec3; c: Vec3 } {
  const [inner, outer] = orbits;
  const ri = [0, 0, 0];
  const ro = [0, 0, 0];
  solve(inner, jd, ri);
  solve(outer, jd, ro);
  const mi = inner.massPrimaryMsun + inner.massSecondaryMsun;
  const mo = mi + outer.massSecondaryMsun;
  const fAB = -outer.massSecondaryMsun / mo;
  const fC = mi / mo;
  const fA = -inner.massSecondaryMsun / mi;
  const fB = inner.massPrimaryMsun / mi;
  const at = (fo: number, fi: number): Vec3 => [fo * ro[0] + fi * ri[0], fo * ro[1] + fi * ri[1], fo * ro[2] + fi * ri[2]];
  return { a: at(fAB, fA), b: at(fAB, fB), c: at(fC, 0) };
}

const ads = (bibcode: string) => `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(bibcode)}`;
const doi = (d: string) => `https://doi.org/${d}`;

/** The sources of the variables' facts and numbers, by key (cards link them). */
export const VARIABLE_REFS: Record<string, { cite: string; url: string }> = {
  gcvs: { cite: 'Samus N. N. et al. 2017, Astron. Rep. 61, 80 (General Catalogue of Variable Stars, VizieR B/gcvs)', url: 'https://cdsarc.cds.unistra.fr/viz-bin/cat/B/gcvs' },
  baron2012: { cite: 'Baron F. et al. 2012, ApJ 752, 20 (Tables 4–6)', url: doi('10.1088/0004-637X/752/1/20') },
  kolbas2015: { cite: 'Kolbas V. et al. 2015, MNRAS 451, 4150 (Table 5)', url: 'https://arxiv.org/abs/1506.01254' },
  jetsu2021: { cite: 'Jetsu L. 2021, ApJ 920, 137', url: 'https://arxiv.org/abs/2005.13360' },
  nardetto2016: { cite: 'Nardetto N. et al. 2016, A&A 593, A45', url: ads('2016A&A...593A..45N') },
  woodruff2004: { cite: 'Woodruff H. C. et al. 2004, A&A 421, 703', url: 'https://arxiv.org/abs/astro-ph/0404248' },
  martin2007: { cite: 'Martin D. C. et al. 2007, Nature 448, 780', url: doi('10.1038/nature06003') },
  harmanec1993: { cite: 'Harmanec P. & Scholz G. 1993, A&A 279, 131', url: ads('1993A&A...279..131H') },
  harmanec2002: { cite: 'Harmanec P. 2002, Astron. Nachr. 323, 87', url: ads('2002AN....323...87H') },
  bruntt2008: { cite: 'Bruntt H. et al. 2008, ApJ 683, 433', url: ads('2008ApJ...683..433B') },
  turner2005: { cite: 'Turner D. G. et al. 2005, PASP 117, 207', url: ads('2005PASP..117..207T') },
  atel13341: { cite: 'Guinan E., Wasatonic R. & Calderwood T. 2019, ATel 13341', url: 'https://www.astronomerstelegram.org/?read=13341' },
  atel13512: { cite: 'Guinan E. et al. 2020, ATel 13512', url: 'https://www.astronomerstelegram.org/?read=13512' },
  atel13601: { cite: 'Sigismondi C. 2020, ATel 13601', url: 'https://www.astronomerstelegram.org/?read=13601' },
  montarges2021: { cite: 'Montargès M. et al. 2021, Nature 594, 365', url: doi('10.1038/s41586-021-03546-8') },
};
