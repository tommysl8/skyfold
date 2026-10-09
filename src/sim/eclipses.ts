/**
 * Eclipses, from the app's own Sun, Earth and Moon (the registry's positions and Earth's orientation, all
 * astronomy-engine's). The renderer draws the shadows per pixel (render/shaders/planet.frag.glsl: each body's
 * eclipsers, the share of the Sun's disc each point sees); this module is the same geometry in float64, for the
 * tests against NASA's predictions (Espenak), the eclipse journeys and the cards.
 *
 *  - Solar: the Moon's shadow cone. Its axis runs from the Sun's centre through the Moon's; where it meets Earth's
 *    ellipsoid (WGS-84) is the centre of the umbra (or the antumbra, in an annular eclipse).
 *  - Lunar: Earth's shadow at the Moon. Earth's atmosphere makes the shadow larger than Earth's solid body; Danjon's
 *    rule, which NASA's predictions use (Espenak & Meeus 2009, the Five Millennium Canon of Lunar Eclipses), takes
 *    Earth's radius at 45° latitude (0.99834 of the equatorial) enlarged by 1/85.
 *
 * Positions are the app's, in the Sun's frame, each at the moment the light passed it (`geocentric`).
 */
import { Quaternion, Vector3 } from 'three';
import type { AstroTime } from 'astronomy-engine';
import { C_KM_S, SUN_RADIUS_KM } from '../physics/constants';
import { bodyOrientation, bodyPositionAt, childrenOf, getBody, type BodyId } from './bodies';

export { SUN_RADIUS_KM };

/** The Moon's mean radius, km (IAU 2015). */
export const MOON_RADIUS_KM = 1737.4;
/** WGS-84. */
export const EARTH_EQ_KM = 6378.137;
export const EARTH_POLAR_KM = 6356.752;
/** Earth's shadow-casting radius by Danjon's rule: the radius at 45° latitude, enlarged by 1/85 for the atmosphere. */
export const EARTH_SHADOW_RADIUS_KM = EARTH_EQ_KM * 0.99834 * (1 + 1 / 85);

const sun = new Vector3();
const moon = new Vector3();
const earth = new Vector3();
const q = new Quaternion();
const qi = new Quaternion();
const v = new Vector3();
const w = new Vector3();
const d = new Vector3();

/**
 * The Sun and the Moon relative to Earth's centre (world axes, km) as the shadows fall at `time`: each where it was
 * when the light that grazes it and reaches Earth now passed it (the Moon 1.3 s earlier, which moves the shadow
 * about 40 km along Earth's motion: the aberration of the Moon's shadow; the Sun 8.3 minutes earlier, which moves
 * it a few km).
 */
export function geocentric(time: AstroTime, sunOut: Vector3, moonOut: Vector3): void {
  bodyPositionAt('earth', time, earth);
  bodyPositionAt('moon', time, moonOut);
  bodyPositionAt('moon', time.AddDays(-moonOut.distanceTo(earth) / C_KM_S / 86_400), moonOut).sub(earth);
  bodyPositionAt('sun', time, sunOut);
  bodyPositionAt('sun', time.AddDays(-sunOut.distanceTo(earth) / C_KM_S / 86_400), sunOut).sub(earth);
}

export interface MoonShadow {
  /** Distance of the shadow's axis from Earth's centre, km (its gamma times Earth's radius). */
  axisKm: number;
  /** Whether the axis meets Earth: a central eclipse. */
  central: boolean;
  /** Where it meets the ellipsoid: geodetic latitude and longitude (east), degrees. NaN when it misses. */
  latDeg: number;
  lonDeg: number;
  /** The umbra's radius there, km, measured across the axis (negative: the antumbra, an annular eclipse). */
  umbraKm: number;
}

/** The Moon's shadow on Earth at `time` (world axes; Earth's orientation from the app's rotation model). */
export function moonShadow(time: AstroTime): MoonShadow {
  geocentric(time, sun, moon);
  d.copy(moon).sub(sun);
  const sunMoon = d.length();
  d.divideScalar(sunMoon);
  // Distance of the axis from Earth's centre: |moon × d| (Earth at the origin).
  const along = -moon.dot(d);
  const axisKm = v.copy(moon).addScaledVector(d, along).length();
  // Into Earth's body frame (mesh axes: +X the prime meridian, +Y north, −Z 90° E), the ellipsoid scaled to a sphere.
  bodyOrientation('earth', time, q);
  qi.copy(q).invert();
  const o = v.copy(moon).applyQuaternion(qi);
  const u = w.copy(d).applyQuaternion(qi);
  const k = EARTH_EQ_KM / EARTH_POLAR_KM;
  o.y *= k;
  u.y *= k;
  const a = u.lengthSq();
  const b = 2 * o.dot(u);
  const c = o.lengthSq() - EARTH_EQ_KM * EARTH_EQ_KM;
  const disc = b * b - 4 * a * c;
  // Umbra: a cone from the Moon narrowing to its apex L beyond it.
  const L = (MOON_RADIUS_KM * sunMoon) / (SUN_RADIUS_KM - MOON_RADIUS_KM);
  if (disc < 0) return { axisKm, central: false, latDeg: NaN, lonDeg: NaN, umbraKm: MOON_RADIUS_KM * (1 - along / L) };
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  const p = o.addScaledVector(u, t);
  p.y /= k;
  // How far behind the Moon that point is, along the axis.
  const x = w.copy(p).applyQuaternion(q).sub(moon).dot(d);
  const lon = Math.atan2(-p.z, p.x);
  const rho = Math.hypot(p.x, p.z);
  // Geodetic latitude of a point on the ellipsoid: tan φ = (a/b)² tan ψ.
  const lat = Math.atan2(p.y * k * k, rho);
  return { axisKm, central: true, latDeg: (lat * 180) / Math.PI, lonDeg: (lon * 180) / Math.PI, umbraKm: MOON_RADIUS_KM * (1 - x / L) };
}

/** The moment the shadow's axis passes nearest Earth's centre (greatest eclipse), searched within ±`hours` of `near`. */
export function greatestSolarEclipse(near: AstroTime, hours = 4): AstroTime {
  return goldenMin((t) => moonShadow(t).axisKm, near, hours);
}

export interface EarthShadow {
  /** Angle from Earth's centre between the Moon's centre and the shadow's axis (the anti-Sun direction), rad. */
  sepRad: number;
  /** The umbra's and penumbra's angular radii at the Moon's distance, and the Moon's own, rad (Danjon). */
  umbraRad: number;
  penumbraRad: number;
  moonRad: number;
}

/**
 * Earth's shadow on the Moon as seen from Earth's centre at `time`: the Moon where it was 1.3 s earlier, when the
 * light now arriving left it, and the shadow there cast by Earth 1.3 s before that (and by the Sun 8.3 minutes
 * before), so contact times are the times they are seen, as NASA's are.
 */
export function earthShadow(time: AstroTime): EarthShadow {
  bodyPositionAt('earth', time, earth);
  bodyPositionAt('moon', time, moon);
  const lt = moon.distanceTo(earth) / C_KM_S / 86_400;
  const tMoon = time.AddDays(-lt);
  bodyPositionAt('moon', tMoon, moon);
  // Earth when the shadow's light passed it, and the Sun when that light left it.
  const tEarth = tMoon.AddDays(-lt);
  bodyPositionAt('earth', tEarth, earth);
  bodyPositionAt('sun', tEarth, sun);
  bodyPositionAt('sun', tEarth.AddDays(-sun.distanceTo(earth) / C_KM_S / 86_400), sun).sub(earth);
  moon.sub(earth);
  const ds = sun.length();
  const dm = moon.length();
  const sepRad = Math.acos(Math.max(-1, Math.min(1, -sun.dot(moon) / (ds * dm))));
  const R = EARTH_SHADOW_RADIUS_KM;
  // Shadow radii across the axis at the Moon's distance, over that distance: π − s + π☉ and π + s + π☉.
  const umbraRad = R / dm - (SUN_RADIUS_KM - R) / ds;
  const penumbraRad = R / dm + (SUN_RADIUS_KM + R) / ds;
  return { sepRad, umbraRad, penumbraRad, moonRad: MOON_RADIUS_KM / dm };
}

export interface LunarContacts {
  /** Times (AstroTime) of the penumbral, partial and total phases' starts and ends; null when a phase does not happen. */
  p1: AstroTime | null;
  u1: AstroTime | null;
  u2: AstroTime | null;
  greatest: AstroTime;
  u3: AstroTime | null;
  u4: AstroTime | null;
  p4: AstroTime | null;
  /** Umbral magnitude at greatest eclipse: the fraction of the Moon's diameter inside the umbra. */
  umbralMagnitude: number;
}

/** The contacts of the lunar eclipse nearest `near` (within ±`hours`). */
export function lunarContacts(near: AstroTime, hours = 6): LunarContacts {
  const greatest = goldenMin((t) => earthShadow(t).sepRad, near, hours);
  const g = earthShadow(greatest);
  const f = (key: 'p' | 'u1' | 'u2') => (t: AstroTime) => {
    const s = earthShadow(t);
    return key === 'p' ? s.sepRad - (s.penumbraRad + s.moonRad) : key === 'u1' ? s.sepRad - (s.umbraRad + s.moonRad) : s.sepRad - (s.umbraRad - s.moonRad);
  };
  const edge = (fn: (t: AstroTime) => number, dir: 1 | -1) => {
    if (fn(greatest) > 0) return null;
    let a = greatest;
    let b = greatest.AddDays((dir * hours) / 24);
    if (fn(b) < 0) return null;
    for (let i = 0; i < 50; i++) {
      const m = a.AddDays((b.ut - a.ut) / 2);
      if (fn(m) < 0) a = m;
      else b = m;
    }
    return a.AddDays((b.ut - a.ut) / 2);
  };
  return {
    p1: edge(f('p'), -1),
    u1: edge(f('u1'), -1),
    u2: edge(f('u2'), -1),
    greatest,
    u3: edge(f('u2'), 1),
    u4: edge(f('u1'), 1),
    p4: edge(f('p'), 1),
    umbralMagnitude: (g.umbraRad - (g.sepRad - g.moonRad)) / (2 * g.moonRad),
  };
}

/** Golden-section minimum of fn over [near − hours, near + hours] (to well under a second). */
function goldenMin(fn: (t: AstroTime) => number, near: AstroTime, hours: number): AstroTime {
  const r = (Math.sqrt(5) - 1) / 2;
  let a = -hours / 24;
  let b = hours / 24;
  let c = b - r * (b - a);
  let e = a + r * (b - a);
  let fc = fn(near.AddDays(c));
  let fe = fn(near.AddDays(e));
  for (let i = 0; i < 60; i++) {
    if (fc < fe) {
      b = e;
      e = c;
      fe = fc;
      c = b - r * (b - a);
      fc = fn(near.AddDays(c));
    } else {
      a = c;
      c = e;
      fc = fe;
      e = a + r * (b - a);
      fe = fn(near.AddDays(e));
    }
  }
  return near.AddDays((a + b) / 2);
}

// ─── Who eclipses whom (for the renderer) ─────────────────────────────────────────────────

/**
 * The light Earth's atmosphere bends into its umbra, in units of full sunlight on the Moon, red because the blue is
 * scattered out on the way through. The real Moon in totality is about 10⁻⁴ as bright as the full Moon (Danjon
 * L = 2–3); this is about a hundred times that, so the copper Moon can be seen at all at the view's exposure (the
 * Moon's card says so).
 */
export const EARTH_UMBRA_GLOW: readonly [number, number, number] = [0.02, 0.0065, 0.0022];

export interface Eclipser {
  id: BodyId;
  radiusKm: number;
  glow: readonly [number, number, number];
}

/** Moons this big or bigger cast shadows worth drawing (the Moon, the Galilean moons, Titan, Triton, Charon). */
const ECLIPSER_MIN_KM = 500;
const eclipserCache = new Map<BodyId, { version: number; list: Eclipser[] }>();

/**
 * The bodies that can eclipse `id`, largest first, at most four: the planet a moon goes round (Earth for the Moon,
 * with its atmosphere's Danjon radius and its red glow; Jupiter for Io…), and a body's own moons of 500 km and
 * more. Cached until the registry changes (`version`).
 */
export function eclipsersOf(id: BodyId, version: number): Eclipser[] {
  const hit = eclipserCache.get(id);
  if (hit && hit.version === version) return hit.list;
  const rec = getBody(id);
  const list: Eclipser[] = [];
  const parent = rec?.kind === 'moon' && rec.parent ? getBody(rec.parent) : undefined;
  if (parent && parent.physical.radiusKm > (rec?.physical.radiusKm ?? 0)) {
    const earth = parent.id === 'earth';
    list.push({ id: parent.id, radiusKm: earth ? EARTH_SHADOW_RADIUS_KM : parent.physical.radiusKm, glow: earth ? EARTH_UMBRA_GLOW : [0, 0, 0] });
  }
  if (rec && rec.kind !== 'moon') {
    for (const c of childrenOf(id)) if (c.kind === 'moon' && c.physical.radiusKm >= ECLIPSER_MIN_KM) list.push({ id: c.id, radiusKm: c.physical.radiusKm, glow: [0, 0, 0] });
  }
  list.sort((a, b) => b.radiusKm - a.radiusKm);
  list.length = Math.min(list.length, 4);
  eclipserCache.set(id, { version, list });
  return list;
}
