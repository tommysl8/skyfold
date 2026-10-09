/**
 * The small-body layer's card (viewport/LayerCards.tsx): what the points are, how far to trust where they are, and
 * where they come from. Shown while the layer is on and the camera is out among them (asteroidCardShown).
 */
import { AU_KM } from '../physics/constants';
import { solarSystemHidden } from '../sim/derived';
import { smallBodies } from '../sim/asteroids/load';
import { sim } from '../sim/sim';

/** The camera at least this far from the Sun, au, and no farther than the second (the layer is all but gone there). */
const CARD_FROM_AU = 1.6;
const CARD_TO_AU = 400;

/** The line on how good the positions are, with the numbers JPL Horizons gave (sim/asteroids/conic.test.ts). */
export const KEPLER_LINE =
  'Each moves on a simple Kepler orbit from its catalogue epoch: good to within a few degrees along it over a decade and about 10° over three; planets’ pulls are left out.';

export const ASTEROID_CARD = {
  title: 'Asteroids and comets',
  line: (total: number) =>
    `${total.toLocaleString('en-US')} asteroids and comets worth a card from JPL’s Small-Body Database (every named one, the large ones, every comet), and a sample of the rest; each as bright as it really is from here, coloured by its orbit.`,
  caveat: KEPLER_LINE,
  more: [
    'Amber: near-Earth asteroids. Sand: the main belt. Gold: the Hildas, in step with Jupiter. Olive: Jupiter’s Trojans. Lilac: Centaurs. Blue-grey: beyond Neptune. Ice: comets.',
    'Each point is the body’s real brightness from the camera (its size, its distances from the Sun and from you, its phase), shown as a long exposure would show it, longer the farther out you are. At most 200,000 are drawn at once: the brightest from here, and any that pass close.',
    'Ceres, Vesta, Pluto and the other dwarf planets, Arrokoth and the comets with tails are bodies of their own, drawn with their accurate tracks. The others with a card: every named body, every comet, near-Earth asteroids of about a kilometre and up, belt asteroids of about 15 km and up. Of the 1.4 million others, one in 20 is drawn as a sample so the belts keep their shape: those points have no card.',
  ],
  credit:
    'Orbits, sizes and names: JPL Small-Body Database (NASA/JPL-Caltech), October 2026; asteroids with an orbit condition code of 7 or better, comets with orbits fitted since 1990 (periodic ones) or perihelion since 1900. Positions checked against JPL Horizons.',
} as const;

/** Whether the card shows: the layer on, loaded, and the camera out among the small bodies. */
export function asteroidCardShown(on: boolean): boolean {
  if (!on || !smallBodies.index || solarSystemHidden()) return false;
  const au = sim.camera.pos.length() / AU_KM;
  return au >= CARD_FROM_AU && au <= CARD_TO_AU;
}
