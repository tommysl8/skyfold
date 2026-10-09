/**
 * The magnetic fields of GW170817's two neutron stars as they merge, drawn with View › Magnetic field lines
 * (scene/MergerField.tsx, beside the kilonova's model in scene/Phenomena.tsx). A model throughout: the stars' fields
 * were not measured. Typical values are taken, about 10¹² G each, as for the old neutron stars of the binary pulsars;
 * the shapes follow published simulations.
 *
 *  - The inspiral: each star's dipole, carried round with it. While they are far apart each keeps its own
 *    magnetosphere; as they close in, the two fields meet and some of their lines join the stars, a flux tube that the
 *    orbit twists (force-free simulations: Palenzuela et al. 2013, PRL 111, 061105; Most & Philippov 2020, ApJL 893,
 *    L6, who find the twist building up and released in flares, and Most & Philippov 2023, PRL 130, 245201, with
 *    radio bursts from the common magnetosphere just before the merger). Drawn as the vacuum field of the two dipoles
 *    (its lines traced here once, in units of the separation: the geometry is the same at every separation), the
 *    moments chosen anti-parallel, one tilted 30° (their orientations are not known), the lines joining the stars
 *    twisted about the line between them by a radian, and the whole swept back beyond the orbit's light cylinder c/Ω.
 *  - The merger: the joined field reconnects in a burst, its lines torn into pieces flung outwards at nearly the speed
 *    of light (Most & Philippov 2020), to about 1,000 km; really over a few milliseconds, shown over a quarter of a second.
 *  - The remnant: the merged star's field amplified a thousandfold or more within milliseconds by the shear between
 *    the stars (the Kelvin–Helmholtz instability: Kiuchi et al. 2015, PRD 92, 124034, from 10¹³ G by at least 10³),
 *    wound round the axis into a torus by the remnant's differential rotation, and, about 60 ms after the merger, an
 *    ordered helical field along the axis: the funnel of an incipient jet (Ruiz et al. 2016, ApJL 824, L6, about
 *    4,000 M after the merger for 1.625 M☉ stars, around a black hole of spin 0.74, the field above its poles about
 *    10¹⁶ G, the funnel's flow mildly relativistic, Γ ≈ 1.1–1.25). Drawn as the paraboloidal field of a hole of that
 *    spin (sim/blackholes/holeField.ts), drawn growing with the funnel's head at half the speed of light, its shape kept (a choice:
 *    GRB 170817A's jet broke out of the debris within the 1.74 s before the gamma rays). The field fades from view by 3
 *    s, long before the kilonova's light.
 *
 * Pure functions; tests in mergerField.test.ts. Cost: the inspiral's lines traced once (a few ms), nothing per frame.
 */
import { holeFieldLines } from '../blackholes/holeField';
import { LineSink, type FieldLineSet } from './magnetosphere';

/** The stars' surface fields, G: assumed (typical of old neutron stars), not measured. */
export const MERGER_FIELD_G = 1e12;
/** The tilt of the second star's moment from anti-parallel, rad (a choice). */
export const MERGER_TILT_RAD = (30 * Math.PI) / 180;
/** The twist of the lines joining the stars, rad (Most & Philippov 2020's flux tube; its size illustrative). */
export const MERGER_TWIST_RAD = 1;
/** The burst shown over this long, s (really a few milliseconds). */
export const BURST_SHOWN_S = 0.25;
/** The funnel appears this long after the merger, s (Ruiz et al. 2016: about 4,000 M, 60 ms). */
export const FUNNEL_AFTER_S = 0.06;
/** The funnel drawn growing at this fraction of c (a choice). */
export const FUNNEL_BETA = 0.5;
/** The remnant's spin (Ruiz et al. 2016) and mass, M☉ (GW170817's total less about 0.1 M☉ thrown out and radiated). */
export const REMNANT_SPIN = 0.74;
export const REMNANT_MASS_MSUN = 2.6;
/** The field fades out between these times after the merger, s. */
export const FIELD_FADE_S: readonly [number, number] = [1.5, 3];

type P3 = [number, number, number];

/** The vacuum field of two dipoles (units arbitrary) at p: moments m1 at c1, m2 at c2. */
export function twoDipoles(p: P3, c1: P3, m1: P3, c2: P3, m2: P3, out: P3 = [0, 0, 0]): P3 {
  out[0] = out[1] = out[2] = 0;
  for (const [c, m] of [
    [c1, m1],
    [c2, m2],
  ] as const) {
    const rx = p[0] - c[0];
    const ry = p[1] - c[1];
    const rz = p[2] - c[2];
    const r2 = rx * rx + ry * ry + rz * rz;
    const r = Math.sqrt(r2);
    const r5 = r2 * r2 * r;
    const md = m[0] * rx + m[1] * ry + m[2] * rz;
    // B = (3(m·r)r − m r²)/r⁵
    out[0] += (3 * md * rx - m[0] * r2) / r5;
    out[1] += (3 * md * ry - m[1] * r2) / r5;
    out[2] += (3 * md * rz - m[2] * r2) / r5;
  }
  return out;
}

/** The two stars' places and moments in units of the separation (orbit frame: x towards star 1, z the orbit's axis). */
export function binaryFrame(m1Msun: number, m2Msun: number, tiltRad = MERGER_TILT_RAD): { c1: P3; c2: P3; m1: P3; m2: P3 } {
  const m = m1Msun + m2Msun;
  return {
    c1: [m2Msun / m, 0, 0],
    c2: [-m1Msun / m, 0, 0],
    m1: [0, 0, 1],
    m2: [Math.sin(tiltRad), 0, -Math.cos(tiltRad)],
  };
}

/**
 * The inspiral's field lines in units of the separation: seeded round each star at 0.12 of the separation and
 * traced both ways along the field (RK4, steps a few per cent of the distance to the nearer star) until they reach a
 * star (0.02 from its centre) or 3 separations out. Lines that end on both stars carry `pol` 0 at their middle and
 * are twisted about the line between the stars (MERGER_TWIST_RAD); `flow` follows the field.
 */
export function inspiralField(m1Msun: number, m2Msun: number, opts: { tiltRad?: number; twistRad?: number; azimuths?: number } = {}): FieldLineSet & { joined: number } {
  const f = binaryFrame(m1Msun, m2Msun, opts.tiltRad ?? MERGER_TILT_RAD);
  const twist = opts.twistRad ?? MERGER_TWIST_RAD;
  const n = opts.azimuths ?? 8;
  const sink = new LineSink();
  const b: P3 = [0, 0, 0];
  const dirAt = (p: P3, sgn: number, out: P3): P3 => {
    twoDipoles(p, f.c1, f.m1, f.c2, f.m2, b);
    const l = Math.hypot(b[0], b[1], b[2]) || 1;
    out[0] = (sgn * b[0]) / l;
    out[1] = (sgn * b[1]) / l;
    out[2] = (sgn * b[2]) / l;
    return out;
  };
  const near = (p: P3) => Math.min(Math.hypot(p[0] - f.c1[0], p[1] - f.c1[1], p[2] - f.c1[2]), Math.hypot(p[0] - f.c2[0], p[1] - f.c2[1], p[2] - f.c2[2]));
  const k1: P3 = [0, 0, 0];
  const k2: P3 = [0, 0, 0];
  const k3: P3 = [0, 0, 0];
  const k4: P3 = [0, 0, 0];
  const trace = (seed: P3, sgn: number): { pts: P3[]; end: number } => {
    const pts: P3[] = [seed];
    let p: P3 = [...seed];
    for (let i = 0; i < 500; i++) {
      const d = near(p);
      if (d < 0.02) return { pts, end: 1 };
      if (Math.hypot(p[0], p[1], p[2]) > 3) return { pts, end: 0 };
      const h = Math.min(0.06, Math.max(0.004, 0.08 * d));
      dirAt(p, sgn, k1);
      dirAt([p[0] + 0.5 * h * k1[0], p[1] + 0.5 * h * k1[1], p[2] + 0.5 * h * k1[2]], sgn, k2);
      dirAt([p[0] + 0.5 * h * k2[0], p[1] + 0.5 * h * k2[1], p[2] + 0.5 * h * k2[2]], sgn, k3);
      dirAt([p[0] + h * k3[0], p[1] + h * k3[1], p[2] + h * k3[2]], sgn, k4);
      p = [p[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), p[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]), p[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])];
      pts.push(p);
    }
    return { pts, end: 0 };
  };
  let joined = 0;
  for (const [c, m] of [
    [f.c1, f.m1],
    [f.c2, f.m2],
  ] as const) {
    // Seeds round the star, about its own moment: four colatitudes in each hemisphere.
    const ez = m;
    const ex: P3 = Math.abs(ez[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const dot = ex[0] * ez[0] + ex[1] * ez[1] + ex[2] * ez[2];
    const ux: P3 = [ex[0] - dot * ez[0], ex[1] - dot * ez[1], ex[2] - dot * ez[2]];
    const ul = Math.hypot(ux[0], ux[1], ux[2]);
    ux[0] /= ul;
    ux[1] /= ul;
    ux[2] /= ul;
    const uy: P3 = [ez[1] * ux[2] - ez[2] * ux[1], ez[2] * ux[0] - ez[0] * ux[2], ez[0] * ux[1] - ez[1] * ux[0]];
    for (const thDeg of [25, 45, 65, 115, 135, 155])
      for (let k = 0; k < n; k++) {
        const th = (thDeg * Math.PI) / 180;
        const ph = (2 * Math.PI * (k + (thDeg > 90 ? 0.5 : 0))) / n;
        const s = 0.12;
        const seed: P3 = [
          c[0] + s * (Math.sin(th) * Math.cos(ph) * ux[0] + Math.sin(th) * Math.sin(ph) * uy[0] + Math.cos(th) * ez[0]),
          c[1] + s * (Math.sin(th) * Math.cos(ph) * ux[1] + Math.sin(th) * Math.sin(ph) * uy[1] + Math.cos(th) * ez[1]),
          c[2] + s * (Math.sin(th) * Math.cos(ph) * ux[2] + Math.sin(th) * Math.sin(ph) * uy[2] + Math.cos(th) * ez[2]),
        ];
        const back = trace(seed, -1);
        const fwd = trace(seed, 1);
        // Drawn along the field: from the backward end to the forward end.
        const pts = [...back.pts.slice(1).reverse(), ...fwd.pts];
        const both = back.end === 1 && fwd.end === 1;
        // A line joining the two stars (its ends on different stars) is twisted about the line between them.
        const e0 = pts[0];
        const e1 = pts[pts.length - 1];
        const onOther = both && Math.sign(e0[0] - 0.5 * (f.c1[0] + f.c2[0])) !== Math.sign(e1[0] - 0.5 * (f.c1[0] + f.c2[0]));
        if (onOther) joined++;
        const span = f.c1[0] - f.c2[0];
        const out = pts.map((p): P3 => {
          if (!onOther) return p;
          const u = Math.min(1, Math.max(0, (p[0] - f.c2[0]) / span));
          const a = twist * (u - 0.5);
          return [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
        });
        // Polarity: B·r̂ from the nearer star; a joining line runs from + to −.
        const pol = out.map((p) => {
          twoDipoles(p, f.c1, f.m1, f.c2, f.m2, b);
          const d1 = Math.hypot(p[0] - f.c1[0], p[1] - f.c1[1], p[2] - f.c1[2]);
          const d2 = Math.hypot(p[0] - f.c2[0], p[1] - f.c2[1], p[2] - f.c2[2]);
          const c0 = d1 < d2 ? f.c1 : f.c2;
          const rx = p[0] - c0[0];
          const ry = p[1] - c0[1];
          const rz = p[2] - c0[2];
          return (b[0] * rx + b[1] * ry + b[2] * rz) / ((Math.hypot(b[0], b[1], b[2]) || 1) * (Math.hypot(rx, ry, rz) || 1));
        });
        sink.add(out, (i) => pol[i], () => 1, () => (onOther ? 1 : 0.6));
      }
  }
  return { ...sink.done(), joined };
}

/** The remnant's field, units of its M (GM/c² of REMNANT_MASS_MSUN, 3.84 km): the paraboloidal field of a hole of spin 0.74. */
export const remnantField = (reachM = 60, azimuths = 8): FieldLineSet => {
  const f = holeFieldLines(REMNANT_SPIN, reachM, azimuths);
  return { positions: f.positions, arc: f.arc, pol: f.pol, flow: f.flow, weight: f.weight };
};

/** What the field shows at a time after the merger (s; negative before): the inspiral, the burst, the remnant, and how bright. */
export function mergerStage(tS: number): { stage: 'inspiral' | 'burst' | 'remnant'; burst: number; remnant: number; funnelKm: number; fade: number } {
  const fade = 1 - Math.min(1, Math.max(0, (tS - FIELD_FADE_S[0]) / (FIELD_FADE_S[1] - FIELD_FADE_S[0])));
  const funnelKm = tS > FUNNEL_AFTER_S ? FUNNEL_BETA * 299_792.458 * (tS - FUNNEL_AFTER_S) : 0;
  if (tS < 0) return { stage: 'inspiral', burst: 0, remnant: 0, funnelKm: 0, fade: 1 };
  if (tS < BURST_SHOWN_S) return { stage: 'burst', burst: tS / BURST_SHOWN_S, remnant: Math.min(1, tS / BURST_SHOWN_S), funnelKm, fade };
  return { stage: 'remnant', burst: 1, remnant: 1, funnelKm, fade };
}
