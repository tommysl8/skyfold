/**
 * Earth's aurora (docs/data/phenomena.md §4; drawn by scene/Phenomena.tsx with shaders/aurora.frag.glsl).
 *
 *  - Where the poles are: the centred dipole of the International Geomagnetic Reference Field, IGRF-14 (Beggan et al.
 *    2026, Earth Planets Space 78, 127; coefficients from NOAA NCEI, free to use), from its first three coefficients
 *    g₁⁰, g₁¹, h₁¹ at the date (linear between the 5-year epochs, the secular variation after 2025). The north
 *    geomagnetic pole is at sin φ = −g₁⁰/B₀, λ = atan2(−h₁¹, −g₁¹), geocentric: 80.59° N 72.68° W in 2020, 80.79° N
 *    72.76° W in 2025, as NCEI and the BGS give it. Before 1900 and after 2030 it is held at the nearest end.
 *  - Where the ovals are: Starkov's model of the auroral boundaries (Starkov 1994, Geomagn. Aeron. 34, 331), as Sigernes
 *    et al. 2011 (J. Space Weather Space Clim. 1, A03, Appendix A) give its coefficients: the poleward and equatorward
 *    edges of the oval of discrete aurora (where it is seen 75 % of the time) as a Fourier series in magnetic local time,
 *    each coefficient a cubic in log₁₀|AL|, and AL from Kp (Starkov 1994b). At Kp 3 the oval runs from 63.8° to 71.9°
 *    geomagnetic latitude at midnight and from 73.3° to 75.7° at noon. Starkov's latitudes are corrected geomagnetic
 *    ones; they are laid here about the centred dipole, which differs from them by a degree or two in places. Above
 *    Kp 6, where Starkov's ovals stop moving, they are stretched towards the equator as far as the oval of May 2024
 *    reached (stormStretch below).
 *  - How it shines: the green 557.7 nm line of atomic oxygen, peaking near 114 km (Whiter et al. 2023, Ann. Geophys.
 *    41, 1), the red 630.0 nm line peaking near 250–270 km (Hayakawa et al. 2018, ApJ 869, 57), and the blue N₂⁺ band,
 *    which peaks with the green. Arcs average 15 kR in the green (Knudsen et al. 2001, via Karlsson et al. 2020).
 *  - The curtains themselves (where each arc lies within the oval, its folds, rays and slow motion) are a model.
 *
 * Pure functions; tests in aurora.test.ts.
 */
import { cie1931, xyzToLinearSrgb } from '../../physics/blackbody';

/** IGRF-14 dipole coefficients, nT: epoch, g₁⁰, g₁¹, h₁¹ (DGRF 1945–2020, IGRF otherwise). */
export const IGRF_DIPOLE: readonly (readonly [number, number, number, number])[] = [
  [1900, -31543, -2298, 5922],
  [1905, -31464, -2298, 5909],
  [1910, -31354, -2297, 5898],
  [1915, -31212, -2306, 5875],
  [1920, -31060, -2317, 5845],
  [1925, -30926, -2318, 5817],
  [1930, -30805, -2316, 5808],
  [1935, -30715, -2306, 5812],
  [1940, -30654, -2292, 5821],
  [1945, -30594, -2285, 5810],
  [1950, -30554, -2250, 5815],
  [1955, -30500, -2215, 5820],
  [1960, -30421, -2169, 5791],
  [1965, -30334, -2119, 5776],
  [1970, -30220, -2068, 5737],
  [1975, -30100, -2013, 5675],
  [1980, -29992, -1956, 5604],
  [1985, -29873, -1905, 5500],
  [1990, -29775, -1848, 5406],
  [1995, -29692, -1784, 5306],
  [2000, -29619.4, -1728.2, 5186.1],
  [2005, -29554.63, -1669.05, 5077.99],
  [2010, -29496.57, -1586.42, 4944.26],
  [2015, -29441.46, -1501.77, 4795.99],
  [2020, -29403.41, -1451.37, 4653.35],
  [2025, -29350.0, -1410.3, 4545.5],
];
/** IGRF-14's secular variation for 2025–2030, nT a year: g₁⁰, g₁¹, h₁¹. */
export const IGRF_SV_2025: readonly [number, number, number] = [12.6, 10.0, -21.5];
/** The model holds from 1900 to 2030; outside, the pole is held at the nearest end. */
export const IGRF_FIRST_YEAR = 1900;
export const IGRF_LAST_YEAR = 2030;

/** The dipole coefficients at a decimal year (held beyond 1900–2030). */
export function dipoleAt(year: number): [number, number, number] {
  const y = Math.min(IGRF_LAST_YEAR, Math.max(IGRF_FIRST_YEAR, year));
  const last = IGRF_DIPOLE[IGRF_DIPOLE.length - 1];
  if (y >= last[0]) {
    const dt = y - last[0];
    return [last[1] + IGRF_SV_2025[0] * dt, last[2] + IGRF_SV_2025[1] * dt, last[3] + IGRF_SV_2025[2] * dt];
  }
  const i = Math.min(IGRF_DIPOLE.length - 2, Math.floor((y - IGRF_FIRST_YEAR) / 5));
  const a = IGRF_DIPOLE[i];
  const b = IGRF_DIPOLE[i + 1];
  const t = (y - a[0]) / (b[0] - a[0]);
  return [a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]), a[3] + t * (b[3] - a[3])];
}

/** The north geomagnetic pole (the centred dipole's axis, northern end), geocentric latitude and east longitude, degrees. */
export function geomagneticPole(year: number): { latDeg: number; lonDeg: number } {
  const [g10, g11, h11] = dipoleAt(year);
  const b0 = Math.hypot(g10, g11, h11);
  return { latDeg: (Math.asin(-g10 / b0) * 180) / Math.PI, lonDeg: (Math.atan2(-h11, -g11) * 180) / Math.PI };
}

/**
 * A direction from Earth's centre in the body-fixed frame of the registry's rotation (sim/bodies/types.ts: x the prime
 * meridian, y the north pole, −z longitude 90° E), from a geocentric latitude and east longitude.
 */
export function bodyFixedDir(latDeg: number, lonDeg: number): [number, number, number] {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonDeg * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

// ─── The oval: Starkov (1994) ─────────────────────────────────────────────────────────

/** AL, nT, from Kp (Starkov 1994b, as Sigernes et al. 2011 table 1 give it): |AL| = 18 − 12.3 Kp + 27.2 Kp² − 2 Kp³. */
export const alFromKp = (kp: number): number => 18 - 12.3 * kp + 27.2 * kp * kp - 2 * kp ** 3;

/**
 * Starkov's coefficients (Sigernes et al. 2011, appendix A): for each boundary, rows b₀…b₃ of the cubic in
 * L = log₁₀|AL|, columns A₀, A₁, A₂, A₃ (degrees) and α₁, α₂, α₃ (hours). Sigernes' value 1.61 is kept for the
 * equatorward A₀ b₀ (the ocbpy package has 1.16, about 0.45° at Kp 3; the original was not to hand).
 */
export const STARKOV = {
  poleward: [
    [-0.07, -10.06, -4.44, -3.77, -6.61, 6.37, -4.48],
    [24.54, 19.83, 7.47, 7.9, 10.17, -1.1, 10.16],
    [-12.53, -9.33, -3.01, -4.73, -5.8, 0.34, -5.87],
    [2.15, 1.24, 0.25, 0.91, 1.19, -0.38, 0.98],
  ],
  equatorward: [
    [1.61, -9.59, -12.07, -6.56, -2.22, -23.98, -20.07],
    [23.21, 17.78, 17.49, 11.44, 1.5, 42.79, 36.67],
    [-10.97, -7.2, -7.96, -6.73, -0.58, -26.96, -24.2],
    [2.03, 0.96, 1.15, 1.31, 0.08, 5.56, 5.11],
  ],
} as const;

export type OvalEdge = keyof typeof STARKOV;

/** The Fourier coefficients of an edge for an activity: [A₀, A₁, A₂, A₃] degrees, [α₁, α₂, α₃] hours. */
export function edgeCoefficients(edge: OvalEdge, kp: number): { a: number[]; alpha: number[] } {
  const L = Math.log10(Math.abs(alFromKp(kp)));
  const b = STARKOV[edge];
  const c = b[0].map((_, k) => b[0][k] + b[1][k] * L + b[2][k] * L * L + b[3][k] * L ** 3);
  return { a: c.slice(0, 4), alpha: c.slice(4) };
}

/** The edge's colatitude, degrees from the geomagnetic pole, at magnetic local time `mltH` hours. */
export function edgeColatitude(edge: OvalEdge, kp: number, mltH: number): number {
  const { a, alpha } = edgeCoefficients(edge, kp);
  const d = Math.PI / 180;
  return a[0] + a[1] * Math.cos(15 * (mltH + alpha[0]) * d) + a[2] * Math.cos(15 * (2 * mltH + alpha[1]) * d) + a[3] * Math.cos(15 * (3 * mltH + alpha[2]) * d);
}

// ─── Storms: beyond Starkov ───────────────────────────────────────────────────────────

/**
 * Starkov's ovals hardly move above Kp 6 (his AL from Kp levels off near 650 nT; at Kp 9 the equatorward edge is still
 * at 59.7° at midnight), while in great storms the oval comes much further south. Above Kp 6 the ovals here are those
 * of Kp 6, their colatitudes stretched so that at Kp 9 the equatorward edge reaches 35.5° at midnight: the edge of the
 * northern oval reconstructed from naked-eye reports in the storm of 10–11 May 2024, when Kp was 9 (Hayakawa et al.
 * 2025, ApJ 979, 49; 29.8° in the south). A model of the stretch, anchored on that storm.
 */
export const STARKOV_TOP_KP = 6;
export const STORM_EDGE_LAT_KP9 = 35.5;

/** How much the ovals' colatitudes are stretched at an activity: 1 to Kp 6, linear in Kp to the May 2024 edge at 9. */
export function stormStretch(kp: number): number {
  if (kp <= STARKOV_TOP_KP) return 1;
  const s9 = (90 - STORM_EDGE_LAT_KP9) / edgeColatitude('equatorward', STARKOV_TOP_KP, 0);
  return 1 + ((Math.min(9, kp) - STARKOV_TOP_KP) / (9 - STARKOV_TOP_KP)) * (s9 - 1);
}

/** An edge's colatitude as drawn, degrees: Starkov's to Kp 6, stretched for storms above it. */
export function ovalEdge(edge: OvalEdge, kp: number, mltH: number): number {
  return edgeColatitude(edge, Math.min(kp, STARKOV_TOP_KP), mltH) * stormStretch(kp);
}

/**
 * Magnetic local time, hours, of a direction n from Earth's centre, with the dipole axis m and the direction to the Sun
 * s (unit vectors, any one frame): 12 under the Sun, 0 opposite, 18 at dusk (east of noon).
 */
export function magneticLocalTime(n: readonly number[], m: readonly number[], s: readonly number[]): number {
  const sm = s[0] * m[0] + s[1] * m[1] + s[2] * m[2];
  const e1 = [s[0] - sm * m[0], s[1] - sm * m[1], s[2] - sm * m[2]];
  const l = Math.hypot(e1[0], e1[1], e1[2]);
  e1[0] /= l;
  e1[1] /= l;
  e1[2] /= l;
  const e2 = [m[1] * e1[2] - m[2] * e1[1], m[2] * e1[0] - m[0] * e1[2], m[0] * e1[1] - m[1] * e1[0]];
  const x = n[0] * e1[0] + n[1] * e1[1] + n[2] * e1[2];
  const y = n[0] * e2[0] + n[1] * e2[1] + n[2] * e2[2];
  const h = 12 + (Math.atan2(y, x) * 12) / Math.PI;
  return h >= 24 ? h - 24 : h;
}

/**
 * How much of the oval's light is in bright discrete arcs at an MLT, 0–1 (a model): most in the evening and midnight
 * sectors, where substorms brighten and break up the arcs, least near noon.
 */
export function arcStrength(mltH: number): number {
  const d = ((mltH - 22 + 36) % 24) - 12; // hours from 22 MLT
  return 0.3 + 0.7 * Math.exp(-(d * d) / (2 * 4 * 4));
}

/** The table the shader reads: for each of `n` MLT bins, the poleward and equatorward colatitudes as drawn (degrees / 90) and the arc strength. */
export function ovalTable(kp: number, n = 48): Float32Array {
  const out = new Float32Array(4 * n);
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) * 24) / n;
    out[4 * i] = ovalEdge('poleward', kp, t) / 90;
    out[4 * i + 1] = ovalEdge('equatorward', kp, t) / 90;
    out[4 * i + 2] = arcStrength(t);
    out[4 * i + 3] = 1;
  }
  return out;
}

// ─── Brightness and colour ────────────────────────────────────────────────────────────

/**
 * The green line's brightness in a bright arc, kR, and the red line's share of it, for an activity (a model): arcs average
 * 15 kR (0.2–200 kR; Knudsen et al. 2001), quiet arcs a few, storms tens; red is a tenth to a half of the green in night-
 * side arcs (Hu, Ai & Zhang 2012's photometry) and more in storms, whose aurora at low latitudes is red.
 */
export function auroraBrightness(kp: number): { greenKr: number; redShare: number } {
  const k = Math.min(9, Math.max(0, kp));
  return { greenKr: 3 * 10 ** (k / 5), redShare: 0.12 + 0.05 * k };
}

/** Wavelengths of the lines, nm. */
export const GREEN_NM = 557.7;
export const RED_NM = 630.0;
export const BLUE_NM = 427.8;

/**
 * V-band flux per steradian, in V = 0 stars, of one kilorayleigh of a line at λ: 10⁹/4π photons s⁻¹ cm⁻² sr⁻¹ of energy
 * hc/λ, weighted by the eye's response ȳ(λ) (CIE 1931), over a V = 0 star's ∫F_λ ȳ dλ ≈ 3.63 × 10⁻¹¹ W m⁻² nm⁻¹
 * (Bessell, Castelli & Plez 1998) × 106.9 nm (the integral of ȳ). About 73 for the green line.
 */
export function fluxPerKr(lambdaNm: number): number {
  const photons = (1e9 / (4 * Math.PI)) * 1e4; // m⁻² s⁻¹ sr⁻¹
  const energy = (6.62607015e-34 * 299792458) / (lambdaNm * 1e-9);
  const vega = 3.63e-11 * 106.86;
  return (photons * energy * cie1931(lambdaNm)[1]) / vega;
}

/** A line's colour, linear sRGB with luminance 1 (out-of-gamut channels clipped). */
export function lineColour(lambdaNm: number): [number, number, number] {
  const [x, y, z] = cie1931(lambdaNm);
  const rgb = xyzToLinearSrgb(x, y, z).map((v) => Math.max(0, v)) as [number, number, number];
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return [rgb[0] / lum, rgb[1] / lum, rgb[2] / lum];
}
