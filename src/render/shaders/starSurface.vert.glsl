// A star's close-up disc (materials.ts createStarSurfaceMaterial; sim/stars/closeup.ts). Lighting-free: the surface
// shines by itself. The mesh is the star's own shape (a sphere, a Roche surface or a stretched wind) with its
// normals and, per vertex, its temperature as a fraction of the pole's (gravity darkening: aTemp).
#include <common>
#include <logdepthbuf_pars_vertex>

attribute float aTemp;

varying vec3 vNormalW;
varying vec3 vPosW;
// Where on the star, in the star's own (turning) frame: the cells, spots and flares are fixed to it.
varying vec3 vDir;
varying float vTemp;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  vDir = normalize(position);
  vTemp = aTemp;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
