/**
 * Materials of the two stellar nebulae drawn as 3D models (scene/StellarNebulae.tsx; geometry in
 * sim/stars/stellarNebulae.ts):
 *  - the Homunculus: a thin dusty skin lit by Eta Carinae. Each pixel shows the light the skin scatters towards the
 *    camera: the star's light falling off as 1/r², a Henyey–Greenstein phase function (dust scatters forward, so
 *    the near lobe, between us and the star, is the brighter, as in Hubble's pictures), and the path length through
 *    a thin shell, 1/|n·v| (its rim brightens). The colour is a model: the reddish brown of its pictures;
 *  - WR 104's pinwheel: dust grains streaming out along an Archimedean spiral, placed in the vertex shader from
 *    their age (so the whole spiral turns on the simulation's clock), glowing warm. They shine in the infrared,
 *    where the spiral was imaged: shown in false colour;
 *  - the Sun's own planetary nebula, when the Sun is shown at that age (a model).
 */
import { AdditiveBlending, BackSide, Color, FrontSide, ShaderMaterial, Vector3 } from 'three';

const HOMUNCULUS_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

const HOMUNCULUS_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uStar;     // the star, camera-relative world position
uniform float uScale;   // the nebula's polar radius now (world units)
uniform vec3 uColor;
uniform float uGain;
uniform float uG;       // Henyey–Greenstein asymmetry
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  #include <logdepthbuf_fragment>
  vec3 toCam = normalize(-vWorld);
  vec3 fromStar = vWorld - uStar;
  float r = length(fromStar) / uScale;
  vec3 inc = fromStar / max(length(fromStar), 1e-6);
  // Scattering angle between the starlight's direction and the way to the camera.
  float mu = dot(inc, toCam);
  float hg = (1.0 - uG * uG) / pow(1.0 + uG * uG - 2.0 * uG * mu, 1.5);
  float path = 1.0 / max(abs(dot(normalize(vNormal), toCam)), 0.06);
  float b = uGain * hg * path / max(r * r, 0.04);
  gl_FragColor = vec4(uColor * b, 1.0);
}
`;

const PINWHEEL_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aAge;   // coils since the dust left the binary
attribute vec3 aJit;    // across the arm (in the plane, out of it) and brightness, random
uniform vec3 uNorth;    // in-plane north and east (world)
uniform vec3 uEast;
uniform vec3 uNormal;
uniform float uPsi;     // the arm's position angle at the standoff now, rad
uniform float uStandoff; // where dust begins, world units
uniform float uCoil;    // coil spacing, world units
uniform float uSizePx;
uniform float uPixelRatio;
uniform float uViewH;   // viewport height in px over 2 tan(fov/2)
varying float vB;
void main() {
  float r = uStandoff + aAge * uCoil;
  float a = uPsi + 6.2831853 * aAge;
  vec3 radial = cos(a) * uNorth + sin(a) * uEast;
  // The arm's width grows with distance (the shock cone opens, about 20° half-angle): a model.
  float w = 0.09 * r;
  vec3 p = radial * (r + w * aJit.x) + uNormal * (0.5 * w * aJit.y);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizeWorld = 0.6 * w;
  gl_PointSize = clamp(sizeWorld * uViewH / max(-mv.z, 1e-6), 1.0, uSizePx) * uPixelRatio;
  // Dust forms over the first tenth of a coil, then dims as it spreads and cools.
  vB = smoothstep(0.0, 0.1, aAge) * pow(uStandoff / r, 1.6) * (0.6 + 0.8 * aJit.z) * (1.0 - smoothstep(2.0, 2.6, aAge));
  #include <logdepthbuf_vertex>
}
`;

const PINWHEEL_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uGain;
varying float vB;
void main() {
  #include <logdepthbuf_fragment>
  vec2 d = gl_PointCoord - 0.5;
  float a = exp(-14.0 * dot(d, d));
  float b = a * vB * uGain;
  if (b < 0.0005) discard;
  gl_FragColor = vec4(uColor * b, 1.0);
}
`;

export function createHomunculusMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uStar: { value: new Vector3() },
      uScale: { value: 1 },
      uColor: { value: new Color(1.0, 0.52, 0.3) },
      uGain: { value: 0 },
      uG: { value: 0.45 },
    },
    vertexShader: HOMUNCULUS_VERT,
    fragmentShader: HOMUNCULUS_FRAG,
    // The near wall only: the far wall doubled the fill cost (2.5 ms with both on the target laptop) for light the
    // near wall's limb brightening already suggests.
    side: FrontSide,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

export function createPinwheelMaterial(pixelRatio: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uNorth: { value: new Vector3(0, 1, 0) },
      uEast: { value: new Vector3(1, 0, 0) },
      uNormal: { value: new Vector3(0, 0, 1) },
      uPsi: { value: 0 },
      uStandoff: { value: 1 },
      uCoil: { value: 1 },
      uSizePx: { value: 9 },
      uPixelRatio: pixelRatio,
      uViewH: { value: 1000 },
      uColor: { value: new Color(1.0, 0.6, 0.32) },
      uGain: { value: 0 },
    },
    vertexShader: PINWHEEL_VERT,
    fragmentShader: PINWHEEL_FRAG,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

const PN_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

// The Sun's planetary nebula (sim/stars/sunFuture.ts): an expanding shell of gas lit by the hot core, its light the path
// length through it along each ray from the camera (inside it or out), worked out exactly for nested spheres: the inner
// part glowing in [O III] (teal), the outer in Hα and [N II] (red), as the ionisation of planetary nebulae is layered.
const PN_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uCentre;   // the nebula's centre, camera-relative world position
uniform float uR;       // outer radius (world units)
uniform float uGain;
varying vec3 vWorld;
// Length of the ray from the camera (the origin) inside a sphere of radius a about uCentre.
float chord(vec3 d, float a) {
  float tc = dot(uCentre, d);
  float h2 = a * a - (dot(uCentre, uCentre) - tc * tc);
  if (h2 <= 0.0) return 0.0;
  float h = sqrt(h2);
  return max(0.0, (tc + h) - max(0.0, tc - h));
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vWorld);
  float path = (chord(d, uR) - chord(d, 0.6 * uR)) / uR;
  // How far from the centre the ray passes, as a share of the radius: the inner gas teal, the rim red.
  float tc = dot(uCentre, d);
  float b = sqrt(max(0.0, dot(uCentre, uCentre) - tc * tc)) / uR;
  vec3 tint = mix(vec3(0.22, 0.85, 0.75), vec3(1.0, 0.24, 0.2), smoothstep(0.55, 0.95, b));
  vec3 col = uGain * path * tint;
  if (max(col.r, max(col.g, col.b)) < 1e-4) discard;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createPlanetaryNebulaMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uCentre: { value: new Vector3() },
      uR: { value: 1 },
      uGain: { value: 0 },
    },
    vertexShader: PN_VERT,
    fragmentShader: PN_FRAG,
    // The far side: drawn whether the camera is outside the shell or inside it, each pixel once.
    side: BackSide,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}
