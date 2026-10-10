/// <reference lib="webworker" />
/**
 * The satellite swarm's worker: parses CelesTrak's CSVs, sets up SGP4 for every element set, and packs everyone's
 * mean elements at a reference time when asked (swarm.ts), so the main thread never runs 15,000 propagations.
 *
 * In:  { type: 'add', text, debris }          append a set (the active satellites, or a debris group)
 *      { type: 'pack', jd, seq }               mean elements of all at jd (UTC Julian date)
 *      { type: 'info', index }                 one satellite's element set, for its card
 * Out: { type: 'added', count, debrisCount, epochJd }   epochJd: the median epoch of all sets
 *      { type: 'packed', jd, seq, data }       Float32Array of PACK floats per satellite (transferred)
 *      { type: 'info', index, gp, cls }
 */
import { classify, parseOmmCsv, type GpRecord, type SatClass } from './omm';
import { sgp4init, type SatRec } from './sgp4';
import { PACK, packOne } from './swarm';

/** The three drawn as bodies (sim/satellites/records.ts): hidden in the swarm. */
const BODIES = new Set([25544, 48274, 20580]);

const recs: SatRec[] = [];
const gps: GpRecord[] = [];
const classes: SatClass[] = [];
const seen = new Set<number>();
let debrisCount = 0;

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;
  if (msg.type === 'add') {
    for (const gp of parseOmmCsv(msg.text as string)) {
      if (seen.has(gp.norad)) continue;
      seen.add(gp.norad);
      gps.push(gp);
      recs.push(sgp4init(gp));
      classes.push(classify(gp, !!msg.debris));
      if (msg.debris) debrisCount++;
    }
    self.postMessage({ type: 'added', count: gps.length, debrisCount, epochJd: median(gps.map((g) => g.epochJd)) });
  } else if (msg.type === 'pack') {
    const data = new Float32Array(PACK * recs.length);
    for (let k = 0; k < recs.length; k++) {
      if (BODIES.has(gps[k].norad)) continue; // left as zeros: hidden
      packOne(recs[k], classes[k], msg.jd, data, k);
    }
    (self as unknown as Worker).postMessage({ type: 'packed', jd: msg.jd, seq: msg.seq, data }, [data.buffer]);
  } else if (msg.type === 'info') {
    self.postMessage({ type: 'info', index: msg.index, gp: gps[msg.index] ?? null, cls: classes[msg.index] ?? 0 });
  }
};
