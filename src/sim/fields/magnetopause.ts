/**
 * Where a planet's field lines are cut: the magnetopause, the boundary the solar wind presses the field back to
 * (docs/data/fields.md §4). Each shape is a published fit for a typical solar wind; the field inside is the planet's
 * own (sim/fields/harmonics.ts), with the currents on the boundary and in the tail left out.
 *
 *  - Earth: Shue et al. 1998 (J. Geophys. Res. 103, 17691): r = r₀ (2 / (1 + cos θ))^α,
 *    r₀ = (10.22 + 1.29 tanh(0.184 (B_z + 8.14))) D_p^(−1/6.6), α = (0.58 − 0.007 B_z)(1 + 0.024 ln D_p).
 *  - Jupiter: Joy et al. 2002 (J. Geophys. Res. 107, 1309), the surface z² = A + Bx + Cx² + Dy + Ey² + Fxy in
 *    units of 120 R_J, with A = −0.134 + 0.488 P^(−1/4), B = −0.581 − 0.225 P^(−1/4), C = −0.186 − 0.016 P^(−1/4),
 *    D = −0.014 + 0.096 P, E = −0.814 − 0.811 P, F = −0.050 + 0.168 P (x to the Sun, z along the spin axis, y to
 *    dusk). Its two modes, 63 and 92 R_J, come at P ≈ 0.31 and 0.04 nPa.
 *  - Saturn: Arridge et al. 2006 (J. Geophys. Res. 111, A11227), Shue's form with r₀ = 9.7 P^(−1/4.3) R_S and
 *    α = 0.77 − 1.5 P (as Achilleos et al. 2008 quote it).
 *  - Mercury: Winslow et al. 2013 (J. Geophys. Res. 118, 2213), Shue's form fitted to MESSENGER's crossings,
 *    r₀ = 1.45 R_M, α = 0.5, centred on the offset dipole.
 *  - Uranus and Neptune: Shue's form with α = 0.5 and the stand-off of pressure balance, r₀ ∝ (B₀² / P)^(1/6)
 *    (Chapman & Ferraro), scaled to Earth's Shue stand-off for the same wind: 25 R_U and 25 R_N (Voyager 2 found
 *    18 and 26).
 *  - The typical wind: a dynamic pressure of 2 nPa at 1 au, falling as 1/r² (400 km/s, about 7 protons per cm³),
 *    with no southward field (B_z = 0).
 *
 * Positions are in planetary radii in the planet–Sun frame: x towards the Sun, z the spin axis made perpendicular to
 * x, y = z × x (dusk). Pure; tests in fields.test.ts.
 */

/** The typical solar wind's dynamic pressure, nPa, at `au` from the Sun. */
export const windPressure = (au: number): number => 2 / (au * au);

/** Shue et al. 1998 for Earth: stand-off (Earth radii) and flaring, for a dynamic pressure (nPa) and IMF B_z (nT). */
export function shue1998(pressure: number, bz = 0): { r0: number; alpha: number } {
  return {
    r0: (10.22 + 1.29 * Math.tanh(0.184 * (bz + 8.14))) * pressure ** (-1 / 6.6),
    alpha: (0.58 - 0.007 * bz) * (1 + 0.024 * Math.log(pressure)),
  };
}

/** Arridge et al. 2006 for Saturn: stand-off (Saturn radii) and flaring for a dynamic pressure (nPa). */
export function arridge2006(pressure: number): { r0: number; alpha: number } {
  return { r0: 9.7 * pressure ** (-1 / 4.3), alpha: 0.77 - 1.5 * pressure };
}

/** Joy et al. 2002's coefficients for Jupiter's magnetopause at a dynamic pressure (nPa). */
export function joy2002(pressure: number): { A: number; B: number; C: number; D: number; E: number; F: number } {
  const q = pressure ** -0.25;
  return {
    A: -0.134 + 0.488 * q,
    B: -0.581 - 0.225 * q,
    C: -0.186 - 0.016 * q,
    D: -0.014 + 0.096 * pressure,
    E: -0.814 - 0.811 * pressure,
    F: -0.05 + 0.168 * pressure,
  };
}

/** Joy's stand-off, R_J: where the surface crosses the x axis on the day side. */
export function joyStandoff(pressure: number): number {
  const { A, B, C } = joy2002(pressure);
  // A + Bx + Cx² = 0, the root with x > 0.
  const d = Math.sqrt(B * B - 4 * A * C);
  return (120 * (-B - d)) / (2 * C);
}

/**
 * The stand-off of pressure balance (Chapman & Ferraro), planetary radii, for a dipole with field B₀ (nT) at its equator
 * and a dynamic pressure (nPa): r₀ ∝ (B₀² / P)^(1/6), scaled to Earth's Shue stand-off for the same wind
 * (B₀ = 29,734 nT, IGRF-14 in 2025, at 2 nPa: 10.25 R_E).
 */
export function scaledStandoff(b0nT: number, pressure: number): number {
  const earth = shue1998(2).r0;
  return earth * (b0nT / 29_734) ** (1 / 3) * (2 / pressure) ** (1 / 6);
}

/** A magnetopause: Shue's form (stand-off, flaring and centre) or Joy's surface. Lengths in the planet's radii. */
export type Magnetopause =
  | { kind: 'shue'; r0: number; alpha: number; /** The centre, along the spin axis (Mercury's offset dipole). */ zOffset?: number }
  | { kind: 'joy'; pressure: number };

/** Its stand-off distance on the day side, planetary radii. */
export function standoff(mp: Magnetopause): number {
  return mp.kind === 'shue' ? mp.r0 : joyStandoff(mp.pressure);
}

/**
 * A fast test of "inside", made once per magnetopause: Shue's radius read from a table in cos θ (no powers per
 * point), Joy's polynomial as it is. Also cut beyond `limit` radii anywhere (the night side, where the real field is
 * stretched into a tail this does not model).
 */
export class MagnetopauseTest {
  private readonly table: Float64Array | null;
  private readonly joy: ReturnType<typeof joy2002> | null;
  private readonly zOff: number;
  constructor(
    readonly mp: Magnetopause,
    readonly limit: number,
  ) {
    if (mp.kind === 'shue') {
      const n = 1024;
      this.table = new Float64Array(n + 1);
      for (let i = 0; i <= n; i++) {
        const c = -1 + (2 * i) / n;
        this.table[i] = Math.min(limit, mp.r0 * (2 / Math.max(1e-9, 1 + c)) ** mp.alpha);
      }
      this.joy = null;
      this.zOff = mp.zOffset ?? 0;
    } else {
      this.table = null;
      this.joy = joy2002(mp.pressure);
      this.zOff = 0;
    }
  }

  /** Whether a point (planet–Sun frame, planetary radii) is inside. */
  inside(x: number, y: number, z: number): boolean {
    const zc = z - this.zOff;
    const r2 = x * x + y * y + zc * zc;
    if (r2 > this.limit * this.limit) return false;
    if (this.table) {
      const r = Math.sqrt(r2);
      if (r === 0) return true;
      const n = this.table.length - 1;
      const f = ((x / r + 1) / 2) * n;
      const i = Math.min(n - 1, Math.max(0, Math.floor(f)));
      const t = f - i;
      return r < this.table[i] + t * (this.table[i + 1] - this.table[i]);
    }
    const j = this.joy!;
    const s = 1 / 120;
    const X = x * s;
    const Y = y * s;
    const Z = z * s;
    return Z * Z < j.A + j.B * X + j.C * X * X + j.D * Y + j.E * Y * Y + j.F * X * Y;
  }
}
