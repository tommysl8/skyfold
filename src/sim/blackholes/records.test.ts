/**
 * The black holes' data and records against their sources: every record against blackholes.json; the file
 * against itself (every reference known, at most three card notes, no false black holes); the orbits against
 * Kepler's third law with the masses drawn, against the published semi-major axes, photocentre orbits and
 * radial-velocity amplitudes, and against orbit vectors computed independently with numpy (Thiele–Innes, at the
 * astrometric epochs' directions; listed in the test); the X-ray
 * binaries' donors in front of their holes at their ephemerides' T0 (their radial velocity crossing from
 * approach to recession), and Cygnus X-1's supergiant exactly in front at Brocksopp et al.'s conjunction; then the
 * registration: every hole, companion and barycentre registered from the shipped files, Cygnus X-1's
 * companion as catalogue star 111021 (so its catalogue point gives way to it), the members placed on their
 * orbit a light-time on as every star system is.
 *
 * Tolerances: 10⁻⁹ where the same formula is evaluated twice (JSON rounding at 12 digits); the published
 * numbers to their own uncertainties or the few per cent the papers' different masses explain (said at each).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { AstroTime } from 'astronomy-engine';
import { AU_KM, C_KM_S, GM_SUN_KM3_S2, PARSEC_KM } from '../../physics/constants';
import { readJson } from '../../test/files';
import { loadNames, loadStars, loadSystems } from '../../test/stars';
import { bodyPositionAt, getBody, isBody } from '../bodies';
import { setSimTime, sim } from '../sim';
import { updateEphemeris } from '../ephemeris';
import { msFromCivil } from '../../lib/time';
import { equatorialToEcliptic, unitFromRaDec, type Vec3 } from '../stars/frames';
import { orbitStateInto } from '../stars/orbits';
import { findStar } from '../stars/names';
import { bodyOfCatalogueStar, registerStars, starData, starIds } from '../stars/load';
import { C_PC_PER_YR, JD_J2000 } from '../stars/constants';
import { SSTARS } from '../galaxy/load';
import {
  BLACK_HOLES,
  HOVER_FLOOR_RADIUS_RS,
  PHASE_ILLUSTRATIVE_ORBITS,
  phaseUncertaintyOrbits,
  STELLAR_FRAMING_RS,
  STELLAR_HOLE_ALIAS,
  blackHoleInfoFrom,
  companionAbsMagV,
  holeCompanionIndices,
  holeJson,
  holeSystemRecords,
  horizonRadiusKm,
  isolatedHoleRecord,
} from './records';
import { blackHoleIds, blackHoleStatus } from './load';
import type { BlackHolesFile, HoleOrbitJson, HoleSystemJson } from './types';

const DEG = Math.PI / 180;
const file = BLACK_HOLES;
const systemOf = (holeId: string): HoleSystemJson => file.systems.find((s) => s.orbits[0].primary[0] === holeId)!;
const orbitOf = (holeId: string): HoleOrbitJson => systemOf(holeId).orbits[0];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: readonly number[]): Vec3 => {
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
};
/** Kepler's third law: the relative orbit's semi-major axis, au. */
const keplerAu = (massMsun: number, periodDays: number) => Math.cbrt((GM_SUN_KM3_S2 * massMsun * (periodDays * 86_400) ** 2) / (4 * Math.PI ** 2)) / AU_KM;

/** The star's position (au) and velocity (km/s) relative to the hole at jd, and its distance from us minus the hole's (au, + away). */
function starAbout(o: HoleOrbitJson, away: Vec3, jd: number) {
  const p = [0, 0, 0];
  const v = [0, 0, 0];
  orbitStateInto(o, jd, p, v);
  return { p, v, away: dot(p, away), rv: dot(v, away) };
}

const XRBS = ['v404-cygni', 'a0620-00', 'maxi-j1820', 'xte-j1118'];
const FULL = ['gaia-bh1', 'gaia-bh2', 'gaia-bh3', 'cyg-x-1'];

describe('the data file', () => {
  it('is the file on disk, in its format, every id once', () => {
    expect(readJson<BlackHolesFile>('src/sim/blackholes/blackholes.json')).toEqual(file);
    expect(file.format).toBe('lightspeed.black-holes');
    expect(file.version).toBe(1);
    const ids = [...file.holes.map((h) => h.id), ...file.companions.map((c) => c.id), ...file.systems.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
    // The first table's eleven, in order, then the second's (scripts/blackholes-more.mjs; more.test.ts checks those).
    expect(file.holes.slice(0, 11).map((h) => h.id)).toEqual(['sgr-a-star', 'm87-star', 'gaia-bh1', 'gaia-bh2', 'gaia-bh3', 'cyg-x-1', 'v404-cygni', 'a0620-00', 'maxi-j1820', 'xte-j1118', 'ogle-2011-blg-0462']);
  });

  it('gives every value a reference the file lists', () => {
    const keys: string[] = [];
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object')
        for (const [k, v] of Object.entries(x)) {
          if (k === 'ref' && typeof v === 'string') keys.push(v);
          else if (k === 'refs' && Array.isArray(v) && v.every((r) => typeof r === 'string')) keys.push(...(v as string[]));
          else walk(v);
        }
    };
    walk(file.holes);
    walk(file.companions);
    walk(file.systems);
    for (const k of keys) expect(file.refs[k], k).toBeDefined();
    for (const h of file.holes) expect(h.refs.length, h.id).toBeGreaterThan(0);
  });

  it('puts at most three one-line notes on a card and the rest in the data sheet', () => {
    for (const h of file.holes) {
      expect(h.modelNotes.length, h.id).toBeGreaterThan(0);
      expect(h.modelNotes.length, h.id).toBeLessThanOrEqual(3);
      for (const n of h.modelNotes) {
        expect(n, h.id).not.toMatch(/\n/);
        expect(n.length, h.id).toBeLessThan(200);
      }
      // Every hole says it is drawn without spin (docs/data/blackholes.md §3, label 1).
      expect(h.modelNotes[0], h.id).toMatch(/^Drawn without spin \(Schwarzschild\)/);
    }
    // The binaries with an assumed orientation say so on the card (label 15).
    for (const id of [...XRBS, 'cyg-x-1']) expect(holeJson(id)!.modelNotes.join(' '), id).toMatch(/orientation of its orbit on the sky/);
    for (const id of ['gaia-bh1', 'gaia-bh2', 'gaia-bh3']) expect(orbitOf(id).assumed).toEqual([]);
    // The quiet X-ray binaries say on the card that their gas is not drawn (label 16), not only on the data sheet;
    // Cygnus X-1, whose disc is drawn, that it is a model (label 25), and that its jet and wind are not (the sheet).
    for (const id of XRBS) expect(holeJson(id)!.modelNotes.join(' '), id).toMatch(/Its disc of gas.* not drawn: between outbursts/);
    expect(holeJson('cyg-x-1')!.modelNotes.join(' ')).toMatch(/Its disc is a model: a thin Novikov–Thorne disc at 2 % .* 1,000 times slower than real; its swirls are illustrative\./);
    expect(holeJson('cyg-x-1')!.sheetNotes!.join(' ')).toMatch(/Its jet and its companion’s wind are not drawn\./);
    // No jargon: a shift is in horizon radii, not in units of M.
    for (const h of file.holes) for (const n of [...h.modelNotes, h.spin.note]) expect(n, h.id).not.toMatch(/\d M\b/);
  });

  it('states the spin: 5–7 % smaller and shifted about 1 M (half a horizon radius) at our angle, up to 12 % edge-on, the EHT’s 8 %', () => {
    const sgr = holeJson('sgr-a-star')!;
    expect(sgr.spin.value).toBeNull();
    expect(sgr.spin.note).toMatch(/0\.9–0\.94 would make the shadow about 5–7 % smaller/);
    expect(sgr.spin.note).toMatch(/about half its horizon’s radius/);
    expect(sgr.spin.note).toMatch(/12 % narrower/);
    expect(sgr.spin.note).toMatch(/less than about 8 %/);
    expect(holeJson('cyg-x-1')!.spin.value).toBeGreaterThan(0.998);
  });

  it('keeps Sgr A*’s mass as sstars.json has it (the S-star orbits are fitted in that potential)', () => {
    const bh = (SSTARS as unknown as { blackHole: { mass: { value: number; unc: number; uncSys: number } } }).blackHole.mass;
    const sgr = holeJson('sgr-a-star')!;
    expect(sgr.mass.value).toBe(bh.value);
    expect(sgr.mass.unc).toEqual({ stat: bh.unc, sys: bh.uncSys });
    expect(sgr.placement).toBe('sstars');
    expect(sgr.flow).toBe('sgr-a-star-riaf');
  });

  it('calls nothing a black hole that is not one: HR 6819 and LB-1 stay out, catalogue star 2446 is no companion', () => {
    const text = JSON.stringify(file);
    expect(text).not.toMatch(/HR 6819|LB-1|QV Tel/);
    // Cygnus X-1's HDE 226868 in the core; the Gaia black holes' companions pinned in the head (stars3d-head.bin.gz).
    const idx = holeCompanionIndices();
    expect(idx).toContain(111021);
    expect(idx.length).toBe(4);
    for (const i of idx.filter((i) => i !== 111021)) expect(i).toBeGreaterThanOrEqual(329_770);
  });

  it('draws M87* and OGLE-2011-BLG-0462 with no orbit line, the binaries’ holes with one', () => {
    expect(holeJson('m87-star')!.orbitLine).toBe(false);
    expect(holeJson('ogle-2011-blg-0462')!.orbitLine).toBe(false);
    for (const id of [...FULL, ...XRBS]) expect(holeJson(id)!.orbitLine, id).toBe(true);
  });
});

describe('the orbits', () => {
  it('have the semi-major axis Kepler’s third law gives the masses drawn', () => {
    for (const s of file.systems) {
      const o = s.orbits[0];
      expect(o.aAu / keplerAu(o.massPrimaryMsun + o.massSecondaryMsun, o.periodDays) - 1, s.id).toBeLessThan(1e-9);
      expect(s.barycentre.massMsun).toBeCloseTo(o.massPrimaryMsun + o.massSecondaryMsun, 9);
      expect(o.massPrimaryMsun).toBe(holeJson(o.primary[0])!.mass.value);
      expect(o.massSecondaryMsun).toBe(file.companions.find((c) => c.id === o.secondary[0])!.massMsun.value);
    }
  });

  it('agree with the build’s Kepler checks and the published orbits', () => {
    // Gaia BH1 with the discovery paper's 9.62 M☉ and 185.59 d: a = 1.3965 au; the star's share at ϖ = 2.09 mas is the
    // photocentre orbit, 2.661 mas (published 2.67 ± 0.02). With the revised 9.27 M☉ and 185.387 d, 1.380 au.
    const bh1 = keplerAu(9.62 + 0.93, 185.59);
    expect(bh1).toBeCloseTo(1.3965, 4);
    expect(((bh1 * 9.62) / (9.62 + 0.93)) * 2.09).toBeCloseTo(2.661, 3);
    expect(orbitOf('gaia-bh1').aAu).toBeCloseTo(1.3799, 4);
    // Gaia BH3's relative orbit 16.55 au; the star's share is the published a₁, 16.17 ± 0.27 au.
    const bh3 = orbitOf('gaia-bh3');
    expect(bh3.aAu).toBeCloseTo(16.554, 3);
    expect((bh3.aAu * 32.7) / (32.7 + 0.76)).toBeCloseTo(16.17, 1);
    // Cygnus X-1 0.2440 au (published 0.244 ± 0.012); A0620-00 0.0176 au (3.79 ± 0.04 R☉); XTE J1118+480 2.54 ± 0.06 R☉.
    expect(orbitOf('cyg-x-1').aAu).toBeCloseTo(0.244, 4);
    expect(orbitOf('a0620-00').aAu).toBeCloseTo(0.0176, 4);
    expect(Math.abs(orbitOf('xte-j1118').aAu - 0.01181)).toBeLessThan(0.00028);
    // Gaia BH2: a = 4.96 ± 0.08 au.
    expect(Math.abs(orbitOf('gaia-bh2').aAu - 4.96)).toBeLessThan(0.08);
  });

  it('reproduce the published radial-velocity amplitudes (within 1.5 %: the masses drawn are the papers’ best values)', () => {
    const K: Record<string, number> = { 'gaia-bh1': 65.3785, 'gaia-bh2': 25.23, 'cyg-x-1': 75.21, 'v404-cygni': 208.4, 'a0620-00': 435.4, 'maxi-j1820': 417.7, 'xte-j1118': 708.8 };
    for (const [id, k] of Object.entries(K)) {
      const o = orbitOf(id);
      const aStar = (o.aAu * o.massPrimaryMsun) / (o.massPrimaryMsun + o.massSecondaryMsun);
      const sinI = Math.sin((o.published as { iDeg: { value: number } }).iDeg.value * DEG);
      const model = (2 * Math.PI * aStar * AU_KM * sinI) / (o.periodDays * 86_400 * Math.sqrt(1 - o.e * o.e));
      expect(Math.abs(model / k - 1), id).toBeLessThan(0.015);
    }
  });

  it('turn the published elements into the vectors computed independently from the same elements (to 2 × 10⁻⁵: those used the astrometric epoch’s direction)', () => {
    // Computed with numpy (Thiele–Innes; the method checked on Alpha Centauri AB against systems.json).
    const research: Record<string, [Vec3, Vec3]> = {
      'gaia-bh1': [
        [0.9327049795, -0.3151906012, 0.1752606805],
        [-0.3077312948, -0.4421679713, 0.8424897242],
      ],
      'gaia-bh2': [
        [-0.4075155899, -0.8516976744, 0.3294573043],
        [0.9099300732, -0.3482155682, 0.2253290484],
      ],
      'gaia-bh3': [
        [0.7244291161, -0.440191348, 0.5305035654],
        [-0.5607550203, 0.0713056255, 0.82490564],
      ],
      'cyg-x-1': [
        [0.6904937368, 0.2175254354, -0.6898558431],
        [0.3196591277, 0.7637655518, 0.5607853636],
      ],
    };
    for (const [id, [p, q]] of Object.entries(research)) {
      const o = orbitOf(id);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(o.pHat[k] - p[k]), `${id} p${k}`).toBeLessThan(2e-5);
        expect(Math.abs(o.qHat[k] - q[k]), `${id} q${k}`).toBeLessThan(2e-5);
      }
    }
  });

  it('are the Thiele–Innes vectors of their elements at the barycentre’s direction (to 10⁻⁹), orthonormal', () => {
    for (const s of file.systems) {
      const o = s.orbits[0];
      const pub = o.published as Record<string, { value: number }>;
      const full = pub.omegaStarDeg !== undefined;
      const i = pub.iDeg.value * DEG;
      const W = (full ? pub.OmegaDeg.value : 0) * DEG;
      const w = (full ? pub.omegaStarDeg.value : 90) * DEG;
      // The barycentre's direction at J2000 in ICRS (the ecliptic position rotated back).
      const e = unit(s.barycentre.posPc);
      const eps = (84_381.448 / 3600) * DEG;
      const away: Vec3 = [e[0], Math.cos(eps) * e[1] - Math.sin(eps) * e[2], Math.sin(eps) * e[1] + Math.cos(eps) * e[2]];
      const ra = Math.atan2(away[1], away[0]);
      const dec = Math.asin(away[2]);
      const east: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
      const north: Vec3 = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
      const A = Math.cos(w) * Math.cos(W) - Math.sin(w) * Math.sin(W) * Math.cos(i);
      const B = Math.cos(w) * Math.sin(W) + Math.sin(w) * Math.cos(W) * Math.cos(i);
      const F = -Math.sin(w) * Math.cos(W) - Math.cos(w) * Math.sin(W) * Math.cos(i);
      const G = -Math.sin(w) * Math.sin(W) + Math.cos(w) * Math.cos(W) * Math.cos(i);
      const C = Math.sin(w) * Math.sin(i);
      const H = Math.cos(w) * Math.sin(i);
      const P = equatorialToEcliptic([0, 1, 2].map((k) => A * north[k] + B * east[k] + C * away[k]) as Vec3);
      const Q = equatorialToEcliptic([0, 1, 2].map((k) => F * north[k] + G * east[k] + H * away[k]) as Vec3);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(o.pHat[k] - P[k]), `${s.id} p${k}`).toBeLessThan(1e-9);
        expect(Math.abs(o.qHat[k] - Q[k]), `${s.id} q${k}`).toBeLessThan(1e-9);
      }
      expect(Math.abs(dot(o.pHat, o.pHat) - 1)).toBeLessThan(1e-11);
      expect(Math.abs(dot(o.pHat, o.qHat))).toBeLessThan(1e-11);
    }
  });

  it('put each X-ray binary’s donor in front of its hole at T0, its radial velocity crossing from approach to recession', () => {
    for (const id of XRBS) {
      const s = systemOf(id);
      const o = s.orbits[0];
      const pub = o.published as { T0JD: { value: number }; iDeg: { value: number } };
      const T0 = pub.T0JD.value;
      expect(o.e).toBe(0);
      expect(o.tPeriJD).toBeCloseTo(T0 - o.periodDays / 2, 8);
      const away = unit(s.barycentre.posPc);
      const at = starAbout(o, away, T0);
      // Nearest to us: the "away" component is −a sin i.
      expect(at.away / (-o.aAu * Math.sin(pub.iDeg.value * DEG)) - 1, id).toBeLessThan(1e-9);
      const dt = o.periodDays * 1e-3;
      expect(starAbout(o, away, T0 - dt).rv, id).toBeLessThan(0);
      expect(starAbout(o, away, T0 + dt).rv, id).toBeGreaterThan(0);
    }
  });

  it('put Cygnus X-1’s supergiant exactly in front of the hole at Brocksopp et al.’s conjunction (ω + ν = 270°: its periastron from ω★ and e)', () => {
    const s = systemOf('cyg-x-1');
    const o = s.orbits[0];
    const T0 = (o.published as { T0JD: { value: number } }).T0JD.value;
    const at = starAbout(o, unit(s.barycentre.posPc), T0);
    const r = Math.hypot(at.p[0], at.p[1], at.p[2]);
    // sin(270°) = −1: all the way in front (the periastron time is kept to 10⁻⁴ d, 10⁻⁴ rad of the orbit).
    expect(at.away / (r * Math.sin(152.9 * DEG))).toBeCloseTo(-1, 6);
    // The periastron 0.094 P after the conjunction, as ω★ = 305° and e = 0.0189 give it.
    expect((o.tPeriJD - T0) / o.periodDays).toBeCloseTo(0.0938, 3);
  });

  it('give the stars’ radial velocity at periastron as K (cos ω + e cos ω): ω is the star’s, in the receding-node convention', () => {
    for (const id of ['gaia-bh1', 'gaia-bh2', 'gaia-bh3']) {
      const s = systemOf(id);
      const o = s.orbits[0];
      const w = (o.published as { omegaStarDeg: { value: number } }).omegaStarDeg.value * DEG;
      const i = (o.published as { iDeg: { value: number } }).iDeg.value * DEG;
      const n = (2 * Math.PI) / (o.periodDays * 86_400);
      const K = (n * o.aAu * AU_KM * Math.sin(i)) / Math.sqrt(1 - o.e * o.e);
      // The star's velocity relative to the hole (the relative orbit's): K scaled by (m1+m2)/m1.
      const rv = starAbout(o, unit(s.barycentre.posPc), o.tPeriJD).rv;
      expect(rv / (K * (1 + o.e) * Math.cos(w)) - 1, id).toBeLessThan(1e-9);
    }
  });
});

describe('the records', () => {
  it('make each binary a barycentre, its hole and its star, with the stars’ providers', () => {
    for (const s of file.systems) {
      const recs = holeSystemRecords(file, s, null);
      expect(recs.map((r) => r.kind), s.id).toEqual(['barycentre', 'black-hole', 'star']);
      const [bary, hole, star] = recs;
      expect(bary.destination).toBe(false);
      expect(bary.physical.gmKm3S2).toBeCloseTo(s.barycentre.massMsun * GM_SUN_KM3_S2, 3);
      const o = s.orbits[0];
      const rs = horizonRadiusKm(o.massPrimaryMsun);
      expect(rs).toBeCloseTo((2 * o.massPrimaryMsun * GM_SUN_KM3_S2) / (C_KM_S * C_KM_S), 9);
      expect(hole.physical.radiusKm).toBe(rs);
      expect(hole.visual?.renderer).toBe('lens');
      expect(hole.framing).toEqual({ radii: STELLAR_FRAMING_RS, minKm: rs * HOVER_FLOOR_RADIUS_RS });
      expect(hole.kindText).toBe('Stellar-mass black hole');
      expect(hole.labelRank).toBe(12);
      expect(hole.orbitLine).toEqual({});
      expect(hole.article).toBeUndefined();
      expect(hole.parent).toBe(bary.id);
      expect(hole.blackHole?.class).toBe('stellar');
      expect(hole.blackHole?.fallAllowed).toBe(false);
      expect(hole.blackHole?.companion).toBe(star.id);
      expect(hole.modelNotes!.length).toBeLessThanOrEqual(3);
      expect(star.parent).toBe(bary.id);
      expect(star.orbitLine).toEqual({});
      expect(star.physical.luminous?.teffK).toBe(file.companions.find((c) => c.id === star.id)!.teffK.value);
    }
    // Gaia BH1's is 27.4 km: its hover floor 27 mm above the horizon.
    const bh1 = holeSystemRecords(file, systemOf('gaia-bh1'))[1];
    expect(bh1.physical.radiusKm).toBeCloseTo(27.38, 2);
    expect((bh1.framing!.minKm! - bh1.physical.radiusKm) * 1e6).toBeCloseTo(27.4, 1);
  });

  it('answer to “black hole” in search, and call the present phase illustrative where the period’s uncertainty over the light-time is a quarter of an orbit or more', () => {
    const illustrative: string[] = [];
    for (const s of file.systems) {
      const [, hole, star] = holeSystemRecords(file, s, null);
      expect(hole.aliases, s.id).toContain(STELLAR_HOLE_ALIAS);
      const phase = phaseUncertaintyOrbits(s);
      const said = /is illustrative/.test(hole.positionNote ?? '');
      expect(said, s.id).toBe(phase >= PHASE_ILLUSTRATIVE_ORBITS || !!s.phaseAssumed);
      expect(star.positionNote, s.id).toBe(hole.positionNote);
      if (said) illustrative.push(s.orbits[0].primary[0]);
    }
    // The phase uncertainties: Gaia BH1 0.05 and V404 Cygni 0.14 of an orbit; Gaia BH2 0.51 up to MAXI J1820+070's 75.
    // (The first table's binaries; more.test.ts checks the second's, some of whose phases are assumed outright.)
    const first = new Set(['gaia-bh1', 'gaia-bh2', 'gaia-bh3', 'cyg-x-1', 'v404-cygni', 'a0620-00', 'maxi-j1820', 'xte-j1118']);
    expect(illustrative.filter((id) => first.has(id)).sort()).toEqual(['a0620-00', 'cyg-x-1', 'gaia-bh2', 'gaia-bh3', 'maxi-j1820', 'xte-j1118']);
    expect(phaseUncertaintyOrbits(systemOf('gaia-bh1'))).toBeCloseTo(0.05, 2);
    expect(phaseUncertaintyOrbits(systemOf('maxi-j1820'))).toBeGreaterThan(70);
    expect(holeSystemRecords(file, systemOf('gaia-bh2'))[1].positionNote).toMatch(/adds up to 0\.5\d of an orbit/);
  });

  it('say which orbital elements are assumed, and give asymmetric mass uncertainties as they are', () => {
    const v404 = holeSystemRecords(file, systemOf('v404-cygni'))[1].blackHole!;
    expect(v404.assumed).toHaveLength(3);
    expect(v404.massUncMsun).toEqual([0.6, 0.2]);
    expect(v404.massStatMsun).toBe(0.6);
    const cyg = holeSystemRecords(file, systemOf('cyg-x-1'))[1].blackHole!;
    expect(cyg.assumed).toEqual(['Ω, the orientation on the sky: taken from the direction of its jet']);
    expect(cyg.massNote).toMatch(/12\.7–17\.8, depending on the tilt of the orbit/);
    expect(holeSystemRecords(file, systemOf('gaia-bh1'))[1].blackHole!.massNote).toMatch(/9\.62/);
  });

  it('draw the companions from the papers’ luminosities or radii, without the dust (HDE 226868: about 3.3 magnitudes)', () => {
    // HDE 226868 at log L = 5.625, 31,138 K and 2,220 pc: V ≈ 5.5 unreddened, against the V = 8.91 seen through the dust.
    const hde = file.companions.find((c) => c.id === 'hde-226868')!;
    const vHde = companionAbsMagV(hde) + 5 * Math.log10(2220) - 5;
    expect(8.91 - vHde).toBeGreaterThan(2.9);
    expect(8.91 - vHde).toBeLessThan(3.8);
    // Gaia BH1's star: E(B−V) = 0.30 (A_V ≈ 0.93) and G = 13.77 from Earth; unreddened V about 13.2.
    const bh1 = file.companions.find((c) => c.id === 'gaia-bh1-star')!;
    const vBh1 = companionAbsMagV(bh1) + 5 * Math.log10(480) - 5;
    expect(vBh1).toBeGreaterThan(12.9);
    expect(vBh1).toBeLessThan(13.5);
    // V404 Cygni's donor fills its Roche lobe: 5.5 R☉.
    expect(file.companions.find((c) => c.id === 'v404-cygni-star')!.radiusRsun.value).toBeCloseTo(5.51, 2);
    const recs = holeSystemRecords(file, systemOf('cyg-x-1'));
    expect(recs[2].star?.catalogueIndex).toBe(111021);
    expect(recs[2].kindText).toBe('Blue supergiant, Cygnus X-1’s companion');
    expect(recs[2].modelNotes!.join(' ')).toMatch(/V 8\.91, about 3\.\d magnitudes fainter than drawn/);
  });

  it('hold OGLE-2011-BLG-0462 alone at its lensing event’s place, 1.52 kpc away', () => {
    const r = isolatedHoleRecord(holeJson('ogle-2011-blg-0462')!);
    expect(r.parent).toBeNull();
    expect(r.orbitLine).toBe(false);
    expect(r.blackHole?.companion).toBeUndefined();
    const p = { x: 0, y: 0, z: 0 };
    r.provider.positionAt(sim.astroTime, p);
    expect(Math.hypot(p.x, p.y, p.z) / PARSEC_KM).toBeCloseTo(1520, 6);
    expect(r.modelNotes!.join(' ')).toMatch(/0\.1″/);
    expect(r.blackHole?.massNote).toMatch(/Lam et al\. 2022/);
  });

  it('give each hole the block its lens, clocks and card read', () => {
    const m87 = blackHoleInfoFrom(holeJson('m87-star')!);
    expect(m87.class).toBe('supermassive');
    // A fall into M87* is offered only with M87's own starlight drawn round it, and its card then says so.
    expect(m87.fallAllowed).toBe(holeJson('m87-star')!.modelNotes.some((n) => /M87’s own starlight/.test(n)));
    expect(blackHoleInfoFrom(holeJson('sgr-a-star')!).fallAllowed).toBe(true);
    expect(m87.massStatMsun).toBe(0.2e9);
    expect(m87.massSysMsun).toBe(0.7e9);
    expect(m87.rsKm / AU_KM).toBeCloseTo(128.3, 1);
    expect(m87.ehtImage?.ringDiameterUas).toBe(42);
    const sgr = blackHoleInfoFrom(holeJson('sgr-a-star')!);
    expect(sgr.rsKm / AU_KM).toBeCloseTo(0.0848, 4);
    expect(sgr.gmKm3S2).toBeCloseTo(4.297e6 * GM_SUN_KM3_S2, -3);
    expect(sgr.sheetNotes!.join(' ')).toMatch(/no white hole/);
    expect(sgr.ehtImage?.licence).toBe('CC BY 4.0');
  });
});

describe('registered with the stars', () => {
  const T0 = msFromCivil(2026, 9, 28, 0);
  beforeAll(() => {
    const stars = loadStars();
    starData.stars = stars;
    starData.full = true;
    starData.names = loadNames();
    registerStars(loadSystems(), stars);
    setSimTime(T0);
    updateEphemeris();
  });

  it('registers every binary and the lone hole, in a list of their own', () => {
    for (const s of file.systems) for (const id of [s.id + '-barycentre', ...s.members]) expect(getBody(id), id).toBeDefined();
    expect(isBody('ogle-2011-blg-0462')).toBe(true);
    for (const id of blackHoleIds()) expect(starIds(), id).not.toContain(id);
    expect(blackHoleStatus('gaia-bh1')).toBe('ready');
    expect(blackHoleStatus('m87-star')).not.toBe('ready');
  });

  it('makes Cygnus X-1’s companion catalogue star 111021, HD 226868, whose point gives way to it', () => {
    expect(findStar(loadNames(), 'HD 226868')).toContain(111021);
    expect(bodyOfCatalogueStar(111021)).toBe('hde-226868');
  });

  it('can register again (a second load replaces the first)', () => {
    const n = blackHoleIds().length;
    registerStars(loadSystems(), loadStars());
    updateEphemeris();
    expect(blackHoleIds()).toHaveLength(n);
    expect(getBody('gaia-bh1')?.parent).toBe('gaia-bh1-system-barycentre');
  });

  it('places the pair on its orbit a light-time on, as every star system is', () => {
    for (const id of ['gaia-bh1', 'a0620-00']) {
      const s = systemOf(id);
      const o = s.orbits[0];
      const time = sim.astroTime;
      const hole = bodyPositionAt(id, time);
      const star = bodyPositionAt(o.secondary[0], time);
      // World axes (x, z, −y) of the ecliptic: back to ecliptic km.
      const rel = [star.x - hole.x, -(star.z - hole.z), star.y - hole.y];
      // The barycentre's distance now, and the orbit evaluated at t + d/c.
      const b = bodyPositionAt(`${s.id}-barycentre`, time);
      const dPc = b.length() / PARSEC_KM;
      const jd = JD_J2000 + time.tt + (dPc / C_PC_PER_YR) * 365.25;
      const p = [0, 0, 0];
      orbitStateInto(o, jd, p, null);
      const sep = Math.hypot(p[0], p[1], p[2]) * AU_KM;
      for (let k = 0; k < 3; k++) expect(Math.abs(rel[k] - p[k] * AU_KM) / sep, `${id} ${k}`).toBeLessThan(1e-6);
      expect(dPc).toBeCloseTo(s.barycentre.distancePc, -1);
    }
  });

  it('puts Gaia BH1 where Gaia measured it, 480 pc away in Ophiuchus', () => {
    // Where the light seen from the Sun at J2000 left it (a light-time before J2000: the provider adds it), in
    // ecliptic km: the J2016 astrometric position carried back 16 years, within an arcsecond.
    const bary = getBody('gaia-bh1-system-barycentre')!;
    const s = systemOf('gaia-bh1');
    const lightDays = (Math.hypot(...s.barycentre.posPc) / C_PC_PER_YR) * 365.25;
    const p = { x: 0, y: 0, z: 0 };
    bary.provider.positionAt({ tt: -lightDays } as AstroTime, p);
    const e = equatorialToEcliptic(unitFromRaDec(262.17120816, -0.58109202));
    expect((Math.acos(Math.min(1, dot(unit([p.x, p.y, p.z]), e))) / DEG) * 3600).toBeLessThan(1);
    expect(Math.hypot(p.x, p.y, p.z) / PARSEC_KM).toBeCloseTo(480, 1);
  });
});
