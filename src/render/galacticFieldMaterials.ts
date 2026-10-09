/**
 * The materials of the Milky Way's magnetic field (scene/GalacticField.tsx; sim/galaxy/fieldLines.ts and fieldView.ts),
 * part of that layer's chunk, loaded the first time the View menu's "Magnetic field lines" is turned on:
 *  - the field lines in 3D (shaders/galacticField.vert.glsl, .frag.glsl): line segments added under the bodies, with
 *    the constellation figures, each point aberrated like a star in flight and dimmed by the Galaxy model's dust
 *    between the camera and it (the dust maps are the Galaxy model's own uniforms, shared);
 *  - the field over the sky from the Solar System (shaders/galacticFieldSky.frag.glsl): a full-screen quad added
 *    over the sky, under everything else, as the CMB map is.
 */
import { AdditiveBlending, Color, Matrix3, Matrix4, ShaderMaterial, Vector2, Vector3, type Texture } from 'three';
import { galaxyUniforms, relativityUniforms } from './materials';
import fieldVert from './shaders/galacticField.vert.glsl?raw';
import fieldFrag from './shaders/galacticField.frag.glsl?raw';
import skyFrag from './shaders/galacticFieldSky.frag.glsl?raw';
import remapVert from './shaders/remap.vert.glsl?raw';

/** The field lines in 3D: line segments, added. */
export function createGalacticFieldMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...relativityUniforms,
      uDust: galaxyUniforms.uDust,
      uWarpMap: galaxyUniforms.uWarpMap,
      uDustExtent: galaxyUniforms.uDustExtent,
      uDustPieces: { value: 0 },
      uCamG: { value: new Vector3() },
      uGToWorld: { value: new Matrix3() },
      uOpacity: { value: 0 },
      uNear: { value: new Vector2(0.3, 1.5) },
      uStrength: { value: new Vector2(Math.log(0.1), Math.log(6)) },
      uDash: { value: 1.2 },
    },
    vertexShader: fieldVert,
    fragmentShader: fieldFrag,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: false, // with the constellation figures, before (under) the bodies
  });
}

/** The field's direction over the sky from the Solar System: a full-screen quad, added. */
export function createGalacticFieldSkyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSkyTex: { value: null as Texture | null },
      uWorldToGal: { value: new Matrix3() },
      uProjInv: { value: new Matrix4() },
      uCamWorld: { value: new Matrix4() },
      uGain: { value: 0 },
      uTint: { value: new Color(0.62, 0.72, 0.95) },
    },
    vertexShader: remapVert,
    fragmentShader: skyFrag,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });
}
