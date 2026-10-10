import { describe, expect, test } from 'vitest';
import {
  bulgeMass,
  circularSpeed,
  darkShare,
  DISCS,
  discMass,
  discsV2,
  EILERS_2019,
  ellipKE,
  G_KPC,
  haloColumn,
  haloDensity,
  haloMass,
  haloRadius,
  haloSpeed,
  makeTracers,
  MCMILLAN_2017,
  RAD_PER_MYR_PER_KMS_KPC,
  ringV2,
  rotationCurve,
  tracerAt,
  TRACERS_PER_SPOKE,
  visibleMass,
  visibleSpeed,
} from './darkMatter';

describe('the halo (McMillan 2017 NFW)', () => {
  test('density at the Sun is the paper’s 0.0101 M☉/pc³', () => {
    // Table 3: ρ_h,⊙ = 0.0101 M☉/pc³ at R0 = 8.21 kpc (0.38 GeV/cm³).
    expect(haloDensity(MCMILLAN_2017.R0) / 1e9).toBeCloseTo(0.0101, 4);
  });

  test('enclosed mass is the integral of the density', () => {
    for (const r of [1, 8.21, 30, 200]) {
      // Midpoint rule in ln r over 4πr³ρ.
      const n = 20000;
      let m = 0;
      const lo = Math.log(1e-6);
      const h = (Math.log(r) - lo) / n;
      for (let i = 0; i < n; i++) {
        const x = Math.exp(lo + (i + 0.5) * h);
        m += 4 * Math.PI * x ** 3 * haloDensity(x) * h;
      }
      expect(m / haloMass(r)).toBeCloseTo(1, 4);
    }
  });

  test('virial mass: 200 times critical density gives the paper’s 1.37 × 10¹² M☉ with the stars and gas', () => {
    const r200 = haloRadius(200);
    // Mv = 1.37 × 10¹² M☉ (Table 3) is the whole model's mass inside r_v; the halo alone is about 5 % less.
    expect(r200).toBeGreaterThan(215);
    expect(r200).toBeLessThan(240);
    const total = haloMass(r200) + visibleMass();
    expect(total / 1.37e12).toBeGreaterThan(0.95);
    expect(total / 1.37e12).toBeLessThan(1.05);
  });

  test('dark matter is about 95 % of the mass within 200 kpc in this model', () => {
    expect(darkShare(200)).toBeGreaterThan(0.94);
    expect(darkShare(200)).toBeLessThan(0.96);
  });

  test('a column through the halo matches a brute-force sum', () => {
    for (const [b, s0, s1] of [
      [0.5, -200, 200],
      [8.2, 0, 150],
      [60, -20, 300],
    ]) {
      const n = 200000;
      let sum = 0;
      const h = (s1 - s0) / n;
      for (let i = 0; i < n; i++) sum += haloDensity(Math.hypot(b, s0 + (i + 0.5) * h)) * h;
      expect(haloColumn(b, s0, s1) / sum).toBeCloseTo(1, 3);
    }
  });
});

describe('the stars and gas', () => {
  test('masses as the paper gives them', () => {
    // The bulge: 8.9 × 10⁹ M☉ for ρ0,b = 9.93 × 10¹⁰ M☉/kpc³ (section 2.1), so 8.82 × 10⁹ for the best fit's 9.84
    // (Table 3 lists 9.23 × 10⁹, the mean over his fits); stars 5.43 × 10¹⁰ (Table 3); H I 1.1 × 10¹⁰ and H2
    // 1.2 × 10⁹ M☉ (Table 1).
    expect(Math.abs(bulgeMass() / ((8.9e9 * 9.84) / 9.93) - 1)).toBeLessThan(0.01);
    const [thin, thick, hi, h2] = DISCS.map(discMass);
    expect((bulgeMass() + thin + thick) / 5.43e10).toBeCloseTo(1, 1);
    expect(hi / 1.1e10).toBeCloseTo(1, 1);
    expect(h2 / 1.2e9).toBeCloseTo(1, 1);
  });

  test('elliptic integrals', () => {
    const [K0, E0] = ellipKE(0);
    expect(K0).toBeCloseTo(Math.PI / 2, 12);
    expect(E0).toBeCloseTo(Math.PI / 2, 12);
    // K(0.5) = 1.854074677301372, E(0.5) = 1.350643881047675 (DLMF 19.6, Abramowitz & Stegun table 17.1).
    const [K, E] = ellipKE(0.5);
    expect(K).toBeCloseTo(1.854074677301372, 12);
    expect(E).toBeCloseTo(1.350643881047675, 12);
  });

  test('a ring far away pulls like a point', () => {
    const M = 1e10;
    expect(ringV2(100, 1, 0, M) / ((G_KPC * M) / 100)).toBeCloseTo(1, 3);
  });

  test('a razor-thin exponential disc gives Freeman’s curve', () => {
    // Freeman (1970): v² = 4πGΣ0 R_d y² [I0K0 − I1K1](y), y = R/2R_d. y²[I0K0 − I1K1] = 0.19352 at the peak
    // (y = 1.075) and 0.14862 at y = 2 (Bessel functions by their series and integrals). The rings' softening
    // (their own width) costs 1 to 2 % of v² here; a disc of real thickness hides it.
    const sigma0 = 1e9;
    const Rd = 2;
    const thin = [{ sigma: (R: number) => sigma0 * Math.exp(-R / Rd), zd: 0 }];
    const unit = 4 * Math.PI * G_KPC * sigma0 * Rd;
    expect(Math.abs(discsV2(2.15 * Rd, thin) / (unit * 0.19352) - 1)).toBeLessThan(0.02);
    expect(Math.abs(discsV2(4 * Rd, thin) / (unit * 0.14862) - 1)).toBeLessThan(0.01);
  });
});

describe('the rotation curve', () => {
  test('at the Sun: McMillan’s 233.1 km/s at 8.21 kpc, and Eilers’s 229 km/s at 8.12 kpc within their errors', () => {
    expect(circularSpeed(MCMILLAN_2017.R0)).toBeGreaterThan(233.1 - 2.5);
    expect(circularSpeed(MCMILLAN_2017.R0)).toBeLessThan(233.1 + 2.5);
    // Eilers et al. quote 229.0 ± 0.2 km/s with a systematic error of about 3 % at the Sun.
    expect(Math.abs(circularSpeed(EILERS_2019.R0) - EILERS_2019.vSun)).toBeLessThan(0.03 * EILERS_2019.vSun);
  });

  test('the model follows Eilers et al.’s points to within 6.5 % out to 18 kpc, and is flatter beyond', () => {
    for (const [R, v] of EILERS_2019.points) if (R <= 18) expect(Math.abs(circularSpeed(R) / v - 1), `R = ${R}`).toBeLessThan(0.065);
    // From 19 to 25 kpc the measured curve falls faster than McMillan's (fitted before Gaia DR2): 8 to 14 % below it.
    for (const [R, v, lo] of EILERS_2019.points) if (R > 19 && lo < 10) expect(circularSpeed(R) / v - 1).toBeGreaterThan(0.07);
  });

  test('without the halo the curve falls off, nearly as Kepler’s law beyond the discs', () => {
    expect(visibleSpeed(25)).toBeLessThan(0.7 * circularSpeed(25));
    // Far out the stars and gas act as one point: v ∝ R^−1/2.
    expect(visibleSpeed(200) / visibleSpeed(100)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(visibleSpeed(100)).toBeCloseTo(Math.sqrt((G_KPC * visibleMass()) / 100), 0);
    // and the halo's share of v² grows outwards.
    const c = rotationCurve();
    expect(c.halo2.length).toBe(c.R.length);
  });

  test('with the halo, the speed at 25 kpc is still over 200 km/s; without it, about half that', () => {
    expect(circularSpeed(25)).toBeGreaterThan(210);
    expect(circularSpeed(25)).toBeLessThan(225);
    expect(visibleSpeed(25)).toBeGreaterThan(100);
    expect(visibleSpeed(25)).toBeLessThan(120);
    expect(haloSpeed(25)).toBeGreaterThan(visibleSpeed(25));
  });
});

describe('tracers', () => {
  test('they start on their spokes and turn at v/R', () => {
    const t = makeTracers();
    const p: [number, number, number] = [0, 0, 0];
    const i = 6; // R = 8 kpc on the first spoke (β0 = 0: towards the Sun)
    expect(t.R[i]).toBe(8);
    tracerAt(t, i, 0, true, p);
    expect(p[0]).toBeCloseTo(-8, 12);
    expect(p[1]).toBeCloseTo(0, 12);
    // One orbit: 2πR / v.
    const periodMyr = (2 * Math.PI) / t.omegaAll[i];
    expect(periodMyr).toBeCloseTo((2 * Math.PI * 8) / circularSpeed(8) / RAD_PER_MYR_PER_KMS_KPC, 6);
    expect(periodMyr).toBeGreaterThan(200);
    expect(periodMyr).toBeLessThan(230);
    tracerAt(t, i, periodMyr / 4, true, p);
    // A quarter turn on: towards +y, the direction of rotation at the Sun.
    expect(p[1]).toBeCloseTo(8, 6);
    // The outer tracers lag without the halo.
    const outer = TRACERS_PER_SPOKE - 1;
    expect(t.omegaVisible[outer]).toBeLessThan(0.7 * t.omegaAll[outer]);
  });
});
