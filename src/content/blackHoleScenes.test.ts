/**
 * The black-hole scenes (content/scenes.ts; docs/data/blackholes.md §10): every one defined, labelled and noted, and runnable
 * from the shipped data with the whole registry in (the Galaxy's core, the binaries, M87*). Each is run as the
 * app runs it, frame by frame in SimDriver's order (the clock, the fall, the ephemeris, the controller, the
 * ship's motion, the gravity state, the lens, the view observers), to where it settles; then every number its
 * note quotes is checked, at the precision it is quoted, against the exact physics (physics/schwarzschild.ts,
 * physics/geodesics.ts, the flow's sgraFlow.json) and against what the card and the HUD show there
 * (sim/lensBodies.ts holeView: the shadow, its centre and the Einstein ring as the view shows them, the clock,
 * the thrust, the tides). Also: the fall's journey runs; a scene's views (the lens, the flow, the relativistic
 * view) are put back by the next scene, and its hole modes left; sky-from:<black hole> hovers exactly on the
 * line along which the Sun's light reaches the hole; the Galactic Centre scene's and the Sgr A* flight's lens
 * sentences hold.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { registerUniverse } from '../test/universe';
import { AU_KM, C_KM_S, G0_KM_S2, SUN_RADIUS_KM, SUN_VMAG_AT_1AU } from '../physics/constants';
import { einsteinAngle, lensImages, raindropDarkRadius, shadowAngle, staticSweep } from '../physics/schwarzschild';
import { circularOrbit, hoverAccelKmS2, tidalEndRadiusKm, tidalStretchMS2 } from '../physics/geodesics';
import { msFromCivil } from '../lib/time';
import { blackHoleRsKm, controller, framingDistance } from '../controls/cameraController';
import { tickClock, tickTrip } from '../sim/tick';
import { fall, fallReadings, FALL_FIRST_S, FALL_LAST_S, updateFall, type FallReadings } from '../sim/fall';
import { updateEphemeris } from '../sim/ephemeris';
import { updateShipKinematics } from '../sim/shipKinematics';
import { gravity, updateGravity } from '../sim/gravity';
import { updateApparentPositions } from '../sim/lightDelay';
import { updateCosmicSky } from '../sim/cosmos/expansion';
import { forceLensProgramsReady, updateLens } from '../render/lens/lensState';
import { relView, updateRelativisticView } from '../render/relativisticView';
import { alignBehind, holeView, type HoleView } from '../sim/lensBodies';
import { flowAxisWorld, SGRA_FLOW } from '../sim/blackholes/accretion';
import { travel } from '../sim/travel';
import { setSimTime, sim } from '../sim/sim';
import { getBody, type BodyId } from '../sim/bodies';
import { useUI } from '../state/ui';
import { stopTrip } from '../ui/tripActions';
import { JOURNEYS } from './journeys';
import {
  ACROSS_THE_PLANE,
  cancelSceneStep,
  DIVE_AND_CLIMB_PERIOD_S,
  FALL_WAITS,
  FLOW_OFF,
  GALACTIC_NORTH,
  holeSky,
  IN_THE_PLANE,
  ISCO_LOOK,
  CYG_X1_ABOVE_VIEW,
  CYG_X1_DISK_VIEW,
  SGRA_RADIO_M,
  NAMED_SCENES,
  PHOTON_RING_LOOK,
  runScene,
  S2_BEHIND_WARP,
  s2BehindSetUp,
  s2PericentreNear,
  sceneNote,
  sceneStatus,
  skyFromHoleKm,
} from './scenes';

const DEG = 180 / Math.PI;
const SGR_A = 'sgr-a-star';
const NOW = msFromCivil(2026, 9, 29, 12);

/** The fourteen named scenes (the table in docs/data/blackholes.md §10), with their labels. */
const SCENES = {
  'sgr-a-star-shadow': 'The shadow of Sgr A*',
  'photon-ring': 'The photon ring',
  'sgr-a-star-einstein-ring': 'Sgr A*’s Einstein ring',
  'hover-at-the-horizon': 'Hovering at the horizon',
  'isco-orbit': 'The innermost stable orbit',
  'fall-into-sgr-a-star': 'Fall into Sgr A*',
  'dive-and-climb': 'Same place, three speeds',
  'sgr-a-star-flyby': 'Flying past Sgr A*',
  's2-behind-sgr-a-star': 'S2 behind the black hole',
  'sgr-a-star-flow': 'The gas round Sgr A*',
  'sgr-a-star-radio': 'Sagittarius A* in radio light',
  'm87-star-close': 'M87* from 1,000 au',
  'cyg-x-1-disk': 'The disc of Cygnus X-1',
  'cyg-x-1-from-above': 'Cygnus X-1 from above',
} as const;
type NewScene = keyof typeof SCENES;
/** The scenes that do not switch the flow off (the flow's own; M87* and Cygnus X-1 have no flow drawn). */
const FLOW_KEPT: ReadonlySet<NewScene> = new Set(['sgr-a-star-flow', 'sgr-a-star-radio', 'm87-star-close', 'cyg-x-1-disk', 'cyg-x-1-from-above']);

/** One frame, in SimDriver's order (src/scene/SimDriver.tsx), without the drawing. */
function frame(dt = 1 / 60): void {
  const ui = useUI.getState();
  const dtSim = tickClock(dt);
  updateFall();
  updateEphemeris();
  tickTrip(dtSim);
  controller.update(dt, dtSim, travel.shipPos);
  updateShipKinematics();
  updateGravity();
  updateApparentPositions(ui.retarded);
  updateCosmicSky(ui.retarded);
  updateLens();
  updateRelativisticView(ui.relMode, ui.splitX, ui.relDoppler, !!travel.trip?.warp);
  sim.frame++;
}

/**
 * Frames until the scene's slew has ended (at most 20 s). Its step (the exact hover, a mode of the hole's own)
 * runs inside the last frame's controller update, before that frame's gravity state and view observers, so no
 * further frame is needed: a clock the step starts has not yet run.
 */
function settle(dt = 1 / 30): void {
  let i = 0;
  do frame(dt);
  while (useUI.getState().controlMode === 'transition' && ++i < 600);
}

/** Frames for `seconds` of real time. */
function play(seconds: number, dt = 0.1): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) frame(dt);
}

/** Leave whatever the last scene left under way (a fall holds tripActive, as a flight does). */
function tidy(): void {
  cancelSceneStep();
  if (useUI.getState().tripActive) stopTrip();
  useUI.setState({ plannerOpen: false, selected: null });
}

/** Run a scene from the present at real time, and let it settle. */
function run(spec: string): string {
  tidy();
  setSimTime(NOW);
  updateEphemeris();
  expect(runScene(spec), spec).toBe(true);
  settle();
  return useUI.getState().journeyNote ?? '';
}

function view(id: BodyId = SGR_A): HoleView {
  const v = holeView(id);
  expect(v, id).not.toBeNull();
  return v!;
}

/** The look angle (static observer at r, sources at infinity) whose ray sweeps nπ: the π ring (Einstein), 2π, 3π. */
function ringAt(r: number, n: number): number {
  const edge = shadowAngle(r);
  // Δφ falls from ∞ at the edge to 0 straight out: bisect in ln(α − edge).
  let lo = Math.log(1e-15);
  let hi = Math.log(Math.PI - edge);
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const dphi = staticSweep(r, edge + Math.exp(mid), Math.exp(mid));
    if (Number.isNaN(dphi) || dphi > n * Math.PI) lo = mid;
    else hi = mid;
  }
  return edge + Math.exp(0.5 * (lo + hi));
}

const angle = (a: Vector3, b: Vector3): number => 2 * Math.atan2(a.clone().normalize().sub(b.clone().normalize()).length(), a.clone().normalize().add(b.clone().normalize()).length());
const forward = (): Vector3 => new Vector3(0, 0, -1).applyQuaternion(sim.camera.quat);
const fixed = (x: number, n: number) => x.toFixed(n);
const grouped = (x: number) => Math.round(x).toLocaleString('en-GB');

beforeAll(() => {
  // The pointer lock the fall releases (there is no page here).
  if (typeof document === 'undefined') vi.stubGlobal('document', { pointerLockElement: null, exitPointerLock: () => {} });
  registerUniverse();
  sim.viewport.width = 1600;
  sim.viewport.height = 1000;
  sim.camera.fovDeg = 50;
  setSimTime(NOW);
  updateEphemeris();
  useUI.setState({ relMode: 'on', relDoppler: true, retarded: false, lensing: true, accretionFlow: true, accretionBand: 'visible', ehtBlur: false, welcomeOpen: false });
});

afterAll(() => {
  tidy();
  controller.leaveHoleModes();
  vi.unstubAllGlobals();
});

describe('the black-hole scenes', () => {
  it('are all defined, labelled and noted, and runnable from the shipped data', () => {
    for (const [name, label] of Object.entries(SCENES) as [NewScene, string][]) {
      expect(NAMED_SCENES, name).toContain(name);
      expect(sceneStatus(name), name).toEqual({ ok: true, label });
      const note = sceneNote(name) ?? '';
      expect(note.length, name).toBeGreaterThan(40);
      // The scenes made to show the lens switch the flow off, and say so.
      if (FLOW_KEPT.has(name)) expect(note, name).not.toContain(FLOW_OFF);
      else expect(note.endsWith(FLOW_OFF), name).toBe(true);
    }
  });

  it('wait for their data and for a flight to end', () => {
    useUI.setState({ tripActive: true });
    try {
      for (const name of Object.keys(SCENES)) expect(sceneStatus(name).reason, name).toMatch(/flight is under way/);
    } finally {
      useUI.setState({ tripActive: false });
    }
  });

  it('wait for a fall to be stopped or to end, and say so', () => {
    useUI.setState({ tripActive: true, fallActive: true });
    try {
      for (const spec of [...Object.keys(SCENES), 'go:mars']) expect(sceneStatus(spec).reason, spec).toMatch(/^A fall into a black hole is under way: stop it \(Stop the fall\) or let it end first$/);
    } finally {
      useUI.setState({ tripActive: false, fallActive: false });
    }
  });
});

describe('The shadow of Sgr A*', () => {
  it('hovers at 10 r_s in the plane and quotes the numbers the card shows there', () => {
    useUI.setState({ accretionFlow: true, lensing: true });
    const note = run('sgr-a-star-shadow');
    expect(note).toBe(sceneNote('sgr-a-star-shadow'));
    expect(controller.mode).toBe('orbit');
    expect(gravity.hole).toBe(SGR_A);
    expect(Math.abs(gravity.rM / 20 - 1)).toBeLessThan(1e-12);
    expect(angle(gravity.camRelHoleKm.clone(), IN_THE_PLANE.clone())).toBeLessThan(1e-12);
    expect(angle(forward(), IN_THE_PLANE.clone().negate())).toBeLessThan(1e-9);
    expect(useUI.getState()).toMatchObject({ accretionFlow: false, lensing: true, selected: SGR_A });
    const v = view();
    expect(v.rOverRs).toBeCloseTo(10, 12);
    expect(note).toContain(`(${fixed(v.distanceKm / AU_KM, 2)} au)`);
    // The shadow: Synge's exact angle, as the card shows it (no motion here: centred on the hole).
    expect(Math.abs(v.shadowRadius - shadowAngle(20))).toBeLessThan(1e-12);
    expect(v.shadowOffset).toBeLessThan(1e-12);
    expect(note).toContain(`shadow is ${fixed(2 * v.shadowRadius * DEG, 1)}° across`);
    expect(note).toContain(`shadow’s edge (${fixed(v.shadowRadius * DEG, 2)}°)`);
    // "two and a half times what the horizon would cover if light went straight"
    const straight = Math.asin(v.rOverRs ** -1);
    expect(v.shadowRadius / straight).toBeGreaterThan(2.4);
    expect(v.shadowRadius / straight).toBeLessThan(2.6);
    // The Einstein ring (Δφ = π; the card reads the lens's own table, within 0.004 device px of the root) and the
    // mirrored sky down to the 2π ring.
    expect(Math.abs(v.einsteinRadius - ringAt(20, 1))).toBeLessThan(0.004 / 1484);
    expect(note).toContain(`Einstein ring ${fixed(2 * v.einsteinRadius * DEG, 1)}° across`);
    expect(note).toContain(`down to ${fixed(ringAt(20, 2) * DEG, 2)}° from the centre`);
    // Clocks, blueshift, thrust.
    expect(note).toContain(`clock runs at ${fixed(v.clockRate, 4)} of home’s`);
    expect(note).toContain(`${fixed(Math.exp(gravity.lnGStatic), 3)} times bluer`);
    expect(note).toContain(`thrust of ${grouped(v.thrustG!)} g`);
  });
});

describe('The photon ring', () => {
  it('hovers at 6 M looking at the shadow’s edge; the band of light that went round once and the next', () => {
    const note = run('photon-ring');
    expect(Math.abs(gravity.rM / 6 - 1)).toBeLessThan(1e-12);
    const v = view();
    expect(note).toContain(`(${fixed(v.distanceKm / AU_KM, 2)} au)`);
    expect(v.rOverRs).toBeCloseTo(3, 12);
    // Looking 45° from the hole, at the edge.
    expect(angle(forward(), PHOTON_RING_LOOK.clone())).toBeLessThan(1e-9);
    expect(angle(forward(), IN_THE_PLANE.clone().negate()) * DEG).toBeCloseTo(45, 9);
    expect(note).toContain(`${fixed(v.shadowRadius * DEG, 2)}° from the centre`);
    const two = ringAt(6, 2);
    const three = ringAt(6, 3);
    expect(note).toContain(`only ${fixed((two - v.shadowRadius) * DEG, 2)}° wide (out to ${fixed(two * DEG, 2)}°)`);
    expect(note).toContain(`within ${fixed((three - v.shadowRadius) * DEG, 2)}° of the edge (${fixed(three * DEG, 3)}°)`);
    expect(useUI.getState().accretionFlow).toBe(false);
  });
});

describe('Sgr A*’s Einstein ring', () => {
  it('hovers at 100 M: the ring, the mirrored sky and the shadow', () => {
    const note = run('sgr-a-star-einstein-ring');
    expect(Math.abs(gravity.rM / 100 - 1)).toBeLessThan(1e-12);
    const v = view();
    expect(v.rOverRs).toBeCloseTo(50, 10);
    expect(note).toContain(`(${fixed(v.distanceKm / AU_KM, 2)} au)`);
    expect(note).toContain(`ring ${fixed(2 * v.einsteinRadius * DEG, 1)}° across`);
    expect(note).toContain(`down to ${fixed(ringAt(100, 2) * DEG, 3)}° from the centre`);
    expect(note).toContain(`shadow’s edge at ${fixed(v.shadowRadius * DEG, 3)}°`);
  });
});

describe('Hovering at the horizon', () => {
  it('hovers at 1.01 r_s looking straight up: the sky’s disc, ten times bluer, the clock and the thrust', () => {
    const note = run('hover-at-the-horizon');
    expect(Math.abs(gravity.rM / 2.02 - 1)).toBeLessThan(1e-12);
    const v = view();
    expect(v.rOverRs).toBeCloseTo(1.01, 12);
    expect(note).toContain(`(${grouped(v.heightKm / 1000)},000 km up)`);
    expect(angle(forward(), IN_THE_PLANE.clone())).toBeLessThan(1e-9);
    // The sky is what lies outside the shadow: a disc of radius π − shadow round the zenith.
    expect(note).toContain(`disc ${fixed((Math.PI - v.shadowRadius) * DEG, 1)}° in radius overhead`);
    expect(Math.round(Math.exp(gravity.lnGStatic))).toBe(10);
    expect(note).toContain('ten times bluer');
    expect(Math.round(1 / v.clockRate)).toBe(10);
    expect(note).toContain(`clock runs at ${fixed(v.clockRate, 4)} of home’s`);
    expect(note).toContain(`${fixed(v.thrustG! / 1e6, 1)} million g`);
  });
});

describe('The innermost stable orbit', () => {
  it('orbits at 6 M at 0.5c past the hovering observers, with no thrust; the periods and the aberrated shadow', () => {
    useUI.setState({ relMode: 'off' });
    const note = run('isco-orbit');
    expect(controller.mode).toBe('circular');
    expect(useUI.getState().relMode).toBe('on');
    expect(relView.active).toBe(true);
    expect(controller.circularOrbitNow()!.v).toBeCloseTo(0.5, 14);
    expect(note).toContain('half the speed of light');
    expect(Math.abs(gravity.rM / 6 - 1)).toBeLessThan(1e-12);
    const orbit = circularOrbit(6, gravity.mTimeS);
    expect(note).toContain(`${fixed(orbit.periodProperS / 60, 1)} minutes by your own clock, ${fixed(orbit.periodCoordS / 60, 1)} minutes by a distant one`);
    const v = view();
    expect(note).toContain(`(${fixed(v.distanceKm / AU_KM, 2)} au)`);
    expect(note).toContain(`clock runs at ${fixed(v.clockRate, 4)} of home’s`);
    expect(v.clockRate).toBeCloseTo(orbit.dtaudt, 10);
    // A geodesic: no engine, exactly (no rounding residue shown as a thrust).
    expect(controller.circularHole).toBe(SGR_A);
    expect(v.thrustG).toBe(0);
    // Looking 45° from the hole towards the motion.
    const r = gravity.camRelHoleKm.clone().normalize();
    expect(angle(forward(), r.clone().negate()) * DEG).toBeCloseTo(45, 6);
    const motion = relView.velDir.clone();
    expect(angle(forward(), motion) * DEG).toBeCloseTo(45, 6);
    // The shadow as the orbiting view shows it, and its centre pulled forward towards the motion.
    expect(note).toContain(`shadow is ${fixed(2 * v.shadowRadius * DEG, 1)}° across and pulled ${fixed(v.shadowOffset * DEG, 1)}° forward`);
    expect(v.shadowCentre!.clone().sub(r.clone().negate()).dot(motion)).toBeGreaterThan(0);
    // The start: in the plane, the orbit's normal galactic north.
    expect(Math.abs(r.dot(GALACTIC_NORTH))).toBeLessThan(1e-9);
    expect(angle(ISCO_LOOK.clone(), IN_THE_PLANE.clone().negate()) * DEG).toBeCloseTo(45, 12);
  });

  it('is left for a hover by the next scene', () => {
    run('isco-orbit');
    expect(controller.mode).toBe('circular');
    run('go:jupiter');
    expect(controller.mode).not.toBe('circular');
    expect(useUI.getState().relMode).toBe('off');
    useUI.setState({ relMode: 'on' });
  });
});

describe('Fall into Sgr A*', () => {
  // The fall waits for the lens's programs (compiled in the background in the app; nothing compiles here).
  beforeAll(() => forceLensProgramsReady(true));
  afterAll(() => forceLensProgramsReady(null));

  it('falls as rain from 10 r_s through the horizon, as the note says, and ends back at r₀', () => {
    const note = run('fall-into-sgr-a-star');
    const t = fall.trip!;
    expect(t).not.toBeNull();
    expect(controller.mode).toBe('fall');
    expect(useUI.getState()).toMatchObject({ fallActive: true, tripActive: true, accretionFlow: false });
    expect(t.hole).toBe(SGR_A);
    expect(t.r0M).toBe(20);
    expect(t.model.e).toBe(1);
    expect(angle(t.dirOut.clone(), IN_THE_PLANE.clone())).toBeLessThan(1e-12);
    expect(note).toContain(`(${fixed((20 * gravity.mKm) / AU_KM, 2)} au)`);
    // Times: to the horizon, the first stretch (to 2 r_s) in 20 s, the last in (almost exactly) real time.
    expect(note).toContain(`It takes ${Math.round(t.model.tauHorizon)} s by your clock`);
    expect(note).toContain(`the first ${Math.round(t.tauTwoRs)} s play in ${FALL_FIRST_S} s, the last ${Math.round(t.model.tauEnd - t.tauTwoRs)} s of the fall in real time`);
    expect(FALL_LAST_S).toBe(80);
    expect(Math.abs(t.rateLast - 1)).toBeLessThan(3e-3);
    expect(note).toContain(`the end is ${fixed(t.model.tauEnd - t.model.tauHorizon, 1)} s away`);
    // Halfway to the centre (r = 0.5 r_s): time after the horizon, and the dark patch.
    expect(note).toContain(`${Math.round(t.model.tauAtR(1) - t.model.tauHorizon)} s after the horizon, the dark patch is ${Math.round(2 * raindropDarkRadius(1) * DEG)}° across`);
    // The tides at the horizon, and where the fall ends: 1,000 m/s² over 2 m, some hundredths of a second before r = 0.
    const tidesAtHorizon = tidalStretchMS2(gravity.gmKm3S2, gravity.rsKm, 2);
    expect(note).toContain(`tides are only ${fixed(tidesAtHorizon * 1e3, 1)} × 10⁻³ m/s²`);
    const endM = tidalEndRadiusKm(gravity.gmKm3S2) / gravity.mKm;
    expect(t.model.rEnd).toBeCloseTo(endM, 12);
    expect(note).toContain(`${fixed(((Math.SQRT2 / 3) * endM ** 1.5 * gravity.mTimeS), 2)} s before the centre`);
    expect(note).toContain(`dark patch ahead is ${fixed(2 * raindropDarkRadius(2) * DEG, 1)}° across`);

    // Play it: 20 s of real time to 2 r_s.
    play(FALL_FIRST_S);
    expect(fall.trip!.tau / t.tauTwoRs).toBeCloseTo(1, 9);
    // On to the horizon, and just past it: the view's dark patch is the raindrop's there, and home overhead at half rate.
    const readings = {} as FallReadings;
    let atHorizon: { patch: number; r: number; seen: number; homeT: number; tau: number } | null = null;
    for (let i = 0; i < 5000 && fall.trip && fall.trip.state.r > 1; i++) {
      // Fine steps across the horizon, so the first frame inside it is within 0.01 M of it.
      const r = fall.trip.state.r;
      frame(r > 2 && r < 2.1 ? 0.01 : 0.1);
      if (!atHorizon && fall.trip.state.r < 2) {
        const v = view();
        fallReadings(readings);
        atHorizon = { patch: v.shadowRadius, r: gravity.rM, seen: readings.homeSeenRate, homeT: readings.homeT, tau: readings.tau };
      }
    }
    expect(atHorizon).not.toBeNull();
    const h = atHorizon!;
    expect(h.r).toBeGreaterThan(1.99);
    expect(Math.abs(h.patch - raindropDarkRadius(h.r))).toBeLessThan(1e-9);
    expect(fixed(2 * h.patch * DEG, 1)).toBe(fixed(2 * raindropDarkRadius(2) * DEG, 1));
    // "seen overhead it runs at half speed as you cross"; "keeps your pace on the free-fallers' clocks" (rain: T = τ).
    expect(h.seen).toBeCloseTo(0.5, 2);
    expect(h.homeT).toBeCloseTo(h.tau, 9);
    // Halfway in: the patch as the view shows it.
    const v = view();
    expect(gravity.inside).toBe(true);
    expect(Math.abs(v.shadowRadius - raindropDarkRadius(gravity.rM))).toBeLessThan(1e-9);
    expect(Math.round(2 * v.shadowRadius * DEG)).toBe(107);
    // To the end: back hovering at r₀, home's clock kept.
    play(40);
    expect(fall.trip).toBeNull();
    expect(fall.lastEnd!.why).toBe('ended');
    expect(controller.mode).toBe('orbit');
    expect(Math.abs(gravity.rM / 20 - 1)).toBeLessThan(1e-9);
    expect(useUI.getState()).toMatchObject({ fallActive: false, tripActive: false });
  }, 60_000);

  it('is the journey “Fall into a black hole”', () => {
    tidy();
    setSimTime(NOW);
    updateEphemeris();
    const j = JOURNEYS.find((x) => x.id === 'black-hole')!;
    expect(j).toMatchObject({ title: 'Fall into a black hole', scene: 'fall-into-sgr-a-star' });
    expect(j.look).toBe(sceneNote('fall-into-sgr-a-star'));
    expect(sceneStatus(j.scene).ok).toBe(true);
    expect(j.run()).toBe(true);
    settle();
    const t = fall.trip!;
    expect(t).not.toBeNull();
    expect(useUI.getState().journeyNote).toBe(j.look);
    expect(j.look.startsWith(FALL_WAITS)).toBe(false);
    expect(j.clock).toBe(`Your clock: ${Math.round(t.tauTwoRs)} s in ${FALL_FIRST_S} s, then the last ${FALL_LAST_S} s in real time`);
    // Stopping puts the camera back hovering where it let go.
    stopTrip();
    expect(fall.trip).toBeNull();
    frame();
    expect(controller.mode).toBe('orbit');
    expect(Math.abs(gravity.rM / 20 - 1)).toBeLessThan(1e-9);
  });

  it('waits, hovering at r₀, while the lens cannot draw the hole yet, falls once it can, and not if the camera moved', async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const note = sceneNote('fall-into-sgr-a-star')!;
    forceLensProgramsReady(false);
    try {
      expect(run('fall-into-sgr-a-star')).toBe(`${FALL_WAITS} ${note}`);
      expect(fall.trip).toBeNull();
      expect(controller.mode).toBe('orbit');
      frame();
      expect(Math.abs(gravity.rM / 20 - 1)).toBeLessThan(1e-9);
      await wait(600);
      expect(fall.trip).toBeNull();
      forceLensProgramsReady(true);
      await wait(600);
      const t = fall.trip!;
      expect(t).not.toBeNull();
      expect(t.r0M).toBe(20);
      expect(angle(t.dirOut.clone(), IN_THE_PLANE.clone())).toBeLessThan(1e-9);
      expect(useUI.getState().journeyNote).toBe(note);
      tidy();
      // Moving the camera while it waits drops the fall.
      forceLensProgramsReady(false);
      run('fall-into-sgr-a-star');
      controller.placeAt('earth', 26_000);
      forceLensProgramsReady(true);
      await wait(600);
      expect(fall.trip).toBeNull();
    } finally {
      forceLensProgramsReady(true);
      tidy();
    }
  });
});

describe('Same place, three speeds', () => {
  it('holds at 10 r_s with the clock paused: hovering, 0.9c in, 0.9c out, 10 s each', () => {
    const note = run('dive-and-climb');
    expect(controller.mode).toBe('hold');
    expect(sim.paused).toBe(true);
    expect(Math.abs(gravity.rM / 20 - 1)).toBeLessThan(1e-12);
    const across: number[] = [];
    let s = 0;
    for (const at of [5, 15, 25]) {
      // to the middle of each step
      play(at - s);
      s = at;
      across.push(2 * view().shadowRadius * DEG);
    }
    // Hovering: Synge's shadow; in and out: its aberration by 0.9c.
    expect(Math.abs(across[0] - 2 * shadowAngle(20) * DEG)).toBeLessThan(1e-9);
    expect(note).toContain(`Hovering, the shadow is ${fixed(across[0], 1)}° across; diving in at 0.9c it shrinks to ${fixed(across[1], 1)}°; climbing out at 0.9c it swells to ${Math.round(across[2])}°`);
    // wider than the view (50° tall, 76° wide on this canvas)
    expect(across[2]).toBeGreaterThan(80);
    // It repeats every 30 s: 5 s into the next cycle it is hovering again.
    play(DIVE_AND_CLIMB_PERIOD_S + 5 - 25);
    expect(controller.mode).toBe('hold');
    expect(fixed(2 * view().shadowRadius * DEG, 1)).toBe(fixed(2 * shadowAngle(20) * DEG, 1));
  });

  it('ends when the next scene starts, and the clock runs again', () => {
    run('dive-and-climb');
    expect(sim.paused).toBe(true);
    run('go:jupiter');
    expect(controller.mode).not.toBe('hold');
    expect(sim.paused).toBe(false);
  });
});

describe('Flying past Sgr A*', () => {
  it('holds at 5 r_s at 0.9c across the line to the hole, looking ahead', () => {
    const note = run('sgr-a-star-flyby');
    expect(controller.mode).toBe('hold');
    expect(Math.abs(gravity.rM / 10 - 1)).toBeLessThan(1e-12);
    expect(relView.active).toBe(true);
    expect(Math.tanh(relView.phi)).toBeCloseTo(0.9, 12);
    expect(angle(relView.velDir.clone(), ACROSS_THE_PLANE.clone())).toBeLessThan(1e-9);
    expect(angle(forward(), ACROSS_THE_PLANE.clone())).toBeLessThan(1e-9);
    // The hole is square to the path.
    expect(angle(IN_THE_PLANE.clone().negate(), ACROSS_THE_PLANE.clone()) * DEG).toBeCloseTo(90, 12);
    const v = view();
    expect(note).toContain(`(${fixed(v.distanceKm / AU_KM, 2)} au)`);
    expect(note).toContain(`shadow would be ${fixed(2 * shadowAngle(10) * DEG, 1)}° across`);
    expect(note).toContain(`it is ${fixed(2 * v.shadowRadius * DEG, 1)}° across and centred ${fixed(angle(v.shadowCentre!.clone(), forward()) * DEG, 1)}° from straight ahead`);
    // Galactic north up: the shadow's centre level with the view's, to the left.
    const up = new Vector3(0, 1, 0).applyQuaternion(sim.camera.quat);
    const right = new Vector3(1, 0, 0).applyQuaternion(sim.camera.quat);
    expect(Math.abs(v.shadowCentre!.clone().normalize().dot(up))).toBeLessThan(1e-9);
    expect(v.shadowCentre!.clone().normalize().dot(right)).toBeLessThan(-0.4);
    expect(note).toContain('looking ahead with the hole to your left');
  });
});

describe('S2 behind the black hole', () => {
  it('finds a pericentre of S2 in the app’s positions within 9 years, and starts a minute before it', () => {
    const tp = s2PericentreNear(NOW)!;
    expect(tp).not.toBeNull();
    expect(Math.abs(tp - NOW)).toBeLessThan(9 * 365.25 * 86_400_000);
    const at = s2BehindSetUp(tp)!;
    expect(Math.abs((at.rM * blackHoleRsKm(SGR_A)) / 2 / (300 * AU_KM) - 1)).toBeLessThan(1e-15);
    const alpha = Math.sqrt(1 - 2 / at.rM);
    expect((tp - at.startMs) / 1000).toBeCloseTo((60 * S2_BEHIND_WARP) / alpha, 6);
  });

  it('finds one far from today too, where a step of the clock is longer than a second (the search used to spin forever)', () => {
    for (const year of [1e9, 19.3e9, -1e9]) {
      const ms = msFromCivil(year, 1, 1);
      const tp = s2PericentreNear(ms)!;
      expect(Number.isFinite(tp), String(year)).toBe(true);
      expect(Math.abs(tp - ms)).toBeLessThan(9 * 365.25 * 86_400_000);
    }
  });

  it('shows S2’s two images a minute in, where the exact solver puts them', () => {
    const tp = s2PericentreNear(NOW)!;
    const note = run('s2-behind-sgr-a-star');
    expect(useUI.getState().selected).toBe('s2');
    expect(Math.abs(gravity.rKm / (300 * AU_KM) - 1)).toBeLessThan(1e-12);
    expect(sim.warp).toBe(S2_BEHIND_WARP);
    expect(sim.paused).toBe(false);
    expect(gravity.paced).toBe(true);
    // A minute of real time: to the alignment (within a frame).
    play(60, 0.05);
    expect(Math.abs(sim.timeMs - tp)).toBeLessThan((0.05 * S2_BEHIND_WARP * 1000) / gravity.alpha + 1);
    const s2 = sim.bodies.s2.pos.clone().sub(sim.bodies[SGR_A].pos);
    const s2v = sim.bodies.s2.vel.clone().sub(sim.bodies[SGR_A].vel);
    const cam = gravity.camRelHoleKm.clone();
    const through = cam.clone().negate().normalize();
    // The line from the camera through the hole passes 1 au from S2, S2 on the far side.
    expect(s2.clone().cross(through).length() / AU_KM).toBeCloseTo(1, 3);
    expect(s2.dot(through)).toBeGreaterThan(0);
    expect(note).toContain(`${Math.round(s2.length() / AU_KM)} au behind it`);
    expect(note).toContain(`${Math.round(cam.length() / AU_KM)} au out on the far side`);
    // The images (exact: Carlson's sweeps, both branches).
    const m = gravity.mKm;
    const ro = cam.length() / m;
    const rs = s2.length() / m;
    const phi = angle(cam, s2);
    const imgs = lensImages(ro, rs, phi, 0);
    const [a, b] = imgs.map((x) => x.theta * DEG).sort((x, y) => y - x);
    const mu = imgs.reduce((s, x) => s + Math.abs(x.mu), 0);
    expect(note).toContain(`two images, ${fixed(a, 2)}° and ${fixed(b, 2)}° from the centre, together ${fixed(mu, 1)} times brighter`);
    const ring = lensImages(ro, rs, Math.PI - 1e-12, 0)[0].theta * DEG;
    expect(note).toContain(`ring ${fixed(ring, 2)}° in radius`);
    // S2's own speed and clock there (against a clock at rest far away: gravity and motion).
    const speed = s2v.length();
    expect(note).toContain(`moves at ${grouped(Math.round(speed / 10) * 10)} km/s`);
    const rate = Math.sqrt(1 - gravity.rsKm / s2.length()) * Math.sqrt(1 - (speed / C_KM_S) ** 2);
    expect(note).toContain(`loses ${Math.round((1 - rate) * 86_400)} s a day`);
    expect(note).toContain('30 minutes a second');
    expect(S2_BEHIND_WARP).toBe(1800);
  }, 60_000);
});

describe('The gas round Sgr A*', () => {
  it('hovers at 20 M on the line to the Sun, flow on in visible light, with the flow’s own numbers', () => {
    useUI.setState({ accretionFlow: false, accretionBand: 'mm' });
    const note = run('sgr-a-star-flow');
    expect(useUI.getState()).toMatchObject({ accretionFlow: true, accretionBand: 'visible', lensing: true, selected: SGR_A });
    const f = SGRA_FLOW.scenes['sgr-a-star-flow'];
    expect(Math.abs(gravity.rM / f.rM - 1)).toBeLessThan(1e-12);
    const toSun = sim.bodies.sun.pos.clone().sub(sim.bodies[SGR_A].pos);
    expect(angle(gravity.camRelHoleKm.clone(), toSun)).toBeLessThan(1e-12);
    // Our own viewing angle to the flow's axis, as the flow's tracer took it.
    const axis = new Vector3(...flowAxisWorld);
    expect(angle(axis, toSun) * DEG).toBeCloseTo(f.inclinationDeg, 1);
    const v = view();
    expect(fixed(v.shadowRadius * DEG, 2)).toBe(fixed(f.shadowRadiusDeg, 2));
    expect(note).toContain(`ring ${fixed(f.ringRadiusDeg, 2)}° in radius just outside the shadow’s edge (${fixed(v.shadowRadius * DEG, 2)}°)`);
    expect(note).toContain(`magnitude ${fixed(f.vMag, 1).replace('-', '−')} in all, brighter than the Sun from Earth`);
    expect(f.vMag).toBeLessThan(SUN_VMAG_AT_1AU);
    expect(Math.round(toSun.length() / gravity.rKm / 1e9)).toBe(2);
    expect(note).toContain('two billion times closer');
    expect(note).toContain(`(${fixed(v.distanceKm / AU_KM, 2)} au)`);
  });

  it('is put back by the next scene, and a lens scene’s flow switch too', () => {
    useUI.setState({ accretionFlow: false, accretionBand: 'mm' });
    run('sgr-a-star-flow');
    run('go:jupiter');
    expect(useUI.getState()).toMatchObject({ accretionFlow: false, accretionBand: 'mm' });
    useUI.setState({ accretionFlow: true, accretionBand: 'visible', lensing: false });
    run('photon-ring');
    expect(useUI.getState()).toMatchObject({ accretionFlow: false, lensing: true });
    run('go:jupiter');
    expect(useUI.getState()).toMatchObject({ accretionFlow: true, lensing: false });
    // Changed by the visitor since: left alone.
    useUI.setState({ lensing: true });
    run('photon-ring');
    useUI.setState({ accretionFlow: true });
    run('go:jupiter');
    expect(useUI.getState()).toMatchObject({ accretionFlow: true, lensing: true });
  }, 60_000);

});

describe('Sagittarius A* in radio light', () => {
  it('hovers 30 horizon radii out on the line to the Sun, the flow on at 1.3 mm, put back by the next scene', () => {
    useUI.setState({ accretionFlow: false, accretionBand: 'visible' });
    const note = run('sgr-a-star-radio');
    expect(useUI.getState()).toMatchObject({ accretionFlow: true, accretionBand: 'mm', lensing: true, selected: SGR_A });
    expect(Math.abs(gravity.rM / SGRA_RADIO_M - 1)).toBeLessThan(1e-12);
    const v = view();
    expect(Math.round(v.rOverRs)).toBe(30);
    expect(note).toContain(`Thirty horizon radii (${fixed(v.distanceKm / AU_KM, 1)} au)`);
    // The EHT's ring, 51.8 µas across (blackholes.json): 52 millionths of an arcsecond.
    expect(Math.round(getBody(SGR_A)!.blackHole!.ehtImage!.ringDiameterUas)).toBe(52);
    expect(note).toContain('52 millionths of an arcsecond');
    run('go:jupiter');
    expect(useUI.getState()).toMatchObject({ accretionFlow: false, accretionBand: 'visible' });
  }, 60_000);
});

describe('Cygnus X-1’s disc', () => {
  const normal = () => {
    const n = getBody('cyg-x-1')!.blackHole!.disk!.normalWorld;
    return new Vector3(n[0], n[1], n[2]);
  };
  const kmText = (km: number, step: number) => (Math.round(km / step) * step).toLocaleString('en-GB');

  it('just above the disc: 30 horizon radii out, 8° above its plane, the disc on and the orbit lines off', () => {
    useUI.setState({ showOrbits: true, accretionDisks: false });
    const note = run('cyg-x-1-disk');
    expect(gravity.hole).toBe('cyg-x-1');
    expect(Math.abs(gravity.rM / CYG_X1_DISK_VIEW.rM - 1)).toBeLessThan(1e-9);
    expect(90 - angle(gravity.camRelHoleKm.clone(), normal()) * DEG).toBeCloseTo(CYG_X1_DISK_VIEW.elevationDeg, 6);
    expect(useUI.getState()).toMatchObject({ accretionDisks: true, showOrbits: false, lensing: true, selected: 'cyg-x-1' });
    expect(note).toContain(`Thirty horizon radii (${kmText(gravity.rKm, 100)} km)`);
    expect(Math.round(gravity.rM / 2)).toBe(30);
    // Level: the disc's axis is up in the view.
    const up = new Vector3(0, 1, 0).applyQuaternion(sim.camera.quat);
    expect(angle(up, normal().projectOnPlane(forward()))).toBeLessThan(1e-6);
    expect(angle(forward(), gravity.camRelHoleKm.clone().negate())).toBeLessThan(1e-6);
    run('go:jupiter');
    expect(useUI.getState()).toMatchObject({ accretionDisks: false, showOrbits: true });
  }, 60_000);

  it('from above: 75 horizon radii out on the line to the Sun, the disc at our own angle, 27° from its axis', () => {
    const note = run('cyg-x-1-from-above');
    expect(Math.abs(gravity.rM / CYG_X1_ABOVE_VIEW.rM - 1)).toBeLessThan(1e-9);
    const toSun = sim.bodies.sun.pos.clone().sub(sim.bodies['cyg-x-1'].pos);
    expect(angle(gravity.camRelHoleKm.clone(), toSun)).toBeLessThan(1e-9);
    const i = angle(gravity.camRelHoleKm.clone(), normal()) * DEG;
    expect(Math.round(Math.min(i, 180 - i))).toBe(27);
    expect(note).toContain(`Seventy-five horizon radii (${kmText(gravity.rKm, 100)} km)`);
    expect(note).toContain('27° from its axis');
    expect(Math.round(gravity.rM / 2)).toBe(75);
  }, 60_000);

  it('the disc lies in the binary’s orbital plane, 27° from our line of sight (Miller-Jones et al. 2021: 27.5 ± 0.8°)', () => {
    const toSun = sim.bodies.sun.pos.clone().sub(sim.bodies['cyg-x-1'].pos);
    const i = angle(toSun, normal()) * DEG;
    expect(Math.min(i, 180 - i)).toBeCloseTo(27.1, 0);
  });
});

describe('M87* from 1,000 au', () => {
  it('hovers 1,000 au from M87* on our side: shadow, ring, clock, thrust and tides as the card has them', () => {
    const note = run('m87-star-close');
    expect(gravity.hole).toBe('m87-star');
    expect(Math.abs(gravity.rKm / (1000 * AU_KM) - 1)).toBeLessThan(1e-12);
    const toSun = sim.bodies.sun.pos.clone().sub(sim.bodies['m87-star'].pos);
    expect(angle(gravity.camRelHoleKm.clone(), toSun)).toBeLessThan(1e-12);
    const v = view('m87-star');
    expect(note).toContain(`${fixed(v.rOverRs, 1)} horizon radii out`);
    // "its horizon alone would reach three times Pluto's distance" (Pluto's orbit: 39.5 au on average)
    expect(Math.round(gravity.rsKm / AU_KM / 39.5)).toBe(3);
    expect(note).toContain(`shadow is ${fixed(2 * v.shadowRadius * DEG, 1)}° across`);
    expect(note).toContain(`ring ${Math.round(2 * v.einsteinRadius * DEG)}° across`);
    expect(note).toContain(`clock runs at ${fixed(v.clockRate, 4)} of home’s`);
    expect(v.tidalMS2).toBeLessThan(1e-9);
    expect(note).toContain(`only ${fixed(v.thrustG!, 1)} g`);
    // Where hovering takes 1 g.
    let lo = 1000 * AU_KM;
    let hi = 1e5 * AU_KM;
    for (let i = 0; i < 200; i++) {
      const mid = Math.sqrt(lo * hi);
      if (hoverAccelKmS2(gravity.gmKm3S2, mid) / G0_KM_S2 > 1) lo = mid;
      else hi = mid;
    }
    expect(note).toContain(`1 g from ${grouped(lo / AU_KM)} au`);
    expect(getBody('m87-star')!.kind).toBe('black-hole');
  });
});

describe('the sky from a black hole', () => {
  it('hovers 10,000 au beyond Sgr A* exactly on the line of the Sun’s light, the clock running: the Sun’s ring', () => {
    const note = run('sky-from:sgr-a-star');
    expect(skyFromHoleKm(SGR_A)).toBe(10_000 * AU_KM);
    const want = alignBehind(SGR_A, 'sun', 10_000 * AU_KM, new Vector3())!;
    // Within a few km of the line (the Sun's disc, seen from here, allows about 4 km).
    expect(gravity.camRelHoleKm.distanceTo(want)).toBeLessThan(1e-3);
    expect(angle(forward(), want.clone().negate())).toBeLessThan(1e-9);
    const sky = holeSky(SGR_A)!;
    // The ring: the exact lens with the Sun where it is.
    const m = gravity.mKm;
    const exact = lensImages(sky.cameraKm / m, sky.sunBehindKm / m, Math.PI - 1e-13, 0)[0].theta;
    expect(Math.abs(sky.ringRad / exact - 1)).toBeLessThan(1e-4);
    expect(fixed(sky.ringRad * DEG, 3)).toBe('0.236');
    expect(note).toContain(`ring ${(2 * sky.ringRad * DEG).toPrecision(3)}° across,`);
    expect(note).toContain(`magnitude ${fixed(sky.ringMag, 1).replace('-', '−')} without the dust`);
    expect(sky.ringMag).toBeCloseTo(-4.3, 1);
    expect(note).toContain('27,000 light-years behind Sagittarius A*');
    expect(note).toContain('10,000 au beyond the hole');
    // At rest against the Sun: the ring holds, and the clock runs.
    expect(sky.ringHoldsS).toBe(Infinity);
    expect(note).toContain('so the ring holds with the clock running');
    // …as a model: really the Sun's orbit carries Sgr A* across the line (6.411 mas/yr at its distance), and the ring
    // opens once the line has moved the Sun's radius.
    const acrossKmS = (6.411e-3 / 3600) * (Math.PI / 180) * sim.bodies[SGR_A].pos.length() / (365.25 * 86_400);
    expect(Math.round(acrossKmS)).toBe(252);
    expect(note).toContain(`across that line at 252 km/s, and the ring would open into two arcs within ${Math.round(SUN_RADIUS_KM / 252 / 60)} minutes`);
    // The flow's point would drown the ring: off, and said so.
    expect(note.endsWith(FLOW_OFF)).toBe(true);
    expect(useUI.getState().accretionFlow).toBe(false);
    expect(sim.paused).toBe(false);
    expect(sim.warp).toBe(1);
    play(60, 1);
    expect(gravity.camRelHoleKm.distanceTo(alignBehind(SGR_A, 'sun', 10_000 * AU_KM, new Vector3())!)).toBeLessThan(1e-3);
  });

  it('hovers where Gaia BH1 makes the Sun a ring the size of the full Moon, on the aberrated line, the clock paused', () => {
    const note = run('sky-from:gaia-bh1');
    expect(gravity.hole).toBe('gaia-bh1');
    const dKm = skyFromHoleKm('gaia-bh1');
    expect(dKm / 1e6).toBeCloseTo(2.68, 2);
    expect(note).toContain(`${(dKm / 1e6).toPrecision(3)} million km beyond the hole`);
    // Within the 13 cm the ring allows of the line along which the Sun's light reaches the hole, not the straight line.
    const tol = (SUN_RADIUS_KM * dKm) / sim.bodies['gaia-bh1'].pos.distanceTo(sim.bodies.sun.pos);
    expect(tol * 1e5).toBeCloseTo(12.6, 0);
    const want = alignBehind('gaia-bh1', 'sun', dKm, new Vector3())!;
    expect(gravity.camRelHoleKm.distanceTo(want)).toBeLessThan(0.01 * tol);
    const straight = sim.bodies['gaia-bh1'].pos.clone().sub(sim.bodies.sun.pos).normalize().multiplyScalar(dKm);
    expect(straight.distanceTo(want)).toBeGreaterThan(100);
    const sky = holeSky('gaia-bh1')!;
    expect(fixed(sky.ringRad * DEG, 3)).toBe('0.259');
    expect(note).toContain(`ring ${(2 * sky.ringRad * DEG).toPrecision(3)}° across, the size of the full Moon`);
    expect(sky.ringMag).toBeCloseTo(-7.5, 1);
    expect(note).toContain(`magnitude ${fixed(sky.ringMag, 1).replace('-', '−')}`);
    // The hole's orbit swings the line off the Sun in seconds: a snapshot, the clock paused.
    expect(sim.paused).toBe(true);
    const said = Number(note.match(/off the Sun within (\d+) s,/)![1]);
    expect(Math.abs(said / sky.ringHoldsS - 1)).toBeLessThan(0.15);
    expect(sky.ringHoldsS).toBeGreaterThan(1);
    expect(sky.ringHoldsS).toBeLessThan(30);
    // Checked through alignBehind itself: that long after, the exact line has moved by the Sun's radius (seen
    // from the hole, at the camera's distance) from where the hovering camera still is.
    const t0 = sim.timeMs;
    const rel0 = gravity.camRelHoleKm.clone();
    try {
      setSimTime(t0 + 1000 * sky.ringHoldsS);
      updateEphemeris();
      updateApparentPositions(false);
      const moved = alignBehind('gaia-bh1', 'sun', dKm, new Vector3())!.distanceTo(rel0);
      expect(moved / tol).toBeGreaterThan(0.9);
      expect(moved / tol).toBeLessThan(1.1);
    } finally {
      setSimTime(t0);
      updateEphemeris();
      updateApparentPositions(false);
    }
  });

  it('says, for every black hole, how the Sun’s ring stands', () => {
    for (const id of ['m87-star', 'gaia-bh2', 'gaia-bh3', 'cyg-x-1', 'v404-cygni', 'a0620-00', 'maxi-j1820', 'xte-j1118', 'ogle-2011-blg-0462']) {
      const note = sceneNote(`sky-from:${id}`)!;
      const sky = holeSky(id)!;
      expect(note, id).toContain(`ring ${(2 * sky.ringRad * DEG).toPrecision(3)}° across, the size of the full Moon`);
      expect(note, id).not.toContain(FLOW_OFF);
      if (sky.ringHoldsS >= 86_400) expect(note, id).toContain('so the ring holds with the clock running');
      else expect(note, id).toContain('The clock is paused at the alignment');
    }
    // The X-ray binaries' holes swing round in hours: their rings last about a millisecond with the clock running.
    expect(holeSky('cyg-x-1')!.ringHoldsS).toBeLessThan(0.01);
    // The lone hole is drawn at rest against the Sun; M87* all but (it keeps its ring for days at least).
    expect(holeSky('ogle-2011-blg-0462')!.ringHoldsS).toBe(Infinity);
    expect(holeSky('m87-star')!.ringHoldsS).toBeGreaterThan(86_400);
  });
});

describe('the lens sentences elsewhere', () => {
  it('in the Galactic Centre scene: the lens bends starlight within about 0.3° of Sgr A* from 6,000 au', () => {
    expect(sceneNote('galactic-centre-orbits')).toContain('from 6,000 au its shadow is far below a pixel, but its lens bends the light of stars passing behind it within about 0.3° of it');
    const m = blackHoleRsKm(SGR_A) / 2;
    expect(fixed(einsteinAngle({ frame: 'static', r: (6000 * AU_KM) / m }) * DEG, 1)).toBe('0.3');
    expect(shadowAngle((6000 * AU_KM) / m) * 1484).toBeLessThan(1);
  });

  it('in the 1 g flight to Sgr A*: a ring 0.75° across where the flight stops, 4,000 au out', () => {
    expect(framingDistance(SGR_A) / AU_KM).toBeCloseTo(4000, 6);
    const m = blackHoleRsKm(SGR_A) / 2;
    const ring = einsteinAngle({ frame: 'static', r: (4000 * AU_KM) / m });
    expect(sceneNote('fly:sgr-a-star')).toContain(`You stop 4,000 au out, where the black hole is far too small to see but bends the light from behind it into a ring ${fixed(2 * ring * DEG, 2)}° across.`);
  });
});
