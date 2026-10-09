// When and how the Milky Way's magnetic field is drawn (scene/GalacticField.tsx; docs/data/galactic-field.md), with
// the switch "Magnetic field lines" on: two pictures that hand over as the Galaxy's model and the sky from the Sun do
// (background.ts modelShare, 100 to 500 pc from the Sun).
//  - Near the Solar System: the field over the sky, measured (the drapery: scripts/build-field-sky.mjs). It is the
//    field seen from here, summed along each line of sight, so it fades out as the camera leaves.
//  - Away from it: the field lines of the UF23 model in 3D (magneticField.ts, fieldLines.ts). From inside the disc
//    lines pass close by in every direction, so there they are drawn at a third of their brightness and those
//    within a kiloparsec or so fade out; seen from above or below the disc, or from outside the Galaxy, in full;
//    from beyond a few hundred kiloparsecs, where the whole Galaxy shrinks to a few pixels, they fade out.

import { modelShare } from './background';
import { apply, galToG, WORLD_TO_GAL, type Vec3 } from './frames';
import { PARSEC_KM } from '../../physics/constants';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Inside the disc, the lines' brightness as a share of their full one. */
export const LINES_INSIDE_SHARE = 0.35;
/** Height above or below the plane over which the lines come up to full brightness, kpc. */
export const LINES_ABOVE_KPC: readonly [number, number] = [1.5, 4];
/** Radius beyond the disc over which they come up to full brightness, kpc. */
export const LINES_BEYOND_KPC: readonly [number, number] = [18, 24];
/** Distance from the Galaxy's centre over which they fade out, kpc. */
export const LINES_FAR_KPC: readonly [number, number] = [400, 1500];
/** A point nearer the camera than the first is not drawn, beyond the second in full, kpc. */
export const LINES_NEAR_KPC: readonly [number, number] = [0.3, 1.5];

/**
 * The field lines' brightness (0–1) for a camera at `g` (frame G, kpc), `fromSunKm` from the Sun: nothing near
 * the Solar System (the sky's drapery is drawn there), a third inside the disc, all of it above, below or
 * outside the disc, fading out far beyond the Galaxy.
 */
export function fieldLinesShare(g: readonly number[], fromSunKm: number): number {
  const R = Math.hypot(g[0], g[1]);
  const out = Math.max(smoothstep(LINES_ABOVE_KPC[0], LINES_ABOVE_KPC[1], Math.abs(g[2])), smoothstep(LINES_BEYOND_KPC[0], LINES_BEYOND_KPC[1], R));
  const far = 1 - smoothstep(LINES_FAR_KPC[0], LINES_FAR_KPC[1], Math.hypot(g[0], g[1], g[2]));
  return modelShare(fromSunKm) * (LINES_INSIDE_SHARE + (1 - LINES_INSIDE_SHARE) * out) * far;
}

/** The sky's drapery's share (0–1): all of it in the Solar System's neighbourhood, none 500 pc away. */
export const fieldSkyShare = (fromSunKm: number): number => 1 - modelShare(fromSunKm);

const KPC_KM = 1000 * PARSEC_KM;

/** A camera at world position p (km from the Sun) in frame G, kpc. */
export function cameraG(p: { x: number; y: number; z: number }): Vec3 {
  return galToG(apply(WORLD_TO_GAL, [p.x / KPC_KM, p.y / KPC_KM, p.z / KPC_KM]));
}

/** Both pictures' shares for a camera at world position p (km from the Sun). */
export function fieldShares(p: { x: number; y: number; z: number }): { lines: number; sky: number } {
  const d = Math.hypot(p.x, p.y, p.z);
  return { lines: fieldLinesShare(cameraG(p), d), sky: fieldSkyShare(d) };
}

// ─── The sky's drapery ─────────────────────────────────────────────────────────────────

/** The measured maps the drapery can be built from (scripts/build-field-sky.mjs --source). */
export type FieldSkySource = 'wmap' | 'planck';

/**
 * The one the app ships. Planck's 353 GHz map (thermal dust) is the classic drapery, but the ESA archives' terms
 * (CC BY-NC 3.0 IGO) allow only non-commercial reuse, and the app ships only data free for any use: WMAP's 23 GHz map
 * (synchrotron emission; NASA, public domain) is drawn instead. Building the Planck texture and setting this to 'planck' swaps them.
 */
export const FIELD_SKY_SOURCE: FieldSkySource = 'wmap';

export const fieldSkyTexture = (source: FieldSkySource = FIELD_SKY_SOURCE): string => `textures/field-sky-${source}.png`;

/** What each source shows, for the layer's card. */
export const FIELD_SKY_TEXT: Record<FieldSkySource, { line: string; credit: string }> = {
  wmap: {
    line: 'Streaks along the magnetic field across the sky, from the polarisation of the Milky Way’s radio glow at 23 GHz measured by WMAP: electrons spiralling round the field shine polarised across it.',
    credit: 'NASA/WMAP Science Team: WMAP nine-year K-band (23 GHz) polarisation map, smoothed to 1° (Bennett et al. 2013, ApJS 208, 20)',
  },
  planck: {
    line: 'Streaks along the magnetic field across the sky, from the polarisation of the glow of interstellar dust at 353 GHz measured by Planck: spinning grains line up across the field.',
    credit: 'ESA, Planck Collaboration: Planck 2018 (PR3) 353 GHz polarisation map, smoothed to 1° (Planck Collaboration 2020, A&A 641, A3)',
  },
};

/** The layer's card (ui/viewport/LayerCards.tsx). */
export const FIELD_CARD = {
  title: 'The Milky Way’s magnetic field',
  lines:
    'Field lines of a model fitted to radio measurements (UF23, Unger & Farrar 2024): amber where the field runs clockwise seen from the north, with the Galaxy’s turning; blue counter-clockwise; lilac up through the disc. Brighter is stronger; each dash points the way the field points.',
  linesCaveat: 'A model of the large-scale field only: the real field is as strong again in tangled loops too small to draw.',
  more: [
    'The disc’s field (a few microgauss, about a millionth of Earth’s at its surface) follows the spiral arms at a pitch of 10° and reverses between them; above and below the disc a halo field circles the Galaxy one way in the north and the other way in the south; and an X-shaped field rises through the inner disc, as seen in other spiral galaxies edge-on.',
    'The model is scaled to the app’s distance to the Galactic centre (8.277 kpc; the paper used 8.178). Behind the disc the lines are dimmed by the model’s dust, as the Galaxy’s far side is.',
    'From the Solar System the switch shows the field over the sky instead: measured, not modelled, and summed along each line of sight.',
  ],
  sources: [
    'M. Unger and G. R. Farrar 2024, “The coherent magnetic field of the Milky Way”, ApJ 970, 95: the “base” model.',
  ],
} as const;
