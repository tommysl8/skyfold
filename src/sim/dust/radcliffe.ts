/**
 * The Radcliffe Wave: a 2.7 kpc chain of the Sun's nearest star-forming clouds, from Canis Major through Orion, Perseus
 * and Cepheus to Cygnus, that rises and falls through the Galaxy's plane by about 200 pc (Alves et al. 2020, Nature
 * 578, 237). Konietzka et al. (2024, Nature 628, 62) found that it also oscillates: its young star clusters move up and
 * down with it, as a wave travelling away from the Galactic centre would.
 *
 * The shape is Konietzka et al.'s model (their Methods, equations (4), (6) and (9)), with the best fit to the
 * molecular clouds and the star clusters together (their Extended Data Table 2, column 6):
 *
 *   in the plane, a quadratic curve through three anchor points (x0, y0), (x1, y1), (x2, y2), heliocentric galactic pc;
 *   s, the distance along it from the Canis Major end;
 *   z(s) = ζ(s) sin(2π Λ(s) + φ),   ζ(s) = −A / (1 + ((s − s0) / δ)²),   Λ(s) = s / (p − γ s)
 *
 * (equation (4) with B = 1 and ω0 t = 0: the wave as it is now, which is all the clouds' places constrain). The paper
 * gives the anchors, not how the quadratic runs through them; the curve here passes through all three, the middle one
 * half-way in its parameter (sim/dust/radcliffe.test.ts checks it against the clouds the papers place on the Wave).
 * The Wave's radius, the scatter of its clouds about this line, is 47 pc (Konietzka et al. 2024).
 */
import type { Vec3 } from '../galaxy/frames';

/** Konietzka et al. (2024), Extended Data Table 2, column 6 (molecular clouds and star clusters). */
export const RADCLIFFE_FIT = {
  x0: -852.99,
  y0: -807.94,
  x1: -275.13,
  y1: 30.48,
  x2: 293.84,
  y2: 1387.37,
  /** pc */
  p: 4779.9,
  /** pc */
  A: 218.64,
  /** pc */
  delta: 740.01,
  /** pc */
  s0: 544.99,
  gamma: 1.46,
  /** rad */
  phi: -0.15,
} as const;

/** The scatter of the clouds about the model: the Wave's radius, pc (Konietzka et al. 2024, Methods). */
export const RADCLIFFE_RADIUS_PC = 47;

/** The quadratic baseline at parameter u ∈ [0, 1] (Lagrange through the anchors at u = 0, ½, 1). */
function baseline(u: number): [number, number] {
  const f = RADCLIFFE_FIT;
  const l0 = 2 * (u - 0.5) * (u - 1);
  const l1 = -4 * u * (u - 1);
  const l2 = 2 * u * (u - 0.5);
  return [l0 * f.x0 + l1 * f.x1 + l2 * f.x2, l0 * f.y0 + l1 * f.y1 + l2 * f.y2];
}

const TABLE_N = 512;
/** Arc length along the baseline at u = i / TABLE_N. */
const ARC: Float64Array = (() => {
  const a = new Float64Array(TABLE_N + 1);
  let prev = baseline(0);
  for (let i = 1; i <= TABLE_N; i++) {
    const p = baseline(i / TABLE_N);
    a[i] = a[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return a;
})();

/** The baseline's length in the plane, pc. */
export const RADCLIFFE_LENGTH_PC = ARC[TABLE_N];

/** The parameter u at arc length s (pc) along the baseline. */
function uAt(s: number): number {
  if (s <= 0) return 0;
  if (s >= RADCLIFFE_LENGTH_PC) return 1;
  let lo = 0;
  let hi = TABLE_N;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ARC[m] <= s) lo = m;
    else hi = m;
  }
  const t = (s - ARC[lo]) / (ARC[hi] - ARC[lo]);
  return (lo + t) / TABLE_N;
}

/** The Wave's height above the Galactic plane (pc, heliocentric z) at distance s (pc) along it. */
export function radcliffeZ(s: number): number {
  const f = RADCLIFFE_FIT;
  const zeta = -f.A / (1 + ((s - f.s0) / f.delta) ** 2);
  const lambda = s / (f.p - f.gamma * s);
  return zeta * Math.sin(2 * Math.PI * lambda + f.phi);
}

/** The Wave's crest line at distance s (pc) along it: heliocentric galactic pc. */
export function radcliffePoint(s: number): Vec3 {
  const [x, y] = baseline(uAt(s));
  return [x, y, radcliffeZ(s)];
}

/** n + 1 points along the whole Wave (heliocentric galactic pc), evenly spaced in s. */
export function radcliffeLine(n = 128): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) out.push(radcliffePoint((i / n) * RADCLIFFE_LENGTH_PC));
  return out;
}

/** The nearest point of the Wave's line to p (pc), with its s and its distance (pc). */
export function nearestOnWave(p: Vec3, n = 1024): { s: number; point: Vec3; distancePc: number } {
  let best = { s: 0, point: radcliffePoint(0), distancePc: Infinity };
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * RADCLIFFE_LENGTH_PC;
    const q = radcliffePoint(s);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (d < best.distancePc) best = { s, point: q, distancePc: d };
  }
  return best;
}
