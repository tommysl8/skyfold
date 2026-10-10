/**
 * The planetary Kp index (public/data/space-weather/kp.bin.gz, from GFZ's Kp_ap_since_1932.txt by
 * scripts/build-space-weather.mjs): every three hours since 1 January 1932, as GFZ Potsdam publishes it (Matzka et al.
 * 2021, Space Weather 19, e2020SW002641; CC BY 4.0), the last few days preliminary. Pure.
 *
 * The file: "KPGF", u16 version 1, u16 hours a value (3), f64 the first interval's start (ms since 1970, UTC), u32 the
 * count, then one byte a value: Kp in thirds (0 = 0, 1 = 0+, 2 = 1−, … 27 = 9), 255 where none was measured.
 */

export interface KpTable {
  startMs: number;
  stepMs: number;
  thirds: Uint8Array;
}

export function parseKp(buf: ArrayBuffer): KpTable {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'KPGF' || dv.getUint16(4, true) !== 1) throw new Error('kp.bin: not version 1 of the format');
  const hours = dv.getUint16(6, true);
  const startMs = dv.getFloat64(8, true);
  const n = dv.getUint32(16, true);
  return { startMs, stepMs: hours * 3_600_000, thirds: new Uint8Array(buf, 20, n) };
}

/** The end of the last interval, ms. */
export const kpEndMs = (k: KpTable): number => k.startMs + k.thirds.length * k.stepMs;

/** The Kp of the three hours containing a date, or null outside the table or where none was measured. */
export function kpOf(k: KpTable, ms: number): number | null {
  const i = Math.floor((ms - k.startMs) / k.stepMs);
  if (i < 0 || i >= k.thirds.length || k.thirds[i] === 255) return null;
  return k.thirds[i] / 3;
}

/**
 * Kp at a date, eased from one three-hour value to the next over the middle of each boundary (an hour either side), so
 * the ovals widen and shrink smoothly while time runs fast; null outside the table.
 */
export function kpAt(k: KpTable, ms: number): number | null {
  const here = kpOf(k, ms);
  if (here === null) return null;
  const i = Math.floor((ms - k.startMs) / k.stepMs);
  const into = (ms - k.startMs - i * k.stepMs) / 3_600_000;
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (into < 1) {
    const prev = kpOf(k, ms - k.stepMs);
    if (prev !== null) return prev + (here - prev) * (0.5 + 0.5 * ease(into));
  } else if (into > 2) {
    const next = kpOf(k, ms + k.stepMs);
    if (next !== null) return here + (next - here) * 0.5 * ease(into - 2);
  }
  return here;
}

/** The largest Kp over [from, to), or null where none was measured. */
export function kpMax(k: KpTable, from: number, to: number): number | null {
  let m = -1;
  for (let t = from; t < to; t += k.stepMs) {
    const v = kpOf(k, t);
    if (v !== null) m = Math.max(m, v);
  }
  return m < 0 ? null : m;
}

/** Kp as written ("7−", "8+", "9o"): thirds below, at and above a whole number. */
export function kpText(kp: number): string {
  const t = Math.round(kp * 3);
  const whole = Math.round(t / 3);
  const r = t - 3 * whole;
  return `${whole}${r < 0 ? '−' : r > 0 ? '+' : ''}`;
}
