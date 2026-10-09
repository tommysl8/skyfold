// A star's close-up disc (sim/stars/closeup.ts says what each part is and where its numbers come from):
//  - the local temperature: the pole's times the gravity darkening of the vertex (von Zeipel), then the
//    convection cells (granules, and a red supergiant's giant cells), the starspots and a flare;
//  - its colour and brightness from Planck's law at three wavelengths (610, 550 and 465 nm), relative to the
//    star's mean temperature, whose blackbody colour uColor is (so the disc averages to the star's point colour);
//  - limb darkening per channel, I(μ)/I(1) = 1 − u (1 − μ), u from Claret & Bloemen (2011) for its type.
// Cells fade to their mean once smaller than a couple of pixels, so far views are exactly the plain disc.
#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uColor;        // blackbody colour at uTeff (luminance 1)
uniform float uIntensity;   // radiance at the disc's centre
uniform float uTeff;        // the star's mean effective temperature, K
uniform float uTPole;       // the pole's, K (uTeff for a star drawn round)
uniform vec3 uLimbU;        // limb darkening per channel (R, V, B)
uniform float uGranFreq;    // granules: cells per unit of direction (about sqrt(N / 4π))
uniform float uGranContrast;
uniform float uGiantFreq;   // giant cells (red supergiants), the same way
uniform float uGiantContrast;
uniform float uTime;        // the surface's clock, in turnovers (sped up as the card says)
uniform vec4 uSpots[6];     // direction (star frame) and angular radius
uniform int uSpotCount;
uniform float uSpotDT;      // a spot's temperature offset, K
uniform vec4 uFlare;        // direction (star frame) and strength 0–1
uniform float uLnExposureSurface;
uniform float uContrast;    // brightness contrast in stops: 1 from afar, more up close (Bodies.tsx says why)

varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vDir;
varying float vTemp;

// A hash without sines (D. Hoskins): stable for the cell indices of millions of granules.
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Cellular pattern at p: x = distance to the nearest cell's centre, y = to the next nearest, z = that cell's
// random number. Each centre wanders slowly about its lattice point, so cells grow, merge and fade over a turnover.
vec3 cells(vec3 p, float t) {
  vec3 ip = floor(p);
  vec3 fp = p - ip;
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int k = -1; k <= 1; k++)
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 h = hash33(ip + g);
        vec3 o = 0.5 + 0.38 * sin(6.2831853 * (h + t * (0.35 + 0.3 * h.yzx)));
        vec3 r = g + o - fp;
        float d = dot(r, r);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = h.x;
        } else if (d < f2) f2 = d;
      }
  return vec3(sqrt(f1), sqrt(f2), id);
}

// A convection pattern in −1 … 1: bright, rounded cell interiors (hot gas rising), narrow dark lanes between them
// (cool gas sinking), each cell brightening and fading on its own phase. The lattice is bent by a gentle warp so the
// cells are not polygons.
float convection(vec3 p, float t) {
  p += 0.22 * sin(p.yzx * 1.7 + 6.2831853 * 0.13 * t) + 0.11 * sin(p.zxy * 3.1 - 6.2831853 * 0.07 * t);
  vec3 c = cells(p, t);
  float edge = c.y - c.x;
  float lane = smoothstep(0.02, 0.7, edge);
  float dome = 1.0 - 0.5 * c.x * c.x;
  float life = 0.75 + 0.25 * sin(6.2831853 * (t * 0.8 + c.z));
  return clamp(2.0 * lane * dome * life - 1.0, -1.0, 1.0);
}

// How much of a pattern of `freq` cells per unit direction survives at this pixel's footprint: none once a cell is
// under about two pixels.
float resolved(float freq) {
  float perPixel = length(fwidth(vDir)) * freq;
  return 1.0 - smoothstep(0.2, 0.5, perPixel);
}

// Planck's law at λ (µm) relative to T0: B(λ, T) / B(λ, T0), with c₂ = 14,388 µm K.
vec3 planckRatio(float T, float T0) {
  const vec3 LAMBDA = vec3(0.61, 0.55, 0.465);
  vec3 x = 14388.0 / (LAMBDA * max(T, 500.0));
  vec3 x0 = 14388.0 / (LAMBDA * T0);
  return (exp(min(x0, 80.0)) - 1.0) / (exp(min(x, 80.0)) - 1.0);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(-vPosW);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float T = uTPole * vTemp;
  // Convection: temperature fluctuations of a few per cent.
  if (uGiantContrast > 0.0) {
    float a = resolved(uGiantFreq);
    if (a > 0.0) T *= 1.0 + uGiantContrast * a * convection(vDir * uGiantFreq, uTime);
  }
  if (uGranContrast > 0.0) {
    float a = resolved(uGranFreq);
    if (a > 0.0) T *= 1.0 + uGranContrast * a * convection(vDir * uGranFreq, uTime * 3.0 + 17.0);
  }
  // Starspots: a dark core and a lighter edge.
  for (int i = 0; i < 6; i++) {
    if (i >= uSpotCount) break;
    float ang = acos(clamp(dot(vDir, uSpots[i].xyz), -1.0, 1.0));
    float r = uSpots[i].w;
    float m = 1.0 - smoothstep(0.55 * r, r, ang);
    T += uSpotDT * m * (0.6 + 0.4 * (1.0 - smoothstep(0.0, 0.5 * r, ang)));
  }
  // A flare: a small patch heated towards 10,000 K.
  if (uFlare.w > 0.0) {
    float ang = acos(clamp(dot(vDir, uFlare.xyz), -1.0, 1.0));
    float m = exp(-ang * ang / 0.0016);
    T = mix(T, 10000.0, uFlare.w * m);
  }
  vec3 limb = 1.0 - uLimbU * (1.0 - mu);
  // Up close the tone curve would flatten a factor of two to a few per cent: the disc's own contrast is
  // stretched in stops (uContrast), so its limb, gravity darkening and cells read as they would to an eye adapted to it.
  vec3 rel = max(planckRatio(T, uTeff) * limb, vec3(1e-6));
  vec3 col = uColor * uIntensity * pow(rel, vec3(uContrast));
  // Up close, kept under the bloom's threshold (RenderPipeline.tsx, 1.15): a disc filling the view is a surface to
  // look at, not a glare; its brightest parts roll off smoothly instead of flaring.
  if (uContrast > 1.0) {
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    if (lum > 0.8) col *= (0.8 + 0.25 * tanh((lum - 0.8) / 0.25)) / lum;
  }
  if (uLnExposureSurface != 0.0) col *= exp(uLnExposureSurface);
  gl_FragColor = vec4(col, 1.0);
}
