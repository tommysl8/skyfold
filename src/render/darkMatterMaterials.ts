/**
 * The dark-matter layer's materials (scene/DarkMatter.tsx; the models: sim/galaxy/darkMatter.ts and
 * sim/cosmos/bulletCluster.ts). Part of the layer's chunk. Dark matter gives out no light, so none of this is light:
 * each is a diagnostic picture of where mass is, added faintly over the view at a fixed display level (not the law of
 * the sky the light of stars and nebulae follows), with no depth writes.
 *
 *  - The halo: a bounding sphere about the Galaxy's centre (its back faces, so the camera may be inside), each pixel
 *    the halo's column density along its ray from the camera to the sphere's edge, shown on a logarithmic scale in a
 *    cool blue. The halo is spherical, so the column depends only on the ray's angle from the centre: the CPU works it
 *    out (sim/galaxy/darkMatter.ts haloColumn) at 256 angles whenever the camera's distance changes, and each pixel
 *    reads that table: a dozen operations and one texture fetch.
 *  - The tracers: points and their spokes' lines, coloured by which mass they go round in.
 *  - The Bullet Cluster: a card on the sky, Chandra's X-ray picture of the gas in pink and the lensing mass model in
 *    blue with the paper's contours (κ = 0.16, then every 0.07).
 */
import { AdditiveBlending, BackSide, Color, DoubleSide, ShaderMaterial, type Texture, type Vector2, Vector3, type Vector4 } from 'three';
import { DARK_COLOURS } from '../sim/galaxy/darkLayer';

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

const HALO_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCentreDir;   // towards the halo's centre from the camera (unit)
uniform sampler2D uTable;  // the display value against √sin(θ/2), θ the angle from the centre (fillHaloTable)
uniform float uGain;
uniform float uOpacity;
uniform vec3 uColour;
varying vec3 vWorld;

// Hash without sine (Hoskins), for a little dither against banding in so faint a gradient.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vWorld);
  // sin(θ/2) = |rd − c| / 2, exact in float32 near the centre, where 1 − cos θ is not.
  float x = sqrt(0.5 * length(rd - uCentreDir));
  float v = texture2D(uTable, vec2(x, 0.5)).r;
  v += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(uColour * max(v, 0.0) * uGain * uOpacity, 1.0);
}
`;

/** Samples in the halo's table (fillHaloTable). */
export const HALO_TABLE_SIZE = 256;

/**
 * The halo's display value along every ray from the camera, a function of the ray's angle θ from the direction of the
 * centre only (the halo is spherical): v = ln(1 + Σ/Σ0) · norm, Σ the column density (M☉/pc²) that `column` gives
 * (b, s0, s1 in kpc: sim/galaxy/darkMatter.ts haloColumn), sampled at √sin(θ/2) = i / (n − 1) so that the cusp at the
 * centre is resolved. `d` is the camera's distance from the centre and `radius` where the halo is cut off, kpc.
 */
export function fillHaloTable(out: Float32Array, d: number, radius: number, column: (b: number, s0: number, s1: number) => number, sigma0: number, norm: number): void {
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const q = i / (n - 1);
    const th = 2 * Math.asin(Math.min(1, q * q));
    const b = d * Math.sin(th);
    const tc = d * Math.cos(th);
    const h2 = radius * radius - b * b;
    if (h2 <= 0) {
      out[i] = 0;
      continue;
    }
    const L = Math.sqrt(h2);
    const s0 = Math.max(-tc, -L);
    out[i] = s0 >= L ? 0 : Math.log1p((column(b, s0, L) * 1e-6) / sigma0) * norm;
  }
}

export function createHaloMaterial(table: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uCentreDir: { value: new Vector3(0, 0, 1) },
      uTable: { value: table },
      uGain: { value: 0.05 },
      uOpacity: { value: 0 },
      uColour: { value: new Color(...DARK_COLOURS.halo) },
    },
    vertexShader: SPHERE_VERT,
    fragmentShader: HALO_FRAG,
    side: BackSide,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}

const POINT_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uSize;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
  #include <logdepthbuf_vertex>
}
`;

const POINT_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColour;
uniform float uOpacity;
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float a = (1.0 - r2) * (1.0 - r2);
  gl_FragColor = vec4(uColour * a * uOpacity, 1.0);
}
`;

const LINE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const LINE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColour;
uniform float uOpacity;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(uColour * uOpacity, 1.0);
}
`;

/** The tracers' points (a soft dot of uSize px) and their spokes' lines. */
export function createTracerMaterials(colour: Color): { points: ShaderMaterial; lines: ShaderMaterial } {
  const common = { blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: true } as const;
  return {
    points: new ShaderMaterial({
      uniforms: { uColour: { value: colour.clone() }, uOpacity: { value: 0 }, uSize: { value: 4 } },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      ...common,
    }),
    lines: new ShaderMaterial({
      uniforms: { uColour: { value: colour.clone() }, uOpacity: { value: 0 } },
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      ...common,
    }),
  };
}

const CARD_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const BULLET_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uXray;
uniform vec2 uCentre;    // the card's centre, arcsec east and north of the cluster's catalogued place
uniform vec2 uSize;      // its width and height, arcsec (the X-ray image's)
uniform vec4 uPeakA;     // east, north (arcsec), κ at the peak, core radius (arcsec)
uniform vec4 uPeakB;
uniform vec2 uContours;  // the first contour and the step between them, κ
uniform vec3 uGasColour;
uniform vec3 uMassColour;
uniform float uGasGain;
uniform float uMassGain;
uniform float uOpacity;
varying vec2 vUv;

float peak(vec2 sky, vec4 p) {
  float r = length(sky - p.xy) / p.w;
  return p.z / sqrt(1.0 + r * r);
}

void main() {
  #include <logdepthbuf_fragment>
  // East is to the left (u = 0), north up.
  vec2 sky = uCentre + vec2((0.5 - vUv.x) * uSize.x, (vUv.y - 0.5) * uSize.y);
  // The card's edges fade, so it has none.
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = smoothstep(0.0, 0.08, min(e.x, e.y));
  vec3 x = texture2D(uXray, vUv).rgb;
  float gas = max(0.0, (x.r + x.g + x.b) / 3.0 - 0.03);
  float k = peak(sky, uPeakA) + peak(sky, uPeakB);
  float fill = smoothstep(0.08, 0.6, k);
  float f = (k - uContours.x) / uContours.y;
  float line = k >= uContours.x - 0.5 * uContours.y * fwidth(f) ? 1.0 - smoothstep(0.0, 1.2 * fwidth(f), abs(fract(f + 0.5) - 0.5)) : 0.0;
  vec3 c = uGasColour * gas * uGasGain + uMassColour * (fill * uMassGain + line * uMassGain * 0.9);
  gl_FragColor = vec4(c * edge * uOpacity, 1.0);
}
`;

export interface BulletCardSpec {
  centre: Vector2;
  size: Vector2;
  peaks: [Vector4, Vector4];
  contours: Vector2;
}

export function createBulletMaterial(xray: Texture, spec: BulletCardSpec): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uXray: { value: xray },
      uCentre: { value: spec.centre },
      uSize: { value: spec.size },
      uPeakA: { value: spec.peaks[0] },
      uPeakB: { value: spec.peaks[1] },
      uContours: { value: spec.contours },
      uGasColour: { value: new Color(...DARK_COLOURS.gas) },
      uMassColour: { value: new Color(...DARK_COLOURS.mass) },
      uGasGain: { value: 0.35 },
      uMassGain: { value: 0.12 },
      uOpacity: { value: 0 },
    },
    vertexShader: CARD_VERT,
    fragmentShader: BULLET_FRAG,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}
