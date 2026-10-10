// Builds public/data/bodies.json: physical data, rotation models, colours, discovery notes,
// facts and asset references for the moons, dwarf planets, comets, interstellar objects and
// spacecraft.
//
// Machine-readable inputs (cached in data-raw/d3/ by this script or by build-textures/-shapes):
//   pck00011.tpc                 NAIF text PCK: IAU WGCCRE 2015 rotation models and triaxial radii
//                                (Archinal et al. 2018, CMDA 130:22), https://naif.jpl.nasa.gov
//   ssd_sats_phys_par.html       JPL SSD satellite GM and mean radius (current), with ephemeris refs
//   ssd_sat_phys_par_2020_archive.html  JPL SSD table as archived in 2021: geometric albedos + refs
//   ssd_sats_elem_sep.html       JPL SSD satellite mean orbital elements
//   sbdb_<id>.json               JPL Small-Body Database API (physical parameters, discovery)
//   colors/satcol.tab, colors/tnocencol.tab   PDS SBN colour compilations (Neese 2014, 2020)
//   horizons_haumea_geocentric_20170121.txt   JPL Horizons, to phase Haumea's rotation (below)
//   maps/textures-report.json, shapes/shapes-report.json   outputs of the other two scripts
// Everything else is curated below, value by value, with its source.
//
// Run after build-textures and build-shapes: node scripts/build-bodies.mjs
// (no dependencies; fetches the inputs below only when they are not already cached)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw', 'd3');
const OUT = join(ROOT, 'public', 'data', 'bodies.json');

/** Newtonian constant of gravitation, km³ kg⁻¹ s⁻². [CODATA 2018: 6.67430(15) × 10⁻¹¹ m³ kg⁻¹ s⁻²] */
const G_KM3_KG_S2 = 6.6743e-20;
const AU_KM = 149_597_870.7;
const GM_SUN = 1.327_124_4e11; // [IAU 2015 B3]
const DEG = Math.PI / 180;

// ─── Sources, cited by key ──────────────────────────────────────────────────────────────────

const SRC = {
  iau2015: 'Archinal et al. 2018, "Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015", Celest. Mech. Dyn. Astron. 130:22, https://doi.org/10.1007/s10569-017-9805-5 (values as encoded by NAIF in pck00011.tpc, https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc)',
  ssdPhys: 'JPL Solar System Dynamics, Planetary Satellite Physical Parameters, https://ssd.jpl.nasa.gov/sats/phys_par/ (retrieved 2026-09-25)',
  ssdPhys2020: 'JPL Solar System Dynamics, Planetary Satellite Physical Parameters (2015-02-19 edition, archived 2021-01-26), https://web.archive.org/web/2021/https://ssd.jpl.nasa.gov/?sat_phys_par',
  ssdElem: 'JPL Solar System Dynamics, Planetary Satellite Mean Elements, https://ssd.jpl.nasa.gov/sats/elem/sep.html (retrieved 2026-09-25)',
  sbdb: 'JPL Small-Body Database, https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html (API retrieved 2026-09-25)',
  satcol: 'Neese (ed.) 2020, Small Satellite Colors, PDS SBN urn:nasa:pds:compil.satellite.colors (colours from Cruikshank 1980, Icarus 41, 246; Schaefer & Schaefer 2000, Icarus 146, 541)',
  tnocol: 'Neese 2014, TNO and Centaur Colors, PDS SBN urn:nasa:pds:compil.tno-centaur.colors',
  sunColours: 'Holmberg, Flynn & Portinari 2006, MNRAS 367, 449: solar (B−V) = 0.642, (V−R) = 0.354, (V−I) = 0.688',
  weaver2016: 'Weaver et al. 2016, "The small satellites of Pluto as observed by New Horizons", Science 351, aae0030, https://doi.org/10.1126/science.aae0030 (Table 2)',
  ortiz2017: 'Ortiz et al. 2017, "The size, shape, density and ring of the dwarf planet Haumea from a stellar occultation", Nature 550, 219, https://doi.org/10.1038/nature24051',
  porter2024: 'Porter et al. 2024, Arrokoth shape model v01, PDS SBN urn:nasa:pds:nh_derived:arrokoth_shapemodel_porter2024 (pole and prime meridian from the product label)',
};

// ─── Parsers for the cached machine-readable sources ────────────────────────────────────────

/** Raw inputs and where they come from. Fetched one at a time, only when not already cached. */
const SBDB_IDS = { ceres: '1', vesta: '4', eris: '136199', haumea: '136108', makemake: '136472', gonggong: '225088', quaoar: '50000', sedna: '90377', orcus: '90482', arrokoth: '486958', halley: '1P', encke: '2P', '67p': '67P', halebopp: 'C/1995 O1', oumuamua: '1I', borisov: '2I', atlas3i: '3I' };
const HORIZONS_HAUMEA =
  'https://ssd.jpl.nasa.gov/api/horizons.api?' +
  new URLSearchParams({
    format: 'text', COMMAND: "'136108;'", EPHEM_TYPE: 'VECTORS', CENTER: "'500@399'",
    START_TIME: "'2017-01-21 03:09:20'", STOP_TIME: "'2017-01-21 03:10:20'", STEP_SIZE: "'1m'",
    REF_PLANE: 'FRAME', REF_SYSTEM: 'ICRF', VEC_CORR: "'LT'", VEC_TABLE: '1', OUT_UNITS: 'KM-S', TIME_TYPE: 'UT', CSV_FORMAT: 'YES',
  });
const INPUTS = [
  ['pck00011.tpc', 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc'],
  ['ssd_sats_phys_par.html', 'https://ssd.jpl.nasa.gov/sats/phys_par/'],
  ['ssd_sat_phys_par_2020_archive.html', 'http://web.archive.org/web/2020id_/https://ssd.jpl.nasa.gov/?sat_phys_par'],
  ['ssd_sats_elem_sep.html', 'https://ssd.jpl.nasa.gov/sats/elem/sep.html'],
  ['colors/satcol.tab', 'https://sbnarchive.psi.edu/pds4/non_mission/compil.satellite.colors/data/satcol.tab'],
  ['colors/tnocencol.tab', 'https://sbnarchive.psi.edu/pds4/non_mission/compil.tno-centaur.colors/data/tnocencol.tab'],
  ['horizons_haumea_geocentric_20170121.txt', HORIZONS_HAUMEA],
  ...Object.entries(SBDB_IDS).map(([k, sstr]) => [
    `sbdb_${k}.json`,
    `https://ssd-api.jpl.nasa.gov/sbdb.api?${new URLSearchParams({ sstr, 'phys-par': '1', discovery: '1' })}`,
  ]),
];

async function ensureInputs() {
  for (const [name, url] of INPUTS) {
    const f = join(RAW, name);
    if (existsSync(f)) continue;
    mkdirSync(dirname(f), { recursive: true });
    console.log(`fetching ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': 'lightspeed-build (scripts/build-bodies.mjs)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    writeFileSync(f, Buffer.from(await res.arrayBuffer()));
    await new Promise((r) => setTimeout(r, 500)); // be polite: one request at a time, spaced
  }
  for (const f of ['maps/textures-report.json', 'shapes/shapes-report.json']) {
    if (!existsSync(join(RAW, f))) throw new Error(`missing data-raw/d3/${f}: run scripts/build-textures.mjs and scripts/build-shapes.mjs first`);
  }
}

function readRaw(name) {
  const f = join(RAW, name);
  if (!existsSync(f)) throw new Error(`missing ${f}: run the fetch steps (see scripts/build-*.mjs headers)`);
  return readFileSync(f, 'utf8');
}

/** SPICE text-kernel parser: only \begindata blocks; KEY = value | ( list ). */
function parsePck(text) {
  const vars = {};
  const blocks = text.split(/\\begindata/).slice(1).map((b) => b.split(/\\begintext/)[0]);
  const data = blocks.join('\n');
  const re = /([A-Z0-9_]+)\s*(\+?=)\s*(\([^)]*\)|[^\s]+)/g;
  let m;
  while ((m = re.exec(data))) {
    const vals = m[3]
      .replace(/[()]/g, ' ')
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((s) => Number(s.replace(/[dD]/, 'e')));
    vars[m[1]] = m[2] === '+=' && vars[m[1]] ? vars[m[1]].concat(vals) : vals;
  }
  return vars;
}

function parseTableRows(html) {
  const rows = [];
  for (const r of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      c[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/g, ' ')
        .replace(/&plusmn;/g, '±')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** Current SSD table: GM (value, sigma, ephemeris) and mean radius (value, sigma, ref). */
function parseSsdPhys(html) {
  const out = {};
  for (const c of parseTableRows(html)) {
    if (c.length < 6 || !/^\d{3}$/.test(c[2])) continue;
    const nums = (s) => s.split(' ').filter(Boolean);
    const [gm, gmSig, gmRef] = nums(c[3]);
    const [r, rSig] = nums(c[4]);
    out[c[1]] = { gm: Number(gm), gmSigma: Number(gmSig), gmEphemeris: gmRef, radius: Number(r), radiusSigma: Number(rSig) };
  }
  return out;
}

/** Reference numbers used by the 2015 SSD albedo column, with their citations (from that page). */
const SSD2015_REFS = {
  '[6]': 'Zellner & Capen 1974, Icarus 23, 437',
  '[7]': 'Thomas et al. 1996, Icarus 123, 536',
  '[16]': 'Simonelli & Veverka 1984, Icarus 59, 406',
  '[17]': 'Buratti & Veverka 1983, Icarus 55, 93 (mean of leading and trailing hemispheres)',
  '[18]': 'Morrison & Morrison 1977, in Planetary Satellites (Burns, ed.), 363',
  '[29]': 'Morrison et al. 1984, in Saturn (Gehrels & Matthews, eds.), 609',
  '[39]': 'Veverka, Brown & Bell 1991, in Uranus (Bergstralh et al., eds.), 528',
  '[46]': 'Hicks & Buratti 2004, Icarus 171, 210',
  '[47]': 'Thomas, Veverka & Helfenstein 1991, JGR 96, 19253',
  '[48]': 'Karkoschka 2003, Icarus 162, 400',
  '[52]': 'Reinsch, Burwitz & Festou 1994, Icarus 108, 209',
  '[59]': 'Verbiscer et al. 2007, Science 315, 815 (Cassini-era V-band geometric albedos)',
};

/** 2015 SSD table (old uppercase HTML, rows not closed): geometric albedo with reference number. */
function parseSsdAlbedo(html) {
  const out = {};
  for (const chunk of html.split(/<TR[^>]*>/i).slice(1)) {
    const cells = [...chunk.matchAll(/<TD[^>]*>([\s\S]*?)<\/TD>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, '').replace(/&#177;|&plusmn;/g, '±').replace(/\s+/g, ' ').trim(),
    );
    // name, GM, [ref], radius, [ref], density, V0, [ref], albedo, [ref]  (a missing ref is an empty cell)
    if (cells.length < 10 || !/^[A-Z][a-z]+$/.test(cells[0])) continue;
    const m = /^([\d.]+)(?:±([\d.]+))?$/.exec(cells[8]);
    if (m) out[cells[0]] = { albedo: Number(m[1]), sigma: m[2] ? Number(m[2]) : undefined, ref: cells[9] || '(no ref)' };
  }
  return out;
}

function parseSsdElem(html) {
  const out = {};
  for (const c of parseTableRows(html)) {
    if (c.length < 10 || !/^\d{3}$/.test(c[1])) continue;
    out[c[0]] = { aKm: Number(c[2]), e: Number(c[3]), iDeg: Number(c[6]), periodD: Number(c[8]) };
  }
  return out;
}

function sbdb(id) {
  const d = JSON.parse(readRaw(`sbdb_${id}.json`));
  const phys = {};
  for (const p of d.phys_par ?? []) phys[p.name] = { value: p.value, sigma: p.sigma, units: p.units, ref: p.ref, notes: p.notes };
  return { object: d.object, phys, discovery: d.discovery, orbit: d.orbit };
}

function colourTable(text, nameCol) {
  // Average repeated measurements of each colour index per object (simple mean).
  const acc = {};
  for (const line of text.split(/\r?\n/)) {
    const m = nameCol(line);
    if (!m) continue;
    const { name, index, value } = m;
    if (!Number.isFinite(value)) continue;
    acc[name] ??= {};
    acc[name][index] ??= [];
    acc[name][index].push(value);
  }
  const out = {};
  for (const [n, idx] of Object.entries(acc)) {
    out[n] = {};
    for (const [k, v] of Object.entries(idx)) out[n][k] = v.reduce((s, x) => s + x, 0) / v.length;
  }
  return out;
}

// ─── Colour: display tint from colour indices (or measured imagery) ─────────────────────────

const SUN = { 'B-V': 0.642, 'V-R': 0.354, 'V-I': 0.688 };
const srgb = (lin) => {
  const c = Math.min(1, Math.max(0, lin));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};
const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Reflectance ratios relative to V from colour indices (object minus Sun), then linear RGB taken
 * as the reflectance at R (≈640 nm), V (550 nm) and B (440 nm). Missing R is extrapolated from the
 * B–V slope. Returns { hue: max-normalised linear RGB, tint: hex scaled to a display lightness set
 * by the geometric albedo }.
 */
function colourFromIndices(ci, albedo) {
  const rB = 'B-V' in ci ? 10 ** (-0.4 * (ci['B-V'] - SUN['B-V'])) : undefined;
  let rR = 'V-R' in ci ? 10 ** (0.4 * (ci['V-R'] - SUN['V-R'])) : undefined;
  if (rR === undefined && 'V-I' in ci) rR = 1 + (10 ** (0.4 * (ci['V-I'] - SUN['V-I'])) - 1) * (90 / 240);
  if (rR === undefined && rB !== undefined) rR = 1 + (1 - rB) * (90 / 110);
  if (rB === undefined || rR === undefined) return null;
  return fromLinear([rR, 1, rB], albedo);
}

function fromLinear(rgb, albedo) {
  const max = Math.max(...rgb);
  const hue = rgb.map((v) => v / max);
  const Y = 0.2126 * hue[0] + 0.7152 * hue[1] + 0.0722 * hue[2];
  // Display lightness: linear luminance 0.1 + 0.6·p (p = geometric albedo), capped at 0.7.
  const target = Math.min(0.7, Math.max(0.1, 0.1 + 0.6 * (albedo ?? 0.3)));
  const k = target / Y;
  return { tint: hex(hue.map((v) => srgb(v * k))), hue: hex(hue.map((v) => srgb(v))) };
}

// ─── Rotation helpers ───────────────────────────────────────────────────────────────────────

const NAIF = {
  phobos: 401, deimos: 402, io: 501, europa: 502, ganymede: 503, callisto: 504,
  mimas: 601, enceladus: 602, tethys: 603, dione: 604, rhea: 605, titan: 606, hyperion: 607, iapetus: 608,
  ariel: 701, umbriel: 702, titania: 703, oberon: 704, miranda: 705,
  triton: 801, nereid: 802, proteus: 808, charon: 901, nix: 902, hydra: 903,
  ceres: 2000001, vesta: 2000004, 'churyumov-gerasimenko': 1000012, halley: 1000036,
};
const SYSTEM_OF = (naif) => (naif < 1000 ? String(Math.floor(naif / 100)) : null);

function iauRotation(pck, naif, extra = {}) {
  const k = (s) => pck[`BODY${naif}_${s}`];
  if (!k('PM')) return null;
  const pad3 = (a) => [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];
  const sys = SYSTEM_OF(naif);
  const rot = {
    model: 'iau-2015',
    source: SRC.iau2015,
    frame: 'ICRF',
    poleRaDeg: pad3(k('POLE_RA')),
    poleDecDeg: pad3(k('POLE_DEC')),
    pmDeg: pad3(k('PM')),
    ...extra,
  };
  if (k('NUT_PREC_RA') || k('NUT_PREC_DEC') || k('NUT_PREC_PM')) {
    rot.phaseSystem = sys;
    rot.raTerms = k('NUT_PREC_RA') ?? [];
    rot.decTerms = k('NUT_PREC_DEC') ?? [];
    rot.pmTerms = k('NUT_PREC_PM') ?? [];
  }
  rot.periodH = +(Math.abs(360 / rot.pmDeg[1]) * 24).toPrecision(8);
  rot.sense = rot.pmDeg[1] >= 0 ? 'prograde' : 'retrograde';
  return rot;
}

function phaseSystems(pck) {
  const out = {};
  for (const s of ['4', '5', '6', '7', '8']) {
    const a = pck[`BODY${s}_NUT_PREC_ANGLES`];
    if (!a) continue;
    const degree = pck[`BODY${s}_MAX_PHASE_DEGREE`]?.[0] ?? 1;
    const n = degree + 1;
    const angles = [];
    for (let i = 0; i + n - 1 < a.length; i += n) angles.push(a.slice(i, i + n));
    out[s] = { degree, angles, units: 'degrees; coefficients of T, T² in degrees per Julian century (T = TDB days / 36525)' };
  }
  return out;
}

/** Haumea's rotational phase from the 2017-01-21 occultation (see the haumea entry). */
function haumeaW0() {
  const txt = readRaw('horizons_haumea_geocentric_20170121.txt');
  const soe = txt.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n')[0].split(',');
  const jdUtc = Number(soe[0]);
  const v = [Number(soe[2]), Number(soe[3]), Number(soe[4])]; // Earth → Haumea, ICRF, km (light-time corrected)
  const jdTdb = jdUtc + 69.184 / 86400; // TT − UTC = 69.184 s in 2017 (37 leap seconds + 32.184 s); TDB − TT < 2 ms
  const ra = 285.1 * DEG;
  const dec = -10.6 * DEG;
  const p = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const n = Math.hypot(...v);
  const d = v.map((x) => -x / n); // Haumea → Earth
  const dp = d[0] * p[0] + d[1] * p[1] + d[2] * p[2];
  const de = d.map((x, i) => x - dp * p[i]);
  const q = [Math.cos(ra + Math.PI / 2), Math.sin(ra + Math.PI / 2), 0]; // node of the body equator on the ICRF equator
  const q2 = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]; // p × q
  const W = Math.atan2(de[0] * q2[0] + de[1] * q2[1] + de[2] * q2[2], de[0] * q[0] + de[1] * q[1] + de[2] * q[2]) / DEG;
  const rate = 360 / (3.915341 / 24);
  const dOcc = jdTdb - 2451545.0;
  const w0 = ((((W - rate * dOcc) % 180) + 180) % 180); // the ellipsoid is symmetric under 180°
  return { w0: +w0.toFixed(4), rate: +rate.toFixed(6), jdTdbOcc: +jdTdb.toFixed(6), wAtOcc: +W.toFixed(3) };
}

// ─── Curated data ───────────────────────────────────────────────────────────────────────────
// Facts: three per body, plain British English; factSources[i] is the URL supporting facts[i].

const NASA = 'https://science.nasa.gov';

const CURATED = [
  // ── Mars ──
  {
    id: 'phobos', name: 'Phobos', kind: 'moon', parent: 'mars',
    discovery: { by: 'Asaph Hall', date: '1877-08-17', place: 'US Naval Observatory, Washington DC', source: `${NASA}/mars/moons/phobos/` },
    facts: [
      'Phobos circles Mars three times a day, so close to the surface that from Mars’s polar regions it never rises above the horizon.',
      'It is creeping inwards by about 1.8 m every century. In roughly 50 million years it will either hit Mars or be torn into a ring.',
      'Its largest crater, Stickney, is about 9 km across, a third of the moon’s own length. It is named after Chloe Angeline Stickney Hall, the mathematician married to its discoverer.',
    ],
    factSources: [`${NASA}/mars/moons/phobos/`, `${NASA}/mars/moons/phobos/`, `${NASA}/mars/moons/phobos/`],
  },
  {
    id: 'deimos', name: 'Deimos', kind: 'moon', parent: 'mars',
    discovery: { by: 'Asaph Hall', date: '1877-08-11', place: 'US Naval Observatory, Washington DC', source: `${NASA}/mars/moons/deimos/` },
    facts: [
      'Deimos is only about 12 km across, too small for its gravity to pull it round.',
      'A blanket of loose dust, perhaps 100 m deep, has partly filled its craters, so it looks much smoother than Phobos.',
      'Its name means dread. Phobos (fear) and Deimos are named after the sons of Ares, the Greek counterpart of Mars.',
    ],
    factSources: [`${NASA}/mars/moons/deimos/`, `${NASA}/mars/moons/deimos/`, `${NASA}/mars/moons/deimos/`],
  },
  // ── Jupiter ──
  {
    id: 'io', name: 'Io', kind: 'moon', parent: 'jupiter',
    discovery: { by: 'Galileo Galilei', date: '1610-01-08', place: 'Padua', note: 'Galileo saw it on 7 January but could not separate it from Europa until the next night.', source: `${NASA}/jupiter/jupiter-moons/io/facts/` },
    facts: [
      'Io is the most volcanically active world in the Solar System, with hundreds of volcanoes. Some throw lava fountains tens of kilometres high.',
      'Europa and Ganymede keep Io’s orbit slightly oval, so Jupiter’s pull flexes its solid surface up and down by as much as 100 m. That tidal kneading is what melts its interior.',
      'Io is an electric generator: moving through Jupiter’s magnetic field it develops about 400,000 volts and drives a current of some 3 million amperes into the planet.',
    ],
    factSources: [`${NASA}/jupiter/jupiter-moons/io/facts/`, `${NASA}/jupiter/jupiter-moons/io/facts/`, `${NASA}/jupiter/jupiter-moons/io/facts/`],
  },
  {
    id: 'europa', name: 'Europa', kind: 'moon', parent: 'jupiter',
    discovery: { by: 'Galileo Galilei', date: '1610-01-08', place: 'Padua', source: `${NASA}/jupiter/jupiter-moons/europa/europa-facts/` },
    facts: [
      'Under an ice shell probably 15 to 25 km thick lies an ocean 60 to 150 km deep. Europa is a quarter of Earth’s diameter, yet may hold twice as much water as all of Earth’s oceans.',
      'There are so few craters that its surface is thought to be only 40 to 90 million years old, young by planetary standards.',
      'NASA’s Europa Clipper, launched on 14 October 2024, is due to reach Jupiter in 2030 and make dozens of close flybys of Europa.',
    ],
    factSources: [`${NASA}/jupiter/jupiter-moons/europa/europa-facts/`, `${NASA}/jupiter/jupiter-moons/europa/europa-facts/`, `${NASA}/mission/europa-clipper/`],
  },
  {
    id: 'ganymede', name: 'Ganymede', kind: 'moon', parent: 'jupiter',
    discovery: { by: 'Galileo Galilei', date: '1610-01-07', place: 'Padua', source: `${NASA}/jupiter/jupiter-moons/ganymede/facts/` },
    facts: [
      'Ganymede is the largest moon in the Solar System, bigger than the planet Mercury.',
      'It is the only moon known to make its own magnetic field, which lights up aurorae around its poles. Hubble watched those aurorae rock back and forth and deduced a salty ocean below the ice.',
      'ESA’s Juice spacecraft, launched in April 2023, is due to go into orbit around Ganymede in December 2034: the first spacecraft to orbit a moon other than our own.',
    ],
    factSources: [`${NASA}/jupiter/jupiter-moons/ganymede/facts/`, 'https://doi.org/10.1002/2014JA020778', 'https://www.esa.int/Science_Exploration/Space_Science/Juice'],
  },
  {
    id: 'callisto', name: 'Callisto', kind: 'moon', parent: 'jupiter',
    discovery: { by: 'Galileo Galilei', date: '1610-01-07', place: 'Padua', source: `${NASA}/jupiter/jupiter-moons/callisto/facts/` },
    facts: [
      'Callisto’s surface is the oldest and most heavily cratered in the Solar System, about 4 billion years old.',
      'Valhalla, its largest impact scar, is a bright patch ringed by concentric ridges, about 3,000 km across in all.',
      'Callisto is the third-largest moon in the Solar System, about the same size as the planet Mercury.',
    ],
    factSources: [`${NASA}/jupiter/jupiter-moons/callisto/facts/`, 'https://planetarynames.wr.usgs.gov/Feature/6284', `${NASA}/jupiter/jupiter-moons/callisto/facts/`],
  },
  // ── Saturn ──
  {
    id: 'mimas', name: 'Mimas', kind: 'moon', parent: 'saturn',
    discovery: { by: 'William Herschel', date: '1789-09-17', place: 'Slough, England (40-foot reflector)', source: `${NASA}/saturn/moons/mimas/` },
    facts: [
      'Herschel crater is 130 km wide, about a third of Mimas’s own diameter. It gives the moon its famous resemblance to the Death Star.',
      'A slight wobble measured by Cassini points to an ocean hidden under the ice, one that formed within the last 25 million years (Lainey et al. 2024).',
      'William Herschel found Mimas in 1789 with his 40-foot reflecting telescope. From the ground it is only a faint point of light beside Saturn’s glare.',
    ],
    factSources: [`${NASA}/saturn/moons/mimas/`, 'https://doi.org/10.1038/s41586-023-06975-9', `${NASA}/saturn/moons/mimas/`],
  },
  {
    id: 'enceladus', name: 'Enceladus', kind: 'moon', parent: 'saturn',
    discovery: { by: 'William Herschel', date: '1789-08-28', place: 'Slough, England (40-foot reflector)', source: `${NASA}/saturn/moons/enceladus/` },
    facts: [
      'Enceladus has the whitest, most reflective surface in the Solar System: its geometric albedo is about 1.4.',
      'Jets near its south pole spray water vapour and ice grains from an underground ocean at about 400 m/s. The spray feeds Saturn’s faint E ring.',
      'Ice grains from the plume contain phosphates, as well as salts and organic molecules (Postberg et al. 2023). Phosphorus is one of the elements life needs.',
    ],
    factSources: ['https://doi.org/10.1126/science.1134681', `${NASA}/saturn/moons/enceladus/`, 'https://doi.org/10.1038/s41586-023-05987-9'],
  },
  {
    id: 'tethys', name: 'Tethys', kind: 'moon', parent: 'saturn',
    discovery: { by: 'Giovanni Domenico Cassini', date: '1684-03-21', place: 'Paris Observatory', source: `${NASA}/saturn/moons/tethys/` },
    facts: [
      'Its density, 0.98 g/cm³, is a little below that of water: Tethys is almost pure water ice.',
      'Odysseus, a crater about 445 km across, spans two-fifths of the moon’s diameter.',
      'Ithaca Chasma, a canyon about 100 km wide and several kilometres deep, runs roughly from pole to pole.',
    ],
    factSources: ['https://ssd.jpl.nasa.gov/sats/phys_par/', 'https://planetarynames.wr.usgs.gov/Feature/4406', `${NASA}/saturn/moons/tethys/`],
  },
  {
    id: 'dione', name: 'Dione', kind: 'moon', parent: 'saturn',
    discovery: { by: 'Giovanni Domenico Cassini', date: '1684-03-21', place: 'Paris Observatory', source: `${NASA}/saturn/moons/dione/` },
    facts: [
      'The bright wisps on Dione’s trailing side turned out, in Cassini images, to be ice cliffs along fractures, with darker material having fallen away to expose clean ice.',
      'Two small moons share its orbit: Helene 60° ahead of it and Polydeuces 60° behind.',
      'Dione takes 2.7 days to orbit Saturn, and like most large moons keeps one face turned towards the planet.',
    ],
    factSources: [`${NASA}/saturn/moons/dione/`, `${NASA}/saturn/moons/dione/`, `${NASA}/saturn/moons/dione/`],
  },
  {
    id: 'rhea', name: 'Rhea', kind: 'moon', parent: 'saturn',
    discovery: { by: 'Giovanni Domenico Cassini', date: '1672-12-23', place: 'Paris Observatory', source: `${NASA}/saturn/moons/rhea/` },
    facts: [
      'Rhea is Saturn’s second-largest moon, 1,527 km across, but has less than a third of Titan’s radius.',
      'In 2010 Cassini detected an extremely thin atmosphere of oxygen and carbon dioxide. It was the first time a spacecraft had directly captured molecules of an oxygen atmosphere at another world.',
      'Its low density, 1.24 g/cm³, means it is mostly water ice with a smaller share of rock.',
    ],
    factSources: [`${NASA}/saturn/moons/rhea/`, `${NASA}/saturn/moons/rhea/`, 'https://ssd.jpl.nasa.gov/sats/phys_par/'],
  },
  {
    id: 'titan', name: 'Titan', kind: 'moon', parent: 'saturn',
    discovery: { by: 'Christiaan Huygens', date: '1655-03-25', place: 'The Hague', source: `${NASA}/saturn/moons/titan/facts/` },
    facts: [
      'Titan is the only moon with a thick atmosphere, mostly nitrogen. It is also the only world besides Earth known to have liquid on its surface: seas and lakes of methane and ethane.',
      'In January 2005 ESA’s Huygens probe landed on Titan, still the most distant landing ever made.',
      'NASA’s Dragonfly rotorcraft is due to launch in 2028 and spend about three years flying between landing sites on Titan.',
    ],
    factSources: [`${NASA}/saturn/moons/titan/facts/`, 'https://www.esa.int/Science_Exploration/Space_Science/Cassini-Huygens', `${NASA}/saturn/moons/titan/exploration/`],
  },
  {
    id: 'hyperion', name: 'Hyperion', kind: 'moon', parent: 'saturn',
    discovery: { by: 'William Cranch Bond, George Phillips Bond and William Lassell (independently)', date: '1848-09-16', place: 'Harvard College Observatory; Liverpool', source: `${NASA}/saturn/moons/hyperion/` },
    facts: [
      'Hyperion tumbles chaotically. Its spin rate and axis change unpredictably, so no one can say which way it will face next year.',
      'Its density is only about 0.54 g/cm³: about 40% of its volume may be empty space, which gives it a sponge-like look (Thomas et al. 2007).',
      'It is the largest of Saturn’s non-spherical moons, about 360 × 266 × 205 km.',
    ],
    factSources: [`${NASA}/saturn/moons/hyperion/`, 'https://doi.org/10.1038/nature05779', `${NASA}/saturn/moons/hyperion/`],
  },
  {
    id: 'iapetus', name: 'Iapetus', kind: 'moon', parent: 'saturn',
    discovery: { by: 'Giovanni Domenico Cassini', date: '1671-10-25', place: 'Paris Observatory', source: `${NASA}/saturn/moons/iapetus/` },
    facts: [
      'One hemisphere is as dark as coal (albedo 0.03 to 0.05) and the other nearly as bright as snow (0.5 to 0.6). Dark dust warms the ice it lands on, which then evaporates and leaves the surface darker still.',
      'A ridge of mountains about 10 km high runs along much of its equator, giving it a walnut-like outline.',
      'Cassini noticed in 1671 that he could only see Iapetus on one side of Saturn, and guessed correctly that one side is much darker than the other.',
    ],
    factSources: ['https://doi.org/10.1126/science.1177132', `${NASA}/saturn/moons/iapetus/`, `${NASA}/saturn/moons/iapetus/`],
  },
  // ── Uranus ──
  {
    id: 'miranda', name: 'Miranda', kind: 'moon', parent: 'uranus',
    discovery: { by: 'Gerard P. Kuiper', date: '1948-02-16', place: 'McDonald Observatory, Texas', source: `${NASA}/uranus/moons/miranda/` },
    facts: [
      'Miranda has three huge ‘coronae’, patches of parallel ridges and grooves hundreds of kilometres across, unlike anything else known in the Solar System.',
      'It was the last moon of Uranus found before Voyager 2 arrived: Gerard Kuiper spotted it on photographs in 1948.',
      'Voyager 2’s flyby in January 1986 is still the only close look. Uranus’s south pole faced the Sun then, so only the southern hemisphere could be mapped.',
    ],
    factSources: [`${NASA}/uranus/moons/miranda/`, `${NASA}/uranus/moons/miranda/`, 'https://doi.org/10.1126/science.233.4759.43'],
  },
  {
    id: 'ariel', name: 'Ariel', kind: 'moon', parent: 'uranus',
    discovery: { by: 'William Lassell', date: '1851-10-24', place: 'Liverpool', source: `${NASA}/uranus/moons/ariel/` },
    facts: [
      'Ariel has the brightest surface of Uranus’s five large moons, cut by long fault valleys.',
      'The James Webb Space Telescope found carbon dioxide ice concentrated on its trailing side, and possible carbonate minerals (Cartwright et al. 2024).',
      'Lassell paid for his telescope with money from his brewing business.',
    ],
    factSources: [`${NASA}/uranus/moons/ariel/`, 'https://doi.org/10.3847/2041-8213/ad566a', `${NASA}/uranus/moons/ariel/`],
  },
  {
    id: 'umbriel', name: 'Umbriel', kind: 'moon', parent: 'uranus',
    discovery: { by: 'William Lassell', date: '1851-10-24', place: 'Liverpool', source: `${NASA}/uranus/moons/umbriel/` },
    facts: [
      'Umbriel is the darkest of Uranus’s large moons, with a surface about as dark as the highlands of Earth’s Moon.',
      'Its surface is old and heavily cratered, showing few signs of the geological activity seen on Ariel and Titania.',
      'William Lassell found Umbriel on the same night as Ariel, 24 October 1851.',
    ],
    factSources: [`${NASA}/uranus/moons/umbriel/`, `${NASA}/uranus/moons/umbriel/`, `${NASA}/uranus/moons/umbriel/`],
  },
  {
    id: 'titania', name: 'Titania', kind: 'moon', parent: 'uranus',
    discovery: { by: 'William Herschel', date: '1787-01-11', place: 'Slough, England', source: `${NASA}/uranus/moons/titania/` },
    facts: [
      'Titania is Uranus’s largest moon, 1,577 km across.',
      'Fault valleys up to about 1,600 km long cross its surface, signs that the crust was once pulled apart.',
      'Herschel found Titania and Oberon on the same night, less than six years after he discovered Uranus itself.',
    ],
    factSources: ['https://ssd.jpl.nasa.gov/sats/phys_par/', `${NASA}/uranus/moons/titania/`, `${NASA}/uranus/moons/titania/`],
  },
  {
    id: 'oberon', name: 'Oberon', kind: 'moon', parent: 'uranus',
    discovery: { by: 'William Herschel', date: '1787-01-11', place: 'Slough, England', source: `${NASA}/uranus/moons/oberon/` },
    facts: [
      'Oberon orbits about 584,000 km from Uranus, the farthest out of the planet’s five major moons.',
      'Some of its craters, such as Hamlet, have dark floors, possibly material that welled up from inside.',
      'Voyager 2 caught a mountain about 6 km high on its limb.',
    ],
    factSources: ['https://ssd.jpl.nasa.gov/sats/elem/sep.html', 'https://planetarynames.wr.usgs.gov/Feature/2340', `${NASA}/uranus/moons/oberon/`],
  },
  // ── Neptune ──
  {
    id: 'triton', name: 'Triton', kind: 'moon', parent: 'neptune',
    discovery: { by: 'William Lassell', date: '1846-10-10', place: 'Liverpool', note: '17 days after Neptune itself was found.', source: `${NASA}/neptune/moons/triton/` },
    facts: [
      'Triton is the only large moon that orbits backwards, against its planet’s spin. It was probably a Kuiper Belt object captured by Neptune.',
      'Voyager 2 found active geysers on Triton in 1989. Their dark plumes rose about 8 km before drifting downwind in its thin nitrogen atmosphere.',
      'Its surface, at about −235 °C, is one of the coldest ever measured in the Solar System.',
    ],
    factSources: [`${NASA}/neptune/moons/triton/`, 'https://doi.org/10.1126/science.250.4979.410', `${NASA}/neptune/moons/triton/`],
  },
  {
    id: 'proteus', name: 'Proteus', kind: 'moon', parent: 'neptune',
    discovery: { by: 'Voyager 2 imaging team (Stephen P. Synnott)', date: '1989-06', place: 'Voyager 2 images', source: `${NASA}/neptune/moons/proteus/` },
    facts: [
      'Proteus is about 420 km across and box-shaped. With a little more mass its own gravity would have pulled it into a sphere.',
      'It is larger than Nereid, yet was only found by Voyager 2 in 1989: it orbits so close to Neptune that the planet’s glare hid it from telescopes.',
      'It circles Neptune every 27 hours.',
    ],
    factSources: [`${NASA}/neptune/moons/proteus/`, `${NASA}/neptune/moons/proteus/`, `${NASA}/neptune/moons/proteus/`],
  },
  {
    id: 'nereid', name: 'Nereid', kind: 'moon', parent: 'neptune',
    discovery: { by: 'Gerard P. Kuiper', date: '1949-05-01', place: 'McDonald Observatory, Texas', source: `${NASA}/neptune/moons/nereid/` },
    facts: [
      'Nereid has one of the most eccentric orbits of any moon: its distance from Neptune swings between about 1.4 and 9.7 million km.',
      'One orbit takes about 360 days.',
      'It was the last moon of Neptune found before Voyager 2 arrived in 1989.',
    ],
    factSources: ['https://ssd.jpl.nasa.gov/sats/elem/sep.html', `${NASA}/neptune/moons/nereid/`, `${NASA}/neptune/moons/nereid/`],
  },
  // ── Pluto ──
  {
    id: 'charon', name: 'Charon', kind: 'moon', parent: 'pluto',
    discovery: { by: 'James W. Christy and Robert S. Harrington', date: '1978-06-22', place: 'US Naval Observatory, Flagstaff, Arizona', source: `${NASA}/dwarf-planets/pluto/moons/charon/` },
    facts: [
      'Charon is half Pluto’s size, the largest moon relative to its parent. Both orbit a point in the space between them.',
      'Pluto and Charon are locked face to face: each always shows the other the same side, turning once every 6.4 days.',
      'Its reddish north polar cap, Mordor Macula, is probably methane that escaped from Pluto, froze onto Charon and was darkened by sunlight (Grundy et al. 2016).',
    ],
    factSources: [`${NASA}/dwarf-planets/pluto/moons/charon/`, `${NASA}/dwarf-planets/pluto/moons/charon/`, 'https://doi.org/10.1038/nature19340'],
  },
  {
    id: 'nix', name: 'Nix', kind: 'moon', parent: 'pluto',
    discovery: { by: 'Harold A. Weaver, S. Alan Stern and the Hubble Pluto companion search team', date: '2005-06', place: 'Hubble Space Telescope', note: 'Found in images taken on 15 May 2005; announced 31 October 2005.', source: `${NASA}/dwarf-planets/pluto/moons/nix/` },
    facts: [
      'Nix is about 50 × 35 × 33 km, shaped roughly like a jelly bean.',
      'Like Pluto’s other small moons it tumbles chaotically, because Pluto and Charon pull on it from constantly changing directions (Showalter & Hamilton 2015).',
      'Its surface reflects more than half the light that hits it, which points to fairly clean water ice.',
    ],
    factSources: ['https://doi.org/10.1126/science.aae0030', 'https://doi.org/10.1038/nature14469', 'https://doi.org/10.1126/science.aae0030'],
  },
  {
    id: 'hydra', name: 'Hydra', kind: 'moon', parent: 'pluto',
    discovery: { by: 'Harold A. Weaver, S. Alan Stern and the Hubble Pluto companion search team', date: '2005-06', place: 'Hubble Space Telescope', note: 'Found in images taken on 15 May 2005; announced 31 October 2005.', source: `${NASA}/dwarf-planets/pluto/moons/hydra/` },
    facts: [
      'Hydra spins once every 10.3 hours, while taking 38 days to orbit Pluto.',
      'It reflects about 83% of the light that falls on it, so its surface is probably nearly pure water ice.',
      'It is the outermost of Pluto’s five known moons, about 65,000 km from the centre of the system.',
    ],
    factSources: ['https://doi.org/10.1126/science.aae0030', 'https://doi.org/10.1126/science.aae0030', 'https://ssd.jpl.nasa.gov/sats/elem/sep.html'],
  },
  // ── Dwarf planets and asteroids ──
  {
    id: 'ceres', name: 'Ceres', kind: 'dwarf-planet',
    discovery: { by: 'Giuseppe Piazzi', date: '1801-01-01', place: 'Palermo Observatory', source: `${NASA}/dwarf-planets/ceres/facts/` },
    facts: [
      'Ceres is the largest object in the asteroid belt, about 940 km across, and holds a quarter of the belt’s mass.',
      'The bright spots in Occator crater are sodium carbonate salts, left behind when briny water reached the surface and evaporated (De Sanctis et al. 2016).',
      'It was called a planet when Piazzi found it in 1801, an asteroid for most of the next two centuries, and a dwarf planet since 2006.',
    ],
    factSources: [`${NASA}/dwarf-planets/ceres/facts/`, 'https://doi.org/10.1038/nature18290', `${NASA}/dwarf-planets/ceres/facts/`],
  },
  {
    id: 'vesta', name: 'Vesta', kind: 'asteroid',
    kindNote: 'Vesta is an asteroid (a minor planet), not a dwarf planet: a differentiated protoplanet, the second most massive body in the asteroid belt.',
    discovery: { by: 'Heinrich Wilhelm Olbers', date: '1807-03-29', place: 'Bremen', source: `${NASA}/solar-system/asteroids/4-vesta/` },
    facts: [
      'Rheasilvia, the impact basin at Vesta’s south pole, is about 500 km wide, some 95% of Vesta’s mean diameter.',
      'Howardite, eucrite and diogenite meteorites found on Earth appear to be pieces of Vesta.',
      'NASA’s Dawn orbited Vesta from July 2011 to September 2012, then left for Ceres. It was the first spacecraft to orbit two worlds beyond the Earth–Moon system.',
    ],
    factSources: [`${NASA}/solar-system/asteroids/4-vesta/`, `${NASA}/solar-system/asteroids/4-vesta/`, `${NASA}/solar-system/asteroids/4-vesta/`],
  },
  {
    id: 'eris', name: 'Eris', kind: 'dwarf-planet',
    discovery: { by: 'Michael E. Brown, Chad A. Trujillo and David L. Rabinowitz', date: '2005-01-05', place: 'Palomar Observatory', note: 'Found on 5 January 2005 in images taken on 21 October 2003.', source: `${NASA}/dwarf-planets/eris/` },
    facts: [
      'Eris is almost exactly Pluto’s size, 2,326 km across, but about a quarter more massive.',
      'Its discovery led the IAU to define ‘dwarf planet’ in 2006, the decision that reclassified Pluto.',
      'It is now close to its farthest from the Sun, about 96 au away. Sunlight takes more than 13 hours to reach it.',
    ],
    factSources: ['https://doi.org/10.1038/nature10550', `${NASA}/dwarf-planets/eris/`, 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=136199'],
  },
  {
    id: 'haumea', name: 'Haumea', kind: 'dwarf-planet',
    discovery: {
      by: 'Disputed: José Luis Ortiz’s team (Sierra Nevada Observatory) announced it in July 2005, from images taken in March 2003; Michael Brown’s team (Caltech) had been tracking it since December 2004',
      date: '2003-03-07',
      place: 'Sierra Nevada Observatory, Spain (credited site)',
      note: 'The Minor Planet Center credits the Sierra Nevada observations; the IAU adopted the name proposed by Brown’s team.',
      source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=136108',
    },
    facts: [
      'Haumea spins once every 3.9 hours, one of the fastest rotations of any large body. The spin has stretched it into an ellipsoid whose longest axis, about 2,320 km, is more than twice its shortest, about 1,030 km.',
      'A stellar occultation in January 2017 revealed a ring about 70 km wide, 2,287 km from its centre: the first ring found around a body beyond Neptune.',
      'Two moons, Hiʻiaka and Namaka, orbit Haumea. A large impact long ago may have set it spinning and created them.',
    ],
    factSources: ['https://doi.org/10.1038/nature24051', 'https://doi.org/10.1038/nature24051', `${NASA}/dwarf-planets/haumea/`],
  },
  {
    id: 'makemake', name: 'Makemake', kind: 'dwarf-planet',
    discovery: { by: 'Michael E. Brown, Chad A. Trujillo and David L. Rabinowitz', date: '2005-03-31', place: 'Palomar Observatory', source: `${NASA}/dwarf-planets/makemake/` },
    facts: [
      'After Pluto, Makemake is the second-brightest object in the Kuiper Belt as seen from Earth.',
      'It was found a few days after Easter 2005, and nicknamed ‘Easterbunny’. Makemake is the creator god of the people of Rapa Nui (Easter Island).',
      'When it passed in front of a star in 2011, the starlight vanished and reappeared abruptly: Makemake has no global atmosphere (Ortiz et al. 2012).',
    ],
    factSources: [`${NASA}/dwarf-planets/makemake/`, `${NASA}/dwarf-planets/makemake/`, 'https://doi.org/10.1038/nature11597'],
  },
  {
    id: 'gonggong', name: 'Gonggong', kind: 'tno', dwarfPlanetCandidate: true,
    kindNote: 'The IAU recognises five dwarf planets (Ceres, Pluto, Eris, Haumea, Makemake); this large trans-Neptunian object is widely considered a candidate but has not been classified as one.',
    discovery: { by: 'Megan E. Schwamb, Michael E. Brown and David L. Rabinowitz', date: '2007-07-17', place: 'Palomar Observatory', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=225088' },
    facts: [
      'Gonggong is about 1,230 km across, one of the largest bodies beyond Neptune.',
      'Its small moon, Xiangliu, let astronomers weigh it: about 1.75 × 10²¹ kg (Kiss et al. 2019).',
      'Known for years as 2007 OR10, it was named in 2020 after a Chinese water god, following a public vote.',
    ],
    factSources: ['https://doi.org/10.1016/j.icarus.2019.03.013', 'https://doi.org/10.1016/j.icarus.2019.03.013', 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=225088'],
  },
  {
    id: 'quaoar', name: 'Quaoar', kind: 'tno', dwarfPlanetCandidate: true,
    kindNote: 'The IAU recognises five dwarf planets (Ceres, Pluto, Eris, Haumea, Makemake); this large trans-Neptunian object is widely considered a candidate but has not been classified as one.',
    discovery: { by: 'Chad A. Trujillo and Michael E. Brown', date: '2002-06-04', place: 'Palomar Observatory', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=50000' },
    facts: [
      'Quaoar is about 1,090 km across, measured by timing how long it blocked the light of background stars (Pereira et al. 2023).',
      'It has a ring about 4,100 km from its centre, more than seven times its own radius. That is far outside the Roche limit, where rings were thought unable to survive (Morgado et al. 2023).',
      'A second ring was found closer in, about 2,500 km from its centre (Pereira et al. 2023).',
    ],
    factSources: ['https://doi.org/10.1051/0004-6361/202346365', 'https://doi.org/10.1038/s41586-022-05629-6', 'https://doi.org/10.1051/0004-6361/202346365'],
  },
  {
    id: 'sedna', name: 'Sedna', kind: 'tno', dwarfPlanetCandidate: true,
    kindNote: 'The IAU recognises five dwarf planets (Ceres, Pluto, Eris, Haumea, Makemake); this large trans-Neptunian object is widely considered a candidate but has not been classified as one. Strictly it is a detached object, far beyond the Kuiper Belt for its whole orbit.',
    discovery: { by: 'Michael E. Brown, Chad A. Trujillo and David L. Rabinowitz', date: '2003-11-14', place: 'Palomar Observatory', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=90377' },
    facts: [
      'Sedna never comes closer to the Sun than about 76 au, well beyond Neptune, and swings out to roughly 1,000 au.',
      'One orbit takes over 11,000 years. It next passes closest to the Sun around 2076.',
      'Sedna is one of the reddest objects in the Solar System, about 1,000 km across (Pál et al. 2012).',
    ],
    factSources: ['https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=90377', 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=90377', 'https://doi.org/10.1051/0004-6361/201218874'],
  },
  {
    id: 'orcus', name: 'Orcus', kind: 'tno', dwarfPlanetCandidate: true,
    kindNote: 'The IAU recognises five dwarf planets (Ceres, Pluto, Eris, Haumea, Makemake); this large trans-Neptunian object is widely considered a candidate but has not been classified as one.',
    discovery: { by: 'Michael E. Brown, Chad A. Trujillo and David L. Rabinowitz', date: '2004-02-17', place: 'Palomar Observatory', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=90482' },
    facts: [
      'Orcus is locked in the same 2:3 resonance with Neptune as Pluto, but on the opposite side of the Sun from it: it is sometimes called the ‘anti-Pluto’.',
      'Its moon Vanth is unusually large, roughly half Orcus’s diameter (Brown & Butler 2017).',
      'Orcus is named after the Etruscan and Roman god of the underworld, the counterpart of Pluto.',
    ],
    factSources: ['https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=90482', 'https://doi.org/10.3847/1538-3881/aa6346', 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=90482'],
  },
  {
    id: 'arrokoth', name: 'Arrokoth', kind: 'tno',
    kindNote: 'A small cold classical Kuiper Belt object (a contact binary about 36 km long), not a dwarf planet.',
    discovery: { by: 'New Horizons search team (Marc W. Buie et al.)', date: '2014-06-26', place: 'Hubble Space Telescope', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=486958' },
    facts: [
      'On 1 January 2019 New Horizons flew about 3,500 km from Arrokoth, the most distant object ever explored up close.',
      'Its two lobes, Wenu and Weeyo, seem to have touched gently, at walking pace or less, which supports the idea that they formed from a collapsing cloud of pebbles (McKinnon et al. 2020).',
      'Arrokoth means ‘sky’ in the Powhatan language of the Chesapeake Bay region.',
    ],
    factSources: ['https://doi.org/10.1126/science.aaw9771', 'https://doi.org/10.1126/science.aay6620', 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=486958'],
  },
  // ── Comets ──
  {
    id: 'halley', name: '1P/Halley', kind: 'comet',
    discovery: { by: 'Known since antiquity; Edmond Halley showed in 1705 that the comets of 1531, 1607 and 1682 were one object', date: '1705', place: 'Oxford', note: 'Halley predicted its return; Johann Georg Palitzsch recovered it on 25 December 1758.', source: `${NASA}/solar-system/comets/1p-halley/` },
    facts: [
      'In 1705 Edmond Halley used Newton’s laws to show that several historic comets were one object returning about every 76 years. He predicted it would return in 1758, and it did.',
      'In 1986 ESA’s Giotto flew within about 600 km of its nucleus and photographed it: a dark, peanut-shaped body about 15 × 8 km.',
      'It is next due at perihelion in 2061. Its dust causes two meteor showers each year, the Eta Aquariids in May and the Orionids in October.',
    ],
    factSources: [`${NASA}/solar-system/comets/1p-halley/`, `${NASA}/solar-system/comets/1p-halley/`, `${NASA}/solar-system/comets/1p-halley/`],
  },
  {
    id: 'encke', name: '2P/Encke', kind: 'comet',
    discovery: { by: 'Pierre F. A. Méchain', date: '1786-01-17', place: 'Paris', note: 'Johann Franz Encke computed its orbit in 1819, linking several sightings.', source: `${NASA}/solar-system/comets/2p-encke/` },
    facts: [
      'Encke goes round the Sun every 3.3 years, the shortest period of any well-known comet.',
      'It is the parent of the Taurid meteors, which peak in October and November and are known for fireballs.',
      'It was only the second comet shown to return, after Halley’s, when Encke linked its appearances in 1819.',
    ],
    factSources: [`${NASA}/solar-system/comets/2p-encke/`, `${NASA}/solar-system/comets/2p-encke/`, `${NASA}/solar-system/comets/2p-encke/`],
  },
  {
    id: 'churyumov-gerasimenko', name: '67P/Churyumov–Gerasimenko', kind: 'comet',
    discovery: { by: 'Klim Churyumov, on a photographic plate taken by Svetlana Gerasimenko', date: '1969-10-22', place: 'Alma-Ata Observatory (plate exposed 11 September 1969)', source: `${NASA}/solar-system/comets/67p-churyumov-gerasimenko/` },
    facts: [
      '67P was the first comet to be orbited and landed on. ESA’s Rosetta arrived in August 2014, and its lander Philae touched down on 12 November 2014.',
      'Its two lobes give it a rubber-duck shape about 4 km long. With a density of about 0.53 g/cm³ it would float in water: the nucleus is very porous (Pätzold et al. 2016).',
      'Rosetta ended its mission on 30 September 2016 with a slow, controlled landing on the comet.',
    ],
    factSources: [`${NASA}/solar-system/comets/67p-churyumov-gerasimenko/`, 'https://doi.org/10.1038/nature16535', 'https://www.esa.int/Science_Exploration/Space_Science/Rosetta'],
  },
  {
    id: 'hale-bopp', name: 'C/1995 O1 (Hale–Bopp)', kind: 'comet',
    discovery: { by: 'Alan Hale and Thomas Bopp (independently)', date: '1995-07-23', place: 'Cloudcroft, New Mexico; near Stanfield, Arizona', source: `${NASA}/solar-system/comets/c-1995-o1-hale-bopp/` },
    facts: [
      'Hale–Bopp stayed visible to the naked eye for about 18 months in 1996 and 1997, a record.',
      'Its nucleus is unusually large, roughly 60 km across.',
      'It takes about 2,530 years to go round the Sun, so it will not be back until around the year 4530.',
    ],
    factSources: [`${NASA}/solar-system/comets/c-1995-o1-hale-bopp/`, `${NASA}/solar-system/comets/c-1995-o1-hale-bopp/`, `${NASA}/solar-system/comets/c-1995-o1-hale-bopp/`],
  },
  // ── Interstellar objects ──
  {
    id: 'oumuamua', name: '1I/ʻOumuamua', kind: 'interstellar',
    discovery: { by: 'Robert Weryk (Pan-STARRS1)', date: '2017-10-19', place: 'Haleakalā, Hawaiʻi', source: `${NASA}/solar-system/comets/oumuamua/` },
    facts: [
      'ʻOumuamua was the first object known to have come from another star. Its name is Hawaiian for a messenger from afar arriving first.',
      'No telescope ever resolved it. Its elongated or flattened shape is inferred only from how its brightness changed as it tumbled (Meech et al. 2017).',
      'As it left, it sped up slightly without any visible coma or tail (Micheli et al. 2018). Escaping hydrogen trapped in its ice is one proposed explanation (Bergner & Seligman 2023).',
    ],
    factSources: [`${NASA}/solar-system/comets/oumuamua/`, 'https://doi.org/10.1038/nature25020', 'https://doi.org/10.1038/s41586-018-0254-4'],
  },
  {
    id: 'borisov', name: '2I/Borisov', kind: 'interstellar',
    discovery: { by: 'Gennady Borisov', date: '2019-08-30', place: 'MARGO observatory, Nauchnij, Crimea (0.65 m telescope he built himself)', source: `${NASA}/solar-system/comets/2i-borisov/` },
    facts: [
      'The first known interstellar comet was found by an amateur astronomer, Gennady Borisov, with a telescope he built himself.',
      'It looked much like comets born around the Sun, but held unusually large amounts of carbon monoxide (Cordiner et al. 2020; Bodewits et al. 2020).',
      'It left at about 32 km/s relative to the Sun, on an orbit with an eccentricity of about 3.4.',
    ],
    factSources: [`${NASA}/solar-system/comets/2i-borisov/`, 'https://doi.org/10.1038/s41550-020-1087-2', 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=2I'],
  },
  {
    id: 'atlas-3i', name: '3I/ATLAS', kind: 'interstellar',
    discovery: { by: 'ATLAS survey (Asteroid Terrestrial-impact Last Alert System)', date: '2025-07-01', place: 'Río Hurtado, Chile', note: 'Pre-discovery images go back to 14 June 2025.', source: `${NASA}/solar-system/comets/3i-atlas/` },
    facts: [
      '3I/ATLAS is the third object known to have come from another star, reported by the ATLAS survey telescope in Chile on 1 July 2025.',
      'It passed closest to the Sun around 30 October 2025, about 1.4 au out, just inside Mars’s orbit. Spacecraft at Mars photographed it that October.',
      'Hubble’s images limit its nucleus to between about 0.44 and 5.6 km across. It is leaving at about 58 km/s relative to the Sun.',
    ],
    factSources: [`${NASA}/solar-system/comets/3i-atlas/`, `${NASA}/solar-system/comets/3i-atlas/`, `${NASA}/solar-system/comets/3i-atlas/`],
  },
  // ── Spacecraft ──
  {
    id: 'voyager1', name: 'Voyager 1', kind: 'spacecraft',
    facts: [
      'Voyager 1 has been the most distant human-made object since 17 February 1998, when it overtook Pioneer 10 at 69.4 au from the Sun.',
      'On 25 August 2012 it became the first spacecraft to leave the heliosphere, the bubble of solar wind around the Sun, and begin measuring interstellar space.',
      'On 18 November 2026 Voyager 1 is due to reach one light-day from Earth, about 25.9 billion km: no human-made object has been that far.',
    ],
    factSources: [`${NASA}/mission/voyager/voyager-1/`, `${NASA}/mission/voyager/voyager-1/`, `${NASA}/mission/voyager/where-are-voyager-1-and-voyager-2-now/`],
  },
  {
    id: 'voyager2', name: 'Voyager 2', kind: 'spacecraft',
    facts: [
      'Voyager 2 is the only spacecraft to have visited Uranus (January 1986) and Neptune (August 1989).',
      'It crossed the heliopause into interstellar space on 5 November 2018, about 119 au from the Sun (Stone et al. 2019).',
      'To save power NASA has switched most of its instruments off. Three still work: the magnetometer, the plasma wave instrument and the cosmic ray detector.',
    ],
    factSources: [`${NASA}/mission/voyager/voyager-2/`, 'https://doi.org/10.1038/s41550-019-0928-3', `${NASA}/mission/voyager/where-are-voyager-1-and-voyager-2-now/`],
  },
  {
    id: 'new-horizons', name: 'New Horizons', kind: 'spacecraft',
    facts: [
      'New Horizons flew 12,500 km from Pluto on 14 July 2015, the first close look at the dwarf planet and its moons.',
      'On 1 January 2019 it flew past Arrokoth, the most distant object ever explored up close.',
      'A plutonium-powered generator (RTG) keeps it running, because sunlight at that distance is far too weak for solar panels.',
    ],
    factSources: [`${NASA}/mission/new-horizons/`, `${NASA}/mission/new-horizons/`, `${NASA}/mission/new-horizons/`],
  },
  {
    id: 'pioneer10', name: 'Pioneer 10', kind: 'spacecraft',
    facts: [
      'Pioneer 10 was the first spacecraft to cross the asteroid belt and the first to fly past Jupiter, in December 1973.',
      'Its last signal reached Earth in January 2003, from 12.2 billion km away.',
      'It is heading roughly towards the red star Aldebaran, which it will pass in about two million years. It carries a plaque telling any finder where and when it came from.',
    ],
    factSources: [`${NASA}/mission/pioneer-10/`, `${NASA}/mission/pioneer-10/`, `${NASA}/mission/pioneer-10/`],
  },
  {
    id: 'parker-solar-probe', name: 'Parker Solar Probe', kind: 'spacecraft',
    facts: [
      'On 24 December 2024 it passed 6.1 million km from the Sun’s surface, closer than any spacecraft before, at about 692,000 km/h.',
      'A carbon-composite heat shield 11.4 cm thick takes temperatures near 1,400 °C, while the instruments behind it stay near room temperature.',
      'It was the first NASA mission named after a living person: Eugene Parker, who predicted the solar wind in the 1950s.',
    ],
    factSources: ['https://www.nasa.gov/news-release/nasas-parker-solar-probe-makes-history-with-closest-pass-to-sun/', `${NASA}/mission/parker-solar-probe/`, `${NASA}/mission/parker-solar-probe/`],
  },
  {
    id: 'jwst', name: 'James Webb Space Telescope', kind: 'spacecraft',
    facts: [
      'Webb launched on 25 December 2021 and orbits the Sun near the second Lagrange point, about 1.5 million km beyond Earth.',
      'Its primary mirror is 6.5 m across, made of 18 gold-coated beryllium segments that unfolded in space.',
      'A five-layer sunshield about the size of a tennis court keeps the telescope cold enough to see faint infrared light.',
    ],
    factSources: [`${NASA}/mission/webb/`, 'https://webb.nasa.gov/content/observatory/ote/mirrors/index.html', 'https://webb.nasa.gov/content/about/faqs/facts.html'],
  },
  {
    id: 'juno', name: 'Juno', kind: 'spacecraft',
    facts: [
      'Juno reached Jupiter on 5 July 2016 (UTC) and loops over its poles every few weeks, skimming about 4,000 km above the cloud tops at each closest pass.',
      'It is the first spacecraft to work at Jupiter on solar power: three solar arrays about 9 m long, 20 m from tip to tip.',
      'In its extended mission it flew close past Ganymede (June 2021), Europa (September 2022) and Io (December 2023 and February 2024).',
    ],
    factSources: [`${NASA}/mission/juno/`, `${NASA}/mission/juno/`, `${NASA}/mission/juno/`],
  },
  {
    id: 'europa-clipper', name: 'Europa Clipper', kind: 'spacecraft',
    facts: [
      'Europa Clipper is the largest spacecraft NASA has built for a planetary mission: its solar arrays span 30.5 m.',
      'From 2031 it is to fly past Europa 49 times, as low as 25 km, to study the ocean thought to lie beneath its ice.',
      'On the way it borrows speed from Mars (1 March 2025) and from Earth (December 2026), and reaches Jupiter in April 2030.',
    ],
    factSources: [`${NASA}/mission/europa-clipper/`, `${NASA}/mission/europa-clipper/`, `${NASA}/mission/europa-clipper/`],
  },
  {
    id: 'soho', name: 'SOHO', kind: 'spacecraft',
    facts: [
      'The Solar and Heliospheric Observatory (ESA and NASA) has watched the Sun from near the Sun–Earth L1 point, 1.5 million km sunward of Earth, since early 1996.',
      'It has found more than 5,000 comets, most of them sungrazers, many spotted in its images by amateur astronomers.',
      'Contact was lost in June 1998; engineers found it again and had it back at work within months.',
    ],
    factSources: [`${NASA}/mission/soho/`, `${NASA}/mission/soho/`, 'https://www.esa.int/Science_Exploration/Space_Science/SOHO'],
  },
];

// Physical data that the machine-readable sources lack or that newer papers supersede.
// Radii in km (mean = radius of the sphere of equal volume). Each entry lists its source.
const PHYS = {
  // Satellites: mean radius and GM come from the SSD table; triaxial radii from IAU 2015 (pck00011).
  nix: { triaxialRadiiKm: [25, 17.5, 16.5], triaxialSource: SRC.weaver2016 + ' (full axes 50 × 35 × 33 km ± 3 km)', geometricAlbedo: 0.56, albedoSigma: 0.05, albedoSource: SRC.weaver2016 },
  hydra: { triaxialRadiiKm: [32.5, 22.5, 12.5], triaxialSource: SRC.weaver2016 + ' (full axes 65 × 45 × 25 km ± 10 km)', geometricAlbedo: 0.83, albedoSigma: 0.08, albedoSource: SRC.weaver2016 },
  umbriel: { albedoNote: 'This is the geometric albedo (brightness at zero phase angle relative to a flat white disc). NASA’s Umbriel page says it reflects 16% of the light that strikes it, a different measure of reflectivity, so the two numbers are not directly comparable.' },
  iapetus: { albedoNote: 'Bright trailing hemisphere. The dark leading hemisphere (Cassini Regio) has an albedo of only 0.03 to 0.05 (NASA).' },
  hyperion: { triaxialRadiiKm: [180.1, 133, 102.7], triaxialSource: 'Thomas et al. 2007, Nature 448, 50, https://doi.org/10.1038/nature05779 (360.2 × 266 × 205.4 km)' },
  nereid: { rotationPeriodH: 11.594, rotationSource: 'Kiss et al. 2016, MNRAS 457, 2908, https://doi.org/10.1093/mnras/stw081 (K2 light curve)' },
  ceres: {
    radiusKm: 469.7, radiusSigmaKm: 0.1, radiusType: 'mean', radiusSource: 'Park et al. 2016, Nature 537, 515 (mean diameter 939.4 ± 0.2 km), via ' + SRC.sbdb,
    triaxialRadiiKm: [482.2, 482.1, 445.9], triaxialSource: 'Park et al. 2016, Nature 537, 515, https://doi.org/10.1038/nature18955 (964.4 × 964.2 × 891.8 km)',
  },
  vesta: {
    radiusKm: 261.385, radiusSigmaKm: 0.05, radiusType: 'mean', radiusSource: 'Park et al. 2025, Nature Astronomy, https://doi.org/10.1038/s41550-025-02533-7 (mean diameter 522.77 km), via ' + SRC.sbdb,
    triaxialRadiiKm: [284.62, 277.24, 226.33], triaxialSource: 'Park et al. 2025, Nature Astronomy (569.24 × 554.48 × 452.66 km), via ' + SRC.sbdb,
  },
  eris: {
    radiusKm: 1163, radiusSigmaKm: 6, radiusType: 'mean', radiusSource: 'Sicardy et al. 2011, Nature 478, 493, https://doi.org/10.1038/nature10550 (occultation, diameter 2326 ± 12 km)',
    gmKm3S2: 1.6466e22 * 6.6743e-20, gmSource: 'Holler et al. 2021, Icarus 355, 114130, https://doi.org/10.1016/j.icarus.2020.114130 (mass 1.6466 ± 0.0085 × 10²² kg, from Dysnomia)',
    geometricAlbedo: 0.96, albedoSource: 'Sicardy et al. 2011 (0.96 +0.09/−0.04)',
    colourIndices: { 'B-V': 0.823, 'V-R': 0.391 }, colourIndexSource: SRC.tnocol + ' (Carraro et al. 2006)',
  },
  haumea: {
    radiusKm: 797.5, radiusSigmaKm: 5.5, radiusType: 'volume-equivalent', radiusSource: SRC.ortiz2017 + ' (volume-equivalent diameter 1,595 ± 11 km)',
    triaxialRadiiKm: [1161, 852, 513], triaxialSource: SRC.ortiz2017 + ' (a = 1161 ± 30, b = 852 ± 4, c = 513 ± 16 km)',
    gmKm3S2: 4.006e21 * 6.6743e-20, gmSource: 'Ragozzine & Brown 2009, AJ 137, 4766, https://doi.org/10.1088/0004-6256/137/6/4766 (system mass 4.006 ± 0.040 × 10²¹ kg)',
    geometricAlbedo: 0.51, albedoSigma: 0.02, albedoSource: SRC.ortiz2017,
    colourIndices: { 'B-V': 0.61, 'V-R': 0.37 }, colourIndexSource: SRC.tnocol + ' (Jewitt et al. 2007)',
  },
  makemake: {
    radiusKm: 733, radiusSigmaKm: 12, radiusType: 'area-equivalent',
    radiusSource: 'Ortiz et al. 2012, Nature 491, 566, https://doi.org/10.1038/nature11597 (occultation ellipse 1,430 ± 9 × 1,502 ± 45 km; 733 km is the mean of the two projected semi-axes, 715 and 751 km, and also the radius of a disc of the same area). The volume-equivalent radius depends on the unknown pole orientation: an oblate spheroid with these axes would give 739 km',
    triaxialRadiiKm: [751, 751, 715], triaxialSource: 'Ortiz et al. 2012 (illustrative oblate fit to the 1,502 × 1,430 km occultation ellipse; the true shape is not known)',
    geometricAlbedo: 0.77, albedoSigma: 0.03, albedoSource: 'Ortiz et al. 2012',
    colourIndices: { 'B-V': 0.87, 'V-R': 0.46 }, colourIndexSource: SRC.tnocol + ' (Jewitt et al. 2007)',
  },
  gonggong: {
    radiusKm: 615, radiusSigmaKm: 25, radiusType: 'area-equivalent', radiusSource: 'Kiss et al. 2019, Icarus 334, 3, https://doi.org/10.1016/j.icarus.2019.03.013 (diameter 1230 ± 50 km)',
    gmKm3S2: 1.75e21 * 6.6743e-20, gmSource: 'Kiss et al. 2019 (system mass 1.75 ± 0.07 × 10²¹ kg, from Xiangliu)',
    geometricAlbedo: 0.14, albedoSigma: 0.01, albedoSource: 'Kiss et al. 2019',
  },
  quaoar: {
    radiusKm: 543, radiusSigmaKm: 2, radiusType: 'area-equivalent', radiusSource: 'Pereira et al. 2023, A&A 673, L4, https://doi.org/10.1051/0004-6361/202346365 (area-equivalent radius 543 ± 2 km from the August 2022 occultation; Braga-Ribas et al. 2013 found 555 ± 2.5 km)',
    gmKm3S2: 1.2e21 * 6.6743e-20, gmSource: 'Morgado et al. 2023, Nature 614, 239, https://doi.org/10.1038/s41586-022-05629-6 (adopted mass 1.2 × 10²¹ kg)',
    geometricAlbedo: 0.109, albedoSigma: 0.007, albedoSource: 'Braga-Ribas et al. 2013',
    colourIndices: { 'B-V': 0.94, 'V-R': 0.6 }, colourIndexSource: SRC.tnocol + ' (Tegler et al. 2003; Fornasier et al. 2004; DeMeo et al. 2009)',
  },
  sedna: {
    radiusKm: 497.5, radiusSigmaKm: 40, radiusType: 'area-equivalent', radiusSource: 'Pál et al. 2012, A&A 541, L6, https://doi.org/10.1051/0004-6361/201218874 (diameter 995 ± 80 km)',
    geometricAlbedo: 0.32, albedoSigma: 0.06, albedoSource: 'Pál et al. 2012',
    colourIndices: { 'B-V': 1.07, 'V-R': 0.61 }, colourIndexSource: SRC.tnocol + ' (Sheppard 2010: B−R 1.68, V−R 0.61)',
  },
  orcus: {
    radiusKm: 455, radiusSigmaKm: 22, radiusType: 'area-equivalent', radiusSource: 'Brown & Butler 2017, AJ 154, 19, https://doi.org/10.3847/1538-3881/aa6346 (ALMA: diameter 910 +50/−40 km)',
    gmKm3S2: 6.32e20 * 6.6743e-20, gmSource: 'Brown et al. 2010, AJ 139, 2700, https://doi.org/10.1088/0004-6256/139/6/2700 (Orcus–Vanth system mass 6.32 ± 0.05 × 10²⁰ kg). This is the system mass: it includes Vanth',
    geometricAlbedo: 0.23, albedoSource: 'Brown & Butler 2017 (0.23 ± 0.02)',
  },
  arrokoth: {
    radiusKm: 9.947, radiusType: 'volume-equivalent',
    radiusSource: SRC.porter2024 + '. The model is two lobe meshes that overlap slightly at the neck; Porter et al. quote an equal-volume diameter of 19.896 km, which adds the two lobes (17.349 and 13.845 km) and so counts the 1.8 km³ overlap twice. The union of the two meshes is 4,122.0 km³, a sphere of radius 9.947 km (computed for this file; see public/models/arrokoth.bin)',
    dimensionsKm: [34.546, 19.838, 13.822], dimensionsSource: 'Porter et al. 2024, Table (overall extents a × b × c)',
    geometricAlbedo: 0.21, albedoSource: 'Hofgartner et al. 2021, Icarus 356, 113723, https://doi.org/10.1016/j.icarus.2020.113723 (geometric albedo 0.21 +0.05/−0.04)',
  },
  halley: {
    radiusKm: 4.6, radiusType: 'volume-equivalent', radiusSource: 'Volume-equivalent radius of P. Stooke’s Giotto/Vega shape model (4.58 km; public/models/halley.bin). SBDB lists an 11 km effective diameter (Lamy et al. 2004, in Comets II), a projected-area measure rather than a volume one',
    dimensionsKm: [14.9, 8.2, 8.2], dimensionsSource: 'Keller et al. 1987, A&A 187, 807 (14.9 × 8.2 km), via ' + SRC.sbdb + '; NASA gives about 15 × 8 km',
    geometricAlbedo: 0.04, albedoSource: SRC.sbdb + ' (Lamy et al. 2004)',
  },
  encke: {
    radiusKm: 2.4, radiusType: 'area-equivalent', radiusSource: 'Lamy et al. 2004, in Comets II, 223 (effective diameter 4.8 km), via ' + SRC.sbdb,
    geometricAlbedo: 0.046, albedoSigma: 0.023, albedoSource: SRC.sbdb + ' (Fernández 2002, EM&P 89, 117)',
  },
  'churyumov-gerasimenko': {
    radiusKm: 1.649, radiusType: 'volume-equivalent', radiusSource: 'Jorda et al. 2016, Icarus 277, 257, https://doi.org/10.1016/j.icarus.2016.05.002 (volume 18.8 ± 0.3 km³); our 24k-plate SHAP5 model gives 1.647 km',
    dimensionsKm: [4.1, 3.3, 1.8], dimensionsSource: 'Sierks et al. 2015, Science 347, aaa1044 (large lobe 4.1 × 3.3 × 1.8 km; small lobe 2.6 × 2.3 × 1.8 km)',
    gmKm3S2: 9.982e12 * 6.6743e-20, gmSigma: 0.2e-9,
    gmSource: 'Pätzold et al. 2016, Nature 530, 63, https://doi.org/10.1038/nature16535 (mass 9.982 ± 0.003 × 10¹² kg; GM = G·M). The Small-Body Database lists GM = 662.2 × 10⁻⁹ km³/s², which does not match that mass (it would be 9.922 × 10¹² kg), so it is not used',
    densityNote: 'Pätzold et al. 2016 give 0.533 ± 0.006 g/cm³ with a 18.7 km³ volume; the value here uses radiusKm (18.8 km³, Jorda et al. 2016).',
    geometricAlbedo: 0.062, albedoSource: 'Fornasier et al. 2015, A&A 583, A30, https://doi.org/10.1051/0004-6361/201525901 (6.2% at 535 nm)',
  },
  'hale-bopp': {
    radiusKm: 30, radiusSigmaKm: 10, radiusType: 'area-equivalent', radiusSource: 'Fernández 2002, EM&P 89, 3 (diameter 60 ± 20 km), via ' + SRC.sbdb,
    geometricAlbedo: 0.04, albedoSigma: 0.03, albedoSource: SRC.sbdb,
  },
  oumuamua: {
    radiusKm: 0.07, radiusType: 'placeholder', radiusSource: 'Order of magnitude only. Spitzer non-detection limits the spherical-equivalent diameter to under ~440 m (albedo 0.1; Trilling et al. 2018, AJ 156, 261, https://doi.org/10.3847/1538-3881/aae88f); a 115 × 111 × 19 m disc (Mashchenko 2019, MNRAS 489, 3003) or a ~230 × 35 m cigar (Meech et al. 2017, for albedo 0.04) fit the light curve',
    shapeNote: 'Never resolved. Shape inferred from the light curve: brightness varied by a factor of ~10, so the long-to-short axis ratio is large (≳6:1). Whether it is a cigar or a pancake is not known.',
    geometricAlbedo: null, albedoSource: 'unknown (assumed 0.04–0.1 in size estimates)',
  },
  borisov: {
    radiusKm: 0.4, radiusType: 'placeholder', radiusSource: 'Jewitt et al. 2020, ApJL 888, L23, https://doi.org/10.3847/2041-8213/ab621b (nucleus radius 0.2 < r < 0.5 km)',
    geometricAlbedo: null, albedoSource: 'unknown (0.04 assumed in size estimates)',
  },
  'atlas-3i': {
    radiusKm: 1.5, radiusType: 'placeholder', radiusSource: 'NASA 3I/ATLAS page: Hubble limits the nucleus diameter to between 0.44 and 5.6 km (as of 20 August 2025); the value here is only a mid-range placeholder',
    geometricAlbedo: null, albedoSource: 'unknown',
  },
};

// Rotation models not covered by the IAU 2015 report.
const ROT = {
  hyperion: { model: 'chaotic', note: 'Hyperion rotates chaotically; the IAU report gives no model. Voyager and Cassini saw it spinning roughly about its long axis, the axis wandering on time scales of weeks. Render with an arbitrary slow tumble and say so.', source: `${NASA}/saturn/moons/hyperion/` },
  nereid: { model: 'period-only', periodH: 11.594, note: 'Not synchronous; pole unknown. Period from the Kepler K2 light curve.', source: 'Kiss et al. 2016, MNRAS 457, 2908, https://doi.org/10.1093/mnras/stw081' },
  nix: { model: 'snapshot', poleRaDeg: [350, 0, 0], poleDecDeg: [42, 0, 0], periodH: 43.896, validity: { fromTdbDays: 5600, toTdbDays: 5720, note: 'Pole and period fitted to 2015 New Horizons images and light curves. Nix tumbles chaotically, so neither holds far from July 2015; the prime meridian is not defined.' }, note: 'Pole [RA 350°, Dec 42°] and period 1.829 ± 0.009 d from Weaver et al. 2016, Table 2. Chaotic rotation (Showalter & Hamilton 2015).', source: SRC.weaver2016 },
  hydra: { model: 'snapshot', poleRaDeg: [257, 0, 0], poleDecDeg: [-24, 0, 0], periodH: 10.308, validity: { fromTdbDays: 5600, toTdbDays: 5720, note: 'Pole and period fitted to 2015 New Horizons data. Hydra’s rotation is chaotic; the prime meridian is not defined.' }, note: 'Pole [RA 257°, Dec −24°] and period 0.4295 ± 0.0008 d from Weaver et al. 2016, Table 2.', source: SRC.weaver2016 },
  eris: { model: 'period-only', periodH: 15.786 * 24, synchronous: true, note: 'Eris is tidally locked to its moon Dysnomia (rotation = Dysnomia’s 15.786-day orbit; Szakáts et al. 2023, A&A 669, L3, https://doi.org/10.1051/0004-6361/202245234; Bernstein et al. 2023, PSJ 4, 115). Pole: presumably Dysnomia’s orbit pole; not adopted here.', source: 'Szakáts et al. 2023; Holler et al. 2021 (Dysnomia period 15.785899 d)' },
  makemake: { model: 'period-only', periodH: 22.8266, note: 'Single-peaked light-curve period (Hromakina et al. 2019, A&A 625, A46); pole unknown.', source: 'Hromakina et al. 2019, https://doi.org/10.1051/0004-6361/201935274' },
  gonggong: { model: 'period-only', periodH: 22.4, note: 'Light-curve period 22.40 h, with 44.81 h also possible (Pál et al. 2016, AJ 151, 117); pole unknown.', source: 'Pál et al. 2016, https://doi.org/10.3847/0004-6256/151/5/117' },
  quaoar: { model: 'period-only', periodH: 17.6788, note: 'Double-peaked period 17.6788 h (Ortiz et al. 2003), used by Morgado et al. 2023 to place the ring at the 1/3 spin–orbit resonance; pole unknown (the rings are probably equatorial).', source: 'Morgado et al. 2023' },
  sedna: { model: 'period-only', periodH: 10.273, note: 'Uncertain light-curve period 10.273 h (Gaudi et al. 2005); pole unknown.', source: SRC.sbdb + ' (LCDB)' },
  orcus: { model: 'period-only', periodH: 13.188, note: 'Uncertain light-curve period (LCDB); Orcus may instead be tidally locked to Vanth (9.54 d). Pole unknown.', source: SRC.sbdb + ' (LCDB)' },
  encke: { model: 'period-only', periodH: 11.083, note: 'Nucleus rotation period (LCDB, partial coverage); pole unknown.', source: SRC.sbdb + ' (LCDB)' },
  halley: { model: 'complex', note: 'Non-principal-axis rotation: the long axis precesses about the angular momentum vector every ~3.7 d while the nucleus spins about its long axis every ~7.1 d (Belton et al. 1991, Icarus 93, 183). No simple model; tumble it slowly and say so.', source: 'Belton et al. 1991, https://doi.org/10.1016/0019-1035(91)90207-A' },
  'hale-bopp': { model: 'period-only', periodH: 11.35, note: 'Rotation period ~11.35 h from the rotating coma jets in 1997 (Licandro et al. 1998, ApJ 501, L221); pole not adopted.', source: 'Licandro et al. 1998, ApJ 501, L221' },
  oumuamua: { model: 'complex', periodH: 8.67, note: 'Tumbling (non-principal-axis) rotation; the strongest light-curve period is 8.67 ± 0.34 h (Fraser et al. 2018, Nature Astronomy 2, 383).', source: 'Fraser et al. 2018, https://doi.org/10.1038/s41550-018-0398-z' },
  borisov: { model: 'unknown', note: 'The nucleus was never seen through its coma; rotation unknown.', source: SRC.sbdb },
  'atlas-3i': { model: 'unknown', note: 'The rotation of the nucleus has not been established.', source: `${NASA}/solar-system/comets/3i-atlas/` },
};

// Spacecraft details. Status is as of 25 September 2026 unless the note says otherwise.
const CRAFT = {
  voyager1: {
    radiusKm: 0.00183, sizeNote: 'High-gain antenna 3.66 m across; magnetometer boom 13 m long.',
    massKg: 721.9, massSource: `${NASA}/mission/voyager/voyager-1/`,
    launch: '1977-09-05T12:56:01Z', launchVehicle: 'Titan IIIE-Centaur', launchSite: 'Cape Canaveral, Florida (Launch Complex 41)',
    mission: 'Flybys of Jupiter (closest approach 5 March 1979) and Saturn (12 November 1980, with a close pass of Titan); since 1 January 1990 the Voyager Interstellar Mission.',
    status: 'Operating in interstellar space (since 25 August 2012). Instruments on: magnetometer, plasma wave subsystem. Off: low-energy charged particles (17 Apr 2026), cosmic ray subsystem (25 Feb 2025) and all others.',
    statusAsOf: '2026-04-17', statusSource: `${NASA}/mission/voyager/where-are-voyager-1-and-voyager-2-now/`,
    statusCaveat: 'From NASA’s instrument-status table (updated 17 April 2026; page updated 20 August 2026). The Voyager 1 mission page still lists four working instruments, as of 2024.',
    colour: '#f2f2f2',
  },
  voyager2: {
    radiusKm: 0.00183, sizeNote: 'High-gain antenna 3.66 m across; magnetometer boom 13 m long.',
    massKg: 721.9, massSource: `${NASA}/mission/voyager/voyager-2/`,
    launch: '1977-08-20T14:29:44Z', launchVehicle: 'Titan IIIE-Centaur', launchSite: 'Cape Canaveral, Florida',
    mission: 'Grand Tour flyby of Jupiter (9 July 1979), Saturn (25 August 1981), Uranus (24 January 1986) and Neptune (25 August 1989); now the Voyager Interstellar Mission.',
    status: 'Operating in interstellar space (since 5 November 2018). Instruments on: cosmic ray subsystem, magnetometer, plasma wave subsystem. Off: plasma science (26 Sep 2024), low-energy charged particles (24 Mar 2025) and all others.',
    statusAsOf: '2026-08-20', statusSource: `${NASA}/mission/voyager/where-are-voyager-1-and-voyager-2-now/`,
    colour: '#f2f2f2',
  },
  'new-horizons': {
    radiusKm: 0.00135, sizeNote: 'Body about 0.7 × 2.1 × 2.7 m, with a 2.1 m high-gain dish; radius here is half the largest dimension.',
    massKg: 478, massSource: `${NASA}/mission/new-horizons/`,
    launch: '2006-01-19T19:00:00Z', launchVehicle: 'Atlas V 551', launchSite: 'Cape Canaveral, Florida',
    mission: 'Jupiter gravity assist (28 February 2007), Pluto system flyby (14 July 2015), Arrokoth flyby (1 January 2019); extended mission in the Kuiper Belt.',
    status: 'Operating in its extended mission, returning heliophysics and Kuiper Belt data.',
    statusAsOf: '2025', statusSource: `${NASA}/mission/new-horizons/`, statusCaveat: 'NASA’s mission page confirms operations “as of 2025”; no later status notice was found when this file was built.',
    colour: '#e8d9a8',
  },
  pioneer10: {
    radiusKm: 0.00137, sizeNote: 'High-gain antenna 2.74 m across.',
    massKg: 258, massSource: `${NASA}/mission/pioneer-10/`,
    launch: '1972-03-03T01:49:04Z', launchNote: 'Evening of 2 March 1972 local time (US Eastern).', launchVehicle: 'Atlas-Centaur', launchSite: 'Cape Canaveral, Florida',
    mission: 'First crossing of the asteroid belt and first Jupiter flyby (closest approach 4 December 1973, 130,354 km).',
    status: 'Silent. Routine contact ended 31 March 1997; the last signal was received on 23 January 2003, from 12.23 billion km. Coasting out of the Solar System towards Aldebaran.',
    statusAsOf: '2003-01-23', statusSource: `${NASA}/mission/pioneer-10/`,
    colour: '#e6e6e6',
  },
  'parker-solar-probe': {
    radiusKm: 0.00115, sizeNote: 'Heat shield 2.3 m across and 11.4 cm thick; radius here is half the shield diameter.',
    massKg: 685, massSource: `${NASA}/mission/parker-solar-probe/`,
    launch: '2018-08-12T07:31:00Z', launchVehicle: 'Delta IV Heavy', launchSite: 'Cape Canaveral Air Force Station, Florida',
    mission: 'Repeated close passes of the Sun, lowered by seven Venus flybys to a perihelion of about 6.9 million km from the Sun’s centre (6.1 million km from the surface), first reached on 24 December 2024.',
    status: 'Operating, continuing perihelia of about 9.9 solar radii every 88 days. NASA’s mission page lists the mission as in progress.',
    statusAsOf: '2026-09', statusSource: `${NASA}/mission/parker-solar-probe/`,
    colour: '#f5f5f0',
  },
  jwst: {
    radiusKm: 0.0106, sizeNote: 'Sunshield about 21.2 × 14.2 m; primary mirror 6.5 m. Radius here is half the sunshield length.',
    massKg: 6200, massSource: 'https://webb.nasa.gov/content/about/faqs/facts.html (total payload mass approx. 6,200 kg including consumables and launch adaptor)',
    launch: '2021-12-25T12:20:00Z', launchVehicle: 'Ariane 5 ECA', launchSite: 'Guiana Space Centre, Kourou',
    mission: 'Infrared space observatory (NASA, ESA, CSA) in a halo orbit around the Sun–Earth L2 point, 1.5 million km from Earth; arrived 24 January 2022.',
    status: 'Operating; science observations continuing.',
    statusAsOf: '2026-09-25', statusSource: `${NASA}/mission/webb/`,
    colour: '#d9b44a',
  },
  juno: {
    radiusKm: 0.01, sizeNote: 'Three solar arrays about 9 m long on a hexagonal body, 20 m from tip to tip (JPL Horizons notes); radius here is half that.',
    massKg: 3625, massSource: `${NASA}/mission/juno/ (at launch, with propellant)`,
    launch: '2011-08-05T16:25:00Z', launchVehicle: 'Atlas V 551', launchSite: 'Cape Canaveral Air Force Station, Florida (Space Launch Complex 41)',
    mission: 'Earth gravity assist (9 October 2013), arrival at Jupiter (5 July 2016), polar orbits studying its interior, atmosphere and magnetosphere; extended mission with flybys of Ganymede, Europa and Io.',
    status: 'Operating in its extended mission; JPL’s navigation team tracked it to September 2026, and its trajectory beyond is a plan.',
    statusAsOf: '2026-09-23', statusSource: `${NASA}/mission/juno/`, statusCaveat: 'From the notes of JPL Horizons’ Juno trajectory (tracking data to 23 September 2026).',
    colour: '#c9c4bb',
  },
  'europa-clipper': {
    radiusKm: 0.01525, sizeNote: 'Solar arrays 30.5 m across when deployed; radius here is half that.',
    massKg: 6065, massSource: `${NASA}/mission/europa-clipper/ (at launch, with propellant)`,
    launch: '2024-10-14T16:06:00Z', launchVehicle: 'Falcon Heavy', launchSite: 'Kennedy Space Center, Florida (Launch Complex 39A)',
    mission: 'Gravity assists at Mars (1 March 2025) and Earth (December 2026), arrival at Jupiter in April 2030, then 49 close flybys of Europa from 2031 to 2034.',
    status: 'In cruise to Jupiter; JPL’s navigation team tracked it to September 2026, and its trajectory beyond is the mission’s plan.',
    statusAsOf: '2026-09-22', statusSource: `${NASA}/mission/europa-clipper/`, statusCaveat: 'From the notes of JPL Horizons’ Europa Clipper trajectory (tracking data to 22 September 2026).',
    colour: '#d8d4cc',
  },
  soho: {
    radiusKm: 0.00475, sizeNote: 'Body about 4.3 × 2.7 × 3.7 m; solar panels 9.5 m across; radius here is half that span.',
    massKg: 1850, massSource: 'https://www.esa.int/Science_Exploration/Space_Science/SOHO',
    launch: '1995-12-02T08:08:00Z', launchVehicle: 'Atlas IIAS', launchSite: 'Cape Canaveral Air Force Station, Florida',
    mission: 'A joint ESA and NASA solar observatory in a halo orbit about the Sun–Earth L1 point since February 1996: the Sun’s interior, its corona and the solar wind.',
    status: 'Operating, in mission extensions by ESA and NASA.',
    statusAsOf: '2026-08', statusSource: `${NASA}/mission/soho/`, statusCaveat: 'JPL Horizons carries its trajectory, from Goddard’s flight dynamics team, to 2 November 2026.',
    colour: '#d9c48a',
  },
};

// Representative colours where no compiled colour index exists, with provenance.
const COLOUR_OVERRIDES = {
  europa: { indices: { 'B-V': 0.87 }, source: 'B−V 0.87 (Galilean satellite photometry, Morrison & Morrison 1977 in Burns (ed.) Planetary Satellites); red channel extrapolated from the B−V slope' },
  callisto: { indices: { 'B-V': 0.86 }, source: 'B−V 0.86 (Morrison & Morrison 1977); red channel extrapolated' },
  titan: { indices: { 'B-V': 1.28 }, source: 'B−V 1.28 of Titan’s haze (Allen’s Astrophysical Quantities, 4th ed., 2000); red channel extrapolated. This is the colour of the atmosphere, not the surface.' },
  triton: { indices: { 'B-V': 0.72 }, source: 'B−V ≈ 0.72 (Allen’s Astrophysical Quantities, 4th ed.); approximate. The Voyager colour map is enhanced (orange–violet–UV) and is not used for this tint.' },
  charon: { indices: { 'B-V': 0.7 }, source: 'B−V ≈ 0.70 (Buie, Tholen & Wasserman 1997, Icarus 125, 233); approximate' },
};

// ─── Build ──────────────────────────────────────────────────────────────────────────────────

async function main() {
  await ensureInputs();
  const pck = parsePck(readRaw('pck00011.tpc'));
  const phys = parseSsdPhys(readRaw('ssd_sats_phys_par.html'));
  const alb = parseSsdAlbedo(readRaw('ssd_sat_phys_par_2020_archive.html'));
  const elem = parseSsdElem(readRaw('ssd_sats_elem_sep.html'));
  const satColours = colourTable(readRaw('colors/satcol.tab'), (l) => {
    const m = /^(\S+)\s+(\S+)\s+\S+\s+([A-Z]-[A-Z])\s+(-?[\d.]+)/.exec(l);
    if (!m) return null;
    let [, , name, index, value] = m;
    value = Number(value);
    if (index === 'V-B') (index = 'B-V'), (value = -value);
    return { name, index, value };
  });
  const tnoColours = colourTable(readRaw('colors/tnocencol.tab'), (l) => {
    const name = l.slice(7, 25).trim();
    const index = l.slice(48, 51).trim();
    const value = Number(l.slice(52, 60));
    const note = l.slice(37, 39).trim();
    if (!name || note === 'S' || note === 'C') return null;
    return { name, index, value };
  });
  const texReport = Object.fromEntries(JSON.parse(readRaw('maps/textures-report.json')).map((r) => [r.id, r]));
  const shapeReport = JSON.parse(readRaw('shapes/shapes-report.json'));
  const haumea = haumeaW0();
  const texMeta = new Map();
  // Texture metadata (credit etc.) lives with the texture builder; import lazily to avoid sharp.
  return import('./build-textures.mjs').then(({ MAPS, downloadUrl, downloadEntry }) => {
    for (const m of MAPS) texMeta.set(m.id, { ...m, download: downloadUrl(m), downloadEntry: downloadEntry(m) });
    const bodies = CURATED.map((c) => buildBody(c));
    const out = {
      format: 'lightspeed-bodies',
      version: 1,
      generated: new Date().toISOString().slice(0, 10),
      conventions: {
        units: 'km, kg, km³/s², degrees, hours, days; dates ISO 8601 (UTC for events)',
        time: 'Rotation models take TDB days since J2000.0 (JD 2451545.0 TDB); T = days / 36525',
        rotation: 'IAU: pole right ascension and declination in the ICRF, prime meridian W measured eastwards from the node of the body equator on the ICRF equator. Body-fixed → ICRF = Rz(α₀ + 90°) · Rx(90° − δ₀) · Rz(W). Evaluated by src/sim/bodies/rotation.ts (compiled from these records by src/sim/solarSystem/records.ts).',
        radius: 'radiusKm is a mean radius; radiusType says which kind: volume-equivalent (sphere of equal volume, from a shape model or ellipsoid), area-equivalent (disc of equal projected area, from occultations or thermal emission), mean (JPL SSD or mission mean radius), placeholder (order of magnitude only) or size-scale (spacecraft: half the largest dimension). triaxialRadiiKm = [a, b, c] along body-fixed x, y, z where known',
        kind: 'moon | dwarf-planet (the five IAU dwarf planets; Pluto is not in this file) | asteroid | tno (trans-Neptunian object; dwarfPlanetCandidate marks the large ones the IAU has not classified) | comet | interstellar | spacecraft. The same kinds as public/data/tracks.json',
        colour: 'colour: sRGB display tint (hue from measured colour indices or imagery; lightness from geometric albedo: linear luminance 0.1 + 0.6·p, capped at 0.7). colourHue: the same hue at full brightness, for tinting greyscale maps.',
      },
      phaseAngles: phaseSystems(pck),
      bodies,
    };
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
    console.log(`wrote ${OUT}: ${bodies.length} bodies`);
  });

  function buildBody(c) {
    const b = { id: c.id, name: c.name, kind: c.kind };
    if (c.dwarfPlanetCandidate) b.dwarfPlanetCandidate = true;
    if (c.kindNote) b.kindNote = c.kindNote;
    if (c.parent) b.parent = c.parent;
    const naif = NAIF[c.id];
    if (naif) b.naifId = naif;
    const p = PHYS[c.id] ?? {};
    const sp = phys[c.name];
    const sources = [];

    // Size
    if (c.kind === 'spacecraft') {
      const s = CRAFT[c.id];
      Object.assign(b, { radiusKm: s.radiusKm, radiusType: 'size-scale', sizeNote: s.sizeNote, massKg: s.massKg, massSource: s.massSource });
    } else if (p.radiusKm) {
      Object.assign(b, { radiusKm: p.radiusKm, radiusSigmaKm: p.radiusSigmaKm, radiusType: p.radiusType, radiusSource: p.radiusSource });
    } else if (sp) {
      Object.assign(b, { radiusKm: sp.radius, radiusSigmaKm: sp.radiusSigma, radiusType: 'mean', radiusSource: SRC.ssdPhys });
    }
    if (c.kind !== 'spacecraft' && !b.radiusType) throw new Error(`${c.id}: radiusType missing`);
    const radii = naif ? pck[`BODY${naif}_RADII`] : undefined;
    if (p.triaxialRadiiKm) Object.assign(b, { triaxialRadiiKm: p.triaxialRadiiKm, triaxialSource: p.triaxialSource });
    else if (radii && !(radii[0] === radii[1] && radii[1] === radii[2])) Object.assign(b, { triaxialRadiiKm: radii, triaxialSource: SRC.iau2015 });
    if (p.dimensionsKm) Object.assign(b, { dimensionsKm: p.dimensionsKm, dimensionsSource: p.dimensionsSource });
    if (p.shapeNote) b.shapeNote = p.shapeNote;

    // Mass
    if (p.gmKm3S2) Object.assign(b, { gmKm3S2: +p.gmKm3S2.toPrecision(6), gmSigmaKm3S2: p.gmSigma, gmSource: p.gmSource });
    else if (sp && sp.gm > 0) Object.assign(b, { gmKm3S2: sp.gm, gmSigmaKm3S2: sp.gmSigma, gmSource: `${SRC.ssdPhys} (ephemeris ${sp.gmEphemeris})` });
    else if (['ceres', 'vesta'].includes(c.id)) {
      const g = sbdb(c.id).phys.GM;
      Object.assign(b, { gmKm3S2: Number(g.value), gmSigmaKm3S2: Number(g.sigma), gmSource: `${SRC.sbdb} (${g.ref})` });
    }
    if (b.gmKm3S2 && c.kind !== 'spacecraft') {
      b.massKg = +(b.gmKm3S2 / G_KM3_KG_S2).toPrecision(5);
      if (b.radiusKm) b.densityGCm3 = +((b.massKg / ((4 / 3) * Math.PI * (b.radiusKm * 1e5) ** 3)) * 1000).toFixed(3);
      if (p.densityNote) b.densityNote = p.densityNote;
    }

    // Albedo
    if ('geometricAlbedo' in p) Object.assign(b, { geometricAlbedo: p.geometricAlbedo, geometricAlbedoSigma: p.albedoSigma, albedoSource: p.albedoSource });
    else if (alb[c.name]) Object.assign(b, { geometricAlbedo: alb[c.name].albedo, geometricAlbedoSigma: alb[c.name].sigma, albedoSource: `${SSD2015_REFS[alb[c.name].ref] ?? 'ref. ' + alb[c.name].ref}, as tabulated by ${SRC.ssdPhys2020}` });
    else {
      const s = ['ceres', 'vesta'].includes(c.id) ? sbdb(c.id).phys.albedo : undefined;
      if (s) Object.assign(b, { geometricAlbedo: Number(s.value), geometricAlbedoSigma: Number(s.sigma), albedoSource: `${SRC.sbdb} (${s.ref})` });
    }

    if (p.albedoNote) b.albedoNote = p.albedoNote;

    // Orbit (moons): mean elements, for context only; positions come from the ephemeris models.
    const el = elem[c.name];
    if (c.kind === 'moon' && el) b.orbit = { ...el, source: SRC.ssdElem };

    // Rotation
    let rot = null;
    if (c.id === 'haumea') {
      rot = {
        model: 'fitted',
        source: `${SRC.ortiz2017}. Pole: ring pole solution 1 (RA 285.1° ± 0.5°, Dec −10.6° ± 1.2°), assumed to be the spin pole; period 3.915341 ± 0.000005 h. Phase: at the occultation (2017-01-21 03:09:20 UTC) Haumea was at minimum brightness, i.e. its long axis lay in the plane of the line of sight and the pole; W₀ is set so that +x points along that line then (Horizons geocentric direction). The sign of +x (±180°) is arbitrary for an ellipsoid.`,
        frame: 'ICRF',
        poleRaDeg: [285.1, 0, 0],
        poleDecDeg: [-10.6, 0, 0],
        pmDeg: [haumea.w0, haumea.rate, 0],
        periodH: 3.915341,
        sense: 'prograde (assumed; the ring/Hiʻiaka orbit sense is prograde about this pole)',
        validity: { fromTdbDays: 1000, toTdbDays: 12000, note: 'Phase error grows by about 0.5° a year from the 5 × 10⁻⁶ h period uncertainty, about ±5° in 2026; pole uncertain by about 1°.' },
        occultation: haumea,
      };
    } else if (c.id === 'arrokoth') {
      rot = {
        model: 'fitted',
        source: SRC.porter2024,
        frame: 'ICRF',
        poleRaDeg: [317.4880752, 0, 0],
        poleDecDeg: [-24.8876496, 0, 0],
        pmDeg: [184.4589465, 360 / 0.6632553, 0],
        periodH: +(0.6632553 * 24).toFixed(6),
        sense: 'prograde',
        validity: { fromTdbDays: 6500, toTdbDays: 7500, note: 'Fitted to images from 2018-12-31 to 2019-01-01. The period is known to about 10⁻⁵ d, so the phase drifts by tens of degrees per decade away from 2019.' },
      };
    } else if (naif && pck[`BODY${naif}_PM`]) {
      const extra = {};
      if (c.kind === 'moon' && el) extra.synchronous = Math.abs(Math.abs(360 / pck[`BODY${naif}_PM`][1]) - el.periodD) / el.periodD < 0.01;
      extra.validity = { fromTdbDays: -6939.5, toTdbDays: 73049.5, note: 'IAU models are stated to be accurate to about 0.1° near the present (Archinal et al. 2018); outside 1981–2199 they are extrapolations.' };
      rot = iauRotation(pck, naif, extra);
      if (c.id === 'churyumov-gerasimenko') rot.note = 'The spin period shortened from 12.76 h to 12.40 h around the August 2015 perihelion; the IAU rate is the post-perihelion one. Prime meridian: the Cheops boulder is at 142.35° E.';
      if (c.id === 'vesta') rot.note = 'IAU 2015 uses the "Claudia double-prime" longitude system (crater Claudia at 146° E), matching the Dawn HAMO map and DTM.';
    } else if (ROT[c.id]) rot = { ...ROT[c.id] };
    else if (c.kind === 'spacecraft') rot = { model: 'attitude-controlled', note: 'Three-axis stabilised; the app should point the high-gain antenna (or Webb’s sunshield / Parker’s heat shield) sensibly rather than model attitude.' };
    else rot = { model: 'unknown' };
    if (p.rotationPeriodH && rot.model === 'unknown') Object.assign(rot, { model: 'period-only', periodH: p.rotationPeriodH, source: p.rotationSource });
    b.rotation = rot;

    // Colour
    let col = null;
    let colSrc = null;
    const al = b.geometricAlbedo ?? 0.3;
    if (c.kind === 'spacecraft') {
      col = { tint: CRAFT[c.id].colour, hue: CRAFT[c.id].colour };
      colSrc = 'Representative of the spacecraft’s appearance in NASA photographs (thermal blankets, white or gold surfaces).';
    } else if (texReport[c.id]?.bands === 3 && c.id !== 'triton') {
      col = fromLinear(texReport[c.id].meanLinear, al);
      colSrc = `Area-weighted mean of the colour surface map (${texMeta.get(c.id)?.title}); that map is ${texMeta.get(c.id)?.colour?.toLowerCase().includes('enhanced') ? 'enhanced colour, so the hue is somewhat exaggerated' : 'close to natural colour'}.`;
    } else if (COLOUR_OVERRIDES[c.id]) {
      col = colourFromIndices(COLOUR_OVERRIDES[c.id].indices, al);
      colSrc = COLOUR_OVERRIDES[c.id].source + '; ' + SRC.sunColours;
    } else if (p.colourIndices) {
      col = colourFromIndices(p.colourIndices, al);
      colSrc = `${p.colourIndexSource}; ${SRC.sunColours}`;
    } else {
      const satKey = { enceladus: 'Enceladus', tethys: 'Tethys', dione: 'Dione', rhea: 'Rhea', hyperion: 'Hyperion', umbriel: 'Umbriel', titania: 'Titania', oberon: 'Oberon', nereid: 'Nereid' }[c.id];
      const ci = satKey ? satColours[satKey] : undefined;
      const sb = ['ceres', 'vesta'].includes(c.id) ? sbdb(c.id).phys : undefined;
      if (ci && ci['B-V'] !== undefined) {
        col = colourFromIndices(ci, al);
        colSrc = `${SRC.satcol}: ${Object.entries(ci).filter(([k]) => ['B-V', 'V-R', 'V-I'].includes(k)).map(([k, v]) => `${k.replace('-', '−')} ${v.toFixed(2)}`).join(', ')}; ${SRC.sunColours}`;
      } else if (sb?.BV) {
        col = colourFromIndices({ 'B-V': Number(sb.BV.value) }, al);
        colSrc = `B−V ${sb.BV.value} from ${SRC.sbdb} (${sb.BV.ref}); red channel extrapolated; ${SRC.sunColours}`;
      } else {
        col = fromLinear([1, 1, 1], al);
        colSrc = 'No disk-integrated colour measurement found in the sources used: neutral grey at the albedo-based lightness. Treat as a placeholder.';
      }
    }
    Object.assign(b, { colour: col.tint, colourHue: col.hue, colourSource: colSrc });

    // Discovery, facts
    if (c.discovery) b.discovery = c.discovery;
    b.facts = c.facts;
    b.factSources = c.factSources;

    // Spacecraft / interstellar extras
    if (c.kind === 'spacecraft') {
      const s = CRAFT[c.id];
      b.spacecraft = { launch: s.launch, launchNote: s.launchNote, launchVehicle: s.launchVehicle, launchSite: s.launchSite, mission: s.mission, status: s.status, statusAsOf: s.statusAsOf, statusSource: s.statusSource, statusCaveat: s.statusCaveat };
    }
    if (c.kind === 'interstellar') {
      const sb = sbdb(c.id === 'atlas-3i' ? 'atlas3i' : c.id);
      const elx = Object.fromEntries((sb.orbit?.elements ?? []).map((e) => [e.name, Number(e.value)]));
      const vInf = Math.sqrt(GM_SUN / (Math.abs(elx.a) * AU_KM));
      b.interstellar = {
        eccentricity: elx.e,
        perihelionAu: elx.q,
        hyperbolicExcessKmS: +vInf.toFixed(1),
        orbitSource: `${SRC.sbdb} (osculating elements, low precision as returned by the API; v∞ = √(GM☉/|a|))`,
        known: {
          oumuamua: 'Hyperbolic orbit; slight non-gravitational acceleration away from the Sun; reddish colour; strong brightness variation (tumbling, elongated or flattened).',
          borisov: 'Cometary activity with a CO-rich coma; nucleus radius 0.2–0.5 km; it released a fragment in March 2020 (Jewitt et al. 2020).',
          'atlas-3i': 'Active comet with CO₂-rich coma (JWST), fastest and probably oldest interstellar object known; nucleus 0.44–5.6 km.',
        }[c.id],
        unknown: {
          oumuamua: 'Its size, true shape, composition and the cause of its acceleration are not settled; no image resolved it.',
          borisov: 'Its rotation and exact nucleus size.',
          'atlas-3i': 'Its nucleus size is only bounded; its rotation and origin star are unknown.',
        }[c.id],
      };
    }

    // Assets
    const tex = texReport[c.id];
    const tm = texMeta.get(c.id);
    const shape = shapeReport[c.id];
    b.assets = {
      texture: tex ? `textures/${c.id}.jpg` : null,
      textureInfo: tex
        ? { width: tex.width, height: tex.height, channels: tex.bands, bytes: tex.bytes, imagedFraction: tex.imagedFraction, fillSrgb: tex.fill, product: tm.title, download: tm.download, downloadEntry: tm.downloadEntry, sourcePage: tm.page ?? undefined, credit: tm.credit, licence: 'Public domain or no use constraints (NASA/USGS); see docs/data/assets.md', colourNote: tm.colour }
        : null,
      textureNote: tex ? undefined : c.kind === 'spacecraft' ? undefined : 'No surface map exists (or none with a licence that allows redistribution). Shade with the body colour.',
      model: shape ? `models/${c.id}.bin` : null,
      modelInfo: shape
        ? {
            triangles: shape.triangles,
            vertices: shape.vertices,
            equalVolumeRadiusKm: +shape.equalVolumeRadiusKm.toFixed(4),
            deviationKm: shape.deviationKm,
            sourceUnion: shape.sourceUnion
              ? { ...shape.sourceUnion, note: 'The source model is separate overlapping lobe meshes; they were joined with a boolean union before simplification, so the file is one closed surface and its volume counts the overlap once.' }
              : undefined,
          }
        : null,
      rings: ['haumea', 'quaoar'].includes(c.id) ? `rings.json#${c.id}` : null,
    };
    // Tidy: drop undefined keys.
    return JSON.parse(JSON.stringify(b));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
