/**
 * Earth's field at a date: IGRF-14 to degree 13 (docs/data/fields.md §2). The dipole terms are the aurora's
 * (sim/phenomena/aurora.ts dipoleAt: linear between the 5-year epochs, the secular variation after 2025, held at
 * 1900 before and at 2030 after); the rest are read the same way from sim/fields/igrf14.ts.
 */
import { dipoleAt, IGRF_FIRST_YEAR, IGRF_LAST_YEAR } from '../phenomena/aurora';
import { harmonics, shIndex, type Harmonics } from './harmonics';
import { IGRF_EPOCHS, IGRF_HIGHER } from './igrf14';

/** IGRF-14's coefficients at a decimal year, nT, to degree 13. */
export function earthCoefficients(year: number): Harmonics {
  const c = harmonics(13);
  const y = Math.min(IGRF_LAST_YEAR, Math.max(IGRF_FIRST_YEAR, year));
  const [g10, g11, h11] = dipoleAt(y);
  c.g[shIndex(1, 0)] = g10;
  c.g[shIndex(1, 1)] = g11;
  c.h[shIndex(1, 1)] = h11;
  const last = IGRF_EPOCHS.length - 1;
  const after = y >= IGRF_EPOCHS[last];
  const i = after ? last : Math.min(last - 1, Math.floor((y - IGRF_EPOCHS[0]) / 5));
  const t = after ? y - IGRF_EPOCHS[last] : (y - IGRF_EPOCHS[i]) / 5;
  for (const row of IGRF_HIGHER) {
    const [n, m, isH] = row;
    const a = row[3 + i];
    // After the last epoch, the secular variation (the row's last value, nT a year); before it, linear between epochs.
    const v = after ? a + row[3 + IGRF_EPOCHS.length] * t : a + t * (row[4 + i] - a);
    if (isH) c.h[shIndex(n, m)] = v;
    else c.g[shIndex(n, m)] = v;
  }
  return c;
}
