// Cuts the small-body layer (public/data/asteroids/) down to the bodies worth a card, and a sample of the rest:
//   notable (clickable, labelled, found by "Where to?"): every named body, every comet, the near-Earth asteroids of
//     H ≤ 18 (about a kilometre and up), the main-belt, Hilda and Trojan asteroids of H ≤ 11 (about 15 km and up),
//     and the Centaurs and trans-Neptunian objects of H ≤ 7;
//   sample (drawn only: neither clicked, labelled nor searched): one in SAMPLE_EVERY of the others, chosen by a hash of
//     its number or designation, so the belts keep their shape and their texture from afar.
// It reads the layer as it is (built by scripts/build-asteroids.mjs from JPL's SBDB) and writes it again in the same
// format, so it needs no download; build-asteroids.mjs applies the same rule (isNotable, inSample) on a full rebuild.
//
// Run: node scripts/asteroids/notable.mjs   (seconds)
import { readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import * as F from '../../src/sim/asteroids/format.ts';

const DIR = 'public/data/asteroids';
const LOG = 'docs/data/asteroids-build-log.txt';
/** One in this many of the bodies that are not notable is drawn, as a sample. */
export const SAMPLE_EVERY = 20;
const SECTION_MAX = 90_000;
const FILE_MAX_RAW = 1_400_000;
/** The first file (loaded at start): each group's notable bodies brighter than this (H; comets all). */
const FIRST = { neo: 18, main: 14, hilda: 14, trojan: 14, centaur: Infinity, tno: 9, comet: Infinity };

/** Whether a body earns a card: named, a comet, or large for its group (H ≤ the group's limit). */
export function isNotable(group, label, H) {
  if (group === 'comet' || (label.name && label.name.length)) return true;
  if (!Number.isFinite(H)) return false;
  if (group === 'neo') return H <= 18;
  if (group === 'main' || group === 'hilda' || group === 'trojan') return H <= 11;
  return H <= 7;
}

/** Whether a body that is not notable is drawn in the sample: a fixed hash of its number or designation. */
export function inSample(label) {
  const key = label.number ? String(label.number) : label.designation;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % SAMPLE_EVERY === 0;
}

function main() {
  const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8'));
  const total0 = index.total;
  // Every body: its section's head, its columns' values and its label.
  const bodies = [];
  for (const f of index.files) {
    const file = F.decodeOrbitFile(gunzipSync(readFileSync(`${DIR}/${f.file}`)).buffer);
    for (const s of file.sections) {
      const labels = F.parseLabels(gunzipSync(readFileSync(`${DIR}/labels/${s.id}.txt.gz`)).toString('utf8'));
      const group = F.GROUPS[s.group];
      for (let k = 0; k < s.count; k++) {
        const ell = s.shape === F.SHAPE_ELLIPSE;
        const H = ell ? F.unquantH(s.cols.H[k], s.hMin, s.hMax) : F.unquantM1(s.cols.M1[k]);
        const c = s.cols;
        const row = ell
          ? { a: c.a[k], e: c.e[k], i: c.i[k], node: c.node[k], peri: c.peri[k], M: c.M[k] }
          : { q: c.q[k], e: c.e[k], tp: c.tp[k], i: c.i[k], node: c.node[k], peri: c.peri[k], M1: c.M1[k], K1: c.K1[k] };
        // An open-orbit asteroid carries its H as M1 (K1 5): its brightness for the rule.
        const mag = ell ? H : Number.isFinite(H) ? H : 99;
        const r = ell ? { q: c.a[k] * (1 - c.e[k] / 65535), Q: c.a[k] * (1 + c.e[k] / 65535) } : { q: c.q[k], Q: c.e[k] < 1 ? (c.q[k] * (1 + c.e[k])) / (1 - c.e[k]) : Infinity };
        bodies.push({ key: `${s.group}/${s.shape}/${s.frame}`, group, shape: s.shape, frame: s.frame, label: labels[k], mag, row, ...r });
      }
    }
  }
  const notable = bodies.filter((b) => isNotable(b.group, b.label, b.mag));
  const sample = bodies.filter((b) => !isNotable(b.group, b.label, b.mag) && inSample(b.label));

  let nextId = 0;
  const out = [];
  function makeSection(list, isSample) {
    const numbered = list.filter((b) => b.label.number > 0).sort((x, y) => x.label.number - y.label.number);
    const ordered = [...numbered, ...list.filter((b) => !(b.label.number > 0))];
    const n = ordered.length;
    const b0 = ordered[0];
    const mags = ordered.map((b) => b.mag).filter((m) => m < 99);
    const hMin = mags.length ? Math.min(...mags) : 99;
    const hMax = mags.length ? Math.max(...mags) : 99;
    let rMin = Infinity;
    let rMax = 0;
    for (const b of ordered) {
      rMin = Math.min(rMin, b.q);
      rMax = Math.max(rMax, b.Q);
    }
    const head = { group: F.GROUPS.indexOf(b0.group), shape: b0.shape, frame: b0.frame, sample: isSample, count: n, numbered: numbered.length, hMin, hMax, rMin, rMax, id: nextId++ };
    let cols;
    if (b0.shape === F.SHAPE_ELLIPSE) {
      cols = { a: new Float32Array(n), e: new Uint16Array(n), i: new Uint16Array(n), node: new Uint16Array(n), peri: new Uint16Array(n), M: new Uint16Array(n), H: new Uint8Array(n) };
      ordered.forEach((b, k) => {
        for (const c of ['a', 'e', 'i', 'node', 'peri', 'M']) cols[c][k] = b.row[c];
        cols.H[k] = F.quantH(b.mag, hMin, hMax);
      });
    } else {
      cols = { q: new Float32Array(n), e: new Float32Array(n), tp: new Float32Array(n), i: new Uint16Array(n), node: new Uint16Array(n), peri: new Uint16Array(n), M1: new Uint8Array(n), K1: new Uint8Array(n) };
      ordered.forEach((b, k) => {
        for (const c of ['q', 'e', 'tp', 'i', 'node', 'peri', 'M1', 'K1']) cols[c][k] = b.row[c];
      });
    }
    const section = { ...head, cols };
    out.push({ section, ordered });
    return section;
  }
  const split = (list) => {
    const byKey = new Map();
    for (const b of list) {
      if (!byKey.has(b.key)) byKey.set(b.key, []);
      byKey.get(b.key).push(b);
    }
    return [...byKey].sort((x, y) => x[0].localeCompare(y[0])).map(([, l]) => l.sort((x, y) => x.mag - y.mag));
  };
  const pieces = (list) => {
    const n = Math.ceil(list.length / SECTION_MAX);
    const size = Math.ceil(list.length / Math.max(1, n));
    return Array.from({ length: n }, (_, p) => list.slice(p * size, (p + 1) * size));
  };
  const first = [];
  const rest = [];
  for (const list of split(notable)) {
    const cut = FIRST[list[0].group];
    const head = list.filter((b) => b.mag < cut);
    if (head.length) first.push(head);
    rest.push(...pieces(list.filter((b) => b.mag >= cut)).map((l) => [l, false]));
  }
  for (const list of split(sample)) rest.push(...pieces(list).map((l) => [l, true]));

  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(`${DIR}/labels`, { recursive: true });
  const ix = { format: index.format, version: index.version, refEpochJd: index.refEpochJd, files: [] };
  const writeFile = (sections) => {
    const name = `${String(ix.files.length).padStart(2, '0')}.bin.gz`;
    const gz = gzipSync(F.encodeOrbitFile({ refEpochJd: index.refEpochJd, sections }), { level: 9 });
    writeFileSync(`${DIR}/${name}`, gz);
    ix.files.push({ file: name, bytes: gz.length, sections: sections.map(({ cols: _c, ...h }) => ({ ...h, rMax: Number.isFinite(h.rMax) ? h.rMax : null })) });
  };
  writeFile(first.map((l) => makeSection(l, false)));
  rest.sort((x, y) => Number(x[1]) - Number(y[1]) || x[0][0].mag - y[0][0].mag);
  let pack = [];
  let packBytes = 0;
  for (const [list, isSample] of rest) {
    const s = makeSection(list, isSample);
    const bytes = s.count * (s.shape === F.SHAPE_ELLIPSE ? 15 : 22);
    if (pack.length && packBytes + bytes > FILE_MAX_RAW) {
      writeFile(pack);
      pack = [];
      packBytes = 0;
    }
    pack.push(s);
    packBytes += bytes;
  }
  if (pack.length) writeFile(pack);
  if (nextId >= F.NO_SECTION) throw new Error(`${nextId} sections: the names file holds section ids in a byte`);

  // Labels for the notable sections only: the sample's bodies are never clicked or found.
  let maxNumber = 0;
  for (const b of bodies) maxNumber = Math.max(maxNumber, b.label.number);
  const sectionOf = new Uint8Array(maxNumber + 1).fill(F.NO_SECTION);
  const named = new Map();
  const comets = [];
  for (const { section, ordered } of out) {
    if (section.sample) continue;
    writeFileSync(`${DIR}/labels/${section.id}.txt.gz`, gzipSync(Buffer.from(ordered.map((b) => F.formatLabel(b.label)).join('\n') + '\n', 'utf8'), { level: 9 }));
    ordered.forEach((b, k) => {
      if (b.label.number > 0) sectionOf[b.label.number] = section.id;
      if (b.label.name) named.set(b.label.number, b.label.name);
      if (b.group === 'comet' && !b.label.number && /[/]/.test(b.label.designation)) comets.push([b.label.designation, section.id, k]);
    });
  }
  const namesGz = gzipSync(F.encodeNames({ sectionOf, named, comets }), { level: 9 });
  writeFileSync(`${DIR}/names.bin.gz`, namesGz);
  const counts = {};
  for (const b of notable) counts[b.group] = (counts[b.group] ?? 0) + 1;
  ix.counts = counts;
  ix.total = notable.length;
  ix.sampled = sample.length;
  ix.sampleEvery = SAMPLE_EVERY;
  writeFileSync(`${DIR}/index.json`, JSON.stringify(ix) + '\n');

  const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
  const all = ix.files.reduce((s, f) => s + f.bytes, 0);
  const log = [
    `Small bodies cut to the notable ones (scripts/asteroids/notable.mjs), from the full layer of ${total0} bodies`,
    `notable: ${notable.length}`,
    ...F.GROUPS.map((g) => `  ${F.GROUP_TEXT[g]}: ${counts[g] ?? 0}`),
    `  of them named: ${named.size}`,
    `sample (drawn only, 1 in ${SAMPLE_EVERY} of the rest): ${sample.length}`,
    `files: ${ix.files.length}, sections: ${nextId}, ${kb(all)} gzip in all, labels and names ${kb(namesGz.length)} + labels`,
    ...ix.files.map((f) => `  ${f.file}: ${kb(f.bytes)}, ${f.sections.map((s) => `${F.GROUPS[s.group]}${s.sample ? ' (sample)' : ''} ${s.count}`).join(', ')}`),
  ];
  writeFileSync(LOG, log.join('\n') + '\n');
  console.log(log.join('\n'));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('notable.mjs')) main();
