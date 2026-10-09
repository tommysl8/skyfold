// A star's close-up disc (sim/stars/closeup.ts says what each part is and where its numbers come from):
//  - the local temperature: the pole's times the gravity darkening of the vertex (von Zeipel), then the
//    convection cells (granules, and a red supergiant's giant cells), the starspots and a flare;
//  - its colour and brightness from Planck's law at three wavelengths (610, 550 and 465 nm), relative to the
//    star's mean temperature, whose blackbody colour uColor is (so the disc averages to the star's point colour);
//  - limb darkening per channel, I(μ)/I(1) = 1 − u (1 − μ), u from Claret & Bloemen (2011) for its type.
// The cells come baked in a cube map (starCells.frag.glsl) and fade to their mean once smaller than a couple of
// pixels, so far views are exactly the plain disc.
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
uniform samplerCube uCells; // the convection pattern, baked (render/starCells.ts): r giant cells, g granules
uniform float uHasCells;
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
  if (uHasCells > 0.5) {
    vec2 c = textureCube(uCells, vDir).rg * 2.0 - 1.0;
    T *= 1.0 + uGiantContrast * resolved(uGiantFreq) * c.r + uGranContrast * resolved(uGranFreq) * c.g;
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
    float m = exp(-ang * ang / 0.004);
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
