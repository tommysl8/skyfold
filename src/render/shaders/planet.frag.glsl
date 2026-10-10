#include <common>
#include <logdepthbuf_pars_fragment>

uniform sampler2D uMap;
uniform float uHasMap;
uniform sampler2D uNight;
uniform float uHasNight;
uniform sampler2D uClouds;
uniform float uHasClouds;
uniform vec3 uBaseColor;
uniform float uBanded;       // procedural fallback: gas-giant bands
uniform vec3 uSunRel;        // Sun position relative to the camera (world axes), km
uniform float uSunIntensity;
uniform vec3 uSunColor;
uniform vec3 uAtmoColor;
uniform float uAtmoStrength;
uniform float uLonOffset;    // texture longitude offset (fraction of a turn)
uniform float uFillBlack;    // fill unimaged (black) map regions procedurally (Pluto)
uniform float uAmbient;
uniform float uFlat;         // plain colour, no procedural noise (spacecraft parts)
uniform vec3 uMapTint;       // multiplies the map (a greyscale map tinted with the body's hue)
uniform float uMapGrey;      // the map is one channel of sRGB values (decoded here)
uniform float uMapMix;       // how much of the map shows over the flat base colour (Titan under its haze)

// Saturn's rings casting a shadow on the planet
uniform float uRingShadow;
uniform sampler2D uRingMap;
uniform vec3 uRingNormalW;   // ring-plane normal (world axes)
uniform vec3 uCenterW;       // planet centre relative to the camera
uniform float uRingInner;    // km (displayed scale)
uniform float uRingOuter;
// Eclipses: up to four bodies that can stand between this one and the Sun (its planet, its large moons; scene/
// Bodies.tsx eclipsersOf), each a sphere: centre relative to the camera (km) and radius (km). Each point sees the
// share of the Sun's disc they leave uncovered (umbra, penumbra, antumbra). Light bent into the umbra by an
// eclipser's atmosphere (Earth's: the red Moon of a lunar eclipse) is uOccluderGlow, in units of full sunlight.
uniform int uOccluderCount;
uniform vec4 uOccluders[4];
uniform vec3 uOccluderGlow[4];
uniform float uSunRadiusKm;
// True radius over drawn radius: the shadows are worked out on the true-scale body when it is drawn enlarged.
uniform float uTrueScale;
// Near a black hole the classical view has an exposure (render/materials.ts surfaceUniforms): 0 elsewhere.
uniform float uLnExposureSurface;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// sRGB transfer function to linear (three.js decodes sRGB textures in hardware, but has no
// single-channel sRGB format).
vec3 srgbDecode(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

// Area of the overlap of two discs of radii r1, r2 whose centres are d apart (all angles, rad).
float discOverlap(float r1, float r2, float d) {
  if (d >= r1 + r2) return 0.0;
  float rmin = min(r1, r2);
  if (d <= abs(r1 - r2)) return PI * rmin * rmin;
  float a1 = r1 * r1 * acos(clamp((d * d + r1 * r1 - r2 * r2) / (2.0 * d * r1), -1.0, 1.0));
  float a2 = r2 * r2 * acos(clamp((d * d + r2 * r2 - r1 * r1) / (2.0 * d * r2), -1.0, 1.0));
  float k = (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2);
  return a1 + a2 - 0.5 * sqrt(max(k, 0.0));
}

// The light reaching the true-scale surface point p (camera-relative, km), as a fraction of full sunlight: the share
// of the Sun's disc each eclipser leaves uncovered, and the light refracted into its shadow.
vec3 eclipseLight(vec3 p) {
  vec3 toSun = uSunRel - p;
  float dSun = length(toSun);
  vec3 s = toSun / dSun;
  float rs = asin(min(uSunRadiusKm / dSun, 1.0));
  float sunArea = PI * rs * rs;
  vec3 light = vec3(1.0);
  for (int i = 0; i < 4; i++) {
    if (i >= uOccluderCount) break;
    vec3 toO = uOccluders[i].xyz - p;
    float dO = length(toO);
    if (dO >= dSun || dot(toO, s) <= 0.0) continue;
    vec3 o = toO / dO;
    float ro = asin(min(uOccluders[i].w / dO, 1.0));
    // The angle between the two centres, from its sine and cosine (acos loses it near 0 in float32).
    float d = atan(length(cross(s, o)), dot(s, o));
    if (d >= rs + ro) continue;
    float uncovered = 1.0 - discOverlap(rs, ro, d) / sunArea;
    light *= uncovered;
    // The bent light is brightest near the shadow's edge (light grazing the atmosphere's top bends least).
    float depth = clamp(d / max(ro - rs, 1e-6), 0.0, 1.0);
    light += uOccluderGlow[i] * (1.0 - uncovered) * mix(0.55, 1.0, depth * depth);
  }
  return light;
}

vec3 proceduralSurface(vec2 uv) {
  float lat = (uv.y - 0.5) * PI;
  if (uBanded > 0.5) {
    float bands = sin(lat * 14.0 + noise(uv * vec2(8.0, 40.0)) * 1.5) * 0.5 + 0.5;
    return uBaseColor * (0.82 + 0.28 * bands);
  }
  float n = noise(uv * vec2(64.0, 32.0)) * 0.6 + noise(uv * vec2(256.0, 128.0)) * 0.4;
  return uBaseColor * (0.8 + 0.35 * n);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(-vPosW);
  vec3 L = normalize(uSunRel - vPosW);
  float NdL = dot(N, L);

  vec2 uv = vec2(fract(vUv.x + uLonOffset), vUv.y);
  vec3 albedo = uFlat > 0.5 ? uBaseColor : proceduralSurface(uv);
  if (uHasMap > 0.5) {
    vec4 texel = texture2D(uMap, uv);
    vec3 tex = (uMapGrey > 0.5 ? srgbDecode(texel.rrr) : texel.rgb) * uMapTint;
    if (uFillBlack > 0.5) {
      float lum = dot(tex, vec3(0.2126, 0.7152, 0.0722));
      albedo = mix(albedo, tex, smoothstep(0.004, 0.03, lum));
    } else {
      albedo = mix(uBaseColor, tex, uMapMix);
    }
  }

  // Lambert with a slightly softened terminator.
  float diffuse = smoothstep(-0.02, 0.12, NdL) * max(NdL, 0.0) + 0.002 * smoothstep(-0.1, 0.1, NdL);

  // Ring shadow: does the ray toward the Sun cross the ring plane within the rings?
  float shadow = 1.0;
  vec3 shadow3 = vec3(1.0);
  if (uRingShadow > 0.5) {
    float denom = dot(L, uRingNormalW);
    if (abs(denom) > 1e-4) {
      float t = dot(uCenterW - vPosW, uRingNormalW) / denom;
      if (t > 0.0) {
        vec3 hit = vPosW + L * t;
        float r = length(hit - uCenterW);
        float u = (r - uRingInner) / (uRingOuter - uRingInner);
        if (u > 0.0 && u < 1.0) shadow = 1.0 - 0.92 * texture2D(uRingMap, vec2(u, 0.5)).a;
      }
    }
  }

  if (uOccluderCount > 0) shadow3 = eclipseLight(uCenterW + (vPosW - uCenterW) * uTrueScale);
  vec3 col = albedo * uSunColor * uSunIntensity * diffuse * shadow * shadow3;

  if (uHasClouds > 0.5) {
    float cloud = texture2D(uClouds, uv).r;
    col = mix(col, uSunColor * uSunIntensity * diffuse * shadow * shadow3 * 0.95, cloud * 0.85);
    if (uHasNight > 0.5) {
      vec3 lights = texture2D(uNight, uv).rgb;
      col += lights * (1.0 - cloud) * smoothstep(0.05, -0.18, NdL) * 1.4;
    }
  } else if (uHasNight > 0.5) {
    col += texture2D(uNight, uv).rgb * smoothstep(0.05, -0.18, NdL) * 1.4;
  }

  // Atmospheric rim on the lit side.
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uAtmoColor * uAtmoStrength * rim * smoothstep(-0.25, 0.35, NdL) * uSunIntensity * shadow3;

  col += albedo * uAmbient;
  if (uLnExposureSurface != 0.0) col *= exp(uLnExposureSurface);
  gl_FragColor = vec4(col, 1.0);
}
