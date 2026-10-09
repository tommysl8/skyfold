import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '../../test/files';
import {
  decodeNames,
  decodeOrbitFile,
  encodeNames,
  encodeOrbitFile,
  formatLabel,
  locateNumber,
  NO_SECTION,
  parseLabels,
  quantH,
  unquantH,
  type ConicColumns,
  type EllipseColumns,
  type OrbitFile,
} from './format';
import type { AsteroidIndex } from './load';

const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as {
  gunzipSync(b: Uint8Array): Uint8Array;
};
const inflate = (path: string): ArrayBuffer => {
  const b = zlib.gunzipSync(readBytes(path));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

function sample(): OrbitFile {
  const n = 5;
  const ell: EllipseColumns = {
    a: Float32Array.from([2.2, 2.7, 3.1, 1.9, 5.2]),
    e: Uint16Array.from([0, 1000, 65535, 32768, 7]),
    i: Uint16Array.from([1, 2, 3, 4, 5]),
    node: Uint16Array.from([65535, 0, 100, 200, 300]),
    peri: Uint16Array.from([9, 8, 7, 6, 5]),
    M: Uint16Array.from([12345, 0, 65534, 1, 2]),
    H: Uint8Array.from([0, 10, 100, 254, 3]),
  };
  const con: ConicColumns = {
    q: Float32Array.from([0.3, 1.2, 40]),
    e: Float32Array.from([0.9992, 1, 1.0001]),
    tp: Float32Array.from([-12345.5, 0, 77.25]),
    i: Uint16Array.from([1, 60000, 3]),
    node: Uint16Array.from([4, 5, 6]),
    peri: Uint16Array.from([7, 8, 9]),
    M1: Uint8Array.from([60, 255, 0]),
    K1: Uint8Array.from([30, 255, 40]),
  };
  return {
    refEpochJd: 2461200.5,
    sections: [
      { group: 1, shape: 0, frame: 0, count: n, numbered: 3, hMin: 10, hMax: 15.5, rMin: 1.5, rMax: 5.6, id: 7, cols: ell },
      { group: 6, shape: 1, frame: 1, count: 3, numbered: 0, hMin: 4, hMax: 99, rMin: 0.3, rMax: Infinity, id: 8, cols: con },
    ],
  };
}

describe('small-body files', () => {
  it('round-trip: every column, header and section comes back exactly', () => {
    const f = sample();
    const bytes = encodeOrbitFile(f);
    const back = decodeOrbitFile(bytes.buffer.slice(0) as ArrayBuffer);
    expect(back.refEpochJd).toBe(f.refEpochJd);
    expect(back.sections.length).toBe(2);
    for (let k = 0; k < 2; k++) {
      const a = f.sections[k];
      const b = back.sections[k];
      const { cols: ca, ...ha } = a;
      const { cols: cb, ...hb } = b;
      expect(hb).toEqual({ sample: false, ...ha, hMin: Math.fround(ha.hMin), hMax: Math.fround(ha.hMax), rMin: Math.fround(ha.rMin), rMax: Math.fround(ha.rMax) });
      for (const key of Object.keys(ca)) expect(Array.from((cb as unknown as Record<string, ArrayLike<number>>)[key]), key).toEqual(Array.from((ca as unknown as Record<string, ArrayLike<number>>)[key]));
    }
  });

  it('keeps H to a 254th of the section’s range', () => {
    for (const H of [10, 12.34, 15.5]) expect(Math.abs(unquantH(quantH(H, 10, 15.5), 10, 15.5) - H)).toBeLessThanOrEqual(5.5 / 254 / 2 + 1e-9);
  });

  it('round-trip: labels and names', () => {
    const labels = [
      { number: 433, name: 'Eros', designation: 'A898 PA', diameterKm: 16.84, albedo: 0.25, orbitClass: 'AMO' },
      { number: 0, name: null, designation: '2013 NE69', diameterKm: null, albedo: null, orbitClass: 'MBA' },
      { number: 0, name: null, designation: 'C/2020 F3 (NEOWISE)', diameterKm: null, albedo: null, orbitClass: 'COM' },
    ];
    expect(parseLabels(labels.map(formatLabel).join('\n') + '\n')).toEqual(labels);
    const sectionOf = new Uint8Array(11).fill(NO_SECTION);
    sectionOf[3] = 2;
    sectionOf[5] = 2;
    sectionOf[9] = 4;
    sectionOf[10] = 2;
    const names = { sectionOf, named: new Map([[5, 'Astraea'], [10, 'Hygiea']]), comets: [['C/2020 F3 (NEOWISE)', 4, 12] as [string, number, number]] };
    const back = decodeNames(encodeNames(names).buffer.slice(0) as ArrayBuffer);
    expect(Array.from(back.sectionOf)).toEqual(Array.from(sectionOf));
    expect([...back.named]).toEqual([...names.named]);
    expect(back.comets).toEqual(names.comets);
    // The numbered bodies come first in a section, by number: 10 is the third of section 2.
    expect(locateNumber(sectionOf, 10)).toEqual({ section: 2, index: 2 });
    expect(locateNumber(sectionOf, 9)).toEqual({ section: 4, index: 0 });
    expect(locateNumber(sectionOf, 4)).toBeNull();
  });
});

describe('the shipped small-body data', () => {
  const ix = readJson<AsteroidIndex>('public/data/asteroids/index.json');

  it('match their index, and every file is under 2 MB', () => {
    let total = 0;
    ix.files.forEach((entry) => {
      const bytes = readBytes(`public/data/asteroids/${entry.file}`);
      expect(bytes.length).toBe(entry.bytes);
      expect(bytes.length).toBeLessThan(2_000_000);
      const f = decodeOrbitFile(inflate(`public/data/asteroids/${entry.file}`));
      expect(f.refEpochJd).toBe(ix.refEpochJd);
      expect(f.sections.map((s) => [s.id, s.count])).toEqual(entry.sections.map((s) => [s.id, s.count]));
      total += f.sections.reduce((n, s) => n + s.count, 0);
    });
    // The bodies with a card, and the drawn-only sample of the rest (scripts/asteroids/notable.mjs).
    const { sampled } = ix as AsteroidIndex & { sampled?: number };
    expect(total).toBe(ix.total + (sampled ?? 0));
    expect(ix.total).toBeGreaterThan(30_000);
  });

  it('leave out the bodies the registry draws, and find the rest by number', () => {
    const names = decodeNames(inflate('public/data/asteroids/names.bin.gz'));
    // Ceres, Vesta, Pluto, Eris, Haumea, Makemake, Gonggong, Quaoar, Sedna, Orcus, Arrokoth.
    for (const n of [1, 4, 134340, 136199, 136108, 136472, 225088, 50000, 90377, 90482, 486958]) expect(names.sectionOf[n], String(n)).toBe(NO_SECTION);
    const drawn = new Set(names.comets.map(([d]) => d));
    for (const d of ['1P/Halley', '2P/Encke', '67P/Churyumov-Gerasimenko', 'C/1995 O1 (Hale-Bopp)', 'C/2019 Q4 (Borisov)', 'C/2025 N1 (ATLAS)']) expect(drawn.has(d), d).toBe(false);
    expect(drawn.has('C/2020 F3 (NEOWISE)')).toBe(true);
    // 433 Eros: its section's labels name it at the place locateNumber gives.
    expect([...names.named].find(([, v]) => v === 'Eros')?.[0]).toBe(433);
    const at = locateNumber(names.sectionOf, 433)!;
    const labels = parseLabels(new TextDecoder().decode(new Uint8Array(inflate(`public/data/asteroids/labels/${at.section}.txt.gz`))));
    expect(labels[at.index]).toMatchObject({ number: 433, name: 'Eros' });
  });
});
