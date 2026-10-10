/**
 * The Sun's field harmonics, one set per Carrington rotation (public/data/fields/sun-hmi-pfss.bin, made by
 * scripts/build-sun-field.py from SDO/HMI's synoptic maps; docs/data/fields.md §3): reading the file and choosing the
 * rotation for a date. Pure.
 */
import { shCount, type Harmonics } from './harmonics';

export interface SunRotations {
  degree: number;
  /** Each rotation's start, ms since 1970 (UTC), ascending. */
  startMs: Float64Array;
  /** Carrington rotation numbers. */
  rotation: Int32Array;
  /** Per rotation, g then h (index n(n + 1)/2 + m), gauss. */
  coeffs: Float32Array[];
}

/** Read the file (see the script for its layout). */
export function parseSunRotations(buf: ArrayBuffer): SunRotations {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'SFPF' || dv.getUint16(4, true) !== 1) throw new Error('sun-hmi-pfss.bin: not version 1 of the format');
  const degree = dv.getUint16(6, true);
  const K = dv.getUint32(8, true);
  let off = 12;
  const startMs = new Float64Array(K);
  for (let k = 0; k < K; k++) startMs[k] = dv.getFloat64(off + 8 * k, true);
  off += 8 * K;
  const rotation = new Int32Array(K);
  for (let k = 0; k < K; k++) rotation[k] = dv.getInt32(off + 4 * k, true);
  off += 4 * K;
  const scale = new Float32Array(K);
  for (let k = 0; k < K; k++) scale[k] = dv.getFloat32(off + 4 * k, true);
  off += 4 * K;
  const n = 2 * shCount(degree);
  const coeffs: Float32Array[] = [];
  for (let k = 0; k < K; k++) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = dv.getInt16(off + 2 * (k * n + i), true) * scale[k];
    coeffs.push(c);
  }
  return { degree, startMs, rotation, coeffs };
}

/** Which rotation to draw at a date: the one under way, or the first or last there is (`held` then says so). */
export function rotationAt(s: SunRotations, ms: number): { index: number; held: 'before' | 'after' | null } {
  const K = s.startMs.length;
  if (ms < s.startMs[0]) return { index: 0, held: 'before' };
  // A rotation lasts about 27.3 days; past the last one's end, it is held.
  const lastEnd = s.startMs[K - 1] + 27.2753 * 86_400_000;
  if (ms >= lastEnd) return { index: K - 1, held: 'after' };
  let lo = 0;
  let hi = K - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s.startMs[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  return { index: lo, held: null };
}

/** A rotation's coefficients as Harmonics. */
export function rotationHarmonics(s: SunRotations, index: number): Harmonics {
  const c = s.coeffs[index];
  const n = shCount(s.degree);
  return { degree: s.degree, g: Float64Array.from(c.subarray(0, n)), h: Float64Array.from(c.subarray(n, 2 * n)) };
}
