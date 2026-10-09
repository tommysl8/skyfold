/**
 * World positions from the registry: each body's position relative to its centre comes from its
 * provider; its heliocentric world position is its centre's plus that, in float64. Once per
 * frame one pass over the evaluation order (centres first) places every body; at any other
 * time the chain of centres is walked for the bodies asked about.
 *
 * The per-frame pass does not allocate: it reuses each body's own vectors.
 */
import type { AstroTime } from 'astronomy-engine';
import { Quaternion, Vector3 } from 'three';
import { msFromAstroTime } from '../../lib/time';
import { sim } from '../sim';
import { entryOf, evalEntries, type Entry, type Group } from './registry';
import type { Availability, BodyId, Vec3Like } from './types';

const eclP: Vec3Like = { x: 0, y: 0, z: 0 };
const eclV: Vec3Like = { x: 0, y: 0, z: 0 };

/** The time of the last per-frame pass, and its stamp (see Entry.stamp). */
let walkTime: AstroTime | null = null;
let walkStamp = 0;
/**
 * The pass's time in UTC ms, held in one variable: handing a number kept in a local to every
 * provider would box it anew for each call (16 bytes per body per frame).
 */
let walkMs = 0;

/**
 * The Sun shown at another age (sim/stars/sunFuture.ts): the orbits about it widened by `scale` (a ∝ 1/M as it loses mass
 * slowly; speeds fall by the same factor), and the bodies it has swallowed (by light-time group: a planet with its
 * moons) absent. Scale 1 and none today.
 */
export const solarAge = { scale: 1, gone: new Set<BodyId>() };

/** Widen the Sun's orbits: a body placed straight about the Sun (a planet, not its moons), while the Sun is shown older. */
function widen(e: Entry, pos: Vector3, vel: Vector3 | null): void {
  if (solarAge.scale === 1 || e.group !== e || e.root === e || e.root.id !== 'sun') return;
  pos.multiplyScalar(solarAge.scale);
  vel?.multiplyScalar(1 / solarAge.scale);
}

/**
 * Place every registered body at `time`: availability, position and velocity (world axes, km
 * and km/s, heliocentric), and orientation. Fills sim.bodies.
 */
export function updateWorld(time: AstroTime): void {
  walkMs = msFromAstroTime(time);
  walkStamp++;
  walkTime = time;
  const order = evalEntries();
  for (let i = 0; i < order.length; i++) {
    const e = order[i];
    const s = e.state;
    const p = e.record.provider;
    const a = p.availability(walkMs);
    s.present = a.available && !(solarAge.gone.size > 0 && solarAge.gone.has(e.group.id));
    s.regime = a.regime;
    p.positionAt(time, eclP, eclV);
    // J2000 ecliptic → world: (x, z, −y)
    e.rel.pos.set(eclP.x, eclP.z, -eclP.y);
    e.rel.vel.set(eclV.x, eclV.z, -eclV.y);
    widen(e, e.rel.pos, e.rel.vel);
    const c = e.centre;
    if (c) {
      s.pos.copy(c.state.pos).add(e.rel.pos);
      s.vel.copy(c.state.vel).add(e.rel.vel);
    } else {
      s.pos.copy(e.rel.pos);
      s.vel.copy(e.rel.vel);
    }
    if (e.rotation) e.rotation.orientationAt(time, s.quat, e.rel);
    e.stamp = walkStamp;
  }
}

// ─── At any time ─────────────────────────────────────────────────────────────────────────

/**
 * Scratch space per nesting level: a provider may ask for another body's position while it is
 * being evaluated (a track's centre), so the chain walk must be re-entrant.
 */
interface Level {
  chain: Entry[];
  p: Vec3Like;
  v: Vec3Like;
  t: Vector3;
  tv: Vector3;
  out: Vector3;
  outV: Vector3;
}
const levels: Level[] = [];
let depth = 0;

function level(): Level {
  let l = levels[depth];
  if (!l) {
    l = { chain: [], p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, t: new Vector3(), tv: new Vector3(), out: new Vector3(), outV: new Vector3() };
    levels[depth] = l;
  }
  return l;
}

/**
 * Heliocentric world state of an entry at `time` (km, and km/s when `vel` is given), walking its
 * chain of centres. Reuses the per-frame pass when `time` is the frame's own.
 */
function stateAt(e: Entry, time: AstroTime, pos: Vector3, vel: Vector3 | null): Vector3 {
  const L = level();
  depth++;
  try {
    // Chain from the entry up to the first ancestor already placed at this time (or the root).
    // A root that never moves (the Sun) is where the last pass put it, at any time.
    const chain = L.chain;
    chain.length = 0;
    let base: Entry | null = null;
    for (let x: Entry | null = e; x; x = x.centre) {
      if ((time === walkTime && x.stamp === walkStamp) || (!x.centre && x.stamp >= 0 && x.record.provider.static)) {
        base = x;
        break;
      }
      chain.push(x);
    }
    if (base) {
      pos.copy(base.state.pos);
      vel?.copy(base.state.vel);
    }
    // Root first, adding each level's offset in the same order as the per-frame pass.
    for (let i = chain.length - 1; i >= 0; i--) {
      chain[i].record.provider.positionAt(time, L.p, vel ? L.v : null);
      L.t.set(L.p.x, L.p.z, -L.p.y);
      if (vel) L.tv.set(L.v.x, L.v.z, -L.v.y);
      widen(chain[i], L.t, vel ? L.tv : null);
      if (i === chain.length - 1 && !base) {
        pos.copy(L.t);
        vel?.copy(L.tv);
      } else {
        pos.add(L.t);
        vel?.add(L.tv);
      }
    }
    chain.length = 0;
    return pos;
  } finally {
    depth--;
  }
}

/** Heliocentric world position of a body (or barycentre) at any time, km. */
export function bodyPositionAt(id: BodyId, time: AstroTime, out = new Vector3()): Vector3 {
  const e = entryOf(id);
  if (!e) throw new Error(`bodyPositionAt: unknown body '${id}'`);
  return stateAt(e, time, out, null);
}

/** Heliocentric world position and velocity of a body at any time (km, km/s). */
export function bodyStateAt(id: BodyId, time: AstroTime, pos = new Vector3(), vel = new Vector3()): { pos: Vector3; vel: Vector3 } {
  const e = entryOf(id);
  if (!e) throw new Error(`bodyStateAt: unknown body '${id}'`);
  stateAt(e, time, pos, vel);
  return { pos, vel };
}

/**
 * Heliocentric J2000 ecliptic position of a body at `time`, km: what track providers use to
 * resolve their per-segment centres. Cheap during the per-frame pass for bodies already placed.
 */
export function heliocentricEclAt(id: BodyId, time: AstroTime, out: Vec3Like): Vec3Like {
  const e = entryOf(id);
  if (!e) throw new Error(`heliocentricEclAt: unknown body '${id}'`);
  const w = stateAt(e, time, level().out, null);
  out.x = w.x;
  out.y = -w.z;
  out.z = w.y;
  return out;
}

/** Heliocentric J2000 ecliptic position (km) and velocity (km/s) of a body at `time`. */
export function heliocentricEclStateAt(id: BodyId, time: AstroTime, pos: Vec3Like, vel: Vec3Like): void {
  const e = entryOf(id);
  if (!e) throw new Error(`heliocentricEclStateAt: unknown body '${id}'`);
  const L = level();
  const p = L.out;
  const v = L.outV;
  stateAt(e, time, p, v);
  pos.x = p.x;
  pos.y = -p.z;
  pos.z = p.y;
  vel.x = v.x;
  vel.y = -v.z;
  vel.z = v.y;
}

const relTmp = { pos: new Vector3(), vel: new Vector3() };

/** Orientation of a body at any time (identity for bodies without a rotation model). */
export function bodyOrientation(id: BodyId, time: AstroTime, out = new Quaternion()): Quaternion {
  const e = entryOf(id);
  if (!e?.rotation) return out.identity();
  if (!e.rotation.usesOrbit) return e.rotation.orientationAt(time, out, null);
  e.record.provider.positionAt(time, eclP, eclV);
  relTmp.pos.set(eclP.x, eclP.z, -eclP.y);
  relTmp.vel.set(eclV.x, eclV.z, -eclV.y);
  return e.rotation.orientationAt(time, out, relTmp);
}

/** Whether a body can be shown, picked and targeted at a simulation time, and how good its position is then. */
export function bodyAvailability(id: BodyId, ms: number): Availability {
  const e = entryOf(id);
  if (!e) return UNKNOWN;
  return e.record.provider.availability(ms);
}
const UNKNOWN: Availability = { available: false, reason: 'Not in Skyfold yet', regime: 'unknown' };

export const isBodyAvailable = (id: BodyId, ms: number = sim.timeMs): boolean => bodyAvailability(id, ms).available;

// ─── A whole system at one time (light-time) ─────────────────────────────────────────────

const baseP = new Vector3();
const baseV = new Vector3();

/**
 * Place every member of a light-time group at `time`, into each entry's `t` scratch (world
 * position, velocity and, with `rotate`, orientation). The group head's centre is walked once;
 * members are then placed relative to each other. With `headAt`, the head is taken as already
 * placed there (carried back along its velocity) and only its members are evaluated.
 */
export function evalGroupAt(g: Group, time: AstroTime, rotate: boolean, headAt?: { pos: Vector3; vel: Vector3 }): void {
  const head = g.head;
  if (headAt) {
    head.t.pos.copy(headAt.pos);
    head.t.vel.copy(headAt.vel);
    head.t.rel.pos.copy(head.rel.pos);
    head.t.rel.vel.copy(head.rel.vel);
  } else if (head.centre) stateAt(head.centre, time, baseP, baseV);
  for (let i = 0; i < g.members.length; i++) {
    const m = g.members[i];
    const t = m.t;
    if (headAt && m === head) {
      if (rotate && m.rotation) m.rotation.orientationAt(time, t.quat, t.rel);
      continue;
    }
    m.record.provider.positionAt(time, eclP, eclV);
    t.rel.pos.set(eclP.x, eclP.z, -eclP.y);
    t.rel.vel.set(eclV.x, eclV.z, -eclV.y);
    widen(m, t.rel.pos, t.rel.vel);
    const c = m.centre;
    if (!c) {
      t.pos.copy(t.rel.pos);
      t.vel.copy(t.rel.vel);
    } else if (c === head.centre) {
      t.pos.copy(baseP).add(t.rel.pos);
      t.vel.copy(baseV).add(t.rel.vel);
    } else {
      t.pos.copy(c.t.pos).add(t.rel.pos);
      t.vel.copy(c.t.vel).add(t.rel.vel);
    }
    if (rotate && m.rotation) m.rotation.orientationAt(time, t.quat, t.rel);
  }
}
