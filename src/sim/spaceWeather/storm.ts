/**
 * A CME at Earth (docs/data/space-weather.md §4): how hard its sheath presses on the magnetosphere, and where that puts
 * the magnetopause. Pure.
 *
 *  - The pressure is estimated, not measured: the sheath behind the shock, a density of 15 protons per cm³ (between the
 *    medians of 10.8 and 19.8 cm⁻³ Kilpua et al. 2019, Space Weather 17, 1257, found in 89 sheaths behind fast and slow
 *    CMEs) moving at the front's modelled speed at Earth, P = n m_p v². At 600 km/s that is 9 nPa, against the quiet
 *    wind's 2 (sim/fields/magnetopause.ts).
 *  - It lasts the sheath's mean 10.2 hours (Kilpua et al. 2019), rising within half an hour of the shock and easing
 *    back to the quiet wind over the next ten hours, as the CME's own body passes.
 *  - The field in the sheath is taken to point south at 8 nT (the median |B_z| of those sheaths behind fast CMEs was
 *    7.7 nT; its direction varies, and south is what lets a storm in).
 *  - The magnetopause: Shue et al. 1998 for that pressure and B_z. The real one can be pushed further: in May 2024 it
 *    came in to about 5 Earth radii (Hayakawa et al. 2025, ApJ 979, 49), where this estimate gives about 7.
 */
import { shue1998 } from '../fields/magnetopause';
import type { Cme } from './cmes';

/** The sheath's density, protons per cm³, and its field's southward component, nT. */
export const SHEATH_DENSITY = 15;
export const SHEATH_BZ = -8;
/** How long the sheath presses, hours, the rise and the easing back. */
export const SHEATH_HOURS = 10.2;
const RISE_H = 0.5;
const EASE_H = 10;
/** The quiet wind's dynamic pressure at 1 au, nPa. */
export const QUIET_PRESSURE = 2;

const PROTON_KG = 1.672_621_924e-27;

/** Dynamic pressure, nPa, of n protons per cm³ at v km/s. */
export const dynamicPressure = (n: number, v: number): number => n * 1e6 * PROTON_KG * (v * 1e3) ** 2 * 1e9;

/** How much of a sheath's pressure acts `h` hours after its shock reaches Earth, 0–1. */
export function sheathShare(h: number): number {
  if (h <= 0 || h >= SHEATH_HOURS + EASE_H) return 0;
  if (h < RISE_H) return h / RISE_H;
  if (h <= SHEATH_HOURS) return 1;
  const t = (h - SHEATH_HOURS) / EASE_H;
  return 1 - t * t * (3 - 2 * t);
}

export interface EarthStorm {
  /** Dynamic pressure on the magnetosphere, nPa, and the sheath's B_z, nT. */
  pressure: number;
  bz: number;
  /** Shue's stand-off (Earth radii) and flaring. */
  r0: number;
  alpha: number;
  /** The CME pressing now, if any (the strongest). */
  cme: Cme | null;
}

/**
 * The magnetosphere's load at a date from the CMEs whose drawn fronts reach Earth: any of `cmes` (those in flight are
 * enough: a front that passed Earth less than a day ago is still on its way out).
 */
export function earthStorm(cmes: readonly Cme[], ms: number, out: EarthStorm): EarthStorm {
  let p = QUIET_PRESSURE;
  let bz = 0;
  let which: Cme | null = null;
  const span = (SHEATH_HOURS + EASE_H) * 3_600_000;
  for (const c of cmes) {
    if (c.drawnArrivalMs === null || c.arrivalSpeed === null) continue;
    const h = (ms - c.drawnArrivalMs) / 3_600_000;
    if (h <= 0 || h * 3_600_000 >= span) continue;
    const s = sheathShare(h);
    const pc = QUIET_PRESSURE + s * (dynamicPressure(SHEATH_DENSITY, c.arrivalSpeed) - QUIET_PRESSURE);
    if (pc > p) {
      p = pc;
      bz = s * SHEATH_BZ;
      which = c;
    }
  }
  const s = shue1998(p, bz);
  out.pressure = p;
  out.bz = bz;
  out.r0 = s.r0;
  out.alpha = s.alpha;
  out.cme = which;
  return out;
}
