// Field lines of the Galaxy's regular magnetic field (magneticField.ts, UF23 base), traced for drawing
// (scene/GalacticField.tsx; docs/data/galactic-field.md).
//
// A field line is a curve everywhere tangent to B: dx/ds = B(x)/|B(x)|, s its length. It is integrated
// with fourth-order Runge–Kutta steps whose length adapts by step doubling: each step is taken once whole
// and once as two halves, the difference (/15, Richardson) is the error estimate, a step is accepted when
// that is below the tolerance and the next step's length scaled by (tol/err)^(1/5); a step that would turn
// the line by more than a few degrees is taken shorter, so the polyline drawn from the accepted points stays
// smooth on screen. A line ends where the field fades below a floor (the model's field has no edge: it falls
// off), where it leaves the volume the model was fitted to, after a length limit, or where it closes on
// itself (the toroidal halo's lines are circles where the X-field is nil).
//
// Seeds: the lines' density on the drawing stands for the field's strength only roughly (they are traced
// from seeds spread through each part, and lines converge and diverge as the field does), so the strength
// is also given by each line's brightness.

import { G_TO_UF23, UF23_BASE, discReference, uf23Field, type FieldVec } from './magneticField.ts';

export type Vec3 = [number, number, number];
export type FieldFn = (x: number, y: number, z: number, out: FieldVec) => FieldVec;

export interface TraceOptions {
  /** Absolute error allowed per step, kpc. */
  tol: number;
  /** Longest and shortest step, kpc. */
  hMax: number;
  hMin: number;
  /** The most a step may turn the line, radians. */
  maxTurn: number;
  /** Total length, kpc, either way from the seed. */
  maxLength: number;
  /** The field below which a line ends, µG. */
  minField: number;
  /** The volume: cylindrical radius and height, kpc. */
  rMax: number;
  zMax: number;
}

export const DEFAULT_TRACE: TraceOptions = {
  tol: 2e-4,
  hMax: 0.3,
  hMin: 1e-3,
  maxTurn: (4 * Math.PI) / 180,
  maxLength: 90,
  minField: 0.04,
  rMax: 21,
  zMax: 9,
};

/** Why a line ended. */
export type LineEnd = 'weak' | 'outside' | 'length' | 'closed' | 'stuck';

export interface TracedHalf {
  /** Points along the line from the seed (the seed first), kpc. */
  points: Vec3[];
  /** The field at each point, µG. */
  fields: FieldVec[];
  end: LineEnd;
  /** Its length, kpc. */
  length: number;
}

const tmpB: FieldVec = [0, 0, 0];

/** The unit tangent sgn · B/|B| at p into out; |B| returned (0 where it vanishes). */
function tangent(field: FieldFn, p: Vec3, sgn: number, out: Vec3): number {
  const b = field(p[0], p[1], p[2], tmpB);
  const m = Math.hypot(b[0], b[1], b[2]);
  if (m === 0) {
    out[0] = out[1] = out[2] = 0;
    return 0;
  }
  out[0] = (sgn * b[0]) / m;
  out[1] = (sgn * b[1]) / m;
  out[2] = (sgn * b[2]) / m;
  return m;
}

const k1: Vec3 = [0, 0, 0];
const k2: Vec3 = [0, 0, 0];
const k3: Vec3 = [0, 0, 0];
const k4: Vec3 = [0, 0, 0];
const q: Vec3 = [0, 0, 0];

/** One RK4 step of length h from p along sgn · B/|B| into out; false where the field vanishes on the way. */
function rk4(field: FieldFn, p: Vec3, h: number, sgn: number, out: Vec3): boolean {
  if (tangent(field, p, sgn, k1) === 0) return false;
  for (let i = 0; i < 3; i++) q[i] = p[i] + 0.5 * h * k1[i];
  if (tangent(field, q, sgn, k2) === 0) return false;
  for (let i = 0; i < 3; i++) q[i] = p[i] + 0.5 * h * k2[i];
  if (tangent(field, q, sgn, k3) === 0) return false;
  for (let i = 0; i < 3; i++) q[i] = p[i] + h * k3[i];
  if (tangent(field, q, sgn, k4) === 0) return false;
  for (let i = 0; i < 3; i++) out[i] = p[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return true;
}

/**
 * Trace one half of a line from `seed`, along B (sgn = 1) or against it (−1), with adaptive RK4
 * (step doubling). The seed is the first point.
 */
export function traceHalf(field: FieldFn, seed: Vec3, sgn: 1 | -1, o: TraceOptions = DEFAULT_TRACE): TracedHalf {
  const points: Vec3[] = [[seed[0], seed[1], seed[2]]];
  const b0 = field(seed[0], seed[1], seed[2], [0, 0, 0]);
  const fields: FieldVec[] = [b0];
  if (Math.hypot(b0[0], b0[1], b0[2]) < o.minField) return { points, fields, end: 'weak', length: 0 };
  let p: Vec3 = [seed[0], seed[1], seed[2]];
  let h = Math.min(o.hMax, 0.05);
  let length = 0;
  const full: Vec3 = [0, 0, 0];
  const mid: Vec3 = [0, 0, 0];
  const two: Vec3 = [0, 0, 0];
  const t0: Vec3 = [0, 0, 0];
  const t1: Vec3 = [0, 0, 0];
  let end: LineEnd = 'length';
  for (let guard = 0; guard < 200_000; guard++) {
    if (length >= o.maxLength) {
      end = 'length';
      break;
    }
    if (!rk4(field, p, h, sgn, full) || !rk4(field, p, h / 2, sgn, mid) || !rk4(field, mid, h / 2, sgn, two)) {
      end = 'weak';
      break;
    }
    const err = Math.hypot(two[0] - full[0], two[1] - full[1], two[2] - full[2]) / 15;
    tangent(field, p, sgn, t0);
    const m1 = tangent(field, two, sgn, t1);
    const turn = Math.acos(Math.max(-1, Math.min(1, t0[0] * t1[0] + t0[1] * t1[1] + t0[2] * t1[2])));
    if ((err > o.tol || turn > o.maxTurn) && h > o.hMin) {
      h = Math.max(o.hMin, h * Math.max(0.2, Math.min(0.9 * (o.tol / Math.max(err, 1e-30)) ** 0.2, turn > o.maxTurn ? (0.8 * o.maxTurn) / turn : 1)));
      continue;
    }
    // Accept, with the Richardson correction.
    const next: Vec3 = [two[0] + (two[0] - full[0]) / 15, two[1] + (two[1] - full[1]) / 15, two[2] + (two[2] - full[2]) / 15];
    length += h;
    p = next;
    points.push(next);
    fields.push(field(next[0], next[1], next[2], [0, 0, 0]));
    if (m1 < o.minField) {
      end = 'weak';
      break;
    }
    if (Math.hypot(next[0], next[1]) > o.rMax || Math.abs(next[2]) > o.zMax) {
      end = 'outside';
      break;
    }
    // Back at the seed (a closed line): join it to the seed and stop.
    const gap = Math.hypot(next[0] - seed[0], next[1] - seed[1], next[2] - seed[2]);
    if (length > 1 && gap < Math.max(1.5 * h, 0.02)) {
      points.push([seed[0], seed[1], seed[2]]);
      fields.push(b0);
      length += gap;
      end = 'closed';
      break;
    }
    const grow = err > 0 ? 0.9 * (o.tol / err) ** 0.2 : 2;
    h = Math.min(o.hMax, h * Math.min(2, Math.max(1, grow)), turn > 0 ? h * Math.max(1, (0.8 * o.maxTurn) / turn) : o.hMax);
    if (h < o.hMin) {
      end = 'stuck';
      break;
    }
  }
  return { points, fields, end, length };
}

/** A whole line through a seed: traced against B, then along it, so its points run in the direction of B. */
export interface FieldLine {
  points: Vec3[];
  fields: FieldVec[];
  /** Arc length at each point from the line's start, kpc (increasing along B). */
  arc: number[];
  closed: boolean;
  /** Which part the seed was put in. */
  part: SeedPart;
}

export function traceLine(field: FieldFn, seed: Vec3, part: SeedPart, o: TraceOptions = DEFAULT_TRACE): FieldLine {
  const fwd = traceHalf(field, seed, 1, o);
  let points: Vec3[];
  let fields: FieldVec[];
  if (fwd.end === 'closed') {
    points = fwd.points;
    fields = fwd.fields;
  } else {
    const back = traceHalf(field, seed, -1, o);
    points = back.points.slice(1).reverse().concat(fwd.points);
    fields = back.fields.slice(1).reverse().concat(fwd.fields);
  }
  const arc = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    arc.push(arc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return { points, fields, arc, closed: fwd.end === 'closed', part };
}

// ─── Seeds ───────────────────────────────────────────────────────────────────────────────

export type SeedPart = 'disc' | 'toroidal' | 'poloidal';

export interface Seed {
  p: Vec3;
  part: SeedPart;
}

/** A small deterministic generator (mulberry32), so the drawing is the same on every visit. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inverse-CDF samples: n values of x in [x0, x1] spread with density ∝ w(x), offsets fixed by `u`. */
function spread(n: number, x0: number, x1: number, w: (x: number) => number, u: () => number): number[] {
  const N = 2048;
  const cdf = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) cdf[i + 1] = cdf[i] + Math.max(0, w(x0 + ((i + 0.5) / N) * (x1 - x0)));
  const total = cdf[N];
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const target = ((k + 0.25 + 0.5 * u()) / n) * total;
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cdf[m] < target) lo = m;
      else hi = m;
    }
    const f = cdf[hi] > cdf[lo] ? (target - cdf[lo]) / (cdf[hi] - cdf[lo]) : 0;
    out.push(x0 + ((lo + f) / N) * (x1 - x0));
  }
  return out;
}

export interface SeedCounts {
  /** Disc lines (each runs the whole spiral from r ≈ 5 kpc out to 20). */
  disc: number;
  /** Halo lines, per hemisphere. */
  toroidal: number;
  /** X-field lines, crossing the plane inside r_p. */
  poloidal: number;
}

export const DEFAULT_SEEDS: SeedCounts = { disc: 48, toroidal: 14, poloidal: 24 };

/**
 * Seeds in the app's frame G (kpc), spread through each part of the field:
 *  - disc: every disc line is one of the logarithmic spirals φ₀ = const (the X-field nudges it out of the
 *    plane inside r_p), so the seeds go round one circle, r = 9 kpc in the paper's frame, at azimuths spread
 *    with density ∝ |B(r₀, φ₀)|: as many lines through each arm as its flux, the lines' density the field's;
 *    half in the plane, half 300 pc above or below it;
 *  - toroidal halo: on a grid of radius (2–12 kpc) and height (±1.5–8 kpc), more near the plane where
 *    the halo field is strongest;
 *  - X-field: in the plane inside r_p, with density ∝ the flux through the plane, B₀(a) · 2πa.
 */
export function fieldLineSeeds(n: SeedCounts = DEFAULT_SEEDS, seed = 23): Seed[] {
  const u = rng(seed);
  const out: Seed[] = [];
  const k = 1 / G_TO_UF23; // paper → G
  const golden = Math.PI * (3 - Math.sqrt(5));
  // Disc.
  const rDisc = 9;
  const phis = spread(n.disc, -Math.PI, Math.PI, (phi) => Math.abs(discReference(phi - Math.log(rDisc / UF23_BASE.disc.r0) / Math.tan((UF23_BASE.disc.pitchDeg * Math.PI) / 180))), u);
  phis.forEach((phi, i) => {
    const z = i % 2 === 0 ? 0 : i % 4 === 1 ? 0.3 : -0.3;
    out.push({ p: [k * rDisc * Math.cos(phi), k * rDisc * Math.sin(phi), k * z], part: 'disc' });
  });
  // Toroidal halo: heights spread with density ∝ e^(−|z|/z_t) (1 − h_d), radii ∝ r (1 − σ((r − r_t)/w_t)).
  const zt = UF23_BASE.toroidal.zt;
  for (const hemi of [1, -1]) {
    const zs = spread(n.toroidal, 1.2, 9, (z) => Math.exp(-z / zt), u);
    const rs = spread(n.toroidal, 1.5, 13, (r) => r / (1 + Math.exp((r - UF23_BASE.toroidal.rt) / UF23_BASE.toroidal.wt)), u);
    // Pair heights and radii in a shuffled order, so the grid is not a diagonal.
    for (let i = 0; i < n.toroidal; i++) {
      const j = (i * 7 + (hemi > 0 ? 3 : 5)) % n.toroidal;
      const phi = i * golden * 3 + (hemi > 0 ? 0 : 1);
      out.push({ p: [k * rs[j] * Math.cos(phi), k * rs[j] * Math.sin(phi), k * hemi * zs[i]], part: 'toroidal' });
    }
  }
  // X-field.
  const P = UF23_BASE.poloidal;
  const as = spread(n.poloidal, 0.05, P.rp + 4 * P.wp, (a) => a / (1 + Math.exp((a - P.rp) / P.wp)), u);
  as.forEach((a, i) => {
    const phi = i * golden + 0.5;
    out.push({ p: [k * a * Math.cos(phi), k * a * Math.sin(phi), 0], part: 'poloidal' });
  });
  return out;
}

/** The field in frame G (the model scaled to the app's R0: magneticField.ts fieldAtG), for tracing in G. */
export const fieldG: FieldFn = (x, y, z, out) => uf23Field(x * G_TO_UF23, y * G_TO_UF23, z * G_TO_UF23, out);

// ─── Packing for the GPU ─────────────────────────────────────────────────────────────────

export interface PackedLines {
  /** Points, frame G, kpc (x, y, z each). */
  position: Float32Array;
  /** The field at each point, µG along G's axes. */
  field: Float32Array;
  /** Arc length along the line, kpc, increasing along B. */
  arc: Float32Array;
  /** Pairs of point indices: the segments. */
  index: Uint32Array;
  lines: number;
  points: number;
}

export function packLines(lines: readonly FieldLine[]): PackedLines {
  let n = 0;
  let segs = 0;
  for (const l of lines) {
    if (l.points.length < 2) continue;
    n += l.points.length;
    segs += l.points.length - 1;
  }
  const position = new Float32Array(3 * n);
  const field = new Float32Array(3 * n);
  const arc = new Float32Array(n);
  const index = new Uint32Array(2 * segs);
  let v = 0;
  let s = 0;
  let count = 0;
  for (const l of lines) {
    if (l.points.length < 2) continue;
    count++;
    for (let i = 0; i < l.points.length; i++) {
      position.set(l.points[i], 3 * (v + i));
      field.set(l.fields[i], 3 * (v + i));
      arc[v + i] = l.arc[i];
      if (i > 0) {
        index[2 * s] = v + i - 1;
        index[2 * s + 1] = v + i;
        s++;
      }
    }
    v += l.points.length;
  }
  return { position, field, arc, index, lines: count, points: n };
}

/** Trace every seed's line through the model in frame G and pack them for drawing. */
export function buildFieldLines(seeds: readonly Seed[] = fieldLineSeeds(), o: TraceOptions = DEFAULT_TRACE): PackedLines {
  return packLines(seeds.map((s) => traceLine(fieldG, s.p, s.part, o)));
}
