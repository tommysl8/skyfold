import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  cellsOnSphere,
  gravityDarkening,
  granulationStrength,
  limbDarkening,
  loggCgs,
  omegaFromFlattening,
  poleFromDirection,
  poleTemperatureFromMean,
  poleWorld,
  pressureScaleHeightKm,
  rocheFlattening,
  rocheGravity,
  rocheRadius,
  starSurface,
  surfaceSpeedup,
} from './closeup';
import { ACHERNAR_FLATTENING, CLOSE_UPS, EXTREME_REFS, EXTREME_STARS, radiusFromAngularDiameter, radiusFromLT, STEPHENSON_2_PC, UY_SCT_DISTANCE_PC } from './extremeStars';
import { raDecToWorld } from '../frames';

const DEG = Math.PI / 180;

describe('Roche shape and von Zeipel gravity darkening', () => {
  it('reproduces the measured flattening of Altair, Vega and Regulus from their fitted ω', () => {
    // Monnier et al. 2007: R_eq 2.029, R_pole 1.634 at ω = 0.923; Monnier et al. 2012: 2.726 and 2.418 at ω = 0.774;
    // Che et al. 2011: 4.21 and 3.22 at ω = 0.962.
    expect(rocheFlattening(0.923)).toBeCloseTo(2.029 / 1.634, 2);
    expect(rocheFlattening(0.774)).toBeCloseTo(2.726 / 2.418, 2);
    expect(rocheFlattening(0.962)).toBeCloseTo(4.21 / 3.22, 2);
  });

  it('is a sphere at rest, 1.5 polar radii wide at break-up, and ω round-trips', () => {
    expect(rocheRadius(1.0, 0)).toBe(1);
    // (At break-up the root is double: the solver stops a hair short.)
    expect(rocheFlattening(1)).toBeCloseTo(1.5, 2);
    for (const w of [0.3, 0.774, 0.923, 0.98]) expect(omegaFromFlattening(rocheFlattening(w))).toBeCloseTo(w, 9);
    // Achernar: R_eq/R_pole = 1.352 (Domiciano de Souza et al. 2014) is about 98% of break-up.
    expect(omegaFromFlattening(ACHERNAR_FLATTENING)).toBeCloseTo(0.98, 2);
    // The pole stays at one polar radius.
    expect(rocheRadius(0, 0.9)).toBe(1);
  });

  it('solves the Roche equipotential at every latitude', () => {
    for (const w of [0.5, 0.923, 0.99])
      for (let th = 0.05; th < Math.PI / 2; th += 0.1) {
        const x = rocheRadius(th, w);
        const k = (8 / 27) * w * w;
        expect(1 / x + 0.5 * k * x * x * Math.sin(th) ** 2).toBeCloseTo(1, 12);
      }
  });

  it('gives the surface normal along the effective gravity, steeper than the radius on an oblate star', () => {
    const { nr, nt } = rocheGravity(45 * DEG, 0.923);
    expect(Math.hypot(nr, nt)).toBeCloseTo(1, 12);
    // Tilted towards the pole (nt < 0: against increasing colatitude).
    expect(nt).toBeLessThan(0);
    // Numerically: the normal is perpendicular to the surface's tangent dr/dθ.
    const h = 1e-6;
    const th = 45 * DEG;
    const r0 = rocheRadius(th, 0.923);
    const dr = (rocheRadius(th + h, 0.923) - rocheRadius(th - h, 0.923)) / (2 * h);
    // Tangent (dr/dθ, r) in (r̂, θ̂).
    expect(nr * dr + nt * r0).toBeCloseTo(0, 6);
  });

  it('reproduces the equatorial temperatures the papers derive from their poles', () => {
    // Altair: T_pole 8,450 K, β = 0.190 → T_eq 6,860 ± 150 K (Monnier et al. 2007).
    expect(8450 * gravityDarkening(Math.PI / 2, 0.923, 0.19)).toBeCloseTo(6860, -2);
    // Vega: 10,070 K, β = 0.231 → 8,910 ± 130 K (Monnier et al. 2012).
    expect(Math.abs(10_070 * gravityDarkening(Math.PI / 2, 0.774, 0.231) - 8910)).toBeLessThan(130);
    // Regulus: 14,520 K, β = 0.188 → 11,010 (+420/−520) K (Che et al. 2011).
    expect(Math.abs(14_520 * gravityDarkening(Math.PI / 2, 0.962, 0.188) - 11_010)).toBeLessThan(420);
    // No darkening at the pole.
    expect(gravityDarkening(0, 0.923, 0.19)).toBeCloseTo(1, 12);
  });

  it('puts the poles of a gravity-darkened star above its mean temperature, and the mean round-trips', () => {
    const w = omegaFromFlattening(ACHERNAR_FLATTENING);
    const tp = poleTemperatureFromMean(15_000, w, 0.166);
    expect(tp).toBeGreaterThan(15_000);
    expect(tp * gravityDarkening(Math.PI / 2, w, 0.166)).toBeLessThan(15_000);
    // A sphere's pole is its mean.
    expect(poleTemperatureFromMean(6000, 0, 0.25)).toBeCloseTo(6000, 6);
  });
});

describe('the pole on the sky', () => {
  it('is tilted by the inclination from our line of sight, towards the position angle', () => {
    const ra = 297.7;
    const dec = 8.87;
    const p = poleWorld(ra, dec, 57.2, -61.8);
    const toEarth = raDecToWorld(ra, dec).negate();
    expect(Math.acos(p.dot(toEarth)) / DEG).toBeCloseTo(57.2, 6);
    // Position angle: from north through east.
    const celestialPole = raDecToWorld(0, 90);
    const north = celestialPole.clone().addScaledVector(toEarth, -celestialPole.dot(toEarth)).normalize();
    const east = new Vector3().crossVectors(celestialPole, toEarth).negate().normalize();
    const sky = p.clone().addScaledVector(toEarth, -p.dot(toEarth));
    expect(Math.atan2(sky.dot(east), sky.dot(north)) / DEG).toBeCloseTo(-61.8, 6);
    // East is towards increasing right ascension.
    const nudged = raDecToWorld(ra + 0.01, dec).sub(raDecToWorld(ra, dec));
    expect(nudged.dot(east)).toBeGreaterThan(0);
    expect(poleFromDirection(raDecToWorld(ra, dec), 57.2, -61.8).distanceTo(p)).toBeLessThan(1e-12);
  });
});

describe('limb darkening (Claret & Bloemen 2011)', () => {
  it('matches the table at its grid points', () => {
    // ATLAS, Z = 0, ξ = 2 km/s: V band u = 0.9099 at 3,500 K, log g 0; 0.4714 at 10,000 K, log g 4.
    expect(limbDarkening(3500, 0)[1]).toBeCloseTo(0.9099, 4);
    expect(limbDarkening(10_000, 4)[1]).toBeCloseTo(0.4714, 4);
  });
  it('darkens red supergiants’ limbs far more than hot stars’, blue more than red', () => {
    const rsg = limbDarkening(3600, -0.1);
    const hot = limbDarkening(25_000, 4);
    expect(rsg[1]).toBeGreaterThan(0.85);
    expect(hot[1]).toBeLessThan(0.4);
    const sun = limbDarkening(5772, 4.44);
    expect(sun[2]).toBeGreaterThan(sun[1]);
    expect(sun[1]).toBeGreaterThan(sun[0]);
  });
});

describe('granulation scaled to the star', () => {
  it('gives the Sun millions of granules about 1,300 km across', () => {
    const g = loggCgs(1, 1);
    expect(g).toBeCloseTo(4.438, 2);
    const hp = pressureScaleHeightKm(5772, g);
    expect(hp).toBeGreaterThan(120);
    expect(hp).toBeLessThan(150);
    const n = cellsOnSphere(695_700, 10 * hp);
    expect(n).toBeGreaterThan(2e6);
    expect(n).toBeLessThan(6e6);
  });
  it('gives Betelgeuse a few giant cells and far fewer granules than the Sun', () => {
    const s = starSurface({ teffK: 3600, radiusRsun: 764, massMsun: 18, spec: CLOSE_UPS.betelgeuse });
    // About thirty over the whole star: a dozen or so on the side we see.
    expect(s.giantCells).toBeLessThanOrEqual(30);
    expect(s.granules).toBeLessThan(10_000);
    expect(s.granuleContrast).toBeGreaterThan(0);
    // Turned over in about a year, shown a million times faster.
    expect(s.speedup).toBe(1e6);
  });
  it('fades out on stars too hot for surface convection', () => {
    expect(granulationStrength(5800)).toBe(1);
    expect(granulationStrength(9000)).toBe(0);
    expect(starSurface({ teffK: 9845, radiusRsun: 1.71, massMsun: 2.06 }).granuleContrast).toBe(0);
  });
  it('speeds the surface up by powers of ten until a turnover takes under a minute', () => {
    expect(surfaceSpeedup(480)).toBe(10);
    expect(surfaceSpeedup(30)).toBe(1);
    expect(surfaceSpeedup(3.156e7)).toBe(1e6);
  });
});

describe('the extreme stars', () => {
  it('derive their radii from the cited numbers', () => {
    // UY Scuti: 5.48 mas at 2.9 kpc is 1,708 R☉ (Arroyo-Torres et al. 2013); at Gaia's distance about 1,100.
    expect(radiusFromAngularDiameter(5.48, 2900)).toBeCloseTo(1708, -1);
    expect(UY_SCT_DISTANCE_PC).toBeCloseTo(1874, -1);
    expect(radiusFromAngularDiameter(5.48, UY_SCT_DISTANCE_PC)).toBeCloseTo(1104, -1);
    // VY CMa: 11.3 mas at 1.17 kpc is 1,420 R☉ (Wittkowski et al. 2012).
    expect(radiusFromAngularDiameter(11.3, 1170)).toBeCloseTo(1420, -1);
    // Mu Cephei: 972 R☉ at 641 pc and 3,551 K is log L = 5.13 (Montargès et al. 2019).
    expect(radiusFromLT(10 ** 5.13, 3551)).toBeCloseTo(972, -1);
    // Stephenson 2-18: 3,200 K and log L 5.64 give the 2,150 R☉ usually quoted (Fok et al. 2012).
    expect(radiusFromLT(10 ** 5.64, 3200)).toBeCloseTo(2150, -1);
    expect(STEPHENSON_2_PC).toBe(5830);
  });
  it('cite every reference they use', () => {
    for (const d of EXTREME_STARS) {
      for (const k of Object.values(d.json.refs)) expect(EXTREME_REFS[k], `${d.json.id} ${k}`).toBeDefined();
      for (const [, k] of d.facts) expect(EXTREME_REFS[k], `${d.json.id} fact ${k}`).toBeDefined();
    }
  });
  it('are findable by their other names', () => {
    const st = EXTREME_STARS.find((d) => d.json.id === 'stephenson-2-18')!;
    expect(st.json.altNames).toEqual(expect.arrayContaining(['St2-18', 'Stephenson 2 DFK 1']));
    expect(st.notes.join(' ')).toMatch(/disputed/);
  });
  it('turn Vega’s pole almost at us and Regulus’s almost across the line of sight', () => {
    const vega = starSurface({ teffK: 9360, radiusRsun: 2.6, massMsun: 2.15, dirWorld: [...raDecToWorld(279.23, 38.78).toArray()] as [number, number, number], spec: CLOSE_UPS.vega });
    const toEarth = raDecToWorld(279.23, 38.78).negate();
    expect(Math.acos(new Vector3(...vega.pole).dot(toEarth)) / DEG).toBeCloseTo(6.2, 6);
    expect(vega.poleTeffRatio).toBeCloseTo(10_070 / 9360, 9);
    expect(vega.rotationDays).toBe(0.71);
  });
});
