// A galaxy's photograph (scene/GalaxyPictures.tsx; sim/cosmos/pictures.ts), drawn into the Galaxy layer's target
// with the galaxies' particles (render/galaxyLayer.ts) so that one display law and one eye threshold show both: a
// grid of vertices over the photograph's rectangle on the sky, each taken along the line of sight from the Sun onto
// the galaxy's plane (picturePoint), placed from the camera in kiloparsecs (the galaxy's centre worked out in float64
// on the CPU), drawn at unit distance along its direction like the stars, and in flight aberrated vertex by vertex
// (the grid lets a large picture curve as the sky does).
//
// Drawn only in the layer's first pass (its fine target), or in the single pass of a half of the split view and of
// a face of a black hole's sky cube: never in the large splats' pass.
//
// Twins: sim/cosmos/pictures.ts (picturePlane: where the corners lie), scene/GalaxyPictures.tsx (the light).
#include <common>
#include <lightspeed_relativity>

uniform vec3 uRel;    // the galaxy's centre from the camera, kpc, world axes
uniform vec3 uSky;    // the photograph's centre on the sky at the galaxy's distance, from the galaxy's centre, kpc
uniform vec3 uRight;  // half its width along image-right there, kpc
uniform vec3 uUp;     // half its height along image-up, kpc
uniform vec3 uNormal; // the normal of the plane it is laid on
uniform vec3 uLos;    // our line of sight to the galaxy (unit)
uniform float uDist;  // the galaxy's distance from the Sun, kpc
uniform float uBigPass;

varying vec2 vUv;
varying float vGeom; // cos³ of the angle from the view's axis over |cos| of the angle to the plane's normal
varying float vLnD;

void main() {
  if (uBigPass > 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 s = uSky + (2.0 * uv.x - 1.0) * uRight + (2.0 * uv.y - 1.0) * uUp;
  float sn = dot(s, uNormal);
  float rn = dot(uLos, uNormal);
  vec3 rel = uRel + (s - uLos * (sn / rn)) / (1.0 + sn / (uDist * rn));
  vec3 dir = normalize(rel);
  float lnD;
  vec3 dShip = relAberrate(dir, lnD);
  vUv = uv;
  vLnD = lnD;
  vec3 v = mat3(viewMatrix) * dShip;
  // A pixel off the view's axis sees ω² cos³θ of sky, and the particles' light per pixel follows that (their kernels
  // are fixed in pixels); a thin sheet of stars seen at a slant shows its light over 1/|cos| less sky.
  float c = max(-v.z, 0.0);
  vGeom = c * c * c / max(abs(dot(dir, uNormal)), 0.05);
  gl_Position = projectionMatrix * vec4(v, 1.0);
}
