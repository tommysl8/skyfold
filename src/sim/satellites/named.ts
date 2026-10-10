/**
 * The three named craft's elements: fetched from CelesTrak (celestrak.ts), set up for SGP4, and given to their
 * providers (index.ts). Part of the satellites' chunk.
 */
import type { AstroTime } from 'astronomy-engine';
import { replaceBodies, type Vec3Like } from '../bodies';
import { fetchGp, isFailure } from './celestrak';
import { notifySatellites, namedRecord, satellites, SHOWN_DAYS } from './index';
import { parseOmmCsv, type GpRecord } from './omm';
import { NAMED_CRAFT, positionNoteOf } from './records';
import { propagate, sgp4init, type SatRec } from './sgp4';
import { applyMat3, minutesSinceEpoch, temeToEcliptic } from './teme';

const m = new Float64Array(9);

/**
 * A placer for one element set: SGP4 at `time` (held at ±SHOWN_DAYS from the epoch, where the body is hidden
 * anyway, so the provider stays finite), rotated from TEME to the J2000 ecliptic. Allocation-free.
 */
export function sgp4Placer(rec: SatRec): (time: AstroTime, pos: Vec3Like, vel?: Vec3Like | null) => void {
  const r = new Float64Array(3);
  const v = new Float64Array(3);
  const limit = SHOWN_DAYS * 1440;
  return (time, pos, vel) => {
    const t = Math.min(Math.max(minutesSinceEpoch(time, rec.epochJd), -limit), limit);
    const err = propagate(rec, t, r, v);
    // A decayed orbit (6) still writes its last state; on the others r and v keep the last good one.
    if (err && err !== 6 && r[0] === 0 && r[1] === 0 && r[2] === 0) r[0] = 6378.135;
    temeToEcliptic(time, m);
    applyMat3(m, r[0], r[1], r[2], pos);
    if (vel) applyMat3(m, v[0], v[1], v[2], vel);
  };
}

export async function loadNamedCraft(): Promise<void> {
  if (satellites.namedStatus === 'loading' || satellites.namedStatus === 'ready') return;
  satellites.namedStatus = 'loading';
  const wanted = new Map<string, GpRecord>();
  const errors: string[] = [];
  const queries = [...new Map(NAMED_CRAFT.map((c) => [JSON.stringify(c.query), c.query])).values()];
  const answers = await Promise.all(queries.map((q) => fetchGp(q)));
  for (const a of answers) {
    if (isFailure(a)) errors.push(a.error);
    else for (const gp of parseOmmCsv(a.text)) wanted.set(String(gp.norad), gp);
  }
  const replace = [];
  for (const c of NAMED_CRAFT) {
    const gp = wanted.get(String(c.norad));
    if (!gp) continue;
    const rec = sgp4init(gp);
    if (rec.error) continue;
    satellites.named.set(c.id, { rec, epochJd: gp.epochJd, launchMs: Date.parse(c.mission.launch), place: sgp4Placer(rec) });
    replace.push(namedRecord(c, positionNoteOf(gp)));
  }
  if (replace.length) replaceBodies(replace);
  satellites.namedStatus = satellites.named.size ? 'ready' : 'error';
  satellites.namedError = errors[0] ?? (satellites.named.size ? null : 'its orbital elements were not in CelesTrak’s answer.');
  notifySatellites();
}
