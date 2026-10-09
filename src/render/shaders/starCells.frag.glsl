// A star's convection pattern, baked into one face of a cube map (render/starCells.ts) that the close-up disc samples
// (starSurface.frag.glsl): red = the giant cells (red supergiants), green = the granules, each −1 … 1 stored as
// 0 … 1. Baking one face a frame instead of evaluating cells per pixel keeps a disc filling the screen cheap.
// The cells are a model (sim/stars/closeup.ts): Worley cells whose centres wander, with a gentle warp.

uniform int uFace;          // the cube face being baked (+X, −X, +Y, −Y, +Z, −Z)
uniform float uSize;        // face size, texels
uniform float uGranFreq;    // cells per unit of direction (about sqrt(N / 4π)); 0 for none
uniform float uGiantFreq;
uniform float uTime;        // the surface's clock, in turnovers

// A hash without sines (D. Hoskins): stable for the cell indices of many cells.
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Cellular pattern at p: x = distance to the nearest cell's centre, y = to the next nearest, z = that cell's
// random number. Each centre wanders slowly about its lattice point (within a quarter cell, so the 27 neighbours
// searched hold both nearest), and cells grow, merge and fade over a turnover.
vec3 cells(vec3 p, float t) {
  vec3 ip = floor(p);
  vec3 fp = p - ip;
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int k = -1; k <= 1; k++)
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 h = hash33(ip + g);
        vec3 o = 0.5 + 0.25 * sin(6.2831853 * (h + t * (0.35 + 0.3 * h.yzx)));
        vec3 r = g + o - fp;
        float d = dot(r, r);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = h.x;
        } else if (d < f2) f2 = d;
      }
  return vec3(sqrt(f1), sqrt(f2), id);
}

// Bright, rounded cell interiors (hot gas rising), narrow dark lanes between them (cool gas sinking), each cell
// brightening and fading on its own phase; the lattice bent by a gentle warp so the cells are not polygons.
float convection(vec3 p, float t) {
  p += 0.22 * sin(p.yzx * 1.7 + 6.2831853 * 0.13 * t) + 0.11 * sin(p.zxy * 3.1 - 6.2831853 * 0.07 * t);
  vec3 c = cells(p, t);
  float lane = smoothstep(0.02, 0.6, c.y - c.x);
  float dome = 1.0 - 0.5 * c.x * c.x;
  float life = 0.75 + 0.25 * sin(6.2831853 * (t * 0.8 + c.z));
  return clamp(2.0 * lane * dome * life - 1.0, -1.0, 1.0);
}

void main() {
  // The direction of this texel, by the cube map's own convention (OpenGL ES 3.0 §3.8.10): face, then s and t.
  float s = 2.0 * gl_FragCoord.x / uSize - 1.0;
  float t = 2.0 * gl_FragCoord.y / uSize - 1.0;
  vec3 d;
  if (uFace == 0) d = vec3(1.0, -t, -s);
  else if (uFace == 1) d = vec3(-1.0, -t, s);
  else if (uFace == 2) d = vec3(s, 1.0, t);
  else if (uFace == 3) d = vec3(s, -1.0, -t);
  else if (uFace == 4) d = vec3(s, -t, 1.0);
  else d = vec3(-s, -t, -1.0);
  d = normalize(d);
  float giant = uGiantFreq > 0.0 ? convection(d * uGiantFreq, uTime) : 0.0;
  float gran = uGranFreq > 0.0 ? convection(d * uGranFreq, uTime * 3.0 + 17.0) : 0.0;
  gl_FragColor = vec4(0.5 + 0.5 * giant, 0.5 + 0.5 * gran, 0.0, 1.0);
}
