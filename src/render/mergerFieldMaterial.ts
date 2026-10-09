/**
 * The merging neutron stars' field lines (sim/deepsky/mergerField.ts; drawn by scene/MergerField.tsx), in the polarity
 * colours of the pulsars' magnetospheres (render/pulsarMaterials.ts). One program, two uses:
 *  - the inspiral's lines (uMode 0), in units of the separation: faded out inside each star, swept back about the
 *    orbit's axis beyond its light cylinder (by ϖ/R_LC), and in the burst (uBurst 0 → 1) flung outwards at nearly the
 *    speed of light (to about 1,000 km, where a few milliseconds would carry them), torn into pieces and flashing white;
 *  - the remnant's (uMode 1), in units of its M, the whole scaled up (uScale) as the funnel grows, fading in.
 * False colour; added light, no depth writes. Cost: a few thousand segments, only near GW170817 with the switch on.
 */
import { Color, Matrix3, ShaderMaterial, Vector3 } from 'three';
import { ADDED_LIGHT, FIELD_MID, FIELD_MINUS, FIELD_PLUS } from './pulsarMaterials';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aArc;
attribute float aPol;
attribute float aFlow;
attribute float aW;
uniform mat3 uRot;      // local frame → world (z the orbit's axis)
uniform float uScale;   // km per local unit
uniform float uMode;    // 0 the inspiral, 1 the remnant
uniform vec3 uStar1;    // the stars, local units
uniform vec3 uStar2;
uniform float uStarR;   // a star's radius, local units
uniform float uLc;      // the orbit's light cylinder, local units
uniform float uBurst;   // 0 → 1 through the burst
varying float vArc;
varying float vPol;
varying float vFlow;
varying float vW;
void main() {
  vec3 p = position;
  float w = aW;
  if (uMode < 0.5) {
    float d = min(distance(p, uStar1), distance(p, uStar2));
    w *= smoothstep(uStarR, 1.5 * uStarR, d);
    float a = -length(p.xy) / uLc;
    p.xy = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));
    // Flung out at nearly c: about 40 separations at contact (1,000 km) by the burst's end, a few ms really.
    p *= 1.0 + 40.0 * uBurst * uBurst;
  }
  vArc = aArc;
  vPol = aPol;
  vFlow = aFlow;
  vW = w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(uRot * p * uScale, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uDash;
uniform float uSpeed;
uniform float uOpacity;
uniform float uBurst;
uniform vec3 uPlus;
uniform vec3 uMinus;
uniform vec3 uMid;
varying float vArc;
varying float vPol;
varying float vFlow;
varying float vW;
void main() {
  #include <logdepthbuf_fragment>
  float pol = clamp(vPol, -1.0, 1.0);
  vec3 col = pol >= 0.0 ? mix(uMid, uPlus, pol) : mix(uMid, uMinus, -pol);
  // max(): pow of a rounding error below 0 is NaN, which the bloom would spread over the view.
  float dash = pow(max(0.5 + 0.5 * sin(6.2831853 * (vArc / uDash - sign(vFlow) * uTime * uSpeed)), 0.0), 8.0);
  // The burst: the lines torn into pieces that shrink as they fly, and a white flash.
  float torn = uBurst > 0.0 ? step(uBurst, fract(vArc / (3.0 * uDash))) : 1.0;
  col = mix(col, vec3(1.0), 2.4 * uBurst * (1.0 - uBurst));
  gl_FragColor = vec4(col * vW * torn * (0.06 + 0.4 * dash) * (1.0 + 16.0 * uBurst * (1.0 - uBurst)) * uOpacity, 1.0);
}
`;

export function createMergerFieldMaterial(mode: 0 | 1): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uRot: { value: new Matrix3() },
      uScale: { value: 1 },
      uMode: { value: mode },
      uStar1: { value: new Vector3() },
      uStar2: { value: new Vector3() },
      uStarR: { value: 0.02 },
      uLc: { value: 10 },
      uBurst: { value: 0 },
      uTime: { value: 0 },
      uDash: { value: mode === 0 ? 0.08 : 3 },
      uSpeed: { value: 0.5 },
      uOpacity: { value: 0 },
      uPlus: { value: new Color().copy(FIELD_PLUS) },
      uMinus: { value: new Color().copy(FIELD_MINUS) },
      uMid: { value: new Color().copy(FIELD_MID) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    ...ADDED_LIGHT,
    depthWrite: false,
    transparent: true,
  });
}
