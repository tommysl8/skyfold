/**
 * How the deep-sky catalogues' markers show (scene/DeepSky.tsx draws them; picking.ts finds them under the pointer by
 * the same rules, so what can be clicked is what is drawn). Shaders twin: render/shaders/deepSkyMarker.vert.glsl,
 * deepSkyGalaxy.vert.glsl and gwRegion.vert.glsl.
 *
 * The sky must not fill with markers, so each fades by how far it is and how big it looks:
 *  - an extended object (a cluster, a nebula, a galaxy) shows once its true size is a pixel or two across on screen,
 *    as a thin ring of that size (never under MIN_RING_PX), and fades away as the camera comes up to it, where it is all
 *    round the view;
 *  - a compact one (a planetary nebula, a supernova remnant of unknown size, a pulsar) shows within a distance of its
 *    kind, as a small fixed mark;
 *  - a gravitational-wave event's region shows while it is a few to a couple of hundred pixels across.
 * The selected object's marker always shows (within its kind's largest size), a little brighter.
 */

/** Marker styles (the shader's aStyle). */
export const STYLE = { openCluster: 0, globular: 1, nebula: 2, planetary: 3, remnant: 4, pulsar: 5, galaxy: 6, magnetar: 7 } as const;
export type MarkerStyle = (typeof STYLE)[keyof typeof STYLE];

/** The smallest ring drawn round an extended object, CSS px (radius). */
export const MIN_RING_PX = 3;
/** An extended object shows from this apparent radius (px)… */
export const SIZE_FROM_PX = 0.7;
/** …fully from this one… */
export const SIZE_FULL_PX = 2;
/** …and fades out between these, as it fills the view. */
export const BIG_FROM_PX = 100;
export const BIG_GONE_PX = 200;
/** Extended objects of the Milky Way and the Clouds fade out beyond these distances (pc): the Clouds' are seen from the Galaxy's edge. */
export const EXTENDED_FAR_PC: readonly [number, number] = [70_000, 120_000];

/** The distances (pc) within which each compact kind shows fully, and beyond which it is gone. */
export const COMPACT_FADE_PC: Record<number, readonly [number, number]> = {
  [STYLE.planetary]: [600, 2000],
  [STYLE.remnant]: [1500, 4000],
  [STYLE.pulsar]: [400, 1200],
  // Magnetars: thirty in the whole Galaxy, all kiloparsecs away; they show from farther.
  [STYLE.magnetar]: [1500, 6000],
};
/** A compact mark's radius, CSS px. */
export const COMPACT_PX: Record<number, number> = { [STYLE.planetary]: 3.5, [STYLE.remnant]: 5, [STYLE.pulsar]: 2.5, [STYLE.magnetar]: 3.5 };

/** A galaxy shows from this apparent radius (px), fully from the next. */
export const GALAXY_FROM_PX = 1;
export const GALAXY_FULL_PX = 2.5;

/**
 * A merger's region (each of its sprites) shows from this apparent radius, fully from the next, and fades out between
 * the last two (px): most regions are tens of degrees across from anywhere near home, and the sky would be all regions.
 */
export const REGION_FROM_PX = 3;
export const REGION_FULL_PX = 10;
export const REGION_BIG_FROM_PX = 40;
export const REGION_BIG_GONE_PX = 70;
/** The selected one shows up to here (fading from REGION_SELECTED_FROM_PX)… */
export const REGION_SELECTED_FROM_PX = 150;
/** …past which a sprite would outgrow the largest point many GPUs draw (1,024 device pixels at a pixel ratio of 2). */
export const REGION_GONE_PX = 250;
/** Sprites a region is drawn with, from the near end of its distance range to the far end. */
export const REGION_SPRITES = 5;

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A galactic marker's strength (0 to 1) at distance dPc, for an apparent radius rPx (0 for an object of unknown size). */
export function galacticAlpha(style: number, dPc: number, rPx: number, radiusPc: number): number {
  const compact = COMPACT_FADE_PC[style];
  if (compact) {
    const a = 1 - smoothstep(compact[0], compact[1], dPc);
    // A planetary nebula of known size fades as the camera comes up to it, as the extended objects do.
    return radiusPc > 0 ? a * (1 - smoothstep(BIG_FROM_PX, BIG_GONE_PX, rPx)) : a;
  }
  if (dPc <= radiusPc) return 0;
  return smoothstep(SIZE_FROM_PX, SIZE_FULL_PX, rPx) * (1 - smoothstep(BIG_FROM_PX, BIG_GONE_PX, rPx)) * (1 - smoothstep(EXTENDED_FAR_PC[0], EXTENDED_FAR_PC[1], dPc));
}

/** A galaxy marker's strength at apparent radius rPx (px). */
export const galaxyAlpha = (rPx: number): number => smoothstep(GALAXY_FROM_PX, GALAXY_FULL_PX, rPx) * (1 - smoothstep(BIG_FROM_PX, BIG_GONE_PX, rPx));

/** A region sprite's strength at apparent radius rPx (px), the selected one's to a larger size. */
export const regionAlpha = (rPx: number, selected = false): number =>
  smoothstep(REGION_FROM_PX, REGION_FULL_PX, rPx) * (1 - (selected ? smoothstep(REGION_SELECTED_FROM_PX, REGION_GONE_PX, rPx) : smoothstep(REGION_BIG_FROM_PX, REGION_BIG_GONE_PX, rPx)));

/** A marker counts for the pointer once it is drawn at least this strongly. */
export const PICK_MIN_ALPHA = 0.25;
