// Builds public/data/deepsky/magnetars.json.gz: the magnetars of the McGill Online Magnetar Catalog that have a
// distance (the format in src/sim/deepsky/format.ts parseMagnetars; the method in docs/data/deepsky.md §magnetars).
//
// Source: the McGill Online Magnetar Catalog, main table (https://www.physics.mcgill.ca/~pulsar/magnetar/main.html,
// TabO1.csv), maintained by the McGill Pulsar Group and published as Olausen & Kaspi 2014, ApJS 212, 6. The page says
// the information may be used freely provided the paper is cited and the page's address given; the numbers here are
// quoted from it with that citation (CREDITS.md).
//
// Each magnetar keeps the catalogue's values: spin period P and its derivative Ṗ, the surface dipole field the
// catalogue infers from them (B = 3.2 × 10¹⁹ (P Ṗ)^½ G), the spin-down power and characteristic age, the X-ray
// luminosity, the distance with its uncertainty and reference code, and the position (J2000). A magnetar without a
// distance in the catalogue is left out, except SGR 1935+2154, whose distance is taken from Zhou et al. 2020, ApJ 905,
// 99 (6.6 ± 0.7 kpc, its supernova remnant G57.2+0.8). Candidates (marked # in the catalogue) without a period or a
// distance are left out; the high-field radio pulsar PSR J1846−0258 (marked ##) is kept and flagged.
//
// Each is matched to the ATNF Pulsar Catalogue's entry at the same place (within 30″) in public/data/deepsky/pulsars.json.gz,
// so the app shows one object, not two.
//
// Input: data-raw/mcgill_magnetars_TabO1_2026-10-09.csv and the main page (for the references' bibcodes), fetched
// when missing.
// Output: public/data/deepsky/magnetars.json.gz; its section of docs/data/deepsky-build-log.txt.
//
// Run: node scripts/build-magnetars.mjs

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ensure, galactic, round, separationArcsec, sexagesimal, writeColumns } from './deepsky/common.mjs';
import { say, writeLog } from './deepsky/log.mjs';

const RAW = 'data-raw/mcgill_magnetars_TabO1_2026-10-09.csv';
const PAGE = 'data-raw/mcgill_magnetars_main_2026-10-09.html';
await ensure(RAW, 'https://www.physics.mcgill.ca/~pulsar/magnetar/TabO1.csv');
await ensure(PAGE, 'https://www.physics.mcgill.ca/~pulsar/magnetar/main.html');

/** The catalogue's reference codes ("bcfc08") → ADS bibcodes, from the links on its main page. */
const BIBCODE = new Map();
for (const m of readFileSync(PAGE, 'utf8').matchAll(/<a href="https?:\/\/adsabs\.harvard\.edu\/abs\/([^"]+)">\s*\[([^\]]+)\]<\/a>/g))
  BIBCODE.set(m[2].trim(), decodeURIComponent(m[1]));

/** Distances the catalogue does not give, from the literature: kpc, ± kpc, reference. */
const EXTRA_DIST = {
  'SGR 1935+2154': { d: 6.6, up: 0.7, dn: 0.7, ref: 'Zhou et al. 2020, ApJ 905, 99' },
};

/** CSV with quoted fields. */
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (c === ',' && !q) {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    rows.push(out);
  }
  return rows;
}

const [head, ...body] = parseCsv(readFileSync(RAW, 'utf8'));
const col = (r, k) => (r[head.indexOf(k)] ?? '').trim();
const num = (s) => (s === '' ? NaN : Number(s));

const psr = JSON.parse(gunzipSync(readFileSync('public/data/deepsky/pulsars.json.gz')).toString('utf8'));
const pc = (k) => psr.columns.indexOf(k);

say(`run on ${new Date().toISOString().slice(0, 10)}: McGill Online Magnetar Catalog, ${body.length} rows`);
const rows = [];
const skipped = [];
for (const r of body) {
  const raw = col(r, 'Name');
  const candidate = raw.endsWith('##') ? 'high-B pulsar' : raw.endsWith('#') ? 'candidate' : null;
  const name = raw.replace(/\s*#+$/, '');
  const p0 = num(col(r, 'Period'));
  let dist = num(col(r, 'Dist'));
  let up = num(col(r, 'Dist_EUp'));
  let dn = num(col(r, 'Dist_EDn'));
  let ref = col(r, 'Ref_Dist') || null;
  const extra = EXTRA_DIST[name];
  if (!Number.isFinite(dist) && extra) ({ d: dist, up, dn, ref } = extra);
  if (!Number.isFinite(dist) || !Number.isFinite(p0)) {
    skipped.push(`${name}${candidate ? ` (${candidate})` : ''}: ${Number.isFinite(p0) ? 'no distance' : 'no period'}`);
    continue;
  }
  const ra = sexagesimal(col(r, 'RA').replace(/ /g, ':'), true);
  const dec = sexagesimal(col(r, 'Decl').replace(/ /g, ':'), false);
  // The ATNF entry at the same place.
  // Within 30″, or 1.5 times the catalogue's position error where that is larger (Swift J1818.0−1607's is a burst
  // position, good to a few arcminutes).
  const within = Math.max(30, 1.5 * Math.max(num(col(r, 'RA_Err')) || 0, num(col(r, 'Decl_Err')) || 0));
  let atnf = null;
  for (const p of psr.rows) {
    if (separationArcsec(ra, dec, p[pc('raDeg')], p[pc('decDeg')]) < within) atnf = p[pc('name')];
  }
  const g = galactic(ra, dec);
  const dPc = dist * 1000;
  const bands = col(r, 'Bands');
  rows.push([
    name,
    name.startsWith('SGR') ? 'SGR' : name.startsWith('PSR') ? 'PSR' : 'AXP',
    candidate,
    atnf,
    round(ra, 6),
    round(dec, 6),
    round(dPc, 1),
    Number.isFinite(up) ? round(up * 1000, 1) : null,
    Number.isFinite(dn) ? round(dn * 1000, 1) : null,
    col(r, 'Dist_lim') === '~' ? 'approx' : null,
    ref && BIBCODE.has(ref) ? `${ref} ${BIBCODE.get(ref)}` : ref,
    p0,
    num(col(r, 'Pdot')) || null,
    col(r, 'Pdot_lim') === '<' ? 'upper' : null,
    num(col(r, 'B')) || null,
    num(col(r, 'Edot')) || null,
    num(col(r, 'Age')) || null,
    num(col(r, 'Lumin')) || null,
    col(r, 'Lumin_lim') === '<' ? 'upper' : null,
    col(r, 'Assoc') || null,
    bands || null,
    col(r, 'Activity') || null,
    round(g.u[0] * dPc, 2),
    round(g.u[1] * dPc, 2),
    round(g.u[2] * dPc, 2),
  ]);
  say(`  ${name.padEnd(28)} P ${String(p0).padEnd(14)} B ${col(r, 'B').padEnd(9)} d ${dist} kpc (${ref}${BIBCODE.has(ref) ? ` = ${BIBCODE.get(ref)}` : ''})${atnf ? `  = ATNF ${atnf}` : ''}${candidate ? `  [${candidate}]` : ''}`);
}
say(`kept ${rows.length}; left out ${skipped.length}:`);
for (const s of skipped) say(`  ${s}`);

const columns = ['name', 'kind', 'flag', 'atnf', 'raDeg', 'decDeg', 'distPc', 'distUpPc', 'distDnPc', 'distLim', 'distRef', 'p0', 'p1', 'p1Lim', 'bG', 'edotErgS', 'ageYr', 'lxErgS', 'lxLim', 'assoc', 'bands', 'activity', 'xPc', 'yPc', 'zPc'];
const out = writeColumns(
  'public/data/deepsky/magnetars.json.gz',
  {
    schema: 'lightspeed.magnetars/1',
    credit: 'McGill Online Magnetar Catalog (Olausen & Kaspi 2014, ApJS 212, 6; https://www.physics.mcgill.ca/~pulsar/magnetar/main.html)',
    terms: 'Free to use with citation of Olausen & Kaspi 2014 and the catalogue page',
    retrieved: '2026-10-09',
    frames: 'heliocentric galactic pc (x → l = 0, y → l = 90°, z → north galactic pole); periods in s; field in G; powers in erg/s',
    extraDistances: EXTRA_DIST,
  },
  columns,
  rows,
);
say(`wrote public/data/deepsky/magnetars.json.gz: ${out.gz.toLocaleString('en')} bytes (${out.raw.toLocaleString('en')} raw)`);
writeLog('build-magnetars.mjs');
