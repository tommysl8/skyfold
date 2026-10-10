// Chunk `lightspeed_galaxycomposite`: the display law of the Galaxy layer, shared by its plain composite
// (render/galaxyLayer.ts, over the screen outside the lens box) and the lensed one (lensComposite.frag.glsl and
// lensBand.frag.glsl, inside it), so both show the same light the same way.
//
// What: the Galaxy layer's targets hold linear light: at each pixel the flux (in V = 0 stars) within a faint star's
// image area, f, with the Milky Way model's share of it in alpha. galaxyDisplay draws it as the stars and the sky
// from the Sun are drawn: luminance uGain √f (a faint star of flux f peaks at uStarGain √f), with the stars' raised
// saturation, faded out below what the eye could see (uFade: f at 24 and at 22 mag/arcsec²). Near the Sun the model
// hands over from the sky map (sim/galaxy/background.ts modelShare): the view is then the picture with the model,
// weighted by its share w, plus the picture without it, weighted 1 − w, while the sky map is drawn with weight 1 − w
// (shaders/milkyway.glsl). Blending the two pictures, rather than the light inside the square root, keeps the band
// from brightening half-way through the handover (√(½) + √(½) > 1) and keeps the eye's threshold on the whole
// model's light.
//
// The neighbourhood's dust (shaders/localDustRead.glsl) is applied to the light first, at the pixel: the model's own
// smooth dust replaced by the 3D map's inside the map, and the light the clouds scatter added (as the model's).
//
// Rules: includes only lightspeed_localdust (whose uniforms every material of this chunk takes: galaxyLayer.ts
// inputs); declares only the three uniforms of the law.
//
// Cost: a few operations a pixel.
//
// Twin: sim/galaxy/background.ts (patchFlux, modelShare: the thresholds and the share).
#include <lightspeed_localdust>
uniform vec2 uFade;
uniform float uGain;
uniform float uModelShare;

vec3 shown(vec3 c, float f) {
  if (f <= uFade.x) return vec3(0.0);
  vec3 col = max(vec3(0.0), 1.0 + 1.5 * (c / f - 1.0));
  return col * (uGain * sqrt(f) * smoothstep(uFade.x, uFade.y, f));
}

// The Galaxy layer's summed light t (rgb; the model's share of its luminance in a) as drawn.
vec3 galaxyDisplay(vec4 t) {
  t = localDustModel(gl_FragCoord.xy * uLocalDustOn.yz, t);
  vec3 c = t.rgb;
  float f = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 withModel = shown(c, f);
  if (uModelShare >= 1.0 || t.a <= 0.0) return withModel;
  // Without the model: the rest of the light, in the same colour.
  float rest = max(f - t.a, 0.0);
  vec3 withoutModel = shown(c * (rest / max(f, 1e-30)), rest);
  return mix(withoutModel, withModel, uModelShare);
}
