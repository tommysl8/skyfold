/**
 * The deep-sky catalogues (public/data/deepsky/): their files read as the app reads them; nothing placed without a
 * measured distance; no object the app already has written again; the cosmic web's galaxies placed where the web
 * places them; search finds the new designations (and the app's own bodies by theirs); the cards stay short; the
 * markers' rules (markers.ts) and the pulse.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { gunzipFile } from '../../test/stars';
import { loadLocalGalaxies, loadNamed, loadWeb } from '../../test/cosmos';
import { readJson } from '../../test/files';
import { registerUniverse } from '../../test/universe';
import { cosmology } from '../cosmos/cosmology';
import { worldPositions } from '../cosmos/cosmicWeb';
import type { NebulaeFile } from '../galaxy/records';
import { normalise } from '../../content/destinations';
import {
  DEEP_SKY_FILES,
  DEEP_SKY_SETS,
  gpsToUnixMs,
  NGC_EXISTING_FILE,
  parseGwEvents,
  parseNgcExisting,
  parseNgcGalactic,
  parseNgcGalaxies,
  parsePulsars,
  parseSnrs,
  regionRadiusRad,
  type ColumnFile,
  type DeepSkySetId,
} from './format';
import { shownPulse, WATCHABLE_PERIOD_S, pulsarName } from './records';
import { adoptSet, buildSet, deepSky, deepSkyRuntime, onDemandBodies, type LoadedSet } from './runtime';
import { isBody } from '../bodies';
import { galacticAlpha, galaxyAlpha, regionAlpha, STYLE } from './markers';

const file = (path: string): ColumnFile => JSON.parse(new TextDecoder().decode(gunzipFile(`public/${path}`))) as ColumnFile;
const files = Object.fromEntries(DEEP_SKY_SETS.map((s) => [s, file(DEEP_SKY_FILES[s])])) as Record<DeepSkySetId, ColumnFile>;

const galactic = parseNgcGalactic(files['ngc-galactic']);
const galaxies = parseNgcGalaxies(files['ngc-galaxies']);
const pulsars = parsePulsars(files.pulsars);
const snrs = parseSnrs(files.snrs);
const mergers = parseGwEvents(files['gw-events']);
const existing = parseNgcExisting(file(NGC_EXISTING_FILE));

describe('the files', () => {
  it('hold what the builds wrote (docs/data/deepsky-build-log.txt)', () => {
    expect(galaxies.length).toBeGreaterThan(6000);
    expect(galactic.length).toBeGreaterThan(700);
    expect(pulsars.length).toBeGreaterThan(4000);
    expect(snrs.snrs.length).toBeGreaterThan(200);
    expect(mergers.length).toBeGreaterThan(250);
    expect(existing.length).toBeGreaterThan(300);
  });

  it('are refused when they are not what is expected', () => {
    expect(() => parsePulsars({ ...files.pulsars, meta: { schema: 'lightspeed.snrs/1' } })).toThrow(/schema/);
    expect(() => parseSnrs({ ...files.snrs, columns: files.snrs.columns.filter((c) => c !== 'distPc') })).toThrow(/distPc/);
  });

  it('are each small', () => {
    for (const s of DEEP_SKY_SETS) expect(gunzipFile(`public/${DEEP_SKY_FILES[s]}`).byteLength, s).toBeLessThan(1.1e6);
  });
});

describe('nothing is placed without a measured distance', () => {
  const near = (a: number, b: number, rel: number) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));

  it('NGC/IC clusters and nebulae: from Hunt & Reffert, the globulars’ catalogue, a central star’s parallax or a Magellanic Cloud', () => {
    for (const o of galactic) {
      expect(['hr24', 'bv21', 'harris', 'gaia-pn', 'lmc', 'smc'], o.designation).toContain(o.source);
      expect(o.distPc > 0, o.designation).toBe(true);
      expect(near(Math.hypot(...o.pos), o.distPc, 2e-3), o.designation).toBe(true);
      if (o.type === 'PN') expect(o.source, o.designation).toBe('gaia-pn');
      if (o.source === 'gaia-pn') {
        const e = o.extra as { plx: number; plxErr: number };
        expect(e.plx / e.plxErr, o.designation).toBeGreaterThanOrEqual(5);
      }
      if (o.source === 'lmc' || o.source === 'smc') expect(['PN', 'SNR']).not.toContain(o.type);
    }
  });

  it('NGC/IC galaxies: Cosmicflows-4, or a DESI or SDSS redshift, each with its range', () => {
    for (const g of galaxies) {
      expect(['cf4', 'desi', 'sdss'], g.designation).toContain(g.source);
      expect(g.distLoMpc < g.distMpc && g.distMpc < g.distHiMpc, g.designation).toBe(true);
      expect(near(Math.hypot(...g.pos), g.distMpc, 2e-3), g.designation).toBe(true);
    }
  });

  it('the Cosmicflows-4 galaxies sit where the cosmic web draws them (its row, its recommended distance)', () => {
    const web = loadWeb();
    const pos = worldPositions(web, cosmology(), 'recommended');
    const cf4 = galaxies.filter((g) => g.source === 'cf4');
    expect(cf4.length).toBeGreaterThan(3500);
    for (const g of cf4) {
      const r = g.ref;
      const d = Math.hypot(pos[3 * r] - g.pos[0], pos[3 * r + 1] - g.pos[1], pos[3 * r + 2] - g.pos[2]);
      // The file keeps 3 decimals (a kiloparsec); the web's float32.
      expect(d, g.designation).toBeLessThan(2e-3 + 1e-6 * g.distMpc);
    }
  });

  it('pulsars: the catalogue’s own distance, never YMW16’s 25 kpc stand-in', () => {
    for (const p of pulsars) {
      expect(['independent', 'parallax', 'limits', 'dm'], p.jname).toContain(p.method);
      expect(p.distPc > 0, p.jname).toBe(true);
      if (p.method === 'dm') expect(p.distPc, p.jname).toBeLessThan(24_999);
      expect(near(Math.hypot(...p.pos), p.distPc, 2e-3), p.jname).toBe(true);
    }
  });

  it('remnants: a distance, never only a limit', () => {
    for (const s of snrs.snrs) {
      expect(s.distPc > 0, s.name).toBe(true);
      expect(near(Math.hypot(...s.pos), s.distPc, 5e-3), s.name).toBe(true);
    }
  });

  it('mergers: a 90 % range of distance about the median, and a sky region of measured area', () => {
    for (const e of mergers) {
      expect(e.dcLoMpc < e.dcMpc && e.dcMpc < e.dcHiMpc, e.name).toBe(true);
      expect(e.dlLoMpc < e.dlMpc && e.dlMpc < e.dlHiMpc, e.name).toBe(true);
      expect(e.area90Deg2 > 0 && e.area90Deg2 < 41_253, e.name).toBe(true);
      expect(near(Math.hypot(...e.pos), e.dcMpc, 1e-3), e.name).toBe(true);
      expect(regionRadiusRad(e.area90Deg2)).toBeLessThanOrEqual(Math.PI / 2);
    }
    const first = mergers.find((e) => e.name === 'GW150914')!;
    expect(first.kind).toBe('bhbh');
    expect(new Date(gpsToUnixMs(first.gps)).toISOString().slice(0, 19)).toBe('2015-09-14T09:50:45');
    expect(mergers.find((e) => e.name === 'GW170817')!.kind).toBe('nsns');
  });
});

describe('cross-matching keeps one record of each object', () => {
  /** Every name and alias of the app's own deep-sky bodies (its data files), normalised without spaces. */
  const own = new Set<string>();
  const add = (s: string) => own.add(normalise(s).replace(/ /g, ''));
  beforeAll(() => {
    for (const o of loadNamed().objects) [o.name, ...o.aliases].forEach(add);
    for (const g of loadLocalGalaxies().galaxies) add(g.name);
    for (const n of readJson<NebulaeFile>('src/sim/galaxy/nebulae.json').objects) [n.name, ...(n.otherNames ?? [])].forEach(add);
  });

  it('no NGC/IC object of the catalogues is one the app already has', () => {
    for (const o of [...galactic, ...galaxies]) expect(own.has(normalise(o.designation).replace(/ /g, '')), o.designation).toBe(false);
  });

  it('their designations lead to the app’s own record instead', () => {
    const map = new Map(existing);
    expect(map.get('NGC 224')).toBe('Andromeda Galaxy');
    expect(map.get('NGC 1976')).toBe('Orion Nebula');
    expect(map.get('NGC 104')).toBe('47 Tucanae');
  });

  it('the remnants the app shows as nebulae with pictures are left out, and found by their Green names', () => {
    const names = new Set(snrs.snrs.map((s) => s.name));
    for (const g of ['G184.6-5.8', 'G111.7-2.1', 'G74.0-8.5']) expect(names.has(g)).toBe(false);
    expect(new Map(snrs.existing).get('G184.6-5.8')).toBe('Crab Nebula');
  });

  it('every object has an id of its own', () => {
    const ids = new Set<string>();
    for (const s of DEEP_SKY_SETS) {
      const set = buildSet(s, files[s]);
      for (const e of set.entries) {
        expect(ids.has(e.id), e.id).toBe(false);
        ids.add(e.id);
      }
    }
  });
});

describe('search', () => {
  const sets = new Map<DeepSkySetId, LoadedSet>();
  beforeAll(() => {
    registerUniverse();
    for (const s of DEEP_SKY_SETS) {
      const set = buildSet(s, files[s]);
      sets.set(s, set);
      adoptSet(set);
    }
    for (const [d, body] of existing) {
      deepSky.existing.set(normalise(d), body);
      deepSky.existing.set(normalise(d).replace(/ /g, ''), body);
    }
  });
  const first = (q: string) => deepSkyRuntime.search(q)[0];

  it('finds the new designations however they are typed', () => {
    expect(first('NGC 6744')?.name).toBe('NGC 6744');
    expect(first('ngc6744')?.name).toBe('NGC 6744');
    expect(first('NGC 2403')?.name).toBe('NGC 2403');
    expect(first('IC 342')?.name).toBe('IC 342');
    expect(first('PSR J0437-4715')?.name).toBe('PSR J0437−4715');
    expect(first('PSR J0437−4715')?.name).toBe('PSR J0437−4715');
    expect(first('J0437-4715')?.name).toBe('PSR J0437−4715');
    expect(first('B0531+21')?.name).toBe('Crab Pulsar');
    expect(first('GW150914')?.name).toBe('GW150914');
    expect(first('GW230529')?.name).toBe('GW230529_181500');
    expect(first('G263.9-3.3')?.name).toBe('Vela Supernova Remnant');
    expect(first('IC 443')?.name).toBe('IC 443');
    expect(first("Jupiter's Ghost")?.name).toBe('Jupiter’s Ghost Nebula'.replace('’', "'"));
  });

  it('leads a designation of the app’s own object to its record', () => {
    expect(first('NGC 224')?.id).toBe('andromeda');
    expect(first('NGC 1976')?.id).toBe('orion-nebula');
    // The famous galaxies and the clusters' brightest are galaxies of their own (sim/cosmos/moreGalaxies.ts).
    expect(first('NGC 4565')?.id).toBe('ngc-4565');
    expect(first('ngc4565')?.id).toBe('ngc-4565');
    expect(first('M101')?.id).toBe('m101');
    expect(first('M 82')?.id).toBe('m82');
    expect(first('NGC 4874')?.id).toBe('ngc-4874');
    expect(sets.get('ngc-galaxies')!.entries.some((e) => e.id === 'ngc-3034' || e.id === 'ngc-4874')).toBe(false);
  });

  it('a found object becomes a body when chosen, and goes again when let go of', () => {
    const d = first('PSR J1012+5307');
    expect(d?.body).toBe('psr-j1012p5307');
    expect(isBody('psr-j1012p5307')).toBe(false);
    d!.prepare!();
    expect(isBody('psr-j1012p5307')).toBe(true);
    expect(deepSkyRuntime.ensure('pulsars', sets.get('pulsars')!.indexById.get('psr-j1012p5307')!)).toBe('psr-j1012p5307');
    expect(onDemandBodies().has('psr-j1012p5307')).toBe(true);
  });
});

describe('the cards are short', () => {
  it('a sentence or three, one line on what is a model, a short kind', () => {
    let n = 0;
    for (const s of DEEP_SKY_SETS) {
      const set = buildSet(s, files[s]);
      // Every remnant, merger and named object, and every 20th of the rest.
      set.entries.forEach((e, i) => {
        if (!(e.prominent || s === 'snrs' || s === 'gw-events' || i % 20 === 0)) return;
        const r = set.record(i, e);
        const facts = (r.facts ?? []).join(' ');
        expect(facts.length, `${e.name}: ${facts}`).toBeLessThanOrEqual(330);
        expect((r.facts ?? []).length, e.name).toBeLessThanOrEqual(3);
        expect((r.deepSky?.cardNote ?? '').length, e.name).toBeLessThanOrEqual(220);
        expect(e.kindText.length, e.kindText).toBeLessThanOrEqual(60);
        expect(r.deepSky?.distancePc, e.name).toBeGreaterThan(0);
        // Where it comes from is under Sources, not in the card's sentences.
        expect(facts).not.toMatch(/doi|et al\.|\([A-Z][a-z]+(?: & [A-Z][a-z]+)? \d{4}[a-z]?\)/);
        n++;
      });
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('say when a pulsar’s distance comes from its dispersion measure', () => {
    const set = buildSet('pulsars', files.pulsars);
    const i = pulsars.findIndex((p) => p.method === 'dm');
    expect(set.record(i, set.entries[i]).deepSky?.cardNote).toMatch(/dispersion measure/);
    const j = pulsars.findIndex((p) => p.method === 'parallax');
    expect(set.record(j, set.entries[j]).deepSky?.cardNote).toBeUndefined();
    expect(pulsarName({ jname: 'J0437-4715' })).toBe('PSR J0437−4715');
  });
});

describe('the markers', () => {
  it('pulse at the real period when it can be watched, else slowed by a power of ten', () => {
    expect(shownPulse(1.337)).toEqual({ periodS: 1.337, slowedBy: 1 });
    expect(shownPulse(0.0334).slowedBy).toBe(10);
    expect(shownPulse(0.00576).slowedBy).toBe(100);
    for (const p of pulsars) {
      if (!(p.p0 > 0)) continue;
      const s = shownPulse(p.p0);
      expect(s.periodS).toBeGreaterThanOrEqual(WATCHABLE_PERIOD_S);
      expect(s.periodS).toBeLessThan(Math.max(10 * WATCHABLE_PERIOD_S, p.p0 * 1.000001));
    }
  });

  it('fade with distance and size, so the sky does not fill', () => {
    // A cluster: unseen while under a pixel, shown once resolved, gone when it fills the view or the camera is in it.
    expect(galacticAlpha(STYLE.openCluster, 1000, 0.3, 3)).toBe(0);
    expect(galacticAlpha(STYLE.openCluster, 1000, 5, 3)).toBe(1);
    expect(galacticAlpha(STYLE.openCluster, 10, 500, 3)).toBe(0);
    expect(galacticAlpha(STYLE.openCluster, 2, 500, 3)).toBe(0);
    // A pulsar: within a few hundred parsecs.
    expect(galacticAlpha(STYLE.pulsar, 100, 0, 0)).toBe(1);
    expect(galacticAlpha(STYLE.pulsar, 3000, 0, 0)).toBe(0);
    expect(galaxyAlpha(0.5)).toBe(0);
    expect(galaxyAlpha(20)).toBe(1);
    expect(regionAlpha(30)).toBe(1);
    expect(regionAlpha(120)).toBe(0);
    expect(regionAlpha(120, true)).toBe(1);
    expect(regionAlpha(300, true)).toBe(0);
  });
});
