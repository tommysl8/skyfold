/**
 * The magnetars of the McGill catalogue (public/data/deepsky/magnetars.json.gz, scripts/build-magnetars.mjs): read,
 * merged into the ATNF pulsars without duplicates, and drawn with a twisted field. Reads the shipped files.
 */
import { describe, expect, it } from 'vitest';
import { mergeMagnetars, parseMagnetars, parsePulsars, type ColumnFile } from './format';
import { MAGNETAR_TWIST_RAD, NS_RADIUS_KM, pulsarModel, twistedFieldLines } from './pulsarModel';
import { pulsarEntry, pulsarRecord } from './records';
import { gunzipFile } from '../../test/stars';

const read = (name: string): ColumnFile => JSON.parse(new TextDecoder().decode(gunzipFile(`public/data/deepsky/${name}.json.gz`))) as ColumnFile;
const magnetars = parseMagnetars(read('magnetars'));
const pulsars = parsePulsars(read('pulsars'));
const merged = mergeMagnetars(pulsars, magnetars);

describe('the McGill magnetars', () => {
  it('are the 25 with a period and a distance, with the catalogue’s numbers', () => {
    expect(magnetars).toHaveLength(25);
    const sgr = magnetars.find((m) => m.name === 'SGR 1806-20')!;
    // Olausen & Kaspi 2014 (catalogue as retrieved): P = 7.54773 s, Ṗ = 4.95 × 10⁻¹⁰, B = 1.96 × 10¹⁵ G, 8.7 kpc.
    expect(sgr.p0).toBeCloseTo(7.54773, 5);
    expect(sgr.p1).toBeCloseTo(4.95e-10, 12);
    expect(sgr.bG).toBeCloseTo(1.96e15, -13);
    expect(sgr.distPc).toBe(8700);
    expect(sgr.atnf).toBe('J1808-2024');
    expect(sgr.distRef).toMatch(/2008MNRAS\.386L\.\.23B/);
    // B = 3.2 × 10¹⁹ (P Ṗ)^½ G, the catalogue's own relation, to its rounding.
    for (const m of magnetars) if (m.p1 > 0 && m.bG > 0) expect(Math.abs(3.2e19 * Math.sqrt(m.p0 * m.p1) - m.bG) / m.bG).toBeLessThan(0.02);
    // SGR 1935+2154's distance comes from Zhou et al. 2020.
    expect(magnetars.find((m) => m.name === 'SGR 1935+2154')!.distPc).toBe(6600);
  });

  it('merge into the pulsars without duplicates: 15 matched, 10 added', () => {
    expect(magnetars.filter((m) => m.atnf)).toHaveLength(15);
    expect(merged).toHaveLength(pulsars.length + 10);
    const ids = merged.map((p, i) => pulsarEntry(p, i).id);
    expect(new Set(ids).size).toBe(ids.length);
    const sgr = merged.find((p) => p.jname === 'J1808-2024')!;
    expect(sgr.magnetar?.name).toBe('SGR 1806-20');
    // Placed at the magnetar catalogue's distance along the ATNF direction.
    expect(Math.hypot(...sgr.pos)).toBeCloseTo(8700, 0);
    const e = pulsarEntry(sgr, 0);
    expect(e.name).toBe('SGR 1806−20');
    expect(e.aliases).toEqual(expect.arrayContaining(['PSR J1808−2024', 'SGR 1806-20', 'magnetar']));
    expect(e.prominent).toBe(true);
  });

  it('tell SGR 1806−20’s giant flare and draw no radio beams for a magnetar never seen in radio', () => {
    const p = merged.find((q) => q.jname === 'J1808-2024')!;
    const r = pulsarRecord(p, pulsarEntry(p, 0));
    expect(r.facts?.join(' ')).toMatch(/27 December 2004/);
    expect(r.pulsar?.spin.beams).toBe(false);
    expect(r.pulsar?.magnetar?.twistRad).toBe(MAGNETAR_TWIST_RAD);
    // XTE J1810−197 pulses in radio: its beams are drawn.
    const x = merged.find((q) => q.magnetar?.name === 'XTE J1810-197')!;
    expect(pulsarModel(x)!.spin.beams).toBe(true);
  });
});

describe('a magnetar’s twisted field', () => {
  it('leaves and returns to the star’s surface, its ends turned by the twist', () => {
    const f = twistedFieldLines(1, NS_RADIUS_KM, 4);
    const p = f.positions;
    // The first segment of the first line starts on the surface.
    expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(NS_RADIUS_KM, 6);
    // Its last point (64 segments, 2 points each, 3 coordinates) is on the surface too, its azimuth one radian on.
    const last = 64 * 6 - 3;
    expect(Math.hypot(p[last], p[last + 1], p[last + 2])).toBeCloseTo(NS_RADIUS_KM, 6);
    const az0 = Math.atan2(p[1], p[0]);
    const az1 = Math.atan2(p[last + 1], p[last]);
    expect(az1 - az0).toBeCloseTo(1, 6);
    expect([...f.open].every((o) => o === 0)).toBe(true);
  });
});
