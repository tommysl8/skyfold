/**
 * Relativistic beaming of a jet: plasma moving at β = v/c at angle θ to our line of sight shines with Doppler factor
 * δ = 1 / (Γ (1 − β cos θ)), Γ = 1/√(1 − β²). Its light is boosted on the side coming towards us and dimmed on the
 * other: a steady, continuous jet of spectral index α (S_ν ∝ ν^(−α)) by δ^(2+α), a single moving blob by δ^(3+α)
 * (Blandford & Königl 1979; Urry & Padovani 1995, PASP 107, 803, §3). The two sides of a symmetric pair differ by
 *
 *   R = ((1 + β cos θ) / (1 − β cos θ))^(2+α),
 *
 * the jet-to-counter-jet ratio, and a blob seems to cross the sky at β_app = β sin θ / (1 − β cos θ), faster than
 * light when β is near 1 and θ small. Pure functions; tests in beaming.test.ts.
 */

/** Lorentz factor of speed β. */
export const lorentz = (beta: number): number => 1 / Math.sqrt(1 - beta * beta);

/** Speed β of Lorentz factor Γ ≥ 1. */
export const betaOf = (gamma: number): number => Math.sqrt(1 - 1 / (gamma * gamma));

/** Doppler factor of plasma moving at β, at angle θ (radians) from the line towards the observer. */
export function dopplerFactor(beta: number, thetaRad: number): number {
  return 1 / (lorentz(beta) * (1 - beta * Math.cos(thetaRad)));
}

/** Boost of the observed flux density at a fixed frequency: δ^(2+α) for a continuous jet, δ^(3+α) for a blob. */
export function beamingBoost(beta: number, thetaRad: number, alpha: number, blob = false): number {
  return dopplerFactor(beta, thetaRad) ** ((blob ? 3 : 2) + alpha);
}

/** Jet-to-counter-jet brightness ratio of a symmetric pair at angle θ (the approaching side over the receding one). */
export function jetCounterJetRatio(beta: number, thetaRad: number, alpha: number, blob = false): number {
  const c = beta * Math.cos(thetaRad);
  return ((1 + c) / (1 - c)) ** ((blob ? 3 : 2) + alpha);
}

/** Apparent speed across the sky, in units of c. */
export function apparentSpeed(beta: number, thetaRad: number): number {
  return (beta * Math.sin(thetaRad)) / (1 - beta * Math.cos(thetaRad));
}

/** The intrinsic speed β that gives an apparent speed β_app at angle θ (the inverse of apparentSpeed). */
export function betaFromApparent(betaApp: number, thetaRad: number): number {
  return betaApp / (Math.sin(thetaRad) + betaApp * Math.cos(thetaRad));
}
