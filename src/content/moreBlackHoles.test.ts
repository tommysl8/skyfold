/**
 * The black holes of the second table in the app (scripts/blackholes-more.mjs; docs/data/blackholes.md §13), with the
 * whole registry in as a visitor has it: every one registered (the binaries with the stars, the galaxies' holes with
 * the galaxies), found by "Where to?" under its names, listed where it lives (the Milky Way, its galaxy, or the
 * galaxies), and framed by Go there as the first table's are, the lens then about it (the gravity state's hole, at the
 * framing distance in units of M). Then the new scenes: the discs of LMC X-1 and GRS 1915+105 (camera, tilt, views on
 * and put back), and the tour, stop by stop.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { registerUniverse } from '../test/universe';
import { msFromCivil } from '../lib/time';
import { blackHoleRsKm, controller, framingDistance } from '../controls/cameraController';
import { tickClock, tickTrip } from '../sim/tick';
import { updateFall } from '../sim/fall';
import { updateEphemeris } from '../sim/ephemeris';
import { updateShipKinematics } from '../sim/shipKinematics';
import { gravity, updateGravity } from '../sim/gravity';
import { updateApparentPositions } from '../sim/lightDelay';
import { updateCosmicSky } from '../sim/cosmos/expansion';
import { updateLens } from '../render/lens/lensState';
import { updateRelativisticView } from '../render/relativisticView';
import { travel } from '../sim/travel';
import { setSimTime, sim } from '../sim/sim';
import { getBody, isBody } from '../sim/bodies';
import { BLACK_HOLES, GALAXY_HOLE_FRAMING_RS, STELLAR_FRAMING_RS } from '../sim/blackholes/records';
import { blackHoleIds } from '../sim/blackholes';
import { useUI } from '../state/ui';
import { stopTrip } from '../ui/tripActions';
import { allDestinations, searchDestinations } from './destinations';
import { JOURNEYS } from './journeys';
import { BLACK_HOLE_TOUR, cancelSceneStep, discTiltDeg, GRS_1915_VIEW, LMC_X1_DISK_VIEW, runScene, sceneStatus, tourAdvanceForTests, tourNote } from './scenes';

const NOW = msFromCivil(2026, 10, 9, 12);
const FIRST = new Set(['sgr-a-star', 'm87-star', 'gaia-bh1', 'gaia-bh2', 'gaia-bh3', 'cyg-x-1', 'v404-cygni', 'a0620-00', 'maxi-j1820', 'xte-j1118', 'ogle-2011-blg-0462']);
const MORE = BLACK_HOLES.holes.filter((h) => !FIRST.has(h.id));
const DEG = 180 / Math.PI;

/** One frame, in SimDriver's order, without the drawing (as blackHoleScenes.test.ts). */
function frame(dt = 1 / 30): void {
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

function settle(): void {
  let i = 0;
  do frame();
  while (useUI.getState().controlMode === 'transition' && ++i < 600);
}

function tidy(): void {
  cancelSceneStep();
  if (useUI.getState().tripActive) stopTrip();
  useUI.setState({ plannerOpen: false, selected: null });
}

function run(spec: string): string {
  tidy();
  setSimTime(NOW);
  updateEphemeris();
  expect(runScene(spec), spec).toBe(true);
  settle();
  return useUI.getState().journeyNote ?? '';
}

beforeAll(() => {
  if (typeof document === 'undefined') vi.stubGlobal('document', { pointerLockElement: null, exitPointerLock: () => {} });
  registerUniverse();
  sim.viewport.width = 1600;
  sim.viewport.height = 1000;
  sim.camera.fovDeg = 50;
  setSimTime(NOW);
  updateEphemeris();
  useUI.setState({ relMode: 'on', relDoppler: true, retarded: false, lensing: true, accretionFlow: false, accretionDisks: false, welcomeOpen: false });
});

afterAll(() => {
  tidy();
  controller.leaveHoleModes();
  vi.unstubAllGlobals();
});

describe('the second table’s black holes in the app', () => {
  it('are all registered, in the black holes’ own list, as black holes with their horizon', () => {
    for (const h of MORE) {
      const r = getBody(h.id);
      expect(r, h.id).toBeDefined();
      expect(r!.kind).toBe('black-hole');
      expect(blackHoleIds(), h.id).toContain(h.id);
      expect(blackHoleRsKm(h.id), h.id).toBeCloseTo(r!.blackHole!.rsKm, 6);
      expect(r!.blackHole!.massMsun, h.id).toBe(h.mass.value);
    }
    // Under their galaxies: M31* a child of the Andromeda Galaxy, M32's of M32.
    expect(getBody('m31-star')!.parent).toBe('andromeda');
    expect(getBody('m32-bh')!.parent).toBe('lg-m-032');
    expect(getBody('ngc-4889-bh')!.parent).toBeNull();
  });

  it('are found by “Where to?” under their names and listed where they live', () => {
    const all = allDestinations();
    const top = (q: string) => searchDestinations(q, all, 5)[0]?.destination;
    expect(top('LMC X-1')?.id).toBe('lmc-x-1');
    expect(top('V1487 Aql')?.id).toBe('grs-1915');
    expect(top('Nova Scorpii 1994')?.id).toBe('gro-j1655');
    expect(top('M31*')?.id).toBe('m31-star');
    expect(top('Andromeda black hole')?.id).toBe('m31-star');
    expect(top('NGC 4258 black hole')?.id).toBe('ngc-4258-bh');
    const byId = new Map(all.map((d) => [d.id, d]));
    // A binary in the Milky Way under The Milky Way; one in another galaxy, and a catalogue galaxy's hole, under the galaxies.
    expect(byId.get('grs-1915-system-barycentre')?.group).toBe('milky-way');
    expect(byId.get('lmc-x-1-system-barycentre')?.group).toBe('galaxies');
    expect(byId.get('m33-x-7-system-barycentre')?.group).toBe('galaxies');
    expect(byId.get('ngc-4889-bh')?.group).toBe('galaxies');
    expect(byId.get('m31-star')?.group).toBe('galaxies');
    expect(byId.get('m31-star')?.parent).toBe('andromeda');
  });

  it('are framed by Go there as the first table’s are, the lens then about each (10⁴ r_s for a stellar hole, 50 r_s for a galaxy’s)', () => {
    for (const h of MORE) {
      const rs = blackHoleRsKm(h.id);
      const radii = h.class === 'stellar' ? STELLAR_FRAMING_RS : GALAXY_HOLE_FRAMING_RS;
      expect(framingDistance(h.id) / (radii * rs) - 1, h.id).toBeLessThan(1e-9);
      run(`go:${h.id}`);
      expect(useUI.getState().focus, h.id).toBe(h.id);
      expect(gravity.hole, h.id).toBe(h.id);
      expect(Math.abs(gravity.rM / (2 * radii) - 1), h.id).toBeLessThan(1e-3);
    }
  }, 240_000);
});

describe('the new scenes', () => {
  const normal = (id: string) => {
    const n = getBody(id)!.blackHole!.disk!.normalWorld;
    return new Vector3(n[0], n[1], n[2]);
  };

  it('are runnable from the shipped data, with notes worded from the records', () => {
    for (const s of ['lmc-x-1-disk', 'grs-1915-disk', 'black-hole-tour']) expect(sceneStatus(s).ok, s).toBe(true);
    for (const id of ['black-hole-tour', 'lmc-x-1-disk']) {
      const j = JOURNEYS.find((x) => x.id === id)!;
      expect(j.look, id).not.toMatch(/NaN|loading/);
    }
  });

  it('LMC X-1: 30 horizon radii out, 10° above its disc, the disc on and the orbit lines off; put back by the next scene', () => {
    useUI.setState({ showOrbits: true, accretionDisks: false });
    const note = run('lmc-x-1-disk');
    expect(gravity.hole).toBe('lmc-x-1');
    expect(Math.abs(gravity.rM / LMC_X1_DISK_VIEW.rM - 1)).toBeLessThan(1e-9);
    const el = 90 - gravity.camRelHoleKm.angleTo(normal('lmc-x-1')) * DEG;
    expect(el).toBeCloseTo(LMC_X1_DISK_VIEW.elevationDeg, 6);
    expect(useUI.getState()).toMatchObject({ accretionDisks: true, showOrbits: false, lensing: true, selected: 'lmc-x-1' });
    expect(note).toContain(`${LMC_X1_DISK_VIEW.rM / 2} horizon radii (${(Math.round(gravity.rKm / 100) * 100).toLocaleString('en-GB')} km) from LMC X-1`);
    expect(note).toContain('10.9 solar masses');
    expect(note).toContain('16 % of its Eddington luminosity');
    expect(note).toContain('160,000 light-years');
    run('go:jupiter');
    expect(useUI.getState()).toMatchObject({ accretionDisks: false, showOrbits: true });
  }, 60_000);

  it('GRS 1915+105: on the line to the Sun, its disc at our own angle (60° from its axis, the jet’s)', () => {
    const note = run('grs-1915-disk');
    expect(gravity.hole).toBe('grs-1915');
    expect(Math.abs(gravity.rM / GRS_1915_VIEW.rM - 1)).toBeLessThan(1e-9);
    const toSun = sim.bodies.sun.pos.clone().sub(sim.bodies['grs-1915'].pos);
    // (acos near zero: float64 resolves about 10⁻⁸ rad)
    expect(gravity.camRelHoleKm.angleTo(toSun)).toBeLessThan(1e-7);
    const tilt = discTiltDeg('grs-1915', toSun);
    expect(tilt).toBeCloseTo(60, 0);
    expect(note).toContain(`${Math.round(tilt)}° from its axis`);
    expect(note).toMatch(/a typical state rather than today’s/);
  }, 60_000);

  it('the tour: every stop registered, each reached in turn at its distance, its note saying where it is', () => {
    for (const s of BLACK_HOLE_TOUR) expect(isBody(s.hole), s.hole).toBe(true);
    run('black-hole-tour');
    expect(useUI.getState()).toMatchObject({ lensing: true, accretionDisks: true });
    for (let i = 0; i < BLACK_HOLE_TOUR.length; i++) {
      if (i > 0) {
        tourAdvanceForTests(i);
        settle();
      }
      const stop = BLACK_HOLE_TOUR[i];
      expect(gravity.hole, stop.hole).toBe(stop.hole);
      expect(Math.abs(gravity.rM / stop.rM - 1), stop.hole).toBeLessThan(1e-9);
      expect(useUI.getState().journeyNote).toBe(tourNote(i));
      expect(tourNote(i)).toMatch(new RegExp(`^Stop ${i + 1} of ${BLACK_HOLE_TOUR.length}\\.`));
      expect(tourNote(i)).not.toMatch(/NaN|loading/);
    }
    run('go:jupiter');
  }, 120_000);
});
