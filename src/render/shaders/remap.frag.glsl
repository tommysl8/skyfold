// Relativistic remap of the scene seen from the moving ship.
//
// The scene (everything except point sources, which are transformed exactly in their own
// shaders) was rendered into a cube map in the Sun's rest frame. For each screen pixel:
//  1. ship-frame viewing direction d' at angle theta' from the velocity
//  2. aberration: the rest-frame angle from tan(theta/2) = e^phi tan(theta'/2), with the
//     half-angles taken from chords (|d' - v| = 2 sin(theta'/2), |d' + v| = 2 cos(theta'/2))
//  3. sample the cube map there, with the mip level set by how much aberration squeezes
//     the sky (linear factor D) so the compressed forward view doesn't shimmer
//  4. Doppler shift + beaming: an approximate spectral recolouring I'_lambda = D^5 I_lambda(lambda D),
//     split into a bounded colour matrix per D (src/physics/dopplerColor.ts) and a brightness
//     ln L(D) from the blackbody table, which holds at any D
//  5. the cosmic microwave background behind everything: a blackbody at T_CMB D_cmb, where
//     T_CMB = 2.72548 K / a(t) at the clock's time (sim/cosmicTime.ts: it cools as the universe
//     expands) and D_cmb is the Doppler factor relative to the CMB's rest frame (the local comoving
//     frame; inside the Local Group the Sun's own motion through it is included)
// Every step works in rapidity and ln D: 1/D = e^-phi cos^2(theta'/2) + e^phi sin^2(theta'/2)
// never forms 1 - beta, and brightness stays a logarithm until the final exposure, so the pass
// is finite from phi = 0 to phi = 40 (gamma ~ 10^17).
// The result is written premultiplied, and the cube map's alpha (surface coverage) lets
// planets hide the analytically drawn stars (and the CMB) behind them.
//  6. the Milky Way seen from the Sun (near the Sun only), behind every surface like the CMB: a
//     diffuse source sampled in the rest-frame direction, recoloured and brightened with the same
//     radiance transform as the surfaces (render/shaders/milkyway.glsl)
#ifdef LENS
//  7. near a black hole (uLensOn, lightspeed_lens), the sky behind the surfaces is seen through its
//     lens: a pixel inside the diffuse zone (a cone about the hole in the ship's view) has its
//     rest-frame ray taken to the hole's frame and bent back to where its light came from (lensRay);
//     the Milky Way is read there (in the Sun's frame again), the CMB's temperature is
//     T_CMB · D_view · g · D_dip(n∞) (the ship's Doppler factor, the observer's gravitational
//     blueshift, and the hole frame's own motion through the CMB at the escape direction),
//     and both are 0 where the ray falls into the hole. Outside the zone only the blueshift g.
//     The cube (bodies) is read unlensed: bodies near a hole are drawn by the lens's spheres pass.
//     During a fall the "rest frame" is the lens frame itself (the frame boost is 0 there).
//     That step is a program of its own (render/lensVariants.ts: this material's LENS variant, sharing
//     every uniform, drawn only while a lens is and compiled in the background before it is:
//     render/LightspeedScenePass.ts, render/precompile.ts), so far from holes the program, its compile
//     and every pixel are exactly as they were (with the lens code behind a uniform its first compile
//     took 860 ms on the target laptop against 171, and a flight's first frame waited for it).
#endif
#include <lightspeed_blackbody>
#include <lightspeed_milkyway>
#ifdef LENS
#include <lightspeed_lens>
#endif

uniform samplerCube uCube;
uniform float uCubeLive; // 1: something is in the cube map; 0: it is empty (not read)
uniform sampler2D uDopplerLut;
uniform vec3 uDopplerLutRange; // ln D min, ln D max, table size
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uVelDir;
uniform float uEPhi;  // e^phi
uniform float uEmPhi; // e^-phi
uniform float uLnPixelOverTexel; // ln(pixel angle / cube texel angle)
uniform float uMaxLod;
uniform float uDoppler; // 1: apply Doppler/beaming, 0: aberration only
uniform float uLnExposure;
uniform float uLnSunRadiance; // ln of the Sun-surface radiance the renderer uses

// Cosmic microwave background
uniform vec3 uCmbDir;     // direction of the ship's motion through the CMB (ship frame, world axes)
uniform float uCmbEPhi;   // e^phi_cmb
uniform float uCmbEmPhi;  // e^-phi_cmb
uniform float uLnTCmb;    // ln T_CMB at the clock's time (T0 / a)
uniform float uCmbGain;   // 1 while the CMB's bright spot is resolved; 0 once a point source draws it
#ifdef LENS
uniform vec3 uCmbHoleDir;    // near a black hole: the hole frame's motion through the CMB, direction (world axes)
uniform float uCmbHoleEPhi;  //   and e^±phi of it
uniform float uCmbHoleEmPhi;
#endif

varying vec2 vUv;

// The colour matrix for ln D, blended between the two nearest table columns. The table is a
// float texture read with nearest filtering (linear filtering of float textures is not
// available everywhere), so the blend is done here: taking the nearest column alone leaves
// steps of 0.007 in ln D, which show as rings across the sky and jumps in colour as the ship
// speeds up (up to 11% on a saturated red).
vec3 dopplerRgb(vec3 c, float lnD) {
  float n = uDopplerLutRange.z;
  float x = clamp((lnD - uDopplerLutRange.x) / (uDopplerLutRange.y - uDopplerLutRange.x), 0.0, 1.0) * (n - 1.0);
  float i0 = min(floor(x), n - 2.0);
  float f = x - i0;
  float u0 = (i0 + 0.5) / n;
  float u1 = (i0 + 1.5) / n;
  vec3 r0 = mix(texture2D(uDopplerLut, vec2(u0, 1.0 / 6.0)).rgb, texture2D(uDopplerLut, vec2(u1, 1.0 / 6.0)).rgb, f);
  vec3 r1 = mix(texture2D(uDopplerLut, vec2(u0, 0.5)).rgb, texture2D(uDopplerLut, vec2(u1, 0.5)).rgb, f);
  vec3 r2 = mix(texture2D(uDopplerLut, vec2(u0, 5.0 / 6.0)).rgb, texture2D(uDopplerLut, vec2(u1, 5.0 / 6.0)).rgb, f);
  return max(vec3(dot(r0, c), dot(r1, c), dot(r2, c)), 0.0);
}

// ln D for a ship-frame direction d seen moving along v with e^+-phi: -ln(e^-phi cos^2 + e^phi sin^2).
float lnDopplerShip(vec3 d, vec3 v, float ePhi, float emPhi) {
  vec3 a = d - v;
  vec3 b = d + v;
  return -log(0.25 * (emPhi * dot(b, b) + ePhi * dot(a, a)));
}

// exp of a log-brightness, cut to exactly zero far below display precision
float expBrightness(float lnB) {
  return lnB < -60.0 ? 0.0 : exp(min(lnB, 12.0));
}

void main() {
  // Un-project at the near plane: with near = 1 m and far = 10^25 km the far plane is
  // effectively at infinity (w = 0 there).
  vec4 p = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(p.xyz / p.w));

  vec3 perp = d - dot(d, uVelDir) * uVelDir;
  float sp = length(perp);
  // theta/2 = atan(e^phi |d - v|, |d + v|): both chords are accurate, and atan's two-argument form
  // copes with either being zero (straight ahead, straight behind).
  float th = 2.0 * atan(uEPhi * length(d - uVelDir), length(d + uVelDir));
  vec3 e = sp > 1e-12 ? perp / sp : vec3(0.0);
  vec3 dRest = cos(th) * uVelDir + sin(th) * e;

  float lnD = lnDopplerShip(d, uVelDir, uEPhi, uEmPhi);

#ifdef LENS
  // Near a black hole: where the sky seen along this pixel came from, and its light's shift.
  vec3 skyDir = dRest;
  float lnSky = lnD;   // ln of the sky's frequency ratio: the view's Doppler, the blueshift, the frame boosts
  float skySeen = 1.0; // 0 where the ray falls into the hole
  bool lensed = false;
  vec3 nInf = dRest;
  float lnGRay = 0.0;
  float lnDfPix = 0.0;
  if (uLensOn > 0.5) {
    lnSky = lnD + uLensLnG;
    if (dot(d, uLensZoneCentre) >= uLensZoneCos) {
      // The rest-frame ray again, with lensAtan's accuracy (the built-in atan above is off by up to 1e-5 rad).
      float lnDview;
      vec3 dH = frameAberrate(relUnaberrateLens(d, uVelDir, uEPhi, uEmPhi, lnDview), lnDfPix);
      vec2 jac;
      if (lensRay(dH, nInf, jac, lnGRay)) {
        float lnDfSrc;
        skyDir = frameUnaberrate(nInf, lnDfSrc);
        lnSky = lnD + lnGRay + lnDfSrc - lnDfPix;
        lensed = true;
      } else {
        skySeen = 0.0;
      }
    }
  }
#endif

  // One ship pixel spans D times more of the rest-frame sky (the aberration Jacobian).
  float lod = clamp((lnD + uLnPixelOverTexel) * 1.442695, 0.0, uMaxLod);
  vec4 src = uCubeLive > 0.5 ? textureLod(uCube, dRest, lod) : vec4(0.0);
  vec3 rgb = src.rgb;
  float lnL = 0.0;
  if (uDoppler > 0.5) {
    lnL = blackbodyLn(LN_T_SUN + lnD).a; // brightness of sunlight shifted to D T_sun
    // (An empty cube is black: its recolouring is skipped.)
    rgb = uCubeLive > 0.5 ? dopplerRgb(src.rgb, lnD) * expBrightness(lnL + uLnExposure) : vec3(0.0);

    // The CMB: behind every surface, added to the point sources already drawn under this pass.
#ifdef LENS
    // (Near a black hole in a branch of its own.)
    if (uCmbGain > 0.0 && uLensOn > 0.5) {
      // Through the lens: T_CMB D_view g D_dip(n∞), the hole frame's own motion through the CMB at the escape direction.
      float lnTc = lensed ? uLnTCmb + lnDopplerShip(nInf, uCmbHoleDir, uCmbHoleEPhi, uCmbHoleEmPhi) + lnGRay - lnDfPix + lnD : uLnTCmb + lnDopplerShip(d, uCmbDir, uCmbEPhi, uCmbEmPhi) + uLensLnG;
      vec4 bb = blackbodyLn(lnTc);
      rgb += (1.0 - src.a) * skySeen * uCmbGain * bb.rgb * expBrightness(bb.a + uLnSunRadiance + uLnExposure);
    } else
#endif
    if (uCmbGain > 0.0) {
      vec4 bb = blackbodyLn(uLnTCmb + lnDopplerShip(d, uCmbDir, uCmbEPhi, uCmbEmPhi));
      rgb += (1.0 - src.a) * uCmbGain * bb.rgb * expBrightness(bb.a + uLnSunRadiance + uLnExposure);
    }
  }
  // The Milky Way from the Sun, behind every surface. Its integrated starlight is close to
  // sunlight in colour (B−V about 0.7 to 0.8 against the Sun's 0.65), so it takes the same
  // Doppler recolouring and brightening as the surfaces: a blackbody's radiance seen with
  // Doppler factor D is that of a blackbody at D T.
  // (A uniform condition: the map is filtered with screen-space derivatives, which need every
  // pixel of a quad to take the same path.)
#ifdef LENS
  // (Near a black hole in a branch of its own, as the CMB; both branches uniform, as the derivatives need.)
  if (uMwGain > 0.0 && uLensOn > 0.5) {
    vec3 bg = vec3(0.0);
    vec3 eye;
    vec3 sky = milkyWayP(skyDir, eye);
    localDustSky(gl_FragCoord.xy * uLocalDustOn.yz, sky, eye);
    if (uDoppler > 0.5) {
      float lnK = blackbodyLn(LN_T_SUN + lnSky).a + uLnExposure;
      if (lnK > -60.0) bg = dopplerRgb(milkyWayDisplay(sky, eye, exp(min(lnK, 40.0))), lnSky);
    } else {
      bg = milkyWayDisplay(sky, eye, 1.0);
    }
    rgb += (1.0 - src.a) * skySeen * bg;
  } else
#endif
  if (uMwGain > 0.0) {
    vec3 bg = vec3(0.0);
    vec3 eye;
    vec3 sky = milkyWayP(dRest, eye);
    // The neighbourhood's dust in front, moved from where the Sun sees it (shaders/localDustRead.glsl).
    localDustSky(gl_FragCoord.xy * uLocalDustOn.yz, sky, eye);
    if (uDoppler > 0.5) {
      float lnK = lnL + uLnExposure;
      if (lnK > -60.0) bg = dopplerRgb(milkyWayDisplay(sky, eye, exp(min(lnK, 40.0))), lnD);
    } else {
      bg = milkyWayDisplay(sky, eye, 1.0);
    }
    rgb += (1.0 - src.a) * bg;
  }
  // Half-float targets overflow at 65,504: a real camera saturates long before.
  gl_FragColor = vec4(min(rgb, vec3(3.0e4)), src.a);
}
