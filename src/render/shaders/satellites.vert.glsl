// The satellite swarm (scene/Satellites.tsx): every satellite CelesTrak lists, each moved here from SGP4's mean
// elements at a reference time (packed by sim/satellites/swarm.ts in a worker), so 15,000 of them cost no CPU.
// The mean elements go on linearly for the minutes since then; from them on this is SGP4's own tail: the J3
// long-period terms, Kepler's equation in its equinoctial form and the J2 short-period terms (Vallado et al. 2006).
// Twin: sim/satellites/swarm.ts packedPosition (float64, for picking and the tests).
//
// A satellite in Earth's shadow is dimmed: it is lit only by sunlight, and the shadow's edge sweeps through the
// swarm as it does through the real one.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>

attribute vec4 aEl0; // a (km), e, i, M (rad)
attribute vec4 aEl1; // node, argument of perigee (rad), dM/dt (rad/min), de/dt (per min)
attribute vec4 aEl2; // dnode/dt, dargp/dt (rad/min), class + 1 (0: hidden), di/dt (rad/min)

uniform float uDtMin;      // minutes since the reference time
uniform mat3 uTemeToWorld; // TEME of date → world axes
uniform vec3 uEarthRel;    // Earth's centre relative to the camera, km
uniform vec3 uSunDir;      // unit vector from Earth to the Sun (world)
uniform float uPointSize;
uniform float uOpacity;
uniform float uDebris;     // 1: draw the debris (class 5)
uniform int uHidden;       // the vertex of a satellite drawn as a body now, or -1
uniform vec3 uColors[6];

varying vec3 vColor;
varying float vAlpha;

const float RE = 6378.135;       // WGS-72 equatorial radius, km
const float J2 = 0.001082616;
const float J3OJ2 = -0.00000253881 / 0.001082616;
const float EARTH_SHADOW_KM = 6371.0;

void main() {
  float cls = aEl2.z - 1.0;
  bool hidden = cls < 0.0 || (cls > 4.5 && uDebris < 0.5) || gl_VertexID == uHidden;
  if (hidden) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    vColor = vec3(0.0);
    return;
  }
  float am = aEl0.x / RE;
  float ep = clamp(aEl0.y + aEl1.w * uDtMin, 1e-6, 0.999);
  float xincp = aEl0.z + aEl2.w * uDtMin;
  float mp = aEl0.w + aEl1.z * uDtMin;
  float nodep = aEl1.x + aEl2.x * uDtMin;
  float argpp = aEl1.y + aEl2.y * uDtMin;
  float sinip = sin(xincp), cosip = cos(xincp);
  float cosisq = cosip * cosip;
  float aycof = -0.5 * J3OJ2 * sinip;
  float xlcof = -0.25 * J3OJ2 * sinip * (3.0 + 5.0 * cosip) / max(1.0 + cosip, 1.5e-6);
  float con41 = 3.0 * cosisq - 1.0;
  float x1mth2 = 1.0 - cosisq;
  float x7thm1 = 7.0 * cosisq - 1.0;

  float axnl = ep * cos(argpp);
  float temp = 1.0 / (am * (1.0 - ep * ep));
  float aynl = ep * sin(argpp) + temp * aycof;
  float u = mod(mp + argpp + temp * xlcof * axnl, PI2);
  float eo1 = u;
  for (int i = 0; i < 10; i++) {
    float s = sin(eo1), c = cos(eo1);
    float d = (u - aynl * c + axnl * s - eo1) / (1.0 - c * axnl - s * aynl);
    d = clamp(d, -0.95, 0.95);
    eo1 += d;
    if (abs(d) < 1e-6) break;
  }
  float sineo1 = sin(eo1), coseo1 = cos(eo1);
  float ecose = axnl * coseo1 + aynl * sineo1;
  float esine = axnl * sineo1 - aynl * coseo1;
  float el2 = axnl * axnl + aynl * aynl;
  float pl = am * (1.0 - el2);
  float rl = am * (1.0 - ecose);
  float betal = sqrt(max(1.0 - el2, 1e-12));
  temp = esine / (1.0 + betal);
  float sinu = am / rl * (sineo1 - aynl - axnl * temp);
  float cosu = am / rl * (coseo1 - axnl + aynl * temp);
  float su = atan(sinu, cosu);
  float sin2u = 2.0 * cosu * sinu;
  float cos2u = 1.0 - 2.0 * sinu * sinu;
  float temp1 = 0.5 * J2 / pl;
  float temp2 = temp1 / pl;
  float mrt = rl * (1.0 - 1.5 * temp2 * betal * con41) + 0.5 * temp1 * x1mth2 * cos2u;
  su -= 0.25 * temp2 * x7thm1 * sin2u;
  float xnode = nodep + 1.5 * temp2 * cosip * sin2u;
  float xinc = xincp + 1.5 * temp2 * cosip * sinip * cos2u;
  float sinsu = sin(su), cossu = cos(su);
  float snod = sin(xnode), cnod = cos(xnode);
  float sini = sin(xinc), cosi = cos(xinc);
  vec3 teme = mrt * RE * vec3(-snod * cosi * sinsu + cnod * cossu, cnod * cosi * sinsu + snod * cossu, sini * sinsu);

  vec3 fromEarth = uTemeToWorld * teme;
  // Sunlit, or in Earth's shadow (a cylinder is close enough this near Earth: the umbra's cone narrows by 1% in
  // 14,000 km), with a soft edge for the penumbra.
  float along = dot(fromEarth, uSunDir);
  float off = length(fromEarth - along * uSunDir);
  float lit = along > 0.0 ? 1.0 : smoothstep(EARTH_SHADOW_KM - 60.0, EARTH_SHADOW_KM + 60.0, off);

  vec3 rel = uEarthRel + fromEarth;
  float dist = max(length(rel), 1e-3);
  vec3 dir = rel / dist;
  if (uPhi > 0.0) {
    float lnD;
    dir = relAberrate(dir, lnD);
  }
  vColor = uColors[int(cls + 0.5)];
  vAlpha = uOpacity * mix(0.14, 1.0, lit);
  vec4 mv = viewMatrix * vec4(dir * dist, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPointSize;
  #include <logdepthbuf_vertex>
}
