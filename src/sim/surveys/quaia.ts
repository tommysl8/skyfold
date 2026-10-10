/**
 * Quaia, the Gaia–unWISE quasar catalogue (Storey-Fisher et al. 2024, ApJ 964, 69; CC BY 4.0), as the galaxy surveys'
 * second set of tiles (public/data/survey-quaia/, built by scripts/build-quaia.mjs; docs/data/surveys.md §10): what
 * the build, the app and the tests share.
 *
 * Quaia covers the whole sky away from the Milky Way's plane, where DESI and the SDSS cover about a third of it, but its
 * redshifts come from Gaia's low-resolution spectra and unWISE colours, not from a spectrograph: their quoted errors
 * have a median of 4 % of 1 + z, about 190 Mpc along the line of sight at z = 1.5. So a Quaia quasar is drawn as a soft
 * streak along our line of sight, as long as its distance is uncertain (sigmaChiMpc, kept in one byte a quasar:
 * sigmaByte), and the least certain are drawn fainter (quaiaFade). Its direction is as sharp as Gaia's.
 *
 * Like format.ts and tile.ts this is imported by the build under Node, which strips the types itself: so it imports
 * only with file extensions and uses only erasable TypeScript.
 */
import { SkyIndex, SURVEY_MATCH_ARCSEC } from './match.ts';

/** Quaia's catalogue code in the kind byte (format.ts packKind; the surveys' own are 0–9). */
export const QUAIA_SOURCE = { code: 10, key: 'quaia', name: 'Quaia (Gaia–unWISE quasars)' } as const;

// ─── Gaia DR3's galaxies ────────────────────────────────────────────────────────────────

/**
 * The galaxies of Gaia DR3 with a redshift from their BP/RP spectra (docs/data/surveys.md §11), in Quaia's tiles beside
 * its quasars and drawn the same way, as streaks along the line of sight: the "purer" galaxy candidates of Gaia
 * Collaboration, Bailer-Jones et al. 2023 (A&A 674, A41, §9; about 95 % galaxies) that the Unresolved Galaxy
 * Classifier gave a redshift (Delchambre et al. 2023, A&A 674, A31), less those DESI, the SDSS or Quaia have. Like
 * Quaia's they cover the whole sky away from the Milky Way's plane, south of declination −20° too, but only to z = 0.6.
 */
export const GAIA_GALAXY_SOURCE = { code: 11, key: 'gaia-galaxies', name: 'Gaia DR3 galaxies (redshifts from BP/RP spectra)' } as const;

/**
 * The redshifts kept: the classifier predicts 0 to 0.6, and the Gaia DR3 data model (its galaxy_candidates table)
 * says its performance is particularly low below 0.02, between 0.28 and 0.30 and above 0.58, and that the
 * interval 0.070–0.071 holds several thousand bright galaxies whose redshifts are probably below 0.04: those are left out.
 */
export const GAIA_UGC_Z_RANGE: readonly [number, number] = [0.02, 0.58];
export const GAIA_UGC_Z_BAD: readonly (readonly [number, number])[] = [
  [0.07, 0.071],
  [0.28, 0.3],
];
export function gaiaRedshiftKept(z: number): boolean {
  if (!(z >= GAIA_UGC_Z_RANGE[0] && z <= GAIA_UGC_Z_RANGE[1])) return false;
  for (const [a, b] of GAIA_UGC_Z_BAD) if (z >= a && z < b) return false;
  return true;
}

/**
 * A Gaia redshift's 1σ error: half its quoted prediction interval (redshift_ugc_upper − redshift_ugc_lower), the
 * estimate the Gaia DR3 documentation gives; the interval is the training set's mean error and scatter in the
 * redshift's bin of 0.02 (typically ±0.03).
 */
export const gaiaSigmaZ = (lower: number, upper: number): number => 0.5 * (upper - lower);

/**
 * log10 L/L* of a Gaia galaxy, as the survey's (scripts/build-surveys.mjs): M = G − DM + 2.5 log10(1 + z), the
 * bandwidth term of the K-correction only, against M*_r = −21.2, with Gaia's G standing in for r (for a galaxy G − r is
 * a few tenths: smaller than the error of G itself, which Gaia measures in a window of a few arcseconds and so misses
 * the outer light of a large galaxy). `chiMpc` its comoving distance: DM = 5 log10((1 + z) χ / 10 pc).
 */
export function gaiaLogL(gMag: number, z: number, chiMpc: number, mStar = -21.2): number {
  const dm = 5 * Math.log10(((1 + z) * chiMpc * 1e6) / 10);
  const m = gMag - dm + 2.5 * Math.log10(1 + z);
  return -0.4 * (m - mStar);
}
/** Extra bytes each Quaia point has in its tiles (format.ts NODE_EXTRA_AT): its distance error's code. */
export const QUAIA_EXTRA_PER = 1;

// ─── The distance error ─────────────────────────────────────────────────────────────────

/**
 * A quasar's distance error, comoving Mpc along the line of sight: half the comoving distance between z − σz and
 * z + σz (σz its quoted 1σ redshift error), with `chiOf` the app's cosmology. Half the span rather than the slope at z,
 * since an error of a few tenths in z is not small: the span is the distance the redshift's 1σ range covers.
 */
export function sigmaChiMpc(z: number, zErr: number, chiOf: (z: number) => number): number {
  return 0.5 * (chiOf(z + zErr) - chiOf(Math.max(0, z - zErr)));
}

/** The error is kept in a byte, log-coded: 2^(SIGMA_LOG2_MIN + b / SIGMA_STEPS_PER_OCTAVE) Mpc, 4 to 6,200 Mpc in steps of 2.9 %. */
export const SIGMA_LOG2_MIN = 2;
export const SIGMA_STEPS_PER_OCTAVE = 24;
export const sigmaByte = (sigmaMpc: number): number =>
  Math.max(0, Math.min(255, Math.round((Math.log2(Math.max(sigmaMpc, 1e-6)) - SIGMA_LOG2_MIN) * SIGMA_STEPS_PER_OCTAVE)));
export const sigmaOfByte = (b: number): number => 2 ** (SIGMA_LOG2_MIN + b / SIGMA_STEPS_PER_OCTAVE);

/**
 * The quasars with the largest errors are drawn fainter, down to QUAIA_FADE_MIN of their light: fully from the
 * catalogue's median error (about 190 Mpc) to QUAIA_FADE_MPC[0], fading to the floor by QUAIA_FADE_MPC[1], which a
 * tenth of them pass (often a wrong line identification, with the redshift off by more than 0.2 in 1 + z). Twin of the
 * shader's quaiaFade (shaders/quaiaStreak.vert.glsl, from the uniforms materials.ts sets from these).
 */
export const QUAIA_FADE_MPC: readonly [number, number] = [300, 1000];
export const QUAIA_FADE_MIN = 0.15;
export function quaiaFade(sigmaMpc: number): number {
  const t = Math.min(1, Math.max(0, (sigmaMpc - QUAIA_FADE_MPC[0]) / (QUAIA_FADE_MPC[1] - QUAIA_FADE_MPC[0])));
  return 1 - (1 - QUAIA_FADE_MIN) * t * t * (3 - 2 * t);
}

// ─── The streak ─────────────────────────────────────────────────────────────────────────

/**
 * Where a streak's profile is cut, in its σ along it and across it. Its pixels are what a streak costs the GPU (its
 * vertices cost less than the survey points it replaces): at 1.5σ each way a streak is a line about two device pixels
 * wide running over its quasar's ±1σ distances, soft at the ends, and holds 87 % of a profile cut further out.
 */
export const STREAK_CUT_ALONG = 1.5;
export const STREAK_CUT_ACROSS = 1.5;
/**
 * A streak's light grows with its length, as (σ along / σ across)^STREAK_LENGTH_GAIN, where with the point's light
 * spread along it a streak 100 times a point's width would be a hundredth as bright and none would show from
 * gigaparsecs out: a map's choice, as the survey's own floor on the expansion's dimming. Its brightness along it still
 * falls as its length grows (as the power 1 − STREAK_LENGTH_GAIN), so a quasar whose distance is least known is the
 * faintest line.
 */
export const STREAK_LENGTH_GAIN = 0.65;
/**
 * A streak whose half length on the screen passes STREAK_LONG_PX[0] (CSS px) fades out by STREAK_LONG_PX[1]: a quasar
 * whose likely distances run across a large part of the view (near the camera, or with the largest errors) says
 * little of where it is, and such lines, crossing the view, were most of what showed and most of what the streaks cost.
 */
export const STREAK_LONG_PX: readonly [number, number] = [30, 90];

/** ∫ from −c to c of (e^(−t²/2) − e^(−c²/2)) dt: the light of a profile cut at c σ, per unit σ and unit peak. */
export function cutGaussianIntegral(c: number): number {
  return Math.sqrt(2 * Math.PI) * erf(c / Math.SQRT2) - 2 * c * Math.exp(-0.5 * c * c);
}

/** The error function (Abramowitz & Stegun 7.1.26, within 1.5 × 10⁻⁷): the shader's twin uses the same. */
export function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/**
 * A streak whose peak alpha would be below this is not drawn: too faint to show anywhere along it (a long streak's
 * light is spread thin), and the fill it would cost is the streaks' largest.
 */
export const STREAK_MIN_ALPHA = 1e-3;

/** What a streak looks like on the screen (device px), and its peak alpha per unit of light (alpha × px² of a point). */
export interface StreakShape {
  /** σ of its profile along and across. */
  sigmaAlong: number;
  sigmaAcross: number;
  /** Half its drawn length and width (where the profile is cut). */
  halfLength: number;
  halfWidth: number;
  /** Its light over the point's (STREAK_LENGTH_GAIN). */
  gain: number;
  /** Peak alpha for one unit of the point's light. */
  peakPerLight: number;
}

/**
 * The shape of a quasar's streak (twin of shaders/quaiaStreak.vert.glsl): `halfPx` is half the on-screen length of
 * its ±1σ span along the line of sight (the two ends projected), `pointPx` the diameter of the point it would be
 * drawn as with an exact distance (render/shaders/galaxyMap.glsl mapSizePx). A point's light is a Gaussian of σ
 * pointPx / 6 (materials.ts COSMIC_WEB_FRAG); the streak is that point smeared along the line of sight by a Gaussian
 * of σ halfPx: across it the point's profile, along it the two widths added in quadrature. So a quasar seen end on, or
 * with a small error, is drawn as the point it would be; a longer streak holds more light (gain), less per pixel.
 */
export function streakShape(halfPx: number, pointPx: number): StreakShape {
  const sigmaAcross = pointPx / 6;
  const sigmaAlong = Math.hypot(halfPx, sigmaAcross);
  // Cut at STREAK_CUT_ALONG of its σ, but never shorter than a point (3σ of the point's width).
  const halfLength = Math.max(STREAK_CUT_ALONG * sigmaAlong, STREAK_CUT_ACROSS * sigmaAcross);
  const halfWidth = STREAK_CUT_ACROSS * sigmaAcross;
  const along = sigmaAlong * cutGaussianIntegral(halfLength / sigmaAlong);
  const across = sigmaAcross * cutGaussianIntegral(STREAK_CUT_ACROSS);
  const gain = (sigmaAlong / sigmaAcross) ** STREAK_LENGTH_GAIN;
  return { sigmaAlong, sigmaAcross, halfLength, halfWidth, gain, peakPerLight: gain / (along * across) };
}

/** The typical distance error, comoving Mpc (the median of those kept is 206 Mpc): for what a node's streaks cost. */
export const QUAIA_TYPICAL_SIGMA_MPC = 200;

/**
 * What a quasar of a node seen `dMpc` away (proper; `pxPerRad` device px a radian) costs against the point budget, in
 * survey points: the pixels of its streak (the typical error, across the line of sight on average: 2/π of it) over a
 * point's (pointPx across), at least 1. Its fill is what a streak costs the GPU (the vertices cost less than a point's).
 */
export function streakCost(dMpc: number, pxPerRad: number, pointPx: number, pixelRatio: number, a = 1): number {
  const halfPx = ((2 / Math.PI) * a * QUAIA_TYPICAL_SIGMA_MPC * pxPerRad) / Math.max(dMpc, 1e-6);
  // Those too long to draw (STREAK_LONG_PX) cost only their vertices, less than a point's.
  if (halfPx >= STREAK_LONG_PX[1] * pixelRatio) return 0.5;
  const s = streakShape(halfPx, pointPx);
  return Math.max(1, (4 * s.halfLength * s.halfWidth) / (pointPx * pointPx));
}

/**
 * Quaia's share of the point budget at most (its streaks counted at streakCost): the rest, and whatever Quaia does not
 * use, is the survey's. The two are not chosen by one law (lod.ts selectNodesOf can): Quaia's quasars are sparse and
 * their streaks costly, and by one law they took two thirds of the budget from 2 Gpc out, leaving the survey's own
 * map a third of its points. A quarter left the two thirds of the sky the surveys did not see thin from gigaparsecs
 * out (about 3,000 streaks against 150,000 points, at the 9.4-billion-light-year view home); with Gaia's galaxies in
 * these tiles too, 0.4 (about 5,000 against 120,000).
 */
export const QUAIA_BUDGET_SHARE = 0.4;

// ─── Duplicates ─────────────────────────────────────────────────────────────────────────

/**
 * Which Quaia quasars the spectroscopic surveys already have. Each catalogue of `sets` (in the survey's order of
 * priority) is indexed on the sky, and a Quaia quasar within `radiusArcsec` of an entry of one is the same object
 * (Gaia's positions are good to milliarcseconds, DESI's and the SDSS's to a tenth of an arcsecond; the build measures
 * how often an unrelated entry is that close by matching the quasars again 30″ away): it is left out, its spectroscopic
 * redshift (in the survey's tiles) wins. Returns for each quasar the first set that has it, or −1.
 */
export function matchQuaia(
  quaia: { ra: ArrayLike<number>; dec: ArrayLike<number>; count: number },
  sets: readonly { ra: ArrayLike<number>; dec: ArrayLike<number>; count: number }[],
  radiusArcsec = SURVEY_MATCH_ARCSEC,
): Int16Array {
  const out = new Int16Array(quaia.count).fill(-1);
  sets.forEach((s, k) => {
    const ix = new SkyIndex(s.ra, s.dec, radiusArcsec, s.count);
    for (let i = 0; i < quaia.count; i++) if (out[i] < 0 && ix.nearest(quaia.ra[i], quaia.dec[i]) >= 0) out[i] = k;
  });
  return out;
}
