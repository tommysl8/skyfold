/**
 * The uniforms of the chunk lightspeed_localdust (shaders/localDustRead.glsl), shared by reference with every material
 * that reads the neighbourhood's dust: the sky map's (materials.ts milkyWayUniforms, so the classical background and
 * the relativistic remap), the Galaxy layer's composites (galaxyLayer.ts inputs, so the lens's too) and the stars'.
 * render/dustLayer.ts writes them each frame; until the map has loaded, or wherever it does nothing (near the Sun,
 * beyond the neighbourhood), uLocalDustOn.x is 0 and every reader skips it.
 */
import { DataTexture, Matrix3, RGBAFormat, type Texture, Vector3, Vector4 } from 'three';
import { SUN_KNOTS_PC } from '../sim/dust/volume';
import { ISRF_RGB } from '../sim/dust/light';
import { ECL_TO_GAL } from '../sim/galaxy/frames';

const m = ECL_TO_GAL;

/** A 1 × 1 black texture: what the readers sample before the targets exist. */
function black(): DataTexture {
  const t = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}
const BLACK = black();

export const localDustUniforms = {
  uLocalDust0: { value: BLACK as Texture },
  uLocalDust1: { value: BLACK as Texture },
  uLocalDust2: { value: BLACK as Texture },
  uLocalDustSun0: { value: BLACK as Texture },
  uLocalDustSun1: { value: BLACK as Texture },
  uLocalDustOn: { value: new Vector4(0, 1, 1, 1.5) },
  uLocalDustLight: { value: new Vector4(0, 0, 0, 0) },
  uLocalDustRgb: { value: new Vector3(...ISRF_RGB) },
  uLocalDustKnots0: { value: new Vector4(SUN_KNOTS_PC[0], SUN_KNOTS_PC[1], SUN_KNOTS_PC[2], SUN_KNOTS_PC[3]) },
  uLocalDustKnots1: { value: new Vector4(SUN_KNOTS_PC[4], SUN_KNOTS_PC[5], SUN_KNOTS_PC[6], SUN_KNOTS_PC[7]) },
  /** J2000 ecliptic → heliocentric galactic (the stars' places are ecliptic). */
  uLocalDustEclToGal: { value: new Matrix3().set(m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]) },
};

/** The black texture the readers fall back to. */
export const localDustBlack = (): Texture => BLACK;
