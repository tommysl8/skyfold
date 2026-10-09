/**
 * The chirp of two neutron stars spiralling together, in the quadrupole approximation (Peters & Mathews 1963; the
 * formulas as Maggiore 2008, Gravitational Waves vol. 1, §4.1 writes them): as gravitational waves carry the orbit's
 * energy away the two draw closer and turn faster, and the waves' frequency (twice the orbit's) sweeps up, faster and
 * faster, to the merger. Everything follows from the chirp mass 𝓜 = (m₁m₂)^(3/5)/(m₁+m₂)^(1/5) alone:
 *
 *   time left   τ(f) = (5/256) (G𝓜/c³)^(−5/3) (πf)^(−8/3)
 *   frequency   f(τ) = (1/π) (5/(256 τ))^(3/8) (G𝓜/c³)^(−5/8)
 *   phase       Φ(τ) = Φ_c − 2 (5G𝓜/c³)^(−5/8) τ^(5/8)        (of the waves; the orbit turns half as much)
 *
 * and the stars' separation from Kepler's third law at the orbit's angular frequency ω = πf: a = (G M / ω²)^(1/3).
 * Good until the stars touch, about a millisecond before τ = 0 for two neutron stars: the last orbits are beyond it.
 *
 * Seen from Earth the waves arrive stretched by the redshift: the observed time and frequency go with the "detector
 * frame" chirp mass (1 + z) 𝓜, which is what the observed timing is computed with here; the size of the orbit is
 * the source's own (its frequency (1 + z) f, its masses). Pure functions; tests in chirp.test.ts.
 */
import { C_KM_S, GM_SUN_KM3_S2 } from '../../physics/constants';

/** GM☉/c³, s: the Sun's mass as a time (4.925 µs). */
export const SUN_TIME_S = GM_SUN_KM3_S2 / C_KM_S ** 3;

/** The chirp mass of a pair, in the masses' units. */
export const chirpMass = (m1: number, m2: number): number => (m1 * m2) ** 0.6 / (m1 + m2) ** 0.2;

/** Time left to coalescence, s, when the waves' frequency is fHz, for a chirp mass mcMsun (solar masses). */
export function timeToMergeS(fHz: number, mcMsun: number): number {
  return (5 / 256) * (SUN_TIME_S * mcMsun) ** (-5 / 3) * (Math.PI * fHz) ** (-8 / 3);
}

/** The waves' frequency, Hz, τ seconds before coalescence (Infinity at τ ≤ 0). */
export function gwFrequencyHz(tauS: number, mcMsun: number): number {
  if (!(tauS > 0)) return Infinity;
  return (1 / Math.PI) * (5 / (256 * tauS)) ** 0.375 * (SUN_TIME_S * mcMsun) ** -0.625;
}

/** The waves' phase, radians, τ seconds before coalescence, relative to its value at coalescence (≤ 0). */
export function gwPhase(tauS: number, mcMsun: number): number {
  if (!(tauS > 0)) return 0;
  return -2 * (5 * SUN_TIME_S * mcMsun) ** -0.625 * tauS ** 0.625;
}

/** The separation of the two stars, km, when the waves' frequency in their own frame is fHz (Kepler, ω = πf). */
export function separationKm(fHz: number, totalMassMsun: number): number {
  const w = Math.PI * fHz;
  return Math.cbrt((GM_SUN_KM3_S2 * totalMassMsun) / (w * w));
}

/** The waves' frequency, Hz, at which two stars of total mass M are `aKm` apart (Kepler, inverted). */
export function frequencyAtSeparationHz(aKm: number, totalMassMsun: number): number {
  return Math.sqrt((GM_SUN_KM3_S2 * totalMassMsun) / aKm ** 3) / Math.PI;
}

/** The wave cycles between frequency f and coalescence: Φ(τ(f)) / 2π, in magnitude. */
export function cyclesFrom(fHz: number, mcMsun: number): number {
  return -gwPhase(timeToMergeS(fHz, mcMsun), mcMsun) / (2 * Math.PI);
}
