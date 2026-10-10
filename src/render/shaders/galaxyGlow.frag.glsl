// The Galaxy model's light near the camera as a smooth glow (sim/galaxy/glow.ts, whose nearGlow is
// this integration in TypeScript, for the tests). The thin and thick discs and the young arm stars
// are smooth laws of the model; near the camera their particles are few and each seen hundreds of
// parsecs wide, so there their light is worked out along each line of sight instead, through the
// model's dust, and their particles take over further out (galaxy.vert.glsl: the two cross over
// between s0 and s1). Added into the Galaxy layer's target in its units: the flux, in V = 0 stars
// relative to the exposure, that falls within a faint star's image area (its luminance in alpha, as
// the model's particles).
//
// In flight the pixel's ship-frame direction is taken back to the rest frame (the inverse of the
// aberration of point sources), and each population's light is brightened and recoloured as a
// blackbody of its colour temperature seen with the Doppler factor D (a surface's radiance becomes
// that of a blackbody at D T).
//
// Near Sagittarius A* (within 1 kpc) the same pass draws the glow of the nuclear star cluster and disc: the laws of
// sim/galaxy/nuclearGlow.json times u - w s(r) (sim/galaxy/nuclearCluster.ts: u the field's share of their light,
// 1 within 500 pc of the hole, where the Galaxy model's particles of them fade as the camera nears them, w the
// points' share, 1 within 30 pc, s(r) the share of the light in the points drawn), marched along each straight
// line of sight (nscMarch: 16 cells, 8 at the lens's quality rung 1, in t with s = s0 + a sinh t about the
// ray's closest approach to the hole, cut where the ray enters and leaves the field's inner hole and crosses
// the disc's inner cylinder, where the light jumps, and ended at the field's edge), with no dust (as the
// points; the model's dust is thin there). The model's own particles of the two populations take 1 - u. The lens
// resamples it as if from far away, which it partly is not (docs/data/blackholes.md §3, label 4). Inside M87, M87's
// own starlight near the camera: a table of the column against the angle from its centre (sim/galaxy/glow.ts
// m87ColumnTable), the light its model galaxy's particles no longer draw there.
//
// Cost: the discs' march as before; the nuclear march 0.24 ms a frame on the target laptop 4,000 au from Sgr A*
// (0.2 at 8 cells) at the coarse target's resolution, 0.1 at 100-300 pc, 0.06 at 700 pc (only the pixels whose
// rays pass within 300 pc of it march), nothing beyond 1 kpc (its pieces are scalars: with arrays indexed by a
// variable it cost 0.3-0.4); M87's table read, two texel fetches a pixel, 0.04-0.06 ms, only inside M87.
// Every addition is behind a uniform: with them off (x = y = w = 0, z = 1) the discs' glow is
// computed exactly as before. Twins: sim/galaxy/glow.ts (nearGlow, nuclearMarch, m87ColumnAt).
#include <common>
#include <lightspeed_relativity>

uniform vec3 uCamG;        // camera in frame G, kpc
uniform mat3 uGalToWorld;  // heliocentric galactic → world axes
uniform mat3 uGalToG;      // heliocentric galactic → frame G (rotation)
uniform sampler2D uDust;   // face-on dust maps in frame G: disc a_V, disc height, arm a_V, arm height
uniform sampler2D uWarpMap; // r: height of the warped midplane (kpc); g: the young arm stars' surface brightness (L☉/pc²)
uniform float uDustExtent; // the maps cover ±uDustExtent kpc
uniform float uLumGain;    // the model's share of the sky (crossfade with the sky from the Sun)
uniform float uPxPerRad;   // target pixels per radian (the main target)
uniform float uResScale;   // target pixels per device pixel
uniform float uPixelRatio;
uniform float uMagZero;
uniform vec4 uGlowThin;    // surface brightness at R = 0 (L☉/pc²), hR, hz, Rmax (kpc)
uniform vec4 uGlowThick;
uniform float uGlowYoungHz; // kpc
uniform vec4 uGlowRange;   // the discs' s0 and s1, the young arm stars' s0 and s1 (kpc)
uniform vec3 uGlowThinRgb; // linear sRGB of luminance 1
uniform vec3 uGlowYoungRgb;
uniform vec3 uGlowThickRgb;
uniform vec3 uGlowLnT;     // ln of their colour temperatures (K): thin, young, thick
uniform vec2 uFaceShare;   // the discs' (x) and the young arm stars' (y) share drawn from the face-on maps (galaxyFace.frag.glsl)
// The nuclear field and M87 (sim/galaxy/nuclearCluster.ts nscGlowUniforms).
uniform vec4 uNscGlowOn;   // x: the points' share w; y: M87's starlight on; z: the discs' glow on; w: the field's share u (0: no march)
uniform vec3 uNscCamHi;    // camera - Sgr A*, frame G's axes, pc: hi + lo
uniform vec3 uNscCamLo;
uniform float uNscSteps;   // cells of the nuclear march (at most 16)
uniform vec4 uNscLaw;      // the cluster: rho0 (L_sun/pc^3), r_b (pc), gamma, beta
uniform vec4 uNscLaw2;     // alpha, 1/q, m_max (pc), the field's inner radius (pc)
uniform vec4 uNsdLaw;      // the disc: rho0, r_b, 1/h_z (1/pc), R_min (pc)
uniform vec4 uNsdLaw2;     // R_edge (pc), the field's outer radius (pc), inner and outer slopes
uniform highp sampler2D uNscShare; // 64 x 1: r the cluster's point share, g the disc's
uniform vec2 uNscShareAxis; // ln r of node 0 (pc), nodes per unit ln r
uniform float uNscLocal;   // the column standing in for the points within 0.01 pc of the camera (L_sun/pc^2)
uniform vec3 uNscRgb;      // the cluster's glow and the disc's: linear sRGB of luminance 1
uniform vec3 uNsdRgb;
uniform vec2 uNscLnT;      // ln of their colour temperatures (K)
uniform vec3 uM87Dir;      // unit, camera to M87's centre, world axes
uniform highp sampler2D uM87Table; // 64 x 1: ln of the column (L_sun/pc^2) at ln psi = x + i / y
uniform vec2 uM87Axis;
uniform vec3 uM87Rgb;
uniform float uM87LnT;

varying vec3 vRay;

const int GLOW_STEPS = 32;     // as sim/galaxy/glow.ts
const float GLOW_S_SCALE = 0.01; // step ends at GLOW_S_SCALE (e^(kλ) − 1) kpc
const float M_V_SUN = 4.83;
// A red, green and blue channel's extinction as a share of A_V (Cardelli et al. 1989, as the particles).
const vec3 REDDEN = vec3(0.89, 1.0, 1.23);

float erfA(float x) {
  float s = sign(x);
  float t = 1.0 / (1.0 + 0.3275911 * abs(x));
  float y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return s * y;
}

// 1 − e^(−x) for x ≥ 0, without the cancellation of the plain form for small x.
float oneMinusExp(float x) {
  return x < 1e-3 ? x * (1.0 - 0.5 * x * (1.0 - x / 3.0)) : 1.0 - exp(-x);
}

// ∫ e^(−|z|/h) dz from za to zb (sim/galaxy/glow.ts layerColumn). Not as the difference of the integrals from 0:
// many scale heights from the midplane both are h to within float32's precision, and their difference was noise
// of either sign (the young arm stars' 60-pc layer seen from a kiloparsec above or below it), which the colour's
// normalisation below divided by: a saturated white band across the sky. On one side of the midplane the column is
// h e^(−|z|near/h) (1 − e^(−Δ/h)), positive and exact to a few ulp.
float layerColumn(float za, float zb, float h) {
  float a = abs(za) / h;
  float b = abs(zb) / h;
  float m = za * zb >= 0.0 ? h * exp(-min(a, b)) * oneMinusExp(abs(zb - za) / h) : h * (oneMinusExp(a) + oneMinusExp(b));
  return zb >= za ? m : -m;
}

// Ship-frame direction → rest-frame direction, and ln D: the inverse of relAberrate. With the
// half-angles of the ship-frame angle θ′, tan(θ/2) = e^φ tan(θ′/2) and D = 1 / (e^−φ cos²(θ′/2) + e^φ sin²(θ′/2)).
vec3 relUnaberrate(vec3 dShip, out float lnD) {
  if (uPhi <= 0.0) {
    lnD = 0.0;
    return dShip;
  }
  vec3 a = dShip - uVelDir;
  vec3 b = dShip + uVelDir;
  float s2 = dot(a, a);
  float c2 = dot(b, b);
  float n = s2 + c2;
  s2 /= n;
  c2 /= n;
  lnD = -log(uEmPhi * c2 + uEPhi * s2);
  float th = 2.0 * atan(uEPhi * sqrt(s2), sqrt(c2));
  vec3 perp = dShip - dot(dShip, uVelDir) * uVelDir;
  float pl = length(perp);
  if (pl < 1e-12) return c2 >= s2 ? uVelDir : -uVelDir;
  return cos(th) * uVelDir + (sin(th) / pl) * perp;
}

// A population's light seen with Doppler factor e^lnD: its colour (luminance 1) and the ln of its brightening.
vec3 shifted(vec3 rgb, float lnT, float lnD, out float lnK) {
  if (uPhi <= 0.0) {
    lnK = 0.0;
    return rgb;
  }
  vec4 a = blackbodyLn(lnT);
  vec4 b = blackbodyLn(lnT + lnD);
  lnK = b.a - a.a;
  vec3 c = rgb * b.rgb / max(a.rgb, vec3(1e-3));
  return c / max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
}

// The points' share of each component's light at radius r (pc): x the cluster's, y the disc's (linear in ln r).
vec2 nscShare(float r) {
  float u = clamp((log(r) - uNscShareAxis.x) * uNscShareAxis.y, 0.0, 63.0);
  float i = min(floor(u), 62.0);
  vec2 a = texelFetch(uNscShare, ivec2(int(i), 0), 0).rg;
  vec2 b = texelFetch(uNscShare, ivec2(int(i) + 1, 0), 0).rg;
  return mix(a, b, u - i);
}

// The glow's emissivity at p (frame G's axes, pc from Sgr A*), L_sun/pc^3: x the cluster's, y the disc's; each law
// times u - w s(r), u the field's share of their light (uNscGlowOn.w), w the points' (uNscGlowOn.x).
vec2 nscEmissivity(vec3 p) {
  float R2 = dot(p.xy, p.xy);
  float r = sqrt(R2 + p.z * p.z);
  float zq = p.z * uNscLaw2.y;
  float m = sqrt(R2 + zq * zq);
  vec2 j = vec2(0.0);
  if (r >= uNscLaw2.w && m <= uNscLaw2.z) {
    float lx = log(max(m, 1e-6) / uNscLaw.y);
    j.x = uNscLaw.x * exp(-uNscLaw.z * lx + (uNscLaw.z - uNscLaw.w) / uNscLaw2.x * log(1.0 + exp(uNscLaw2.x * lx)));
  }
  float R = sqrt(R2);
  if (R >= uNsdLaw.w && R < uNsdLaw2.x && r <= uNsdLaw2.y) {
    float lx = log(R / uNsdLaw.y);
    j.y = uNsdLaw.x * exp(-(lx < 0.0 ? uNsdLaw2.z : uNsdLaw2.w) * lx - abs(p.z) * uNsdLaw.z);
  }
  return j * (uNscGlowOn.w - uNscGlowOn.x * nscShare(r));
}

// Where the ray s -> c + s n crosses the cylinder R = rho about the galactic pole's axis: the roots s- <= s+ of
// A s^2 + 2B s + C = 0 (A = |n.xy|^2 > 0, B = c.xy . n.xy, C = |c.xy|^2 - rho^2), in the form without cancellation.
bool nscCylinder(float A, float B, float C, out vec2 sc) {
  float disc = B * B - A * C;
  if (!(disc > 0.0)) return false;
  float q = B >= 0.0 ? -(B + sqrt(disc)) : sqrt(disc) - B;
  float r1 = q / A;
  float r2 = C / q;
  sc = vec2(min(r1, r2), max(r1, r2));
  return true;
}

// The nuclear glow's columns (L_sun/pc^2; x the cluster's, y the disc's) along the ray from c (frame G's axes,
// pc from Sgr A*) in the unit direction n: the midpoint rule in t, s = s0 + a sinh t about the ray's closest
// approach to the hole (ds = a cosh t dt; a = b, or the distance from the galactic pole's axis at s0 when that
// is smaller, at least the disc's inner radius), from the camera to where the ray leaves the field (its outer
// sphere or the disc's outer edge), in pieces cut where the ray enters and leaves the inner hole (no light:
// its piece gets no cells) and crosses the disc's inner cylinder, the cells shared among the pieces by
// rounding their running lengths (sim/galaxy/glow.ts nuclearMarch, step for step).
vec2 nscMarch(vec3 c, vec3 n) {
  float s0 = -dot(c, n);
  float b = max(length(cross(c, n)), 1e-9);
  float rOut = uNsdLaw2.y;
  if (b >= rOut) return vec2(0.0);
  float A = dot(n.xy, n.xy);
  float B = dot(c.xy, n.xy);
  float C0 = dot(c.xy, c.xy);
  vec2 sc;
  float sEnd = s0 + sqrt(rOut * rOut - b * b);
  if (A > 1e-12 && nscCylinder(A, B, C0 - uNsdLaw2.x * uNsdLaw2.x, sc)) sEnd = min(sEnd, sc.y);
  float a = min(b, max(length(c.xy + s0 * n.xy), uNsdLaw.w));
  float inv = 1.0 / a;
  float tc = asinh(-s0 * inv);
  float te = asinh((sEnd - s0) * inv);
  if (!(te > tc)) return vec2(0.0);
  float h0 = te;
  float h1 = te;
  if (b < uNscLaw2.w) {
    float q = sqrt(uNscLaw2.w * uNscLaw2.w - b * b) * inv;
    h0 = asinh(-q);
    h1 = asinh(q);
  }
  float k1 = te;
  float k2 = te;
  if (A > 1e-12 && nscCylinder(A, B, C0 - uNsdLaw.w * uNsdLaw.w, sc)) {
    k1 = asinh((sc.x - s0) * inv);
    k2 = asinh((sc.y - s0) * inv);
  }
  float hA = clamp(h0, tc, te);
  float hB = clamp(h1, tc, te);
  float v0 = hA;
  float v1 = hB;
  float v2 = clamp(k1, tc, te);
  float v3 = clamp(k2, tc, te);
  float w;
  if (v0 > v1) { w = v0; v0 = v1; v1 = w; }
  if (v2 > v3) { w = v2; v2 = v3; v3 = w; }
  if (v0 > v2) { w = v0; v0 = v2; v2 = w; }
  if (v1 > v3) { w = v1; v1 = v3; v3 = w; }
  if (v1 > v2) { w = v1; v1 = v2; v2 = w; }
  // The five pieces between tc, v0 ... v3, te, in scalars (no arrays: indexing one by a variable is slow on
  // some GPUs); the inner hole's piece, [hA, hB] when the ray enters it, holds no light and gets no cells.
  bool hole = hA < hB;
  float l0 = hole && tc == hA && v0 == hB ? 0.0 : v0 - tc;
  float l1 = hole && v0 == hA && v1 == hB ? 0.0 : v1 - v0;
  float l2 = hole && v1 == hA && v2 == hB ? 0.0 : v2 - v1;
  float l3 = hole && v2 == hA && v3 == hB ? 0.0 : v3 - v2;
  float l4 = hole && v3 == hA && te == hB ? 0.0 : te - v3;
  float total = l0 + l1 + l2 + l3 + l4;
  if (!(total > 0.0)) return vec2(0.0);
  int cells = int(uNscSteps + 0.5);
  float per = float(cells) / total;
  int c1 = int(floor(l0 * per + 0.5));
  int c2 = int(floor((l0 + l1) * per + 0.5));
  int c3 = int(floor((l0 + l1 + l2) * per + 0.5));
  int c4 = int(floor((l0 + l1 + l2 + l3) * per + 0.5));
  vec2 col = vec2(0.0);
  for (int k = 0; k < 16; k++) {
    if (k >= cells) break;
    // The piece cell k falls in: its start, length, first cell and number of cells.
    float lo = tc;
    float len = l0;
    int first = 0;
    int last = c1;
    if (k >= c1) { lo = v0; len = l1; first = c1; last = c2; }
    if (k >= c2) { lo = v1; len = l2; first = c2; last = c3; }
    if (k >= c3) { lo = v2; len = l3; first = c3; last = c4; }
    if (k >= c4) { lo = v3; len = l4; first = c4; last = cells; }
    float h = len / float(last - first);
    float t = lo + (float(k - first) + 0.5) * h;
    float et = exp(t);
    float s = s0 + 0.5 * a * (et - 1.0 / et);
    col += nscEmissivity(c + s * n) * (0.5 * a * (et + 1.0 / et) * h);
  }
  return col;
}

void main() {
  float lnD;
  vec3 dWorld = relUnaberrate(normalize(vRay), lnD);
  vec3 dir = uGalToG * (transpose(uGalToWorld) * dWorld);
  float end = uGlowRange.y;
  float lambda = log(1.0 + end / GLOW_S_SCALE) / float(GLOW_STEPS);
  float zOut = 7.0 * max(uGlowThin.z, uGlowThick.z) + 2.0;
  float tau = 0.0;
  // Each population's column (L☉/pc², V) after the dust, and its colour after the reddening.
  vec3 col = vec3(0.0);
  vec3 tint0 = vec3(0.0);
  vec3 tint1 = vec3(0.0);
  vec3 tint2 = vec3(0.0);
  float sa = 0.0;
  // The discs' glow (off inside other galaxies).
  for (int k = 1; k <= GLOW_STEPS; k++) {
    if (uNscGlowOn.z < 0.5) break;
    float sb = GLOW_S_SCALE * (exp(float(k) * lambda) - 1.0);
    float L = sb - sa;
    vec3 pa = uCamG + dir * sa;
    vec3 pb = uCamG + dir * sb;
    float smid = 0.5 * (sa + sb);
    sa = sb;
    // Wholly above or below the discs: no light and no dust.
    if (min(pa.z, pb.z) > zOut || max(pa.z, pb.z) < -zOut) continue;
    // In-plane quantities where the step comes closest to the midplane (as columnAV).
    vec3 q = pa.z * pb.z <= 0.0 && pa.z != pb.z ? mix(pa, pb, pa.z / (pa.z - pb.z)) : (abs(pa.z) < abs(pb.z) ? pa : pb);
    vec4 m = vec4(0.0, 0.1, 0.0, 0.1);
    vec2 wy = vec2(0.0);
    if (abs(q.x) < uDustExtent && abs(q.y) < uDustExtent) {
      vec2 uv = (q.xy + uDustExtent) / (2.0 * uDustExtent);
      m = texture2D(uDust, uv);
      wy = texture2D(uWarpMap, uv).rg;
    }
    float za = pa.z - wy.x;
    float zb = pb.z - wy.x;
    float dz = zb - za;
    bool level = abs(dz) < 1e-6 * L;
    float av;
    if (level) {
      float s = 1.0 / cosh(za / m.y);
      av = L * (m.x * s * s + m.z * exp(-za * za / (m.w * m.w)));
    } else {
      float disc = m.x * m.y * (tanh(zb / m.y) - tanh(za / m.y));
      float arms = m.z * m.w * 0.8862269 * (erfA(zb / m.w) - erfA(za / m.w));
      av = (L / dz) * (disc + arms);
    }
    float dtau = 0.921034 * max(av, 0.0);
    // The step's own light is mixed with its own dust: (1 − e^−τ) / τ of it gets out, per channel.
    vec3 dt = dtau * REDDEN;
    vec3 mixC = dtau > 1e-6 ? (1.0 - exp(-dt)) / dt : vec3(1.0);
    vec3 seen = exp(-tau * REDDEN) * mixC;
    float seenV = seen.g;
    float R = length(q.xy);
    float wDisc = 1.0 - smoothstep(uGlowRange.x, uGlowRange.y, smid);
    float wYoung = 1.0 - smoothstep(uGlowRange.z, uGlowRange.w, smid);
    // Σ / (2h) × ∫ e^(−|z|/h) ds over the step: L☉/pc².
    float hT = uGlowThin.z;
    float hK = uGlowThick.z;
    float hY = uGlowYoungHz;
    float cT = level ? L * exp(-abs(za) / hT) : layerColumn(za, zb, hT) * L / dz;
    float cK = level ? L * exp(-abs(za) / hK) : layerColumn(za, zb, hK) * L / dz;
    float cY = level ? L * exp(-abs(za) / hY) : layerColumn(za, zb, hY) * L / dz;
    float sT = R > uGlowThin.w ? 0.0 : uGlowThin.x * exp(-R / uGlowThin.y);
    float sK = R > uGlowThick.w ? 0.0 : uGlowThick.x * exp(-R / uGlowThick.y);
    vec3 e = vec3(wDisc * sT * cT / (2.0 * hT), wYoung * wy.y * cY / (2.0 * hY), wDisc * sK * cK / (2.0 * hK));
    e *= vec3(1.0 - uFaceShare.x, 1.0 - uFaceShare.y, 1.0 - uFaceShare.x);
    col += e * seenV;
    tint0 += e.x * seen;
    tint1 += e.y * seen;
    tint2 += e.z * seen;
    tau += dtau;
    if (tau > 30.0) break;
  }
  // A column S (L☉/pc²) along a line of sight is 10^(−0.4 M☉) × (10 pc)² × S V = 0 stars per steradian;
  // in the target, times a faint star's image area and the exposure.
  float sigmaPsf = 0.5 * uPixelRatio * uResScale / uPxPerRad;
  float perColumnAny = exp(-0.921034 * (M_V_SUN - uMagZero) + uLnExposure) * 100.0 * 6.2831853 * sigmaPsf * sigmaPsf;
  float perColumn = perColumnAny * uLumGain;
  float lnK0, lnK1, lnK2;
  vec3 c0 = shifted(uGlowThinRgb, uGlowLnT.x, lnD, lnK0);
  vec3 c1 = shifted(uGlowYoungRgb, uGlowLnT.y, lnD, lnK1);
  vec3 c2 = shifted(uGlowThickRgb, uGlowLnT.z, lnD, lnK2);
  // The reddening tints each population's colour; the V-band dimming is in col already.
  vec3 r0 = c0 * tint0 / max(col.x, 1e-30);
  vec3 r1 = c1 * tint1 / max(col.y, 1e-30);
  vec3 r2 = c2 * tint2 / max(col.z, 1e-30);
  r0 /= max(dot(r0, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  r1 /= max(dot(r1, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  r2 /= max(dot(r2, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  vec3 f = perColumn * (col.x * exp(min(lnK0, 60.0)) * r0 + col.y * exp(min(lnK1, 60.0)) * r1 + col.z * exp(min(lnK2, 60.0)) * r2);
  // The nuclear field's glow (each law times u - w s(r)), and the stand-in for the points beside the camera, times w
  // (with the cluster's colour: near the camera they are nearly all the cluster's).
  if (uNscGlowOn.w > 0.0) {
    vec2 nc = nscMarch(uNscCamHi + uNscCamLo, dir);
    nc.x += uNscGlowOn.x * uNscLocal;
    float lnKc, lnKd;
    vec3 cc = shifted(uNscRgb, uNscLnT.x, lnD, lnKc);
    vec3 cd = shifted(uNsdRgb, uNscLnT.y, lnD, lnKd);
    f += perColumn * (nc.x * exp(min(lnKc, 60.0)) * cc + nc.y * exp(min(lnKd, 60.0)) * cd);
  }
  // M87's own starlight near the camera (not the Milky Way model's: no share of the sky from the Sun).
  if (uNscGlowOn.y > 0.0) {
    vec3 da = dWorld - uM87Dir;
    vec3 db = dWorld + uM87Dir;
    float psi = 2.0 * atan(length(da), length(db));
    float u = clamp((log(max(psi, 1e-30)) - uM87Axis.x) * uM87Axis.y, 0.0, 63.0);
    float i = min(floor(u), 62.0);
    float l0 = texelFetch(uM87Table, ivec2(int(i), 0), 0).r;
    float l1 = texelFetch(uM87Table, ivec2(int(i) + 1, 0), 0).r;
    float l = mix(l0, l1, u - i);
    if (l > -79.0) {
      float lnKm;
      vec3 cm = shifted(uM87Rgb, uM87LnT, lnD, lnKm);
      f += perColumnAny * exp(min(l + lnKm, 80.0)) * cm;
    }
  }
  f = min(f, vec3(6.0e4));
  // The luminance goes into alpha too: this is the Milky Way model's light (galaxy.frag.glsl).
  gl_FragColor = vec4(f, dot(f, vec3(0.2126, 0.7152, 0.0722)));
}
