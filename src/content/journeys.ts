/**
 * One-click journeys: set-piece trips and scenes that show the program at its best. Each is
 * a scene spec (content/scenes.ts sets it up) with a title and a line on where and how;
 * what to look for comes with the scene. Flights leave from Earth and play by ship time,
 * about a minute each whatever their length (see sim/travel.ts); scenes set the time warp.
 * The fall into Sagittarius A* plays by the faller's own clock (sim/fall.ts): 20 s to two
 * horizon radii, then the last 80 s of proper time at real speed.
 */
import { flightOf, runScene, sceneNote, type Flight } from './scenes';

export { predictFlight, type Flight } from './scenes';

export interface Journey {
  id: string;
  title: string;
  /** Where and how, in a few words. */
  sub: string;
  /** The scene spec it runs ("fly:saturn?beta=0.9", "race-sunlight"). */
  scene: string;
  /** What to look for, shown while the journey is under way. */
  look: string;
  /** A flight (predicted below the title) or a scene (the camera moves and time runs). */
  flight?: Flight;
  /** For scenes: what the clock is set to. */
  clock?: string;
  run: () => boolean;
}

function journey(j: { id: string; title: string; sub: string; scene: string; clock?: string }): Journey {
  const look = sceneNote(j.scene) ?? '';
  return { ...j, look, flight: flightOf(j.scene) ?? undefined, run: () => runScene(j.scene, { note: look }) };
}

export const JOURNEYS: Journey[] = [
  journey({
    id: 'sunlight',
    title: 'Race sunlight to Earth',
    sub: 'A pulse of light leaves the Sun; time runs 100× faster than real',
    scene: 'race-sunlight',
    clock: '1 s here = 100 s',
  }),
  journey({ id: 'saturn', title: 'Earth to Saturn at 0.9c', sub: 'Constant speed, nine tenths of the speed of light', scene: 'fly:saturn?beta=0.9' }),
  journey({
    id: 'split',
    title: 'The sky at 0.999c, split screen',
    sub: 'To Neptune, with the classical sky left of the divider',
    scene: 'split-0.999c',
  }),
  journey({ id: 'voyager', title: 'Catch up with Voyager 1', sub: 'The most distant human-made object, at 0.99c', scene: 'fly:voyager1?beta=0.99' }),
  journey({
    id: 'proxima',
    title: 'Proxima Centauri at 1 g',
    sub: 'A rocket pushing at one Earth gravity, turning round halfway',
    scene: 'fly:proxima',
  }),
  journey({
    id: 'trappist',
    title: 'Seven worlds of TRAPPIST-1',
    sub: 'A 1 g flight of 40 light-years, then its seven planets going round',
    scene: 'trappist-1-worlds',
  }),
  journey({
    id: 'year',
    title: 'A year in half a minute',
    sub: 'The planets from above, a million times faster than real',
    scene: 'year-in-30s',
    clock: '1 s here = 11.6 days',
  }),
  journey({ id: 'moon', title: 'Watch the Moon go round', sub: 'A month over Earth, 100,000× faster than real', scene: 'moon-month', clock: '1 s here = 28 hours' }),
  journey({
    id: 'neptune',
    title: 'Ride Voyager 2 past Neptune',
    sub: 'The 1989 flyby, then Triton: five hours in about a minute',
    scene: 'voyager2-neptune',
    clock: '25 August 1989 · 1 s here = 5 min',
  }),
  journey({
    id: 'halley',
    title: 'Halley comes back',
    sub: 'Its 2061 return to the Sun, tails streaming away from it',
    scene: 'halley-2061',
    clock: 'July 2061 · 1 s here = 2.8 hours',
  }),
  journey({
    id: 'black-hole',
    title: 'Fall into a black hole',
    sub: 'Sagittarius A*, from ten horizon radii out, through the horizon',
    scene: 'fall-into-sgr-a-star',
    clock: 'Your clock: 813 s in 20 s, then the last 80 s in real time',
  }),
  journey({
    id: 'cyg-x-1-disk',
    title: 'The disc of Cygnus X-1',
    sub: 'Just above a black hole’s glowing disc, its far side bent over the top',
    scene: 'cyg-x-1-disk',
  }),
  journey({
    id: 'famous-galaxies',
    title: 'Famous galaxies, as photographed',
    sub: 'The Whirlpool from our side, drawn with Hubble’s photograph',
    scene: 'famous-galaxies',
  }),
  journey({ id: 'virgo-cluster', title: 'The Virgo Cluster', sub: 'Sixty of its brightest galaxies, 54 million light-years away', scene: 'virgo-cluster-close' }),
  journey({ id: 'sgr-a-star-radio', title: 'Sagittarius A* in radio light', sub: 'The ring the Event Horizon Telescope sees, up close', scene: 'sgr-a-star-radio' }),
];
