/**
 * Light curves: a magnitude (and a colour temperature) against time, read between tabulated points. Pure functions,
 * shared by the supernovae and the kilonova (supernovae.ts, kilonova.ts) and checked by lightCurve.test.ts.
 *
 * A supernova's or a kilonova's light fades roughly exponentially once past its peak (the radioactive decay of
 * nickel-56 and cobalt-56 in a supernova, of r-process nuclei in a kilonova), so its magnitude falls roughly in a
 * straight line with time: the curve is read linearly in magnitude between the points. Before the first point it
 * rises from nothing over `riseDays` (a straight line in magnitude from FAINT); after the last it goes on at the tail's
 * slope, magnitudes a day, until it is too faint to matter. The colour temperature is read linearly in ln T between its
 * own points, and held beyond them.
 */

/** Fainter than this, a magnitude is "not seen" (the glints treat 99 as nothing). */
export const FAINT = 30;
/** The magnitude given when there is no light at all. */
export const NONE = 99;

export interface LightCurve {
  /** Days from the curve's zero (its first sighting, or the explosion), increasing. */
  days: readonly number[];
  /** Apparent V magnitude at each of `days`, as seen from Earth. */
  vmag: readonly number[];
  /** Before the first point the light rises over this many days (from FAINT, linearly in magnitude). */
  riseDays: number;
  /** After the last point the magnitude grows by this much a day (the radioactive tail). */
  tailMagPerDay: number;
  /** Days and colour temperatures, K, of the light (blackbody colour), increasing in days. */
  teffDays: readonly number[];
  teffK: readonly number[];
}

/** Index i of the segment [x_i, x_{i+1}] holding x (0 ≤ i ≤ n − 2), by bisection; xs increasing, n ≥ 2. */
export function segmentOf(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** y at x, linear between the points (xs increasing), held at the end values outside them. */
export function interpolate(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (n === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const i = segmentOf(xs, x);
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + t * (ys[i + 1] - ys[i]);
}

/** The apparent V magnitude `days` after the curve's zero (NONE before its rise, or once fainter than FAINT). */
export function magnitudeAt(c: LightCurve, days: number): number {
  const n = c.days.length;
  const first = c.days[0];
  if (days < first - c.riseDays || !Number.isFinite(days)) return NONE;
  let m: number;
  if (days < first) {
    // The rise before the first point: from FAINT to its magnitude, linearly.
    const t = c.riseDays > 0 ? (days - (first - c.riseDays)) / c.riseDays : 1;
    m = FAINT + t * (c.vmag[0] - FAINT);
  } else if (days > c.days[n - 1]) m = c.vmag[n - 1] + (days - c.days[n - 1]) * c.tailMagPerDay;
  else m = interpolate(c.days, c.vmag, days);
  return m > FAINT ? NONE : m;
}

/** The colour temperature of the light `days` after the curve's zero, K (linear in ln T, held beyond the points). */
export function temperatureAt(c: LightCurve, days: number): number {
  const n = c.teffDays.length;
  if (n === 0) return 6000;
  if (days <= c.teffDays[0]) return c.teffK[0];
  if (days >= c.teffDays[n - 1]) return c.teffK[n - 1];
  const i = segmentOf(c.teffDays, days);
  const t = (days - c.teffDays[i]) / (c.teffDays[i + 1] - c.teffDays[i]);
  return Math.exp(Math.log(c.teffK[i]) + t * (Math.log(c.teffK[i + 1]) - Math.log(c.teffK[i])));
}

/** The last day the light is at or brighter than `mag` (the end of its naked-eye visibility for mag ≈ 6). */
export function lastDayBrighterThan(c: LightCurve, mag: number): number {
  const n = c.days.length;
  if (c.vmag[n - 1] <= mag) return c.tailMagPerDay > 0 ? c.days[n - 1] + (mag - c.vmag[n - 1]) / c.tailMagPerDay : Infinity;
  for (let i = n - 1; i > 0; i--) {
    if (c.vmag[i - 1] <= mag) return c.days[i - 1] + ((mag - c.vmag[i - 1]) / (c.vmag[i] - c.vmag[i - 1])) * (c.days[i] - c.days[i - 1]);
  }
  return c.days[0];
}
