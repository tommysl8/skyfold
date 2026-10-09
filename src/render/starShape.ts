/**
 * The meshes of stars up close (scene/Bodies.tsx StarBody; sim/stars/closeup.ts): a unit sphere, a Roche surface for
 * a fast rotator, or a wind stretched along its pole, with +Y the pole. Each vertex carries its temperature as a
 * fraction of the pole's (aTemp: von Zeipel's gravity darkening on a Roche surface, else 1), and its normal is the
 * surface's own (on a Roche surface, along the effective gravity). Scaled so the mesh has the volume of a unit
 * sphere: the body's radius is the star's mean radius (R_eq² R_pole)^⅓.
 */
import { BufferGeometry, Float32BufferAttribute, SphereGeometry } from 'three';
import { gravityDarkening, rocheFlattening, rocheGravity, type StarSurface } from '../sim/stars/closeup';

/** A unit sphere with aTemp = 1 everywhere. */
export function roundStarGeometry(widthSegments: number, heightSegments: number): BufferGeometry {
  const g = new SphereGeometry(1, widthSegments, heightSegments);
  g.setAttribute('aTemp', new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
  return g;
}

/** The star's own shape (null for a plain sphere: use roundStarGeometry's shared one). */
export function starShapeGeometry(s: Pick<StarSurface, 'omega' | 'beta' | 'elongation'>, widthSegments: number, heightSegments: number): BufferGeometry | null {
  const roche = s.omega > 0;
  const stretched = Math.abs(s.elongation - 1) > 1e-6;
  if (!roche && !stretched) return null;
  const g = new SphereGeometry(1, widthSegments, heightSegments);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const temp = new Float32Array(pos.count);
  // Volume-preserving scale: a Roche star's polar radius is the mean over (R_eq/R_pole)^⅔; a stretched wind is
  // e^⅔ long and e^−⅓ wide.
  const flat = roche ? rocheFlattening(s.omega) : 1;
  const polar = 1 / Math.cbrt(flat * flat);
  const along = Math.cbrt(s.elongation * s.elongation);
  const across = 1 / Math.cbrt(s.elongation);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const theta = Math.acos(Math.max(-1, Math.min(1, y)));
    const rho = Math.hypot(x, z);
    const cx = rho > 1e-9 ? x / rho : 1;
    const cz = rho > 1e-9 ? z / rho : 0;
    if (roche) {
      // By symmetry the southern hemisphere mirrors the northern: θ' = min(θ, π − θ).
      const south = theta > Math.PI / 2;
      const th = south ? Math.PI - theta : theta;
      const { x: r, nr, nt } = rocheGravity(th, s.omega);
      const R = r * polar;
      pos.setXYZ(i, R * Math.sin(theta) * cx, R * Math.cos(theta), R * Math.sin(theta) * cz);
      // Normal = nr r̂ + nt θ̂, θ̂ pointing away from the pole (towards the equator) in each hemisphere.
      const st = Math.sin(th);
      const ct = Math.cos(th);
      const ny = (nr * ct - nt * st) * (south ? -1 : 1);
      const nh = nr * st + nt * ct;
      nor.setXYZ(i, nh * cx, ny, nh * cz);
      temp[i] = gravityDarkening(th, s.omega, s.beta);
    } else {
      pos.setXYZ(i, x * across, y * along, z * across);
      // The normal of an ellipsoid: the gradient of x²/a² + y²/b² + z²/a².
      const n = [x / across, y / along, z / across];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      nor.setXYZ(i, n[0] / l, n[1] / l, n[2] / l);
      temp[i] = 1;
    }
  }
  g.setAttribute('aTemp', new Float32BufferAttribute(temp, 1));
  g.computeBoundingSphere();
  return g;
}
