/**
 * Stellar evolution: a star's luminosity, temperature, radius and mass through its life, from the analytic single-star
 * evolution formulae of Hurley, Pols & Tout 2000 (MNRAS 315, 543) at solar metallicity, with their mass loss
 * (sse.ts; docs/data/stars.md §14). Pure functions: nothing is downloaded, a track is worked out when first wanted
 * (a few milliseconds) and kept.
 *
 * A track is the life sampled as sse.ts samples it: about 100 points on the main sequence, 40 across the Hertzsprung gap,
 * 150 up the giant branch, 100 through core helium burning, then the AGB step by step to the white dwarf. Between points
 * every quantity is interpolated linearly in the point's index (its "life coordinate", which gives each stage room).
 *
 * The Sun: the 1 M☉ track, scaled so that at the Sun's age today (4.567 Gyr) it has exactly the nominal solar radius,
 * luminosity and temperature (the formulae give 0.96 L☉, 0.98 R☉ and 5,751 K then). After the track ends, at the birth
 * of the white dwarf, it cools as Mestel's law has it (L ∝ t^(−7/5)), anchored to Sirius B and contracting to the cold
 * radius of its mass: a model.
 *
 * Planets: when a star loses mass slowly (over many orbits), each orbit widens keeping a·M constant (a ∝ 1/M; the
 * adiabatic invariant of Jeans 1924, as applied to the Sun's planets by Sackmann et al. 1993 and Schröder & Smith 2008),
 * the speed falling as v ∝ M and the period growing as P ∝ 1/M². Tides and the drag of the Sun's wind are not
 * modelled: they pull planets in (Schröder & Smith 2008 find Mercury, Venus and Earth engulfed near the tip of the
 * red-giant branch).
 */
import { SUN_RADIUS_KM, SUN_TEFF_K } from './constants';
import { bolometricCorrection, SUN_M_BOL } from './photometry';
import { evolve, teffOf, type Kind, type Life } from './sse';

export interface Track {
  massMsun: number;
  /** Point index (the life coordinate). */
  eep: Float64Array;
  ageYr: Float64Array;
  massNow: Float64Array;
  logL: Float64Array;
  logT: Float64Array;
  logR: Float64Array;
  /** Hurley et al.'s evolution type: 0–1 MS, 2 HG, 3 GB, 4 CHeB, 5 EAGB, 6 TPAGB, 10–12 white dwarfs. */
  phase: Int8Array;
  /** Index of the first point of each stage (−1: none). */
  marks: Life['marks'];
  end: Life['end'];
  /** When the star leaves the AGB in earnest (hotter than 10,000 K) and when it lights its nebula (25,000 K), yr; NaN: never. */
  leaveYr: number;
  ionYr: number;
}

/** A star at one point of its track. */
export interface TrackState {
  eep: number;
  ageYr: number;
  massMsun: number;
  logL: number;
  logTeff: number;
  logR: number;
  phase: number;
}

/** A post-AGB star lights its nebula once hotter than this, K (it ionises hydrogen: Kwok 2000, The Origin and Evolution of Planetary Nebulae). */
export const PN_IONISING_K = 25_000;
/** How long a planetary nebula is shown after it is lit, yr: they last a few tens of thousands of years (Kwok 2000). */
export const PN_VISIBLE_YR = 30_000;
/** The nebula's expansion speed, km/s: typical of planetary nebulae, 20–40 km/s (a model). */
export const PN_EXPANSION_KMS = 25;
/** The shell is counted from when the star leaves the AGB in earnest, hotter than this, K (a model). */
const LEAVE_K = 10_000;

/** A track from a life of sse.ts. */
export function trackOf(life: Life): Track {
  const p = life.points;
  const n = p.length;
  const col = (f: (i: number) => number) => Float64Array.from({ length: n }, (_, i) => f(i));
  const ageYr = col((i) => p[i].t * 1e6);
  const logT = col((i) => Math.log10(teffOf(p[i].l, p[i].r)));
  let leaveYr = NaN;
  let ionYr = NaN;
  const agb = life.marks.tpagb >= 0 ? life.marks.tpagb : life.marks.bagb;
  if (agb >= 0)
    for (let i = agb; i < n; i++) {
      if (p[i].k >= 10) break;
      if (Number.isNaN(leaveYr) && logT[i] >= Math.log10(LEAVE_K)) leaveYr = ageYr[i];
      if (Number.isNaN(ionYr) && logT[i] >= Math.log10(PN_IONISING_K)) ionYr = ageYr[i];
    }
  return {
    massMsun: life.m0,
    eep: col((i) => i),
    ageYr,
    massNow: col((i) => p[i].m),
    logL: col((i) => Math.log10(p[i].l)),
    logT,
    logR: col((i) => Math.log10(p[i].r)),
    phase: Int8Array.from(p, (q) => q.k),
    marks: life.marks,
    end: life.end,
    leaveYr,
    ionYr,
  };
}

const cache = new Map<number, Track>();
/** The track of a star of initial mass m (M☉), worked out once and kept (to 0.01 M☉). */
export function lifeTrack(massMsun: number): Track {
  const m = Math.round(massMsun * 100) / 100;
  let t = cache.get(m);
  if (!t) {
    t = trackOf(evolve(m));
    cache.set(m, t);
  }
  return t;
}

/** The range of initial masses a card draws a track for: beyond 20 M☉ the winds sse.ts leaves out (on the MS) reshape a life. */
export const TRACK_MASS_RANGE: readonly [number, number] = [0.5, 20];

/** The track a card draws for a star of this mass (clamped to TRACK_MASS_RANGE). */
export const trackForMass = (massMsun: number): Track => lifeTrack(Math.min(TRACK_MASS_RANGE[1], Math.max(TRACK_MASS_RANGE[0], massMsun)));

/** First and last index of a track. */
export const eepRange = (t: Track): [number, number] => [0, t.eep.length - 1];

/** Index k with xs[k] ≤ x < xs[k+1] (clamped to the ends), by bisection. */
function bracket(xs: Float64Array, x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (x <= xs[0]) return 0;
  if (x >= xs[hi]) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The track at a (fractional) point index, interpolated linearly (clamped to the track's ends). */
export function stateAtEep(t: Track, eep: number, out: TrackState = {} as TrackState): TrackState {
  const k = bracket(t.eep, eep);
  const e0 = t.eep[k];
  const e1 = t.eep[k + 1];
  const f = Math.min(1, Math.max(0, (eep - e0) / (e1 - e0)));
  const lerp = (a: Float64Array) => a[k] + (a[k + 1] - a[k]) * f;
  out.eep = e0 + (e1 - e0) * f;
  out.ageYr = lerp(t.ageYr);
  out.massMsun = lerp(t.massNow);
  out.logL = lerp(t.logL);
  out.logTeff = lerp(t.logT);
  out.logR = lerp(t.logR);
  out.phase = f < 0.5 ? t.phase[k] : t.phase[k + 1];
  return out;
}

/** The (fractional) point index a star of this track has at an age, yr (clamped). Ages rise along a track. */
export function eepAtAge(t: Track, ageYr: number): number {
  const k = bracket(t.ageYr, ageYr);
  const a0 = t.ageYr[k];
  const a1 = t.ageYr[k + 1];
  const f = a1 > a0 ? Math.min(1, Math.max(0, (ageYr - a0) / (a1 - a0))) : 0;
  return t.eep[k] + (t.eep[k + 1] - t.eep[k]) * f;
}

/** The track at an age, yr. */
export const stateAtAge = (t: Track, ageYr: number, out?: TrackState): TrackState => stateAtEep(t, eepAtAge(t, ageYr), out);

// ─── Words ───────────────────────────────────────────────────────────────────────────────

/** Stars below this initial mass ignite helium in a degenerate core, in a flash (Hurley et al.'s M_HeF at Z = 0.02). */
export const HELIUM_FLASH_MAX_MSUN = 1.995;

/**
 * The stage of life at a point, in a few words. The helium flash names the first few points of core helium burning of a
 * low-mass star (the flash itself is instantaneous in the formulae); the planetary nebula is the post-AGB star hotter than
 * 25,000 K for PN_VISIBLE_YR after it gets there.
 */
export function stageOf(t: Track, eep: number, s: TrackState = stateAtEep(t, eep)): string {
  const low = t.massMsun < HELIUM_FLASH_MAX_MSUN;
  const k = s.phase as Kind;
  if (k <= 1) return 'Main sequence';
  if (k === 2) return low ? 'Subgiant' : 'Leaving the main sequence';
  if (k === 3) return low ? 'Red giant' : 'Giant';
  if (k === 4) {
    if (low && eep < t.marks.hei + 3) return 'Helium flash';
    return low ? 'Horizontal branch (red clump)' : 'Core helium burning';
  }
  if (k === 5) return 'Asymptotic giant branch';
  if (k === 6) {
    if (s.logTeff < Math.log10(6000)) return 'Thermally pulsing AGB';
    if (!Number.isNaN(t.ionYr) && s.ageYr >= t.ionYr && s.ageYr - t.ionYr < PN_VISIBLE_YR) return 'Planetary nebula';
    return 'Leaving the AGB';
  }
  return 'White dwarf';
}

// ─── The Sun ─────────────────────────────────────────────────────────────────────────────

/** The Sun's age today, yr (the oldest solids of the Solar System: 4.567 Gyr, Bouvier & Wadhwa 2010, Nature Geosci. 3, 637). */
export const SUN_AGE_TODAY_YR = 4.567e9;

/** Sirius B, the anchor of the white dwarf's cooling: 1.018 M☉, 0.0565 L☉ (log L = −1.248), cooling for 126 Myr (Bond et al. 2017, ApJ 840, 70). */
const SIRIUS_B = { massMsun: 1.018, lsun: 10 ** -1.248, coolingYr: 1.26e8 };

/** Radius of a cold white dwarf of mass M (R☉): Nauenberg 1972 (ApJ 175, 417), μ_e = 2. */
export function whiteDwarfRadiusRsun(massMsun: number): number {
  const x = massMsun / 1.44;
  return 0.0112 * Math.sqrt(Math.max(0, x ** (-2 / 3) - x ** (2 / 3)));
}

/** Mestel cooling: the time to cool to luminosity L (L☉), t ∝ M^(5/7) L^(−5/7), anchored to Sirius B. */
export const mestelCoolingYr = (massMsun: number, lsun: number): number =>
  SIRIUS_B.coolingYr * (massMsun / SIRIUS_B.massMsun) ** (5 / 7) * (lsun / SIRIUS_B.lsun) ** (-5 / 7);

/** The luminosity (L☉) after cooling for `yr` by Mestel's law, the inverse of mestelCoolingYr. */
export const mestelLuminosity = (massMsun: number, yr: number): number =>
  SIRIUS_B.lsun * (yr / (SIRIUS_B.coolingYr * (massMsun / SIRIUS_B.massMsun) ** (5 / 7))) ** (-7 / 5);

/** How long after the track's end the Sun's life is followed: two billion years of cooling. */
export const WD_COOLING_SHOWN_YR = 2e9;

/** The Sun at one age: in solar units of today (the nominal values), and the stage of life. */
export interface SunState {
  ageYr: number;
  eep: number;
  /** Mass, M☉ (of today's Sun). */
  massMsun: number;
  lsun: number;
  rsun: number;
  teffK: number;
  /** Absolute V magnitude (Flower's bolometric corrections as corrected by Torres 2010). */
  absMagV: number;
  stage: string;
  /** How much wider the planets' orbits are than today's: M(today)/M (a ∝ 1/M). */
  orbitScale: number;
}

/** The Sun's track scaled to today's nominal values (see the head of the file). */
export interface SunModel {
  track: Track;
  /** The track at today's age. */
  today: TrackState;
  /** The last point and age of the track (the white dwarf's birth). */
  endEep: number;
  endAgeYr: number;
  /** The age at which the Sun's life is followed to (the track's end plus WD_COOLING_SHOWN_YR). */
  lastAgeYr: number;
  /** When it leaves the AGB (hotter than 10,000 K) and when it lights its nebula (25,000 K), yr. */
  leaveYr: number;
  ionYr: number;
}

export function sunModel(): SunModel {
  const track = lifeTrack(1);
  const today = stateAtAge(track, SUN_AGE_TODAY_YR);
  const n = track.eep.length - 1;
  return { track, today, endEep: track.eep[n], endAgeYr: track.ageYr[n], lastAgeYr: track.ageYr[n] + WD_COOLING_SHOWN_YR, leaveYr: track.leaveYr, ionYr: track.ionYr };
}

/** The Sun's V at the Sun's temperature and luminosity (as M_V), for the brightness of its point. */
const absMagOf = (lsun: number, teffK: number): number => SUN_M_BOL - 2.5 * Math.log10(lsun) - bolometricCorrection(teffK);

/** The Sun at an age (yr): on its track, then (past the track's end) a cooling white dwarf. */
export function sunAt(m: SunModel, ageYr: number): SunState {
  const t = m.today;
  const kL = -t.logL;
  const kR = -t.logR;
  const kT = Math.log10(SUN_TEFF_K) - t.logTeff;
  if (ageYr <= m.endAgeYr) {
    const s = stateAtAge(m.track, ageYr);
    const lsun = 10 ** (s.logL + kL);
    const teffK = 10 ** (s.logTeff + kT);
    return {
      ageYr,
      eep: s.eep,
      massMsun: s.massMsun / t.massMsun,
      lsun,
      rsun: 10 ** (s.logR + kR),
      teffK,
      absMagV: absMagOf(lsun, teffK),
      stage: stageOf(m.track, s.eep, s),
      orbitScale: t.massMsun / s.massMsun,
    };
  }
  // The white dwarf: Mestel cooling from the track's end, its radius easing from the track's last towards the cold radius
  // of its mass over its first hundred million years (a model).
  const end = stateAtEep(m.track, m.endEep);
  const mass = end.massMsun / t.massMsun;
  const l0 = 10 ** (end.logL + kL);
  const t0 = mestelCoolingYr(mass, l0);
  const dt = Math.min(ageYr, m.lastAgeYr) - m.endAgeYr;
  const lsun = mestelLuminosity(mass, t0 + dt);
  const r0 = 10 ** (end.logR + kR);
  const rCold = whiteDwarfRadiusRsun(mass);
  const rsun = rCold + (r0 - rCold) * Math.exp(-dt / 3e7);
  const teffK = SUN_TEFF_K * (lsun / (rsun * rsun)) ** 0.25;
  return { ageYr, eep: m.endEep, massMsun: mass, lsun, rsun, teffK, absMagV: absMagOf(lsun, teffK), stage: 'White dwarf', orbitScale: t.massMsun / end.massMsun };
}

/** The Sun's radius in km at a state. */
export const sunRadiusKm = (s: SunState): number => s.rsun * SUN_RADIUS_KM;

/**
 * The age (yr) at which the Sun first reaches a planet now at `aAu` (its orbit widened as a ∝ 1/M), searching the
 * track's points and refining by bisection, or null if it never does. Tides are left out.
 */
export function engulfmentAgeYr(m: SunModel, aAu: number): number | null {
  const RSUN_AU = SUN_RADIUS_KM / 149_597_870.7;
  const gap = (age: number) => {
    const s = sunAt(m, age);
    return s.rsun * RSUN_AU - aAu * s.orbitScale;
  };
  const ages = m.track.ageYr;
  let prev = SUN_AGE_TODAY_YR;
  for (let k = 0; k < ages.length; k++) {
    if (ages[k] <= prev) continue;
    if (gap(ages[k]) >= 0) {
      let lo = prev;
      let hi = ages[k];
      for (let it = 0; it < 60; it++) {
        const mid = 0.5 * (lo + hi);
        if (gap(mid) >= 0) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    prev = ages[k];
  }
  return null;
}

/** The planets' mean distances today, au (for engulfment; perihelia would make it a little sooner for Mercury). */
export const PLANET_A_AU: Readonly<Record<string, number>> = {
  mercury: 0.387_098,
  venus: 0.723_332,
  earth: 1.000_001,
  mars: 1.523_679,
};

const AU_KM_EXACT = 149_597_870.7;
const YEAR_S = 365.25 * 86_400;

/**
 * The Sun's planetary nebula at an age: its envelope, shed on the AGB, expanding at PN_EXPANSION_KMS since the star left
 * the AGB (outer radius, au; the shell is drawn from 0.6 of it), and how brightly it glows (0–1): lit once the star is
 * hotter than PN_IONISING_K, fading over the last part of PN_VISIBLE_YR. Null when there is none. A model; that a star of
 * the Sun's mass makes a visible nebula at all is Gesicki et al.'s (2018, Nature Astronomy 2, 580) finding.
 */
export function planetaryNebula(m: SunModel, ageYr: number): { radiusAu: number; glow: number } | null {
  if (Number.isNaN(m.leaveYr) || Number.isNaN(m.ionYr)) return null;
  const since = ageYr - m.leaveYr;
  const lit = ageYr - m.ionYr;
  if (since <= 0 || lit >= PN_VISIBLE_YR) return null;
  const s = sunAt(m, ageYr);
  const smooth = (a: number, b: number, x: number) => {
    const f = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return f * f * (3 - 2 * f);
  };
  const glow = smooth(0.8 * PN_IONISING_K, 1.2 * PN_IONISING_K, s.teffK) * (1 - smooth(0.6 * PN_VISIBLE_YR, PN_VISIBLE_YR, lit));
  return { radiusAu: (PN_EXPANSION_KMS * since * YEAR_S) / AU_KM_EXACT, glow };
}
