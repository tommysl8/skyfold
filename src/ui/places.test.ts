/**
 * Places in the app (ui/places.ts) with the whole registry in: the view captured exactly (a planet, Betelgeuse, the
 * Whirlpool Galaxy 8.6 Mpc out, where a world coordinate is 10⁵ km coarse, and a hover just above Sgr A*'s horizon),
 * written as a link, read back and applied, and the camera found where it was: the distance to the figures the link
 * keeps, a black hole's height exactly; the clock ("now", a date, the pace and the pause); Roam and a trip captured as
 * orbit poses; and a link to an id nothing has, which leaves the view where it is and says so.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { registerUniverse } from '../test/universe';
import { blackHoleRsKm, controller, hoverFloorKm } from '../controls/cameraController';
import { framingDistance, minDistance } from '../controls/framing';
import { KILONOVA_ID } from '../sim/phenomena';
import { updateEphemeris } from '../sim/ephemeris';
import { resetToNow, setEpoch, setPaused, setWarp } from '../sim/clock';
import { tickClock } from '../sim/tick';
import { forceLensProgramsReady } from '../render/lens/lensState';
import { setSimTime, sim } from '../sim/sim';
import { travel } from '../sim/travel';
import { msFromCivil } from '../lib/time';
import { useUI } from '../state/ui';
import { decodePlace, encodePlace, type Place } from '../state/place';
import { applyPlace, capturePlace, defaultLabel, placeNote } from './places';

const NOW = msFromCivil(2031, 3, 3, 12);
const SGR_A = 'sgr-a-star';

function frame(dt = 1 / 60): void {
  const dtSim = tickClock(dt);
  updateEphemeris();
  controller.update(dt, dtSim);
  sim.frame++;
}

/** Captured, written as a link, read back. */
function roundTrip(): Place {
  const p = capturePlace();
  expect(p).not.toBeNull();
  return decodePlace(encodePlace(p!))!;
}

/** The camera relative to a body, from the world positions (coarse far out: for checks near home only). */
const offset = (id: string) => sim.camera.pos.clone().sub(sim.bodies[id].pos);
const relErr = (a: number, b: number) => Math.abs(a / b - 1);
const DIR = new Vector3(-0.36, 0.48, 0.8);

beforeAll(() => {
  if (typeof document === 'undefined') vi.stubGlobal('document', { pointerLockElement: null, exitPointerLock: () => {} });
  registerUniverse();
  forceLensProgramsReady(true);
  setSimTime(NOW);
  updateEphemeris();
  frame();
});

beforeEach(() => {
  useUI.setState({ tripActive: false, fallActive: false, selected: null, welcomeOpen: false });
  controller.leaveHoleModes();
  setEpoch(NOW);
  setWarp(1);
  setPaused(false);
  updateEphemeris();
});

afterAll(() => {
  forceLensProgramsReady(null);
  vi.unstubAllGlobals();
});

describe('capturing and applying the view', () => {
  it('at a planet: back at the same distance and direction, with the body selected', () => {
    controller.placeAt('mars', 54_321.0987, DIR);
    useUI.getState().select('phobos');
    frame();
    const p = roundTrip();
    expect(p.at).toBe('mars');
    expect(relErr(p.r!, 54_321.0987)).toBeLessThan(5e-6);
    expect(p.sel).toBe('phobos');
    controller.placeAt('earth', 26_000);
    useUI.getState().select(null);
    frame();
    expect(applyPlace(p)).toBe(true);
    frame();
    expect(useUI.getState().focus).toBe('mars');
    expect(useUI.getState().selected).toBe('phobos');
    const off = offset('mars');
    expect(relErr(off.length(), p.r!)).toBeLessThan(1e-9);
    expect(off.normalize().angleTo(DIR.clone().normalize())).toBeLessThan(3e-6);
  });

  it('at a star (Betelgeuse, 170 pc out)', () => {
    const d = framingDistance('betelgeuse') * 3.21;
    controller.placeAt('betelgeuse', d, DIR);
    frame();
    const p = roundTrip();
    expect(p.at).toBe('betelgeuse');
    expect(relErr(p.r!, d)).toBeLessThan(5e-6);
    controller.placeAt('earth', 26_000);
    frame();
    applyPlace(p);
    frame();
    expect(useUI.getState().focus).toBe('betelgeuse');
    const off = new Vector3();
    expect(controller.orbitOffsetKm('betelgeuse', off)).toBe(true);
    expect(relErr(off.length(), p.r!)).toBeLessThan(1e-12);
    expect(off.normalize().angleTo(DIR.clone().normalize())).toBeLessThan(3e-6);
  });

  it('at a galaxy 8.6 Mpc out (the Whirlpool, M51)', () => {
    const d = minDistance('whirlpool') * 2.345678;
    controller.placeAt('whirlpool', d, DIR);
    frame();
    const p = roundTrip();
    expect(p.at).toBe('whirlpool');
    expect(relErr(p.r!, d)).toBeLessThan(5e-6);
    controller.placeAt('earth', 26_000);
    frame();
    applyPlace(p);
    frame();
    const off = new Vector3();
    expect(controller.orbitOffsetKm('whirlpool', off)).toBe(true);
    expect(relErr(off.length(), p.r!)).toBeLessThan(1e-12);
  });

  it('40 Mpc out, by the kilonova in NGC 4993: the offset exact (the orbit’s own), not world − world, 10⁵ km coarse there', () => {
    const d = Math.max(minDistance(KILONOVA_ID) * 1.5, 300);
    controller.placeAt(KILONOVA_ID, d, DIR);
    frame();
    // A step of a world coordinate there is far larger than the camera's distance from the body.
    const ulp = 2 ** (Math.floor(Math.log2(sim.bodies[KILONOVA_ID].pos.length())) - 52);
    expect(ulp).toBeGreaterThan(10 * d);
    const p = capturePlace()!;
    expect(relErr(p.r!, d)).toBeLessThan(1e-12);
    const back = decodePlace(encodePlace(p))!;
    controller.placeAt('earth', 26_000);
    frame();
    applyPlace(back);
    frame();
    const off = new Vector3();
    expect(controller.orbitOffsetKm(KILONOVA_ID, off)).toBe(true);
    expect(relErr(off.length(), d)).toBeLessThan(5e-6);
  });

  it('over Sgr A* just above the floor: the height exact to the 12 figures the link keeps, and the floor itself exactly', () => {
    const rs = blackHoleRsKm(SGR_A);
    const floor = hoverFloorKm(SGR_A, rs);
    const h = floor * 1.001;
    controller.placeAt(SGR_A, rs + h, DIR, h);
    frame();
    expect(controller.holeHeightKm).toBe(h);
    const p = roundTrip();
    expect(p.at).toBe(SGR_A);
    expect(p.r).toBeUndefined();
    expect(relErr(p.h!, h)).toBeLessThan(5e-12);
    controller.placeAt('earth', 26_000);
    frame();
    applyPlace(p);
    frame();
    expect(useUI.getState().focus).toBe(SGR_A);
    expect(controller.holeHeightKm).toBe(p.h);
    const rel = new Vector3();
    expect(controller.holeRelative(rel)).toBe(SGR_A);
    expect(rel.normalize().angleTo(DIR.clone().normalize())).toBeLessThan(3e-6);
    // At the floor: written to 12 figures and read back, it lands on the floor exactly.
    controller.placeAt(SGR_A, rs + floor, DIR, floor);
    frame();
    const atFloor = roundTrip();
    controller.placeAt('earth', 26_000);
    frame();
    applyPlace(atFloor);
    frame();
    expect(controller.holeHeightKm).toBe(floor);
  });

  it('keeps "now", a date, the pace and the pause', () => {
    resetToNow();
    controller.placeAt('jupiter');
    frame();
    expect(capturePlace()!.t).toBe('now');
    setEpoch(NOW);
    setWarp(1e5);
    setPaused(true);
    const p = roundTrip();
    expect(p).toMatchObject({ t: NOW, w: 1e5, p: true });
    // Back to the present, then to the place: its date, pace and pause.
    resetToNow();
    applyPlace(p);
    expect(sim.timeMs).toBe(NOW);
    expect(sim.warp).toBe(1e5);
    expect(sim.paused).toBe(true);
    expect(sim.live).toBe(false);
    // And a place at "now": the clock live again.
    applyPlace({ ...p, t: 'now', w: 1, p: false });
    expect(sim.live).toBe(true);
    expect(Math.abs(sim.timeMs - Date.now())).toBeLessThan(5000);
  });

  it('roaming: an orbit pose about the body Roam takes its pace from', () => {
    controller.placeAt('saturn', 3e6, DIR);
    frame();
    expect(controller.enterRoam()).toBe(true);
    for (let i = 0; i < 5; i++) frame();
    const p = capturePlace()!;
    expect(sim.bodies[p.at]).toBeDefined();
    const off = offset(p.at);
    expect(relErr(p.r!, off.length())).toBeLessThan(1e-9);
    controller.exitRoam();
    for (let i = 0; i < 200 && controller.mode !== 'orbit'; i++) frame(1 / 30);
  });

  it('mid-trip: the destination, framed as on arrival (no distance, no direction)', () => {
    useUI.setState({ tripActive: true });
    travel.trip = { dest: 'saturn' } as typeof travel.trip;
    try {
      const p = capturePlace()!;
      expect(p.at).toBe('saturn');
      expect(p.r).toBeUndefined();
      expect(p.dir).toBeUndefined();
      // Nothing is applied in flight.
      expect(applyPlace(p)).toBe(false);
    } finally {
      travel.trip = null;
      useUI.setState({ tripActive: false });
    }
  });

  it('names a saved place by the body and the date', () => {
    expect(defaultLabel({ at: 'betelgeuse', t: NOW, w: 1, p: false })).toBe('Betelgeuse · 3 Mar 2031');
  });
});

describe('a link to an id nothing has', () => {
  it('leaves the view where it is and says so', async () => {
    // The page's loaders have run (the test registry), so the catalogues loaded on demand are asked, and fail here.
    controller.placeAt('earth', 26_000);
    frame();
    const done = new Promise<boolean>((resolve) => applyPlace({ at: 'renamed-in-version-9', t: 'now', w: 1, p: false }, { done: resolve }));
    expect(await done).toBe(false);
    expect(useUI.getState().focus).toBe('earth');
    expect(placeNote()).toEqual({ kind: 'failed', text: '“renamed-in-version-9” was not found (it may have been renamed), so the view stays here.' });
  }, 30_000);
});
