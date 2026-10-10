/**
 * SGP4/SDP4, the analytical propagator that goes with the US Space Force's general perturbations (GP)
 * mean elements (TLEs and OMMs, as CelesTrak serves them).
 *
 * A TypeScript port of the reference implementation of Vallado, Crawford, Hujsak & Kelso (2006),
 * "Revisiting Spacetrack Report #3", AIAA 2006-6753 (Vallado's sgp4unit.cpp, 2015 revision, as
 * also carried by python-sgp4, Rhodes, MIT). Same equations, same order of operations, "improved"
 * operation mode (opsmode 'i') and WGS-72 constants, which is what the GP elements are fitted with.
 * Near-Earth orbits (period under 225 minutes) use SGP4 with its drag terms; deep-space orbits add
 * the lunar-solar secular and long-period terms and the 12 h and 24 h geopotential resonances
 * (SDP4). `sgp4.test.ts` checks it against the paper's verification output (tcppver.out).
 *
 * Output: TEME position (km) and velocity (km/s) of date; `temeToEcliptic` in `frames.ts` of this
 * folder turns them into the app's frame. `propagate` does not allocate.
 */

const TWO_PI = 2 * Math.PI;
const X2O3 = 2 / 3;
const DEG = Math.PI / 180;

/** WGS-72 constants (Spacetrack Report #3; Vallado et al. 2006 `getgravconst('wgs72')`). */
export const WGS72 = (() => {
  const mu = 398600.8; // km³/s²
  const radiusearthkm = 6378.135; // km
  const xke = 60 / Math.sqrt((radiusearthkm * radiusearthkm * radiusearthkm) / mu);
  const j2 = 0.001082616;
  const j3 = -0.00000253881;
  const j4 = -0.00000165597;
  return { mu, radiusearthkm, xke, tumin: 1 / xke, j2, j3, j4, j3oj2: j3 / j2 };
})();

/** Mean elements of one GP element set, as they come from an OMM (degrees, revolutions per day). */
export interface GpElements {
  /** Epoch, Julian date (UTC). */
  epochJd: number;
  /** Mean motion, revolutions per day (Kozai). */
  meanMotion: number;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  argPericentreDeg: number;
  meanAnomalyDeg: number;
  /** Drag term, per Earth radius. */
  bstar: number;
  /** First and second derivatives of the mean motion (rev/day², rev/day³): not used by SGP4, kept for completeness. */
  meanMotionDot?: number;
  meanMotionDdot?: number;
}

/** The propagator's state for one element set. Plain numbers: build with `sgp4init`. */
export interface SatRec {
  error: number;
  method: 'n' | 'd';
  isimp: number;
  /** Epoch, Julian date (UTC). */
  epochJd: number;
  bstar: number;
  ecco: number;
  argpo: number;
  inclo: number;
  mo: number;
  noKozai: number;
  nodeo: number;
  noUnkozai: number;
  /** Mean semi-major axis, Earth radii. */
  a: number;
  gsto: number;
  // near-Earth
  aycof: number; con41: number; cc1: number; cc4: number; cc5: number; d2: number; d3: number; d4: number;
  delmo: number; eta: number; argpdot: number; omgcof: number; sinmao: number; t: number; t2cof: number;
  t3cof: number; t4cof: number; t5cof: number; x1mth2: number; x7thm1: number; mdot: number; nodedot: number;
  xlcof: number; xmcof: number; nodecf: number;
  // deep space
  irez: number; d2201: number; d2211: number; d3210: number; d3222: number; d4410: number; d4422: number;
  d5220: number; d5232: number; d5421: number; d5433: number; dedt: number; del1: number; del2: number;
  del3: number; didt: number; dmdt: number; dnodt: number; domdt: number; e3: number; ee2: number; peo: number;
  pgho: number; pho: number; pinco: number; plo: number; se2: number; se3: number; sgh2: number; sgh3: number;
  sgh4: number; sh2: number; sh3: number; si2: number; si3: number; sl2: number; sl3: number; sl4: number;
  xfact: number; xgh2: number; xgh3: number; xgh4: number; xh2: number; xh3: number; xi2: number; xi3: number;
  xl2: number; xl3: number; xl4: number; xlamo: number; zmol: number; zmos: number; atime: number; xli: number;
  xni: number;
}

/** Error codes of `propagate` (Vallado et al. 2006). */
export const SGP4_ERRORS: Record<number, string> = {
  1: 'mean eccentricity out of range',
  2: 'mean motion below zero',
  3: 'perturbed eccentricity out of range',
  4: 'semi-latus rectum below zero',
  6: 'the orbit has decayed',
};

// ─── Deep-space periodics (dpper) ─────────────────────────────────────────────────────────

/** In/out of `dpper`: the elements it perturbs. */
const dp = { ep: 0, inclp: 0, nodep: 0, argpp: 0, mp: 0 };

function dpper(s: SatRec, init: boolean): void {
  const zns = 1.19459e-5;
  const zes = 0.01675;
  const znl = 1.5835218e-4;
  const zel = 0.0549;
  const t = s.t;
  let zm = init ? s.zmos : s.zmos + zns * t;
  let zf = zm + 2 * zes * Math.sin(zm);
  let sinzf = Math.sin(zf);
  let f2 = 0.5 * sinzf * sinzf - 0.25;
  let f3 = -0.5 * sinzf * Math.cos(zf);
  const ses = s.se2 * f2 + s.se3 * f3;
  const sis = s.si2 * f2 + s.si3 * f3;
  const sls = s.sl2 * f2 + s.sl3 * f3 + s.sl4 * sinzf;
  const sghs = s.sgh2 * f2 + s.sgh3 * f3 + s.sgh4 * sinzf;
  const shs = s.sh2 * f2 + s.sh3 * f3;
  zm = init ? s.zmol : s.zmol + znl * t;
  zf = zm + 2 * zel * Math.sin(zm);
  sinzf = Math.sin(zf);
  f2 = 0.5 * sinzf * sinzf - 0.25;
  f3 = -0.5 * sinzf * Math.cos(zf);
  const sel = s.ee2 * f2 + s.e3 * f3;
  const sil = s.xi2 * f2 + s.xi3 * f3;
  const sll = s.xl2 * f2 + s.xl3 * f3 + s.xl4 * sinzf;
  const sghl = s.xgh2 * f2 + s.xgh3 * f3 + s.xgh4 * sinzf;
  const shll = s.xh2 * f2 + s.xh3 * f3;
  let pe = ses + sel;
  let pinc = sis + sil;
  let pl = sls + sll;
  let pgh = sghs + sghl;
  let ph = shs + shll;
  if (init) return;
  pe -= s.peo;
  pinc -= s.pinco;
  pl -= s.plo;
  pgh -= s.pgho;
  ph -= s.pho;
  dp.inclp += pinc;
  dp.ep += pe;
  const sinip = Math.sin(dp.inclp);
  const cosip = Math.cos(dp.inclp);
  // Lyddane choice: the perturbed inclination, as GSFC (Vallado et al. 2006).
  if (dp.inclp >= 0.2) {
    ph /= sinip;
    pgh -= cosip * ph;
    dp.argpp += pgh;
    dp.nodep += ph;
    dp.mp += pl;
  } else {
    const sinop = Math.sin(dp.nodep);
    const cosop = Math.cos(dp.nodep);
    let alfdp = sinip * sinop;
    let betdp = sinip * cosop;
    const dalf = ph * cosop + pinc * cosip * sinop;
    const dbet = -ph * sinop + pinc * cosip * cosop;
    alfdp += dalf;
    betdp += dbet;
    dp.nodep %= TWO_PI; // fmod: keeps the sign
    const xls = dp.mp + dp.argpp + pl + pgh + (cosip - pinc * sinip) * dp.nodep;
    const xnoh = dp.nodep;
    dp.nodep = Math.atan2(alfdp, betdp);
    if (Math.abs(xnoh - dp.nodep) > Math.PI) {
      if (dp.nodep < xnoh) dp.nodep += TWO_PI;
      else dp.nodep -= TWO_PI;
    }
    dp.mp += pl;
    dp.argpp = xls - dp.mp - cosip * dp.nodep;
  }
}

// ─── Deep-space common terms (dscom) ─────────────────────────────────────────────────────

interface Dscom {
  snodm: number; cnodm: number; sinim: number; cosim: number; sinomm: number; cosomm: number; day: number;
  em: number; emsq: number; gam: number; rtemsq: number; nm: number;
  s1: number; s2: number; s3: number; s4: number; s5: number; s6: number; s7: number;
  ss1: number; ss2: number; ss3: number; ss4: number; ss5: number; ss6: number; ss7: number;
  sz1: number; sz2: number; sz3: number; sz11: number; sz12: number; sz13: number; sz21: number; sz22: number;
  sz23: number; sz31: number; sz32: number; sz33: number;
  z1: number; z2: number; z3: number; z11: number; z12: number; z13: number; z21: number; z22: number; z23: number;
  z31: number; z32: number; z33: number;
}

function dscom(epoch: number, ep: number, argpp: number, tc: number, inclp: number, nodep: number, np: number, s: SatRec): Dscom {
  const zes = 0.01675;
  const zel = 0.0549;
  const c1ss = 2.9864797e-6;
  const c1l = 4.7968065e-7;
  const zsinis = 0.39785416;
  const zcosis = 0.91744867;
  const zcosgs = 0.1945905;
  const zsings = -0.98088458;

  const nm = np;
  const em = ep;
  const snodm = Math.sin(nodep);
  const cnodm = Math.cos(nodep);
  const sinomm = Math.sin(argpp);
  const cosomm = Math.cos(argpp);
  const sinim = Math.sin(inclp);
  const cosim = Math.cos(inclp);
  const emsq = em * em;
  const betasq = 1 - emsq;
  const rtemsq = Math.sqrt(betasq);

  s.peo = 0;
  s.pinco = 0;
  s.plo = 0;
  s.pgho = 0;
  s.pho = 0;
  const day = epoch + 18261.5 + tc / 1440;
  const xnodce = (4.523602 - 9.2422029e-4 * day) % TWO_PI;
  const stem = Math.sin(xnodce);
  const ctem = Math.cos(xnodce);
  const zcosil = 0.91375164 - 0.03568096 * ctem;
  const zsinil = Math.sqrt(1 - zcosil * zcosil);
  const zsinhl = (0.089683511 * stem) / zsinil;
  const zcoshl = Math.sqrt(1 - zsinhl * zsinhl);
  const gam = 5.8351514 + 0.001944368 * day;
  let zx = (0.39785416 * stem) / zsinil;
  const zy = zcoshl * ctem + 0.91744867 * zsinhl * stem;
  zx = Math.atan2(zx, zy);
  zx = gam + zx - xnodce;
  const zcosgl = Math.cos(zx);
  const zsingl = Math.sin(zx);

  let zcosg = zcosgs;
  let zsing = zsings;
  let zcosi = zcosis;
  let zsini = zsinis;
  let zcosh = cnodm;
  let zsinh = snodm;
  let cc = c1ss;
  const xnoi = 1 / nm;

  const o = {} as Dscom;
  for (let lsflg = 1; lsflg <= 2; lsflg++) {
    const a1 = zcosg * zcosh + zsing * zcosi * zsinh;
    const a3 = -zsing * zcosh + zcosg * zcosi * zsinh;
    const a7 = -zcosg * zsinh + zsing * zcosi * zcosh;
    const a8 = zsing * zsini;
    const a9 = zsing * zsinh + zcosg * zcosi * zcosh;
    const a10 = zcosg * zsini;
    const a2 = cosim * a7 + sinim * a8;
    const a4 = cosim * a9 + sinim * a10;
    const a5 = -sinim * a7 + cosim * a8;
    const a6 = -sinim * a9 + cosim * a10;

    const x1 = a1 * cosomm + a2 * sinomm;
    const x2 = a3 * cosomm + a4 * sinomm;
    const x3 = -a1 * sinomm + a2 * cosomm;
    const x4 = -a3 * sinomm + a4 * cosomm;
    const x5 = a5 * sinomm;
    const x6 = a6 * sinomm;
    const x7 = a5 * cosomm;
    const x8 = a6 * cosomm;

    const z31 = 12 * x1 * x1 - 3 * x3 * x3;
    const z32 = 24 * x1 * x2 - 6 * x3 * x4;
    const z33 = 12 * x2 * x2 - 3 * x4 * x4;
    let z1 = 3 * (a1 * a1 + a2 * a2) + z31 * emsq;
    let z2 = 6 * (a1 * a3 + a2 * a4) + z32 * emsq;
    let z3 = 3 * (a3 * a3 + a4 * a4) + z33 * emsq;
    const z11 = -6 * a1 * a5 + emsq * (-24 * x1 * x7 - 6 * x3 * x5);
    const z12 = -6 * (a1 * a6 + a3 * a5) + emsq * (-24 * (x2 * x7 + x1 * x8) - 6 * (x3 * x6 + x4 * x5));
    const z13 = -6 * a3 * a6 + emsq * (-24 * x2 * x8 - 6 * x4 * x6);
    const z21 = 6 * a2 * a5 + emsq * (24 * x1 * x5 - 6 * x3 * x7);
    const z22 = 6 * (a4 * a5 + a2 * a6) + emsq * (24 * (x2 * x5 + x1 * x6) - 6 * (x4 * x7 + x3 * x8));
    const z23 = 6 * a4 * a6 + emsq * (24 * x2 * x6 - 6 * x4 * x8);
    z1 = z1 + z1 + betasq * z31;
    z2 = z2 + z2 + betasq * z32;
    z3 = z3 + z3 + betasq * z33;
    const s3 = cc * xnoi;
    const s2 = (-0.5 * s3) / rtemsq;
    const s4 = s3 * rtemsq;
    const s1 = -15 * em * s4;
    const s5 = x1 * x3 + x2 * x4;
    const s6 = x2 * x3 + x1 * x4;
    const s7 = x2 * x4 - x1 * x3;
    Object.assign(o, { z1, z2, z3, z11, z12, z13, z21, z22, z23, z31, z32, z33, s1, s2, s3, s4, s5, s6, s7 });

    if (lsflg === 1) {
      Object.assign(o, {
        ss1: s1, ss2: s2, ss3: s3, ss4: s4, ss5: s5, ss6: s6, ss7: s7,
        sz1: z1, sz2: z2, sz3: z3, sz11: z11, sz12: z12, sz13: z13, sz21: z21, sz22: z22, sz23: z23,
        sz31: z31, sz32: z32, sz33: z33,
      });
      zcosg = zcosgl;
      zsing = zsingl;
      zcosi = zcosil;
      zsini = zsinil;
      zcosh = zcoshl * cnodm + zsinhl * snodm;
      zsinh = snodm * zcoshl - cnodm * zsinhl;
      cc = c1l;
    }
  }

  s.zmol = (4.7199672 + 0.2299715 * day - gam) % TWO_PI;
  s.zmos = (6.2565837 + 0.017201977 * day) % TWO_PI;

  // Solar terms
  s.se2 = 2 * o.ss1 * o.ss6;
  s.se3 = 2 * o.ss1 * o.ss7;
  s.si2 = 2 * o.ss2 * o.sz12;
  s.si3 = 2 * o.ss2 * (o.sz13 - o.sz11);
  s.sl2 = -2 * o.ss3 * o.sz2;
  s.sl3 = -2 * o.ss3 * (o.sz3 - o.sz1);
  s.sl4 = -2 * o.ss3 * (-21 - 9 * emsq) * zes;
  s.sgh2 = 2 * o.ss4 * o.sz32;
  s.sgh3 = 2 * o.ss4 * (o.sz33 - o.sz31);
  s.sgh4 = -18 * o.ss4 * zes;
  s.sh2 = -2 * o.ss2 * o.sz22;
  s.sh3 = -2 * o.ss2 * (o.sz23 - o.sz21);
  // Lunar terms
  s.ee2 = 2 * o.s1 * o.s6;
  s.e3 = 2 * o.s1 * o.s7;
  s.xi2 = 2 * o.s2 * o.z12;
  s.xi3 = 2 * o.s2 * (o.z13 - o.z11);
  s.xl2 = -2 * o.s3 * o.z2;
  s.xl3 = -2 * o.s3 * (o.z3 - o.z1);
  s.xl4 = -2 * o.s3 * (-21 - 9 * emsq) * zel;
  s.xgh2 = 2 * o.s4 * o.z32;
  s.xgh3 = 2 * o.s4 * (o.z33 - o.z31);
  s.xgh4 = -18 * o.s4 * zel;
  s.xh2 = -2 * o.s2 * o.z22;
  s.xh3 = -2 * o.s2 * (o.z23 - o.z21);

  return Object.assign(o, { snodm, cnodm, sinim, cosim, sinomm, cosomm, day, em, emsq, gam, rtemsq, nm });
}

// ─── Deep-space initialisation (dsinit) ───────────────────────────────────────────────────

const dsOut = { em: 0, argpm: 0, inclm: 0, mm: 0, nm: 0, nodem: 0 };

function dsinit(
  s: SatRec, c: Dscom, t: number, tc: number, xpidot: number, eccsq: number,
  em0: number, argpm0: number, inclm0: number, mm0: number, nm0: number, nodem0: number,
): void {
  const q22 = 1.7891679e-6;
  const q31 = 2.1460748e-6;
  const q33 = 2.2123015e-7;
  const root22 = 1.7891679e-6;
  const root44 = 7.3636953e-9;
  const root54 = 2.1765803e-9;
  const rptim = 4.37526908801129966e-3; // 7.29211514668855e-5 rad/s in rad/min
  const root32 = 3.7393792e-7;
  const root52 = 1.1428639e-7;
  const znl = 1.5835218e-4;
  const zns = 1.19459e-5;
  const { cosim, sinim } = c;
  let { emsq } = c;
  let em = em0;
  let argpm = argpm0;
  let inclm = inclm0;
  let mm = mm0;
  let nm = nm0;
  let nodem = nodem0;

  s.irez = 0;
  if (nm < 0.0052359877 && nm > 0.0034906585) s.irez = 1;
  if (nm >= 8.26e-3 && nm <= 9.24e-3 && em >= 0.5) s.irez = 2;

  // Solar terms
  const ses = c.ss1 * zns * c.ss5;
  const sis = c.ss2 * zns * (c.sz11 + c.sz13);
  const sls = -zns * c.ss3 * (c.sz1 + c.sz3 - 14 - 6 * emsq);
  const sghs = c.ss4 * zns * (c.sz31 + c.sz33 - 6);
  let shs = -zns * c.ss2 * (c.sz21 + c.sz23);
  if (inclm < 5.2359877e-2 || inclm > Math.PI - 5.2359877e-2) shs = 0;
  if (sinim !== 0) shs /= sinim;
  const sgs = sghs - cosim * shs;

  // Lunar terms
  s.dedt = ses + c.s1 * znl * c.s5;
  s.didt = sis + c.s2 * znl * (c.z11 + c.z13);
  s.dmdt = sls - znl * c.s3 * (c.z1 + c.z3 - 14 - 6 * emsq);
  const sghl = c.s4 * znl * (c.z31 + c.z33 - 6);
  let shll = -znl * c.s2 * (c.z21 + c.z23);
  if (inclm < 5.2359877e-2 || inclm > Math.PI - 5.2359877e-2) shll = 0;
  s.domdt = sgs + sghl;
  s.dnodt = shs;
  if (sinim !== 0) {
    s.domdt -= (cosim / sinim) * shll;
    s.dnodt += shll / sinim;
  }

  const dndt = 0;
  const theta = (s.gsto + tc * rptim) % TWO_PI;
  em += s.dedt * t;
  inclm += s.didt * t;
  argpm += s.domdt * t;
  nodem += s.dnodt * t;
  mm += s.dmdt * t;

  if (s.irez !== 0) {
    const aonv = Math.pow(nm / WGS72.xke, X2O3);
    if (s.irez === 2) {
      // 12-hour resonance
      const cosisq = cosim * cosim;
      const emo = em;
      em = s.ecco;
      const emsqo = emsq;
      emsq = eccsq;
      const eoc = em * emsq;
      const g201 = -0.306 - (em - 0.64) * 0.44;
      let g211: number, g310: number, g322: number, g410: number, g422: number, g520: number;
      let g521: number, g532: number, g533: number;
      if (em <= 0.65) {
        g211 = 3.616 - 13.247 * em + 16.29 * emsq;
        g310 = -19.302 + 117.39 * em - 228.419 * emsq + 156.591 * eoc;
        g322 = -18.9068 + 109.7927 * em - 214.6334 * emsq + 146.5816 * eoc;
        g410 = -41.122 + 242.694 * em - 471.094 * emsq + 313.953 * eoc;
        g422 = -146.407 + 841.88 * em - 1629.014 * emsq + 1083.435 * eoc;
        g520 = -532.114 + 3017.977 * em - 5740.032 * emsq + 3708.276 * eoc;
      } else {
        g211 = -72.099 + 331.819 * em - 508.738 * emsq + 266.724 * eoc;
        g310 = -346.844 + 1582.851 * em - 2415.925 * emsq + 1246.113 * eoc;
        g322 = -342.585 + 1554.908 * em - 2366.899 * emsq + 1215.972 * eoc;
        g410 = -1052.797 + 4758.686 * em - 7193.992 * emsq + 3651.957 * eoc;
        g422 = -3581.69 + 16178.11 * em - 24462.77 * emsq + 12422.52 * eoc;
        if (em > 0.715) g520 = -5149.66 + 29936.92 * em - 54087.36 * emsq + 31324.56 * eoc;
        else g520 = 1464.74 - 4664.75 * em + 3763.64 * emsq;
      }
      if (em < 0.7) {
        g533 = -919.2277 + 4988.61 * em - 9064.77 * emsq + 5542.21 * eoc;
        g521 = -822.71072 + 4568.6173 * em - 8491.4146 * emsq + 5337.524 * eoc;
        g532 = -853.666 + 4690.25 * em - 8624.77 * emsq + 5341.4 * eoc;
      } else {
        g533 = -37995.78 + 161616.52 * em - 229838.2 * emsq + 109377.94 * eoc;
        g521 = -51752.104 + 218913.95 * em - 309468.16 * emsq + 146349.42 * eoc;
        g532 = -40023.88 + 170470.89 * em - 242699.48 * emsq + 115605.82 * eoc;
      }
      const sini2 = sinim * sinim;
      const f220 = 0.75 * (1 + 2 * cosim + cosisq);
      const f221 = 1.5 * sini2;
      const f321 = 1.875 * sinim * (1 - 2 * cosim - 3 * cosisq);
      const f322 = -1.875 * sinim * (1 + 2 * cosim - 3 * cosisq);
      const f441 = 35 * sini2 * f220;
      const f442 = 39.375 * sini2 * sini2;
      const f522 = 9.84375 * sinim * (sini2 * (1 - 2 * cosim - 5 * cosisq) + 0.33333333 * (-2 + 4 * cosim + 6 * cosisq));
      const f523 = sinim * (4.92187512 * sini2 * (-2 - 4 * cosim + 10 * cosisq) + 6.56250012 * (1 + 2 * cosim - 3 * cosisq));
      const f542 = 29.53125 * sinim * (2 - 8 * cosim + cosisq * (-12 + 8 * cosim + 10 * cosisq));
      const f543 = 29.53125 * sinim * (-2 - 8 * cosim + cosisq * (12 + 8 * cosim - 10 * cosisq));
      const xno2 = nm * nm;
      const ainv2 = aonv * aonv;
      let temp1 = 3 * xno2 * ainv2;
      let temp = temp1 * root22;
      s.d2201 = temp * f220 * g201;
      s.d2211 = temp * f221 * g211;
      temp1 *= aonv;
      temp = temp1 * root32;
      s.d3210 = temp * f321 * g310;
      s.d3222 = temp * f322 * g322;
      temp1 *= aonv;
      temp = 2 * temp1 * root44;
      s.d4410 = temp * f441 * g410;
      s.d4422 = temp * f442 * g422;
      temp1 *= aonv;
      temp = temp1 * root52;
      s.d5220 = temp * f522 * g520;
      s.d5232 = temp * f523 * g532;
      temp = 2 * temp1 * root54;
      s.d5421 = temp * f542 * g521;
      s.d5433 = temp * f543 * g533;
      s.xlamo = (s.mo + s.nodeo + s.nodeo - theta - theta) % TWO_PI;
      s.xfact = s.mdot + s.dmdt + 2 * (s.nodedot + s.dnodt - rptim) - s.noUnkozai;
      em = emo;
      emsq = emsqo;
    }
    if (s.irez === 1) {
      // 24-hour (synchronous) resonance
      const g200 = 1 + emsq * (-2.5 + 0.8125 * emsq);
      const g310 = 1 + 2 * emsq;
      const g300 = 1 + emsq * (-6 + 6.60937 * emsq);
      const f220 = 0.75 * (1 + cosim) * (1 + cosim);
      const f311 = 0.9375 * sinim * sinim * (1 + 3 * cosim) - 0.75 * (1 + cosim);
      let f330 = 1 + cosim;
      f330 = 1.875 * f330 * f330 * f330;
      s.del1 = 3 * nm * nm * aonv * aonv;
      s.del2 = 2 * s.del1 * f220 * g200 * q22;
      s.del3 = 3 * s.del1 * f330 * g300 * q33 * aonv;
      s.del1 = s.del1 * f311 * g310 * q31 * aonv;
      s.xlamo = (s.mo + s.nodeo + s.argpo - theta) % TWO_PI;
      s.xfact = s.mdot + xpidot - rptim + s.dmdt + s.domdt + s.dnodt - s.noUnkozai;
    }
    s.xli = s.xlamo;
    s.xni = s.noUnkozai;
    s.atime = 0;
    nm = s.noUnkozai + dndt;
  }
  dsOut.em = em;
  dsOut.argpm = argpm;
  dsOut.inclm = inclm;
  dsOut.mm = mm;
  dsOut.nm = nm;
  dsOut.nodem = nodem;
}

// ─── Deep-space secular and resonance terms (dspace) ──────────────────────────────────────

const dsp = { em: 0, argpm: 0, inclm: 0, mm: 0, nodem: 0, nm: 0 };

function dspace(s: SatRec, t: number, tc: number): void {
  const fasx2 = 0.13130908;
  const fasx4 = 2.8843198;
  const fasx6 = 0.37448087;
  const g22 = 5.7686396;
  const g32 = 0.95240898;
  const g44 = 1.8014998;
  const g52 = 1.050833;
  const g54 = 4.4108898;
  const rptim = 4.37526908801129966e-3;
  const stepp = 720;
  const stepn = -720;
  const step2 = 259200;

  let dndt = 0;
  const theta = (s.gsto + tc * rptim) % TWO_PI;
  dsp.em += s.dedt * t;
  dsp.inclm += s.didt * t;
  dsp.argpm += s.domdt * t;
  dsp.nodem += s.dnodt * t;
  dsp.mm += s.dmdt * t;

  if (s.irez === 0) return;
  // Euler–Maclaurin integration of the resonance terms, restarted from the epoch when needed.
  if (s.atime === 0 || t * s.atime <= 0 || Math.abs(t) < Math.abs(s.atime)) {
    s.atime = 0;
    s.xni = s.noUnkozai;
    s.xli = s.xlamo;
  }
  const delt = t > 0 ? stepp : stepn;
  let ft = 0;
  let xndt = 0;
  let xldot = 0;
  let xnddt = 0;
  for (;;) {
    if (s.irez !== 2) {
      xndt = s.del1 * Math.sin(s.xli - fasx2) + s.del2 * Math.sin(2 * (s.xli - fasx4)) + s.del3 * Math.sin(3 * (s.xli - fasx6));
      xldot = s.xni + s.xfact;
      xnddt = s.del1 * Math.cos(s.xli - fasx2) + 2 * s.del2 * Math.cos(2 * (s.xli - fasx4)) + 3 * s.del3 * Math.cos(3 * (s.xli - fasx6));
      xnddt *= xldot;
    } else {
      const xomi = s.argpo + s.argpdot * s.atime;
      const x2omi = xomi + xomi;
      const x2li = s.xli + s.xli;
      xndt =
        s.d2201 * Math.sin(x2omi + s.xli - g22) + s.d2211 * Math.sin(s.xli - g22) +
        s.d3210 * Math.sin(xomi + s.xli - g32) + s.d3222 * Math.sin(-xomi + s.xli - g32) +
        s.d4410 * Math.sin(x2omi + x2li - g44) + s.d4422 * Math.sin(x2li - g44) +
        s.d5220 * Math.sin(xomi + s.xli - g52) + s.d5232 * Math.sin(-xomi + s.xli - g52) +
        s.d5421 * Math.sin(xomi + x2li - g54) + s.d5433 * Math.sin(-xomi + x2li - g54);
      xldot = s.xni + s.xfact;
      xnddt =
        s.d2201 * Math.cos(x2omi + s.xli - g22) + s.d2211 * Math.cos(s.xli - g22) +
        s.d3210 * Math.cos(xomi + s.xli - g32) + s.d3222 * Math.cos(-xomi + s.xli - g32) +
        s.d5220 * Math.cos(xomi + s.xli - g52) + s.d5232 * Math.cos(-xomi + s.xli - g52) +
        2 * (s.d4410 * Math.cos(x2omi + x2li - g44) + s.d4422 * Math.cos(x2li - g44) +
          s.d5421 * Math.cos(xomi + x2li - g54) + s.d5433 * Math.cos(-xomi + x2li - g54));
      xnddt *= xldot;
    }
    if (Math.abs(t - s.atime) >= stepp) {
      s.xli += xldot * delt + xndt * step2;
      s.xni += xndt * delt + xnddt * step2;
      s.atime += delt;
    } else {
      ft = t - s.atime;
      break;
    }
  }
  dsp.nm = s.xni + xndt * ft + xnddt * ft * ft * 0.5;
  const xl = s.xli + xldot * ft + xndt * ft * ft * 0.5;
  if (s.irez !== 1) dsp.mm = xl - 2 * dsp.nodem + 2 * theta;
  else dsp.mm = xl - dsp.nodem - dsp.argpm + theta;
  dndt = dsp.nm - s.noUnkozai;
  dsp.nm = s.noUnkozai + dndt;
}

// ─── Greenwich sidereal time (Vallado 2004, eq. 3-45) ─────────────────────────────────────

/** Greenwich mean sidereal time (rad, 0–2π) from a UT1 Julian date, as SGP4 uses it. */
export function gstime(jdut1: number): number {
  const tut1 = (jdut1 - 2451545) / 36525;
  let temp = -6.2e-6 * tut1 * tut1 * tut1 + 0.093104 * tut1 * tut1 + (876600 * 3600 + 8640184.812866) * tut1 + 67310.54841; // s
  temp = ((temp * DEG) / 240) % TWO_PI;
  if (temp < 0) temp += TWO_PI;
  return temp;
}

// ─── Initialisation ───────────────────────────────────────────────────────────────────────

/** Builds the propagator for one element set. Check `error` (non-zero: unusable). */
export function sgp4init(el: GpElements): SatRec {
  const xpdotp = 1440 / TWO_PI;
  const s = {} as SatRec;
  const zeroed: (keyof SatRec)[] = [
    'isimp', 'aycof', 'con41', 'cc1', 'cc4', 'cc5', 'd2', 'd3', 'd4', 'delmo', 'eta', 'argpdot', 'omgcof', 'sinmao', 't',
    't2cof', 't3cof', 't4cof', 't5cof', 'x1mth2', 'x7thm1', 'mdot', 'nodedot', 'xlcof', 'xmcof', 'nodecf', 'irez', 'd2201',
    'd2211', 'd3210', 'd3222', 'd4410', 'd4422', 'd5220', 'd5232', 'd5421', 'd5433', 'dedt', 'del1', 'del2', 'del3', 'didt',
    'dmdt', 'dnodt', 'domdt', 'e3', 'ee2', 'peo', 'pgho', 'pho', 'pinco', 'plo', 'se2', 'se3', 'sgh2', 'sgh3', 'sgh4', 'sh2',
    'sh3', 'si2', 'si3', 'sl2', 'sl3', 'sl4', 'gsto', 'xfact', 'xgh2', 'xgh3', 'xgh4', 'xh2', 'xh3', 'xi2', 'xi3', 'xl2', 'xl3',
    'xl4', 'xlamo', 'zmol', 'zmos', 'atime', 'xli', 'xni', 'error',
  ];
  for (const k of zeroed) (s as unknown as Record<string, number>)[k] = 0;
  s.method = 'n';
  s.epochJd = el.epochJd;
  s.bstar = el.bstar;
  s.ecco = el.eccentricity;
  s.argpo = el.argPericentreDeg * DEG;
  s.inclo = el.inclinationDeg * DEG;
  s.mo = el.meanAnomalyDeg * DEG;
  s.noKozai = el.meanMotion / xpdotp; // rad/min
  s.nodeo = el.raanDeg * DEG;

  const { radiusearthkm, xke, j2, j4, j3oj2 } = WGS72;
  const epoch = el.epochJd - 2433281.5; // days since 1950 Jan 0.0
  const temp4 = 1.5e-12;
  const ss = 78 / radiusearthkm + 1;
  const qzms2ttemp = (120 - 78) / radiusearthkm;
  const qzms2t = qzms2ttemp * qzms2ttemp * qzms2ttemp * qzms2ttemp;
  s.t = 0;

  // initl
  const eccsq = s.ecco * s.ecco;
  const omeosq = 1 - eccsq;
  const rteosq = Math.sqrt(omeosq);
  const cosio = Math.cos(s.inclo);
  const cosio2 = cosio * cosio;
  const ak = Math.pow(xke / s.noKozai, X2O3);
  const d1 = (0.75 * j2 * (3 * cosio2 - 1)) / (rteosq * omeosq);
  let delPrime = d1 / (ak * ak);
  const adel = ak * (1 - delPrime * delPrime - delPrime * (1 / 3 + (134 * delPrime * delPrime) / 81));
  delPrime = d1 / (adel * adel);
  s.noUnkozai = s.noKozai / (1 + delPrime);
  const ao = Math.pow(xke / s.noUnkozai, X2O3);
  const sinio = Math.sin(s.inclo);
  const po = ao * omeosq;
  const con42 = 1 - 5 * cosio2;
  s.con41 = -con42 - cosio2 - cosio2;
  const posq = po * po;
  const rp = ao * (1 - s.ecco);
  s.gsto = gstime(epoch + 2433281.5);

  s.a = Math.pow(s.noUnkozai * WGS72.tumin, -2 / 3);

  if (omeosq >= 0 || s.noUnkozai >= 0) {
    s.isimp = 0;
    if (rp < 220 / radiusearthkm + 1) s.isimp = 1;
    let sfour = ss;
    let qzms24 = qzms2t;
    const perige = (rp - 1) * radiusearthkm;
    // For perigees below 156 km, s and qoms2t are altered.
    if (perige < 156) {
      sfour = perige - 78;
      if (perige < 98) sfour = 20;
      const qzms24temp = (120 - sfour) / radiusearthkm;
      qzms24 = qzms24temp * qzms24temp * qzms24temp * qzms24temp;
      sfour = sfour / radiusearthkm + 1;
    }
    const pinvsq = 1 / posq;
    const tsi = 1 / (ao - sfour);
    s.eta = ao * s.ecco * tsi;
    const etasq = s.eta * s.eta;
    const eeta = s.ecco * s.eta;
    const psisq = Math.abs(1 - etasq);
    const coef = qzms24 * Math.pow(tsi, 4);
    const coef1 = coef / Math.pow(psisq, 3.5);
    const cc2 =
      coef1 * s.noUnkozai *
      (ao * (1 + 1.5 * etasq + eeta * (4 + etasq)) + ((0.375 * j2 * tsi) / psisq) * s.con41 * (8 + 3 * etasq * (8 + etasq)));
    s.cc1 = s.bstar * cc2;
    let cc3 = 0;
    if (s.ecco > 1e-4) cc3 = (-2 * coef * tsi * j3oj2 * s.noUnkozai * sinio) / s.ecco;
    s.x1mth2 = 1 - cosio2;
    s.cc4 =
      2 * s.noUnkozai * coef1 * ao * omeosq *
      (s.eta * (2 + 0.5 * etasq) + s.ecco * (0.5 + 2 * etasq) -
        ((j2 * tsi) / (ao * psisq)) *
          (-3 * s.con41 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta)) +
            0.75 * s.x1mth2 * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * s.argpo)));
    s.cc5 = 2 * coef1 * ao * omeosq * (1 + 2.75 * (etasq + eeta) + eeta * etasq);
    const cosio4 = cosio2 * cosio2;
    const temp1 = 1.5 * j2 * pinvsq * s.noUnkozai;
    const temp2 = 0.5 * temp1 * j2 * pinvsq;
    const temp3 = -0.46875 * j4 * pinvsq * pinvsq * s.noUnkozai;
    s.mdot = s.noUnkozai + 0.5 * temp1 * rteosq * s.con41 + 0.0625 * temp2 * rteosq * (13 - 78 * cosio2 + 137 * cosio4);
    s.argpdot = -0.5 * temp1 * con42 + 0.0625 * temp2 * (7 - 114 * cosio2 + 395 * cosio4) + temp3 * (3 - 36 * cosio2 + 49 * cosio4);
    const xhdot1 = -temp1 * cosio;
    s.nodedot = xhdot1 + (0.5 * temp2 * (4 - 19 * cosio2) + 2 * temp3 * (3 - 7 * cosio2)) * cosio;
    const xpidot = s.argpdot + s.nodedot;
    s.omgcof = s.bstar * cc3 * Math.cos(s.argpo);
    s.xmcof = 0;
    if (s.ecco > 1e-4) s.xmcof = (-X2O3 * coef * s.bstar) / eeta;
    s.nodecf = 3.5 * omeosq * xhdot1 * s.cc1;
    s.t2cof = 1.5 * s.cc1;
    // Divide-by-zero guard at an inclination of 180°.
    if (Math.abs(cosio + 1) > 1.5e-12) s.xlcof = (-0.25 * j3oj2 * sinio * (3 + 5 * cosio)) / (1 + cosio);
    else s.xlcof = (-0.25 * j3oj2 * sinio * (3 + 5 * cosio)) / temp4;
    s.aycof = -0.5 * j3oj2 * sinio;
    const delmotemp = 1 + s.eta * Math.cos(s.mo);
    s.delmo = delmotemp * delmotemp * delmotemp;
    s.sinmao = Math.sin(s.mo);
    s.x7thm1 = 7 * cosio2 - 1;

    // Deep space: periods of 225 minutes or more.
    if (TWO_PI / s.noUnkozai >= 225) {
      s.method = 'd';
      s.isimp = 1;
      const tc = 0;
      const inclm = s.inclo;
      const c = dscom(epoch, s.ecco, s.argpo, tc, s.inclo, s.nodeo, s.noUnkozai, s);
      dp.ep = s.ecco;
      dp.inclp = s.inclo;
      dp.nodep = s.nodeo;
      dp.argpp = s.argpo;
      dp.mp = s.mo;
      dpper(s, true);
      s.ecco = dp.ep;
      s.inclo = dp.inclp;
      s.nodeo = dp.nodep;
      s.argpo = dp.argpp;
      s.mo = dp.mp;
      dsinit(s, c, s.t, tc, xpidot, eccsq, c.em, 0, inclm, 0, c.nm, 0);
    }

    if (s.isimp !== 1) {
      const cc1sq = s.cc1 * s.cc1;
      s.d2 = 4 * ao * tsi * cc1sq;
      const temp = (s.d2 * tsi * s.cc1) / 3;
      s.d3 = (17 * ao + sfour) * temp;
      s.d4 = 0.5 * temp * ao * tsi * (221 * ao + 31 * sfour) * s.cc1;
      s.t3cof = s.d2 + 2 * cc1sq;
      s.t4cof = 0.25 * (3 * s.d3 + s.cc1 * (12 * s.d2 + 10 * cc1sq));
      s.t5cof = 0.2 * (3 * s.d4 + 12 * s.cc1 * s.d3 + 6 * s.d2 * s.d2 + 15 * cc1sq * (2 * s.d2 + cc1sq));
    }
  }
  const r = new Float64Array(3);
  const v = new Float64Array(3);
  propagate(s, 0, r, v);
  return s;
}

// ─── Propagation ──────────────────────────────────────────────────────────────────────────

/** SGP4's mean elements at a moment: the secular and lunar-solar terms applied, the periodics not. */
export interface MeanElements {
  /** Semi-major axis, Earth radii (WGS-72). */
  am: number;
  /** Mean motion, rad/min. */
  nm: number;
  ecc: number;
  incl: number;
  node: number;
  argp: number;
  /** Mean anomaly, rad. */
  m: number;
}

/**
 * The mean elements at `tsince` minutes after the epoch: everything SGP4 does before its J3 long-period and J2
 * short-period terms (secular gravity, drag, and for deep-space orbits the lunar-solar and resonance terms). A
 * Kepler ellipse on them is within a few km of SGP4's position in low orbit (the short-period terms' size), which
 * is what the satellite swarm draws on the GPU. Returns 0 or an error code; does not allocate.
 */
export function meanElements(s: SatRec, tsince: number, out: MeanElements): number {
  const temp4 = 1.5e-12;
  const { xke, j3oj2 } = WGS72;
  s.t = tsince;
  s.error = 0;

  // Secular gravity and atmospheric drag.
  const xmdf = s.mo + s.mdot * s.t;
  const argpdf = s.argpo + s.argpdot * s.t;
  const nodedf = s.nodeo + s.nodedot * s.t;
  let argpm = argpdf;
  let mm = xmdf;
  const t2 = s.t * s.t;
  let nodem = nodedf + s.nodecf * t2;
  let tempa = 1 - s.cc1 * s.t;
  let tempe = s.bstar * s.cc4 * s.t;
  let templ = s.t2cof * t2;

  if (s.isimp !== 1) {
    const delomg = s.omgcof * s.t;
    const delmtemp = 1 + s.eta * Math.cos(xmdf);
    const delm = s.xmcof * (delmtemp * delmtemp * delmtemp - s.delmo);
    const temp = delomg + delm;
    mm = xmdf + temp;
    argpm = argpdf - temp;
    const t3 = t2 * s.t;
    const t4 = t3 * s.t;
    tempa = tempa - s.d2 * t2 - s.d3 * t3 - s.d4 * t4;
    tempe += s.bstar * s.cc5 * (Math.sin(mm) - s.sinmao);
    templ = templ + s.t3cof * t3 + t4 * (s.t4cof + s.t * s.t5cof);
  }

  let nm = s.noUnkozai;
  let em = s.ecco;
  let inclm = s.inclo;
  if (s.method === 'd') {
    dsp.em = em;
    dsp.argpm = argpm;
    dsp.inclm = inclm;
    dsp.mm = mm;
    dsp.nodem = nodem;
    dsp.nm = nm;
    dspace(s, s.t, s.t);
    em = dsp.em;
    argpm = dsp.argpm;
    inclm = dsp.inclm;
    mm = dsp.mm;
    nodem = dsp.nodem;
    nm = dsp.nm;
  }

  if (nm <= 0) return (s.error = 2);
  const am = Math.pow(xke / nm, X2O3) * tempa * tempa;
  nm = xke / Math.pow(am, 1.5);
  em -= tempe;
  if (em >= 1 || em < -0.001) return (s.error = 1);
  if (em < 1e-6) em = 1e-6;
  mm += s.noUnkozai * templ;
  let xlm = mm + argpm + nodem;
  nodem %= TWO_PI;
  argpm %= TWO_PI;
  xlm %= TWO_PI;
  mm = (xlm - argpm - nodem) % TWO_PI;

  // Lunar-solar periodics.
  let ep = em;
  let xincp = inclm;
  let argpp = argpm;
  let nodep = nodem;
  let mp = mm;
  if (s.method === 'd') {
    dp.ep = ep;
    dp.inclp = xincp;
    dp.nodep = nodep;
    dp.argpp = argpp;
    dp.mp = mp;
    dpper(s, false);
    ep = dp.ep;
    xincp = dp.inclp;
    nodep = dp.nodep;
    argpp = dp.argpp;
    mp = dp.mp;
    if (xincp < 0) {
      xincp = -xincp;
      nodep += Math.PI;
      argpp -= Math.PI;
    }
    if (ep < 0 || ep > 1) return (s.error = 3);
    const sinip = Math.sin(xincp);
    const cosip = Math.cos(xincp);
    s.aycof = -0.5 * j3oj2 * sinip;
    if (Math.abs(cosip + 1) > 1.5e-12) s.xlcof = (-0.25 * j3oj2 * sinip * (3 + 5 * cosip)) / (1 + cosip);
    else s.xlcof = (-0.25 * j3oj2 * sinip * (3 + 5 * cosip)) / temp4;
  }
  out.am = am;
  out.nm = nm;
  out.ecc = ep;
  out.incl = xincp;
  out.node = nodep;
  out.argp = argpp;
  out.m = mp;
  return 0;
}

const me: MeanElements = { am: 0, nm: 0, ecc: 0, incl: 0, node: 0, argp: 0, m: 0 };

/**
 * Position (km) and velocity (km/s) in TEME at `tsince` minutes after the epoch, written into `r`
 * and `v`. Returns 0, or an error code (`SGP4_ERRORS`); on 1–4 `r` and `v` are left untouched,
 * on 6 (decayed) they are written. Does not allocate.
 */
export function propagate(s: SatRec, tsince: number, r: Float64Array | number[], v: Float64Array | number[]): number {
  const { radiusearthkm, xke, j2 } = WGS72;
  const vkmpersec = (radiusearthkm * xke) / 60;
  const err = meanElements(s, tsince, me);
  if (err) return err;
  const { am, nm, ecc: ep, incl: xincp, node: nodep, argp: argpp, m: mp } = me;
  const sinip = Math.sin(xincp);
  const cosip = Math.cos(xincp);

  // Long-period periodics.
  const axnl = ep * Math.cos(argpp);
  let temp = 1 / (am * (1 - ep * ep));
  const aynl = ep * Math.sin(argpp) + temp * s.aycof;
  const xl = mp + argpp + nodep + temp * s.xlcof * axnl;

  // Kepler's equation.
  const u = (xl - nodep) % TWO_PI;
  let eo1 = u;
  let tem5 = 9999.9;
  let ktr = 1;
  let sineo1 = 0;
  let coseo1 = 0;
  while (Math.abs(tem5) >= 1e-12 && ktr <= 10) {
    sineo1 = Math.sin(eo1);
    coseo1 = Math.cos(eo1);
    tem5 = 1 - coseo1 * axnl - sineo1 * aynl;
    tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / tem5;
    if (Math.abs(tem5) >= 0.95) tem5 = tem5 > 0 ? 0.95 : -0.95;
    eo1 += tem5;
    ktr++;
  }

  // Short-period periodics.
  const ecose = axnl * coseo1 + aynl * sineo1;
  const esine = axnl * sineo1 - aynl * coseo1;
  const el2 = axnl * axnl + aynl * aynl;
  const pl = am * (1 - el2);
  if (pl < 0) return (s.error = 4);
  const rl = am * (1 - ecose);
  const rdotl = (Math.sqrt(am) * esine) / rl;
  const rvdotl = Math.sqrt(pl) / rl;
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
  if (s.method === 'd') {
    const cosisq = cosip * cosip;
    s.con41 = 3 * cosisq - 1;
    s.x1mth2 = 1 - cosisq;
    s.x7thm1 = 7 * cosisq - 1;
  }
  const mrt = rl * (1 - 1.5 * temp2 * betal * s.con41) + 0.5 * temp1 * s.x1mth2 * cos2u;
  su -= 0.25 * temp2 * s.x7thm1 * sin2u;
  const xnode = nodep + 1.5 * temp2 * cosip * sin2u;
  const xinc = xincp + 1.5 * temp2 * cosip * sinip * cos2u;
  const mvt = rdotl - (nm * temp1 * s.x1mth2 * sin2u) / xke;
  const rvdot = rvdotl + (nm * temp1 * (s.x1mth2 * cos2u + 1.5 * s.con41)) / xke;

  // Orientation vectors.
  const sinsu = Math.sin(su);
  const cossu = Math.cos(su);
  const snod = Math.sin(xnode);
  const cnod = Math.cos(xnode);
  const sini = Math.sin(xinc);
  const cosi = Math.cos(xinc);
  const xmx = -snod * cosi;
  const xmy = cnod * cosi;
  const ux = xmx * sinsu + cnod * cossu;
  const uy = xmy * sinsu + snod * cossu;
  const uz = sini * sinsu;
  const vx = xmx * cossu - cnod * sinsu;
  const vy = xmy * cossu - snod * sinsu;
  const vz = sini * cossu;

  const mr = mrt * radiusearthkm;
  r[0] = mr * ux;
  r[1] = mr * uy;
  r[2] = mr * uz;
  v[0] = (mvt * ux + rvdot * vx) * vkmpersec;
  v[1] = (mvt * uy + rvdot * vy) * vkmpersec;
  v[2] = (mvt * uz + rvdot * vz) * vkmpersec;
  if (mrt < 1) return (s.error = 6);
  return 0;
}

/** Parses a classic two-line element set (used by the tests; the app reads OMM CSV). */
export function parseTle(line1: string, line2: string): GpElements & { satnum: string } {
  const twoDigitYear = parseInt(line1.slice(18, 20), 10);
  const epochDays = parseFloat(line1.slice(20, 32));
  const year = twoDigitYear < 57 ? twoDigitYear + 2000 : twoDigitYear + 1900;
  // JD of 0 January of `year`, 0h, plus the day of year.
  const jan1 = Date.UTC(year, 0, 1) / 86400000 + 2440587.5;
  const epochJd = jan1 - 1 + epochDays;
  // "Assumed decimal point" fields: a sign column, five digits, then a signed exponent.
  const expo = (sign: string, digits: string, exp: string) =>
    parseFloat(`${sign.trim()}.${digits.replace(/ /g, '0')}`) * Math.pow(10, parseInt(exp, 10));
  return {
    satnum: line1.slice(2, 7).trim(),
    epochJd,
    meanMotionDot: parseFloat(line1.slice(33, 43)),
    meanMotionDdot: expo(line1[44], line1.slice(45, 50), line1.slice(50, 52)),
    bstar: expo(line1[53], line1.slice(54, 59), line1.slice(59, 61)),
    inclinationDeg: parseFloat(line2.slice(8, 16)),
    raanDeg: parseFloat(line2.slice(17, 25)),
    eccentricity: parseFloat(`0.${line2.slice(26, 33).replace(/ /g, '0')}`),
    argPericentreDeg: parseFloat(line2.slice(34, 42)),
    meanAnomalyDeg: parseFloat(line2.slice(43, 51)),
    meanMotion: parseFloat(line2.slice(52, 63)),
  };
}
