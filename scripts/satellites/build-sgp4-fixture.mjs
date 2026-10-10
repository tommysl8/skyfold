// Builds src/sim/satellites/__fixtures__/sgp4-verification.json, the test cases of Vallado, Crawford,
// Hujsak & Kelso (2006), "Revisiting Spacetrack Report #3", AIAA 2006-6753: the element sets of
// SGP4-VER.TLE and the reference program's output for them, tcppver.out (WGS-72, improved mode).
//
// Inputs (not committed), in data-raw/sgp4/: SGP4-VER.TLE and tcppver.out from the paper's companion
// code, as redistributed with python-sgp4 (https://github.com/brandon-rhodes/python-sgp4, sgp4/).
//
// Usage: node scripts/satellites/build-sgp4-fixture.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'data-raw', 'sgp4');
const OUT = join(ROOT, 'src', 'sim', 'satellites', '__fixtures__', 'sgp4-verification.json');

const tle = readFileSync(join(RAW, 'SGP4-VER.TLE'), 'utf8').split(/\r?\n/).filter((l) => /^[12] /.test(l));
const sets = {};
for (let i = 0; i < tle.length; i += 2) {
  const l1 = tle[i];
  const l2 = tle[i + 1];
  const satnum = String(parseInt(l1.slice(2, 7), 10));
  sets[satnum] ??= [];
  sets[satnum].push({ line1: l1.slice(0, 69), line2: l2.slice(0, 69) });
}

const cases = [];
let cur = null;
const seen = {};
for (const line of readFileSync(join(RAW, 'tcppver.out'), 'utf8').split(/\r?\n/)) {
  const head = /^\s*(\d+) xx/.exec(line);
  if (head) {
    const satnum = head[1];
    const k = seen[satnum] ?? 0;
    seen[satnum] = k + 1;
    cur = { satnum, ...sets[satnum][k], states: [] };
    cases.push(cur);
    continue;
  }
  const f = line.trim().split(/\s+/).map(Number);
  if (cur && f.length >= 7 && f.slice(0, 7).every(Number.isFinite)) cur.states.push(f.slice(0, 7));
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      source:
        'Vallado, Crawford, Hujsak & Kelso 2006, AIAA 2006-6753: SGP4-VER.TLE and tcppver.out (WGS-72, opsmode i), via python-sgp4 (MIT)',
      columns: ['tsince (min)', 'x', 'y', 'z (km, TEME)', 'vx', 'vy', 'vz (km/s)'],
      cases,
    },
    null,
    0,
  ) + '\n',
);
console.log(`${cases.length} cases, ${cases.reduce((s, c) => s + c.states.length, 0)} states → ${OUT}`);
