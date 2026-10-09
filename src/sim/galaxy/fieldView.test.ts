import { describe, expect, it } from 'vitest';
import { cameraG, FIELD_SKY_SOURCE, fieldLinesShare, fieldShares, fieldSkyShare, fieldSkyTexture, LINES_INSIDE_SHARE } from './fieldView';
import { GAL_TO_WORLD, apply, SUN_G } from './frames';
import { PARSEC_KM } from '../../physics/constants';
import { fileExists, readBytes } from '../../test/files';

const KPC_KM = 1000 * PARSEC_KM;
/** A world position (km from the Sun) for a point of frame G (kpc), ignoring G's 0.1° tilt (enough for shares). */
const worldOfG = (g: [number, number, number]) => {
  const gal = [g[0] - SUN_G[0], g[1] - SUN_G[1], g[2] - SUN_G[2]] as [number, number, number];
  const w = apply(GAL_TO_WORLD, gal);
  return { x: w[0] * KPC_KM, y: w[1] * KPC_KM, z: w[2] * KPC_KM };
};

describe('when the field is drawn', () => {
  it('shows the sky’s drapery near the Solar System and the 3D lines away from it, handing over 100–500 pc out', () => {
    const at = (pc: number) => fieldShares(worldOfG([SUN_G[0] - pc / 1000, 0, SUN_G[2]]));
    expect(at(0)).toEqual({ lines: 0, sky: 1 });
    expect(at(50).lines).toBe(0);
    expect(at(300).sky).toBeGreaterThan(0);
    expect(at(300).lines).toBeGreaterThan(0);
    expect(at(600).sky).toBe(0);
    expect(fieldSkyShare(0)).toBe(1);
  });

  it('draws the lines at a third inside the disc and in full above it or outside the Galaxy, fading far away', () => {
    const far = 1e9 * KPC_KM; // the Sun's distance plays no part beyond 500 pc
    expect(fieldLinesShare([-5, 2, 0], far)).toBeCloseTo(LINES_INSIDE_SHARE, 6);
    expect(fieldLinesShare([0, 0, 40], far)).toBe(1);
    expect(fieldLinesShare([30, 0, 0], far)).toBe(1);
    expect(fieldLinesShare([-5, 2, 2.5], far)).toBeGreaterThan(LINES_INSIDE_SHARE);
    expect(fieldLinesShare([800, 0, 0], far)).toBeGreaterThan(0);
    expect(fieldLinesShare([800, 0, 0], far)).toBeLessThan(1);
    expect(fieldLinesShare([2000, 0, 0], far)).toBe(0);
  });

  it('places the camera in frame G from world km', () => {
    const g = cameraG({ x: 0, y: 0, z: 0 });
    for (let i = 0; i < 3; i++) expect(g[i]).toBeCloseTo(SUN_G[i], 9);
  });

  it('ships the texture it names', () => {
    expect(FIELD_SKY_SOURCE).toBe('wmap');
    expect(fileExists(`public/${fieldSkyTexture()}`)).toBe(true);
    // An 8-bit greyscale PNG of 2048 × 1024 (the IHDR chunk), one channel as the layer loads it.
    const b = readBytes(`public/${fieldSkyTexture()}`);
    const v = new DataView(b.buffer);
    expect(String.fromCharCode(...b.subarray(12, 16))).toBe('IHDR');
    expect([v.getUint32(16), v.getUint32(20), b[24], b[25]]).toEqual([2048, 1024, 8, 0]);
    expect(b.length).toBeLessThan(1.5e6);
  });
});
