// Builds public/data/stellar-tracks.json: stellar-evolution tracks for a grid of masses at solar metallicity, from the
// zero-age main sequence to the end of each track, for the Sun's future and the HR-diagram line on star cards
// (src/sim/stars/evolution.ts, docs/data/stars.md §14).
//
// Source: MIST v1.2 (MESA Isochrones & Stellar Tracks; Choi et al. 2016, ApJ 823, 102; Dotter 2016, ApJS 222, 8;
// built with MESA: Paxton et al. 2011, 2013, 2015), the EEP tracks for [Fe/H] = 0.00, [α/Fe] = 0, v/v_crit = 0.4
// (MIST_v1.2_feh_p0.00_afe_p0.0_vvcrit0.4_EEPS.txz from https://mist.science/model_grids.html, sha256
// 64644c1be477ae72121bd822b5f0eb67538e7ad8e5374109f52bec8733f32fcb). Numbers quoted from a published model grid with
// citation (CREDITS.md); the tarball itself is not redistributed.
//
// Each track is cut to its equivalent evolutionary points (EEPs) from the ZAMS (EEP 202) on, keeping the columns the app
// uses (age, mass, log L, log T_eff, log R, phase), and thinned: a point is dropped when linear interpolation in EEP
// between the points kept reproduces it to 0.004 dex in log L and log R, 0.0015 dex in log T_eff, 0.001 M☉ in mass and
// 0.1% of its phase's duration in age (Douglas–Peucker over each stretch between primary EEPs). The primary EEPs are
// always kept.
//
// Input: data-raw/mist/<mass>M.track.eep (the files of the tarball for the masses below).
// Run: node scripts/build-stellar-tracks.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const MASSES = ['00050', '00080', '00100', '00120', '00150', '00200', '00300', '00500', '00800', '01500', '04000'];
/** MIST's primary EEPs: PreMS, ZAMS, IAMS, TAMS, RGB tip, ZAHB, TAHB, TP-AGB, post-AGB, WD cooling (low mass); C burning for massive stars. */
const PRIMARY = [1, 202, 353, 454, 605, 631, 707, 808, 1409, 1710];
const FIRST = 202;
const COL = { age: 0, mass: 1, logL: 6, logT: 11, logR: 13, phase: 76 };
const TOL = { logL: 0.004, logR: 0.004, logT: 0.0015, mass: 0.001, ageShare: 0.001 };

function readTrack(name) {
  const text = readFileSync(`data-raw/mist/${name}M.track.eep`, 'utf8');
  const lines = text.split(/\r?\n/);
  const head = lines.find((l) => /^#\s+\d\.\d+E[+-]\d+\s+\d+\s+\d+\s+\d+/.test(l));
  const [initialMass, , , , , type] = head.slice(1).trim().split(/\s+/);
  const rows = lines.filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).map(Number));
  return { massMsun: Number(initialMass), type, rows };
}

/** Indices (0-based EEP − 1) kept between i0 and i1 inclusive. */
function simplify(rows, i0, i1, ageSpan, keep) {
  keep.add(i0);
  keep.add(i1);
  const err = (i) => {
    const t = (i - i0) / (i1 - i0);
    const a = rows[i0];
    const b = rows[i1];
    const r = rows[i];
    const lerp = (c) => a[c] + (b[c] - a[c]) * t;
    return Math.max(
      Math.abs(r[COL.logL] - lerp(COL.logL)) / TOL.logL,
      Math.abs(r[COL.logR] - lerp(COL.logR)) / TOL.logR,
      Math.abs(r[COL.logT] - lerp(COL.logT)) / TOL.logT,
      Math.abs(r[COL.mass] - lerp(COL.mass)) / TOL.mass,
      ageSpan > 0 ? Math.abs(r[COL.age] - lerp(COL.age)) / (TOL.ageShare * ageSpan) : 0,
    );
  };
  let worst = -1;
  let wi = -1;
  for (let i = i0 + 1; i < i1; i++) {
    const e = err(i);
    if (e > worst) {
      worst = e;
      wi = i;
    }
  }
  if (worst > 1) {
    simplify(rows, i0, wi, ageSpan, keep);
    simplify(rows, wi, i1, ageSpan, keep);
  }
}

const sig = (x, n) => Number(x.toPrecision(n));
const fix = (x, n) => Number(x.toFixed(n));

const tracks = [];
const log = [];
for (const name of MASSES) {
  const { massMsun, type, rows } = readTrack(name);
  const last = rows.length; // the last EEP
  const primaries = PRIMARY.filter((e) => e >= FIRST && e <= last);
  if (primaries.at(-1) !== last) primaries.push(last);
  const keep = new Set();
  for (let k = 0; k + 1 < primaries.length; k++) {
    const i0 = primaries[k] - 1;
    const i1 = primaries[k + 1] - 1;
    simplify(rows, i0, i1, rows[i1][COL.age] - rows[i0][COL.age], keep);
  }
  const idx = [...keep].sort((a, b) => a - b);
  const out = idx.map((i) => {
    const r = rows[i];
    return [i + 1, sig(r[COL.age], 15), fix(r[COL.mass], 5), fix(r[COL.logL], 4), fix(r[COL.logT], 4), fix(r[COL.logR], 4), r[COL.phase]];
  });
  tracks.push({ massMsun, type, primaryEeps: primaries, rows: out });
  log.push(`${massMsun} Msun (${type}): ${rows.length} EEPs from MIST, ${rows.length - FIRST + 1} from the ZAMS, ${out.length} kept; ends at EEP ${last}, age ${(rows[last - 1][COL.age] / 1e9).toFixed(4)} Gyr`);
}

const file = {
  format: 'skyfold.stellar-tracks',
  version: 1,
  source:
    'MIST v1.2 EEP tracks, [Fe/H] = 0.00, [a/Fe] = 0.0, v/vcrit = 0.4 (Choi et al. 2016, ApJ 823, 102; Dotter 2016, ApJS 222, 8; MESA: Paxton et al. 2011, 2013, 2015), thinned by scripts/build-stellar-tracks.mjs',
  columns: ['eep', 'ageYr', 'massMsun', 'logL', 'logTeff', 'logR', 'phase'],
  phases: { '-1': 'pre-main sequence', 0: 'main sequence', 2: 'red giant branch', 3: 'core helium burning', 4: 'early AGB', 5: 'thermally pulsing AGB', 6: 'post-AGB / white dwarf', 9: 'Wolf-Rayet' },
  tracks,
};
const json = JSON.stringify(file);
writeFileSync('public/data/stellar-tracks.json', json);
log.push(`wrote public/data/stellar-tracks.json: ${json.length} bytes`);
console.log(log.join('\n'));
