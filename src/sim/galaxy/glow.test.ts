/**
 * The Galaxy model's light near the camera: the glow's laws hold the light the particles hold, its
 * integration along a line of sight is exact enough, and seen from the Sun the model it completes
 * is about as bright as the sky map it takes over from (docs/data/galaxy.md). And the twins of the two
 * glows the same shader draws near black holes: the nuclear star cluster's march (against a fine
 * integration of its laws) and M87's table (against its published light profile and a fine
 * integration), with the table's processor time.
 */
import { describe, expect, it } from 'vitest';
import { gunzipFile, loadStars } from '../../test/stars';
import { readJson } from '../../test/files';
import { apply, ECL_TO_GAL, GAL_TO_G_ROT, galToG, ICRS_TO_GAL, unitFromAngles, anglesFromVector, type Vec3 } from './frames';
import { galaxyModel } from './arms';
import { particleBuffers } from './particles';
import { GALAXY_MODEL_JSON } from './galaxyData';
import { erf } from './model';
import {
  discSigma,
  glowDisc,
  layerColumn,
  GLOW_DISC_RANGE_KPC,
  GLOW_YOUNG_RANGE_KPC,
  M87_PSI_MIN,
  M87_TABLE_SIZE,
  m87ColumnAt,
  m87ColumnTable,
  m87Emissivity,
  m87Profile,
  nearGlow,
  NUCLEAR_GLOW_STEPS,
  nuclearGlowAt,
  nuclearMarch,
  particleShare,
  populationColour,
  populationLuminosity,
  templateKept,
  templateSplats,
  THICK_DISC,
  THIN_DISC,
  YOUNG_ARM_STARS,
  youngHz,
  youngSurfaceMap,
  type GlowSetup,
  type M87TemplateNear,
} from './glow';
import { NUCLEAR_GLOW, nuclearGlow } from './nuclearCluster';
import { buildTemplate } from '../cosmos/templates';
import { cpuMs } from '../../test/timing';

const json = GALAXY_MODEL_JSON;
const model = galaxyModel();
const particles = particleBuffers(gunzipFile('public/data/galaxy-particles.bin.gz'));
const L = populationLuminosity(particles.attrs, particles.count);
const RES = 256;
const EXT = 20;
const youngMap = youngSurfaceMap(json, L[YOUNG_ARM_STARS], RES, EXT, model);
const texelPc2 = ((2 * EXT * 1000) / RES) ** 2;

/** The young map bilinearly, as the GPU samples it. */
function young(x: number, y: number): number {
  const fi = ((x + EXT) / (2 * EXT)) * RES - 0.5;
  const fj = ((y + EXT) / (2 * EXT)) * RES - 0.5;
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= RES - 1 || j >= RES - 1) return 0;
  const a = fi - i;
  const b = fj - j;
  const m = youngMap;
  return (1 - a) * (1 - b) * m[j * RES + i] + a * (1 - b) * m[j * RES + i + 1] + (1 - a) * b * m[(j + 1) * RES + i] + a * b * m[(j + 1) * RES + i + 1];
}

const setup: GlowSetup = {
  thin: glowDisc(json, 'thinDisc', L[THIN_DISC]),
  thick: glowDisc(json, 'thickDisc', L[THICK_DISC]),
  youngHz: youngHz(json),
  young,
  dust: model.dustMidplane,
};
const SUN_G = galToG([0, 0, 0]);
/** Everything as glow, out to 40 kpc. */
const ALL: Pick<GlowSetup, 'discRange' | 'youngRange'> = { discRange: [30, 40], youngRange: [30, 40] };
const noDust: GlowSetup['dust'] = (x, y) => ({ ...model.dustMidplane(x, y), discAV: 0, armAV: 0 });
const total = (g: { thin: number; young: number; thick: number }) => g.thin + g.young + g.thick;
/** A column S (L☉/pc²) along a line of sight as a surface brightness, mag/arcsec² (M☉,V = 4.83). */
const mu = (S: number) => 4.83 + 21.572 - 2.5 * Math.log10(S);
const dirG = (l: number, b: number): Vec3 => apply(GAL_TO_G_ROT, unitFromAngles(l, b));

describe('the glow’s laws', () => {
  it('hold the light the particles hold: each disc, and the young arm stars along the arms', () => {
    for (const [d, pop] of [
      [setup.thin, THIN_DISC],
      [setup.thick, THICK_DISC],
    ] as const) {
      let sum = 0;
      const dR = 0.01;
      for (let R = dR / 2; R < d.Rmax; R += dR) sum += discSigma(d, R) * 2 * Math.PI * R * dR * 1e6;
      expect(Math.abs(sum / L[pop] - 1)).toBeLessThan(1e-3);
    }
    let sum = 0;
    for (const v of youngMap) sum += v * texelPc2;
    expect(Math.abs(sum / L[YOUNG_ARM_STARS] - 1)).toBeLessThan(0.01);
  });

  it('match the particles about the Sun: the discs within 10%, the young stars (in clumps of 8) within 25%', () => {
    const near = new Float64Array(16);
    const Rc = 1.5;
    for (let i = 0; i < particles.count; i++) {
      const x = particles.position[3 * i] * particles.kpcPerUnit;
      const y = particles.position[3 * i + 1] * particles.kpcPerUnit;
      if (Math.hypot(x, y) < Rc) near[particles.attrs[4 * i]] += 2 ** (particles.attrs[4 * i + 1] / 8);
    }
    const area = Math.PI * (Rc * 1000) ** 2;
    const R0 = Math.hypot(SUN_G[0], SUN_G[1]);
    expect(Math.abs(near[THIN_DISC] / area / discSigma(setup.thin, R0) - 1)).toBeLessThan(0.1);
    // The map's mean over the same circle.
    let s = 0;
    let n = 0;
    for (let x = -Rc; x <= Rc; x += 0.05)
      for (let y = -Rc; y <= Rc; y += 0.05)
        if (Math.hypot(x, y) < Rc) {
          s += young(SUN_G[0] + x, SUN_G[1] + y);
          n++;
        }
    expect(Math.abs(near[YOUNG_ARM_STARS] / area / (s / n) - 1)).toBeLessThan(0.25);
  });

  it('colour the young arm stars blue-white and the discs yellow, as their particles', () => {
    const thin = populationColour(json, 'thinDisc');
    const youngC = populationColour(json, 'youngArmStars');
    expect(thin.temperatureK).toBeGreaterThan(4500);
    expect(thin.temperatureK).toBeLessThan(5500);
    expect(youngC.temperatureK).toBeGreaterThan(10000);
    expect(thin.rgb[0]).toBeGreaterThan(thin.rgb[2]);
    expect(youngC.rgb[2]).toBeGreaterThan(youngC.rgb[0]);
    for (const c of [thin, youngC]) expect(0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2]).toBeCloseTo(1, 9);
  });
});

describe('the glow along a line of sight', () => {
  it('without dust, straight up and down from the Sun, is the discs’ exponential layers', () => {
    const zw = model.dustMidplane(SUN_G[0], SUN_G[1]).warp;
    const R0 = Math.hypot(SUN_G[0], SUN_G[1]);
    for (const [b, sign] of [
      [90, 1],
      [-90, -1],
    ] as const) {
      const g = nearGlow(SUN_G, dirG(0, b), { ...setup, ...ALL, dust: noDust });
      for (const [d, got] of [
        [setup.thin, g.thin],
        [setup.thick, g.thick],
      ] as const) {
        const z0 = (SUN_G[2] - zw) * sign;
        // Σ/2 of the layer is above the midplane; the Sun is z0 above it.
        const want = sign > 0 ? (discSigma(d, R0) / 2) * Math.exp(-z0 / d.hz) : (discSigma(d, R0) / 2) * (2 - Math.exp(z0 / d.hz));
        expect(Math.abs(got / want - 1)).toBeLessThan(0.01);
      }
    }
  });

  it('through the dust, in 32 steps, agrees with a fine integration to 5%', () => {
    // The reference: 1-pc steps, the dust point by point, the populations' laws point by point.
    const reference = (cam: Vec3, u: Vec3, end: number) => {
      const ds = 0.001;
      let tau = 0;
      let S = 0;
      for (let s = ds / 2; s < end; s += ds) {
        const p: Vec3 = [cam[0] + u[0] * s, cam[1] + u[1] * s, cam[2] + u[2] * s];
        const R = Math.hypot(p[0], p[1]);
        const zw = model.dustMidplane(p[0], p[1]).warp;
        const z = Math.abs(p[2] - zw);
        const a = 0.921034 * model.dustAV(p) * ds;
        const seen = Math.exp(-tau - a / 2);
        const wD = 1 - particleShare(s, GLOW_DISC_RANGE_KPC);
        const wY = 1 - particleShare(s, GLOW_YOUNG_RANGE_KPC);
        const j =
          wD * ((discSigma(setup.thin, R) / (2 * setup.thin.hz)) * Math.exp(-z / setup.thin.hz) + (discSigma(setup.thick, R) / (2 * setup.thick.hz)) * Math.exp(-z / setup.thick.hz)) +
          wY * ((young(p[0], p[1]) / (2 * setup.youngHz)) * Math.exp(-z / setup.youngHz));
        S += j * seen * ds;
        tau += a;
      }
      return S;
    };
    const above = galToG([0, 0, 1]);
    for (const [cam, l, b] of [
      [SUN_G, 0, 0],
      [SUN_G, 90, 0],
      [SUN_G, 180, 0],
      [SUN_G, 20, 5],
      [SUN_G, 0, 30],
      [SUN_G, 0, -90],
      [above, 0, -90],
      [above, 30, -30],
    ] as const) {
      const u = dirG(l, b);
      const got = total(nearGlow(cam, u, setup));
      const want = reference(cam, u, GLOW_DISC_RANGE_KPC[1]);
      expect(Math.abs(got / want - 1), `${l}, ${b}`).toBeLessThan(0.05);
    }
  });

  // The shader's arithmetic is float32: each operation rounded (Math.fround), as the GPU does.
  const f = Math.fround;
  const exp32 = (x: number) => f(Math.exp(f(x)));
  /** The old form, the difference of ∫ from 0 to zb and to za, in float32. */
  const oldColumn32 = (za: number, zb: number, h: number) => {
    const layer = (z: number) => f(Math.sign(z) * f(f(h) * f(1 - exp32(f(-f(Math.abs(z)) / f(h))))));
    return f(layer(zb) - layer(za));
  };
  /** layerColumn as the shader computes it, in float32. */
  const column32 = (za: number, zb: number, h: number) => {
    const a = f(f(Math.abs(za)) / f(h));
    const b = f(f(Math.abs(zb)) / f(h));
    const ome = (x: number) => (x < 1e-3 ? f(x * f(1 - f(f(0.5 * x) * f(1 - f(x / 3))))) : f(1 - exp32(-x)));
    const m = za * zb >= 0 ? f(f(f(h) * exp32(-Math.min(a, b))) * ome(f(f(Math.abs(f(zb - za))) / f(h)))) : f(f(h) * f(ome(a) + ome(b)));
    return zb >= za ? m : -m;
  };
  /** The exact integral, float64, in closed form. */
  const exact = (za: number, zb: number, h: number) => {
    const F = (z: number) => (z >= 0 ? h * (1 - Math.exp(-z / h)) : -h * (1 - Math.exp(z / h)));
    if (za * zb >= 0) {
      const [lo, hi] = [Math.min(Math.abs(za), Math.abs(zb)), Math.max(Math.abs(za), Math.abs(zb))];
      return Math.sign(zb - za) * h * (Math.exp(-lo / h) - Math.exp(-hi / h));
    }
    return F(zb) - F(za);
  };

  it('takes each step’s column through a layer without cancellation, so far from a thin layer it is small and positive, not noise', () => {
    // float64: the closed form, on either side of the midplane, across it and backwards.
    for (const [za, zb, h] of [
      [-1, -0.98, 0.06],
      [0.5, 0.7, 0.3],
      [-0.2, 0.3, 0.06],
      [0.7, 0.5, 0.3],
      [2, 2.0001, 0.9],
      [-0.01, 0.01, 0.3],
    ] as const) {
      expect(Math.abs(layerColumn(za, zb, h) / exact(za, zb, h) - 1), `${za} ${zb} ${h}`).toBeLessThan(1e-9);
    }
    // float32, the young arm stars' 60-pc layer a kiloparsec from the camera (where the white band was): steps of
    // 1 pc to 300 pc rising towards it. Rounded as here, the old difference came out zero or twice too large in 9 of
    // these 20 steps (on the GPU, whose exp is less exact than float32 rounding, also of the wrong sign); the new
    // column stays within 1e-5 of the exact one and is never negative.
    let oldBad = 0;
    for (const z0 of [-1.2, -1, -0.8, 0.8, 1]) {
      for (const dz of [0.001, 0.01, 0.1, 0.3]) {
        const za = f(z0);
        const zb = f(z0 + Math.sign(-z0) * dz);
        const want = exact(za, zb, 0.06);
        const got = column32(za, zb, 0.06);
        expect(Math.abs(got / want - 1), `${za} → ${zb}`).toBeLessThan(1e-5);
        expect(got * Math.sign(zb - za)).toBeGreaterThan(0);
        const old = oldColumn32(za, zb, 0.06);
        if (!(Math.abs(old / want - 1) < 0.5)) oldBad++;
      }
    }
    expect(oldBad).toBeGreaterThanOrEqual(8);
  });
});

describe('the handover from the sky map to the model', () => {
  // The sky map's calibration: V surface brightness in caps of 2° radius (scripts/build-milkyway-bg.py).
  const samples = readJson<{ calibration: { samples: Record<string, { muV: number }> } }>('public/textures/milkyway-bg.json').calibration.samples;
  const CAPS: Record<string, [number, number]> = {
    northGalacticPole: [192.85948, 27.12825],
    southGalacticPole: [12.85948, -27.12825],
    galacticCentre: [266.405, -28.936],
    scutumStarCloud: [280.0, -8.0],
    galacticAnticentre: [86.405, 28.936],
  };
  const D = Math.PI / 180;
  const capDirs = (ra: number, dec: number): Vec3[] => {
    const icrs = unitFromAngles(ra, dec);
    const gal = apply(ICRS_TO_GAL, icrs);
    const { lon, lat } = anglesFromVector(gal);
    const out: Vec3[] = [unitFromAngles(lon, lat)];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      out.push(unitFromAngles(lon + (1.3 * Math.cos(a)) / Math.cos(lat * D), lat + 1.3 * Math.sin(a)));
    }
    return out;
  };
  /** The model seen from the Sun as the renderer draws it (the glow, and the particles' expectation), mag/arcsec². */
  function modelFromSun(dirs: Vec3[]): number {
    let glow = 0;
    for (const u of dirs) glow += total(nearGlow(SUN_G, apply(GAL_TO_G_ROT, u), setup));
    glow /= dirs.length;
    let parts = 0;
    const k = particles.kpcPerUnit;
    for (let i = 0; i < particles.count; i++) {
      const pop = particles.attrs[4 * i];
      const p: Vec3 = [particles.position[3 * i] * k, particles.position[3 * i + 1] * k, particles.position[3 * i + 2] * k];
      const d = Math.hypot(p[0], p[1], p[2]);
      const h = 2 ** (particles.attrs[4 * i + 2] / 16) / 1000;
      const w = pop === THIN_DISC || pop === THICK_DISC ? particleShare(d, GLOW_DISC_RANGE_KPC) : pop === YOUNG_ARM_STARS ? particleShare(d, GLOW_YOUNG_RANGE_KPC) : 1;
      if (w <= 0 || d <= h) continue;
      let s = 0;
      for (const u of dirs) {
        const c = (u[0] * p[0] + u[1] * p[1] + u[2] * p[2]) / d;
        const e = (d * d * Math.max(0, 1 - c * c)) / (2 * h * h);
        if (e > 30) continue;
        // The ray integral of the splat's Gaussian (per pc²).
        s += (1 / (2 * Math.PI * (h * 1000) ** 2)) * Math.exp(-e) * 0.5 * (1 + erf((d * c) / (Math.SQRT2 * h)));
      }
      if (s === 0) continue;
      const T = Math.exp(-0.921034 * model.columnAV(SUN_G, galToG(p), 16));
      parts += (w * 2 ** (particles.attrs[4 * i + 1] / 8) * s * T) / dirs.length;
    }
    return mu(glow + parts);
  }
  /** The catalogue's stars (V ≤ 10) in a cap of 2°, mag/arcsec²: the sky map leaves out stars brighter than about V = 11. */
  function starsInCap(ra: number, dec: number): number {
    const stars = loadStars();
    const icrs = unitFromAngles(ra, dec);
    const gal = apply(ICRS_TO_GAL, icrs);
    const cosR = Math.cos(2 * D);
    let f = 0;
    for (let i = 0; i < stars.count; i++) {
      const x = stars.positions[3 * i];
      const y = stars.positions[3 * i + 1];
      const z = stars.positions[3 * i + 2];
      const r = Math.hypot(x, y, z);
      if (!(r > 0)) continue;
      const g = apply(ECL_TO_GAL, [x / r, y / r, z / r]);
      if (g[0] * gal[0] + g[1] * gal[1] + g[2] * gal[2] < cosR) continue;
      f += 10 ** (-0.4 * (stars.absMag[i] + 5 * Math.log10(r / 10)));
    }
    const arcsec2 = 2 * Math.PI * (1 - cosR) * (180 / Math.PI) ** 2 * 3600 ** 2;
    return -2.5 * Math.log10(f / arcsec2);
  }
  const sum = (a: number, b: number) => -2.5 * Math.log10(10 ** (-0.4 * a) + 10 ** (-0.4 * b));

  it('is within half a magnitude of the real sky towards the anticentre and the galactic poles, and at most 1.6 fainter towards the inner Galaxy', () => {
    const got: Record<string, number> = {};
    for (const [name, [ra, dec]] of Object.entries(CAPS)) {
      const sky = sum(samples[name].muV, starsInCap(ra, dec));
      got[name] = modelFromSun(capDirs(ra, dec)) - sky;
    }
    // The model is smooth: its dust has no windows like those of the star clouds of Sagittarius
    // and Scutum, whose light the sky map shows (docs/data/galaxy.md, known limitations).
    for (const name of ['galacticAnticentre', 'northGalacticPole', 'southGalacticPole']) expect(Math.abs(got[name]), name).toBeLessThan(0.5);
    for (const name of ['galacticCentre', 'scutumStarCloud']) {
      expect(got[name], name).toBeGreaterThan(0);
      expect(got[name], name).toBeLessThan(1.6);
    }
  }, 60_000);
});

// ─── The nuclear star cluster's glow and M87's starlight (docs/data/blackholes.md §6) ────────

/** A seeded uniform generator (mulberry32), for reproducible random rays. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const unitRandom = (rnd: () => number): Vec3 => {
  const z = 2 * rnd() - 1;
  const a = 2 * Math.PI * rnd();
  const q = Math.sqrt(1 - z * z);
  return [q * Math.cos(a), q * Math.sin(a), z];
};

describe('the nuclear star cluster’s glow along a line of sight', () => {
  const laws = nuclearGlow.laws;
  const e = [0, 0];
  /** The reference: 200,000 steps uniform in ln s from 10⁻⁶ pc to 2,000 pc, the laws point by point. */
  const reference = (c: Vec3, u: Vec3): number => {
    const n = 200000;
    const l0 = Math.log(1e-6);
    const dl = (Math.log(2000) - l0) / n;
    let S = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.exp(l0 + (i + 0.5) * dl);
      nuclearGlowAt(laws, c[0] + s * u[0], c[1] + s * u[1], c[2] + s * u[2], e);
      S += (e[0] + e[1]) * s * dl;
    }
    return S;
  };
  const DISTANCES = [0.02, 0.2, 2, 10, 30, 55];
  const cases = (() => {
    const rnd = seeded(20260929);
    const out: { d: number; c: Vec3; u: Vec3; want: number }[] = [];
    for (const d of DISTANCES) {
      for (let k = 0; k < 30; k++) {
        const v = unitRandom(rnd);
        const c: Vec3 = [v[0] * d, v[1] * d, v[2] * d];
        const u = unitRandom(rnd);
        out.push({ d, c, u, want: reference(c, u) });
      }
    }
    return out;
  })();
  const errors = (cells: number) =>
    cases.map(({ c, u, want }) => {
      const got = nuclearMarch(laws, c, u, cells);
      return (got[0] + got[1]) / want - 1;
    });
  const quantile = (a: number[], q: number) => a.map(Math.abs).sort((x, y) => x - y)[Math.floor(q * (a.length - 1))];

  it('in 16 steps (the shader’s, step for step) agrees with a fine integration: median 0.5 %, nine rays in ten 2 %, the sky’s mean 1 %', () => {
    const err = errors(NUCLEAR_GLOW_STEPS[0]);
    expect(quantile(err, 0.5)).toBeLessThan(0.005);
    expect(quantile(err, 0.9)).toBeLessThan(0.02);
    expect(quantile(err, 1)).toBeLessThan(0.05);
    // What reaches the eye over the whole sky from each camera: the mean column.
    for (const d of DISTANCES) {
      let got = 0;
      let want = 0;
      for (const x of cases) {
        if (x.d !== d) continue;
        const g = nuclearMarch(laws, x.c, x.u, NUCLEAR_GLOW_STEPS[0]);
        got += g[0] + g[1];
        want += x.want;
      }
      expect(Math.abs(got / want - 1), `${d} pc`).toBeLessThan(0.01);
    }
  }, 60_000);

  it('in 8 steps (rung 1) within a few per cent: median 3 %, nine rays in ten 8 %', () => {
    const err = errors(NUCLEAR_GLOW_STEPS[1]);
    expect(quantile(err, 0.5)).toBeLessThan(0.03);
    expect(quantile(err, 0.9)).toBeLessThan(0.08);
  });

  it('is nothing for rays that pass outside the field, and never negative', () => {
    expect(nuclearMarch(laws, [400, 0, 0], [0, 1, 0], 16)).toEqual([0, 0]);
    for (const { c, u } of cases) {
      const g = nuclearMarch(laws, c, u, 16);
      expect(g[0]).toBeGreaterThanOrEqual(0);
      expect(g[1]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('M87’s own starlight', () => {
  const json = NUCLEAR_GLOW;
  const p = m87Profile(json);
  const MU_OF_SIGMA = 26.402;

  it('projects back onto its published fits (Ferrarese et al. 2006 inside 25″, Kormendy et al. 2009 outside): 0.01 mag to 200″, 0.03 at 1,000″', () => {
    // The fits along the major axis, circularised with the measured ellipticity, as scripts/build-nsc.py writes
    // them; j(r) deprojected there by Abel's integral, projected again here.
    type Fits = { ferrarese: { mue: number; gamma: number; n: number; re: number; rb: number }; gToV: number; kormendy: { n: number; re: number; mue: number }; joinArcsec: number; av: number; ellipticity: [number, number][] };
    const prof = readJson<{ m87: { profile: Fits } }>('src/sim/galaxy/nuclearGlow.json').m87.profile;
    const bn = (n: number) => 2 * n - 1 / 3 + 4 / (405 * n) + 46 / (25515 * n * n);
    const sersic = (R: number, n: number, re: number, mue: number) => mue + ((2.5 * bn(n)) / Math.LN10) * ((R / re) ** (1 / n) - 1);
    const muFit = (Rm: number) => {
      const f = prof.ferrarese;
      const mb = sersic(f.rb, f.n, f.re, f.mue);
      const core = Rm < f.rb ? mb + 2.5 * f.gamma * Math.log10(Rm / f.rb) : sersic(Rm, f.n, f.re, f.mue);
      const k = prof.kormendy;
      return (Rm < prof.joinArcsec ? core - prof.gToV : sersic(Rm, k.n, k.re, k.mue)) - prof.av;
    };
    const E = prof.ellipticity;
    const eps = (Rm: number) => {
      const x = Math.log10(Rm);
      for (let i = 0; i < E.length - 1; i++) {
        const a = Math.log10(E[i][0]);
        const b = Math.log10(E[i + 1][0]);
        if (x <= b) return E[i][1] + ((E[i + 1][1] - E[i][1]) * (Math.max(x, a) - a)) / (b - a);
      }
      return E[E.length - 1][1];
    };
    const pcPerArcsec = (json.m87.distanceMpc * 1e6 * Math.PI) / 180 / 3600;
    for (const Rm of [0.2, 2, 20, 200, 1000]) {
      const Rc = Rm * Math.sqrt(1 - eps(Rm)) * pcPerArcsec;
      // Σ(R) = 2 ∫ j(√(R² + z²)) dz, with z = R sinh t.
      let col = 0;
      const nt = 20000;
      const tMax = 14;
      for (let i = 0; i < nt; i++) {
        const t = ((i + 0.5) * tMax) / nt;
        col += 2 * m87Emissivity(p, Rc * Math.cosh(t)) * Rc * Math.cosh(t) * (tMax / nt);
      }
      const mu = MU_OF_SIGMA - 2.5 * Math.log10(col);
      // At 1,000″ (80 kpc) the table's end at 300 kpc leaves out a little of the Sérsic envelope's light.
      expect(Math.abs(mu - muFit(Rm)), `${Rm}″`).toBeLessThan(Rm > 500 ? 0.03 : 0.01);
    }
    // And its light: M_V −23.1 at the app's distance (Kormendy et al.'s M_VT −22.95 at 17.14 Mpc is −23.01 here).
    expect(4.83 - 2.5 * Math.log10(json.m87.lightLsun)).toBeCloseTo(-23.12, 1);
  });

  // The model galaxy's elliptical template (the app's own), as it would be drawn for a galaxy of 8 kpc half-light radius.
  const tmpl = buildTemplate('elliptical');
  const near: M87TemplateNear = { ...templateSplats(tmpl.position, tmpl.attrs, tmpl.count), unitPc: 8000, splatPc: 8000, pxPerRad: 296, sigmaMax: 256 };

  it('its table holds, direction by direction, the light the template no longer draws, to 2 % (against a fine integration; 0.9 % at worst today)', () => {
    const table = new Float32Array(M87_TABLE_SIZE);
    const rEnd = near.rMax * near.unitPc;
    for (const d of [0.00485, 1, 100, 3000, 20000]) {
      m87ColumnTable(p, near, d, table);
      const peak = m87ColumnAt(table, M87_PSI_MIN);
      for (const psi of [2e-4, 0.01, 0.3, 1.2, 2.5, 3.1]) {
        // Fine: 200,000 midpoint steps in t (r = b cosh t) over the whole ray within the template's reach, the
        // light where the template's particles have faded.
        const b = d * Math.sin(psi);
        const s0 = d * Math.cos(psi);
        const t0 = Math.asinh(-s0 / b);
        const t1 = Math.acosh(rEnd / b);
        const n = 200000;
        const dt = (t1 - t0) / n;
        let want = 0;
        for (let i = 0; i < n; i++) {
          const tt = t0 + (i + 0.5) * dt;
          const r = b * Math.cosh(tt);
          const s = s0 + b * Math.sinh(tt);
          want += m87Emissivity(p, r) * (1 - templateKept(near, r, s)) * r * dt;
        }
        if (want < 1e-6 * peak) continue;
        // The table is read log-linearly between its nodes: the fine integration is compared at the nodes' own ψ.
        const got = m87ColumnAt(table, psi);
        expect(Math.abs(got / want - 1), `d ${d} pc, ψ ${psi}`).toBeLessThan(0.02);
      }
    }
  }, 60_000);

  it('from M87* (1,000 au) is the whole profile’s light, bright all round; from far off, nothing', () => {
    const table = new Float32Array(M87_TABLE_SIZE);
    m87ColumnTable(p, near, 0.00485, table);
    const toward = m87ColumnAt(table, 1e-3);
    const away = m87ColumnAt(table, Math.PI);
    // μ about 12.3 to 14.6 mag/arcsec² (the core's inner power law, held flat inside 1,000 au).
    expect(MU_OF_SIGMA - 2.5 * Math.log10(toward)).toBeGreaterThan(11);
    expect(MU_OF_SIGMA - 2.5 * Math.log10(away)).toBeLessThan(15);
    m87ColumnTable(p, near, 1e6, table);
    expect(m87ColumnAt(table, 0.5)).toBe(0);
  });

  it('builds its table within its 0.1 ms of processor time (guarded at twice that)', () => {
    const table = new Float32Array(M87_TABLE_SIZE);
    // Batches of a few hundred milliseconds (Windows counts processor time in ticks of 15.6 ms), the best of
    // eight: the machine's other work still slows this thread's own time through the shared caches. The budget is
    // 0.1 ms (best batches 0.07–0.11 ms with other processes busy); the guard is twice it, as the lens tables'
    // test guards theirs (physics/schwarzschildTables.test.ts), since a shared core inflates processor time.
    const batch = 2000;
    let best = Infinity;
    for (let k = 0; k < 8; k++) {
      const t0 = cpuMs();
      for (let i = 0; i < batch; i++) m87ColumnTable(p, near, 0.005 + i, table);
      best = Math.min(best, (cpuMs() - t0) / batch);
    }
    expect(best).toBeLessThan(0.2);
    // (Processor time, not the wall clock: in a full test run the batches can take longer than the default 5 s.)
  }, 60_000);
});
