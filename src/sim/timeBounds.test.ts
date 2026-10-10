/**
 * A guard for every model that grows or moves with the simulation's clock: swept from the Big Bang to the clock's end
 * (sim/clock.ts TIME_MIN_MS, TIME_MAX_MS), each stays finite and bounded, or is hidden outside the time it is valid for.
 * A model added later that grows with the clock belongs here.
 */
import { describe, expect, it } from 'vitest';
import { C_KM_S } from '../physics/constants';
import { msFromCivil } from '../lib/time';
import { TIME_MAX_MS, TIME_MIN_MS } from './clock';
import { grownShare, modelDrawn, pictureShare, remnantEvolution, remnantRadiusKm, supernovaAt, SUPERNOVAE } from './phenomena/supernovae';
import { BLUE_BETA, KN_DRAWN_DAYS, kilonovaAt, MERGER_MS } from './phenomena/kilonova';
import { HOMUNCULUS_AGE_YR, HOMUNCULUS_FADE_YR, homunculusFade, homunculusScale, wr104ArmAngleDeg } from './stars/stellarNebulae';
import { planetaryNebula, PN_VISIBLE_YR, sunModel } from './stars/evolution';
import { beyondOpenOrbit, OPEN_ORBIT_YEARS, voyager1Provider } from './bodies';

const YEAR_MS = 365.25 * 86_400_000;
const NOW_MS = msFromCivil(2026, 1, 1);

/** Dates from the clock's start to its end: today ± 10^k years, k from −2 to 13 in small steps, and the limits. */
function dates(): number[] {
  const out = [TIME_MIN_MS, TIME_MAX_MS, NOW_MS, msFromCivil(1e6, 1, 1), msFromCivil(1e9, 1, 1), msFromCivil(19.3e9, 1, 1), msFromCivil(-1e9, 1, 1), msFromCivil(1e10, 1, 1), msFromCivil(-1e10, 1, 1)];
  for (let k = -2; k <= 13; k += 0.05) {
    const d = 10 ** k * YEAR_MS;
    if (NOW_MS + d <= TIME_MAX_MS) out.push(NOW_MS + d);
    if (NOW_MS - d >= TIME_MIN_MS) out.push(NOW_MS - d);
  }
  return out;
}
const DATES = dates();
const finite = (x: number) => Number.isFinite(x);

describe('models that grow with the clock stay bounded or hidden at every date', () => {
  it('the supernovae’s remnants: no larger than at their merger with the gas, and not drawn after it', () => {
    for (const sn of SUPERNOVAE) {
      const ev = remnantEvolution(sn);
      for (const ms of DATES) {
        const st = supernovaAt(sn, ms);
        for (const v of [st.shockKm, st.photosphereKm, st.fade, st.glow, st.ageS]) expect(finite(v), `${sn.id} ${ms}`).toBe(true);
        expect(st.shockKm).toBeLessThanOrEqual(ev.rMergeKm * (1 + 1e-9));
        if (st.fade > 0) expect(st.ageS).toBeLessThan(ev.tMergeS);
        // Drawn only while its glow can be seen, under a hundred times t_PDS.
        if (modelDrawn(st)) expect(st.ageS).toBeLessThan(100 * ev.tPdsS);
        expect(st.glow).toBeLessThanOrEqual(st.fade);
      }
    }
  });

  it('the remnants’ pictures: at most a few times today’s size while drawn, none outside their range', () => {
    for (const sn of SUPERNOVAE) {
      if (!sn.remnant.bodyId) continue;
      for (const ms of DATES) {
        const share = pictureShare(sn, ms);
        expect(finite(share)).toBe(true);
        const g = grownShare(sn, ms);
        expect(finite(g)).toBe(true);
        if (share > 0 && sn.pictureRemnant) expect(g, `${sn.id} ${ms}`).toBeLessThan(10);
        if (ms > msFromCivil(13_000, 1, 1)) expect(share, sn.id).toBe(0);
      }
      expect(remnantRadiusKm(sn)).toBeGreaterThan(0);
    }
  });

  it('the kilonova’s debris: its size held after it has faded, and not drawn after three years', () => {
    const maxKm = BLUE_BETA * C_KM_S * KN_DRAWN_DAYS[1] * 86_400 * (1 + 1e-9);
    for (const ms of DATES) {
      const k = kilonovaAt(ms);
      for (const v of [k.blueKm, k.redKm, k.photosphereKm, k.lErgS, k.teffK, k.shown]) expect(finite(v), `${ms}`).toBe(true);
      expect(k.blueKm).toBeLessThanOrEqual(maxKm);
      expect(k.redKm).toBeLessThanOrEqual(k.blueKm);
      if (ms > MERGER_MS + KN_DRAWN_DAYS[1] * 86_400_000) expect(k.shown).toBe(0);
    }
  });

  it('Eta Carinae’s Homunculus: held at its size of a few thousand years, and not drawn after', () => {
    for (const ms of DATES) {
      const year = 1970 + ms / YEAR_MS;
      const s = homunculusScale(year);
      expect(finite(s)).toBe(true);
      expect(s).toBeLessThanOrEqual(HOMUNCULUS_FADE_YR[1] / HOMUNCULUS_AGE_YR);
      if (year > 1845.2 + HOMUNCULUS_FADE_YR[1]) expect(homunculusFade(year)).toBe(0);
    }
    expect(homunculusFade(2026)).toBe(1);
  });

  it('bodies on open orbits (Voyager 1, interstellar visitors): followed for a million years either side of now', () => {
    expect(voyager1Provider.availability(NOW_MS).available).toBe(true);
    expect(beyondOpenOrbit(msFromCivil(2000 + OPEN_ORBIT_YEARS - 10, 1, 1))).toBe(false);
    for (const ms of DATES) {
      if (beyondOpenOrbit(ms)) expect(voyager1Provider.availability(ms).available).toBe(false);
      else if (ms > NOW_MS) expect(voyager1Provider.availability(ms).available).toBe(true);
    }
  });

  it('WR 104’s pinwheel: its arms only turn (their angle stays an angle at any date)', () => {
    for (const ms of DATES) {
      const a = wr104ArmAngleDeg(100, ms / 86_400_000 + 2_440_587.5);
      expect(finite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    }
  });

  it('the Sun’s planetary nebula: gone 30,000 years after it is lit', () => {
    const sun = sunModel();
    let maxAu = 0;
    for (let age = sun.leaveYr - 1e4; age < sun.ionYr + 2 * PN_VISIBLE_YR; age += 100) {
      const pn = planetaryNebula(sun, age);
      if (!pn) continue;
      expect(finite(pn.radiusAu)).toBe(true);
      maxAu = Math.max(maxAu, pn.radiusAu);
    }
    expect(planetaryNebula(sun, sun.ionYr + PN_VISIBLE_YR + 1)).toBeNull();
    expect(planetaryNebula(sun, 1e13)).toBeNull();
    // Expanding at 25 km/s from when the Sun leaves the AGB to 30,000 years after it is lit: under 2 pc (412,530 au).
    expect(maxAu).toBeLessThan(412_530);
  });
});
