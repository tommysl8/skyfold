/**
 * The satellites' materials (scene/Satellites.tsx). Part of the satellites' chunk.
 *  - The swarm: one point each, moved on the GPU from SGP4's mean elements (shaders/satellites.vert.glsl), dimmed
 *    in Earth's shadow, in a quiet colour for its kind of orbit.
 *  - The trace of the selected satellite's orbit: a short line through where it was and will be, fading at both ends.
 */
import { AdditiveBlending, Color, Matrix3, ShaderMaterial, Vector3 } from 'three';
import { relativityUniforms } from './materials';
import satellitesVert from './shaders/satellites.vert.glsl?raw';
import pointFrag from './shaders/asteroids.frag.glsl?raw';

/**
 * Colours by class (sim/satellites/omm.ts SAT_CLASSES): low orbit, Starlink, medium orbit (the navigation
 * constellations), geosynchronous, elliptical, debris. Muted, so the swarm reads as structure, not as signals.
 */
export const SAT_COLOURS = ['#cfd6e2', '#b4c4e6', '#e6d6a8', '#f0c890', '#d6b8de', '#b98a7e'];

export function createSatelliteMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...relativityUniforms,
      uDtMin: { value: 0 },
      uTemeToWorld: { value: new Matrix3() },
      uEarthRel: { value: new Vector3() },
      uSunDir: { value: new Vector3(1, 0, 0) },
      uPointSize: { value: 2 },
      uOpacity: { value: 0.6 },
      uDebris: { value: 0 },
      uHidden: { value: -1 },
      uColors: { value: SAT_COLOURS.map((c) => new Color(c)) },
    },
    vertexShader: satellitesVert,
    fragmentShader: pointFrag,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    transparent: true,
  });
}

const TRACE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aFade;
varying float vFade;
void main() {
  vFade = aFade;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const TRACE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(uColor * uOpacity * vFade, 1.0);
}
`;

/** The selected satellite's trace: positions relative to the camera (km), each vertex with its fade. */
export function createTraceMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color('#9fb4d8') }, uOpacity: { value: 0.55 } },
    vertexShader: TRACE_VERT,
    fragmentShader: TRACE_FRAG,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    transparent: true,
  });
}
