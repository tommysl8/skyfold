/**
 * The surveys' tiles: the codec keeps every galaxy within the stated precision (5″ in direction, 0.125 Mpc in
 * distance), the hierarchy survives its round trip, and the constants the build copies agree with the app's own.
 */
import { describe, expect, it } from 'vitest';
import {
  CMB_APEX_ICRS,
  CMB_DIPOLE_B_DEG,
  CMB_DIPOLE_KM_S,
  CMB_DIPOLE_L_DEG,
  decodeHierarchy,
  decodeNodeCells,
  encodeHierarchy,
  encodeNode,
  GLOW_FLOATS,
  lumByte,
  lumLog,
  morton17,
  nodeBox,
  OBLIQUITY_RAD,
  raDecToWorld,
  SURVEY_DIR_ARCSEC,
  SURVEY_DIST_MPC,
  SURVEY_ROOT_MIN_MPC,
  SURVEY_ROOT_MPC,
  tierOf,
  tierStep,
  unmorton17,
  zHelioToCmb,
} from './format';
import { seeded } from './tile';
import { OBLIQUITY_J2000 } from '../stars/constants';
import { GAL_TO_ICRS } from '../galaxy/frames';
import { CMB_DIPOLE_B_DEG as APP_B, CMB_DIPOLE_KM_S as APP_V, CMB_DIPOLE_L_DEG as APP_L } from '../../physics/cmb';
import { worldPositions, type CosmicWeb } from '../cosmos/cosmicWeb';
import { cosmology } from '../cosmos/cosmology';

const ARC = (Math.PI / 180 / 3600) * SURVEY_DIR_ARCSEC;

/** Points in a node (world Mpc), at distances from the Sun spread over the tiers, some near its faces. */
function samplePoints(path: string, n: number, rand: () => number): Float64Array {
  const { side, lo } = nodeBox(path);
  const p = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) p[3 * i + a] = lo[a] + side * (i % 17 === 0 ? (rand() < 0.5 ? 1e-9 : 1 - 1e-9) : rand());
  return p;
}

function roundTrip(path: string, n: number, seed: number): { worstDirArcsec: number; worstDistMpc: number; tiers: number } {
  const rand = seeded(seed);
  const { side, lo } = nodeBox(path);
  const pos = samplePoints(path, n, rand);
  const tier = new Uint8Array(n);
  const kind = new Uint8Array(n);
  const lum = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    tier[i] = tierOf(Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]));
    kind[i] = i % 64;
    lum[i] = (i * 7) % 256;
  }
  const glows = new Float32Array(8 * GLOW_FLOATS).map((_, i) => i * 0.5);
  const { bytes, order } = encodeNode(pos, tier, kind, lum, lo, side, glows);
  let worstDir = 0;
  let worstDist = 0;
  const out = decodeNodeCells(bytes, (j, qx, qy, qz, step) => {
    const i = order[j];
    const x = lo[0] + (qx + 0.5) * step;
    const y = lo[1] + (qy + 0.5) * step;
    const z = lo[2] + (qz + 0.5) * step;
    const r0 = Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
    const r1 = Math.hypot(x, y, z);
    worstDist = Math.max(worstDist, Math.abs(r1 - r0));
    const dot = (x * pos[3 * i] + y * pos[3 * i + 1] + z * pos[3 * i + 2]) / (r0 * r1);
    const cross = Math.hypot(y * pos[3 * i + 2] - z * pos[3 * i + 1], z * pos[3 * i] - x * pos[3 * i + 2], x * pos[3 * i + 1] - y * pos[3 * i]) / (r0 * r1);
    worstDir = Math.max(worstDir, Math.atan2(cross, dot) / (ARC / SURVEY_DIR_ARCSEC));
  });
  expect(out.count).toBe(n);
  for (let j = 0; j < n; j++) {
    expect(out.attrs[2 * j]).toBe(kind[order[j]]);
    expect(out.attrs[2 * j + 1]).toBe(lum[order[j]]);
  }
  expect([...out.glows]).toEqual([...glows]);
  return { worstDirArcsec: worstDir, worstDistMpc: worstDist, tiers: new Set(tier).size };
}

describe('a node file', () => {
  it('keeps every galaxy within 5″ and 0.125 Mpc, in the root (with bits below the Morton key)', () => {
    const r = roundTrip('', 4000, 1);
    expect(r.tiers).toBeGreaterThanOrEqual(3);
    expect(r.worstDirArcsec).toBeLessThanOrEqual(SURVEY_DIR_ARCSEC);
    expect(r.worstDistMpc).toBeLessThanOrEqual(SURVEY_DIST_MPC);
  });

  it('keeps them in a small node near the Sun, where directions need the finest steps', () => {
    // The node of depth 8 holding the Sun: its side is 128 Mpc, and galaxies in it are as close as 0.1 Mpc.
    let path = '';
    for (let d = 0; d < 8; d++) {
      const { side, lo } = nodeBox(path);
      const h = side / 2;
      path += (0 >= lo[0] + h ? 1 : 0) | (0 >= lo[1] + h ? 2 : 0) | (0 >= lo[2] + h ? 4 : 0);
    }
    const r = roundTrip(path, 3000, 2);
    expect(r.worstDirArcsec).toBeLessThanOrEqual(SURVEY_DIR_ARCSEC);
    expect(r.worstDistMpc).toBeLessThanOrEqual(SURVEY_DIST_MPC);
  });

  it('chooses the coarsest step that keeps the precision', () => {
    for (const d of [0.5, 9, 100, 1000, 7000]) {
      const k = tierOf(d);
      const worst = (Math.sqrt(3) / 2) * tierStep(k);
      expect(worst).toBeLessThanOrEqual(SURVEY_DIST_MPC);
      expect(worst).toBeLessThanOrEqual(d * ARC);
      // One step coarser would not do (unless it is the coarsest, 0.125 Mpc).
      if (k > 0) expect((Math.sqrt(3) / 2) * tierStep(k - 1)).toBeGreaterThan(d * ARC);
    }
  });

  it('interleaves and splits 17-bit Morton codes exactly', () => {
    const o = [0, 0, 0];
    const rand = seeded(3);
    for (let i = 0; i < 2000; i++) {
      const x = Math.floor(rand() * 131072);
      const y = Math.floor(rand() * 131072);
      const z = Math.floor(rand() * 131072);
      unmorton17(morton17(x, y, z), o);
      expect(o).toEqual([x, y, z]);
    }
    expect(morton17(1, 0, 0)).toBe(1);
    expect(morton17(0, 1, 0)).toBe(2);
    expect(morton17(0, 0, 1)).toBe(4);
    expect(morton17(131071, 131071, 131071)).toBe(2 ** 51 - 1);
  });

  it('stores luminosity in 0.05 dex', () => {
    for (const l of [-2.5, -0.33, 0, 0.231, 1.7]) expect(Math.abs(lumLog(lumByte(l)) - l)).toBeLessThanOrEqual(0.025 + 1e-12);
  });
});

describe('the hierarchy', () => {
  it('names each node from the breadth-first order and keeps its box to 1/65,535 of its side', () => {
    const paths = ['', '0', '5', '07', '52', '53', '071'];
    const nodes = paths.map((path) => {
      const { side, lo } = nodeBox(path);
      const kids = paths.filter((p) => p.length === path.length + 1 && p.startsWith(path)).map((p) => Number(p[path.length]));
      const box = Float64Array.of(lo[0] + 0.1 * side, lo[1] + 0.2 * side, lo[2] + 0.3 * side, lo[0] + 0.6 * side, lo[1] + 0.7 * side, lo[2] + 0.9 * side);
      return { childMask: kids.reduce((m, c) => m | (1 << c), 0), points: 10 + path.length, subtree: 100, fileBytes: 1234, side, lo, box };
    });
    const h = decodeHierarchy(encodeHierarchy(nodes, 999, [1, 2, 3]));
    expect(h.nodes.map((n) => n.path)).toEqual(paths);
    expect(h.total).toBe(999);
    expect(h.perSource).toEqual([1, 2, 3]);
    // More catalogues than the 64-byte header holds (11) grow it; the decoder reads its size from the file.
    const many = Array.from({ length: 12 }, (_, i) => 100 + i);
    const h12 = decodeHierarchy(encodeHierarchy(nodes, 999, many));
    expect(h12.perSource).toEqual(many);
    expect(h12.nodes.map((n) => n.path)).toEqual(paths);
    expect(h12.nodes[3].points).toBe(nodes[3].points);
    expect(new DataView(encodeHierarchy(nodes, 999, many).buffer).getUint16(6, true)).toBe(80);
    expect(new DataView(encodeHierarchy(nodes, 999, many.slice(0, 11)).buffer).getUint16(6, true)).toBe(64);
    expect(h.nodes[3].parent).toBe(1);
    expect(h.nodes[1].children[7]).toBe(3);
    h.nodes.forEach((n, i) => {
      expect(n.points).toBe(nodes[i].points);
      for (let k = 0; k < 6; k++) expect(Math.abs(n.box[k] - nodes[i].box[k])).toBeLessThanOrEqual(n.side / 65535);
      // Rounded outwards.
      for (let k = 0; k < 3; k++) {
        expect(n.box[k]).toBeLessThanOrEqual(nodes[i].box[k]);
        expect(n.box[3 + k]).toBeGreaterThanOrEqual(nodes[i].box[3 + k]);
      }
    });
  });

  it('puts the Sun at one third of the root on every axis', () => {
    expect(-SURVEY_ROOT_MIN_MPC / SURVEY_ROOT_MPC).toBeCloseTo(1 / 3, 12);
  });
});

describe('what the build copies from the app', () => {
  it('uses the app’s obliquity, galactic frame and CMB dipole', () => {
    expect(OBLIQUITY_RAD).toBe(OBLIQUITY_J2000);
    expect([CMB_DIPOLE_KM_S, CMB_DIPOLE_L_DEG, CMB_DIPOLE_B_DEG]).toEqual([APP_V, APP_L, APP_B]);
    const l = (CMB_DIPOLE_L_DEG * Math.PI) / 180;
    const b = (CMB_DIPOLE_B_DEG * Math.PI) / 180;
    const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
    for (let r = 0; r < 3; r++) expect(CMB_APEX_ICRS[r]).toBeCloseTo(GAL_TO_ICRS[r][0] * g[0] + GAL_TO_ICRS[r][1] * g[1] + GAL_TO_ICRS[r][2] * g[2], 14);
  });

  it('turns a direction into the app’s world axes as the cosmic web does', () => {
    const cw = { count: 3, ra: Float32Array.of(0, 187.7059, 350.1), dec: Float32Array.of(0, 12.3911, -45.2), vcmb: Int16Array.of(3000, 3000, 3000), vgroup: Int16Array.of(-32768, -32768, -32768), dm: new Uint16Array(3), dmgroup: new Uint16Array(3), ks: new Uint16Array(3), edm: new Uint8Array(3), edmgroup: new Uint8Array(3), methods: new Uint8Array(3), axisratio: new Uint8Array(3), pa: new Uint8Array(3) } as CosmicWeb;
    const web = worldPositions(cw, cosmology(), 'redshift');
    const u = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      raDecToWorld(cw.ra[i], cw.dec[i], u);
      const d = Math.hypot(web[3 * i], web[3 * i + 1], web[3 * i + 2]);
      for (let a = 0; a < 3; a++) expect(u[a] * d).toBeCloseTo(web[3 * i + a], 3);
    }
  });

  it('takes a redshift to the CMB frame: largest towards the apex, smallest away from it', () => {
    const apex = { ra: (Math.atan2(CMB_APEX_ICRS[1], CMB_APEX_ICRS[0]) * 180) / Math.PI, dec: (Math.asin(CMB_APEX_ICRS[2]) * 180) / Math.PI };
    const beta = CMB_DIPOLE_KM_S / 299_792.458;
    expect(zHelioToCmb(0.1, apex.ra, apex.dec)).toBeCloseTo(1.1 * Math.sqrt((1 + beta) / (1 - beta)) - 1, 10);
    expect(zHelioToCmb(0.1, apex.ra + 180, -apex.dec)).toBeCloseTo(1.1 * Math.sqrt((1 - beta) / (1 + beta)) - 1, 10);
  });
});
