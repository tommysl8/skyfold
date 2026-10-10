// Builds the space-weather data (docs/data/space-weather.md): public/data/space-weather/cmes.json.gz, the notable coronal
// mass ejections with where they went, how fast and how wide, and when they reached Earth; and
// public/data/space-weather/kp.bin.gz, the planetary Kp index every three hours since 1932.
//
// Sources:
//   NASA's DONKI (Database Of Notifications, Knowledge, Information; CCMC and the Moon to Mars Space Weather Analysis
//   Office, NASA GSFC), its public API (https://ccmc.gsfc.nasa.gov/DONKI-API/get/…, 60 days a request): the CMEs with
//   their analyses (CME), the interplanetary shocks at Earth (IPS, location=Earth) and the geomagnetic storms (GST),
//   2010 to 2026. A US government work, public; CCMC asks to be acknowledged (its rules of the road: prototyping quality,
//   research context).
//   The Kp index of the GFZ Helmholtz Centre for Geosciences (Matzka et al. 2021, Space Weather 19, e2020SW002641;
//   doi:10.5880/Kp.0001), https://kp.gfz-potsdam.de/app/files/Kp_ap_since_1932.txt, CC BY 4.0.
//   The Carrington event of 1859, from published values (no catalogue has it): see CARRINGTON below.
//
// Kept: each CME whose most accurate analysis gives a speed, a half-width and a direction (DONKI's longitude 999 or
// none: not kept) and that is fast (1,000 km/s or more) or linked to a shock at Earth or a geomagnetic storm. Each is
// placed by its analysis (Stonyhurst latitude and longitude, turned into the app's world frame with Earth's position
// at the time, src/sim/spaceWeather/geometry.ts) and flown with the drag-based model (src/sim/spaceWeather/dbm.ts)
// from 21.5 solar radii at the time the analysis gives for it. Where DONKI links a shock at Earth to the CME, the drag
// parameter γ is fitted so that the element of the front facing Earth arrives when the shock did (and the front is
// widened to reach Earth when Earth lay outside the analysed cone: a shock is wider than the CME behind it);
// elsewhere the typical γ = 0.2 × 10⁻⁷ km⁻¹ and w = 400 km/s of Vršnak et al. 2013. The prediction with the typical
// values is kept too, and how far off it is goes into the log.
//
// Inputs: data-raw/space-weather/ (fetched when missing). Outputs: the two files above; docs/data/space-weather-build-log.txt.
//
// Run: node scripts/build-space-weather.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Body, HelioVector, MakeTime } from 'astronomy-engine';
import { AU_KM } from '../src/physics/constants.ts';
import { dbmAt, dbmTimeTo, element, fitDrag, GAMMA_TYPICAL, R0_KM, W_TYPICAL } from '../src/sim/spaceWeather/dbm.ts';
import { angleBetween, eqjToWorldArr, stonyhurstToWorld, worldToEclipticDeg } from '../src/sim/spaceWeather/geometry.ts';

const RAW = 'data-raw/space-weather';
const OUT = 'public/data/space-weather';
const LOG = 'docs/data/space-weather-build-log.txt';
const API = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get';
const KP_URL = 'https://kp.gfz-potsdam.de/app/files/Kp_ap_since_1932.txt';
const FIRST = Date.UTC(2010, 0, 1);
const LAST = Date.UTC(2026, 9, 9);
const DAY = 86_400_000;
const D = Math.PI / 180;

const lines = [];
const say = (s) => {
  console.log(s);
  lines.push(s);
};

// ─── Inputs ──────────────────────────────────────────────────────────────────────────

async function fetchDonki(kind, extra = '') {
  const file = `${RAW}/${kind}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const all = [];
  for (let t = FIRST; t <= LAST; t += 60 * DAY) {
    const url = `${API}/${kind}?startDate=${iso(t)}&endDate=${iso(Math.min(LAST, t + 59 * DAY))}${extra}`;
    for (let tries = 0; ; tries++) {
      const r = await fetch(url);
      const txt = await r.text();
      if (r.ok) {
        if (txt.trim()) all.push(...JSON.parse(txt));
        break;
      }
      if (tries > 5) throw new Error(`${url}: ${r.status}`);
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
  writeFileSync(file, JSON.stringify(all));
  return all;
}

async function fetchText(file, url) {
  if (!existsSync(file)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    writeFileSync(file, await r.text());
  }
  return readFileSync(file, 'utf8');
}

mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });
const cmes = await fetchDonki('CME');
const ips = await fetchDonki('IPS', '&location=Earth');
const gst = await fetchDonki('GST');
const kpText = await fetchText(`${RAW}/Kp_ap_since_1932.txt`, KP_URL);
say(`DONKI: ${cmes.length} CMEs, ${ips.length} shocks at Earth, ${gst.length} geomagnetic storms (${new Date(FIRST).toISOString().slice(0, 10)} to ${new Date(LAST).toISOString().slice(0, 10)})`);

// ─── Kp ──────────────────────────────────────────────────────────────────────────────

const KP_START = Date.UTC(1932, 0, 1);
const kpRows = kpText.split('\n').filter((l) => l && !l.startsWith('#'));
const kp = new Uint8Array(kpRows.length).fill(255);
let kpMissing = 0;
let kpPrelim = 0;
for (const l of kpRows) {
  const f = l.trim().split(/\s+/);
  const days = Number(f[5]);
  const i = Math.round(days * 8);
  const v = Number(f[7]);
  if (i < 0 || i >= kp.length) throw new Error(`Kp row out of range: ${l}`);
  if (v < 0) kpMissing++;
  else kp[i] = Math.round(v * 3);
  if (f[9] === '0') kpPrelim++;
}
const kpEndMs = KP_START + kp.length * 3 * 3_600_000;
say(`GFZ Kp: ${kp.length} three-hour values from 1932-01-01 to ${new Date(kpEndMs).toISOString().slice(0, 16)}Z, ${kpMissing} missing, the last ${kpPrelim} preliminary`);
const kpHeader = Buffer.alloc(20);
kpHeader.write('KPGF', 0, 'ascii');
kpHeader.writeUInt16LE(1, 4);
kpHeader.writeUInt16LE(3, 6); // hours a value
kpHeader.writeDoubleLE(KP_START, 8);
kpHeader.writeUInt32LE(kp.length, 16);
const kpFile = gzipSync(Buffer.concat([kpHeader, Buffer.from(kp)]), { level: 9 });
writeFileSync(`${OUT}/kp.bin.gz`, kpFile);
say(`  kp.bin.gz: ${(kpFile.length / 1024).toFixed(0)} kB`);

/** The largest Kp over [from, to), or null where there is none. */
function kpMax(from, to) {
  let m = -1;
  for (let i = Math.max(0, Math.floor((from - KP_START) / 10_800_000)); i < kp.length && KP_START + i * 10_800_000 < to; i++) if (kp[i] !== 255) m = Math.max(m, kp[i]);
  return m < 0 ? null : m / 3;
}

// ─── Links ───────────────────────────────────────────────────────────────────────────

const ms = (s) => Date.parse(s.endsWith('Z') ? s : `${s}Z`);
const linkSet = (ev) => new Set((ev.linkedEvents ?? []).map((l) => l.activityID));
const ipsLinks = ips.map((i) => ({ i, links: linkSet(i) }));
const gstLinks = gst.map((g) => ({ g, links: linkSet(g) }));

/** The shocks at Earth linked to a CME (either way round), within a week after it. */
function shocksOf(c) {
  const mine = linkSet(c);
  const t0 = ms(c.startTime);
  return ipsLinks
    .filter(({ i, links }) => (links.has(c.activityID) || mine.has(i.activityID)) && ms(i.eventTime) > t0 + 6 * 3_600_000 && ms(i.eventTime) < t0 + 7 * DAY)
    .map(({ i }) => i)
    .sort((a, b) => ms(a.eventTime) - ms(b.eventTime));
}

/** The storms linked to a CME, directly or through its shock. */
function stormsOf(c, shock) {
  const mine = linkSet(c);
  return gstLinks.filter(({ g, links }) => links.has(c.activityID) || mine.has(g.gstID) || (shock && (links.has(shock.activityID) || linkSet(shock).has(g.gstID)))).map(({ g }) => g);
}

const best = (c) => (c.cmeAnalyses ?? []).find((a) => a.isMostAccurate) ?? null;

// ─── Earth ───────────────────────────────────────────────────────────────────────────

/** Earth's heliocentric position, world axes, km. */
function earthAt(t) {
  const v = HelioVector(Body.Earth, MakeTime(new Date(t)));
  return eqjToWorldArr(v.x * AU_KM, v.y * AU_KM, v.z * AU_KM);
}

/**
 * The element of a CME facing Earth, and when it reaches Earth's distance: iterated, since Earth moves along its orbit
 * while the CME flies. Null when Earth lies outside the cone.
 */
function arrivalAt(apex, t21, axis, hw) {
  let t = t21 + (AU_KM / apex.v0) * 1000;
  let phi = 0;
  let s = 0;
  for (let k = 0; k < 4; k++) {
    const e = earthAt(t);
    phi = angleBetween(axis, e);
    if (phi > hw) return null;
    s = dbmTimeTo(element(apex, phi, hw), Math.hypot(...e));
    if (!Number.isFinite(s)) return null;
    t = t21 + s * 1000;
  }
  return { t, phi, v: dbmAt(element(apex, phi, hw), s).v };
}

// ─── The CMEs ────────────────────────────────────────────────────────────────────────

const iso = (t) => (t == null ? null : new Date(t).toISOString().slice(0, 16));
const r = (x, n) => Math.round(x * 10 ** n) / 10 ** n;
const linkNum = (url) => Number(/\/(\d+)\/-?\d+$/.exec(url ?? '')?.[1] ?? 0) || null;


// First pass: every CME kept, with its direction and its arrival by the typical model.
const kept = [];
const stats = { analysed: 0, noDirection: 0, fast: 0 };
for (const c of cmes) {
  const a = best(c);
  if (!a || a.speed == null || a.halfAngle == null || !a.time21_5) continue;
  stats.analysed++;
  if (a.latitude == null || a.longitude == null || Math.abs(a.longitude) > 180 || Math.abs(a.latitude) > 90) {
    stats.noDirection++;
    continue;
  }
  const shock = shocksOf(c)[0] ?? null;
  const storms = stormsOf(c, shock);
  if (a.speed < 1000 && !shock && storms.length === 0) continue;
  if (a.speed >= 1000) stats.fast++;
  const t21 = ms(a.time21_5);
  const axis = stonyhurstToWorld(a.latitude, a.longitude, earthAt(t21));
  const omega = Math.min(89, a.halfAngle) * D;
  const apex = { r0: R0_KM, v0: a.speed, gamma: GAMMA_TYPICAL, w: W_TYPICAL };
  kept.push({ c, a, shock, storms, t21, axis, omega, apex, typical: arrivalAt(apex, t21, axis, omega) });
}

// Second pass: each shock at Earth is fitted by one of the CMEs DONKI links to it, the one that explains it best (whose
// typical arrival is nearest the measured one; failing that, the fastest). The others merged with it on the way.
const byShock = new Map();
for (const k of kept) if (k.shock) (byShock.get(k.shock.activityID) ?? byShock.set(k.shock.activityID, []).get(k.shock.activityID)).push(k);
for (const group of byShock.values()) {
  const m = ms(group[0].shock.eventTime);
  const score = (k) => (k.typical ? Math.abs(k.typical.t - m) : 1e15 - k.a.speed);
  group.sort((x, y) => score(x) - score(y));
  group[0].driver = true;
}

const rows = [];
const fit = { drivers: 0, widened: 0, wind: 0, residual: [] };
const errors = [];
for (const k of kept) {
  const { c, a, shock, storms, t21, axis, apex } = k;
  let hw = k.omega;
  let gamma = GAMMA_TYPICAL;
  let w = W_TYPICAL;
  let arrival = null;
  let kpObs = null;
  if (shock) {
    arrival = ms(shock.eventTime);
    kpObs = kpMax(arrival, arrival + 2 * DAY);
    if (k.driver) {
      fit.drivers++;
      const e = earthAt(arrival);
      const phi = angleBetween(axis, e);
      if (phi > hw) {
        hw = Math.min(89 * D, phi + 3 * D);
        fit.widened++;
      }
      const el = element(apex, phi, hw);
      const dist = Math.hypot(...e);
      const secs = (arrival - t21) / 1000;
      ({ gamma, w } = fitDrag(el, dist, secs));
      if (w !== W_TYPICAL) fit.wind++;
      fit.residual.push((t21 + dbmTimeTo({ ...el, gamma, w }, dist) * 1000 - arrival) / 3_600_000);
      errors.push({ id: c.activityID, speed: a.speed, hw: a.halfAngle, phi: phi / D, measured: arrival, typical: k.typical?.t ?? null });
    }
  } else if (storms.length) {
    const g0 = Math.min(...storms.map((g) => ms(g.startTime)));
    kpObs = kpMax(g0, g0 + 2 * DAY);
  }
  const drawn = arrivalAt({ ...apex, gamma, w }, t21, axis, hw);
  const ecl = worldToEclipticDeg(axis);
  rows.push([
    c.activityID,
    iso(ms(c.startTime)),
    iso(t21),
    a.latitude,
    a.longitude,
    a.halfAngle,
    a.speed,
    a.type ?? null,
    c.sourceLocation || null,
    c.activeRegionNum ?? null,
    r(ecl.lonDeg, 2),
    r(ecl.latDeg, 2),
    r(hw / D, 1),
    r(gamma * 1e7, 4),
    r(w, 0),
    iso(arrival),
    k.driver ? 1 : 0,
    iso(drawn?.t ?? null),
    drawn ? Math.round(drawn.v) : null,
    iso(k.typical?.t ?? null),
    kpObs == null ? null : r(kpObs, 2),
    linkNum(c.link),
    null,
  ]);
}
say(`CMEs with a most accurate analysis: ${stats.analysed}; without a direction (not kept): ${stats.noDirection}`);
say(`Kept: ${rows.length} (${stats.fast} of 1,000 km/s or more); ${kept.filter((k) => k.shock).length} linked to ${byShock.size} shocks at Earth`);
say(`  each shock fitted by one CME: the wind kept at 400 km/s for ${fit.drivers - fit.wind}, changed too for ${fit.wind}; ${fit.widened} fronts widened to reach Earth`);
const res = fit.residual.map(Math.abs).sort((x, y) => x - y);
say(`  fitted arrival minus measured: median |Δ| ${res[res.length >> 1].toFixed(2)} h, ${res.filter((x) => x > 1).length} more than an hour off (largest ${res[res.length - 1].toFixed(1)} h)`);

// The typical model's prediction against the measured arrivals.
const hit = errors.filter((e) => e.typical != null);
const err = hit.map((e) => (e.typical - e.measured) / 3_600_000);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const med = (xs) => [...xs].sort((x, y) => x - y)[xs.length >> 1];
say(`Typical DBM (γ = 0.2 × 10⁻⁷ km⁻¹, w = 400 km/s), predicting the ${errors.length} shocks from their best CME: Earth inside the analysed cone for ${hit.length}`);
say(`  arrival error: mean ${mean(err).toFixed(1)} h (positive: late), mean absolute ${mean(err.map(Math.abs)).toFixed(1)} h, median absolute ${med(err.map(Math.abs)).toFixed(1)} h`);
const fast = hit.filter((e) => e.speed >= 1000).map((e) => (e.typical - e.measured) / 3_600_000);
say(`  of 1,000 km/s or more (${fast.length}): mean ${mean(fast).toFixed(1)} h, mean absolute ${mean(fast.map(Math.abs)).toFixed(1)} h`);

writeFileSync('data-raw/space-weather/errors.json', JSON.stringify(errors.map((e) => ({ ...e, measured: iso(e.measured), typical: iso(e.typical) }))));

// The famous ones, for the log.
const FAMOUS = [
  ['The July 2012 near-miss', '2012-07-23T02:36'],
  ['St Patrick’s Day storm, 2015', '2015-03-15T02:00'],
  ['September 2017', '2017-09-06T12:24'],
  ['The Gannon storm, May 2024', '2024-05-08T05:36', '2024-05-08T12:24', '2024-05-08T19:12', '2024-05-08T22:24', '2024-05-09T09:24', '2024-05-09T18:23', '2024-05-10T07:12'],
  ['October 2024', '2024-10-09T02:12'],
];
const COL = { start: 1, speed: 6, hw: 5, draw: 12, gamma: 13, w: 14, arrival: 15, fitted: 16, drawn: 17, drawnSpeed: 18, typical: 19, kp: 20 };
for (const [name, ...starts] of FAMOUS) {
  say(name);
  for (const s of starts) {
    const row = rows.find((x) => x[COL.start] === s);
    if (!row) {
      say(`  ${s}: not kept`);
      continue;
    }
    const h = (a, b) => (a && b ? `${((Date.parse(`${a}Z`) - Date.parse(`${b}Z`)) / 3_600_000).toFixed(1)} h` : '–');
    say(`  ${s}Z ${row[COL.speed]} km/s, half-width ${row[COL.hw]}° (drawn ${row[COL.draw]}°), γ ${row[COL.gamma]} × 10⁻⁷ km⁻¹, w ${row[COL.w]} km/s; shock at Earth ${row[COL.arrival] ?? '–'}${row[COL.fitted] ? ' (fitted)' : ''}, drawn front ${row[COL.drawn] ? `${row[COL.drawn]} at ${row[COL.drawnSpeed]} km/s` : 'misses Earth'} (${h(row[COL.drawn], row[COL.arrival])}), typical model ${row[COL.typical] ?? 'misses'} (${h(row[COL.typical], row[COL.arrival])}); Kp ${row[COL.kp] ?? '–'}`);
  }
}

// ─── Measured arrivals elsewhere, and the Carrington event ───────────────────────────

// 23 July 2012: the fastest CME in the catalogue, away from Earth; its shock reached STEREO-A at 20:55 UT the same day
// (Temmer & Nitta 2015, Solar Phys. 290, 919, from Russell et al. 2013, ApJ 770, 38).
const COL_NOTE = 22;
const july = rows.find((x) => x[COL.start] === '2012-07-23T02:36');
if (july) july[COL_NOTE] = { at: 'STEREO-A', time: '2012-07-23T20:55', cite: 'Temmer & Nitta 2015; Russell et al. 2013' };

// 1 September 1859 (no catalogue): the white-light flare seen by Carrington and Hodgson at 11:18–11:23 UT, in the
// sunspot group Carrington placed at N12.4°–N27.5°, W6.6°–W28.7° that day (Hayakawa et al. 2019, Space Weather 17,
// 1553, from Carrington 1863); the storm began 17.6 hours after the flare (Cliver & Svalgaard 2004, Solar Phys. 224,
// 407), as Bombay's magnetogram fell from 4.3 h UT on 2 September (Hayakawa et al. 2019). No speed or width was
// measured: the half-width is taken as 45°, and the speed is the one that, with the drag Temmer & Nitta (2015) found for
// the extreme CME of July 2012 (γ = 0.01 × 10⁻⁷ km⁻¹, w = 450 km/s), brings the front to Earth in 17.6 hours, flying at
// that speed from the Sun's surface to 21.5 solar radii.
{
  const flare = Date.UTC(1859, 8, 1, 11, 18);
  const arrival = flare + 17.6 * 3_600_000;
  const lat = 20;
  const lon = 18;
  const hw = 45 * D;
  const e = earthAt(arrival);
  const solve = (v0) => {
    const t21 = flare + ((R0_KM - 695_700) / v0) * 1000;
    const axis = stonyhurstToWorld(lat, lon, earthAt(t21));
    const phi = angleBetween(axis, e);
    const el = element({ r0: R0_KM, v0, gamma: 0.01e-7, w: 450 }, phi, hw);
    return { t21, axis, at: t21 + dbmTimeTo(el, Math.hypot(...e)) * 1000 };
  };
  let lo = 1000;
  let hi = 5000;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (solve(mid).at > arrival) lo = mid;
    else hi = mid;
  }
  const v0 = Math.round(0.5 * (lo + hi));
  const { t21, axis } = solve(v0);
  const drawn = arrivalAt({ r0: R0_KM, v0, gamma: 0.01e-7, w: 450 }, t21, axis, hw);
  const ecl = worldToEclipticDeg(axis);
  rows.unshift([
    'carrington-1859',
    iso(flare),
    iso(t21),
    lat,
    lon,
    45,
    v0,
    v0 >= 3000 ? 'ER' : v0 >= 2000 ? 'R' : 'O',
    'N20W18',
    null,
    r(ecl.lonDeg, 2),
    r(ecl.latDeg, 2),
    45,
    0.01,
    450,
    iso(arrival),
    1,
    iso(drawn?.t ?? null),
    drawn ? Math.round(drawn.v) : null,
    null,
    null,
    null,
    { cite: 'Carrington 1859; Cliver & Svalgaard 2004; Hayakawa et al. 2019', modelled: 'speed and width' },
  ]);
  say(`Carrington 1859: ${v0} km/s from the Sun's surface brings the front to Earth in 17.6 h (drawn front ${iso(drawn?.t ?? null)}, the storm ${iso(arrival)})`);
}

// ─── Output ──────────────────────────────────────────────────────────────────────────

const COLUMNS = ['id', 'start', 't21', 'lat', 'lon', 'halfAngle', 'speed', 'type', 'source', 'region', 'axisLon', 'axisLat', 'drawnHalfAngle', 'gamma', 'w', 'arrival', 'fitted', 'drawnArrival', 'arrivalSpeed', 'typicalArrival', 'kp', 'link', 'note'];
rows.sort((a, b) => Date.parse(`${a[2]}Z`) - Date.parse(`${b[2]}Z`));
const doc = {
  version: 1,
  about: 'Notable coronal mass ejections: NASA DONKI (CCMC), 2010–2026, with Kp from GFZ (CC BY 4.0); the 1859 Carrington event from published values. Built by scripts/build-space-weather.mjs; see docs/data/space-weather.md.',
  columns: COLUMNS,
  rows,
};
const json = Buffer.from(JSON.stringify(doc));
const gz = gzipSync(json, { level: 9 });
writeFileSync(`${OUT}/cmes.json.gz`, gz);
say(`cmes.json.gz: ${rows.length} CMEs, ${(json.length / 1024).toFixed(0)} kB of JSON, ${(gz.length / 1024).toFixed(0)} kB compressed`);

// The log: this run's lines, after a header.
writeFileSync(
  LOG,
  `# scripts/build-space-weather.mjs, the latest run (${new Date().toISOString().slice(0, 10)})\n\n${lines.join('\n')}\n`,
);
