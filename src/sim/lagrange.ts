/**
 * The Sun–Earth L1 and L2 points, where SOHO and Webb are: on the line from the Sun through the Earth–Moon
 * barycentre, where the pull of the Sun and of the Earth–Moon pair together give a body the pair's own period
 * (the circular restricted three-body problem: the Sun and the barycentre on a circle at today's distance).
 *
 * The distance x from the barycentre, as a fraction of the Sun–barycentre distance, solves
 *   L1:  (1 − μ)/(1 − x)² − μ/x² = 1 − μ − x       L2:  (1 − μ)/(1 + x)² + μ/x² = 1 − μ + x
 * (Murray & Dermott 1999, §3.5), with μ = GM(Earth+Moon) / GM(Sun+Earth+Moon): x ≈ (μ/3)^⅓ ≈ 0.0100, about
 * 1.50 and 1.51 million km. Webb and SOHO fly halo orbits hundreds of thousands of km round these points.
 */
import { GM_SUN_KM3_S2 } from '../physics/constants';

/** GM of the Earth–Moon system, km³/s² (DE440). */
export const GM_EMB_KM3_S2 = 403503.235502;

const MU = GM_EMB_KM3_S2 / (GM_SUN_KM3_S2 + GM_EMB_KM3_S2);

/** The fraction x (of the Sun–barycentre distance) of L1 (side −1, towards the Sun) or L2 (side +1, away from it). */
export function lagrangeFraction(side: -1 | 1, mu = MU): number {
  let x = Math.cbrt(mu / 3);
  for (let i = 0; i < 50; i++) {
    const f =
      side < 0
        ? (1 - mu) / ((1 - x) * (1 - x)) - mu / (x * x) - (1 - mu - x)
        : (1 - mu) / ((1 + x) * (1 + x)) + mu / (x * x) - (1 - mu + x);
    const df = side < 0 ? (2 * (1 - mu)) / (1 - x) ** 3 + (2 * mu) / x ** 3 + 1 : (-2 * (1 - mu)) / (1 + x) ** 3 - (2 * mu) / x ** 3 - 1;
    const dx = f / df;
    x -= dx;
    if (Math.abs(dx) < 1e-15) break;
  }
  return x;
}

export const L1_FRACTION = lagrangeFraction(-1);
export const L2_FRACTION = lagrangeFraction(1);
