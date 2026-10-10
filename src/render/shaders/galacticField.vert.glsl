// Field lines of the Milky Way's regular magnetic field (sim/galaxy/fieldLines.ts: the UF23 base model traced in
// frame G; scene/GalacticField.tsx). Each point of a line arrives in kiloparsecs (frame G) with the field there
// (µG, G's axes) and its length along the line (kpc, increasing in the direction of B). A diagram, not light.
//
// Where it is drawn: the Galaxy's light is added to the view by one full-screen pass under everything (render/
// galaxyLayer.ts), with no depth: its stars and glow are transparent emission, so nothing drawn over them is hidden
// by them, nor hides them. The lines are added the same way (with the constellation figures, before the bodies,
// which cover them), so their order with the Galaxy's light does not matter; what does is the dust. A line
// behind the disc is seen through the disc's dust, as the Galaxy's own far side is: each point is dimmed by the
// model's dust column between the camera and it (columnAV, as for the particles), down to DUST_FLOOR of its
// brightness, so the lines keep their place in depth with the Galaxy's light and still show behind the disc.
//
// Colour: the sense of the field. Azimuthal field running clockwise seen from the north (with the Galaxy's
// rotation) amber, counter-clockwise blue; where the field is mostly vertical (the X-field), lilac northwards and
// teal southwards. Brightness: the field's strength, on a log scale from 0.1 to 6 µG, cubed (the weak outer
// halo recedes). Each point fades out near
// the camera (uNear, kpc), and in flight it is aberrated like a star (no Doppler colour: the lines are a guide).
//
// Twins: galaxy.vert.glsl (columnAV), sim/galaxy/fieldView.ts (the colours, for the layer's card).
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>

attribute vec3 aField; // µG, frame G's axes
attribute float aArc;  // kpc along the line

uniform vec3 uCamG;       // camera in frame G, kpc
uniform mat3 uGToWorld;   // frame G axes → world axes
uniform float uOpacity;
uniform vec2 uNear;       // a point nearer than x kpc is not drawn, one beyond y in full
uniform vec2 uStrength;   // ln of the weakest and strongest field drawn apart, µG
uniform sampler2D uDust;  // the Galaxy model's face-on dust maps (shared with galaxy.vert.glsl)
uniform sampler2D uWarpMap;
uniform float uDustExtent;
uniform int uDustPieces;  // 0: no dust (the model's maps are not in)

varying vec3 vColor;
varying float vArc;

const float KPC_KM = 3.0856775814913673e16;
const int MAX_DUST_PIECES = 6;
const float DUST_EMPTY_KPC = 2.0;
/** The dimmest a line behind dust is drawn, as a share of its brightness. */
const float DUST_FLOOR = 0.12;

const vec3 CLOCKWISE = vec3(0.95, 0.58, 0.22);
const vec3 COUNTER = vec3(0.30, 0.58, 1.0);
const vec3 NORTH = vec3(0.74, 0.62, 1.0);
const vec3 SOUTH = vec3(0.32, 0.86, 0.78);

float erfA(float x) {
  float s = sign(x);
  float t = 1.0 / (1.0 + 0.3275911 * abs(x));
  float y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return s * y;
}

// V-band extinction (mag) from a to b (frame G, kpc), as galaxy.vert.glsl's columnAV.
float columnAV(vec3 a, vec3 b) {
  float n = float(uDustPieces);
  float L = length(b - a) / n;
  float tau = 0.0;
  for (int i = 0; i < MAX_DUST_PIECES; i++) {
    if (i >= uDustPieces) break;
    vec3 p0 = mix(a, b, float(i) / n);
    vec3 p1 = mix(a, b, float(i + 1) / n);
    if (min(p0.z, p1.z) > DUST_EMPTY_KPC || max(p0.z, p1.z) < -DUST_EMPTY_KPC) continue;
    vec3 q = p0.z * p1.z <= 0.0 && p0.z != p1.z ? mix(p0, p1, p0.z / (p0.z - p1.z)) : (abs(p0.z) < abs(p1.z) ? p0 : p1);
    if (abs(q.x) > uDustExtent || abs(q.y) > uDustExtent) continue;
    vec2 uv = (q.xy + uDustExtent) / (2.0 * uDustExtent);
    vec4 m = texture2D(uDust, uv);
    float zw = texture2D(uWarpMap, uv).r;
    float za = p0.z - zw;
    float zb = p1.z - zw;
    float dz = zb - za;
    if (abs(dz) < 1e-4 * L) {
      float s = 1.0 / cosh(za / m.y);
      tau += L * (m.x * s * s + m.z * exp(-za * za / (m.w * m.w)));
    } else {
      float disc = m.x * m.y * (tanh(zb / m.y) - tanh(za / m.y));
      float arms = m.z * m.w * 0.8862269 * (erfA(zb / m.w) - erfA(za / m.w));
      tau += (L / dz) * (disc + arms);
    }
  }
  return tau;
}

void main() {
  vec3 rel = position - uCamG;
  float d = max(length(rel), 1e-9);
  float lnD;
  vec3 dShip = relAberrate(normalize(uGToWorld * rel), lnD);
  // At its true distance (km): a segment passing beside or behind the camera is clipped as the straight line it is.
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * (dShip * (d * KPC_KM)), 1.0);
  #include <logdepthbuf_vertex>

  float B = length(aField);
  float r = length(position.xy);
  vec3 phiHat = r > 1e-6 ? vec3(-position.y, position.x, 0.0) / r : vec3(0.0);
  float bPhi = dot(aField, phiHat) / max(B, 1e-9);
  float bZ = aField.z / max(B, 1e-9);
  vec3 c = mix(bPhi < 0.0 ? CLOCKWISE : COUNTER, bZ > 0.0 ? NORTH : SOUTH, smoothstep(0.55, 0.85, abs(bZ)));
  float s = clamp((log(max(B, 1e-6)) - uStrength.x) / (uStrength.y - uStrength.x), 0.0, 1.0);
  float a = uOpacity * (0.04 + 0.96 * s * s * s) * smoothstep(uNear.x, uNear.y, d);
  if (uDustPieces > 0 && a > 0.0) a *= mix(DUST_FLOOR, 1.0, exp(-0.9210340 * columnAV(uCamG, position)));
  vColor = c * a;
  vArc = aArc;
}
