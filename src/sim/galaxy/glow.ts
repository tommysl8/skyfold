/**
 * The Galaxy model's light near the camera, as a smooth glow instead of particles.
 *
 * Each particle of the model stands for a few hundred thousand suns, so near the camera there are
 * few of them, each seen hundreds of parsecs wide: drawn as splats they are either faded out (the
 * nearest) or drawn by lot, a few of them very bright (render/shaders/galaxy.vert.glsl). Seen from
 * inside the disc that turns the band into a dim field with rare bright blobs, much darker where
 * it counts than the model it stands for. The discs and the young arm stars are smooth laws of the
 * model (model.json), so their light near the camera is worked out from those laws instead, along
 * each line of sight through the model's dust (render/shaders/galaxyGlow.frag.glsl), and their
 * particles take over further out: the glow holds a population's light closer than s0, its
 * particles hold it beyond s1, and the two cross over between (a smoothstep in distance), so the
 * sum is the model's light at every distance. The H II regions and the clusters are single objects
 * and stay splats.
 *
 * Everything here is in frame G (sim/galaxy/frames.ts), kpc, and luminosities in L☉ (V band).
 * nearGlow is the shader's integration in TypeScript, for the tests.
 *
 * Two more glows share the shader (docs/data/blackholes.md §6), each with its twin here:
 *  - within 1 kpc of Sgr A*, the light of the nuclear star cluster and nuclear disc that neither the Galaxy
 *    model's particles of them (which fade as the camera nears them) nor the field's point stars draw: each
 *    law times u − w s(r) (sim/galaxy/nuclearCluster.ts, whose laws come from sim/galaxy/nuclearGlow.json;
 *    u and w the field's and the points' shares, s the points' share of the light): nuclearMarch
 *    integrates it along each line of sight in frame G's axes, in parsecs from Sgr A*, with the variable
 *    t of s = s0 + a sinh t (a the ray's closest approach to the hole, or to the galactic pole's axis when
 *    that is closer), so that the steps follow the cusp and the disc's inner peak at every distance, and the
 *    steps never straddle the inner hole of the field (r < 0.04 pc: only the S-stars) or the nuclear disc's
 *    inner edge (R = 3 pc), the places its light jumps, and end at its outer edge. 16 steps (8 at the lens's
 *    quality rung 1): against a fine quadrature the median error is 0.1 %, nine rays in ten are within
 *    0.6 % and the whole sky's light within 0.6 % (glow.test.ts, nuclearCluster.test.ts);
 *  - inside M87, its own starlight near the camera (m87ColumnTable): a spherical model of M87's light
 *    profile, integrated on the processor along 64 directions from the direction of the centre (the sky
 *    from inside a spherical galaxy depends only on that angle), which the shader reads as a table. It
 *    holds only the light that M87's model galaxy no longer draws: the template's particles near the camera
 *    fade out as their splats grow past half the largest drawn (render/shaders/galaxies.vert.glsl), and the
 *    table takes the true profile's light in their place, particle size by particle size.
 * Cost: the march 0.24 ms of GPU time a frame 4,000 au from Sgr A* on the target laptop (0.2 at 8 cells), 0.1 at
 * 100–300 pc, 0.06 at 700 pc, nothing beyond 1 kpc; the table 0.06–0.1 ms of processor time when the camera has
 * moved 1 % closer to or further from M87's centre.
 * Twins: render/shaders/galaxyGlow.frag.glsl (nscMarch, the M87 lookup).
 */
import { blackbodyRgb, bvToTemperature } from '../../physics/blackbody';
import { armRadius, armStrength, armWidth, createGalaxyModel, type GalaxyModel, type GalaxyModelJson } from './model';
import type { Vec3 } from './frames';

/** Population indices (sim/galaxy/particles.ts GALAXY_POPULATIONS). */
export const THIN_DISC = 0;
export const YOUNG_ARM_STARS = 1;
export const THICK_DISC = 3;

/** The thin and thick discs: glow nearer than the first distance, particles beyond the second (kpc). */
export const GLOW_DISC_RANGE_KPC: readonly [number, number] = [2, 4];
/** The young arm stars (smaller particles, so the particles can take over sooner). */
export const GLOW_YOUNG_RANGE_KPC: readonly [number, number] = [1, 2];

/** The share of a population's light at distance d (kpc) that its particles draw; the glow draws the rest. */
export function particleShare(d: number, range: readonly [number, number]): number {
  const t = Math.min(1, Math.max(0, (d - range[0]) / (range[1] - range[0])));
  return t * t * (3 - 2 * t);
}

/** An exponential disc as the particle generator samples it (scripts/build-galaxy.mjs sampleExpDisc). */
export interface GlowDisc {
  /** Surface brightness at R = 0, L☉/pc² (V). */
  sigma0: number;
  /** Radial scale length, kpc. */
  hR: number;
  /** Vertical scale height of the exponential (Laplace) profile about the warped midplane, kpc. */
  hz: number;
  /** No light beyond this radius, kpc (the sampling limit). */
  Rmax: number;
}

type P = { value: number } | number;
const val = (p: P): number => (typeof p === 'number' ? p : p.value);

/** The parts of model.json the glow reads, beyond those of the dust and the arms. */
interface GlowModelJson extends GalaxyModelJson {
  components: GalaxyModelJson['components'] & {
    thinDisc: { hR: P; hz: P; Rmax: P };
    thickDisc: { hR: P; hz: P; Rmax: P };
    youngArmStars: { hz: P; Rmin: P };
  };
  colours: { BV: Record<string, [number, number]> };
}

/**
 * A disc of total luminosity L (L☉) with the model's laws: R drawn from R e^(−R/hR) cut at Rmax,
 * so Σ(R) = L e^(−R/hR) / (2π hR² (1 − e^(−x)(1 + x))), x = Rmax / hR.
 */
export function glowDisc(json: GalaxyModelJson, name: 'thinDisc' | 'thickDisc', L: number): GlowDisc {
  const c = (json as GlowModelJson).components[name];
  const hR = val(c.hR);
  const Rmax = val(c.Rmax);
  const x = Rmax / hR;
  const inside = 1 - Math.exp(-x) * (1 + x);
  const hRpc = hR * 1000;
  return { sigma0: L / (2 * Math.PI * hRpc * hRpc * inside), hR, hz: val(c.hz), Rmax };
}

/** A disc's surface brightness at radius R (kpc), L☉/pc². */
export const discSigma = (d: GlowDisc, R: number): number => (R > d.Rmax ? 0 : d.sigma0 * Math.exp(-R / d.hR));

/** The young arm stars' scale height, kpc. */
export const youngHz = (json: GalaxyModelJson): number => val((json as GlowModelJson).components.youngArmStars.hz);

/**
 * Face-on surface brightness of the young arm stars (L☉/pc², V) on a res × res grid over ±extent
 * kpc of frame G (row 0 at y = −extent, column 0 at x = −extent, as the dust maps), for a total
 * luminosity L. The generator places them along the arm ridges with a weight per unit length
 * of ridge of strength × e^(−R/hR) (hR the thin disc's), inside Rmin, offset across the ridge by a
 * Gaussian of the arm's width (scripts/build-galaxy.mjs armTable, pickArmPoint, sampleArms): so
 * the surface brightness is that weight at the ridge times the Gaussian of the distance across it.
 */
export function youngSurfaceMap(json: GalaxyModelJson, L: number, res: number, extent: number, model: GalaxyModel = createGalaxyModel(json)): Float32Array {
  const g = json as GlowModelJson;
  const hR = val(g.components.thinDisc.hR);
  const Rmin = val(g.components.youngArmStars.Rmin);
  // The total weight: ∫ strength e^(−R/hR) ds along every arm, ds = R dβ / cos ψ.
  const dB = 0.05;
  let total = 0;
  for (const arm of model.arms) {
    for (let b = arm.betaExt[0]; b <= arm.betaExt[1]; b += dB) {
      const R = armRadius(arm, b);
      if (R < Rmin) continue;
      const s = armStrength(arm, b);
      if (s <= 0) continue;
      const cosPsi = b <= arm.betaKink ? arm.cosLt : arm.cosGt;
      total += s * Math.exp(-R / hR) * (R / cosPsi) * ((dB * Math.PI) / 180);
    }
  }
  const perKpc = L / total; // L☉ per kpc of ridge, per unit weight
  const out = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    const y = -extent + ((j + 0.5) * 2 * extent) / res;
    for (let i = 0; i < res; i++) {
      const x = -extent + ((i + 0.5) * 2 * extent) / res;
      let sum = 0;
      for (const n of model.armsNear(x, y)) {
        if (n.Ra < Rmin || n.strength <= 0) continue;
        const w = armWidth(n.arm, n.Ra);
        if (n.d > 5 * w) continue;
        sum += n.strength * Math.exp(-n.Ra / hR) * (Math.exp((-0.5 * n.d * n.d) / (w * w)) / (Math.sqrt(2 * Math.PI) * w));
      }
      // L☉ per kpc² → per pc².
      out[j * res + i] = (perKpc * sum) / 1e6;
    }
  }
  return out;
}

/**
 * The summed colour of a population whose particles' B−V are drawn from a normal distribution
 * (model.json colours): linear sRGB of luminance 1, and a colour temperature for the Doppler shift.
 */
export function populationColour(json: GalaxyModelJson, name: string): { rgb: [number, number, number]; temperatureK: number } {
  const [mu, sigma] = (json as GlowModelJson).colours.BV[name] ?? [0.7, 0];
  const rgb: [number, number, number] = [0, 0, 0];
  let w = 0;
  let lnT = 0;
  for (let k = -3; k <= 3; k += 0.25) {
    const weight = Math.exp(-0.5 * k * k);
    const T = bvToTemperature(mu + sigma * k);
    const c = blackbodyRgb(T);
    for (let i = 0; i < 3; i++) rgb[i] += weight * c[i];
    lnT += weight * Math.log(T);
    w += weight;
  }
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return { rgb: [rgb[0] / lum, rgb[1] / lum, rgb[2] / lum], temperatureK: Math.exp(lnT / w) };
}

/** Luminosity of each population in a particle file's GPU buffers (L☉): what the particles hold. */
export function populationLuminosity(attrs: Uint8Array, count: number, populations = 16): Float64Array {
  const out = new Float64Array(populations);
  for (let i = 0; i < count; i++) out[attrs[4 * i]] += 2 ** (attrs[4 * i + 1] / 8);
  return out;
}

// ─── The integration along a line of sight ───────────────────────────────────────────────

/** Steps along each line of sight (render/shaders/galaxyGlow.frag.glsl GLOW_STEPS). */
export const GLOW_STEPS = 32;
/** Step ends at s_k = GLOW_S_SCALE (e^(kλ) − 1), kpc, so the first steps are parsecs and the last a fifth of the way. */
export const GLOW_S_SCALE = 0.01;

/** 1 − e^(−x) for x ≥ 0, as the shader takes it (no cancellation for small x). */
const oneMinusExp = (x: number): number => (x < 1e-3 ? x * (1 - 0.5 * x * (1 - x / 3)) : 1 - Math.exp(-x));

/**
 * ∫ e^(−|z|/h) dz from za to zb (the shader's layerColumn). Not as the difference of the integrals from 0, which
 * many scale heights from the midplane are both h to within float32's precision: on the GPU their difference was
 * noise of either sign, and the glow's colour normalisation divided by it (a saturated white band across the sky,
 * seen from a kiloparsec below the young arm stars' 60-pc layer). On one side of the midplane the column is
 * h e^(−|z|near/h) (1 − e^(−Δ/h)), positive and exact to a few ulp; across it, the two halves' sum.
 */
export function layerColumn(za: number, zb: number, h: number): number {
  const a = Math.abs(za) / h;
  const b = Math.abs(zb) / h;
  const m = za * zb >= 0 ? h * Math.exp(-Math.min(a, b)) * oneMinusExp(Math.abs(zb - za) / h) : h * (oneMinusExp(a) + oneMinusExp(b));
  return zb >= za ? m : -m;
}

export interface GlowSetup {
  thin: GlowDisc;
  thick: GlowDisc;
  youngHz: number;
  /** Young arm stars' surface brightness (L☉/pc²) at an in-plane point of frame G. */
  young: (x: number, y: number) => number;
  /** The dust's midplane values and the warp at an in-plane point (model.dustMidplane). */
  dust: GalaxyModel['dustMidplane'];
  discRange?: readonly [number, number];
  youngRange?: readonly [number, number];
}

/**
 * The glow's light along one line of sight from a camera at camG (frame G, kpc) in the unit
 * direction dir: each population's column (L☉/pc², V band, after the dust) nearer than its
 * particles' range. As the shader: steps spaced as GLOW_S_SCALE (e^(kλ) − 1) out to the discs' s1;
 * in each step the in-plane quantities where it comes closest to the midplane, the emission and
 * the dust integrated exactly through their vertical profiles, and the step's own light dimmed
 * by its own dust as a uniform mix, (1 − e^(−τ)) / τ. A surface brightness S in L☉/pc² along a
 * line of sight is 10^(−0.4 (4.83 − 21.572)) S L☉ per arcsec²: μ = 26.40 − 2.5 log10 S.
 */
export function nearGlow(camG: Vec3, dir: Vec3, g: GlowSetup): { thin: number; young: number; thick: number } {
  const discRange = g.discRange ?? GLOW_DISC_RANGE_KPC;
  const youngRange = g.youngRange ?? GLOW_YOUNG_RANGE_KPC;
  const end = discRange[1];
  const lambda = Math.log(1 + end / GLOW_S_SCALE) / GLOW_STEPS;
  let tau = 0; // optical depth in V so far
  const out = { thin: 0, young: 0, thick: 0 };
  let sa = 0;
  for (let k = 1; k <= GLOW_STEPS; k++) {
    const sb = GLOW_S_SCALE * (Math.exp(k * lambda) - 1);
    const L = sb - sa;
    const pa: Vec3 = [camG[0] + dir[0] * sa, camG[1] + dir[1] * sa, camG[2] + dir[2] * sa];
    const pb: Vec3 = [camG[0] + dir[0] * sb, camG[1] + dir[1] * sb, camG[2] + dir[2] * sb];
    const cross = pa[2] * pb[2] <= 0 && pa[2] !== pb[2];
    const q = cross ? lerp(pa, pb, pa[2] / (pa[2] - pb[2])) : Math.abs(pa[2]) < Math.abs(pb[2]) ? pa : pb;
    const m = g.dust(q[0], q[1]);
    const za = pa[2] - m.warp;
    const zb = pb[2] - m.warp;
    const dz = zb - za;
    const flat = Math.abs(dz) < 1e-6 * L;
    // Dust, mag (the shader's columnAV piece).
    let av: number;
    if (flat) {
      const s = 1 / Math.cosh(za / m.discH);
      av = L * (m.discAV * s * s + m.armAV * Math.exp(-((za / m.armH) ** 2)));
    } else {
      const disc = m.discAV * m.discH * (Math.tanh(zb / m.discH) - Math.tanh(za / m.discH));
      const arms = m.armAV * m.armH * 0.8862269 * (erfA(zb / m.armH) - erfA(za / m.armH));
      av = (L / dz) * (disc + arms);
    }
    const dtau = 0.921034 * av;
    const mix = dtau > 1e-6 ? (1 - Math.exp(-dtau)) / dtau : 1;
    const seen = Math.exp(-tau) * mix;
    // ∫ e^(−|z|/h) ds over the step, kpc.
    const column = (h: number) => (flat ? L * Math.exp(-Math.abs(za) / h) : (layerColumn(za, zb, h) * L) / dz);
    const R = Math.hypot(q[0], q[1]);
    const s = 0.5 * (sa + sb);
    const wDisc = 1 - particleShare(s, discRange);
    const wYoung = 1 - particleShare(s, youngRange);
    // Σ / (2h) × ∫ e^(−|z|/h) ds: L☉/pc² (h and s both in kpc).
    out.thin += (wDisc * seen * discSigma(g.thin, R) * column(g.thin.hz)) / (2 * g.thin.hz);
    out.thick += (wDisc * seen * discSigma(g.thick, R) * column(g.thick.hz)) / (2 * g.thick.hz);
    if (wYoung > 0) out.young += (wYoung * seen * g.young(q[0], q[1]) * column(g.youngHz)) / (2 * g.youngHz);
    tau += dtau;
    sa = sb;
  }
  return out;
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Error function, Abramowitz & Stegun 7.1.26 (as the shaders). */
function erfA(x: number): number {
  const s = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}

// ─── The nuclear star cluster's glow ─────────────────────────────────────────────────────

/** The parts of sim/galaxy/nuclearGlow.json (written by scripts/build-nsc.py) the app reads. */
export interface NuclearGlowJson {
  count: number;
  splitAbsMag: number;
  innerPc: number;
  outerPc: number;
  excludePc: number;
  nsc: { rbPc: number; gamma: number; beta: number; alpha: number; q: number; mMaxPc: number; rho0: number; lightLsun: number; bv: number };
  nsd: { rbPc: number; edgePc: number; rMinPc: number; hzPc: number; slopeIn: number; slopeOut: number; rho0: number; lightLsun: number; bv: number };
  young: { count: number; discCount: number; lightLsun: number; rInPc: number; rOutPc: number; isoIndex: number; discIndex: number };
  modelShares: { nscLsun: number; nsdLsun: number };
  /** The points' shares at 64 radii, one table per count of points drawn (the first 60,000, 30,000, 10,000 of the file). */
  share: { rPc: number[]; counts: number[]; splitMag: number[]; bvNsc: number[]; bvNsd: number[]; nsc: number[][]; nsd: number[][] };
  m87: { distanceMpc: number; lightLsun: number; bv: number; flatInsidePc: number; lnRPc: number[]; lnJ: number[] };
}

/**
 * The laws of the nuclear cluster's light, pc and L☉/pc³ (V), frame G's axes about Sgr A* (z towards the
 * north galactic pole):
 *  - the cluster (NSC): ρ0 x^−γ (1 + x^α)^((γ − β)/α), x = m / r_b, m² = R² + (z/q)², for r ≥ innerPc and
 *    m ≤ mMaxPc (Schödel et al. 2018's Nuker law, flattened as Schödel et al. 2014 measured);
 *  - the disc (NSD): ρ0 (R/r_b)^−slopeIn inside r_b, (R/r_b)^−slopeOut to edgePc, times e^(−|z|/h_z), for
 *    R ≥ rMinPc and r ≤ outerPc (the Galaxy model's own law, so the field replaces its particles exactly);
 *  - each one's point share s(r): the part of its light in stars bright enough, seen from the hole, to be
 *    among the points drawn, at 64 radii uniform in ln r from innerPc to outerPc (linear between); one table for
 *    each count of points the app draws (60,000, 30,000 and 10,000 at the lens's quality rungs 0, 1 and 2).
 * The glow is each law times 1 − s(r); the points are the law times s(r), and the young stars.
 */
export interface NuclearLaws {
  nsc: { rho0: number; rbPc: number; gamma: number; beta: number; alpha: number; q: number; mMaxPc: number };
  nsd: { rho0: number; rbPc: number; hzPc: number; rMinPc: number; edgePc: number; slopeIn: number; slopeOut: number };
  innerPc: number;
  outerPc: number;
  /** The points' shares at the nodes, one table per count of points (`counts`); node i at ln r = shareLnR0 + i / shareInvDLnR. */
  counts: number[];
  shareNsc: Float64Array[];
  shareNsd: Float64Array[];
  /** The glow's colour B − V with each count (the stars it holds). */
  bvNsc: number[];
  bvNsd: number[];
  shareLnR0: number;
  shareInvDLnR: number;
  /** The young stars of the central half parsec, all points: their light and where they are (for the local term). */
  young: { lightLsun: number; rInPc: number; rOutPc: number; discShare: number; isoIndex: number; discIndex: number };
}

/** The laws from nuclearGlow.json. */
export function nuclearLaws(json: NuclearGlowJson): NuclearLaws {
  const r = json.share.rPc;
  const n = r.length;
  const lnR0 = Math.log(r[0]);
  return {
    nsc: { rho0: json.nsc.rho0, rbPc: json.nsc.rbPc, gamma: json.nsc.gamma, beta: json.nsc.beta, alpha: json.nsc.alpha, q: json.nsc.q, mMaxPc: json.nsc.mMaxPc },
    nsd: { rho0: json.nsd.rho0, rbPc: json.nsd.rbPc, hzPc: json.nsd.hzPc, rMinPc: json.nsd.rMinPc, edgePc: json.nsd.edgePc, slopeIn: json.nsd.slopeIn, slopeOut: json.nsd.slopeOut },
    innerPc: json.innerPc,
    outerPc: json.outerPc,
    counts: json.share.counts.slice(),
    shareNsc: json.share.nsc.map((t) => Float64Array.from(t)),
    shareNsd: json.share.nsd.map((t) => Float64Array.from(t)),
    bvNsc: json.share.bvNsc.slice(),
    bvNsd: json.share.bvNsd.slice(),
    shareLnR0: lnR0,
    shareInvDLnR: (n - 1) / (Math.log(r[n - 1]) - lnR0),
    young: {
      lightLsun: json.young.lightLsun,
      rInPc: json.young.rInPc,
      rOutPc: json.young.rOutPc,
      discShare: json.young.discCount / Math.max(1, json.young.count),
      isoIndex: json.young.isoIndex,
      discIndex: json.young.discIndex,
    },
  };
}

/**
 * The points' share of a component's light at radius r (pc), as the shader interpolates it: 0 the cluster, 1 the
 * disc; `table` the count of points drawn (an index into laws.counts: 0 is all 60,000).
 */
export function nuclearShare(laws: NuclearLaws, which: 0 | 1, rPc: number, table = 0): number {
  const t = which === 0 ? laws.shareNsc[table] : laws.shareNsd[table];
  const last = t.length - 1;
  const u = Math.min(last, Math.max(0, (Math.log(rPc) - laws.shareLnR0) * laws.shareInvDLnR));
  const i = Math.min(Math.floor(u), last - 1);
  return t[i] + (t[i + 1] - t[i]) * (u - i);
}

/** The cluster's law at (R, z) of frame G about Sgr A* (pc), L☉/pc³: all its light, points and glow. */
export function nscLaw(laws: NuclearLaws, R: number, z: number): number {
  const c = laws.nsc;
  const r = Math.hypot(R, z);
  const zq = z / c.q;
  const m = Math.sqrt(R * R + zq * zq);
  if (!(r >= laws.innerPc) || m > c.mMaxPc) return 0;
  const lx = Math.log(Math.max(m, 1e-6) / c.rbPc);
  return c.rho0 * Math.exp(-c.gamma * lx + ((c.gamma - c.beta) / c.alpha) * Math.log(1 + Math.exp(c.alpha * lx)));
}

/** The nuclear disc's law at (R, z), L☉/pc³. */
export function nsdLaw(laws: NuclearLaws, R: number, z: number): number {
  const d = laws.nsd;
  if (R < d.rMinPc || R >= d.edgePc || R * R + z * z > laws.outerPc * laws.outerPc) return 0;
  const lx = Math.log(R / d.rbPc);
  return d.rho0 * Math.exp(-(lx < 0 ? d.slopeIn : d.slopeOut) * lx - Math.abs(z) / d.hzPc);
}

/**
 * The young stars' light as a smooth law, L☉/pc³ at radius r: their number density spread over spheres (the
 * clockwise disc's fifth taken as isotropic too), times their mean light. Only for the stand-in of the points
 * left out near the camera: every young star is a point.
 */
export function youngLaw(laws: NuclearLaws, rPc: number): number {
  const y = laws.young;
  if (!(rPc >= y.rInPc && rPc <= y.rOutPc)) return 0;
  const p = (k: number) => (k * rPc ** (k - 1)) / (y.rOutPc ** k - y.rInPc ** k);
  const dNdr = (1 - y.discShare) * p(y.isoIndex) + y.discShare * p(y.discIndex);
  return (y.lightLsun * dNdr) / (4 * Math.PI * rPc * rPc);
}

/**
 * The glow's emissivity at p (frame G axes, pc from Sgr A*), L☉/pc³, with the points of share table `table` drawn:
 * the cluster's into out[0], the disc's into out[1].
 */
export function nuclearGlowAt(laws: NuclearLaws, px: number, py: number, pz: number, out: number[], table = 0): number[] {
  const R = Math.hypot(px, py);
  const r = Math.hypot(R, pz);
  out[0] = nscLaw(laws, R, pz) * (1 - nuclearShare(laws, 0, r, table));
  out[1] = nsdLaw(laws, R, pz) * (1 - nuclearShare(laws, 1, r, table));
  return out;
}

/**
 * The points' expected emissivity at p, L☉/pc³: the laws times their point shares (table `table`), and the young
 * stars (all of them points: at 30,000 and 10,000 points the few hundred faint ones the file sorts later, 0.01 and
 * 0.03 % of the young stars' light, are left out).
 */
export function nuclearPointsAt(laws: NuclearLaws, px: number, py: number, pz: number, table = 0): number {
  const R = Math.hypot(px, py);
  const r = Math.hypot(R, pz);
  return nscLaw(laws, R, pz) * nuclearShare(laws, 0, r, table) + nsdLaw(laws, R, pz) * nuclearShare(laws, 1, r, table) + youngLaw(laws, r);
}

/** Steps of the nuclear glow's march at the lens's quality rungs 0 and 1. */
export const NUCLEAR_GLOW_STEPS: readonly [number, number] = [16, 8];

const cutT = new Float64Array(6);
const pieceA = new Float64Array(5);
const pieceL = new Float64Array(5);
const cellB = new Int32Array(6);

/**
 * The glow's columns (L☉/pc², V, no dust) along the ray from `cam` (frame G axes, pc from Sgr A*) in the
 * unit direction `dir`, in `cells` midpoint steps: the cluster's into out[0], the disc's into out[1], of each
 * law times u − w s(r): u (`fieldShare`) the field's share of the two components' light (the Galaxy model's
 * particles of them draw the rest, 1 − u), w (`pointsShare`) the points' share (they draw w s(r), s the share
 * table `table`). With w = u = 1 (the default) it is the light not in the points, j (1 − s). The shader's nscMarch, step for step
 * (render/shaders/galaxyGlow.frag.glsl): along t, with s = s0 + a sinh t
 * about the ray's closest approach to the hole (s0, distance b), so ds = a cosh t dt, from the camera to where
 * the ray leaves the field (its outer sphere, or the disc's outer edge R = R_edge, beyond which neither
 * component has light: the camera is always inside that cylinder); cut where the ray enters and leaves the
 * inner hole (no light) and crosses the disc's inner cylinder, and the cells shared among the pieces by
 * rounding their running lengths. The scale a is b (then a cosh t is the distance from the hole, and the
 * steps follow the cluster's cusp) unless the ray passes the galactic pole's axis closer than that, at a
 * height (a ray below or above the hole): then a is the distance from the axis at s0, at least the disc's
 * inner radius, so the steps also resolve the disc's R^−1.3 peak there.
 */
export function nuclearMarch(laws: NuclearLaws, cam: Vec3, dir: Vec3, cells: number, out: number[] = [0, 0], table = 0, pointsShare = 1, fieldShare = 1): number[] {
  out[0] = 0;
  out[1] = 0;
  const s0 = -(cam[0] * dir[0] + cam[1] * dir[1] + cam[2] * dir[2]);
  const cx = cam[1] * dir[2] - cam[2] * dir[1];
  const cy = cam[2] * dir[0] - cam[0] * dir[2];
  const cz = cam[0] * dir[1] - cam[1] * dir[0];
  const b = Math.max(Math.hypot(cx, cy, cz), 1e-9);
  const rOut = laws.outerPc;
  if (b >= rOut) return out;
  const A = dir[0] * dir[0] + dir[1] * dir[1];
  const B = cam[0] * dir[0] + cam[1] * dir[1];
  const C0 = cam[0] * cam[0] + cam[1] * cam[1];
  let sEnd = s0 + Math.sqrt(rOut * rOut - b * b);
  if (A > 1e-12 && cylinder(A, B, C0 - laws.nsd.edgePc * laws.nsd.edgePc)) sEnd = Math.min(sEnd, cross2[1]);
  const a = Math.min(b, Math.max(Math.hypot(cam[0] + s0 * dir[0], cam[1] + s0 * dir[1]), laws.nsd.rMinPc));
  const inv = 1 / a;
  const tc = Math.asinh(-s0 * inv);
  const te = Math.asinh((sEnd - s0) * inv);
  if (!(te > tc)) return out;
  // The interior cut points, te where there is none: the inner hole's two ends, the cylinder's two crossings.
  let h0 = te;
  let h1 = te;
  if (b < laws.innerPc) {
    const q = Math.sqrt(laws.innerPc * laws.innerPc - b * b) * inv;
    h0 = Math.asinh(-q);
    h1 = Math.asinh(q);
  }
  let k1 = te;
  let k2 = te;
  if (A > 1e-12 && cylinder(A, B, C0 - laws.nsd.rMinPc * laws.nsd.rMinPc)) {
    k1 = Math.asinh((cross2[0] - s0) * inv);
    k2 = Math.asinh((cross2[1] - s0) * inv);
  }
  const clampT = (t: number) => Math.min(te, Math.max(tc, t));
  const hA = clampT(h0);
  const hB = clampT(h1);
  // Sort the four (a network of five compare-and-swaps, as the shader).
  let v0 = hA;
  let v1 = hB;
  let v2 = clampT(k1);
  let v3 = clampT(k2);
  let w: number;
  if (v0 > v1) ((w = v0), (v0 = v1), (v1 = w));
  if (v2 > v3) ((w = v2), (v2 = v3), (v3 = w));
  if (v0 > v2) ((w = v0), (v0 = v2), (v2 = w));
  if (v1 > v3) ((w = v1), (v1 = v3), (v3 = w));
  if (v1 > v2) ((w = v1), (v1 = v2), (v2 = w));
  cutT[0] = tc;
  cutT[1] = v0;
  cutT[2] = v1;
  cutT[3] = v2;
  cutT[4] = v3;
  cutT[5] = te;
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const lo = cutT[i];
    const hi = cutT[i + 1];
    // The hole's piece holds no light and gets no cells.
    const hole = hA < hB && lo === hA && hi === hB;
    pieceA[i] = lo;
    pieceL[i] = hole ? 0 : hi - lo;
    total += pieceL[i];
  }
  if (!(total > 0)) return out;
  cellB[0] = 0;
  let run = 0;
  for (let i = 0; i < 5; i++) {
    run += pieceL[i];
    cellB[i + 1] = i === 4 ? cells : Math.round((cells * run) / total);
  }
  for (let k = 0; k < cells; k++) {
    let i = 0;
    for (let j = 1; j < 5; j++) if (k >= cellB[j]) i = j;
    const n = cellB[i + 1] - cellB[i];
    const h = pieceL[i] / n;
    const t = pieceA[i] + (k - cellB[i] + 0.5) * h;
    const et = Math.exp(t);
    const s = s0 + 0.5 * a * (et - 1 / et);
    const ds = 0.5 * a * (et + 1 / et) * h;
    const px = cam[0] + s * dir[0];
    const py = cam[1] + s * dir[1];
    const pz = cam[2] + s * dir[2];
    const R = Math.hypot(px, py);
    const r = Math.hypot(R, pz);
    out[0] += nscLaw(laws, R, pz) * (fieldShare - pointsShare * nuclearShare(laws, 0, r, table)) * ds;
    out[1] += nsdLaw(laws, R, pz) * (fieldShare - pointsShare * nuclearShare(laws, 1, r, table)) * ds;
  }
  return out;
}

const cross2 = [0, 0];

/**
 * Where the ray s ↦ cam + s dir crosses a cylinder about the galactic pole's axis: the roots s− ≤ s+ of
 * A s² + 2B s + C = 0 (A = dir_x² + dir_y² > 0, B = cam_xy · dir_xy, C = R_cam² − ρ²) into cross2, in the form
 * without cancellation (as the shader, in float32). False when the ray misses it.
 */
function cylinder(A: number, B: number, C: number): boolean {
  const disc = B * B - A * C;
  if (!(disc > 0)) return false;
  const q = B >= 0 ? -(B + Math.sqrt(disc)) : Math.sqrt(disc) - B;
  const r1 = q / A;
  const r2 = C / q;
  cross2[0] = Math.min(r1, r2);
  cross2[1] = Math.max(r1, r2);
  return true;
}

/** Points in the unit ball, uniform in volume (a fixed set): the local term's average over the sphere round the camera. */
const BALL: readonly number[] = (() => {
  const out: number[] = [];
  // Three shells of equal volume, each at the radius that halves its volume: ∛(1/6), ∛(1/2), ∛(5/6).
  const shells = [Math.cbrt(1 / 6), Math.cbrt(1 / 2), Math.cbrt(5 / 6)];
  const per = 16;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (const rr of shells) {
    for (let i = 0; i < per; i++) {
      const y = 1 - (2 * (i + 0.5)) / per;
      const q = Math.sqrt(1 - y * y);
      const a = golden * i + rr * 7;
      out.push(rr * q * Math.cos(a), rr * y, rr * q * Math.sin(a));
    }
  }
  return out;
})();

/**
 * The column (L☉/pc², V) that stands in, along every line of sight, for the point stars within `radiusPc` of the
 * camera (`cam`, frame G axes, pc from Sgr A*), which are not drawn (a model K giant 100 au away would be a
 * point of V −21.6 with no disc): their expected emissivity averaged over that sphere, times its radius, so
 * the sphere's light is kept (from its centre a uniform sphere of emissivity j and radius R shows a column jR
 * in every direction).
 */
export function nuclearLocalColumn(laws: NuclearLaws, cam: Vec3, radiusPc: number, table = 0): number {
  const r = Math.hypot(cam[0], cam[1], cam[2]);
  if (r - radiusPc > laws.outerPc) return 0;
  let sum = 0;
  const n = BALL.length / 3;
  for (let i = 0; i < n; i++) sum += nuclearPointsAt(laws, cam[0] + radiusPc * BALL[3 * i], cam[1] + radiusPc * BALL[3 * i + 1], cam[2] + radiusPc * BALL[3 * i + 2], table);
  return (sum / n) * radiusPc;
}

// ─── M87's own starlight ─────────────────────────────────────────────────────────────────

/** Directions in M87's table, uniform in ln ψ (ψ the angle from the direction of M87's centre) from M87_PSI_MIN to π. */
export const M87_TABLE_SIZE = 64;
export const M87_PSI_MIN = 1e-4;
/** Steps along each direction (in t, as the nuclear march).*/
export const M87_TABLE_STEPS = 24;
/** A table entry with no light (ln of the column). */
export const M87_LN_NONE = -80;

/** M87's light profile: its luminosity density j(r), L☉/pc³, at radii uniform in ln r (log-linear between; none beyond). */
export interface M87Profile {
  lnR0: number;
  invDLnR: number;
  lnJ: Float64Array;
  rMaxPc: number;
  /** Inside this the profile is held flat (1,000 au), pc. */
  rFlatPc: number;
}

export function m87Profile(json: NuclearGlowJson): M87Profile {
  const lr = json.m87.lnRPc;
  const n = lr.length;
  return { lnR0: lr[0], invDLnR: (n - 1) / (lr[n - 1] - lr[0]), lnJ: Float64Array.from(json.m87.lnJ), rMaxPc: Math.exp(lr[n - 1]), rFlatPc: json.m87.flatInsidePc };
}

/** j(r), L☉/pc³ (held at its innermost value inside the table: the profile is flat inside 1,000 au). */
export function m87Emissivity(p: M87Profile, rPc: number): number {
  if (!(rPc < p.rMaxPc)) return 0;
  const last = p.lnJ.length - 1;
  const u = Math.max(0, (Math.log(rPc) - p.lnR0) * p.invDLnR);
  const i = Math.min(Math.floor(u), last - 1);
  return Math.exp(p.lnJ[i] + (p.lnJ[i + 1] - p.lnJ[i]) * (u - i));
}

/**
 * What M87's model galaxy draws near the camera: its elliptical template's splat size against radius, and the
 * settings the galaxies' shader fades its particles with (render/shaders/galaxies.vert.glsl: a splat of σ
 * target pixels is drawn × (1 − smoothstep(σ_max/2, σ_max, σ)), σ = h / d × pixels per radian).
 */
export interface M87TemplateNear {
  /** The template's unit (its half-light radius) and its splats' scale, pc. */
  unitPc: number;
  splatPc: number;
  /** Median splat size (template units) at radii uniform in ln r (template units) from lnR0, step 1/invDLnR; none beyond rMax. */
  lnR0: number;
  invDLnR: number;
  splat: Float64Array;
  rMax: number;
  lnRMax: number;
  /** The largest of those splats (template units), and the largest median at or inside each node. */
  splatMax: number;
  splatUpTo: Float64Array;
  /** The Galaxy layer's pixels per radian and the largest splat drawn (galaxyUniforms uPxPerRad, uSigmaMax). */
  pxPerRad: number;
  sigmaMax: number;
}

/** The median splat size of a template's particles against radius (template units), in 24 bins uniform in ln r. */
export function templateSplats(position: Float32Array, attrs: Float32Array, count: number): Pick<M87TemplateNear, 'lnR0' | 'invDLnR' | 'splat' | 'rMax' | 'lnRMax' | 'splatMax' | 'splatUpTo'> {
  const r = new Float64Array(count);
  let rMax = 0;
  let rMin = Infinity;
  for (let i = 0; i < count; i++) {
    r[i] = Math.hypot(position[3 * i], position[3 * i + 1], position[3 * i + 2]);
    rMax = Math.max(rMax, r[i]);
    rMin = Math.min(rMin, r[i]);
  }
  const bins = 24;
  const lnR0 = Math.log(Math.max(rMin, 1e-6));
  const invD = bins / (Math.log(rMax) - lnR0);
  const lists: number[][] = Array.from({ length: bins }, () => []);
  for (let i = 0; i < count; i++) lists[Math.min(bins - 1, Math.floor((Math.log(Math.max(r[i], 1e-6)) - lnR0) * invD))].push(attrs[4 * i + 1]);
  const splat = new Float64Array(bins);
  let last = 0.5;
  for (let k = 0; k < bins; k++) {
    const l = lists[k].sort((a, b) => a - b);
    splat[k] = l.length ? l[l.length >> 1] : last;
    last = splat[k];
  }
  // Bin k's median stands for its centre, ln r = lnR0 + (k + ½)/invD.
  let splatMax = 0;
  for (let i = 0; i < count; i++) splatMax = Math.max(splatMax, attrs[4 * i + 1]);
  // The largest median at or inside each node, and the next (the medians are read linearly between nodes).
  const splatUpTo = new Float64Array(bins);
  let m = 0;
  for (let k = 0; k < bins; k++) splatUpTo[k] = m = Math.max(m, splat[k], k + 1 < bins ? splat[k + 1] : 0);
  return { lnR0: lnR0 + 0.5 / invD, invDLnR: invD, splat, rMax, lnRMax: Math.log(rMax), splatMax, splatUpTo };
}

/**
 * The share of the template's light that its particles still draw, at ln(r / unit) from M87's centre (lnRr) and
 * sPc from the camera: 0 where the camera is inside a splat or a splat is past σ_max, 1 where splats are under
 * σ_max/2, the smoothstep between (as galaxies.vert.glsl), and 1 beyond the template's reach.
 */
function keptAt(t: M87TemplateNear, lnRr: number, sPc: number): number {
  if (!(lnRr <= t.lnRMax)) return 1;
  const last = t.splat.length - 1;
  const u = Math.min(last, Math.max(0, (lnRr - t.lnR0) * t.invDLnR));
  const i = Math.min(Math.floor(u), last - 1);
  const h = (t.splat[i] + (t.splat[i + 1] - t.splat[i]) * (u - i)) * t.splatPc;
  if (sPc <= h) return 0;
  const sigma = (h / sPc) * t.pxPerRad;
  const lo = 0.5 * t.sigmaMax;
  if (sigma <= lo) return 1;
  if (sigma >= t.sigmaMax) return 0;
  const x = (sigma - lo) / (t.sigmaMax - lo);
  return 1 - x * x * (3 - 2 * x);
}

/** The share of the template's light at radius rPc (from M87's centre) and sPc from the camera that its particles still draw. */
export function templateKept(t: M87TemplateNear, rPc: number, sPc: number): number {
  return keptAt(t, Math.log(Math.max(rPc / t.unitPc, 1e-9)), sPc);
}

/**
 * M87's own starlight seen from a camera `dPc` from its centre: into `out` (M87_TABLE_SIZE entries), ln of the
 * column (L☉/pc², V) along the directions ψ_i = M87_PSI_MIN (π/M87_PSI_MIN)^(i/(N − 1)) from the direction of
 * the centre, of the true profile times the share of the template's light its particles no longer draw
 * (templateKept), out to the template's reach (beyond it M87's halo is left to the model galaxy's point).
 * Along each direction, in t (r = b cosh t, b = d sin ψ), over the part of the ray where the template can have
 * faded: from the camera (or where the ray enters the template's sphere) to where the largest splat drops
 * under σ_max/2 or the ray leaves the sphere, in M87_TABLE_STEPS steps each exact for an exponential in t (a
 * power law in r, which is what the profile is, piece by piece). e^t is carried from node to node, and ln r
 * is a short series in e^(−2|t|) at most nodes, so each node costs about one exponential. No allocation.
 */
export function m87ColumnTable(p: M87Profile, t: M87TemplateNear, dPc: number, out: Float32Array): Float32Array {
  const n = out.length;
  const rEnd = Math.min(p.rMaxPc, Math.exp(t.lnRMax) * t.unitPc);
  const lnStep = Math.log(Math.PI / M87_PSI_MIN) / (n - 1);
  const lnUnit = Math.log(t.unitPc);
  // No particle fades further from the camera than s = h pxPerRad / (σ_max / 2), h its splat.
  const k2 = (2 * t.splatPc * t.pxPerRad) / t.sigmaMax;
  const sFade = k2 * t.splatMax;
  const lastJ = p.lnJ.length - 1;
  const lastS = t.splatUpTo.length - 1;
  for (let i = 0; i < n; i++) {
    const psi = M87_PSI_MIN * Math.exp(i * lnStep);
    const b = Math.max(dPc * Math.sin(psi), 1e-12);
    const s0 = dPc * Math.cos(psi);
    if (b >= rEnd) {
      out[i] = M87_LN_NONE;
      continue;
    }
    const tEdge = Math.acosh(rEnd / b);
    const lnHalfB = Math.log(0.5 * b);
    const ta = Math.max(Math.asinh(-s0 / b), -tEdge);
    // Tighten the end to this ray: the largest splat at radii up to the furthest the ray reaches before it (the
    // splats grow outwards), three times over (each bound can only shrink the stretch, and so the radii, of the next).
    let sHi = sFade;
    for (let it = 0; it < 3; it++) {
      const rHi = Math.max(dPc, Math.hypot(b, sHi - s0));
      const u = Math.min(lastS, Math.max(0, (Math.log(rHi) - lnUnit - t.lnR0) * t.invDLnR));
      const j = Math.min(Math.floor(u), lastS - 1);
      sHi = Math.min(sHi, k2 * (t.splatUpTo[j] + (t.splatUpTo[j + 1] - t.splatUpTo[j]) * (u - j)));
    }
    // On the way in (towards the closest approach) the radii shrink and so do the splats: where the fade stops
    // before the closest approach, find it (bisection on s − k h(r(s)), with a quarter to spare), so the steps
    // are not spent where the template draws everything.
    const sIn = Math.min(s0, sHi);
    if (sIn > 0 && sIn * FADE_MARGIN > k2 * medianSplat(t, Math.log(Math.max(b, 1e-300)) - lnUnit)) {
      let lo = 0;
      let hi = sIn;
      for (let it = 0; it < 10; it++) {
        const mid = 0.5 * (lo + hi);
        if (mid > k2 * medianSplat(t, Math.log(Math.hypot(b, s0 - mid)) - lnUnit)) hi = mid;
        else lo = mid;
      }
      if (hi < sIn) sHi = Math.min(sHi, hi * FADE_MARGIN);
    }
    const tb = Math.min(tEdge, Math.asinh((sHi - s0) / b));
    if (!(tb > ta)) {
      out[i] = M87_LN_NONE;
      continue;
    }
    // Pieces cut where the ray crosses the edge of the profile's flat core (its slope jumps there).
    let pieces = 0;
    cutM[pieces++] = ta;
    if (b < p.rFlatPc) {
      const tf = Math.acosh(p.rFlatPc / b);
      if (-tf > ta && -tf < tb) cutM[pieces++] = -tf;
      if (tf > ta && tf < tb) cutM[pieces++] = tf;
    }
    cutM[pieces] = tb;
    let col = 0;
    for (let q = 0; q < pieces; q++) {
      const a0 = cutM[q];
      const a1 = cutM[q + 1];
      const steps = Math.max(1, Math.round((M87_TABLE_STEPS * (a1 - a0)) / (tb - ta)));
      const h = (a1 - a0) / steps;
      const eh = Math.exp(h);
      let et = Math.exp(a0);
      let sum = 0;
      let prev = 0;
      let lnPrev = 0;
      let tk = a0;
      for (let k = 0; k <= steps; k++, et *= eh, tk += h) {
        const inv = 1 / et;
        const r = 0.5 * b * (et + inv);
        const sk = s0 + 0.5 * b * (et - inv);
        // ln r = ln(b/2) + |t| + ln(1 + x), x = e^(−2|t|): by its series where x < 0.03 (most nodes; the error is
        // under x⁶/6, 1.3e-10), else a logarithm.
        const x = et > 1 ? inv * inv : et * et;
        const lr = x < 0.03 ? lnHalfB + Math.abs(tk) + x * (1 - x * (0.5 - x * (1 / 3 - x * (0.25 - x * 0.2)))) : Math.log(r);
        const kept = keptAt(t, lr - lnUnit, sk);
        let f = 0;
        let lnF = 0;
        if (kept < 1 && r < p.rMaxPc) {
          const u = Math.max(0, (lr - p.lnR0) * p.invDLnR);
          const j = Math.min(Math.floor(u), lastJ - 1);
          lnF = p.lnJ[j] + (p.lnJ[j + 1] - p.lnJ[j]) * (u - j) + lr + (kept > 0 ? Math.log(1 - kept) : 0);
          f = Math.exp(lnF);
        }
        // Each step exactly for an exponential in t (a power law in r): (f1 − f0) / ln(f1 / f0), else the trapezoid.
        if (k > 0) {
          const dl = f > 0 && prev > 0 ? lnF - lnPrev : 0;
          sum += Math.abs(dl) > 1e-6 ? (f - prev) / dl : 0.5 * (f + prev);
        }
        prev = f;
        lnPrev = lnF;
      }
      col += sum * h;
    }
    out[i] = col > 0 ? Math.max(M87_LN_NONE, Math.log(col)) : M87_LN_NONE;
  }
  return out;
}

const cutM = new Float64Array(4);
/** The bisection's end is pushed out by this much, for the medians' scatter from bin to bin. */
const FADE_MARGIN = 1.25;

/** The template's median splat (template units) at ln(r / unit) = lnRr, as keptAt reads it. */
function medianSplat(t: M87TemplateNear, lnRr: number): number {
  const last = t.splat.length - 1;
  const u = Math.min(last, Math.max(0, (lnRr - t.lnR0) * t.invDLnR));
  const i = Math.min(Math.floor(u), last - 1);
  return t.splat[i] + (t.splat[i + 1] - t.splat[i]) * (u - i);
}

/** The column the shader reads from the table in direction ψ from M87's centre (L☉/pc²): ln-linear in ln ψ. */
export function m87ColumnAt(table: Float32Array, psi: number): number {
  const n = table.length;
  const lnStep = Math.log(Math.PI / M87_PSI_MIN) / (n - 1);
  const u = Math.min(n - 1, Math.max(0, Math.log(Math.max(psi, 1e-30) / M87_PSI_MIN) / lnStep));
  const i = Math.min(Math.floor(u), n - 2);
  const l = table[i] + (table[i + 1] - table[i]) * (u - i);
  return l <= M87_LN_NONE + 1 ? 0 : Math.exp(l);
}
