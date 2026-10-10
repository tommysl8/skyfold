/**
 * Single-star evolution from analytic formulae: Hurley, Pols & Tout 2000 (MNRAS 315, 543; "HPT" below), with the
 * zero-age main sequence of Tout, Pols, Eggleton & Han 1996 (MNRAS 281, 257). Luminosity, radius and core mass against
 * age for any initial mass 0.1–100 M☉, from the zero-age main sequence (ZAMS) through the Hertzsprung gap (HG), the
 * first giant branch (GB), core helium burning (CHeB), the early and thermally pulsing asymptotic giant branch (EAGB,
 * TPAGB) to a white dwarf, with mass loss as HPT §7.1 prescribes (Reimers' law with η = 0.5 on the GB and beyond,
 * Vassiliadis & Wood 1993 on the AGB, Nieuwenhuijzen & de Jager 1990 above 4,000 L☉, Wolf–Rayet-like and LBV-like
 * winds). Implemented here from the papers' equations (numbered as in HPT) and the coefficients of HPT's Appendix and
 * Tout et al.'s Tables 1–2, evaluated at Z = 0.02 (ζ = log(Z/0.02) = 0, so each coefficient is its table's first column,
 * then the Appendix's clamps); docs/data/stars.md §14. Units: M☉, L☉, R☉, Myr.
 *
 * Left out: naked helium stars (a star stripped to its core before the AGB, HPT §6.1, is ended there), main-sequence and
 * Hertzsprung-gap winds (HPT's M0 = Mt re-ageing; negligible for the Sun), neutron stars and black holes (a supernova ends
 * the track), rotation. The small-envelope perturbation (HPT §6.3) is applied on the AGB, where it carries the star across
 * to the white dwarf. One reading: eq. (21) as printed has no '+' in its denominator; it is read as a59 + M^a61, like
 * every other rational fit of the paper (a single power law would not need four coefficients).
 */

const Z = 0.02;
/** log10 Z. */
const SIGMA = Math.log10(Z);
const LOG = Math.log10;
const pow = Math.pow;

// ─── Coefficients at Z = 0.02 (HPT Appendix; the first column, ζ = 0, then the Appendix's clamps) ─────────────────

const a14 = 3.858911e3;
const a20 = 2.652091e1;
const a32 = 6.682518;
const a: number[] = [];
a[1] = 1.59389e3;
a[2] = 2.706708e3;
a[3] = 1.466143e2;
a[4] = 4.14196e-2;
a[5] = 3.426349e-1;
a[6] = 1.949814e1;
a[7] = 4.90383;
a[8] = 5.212154e-2;
a[9] = 1.312179;
a[10] = 8.073972e-1;
a[11] = 1.031538 * a14;
a[12] = 1.043715 * a14;
a[13] = 7.859573e2;
a[14] = a14;
a[15] = 2.88872e2;
a[16] = 7.19658;
// log a17 = max(0.097 − 0.1072(σ+3), max(0.097, min(0.1461, 0.1461 + 0.1237(σ+2)))).
a[17] = pow(10, Math.max(0.097 - 0.1072 * (SIGMA + 3), Math.max(0.097, Math.min(0.1461, 0.1461 + 0.1237 * (SIGMA + 2)))));
a[18] = 2.187715e-1 * a20;
a[19] = 1.46644 * a20;
a[20] = a20;
a[21] = 1.472103;
a[22] = 3.071048;
a[23] = 2.61789;
a[24] = 1.075567e-2;
a[25] = 1.476246;
a[26] = 5.502535;
a[27] = 9.511033e1;
a[28] = 3.113458e1;
a[29] = pow(1.413057, a32);
a[30] = 3.910862e1;
a[31] = 4.597479;
a[32] = a32;
a[33] = Math.max(0.6355, Math.max(1.25, Math.min(1.4, 1.5135)));
a[34] = 1.910302e-1;
a[35] = 3.931056e-1;
a[36] = 3.267776e-1;
a[37] = 5.990212e-1;
a[38] = 7.330122e-1;
a[39] = 1.172768;
a[40] = 3.982622e-1;
a[41] = 3.571038;
a[42] = Math.min(1.25, Math.max(1.1, 1.9848));
a[43] = 6.3e-2;
a[44] = Math.min(1.3, Math.max(0.45, 1.2));
a[45] = 2.3214e-1;
a[46] = 1.163659e-2;
a[47] = 1.04802e-2;
a[48] = 1.55559;
a[49] = Math.max(9.77e-2, 0.145);
a[50] = Math.min(2.4e-1, 0.306);
a[51] = Math.min(3.3e-1, 0.3625);
a[52] = Math.min(Math.max(1.1064, 0.9), 1.0); // Z > 0.01
a[53] = Math.min(Math.max(1.19, 1.0), 1.1); // Z > 0.01
a[54] = 3.855707e-1;
a[55] = 3.579064e-1;
a[56] = 9.587587e-1;
a[57] = Math.max(0.6355, Math.max(1.25, Math.min(1.4, 1.5135)));
a[58] = 4.907546e-1;
a[59] = 4.53707;
a[60] = 1.79622;
a[61] = 2.256216;
a[62] = Math.max(0.065, 8.43e-2);
a[63] = 7.36e-2;
a[64] = Math.max(0.091, Math.min(0.121, 1.36e-1));
a[65] = 1.564231e-3;
a[66] = Math.max(0.8, Math.min(0.8, Math.max(1.477, Math.min(1.6, -0.308))));
a[67] = 5.210157;
a[68] = Math.max(0.9, Math.min(1.116, 1.0));
a[69] = 1.071489;
a[70] = 7.108492e-1;
a[71] = 3.478514;
a[72] = Math.max(9.132108e-1, 0.95); // Z > 0.01
a[73] = 3.969331e-3;
a[74] = Math.max(1.4, Math.min(1.6, 1.6));
a[75] = Math.max(Math.max(1.0, Math.min(8.109e-1, 1.27)), 0.6355);
a[76] = Math.max(1.192334e-2, -0.1015564);
a[77] = Math.max(-0.3868776, Math.min(0.0, -1.668868e-1));
a[78] = Math.max(0.0, Math.min(7.615495e-1, 7.454));
a[79] = Math.min(9.409838, Math.max(2.0, -13.3));
a[80] = Math.max(0.0585542, -2.711e-1);
a[81] = Math.min(1.5, Math.max(0.4, 2.493));
// a64 = αR(M = a66) when a68 > a66, then a68 = min(a68, a66) (below, once αR's middle branch exists).
const alphaR21 = (m: number) => (a[58] * pow(m, a[60])) / (a[59] + pow(m, a[61]));
if (a[68] > a[66]) a[64] = alphaR21(a[66]);
a[68] = Math.min(a[68], a[66]);

const b: number[] = [];
b[1] = Math.min(0.54, 3.97e-1);
b[2] = Math.min(Math.max(pow(10, -4.6739 - 0.9394 * SIGMA), -0.04167 + 55.67 * Z), 0.4771 - 9329.21 * pow(Z, 2.94));
b[3] = Math.max(pow(10, Math.max(-0.1451, -2.2794 - 1.5175 * SIGMA - 0.254 * SIGMA * SIGMA)), 0.7307 + 14265.1 * pow(Z, 3.395)); // Z > 0.004
b[4] = 9.960283e-1;
b[5] = 2.561062e-1;
b[6] = 1.157338;
b[7] = 4.022765e-1;
b[9] = 2.751631e3;
b[10] = -3.820831e-2;
b[11] = pow(1.071738e2, 2);
b[12] = 7.348793e2;
b[13] = pow(9.219293, 2);
b[15] = 3.629118;
b[14] = pow(2.917412, b[15]);
b[16] = pow(4.916389, b[15]);
b[17] = 1.0 - 0.3880523 * pow(0 + 1.0, 2.862149); // ζ > −1
b[18] = 5.496045e1;
b[19] = 1.832694;
b[20] = 1.211104e2;
b[21] = 2.214088e2;
b[22] = 2.063983;
b[23] = 2.00316;
b[28] = 3.518506;
b[24] = pow(1.609901e1, b[28]);
b[25] = 1.7475e-1;
b[26] = 5.0 - 0.09138012 * pow(Z, -0.3671407);
b[27] = pow(2.752869, 2 * b[28]);
b[29] = 1.626062e2;
b[30] = 3.336833e-1;
b[33] = 2.474401;
b[31] = pow(7.425137e1, b[33]);
b[32] = 9.268325e2;
b[34] = pow(1.127018e1, b[33]);
b[36] = pow(1.445216e-1, 4);
b[37] = 4.0 * 1.304129;
b[38] = pow(5.114149e-1, 4);
b[39] = 1.314955e2;
b[40] = Math.max(1.823973e1, 1.0);
b[42] = 1.997378;
b[41] = pow(2.327037, b[42]);
b[43] = 1.079113e-1;
b[44] = pow(2.327409, 5);
const RHO = 0 + 1.0;
b[45] = RHO <= 0 ? 1.0 : 1.0 - (2.47162 * RHO - 5.401682 * RHO * RHO + 3.247361 * RHO * RHO * RHO);
b[48] = 5.072525;
b[49] = 5.13974;
b[47] = 1.127733 * RHO + 0.2344416 * RHO * RHO - 0.3793726 * RHO * RHO * RHO;
b[51] = 1.125124;
b[52] = 3.349489e-1;
b[53] = 1.467794;
b[54] = 4.658512e-1;
b[55] = Math.min(0.99164 - 743.123 * pow(Z, 2.83), 1.0422);
b[56] = 1.110866;
b[57] = -1.584333e-1;

// ─── Critical masses (eqs. 1–3) ──────────────────────────────────────────────────────────

/** Initial mass above which the main sequence has a hook, below which He ignites in a flash, and below which there is a GB. */
export const M_HOOK = 1.0185;
export const M_HEF = 1.995;
export const M_FGB = (13.048 * pow(Z / 0.02, 0.06)) / (1 + 0.0012 * pow(0.02 / Z, 1.27));
b[46] = -1.0 * 2.214315 * LOG(M_HEF / M_FGB);

/** The Chandrasekhar mass HPT use, M☉. */
export const M_CH = 1.44;

// ─── The zero-age main sequence (Tout et al. 1996, eqs. 3–4, Tables 1–2, first columns) ─────────────────────────────

export function lZams(m: number): number {
  const [al, be, ga, de, ep, ze, et] = [0.3970417, 8.527626, 0.00025546, 5.432889, 5.563579, 0.7886606, 0.00586685];
  return (al * pow(m, 5.5) + be * pow(m, 11)) / (ga + pow(m, 3) + de * pow(m, 5) + ep * pow(m, 7) + ze * pow(m, 8) + et * pow(m, 9.5));
}

export function rZams(m: number): number {
  const [th, io, ka, la, mu, nu, xi, om, pi] = [1.715359, 6.597788, 10.08855, 1.012495, 0.07490166, 0.01077422, 3.082234, 17.84778, 0.00022582];
  return (th * pow(m, 2.5) + io * pow(m, 6.5) + ka * pow(m, 11) + la * pow(m, 19) + mu * pow(m, 19.5)) / (nu + xi * pow(m, 2) + om * pow(m, 8.5) + pow(m, 18.5) + pi * pow(m, 19.5));
}

// ─── Main sequence and Hertzsprung gap (§5.1) ───────────────────────────────────────────

/** Time to the base of the GB (or end of the HG), Myr: eq. (4). */
export const tBgb = (m: number): number => (a[1] + a[2] * pow(m, 4) + a[3] * pow(m, 5.5) + pow(m, 7)) / (a[4] * pow(m, 2) + a[5] * pow(m, 7));

/** Main-sequence lifetime and the hook's time, Myr: eqs. (5)–(7). */
export function tMs(m: number): { tMs: number; tHook: number } {
  const t = tBgb(m);
  const mu = Math.max(0.5, 1.0 - 0.01 * Math.max(a[6] / pow(m, a[7]), a[8] + a[9] / pow(m, a[10])));
  const x = Math.max(0.95, Math.min(0.95 - 0.03 * (0 + 0.30103), 0.99));
  const tHook = mu * t;
  return { tMs: Math.max(tHook, x * t), tHook };
}

/** Luminosity at the end of the MS: eq. (8). */
export const lTms = (m: number): number => (a[11] * pow(m, 3) + a[12] * pow(m, 4) + a[13] * pow(m, a[16] + 1.8)) / (a[14] + a[15] * pow(m, 5) + pow(m, a[16]));

/** Radius at the end of the MS: eqs. (9), (9a), joined linearly between a17 and a17 + 0.1. */
export function rTms(m: number): number {
  const r9 = (x: number) => (a[18] + a[19] * pow(x, a[21])) / (a[20] + pow(x, a[22]));
  const r9a = (x: number) => (-8.672073e-2 * pow(x, 3) + a[23] * pow(x, a[26]) + a[24] * pow(x, a[26] + 1.5)) / (a[25] + pow(x, 5));
  const mStar = a[17] + 0.1;
  let r: number;
  if (m <= a[17]) r = r9(m);
  else if (m >= mStar) r = r9a(m);
  else r = r9(a[17]) + ((r9a(mStar) - r9(a[17])) * (m - a[17])) / 0.1;
  if (m < 0.5) r = Math.max(r, 1.5 * rZams(m));
  return r;
}

/** Luminosity at the base of the GB: eq. (10). */
export const lBgb = (m: number): number => (a[27] * pow(m, a[31]) + a[28] * pow(m, 9.301992)) / (a[29] + a[30] * pow(m, 4.637345) + pow(m, a[32]));

/** The hook's luminosity and radius perturbations: eqs. (16)–(17). */
function deltaL(m: number): number {
  if (m <= M_HOOK) return 0;
  const hi = (x: number) => Math.min(a[34] / pow(x, a[35]), a[36] / pow(x, a[37]));
  if (m < a[33]) return hi(a[33]) * pow((m - M_HOOK) / (a[33] - M_HOOK), 0.4);
  return hi(m);
}

function deltaR(m: number): number {
  if (m <= M_HOOK) return 0;
  const hi = (x: number) => (a[38] + a[39] * pow(x, 3.5)) / (a[40] * pow(x, 3) + pow(x, a[41])) - 1.0;
  if (m <= a[42]) return a[43] * pow((m - M_HOOK) / (a[42] - M_HOOK), 0.5);
  if (m < 2.0) return a[43] + (hi(2.0) - a[43]) * pow((m - a[42]) / (2.0 - a[42]), a[44]);
  return hi(m);
}

/** The MS luminosity coefficients α_L, β_L: eqs. (19), (19a), (20). */
function alphaL(m: number): number {
  const hi = (x: number) => (a[45] + a[46] * pow(x, a[48])) / (pow(x, 0.4) + a[47] * pow(x, 1.9));
  if (m >= 2.0) return hi(m);
  if (m < 0.5) return a[49];
  if (m < 0.7) return a[49] + 5.0 * (0.3 - a[49]) * (m - 0.5);
  if (m < a[52]) return 0.3 + ((a[50] - 0.3) * (m - 0.7)) / (a[52] - 0.7);
  if (m < a[53]) return a[50] + ((a[51] - a[50]) * (m - a[52])) / (a[53] - a[52]);
  return a[51] + ((hi(2.0) - a[51]) * (m - a[53])) / (2.0 - a[53]);
}

function betaL(m: number): number {
  const base = (x: number) => Math.max(0.0, a[54] - a[55] * pow(x, a[56]));
  const bl = base(m);
  if (m > a[57] && bl > 0) {
    const B = base(a[57]);
    return Math.max(0.0, B - 10.0 * (m - a[57]) * B);
  }
  return bl;
}

/** The MS radius coefficients α_R, β_R, γ: eqs. (21), (21a), (22), (22a), (23). */
function alphaR(m: number): number {
  if (m >= a[66] && m <= a[67]) return alphaR21(m);
  if (m < 0.5) return a[62];
  if (m < 0.65) return a[62] + ((a[63] - a[62]) * (m - 0.5)) / 0.15;
  if (m < a[68]) return a[63] + ((a[64] - a[63]) * (m - 0.65)) / (a[68] - 0.65);
  if (m < a[66]) return a[64] + ((alphaR21(a[66]) - a[64]) * (m - a[68])) / (a[66] - a[68]);
  return alphaR21(a[67]) + a[65] * (m - a[67]);
}

function betaR(m: number): number {
  const mid = (x: number) => (a[69] * pow(x, 3.5)) / (a[70] + pow(x, a[71]));
  let br: number;
  if (m >= 2.0 && m <= 16.0) br = mid(m);
  else if (m <= 1.0) br = 1.06;
  else if (m < a[74]) br = 1.06 + ((a[72] - 1.06) * (m - 1.0)) / (a[74] - 1.06);
  else if (m < 2.0) br = a[72] + ((mid(2.0) - a[72]) * (m - a[74])) / (2.0 - a[74]);
  else br = mid(16.0) + a[73] * (m - 16.0);
  return br - 1.0;
}

function gammaR(m: number): number {
  if (m > a[75] + 0.1) return 0.0;
  const low = (x: number) => a[76] + a[77] * pow(x - a[78], a[79]);
  const B = low(1.0);
  let g: number;
  if (m <= 1.0) g = low(m);
  else if (m <= a[75]) g = B + (a[80] - B) * pow((m - 1.0) / (a[75] - 1.0), a[81]);
  else {
    const C = a[75] <= 1.0 ? B : a[80];
    g = C - 10.0 * (m - a[75]) * C;
  }
  return Math.max(0.0, g);
}

/** L and R on the MS at age t (Myr): eqs. (11)–(15), (24). */
export function msState(m: number, t: number): { l: number; r: number } {
  const { tMs: tm, tHook } = tMs(m);
  const tau = t / tm;
  const lz = lZams(m);
  const rz = rZams(m);
  const eps = 0.01;
  const tau1 = Math.min(1.0, t / tHook);
  const tau2 = Math.max(0.0, Math.min(1.0, (t - (1.0 - eps) * tHook) / (eps * tHook)));
  const aL = alphaL(m);
  const bL = betaL(m);
  const eta = 10;
  const logL = aL * tau + bL * pow(tau, eta) + (LOG(lTms(m) / lz) - aL - bL) * tau * tau - deltaL(m) * (tau1 * tau1 - tau2 * tau2);
  const aR = alphaR(m);
  const bR = betaR(m);
  const g = gammaR(m);
  const logR = aR * tau + bR * pow(tau, 10) + g * pow(tau, 40) + (LOG(rTms(m) / rz) - aR - bR - g) * pow(tau, 3) - deltaR(m) * (pow(tau1, 3) - pow(tau2, 3));
  let r = rz * pow(10, logR);
  // Degenerate low-mass MS stars (eq. 24), X = 0.76 − 3Z.
  if (m < 0.1) r = Math.max(r, 0.0258 * pow(1.0 + 0.76 - 3 * Z, 5 / 3) * pow(m, -1 / 3));
  return { l: lz * pow(10, logL), r };
}

// ─── The core mass–luminosity relation of giants (§5.2, eqs. 31–43) ─────────────────────

/** A_H′, the mass-dependent hydrogen rate constant, M☉ L☉⁻¹ Myr⁻¹. */
export const aH = (m: number): number => pow(10, Math.max(-4.8, Math.min(-5.7 + 0.8 * m, -4.1 + 0.14 * m)));
/** Helium burning's rate constant (eq. 68) and the combined one of the TPAGB (eq. 71). */
export const A_HE = 7.66e-5;
const aHHe = (m: number): number => (aH(m) * A_HE) / (aH(m) + A_HE);

export interface McL {
  p: number;
  q: number;
  B: number;
  D: number;
  /** Where the two power laws cross. */
  mx: number;
  lx: number;
}

/** The Mc–L relation's parameters for initial mass m (eq. 37 and the parameters after it). */
export function mcl(m: number): McL {
  const lerp = (lo: number, hi: number) => (m <= M_HEF ? lo : m >= 2.5 ? hi : lo + ((hi - lo) * (m - M_HEF)) / (2.5 - M_HEF));
  const p = lerp(6, 5);
  const q = lerp(3, 2);
  const B = Math.max(3e4, 500 + 1.75e4 * pow(m, 0.6));
  const d0 = 5.37;
  const logDhi = Math.max(-1.0, 0.975 * d0 - 0.18 * m, 0.5 * d0 - 0.06 * m);
  const D = pow(10, lerp(d0, logDhi));
  const mx = pow(B / D, 1 / (p - q));
  return { p, q, B, D, mx, lx: D * pow(mx, p) };
}

/** L from a core mass: eq. (37). */
export const lFromMc = (r: McL, mc: number): number => Math.min(r.B * pow(mc, r.q), r.D * pow(mc, r.p));
/** The core mass at a luminosity (the inverse of eq. 37). */
export const mcFromL = (r: McL, l: number): number => (l <= r.lx ? pow(l / r.D, 1 / r.p) : pow(l / r.B, 1 / r.q));

/** A core growing along the Mc–L relation from (t0, L0) at rate constant A: eqs. (39)–(43), (70), (72). */
export interface Growth {
  r: McL;
  A: number;
  t0: number;
  tinf1: number;
  tx: number;
  tinf2: number;
}

export function growth(r: McL, A: number, t0: number, l0: number): Growth {
  if (l0 > r.lx) {
    const tinf2 = t0 + (1 / ((r.q - 1) * A * r.B)) * pow(r.B / l0, (r.q - 1) / r.q);
    return { r, A, t0, tinf1: t0, tx: t0, tinf2 };
  }
  const tinf1 = t0 + (1 / ((r.p - 1) * A * r.D)) * pow(r.D / l0, (r.p - 1) / r.p);
  const tx = tinf1 - (tinf1 - t0) * pow(l0 / r.lx, (r.p - 1) / r.p);
  const tinf2 = tx + (1 / ((r.q - 1) * A * r.B)) * pow(r.B / r.lx, (r.q - 1) / r.q);
  return { r, A, t0, tinf1, tx, tinf2 };
}

/** The core mass at time t along a growth. */
export function mcAt(g: Growth, t: number): number {
  const { r, A } = g;
  if (g.tx > g.t0 && t <= g.tx) return pow((r.p - 1) * A * r.D * (g.tinf1 - t), 1 / (1 - r.p));
  return pow((r.q - 1) * A * r.B * (g.tinf2 - t), 1 / (1 - r.q));
}

/** The time a growth reaches luminosity L. */
export function timeAtL(g: Growth, l: number): number {
  const { r, A } = g;
  if (l <= r.lx && g.tx > g.t0) return g.tinf1 - (1 / ((r.p - 1) * A * r.D)) * pow(r.D / l, (r.p - 1) / r.p);
  return g.tinf2 - (1 / ((r.q - 1) * A * r.B)) * pow(r.B / l, (r.q - 1) / r.q);
}

/** Radius on the GB (eq. 46) and the AGB (eq. 74), for current mass m, luminosity l, initial mass m0 (for the AGB's form). */
export function rGb(m: number, l: number): number {
  const A = Math.min(b[4] * pow(m, -b[5]), b[6] * pow(m, -b[7]));
  return A * (pow(l, b[1]) + b[2] * pow(l, b[3]));
}

export function rAgb(m: number, l: number, m0 = m): number {
  const hi = { b50: b[55] * b[3], A: Math.min(b[51] * pow(m, -b[52]), b[53] * pow(m, -b[54])) };
  const lo = { b50: b[3], A: b[56] + b[57] * m };
  let b50: number;
  let A: number;
  if (m0 >= M_HEF) ({ b50, A } = hi);
  else if (m0 <= M_HEF - 0.2) ({ b50, A } = lo);
  else {
    const f = (m0 - (M_HEF - 0.2)) / 0.2;
    b50 = lo.b50 + (hi.b50 - lo.b50) * f;
    A = lo.A + (hi.A - lo.A) * f;
  }
  return A * (pow(l, b[1]) + b[2] * pow(l, b50));
}

// ─── Core helium burning (§5.3) and the naked-He-star functions it needs (§6.1) ────────────────────────────────────

/** The naked helium ZAMS and helium main-sequence lifetime (eqs. 77–79). */
export const lZHe = (m: number): number => (15262 * pow(m, 10.25)) / (pow(m, 9) + 29.54 * pow(m, 7.5) + 31.18 * pow(m, 6) + 0.0469);
export const rZHe = (m: number): number => (0.2391 * pow(m, 4.6)) / (pow(m, 4) + 0.162 * pow(m, 3) + 0.0065);
export const tHeMs = (m: number): number => (0.4129 + 18.81 * pow(m, 4) + 1.853 * pow(m, 6)) / pow(m, 6.5);

const lHeIIm = (m: number) => (b[11] + b[12] * pow(m, 3.8)) / (b[13] + m * m);
/** Luminosity at helium ignition: eq. (49). */
export function lHeI(m: number): number {
  if (m >= M_HEF) return lHeIIm(m);
  const alpha1 = (b[9] * pow(M_HEF, b[10]) - lHeIIm(M_HEF)) / lHeIIm(M_HEF);
  return (b[9] * pow(m, b[10])) / (1 + alpha1 * Math.exp(15 * (m - M_HEF)));
}

/** Minimum luminosity of CHeB for IM stars: eq. (51). */
export function lMinHe(m: number): number {
  const c = b[17] / pow(M_FGB, 0.1) + (b[16] * b[17] - b[14]) / pow(M_FGB, b[15] + 0.1);
  return (lHeI(m) * (b[14] + c * pow(m, b[15] + 0.1))) / (b[16] + pow(m, b[15]));
}

/** ZAHB luminosity and radius of a LM star of current mass m and core mass mc: eqs. (52)–(54). */
export function lZahb(m: number, mc: number): number {
  const mu = Math.min(1, Math.max(0, (m - mc) / (M_HEF - mc)));
  const lz = lZHe(mc);
  const lmin = lMinHe(M_HEF);
  const alpha2 = (b[18] + lz - lmin) / (lmin - lz);
  return lz + ((1 + b[20]) / (1 + b[20] * pow(mu, 1.6479))) * ((b[18] * pow(mu, b[19])) / (1 + alpha2 * Math.exp(15 * (m - M_HEF))));
}

export function rZahb(m: number, mc: number): number {
  const mu = Math.min(1, Math.max(0, (m - mc) / (M_HEF - mc)));
  const f = ((1.0 + b[21]) * pow(mu, b[22])) / (1.0 + b[21] * pow(mu, b[23]));
  return (1 - f) * rZHe(mc) + f * rGb(m, lZahb(m, mc));
}

/** Minimum radius of the blue loop: eq. (55) (and its continuation below M_HeF). */
const rMHeIm = (m: number) => (b[24] * m + pow(b[25] * m, b[26]) * pow(m, b[28])) / (b[27] + pow(m, b[28]));
export function rMHe(m: number, mc: number): number {
  if (m >= M_HEF) return rMHeIm(m);
  const mu = Math.min(1, Math.max(0, (m - mc) / (M_HEF - mc)));
  const lHef = lZahb(M_HEF, mc);
  return rGb(m, lZahb(m, mc)) * pow(rMHeIm(M_HEF) / rGb(M_HEF, lHef), mu);
}

/** Luminosity at the base of the AGB: eq. (56). */
const lBagbIm = (m: number) => (b[31] + b[32] * pow(m, b[33] + 1.8)) / (b[34] + pow(m, b[33]));
export function lBagb(m: number): number {
  if (m >= M_HEF) return lBagbIm(m);
  const alpha3 = (b[29] * pow(M_HEF, b[30]) - lBagbIm(M_HEF)) / lBagbIm(M_HEF);
  return (b[29] * pow(m, b[30])) / (1 + alpha3 * Math.exp(15 * (m - M_HEF)));
}

/** The CHeB lifetime: eq. (57). */
const tHeIm = (m: number) => (tBgb(m) * (b[41] * pow(m, b[42]) + b[43] * pow(m, 5))) / (b[44] + pow(m, 5));
export function tHe(m: number, mc: number): number {
  if (m >= M_HEF) return tHeIm(m);
  const mu = Math.min(1, Math.max(0, (m - mc) / (M_HEF - mc)));
  const alpha4 = (tHeIm(M_HEF) - b[39]) / b[39];
  return (b[39] + (tHeMs(mc) - b[39]) * pow(1 - mu, b[40])) * (1 + alpha4 * Math.exp(15 * (m - M_HEF)));
}

/** The core mass at the BAGB (eq. 66), at the BGB (eq. 44) and at He ignition (§5.3). */
export const mcBagb = (m: number): number => pow(b[36] * pow(m, b[37]) + b[38], 0.25);
const C1 = 9.20925e-5;
const C2 = 5.402216;
function mcNonDegenerate(m: number, lAtHeF: number): number {
  const C = pow(mcFromL(mcl(M_HEF), lAtHeF), 4) - C1 * pow(M_HEF, C2);
  return Math.min(0.95 * mcBagb(m), pow(C + C1 * pow(m, C2), 0.25));
}
export const mcBgb = (m: number): number => (m < M_HEF ? mcFromL(mcl(m), lBgb(m)) : mcNonDegenerate(m, lBgb(M_HEF)));
export const mcHeI = (m: number): number => (m < M_HEF ? mcFromL(mcl(m), lHeI(m)) : mcNonDegenerate(m, lHeI(M_HEF)));

/** Radius at He ignition: R_GB below M_FGB, eq. (50) above. */
export function rHeI(m: number): number {
  const rgb = rGb(m, lHeI(m));
  if (m <= M_FGB) return rgb;
  if (m >= Math.max(M_FGB, 12.0)) return rMHeIm(m);
  const mu = LOG(m / 12.0) / LOG(M_FGB / 12.0);
  return rMHeIm(m) * pow(rgb / rMHeIm(m), mu);
}

/** The blue phase's share of CHeB: eq. (58). */
export function tauBl(m: number): number {
  let t: number;
  if (m < M_HEF) t = 1;
  else if (m <= M_FGB) {
    // The logarithms are negative below M_FGB: their powers keep their sign (so that τ_bl = 1 at M_HeF, as the paper requires).
    const spow = (x: number, e: number) => Math.sign(x) * pow(Math.abs(x), e);
    const alphaBl = (1 - b[45] * pow(M_HEF / M_FGB, 0.414)) / spow(LOG(M_HEF / M_FGB), b[46]);
    t = b[45] * pow(m / M_FGB, 0.414) + alphaBl * spow(LOG(m / M_FGB), b[46]);
  } else {
    const fBl = (x: number) => pow(x, b[48]) * pow(Math.max(0, 1 - rMHeIm(x) / rAgb(x, lHeI(x))), b[49]);
    t = ((1 - b[47]) * fBl(m)) / fBl(M_FGB);
  }
  return Math.min(1, Math.max(0, t));
}

// ─── Remnants (§6.2) and the small-envelope perturbation (§6.3) ─────────────────────────

/** A white dwarf's radius: eq. (91). */
export const rWd = (m: number): number => Math.max(1.4e-5, 0.0115 * Math.sqrt(Math.max(0, pow(M_CH / m, 2 / 3) - pow(m / M_CH, 2 / 3))));
/** A new white dwarf's luminosity (eq. 90 at t = 0), A the effective baryon number (15 for a CO WD). */
export const lWd0 = (m: number, A = 15): number => (635 * m * pow(Z, 0.4)) / pow(A * 0.1, 1.4);

/** Pull L and R towards the remnant's as the envelope thins: eqs. (97), (99)–(105). */
export function perturb(l: number, r: number, m: number, mc: number, lc: number, rc: number): { l: number; r: number; mu: number } {
  const mu = Math.max(0, ((m - mc) / m) * Math.min(5.0, Math.max(1.2, pow(l / 7.0e4, -0.5))));
  if (mu >= 1.0) return { l, r, mu };
  const bb = 0.002 * Math.max(1, 2.5 / m);
  const cc = 0.006 * Math.max(1, 2.5 / m);
  const s = ((1 + bb ** 3) * pow(mu / bb, 3)) / (1 + pow(mu / bb, 3));
  const rcc = Math.min(rc, r);
  const q = Math.log(r / rcc);
  const rr = q > 0 ? ((1 + cc ** 3) * pow(mu / cc, 3) * pow(mu, 0.1 / q)) / (1 + pow(mu / cc, 3)) : 1;
  return { l: lc * pow(l / lc, s), r: rcc * pow(r / rcc, rr), mu };
}

// ─── Mass loss (§7.1) ───────────────────────────────────────────────────────────────────

/** The wind, M☉ per Myr, of a star of current mass m, luminosity l, radius r, in phase k (AGB: k = 5, 6), envelope share mu (eq. 97). */
export function windMsunPerMyr(k: number, m: number, l: number, r: number, mu: number): number {
  if (k < 2) return 0; // On the GB and beyond (MS and HG winds left out: see the head of the file).
  let rate = 0.5 * 4e-13 * ((l * r) / m); // Reimers, η = 0.5 (eq. 106)
  if (k === 5 || k === 6) {
    const logP0 = Math.min(3.3, -2.07 - 0.9 * LOG(m) + 1.94 * LOG(r));
    const p0 = pow(10, logP0);
    const vw = Math.min(pow(10, -11.4 + 0.0125 * (p0 - 100 * Math.max(m - 2.5, 0))), 1.36e-9 * l);
    rate = Math.max(rate, vw);
  }
  if (l > 4000) rate = Math.max(rate, 9.6e-15 * pow(r, 0.81) * pow(l, 1.24) * pow(m, 0.16));
  if (mu < 1) rate = Math.max(rate, 1e-13 * pow(l, 1.5) * (1 - mu));
  const hd = 1e-5 * r * Math.sqrt(l);
  if (l > 6e5 && hd > 1) rate += 0.1 * pow(hd, 3) * (l / 6e5 - 1);
  return rate * 1e6;
}

// ─── A whole life ───────────────────────────────────────────────────────────────────────

/** HPT's evolution types: 0–1 MS, 2 HG, 3 GB, 4 CHeB, 5 EAGB, 6 TPAGB, 10 He WD, 11 CO WD, 12 ONe WD. */
export type Kind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 10 | 11 | 12;

export interface LifePoint {
  /** Age since the ZAMS, Myr. */
  t: number;
  /** Current mass and core mass, M☉. */
  m: number;
  mc: number;
  l: number;
  r: number;
  k: Kind;
}

/** How a life ends: a white dwarf (its mass), a supernova, or stripped to its helium core (not followed). */
export interface Life {
  m0: number;
  points: LifePoint[];
  /** Index of the first point of each stage, where it has one. */
  marks: { tms: number; bgb: number; hei: number; bagb: number; tpagb: number; wd: number };
  end: 'white-dwarf' | 'supernova' | 'helium-star';
}

/**
 * The life of a star of initial mass m0 at Z = 0.02, sampled for drawing and interpolation: about 100 points on the MS,
 * 40 on the HG, 150 up the GB, 100 through CHeB, then the AGB step by step until the envelope is gone (or the core
 * reaches M_c,SN). Mass loss is integrated in sub-steps short against the envelope's lifetime in the wind.
 */
export function evolve(m0: number): Life {
  const pts: LifePoint[] = [];
  const marks = { tms: -1, bgb: -1, hei: -1, bagb: -1, tpagb: -1, wd: -1 };
  const push = (p: LifePoint) => pts.push(p);
  let m = m0; // current mass
  let M0 = m0; // the "initial" mass of HPT's formulae (reset at the He flash)
  const { tMs: tm } = tMs(M0);
  const tb = tBgb(M0);
  const hm = M0 >= M_FGB;

  // MS
  for (let i = 0; i <= 100; i++) {
    const t = (tm * i) / 100;
    const s = msState(M0, t);
    push({ t, m, mc: 0, l: s.l, r: s.r, k: M0 < 0.7 ? 0 : 1 });
  }
  marks.tms = pts.length - 1;
  if (M0 < 0.5) return { m0, points: pts, marks, end: 'white-dwarf' }; // beyond the age of the universe: the track stops on the MS
  const lt = lTms(M0);
  const rt = rTms(M0);
  const lEhg = hm ? lHeI(M0) : lBgb(M0);
  const rEhg = hm ? rHeI(M0) : rGb(M0, lBgb(M0));
  const mcEhg = M0 < M_HEF ? mcBgb(M0) : hm ? mcHeI(M0) : mcBgb(M0);
  const rho = (1.586 + pow(M0, 5.25)) / (2.434 + 1.02 * pow(M0, 5.25));
  // HG
  for (let i = 1; i <= 40; i++) {
    const tau = i / 40;
    push({ t: tm + (tb - tm) * tau, m, mc: ((1 - tau) * rho + tau) * mcEhg, l: lt * pow(lEhg / lt, tau), r: rt * pow(rEhg / rt, tau), k: 2 });
  }
  marks.bgb = pts.length - 1;

  // Integrate the wind from t1 to t2 at the state (l, r) given by `at`, in sub-steps; returns the new mass.
  const wind = (k: number, t1: number, t2: number, mc: number, at: (t: number, m: number) => { l: number; r: number }) => {
    let t = t1;
    while (t < t2) {
      const s = at(t, m);
      const mu = ((m - mc) / m) * Math.min(5.0, Math.max(1.2, pow(s.l / 7.0e4, -0.5)));
      const rate = windMsunPerMyr(k, m, s.l, s.r, mu);
      const dt = Math.min(t2 - t, rate > 0 ? (0.02 * Math.max(m - mc, 1e-4)) / rate : t2 - t);
      m = Math.max(mc, m - rate * dt);
      t += dt;
      if (m <= mc) break;
    }
    return m;
  };

  // GB (not for HM stars, which ignite helium in the HG)
  let tHeIgn = tb;
  let mcIgn = mcEhg;
  const rel0 = mcl(M0);
  if (!hm) {
    const g = growth(rel0, aH(M0), tb, lBgb(M0));
    const lI = lHeI(M0);
    tHeIgn = timeAtL(g, lI);
    const mcB = mcBgb(M0);
    const mcI = mcHeI(M0);
    const mcOf = (t: number) => (M0 < M_HEF ? mcAt(g, t) : mcB + ((mcI - mcB) * (t - tb)) / (tHeIgn - tb));
    const lOf = (t: number) => lFromMc(rel0, mcAt(g, t));
    // Points even in log L.
    const n = 150;
    let tPrev = tb;
    for (let i = 1; i <= n; i++) {
      const l = lBgb(M0) * pow(lI / lBgb(M0), i / n);
      const t = i === n ? tHeIgn : timeAtL(g, l);
      wind(3, tPrev, t, mcOf(tPrev), (tt, mm) => ({ l: lOf(tt), r: rGb(mm, lOf(tt)) }));
      tPrev = t;
      push({ t, m, mc: mcOf(t), l, r: rGb(m, l), k: 3 });
      if (m <= mcOf(t)) {
        // Stripped on the GB: a degenerate core becomes a helium white dwarf (A = 4), a non-degenerate one a naked He star.
        if (M0 >= M_HEF) return { m0, points: pts, marks, end: 'helium-star' };
        const mwd = mcOf(t);
        push({ t: t + 1e-6, m: mwd, mc: mwd, l: lWd0(mwd, 4), r: rWd(mwd), k: 10 });
        marks.wd = pts.length - 1;
        return { m0, points: pts, marks, end: 'white-dwarf' };
      }
    }
    mcIgn = mcOf(tHeIgn);
  }
  marks.hei = pts.length - 1;

  // CHeB. A LM star starts afresh after the flash (M0 = Mt), with its core mass.
  const physicalHeI = tHeIgn;
  if (M0 < M_HEF) M0 = m;
  const mcI = mcIgn;
  const mcBag = mcBagb(M0);
  const tHeLife = tHe(M0, mcI);
  const lI = lHeI(M0);
  const lBag = lBagb(M0);
  const lowMass = m0 < M_HEF;
  const tauB = lowMass ? 1 : tauBl(M0);
  const tauX = lowMass || hm ? 0 : 1 - tauB;
  const tauY = hm ? tauB : 1;
  const nHe = 100;
  let tPrev = physicalHeI;
  for (let i = 1; i <= nHe; i++) {
    const tau = i / nHe;
    const t = physicalHeI + tau * tHeLife;
    const mc = (1 - tau) * mcI + tau * mcBag;
    const stateAt = (tauNow: number, mm: number) => cheb(tauNow, mm, mc);
    wind(4, tPrev, t, mc, (tt, mm) => stateAt((tt - physicalHeI) / tHeLife, mm));
    tPrev = t;
    const s = stateAt(tau, m);
    push({ t, m, mc, l: s.l, r: s.r, k: 4 });
    if (m <= mc) return { m0, points: pts, marks, end: 'helium-star' };
  }
  marks.bagb = pts.length - 1;

  function cheb(tau: number, mm: number, mc: number): { l: number; r: number } {
    // Lx, Rx at the start of the blue phase; Ly, Ry at its end (eqs. 59–65).
    let lx: number;
    let rx: number;
    if (lowMass) {
      lx = lZahb(mm, mc);
      rx = rZahb(mm, mc);
    } else if (!hm) {
      lx = lMinHe(M0);
      rx = rGb(mm, lx);
    } else {
      lx = lI;
      rx = rHeI(M0);
    }
    const rmhe = lowMass ? rMHe(mm, mc) : rMHeIm(M0);
    const xi = Math.min(2.5, Math.max(0.4, rmhe / rx));
    const lOf = (tt: number) => (tt >= tauX ? lx * pow(lBag / lx, pow((tt - tauX) / (1 - tauX), xi)) : lx * pow(lI / lx, pow((tauX - tt) / tauX, 3)));
    const l = lOf(tau);
    if (tau < tauX) return { l, r: rGb(mm, l) };
    const ly = lOf(tauY);
    const ry = rAgb(mm, ly, M0);
    if (tau > tauY) return { l, r: rAgb(mm, l, M0) };
    const rmin = Math.min(rmhe, rx);
    const span = tauY - tauX;
    const f = span > 0 ? (tau - tauX) / span : 1;
    const rhoC = pow(Math.log(Math.max(ry, rmin) / rmin), 1 / 3) * f - pow(Math.log(Math.max(rx, rmin) / rmin), 1 / 3) * (1 - f);
    return { l, r: rmin * Math.exp(pow(Math.abs(rhoC), 3)) };
  }

  // EAGB: the CO core grows inside the He core (eqs. 68–70).
  const tBag = tPrev;
  const rel = mcl(M0);
  const gE = growth(rel, A_HE, tBag, lBag);
  const mcSn = Math.max(M_CH, 0.773 * mcBag - 0.35);
  const mcDu = mcBag > 0.8 && mcBag < 2.25 ? 0.44 * mcBag + 0.448 : mcBag;
  const lDu = lFromMc(rel, mcDu);
  const tDu = mcBag >= 2.25 ? Infinity : timeAtL(gE, lDu);
  const lAgbEnd = mcBag >= 2.25 ? lFromMc(rel, mcSn) : lDu;
  const tEnd = mcBag >= 2.25 ? timeAtL(gE, lAgbEnd) : tDu;
  {
    const n = 60;
    let tp = tBag;
    for (let i = 1; i <= n; i++) {
      const l = lBag * pow(lAgbEnd / lBag, i / n);
      const t = i === n ? tEnd : timeAtL(gE, l);
      const lOf = (tt: number) => lFromMc(rel, mcAt(gE, tt));
      wind(5, tp, t, mcBag, (tt, mm) => ({ l: lOf(tt), r: rAgb(mm, lOf(tt), M0) }));
      tp = t;
      push({ t, m, mc: mcBag, l, r: rAgb(m, l, M0), k: 5 });
      if (m <= mcBag) return { m0, points: pts, marks, end: 'helium-star' };
    }
    if (mcBag >= 2.25) return { m0, points: pts, marks, end: 'supernova' };
  }
  marks.tpagb = pts.length - 1;

  // TPAGB: both cores grow together, less third dredge-up (eqs. 71–73), until the wind takes the envelope.
  const gT = growth(rel, aHHe(M0), tDu, lDu);
  const lambda = Math.min(0.9, 0.3 + 0.001 * pow(M0, 5));
  const mcOfT = (t: number) => mcDu + (1 - lambda) * (mcAt(gT, t) - mcDu);
  const stateT = (t: number, mm: number) => {
    const l = lFromMc(rel, mcAt(gT, t));
    const mc = mcOfT(t);
    return perturb(l, rAgb(mm, l, M0), mm, mc, lWd0(mc), rWd(mc));
  };
  let t = tDu;
  let last = pts[pts.length - 1];
  for (let step = 0; step < 200_000; step++) {
    const mc = mcOfT(t);
    if (mcAt(gT, t) >= mcSn) return { m0, points: pts, marks, end: 'supernova' };
    const s = stateT(t, m);
    const rate = windMsunPerMyr(6, m, s.l, s.r, s.mu);
    const env = m - mc;
    // Steps short against the core's growth and the envelope's life in the wind.
    const dt = Math.max(1e-7, Math.min(0.002 * (gT.tinf2 - t), rate > 0 ? (0.01 * env) / rate : Infinity));
    m = Math.max(mc, m - rate * dt);
    t += dt;
    if (m <= mcOfT(t)) break;
    const s2 = stateT(t, m);
    const p: LifePoint = { t, m, mc: mcOfT(t), l: s2.l, r: s2.r, k: 6 };
    if (Math.abs(LOG(p.l / last.l)) > 0.004 || Math.abs(LOG(p.r / last.r)) > 0.004 || m - p.mc <= 1e-6) {
      push(p);
      last = p;
    }
    if (m - p.mc <= 1e-6) break;
  }
  // The white dwarf: the bare core (eqs. 90–91 at its birth).
  const mwd = Math.min(m, mcOfT(t));
  push({ t: t + 1e-6, m: mwd, mc: mwd, l: lWd0(mwd), r: rWd(mwd), k: mcBag < 1.6 ? 11 : 12 });
  marks.wd = pts.length - 1;
  return { m0, points: pts, marks, end: 'white-dwarf' };
}

/** Effective temperature of a point, K (T☉ = 5,772 K). */
export const teffOf = (l: number, r: number): number => 5772 * pow(l / (r * r), 0.25);

/** A few coefficients the tests check against the paper's worked values. */
export const SSE_CHECK = { b1: b[1], b2: b[2], b3: b[3], a17: a[17], a33: a[33], a66: a[66], a68: a[68], a64: a[64], a79: a[79], b17: b[17], b46: b[46], b55: b[55] };
