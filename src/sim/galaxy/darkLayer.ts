/**
 * The dark-matter layer (View › Dark matter; docs/data/dark-matter.md): where the mass is, drawn where it helps. This is
 * the small part that comes with the app: once a frame it decides, from the switch and the camera, how much of each part
 * shows, and asks for the layer's chunk (scene/DarkMatter.tsx, its materials and the mass model) the first time the
 * switch is on. Until then nothing of it is downloaded, and with the switch off nothing of it is drawn.
 *
 *  - The Milky Way's dark halo (McMillan 2017): a faint cool fog of its projected density, seen from outside the disc
 *    (from 10 to 25 kpc out it fades in) to a few megaparsecs, where the whole halo is a few pixels.
 *  - The rotation tracers (within 150 to 250 kpc of the centre): stars on four spokes from 2 to 30 kpc, going round at the circular speed with the halo and
 *    at the speed the stars and gas alone would give. Time at home turns them (`startMs` is when they lay on the
 *    spokes), and the rotation scene runs a clock of their own on top (`pace`, Myr per second of real time), so they
 *    can turn for hundreds of millions of years while the rest of the view keeps its date: run that far, the Magellanic
 *    Clouds and the other galaxies of the Local Group would have moved on.
 *  - The Bullet Cluster: its X-ray gas (Chandra) and its lensing mass (a model of Clowe et al.'s map), once the cluster
 *    is a few dozen pixels across.
 *
 * Cost: a few distance tests a frame.
 */
import { KPC_KM } from '../../physics/constants';
import { J2000_MS } from '../../lib/time';
import { useUI } from '../../state/ui';
import { sim } from '../sim';
import { SGR_A_ID } from './records';

/** What the chunk needs to know this frame (written by updateDarkLayer). */
export const darkLayer = {
  /** The chunk has been asked for (App.tsx mounts it from then on). */
  started: false,
  /** How much of each part shows, 0 to 1 (eased, so nothing pops in or out). */
  halo: 0,
  tracers: 0,
  bullet: 0,
  /** The camera's distance from the Galaxy's centre, kpc. */
  centreKpc: Infinity,
  /** When the tracers lie on their spokes (ms since 1970); a scene restarts them. */
  startMs: J2000_MS,
  /** The tracers' own clock (the rotation scene's): its pace, Myr per second of real time, and the time it has run, Myr. */
  pace: 0,
  ownMyr: 0,
  /** The layer's meshes, by name, for the development tools (window.__ls.dark.meshes). */
  meshes: {} as Record<string, unknown>,
  version: 0,
};

/**
 * The layer's colours (linear RGB): the tracers with the dark halo and with the visible mass alone (and the chart's
 * curves for each), the halo's fog, the Bullet Cluster's gas and mass.
 */
export const DARK_COLOURS = {
  withHalo: [1.0, 0.6, 0.18],
  visibleOnly: [0.72, 0.8, 0.95],
  halo: [0.42, 0.58, 1.0],
  gas: [1.0, 0.38, 0.62],
  mass: [0.3, 0.5, 1.0],
} as const;

const listeners = new Set<() => void>();
export const darkLayerVersion = (): number => darkLayer.version;
export function subscribeDarkLayer(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The parts' targets for a switch, the camera's distance from the Galaxy's centre (kpc), and the Bullet Cluster's size (px). */
export function darkTargets(on: boolean, centreKpc: number, bulletPx: number): { halo: number; tracers: number; bullet: number } {
  if (!on) return { halo: 0, tracers: 0, bullet: 0 };
  // Outside the disc; gone once the halo's 220 kpc are a few pixels (5 Mpc).
  const outside = smooth(10, 25, centreKpc);
  return {
    halo: outside * (1 - smooth(1500, 5000, centreKpc)),
    // The tracers' spokes are 60 kpc across: shown while they fill a good part of the view (gone by 250 kpc, where
    // the halo is what the view is about).
    tracers: outside * (1 - smooth(150, 250, centreKpc)),
    bullet: smooth(8, 30, bulletPx),
  };
}

/** Ease towards a target: about a third of a second (frames of any length). */
const ease = (v: number, target: number, dt: number) => {
  const next = v + (target - v) * Math.min(1, dt * 6);
  return Math.abs(next - target) < 0.002 ? target : next;
};

/** Once a frame, after the camera: what shows. Asks for the chunk the first time the switch is on. */
export function updateDarkLayer(dtReal: number): void {
  const on = useUI.getState().darkMatter;
  if (!on && darkLayer.halo === 0 && darkLayer.tracers === 0 && darkLayer.bullet === 0) return;
  const sgr = sim.bodies[SGR_A_ID];
  darkLayer.centreKpc = sgr ? sim.camera.pos.distanceTo(sgr.pos) / KPC_KM : Infinity;
  const bullet = sim.bodies['bullet-cluster'];
  const t = darkTargets(on, darkLayer.centreKpc, bullet?.present ? bullet.radiusPx : 0);
  darkLayer.halo = ease(darkLayer.halo, t.halo, dtReal);
  darkLayer.tracers = ease(darkLayer.tracers, t.tracers, dtReal);
  darkLayer.bullet = ease(darkLayer.bullet, t.bullet, dtReal);
  // The tracers' own clock stops once they are out of view (the switch off, or the camera gone on).
  if (darkLayer.pace > 0) {
    if (!on || t.tracers === 0) darkLayer.pace = 0;
    else darkLayer.ownMyr += darkLayer.pace * dtReal;
  }
  if (on && !darkLayer.started) {
    darkLayer.started = true;
    darkLayer.version++;
    listeners.forEach((f) => f());
  }
}

/** A million years, ms. */
const MYR_MS = 365.25 * 86_400_000 * 1e6;

/** How long the tracers have been going round, Myr: home's time since they lay on the spokes, and their own clock's. */
export const tracerMyr = (): number => (sim.timeMs - darkLayer.startMs) / MYR_MS + darkLayer.ownMyr;

/** Put the tracers back on their spokes now, their own clock running at `paceMyrPerS` (the rotation scene). */
export function restartTracers(paceMyrPerS = 0): void {
  darkLayer.startMs = sim.timeMs;
  darkLayer.ownMyr = 0;
  darkLayer.pace = paceMyrPerS;
}

/** The layer's card (ui/viewport/LayerCards.tsx): what shows, and what it is. */
export const DARK_CARD = {
  title: 'Dark matter',
  line: 'Where the mass is, drawn because it cannot be seen: dark matter gives out no light and blocks none.',
  halo: 'The blue fog is the Milky Way’s dark halo, its density summed along each line of sight: about 95 % of the Galaxy’s mass within 200 kpc in this model. Gold stars go round at the speed the Galaxy’s mass gives; grey ones at the speed its stars and gas alone would give.',
  bullet: 'The Bullet Cluster. Pink: the hot gas Chandra sees in X-rays, most of the ordinary matter. Blue, with the paper’s contours: the mass found by gravitational lensing. The mass went on with the galaxies; the gas was held back.',
  elsewhere: 'Seen from outside the Milky Way (tens to hundreds of kiloparsecs out), and at the Bullet Cluster.',
  more: [
    'The halo is McMillan’s (2017) best-fitting mass model of the Milky Way: an NFW halo with a scale radius of 19.6 kpc, cut off at 224 kpc, where it holds about 1.3 × 10¹² Suns. Other fits weigh it differently: rotation curves measured with Gaia that fall off beyond 20 kpc allow a halo of only about 0.2 × 10¹² (Ou et al. 2024), and the total is uncertain by a factor of several.',
    'The tracers stand for stars on circular orbits in the model, 2 to 30 kpc out; time turns them (the clock run millions of billions of times faster than real for them to move, or their own clock in the scene “How the Galaxy turns”). The model’s curve is a little flatter than the measured one beyond 18 kpc.',
    'At the Bullet Cluster the gas is Chandra’s X-ray picture; the mass is a smooth two-peak model of Clowe et al.’s (2006) lensing map, fitted to their published peaks and mean convergence, since the map itself is not openly licensed.',
  ],
  sources: [
    'McMillan 2017, MNRAS 465, 76 (the mass model); Eilers et al. 2019, ApJ 871, 120 (the measured rotation curve); Ou et al. 2024, MNRAS 528, 693.',
    'Clowe et al. 2006, ApJ 648, L109 (the Bullet Cluster’s mass). X-ray: NASA/CXC/CfA/M. Markevitch et al.',
  ],
} as const;
