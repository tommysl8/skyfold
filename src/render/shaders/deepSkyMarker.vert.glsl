// The deep-sky catalogues' markers in the Milky Way and the Magellanic Clouds (scene/DeepSky.tsx): one point each
// NGC/IC cluster or nebula, supernova remnant or pulsar, at its heliocentric galactic place (float32 parsecs), the
// camera as hi + lo floats. An extended object is a thin ring of its true size once that is a pixel or two across, and
// fades as the camera comes up to it; a compact one (a planetary nebula, a remnant of unknown size, a pulsar) is a small
// mark within a distance of its kind. Twin of sim/deepsky/markers.ts (galacticAlpha), which picking uses: what is
// drawn is what can be clicked. A pulsar's mark pulses with its spin, slowed by a power of ten when too fast to watch.
// In flight each marker is aberrated like a star; it is a guide, so it keeps its colour.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>

attribute float aRadius; // pc (0: size unknown, a compact mark)
attribute float aStyle;  // sim/deepsky/markers.ts STYLE
attribute float aPulse;  // the period the mark pulses at, s (0: none)

uniform vec3 uCamHi;      // the camera, heliocentric galactic pc: hi + lo
uniform vec3 uCamLo;
uniform mat3 uGalToWorld;
uniform float uPxPerRad;  // CSS px per radian
uniform float uPixelRatio;
uniform float uOpacity;
uniform float uTime;      // wall-clock seconds
uniform float uSelected;  // the selected marker's index in this catalogue, or −1
uniform vec2 uHidden;     // markers not drawn (a pulsar drawn up close: scene/PulsarModel.tsx), or −1
uniform vec3 uSelectedRel; // the selected one from the camera, galactic pc, worked out in float64 (a visit to a pulsar
                           // comes within an au of it, where float32 places 280 pc out are 3 au coarse)

varying float vAlpha;
varying float vRing;   // the ring's radius as a share of the sprite's half-width
varying float vStyle;
varying float vPulse;  // the pulse's brightness now (1 for anything that does not pulse)
varying float vSelected;

// markers.ts's constants.
const float MIN_RING_PX = 3.0;
const float SIZE_FROM_PX = 0.7;
const float SIZE_FULL_PX = 2.0;
const float BIG_FROM_PX = 100.0;
const float BIG_GONE_PX = 200.0;
const vec2 EXTENDED_FAR_PC = vec2(70000.0, 120000.0);

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vAlpha = 0.0;
}

void main() {
  if (abs(float(gl_VertexID) - uHidden.x) < 0.5 || abs(float(gl_VertexID) - uHidden.y) < 0.5) {
    cull();
    return;
  }
  float selected = abs(float(gl_VertexID) - uSelected) < 0.5 ? 1.0 : 0.0;
  vec3 rel = selected > 0.5 ? uSelectedRel : (position - uCamHi) - uCamLo;
  float d = max(length(rel), 1e-12);
  float rPx = aRadius / d * uPxPerRad;
  int style = int(aStyle + 0.5);
  // Compact kinds: the distances within which each shows fully and beyond which it is gone, and its mark's radius (px).
  vec2 fade = style == 3 ? vec2(600.0, 2000.0) : style == 4 ? vec2(1500.0, 4000.0) : style == 7 ? vec2(1500.0, 6000.0) : vec2(400.0, 1200.0);
  float markPx = style == 3 || style == 7 ? 3.5 : style == 4 ? 5.0 : 2.5;
  bool compact = (style >= 3 && style <= 5) || style == 7;
  float big = 1.0 - smoothstep(BIG_FROM_PX, BIG_GONE_PX, rPx);
  float a;
  if (compact) {
    a = 1.0 - smoothstep(fade.x, fade.y, d);
    if (aRadius > 0.0) a *= big;
  } else {
    a = d <= aRadius ? 0.0 : smoothstep(SIZE_FROM_PX, SIZE_FULL_PX, rPx) * big * (1.0 - smoothstep(EXTENDED_FAR_PC.x, EXTENDED_FAR_PC.y, d));
  }
  if (selected > 0.5 && d > aRadius) a = max(a, big);
  a *= uOpacity;
  if (a <= 0.003) {
    cull();
    return;
  }
  float lnD;
  vec3 dShip = relAberrate(normalize(uGalToWorld * (rel / d)), lnD);
  // A ring keeps its true size on the sky (shrunk ahead of a fast ship, as the sky is); a mark keeps its own.
  float r = compact ? markPx : max(rPx * exp(-lnD), MIN_RING_PX);
  if (selected > 0.5) r = max(r, 6.0);
  float half_ = r + 2.0;
  vRing = r / half_;
  vStyle = aStyle;
  vSelected = selected;
  vPulse = 1.0;
  if (aPulse > 0.0) {
    // A narrow pulse once a period, from a dim floor (a subtle beat, not a flash).
    float ph = fract(uTime / aPulse);
    vPulse = 0.35 + 0.65 * pow(0.5 + 0.5 * cos(6.2831853 * ph), 8.0);
  }
  vAlpha = a;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = 2.0 * half_ * uPixelRatio;
  #include <logdepthbuf_vertex>
}
