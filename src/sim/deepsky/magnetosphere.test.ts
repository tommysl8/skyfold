import { describe, expect, it } from 'vitest';
import {
  B_ONE_KEV_G,
  confinedField,
  denseTwistedField,
  dipoleFieldG,
  DOUBLE_PULSAR_A_EDOT,
  DOUBLE_PULSAR_B_EDOT,
  magnetopauseKm,
  polarCapAngle,
  pulsarMagnetosphere,
  sheetLatitude,
  spinDownErgS,
  stripedSheet,
  twistedReach,
  windingPerKm,
  windPolarity,
} from './magnetosphere';
import { lightCylinderKm, NS_RADIUS_KM } from './pulsarModel';

const DEG = Math.PI / 180;
const CRAB_P = 0.0333924123;
const CRAB_PDOT = 4.20972e-13;

describe('a pulsar’s magnetosphere', () => {
  it('the light cylinder c·P/2π and the polar cap sin²θ_pc = R/R_LC: the Crab’s cap about 5° across its pole', () => {
    const rlc = lightCylinderKm(CRAB_P);
    expect(rlc).toBeCloseTo(1593.3, 0);
    const th = polarCapAngle(NS_RADIUS_KM, rlc);
    expect(Math.sin(th) ** 2).toBeCloseTo(NS_RADIUS_KM / rlc, 12);
    expect(th / DEG).toBeCloseTo(4.98, 2);
    // A millisecond pulsar's cap is much wider; the cap never exceeds the hemisphere.
    expect(polarCapAngle(NS_RADIUS_KM, lightCylinderKm(0.0016)) / DEG).toBeGreaterThan(20);
    expect(polarCapAngle(20, 10)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('the dipole field from the spin, 3.2 × 10¹⁹ (PṖ)^½: the Crab’s about 3.8 × 10¹² G', () => {
    expect(dipoleFieldG(CRAB_P, CRAB_PDOT)).toBeCloseTo(3.79e12, -10);
  });

  it('Spitkovsky’s spin-down: twice as much for an orthogonal rotator as an aligned one, the Crab’s near its measured 4.5 × 10³⁸ erg/s', () => {
    const b = dipoleFieldG(CRAB_P, CRAB_PDOT);
    expect(spinDownErgS(b, CRAB_P, Math.PI / 2) / spinDownErgS(b, CRAB_P, 0)).toBeCloseTo(2, 12);
    // Ė = 4π²IṖ/P³ with I = 10⁴⁵ g cm²: 4.5 × 10³⁸; the force-free formula lands within a factor of a few.
    const l = spinDownErgS(b, CRAB_P, 60 * DEG);
    expect(l).toBeGreaterThan(4.5e38 / 5);
    expect(l).toBeLessThan(4.5e38 * 5);
  });

  it('the striped wind’s sheet reaches exactly the latitudes ±α (and ±(180° − α))', () => {
    for (const aDeg of [10, 45, 60, 85, 120]) {
      const a = aDeg * DEG;
      let max = 0;
      for (let i = 0; i < 3600; i++) max = Math.max(max, Math.abs(sheetLatitude(a, (2 * Math.PI * i) / 3600)));
      expect(max / DEG).toBeCloseTo(Math.min(aDeg, 180 - aDeg), 6);
    }
    // The sheet's grid lies on it: m̂(t − r/c)·r̂ = 0 at every vertex.
    const s = stripedSheet(CRAB_P, 50 * DEG, 4, 16, 32);
    const rlc = lightCylinderKm(CRAB_P);
    for (let k = 0; k < s.u.length; k++) expect(Math.abs(windPolarity(50 * DEG, rlc, s.positions[3 * k], s.positions[3 * k + 1], s.positions[3 * k + 2]))).toBeLessThan(1e-6);
  });

  it('the wind alternates in stripes within ±α of the equator, half a turn (π R_LC) apart along a radius', () => {
    const a = 45 * DEG;
    const rlc = 1000;
    const signs: number[] = [];
    for (let r = 2 * rlc; r < 2 * rlc + 2 * Math.PI * rlc; r += 0.05 * rlc) signs.push(Math.sign(windPolarity(a, rlc, r, 0, 0)));
    const flips = signs.slice(1).filter((s, i) => s !== signs[i]).length;
    expect(flips).toBe(2);
    // Beyond the band the polarity does not change.
    const high = 60 * DEG;
    for (let r = 2 * rlc; r < 10 * rlc; r += 0.1 * rlc) expect(windPolarity(a, rlc, r * Math.cos(high), 0, r * Math.sin(high))).toBeGreaterThan(0);
  });

  it('the open lines start inside the polar cap, run out to the wind and are wound back by 1/R_LC per unit of poloidal length', () => {
    const f = pulsarMagnetosphere(CRAB_P, 0, NS_RADIUS_KM, { closed: [], open: [0.5], azimuths: 1, windReach: 4 });
    const rlc = lightCylinderKm(CRAB_P);
    const p = f.positions;
    // The first vertex: on the star, at the colatitude holding half the cap's flux.
    const r0 = Math.hypot(p[0], p[1], p[2]);
    expect(r0).toBeCloseTo(NS_RADIUS_KM, 6);
    expect(Math.sin(Math.acos(p[2] / r0)) ** 2).toBeCloseTo((0.5 * NS_RADIUS_KM) / rlc, 6);
    // Far out the line is radial at the split monopole's angle acos(1 − f) = 60° and turns −1 rad per R_LC of length.
    // The north cap's line: the first half of the segments.
    const n = f.arc.length / 4;
    const seg = (i: number) => [p[6 * i + 3], p[6 * i + 4], p[6 * i + 5]];
    const a = seg(Math.floor(n / 2) - 1);
    const b = seg(n - 1);
    const lat = (q: number[]) => Math.acos(q[2] / Math.hypot(q[0], q[1], q[2]));
    expect(lat(b) / DEG).toBeCloseTo(60, 0);
    const dPhi = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
    // Along the poloidal field (radially, out here): B_φ/B_p = −ϖ/R_LC is dφ/ds_p = −1/R_LC.
    const dArc = Math.hypot(b[0], b[1], b[2]) - Math.hypot(a[0], a[1], a[2]);
    const wrap = (x: number) => ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    expect(Math.abs(wrap(dPhi - dArc * windingPerKm(CRAB_P)))).toBeLessThan(0.02);
  });

  it('the closed zone stays inside the light cylinder, its last loop reaching it at the Y-point', () => {
    const rlc = lightCylinderKm(CRAB_P);
    for (const aDeg of [0, 45, 89]) {
      const f = pulsarMagnetosphere(CRAB_P, aDeg * DEG, NS_RADIUS_KM, { open: [] });
      let max = 0;
      for (let i = 0; i < f.positions.length; i += 3) max = Math.max(max, Math.hypot(f.positions[i], f.positions[i + 1]));
      expect(max).toBeLessThanOrEqual(rlc * 1.0001);
      if (aDeg === 0) expect(max).toBeGreaterThan(0.999 * rlc);
    }
  });
});

describe('magnetars', () => {
  it('the twisted zone reaches where the cyclotron energy falls to 1 keV: about 18 star radii at 5 × 10¹⁴ G', () => {
    expect(B_ONE_KEV_G).toBeCloseTo(8.64e10, -8);
    expect(twistedReach(5e14)).toBeCloseTo(17.97, 1);
    // A stronger field reaches further, as B^⅓; a missing field keeps the close-up's 12.
    expect(twistedReach(8 * 2e14) / twistedReach(2e14)).toBeCloseTo(2, 6);
    expect(twistedReach(NaN)).toBe(12);
  });

  it('every loop’s two footpoints on the star, a radian apart in azimuth', () => {
    const f = denseTwistedField(2e14, 1, NS_RADIUS_KM, 4);
    const p = f.positions;
    // The first segment's start and, 64 segments on, its loop's end.
    const s = [p[0], p[1], p[2]];
    const e = [p[6 * 63 + 3], p[6 * 63 + 4], p[6 * 63 + 5]];
    expect(Math.hypot(...s)).toBeCloseTo(NS_RADIUS_KM, 4);
    expect(Math.hypot(...e)).toBeCloseTo(NS_RADIUS_KM, 4);
    const d = Math.atan2(e[1], e[0]) - Math.atan2(s[1], s[0]);
    expect(Math.abs(d)).toBeCloseTo(1, 6);
  });
});

describe('the Double Pulsar', () => {
  it('B’s magnetopause about 4 × 10⁹ cm from it at A’s distance (Lyutikov & Thompson 2005, eq. 4)', () => {
    const r = magnetopauseKm(DOUBLE_PULSAR_A_EDOT, DOUBLE_PULSAR_B_EDOT, 2.77346077, 8e5);
    expect(r * 1e5).toBeGreaterThan(3.8e9);
    expect(r * 1e5).toBeLessThan(4.4e9);
  });

  it('confined to the magnetopause towards A, drawn out behind', () => {
    const rmp = 40_000;
    const f = confinedField(rmp, [1, 0, 0]);
    let day = 0;
    let night = 0;
    for (let i = 0; i < f.positions.length; i += 3) {
      const x = f.positions[i];
      day = Math.max(day, x);
      night = Math.max(night, -x);
    }
    expect(day).toBeLessThan(rmp * 1.0001);
    expect(night).toBeGreaterThan(2 * rmp);
  });
});
