/**
 * The material of a CME's front (scene/SpaceWeather.tsx; the model: sim/spaceWeather/). Part of the space-weather
 * chunk. Each front is one draw of a cap mesh, its vertices placed on the GPU by the same model the CPU uses
 * (sim/spaceWeather/dbm.ts): each ring of the cap is an element of the cone at an angle φ from the axis, started at the
 * cone's share of the apex's distance and speed and flown by the drag-based model's closed form. Four nested layers,
 * 1 % apart and fainter one behind the other, make a soft front with a sheath behind it.
 *
 * Added light with no depth writes. A thin shell of even brightness shows brightest where it is seen edge-on (the
 * line of sight runs longer through it), so it is drawn so, fainter as it spreads, and faded towards the cone's edge
 * and where the camera is near it for its size. Its brightness is not the real one: a CME is seen only in coronagraphs and heliospheric imagers, by
 * sunlight scattered off its electrons, millions of times fainter than drawn here.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, ShaderMaterial, Vector3 } from 'three';

/** Rings from the axis to the cone's edge, segments round it, and nested layers. */
const RINGS = 20;
const SEGMENTS = 48;
export const LAYERS = 4;

/** The cap: per vertex (φ as a share of the half-width, azimuth, layer), triangles within each layer. */
export function createFrontGeometry(): BufferGeometry {
  const n = (RINGS + 1) * (SEGMENTS + 1);
  const pos = new Float32Array(3 * n * LAYERS);
  const index: number[] = [];
  for (let k = 0; k < LAYERS; k++) {
    const base = k * n;
    for (let i = 0; i <= RINGS; i++)
      for (let j = 0; j <= SEGMENTS; j++) {
        const v = base + i * (SEGMENTS + 1) + j;
        pos[3 * v] = i / RINGS;
        pos[3 * v + 1] = (2 * Math.PI * j) / SEGMENTS;
        pos[3 * v + 2] = k;
      }
    for (let i = 0; i < RINGS; i++)
      for (let j = 0; j < SEGMENTS; j++) {
        const a = base + i * (SEGMENTS + 1) + j;
        const b = a + SEGMENTS + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uSun;       // the Sun's centre from the camera, km
uniform vec3 uAxis;      // the CME's axis and two directions square to it (world, unit)
uniform vec3 uE1;
uniform vec3 uE2;
uniform float uOmega;    // the cone's half-width, rad
uniform float uT;        // seconds since the apex passed 21.5 solar radii (negative before)
uniform float uR0;       // 21.5 solar radii, km
uniform float uV0;       // the apex's speed there, km/s
uniform float uGamma;    // drag parameter, km⁻¹
uniform float uW;        // the wind's speed, km/s
uniform float uRsun;     // km
varying vec3 vWorld;
varying vec3 vDir;
varying float vU;
varying float vLayer;
varying vec2 vCap;
varying float vR;
void main() {
  float u = position.x;
  float psi = position.y;
  float layer = position.z;
  float phi = u * uOmega;
  // The cone (sim/spaceWeather/dbm.ts coneShare): the element at φ starts at f r₀ with speed f v₀.
  float tw = tan(min(uOmega, 1.553));
  float s = sin(phi);
  float f = (cos(phi) + sqrt(max(0.0, tw * tw - s * s))) / (1.0 + tw);
  float r0 = uR0 * f;
  float v0 = uV0 * f;
  float r;
  if (uT < 0.0) {
    r = max(uRsun, r0 + v0 * uT);
  } else {
    float dv = v0 - uW;
    float sg = dv >= 0.0 ? 1.0 : -1.0;
    r = (sg / uGamma) * log(1.0 + sg * uGamma * dv * uT) + uW * uT + r0;
  }
  // The nested layers: the sheath behind the front.
  r *= 1.0 - 0.01 * layer;
  vec3 dir = cos(phi) * uAxis + sin(phi) * (cos(psi) * uE1 + sin(psi) * uE2);
  vWorld = uSun + dir * r;
  vDir = dir;
  vR = r;
  vU = u;
  vLayer = layer;
  vCap = vec2(u * cos(psi), u * sin(psi));
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uOpacity;
uniform float uGain;     // the front's brightness at its rim
uniform float uSeed;
uniform vec3 uColour;
varying vec3 vWorld;
varying vec3 vDir;
varying float vU;
varying float vLayer;
varying vec2 vCap;
varying float vR;
uniform float uFadeKm;   // the distance (km) within which the front shows at full brightness

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  #include <logdepthbuf_fragment>
  float d = length(vWorld);
  vec3 view = vWorld / max(d, 1.0);
  // Edge-on brightening of a thin shell (the line of sight's path through it), held finite: the front's rim shows, its
  // face hardly at all.
  float edgeOn = min(1.0 / max(abs(dot(normalize(vDir), view)), 0.15), 6.0);
  // Fainter as it spreads: the sunlight it scatters falls off as 1/r² and its plasma thins (held within 0.15–1 here).
  float spread = clamp(uFadeKm / vR, 0.15, 1.0);
  // Faded to the cone's edge, softly mottled, and the layers behind the front fainter.
  float edge = 1.0 - smoothstep(0.35, 1.0, vU);
  float mottle = 0.8 + 0.4 * noise(vCap * 3.0 + 3.0 * vLayer);
  float layer = 1.0 - vLayer / float(${LAYERS});
  // Faded where the camera is near the front for its size: from close by a real front, a sheath some 0.1 au thick at
  // Earth, would be all round, not a surface (and at a planet's scale it would only be a wall across the view).
  float near = smoothstep(0.25, 0.6, d / max(vR, 1.0));
  float a = uOpacity * edge * mottle * layer * near * edgeOn * spread * uGain;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColour * a, 1.0);
}
`;

/** The front's brightness (of a layer seen face-on within 0.25 au of the Sun; up to 6 times that edge-on). */
export const FRONT_GAIN = 0.003;

/** Sunlight scattered off electrons: the Sun's own colour, pale. */
export const FRONT_COLOUR = new Color(1.0, 0.95, 0.88);

export function createFrontMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSun: { value: new Vector3() },
      uAxis: { value: new Vector3(1, 0, 0) },
      uE1: { value: new Vector3(0, 1, 0) },
      uE2: { value: new Vector3(0, 0, 1) },
      uOmega: { value: 0.7 },
      uT: { value: 0 },
      uR0: { value: 1 },
      uV0: { value: 1000 },
      uGamma: { value: 2e-8 },
      uW: { value: 400 },
      uRsun: { value: 695_700 },
      uOpacity: { value: 0 },
      uGain: { value: FRONT_GAIN },
      uFadeKm: { value: 0.25 * 149_597_870.7 },
      uSeed: { value: 0 },
      uColour: { value: FRONT_COLOUR.clone() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    // Seen from inside the cone as well as from outside.
    side: DoubleSide,
  });
}
