// A galaxy's photograph as light in the Galaxy layer (galaxyPicture.vert.glsl). The image holds a light map, the
// photograph's own colours times its luminance, so that the layer's display law (luminance ∝ √light) shows the
// photograph's tones; its mean luminance is known (pictures.json meanLight), and uSurface scales it so that the whole
// picture holds the galaxy's measured light, as the model's particles do (scene/GalaxyPictures.tsx): the target's
// unit, the flux in V = 0 stars within a faint star's image area. Like the particles it is Doppler shifted in flight,
// as a black body of the galaxy's colour, and redshifted by the expansion (ln(1 + z)). Alpha 0, as the particles.
#include <lightspeed_relativity>

uniform sampler2D uMap;
uniform float uSurface; // light per unit of the map's luminance, before vGeom
uniform float uLnT;     // ln of the galaxy's colour temperature (its typical B − V)
uniform float uLn1pz;   // ln(1 + z) of its light from the expansion

varying vec2 vUv;
varying float vGeom;
varying float vLnD;

void main() {
  vec3 v = texture2D(uMap, vUv).rgb;
  float l = dot(v, vec3(0.2126, 0.7152, 0.0722));
  if (l <= 0.0) discard;
  float lnK = uLnExposure;
  vec3 tint = vec3(1.0);
  float lnDe = vLnD - uLn1pz;
  if (lnDe != 0.0) {
    // A surface: its radiance changes as a black body's seen at T D (the shrinking of its solid angle is in the
    // aberrated vertices already).
    vec4 a = blackbodyLn(uLnT);
    vec4 b = blackbodyLn(uLnT + lnDe);
    lnK += b.a - a.a;
    tint = b.rgb / max(a.rgb, vec3(1e-3));
  }
  float f = uSurface * vGeom * exp(clamp(lnK, -80.0, 40.0));
  gl_FragColor = vec4(v * tint * f, 0.0);
}
