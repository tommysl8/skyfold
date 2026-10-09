// UF23 base (magneticField.ts) against what Unger & Farrar (2024, ApJ 970, 95) say of it.
import { describe, expect, it } from 'vitest';
import { discReference, fieldAtG, G_TO_UF23, spiralPhi0, uf23Field, uf23Parts, UF23_BASE, UF23_R_SUN_KPC } from './magneticField';
import { gToGal, R0_KPC, SUN_G } from './frames';

const DEG = Math.PI / 180;
const norm = (v: readonly number[]) => Math.hypot(v[0], v[1], v[2]);

/** Cylindrical components (B_r, B_φ, B_z) at (x, y). */
function cyl(x: number, y: number, b: readonly number[]): [number, number, number] {
  const r = Math.hypot(x, y);
  const c = x / r;
  const s = y / r;
  return [b[0] * c + b[1] * s, -b[0] * s + b[1] * c, b[2]];
}

describe('UF23 base: the paper’s numbers', () => {
  it('stores Table 3’s base column', () => {
    expect(UF23_BASE.disc.pitchDeg).toBe(10.11);
    expect(UF23_BASE.disc.B).toEqual([1.09, 2.66, 3.12]);
    expect(UF23_BASE.disc.phiDeg).toEqual([263, 97.8, 35.1]);
    expect(UF23_BASE.toroidal).toMatchObject({ BN: 3.26, BS: -3.09, zt: 4.0, rt: 10.19, wt: 1.7 });
    expect(UF23_BASE.poloidal).toMatchObject({ Bp: 0.978, p: 1.43, zp: 4.5, rp: 7.29, wp: 0.112 });
    expect(UF23_R_SUN_KPC).toBe(8.178);
  });

  it('gives the energy of the coherent field within 20 kpc the paper gives: {0.28, 0.26, 0.75} × 10⁵⁵ erg, 1.3 in all', () => {
    // E = ∫ B²/8π dV over the sphere r < 20 kpc, on a grid (the toroidal and poloidal parts are axisymmetric).
    const KPC_CM = 3.0857e21;
    const unit = (1e-12 / (8 * Math.PI)) * KPC_CM ** 3 * 1e-55; // µG² kpc³ → 10⁵⁵ erg
    const dr = 0.1;
    const dz = 0.1;
    const nPhi = 120;
    let disc = 0;
    let tor = 0;
    let pol = 0;
    for (let r = dr / 2; r < 20; r += dr)
      for (let z = -20 + dz / 2; z < 20; z += dz) {
        if (r * r + z * z > 400) continue;
        const dV = r * dr * dz;
        const a = uf23Parts(r, 0, z);
        tor += norm(a.toroidal) ** 2 * dV * 2 * Math.PI;
        pol += norm(a.poloidal) ** 2 * dV * 2 * Math.PI;
        if (Math.abs(z) > 1.6) continue; // the disc is gone by |z| = z_d + 7 w_d
        for (let k = 0; k < nPhi; k++) {
          const phi = ((k + 0.5) / nPhi) * 2 * Math.PI;
          disc += norm(uf23Parts(r * Math.cos(phi), r * Math.sin(phi), z).disc) ** 2 * dV * ((2 * Math.PI) / nPhi);
        }
      }
    expect(disc * unit).toBeCloseTo(0.28, 1);
    expect(pol * unit).toBeCloseTo(0.26, 1);
    expect(tor * unit).toBeCloseTo(0.75, 1);
    expect(Math.abs(disc * unit - 0.288)).toBeLessThan(0.01);
    expect(Math.abs(pol * unit - 0.264)).toBeLessThan(0.01);
    expect(Math.abs(tor * unit - 0.745)).toBeLessThan(0.01);
    expect((disc + pol + tor) * unit).toBeCloseTo(1.3, 1);
  });

  it('has the disc field at the fitted pitch angle, 10.11°, wherever the halo is negligible', () => {
    for (const [r, phi] of [
      [6, 0.3],
      [8.2, 2],
      [11, -2.5],
      [15, 1],
    ]) {
      const x = r * Math.cos(phi);
      const y = r * Math.sin(phi);
      const b = uf23Parts(x, y, 0).disc;
      const [br, bphi] = cyl(x, y, b);
      expect(Math.atan(br / bphi) / DEG).toBeCloseTo(10.11, 6);
    }
  });

  it('is the three Fourier modes at the reference radius r₀ = 5 kpc (B_m, φ_m)', () => {
    // At r₀ the spiral's φ₀ is φ itself and the field is the modes' sum, times g_d(5 kpc) = σ(0) = 1/2 and the
    // vertical fade in the plane, h_d(0) = 1 − σ(−z_d/w_d) = 0.9994.
    const hd0 = 1 - 1 / (1 + Math.exp(0.794 / 0.107));
    for (const phi of [-2, -0.5, 0.7, 2.9]) {
      const b = uf23Field(5 * Math.cos(phi), 5 * Math.sin(phi), 0);
      const expected = (1.09 * Math.cos(phi - 263 * DEG) + 2.66 * Math.cos(2 * (phi - 97.8 * DEG)) + 3.12 * Math.cos(3 * (phi - 35.1 * DEG))) * 0.5 * hd0;
      const [, bphi] = cyl(5 * Math.cos(phi), 5 * Math.sin(phi), uf23Parts(5 * Math.cos(phi), 5 * Math.sin(phi), 0).disc);
      expect(bphi / Math.cos(10.11 * DEG)).toBeCloseTo(expected, 6);
      expect(norm(b)).toBeGreaterThan(0);
    }
  });

  it('runs clockwise at the Sun, towards l ≈ 90° − α, and is weak there (the Sun sits on a reversal, by the Local Arm)', () => {
    // The paper’s figure of the disc field: the Sun lies on the white (near-zero) band between a field reversal's two sides.
    const b = uf23Field(-UF23_R_SUN_KPC, 0, 0);
    const lDeg = Math.atan2(b[1], b[0]) / DEG; // x towards l = 0, y towards l = 90°
    // (the toroidal halo's 0.06 % in the plane turns it by 0.05°).
    expect(Math.abs(lDeg - (90 - 10.11))).toBeLessThan(0.1);
    expect(norm(b)).toBeGreaterThan(0.2);
    expect(norm(b)).toBeLessThan(0.4);
    // Clockwise seen from the north: B_φ < 0 (with the Galaxy's rotation), the sign of the spur model's B₁ = −4.3 µG.
    expect(cyl(-UF23_R_SUN_KPC, 0, b)[1]).toBeLessThan(0);
  });

  it('reverses along the line from the centre through the Sun as the paper’s figure of the disc field shows', () => {
    // At z = 0 on the x axis the figure's colour bar reads about −2.5 µG (blue) at x = −9 kpc and +3 µG (red) at x = −11.
    const at = (x: number) => discReference(spiralPhi0(Math.abs(x), Math.PI)) * (5 / Math.abs(x));
    expect(at(-9)).toBeLessThan(-2);
    expect(at(-11)).toBeGreaterThan(2.4);
    let flips = 0;
    let prev = Math.sign(at(-5.5));
    for (let x = -5.5; x >= -19; x -= 0.05) {
      const s = Math.sign(at(x));
      if (s !== prev) flips++;
      prev = s;
    }
    // Three modes: up to six arms of alternating sense; between 5.5 and 19 kpc the line crosses several.
    expect(flips).toBeGreaterThanOrEqual(3);
  });

  it('has the toroidal halo north counter-clockwise (B_N > 0) and south clockwise, near B_N and B_S above the disc', () => {
    // At r = 5 kpc, z = ±2 kpc: (1 − h_d) ≈ 1, e^(−2/4) and the radial cut ≈ 1.
    const n = cyl(5, 0, uf23Parts(5, 0, 2).toroidal);
    const s = cyl(5, 0, uf23Parts(5, 0, -2).toroidal);
    const radial = 1 - 1 / (1 + Math.exp(-(5 - 10.19) / 1.7));
    expect(n[1]).toBeCloseTo(3.26 * Math.exp(-0.5) * radial, 3);
    expect(s[1]).toBeCloseTo(-3.09 * Math.exp(-0.5) * radial, 3);
    expect(n[0]).toBe(0);
    expect(n[2]).toBe(0);
    // Gone in the plane, where the disc takes over.
    expect(Math.abs(cyl(5, 0, uf23Parts(5, 0, 0).toroidal)[1])).toBeLessThan(0.003);
  });

  it('has the X-field vertical (northward) at 0.978 µG in the inner plane, cut off at r_p = 7.29 kpc, and flaring with height', () => {
    expect(uf23Parts(1, 0, 0).poloidal[2]).toBeCloseTo(0.978, 3);
    expect(uf23Parts(6, 0, 0).poloidal[2]).toBeCloseTo(0.978, 3);
    expect(uf23Parts(7.29, 0, 0).poloidal[2]).toBeCloseTo(0.978 / 2, 3);
    expect(uf23Parts(8, 0, 0).poloidal[2]).toBeLessThan(0.01);
    // Above the plane the lines lean outward, below inward (B_z > 0 throughout): an X seen edge-on.
    const up = cyl(4, 0, uf23Parts(4, 0, 3).poloidal);
    const down = cyl(4, 0, uf23Parts(4, 0, -3).poloidal);
    expect(up[0]).toBeGreaterThan(0);
    expect(down[0]).toBeLessThan(0);
    expect(up[2]).toBeGreaterThan(0);
    expect(down[2]).toBeCloseTo(up[2], 12);
    // On the axis: vertical, finite.
    const axis = uf23Parts(0, 0, 3).poloidal;
    expect(axis[0]).toBe(0);
    expect(axis[2]).toBeGreaterThan(0);
  });

  it('keeps the X-field divergence-free (Euler potentials), numerically', () => {
    const h = 1e-4;
    for (const [x, y, z] of [
      [2, 1, 1.5],
      [-3, 4, -2.5],
      [5, -2, 4],
    ]) {
      const f = (px: number, py: number, pz: number) => uf23Parts(px, py, pz).poloidal;
      const div = (f(x + h, y, z)[0] - f(x - h, y, z)[0] + f(x, y + h, z)[1] - f(x, y - h, z)[1] + f(x, y, z + h)[2] - f(x, y, z - h)[2]) / (2 * h);
      expect(Math.abs(div)).toBeLessThan(1e-5 * norm(f(x, y, z)));
    }
  });
});

describe('the model in the app’s frame G', () => {
  it('is scaled by r☉(paper) / R0(app) in length, so the Sun keeps its place among the arms', () => {
    expect(G_TO_UF23).toBeCloseTo(8.178 / R0_KPC, 12);
    const atSun = fieldAtG(-R0_KPC, 0, 0);
    const paper = uf23Field(-UF23_R_SUN_KPC, 0, 0);
    for (let i = 0; i < 3; i++) expect(atSun[i]).toBeCloseTo(paper[i], 10);
  });

  it('points at the Sun towards galactic longitude ≈ 80° in the app’s own heliocentric axes', () => {
    // The direction of B at the Sun, from G's axes to heliocentric galactic ones (a rotation of < 0.1°).
    const b = fieldAtG(SUN_G[0], SUN_G[1], SUN_G[2]);
    const tip = gToGal([SUN_G[0] + b[0], SUN_G[1] + b[1], SUN_G[2] + b[2]]);
    expect(Math.atan2(tip[1], tip[0]) / DEG).toBeCloseTo(79.9, 0);
  });
});
