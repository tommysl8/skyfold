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

/**
 * A journey from its scene. What to look for is the scene's note as it reads when asked (a note worded from the data,
 * such as the black-hole tour's, is only complete once those data are in).
 */
function journey(j: { id: string; title: string; sub: string; scene: string; clock?: string }): Journey {
  return {
    ...j,
    get look() {
      return sceneNote(j.scene) ?? '';
    },
    flight: flightOf(j.scene) ?? undefined,
    run: () => runScene(j.scene, { note: sceneNote(j.scene) ?? '' }),
  };
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
    id: 'black-hole-tour',
    title: 'A tour of black holes',
    sub: 'Five stops, from one of the lightest black holes known to M31*, 16 s each',
    scene: 'black-hole-tour',
  }),
  journey({
    id: 'lmc-x-1-disk',
    title: 'A black hole in another galaxy',
    sub: 'Above the disc of LMC X-1, in the Large Magellanic Cloud',
    scene: 'lmc-x-1-disk',
  }),
  journey({
    id: 'famous-galaxies',
    title: 'Famous galaxies, as photographed',
    sub: 'The Whirlpool from our side, drawn with Hubble’s photograph',
    scene: 'famous-galaxies',
  }),
  journey({ id: 'virgo-cluster', title: 'The Virgo Cluster', sub: 'Sixty of its brightest galaxies, 54 million light-years away', scene: 'virgo-cluster-close' }),
  journey({ id: 'sgr-a-star-radio', title: 'Sagittarius A* in radio light', sub: 'The ring the Event Horizon Telescope sees, up close', scene: 'sgr-a-star-radio' }),
  journey({
    id: 'monsters',
    title: 'Monsters among the stars',
    sub: 'The biggest, flattest and wildest stars, up close: Betelgeuse to WR 104’s pinwheel',
    scene: 'monsters-among-the-stars',
  }),
  journey({ id: 'sn-1054', title: 'The new star of 1054', sub: 'From Earth: the supernova that made the Crab Nebula, seen by day for 23 days', scene: 'sn-1054-from-earth', clock: 'July 1054, faster and faster' }),
  journey({ id: 'sn-1572', title: 'Tycho’s new star, 1572', sub: 'From Earth: as bright as Venus, fading and reddening as Tycho recorded', scene: 'sn-1572-from-earth', clock: 'November 1572, faster and faster' }),
  journey({ id: 'sn-1604', title: 'Kepler’s star beside Jupiter, 1604', sub: 'From Earth: the last supernova seen in our Galaxy', scene: 'sn-1604-from-earth', clock: 'October 1604, faster and faster' }),
  journey({ id: 'sn-1987a', title: 'Supernova 1987A', sub: 'From Earth: a new star in the Large Magellanic Cloud', scene: 'sn-1987a-from-earth', clock: 'February 1987, faster and faster' }),
  journey({ id: 'sn-1572-close', title: 'Tycho’s star explodes', sub: 'A model up close: the fireball, then the debris growing to today’s remnant', scene: 'sn-1572-up-close', clock: 'Each few seconds e times older' }),
  journey({ id: 'kilonova', title: 'Two neutron stars collide', sub: 'GW170817: the last minute of the inspiral, then the kilonova, blue then red', scene: 'kilonova-gw170817', clock: '17 August 2017: real time, then faster' }),
  journey({ id: 'merger-field', title: 'Two neutron stars merge: their magnetic fields', sub: 'GW170817’s fields meeting, tearing apart and winding into a jet’s funnel (a model)', scene: 'merger-field', clock: '17 August 2017: real time, then faster' }),
  journey({ id: 'crab-magnetosphere', title: 'The Crab pulsar’s magnetosphere', sub: 'Its field lines turning with it, wound into a striped wind (a model)', scene: 'crab-magnetosphere' }),
  journey({ id: 'magnetar-field', title: 'A magnetar’s twisted field', sub: 'SGR 1806−20, a field a thousand times a pulsar’s (a model)', scene: 'magnetar-field' }),
  journey({ id: 'double-pulsar-field', title: 'The Double Pulsar’s magnetic fields', sub: 'One pulsar’s wind shaping the other’s field', scene: 'double-pulsar-field' }),
  journey({ id: 'm87-star-field', title: 'M87*’s magnetic field', sub: 'The field threading the hole, as the EHT’s polarisation suggests (a model)', scene: 'm87-star-field' }),
  journey({ id: 'sgr-a-star-field', title: 'Sgr A*’s magnetic field', sub: 'An ordered field wound by the hole’s spin (a model)', scene: 'sgr-a-star-field' }),
  journey({ id: 'm87-jet', title: 'The jet of M87', sub: 'A jet at nearly the speed of light, its far side beamed out of sight', scene: 'm87-jet' }),
  journey({ id: 'aurora', title: 'The northern lights from space', sub: 'Earth’s auroral oval on the night side', scene: 'aurora' }),
  journey({ id: 'galactic-field', title: 'The Milky Way’s magnetic field', sub: 'Field lines of the disc, the halo and the X-field, from far above', scene: 'galactic-field' }),
  journey({ id: 'galactic-field-sky', title: 'The Galaxy’s field across our sky', sub: 'From Earth: the field’s direction, measured from polarised radio light', scene: 'galactic-field-sky' }),
  journey({ id: 'magnetic-uranus', title: 'Uranus’s tipped magnetic field', sub: 'Tilted 60° and off centre, wobbling round as the planet turns', scene: 'magnetic-uranus', clock: '1 s here = 17 min' }),
  journey({ id: 'magnetic-jupiter', title: 'Jupiter’s magnetosphere', sub: 'The largest thing any planet has, from Juno’s model of its field', scene: 'magnetic-jupiter', clock: '1 s here = 5 min' }),
  journey({ id: 'magnetic-sun', title: 'The Sun’s magnetic field today', sub: 'Loops and open field over the corona, from the date’s HMI map', scene: 'magnetic-sun' }),
];
