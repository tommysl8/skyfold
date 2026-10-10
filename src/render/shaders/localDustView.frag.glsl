// The neighbourhood's dust in the view: the camera's dust sky (localDust.frag.glsl, a galactic plate carrée marched
// from about where the camera is) read along each pixel's rest-frame ray, into the three small targets the sky map, the
// Galaxy layer and the stars read (localDustRead.glsl). A plain lookup a pixel, so the march itself is redone only when
// the camera has moved (render/dustLayer.ts); turning the view costs nothing more.
//
// Writes: out0 the column at the four camera knots; out1 t0, t1 and the scattered share of J; out2 A_sky (the camera's
// whole column less the Sun's in the same direction: the sky map's dust is moved, not added; held to −uDeredMax at
// least) and A_model. While a newer dust sky fades in (uFade from 0 to 1) the two are mixed, so a refresh never pops.
//
// Twins: the ray of remap.frag.glsl (aberration), localDust.frag.glsl skyDir (the plate carrée).
precision highp float;

in vec2 vUv;
layout(location = 0) out vec4 out0;
layout(location = 1) out vec4 out1;
layout(location = 2) out vec4 out2;

uniform sampler2D uMap0;     // the camera's dust sky: knots
uniform sampler2D uMap1;     // t0, t1, scattered share, A_model
uniform sampler2D uPrev0;    // the one before it, fading out
uniform sampler2D uPrev1;
uniform float uFade;         // the newer one's share
uniform sampler2D uSun1;     // the Sun's sky, knots 5–8 (w: the whole column)
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform mat3 uWorldToGal;
uniform vec3 uVelDir;        // this half's observer (relativity uniforms)
uniform float uEPhi;
uniform float uDeredMax;     // mag

void main() {
  // The rest-frame ray (the remap pass's aberration; uEPhi = 1 at rest).
  vec4 q = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(q.xyz / q.w));
  vec3 perp = d - dot(d, uVelDir) * uVelDir;
  float sp = length(perp);
  float th = 2.0 * atan(uEPhi * length(d - uVelDir), length(d + uVelDir));
  vec3 dRest = sp > 1e-12 ? cos(th) * uVelDir + sin(th) * (perp / sp) : d;
  vec3 e = normalize(uWorldToGal * dRest);
  vec2 uv = vec2(fract(atan(e.y, e.x) / 6.283185307179586), 0.5 + asin(clamp(e.z, -1.0, 1.0)) / 3.141592653589793);
  vec4 a = textureLod(uMap0, uv, 0.0);
  vec4 b = textureLod(uMap1, uv, 0.0);
  if (uFade < 1.0) {
    a = mix(textureLod(uPrev0, uv, 0.0), a, uFade);
    b = mix(textureLod(uPrev1, uv, 0.0), b, uFade);
  }
  float aSun = textureLod(uSun1, uv, 0.0).w;
  out0 = a;
  out1 = vec4(b.xyz, 0.0);
  out2 = vec4(max(a.w - aSun, -uDeredMax), b.w, 0.0, 0.0);
}
