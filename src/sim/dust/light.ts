/**
 * The light of the dust: what it takes from the light behind it, and the starlight it scatters.
 *
 * Extinction: V-band, with the display colours A_R : A_G : A_B = 0.89 : 1 : 1.23 (volume.ts REDDENING_RGB).
 *
 * Scattering: a grain removes light from a beam and scatters a share of it, the albedo, about 0.5 to 0.6 in the visual
 * (Draine 2003, ARA&A 41, 241, figure 6, for Milky Way dust with R_V = 3.1); 0.5 here. Lit evenly from every side by
 * the Galaxy's starlight of mean intensity J, a line of sight through dust of optical depth τ (in front of nothing)
 * glows with ω J (1 − e^−τ): faintly, at most half as bright as the average sky, which is why dark clouds look dark.
 * Lit from every side, the phase function (forward-throwing, g ≈ 0.6) does not matter. Single scattering only, with J
 * taken the same everywhere in the neighbourhood (within 1.25 kpc of the Sun it changes by tens of per cent, most of
 * all next to young OB associations such as Orion's, which light reflection nebulae the map cannot show).
 *
 * J is the local interstellar radiation field of Mathis, Mezger & Panagia (1983, A&A 128, 212, Table A3): at 0.55 µm
 * 4πJ_λ = 1.57 × 10⁻⁶ erg cm⁻² s⁻¹ Å⁻¹, the light of a whole sky of V = −6.54 (the table as reproduced by Mauron, de
 * Laverny & Lopez 2003, A&A 401, 985, their table 3), so 32.9 stars of V = 0 per steradian, a mean surface brightness of
 * 22.78 mag/arcsec². (The sky Skyfold draws from the Sun, the SVS map and the catalogue's stars averaged over the sky,
 * is about twice that: 64 per steradian, V = −7.3; light.test.ts.) Its colour is the SVS map's mean colour, a little
 * yellow: the integrated light of mostly old stars.
 */

/** The dust's albedo in the V band (Draine 2003: 0.5–0.6). */
export const DUST_ALBEDO_V = 0.5;

/** The whole sky's starlight at the Sun as one magnitude, V (Mathis, Mezger & Panagia 1983, Table A3). */
export const ISRF_SKY_V = -6.54;
/** The mean intensity J of the Galaxy's starlight at the Sun, in V = 0 stars per steradian. */
export const ISRF_FLUX_PER_SR = 10 ** (-0.4 * ISRF_SKY_V) / (4 * Math.PI);

/** Square arcseconds in a steradian. */
const ARCSEC2_PER_SR = (180 / Math.PI) ** 2 * 3600 ** 2;

/** J as a surface brightness, mag/arcsec². */
export const ISRF_MU_V = -2.5 * Math.log10(ISRF_FLUX_PER_SR / ARCSEC2_PER_SR);

/** The colour of J (linear sRGB, luminance 1): the SVS map's mean colour over the sky. */
export const ISRF_RGB: readonly [number, number, number] = (() => {
  const c = [1.132, 0.995, 0.873];
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return [c[0] / y, c[1] / y, c[2] / y] as const;
})();

/** The fraction of J a line of sight scatters towards the camera, for its optical depth (single scattering). */
export const scatteredShare = (tau: number, albedo = DUST_ALBEDO_V): number => albedo * -Math.expm1(-Math.max(0, tau));

/** Optical depth of an extinction in magnitudes (τ = A / 1.0857). */
export const tauFromMag = (aMag: number): number => aMag / 1.0857362047581294;

/** The flux factor of an extinction A (mag) in each display channel. */
export function extinctionRgb(aV: number, k: readonly number[] = [0.89, 1, 1.23]): [number, number, number] {
  return [10 ** (-0.4 * aV * k[0]), 10 ** (-0.4 * aV * k[1]), 10 ** (-0.4 * aV * k[2])];
}

/**
 * The share of the light of a thin disc of stars (density ∝ exp(−|z − zMid| / h)) along a ray from height z0 going up
 * at ez (the ray's z component) that is emitted between distances ta and tb: the exact integral, which the march uses
 * to dim only the Galaxy model's light from behind each cloud (render/shaders/dust.frag.glsl discLight is its twin).
 */
export function discLight(z0: number, ez: number, ta: number, tb: number, h: number, zMid = 0): number {
  if (!(tb > ta)) return 0;
  const za = z0 - zMid + ez * ta;
  const zb = z0 - zMid + ez * tb;
  if (Math.abs(ez) < 1e-6) return (tb - ta) * Math.exp(-Math.abs(za) / h);
  // ∫ exp(−|z|/h) dz from za to zb, divided by ez.
  const F = (z: number) => (z >= 0 ? h * (1 - Math.exp(-z / h)) : -h * (1 - Math.exp(z / h)));
  return (F(zb) - F(za)) / ez;
}
