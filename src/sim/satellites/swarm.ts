/**
 * The satellite swarm's arithmetic, shared by its worker (swarm.worker.ts), the picking on the main thread and the
 * tests; its GPU twin is render/shaders/satellites.vert.glsl.
 *
 * SGP4 costs a few microseconds per satellite, too much for 15,000 of them every frame. So the worker runs SGP4's
 * secular part (`meanElements`: gravity's secular terms, drag, and for deep-space orbits the Sun's and Moon's and
 * the resonances) for every satellite at a reference time T, and packs each one's mean elements and their rates.
 * The vertex shader then moves each along that Kepler ellipse, the node and perigee turning at their J2 rates, for
 * the minutes from T to now. That leaves out SGP4's periodic terms: the J2 short-period ones (a few km in low orbit)
 * and J3's long-period ones. `swarm.test.ts` measures the difference from full SGP4. T is moved on (the worker
 * asked again) whenever the clock is more than `REBASE_MIN` from it, so the shader's float32 time stays small.
 */
import { meanElements, WGS72, type MeanElements, type SatRec } from './sgp4';

/** Floats per satellite in the packed array: three vec4 attributes. */
export const PACK = 12;
/** Ask the worker for new reference elements once the clock is this far (minutes) from the last ones. */
export const REBASE_MIN = 240;

const TWO_PI = 2 * Math.PI;
const wrap = (a: number) => a - TWO_PI * Math.round(a / TWO_PI);

const m0: MeanElements = { am: 0, nm: 0, ecc: 0, incl: 0, node: 0, argp: 0, m: 0 };
const m1: MeanElements = { am: 0, nm: 0, ecc: 0, incl: 0, node: 0, argp: 0, m: 0 };

/**
 * Packs satellite `k` at `jd` (UTC Julian date) into `out[PACK·k …]`:
 *   [a (km), e, i, M | Ω, ω, dM/dt, de/dt | dΩ/dt, dω/dt, class + 1, di/dt]   (angles rad, rates per minute)
 * The class slot is 0 for an element set SGP4 rejects at that time (decayed, or no orbit at all): the shader hides
 * it. e and i move too for deep-space orbits (the Sun's and Moon's pull: up to 10⁻⁴ rad an hour for a few).
 */
export function packOne(rec: SatRec, cls: number, jd: number, out: Float32Array, k: number): void {
  const o = PACK * k;
  const t = (jd - rec.epochJd) * 1440;
  const bad = rec.error === 2 || meanElements(rec, t, m0) !== 0 || meanElements(rec, t + 1, m1) !== 0 || m0.am * (1 - m0.ecc) < 1;
  if (bad) {
    out.fill(0, o, o + PACK);
    return;
  }
  out[o] = m0.am * WGS72.radiusearthkm;
  out[o + 1] = m0.ecc;
  out[o + 2] = m0.incl;
  out[o + 3] = wrap(m0.m);
  out[o + 4] = wrap(m0.node);
  out[o + 5] = wrap(m0.argp);
  out[o + 6] = wrap(m1.m - m0.m); // per minute: under half a turn for any orbit SGP4 takes
  out[o + 7] = m1.ecc - m0.ecc;
  out[o + 8] = wrap(m1.node - m0.node);
  out[o + 9] = wrap(m1.argp - m0.argp);
  out[o + 10] = cls + 1;
  out[o + 11] = m1.incl - m0.incl;
}

/**
 * The position (TEME, km) of packed satellite `k`, `dtMin` minutes after the reference time: the shader's
 * arithmetic in float64. The mean elements move on linearly; from them on it is SGP4's own tail (its long-period
 * J3 terms, Kepler's equation in its equinoctial form and the short-period J2 terms), so what is left out is only
 * the change of the secular rates over the few hours from the reference time. Returns false for a hidden one.
 */
export function packedPosition(p: Float32Array, k: number, dtMin: number, out: { x: number; y: number; z: number }): boolean {
  const o = PACK * k;
  if (p[o + 10] < 0.5) return false;
  const { radiusearthkm, j2, j3oj2 } = WGS72;
  const am = p[o] / radiusearthkm;
  const ep = Math.min(Math.max(p[o + 1] + p[o + 7] * dtMin, 1e-6), 0.999);
  const xincp = p[o + 2] + p[o + 11] * dtMin;
  const mp = p[o + 3] + p[o + 6] * dtMin;
  const nodep = p[o + 4] + p[o + 8] * dtMin;
  const argpp = p[o + 5] + p[o + 9] * dtMin;
  const sinip = Math.sin(xincp);
  const cosip = Math.cos(xincp);
  const cosisq = cosip * cosip;
  const aycof = -0.5 * j3oj2 * sinip;
  const xlcof = (-0.25 * j3oj2 * sinip * (3 + 5 * cosip)) / Math.max(1 + cosip, 1.5e-12);
  const con41 = 3 * cosisq - 1;
  const x1mth2 = 1 - cosisq;
  const x7thm1 = 7 * cosisq - 1;

  // Long-period periodics.
  const axnl = ep * Math.cos(argpp);
  let temp = 1 / (am * (1 - ep * ep));
  const aynl = ep * Math.sin(argpp) + temp * aycof;
  const xl = mp + argpp + nodep + temp * xlcof * axnl;
  // Kepler's equation (equinoctial form), as SGP4 solves it.
  const u = (xl - nodep) % TWO_PI;
  let eo1 = u;
  let sineo1 = 0;
  let coseo1 = 1;
  for (let i = 0; i < 10; i++) {
    sineo1 = Math.sin(eo1);
    coseo1 = Math.cos(eo1);
    let d = (u - aynl * coseo1 + axnl * sineo1 - eo1) / (1 - coseo1 * axnl - sineo1 * aynl);
    if (Math.abs(d) >= 0.95) d = d > 0 ? 0.95 : -0.95;
    eo1 += d;
    if (Math.abs(d) < 1e-12) break;
  }
  sineo1 = Math.sin(eo1);
  coseo1 = Math.cos(eo1);
  // Short-period periodics.
  const ecose = axnl * coseo1 + aynl * sineo1;
  const esine = axnl * sineo1 - aynl * coseo1;
  const el2 = axnl * axnl + aynl * aynl;
  const pl = am * (1 - el2);
  if (pl <= 0) return false;
  const rl = am * (1 - ecose);
  const betal = Math.sqrt(1 - el2);
  temp = esine / (1 + betal);
  const sinu = (am / rl) * (sineo1 - aynl - axnl * temp);
  const cosu = (am / rl) * (coseo1 - axnl + aynl * temp);
  let su = Math.atan2(sinu, cosu);
  const sin2u = (cosu + cosu) * sinu;
  const cos2u = 1 - 2 * sinu * sinu;
  temp = 1 / pl;
  const temp1 = 0.5 * j2 * temp;
  const temp2 = temp1 * temp;
  const mrt = rl * (1 - 1.5 * temp2 * betal * con41) + 0.5 * temp1 * x1mth2 * cos2u;
  su -= 0.25 * temp2 * x7thm1 * sin2u;
  const xnode = nodep + 1.5 * temp2 * cosip * sin2u;
  const xinc = xincp + 1.5 * temp2 * cosip * sinip * cos2u;
  const sinsu = Math.sin(su);
  const cossu = Math.cos(su);
  const snod = Math.sin(xnode);
  const cnod = Math.cos(xnode);
  const sini = Math.sin(xinc);
  const cosi = Math.cos(xinc);
  const mr = mrt * radiusearthkm;
  out.x = mr * (-snod * cosi * sinsu + cnod * cossu);
  out.y = mr * (cnod * cosi * sinsu + snod * cossu);
  out.z = mr * sini * sinsu;
  return true;
}
