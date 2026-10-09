// Quaia's quasars and Gaia DR3's galaxies (scene/Surveys.tsx; sim/surveys/quaia.ts): each a soft streak along our line of
// sight, as long as its distance is uncertain, one quad an object (instanced: `corner` picks the quad's corner, the a* attributes are the
// quasar's), one draw a node of Quaia's octree, as the survey's points (survey.vert.glsl), whose light law, colours and
// shifts it keeps.
//
// The streak: the quasar's place and the two places 1σ nearer and farther along the line from the Sun (its distance
// error, comoving: aSigma's code) are each seen as the survey's points are (redshifted, light-delayed if that is on,
// aberrated in flight) and projected; on the screen the quasar is its point smeared along the line between the two by
// a Gaussian of σ half that line's length: across it the point's own profile (σ a sixth of its width), along it the
// two σ added in quadrature, cut at CUT_ALONG σ. A quasar seen end on, or nearly certain, is the point it would be
// (sim/surveys/quaia.ts streakShape is the twin); a longer streak holds more light (uLengthGain) but less per pixel, and
// one long on the screen fades out (uLongPx). The least certain are faded too (quaiaFade, from uFade). Why each: quaia.ts.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#include <lightspeed_galaxymap>

attribute vec2 corner; // −1 or 1: the start or end of the streak, and its one side or the other
attribute vec3 aPos;   // Mpc from the node's centre
attribute vec2 aAttr;  // kind byte, luminosity byte
attribute float aSigma; // the distance error's code (quaia.ts sigmaByte)

// The node's numbers in its model matrix (scene/Surveys.tsx), as survey.vert.glsl's: column 0 a × the node's centre −
// the camera, column 1 the node's centre − the camera's comoving place, column 2's first its share; and column 3 the
// node's centre from the Sun (comoving Mpc), for the line of sight.
uniform float uPixelRatio;
uniform float uNearMpc;
uniform vec3 uColor;     // Quaia's quasars (class 3)
uniform float uLnT;
uniform vec3 uClassColor[4]; // the others (Gaia's galaxies: grey, class 2), as the survey's points
uniform float uClassLnT[4];
uniform vec2 uLum;       // log10 L/L* of byte 0, and of one step
uniform vec2 uSigmaCode; // log2 of the error (Mpc) at code 0, and codes an octave
uniform vec3 uFade;      // the errors (Mpc) the fade runs between, and its floor
uniform vec2 uResolution; // drawing-buffer px
uniform float uPointKernel;
uniform float uMinAlpha;
uniform float uLengthGain; // a streak's light grows as (its length / a point's)^this
uniform vec2 uLongPx;      // half lengths (CSS px) over which a streak fades out

uniform float uAObs;
uniform float uRetarded;
uniform float uSkyOn;

//#emission

varying vec3 vColor;
varying float vAlpha;
varying vec2 vUv;      // along and across, in σ of each
varying float vFloor;  // the profile's value where the streak's length is cut

// CUT_ALONG and CUT_ACROSS, where the profile is cut (in its σ), are defines from quaia.ts (materials.ts).

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vAlpha = 0.0;
}

// The error function (Abramowitz & Stegun 7.1.26), for the light of a cut Gaussian.
float erfApprox(float x) {
  float t = 1.0 / (1.0 + 0.3275911 * abs(x));
  float y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return sign(x) * y;
}
// ∫ from −c to c of (e^(−t²/2) − e^(−c²/2)) dt.
float cutIntegral(float c) {
  return 2.5066283 * erfApprox(c * 0.70710678) - 2.0 * c * exp(-0.5 * c * c);
}

// A place (proper from the camera; comoving from the camera's comoving place) where its light left it, if
// light-delayed positions are on, and its ln(1 + z).
vec3 seen(vec3 rel, vec3 sep, out float L) {
  L = 0.0;
  float chi = length(sep);
  if (uSkyOn > 0.5 && chi > 1e-6) {
    L = emissionLn1pZ(chi);
    if (uRetarded > 0.5 && L < 1e29) rel -= (uAObs * (1.0 - exp(-L))) * sep;
  }
  return rel;
}

// Device px of a direction on the ship's sky (w ≤ 0 behind the camera).
vec4 clipOf(vec3 dirShip) {
  return projectionMatrix * vec4(mat3(viewMatrix) * dirShip, 1.0);
}

void main() {
  float L;
  vec3 rel = seen(modelMatrix[0].xyz + uAObs * aPos, modelMatrix[1].xyz + aPos, L);
  if (L > 1e29) {
    // Beyond the particle horizon: none of its light has arrived.
    cull();
    return;
  }
  float d = length(rel);
  float a = modelMatrix[2].x * smoothstep(0.35 * uNearMpc, uNearMpc, d);
  if (a <= 0.0) {
    cull();
    return;
  }
  float lnD;
  vec3 dShip = relAberrate(rel / d, lnD);
  vec4 c = clipOf(dShip);
  if (c.w <= 1e-6) {
    cull();
    return;
  }

  // The quasar's light, as a survey point's (survey.vert.glsl): summed over its sprite, alpha × px².
  float l = exp2(3.3219281 * (uLum.x + aAttr.y * uLum.y));
  float px = mapSizePx(l, d, uPixelRatio);
  a *= mapLight(l) * mapDepth(d) * mapUnitPx2(uPixelRatio) * uPointKernel;
  int cls = int(aAttr.x + 0.5) & 3;
  vec3 base = cls == 3 ? uColor : uClassColor[cls];
  float lnT = cls == 3 ? uLnT : uClassLnT[cls];
  float lnDe = lnD - L;
  if (lnDe != 0.0) {
    vec4 b0 = blackbodyLn(lnT);
    vec4 b1 = blackbodyLn(lnT + lnDe);
    vec3 cc = base * (b1.rgb / max(b0.rgb, vec3(1e-3)));
    float lc = dot(cc, vec3(0.2126, 0.7152, 0.0722));
    base = lc > 0.0 ? cc * (dot(base, vec3(0.2126, 0.7152, 0.0722)) / lc) : base;
    float lnF = b1.a - b0.a - 2.0 * lnDe - (uRetarded > 0.5 ? 2.0 * L : 0.0) + uLnExposure;
    if (L > 0.5) lnF = mapFloorLnF(lnF, lnT, lnD, b0.a, uLnExposure);
    a *= exp(clamp(0.5 * lnF, -60.0, 2.0));
  }
  float sigma = exp2(uSigmaCode.x + aSigma / uSigmaCode.y);
  a *= 1.0 - (1.0 - uFade.z) * smoothstep(uFade.x, uFade.y, sigma);

  // The ±1σ places along the line of sight from the Sun, seen and projected.
  vec3 off = sigma * normalize(modelMatrix[3].xyz + aPos);
  float L0;
  float L1;
  float lnD0;
  float lnD1;
  vec3 r0 = seen(modelMatrix[0].xyz + uAObs * (aPos - off), modelMatrix[1].xyz + aPos - off, L0);
  vec3 r1 = seen(modelMatrix[0].xyz + uAObs * (aPos + off), modelMatrix[1].xyz + aPos + off, L1);
  vec4 c0 = clipOf(relAberrate(normalize(r0), lnD0));
  vec4 c1 = clipOf(relAberrate(normalize(r1), lnD1));
  vec2 halfRes = 0.5 * uResolution;
  vec2 pc = c.xy / c.w * halfRes;
  // Half the span between the ends (one end behind the camera: from the quasar to the other).
  vec2 span = vec2(0.0);
  if (c0.w > 1e-6 && c1.w > 1e-6) span = 0.5 * (c1.xy / c1.w - c0.xy / c0.w) * halfRes;
  else if (c1.w > 1e-6) span = c1.xy / c1.w * halfRes - pc;
  else if (c0.w > 1e-6) span = pc - c0.xy / c0.w * halfRes;
  float halfPx = length(span);

  // The streak's profile (quaia.ts streakShape): the point's across, the point and the error added along.
  float sw = px / 6.0;
  float sa = sqrt(halfPx * halfPx + sw * sw);
  float hl = max(CUT_ALONG * sa, CUT_ACROSS * sw);
  float hw = CUT_ACROSS * sw;
  a *= 1.0 - smoothstep(uLongPx.x * uPixelRatio, uLongPx.y * uPixelRatio, halfPx);
  float peak = a * pow(sa / sw, uLengthGain) / (sa * cutIntegral(hl / sa) * sw * cutIntegral(CUT_ACROSS));
  // Too faint to show anywhere along it: not drawn (a long streak's light is spread thin).
  if (peak < uMinAlpha) {
    cull();
    return;
  }
  vec2 along = halfPx > 1e-3 ? span / halfPx : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  vec2 p = pc + along * (corner.x * hl) + across * (corner.y * hw);
  vColor = base;
  vAlpha = peak;
  vUv = vec2(corner.x * hl / sa, corner.y * CUT_ACROSS);
  vFloor = exp(-0.5 * (hl / sa) * (hl / sa));
  gl_Position = vec4(p / halfRes * c.w, c.z, c.w);
  #include <logdepthbuf_vertex>
}
