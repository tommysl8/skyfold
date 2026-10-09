// The galaxies of Gaia DR3 with a redshift (scripts/build-quaia.mjs reads them; docs/data/surveys.md §11): the "purer"
// galaxy candidates of Gaia Collaboration, Bailer-Jones et al. 2023 (A&A 674, A41, §9: about 95 % galaxies) that the
// Unresolved Galaxy Classifier gave a redshift from their BP/RP spectra (Delchambre et al. 2023, A&A 674, A31), with
// the positions and photometry of gaia_source. Fetched from the Gaia archive in 48 slices of the sky by source id
// (synchronous queries of seconds each, as scripts/star-ext-sources.mjs does: the archive's asynchronous jobs can
// wait in its queue for hours), into data-raw/gaia-galaxies/parts/, then joined into one gzipped CSV.
//
// Gaia DR3 is ESA/Gaia/DPAC's, under CC BY-NC 3.0 IGO (https://www.cosmos.esa.int/web/gaia-users/license):
// redistributable with credit, non-commercially, as the star catalogue's Gaia values already are (CREDITS.md).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';

const GAIA_TAP_SYNC = 'https://gea.esac.esa.int/tap-server/tap/sync';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** The columns kept, in the CSV's order. */
export const GAIA_GALAXY_COLUMNS = [
  'source_id',
  'ra',
  'dec',
  'l',
  'b',
  'phot_g_mean_mag',
  'bp_rp',
  'redshift_ugc',
  'redshift_ugc_lower',
  'redshift_ugc_upper',
  'classlabel_dsc_joint',
  'vari_best_class_name',
  'radius_sersic',
];

/**
 * The purer galaxy sample (Bailer-Jones et al. 2023 §9): a Sérsic profile was fitted, or both of the discrete source
 * classifier's models call it a galaxy, or the variability classifier does; with a redshift.
 */
export const GAIA_GALAXY_WHERE =
  "g.redshift_ugc IS NOT NULL AND (g.radius_sersic IS NOT NULL OR g.classlabel_dsc_joint = 'galaxy' OR g.vari_best_class_name = 'GALAXY')";

function query(a, b) {
  const cols = GAIA_GALAXY_COLUMNS.map((c) => (['ra', 'dec', 'l', 'b', 'phot_g_mean_mag', 'bp_rp'].includes(c) ? `s.${c}` : `g.${c}`)).join(', ');
  return `SELECT ${cols} FROM gaiadr3.galaxy_candidates AS g JOIN gaiadr3.gaia_source AS s ON s.source_id = g.source_id WHERE g.source_id >= ${a} AND g.source_id < ${b} AND ${GAIA_GALAXY_WHERE}`;
}

async function syncTap(q) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 300000);
      const r = await fetch(GAIA_TAP_SYNC, {
        method: 'POST',
        body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', MAXREC: '2000000', QUERY: q }),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      if (!t.startsWith('source_id')) throw new Error(t.slice(0, 300));
      return t;
    } catch (e) {
      console.warn(`  retry ${attempt + 1}: ${String(e.message).slice(0, 200)}`);
      await sleep(10000 * (attempt + 1));
    }
  }
  throw new Error('Gaia archive query failed');
}

/** Fetch what is missing (resumably) and return the path of the joined CSV (gzip). */
export async function fetchGaiaGalaxies(rawDir) {
  const out = `${rawDir}/gaia_dr3_galaxies_ugc.csv.gz`;
  if (existsSync(out)) return out;
  const parts = `${rawDir}/parts`;
  mkdirSync(parts, { recursive: true });
  const step = 144115188075855872n; // 2^35 × 4^11: one level-1 HEALPix pixel of source ids
  let next = 0;
  async function worker() {
    for (;;) {
      const k = next++;
      if (k >= 48) return;
      const part = join(parts, `${String(k).padStart(3, '0')}.csv.gz`);
      if (existsSync(part)) continue;
      const t = await syncTap(query(BigInt(k) * step, BigInt(k + 1) * step));
      writeFileSync(part, gzipSync(Buffer.from(t)));
      console.log(`  Gaia galaxies, slice ${k + 1} / 48: ${t.split('\n').length - 2} rows`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  const files = readdirSync(parts).filter((f) => f.endsWith('.csv.gz')).sort();
  if (files.length !== 48) throw new Error(`${files.length} of 48 slices`);
  let header = '';
  const bodies = [];
  for (const f of files) {
    const t = gunzipSync(readFileSync(join(parts, f))).toString('utf8');
    const nl = t.indexOf('\n');
    const h = t.slice(0, nl).trim();
    if (header && h !== header) throw new Error(`${f}: header differs`);
    header = h;
    bodies.push(t.slice(nl + 1).replace(/\s+$/, ''));
  }
  writeFileSync(out, gzipSync(Buffer.from(`${header}\n${bodies.filter(Boolean).join('\n')}\n`)));
  return out;
}

// Run alone: node scripts/surveys/gaia-galaxies.mjs (fetches into data-raw/gaia-galaxies/).
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/surveys/gaia-galaxies.mjs')) {
  const p = await fetchGaiaGalaxies('data-raw/gaia-galaxies');
  console.log(p);
}
