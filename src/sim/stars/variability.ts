/**
 * The variable stars' light each frame (variables.ts; docs/data/stars.md §15): their records' `luminous` V and
 * temperature and, for the pulsators that have one, their radius are rewritten, so the point of light (scene/Glints.tsx)
 * and the disc up close (scene/Bodies.tsx StarBody) both follow. Nothing to switch on: they just vary.
 *
 * What the camera sees is the light that left the star a light-time ago: the phase shown is the one at the date minus
 * the camera's light-time plus the Sun's (the ephemerides are what reaches Earth), so from Earth the curves keep their
 * published times and from elsewhere they are shifted by the difference. Algol's eclipses are worked out from its three
 * stars where they were when that light left, seen from the camera: from another direction they are shallower, or
 * missing.
 *
 * Cost: eight stars a frame, a few dozen operations each, and for Algol two Kepler solutions and six eclipse tests (64
 * rings each, only while one star overlaps another on the sky).
 */
import { C_KM_S } from '../../physics/constants';
import { getBody } from '../bodies';
import { sim } from '../sim';
import { AU_KM, SUN_RADIUS_KM } from './constants';
import { worldToEcliptic, type Vec3 } from './frames';
import { limbDarkening, loggCgs } from './closeup';
import { orbitStateInto, type OrbitJson } from './orbits';
import {
  ALGOL_EPHEMERIS,
  ALGOL_STARS,
  algolMembersAu,
  algolOrbits,
  betaLyrV,
  BETA_LYR_DEF,
  betelgeuseV,
  hiddenShare,
  polarisDeltaV,
  pulsatorAt,
  PULSATORS,
} from './variables';
import { updateSunFuture } from './sunFuture';
import { updateDrift } from './drift';

const DAY_S = 86_400;
const jdOf = (ms: number): number => ms / 86_400_000 + 2_440_587.5;

const ORBITS: OrbitJson[] = algolOrbits();
const solve = (o: OrbitJson, jd: number, out: number[]): void => orbitStateInto(o, jd, out, null);
const R_AU = SUN_RADIUS_KM / AU_KM;
const uV = (s: { teffK: number; radiusRsun: number; massMsun: number }) => limbDarkening(s.teffK, loggCgs(s.massMsun, s.radiusRsun))[1];
const ALGOL = {
  a: { radius: ALGOL_STARS.a.radiusRsun * R_AU, u: uV(ALGOL_STARS.a) },
  b: { radius: ALGOL_STARS.b.radiusRsun * R_AU, u: uV(ALGOL_STARS.b) },
  c: { radius: ALGOL_STARS.c.radiusRsun * R_AU, u: uV(ALGOL_STARS.c) },
};

/** The light-time offset (days) of what the camera sees of a body at `pos` (world km): its Sun distance less the camera's, over c. */
function seenOffsetDays(pos: { x: number; y: number; z: number; length(): number; distanceTo(v: unknown): number }): number {
  return (pos.length() - pos.distanceTo(sim.camera.pos)) / C_KM_S / DAY_S;
}

/** Each variable's own M_V and its distance modulus from the Sun (for V → M_V), kept from its record when first seen. */
const base = new Map<string, { absMag: number; dm: number }>();
function baseOf(id: string): { absMag: number; dm: number } | null {
  const rec = getBody(id);
  if (!rec?.star) return null;
  let b = base.get(id);
  if (!b || b.absMag !== rec.star.absMagV) {
    b = { absMag: rec.star.absMagV, dm: rec.star.vFromSun - rec.star.absMagV };
    base.set(id, b);
  }
  return b;
}

/** Algol's three stars, each dimmed by what the others hide of it from the camera. */
function updateAlgol(jd: number): void {
  const a = sim.bodies['algol-a'];
  if (!a?.present || !getBody('algol-b') || !getBody('algol-c')) return;
  const D = a.pos.length() / C_KM_S / DAY_S;
  // Where they were when the light the camera sees left them (the orbit runs a light-time D/c ahead of the date: records.ts).
  const seen = algolMembersAu(jd + seenOffsetDays(a.pos), ORBITS, solve);
  // The camera relative to the triple's centre, au: from Algol A, whose offset from the centre is the provider's.
  const now = algolMembersAu(jd + D, ORBITS, solve);
  const rel = worldToEcliptic([sim.camera.pos.x - a.pos.x, sim.camera.pos.y - a.pos.y, sim.camera.pos.z - a.pos.z]);
  const obs: Vec3 = [rel[0] / AU_KM + now.a[0], rel[1] / AU_KM + now.a[1], rel[2] / AU_KM + now.a[2]];
  const A = { pos: seen.a, ...ALGOL.a };
  const B = { pos: seen.b, ...ALGOL.b };
  const C = { pos: seen.c, ...ALGOL.c };
  const set = (id: string, lit: number) => {
    const b = baseOf(id);
    const lum = getBody(id)?.physical.luminous;
    if (b && lum) lum.vmag = b.absMag - 2.5 * Math.log10(Math.max(lit, 1e-6));
  };
  set('algol-a', 1 - hiddenShare(A, B, obs) - hiddenShare(A, C, obs));
  set('algol-b', 1 - hiddenShare(B, A, obs) - hiddenShare(B, C, obs));
  set('algol-c', 1 - hiddenShare(C, A, obs) - hiddenShare(C, B, obs));
}

/** Once a frame, after the ephemeris (scene/SimDriver.tsx). */
export function updateVariableStars(): void {
  const jd = jdOf(sim.timeMs);
  updateAlgol(jd);
  for (const d of PULSATORS) {
    const b = sim.bodies[d.id];
    const rec = getBody(d.id);
    const bs = baseOf(d.id);
    if (!b?.present || !rec?.physical.luminous || !bs) continue;
    const st = pulsatorAt(d, jd + seenOffsetDays(b.pos));
    rec.physical.luminous.vmag = st.v - bs.dm;
    if (st.teffK !== null) rec.physical.luminous.teffK = st.teffK;
    if (st.radiusRsun !== null) rec.physical.radiusKm = st.radiusRsun * SUN_RADIUS_KM;
  }
  const single = (id: string, v: (jd: number) => number) => {
    const b = sim.bodies[id];
    const lum = getBody(id)?.physical.luminous;
    const bs = baseOf(id);
    if (b?.present && lum && bs) lum.vmag = v(jd + seenOffsetDays(b.pos)) - bs.dm;
  };
  single(BETA_LYR_DEF.id, betaLyrV);
  single('betelgeuse', betelgeuseV);
  // Polaris: its catalogue V, which is its mean, plus the pulsation.
  const pol = baseOf('polaris');
  if (pol) single('polaris', (t) => pol.absMag + pol.dm + polarisDeltaV(t));
}

const fmtV = (v: number) => v.toFixed(v < 0 ? 1 : 2).replace('-', '−');

/** The card's live words on a variable at the date shown, as seen from Earth: its V now, and for Algol the next eclipse. */
export function variableNow(id: string): string | null {
  const jd = jdOf(sim.timeMs);
  if (id === 'algol-a' || id === 'algol-b') {
    const P = ALGOL_EPHEMERIS.periodDays;
    const n = Math.ceil((jd - ALGOL_EPHEMERIS.minJd) / P);
    const next = ALGOL_EPHEMERIS.minJd + n * P;
    const since = jd - (next - P);
    if (since < 0.2) return 'In eclipse now, as seen from Earth.';
    const ms = (next - 2_440_587.5) * 86_400_000;
    const d = new Date(ms);
    if (!Number.isFinite(ms) || Math.abs(d.getUTCFullYear()) > 9999) return null;
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `Next eclipse seen from Earth: ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}, ${hh}:${mm} UTC.`;
  }
  let v: number | null = null;
  const d = PULSATORS.find((p) => p.id === id);
  if (d) v = pulsatorAt(d, jd).v;
  else if (id === BETA_LYR_DEF.id) v = betaLyrV(jd);
  else if (id === 'betelgeuse') v = betelgeuseV(jd);
  else if (id === 'polaris') {
    const s = getBody('polaris')?.star;
    if (s) v = s.vFromSun + polarisDeltaV(jd);
  }
  return v === null ? null : `Now V = ${fmtV(v)} as seen from Earth.`;
}

/** The stars' changes in time, once a frame: the variables' light, the Sun at the age it is shown (sunFuture.ts), and the constellations' journey's clock (drift.ts). */
export function updateStarTime(): void {
  updateVariableStars();
  updateSunFuture();
  updateDrift();
}
