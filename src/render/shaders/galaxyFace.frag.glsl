// The Milky Way model seen from outside: its disc's light where each pixel's line of sight crosses the midplane, from
// the face-on maps (sim/galaxy/faceOn.ts) and the discs' laws, at the fine target's full resolution. Its particles of
// the thin and thick discs, the young arm stars and the long bar, which blur that structure over their 8th
// neighbours, give way to it as uFaceShare rises (galaxy.vert.glsl; the glow near the camera too,
// galaxyGlow.frag.glsl), so the light is the same: the discs' laws hold their particles' light, and the young arm
// stars' and the bar's maps are scaled to theirs (uYoungL, uBarL).
//
// Through the disc at |cos i| = μ of the midplane's normal a column S face-on is S / μ. The dust (the face-on A_V map,
// reddened as the particles are) lies in a layer thinner than the discs: half of a disc's light is in front of it and
// half behind (a sandwich, (1 + e^−τ) / 2 of it gets out), while the young arm stars are mixed with it ((1 − e^−τ) / τ),
// τ = 0.921 A_V / μ. Added into the target in its units, as the glow: the flux, in V = 0 stars relative to the
// exposure, that falls within a faint star's image area.
//
// Drawn only at rest and with no black hole's lens (scene/GalaxyModel.tsx sets uFaceShare 0 otherwise): it has no
// Doppler shift. Cost: two texture fetches a pixel where the disc is.
#include <common>
#include <lightspeed_relativity>

uniform vec3 uCamG;          // camera in frame G, kpc
uniform mat3 uGalToWorld;    // heliocentric galactic → world axes
uniform mat3 uGalToG;        // heliocentric galactic → frame G (rotation)
uniform sampler2D uFaceYoung; // the young arm stars' surface brightness for 1 L☉ (log-encoded, one channel)
uniform sampler2D uFaceDust;  // the face-on A_V (log-encoded, one channel)
uniform sampler2D uFaceBar;   // the long bar's surface brightness for 1 L☉ (log-encoded, one channel)
uniform vec4 uFaceRanges;    // young: v0, ln(1 + vmax / v0); dust: v0, ln(1 + vmax / v0)
uniform vec2 uFaceBarRange;  // the bar's: v0, ln(1 + vmax / v0)
uniform float uBarL;         // the bar's luminosity, L☉
uniform vec3 uBarRgb;        // its colour (linear sRGB of luminance 1)
uniform float uFaceExtent;   // the maps cover ±uFaceExtent kpc
uniform vec2 uFaceShare;     // its share of the discs' light (x) and of the young arm stars' (y); 0: their particles have it
uniform float uYoungL;       // the young arm stars' luminosity, L☉
uniform float uLumGain;
uniform float uPxPerRad;
uniform float uResScale;
uniform float uPixelRatio;
uniform float uMagZero;
uniform vec4 uGlowThin;      // surface brightness at R = 0 (L☉/pc²), hR, hz, Rmax (kpc)
uniform vec4 uGlowThick;
uniform vec3 uGlowThinRgb;   // linear sRGB of luminance 1
uniform vec3 uGlowYoungRgb;
uniform vec3 uGlowThickRgb;

varying vec3 vRay;

const float M_V_SUN = 4.83;
const vec3 REDDEN = vec3(0.89, 1.0, 1.23);

void main() {
  if (uFaceShare.x <= 0.0 && uFaceShare.y <= 0.0) discard;
  vec3 n = uGalToG * (transpose(uGalToWorld) * normalize(vRay));
  float mu = abs(n.z);
  if (mu < 1e-3) discard;
  float t = -uCamG.z / n.z;
  if (t <= 0.0) discard;
  vec2 q = uCamG.xy + t * n.xy;
  if (abs(q.x) >= uFaceExtent || abs(q.y) >= uFaceExtent) discard;
  vec2 uv = (q + uFaceExtent) / (2.0 * uFaceExtent);
  float young = uFaceRanges.x * (exp(texture2D(uFaceYoung, uv).r * uFaceRanges.y) - 1.0) * uYoungL;
  float av = uFaceRanges.z * (exp(texture2D(uFaceDust, uv).r * uFaceRanges.w) - 1.0);
  float bar = uFaceBarRange.x * (exp(texture2D(uFaceBar, uv).r * uFaceBarRange.y) - 1.0) * uBarL;
  float R = length(q);
  float sT = R > uGlowThin.w ? 0.0 : uGlowThin.x * exp(-R / uGlowThin.y);
  float sK = R > uGlowThick.w ? 0.0 : uGlowThick.x * exp(-R / uGlowThick.y);
  vec3 tau = (0.921034 * av / mu) * REDDEN;
  vec3 sandwich = 0.5 * (1.0 + exp(-tau));
  vec3 mixed = tau.g > 1e-5 ? (1.0 - exp(-tau)) / tau : vec3(1.0);
  // A column S (L☉/pc²) is 10^(−0.4 M☉) × (10 pc)² × S V = 0 stars per steradian; in the target, times a faint star's
  // image area and the exposure (as galaxyGlow.frag.glsl).
  float sigmaPsf = 0.5 * uPixelRatio * uResScale / uPxPerRad;
  float perColumn = exp(-0.921034 * (M_V_SUN - uMagZero) + uLnExposure) * 100.0 * 6.2831853 * sigmaPsf * sigmaPsf * uLumGain;
  vec3 f = (perColumn / mu) * (uFaceShare.x * (sT * uGlowThinRgb + sK * uGlowThickRgb + bar * uBarRgb) * sandwich + uFaceShare.y * young * uGlowYoungRgb * mixed);
  f = min(f, vec3(6.0e4));
  gl_FragColor = vec4(f, dot(f, vec3(0.2126, 0.7152, 0.0722)));
}
