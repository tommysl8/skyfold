/**
 * Which body labels matter most. Labels.tsx hands its pool of label elements to the bodies on
 * screen in this order (after the selected body, a detector hit, the focus and its system).
 */
import type { BodyKind, BodyRecord } from '../sim/bodies';

/** Order of kinds (lower first): the planets, then dwarf planets, moons, small bodies, spacecraft, stars. */
export const KIND_RANK: Record<BodyKind, number> = {
  star: 12,
  planet: 1,
  'dwarf-planet': 9,
  moon: 10,
  asteroid: 10.3,
  comet: 10.4,
  interstellar: 10.6,
  spacecraft: 11,
  exoplanet: 13,
  galaxy: 14,
  cluster: 15,
  nebula: 15,
  'black-hole': 14,
  pulsar: 14.5,
  merger: 14.2,
  transient: 11.5,
  barycentre: 99,
};

/**
 * A record's label rank: its own labelRank (the built-in bodies: the Sun 0, Jupiter 1, … Proxima
 * 12), or its kind's, with bigger bodies ahead within the kind (lower is more important).
 */
export function labelRank(r: BodyRecord): number {
  if (r.labelRank !== undefined) return r.labelRank;
  const size = Math.min(0.98, Math.max(0, Math.log10(Math.max(r.physical.radiusKm, 1e-3) + 1) / 6));
  return KIND_RANK[r.kind] + 0.99 - size;
}

/**
 * Score of a label candidate (lower shows first): its tier (0 selected, 1 detector hit, 2 the
 * focus, 3 the focused system, 4 anything else) in thousands, its rank, and a little for size
 * on screen (up to one rank for a body filling the view).
 */
export function labelScore(tier: number, rank: number, radiusPx: number): number {
  return tier * 1000 + rank - 0.5 * Math.log10(1 + Math.min(radiusPx, 1e4));
}
