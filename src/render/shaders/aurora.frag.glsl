// Earth's aurora (scene/Phenomena.tsx Aurora; the model: sim/phenomena/aurora.ts). Drawn on a sphere round Earth at
// the top of the emission, each pixel's ray marched through the shell between 90 and 320 km up, stopping at the
// ground. At each sample: the geomagnetic latitude and magnetic local time (MLT) of the point, from the date's dipole
// axis and the Sun; the oval's poleward and equatorward edges at that MLT (Starkov's Fourier series, evaluated on the
// CPU into uEdges for 24 hours of MLT); the curtains (a model: thin east–west lanes that fold slowly, with vertical rays
// along the nearly vertical field lines); and the emission's height profile, the green 557.7 nm line of atomic oxygen
// peaking near 114 km, the red 630.0 nm line near 250 km and the blue-violet N2+ band, which peaks with the green. The column
// brightness (kilorayleighs, from the activity: uKr) is turned into V-band flux with each line's luminous efficacy, and
// shown with the law of the sky and the nebulae: luminance uStarGain √(S Ω_psf), S the flux per steradian. Only over
// the night side: over the sunlit ground the aurora is lost in its glare.
//
// Units: Earth radii about Earth's centre (float32 holds a 10⁻⁷ part of that: 0.6 m). Cost: the pixels of Earth's disc
// and limb whose ray reaches geomagnetic latitudes poleward of 50° over dark ground (most of the disc is rejected after
// three points), the oval's state at three points of the ray and AURORA_STEPS cheap samples between.
#include <common>
#include <logdepthbuf_pars_fragment>

#define AURORA_STEPS 20

uniform vec3 uCentre;     // Earth's centre from the camera, km
uniform float uRadiusKm;  // Earth's radius as drawn, km (enlarged with the body in "Enlarged" mode)
uniform float uScaleKm;   // km of altitude per km of the model (the same enlargement)
uniform vec3 uDipole;     // the north geomagnetic pole's direction (world axes): the dipole axis
uniform vec3 uSun;        // Earth → Sun (unit, world axes)
uniform sampler2D uEdges; // 48 × 1 over MLT: r = poleward edge, g = equatorward edge (colatitude, degrees / 90), b = arc strength
uniform float uKr;        // brightness of the green line in a bright arc, kR (overhead column)
uniform float uRedShare;  // the red line's column brightness as a share of the green's
uniform float uFluxPerKr; // V-band flux per steradian (V = 0 units) of 1 kR of the green line
uniform float uEffRed;    // the red line's and the N2+ band's V-band flux per kR, as a share of the green line's
uniform float uEffBlue;
uniform float uScale;     // uStarGain² Ω_psf 10^(0.4 m0): luminance = √(uScale · S)
uniform float uTime;      // s (wall clock): the curtains' slow motion
uniform float uOpacity;
uniform float uMinSinLat; // sin of the lowest geomagnetic latitude the oval reaches, less a margin (sin 50° but in great storms)
uniform vec3 uGreen;      // the lines' colours, luminance 1 (linear sRGB)
uniform vec3 uRed;
uniform vec3 uBlue;

varying vec3 vWorld;

const float R_BOTTOM = 90.0;   // km
const float R_TOP = 320.0;     // km

float hash1(float n) { return fract(sin(n) * 43758.5453123); }
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash1(i), hash1(i + 1.0), f);
}
// Smooth noise of two variables, periodic in x with period px (MLT wraps round the pole).
float noise2(vec2 p, float px) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float i0 = mod(i.x, px);
  float i1 = mod(i.x + 1.0, px);
  float a = hash1(i0 + 57.0 * i.y);
  float b = hash1(i1 + 57.0 * i.y);
  float c = hash1(i0 + 57.0 * (i.y + 1.0));
  float d = hash1(i1 + 57.0 * (i.y + 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// The ray through the sphere of radius r about the origin: entry and exit (t0 > t1 when it misses).
vec2 sphereHit(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

// sin of the geomagnetic latitude of a direction from Earth's centre.
float sinMagLat(vec3 n) { return dot(n, uDipole); }

// The oval where a direction n from Earth's centre points: its colatitude and the oval's edges there (degrees), the
// darkness below, the curtains' fold (in widths of the band), which arcs are lit (each 0–1, times the sector's arc
// strength) and the rays' brightness.
struct Oval {
  float colat;
  float pole;
  float width;
  float night;
  float fold;
  vec3 arcs;
  float rays;
};

Oval ovalAt(vec3 n, vec3 e1, vec3 e2) {
  Oval o;
  float s = sinMagLat(n);
  o.colat = 90.0 - degrees(asin(min(abs(s), 1.0)));
  // Magnetic local time, hours (12 at noon, 0 at midnight).
  float mlt = 12.0 + atan(dot(n, e2), dot(n, e1)) * 3.8197186;
  vec4 edge = texture2D(uEdges, vec2(mlt / 24.0, 0.5));
  o.pole = edge.r * 90.0;
  o.width = edge.g * 90.0 - o.pole;
  // Night only: the ground below in darkness (the Sun more than about 6° below the horizon there).
  o.night = smoothstep(0.1, -0.1, dot(n, uSun));
  float hemi = s > 0.0 ? 0.0 : 37.0;
  // Curtains: lanes running east–west across the band, their positions folding slowly with MLT and time.
  o.fold = (noise2(vec2(mlt * 1.5 + hemi, uTime * 0.003), 36.0) - 0.5) * 0.3
         + (noise2(vec2(mlt * 4.0 + hemi, uTime * 0.01 + 3.0), 96.0) - 0.5) * 0.03;
  // Each arc comes and goes along the oval.
  o.arcs = edge.b * vec3(
    smoothstep(0.25, 0.7, noise2(vec2(mlt * 1.2 + hemi + 11.0, uTime * 0.002), 28.8)),
    smoothstep(0.3, 0.75, noise2(vec2(mlt * 1.2 + hemi + 23.0, uTime * 0.002 + 5.0), 28.8)),
    smoothstep(0.35, 0.8, noise2(vec2(mlt * 1.2 + hemi + 41.0, uTime * 0.002 + 9.0), 28.8)));
  // Rays: striations along the nearly vertical field, flickering slowly.
  o.rays = 0.55 + 0.45 * noise2(vec2(mlt * 180.0 + hemi, uTime * 0.25), 4320.0);
  return o;
}

void main() {
  #include <logdepthbuf_fragment>
  float R = uRadiusKm;
  vec3 ro = -uCentre / R;
  vec3 rd = normalize(vWorld);
  float rBottom = 1.0 + R_BOTTOM * uScaleKm / R;
  float rTop = 1.0 + R_TOP * uScaleKm / R;
  vec2 top = sphereHit(ro, rd, rTop);
  if (top.y <= 0.0 || top.x > top.y) discard;
  float t0 = max(top.x, 0.0);
  float t1 = top.y;
  // The ground stops the ray.
  vec2 ground = sphereHit(ro, rd, 1.0);
  if (ground.x <= ground.y && ground.x > 0.0) t1 = min(t1, ground.x);
  if (t1 <= t0) discard;
  // Quick rejection: no aurora equatorward of the oval's lowest latitude (50° but in great storms), nor over sunlit
  // ground, anywhere on the ray.
  vec3 pa = normalize(ro + rd * t0);
  vec3 pb = normalize(ro + rd * t1);
  vec3 pm = normalize(ro + rd * (0.5 * (t0 + t1)));
  float lat = max(abs(sinMagLat(pa)), max(abs(sinMagLat(pb)), abs(sinMagLat(pm))));
  if (lat < uMinSinLat) discard;
  if (min(dot(pa, uSun), min(dot(pb, uSun), dot(pm, uSun))) > 0.15) discard;

  // The magnetic frame: e1 towards magnetic noon, e2 towards dusk (18 MLT).
  vec3 e1 = normalize(uSun - dot(uSun, uDipole) * uDipole);
  vec3 e2 = cross(uDipole, e1);
  // What varies along the oval (its edges, the curtains' folds, which arcs are lit, the rays) is worked out at the ray's
  // two ends and its middle and read quadratically between: a ray crosses at most a few tens of degrees of the oval, and
  // this keeps the noise out of the samples' loop.
  Oval oa = ovalAt(pa, e1, e2);
  Oval om = ovalAt(pm, e1, e2);
  Oval ob = ovalAt(pb, e1, e2);
  // The whole ray inside the polar cap, or wholly equatorward of the oval: nothing to add.
  vec3 uu = (vec3(oa.colat, om.colat, ob.colat) - vec3(oa.pole, om.pole, ob.pole)) / max(vec3(oa.width, om.width, ob.width), vec3(0.5));
  if (max(uu.x, max(uu.y, uu.z)) < -0.4 || min(uu.x, min(uu.y, uu.z)) > 1.4) discard;

  float dt = (t1 - t0) / float(AURORA_STEPS);
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float green = 0.0;
  float red = 0.0;
  float blue = 0.0;
  for (int i = 0; i < AURORA_STEPS; i++) {
    float x = (float(i) + jitter) / float(AURORA_STEPS);
    vec3 p = ro + rd * (t0 + x * (t1 - t0));
    float r = length(p);
    if (r < rBottom) continue;
    float h = (r - 1.0) * R / uScaleKm; // altitude, km
    // Lagrange weights at 0, ½ and 1.
    vec3 L = vec3(2.0 * (x - 0.5) * (x - 1.0), -4.0 * x * (x - 1.0), 2.0 * x * (x - 0.5));
    float colat = dot(L, vec3(oa.colat, om.colat, ob.colat));
    float cPole = dot(L, vec3(oa.pole, om.pole, ob.pole));
    float width = max(dot(L, vec3(oa.width, om.width, ob.width)), 0.5);
    float u = (colat - cPole) / width; // 0 at the poleward edge, 1 at the equatorward
    if (u < -0.4 || u > 1.4) continue;
    float night = clamp(dot(L, vec3(oa.night, om.night, ob.night)), 0.0, 1.0);
    if (night <= 0.0) continue;
    float uf = u + dot(L, vec3(oa.fold, om.fold, ob.fold));
    vec3 arcs = L.x * oa.arcs + L.y * om.arcs + L.z * ob.arcs;
    float lanes = arcs.x * exp(-pow((uf - 0.25) / 0.04, 2.0)) + 0.8 * arcs.y * exp(-pow((uf - 0.5) / 0.055, 2.0)) + 0.6 * arcs.z * exp(-pow((uf - 0.72) / 0.07, 2.0));
    float rays = dot(L, vec3(oa.rays, om.rays, ob.rays));
    // The diffuse glow over the whole band, the arcs brightest where the oval holds them (the evening and midnight sectors).
    float band = smoothstep(-0.25, 0.15, u) * (1.0 - smoothstep(0.85, 1.25, u));
    float column = band * (0.08 + 1.2 * lanes * rays);
    // Height profiles, per km (each integrates to 1 over height): green 557.7 nm, red 630.0 nm.
    float hb = h - 114.0 + 6.0 * lanes; // the lower edge is lower in the brighter, harder arcs
    float g = hb < 0.0 ? exp(-hb * hb / 100.0) : exp(-hb * hb / 1225.0);
    g *= 0.0251; // 1 / (√π (10 + 35) / 2) km
    float rr = exp(-pow((h - 250.0) / 60.0, 2.0)) * 0.0094; // 1 / (√π 60) km
    float w = column * night * dt * R;
    green += w * g;
    red += w * (rr + 0.6 * g * smoothstep(0.6, 1.2, u)); // the diffuse aurora's equatorward edge carries more red
    blue += w * g * lanes;
  }
  // Column brightnesses, kR, along this ray: green, red, and N2+ 427.8 nm (a fifth of the green in the arcs).
  float sG = green * uKr;
  float sR = red * uKr * uRedShare;
  float sB = blue * uKr * 0.2;
  // V-band flux per steradian, each line weighted by its luminous efficacy.
  float lG = sG;
  float lR = uEffRed * sR;
  float lB = uEffBlue * sB;
  float S = uFluxPerKr * (lG + lR + lB);
  if (S <= 0.0) discard;
  vec3 col = (uGreen * lG + uRed * lR + uBlue * lB) / max(lG + lR + lB, 1e-12);
  // The emission lines' saturated colours, eased against the tone mapping's greying as the stars' are (point.frag.glsl).
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(vec3(0.0), l + 1.5 * (col - l));
  float y = sqrt(uScale * S);
  gl_FragColor = vec4(col * y * uOpacity, 1.0);
}
