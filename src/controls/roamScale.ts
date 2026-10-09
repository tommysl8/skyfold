/**
 * Roam's speed scale: how fast the camera flown by hand moves here, as a length, the distance to the
 * nearest thing that matters at this scale. Pure functions of the distances they are given
 * (controls/roam.ts gathers them each frame).
 *
 * What: every thing near the camera gets an effective distance e from its kind and size, and the
 * scale is the least of them. A body with a surface (a planet, a moon, a star, a spacecraft):
 * the height above its closest approach, plus a sliver of that (so you can always leave). A black
 * hole: the height above its horizon. Something without a surface (a galaxy, a star cluster, a
 * nebula): the distance to its edge plus a tenth of its radius, and inside it a tenth of the
 * distance to its centre. A group or cluster of galaxies (the Local Group, Virgo): only from
 * outside, to its edge; inside, its members set the pace (its centre is often empty space). A
 * catalogue star not yet a body is a point to pass, counted at three times its distance (within
 * 0.1 pc it becomes a body, and its surface counts). The edge of the map, 10²⁴ km from the Sun (as far
 * as the orbit camera goes, twice the radius of the observable universe), slows the camera to a
 * twentieth of that before it stops there. The speed is that scale per second, times the visitor's
 * multiplier (the wheel, + and −) and Shift's boost.
 *
 * How it feels: the approach to anything is exponential, 15 % of the way per tenth of a second,
 * so the camera slows by itself near a planet and never runs into it, and the same keys cross the
 * gap between galaxies in seconds. A step is never more than half the distance to the nearest
 * thing (a slow frame cannot carry the camera through a moon). A scale that shrinks is taken at
 * once; one that grows no faster than the camera could make it grow by moving (a star dropped
 * behind, the edge of a group crossed would otherwise jump it), so the pace never lurches forward
 * and never overshoots.
 *
 * Why not the location trail's level alone: a level is a region, not a distance, and inside the
 * Solar System the pace must still drop from astronomical units to the kilometres above a moon.
 */

/** How Roam treats a kind of thing ('point': a catalogue star that is not a body; 'edge': the edge of the map). */
export type RoamClass = 'solid' | 'hole' | 'extended' | 'group' | 'point' | 'edge' | 'none';

/** The share of an extended thing's radius that sets the pace at its edge, and of the distance to its centre inside it. */
export const INSIDE_SHARE = 0.1;
/** Inside an extended thing the pace stops shrinking this close to its centre, as a share of its radius. */
export const CORE_SHARE = 0.02;
/** At a solid body's closest approach the pace is this share of that distance (not zero: the camera can always leave). */
export const SURFACE_SHARE = 0.002;
/** The speed at multiplier 1: one and a half times the scale per second, 1/s. */
export const ROAM_RATE = 1.5;
/** Shift's boost while held. */
export const ROAM_BOOST = 4;
/** A catalogue star that is not a body counts at this many times its distance: a point to pass among many. */
export const POINT_FACTOR = 3;
/**
 * The edge of the observable universe, km from the Sun: today's comoving particle horizon for Planck 2018,
 * 14,165 Mpc or 46 billion light-years (physics/cosmology; roamScale.test.ts checks it). Light from farther
 * has not reached us yet, so there is nothing to show beyond it and Roam stops there. Near it the pace
 * keeps a hundredth of it, so the edge is reached in a few seconds and left as quickly.
 */
export const EDGE_KM = 4.3707845e23;
export const EDGE_FLOOR_KM = 0.01 * EDGE_KM;
/** The multiplier's range (the wheel and + −). */
export const ROAM_MUL_MIN = 1e-3;
export const ROAM_MUL_MAX = 1e3;
/** A step is never more than this share of the scale (a slow frame cannot carry the camera past the nearest thing). */
export const STEP_SHARE = 0.5;
/** A scale that grows is followed at most this many e-folds a second (or half as fast again as the pace grows it), 1/s. */
export const RISE_RATE = 4;
/** The smallest scale, km (1 mm): the pace never stops. */
export const MIN_SCALE_KM = 1e-6;

/** The kind of thing a body is, for Roam (from its registry kind; `kindText` tells a cluster of galaxies from one of stars). */
export function roamClassOf(kind: string, kindText?: string): RoamClass {
  switch (kind) {
    case 'barycentre':
      return 'none';
    case 'black-hole':
      return 'hole';
    case 'galaxy':
    case 'nebula':
    case 'merger':
    case 'transient':
      return 'extended';
    case 'cluster':
      return /galaxies/i.test(kindText ?? '') ? 'group' : 'extended';
    default:
      return 'solid';
  }
}

/**
 * A thing's effective distance, km: `d` from the camera to its centre; `rMin` the closest approach
 * (a solid body's, or a black hole's horizon radius); `radius` its size (galaxies, clusters, nebulae).
 */
export function thingScaleKm(cls: RoamClass, d: number, rMin: number, radius: number): number {
  switch (cls) {
    case 'solid':
      return Math.max(0, d - rMin) + SURFACE_SHARE * rMin;
    case 'hole':
      // The height above the horizon (the hover floor keeps it above r_s·10⁻⁶).
      return Math.max(0, d - rMin);
    case 'extended':
      return d > radius ? d - radius + INSIDE_SHARE * radius : INSIDE_SHARE * Math.max(d, CORE_SHARE * radius);
    case 'group':
      return d > radius ? d - radius + INSIDE_SHARE * radius : Infinity;
    case 'point':
      return POINT_FACTOR * d;
    case 'edge':
      // d: how far the edge is (a wall to stop at, not a place to creep up on: the way back must not take long).
      return Math.max(0, d) + EDGE_FLOOR_KM;
    default:
      return Infinity;
  }
}

/**
 * The scale to use this frame, km: a smaller one at once; a larger one no faster than `risePerS`
 * e-folds a second (the camera's own motion grows it at the pace's rate, which the caller passes
 * with room to spare, so only a jump is slowed).
 */
export function followScale(prevKm: number, nowKm: number, dtS: number, risePerS = RISE_RATE): number {
  const prev = prevKm > 0 && Number.isFinite(prevKm) ? prevKm : NaN;
  // Nothing measured (no thing at all): hold what there was.
  if (!(nowKm >= 0) || !Number.isFinite(nowKm)) return Number.isNaN(prev) ? MIN_SCALE_KM : prev;
  const now = Math.max(MIN_SCALE_KM, nowKm);
  if (Number.isNaN(prev) || now <= prev) return now;
  return Math.min(now, prev * Math.exp(Math.max(RISE_RATE, risePerS) * Math.max(0, dtS)));
}

/** How fast the followed scale may grow, e-folds a second, at this pace: half as fast again as moving at it grows it. */
export const riseRate = (mul: number, boost = 1): number => Math.max(RISE_RATE, 1.5 * ROAM_RATE * mul * boost);

/** The speed at full input, km/s: the scale per second, times the multiplier and the boost. */
export const roamSpeedKmS = (scaleKm: number, mul: number, boost = 1): number => ROAM_RATE * mul * boost * scaleKm;

/** A step's length this frame, km: the speed times the frame, never more than STEP_SHARE of the scale. */
export const roamStepKm = (speedKmS: number, dtS: number, scaleKm: number): number => Math.min(speedKmS * dtS, STEP_SHARE * scaleKm);

/** The multiplier after a turn of the wheel (deltaY in pixels, as the controller normalises it): ×1.26 a notch of 100. */
export const wheelMul = (mul: number, deltaPx: number): number => clampMul(mul * Math.exp(-deltaPx * 0.0023));

/** The multiplier kept in its range. */
export const clampMul = (mul: number): number => Math.min(ROAM_MUL_MAX, Math.max(ROAM_MUL_MIN, Number.isFinite(mul) ? mul : 1));
