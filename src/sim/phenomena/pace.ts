/**
 * A scene's pace through an explosion (content/scenes.ts starts it; updatePhenomena runs it each frame): the clock runs
 * at real time until a moment, then faster and faster so that each few seconds of the view cover e times as much of
 * the explosion's age (the warp is the age over `efoldS`), and the camera eases out to keep the growing debris in view.
 * Anything the visitor does to the clock or the camera hands both back to them: the pace stops.
 */
import { controller } from '../../controls/cameraController';
import { setWarp } from '../clock';
import { sim } from '../sim';

export interface Pace {
  /** The body the camera orbits. */
  target: string;
  /** The explosion's moment (ms): the warp grows with the time since it. */
  zeroMs: number;
  /** Real time until this moment, ms (the inspiral's last minute; −Infinity: the ramp starts at once). */
  realUntilMs: number;
  /** Each this many seconds of the view, the age grows e times (warp = age / efoldS). */
  efoldS: number;
  maxWarp: number;
  /** The pace ends here (ms of the clock), leaving the warp as it is. */
  endMs: number;
  /** The camera's distance for a time, km (NaN: leave it). */
  distanceKm: (ms: number) => number;
}

let pace: Pace | null = null;
let moves = -1;
let lastWarp = NaN;
let lastGoal = NaN;

/** Start a pace (after the scene's slew has ended). */
export function startPace(p: Pace): void {
  pace = p;
  moves = controller.moves;
  lastWarp = NaN;
  lastGoal = NaN;
}

export const stopPace = (): void => {
  pace = null;
};

export const paceActive = (): boolean => pace !== null;

/** Once a frame. */
export function updatePace(): void {
  const p = pace;
  if (!p) return;
  // The visitor took over: a camera move, a zoom, or another rate.
  const zoomed = Number.isFinite(lastGoal) && Math.abs(controller.orbitGoalKm / lastGoal - 1) > 1e-6;
  if (controller.moves !== moves || controller.target !== p.target || (Number.isFinite(lastWarp) && sim.warp !== lastWarp) || zoomed || sim.timeMs > p.endMs) {
    pace = null;
    return;
  }
  const ms = sim.timeMs;
  // Two significant figures: the rate shown changes a few times a second, not every frame.
  const w = ms < p.realUntilMs ? 1 : Number(Math.min(p.maxWarp, Math.max(1, (ms - p.zeroMs) / 1000 / p.efoldS)).toPrecision(2));
  if (w !== sim.warp) setWarp(w);
  lastWarp = sim.warp;
  const d = p.distanceKm(ms);
  if (Number.isFinite(d) && d > 0 && controller.zoomTo(d)) lastGoal = controller.orbitGoalKm;
}
