/**
 * The Sun's neighbourhood in 3D dust: the map of Edenhofer et al. (2024, A&A 685, A82; CC BY 4.0), resampled by
 * scripts/build-dust.py into two nested grids (docs/data/dust.md):
 *
 *   public/data/dust/dust-outer.bin.gz   |x|, |y| ≤ 1,250 pc, |z| ≤ 400 pc in 10 pc voxels (250 × 250 × 80, 1.8 MB)
 *   public/data/dust/dust-inner.bin.gz   |x|, |y| ≤ 400 pc, |z| ≤ 200 pc in 4 pc voxels (200 × 200 × 100, 1.8 MB)
 *
 * Heliocentric galactic axes in parsecs (x towards l = 0, y towards l = 90°, z towards the north galactic pole); each
 * voxel holds its mean V-band extinction density, mag/pc (the map's unitless E of Zhang, Green & Rix 2023 per pc,
 * times 2.8, as the paper converts it). The map starts at 69 pc from the Sun (nearer, the map's authors judged the
 * extinction mostly spurious) and ends at 1,250 pc: the grids hold 0 outside that shell.
 *
 * Format (little-endian). Header, 64 bytes:
 *    0 "LSDU"   4 uint32 version = 1   8 uint32 nx   12 uint32 ny   16 uint32 nz   20 float32 voxel (pc)
 *   24 float32 x, 28 y, 32 z of the first voxel's centre (pc)   36 float32 RHO0 (mag/pc)   40 float32 LN_RANGE
 *   44 float32 A_V per E (2.8)   48 uint32 flags (0)
 * Then nx · ny · nz bytes, x fastest, then y, then z (the layout of a WebGL 3D texture). A byte c holds
 * rho = RHO0 (exp(c · LN_RANGE / 255) − 1): logarithmic, steps of 3.4 % well above RHO0 (0.2 mag/kpc), coarser below it;
 * the build found the error 1.1 % in the median, 3.3 % at most, over every voxel holding more than RHO0.
 *
 * Pure functions, no three.js: the renderer (render/dustLayer.ts) uploads the densities as half floats; the tests
 * and the cards sample them here (trilinear, as the GPU does, and integrated along a line of sight).
 */
import { PARSEC_KM } from '../../physics/constants';
import { apply, ECL_TO_GAL, WORLD_TO_GAL, type Vec3 } from '../galaxy/frames';

export const DUST_MAGIC = 'LSDU';
const HEADER_BYTES = 64;

/** The shipped grids, coarse first (the inner one is fetched only near it). */
export const DUST_FILES = { outer: 'data/dust/dust-outer.bin.gz', inner: 'data/dust/dust-inner.bin.gz' } as const;
export type DustGridName = keyof typeof DUST_FILES;

/** Where the map has data: from 69 pc to 1,250 pc from the Sun (Edenhofer et al. 2024, section 7). */
export const DUST_INNER_PC = 69;
export const DUST_OUTER_PC = 1250;

/** A_V per unit of the map's E (Edenhofer et al. 2024, section 7: A(540 nm) = 2.8 E). */
export const AV_PER_E = 2.8;

/**
 * Display colours of extinction: A_R : A_G : A_B = 0.89 : 1.00 : 1.23 times A_V, Cardelli, Clayton & Mathis (1989)
 * with R_V = 3.1 at 0.61, 0.55 and 0.465 µm (the Galaxy model's reddening: docs/data/galaxy.md §2).
 */
export const REDDENING_RGB: Vec3 = [0.89, 1.0, 1.23];

export interface DustGrid {
  nx: number;
  ny: number;
  nz: number;
  /** Voxel edge, pc. */
  voxelPc: number;
  /** The first voxel's centre, pc (heliocentric galactic). */
  firstPc: Vec3;
  rho0: number;
  lnRange: number;
  avPerE: number;
  /** One byte a voxel, x fastest. */
  codes: Uint8Array;
}

/** The density (mag/pc) a byte holds. */
export const codeToDensity = (code: number, rho0: number, lnRange: number): number => rho0 * Math.expm1((code * lnRange) / 255);

/** The byte that holds a density (mag/pc): the build's encoding, for the tests. */
export function densityToCode(rho: number, rho0: number, lnRange: number): number {
  const c = Math.round((255 * Math.log1p(Math.max(rho, 0) / rho0)) / lnRange);
  return Math.min(255, Math.max(0, c));
}

/** A grid from the file's bytes (already inflated). */
export function decodeDustGrid(buf: ArrayBuffer): DustGrid {
  if (buf.byteLength < HEADER_BYTES) throw new Error('not a dust grid');
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== DUST_MAGIC) throw new Error('not a dust grid');
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`unsupported dust grid version ${version}`);
  const nx = dv.getUint32(8, true);
  const ny = dv.getUint32(12, true);
  const nz = dv.getUint32(16, true);
  const n = nx * ny * nz;
  if (buf.byteLength < HEADER_BYTES + n) throw new Error('dust grid truncated');
  return {
    nx,
    ny,
    nz,
    voxelPc: dv.getFloat32(20, true),
    firstPc: [dv.getFloat32(24, true), dv.getFloat32(28, true), dv.getFloat32(32, true)],
    rho0: dv.getFloat32(36, true),
    lnRange: dv.getFloat32(40, true),
    avPerE: dv.getFloat32(44, true),
    codes: new Uint8Array(buf, HEADER_BYTES, n),
  };
}

/** The 256 densities (mag/pc) the bytes stand for. */
export function densityTable(g: Pick<DustGrid, 'rho0' | 'lnRange'>): Float32Array {
  const t = new Float32Array(256);
  for (let c = 0; c < 256; c++) t[c] = codeToDensity(c, g.rho0, g.lnRange);
  return t;
}

/** The grid's box, pc: its lower corner and its size along each axis. */
export function gridBox(g: Pick<DustGrid, 'nx' | 'ny' | 'nz' | 'voxelPc' | 'firstPc'>): { min: Vec3; size: Vec3 } {
  const h = g.voxelPc / 2;
  return {
    min: [g.firstPc[0] - h, g.firstPc[1] - h, g.firstPc[2] - h],
    size: [g.nx * g.voxelPc, g.ny * g.voxelPc, g.nz * g.voxelPc],
  };
}

/**
 * The density (mag/pc) at a point (pc, heliocentric galactic), trilinear between voxel centres as a GPU's linear
 * filter reads a 3D texture with its edges clamped; 0 outside the grid.
 */
export function densityAt(g: DustGrid, table: Float32Array, x: number, y: number, z: number): number {
  const fx = (x - g.firstPc[0]) / g.voxelPc;
  const fy = (y - g.firstPc[1]) / g.voxelPc;
  const fz = (z - g.firstPc[2]) / g.voxelPc;
  if (fx < -0.5 || fy < -0.5 || fz < -0.5 || fx > g.nx - 0.5 || fy > g.ny - 0.5 || fz > g.nz - 0.5) return 0;
  const cx = Math.min(Math.max(fx, 0), g.nx - 1);
  const cy = Math.min(Math.max(fy, 0), g.ny - 1);
  const cz = Math.min(Math.max(fz, 0), g.nz - 1);
  const x0 = Math.min(Math.floor(cx), g.nx - 2);
  const y0 = Math.min(Math.floor(cy), g.ny - 2);
  const z0 = Math.min(Math.floor(cz), g.nz - 2);
  const tx = cx - x0;
  const ty = cy - y0;
  const tz = cz - z0;
  const sx = 1;
  const sy = g.nx;
  const sz = g.nx * g.ny;
  const c = g.codes;
  const i = x0 + y0 * sy + z0 * sz;
  const v = (o: number) => table[c[i + o]];
  const a00 = v(0) + (v(sx) - v(0)) * tx;
  const a10 = v(sy) + (v(sy + sx) - v(sy)) * tx;
  const a01 = v(sz) + (v(sz + sx) - v(sz)) * tx;
  const a11 = v(sz + sy) + (v(sz + sy + sx) - v(sz + sy)) * tx;
  const b0 = a00 + (a10 - a00) * ty;
  const b1 = a01 + (a11 - a01) * ty;
  return b0 + (b1 - b0) * tz;
}

/** Whether a point (pc) lies inside a grid's box. */
export function insideGrid(g: DustGrid, x: number, y: number, z: number): boolean {
  const { min, size } = gridBox(g);
  return x >= min[0] && y >= min[1] && z >= min[2] && x <= min[0] + size[0] && y <= min[1] + size[1] && z <= min[2] + size[2];
}

/** The nested grids: the inner one where it covers the point (and has loaded), the outer one elsewhere. */
export interface DustGrids {
  outer: DustGrid;
  inner?: DustGrid | null;
}

/** The density (mag/pc) at a point (pc) from the finest grid that covers it. */
export function nestedDensityAt(grids: DustGrids, tables: { outer: Float32Array; inner?: Float32Array }, x: number, y: number, z: number): number {
  const inner = grids.inner;
  if (inner && tables.inner && insideGrid(inner, x, y, z)) return densityAt(inner, tables.inner, x, y, z);
  return densityAt(grids.outer, tables.outer, x, y, z);
}

/**
 * V-band extinction (mag) from point a to point b (pc), the density integrated with steps of at most `stepPc`
 * (midpoint rule) through the nested grids.
 */
export function columnAV(grids: DustGrids, tables: { outer: Float32Array; inner?: Float32Array }, a: Vec3, b: Vec3, stepPc = 0.5): number {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (!(d > 0)) return 0;
  const n = Math.max(1, Math.ceil(d / stepPc));
  const ds = d / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    sum += nestedDensityAt(grids, tables, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  }
  return sum * ds;
}

/**
 * The largest density (mag/pc) in each block of `block`³ voxels (the last blocks clipped), x fastest: the ray march
 * reads it to step over empty space (render/shaders/dust.frag.glsl). Its size is ceil(n / block) along each axis.
 */
export function blockMax(g: DustGrid, table: Float32Array, block: number): { bx: number; by: number; bz: number; data: Float32Array } {
  const bx = Math.ceil(g.nx / block);
  const by = Math.ceil(g.ny / block);
  const bz = Math.ceil(g.nz / block);
  const data = new Float32Array(bx * by * bz);
  const c = g.codes;
  for (let z = 0; z < g.nz; z++) {
    const kz = Math.floor(z / block) * bx * by;
    for (let y = 0; y < g.ny; y++) {
      const ky = kz + Math.floor(y / block) * bx;
      let i = (z * g.ny + y) * g.nx;
      for (let x = 0; x < g.nx; x++, i++) {
        const v = table[c[i]];
        const k = ky + Math.floor(x / block);
        if (v > data[k]) data[k] = v;
      }
    }
  }
  return { bx, by, bz, data };
}

/** World km (heliocentric, the app's scene axes) → heliocentric galactic pc. */
export function worldKmToGalPc(v: Readonly<{ x: number; y: number; z: number }>): Vec3 {
  const g = apply(WORLD_TO_GAL, [v.x, v.y, v.z]);
  return [g[0] / PARSEC_KM, g[1] / PARSEC_KM, g[2] / PARSEC_KM];
}

/** J2000 ecliptic → heliocentric galactic (a direction or a place in any unit). */
export const eclipticToGalactic = (v: Vec3): Vec3 => apply(ECL_TO_GAL, v);

/** Heliocentric galactic pc from galactic longitude, latitude (degrees) and distance (pc). */
export function galPcFromLbd(lDeg: number, bDeg: number, dPc: number): Vec3 {
  const l = (lDeg * Math.PI) / 180;
  const b = (bDeg * Math.PI) / 180;
  return [dPc * Math.cos(b) * Math.cos(l), dPc * Math.cos(b) * Math.sin(l), dPc * Math.sin(b)];
}

/** Galactic longitude, latitude (degrees, l in [0, 360)) and distance (pc) of a heliocentric galactic place. */
export function lbdFromGalPc(p: Vec3): { l: number; b: number; d: number } {
  const d = Math.hypot(p[0], p[1], p[2]);
  const l = ((Math.atan2(p[1], p[0]) * 180) / Math.PI + 360) % 360;
  const b = d > 0 ? (Math.asin(p[2] / d) * 180) / Math.PI : 0;
  return { l, b, d };
}

/**
 * The distances (pc from the Sun) at which the column from the Sun is kept for every direction (the Sun's sky of
 * render/dustLayer.ts, which the stars read to take out the extinction already in their catalogue magnitudes):
 * none is in front of 69 pc, where the map starts.
 */
export const SUN_KNOTS_PC: readonly number[] = [100, 150, 200, 300, 450, 650, 900, DUST_OUTER_PC];

/**
 * The column (mag) at distance d from knots: 0 at the map's inner edge, linear between knots, the last beyond.
 * Twin of dustKnots in shaders/dustRead.glsl.
 */
export function columnAtKnots(knots: readonly number[], columns: readonly number[], d: number, start = DUST_INNER_PC): number {
  if (d <= start) return 0;
  let t0 = start;
  let a0 = 0;
  for (let i = 0; i < knots.length; i++) {
    const t1 = knots[i];
    const a1 = columns[i];
    if (d <= t1) return a0 + ((a1 - a0) * (d - t0)) / Math.max(t1 - t0, 1e-9);
    t0 = t1;
    a0 = a1;
  }
  return a0;
}

/**
 * The four distances (pc from the camera) along a line of sight at which the camera's column is kept, from where
 * the line enters the map (t0) to where it leaves it (t1): geometric from max(t0, 10 pc), so that the clouds near the
 * camera are resolved as well as the far ones. Twin of the march's knots (shaders/dust.frag.glsl) and of their
 * reading (shaders/dustRead.glsl).
 */
export function cameraKnots(t0: number, t1: number): [number, number, number, number] {
  const a = Math.max(t0, 10);
  if (!(t1 > a)) return [t1, t1, t1, t1];
  const r = Math.pow(t1 / a, 0.25);
  return [a * r, a * r * r, a * r * r * r, t1];
}
