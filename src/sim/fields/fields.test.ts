/**
 * The magnetic fields (docs/data/fields.md §7): the spherical harmonics and the potential field to a source surface,
 * each model against its published check values, the tracer, the magnetopauses, the Sun's map and the line sets.
 */
import { describe, expect, it } from 'vitest';
import { Body, HelioVector } from 'astronomy-engine';
import { Quaternion, Vector3 } from 'three';
import { dipole, dipoleOffset, fieldCartesian, fieldSpherical, FieldWork, fromRows, harmonics, schmidt, shCount, shIndex, type Harmonics } from './harmonics';
import { earthCoefficients } from './earth';
import { FIELD_MODELS, fieldModel, IAU_TO_BODY, mul3, ULS_TO_IAU } from './models';
import { arridge2006, joyStandoff, MagnetopauseTest, scaledStandoff, shue1998, standoff, windPressure } from './magnetopause';
import { traceLine } from './trace';
import { CLOSED, OPEN, parkerSpiral, planetLines, SHEET, SOURCE_SURFACE, SPIRAL, SPIRAL_END_RSUN, SPIRAL_RAD_PER_RSUN, sunLines } from './lines';
import { parseSunRotations, rotationAt, rotationHarmonics } from './sun';
import { FIELD_FACTS, fieldLine, fieldSource, SUN_MAPS, sunMapHeld } from '.';
import { IGRF_DIPOLE, IGRF_SV_2025 } from '../phenomena/aurora';
import { engineRotation } from '../bodies/providers/engine';
import { eqjToWorld } from '../frames';
import { astroTimeAt, msFromCivil } from '../../lib/time';
import { readBytes } from '../../test/files';

const D = Math.PI / 180;
const out = new Float64Array(3);

/** B (r, θ, φ) of a model at r (reference radii), colatitude and east longitude in degrees. */
function rtp(c: Harmonics, r: number, colatDeg: number, lonDeg: number): number[] {
  fieldSpherical(c, { kind: 'internal' }, r, Math.cos(colatDeg * D), Math.sin(colatDeg * D), lonDeg * D, new FieldWork(c.degree), out);
  return [...out];
}

describe('Schmidt semi-normalised harmonics', () => {
  it('match the closed forms and their derivatives', () => {
    const t = 0.7;
    const P = new Float64Array(shCount(4));
    const dP = new Float64Array(shCount(4));
    schmidt(4, Math.cos(t), Math.sin(t), P, dP);
    const c = Math.cos(t);
    const s = Math.sin(t);
    expect(P[shIndex(2, 0)]).toBeCloseTo((3 * c * c - 1) / 2, 14);
    expect(P[shIndex(2, 1)]).toBeCloseTo(Math.sqrt(3) * c * s, 14);
    expect(P[shIndex(2, 2)]).toBeCloseTo((Math.sqrt(3) / 2) * s * s, 14);
    expect(P[shIndex(3, 3)]).toBeCloseTo(Math.sqrt(5 / 8) * s ** 3, 14);
    expect(P[shIndex(4, 0)]).toBeCloseTo((35 * c ** 4 - 30 * c * c + 3) / 8, 14);
    // dP/dθ against a central difference.
    const h = 1e-6;
    const P1 = new Float64Array(shCount(4));
    const P2 = new Float64Array(shCount(4));
    schmidt(4, Math.cos(t + h), Math.sin(t + h), P1, dP);
    schmidt(4, Math.cos(t - h), Math.sin(t - h), P2, dP);
    schmidt(4, Math.cos(t), Math.sin(t), P, dP);
    for (let k = 0; k < shCount(4); k++) expect(dP[k]).toBeCloseTo((P1[k] - P2[k]) / (2 * h), 7);
  });

  it('are normalised so that the mean of (P_n^m cos mφ)² over the sphere is 1/(2n+1)', () => {
    const N = 6;
    const P = new Float64Array(shCount(N));
    const dP = new Float64Array(shCount(N));
    const sums = new Float64Array(shCount(N));
    const n = 400;
    for (let j = 0; j < n; j++) {
      const z = -1 + (2 * (j + 0.5)) / n;
      schmidt(N, z, Math.sqrt(1 - z * z), P, dP);
      for (let k = 0; k < sums.length; k++) sums[k] += (P[k] * P[k]) / n;
    }
    for (let nn = 1; nn <= N; nn++)
      for (let m = 0; m <= nn; m++) expect(sums[shIndex(nn, m)] * (m === 0 ? 1 : 0.5)).toBeCloseTo(1 / (2 * nn + 1), 4);
  });
});

describe('Jupiter: JRM33 to degree 13', () => {
  const c = fieldModel('jupiter')!.coefficients(2026);

  it('gives the community code’s published values (Wilson et al., PSH README, nT)', () => {
    const cases: [number, number, number, number[]][] = [
      [10, 90, 38, [-79.8398262, 399.48279169, -53.48232536]],
      [8, 90, 0, [-250.03964154, 779.36280353, -48.0067748]],
      [9, 90, 90, [38.30789003, 551.82684557, -92.08482301]],
      [10, 90, 180, [152.37953988, 421.11209401, 17.04711562]],
      [11, 90, 270, [-42.38940341, 313.65069342, 55.78819978]],
    ];
    for (const [r, th, ph, want] of cases) {
      const got = rtp(c, r, th, ph);
      for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(want[i], 5);
    }
  });

  it('has a dipole of 4.177 G tilted 10.25° (Connerney et al. 2022)', () => {
    const d = dipole(c);
    expect(d.b0 / 1e5).toBeCloseTo(4.177, 3);
    expect(d.tiltDeg).toBeCloseTo(10.25, 2);
  });
});

// ─── Earth ────────────────────────────────────────────────────────────────────────────

/** Geodetic (WGS84) latitude, longitude and height → geocentric r (km), colatitude and the rotation to geodetic X, Z. */
function geodetic(latDeg: number, altKm: number): { r: number; colat: number; cd: number; sd: number } {
  const a = 6378.137;
  const b = a * (1 - 1 / 298.257223563);
  const a2 = a * a;
  const b2 = b * b;
  const sl = Math.sin(latDeg * D);
  const cl = Math.cos(latDeg * D);
  const one = a2 * cl * cl;
  const two = b2 * sl * sl;
  const three = one + two;
  const rho = Math.sqrt(three);
  const r = Math.sqrt(altKm * (altKm + 2 * rho) + (a2 * one + b2 * two) / three);
  const cd = (altKm + rho) / r;
  const sd = ((a2 - b2) / rho) * ((cl * sl) / r);
  const slat = sl * cd - cl * sd;
  return { r, colat: 90 - Math.asin(slat) / D, cd, sd };
}

/** North, east and down components (nT) at a geodetic place, as the BGS and NOAA calculators give them. */
function xyz(year: number, latDeg: number, lonDeg: number, altKm: number): number[] {
  const g = geodetic(latDeg, altKm);
  const [br, bt, bp] = rtp(earthCoefficients(year), g.r / 6371.2, g.colat, lonDeg);
  const X = -bt;
  const Z = -br;
  return [X * g.cd + Z * g.sd, bp, Z * g.cd - X * g.sd];
}

const decimalYear = (y: number, m: number, d: number) => {
  const t = msFromCivil(y, m, d);
  const t0 = msFromCivil(y, 1, 1);
  const t1 = msFromCivil(y + 1, 1, 1);
  return y + (t - t0) / (t1 - t0);
};

describe('Earth: IGRF-14', () => {
  it('reads the dipole from the aurora’s table and the rest from the coefficient file', () => {
    const c = earthCoefficients(2020);
    const row = IGRF_DIPOLE.find((r) => r[0] === 2020)!;
    expect([c.g[1], c.g[2], c.h[2]]).toEqual([row[1], row[2], row[3]]);
    expect(c.g[shIndex(2, 0)]).toBe(-2499.78);
    expect(c.h[shIndex(13, 13)]).toBe(-0.6);
    // Halfway between epochs, and the secular variation after 2025 (g₂⁰: −2556.2 in 2025, −11.2 nT a year).
    expect(earthCoefficients(2022.5).g[shIndex(2, 0)]).toBeCloseTo((-2499.78 - 2556.2) / 2, 9);
    expect(earthCoefficients(2027).g[shIndex(2, 0)]).toBeCloseTo(-2556.2 - 2 * 11.2, 9);
    expect(earthCoefficients(2027).g[1]).toBeCloseTo(-29350 + 2 * IGRF_SV_2025[0], 9);
    // Held beyond 1900–2030.
    expect(earthCoefficients(1600).g[shIndex(2, 0)]).toBe(-677);
    expect(earthCoefficients(2100).g[shIndex(2, 0)]).toBeCloseTo(-2556.2 - 5 * 11.2, 9);
  });

  it('matches the British Geological Survey’s IGRF-14 calculator to its rounding (X, Y, Z, nT)', () => {
    // geomag.bgs.ac.uk/web_service/GMModels/igrf/14, retrieved 9 October 2026: latitude, longitude, height (km), date.
    const cases: [number, number, number, [number, number, number], number[]][] = [
      [51.5, -0.1, 0, [1965, 1, 1], [18641, -2466, 43623]],
      [-33.9, 151.2, 0, [2000, 1, 1], [24176, 5399, -51887]],
      [64.8, -147.7, 0, [2015, 7, 2], [11915, 4010, 55393]],
      [-75, 120, 0, [2010, 1, 1], [-7454, -7472, -61587]],
      [35, 139, 100, [2027, 7, 2], [29021, -3810, 33474]],
      [0, -40, 0, [2022, 1, 1], [24899, -8945, -5580]],
    ];
    for (const [lat, lon, alt, [y, m, d], want] of cases) {
      const got = xyz(decimalYear(y, m, d), lat, lon, alt);
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - want[i]), `${lat} ${lon} ${y} ${i}`).toBeLessThan(1.5);
    }
  });

  it('puts the dip poles where NOAA NCEI does (2000 and 2015, within 0.2°)', () => {
    // NCEI's pole files (ngdc.noaa.gov/geomag/data/poles): geodetic latitude, east longitude.
    const want: [number, number, number][] = [
      [2000, 80.972, 250.36],
      [2000, -64.661, 138.303],
      [2015, 86.305, 199.659],
      [2015, -64.279, 136.597],
    ];
    for (const [year, lat0, lon0] of want) {
      // Where the horizontal field vanishes on the WGS84 surface: a coarse search, then finer.
      let best = { h: Infinity, lat: lat0, lon: lon0 };
      for (const step of [0.5, 0.1, 0.02]) {
        const c = { ...best };
        for (let i = -6; i <= 6; i++)
          for (let j = -6; j <= 6; j++) {
            const lat = c.lat + i * step;
            const lon = c.lon + (j * step) / Math.cos(lat * D);
            const [x, y] = xyz(year, lat, lon, 0);
            const h = Math.hypot(x, y);
            if (h < best.h) best = { h, lat, lon };
          }
      }
      const cos = Math.sin(best.lat * D) * Math.sin(lat0 * D) + Math.cos(best.lat * D) * Math.cos(lat0 * D) * Math.cos((best.lon - lon0) * D);
      expect(Math.acos(Math.min(1, cos)) / D, `${year} ${lat0}`).toBeLessThan(0.2);
    }
  });
});

describe('the other bodies’ models', () => {
  it('place Mercury’s dipole 479 km north of the centre (Anderson et al. 2012)', () => {
    const m = fieldModel('mercury')!;
    const off = dipoleOffset(m.coefficients(2026));
    expect(off[2] * m.radiusKm).toBeCloseTo(479, -1);
    expect(dipole(m.coefficients(2026)).b0).toBe(190);
  });

  it('keep Saturn’s field axisymmetric (Cassini 11+: a tilt under 0.007°)', () => {
    const c = fieldModel('saturn')!.coefficients(2026);
    expect(dipole(c).tiltDeg).toBe(0);
    expect(dipole(c).b0).toBe(21141);
    // The field at the equator and the poles, nT: the zonal terms make the north stronger.
    expect(rtp(c, 1, 0, 0)[0]).toBeGreaterThan(-rtp(c, 1, 180, 0)[0]);
  });

  it('tilt Neptune’s dipole 47° and set it about half a radius off centre (O8; Ness et al. 1989: 47°, 0.55 R_N)', () => {
    const c = fieldModel('neptune')!.coefficients(2026);
    expect(dipole(c).tiltDeg).toBeCloseTo(46.9, 1);
    expect(Math.hypot(...dipoleOffset(c))).toBeGreaterThan(0.45);
    expect(Math.hypot(...dipoleOffset(c))).toBeLessThan(0.6);
  });

  it('have Uranus’s offset dipole meet the surface near the poles Lamy et al. 2017 give in ULS (+15.2°, −44.2°)', () => {
    const c = fieldModel('uranus')!.coefficients(2026);
    const d = dipole(c);
    const o = dipoleOffset(c);
    // The axis through the eccentric dipole: o + t m̂, |·| = 1.
    const om = o[0] * d.moment[0] + o[1] * d.moment[1] + o[2] * d.moment[2];
    const oo = o[0] ** 2 + o[1] ** 2 + o[2] ** 2;
    const lats = [1, -1].map((s) => {
      const t = -om + s * Math.sqrt(om * om - oo + 1);
      return Math.asin(o[2] + t * d.moment[2]) / D;
    });
    expect(Math.abs(lats[0] - 15.2)).toBeLessThan(3);
    expect(Math.abs(lats[1] + 44.2)).toBeLessThan(3);
    expect(d.tiltDeg).toBeCloseTo(59.85, 1);
  });

  it('turn Uranus’s ULS into the IAU frame as NAIF’s kernel does: the spin axis to the IAU south pole, ULS 302° W at IAU 168.46°', () => {
    const m = ULS_TO_IAU;
    expect([m[2], m[5], m[8]]).toEqual([0, 0, -1]);
    const phi = (58 * Math.PI) / 180; // 302° W = 58° E in the right-handed ULS
    const x = m[0] * Math.cos(phi) + m[1] * Math.sin(phi);
    const y = m[3] * Math.cos(phi) + m[4] * Math.sin(phi);
    expect(((Math.atan2(y, x) / D + 360) % 360)).toBeCloseTo(168.46, 9);
    // And into the app's body frame, (x, y, z) → (x, z, −y): ULS z is the body's −y.
    const b = mul3(IAU_TO_BODY, ULS_TO_IAU);
    expect(b[2]).toBeCloseTo(0, 15);
    expect(b[5]).toBe(-1);
    expect(b[8]).toBeCloseTo(0, 15);
  });

  it('give Ganymede a 719 nT dipole 176° from its spin axis, its south end towards the trailing side', () => {
    const d = dipole(fieldModel('ganymede')!.coefficients(2026));
    expect(d.b0).toBeCloseTo(719, 9);
    expect(d.tiltDeg).toBeCloseTo(4, 9);
    expect(d.moment[2]).toBeLessThan(0);
    expect(d.moment[1]).toBeGreaterThan(0); // +y: 90° E, the trailing hemisphere
  });

  it('agree with the facts on the cards', () => {
    for (const m of FIELD_MODELS) {
      const f = FIELD_FACTS[m.id];
      const c = m.coefficients(2025);
      const d = dipole(c);
      expect(f.b0nT, m.id).toBeCloseTo(d.b0, -1);
      expect(f.tiltDeg, m.id).toBeCloseTo(d.tiltDeg, 1);
      if (f.offsetKm !== null) expect(Math.abs(f.offsetKm - Math.hypot(...dipoleOffset(c)) * m.radiusKm), m.id).toBeLessThan(10);
      expect(fieldLine(m.id, 2025), m.id).toContain(f.model);
    }
    expect(fieldLine('jupiter', 2026)).toBe('Magnetic field: 4.18 G at the equator, the dipole tilted 10° from the spin axis and 7,810 km off centre (JRM33, Connerney et al. 2022).');
    expect(fieldLine('earth', 2025)).toContain('0.297 G at the equator, the dipole tilted 9.2°');
    expect(fieldLine('venus', 2026)).toBeNull();
  });
});

describe('the potential field to a source surface', () => {
  const c = harmonics(3);
  c.g[shIndex(1, 0)] = 1.2;
  c.g[shIndex(1, 1)] = -0.4;
  c.h[shIndex(1, 1)] = 0.7;
  c.g[shIndex(2, 1)] = 0.5;
  c.h[shIndex(3, 2)] = -0.3;
  const kind = { kind: 'pfss', sourceSurface: SOURCE_SURFACE } as const;
  const w = new FieldWork(3);

  it('has the photosphere’s B_r as its coefficients say, and is radial on the source surface', () => {
    const P = new Float64Array(shCount(3));
    const dP = new Float64Array(shCount(3));
    const th = 1.1;
    const ph = 2.3;
    schmidt(3, Math.cos(th), Math.sin(th), P, dP);
    let br = 0;
    for (let n = 1; n <= 3; n++) for (let m = 0; m <= n; m++) br += P[shIndex(n, m)] * (c.g[shIndex(n, m)] * Math.cos(m * ph) + c.h[shIndex(n, m)] * Math.sin(m * ph));
    fieldSpherical(c, kind, 1, Math.cos(th), Math.sin(th), ph, w, out);
    expect(out[0]).toBeCloseTo(br, 12);
    fieldSpherical(c, kind, SOURCE_SURFACE, Math.cos(th), Math.sin(th), ph, w, out);
    expect(Math.abs(out[1]) + Math.abs(out[2])).toBeLessThan(1e-12);
    expect(Math.abs(out[0])).toBeGreaterThan(1e-3);
  });

  it('has no divergence and no curl between the two surfaces', () => {
    const h = 1e-5;
    const B = (x: number, y: number, z: number) => {
      const o = new Float64Array(3);
      fieldCartesian(c, kind, x, y, z, w, o);
      return o;
    };
    for (const p of [
      [1.3, 0.4, -0.5],
      [-0.2, 1.7, 0.9],
    ]) {
      const d = [0, 1, 2].map((i) => {
        const a = [...p];
        const b2 = [...p];
        a[i] += h;
        b2[i] -= h;
        const fa = B(a[0], a[1], a[2]);
        const fb = B(b2[0], b2[1], b2[2]);
        return [0, 1, 2].map((k) => (fa[k] - fb[k]) / (2 * h));
      });
      const scale = Math.hypot(...B(p[0], p[1], p[2]));
      expect(Math.abs(d[0][0] + d[1][1] + d[2][2]) / scale).toBeLessThan(1e-6);
      expect(Math.abs(d[1][2] - d[2][1]) / scale).toBeLessThan(1e-6);
      expect(Math.abs(d[2][0] - d[0][2]) / scale).toBeLessThan(1e-6);
      expect(Math.abs(d[0][1] - d[1][0]) / scale).toBeLessThan(1e-6);
    }
  });
});

describe('tracing', () => {
  it('follows a dipole’s line r = L cos²λ from one foot to the other', () => {
    const c = fromRows([[1, 0, -30_000, 0]]);
    const w = new FieldWork(1);
    const f = (x: number, y: number, z: number, o: Float64Array) => fieldCartesian(c, { kind: 'internal' }, x, y, z, w, o);
    const lat = 60 * D;
    const L = 1 / Math.cos(lat) ** 2;
    const start = [Math.cos(lat) * 1.0001, 0, Math.sin(lat) * 1.0001];
    const pts: number[] = [];
    f(start[0], start[1], start[2], out);
    const sign = out[0] * start[0] + out[2] * start[2] > 0 ? 1 : -1;
    const res = traceLine(f, start, sign, { polarRatio: 1, rMax: 100, sMax: 100, maxSteps: 5000, tol: 1e-6 }, pts);
    expect(res.end).toBe('surface');
    let worst = 0;
    // (The last point is where the last step's chord meets the surface, a sagitta off the line.)
    for (let i = 0; i < pts.length - 3; i += 3) {
      const r = Math.hypot(pts[i], pts[i + 1], pts[i + 2]);
      const cl2 = (pts[i] ** 2 + pts[i + 1] ** 2) / (r * r);
      worst = Math.max(worst, Math.abs(r / (L * cl2) - 1));
    }
    expect(worst).toBeLessThan(1e-3);
    const n = pts.length;
    expect(Math.asin(pts[n - 1]) / D).toBeCloseTo(-60, 1);
  });
});

describe('magnetopauses', () => {
  it('stand where the papers put them for a typical wind', () => {
    // Shue et al. 1998 at 2 nPa and B_z = 0.
    expect(shue1998(2).r0).toBeCloseTo(10.25, 2);
    expect(shue1998(2).alpha).toBeCloseTo(0.5897, 3);
    // Joy et al. 2002's two modes, 63 and 92 R_J.
    expect(joyStandoff(0.306)).toBeCloseTo(63, 0);
    expect(joyStandoff(0.039)).toBeCloseTo(92, 0);
    // Arridge et al. 2006 at Saturn's mean 0.02 nPa: flaring 0.74 (Achilleos et al. 2008).
    expect(arridge2006(0.02).alpha).toBeCloseTo(0.74, 2);
    expect(scaledStandoff(29_734, 2)).toBeCloseTo(shue1998(2).r0, 9);
    expect(windPressure(5.2)).toBeCloseTo(0.074, 3);
    expect(standoff(fieldModel('jupiter')!.magnetopause)).toBeGreaterThan(75);
    expect(standoff(fieldModel('jupiter')!.magnetopause)).toBeLessThan(90);
  });

  it('tell inside from outside', () => {
    const t = new MagnetopauseTest({ kind: 'shue', r0: 10, alpha: 0.5 }, 30);
    expect(t.inside(9.9, 0, 0)).toBe(true);
    expect(t.inside(10.1, 0, 0)).toBe(false);
    expect(t.inside(0, 0, 10 * Math.SQRT2 - 0.1)).toBe(true);
    expect(t.inside(-31, 0, 0)).toBe(false);
    const j = new MagnetopauseTest({ kind: 'joy', pressure: 0.039 }, 300);
    expect(j.inside(91, 0, 0)).toBe(true);
    expect(j.inside(93, 0, 0)).toBe(false);
  });
});

// ─── The Sun ──────────────────────────────────────────────────────────────────────────

const sunFile = () => {
  const b = readBytes('public/data/fields/sun-hmi-pfss.bin');
  return parseSunRotations(b.buffer as ArrayBuffer);
};

describe('the Sun', () => {
  const s = sunFile();

  it('ships every Carrington rotation HMI has mapped, from 2097 (May 2010) to 2315', () => {
    expect(s.degree).toBe(15);
    expect(s.rotation[0]).toBe(2097);
    expect(s.rotation[s.rotation.length - 1]).toBe(2315);
    for (let k = 1; k < s.rotation.length; k++) {
      expect(s.rotation[k]).toBe(s.rotation[k - 1] + 1);
      const days = (s.startMs[k] - s.startMs[k - 1]) / 86_400_000;
      expect(days).toBeGreaterThan(27.1);
      expect(days).toBeLessThan(27.5);
    }
    // CR 2300 began on 16 July 2025 at 17:08 TAI; its dipole as the build log gives it.
    const k = s.rotation.indexOf(2300);
    expect(s.startMs[k]).toBe(Date.UTC(2025, 6, 16, 17, 8, 58) - 37_000);
    const d = dipole(rotationHarmonics(s, k));
    expect(d.b0).toBeCloseTo(2.373, 2);
    expect(d.tiltDeg).toBeCloseTo(78.4, 0);
  });

  it('is what the cards and scenes say of it (SUN_MAPS)', () => {
    expect([s.rotation[0], s.startMs[0]]).toEqual([SUN_MAPS.first, SUN_MAPS.firstMs]);
    expect([s.rotation[s.rotation.length - 1], s.startMs[s.rotation.length - 1]]).toEqual([SUN_MAPS.last, SUN_MAPS.lastMs]);
    for (const ms of [Date.UTC(2000, 0, 1), Date.UTC(2015, 5, 1), Date.UTC(2026, 8, 1), Date.UTC(2026, 9, 9)]) {
      const at = rotationAt(s, ms);
      expect(sunMapHeld(ms)).toBe(at.held);
    }
    expect(fieldLine('sun', 2026.77)).toContain('latest map in the app (Carrington rotation 2315');
    expect(fieldLine('sun', 2020)).toContain('for the Carrington rotation of the date');
    expect(fieldSource('jupiter')?.url).toBe('https://doi.org/10.1029/2021JE007055');
  });

  it('chooses the rotation of the date, and holds the first and last beyond them', () => {
    const k = s.rotation.indexOf(2300);
    expect(rotationAt(s, s.startMs[k] + 5 * 86_400_000)).toEqual({ index: k, held: null });
    expect(rotationAt(s, s.startMs[k])).toEqual({ index: k, held: null });
    expect(rotationAt(s, Date.UTC(1990, 0, 1))).toEqual({ index: 0, held: 'before' });
    expect(rotationAt(s, Date.UTC(2040, 0, 1))).toEqual({ index: s.rotation.length - 1, held: 'after' });
  });

  it('turns with the app’s Sun: at a rotation’s start, Carrington longitude 0 faces Earth (within 1°)', () => {
    const rot = engineRotation(Body.Sun);
    for (const cr of [2150, 2300]) {
      const ms = s.startMs[s.rotation.indexOf(cr)];
      const time = astroTimeAt(ms);
      const q = rot.orientationAt(time, new Quaternion(), null);
      const e = HelioVector(Body.Earth, time);
      const toEarth = eqjToWorld(e.x, e.y, e.z, new Vector3()).normalize().applyQuaternion(q.invert());
      // Body frame: +x the prime meridian, −z 90° E.
      const lon = ((Math.atan2(-toEarth.z, toEarth.x) / D) % 360 + 540) % 360 - 180;
      expect(Math.abs(lon), `CR ${cr}`).toBeLessThan(1);
    }
  });

  it('draws loops, open lines that go on as Parker spirals to 3 au, and the current sheet', () => {
    const set = sunLines(rotationHarmonics(s, s.rotation.indexOf(2300)));
    const kinds = [CLOSED, OPEN, SPIRAL, SHEET].map((k) => [...set.kind].filter((v) => v === k).length);
    expect(kinds[0]).toBeGreaterThan(80);
    expect(kinds[1]).toBe(0);
    expect(kinds[2]).toBeGreaterThan(10);
    expect(kinds[3]).toBeGreaterThan(10);
    for (let l = 0; l < set.count; l++) {
      const i = set.starts[l + 1] - 1;
      const r = Math.hypot(set.positions[3 * i], set.positions[3 * i + 1], set.positions[3 * i + 2]);
      if (set.kind[l] === CLOSED) expect(r).toBeCloseTo(1, 3);
      else expect(r).toBeCloseTo(SPIRAL_END_RSUN, 0);
    }
  });

  it('winds the spiral 47° from radial at 1 au for a 400 km/s wind (tan ψ = Ω r / v)', () => {
    const pts: number[] = [];
    parkerSpiral(0, 1, 0, 400, pts);
    const r1 = 149_597_870.7 / 695_700;
    // Two neighbouring points about 1 au.
    let i = 0;
    while (Math.hypot(pts[3 * i], pts[3 * i + 1]) < r1) i++;
    const a = [pts[3 * i - 3], pts[3 * i - 2]];
    const b2 = [pts[3 * i], pts[3 * i + 1]];
    const rad = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2];
    const tan = [b2[0] - a[0], b2[1] - a[1]];
    const cos = (rad[0] * tan[0] + rad[1] * tan[1]) / (Math.hypot(...rad) * Math.hypot(...tan));
    expect(Math.acos(cos) / D).toBeCloseTo(Math.atan(SPIRAL_RAD_PER_RSUN * r1) / D, 0);
    expect(Math.atan(SPIRAL_RAD_PER_RSUN * r1) / D).toBeCloseTo(47, 0);
    // Trailing: longitude falls outwards in the Sun's turning frame.
    expect(Math.atan2(b2[1], b2[0])).toBeLessThan(Math.atan2(a[1], a[0]));
  });
});

describe('a planet’s line set', () => {
  it('starts every line on the surface, and ends a closed one there too', () => {
    const m = fieldModel('earth')!;
    const set = planetLines(m, 2026);
    expect(set.count).toBeGreaterThan(80);
    const q = m.polarRatio;
    for (let l = 0; l < set.count; l++) {
      for (const i of [set.starts[l], set.starts[l + 1] - 1]) {
        if (i !== set.starts[l] && set.kind[l] !== CLOSED) continue;
        // Body frame: y is the polar axis.
        const [x, y, z] = [set.positions[3 * i], set.positions[3 * i + 1], set.positions[3 * i + 2]];
        expect(Math.sqrt(x * x + z * z + (y * y) / (q * q))).toBeCloseTo(1, 2);
      }
      expect(set.phase[set.starts[l]]).toBe(0);
    }
  });
});
