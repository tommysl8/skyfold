import { describe, expect, test } from 'vitest';
import { galPcFromLbd } from './volume';
import { nearestOnWave, RADCLIFFE_FIT, RADCLIFFE_LENGTH_PC, RADCLIFFE_RADIUS_PC, radcliffeLine, radcliffePoint, radcliffeZ } from './radcliffe';

describe('the Radcliffe Wave (Konietzka et al. 2024)', () => {
  test('its baseline runs through the three anchor points', () => {
    const f = RADCLIFFE_FIT;
    const a = radcliffePoint(0);
    expect(a[0]).toBeCloseTo(f.x0, 6);
    expect(a[1]).toBeCloseTo(f.y0, 6);
    const b = radcliffePoint(RADCLIFFE_LENGTH_PC);
    expect(b[0]).toBeCloseTo(f.x2, 6);
    expect(b[1]).toBeCloseTo(f.y2, 6);
    // The middle anchor lies on it.
    const near = Math.min(...radcliffeLine(2000).map((p) => Math.hypot(p[0] - f.x1, p[1] - f.y1)));
    expect(near).toBeLessThan(2);
  });

  test('its size: about 2.5 kpc long in the plane, up to about 220 pc from it', () => {
    // Alves et al. 2020: 2.7 ± 0.2 kpc along the curve in 3D; the baseline in the plane is a little shorter.
    expect(RADCLIFFE_LENGTH_PC).toBeGreaterThan(2300);
    expect(RADCLIFFE_LENGTH_PC).toBeLessThan(2800);
    let zMax = 0;
    for (let s = 0; s <= RADCLIFFE_LENGTH_PC; s += 5) zMax = Math.max(zMax, Math.abs(radcliffeZ(s)));
    expect(zMax).toBeLessThanOrEqual(RADCLIFFE_FIT.A);
    expect(zMax).toBeGreaterThan(150);
    // Its closest approach to the Sun is about 300 pc (Alves et al. 2020).
    const closest = Math.min(...radcliffeLine(2000).map((p) => Math.hypot(...p)));
    expect(closest).toBeGreaterThan(200);
    expect(closest).toBeLessThan(330);
  });

  test('it passes through the clouds the papers place on it, Orion in its trough', () => {
    // Places: Zucker et al. 2020's medians (sim/dust/clouds.ts); North America and Canis Major OB1 likewise.
    const on = {
      'Orion A': galPcFromLbd(209.4, -19.6, 417),
      Perseus: galPcFromLbd(159.6, -19.3, 285),
      'North America': galPcFromLbd(85.3, -0.7, 795),
      'Canis Major OB1': galPcFromLbd(225.0, -0.2, 1266),
    };
    for (const [name, p] of Object.entries(on)) {
      // Within about two of its radii (47 pc).
      expect(nearestOnWave(p).distancePc, name).toBeLessThan(2.3 * RADCLIFFE_RADIUS_PC);
    }
    const orion = nearestOnWave(on['Orion A']);
    expect(orion.point[2]).toBeLessThan(-140);
    // Orion is near the greatest deflection (s0 = 545 pc along it).
    expect(Math.abs(orion.s - RADCLIFFE_FIT.s0)).toBeLessThan(300);
  });
});
