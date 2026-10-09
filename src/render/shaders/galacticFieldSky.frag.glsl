// The magnetic field's direction over the sky as seen from the Solar System (scene/GalacticField.tsx; sim/galaxy/
// fieldView.ts): a line-integral-convolution texture (scripts/build-field-sky.mjs) whose streaks run along the field on
// the plane of the sky, measured from the polarisation of the Milky Way's microwave emission. One channel, linear: the
// streaks' contrast already weighted by the polarised intensity. It is drawn faint and added over the sky, under
// everything else (as the CMB map is: cmbMap.frag.glsl). The texture is in galactic coordinates laid out as the CMB
// map's: the Galactic centre in the middle, longitude increasing to the left, v = 0 at the top (three.js flips it).
// Its texels hold only the streaks' bright cores (0 between them), so the sky between stays as it is.
uniform sampler2D uSkyTex;
uniform mat3 uWorldToGal;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform float uGain;
uniform vec3 uTint;

varying vec2 vUv;

void main() {
  vec4 q = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(q.xyz / q.w));
  vec3 g = uWorldToGal * d;
  float l = atan(g.y, g.x);
  float b = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 - l / 6.283185307179586), 0.5 + b / 3.141592653589793);
  // Derivatives across the seam at l = 180° taken the short way round (no one-pixel line there).
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  float v = textureGrad(uSkyTex, uv, dx, dy).r;
  gl_FragColor = vec4(uTint * (uGain * v), 1.0);
}
