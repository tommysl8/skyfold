/**
 * Magnetic fields from spherical harmonics (docs/data/fields.md §1): the field of a body's interior from its Gauss
 * coefficients, and the Sun's corona as a potential field out to a source surface.
 *
 *  - Coefficients are Schmidt semi-normalised, g and h of degree n and order m, in a model's own body-fixed frame:
 *    z the model's north (its spin axis), x its prime meridian, longitude φ east (counterclockwise about z), and
 *    lengths in units of its reference radius a. Flat arrays, (n, m) at n(n + 1)/2 + m.
 *  - Internal field (the planets): V = a Σ (a/r)^(n+1) Σ_m (g cos mφ + h sin mφ) P_n^m(cos θ), B = −∇V.
 *  - Potential field to a source surface (the Sun; Altschuler & Newkirk 1969, Schatten et al. 1969, as the Wilcox
 *    Solar Observatory writes it with radial coefficients: Zhao & Hoeksema 1993): the coefficients are those of B_r
 *    at the photosphere, the field is current-free between r = 1 and the source surface R_ss, and radial there:
 *      B_r = Σ P (g cos + h sin) [(n+1) r^-(n+2) + n c_n r^(n-1)] / [n+1 + n c_n],  c_n = R_ss^-(2n+1)
 *      B_θ = −Σ dP/dθ (g cos + h sin) [r^-(n+2) − c_n r^(n-1)] / [n+1 + n c_n]   (B_φ likewise).
 *
 * The Legendre functions are built by the standard Schmidt recursion (as in the IGRF's own code), with their θ
 * derivatives. Pure functions and a reusable work object, so a tracer allocates nothing per point. Tests in
 * fields.test.ts.
 */

/** Gauss coefficients: g and h (index n(n + 1)/2 + m), to degree `degree`. */
export interface Harmonics {
  degree: number;
  g: Float64Array;
  h: Float64Array;
}

export const shIndex = (n: number, m: number): number => (n * (n + 1)) / 2 + m;
export const shCount = (degree: number): number => ((degree + 1) * (degree + 2)) / 2;

/** Empty coefficients to degree N. */
export function harmonics(degree: number): Harmonics {
  return { degree, g: new Float64Array(shCount(degree)), h: new Float64Array(shCount(degree)) };
}

/**
 * Coefficients from rows [n, m, g, h] (h ignored for m = 0), as papers list them.
 */
export function fromRows(rows: readonly (readonly [number, number, number, number])[]): Harmonics {
  const degree = rows.reduce((d, r) => Math.max(d, r[0]), 0);
  const c = harmonics(degree);
  for (const [n, m, g, h] of rows) {
    c.g[shIndex(n, m)] = g;
    c.h[shIndex(n, m)] = m === 0 ? 0 : h;
  }
  return c;
}

/**
 * Schmidt semi-normalised P_n^m(cos θ) and dP_n^m/dθ for n ≤ N into P and dP (index n(n + 1)/2 + m).
 * P_1^1 = sin θ; P_n^n = √((2n−1)/2n) sin θ P_{n−1}^{n−1} (n ≥ 2);
 * P_n^m = [(2n−1) cos θ P_{n−1}^m − √((n−1)² − m²) P_{n−2}^m] / √(n² − m²).
 */
export function schmidt(N: number, cosT: number, sinT: number, P: Float64Array, dP: Float64Array): void {
  P[0] = 1;
  dP[0] = 0;
  if (N < 1) return;
  P[1] = cosT;
  dP[1] = -sinT;
  P[2] = sinT;
  dP[2] = cosT;
  for (let n = 2; n <= N; n++) {
    const base = (n * (n + 1)) / 2;
    const b1 = ((n - 1) * n) / 2;
    const b2 = ((n - 2) * (n - 1)) / 2;
    for (let m = 0; m < n; m++) {
      const k = Math.sqrt(n * n - m * m);
      const a = (2 * n - 1) / k;
      const p1 = P[b1 + m];
      const d1 = dP[b1 + m];
      if (m <= n - 2) {
        const c = Math.sqrt((n - 1) * (n - 1) - m * m) / k;
        P[base + m] = a * cosT * p1 - c * P[b2 + m];
        dP[base + m] = a * (cosT * d1 - sinT * p1) - c * dP[b2 + m];
      } else {
        P[base + m] = a * cosT * p1;
        dP[base + m] = a * (cosT * d1 - sinT * p1);
      }
    }
    const f = Math.sqrt((2 * n - 1) / (2 * n));
    const pp = P[b1 + n - 1];
    P[base + n] = f * sinT * pp;
    dP[base + n] = f * (cosT * pp + sinT * dP[b1 + n - 1]);
  }
}

/** How the field falls off with r: a planet's interior, or the Sun's corona to a source surface. */
export type FieldKind = { kind: 'internal' } | { kind: 'pfss'; sourceSurface: number };

/** What an evaluation needs, made once per model and reused (nothing allocated per point). */
export class FieldWork {
  readonly P: Float64Array;
  readonly dP: Float64Array;
  readonly cosm: Float64Array;
  readonly sinm: Float64Array;
  readonly fr: Float64Array;
  readonly ft: Float64Array;
  constructor(readonly degree: number) {
    this.P = new Float64Array(shCount(degree));
    this.dP = new Float64Array(shCount(degree));
    this.cosm = new Float64Array(degree + 1);
    this.sinm = new Float64Array(degree + 1);
    this.fr = new Float64Array(degree + 1);
    this.ft = new Float64Array(degree + 1);
  }
}

/** The field's spherical components (r, θ, φ) at a point, into out[0..2]; r in reference radii. */
export function fieldSpherical(c: Harmonics, kind: FieldKind, r: number, cosT: number, sinT: number, phi: number, w: FieldWork, out: Float64Array | number[]): void {
  const N = Math.min(c.degree, w.degree);
  schmidt(N, cosT, sinT, w.P, w.dP);
  const c1 = Math.cos(phi);
  const s1 = Math.sin(phi);
  w.cosm[0] = 1;
  w.sinm[0] = 0;
  for (let m = 1; m <= N; m++) {
    w.cosm[m] = w.cosm[m - 1] * c1 - w.sinm[m - 1] * s1;
    w.sinm[m] = w.sinm[m - 1] * c1 + w.cosm[m - 1] * s1;
  }
  const inv = 1 / r;
  let rn = inv;
  for (let n = 0; n <= N; n++) {
    rn *= inv; // r^-(n+2)
    if (n === 0) {
      w.fr[0] = 0;
      w.ft[0] = 0;
      continue;
    }
    if (kind.kind === 'internal') {
      w.fr[n] = (n + 1) * rn;
      w.ft[n] = rn;
    } else {
      const rs = kind.sourceSurface;
      const cn = rs ** -(2 * n + 1);
      const up = r ** (n - 1) * cn;
      const d = n + 1 + n * cn;
      w.fr[n] = ((n + 1) * rn + n * up) / d;
      w.ft[n] = (rn - up) / d;
    }
  }
  // B_φ divides P_n^m by sin θ; on the axis the quotient is finite (dP_n^1/dθ / cos θ for m = 1, 0 above).
  const onAxis = Math.abs(sinT) < 1e-12;
  let br = 0;
  let bt = 0;
  let bp = 0;
  for (let n = 1; n <= N; n++) {
    const base = (n * (n + 1)) / 2;
    let sr = 0;
    let stt = 0;
    let sp = 0;
    for (let m = 0; m <= n; m++) {
      const g = c.g[base + m];
      const h = c.h[base + m];
      const gc = g * w.cosm[m] + h * w.sinm[m];
      sr += gc * w.P[base + m];
      stt += gc * w.dP[base + m];
      if (m > 0) {
        const pOverS = onAxis ? (m === 1 ? w.dP[base + 1] / cosT : 0) : w.P[base + m] / sinT;
        sp += m * (-g * w.sinm[m] + h * w.cosm[m]) * pOverS;
      }
    }
    br += w.fr[n] * sr;
    bt -= w.ft[n] * stt;
    bp -= w.ft[n] * sp;
  }
  out[0] = br;
  out[1] = bt;
  out[2] = bp;
}

const sph = new Float64Array(3);

/** The field at a Cartesian point of the model's frame (reference radii), Cartesian, into out[0..2]. */
export function fieldCartesian(c: Harmonics, kind: FieldKind, x: number, y: number, z: number, w: FieldWork, out: Float64Array | number[]): void {
  const rho = Math.hypot(x, y);
  const r = Math.hypot(rho, z);
  const cosT = z / r;
  const sinT = rho / r;
  const phi = Math.atan2(y, x);
  fieldSpherical(c, kind, r, cosT, sinT, phi, w, sph);
  const cp = rho > 0 ? x / rho : 1;
  const sp = rho > 0 ? y / rho : 0;
  const [br, bt, bp] = sph;
  // r̂ = (sθ cφ, sθ sφ, cθ), θ̂ = (cθ cφ, cθ sφ, −sθ), φ̂ = (−sφ, cφ, 0).
  out[0] = br * sinT * cp + bt * cosT * cp - bp * sp;
  out[1] = br * sinT * sp + bt * cosT * sp + bp * cp;
  out[2] = br * cosT - bt * sinT;
}

// ─── The dipole and the offset dipole ─────────────────────────────────────────────────

/** The centred dipole: its field at the equator B₀ (the coefficients' unit), its tilt from the model's z, and its axis. */
export interface DipoleSummary {
  /** √(g₁⁰² + g₁¹² + h₁¹²): the centred dipole's field on the equator at r = 1. */
  b0: number;
  /** Angle between the dipole axis and the spin axis (z), degrees: 0–90, the axis's nearer end. */
  tiltDeg: number;
  /** The moment's direction (unit, model frame): m ∝ (g₁¹, h₁¹, g₁⁰); field lines leave the body round its end. */
  moment: [number, number, number];
}

export function dipole(c: Harmonics): DipoleSummary {
  const g10 = c.g[1];
  const g11 = c.g[2];
  const h11 = c.h[2];
  const b0 = Math.hypot(g10, g11, h11);
  const tilt = (Math.acos(Math.min(1, Math.abs(g10) / b0)) * 180) / Math.PI;
  return { b0, tiltDeg: tilt, moment: [g11 / b0, h11 / b0, g10 / b0] };
}

/**
 * The eccentric dipole (Schmidt 1934, as Fraser-Smith 1987 writes it): where the dipole that best matches the dipole
 * and quadrupole terms sits, in reference radii (model frame). For an axial dipole moved d along z, g₂⁰ = 2 d g₁⁰.
 */
export function dipoleOffset(c: Harmonics): [number, number, number] {
  if (c.degree < 2) return [0, 0, 0];
  const g10 = c.g[1];
  const g11 = c.g[2];
  const h11 = c.h[2];
  const g20 = c.g[3];
  const g21 = c.g[4];
  const h21 = c.h[4];
  const g22 = c.g[5];
  const h22 = c.h[5];
  const s3 = Math.sqrt(3);
  const m2 = g10 * g10 + g11 * g11 + h11 * h11;
  const L0 = 2 * g10 * g20 + s3 * (g11 * g21 + h11 * h21);
  const L1 = -g11 * g20 + s3 * (g10 * g21 + g11 * g22 + h11 * h22);
  const L2 = -h11 * g20 + s3 * (g10 * h21 - h11 * g22 + g11 * h22);
  const E = (L0 * g10 + L1 * g11 + L2 * h11) / (4 * m2);
  return [(L1 - g11 * E) / (3 * m2), (L2 - h11 * E) / (3 * m2), (L0 - g10 * E) / (3 * m2)];
}
