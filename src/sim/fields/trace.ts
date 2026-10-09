/**
 * Tracing a field line (docs/data/fields.md §1): dx/ds = ±B̂(x), the unit field, by the classical Runge–Kutta step
 * with its length set by step doubling: each step is taken once whole and once as two halves, the difference is the
 * error, and the step grows or shrinks to keep it near a tolerance relative to the distance from the centre (the
 * accepted point is the two halves', Richardson-corrected). It stops on the body's surface (an oblate spheroid; the
 * last step is cut back to land on it), beyond an outer radius (the Sun's source surface, or a drawing limit), after a
 * maximum length or a maximum number of steps.
 *
 * Lengths in the model's reference radii, in its own frame. Allocates only the points it returns.
 */

/** The field's direction is read from this: B at (x, y, z) into out[0..2]. */
export type FieldFn = (x: number, y: number, z: number, out: Float64Array) => void;

export interface TraceOptions {
  /** Polar / equatorial radius of the surface (z the polar axis). */
  polarRatio: number;
  /** Stop beyond this radius. */
  rMax: number;
  /** Stop after this length. */
  sMax: number;
  maxSteps: number;
  /** Error per step, as a fraction of the distance from the centre. */
  tol: number;
}

export type TraceEnd = 'surface' | 'outer' | 'length' | 'steps' | 'null';

export interface TraceResult {
  end: TraceEnd;
  /** Length traced, reference radii. */
  length: number;
}

const k1 = new Float64Array(3);
const k2 = new Float64Array(3);
const k3 = new Float64Array(3);
const k4 = new Float64Array(3);
const b = new Float64Array(3);
const full = new Float64Array(3);
const half = new Float64Array(3);
const mid = new Float64Array(3);

/** The unit field times `sign` at p into out; false where the field vanishes. */
function dir(f: FieldFn, x: number, y: number, z: number, sign: number, out: Float64Array): boolean {
  f(x, y, z, b);
  const l = Math.hypot(b[0], b[1], b[2]);
  if (!(l > 0)) return false;
  const s = sign / l;
  out[0] = b[0] * s;
  out[1] = b[1] * s;
  out[2] = b[2] * s;
  return true;
}

/** One RK4 step of length h from p into out. */
function rk4(f: FieldFn, p: ArrayLike<number>, h: number, sign: number, out: Float64Array): boolean {
  if (!dir(f, p[0], p[1], p[2], sign, k1)) return false;
  if (!dir(f, p[0] + 0.5 * h * k1[0], p[1] + 0.5 * h * k1[1], p[2] + 0.5 * h * k1[2], sign, k2)) return false;
  if (!dir(f, p[0] + 0.5 * h * k2[0], p[1] + 0.5 * h * k2[1], p[2] + 0.5 * h * k2[2], sign, k3)) return false;
  if (!dir(f, p[0] + h * k3[0], p[1] + h * k3[1], p[2] + h * k3[2], sign, k4)) return false;
  for (let i = 0; i < 3; i++) out[i] = p[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return true;
}

/** Inside the spheroid x² + y² + (z/q)² < 1. */
export const insideSurface = (x: number, y: number, z: number, q: number): boolean => x * x + y * y + (z * z) / (q * q) < 1;

/**
 * Trace from `start` along sign · B̂, appending each accepted point (x, y, z) to `out` (the start first). The line
 * ends on the surface exactly when it comes back to it.
 */
export function traceLine(f: FieldFn, start: readonly number[], sign: number, o: TraceOptions, out: number[]): TraceResult {
  const p = [start[0], start[1], start[2]];
  out.push(p[0], p[1], p[2]);
  let s = 0;
  let h = 0.01 * Math.max(1, Math.hypot(p[0], p[1], p[2]));
  for (let step = 0; step < o.maxSteps; step++) {
    const r = Math.hypot(p[0], p[1], p[2]);
    const hMax = 0.08 * r;
    const hMin = 1e-4 * r;
    h = Math.min(Math.max(h, hMin), hMax);
    // Step doubling: whole, then two halves.
    if (!rk4(f, p, h, sign, full)) return { end: 'null', length: s };
    if (!rk4(f, p, 0.5 * h, sign, mid) || !rk4(f, mid, 0.5 * h, sign, half)) return { end: 'null', length: s };
    const err = Math.hypot(half[0] - full[0], half[1] - full[1], half[2] - full[2]) / 15;
    const tol = o.tol * r;
    if (err > tol && h > hMin * 1.0001) {
      h *= Math.max(0.2, 0.9 * (tol / err) ** 0.2);
      step--;
      continue;
    }
    for (let i = 0; i < 3; i++) half[i] += (half[i] - full[i]) / 15;
    // Back on the surface: cut the step where it crosses (bisection on the chord), and stop.
    if (insideSurface(half[0], half[1], half[2], o.polarRatio)) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const m = 0.5 * (lo + hi);
        if (insideSurface(p[0] + m * (half[0] - p[0]), p[1] + m * (half[1] - p[1]), p[2] + m * (half[2] - p[2]), o.polarRatio)) hi = m;
        else lo = m;
      }
      const t = 0.5 * (lo + hi);
      out.push(p[0] + t * (half[0] - p[0]), p[1] + t * (half[1] - p[1]), p[2] + t * (half[2] - p[2]));
      return { end: 'surface', length: s + t * h };
    }
    const rr = Math.hypot(half[0], half[1], half[2]);
    if (rr >= o.rMax) {
      // Out through the outer sphere: end on it (on the chord, where |p + t (q − p)| = rMax).
      const dx = half[0] - p[0];
      const dy = half[1] - p[1];
      const dz = half[2] - p[2];
      const A = dx * dx + dy * dy + dz * dz;
      const B = 2 * (p[0] * dx + p[1] * dy + p[2] * dz);
      const C = r * r - o.rMax * o.rMax;
      const t = Math.min(1, Math.max(0, (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A)));
      out.push(p[0] + t * dx, p[1] + t * dy, p[2] + t * dz);
      return { end: 'outer', length: s + t * h };
    }
    p[0] = half[0];
    p[1] = half[1];
    p[2] = half[2];
    s += h;
    out.push(p[0], p[1], p[2]);
    if (s >= o.sMax) return { end: 'length', length: s };
    if (err > 0) h *= Math.min(4, 0.9 * (tol / err) ** 0.2);
    else h *= 4;
  }
  return { end: 'steps', length: s };
}
