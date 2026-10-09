import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '../../test/files';
import { activeComets, LAYER_TAILS } from './activeComets';
import { decodeOrbitFile, parseLabels } from './format';
import type { AsteroidIndex } from './load';

const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as {
  gunzipSync(b: Uint8Array): Uint8Array;
};
const gunzip = (path: string) => {
  const b = zlib.gunzipSync(readBytes(path));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const ix = readJson<AsteroidIndex>('public/data/asteroids/index.json');
// The first file holds every comet.
const sections = decodeOrbitFile(gunzip(`public/data/asteroids/${ix.files[0].file}`)).sections;
const comets = sections.find((s) => s.group === 6 && s.frame === 0)!;
const labels = parseLabels(new TextDecoder().decode(gunzip(`public/data/asteroids/labels/${comets.id}.txt.gz`)));
const name = (i: number) => labels[i].designation;

/** Days after the files' reference epoch of a calendar date. */
const days = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - Date.UTC(2000, 0, 1, 12)) / 86_400_000 + 2451545 - ix.refEpochJd;

describe('the layer’s active comets', () => {
  it('finds the great comets of the last thirty years at their perihelia, strongest first', () => {
    const at = (y: number, m: number, d: number) => activeComets(sections, days(y, m, d)).map((c) => name(c.index));
    expect(at(1996, 5, 1)[0]).toMatch(/C\/1996 B2/); // Hyakutake, 0.23 au on 1 May 1996
    expect(at(2020, 7, 3)[0]).toMatch(/C\/2020 F3/); // NEOWISE, 0.29 au on 3 July 2020
    expect(at(2024, 9, 27)).toContainEqual(expect.stringMatching(/C\/2023 A3/)); // Tsuchinshan–ATLAS
    expect(at(2024, 4, 21)).toContainEqual(expect.stringMatching(/12P/)); // Pons–Brooks
  });

  it('keeps to the strongest few, and none is too faint or too far to show', () => {
    for (const y of [1990, 2005, 2020, 2026]) {
      const list = activeComets(sections, days(y, 6, 1));
      expect(list.length).toBeLessThanOrEqual(LAYER_TAILS);
      for (let k = 1; k < list.length; k++) expect(list[k].strength).toBeLessThanOrEqual(list[k - 1].strength);
      for (const c of list) expect(c.strength).toBeGreaterThan(0.02);
    }
  });

  it('leaves out the one drawn elsewhere', () => {
    const top = activeComets(sections, days(2020, 7, 3))[0];
    const again = activeComets(sections, days(2020, 7, 3), LAYER_TAILS, top);
    expect(again.some((c) => c.index === top.index)).toBe(false);
  });
});
