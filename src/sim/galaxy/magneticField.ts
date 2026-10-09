// The Milky Way's large-scale regular (coherent) magnetic field: the "base" model of Unger & Farrar
// (2024), "The coherent magnetic field of the Milky Way", ApJ 970, 95 (arXiv:2311.12120), called UF23.
// Implemented from the paper's equations (its section 5, "Magnetic Field Models") with its fitted parameters
// (Table 3, column "base"); docs/data/galactic-field.md. Pure functions; no three.js.
//
// The model is fitted to rotation measures of extragalactic sources and to the polarised synchrotron
// sky of WMAP and Planck. It is the sum of three parts:
//   disc       a logarithmic spiral of pitch α whose strength along a circle is three Fourier modes,
//              faded in from r = 5 kpc, out by 20 kpc and above |z| ≈ 0.8 kpc (the "Fourier spiral");
//   toroidal   a purely azimuthal halo field, of opposite sense north and south of the plane, that takes
//              over where the disc fades (the "explicit" toroidal halo);
//   poloidal   the "X-field", the coasting X-field in its two-parameter limit (a_c ≫ a) with a
//              logistic radial profile: lines vertical at the centre, flaring out with height.
// "base" is the paper's fiducial model, the one its other seven variants are measured against.
//
// Frame: the paper's is right-handed and galactocentric, the Sun at (−r☉, 0, 0) with r☉ = 8.178 kpc
// (GRAVITY 2019) and the Sun put in the plane (z☉ → 0); x points from the Sun to the centre, z to the
// north galactic pole, so y points towards l = 90°, the way the Galaxy turns at the Sun: seen from the
// north the Galaxy turns clockwise (their v₀ = −240 km/s). Azimuth φ = atan2(y, x). These are the axes
// of the app's frame G (frames.ts), whose Sun is at 8.277 kpc (GRAVITY 2022) and 20.8 pc above the
// plane: the model is used in G scaled by 8.178 / 8.277 in every length (so the Sun keeps its place
// among the field's arms; fieldAtG), its field strengths unchanged, and its plane taken as G's.
//
// Signs, checked against what the paper says of them: B_φ > 0 is counter-clockwise seen from the north
// (against the Galaxy's turning); the local disc field (B_ref < 0 here) runs clockwise, towards
// l ≈ 90° − α, as the spur variant's B₁ = −4.3 µG there; the northern halo field is counter-clockwise
// (B_N > 0) and the southern clockwise, as differential rotation of the X-field (B_z > 0, northward)
// would wind them (the paper's unified halo model).
//
// Drawn as field lines by fieldLines.ts and scene/GalacticField.tsx.

/** The paper's distance from the Sun to the centre of the Galaxy, kpc (GRAVITY 2019, as the paper adopts it). */
export const UF23_R_SUN_KPC = 8.178;

/** The app's (frame G, frames.ts R0_KPC): GRAVITY 2022. */
const APP_R0_KPC = 8.277;

/** Lengths of frame G times this are the paper's. */
export const G_TO_UF23 = UF23_R_SUN_KPC / APP_R0_KPC;

/**
 * UF23 "base": Unger & Farrar 2024, Table 3 (best fit ± 1σ: only the best fit is used) and Table 2 (fixed
 * values). Lengths kpc, fields µG, angles degrees.
 */
export const UF23_BASE = {
  disc: {
    /** Pitch angle α: 10.11 ± 0.13. */
    pitchDeg: 10.11,
    /** Height z_d where the disc falls to half, and its width w_d: 0.794 ± 0.032, 0.107 ± 0.026. */
    zd: 0.794,
    wd: 0.107,
    /** The three modes' strengths B_m at r₀: 1.09 ± 0.14, 2.66 ± 0.21, 3.12 ± 0.15. */
    B: [1.09, 2.66, 3.12] as const,
    /** Their phases φ_m: 263 ± 9, 97.8 ± 2.8, 35.1 ± 2.2. */
    phiDeg: [263, 97.8, 35.1] as const,
    /** Fixed (Table 2): reference radius r₀, inner radius r₁ and width w₁, outer radius r₂ and width w₂. */
    r0: 5,
    r1: 5,
    w1: 0.5,
    r2: 20,
    w2: 0.5,
  },
  toroidal: {
    /** North and south strengths: 3.26 ± 0.31, −3.09 ± 0.30. */
    BN: 3.26,
    BS: -3.09,
    /** Scale height z_t: 4.0 ± 0.7; radius r_t and width w_t of the radial cut: 10.19 ± 0.17, 1.7 ± 0.4. */
    zt: 4.0,
    rt: 10.19,
    wt: 1.7,
  },
  poloidal: {
    /** Mid-plane vertical strength B_p: 0.978 ± 0.033. */
    Bp: 0.978,
    /** Field-line exponent p: 1.43 ± 0.09; scale height z_p: 4.5 ± 0.4. */
    p: 1.43,
    zp: 4.5,
    /** Logistic cut-off of B₀(a) at r_p = 7.29 ± 0.06, width w_p = 0.112 ± 0.029. */
    rp: 7.29,
    wp: 0.112,
  },
} as const;

const DEG = Math.PI / 180;
const D = UF23_BASE.disc;
const T = UF23_BASE.toroidal;
const P = UF23_BASE.poloidal;
const TAN_A = Math.tan(D.pitchDeg * DEG);
const SIN_A = Math.sin(D.pitchDeg * DEG);
const COS_A = Math.cos(D.pitchDeg * DEG);
const PHI_M = D.phiDeg.map((p) => p * DEG);
const ZP_P = P.zp ** P.p;

/** The logistic sigmoid, σ(x) = 1 / (1 + e^−x). */
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** The disc's vertical fade h_d(z); 1 − h_d phases the toroidal halo in. */
export const discFadeZ = (z: number): number => 1 - sigmoid((Math.abs(z) - D.zd) / D.wd);

/** The disc's radial fade g_d(r). */
export const discFadeR = (r: number): number => (1 - sigmoid((r - D.r2) / D.w2)) * sigmoid((r - D.r1) / D.w1) * (1 - Math.exp(-r * r));

/** The azimuth φ₀ at r₀ of the spiral through (r, φ), radians. */
export const spiralPhi0 = (r: number, phi: number): number => phi - Math.log(r / D.r0) / TAN_A;

/** The disc's strength at the reference radius along azimuth φ₀, µG; < 0 is clockwise. */
export function discReference(phi0: number): number {
  let b = 0;
  for (let m = 0; m < 3; m++) b += D.B[m] * Math.cos((m + 1) * (phi0 - PHI_M[m]));
  return b;
}

/** A field vector, µG, in the frame's Cartesian axes. */
export type FieldVec = [number, number, number];

/** The three parts at one point (paper frame, kpc), each Cartesian µG. */
export interface FieldParts {
  disc: FieldVec;
  toroidal: FieldVec;
  poloidal: FieldVec;
}

/** B_r and B_φ to Cartesian, added into out. */
function addCyl(out: FieldVec, br: number, bphi: number, bz: number, c: number, s: number): void {
  out[0] += br * c - bphi * s;
  out[1] += br * s + bphi * c;
  out[2] += bz;
}

/**
 * UF23 base at (x, y, z) in the paper's frame (kpc): each part's field (µG) added into the three
 * vectors given (or into `sum` for all three, when `parts` is omitted).
 */
export function uf23Add(x: number, y: number, z: number, sum: FieldVec, parts?: FieldParts): void {
  const r = Math.hypot(x, y);
  // On the axis the disc and the toroidal field vanish (g_d ∝ r² there, and the halo's B_φ is a
  // vortex line of zero radius: taken as 0) and the X-field is vertical.
  const c = r > 0 ? x / r : 1;
  const s = r > 0 ? y / r : 0;
  const az = Math.abs(z);
  const hd = discFadeZ(z);

  // Disc: along the spiral, (sin α, cos α, 0) (r₀ / r) B(r₀, φ₀) h_d(z) g_d(r).
  if (r > 0) {
    const b = discReference(spiralPhi0(r, Math.atan2(y, x))) * (D.r0 / r) * hd * discFadeR(r);
    addCyl(parts ? parts.disc : sum, b * SIN_A, b * COS_A, 0, c, s);
  }

  // Toroidal halo: (1 − h_d) e^(−|z|/z_t) (1 − σ((r − r_t)/w_t)) B_N or B_S.
  if (r > 0) {
    const bphi = (1 - hd) * Math.exp(-az / T.zt) * (1 - sigmoid((r - T.rt) / T.wt)) * (z > 0 ? T.BN : T.BS);
    addCyl(parts ? parts.toroidal : sum, 0, bphi, 0, c, s);
  }

  // Poloidal X-field, coasting with a_c → ∞: field lines r = a (1 + |z/z_p|^p)^(1/p), so the
  // line through (r, z) crosses the plane at a = r / q, q = (1 + |z/z_p|^p)^(1/p). With the Euler potentials
  // (B_r = −(a/r) B₀ ∂a/∂z, B_z = (a/r) B₀ ∂a/∂r): B_z = B₀(a) a²/r² and
  // B_r = B₀(a) a² sgn(z) |z|^(p−1) / (r (1 + |z/z_p|^p) z_p^p),
  // where B₀(a) = B_p (1 − σ((a − r_p)/w_p)) (the logistic profile).
  const sp = 1 + az ** P.p / ZP_P;
  const q = sp ** (1 / P.p);
  const a = r / q;
  const b0 = P.Bp * (1 - sigmoid((a - P.rp) / P.wp));
  // a²/r² = 1/q², and B_r = B₀ r/q² sgn(z)|z|^(p−1) / (s_p z_p^p), finite on the axis and in the plane.
  const bz = b0 / (q * q);
  const br = az > 0 ? (b0 * r * Math.sign(z) * az ** (P.p - 1)) / (q * q * sp * ZP_P) : 0;
  addCyl(parts ? parts.poloidal : sum, br, 0, bz, c, s);
}

/** UF23 base at a point of the paper's frame (kpc), µG. */
export function uf23Field(x: number, y: number, z: number, out: FieldVec = [0, 0, 0]): FieldVec {
  out[0] = out[1] = out[2] = 0;
  uf23Add(x, y, z, out);
  return out;
}

/** UF23 base's three parts at a point of the paper's frame (kpc), µG. */
export function uf23Parts(x: number, y: number, z: number): FieldParts {
  const parts: FieldParts = { disc: [0, 0, 0], toroidal: [0, 0, 0], poloidal: [0, 0, 0] };
  uf23Add(x, y, z, [0, 0, 0], parts);
  return parts;
}

/** The field at a point of the app's frame G (kpc), µG along G's axes (the model scaled to the app's R0). */
export function fieldAtG(x: number, y: number, z: number, out: FieldVec = [0, 0, 0]): FieldVec {
  return uf23Field(x * G_TO_UF23, y * G_TO_UF23, z * G_TO_UF23, out);
}
