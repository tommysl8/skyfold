/**
 * The second table of black holes (scripts/blackholes-more.mjs; docs/data/blackholes.md §13): the X-ray binaries of
 * BlackCAT and of the Magellanic Clouds and M33, and the supermassive holes at the centres of nearby galaxies. Checked:
 * a few numbers against the papers they were read from (the value, its uncertainty and the paper's key), the masses
 * of the galaxies' holes scaled from the distances their papers assumed to the app's, the binaries' orbits against
 * the published radial-velocity amplitudes, the donors in front of their holes at their ephemerides' T0 (or at
 * J2000.0 where the phase is assumed, which the card then says), and the thin discs' parameters against physics: an
 * Eddington ratio in the thin-disc range, the Eddington luminosity of the papers' definition, the accretion rate that
 * gives it, the inner edge at the innermost stable orbit and the outer edge inside the hole's Roche lobe.
 *
 * Tolerances: 10⁻⁹ where a formula is evaluated twice; the papers' numbers exactly as transcribed.
 */
import { describe, expect, it } from 'vitest';
import { AU_KM, C_KM_S, GM_SUN_KM3_S2, MPC_KM } from '../../physics/constants';
import { ISCO_M, NT_EFFICIENCY } from '../../physics/thinDisk';
import { readJson } from '../../test/files';
import { gunzipFile } from '../../test/stars';
import { orbitStateInto } from '../stars/orbits';
import {
  ASSUMED_PHASE_NOTE,
  BLACK_HOLES,
  blackHoleInfoFrom,
  catalogueGalaxyHoleRecord,
  catalogueGalaxyId,
  GALAXY_HOLE_FRAMING_RS,
  holeJson,
  holeSystemRecords,
  horizonRadiusKm,
} from './records';
import type { HoleJson, HoleOrbitJson, HoleSystemJson } from './types';

const DEG = Math.PI / 180;
const file = BLACK_HOLES;
/** The first table's holes (records.test.ts checks them); everything after is the second table's. */
const FIRST = new Set(['sgr-a-star', 'm87-star', 'gaia-bh1', 'gaia-bh2', 'gaia-bh3', 'cyg-x-1', 'v404-cygni', 'a0620-00', 'maxi-j1820', 'xte-j1118', 'ogle-2011-blg-0462']);
const MORE = file.holes.filter((h) => !FIRST.has(h.id));
const systemOf = (holeId: string): HoleSystemJson => file.systems.find((s) => s.orbits[0].primary[0] === holeId)!;
const pub = <T = { value: number; unc?: unknown; ref: string }>(o: HoleOrbitJson, k: string): T => (o.published as Record<string, T>)[k];
const unit = (v: readonly number[]) => {
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
};
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('the second table', () => {
  it('adds the X-ray binaries and the galaxies’ holes after the first table’s, none of them twice', () => {
    const stellar = MORE.filter((h) => h.class === 'stellar');
    const giants = MORE.filter((h) => h.class === 'supermassive');
    expect(stellar.length).toBe(16);
    expect(giants.map((h) => h.id).sort()).toEqual(
      ['cen-a-bh', 'm104-bh', 'm105-bh', 'm31-star', 'm32-bh', 'm49-bh', 'm60-bh', 'm81-star', 'm84-bh', 'ngc-3115-bh', 'ngc-404-bh', 'ngc-4258-bh', 'ngc-4889-bh'].sort(),
    );
    // M87* and Sgr A* are not repeated; every hole is a binary's or a galaxy's.
    for (const h of MORE) {
      expect(h.id, h.id).not.toMatch(/^(m87|sgr)/);
      expect(['binary', 'galaxy-centre', 'catalogue-galaxy'], h.id).toContain(h.placement);
      if (h.placement === 'binary') expect(systemOf(h.id), h.id).toBeDefined();
      expect(h.massMethod, h.id).toBeTruthy();
      expect(h.fallAllowed, h.id).toBe(false);
      expect(h.modelNotes[0], h.id).toMatch(/^Drawn without spin \(Schwarzschild\)/);
      expect(h.modelNotes.length, h.id).toBeLessThanOrEqual(3);
      for (const n of [...h.modelNotes, h.spin.note]) {
        expect(n.length, h.id).toBeLessThan(200);
        expect(n, h.id).not.toMatch(/\d M\b/);
      }
      expect(h.refs.length, h.id).toBeGreaterThan(0);
    }
  });

  it('holds the papers’ numbers as transcribed (spot checks)', () => {
    const m = (id: string) => holeJson(id)!.mass;
    // Orosz et al. 2009 (LMC X-1): 10.91 ± 1.41 M☉, P = 3.90917 ± 0.00005 d, i = 36.38 ± 1.92°, K = 71.61 km/s.
    expect(m('lmc-x-1')).toMatchObject({ value: 10.91, unc: 1.41, ref: 'Orosz2009' });
    const lmc = systemOf('lmc-x-1').orbits[0];
    expect(pub(lmc, 'periodDays')).toMatchObject({ value: 3.90917, unc: 0.00005, ref: 'Orosz2009' });
    expect(pub(lmc, 'iDeg')).toMatchObject({ value: 36.38, unc: 1.92 });
    // Orosz et al. 2014 (LMC X-3): 6.98 ± 0.56; Song et al. 2010: P = 1.7048089 d. Orosz et al. 2007 (M33 X-7): 15.65 ± 1.45.
    expect(m('lmc-x-3')).toMatchObject({ value: 6.98, unc: 0.56, ref: 'Orosz2014' });
    expect(pub(systemOf('lmc-x-3').orbits[0], 'periodDays')).toMatchObject({ value: 1.7048089, ref: 'Song2010' });
    expect(m('m33-x-7')).toMatchObject({ value: 15.65, unc: 1.45, ref: 'Orosz2007' });
    // Reid et al. 2014 (GRS 1915+105): 12.4 +2.0 −1.8 M☉ at 8.6 +2.0 −1.6 kpc; Steeghs et al. 2013: P = 33.85 ± 0.16 d.
    expect(m('grs-1915')).toMatchObject({ value: 12.4, unc: [1.8, 2.0], ref: 'Reid2014' });
    expect(systemOf('grs-1915').barycentre.distance).toMatchObject({ value: 8600, unc: [1600, 2000], ref: 'Reid2014' });
    expect(pub(systemOf('grs-1915').orbits[0], 'periodDays')).toMatchObject({ value: 33.85, unc: 0.16, ref: 'Steeghs2013' });
    // Orosz et al. 2011 (XTE J1550−564): 9.10 ± 0.61 M☉, P = 1.5420333 d, i = 74.69 ± 3.79°.
    expect(m('xte-j1550')).toMatchObject({ value: 9.1, unc: 0.61, ref: 'Orosz2011' });
    expect(pub(systemOf('xte-j1550').orbits[0], 'periodDays')).toMatchObject({ value: 1.5420333, ref: 'Orosz2011' });
    // The galaxies: Reid et al. 2019 (NGC 4258) 3.98 ± 0.04 × 10⁷ at 7.576 Mpc; Kormendy & Ho 2013 Table 3, M31
    // 1.43 (1.12–2.34) × 10⁸ at 0.774 Mpc; Table 2, NGC 4889 2.08 (0.49–3.66) × 10¹⁰ at 102.0 Mpc and Centaurus A
    // 5.69 (4.65–6.73) × 10⁷ at 3.62 Mpc.
    expect(holeJson('ngc-4258-bh')!.massPublished).toMatchObject({ value: 3.98e7, unc: 0.04e7, distMpc: 7.576, ref: 'Reid2019' });
    const kh = (id: string, value: number, lo: number, hi: number, d: number) => {
      const p = holeJson(id)!.massPublished!;
      expect(p, id).toMatchObject({ value, distMpc: d, ref: 'KormendyHo2013' });
      const u = p.unc as [number, number];
      expect(value - u[0], id).toBeCloseTo(lo, -4);
      expect(value + u[1], id).toBeCloseTo(hi, -4);
    };
    kh('m31-star', 1.43e8, 1.12e8, 2.34e8, 0.774);
    kh('ngc-4889-bh', 2.08e10, 0.49e10, 3.66e10, 102.0);
    kh('cen-a-bh', 5.69e7, 4.65e7, 6.73e7, 3.62);
  });

  it('scales each galaxy’s hole’s mass from its paper’s distance to where the app places the galaxy (M ∝ D)', () => {
    const named = readJson<{ objects: { id: string; positionEclMpc?: number[] }[] }>('src/sim/cosmos/named.json');
    const local = JSON.parse(new TextDecoder().decode(gunzipFile('public/data/local-galaxies.json.gz'))) as { galaxies: { id: string; positionEclKpc: number[] }[] };
    const placed = (h: HoleJson): number => {
      if (h.placement === 'catalogue-galaxy') return Math.hypot(...h.galaxy!.posMpc);
      const n = named.objects.find((o) => o.id === h.host);
      if (n?.positionEclMpc) return Math.hypot(...n.positionEclMpc);
      const g = local.galaxies.find((x) => x.id.replace(/_/g, '-').toLowerCase() === h.host)!;
      return Math.hypot(...g.positionEclKpc) / 1000;
    };
    for (const h of MORE.filter((x) => x.class === 'supermassive')) {
      const p = h.massPublished!;
      const want = (p.value * placed(h)) / p.distMpc;
      expect(Math.abs(h.mass.value / want - 1), h.id).toBeLessThan(0.006); // three significant figures
      expect(h.mass.note, h.id).toMatch(/scaled to the [\d.]+ Mpc its galaxy is placed at/);
      expect(h.mass.ref, h.id).toBe(p.ref);
    }
    // M31* at 0.761 Mpc: 1.43 × 10⁸ × 0.761 / 0.774.
    expect(holeJson('m31-star')!.mass.value).toBeCloseTo((1.43e8 * 0.761) / 0.774, -6);
  });

  it('places the NGC catalogue’s galaxies’ holes as the deep-sky layer places their galaxies', () => {
    const f = JSON.parse(new TextDecoder().decode(gunzipFile('public/data/deepsky/ngc-galaxies.json.gz'))) as { columns: string[]; rows: unknown[][] };
    const col = Object.fromEntries(f.columns.map((c, i) => [c, i]));
    for (const h of MORE.filter((x) => x.placement === 'catalogue-galaxy')) {
      const g = h.galaxy!;
      const row = f.rows.find((r) => r[col.name] === g.designation)!;
      expect(row, h.id).toBeDefined();
      expect(g.posMpc).toEqual([row[col.x], row[col.y], row[col.z]]);
      expect(g.anchorMpc).toEqual([row[col.ax], row[col.ay], row[col.az]]);
      expect(g.distMpc).toBe(row[col.distMpc]);
      // Its record: at that place in the expanding universe, framed from 50 r_s, its galaxy's deep-sky id named.
      const r = catalogueGalaxyHoleRecord(h);
      const p = { x: 0, y: 0, z: 0 };
      r.provider.positionAt({ ut: 0, tt: 0 } as never, p);
      expect(Math.hypot(p.x, p.y, p.z) / MPC_KM, h.id).toBeCloseTo(Math.hypot(...g.posMpc), 2);
      expect(r.framing).toMatchObject({ radii: GALAXY_HOLE_FRAMING_RS });
      expect(r.blackHole!.hostGalaxy).toEqual({ id: catalogueGalaxyId(g.designation), name: g.name });
    }
    expect(catalogueGalaxyId('NGC 4258')).toBe('ngc-4258');
  });
});

describe('the binaries', () => {
  const binaries = MORE.filter((h) => h.placement === 'binary').map((h) => systemOf(h.id));

  it('reproduce the published radial-velocity amplitudes with the masses drawn (within 6 %; GX 339−4, drawn at the middles of its ranges, within 12 %)', () => {
    for (const s of binaries) {
      const o = s.orbits[0];
      const K = pub(o, 'KstarKms');
      if (!K) continue;
      const aStar = (o.aAu * o.massPrimaryMsun) / (o.massPrimaryMsun + o.massSecondaryMsun);
      const model = (2 * Math.PI * aStar * AU_KM * Math.sin(pub(o, 'iDeg').value * DEG)) / (o.periodDays * 86_400 * Math.sqrt(1 - o.e * o.e));
      expect(Math.abs(model / K.value - 1), s.id).toBeLessThan(s.id === 'gx-339-4-system' ? 0.12 : 0.06);
    }
    // LMC X-1's, the best: 71.59 against 71.61 km/s.
    const lmc = systemOf('lmc-x-1').orbits[0];
    const a = (lmc.aAu * 10.91) / (10.91 + 31.79);
    expect((2 * Math.PI * a * AU_KM * Math.sin(36.38 * DEG)) / (lmc.periodDays * 86_400)).toBeCloseTo(71.6, 1);
  });

  it('put each donor in front of its hole at T0, its radial velocity crossing from approach to recession; at J2000.0 where the phase is assumed, and say so', () => {
    for (const s of binaries) {
      const o = s.orbits[0];
      const T0 = s.phaseAssumed ? 2451545.0 : pub(o, 'T0JD').value;
      expect(o.tPeriJD, s.id).toBeCloseTo(T0 - o.periodDays / 2, 8);
      const away = unit(s.barycentre.posPc);
      const p = [0, 0, 0];
      const v = [0, 0, 0];
      orbitStateInto(o, T0, p, v);
      expect(dot(p, away) / (-o.aAu * Math.sin(pub(o, 'iDeg').value * DEG)) - 1, s.id).toBeLessThan(1e-9);
      const dt = o.periodDays * 1e-3;
      orbitStateInto(o, T0 - dt, p, v);
      expect(dot(v, away), s.id).toBeLessThan(0);
      orbitStateInto(o, T0 + dt, p, v);
      expect(dot(v, away), s.id).toBeGreaterThan(0);
      const [, hole] = holeSystemRecords(file, s);
      if (s.phaseAssumed) {
        expect(hole.positionNote, s.id).toContain(ASSUMED_PHASE_NOTE);
        expect(o.assumed.join(' '), s.id).toMatch(/the phase/);
        expect(hole.modelNotes!.join(' ') + (hole.blackHole?.sheetNotes ?? []).join(' '), s.id).toMatch(/phase|illustrative/);
      }
    }
    expect(systemOf('grs-1915').phaseAssumed).toBe(true);
  });

  it('put the Magellanic Clouds’ and M33’s binaries in their galaxies', () => {
    for (const [id, host, name] of [
      ['lmc-x-1', 'lmc', 'Large Magellanic Cloud'],
      ['lmc-x-3', 'lmc', 'Large Magellanic Cloud'],
      ['m33-x-7', 'triangulum', 'Triangulum Galaxy'],
    ] as const) {
      const [, hole] = holeSystemRecords(file, systemOf(id));
      expect(hole.blackHole!.hostGalaxy, id).toEqual({ id: host, name });
      expect(hole.deepSky!.hostGalaxy).toBe(name);
      expect(hole.positionNote).toContain(`in the ${name}`);
    }
    // At the Cloud's distance (Pietrzyński et al. 2019) and M33's (Orosz et al. 2007).
    expect(systemOf('lmc-x-1').barycentre.distancePc).toBeCloseTo(49_590, -1);
    expect(systemOf('m33-x-7').barycentre.distancePc).toBeCloseTo(840_000, -2);
  });
});

describe('the thin discs', () => {
  const discs = MORE.filter((h) => h.disk);

  it('are drawn for the persistent and long-bright systems only', () => {
    expect(discs.map((h) => h.id).sort()).toEqual(['grs-1915', 'lmc-x-1', 'lmc-x-3', 'm33-x-7']);
  });

  it('are physical: a thin-disc Eddington ratio, the papers’ Eddington luminosity, the accretion rate that gives it, the inner edge at the innermost stable orbit, the outer inside the Roche lobe', () => {
    for (const h of discs) {
      const s = systemOf(h.id);
      const o = s.orbits[0];
      const info = blackHoleInfoFrom(h, file, o);
      const d = info.disk!;
      // A thin disc (H/R < 0.1) needs l < 0.3 (McClintock et al. 2006); the papers' L_Edd = 1.3 × 10³⁸ (M/M☉) erg/s.
      expect(d.eddingtonFraction, h.id).toBeGreaterThan(0.01);
      expect(d.eddingtonFraction, h.id).toBeLessThanOrEqual(0.3);
      expect(Math.abs(d.lEddErgS / (1.3e38 * h.mass.value) - 1), h.id).toBeLessThan(1e-3);
      // Ṁ = l L_Edd / (η c²), η = 1 − √(8/9) for no spin: 10¹⁷–10¹⁹ g/s.
      expect((d.mdotGs * NT_EFFICIENCY * (C_KM_S * 1e5) ** 2) / (d.eddingtonFraction * d.lEddErgS)).toBeCloseTo(1, 9);
      expect(d.mdotGs, h.id).toBeGreaterThan(1e17);
      expect(d.mdotGs, h.id).toBeLessThan(1e19);
      // Inner edge at the ISCO of a hole that does not spin, 6 GM/c²; the hottest ring 10⁶–10⁷ K, as a stellar hole's.
      expect(d.rInM).toBe(ISCO_M);
      expect(d.peakTK, h.id).toBeGreaterThan(1e6);
      expect(d.peakTK, h.id).toBeLessThan(1e7);
      // Outer edge 10¹¹ cm: inside the orbit table's reach (10⁵ M) and the hole's Roche lobe (Eggleton 1983).
      expect(d.rOutM, h.id).toBeLessThan(1e5);
      const q = o.massPrimaryMsun / o.massSecondaryMsun;
      const rl = ((0.49 * q ** (2 / 3)) / (0.6 * q ** (2 / 3) + Math.log(1 + q ** (1 / 3)))) * o.aAu * AU_KM * 1e5;
      expect(h.disk!.rOutCm.value, h.id).toBeLessThan(rl);
      // The real period at the inner edge: 2π 6^{3/2} GM/c³.
      expect(d.innerPeriodS).toBeCloseTo((2 * Math.PI * 6 ** 1.5 * h.mass.value * GM_SUN_KM3_S2) / C_KM_S ** 3, 12);
      // The card says it is a model, a typical state, not live.
      expect(h.modelNotes.join(' '), h.id).toMatch(/Its disc is a model: .* a typical state \(not live\)/);
      expect(horizonRadiusKm(h.mass.value)).toBeGreaterThan(0);
    }
    // LMC X-1 at Gou et al. 2009's 0.160; M33 X-7 within Liu et al. 2008's 0.07–0.11.
    expect(holeJson('lmc-x-1')!.disk!.eddingtonFraction).toMatchObject({ value: 0.16, ref: 'Gou2009' });
    const m33 = holeJson('m33-x-7')!.disk!.eddingtonFraction.value;
    expect(m33).toBeGreaterThanOrEqual(0.07);
    expect(m33).toBeLessThanOrEqual(0.11);
  });
});
