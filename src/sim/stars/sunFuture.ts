/**
 * The Sun at another age (docs/data/stars.md §14): the Sun's card and the journey "The Sun's future" show it at any
 * point of its life, from the stellar-evolution formulae of Hurley, Pols & Tout 2000 (evolution.ts, sse.ts), worked out
 * the first time they are wanted.
 * The simulation's clock is not moved: only the Sun's own age is, a separate "stellar age" the card shows.
 *
 * While an age is shown, each frame: the Sun's record takes that age's radius, light, colour and mass (GM); the planets'
 * orbits about it widen as a ∝ 1/M (bodies/world.ts solarAge, which also hides the planets it has swallowed, with their
 * moons); the Sun is drawn with the star-surface material (scene/Bodies.tsx) and its planetary nebula when it has one
 * (scene/StellarNebulae.tsx). Back to today (the record's own values, no widening) when the card's "Today" is pressed,
 * when the Sun's card is closed or another body chosen, or when any scene starts (content/scenes.ts).
 *
 * The journey plays the Sun's life through keyframes in the track's points (each stage gets a few seconds whatever its length in
 * years), easing the camera out to keep the Sun (and later its nebula) framed; any camera move by the visitor hands
 * the view back, leaving the age where it is.
 */
import { AU_KM, GM_SUN_KM3_S2, SUN_RADIUS_KM } from './constants';
import { getBody } from '../bodies';
import { solarAge } from '../bodies/world';
import { useUI } from '../../state/ui';
import { controller } from '../../controls/cameraController';
import { SUN_VMAG_AT_1AU } from '../../physics/constants';
import {
  eepAtAge,
  engulfmentAgeYr,
  PLANET_A_AU,
  planetaryNebula,
  stateAtEep,
  SUN_AGE_TODAY_YR,
  sunAt,
  sunModel,
  type SunModel,
  type SunState,
} from './evolution';

export const sunFuture = {
  /** The age shown, yr; null: the Sun as it is today. */
  ageYr: null as number | null,
  /** The Sun at that age (null today). */
  state: null as SunState | null,
  /** Its planetary nebula at that age, outer radius km and glow 0–1 (null: none). */
  nebula: null as { radiusKm: number; glow: number } | null,
  model: null as SunModel | null,
  /** When each planet is swallowed (yr), from the model. */
  engulfed: [] as { id: string; ageYr: number }[],
  version: 0,
};

const listeners = new Set<() => void>();
export const sunFutureVersion = (): number => sunFuture.version;
export function subscribeSunFuture(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
function changed(): void {
  sunFuture.version++;
  listeners.forEach((f) => f());
}

/** Work out the Sun's track (once, a few milliseconds) and when it reaches each planet. Async for its callers' sake. */
export function loadTracks(): Promise<SunModel> {
  if (!sunFuture.model) {
    sunFuture.model = sunModel();
    sunFuture.engulfed = Object.entries(PLANET_A_AU)
      .map(([id, a]) => ({ id, ageYr: engulfmentAgeYr(sunFuture.model!, a) }))
      .filter((e): e is { id: string; ageYr: number } => e.ageYr !== null);
    changed();
  }
  return Promise.resolve(sunFuture.model);
}

/** The Sun's record as it is today, kept while another age is shown. */
let today: { radiusKm: number; eqKm?: number; polKm?: number; vmag: number; teffK: number; gm?: number } | null = null;

/** Show the Sun at an age (yr), or today (null), ending the journey's play. Loads the tracks first if needed. */
export function setSunAge(ageYr: number | null): void {
  if (ageYr === null) {
    if (sunFuture.ageYr === null) return;
    stopPlay();
    sunFuture.ageYr = null;
    sunFuture.state = null;
    sunFuture.nebula = null;
    restore();
    changed();
    return;
  }
  const m = sunFuture.model;
  if (!m) {
    void loadTracks().then(() => setSunAge(ageYr));
    return;
  }
  // An age chosen (the card's slider) ends the journey's play.
  stopPlay();
  sunFuture.ageYr = Math.min(m.lastAgeYr, Math.max(SUN_AGE_TODAY_YR, ageYr));
  apply();
  changed();
}

function restore(): void {
  const rec = getBody('sun');
  solarAge.scale = 1;
  solarAge.gone.clear();
  if (!rec || !today) return;
  rec.physical.radiusKm = today.radiusKm;
  rec.physical.equatorialRadiusKm = today.eqKm;
  rec.physical.polarRadiusKm = today.polKm;
  rec.physical.gmKm3S2 = today.gm;
  if (rec.physical.luminous) {
    rec.physical.luminous.vmag = today.vmag;
    rec.physical.luminous.teffK = today.teffK;
  }
  today = null;
}

/** The Sun's record, the orbits' widening and the swallowed planets, for the age shown. */
function apply(): void {
  const m = sunFuture.model;
  const rec = getBody('sun');
  const age = sunFuture.ageYr;
  if (!m || !rec?.physical.luminous || age === null) return;
  const p = rec.physical;
  today ??= { radiusKm: p.radiusKm, eqKm: p.equatorialRadiusKm, polKm: p.polarRadiusKm, vmag: p.luminous!.vmag, teffK: p.luminous!.teffK, gm: p.gmKm3S2 };
  const s = sunAt(m, age);
  sunFuture.state = s;
  const k = s.rsun;
  p.radiusKm = today.radiusKm * k;
  if (today.eqKm !== undefined) p.equatorialRadiusKm = today.eqKm * k;
  if (today.polKm !== undefined) p.polarRadiusKm = today.polKm * k;
  p.gmKm3S2 = (today.gm ?? GM_SUN_KM3_S2) * s.massMsun;
  const todayAbs = sunAt(m, SUN_AGE_TODAY_YR).absMagV;
  p.luminous!.vmag = SUN_VMAG_AT_1AU + (s.absMagV - todayAbs);
  p.luminous!.teffK = s.teffK;
  solarAge.scale = s.orbitScale;
  solarAge.gone.clear();
  for (const e of sunFuture.engulfed) if (age >= e.ageYr) solarAge.gone.add(e.id);
  const pn = planetaryNebula(m, age);
  sunFuture.nebula = pn ? { radiusKm: pn.radiusAu * AU_KM, glow: pn.glow } : null;
}

// ─── The journey's play ──────────────────────────────────────────────────────────────────

/**
 * A keyframe: a point of the track (or, in the nebula, years after the star lit it; past the track, years after its end),
 * when the play reaches it (s), and the camera's distance (au).
 */
interface Key {
  eep?: (m: SunModel) => number;
  afterIonYr?: number;
  afterEndYr?: number;
  t: number;
  au: number;
}

const KEYS: readonly Key[] = [
  { eep: (m) => m.today.eep, t: 0, au: 3.2 },
  { eep: (m) => m.track.marks.tms, t: 8, au: 3.2 },
  { eep: (m) => 0.5 * (m.track.marks.bgb + m.track.marks.hei), t: 16, au: 3.4 },
  { eep: (m) => m.track.marks.hei, t: 26, au: 3.8 },
  { eep: (m) => m.track.marks.hei + 3, t: 30, au: 3.8 },
  { eep: (m) => m.track.marks.bagb, t: 35, au: 3.8 },
  { eep: (m) => m.track.marks.tpagb, t: 42, au: 5 },
  { eep: (m) => eepAtAge(m.track, m.ionYr), t: 52, au: 8 },
  { afterIonYr: 5000, t: 58, au: 450_000 },
  { afterIonYr: 22_000, t: 68, au: 700_000 },
  { afterEndYr: 1e6, t: 74, au: 700_000 },
  { afterEndYr: 1e9, t: 86, au: 0.0004 },
];

let play: { startMs: number; moves: number; lastGoal: number } | null = null;

export const sunPlaying = (): boolean => play !== null;
const stopPlay = (): void => {
  play = null;
};

/** The age of a keyframe, yr. */
function keyAge(m: SunModel, k: Key): number {
  if (k.afterEndYr !== undefined) return m.endAgeYr + k.afterEndYr;
  if (k.afterIonYr !== undefined) return m.ionYr + k.afterIonYr;
  return stateAtEep(m.track, k.eep!(m)).ageYr;
}

/** Start the Sun's life from today (the journey; content/scenes.ts frames the camera first). */
export function playSunFuture(): void {
  void loadTracks().then(() => {
    setSunAge(SUN_AGE_TODAY_YR);
    play = { startMs: performance.now(), moves: controller.moves, lastGoal: NaN };
  });
}

/** Where the play is at `s` seconds: the age (log-interpolated between keyframes) and the camera's distance (au). */
export function playAt(m: SunModel, s: number): { ageYr: number; au: number; done: boolean } {
  const last = KEYS[KEYS.length - 1];
  if (s >= last.t) return { ageYr: keyAge(m, last), au: last.au, done: true };
  let i = 0;
  while (KEYS[i + 1].t <= s) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const f = (s - a.t) / (b.t - a.t);
  const e = f * f * (3 - 2 * f);
  const a0 = keyAge(m, a);
  const a1 = keyAge(m, b);
  // Within the track, ages step through its points (so each stage gets its time); in the nebula and the cooling,
  // logarithmically from the stage's start.
  let ageYr: number;
  if (a.eep && b.eep) ageYr = stateAtEep(m.track, a.eep(m) + (b.eep(m) - a.eep(m)) * e).ageYr;
  else {
    const z = b.afterEndYr !== undefined ? m.endAgeYr : m.leaveYr;
    const d0 = Math.max(1, a0 - z);
    const d1 = Math.max(1, a1 - z);
    ageYr = a0 < z ? a0 + (a1 - a0) * e : z + d0 * (d1 / d0) ** e;
  }
  return { ageYr, au: a.au * (b.au / a.au) ** e, done: false };
}


/** Once a frame (scene/SimDriver.tsx through updateStarTime): the play, then the age's effects. */
export function updateSunFuture(): void {
  const ui = useUI.getState();
  if (sunFuture.ageYr !== null && (ui.selected !== 'sun' || !ui.bodyCard)) {
    setSunAge(null);
    return;
  }
  const p = play;
  const m = sunFuture.model;
  if (p && m) {
    const zoomed = Number.isFinite(p.lastGoal) && Math.abs(controller.orbitGoalKm / p.lastGoal - 1) > 1e-6;
    if (controller.moves !== p.moves || controller.target !== 'sun' || zoomed) play = null;
    else {
      const at = playAt(m, (performance.now() - p.startMs) / 1000);
      sunFuture.ageYr = at.ageYr;
      if (controller.zoomTo(at.au * AU_KM)) p.lastGoal = controller.orbitGoalKm;
      if (at.done) play = null;
      changed();
    }
  }
  if (sunFuture.ageYr !== null) apply();
}

// ─── Words ───────────────────────────────────────────────────────────────────────────────

const gyr = (yr: number): string => {
  if (yr >= 1e9) return `${(yr / 1e9).toFixed(2)} billion years`;
  return `${Math.round(yr / 1e6).toLocaleString('en-GB')} million years`;
};

/** The Sun's card line at the age shown: its age, stage and size. */
export function sunAgeLine(): string {
  const s = sunFuture.state;
  if (sunFuture.ageYr === null || !s) return `Age ${gyr(SUN_AGE_TODAY_YR)}: main sequence, halfway through its life.`;
  const ahead = s.ageYr - SUN_AGE_TODAY_YR;
  const size = s.rsun > 20 ? `${(s.rsun * (SUN_RADIUS_KM / AU_KM)).toFixed(2)} au in radius` : s.rsun < 0.05 ? `${Math.round(s.rsun * SUN_RADIUS_KM).toLocaleString('en-GB')} km in radius` : `${s.rsun.toFixed(2)} times today’s size`;
  const when = ahead < 1e6 ? 'today' : `in ${gyr(ahead)}`;
  return `${s.stage}, ${when}: ${size}, ${s.lsun >= 10 ? Math.round(s.lsun).toLocaleString('en-GB') : s.lsun.toPrecision(2)} times today’s light, ${Math.round(s.teffK).toLocaleString('en-GB')} K, ${s.massMsun.toFixed(2)} of its mass.`;
}

/** The planets swallowed by the age shown, in words, or null. */
export function sunSwallowedLine(): string | null {
  const age = sunFuture.ageYr;
  if (age === null) return null;
  const gone = sunFuture.engulfed.filter((e) => age >= e.ageYr).map((e) => e.id[0].toUpperCase() + e.id.slice(1));
  const scale = sunFuture.state?.orbitScale ?? 1;
  const wider = scale > 1.005 ? `The planets’ orbits are ${Math.round((scale - 1) * 100)}% wider than today’s.` : '';
  if (!gone.length) return wider || null;
  // Venus and Earth escape in this model only because their orbits widen; tides would drag them in (not modelled).
  const debated = gone.includes('Earth') ? '' : ' Venus and Earth escape here as their orbits widen; tides, not modelled, may drag them in (Schröder & Smith 2008 find both engulfed).';
  return `${wider} Swallowed: ${gone.join(', ')}.${debated}`.trim();
}

// ─── The card's slider ───────────────────────────────────────────────────────────────────

/** The share of the slider the track takes (its points, so each stage has room); the rest is the white dwarf's cooling, logarithmically. */
const TRACK_SHARE = 0.9;
const WD_FROM_YR = 1e5;

/** The age (yr) at slider position p ∈ [0, 1]: today at 0, two billion years of white dwarf at 1. */
export function ageAtLife(m: SunModel, p: number): number {
  const e0 = m.today.eep;
  if (p <= TRACK_SHARE) return stateAtEep(m.track, e0 + (m.endEep - e0) * (p / TRACK_SHARE)).ageYr;
  const f = (p - TRACK_SHARE) / (1 - TRACK_SHARE);
  return m.endAgeYr + WD_FROM_YR * ((m.lastAgeYr - m.endAgeYr) / WD_FROM_YR) ** f;
}

/** The slider position of an age (the inverse of ageAtLife). */
export function lifeOfAge(m: SunModel, ageYr: number): number {
  const e0 = m.today.eep;
  if (ageYr <= m.endAgeYr) return Math.max(0, (TRACK_SHARE * (eepAtAge(m.track, ageYr) - e0)) / (m.endEep - e0));
  const d = Math.max(WD_FROM_YR, ageYr - m.endAgeYr);
  return TRACK_SHARE + (1 - TRACK_SHARE) * Math.min(1, Math.log(d / WD_FROM_YR) / Math.log((m.lastAgeYr - m.endAgeYr) / WD_FROM_YR));
}
