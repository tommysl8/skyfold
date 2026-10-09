/**
 * The field lines drawn for a body (docs/data/fields.md §5): where they start, how far they are traced, and the
 * arrays the scene draws. Run in a worker (sim/fields/worker.ts); pure.
 *
 *  - A planet: footpoints on its surface in rings about its centred dipole, at the latitudes of dipole shells
 *    L = 1.15 … 2.2 stand-offs (λ = acos √(1/L), evenly in log L) and two rings nearer the poles, 12 longitudes each,
 *    in both hemispheres. Each line is traced away from the surface until it comes back (closed) or passes the drawing
 *    limit. A closed line is kept from its outward end only (from its inward end it would be drawn twice); where the
 *    magnetopause cuts one, both its ends are drawn up to the cut, as open lines (the scene cuts them whenever the
 *    Sun's direction in the planet's frame changes).
 *  - The Sun: footpoints drawn by the photospheric field's strength (where the flux is, plus a floor so quiet regions
 *    and the poles have some), traced through the potential field to the surface (closed) or the source surface
 *    (open). Closed lines are kept from their outward ends only. Each open line goes on beyond the source surface as a
 *    Parker spiral (Parker 1958) for a 400 km/s wind: at fixed latitude, its longitude in the Sun's turning frame falls
 *    by Ω (r − R_ss) / v (Ω the Carrington rate, 14.1844° a day), out to 3 au. The current sheet is drawn as spirals
 *    from the source surface's neutral line, where B_r changes sign.
 */
import { dipole, fieldCartesian, FieldWork, type FieldKind, type Harmonics } from './harmonics';
import { traceLine, type TraceOptions } from './trace';
import { IAU_TO_BODY, type FieldModel, type Mat3 } from './models';
import { standoff } from './magnetopause';

/** Line kinds. */
export const CLOSED = 0;
export const OPEN = 1;
/** A Parker spiral's line (the Sun's open line, through the source surface and on). */
export const SPIRAL = 2;
/** The heliospheric current sheet. */
export const SHEET = 3;

export interface LineSet {
  /** Vertex positions, the body's frame (sim/bodies/rotation.ts), reference radii. */
  positions: Float32Array;
  /** Per vertex: ∫ ds / r from the line's first point (the dashes run along it, spaced in proportion to r). */
  phase: Float32Array;
  /** Per vertex: 0 at the line's first point to 1 at its last. */
  along: Float32Array;
  /** First vertex of each line, and one past the last (count + 1 entries). */
  starts: Uint32Array;
  /** Per line: +1 where the field leaves the body at its first point, −1 where it enters (0: the current sheet). */
  polarity: Int8Array;
  /** Per line: CLOSED, OPEN, SPIRAL or SHEET. */
  kind: Uint8Array;
  count: number;
}

interface Builder {
  pos: number[];
  phase: number[];
  along: number[];
  starts: number[];
  polarity: number[];
  kind: number[];
}

const builder = (): Builder => ({ pos: [], phase: [], along: [], starts: [], polarity: [], kind: [] });

/** Add a line (model-frame points) turned into the body frame. */
function addLine(b: Builder, pts: readonly number[], m: Mat3, pol: number, kind: number): void {
  const n = pts.length / 3;
  // A line that dips straight back into the surface (a field all but along it) is too short to draw.
  if (n < 4) return;
  b.starts.push(b.pos.length / 3);
  b.polarity.push(pol);
  b.kind.push(kind);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[3 * i];
    const y = pts[3 * i + 1];
    const z = pts[3 * i + 2];
    if (i > 0) {
      const dx = x - pts[3 * i - 3];
      const dy = y - pts[3 * i - 2];
      const dz = z - pts[3 * i - 1];
      const r = 0.5 * (Math.hypot(x, y, z) + Math.hypot(pts[3 * i - 3], pts[3 * i - 2], pts[3 * i - 1]));
      ph += Math.hypot(dx, dy, dz) / Math.max(r, 1e-6);
    }
    b.pos.push(m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z);
    b.phase.push(ph);
    b.along.push(i / (n - 1));
  }
}

function finish(b: Builder): LineSet {
  return {
    positions: new Float32Array(b.pos),
    phase: new Float32Array(b.phase),
    along: new Float32Array(b.along),
    starts: new Uint32Array([...b.starts, b.pos.length / 3]),
    polarity: new Int8Array(b.polarity),
    kind: new Uint8Array(b.kind),
    count: b.starts.length,
  };
}

/** A unit field direction's outward sense at a surface point of the spheroid (normal (x, y, z/q²)). */
function outwardSign(B: Float64Array, p: readonly number[], q: number): number {
  return B[0] * p[0] + B[1] * p[1] + (B[2] * p[2]) / (q * q) >= 0 ? 1 : -1;
}

/** Footpoint on the spheroid in direction u. */
function onSurface(u: readonly number[], q: number): number[] {
  const s = 1 / Math.sqrt(u[0] * u[0] + u[1] * u[1] + (u[2] * u[2]) / (q * q));
  return [u[0] * s, u[1] * s, u[2] * s];
}

/** The latitudes of the planet's footpoint rings about its dipole, degrees (dipole shells, then two nearer the pole). */
export function seedLatitudes(standoffR: number, rings = 8): number[] {
  const lo = Math.log(1.15);
  const hi = Math.log(2.2 * standoffR);
  const lat: number[] = [];
  for (let i = 0; i < rings; i++) {
    const L = Math.exp(lo + ((hi - lo) * i) / (rings - 1));
    lat.push((Math.acos(Math.sqrt(1 / L)) * 180) / Math.PI);
  }
  const top = lat[lat.length - 1];
  lat.push(top + (90 - top) / 3, top + (2 * (90 - top)) / 3);
  return lat;
}

/** A planet's (or Ganymede's) lines at a decimal year. */
export function planetLines(model: FieldModel, year: number, longitudes = 10): LineSet {
  const c = model.coefficients(year);
  const w = new FieldWork(c.degree);
  const kind: FieldKind = { kind: 'internal' };
  const f = (x: number, y: number, z: number, out: Float64Array) => fieldCartesian(c, kind, x, y, z, w, out);
  const q = model.polarRatio;
  const d = dipole(c);
  const e3 = d.moment;
  // e1 ⟂ e3, in the plane of e3 and the spin axis where it can be.
  let e1 = [-e3[0] * e3[2], -e3[1] * e3[2], 1 - e3[2] * e3[2]];
  let l = Math.hypot(e1[0], e1[1], e1[2]);
  if (l < 1e-6) {
    e1 = [1, 0, 0];
    l = 1;
  }
  e1 = e1.map((v) => v / l);
  const e2 = [e3[1] * e1[2] - e3[2] * e1[1], e3[2] * e1[0] - e3[0] * e1[2], e3[0] * e1[1] - e3[1] * e1[0]];
  const opts: TraceOptions = { polarRatio: q, rMax: model.limit * 1.02, sMax: 8 * model.limit, maxSteps: 3000, tol: 2e-5 };
  const b = builder();
  const B = new Float64Array(3);
  const pts: number[] = [];
  const lats = seedLatitudes(standoff(model.magnetopause));
  for (const hemi of [1, -1]) {
    lats.forEach((latDeg, ring) => {
      const la = (latDeg * Math.PI) / 180;
      for (let j = 0; j < longitudes; j++) {
        // Alternate rings are turned half a step, so the lines interleave.
        const lo = (2 * Math.PI * (j + (ring % 2) * 0.5)) / longitudes;
        const cl = Math.cos(la);
        const u = [0, 1, 2].map((k) => cl * (Math.cos(lo) * e1[k] + Math.sin(lo) * e2[k]) + hemi * Math.sin(la) * e3[k]);
        const p = onSurface(u, q);
        // A hair above the surface, so the first step starts outside it.
        const p0 = p.map((v) => v * 1.0005);
        f(p0[0], p0[1], p0[2], B);
        const sign = outwardSign(B, p0, q);
        pts.length = 0;
        const res = traceLine(f, p0, sign, opts, pts);
        const closed = res.end === 'surface';
        // A closed line, from its outward end only.
        if (closed && sign < 0) continue;
        addLine(b, pts, model.toBody, sign, closed ? CLOSED : OPEN);
      }
    });
  }
  return finish(b);
}

// ─── The Sun ──────────────────────────────────────────────────────────────────────────

/** The source surface, solar radii (as the Wilcox Solar Observatory's standard model). */
export const SOURCE_SURFACE = 2.5;
/** The Parker spirals' wind speed, km/s, and how far they are drawn, solar radii (3 au). */
export const WIND_KM_S = 400;
export const SPIRAL_END_RSUN = (3 * 149_597_870.7) / 695_700;
/** The Carrington rate, rad/s (14.1844° a day: the IAU's rotation of the Sun, which the app turns it by). */
export const CARRINGTON_RAD_S = ((14.1844 * Math.PI) / 180) / 86_400;
/** The spiral's twist: radians of longitude per solar radius out, Ω R☉ / v. */
export const SPIRAL_RAD_PER_RSUN = (CARRINGTON_RAD_S * 695_700) / WIND_KM_S;

/** A Parker spiral's points from (θ, φ) on the source surface (model frame: z north, x Carrington longitude 0). */
export function parkerSpiral(cosT: number, sinT: number, phi0: number, n: number, out: number[]): void {
  for (let i = 0; i < n; i++) {
    const r = SOURCE_SURFACE * (SPIRAL_END_RSUN / SOURCE_SURFACE) ** (i / (n - 1));
    const phi = phi0 - SPIRAL_RAD_PER_RSUN * (r - SOURCE_SURFACE);
    out.push(r * sinT * Math.cos(phi), r * sinT * Math.sin(phi), r * cosT);
  }
}

/** A small deterministic sequence in [0, 1) (the golden ratio's), so the same map gives the same lines. */
const golden = (k: number, a = 0.6180339887498949): number => (k * a) % 1;

export interface SunLineOptions {
  /** Footpoints drawn by flux. */
  seeds: number;
  /** Points on each spiral. */
  spiralPoints: number;
  /** Footpoints of the current sheet's spirals, along the neutral line, about this many degrees apart. */
  sheetStepDeg: number;
}

/** The Sun's lines from a rotation's coefficients (gauss; Carrington frame). */
export function sunLines(c: Harmonics, o: SunLineOptions = { seeds: 340, spiralPoints: 72, sheetStepDeg: 10 }): LineSet {
  const w = new FieldWork(c.degree);
  const kind: FieldKind = { kind: 'pfss', sourceSurface: SOURCE_SURFACE };
  const f = (x: number, y: number, z: number, out: Float64Array) => fieldCartesian(c, kind, x, y, z, w, out);
  const B = new Float64Array(3);
  // |B_r| on an equal-area grid of the photosphere (longitude × sine latitude).
  const NL = 120;
  const NZ = 60;
  const flux = new Float64Array(NL * NZ);
  let total = 0;
  for (let j = 0; j < NZ; j++) {
    const z = -1 + (2 * (j + 0.5)) / NZ;
    const s = Math.sqrt(1 - z * z);
    for (let i = 0; i < NL; i++) {
      const ph = (2 * Math.PI * (i + 0.5)) / NL;
      const x = s * Math.cos(ph);
      const y = s * Math.sin(ph);
      f(x, y, z, B);
      const br = Math.abs(B[0] * x + B[1] * y + B[2] * z);
      flux[j * NL + i] = br;
      total += br;
    }
  }
  // A floor of a fifth of the mean, so the quiet Sun and the polar holes get lines too.
  const floor = (0.2 * total) / (NL * NZ);
  const cdf = new Float64Array(NL * NZ);
  let acc = 0;
  for (let k = 0; k < cdf.length; k++) {
    acc += flux[k] + floor;
    cdf[k] = acc;
  }
  const b = builder();
  const pts: number[] = [];
  const opts: TraceOptions = { polarRatio: 1, rMax: SOURCE_SURFACE, sMax: 40, maxSteps: 3000, tol: 2e-5 };
  for (let k = 0; k < o.seeds; k++) {
    const target = ((k + golden(k + 1, 0.7548776662466927)) / o.seeds) * acc;
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const i = lo % NL;
    const j = Math.floor(lo / NL);
    const z = -1 + (2 * (j + golden(k + 7))) / NZ;
    const ph = (2 * Math.PI * (i + golden(k + 3, 0.5698402909980532))) / NL;
    const sz = Math.sqrt(1 - z * z);
    const p0 = [1.0005 * sz * Math.cos(ph), 1.0005 * sz * Math.sin(ph), 1.0005 * z];
    f(p0[0], p0[1], p0[2], B);
    const sign = outwardSign(B, p0, 1);
    pts.length = 0;
    const res = traceLine(f, p0, sign, opts, pts);
    if (res.end === 'surface') {
      // Closed: kept from its outward end only (its inward end's copy would draw it twice).
      if (sign > 0) addLine(b, pts, IAU_TO_BODY, sign, CLOSED);
      continue;
    }
    if (res.end !== 'outer') continue;
    // Open: on beyond the source surface as a Parker spiral, from where it leaves it.
    const n = pts.length / 3;
    const x = pts[3 * n - 3];
    const y = pts[3 * n - 2];
    const zz = pts[3 * n - 1];
    const r = Math.hypot(x, y, zz);
    const spiral: number[] = [];
    parkerSpiral(zz / r, Math.hypot(x, y) / r, Math.atan2(y, x), o.spiralPoints, spiral);
    pts.push(...spiral.slice(3));
    addLine(b, pts, IAU_TO_BODY, sign, SPIRAL);
  }
  // The current sheet: the source surface's neutral line, by marching squares on a θ–φ grid.
  for (const [ct, st, ph] of neutralLine(f, o.sheetStepDeg)) {
    pts.length = 0;
    parkerSpiral(ct, st, ph, o.spiralPoints, pts);
    addLine(b, pts, IAU_TO_BODY, 0, SHEET);
  }
  return finish(b);
}

/**
 * Points along the source surface's neutral line (B_r = 0), about `stepDeg` apart: [cos θ, sin θ, φ] each. Found on
 * a 2° grid; where B_r changes sign along a grid edge, the crossing is interpolated, and crossings are kept when they
 * are at least the step from every one kept before.
 */
export function neutralLine(f: (x: number, y: number, z: number, out: Float64Array) => void, stepDeg: number): [number, number, number][] {
  const NP = 180;
  const NT = 90;
  const B = new Float64Array(3);
  const br = new Float64Array((NP + 1) * (NT + 1));
  const R = SOURCE_SURFACE;
  for (let j = 0; j <= NT; j++) {
    const th = (Math.PI * (j + 0.5)) / (NT + 1);
    for (let i = 0; i <= NP; i++) {
      const ph = (2 * Math.PI * i) / NP;
      const x = R * Math.sin(th) * Math.cos(ph);
      const y = R * Math.sin(th) * Math.sin(ph);
      const z = R * Math.cos(th);
      f(x, y, z, B);
      br[j * (NP + 1) + i] = (B[0] * x + B[1] * y + B[2] * z) / R;
    }
  }
  const found: [number, number, number][] = [];
  const unit: [number, number, number][] = [];
  const minCos = Math.cos((stepDeg * Math.PI) / 180);
  const keep = (th: number, ph: number) => {
    const u: [number, number, number] = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    for (const v of unit) if (u[0] * v[0] + u[1] * v[1] + u[2] * v[2] > minCos) return;
    unit.push(u);
    found.push([Math.cos(th), Math.sin(th), ph]);
  };
  for (let j = 0; j <= NT; j++) {
    const th = (Math.PI * (j + 0.5)) / (NT + 1);
    for (let i = 0; i < NP; i++) {
      const a = br[j * (NP + 1) + i];
      const c = br[j * (NP + 1) + i + 1];
      if (a * c < 0) keep(th, ((2 * Math.PI) / NP) * (i + a / (a - c)));
      if (j < NT) {
        const d = br[(j + 1) * (NP + 1) + i];
        if (a * d < 0) keep(th + (Math.PI / (NT + 1)) * (a / (a - d)), ((2 * Math.PI) / NP) * i);
      }
    }
  }
  return found;
}
