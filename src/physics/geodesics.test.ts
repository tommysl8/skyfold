/**
 * Clocks and motion near a black hole (physics/geodesics.ts) against closed forms, the numbers of
 * docs/data/blackholes.md §4, 50-digit values of the lag rate (mpmath, listed below), and the
 * fixtures' `time` and `drip` sections (__fixtures__/schwarzschild.json: the falls' closed forms and home's
 * Painlevé–Gullstrand time T by quadrature in 40 digits, checked there against Schwarzschild time plus the
 * PG offset to 1e-33). Falls to 1e-12 relative; the lag rate to 2.2e-16.
 */
import { describe, expect, it } from 'vitest';
import { readJson } from '../test/files';
import { C_KM_S, GM_SUN_KM3_S2 } from './constants';
import {
  alphaAtHeight,
  alphaOf,
  circularOrbit,
  hoverAccelKmS2,
  lagRateGravity,
  oneMinusAlpha,
  properAccelKmS2,
  radialFall,
  relativeRapidity,
  tidalEndRadiusKm,
  tidalStretchMS2,
  type FallState,
} from './geodesics';

/** Sagittarius A*: 4.297e6 solar masses (GRAVITY 2022), GM in km³/s², M in km, GM/c³ in s. */
const GM = 4.297e6 * GM_SUN_KM3_S2;
const M_KM = GM / (C_KM_S * C_KM_S);
const M_S = M_KM / C_KM_S;
const RS_KM = 2 * M_KM;
const G0 = 9.80665e-3; // km/s²

const rel = (a: number, b: number) => Math.abs(a / b - 1);
const newState = (): FallState => ({ tau: 0, r: 0, drdtau: 0, T: 0, dTdTau: 0, phiRelRain: 0, phiInStatic: 0, inside: false });

interface TimeFx {
  rain: { r0: number; tau_to_horizon_25: string; tau_horizon_to_centre_25: string }[];
  drip: {
    r0: number;
    e: number;
    tau_to_horizon_25: string;
    tau_to_centre_25: string;
    T_to_horizon_25: string;
    T_to_centre_25: string;
    dTdtau_start: number;
    dTdtau_horizon: number;
  }[];
}
interface DripFx {
  r0: number;
  e: number;
  samples: { eta: number; r: number; tau: number; T: number; dTdtau: number }[];
}
const fx = readJson<{ time: TimeFx; drip: DripFx[] }>('src/physics/__fixtures__/schwarzschild.json');

describe('the hovering observer', () => {
  it('keeps α and 1 − α to their last digits from the Sun’s distance to the hover floor', () => {
    expect(alphaOf(0.36)).toBe(0.8);
    // 1 − α = x/(1 + α): at x = 5e-11 (the Sun from Sgr A*) that is 2.5e-11 (1 + 1.25e-11)
    expect(rel(oneMinusAlpha(5e-11), 2.5e-11 * (1 + 1.25e-11))).toBeLessThan(1e-15);
    // at the hover floor, 1e-6 r_s above the horizon: α = √(1e-6/(1 + 1e-6))
    expect(rel(alphaAtHeight(1e-6), 9.999995000003749e-4)).toBeLessThan(1e-15);
    // home runs 1/α faster: 1.0540926 at 10 r_s, 100.005 at 1.0001 r_s
    expect(1 / alphaOf(0.1)).toBeCloseTo(1.0540926, 7);
    expect(1 / alphaAtHeight(1e-4)).toBeCloseTo(100.00500, 5);
  });

  it('needs the thrust to hover: 3,806 g at 10 r_s from Sgr A*', () => {
    // 3,806 g at 10 r_s from Sgr A*, 0.36 g at 1,000 r_s, 3.6e8 g at 1e-6 r_s above the horizon
    expect(hoverAccelKmS2(GM, 10 * RS_KM) / G0).toBeCloseTo(3806.1, 0);
    expect(hoverAccelKmS2(GM, 1000 * RS_KM) / G0).toBeCloseTo(0.36, 2);
    expect(hoverAccelKmS2(GM, RS_KM * (1 + 1e-6)) / G0 / 3.6e8).toBeCloseTo(1, 1);
  });

  it("runs the chronometer's lag at 1 − α/cosh φ to 2.2e-16 (50-digit values)", () => {
    // [x, φ, 1 − √(1 − x)/cosh φ] with mpmath at 50 digits
    const refs: [number, number, number][] = [
  [1e-15, 0, 5.000000000000001e-16],
  [1e-15, 1e-09, 5.005000000000001e-16],
  [1e-15, 0.0001, 5.000000479166665e-09],
  [1e-15, 0.3, 0.04337208809975219],
  [1e-15, 1, 0.35194572633611493],
  [1e-15, 5, 0.9865247177786954],
  [1e-15, 40, 1.0],
  [1e-12, 0, 5.00000000000125e-13],
  [1e-12, 1e-09, 5.00000500000125e-13],
  [1e-12, 0.0001, 5.000499979164167e-09],
  [1e-12, 0.3, 0.04337208810023002],
  [1e-12, 1, 0.3519457263364386],
  [1e-12, 5, 0.9865247177787022],
  [1e-12, 40, 1.0],
  [4.97e-11, 0, 2.485000000030876e-11],
  [4.97e-11, 1e-09, 2.4850000500308762e-11],
  [4.97e-11, 0.0001, 5.024849979042726e-09],
  [4.97e-11, 0.3, 0.04337208812352391],
  [4.97e-11, 1, 0.35194572635221877],
  [4.97e-11, 5, 0.9865247177790303],
  [4.97e-11, 40, 1.0],
  [5e-10, 0, 2.5000000003125e-10],
  [5e-10, 1e-09, 2.5000000053125e-10],
  [5e-10, 0.0001, 5.249999977947917e-09],
  [5e-10, 0.3, 0.04337208833890868],
  [5e-10, 1, 0.35194572649812816],
  [5e-10, 5, 0.9865247177820643],
  [5e-10, 40, 1.0],
  [1e-06, 0, 5.000001250000625e-07],
  [1e-06, 1e-09, 5.000001250005624e-07],
  [1e-06, 0.0001, 5.050001224792285e-07],
  [1e-06, 0.3, 0.04337256641382724],
  [1e-06, 1, 0.35194605036333243],
  [1e-06, 5, 0.9865247245163382],
  [1e-06, 40, 1.0],
  [0.001, 0, 0.0005001250625390899],
  [0.001, 1e-09, 0.0005001250625390904],
  [0.001, 0.0001, 0.0005001300600384437],
  [0.001, 0.3, 0.04385052169401746],
  [0.001, 1, 0.35226983452025945],
  [0.001, 5, 0.9865314571050591],
  [0.001, 40, 1.0],
  [0.1, 0, 0.051316701949486204],
  [0.1, 1e-09, 0.051316701949486204],
  [0.1, 0.0001, 0.051316706692902676],
  [0.1, 0.3, 0.0924630775312961],
  [0.1, 1, 0.38520173434481497],
  [0.1, 5, 0.9872162248201314],
  [0.1, 40, 1.0],
  [0.5, 0, 0.2928932188134525],
  [0.5, 1e-09, 0.2928932188134525],
  [0.5, 0.0001, 0.29289322234898635],
  [0.5, 0.3, 0.32356191642300725],
  [0.5, 1, 0.541756428515344],
  [0.5, 5, 0.990471536562913],
  [0.5, 40, 1.0],
  [0.9, 0, 0.6837722339831621],
  [0.9, 1e-09, 0.6837722339831621],
  [0.9, 0.0001, 0.6837722355643009],
  [0.9, 0.3, 0.6974876925104321],
  [0.9, 1, 0.7950672447816051],
  [0.9, 5, 0.9957387416067105],
  [0.9, 40, 1.0],
  [0.999, 0, 0.9683772233983162],
  [0.999, 1e-09, 0.9683772233983162],
  [0.999, 0.0001, 0.9683772235564301],
  [0.999, 0.3, 0.9697487692510431],
  [0.999, 1, 0.9795067244781605],
  [0.999, 5, 0.999573874160671],
  [0.999, 40, 1.0],
  [0.999999, 0, 0.9989999999999857],
  [0.999999, 1e-09, 0.9989999999999857],
  [0.999999, 0.0001, 0.9990000000049857],
  [0.999999, 0.3, 0.999043372088086],
  [0.999999, 1, 0.9993519457263268],
  [0.999999, 5, 0.9999865247177785],
  [0.999999, 40, 1.0],
  [0.999999999999, 0, 0.9999990000110609],
  [0.999999999999, 1e-09, 0.9999990000110609],
  [0.999999999999, 0.0001, 0.9999990000110659],
  [0.999999999999, 0.3, 0.9999990433826693],
  [0.999999999999, 1, 0.9999993519528945],
  [0.999999999999, 5, 0.9999999865248669],
  [0.999999999999, 40, 1.0]
    ];
    for (const [x, phi, v] of refs) expect(rel(lagRateGravity(x, phi), v)).toBeLessThanOrEqual(2.3e-16);
    // moving at φ = 1 with x = 0.5: dτ/dt = α/cosh φ = 0.4582436
    expect(1 - lagRateGravity(0.5, 1)).toBeCloseTo(0.4582436, 7);
  });
});

describe('the thrust of steady motion past the hovering observers', () => {
  const r = 20 * M_KM;
  const hover = hoverAccelKmS2(GM, r);
  it('is γ times the hover thrust moving radially, the Rindler limit', () => {
    for (const w of [0.1, 0.5, 0.9, 0.999]) expect(rel(properAccelKmS2(GM, r, w, 0), hover / Math.sqrt(1 - w * w))).toBeLessThan(1e-12);
    expect(properAccelKmS2(GM, r, 0.9, 0) / hover).toBeCloseTo(2.294, 3);
  });

  it('is nothing on the circular geodesic and 72 times the hover thrust sideways at 0.9c', () => {
    const w = Math.sqrt(1 / (20 - 2));
    expect(properAccelKmS2(GM, r, 0, w) / hover).toBeLessThan(1e-12);
    expect(properAccelKmS2(GM, r, 0, 0.9) / hover).toBeCloseTo(71.5, 1);
    expect(properAccelKmS2(GM, r, 0, 0)).toBe(hover);
  });
});

describe('tides', () => {
  it('end a fall into Sgr A* at 0.0104 r_s, stretch 1.1e-3 m/s² across 2 m at its horizon', () => {
    expect(tidalEndRadiusKm(GM) / RS_KM).toBeCloseTo(0.0104, 4);
    expect(tidalStretchMS2(GM, RS_KM, 2)).toBeCloseTo(1.1e-3, 4);
    expect(rel(tidalStretchMS2(GM, tidalEndRadiusKm(GM), 2), 1000)).toBeLessThan(1e-12);
    // and Gaia BH1 62.1 r_s out (9.27 solar masses; 60.6 with the discovery paper's 9.62: r/r_s ∝ M^(−2/3))
    const gm1 = 9.27 * GM_SUN_KM3_S2;
    expect(tidalEndRadiusKm(gm1) / ((2 * gm1) / (C_KM_S * C_KM_S))).toBeCloseTo(62.1, 1);
  });
});

describe('radial falls', () => {
  const s = newState();

  it('rain from 10 r_s at Sgr A*: the horizon at 864 s, then 28.22 s to the centre; T = τ', () => {
    const rEnd = tidalEndRadiusKm(GM) / M_KM;
    const f = radialFall({ r0: 20, e: 1, rEnd, mTimeS: M_S });
    expect(f.kind).toBe('rain');
    expect(f.tauHorizon).toBeCloseTo(864.2, 1);
    const toCentre = radialFall({ r0: 20, e: 1, rEnd: 0, mTimeS: M_S }).tauEnd - f.tauHorizon;
    expect(toCentre).toBeCloseTo(28.22, 2);
    f.stateAt(500, s);
    expect(s.T).toBe(s.tau);
    expect(s.phiRelRain).toBe(0);
    expect(s.dTdTau).toBe(1);
    // against the fixtures' 25 digits (units of M)
    for (const row of fx.time.rain) {
      const g = radialFall({ r0: row.r0, e: 1, rEnd: 0, mTimeS: 1 });
      expect(rel(g.tauHorizon, Number(row.tau_to_horizon_25))).toBeLessThan(1e-12);
      expect(rel(g.tauEnd - g.tauHorizon, Number(row.tau_horizon_to_centre_25))).toBeLessThan(1e-9);
    }
  });

  it('a drip from 10 r_s: 2,102.6 s in all, the horizon at 2,074 s, home on the free-fallers’ clocks 2,153.7 s', () => {
    const e = alphaOf(0.1);
    const f = radialFall({ r0: 20, e, rEnd: 0, mTimeS: M_S });
    expect(f.kind).toBe('drip');
    // 99.3459 M, 97.9703 M and 101.7580 M at 21.1651 s a unit of M (the horizon's 2,073.5 s rounds to 2,074)
    expect(f.tauEnd).toBeCloseTo(2102.6, 1);
    expect(f.tauHorizon).toBeCloseTo(2073.5, 1);
    f.stateAt(f.tauEnd, s);
    expect(s.T).toBeCloseTo(2153.7, 1);
    f.stateAt(0, s);
    expect(s.dTdTau).toBeCloseTo(1.05409255, 8);
    expect(s.r).toBe(20);
    expect(s.phiInStatic).toBe(0);
    f.stateAt(f.tauHorizon, s);
    expect(s.dTdTau).toBeCloseTo(1.001388, 6);
    // home seen straight up at the horizon runs at 1/(2e)
    expect(Math.exp(s.phiRelRain) / (1 + Math.sqrt(2 / s.r))).toBeCloseTo(1 / (2 * e), 6);
  });

  it('matches the fixtures’ falls to 1e-12: times to the horizon and the centre, and T', () => {
    for (const row of fx.time.drip) {
      const f = radialFall({ r0: row.r0, e: row.e, rEnd: 0, mTimeS: 1 });
      expect(rel(f.tauHorizon, Number(row.tau_to_horizon_25))).toBeLessThan(1e-12);
      expect(rel(f.tauEnd, Number(row.tau_to_centre_25))).toBeLessThan(1e-12);
      f.stateAt(f.tauHorizon, s);
      expect(rel(s.T, Number(row.T_to_horizon_25))).toBeLessThan(1e-12);
      expect(rel(s.dTdTau, row.dTdtau_horizon)).toBeLessThan(1e-12);
      f.stateAt(f.tauEnd, s);
      expect(rel(s.T, Number(row.T_to_centre_25))).toBeLessThan(1e-12);
      f.stateAt(0, s);
      expect(rel(s.dTdTau, row.dTdtau_start)).toBeLessThan(1e-12);
    }
  });

  it('reads T(τ) from its table in η to 1e-12 along two whole drips (10 r_s and 4,000 au)', () => {
    for (const d of fx.drip) {
      const f = radialFall({ r0: d.r0, e: d.e, rEnd: 0, mTimeS: 1 });
      let worstT = 0;
      let worstG = 0;
      for (const p of d.samples) {
        f.stateAt(p.tau, s);
        if (p.T > 0) worstT = Math.max(worstT, rel(s.T, p.T));
        worstG = Math.max(worstG, rel(s.dTdTau, p.dTdtau));
        // r where the double τ resolves it (at the very end τ's own rounding moves r by |dr/dτ| ε τ)
        const slack = Math.abs(s.drdtau) * 2.2e-16 * Math.max(p.tau, 1) * 4;
        expect(Math.abs(s.r - p.r)).toBeLessThanOrEqual(1e-12 * p.r + slack);
      }
      expect(worstT).toBeLessThan(1e-12);
      expect(worstG).toBeLessThan(1e-12);
    }
  });

  it('lasts at most π M inside: dropped from the hover floor, 66.49 s to the centre at Sgr A*, 66.41 s of it inside', () => {
    const f = radialFall({ r0: 2 * (1 + 1e-6), e: alphaAtHeight(1e-6), rEnd: 0, mTimeS: M_S });
    expect(f.tauEnd).toBeCloseTo(66.49, 2);
    expect(f.tauEnd - f.tauHorizon).toBeCloseTo(66.41, 2);
    expect(f.tauEnd - f.tauHorizon).toBeLessThan(Math.PI * M_S);
  });

  it('throws hail in faster: less time to the centre than rain, moving inward against the raindrop', () => {
    const rain = radialFall({ r0: 20, e: 1, rEnd: 0, mTimeS: 1 });
    const hail = radialFall({ r0: 20, e: 1.2, rEnd: 0, mTimeS: 1 });
    expect(hail.kind).toBe('hail');
    expect(hail.tauEnd).toBeLessThan(rain.tauEnd);
    hail.stateAt(hail.tauHorizon, s);
    expect(s.r).toBeCloseTo(2, 9);
    expect(s.phiRelRain).toBeLessThan(0);
    // dT/dτ against its derivative of the table: T grows at γ
    const h = 1e-4;
    const a = newState();
    const b = newState();
    hail.stateAt(1, a);
    hail.stateAt(1 + h, b);
    expect(rel((b.T - a.T) / h, 0.5 * (a.dTdTau + b.dTdTau))).toBeLessThan(1e-8);
  });

  it('is a function of proper time that allocates nothing a frame', () => {
    const f = radialFall({ r0: 94_308, e: alphaOf(2 / 94_308), rEnd: tidalEndRadiusKm(GM) / M_KM, mTimeS: M_S });
    const t = f.tauEnd;
    const bytes = bytesPer(() => {
      for (let k = 0; k < 100; k++) f.stateAt((t * k) / 100, s);
    });
    // a hundred states; at most the number V8 boxes for τ at the call (16 bytes each)
    expect(bytes).toBeLessThan(100 * 16 + 256);
  });
});

describe('circular orbits', () => {
  it('at the innermost stable one: half the speed of light past the hovering observers, √½ the clock, 1,954 s at Sgr A*', () => {
    const o = circularOrbit(6, M_S);
    expect(o.vRelStatic).toBe(0.5);
    expect(o.dtaudt).toBeCloseTo(Math.SQRT1_2, 15);
    expect(o.periodCoordS).toBeCloseTo(1954.5, 0);
    expect(o.periodCoordS / 60).toBeCloseTo(32.57, 2);
    expect(o.periodProperS / 60).toBeCloseTo(23.03, 2);
    expect(o.rapidity).toBeCloseTo(Math.atanh(0.5), 15);
  });
});

describe('rapidity relative to a moving frame', () => {
  it('is nothing for a ship moving with the frame, at 357 km/s', () => {
    const v = { x: 200, y: -250, z: 128.4 };
    const speed = Math.hypot(v.x, v.y, v.z);
    const out = { phi: 1, dir: { x: 0, y: 0, z: 0 } };
    relativeRapidity(Math.atanh(speed / C_KM_S), { x: v.x / speed, y: v.y / speed, z: v.z / speed }, v, out);
    expect(out.phi).toBeLessThan(1e-18);
  });

  it('composes exactly with any rapidity: cosh φ_rel = cosh φ cosh φ_f − sinh φ sinh φ_f cos θ', () => {
    const v = { x: 357, y: 0, z: 0 };
    const phiF = Math.atanh(357 / C_KM_S);
    const out = { phi: 0, dir: { x: 0, y: 0, z: 0 } };
    for (const [phi, th] of [
      [20, 0.3],
      [1, 2],
      [1e-3, 1],
      [0.5, Math.PI],
    ]) {
      const d = { x: Math.cos(th), y: Math.sin(th), z: 0 };
      relativeRapidity(phi, d, v, out);
      expect(Number.isFinite(out.phi)).toBe(true);
      const ch = Math.cosh(phi) * Math.cosh(phiF) - Math.sinh(phi) * Math.sinh(phiF) * Math.cos(th);
      // compared as sinh², which keeps its digits where φ_rel is small
      const s2 = Math.sinh(out.phi) ** 2;
      expect(rel(s2 + 1, ch * ch)).toBeLessThan(1e-12);
      expect(Math.abs(Math.hypot(out.dir.x, out.dir.y, out.dir.z) - 1)).toBeLessThan(1e-14);
    }
    // symmetric: a frame at rest sees the ship's own rapidity and direction
    relativeRapidity(2, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, out);
    expect(out.phi).toBeCloseTo(2, 14);
    expect(out.dir.y).toBe(1);
  });
});

// Node's own modules, reached without its type definitions (the app is typed for the browser).
interface V8 {
  setFlagsFromString(flags: string): void;
  getHeapSpaceStatistics(): { space_name: string; space_used_size: number }[];
}
const node = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
const v8 = node.getBuiltinModule('node:v8') as V8;
const vm = node.getBuiltinModule('node:vm') as { runInNewContext(code: string): unknown };
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
const newSpace = () => v8.getHeapSpaceStatistics().find((x) => x.space_name === 'new_space')!.space_used_size;

/** Young-generation bytes filled by one call of fn (after warming it up), less the measuring's own: the least of several tries. */
function bytesPer(fn: () => void): number {
  for (let k = 0; k < 2000; k++) fn();
  let best = Infinity;
  let overhead = Infinity;
  // Up to 40 tries, with more calls between them: in a full test run the optimising compiler (on a background thread,
  // with every core busy; a CI runner has two) can finish long after the first warm-up, and until then V8 boxes the
  // numbers its code keeps unboxed. Stop once a try shows nothing allocated.
  for (let attempt = 0; attempt < 40 && !(overhead < Infinity && best <= overhead); attempt++) {
    for (let k = 0; k < 1000; k++) fn();
    gc();
    const before = newSpace();
    fn();
    const grown = newSpace() - before;
    if (grown >= 0) best = Math.min(best, grown);
    gc();
    const b0 = newSpace();
    const g0 = newSpace() - b0;
    if (g0 >= 0) overhead = Math.min(overhead, g0);
  }
  return best - overhead;
}
