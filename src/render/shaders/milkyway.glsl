// The Milky Way as seen from the Sun: the NASA SVS "Deep Star Maps 2020" Milky Way background
// (Gaia DR2 starlight fainter than V ~ 11, with the real dust lanes), with the light of the star
// catalogue's stars fainter than the eye's limit added (uMwFaint), shared by the classical
// background (milkyway.frag.glsl) and the relativistic remap pass (remap.frag.glsl), where it is
// sampled in the rest-frame direction and Doppler shifted like every diffuse source.
//
// The map is plate carrée in ICRS: RA = 0 at the centre column, RA increasing to the left, north at
// the top (three.js flips the image, so v = 0.5 + Dec / π). Each channel is log-encoded,
// e = ln(1 + p / P0) / ln(1 + 1 / P0) with P0 = 2e-4; p is the SVS linear value. The calibration
// (public/textures/milkyway-bg.json) gives a texel's surface brightness as
// mu_V = 18.44 − 2.5 log10(mean p) mag/arcsec², that is 1,790 mean(p) times the flux of a V = 0 star
// per steradian (src/sim/galaxy/background.ts).
//
// Display: the same exposure as the stars. A faint star of flux f (in V = 0 units) is drawn as a
// Gaussian peaking at uStarGain √f over the area of its image, Ω_psf; so a patch of sky of that
// area holding the same light is drawn as bright: Y = uStarGain √(S Ω_psf) for a surface
// brightness S per steradian. uMwScale carries uStarGain² · 1790 · Ω_psf · 10^(0.4 m0).
//
// The star field stops at the eye's limit for points (V = 6.5); the glow between the stars stops,
// the same way, where the eye loses faint extended light: it fades out between 22 and 24
// mag/arcsec² (the darkest skies on Earth are about 22), so the high galactic latitudes stay black
// and the band stands out as it does from a dark site.
#include <lightspeed_localdust>
uniform sampler2D uMwTex;
// The light of the catalogue's stars too faint to be drawn as points (V 6.5 to 10), which the SVS
// map leaves out with the brighter ones: one channel, same projection and encoding
// (scripts/build-faint-stars.mjs); black until it has loaded.
uniform sampler2D uMwFaint;
uniform float uMwGain;    // the sky map's share of the picture (1 near the Sun, 0 beyond the handover to the model)
uniform float uMwScale;   // Y = √(uMwScale · mean(p) · k), times uMwGain
uniform vec2 uMwMuFade;   // surface brightness (mag/arcsec²) where the glow starts to fade and where it is gone
uniform float uMwMinLod;  // the finest level drawn: 0 for the 2K map (texels of 10.5′)
// The fine structure: the 8K map's luminance, one channel, same projection and encoding
// (scripts/build-milkyway-detail.py), used once it has loaded (uMwDetailOn 1).
uniform sampler2D uMwDetail;
uniform float uMwDetailOn;

const float MW_P0 = 2.0e-4;
const float MW_LN = 8.517393171418904; // ln(1 + 1 / P0)
const float MW_COS_E = 0.9174820620691818; // obliquity of the J2000 ecliptic
const float MW_SIN_E = 0.3977771559319137;
const float MW_SB_ZERO = 18.439; // mu_V = MW_SB_ZERO − 2.5 log10(mean p)

// The most a footprint is drawn out: its width across is at least a quarter of its length.
const float MW_MAX_ANISO = 4.0;

// A footprint (texel units) stretched to at least n texels.
vec2 atLeast(vec2 v, float n) {
  float l = length(v);
  return l >= n ? v : (l > 0.0 ? v * (n / l) : vec2(n, 0.0));
}

// A pixel's footprint on the sky, from the map position's screen-space derivatives dx and dy in
// texels with the RA component shrunk by cos(Dec) (so both axes are angles on the sky: the map's
// texels are 10.5′ each way at the equator), as two axes: a along its length, b across it, b at
// least |a| / MW_MAX_ANISO and both at least n.
void footprint(vec2 dx, vec2 dy, float n, out vec2 a, out vec2 b) {
  a = dot(dx, dx) >= dot(dy, dy) ? dx : dy;
  vec2 other = dot(dx, dx) >= dot(dy, dy) ? dy : dx;
  float la = length(a);
  vec2 along = la > 0.0 ? a / la : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float width = abs(dot(other, across));
  a = along * max(la, n);
  b = across * max(width, max(la / MW_MAX_ANISO, n));
}

// The SVS linear value p of each channel in the rest-frame direction d (world axes), filtered over
// the pixel's footprint on the map; and, into eye, the same over the scale at which the eye gathers
// faint light (4 texels, about 0.7°), which decides whether it is seen at all. The footprint comes
// from the screen-space derivatives of the map position (so it includes the squeeze of the sky
// ahead of a moving ship), with the anisotropic filter doing the rest. The colour comes from the 2K
// map, no finer than its 10.5′ texels (uMwMinLod); where a pixel is finer than that, the 8K map's
// luminance over the pixel against its luminance over the same 2K footprint scales it, so the dust
// lanes and star clouds are as sharp as 2.6′ and the picture is unchanged wherever the 2K map was
// already fine enough (the ratio is then 1).
vec3 milkyWayP(vec3 d, out vec3 eye) {
  vec3 ecl = vec3(d.x, -d.z, d.y);
  vec3 eq = vec3(ecl.x, MW_COS_E * ecl.y - MW_SIN_E * ecl.z, MW_SIN_E * ecl.y + MW_COS_E * ecl.z);
  float ra = atan(eq.y, eq.x);
  float dec = asin(clamp(eq.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 - ra / 6.2831853), 0.5 + dec / 3.1415927);
  // Derivatives across the wrap at RA = 12 h taken the short way round.
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  vec2 size = vec2(textureSize(uMwTex, 0));
  float n = exp2(uMwMinLod);
  // Near the celestial poles the map's rows are tiny rings: a texel is 10.5′ in Dec but only
  // cos(Dec) × 10.5′ across, so its faint stars would show as grainy radial streaks. The footprint
  // is taken on the sky and then back onto the map: at least n texels of sky each way (many texels
  // along a row near the poles), no thinner than a quarter of its length, averaged over by the
  // anisotropic filter and the coarser levels.
  vec2 iso = vec2(max(cos(dec), 1e-3), 1.0);
  vec2 fa;
  vec2 fb;
  footprint(dx * size * iso, dy * size * iso, n, fa, fb);
  fa /= iso;
  fb /= iso;
  vec2 ea = atLeast(fa * iso * 4.0, 4.0 * n) / iso;
  vec2 eb = atLeast(fb * iso * 4.0, 4.0 * n) / iso;
  vec3 e = textureGrad(uMwTex, uv, fa / size, fb / size).rgb;
  vec3 c = textureGrad(uMwTex, uv, ea / size, eb / size).rgb;
  vec3 p = MW_P0 * (exp(e * MW_LN) - 1.0);
  eye = MW_P0 * (exp(c * MW_LN) - 1.0);
  if (uMwDetailOn > 0.5) {
    vec2 dsize = vec2(textureSize(uMwDetail, 0));
    vec2 ga;
    vec2 gb;
    footprint(dx * dsize * iso, dy * dsize * iso, 1.0, ga, gb);
    ga /= iso;
    gb /= iso;
    float yf = MW_P0 * (exp(textureGrad(uMwDetail, uv, ga / dsize, gb / dsize).r * MW_LN) - 1.0);
    float yc = MW_P0 * (exp(textureGrad(uMwDetail, uv, fa / size, fb / size).r * MW_LN) - 1.0);
    // Steadied where the sky is nearly black (its noise would flicker).
    p *= clamp((yf + 0.5 * MW_P0) / (yc + 0.5 * MW_P0), 0.0, 8.0);
  }
  // The faint stars' light, in the map's own colour there (grey where the map is black).
  float fe = MW_P0 * (exp(textureGrad(uMwFaint, uv, fa / size, fb / size).r * MW_LN) - 1.0);
  float fc = MW_P0 * (exp(textureGrad(uMwFaint, uv, ea / size, eb / size).r * MW_LN) - 1.0);
  float pm = (p.r + p.g + p.b) / 3.0;
  float em = (eye.r + eye.g + eye.b) / 3.0;
  p = pm > 1e-7 ? p * (1.0 + fe / pm) : p + fe;
  eye = em > 1e-7 ? eye * (1.0 + fc / em) : eye + fc;
  return p;
}

// The colour drawn for p, its brightness multiplied by k (Doppler brightening and the exposure: 1 at
// rest), faded out where the light over the eye's scale is too faint to see. The handover to the
// model blends pictures (render/galaxyLayer.ts): the map's share weights what is drawn, not the
// light, so the eye's threshold stays on the map's own light.
vec3 milkyWayDisplay(vec3 p, vec3 eye, float k) {
  float mean = (p.r + p.g + p.b) / 3.0;
  float lum = dot(p, vec3(0.2126, 0.7152, 0.0722));
  float eyeMean = (eye.r + eye.g + eye.b) / 3.0;
  if (mean <= 0.0 || lum <= 0.0 || k <= 0.0 || eyeMean <= 0.0) return vec3(0.0);
  float mu = MW_SB_ZERO - 1.0857362 * log(eyeMean * k);
  float seen = 1.0 - smoothstep(uMwMuFade.x, uMwMuFade.y, mu);
  if (seen <= 0.0) return vec3(0.0);
  return (p / lum) * sqrt(uMwScale * mean * k) * seen * uMwGain;
}
