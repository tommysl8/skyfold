/**
 * GW170817 and its kilonova AT 2017gfo (docs/data/phenomena.md §2): two neutron stars spiralling together in NGC 4993,
 * heard by LIGO and Virgo on 17 August 2017, and the glow of the debris thrown out, seen for weeks.
 *
 *  - The merger: 12:41:04.4 UTC on 17 August 2017 as the waves reached Earth (Abbott et al. 2017, PRL 119, 161101).
 *    Masses (low-spin prior, source frame): 1.46 and 1.27 M☉ (GWTC-1: Abbott et al. 2019, PRX 9, 011001, as the
 *    deep-sky catalogue has them), chirp mass 1.1975 M☉ as observed ("detector frame") and 1.186 M☉ in the source's own;
 *    redshift 0.0099. The inspiral follows the quadrupole chirp (chirp.ts) until the stars touch.
 *  - The kilonova: blackbody fits to its light from Waxman et al. 2018 (MNRAS 481, 3423, table B2): temperature,
 *    luminosity and photospheric radius from 0.5 to 10.5 days; beyond, L ∝ t^−2.8 (their table 1). Its V-band brightness
 *    is that blackbody's (vMagnitudeOf), which gives M_V ≈ −16 at half a day, as measured (−16.04 ± 0.23, Drout et al.
 *    2017, Science 358, 1570). Blue then red: 10,300 K at half a day, 3,750 K at 2.5 days, about 2,500–3,000 K after a
 *    week, as its r-process elements (the lanthanides) made the debris opaque to blue light.
 *  - Its debris (a model, Kasen et al. 2017, Nature 551, 80; Villar et al. 2017): a fast, lanthanide-poor "blue"
 *    component (about 0.02 M☉ at 0.27c, thrown towards the poles) and a slower, lanthanide-rich "red" one (about 0.04 M☉
 *    at 0.1–0.15c, near the orbit's plane). One component of about 0.05 M☉ from 0.1c to over 0.3c fits too (Waxman
 *    et al. 2018): the two-component picture is a modelling choice, and the cards say so. The model is drawn while it
 *    glows: its light, last measured at 74 days (Spitzer: Kasliwal et al. 2022, MNRAS 510, L7), is extrapolated as
 *    L ∝ t^−2.8 and is a ten-millionth of its peak after three years; the model fades out over its second and third
 *    years and is not drawn after (KN_DRAWN_DAYS), its debris's size held there. What follows is not drawn: the debris
 *    coasts until it has swept up its own mass of the thin gas round it, decades on, and then slows into a faint remnant.
 *  - What was left: most likely a black hole after a brief hypermassive neutron star (Margalit & Metzger 2017, ApJL 850,
 *    L19); not observed directly.
 *
 * Pure functions; tests in kilonova.test.ts.
 */
import { C_KM_S, PARSEC_KM, SUN_LUMINOSITY_W } from '../../physics/constants';
import { logPlanck } from '../../physics/blackbody';
import { chirpMass, gwFrequencyHz, gwPhase, separationKm } from './chirp';
import { interpolate, segmentOf } from './lightCurve';

const DAY_S = 86_400;

/** The waves reached Earth at 12:41:04.4 UTC on 17 August 2017 (Unix ms; GPS time 1187008882.4, as the catalogue has it). */
export const MERGER_MS = Date.UTC(2017, 7, 17, 12, 41, 4, 400);
/** Source-frame masses, M☉ (GWTC-1, low-spin prior: medians). */
export const M1_MSUN = 1.46;
export const M2_MSUN = 1.27;
/** The chirp mass as observed (detector frame), M☉ (Abbott et al. 2019, table II, low spin). */
export const MC_DETECTOR_MSUN = 1.1975;
/** Redshift (GWTC-1). */
export const Z_GW170817 = 0.0099;
/** A neutron star's radius, km (NICER: about 12 km). */
export const NS_RADIUS_KM = 12;
/** The gamma-ray burst GRB 170817A arrived 1.74 ± 0.05 s after the merger (Abbott et al. 2017, ApJL 848, L13). */
export const GRB_DELAY_S = 1.74;
/** The angle between our line of sight and the orbit's axis, θ_JN = 151° (+15 −11) with the host's distance (Abbott et al. 2019): seen 29° from its south pole. */
export const THETA_JN_DEG = 151;

/** Kilonova AT 2017gfo: blackbody fits (Waxman et al. 2018 table B2): days after the merger, L_bb (erg/s), T (K), R (cm). */
export const KN_DAYS = [0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 10.5] as const;
export const KN_L_ERG_S = [1.2e42, 1.3e42, 7.0e41, 5.5e41, 4.8e41, 3.6e41, 2.3e41, 1.7e41, 1.4e41, 1.0e41, 9.1e40, 7.0e40, 4.5e40, 2.0e40] as const;
export const KN_T_K = [10266, 10809, 7093, 6351, 5707, 4967, 3751, 3160, 2836, 2951, 2505, 2452, 2848, 2963] as const;
export const KN_R_CM = [3.7e14, 3.6e14, 6.0e14, 6.7e14, 7.6e14, 8.9e14, 1.2e15, 1.5e15, 1.7e15, 1.3e15, 1.7e15, 1.6e15, 9.5e14, 5.8e14] as const;
/** After the last fit, L ∝ t^−2.8 (Waxman et al. 2018 table 1, beyond 6.2 days). */
export const KN_LATE_SLOPE = -2.8;
/** Distance: the host's, 40.7 Mpc (Cantiello et al. 2018, as Abbott et al. 2019's prior); the catalogue's waves give 40 Mpc. */
export const KN_DISTANCE_PC = 40.7e6;

/** The model is drawn until this many days after the merger, fading out from the first (its glow is then 10⁻⁷ of its peak). */
export const KN_DRAWN_DAYS: readonly [number, number] = [365.25, 3 * 365.25];

/** The ejecta's components (a model): speed of their outer edge, as a fraction of c. */
export const BLUE_BETA = 0.27;
export const RED_BETA = 0.13;

/** Source-frame chirp mass, M☉. */
export const MC_SOURCE_MSUN = chirpMass(M1_MSUN, M2_MSUN);

export interface Inspiral {
  /** Seconds to the merger as seen from Earth (≤ 0 after it). */
  tauS: number;
  /** The waves' frequency as received, Hz. */
  fHz: number;
  /** The two stars' separation, km (in their own frame), and each one's distance from their centre of mass. */
  separationKm: number;
  r1Km: number;
  r2Km: number;
  /** The orbit's phase, radians (half the waves' phase; 0 at coalescence). */
  orbitPhase: number;
  /** The stars have touched (separation under two radii): the merger. */
  merged: boolean;
}

/** The inspiral at `ms`. Before about a day out the separation is still under 3,000 km; any earlier is drawn the same way. */
export function inspiralAt(ms: number, out?: Inspiral): Inspiral {
  const o = out ?? { tauS: 0, fHz: 0, separationKm: 0, r1Km: 0, r2Km: 0, orbitPhase: 0, merged: false };
  const tau = (MERGER_MS - ms) / 1000;
  o.tauS = tau;
  o.fHz = gwFrequencyHz(tau, MC_DETECTOR_MSUN);
  const mTot = M1_MSUN + M2_MSUN;
  // The source's own frequency is (1 + z) times the received one.
  const a = tau > 0 ? separationKm(o.fHz * (1 + Z_GW170817), mTot) : 0;
  o.merged = !(a > 2 * NS_RADIUS_KM);
  o.separationKm = o.merged ? 0 : a;
  o.r1Km = (o.separationKm * M2_MSUN) / mTot;
  o.r2Km = (o.separationKm * M1_MSUN) / mTot;
  o.orbitPhase = 0.5 * gwPhase(tau, MC_DETECTOR_MSUN);
  return o;
}

// ─── The kilonova's light ─────────────────────────────────────────────────────────────

/** V-band (Bessell) transmission, approximated as a Gaussian at 545 nm of 85 nm FWHM, for blackbody fluxes. */
function vWeight(lambdaNm: number): number {
  const s = 85 / 2.3548;
  return Math.exp(-0.5 * ((lambdaNm - 545) / s) ** 2);
}

/** The share of a blackbody's light that falls in V, relative to the Sun's (a 5,772 K blackbody). */
export function vShareRelSun(teffK: number): number {
  const share = (T: number) => {
    let v = 0;
    for (let l = 400; l <= 700; l += 2) v += Math.exp(logPlanck(l * 1e-9, T)) * vWeight(l);
    // ∫B_λ dλ = σT⁴/π: in the same units, (C₁' T⁴) with the constant cancelling in the ratio below.
    return v / T ** 4;
  };
  return share(teffK) / share(5772);
}

/** The Sun's absolute V magnitude (Willmer 2018, ApJS 236, 47). */
const SUN_MV = 4.81;

/** Absolute V magnitude of a blackbody of luminosity L (erg/s) and temperature T. */
export function vMagnitudeOf(lErgS: number, teffK: number): number {
  const lSun = lErgS * 1e-7 / SUN_LUMINOSITY_W;
  return SUN_MV - 2.5 * Math.log10(lSun * vShareRelSun(teffK));
}

export interface KilonovaState {
  /** Days since the merger as seen from Earth (negative before). */
  days: number;
  lErgS: number;
  teffK: number;
  /** Absolute V magnitude, and apparent from Earth. */
  absV: number;
  vmag: number;
  /** Photospheric radius (fitted), and the blue and red components' outer edges, km (held from KN_DRAWN_DAYS's end). */
  photosphereKm: number;
  blueKm: number;
  redKm: number;
  /** How much of the model is drawn: 1, fading out over KN_DRAWN_DAYS. */
  shown: number;
}

/** The kilonova at `ms`: L, T and the photosphere interpolated in ln between the fits (held before the first, the late law after). */
export function kilonovaAt(ms: number, out?: KilonovaState): KilonovaState {
  const o = out ?? { days: 0, lErgS: 0, teffK: 0, absV: 99, vmag: 99, photosphereKm: 0, blueKm: 0, redKm: 0, shown: 1 };
  const d = (ms - MERGER_MS) / (DAY_S * 1000);
  o.days = d;
  const f = Math.min(1, Math.max(0, (d - KN_DRAWN_DAYS[0]) / (KN_DRAWN_DAYS[1] - KN_DRAWN_DAYS[0])));
  o.shown = 1 - f * f * (3 - 2 * f);
  const ts = Math.min(d, KN_DRAWN_DAYS[1]) * DAY_S;
  o.blueKm = d > 0 ? BLUE_BETA * C_KM_S * ts : 0;
  o.redKm = d > 0 ? RED_BETA * C_KM_S * ts : 0;
  if (!(d > 0)) {
    o.lErgS = 0;
    o.teffK = 0;
    o.absV = 99;
    o.vmag = 99;
    o.photosphereKm = 0;
    return o;
  }
  const n = KN_DAYS.length;
  if (d <= KN_DAYS[0]) {
    // Before the first fit (nobody saw it then): as at half a day, rising over the first hours, and smaller.
    const rise = Math.min(1, d / KN_DAYS[0]);
    o.lErgS = KN_L_ERG_S[0] * rise;
    o.teffK = KN_T_K[0];
    o.photosphereKm = (KN_R_CM[0] / 1e5) * (d / KN_DAYS[0]);
  } else if (d >= KN_DAYS[n - 1]) {
    o.lErgS = KN_L_ERG_S[n - 1] * (d / KN_DAYS[n - 1]) ** KN_LATE_SLOPE;
    o.teffK = KN_T_K[n - 1];
    o.photosphereKm = KN_R_CM[n - 1] / 1e5;
  } else {
    const i = segmentOf(KN_DAYS, d);
    const t = Math.log(d / KN_DAYS[i]) / Math.log(KN_DAYS[i + 1] / KN_DAYS[i]);
    const ln = (a: readonly number[]) => Math.exp(Math.log(a[i]) + t * (Math.log(a[i + 1]) - Math.log(a[i])));
    o.lErgS = ln(KN_L_ERG_S);
    o.teffK = ln(KN_T_K);
    o.photosphereKm = ln(KN_R_CM) / 1e5;
  }
  o.absV = vMagnitudeOf(o.lErgS, o.teffK);
  o.vmag = o.absV + 5 * Math.log10(KN_DISTANCE_PC / 10);
  return o;
}

/** Peak temperature-to-day lookups for the tests and the card. */
export const knTemperatureAt = (days: number): number => interpolate(KN_DAYS, KN_T_K, days);

/** The kilonova's V luminosity in the app's units (V flux at 1 km times km²), for its glow: L_V = F_V d². */
export function vLuminosityUnits(absV: number): number {
  // A source of absolute magnitude M at 10 pc has flux 10^(−0.4 M) (V = 0 units).
  const d10 = 10 * PARSEC_KM;
  return 10 ** (-0.4 * absV) * d10 * d10;
}
