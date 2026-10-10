// The Sun's neighbourhood in 3D dust (sim/dust; docs/data/dust.md): a ray march through the map of Edenhofer et al.
// (2024) along every direction of a galactic plate carrée from one place (render/dustLayer.ts): the camera's "dust sky",
// which a cheap pass turns into the view each frame (localDustView.frag.glsl), and the Sun's own (uMode 1), marched
// once, which the stars and the sky map read to take out the dust already in what Earth sees.
//
// What: the line of sight from the origin through the two nested grids (3D textures of V-band extinction density,
// mag/kpc, with their mipmaps), clipped to the map's box and its 1,250 pc sphere. Pixel (u, v) looks along galactic
// l = 360° u, b = 180° (v − ½). Writes, from the camera's place:
//   out0  A_V (mag) at the four distances of sim/dust/volume.ts cameraKnots(t0, t1) (the last: the whole column);
//   out1  t0, t1 (pc: where the line enters and leaves the map), the share of the mean starlight J scattered towards
//         the origin (albedo 0.5, single scattering: sim/dust/light.ts), and A_model: the change the map makes to the
//         Galaxy model's light, whose smooth dust (Drimmel & Spergel) it replaces inside the map (see below);
// and, from the Sun: out0, out1 the column at the eight distances of SUN_KNOTS_PC.
//
// Steps: from where the line enters the map, each max(voxel, uStepK · t) long (fine near the origin, longer far away,
// as a texel's footprint grows), the density read at the step's middle from the mip level of the step's length (an
// average over it, so the long steps lose no dust); the inner grid where the step lies in it; a block of 8³ voxels
// whose largest density is under uSkipBelow is stepped over at once (the Local Bubble, the empty outskirts); the
// march stops once the column passes 12 mag (nothing behind it shows). At most MAX_STEPS steps. No loop indexes an
// array and every texture read gives its level: Direct3D's shader compiler (ANGLE on Windows) otherwise unrolls the
// loop, which took minutes.
//
// The Galaxy model's light: the model dims every particle by its smooth dust; inside the map that dust is taken out
// along the line (its column across the map, A_DS, from the model's own face-on maps: columnAV, the twin of
// galaxy.vert.glsl's) and the map's put in instead. The model's light along the line is taken to be spread as its
// thin disc (exp(−|z − uMidZ| / uDiscH), from the origin to uFarPc past the map's far side), so a cloud dims only
// the light from behind it: A_model = −2.5 log10(T_map / T_DS), each T the disc-light-weighted transmission, with the
// smooth column taken to grow evenly across the map.
//
// Cost: marched only when the camera has moved enough, a band of rows a frame (render/dustLayer.ts).
//
// Twins: sim/dust/volume.ts (cameraKnots, columnAtKnots, densityAt), sim/dust/light.ts (scatteredShare, discLight).
precision highp float;
precision highp sampler3D;

in vec2 vUv;
layout(location = 0) out vec4 out0;
layout(location = 1) out vec4 out1;

uniform sampler3D uOuter;      // densities, mag/kpc, 10 pc voxels, with mipmaps
uniform sampler3D uInner;      // 4 pc voxels
uniform sampler3D uOuterMax;   // the largest density of each 8³ block, mag/kpc (nearest)
uniform sampler3D uInnerMax;
uniform vec3 uOuterMaxSize;    // the block textures' extents, pc (whole blocks: a little beyond the grids)
uniform vec3 uInnerMaxSize;
uniform vec3 uOuterMin;        // box corners and sizes, pc
uniform vec3 uOuterSize;
uniform float uOuterVoxel;
uniform vec3 uInnerMin;
uniform vec3 uInnerSize;
uniform float uInnerVoxel;
uniform float uInnerOn;        // 1 once the inner grid has loaded
uniform float uMapRadius;      // 1,250 pc: the map's outer sphere
uniform float uSkipBelow;      // mag/kpc
uniform float uStepK;
uniform float uMode;           // 0: from the camera; 1: the Sun's sky
uniform float uSunKnots[8];
uniform vec3 uOrigin;          // where the camera's dust sky is marched from, heliocentric galactic pc
uniform float uAlbedo;
// The Galaxy model's smooth dust (galaxy.vert.glsl's maps), and its light along the line.
uniform float uModelOn;
uniform sampler2D uDust;
uniform sampler2D uWarpMap;
uniform float uDustExtent;
uniform mat3 uGalToG;
uniform vec3 uSunG;
uniform float uDiscH;          // pc
uniform float uMidZ;           // pc, heliocentric
uniform float uFarPc;          // pc

const int MAX_STEPS = 128;
const float LN10_04 = 0.9210340371976184; // 0.4 ln 10: 10^(−0.4 A) = exp(−A · this)
const float BLOCK = 8.0;
const float OPAQUE_MAG = 12.0;

// The ray's entry and exit of a box (slab method), or t1 < t0 when it misses.
vec2 boxHit(vec3 o, vec3 e, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / e;
  vec3 ta = (bmin - o) * inv;
  vec3 tb = (bmax - o) * inv;
  vec3 tmin = min(ta, tb);
  vec3 tmax = max(ta, tb);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

vec2 sphereHit(vec3 o, vec3 e, float r) {
  float b = dot(o, e);
  float c = dot(o, o) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

bool insideBox(vec3 p, vec3 bmin, vec3 size) {
  vec3 q = (p - bmin) / size;
  return all(greaterThanEqual(q, vec3(0.0))) && all(lessThanEqual(q, vec3(1.0)));
}

// How far along e (pc) the ray at p leaves its block of 8³ voxels of a grid.
float blockExit(vec3 p, vec3 e, vec3 bmin, float voxel) {
  vec3 q = (p - bmin) / (voxel * BLOCK);
  vec3 cell = floor(q);
  vec3 edge = cell + step(vec3(0.0), e);
  vec3 t = (edge - q) / e;
  t = mix(t, vec3(1e9), lessThan(abs(e), vec3(1e-9)));
  return max(min(min(t.x, t.y), t.z), 0.0) * voxel * BLOCK;
}

// Error function, Abramowitz & Stegun 7.1.26 (as galaxy.vert.glsl's).
float erfA(float x) {
  float s = sign(x);
  float t = 1.0 / (1.0 + 0.3275911 * abs(x));
  float y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return s * y;
}

// V-band extinction (mag) of the model's smooth dust from a to b (frame G, kpc), in four pieces: galaxy.vert.glsl's
// columnAV (each piece with the face-on maps where it comes closest to the warped midplane, integrated exactly
// through the sech² disc and the Gaussian arm lanes).
float modelColumn(vec3 a, vec3 b) {
  float L = length(b - a) / 4.0;
  float tau = 0.0;
  for (int i = 0; i < 4; i++) {
    vec3 p0 = mix(a, b, float(i) / 4.0);
    vec3 p1 = mix(a, b, float(i + 1) / 4.0);
    vec3 q = p0.z * p1.z <= 0.0 && p0.z != p1.z ? mix(p0, p1, p0.z / (p0.z - p1.z)) : (abs(p0.z) < abs(p1.z) ? p0 : p1);
    if (abs(q.x) > uDustExtent || abs(q.y) > uDustExtent) continue;
    vec2 uv = (q.xy + uDustExtent) / (2.0 * uDustExtent);
    vec4 m = textureLod(uDust, uv, 0.0);
    float zw = textureLod(uWarpMap, uv, 0.0).r;
    float za = p0.z - zw;
    float zb = p1.z - zw;
    float dz = zb - za;
    if (abs(dz) < 1e-4 * L) {
      float s = 1.0 / cosh(za / m.y);
      tau += L * (m.x * s * s + m.z * exp(-za * za / (m.w * m.w)));
    } else {
      float disc = m.x * m.y * (tanh(zb / m.y) - tanh(za / m.y));
      float arms = m.z * m.w * 0.8862269 * (erfA(zb / m.w) - erfA(za / m.w));
      tau += (L / dz) * (disc + arms);
    }
  }
  return tau;
}

// The thin disc's light between ta and tb along the ray (sim/dust/light.ts discLight).
float discF(float z) {
  return z >= 0.0 ? uDiscH * (1.0 - exp(-z / uDiscH)) : -uDiscH * (1.0 - exp(z / uDiscH));
}
float discLight(float z0, float ez, float ta, float tb) {
  if (tb <= ta) return 0.0;
  float za = z0 - uMidZ + ez * ta;
  float zb = z0 - uMidZ + ez * tb;
  if (abs(ez) < 1e-6) return (tb - ta) * exp(-abs(za) / uDiscH);
  return (discF(zb) - discF(za)) / ez;
}

// The direction of this texel: galactic plate carrée, l = 360° u, b = 180° (v − ½).
vec3 skyDir() {
  float l = vUv.x * 6.283185307179586;
  float b = (vUv.y - 0.5) * 3.141592653589793;
  return vec3(cos(b) * cos(l), cos(b) * sin(l), sin(b));
}

void main() {
  bool sun = uMode > 0.5;
  vec3 o = sun ? vec3(0.0) : uOrigin;
  vec3 e = skyDir();
  // Where the line is in the map: its box and its sphere.
  vec2 hb = boxHit(o, e, uOuterMin, uOuterMin + uOuterSize);
  vec2 hs = sphereHit(o, e, uMapRadius);
  float t0 = max(max(hb.x, hs.x), 0.0);
  float t1 = min(hb.y, hs.y);
  // The knots: the Sun's eight distances, or the view's four (cameraKnots), as two vectors; a knot's column is kept
  // as the step that crosses it passes (vector arithmetic, no indexing: Direct3D's compiler unrolls indexed loops).
  vec4 k0;
  vec4 k1;
  if (sun) {
    k0 = vec4(uSunKnots[0], uSunKnots[1], uSunKnots[2], uSunKnots[3]);
    k1 = vec4(uSunKnots[4], uSunKnots[5], uSunKnots[6], uSunKnots[7]);
  } else {
    float a = max(t0, 10.0);
    float r = t1 > a ? pow(t1 / a, 0.25) : 1.0;
    k0 = vec4(a * r, a * r * r, a * r * r * r, max(t1, t0));
    k1 = vec4(1e9);
  }
  vec4 ka0 = vec4(0.0);
  vec4 ka1 = vec4(0.0);
  vec4 done0 = vec4(0.0);
  vec4 done1 = vec4(0.0);
  float A = 0.0;
  float scat = 0.0;
  float t = t0;
  // The model's light: its thin disc along the line, weighted by the map's transmission (lE) and by its own smooth
  // dust's, taken to grow evenly across the map (lD).
  bool model = !sun && uModelOn > 0.5 && t1 > t0;
  float aDS = 0.0;
  float lE = 0.0;
  float lD = 0.0;
  if (model) {
    vec3 ga = uGalToG * ((o + e * t0) * 0.001) + uSunG;
    vec3 gb = uGalToG * ((o + e * t1) * 0.001) + uSunG;
    aDS = modelColumn(ga, gb);
  }
  float chord = max(t1 - t0, 1e-3);
  if (t1 > t0) {
    for (int i = 0; i < MAX_STEPS; i++) {
      if (t >= t1) break;
      vec3 p = o + e * t;
      bool inner = uInnerOn > 0.5 && insideBox(p, uInnerMin, uInnerSize);
      float voxel = inner ? uInnerVoxel : uOuterVoxel;
      vec3 bmin = inner ? uInnerMin : uOuterMin;
      vec3 size = inner ? uInnerSize : uOuterSize;
      float ds = max(voxel, uStepK * t);
      float rho = 0.0;
      float bmax = inner ? textureLod(uInnerMax, (p - bmin) / uInnerMaxSize, 0.0).r : textureLod(uOuterMax, (p - bmin) / uOuterMaxSize, 0.0).r;
      if (bmax < uSkipBelow) {
        // An empty block: step to its far side (and a little beyond).
        ds = max(ds, blockExit(p, e, bmin, voxel) + 0.01 * voxel);
      } else {
        vec3 mid = p + e * (0.5 * min(ds, t1 - t));
        vec3 uvwm = (mid - bmin) / size;
        float lod = max(0.0, log2(ds / voxel));
        rho = 0.001 * (inner ? textureLod(uInner, uvwm, lod).r : textureLod(uOuter, uvwm, lod).r);
      }
      ds = min(ds, t1 - t);
      float tn = t + ds;
      float dA = rho * ds;
      // The knots this step crosses.
      vec4 c0 = step(k0, vec4(tn)) * (1.0 - done0);
      vec4 c1 = step(k1, vec4(tn)) * (1.0 - done1);
      ka0 += c0 * (A + dA * clamp((k0 - t) / max(ds, 1e-6), 0.0, 1.0));
      ka1 += c1 * (A + dA * clamp((k1 - t) / max(ds, 1e-6), 0.0, 1.0));
      done0 += c0;
      done1 += c1;
      float T0 = exp(-LN10_04 * A);
      float T1 = exp(-LN10_04 * (A + dA));
      scat += T0 - T1;
      if (model) {
        float j = discLight(o.z, e.z, t, tn);
        lE += j * 0.5 * (T0 + T1);
        lD += j * exp(-LN10_04 * aDS * ((0.5 * (t + tn) - t0) / chord));
      }
      A += dA;
      t = tn;
      if (A > OPAQUE_MAG) {
        // Nothing behind shows: the rest of the line adds no light and no measurable column.
        if (model) lD += discLight(o.z, e.z, t, t1) * exp(-LN10_04 * aDS * 0.5);
        break;
      }
    }
  }
  // Knots not reached hold the whole column (or nothing, before the map starts along the line).
  ka0 += (1.0 - done0) * step(vec4(t0), k0) * A;
  ka1 += (1.0 - done1) * step(vec4(t0), k1) * A;
  if (sun) {
    out0 = ka0;
    out1 = ka1;
    return;
  }
  float aModel = 0.0;
  if (model) {
    // The light that reaches the origin with the map's dust over that with the model's own (the same light emitted).
    float front = discLight(o.z, e.z, 0.0, t0);
    float back = discLight(o.z, e.z, t1, t1 + uFarPc);
    float withMap = front + lE + back * exp(-LN10_04 * A);
    float withModel = front + lD + back * exp(-LN10_04 * aDS);
    aModel = -1.0857362047581294 * log(max(withMap, 1e-30) / max(withModel, 1e-30));
  }
  out0 = ka0;
  out1 = vec4(t0, t1 > t0 ? t1 : t0, uAlbedo * scat, aModel);
}
