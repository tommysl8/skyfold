/**
 * Small providers: Voyager 1's two-body hyperbola, a star fixed at its catalogue place, a body
 * sitting at its centre, and a Keplerian orbit (for simple data and for the tests).
 */
import type { AstroTime } from 'astronomy-engine';
import { Vector3 } from 'three';
import { propagateTwoBody } from '../../../physics/kepler';
import { msFromCivil } from '../../../lib/time';
import { raDecToWorld } from '../../frames';
import { voyagerHelioState } from '../../voyager';
import { MOTION_VALID_YEARS } from '../../stars/constants';
import type { Availability, PositionProvider, Regime, Vec3Like } from '../types';

const toEcl = (w: Vector3, out: Vec3Like) => {
  out.x = w.x;
  out.y = -w.z;
  out.z = w.y;
};

const zero = (pos: Vec3Like, vel?: Vec3Like | null) => {
  pos.x = pos.y = pos.z = 0;
  if (vel) vel.x = vel.y = vel.z = 0;
};

/** Shared availability objects: providers return these rather than allocating. */
export const ALWAYS: Record<Regime, Availability> = {
  precise: { available: true, reason: null, regime: 'precise' },
  approximate: { available: true, reason: null, regime: 'approximate' },
  illustrative: { available: true, reason: null, regime: 'illustrative' },
  extrapolated: { available: true, reason: null, regime: 'extrapolated' },
  unknown: { available: true, reason: null, regime: 'unknown' },
};

// ─── Open orbits ──────────────────────────────────────────────────────────────────────────

/**
 * A body on an open orbit (a spacecraft or an interstellar visitor leaving the Sun on a hyperbola) is followed only
 * within a million years of J2000 (stars/constants MOTION_VALID_YEARS): a straight run out at its speed at infinity is
 * then tens of parsecs, where the Galaxy's tides and the stars it passes bend its path, which is not modelled, and
 * where the app holds the stars round the Sun still. Beyond, the body is not shown, rather than kept running off in a
 * straight line for ever (at Voyager 1's 16.6 km/s, 17 kpc in a billion years).
 */
export const OPEN_ORBIT_YEARS = MOTION_VALID_YEARS;
const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12);
const JULIAN_YEAR_MS = 365.25 * 86_400_000;

/** Whether a body on an open orbit is past the span it is followed for (OPEN_ORBIT_YEARS either side of J2000). */
export const beyondOpenOrbit = (ms: number): boolean => Math.abs(ms - J2000_UTC_MS) > OPEN_ORBIT_YEARS * JULIAN_YEAR_MS;

/** The availability of a body on an open orbit past that span. */
export function openOrbitEnded(name: string): Availability {
  return {
    available: false,
    reason: `${name} is followed for a million years either side of now: further out than that, the Galaxy’s pull and passing stars bend its path, which is not modelled.`,
    regime: 'unknown',
  };
}

// ─── Voyager 1 ───────────────────────────────────────────────────────────────────────────

/** Voyager 1's launch, 1977-09-05 12:56 UTC. [NASA/JPL] */
export const VOYAGER1_LAUNCH_MS = msFromCivil(1977, 9, 5, 12, 56);
/** Voyager 1's Saturn flyby, 1980-11-12 23:46 UTC: its modelled path (a solar hyperbola) starts here. */
export const VOYAGER1_MODEL_START_MS = msFromCivil(1980, 11, 12, 23, 46);

const V1_NOT_LAUNCHED: Availability = {
  available: false,
  reason: 'Voyager 1 had not been launched yet: it left Earth on 5 September 1977.',
  regime: 'unknown',
};
const V1_NOT_MODELLED: Availability = {
  available: false,
  reason: 'Voyager 1 appears after its Saturn flyby on 12 November 1980; its path before that is not modelled.',
  regime: 'unknown',
};

const V1_ENDED = openOrbitEnded('Voyager 1');

/** Voyager 1: a Horizons state propagated as a two-body hyperbola (sim/voyager.ts), from its 1980 Saturn flyby on, for a million years. */
export const voyager1Provider: PositionProvider = {
  label: 'JPL Horizons state (2026) propagated as a two-body hyperbola about the Solar System barycentre',
  exactLightTime: true,
  availability(ms) {
    if (ms < VOYAGER1_LAUNCH_MS) return V1_NOT_LAUNCHED;
    if (ms < VOYAGER1_MODEL_START_MS) return V1_NOT_MODELLED;
    if (beyondOpenOrbit(ms)) return V1_ENDED;
    return ALWAYS.approximate;
  },
  positionAt(time, pos, vel) {
    const s = voyagerHelioState(time);
    toEcl(s.pos, pos);
    if (vel) toEcl(s.vel, vel);
  },
};

// ─── Fixed places ────────────────────────────────────────────────────────────────────────

const YEAR_MS = 365.25 * 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

/**
 * A star held at its catalogue position (RA and Dec in degrees, J2000; distance in km), proper
 * motion ignored: negligible for centuries, degrees by the far past. The regime says so:
 * approximate within `goodYears` of J2000, illustrative beyond.
 */
export function fixedStarProvider(raDeg: number, decDeg: number, distanceKm: number, goodYears = 1000): PositionProvider {
  const world = raDecToWorld(raDeg, decDeg).multiplyScalar(distanceKm);
  return {
    label: 'Catalogue position, proper motion not modelled',
    static: true,
    availability: (ms) => (Math.abs(ms - J2000_MS) <= goodYears * YEAR_MS ? ALWAYS.approximate : ALWAYS.illustrative),
    positionAt(_time, pos, vel) {
      toEcl(world, pos);
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
}

/**
 * At its centre: a body placed exactly on its barycentre until an offset model exists (Pluto
 * on the Pluto–Charon barycentre until Charon's orbit is loaded). Availability follows `like`.
 */
export function atCentreProvider(like?: PositionProvider, label = 'At the system barycentre'): PositionProvider {
  return {
    label,
    availability: like ? (ms) => like.availability(ms) : () => ALWAYS.approximate,
    positionAt: (_time, pos, vel) => zero(pos, vel),
  };
}

/** A fixed offset from the centre, J2000 ecliptic km. */
export function fixedOffsetProvider(x: number, y: number, z: number, regime: Regime = 'approximate'): PositionProvider {
  return {
    static: true,
    availability: () => ALWAYS[regime],
    positionAt(_time, pos, vel) {
      pos.x = x;
      pos.y = y;
      pos.z = z;
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
}

// ─── Kepler ──────────────────────────────────────────────────────────────────────────────

export interface KeplerElements {
  /** Semi-major axis, km. */
  a: number;
  e: number;
  /** Inclination, longitude of the ascending node and argument of periapsis, degrees (J2000 ecliptic). */
  iDeg: number;
  nodeDeg: number;
  periDeg: number;
  /** Mean anomaly at `epochTt`, degrees. */
  m0Deg: number;
  /** TT days since J2000. */
  epochTt: number;
  /** GM of the central body plus the orbiter, km³/s². */
  mu: number;
}

const DEG = Math.PI / 180;

/**
 * A fixed Keplerian ellipse about the centre (no perturbations). Allocation-free: good for data
 * given as mean elements, and the registry's performance test.
 */
export function keplerProvider(el: KeplerElements, regime: Regime = 'illustrative', label = 'Keplerian orbit (mean elements)'): PositionProvider {
  if (!(el.e >= 0 && el.e < 1 && el.a > 0 && el.mu > 0)) throw new Error('keplerProvider: needs 0 ≤ e < 1, a > 0 and mu > 0');
  const n = Math.sqrt(el.mu / (el.a * el.a * el.a)); // rad/s
  const nDay = n * 86_400;
  const [ci, si] = [Math.cos(el.iDeg * DEG), Math.sin(el.iDeg * DEG)];
  const [cO, sO] = [Math.cos(el.nodeDeg * DEG), Math.sin(el.nodeDeg * DEG)];
  const [cw, sw] = [Math.cos(el.periDeg * DEG), Math.sin(el.periDeg * DEG)];
  // Perifocal → ecliptic: P (towards periapsis) and Q (90° ahead).
  const P = { x: cO * cw - sO * sw * ci, y: sO * cw + cO * sw * ci, z: sw * si };
  const Q = { x: -cO * sw - sO * cw * ci, y: -sO * sw + cO * cw * ci, z: cw * si };
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  const period = (2 * Math.PI) / nDay;
  const availability = () => ALWAYS[regime];
  return {
    label,
    availability,
    positionAt(time: AstroTime, pos: Vec3Like, vel?: Vec3Like | null) {
      const dt = (time.tt - el.epochTt) % period; // the fmod keeps huge spans exact
      let M = el.m0Deg * DEG + nDay * dt;
      M %= 2 * Math.PI;
      let E = el.e < 0.8 ? M : Math.PI;
      for (let k = 0; k < 30; k++) {
        const f = E - el.e * Math.sin(E) - M;
        const d = f / (1 - el.e * Math.cos(E));
        E -= d;
        if (Math.abs(d) < 1e-15) break;
      }
      const cE = Math.cos(E);
      const sE = Math.sin(E);
      const x = el.a * (cE - el.e);
      const y = b * sE;
      pos.x = P.x * x + Q.x * y;
      pos.y = P.y * x + Q.y * y;
      pos.z = P.z * x + Q.z * y;
      if (vel) {
        const Edot = n / (1 - el.e * cE); // rad/s
        const vx = -el.a * sE * Edot;
        const vy = b * cE * Edot;
        vel.x = P.x * vx + Q.x * vy;
        vel.y = P.y * vx + Q.y * vy;
        vel.z = P.z * vx + Q.z * vy;
      }
    },
  };
}

/** A two-body conic from a state vector (ecliptic km and km/s at `epochTt`), elliptic or hyperbolic. */
export function twoBodyProvider(r0: Vec3Like, v0: Vec3Like, epochTt: number, mu: number, regime: Regime = 'extrapolated'): PositionProvider {
  const R0 = { x: r0.x, y: r0.y, z: r0.z };
  const V0 = { x: v0.x, y: v0.y, z: v0.z };
  return {
    label: 'Two-body conic from a state vector',
    availability: () => ALWAYS[regime],
    positionAt(time, pos, vel) {
      const s = propagateTwoBody(R0, V0, (time.tt - epochTt) * 86_400, mu);
      pos.x = s.r.x;
      pos.y = s.r.y;
      pos.z = s.r.z;
      if (vel) {
        vel.x = s.v.x;
        vel.y = s.v.y;
        vel.z = s.v.z;
      }
    },
  };
}
