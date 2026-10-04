// The model of the Milky Way (sim/galaxy; docs/data/galaxy.md): 199,500 particles drawn from the
// model's density laws, plus the globular clusters' clumps, each a Gaussian splat of light with the
// V-band luminosity it carries, dimmed by the model's dust along its own line of sight and, in
// flight, aberrated and Doppler shifted like every point source. Near the camera the discs' and the
// young arm stars' particles give way to a smooth glow of the same light (galaxyGlow.frag.glsl).
//
// Positions arrive in kiloparsecs (heliocentric galactic axes) and the camera as hi + lo floats, so
// the difference keeps its precision anywhere in the Galaxy; float32 kilometres would overflow.
// The particles are drawn into a smaller target (render/galaxyLayer.ts) and added to the view:
// sizes here are in that target's pixels (the large splats' coarser one scales them at the end).
//
// Most of this shader's time is the dust along each particle's line of sight, so a particle whose splat
// lies wholly off the view is dropped before it, and before the rest of the work past its size (a frustum
// test of its centre with the splat's whole reach, 4σ, and two pixels to spare: the picture is unchanged).
// Measured on the target laptop by whole frames, A/B interleaved (2,048 × 1,320, pixel ratio 2, 10 rounds):
// 0.44 ms less at 4.24 au from Sgr A* and 0.45 at 4,000 au, the frames the same but for one pixel in two
// million by 1/255; the particles it leaves cost 0.63 ms there in all. The sky cube's faces
// (render/lens/skyCube.ts) draw these particles too and gain the same way. Not lensed per vertex: the
// Galaxy's light is lensed per pixel, from its targets (render/lens/lensComposite.ts). Near Sgr A* the
// nuclear cluster's and disc's particles give way to the nuclear star cluster's own field (its glow,
// galaxyGlow.frag.glsl, and within 60 pc its points, scene/NuclearCluster.tsx) as uNuclearFade.x, the
// field's share of their light (sim/galaxy/nuclearCluster.ts nscGlowShare), rises from 0 at 1 kpc to 1 at 500 pc.
//
// Twins: sim/galaxy/model.ts (columnAV), sim/galaxy/glow.ts (the glow's crossover).
#include <common>
#include <lightspeed_relativity>
#include <lightspeed_psf>

attribute vec3 aColor; // linear sRGB, largest channel 1
attribute vec4 aAttr;  // population, luminosity code (L = 2^(c/8) L☉), size code (h = 2^(c/16 − octaves) pc), temperature code

uniform vec3 uCamHi;       // camera, heliocentric galactic kpc: hi + lo
uniform vec3 uCamLo;
uniform vec3 uCamG;        // camera in the galactocentric frame G, kpc
uniform mat3 uGalToWorld;  // heliocentric galactic → world axes
uniform mat3 uGalToG;      // heliocentric galactic → frame G (rotation; then + uSunG)
uniform vec3 uSunG;
uniform sampler2D uDust;   // face-on dust maps in frame G: disc a_V, disc height, arm a_V, arm height
uniform sampler2D uWarpMap; // the height of the warped midplane (Chen et al. 2019), kpc, on the same grid
uniform float uDustExtent; // the maps cover ±uDustExtent kpc
uniform float uLumGain;    // the model's share of the sky (crossfade with the sky from the Sun)
uniform float uPxPerRad;   // target pixels per radian at the centre of the view
uniform float uResScale;   // target pixels per device pixel
uniform float uSigmaMax;   // splats seen larger than this (1σ, target pixels) fade out
uniform float uSigmaBudget; // a splat larger than this (1σ, target pixels) is drawn with probability (budget / σ)²
uniform float uKpcPerUnit; // position unit, kpc (0.002 for the int16 model, 1 for the clumps)
uniform float uSizeOctaves;
uniform float uLumScale;   // N / k when only the first k of the N (shuffled) particles are drawn
uniform float uHScale;     // splat radius as a share of the particle's size (the 8th-neighbour distance)
uniform float uReachFloor; // the least of the Gaussian drawn, in σ
uniform float uBigPass;   // 0: the splats up to uSigmaCoarse; 1: those beyond it, into a target uBigScale as fine; −1: all
uniform float uBigScale;
uniform float uSigmaCoarse; // 1σ (target pixels) beyond which a splat goes into the coarser target
uniform int uDustPieces;   // pieces of the line of sight integrated through the dust (0: no dust)
uniform float uFluxCut;    // patch flux below which a splat's tail is not drawn
// Near the camera the discs and the young arm stars are drawn as a smooth glow instead
// (galaxyGlow.frag.glsl, sim/galaxy/glow.ts): their particles hold none of their light nearer than
// s0 and all of it beyond s1. x, y: the discs' s0, s1; z, w: the young arm stars' (kpc).
uniform vec4 uGlowRange;
uniform float uGlowOn;     // 1 while the glow is drawn
// Seen from outside, the discs' and the long bar's light (x) and the young arm stars' (y) are drawn from face-on maps instead
// (galaxyFace.frag.glsl): their particles hold 1 − that share of it.
uniform vec2 uFaceShare;
// x: the nuclear star cluster's field's share w near Sgr A* (sim/galaxy/nuclearCluster.ts): the model's
// nuclear disc and cluster particles are drawn × (1 − w); y, z, w unused.
uniform vec4 uNuclearFade;

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

const float TEMP_MIN_K = 1000.0;
const float M_V_SUN = 4.83;
// Populations (sim/galaxy/particles.ts, clusters.ts): the discs and the young arm stars have a
// glow near the camera; the H II regions and the globular clusters are single objects.
const int POP_THIN_DISC = 0;
const int POP_YOUNG = 1;
const int POP_HII = 2;
const int POP_THICK_DISC = 3;
const int POP_BAR_THIN = 5;
const int POP_BAR_SUPER_THIN = 6;
const int POP_NUCLEAR_DISC = 7;
const int POP_NUCLEAR_CLUSTER = 8;
const int POP_GLOBULAR = 11;
const int MAX_DUST_PIECES = 8;
// Far from the midplane the dust layers (heights of 0.1 to 0.3 kpc) hold nothing: a piece wholly
// above or below this height on one side is skipped.
const float DUST_EMPTY_KPC = 2.0;

// Error function, Abramowitz & Stegun 7.1.26 (as in sim/galaxy/model.ts).
float erfA(float x) {
  float s = sign(x);
  float t = 1.0 / (1.0 + 0.3275911 * abs(x));
  float y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return s * y;
}

// V-band extinction (mag) from a to b (frame G, kpc): the path in pieces, each with the dust of
// the map where the piece comes closest to the warped midplane, integrated exactly through the
// vertical profiles (sech² for the disc, a Gaussian for the arm lanes). As columnAV in model.ts.
float columnAV(vec3 a, vec3 b) {
  float n = float(uDustPieces);
  float L = length(b - a) / n;
  float tau = 0.0;
  for (int i = 0; i < MAX_DUST_PIECES; i++) {
    if (i >= uDustPieces) break;
    vec3 p0 = mix(a, b, float(i) / n);
    vec3 p1 = mix(a, b, float(i + 1) / n);
    if (min(p0.z, p1.z) > DUST_EMPTY_KPC || max(p0.z, p1.z) < -DUST_EMPTY_KPC) continue;
    // Where this piece is closest to the plane z = 0 (the crossing, or its nearer end).
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

// A number in [0, 1) fixed for each particle (its index, hashed).
float particleHash() {
  uint h = uint(gl_VertexID) * 2654435761u;
  h ^= h >> 15;
  h *= 2246822519u;
  h ^= h >> 13;
  return float(h) / 4294967296.0;
}

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vPeak = 0.0;
}

void main() {
  vec3 p = position * uKpcPerUnit;
  vec3 rel = (p - uCamHi) - uCamLo;
  float d = length(rel);
  float hKpc = exp2(aAttr.z / 16.0 - uSizeOctaves) * 1e-3 * uHScale;
  if (uLumGain <= 0.0 || d <= hKpc) {
    cull();
    return;
  }
  int pop = int(aAttr.x + 0.5);
  // The share of the particle's light that is not the glow's.
  float keep = 1.0;
  if (uGlowOn > 0.5) {
    if (pop == POP_THIN_DISC || pop == POP_THICK_DISC) keep = smoothstep(uGlowRange.x, uGlowRange.y, d);
    else if (pop == POP_YOUNG) keep = smoothstep(uGlowRange.z, uGlowRange.w, d);
  }
  if (pop == POP_NUCLEAR_DISC || pop == POP_NUCLEAR_CLUSTER) keep *= 1.0 - uNuclearFade.x;
  if (pop == POP_THIN_DISC || pop == POP_THICK_DISC || pop == POP_BAR_THIN || pop == POP_BAR_SUPER_THIN) keep *= 1.0 - uFaceShare.x;
  else if (pop == POP_YOUNG) keep *= 1.0 - uFaceShare.y;
  if (keep <= 0.0) {
    cull();
    return;
  }
  // Single objects are always drawn: they are neither subsampled nor drawn by lot.
  bool single = pop == POP_HII || pop == POP_GLOBULAR;
  vec3 dirWorld = rel / d;
  dirWorld = normalize(uGalToWorld * dirWorld);
  float lnD;
  vec3 dShip = relAberrate(dirWorld, lnD);

  // A particle smaller than a faint star's image (1σ = 0.5 CSS px) is drawn as one; an extended one
  // as a Gaussian of 1σ = h / d radians, shrunk by 1/D ahead of a moving ship. One seen larger
  // than uSigmaMax (close to the camera) fades out.
  float sigmaPsf = 0.5 * uPixelRatio * uResScale;
  float sigmaExt = hKpc / d * uPxPerRad * exp(-lnD);
  if (sigmaExt >= uSigmaMax) {
    cull();
    return;
  }
  float near = 1.0 - smoothstep(0.5 * uSigmaMax, uSigmaMax, sigmaExt);
  // The large splats are drawn into a coarser target of their own (render/galaxyLayer.ts).
  bool large = sigmaExt > uSigmaCoarse;
  if (uBigPass >= 0.0 && large != (uBigPass > 0.5)) {
    cull();
    return;
  }
  float sigmaT = max(max(sigmaPsf, sigmaExt), 0.6);
  // Off the view: dropped before the rest of the work and the dust. The splat reaches at most 4σ + 1 of its
  // target's pixels from its centre (vSize below, whose reach is at most 4), 4σ + 1/s of the finer target's,
  // and one pixel more is kept; the target is at least uPxPerRad / P[0][0] of those pixels across each half of
  // the view (rounded up).
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  float s = large && uBigPass > 0.5 ? uBigScale : 1.0;
  vec2 reachNdc = ((4.0 * sigmaT + 2.0 / s) / uPxPerRad) * vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
  if (clip.w <= 0.0 || abs(clip.x) > clip.w * (1.0 + reachNdc.x) || abs(clip.y) > clip.w * (1.0 + reachNdc.y)) {
    cull();
    return;
  }
  bool big = sigmaExt > uSigmaBudget && !single;
  // Large splats overlap by the hundred near the camera (inside the bulge): each is drawn with
  // probability (budget / σ)², as bright as that many of them, so the pixels they cover stay about
  // the same however near the camera comes, and the glow they add up to keeps its brightness. Each
  // particle's lot is fixed and eased in and out (no flicker as sizes change). A single object (an
  // H II region, a globular cluster) is not a sample of a smooth population, so it is always drawn;
  // there are only ever a few of them near the camera.
  if (big) {
    float thr = (uSigmaBudget * uSigmaBudget) / (sigmaExt * sigmaExt);
    float w = clamp((thr - particleHash()) / (0.25 * thr), 0.0, 1.0);
    if (w <= 0.0) {
      cull();
      return;
    }
    near *= w / (0.875 * thr);
  }

  // magnitude: M_V + 5 log10(d / 10 pc), then the dust, the Doppler shift and the exposure
  // uLumScale: the share of the (shuffled) particles drawn; the single objects come first and are all drawn.
  float lum = exp2(aAttr.y / 8.0) * uLumGain * (single ? 1.0 : uLumScale) * near * keep;
  float mag = M_V_SUN - 1.0857362 * log(lum) + 2.1714724 * log(d * 100.0) - MAG_PER_LN * uLnExposure;
  float lnT = log(TEMP_MIN_K) + aAttr.w * (0.6931472 / 32.0);
  vec3 tint = vec3(1.0);
  if (uPhi > 0.0) {
    vec3 shifted;
    mag += dopplerMagnitudeShift(lnT, lnD, shifted);
    tint = shifted / max(blackbodyLn(lnT).rgb, vec3(1e-3));
  }
  // Too faint to matter even before the dust: dropped before the dust is worked out.
  float geom = (sigmaPsf * sigmaPsf) / (sigmaT * sigmaT);
  if (-0.9210340 * (mag - uMagZero) + log(geom) < log(0.02 * uFluxCut)) {
    cull();
    return;
  }
  vec3 pG = uGalToG * p + uSunG;
  float av = uDustPieces > 0 ? columnAV(uCamG, pG) : 0.0;
  mag += av;

  // Dust reddens as it dims: A_R : A_G : A_B = 0.89 : 1 : 1.23 of A_V (Cardelli et al. 1989).
  vec3 redden = exp(-0.921034 * av * (vec3(0.89, 1.0, 1.23) - 1.0));
  vec3 c = aColor * tint * redden;
  float lumC = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Its flux in units of a V = 0 star (as the stars': relative to uMagZero, the exposure included).
  float lnF = -0.9210340 * (mag - uMagZero);
  if (lumC <= 0.0 || lnF < -60.0) {
    cull();
    return;
  }
  // The target holds linear light: the value at a splat's centre is the flux that falls within a
  // faint star's image area there; the composite turns the sum into what is drawn (galaxyLayer.ts).
  float peak = min(exp(min(lnF, 60.0)), 3.0e4) * geom;
  if (peak < 0.02 * uFluxCut) {
    cull();
    return;
  }
  // Out to where it adds less than uFluxCut (a fiftieth of the faintest light shown), and at least
  // uReachFloor σ; the peak is raised by what the cut leaves out.
  float reach = min(max(uReachFloor, sqrt(2.0 * log(max(peak / uFluxCut, 1.0001)))), 4.0);
  peak /= 1.0 - exp(-0.5 * reach * reach);

  vColor = c / lumC;
  vPeak = peak;
  // In the coarser target the splat has the same shape and peak, in its pixels (s, above).
  vSigma = sigmaT * s;
  vSize = 2.0 * sigmaT * s * reach + 2.0;
  gl_Position = clip;
  gl_PointSize = vSize;
}
