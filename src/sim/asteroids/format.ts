/**
 * The small-body files (public/data/asteroids/), written by scripts/build-asteroids.mjs and read by the layer
 * (sim/asteroids/load.ts). Every asteroid and comet with a usable orbit in JPL's Small-Body Database, sorted into
 * groups by orbit class, each group cut into sections by absolute magnitude (brightest first), so that a view loads
 * and draws only the sections that could hold a body bright enough to show.
 *
 * Orbit file `NN.bin.gz` (gzip; little-endian inside):
 *   header, 32 bytes: u32 magic 'SBF1', u32 section count, u32 reserved ×2, f64 reference epoch (JD, TDB), f64 reserved
 *   section table, 48 bytes each: u8 group, u8 shape (0 ellipse, 1 any conic), u8 frame (0 about the Sun, 1 about
 *     the barycentre), u8 sample (1: a sample of the bodies without a card, drawn only: scripts/asteroids/notable.mjs); u32 count; u32 numbered (the first `numbered` bodies are the numbered ones, by
 *     number); u32 byte offset of the columns; f32 hMin, hMax (the section's range of H, or of M1 for comets);
 *     f32 rMin, rMax (au: the least perihelion and the greatest aphelion, Infinity for open orbits); u32 id (the
 *     section's number across all files); u32 reserved ×3
 *   columns, each split into byte planes (all first bytes, then all second bytes…), which gzip packs far better:
 *     ellipse: f32 a (au); u16 e·65535; u16 i/π·65535; u16 Ω/2π·65535; u16 ω/2π·65535; u16 M/2π·65535 (mean
 *              anomaly at the reference epoch); u8 H (hMin…hMax in 255 steps)
 *     conic:   f32 q (au); f32 e; f32 tp (days after the reference epoch); u16 i, Ω, ω as above; u8 M1 and u8 K1
 *              (in quarter magnitudes, M1 from −5; 255: not known)
 *   each column starts on a 4-byte boundary.
 *
 * Labels `labels/<id>.txt.gz`: one line per body of section <id>, in its order: "number|name|designation|diameter
 * km|geometric albedo|class" (empty where unknown or none). Fetched when a body is clicked or found.
 *
 * Names `names.bin.gz`: u32 magic 'SBN1', u32 the largest number, u32 bytes of text, u32 reserved; u8 section id of
 * each number from 0 (255: not drawn here: filtered out, or a body the registry draws); then UTF-8 text, a line
 * "number name" for each named numbered body and "c<section> <index> <designation>" for each comet. Loaded when
 * "Where to?" opens.
 */

export const ORBIT_MAGIC = 0x31464253; // 'SBF1'
export const NAMES_MAGIC = 0x314e4253; // 'SBN1'
export const HEADER_BYTES = 32;
export const SECTION_BYTES = 48;
export const NO_SECTION = 255;
export const NO_MAG = 255;

/** Orbit groups. */
export const GROUPS = ['neo', 'main', 'hilda', 'trojan', 'centaur', 'tno', 'comet'] as const;
export type Group = (typeof GROUPS)[number];

/** Each group's colour: the old belts' sand, grey-blue and khaki, with near-Earth amber, Hilda gold, Centaur lilac, comet ice. */
export const GROUP_COLOURS: Record<Group, string> = {
  neo: '#e6b07c',
  main: '#c9b8a3',
  hilda: '#d1bd86',
  trojan: '#aeb28c',
  centaur: '#b9a8c9',
  tno: '#9fb6d8',
  comet: '#a9d6d8',
};

/** How each group is named on cards and in the docs. */
export const GROUP_TEXT: Record<Group, string> = {
  neo: 'Near-Earth asteroid',
  main: 'Main-belt asteroid',
  hilda: 'Hilda asteroid',
  trojan: 'Jupiter Trojan',
  centaur: 'Centaur',
  tno: 'Trans-Neptunian object',
  comet: 'Comet',
};

export const SHAPE_ELLIPSE = 0;
export const SHAPE_CONIC = 1;
export const FRAME_SUN = 0;
export const FRAME_BARY = 1;

export interface SectionHead {
  group: number;
  shape: number;
  frame: number;
  /** A sample standing for the bodies without a card: drawn, but never picked, labelled or found. */
  sample?: boolean;
  count: number;
  numbered: number;
  hMin: number;
  hMax: number;
  rMin: number;
  rMax: number;
  id: number;
}

/** An ellipse section's columns (the GPU takes them as they are). */
export interface EllipseColumns {
  a: Float32Array;
  e: Uint16Array;
  i: Uint16Array;
  node: Uint16Array;
  peri: Uint16Array;
  M: Uint16Array;
  H: Uint8Array;
}

export interface ConicColumns {
  q: Float32Array;
  e: Float32Array;
  tp: Float32Array;
  i: Uint16Array;
  node: Uint16Array;
  peri: Uint16Array;
  M1: Uint8Array;
  K1: Uint8Array;
}

export type Section = SectionHead & ({ shape: 0; cols: EllipseColumns } | { shape: 1; cols: ConicColumns });

export interface OrbitFile {
  refEpochJd: number;
  sections: Section[];
}

const U16 = 65535;
export const quantU16 = (x: number): number => Math.max(0, Math.min(U16, Math.round(x * U16)));
export const unquantU16 = (k: number): number => k / U16;
/** H (or M1) in a section's range, as a byte. */
export const quantH = (H: number, lo: number, hi: number): number => (hi > lo ? Math.max(0, Math.min(254, Math.round(((H - lo) / (hi - lo)) * 254))) : 0);
export const unquantH = (k: number, lo: number, hi: number): number => lo + (k / 254) * (hi - lo);
/** Comet magnitudes in quarter magnitudes: M1 from −5 to 58, K1 from 0 to 63. */
export const quantM1 = (m: number | null): number => (m == null || !Number.isFinite(m) ? NO_MAG : Math.max(0, Math.min(254, Math.round((m + 5) * 4))));
export const unquantM1 = (k: number): number => (k === NO_MAG ? NaN : k / 4 - 5);
export const quantK1 = (k: number | null): number => (k == null || !Number.isFinite(k) ? NO_MAG : Math.max(0, Math.min(254, Math.round(k * 4))));
export const unquantK1 = (k: number): number => (k === NO_MAG ? NaN : k / 4);

const pad4 = (n: number) => (n + 3) & ~3;

/** Column sizes (bytes per body) in file order. */
const ELLIPSE_LAYOUT = [4, 2, 2, 2, 2, 2, 1] as const;
const CONIC_LAYOUT = [4, 4, 4, 2, 2, 2, 1, 1] as const;

function columnsBytes(layout: readonly number[], n: number): number {
  return layout.reduce((s, w) => s + pad4(w * n), 0);
}

/** Split `src` (n values of w bytes) into byte planes at `dst`. */
function shuffle(src: Uint8Array, w: number, n: number, dst: Uint8Array, at: number): void {
  for (let b = 0; b < w; b++) {
    const base = at + b * n;
    for (let k = 0; k < n; k++) dst[base + k] = src[k * w + b];
  }
}

function unshuffle(src: Uint8Array, at: number, w: number, n: number, dst: Uint8Array): void {
  for (let b = 0; b < w; b++) {
    const base = at + b * n;
    for (let k = 0; k < n; k++) dst[k * w + b] = src[base + k];
  }
}

const bytesOf = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/** One orbit file's bytes (before gzip). */
export function encodeOrbitFile(file: OrbitFile): Uint8Array {
  const n = file.sections.length;
  let size = HEADER_BYTES + SECTION_BYTES * n;
  const offsets: number[] = [];
  for (const s of file.sections) {
    offsets.push(size);
    size += columnsBytes(s.shape === SHAPE_ELLIPSE ? ELLIPSE_LAYOUT : CONIC_LAYOUT, s.count);
  }
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, ORBIT_MAGIC, true);
  dv.setUint32(4, n, true);
  dv.setFloat64(16, file.refEpochJd, true);
  file.sections.forEach((s, k) => {
    const h = HEADER_BYTES + k * SECTION_BYTES;
    dv.setUint8(h, s.group);
    dv.setUint8(h + 1, s.shape);
    dv.setUint8(h + 2, s.frame);
    dv.setUint8(h + 3, s.sample ? 1 : 0);
    dv.setUint32(h + 4, s.count, true);
    dv.setUint32(h + 8, s.numbered, true);
    dv.setUint32(h + 12, offsets[k], true);
    dv.setFloat32(h + 16, s.hMin, true);
    dv.setFloat32(h + 20, s.hMax, true);
    dv.setFloat32(h + 24, s.rMin, true);
    dv.setFloat32(h + 28, s.rMax, true);
    dv.setUint32(h + 32, s.id, true);
    const cols: ArrayBufferView[] =
      s.shape === SHAPE_ELLIPSE
        ? [s.cols.a, s.cols.e, s.cols.i, s.cols.node, s.cols.peri, s.cols.M, s.cols.H]
        : [s.cols.q, s.cols.e, s.cols.tp, s.cols.i, s.cols.node, s.cols.peri, s.cols.M1, s.cols.K1];
    const layout = s.shape === SHAPE_ELLIPSE ? ELLIPSE_LAYOUT : CONIC_LAYOUT;
    let at = offsets[k];
    cols.forEach((c, j) => {
      shuffle(bytesOf(c), layout[j], s.count, out, at);
      at += pad4(layout[j] * s.count);
    });
  });
  return out;
}

/** Read one orbit file (already inflated). The columns are fresh typed arrays (the GPU buffers are made from them). */
export function decodeOrbitFile(buf: ArrayBuffer): OrbitFile {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== ORBIT_MAGIC) throw new Error('asteroid file: bad magic');
  const n = dv.getUint32(4, true);
  const refEpochJd = dv.getFloat64(16, true);
  const bytes = new Uint8Array(buf);
  const sections: Section[] = [];
  for (let k = 0; k < n; k++) {
    const h = HEADER_BYTES + k * SECTION_BYTES;
    const head: SectionHead = {
      group: dv.getUint8(h),
      shape: dv.getUint8(h + 1),
      frame: dv.getUint8(h + 2),
      sample: dv.getUint8(h + 3) === 1,
      count: dv.getUint32(h + 4, true),
      numbered: dv.getUint32(h + 8, true),
      hMin: dv.getFloat32(h + 16, true),
      hMax: dv.getFloat32(h + 20, true),
      rMin: dv.getFloat32(h + 24, true),
      rMax: dv.getFloat32(h + 28, true),
      id: dv.getUint32(h + 32, true),
    };
    let at = dv.getUint32(h + 12, true);
    const c = head.count;
    const take = <T extends ArrayBufferView>(make: (len: number) => T, w: number): T => {
      const arr = make(c);
      unshuffle(bytes, at, w, c, bytesOf(arr));
      at += pad4(w * c);
      return arr;
    };
    const f32 = (len: number) => new Float32Array(len);
    const u16 = (len: number) => new Uint16Array(len);
    const u8 = (len: number) => new Uint8Array(len);
    if (head.shape === SHAPE_ELLIPSE) {
      const cols: EllipseColumns = { a: take(f32, 4), e: take(u16, 2), i: take(u16, 2), node: take(u16, 2), peri: take(u16, 2), M: take(u16, 2), H: take(u8, 1) };
      sections.push({ ...head, shape: 0, cols });
    } else {
      const cols: ConicColumns = { q: take(f32, 4), e: take(f32, 4), tp: take(f32, 4), i: take(u16, 2), node: take(u16, 2), peri: take(u16, 2), M1: take(u8, 1), K1: take(u8, 1) };
      sections.push({ ...head, shape: 1, cols });
    }
  }
  return { refEpochJd, sections };
}

// ─── Labels ──────────────────────────────────────────────────────────────────────────────

export interface Label {
  /** Its number, or 0 for an unnumbered body. */
  number: number;
  /** Its name, if it has one ("Eros"). */
  name: string | null;
  /** Its designation: provisional for an asteroid ("2013 NE69"), in full for a comet ("C/2020 F3 (NEOWISE)", "12P/Pons-Brooks"). */
  designation: string;
  /** Diameter, km, where measured. */
  diameterKm: number | null;
  albedo: number | null;
  /** JPL's orbit class code ("MBA", "APO", "JFc"…). */
  orbitClass: string;
}

export function formatLabel(l: Label): string {
  const num = (x: number | null) => (x == null ? '' : String(x));
  return `${l.number || ''}|${l.name ?? ''}|${l.designation}|${num(l.diameterKm)}|${num(l.albedo)}|${l.orbitClass}`;
}

export function parseLabels(text: string): Label[] {
  const out: Label[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [n, name, des, d, p, cls] = line.split('|');
    out.push({ number: n ? Number(n) : 0, name: name || null, designation: des, diameterKm: d ? Number(d) : null, albedo: p ? Number(p) : null, orbitClass: cls ?? '' });
  }
  return out;
}

// ─── Names ───────────────────────────────────────────────────────────────────────────────

export interface NamesFile {
  /** Section id of each number (NO_SECTION where the layer does not draw it). */
  sectionOf: Uint8Array;
  /** Named numbered bodies: number → name. */
  named: Map<number, string>;
  /** Comets: designation → [section id, index]. */
  comets: [string, number, number][];
}

export function encodeNames(f: NamesFile): Uint8Array {
  const lines: string[] = [];
  for (const [n, name] of [...f.named].sort((x, y) => x[0] - y[0])) lines.push(`${n} ${name}`);
  for (const [d, s, i] of f.comets) lines.push(`c${s} ${i} ${d}`);
  const text = new TextEncoder().encode(lines.join('\n'));
  const out = new Uint8Array(16 + f.sectionOf.length + text.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, NAMES_MAGIC, true);
  dv.setUint32(4, f.sectionOf.length - 1, true);
  dv.setUint32(8, text.length, true);
  out.set(f.sectionOf, 16);
  out.set(text, 16 + f.sectionOf.length);
  return out;
}

export function decodeNames(buf: ArrayBuffer): NamesFile {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== NAMES_MAGIC) throw new Error('asteroid names: bad magic');
  const max = dv.getUint32(4, true);
  const textBytes = dv.getUint32(8, true);
  const sectionOf = new Uint8Array(buf.slice(16, 16 + max + 1));
  const text = new TextDecoder().decode(new Uint8Array(buf, 16 + max + 1, textBytes));
  const named = new Map<number, string>();
  const comets: [string, number, number][] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    if (line[0] === 'c') {
      const a = line.indexOf(' ');
      const b = line.indexOf(' ', a + 1);
      comets.push([line.slice(b + 1), Number(line.slice(1, a)), Number(line.slice(a + 1, b))]);
    } else {
      const a = line.indexOf(' ');
      named.set(Number(line.slice(0, a)), line.slice(a + 1));
    }
  }
  return { sectionOf, named, comets };
}

/**
 * Where numbered body `number` sits: its section, and its index there (the numbered bodies come first in each
 * section, in order of number, so the index is how many smaller numbers share its section). Null when the layer does
 * not draw it.
 */
export function locateNumber(sectionOf: Uint8Array, number: number): { section: number; index: number } | null {
  if (!(number >= 0 && number < sectionOf.length)) return null;
  const s = sectionOf[number];
  if (s === NO_SECTION) return null;
  let index = 0;
  for (let k = 0; k < number; k++) if (sectionOf[k] === s) index++;
  return { section: s, index };
}
