/**
 * Providers for the Sun, the planets, Pluto's system and the Moon, through the date policy of
 * ephemerisPolicy.ts: astronomy-engine (VSOP87 planets, a numerical Pluto, Brown's lunar theory
 * and the IAU WGCCRE 2015 rotation models) in 1700–2200; Standish's JPL Keplerian elements for
 * the planets out to 3000 BCE–3000 CE; frozen elements, a mean-element Moon and frozen poles
 * beyond. Model changes are blended so that positions and velocities stay continuous.
 *
 * The arithmetic is the same, operation for operation, as the per-body code it replaced, so
 * positions are unchanged to the last bit: they are computed in world axes as before and handed
 * to the registry in ecliptic axes, a permutation with one sign change (exact).
 */
import { Body, GeoMoonState, HelioState, HelioVector, RotationAxis, Rotation_EQD_EQJ, SiderealTime, type AstroTime } from 'astronomy-engine';
import { Quaternion, Vector3 } from 'three';
import { AU_KM, BODIES, DAY_S } from '../../../physics/constants';
import { moonMeanLongitude, moonMeanState, newEclState, standishState, type MeanPlanet } from '../../../physics/meanElements';
import { astroTimeAt, msFromAstroTime } from '../../../lib/time';
import { eclToWorld, eqjToWorld } from '../../frames';
import { APPROX_END_MS, APPROX_START_MS, ephemerisQuality, moonBlend, orientationEdge, planetBlend, type Blend, type EphemerisQuality } from '../../ephemerisPolicy';
import type { Availability, PositionProvider, RotationProvider, Vec3Like } from '../types';
import { orientationFromPole } from '../rotation';

const AU_PER_DAY_TO_KM_S = AU_KM / DAY_S;
/** Earth/Moon mass ratio, from the GMs in the body table (≈ 81.30). */
const EARTH_MOON_RATIO = BODIES.earth.gmKm3S2! / BODIES.moon.gmKm3S2!;
const CY_D = 36_525;

export type EnginePlanet = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

const ENGINE_BODY: Record<EnginePlanet, Body> = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  earth: Body.Earth,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

/** Bodies placed on Standish's elements far from the present (Earth goes through the Earth–Moon barycentre). */
const MEAN_PLANET: Record<EnginePlanet, MeanPlanet> = {
  mercury: 'mercury',
  venus: 'venus',
  earth: 'emb',
  mars: 'mars',
  jupiter: 'jupiter',
  saturn: 'saturn',
  uranus: 'uranus',
  neptune: 'neptune',
  pluto: 'pluto',
};

// ─── Availability ────────────────────────────────────────────────────────────────────────

const QUALITY: Record<EphemerisQuality, Availability> = {
  precise: { available: true, reason: null, regime: 'precise' },
  approximate: { available: true, reason: null, regime: 'approximate' },
  illustrative: { available: true, reason: null, regime: 'illustrative' },
};

/** Always there; as good as the date policy says. */
export const policyAvailability = (ms: number): Availability => QUALITY[ephemerisQuality(ms)];

// ─── Shared state ────────────────────────────────────────────────────────────────────────

const ecl = newEclState();
const pA = new Vector3();
const vA = new Vector3();
const pB = new Vector3();
const vB = new Vector3();
const moonP = new Vector3();
const moonV = new Vector3();
// The Moon has scratch vectors of its own: Earth's state needs it halfway through its own blend.
const mA = new Vector3();
const mvA = new Vector3();
const mB = new Vector3();
const mvB = new Vector3();
const moonBlendTmp: Blend = { w: 0, dw: 0 };
const moonEcl = newEclState();
const blendTmp: Blend = { w: 0, dw: 0 };
const outP = new Vector3();
const outV = new Vector3();

/** out = (1 − w)·a + w·b for positions; velocities also carry dw/dt·(b − a) so they stay the derivative. */
function mix(w: number, dw: number, pa: Vector3, va: Vector3 | null, pb: Vector3, vb: Vector3 | null, pos: Vector3, vel: Vector3 | null) {
  if (vel && va && vb) {
    vel.set(
      (1 - w) * va.x + w * vb.x + dw * (pb.x - pa.x),
      (1 - w) * va.y + w * vb.y + dw * (pb.y - pa.y),
      (1 - w) * va.z + w * vb.z + dw * (pb.z - pa.z),
    );
  }
  pos.set((1 - w) * pa.x + w * pb.x, (1 - w) * pa.y + w * pb.y, (1 - w) * pa.z + w * pb.z);
}

/** Geocentric Moon (world axes, km and km/s): astronomy-engine, fading into mean elements far from now. */
function moonGeoState(time: AstroTime, pos: Vector3, vel: Vector3 | null): void {
  const { w, dw } = moonBlend(msFromAstroTime(time), moonBlendTmp);
  if (w < 1) {
    const m = GeoMoonState(time);
    eqjToWorld(m.x * AU_KM, m.y * AU_KM, m.z * AU_KM, mA);
    eqjToWorld(m.vx * AU_PER_DAY_TO_KM_S, m.vy * AU_PER_DAY_TO_KM_S, m.vz * AU_PER_DAY_TO_KM_S, mvA);
    if (w === 0) {
      pos.copy(mA);
      vel?.copy(mvA);
      return;
    }
  }
  moonMeanState(time.tt / CY_D, moonEcl);
  eclToWorld(moonEcl.x, moonEcl.y, moonEcl.z, mB);
  eclToWorld(moonEcl.vx, moonEcl.vy, moonEcl.vz, mvB);
  if (w === 1) {
    pos.copy(mB);
    vel?.copy(mvB);
    return;
  }
  mix(w, dw, mA, mvA, mB, mvB, pos, vel);
}

/**
 * The geocentric Moon at `time`, computed once per time: Earth needs it far from the present
 * (Standish gives the Earth–Moon barycentre) and the Moon needs it always.
 */
const moonCache = { time: null as AstroTime | null, vel: false };
function moonGeo(time: AstroTime, wantVel: boolean): void {
  if (moonCache.time === time && (moonCache.vel || !wantVel)) return;
  moonGeoState(time, moonP, wantVel ? moonV : null);
  moonCache.time = time;
  moonCache.vel = wantVel;
}

/**
 * Heliocentric state of a planet (world axes). Earth needs the geocentric Moon, since Standish
 * gives the Earth–Moon barycentre.
 */
function planetState(id: EnginePlanet, time: AstroTime, pos: Vector3, vel: Vector3 | null): void {
  const { w, dw } = planetBlend(msFromAstroTime(time), blendTmp);
  if (w < 1) {
    const body = ENGINE_BODY[id];
    if (vel) {
      const s = HelioState(body, time);
      eqjToWorld(s.x * AU_KM, s.y * AU_KM, s.z * AU_KM, pA);
      eqjToWorld(s.vx * AU_PER_DAY_TO_KM_S, s.vy * AU_PER_DAY_TO_KM_S, s.vz * AU_PER_DAY_TO_KM_S, vA);
    } else {
      const v = HelioVector(body, time);
      eqjToWorld(v.x * AU_KM, v.y * AU_KM, v.z * AU_KM, pA);
    }
    if (w === 0) {
      pos.copy(pA);
      if (vel) vel.copy(vA);
      return;
    }
  }
  const T = time.tt / CY_D;
  standishState(MEAN_PLANET[id], T, ecl);
  eclToWorld(ecl.x, ecl.y, ecl.z, pB);
  eclToWorld(ecl.vx, ecl.vy, ecl.vz, vB);
  if (id === 'earth') {
    // Earth sits opposite the Moon about the barycentre: E = EMB − r_Moon/(1 + M_E/M_M).
    moonGeo(time, !!vel);
    const k = 1 / (1 + EARTH_MOON_RATIO);
    pB.addScaledVector(moonP, -k);
    if (vel) vB.addScaledVector(moonV, -k);
  }
  if (w === 1) {
    pos.copy(pB);
    if (vel) vel.copy(vB);
    return;
  }
  mix(w, dw, pA, vA, pB, vB, pos, vel);
}

/** World axes → the registry's ecliptic axes: (x, −z, y). Exact. */
function toEcl(w: Vector3, out: Vec3Like): void {
  out.x = w.x;
  out.y = -w.z;
  out.z = w.y;
}

// ─── Providers ───────────────────────────────────────────────────────────────────────────

/** The Sun: the origin of the world frame. */
export const sunProvider: PositionProvider = {
  label: 'The origin of the heliocentric frame',
  static: true,
  availability: policyAvailability,
  positionAt(_time, pos, vel) {
    pos.x = pos.y = pos.z = 0;
    if (vel) vel.x = vel.y = vel.z = 0;
  },
};

/** A planet's heliocentric position (Pluto's: the Pluto–Charon barycentre, as astronomy-engine gives it). */
export function planetProvider(id: EnginePlanet): PositionProvider {
  return {
    label: 'VSOP87 via astronomy-engine in 1700–2200; JPL approximate elements (Standish) beyond',
    exactLightTime: true,
    availability: policyAvailability,
    positionAt(time, pos, vel) {
      planetState(id, time, outP, vel ? outV : null);
      toEcl(outP, pos);
      if (vel) toEcl(outV, vel);
    },
  };
}

/** The Moon relative to Earth. */
export const moonProvider: PositionProvider = {
  label: 'Brown’s lunar theory via astronomy-engine; mean elements beyond 3000 BCE–3000 CE',
  availability: policyAvailability,
  positionAt(time, pos, vel) {
    moonGeo(time, !!vel);
    toEcl(moonP, pos);
    if (vel) toEcl(moonV, vel);
  },
};

/** Geocentric state of the Moon (km, km/s) in world axes. */
export function moonGeocentric(time: AstroTime): { r: Vector3; v: Vector3 } {
  const r = new Vector3();
  const v = new Vector3();
  moonGeoState(time, r, v);
  return { r, v };
}

// ─── Rotation ────────────────────────────────────────────────────────────────────────────

interface FrozenAxis {
  ra: number;
  dec: number;
  spin: number;
  /** Spin rate at the edge, degrees per day. */
  rate: number;
  /** TT days since J2000 at the edge. */
  tt: number;
  /** The Moon's mean longitude at the edge (deg), which its spin follows beyond. */
  moonL: number;
}

const earthTmp = { ra: 0, dec: 0, spin: 0 };

/**
 * Earth's pole and prime meridian, with the meridian set from Greenwich apparent sidereal time. astronomy-engine's
 * RotationAxis gives Earth's pole of date (precession and nutation) but a spin from the Earth rotation angle as if
 * it were measured from the node of the equator of date on the J2000 equator, which the IAU convention needs; the
 * Earth rotation angle is measured from the celestial intermediate origin, which stays near the J2000 equinox's
 * meridian instead. The two differ by about the pole's right ascension of date, which grows with precession: 0.9°
 * of longitude (100 km at the equator) in 2024, so Earth's map, the eclipse shadows and the satellites' ground tracks
 * came out that far apart. Here the prime meridian is put where astronomy-engine's own sidereal time and
 * precession–nutation say Greenwich is (as its Observer functions do), and the spin is that meridian's angle from
 * the node, so the IAU construction (rotation.ts orientationFromPole) reproduces it.
 */
function earthAxis(time: AstroTime): { ra: number; dec: number; spin: number } {
  const a = RotationAxis(Body.Earth, time);
  const g = (SiderealTime(time) * 15 * Math.PI) / 180;
  const r = Rotation_EQD_EQJ(time).rot;
  // Greenwich in J2000 equatorial axes (astronomy-engine's convention: v′ᵢ = Σⱼ rot[j][i] vⱼ).
  const cg = Math.cos(g);
  const sg = Math.sin(g);
  const xx = r[0][0] * cg + r[1][0] * sg;
  const xy = r[0][1] * cg + r[1][1] * sg;
  const xz = r[0][2] * cg + r[1][2] * sg;
  const ra = (a.ra * 15 * Math.PI) / 180;
  const dec = (a.dec * Math.PI) / 180;
  // The node Q = (−sin α, cos α, 0) and z × Q, as in orientationFromPole.
  const qx = -Math.sin(ra);
  const qy = Math.cos(ra);
  const zx = Math.cos(dec) * Math.cos(ra);
  const zy = Math.cos(dec) * Math.sin(ra);
  const zz = Math.sin(dec);
  const cx = -zz * qy;
  const cy = zz * qx;
  const cz = zx * qy - zy * qx;
  const w = (Math.atan2(cx * xx + cy * xy + cz * xz, qx * xx + qy * xy) * 180) / Math.PI;
  earthTmp.ra = a.ra;
  earthTmp.dec = a.dec;
  // Keep astronomy-engine's count of whole turns, so the spin stays continuous for the rate taken from it.
  earthTmp.spin = a.spin + ((((w - a.spin) % 360) + 540) % 360) - 180;
  return earthTmp;
}

/**
 * astronomy-engine's rotation elements (IAU WGCCRE 2015) inside 3000 BCE–3000 CE; beyond, the
 * pole held where it was at the nearer edge (the IAU polynomials would wander off) and the body
 * spinning at its edge rate. `lockedToMoon`: the Moon keeps turning with the mean-element Moon
 * beyond, so its near side still faces Earth.
 */
export function engineRotation(body: Body, lockedToMoon = false): RotationProvider {
  let past: FrozenAxis | null = null;
  let future: FrozenAxis | null = null;
  const tmp = { ra: 0, dec: 0, spin: 0 };
  const axis = (t: AstroTime) => (body === Body.Earth ? earthAxis(t) : RotationAxis(body, t));

  function frozen(side: 1 | -1): FrozenAxis {
    let f = side > 0 ? future : past;
    if (!f) {
      const t0 = astroTimeAt(side > 0 ? APPROX_END_MS : APPROX_START_MS);
      const a0 = { ...axis(t0) };
      // 0.01 day is short enough that no body turns more than half a revolution in it.
      const t1 = t0.AddDays(0.01);
      const a1 = axis(t1);
      const dSpin = ((((a1.spin - a0.spin) % 360) + 540) % 360) - 180;
      f = { ra: a0.ra, dec: a0.dec, spin: a0.spin, rate: dSpin / (t1.tt - t0.tt), tt: t0.tt, moonL: moonMeanLongitude(t0.tt / CY_D) };
      if (side > 0) future = f;
      else past = f;
    }
    return f;
  }

  function axisAt(time: AstroTime): { ra: number; dec: number; spin: number } {
    const side = orientationEdge(msFromAstroTime(time));
    if (side === 0) return axis(time);
    const f = frozen(side);
    tmp.ra = f.ra;
    tmp.dec = f.dec;
    if (lockedToMoon) {
      tmp.spin = f.spin + ((moonMeanLongitude(time.tt / CY_D) - f.moonL) % 360);
    } else {
      const period = 360 / Math.abs(f.rate); // days per turn; the fmod keeps huge spans exact
      tmp.spin = f.spin + ((time.tt - f.tt) % period) * f.rate;
    }
    return tmp;
  }

  return {
    orientationAt(time: AstroTime, out: Quaternion) {
      const axis = axisAt(time);
      const ra = (axis.ra * 15 * Math.PI) / 180;
      const dec = (axis.dec * Math.PI) / 180;
      const W = ((axis.spin % 360) * Math.PI) / 180;
      return orientationFromPole(ra, dec, W, out);
    },
  };
}
