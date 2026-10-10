/**
 * The drag-based model of a coronal mass ejection's flight through the solar wind (docs/data/space-weather.md §3):
 * Vršnak et al. 2013 (Solar Phys. 285, 295), with the cone geometry of the model's documentation (Vršnak & Žic,
 * oh.geof.unizg.hr/DBM/docs/DBM.pdf, §1.2). Pure.
 *
 *  - Beyond about 20 solar radii a CME is no longer driven: the ambient wind drags it towards its own speed w,
 *    a = −γ (v − w) |v − w|, with γ (km⁻¹) constant (the CME's cross-section grows as r² while the wind's density falls
 *    as 1/r²). Its solution, with S = sign(v₀ − w):
 *      r(t) = (S/γ) ln[1 + S γ (v₀ − w) t] + w t + r₀,   v(t) = (v₀ − w) / [1 + S γ (v₀ − w) t] + w.
 *    Vršnak et al. 2013 give γ = 0.2 × 10⁻⁷ km⁻¹ and w = 400 km/s as typical (γ from 0.1 to 2 × 10⁻⁷ for most).
 *  - The cone: the leading edge a semicircle spanning the CME's full width 2ω, so an element at an angle φ from the
 *    axis starts at r₀ f(φ) with speed v₀ f(φ), f = (cos φ + √(tan²ω − sin²φ)) / (1 + tan ω); each element then flies
 *    by the drag law on its own (the documentation's alternative ii), so the flanks lag, and the front flattens as
 *    their speeds converge. At ω = 30°, the flank's element starts at 0.73 of the apex's distance and speed.
 */
import { SUN_RADIUS_KM } from '../../physics/constants.ts';

/** Where DONKI's speeds are measured, and the model starts: 21.5 solar radii (CCMC's inner boundary for WSA–ENLIL). */
export const R0_KM = 21.5 * SUN_RADIUS_KM;
/** Vršnak et al. 2013's typical values: γ, km⁻¹, and the wind's speed, km/s. */
export const GAMMA_TYPICAL = 0.2e-7;
export const W_TYPICAL = 400;

export interface Dbm {
  /** Starting distance, km, and speed, km/s, at t = 0. */
  r0: number;
  v0: number;
  /** Drag parameter, km⁻¹, and the wind's speed, km/s. */
  gamma: number;
  w: number;
}

/** Distance (km) and speed (km/s) `t` seconds after the start (t ≥ 0). */
export function dbmAt(m: Dbm, t: number, out: { r: number; v: number } = { r: 0, v: 0 }): { r: number; v: number } {
  const dv = m.v0 - m.w;
  const s = dv >= 0 ? 1 : -1;
  const k = 1 + s * m.gamma * dv * t;
  out.r = (s / m.gamma) * Math.log(k) + m.w * t + m.r0;
  out.v = dv / k + m.w;
  return out;
}

/** Seconds from the start until the front is `rKm` from the Sun (0 if it already is; Infinity if it never gets there). */
export function dbmTimeTo(m: Dbm, rKm: number): number {
  if (rKm <= m.r0) return 0;
  // The speed stays between v₀ and w, both positive here: Newton's method from the ballistic guess converges.
  if (!(m.v0 > 0) || !(m.w > 0)) return Infinity;
  const p = { r: 0, v: 0 };
  let t = (rKm - m.r0) / Math.max(m.v0, m.w);
  for (let i = 0; i < 50; i++) {
    dbmAt(m, t, p);
    const dt = (rKm - p.r) / p.v;
    t += dt;
    if (Math.abs(dt) < 1e-3) break;
  }
  return t;
}

/** The cone's shape: the share of the apex's distance (and speed) at an angle φ from the axis, for a half-width ω (radians). */
export function coneShare(phi: number, omega: number): number {
  const w = Math.min(omega, (89 * Math.PI) / 180);
  const tw = Math.tan(w);
  const s = Math.sin(Math.min(Math.abs(phi), w));
  return (Math.cos(Math.min(Math.abs(phi), w)) + Math.sqrt(Math.max(0, tw * tw - s * s))) / (1 + tw);
}

/** The element of a CME at an angle φ from its axis, as a model of its own (alternative ii). */
export function element(apex: Dbm, phi: number, omega: number): Dbm {
  const f = coneShare(phi, omega);
  return { r0: apex.r0 * f, v0: apex.v0 * f, gamma: apex.gamma, w: apex.w };
}

/**
 * The drag parameter (km⁻¹) that brings an element to `rKm` in `seconds`: the model fitted to a measured arrival, within
 * `range` (Vršnak et al. 2013 found 0.1–2 × 10⁻⁷ for most CMEs; Temmer & Nitta 2015 needed 0.01 × 10⁻⁷ for the fast
 * one of 23 July 2012). Clamped to the range when no value in it fits.
 */
export function fitGamma(m: Dbm, rKm: number, seconds: number, range: readonly [number, number] = [0.005e-7, 5e-7]): number {
  const at = (g: number) => dbmTimeTo({ ...m, gamma: g }, rKm);
  let lo = Math.log(range[0]);
  let hi = Math.log(range[1]);
  // Faster than the wind: more drag, later. Slower: more drag, sooner.
  const later = m.v0 >= m.w;
  const tLo = at(range[0]);
  const tHi = at(range[1]);
  if (later ? seconds <= tLo : seconds >= tLo) return range[0];
  if (later ? seconds >= tHi : seconds <= tHi) return range[1];
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const t = at(Math.exp(mid));
    if (later === t < seconds) lo = mid;
    else hi = mid;
  }
  return Math.exp(0.5 * (lo + hi));
}

/**
 * The drag parameter and the wind's speed fitted to a measured arrival (as Žic et al. 2015, ApJS 218, 32, fit the model to
 * a CME's measured kinematics): of the pairs that bring the element to `rKm` in `seconds` (to within a minute), the one
 * nearest the typical values (γ within 0.005–5 × 10⁻⁷ km⁻¹, w from the slow wind's 250 km/s to the fast wind's 900).
 * Some catalogued speeds are too low or too high for any pair (a CME measured slower than it was, or a shock that
 * another CME drove): then the pair that comes nearest.
 */
export function fitDrag(m: Dbm, rKm: number, seconds: number): { gamma: number; w: number } {
  let best = { gamma: GAMMA_TYPICAL, w: W_TYPICAL, miss: Infinity, far: Infinity };
  for (let w = 250; w <= 900; w += 10) {
    const gamma = fitGamma({ ...m, w }, rKm, seconds);
    const miss = Math.abs(dbmTimeTo({ ...m, gamma, w }, rKm) - seconds);
    const far = Math.abs(Math.log(gamma / GAMMA_TYPICAL)) + Math.abs(w - W_TYPICAL) / 100;
    const fits = miss < 60;
    if (fits ? best.miss >= 60 || far < best.far : best.miss >= 60 && miss < best.miss) best = { gamma, w, miss, far };
  }
  return { gamma: best.gamma, w: best.w };
}
