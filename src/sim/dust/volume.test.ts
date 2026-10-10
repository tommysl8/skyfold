import { describe, expect, test } from 'vitest';
import { PARSEC_KM } from '../../physics/constants';
import { gunzipFile } from '../../test/stars';
import { apply, GAL_TO_WORLD, unitFromAngles } from '../galaxy/frames';
import {
  blockMax,
  cameraKnots,
  codeToDensity,
  columnAtKnots,
  columnAV,
  decodeDustGrid,
  densityAt,
  densityTable,
  densityToCode,
  DUST_FILES,
  gridBox,
  galPcFromLbd,
  lbdFromGalPc,
  nestedDensityAt,
  SUN_KNOTS_PC,
  worldKmToGalPc,
  type DustGrid,
} from './volume';

const outer = decodeDustGrid(gunzipFile(`public/${DUST_FILES.outer}`));
const inner = decodeDustGrid(gunzipFile(`public/${DUST_FILES.inner}`));
const grids = { outer, inner };
const tables = { outer: densityTable(outer), inner: densityTable(inner) };

/** A small grid with given codes (x fastest), for the sampling tests. */
function tiny(codes: number[], n = 2): DustGrid {
  return { nx: n, ny: n, nz: n, voxelPc: 10, firstPc: [5, 5, 5], rho0: outer.rho0, lnRange: outer.lnRange, avPerE: 2.8, codes: Uint8Array.from(codes) };
}

describe('the dust grids', () => {
  test('decode: the boxes of the build (docs/data/dust.md)', () => {
    expect([outer.nx, outer.ny, outer.nz, outer.voxelPc]).toEqual([250, 250, 80, 10]);
    expect([inner.nx, inner.ny, inner.nz, inner.voxelPc]).toEqual([200, 200, 100, 4]);
    expect(gridBox(outer).min).toEqual([-1250, -1250, -400]);
    expect(gridBox(inner).size).toEqual([800, 800, 400]);
    expect(outer.avPerE).toBeCloseTo(2.8, 6);
    expect(() => decodeDustGrid(new ArrayBuffer(64))).toThrow();
  });

  test('encoding: logarithmic, 3.4 % steps well above RHO0, 0 is empty, round trip within half a step', () => {
    const { rho0, lnRange } = outer;
    expect(codeToDensity(0, rho0, lnRange)).toBe(0);
    expect(codeToDensity(255, rho0, lnRange)).toBeCloseTo(1, 4); // 1 mag/pc, the top of the range
    const step = Math.exp(lnRange / 255) - 1;
    expect(step).toBeGreaterThan(0.03);
    expect(step).toBeLessThan(0.04);
    for (const rho of [3e-4, 1e-3, 0.01, 0.1, 0.5]) {
      const back = codeToDensity(densityToCode(rho, rho0, lnRange), rho0, lnRange);
      // Half a step in ln(1 + rho / RHO0), as a share of rho.
      expect(Math.abs(back - rho) / rho).toBeLessThan(((step / 2) * (1 + rho / rho0)) / (rho / rho0) + 1e-9);
    }
    expect(densityToCode(-1, rho0, lnRange)).toBe(0);
    expect(densityToCode(10, rho0, lnRange)).toBe(255);
  });

  test('sampling: trilinear between voxel centres, as a GPU reads a 3D texture', () => {
    const g = tiny([0, 255, 0, 255, 0, 255, 0, 255]);
    const t = densityTable(g);
    const top = t[255];
    expect(densityAt(g, t, 5, 5, 5)).toBe(0);
    expect(densityAt(g, t, 15, 5, 5)).toBeCloseTo(top, 9);
    expect(densityAt(g, t, 10, 10, 10)).toBeCloseTo(top / 2, 9);
    // Clamped to the edge within half a voxel of the box, nothing beyond it.
    expect(densityAt(g, t, 19.9, 1, 1)).toBeCloseTo(top, 9);
    expect(densityAt(g, t, 20.1, 5, 5)).toBe(0);
  });

  test('a column: integrated through the nested grids, the inner one where it covers', () => {
    // Along x through a uniform tiny grid: density × length.
    const g = tiny(Array(8).fill(200));
    const t = densityTable(g);
    expect(columnAV({ outer: g }, { outer: t }, [5, 10, 10], [15, 10, 10], 0.1)).toBeCloseTo(10 * t[200], 6);
    // The nested sampler uses the inner grid inside its box.
    const p = galPcFromLbd(171.6, -15.1, 148);
    expect(nestedDensityAt(grids, tables, ...p)).toBeCloseTo(densityAt(inner, tables.inner, ...p), 12);
  });

  test('blocks: the largest density of each 8³ block', () => {
    const b = blockMax(inner, tables.inner, 8);
    expect([b.bx, b.by, b.bz]).toEqual([25, 25, 13]);
    let big = 0;
    for (let i = 0; i < inner.codes.length; i++) big = Math.max(big, tables.inner[inner.codes[i]]);
    expect(Math.max(...b.data)).toBeCloseTo(big, 9);
    // Every voxel is under its block's maximum.
    for (let i = 0; i < inner.codes.length; i += 997) {
      const x = i % inner.nx;
      const y = Math.floor(i / inner.nx) % inner.ny;
      const z = Math.floor(i / (inner.nx * inner.ny));
      const k = Math.floor(x / 8) + Math.floor(y / 8) * b.bx + Math.floor(z / 8) * b.bx * b.by;
      expect(tables.inner[inner.codes[i]]).toBeLessThanOrEqual(b.data[k]);
    }
  });

  test('coordinates: world km to galactic pc, and galactic longitude, latitude and distance', () => {
    for (const [l, b] of [
      [0, 0],
      [90, 0],
      [171.6, -15.1],
      [300, 60],
    ]) {
      const u = unitFromAngles(l, b);
      const w = apply(GAL_TO_WORLD, u).map((v) => v * 100 * PARSEC_KM);
      const p = worldKmToGalPc({ x: w[0], y: w[1], z: w[2] });
      const q = galPcFromLbd(l, b, 100);
      for (let k = 0; k < 3; k++) expect(p[k]).toBeCloseTo(q[k], 9);
      const back = lbdFromGalPc(q);
      expect(back.l).toBeCloseTo(l, 9);
      expect(back.b).toBeCloseTo(b, 9);
      expect(back.d).toBeCloseTo(100, 9);
    }
  });

  test('knots: the Sun’s and the camera’s, and the column read back from them', () => {
    expect(SUN_KNOTS_PC[SUN_KNOTS_PC.length - 1]).toBe(1250);
    expect(columnAtKnots([100, 200], [1, 3], 50)).toBe(0);
    expect(columnAtKnots([100, 200], [1, 3], 150)).toBeCloseTo(2, 12);
    expect(columnAtKnots([100, 200], [1, 3], 1000)).toBe(3);
    expect(columnAtKnots([100, 200], [1, 3], 84.5)).toBeCloseTo(0.5, 12);
    // From inside: geometric from 10 pc to where the line leaves the map.
    const k = cameraKnots(0, 1250);
    expect(k[3]).toBe(1250);
    expect(k[1] / k[0]).toBeCloseTo(k[2] / k[1], 9);
    expect(k[0]).toBeCloseTo(10 * 125 ** 0.25, 9);
    // From outside: between entry and exit.
    const o = cameraKnots(1600, 2400);
    expect(o[0]).toBeGreaterThan(1600);
    expect(o[3]).toBe(2400);
  });

  test('the map against the paper: the Local Bubble is nearly empty, the plane is not', () => {
    const fromSun = (l: number, b: number, d: number) => columnAV(grids, tables, [0, 0, 0], galPcFromLbd(l, b, d), 1);
    // Towards the poles, out of the box (400 pc up): a few hundredths of a magnitude (Edenhofer et al. 2024, figure 3).
    expect(fromSun(0, 90, 399)).toBeLessThan(0.05);
    expect(fromSun(0, -90, 399)).toBeLessThan(0.08);
    // Through Taurus: over a magnitude by 250 pc; in the plane across the map, one to three.
    expect(fromSun(172, -16, 250)).toBeGreaterThan(1);
    const plane = fromSun(90, 0, 1249);
    expect(plane).toBeGreaterThan(1);
    expect(plane).toBeLessThan(4);
    // Nothing inside 69 pc, where the map starts (but for the voxels that straddle it).
    expect(fromSun(172, -16, 60)).toBeLessThan(1e-3);
  });
});
