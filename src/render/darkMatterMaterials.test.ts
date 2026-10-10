import { describe, expect, test } from 'vitest';
import { fillHaloTable, HALO_TABLE_SIZE } from './darkMatterMaterials';
import { haloColumn, haloRadius } from '../sim/galaxy/darkMatter';

const R = haloRadius(200);
const norm = 1 / Math.log(61);
const value = (sigmaKpc2: number) => Math.log1p((sigmaKpc2 * 1e-6) / 10) * norm;

describe('the halo’s table', () => {
  test('from outside: the column through the centre first, falling outwards, nothing beyond the limb', () => {
    const t = new Float32Array(HALO_TABLE_SIZE);
    const d = 300;
    fillHaloTable(t, d, R, haloColumn, 10, norm);
    // Straight at the centre: the whole diameter (b clamped to 10 pc).
    expect(t[0]).toBeCloseTo(value(haloColumn(0, -R, R)), 5);
    for (let i = 1; i < HALO_TABLE_SIZE; i++) expect(t[i]).toBeLessThanOrEqual(t[i - 1] + 1e-9);
    // The limb is at sin θ = R/d: beyond it, empty.
    const limb = Math.sqrt(Math.sin(Math.asin(R / d) / 2));
    expect(t[Math.ceil(limb * (HALO_TABLE_SIZE - 1)) + 1]).toBe(0);
    expect(t[Math.floor(limb * (HALO_TABLE_SIZE - 1)) - 2]).toBeGreaterThan(0);
  });

  test('from inside: every direction has a column, towards the centre the most', () => {
    const t = new Float32Array(HALO_TABLE_SIZE);
    fillHaloTable(t, 8.2, R, haloColumn, 10, norm);
    expect(t[HALO_TABLE_SIZE - 1]).toBeGreaterThan(0);
    expect(t[0]).toBeGreaterThan(t[HALO_TABLE_SIZE - 1]);
    // Straight away from the centre: from the camera to the edge.
    expect(t[HALO_TABLE_SIZE - 1]).toBeCloseTo(value(haloColumn(0, 8.2, R)), 3);
  });
});
