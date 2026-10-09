/**
 * A neutron star's whole magnetosphere, drawn with View › Magnetic field lines (scene/PulsarModel.tsx; materials:
 * render/pulsarMaterials.ts createMagnetosphereMaterial). Without the switch the close-up keeps its few dipole loops
 * (pulsarModel.ts fieldLines, twistedFieldLines). Every shape here is a model, built on published solutions:
 *
 *  - The closed zone: dipole loops r = L sin²θ about the magnetic axis, out to the last closed line, L = R_LC, which
 *    touches the light cylinder R_LC = cP/2π at the "Y-point" where the force-free aligned rotator's closed zone ends
 *    (Contopoulos, Kazanas & Fendt 1999, ApJ 511, 351). The force-free solutions are close to a dipole inside about
 *    half the light cylinder; nearer it the closed lines bulge out to meet it (not drawn: they are left dipolar).
 *  - The open lines: from the polar cap, sin²θ_pc = R/R_LC (the dipole's last line that reaches the light cylinder,
 *    Goldreich & Julian 1969), dipolar at first, bending over to run radially beyond the light cylinder, as the
 *    force-free solutions' do (CKF 1999; Spitkovsky 2006, ApJ 648, L51). A footpoint holding a share f of the cap's
 *    flux runs out at the split monopole's angle θ∞ = acos(1 − f) from the magnetic axis (Michel 1973, ApJ 180, L133:
 *    the monopole's flux is uniform in cos θ), so the last open line runs into the equator at the Y-point. Each is wound
 *    back about the spin axis as the Goldreich–Julian current makes it, B_φ/B_p = −ϖΩ/c, i.e. dφ/ds = −1/R_LC along the
 *    line (the split monopole's Archimedean spiral beyond the light cylinder; Michel 1973).
 *  - The striped wind: an oblique rotator's open field reverses across a current sheet that follows the magnetic
 *    equator outwards at about c, m̂(t − r/c)·r̂ = 0, an undulating spiral sheet reaching the latitudes ±α (Bogovalov
 *    1999, A&A 349, 1017; Spitkovsky 2006 found the same sheet in the force-free oblique rotator). The wind's lines
 *    are coloured by the sign of B_r there, so at a fixed latitude within ±α they alternate in stripes.
 *  - A magnetar's twisted field: dipole loops twisted about the magnetic axis by about a radian (Thompson, Lyutikov &
 *    Kulkarni 2002, ApJ 574, 332), out to where the electrons' cyclotron energy falls to about 1 keV and the twisted
 *    field's currents scatter the star's X-rays (TLK 2002's resonant scattering zone): r ≈ R (B/B_1keV)^⅓, so the
 *    measured spin-down field sets its size (B_1keV = 8.6 × 10¹⁰ G).
 *  - The Double Pulsar's B: its closed field confined where pulsar A's wind presses on it, at the magnetopause where
 *    A's wind pressure Ė_A/(4πcD²) equals B's field's B²/8π, about 4 × 10⁹ cm towards A (Lyutikov & Thompson 2005,
 *    ApJ 634, 1223, eq. 4), and drawn out downwind into a tail, as Earth's is by the solar wind (the tail's length is
 *    illustrative).
 *
 * The spin-down power of the force-free oblique rotator, L = (μ²Ω⁴/c³)(1 + sin²α) (Spitkovsky 2006), and a pulsar's
 * dipole field from its slowing spin, B = 3.2 × 10¹⁹ (PṖ)^½ G (the catalogues' convention), are the cards' numbers.
 *
 * Frames: the pulsars' lines are in the frame turning with the star (z the spin axis, the magnetic axis in the x–z
 * plane at angle α at spin phase 0, as pulsarModel.ts magneticAxisAt has it), km; the scene turns them with the
 * beams' spin phase, so lines and beams keep step. Lines run along the field: `flow` +1 where the field points
 * along the line's direction of drawing, −1 against.
 *
 * Pure functions; tests in magnetosphere.test.ts. Cost: building a pulsar's set, about 30,000 segments, a few ms,
 * once per pulsar shown with the switch on.
 */
import { C_KM_S } from '../../physics/constants';
import { lightCylinderKm, NS_RADIUS_KM } from './pulsarModel';

/** Field lines as line segments (pairs of vertices), with what the material needs per vertex. */
export interface FieldLineSet {
  /** Positions, km, in the set's frame. */
  positions: Float32Array;
  /** Distance along its line from where it starts, km: the dashes flow along it. */
  arc: Float32Array;
  /** B_r/|B|, or its sign: +1 where the field points away from the star, −1 towards it (the polarity colours). */
  pol: Float32Array;
  /** +1 where the field points the way the line is drawn (arc increasing), −1 against it. */
  flow: Float32Array;
  /** Brightness, 0 to 1 (ends faded; the closed zone dimmer than the open lines). */
  weight: Float32Array;
}

type P3 = [number, number, number];

/** Collects polylines into segment arrays. */
export class LineSink {
  private pos: number[] = [];
  private arcs: number[] = [];
  private pols: number[] = [];
  private flows: number[] = [];
  private ws: number[] = [];

  /** Add a polyline: its points and, per point, polarity, flow and weight. */
  add(pts: readonly P3[], pol: (i: number) => number, flow: (i: number) => number, weight: (i: number) => number): void {
    let arc = 0;
    let prevArc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      prevArc = arc;
      arc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      this.arcs.push(prevArc, arc);
      this.pols.push(pol(i - 1), pol(i));
      this.flows.push(flow(i - 1), flow(i));
      this.ws.push(weight(i - 1), weight(i));
    }
  }

  get segments(): number {
    return this.arcs.length / 2;
  }

  done(): FieldLineSet {
    return {
      positions: new Float32Array(this.pos),
      arc: new Float32Array(this.arcs),
      pol: new Float32Array(this.pols),
      flow: new Float32Array(this.flows),
      weight: new Float32Array(this.ws),
    };
  }
}

// ─── Numbers ────────────────────────────────────────────────────────────────────────────

/** The polar cap's angular radius, rad: sin²θ_pc = R/R_LC (the last dipole line that reaches the light cylinder). */
export const polarCapAngle = (starKm: number, rlcKm: number): number => Math.asin(Math.sqrt(Math.min(1, starKm / rlcKm)));

/** A pulsar's surface dipole field from its spin, G: 3.2 × 10¹⁹ (P Ṗ)^½ (P in s, Ṗ in s/s). */
export const dipoleFieldG = (p0: number, p1: number): number => 3.2e19 * Math.sqrt(p0 * p1);

/**
 * Spin-down power of the force-free oblique rotator, erg/s: (μ²Ω⁴/c³)(1 + sin²α), μ = B R³ (Spitkovsky 2006, his
 * k₁ ≈ k₂ ≈ 1), B the dipole field as dipoleFieldG gives it and R the 10 km that formula assumes.
 */
export function spinDownErgS(bG: number, periodS: number, alphaRad: number, starKm = 10): number {
  const mu = bG * (starKm * 1e5) ** 3;
  const omega = (2 * Math.PI) / periodS;
  const c = C_KM_S * 1e5;
  return ((mu * mu * omega ** 4) / c ** 3) * (1 + Math.sin(alphaRad) ** 2);
}

/** The latitude of the striped wind's sheet, rad, at wind phase ψ = φ + r/R_LC (spin frame, magnetic axis at φ = 0). */
export const sheetLatitude = (alphaRad: number, psi: number): number => Math.atan(-Math.tan(alphaRad) * Math.cos(psi));

/** m̂(t − r/c)·r̂ at a point of the spin frame (km): its sign is the wind's polarity there (outward where positive). */
export function windPolarity(alphaRad: number, rlcKm: number, x: number, y: number, z: number): number {
  const r = Math.hypot(x, y, z) || 1;
  const rho = Math.hypot(x, y);
  const psi = Math.atan2(y, x) + r / rlcKm;
  return (Math.sin(alphaRad) * (rho / r) * Math.cos(psi) + Math.cos(alphaRad) * (z / r));
}

/** The field whose cyclotron energy is 1 keV, G (ħeB/m_e c = 11.58 keV at 10¹² G). */
export const B_ONE_KEV_G = 1e12 / 11.577;

/** How far a magnetar's twisted loops reach, in star radii: where its dipole field falls to B_1keV (TLK 2002's resonant zone). */
export const twistedReach = (bG: number): number => (Number.isFinite(bG) && bG > 0 ? Math.min(30, Math.max(3, Math.cbrt(bG / B_ONE_KEV_G))) : 12);

/**
 * The Double Pulsar's magnetopause, km: where A's wind pressure Ė_A/(4πcD²) equals B's magnetic pressure, B's dipole
 * written through its own spin-down Ė_B = μ²Ω_B⁴/c³: R = (cD/Ω_B)^½ (Ė_B/Ė_A)^¼ (Lyutikov & Thompson 2005, eq. 4,
 * with N_B = 1 and equal moments of inertia: 4 × 10⁹ cm).
 */
export function magnetopauseKm(edotAErgS: number, edotBErgS: number, periodBS: number, separationKm: number): number {
  const omegaB = (2 * Math.PI) / periodBS;
  return Math.sqrt((C_KM_S * separationKm) / omegaB) * (edotBErgS / edotAErgS) ** 0.25;
}

// ─── Geometry ───────────────────────────────────────────────────────────────────────────

/** The magnetic frame's axes in the spin frame, for inclination α: x_m, y_m and the magnetic axis m̂. */
function magFrame(alpha: number): { xm: P3; ym: P3; m: P3 } {
  return { xm: [Math.cos(alpha), 0, -Math.sin(alpha)], ym: [0, 1, 0], m: [Math.sin(alpha), 0, Math.cos(alpha)] };
}

const toSpin = (f: { xm: P3; ym: P3; m: P3 }, x: number, y: number, z: number): P3 => [
  x * f.xm[0] + y * f.ym[0] + z * f.m[0],
  x * f.xm[1] + y * f.ym[1] + z * f.m[1],
  x * f.xm[2] + y * f.ym[2] + z * f.m[2],
];

/** Rotate p about the z axis by a. */
const turnZ = (p: P3, a: number): P3 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];

const sph = (r: number, th: number, ph: number): [number, number, number] => [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];

/** B_r/|B| of a dipole at colatitude θ from its axis. */
const dipolePol = (th: number): number => (2 * Math.cos(th)) / Math.sqrt(1 + 3 * Math.cos(th) ** 2);

/** Options for a pulsar's magnetosphere. */
export interface MagnetosphereOptions {
  /** Outer edge of the wind drawn, in light-cylinder radii. */
  windReach?: number;
  /** Loop sizes of the closed zone, in light-cylinder radii (the last is the separatrix to the Y-point). */
  closed?: readonly number[];
  /** Shares of the polar cap's flux the open lines start at. */
  open?: readonly number[];
  /** Azimuths round the magnetic axis. */
  azimuths?: number;
}

/** The closed zone's loop sizes, in light-cylinder radii (the last, 1, touches it at the Y-point). */
export const CLOSED_LOOPS: readonly number[] = [0.07, 0.12, 0.19, 0.28, 0.4, 0.54, 0.7, 0.86, 1];
/** The open lines' shares of the polar cap's flux. */
export const OPEN_SHARES: readonly number[] = [0.12, 0.38, 0.66, 0.92];

/**
 * A pulsar's magnetosphere in the frame turning with it (km): the closed zone, the open lines through the light
 * cylinder into the wound-up wind, out to `windReach` light-cylinder radii.
 */
export function pulsarMagnetosphere(periodS: number, alphaRad: number, starKm = NS_RADIUS_KM, opts: MagnetosphereOptions = {}): FieldLineSet {
  const rlc = lightCylinderKm(periodS);
  const sink = new LineSink();
  const f = magFrame(alphaRad);
  const n = opts.azimuths ?? 12;
  // The closed zone: loops from the north footpoint over to the south (the field runs that way).
  for (const [j, l] of (opts.closed ?? CLOSED_LOOPS).entries()) {
    const big = l * rlc;
    if (big < 1.6 * starKm) continue;
    const th0 = Math.asin(Math.sqrt(starKm / big));
    const last = j === (opts.closed ?? CLOSED_LOOPS).length - 1;
    for (let k = 0; k < n; k++) {
      const ph = (2 * Math.PI * (k + 0.5 * (j % 2))) / n;
      const pts: P3[] = [];
      const ths: number[] = [];
      const m = 56;
      for (let i = 0; i <= m; i++) {
        // Crowded towards the footpoints, where the loop turns fastest.
        const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / m);
        const th = th0 + (Math.PI - 2 * th0) * u;
        const p = sph(big * Math.sin(th) ** 2, th, ph);
        pts.push(toSpin(f, p[0], p[1], p[2]));
        ths.push(th);
      }
      sink.add(pts, (i) => dipolePol(ths[i]), () => 1, () => (last ? 0.9 : 0.55));
    }
  }
  // The open lines, from both caps.
  const reach = (opts.windReach ?? 5) * rlc;
  for (const [j, share] of (opts.open ?? OPEN_SHARES).entries()) {
    const sin2 = share * Math.min(1, starKm / rlc);
    const th0 = Math.asin(Math.sqrt(sin2));
    const big = starKm / sin2;
    const thInf = Math.acos(1 - share);
    for (const pole of [1, -1])
      for (let k = 0; k < n; k++) {
        const ph = (2 * Math.PI * (k + 0.5 * (j % 2))) / n;
        const mag: P3[] = [];
        // Dipolar to rb, three-quarters of the light cylinder (or as far as the line goes before it would close).
        const rb = Math.min(0.75 * rlc, 0.95 * big);
        const thB = Math.asin(Math.sqrt(rb / big));
        const m1 = 40;
        for (let i = 0; i <= m1; i++) {
          const th = th0 + (thB - th0) * (i / m1) ** 1.5;
          mag.push(sph(big * Math.sin(th) ** 2, th, ph));
        }
        // Then over to the monopole's direction θ∞ while the radius keeps growing, and on radially.
        const nb = mag[mag.length - 1].map((v) => v / rb) as P3;
        const ninf = sph(1, thInf, ph);
        const m2 = 150;
        for (let i = 1; i <= m2; i++) {
          const r = rb + (reach - rb) * (i / m2) ** 1.25;
          const t = Math.min(1, (r - rb) / (0.7 * rlc));
          const w = t * t * (3 - 2 * t);
          const d: P3 = [nb[0] + (ninf[0] - nb[0]) * w, nb[1] + (ninf[1] - nb[1]) * w, nb[2] + (ninf[2] - nb[2]) * w];
          const dl = Math.hypot(d[0], d[1], d[2]);
          mag.push([(r * d[0]) / dl, (r * d[1]) / dl, (r * d[2]) / dl]);
        }
        // To the spin frame (the south cap mirrored through the magnetic equator), wound back about the spin axis.
        const pts: P3[] = [];
        let arc = 0;
        for (let i = 0; i < mag.length; i++) {
          if (i > 0) arc += Math.hypot(mag[i][0] - mag[i - 1][0], mag[i][1] - mag[i - 1][1], mag[i][2] - mag[i - 1][2]);
          pts.push(turnZ(toSpin(f, mag[i][0], mag[i][1], pole * mag[i][2]), -arc / rlc));
        }
        // Polarity: the dipole's near the star (out at the north cap, in at the south); beyond the light cylinder
        // the striped wind's, the sign of m̂(t − r/c)·r̂, which reverses across the current sheet.
        const pol = pts.map((p) => {
          const r = Math.hypot(p[0], p[1], p[2]);
          const near = pole;
          const s = windPolarity(alphaRad, rlc, p[0], p[1], p[2]);
          const far = Math.max(-1, Math.min(1, 6 * s));
          const t = Math.min(1, Math.max(0, (r - 0.8 * rlc) / (0.6 * rlc)));
          return near + (far - near) * t * t * (3 - 2 * t);
        });
        const end = (i: number) => {
          const r = Math.hypot(pts[i][0], pts[i][1], pts[i][2]);
          return 1 - Math.min(1, Math.max(0, (r - 0.6 * reach) / (0.4 * reach)));
        };
        sink.add(pts, (i) => pol[i], (i) => Math.sign(pol[i]) || 1, end);
      }
  }
  return sink.done();
}

/**
 * The striped wind's current sheet as a grid in the spin frame, km: (radial × azimuthal) vertices from R_LC to
 * `reach` light-cylinder radii, at latitude sheetLatitude(α, φ + r/R_LC). `u` is the radius in light-cylinder radii
 * (the material fades the sheet in from the light cylinder and out at its edge). Indexed triangles.
 */
export function stripedSheet(periodS: number, alphaRad: number, reach = 5, nr = 96, nphi = 128): { positions: Float32Array; u: Float32Array; index: Uint32Array } {
  const rlc = lightCylinderKm(periodS);
  const positions = new Float32Array((nr + 1) * (nphi + 1) * 3);
  const u = new Float32Array((nr + 1) * (nphi + 1));
  let k = 0;
  for (let i = 0; i <= nr; i++) {
    const r = rlc * (1 + ((reach - 1) * i) / nr);
    for (let j = 0; j <= nphi; j++) {
      const ph = (2 * Math.PI * j) / nphi;
      const lat = sheetLatitude(alphaRad, ph + r / rlc);
      positions[3 * k] = r * Math.cos(lat) * Math.cos(ph);
      positions[3 * k + 1] = r * Math.cos(lat) * Math.sin(ph);
      positions[3 * k + 2] = r * Math.sin(lat);
      u[k] = r / rlc;
      k++;
    }
  }
  const index = new Uint32Array(nr * nphi * 6);
  let q = 0;
  for (let i = 0; i < nr; i++)
    for (let j = 0; j < nphi; j++) {
      const a = i * (nphi + 1) + j;
      const b = a + nphi + 1;
      index.set([a, b, a + 1, a + 1, b, b + 1], q);
      q += 6;
    }
  return { positions, u, index };
}

/**
 * A magnetar's twisted magnetosphere, denser than the close-up's (pulsarModel.ts twistedFieldLines), in the magnetic
 * frame (z the magnetic axis), km: dipole loops out to twistedReach(B) star radii, each turned progressively about
 * the magnetic axis so its footpoints differ by `twistRad` in azimuth (TLK 2002).
 */
export function denseTwistedField(bG: number, twistRad = 1, starKm = NS_RADIUS_KM, azimuths = 20): FieldLineSet {
  const sink = new LineSink();
  const reach = twistedReach(bG);
  const sizes: number[] = [];
  for (let i = 0; i < 9; i++) sizes.push(1.5 * (reach / 1.5) ** (i / 8));
  for (const [j, l] of sizes.entries()) {
    const big = l * starKm;
    const th0 = Math.asin(Math.sqrt(starKm / big));
    for (let k = 0; k < azimuths; k++) {
      const ph0 = (2 * Math.PI * (k + 0.5 * (j % 2))) / azimuths;
      const pts: P3[] = [];
      const ths: number[] = [];
      const m = 64;
      for (let i = 0; i <= m; i++) {
        const u = i / m;
        const th = th0 + (Math.PI - 2 * th0) * u;
        pts.push(sph(big * Math.sin(th) ** 2, th, ph0 + twistRad * (u - 0.5)));
        ths.push(th);
      }
      // The outermost loops, the twisted "j-bundle" (Beloborodov 2009), brightest.
      sink.add(pts, (i) => dipolePol(ths[i]), () => 1, () => 0.45 + 0.55 * (j / (sizes.length - 1)));
    }
  }
  return sink.done();
}

/**
 * The Double Pulsar's B as A's wind shapes it, in B's magnetic frame (z its magnetic axis), km: closed dipole loops
 * out to twice the magnetopause, each point at distance r in a direction at angle χ from A (unit `toA`, magnetic frame)
 * moved in to r' = r_lim tanh(r/r_lim), with r_lim = R_mp on the day side growing to `tail` R_mp downwind: compressed
 * towards A, drawn out behind (Lyutikov & Thompson 2005 for R_mp; the shape illustrative).
 */
export function confinedField(rmpKm: number, toA: readonly [number, number, number], starKm = NS_RADIUS_KM, tail = 6, azimuths = 14): FieldLineSet {
  const sink = new LineSink();
  const lim = (x: number, y: number, z: number, r: number): number => {
    const c = (x * toA[0] + y * toA[1] + z * toA[2]) / (r || 1);
    // 1 on the day side (c = 1), `tail` straight downwind (c = −1).
    const t = (1 - c) / 2;
    return rmpKm * (1 + (tail - 1) * t ** 2.5);
  };
  const sizes = [0.12, 0.22, 0.38, 0.6, 0.9, 1.3, 1.8, 2.5].map((s) => s * rmpKm).filter((l) => l > 1.6 * starKm);
  for (const [j, big] of sizes.entries()) {
    const th0 = Math.asin(Math.sqrt(starKm / big));
    for (let k = 0; k < azimuths; k++) {
      const ph = (2 * Math.PI * (k + 0.5 * (j % 2))) / azimuths;
      const pts: P3[] = [];
      const ths: number[] = [];
      const m = 72;
      for (let i = 0; i <= m; i++) {
        const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / m);
        const th = th0 + (Math.PI - 2 * th0) * u;
        const p = sph(big * Math.sin(th) ** 2, th, ph);
        const r = Math.hypot(p[0], p[1], p[2]);
        const rl = lim(p[0], p[1], p[2], r);
        const s = r > 0 ? (rl * Math.tanh(r / rl)) / r : 1;
        pts.push([p[0] * s, p[1] * s, p[2] * s]);
        ths.push(th);
      }
      sink.add(pts, (i) => dipolePol(ths[i]), () => 1, () => 0.5 + 0.5 * (j / Math.max(1, sizes.length - 1)));
    }
  }
  return sink.done();
}

/** The open-field lines' winding about the spin axis per km along them, rad/km: the Goldreich–Julian B_φ/B_p = −ϖ/R_LC. */
export const windingPerKm = (periodS: number): number => -1 / lightCylinderKm(periodS);

/** Spin-down powers of the Double Pulsar's A and B, erg/s (Lyutikov & Thompson 2005, from the timing: 5.8 × 10³³, 1.6 × 10³⁰). */
export const DOUBLE_PULSAR_A_EDOT = 5.8e33;
export const DOUBLE_PULSAR_B_EDOT = 1.6e30;

