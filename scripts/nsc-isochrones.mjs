/**
 * Isochrones from the single-star formulae of Hurley, Pols & Tout 2000 (src/sim/stars/sse.ts, Z = 0.02), for
 * scripts/build-nsc.py: for each log10(age/yr) asked for, the stars alive at that age as rows of initial mass (M☉),
 * log10 L (L☉), log10 T_eff (K) and HPT's evolution type k (0–1 MS, 2 HG, 3 GB, 4 CHeB, 5 EAGB, 6 TPAGB, 7 naked
 * helium star), in rising initial mass.
 *
 * A star's state at an age is read off its track (sse.ts `evolve`) linearly in time between the track's points. Stars
 * whose track has ended by then are left out: white dwarfs (as faint as M_V ≈ 10 within a million years and adding
 * nothing to the light), stars gone as supernovae, and stars stripped to their helium cores, which sse.ts does not
 * follow: here they go on as naked helium main-sequence stars (HPT §6.1, eqs. 77–83) of the core's mass, starting at
 * the share of core helium burning already done (HPT eq. 76), losing mass in HPT's Wolf–Rayet-like wind (§7.1), and
 * are left out when that ends (or if stripped on the AGB, HPT's naked helium giants). HPT fit naked helium stars of
 * 0.32–10 M☉; heavier ones are extrapolated.
 *
 * The masses start as a grid even in log m from 0.1 M☉ to `--mmax` (150 by default), then each interval is halved
 * until neighbours differ by less than 0.02 in log L and 0.004 in log T_eff and share k, or are 10⁻⁶ apart in log m;
 * an interval across the edge of the living stars is halved until the same width. Above 100 M☉ the formulae are
 * extrapolated (HPT fit 0.1–50 M☉ and recommend them to 100): such stars have left the main sequence at every age the
 * build asks for.
 *
 * Run: node scripts/nsc-isochrones.mjs 10.10 9.50 ... [--mmax 150]  →  JSON on stdout
 * ({ "10.10": [[m, logL, logT, k], ...], ... }). Called by build-nsc.py; a few seconds per age.
 */
import { evolve, lZHe, msState, rZHe, tHeMs, teffOf, tMs } from '../src/sim/stars/sse.ts';

const args = process.argv.slice(2);
let mmax = 150;
const ages = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mmax') mmax = Number(args[++i]);
  else ages.push(args[i]);
}

const LOG = Math.log10;

/**
 * The main sequence with HPT's winds for stars brighter than 4,000 L☉ (§7.1: Nieuwenhuijzen & de Jager's, at Z = Z☉,
 * plus the LBV-like wind beyond the Humphreys–Davidson limit), which sse.ts leaves out: the star keeps its fractional
 * main-sequence age as its mass falls and is drawn at its current mass (HPT's M0 = Mt on the MS). Steps of at most
 * 0.5 % of the lifetime and 1 % of the mass. Returns the path, or null if the star never loses mass on the MS.
 */
function msWind(m0) {
  let m = m0;
  let tau = 0;
  let t = 0;
  const path = { t: [0], m: [m0], tau: [0] };
  while (tau < 1) {
    const tm = tMs(m).tMs;
    const s = msState(m, tau * tm);
    let rate = s.l > 4000 ? 9.6e-15 * s.r ** 0.81 * s.l ** 1.24 * m ** 0.16 : 0;
    const hd = 1e-5 * s.r * Math.sqrt(s.l);
    if (s.l > 6e5 && hd > 1) rate += 0.1 * hd ** 3 * (s.l / 6e5 - 1);
    rate *= 1e6; // M☉ per Myr
    const dt = Math.min((1 - tau) * tm, 0.005 * tm, rate > 0 ? (0.01 * m) / rate : Infinity);
    tau = Math.min(1, tau + dt / tm);
    m -= rate * dt;
    t += dt;
    path.t.push(t);
    path.m.push(m);
    path.tau.push(tau);
  }
  return m < m0 * (1 - 1e-9) ? path : null;
}

/** A star's life: on the MS with its winds, then the track of its mass at the end of the MS, shifted in time. */
const lives = new Map();
function lifeOf(m0) {
  let life = lives.get(m0);
  if (!life) {
    const ms = msWind(m0);
    if (!ms) life = { ms: null, track: evolve(m0), shift: 0 };
    else {
      const mEnd = ms.m[ms.m.length - 1];
      const tEnd = ms.t[ms.t.length - 1];
      life = { ms, track: evolve(mEnd), shift: tEnd - tMs(mEnd).tMs };
    }
    lives.set(m0, life);
  }
  return life;
}

/** A naked helium main-sequence star of mass m at fractional age tau: HPT eqs. (80)–(81). */
function heMs(m, tau) {
  const alpha = Math.max(0, 0.85 - 0.08 * m);
  const beta = Math.max(0, 0.4 - 0.22 * LOG(m));
  const l = lZHe(m) * (1 + 0.45 * tau + alpha * tau * tau);
  const r = rZHe(m) * (1 + beta * tau - beta * tau ** 6);
  return { l, r };
}

/** [logL, logT, k] of a star of initial mass m at age tMyr, or null if it is no longer a star the field draws. */
function stateAt(m0, tPhys) {
  const { ms, track: life, shift } = lifeOf(m0);
  if (ms && tPhys < ms.t[ms.t.length - 1]) {
    let i = 1;
    while (ms.t[i] <= tPhys) i++;
    const f = (tPhys - ms.t[i - 1]) / (ms.t[i] - ms.t[i - 1]);
    const m = ms.m[i - 1] + f * (ms.m[i] - ms.m[i - 1]);
    const tau = ms.tau[i - 1] + f * (ms.tau[i] - ms.tau[i - 1]);
    const s = msState(m, tau * tMs(m).tMs);
    return [LOG(s.l), LOG(teffOf(s.l, s.r)), 1];
  }
  const tMyr = tPhys - shift;
  const p = life.points;
  const last = p[p.length - 1];
  if (tMyr > last.t) {
    if (life.end !== 'helium-star') return null;
    // Stripped to the helium core: HPT's naked helium main sequence, entered at the share of helium burning done
    // (CHeB: since helium ignition; on the AGB or before ignition the core has already burnt or not yet lit).
    if (last.k >= 5) return null; // stripped on the AGB: a helium-burning shell star, not followed
    const mHe = last.mc;
    // sse.ts samples CHeB at 100 points even in time from helium ignition (marks.hei).
    const tau0 = last.k === 4 ? (p.length - 1 - life.marks.hei) / 100 : 0;
    // The Wolf–Rayet-like wind (HPT §7.1, 10⁻¹³ L^1.5 M☉/yr) in steps of 0.2 % of the lifetime; the star keeps its
    // fractional age as its mass falls (HPT's M0 = Mt for naked helium stars).
    let mm = mHe;
    let tau = tau0;
    let tt = last.t;
    while (tt < tMyr) {
      const life = tHeMs(mm);
      const dt = Math.min(tMyr - tt, 0.002 * life);
      const rate = 1e-13 * heMs(mm, tau).l ** 1.5 * 1e6;
      tau += dt / life;
      mm -= rate * dt;
      tt += dt;
      if (tau >= 1 || mm < 0.32) return null;
    }
    const s = heMs(mm, tau);
    return [LOG(s.l), LOG(teffOf(s.l, s.r)), 7];
  }
  let lo = 0;
  let hi = p.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p[mid].t <= tMyr) lo = mid;
    else hi = mid;
  }
  const a = p[lo];
  const b = p[hi];
  const f = b.t > a.t ? Math.min(1, Math.max(0, (tMyr - a.t) / (b.t - a.t))) : 0;
  if (b.k >= 10 && f > 0) return null; // the white dwarf's birth
  const logL = LOG(a.l) + f * (LOG(b.l) - LOG(a.l));
  const logR = LOG(a.r) + f * (LOG(b.r) - LOG(a.r));
  return [logL, LOG(5772) + 0.25 * logL - 0.5 * logR, a.k];
}

function isochrone(logAge) {
  const t = 10 ** logAge / 1e6;
  const n0 = 600;
  const lnLo = Math.log(0.1);
  const lnHi = Math.log(mmax);
  let ms = Array.from({ length: n0 + 1 }, (_, i) => Math.exp(lnLo + ((lnHi - lnLo) * i) / n0));
  let st = ms.map((m) => stateAt(m, t));
  const close = (a, b) => (a === null) === (b === null) && (a === null || (Math.abs(a[0] - b[0]) < 0.02 && Math.abs(a[1] - b[1]) < 0.004 && a[2] === b[2]));
  for (let pass = 0; pass < 40; pass++) {
    const nm = [ms[0]];
    const ns = [st[0]];
    let added = 0;
    for (let i = 1; i < ms.length; i++) {
      if (!close(st[i - 1], st[i]) && LOG(ms[i] / ms[i - 1]) > 1e-6) {
        const m = Math.sqrt(ms[i - 1] * ms[i]);
        nm.push(m);
        ns.push(stateAt(m, t));
        added++;
      }
      nm.push(ms[i]);
      ns.push(st[i]);
    }
    ms = nm;
    st = ns;
    if (!added) break;
  }
  const rows = [];
  for (let i = 0; i < ms.length; i++) if (st[i]) rows.push([ms[i], ...st[i]]);
  return rows;
}

const r6 = (x) => Number(x.toPrecision(7));
const out = {};
for (const a of ages) out[a] = isochrone(Number(a)).map((r) => [r6(r[0]), r6(r[1]), r6(r[2]), r[3]]);
process.stdout.write(JSON.stringify(out));
