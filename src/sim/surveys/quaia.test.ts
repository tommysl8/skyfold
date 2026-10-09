/**
 * Quaia's quasars: a quasar the surveys already have is left to them (their spectroscopic redshift wins); a node keeps
 * each quasar's distance error through its file's round trip, and the surveys' own files decode as before; a streak
 * holds the light its gain says, however long, and is the point it would be when short; the least certain fade; and
 * Quaia loads only from far out, its downloads sharing the surveys' limit.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DoubleSide } from 'three';
import { MPC_KM } from '../../physics/constants';
import { cosmology } from '../cosmos/cosmology';
import { QUAIA_FULL_KM, QUAIA_LOAD_KM, quaiaLoadWanted, quaiaShare, SURVEY_LOAD_KM, surveyShare } from '../../ui/cosmicLayers';
import { fileExists, readBytes, readText } from '../../test/files';
import { createQuaiaStreakMaterial } from '../../render/materials';
import {
  decodeHierarchy,
  decodeNode,
  decodeNodeCells,
  encodeHierarchy,
  encodeNode,
  GLOW_FLOATS,
  HIERARCHY_FILE,
  kindClass,
  kindSource,
  lumByte,
  NODE_EXTRA_AT,
  nodeBox,
  nodeFile,
  packKind,
  SURVEY_CLASS,
  tierOf,
} from './format';
import { buildOctree, nodeBytes, seeded } from './tile';
import { selectNodes, selectNodesOf, type LodView } from './lod';
import { FETCHES, quaia, QUAIA_BASE_URL, resetSurvey, survey, SURVEY_BASE_URL } from './load';
import {
  cutGaussianIntegral,
  GAIA_GALAXY_SOURCE,
  gaiaLogL,
  gaiaRedshiftKept,
  gaiaSigmaZ,
  matchQuaia,
  QUAIA_FADE_MIN,
  QUAIA_FADE_MPC,
  QUAIA_SOURCE,
  quaiaFade,
  sigmaByte,
  sigmaChiMpc,
  sigmaOfByte,
  STREAK_CUT_ACROSS,
  STREAK_CUT_ALONG,
  STREAK_LENGTH_GAIN,
  STREAK_LONG_PX,
  STREAK_MIN_ALPHA,
  SIGMA_LOG2_MIN,
  SIGMA_STEPS_PER_OCTAVE,
  streakCost,
  streakShape,
} from './quaia';

const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as { gunzipSync(b: Uint8Array): Uint8Array };

/** A point `arcsec` away from (ra, dec) in the direction `pa` (radians from north through east). */
function offset(ra: number, dec: number, arcsec: number, pa: number): [number, number] {
  const d = (dec * Math.PI) / 180;
  const r = (arcsec / 3600) * (Math.PI / 180);
  const dec2 = Math.asin(Math.sin(d) * Math.cos(r) + Math.cos(d) * Math.sin(r) * Math.cos(pa));
  const dra = Math.atan2(Math.sin(pa) * Math.sin(r) * Math.cos(d), Math.cos(r) - Math.sin(d) * Math.sin(dec2));
  return [(((ra + (dra * 180) / Math.PI) % 360) + 360) % 360, (dec2 * 180) / Math.PI];
}

describe('Quaia against the surveys’ quasars', () => {
  it('leaves out a quasar within 1.5″ of a survey entry, keeps one farther, and names the first catalogue that has it', () => {
    const rand = seeded(21);
    const n = 3000;
    const qra = new Float64Array(n);
    const qdec = new Float64Array(n);
    // Two catalogues in priority order (DESI's quasars, then DR16Q, say), each listing some of Quaia's quasars a little off.
    const sets = [
      { ra: [] as number[], dec: [] as number[] },
      { ra: [] as number[], dec: [] as number[] },
    ];
    const want = new Int16Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      // Across 0h/24h and near both poles too.
      qra[i] = i % 10 === 0 ? (i % 20 === 0 ? 359.9999 : 0.00005) : rand() * 360;
      qdec[i] = i % 15 === 0 ? (i % 30 === 0 ? 1 : -1) * (89.99 - i * 1e-4) : Math.asin(2 * rand() - 1) * (180 / Math.PI);
      const k = i % 4;
      if (k === 0 || k === 1) {
        // In the first catalogue (and, for half of these, the second too): the first is named.
        const [r, d] = offset(qra[i], qdec[i], 1.2, rand() * 2 * Math.PI);
        sets[0].ra.push(r);
        sets[0].dec.push(d);
        if (k === 1) {
          const [r2, d2] = offset(qra[i], qdec[i], 0.4, rand() * 2 * Math.PI);
          sets[1].ra.push(r2);
          sets[1].dec.push(d2);
        }
        want[i] = 0;
      } else if (k === 2) {
        const [r, d] = offset(qra[i], qdec[i], 2.0, rand() * 2 * Math.PI);
        // 2″ away: another object, so this quasar is new.
        sets[0].ra.push(r);
        sets[0].dec.push(d);
      } else if (i % 8 === 3) {
        const [r, d] = offset(qra[i], qdec[i], 0.8, rand() * 2 * Math.PI);
        sets[1].ra.push(r);
        sets[1].dec.push(d);
        want[i] = 1;
      }
    }
    const found = matchQuaia(
      { ra: qra, dec: qdec, count: n },
      sets.map((s) => ({ ra: s.ra, dec: s.dec, count: s.ra.length })),
    );
    expect([...found]).toEqual([...want]);
    // About a third are new.
    expect(found.filter((f) => f < 0).length).toBeGreaterThan(n / 3);
  });
});

describe('a Quaia node file', () => {
  /** A node of quasars at gigaparsecs, each with its error's byte. */
  function sample(n: number) {
    const rand = seeded(5);
    const path = '7';
    const { side, lo } = nodeBox(path);
    const pos = new Float64Array(3 * n);
    for (let i = 0; i < 3 * n; i++) pos[i] = lo[i % 3] + side * rand();
    const tier = new Uint8Array(n).map((_, i) => tierOf(Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2])));
    const kind = new Uint8Array(n).fill(packKind(SURVEY_CLASS.quasar, QUAIA_SOURCE.code));
    const lum = new Uint8Array(n).fill(lumByte(0));
    const extra = new Uint8Array(n).map(() => Math.floor(rand() * 256));
    const glows = new Float32Array(8 * GLOW_FLOATS);
    return { side, lo, pos, tier, kind, lum, extra, glows };
  }

  it('keeps each quasar’s distance error through the round trip, in the order its points come in', () => {
    const s = sample(2000);
    const { bytes, order } = encodeNode(s.pos, s.tier, s.kind, s.lum, s.lo, s.side, s.glows, { per: 1, bytes: s.extra });
    expect(bytes[NODE_EXTRA_AT]).toBe(1);
    const cells = decodeNodeCells(bytes, () => {});
    expect(cells.extraPer).toBe(1);
    for (let j = 0; j < 2000; j++) expect(cells.extra[j]).toBe(s.extra[order[j]]);
    // decodeNode reorders the attributes and the extra bytes alike (format.ts stratifiedOrder).
    const d = decodeNode(bytes, s.side);
    expect(d.extraPer).toBe(1);
    expect([...d.extra].sort((a, b) => a - b)).toEqual([...cells.extra].sort((a, b) => a - b));
    for (let j = 0; j < 2000; j++) {
      expect(kindClass(d.attrs[2 * j])).toBe(SURVEY_CLASS.quasar);
      expect(kindSource(d.attrs[2 * j])).toBe(QUAIA_SOURCE.code);
    }
  });

  it('is the surveys’ format: a node without extra bytes is written and read as before', () => {
    const s = sample(500);
    const a = encodeNode(s.pos, s.tier, s.kind, s.lum, s.lo, s.side, s.glows);
    expect(a.bytes[NODE_EXTRA_AT]).toBe(0);
    const d = decodeNode(a.bytes, s.side);
    expect(d.extraPer).toBe(0);
    expect(d.extra.length).toBe(0);
    // The extra bytes add exactly one plane after the luminosity bytes.
    const b = encodeNode(s.pos, s.tier, s.kind, s.lum, s.lo, s.side, s.glows, { per: 1, bytes: s.extra });
    expect(b.bytes.length - a.bytes.length).toBe(500);
  });

  it('the octree carries them, and its glows hold the faded light the points show', () => {
    const rand = seeded(9);
    const n = 6000;
    const pos = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) {
      const d = 1800 + 5000 * rand();
      const u = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const l = Math.hypot(u[0], u[1], u[2]);
      for (let a = 0; a < 3; a++) pos[3 * i + a] = (u[a] / l) * d;
    }
    const extra = new Uint8Array(n).map(() => sigmaByte(50 + 1500 * rand()));
    const weight = new Float32Array(n).map((_, i) => quaiaFade(sigmaOfByte(extra[i])));
    const input = { count: n, pos, kind: new Uint8Array(n).fill(packKind(3, 10)), lum: new Uint8Array(n).fill(lumByte(0)), extra: { per: 1, bytes: extra }, weight };
    const plain = buildOctree({ ...input, weight: undefined, extra: undefined }, 3, 500);
    const built = buildOctree(input, 3, 500);
    let w = 0;
    for (let i = 0; i < n; i++) w += weight[i];
    // The root's subtree light is the faded light of all of them (the same octree, its light scaled per quasar).
    expect(built[0].light[3] / plain[0].light[3]).toBeCloseTo(w / n, 5);
    const dist = new Float64Array(n).map((_, i) => Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]));
    const node = built[1];
    const d = decodeNode(nodeBytes(node, input, dist).bytes, node.side);
    expect(d.extraPer).toBe(1);
    expect([...d.extra].sort((a, b) => a - b)).toEqual([...node.points].map((i) => extra[i]).sort((a, b) => a - b));
  });
});

describe('Quaia’s tiles as shipped (public/data/survey-quaia/)', () => {
  const DIR = 'public/data/survey-quaia/';
  const has = fileExists(DIR + HIERARCHY_FILE) && fileExists('public/data/survey/' + HIERARCHY_FILE);
  it.skipIf(!has)('hold Quaia’s 866,298 quasars and Gaia’s 810,059 galaxies that the surveys do not have, each with its error', () => {
    const h = decodeHierarchy(zlib.gunzipSync(readBytes(DIR + HIERARCHY_FILE)));
    expect(h.perSource[QUAIA_SOURCE.code]).toBe(866_298);
    expect(h.perSource[GAIA_GALAXY_SOURCE.code]).toBe(810_059);
    expect(h.total).toBe(866_298 + 810_059);
    const root = decodeNode(zlib.gunzipSync(readBytes(DIR + nodeFile(''))), h.nodes[0].side);
    expect(root.count).toBe(h.nodes[0].points);
    expect(root.extraPer).toBe(1);
    const sig = [...root.extra].map(sigmaOfByte).sort((a, b) => a - b);
    // The median error between the galaxies' (about 120 Mpc) and the quasars' (about 200), as the build measured.
    expect(sig[sig.length >> 1]).toBeGreaterThan(110);
    expect(sig[sig.length >> 1]).toBeLessThan(260);
    const kinds = new Set([packKind(SURVEY_CLASS.quasar, QUAIA_SOURCE.code), packKind(SURVEY_CLASS.other, GAIA_GALAXY_SOURCE.code)]);
    let galaxies = 0;
    for (let j = 0; j < root.count; j++) {
      expect(kinds.has(root.attrs[2 * j])).toBe(true);
      if (kindSource(root.attrs[2 * j]) === GAIA_GALAXY_SOURCE.code) galaxies++;
    }
    // The root is a fair sample of all of them: about half galaxies.
    expect(galaxies / root.count).toBeGreaterThan(0.4);
    expect(galaxies / root.count).toBeLessThan(0.6);
  });

  it.skipIf(!has)('leave the surveys’ own files as they were: no extra bytes', () => {
    const b = zlib.gunzipSync(readBytes('public/data/survey/' + nodeFile('')));
    expect(b[NODE_EXTRA_AT]).toBe(0);
    expect(decodeNode(b, nodeBox('').side).extraPer).toBe(0);
  });
});

describe('a quasar’s distance error', () => {
  it('is half the comoving span of its redshift’s 1σ range, about 190 Mpc at z = 1.5 for 4 % of 1 + z', () => {
    const c = cosmology();
    const s = sigmaChiMpc(1.5, 0.04 * 2.5, (z) => c.comovingDistanceMpc(z));
    expect(s).toBeGreaterThan(170);
    expect(s).toBeLessThan(210);
    // Never below z = 0.
    expect(sigmaChiMpc(0.05, 0.2, (z) => c.comovingDistanceMpc(z))).toBeCloseTo(0.5 * c.comovingDistanceMpc(0.25), 6);
  });

  it('is kept in a byte to 1.5 %', () => {
    for (const s of [5, 21.9, 72, 206, 445, 1389, 3104]) expect(Math.abs(sigmaOfByte(sigmaByte(s)) / s - 1)).toBeLessThanOrEqual(0.0146);
    expect(sigmaByte(1)).toBe(0);
    expect(sigmaByte(1e6)).toBe(255);
  });

  it('fades the least certain: fully drawn to 300 Mpc, at the floor from 1,000', () => {
    expect(quaiaFade(100)).toBe(1);
    expect(quaiaFade(QUAIA_FADE_MPC[0])).toBe(1);
    expect(quaiaFade(QUAIA_FADE_MPC[1])).toBeCloseTo(QUAIA_FADE_MIN, 12);
    expect(quaiaFade(3000)).toBeCloseTo(QUAIA_FADE_MIN, 12);
    let prev = 1;
    for (let s = 300; s <= 1000; s += 10) {
      const f = quaiaFade(s);
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
  });
});

describe('Gaia’s galaxies', () => {
  it('keep the redshifts the classifier gets right: 0.02 to 0.58, less 0.070–0.071 and 0.28–0.30', () => {
    for (const z of [0.02, 0.05, 0.069, 0.071, 0.15, 0.279, 0.3, 0.45, 0.58]) expect(gaiaRedshiftKept(z), String(z)).toBe(true);
    for (const z of [0, 0.019, 0.07, 0.0705, 0.28, 0.29, 0.581, 0.6, NaN]) expect(gaiaRedshiftKept(z), String(z)).toBe(false);
  });

  it('take half the quoted prediction interval as the redshift’s 1σ error', () => {
    expect(gaiaSigmaZ(0.093, 0.149)).toBeCloseTo(0.028, 12);
  });

  it('take a luminosity from G as the survey takes one from r: an L* galaxy at z = 0.1 is G = 17.0', () => {
    const c = cosmology();
    const chi = c.comovingDistanceMpc(0.1);
    // DM = 5 log10((1 + z) χ / 10 pc); M = G − DM + 2.5 log10(1 + z) = −21.2 for log L/L* = 0.
    const g = -21.2 + 5 * Math.log10((1.1 * chi * 1e6) / 10) - 2.5 * Math.log10(1.1);
    expect(g).toBeGreaterThan(16.8);
    expect(g).toBeLessThan(17.2);
    expect(gaiaLogL(g, 0.1, chi)).toBeCloseTo(0, 9);
    // A magnitude brighter is 0.4 dex more.
    expect(gaiaLogL(g - 1, 0.1, chi)).toBeCloseTo(0.4, 9);
  });

  it('have a code of their own beyond Quaia’s, which the kind byte holds', () => {
    expect(GAIA_GALAXY_SOURCE.code).toBe(QUAIA_SOURCE.code + 1);
    expect(kindSource(packKind(SURVEY_CLASS.other, GAIA_GALAXY_SOURCE.code))).toBe(GAIA_GALAXY_SOURCE.code);
    expect(kindClass(packKind(SURVEY_CLASS.other, GAIA_GALAXY_SOURCE.code))).toBe(SURVEY_CLASS.other);
  });
});

describe('a streak', () => {
  /** Its light summed over its quad on a fine grid, per unit of the point's light. */
  function summed(halfPx: number, pointPx: number): number {
    const s = streakShape(halfPx, pointPx);
    const fa = Math.exp((-0.5 * (s.halfLength / s.sigmaAlong) ** 2));
    const fw = Math.exp(-0.5 * STREAK_CUT_ACROSS ** 2);
    const nx = 4000;
    const ny = 200;
    let sum = 0;
    for (let i = 0; i < nx; i++) {
      const u = -s.halfLength + ((i + 0.5) / nx) * 2 * s.halfLength;
      const ga = Math.exp(-0.5 * (u / s.sigmaAlong) ** 2) - fa;
      for (let j = 0; j < ny; j++) {
        const v = -s.halfWidth + ((j + 0.5) / ny) * 2 * s.halfWidth;
        sum += ga * (Math.exp(-0.5 * (v / s.sigmaAcross) ** 2) - fw);
      }
    }
    return sum * ((2 * s.halfLength) / nx) * ((2 * s.halfWidth) / ny) * s.peakPerLight;
  }

  it('holds the point’s light times its gain, however long it is drawn', () => {
    for (const half of [0, 3, 40, 400]) {
      const s = streakShape(half, 4);
      expect(summed(half, 4) / s.gain).toBeCloseTo(1, 3);
    }
  });

  it('is the point it would be when its error is small or seen end on', () => {
    const s = streakShape(0, 6);
    expect(s.sigmaAlong).toBeCloseTo(1, 12);
    expect(s.sigmaAcross).toBeCloseTo(1, 12);
    expect(s.gain).toBe(1);
    expect(s.halfLength).toBeCloseTo(s.halfWidth, 12);
  });

  it('runs over its quasar’s ±1σ distances, brighter in all and fainter along it the longer it is', () => {
    let prev = streakShape(0, 4);
    for (const half of [10, 50, 200]) {
      const s = streakShape(half, 4);
      // The ±1σ span lies inside the drawn part, which ends where the profile is cut.
      expect(s.halfLength).toBeGreaterThanOrEqual(half);
      expect(s.halfLength).toBeCloseTo(STREAK_CUT_ALONG * s.sigmaAlong, 9);
      expect(s.gain).toBeGreaterThan(prev.gain);
      expect(s.peakPerLight).toBeLessThan(prev.peakPerLight);
      expect(s.gain).toBeCloseTo((s.sigmaAlong / s.sigmaAcross) ** STREAK_LENGTH_GAIN, 12);
      prev = s;
    }
    // The cuts' integral (the shader's normalisation): 2.5066 at infinity.
    expect(cutGaussianIntegral(8)).toBeCloseTo(Math.sqrt(2 * Math.PI), 6);
  });

  it('is drawn by the shader with these numbers (its material’s defines and uniforms come from here)', () => {
    const m = createQuaiaStreakMaterial();
    expect(Number(m.defines.CUT_ALONG)).toBe(STREAK_CUT_ALONG);
    expect(Number(m.defines.CUT_ACROSS)).toBe(STREAK_CUT_ACROSS);
    const u = m.uniforms;
    expect(u.uLengthGain.value).toBe(STREAK_LENGTH_GAIN);
    expect(u.uMinAlpha.value).toBe(STREAK_MIN_ALPHA);
    expect(u.uLongPx.value.toArray()).toEqual([...STREAK_LONG_PX]);
    expect(u.uFade.value.toArray()).toEqual([QUAIA_FADE_MPC[0], QUAIA_FADE_MPC[1], QUAIA_FADE_MIN]);
    expect(u.uSigmaCode.value.toArray()).toEqual([SIGMA_LOG2_MIN, SIGMA_STEPS_PER_OCTAVE]);
    // The shader's error function is quaia.ts erf's (the same coefficients).
    const glsl = readText('src/render/shaders/quaiaStreak.vert.glsl');
    for (const c of ['0.3275911', '1.061405429', '1.453152027', '1.421413741', '0.284496736', '0.254829592']) expect(glsl).toContain(c);
    // Both faces: a node's model matrix holds its numbers, and where its determinant is negative three.js flips the
    // winding (with the front side only, every streak of such a node was culled).
    expect(m.side).toBe(DoubleSide);
    m.dispose();
  });

  it('costs the budget its pixels over a point’s, more the nearer it is, and its vertices only when too long to draw', () => {
    const pxPerRad = 1500;
    const far = streakCost(12_000, pxPerRad, 5, 2);
    const mid = streakCost(4000, pxPerRad, 5, 2);
    expect(far).toBeGreaterThanOrEqual(1);
    expect(mid).toBeGreaterThan(far);
    // A typical streak 100 Mpc away would be far longer than STREAK_LONG_PX: it is not drawn.
    const half = ((2 / Math.PI) * 200 * pxPerRad) / 100;
    expect(half).toBeGreaterThan(STREAK_LONG_PX[1] * 2);
    expect(streakCost(100, pxPerRad, 5, 2)).toBe(0.5);
  });
});

describe('Quaia’s share of the point budget', () => {
  function tree(n: number, seed: number) {
    const rand = seeded(seed);
    const pos = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) {
      const d = 500 + 6000 * rand();
      const u = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const l = Math.hypot(u[0], u[1], u[2]);
      for (let a = 0; a < 3; a++) pos[3 * i + a] = (u[a] / l) * d;
    }
    const built = buildOctree({ count: n, pos, kind: new Uint8Array(n), lum: new Uint8Array(n) }, seed, 400);
    return decodeHierarchy(encodeHierarchy(built.map((x) => ({ ...x, points: x.points.length, fileBytes: 0 })), n, [n])).nodes;
  }
  const view = (budget: number): LodView => ({ cam: [0, 0, 6000], a: 1, forward: [0, 0, -1], halfFov: Math.PI, pxPerRad: 1000, phi: 0, velDir: [0, 0, 1], budget });

  it('counts each point at its cost and stays within the budget', () => {
    const nodes = tree(20_000, 4);
    const one = selectNodes(nodes, view(3000), () => true);
    const dear = selectNodesOf([{ nodes, loaded: () => true, cost: 5 }], view(3000))[0];
    expect(one.spent).toBeLessThanOrEqual(3000);
    expect(dear.spent).toBeLessThanOrEqual(3000);
    expect(dear.spent).toBeCloseTo(5 * dear.points, 9);
    expect(dear.points).toBeLessThan(one.points);
    // Costs per node too.
    const per = selectNodesOf([{ nodes, loaded: () => true, cost: (i) => 1 + nodes[i].depth }], view(3000))[0];
    expect(per.spent).toBeLessThanOrEqual(3000);
  });

  it('shares one budget between octrees by the same law when asked to', () => {
    const a = tree(20_000, 4);
    const b = tree(4000, 8);
    const [ra, rb] = selectNodesOf(
      [
        { nodes: a, loaded: () => true },
        { nodes: b, loaded: () => true, cost: 2 },
      ],
      view(4000),
    );
    expect(ra.spent + rb.spent).toBeLessThanOrEqual(4000);
    expect(ra.points).toBeGreaterThan(0);
    expect(rb.points).toBeGreaterThan(0);
    expect(ra.scale).toBe(rb.scale);
  });
});

describe('when Quaia loads', () => {
  const io = [{ ...survey.io }, { ...quaia.io }];
  afterEach(() => {
    Object.assign(survey.io, io[0]);
    Object.assign(quaia.io, io[1]);
    resetSurvey();
  });

  it('only from 500 Mpc out, whatever the setting, showing fully from 1 Gpc', () => {
    expect(QUAIA_LOAD_KM / MPC_KM).toBe(500);
    expect(QUAIA_FULL_KM / MPC_KM).toBe(1000);
    for (const mpc of [0, 30, 200, 499]) {
      expect(quaiaLoadWanted('auto', mpc * MPC_KM)).toBe(false);
      expect(quaiaLoadWanted('on', mpc * MPC_KM)).toBe(false);
      expect(quaiaShare('on', mpc * MPC_KM)).toBe(0);
    }
    for (const mpc of [500, 2000, 14_165]) expect(quaiaLoadWanted('auto', mpc * MPC_KM)).toBe(true);
    expect(quaiaLoadWanted('off', 5000 * MPC_KM)).toBe(false);
    expect(quaiaShare('auto', 750 * MPC_KM)).toBeCloseTo(0.5, 6);
    expect(quaiaShare('auto', 2000 * MPC_KM)).toBe(1);
    expect(quaiaShare('off', 2000 * MPC_KM)).toBe(0);
    // Never more than the surveys show, and later than they load.
    for (const mpc of [10, 40, 600, 900, 5000]) expect(quaiaShare('auto', mpc * MPC_KM)).toBeLessThanOrEqual(surveyShare('auto', mpc * MPC_KM));
    expect(QUAIA_LOAD_KM).toBeGreaterThan(SURVEY_LOAD_KM);
  });

  it('from beside the surveys’ files', () => {
    expect(QUAIA_BASE_URL).toBe(SURVEY_BASE_URL.replace(/survey\/$/, 'survey-quaia/'));
    expect(QUAIA_BASE_URL.endsWith('data/survey-quaia/')).toBe(true);
  });

  it('holds no more than FETCHES downloads open, with the surveys’ together', async () => {
    const settle = () => new Promise((r) => setTimeout(r, 0));
    const nodes = ['', '0', '1', '2', '3', '4', '5', '6', '7'].map((path) => {
      const { side, lo } = nodeBox(path);
      return { childMask: path === '' ? 255 : 0, points: 10, subtree: path === '' ? 90 : 10, fileBytes: 10, side, lo, box: Float64Array.of(lo[0], lo[1], lo[2], lo[0] + side, lo[1] + side, lo[2] + side) };
    });
    let open = 0;
    let most = 0;
    for (const store of [survey, quaia]) {
      const h = decodeHierarchy(encodeHierarchy(nodes, 90, [90]));
      store.io.hierarchy = async () => ({ hierarchy: h, bytes: 1 });
      store.io.node = async () => {
        open++;
        most = Math.max(most, open);
        await settle();
        open--;
        return { count: 10, position: new Float32Array(30), attrs: new Uint8Array(20), extra: new Uint8Array(10), extraPer: 1, glows: new Float32Array(64), bytes: 100 };
      };
      await store.loadHierarchy();
    }
    for (let f = 0; f < 6; f++) {
      survey.requestNodes([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      quaia.requestNodes([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      await settle();
      await settle();
    }
    expect(most).toBeLessThanOrEqual(FETCHES);
    expect(survey.nodes.size + quaia.nodes.size).toBe(18);
    expect(quaia.nodes.get(3)!.extraPer).toBe(1);
  });
});
