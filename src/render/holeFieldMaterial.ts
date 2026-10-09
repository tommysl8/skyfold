/**
 * The field lines threading a black hole (sim/blackholes/holeField.ts; drawn by scene/HoleFieldLines.tsx), lensed.
 *
 * What: thin lines in the polarity colours of the pulsars' magnetospheres (render/pulsarMaterials.ts: cyan out of the
 * hole, amber into it), dashes flowing along the field. Near the hole a straight line would sit where light does not
 * come from, so while the lens is drawn each vertex goes to its image by the exact point lens (shaders/lensExact.glsl
 * lensImageExact, tier 2: both branches, the light met on its way in or out), keeping its straight-line distance for
 * the depth test, and the set is drawn twice: the primary image (order 0) and the secondary one (order 1, on the far
 * side of the hole, hugging the photon ring), the latter dimmed as √μ. A segment whose two ends lie either side of the
 * line through the camera and the hole, behind the hole, is dropped (its images jump across the Einstein ring there:
 * the line's image is broken at the caustic, as a star's is). The exact solver does not apply inside the photon sphere
 * (r ≤ 3M): the lines fade out from 3.9M in to 3.2M, and are not drawn inside.
 *
 * Without a lens (View › Gravitational lensing off) the lines are drawn straight all the way in (the plain program),
 * as everything else then is.
 *
 * Why the exact solver and not tier 1: the field's points are within tens of M of the hole, where tier 1's straight
 * fallback for sources in front of the hole is off by many pixels (the S-stars' orbit lines needed it for the same
 * reason: shaders/orbit.vert.glsl). One call site, as the orbit program has, so the program compiles in about a second.
 *
 * Cost: one exact solve per vertex per image (about 12 sweeps): about 12,000 vertices, two images, measured in
 * docs/data/blackholes.md §14.
 */
import { Color, Matrix3, ShaderMaterial, Vector3 } from 'three';
import { lensUniforms } from './lens/lensUniforms';
import { ADDED_LIGHT, FIELD_MID, FIELD_MINUS, FIELD_PLUS } from './pulsarMaterials';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#ifdef LENS
#include <lightspeed_lens>
#include <lightspeed_lens_exact>
#endif
attribute vec3 aOther;  // the segment's other end (hole frame, M)
attribute float aArc;   // M along its line
attribute float aPol;   // +1 out of the hole, −1 into it
attribute float aFlow;  // +1: the field runs the way the line is drawn
attribute float aW;     // brightness, 0 to 1
uniform mat3 uRot;      // the hole's frame (z its spin axis) → world
uniform vec3 uHoleCam;  // the hole from the camera, km (float64 on the CPU)
uniform float uMKm;     // km per M
uniform float uOrder;   // the image drawn: 0 or 1
uniform float uInnerM;  // not drawn inside this radius, M; fading in over the next 20 %
varying float vArc;
varying float vPol;
varying float vFlow;
varying float vW;
void main() {
  vec3 hM = uRot * position;
  vec3 oM = uRot * aOther;
  vec3 p = uHoleCam + hM * uMKm;
  float keep = smoothstep(uInnerM, 1.22 * uInnerM, length(position)) * step(uInnerM, length(aOther));
#ifdef LENS
  // The point from the camera, M; its image's direction at the same straight-line distance.
  vec3 relM = uLensHole + hM;
  float lnDf = 0.0;
  if (uFramePhi > 0.0) relM = frameAberrate(normalize(relM), lnDf) * length(relM);
  vec3 image;
  float lnMu;
  float lnG;
  bool ok = lensImageExact(relM, uOrder, image, lnMu, lnG);
  if (!ok) keep = 0.0;
  vec3 straight = p;
  p = frameUnaberrate(image, lnDf) * length(p);
  // Either side of the axis behind the hole: the images jump across the ring; drop the segment.
  vec3 ax = normalize(uLensHole);
  vec3 s0 = hM - dot(hM, ax) * ax;
  vec3 s1 = oM - dot(oM, ax) * ax;
  if (dot(hM + oM, ax) > 0.0 && dot(s0, s1) < 0.0) keep = 0.0;
  // A NaN from the solver must not reach the colour (blended, then bloomed, it blacks out a disc of the view).
  if (!(lnMu < 1e30) || !(abs(p.x) + abs(p.y) + abs(p.z) < 3.0e38)) {
    keep = 0.0;
    p = straight;
  }
  if (uOrder > 0.5) keep *= lnMu < 0.0 ? exp(0.5 * max(lnMu, -40.0)) : 1.0;
#endif
  vArc = aArc;
  vPol = aPol;
  vFlow = aFlow;
  vW = keep > 0.0 ? aW * keep : 0.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uDashM;
uniform float uSpeed;
uniform float uOpacity;
uniform vec3 uPlus;
uniform vec3 uMinus;
uniform vec3 uMid;
varying float vArc;
varying float vPol;
varying float vFlow;
varying float vW;
void main() {
  #include <logdepthbuf_fragment>
  if (!(vW >= 0.002)) discard;
  float pol = clamp(vPol, -1.0, 1.0);
  vec3 col = pol >= 0.0 ? mix(uMid, uPlus, pol) : mix(uMid, uMinus, -pol);
  // max(): pow of a rounding error below 0 is NaN, which the bloom would spread over the view.
  float dash = pow(max(0.5 + 0.5 * sin(6.2831853 * (vArc / uDashM - sign(vFlow) * uTime * uSpeed)), 0.0), 8.0);
  gl_FragColor = vec4(col * vW * (0.12 + 0.6 * dash) * uOpacity, 1.0);
}
`;

/** Uniforms of one hole's lines (shared by the plain, lensed and second-image materials but uOrder). */
export function holeFieldUniforms() {
  return {
    ...lensUniforms,
    uRot: { value: new Matrix3() },
    uHoleCam: { value: new Vector3() },
    uMKm: { value: 1 },
    uOrder: { value: 0 },
    uInnerM: { value: 2 },
    uTime: { value: 0 },
    uDashM: { value: 4 },
    uSpeed: { value: 0.3 },
    uOpacity: { value: 0 },
    uPlus: { value: new Color().copy(FIELD_PLUS) },
    uMinus: { value: new Color().copy(FIELD_MINUS) },
    uMid: { value: new Color().copy(FIELD_MID) },
  };
}

/** The lines' material: plain (straight lines), or lensed by the exact solver (`lensed`), drawing image `order`. */
export function createHoleFieldMaterial(uniforms: ReturnType<typeof holeFieldUniforms>, lensed: boolean, order: 0 | 1 = 0): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: order === 0 ? uniforms : { ...uniforms, uOrder: { value: order } },
    defines: lensed ? { LENS: '', LENS_EXACT: '' } : {},
    vertexShader: VERT,
    fragmentShader: FRAG,
    ...ADDED_LIGHT,
    depthWrite: false,
    transparent: true,
  });
  m.name = `hole field lines${lensed ? ` (lensed, image ${order})` : ''}`;
  return m;
}
