/**
 * The magnetic field lines' material (scene/FieldLines.tsx; the lines: sim/fields/lines.ts). One line set per body,
 * drawn as line segments in the body's frame (the mesh turned with the body and scaled to its reference radius), added
 * light with no depth writes, like the pulsars' field (render/pulsarMaterials.ts), whose flowing pulses these share.
 *
 *  - Colour by polarity: lines where the field leaves the body warm, where it enters cool; a closed loop pale, shading
 *    from its outward foot to its inward one; the Sun's current sheet white.
 *  - Pulses flow along the field's direction (out of the outward feet, into the inward ones), spaced in proportion to
 *    the distance from the centre (the lines' phase is ∫ ds / r), so they look alike at every scale.
 *  - Each vertex says whether it is drawn (aVis, rewritten when the magnetopause moves; flat, so a segment is all in
 *    or all out): 0 not drawn, 1 closed, 2 open, 3 the current sheet, 4 the far end of a closed line the magnetopause
 *    cuts (coloured by its own foot's polarity).
 *  - The Sun's spirals reach 3 au, past the camera: they fade out within half their distance from the Sun of the
 *    camera (no streaks across the view), and over their last third.
 */
import { AdditiveBlending, Color, ShaderMaterial } from 'three';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aData;   // phase, along (0–1), polarity (±1, 0 for the sheet)
attribute float aVis;   // 0 not drawn, 1 closed, 2 open, 3 the current sheet, 4 a cut line's far end
uniform float uUnitKm;  // km per model unit (the mesh's scale)
uniform float uFarFrom; // beyond this radius (model units) a vertex is part of the far field (the Sun's spirals)
uniform float uFarEnd;  // where the far field ends
uniform float uNearOpacity;
uniform float uFarOpacity;
flat varying float vVis;
flat varying float vPol;
varying float vPhase;
varying float vAlong;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float r = length(position);
  float fade = uNearOpacity;
  if (r > uFarFrom) {
    float dc = length(mv.xyz) / max(r * uUnitKm, 1.0);
    fade = uFarOpacity * smoothstep(0.25, 0.6, dc) * (1.0 - smoothstep(0.66 * uFarEnd, uFarEnd, r));
  }
  vVis = aVis;
  vPol = aData.z;
  vPhase = aData.x;
  vAlong = aData.y;
  vFade = fade;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uOpacity;
uniform float uDash;
uniform vec3 uOut;
uniform vec3 uIn;
uniform vec3 uLoopOut;
uniform vec3 uLoopIn;
uniform vec3 uSheet;
flat varying float vVis;
flat varying float vPol;
varying float vPhase;
varying float vAlong;
varying float vFade;
void main() {
  #include <logdepthbuf_fragment>
  if (vVis < 0.5 || vFade <= 0.0) discard;
  vec3 col;
  float base;
  float dir = vPol;
  if (vVis < 1.5) {
    // A closed loop: from its outward foot (warm) to its inward one (cool), pale.
    float t = vPol > 0.0 ? vAlong : 1.0 - vAlong;
    col = mix(uLoopOut, uLoopIn, t);
    base = 0.22;
  } else if (vVis < 2.5 || vVis > 3.5) {
    // Open; a cut closed line's far end (4) has its foot's polarity, the opposite of the line's first one.
    float pol = vVis > 3.5 ? -vPol : vPol;
    col = pol > 0.0 ? uOut : uIn;
    base = 0.4;
  } else {
    col = uSheet;
    base = 0.14;
    dir = 1.0;
  }
  float pulse = pow(0.5 + 0.5 * sin(6.2831853 * (vPhase * uDash - dir * uTime * 0.35)), 10.0);
  vec3 c = col * (base + 0.9 * pulse) * uOpacity * vFade;
  gl_FragColor = vec4(c, 1.0);
}
`;

/** Outward (warm) and inward (cool) field; closed loops paler; the current sheet white. */
export const FIELD_OUT = new Color('#ff8a4c');
export const FIELD_IN = new Color('#4f9dff');
export const FIELD_LOOP_OUT = new Color('#ffd6b0');
export const FIELD_LOOP_IN = new Color('#b9d4ff');
export const FIELD_SHEET = new Color('#f2f0ff');

export function createFieldLinesMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uUnitKm: { value: 1 },
      uFarFrom: { value: 1e9 },
      uFarEnd: { value: 1e9 },
      uNearOpacity: { value: 1 },
      uFarOpacity: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uDash: { value: 5 },
      uOut: { value: FIELD_OUT.clone() },
      uIn: { value: FIELD_IN.clone() },
      uLoopOut: { value: FIELD_LOOP_OUT.clone() },
      uLoopIn: { value: FIELD_LOOP_IN.clone() },
      uSheet: { value: FIELD_SHEET.clone() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}
