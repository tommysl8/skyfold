import { describe, expect, it } from 'vitest';
import { decodeLog, encodeLog, faceShare, LAYER_RES_INSIDE, layerResolution } from './faceOn';
import ranges from './faceOn.json';

describe('the Milky Way from outside', () => {
  it('encodes its maps to within a percent or two', () => {
    for (const r of [ranges.young, ranges.bar, ranges.dust]) {
      for (const f of [0.001, 0.01, 0.1, 0.5, 1]) {
        const v = f * r.vmax;
        expect(Math.abs(decodeLog(encodeLog(v, r), r) - v) / v).toBeLessThan(f < 0.01 ? 0.05 : 0.02);
      }
      expect(decodeLog(0, r)).toBe(0);
    }
  });

  it('draws the face only from well above the disc, not edge-on or from inside', () => {
    expect(faceShare([-8.2, 0, 0.02])).toBe(0); // the Sun
    expect(faceShare([0, 0, 1])).toBe(0);
    expect(faceShare([0, 0, 25])).toBe(1); // above the centre
    expect(faceShare([-20, 5, 15])).toBe(1);
    expect(faceShare([60, 0, 4])).toBe(0); // far off, nearly edge-on
  });

  it('draws the layer sharp outside, coarse inside, without flipping at the edges', () => {
    expect(layerResolution(LAYER_RES_INSIDE, 0, 8)).toBe(LAYER_RES_INSIDE);
    expect(layerResolution(LAYER_RES_INSIDE, 1, 25)).toBe(1);
    expect(layerResolution(LAYER_RES_INSIDE, 0, 100)).toBe(1);
    // In the margin it stays as it was.
    expect(layerResolution(LAYER_RES_INSIDE, 0.45, 20)).toBe(LAYER_RES_INSIDE);
    expect(layerResolution(1, 0.45, 20)).toBe(1);
    expect(layerResolution(1, 0.1, 37)).toBe(1);
    expect(layerResolution(1, 0.1, 20)).toBe(LAYER_RES_INSIDE);
  });
});
