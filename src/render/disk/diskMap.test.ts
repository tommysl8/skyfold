/**
 * The thin disc's uniforms, exposure and clock (render/disk/diskMap.ts): Cygnus X-1's disc from its record, the
 * camera's orbit rows, the spot exposure on the hottest ring, the lens box over the disc's whole image, the share
 * fading in with the disc's size on the screen, the swirl's clock 1,000 times slower than real, and the noise.
 */
import { describe, expect, it } from 'vitest';
import { blackHoleInfoFrom, BLACK_HOLES } from '../../sim/blackholes/records';
import { DISK_CONTRAST, DISK_KEY, DISK_KEY_ALL, diskImageAngle, diskLnExposure, diskNoiseData, diskPeakLnT, diskSpotExposure, diskState, diskUniforms, updateDisk, type DiskFrame } from './diskMap';
import { lensBoxExtra } from '../lens/lensState';
import { cameraRows, ORBIT_ROWS, orbitTable, NT_PEAK_M, ntLnTemperature, keplerRedshift } from '../../physics/thinDisk';
import { sampleBlackbody } from '../../physics/blackbody';
import { SUN_SURFACE_RADIANCE } from '../materials';
import { C_KM_S } from '../../physics/constants';

const holeJson = BLACK_HOLES.holes.find((h) => h.id === 'cyg-x-1')!;
const system = BLACK_HOLES.systems.find((s) => s.orbits[0].primary.includes('cyg-x-1'))!;
const info = blackHoleInfoFrom(holeJson, BLACK_HOLES, system.orbits[0], 'hde-226868');
const disk = info.disk!;
const mKm = info.gmKm3S2 / C_KM_S ** 2;

// The camera 30° from the disc's axis (sin i = ½): the axis is camera → hole, the disc's normal tipped 30° from it.
const n = disk.normalWorld;
const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
const dotT = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
const perp = [t[0] - dotT * n[0], t[1] - dotT * n[1], t[2] - dotT * n[2]];
const pl = Math.hypot(perp[0], perp[1], perp[2]);
const toCam = [0, 1, 2].map((k) => Math.cos(Math.PI / 6) * n[k] + Math.sin(Math.PI / 6) * (perp[k] / pl));
const axis = { x: -toCam[0], y: -toCam[1], z: -toCam[2] };
const frame = (o: Partial<DiskFrame> = {}): DiskFrame => ({ on: true, disk, mKm, rCam: 40, lnG: -0.5 * Math.log1p(-2 / 40), pxPerRad: 1000, dt: 0, lnExposure: 0, light: 'all', axis, ...o });

describe('Cygnus X-1’s disc as drawn', () => {
  it('comes from its record: 2 % of 2.8e39 erg/s, a 2.2-million-kelvin hottest ring, 10¹¹ cm out, in the orbit’s plane', () => {
    expect(disk.eddingtonFraction).toBe(0.02);
    expect(disk.mdotGs / 1e18).toBeCloseTo(1.089, 3);
    expect(disk.peakTK / 1e6).toBeCloseTo(2.216, 3);
    expect(disk.rInM).toBe(6);
    expect(disk.rOutM).toBeCloseTo(1e11 / (mKm * 1e5), 6);
    expect(Math.round(disk.rOutM / 100) * 100).toBe(31900);
    // the inner edge goes round in 9.64 ms; drawn 1,000 times slower
    expect(disk.innerPeriodS * 1000).toBeCloseTo(9.643, 3);
    expect(disk.slowdown).toBe(1000);
    // the axis: unit, along the orbit's angular momentum (p̂ × q̂ in ecliptic axes, world = (x, z, −y))
    const [p, q] = [system.orbits[0].pHat, system.orbits[0].qHat];
    const n = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    expect(Math.hypot(...disk.normalWorld)).toBeCloseTo(1, 12);
    expect(disk.normalWorld[0]).toBeCloseTo(n[0] / Math.hypot(...n), 12);
    expect(disk.normalWorld[1]).toBeCloseTo(n[2] / Math.hypot(...n), 12);
    expect(disk.normalWorld[2]).toBeCloseTo(-n[1] / Math.hypot(...n), 12);
  });

  it('only Cygnus X-1 and the four persistent or long-bright binaries of the second table have one', () => {
    expect(BLACK_HOLES.holes.filter((h) => h.disk).map((h) => h.id)).toEqual(['cyg-x-1', 'grs-1915', 'lmc-x-1', 'lmc-x-3', 'm33-x-7']);
  });
});

describe('the disc’s uniforms', () => {
  it('the camera’s rows, the geometry and the light', () => {
    updateDisk(frame());
    const u = diskUniforms;
    expect(u.uDiskOn.value).toBe(1);
    const rows = u.uDiskRows.value!.image.data as Float32Array;
    const ref = cameraRows(orbitTable(), 40, new Float64Array(ORBIT_ROWS));
    for (const j of [0, 77, 300, 511]) expect(rows[4 * j + 2]).toBeCloseTo(ref[j], 5);
    expect(u.uDiskGeom.value.y).toBe(6);
    expect(u.uDiskGeom.value.z).toBeCloseTo(disk.rOutM, 2);
    // cot of the shadow's edge at 40 M: (r − 3)√(r + 6)/(b_c √(r − 2))
    expect(u.uDiskGeom.value.x).toBeCloseTo((37 * Math.sqrt(46)) / (3 * Math.sqrt(3) * Math.sqrt(38)), 6);
    // all its light: the metered peak's (g T)⁴ at DISK_KEY_ALL with the contrast γ (the camera inside the disc's span:
    // share 1), on the disc's own scale
    expect(diskState.share).toBe(1);
    expect(u.uDiskLight.value.x).toBe(1);
    expect(u.uDiskLight.value.z).toBe(DISK_CONTRAST);
    const lnT = diskPeakLnT(disk, 40, frame().lnG, 1000, 0.5);
    expect(u.uDiskLight.value.y + DISK_CONTRAST * 4 * lnT).toBeCloseTo(Math.log(DISK_KEY_ALL), 5);
    // visible light: a surface of the Sun's calibration, contrast 1, at its spot exposure
    updateDisk(frame({ light: 'visible', lnExposure: -50 }));
    expect(u.uDiskLight.value.x).toBe(0);
    expect(u.uDiskLight.value.z).toBe(1);
    expect(u.uDiskLight.value.y).toBeCloseTo(Math.log(SUN_SURFACE_RADIANCE) - 50, 9);
    updateDisk(frame());
    // the plane's axes are orthonormal
    const n = u.uDiskNormal.value;
    expect(Math.abs(n.dot(u.uDiskX.value)) + Math.abs(n.dot(u.uDiskY.value)) + Math.abs(u.uDiskX.value.dot(u.uDiskY.value))).toBeLessThan(1e-12);
  });

  it('meters the hottest ring on its approaching side: its peak, as nearly towards the camera as the tilt allows', () => {
    const lnG = frame().lnG;
    // face-on (sin i = 0) no Doppler shift; edge-on the gas comes at the camera (L_z = r/√(1 − 2/r))
    const lnT0 = ntLnTemperature(NT_PEAK_M, disk.lnTStarK) + Math.log(keplerRedshift(NT_PEAK_M, 0)) + lnG;
    expect(diskPeakLnT(disk, 40, lnG, 1000, 0)).toBeCloseTo(lnT0, 12);
    const lz = NT_PEAK_M / Math.sqrt(1 - 2 / NT_PEAK_M);
    expect(diskPeakLnT(disk, 40, lnG, 1000, 1) - lnT0).toBeCloseTo(Math.log(keplerRedshift(NT_PEAK_M, lz) / keplerRedshift(NT_PEAK_M, 0)), 12);
    expect(Math.exp(diskPeakLnT(disk, 40, lnG, 1000, 1) - lnT0)).toBeGreaterThan(1.5);
    const y = sampleBlackbody(diskPeakLnT(disk, 40, lnG, 1000, 0.5)).lnY;
    expect(diskSpotExposure(disk, 40, lnG, 1000, 0.5)).toBeCloseTo(Math.log(DISK_KEY) - y - Math.log(SUN_SURFACE_RADIANCE), 12);
    // About 10⁴ times the Sun's surface: in visible light the view stops down by about e^−11.
    expect(diskSpotExposure(disk, 40, lnG, 1000, 0.5)).toBeLessThan(-10);
    // From far away the ring 10 px across is metered instead (cooler: less stopping down).
    expect(diskSpotExposure(disk, 1e6, 0, 1000)).toBeGreaterThan(diskSpotExposure(disk, 40, lnG, 1000) + 3);
  });

  it('in visible light the view stops down with the disc, easing over a few frames; with all its light it keeps the sky’s; back once it is gone', () => {
    for (let i = 0; i < 200; i++) updateDisk(frame({ light: 'all' }));
    expect(diskLnExposure()).toBe(0);
    for (let i = 0; i < 200; i++) updateDisk(frame({ light: 'visible' }));
    expect(diskLnExposure()).toBeCloseTo(diskState.lnSpot, 3);
    for (let i = 0; i < 200; i++) updateDisk(frame({ on: false }));
    expect(diskLnExposure()).toBe(0);
    expect(diskUniforms.uDiskOn.value).toBe(0);
    expect(lensBoxExtra.angle).toBe(0);
  });

  it('the lens box covers its whole image: everything from inside it, its edge’s grazing ray from outside', () => {
    expect(diskImageAngle(1e4, disk.rOutM)).toBe(Math.PI);
    const r = 1e7;
    const a = diskImageAngle(r, disk.rOutM);
    expect(a).toBeCloseTo(disk.rOutM / r, 5);
    updateDisk(frame({ rCam: r, lnG: 0 }));
    expect(lensBoxExtra.angle).toBeCloseTo(1.05 * a, 12);
  });

  it('fades in with its size on the screen: none under 3 px, all over 30 px', () => {
    const rFor = (px: number) => disk.rOutM / (px / 1000);
    updateDisk(frame({ rCam: rFor(2), lnG: 0 }));
    expect(diskState.share).toBe(0);
    expect(diskUniforms.uDiskOn.value).toBe(0);
    updateDisk(frame({ rCam: rFor(10), lnG: 0 }));
    expect(diskState.share).toBeGreaterThan(0.2);
    expect(diskState.share).toBeLessThan(0.8);
    updateDisk(frame({ rCam: rFor(40), lnG: 0 }));
    expect(diskState.share).toBe(1);
  });

  it('turns 1,000 times slower than real, faster by 1/√(1 − 2M/r) on a hovering clock, and stands still when paused', () => {
    updateDisk(frame());
    const t0 = diskState.tau;
    updateDisk(frame({ dt: 0.5 }));
    const dTau = (diskState.tau - t0 + diskState.period) % diskState.period;
    const mS = mKm / C_KM_S;
    expect(dTau).toBeCloseTo(0.5 / 1000 / mS / Math.sqrt(1 - 2 / 40), 6);
    // the inner edge (period 2π·6^1.5 M) goes round in 9.64 s of real time far away
    expect(2 * Math.PI * 6 ** 1.5 * mS * 1000).toBeCloseTo(9.643, 3);
    const t1 = diskState.tau;
    updateDisk(frame({ dt: 0 }));
    expect(diskState.tau).toBe(t1);
    // the two swirl layers: half a period apart, their weights summing to one
    const s = diskUniforms.uDiskSwirl.value;
    expect((s.y - s.x + diskState.period) % diskState.period).toBeCloseTo(diskState.period / 2, 9);
    expect(s.z).toBeGreaterThanOrEqual(0);
    expect(s.z).toBeLessThanOrEqual(1);
  });

  it('the swirl’s noise tiles, is deterministic and is centred', () => {
    const a = diskNoiseData(64);
    const b = diskNoiseData(64);
    expect(a).toEqual(b);
    const mean = a.reduce((s, x) => s + x, 0) / a.length / 255;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });
});
