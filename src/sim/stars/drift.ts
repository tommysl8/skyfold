/**
 * The journey "The constellations drift" (content/scenes.ts): the clock jumped to a date tens of thousands of years
 * away and run at a steady pace through the present to as far beyond, so the stars' own motions (their straight-line
 * space motions from the catalogue, motion.ts) bend the constellation figures as you watch. The star field and the
 * figures already move with the date (shaders/stars.vert.glsl, constellation.vert.glsl); this only drives the clock.
 * A camera move or another rate hands the clock back to the visitor; at the end it returns to the present.
 */
import { controller } from '../../controls/cameraController';
import { resetToNow, setPaused, setWarp } from '../clock';
import { zeroChrono } from '../chronometer';
import { clearPulses } from '../pulses';
import { setSimTime, sim } from '../sim';

const YEAR_MS = 365.25 * 86_400_000;

export interface DriftRun {
  /** Years from the present the run starts and ends at, and its length on the wall clock, s. */
  fromYr: number;
  toYr: number;
  seconds: number;
}

let drift: { endMs: number; warp: number; moves: number; then: (() => void) | null } | null = null;

/** The warp of a run: its span over its seconds. */
export const driftWarp = (r: DriftRun): number => ((r.toYr - r.fromYr) * YEAR_MS) / 1000 / r.seconds;

/** Start a run from where the camera is (after its slew); `then` runs when it ends unless the visitor takes over. */
export function startDrift(r: DriftRun, then: (() => void) | null): void {
  const now = Date.now();
  setSimTime(now + r.fromYr * YEAR_MS);
  sim.live = false;
  zeroChrono();
  clearPulses();
  const warp = driftWarp(r);
  setWarp(warp);
  setPaused(false);
  drift = { endMs: now + r.toYr * YEAR_MS, warp, moves: controller.moves, then };
}

export function stopDrift(): void {
  drift = null;
}

export const drifting = (): boolean => drift !== null;

/** Once a frame (sim/stars/variability.ts updateStarTime). */
export function updateDrift(): void {
  const d = drift;
  if (!d) return;
  if (controller.moves !== d.moves || sim.warp !== d.warp || sim.paused) {
    drift = null;
    return;
  }
  if (sim.timeMs < d.endMs) return;
  drift = null;
  if (d.then) d.then();
  else resetToNow();
}
