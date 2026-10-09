/**
 * The shipped extragalactic files, read once per test run: the Local Group, the named objects, the
 * more galaxies and their pictures' list, and the cosmic web, and an 8-bit PNG decoder for the CMB maps (Node's zlib through
 * process.getBuiltinModule, as test/files.ts reaches fs).
 */
import { decodeCosmicWeb, type CosmicWeb } from '../sim/cosmos/cosmicWeb';
import type { LocalGalaxiesDoc, NamedDoc } from '../sim/cosmos/localGalaxies';
import type { MoreGalaxiesDoc } from '../sim/cosmos/moreGalaxies';
import type { PicturesDoc } from '../sim/cosmos/pictures';
import { readBytes, readJson } from './files';
import { gunzipFile } from './stars';

interface NodeZlib {
  inflateSync(data: Uint8Array): Uint8Array;
}
const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as NodeZlib;

let local: LocalGalaxiesDoc | undefined;
let named: NamedDoc | undefined;
let web: CosmicWeb | undefined;
let more: MoreGalaxiesDoc | undefined;

export const loadLocalGalaxies = (): LocalGalaxiesDoc => (local ??= JSON.parse(new TextDecoder().decode(gunzipFile('public/data/local-galaxies.json.gz'))) as LocalGalaxiesDoc);
export const loadNamed = (): NamedDoc => (named ??= readJson<NamedDoc>('src/sim/cosmos/named.json'));
export const loadMore = (): MoreGalaxiesDoc => (more ??= JSON.parse(new TextDecoder().decode(gunzipFile('public/data/more-galaxies.json.gz'))) as MoreGalaxiesDoc);
export const loadPictures = (): PicturesDoc => readJson<PicturesDoc>('src/sim/cosmos/pictures.json');
export const loadWeb = (): CosmicWeb => (web ??= decodeCosmicWeb(gunzipFile('public/data/cosmic-web.bin.gz')));

export interface DecodedPng {
  width: number;
  height: number;
  colorType: number;
  /** One byte per pixel: the grey level or the palette index. */
  pixels: Uint8Array;
  palette: Uint8Array | null;
  text: Record<string, string>;
}

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const latin1 = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Decode an 8-bit greyscale or palette PNG (the CMB maps). */
export function decodePng8(path: string): DecodedPng {
  const buf = readBytes(path);
  if (u32(buf, 0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  const text: Record<string, string> = {};
  while (off < buf.length) {
    const len = u32(buf, off);
    const type = latin1(buf, off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = u32(data, 0);
      height = u32(data, 4);
      if (data[8] !== 8) throw new Error('only 8-bit PNGs');
      colorType = data[9];
    } else if (type === 'PLTE') palette = new Uint8Array(data);
    else if (type === 'IDAT') idat.push(new Uint8Array(data));
    else if (type === 'tEXt') {
      const z = data.indexOf(0);
      text[latin1(data, 0, z)] = latin1(data, z + 1, data.length);
    }
    off += 12 + len;
  }
  if (colorType !== 0 && colorType !== 3) throw new Error('only greyscale or palette PNGs');
  const all = new Uint8Array(idat.reduce((a, c) => a + c.length, 0));
  let at = 0;
  for (const c of idat) {
    all.set(c, at);
    at += c.length;
  }
  const raw = zlib.inflateSync(all);
  const pixels = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    const f = raw[j * (width + 1)];
    for (let i = 0; i < width; i++) {
      const x = raw[j * (width + 1) + 1 + i];
      const a = i > 0 ? pixels[j * width + i - 1] : 0;
      const b = j > 0 ? pixels[(j - 1) * width + i] : 0;
      const c = i > 0 && j > 0 ? pixels[(j - 1) * width + i - 1] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[j * width + i] = (x + p) & 255;
    }
  }
  return { width, height, colorType, pixels, palette, text };
}
