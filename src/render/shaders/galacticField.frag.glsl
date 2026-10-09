// Field lines of the Milky Way's magnetic field (galacticField.vert.glsl): added light. Along each line the
// brightness ramps up over every uDash kiloparsecs of its length and drops back, so each dash is brightest at
// its forward end: the dashes point the way the field points.
#include <logdepthbuf_pars_fragment>
uniform float uDash;
varying vec3 vColor;
varying float vArc;
void main() {
  #include <logdepthbuf_fragment>
  float f = fract(vArc / uDash);
  gl_FragColor = vec4(vColor * (0.3 + 0.7 * f * f), 1.0);
}
