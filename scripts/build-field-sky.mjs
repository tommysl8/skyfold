// Builds the "drapery" of the Galaxy's magnetic field over the sky: the direction of the field on the plane of
// the sky, measured from the polarisation of the Milky Way's microwave emission, drawn as a line-integral-
// convolution (LIC) texture: streaks along the field (docs/data/galactic-field.md §3).
//
// Sources (pick one with --source; default wmap):
//   planck  Planck PR3 353 GHz frequency map, HFI_SkyMap_353-psb_2048_R3.01_full.fits (2.0 GB), from the Planck
//           Legacy Archive (https://pla.esac.esa.int; product HFI_SkyMap_353-psb_2048_R3.01_full). HEALPix NESTED,
//           Nside 2048, galactic, I/Q/U in K_CMB, POLCCONV = COSMO. At 353 GHz the polarised light is thermal dust
//           emission: dust grains spin with their long axes across the field, so the light is polarised across
//           the field and the field runs at the polarisation angle plus 90°. Planck Collaboration 2020, A&A 641,
//           A3 (HFI maps) and A12 (Galactic foregrounds). Licence: the ESA archives' terms, CC BY-NC 3.0 IGO
//           ("Credit: ESA, Planck Collaboration"): not shipped with the app (non-commercial; CREDITS.md).
//   wmap    WMAP nine-year K band (23 GHz), smoothed to 1°: wmap_band_smth_iqumap_r9_9yr_K_v5.fits (101 MB) from
//           NASA's LAMBDA (https://lambda.gsfc.nasa.gov/product/map/dr5/maps_band_smth_r9_i_9yr_get.html).
//           HEALPix NESTED, Nside 512, galactic, I/Q/U in mK; no POLCCONV keyword, which means COSMO (as WMAP
//           states for its maps). At 23 GHz the polarised light is synchrotron emission of cosmic-ray electrons
//           gyrating round the field, also polarised across the field; Faraday rotation at 1.3 cm is a degree or
//           two even in the plane. Bennett et al. 2013, ApJS 208, 20. Licence: NASA data, public domain. This is
//           the file the app ships.
//
// Processing (both):
//   1. Each HEALPix pixel's (Q, U) is turned to the IAU convention (U_IAU = −U_COSMO) and written as a tensor
//      in the galactic Cartesian frame, T = Q (n n − e e) + U (n e + e n), with n and e the unit vectors to the
//      north (b increasing) and east (l increasing) there. Tensors, unlike Q and U, do not depend on the local
//      frame, so they can be averaged across pixels and across the poles; the angle and the polarised
//      intensity of an average come back from T in any local frame (Q = (nTn − eTe)/2, U = nTe).
//   2. The tensors (and I) are summed into bins of a 1024 × 512 grid in (l, b) and smoothed with a Gaussian of
//      FWHM `smoothDeg` (separable, its longitude width scaled by 1/cos b; empty bins handled by normalised
//      convolution): Planck's 353 GHz polarisation is noisy at high latitude pixel by pixel; WMAP's map is
//      already 1°.
//   3. The field's direction on the sky is the polarisation's turned by 90°: ψ = ½ atan2(U, Q) from north
//      through east (IAU), the field along −sin ψ n + cos ψ e (a headless direction: polarisation gives the
//      field's orientation, not which way it points).
//   4. LIC: for each output texel, white value noise on the sphere (a 3D lattice of 1.6 texels, hashed;
//      fixed seed) is averaged along the field line through it, ±LIC_HALF_DEG in steps of LIC_STEP_DEG on the
//      sphere with a Hann window: the noise is smeared along the field and stays grainy across it.
//   5. Only the streaks' bright cores are kept: the LIC's excess over its mean, in units of 2.5 σ, clipped to
//      0–1 (the half below the mean is 0, the dark between streaks), times a weight that grows with the
//      polarised intensity on a log scale (between its 5th and 99.5th percentiles, from 0.2 to 1), so the
//      streaks are strongest where the polarised emission is and the noisiest high latitudes stay dim.
//
// Output: public/textures/field-sky-<source>.png, 8-bit greyscale, 2048 × 1024, equirectangular in galactic
// coordinates laid out as the CMB map's (scripts/build-cmb.mjs): the Galactic centre in the middle, l increasing
// to the LEFT; pixel column i, row j (from the top) has centre l = (180 − 360 (i + ½)/W) mod 360, b = 90 −
// 180 (j + ½)/H. Load it as linear data (one channel). And data-raw/field-sky/<source>-preview.png, a quick look.
//
// Input : data-raw/planck/HFI_SkyMap_353-psb_2048_R3.01_full.fits or data-raw/wmap/wmap_band_smth_iqumap_r9_9yr_K_v5.fits
//         (fetched if missing)
// Run   : node scripts/build-field-sky.mjs --source wmap      (about a minute)
//         node scripts/build-field-sky.mjs --source planck    (about five minutes; reads 2 GB)

import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const SOURCES = {
  planck: {
    file: 'data-raw/planck/HFI_SkyMap_353-psb_2048_R3.01_full.fits',
    url: 'http://pla.esac.esa.int/pla/aio/product-action?MAP.MAP_ID=HFI_SkyMap_353-psb_2048_R3.01_full.fits',
    columns: ['I_STOKES', 'Q_STOKES', 'U_STOKES'],
    smoothDeg: 1.0,
  },
  wmap: {
    file: 'data-raw/wmap/wmap_band_smth_iqumap_r9_9yr_K_v5.fits',
    url: 'https://lambda.gsfc.nasa.gov/data/map/dr5/skymaps/9yr/smoothed/wmap_band_smth_iqumap_r9_9yr_K_v5.fits',
    columns: ['TEMPERATURE', 'Q_POLARISATION', 'U_POLARISATION'],
    // On top of the map's own 1°: together about 1.1°.
    smoothDeg: 0.5,
  },
};

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const SOURCE = arg('source', 'wmap');
const SRC = SOURCES[SOURCE];
if (!SRC) throw new Error(`--source must be one of ${Object.keys(SOURCES).join(', ')}`);

const OUT_W = 2048;
const OUT_H = 1024;
const BIN_W = 1024;
const BIN_H = 512;
const LIC_HALF_DEG = 3.5;
const LIC_STEP_DEG = 0.12;
const NOISE_SEED = 0x5eed;
const DEG = Math.PI / 180;

if (!existsSync(SRC.file)) {
  console.log(`fetching ${SRC.url}`);
  const res = await fetch(SRC.url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  mkdirSync(SRC.file.slice(0, SRC.file.lastIndexOf('/')), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(SRC.file));
}

// ─── FITS: a primary HDU with no data, then a BINTABLE ───────────────────────────────────────
const fd = openSync(SRC.file, 'r');
let off = 0;
function header() {
  const cards = {};
  const block = Buffer.alloc(2880);
  for (;;) {
    readSync(fd, block, 0, 2880, off);
    off += 2880;
    for (let k = 0; k < 36; k++) {
      const card = block.toString('latin1', k * 80, k * 80 + 80);
      const key = card.slice(0, 8).trim();
      if (key === 'END') return cards;
      if (card[8] === '=') {
        const v = card.slice(10);
        const q = v.match(/^\s*'([^']*)'/);
        cards[key] = q ? q[1].trim() : v.split('/')[0].trim();
      }
    }
  }
}
header();
const h = header();
if (h.XTENSION !== 'BINTABLE' || h.ORDERING !== 'NESTED') throw new Error('expected a NESTED HEALPix BINTABLE');
const NSIDE = Number(h.NSIDE);
const NPIX = Number(h.NAXIS2);
const ROW = Number(h.NAXIS1);
if (NPIX !== 12 * NSIDE * NSIDE) throw new Error('not a full-sky map');
if ((h.POLCCONV ?? 'COSMO') !== 'COSMO') throw new Error(`unexpected POLCCONV ${h.POLCCONV}`);
if (h.COORDSYS && h.COORDSYS !== 'GALACTIC' && h.COORDSYS !== 'G') throw new Error(`not galactic: ${h.COORDSYS}`);
// Byte offsets of the columns read, within a row.
const widths = { E: 4, J: 4, D: 8, I: 2, B: 1, K: 8 };
const colOffset = {};
{
  let o = 0;
  for (let c = 1; c <= Number(h.TFIELDS); c++) {
    const form = h[`TFORM${c}`];
    const m = form.match(/^(\d*)([A-Z])$/);
    colOffset[h[`TTYPE${c}`]] = { o, type: m[2] };
    o += (m[1] ? Number(m[1]) : 1) * widths[m[2]];
  }
}
for (const c of SRC.columns) if (colOffset[c]?.type !== 'E') throw new Error(`column ${c} missing or not float32`);
const [cI, cQ, cU] = SRC.columns.map((c) => colOffset[c].o);
console.log(`${SOURCE}: Nside ${NSIDE}, ${NPIX} pixels, ${(statSync(SRC.file).size / 1e6).toFixed(0)} MB`);

// ─── HEALPix NESTED pixel centres (Górski et al. 2005, ApJ 622, 759) ───────────────────────
const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];
/** The even bits of v, packed (the inverse of interleaving with zeros). */
function compress(v) {
  v &= 0x55555555;
  v = (v | (v >>> 1)) & 0x33333333;
  v = (v | (v >>> 2)) & 0x0f0f0f0f;
  v = (v | (v >>> 4)) & 0x00ff00ff;
  v = (v | (v >>> 8)) & 0x0000ffff;
  return v;
}
/** z = cos θ and φ of the centre of NESTED pixel p, into out[0], out[1]. */
function pix2zphi(p, out) {
  const npface = NSIDE * NSIDE;
  const face = Math.floor(p / npface);
  const ipf = p - face * npface;
  const ix = compress(ipf);
  const iy = compress(ipf >>> 1);
  const jr = JRLL[face] * NSIDE - ix - iy - 1;
  let nr;
  let z;
  let kshift;
  if (jr < NSIDE) {
    nr = jr;
    z = 1 - (nr * nr) / (3 * npface);
    kshift = 0;
  } else if (jr > 3 * NSIDE) {
    nr = 4 * NSIDE - jr;
    z = (nr * nr) / (3 * npface) - 1;
    kshift = 0;
  } else {
    nr = NSIDE;
    z = ((2 * NSIDE - jr) * 2) / (3 * NSIDE);
    kshift = (jr - NSIDE) & 1;
  }
  let jp = (JPLL[face] * nr + ix - iy + 1 + kshift) / 2;
  if (jp > 4 * NSIDE) jp -= 4 * NSIDE;
  if (jp < 1) jp += 4 * NSIDE;
  out[0] = z;
  out[1] = (jp - (kshift + 1) * 0.5) * (Math.PI / 2 / nr);
}
// The inverse (as in build-cmb.mjs), to check the pixel centres above.
function spread(v) {
  v = (v | (v << 8)) & 0x00ff00ff;
  v = (v | (v << 4)) & 0x0f0f0f0f;
  v = (v | (v << 2)) & 0x33333333;
  v = (v | (v << 1)) & 0x55555555;
  return v >>> 0;
}
const ORDER = Math.log2(NSIDE);
function ang2pixNest(z, phi) {
  const za = Math.abs(z);
  let tt = (phi / (Math.PI / 2)) % 4;
  if (tt < 0) tt += 4;
  const xyf = (ix, iy, f) => f * NSIDE * NSIDE + spread(ix) + 2 * spread(iy);
  if (za <= 2 / 3) {
    const t1 = NSIDE * (0.5 + tt);
    const t2 = NSIDE * (z * 0.75);
    const jp = Math.floor(t1 - t2);
    const jm = Math.floor(t1 + t2);
    const ifp = jp >> ORDER;
    const ifm = jm >> ORDER;
    const face = ifp === ifm ? ifp | 4 : ifp < ifm ? ifp : ifm + 8;
    return xyf(jm & (NSIDE - 1), NSIDE - (jp & (NSIDE - 1)) - 1, face);
  }
  const ntt = Math.min(3, Math.floor(tt));
  const tp = tt - ntt;
  const tmp = NSIDE * Math.sqrt(3 * (1 - za));
  const jp = Math.min(NSIDE - 1, Math.floor(tp * tmp));
  const jm = Math.min(NSIDE - 1, Math.floor((1 - tp) * tmp));
  return z >= 0 ? xyf(NSIDE - jm - 1, NSIDE - jp - 1, ntt) : xyf(jp, jm, ntt + 8);
}
{
  const zp = [0, 0];
  for (let k = 0; k < 20000; k++) {
    const p = Math.floor(((k * 2654435761) % 4294967296) / 4294967296 * NPIX);
    pix2zphi(p, zp);
    if (ang2pixNest(zp[0], zp[1]) !== p) throw new Error(`pixel centre check failed at ${p}`);
  }
}

// ─── 1–2. Tensors into bins, then smoothed ────────────────────────────────────────────────
// Bin (i, j): l = 360 (i + ½)/BIN_W (l from 0), b = 90 − 180 (j + ½)/BIN_H.
const NB = BIN_W * BIN_H;
const acc = Array.from({ length: 8 }, () => new Float64Array(NB)); // Txx Txy Txz Tyy Tyz Tzz I count
const zp = [0, 0];
const CHUNK_ROWS = 1 << 20;
const buf = Buffer.alloc(CHUNK_ROWS * ROW);
let bad = 0;
let qPlane = 0;
let nPlane = 0;
const t0 = Date.now();
for (let p0 = 0; p0 < NPIX; p0 += CHUNK_ROWS) {
  const rows = Math.min(CHUNK_ROWS, NPIX - p0);
  readSync(fd, buf, 0, rows * ROW, off + p0 * ROW);
  for (let r = 0; r < rows; r++) {
    const base = r * ROW;
    const I = buf.readFloatBE(base + cI);
    const Q = buf.readFloatBE(base + cQ);
    const U = -buf.readFloatBE(base + cU); // COSMO → IAU
    if (!Number.isFinite(I + Q + U) || Math.abs(Q) > 1e20 || Math.abs(U) > 1e20) {
      bad++;
      continue;
    }
    pix2zphi(p0 + r, zp);
    const z = zp[0];
    const phi = zp[1];
    const cb = Math.sqrt(Math.max(0, 1 - z * z));
    const cl = Math.cos(phi);
    const sl = Math.sin(phi);
    // North n = (−sin b cos l, −sin b sin l, cos b); east e = (−sin l, cos l, 0).
    const nx = -z * cl, ny = -z * sl, nz = cb;
    const ex = -sl, ey = cl;
    // T = Q (n n − e e) + U (n e + e n)
    const txx = Q * (nx * nx - ex * ex) + U * 2 * nx * ex;
    const txy = Q * (nx * ny - ex * ey) + U * (nx * ey + ex * ny);
    const txz = Q * (nx * nz) + U * (ex * nz);
    const tyy = Q * (ny * ny - ey * ey) + U * 2 * ny * ey;
    const tyz = Q * (ny * nz) + U * (ey * nz);
    const tzz = Q * (nz * nz);
    const b = Math.asin(z) / DEG;
    let l = phi / DEG;
    l -= 360 * Math.floor(l / 360);
    const i = Math.min(BIN_W - 1, Math.floor((l / 360) * BIN_W));
    const j = Math.min(BIN_H - 1, Math.floor(((90 - b) / 180) * BIN_H));
    const k = j * BIN_W + i;
    acc[0][k] += txx;
    acc[1][k] += txy;
    acc[2][k] += txz;
    acc[3][k] += tyy;
    acc[4][k] += tyz;
    acc[5][k] += tzz;
    acc[6][k] += I;
    acc[7][k] += 1;
    if (Math.abs(b) < 3) {
      nPlane++;
      if (Q > 0) qPlane++;
    }
  }
}
closeSync(fd);
console.log(`binned in ${((Date.now() - t0) / 1000).toFixed(1)} s; ${bad} bad pixels; Q > 0 (polarisation across the plane) in ${((100 * qPlane) / nPlane).toFixed(1)} % of pixels within 3° of the plane`);

/** Separable Gaussian blur of a bin map, FWHM fwhmDeg: rows with σ / cos b (wrapping), then columns. */
function blur(src, fwhmDeg) {
  const sigma = fwhmDeg / 2.3548;
  const tmp = new Float64Array(NB);
  const out = new Float64Array(NB);
  const dl = 360 / BIN_W;
  const db = 180 / BIN_H;
  for (let j = 0; j < BIN_H; j++) {
    const b = 90 - (j + 0.5) * db;
    const s = Math.min(BIN_W / 4, sigma / Math.max(Math.cos(b * DEG), 1e-3) / dl);
    const R = Math.ceil(3 * s);
    const w = [];
    for (let d = -R; d <= R; d++) w.push(Math.exp(-0.5 * (d / s) ** 2));
    const row = j * BIN_W;
    for (let i = 0; i < BIN_W; i++) {
      let a = 0;
      for (let d = -R; d <= R; d++) a += w[d + R] * src[row + ((((i + d) % BIN_W) + BIN_W) % BIN_W)];
      tmp[row + i] = a;
    }
  }
  const s = sigma / db;
  const R = Math.ceil(3 * s);
  const w = [];
  for (let d = -R; d <= R; d++) w.push(Math.exp(-0.5 * (d / s) ** 2));
  for (let j = 0; j < BIN_H; j++)
    for (let i = 0; i < BIN_W; i++) {
      let a = 0;
      for (let d = -R; d <= R; d++) {
        let jj = j + d;
        let ii = i;
        // Over the pole: the same meridian plane, the other side.
        if (jj < 0) {
          jj = -jj - 1;
          ii = (i + BIN_W / 2) % BIN_W;
        } else if (jj >= BIN_H) {
          jj = 2 * BIN_H - jj - 1;
          ii = (i + BIN_W / 2) % BIN_W;
        }
        a += w[d + R] * tmp[jj * BIN_W + ii];
      }
      out[j * BIN_W + i] = a;
    }
  return out;
}
const sm = acc.map((a) => blur(a, SRC.smoothDeg));
for (let k = 0; k < NB; k++) {
  const n = sm[7][k];
  for (let c = 0; c < 7; c++) sm[c][k] = n > 1e-9 ? sm[c][k] / n : 0;
}

// ─── 3. The field's direction anywhere ─────────────────────────────────────────────────────
const T = new Float64Array(7);
/** The smoothed tensor (and I) at galactic (l, b) in degrees, bilinear in the bins, into T. */
function tensorAt(lDeg, bDeg) {
  let x = (lDeg / 360) * BIN_W - 0.5;
  x -= BIN_W * Math.floor(x / BIN_W);
  const y = Math.max(0, Math.min(BIN_H - 1.0001, ((90 - bDeg) / 180) * BIN_H - 0.5));
  const i0 = Math.floor(x);
  const j0 = Math.floor(y);
  const fx = x - i0;
  const fy = y - j0;
  const i1 = (i0 + 1) % BIN_W;
  const k00 = j0 * BIN_W + i0, k10 = j0 * BIN_W + i1, k01 = (j0 + 1) * BIN_W + i0, k11 = (j0 + 1) * BIN_W + i1;
  for (let c = 0; c < 7; c++) {
    const a = sm[c];
    T[c] = (1 - fy) * ((1 - fx) * a[k00] + fx * a[k10]) + fy * ((1 - fx) * a[k01] + fx * a[k11]);
  }
}
/** Q, U (IAU) at unit vector v from T, and the field's unit direction there (headless) into dir. */
function fieldDir(v, dir) {
  const cb = Math.hypot(v[0], v[1]);
  const lDeg = Math.atan2(v[1], v[0]) / DEG;
  const bDeg = Math.atan2(v[2], cb) / DEG;
  tensorAt(lDeg, bDeg);
  const cl = cb > 0 ? v[0] / cb : 1;
  const sl = cb > 0 ? v[1] / cb : 0;
  const n = [-v[2] * cl, -v[2] * sl, cb];
  const e = [-sl, cl, 0];
  const Tv = (a, b) =>
    a[0] * (T[0] * b[0] + T[1] * b[1] + T[2] * b[2]) + a[1] * (T[1] * b[0] + T[3] * b[1] + T[4] * b[2]) + a[2] * (T[2] * b[0] + T[4] * b[1] + T[5] * b[2]);
  const Q = 0.5 * (Tv(n, n) - Tv(e, e));
  const U = Tv(n, e);
  const psi = 0.5 * Math.atan2(U, Q);
  // The field: the polarisation turned by 90°.
  const s = -Math.sin(psi);
  const c = Math.cos(psi);
  dir[0] = s * n[0] + c * e[0];
  dir[1] = s * n[1] + c * e[1];
  dir[2] = s * n[2] + c * e[2];
  return Math.hypot(Q, U);
}

// ─── 4. LIC ─────────────────────────────────────────────────────────────────────────────
// Lattice cells per unit length on the unit sphere: 1.6 texels a cell, so a streak is a few texels wide and stays smooth
// where the view magnifies the texture (from Earth with a 50° field a texel is 3–4 screen pixels).
const LATTICE = OUT_H / Math.PI / 1.6;
function hash3(i, j, k) {
  let x = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x9e3779b1) ^ NOISE_SEED;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function noise(v) {
  const x = v[0] * LATTICE, y = v[1] * LATTICE, z = v[2] * LATTICE;
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  let a = 0;
  for (let c = 0; c < 8; c++) {
    const di = c & 1, dj = (c >> 1) & 1, dk = c >> 2;
    a += (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz) * hash3(i + di, j + dj, k + dk);
  }
  return a;
}
const STEPS = Math.round(LIC_HALF_DEG / LIC_STEP_DEG);
const hann = [];
for (let s = 0; s <= STEPS; s++) hann.push(0.5 + 0.5 * Math.cos((Math.PI * s) / (STEPS + 1)));
// A check: within 5° of the plane and 60° of the centre the field should mostly lie along the plane (east–west).
{
  let along = 0;
  let n = 0;
  const d = [0, 0, 0];
  for (let l = -60; l <= 60; l += 0.5)
    for (let b = -5; b <= 5; b += 0.5) {
      const v = [Math.cos(b * DEG) * Math.cos(l * DEG), Math.cos(b * DEG) * Math.sin(l * DEG), Math.sin(b * DEG)];
      fieldDir(v, d);
      const e = [-Math.sin(l * DEG), Math.cos(l * DEG), 0];
      if ((d[0] * e[0] + d[1] * e[1]) ** 2 > 0.5) along++;
      n++;
    }
  console.log(`field within 45° of the plane's direction at ${((100 * along) / n).toFixed(1)} % of points within 5° of the plane, |l| < 60°`);
}
const lic = new Float32Array(OUT_W * OUT_H);
const pol = new Float32Array(OUT_W * OUT_H);
const step = LIC_STEP_DEG * DEG;
const t1 = Date.now();
{
  const v = [0, 0, 0];
  const p = [0, 0, 0];
  const d = [0, 0, 0];
  const dPrev = [0, 0, 0];
  for (let j = 0; j < OUT_H; j++) {
    const b = (90 - (180 * (j + 0.5)) / OUT_H) * DEG;
    for (let i = 0; i < OUT_W; i++) {
      const l = (180 - (360 * (i + 0.5)) / OUT_W) * DEG;
      v[0] = Math.cos(b) * Math.cos(l);
      v[1] = Math.cos(b) * Math.sin(l);
      v[2] = Math.sin(b);
      const P = fieldDir(v, d);
      pol[j * OUT_W + i] = P;
      let sum = hann[0] * noise(v);
      let wsum = hann[0];
      for (const sgn of [1, -1]) {
        p[0] = v[0], p[1] = v[1], p[2] = v[2];
        dPrev[0] = sgn * d[0], dPrev[1] = sgn * d[1], dPrev[2] = sgn * d[2];
        for (let s = 1; s <= STEPS; s++) {
          // A midpoint step on the sphere along the (headless) field, kept going the same way.
          const m = [p[0] + 0.5 * step * dPrev[0], p[1] + 0.5 * step * dPrev[1], p[2] + 0.5 * step * dPrev[2]];
          const mn = Math.hypot(m[0], m[1], m[2]);
          m[0] /= mn, m[1] /= mn, m[2] /= mn;
          fieldDir(m, d);
          if (d[0] * dPrev[0] + d[1] * dPrev[1] + d[2] * dPrev[2] < 0) (d[0] = -d[0]), (d[1] = -d[1]), (d[2] = -d[2]);
          p[0] += step * d[0], p[1] += step * d[1], p[2] += step * d[2];
          const pn = Math.hypot(p[0], p[1], p[2]);
          p[0] /= pn, p[1] /= pn, p[2] /= pn;
          dPrev[0] = d[0], dPrev[1] = d[1], dPrev[2] = d[2];
          sum += hann[s] * noise(p);
          wsum += hann[s];
        }
      }
      lic[j * OUT_W + i] = sum / wsum;
    }
    if (j % 128 === 127) console.log(`  LIC row ${j + 1} / ${OUT_H}, ${((Date.now() - t1) / 1000).toFixed(0)} s`);
  }
}

// ─── 5. Contrast and weight ────────────────────────────────────────────────────────────
const N = OUT_W * OUT_H;
let mean = 0;
let m2 = 0;
for (let k = 0; k < N; k++) mean += lic[k];
mean /= N;
for (let k = 0; k < N; k++) m2 += (lic[k] - mean) ** 2;
const sd = Math.sqrt(m2 / N);
const logs = Array.from(pol, (P) => Math.log(Math.max(P, 1e-30))).sort((a, b) => a - b);
const pLo = logs[Math.floor(0.05 * N)];
const pHi = logs[Math.floor(0.995 * N)];
const code = new Uint8Array(N);
for (let k = 0; k < N; k++) {
  const c = Math.max(0, Math.min(1, (lic[k] - mean) / (2.5 * sd)));
  const t = Math.max(0, Math.min(1, (Math.log(Math.max(pol[k], 1e-30)) - pLo) / (pHi - pLo)));
  const w = 0.2 + 0.8 * t;
  code[k] = Math.round(255 * c * w);
}
console.log(`LIC in ${((Date.now() - t1) / 1000).toFixed(0)} s; mean ${mean.toFixed(4)}, sd ${sd.toFixed(4)}; P from ${Math.exp(pLo).toExponential(2)} to ${Math.exp(pHi).toExponential(2)} (map units)`);

// ─── PNG (8-bit greyscale, adaptive per-row filters) ───────────────────────────────────────
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
function png(W, H, pixels, channels, text) {
  const stride = W * channels;
  const raw = Buffer.alloc((stride + 1) * H);
  const zero = new Uint8Array(stride);
  for (let j = 0; j < H; j++) {
    const row = pixels.subarray(j * stride, (j + 1) * stride);
    const up = j > 0 ? pixels.subarray((j - 1) * stride, j * stride) : zero;
    let best = null;
    let bestCost = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = new Uint8Array(stride);
      let cost = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? row[i - channels] : 0;
        const b = up[i];
        const c = i >= channels ? up[i - channels] : 0;
        let pr;
        if (f === 0) pr = 0;
        else if (f === 1) pr = a;
        else if (f === 2) pr = b;
        else if (f === 3) pr = (a + b) >> 1;
        else {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const x = (row[i] - pr) & 255;
        out[i] = x;
        cost += x < 128 ? x : 256 - x;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = [f, out];
      }
    }
    raw[j * (stride + 1)] = best[0];
    raw.set(best[1], j * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 1 ? 0 : 2;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr)];
  if (text) parts.push(pngChunk('tEXt', Buffer.from(`Comment\0${text}`, 'latin1')));
  parts.push(pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const credit =
  SOURCE === 'planck'
    ? 'Field direction on the sky from Planck PR3 353 GHz polarisation (ESA, Planck Collaboration), LIC; galactic equirectangular, l = 0 at the centre increasing left'
    : 'Field direction on the sky from WMAP 9-year K-band polarisation (NASA/WMAP Science Team), LIC; galactic equirectangular, l = 0 at the centre increasing left';
const outFile = `public/textures/field-sky-${SOURCE}.png`;
const file = png(OUT_W, OUT_H, code, 1, credit);
writeFileSync(outFile, file);
console.log(`wrote ${outFile} (${file.length} bytes)`);

// A quick look: the drapery over the log of I, in colour.
mkdirSync('data-raw/field-sky', { recursive: true });
const rgb = new Uint8Array(N * 3);
{
  const Is = [];
  for (let j = 0; j < OUT_H; j++) {
    const b = 90 - (180 * (j + 0.5)) / OUT_H;
    for (let i = 0; i < OUT_W; i++) {
      tensorAt(180 - (360 * (i + 0.5)) / OUT_W, b);
      Is.push(T[6]);
    }
  }
  const sorted = Is.map((x) => Math.log(Math.max(x, 1e-12))).sort((a, b) => a - b);
  const lo = sorted[Math.floor(0.02 * N)];
  const hi = sorted[Math.floor(0.998 * N)];
  for (let k = 0; k < N; k++) {
    const t = Math.max(0, Math.min(1, (Math.log(Math.max(Is[k], 1e-12)) - lo) / (hi - lo)));
    const c = code[k] / 255;
    rgb[3 * k] = Math.round(255 * Math.min(1, 0.15 + 0.85 * t) * c);
    rgb[3 * k + 1] = Math.round(255 * (0.25 + 0.5 * t) * c);
    rgb[3 * k + 2] = Math.round(255 * (0.9 - 0.6 * t) * c);
  }
}
writeFileSync(`data-raw/field-sky/${SOURCE}-preview.png`, png(OUT_W, OUT_H, rgb, 3));
