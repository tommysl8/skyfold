import { describe, expect, it } from 'vitest';
import { apparentV, inclinationFromAxisRatio, templateForHubble } from './moreGalaxies';
import { loadMore, loadNamed, loadWeb } from '../../test/cosmos';
import { norm } from './frames';
import { dmToMpc } from './cosmology';

describe('the rules', () => {
  it('maps HyperLEDA types to templates', () => {
    expect(templateForHubble('E')).toBe('elliptical');
    expect(templateForHubble('E-S0')).toBe('elliptical');
    expect(templateForHubble('S0')).toBe('lenticular');
    expect(templateForHubble('S0-a')).toBe('lenticular');
    expect(templateForHubble('Sa')).toBe('spiral-early');
    expect(templateForHubble('SABa')).toBe('spiral-early');
    expect(templateForHubble('Sb')).toBe('spiral');
    expect(templateForHubble('SABbc')).toBe('spiral');
    expect(templateForHubble('Sc')).toBe('spiral-late');
    expect(templateForHubble('SABc')).toBe('spiral-late');
    expect(templateForHubble('SBb')).toBe('barred');
    expect(templateForHubble('SBm')).toBe('irregular');
    expect(templateForHubble('S?')).toBe('irregular');
    expect(templateForHubble('I')).toBe('irregular');
    expect(templateForHubble(null)).toBe('spiral');
  });

  it('works out a disc’s tilt from its axis ratio (q0 = 0.2)', () => {
    expect(inclinationFromAxisRatio(1)).toBeCloseTo(0, 9);
    expect(inclinationFromAxisRatio(0.2)).toBeCloseTo(90, 9);
    expect(inclinationFromAxisRatio(0.1)).toBeCloseTo(90, 9);
    // cos² i = (0.25 − 0.04) / 0.96.
    expect(inclinationFromAxisRatio(0.5)).toBeCloseTo((Math.acos(Math.sqrt(0.21 / 0.96)) * 180) / Math.PI, 9);
  });

  it('takes V where B − V is a galaxy’s, else B less the type’s colour', () => {
    expect(apparentV({ bMag: 9.5, vMag: 8.7 }, 0.9)).toEqual({ v: 8.7, fromB: false });
    expect(apparentV({ bMag: 8.03, vMag: 11.11 }, 0.6)).toEqual({ v: 8.03 - 0.6, fromB: true });
    expect(apparentV({ bMag: null, vMag: 10 }, 0.6)).toEqual({ v: 10, fromB: false });
    expect(apparentV({ bMag: 12, vMag: null }, 0.9)).toEqual({ v: 11.1, fromB: true });
    expect(apparentV({ bMag: null, vMag: null }, 0.9)).toBeNull();
  });
});

describe('more-galaxies.json.gz', () => {
  const doc = loadMore();
  const named = loadNamed();
  const web = loadWeb();
  const virgo = named.objects.find((o) => o.id === 'virgo-cluster')!;
  const coma = named.objects.find((o) => o.id === 'coma-cluster')!;

  it('has the famous galaxies and the Virgo Cluster’s Messier galaxies, once each, none of the named ones', () => {
    const ids = doc.galaxies.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['m82', 'm64', 'm63', 'm65', 'm66', 'ngc-3628', 'ngc-1300', 'ngc-4038', 'ngc-4039', 'm83', 'ngc-253', 'm101']) expect(ids).toContain(id);
    for (const m of [49, 58, 59, 60, 61, 84, 85, 86, 88, 89, 90, 91, 98, 99, 100]) expect(ids).toContain(`m${m}`);
    for (const id of ['ngc-4874', 'ngc-4889']) expect(ids).toContain(id);
    for (const o of named.objects) expect(ids).not.toContain(o.id);
    expect(ids.filter((id) => doc.galaxies.find((g) => g.id === id)!.set === 'coma').length).toBeGreaterThanOrEqual(30);
  });

  it('places the Virgo galaxies within a few Mpc of the cluster (its depth), on the cluster’s scale', () => {
    for (const g of doc.galaxies.filter((x) => x.set === 'virgo')) {
      const d = norm(g.positionEclMpc);
      expect(d, g.id).toBeGreaterThan(11);
      expect(d, g.id).toBeLessThan(24);
      expect(d / g.distance.placedMpc).toBeCloseTo(1, 5);
      if (g.distance.basis === 'cluster') expect(g.distance.placedMpc).toBeCloseTo(norm(virgo.positionEclMpc), 3);
    }
    // M86, which Cosmicflows-4 lacks, has its own SBF distance (Mei et al. 2007: m − M = 31.13).
    const m86 = doc.galaxies.find((g) => g.id === 'm86')!;
    expect(m86.distance.basis).toBe('individual');
    expect(m86.distance.measuredMpc).toBeCloseTo(dmToMpc(31.13), 2);
  });

  it('places the Coma galaxies at the cluster’s distance, in their own directions', () => {
    for (const g of doc.galaxies.filter((x) => x.set === 'coma')) {
      expect(norm(g.positionEclMpc)).toBeCloseTo(norm(coma.positionEclMpc), 3);
      expect(g.distance.basis).toBe('cluster');
    }
  });

  it('links each galaxy in the cosmic web to its row (the web leaves it out)', () => {
    for (const g of doc.galaxies) {
      if (g.cfRow === null) continue;
      const dRa = (web.ra[g.cfRow] - g.ra) * Math.cos((g.dec * Math.PI) / 180);
      const sep = Math.hypot(dRa, web.dec[g.cfRow] - g.dec) * 3600;
      expect(sep, g.id).toBeLessThan(15);
    }
  });
});
