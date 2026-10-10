/**
 * The galaxy surveys' tiles (public/data/survey/, built by scripts/build-surveys.mjs; docs/data/surveys.md): what
 * the build and the app share. The octree's geometry, the precision kept, the kinds of galaxy and the surveys they
 * come from, the display law's per-galaxy light (the glows are sums of it), and the codecs of the hierarchy and of a
 * node's file.
 *
 * The build imports this file under Node, which strips the types itself: so it imports nothing without its file
 * extension and uses only TypeScript that can be erased (no enums, namespaces or parameter properties).
 *
 * The octree: a cube of SURVEY_ROOT_MPC comoving megaparsecs on a side (it holds the whole observable universe,
 * 14,165 Mpc in radius, and more), the Sun at one third of each axis, so that no level puts a boundary near the Sun
 * (1/3 is 0.0101… in binary: the Sun is never nearer than a third of a node's side to its edge). Each node holds up
 * to SURVEY_NODE_POINTS galaxies, a random sample of those in its cube that no ancestor holds; the rest go to its
 * eight children. Every level is therefore a fair sample of where the galaxies are, and every galaxy is stored once.
 * With each node come its glows: for each of its eight octants, the summed display light of the galaxies in that
 * child's subtree, where they are (the light-weighted centroid) and how spread (the rms radius): the app draws them
 * faintly where that child is not drawn (scene/Surveys.tsx).
 *
 * Positions: per galaxy, its direction from the Sun is kept to SURVEY_DIR_ARCSEC and its distance to SURVEY_DIST_MPC,
 * which is finer than either is known (DESI's fibres are 1.5″ across; one km/s of peculiar velocity moves a galaxy
 * 0.016 Mpc along the line of sight). A galaxy's step is 0.125 Mpc / 2^k, k the least that keeps its direction
 * (tierOf); the points of a node are grouped by step, each group quantised to the node's corner, sorted along a
 * Morton curve and stored as varint differences (the first 17 bits of each axis; any bits below go packed after).
 * All multi-byte numbers are little-endian.
 *
 * A catalogue may give its points more bytes than kind and luminosity: header byte 13 says how many (NODE_EXTRA_AT; 0
 * in the galaxy surveys' own tiles, which were written before it was read), each stored as a plane of one byte a point
 * after the luminosity bytes. Quaia's tiles keep its quasars' distance errors there (quaia.ts).
 */

export const SURVEY_ROOT_MPC = 32768;
/** The root cube's lowest corner on each world axis, Mpc (the Sun at the origin, one third of the way along each axis). */
export const SURVEY_ROOT_MIN_MPC = -SURVEY_ROOT_MPC / 3;
/** Galaxies a node holds at most. */
export const SURVEY_NODE_POINTS = 16384;
/** Direction from the Sun kept to this, arcsec… */
export const SURVEY_DIR_ARCSEC = 5;
/** …and distance to this, Mpc. */
export const SURVEY_DIST_MPC = 0.125;
/** The finest step any galaxy needs (k at most this): 0.125 Mpc / 2^20, for a galaxy about 0.01 Mpc from the Sun. */
export const SURVEY_MAX_TIER = 20;

/** Kinds of galaxy, as coloured (the web's orange and blue, with grey and a hue of their own for quasars). */
export const SURVEY_CLASS = { red: 0, blue: 1, other: 2, quasar: 3 } as const;
export type SurveyClass = (typeof SURVEY_CLASS)[keyof typeof SURVEY_CLASS];
export const SURVEY_CLASSES = 4;

/** The catalogues, in the order the build merges them (earlier wins a duplicate), with each one's code in the tiles. */
export const SURVEY_SOURCES = [
  { code: 0, key: 'desi-bgs', name: 'DESI DR1 Bright Galaxy Survey' },
  { code: 1, key: 'desi-lrg', name: 'DESI DR1 luminous red galaxies' },
  { code: 2, key: 'desi-elg', name: 'DESI DR1 emission-line galaxies' },
  { code: 3, key: 'desi-qso', name: 'DESI DR1 quasars' },
  { code: 4, key: 'sdss-legacy', name: 'SDSS galaxies (SDSS-I/II, DR17)' },
  { code: 5, key: 'boss', name: 'SDSS-III BOSS DR12 galaxies' },
  { code: 6, key: 'eboss-lrg', name: 'SDSS-IV eBOSS DR16 luminous red galaxies' },
  { code: 7, key: 'eboss-elg', name: 'SDSS-IV eBOSS DR16 emission-line galaxies' },
  { code: 8, key: 'eboss-qso', name: 'SDSS-IV eBOSS DR16 quasars' },
  { code: 9, key: 'dr16q', name: 'SDSS DR16 quasar catalogue' },
] as const;
export const SURVEY_SOURCE_COUNT = SURVEY_SOURCES.length;

/** A point's first attribute byte: its class in bits 0–1, its catalogue in bits 2–5. */
export const packKind = (cls: number, source: number): number => (cls & 3) | ((source & 15) << 2);
export const kindClass = (b: number): number => b & 3;
export const kindSource = (b: number): number => (b >> 2) & 15;

// ─── Luminosity ─────────────────────────────────────────────────────────────────────────

/** log10 L/L* is kept in 0.05 dex steps from −3 (byte 0) to +9.75 (byte 255). */
export const LUM_LOG_MIN = -3;
export const LUM_LOG_STEP = 0.05;
export const lumByte = (logL: number): number => Math.max(0, Math.min(255, Math.round((logL - LUM_LOG_MIN) / LUM_LOG_STEP)));
export const lumLog = (b: number): number => LUM_LOG_MIN + b * LUM_LOG_STEP;

/**
 * An L* galaxy in the r band: M_r = −21.2 (Blanton et al. 2003, ApJ 592, 819: M* − 5 log10 h = −20.44 at z = 0.1,
 * h = 0.7, the convention of the cosmic web's Ks L*: sim/cosmos/cosmicWeb.ts MKS_STAR).
 */
export const MR_STAR = -21.2;

/**
 * A galaxy's display light, by its luminosity l = L/L*: how much light its point carries on the map. Twin of mapLight
 * in render/shaders/galaxyMap.glsl (both galaxy maps draw with it). The glows are sums of it, so it must stay the same
 * function of l on both sides; any change needs the tiles built again.
 */
export function mapLight(l: number): number {
  const a = Math.min(1, Math.max(0.08, 0.6 * l ** 0.3));
  const b = Math.min(4, Math.max(0.5, l ** 0.36));
  return a * b;
}

/** mapLight of a stored luminosity byte. */
export const mapLightOfByte = (b: number): number => mapLight(10 ** lumLog(b));

// ─── Directions, frames and redshifts ───────────────────────────────────────────────────

const DEG = Math.PI / 180;
/** Mean obliquity of the J2000 ecliptic (IAU 1976), as sim/stars/constants.ts OBLIQUITY_J2000 (the tests compare them). */
export const OBLIQUITY_RAD = ((84_381.448 / 3600) * Math.PI) / 180;
const CE = Math.cos(OBLIQUITY_RAD);
const SE = Math.sin(OBLIQUITY_RAD);

/** The app's world axes, world = (x_ecl, z_ecl, −y_ecl), of an ICRS direction (degrees): a unit vector into `out` at `o`. */
export function raDecToWorld(raDeg: number, decDeg: number, out: Float64Array | number[], o = 0): void {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const x = Math.cos(d) * Math.cos(a);
  const y = Math.cos(d) * Math.sin(a);
  const z = Math.sin(d);
  out[o] = x;
  out[o + 1] = -SE * y + CE * z;
  out[o + 2] = -(CE * y + SE * z);
}

export const C_KM_S = 299_792.458;
/** The Sun's motion through the CMB (Planck 2018 I, A&A 641, A1): 369.82 km/s toward galactic (264.021°, 48.253°), as physics/cmb.ts. */
export const CMB_DIPOLE_KM_S = 369.82;
export const CMB_DIPOLE_L_DEG = 264.021;
export const CMB_DIPOLE_B_DEG = 48.253;
/** Galactic to ICRS (the transpose of the Hipparcos A_G, as sim/galaxy/frames.ts; the tests compare them). */
const GAL_TO_ICRS = [
  [-0.0548755604162154, 0.4941094278755837, -0.8676661490190047],
  [-0.873437090234885, -0.4448296299600112, -0.1980763734312015],
  [-0.4838350155487132, 0.7469822444972189, 0.4559837761750669],
];
/** The dipole's direction, an ICRS unit vector. */
export const CMB_APEX_ICRS: readonly [number, number, number] = (() => {
  const l = CMB_DIPOLE_L_DEG * DEG;
  const b = CMB_DIPOLE_B_DEG * DEG;
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  const r = GAL_TO_ICRS.map((row) => row[0] * g[0] + row[1] * g[1] + row[2] * g[2]);
  return [r[0], r[1], r[2]];
})();

/**
 * A heliocentric redshift in the CMB's frame: 1 + z_cmb = (1 + z_hel) γ (1 + β cos θ), θ between the galaxy and the
 * apex of the Sun's motion (the formula of scripts/build-local-galaxies.mjs).
 */
export function zHelioToCmb(zHel: number, raDeg: number, decDeg: number): number {
  const beta = CMB_DIPOLE_KM_S / C_KM_S;
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const cosT = Math.cos(d) * Math.cos(a) * CMB_APEX_ICRS[0] + Math.cos(d) * Math.sin(a) * CMB_APEX_ICRS[1] + Math.sin(d) * CMB_APEX_ICRS[2];
  return (1 + zHel) * gamma * (1 + beta * cosT) - 1;
}

// ─── Precision ──────────────────────────────────────────────────────────────────────────

const ARC = (SURVEY_DIR_ARCSEC / 3600) * DEG;

/**
 * The tier k of a galaxy dMpc from the Sun: its step is SURVEY_DIST_MPC / 2^k, the coarsest for which the worst error
 * of a point put at the centre of its cell (half the cell's diagonal, √3/2 of the step) stays within both the
 * distance and the direction kept (0.108 Mpc at k = 0; d × 5″ at most).
 */
export function tierOf(dMpc: number): number {
  const need = (dMpc * ARC * 2) / Math.sqrt(3);
  const k = Math.ceil(Math.log2(SURVEY_DIST_MPC / Math.max(need, 1e-12)));
  return Math.max(0, Math.min(SURVEY_MAX_TIER, k));
}
export const tierStep = (k: number): number => SURVEY_DIST_MPC / 2 ** k;

// ─── Morton codes, varints and bits ─────────────────────────────────────────────────────

/** 10 bits spread to every third bit (30 bits). */
function spread10(v: number): number {
  v &= 0x3ff;
  v = (v | (v << 16)) & 0x030000ff;
  v = (v | (v << 8)) & 0x0300f00f;
  v = (v | (v << 4)) & 0x030c30c3;
  v = (v | (v << 2)) & 0x09249249;
  return v >>> 0;
}
/** The inverse: every third bit of a 30-bit word gathered into 10. */
function compact10(v: number): number {
  v &= 0x09249249;
  v = (v ^ (v >>> 2)) & 0x030c30c3;
  v = (v ^ (v >>> 4)) & 0x0300f00f;
  v = (v ^ (v >>> 8)) & 0x030000ff;
  v = (v ^ (v >>> 16)) & 0x000003ff;
  return v;
}
const P30 = 2 ** 30;
/** Morton code of three 17-bit integers: a 51-bit integer, exact in a double. */
export function morton17(x: number, y: number, z: number): number {
  const lo = (spread10(x) | (spread10(y) << 1) | (spread10(z) << 2)) >>> 0;
  const hi = (spread10(x >>> 10) | (spread10(y >>> 10) << 1) | (spread10(z >>> 10) << 2)) >>> 0;
  return hi * P30 + lo;
}
/** The three integers of a 51-bit Morton code, into out[o..o+2]. */
export function unmorton17(key: number, out: Uint32Array | number[], o = 0): void {
  const hi = Math.floor(key / P30);
  const lo = key - hi * P30;
  out[o] = compact10(lo) | (compact10(hi) << 10);
  out[o + 1] = compact10(lo >>> 1) | (compact10(hi >>> 1) << 10);
  out[o + 2] = compact10(lo >>> 2) | (compact10(hi >>> 2) << 10);
}

/** A growable byte buffer. */
export class Bytes {
  buf = new Uint8Array(1024);
  length = 0;
  private room(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const b = new Uint8Array(size);
    b.set(this.buf.subarray(0, this.length));
    this.buf = b;
  }
  byte(v: number): void {
    this.room(1);
    this.buf[this.length++] = v;
  }
  bytes(v: Uint8Array): void {
    this.room(v.length);
    this.buf.set(v, this.length);
    this.length += v.length;
  }
  /** An unsigned integer below 2^53 as a LEB128 varint. */
  varint(v: number): void {
    this.room(8);
    while (v >= 128) {
      this.buf[this.length++] = (v % 128) | 128;
      v = Math.floor(v / 128);
    }
    this.buf[this.length++] = v;
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/** Bits written least significant first. */
export class BitWriter {
  private out = new Bytes();
  private acc = 0;
  private n = 0;
  /** `bits` (at most 24) of v. */
  write(v: number, bits: number): void {
    for (let i = 0; i < bits; i++) {
      this.acc |= ((v >>> i) & 1) << this.n;
      if (++this.n === 8) {
        this.out.byte(this.acc);
        this.acc = 0;
        this.n = 0;
      }
    }
  }
  done(): Uint8Array {
    if (this.n > 0) this.out.byte(this.acc);
    this.n = 0;
    this.acc = 0;
    return this.out.done();
  }
}

/** Reads what BitWriter wrote. */
export class BitReader {
  private readonly b: Uint8Array;
  private p: number;
  private bit = 0;
  constructor(b: Uint8Array, start: number) {
    this.b = b;
    this.p = start;
  }
  read(bits: number): number {
    let v = 0;
    for (let i = 0; i < bits; i++) {
      v |= ((this.b[this.p] >>> this.bit) & 1) << i;
      if (++this.bit === 8) {
        this.bit = 0;
        this.p++;
      }
    }
    return v >>> 0;
  }
}

// ─── A node's file ──────────────────────────────────────────────────────────────────────

export const NODE_MAGIC = 'LSSN';
export const NODE_VERSION = 1;
const NODE_HEADER = 16;
/** Header byte holding how many extra bytes each point has (0 where nothing was written there: the surveys' tiles). */
export const NODE_EXTRA_AT = 13;
/** Per octant: the light per class (4 float32), the centroid (3 float32, Mpc from the node's centre), the rms radius (float32, Mpc). */
export const GLOW_FLOATS = 8;
const GLOW_BYTES = 8 * GLOW_FLOATS * 4;
const TIER_HEADER = 16;
/** Bits of each axis in the Morton key; any below go packed after the varints. */
const MORTON_BITS = 17;

/** The glows of a node: 8 octants × GLOW_FLOATS (light of classes 0–3, centroid x y z, rms). */
export type Glows = Float32Array;

/** What a node's file holds, decoded. */
export interface DecodedNode {
  count: number;
  /** Positions, Mpc, from the node's centre (float32: what the GPU takes). */
  position: Float32Array;
  /** Per point: kind byte (class | catalogue << 2) and luminosity byte. */
  attrs: Uint8Array;
  /** Per point its extra bytes, `extraPer` of them (none in the surveys' own tiles). */
  extra: Uint8Array;
  extraPer: number;
  glows: Glows;
}

/** Side and lowest corner of a node, from its path of octant digits (0–7, x the lowest bit). */
export function nodeBox(path: readonly number[] | string): { side: number; lo: [number, number, number] } {
  let side = SURVEY_ROOT_MPC;
  const lo: [number, number, number] = [SURVEY_ROOT_MIN_MPC, SURVEY_ROOT_MIN_MPC, SURVEY_ROOT_MIN_MPC];
  for (const ch of path) {
    const c = typeof ch === 'string' ? Number(ch) : ch;
    side /= 2;
    if (c & 1) lo[0] += side;
    if (c & 2) lo[1] += side;
    if (c & 4) lo[2] += side;
  }
  return { side, lo };
}

/**
 * Encode a node: `pos` world Mpc (3 per point, float64), `tier` each point's tier, `kind` and `lum` its bytes; `lo`
 * and `side` the node's cube; `glows` its octants'; `extra` any more bytes of each point (`per` a point, interleaved).
 * The points come back in the file's order in `order` (indices into the input), which the decoder reproduces.
 */
export function encodeNode(
  pos: Float64Array,
  tier: Uint8Array,
  kind: Uint8Array,
  lum: Uint8Array,
  lo: readonly number[],
  side: number,
  glows: Glows,
  extra: { per: number; bytes: Uint8Array } | null = null,
): { bytes: Uint8Array; order: Uint32Array } {
  const n = tier.length;
  const per = extra ? extra.per : 0;
  if (per > 255 || (extra && extra.bytes.length !== n * per)) throw new Error('survey node: extra bytes do not match the points');
  const tiers = [...new Set(tier)].sort((a, b) => a - b);
  const out = new Bytes();
  const head = new DataView(new ArrayBuffer(NODE_HEADER));
  for (let i = 0; i < 4; i++) head.setUint8(i, NODE_MAGIC.charCodeAt(i));
  head.setUint16(4, NODE_VERSION, true);
  head.setUint16(6, NODE_HEADER, true);
  head.setUint32(8, n, true);
  head.setUint8(12, tiers.length);
  head.setUint8(NODE_EXTRA_AT, per);
  out.bytes(new Uint8Array(head.buffer));
  out.bytes(new Uint8Array(glows.buffer, glows.byteOffset, GLOW_BYTES).slice());
  const order = new Uint32Array(n);
  let at = 0;
  const q = [0, 0, 0];
  for (const k of tiers) {
    const step = tierStep(k);
    const bits = Math.round(Math.log2(side / step));
    const low = Math.max(0, bits - MORTON_BITS);
    const lowScale = 2 ** low;
    const max = 2 ** bits - 1;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (tier[i] === k) idx.push(i);
    const keys = new Float64Array(idx.length);
    const lows = new Float64Array(idx.length * 3);
    idx.forEach((i, j) => {
      for (let a = 0; a < 3; a++) {
        q[a] = Math.min(max, Math.max(0, Math.floor((pos[3 * i + a] - lo[a]) / step)));
        const h = Math.floor(q[a] / lowScale);
        lows[3 * j + a] = q[a] - h * lowScale;
        q[a] = h;
      }
      keys[j] = morton17(q[0], q[1], q[2]);
    });
    const perm = [...idx.keys()].sort((a, b) => keys[a] - keys[b]);
    const v = new Bytes();
    const w = new BitWriter();
    let prev = 0;
    for (const j of perm) {
      v.varint(keys[j] - prev);
      prev = keys[j];
      if (low > 0) for (let a = 0; a < 3; a++) w.write(lows[3 * j + a], low);
      order[at++] = idx[j];
    }
    const vb = v.done();
    const lb = w.done();
    const th = new DataView(new ArrayBuffer(TIER_HEADER));
    th.setUint8(0, k);
    th.setUint8(1, bits);
    th.setUint32(4, idx.length, true);
    th.setUint32(8, vb.length, true);
    th.setUint32(12, lb.length, true);
    out.bytes(new Uint8Array(th.buffer));
    out.bytes(vb);
    out.bytes(lb);
  }
  const ka = new Uint8Array(n);
  const la = new Uint8Array(n);
  for (let j = 0; j < n; j++) {
    ka[j] = kind[order[j]];
    la[j] = lum[order[j]];
  }
  out.bytes(ka);
  out.bytes(la);
  // Each extra byte as a plane of its own (one value a point, in the file's order): like values side by side, as gzip likes.
  for (let e = 0; e < per; e++) {
    const pa = new Uint8Array(n);
    for (let j = 0; j < n; j++) pa[j] = extra!.bytes[order[j] * per + e];
    out.bytes(pa);
  }
  return { bytes: out.done(), order };
}

/**
 * Decode a node's (inflated) file. `emit(j, qx, qy, qz, step)` receives each point's integer cell (from the node's
 * corner) and step; decodeNode below turns them into positions.
 */
export function decodeNodeCells(
  buffer: ArrayBuffer | Uint8Array,
  emit: (j: number, qx: number, qy: number, qz: number, step: number) => void,
): { count: number; attrs: Uint8Array; extra: Uint8Array; extraPer: number; glows: Glows } {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (magic !== NODE_MAGIC) throw new Error(`not a survey node (magic ${magic})`);
  const version = dv.getUint16(4, true);
  if (version !== NODE_VERSION) throw new Error(`unsupported survey node version ${version}`);
  const n = dv.getUint32(8, true);
  const tiers = dv.getUint8(12);
  const per = dv.getUint8(NODE_EXTRA_AT);
  let p = dv.getUint16(6, true);
  const glows = new Float32Array(8 * GLOW_FLOATS);
  for (let i = 0; i < glows.length; i++) glows[i] = dv.getFloat32(p + 4 * i, true);
  p += GLOW_BYTES;
  const q = new Uint32Array(3);
  let j = 0;
  for (let t = 0; t < tiers; t++) {
    const k = dv.getUint8(p);
    const bits = dv.getUint8(p + 1);
    const count = dv.getUint32(p + 4, true);
    const vlen = dv.getUint32(p + 8, true);
    p += TIER_HEADER;
    const step = tierStep(k);
    const low = Math.max(0, bits - MORTON_BITS);
    const lowScale = 2 ** low;
    const bits2 = new BitReader(b, p + vlen);
    const lenLow = dv.getUint32(p - TIER_HEADER + 12, true);
    let key = 0;
    for (let c = 0; c < count; c++) {
      let d = 0;
      let mult = 1;
      for (;;) {
        const byte = b[p++];
        d += (byte & 127) * mult;
        if (byte < 128) break;
        mult *= 128;
      }
      key += d;
      unmorton17(key, q);
      if (low > 0) emit(j++, q[0] * lowScale + bits2.read(low), q[1] * lowScale + bits2.read(low), q[2] * lowScale + bits2.read(low), step);
      else emit(j++, q[0], q[1], q[2], step);
    }
    p += lenLow;
  }
  if (j !== n) throw new Error(`survey node: ${j} points decoded, ${n} expected`);
  const attrs = new Uint8Array(2 * n);
  for (let i = 0; i < n; i++) {
    attrs[2 * i] = b[p + i];
    attrs[2 * i + 1] = b[p + n + i];
  }
  const extra = new Uint8Array(n * per);
  for (let e = 0; e < per; e++) for (let i = 0; i < n; i++) extra[i * per + e] = b[p + (2 + e) * n + i];
  return { count: n, attrs, extra, extraPer: per, glows };
}

/** Decode a node's file into float32 positions from its centre (Mpc) and interleaved attribute bytes, for the GPU. */
export function decodeNode(buffer: ArrayBuffer | Uint8Array, side: number): DecodedNode {
  // A point at the centre of its cell, measured from the node's centre: (q + ½) step − side / 2; in stratified order.
  const h = side / 2;
  const n = nodePointCount(buffer);
  const order = stratifiedOrder(n);
  const at = new Uint32Array(n);
  for (let j = 0; j < n; j++) at[order[j]] = j;
  const position = new Float32Array(3 * n);
  const r = decodeNodeCells(buffer, (j, qx, qy, qz, step) => {
    const k = 3 * at[j];
    position[k] = (qx + 0.5) * step - h;
    position[k + 1] = (qy + 0.5) * step - h;
    position[k + 2] = (qz + 0.5) * step - h;
  });
  const attrs = new Uint8Array(2 * n);
  for (let j = 0; j < n; j++) {
    attrs[2 * j] = r.attrs[2 * order[j]];
    attrs[2 * j + 1] = r.attrs[2 * order[j] + 1];
  }
  const per = r.extraPer;
  const extra = new Uint8Array(n * per);
  for (let j = 0; j < n; j++) for (let e = 0; e < per; e++) extra[j * per + e] = r.extra[order[j] * per + e];
  return { count: r.count, position, attrs, extra, extraPer: per, glows: r.glows };
}

/**
 * An order of n items in which every prefix is spread evenly through the whole list: bit-reversed indices, so the
 * first half takes every second item, the first quarter every fourth, and so on (`order[j]` is the item at place j).
 * A node's galaxies are kept in the file along a space-filling curve, so in this order any first so many of them are a
 * sample spread evenly over the node's space: a node drawn in part draws a prefix (lod.ts).
 */
export function stratifiedOrder(n: number): Uint32Array {
  const out = new Uint32Array(n);
  if (n === 0) return out;
  const bits = Math.max(1, Math.ceil(Math.log2(n)));
  let j = 0;
  for (let k = 0; k < 2 ** bits && j < n; k++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((k >>> b) & 1) << (bits - 1 - b);
    if (r < n) out[j++] = r;
  }
  return out;
}

/** The point count in a node file's header. */
export function nodePointCount(buffer: ArrayBuffer | Uint8Array): number {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(8, true);
}

// ─── The hierarchy ──────────────────────────────────────────────────────────────────────

export const HIERARCHY_MAGIC = 'LSSH';
export const HIERARCHY_VERSION = 2;
/**
 * The header: 64 bytes, room for 11 catalogues' counts; more grow it in steps of 16 (the size is kept at byte 6 and the
 * decoder reads it from there, so files with the 64-byte header read as before).
 */
const HIERARCHY_HEADER = 64;
export const hierarchyHeaderBytes = (sources: number): number => Math.max(HIERARCHY_HEADER, Math.ceil((20 + 4 * sources) / 16) * 16);
/**
 * childMask u8, pad u8 u16, points u32, subtree points u32, file bytes u32, box 6 × u16; then the node's own galaxies'
 * summary: light of each class 4 × u16 (log-coded: lightCode), centroid 3 × u16 and rms radius u16 (65,535ths of the
 * node's side from its corner).
 */
const NODE_RECORD = 44;

/**
 * A glow's summary: the display light of each class (4), the light-weighted centroid (3, Mpc from the node's centre)
 * and the rms radius (Mpc): GLOW_FLOATS numbers, as in a node file's glows.
 */
export type GlowSummary = Float32Array;

/** One node of the hierarchy (in breadth-first order; the root is 0). */
export interface SurveyNode {
  /** Octant digits from the root ('' for the root), which also name its file. */
  path: string;
  depth: number;
  childMask: number;
  /** Index of each child in the list, or −1. */
  children: Int32Array;
  parent: number;
  /** Which octant of its parent it is (−1 for the root). */
  octant: number;
  points: number;
  subtree: number;
  fileBytes: number;
  side: number;
  lo: [number, number, number];
  /** The subtree's galaxies' bounding box, world Mpc (lo x y z, hi x y z). */
  box: Float64Array;
  /** Its own galaxies' summary, and its whole subtree's (combined from its own and its children's on decoding). */
  own: GlowSummary;
  sub: GlowSummary;
}

export interface SurveyHierarchy {
  nodes: SurveyNode[];
  total: number;
  /** Galaxies per catalogue (SURVEY_SOURCES order). */
  perSource: number[];
}

/** Light is kept in the hierarchy in 1,024 steps an octave (0.07 %), from 2⁻¹⁶ to 2⁴⁸; 0 is none. */
export const lightCode = (v: number): number => (v > 0 ? Math.max(1, Math.min(65535, Math.round((Math.log2(v) + 16) * 1024))) : 0);
export const lightOfCode = (c: number): number => (c > 0 ? 2 ** (c / 1024 - 16) : 0);

/** What encodeHierarchy needs of a node; `own` is its own galaxies' summary with the centroid in world Mpc. */
export type HierarchyInput = Pick<SurveyNode, 'childMask' | 'points' | 'subtree' | 'fileBytes' | 'side' | 'lo' | 'box'> & { own?: ArrayLike<number> };

/** Encode the hierarchy: nodes in breadth-first order with their records; `perSource` the counts. */
export function encodeHierarchy(nodes: readonly HierarchyInput[], total: number, perSource: readonly number[]): Uint8Array {
  const head = hierarchyHeaderBytes(perSource.length);
  const buf = new ArrayBuffer(head + NODE_RECORD * nodes.length);
  const dv = new DataView(buf);
  for (let i = 0; i < 4; i++) dv.setUint8(i, HIERARCHY_MAGIC.charCodeAt(i));
  dv.setUint16(4, HIERARCHY_VERSION, true);
  dv.setUint16(6, head, true);
  dv.setUint32(8, nodes.length, true);
  dv.setUint32(12, total, true);
  dv.setUint32(16, perSource.length, true);
  perSource.forEach((c, i) => dv.setUint32(20 + 4 * i, c, true));
  const frac = (v: number, lo: number, side: number) => Math.max(0, Math.min(65535, Math.round(((v - lo) / side) * 65535)));
  nodes.forEach((n, i) => {
    const o = head + NODE_RECORD * i;
    dv.setUint8(o, n.childMask);
    dv.setUint32(o + 4, n.points, true);
    dv.setUint32(o + 8, n.subtree, true);
    dv.setUint32(o + 12, n.fileBytes, true);
    // The box in 65,535ths of the node's side from its corner, rounded outwards.
    for (let a = 0; a < 3; a++) {
      const l = Math.floor(((n.box[a] - n.lo[a]) / n.side) * 65535);
      const h = Math.ceil(((n.box[3 + a] - n.lo[a]) / n.side) * 65535);
      dv.setUint16(o + 16 + 2 * a, Math.max(0, Math.min(65535, l)), true);
      dv.setUint16(o + 22 + 2 * a, Math.max(0, Math.min(65535, h)), true);
    }
    const own = n.own;
    if (!own) return;
    for (let c = 0; c < SURVEY_CLASSES; c++) dv.setUint16(o + 28 + 2 * c, lightCode(own[c]), true);
    for (let a = 0; a < 3; a++) dv.setUint16(o + 36 + 2 * a, frac(own[4 + a], n.lo[a], n.side), true);
    dv.setUint16(o + 42, Math.max(0, Math.min(65535, Math.round((own[7] / n.side) * 65535))), true);
  });
  return new Uint8Array(buf);
}

/**
 * Combine glow summaries (each centroid from its `centre`, Mpc): the light adds, the centroid is light-weighted, the rms
 * radius comes from the second moments. Into `out`, its centroid from `centre`.
 */
export function combineGlows(parts: readonly { g: ArrayLike<number>; centre: readonly number[] }[], centre: readonly number[], out: GlowSummary): GlowSummary {
  let w = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  let m2 = 0;
  out.fill(0);
  for (const { g, centre: c } of parts) {
    let l = 0;
    for (let k = 0; k < SURVEY_CLASSES; k++) {
      out[k] += g[k];
      l += g[k];
    }
    if (!(l > 0)) continue;
    const x = c[0] + g[4] - centre[0];
    const y = c[1] + g[5] - centre[1];
    const z = c[2] + g[6] - centre[2];
    w += l;
    mx += l * x;
    my += l * y;
    mz += l * z;
    m2 += l * (g[7] * g[7] + x * x + y * y + z * z);
  }
  if (w > 0) {
    out[4] = mx / w;
    out[5] = my / w;
    out[6] = mz / w;
    out[7] = Math.sqrt(Math.max(0, m2 / w - (out[4] * out[4] + out[5] * out[5] + out[6] * out[6])));
  }
  return out;
}

/** A node's centre, world Mpc. */
export const nodeCentre = (n: Pick<SurveyNode, 'lo' | 'side'>): [number, number, number] => [n.lo[0] + n.side / 2, n.lo[1] + n.side / 2, n.lo[2] + n.side / 2];

export function decodeHierarchy(buffer: ArrayBuffer | Uint8Array): SurveyHierarchy {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (magic !== HIERARCHY_MAGIC) throw new Error(`not a survey hierarchy (magic ${magic})`);
  const version = dv.getUint16(4, true);
  if (version !== HIERARCHY_VERSION) throw new Error(`unsupported survey hierarchy version ${version}`);
  const head = dv.getUint16(6, true);
  const count = dv.getUint32(8, true);
  const total = dv.getUint32(12, true);
  const ns = dv.getUint32(16, true);
  const perSource = Array.from({ length: ns }, (_, i) => dv.getUint32(20 + 4 * i, true));
  const nodes: SurveyNode[] = [];
  // Breadth-first: each node's children follow in the order their parents come, octant by octant.
  const pending: { parent: number; octant: number }[] = [{ parent: -1, octant: -1 }];
  for (let i = 0; i < count; i++) {
    const o = head + NODE_RECORD * i;
    const { parent, octant } = pending[i];
    const path = parent < 0 ? '' : nodes[parent].path + octant;
    const { side, lo } = nodeBox(path);
    const box = new Float64Array(6);
    for (let a = 0; a < 3; a++) {
      box[a] = lo[a] + (dv.getUint16(o + 16 + 2 * a, true) / 65535) * side;
      box[3 + a] = lo[a] + (dv.getUint16(o + 22 + 2 * a, true) / 65535) * side;
    }
    const own = new Float32Array(GLOW_FLOATS);
    for (let c = 0; c < SURVEY_CLASSES; c++) own[c] = lightOfCode(dv.getUint16(o + 28 + 2 * c, true));
    for (let a = 0; a < 3; a++) own[4 + a] = (dv.getUint16(o + 36 + 2 * a, true) / 65535 - 0.5) * side;
    own[7] = (dv.getUint16(o + 42, true) / 65535) * side;
    const childMask = dv.getUint8(o);
    const node: SurveyNode = {
      path,
      depth: path.length,
      childMask,
      children: new Int32Array(8).fill(-1),
      parent,
      octant,
      points: dv.getUint32(o + 4, true),
      subtree: dv.getUint32(o + 8, true),
      fileBytes: dv.getUint32(o + 12, true),
      side,
      lo,
      box,
      own,
      sub: new Float32Array(GLOW_FLOATS),
    };
    if (parent >= 0) nodes[parent].children[octant] = i;
    nodes.push(node);
    for (let c = 0; c < 8; c++) if (childMask & (1 << c)) pending.push({ parent: i, octant: c });
  }
  if (pending.length !== count) throw new Error(`survey hierarchy: ${pending.length} nodes named, ${count} stored`);
  // Each subtree's summary, children before parents (they come after them in breadth-first order).
  for (let i = count - 1; i >= 0; i--) {
    const n = nodes[i];
    const c = nodeCentre(n);
    const parts = [{ g: n.own, centre: c }];
    for (const k of n.children) if (k >= 0) parts.push({ g: nodes[k].sub, centre: nodeCentre(nodes[k]) });
    combineGlows(parts, c, n.sub);
  }
  return { nodes, total, perSource };
}

/** A node's file name (under SURVEY_BASE_URL): 'r' and its octant digits. */
export const nodeFile = (path: string): string => `r${path}.bin.gz`;
export const HIERARCHY_FILE = 'hierarchy.bin.gz';
