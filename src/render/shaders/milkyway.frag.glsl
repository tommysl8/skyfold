// The Milky Way behind everything in the classical view (the relativistic view draws it in the
// remap pass, aberrated and Doppler shifted), filtered over each pixel's footprint on the map.
#ifdef LENS
//
// This is the program drawn near a black hole (render/lensVariants.ts: the material's LENS variant, sharing every
// uniform; scene/MilkyWay.tsx swaps it in while a lens is drawn, and it is compiled in the background before: the
// plain program, the one start-up compiles, has none of this, which with the lens code behind a uniform took
// 270–480 ms to link on the target laptop against 57–93): a pixel inside the lens's diffuse zone (a cone about the
// hole in this half's view: one dot product) is seen through the lens: its ray taken to the hole's frame, bent back to
// where its light came from (lensRay), and the map read in the Sun's frame there; the light is shifted by the
// observer's gravitational blueshift (and the frame boosts), recoloured as the remap recolours it and brightened as a
// blackbody's radiance is, with the view's exposure; nothing where the ray falls into the hole. The map's footprint
// follows from the screen-space derivatives of the lensed map position, so it carries the lens's own stretch
// (render/shaders/milkyway.glsl). A pixel outside the zone gets the observer's blueshift only. Cost: one lens ray a
// pixel inside the zone (the sky map is drawn only within about 477 pc of the Sun: scene/MilkyWay.tsx).
//
// Twins: remap.frag.glsl (the same chain for the relativistic view), render/lens/lensPixel.glsl.
#include <lightspeed_blackbody>
#include <lightspeed_dopplercolour>
#include <lightspeed_lens>
#endif
#include <lightspeed_milkyway>

uniform mat4 uProjInv;
uniform mat4 uCamWorld;
#ifdef LENS
// This half's observer (the relativity uniforms, shared): at rest in the classical view, the raindrop in a fall's
// split view; and the view's exposure.
uniform vec3 uVelDir;
uniform float uEPhi;
uniform float uEmPhi;
uniform float uLnExposure;
#endif

varying vec2 vUv;

void main() {
  vec4 q = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(q.xyz / q.w));
#ifdef LENS
  // Where the sky is read, and its light's shift (ln of the frequency ratio), near a black hole.
  vec3 src = d;
  float seen = 1.0;
  float shift = 0.0;
  if (uLensOn > 0.5) {
    float lnDpix;
    vec3 dS = relUnaberrateLens(d, uVelDir, uEPhi, uEmPhi, lnDpix);
    src = dS;
    shift = lnDpix + uLensLnG;
    if (dot(d, uLensZoneCentre) >= uLensZoneCos) {
      float lnDfPix;
      vec3 dH = frameAberrate(dS, lnDfPix);
      vec3 nInf;
      vec2 jac;
      float lnG;
      if (lensRay(dH, nInf, jac, lnG)) {
        float lnDfSrc;
        src = frameUnaberrate(nInf, lnDfSrc);
        shift = lnDpix + lnG + lnDfSrc - lnDfPix;
      } else {
        seen = 0.0;
      }
    }
  }
  // (Outside any branch: the map is filtered with screen-space derivatives.)
  vec3 eye;
  vec3 p = milkyWayP(src, eye);
  // The neighbourhood's dust in front, moved from where the Sun sees it (shaders/localDustRead.glsl).
  localDustSky(gl_FragCoord.xy * uLocalDustOn.yz, p, eye);
  if (uLensOn > 0.5) {
    float lnK = blackbodyLn(LN_T_SUN + shift).a + uLnExposure;
    vec3 c = lnK > -60.0 ? milkyWayDisplay(p, eye, exp(min(lnK, 40.0))) : vec3(0.0);
    // Recoloured only where the shift is over the lens passes' Doppler skip (1e-4).
    c = abs(shift) < 1e-4 ? c : dopplerRgb(c, shift);
    gl_FragColor = vec4(min(c * seen, vec3(3.0e4)), 1.0);
  } else {
    gl_FragColor = vec4(milkyWayDisplay(p, eye, 1.0), 1.0);
  }
#else
  vec3 eye;
  vec3 p = milkyWayP(d, eye);
  localDustSky(gl_FragCoord.xy * uLocalDustOn.yz, p, eye);
  gl_FragColor = vec4(milkyWayDisplay(p, eye, 1.0), 1.0);
#endif
}
