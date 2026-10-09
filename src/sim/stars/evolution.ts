/**
 * Stellar evolution: a star's luminosity, temperature, radius and mass through its life, from published tracks
 * (public/data/stellar-tracks.json: MIST v1.2 at solar metallicity, Choi et al. 2016, ApJ 823, 102; built by
 * scripts/build-stellar-tracks.mjs; docs/data/stars.md §14). Pure functions of the table: the tests read it from disk.
 *
 * A track is a list of equivalent evolutionary points (EEPs): the same stage of life has the same EEP number on every
 * track (202 the zero-age main sequence, 454 the end of core hydrogen burning, 605 the tip of the red-giant branch, 631
 * the start of core helium burning, 707 its end, 808 the first thermal pulse on the AGB, 1409 the end of the AGB, 1710
 * the start of the white-dwarf cooling sequence). Between the points kept, every quantity is interpolated linearly in
 * EEP; a mass between two tracks is interpolated at equal EEP, linearly in log M (log L, log T, log R, log age, and the
 * mass as a share of the initial mass), as MIST's own interpolator does.
 *
 * The Sun: the 1 M☉ track, scaled so that at the Sun's age today (4.57 Gyr) it has exactly the nominal solar radius,
 * luminosity and temperature (the track gives 1.024 R☉, 1.105 L☉ and 5,849 K then: its Sun is 1.00 M☉ of slightly
 * different make-up). After the track ends, at the start of the white-dwarf cooling sequence, the white dwarf cools as
 * Mestel's law has it (L ∝ t^(−7/5)), anchored to Sirius B and contracting to the cold radius of its mass: a model.
 *
 * Planets: when a star loses mass slowly (over many orbits), each orbit widens keeping a·M constant (a ∝ 1/M; the
 * adiabatic invariant of Jeans 1924, as applied to the Sun's planets by Sackmann et al. 1993 and Schröder & Smith 2008),
 * the speed falling as v ∝ M and the period growing as P ∝ 1/M². Tides and the drag of the Sun's wind are not
 * modelled: they pull planets in (Schröder & Smith 2008 find Earth engulfed near the tip of the red-giant branch).
 */
import { SUN_RADIUS_KM, SUN_TEFF_K } from './constants';
import { bolometricCorrection, SUN_M_BOL } from './photometry';

/** The file's columns per row: EEP, age (yr), mass (M☉), log L/L☉, log T_eff (K), log R/R☉, MIST phase code. */
export type TrackRow = [number, number, number, number, number, number, number];

export interface TrackFile {
  format: 'skyfold.stellar-tracks';
  version: number;
  source: string;
  columns: string[];
  phases: Record<string, string>;
  tracks: { massMsun: number; type: string; primaryEeps: number[]; rows: TrackRow[] }[];
}

export interface Track {
  massMsun: number;
  primaryEeps: readonly number[];
  eep: Float64Array;
  ageYr: Float64Array;
  massNow: Float64Array;
  logL: Float64Array;
  logT: Float64Array;
  logR: Float64Array;
  phase: Int8Array;
}

/** A star at one point of its track. */
export interface TrackState {
  eep: number;
  ageYr: number;
  massMsun: number;
  logL: number;
  logTeff: number;
  logR: number;
  /** MIST's phase code: −1 pre-main sequence, 0 main sequence, 2 red giant, 3 core helium burning, 4 early AGB, 5 thermally pulsing AGB, 6 post-AGB and white dwarf, 9 Wolf–Rayet. */
  phase: number;
}

/** MIST's primary EEPs. */
export const EEP = { zams: 202, iams: 353, tams: 454, rgbTip: 605, zahb: 631, tahb: 707, tpagb: 808, postAgb: 1409, wd: 1710 } as const;

/** The tracks of a file, in order of mass. */
export function decodeTracks(file: TrackFile): Track[] {
  return file.tracks
    .map((t) => {
      const n = t.rows.length;
      const col = (k: number) => Float64Array.from(t.rows, (r) => r[k]);
      return {
        massMsun: t.massMsun,
        primaryEeps: t.primaryEeps,
        eep: col(0),
        ageYr: col(1),
        massNow: col(2),
        logL: col(3),
        logT: col(4),
        logR: col(5),
        phase: Int8Array.from({ length: n }, (_, i) => t.rows[i][6]),
      };
    })
    .sort((a, b) => a.massMsun - b.massMsun);
}

/** First and last EEP of a track. */
export const eepRange = (t: Track): [number, number] => [t.eep[0], t.eep[t.eep.length - 1]];

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

/** The track at an EEP (clamped to the track's ends), interpolated linearly in EEP. */
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

/** The (fractional) EEP a star of this track has at an age, yr (clamped to the track). Ages rise along a track. */
export function eepAtAge(t: Track, ageYr: number): number {
  const k = bracket(t.ageYr, ageYr);
  const a0 = t.ageYr[k];
  const a1 = t.ageYr[k + 1];
  const f = Math.min(1, Math.max(0, (ageYr - a0) / (a1 - a0)));
  return t.eep[k] + (t.eep[k + 1] - t.eep[k]) * f;
}

/** The track at an age, yr. */
export const stateAtAge = (t: Track, ageYr: number, out?: TrackState): TrackState => stateAtEep(t, eepAtAge(t, ageYr), out);

/**
 * The track of a star of any initial mass inside the grid: interpolated at equal EEP between the two tracks around it,
 * linearly in log M (to the end of the shorter of the two). Outside the grid, the nearest track.
 */
export function trackForMass(tracks: readonly Track[], massMsun: number): Track {
  if (massMsun <= tracks[0].massMsun) return tracks[0];
  const last = tracks[tracks.length - 1];
  if (massMsun >= last.massMsun) return last;
  let j = 0;
  while (tracks[j + 1].massMsun < massMsun) j++;
  const a = tracks[j];
  const b = tracks[j + 1];
  if (b.massMsun === massMsun) return b;
  const w = Math.log(massMsun / a.massMsun) / Math.log(b.massMsun / a.massMsun);
  const end = Math.min(a.eep[a.eep.length - 1], b.eep[b.eep.length - 1]);
  const eeps = [...new Set([...a.eep, ...b.eep])].filter((e) => e <= end).sort((x, y) => x - y);
  const n = eeps.length;
  const out: Track = {
    massMsun,
    primaryEeps: a.primaryEeps.filter((e) => e <= end),
    eep: Float64Array.from(eeps),
    ageYr: new Float64Array(n),
    massNow: new Float64Array(n),
    logL: new Float64Array(n),
    logT: new Float64Array(n),
    logR: new Float64Array(n),
    phase: new Int8Array(n),
  };
  const sa = {} as TrackState;
  const sb = {} as TrackState;
  for (let i = 0; i < n; i++) {
    stateAtEep(a, eeps[i], sa);
    stateAtEep(b, eeps[i], sb);
    const mix = (x: number, y: number) => x + (y - x) * w;
    out.ageYr[i] = 10 ** mix(Math.log10(sa.ageYr), Math.log10(sb.ageYr));
    out.massNow[i] = massMsun * mix(sa.massMsun / a.massMsun, sb.massMsun / b.massMsun);
    out.logL[i] = mix(sa.logL, sb.logL);
    out.logT[i] = mix(sa.logTeff, sb.logTeff);
    out.logR[i] = mix(sa.logR, sb.logR);
    out.phase[i] = w < 0.5 ? sa.phase : sb.phase;
  }
  // Interpolated ages must still rise along the track.
  for (let i = 1; i < n; i++) if (out.ageYr[i] <= out.ageYr[i - 1]) out.ageYr[i] = out.ageYr[i - 1] * (1 + 1e-12);
  return out;
}

// ─── Words ───────────────────────────────────────────────────────────────────────────────

/** A post-AGB star lights its nebula once hotter than this, K (it ionises hydrogen: Kwok 2000, The Origin and Evolution of Planetary Nebulae). */
export const PN_IONISING_K = 25_000;
/** How long after leaving the AGB a planetary nebula is shown, yr: they last a few tens of thousands of years (Kwok 2000). */
export const PN_VISIBLE_YR = 50_000;
/** The nebula's expansion speed, km/s: typical of planetary nebulae, 20–40 km/s (a model). */
export const PN_EXPANSION_KMS = 25;

/** Stars below this initial mass ignite helium in a degenerate core, in a flash (about 2 M☉ at solar metallicity). */
export const HELIUM_FLASH_MAX_MSUN = 1.8;

/**
 * The stage of life at an EEP, in a few words. The subgiant stretch runs from the end of core hydrogen burning until the
 * star has doubled its luminosity (the base of the red-giant branch, approximately); the planetary-nebula stretch is the
 * post-AGB star hotter than 25,000 K, hot enough to light its ejected envelope, for the first PN_VISIBLE_YR after it left
 * the AGB (by then the nebula has spread out and faded); after that it is a white dwarf.
 */
export function stageOf(t: Track, eep: number, s: TrackState = stateAtEep(t, eep)): string {
  const low = t.massMsun <= HELIUM_FLASH_MAX_MSUN;
  if (eep < EEP.zams) return 'Pre-main sequence';
  if (eep < EEP.tams) return 'Main sequence';
  if (eep < EEP.rgbTip) {
    const lTams = stateAtEep(t, EEP.tams).logL;
    if (s.logL < lTams + Math.log10(2)) return low ? 'Subgiant' : 'Leaving the main sequence';
    return low ? 'Red giant' : 'Giant';
  }
  if (eep < EEP.zahb) return low ? 'Helium flash' : 'Helium ignition';
  if (eep < EEP.tahb) return low ? 'Horizontal branch (red clump)' : 'Core helium burning';
  if (eep < EEP.tpagb) return 'Asymptotic giant branch';
  if (eep < EEP.postAgb) return 'Thermally pulsing AGB';
  if (s.logTeff < Math.log10(PN_IONISING_K)) return eep < EEP.wd ? 'Leaving the AGB' : 'White dwarf';
  return eep < EEP.wd && s.ageYr - stateAtEep(t, EEP.postAgb).ageYr < PN_VISIBLE_YR ? 'Planetary nebula' : 'White dwarf';
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
  /** The last EEP and age of the track (the start of the white-dwarf cooling sequence). */
  endEep: number;
  endAgeYr: number;
  /** The age at which the Sun's life is followed to (the track's end plus WD_COOLING_SHOWN_YR). */
  lastAgeYr: number;
  /** When it left the AGB (EEP 1409), and when its envelope was gone (its mass within 0.001 M☉ of the white dwarf's), yr. */
  agbEndYr: number;
  ejectedYr: number;
}

export function sunModel(tracks: readonly Track[]): SunModel {
  const track = tracks.find((t) => t.massMsun === 1) ?? trackForMass(tracks, 1);
  const today = stateAtAge(track, SUN_AGE_TODAY_YR);
  const n = track.eep.length - 1;
  const agbEndYr = stateAtEep(track, EEP.postAgb).ageYr;
  let k = 0;
  while (k < n && (track.ageYr[k] < agbEndYr || track.massNow[k] - track.massNow[n] > 0.001)) k++;
  return { track, today, endEep: track.eep[n], endAgeYr: track.ageYr[n], lastAgeYr: track.ageYr[n] + WD_COOLING_SHOWN_YR, agbEndYr, ejectedYr: track.ageYr[k] };
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

/** The luminosity (L☉) after cooling for `yr` by Mestel's law, the inverse of mestelCoolingYr. */
export const mestelLuminosity = (massMsun: number, yr: number): number =>
  SIRIUS_B.lsun * (yr / (SIRIUS_B.coolingYr * (massMsun / SIRIUS_B.massMsun) ** (5 / 7))) ** (-7 / 5);

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
 * The Sun's planetary nebula at an age: its envelope, shed on the AGB, expanding at PN_EXPANSION_KMS since it was gone
 * (outer radius, au; the shell is drawn from 0.6 of it), and how brightly it glows (0–1): lit once the star is hotter than
 * PN_IONISING_K, fading as it spreads, gone PN_VISIBLE_YR after the AGB. Null when there is none. A model; that a star of
 * the Sun's mass makes a visible nebula at all is Gesicki et al.'s (2018, Nature Astronomy 2, 580) finding.
 */
export function planetaryNebula(m: SunModel, ageYr: number): { radiusAu: number; glow: number } | null {
  const since = ageYr - m.ejectedYr;
  const sinceAgb = ageYr - m.agbEndYr;
  if (since <= 0 || sinceAgb >= PN_VISIBLE_YR || ageYr > m.endAgeYr) return null;
  const s = stateAtAge(m.track, ageYr);
  const t = 10 ** s.logTeff;
  const smooth = (a: number, b: number, x: number) => {
    const f = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return f * f * (3 - 2 * f);
  };
  const glow = smooth(0.8 * PN_IONISING_K, 1.2 * PN_IONISING_K, t) * (1 - smooth(0.6 * PN_VISIBLE_YR, PN_VISIBLE_YR, sinceAgb));
  return { radiusAu: (PN_EXPANSION_KMS * since * YEAR_S) / AU_KM_EXACT, glow };
}
