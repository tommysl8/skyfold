import { describe, expect, it } from 'vitest';
import { binaryFrame, BURST_SHOWN_S, FUNNEL_AFTER_S, inspiralField, mergerStage, remnantField, twoDipoles } from './mergerField';

describe('two neutron stars’ fields as they merge', () => {
  it('each a dipole: 2m/r³ along its axis, −m/r³ across it', () => {
    const far: [number, number, number] = [1e6, 0, 0];
    const b = twoDipoles([0, 0, 2], [0, 0, 0], [0, 0, 1], far, [0, 0, 0]);
    expect(b[2]).toBeCloseTo(2 / 8, 12);
    const c = twoDipoles([2, 0, 0], [0, 0, 0], [0, 0, 1], far, [0, 0, 0]);
    expect(c[2]).toBeCloseTo(-1 / 8, 12);
  });

  it('the stars about their centre of mass, a separation apart, the moments anti-parallel and one tilted', () => {
    const f = binaryFrame(1.46, 1.27);
    expect(f.c1[0] - f.c2[0]).toBeCloseTo(1, 12);
    expect(1.46 * f.c1[0] + 1.27 * f.c2[0]).toBeCloseTo(0, 12);
    expect(f.m1[2] * f.m2[2]).toBeLessThan(0);
  });

  it('some lines join the two stars; every line runs along the field', () => {
    const f = inspiralField(1.46, 1.27, { azimuths: 6 });
    expect(f.joined).toBeGreaterThan(4);
    expect(f.positions.length).toBeGreaterThan(1000);
    for (const v of f.flow) expect(v).toBe(1);
  });

  it('the burst, then the funnel 60 ms after the merger, growing at c/2; gone by 3 s', () => {
    expect(mergerStage(-1).stage).toBe('inspiral');
    expect(mergerStage(0.1 * BURST_SHOWN_S).stage).toBe('burst');
    expect(mergerStage(FUNNEL_AFTER_S - 0.001).funnelKm).toBe(0);
    expect(mergerStage(1 + FUNNEL_AFTER_S).funnelKm).toBeCloseTo(0.5 * 299_792.458, 3);
    expect(mergerStage(1).fade).toBe(1);
    expect(mergerStage(3).fade).toBe(0);
    expect(remnantField(40, 4).positions.length).toBeGreaterThan(0);
  });
});
