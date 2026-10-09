/**
 * A pulsar seen up close (scene/PulsarModel.tsx draws it): the neutron star, its two radio beams, its magnetic field
 * and, for a pair of neutron stars, the other star and their orbits. Everything is in world axes, km, about the
 * catalogue's place (a pair's centre of mass).
 *
 * What is measured and what is chosen:
 *  - the spin period (ATNF) sets the turning, the light cylinder c·P/2π and the beam's width, ρ = 5.8° P^−½ (the
 *    outer cone at 1 GHz: Rankin 1993, ApJ 405, 285);
 *  - we see it pulse, so a beam sweeps over us each turn: the magnetic axis is set at α = ζ − β to the spin axis,
 *    β (how far the beam's middle misses us) half the beam's width, and the beam is towards us when the marker
 *    pulses (records.ts shownPulse);
 *  - the spin axis's tilt to our line of sight, ζ, and its direction on the sky are measured from the X-ray tori of
 *    the Crab and Vela pulsars (Ng & Romani 2004, ApJ 601, 479) and the Double Pulsar's from its eclipses and
 *    timing; for the others they are chosen (from the name, so each pulsar keeps its own);
 *  - a pair's period is the catalogue's, its masses and eccentricity published (PAIRS), else 1.35 and 1.25 solar
 *    masses and a circle; its size follows from Kepler's law; a recycled pulsar's spin is taken as aligned with the
 *    orbit, as the Double Pulsar's is (Ferdman et al. 2013, ApJ 767, 85);
 *  - a magnetar (McGill catalogue) has radio beams only if it has been seen pulsing in radio, and close to the star a
 *    twisted magnetosphere: dipole loops whose two footpoints are turned about the magnetic axis by about a radian,
 *    the twist that carries the currents thought to power its X-rays (Thompson, Lyutikov & Kulkarni 2002, ApJ 574,
 *    332); the loops are a model, the twist's size an illustration of theirs.
 */
import { Vector3 } from 'three';
import { C_KM_S } from '../../physics/constants';
import { raDecToWorld } from '../frames';
import type { Magnetar, Pulsar } from './format';

/** A neutron star's radius, km (NICER: Riley et al. 2021, Miller et al. 2021). */
export const NS_RADIUS_KM = 12;
/** G·M☉, km³/s². */
const GM_SUN = 1.32712440018e11;
const DEG = Math.PI / 180;
/** The widest beam drawn (a millisecond pulsar's would be wider than a hemisphere by the formula). */
export const MAX_BEAM_RAD = 35 * DEG;

/** A spinning, beaming neutron star. */
export interface Spin {
  /** Spin period, s, and the one shown (slowed by a power of ten when too fast to watch). */
  periodS: number;
  shownPeriodS: number;
  slowedBy: number;
  /** Spin axis, world unit vector. */
  axis: Vector3;
  /** Magnetic axis at phase 0, world unit vector. */
  mag0: Vector3;
  /** Angle between the axes, rad. */
  alphaRad: number;
  /** The beam's half-width, rad. */
  beamRad: number;
  /** c·P/2π, km: where the field, turning with the star, would move at the speed of light. */
  lightCylinderKm: number;
  /** Whether it shines in radio (a pulsar), or is only a neutron star. */
  beams: boolean;
}

export interface Pair {
  periodS: number;
  e: number;
  /** Whether e is published (PAIRS) or a stand-in circle. */
  eKnown: boolean;
  /** Masses, M☉: the pulsar's and its companion's. */
  mPulsar: number;
  mCompanion: number;
  /** Semi-major axis of the relative orbit, km. */
  aKm: number;
  /** Orbit normal, and towards periastron (world unit vectors). */
  normal: Vector3;
  periastron: Vector3;
  /** The companion's spin (beams only for the Double Pulsar's other pulsar). */
  companion: Spin;
  /** The companion's name and catalogue name, when it is a known pulsar. */
  companionName?: string;
  companionJname?: string;
}

export interface PulsarModel {
  /** From the pulsar towards us (the Sun), world unit vector. */
  toEarth: Vector3;
  spin: Spin;
  /** Angle between the spin axis and our line of sight, and between the beam's middle and us, rad. */
  zetaRad: number;
  betaRad: number;
  /** Whether the spin axis's direction is measured or chosen. */
  orientation: 'measured' | 'chosen';
  pair: Pair | null;
  /** The size the view is framed by, km: the light cylinder, or a pair's orbit (a magnetar's twisted loops). */
  sizeKm: number;
  /** A magnetar's close field: the twist of its loops, rad, and its surface field, G (NaN: not measured). */
  magnetar: { twistRad: number; bG: number } | null;
}

/** The beam's half-width for a spin period, rad. */
export const beamHalfWidth = (periodS: number): number => Math.min(MAX_BEAM_RAD, 5.8 * DEG * Math.pow(periodS, -0.5));

export const lightCylinderKm = (periodS: number): number => (C_KM_S * periodS) / (2 * Math.PI);

/** Spin axes measured from X-ray tori and eclipses: tilt to the line of sight ζ and position angle ψ on the sky, deg. */
const MEASURED_AXES: Record<string, { zeta: number; psi: number; alpha?: number }> = {
  'J0534+2200': { zeta: 61.3, psi: 124.0 },
  'J0835-4510': { zeta: 63.6, psi: 130.6 },
};

/**
 * Pairs of neutron stars with published masses and eccentricities (Weisberg & Huang 2016; Kramer et al. 2021;
 * Ferdman et al. 2014, 2020; Cameron et al. 2023; Fonseca et al. 2014; Jacoby et al. 2006; Martinez et al. 2015;
 * Lynch et al. 2018; Stovall et al. 2018). The Double Pulsar's inclination is from its eclipses and its A pulsar's
 * axis is at right angles to its spin (both of its poles sweep over us).
 */
const PAIRS: Record<string, { e: number; mp: number; mc: number; incl?: number; alpha?: number; partner?: string }> = {
  'J1915+1606': { e: 0.6171, mp: 1.438, mc: 1.39, incl: 47.2 },
  'J0737-3039A': { e: 0.0878, mp: 1.338, mc: 1.249, incl: 89.35, alpha: 90.2, partner: 'J0737-3039B' },
  'J0737-3039B': { e: 0.0878, mp: 1.249, mc: 1.338, incl: 89.35, partner: 'J0737-3039A' },
  'J1756-2251': { e: 0.1806, mp: 1.341, mc: 1.23 },
  'J1757-1854': { e: 0.6058, mp: 1.338, mc: 1.395 },
  'J1537+1155': { e: 0.2737, mp: 1.333, mc: 1.346 },
  'J2129+1210C': { e: 0.681, mp: 1.358, mc: 1.354 },
  'J1913+1102': { e: 0.0896, mp: 1.62, mc: 1.27 },
  'J0453+1559': { e: 0.1125, mp: 1.559, mc: 1.174 },
  'J0509+3801': { e: 0.586, mp: 1.34, mc: 1.46 },
  'J1946+2052': { e: 0.064, mp: 1.25, mc: 1.25 },
};
/** The Double Pulsar's spin periods, s (ATNF), for the partner of the one shown. */
const PARTNER_PERIOD_S: Record<string, number> = { 'J0737-3039A': 0.0226993786, 'J0737-3039B': 2.77346077 };
/** The B pulsar's spin axis is 130° from the orbit's (Breton et al. 2008, Science 321, 104): its beams now miss us. */
const B_MISALIGN_DEG = 130;

/** Numbers in [0, 1) from a name: each pulsar's chosen angles stay the same from visit to visit. */
function hashes(name: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Rotate v about the unit axis k by angle a (Rodrigues). */
export function rotateAbout(v: Vector3, k: Vector3, a: number, out = new Vector3()): Vector3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kv = k.dot(v);
  const x = k.y * v.z - k.z * v.y;
  const y = k.z * v.x - k.x * v.z;
  const z = k.x * v.y - k.y * v.x;
  return out.set(v.x * c + x * s + k.x * kv * (1 - c), v.y * c + y * s + k.y * kv * (1 - c), v.z * c + z * s + k.z * kv * (1 - c));
}

/** A unit vector at angle ζ from `toEarth`, at position angle ψ (from north through east) on our sky. */
function onSky(toEarth: Vector3, north: Vector3, east: Vector3, zeta: number, psi: number): Vector3 {
  return new Vector3()
    .addScaledVector(toEarth, Math.cos(zeta))
    .addScaledVector(north, Math.sin(zeta) * Math.cos(psi))
    .addScaledVector(east, Math.sin(zeta) * Math.sin(psi))
    .normalize();
}

/** The magnetic axis at phase 0: at α from the spin axis, in the plane of the spin axis and `toward`, on its side. */
function magneticAxis(axis: Vector3, toward: Vector3, alpha: number): Vector3 {
  const u = toward.clone().addScaledVector(axis, -toward.dot(axis));
  if (u.lengthSq() < 1e-12) u.set(axis.y, axis.z, axis.x).addScaledVector(axis, -axis.y);
  u.normalize();
  return axis.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(u, Math.sin(alpha));
}

function spinOf(periodS: number, axis: Vector3, mag0: Vector3, alphaRad: number, beams: boolean): Spin {
  const shown = shownPulse(periodS);
  return {
    periodS,
    shownPeriodS: shown.periodS,
    slowedBy: shown.slowedBy,
    axis,
    mag0,
    alphaRad,
    beamRad: beamHalfWidth(periodS),
    lightCylinderKm: lightCylinderKm(periodS),
    beams,
  };
}

/** A period you can watch: a pulse at most this often (s) shows at its real rate; faster ones are slowed. */
export const WATCHABLE_PERIOD_S = 0.25;

/**
 * The period its marker pulses at, s, and how much slower than the real one: the real period if WATCHABLE_PERIOD_S or
 * longer, else slowed by the least power of ten that makes it so (the Crab's 33 ms ten times, a millisecond pulsar's a
 * thousand), so faster pulsars still pulse faster and the rhythm keeps its proportions.
 */
export function shownPulse(p0: number): { periodS: number; slowedBy: number } {
  if (!(p0 > 0)) return { periodS: 0, slowedBy: 1 };
  let k = 1;
  while (p0 * k < WATCHABLE_PERIOD_S) k *= 10;
  return { periodS: p0 * k, slowedBy: k };
}

/** Kepler's third law: the relative orbit's semi-major axis, km, for a period (s) and total mass (M☉). */
export const semiMajorAxisKm = (periodS: number, mTotal: number): number => Math.cbrt((GM_SUN * mTotal * periodS * periodS) / (4 * Math.PI * Math.PI));

/** How far a magnetar's twisted loops reach, in star radii (the largest of MAGNETAR_LOOPS). */
export const MAGNETAR_LOOP_REACH = 12;
/** The twist of a magnetar's loops, rad: about a radian (Thompson, Lyutikov & Kulkarni 2002). */
export const MAGNETAR_TWIST_RAD = 1;
/** Loop sizes (dipole L, in star radii) of a magnetar's close field. */
const MAGNETAR_LOOPS = [1.8, 2.6, 4, 6.5, 12];

/** Whether a magnetar has been seen pulsing in radio (the catalogue's bands include R). */
export const radioMagnetar = (m: Pick<Magnetar, 'bands'>): boolean => m.bands.includes('R');

/** The model of a catalogue pulsar, or null without a spin period. */
export function pulsarModel(p: Pick<Pulsar, 'jname' | 'raDeg' | 'decDeg' | 'p0' | 'pbDays' | 'companion'> & { magnetar?: Pick<Magnetar, 'bands' | 'bG'> }): PulsarModel | null {
  if (!(p.p0 > 0)) return null;
  const rnd = hashes(p.jname);
  const toEarth = raDecToWorld(p.raDeg, p.decDeg).negate();
  const pole = raDecToWorld(0, 90);
  // Our sky at the pulsar: north towards the celestial pole, east to its left as we look (RA increasing).
  const north = pole.clone().addScaledVector(toEarth, -pole.dot(toEarth)).normalize();
  const east = new Vector3().crossVectors(pole, toEarth).negate().normalize();
  const measured = MEASURED_AXES[p.jname];
  const pair = p.pbDays > 0 && p.companion === 'NS' ? PAIRS[p.jname] : undefined;
  const zeta = (measured?.zeta ?? pair?.incl ?? 35 + 50 * rnd()) * DEG;
  const psi = (measured?.psi ?? 360 * rnd()) * DEG;
  const axis = onSky(toEarth, north, east, zeta, psi);
  const rho = beamHalfWidth(p.p0);
  const alphaDeg = measured?.alpha ?? pair?.alpha;
  const alpha = alphaDeg !== undefined ? alphaDeg * DEG : Math.max(5 * DEG, zeta - 0.5 * rho);
  const spin = spinOf(p.p0, axis, magneticAxis(axis, toEarth, alpha), alpha, p.magnetar ? radioMagnetar(p.magnetar) : true);
  let pairModel: Pair | null = null;
  if (p.pbDays > 0 && p.companion === 'NS') {
    const periodS = p.pbDays * 86400;
    const mp = pair?.mp ?? 1.35;
    const mc = pair?.mc ?? 1.25;
    // A recycled pulsar's spin is aligned with its orbit: the orbit's normal is the spin axis.
    const normal = axis.clone();
    const inPlane = new Vector3().crossVectors(normal, toEarth);
    if (inPlane.lengthSq() < 1e-12) inPlane.set(1, 0, 0).addScaledVector(normal, -normal.x);
    inPlane.normalize();
    const periastron = rotateAbout(inPlane, normal, 2 * Math.PI * rnd()).normalize();
    const partner = pair?.partner;
    let companion: Spin;
    if (partner && PARTNER_PERIOD_S[partner]) {
      // The other pulsar of the Double Pulsar: its spin axis 130° from the orbit's, its beams missing us since 2008.
      const tilt = new Vector3().crossVectors(normal, toEarth).normalize();
      const cAxis = rotateAbout(normal, tilt, B_MISALIGN_DEG * DEG).normalize();
      const cAlpha = 60 * DEG;
      companion = spinOf(PARTNER_PERIOD_S[partner], cAxis, magneticAxis(cAxis, toEarth.clone().negate(), cAlpha), cAlpha, true);
    } else {
      // A neutron star not seen as a pulsar: drawn turning slowly, without beams.
      const cAxis = onSky(toEarth, north, east, 180 * rnd() * DEG, 360 * rnd() * DEG);
      companion = spinOf(1, cAxis, magneticAxis(cAxis, toEarth, 30 * DEG), 30 * DEG, false);
    }
    pairModel = {
      periodS,
      e: pair?.e ?? 0,
      eKnown: pair !== undefined,
      mPulsar: mp,
      mCompanion: mc,
      aKm: semiMajorAxisKm(periodS, mp + mc),
      normal,
      periastron,
      companion,
      companionName: partner ? `PSR ${partner}` : undefined,
      companionJname: partner,
    };
  }
  return {
    toEarth,
    spin,
    zetaRad: zeta,
    betaRad: zeta - alpha,
    orientation: measured || pair?.incl !== undefined ? 'measured' : 'chosen',
    pair: pairModel,
    sizeKm: pairModel ? pairModel.aKm : p.magnetar ? MAGNETAR_LOOP_REACH * NS_RADIUS_KM : spin.lightCylinderKm,
    magnetar: p.magnetar ? { twistRad: MAGNETAR_TWIST_RAD, bG: p.magnetar.bG } : null,
  };
}

/**
 * A magnetar's close field: closed dipole loops r = L sin²θ from footpoint to footpoint, each turned about the
 * magnetic axis progressively along its length so its two ends differ by `twistRad` in azimuth (a twisted
 * magnetosphere), in the magnetic frame, km. All lines are closed (open = 0).
 */
export function twistedFieldLines(twistRad = MAGNETAR_TWIST_RAD, starKm = NS_RADIUS_KM, azimuths = 10): FieldLines {
  const pos: number[] = [];
  const s: number[] = [];
  const open: number[] = [];
  for (const [j, l] of MAGNETAR_LOOPS.entries()) {
    const big = l * starKm;
    const th0 = Math.asin(Math.sqrt(starKm / big));
    for (let k = 0; k < azimuths; k++) {
      const ph0 = (2 * Math.PI * (k + 0.5 * (j % 2))) / azimuths;
      const n = 64;
      let prev: [number, number, number] | null = null;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const th = th0 + (Math.PI - 2 * th0) * u;
        const r = big * Math.sin(th) ** 2;
        const ph = ph0 + twistRad * (u - 0.5);
        const p: [number, number, number] = [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
        if (prev) {
          pos.push(...prev, ...p);
          s.push((i - 1) / n, u);
          open.push(0, 0);
        }
        prev = p;
      }
    }
  }
  return { positions: new Float32Array(pos), s: new Float32Array(s), open: new Float32Array(open) };
}

/** The magnetic axis at a spin phase (0 to 1: 0 is when its beam is towards us). */
export const magneticAxisAt = (s: Spin, phase: number, out = new Vector3()): Vector3 => rotateAbout(s.mag0, s.axis, 2 * Math.PI * phase, out);

/** The spin phase at a wall-clock time, s, as the marker pulses (scene/DeepSky.tsx uTime; shaders/deepSkyMarker.vert.glsl). */
export const spinPhase = (s: Spin, wallS: number): number => {
  const t = (wallS % 3600) / s.shownPeriodS;
  return t - Math.floor(t);
};

/** Eccentric anomaly for mean anomaly M (Newton's method). */
function eccentricAnomaly(m: number, e: number): number {
  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/**
 * The two stars' places about the centre of mass at a time (ms; the periastron passage at an arbitrary epoch), km:
 * the pulsar's in `pulsar`, the companion's in `companion`.
 */
export function pairPlaces(pair: Pair, timeMs: number, pulsar: Vector3, companion: Vector3): void {
  const n = (timeMs / 1000 / pair.periodS) % 1;
  const E = eccentricAnomaly(2 * Math.PI * n, pair.e);
  const q = new Vector3().crossVectors(pair.normal, pair.periastron);
  const x = pair.aKm * (Math.cos(E) - pair.e);
  const y = pair.aKm * Math.sqrt(1 - pair.e * pair.e) * Math.sin(E);
  // The companion relative to the pulsar.
  const rel = pair.periastron.clone().multiplyScalar(x).addScaledVector(q, y);
  const m = pair.mPulsar + pair.mCompanion;
  pulsar.copy(rel).multiplyScalar(-pair.mCompanion / m);
  companion.copy(rel).multiplyScalar(pair.mPulsar / m);
}

/** Field lines as line segments in the magnetic frame (z along the magnetic axis), km. */
export interface FieldLines {
  positions: Float32Array;
  /** Along each line, 0 at the star to 1 at its end. */
  s: Float32Array;
  /** 1 on the open lines (those that leave through the light cylinder). */
  open: Float32Array;
}

/**
 * A dipole's field lines, r = L sin²θ: closed loops within the light cylinder (each from the star's surface round to
 * the other hemisphere) and, from round each pole, the open lines that reach the light cylinder before closing, there
 * carried on straight (the wind's true shape is not modelled) about 2.6 times its radius out.
 */
export function fieldLines(rlcKm: number, starKm = NS_RADIUS_KM, azimuths = 8): FieldLines {
  const pos: number[] = [];
  const s: number[] = [];
  const open: number[] = [];
  const line = (pts: [number, number, number][], isOpen: number) => {
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const total = len[len.length - 1] || 1;
    for (let i = 1; i < pts.length; i++)
      for (const k of [i - 1, i]) {
        pos.push(pts[k][0], pts[k][1], pts[k][2]);
        s.push(len[k] / total);
        open.push(isOpen);
      }
  };
  const at = (r: number, th: number, ph: number): [number, number, number] => [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
  for (const [j, l] of [0.12, 0.25, 0.45, 0.75].entries()) {
    const big = l * rlcKm;
    if (big < 1.6 * starKm) continue;
    const th0 = Math.asin(Math.sqrt(starKm / big));
    for (let k = 0; k < azimuths; k++) {
      const ph = (2 * Math.PI * (k + 0.5 * (j % 2))) / azimuths;
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 64; i++) {
        const th = th0 + ((Math.PI - 2 * th0) * i) / 64;
        pts.push(at(big * Math.sin(th) ** 2, th, ph));
      }
      line(pts, 0);
    }
  }
  for (const [j, l] of [1.2, 2, 4].entries()) {
    const big = l * rlcKm;
    const th0 = Math.asin(Math.sqrt(Math.min(1, starKm / big)));
    // Where it meets the light cylinder: L sin³θ = 1.
    const th1 = Math.asin(Math.cbrt(1 / l));
    if (th1 <= th0) continue;
    for (const pole of [1, -1])
      for (let k = 0; k < azimuths; k++) {
        const ph = (2 * Math.PI * (k + 0.5 * (j % 2))) / azimuths;
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= 48; i++) {
          const th = th0 + ((th1 - th0) * i) / 48;
          const p = at(big * Math.sin(th) ** 2, th, ph);
          pts.push([p[0], p[1], pole * p[2]]);
        }
        // On along its direction at the light cylinder, out to 2.6 times its radius from the star.
        const end = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const dir = [end[0] - prev[0], end[1] - prev[1], end[2] - prev[2]];
        const dl = Math.hypot(dir[0], dir[1], dir[2]);
        const r = Math.hypot(end[0], end[1], end[2]);
        const reach = 2.6 * rlcKm - r;
        for (let i = 1; i <= 40; i++) {
          const f = (reach * i) / 40 / dl;
          pts.push([end[0] + dir[0] * f, end[1] + dir[1] * f, end[2] + dir[2] * f]);
        }
        line(pts, 1);
      }
  }
  return { positions: new Float32Array(pos), s: new Float32Array(s), open: new Float32Array(open) };
}
