/**
 * Simulation clock controls. Real time (1×) is the default, so you feel that even light takes
 * over eight minutes to reach Earth. Time warp runs to 10¹⁶ (320 million years a second), and
 * the clock reaches from the Big Bang to ten trillion years ahead.
 *
 * Everything that moves per frame is either evaluated in closed form at the new time (bodies,
 * orbits, belts, trips, chronometers during trips) or integrated with a step that is exact for
 * any size (chronometers at rest, which only add). Light pulses are solved for their exact
 * crossing inside each frame however long it is, so they stay exact at any warp too.
 */
import { sim, setSimTime } from './sim';
import { useUI } from '../state/ui';
import { zeroChrono } from './chronometer';
import { clearPulses } from './pulses';
import { formatRate, msFromCivil } from '../lib/time';

/** Simulated seconds per real second offered by the time-warp control. */
export const WARP_STEPS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e12, 1e14, 1e16];

/** Each step in words, computed from the step: "real time", "1.7 min/s", …, "320 million years/s". */
export const WARP_LABELS: Record<number, string> = Object.fromEntries(WARP_STEPS.map((w) => [w, formatRate(w)]));

/** A warp factor in words (any value, not only the steps). */
export const warpLabel = (w: number): string => WARP_LABELS[w] ?? formatRate(w);

export function setWarp(w: number): void {
  sim.warp = w;
  if (w !== 1) sim.live = false;
  useUI.setState({ warp: w });
}

export function setPaused(p: boolean): void {
  sim.paused = p;
  if (p) sim.live = false;
  useUI.setState({ paused: p });
}

export const togglePause = (): void => setPaused(!sim.paused);

/** One step faster or slower (from any warp, on the list or not). */
export function stepWarp(dir: 1 | -1): void {
  const w = sim.warp;
  const next =
    dir > 0
      ? (WARP_STEPS.find((s) => s > w) ?? WARP_STEPS[WARP_STEPS.length - 1])
      : (WARP_STEPS.findLast((s) => s < w) ?? WARP_STEPS[0]);
  setWarp(next);
}

/**
 * Back to the present moment at real time. Not allowed mid-trip or in a fall into a black hole,
 * where time can't run backwards. The chronometers are zeroed and pulses in flight are discarded.
 * (Near a black hole the clock is set to now but cannot stay live: your clock runs slow there.)
 */
export function resetToNow(): void {
  const ui = useUI.getState();
  if (ui.tripActive || ui.fallActive) return;
  setSimTime(Date.now());
  zeroChrono();
  clearPulses();
  setWarp(1);
  setPaused(false);
  sim.live = true;
}

/**
 * One frame of a live clock: set it to the computer's clock, `nowMs` (ms since 1970), and return
 * the simulated seconds that passed. However long the gap since the last frame (a tab hidden
 * for an hour), the clock lands on the present; everything downstream is exact at any step.
 * It never runs backwards: a jitter of the computer's clock is waited out, and a clock set back
 * by more than a second is followed the way "Now" does it (chronometers zeroed, pulses dropped).
 */
export function followWallClock(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 0;
  if (nowMs < sim.timeMs - 1000) {
    setSimTime(nowMs);
    zeroChrono();
    clearPulses();
    return 0;
  }
  if (!(nowMs > sim.timeMs)) return 0;
  const seconds = (nowMs - sim.timeMs) / 1000;
  // (tickClock sets the astronomy time for the frame.)
  sim.timeMs = nowMs;
  sim.timeCarryMs = 0;
  return seconds;
}

/** Earliest and latest dates the epoch setter accepts: years −9999 to 9999 (10,000 BCE to 9999 CE). */
export const EPOCH_MIN_MS = msFromCivil(-9999, 1, 1);
export const EPOCH_MAX_MS = msFromCivil(10_000, 1, 1) - 1;

/**
 * Hard limits of the clock, which trips and time warp can carry far past the setter's range:
 * the Big Bang (13.8 billion years ago) and ten trillion years ahead. They keep every number
 * finite and every calendar date exact.
 */
export const TIME_MIN_MS = msFromCivil(-13.8e9, 1, 1);
export const TIME_MAX_MS = msFromCivil(1e13, 1, 1);

/**
 * Set the simulation epoch (UTC ms). Not allowed mid-trip, nor in a fall. Like "now", it zeroes the
 * chronometers and discards pulses in flight, since time may have run backwards. `anywhere`: within the clock's own
 * limits instead of the setter's (a saved place's date, which a trip may have carried far past 9999).
 */
export function setEpoch(ms: number, anywhere = false): boolean {
  const ui = useUI.getState();
  if (ui.tripActive || ui.fallActive || !Number.isFinite(ms)) return false;
  setSimTime(anywhere ? Math.min(TIME_MAX_MS, Math.max(TIME_MIN_MS, ms)) : Math.min(EPOCH_MAX_MS, Math.max(EPOCH_MIN_MS, ms)));
  sim.live = false;
  zeroChrono();
  clearPulses();
  return true;
}

/**
 * Run the clock forward by `seconds` of simulated time. Returns the seconds actually applied
 * (less only at the end of time, where the clock stops and pauses).
 *
 * Far from 1970 one float64 step of sim.timeMs is seconds or hours long, so a 16 ms frame at
 * real time would round away to nothing and the clock would freeze. The remainder is carried
 * (Kahan summation) until it amounts to a whole step, so time always runs at the right average
 * rate, just in coarser ticks.
 */
export function advanceClock(seconds: number): number {
  if (!(seconds !== 0) || !Number.isFinite(seconds)) return 0;
  const before = sim.timeMs;
  const y = seconds * 1000 + sim.timeCarryMs;
  const t = before + y;
  if (t > TIME_MAX_MS || t < TIME_MIN_MS) {
    setSimTime(t > TIME_MAX_MS ? TIME_MAX_MS : TIME_MIN_MS);
    setPaused(true);
    return (sim.timeMs - before) / 1000;
  }
  sim.timeCarryMs = y - (t - before);
  sim.timeMs = t;
  return seconds;
}

/** Jump forward in simulated time (used by "jump to arrival"). */
export function advanceTime(seconds: number): void {
  if (!(seconds > 0)) return;
  sim.live = false;
  advanceClock(seconds);
}
