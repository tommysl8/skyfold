// Builds public/data/galaxy-particles.bin.gz: a particle rendering of the parametric Milky Way model.
//
// Input : src/sim/galaxy/model.json (or the path given as the first argument). Every parameter and its
//         source is documented there and in docs/data/galaxy.md.
// Output: public/data/galaxy-particles.bin.gz (gzip of the binary below; decode in the browser with
//         DecompressionStream('gzip'), because Vercel does not compress application/octet-stream).
//
// Binary layout, little-endian:
//   Header, 64 bytes
//     0  char[4]  magic "LSGP"
//     4  uint32   version (1)
//     8  uint32   particle count N
//    12  uint32   record stride in bytes (12)
//    16  float32  position scale: kpc per int16 unit (0.002)
//    20  float32  luminosity unit: L_sun(V) for code 0
//    24  float32  size unit: pc for code 0
//    28  float32  R0 used (kpc)
//    32  float32  z0 used (kpc)
//    36  uint32   random seed
//    40  uint32   flags (bit 0 set: positions are heliocentric galactic Cartesian)
//    44  uint32   number of populations P (10)
//    48  16 bytes reserved (zero)
//   Records, 12 bytes each, globally shuffled so that any prefix is an unbiased subsample:
//     0  int16 x, int16 y, int16 z   heliocentric galactic Cartesian, x -> (l=0,b=0), y -> (l=90,b=0),
//                                     z -> north galactic pole; kpc = value * positionScale
//     6  uint8 r, g, b               linear sRGB colour, largest channel = 255
//     9  uint8 population            see POPULATIONS below
//    10  uint8 luminosity code       L = lumUnit * 2^(code/8)   [L_sun, V band]
//    11  uint8 size code             h = sizeUnit * 2^(code/16) [pc]; Gaussian splat radius (1 sigma)
//
// The model is a model: positions are random draws from smooth density laws, not real stars.
// Deterministic: a fixed seed and a seeded generator (xoshiro128**), so reruns give identical bytes.
//
// Run: node scripts/build-galaxy.mjs [path/to/model.json]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEG = Math.PI / 180;

export const SEED = 20260925;
export const POS_SCALE = 0.002; // kpc per int16 unit -> +-65.5 kpc range, 2 pc resolution
export const LUM_UNIT = 1.0; // L_sun
export const SIZE_UNIT = 1.0; // pc

export const POPULATIONS = [
  'thinDisc', // 0
  'youngArmStars', // 1
  'hiiRegions', // 2
  'thickDisc', // 3
  'bulge', // 4
  'barThin', // 5
  'barSuperThin', // 6
  'nuclearStellarDisc', // 7
  'nuclearStarCluster', // 8
  'stellarHalo', // 9
];

export const COUNTS = {
  thinDisc: 80000,
  youngArmStars: 50000,
  hiiRegions: 3500,
  thickDisc: 15000,
  bulge: 24000,
  barThin: 8000,
  barSuperThin: 6000,
  nuclearStellarDisc: 2500,
  nuclearStarCluster: 500,
  stellarHalo: 10000,
};

// ---------------------------------------------------------------------------------------------
// Random numbers: xoshiro128** seeded through splitmix32.
export function makeRng(seed) {
  let s = seed >>> 0;
  const split = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = split(), b = split(), c = split(), d = split();
  const next = () => {
    const t = b << 9;
    let r = Math.imul(b, 5);
    r = Math.imul((r << 7) | (r >>> 25), 9);
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t;
    d = (d << 11) | (d >>> 21);
    return (r >>> 0) / 4294967296;
  };
  let spare = null;
  return {
    uniform: () => next(),
    range: (lo, hi) => lo + (hi - lo) * next(),
    normal: () => {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u = 0, v = 0, q = 0;
      do { u = 2 * next() - 1; v = 2 * next() - 1; q = u * u + v * v; } while (q >= 1 || q === 0);
      const f = Math.sqrt((-2 * Math.log(q)) / q);
      spare = v * f;
      return u * f;
    },
    laplace: (h) => { const u = next() - 0.5; return -h * Math.sign(u) * Math.log(1 - 2 * Math.abs(u)); },
    exponential: (h) => -h * Math.log(1 - next()),
  };
}

// ---------------------------------------------------------------------------------------------
// Model geometry shared with src/sim/galaxy/model.ts (keep the two in step).
export function loadModel(path = resolve(ROOT, 'src/sim/galaxy/model.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const v = (p) => (p && typeof p === 'object' && 'value' in p ? p.value : p);

/** Spiral arms in model units (radii scaled from Reid et al.'s R0 = 8.15 kpc to the model R0). */
export function prepareArms(model) {
  const sa = model.components.spiralArms;
  const R0 = v(model.sun.R0);
  const k = R0 / sa.R0source;
  const ext = sa.extension;
  return sa.arms.map((a) => {
    const arm = {
      id: a.id,
      name: a.name,
      betaKink: a.betaKink,
      Rkink: a.Rkink * k,
      tanLt: Math.tan(a.psiLt * DEG),
      tanGt: Math.tan(a.psiGt * DEG),
      psiLt: a.psiLt,
      psiGt: a.psiGt,
      width: a.width * k,
      dwdR: v(sa.dwdR),
      betaData: a.betaData,
    };
    const is3 = a.id === '3kpc';
    const dMax = is3 ? ext.maxDeltaBeta3kpc : ext.maxDeltaBeta;
    const Rmin = is3 ? ext.Rmin3kpc : ext.Rmin;
    const Rmax = ext.Rmax;
    // Extension limits: step outwards from each data edge until the radius or azimuth limit.
    const limit = (dir) => {
      const edge = dir > 0 ? a.betaData[1] : a.betaData[0];
      let b = edge;
      for (let i = 0; i < dMax * 10; i++) {
        const nb = b + dir * 0.1;
        const R = armRadius(arm, nb);
        if (R < Rmin || R > Rmax) break;
        b = nb;
      }
      return b;
    };
    arm.betaExt = [limit(-1), limit(+1)];
    arm.edgeStrength = ext.edgeStrength;
    return arm;
  });
}

/** Ridge radius (kpc) of an arm at galactocentric azimuth beta (deg). */
export function armRadius(arm, betaDeg) {
  const t = betaDeg <= arm.betaKink ? arm.tanLt : arm.tanGt;
  return arm.Rkink * Math.exp(-(betaDeg - arm.betaKink) * DEG * t);
}

/** Relative strength along the arm: 1 over the parallax data, falling linearly to 0 at the extension ends. */
export function armStrength(arm, betaDeg) {
  const [d0, d1] = arm.betaData;
  const [e0, e1] = arm.betaExt;
  if (betaDeg >= d0 && betaDeg <= d1) return 1;
  if (betaDeg < d0) return betaDeg < e0 || d0 === e0 ? 0 : arm.edgeStrength * ((betaDeg - e0) / (d0 - e0));
  return betaDeg > e1 || d1 === e1 ? 0 : arm.edgeStrength * ((e1 - betaDeg) / (e1 - d1));
}

/** Gaussian 1-sigma width (kpc) of an arm at radius R (kpc). */
export function armWidth(arm, R) {
  return Math.max(0.05, arm.width + arm.dwdR * (R - arm.Rkink));
}

/** Position in frame G of the point at radius R and azimuth beta (deg). */
export function polarToG(R, betaDeg) {
  return [-R * Math.cos(betaDeg * DEG), R * Math.sin(betaDeg * DEG)];
}

/** Galactocentric azimuth beta (deg, 0 towards the Sun, increasing with rotation) of frame-G (x, y). */
export function betaOf(x, y) {
  return Math.atan2(y, -x) / DEG;
}

/** Height (kpc) of the warped midplane at radius R, azimuth beta (Chen et al. 2019). */
export function warpZ(model, R, betaDeg) {
  const w = model.components.warp;
  const s = v(model.sun.R0) / w.R0source;
  const Rs = R / s;
  const Rw = v(w.Rw);
  if (Rs <= Rw) return 0;
  return s * v(w.a) * Math.pow(Rs - Rw, v(w.b)) * Math.sin((betaDeg - v(w.betaW)) * DEG);
}

// ---------------------------------------------------------------------------------------------
// Colour: B-V -> Teff (Ballesteros 2012) -> blackbody -> CIE 1931 (Wyman, Sloan & Shirley 2013)
// -> linear sRGB (IEC 61966-2-1 matrix, D65), normalised so the largest channel is 1.
function g(x, mu, s1, s2) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}
export function cie1931(lambdaNm) {
  const l = lambdaNm * 10; // Wyman et al. use angstroms
  const X = 1.056 * g(l, 5998, 379, 310) + 0.362 * g(l, 4420, 160, 267) - 0.065 * g(l, 5011, 204, 262);
  const Y = 0.821 * g(l, 5688, 469, 405) + 0.286 * g(l, 5309, 163, 311);
  const Z = 1.217 * g(l, 4370, 118, 360) + 0.681 * g(l, 4590, 260, 138);
  return [X, Y, Z];
}
function xyzToLinearSrgb([X, Y, Z]) {
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ];
}
function normalise(rgb) {
  const c = rgb.map((x) => Math.max(0, x));
  const m = Math.max(...c);
  return m > 0 ? c.map((x) => x / m) : [1, 1, 1];
}
export function bvToTeff(bv) {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}
export function blackbodyRgb(T) {
  const h = 6.62607015e-34, c = 2.99792458e8, kB = 1.380649e-23;
  let X = 0, Y = 0, Z = 0;
  for (let nm = 380; nm <= 780; nm += 2) {
    const lam = nm * 1e-9;
    const B = 1 / (Math.pow(lam, 5) * (Math.exp((h * c) / (lam * kB * T)) - 1));
    const [x, y, z] = cie1931(nm);
    X += B * x; Y += B * y; Z += B * z;
  }
  return normalise(xyzToLinearSrgb([X, Y, Z]));
}
export function emissionLineRgb(ratios) {
  const lines = [
    [656.28, ratios.Halpha], [658.35, ratios.NII6583], [486.13, ratios.Hbeta],
    [500.68, ratios.OIII5007], [434.05, ratios.Hgamma], [672.0, ratios.SII6716_31],
  ];
  let X = 0, Y = 0, Z = 0;
  for (const [nm, f] of lines) { const [x, y, z] = cie1931(nm); X += f * x; Y += f * y; Z += f * z; }
  return normalise(xyzToLinearSrgb([X, Y, Z]));
}

// ---------------------------------------------------------------------------------------------
// Samplers. Each returns positions in frame G (kpc) as a Float64Array of 3N.

function sampleExpDisc(model, comp, n, rng) {
  const hR = v(comp.hR), hz = v(comp.hz), Rmax = v(comp.Rmax);
  const out = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    let R;
    do { R = rng.exponential(hR) + rng.exponential(hR); } while (R > Rmax); // Gamma(2, hR) = R e^{-R/hR}
    const beta = rng.range(-180, 180);
    const [x, y] = polarToG(R, beta);
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = warpZ(model, R, beta) + rng.laplace(hz);
  }
  return out;
}

function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}

/** Rotate bar-frame (x along major axis, near end at positive longitude) into frame G. */
function barToG(xb, yb, angleDeg) {
  // Major axis unit vector pointing at the near end: (-cos a, sin a) in G.
  const c = Math.cos(angleDeg * DEG), s = Math.sin(angleDeg * DEG);
  const ux = -c, uy = s; // major
  const vx = -s, vy = -c; // intermediate (right-handed with z up)
  return [xb * ux + yb * vx, xb * uy + yb * vy];
}

export function bulgeDensity(model, xb, yb, zb) {
  const b = model.components.bulge;
  const hz = interp(b.hzProfile.x, b.hzProfile.hz, Math.abs(xb));
  return Math.exp(-Math.hypot(xb / v(b.hx), yb / v(b.hy))) * Math.exp(-Math.abs(zb) / hz);
}

function sampleBulge(model, n, rng) {
  const b = model.components.bulge;
  const hx = v(b.hx), hy = v(b.hy), hzMax = Math.max(...b.hzProfile.hz);
  const [bx, by, bz] = b.sampleBox;
  const out = new Float64Array(3 * n);
  let i = 0;
  while (i < n) {
    const xb = rng.laplace(hx * Math.SQRT2), yb = rng.laplace(hy * Math.SQRT2), zb = rng.laplace(hzMax);
    if (Math.abs(xb) > bx || Math.abs(yb) > by || Math.abs(zb) > bz) continue;
    const hz = interp(b.hzProfile.x, b.hzProfile.hz, Math.abs(xb));
    const acc = Math.exp(-Math.hypot(xb / hx, yb / hy) + (Math.abs(xb) / hx + Math.abs(yb) / hy) / Math.SQRT2)
      * Math.exp(-Math.abs(zb) * (1 / hz - 1 / hzMax));
    if (rng.uniform() > acc) continue;
    const [x, y] = barToG(xb, yb, v(b.barAngle));
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = zb; i++;
  }
  return out;
}

const cut = (u) => (u > 0 ? Math.exp(-u * u) : 1);

export function barDensity(p, xb, yb, zb) {
  const x0 = v(p.x0), y0 = v(p.y0), c = v(p.cPerp);
  let s;
  if (x0 > 0) s = Math.pow(Math.pow(Math.abs(xb) / x0, c) + Math.pow(Math.abs(yb) / y0, c), 1 / c);
  else s = Math.abs(yb) / y0 - Math.abs(xb) / Math.abs(x0);
  const R = Math.hypot(xb, yb);
  return Math.exp(-s) * Math.exp(-Math.abs(zb) / v(p.z0)) * cut((R - v(p.Rout)) / v(p.sOut)) * cut((v(p.Rin) - R) / v(p.sIn));
}

export function sampleBar(model, p, n, rng) {
  const [bx, by] = model.components.longBar.sampleBox;
  // Envelope: grid maximum of the in-plane density.
  let fmax = 0;
  for (let x = -bx; x <= bx; x += 0.02) for (let y = -by; y <= by; y += 0.02) fmax = Math.max(fmax, barDensity(p, x, y, 0));
  fmax *= 1.05;
  const out = new Float64Array(3 * n);
  let i = 0;
  while (i < n) {
    const xb = rng.range(-bx, bx), yb = rng.range(-by, by);
    if (rng.uniform() * fmax > barDensity(p, xb, yb, 0)) continue;
    const zb = rng.laplace(v(p.z0));
    const [x, y] = barToG(xb, yb, v(p.barAngle));
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = zb; i++;
  }
  return out;
}

/** Inverse-CDF sampler for a 1D density f on [a, b] tabulated on a log grid. */
function makeInverseCdf(f, a, b, steps = 4000) {
  const xs = new Float64Array(steps + 1), cdf = new Float64Array(steps + 1);
  const la = Math.log(a), lb = Math.log(b);
  for (let i = 0; i <= steps; i++) xs[i] = Math.exp(la + ((lb - la) * i) / steps);
  for (let i = 1; i <= steps; i++) {
    const xm = 0.5 * (xs[i] + xs[i - 1]);
    cdf[i] = cdf[i - 1] + f(xm) * (xs[i] - xs[i - 1]);
  }
  const tot = cdf[steps];
  return (u) => {
    const t = u * tot;
    let lo = 0, hi = steps;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cdf[m] < t) lo = m; else hi = m; }
    const w = (t - cdf[lo]) / Math.max(1e-300, cdf[hi] - cdf[lo]);
    return xs[lo] + w * (xs[hi] - xs[lo]);
  };
}

function sampleNSD(model, n, rng) {
  const c = model.components.nuclearStellarDisc;
  const rb = v(c.rb), Re = v(c.Redge);
  const rho = (R) => (R < rb ? Math.pow(R / rb, -1.3) : R < Re ? Math.pow(R / rb, -3) : 0);
  const inv = makeInverseCdf((R) => rho(R) * R, v(c.Rmin), Re);
  const out = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const R = inv(rng.uniform()), beta = rng.range(-180, 180);
    const [x, y] = polarToG(R, beta);
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = rng.laplace(v(c.hz));
  }
  return out;
}

function sampleNSC(model, n, rng) {
  const c = model.components.nuclearStarCluster;
  const a = v(c.rh) / 1.305, q = v(c.q), rmax = v(c.rmax);
  const out = new Float64Array(3 * n);
  let i = 0;
  while (i < n) {
    const u = rng.uniform();
    const r = a / Math.sqrt(Math.pow(u, -2 / 3) - 1);
    if (!(r < rmax)) continue;
    const cz = rng.range(-1, 1), ph = rng.range(0, 2 * Math.PI), sz = Math.sqrt(1 - cz * cz);
    out[3 * i] = r * sz * Math.cos(ph); out[3 * i + 1] = r * sz * Math.sin(ph); out[3 * i + 2] = r * cz * q; i++;
  }
  return out;
}

export function haloQ(model, m) {
  const h = model.components.stellarHalo;
  const t = Math.min(1, Math.max(0, (m - 15) / 20));
  const s = t * t * (3 - 2 * t);
  return v(h.qIn) + (v(h.qOut) - v(h.qIn)) * s;
}

function sampleHalo(model, n, rng) {
  const h = model.components.stellarHalo;
  const rs = v(h.rs), slopeIn = v(h.alphaIn), slopeOut = v(h.alphaOut);
  const [m0, m1] = h.mRange.value;
  const inv = makeInverseCdf((m) => (m < rs ? Math.pow(m / rs, -slopeIn) : Math.pow(m / rs, -slopeOut)) * m * m, m0, m1);
  const out = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const m = inv(rng.uniform());
    const cz = rng.range(-1, 1), ph = rng.range(0, 2 * Math.PI), sz = Math.sqrt(1 - cz * cz);
    out[3 * i] = m * sz * Math.cos(ph); out[3 * i + 1] = m * sz * Math.sin(ph); out[3 * i + 2] = m * cz * haloQ(model, m);
  }
  return out;
}

/** Weighted table of arm azimuth samples: weight = strength x thin-disc surface density x arc length. */
function armTable(model, arms) {
  const hR = v(model.components.thinDisc.hR);
  const rows = [];
  let tot = 0;
  const dB = 0.1;
  const Rmin = v(model.components.youngArmStars.Rmin);
  for (const arm of arms) {
    for (let b = arm.betaExt[0]; b <= arm.betaExt[1]; b += dB) {
      const R = armRadius(arm, b);
      if (R < Rmin) continue;
      const psi = (b <= arm.betaKink ? arm.psiLt : arm.psiGt) * DEG;
      const w = armStrength(arm, b) * Math.exp(-R / hR) * (R / Math.cos(psi)) * dB * DEG;
      if (w <= 0) continue;
      tot += w;
      rows.push({ arm, b, cum: tot });
    }
  }
  return { rows, tot, dB };
}

function pickArmPoint(model, table, rng) {
  const t = rng.uniform() * table.tot;
  let lo = 0, hi = table.rows.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (table.rows[m].cum < t) lo = m + 1; else hi = m; }
  const { arm } = table.rows[lo];
  const b = table.rows[lo].b + rng.range(-0.5, 0.5) * table.dB;
  const R = armRadius(arm, b);
  const [x, y] = polarToG(R, b);
  // In-plane normal of the ridge (numerical tangent).
  const [x2, y2] = polarToG(armRadius(arm, b + 0.01), b + 0.01);
  let tx = x2 - x, ty = y2 - y;
  const tl = Math.hypot(tx, ty);
  tx /= tl; ty /= tl;
  return { arm, b, R, x, y, nx: -ty, ny: tx };
}

export function sampleArms(model, arms, n, rng, hz, clumpFrac, clumpSize, clumpSigma) {
  const table = armTable(model, arms);
  const out = new Float64Array(3 * n);
  let i = 0;
  while (i < n) {
    const p = pickArmPoint(model, table, rng);
    const off = rng.normal() * armWidth(p.arm, p.R);
    const cx = p.x + off * p.nx, cy = p.y + off * p.ny;
    const R = Math.hypot(cx, cy), beta = betaOf(cx, cy);
    const cz = warpZ(model, R, beta) + rng.laplace(hz);
    const members = rng.uniform() < clumpFrac ? clumpSize : 1;
    for (let k = 0; k < members && i < n; k++) {
      const s = members > 1 ? clumpSigma : 0;
      out[3 * i] = cx + s * rng.normal(); out[3 * i + 1] = cy + s * rng.normal(); out[3 * i + 2] = cz + s * 0.5 * rng.normal();
      i++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// k-nearest-neighbour smoothing lengths (a small static kd-tree).
export function knnRadius(pos, n, k) {
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const nodes = []; // [lo, hi, axis, split, left, right]
  const build = (lo, hi, depth) => {
    const id = nodes.length;
    nodes.push(null);
    if (hi - lo <= 16) { nodes[id] = { lo, hi, leaf: true }; return id; }
    const axis = depth % 3;
    const sub = Array.from(idx.subarray(lo, hi)).sort((a, b) => pos[3 * a + axis] - pos[3 * b + axis]);
    idx.set(sub, lo);
    const mid = (lo + hi) >> 1;
    const split = pos[3 * idx[mid] + axis];
    const left = build(lo, mid, depth + 1);
    const right = build(mid, hi, depth + 1);
    nodes[id] = { lo, hi, leaf: false, axis, split, left, right };
    return id;
  };
  build(0, n, 0);
  const out = new Float64Array(n);
  const heap = new Float64Array(k + 1);
  for (let q = 0; q < n; q++) {
    const qx = pos[3 * q], qy = pos[3 * q + 1], qz = pos[3 * q + 2];
    let size = 0;
    const worst = () => (size < k ? Infinity : heap[0]);
    const push = (d) => {
      if (size < k) {
        let i = size++; heap[i] = d;
        while (i > 0) { const p = (i - 1) >> 1; if (heap[p] >= heap[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
      } else if (d < heap[0]) {
        heap[0] = d; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < size && heap[l] > heap[m]) m = l;
          if (r < size && heap[r] > heap[m]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
    };
    const visit = (id) => {
      const nd = nodes[id];
      if (nd.leaf) {
        for (let j = nd.lo; j < nd.hi; j++) {
          const p = idx[j];
          if (p === q) continue;
          const dx = pos[3 * p] - qx, dy = pos[3 * p + 1] - qy, dz = pos[3 * p + 2] - qz;
          push(dx * dx + dy * dy + dz * dz);
        }
        return;
      }
      const qv = nd.axis === 0 ? qx : nd.axis === 1 ? qy : qz;
      const d = qv - nd.split;
      const [near, far] = d < 0 ? [nd.left, nd.right] : [nd.right, nd.left];
      visit(near);
      if (d * d < worst()) visit(far);
    };
    visit(0);
    out[q] = Math.sqrt(heap[0]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
export function generate(model, { seed = SEED, counts = COUNTS } = {}) {
  const rng = makeRng(seed);
  const comps = model.components;
  const arms = prepareArms(model);
  const frac = model.luminosity.fractions;
  const LV = v(model.luminosity.totalLV);
  const parts = [];

  const add = (name, pos, extra = {}) => parts.push({ name, pos, n: pos.length / 3, ...extra });

  add('thinDisc', sampleExpDisc(model, comps.thinDisc, counts.thinDisc, rng));
  add('youngArmStars', sampleArms(model, arms, counts.youngArmStars, rng, v(comps.youngArmStars.hz), 0.7, 8, 0.03));
  // HII regions: one sprite each, radius drawn from a log-normal.
  const hiiPos = sampleArms(model, arms, counts.hiiRegions, rng, v(comps.hiiRegions.hz), 0, 1, 0);
  const rp = comps.hiiRegions.radiusPc;
  const hiiR = new Float64Array(counts.hiiRegions);
  for (let i = 0; i < hiiR.length; i++) {
    hiiR[i] = Math.min(rp.clip[1], Math.max(rp.clip[0], rp.median * Math.pow(10, rp.sigmaDex * rng.normal())));
  }
  add('hiiRegions', hiiPos, { sizesPc: hiiR });
  add('thickDisc', sampleExpDisc(model, comps.thickDisc, counts.thickDisc, rng));
  add('bulge', sampleBulge(model, counts.bulge, rng));
  add('barThin', sampleBar(model, comps.longBar.thin, counts.barThin, rng));
  add('barSuperThin', sampleBar(model, comps.longBar.superThin, counts.barSuperThin, rng));
  add('nuclearStellarDisc', sampleNSD(model, counts.nuclearStellarDisc, rng));
  add('nuclearStarCluster', sampleNSC(model, counts.nuclearStarCluster, rng));
  add('stellarHalo', sampleHalo(model, counts.stellarHalo, rng));

  // Colours.
  const bvTable = new Map();
  const bvRgb = (bv) => {
    const key = Math.round(Math.min(2.0, Math.max(-0.4, bv)) * 100);
    if (!bvTable.has(key)) bvTable.set(key, blackbodyRgb(bvToTeff(key / 100)));
    return bvTable.get(key);
  };
  const hiiRgb = emissionLineRgb(comps.hiiRegions.lineRatios);

  // Frame G -> heliocentric galactic.
  const F = model.frames.galactocentric;
  const Rm = F.R, sun = F.sunG;

  const total = parts.reduce((s, p) => s + p.n, 0);
  const rec = new Array(total);
  let clamped = 0;
  let r = 0;
  for (const p of parts) {
    const popId = POPULATIONS.indexOf(p.name);
    const Lcomp = frac[p.name] * LV;
    const h = p.sizesPc ? null : knnRadius(p.pos, p.n, 8);
    let wsum = 0;
    if (p.sizesPc) for (const s of p.sizesPc) wsum += s * s;
    const [bvMu, bvSig] = model.colours.BV[p.name] ?? [0.7, 0];
    for (let i = 0; i < p.n; i++) {
      const gx = p.pos[3 * i] - sun[0], gy = p.pos[3 * i + 1] - sun[1], gz = p.pos[3 * i + 2] - sun[2];
      // x_gal = R^T (x_G - sun)
      const x = Rm[0][0] * gx + Rm[1][0] * gy + Rm[2][0] * gz;
      const y = Rm[0][1] * gx + Rm[1][1] * gy + Rm[2][1] * gz;
      const z = Rm[0][2] * gx + Rm[1][2] * gy + Rm[2][2] * gz;
      const q = [x, y, z].map((c) => {
        const t = Math.round(c / POS_SCALE);
        if (t > 32767 || t < -32767) { clamped++; return Math.max(-32767, Math.min(32767, t)); }
        return t;
      });
      const rgb = p.name === 'hiiRegions' ? hiiRgb : bvRgb(bvMu + bvSig * rng.normal());
      const L = p.sizesPc ? (Lcomp * p.sizesPc[i] * p.sizesPc[i]) / wsum : Lcomp / p.n;
      const sizePc = p.sizesPc ? p.sizesPc[i] : Math.min(3000, Math.max(1, h[i] * 1000));
      rec[r++] = {
        q,
        rgb: rgb.map((c) => Math.round(c * 255)),
        pop: popId,
        lum: Math.max(0, Math.min(255, Math.round(8 * Math.log2(L / LUM_UNIT)))),
        size: Math.max(0, Math.min(255, Math.round(16 * Math.log2(sizePc / SIZE_UNIT)))),
      };
    }
  }
  // Global shuffle (Fisher-Yates) so that any prefix is an unbiased subsample.
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rng.uniform() * (i + 1));
    const t = rec[i]; rec[i] = rec[j]; rec[j] = t;
  }
  return { records: rec, parts, clamped, arms };
}

export function encode(model, records, seed = SEED) {
  const N = records.length;
  const buf = Buffer.alloc(64 + 12 * N);
  buf.write('LSGP', 0, 'ascii');
  buf.writeUInt32LE(1, 4);
  buf.writeUInt32LE(N, 8);
  buf.writeUInt32LE(12, 12);
  buf.writeFloatLE(POS_SCALE, 16);
  buf.writeFloatLE(LUM_UNIT, 20);
  buf.writeFloatLE(SIZE_UNIT, 24);
  buf.writeFloatLE(v(model.sun.R0), 28);
  buf.writeFloatLE(v(model.sun.z0), 32);
  buf.writeUInt32LE(seed >>> 0, 36);
  buf.writeUInt32LE(1, 40);
  buf.writeUInt32LE(POPULATIONS.length, 44);
  let o = 64;
  for (const r of records) {
    buf.writeInt16LE(r.q[0], o); buf.writeInt16LE(r.q[1], o + 2); buf.writeInt16LE(r.q[2], o + 4);
    buf[o + 6] = r.rgb[0]; buf[o + 7] = r.rgb[1]; buf[o + 8] = r.rgb[2];
    buf[o + 9] = r.pop; buf[o + 10] = r.lum; buf[o + 11] = r.size;
    o += 12;
  }
  return buf;
}

/** Decoder (the same logic the app needs, after DecompressionStream). */
export function decode(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'LSGP') throw new Error('bad magic');
  const N = dv.getUint32(8, true), stride = dv.getUint32(12, true);
  const posScale = dv.getFloat32(16, true), lumUnit = dv.getFloat32(20, true), sizeUnit = dv.getFloat32(24, true);
  const pos = new Float32Array(3 * N), col = new Uint8Array(3 * N), pop = new Uint8Array(N);
  const lum = new Float32Array(N), size = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const o = 64 + i * stride;
    pos[3 * i] = dv.getInt16(o, true) * posScale;
    pos[3 * i + 1] = dv.getInt16(o + 2, true) * posScale;
    pos[3 * i + 2] = dv.getInt16(o + 4, true) * posScale;
    col[3 * i] = dv.getUint8(o + 6); col[3 * i + 1] = dv.getUint8(o + 7); col[3 * i + 2] = dv.getUint8(o + 8);
    pop[i] = dv.getUint8(o + 9);
    lum[i] = lumUnit * Math.pow(2, dv.getUint8(o + 10) / 8);
    size[i] = sizeUnit * Math.pow(2, dv.getUint8(o + 11) / 16);
  }
  return { N, pos, col, pop, lum, size, R0: dv.getFloat32(28, true), z0: dv.getFloat32(32, true), seed: dv.getUint32(36, true) };
}

function main() {
  const modelPath = process.argv[2] ? resolve(process.argv[2]) : resolve(ROOT, 'src/sim/galaxy/model.json');
  const model = loadModel(modelPath);
  const t0 = Date.now();
  const { records, parts, clamped, arms } = generate(model);
  const raw = encode(model, records);
  const gz = gzipSync(raw, { level: 9 });
  mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
  writeFileSync(resolve(ROOT, 'public/data/galaxy-particles.bin.gz'), gz);
  for (const p of parts) console.log(`${p.name.padEnd(20)} ${String(p.n).padStart(6)} particles`);
  for (const a of arms) console.log(`arm ${a.id.padEnd(8)} beta data [${a.betaData}] extended [${a.betaExt.map((b) => b.toFixed(1))}]`);
  console.log(`total ${records.length} particles, ${clamped} clamped coordinates`);
  console.log(`galaxy-particles.bin.gz: ${raw.length} bytes raw, ${gz.length} bytes gzipped (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
