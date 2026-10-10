import { describe, expect, it } from 'vitest';
import { Body, HelioVector, MakeTime } from 'astronomy-engine';
import { AU_KM, SUN_RADIUS_KM } from '../../physics/constants';
import { readBytes } from '../../test/files';
import { shue1998 } from '../fields/magnetopause';
import { edgeColatitude, ovalEdge, stormStretch } from '../phenomena/aurora';
import { cmeCard } from './cards';
import { frontKm, inFlight, longestFlight, parseCmes, type Cme, type CmeFile } from './cmes';
import { coneShare, dbmAt, dbmTimeTo, element, fitDrag, fitGamma, type Dbm } from './dbm';
import { angleBetween, eqjToWorldArr, stonyhurstToWorld, SUN_POLE } from './geometry';
import { kpAt, kpMax, kpOf, kpText, parseKp } from './kp';
import { dynamicPressure, earthStorm, sheathShare, type EarthStorm } from './storm';

const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as {
  gunzipSync(b: Uint8Array): Uint8Array;
};
const gunzip = (path: string): ArrayBuffer => {
  const b = zlib.gunzipSync(readBytes(path));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const CMES = parseCmes(JSON.parse(new TextDecoder().decode(gunzip('public/data/space-weather/cmes.json.gz'))) as CmeFile);
const KP = parseKp(gunzip('public/data/space-weather/kp.bin.gz'));
const H = 3_600_000;
const D = Math.PI / 180;
const utc = (s: string) => Date.parse(s.endsWith('Z') ? s : `${s}Z`);
const cme = (start: string): Cme => {
  const c = CMES.find((x) => x.startMs === utc(start));
  if (!c) throw new Error(`no CME at ${start}`);
  return c;
};
const earthAt = (ms: number) => {
  const v = HelioVector(Body.Earth, MakeTime(new Date(ms)));
  return eqjToWorldArr(v.x * AU_KM, v.y * AU_KM, v.z * AU_KM);
};

describe('the drag-based model (Vršnak et al. 2013)', () => {
  it('is the exact solution of a = −γ (v − w)|v − w|, faster or slower than the wind', () => {
    for (const m of [
      { r0: 20 * SUN_RADIUS_KM, v0: 1500, gamma: 0.2e-7, w: 400 },
      { r0: 20 * SUN_RADIUS_KM, v0: 300, gamma: 1e-7, w: 500 },
    ] as Dbm[]) {
      // RK4 with one-minute steps over three days.
      let r = m.r0;
      let v = m.v0;
      const a = (vv: number) => -m.gamma * (vv - m.w) * Math.abs(vv - m.w);
      const dt = 60;
      for (let i = 0; i < 3 * 1440; i++) {
        const k1v = a(v);
        const k2v = a(v + 0.5 * dt * k1v);
        const k3v = a(v + 0.5 * dt * k2v);
        const k4v = a(v + dt * k3v);
        r += (dt / 6) * (v + 2 * (v + 0.5 * dt * k1v) + 2 * (v + 0.5 * dt * k2v) + (v + dt * k3v));
        v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
      }
      const p = dbmAt(m, 3 * 86_400);
      expect(p.r / r).toBeCloseTo(1, 6);
      expect(p.v).toBeCloseTo(v, 3);
      // The time to a distance inverts it.
      expect(dbmTimeTo(m, p.r)).toBeCloseTo(3 * 86_400, 0);
    }
  });

  it('gives the flanks’ delay of the model’s documentation (2ω = 60°, γ = 0.2, w = 400 km/s, 1,000 km/s at 20 R☉)', () => {
    // "The flank transit time calculated by the DBM/alternative-i is for ≈ 30 h longer than for the apex, whereas in
    // the case of the DBM/alternative-ii the difference is around 10 h" (oh.geof.unizg.hr/DBM/docs/DBM.pdf, §1.2).
    const apex: Dbm = { r0: 20 * SUN_RADIUS_KM, v0: 1000, gamma: 0.2e-7, w: 400 };
    const w = 30 * D;
    const tApex = dbmTimeTo(apex, AU_KM) / 3600;
    const tII = dbmTimeTo(element(apex, w, w), AU_KM) / 3600;
    const tI = dbmTimeTo(apex, AU_KM / coneShare(w, w)) / 3600;
    expect(tII - tApex).toBeGreaterThan(8);
    expect(tII - tApex).toBeLessThan(13);
    expect(tI - tApex).toBeGreaterThan(25);
    expect(tI - tApex).toBeLessThan(33);
    // The cone's semicircle: the flank starts at (cos ω + √(tan²ω − sin²ω)) / (1 + tan ω) of the apex; 0.707 at 45°.
    expect(coneShare(45 * D, 45 * D)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(coneShare(0, 30 * D)).toBeCloseTo(1, 9);
  });

  it('reproduces Temmer & Nitta 2015’s run for the CME of 23 July 2012 at STEREO-A', () => {
    // Their table 1: 2,300 km/s at 27 R☉ at 04:25 UT, γ = 0.01 × 10⁻⁷ km⁻¹, w = 450 km/s; the model at 206 R☉ at
    // 19:45 UT, 2,210 km/s (the shock was measured there at 20:55, 2,250 km/s).
    const m: Dbm = { r0: 27 * SUN_RADIUS_KM, v0: 2300, gamma: 0.01e-7, w: 450 };
    const at206 = 4 + 25 / 60 + dbmTimeTo(m, 206 * SUN_RADIUS_KM) / 3600;
    expect(Math.abs(at206 - (19 + 45 / 60))).toBeLessThan(0.5);
    expect(dbmAt(m, (at206 - 4 - 25 / 60) * 3600).v / 2210).toBeCloseTo(1, 1);
  });

  it('fits the drag to a measured arrival, the wind too when the drag alone cannot', () => {
    const m: Dbm = { r0: 21.5 * SUN_RADIUS_KM, v0: 1200, gamma: 0.2e-7, w: 400 };
    const g = fitGamma(m, AU_KM, 40 * 3600);
    expect(dbmTimeTo({ ...m, gamma: g }, AU_KM) / 3600).toBeCloseTo(40, 3);
    // 750 km/s arriving in 44 h (850 km/s on average) needs acceleration: a faster wind.
    const slow: Dbm = { ...m, v0: 750 };
    const f = fitDrag(slow, AU_KM, 44 * 3600);
    expect(f.w).toBeGreaterThan(750);
    expect(Math.abs(dbmTimeTo({ ...slow, ...f }, AU_KM) - 44 * 3600)).toBeLessThan(60);
  });
});

describe('where a CME goes', () => {
  it('turns Stonyhurst coordinates into the world frame: 0° towards Earth, west the way Earth moves', () => {
    const t = Date.UTC(2024, 4, 10);
    const e = earthAt(t);
    const later = earthAt(t + 86_400_000);
    // Longitude 0 at the Sun's equator: towards Earth, less Earth's heliographic latitude (B₀, −3.6° in May).
    expect(angleBetween(stonyhurstToWorld(0, 0, e), e) / D).toBeCloseTo(3.6, 0);
    // W90: towards where Earth is going.
    const ahead = [later[0] - e[0], later[1] - e[1], later[2] - e[2]];
    expect(angleBetween(stonyhurstToWorld(0, 90, e), ahead) / D).toBeLessThan(8);
    // N90 is the Sun's pole.
    expect(angleBetween(stonyhurstToWorld(90, 37, e), SUN_POLE)).toBeLessThan(1e-9);
  });
});

describe('the CMEs of the table', () => {
  it('holds the notable ones from 2010 on, and the Carrington event', () => {
    expect(CMES.length).toBeGreaterThan(1000);
    expect(CMES.filter((c) => c.speed >= 1000).length).toBeGreaterThan(600);
    expect(CMES[0].id).toBe('carrington-1859');
    const july = cme('2012-07-23T02:36');
    expect(july.speed).toBe(3435);
    expect(july.arrivalMs).toBeNull();
    expect(july.note?.at).toBe('STEREO-A');
  });

  // The measured shocks at Earth (DONKI), the drawn fronts' arrivals, and how far the typical model (γ = 0.2 × 10⁻⁷,
  // w = 400 km/s) was off, hours (positive: late): docs/data/space-weather.md §3 lists them.
  const CASES: [string, string, string, number][] = [
    ['St Patrick’s Day 2015', '2015-03-15T02:00', '2015-03-17T04:05', 21.3],
    ['May 2024, the first shock', '2024-05-08T05:36', '2024-05-10T16:36', 2.4],
    ['May 2024, the second', '2024-05-09T09:24', '2024-05-11T09:30', 1.7],
    ['May 2024, the third', '2024-05-09T18:23', '2024-05-11T20:30', 14.6],
    ['May 2024, the fourth', '2024-05-10T07:12', '2024-05-12T08:55', 11.8],
    ['October 2024', '2024-10-09T02:12', '2024-10-10T14:46', 8.0],
  ];
  for (const [name, start, shock, typicalOff] of CASES)
    it(`brings ${name} to Earth when its shock was measured`, () => {
      const c = cme(start);
      expect(c.arrivalMs).toBe(utc(shock));
      expect(c.fitted).toBe(true);
      expect(Math.abs(c.drawnArrivalMs! - c.arrivalMs!) / H).toBeLessThan(0.1);
      expect((c.typicalArrivalMs! - c.arrivalMs!) / H).toBeCloseTo(typicalOff, 0);
      // The front facing Earth is at Earth's distance then.
      const e = earthAt(c.drawnArrivalMs!);
      const r = frontKm(c, angleBetween(c.axis, e), c.drawnArrivalMs!);
      expect(r / Math.hypot(...e)).toBeCloseTo(1, 3);
    });

  it('puts the Carrington event’s front at Earth 17.6 hours after the flare', () => {
    const c = CMES[0];
    expect((c.drawnArrivalMs! - utc('1859-09-01T11:18')) / H).toBeCloseTo(17.6, 1);
  });

  it('finds those in flight at a date', () => {
    const out: Cme[] = [];
    inFlight(CMES, utc('2024-05-09T12:00'), longestFlight(CMES), out);
    const ids = out.map((c) => c.id);
    expect(ids).toContain('2024-05-08T05:36:00-CME-001');
    expect(ids).toContain('2024-05-09T09:24:00-CME-001');
    expect(ids).not.toContain('2024-05-10T07:12:00-CME-001');
    inFlight(CMES, utc('2019-07-01T00:00'), longestFlight(CMES), out);
    expect(out.length).toBe(0);
  });

  it('writes its card from the measurements', () => {
    const k = cmeCard(cme('2024-10-09T02:12'));
    expect(k.title).toBe('CME of 9 October 2024, 02:12 UT');
    expect(k.line).toContain('1,509 km/s, 90° wide');
    expect(k.line).toContain('10 October, 14:46 UT');
    expect(k.line).toContain('Kp reached 9−');
    expect(k.link).toBe('https://ccmc.gsfc.nasa.gov/DONKI/view/CME/34233/-1'.replace('34233', String(cme('2024-10-09T02:12').link)));
  });
});

describe('the hit at Earth', () => {
  it('estimates the sheath’s pressure from its speed and a typical density', () => {
    // 15 protons per cm³ at 600 km/s: 9.0 nPa.
    expect(dynamicPressure(15, 600)).toBeCloseTo(9.03, 2);
    // The quiet wind of sim/fields/magnetopause.ts: 7 per cm³ at 400 km/s, about 2 nPa.
    expect(dynamicPressure(7, 400)).toBeCloseTo(1.87, 2);
    expect(sheathShare(-1)).toBe(0);
    expect(sheathShare(5)).toBe(1);
    expect(sheathShare(30)).toBe(0);
  });

  it('puts the magnetopause where Shue et al. 1998 do for that pressure and B_z', () => {
    // r₀ = (10.22 + 1.29 tanh(0.184 (B_z + 8.14))) D_p^(−1/6.6).
    expect(shue1998(2, 0).r0).toBeCloseTo(10.25, 2);
    expect(shue1998(9.03, -8).r0).toBeCloseTo(7.35, 2);
    // A strong southward field erodes it further: B_z = −20 nT at 20 nPa.
    expect(shue1998(20, -20).r0).toBeCloseTo(5.69, 2);
    expect(shue1998(2, 0).alpha).toBeCloseTo(0.5896, 4);
  });

  it('squeezes Earth’s magnetosphere when the first front of May 2024 arrives, and lets it go again', () => {
    const out = {} as EarthStorm;
    const flying: Cme[] = [];
    const at = (iso: string) => earthStorm(inFlight(CMES, utc(iso), longestFlight(CMES), flying), utc(iso), out);
    expect(at('2024-05-10T15:00').r0).toBeCloseTo(10.25, 2);
    const hit = at('2024-05-10T19:00');
    expect(hit.cme?.id).toBe('2024-05-08T05:36:00-CME-001');
    expect(hit.pressure).toBeGreaterThan(7);
    expect(hit.r0).toBeLessThan(7.6);
    expect(hit.r0).toBeGreaterThan(6.5);
  });
});

describe('the Kp index (GFZ)', () => {
  it('reads the measured three-hour values', () => {
    expect(KP.startMs).toBe(Date.UTC(1932, 0, 1));
    expect(kpOf(KP, utc('2024-05-11T01:00'))).toBe(9);
    expect(kpOf(KP, utc('2024-05-10T13:30'))).toBeCloseTo(11 / 3, 9);
    expect(kpOf(KP, utc('1989-03-13T22:00'))).toBe(9);
    expect(kpOf(KP, utc('2003-10-29T07:00'))).toBe(9);
    expect(kpMax(KP, utc('2015-03-17T00:00'), utc('2015-03-18T00:00'))).toBeCloseTo(23 / 3, 9);
    expect(kpOf(KP, utc('1931-12-31T23:00'))).toBeNull();
    expect(kpOf(KP, utc('2030-01-01T00:00'))).toBeNull();
  });

  it('eases from one value to the next across a boundary', () => {
    // 15–18 UT on 10 May 2024: 7.67; 18–21: 8.67. At 18:00 exactly, halfway.
    expect(kpAt(KP, utc('2024-05-10T18:00'))).toBeCloseTo(8.17, 2);
    expect(kpAt(KP, utc('2024-05-10T16:30'))).toBeCloseTo(23 / 3, 6);
    expect(kpText(23 / 3)).toBe('8−');
    expect(kpText(9)).toBe('9');
    expect(kpText(13 / 3)).toBe('4+');
  });
});

describe('the ovals in storms', () => {
  it('are Starkov’s to Kp 6 and reach May 2024’s edge at Kp 9', () => {
    expect(stormStretch(3)).toBe(1);
    expect(ovalEdge('equatorward', 5, 0)).toBe(edgeColatitude('equatorward', 5, 0));
    expect(90 - ovalEdge('equatorward', 9, 0)).toBeCloseTo(35.5, 6);
    // Kp 7: about 52° at midnight.
    expect(90 - ovalEdge('equatorward', 7, 0)).toBeCloseTo(52.3, 0);
  });
});
