// The 3D star catalogue (sim/stars; docs/data/stars.md). Each star is a point in parsecs from the
// Sun at J2000 (J2000 ecliptic axes), moved in a straight line by its space velocity, taken
// relative to the camera, and drawn with its apparent magnitude from there: M_V + 5 log10(d / 10 pc)
// (no dust of its own: its catalogue magnitude is as seen from Earth, so it carries the dust between the Sun and it). Its
// colour is the blackbody at its temperature. Away from the Sun the neighbourhood's 3D dust moves that dust: the camera's
// column to the star less the Sun's (shaders/localDustRead.glsl, render/dustLayer.ts). On top, the exact relativistic
// treatment of every point source: aberrated direction, Doppler-shifted blackbody colour
// (T' = D T) and the visible-band brightness change, finite at any rapidity.
//
// Precision: the positions are float32 parsecs (at a few parsecs, a float32 step is ~10^7 km, so
// stars near the camera are drawn as registry bodies instead, from float64, and hidden here), and
// the camera comes as two floats, hi + lo, so the difference keeps its precision far from the Sun.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#include <lightspeed_psf>
#include <lightspeed_localdust>
#ifdef LENS
// Near a black hole (render/lensVariants.ts swaps in this shader compiled with LENS while the lens is
// drawn) each star is drawn where the hole's lens puts its image, in this order: the source's direction
// in the Sun's frame, into the hole's frame (frameAberrate), the image (lensImage, tier 1: the exact flat
// parallax of a star at its true distance from the hole), back to the Sun's frame (frameUnaberrate), then
// the view observer's aberration (relAberrate) as always. uImageOrder picks the image: 0 the primary, 1 the
// one on the far side of the hole, 2 and 3 after a further turn (extra draws over candidate lists:
// sim/stars/lensCandidates.ts). The light's frequency factor is the product of the four steps (ln D below:
// the frame boost at the source, the observer's gravitational shift ln g, the boost back at the image, the
// view observer's Doppler factor) and its flux gains ln(|μ| B0), the magnification capped by the star's own
// disc at a caustic (Gould's B0), in place of the solid angle g⁻² a boost would give. Before any lens
// arithmetic a star is dropped when not even the largest magnification at its angle from the hole
// (lensMuBound) and the largest brightening by Doppler shift and gravity anywhere in the sky (uLensBoost,
// render/lensVariants.ts) could lift it to the eye's limit: that keeps the lensed draw at today's cost.
//
// Cost: without LENS, today's program exactly. With it, a pre-cull of a chord and a table read, and for the
// stars that survive it the lens (a few table reads). Measured on the target laptop by whole frames A/B
// (2,048 × 1,320) at 100 M from Sgr A*: the lensed program over the plain one +0.02 ms from the Sun's side
// even with all 329,770 stars drawn, and +0.03–0.04 ms from the far side with the star field's lists
// (scene/Starfield.tsx); drawing all of them from the far side, where the whole catalogue lies within a few
// Einstein angles of the axis and survives the pre-cull, would cost +0.74 ms, which the lists avoid.
//
// Twins: physics/relativity.ts (relAberrate, dopplerMagnitudeShift), physics/lensPoint.ts
// (pointImageTier1: the lens, float64), physics/schwarzschildTables.ts (buildMuBound), the bound on the
// brightening, sim/stars/visibility.ts (starBoostLn, kept in uLensBoost by render/lensVariants.ts), and the
// candidate lists' bounds, sim/stars/lensCandidates.ts.
#include <lightspeed_lens>
uniform float uImageOrder; // which image: 0 the primary, 1 bent round the far side, 2 and 3 after a further turn
uniform float uLensBoost;  // ln flux: the most Doppler shift and gravity brighten any star anywhere in the sky (μ aside)
uniform float uNearSkipPc; // stars nearer the camera than this are not drawn (the nuclear cluster's glow holds them), pc
// |ln D| under which a lensed star is neither recoloured nor brightened by its shift (render/lens/lensState.ts DOPPLER_SKIP).
const float LENS_DOPPLER_SKIP = 1e-4;
#endif

attribute vec3 aVel;     // int16 steps of 0.1 km/s, heliocentric, J2000 ecliptic
attribute float aAbsMag; // int16 steps of 0.01 mag; 32767: hidden (a registry body draws the star)
attribute float aTemp;   // uint16, K; 0 = unknown

uniform vec3 uCamHi;     // camera, parsecs from the Sun, J2000 ecliptic: hi + lo
uniform vec3 uCamLo;
uniform float uYears;    // Julian years since J2000, held to ±10^6 (the stars stand still beyond)
uniform float uRetarded; // 1: each star where the camera sees it (light-time); 0: where it is now

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

const float PC_PER_YR_PER_STEP = 1.0227121650537077e-7; // 0.1 km/s in pc per Julian year
const float C_PC_PER_YR = 0.30660139378555057;          // the speed of light
const float LOG10_E = 0.4342944819032518;

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: the point is dropped
  gl_PointSize = 0.0;
  vPeak = 0.0;
}

void main() {
  if (aAbsMag > 32000.0) {
    cull();
    return;
  }
  vec3 v = aVel * PC_PER_YR_PER_STEP;
  // Where the star is now: its astrometric J2000 place carried along its velocity for the years
  // since J2000 plus the light-time from there to the Sun (the catalogue shows it as it was).
  vec3 rel = (position - uCamHi) - uCamLo + v * (uYears + length(position) / C_PC_PER_YR);
  // Where the camera sees it: where it was when the light arriving now left it (first order in v/c).
  rel -= uRetarded * v * (length(rel) / C_PC_PER_YR);
  float d = max(length(rel), 1e-12);
  vec3 e = rel / d;
  vec3 dir = vec3(e.x, e.z, -e.y); // J2000 ecliptic → world axes
  float mag = aAbsMag * 0.01 + 5.0 * LOG10_E * log(d) - 5.0 - MAG_PER_LN * uLnExposure;

#ifdef LENS
  if (d < uNearSkipPc) {
    cull();
    return;
  }
  // The pre-cull (orders ≥ 1 draw candidate lists, already chosen by brightness): the straight-line angle
  // from the hole, less the most the frame boost can turn it, bounds the magnification from above.
  if (uImageOrder < 0.5) {
    float psi = max(lensAngle(dir, uLensAxis) - 1.01 * uFramePhi, 0.0);
    if (mag - MAG_PER_LN * (lensMuBound(psi) + uLensBoost) > uMagLimit + 0.5) {
      cull();
      return;
    }
  }
  float lnT = log(aTemp > 0.0 ? aTemp : 5772.0);
  vec4 bb = blackbodyLn(lnT);
  float lnDfSrc;
  vec3 dirH = frameAberrate(dir, lnDfSrc);
  vec3 image;
  float lnMuB0;
  float lnG;
  // Orders ≥ 1 of a star with no such image (seen from inside its own sphere round the hole) are dropped.
  if (!lensImage(dirH * (d * uLensScale.y), uImageOrder, lensStarRadiusM(aAbsMag * 0.01, bb.a), image, lnMuB0, lnG)) {
    cull();
    return;
  }
  float lnDfImg;
  vec3 dirS = frameUnaberrate(image, lnDfImg);
  float lnDv;
  vec3 dShip = relAberrate(dirS, lnDv);
  // The light's frequency factor from the star to the view observer, and the lens's own brightening beyond
  // what the boosts' solid angle gives (μ replaces the g⁻² a boost by ln g would have).
  float lnD = lnDfSrc + lnG - lnDfImg + lnDv;
  float lnLens = lnMuB0 + 2.0 * lnG;
  // Redshifted overall (D ≤ 1), no star brightens by more than |ln D| besides the lens (Rayleigh–Jeans).
  if (lnD <= 0.0 && mag + MAG_PER_LN * (lnD - lnLens) > uMagLimit + 0.5) {
    cull();
    return;
  }
  // dopplerMagnitudeShift's arithmetic with the star's own blackbody already read (bb); and none at all while the
  // shift is under the lens passes' Doppler skip, 1e-4 in ln ν (hovering far out: at 4,000 au from Sgr A* ln g is
  // 1.1e-5), where it would change a star by under 0.002 mag: the nuclear cluster's stars all pass the pre-cull, so
  // this is most of their vertex work there.
  vec3 color = bb.rgb;
  if (abs(lnD) >= LENS_DOPPLER_SKIP) {
    vec4 bD = blackbodyLn(lnT + lnD);
    color = bD.rgb;
    mag -= MAG_PER_LN * (bD.a - bb.a - 2.0 * lnD);
  }
  mag -= MAG_PER_LN * lnLens;
#else
  float lnD;
  vec3 dShip = relAberrate(dir, lnD);
  // Behind the ship (D ≤ 1) no star brightens by more than |ln D| in magnitudes (a Rayleigh–Jeans
  // spectrum): anything still past the fade is dropped before the colour lookups. At rest, D = 1.
  if (lnD <= 0.0 && mag + MAG_PER_LN * lnD > uMagLimit + 0.5) {
    cull();
    return;
  }
  float lnT = log(aTemp > 0.0 ? aTemp : 5772.0);
  vec3 color;
  if (uPhi > 0.0) mag += dopplerMagnitudeShift(lnT, lnD, color);
  else color = blackbodyLn(lnT).rgb;
#endif
  // The neighbourhood's dust: what lies between the camera and the star, less what its magnitude has from the Sun's
  // place (only for a star that could still be seen if made brighter by the most it can be).
  if (uLocalDustOn.x > 0.0 && mag - uLocalDustOn.w <= uMagLimit + 0.5) {
    vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
    if (clip.w > 0.0) {
      float aDust = localDustStar(clip.xy / clip.w * 0.5 + 0.5, d, uLocalDustEclToGal * position);
      vec3 tr = localDustTransmission(aDust);
      mag += aDust;
      color *= tr / tr.g;
    }
  }
  float fade = limitFade(mag);
  if (fade <= 0.0) {
    cull();
    return;
  }
  float sigma, peak, size;
  psfFromMagnitude(mag, sigma, peak, size);
  vColor = color;
  vPeak = peak * fade;
  vSigma = sigma;
  vSize = size;
  // One unit away along the direction seen: stars skip the depth test and are drawn first.
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = vPeak < 0.002 ? 0.0 : size;
  #include <logdepthbuf_vertex>
}
