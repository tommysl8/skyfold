// Chunk `lightspeed_localdust`: what the neighbourhood's dust does to the light behind it, read from the ray march's
// targets (shaders/localDust.frag.glsl, render/dustLayer.ts) by the sky map (milkyway.frag.glsl, remap.frag.glsl), the
// Galaxy layer's display law (galaxyComposite.glsl: its plain and lensed composites) and the stars (stars.vert.glsl).
//
// What: each reader takes the march's numbers at its own pixel (the view's targets are the view's size: uv is the
// pixel's place on the screen) and applies them to its light before its display law, in linear light:
//   the sky map is the sky from the Sun with the Sun's dust in it: it is dimmed by A_sky, the camera's column less
//     the Sun's in the same direction (so the clouds move with parallax rather than being drawn twice);
//   the Galaxy model's light by A_model (the map's dust in place of the model's own smooth dust inside the map);
//   a star by the camera's column to it less the Sun's column to it (its catalogue magnitude is as seen from Earth,
//     through the Sun's dust): held to uLocalDustOn.w (mag) of brightening at most;
// and the light the dust scatters (a share of the mean starlight J) is added to the sky map and to the model's light,
// in the colour of J. Reddening: A_R : A_G : A_B = 0.89 : 1 : 1.23 (sim/dust/volume.ts REDDENING_RGB).
//
// Rules: declares only its own uniforms (render/localDustUniforms.ts, shared by reference with every reader); uses no
// gl_FragCoord (a vertex shader includes it): fragment readers pass gl_FragCoord.xy * uLocalDustOn.yz.
//
// Cost: two texture reads a pixel for a diffuse reader, four a star, and none while uLocalDustOn.x is 0 (near the
// Sun, beyond the neighbourhood, or before the map has loaded).
//
// Twins: sim/dust/volume.ts (cameraKnots, columnAtKnots, SUN_KNOTS_PC), sim/dust/light.ts.
#ifndef LIGHTSPEED_LOCAL_DUST
#define LIGHTSPEED_LOCAL_DUST
uniform sampler2D uLocalDust0;     // the view: A_V at the four camera knots
uniform sampler2D uLocalDust1;     // the view: t0, t1 (pc), the scattered share of J
uniform sampler2D uLocalDust2;     // the view: A_sky, A_model
uniform sampler2D uLocalDustSun0;  // the Sun's sky: A_V at its first four knots
uniform sampler2D uLocalDustSun1;  // and its last four
uniform vec4 uLocalDustOn;         // x: strength (0 to 1); y, z: 1 / the view's width and height (device px); w: a star's most brightening (mag)
uniform vec4 uLocalDustLight;      // x: J in the sky map's units (p); y: J in the Galaxy layer's (flux in a faint star's image)
uniform vec3 uLocalDustRgb;        // the colour of J (luminance 1)
uniform vec4 uLocalDustKnots0;     // the Sun's knots, pc (SUN_KNOTS_PC)
uniform vec4 uLocalDustKnots1;
uniform mat3 uLocalDustEclToGal;  // J2000 ecliptic → heliocentric galactic

const vec3 LOCAL_DUST_REDDENING = vec3(0.89, 1.0, 1.23);
const float LOCAL_DUST_START_PC = 69.0;

vec3 localDustTransmission(float aV) {
  return exp(-0.9210340371976184 * aV * LOCAL_DUST_REDDENING);
}

// The sky map's light p (and the light over the eye's scale) at the screen place uv.
void localDustSky(vec2 uv, inout vec3 p, inout vec3 eye) {
  if (uLocalDustOn.x <= 0.0) return;
  vec4 v1 = texture2D(uLocalDust1, uv);
  vec4 v2 = texture2D(uLocalDust2, uv);
  vec3 tr = localDustTransmission(v2.x * uLocalDustOn.x);
  vec3 s = (v1.z * uLocalDustOn.x * uLocalDustLight.x) * uLocalDustRgb;
  p = p * tr + s;
  eye = eye * tr + s;
}

// The Galaxy layer's summed light t (the model's share of its luminance in a) at the screen place uv: the scattered
// light is counted as the model's, so that the handover from the sky map shows it once.
vec4 localDustModel(vec2 uv, vec4 t) {
  if (uLocalDustOn.x <= 0.0) return t;
  vec4 v1 = texture2D(uLocalDust1, uv);
  vec4 v2 = texture2D(uLocalDust2, uv);
  vec3 tr = localDustTransmission(v2.y * uLocalDustOn.x);
  float s = v1.z * uLocalDustOn.x * uLocalDustLight.y;
  return vec4(t.rgb * tr + s * uLocalDustRgb, t.a * tr.g + s);
}

// A column (mag) at distance d from eight knots after a start where it is 0: linear between them, the last beyond.
float localDustColumn(float d, float start, float k[8], float a[8]) {
  if (d <= start) return 0.0;
  float t0 = start;
  float a0 = 0.0;
  for (int i = 0; i < 8; i++) {
    if (d <= k[i]) return mix(a0, a[i], (d - t0) / max(k[i] - t0, 1e-6));
    t0 = k[i];
    a0 = a[i];
  }
  return a0;
}

// The change (mag, V) in a star's brightness: the camera's column to it (it is dCamPc away, at the screen place uv)
// less the Sun's column to it (sunGal: its heliocentric galactic place, pc).
float localDustStar(vec2 uv, float dCamPc, vec3 sunGal) {
  float k[8];
  float a[8];
  vec4 c = texture2D(uLocalDust0, uv);
  vec4 t = texture2D(uLocalDust1, uv);
  float aCam = 0.0;
  if (t.y > t.x && dCamPc > t.x) {
    // sim/dust/volume.ts cameraKnots(t0, t1).
    float k0 = max(t.x, 10.0);
    float r = pow(t.y / max(k0, 1e-6), 0.25);
    k[0] = k0 * r;
    k[1] = k[0] * r;
    k[2] = k[1] * r;
    k[3] = t.y;
    a[0] = c.x;
    a[1] = c.y;
    a[2] = c.z;
    a[3] = c.w;
    for (int i = 4; i < 8; i++) {
      k[i] = 1e9;
      a[i] = c.w;
    }
    aCam = localDustColumn(dCamPc, t.x, k, a);
  }
  float dSun = length(sunGal);
  float aSun = 0.0;
  if (dSun > LOCAL_DUST_START_PC) {
    vec3 e = sunGal / dSun;
    vec2 suv = vec2(fract(atan(e.y, e.x) / 6.283185307179586), 0.5 + asin(clamp(e.z, -1.0, 1.0)) / 3.141592653589793);
    vec4 s0 = texture2D(uLocalDustSun0, suv);
    vec4 s1 = texture2D(uLocalDustSun1, suv);
    k[0] = uLocalDustKnots0.x;
    k[1] = uLocalDustKnots0.y;
    k[2] = uLocalDustKnots0.z;
    k[3] = uLocalDustKnots0.w;
    k[4] = uLocalDustKnots1.x;
    k[5] = uLocalDustKnots1.y;
    k[6] = uLocalDustKnots1.z;
    k[7] = uLocalDustKnots1.w;
    a[0] = s0.x;
    a[1] = s0.y;
    a[2] = s0.z;
    a[3] = s0.w;
    a[4] = s1.x;
    a[5] = s1.y;
    a[6] = s1.z;
    a[7] = s1.w;
    aSun = localDustColumn(dSun, LOCAL_DUST_START_PC, k, a);
  }
  return clamp((aCam - aSun) * uLocalDustOn.x, -uLocalDustOn.w, 30.0);
}
#endif
