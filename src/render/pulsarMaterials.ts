/**
 * The materials of a pulsar seen up close (scene/PulsarModel.tsx; the model: sim/deepsky/pulsarModel.ts). Scene units
 * are km about the camera at the origin, as everywhere.
 *  - The star: a 12 km sphere, white-hot, its polar caps (where the open field lines meet it, and the beams start)
 *    hotter still.
 *  - A beam: its light added up along each pixel's ray through a cone round the magnetic axis (drawn by its back faces,
 *    so the camera may be inside it), a core and a hollow cone as radio beams are mapped, each shining as 1/r² from
 *    the star, so a beam fades as 1/r across. False colour: radio is invisible to the eye.
 *  - The field lines: a dipole's, turned with the star and swept back near the light cylinder, the open ones (which
 *    leave through the light cylinder, carrying the pulsar's wind) with light flowing out along them.
 *  - The glow: a soft point on the star, so it shows when it is under a pixel, flaring when a beam points at us.
 *  - With View › Magnetic field lines, the whole magnetosphere (sim/deepsky/magnetosphere.ts): thin lines coloured by
 *    the field's polarity (cyan where it points away from the star, amber where it points in, violet across the tops
 *    of the closed loops), with dashes flowing along the field; and the striped wind's current sheet, a faint surface
 *    brightest where it is seen edge-on. False colour throughout. The Double Pulsar's B is confined in the vertex
 *    shader where A's wind presses on it (uConfine; the CPU twin is magnetosphere.ts confinedField).
 * All but the star are added light with no depth writes.
 */
import { AdditiveBlending, AddEquation, BackSide, Color, CustomBlending, DoubleSide, Matrix3, OneFactor, ShaderMaterial, Vector3, Vector4, ZeroFactor } from 'three';

const BEAM_VERT = /* glsl */ `
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

const BEAM_FRAG = /* glsl */ `
uniform vec3 uApex;      // the star's centre (world, km)
uniform vec3 uAxis;      // the beam's direction
uniform float uTanRho;   // tan of the beam's half-width
uniform float uCos2Bound; // cos² of the bounding cone's half-angle
uniform float uLength;   // km along the axis
uniform float uStarR;    // km
uniform float uK;        // brightness scale
uniform float uOpacity;
uniform vec3 uCore;
uniform vec3 uEdge;
varying vec3 vWorld;

// A radio beam's light per unit length: a core and a hollow cone (u in beam half-widths), 1/r² from the star, starting
// a few radii up (where radio is made) and fading out at the end of the drawn length.
float emission(vec3 p) {
  vec3 v = p - uApex;
  float h = dot(v, uAxis);
  if (h <= 0.0) return 0.0;
  float r2 = dot(v, v);
  float u = sqrt(max(r2 - h * h, 0.0)) / (h * uTanRho);
  float d = u - 0.72;
  float prof = 0.45 * exp(-u * u / 0.16) + exp(-d * d / 0.04);
  float near = smoothstep(uStarR, 5.0 * uStarR, sqrt(r2));
  float far = 1.0 - smoothstep(0.5 * uLength, uLength, h);
  return prof * near * far / max(r2, uStarR * uStarR);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 seg = vWorld - ro;
  float t1 = length(seg);
  vec3 rd = seg / t1;
  // Where the ray enters the bounding cone: here if the camera is inside, else the nearer crossing of its side or its
  // end that is ahead of the star.
  vec3 co = ro - uApex;
  float dv = dot(rd, uAxis);
  float cv = dot(co, uAxis);
  float qa = dv * dv - uCos2Bound;
  float qb = 2.0 * (dv * cv - uCos2Bound * dot(rd, co));
  float qc = cv * cv - uCos2Bound * dot(co, co);
  float t0 = t1;
  if (qc >= 0.0 && cv >= 0.0 && cv <= uLength) t0 = 0.0;
  else {
    float disc = qb * qb - 4.0 * qa * qc;
    if (disc >= 0.0 && abs(qa) > 1e-12) {
      float sq = sqrt(disc);
      float ta = (-qb - sq) / (2.0 * qa);
      float tb = (-qb + sq) / (2.0 * qa);
      float ha = cv + ta * dv;
      float hb = cv + tb * dv;
      if (ta > 0.0 && ha >= 0.0 && ha <= uLength) t0 = min(t0, ta);
      if (tb > 0.0 && hb >= 0.0 && hb <= uLength) t0 = min(t0, tb);
    }
    if (cv > uLength && dv < 0.0) t0 = min(t0, (uLength - cv) / dv);
  }
  // The star hides what is behind it.
  float b = dot(co, rd);
  float cs = dot(co, co) - uStarR * uStarR;
  float hs = b * b - cs;
  if (hs > 0.0) {
    float ts = -b - sqrt(hs);
    if (ts > 0.0) t1 = min(t1, ts);
  }
  if (t1 <= t0) discard;
  // Samples crowd towards the ray's closest approach to the star, where the light is.
  float tc = clamp(-b, t0, t1);
  const int N = 24;
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float sum = 0.0;
  for (int i = 0; i < N; i++) {
    float s = (float(i) + jitter) / float(N);
    float w = 2.0 * s / float(N);
    sum += emission(ro + rd * (tc - (tc - t0) * s * s)) * w * (tc - t0);
    sum += emission(ro + rd * (tc + (t1 - tc) * s * s)) * w * (t1 - tc);
  }
  float col = uK * sum;
  col = 6.0 * (1.0 - exp(-col / 6.0));
  vec3 c = mix(uEdge, uCore, 1.0 - exp(-0.8 * col)) * col * uOpacity;
  if (max(c.r, max(c.g, c.b)) < 0.0005) discard;
  gl_FragColor = vec4(c, 1.0);
}
`;

const STAR_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

const STAR_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uMag;      // the magnetic axis (world)
uniform float uCapCos;  // cos of the polar cap's angular radius
uniform vec3 uSurface;
uniform vec3 uCap;
uniform float uOpacity;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  float mu = max(dot(n, normalize(cameraPosition - vWorld)), 0.0);
  float c = abs(dot(n, uMag));
  float cap = smoothstep(uCapCos - 2.0 * (1.0 - uCapCos) - 0.002, uCapCos + 0.5 * (1.0 - uCapCos), c);
  vec3 col = uSurface * (0.6 + 0.4 * mu) + uCap * cap;
  gl_FragColor = vec4(col * uOpacity, 1.0);
}
`;

const LINES_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aS;    // 0 at the star to 1 at the line's end
attribute float aOpen; // 1: an open line
uniform mat3 uRot;     // magnetic frame → world, now
uniform vec3 uSpin;    // spin axis
uniform float uRlc;    // light cylinder, km
uniform float uTwist;  // the sweep-back at the light cylinder, rad
varying float vS;
varying float vOpen;
varying float vR;
void main() {
  vec3 p = uRot * position;
  // Swept back about the spin axis as the field nears the light cylinder.
  float ax = dot(p, uSpin);
  vec3 perp = p - ax * uSpin;
  float w = length(perp) / uRlc;
  float a = -uTwist * w * w;
  p = ax * uSpin + perp * cos(a) + cross(uSpin, perp) * sin(a);
  vS = aS;
  vOpen = aOpen;
  vR = w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const LINES_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uFlow;
varying float vS;
varying float vOpen;
varying float vR;
void main() {
  #include <logdepthbuf_fragment>
  float base = vOpen > 0.5 ? 0.07 * (1.0 - smoothstep(0.6, 1.0, vS)) : 0.045;
  float flow = vOpen > 0.5 ? 0.6 * pow(max(0.0, 0.5 + 0.5 * sin(6.2831853 * (vS * 4.0 - uTime * 0.35))), 10.0) * (1.0 - smoothstep(0.7, 1.0, vS)) : 0.0;
  vec3 c = (uColor * base + uFlow * flow) * uOpacity;
  gl_FragColor = vec4(c, 1.0);
}
`;

const GLOW_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uSizePx;
uniform float uPixelRatio;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  gl_PointSize = uSizePx * uPixelRatio;
  #include <logdepthbuf_vertex>
}
`;

const GLOW_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uIntensity;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (exp(-14.0 * r * r) + 0.18 * exp(-4.0 * r)) * (1.0 - smoothstep(0.8, 1.0, r));
  if (a * uIntensity < 0.001) discard;
  gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
}
`;

/** Beams: near-white at their brightest, deep cyan-blue at their edges. */
export const BEAM_CORE = new Color('#b8f2ff');
export const BEAM_EDGE = new Color('#1268ff');

export function createBeamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uApex: { value: new Vector3() },
      uAxis: { value: new Vector3(0, 1, 0) },
      uTanRho: { value: 0.1 },
      uCos2Bound: { value: 0.98 },
      uLength: { value: 1 },
      uStarR: { value: 12 },
      uK: { value: 1 },
      uOpacity: { value: 0 },
      uCore: { value: BEAM_CORE.clone() },
      uEdge: { value: BEAM_EDGE.clone() },
    },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    side: BackSide,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}

export function createStarMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMag: { value: new Vector3(0, 1, 0) },
      uCapCos: { value: 0.99 },
      // White-hot (a million kelvin: its visible light is a blackbody's blue-white limit), shown bright enough to bloom.
      uSurface: { value: new Color(0.62, 0.74, 1.0).multiplyScalar(1.6) },
      uCap: { value: new Color(0.85, 0.95, 1.0).multiplyScalar(4) },
      uOpacity: { value: 1 },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
  });
}

export function createFieldLineMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uRot: { value: new Matrix3() },
      uSpin: { value: new Vector3(0, 1, 0) },
      uRlc: { value: 1 },
      uTwist: { value: 0.45 },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new Color('#8f9dff') },
      uFlow: { value: new Color('#9fe8ff') },
    },
    vertexShader: LINES_VERT,
    fragmentShader: LINES_FRAG,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

export function createGlowMaterial(pixelRatio: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSizePx: { value: 40 },
      uPixelRatio: pixelRatio,
      uColor: { value: new Color(0.7, 0.85, 1.0) },
      uIntensity: { value: 0 },
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

const SPHERE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aArc;  // km along its line
attribute float aPol;  // B_r/|B|: +1 out of the star, −1 into it
attribute float aFlow; // +1: the field runs the way the line is drawn
attribute float aW;    // brightness, 0 to 1
uniform mat3 uRot;     // the set's frame → world, now
uniform vec4 uConfine; // the Double Pulsar's B: unit direction to A (world) and the magnetopause, km (w = 0: none)
uniform float uTail;   // the confined field's reach downwind, in magnetopause radii
varying float vArc;
varying float vPol;
varying float vFlow;
varying float vW;
void main() {
  vec3 p = uRot * position;
  if (uConfine.w > 0.0) {
    // r' = r_lim tanh(r / r_lim), r_lim from the magnetopause towards A to uTail of it straight downwind.
    float r = length(p);
    float c = dot(p, uConfine.xyz) / max(r, 1e-6);
    float t = 0.5 - 0.5 * c;
    float lim = uConfine.w * (1.0 + (uTail - 1.0) * pow(t, 2.5));
    float x = r / lim;
    // tanh written out (GLSL ES 3's tanh overflows for large arguments on some GPUs).
    float e = exp(-2.0 * min(x, 20.0));
    p *= r > 0.0 ? lim * (1.0 - e) / (1.0 + e) / r : 1.0;
  }
  vArc = aArc;
  vPol = aPol;
  vFlow = aFlow;
  vW = aW;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const SPHERE_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uTime;    // s
uniform float uDashKm;  // the dashes' spacing, km
uniform float uSpeed;   // dashes per second
uniform float uOpacity;
uniform float uGain;
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
  float dash = pow(max(0.5 + 0.5 * sin(6.2831853 * (vArc / uDashKm - sign(vFlow) * uTime * uSpeed)), 0.0), 8.0);
  vec3 c = col * vW * (0.05 + 0.35 * dash) * uGain * uOpacity;
  gl_FragColor = vec4(c, 1.0);
}
`;

const SHEET_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aU;  // radius in light-cylinder radii
uniform mat3 uRot;
varying float vU;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(uRot * position, 1.0);
  vU = aU;
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const SHEET_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uOpacity;
uniform float uReach;
uniform vec3 uColor;
varying float vU;
varying vec3 vView;
void main() {
  #include <logdepthbuf_fragment>
  // Brightest seen edge-on (a thin sheet's light along the line of sight grows as 1/|cos|), held finite.
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  float mu = abs(dot(n, normalize(vView)));
  float edge = min(2.0, 0.2 / max(mu, 0.1));
  float fade = smoothstep(1.0, 1.4, vU) * (1.0 - smoothstep(0.45 * uReach, 0.95 * uReach, vU));
  // Faint ridges half a wavelength (π R_LC) apart along the radius: where the sheet folds over in the spiral.
  float ridge = 0.55 + 0.45 * cos(2.0 * vU);
  gl_FragColor = vec4(uColor * edge * fade * ridge * uOpacity, 1.0);
}
`;

/**
 * Added light that leaves the target's alpha alone. The scene pass composites the scene over what is drawn behind it by
 * its alpha (surface coverage: render/LightspeedScenePass.ts), so field lines and the wind's sheet, which cover
 * nothing, must not write it: added alpha would blank out the Milky Way's glow behind them (and, near a black hole,
 * discs of the lensed sky round the shadow).
 */
export const ADDED_LIGHT = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;

/** Polarity colours (false colour): away from the star, into it, and across the tops of the closed loops. */
export const FIELD_PLUS = new Color('#5fd8ff');
export const FIELD_MINUS = new Color('#ffa25c');
export const FIELD_MID = new Color('#a99cff');

/** A whole magnetosphere's lines (magnetosphere.ts FieldLineSet), turned by uRot. */
export function createMagnetosphereMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uRot: { value: new Matrix3() },
      uConfine: { value: new Vector4(0, 0, 1, 0) },
      uTail: { value: 6 },
      uTime: { value: 0 },
      uDashKm: { value: 100 },
      uSpeed: { value: 0.35 },
      uOpacity: { value: 0 },
      uGain: { value: 1 },
      uPlus: { value: FIELD_PLUS.clone() },
      uMinus: { value: FIELD_MINUS.clone() },
      uMid: { value: FIELD_MID.clone() },
    },
    vertexShader: SPHERE_VERT,
    fragmentShader: SPHERE_FRAG,
    ...ADDED_LIGHT,
    depthWrite: false,
    transparent: true,
  });
}

/** The striped wind's current sheet (magnetosphere.ts stripedSheet), turned by uRot. */
export function createSheetMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uRot: { value: new Matrix3() },
      uOpacity: { value: 0 },
      uReach: { value: 5 },
      uColor: { value: new Color('#c9c2ff').multiplyScalar(0.03) },
    },
    vertexShader: SHEET_VERT,
    fragmentShader: SHEET_FRAG,
    side: DoubleSide,
    ...ADDED_LIGHT,
    depthWrite: false,
    transparent: true,
  });
}
