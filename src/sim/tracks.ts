/**
 * Chebyshev trajectories for dwarf planets, TNOs, comets, interstellar objects and spacecraft,
 * fitted to JPL Horizons by scripts/build-tracks.mjs (format: docs/data/tracks.md).
 *
 * Positions are ecliptic-J2000 x, y, z in km, relative to a named centre. Time is TDB days
 * since J2000.0 (JD 2451545.0 TDB); astronomy-engine's AstroTime.tt can be passed directly.
 *
 * Each body is a list of pieces. A piece covers [t0, t1] relative to one centre ('sun',
 * 'earth', 'jupiter', ...) with adaptive Chebyshev segments. Near a planet, a spacecraft is
 * stored relative to that planet so the flyby is exact against the app's planet; the planet
 * piece overlaps the heliocentric one by a short blend interval at each end, and
 * `evalTrack` reports both there with a smooth weight so the app can fade between them. Outside
 * the Horizons span a body falls back to two-body motion from the edge state ('extrapolated'),
 * sits at its launch point ('before-launch') or is flagged 'unknown'.
 *
 * JPL's data contain a few position jumps (where Horizons joins separately fitted trajectory
 * files, and where this file switches from one JPL orbit solution of a comet or of Arrokoth to
 * the next). They are returned exactly as they are by default, so every position is within the
 * stated bound of the Horizons solution in force at that instant. `{ smoothJumps: true }` spreads
 * each jump over a short ramp for display and reports the displacement as `adjustedKm`.
 *
 * No dependencies. The per-frame path, Tracks.sample, allocates nothing: it writes into an object
 * the body owns (evalTrack and evalState return fresh copies, for code that keeps them).
 */

export type Vec3 = [number, number, number];
export type Regime = 'precise' | 'extrapolated' | 'before-launch' | 'unknown';

export interface TrackResult {
  /** Position relative to `centre`, km, ecliptic J2000. */
  pos: Vec3;
  /** 'sun' | 'ssb' | 'earth' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto' | 'arrokoth'. */
  centre: string;
  regime: Regime;
  /**
   * Present only inside a blend interval: the same body relative to a second centre. The
   * displayed position is (1 − weight)·(centre + pos) + weight·(blend.centre + blend.pos).
   * Both are within the stated accuracy of Horizons; the blend only hides the offset between
   * the app's planet and JPL's.
   */
  blend?: { pos: Vec3; centre: string; weight: number };
  /**
   * Present only with `smoothJumps` and inside a jump ramp (see `PieceIndex.jumps`): how far, in
   * km, the returned position has been moved off the Horizons fit to spread the jump out (at most
   * half the jump). Such positions do not meet the stated accuracy.
   */
  adjustedKm?: number;
}

export interface EvalOptions {
  /**
   * Spread every jump in the data over a smoothstep ramp centred on it, so the path is
   * continuous. Default false: positions are exactly the fit to Horizons, jumps included.
   */
  smoothJumps?: boolean;
  /** Deprecated: the default is now the unmodified fit. `raw: true` overrides `smoothJumps`. */
  raw?: boolean;
}

export interface TrackState extends TrackResult {
  /** Velocity relative to `centre`, km/s (and blend.vel inside a blend interval). */
  vel: Vec3;
  blend?: { pos: Vec3; vel: Vec3; centre: string; weight: number };
}

// ─── Index format ─────────────────────────────────────────────────────────────────────────

export interface TwoBodyFallback {
  regime: 'extrapolated';
  model: 'two-body';
  centre: string;
  /** Epoch of the state, TDB days since J2000. */
  epoch: number;
  r: Vec3;
  /** km/s */
  v: Vec3;
  /** Gravitational parameter, km³/s². */
  mu: number;
}
export interface FixedFallback {
  regime: 'before-launch' | 'unknown';
  centre: string;
  epoch: number;
  pos: Vec3;
}
export type Fallback = TwoBodyFallback | FixedFallback;

export interface PieceIndex {
  centre: string;
  role: 'outer' | 'inner';
  t0: number;
  t1: number;
  seg0: number;
  segCount: number;
  /** Length of the fade-in at t0 and fade-out at t1 (days), inner pieces only. */
  blendIn: number;
  blendOut: number;
  tolKm: number;
  fineTolKm?: number;
  fineRadiusKm?: number;
  /**
   * Jumps in the data: `cause` 'source' where Horizons itself joins separately fitted
   * trajectories (Voyager 1 on 1981-01-01, Pioneer 10's file boundaries, ...), and
   * 'solution-switch' where this track moves from one JPL orbit solution (`from`) to the next
   * (`to`). `jump` = position just after t minus just before (km, relative to this piece's
   * centre). With `smoothJumps` the evaluator spreads it over [t − rampDays/2, t + rampDays/2].
   */
  jumps?: { t: number; jump: Vec3; jumpKm: number; rampDays: number; cause?: 'source' | 'solution-switch'; from?: string; to?: string }[];
}

export interface BodyIndex {
  name: string;
  designation?: string;
  kind: string;
  precise: [number, number];
  pieces: PieceIndex[];
  before: Fallback;
  after: Fallback;
  accuracy: { requirementKm: number; maxKm: number; rmsKm: number; [k: string]: unknown };
  notes?: string[];
  [k: string]: unknown;
}

export interface TracksIndex {
  format: 'lightspeed-tracks';
  version: number;
  centres: Record<string, { horizons: string; label: string; track?: string }>;
  bodies: Record<string, BodyIndex>;
  [k: string]: unknown;
}

// ─── Two-body motion ──────────────────────────────────────────────────────────────────────

const TAU = 2 * Math.PI;
const DAY_S = 86400;

/** Solve Kepler's equation M = E − e sin E (0 ≤ e < 1); safeguarded Newton on [m − e, m + e]. */
export function solveKeplerElliptic(M: number, e: number): number {
  const turns = Math.floor(M / TAU);
  const m = M - turns * TAU; // 0 ≤ m < 2π
  let lo = m - e;
  let hi = m + e;
  let E = e < 0.8 ? m + e * Math.sin(m) : Math.PI;
  E = Math.min(hi, Math.max(lo, E));
  for (let i = 0; i < 100; i++) {
    const f = E - e * Math.sin(E) - m;
    if (f > 0) hi = E;
    else lo = E;
    const d = f / (1 - e * Math.cos(E));
    let next = E - d;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    if (Math.abs(next - E) <= 1e-15 * Math.max(1, Math.abs(E))) {
      E = next;
      break;
    }
    E = next;
  }
  return E + turns * TAU;
}

/**
 * Solve the hyperbolic Kepler equation M = e sinh H − H (e > 1) for any M, including the very
 * large |M| of centuries-long extrapolation and eccentricities like 3I/ATLAS's 6.1. The root is
 * bracketed by 0 ≤ H ≤ asinh(M / (e − 1)) (for M ≥ 0); Newton steps that leave the bracket are
 * replaced by bisection, so it always converges.
 */
export function solveKeplerHyperbolic(M: number, e: number): number {
  if (M === 0) return 0;
  const sign = M < 0 ? -1 : 1;
  const m = Math.abs(M);
  let lo = 0;
  let hi = Math.asinh(m / (e - 1));
  // Starting guess: the large-M asymptote, or the cubic small-H form near e = 1.
  let H = m > 6 * e ? Math.log((2 * m) / e) : Math.min(hi, Math.cbrt((6 * m) / e));
  if (!(H > lo && H < hi)) H = 0.5 * (lo + hi);
  for (let i = 0; i < 200; i++) {
    const f = e * Math.sinh(H) - H - m;
    if (f > 0) hi = H;
    else lo = H;
    const d = f / (e * Math.cosh(H) - 1);
    let next = H - d;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    if (Math.abs(next - H) <= 1e-15 * Math.max(1, H)) {
      H = next;
      break;
    }
    H = next;
  }
  return sign * H;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.sqrt(dot(a, a));

/** Conic elements prepared once per fallback. */
interface Conic {
  kind: 'ellipse' | 'hyperbola' | 'parabolic';
  mu: number;
  r0: Vec3;
  v0: Vec3;
  a: number;
  e: number;
  n: number;
  M0: number;
  P: Vec3;
  Q: Vec3;
}

function makeConic(r0: Vec3, v0: Vec3, mu: number): Conic {
  const r = len(r0);
  const v2 = dot(v0, v0);
  const rv = dot(r0, v0);
  const h = cross(r0, v0);
  const hm = len(h);
  const k = v2 - mu / r;
  const ev: Vec3 = [(k * r0[0] - rv * v0[0]) / mu, (k * r0[1] - rv * v0[1]) / mu, (k * r0[2] - rv * v0[2]) / mu];
  const e = len(ev);
  const a = 1 / (2 / r - v2 / mu);
  const base = { mu, r0, v0, a, e };
  if (Math.abs(e - 1) < 1e-6 || e < 1e-12 || hm === 0) return { ...base, kind: 'parabolic', n: 0, M0: 0, P: [1, 0, 0], Q: [0, 1, 0] };
  const P: Vec3 = [ev[0] / e, ev[1] / e, ev[2] / e];
  const W: Vec3 = [h[0] / hm, h[1] / hm, h[2] / hm];
  const Q = cross(W, P);
  if (e < 1) {
    const n = Math.sqrt(mu / (a * a * a));
    const E0 = Math.atan2(rv / Math.sqrt(mu * a), 1 - r / a);
    return { ...base, kind: 'ellipse', n, M0: E0 - e * Math.sin(E0), P, Q };
  }
  const n = Math.sqrt(mu / -(a * a * a));
  const H0 = Math.asinh(rv / (e * Math.sqrt(-mu * a)));
  return { ...base, kind: 'hyperbola', n, M0: e * Math.sinh(H0) - H0, P, Q };
}

function conicState(c: Conic, dt: number): { r: Vec3; v: Vec3 } {
  const out = { r: [0, 0, 0] as Vec3, v: [0, 0, 0] as Vec3 };
  conicInto(c, dt, out.r, out.v);
  return out;
}

/**
 * The conic's state `dt` seconds from its epoch, written into `r` and `v` (km, km/s). Allocates
 * nothing for ellipses and hyperbolas (the per-frame path); near-parabolic orbits (none in the
 * current file) go through the universal-variable solver, which does.
 */
function conicInto(c: Conic, dt: number, r: Vec3, v: Vec3): void {
  if (c.kind === 'parabolic') {
    const s = universal(c.r0, c.v0, dt, c.mu);
    r[0] = s.r[0];
    r[1] = s.r[1];
    r[2] = s.r[2];
    v[0] = s.v[0];
    v[1] = s.v[1];
    v[2] = s.v[2];
    return;
  }
  const { a, e, n, P, Q } = c;
  let x: number;
  let y: number;
  let vx: number;
  let vy: number;
  if (c.kind === 'ellipse') {
    const E = solveKeplerElliptic(c.M0 + n * dt, e);
    const b = a * Math.sqrt(1 - e * e);
    const cE = Math.cos(E);
    const sE = Math.sin(E);
    const Ed = n / (1 - e * cE);
    x = a * (cE - e);
    y = b * sE;
    vx = -a * sE * Ed;
    vy = b * cE * Ed;
  } else {
    const H = solveKeplerHyperbolic(c.M0 + n * dt, e);
    const A = -a;
    const b = A * Math.sqrt(e * e - 1);
    const cH = Math.cosh(H);
    const sH = Math.sinh(H);
    const Hd = n / (e * cH - 1);
    x = A * (e - cH);
    y = b * sH;
    vx = -A * sH * Hd;
    vy = b * cH * Hd;
  }
  r[0] = x * P[0] + y * Q[0];
  r[1] = x * P[1] + y * Q[1];
  r[2] = x * P[2] + y * Q[2];
  v[0] = vx * P[0] + vy * Q[0];
  v[1] = vx * P[1] + vy * Q[1];
  v[2] = vx * P[2] + vy * Q[2];
}

function stumpff(z: number): [number, number] {
  if (z > 1e-8) {
    const s = Math.sqrt(z);
    return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / (s * s * s)];
  }
  if (z < -1e-8) {
    const s = Math.sqrt(-z);
    return [(Math.cosh(s) - 1) / -z, (Math.sinh(s) - s) / (s * s * s)];
  }
  return [1 / 2 - z / 24, 1 / 6 - z / 120];
}

/** Universal-variable propagation, used for near-parabolic fallbacks (|e − 1| < 1e-6). */
function universal(r0: Vec3, v0: Vec3, dt: number, mu: number): { r: Vec3; v: Vec3 } {
  const r0m = len(r0);
  const vr0 = dot(r0, v0) / r0m;
  const alpha = 2 / r0m - dot(v0, v0) / mu;
  const sm = Math.sqrt(mu);
  let chi = (sm * dt) / r0m;
  for (let k = 0; k < 500; k++) {
    const z = alpha * chi * chi;
    const [C, S] = stumpff(z);
    const F = ((r0m * vr0) / sm) * chi * chi * C + (1 - alpha * r0m) * chi ** 3 * S + r0m * chi - sm * dt;
    const dF = ((r0m * vr0) / sm) * chi * (1 - z * S) + (1 - alpha * r0m) * chi * chi * C + r0m;
    let step = F / dF;
    if (chi !== 0 && Math.abs(step) > Math.abs(chi)) step = Math.sign(step) * Math.abs(chi) * 0.5;
    chi -= step;
    if (Math.abs(step) < 1e-13 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi;
  const [C, S] = stumpff(z);
  const f = 1 - ((chi * chi) / r0m) * C;
  const g = dt - (chi ** 3 * S) / sm;
  const r: Vec3 = [f * r0[0] + g * v0[0], f * r0[1] + g * v0[1], f * r0[2] + g * v0[2]];
  const rm = len(r);
  const fd = (sm / (rm * r0m)) * (alpha * chi ** 3 * S - chi);
  const gd = 1 - ((chi * chi) / rm) * C;
  return { r, v: [fd * r0[0] + gd * v0[0], fd * r0[1] + gd * v0[1], fd * r0[2] + gd * v0[2]] };
}

/** Two-body state after dt seconds from (r0 km, v0 km/s) about mu (km³/s²); ellipse or hyperbola. */
export function propagateConic(r0: Vec3, v0: Vec3, dt: number, mu: number): { r: Vec3; v: Vec3 } {
  return conicState(makeConic(r0, v0, mu), dt);
}

// ─── Chebyshev evaluation ─────────────────────────────────────────────────────────────────

/**
 * Hyperbolic and near-parabolic fallbacks are evaluated at most this many days (2.7 trillion
 * years) from their epoch, only so that every finite input gives a finite answer. Elliptic
 * fallbacks are periodic and need no limit.
 */
const T_LIMIT = 1e15;
/** Near-parabolic fallbacks follow the conic this far (days), then its tangent. */
const PARABOLIC_LIMIT = 1e6;

interface Piece extends PieceIndex {
  last: number; // index of the last segment used (cache for sequential queries)
}

/**
 * One evaluation, written in place: what `sample` hands out (the same object every call for a
 * body, so the per-frame path allocates nothing) and what evalTrack and evalState copy from.
 */
export interface TrackSampleOut {
  pos: Vec3;
  vel: Vec3;
  centre: string;
  regime: Regime;
  /** The blend while inside a hand-over, else undefined. */
  blend: { pos: Vec3; vel: Vec3; centre: string; weight: number } | undefined;
  /** How far `smoothJumps` moved the position (km), 0 when it did not. */
  adjustedKm: number;
}

interface Body extends BodyIndex {
  runtimePieces: Piece[];
  beforeConic?: Conic;
  afterConic?: Conic;
  /** Scratch for `sample`. */
  out: TrackSampleOut;
  /** Its blend, kept while `out.blend` is unset. */
  blendScratch: { pos: Vec3; vel: Vec3; centre: string; weight: number };
}

const smoothstep = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const smoothing = (o: EvalOptions) => !o.raw && o.smoothJumps === true;

const newOut = (): TrackSampleOut => ({ pos: [0, 0, 0], vel: [0, 0, 0], centre: 'sun', regime: 'precise', blend: undefined, adjustedKm: 0 });

/** Whether this machine stores numbers little-endian (every browser platform does), so the file's float64s can be viewed in place. */
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export class Tracks {
  readonly index: TracksIndex;
  private readonly t0: Float64Array;
  private readonly t1: Float64Array;
  private readonly off: Uint32Array;
  private readonly deg: Uint16Array;
  private readonly coef: Float64Array;
  private readonly bodyMap = new Map<string, Body>();
  /** Scratch for the public evaluators (copied out before they return). */
  private readonly tmp = newOut();
  private readonly tmpBlend = { pos: [0, 0, 0] as Vec3, vel: [0, 0, 0] as Vec3, centre: 'sun', weight: 0 };

  constructor(index: TracksIndex, binary: ArrayBuffer | Uint8Array) {
    if (index.format !== 'lightspeed-tracks' || index.version !== 1) throw new Error('tracks: unsupported index');
    const bytes = binary instanceof Uint8Array ? binary : new Uint8Array(binary);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== 'LTRK' || dv.getUint32(4, true) !== 1) throw new Error('tracks: not a tracks.bin v1 file');
    const segCount = dv.getUint32(8, true);
    const coefCount = dv.getUint32(12, true);
    const tableOffset = dv.getUint32(16, true);
    const coefOffset = dv.getUint32(20, true);
    if (dv.getUint32(24, true) !== bytes.byteLength) throw new Error('tracks: truncated tracks.bin');
    this.t0 = new Float64Array(segCount);
    this.t1 = new Float64Array(segCount);
    this.off = new Uint32Array(segCount);
    this.deg = new Uint16Array(segCount);
    for (let k = 0; k < segCount; k++) {
      const o = tableOffset + 24 * k;
      this.t0[k] = dv.getFloat64(o, true);
      this.t1[k] = dv.getFloat64(o + 8, true);
      this.off[k] = dv.getUint32(o + 16, true);
      this.deg[k] = dv.getUint16(o + 20, true);
    }
    // The coefficients (130,000 float64s): viewed in place where the file allows it (aligned and
    // little-endian: always, in a browser), else copied one by one.
    const start = bytes.byteOffset + coefOffset;
    if (LITTLE_ENDIAN && start % 8 === 0) this.coef = new Float64Array(bytes.buffer, start, coefCount);
    else {
      this.coef = new Float64Array(coefCount);
      for (let k = 0; k < coefCount; k++) this.coef[k] = dv.getFloat64(coefOffset + 8 * k, true);
    }
    this.index = index;
    for (const [id, b] of Object.entries(index.bodies)) {
      const body: Body = {
        ...b,
        runtimePieces: b.pieces.map((p) => ({ ...p, last: p.seg0 })),
        out: newOut(),
        blendScratch: { pos: [0, 0, 0], vel: [0, 0, 0], centre: 'sun', weight: 0 },
      };
      if (b.before.regime === 'extrapolated') body.beforeConic = makeConic(b.before.r, b.before.v, b.before.mu);
      if (b.after.regime === 'extrapolated') body.afterConic = makeConic(b.after.r, b.after.v, b.after.mu);
      this.bodyMap.set(id, body);
    }
  }

  /** Body ids in the file. */
  get bodies(): string[] {
    return [...this.bodyMap.keys()];
  }

  has(body: string): boolean {
    return this.bodyMap.has(body);
  }

  info(body: string): BodyIndex {
    return this.get(body);
  }

  private get(body: string): Body {
    const b = this.bodyMap.get(body);
    if (!b) throw new Error(`tracks: unknown body '${body}'`);
    return b;
  }

  /**
   * The regime at a date, from the index alone (no evaluation): 'precise' inside the Horizons
   * span, else the fallback's. Cheap enough to ask for every body every frame.
   */
  regimeAt(body: string, tdbDays: number): Regime {
    const b = this.get(body);
    if (tdbDays < b.precise[0]) return b.before.regime;
    if (tdbDays > b.precise[1]) return b.after.regime;
    return 'precise';
  }

  /** Segment of piece p containing t (the nearest one at the ends). */
  private segment(p: Piece, t: number): number {
    const lo = p.seg0;
    const hi = p.seg0 + p.segCount - 1;
    let k = p.last;
    if (!(this.t0[k] <= t && t <= this.t1[k])) {
      let a = lo;
      let b = hi;
      while (a < b) {
        const m = (a + b + 1) >> 1;
        if (this.t0[m] <= t) a = m;
        else b = m - 1;
      }
      k = a;
      p.last = k;
    }
    return k;
  }

  /** Chebyshev position (and velocity, km/s, when `vel` is given) of piece p at t. */
  private evalPiece(p: Piece, t: number, pos: Vec3, vel?: Vec3): void {
    const k = this.segment(p, t);
    const a = this.t0[k];
    const b = this.t1[k];
    const n = this.deg[k];
    const half = (b - a) / 2;
    const x = (t - (a + b) / 2) / half;
    const c = this.coef;
    for (let d = 0; d < 3; d++) {
      const o = this.off[k] + d * (n + 1);
      // Clenshaw for the value and its derivative together.
      let b1 = 0;
      let b2 = 0;
      let d1 = 0;
      let d2 = 0;
      for (let j = n; j >= 1; j--) {
        const tb = 2 * x * b1 - b2 + c[o + j];
        const td = 2 * b1 + 2 * x * d1 - d2;
        b2 = b1;
        b1 = tb;
        d2 = d1;
        d1 = td;
      }
      pos[d] = x * b1 - b2 + c[o];
      if (vel) vel[d] = (b1 + x * d1 - d2) / half / DAY_S;
    }
  }

  private fallbackInto(b: Body, which: 'before' | 'after', t: number, wantVel: boolean, out: TrackSampleOut): void {
    const f = which === 'before' ? b.before : b.after;
    out.centre = f.centre;
    out.regime = f.regime;
    out.blend = undefined;
    out.adjustedKm = 0;
    const p = out.pos;
    const v = out.vel;
    if (f.regime !== 'extrapolated') {
      p[0] = f.pos[0];
      p[1] = f.pos[1];
      p[2] = f.pos[2];
      v[0] = v[1] = v[2] = 0;
      return;
    }
    const conic = (which === 'before' ? b.beforeConic : b.afterConic)!;
    let dt = t - f.epoch; // days
    if (conic.kind === 'ellipse') {
      // Two-body motion on an ellipse repeats exactly every period: reduce the time first, so the
      // body keeps moving at any date and nothing overflows.
      const period = TAU / conic.n / DAY_S;
      dt %= period; // exact (fmod), and finite for every finite dt
      if (dt < 0) dt += period;
    } else dt = Math.max(-T_LIMIT, Math.min(T_LIMIT, dt));
    if (conic.kind === 'parabolic' && Math.abs(dt) > PARABOLIC_LIMIT) {
      // Universal variables overflow for near-parabolic orbits millions of days out; by then the
      // body is receding almost in a straight line, so continue along the tangent.
      const T = Math.sign(dt) * PARABOLIC_LIMIT;
      conicInto(conic, T * DAY_S, p, v);
      const k = (dt - T) * DAY_S;
      p[0] += v[0] * k;
      p[1] += v[1] * k;
      p[2] += v[2] * k;
    } else conicInto(conic, dt * DAY_S, p, v);
    if (!wantVel) v[0] = v[1] = v[2] = 0;
  }

  /**
   * Evaluate `body` at `tdbDays` into an object owned by the body and return it: no allocation,
   * for the per-frame path. The next call for the same body overwrites it; copy what you keep.
   * The velocity (km/s) is filled when `withVelocity`, else zero.
   */
  sample(body: string, tdbDays: number, withVelocity: boolean, options: EvalOptions = NO_OPTIONS): TrackSampleOut {
    const b = this.get(body);
    this.evaluateInto(b, tdbDays, withVelocity, smoothing(options), b.out, b.blendScratch);
    return b.out;
  }

  /** Full state (position and velocity). */
  evalState(body: string, tdbDays: number, options: EvalOptions = {}): TrackState {
    const s = this.evalTmp(body, tdbDays, true, options);
    const out: TrackState = { pos: [s.pos[0], s.pos[1], s.pos[2]], vel: [s.vel[0], s.vel[1], s.vel[2]], centre: s.centre, regime: s.regime };
    if (s.blend) out.blend = { pos: [...s.blend.pos], vel: [...s.blend.vel], centre: s.blend.centre, weight: s.blend.weight };
    if (s.adjustedKm > 0) out.adjustedKm = s.adjustedKm;
    return out;
  }

  /**
   * Position of `body` at `tdbDays` (TDB days since J2000) relative to the returned centre, and
   * the regime: 'precise' inside the Horizons fit, otherwise the fallback's regime.
   */
  evalTrack(body: string, tdbDays: number, options: EvalOptions = {}): TrackResult {
    const s = this.evalTmp(body, tdbDays, false, options);
    const out: TrackResult = { pos: [s.pos[0], s.pos[1], s.pos[2]], centre: s.centre, regime: s.regime };
    if (s.blend) out.blend = { pos: [...s.blend.pos], centre: s.blend.centre, weight: s.blend.weight };
    if (s.adjustedKm > 0) out.adjustedKm = s.adjustedKm;
    return out;
  }

  private evalTmp(body: string, t: number, wantVel: boolean, options: EvalOptions): TrackSampleOut {
    this.evaluateInto(this.get(body), t, wantVel, smoothing(options), this.tmp, this.tmpBlend);
    return this.tmp;
  }

  /**
   * Spread jumps over ramps centred on them (only with `smoothJumps`); returns how far the
   * position was moved (km). Before the jump the position moves towards the later side by
   * w·jump, after it back towards the earlier side by (1 − w)·jump, with w = smoothstep(u) and u
   * running from 0 to 1 over [t − rampDays/2, t + rampDays/2]: continuous in position and
   * velocity, and never more than half the jump away from the data.
   */
  private ramp(p: Piece, t: number, pos: Vec3, vel: Vec3 | undefined): number {
    let shift = 0;
    const jumps = p.jumps;
    if (!jumps) return 0;
    for (let i = 0; i < jumps.length; i++) {
      const j = jumps[i];
      const a = j.t - j.rampDays / 2;
      const b = j.t + j.rampDays / 2;
      if (t < a || t > b) continue;
      const u = (t - a) / j.rampDays;
      const w = u * u * (3 - 2 * u);
      const dw = (6 * u * (1 - u)) / (j.rampDays * DAY_S);
      const k = t < j.t ? w : w - 1;
      for (let d = 0; d < 3; d++) {
        pos[d] += k * j.jump[d];
        if (vel) vel[d] += dw * j.jump[d];
      }
      shift += Math.abs(k) * j.jumpKm;
    }
    return shift;
  }

  private evaluateInto(
    b: Body,
    t: number,
    wantVel: boolean,
    smooth: boolean,
    out: TrackSampleOut,
    blend: { pos: Vec3; vel: Vec3; centre: string; weight: number },
  ): void {
    if (Number.isNaN(t)) throw new RangeError('tracks: time is NaN');
    if (t < b.precise[0]) return this.fallbackInto(b, 'before', t, wantVel, out);
    if (t > b.precise[1]) return this.fallbackInto(b, 'after', t, wantVel, out);
    let outer: Piece | undefined;
    let inner: Piece | undefined;
    const pieces = b.runtimePieces;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (t < p.t0 || t > p.t1) continue;
      if (p.role === 'inner') inner = p;
      else outer = p;
    }
    let main = outer ?? inner;
    let tt = t;
    if (!main) {
      // Not reachable with a well-formed file (pieces tile the precise span); use the nearest.
      main = pieces.reduce((q, x) => (Math.min(Math.abs(t - x.t0), Math.abs(t - x.t1)) < Math.min(Math.abs(t - q.t0), Math.abs(t - q.t1)) ? x : q));
      tt = Math.max(main.t0, Math.min(main.t1, t));
      inner = outer = undefined;
      smooth = false;
    }
    const vel = out.vel;
    this.evalPiece(main, tt, out.pos, wantVel ? vel : undefined);
    if (!wantVel) vel[0] = vel[1] = vel[2] = 0;
    out.centre = main.centre;
    out.regime = 'precise';
    out.adjustedKm = 0;
    out.blend = undefined;
    if (smooth) out.adjustedKm = this.ramp(main, t, out.pos, wantVel ? vel : undefined);
    if (outer && inner) {
      let w = 1;
      if (inner.blendIn > 0 && t < inner.t0 + inner.blendIn) w = smoothstep((t - inner.t0) / inner.blendIn);
      else if (inner.blendOut > 0 && t > inner.t1 - inner.blendOut) w = smoothstep((inner.t1 - t) / inner.blendOut);
      const bv = blend.vel;
      this.evalPiece(inner, t, blend.pos, wantVel ? bv : undefined);
      if (!wantVel) bv[0] = bv[1] = bv[2] = 0;
      if (smooth) out.adjustedKm = Math.max(out.adjustedKm, this.ramp(inner, t, blend.pos, wantVel ? bv : undefined));
      blend.centre = inner.centre;
      blend.weight = w;
      out.blend = blend;
    }
  }

  /**
   * Heliocentric position with centres resolved by `centreHelio` (heliocentric ecliptic-J2000
   * km of 'ssb', 'earth', 'venus', 'jupiter', ...; the app uses astronomy-engine). Track
   * centres such as 'arrokoth' are resolved from this file. Blends are applied.
   *
   * `centreHelio` receives TDB days since J2000. With astronomy-engine, build the time from TT,
   * `AstroTime.FromTerrestrialTime(tdbDays)`, not `MakeTime` (which reads its argument as UT):
   * read as UT, the time is off by ΔT and the barycentre by ΔT times its speed (about 4 km near
   * 2200, more further out), which shows as a step where 'ssb' fallbacks take over.
   */
  evalHelio(
    body: string,
    tdbDays: number,
    centreHelio: (centre: string, tdbDays: number) => Vec3,
    options: EvalOptions = {},
  ): { pos: Vec3; regime: Regime } {
    const r = this.evalTrack(body, tdbDays, options);
    const place = (centre: string, p: Vec3): Vec3 => {
      const c = this.centrePosition(centre, tdbDays, centreHelio);
      return [c[0] + p[0], c[1] + p[1], c[2] + p[2]];
    };
    let pos = place(r.centre, r.pos);
    if (r.blend) {
      const q = place(r.blend.centre, r.blend.pos);
      const w = r.blend.weight;
      pos = [pos[0] + w * (q[0] - pos[0]), pos[1] + w * (q[1] - pos[1]), pos[2] + w * (q[2] - pos[2])];
    }
    return { pos, regime: r.regime };
  }

  private centrePosition(centre: string, t: number, centreHelio: (centre: string, tdbDays: number) => Vec3): Vec3 {
    if (centre === 'sun') return [0, 0, 0];
    const track = this.index.centres[centre]?.track;
    if (track && this.bodyMap.has(track)) return this.evalHelio(track, t, centreHelio).pos;
    return centreHelio(centre, t);
  }
}

const NO_OPTIONS: EvalOptions = {};

/** Parse tracks.json (object) and tracks.bin (bytes). */
export function parseTracks(index: TracksIndex, binary: ArrayBuffer | Uint8Array): Tracks {
  return new Tracks(index, binary);
}

/** Fetch and parse `${base}tracks.json` and its binary (browser or any fetch-capable runtime). */
export async function loadTracks(base = '/data/'): Promise<Tracks> {
  const index = (await (await fetch(`${base}tracks.json`)).json()) as TracksIndex & { binary?: string };
  const bin = await (await fetch(`${base}${index.binary ?? 'tracks.bin'}`)).arrayBuffer();
  return new Tracks(index, bin);
}
