import { describe, expect, test } from 'vitest';
import named from './named.json';
import {
  apertureMean,
  BULLET_CENTRE,
  BULLET_KPC_PER_ARCSEC,
  BULLET_PLACES,
  BULLET_XRAY,
  BULLET_XRAY_PEAKS_PX,
  bulletKappa,
  CLOWE_TABLE_2,
  groupCentresMpc,
  kappaPeaks,
  KAPPA_CONTOURS,
  skyOffset,
  xrayPixelToSky,
} from './bulletCluster';

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('the Bullet Cluster (Clowe et al. 2006)', () => {
  test('the catalogued place and scale are named.json’s', () => {
    const o = named.objects.find((x) => x.id === 'bullet-cluster')!;
    expect(o.ra).toBe(BULLET_CENTRE.raDeg);
    expect(o.dec).toBe(BULLET_CENTRE.decDeg);
    // D_A = 940.7 Mpc at z = 0.296 (Planck 2018): 4.56 kpc per arcsecond (Clowe et al.: 4.413 for their cosmology).
    expect(BULLET_KPC_PER_ARCSEC).toBeCloseTo((o.cosmology!.angularDiameterDistanceMpc * 1000 * Math.PI) / 648_000, 9);
    expect(BULLET_KPC_PER_ARCSEC).toBeCloseTo(4.561, 3);
  });

  test('sky offsets: east is increasing RA', () => {
    const [e, n] = skyOffset('06:58:26.88', '-55:58:21.0');
    expect(e).toBeCloseTo(0, 1);
    expect(n).toBeCloseTo(0, 1);
    expect(skyOffset('06:58:27.88', '-55:58:21.0')[0]).toBeCloseTo(15 * Math.cos((55.9725 * Math.PI) / 180), 2);
  });

  test('the gas lies between the two mass peaks, each peak beyond its gas', () => {
    const p = BULLET_PLACES;
    // East to west: main cluster's mass, its gas, the bullet's gas, the bullet's mass.
    expect(p.mainPeak[0]).toBeGreaterThan(p.mainGas[0]);
    expect(p.mainGas[0]).toBeGreaterThan(p.subGas[0]);
    expect(p.subGas[0]).toBeGreaterThan(p.subPeak[0]);
    // The subcluster's mass peak sits about 25″ (110 kpc) west of its gas peak; the main one about 32″.
    expect(dist(p.subPeak, p.subGas)).toBeGreaterThan(20);
    expect(dist(p.mainPeak, p.mainGas)).toBeGreaterThan(25);
    // The two BCGs are about 0.74 Mpc apart.
    expect(dist(p.mainBcg, p.subBcg) * BULLET_KPC_PER_ARCSEC).toBeGreaterThan(700);
    expect(dist(p.mainBcg, p.subBcg) * BULLET_KPC_PER_ARCSEC).toBeLessThan(780);
  });

  test('the mass model gives Table 2’s mean κ in 100 kpc about each BCG', () => {
    const peaks = kappaPeaks();
    const ap = 100 / 4.413;
    // The aperture mean of each peak's own profile reproduces the table's κ (the other peak's share taken off, as there).
    const [main, sub] = peaks;
    expect(main.amplitude * apertureMean(dist(main.at, BULLET_PLACES.mainBcg), ap)).toBeCloseTo(CLOWE_TABLE_2.mainBcg.kappa, 6);
    expect(sub.amplitude * apertureMean(dist(sub.at, BULLET_PLACES.subBcg), ap)).toBeCloseTo(CLOWE_TABLE_2.subBcg.kappa, 6);
    // The main cluster's peak is the stronger, the mass at the gas peaks well below the mass peaks.
    expect(main.amplitude).toBeGreaterThan(sub.amplitude);
    expect(bulletKappa(...BULLET_PLACES.mainPeak)).toBeGreaterThan(bulletKappa(...BULLET_PLACES.mainGas));
    expect(bulletKappa(...BULLET_PLACES.subPeak)).toBeGreaterThan(bulletKappa(...BULLET_PLACES.subGas));
    // Both peaks stand inside the paper's outermost contour, κ = 0.16; far out the map falls below it.
    expect(bulletKappa(...BULLET_PLACES.subPeak)).toBeGreaterThan(KAPPA_CONTOURS.first);
    expect(bulletKappa(400, 100)).toBeLessThan(KAPPA_CONTOURS.first);
  });

  test('the X-ray image puts its gas peaks on Table 2’s, within 10″', () => {
    expect(dist(xrayPixelToSky(...BULLET_XRAY_PEAKS_PX.main), BULLET_PLACES.mainGas)).toBeLessThan(10);
    expect(dist(xrayPixelToSky(...BULLET_XRAY_PEAKS_PX.sub), BULLET_PLACES.subGas)).toBeLessThan(10);
    // About 0.89″ a pixel: the image is 8′ across.
    expect(BULLET_XRAY.arcsecPerPx).toBeGreaterThan(0.85);
    expect(BULLET_XRAY.arcsecPerPx).toBeLessThan(0.92);
  });

  test('the galaxies’ two groups sit on the BCGs', () => {
    const g = groupCentresMpc();
    expect(g.main[0]).toBeLessThan(0); // east of the catalogued place: negative along the template's west axis
    expect(g.sub[0]).toBeGreaterThan(0);
    expect(Math.hypot(g.main[0] - g.sub[0], g.main[1] - g.sub[1])).toBeCloseTo(0.74, 1);
  });
});

describe('the cluster template', () => {
  test('its groups are where bulletCluster.ts puts the BCGs', async () => {
    const src = (await import('./templates.ts?raw')).default as string;
    const g = groupCentresMpc();
    const m = /group\(0\.7, 2048, (-?[\d.]+), (-?[\d.]+),[^)]*\), group\(0\.3, 1024, (-?[\d.]+), (-?[\d.]+),/.exec(src)!;
    expect(Number(m[1])).toBeCloseTo(g.main[0], 2);
    expect(Number(m[2])).toBeCloseTo(g.main[1], 2);
    expect(Number(m[3])).toBeCloseTo(g.sub[0], 2);
    expect(Number(m[4])).toBeCloseTo(g.sub[1], 2);
  });
});
