// Builds public/data/tracks.bin and public/data/tracks.json: adaptive Chebyshev trajectories
// for dwarf planets, TNOs, comets, interstellar objects and spacecraft, fitted to JPL Horizons.
//
// Source: JPL Horizons API, https://ssd.jpl.nasa.gov/api/horizons.api (NASA/JPL-Caltech).
// Every raw response is cached in data-raw/tracks/ (not committed); a cached file is never
// requested again. Requests are made one at a time with a pause between them.
//
// Usage:  node scripts/build-tracks.mjs [--only=id,id,...] [--no-fixtures]
//   --only        rebuild just these bodies, writing to data-raw/tracks/partial/ (for development)
//   --no-fixtures skip the independent Horizons checkpoints written for the unit tests
//
// Frame: ecliptic and mean equinox of J2000 (Horizons REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF,
// obliquity 84381.448"). Time: TDB days since J2000.0 (JD 2451545.0 TDB). Units: km.
// The binary layout, the index format and the method are documented in
// docs/data/tracks.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as Astronomy from 'astronomy-engine';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw', 'tracks');
const OUT_BIN = join(ROOT, 'public', 'data', 'tracks.bin');
const OUT_JSON = join(ROOT, 'public', 'data', 'tracks.json');
const FIXTURE = join(ROOT, 'src', 'sim', '__fixtures__', 'track-checkpoints.json');

const J2000_JD = 2451545.0;
const DAY_S = 86400;
const AU_KM = 149597870.7;

const ARGS = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const ONLY = ARGS.only ? new Set(String(ARGS.only).split(',')) : null;

// ─── Dates ────────────────────────────────────────────────────────────────────────────────

/** Calendar date (read as TDB, proleptic Gregorian) → TDB days since J2000. */
function tdb(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?$/.exec(iso);
  if (!m) throw new Error(`bad date ${iso}`);
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), 0) + (m[6] ? parseFloat(m[6]) * 1000 : 0);
  return ms / 86400000 + 2440587.5 - J2000_JD;
}

/** TDB days since J2000 → 'YYYY-MM-DD hh:mm:ss.sss' (TDB). */
function isoOf(t) {
  const ms = (t + J2000_JD - 2440587.5) * 86400000;
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
/** 'A.D. 1977-SEP-05 13:59:24.3830' → TDB days since J2000. */
function parseHorizonsDate(s) {
  const m = /(\d{4})-([A-Z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i.exec(s);
  if (!m) throw new Error(`bad Horizons date ${s}`);
  const mo = String(MONTHS[m[2].toUpperCase()]).padStart(2, '0');
  return tdb(`${m[1]}-${mo}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
}

const jdString = (t) => {
  const s = (J2000_JD + t).toFixed(10);
  return s.replace(/0+$/, '').replace(/\.$/, '.0');
};

// ─── JPL Horizons ─────────────────────────────────────────────────────────────────────────

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const PAUSE_MS = 1500;
let lastRequest = 0;
let requestCount = 0;
let cacheReads = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.replace(/[^A-Za-z0-9.+-]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * One Horizons request, cached in data-raw/tracks/<file>. Only complete ephemerides are cached
 * (responses with $$SOE/$$EOE, or with MAKE_EPHEM=NO the object summary); errors throw.
 */
async function horizons(params, file, { allowError = false } = {}) {
  const path = join(RAW, file);
  if (existsSync(path)) {
    cacheReads++;
    return readFileSync(path, 'utf8');
  }
  const url = `${API}?${new URLSearchParams({ format: 'text', ...params })}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastRequest + PAUSE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    requestCount++;
    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      console.warn(`  network error (${err.message}); retrying`);
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status === 503 || res.status >= 500) {
      console.warn(`  Horizons HTTP ${res.status}; backing off`);
      await sleep(15000 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Horizons HTTP ${res.status} for ${file}: ${text.slice(0, 400)}`);
    const complete = params.MAKE_EPHEM === 'NO' || (text.includes('$$SOE') && text.includes('$$EOE'));
    if (!complete) {
      if (allowError) return text;
      throw new Error(`Horizons returned no ephemeris for ${file}:\n${text.slice(0, 1500)}`);
    }
    writeFileSync(path, text);
    return text;
  }
  throw new Error(`Horizons unavailable for ${file}`);
}

function vectorParams(command, centreCode) {
  return {
    COMMAND: `'${command}'`,
    OBJ_DATA: 'YES',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: `'@${centreCode}'`,
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    VEC_TABLE: '2',
    VEC_CORR: 'NONE',
    OUT_UNITS: 'KM-S',
    CSV_FORMAT: 'YES',
    VEC_LABELS: 'NO',
  };
}

/** Parse a VECTORS CSV table: rows of {t, p: [x,y,z] km, v: [vx,vy,vz] km/day}. */
function parseVectors(text) {
  const a = text.indexOf('$$SOE');
  const b = text.indexOf('$$EOE');
  const rows = [];
  for (const line of text.slice(a + 5, b).split('\n')) {
    const f = line.split(',');
    if (f.length < 8) continue;
    const jd = parseFloat(f[0]);
    rows.push({
      jd,
      p: [parseFloat(f[2]), parseFloat(f[3]), parseFloat(f[4])],
      v: [parseFloat(f[5]) * DAY_S, parseFloat(f[6]) * DAY_S, parseFloat(f[7]) * DAY_S],
    });
  }
  return rows;
}

/** Provenance from a Horizons header. */
function parseHeader(text) {
  const out = {};
  const tgt = /Target body name: (.+?)\s+\{source: ([^}]+)\}/.exec(text);
  if (tgt) {
    out.target = tgt[1].trim();
    out.ephemeris = tgt[2].trim();
  }
  const ctr = /Center body name: (.+?)\s+\{source: ([^}]+)\}/.exec(text);
  if (ctr) {
    out.centre = ctr[1].trim();
    out.centreEphemeris = ctr[2].trim();
  }
  const rec = /Rec #:\s*(\d+)/.exec(text);
  if (rec) out.record = rec[1];
  const sol = /Soln\.date: (\S+)/.exec(text);
  if (sol && sol[1] !== '-') out.solutionDate = sol[1];
  const ref = /soln ref\.= ([^,\n]+)(?:, data arc: ([^\n]+))?/.exec(text);
  if (ref) {
    out.solution = ref[1].trim();
    if (ref[2]) out.dataArc = ref[2].trim();
  }
  const obs = /# obs: (\d+) \(([^)]+)\)/.exec(text);
  if (obs) out.observations = `${obs[1]} (${obs[2]})`;
  const ep = /EPOCH=\s*([\d.]+)/.exec(text);
  if (ep) out.elementEpochJd = parseFloat(ep[1]);
  return out;
}

const MAX_STEPS_PER_REQUEST = 40000;

/** Equal-interval grid [a, b] with n intervals from one Horizons source (chunked). */
async function fetchGrid(src, centreCode, a, b, n) {
  const out = [];
  let header = null;
  const chunks = Math.ceil(n / MAX_STEPS_PER_REQUEST);
  for (let c = 0; c < chunks; c++) {
    const i0 = Math.round((c * n) / chunks);
    const i1 = Math.round(((c + 1) * n) / chunks);
    const ta = a + ((b - a) * i0) / n;
    const tb = c === chunks - 1 ? b : a + ((b - a) * i1) / n;
    const file = `grid_${src.slug}@${centreCode}_${jdString(ta)}_${jdString(tb)}_${i1 - i0}.txt`;
    const text = await horizons(
      {
        ...vectorParams(src.command, centreCode),
        START_TIME: `'JD${jdString(ta)}'`,
        STOP_TIME: `'JD${jdString(tb)}'`,
        STEP_SIZE: `'${i1 - i0}'`,
      },
      file,
    );
    header ??= parseHeader(text);
    const rows = parseVectors(text);
    if (rows.length === i1 - i0) {
      // Horizons accumulates its step and occasionally lands just past the stop time, dropping
      // the last row; fetch that epoch on its own.
      const [last] = await fetchList(src, centreCode, [tb]);
      rows.push({ jd: J2000_JD + last.t, p: last.p, v: last.v });
    }
    if (rows.length !== i1 - i0 + 1) throw new Error(`${file}: expected ${i1 - i0 + 1} rows, got ${rows.length}`);
    rows.forEach((r, k) => {
      if (c > 0 && k === 0) return;
      // Horizons' own step accumulates a few ms over tens of thousands of steps, so the
      // printed epoch (rounded to 1e-9 day, 43 µs) is the better time tag.
      const t = a + ((b - a) * (i0 + k)) / n;
      if (Math.abs(r.jd - J2000_JD - t) > 1e-6) throw new Error(`${file}: time mismatch ${r.jd} vs ${t}`);
      out.push({ t: r.jd - J2000_JD, p: r.p, v: r.v });
    });
  }
  src.header ??= header;
  return out;
}

/** Discrete epochs from one Horizons source (TLIST, chunked). Returns rows in the input order. */
async function fetchList(src, centreCode, times) {
  const sorted = [...new Set(times)].sort((x, y) => x - y);
  const map = new Map();
  const CH = 50; // longer TLIST query strings are rejected (HTTP 502)
  for (let c = 0; c < sorted.length; c += CH) {
    const part = sorted.slice(c, c + CH);
    const hash = createHash('sha1').update(part.map(jdString).join(' ')).digest('hex').slice(0, 12);
    const file = `list_${src.slug}@${centreCode}_${jdString(part[0])}_${part.length}_${hash}.txt`;
    const text = await horizons(
      {
        ...vectorParams(src.command, centreCode),
        TLIST: part.map((t) => `'${jdString(t)}'`).join(' '),
        TLIST_TYPE: 'JD',
      },
      file,
    );
    src.header ??= parseHeader(text);
    const rows = parseVectors(text);
    if (rows.length !== part.length) throw new Error(`${file}: expected ${part.length} rows, got ${rows.length}`);
    rows.forEach((r, k) => {
      if (Math.abs(r.jd - J2000_JD - part[k]) > 2e-8) throw new Error(`${file}: time mismatch`);
      map.set(part[k], { t: part[k], p: r.p, v: r.v });
    });
  }
  return times.map((t) => map.get(t));
}

/** Coverage of a Horizons target, read from the errors it returns for 1500 and 2600. */
async function coverage(src) {
  const probe = async (when, file) => {
    const text = await horizons(
      { ...vectorParams(src.command, '10'), START_TIME: `'${when}'`, STOP_TIME: `'${when.replace(/-01$/, '-02')}'`, STEP_SIZE: "'1'" },
      file,
      { allowError: true },
    );
    return text;
  };
  const before = await probe('1500-01-01', `cov_${src.slug}_before.txt`);
  const after = await probe('2600-01-01', `cov_${src.slug}_after.txt`);
  // These probes are cached by hand: a response without $$SOE is an expected error message.
  for (const [text, file] of [
    [before, `cov_${src.slug}_before.txt`],
    [after, `cov_${src.slug}_after.txt`],
  ]) {
    if (!existsSync(join(RAW, file))) writeFileSync(join(RAW, file), text);
  }
  const m0 = /prior to (A\.D\. [^\n]+?) TDB/.exec(before);
  const m1 = /after (A\.D\. [^\n]+?) TDB/.exec(after);
  if (!m0 || !m1) throw new Error(`could not read coverage of ${src.command}`);
  return { start: parseHorizonsDate(m0[1]), end: parseHorizonsDate(m1[1]), startText: m0[1] + ' TDB', endText: m1[1] + ' TDB' };
}

/** Object summary (MAKE_EPHEM=NO) for a small-body record. */
async function objectData(command) {
  return horizons({ COMMAND: `'${command}'`, OBJ_DATA: 'YES', MAKE_EPHEM: 'NO' }, `obj_${slug(command)}.txt`);
}

function source(command, label) {
  return { command, label: label ?? command, slug: slug(command), header: null };
}

// ─── Physical constants (DE440; Park et al. 2021, AJ 161, 105) ────────────────────────────

const GM = {
  sun: 132712440041.279419,
  mercury: 22031.868551,
  venus: 324858.592,
  emb: 403503.235502,
  earth: 398600.435507,
  mars: 42828.375816,
  jupiter: 126712764.1,
  saturn: 37940584.8418,
  uranus: 5794556.4,
  neptune: 6836527.10058,
  pluto: 975.5,
};
/** Whole Solar System (Sun + planetary systems): the effective central mass seen from far away. */
const GM_SYSTEM =
  GM.sun + GM.mercury + GM.venus + GM.emb + GM.mars + GM.jupiter + GM.saturn + GM.uranus + GM.neptune + GM.pluto;

// Centres. Planet codes are body centres (not system barycentres) so flyby geometry is exact
// against the planet itself, except Pluto (@9, the Pluto–Charon barycentre, as astronomy-engine's Body.Pluto is).
// soi: Laplace sphere of influence a·(m/M☉)^(2/5), where the track switches centre.
const CENTRES = {
  sun: { code: '10', label: 'Sun (body centre)' },
  ssb: { code: '0', label: 'Solar System barycentre' },
  earth: { code: '399', label: 'Earth (geocentre)', radius: 6378.137, a: 149598023, gm: GM.emb },
  venus: { code: '299', label: 'Venus (body centre)', radius: 6051.8, a: 108208930, gm: GM.venus },
  mars: { code: '499', label: 'Mars (body centre)', radius: 3396.19, a: 227939200, gm: GM.mars },
  jupiter: { code: '599', label: 'Jupiter (body centre)', radius: 71492, a: 778570000, gm: GM.jupiter },
  saturn: { code: '699', label: 'Saturn (body centre)', radius: 60268, a: 1433530000, gm: GM.saturn },
  uranus: { code: '799', label: 'Uranus (body centre)', radius: 25559, a: 2872460000, gm: GM.uranus },
  neptune: { code: '899', label: 'Neptune (body centre)', radius: 24764, a: 4495060000, gm: GM.neptune },
  pluto: { code: '9', label: 'Pluto system barycentre (Horizons 9)', radius: 1188.3, a: 5906380000, gm: GM.pluto },
  arrokoth: { code: '2486958', label: 'Arrokoth, New Horizons project ephemeris (Horizons 2486958)', radius: 18, track: 'arrokoth' },
};
for (const c of Object.values(CENTRES)) if (c.gm) c.soi = c.a * (c.gm / GM.sun) ** 0.4;

// ─── Chebyshev fitting ────────────────────────────────────────────────────────────────────

/** Candidate polynomial degrees; the fitter picks, per segment, the one that covers the most time per byte. */
const DEGREES = [3, 5, 7, 9, 11, 13, 16, 19, 23, 27, 31];
const MAX_DEGREE = 31;
const VEL_WEIGHT = 0.5; // velocity rows (scaled by the half-length) relative to position rows

const Tb = new Float64Array(MAX_DEGREE + 1);
const Db = new Float64Array(MAX_DEGREE + 1);
function chebTD(x, n) {
  Tb[0] = 1;
  Db[0] = 0;
  Tb[1] = x;
  Db[1] = 1;
  for (let k = 1; k < n; k++) {
    Tb[k + 1] = 2 * x * Tb[k] - Tb[k - 1];
    Db[k + 1] = 2 * Tb[k] + 2 * x * Db[k] - Db[k - 1];
  }
}

/** Clenshaw evaluation of Σ c[off+k] T_k(x), k = 0..n. */
function clenshaw(c, off, n, x) {
  let b1 = 0;
  let b2 = 0;
  for (let k = n; k >= 1; k--) {
    const t = 2 * x * b1 - b2 + c[off + k];
    b2 = b1;
    b1 = t;
  }
  return x * b1 - b2 + c[off];
}

/**
 * Least-squares Chebyshev fit of degree n on samples i0..i1 with the end positions and
 * velocities matched exactly (so consecutive segments join with continuous position and
 * velocity). The constraint is built in: c = Hermite cubic + Σ z_j (T_j − q_j), where q_j is
 * the cubic that matches T_j and T_j' at ±1. Only the z_j are fitted.
 */
function fitSegment(S, i0, i1, n) {
  const a = S.t[i0];
  const b = S.t[i1];
  const half = (b - a) / 2;
  const mid = (a + b) / 2;
  const nc = n + 1;
  const c = new Float64Array(3 * nc);
  for (let d = 0; d < 3; d++) {
    const P0 = S.p[3 * i0 + d];
    const P1 = S.p[3 * i1 + d];
    const D0 = S.v[3 * i0 + d] * half;
    const D1 = S.v[3 * i1 + d] * half;
    const e2 = (D1 - D0) / 4;
    const e3 = (D0 + D1 - P1 + P0) / 4;
    const e1 = (P1 - P0) / 2 - e3;
    const e0 = (P0 + P1) / 2 - e2;
    c[d * nc] = e0 + e2 / 2;
    c[d * nc + 1] = e1 + 0.75 * e3;
    c[d * nc + 2] = e2 / 2;
    c[d * nc + 3] = e3 / 4;
  }
  if (n <= 3) return c;
  const m = n - 3;
  const G = new Float64Array(m * m);
  const R = new Float64Array(3 * m);
  const phi = new Float64Array(m);
  const dphi = new Float64Array(m);
  // Pick at most ~3 samples per coefficient, spread like Chebyshev nodes (denser near the ends).
  const count = i1 - i0 - 1;
  const want = Math.min(count, 3 * nc);
  let prev = -1;
  for (let q = 0; q < want; q++) {
    let i;
    if (want === count) i = i0 + 1 + q;
    else {
      const x = -Math.cos((Math.PI * (q + 0.5)) / want);
      i = nearestIndex(S, mid + half * x, i0 + 1, i1 - 1);
      if (i <= prev) i = prev + 1;
      if (i >= i1) break;
    }
    prev = i;
    const x = (S.t[i] - mid) / half;
    chebTD(x, n);
    const x2 = x * x;
    for (let j = 4; j <= n; j++) {
      const jj = j * j;
      if (j % 2 === 0) {
        const beta = jj / 2;
        phi[j - 4] = Tb[j] - (1 - beta + beta * x2);
        dphi[j - 4] = Db[j] - 2 * beta * x;
      } else {
        const delta = (jj - 1) / 2;
        const gamma = 1 - delta;
        phi[j - 4] = Tb[j] - (gamma * x + delta * x2 * x);
        dphi[j - 4] = Db[j] - (gamma + 3 * delta * x2);
      }
    }
    const w = S.w[i];
    const wp = w * w;
    const wv = (VEL_WEIGHT * w) ** 2;
    for (let d = 0; d < 3; d++) {
      const off = d * nc;
      const H = c[off] + c[off + 1] * x + c[off + 2] * Tb[2] + c[off + 3] * Tb[3];
      const dH = c[off + 1] + c[off + 2] * Db[2] + c[off + 3] * Db[3];
      const yp = S.p[3 * i + d] - H;
      const yv = S.v[3 * i + d] * half - dH;
      for (let j = 0; j < m; j++) R[d * m + j] += wp * phi[j] * yp + wv * dphi[j] * yv;
    }
    for (let j = 0; j < m; j++) {
      const pj = wp * phi[j];
      const dj = wv * dphi[j];
      for (let k = 0; k <= j; k++) G[j * m + k] += pj * phi[k] + dj * dphi[k];
    }
  }
  // Cholesky (lower triangle), with a tiny ridge for rank-deficient systems.
  let trace = 0;
  for (let j = 0; j < m; j++) trace += G[j * m + j];
  const ridge = 1e-14 * (trace / m || 1);
  const L = new Float64Array(m * m);
  for (let j = 0; j < m; j++) {
    for (let k = 0; k <= j; k++) {
      let s = G[j * m + k] + (j === k ? ridge : 0);
      for (let l = 0; l < k; l++) s -= L[j * m + l] * L[k * m + l];
      if (j === k) L[j * m + j] = Math.sqrt(Math.max(s, ridge));
      else L[j * m + k] = s / L[k * m + k];
    }
  }
  const z = new Float64Array(m);
  for (let d = 0; d < 3; d++) {
    for (let j = 0; j < m; j++) {
      let s = R[d * m + j];
      for (let l = 0; l < j; l++) s -= L[j * m + l] * z[l];
      z[j] = s / L[j * m + j];
    }
    for (let j = m - 1; j >= 0; j--) {
      let s = z[j];
      for (let l = j + 1; l < m; l++) s -= L[l * m + j] * z[l];
      z[j] = s / L[j * m + j];
    }
    const off = d * nc;
    for (let j = 4; j <= n; j++) {
      const zj = z[j - 4];
      c[off + j] = zj;
      const jj = j * j;
      if (j % 2 === 0) {
        const beta = jj / 2;
        c[off] -= zj * (1 - beta + beta / 2);
        c[off + 2] -= zj * (beta / 2);
      } else {
        const delta = (jj - 1) / 2;
        c[off + 1] -= zj * (1 - delta + 0.75 * delta);
        c[off + 3] -= zj * (delta / 4);
      }
    }
  }
  return c;
}

function nearestIndex(S, t, lo, hi) {
  let a = lo;
  let b = hi;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (S.t[m] <= t) a = m;
    else b = m;
  }
  return t - S.t[a] <= S.t[b] - t ? a : b;
}

/**
 * Largest error / tolerance over samples i0..i1 (every `stride`-th, plus the ends), and also at
 * the midpoint after each checked sample, against the cubic Hermite interpolant of the two
 * neighbouring samples, (p0 + p1)/2 + h(v0 − v1)/8. Sampling is dense enough (≥ 16 samples per
 * r/|v|) that the Hermite midpoint is far more accurate than the tolerance, so this catches a
 * polynomial that wiggles between samples.
 */
function worstRatio(S, i0, i1, n, c, stride = 1, stopAbove = Infinity) {
  const a = S.t[i0];
  const b = S.t[i1];
  const half = (b - a) / 2;
  const mid = (a + b) / 2;
  const nc = n + 1;
  let worst = 0;
  const check = (t, px, py, pz, w) => {
    const x = (t - mid) / half;
    const dx = clenshaw(c, 0, n, x) - px;
    const dy = clenshaw(c, nc, n, x) - py;
    const dz = clenshaw(c, 2 * nc, n, x) - pz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) * w;
  };
  for (let i = i0; i <= i1; i += stride) {
    let r = check(S.t[i], S.p[3 * i], S.p[3 * i + 1], S.p[3 * i + 2], S.w[i]);
    if (i < i1) {
      const j = i + 1;
      const h = (S.t[j] - S.t[i]) / 8;
      const mx = 0.5 * (S.p[3 * i] + S.p[3 * j]) + h * (S.v[3 * i] - S.v[3 * j]);
      const my = 0.5 * (S.p[3 * i + 1] + S.p[3 * j + 1]) + h * (S.v[3 * i + 1] - S.v[3 * j + 1]);
      const mz = 0.5 * (S.p[3 * i + 2] + S.p[3 * j + 2]) + h * (S.v[3 * i + 2] - S.v[3 * j + 2]);
      r = Math.max(r, check(0.5 * (S.t[i] + S.t[j]), mx, my, mz, Math.min(S.w[i], S.w[j])));
    }
    if (r > worst) {
      worst = r;
      if (worst > stopAbove) return worst;
    }
    if (i < i1 && i + stride > i1) i = i1 - stride;
  }
  return worst;
}

/** Does a degree-n segment over i0..i1 meet the tolerance? (sampled check when `quick`) */
function segmentOk(S, i0, i1, n, quick) {
  const c = fitSegment(S, i0, i1, n);
  const count = i1 - i0 + 1;
  const stride = quick && count > 300 ? Math.ceil(count / 300) : 1;
  return worstRatio(S, i0, i1, n, c, stride, 1) <= 1;
}

/** Longest segment of degree n starting at i0 (index of its last sample), or -1. */
function longestSegment(S, i0, iEnd, n, guess) {
  const minEnd = i0 + Math.max(2, n);
  if (minEnd > iEnd) return -1;
  if (!segmentOk(S, i0, minEnd, n, true)) return -1;
  let good = minEnd;
  let bad = -1;
  const first = Math.min(iEnd, i0 + Math.max(minEnd - i0, guess ?? 0));
  if (first > good) {
    if (segmentOk(S, i0, first, n, true)) good = first;
    else bad = first;
  }
  while (bad < 0 && good < iEnd) {
    const i1 = Math.min(iEnd, i0 + 2 * (good - i0));
    if (segmentOk(S, i0, i1, n, true)) good = i1;
    else bad = i1;
  }
  while (bad > 0 && bad - good > Math.max(1, Math.floor((good - i0) / 64))) {
    const mid = (good + bad) >> 1;
    if (segmentOk(S, i0, mid, n, true)) good = mid;
    else bad = mid;
  }
  return good;
}

/**
 * Adaptive segmentation of a sample set. Greedy: from each start, every candidate degree is
 * stretched as far as the tolerance allows and the one with the most days per stored double
 * wins. When even the shortest segment fails, `refine` fetches denser samples there.
 */
async function segmentize(S, refine, label) {
  const segs = [];
  const guess = {};
  const discontinuities = [];
  let i0 = 0;
  let refinements = 0;
  while (i0 < S.t.length - 1) {
    const iEnd = S.t.length - 1;
    let best = null;
    for (const n of DEGREES) {
      const i1 = longestSegment(S, i0, iEnd, n, guess[n]);
      if (i1 < 0) continue;
      const score = (S.t[i1] - S.t[i0]) / (n + 2);
      if (!best || score > best.score * 1.02) best = { n, i1, score };
    }
    if (best) {
      // Confirm on every sample; shrink if the quick check was optimistic.
      let { n, i1 } = best;
      let c = fitSegment(S, i0, i1, n);
      while (worstRatio(S, i0, i1, n, c) > 1) {
        i1 = i0 + Math.max(Math.max(2, n), Math.floor((i1 - i0) * 0.85));
        if (i1 === best.i1) break;
        best.i1 = i1;
        c = fitSegment(S, i0, i1, n);
      }
      if (worstRatio(S, i0, i1, n, c) <= 1) {
        segs.push({ t0: S.t[i0], t1: S.t[i1], n, c, i0, i1 });
        guess[n] = i1 - i0;
        i0 = i1;
        continue;
      }
    }
    // Nothing fits even over two intervals: fetch denser samples here and try again.
    const j1 = Math.min(i0 + 2, iEnd);
    const span = S.t[j1] - S.t[i0];
    if (span > 2e-5) {
      refinements++;
      await refine(i0, j1, 8);
      continue;
    }
    // A genuine jump in the source (the samples straddling it are < 2 s apart): put a segment
    // boundary across it and leave a sub-second gap, which the evaluator bridges with the
    // previous segment. The jump is JPL's (for example where Horizons joins a design
    // trajectory to a reconstruction), so it is kept, and reported.
    const jumpVec = (i) => {
      const dt = S.t[i + 1] - S.t[i];
      return [0, 1, 2].map((d) => S.p[3 * (i + 1) + d] - S.p[3 * i + d] - 0.5 * dt * (S.v[3 * i + d] + S.v[3 * (i + 1) + d]));
    };
    const jump = (i) => Math.hypot(...jumpVec(i));
    const j = jump(i0) >= jump(i0 + 1) || i0 + 1 >= iEnd ? i0 : i0 + 1;
    const speed = Math.hypot(S.v[3 * j], S.v[3 * j + 1], S.v[3 * j + 2]); // km/day
    discontinuities.push({ t: S.t[j + 1], jumpKm: jump(j), jump: jumpVec(j), speed, cause: 'source' });
    console.warn(`  ${label}: source discontinuity of ${jump(j).toFixed(1)} km at ${isoOf(S.t[j])}`);
    if (j > i0) segs.push({ t0: S.t[i0], t1: S.t[j], n: 3, c: fitSegment(S, i0, j, 3), i0, i1: j });
    if (segs.length) segs[segs.length - 1].gapAfter = true;
    i0 = j + 1;
  }
  return { segs, refinements, discontinuities };
}

// ─── Sample sets ──────────────────────────────────────────────────────────────────────────

/** Flat sorted arrays; `w` is 1/tolerance per sample. */
function toSampleSet(rows, tolFn) {
  rows.sort((a, b) => a.t - b.t);
  const uniq = [];
  for (const r of rows) {
    if (uniq.length && Math.abs(r.t - uniq[uniq.length - 1].t) < 1e-9) continue;
    uniq.push(r);
  }
  const n = uniq.length;
  const S = { t: new Float64Array(n), p: new Float64Array(3 * n), v: new Float64Array(3 * n), w: new Float64Array(n), rows: uniq };
  uniq.forEach((r, i) => {
    S.t[i] = r.t;
    S.p.set(r.p, 3 * i);
    S.v.set(r.v, 3 * i);
    S.w[i] = 1 / tolFn(r);
  });
  return S;
}

/**
 * Join the separately fitted solution groups of one piece. Consecutive groups share the switch
 * time s (the earlier group's last sample and the later group's first are both at s), so the
 * segments meet with no gap; the join is flagged as a jump (bit 0), and the jump itself is the
 * difference between the two solutions at s.
 */
function mergeParts(parts, provider) {
  if (parts.length === 1) return parts[0];
  const N = parts.reduce((n, x) => n + x.S.t.length, 0);
  const S = { t: new Float64Array(N), p: new Float64Array(3 * N), v: new Float64Array(3 * N), w: new Float64Array(N), rows: [] };
  const segs = [];
  const discontinuities = [];
  let refinements = 0;
  let off = 0;
  parts.forEach((x, g) => {
    S.t.set(x.S.t, off);
    S.p.set(x.S.p, 3 * off);
    S.v.set(x.S.v, 3 * off);
    S.w.set(x.S.w, off);
    S.rows.push(...x.S.rows);
    for (const s of x.segs) segs.push({ ...s, i0: s.i0 + off, i1: s.i1 + off });
    discontinuities.push(...x.discontinuities);
    refinements += x.refinements;
    off += x.S.t.length;
    if (g === parts.length - 1) return;
    const A = x.S;
    const B = parts[g + 1].S;
    const ia = A.t.length - 1;
    if (Math.abs(A.t[ia] - B.t[0]) > 1e-9) throw new Error(`solution groups ${g}/${g + 1} do not meet (${A.t[ia]} vs ${B.t[0]})`);
    segs[segs.length - 1].gapAfter = true;
    const jump = [0, 1, 2].map((d) => B.p[d] - A.p[3 * ia + d]);
    const speed = Math.hypot(A.v[3 * ia], A.v[3 * ia + 1], A.v[3 * ia + 2]); // km/day
    discontinuities.push({
      t: B.t[0],
      jumpKm: Math.hypot(...jump),
      jump,
      speed,
      cause: 'solution-switch',
      from: provider.groupSource(g).command.replace(';', ''),
      to: provider.groupSource(g + 1).command.replace(';', ''),
    });
  });
  discontinuities.sort((a, b) => a.t - b.t);
  return { S, segs, refinements, discontinuities };
}

/**
 * The truth a piece is fitted to: one Horizons source, or several consecutive ones (comet
 * apparition solutions, Arrokoth's two orbits). Consecutive sources hand over with an exact
 * switch at `switchAt` s: before s the earlier solution, from s on the later one. There is no
 * cross-fade, because two solutions that differ by D km cannot be joined continuously without
 * some point lying at least D/2 from both, and D is 900–67,000 km here. The fitted track keeps
 * the switch as a jump (see `jumps` in tracks.md), so it is within its bound of the solution it
 * follows at every instant.
 *
 * Spans overlap by 2β around each switch only so that the cached Horizons grids stay the same;
 * rows of the other solution inside the overlap are not used.
 *
 * Every row carries `g`, the index of the solution group it belongs to. Two legs of the same
 * solution (the interstellar objects, split at their solution epoch) share a group.
 */
class Provider {
  constructor(spans, centreCode) {
    this.spans = spans; // [{ src, a, b, switchAt? }]
    this.centreCode = centreCode;
    let g = 0;
    spans.forEach((s, k) => {
      if (k > 0 && s.src !== spans[k - 1].src) g++;
      s.group = g;
    });
    this.groups = g + 1;
  }
  covering(t) {
    return this.spans.filter((s) => t >= s.a - 1e-9 && t <= s.b + 1e-9);
  }
  /**
   * The row(s) for ideal time t0. At a switch, `both` returns the earlier solution's and the
   * later one's rows, each moved to exactly s with its own velocity (Horizons' printed epochs
   * drift from the ideal grid by milliseconds); otherwise the later one.
   */
  combine(t0, parts, both = false) {
    const tag = (part, t = part.row.t ?? t0) => ({ t, p: part.row.p, v: part.row.v, g: part.span.group });
    // One span, or two legs of the same solution meeting at its epoch: nothing to choose.
    if (parts.length === 1 || parts[0].span.src === parts[1].span.src) return [tag(parts[0])];
    const [A, B] = parts; // earlier and later span
    const s = A.span.switchAt;
    if (Math.abs(t0 - s) < 1e-9) {
      const at = (part) => {
        const dt = s - (part.row.t ?? s);
        return { t: s, p: part.row.p.map((x, d) => x + part.row.v[d] * dt), v: part.row.v, g: part.span.group };
      };
      const a = at(A);
      const b = at(B);
      A.span.handoverKm = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
      return both ? [a, b] : [b];
    }
    return [t0 < s ? tag(A) : tag(B)];
  }
  async grid(a, b, n) {
    const times = Array.from({ length: n + 1 }, (_, i) => (i === n ? b : a + ((b - a) * i) / n));
    const perTime = times.map(() => []);
    for (const span of this.spans) {
      const idx = [];
      times.forEach((t, i) => {
        if (t >= span.a - 1e-9 && t <= span.b + 1e-9) idx.push(i);
      });
      if (!idx.length) continue;
      const i0 = idx[0];
      const i1 = idx[idx.length - 1];
      const rows =
        i1 > i0 ? await fetchGrid(span.src, this.centreCode, times[i0], times[i1], i1 - i0) : await fetchList(span.src, this.centreCode, [times[i0]]);
      rows.forEach((row, k) => perTime[i0 + k].push({ span, row }));
    }
    return times.flatMap((t, i) => {
      if (!perTime[i].length) throw new Error(`no source covers ${isoOf(t)}`);
      return this.combine(t, perTime[i], true);
    });
  }
  /** One row per time, from the solution in force at that time. */
  async list(times) {
    const perTime = times.map(() => []);
    for (const span of this.spans) {
      const sel = times.filter((t) => t >= span.a - 1e-9 && t <= span.b + 1e-9);
      if (!sel.length) continue;
      const rows = await fetchList(span.src, this.centreCode, sel);
      const byT = new Map(sel.map((t, k) => [t, rows[k]]));
      times.forEach((t, i) => {
        if (byT.has(t)) perTime[i].push({ span, row: byT.get(t) });
      });
    }
    return times.map((t, i) => this.combine(t, perTime[i])[0]);
  }
  /** Both solutions' rows at every switch time (the grid need not contain the switch). */
  async switchRows() {
    const out = [];
    for (let k = 0; k + 1 < this.spans.length; k++) {
      const A = this.spans[k];
      const B = this.spans[k + 1];
      if (A.group === B.group || A.switchAt === undefined) continue;
      const [ra] = await fetchList(A.src, this.centreCode, [A.switchAt]);
      const [rb] = await fetchList(B.src, this.centreCode, [A.switchAt]);
      out.push(...this.combine(A.switchAt, [{ span: A, row: ra }, { span: B, row: rb }], true));
    }
    return out;
  }
  /** Label of the solution used by group g. */
  groupSource(g) {
    return this.spans.find((s) => s.group === g).src;
  }
}

// ─── Pieces ───────────────────────────────────────────────────────────────────────────────

/**
 * A piece is one contiguous time range of one body relative to one centre, fitted to its own
 * sample set. Sampling starts on a coarse grid (h0 days) and is densified wherever the local
 * time scale r/|v| about the centre is short (≥ K samples per r/|v|), then again wherever
 * the fit cannot meet the tolerance.
 */
const K_TAU = 16;

async function buildPiece(piece) {
  const { provider, t0, t1 } = piece;
  const n0 = Math.max(4, Math.round((t1 - t0) / piece.h0));
  let rows = (await provider.grid(t0, t1, n0)).concat(await provider.switchRows());
  const tolFn = (r) => piece.tolTarget(Math.hypot(r.p[0], r.p[1], r.p[2]));
  // Densify by the local time scale. Contiguous intervals that need it are fetched as one
  // uniform grid at the finest step any of them needs (split where that would oversample
  // more than 8x), so each perihelion or flyby costs Horizons a few requests, not dozens.
  for (let pass = 0; pass < 12; pass++) {
    rows.sort((a, b) => a.t - b.t);
    const runs = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const A = rows[i];
      const B = rows[i + 1];
      const dt = B.t - A.t;
      const tau = Math.min(Math.hypot(...A.p) / Math.hypot(...A.v), Math.hypot(...B.p) / Math.hypot(...B.v));
      const need = tau / K_TAU;
      if (dt > need * 1.0001 && dt > 1e-5) {
        const sub = 2 ** Math.min(12, Math.ceil(Math.log2(dt / need)));
        const last = runs[runs.length - 1];
        const joins =
          last &&
          last.j === i &&
          Math.abs(last.dt - dt) < 1e-9 * Math.max(1, dt) &&
          Math.max(last.maxSub, sub) / Math.min(last.minSub, sub) <= 8;
        if (joins) {
          last.j = i + 1;
          last.maxSub = Math.max(last.maxSub, sub);
          last.minSub = Math.min(last.minSub, sub);
        } else runs.push({ i, j: i + 1, maxSub: sub, minSub: sub, dt });
      }
    }
    if (!runs.length) break;
    const add = [];
    for (const r of runs) add.push(...(await provider.grid(rows[r.i].t, rows[r.j].t, (r.j - r.i) * r.maxSub)));
    rows = rows.concat(add);
  }
  // Each solution group is fitted on its own; groups meet at the switch with an exact jump.
  const parts = [];
  for (let g = 0; g < provider.groups; g++) {
    const S = toSampleSet(
      rows.filter((r) => (r.g ?? 0) === g),
      tolFn,
    );
    if (S.t.length < 2) throw new Error(`${piece.body}: solution group ${g} has ${S.t.length} samples`);
    const refine = async (i0, j1, factor) => {
      const times = [];
      for (let i = i0; i < j1; i++) for (let k = 1; k < factor; k++) times.push(S.t[i] + ((S.t[i + 1] - S.t[i]) * k) / factor);
      const extra = await provider.list(times);
      if (extra.some((r) => (r.g ?? 0) !== g)) throw new Error(`${piece.body}: refinement crossed a solution switch`);
      Object.assign(S, toSampleSet(S.rows.concat(extra), tolFn));
    };
    const label = provider.groups > 1 ? `${piece.body}/${piece.centre}#${g}` : `${piece.body}/${piece.centre}`;
    parts.push({ S, ...(await segmentize(S, refine, label)) });
  }
  const { S, segs, refinements, discontinuities } = mergeParts(parts, provider);
  piece.discontinuities = discontinuities;
  // Error at every sample (fit samples; the independent check comes later).
  let maxErr = 0;
  let maxRatio = 0;
  let sumSq = 0;
  for (const s of segs) {
    for (let i = s.i0; i <= s.i1; i++) {
      const e = segErr(s, S.t[i], S.p.subarray(3 * i, 3 * i + 3));
      maxErr = Math.max(maxErr, e);
      maxRatio = Math.max(maxRatio, e * S.w[i]);
      sumSq += e * e;
    }
  }
  piece.samples = S;
  piece.t0 = S.t[0];
  piece.t1 = S.t[S.t.length - 1];
  piece.segs = segs;
  piece.stats = { samples: S.t.length, refinements, maxErrKm: maxErr, maxRatio, rmsKm: Math.sqrt(sumSq / S.t.length) };
  return piece;
}

function segEval(s, t) {
  const half = (s.t1 - s.t0) / 2;
  const x = (t - (s.t0 + s.t1) / 2) / half;
  const nc = s.n + 1;
  return [clenshaw(s.c, 0, s.n, x), clenshaw(s.c, nc, s.n, x), clenshaw(s.c, 2 * nc, s.n, x)];
}
function segErr(s, t, p) {
  const q = segEval(s, t);
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
}
function pieceEval(piece, t) {
  const segs = piece.segs;
  let a = 0;
  let b = segs.length - 1;
  while (a < b) {
    const m = (a + b + 1) >> 1;
    if (segs[m].t0 <= t) a = m;
    else b = m - 1;
  }
  return segEval(segs[a], t);
}


// ─── Astronomy Engine positions (what the app adds to 'ssb' and planet-centred tracks) ────

const EPS = (84381.448 / 3600) * (Math.PI / 180);
const eqjToEcl = (x, y, z) => [x, Math.cos(EPS) * y + Math.sin(EPS) * z, -Math.sin(EPS) * y + Math.cos(EPS) * z];
const AE_BODY = { ssb: 'SSB', earth: 'Earth', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto' };
/** Heliocentric ecliptic-J2000 km position of a centre according to astronomy-engine. */
function aeHelio(key, t) {
  const time = Astronomy.AstroTime.FromTerrestrialTime(t);
  const v = Astronomy.HelioVector(Astronomy.Body[AE_BODY[key]], time);
  return eqjToEcl(v.x * AU_KM, v.y * AU_KM, v.z * AU_KM);
}

// ─── Deterministic pseudo-random epochs ───────────────────────────────────────────────────

function rng(text) {
  let a = 0;
  for (const ch of text) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const norm = (p) => Math.hypot(p[0], p[1], p[2]);
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// ─── Bodies ───────────────────────────────────────────────────────────────────────────────

const WINDOW = [tdb('1981-01-01'), tdb('2200-01-01')]; // the app's precise window, 1981-01-01 to 2199-12-31
const HORIZONS_SB_SPAN = [tdb('1600-01-01'), tdb('2500-01-01')]; // inside Horizons' small-body limit (1599-12-11 to 2501-01-01)

// Fit targets are a quarter of the required bound, leaving room for error between samples.
const TOL = {
  small: { req: 1000, target: 250 },
  cruise: { req: 100, target: 25 },
  flyby: { req: 1, target: 0.25 },
};

const SMALL_BODIES = [
  { id: 'ceres', name: 'Ceres', kind: 'dwarf-planet', designation: '1 Ceres', command: '1;', h0: 4, extrapolate: 'sun' },
  { id: 'vesta', name: 'Vesta', kind: 'asteroid', designation: '4 Vesta', command: '4;', h0: 4, extrapolate: 'sun' },
  { id: 'eris', name: 'Eris', kind: 'dwarf-planet', designation: '136199 Eris (2003 UB313)', command: '136199;', h0: 16, extrapolate: 'ssb' },
  { id: 'haumea', name: 'Haumea', kind: 'dwarf-planet', designation: '136108 Haumea (2003 EL61)', command: '136108;', h0: 16, extrapolate: 'ssb' },
  { id: 'makemake', name: 'Makemake', kind: 'dwarf-planet', designation: '136472 Makemake (2005 FY9)', command: '136472;', h0: 16, extrapolate: 'ssb' },
  { id: 'gonggong', name: 'Gonggong', kind: 'tno', designation: '225088 Gonggong (2007 OR10)', command: '225088;', h0: 16, extrapolate: 'ssb' },
  { id: 'quaoar', name: 'Quaoar', kind: 'tno', designation: '50000 Quaoar (2002 LM60)', command: '50000;', h0: 16, extrapolate: 'ssb' },
  { id: 'sedna', name: 'Sedna', kind: 'tno', designation: '90377 Sedna (2003 VB12)', command: '90377;', h0: 16, extrapolate: 'ssb' },
  { id: 'orcus', name: 'Orcus', kind: 'tno', designation: '90482 Orcus (2004 DW)', command: '90482;', h0: 16, extrapolate: 'ssb' },
  {
    id: 'arrokoth',
    name: 'Arrokoth',
    kind: 'tno',
    designation: '486958 Arrokoth (2014 MU69)',
    command: '486958;',
    h0: 16,
    extrapolate: 'ssb',
    // Horizons calls the New Horizons flight-project ephemeris (target 2486958, 1993-12-25 to
    // 2034-01-08, including the spacecraft's optical navigation) more accurate than the
    // ground-based solution; the two differ by ~22,000 km at the 2019 flyby, ~48,000 km in 1995
    // and ~66,000 km in 2033 (they are closest, ~1,700 km, in 2011). Use the project ephemeris
    // where it exists and the ground-based solution outside, with an exact switch (a listed
    // jump) at each boundary. The ±180-day overlap is only what is fetched around each switch.
    sources: [
      { command: '486958;', label: 'JPL ground-based orbit solution', until: '1995-01-01' },
      { command: '2486958', label: 'New Horizons flight-project ephemeris (NavSBE_2014MU69_od159)', until: '2033-01-01' },
      { command: '486958;', label: 'JPL ground-based orbit solution' },
    ],
    overlapDays: 180,
  },
];

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
const COMETS = [
  { id: 'halley', name: 'Halley’s Comet', designation: '1P/Halley', records: ['90000030'], h0: 8, extrapolate: 'ssb' },
  { id: 'encke', name: 'Comet Encke', designation: '2P/Encke', records: range(90000082, 90000091), period: 1210, h0: 4, extrapolate: 'sun' },
  {
    id: 'churyumov-gerasimenko',
    name: 'Comet 67P/Churyumov–Gerasimenko',
    designation: '67P/Churyumov-Gerasimenko',
    records: range(90000697, 90000703),
    period: 2360,
    h0: 4,
    extrapolate: 'sun',
  },
  { id: 'hale-bopp', name: 'Comet Hale–Bopp', designation: 'C/1995 O1 (Hale-Bopp)', records: ['90002256'], h0: 8, extrapolate: 'ssb' },
];

const INTERSTELLAR = [
  { id: 'oumuamua', name: '1I/ʻOumuamua', designation: '1I/2017 U1 (ʻOumuamua)', command: 'DES=A/2017 U1;', h0: 16 },
  { id: 'borisov', name: '2I/Borisov', designation: '2I/Borisov (C/2019 Q4)', command: 'DES=C/2019 Q4;', h0: 16 },
  { id: 'atlas-3i', name: '3I/ATLAS', designation: '3I/ATLAS (C/2025 N1)', command: 'DES=C/2025 N1;', h0: 16 },
];

const SPACECRAFT = [
  { id: 'voyager1', name: 'Voyager 1', command: '-31', encounters: [['jupiter', '1979-03-05'], ['saturn', '1980-11-12']], after: 'ssb' },
  {
    id: 'voyager2',
    name: 'Voyager 2',
    command: '-32',
    encounters: [['jupiter', '1979-07-09'], ['saturn', '1981-08-26'], ['uranus', '1986-01-24'], ['neptune', '1989-08-25']],
    after: 'ssb',
  },
  {
    id: 'new-horizons',
    name: 'New Horizons',
    command: '-98',
    encounters: [['jupiter', '2007-02-28'], ['pluto', '2015-07-14'], ['arrokoth', '2019-01-01']],
    after: 'ssb',
  },
  { id: 'pioneer10', name: 'Pioneer 10', command: '-23', encounters: [['jupiter', '1973-12-04']], after: 'ssb' },
  {
    id: 'parker-solar-probe',
    name: 'Parker Solar Probe',
    command: '-96',
    encounters: [
      ['venus', '2018-10-03'],
      ['venus', '2019-12-26'],
      ['venus', '2020-07-11'],
      ['venus', '2021-02-20'],
      ['venus', '2021-10-16'],
      ['venus', '2023-08-21'],
      ['venus', '2024-11-06'],
    ],
    after: 'sun',
    h0: 0.5,
  },
  { id: 'jwst', name: 'James Webb Space Telescope', command: '-170', earthOnly: true, after: 'unknown' },
  // Orbiters: after their flybys they stay with a planet to the end of their data (`orbit`): one planet-centred
  // piece from where they cross its switch radius on the way in, fitted to the small bodies' tolerance (250 km
  // target, 1,000 km bound), to keep the file small: Juno's 70 close passes would need many more segments at 25 km.
  {
    id: 'juno',
    name: 'Juno',
    command: '-61',
    encounters: [['earth', '2013-10-09']],
    orbit: { centre: 'jupiter', arrive: '2016-07-05' },
    after: 'unknown',
  },
  {
    id: 'europa-clipper',
    name: 'Europa Clipper',
    command: '-159',
    encounters: [
      ['mars', '2025-03-01'],
      ['earth', '2026-12-03'],
    ],
    orbit: { centre: 'jupiter', arrive: '2030-04-11' },
    after: 'unknown',
  },
  { id: 'soho', name: 'SOHO', command: '-21', earthOnly: true, after: 'unknown' },
];

// ─── Edge states for extrapolation ────────────────────────────────────────────────────────

/**
 * Two-body fallback from the state at a piece edge. 'sun': heliocentric orbit about GM☉.
 * 'ssb': orbit about the barycentre with the whole Solar System's GM, as the app already does
 * for Voyager 1. The barycentric position is taken relative to astronomy-engine's barycentre
 * (the one the app adds back), so the switch at the edge is seamless in the app; the velocity
 * is Horizons' barycentric velocity.
 */
async function twoBodyEdge(centre, piece, which) {
  const S = piece.samples;
  const i = which === 'start' ? 0 : S.t.length - 1;
  const t = S.t[i];
  const p = Array.from(S.p.subarray(3 * i, 3 * i + 3));
  const v = Array.from(S.v.subarray(3 * i, 3 * i + 3)).map((x) => x / DAY_S);
  if (centre === 'sun') return { regime: 'extrapolated', model: 'two-body', centre: 'sun', epoch: t, r: p, v, mu: GM.sun };
  const cover = piece.provider.covering(t);
  const span = which === 'start' ? cover[0] : cover[cover.length - 1];
  const [bary] = await fetchList(span.src, '0', [t]);
  const ssbAe = aeHelio('ssb', t);
  const ssbDe = sub3(p, bary.p);
  return {
    regime: 'extrapolated',
    model: 'two-body',
    centre: 'ssb',
    epoch: t,
    r: sub3(p, ssbAe),
    v: bary.v.map((x) => x / DAY_S),
    mu: GM_SYSTEM,
    ssbOffsetKm: norm(sub3(ssbAe, ssbDe)),
  };
}

// ─── Comet apparition solutions ───────────────────────────────────────────────────────────

/**
 * Horizons keeps one orbit solution per apparition for periodic comets. Each perihelion
 * passage in the window uses the solution whose element epoch is closest to it; solutions
 * hand over with an exact switch at the aphelion between two passages (snapped to the coarse
 * grid), where the comet moves slowest, so the along-track difference between them is small. The spans overlap
 * by ±15 coarse steps (±60 days) only so that the grids fetched stay the same.
 */
async function cometSpans(cfg, t0, t1, h) {
  const recs = [];
  for (const r of cfg.records) {
    const src = source(`${r};`, `record ${r}`);
    const meta = parseHeader(await objectData(src.command));
    src.meta = meta;
    src.epoch = meta.elementEpochJd - J2000_JD;
    recs.push(src);
  }
  const describe = (src) => ({
    record: src.command.replace(';', ''),
    solution: src.meta.solution,
    solutionDate: src.meta.solutionDate,
    dataArc: src.meta.dataArc ?? src.meta.observations,
    elementEpoch: isoOf(src.epoch).slice(0, 10),
  });
  if (recs.length === 1) return { spans: [{ src: recs[0], a: t0, b: t1 }], plan: [{ ...describe(recs[0]), from: t0, to: t1 }], beta: 0 };
  const latest = recs[recs.length - 1];
  const a = t0 - cfg.period;
  const rows = await fetchGrid(latest, '10', a, t1, Math.round((t1 - a) / 2));
  const r = rows.map((x) => norm(x.p));
  const peri = [];
  const aph = [];
  for (let i = 1; i < r.length - 1; i++) {
    if (r[i] < r[i - 1] && r[i] <= r[i + 1]) peri.push(rows[i].t);
    if (r[i] > r[i - 1] && r[i] >= r[i + 1]) aph.push(rows[i].t);
  }
  const pick = (t) => recs.reduce((best, s) => (Math.abs(s.epoch - t) < Math.abs(best.epoch - t) ? s : best));
  const passages = peri.map((t) => ({ t, src: pick(t) }));
  const beta = 15 * h;
  const snap = (t) => t0 + Math.round((t - t0) / h) * h;
  const spans = [];
  let cur = { src: passages[0].src, a: t0 };
  for (let k = 1; k < passages.length; k++) {
    if (passages[k].src === cur.src) continue;
    const between = aph.filter((t) => t > passages[k - 1].t && t < passages[k].t);
    const s = snap(between.length ? between[0] : (passages[k - 1].t + passages[k].t) / 2);
    if (s - beta <= t0) {
      cur = { src: passages[k].src, a: t0 };
      continue;
    }
    if (s + beta >= t1) break;
    spans.push({ ...cur, b: s + beta, switchAt: s });
    cur = { src: passages[k].src, a: s - beta };
  }
  spans.push({ ...cur, b: t1 });
  const plan = spans.map((s, k) => ({
    ...describe(s.src),
    from: k === 0 ? t0 : spans[k - 1].switchAt,
    to: s.switchAt ?? t1,
    perihelia: passages.filter((p) => p.src === s.src && p.t >= (k === 0 ? t0 : spans[k - 1].switchAt) && p.t <= (s.switchAt ?? t1)).map((p) => isoOf(p.t).slice(0, 10)),
  }));
  return { spans, plan, beta };
}

// ─── Builders ─────────────────────────────────────────────────────────────────────────────

const constTol = (tol) => ({ tolTarget: () => tol.target, tolReq: () => tol.req });

async function buildSmallBody(cfg, kind) {
  const [t0, t1] = kind === 'interstellar' ? HORIZONS_SB_SPAN : WINDOW;
  const n0 = Math.round((t1 - t0) / cfg.h0);
  const h = (t1 - t0) / n0;
  let spans;
  let plan;
  let overlap = 0;
  if (cfg.records) ({ spans, plan, beta: overlap } = await cometSpans(cfg, t0, t1, h));
  else if (cfg.sources) {
    overlap = cfg.overlapDays;
    const cuts = cfg.sources.slice(0, -1).map((x) => tdb(x.until));
    spans = cfg.sources.map((x, k) => ({
      src: source(x.command, x.label),
      a: k === 0 ? t0 : cuts[k - 1] - overlap,
      b: k === cfg.sources.length - 1 ? t1 : cuts[k] + overlap,
      switchAt: cuts[k],
    }));
    plan = cfg.sources.map((x, k) => ({ source: x.label, command: x.command, from: k === 0 ? t0 : cuts[k - 1], to: k === cuts.length ? t1 : cuts[k] }));
  } else spans = [{ src: source(cfg.command, cfg.designation), a: t0, b: t1 }];
  if (kind === 'interstellar') {
    // Horizons integrates a grid from the solution epoch back to its start and then forward
    // through the whole span. For these hyperbolic, non-gravitational orbits the forward pass
    // through perihelion drifts from a direct integration (about 50,000 km by 2476 for 1I), so
    // the span is fetched as two legs that meet at the solution epoch.
    const src = spans[0].src;
    const epoch = parseHeader(await objectData(src.command)).elementEpochJd - J2000_JD;
    spans = [
      { src, a: t0, b: epoch },
      { src, a: epoch, b: t1 },
    ];
  }
  const provider = new Provider(spans, '10');
  const tick = Date.now();
  const piece = await buildPiece({ body: cfg.id, centre: 'sun', role: 'outer', t0, t1, h0: h, provider, ...constTol(TOL.small) });
  console.log(`${cfg.id}: ${spans.length} source span(s), ${piece.segs.length} segments, ${((Date.now() - tick) / 1000).toFixed(1)} s`);
  const extrap = kind === 'interstellar' ? 'ssb' : cfg.extrapolate;
  plan?.forEach((p, k) => {
    if (spans[k].handoverKm) p.handoverToNextKm = Number(spans[k].handoverKm.toPrecision(3));
  });
  return {
    cfg,
    kind: kind === 'comet' ? 'comet' : kind === 'interstellar' ? 'interstellar' : cfg.kind,
    pieces: [piece],
    plan,
    before: await twoBodyEdge(extrap, piece, 'start'),
    after: await twoBodyEdge(extrap, piece, 'end'),
  };
}

function encounterSearch(key) {
  if (key === 'venus' || key === 'mars') return { D: 3, step: 0.005 };
  if (key === 'earth') return { D: 4, step: 0.005 };
  if (key === 'pluto') return { D: 60, step: 0.05 };
  if (key === 'arrokoth') return { D: 3, step: 0.002 };
  return { D: 220, step: 0.5 };
}

const crossing = (A, B, level) => {
  const ra = norm(A.p);
  const rb = norm(B.p);
  return A.t + ((B.t - A.t) * (level - ra)) / (rb - ra);
};

/**
 * Where to switch a spacecraft to a planet-centred track, and how long to blend. The app's
 * planet (astronomy-engine) is offset from JPL's by `offset` km (tens of thousands of km for
 * the giant planets), and the planet-centred track inherits that offset, so the switch must
 * happen far enough out that the offset is small next to the distance (≤ 0.2%), and the blend
 * must be long enough that fading the offset in adds ≤ 1% to the relative speed. The switch
 * radius is at least the Laplace sphere of influence.
 */
const SWITCH_FRACTION = 0.002;
const BLEND_SPEED_FRACTION = 0.01;

async function centreOffset(key, t) {
  const [row] = await fetchList(source(CENTRES[key].code), '10', [t]);
  return norm(sub3(aeHelio(key, t), row.p));
}

async function findEncounter(src, key, near, cov) {
  const C = CENTRES[key];
  const { D, step } = encounterSearch(key);
  const a = Math.max(cov.start + 1 / 1440, near - D);
  const b = Math.min(cov.end - 1 / 1440, near + D);
  const rows = await fetchGrid(src, C.code, a, b, Math.round((b - a) / step));
  let k = 0;
  rows.forEach((row, i) => {
    if (norm(row.p) < norm(rows[k].p)) k = i;
  });
  const rMin = norm(rows[k].p);
  if (key === 'arrokoth') {
    // Arrokoth's own track (this file) follows the same flight-project ephemeris, so the
    // offset is only the fit error; ±2 days is 2.5 million km either side.
    return { key, tin: rows[k].t - 2, tout: rows[k].t + 2, rMin, beta: 0.25, switchRadius: norm(rows[0].p), offset: null };
  }
  const offset = await centreOffset(key, rows[k].t);
  const R = Math.max(C.soi, offset / SWITCH_FRACTION);
  let i = k;
  while (i > 0 && norm(rows[i].p) < R) i--;
  let j = k;
  while (j < rows.length - 1 && norm(rows[j].p) < R) j++;
  if (norm(rows[i].p) < R || norm(rows[j].p) < R) throw new Error(`${src.label}: ${key} switch radius not bracketed`);
  const tin = crossing(rows[i], rows[i + 1], R);
  const tout = crossing(rows[j - 1], rows[j], R);
  const vrel = Math.min(norm(rows[i].v), norm(rows[j].v)); // km/day
  const beta = clamp(offset / (BLEND_SPEED_FRACTION * vrel), 0.02, 0.25 * (tout - tin));
  return { key, tin, tout, rMin, beta, switchRadius: R, offset };
}

/**
 * An orbiter's arrival: where it crosses the planet's switch radius (as for a flyby, from the app's planet offset
 * at arrival) for the last time on the way in, and the blend there. It stays planet-centred from then on.
 */
async function findArrival(src, key, arrive, cov) {
  const C = CENTRES[key];
  const ta = tdb(arrive);
  const a = Math.max(cov.start + 1 / 1440, ta - 400);
  const rows = await fetchGrid(src, C.code, a, ta, 800);
  const offset = await centreOffset(key, ta);
  const R = Math.max(C.soi, offset / SWITCH_FRACTION);
  let j = rows.length - 1;
  while (j > 0 && norm(rows[j - 1].p) < R) j--;
  if (j === 0) throw new Error(`${src.label}: ${key} arrival switch radius not bracketed`);
  const tin = crossing(rows[j - 1], rows[j], R);
  const beta = clamp(offset / (BLEND_SPEED_FRACTION * norm(rows[j].v)), 0.02, 5);
  return { key, tin, beta, switchRadius: R, offset };
}

async function launchExit(src, start) {
  const offset = await centreOffset('earth', start);
  const R = Math.max(CENTRES.earth.soi, offset / SWITCH_FRACTION);
  const rows = await fetchGrid(src, CENTRES.earth.code, start, start + 8, 1600);
  for (let i = 1; i < rows.length; i++) {
    if (norm(rows[i].p) > R) {
      const exit = crossing(rows[i - 1], rows[i], R);
      const beta = clamp(offset / (BLEND_SPEED_FRACTION * norm(rows[i].v)), 0.02, 0.5 * (exit - start));
      return { exit, beta, switchRadius: R, offset };
    }
  }
  throw new Error(`${src.label}: did not leave the Earth's neighbourhood within 8 days`);
}

function planetTol(fineRadius) {
  return {
    fineRadius,
    tolTarget: (r) => (r < fineRadius ? TOL.flyby.target : TOL.cruise.target),
    tolReq: (r) => (r < fineRadius ? TOL.flyby.req : TOL.cruise.req),
  };
}

async function buildCraft(cfg) {
  const src = source(cfg.command, cfg.name);
  const cov = await coverage(src);
  const start = cov.start + 60 / DAY_S;
  const end = cov.end - 60 / DAY_S;
  const pieces = [];
  const earth = CENTRES.earth;
  const inner = (key, t0, t1, fineRadius, extra) =>
    buildPiece({
      body: cfg.id,
      centre: key,
      role: 'inner',
      t0,
      t1,
      h0: key === 'earth' && cfg.earthOnly ? 0.25 : Math.min(0.25, (t1 - t0) / 400),
      provider: new Provider([{ src, a: t0, b: t1 }], CENTRES[key].code),
      ...planetTol(fineRadius),
      ...extra,
    });
  const outer = (t0, t1) =>
    buildPiece({
      body: cfg.id,
      centre: 'sun',
      role: 'outer',
      t0,
      t1,
      h0: Math.min(cfg.h0 ?? 1, (t1 - t0) / 8),
      provider: new Provider([{ src, a: t0, b: t1 }], '10'),
      blendIn: 0,
      blendOut: 0,
      ...constTol(TOL.cruise),
    });
  const tick = Date.now();
  if (cfg.earthOnly) {
    console.log(`${cfg.id}: Earth-centred ${isoOf(start)} → ${isoOf(end)}`);
    pieces.push(await inner('earth', start, end, 10 * earth.radius, { blendIn: 0, blendOut: 0 }));
  } else {
    const L = await launchExit(src, start);
    const windows = [];
    for (const [key, near] of cfg.encounters) windows.push(await findEncounter(src, key, tdb(near), cov));
    console.log(
      `${cfg.id}: leaves Earth's neighbourhood ${isoOf(L.exit)}; ` +
        windows.map((w) => `${w.key} ${isoOf(w.tin).slice(0, 16)} → ${isoOf(w.tout).slice(0, 16)} (blend ${w.beta.toFixed(2)} d)`).join('; '),
    );
    const meta = (w) => ({ switchRadiusKm: w.switchRadius, appOffsetKm: w.offset });
    pieces.push(await inner('earth', start, L.exit, 10 * earth.radius, { blendIn: 0, blendOut: L.beta, window: meta(L) }));
    let prev = L.exit - L.beta;
    for (const w of windows) {
      pieces.push(await outer(prev, w.tin + w.beta));
      const C = CENTRES[w.key];
      const fine = Math.max(10 * C.radius, 1.5 * w.rMin);
      pieces.push(await inner(w.key, w.tin, w.tout, fine, { blendIn: w.beta, blendOut: w.beta, window: meta(w) }));
      prev = w.tout - w.beta;
    }
    if (cfg.orbit) {
      const A = await findArrival(src, cfg.orbit.centre, cfg.orbit.arrive, cov);
      console.log(`${cfg.id}: arrives at ${A.key} ${isoOf(A.tin).slice(0, 16)} (switch ${round(A.switchRadius)} km, blend ${A.beta.toFixed(2)} d)`);
      pieces.push(await outer(prev, A.tin + A.beta));
      pieces.push(
        await buildPiece({
          body: cfg.id,
          centre: A.key,
          role: 'inner',
          t0: A.tin,
          t1: end,
          h0: 0.5,
          provider: new Provider([{ src, a: A.tin, b: end }], CENTRES[A.key].code),
          blendIn: A.beta,
          blendOut: 0,
          window: { switchRadiusKm: A.switchRadius, appOffsetKm: A.offset },
          tolKm: TOL.small.req,
          ...constTol(TOL.small),
        }),
      );
    } else pieces.push(await outer(prev, end));
  }
  console.log(`${cfg.id}: ${pieces.length} pieces, ${pieces.reduce((s, p) => s + p.segs.length, 0)} segments, ${((Date.now() - tick) / 1000).toFixed(1)} s`);
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  const before = { regime: 'before-launch', centre: first.centre, epoch: first.t0, pos: Array.from(first.samples.p.subarray(0, 3)) };
  let after;
  if (cfg.after === 'unknown') {
    const n = last.samples.t.length - 1;
    after = { regime: 'unknown', centre: last.centre, epoch: last.t1, pos: Array.from(last.samples.p.subarray(3 * n, 3 * n + 3)) };
  } else after = await twoBodyEdge(cfg.after, last, 'end');
  return { cfg, kind: 'spacecraft', pieces, coverage: cov, before, after, src };
}

// ─── Closest approach / perihelion from dense samples ─────────────────────────────────────

/** Time of minimum distance to the centre near sample k (root of r·v, linear between samples). */
function minimumDistanceTime(S, k) {
  const f = (i) => S.p[3 * i] * S.v[3 * i] + S.p[3 * i + 1] * S.v[3 * i + 1] + S.p[3 * i + 2] * S.v[3 * i + 2];
  for (const i of [k - 1, k]) {
    if (i < 0 || i + 1 >= S.t.length) continue;
    const a = f(i);
    const b = f(i + 1);
    if (a <= 0 && b >= 0) return S.t[i] + ((S.t[i + 1] - S.t[i]) * -a) / (b - a);
  }
  return S.t[k];
}
function closestSample(S, lo = 0, hi = S.t.length - 1) {
  let k = lo;
  let best = Infinity;
  for (let i = lo; i <= hi; i++) {
    const r = Math.hypot(S.p[3 * i], S.p[3 * i + 1], S.p[3 * i + 2]);
    if (r < best) {
      best = r;
      k = i;
    }
  }
  return k;
}

// ─── Two-body propagation (universal variables; used only for the build report) ───────────

function stumpff(z) {
  if (z > 1e-8) {
    const s = Math.sqrt(z);
    return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / (s * s * s)];
  }
  if (z < -1e-8) {
    const s = Math.sqrt(-z);
    return [(Math.cosh(s) - 1) / -z, (Math.sinh(s) - s) / (s * s * s)];
  }
  return [1 / 2 - z / 24, 1 / 6 - z / 120];
}
function twoBody(r0, v0, dt, mu) {
  const r0m = norm(r0);
  const vr0 = (r0[0] * v0[0] + r0[1] * v0[1] + r0[2] * v0[2]) / r0m;
  const alpha = 2 / r0m - (v0[0] ** 2 + v0[1] ** 2 + v0[2] ** 2) / mu;
  const sm = Math.sqrt(mu);
  let chi = sm * Math.abs(alpha) * dt;
  if (!Number.isFinite(chi) || chi === 0) chi = (sm * dt) / r0m;
  for (let k = 0; k < 500; k++) {
    const z = alpha * chi * chi;
    const [C, S] = stumpff(z);
    const F = ((r0m * vr0) / sm) * chi * chi * C + (1 - alpha * r0m) * chi ** 3 * S + r0m * chi - sm * dt;
    const dF = ((r0m * vr0) / sm) * chi * (1 - z * S) + (1 - alpha * r0m) * chi * chi * C + r0m;
    let step = F / dF;
    if (Math.abs(step) > Math.abs(chi) && chi !== 0) step = Math.sign(step) * Math.abs(chi) * 0.5;
    chi -= step;
    if (Math.abs(step) < 1e-13 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi;
  const [C, S] = stumpff(z);
  const f = 1 - ((chi * chi) / r0m) * C;
  const g = dt - (chi ** 3 * S) / sm;
  return [0, 1, 2].map((d) => f * r0[d] + g * v0[d]);
}
/** Heliocentric position from a fallback record (the 'ssb' centre resolved with astronomy-engine). */
function fallbackHelio(fb, t) {
  if (fb.model !== 'two-body') return fb.pos;
  const r = twoBody(fb.r, fb.v, (t - fb.epoch) * DAY_S, fb.mu);
  if (fb.centre === 'sun') return r;
  const s = aeHelio('ssb', t);
  return [r[0] + s[0], r[1] + s[1], r[2] + s[2]];
}

// ─── Independent validation ───────────────────────────────────────────────────────────────

/**
 * Compare each piece with Horizons at epochs it was not fitted to: 100 random epochs over the
 * piece, plus 60 inside the flyby zone and the closest approach itself for planet-centred pieces.
 */
async function validatePiece(body, piece, idx) {
  const rand = rng(`${body.cfg.id}/${idx}/${piece.centre}`);
  const S = piece.samples;
  const times = [];
  for (let k = 0; k < 100; k++) times.push(piece.t0 + (piece.t1 - piece.t0) * rand());
  let fine = null;
  if (piece.fineRadius) {
    const k = closestSample(S);
    const r = (i) => Math.hypot(S.p[3 * i], S.p[3 * i + 1], S.p[3 * i + 2]);
    if (r(k) < piece.fineRadius) {
      let a = k;
      let b = k;
      while (a > 0 && r(a - 1) < piece.fineRadius) a--;
      while (b < S.t.length - 1 && r(b + 1) < piece.fineRadius) b++;
      fine = [S.t[a], S.t[b]];
      for (let q = 0; q < 60; q++) times.push(fine[0] + (fine[1] - fine[0]) * rand());
      if (k > 0 && k < S.t.length - 1) {
        piece.ca = minimumDistanceTime(S, k);
        times.push(piece.ca);
      }
    }
  }
  const truth = await piece.provider.list(times);
  const errs = times.map((t, i) => {
    const e = norm(sub3(pieceEval(piece, t), truth[i].p));
    const r = norm(truth[i].p);
    return { t, e, r, req: piece.tolReq(r), p: truth[i].p };
  });
  piece.validation = { errs, fine, randomCount: 100 };
}

function summarize(errs) {
  if (!errs.length) return null;
  let max = 0;
  let sq = 0;
  let ratio = 0;
  for (const x of errs) {
    max = Math.max(max, x.e);
    sq += x.e * x.e;
    ratio = Math.max(ratio, x.e / x.req);
  }
  return { points: errs.length, maxKm: max, rmsKm: Math.sqrt(sq / errs.length), worstFractionOfBound: ratio };
}

// ─── Output ───────────────────────────────────────────────────────────────────────────────

const round = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)) : x);

function packBinary(bodies) {
  const segs = [];
  for (const b of bodies)
    for (const p of b.pieces) {
      p.seg0 = segs.length;
      segs.push(...p.segs);
    }
  const HEADER = 32;
  const coefCount = segs.reduce((s, x) => s + 3 * (x.n + 1), 0);
  const coefOffset = HEADER + 24 * segs.length;
  const buf = new ArrayBuffer(coefOffset + 8 * coefCount);
  const dv = new DataView(buf);
  [0x4c, 0x54, 0x52, 0x4b].forEach((c, i) => dv.setUint8(i, c)); // 'LTRK'
  dv.setUint32(4, 1, true);
  dv.setUint32(8, segs.length, true);
  dv.setUint32(12, coefCount, true);
  dv.setUint32(16, HEADER, true);
  dv.setUint32(20, coefOffset, true);
  dv.setUint32(24, buf.byteLength, true);
  let ci = 0;
  segs.forEach((s, k) => {
    const o = HEADER + 24 * k;
    dv.setFloat64(o, s.t0, true);
    dv.setFloat64(o + 8, s.t1, true);
    dv.setUint32(o + 16, ci, true);
    dv.setUint16(o + 20, s.n, true);
    dv.setUint16(o + 22, s.gapAfter ? 1 : 0, true);
    for (let j = 0; j < s.c.length; j++) dv.setFloat64(coefOffset + 8 * (ci + j), s.c[j], true);
    ci += s.c.length;
  });
  return new Uint8Array(buf);
}

const NOTES = {
  voyager1: [
    'Horizons merges two trajectories: 1977-09-05 to 1981-01-01 is a patched-conic mission-design trajectory with "rough accuracy" (JPL); 1981-01-01 to 2100-01-01 is R. Jacobson’s 2022 refit of the 1981–1992 tracking data (DE440), a prediction after the last two-way tracking in 1992.',
    'JPL quotes a formal geocentric pointing uncertainty of about ±1.7″ (RA) and ±1.5″ (Dec) on 2030-01-01, roughly 1.3 million km at Voyager 1’s distance.',
    'After 2100-01-01 the position is a two-body hyperbola about the Solar System barycentre with the whole Solar System’s mass.',
  ],
  voyager2: [
    'Horizons merges two trajectories: 1977-08-20 to 1989-08-29 is a patched-conic mission-design trajectory with "rough accuracy" (JPL), so the Jupiter, Saturn, Uranus and Neptune flybys are design conics matched to encounter events, not reconstructions; 1989-08-29 to 2100-01-01 is R. Jacobson’s 2022 refit of the 1989–1992 tracking data (DE440).',
    'JPL quotes a formal geocentric pointing uncertainty of about ±4.7″ (RA) and ±3.7″ (Dec) on 2030-01-01.',
    'After 2100-01-01 the position is a two-body hyperbola about the Solar System barycentre with the whole Solar System’s mass.',
  ],
  'new-horizons': [
    'Concatenated KinetX navigation reconstructions and predictions (tracking cut-off 2026-07-20); the Pluto system uses the plu060 reconstruction. Prediction to 2050-01-01.',
    'The Pluto flyby is stored relative to the Pluto–Charon barycentre (Horizons 9), which is what astronomy-engine’s Pluto is. Pluto’s body centre is about 2,100 km from it.',
    'The Arrokoth flyby (±2 days) is stored relative to the New Horizons flight-project ephemeris of Arrokoth (Horizons centre 2486958) and resolved against this file’s own Arrokoth track, which follows that same ephemeris from 1995 to 2033, so the 3,538 km flyby is exact in the app.',
    'After 2050-01-01 the position is a two-body hyperbola about the Solar System barycentre.',
  ],
  pioneer10: [
    'JPL describes this trajectory (pfile10.nio, merged PN10A–G on DE118) as "suitable for general historical purposes" and to be used cautiously for high precision: the Jupiter flyby geometry relative to modern planet and satellite ephemerides may differ from the original solutions.',
    'Horizons data end 2050-01-01 (last signal 2003); later positions are a two-body hyperbola about the Solar System barycentre.',
  ],
  'parker-solar-probe': [
    'Reconstructed trajectory fitted to tracking through 2026-01-27; the reference planning trajectory after that, to 2030-01-01.',
    'After 2030-01-01 the position is a heliocentric two-body ellipse (no further Venus flybys are modelled).',
  ],
  jwst: [
    'Stored relative to the Earth (geocentre) because JWST orbits near the Sun–Earth L2 point. Definitive ephemeris to the Horizons tracking cut-off, then Goddard FDF predictions (station-keeping schedule) to 2031-09-21.',
    'After the data end the position is flagged "unknown" (the app hides it).',
  ],
  halley: ['Single Horizons solution (record 90000030, JPL#75, arc 1835–1994, with non-gravitational terms). Its 2061 perihelion is 2061-07-28.'],
  arrokoth: [
    'From 1995-01-01 to 2033-01-01 this follows the New Horizons flight-project ephemeris (Horizons 2486958, NavSBE_2014MU69_od159), which Horizons describes as more accurate than the ground-based orbit; outside it, the JPL ground-based solution (486958). The two differ by about 22,000 km at the 2019 flyby and grow apart linearly away from 2011, so each switch is an exact jump (about 48,000 km in 1995 and 66,000 km in 2033, listed under the piece’s "jumps"). No continuous path can stay within 1,000 km of both.',
  ],
  encke: ['One Horizons apparition solution per perihelion passage (see "solutions"), switched exactly at the aphelion between passages. The solutions differ there by 770–13,300 km, which the track keeps as listed jumps rather than blending: at every instant it follows one JPL solution.'],
  'churyumov-gerasimenko': ['One Horizons apparition solution per perihelion passage (see "solutions"), switched exactly at the aphelion between passages. The solutions differ there by 2,800–12,500 km, which the track keeps as listed jumps rather than blending: at every instant it follows one JPL solution.'],
  oumuamua: ['JPL solution with the Micheli et al. (2018) non-gravitational acceleration; JPL warns that the acceleration outside the 2017-10-14 to 2018-01-02 arc is assumed, so positions far from 2017 are much less certain than the fit.'],
  borisov: ['JPL#54 solution with non-gravitational terms, data arc 2019-02-24 to 2020-09-30.'],
  'atlas-3i': ['JPL#54 solution with non-gravitational terms (CO₂-driven g(r) = (1 au/r)²), data arc 2025-05-15 to 2026-02-19. Future solutions may shift it.'],
};

/** Length of the optional smoothing ramp: adds at most 1% to the speed (smoothstep peak slope 1.5). */
const rampDays = (d) => round((1.5 * d.jumpKm) / (0.01 * d.speed), 3);

function bodyJson(b, appOffsets) {
  const cfg = b.cfg;
  const pieces = b.pieces.map((p) => {
    const v = summarize(p.validation.errs.slice(0, p.validation.randomCount));
    const fineErrs = p.validation.fine ? p.validation.errs.slice(p.validation.randomCount) : [];
    const out = {
      centre: p.centre,
      role: p.role,
      t0: p.t0,
      t1: p.t1,
      seg0: p.seg0,
      segCount: p.segs.length,
      blendIn: p.blendIn ?? 0,
      blendOut: p.blendOut ?? 0,
      tolKm: p.tolKm ?? (p.role === 'inner' || b.kind === 'spacecraft' ? TOL.cruise.req : TOL.small.req),
      accuracy: {
        fitSamples: p.stats.samples,
        fitMaxKm: round(p.stats.maxErrKm),
        independent: v && { points: v.points, maxKm: round(v.maxKm), rmsKm: round(v.rmsKm) },
      },
    };
    if (p.fineRadius) {
      out.fineRadiusKm = round(p.fineRadius, 6);
      out.fineTolKm = TOL.flyby.req;
      if (fineErrs.length) {
        const f = summarize(fineErrs);
        out.accuracy.flyby = { points: f.points, maxKm: round(f.maxKm), rmsKm: round(f.rmsKm) };
      }
    }
    if (p.window) {
      out.switchRadiusKm = round(p.window.switchRadiusKm, 4);
      if (p.window.appOffsetKm != null) out.appPlanetOffsetKm = round(p.window.appOffsetKm, 3);
    }
    // Jumps: where Horizons itself joins separately fitted trajectories ('source'), and where
    // this track switches from one JPL orbit solution to the next ('solution-switch'). The data
    // keep them exactly and the default evaluation returns them as they are. On request
    // (smoothJumps) the evaluator spreads each over a smoothstep ramp centred on t, long enough
    // that the ramp adds at most 1% to the speed (see tracks.md).
    const jumps = (p.discontinuities ?? []).filter((d) => d.jumpKm >= 1);
    if (jumps.length) {
      out.jumps = jumps.map((d) => ({
        t: d.t,
        iso: isoOf(d.t).slice(0, 19),
        cause: d.cause,
        ...(d.from ? { from: d.from, to: d.to } : {}),
        jumpKm: round(d.jumpKm, 4),
        jump: d.jump.map((x) => round(x, 10)), // to ~0.1 m: the smoothing's ramp is continuous only if this is the jump itself
        rampDays: rampDays(d),
      }));
    }
    if (p.ca !== undefined) {
      out.closestApproach = { t: p.ca, iso: isoOf(p.ca), distanceKm: round(norm(pieceEval(p, p.ca)), 7) };
    }
    return out;
  });
  const allErrs = b.pieces.flatMap((p) => p.validation.errs);
  const s = summarize(allErrs);
  const fitMax = Math.max(...b.pieces.map((p) => p.stats.maxErrKm));
  const src = b.src ?? b.pieces[0].provider.spans[0].src;
  const h = src.header ?? {};
  const multi = b.plan && b.plan.length > 1;
  const horizons = multi
    ? { command: [...new Set(b.plan.map((x) => x.record ?? x.command))].join(', '), target: h.target, solutions: 'see "solutions"' }
    : {
        command: cfg.records ? cfg.records[0] : cfg.command,
        target: h.target,
        ephemeris: h.ephemeris,
        record: h.record,
        solution: h.solution,
        solutionDate: h.solutionDate,
        dataArc: h.dataArc,
      };
  if (b.coverage) horizons.coverage = [b.coverage.startText, b.coverage.endText];
  const flyby = b.pieces.flatMap((p) => (p.validation.fine ? p.validation.errs.slice(p.validation.randomCount) : []));
  const fs = summarize(flyby);
  return {
    name: cfg.name,
    designation: cfg.designation,
    kind: b.kind,
    horizons,
    solutions: b.plan,
    precise: [b.pieces[0].t0, b.pieces[b.pieces.length - 1].t1],
    preciseIso: [isoOf(b.pieces[0].t0), isoOf(b.pieces[b.pieces.length - 1].t1)],
    pieces,
    before: b.before,
    after: b.after,
    accuracy: {
      requirementKm: Math.max(...b.pieces.map((p) => p.tolKm ?? 0), b.kind === 'spacecraft' ? TOL.cruise.req : TOL.small.req),
      independentPoints: s.points,
      maxKm: round(Math.max(s.maxKm, fitMax)),
      rmsKm: round(s.rmsKm),
      fitSamples: b.pieces.reduce((n, p) => n + p.stats.samples, 0),
      fitMaxKm: round(fitMax),
      flyby: fs ? { requirementKm: TOL.flyby.req, points: fs.points, maxKm: round(fs.maxKm), rmsKm: round(fs.rmsKm) } : undefined,
    },
    appSwitchOffsetsKm: appOffsets.length ? appOffsets : undefined,
    notes: NOTES[cfg.id],
  };
}

/**
 * How far the app's centre (astronomy-engine, or this file's own track for Arrokoth) is from
 * the Horizons centre at each blend: the size of the jump a hard switch would show, which the
 * blend spreads out.
 */
async function appSwitchOffsets(b, tracksById) {
  const out = [];
  for (const p of b.pieces) {
    if (p.role !== 'inner' || !(p.blendIn || p.blendOut)) continue;
    const times = [];
    if (p.blendIn) times.push(p.t0 + p.blendIn / 2);
    if (p.blendOut) times.push(p.t1 - p.blendOut / 2);
    const C = CENTRES[p.centre];
    const truth = await fetchList(source(C.code === '2486958' ? '2486958' : C.code), '10', times);
    times.forEach((t, i) => {
      let app;
      if (p.centre === 'arrokoth') {
        const tr = tracksById.get('arrokoth');
        if (!tr) return;
        app = pieceEval(tr.pieces[0], t);
      } else app = aeHelio(p.centre, t);
      out.push({ centre: p.centre, t, iso: isoOf(t).slice(0, 19), offsetKm: round(norm(sub3(app, truth[i].p)), 4) });
    });
  }
  return out;
}

async function checkpointsFor(b) {
  const out = [];
  const id = b.cfg.id;
  const push = (x) => out.push({ body: id, ...x, tdb: x.tdb, pos: x.pos && x.pos.map((v) => Number(v.toPrecision(15))) });
  b.pieces.forEach((p, i) => {
    const v = p.validation;
    v.errs.slice(0, 6).forEach((x) => push({ kind: 'random', tdb: x.t, centre: p.centre, pos: x.p, tolKm: x.req, regime: 'precise' }));
    if (v.fine) {
      v.errs.slice(v.randomCount, v.randomCount + 4).forEach((x) => push({ kind: 'flyby', tdb: x.t, centre: p.centre, pos: x.p, tolKm: x.req, regime: 'precise' }));
    }
    if (p.ca !== undefined) {
      const x = v.errs[v.errs.length - 1];
      push({ kind: 'closest-approach', tdb: x.t, centre: p.centre, pos: x.p, tolKm: x.req, regime: 'precise', iso: isoOf(x.t) });
    }
  });
  // Blend zones: both representations must hold there.
  for (const [i, p] of b.pieces.entries()) {
    if (p.role !== 'inner') continue;
    const zones = [];
    if (p.blendIn) zones.push(p.t0 + p.blendIn / 2);
    if (p.blendOut) zones.push(p.t1 - p.blendOut / 2);
    for (const t of zones) {
      const [pin] = await p.provider.list([t]);
      push({ kind: 'blend', tdb: t, centre: p.centre, pos: pin.p, tolKm: p.tolReq(norm(pin.p)), regime: 'precise' });
      const outerPiece = b.pieces.find((q, j) => j !== i && q.role === 'outer' && t >= q.t0 && t <= q.t1);
      if (outerPiece) {
        const [pout] = await outerPiece.provider.list([t]);
        push({ kind: 'blend', tdb: t, centre: outerPiece.centre, pos: pout.p, tolKm: outerPiece.tolReq(norm(pout.p)), regime: 'precise' });
      }
    }
  }
  // Both sides of every jump (source jumps and solution switches): just before and after it,
  // and half a smoothing ramp away. The default evaluation must follow Horizons (the solution in
  // force) there too.
  for (const p of b.pieces) {
    const jumps = (p.discontinuities ?? []).filter((d) => d.jumpKm >= 1);
    if (!jumps.length) continue;
    const times = [];
    for (const d of jumps) {
      const half = rampDays(d) / 2;
      for (const dt of [-half, -1e-3, 1e-3, half]) {
        const t = d.t + dt;
        if (t > p.t0 && t < p.t1) times.push(t);
      }
    }
    const rows = await p.provider.list(times);
    times.forEach((t, k) => push({ kind: 'jump-side', tdb: t, centre: p.centre, pos: rows[k].p, tolKm: p.tolReq(norm(rows[k].p)), regime: 'precise' }));
  }
  const first = b.pieces[0];
  const last = b.pieces[b.pieces.length - 1];
  const edge = (p, which) => {
    const S = p.samples;
    const k = which === 'start' ? 0 : S.t.length - 1;
    return { t: S.t[k], p: Array.from(S.p.subarray(3 * k, 3 * k + 3)) };
  };
  const e0 = edge(first, 'start');
  const e1 = edge(last, 'end');
  if (b.kind === 'spacecraft') {
    push({ kind: 'launch-edge', tdb: e0.t, centre: first.centre, pos: e0.p, tolKm: first.tolReq(norm(e0.p)), regime: 'precise' });
    push({ kind: 'end-of-data', tdb: e1.t, centre: last.centre, pos: e1.p, tolKm: last.tolReq(norm(e1.p)), regime: 'precise' });
    push({ kind: 'regime', tdb: e0.t - 1, centre: b.before.centre, regime: 'before-launch' });
    push({ kind: 'regime', tdb: e1.t + 365.25, centre: b.after.centre, regime: b.after.regime });
  } else {
    push({ kind: 'window-edge', tdb: e0.t, centre: 'sun', pos: e0.p, tolKm: TOL.small.req, regime: 'precise' });
    push({ kind: 'window-edge', tdb: e1.t, centre: 'sun', pos: e1.p, tolKm: TOL.small.req, regime: 'precise' });
  }
  // Extrapolation checks where Horizons still has data (small bodies outside 1981–2199).
  if (b.kind !== 'spacecraft' && b.kind !== 'interstellar') {
    const times = [e0.t - 3652.5, e0.t - 365.25, e1.t + 365.25, e1.t + 3652.5];
    const spans = first.provider.spans;
    const rowsA = await fetchList(spans[0].src, '10', times.slice(0, 2));
    const rowsB = await fetchList(spans[spans.length - 1].src, '10', times.slice(2));
    const rows = rowsA.concat(rowsB);
    times.forEach((t, k) => {
      const fb = t < e0.t ? b.before : b.after;
      const err = norm(sub3(fallbackHelio(fb, t), rows[k].p));
      b.extrapolationErrors ??= [];
      b.extrapolationErrors.push({ t, iso: isoOf(t).slice(0, 10), errKm: err, distanceKm: norm(rows[k].p) });
      push({
        kind: 'extrapolated',
        tdb: t,
        centre: 'sun',
        pos: rows[k].p,
        tolKm: Math.max(1e6, Math.ceil((3 * err) / 1e5) * 1e5),
        regime: 'extrapolated',
        note: `two-body fallback vs Horizons; error at build ${Math.round(err)} km`,
      });
    });
  }
  // Halley's 2061 perihelion.
  if (id === 'halley') {
    const S = first.samples;
    const lo = S.t.findIndex((t) => t >= tdb('2061-01-01'));
    const hi = S.t.findIndex((t) => t >= tdb('2062-01-01'));
    const k = closestSample(S, lo, hi);
    const tp = minimumDistanceTime(S, k);
    const [row] = await first.provider.list([tp]);
    push({ kind: 'perihelion', tdb: tp, centre: 'sun', pos: row.p, tolKm: TOL.small.req, regime: 'precise', iso: isoOf(tp), expectDate: '2061-07-28' });
    b.perihelion2061 = isoOf(tp);
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(RAW, { recursive: true });
  const want = (id) => !ONLY || ONLY.has(id);
  const bodies = [];
  const tick = Date.now();
  for (const cfg of SMALL_BODIES) if (want(cfg.id)) bodies.push(await buildSmallBody(cfg, 'small'));
  for (const cfg of COMETS) if (want(cfg.id)) bodies.push(await buildSmallBody(cfg, 'comet'));
  for (const cfg of INTERSTELLAR) if (want(cfg.id)) bodies.push(await buildSmallBody(cfg, 'interstellar'));
  for (const cfg of SPACECRAFT) if (want(cfg.id)) bodies.push(await buildCraft(cfg));

  console.log('validating against independent Horizons epochs…');
  for (const b of bodies) for (const [i, p] of b.pieces.entries()) await validatePiece(b, p, i);

  const byId = new Map(bodies.map((b) => [b.cfg.id, b]));
  const bin = packBinary(bodies);
  const index = {
    format: 'lightspeed-tracks',
    version: 1,
    binary: 'tracks.bin',
    generated: new Date().toISOString().slice(0, 10),
    source: 'JPL Horizons API (https://ssd.jpl.nasa.gov/horizons/), NASA/JPL-Caltech',
    frame: 'Ecliptic and mean equinox of J2000 (Horizons REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF; obliquity 84381.448″)',
    time: 'TDB days since J2000.0 (JD 2451545.0 TDB)',
    units: { position: 'km', velocity: 'km/s', mu: 'km^3/s^2' },
    chebyshev: 'x = (2t − t0 − t1)/(t1 − t0); position = Σ c_k T_k(x), k = 0..n, per axis',
    centres: Object.fromEntries(Object.entries(CENTRES).map(([k, c]) => [k, { horizons: `@${c.code}`, label: c.label, ...(c.track ? { track: c.track } : {}) }])),
    bodies: {},
  };
  index.centres.ssb.appModel = 'astronomy-engine HelioVector(Body.SSB): Sun + Jupiter, Saturn, Uranus, Neptune';
  for (const b of bodies) index.bodies[b.cfg.id] = bodyJson(b, await appSwitchOffsets(b, byId));

  const partial = !!ONLY;
  const outBin = partial ? join(RAW, 'partial', 'tracks.bin') : OUT_BIN;
  const outJson = partial ? join(RAW, 'partial', 'tracks.json') : OUT_JSON;
  mkdirSync(dirname(outBin), { recursive: true });
  writeFileSync(outBin, bin);
  writeFileSync(outJson, JSON.stringify(index, null, 1) + '\n');

  if (!ARGS['no-fixtures']) {
    const checkpoints = [];
    for (const b of bodies) checkpoints.push(...(await checkpointsFor(b)));
    const fixture = {
      description:
        'Independent JPL Horizons states (ecliptic J2000, km, TDB days since J2000) at epochs the Chebyshev fits did not use, plus edges, closest approaches, blend zones and regime checks. Generated by scripts/build-tracks.mjs.',
      source: 'JPL Horizons API, NASA/JPL-Caltech',
      generated: index.generated,
      checkpoints,
    };
    const outFix = partial ? join(RAW, 'partial', 'track-checkpoints.json') : FIXTURE;
    mkdirSync(dirname(outFix), { recursive: true });
    writeFileSync(outFix, JSON.stringify(fixture, null, 1) + '\n');
    console.log(`fixture: ${checkpoints.length} checkpoints`);
  }

  // Report.
  const gz = gzipSync(bin, { level: 9 }).length;
  console.log(`\ntracks.bin ${bin.length} bytes (${(bin.length / 1048576).toFixed(3)} MiB), gzip -9 ${gz} bytes; ${requestCount} Horizons requests, ${cacheReads} cached responses; ${((Date.now() - tick) / 1000).toFixed(0)} s`);
  console.log('body                    pieces  segs    bytes   maxKm(indep)  rmsKm   fitMaxKm  flybyMaxKm');
  for (const b of bodies) {
    const j = index.bodies[b.cfg.id];
    const segs = b.pieces.reduce((s, p) => s + p.segs.length, 0);
    const bytes = b.pieces.reduce((s, p) => s + p.segs.reduce((q, x) => q + 24 + 24 * (x.n + 1), 0), 0);
    const a = j.accuracy;
    console.log(
      `${b.cfg.id.padEnd(24)}${String(b.pieces.length).padStart(4)}${String(segs).padStart(7)}${String(bytes).padStart(9)}` +
        `${String(a.maxKm).padStart(13)}${String(a.rmsKm).padStart(9)}${String(a.fitMaxKm).padStart(10)}${String(a.flyby?.maxKm ?? '').padStart(12)}`,
    );
    if (b.extrapolationErrors) console.log('    extrapolation: ' + b.extrapolationErrors.map((e) => `${e.iso} ${(e.errKm / 1e3).toFixed(0)}e3 km`).join(', '));
    if (b.perihelion2061) console.log(`    perihelion 2061: ${b.perihelion2061}`);
    if (j.appSwitchOffsetsKm) console.log('    app switch offsets (km): ' + j.appSwitchOffsetsKm.map((o) => `${o.centre} ${o.offsetKm}`).join(', '));
    if (b.before?.ssbOffsetKm || b.after?.ssbOffsetKm) console.log(`    SSB (astronomy-engine vs DE) at edges: ${round(b.before.ssbOffsetKm ?? 0)} / ${round(b.after.ssbOffsetKm ?? 0)} km`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

// Building blocks, exported for ad-hoc checks against Horizons.
export { tdb, isoOf, fetchGrid, fetchList, source, Provider, buildPiece, pieceEval, CENTRES, GM, GM_SYSTEM, twoBody, aeHelio };
