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
 *    marching: one instanced draw, each blob on the pixels of its own 5σ ellipsoid, about 30 operations a pixel.
 *  - A supernova (sim/phenomena/supernovae.ts): its fireball, an opaque sphere of the photosphere's radius as bright as
 *    its light curve; and its debris, a shell behind the forward shock and the ejecta inside it, their light integrated
 *    exactly along the ray (chords through spheres), mottled by noise at the shell.
 *  - The aurora: shaders/aurora.frag.glsl.
 */
import {
  AdditiveBlending,
  BackSide,
  type BufferGeometry,
  Color,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
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

const BLOB_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aCentre; // the blob's centre from the camera, units (uUnitKm km)
attribute vec3 aAxis;   // its long axis (unit)
attribute vec2 aSig;    // σ along the axis, σ across, units
attribute vec3 aLum;    // its colour (luminance 1) × its luminosity, as flux × units² (V = 0 stars)
uniform float uUnitKm;
varying vec3 vWorld;
varying vec3 vCentre;
varying vec3 vAxis;
varying vec2 vSig;
varying vec3 vLum;
void main() {
  // The unit sphere stretched to the blob's 5σ ellipsoid along its axis (its light there is under 0.2 % of its peak once shown: the display's square root lifts faint edges).
  vec3 k = aAxis;
  vec3 a = normalize(cross(k, abs(k.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(k, a);
  vec3 p = aCentre + 5.0 * (k * position.y * aSig.x + a * position.x * aSig.y + b * position.z * aSig.y);
  vWorld = p * uUnitKm;
  vCentre = aCentre;
  vAxis = aAxis;
  vSig = aSig;
  vLum = aLum;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const BLOB_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${FADE_GLSL}
varying vec3 vWorld;
varying vec3 vCentre;
varying vec3 vAxis;
varying vec2 vSig;
varying vec3 vLum;

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
  vec3 o = -vCentre;
  vec3 k = vAxis;
  float ia = 1.0 / (vSig.x * vSig.x);
  float ip = 1.0 / (vSig.y * vSig.y);
  float dk = dot(rd, k);
  float ok = dot(o, k);
  // The quadratic form xᵀAx along the ray o + t d, A = ip I + (ia − ip) k kᵀ.
  float qa = ip + (ia - ip) * dk * dk;
  float qb = ip * dot(o, rd) + (ia - ip) * ok * dk;
  float qc = ip * dot(o, o) + (ia - ip) * ok * ok;
  float e = qc - qb * qb / qa;
  if (e > 50.0) discard;
  // ∫₀^∞ exp(−½(a t² + 2 b t + c)) dt over the normalisation (2π)^(3/2) σa σp².
  float line = sqrt(1.5707963 / qa) * exp(-0.5 * e) * erfcA(qb / sqrt(2.0 * qa));
  float norm = 0.0634936359 * sqrt(ia) * ip; // (2π)^(−3/2) / (σa σp²)
  vec3 c = vLum * (line * norm);
  float S = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (S <= 0.0) discard;
  gl_FragColor = vec4(display(c / S, S), 1.0);
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

/**
 * A set of blobs: one instanced draw of ellipsoids, each its blob's 5σ, so each pixel works out only the blobs whose
 * light reaches it. The display law is applied per blob (where two overlap, their luminances add after the square root,
 * up to √2 brighter than one cloud of their summed light would be: only where knots overlap). Fill `pos` (from the
 * origin, units), `axis`, `sig`, `lum` and `count`, set `unitKm` and `centre` (the origin from the camera, units), then
 * sync(). The material's uniforms are the law's (uScale, uFadeS, uOpacity, uExposure).
 */
export class BlobSet {
  readonly pos = Array.from({ length: MAX_BLOBS }, () => new Vector3());
  readonly axis = Array.from({ length: MAX_BLOBS }, () => new Vector3(0, 1, 0));
  readonly sig = Array.from({ length: MAX_BLOBS }, () => new Vector2(1, 1));
  readonly lum = Array.from({ length: MAX_BLOBS }, () => new Vector3());
  count = 0;
  unitKm = 1;
  readonly centre = new Vector3();
  readonly material: ShaderMaterial;
  readonly mesh: Mesh;
  private readonly geometry: InstancedBufferGeometry;
  private readonly aCentre = new InstancedBufferAttribute(new Float32Array(3 * MAX_BLOBS), 3).setUsage(DynamicDrawUsage);
  private readonly aAxis = new InstancedBufferAttribute(new Float32Array(3 * MAX_BLOBS), 3).setUsage(DynamicDrawUsage);
  private readonly aSig = new InstancedBufferAttribute(new Float32Array(2 * MAX_BLOBS), 2).setUsage(DynamicDrawUsage);
  private readonly aLum = new InstancedBufferAttribute(new Float32Array(3 * MAX_BLOBS), 3).setUsage(DynamicDrawUsage);

  constructor(sphere: BufferGeometry) {
    this.geometry = new InstancedBufferGeometry();
    this.geometry.index = sphere.index;
    this.geometry.setAttribute('position', sphere.getAttribute('position'));
    this.geometry.setAttribute('aCentre', this.aCentre);
    this.geometry.setAttribute('aAxis', this.aAxis);
    this.geometry.setAttribute('aSig', this.aSig);
    this.geometry.setAttribute('aLum', this.aLum);
    this.geometry.instanceCount = 0;
    this.material = new ShaderMaterial({
      uniforms: { ...fadeUniforms(), uUnitKm: { value: 1 } },
      vertexShader: BLOB_VERT,
      fragmentShader: BLOB_FRAG,
      side: BackSide,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  /** Upload this frame's blobs. */
  sync(): void {
    const n = Math.min(this.count, MAX_BLOBS);
    const C = this.aCentre.array as Float32Array;
    const A = this.aAxis.array as Float32Array;
    const S = this.aSig.array as Float32Array;
    const L = this.aLum.array as Float32Array;
    for (let i = 0; i < n; i++) {
      C[3 * i] = this.centre.x + this.pos[i].x;
      C[3 * i + 1] = this.centre.y + this.pos[i].y;
      C[3 * i + 2] = this.centre.z + this.pos[i].z;
      A[3 * i] = this.axis[i].x;
      A[3 * i + 1] = this.axis[i].y;
      A[3 * i + 2] = this.axis[i].z;
      S[2 * i] = this.sig[i].x;
      S[2 * i + 1] = this.sig[i].y;
      L[3 * i] = this.lum[i].x;
      L[3 * i + 1] = this.lum[i].y;
      L[3 * i + 2] = this.lum[i].z;
    }
    this.geometry.instanceCount = n;
    this.material.uniforms.uUnitKm.value = this.unitKm;
    this.aCentre.needsUpdate = this.aAxis.needsUpdate = this.aSig.needsUpdate = this.aLum.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
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
