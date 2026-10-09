// Builds public/data/more-galaxies.json.gz and src/sim/cosmos/moreGalaxyNames.json: famous galaxies beyond the Local
// Group and the brightest members of the Virgo and Coma clusters, drawn as galaxies of their own (src/sim/cosmos/
// records.ts moreGalaxyBuilt; the method in docs/data/cosmos.md, "More galaxies").
//
// Sources (licences in CREDITS.md)
//   OpenNGC (Mattia Verga, github.com/mattiaverga/OpenNGC, database_files/NGC.csv): names, Messier numbers, common names,
//   positions, Hubble types, sizes (major and minor axis, position angle), B and V magnitudes and heliocentric
//   velocities, which OpenNGC takes from HyperLEDA, NED and SIMBAD. CC BY-SA 4.0: the output is released under it too.
//   Cosmicflows-4 (Tully et al. 2023, ApJ 944, 94; public/data/cosmic-web.bin.gz, CC BY 4.0): the distances, and which
//   row of the cosmic web each galaxy is (so the web leaves it out).
//   The deep-sky file public/data/deepsky/ngc-galaxies.json.gz (built by scripts/build-ngc.mjs): where the cosmic web
//   places the famous galaxies and the anchors of their groups in the expanding universe; reused as it is.
//   Mei et al. 2007, ApJ 655, 144 (ACS Virgo Cluster Survey XIII; VizieR J/ApJ/655/144): surface brightness
//   fluctuation distances of the Virgo Cluster's early-type galaxies, on the scale of the cluster's distance in
//   named.json (16.5 Mpc, the same paper). Distances quoted with citation.
//   src/sim/cosmos/named.json: the Virgo and Coma clusters' places and distances, and their rows in the cosmic web.
//
// Distances.
//   Famous galaxies outside the clusters: placed exactly where the cosmic web places their row (Cosmicflows-4, its group
//   distance within 30 Mpc), as the deep-sky layer did; NGC 4039 shares NGC 4038's (one row for the pair).
//   Virgo: a galaxy in Mei et al. (2007) takes its own SBF distance (±0.05–0.1 mag, under 1 Mpc); else a Cosmicflows-4
//   distance from a precise method (SBF, Cepheids, TRGB, SN Ia, masers; error ≤ MAX_EDM mag), brought to Mei's scale
//   by the median ratio of the galaxies both measured; else the cluster's distance (a Tully–Fisher or fundamental-plane
//   distance, ±20 %, would scatter it 3 Mpc in front of or behind a cluster about 2 Mpc deep), and its card says so.
//   Coma: every member at the cluster's distance (98.5 Mpc, Scolnic et al. 2025), in its own direction: at 100 Mpc even
//   a 0.1 mag distance is ±5 Mpc, more than the cluster's depth.
//   As named.json places the clusters (their measured distance divided by 1 + z_cmb, where they are now), each member
//   is placed at the same fraction of its measured distance.
//
// Inputs: data-raw/galaxies/NGC.csv (OpenNGC), data-raw/galaxies/mei2007.tsv (VizieR); fetched only when missing.
// Run: node scripts/build-more-galaxies.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const RAW = 'data-raw/galaxies';
const OPENNGC = 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv';
const MEI = 'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=J/ApJ/655/144&-out.max=200&-out.all';
const OUT = 'public/data/more-galaxies.json.gz';
const NAMES_OUT = 'src/sim/cosmos/moreGalaxyNames.json';
const DEG = Math.PI / 180;
/** A Cosmicflows-4 distance is used for a Virgo galaxy only from these methods (SN Ia, SBF, TRGB, Cepheids, masers)… */
const PRECISE = 1 | 8 | 32 | 64 | 128;
/** …and only when its error is at most this (mag): 0.15 mag is 7 % of the distance, about 1.1 Mpc at Virgo. */
const MAX_EDM = 0.15;
/** A Mei et al. galaxy is the OpenNGC galaxy within this (arcsec). */
const MATCH_ARCSEC = 20;
/** Coma members drawn: those of its Cosmicflows-4 run with an NGC or IC name and 2MASS Ks brighter than this. */
const COMA_KS = 10.8;
/** Virgo members drawn beyond the named ones: OpenNGC B or V brighter than this… */
const VIRGO_MAG = 11.6;

async function ensure(path, url) {
  if (existsSync(path)) return;
  console.log(`fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

// ─── The famous galaxies, by OpenNGC designation ──────────────────────────────────────────────

/** id, designation, the name shown (null: its Messier or NGC designation), extra search names. */
const FAMOUS = [
  ['m82', 'NGC3034', 'Cigar Galaxy', []],
  ['m64', 'NGC4826', 'Black Eye Galaxy', ['Evil Eye Galaxy', 'Sleeping Beauty Galaxy']],
  ['m63', 'NGC5055', 'Sunflower Galaxy', []],
  ['m65', 'NGC3623', null, ['Leo Triplet']],
  ['m66', 'NGC3627', null, ['Leo Triplet']],
  ['ngc-3628', 'NGC3628', 'Hamburger Galaxy', ['Leo Triplet', "Sarah's Galaxy"]],
  ['ngc-1300', 'NGC1300', null, []],
  ['ngc-4038', 'NGC4038', 'Antennae Galaxies', ['Antennae', 'Ringtail Galaxy']],
  ['ngc-4039', 'NGC4039', null, ['Antennae Galaxies']],
  ['m83', 'NGC5236', 'Southern Pinwheel Galaxy', []],
  ['ngc-253', 'NGC0253', 'Sculptor Galaxy', ['Silver Coin Galaxy', 'Silver Dollar Galaxy']],
  ['m101', 'NGC5457', 'Pinwheel Galaxy', []],
  ['ngc-4565', 'NGC4565', 'Needle Galaxy', []],
];

/** The Virgo Cluster's Messier galaxies (M87 is in named.json), and others worth naming. */
const VIRGO_NAMED = [
  'NGC4472', 'NGC4579', 'NGC4621', 'NGC4649', 'NGC4303', 'NGC4374', 'NGC4382', 'NGC4406', 'NGC4501', 'NGC4552', 'NGC4569',
  'NGC4548', 'NGC4192', 'NGC4254', 'NGC4321',
  // Markarian's Chain (with M84 and M86), the Eyes, the Siamese Twins, and other bright members.
  'NGC4435', 'NGC4438', 'NGC4458', 'NGC4461', 'NGC4473', 'NGC4477', 'NGC4567', 'NGC4568', 'NGC4216', 'NGC4526', 'NGC4535',
  'NGC4365', 'NGC4762',
];
const VIRGO_COMMON = { NGC4435: 'The Eyes (NGC 4435)', NGC4438: 'The Eyes (NGC 4438)', NGC4567: 'Siamese Twins (NGC 4567)', NGC4568: 'Siamese Twins (NGC 4568)' };
/** Coma galaxies worth having beyond its brightest: the spirals NGC 4911 and NGC 4921, famous from Hubble's pictures. */
const COMA_NAMED = ['NGC4889', 'NGC4874', 'NGC4911', 'NGC4921'];

// ─── Inputs ───────────────────────────────────────────────────────────────────────────────────

const sex = (s, hours) => {
  const neg = s.trim().startsWith('-');
  const [a, b, c] = s.replace(/^[-+]/, '').split(':').map(Number);
  return (neg ? -1 : 1) * (a + b / 60 + c / 3600) * (hours ? 15 : 1);
};
const num = (s) => (s === '' || s === undefined ? null : Number(s));
const pretty = (d) => d.replace(/^(NGC|IC)0*(\d+)(.*)$/, '$1 $2$3');

function readOpenNgc(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(';');
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const out = new Map();
  for (const line of lines.slice(1)) {
    const f = line.split(';');
    if (f[col.Type] !== 'G' && f[col.Type] !== 'GPair' && f[col.Type] !== 'GTrpl') continue;
    const m = f[col.M] ? Number(f[col.M]) : null;
    out.set(f[col.Name], {
      designation: f[col.Name],
      ra: sex(f[col.RA], true),
      dec: sex(f[col.Dec], false),
      maj: num(f[col.MajAx]),
      min: num(f[col.MinAx]),
      pa: num(f[col.PosAng]),
      bMag: num(f[col['B-Mag']]),
      vMag: num(f[col['V-Mag']]),
      hubble: f[col.Hubble] || null,
      vHelio: num(f[col.RadVel]),
      messier: m,
      common: f[col['Common names']] ? f[col['Common names']].split(',').map((s) => s.trim()) : [],
      pgc: (f[col.Identifiers].match(/PGC 0*(\d+)/) ?? [])[1] ?? null,
      sources: f[col.Sources],
    });
  }
  return out;
}

function readMei(path) {
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!/^\s*\d+\t/.test(line)) continue;
    const f = line.split('\t');
    const dm = num(f[7].trim());
    if (dm === null) continue;
    rows.push({ acsvcs: Number(f[0]), vcc: Number(f[1]), dm, edm: num(f[8].trim()), names: f[13].trim(), ra: Number(f[16]), dec: Number(f[17]) });
  }
  return rows;
}

function readWeb(path) {
  const buf = gunzipSync(readFileSync(path));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const dv = new DataView(ab);
  const n = dv.getUint32(8, true);
  const types = [Float32Array, Float32Array, Int16Array, Int16Array, Uint16Array, Uint16Array, Uint16Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array];
  const names = ['ra', 'dec', 'vcmb', 'vgroup', 'dm', 'dmgroup', 'ks', 'edm', 'edmgroup', 'methods', 'axisratio', 'pa'];
  const w = { n };
  names.forEach((name, i) => (w[name] = new types[i](ab, dv.getUint32(16 + 4 * i, true), n)));
  return w;
}

function readNgcGalaxies(path) {
  const j = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
  const c = Object.fromEntries(j.columns.map((k, i) => [k, i]));
  const byName = new Map();
  const byRow = new Map();
  for (const r of j.rows) {
    const o = Object.fromEntries(Object.entries(c).map(([k, i]) => [k, r[i]]));
    byName.set(o.name.replace(/ /g, '').replace(/^(NGC|IC)(\d+)/, (_, p, d) => p + d.padStart(4, '0')), o);
    if (o.source === 'cf4') byRow.set(o.ref, o);
  }
  return { byName, byRow };
}

// ─── Geometry ─────────────────────────────────────────────────────────────────────────────────

const EPS = (84381.448 / 3600) * DEG;
const unit = (ra, dec) => [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
/** ICRS → ecliptic J2000. */
const ecl = ([x, y, z]) => [x, Math.cos(EPS) * y + Math.sin(EPS) * z, -Math.sin(EPS) * y + Math.cos(EPS) * z];
/** World (x_ecl, z_ecl, −y_ecl) → ecliptic. */
const worldToEcl = ([x, y, z]) => [x, -z, y];
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const sepArcsec = (a, b) => {
  const u = unit(a.ra, a.dec);
  const v = unit(b.ra, b.dec);
  return Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])) / DEG * 3600;
};
const round = (x, d) => (x === null || x === undefined ? null : Number(x.toFixed(d)));
const r6 = (v) => v.map((x) => round(x, 6));
const mpcOfDm = (dm) => 10 ** ((dm - 25) / 5);

// ─── Build ────────────────────────────────────────────────────────────────────────────────────

await ensure(`${RAW}/NGC.csv`, OPENNGC);
await ensure(`${RAW}/mei2007.tsv`, MEI);
const ngc = readOpenNgc(`${RAW}/NGC.csv`);
const mei = readMei(`${RAW}/mei2007.tsv`);
const web = readWeb('public/data/cosmic-web.bin.gz');
const deep = readNgcGalaxies('public/data/deepsky/ngc-galaxies.json.gz');
const named = JSON.parse(readFileSync('src/sim/cosmos/named.json', 'utf8'));
const virgo = named.objects.find((o) => o.id === 'virgo-cluster');
const coma = named.objects.find((o) => o.id === 'coma-cluster');
const m87Row = named.objects.find((o) => o.id === 'm87').cosmicWeb.index;
const og = (d) => {
  const o = ngc.get(d);
  if (!o) throw new Error(`OpenNGC has no ${d}`);
  return o;
};

/** The galaxy's Cosmicflows-4 row: the deep-sky file's link, else the nearest row within 10″ (none for most that file lacks). */
function cfRowOf(o) {
  const d = deep.byName.get(o.designation);
  if (d && d.source === 'cf4') return d.ref;
  for (let i = 0; i < web.n; i++) if (Math.abs(web.dec[i] - o.dec) < 0.01 && sepArcsec(o, { ra: web.ra[i], dec: web.dec[i] }) < 10) return i;
  return null;
}

/** The name shown and the search names of an OpenNGC galaxy. */
function naming(o, name) {
  const des = pretty(o.designation);
  const messier = o.messier ? `M${o.messier}` : null;
  const shown = name ?? messier ?? des;
  const aliases = [des, ...(messier ? [messier, `M ${o.messier}`, `Messier ${o.messier}`] : []), ...o.common].filter((a) => a !== shown);
  return { name: shown, aliases: [...new Set(aliases)] };
}

const galaxies = [];
const taken = new Set();

function base(id, o, name, extra, set) {
  taken.add(o.designation);
  const { name: shown, aliases } = naming(o, name);
  return {
    id,
    name: shown,
    designation: pretty(o.designation),
    aliases: [...new Set([...aliases, ...extra])],
    set,
    ra: round(o.ra, 5),
    dec: round(o.dec, 5),
    hubble: o.hubble,
    majArcmin: o.maj,
    minArcmin: o.min,
    pa: o.pa,
    bMag: o.bMag,
    vMag: o.vMag,
    vHelio: o.vHelio,
    pgc: o.pgc ? Number(o.pgc) : null,
  };
}

// The famous galaxies: where the cosmic web (and the deep-sky layer) places them.
for (const [id, des, name, extra] of FAMOUS) {
  const o = og(des);
  const d = deep.byName.get(des) ?? (des === 'NGC4039' ? deep.byName.get('NGC4038') : null);
  if (!d || d.source !== 'cf4') throw new Error(`${des}: no Cosmicflows-4 place`);
  const dir = ecl(unit(o.ra, o.dec));
  const own = des !== 'NGC4039';
  galaxies.push({
    ...base(id, o, name, extra, 'famous'),
    distance: {
      placedMpc: round(d.distMpc, 4),
      loMpc: round(d.distLoMpc, 4),
      hiMpc: round(d.distHiMpc, 4),
      basis: own ? 'web' : 'pair',
      methods: d.methods,
      ref: 'Cosmicflows-4, Tully et al. 2023, ApJ 944, 94',
    },
    cfRow: own ? d.ref : null,
    positionEclMpc: r6(dir.map((x) => x * d.distMpc)),
    anchorEclMpc: r6(worldToEcl([d.ax, d.ay, d.az])),
  });
}

// One distance scale in Virgo: Cosmicflows-4's precise distances brought to Mei et al.'s by the median ratio.
const meiOf = (o) => mei.find((m) => Math.abs(m.dec - o.dec) < 0.02 && sepArcsec(o, m) < MATCH_ARCSEC) ?? null;
const ratios = [];
for (const m of mei) {
  for (let r = virgo.cosmicWeb.members.first; r < virgo.cosmicWeb.members.first + virgo.cosmicWeb.members.count; r++) {
    if (web.dm[r] && web.methods[r] & PRECISE && web.edm[r] / 100 <= MAX_EDM && sepArcsec(m, { ra: web.ra[r], dec: web.dec[r] }) < MATCH_ARCSEC) {
      ratios.push(mpcOfDm(m.dm) / mpcOfDm(web.dm[r] / 1000));
    }
  }
}
ratios.sort((a, b) => a - b);
const cfToMei = ratios[ratios.length >> 1];
console.log(`Virgo: ${ratios.length} galaxies in both Mei et al. and Cosmicflows-4; median ratio of distances ${cfToMei.toFixed(4)}`);

const virgoPlaced = norm(virgo.positionEclMpc);
const virgoShare = virgoPlaced / virgo.distance.mpc;
const virgoRows = new Set();
for (let r = virgo.cosmicWeb.members.first; r < virgo.cosmicWeb.members.first + virgo.cosmicWeb.members.count; r++) virgoRows.add(r);
const virgoList = [...VIRGO_NAMED];
for (const r of virgoRows) {
  const d = deep.byRow.get(r);
  if (!d || r === m87Row) continue;
  const key = d.name.replace(/ /g, '').replace(/^(NGC|IC)(\d+)/, (_, p, n) => p + n.padStart(4, '0'));
  const o = ngc.get(key);
  if (o && Math.min(o.vMag ?? 99, o.bMag ?? 99) <= VIRGO_MAG && !virgoList.includes(key)) virgoList.push(key);
}
for (const m of mei) {
  const n = m.names.match(/N(\d+)/);
  if (!n) continue;
  const key = `NGC${n[1].padStart(4, '0')}`;
  const o = ngc.get(key);
  if (o && key !== 'NGC4486' && Math.min(o.vMag ?? 99, o.bMag ?? 99) <= VIRGO_MAG && !virgoList.includes(key)) virgoList.push(key);
}

const stats = { mei: 0, cf4: 0, cluster: 0 };
for (const des of virgoList) {
  const o = og(des);
  const m = meiOf(o);
  const row = cfRowOf(o);
  let mpc;
  let lo;
  let hi;
  let basis;
  let ref;
  let methods = 0;
  if (m) {
    mpc = mpcOfDm(m.dm);
    lo = mpcOfDm(m.dm - m.edm);
    hi = mpcOfDm(m.dm + m.edm);
    basis = 'individual';
    methods = 8;
    ref = `Mei et al. 2007, ApJ 655, 144 (ACS Virgo Cluster Survey, VCC ${m.vcc}: m − M = ${m.dm} ± ${m.edm})`;
    stats.mei++;
  } else if (row !== null && web.dm[row] && web.methods[row] & PRECISE && web.edm[row] / 100 <= MAX_EDM) {
    const dm = web.dm[row] / 1000;
    const e = web.edm[row] / 100;
    mpc = mpcOfDm(dm) * cfToMei;
    lo = mpcOfDm(dm - e) * cfToMei;
    hi = mpcOfDm(dm + e) * cfToMei;
    basis = 'individual';
    methods = web.methods[row];
    ref = `Cosmicflows-4, Tully et al. 2023, ApJ 944, 94 (m − M = ${dm} ± ${e}), scaled by ${cfToMei.toFixed(3)} to the scale of Mei et al. 2007`;
    stats.cf4++;
  } else {
    mpc = virgo.distance.mpc;
    lo = mpc - virgo.distance.errMpc;
    hi = mpc + virgo.distance.errMpc;
    basis = 'cluster';
    ref = virgo.distance.ref;
    stats.cluster++;
  }
  const dir = ecl(unit(o.ra, o.dec));
  galaxies.push({
    ...base(o.messier ? `m${o.messier}` : pretty(des).toLowerCase().replace(/ /g, '-'), o, VIRGO_COMMON[des] ?? null, [], 'virgo'),
    distance: { measuredMpc: round(mpc, 4), placedMpc: round(mpc * virgoShare, 4), loMpc: round(lo * virgoShare, 4), hiMpc: round(hi * virgoShare, 4), basis, methods, ref },
    cfRow: row,
    positionEclMpc: r6(dir.map((x) => x * mpc * virgoShare)),
    anchorEclMpc: r6(virgo.positionEclMpc),
  });
}
console.log(`Virgo: ${virgoList.length} galaxies; ${stats.mei} Mei et al. distances, ${stats.cf4} Cosmicflows-4, ${stats.cluster} at the cluster's distance`);

// Coma: the brightest of its Cosmicflows-4 run that have NGC or IC names, and the named ones.
const comaPlaced = norm(coma.positionEclMpc);
const comaList = [...COMA_NAMED];
for (let r = coma.cosmicWeb.members.first; r < coma.cosmicWeb.members.first + coma.cosmicWeb.members.count; r++) {
  const d = deep.byRow.get(r);
  if (!d || !web.ks[r] || web.ks[r] / 1000 > COMA_KS) continue;
  const key = d.name.replace(/ /g, '').replace(/^(NGC|IC)(\d+)/, (_, p, n) => p + n.padStart(4, '0'));
  if (ngc.has(key) && !comaList.includes(key)) comaList.push(key);
}
for (const des of comaList) {
  const o = og(des);
  const dir = ecl(unit(o.ra, o.dec));
  const row = cfRowOf(o);
  galaxies.push({
    ...base(pretty(des).toLowerCase().replace(/ /g, '-'), o, null, [], 'coma'),
    distance: {
      measuredMpc: coma.distance.mpc,
      placedMpc: round(comaPlaced, 4),
      loMpc: round((coma.distance.mpc - coma.distance.errMpc) * (comaPlaced / coma.distance.mpc), 4),
      hiMpc: round((coma.distance.mpc + coma.distance.errMpc) * (comaPlaced / coma.distance.mpc), 4),
      basis: 'cluster',
      methods: 0,
      ref: coma.distance.ref,
    },
    cfRow: row,
    positionEclMpc: r6(dir.map((x) => x * comaPlaced)),
    anchorEclMpc: r6(coma.positionEclMpc),
  });
}
console.log(`Coma: ${comaList.length} galaxies at the cluster's distance`);

const ids = new Set();
for (const g of galaxies) {
  if (ids.has(g.id)) throw new Error(`duplicate id ${g.id}`);
  ids.add(g.id);
}

const doc = {
  format: 'lightspeed-more-galaxies',
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  description: 'Famous galaxies beyond the Local Group and the brightest members of the Virgo and Coma clusters (scripts/build-more-galaxies.mjs; docs/data/cosmos.md).',
  credit: 'OpenNGC by Mattia Verga (github.com/mattiaverga/OpenNGC; from HyperLEDA, NED and SIMBAD): names, positions, types, sizes, magnitudes, velocities. Distances: Cosmicflows-4 (Tully et al. 2023, ApJ 944, 94); Mei et al. 2007, ApJ 655, 144; Scolnic et al. 2025, ApJL 979, L9 (Coma).',
  licence: 'CC BY-SA 4.0 (OpenNGC); Cosmicflows-4 values CC BY 4.0; Mei et al. distances quoted with citation.',
  frames: 'ICRS degrees; positionEclMpc and anchorEclMpc heliocentric ecliptic J2000, Mpc, where the galaxy (and its group or cluster) is now',
  virgoScale: { cosmicflowsToMei: round(cfToMei, 4), galaxiesInBoth: ratios.length },
  galaxies,
};
writeFileSync(OUT, gzipSync(Buffer.from(JSON.stringify(doc)), { level: 9 }));
// The deep-sky layer leaves these designations out (they are bodies of their own) and leads them to the bodies.
const names = galaxies.flatMap((g) => [...new Set([g.designation, ...g.aliases.filter((a) => /^(NGC|IC|M|Messier) ?\d/.test(a))])].map((a) => [a, g.name]));
writeFileSync(NAMES_OUT, JSON.stringify({ note: 'Designations of the galaxies in public/data/more-galaxies.json.gz (scripts/build-more-galaxies.mjs) → the names of their bodies', names }, null, 0) + '\n');
console.log(`${galaxies.length} galaxies → ${OUT} (${readFileSync(OUT).length} bytes gzipped), ${names.length} names → ${NAMES_OUT}`);
