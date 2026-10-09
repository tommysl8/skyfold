/**
 * Comet tails, as a simple physical model (scene/CometTails.tsx draws them):
 *
 *  Activity. Ices sublimate when sunlight warms the nucleus: water, which drives most comets,
 *  from inside about 3 au; outside it activity falls away steeply, to nothing at 5 au (some
 *  comets, Hale–Bopp among them, stay active further out on CO and CO₂; that is left out). How
 *  active a comet is at r au from the Sun is read from its own magnitude law, the total
 *  magnitude JPL's Small-Body Database fits to its observations: m = M1 + 5 log10 Δ + K1 log10 r.
 *  Without the distance from the observer, M1 + K1 log10 r is the light of its coma and tails as
 *  seen from 1 au, the measure of how much gas and dust it makes there. The tails' strength
 *  is that magnitude on a linear scale (as the eye takes brightness) from TAIL_MAG_FAINT, where
 *  nothing shows, to TAIL_MAG_FULL, a great comet, times S(r), a smooth step from 1 at 3 au
 *  to 0 at 5 au. Lengths grow with the light too: the ion tail as its square root, the age of
 *  the oldest dust drawn as its fourth root, within the ranges seen.
 *
 *  Ion tail. Ions picked up by the solar wind stream away from the Sun at its speed, about
 *  400 km/s, so the tail points along the solar wind as the comet sees it: v_sw r̂ − v_comet
 *  (straight, and a few degrees off the anti-solar direction; Biermann 1951). It is 5 × 10⁷ km
 *  long for a comet of heliocentric magnitude 5, from 3 × 10⁶ to 1.5 × 10⁸ km, thinning with
 *  distance from the head.
 *
 *  Dust tail. Dust leaves the nucleus with the comet's own velocity and then feels the Sun's
 *  gravity weakened by radiation pressure: μ(1 − β), with β the ratio of radiation pressure
 *  to gravity (about 1 for 0.5 µm grains, 0.1 for 5 µm ones). Each grain then follows a
 *  two-body orbit of its own, computed exactly here: the nucleus is traced back along its
 *  orbit to each release time, and each grain forward from there. Grains of one β form a curve,
 *  a syndyne (Finson & Probstein 1968); several β make the curved fan that lags behind the
 *  comet in its orbital plane. Older dust has spread and dimmed.
 *
 * Not modelled: jets, striae, the gas coma's chemistry, anti-tails from large grains seen
 * edge-on, and outbursts. The tails are a model of the shape: exact in direction, gentle and
 * illustrative in brightness (a real tail's surface brightness is not computed).
 *
 * All functions write into caller-owned objects: they run every frame for comets on screen.
 */
import { AU_KM, GM_SUN_KM3_S2 } from '../physics/constants';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Inside this distance from the Sun (au) a comet's activity follows its magnitude law… */
export const ACTIVITY_FULL_AU = 3;
/** …and outside this, there is none. */
export const ACTIVITY_OFF_AU = 5;
/** Solar wind speed, km/s. */
export const SOLAR_WIND_KM_S = 400;
/** Length of the ion tail at heliocentric magnitude ION_REF_MAG, km… */
export const ION_TAIL_KM = 5e7;
export const ION_REF_MAG = 5;
/** …and the range it is kept to, km. */
export const ION_TAIL_RANGE_KM: readonly [number, number] = [3e6, 1.5e8];
/** Radiation-pressure parameters of the dust drawn (β ≤ 1: gravity at least balanced), fine grains last. */
export const DUST_BETAS = [0.06, 0.15, 0.35, 0.65, 1] as const;
/** Oldest dust drawn at heliocentric magnitude ION_REF_MAG, s (30 days)… */
export const DUST_AGE_S = 30 * 86_400;
/** …and the range it is kept to, s. */
export const DUST_AGE_RANGE_S: readonly [number, number] = [10 * 86_400, 60 * 86_400];
/** Heliocentric magnitude (M1 + K1 log10 r) at which the tails fade out entirely… */
export const TAIL_MAG_FAINT = 17;
/** …and at which they are drawn at full strength (a great comet: Halley in 1986 reached 3.7, Hale–Bopp 4.6). */
export const TAIL_MAG_FULL = 3;
/** M1 and K1 where JPL has none (as the small-body layer: docs/data/asteroids.md §6). */
export const DEFAULT_M1 = 15;
export const DEFAULT_K1 = 10;

/** The onset of activity: 1 inside ACTIVITY_FULL_AU, 0 outside ACTIVITY_OFF_AU, a smooth step between. */
export function cometActivity(rAu: number): number {
  if (!(rAu > 0) || rAu >= ACTIVITY_OFF_AU) return 0;
  const x = Math.min(1, Math.max(0, (ACTIVITY_OFF_AU - rAu) / (ACTIVITY_OFF_AU - ACTIVITY_FULL_AU)));
  return x * x * (3 - 2 * x);
}

/** A comet's heliocentric magnitude at `rAu`: M1 + K1 log10 r, its total magnitude seen from 1 au (NaN M1, K1: the defaults). */
export function heliocentricMagnitude(M1: number, K1: number, rAu: number): number {
  const m1 = Number.isFinite(M1) ? M1 : DEFAULT_M1;
  const k1 = Number.isFinite(K1) ? K1 : DEFAULT_K1;
  return m1 + k1 * Math.log10(Math.max(rAu, 1e-3));
}

/** How strongly the coma and tails are drawn, 0–1, for a comet of magnitude law M1, K1 at `rAu` from the Sun. */
export function tailBrightness(rAu: number, M1: number, K1: number): number {
  const on = cometActivity(rAu);
  if (on <= 0) return 0;
  const m = heliocentricMagnitude(M1, K1, rAu);
  return on * Math.min(1, Math.max(0, (TAIL_MAG_FAINT - m) / (TAIL_MAG_FAINT - TAIL_MAG_FULL)));
}

const clamp = (x: number, r: readonly [number, number]) => Math.min(r[1], Math.max(r[0], x));

/** Length of the ion tail, km: as the square root of the comet's light at `rAu`, within ION_TAIL_RANGE_KM. */
export function ionTailKm(rAu: number, M1: number, K1: number): number {
  return clamp(ION_TAIL_KM * 10 ** (-0.2 * (heliocentricMagnitude(M1, K1, rAu) - ION_REF_MAG)), ION_TAIL_RANGE_KM);
}

/** Age of the oldest dust drawn, s: as the fourth root of the comet's light at `rAu`, within DUST_AGE_RANGE_S. */
export function dustAgeS(rAu: number, M1: number, K1: number): number {
  return clamp(DUST_AGE_S * 10 ** (-0.1 * (heliocentricMagnitude(M1, K1, rAu) - ION_REF_MAG)), DUST_AGE_RANGE_S);
}

/**
 * Unit vector along the ion tail: the solar wind as seen from the comet, v_sw r̂ − v, for a
 * comet at heliocentric `r` (km) moving at `v` (km/s).
 */
export function ionTailDirection(r: V3, v: V3, out: V3): V3 {
  const rn = Math.hypot(r.x, r.y, r.z) || 1;
  out.x = (SOLAR_WIND_KM_S * r.x) / rn - v.x;
  out.y = (SOLAR_WIND_KM_S * r.y) / rn - v.y;
  out.z = (SOLAR_WIND_KM_S * r.z) / rn - v.z;
  const n = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= n;
  out.y /= n;
  out.z /= n;
  return out;
}

// ─── Two-body motion (universal variables), allocation-free ──────────────────────────────

const st = { c: 0, s: 0 };
function stumpff(z: number): void {
  if (z > 1e-6) {
    const q = Math.sqrt(z);
    st.c = (1 - Math.cos(q)) / z;
    st.s = (q - Math.sin(q)) / (q * q * q);
  } else if (z < -1e-6) {
    const q = Math.sqrt(-z);
    st.c = (Math.cosh(q) - 1) / -z;
    st.s = (Math.sinh(q) - q) / (q * q * q);
  } else {
    st.c = 0.5 - z / 24 + (z * z) / 720;
    st.s = 1 / 6 - z / 120 + (z * z) / 5040;
  }
}

/**
 * Position after `dt` seconds of two-body motion about the origin with gravitational parameter
 * `mu` (km³/s²), from position `r` (km) and velocity `v` (km/s), into `out`. With mu = 0 the
 * motion is a straight line.
 */
export function keplerPosition(r: V3, v: V3, dt: number, mu: number, out: V3): V3 {
  if (!(mu > 1e-9)) {
    out.x = r.x + v.x * dt;
    out.y = r.y + v.y * dt;
    out.z = r.z + v.z * dt;
    return out;
  }
  const r0 = Math.hypot(r.x, r.y, r.z);
  const vr0 = (r.x * v.x + r.y * v.y + r.z * v.z) / r0;
  const alpha = 2 / r0 - (v.x * v.x + v.y * v.y + v.z * v.z) / mu;
  const sm = Math.sqrt(mu);
  // Starting guess: the elliptic one where it applies, else a straight line.
  let chi = alpha > 0 ? sm * dt * alpha : (Math.sign(dt) * Math.hypot(v.x, v.y, v.z) * Math.abs(dt)) / Math.sqrt(r0);
  if (!Number.isFinite(chi) || chi === 0) chi = (sm * dt) / r0;
  for (let i = 0; i < 60; i++) {
    const z = alpha * chi * chi;
    stumpff(z);
    const chi2 = chi * chi;
    const F = ((r0 * vr0) / sm) * chi2 * st.c + (1 - alpha * r0) * chi2 * chi * st.s + r0 * chi - sm * dt;
    const dF = ((r0 * vr0) / sm) * chi * (1 - z * st.s) + (1 - alpha * r0) * chi2 * st.c + r0;
    let step = F / dF;
    if (chi !== 0 && Math.abs(step) > Math.abs(chi)) step = Math.sign(step) * Math.abs(chi) * 0.5;
    chi -= step;
    if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi;
  stumpff(z);
  const f = 1 - ((chi * chi) / r0) * st.c;
  const g = dt - (chi * chi * chi * st.s) / sm;
  out.x = f * r.x + g * v.x;
  out.y = f * r.y + g * v.y;
  out.z = f * r.z + g * v.z;
  return out;
}

/** The velocity after `dt` seconds (for tracing the nucleus back), by a short central difference. */
function keplerState(r: V3, v: V3, dt: number, mu: number, outR: V3, outV: V3): void {
  const h = 60;
  keplerPosition(r, v, dt + h, mu, outV);
  const x1 = outV.x;
  const y1 = outV.y;
  const z1 = outV.z;
  keplerPosition(r, v, dt - h, mu, outV);
  outV.x = (x1 - outV.x) / (2 * h);
  outV.y = (y1 - outV.y) / (2 * h);
  outV.z = (z1 - outV.z) / (2 * h);
  keplerPosition(r, v, dt, mu, outR);
}

/** Where the nucleus was `ageS` seconds ago, and how fast it moved (traced back along its orbit). */
export function releaseState(r: V3, v: V3, ageS: number, outR: V3, outV: V3): void {
  keplerState(r, v, -ageS, GM_SUN_KM3_S2, outR, outV);
}

/**
 * Where a grain of radiation-pressure parameter `beta` (0 < β ≤ 1) released from `releaseR`
 * with `releaseV` is `ageS` seconds later, relative to the nucleus now at `r` (km).
 */
export function grainOffset(r: V3, releaseR: V3, releaseV: V3, beta: number, ageS: number, out: V3): V3 {
  keplerPosition(releaseR, releaseV, ageS, GM_SUN_KM3_S2 * (1 - Math.min(1, beta)), out);
  out.x -= r.x;
  out.y -= r.y;
  out.z -= r.z;
  return out;
}

const release = { x: 0, y: 0, z: 0 };
const releaseV = { x: 0, y: 0, z: 0 };

/**
 * Where dust of radiation-pressure parameter `beta`, released `ageS` seconds ago, is now,
 * relative to the nucleus (km, same axes as `r` and `v`): the nucleus traced back along its
 * orbit, the grain forward under μ☉(1 − β). `r` is the nucleus's position relative to the Sun.
 */
export function dustOffset(r: V3, v: V3, beta: number, ageS: number, out: V3): V3 {
  if (ageS <= 0) {
    out.x = out.y = out.z = 0;
    return out;
  }
  releaseState(r, v, ageS, release, releaseV);
  return grainOffset(r, release, releaseV, beta, ageS, out);
}

/** Distance from the Sun in au. */
export const auOf = (r: V3): number => Math.hypot(r.x, r.y, r.z) / AU_KM;
