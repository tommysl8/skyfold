// Builds src/sim/stars/limb-darkening.json: linear limb-darkening coefficients u in the Johnson B, V and R bands on a
// grid of effective temperature and surface gravity, for the stars' close-up discs (src/sim/stars/closeup.ts).
//
// Source: Claret & Bloemen 2011, A&A 529, A75, table "u" (VizieR J/A+A/529/A75/tableu): ATLAS model atmospheres,
// solar metallicity (Z = 0), microturbulence 2 km/s, least-squares fits (method L). Numbers quoted from a published
// table with citation (CREDITS.md). I(μ)/I(1) = 1 − u (1 − μ).
//
// The grid keeps every 500 K to 8,000 K, then coarser steps (where u changes slowly), and every 1 dex of log g from 0
// to 5. ATLAS has no models of hot stars at low gravity: where a (T, log g) point is missing, the nearest gravity the
// table has at that temperature stands in (the log lists each).
//
// Input: data-raw/claret2011_tableu_Z0_xi2_LSM_ATLAS.tsv (fetched when missing).
// Run: node scripts/build-limb-darkening.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RAW = 'data-raw/claret2011_tableu_Z0_xi2_LSM_ATLAS.tsv';
const URL =
  'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=J/A%2bA/529/A75/tableu&Z=0.0&xi=2.0&Met=L&Mod=A&-out=logg,Teff,u,Filt&-out.max=200000';

if (!existsSync(RAW)) {
  console.log(`fetching ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  mkdirSync('data-raw', { recursive: true });
  writeFileSync(RAW, await res.text());
}

const TEFF = [3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 9000, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000];
const LOGG = [0, 1, 2, 3, 4, 5];
const BANDS = ['B', 'V', 'R'];

const table = new Map();
for (const line of readFileSync(RAW, 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || line.startsWith('-')) continue;
  const [g, t, u, f] = line.split('\t').map((s) => s.trim());
  if (!BANDS.includes(f) || !Number.isFinite(Number(u)) || u === '') continue;
  table.set(`${Number(t)}|${Number(g)}|${f}`, Number(u));
}

const filled = [];
const u = BANDS.map((band) =>
  TEFF.map((t) =>
    LOGG.map((g) => {
      const exact = table.get(`${t}|${g}|${band}`);
      if (exact !== undefined) return exact;
      // The nearest gravity at this temperature.
      for (let d = 0.5; d <= 5; d += 0.5)
        for (const gg of [g + d, g - d]) {
          const v = table.get(`${t}|${gg}|${band}`);
          if (v !== undefined) {
            if (band === 'V') filled.push(`${t} K log g ${g} → ${gg}`);
            return v;
          }
        }
      throw new Error(`no ${band} value at ${t} K`);
    }),
  ),
);

const out = {
  format: 'lightspeed.limb-darkening',
  version: 1,
  source: 'Claret & Bloemen 2011, A&A 529, A75 (VizieR J/A+A/529/A75/tableu): ATLAS, Z = 0, xi = 2 km/s, least-squares',
  law: 'I(mu)/I(1) = 1 - u (1 - mu)',
  teffK: TEFF,
  logg: LOGG,
  bands: BANDS,
  // u[band][teff][logg]
  u,
  filled,
};
writeFileSync('src/sim/stars/limb-darkening.json', `${JSON.stringify(out)}\n`);
console.log(`wrote src/sim/stars/limb-darkening.json; ${filled.length} gravities filled from the nearest:`);
for (const f of filled) console.log(`  ${f}`);
