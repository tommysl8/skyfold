import { describe, expect, test } from 'vitest';
import { PARSEC_KM } from '../../physics/constants';
import { gunzipFile } from '../../test/stars';
import { cloudLabelKm, cloudPc, cloudRecord, dustRecords, NAMED_CLOUDS, RADCLIFFE_ID, RADCLIFFE_LABEL_KM, radcliffeRecord } from './clouds';
import { decodeDustGrid, densityTable, DUST_FILES, galPcFromLbd, nestedDensityAt } from './volume';

const outer = decodeDustGrid(gunzipFile(`public/${DUST_FILES.outer}`));
const inner = decodeDustGrid(gunzipFile(`public/${DUST_FILES.inner}`));
const grids = { outer, inner };
const tables = { outer: densityTable(outer), inner: densityTable(inner) };

describe('the named clouds', () => {
  test('each sits where the dust map has its cloud: the densest point along its line of sight within 25 pc (9 %)', () => {
    for (const c of NAMED_CLOUDS) {
      let best = 0;
      let at = 0;
      for (let d = 70; d < 1200; d += 1) {
        const p = galPcFromLbd(c.l, c.b, d);
        const rho = nestedDensityAt(grids, tables, ...p);
        if (rho > best) {
          best = rho;
          at = d;
        }
      }
      expect(Math.abs(at - c.dPc), c.name).toBeLessThanOrEqual(Math.max(25, 0.09 * c.dPc));
      // A real cloud: over 10 mag/kpc at the map's resolution (the diffuse dust is about 1).
      expect(best * 1000, c.name).toBeGreaterThan(10);
    }
  });

  test('places: the papers’ distances, within the spread of their sightlines', () => {
    for (const c of NAMED_CLOUDS) {
      expect(c.dPc).toBeGreaterThanOrEqual(c.dRangePc[0]);
      expect(c.dPc).toBeLessThanOrEqual(c.dRangePc[1]);
      const p = cloudPc(c);
      expect(Math.hypot(...p)).toBeCloseTo(c.dPc, 9);
    }
    // Orion A lies some 140 pc below the plane, the Cepheus Flare about 100 above (Zucker et al. 2020).
    const orion = cloudPc(NAMED_CLOUDS.find((c) => c.id === 'orion-a-cloud')!);
    expect(orion[2]).toBeLessThan(-120);
    const cepheus = cloudPc(NAMED_CLOUDS.find((c) => c.id === 'cepheus-flare')!);
    expect(cepheus[2]).toBeGreaterThan(90);
  });

  test('records: quiet labels, near the cloud and never from home', () => {
    const records = dustRecords();
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
    for (const c of NAMED_CLOUDS) {
      const r = cloudRecord(c);
      expect(r.kind).toBe('nebula');
      expect(r.visual?.renderer).toBe('layer');
      // From the Sun (c.dPc away) the label is out of range.
      expect(r.labelRange?.maxKm).toBeLessThan(c.dPc * PARSEC_KM);
      expect(cloudLabelKm(c)).toBeLessThanOrEqual(120 * PARSEC_KM);
      expect(r.facts?.[0]).toMatch(/light-years/);
      expect(r.deepSky?.refs?.join(' ')).toMatch(/Edenhofer et al\. 2024/);
    }
    const w = radcliffeRecord();
    expect(w.id).toBe(RADCLIFFE_ID);
    expect(w.labelRange).toEqual(RADCLIFFE_LABEL_KM);
    expect(w.deepSky?.refs?.join(' ')).toMatch(/Konietzka et al\. 2024/);
  });
});
