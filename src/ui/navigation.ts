import { Vector3 } from 'three';
import { AU_KM, MPC_KM, PARSEC_KM } from '../physics/constants';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';
import { systemFramingDistance } from '../controls/framing';
import { bodyRecords, childrenOf, getBody, isBody, registryVersion, type BodyId } from '../sim/bodies';
import { blackHoleRsKm } from '../controls/cameraController';
import { apply, GAL_TO_WORLD } from '../sim/galaxy/frames';
import { OUTSIDE_VIEW_KM } from '../sim/galaxy/records';
import { sim } from '../sim/sim';
import { notice } from './notices';

/** The single key that goes to a body ("6" for Saturn), from its registry record. */
export const bodyKey = (id: BodyId): string | undefined => getBody(id)?.key;

const keyMap = { version: -1, map: new Map<string, BodyId>() };

/** The body a key goes to (0–9, M, V for the built-in bodies), case-insensitive. */
export function bodyForKey(key: string): BodyId | undefined {
  if (keyMap.version !== registryVersion()) {
    keyMap.map = new Map(bodyRecords().filter((r) => r.key).map((r) => [r.key!.toLowerCase(), r.id]));
    keyMap.version = registryVersion();
  }
  return keyMap.map.get(key.toLowerCase());
}

export function goToBody(id: BodyId, opts: { distance?: number } = {}) {
  // A body that does not exist at this date (Voyager 1 before 1980) cannot be targeted.
  if (!sim.bodies[id]?.present) return;
  useUI.getState().select(id);
  const beyond = opts.distance ? null : beyondFromCompanion(id);
  controller.goTo(id, opts.distance ? { distance: opts.distance } : beyond ? { direction: beyond } : {});
}

/**
 * A black hole in a binary is framed from beyond it, on the line from its companion star through it, so
 * the companion's light bends round the hole in the view (world axes, from the hole to the camera); null
 * for anything else.
 */
export function beyondFromCompanion(id: BodyId): Vector3 | null {
  const companion = getBody(id)?.blackHole?.companion;
  const hole = sim.bodies[id];
  const star = companion ? sim.bodies[companion] : undefined;
  if (!companion || !hole || !star?.present || !(blackHoleRsKm(id) > 0)) return null;
  const d = hole.pos.clone().sub(star.pos);
  return d.lengthSq() > 0 ? d.normalize() : null;
}

/** Go to a body far enough out to see the orbits of its moons (Jupiter with Callisto's orbit in view). */
export function goToSystem(id: BodyId) {
  goToBody(id, { distance: systemFramingDistance(id) });
}

/**
 * A planet of another star, from Where to? or the Bodies list: its star's whole system framed,
 * with the planet selected (at true scale the planet itself is a speck; its card's Go there
 * goes closer).
 */
export function goToPlanetarySystem(planet: BodyId) {
  const host = getBody(planet)?.parent;
  if (!host || !sim.bodies[host]?.present) return goToBody(planet);
  goToSystem(host);
  if (sim.bodies[planet]?.present) useUI.getState().select(planet);
}

/**
 * A star system from its brightest star: far enough out to see the star it pairs with (Sirius B
 * about Sirius A) and the orbits of its planets.
 */
export function goToStarSystem(primary: BodyId) {
  const at = sim.bodies[primary];
  const pair = getBody(primary)?.parent;
  let reach = 0;
  if (at && pair && getBody(pair)?.kind === 'barycentre') {
    for (const s of childrenOf(pair)) {
      const b = sim.bodies[s.id];
      if (s.id !== primary && s.kind === 'star' && b) reach = Math.max(reach, b.pos.distanceTo(at.pos));
    }
  }
  goToBody(primary, { distance: Math.max(systemFramingDistance(primary), reach * 3) });
}

const OVER_THE_SYSTEM = new Vector3(0.2, 1, 0.35);

/** Frame the whole Solar System out to Pluto, from above the ecliptic (not in flight). */
export function frameSolarSystem(): void {
  if (useUI.getState().tripActive) return;
  useUI.getState().select('sun');
  controller.goTo('sun', { distance: 60 * AU_KM, direction: OVER_THE_SYSTEM });
}

const OVER_THE_NEIGHBOURHOOD = new Vector3(0.35, 0.55, 0.75);

/**
 * Frame the stars around the Sun: from 8 pc (26 light-years), where the nearest stars stand out
 * in depth around a faint Sun and the constellations come apart (not in flight).
 */
export function frameNeighbourhood(): void {
  if (useUI.getState().tripActive) return;
  // No card over the view: the Sun is labelled "Sun (home)" from here.
  useUI.getState().select(null);
  controller.goTo('sun', { distance: 8 * PARSEC_KM, direction: OVER_THE_NEIGHBOURHOOD });
}

/**
 * The Milky Way from outside: 100,000 light-years from its centre, above the north side of its
 * disc and tilted a little towards the Sun's side, with its card (the model's label) showing. The
 * Galaxy turns clockwise seen from here.
 */
export function frameMilkyWay(): void {
  if (useUI.getState().tripActive || !isBody('milky-way')) return;
  useUI.getState().select('milky-way');
  controller.goTo('milky-way', { distance: OUTSIDE_VIEW_KM, direction: outsideDirection() });
}

/** How far out the view of the Local Group stands from its centre: 3 Mpc. */
export const LOCAL_GROUP_VIEW_KM = 3 * MPC_KM;
/** How far out the view of the cosmic web stands: 200 Mpc, inside the survey's reach (about 400 Mpc). */
export const COSMIC_WEB_VIEW_KM = 200 * MPC_KM;
/** How fast the view of the cosmic web turns: once round in about four minutes. */
export const COSMIC_WEB_SPIN = (2 * Math.PI) / 240;

/**
 * Side-on to the line from the Milky Way to Andromeda, tipped 30° towards the Galaxy's north: the
 * Milky Way, Andromeda and Triangulum all in the view (world axes).
 */
export function localGroupDirection(): Vector3 {
  const mw = sim.bodies['milky-way']?.pos;
  const m31 = sim.bodies.andromeda?.pos;
  const ngp = new Vector3(...apply(GAL_TO_WORLD, [0, 0, 1]));
  if (!mw || !m31) return ngp;
  const axis = m31.clone().sub(mw).normalize();
  const side = axis.clone().cross(ngp).normalize();
  const up = side.clone().cross(axis).normalize();
  return side.multiplyScalar(Math.cos(Math.PI / 6)).addScaledVector(up, Math.sin(Math.PI / 6)).normalize();
}

/** The Local Group from 3 Mpc out, with its card (not in flight). */
export function frameLocalGroup(): void {
  if (useUI.getState().tripActive || !isBody('local-group')) return;
  useUI.getState().select('local-group');
  controller.goTo('local-group', { distance: LOCAL_GROUP_VIEW_KM, direction: localGroupDirection() });
}

/**
 * The local universe: the cosmic web from 200 Mpc out, above the supergalactic plane, turning
 * slowly (not in flight). The web shows by itself out there unless it was turned off.
 */
export function frameCosmicWeb(): void {
  if (useUI.getState().tripActive || !isBody('local-group')) return;
  useUI.getState().select(null);
  if (useUI.getState().cosmicWeb === 'off') useUI.setState({ cosmicWeb: 'auto' });
  // The supergalactic pole (l, b) = (47.37°, 6.32°), tipped 35° off it: the Local Supercluster's plane seen at an angle.
  const pole = new Vector3(...apply(GAL_TO_WORLD, unitLb(47.37, 6.32)));
  const inPlane = new Vector3(...apply(GAL_TO_WORLD, unitLb(137.37, 0)));
  const dir = pole.multiplyScalar(Math.cos((35 * Math.PI) / 180)).addScaledVector(inPlane, Math.sin((35 * Math.PI) / 180)).normalize();
  controller.goTo('local-group', { distance: COSMIC_WEB_VIEW_KM, direction: dir });
  controller.spin(COSMIC_WEB_SPIN);
}

/**
 * A body seen from our side: the camera `distanceKm` from it, on the line from it to the Sun turned `tiltDeg` about
 * an axis across it (towards the north celestial pole's side), so that what is drawn is about as we see it from
 * Earth, with a little depth. A galaxy's photograph shows within a few degrees of our line of sight
 * (sim/cosmos/pictures.ts).
 */
export function frameFromOurSide(id: BodyId, distanceKm: number, tiltDeg = 0): void {
  if (useUI.getState().tripActive || !isBody(id)) return;
  const p = sim.bodies[id]?.pos;
  if (!p) return;
  const toSun = p.clone().negate().normalize();
  const across = toSun.clone().cross(new Vector3(0, 1, 0));
  if (across.lengthSq() < 1e-12) across.set(1, 0, 0);
  across.normalize();
  const t = (tiltDeg * Math.PI) / 180;
  const up = across.clone().cross(toSun).normalize();
  controller.goTo(id, { distance: distanceKm, direction: toSun.multiplyScalar(Math.cos(t)).addScaledVector(up, Math.sin(t)).normalize() });
}

/** The map of the cosmic microwave background over the sky, the view turning slowly (not in flight). */
export function showCmbMap(): void {
  if (useUI.getState().tripActive || !isBody('local-group')) return;
  useUI.setState({ showCmb: true });
  useUI.getState().select(null);
  controller.goTo('local-group', { distance: LOCAL_GROUP_VIEW_KM, direction: localGroupDirection() });
  controller.spin((2 * Math.PI) / 150);
}

const unitLb = (l: number, b: number): [number, number, number] => {
  const L = (l * Math.PI) / 180;
  const B = (b * Math.PI) / 180;
  return [Math.cos(B) * Math.cos(L), Math.cos(B) * Math.sin(L), Math.sin(B)];
};

/** Above the north galactic pole, tipped 20° towards the Sun (world axes). */
export function outsideDirection(): Vector3 {
  const ngp = new Vector3(...apply(GAL_TO_WORLD, [0, 0, 1]));
  const toSun = new Vector3(...apply(GAL_TO_WORLD, [-1, 0, 0]));
  const tilt = (20 * Math.PI) / 180;
  return ngp.multiplyScalar(Math.cos(tilt)).addScaledVector(toSun, Math.sin(tilt)).normalize();
}

// ─── Roam ────────────────────────────────────────────────────────────────────────────────

/** Why Roam cannot start now (a trip or a fall under way, as for free flight), in a sentence, or null. */
export function roamRefusal(): string | null {
  const ui = useUI.getState();
  if (ui.fallActive || ui.controlMode === 'fall') return 'Not during a fall: nothing leaves a black hole. Stop the fall first; it puts you back where you let go.';
  if (ui.tripActive || ui.controlMode === 'travel') return 'Not during a trip: Roam waits until you arrive (or Skip to arrival, or Abort).';
  return null;
}

/** Start Roam (F, View › Roam), or say why not in the view's message corner. */
export function startRoam(): void {
  const why = roamRefusal();
  if (why || !controller.enterRoam()) {
    notice(why ?? 'Roam is not available here.');
  }
}

/** F: into Roam from anywhere; out of Roam or the ship, orbiting the nearest body from where the camera is. */
export function toggleRoam(): void {
  const mode = useUI.getState().controlMode;
  if (mode === 'roam') controller.exitRoam();
  else if (mode === 'free') controller.exitFreeFlight();
  else startRoam();
}
