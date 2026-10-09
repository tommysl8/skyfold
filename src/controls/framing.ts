/**
 * How far from a body the camera frames it: from its radius (four radii; five for stars;
 * sixteen for spacecraft, whose model is mostly booms; a record may say otherwise, as Saturn
 * does for its rings), and for a whole system, from the orbits of its moons.
 */
import { C_KM_S } from '../physics/constants';
import { shapeMaxRadiusKm } from '../render/shapes';
import { childrenOf, displayRadiusKm, getBody, type BodyId, type BodyRecord } from '../sim/bodies';
import { sim } from '../sim/sim';

/**
 * Floors for both distances, km (1 m and 1 cm). The registry refuses a destination without a
 * radius, but a zero here would put the camera on the body's centre and make the zoom path's
 * scale zero (NaN everywhere after).
 */
export const MIN_FRAMING_KM = 1e-3;
export const MIN_APPROACH_KM = 1e-5;

/**
 * Spacecraft are drawn as a probe model scaled to their radius (Bodies.tsx): the framing and the
 * closest approach follow Voyager 1's (0.03 km and 0.004 km for a 1.85 m radius), which keep the
 * camera clear of the dish, the bus and the generators.
 */
export const SPACECRAFT_FRAMING_RADII = 16;
export const SPACECRAFT_MIN_RADII = 2.2;

/** Default framing, in radii, of a kind of body. */
function defaultRadii(r: BodyRecord): number {
  if (r.kind === 'star') return 5;
  if (r.kind === 'spacecraft') return SPACECRAFT_FRAMING_RADII;
  return 4;
}

/** Distance from a body's centre at which it is nicely framed (also where a flight ends, but see flightStandoff). */
export function framingDistance(id: BodyId): number {
  const b = getBody(id);
  if (!b) return 1e4;
  const f = b.framing;
  if (f?.distanceKm !== undefined) return Math.max(MIN_FRAMING_KM, f.distanceKm);
  const r = displayRadiusKm(b);
  if (f?.radii !== undefined) return Math.max(MIN_FRAMING_KM, r * f.radii);
  // An irregular body is framed from its longest extent too (Arrokoth's lobes).
  return Math.max(MIN_FRAMING_KM, r * defaultRadii(b), 2 * outerRadiusKm(b));
}

/**
 * Largest distance of the body's surface from its centre, km: its record's `maxRadiusKm`, else
 * its shape model's (once loaded), else its display radius.
 */
function outerRadiusKm(b: BodyRecord): number {
  const shape = b.visual?.shape ? shapeMaxRadiusKm(b.visual.shape) : undefined;
  return Math.max(displayRadiusKm(b), b.physical.maxRadiusKm ?? 0, shape ?? 0);
}

/**
 * Kinds with no surface to stop short of: galaxies, groups and clusters of galaxies or stars, nebulae, and the region
 * where a gravitational-wave merger probably happened.
 */
const NO_SURFACE: ReadonlySet<BodyRecord['kind']> = new Set(['galaxy', 'cluster', 'nebula', 'merger', 'transient']);

/**
 * How far from a body's centre a flight to it ends, km, for a ship setting out `fromKm` from that
 * centre. At the framing distance, except for what has no surface (galaxies, clusters, nebulae), whose
 * framing distance is a sizeable part of the trip (a quarter of the way to Andromeda would be cut
 * short at four of its radii): the flight to one goes all the way in, to its closest approach, so the
 * trip's numbers are those of getting there, and the camera then pulls back to frame it
 * (CameraController.finishTravel). A ship already within the framing distance is there already.
 */
export function flightStandoff(id: BodyId, fromKm: number): number {
  const framing = framingDistance(id);
  const b = getBody(id);
  if (!b || !NO_SURFACE.has(b.kind) || !(fromKm > framing)) return framing;
  return Math.min(framing, minDistance(id));
}

/**
 * A black hole's horizon radius r_s = 2GM/c², km, from its record (its own value when the record
 * gives one, else from GM); 0 when the body is not a black hole. (Re-exported by the camera controller.)
 */
export function blackHoleRsKm(id: BodyId): number {
  const r = getBody(id);
  if (!r || r.kind !== 'black-hole') return 0;
  const own = r.blackHole?.rsKm;
  if (own && own > 0) return own;
  const gm = r.blackHole?.gmKm3S2 ?? r.physical.gmKm3S2 ?? 0;
  return (2 * gm) / (C_KM_S * C_KM_S);
}

/** Closest the orbit camera may get to a body's centre. */
export function minDistance(id: BodyId): number {
  const b = getBody(id);
  if (!b) return 1;
  if (b.framing?.minKm !== undefined) return Math.max(MIN_APPROACH_KM, b.framing.minKm);
  if (b.kind === 'spacecraft') return Math.max(MIN_APPROACH_KM, displayRadiusKm(b) * SPACECRAFT_MIN_RADII);
  return Math.max(MIN_APPROACH_KM, outerRadiusKm(b) * 1.015);
}

/**
 * Distance that frames a body with the orbits of its moons (Jupiter with Callisto's orbit in
 * view), or just the body when nothing orbits it. Uses each moon's semi-major axis where the
 * record has one, else its present distance.
 */
export function systemFramingDistance(id: BodyId): number {
  const own = framingDistance(id);
  const moons = childrenOf(id);
  if (!moons.length) return own;
  const centre = sim.bodies[id];
  let reach = 0;
  for (const m of moons) {
    const a = m.physical.semiMajorAxisKm;
    const s = sim.bodies[m.id];
    const d = a ?? (s && centre ? s.pos.distanceTo(centre.pos) : 0);
    if (Number.isFinite(d) && d > reach) reach = d;
  }
  // The outermost orbit fills about 70 % of the height of a 50° view.
  return Math.max(own, reach * 3);
}
