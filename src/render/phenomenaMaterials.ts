/**
 * The materials of the phenomena (scene/Phenomena.tsx; the models: sim/phenomena/). Part of the phenomena's chunk.
 * Every one is added light with no depth writes, drawn on a bounding sphere about its object (its back faces, so the
 * camera may be inside), and shown with the law of the sky and the nebulae: a surface of S (V-band flux per steradian,
 * in V = 0 stars) has luminance uStarGain √(S Ω_psf 10^(0.4 m₀)) (sim/galaxy/background.ts), faded out below what the
 * eye would see (22 to 24 mag/arcsec²). So each is as bright as its light really is, wherever the camera is.
 *
 *  - Blobs (the jets and their lobes, SN 1987A's ring, the kilonova's debris, the neutron stars): up to MAX_BLOBS
 *    elongated Gaussian clouds of light, each normalised to its luminosity, integrated exactly along each pixel's ray
 *    from the camera (a Gaussian's line integral is closed form; erfc for the half behind the camera). No noise, no
 *    marching: about 30 operations a blob a pixel.
 *  - A supernova (sim/phenomena/supernovae.ts): its fireball, an opaque sphere of the photosphere's radius as bright as
 *    its light curve; and its debris, a shell behind the forward shock and the ejecta inside it, their light integrated
 *    exactly along the ray (chords through spheres), mottled by noise at the shell.
 *  - The aurora: shaders/aurora.frag.glsl.
 */
import { AdditiveBlending, BackSide, Color, DataTexture, FloatType, LinearFilter, RepeatWrapping, RGBAFormat, ShaderMaterial, Vector2, Vector3 } from 'three';
import auroraFrag from './shaders/aurora.frag.glsl?raw';

/** The most blobs one material draws. */
export const MAX_BLOBS = 40;

/** A bounding sphere's vertex shader: the world position (camera-relative, km) to the fragment. */
const SPHERE_VERT = /* glsl */ `
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

/** The eye's fade for a surface of S (flux per sr): uFadeS = S at 24 and at 22 mag/arcsec². */
const FADE_GLSL = /* glsl */ `
uniform float uScale;   // uStarGain² Ω_psf 10^(0.4 m0)
uniform vec2 uFadeS;    // S where light starts to show, and where it shows in full
uniform float uOpacity;
uniform float uExposure; // ≤ 1: the view of a blinding explosion stopped down to its glare (the scene's CPU sets it from its brightest part)
vec3 display(vec3 colour, float S) {
  return colour * sqrt(uScale * S) * uExposure * smoothstep(uFadeS.x, uFadeS.y, S) * uOpacity;
}
`;

const BLOB_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
#define MAX_BLOBS ${MAX_BLOBS}
uniform vec3 uCentre;            // the blobs' origin from the camera, in units (uUnitKm km)
uniform float uUnitKm;
uniform int uCount;
uniform vec3 uPos[MAX_BLOBS];    // each blob's centre from the origin, units
uniform vec3 uAxis[MAX_BLOBS];   // its long axis (unit)
uniform vec2 uSig[MAX_BLOBS];    // σ along the axis, σ across, units
uniform vec3 uLum[MAX_BLOBS];    // its colour (luminance 1) × its luminosity, as flux × units² (V = 0 stars)
${FADE_GLSL}
varying vec3 vWorld;

// erfc(x), Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7), for any x.
float erfcA(float x) {
  float z = abs(x);
  float t = 1.0 / (1.0 + 0.3275911 * z);
  float y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * exp(-z * z);
  return x >= 0.0 ? y : 2.0 - y;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vWorld);
  vec3 ro = -uCentre;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < MAX_BLOBS; i++) {
    if (i >= uCount) break;
    vec3 o = ro - uPos[i];
    vec3 k = uAxis[i];
    float ia = 1.0 / (uSig[i].x * uSig[i].x);
    float ip = 1.0 / (uSig[i].y * uSig[i].y);
    float dk = dot(rd, k);
    float ok = dot(o, k);
    // The quadratic form xᵀAx along the ray o + t d, A = ip I + (ia − ip) k kᵀ.
    float a = ip + (ia - ip) * dk * dk;
    float b = ip * dot(o, rd) + (ia - ip) * ok * dk;
    float c = ip * dot(o, o) + (ia - ip) * ok * ok;
    float e = c - b * b / a;
    if (e > 60.0) continue;
    // ∫₀^∞ exp(−½(a t² + 2 b t + c)) dt over the normalisation (2π)^(3/2) σa σp².
    float line = sqrt(1.5707963 / a) * exp(-0.5 * e) * erfcA(b / sqrt(2.0 * a));
    float norm = 0.0634936359 * sqrt(ia) * ip; // (2π)^(−3/2) / (σa σp²)
    sum += uLum[i] * (line * norm);
  }
  float S = dot(sum, vec3(0.2126, 0.7152, 0.0722));
  if (S <= 0.0) discard;
  gl_FragColor = vec4(display(sum / S, S), 1.0);
}
`;

const SHELL_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCentre;     // the explosion's centre from the camera, in units of the shock's radius
uniform float uUnitKm;    // the shock's radius, km
uniform float uPhot;      // the photosphere's radius, shock radii
uniform float uPhotS;     // its surface brightness S (flux per sr) at the centre of its disc
uniform vec3 uPhotCol;    // its colour (luminance 1)
uniform float uShellIn;   // the shocked shell's inner edge (the contact surface), shock radii
uniform float uShellS;    // the shell's S per shock radius of path
uniform vec3 uShellCol;
uniform float uCoreR;     // the ejecta inside, radius in shock radii
uniform float uCoreS;     // S per shock radius of path
uniform vec3 uCoreCol;
uniform float uSeed;
${FADE_GLSL}
varying vec3 vWorld;

// Hash without sine (Hoskins), stable in float32 on every GPU.
float hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Knots and filaments of the debris (a model): smooth noise of the place, in shock radii.
float clumps(vec3 p) {
  return 0.35 + 1.3 * noise3(p * 5.0 + uSeed) * noise3(p * 13.0 - uSeed);
}

// Length of the ray from the camera (t ≥ 0) inside the sphere of radius r about the origin, and where it enters.
vec2 inside(vec3 ro, vec3 rd, float r, out float tIn) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  tIn = 0.0;
  if (h <= 0.0) return vec2(0.0);
  h = sqrt(h);
  float t0 = max(-b - h, 0.0);
  float t1 = -b + h;
  tIn = t0;
  return vec2(max(t1 - t0, 0.0), t1);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vWorld);
  vec3 ro = -uCentre;
  vec3 col = vec3(0.0);
  float S = 0.0;
  // The photosphere: an opaque sphere, limb-darkened (I ∝ 0.4 + 0.6 μ), hiding what is behind it.
  float tP = 1e30;
  if (uPhot > 0.0 && uPhotS > 0.0) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - uPhot * uPhot;
    float h = b * b - c;
    if (h > 0.0 && -b - sqrt(h) > 0.0) {
      tP = -b - sqrt(h);
      vec3 n = normalize(ro + rd * tP);
      float mu = max(dot(n, -rd), 0.0);
      float s = uPhotS * (0.4 + 0.6 * mu) / 0.8;
      col += uPhotCol * s;
      S += s;
    }
  }
  // The shell between the contact surface and the shock (limb-brightened by the chords), and the ejecta within.
  if (uShellS > 0.0 || uCoreS > 0.0) {
    float tIn;
    vec2 outer = inside(ro, rd, 1.0, tIn);
    float tOut = tIn;
    float tI;
    vec2 inner = inside(ro, rd, uShellIn, tI);
    float shell = outer.x - inner.x;
    if (tP < 1e29) shell = max(0.0, min(tP, outer.y) - tOut - max(0.0, min(tP, inner.y) - tI));
    if (shell > 0.0) {
      vec3 p = ro + rd * (tOut + 0.5 * (outer.x - inner.x) * 0.5);
      float s = uShellS * shell * clumps(normalize(p));
      col += uShellCol * s;
      S += s;
    }
    float tC;
    vec2 core = inside(ro, rd, uCoreR, tC);
    if (core.x > 0.0 && uCoreS > 0.0) {
      vec3 p = ro + rd * (tC + 0.5 * core.x);
      float len = tP < 1e29 ? max(0.0, min(tP, core.y) - tC) : core.x;
      float s = uCoreS * len * clumps(p * 1.4 + 3.0);
      col += uCoreCol * s;
      S += s;
    }
  }
  if (S <= 0.0) discard;
  gl_FragColor = vec4(display(col / S, S), 1.0);
}
`;

const AURORA_VERT = SPHERE_VERT;

function fadeUniforms() {
  return { uScale: { value: 1 }, uFadeS: { value: new Vector2(1, 2) }, uOpacity: { value: 1 }, uExposure: { value: 1 } };
}

function additive(uniforms: Record<string, { value: unknown }>, fragmentShader: string): ShaderMaterial {
  return new ShaderMaterial({
    uniforms,
    vertexShader: SPHERE_VERT,
    fragmentShader,
    side: BackSide,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}

export function createBlobMaterial(): ShaderMaterial {
  return additive(
    {
      ...fadeUniforms(),
      uCentre: { value: new Vector3() },
      uUnitKm: { value: 1 },
      uCount: { value: 0 },
      uPos: { value: Array.from({ length: MAX_BLOBS }, () => new Vector3()) },
      uAxis: { value: Array.from({ length: MAX_BLOBS }, () => new Vector3(0, 1, 0)) },
      uSig: { value: Array.from({ length: MAX_BLOBS }, () => new Vector2(1, 1)) },
      uLum: { value: Array.from({ length: MAX_BLOBS }, () => new Vector3()) },
    },
    BLOB_FRAG,
  );
}

export function createShellMaterial(): ShaderMaterial {
  return additive(
    {
      ...fadeUniforms(),
      uCentre: { value: new Vector3() },
      uUnitKm: { value: 1 },
      uPhot: { value: 0 },
      uPhotS: { value: 0 },
      uPhotCol: { value: new Color(1, 1, 1) },
      uShellIn: { value: 0.85 },
      uShellS: { value: 0 },
      uShellCol: { value: new Color(1, 1, 1) },
      uCoreR: { value: 0.7 },
      uCoreS: { value: 0 },
      uCoreCol: { value: new Color(1, 1, 1) },
      uSeed: { value: 0 },
    },
    SHELL_FRAG,
  );
}

/** The oval's table for the shader: 48 bins of MLT (sim/phenomena/aurora.ts ovalTable), linear, wrapping round the clock. */
export function createOvalTexture(data: Float32Array): DataTexture {
  const t = new DataTexture(data, data.length / 4, 1, RGBAFormat, FloatType);
  t.magFilter = t.minFilter = LinearFilter;
  t.wrapS = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export function createAuroraMaterial(edges: DataTexture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uCentre: { value: new Vector3() },
      uRadiusKm: { value: 6371 },
      uScaleKm: { value: 1 },
      uDipole: { value: new Vector3(0, 1, 0) },
      uSun: { value: new Vector3(1, 0, 0) },
      uEdges: { value: edges },
      uKr: { value: 10 },
      uRedShare: { value: 0.2 },
      uFluxPerKr: { value: 73 },
      uEffRed: { value: 0.24 },
      uEffBlue: { value: 0.02 },
      uScale: { value: 1 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uGreen: { value: new Color(0.2, 1, 0.3) },
      uRed: { value: new Color(1, 0.1, 0.1) },
      uBlue: { value: new Color(0.3, 0.2, 1) },
    },
    vertexShader: AURORA_VERT,
    fragmentShader: auroraFrag,
    side: BackSide,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}
