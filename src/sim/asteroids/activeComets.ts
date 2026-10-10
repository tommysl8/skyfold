/**
 * The comets of the small-body layer whose tails are drawn: those near enough the Sun to be active, strongest first
 * by their own magnitude laws (render/cometTail.ts tailBrightness), a few at a time. The registry's comets (Halley,
 * Hale–Bopp…) draw their own; these are the layer's 3,600 others (NEOWISE, Hyakutake, Tsuchinshan–ATLAS, 12P…),
 * each a point until it nears the Sun. Chosen about twice a second (scene/CometTails.tsx), in float64 (conic.ts).
 */
import { ACTIVITY_OFF_AU, tailBrightness } from '../../render/cometTail';
import { conicPosition, type Conic, type Vec3Out } from './conic';
import { FRAME_SUN, GROUPS, SHAPE_CONIC, unquantK1, unquantM1, unquantU16, type ConicColumns, type SectionHead } from './format';
import type { SmallRef } from './bodies';

/** Most tails of layer comets drawn at once. */
export const LAYER_TAILS = 6;
/** Weaker than this (0–1), a comet's tails are not worth drawing: under a percent of a great comet's. */
export const MIN_TAIL = 0.02;

export interface ActiveComet extends SmallRef {
  /** Its tails' strength now, 0–1. */
  strength: number;
  M1: number;
  K1: number;
}

/** Body `index` of a comet section as a float64 conic about the Sun (au, radians, days after the reference epoch). */
export function cometConic(c: ConicColumns, index: number): Conic {
  return {
    q: c.q[index],
    e: c.e[index],
    i: unquantU16(c.i[index]) * Math.PI,
    node: unquantU16(c.node[index]) * 2 * Math.PI,
    peri: unquantU16(c.peri[index]) * 2 * Math.PI,
    tp: c.tp[index],
    mu: 1,
  };
}

const p: Vec3Out = { x: 0, y: 0, z: 0 };

/**
 * The comets with the strongest tails `days` after the reference epoch, at most `n`, strongest first: of the layer's
 * comet sections about the Sun (comets further out never come near enough to be active), those with a magnitude law
 * (the asteroids on open orbits, filed with the comets, have none) inside ACTIVITY_OFF_AU now. `skip`: a body drawn
 * elsewhere (the one the registry has).
 */
export function activeComets(
  sections: Iterable<SectionHead & { shape: number; cols: unknown }>,
  days: number,
  n = LAYER_TAILS,
  skip: SmallRef | null = null,
): ActiveComet[] {
  const out: ActiveComet[] = [];
  for (const s of sections) {
    if (GROUPS[s.group] !== 'comet' || s.shape !== SHAPE_CONIC || s.frame !== FRAME_SUN || s.sample) continue;
    if (s.rMin >= ACTIVITY_OFF_AU) continue;
    const c = s.cols as ConicColumns;
    for (let k = 0; k < s.count; k++) {
      if (c.q[k] >= ACTIVITY_OFF_AU) continue;
      const M1 = unquantM1(c.M1[k]);
      const K1 = unquantK1(c.K1[k]);
      if (!Number.isFinite(M1) || !Number.isFinite(K1)) continue;
      if (skip && skip.section === s.id && skip.index === k) continue;
      conicPosition(cometConic(c, k), days, p);
      const r = Math.hypot(p.x, p.y, p.z);
      if (!(r < ACTIVITY_OFF_AU)) continue;
      const strength = tailBrightness(r, M1, K1);
      if (strength < MIN_TAIL) continue;
      if (out.length === n && strength <= out[n - 1].strength) continue;
      out.push({ section: s.id, index: k, strength, M1, K1 });
      out.sort((a, b) => b.strength - a.strength);
      if (out.length > n) out.length = n;
    }
  }
  return out;
}
