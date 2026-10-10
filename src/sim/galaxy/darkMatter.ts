// The Milky Way's mass and its dark halo (docs/data/dark-matter.md): McMillan's (2017) best-fitting mass model, the
// circular speed it gives in the plane with and without its dark halo, and the measured rotation curve of Eilers et
// al. (2019) to compare. Pure functions; no three.js.
//
// The model (McMillan 2017, MNRAS 465, 76, Table 3 and section 2): an axisymmetric, flattened bulge; thin and thick
// exponential stellar discs; H I and H2 gas discs with central holes; and a spherical NFW halo of dark matter,
// ρ = ρ0 / (x (1 + x)²), x = r / r_h, with ρ0 = 0.00854 M☉/pc³ and r_h = 19.6 kpc. It puts the Sun at R0 = 8.21 kpc,
// circling at v0 = 233.1 km/s, with 0.0101 M☉/pc³ of dark matter round it, and gives a virial mass of
// 1.37 × 10¹² M☉. Other fits differ: Gaia-era rotation curves that fall off beyond about 20 kpc want a far lighter
// halo (Ou et al. 2024, MNRAS 528, 693: a cored Einasto halo of 1.8 × 10¹¹ M☉), and the total is uncertain by a
// factor of several (docs/data/dark-matter.md §1).
//
// Units: kpc, M☉, km/s. The circular speed in the plane is v_c² = R ∂Φ/∂R summed over the components (Φ is linear in
// the density): the halo's from its enclosed mass, the bulge's from the oblate-spheroid formula (Binney & Tremaine
// 2008, eq. 2.132), each disc's from rings, their exact potential (complete elliptic integrals) spread over the
// disc's thickness by Gauss–Laguerre nodes. The table is worked out once, when first asked for (about 20 ms).

/** Newton's constant, kpc (km/s)² / M☉ (IAU 2015 nominal GM☉ and the IAU parsec). */
export const G_KPC = 4.300917e-6;

/** 1 km/s per kpc in rad per Myr (an angular speed). */
export const RAD_PER_MYR_PER_KMS_KPC = (365.25 * 86_400 * 1e6) / 3.085_677_581e16;

const REF_MCMILLAN = 'McMillan 2017, MNRAS 465, 76 (Table 3)';

/** McMillan's best-fitting model (Table 3; the fixed shapes from his sections 2.1 to 2.4). */
export const MCMILLAN_2017 = {
  ref: REF_MCMILLAN,
  doi: '10.1093/mnras/stw2759',
  R0: 8.21,
  v0: 233.1,
  /** Dark-matter density at the Sun, M☉/pc³ (0.38 GeV/cm³). */
  rhoHaloSun: 0.0101,
  /** Virial mass (inside the sphere of 200 times the critical density, H = 70.4 km/s/Mpc), M☉. */
  Mvir: 1.37e12,
  /** Stellar mass (bulge and both discs), M☉. */
  Mstars: 5.43e10,
  bulge: { rho0: 9.84e10, r0: 0.075, rcut: 2.1, alpha: 1.8, q: 0.5 },
  thin: { sigma0: 896e6, Rd: 2.5, zd: 0.3 },
  thick: { sigma0: 183e6, Rd: 3.02, zd: 0.9 },
  /** Gas discs: Σ = Σ0 exp(−Rm/R − R/Rd), sech²(z / 2zd) / 4zd vertically (his eq. 4 and Table 1). */
  hi: { sigma0: 53.1e6, Rd: 7, Rm: 4, zd: 0.085 },
  h2: { sigma0: 2180e6, Rd: 1.5, Rm: 12, zd: 0.045 },
  /** NFW halo: ρ0 (M☉/kpc³) and scale radius r_h (kpc). */
  halo: { rho0: 8.54e6, rs: 19.6 },
  /** Critical density for his virial radius, M☉/kpc³: 3H²/8πG with H = 70.4 km/s/Mpc. */
  rhoCrit: (3 * (70.4 / 1000) ** 2) / (8 * Math.PI * 4.300917e-6),
} as const;

const H = MCMILLAN_2017.halo;

// ─── The halo ──────────────────────────────────────────────────────────────────────────

/** Dark-matter density at radius r (kpc), M☉/kpc³. */
export function haloDensity(r: number): number {
  const x = Math.max(r, 1e-6) / H.rs;
  return H.rho0 / (x * (1 + x) * (1 + x));
}

/** Dark matter inside the sphere of radius r (kpc), M☉: 4π ρ0 r_h³ [ln(1 + x) − x / (1 + x)]. */
export function haloMass(r: number): number {
  const x = r / H.rs;
  return 4 * Math.PI * H.rho0 * H.rs ** 3 * (Math.log1p(x) - x / (1 + x));
}

/** The halo's own circular speed at radius r (kpc), km/s. */
export const haloSpeed = (r: number): number => Math.sqrt((G_KPC * haloMass(r)) / Math.max(r, 1e-6));

/**
 * The radius inside which the halo's mean density is `times` the critical density (kpc; McMillan's virial radius at
 * 200), by bisection.
 */
export function haloRadius(times = 200): number {
  let lo = 1;
  let hi = 2000;
  for (let i = 0; i < 60; i++) {
    const r = 0.5 * (lo + hi);
    const mean = haloMass(r) / ((4 / 3) * Math.PI * r ** 3);
    if (mean > times * MCMILLAN_2017.rhoCrit) lo = r;
    else hi = r;
  }
  return 0.5 * (lo + hi);
}

/**
 * The halo's column density along a line of sight that passes at b (kpc) from the centre, taken from s0 to s1 (kpc,
 * measured along the line from its point closest to the centre), M☉/kpc². With r = b cosh u along the line,
 * ρ ds = ρ0 r_h du / (1 + x)², smooth in u, so a few dozen Simpson steps are exact to well under 0.1 %. The shader
 * (render/darkMatterMaterials.ts) integrates the same way.
 */
export function haloColumn(b: number, s0: number, s1: number, steps = 48): number {
  const bb = Math.max(b, 0.01);
  const u0 = Math.asinh(s0 / bb);
  const u1 = Math.asinh(s1 / bb);
  const n = steps % 2 ? steps + 1 : steps;
  const h = (u1 - u0) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const x = (bb * Math.cosh(u0 + i * h)) / H.rs;
    const f = 1 / ((1 + x) * (1 + x));
    sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * f;
  }
  return (H.rho0 * H.rs * h * sum) / 3;
}

// ─── The bulge ─────────────────────────────────────────────────────────────────────────

const B = MCMILLAN_2017.bulge;

/** Bulge density at the spheroidal radius m = √(R² + z²/q²), M☉/kpc³ (McMillan's eq. 1). */
export const bulgeDensity = (m: number): number => (B.rho0 / (1 + m / B.r0) ** B.alpha) * Math.exp(-((m / B.rcut) ** 2));

/** ∫₀^1 f(u) du by Simpson's rule with n (even) steps. */
function simpson(f: (u: number) => number, n: number): number {
  const h = 1 / n;
  let s = f(0) + f(1);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(i * h);
  return (s * h) / 3;
}

/** The bulge's mass, M☉: 4π q ∫ ρ(m) m² dm (to 10 r_cut). */
export function bulgeMass(): number {
  const top = 10 * B.rcut;
  return 4 * Math.PI * B.q * top * simpson((u) => bulgeDensity(u * top) * (u * top) ** 2, 2000);
}

/** The bulge's circular speed in the plane at R (kpc), km/s: v² = 4πG q ∫₀^R ρ(m) m² dm / √(R² − m² e²). */
export function bulgeSpeed(R: number): number {
  const e2 = 1 - B.q * B.q;
  const v2 = 4 * Math.PI * G_KPC * B.q * R * simpson((u) => {
    const m = u * R;
    return (bulgeDensity(m) * m * m) / Math.sqrt(R * R - m * m * e2);
  }, 400);
  return Math.sqrt(Math.max(0, v2));
}

// ─── The discs ─────────────────────────────────────────────────────────────────────────

export interface Disc {
  /** Surface density at R (kpc), M☉/kpc². */
  sigma: (R: number) => number;
  /** Vertical scale height, kpc. */
  zd: number;
}

const expDisc = (d: { sigma0: number; Rd: number; zd: number }): Disc => ({ sigma: (R) => d.sigma0 * Math.exp(-R / d.Rd), zd: d.zd });
const gasDisc = (d: { sigma0: number; Rd: number; Rm: number; zd: number }): Disc => ({
  sigma: (R) => (R <= 0 ? 0 : d.sigma0 * Math.exp(-d.Rm / R - R / d.Rd)),
  zd: d.zd,
});

/** The model's four discs: thin and thick stars, H I and H2 gas. */
export const DISCS: readonly Disc[] = [expDisc(MCMILLAN_2017.thin), expDisc(MCMILLAN_2017.thick), gasDisc(MCMILLAN_2017.hi), gasDisc(MCMILLAN_2017.h2)];

/** Complete elliptic integrals K(m) and E(m) of parameter m = k² < 1 (arithmetic–geometric mean). */
export function ellipKE(m: number): [number, number] {
  let a = 1;
  let g = Math.sqrt(1 - m);
  let p = 0.5;
  let c2 = 0.5 * m;
  for (let i = 0; i < 30 && Math.abs(a - g) > 1e-15 * a; i++) {
    const c = 0.5 * (a - g);
    const an = 0.5 * (a + g);
    g = Math.sqrt(a * g);
    a = an;
    p *= 2;
    c2 += p * c * c;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - c2)];
}

/**
 * R ∂Φ/∂R in the plane at R from a ring of mass M and radius a lying z above or below it, (km/s)²:
 * Φ = −(2GM/π) K(m) / √Q, Q = (R + a)² + z², m = 4aR/Q.
 */
export function ringV2(R: number, a: number, z: number, M: number): number {
  const Q = (R + a) * (R + a) + z * z;
  const s = Math.sqrt(Q);
  const m = Math.min((4 * a * R) / Q, 1 - 1e-12);
  const [K, E] = ellipKE(m);
  const dKdm = m < 1e-8 ? Math.PI / 8 : (E - (1 - m) * K) / (2 * m * (1 - m));
  const dmdR = ((4 * a) / Q) * (1 - (2 * R * (R + a)) / Q);
  const dPhidR = ((-2 * G_KPC * M) / Math.PI) * ((dKdm * dmdR) / s - (K * (R + a)) / (s * Q));
  return R * dPhidR;
}

/** Three-point Gauss–Laguerre nodes and weights: the mass of an exp(−|z|/zd) layer at |z| = zd t, in shares. */
const LAGUERRE_T = [0.4157745568, 2.2942803603, 6.2899450829];
const LAGUERRE_W = [0.7110930099, 0.2785177336, 0.0103892565];

/** The rings the discs are cut into: inner edge, width (kpc). 50 pc wide within 20 kpc, 200 pc out to 80 kpc. */
function ringGrid(): { a: Float64Array; da: Float64Array } {
  const a: number[] = [];
  const da: number[] = [];
  for (let x = 0; x < 20 - 1e-9; x += 0.05) {
    a.push(x + 0.025);
    da.push(0.05);
  }
  for (let x = 20; x < 80 - 1e-9; x += 0.2) {
    a.push(x + 0.1);
    da.push(0.2);
  }
  return { a: Float64Array.from(a), da: Float64Array.from(da) };
}

/**
 * The circular speed² of a set of discs in the plane at R (kpc), (km/s)². Each ring's mass is spread over its disc's
 * thickness at the Laguerre nodes (the sech² gas layers taken as exponential: the same away from the plane), and
 * softened by its own width so a ring at R stays finite.
 */
export function discsV2(R: number, discs: readonly Disc[] = DISCS, grid = ringGrid()): number {
  let v2 = 0;
  const { a, da } = grid;
  for (const d of discs) {
    for (let i = 0; i < a.length; i++) {
      const M = 2 * Math.PI * a[i] * d.sigma(a[i]) * da[i];
      if (M <= 0) continue;
      for (let k = 0; k < 3; k++) {
        const z = Math.hypot(d.zd * LAGUERRE_T[k], da[i]);
        v2 += LAGUERRE_W[k] * ringV2(R, a[i], z, M);
      }
    }
  }
  return v2;
}

/** A disc's mass, M☉ (∫ 2πR Σ dR to 100 kpc). */
export function discMass(d: Disc): number {
  const top = 100;
  return 2 * Math.PI * top * simpson((u) => u * top * d.sigma(u * top), 4000);
}

// ─── The rotation curve ────────────────────────────────────────────────────────────────

export interface RotationCurve {
  /** Radii, kpc (log-spaced). */
  R: Float64Array;
  /** Circular speed², (km/s)²: the stars and gas alone, and the dark halo alone. */
  visible2: Float64Array;
  halo2: Float64Array;
  /** Masses, M☉. */
  bulgeMass: number;
  discMass: number;
}

/** The table's radii: 0.05 to 300 kpc. Beyond 60 kpc the discs act as a point (a share of 10⁻⁷ of them lies further). */
const R_MIN = 0.05;
const R_MAX = 300;
const R_DISC_MAX = 60;
const N_R = 56;

let curve: RotationCurve | null = null;

/** The rotation curve of the model, worked out on first use (about 20 ms) and kept. */
export function rotationCurve(): RotationCurve {
  if (curve) return curve;
  const grid = ringGrid();
  const R = new Float64Array(N_R);
  const visible2 = new Float64Array(N_R);
  const halo2 = new Float64Array(N_R);
  const mb = bulgeMass();
  const md = DISCS.reduce((s, d) => s + discMass(d), 0);
  for (let i = 0; i < N_R; i++) {
    const r = R_MIN * (R_MAX / R_MIN) ** (i / (N_R - 1));
    R[i] = r;
    const b = bulgeSpeed(r);
    const discs = r <= R_DISC_MAX ? discsV2(r, DISCS, grid) : (G_KPC * md) / r;
    visible2[i] = b * b + discs;
    halo2[i] = haloSpeed(r) ** 2;
  }
  curve = { R, visible2, halo2, bulgeMass: mb, discMass: md };
  return curve;
}

/** v² from the table at R (kpc), linear in ln R; beyond the table, as a point mass or the halo's own law. */
function lookup(R: number, v2: Float64Array, c: RotationCurve): number {
  const { R: r } = c;
  if (R <= r[0]) return v2[0] * (R / r[0]);
  if (R >= r[r.length - 1]) return v2[r.length - 1] * (r[r.length - 1] / R);
  const t = (Math.log(R / R_MIN) / Math.log(R_MAX / R_MIN)) * (N_R - 1);
  const i = Math.min(N_R - 2, Math.floor(t));
  const f = t - i;
  return v2[i] * (1 - f) + v2[i + 1] * f;
}

/** Circular speed in the plane at R (kpc), km/s: the whole model. */
export function circularSpeed(R: number): number {
  const c = rotationCurve();
  return Math.sqrt(lookup(R, c.visible2, c) + (R >= c.R[N_R - 1] ? haloSpeed(R) ** 2 : lookup(R, c.halo2, c)));
}

/** Circular speed in the plane at R (kpc), km/s, if only the stars and gas were there. */
export function visibleSpeed(R: number): number {
  const c = rotationCurve();
  return Math.sqrt(lookup(R, c.visible2, c));
}

/** The stars' and gas's mass, M☉. */
export function visibleMass(): number {
  const c = rotationCurve();
  return c.bulgeMass + c.discMass;
}

/**
 * The share of the mass within r (kpc) that is dark, for r well beyond the discs (≥ 30 kpc, where nearly all the stars
 * and gas are inside: their whole mass is counted).
 */
export const darkShare = (r: number): number => haloMass(r) / (haloMass(r) + visibleMass());

// ─── Measurements ──────────────────────────────────────────────────────────────────────

/**
 * The Milky Way's circular speed measured from 23,000 red giants with APOGEE spectra and Gaia DR2 astrometry (Eilers,
 * Hogg, Rix & Ness 2019, ApJ 871, 120, Table 1): R (kpc), v_c, and its lower and upper error (km/s, statistical).
 * Their R0 is 8.122 kpc (GRAVITY 2018); at the Sun they find 229.0 ± 0.2 km/s, falling by 1.7 km/s per kpc, with
 * systematic errors of 2 to 5 % out to 20 kpc.
 */
export const EILERS_2019 = {
  ref: 'Eilers, Hogg, Rix & Ness 2019, ApJ 871, 120 (Table 1)',
  doi: '10.3847/1538-4357/aaf648',
  R0: 8.122,
  vSun: 229.0,
  slope: -1.7,
  points: [
    [5.27, 226.83, 1.91, 1.9],
    [5.74, 230.8, 1.43, 1.35],
    [6.23, 231.2, 1.7, 1.1],
    [6.73, 229.88, 1.44, 1.32],
    [7.22, 229.61, 1.37, 1.11],
    [7.82, 229.91, 0.92, 0.88],
    [8.19, 228.86, 0.8, 0.67],
    [8.78, 226.5, 1.07, 0.95],
    [9.27, 226.2, 0.72, 0.62],
    [9.76, 225.94, 0.42, 0.52],
    [10.26, 225.68, 0.44, 0.4],
    [10.75, 224.73, 0.38, 0.41],
    [11.25, 224.02, 0.33, 0.54],
    [11.75, 223.86, 0.4, 0.39],
    [12.25, 222.23, 0.51, 0.37],
    [12.74, 220.77, 0.54, 0.46],
    [13.23, 220.92, 0.57, 0.4],
    [13.74, 217.47, 0.64, 0.51],
    [14.24, 217.31, 0.77, 0.66],
    [14.74, 217.6, 0.65, 0.68],
    [15.22, 217.07, 1.06, 0.8],
    [15.74, 217.38, 0.84, 1.07],
    [16.24, 216.14, 1.2, 1.48],
    [16.74, 212.52, 1.39, 1.43],
    [17.25, 216.41, 1.44, 1.85],
    [17.75, 213.7, 2.22, 1.65],
    [18.24, 207.89, 1.76, 1.88],
    [18.74, 209.6, 2.31, 2.77],
    [19.22, 206.45, 2.54, 2.36],
    [19.71, 201.91, 2.99, 2.26],
    [20.27, 199.84, 3.15, 2.89],
    [20.78, 198.14, 3.33, 3.37],
    [21.24, 195.3, 5.99, 6.5],
    [21.8, 213.67, 15.38, 12.18],
    [22.14, 176.97, 28.58, 18.57],
    [22.73, 193.11, 27.64, 19.05],
    [23.66, 176.63, 18.67, 16.74],
    [24.82, 198.42, 6.5, 6.12],
  ] as ReadonlyArray<readonly [number, number, number, number]>,
};

// ─── Tracer stars ──────────────────────────────────────────────────────────────────────

/** The tracers of the rotation scene: on SPOKES spokes, one every kpc from TRACER_R0 to TRACER_R1. */
export const SPOKES = 4;
export const TRACER_R0 = 2;
export const TRACER_R1 = 30;
export const TRACERS_PER_SPOKE = TRACER_R1 - TRACER_R0 + 1;

export interface Tracers {
  /** Radius (kpc) and starting azimuth β (rad; frame G's, increasing with the Galaxy's rotation) of each tracer. */
  R: Float64Array;
  beta0: Float64Array;
  /** Angular speed, rad/Myr: with the dark halo, and with the stars and gas alone. */
  omegaAll: Float64Array;
  omegaVisible: Float64Array;
}

/** The tracers, spoke by spoke (each spoke's tracers in order outwards), on spokes through the Sun's azimuth and at right angles. */
export function makeTracers(): Tracers {
  const n = SPOKES * TRACERS_PER_SPOKE;
  const t: Tracers = { R: new Float64Array(n), beta0: new Float64Array(n), omegaAll: new Float64Array(n), omegaVisible: new Float64Array(n) };
  for (let s = 0; s < SPOKES; s++) {
    for (let j = 0; j < TRACERS_PER_SPOKE; j++) {
      const i = s * TRACERS_PER_SPOKE + j;
      const R = TRACER_R0 + j;
      t.R[i] = R;
      t.beta0[i] = (2 * Math.PI * s) / SPOKES;
      t.omegaAll[i] = (circularSpeed(R) / R) * RAD_PER_MYR_PER_KMS_KPC;
      t.omegaVisible[i] = (visibleSpeed(R) / R) * RAD_PER_MYR_PER_KMS_KPC;
    }
  }
  return t;
}

/**
 * Where tracer i is (frame G, kpc, in the midplane) `myr` million years after the start, with the halo (`all`) or with
 * the visible mass alone: (x, y) = (−R cos β, R sin β), β = β0 + Ω t.
 */
export function tracerAt(t: Tracers, i: number, myr: number, all: boolean, out: [number, number, number]): [number, number, number] {
  const beta = t.beta0[i] + (all ? t.omegaAll[i] : t.omegaVisible[i]) * myr;
  out[0] = -t.R[i] * Math.cos(beta);
  out[1] = t.R[i] * Math.sin(beta);
  out[2] = 0;
  return out;
}
