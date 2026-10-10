import { describe, expect, test } from 'vitest';
import { darkTargets } from './darkLayer';

describe('the dark-matter layer: what shows', () => {
  test('nothing with the switch off', () => {
    expect(darkTargets(false, 100, 500)).toEqual({ halo: 0, tracers: 0, bullet: 0 });
  });

  test('the halo and the tracers from outside the disc only, the tracers gone by 250 kpc, the halo by 5 Mpc', () => {
    expect(darkTargets(true, 8.3, 0)).toMatchObject({ halo: 0, tracers: 0 });
    expect(darkTargets(true, 100, 0)).toMatchObject({ halo: 1, tracers: 1 });
    expect(darkTargets(true, 300, 0)).toMatchObject({ halo: 1, tracers: 0 });
    expect(darkTargets(true, 6000, 0).halo).toBe(0);
    const mid = darkTargets(true, 17, 0);
    expect(mid.halo).toBeGreaterThan(0);
    expect(mid.halo).toBeLessThan(1);
  });

  test('the Bullet Cluster’s card once the cluster is a few dozen pixels across', () => {
    expect(darkTargets(true, 1e6, 4).bullet).toBe(0);
    expect(darkTargets(true, 1e6, 40).bullet).toBe(1);
  });
});
