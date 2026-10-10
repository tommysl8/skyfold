/**
 * The nuclear star cluster and nuclear disc round Sagittarius A*, as a statistical field of stars and a
 * glow of the rest; and M87's own starlight round M87*.
 *
 * What: from Sgr A* the catalogue has a handful of stars and the Galaxy model's nuclear cluster is a few
 * hundred particles on a 2-pc lattice, while a real observer there would see millions of stars brighter than
 * the eye's limit. A seeded generator (scripts/build-nsc.py) draws the cluster, the disc and the young stars
 * of the central half parsec from published density laws, star-formation histories and isochrones, and keeps
 * as points the 60,000 that look brightest from the hole (every young star among them): 3,109 young stars,
 * 53,423 of the cluster and 3,468 of the disc, none within 0.04 pc of the hole (only GRAVITY's four S-stars
 * are there, as bodies). The light of all the others is a glow: each law times 1 − s(r), the share of its
 * light not in the points (sim/galaxy/nuclearGlow.json, its twin march in sim/galaxy/glow.ts, drawn by
 * render/shaders/galaxyGlow.frag.glsl). The lens's quality rungs 1 and 2 draw only the first 30,000 and
 * 10,000 of the points (the file is sorted brightest first as seen from the hole), and the glow then takes the
 * light of the rest: each count has its own share table, so the light is the same at every rung.
 *
 * Near the hole the field takes over from the Galaxy model's own particles of those two populations, in two
 * steps. Its laws, as glow, take u = 1 − smoothstep(500 pc, 1 kpc, distance from Sgr A*) of their light, the
 * particles 1 − u (galaxyUniforms.uNuclearFade.x = u, applied in render/shaders/galaxy.vert.glsl): the
 * particles, up to 160 pc across, fade as the camera comes within 2.8 of their sizes (they would be seen from
 * inside), and from 500 pc in they would hold less and less of the light (half of it at 60 pc). Its points
 * take w = 1 − smoothstep(30 pc, 60 pc, distance) of the light they hold: the glow is each law times u − w s(r),
 * s(r) the share of its light in the points. At every camera the three add up to the laws' light. It is a
 * model, and the app says so: none of its stars is a real, individual star.
 *
 * Points within 0.01 pc of the camera are not drawn (a model K giant 100 au away would be a point of V −21.6
 * with no disc, label or pick); their expected light stays in the glow as a column along every line of sight
 * (nuclearLocalColumn).
 *
 * And M87: from inside M87 its model galaxy's particles near the camera fade out as their
 * splats grow, and the sky would be dark where the real one glows (and the lens's Einstein disc read as a
 * shadow twice its true size). A spherical model of M87's light profile (Ferrarese et al. 2006 inside 25″,
 * Kormendy et al. 2009 outside) fills in exactly the light those particles no longer draw, as a table of the
 * column against the angle from M87's centre (sim/galaxy/glow.ts m87ColumnTable), rebuilt on the processor
 * when the camera's distance from the centre changes by 1 %.
 *
 * Data: public/data/nsc-stars.bin.gz, little-endian, gzipped: header (magic 'NSC1', uint32 count, float32
 * splitAbsMag, float32 innerPc, float32 outerPc, uint32 seed, 8 × float32 reserved), then count × float32[3]
 * positions (pc, relative to Sgr A*, J2000 ecliptic axes), count × int16 absolute V (0.01 mag), count ×
 * uint16 T_eff (K), sorted by apparent magnitude as seen from Sgr A* (brightest first). Loaded once, when the
 * camera first comes within 3 kpc of Sgr A* (or a scene asks); a failed load is tried again every 30 s while the
 * camera stays that close, and until the points are drawn their light stays in the glow (nscPointsGate). 0.9 MB.
 *
 * Cost: updateNuclear a few microseconds a frame (the local term), the M87 table under 0.1 ms when rebuilt;
 * nothing at all beyond 60 pc of Sgr A* and outside M87. The GPU's share is in scene/NuclearCluster.tsx and
 * the glow shader.
 *
 * Twins: sim/galaxy/glow.ts (the march and the tables), render/shaders/galaxyGlow.frag.glsl, scripts/build-nsc.py
 * (the laws and the point shares).
 */
import { DataTexture, FloatType, NearestFilter, RGBAFormat, RedFormat, Vector2, Vector3, Vector4 } from 'three';
import GLOW_JSON from './nuclearGlow.json';
import { fetchGzip } from '../stars/catalogue';
import { assetUrl } from '../../render/textures';
import { blackbodyRgb, bvToTemperature } from '../../physics/blackbody';
import { PARSEC_KM } from '../../physics/constants';
import { GAL_TO_G_ROT, mul, WORLD_TO_GAL, type Mat3 } from './frames';
import {
  M87_PSI_MIN,
  M87_TABLE_SIZE,
  m87ColumnTable,
  m87Profile,
  NUCLEAR_GLOW_STEPS,
  nuclearLaws,
  nuclearLocalColumn,
  nuclearShare,
  nscLaw,
  nsdLaw,
  youngLaw,
  type M87TemplateNear,
  type NuclearGlowJson,
} from './glow';

// ─── The data ────────────────────────────────────────────────────────────────────────────────

/** The field's laws and M87's profile (nuclearGlow.json, written by scripts/build-nsc.py). */
export const NUCLEAR_GLOW: NuclearGlowJson = GLOW_JSON as unknown as NuclearGlowJson;

/** The laws, parsed once. */
export const nuclearGlow = {
  laws: nuclearLaws(NUCLEAR_GLOW),
  m87: m87Profile(NUCLEAR_GLOW),
};

/** The field's points are drawn in full nearer Sgr A* than the first distance and not at all beyond the second, pc. */
export const NSC_FADE_PC: readonly [number, number] = [30, 60];
/** The field's laws hold all their light, as glow, nearer Sgr A* than the first distance, none of it beyond the second, pc. */
export const NSC_GLOW_FADE_PC: readonly [number, number] = [500, 1000];
/** Point stars drawn at the lens's quality rungs 0, 1 and 2 (and beyond), each with its share table (nuclearGlow.json). */
export const NSC_POINTS_BY_RUNG: readonly number[] = NUCLEAR_GLOW.share.counts;
/** The share table (and count of points) at quality rung `rung`. */
export const nscTableFor = (rung: number): number => Math.min(Math.max(0, Math.round(rung)), NSC_POINTS_BY_RUNG.length - 1);
/** Points nearer the camera than this are left in the glow, pc. */
export const NSC_EXCLUDE_PC = NUCLEAR_GLOW.excludePc;
/** The field loads once the camera is this close to Sgr A*, pc. */
export const NSC_LOAD_PC = 3000;
/** A load that failed is tried again after this long while the camera stays within NSC_LOAD_PC, ms. */
export const NSC_RETRY_MS = 30_000;

/** The statistical star field, decoded. */
export interface NuclearStars {
  count: number;
  positionsPc: Float32Array;
  absMagInt16: Int16Array;
  teffK: Uint16Array;
  /** m_split: a star is a point when M_V + 5 log10(r / 10 pc) < m_split (every young star is one), r from Sgr A*. */
  splitAbsMag: number;
  innerPc: number;
  outerPc: number;
}

/** The header's size in bytes: magic, count, three floats, the seed and eight reserved floats. */
const HEADER_BYTES = 56;

/** Decode nsc-stars.bin (already unzipped). The arrays are views on `buf`. */
export function decodeNuclearStars(buf: ArrayBuffer): NuclearStars {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'NSC1') throw new Error(`nsc-stars: bad magic '${magic}'`);
  const count = dv.getUint32(4, true);
  const need = HEADER_BYTES + count * 16;
  if (buf.byteLength < need) throw new Error(`nsc-stars: ${buf.byteLength} bytes for ${count} stars (want ${need})`);
  return {
    count,
    splitAbsMag: dv.getFloat32(8, true),
    innerPc: dv.getFloat32(12, true),
    outerPc: dv.getFloat32(16, true),
    positionsPc: new Float32Array(buf, HEADER_BYTES, 3 * count),
    absMagInt16: new Int16Array(buf, HEADER_BYTES + 12 * count, count),
    teffK: new Uint16Array(buf, HEADER_BYTES + 14 * count, count),
  };
}

type Status = 'idle' | 'loading' | 'ready' | 'failed';
let status: Status = 'idle';
let field: NuclearStars | null = null;
let pending: Promise<NuclearStars> | null = null;
/** When a failed load may be tried again (performance.now(), ms). */
let retryAt = 0;
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version++;
  for (const l of listeners) l();
}

/** For useSyncExternalStore: the field's loading state changes. */
export function subscribeNsc(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const nscVersion = (): number => version;

/** The field once loaded, else null. */
export const nscStars = (): NuclearStars | null => field;

const absolute = (path: string): string => (typeof location !== 'undefined' ? new URL(assetUrl(path), location.href).href : assetUrl(path));

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Load and decode the field (once; later calls share the first, and a call after a failure tries again). */
export function loadNuclearStars(): Promise<NuclearStars> {
  if (pending && status !== 'failed') return pending;
  status = 'loading';
  changed();
  pending = fetchGzip(absolute('data/nsc-stars.bin.gz')).then(
    (buf) => {
      field = decodeNuclearStars(buf);
      status = 'ready';
      changed();
      return field;
    },
    (e: unknown) => {
      status = 'failed';
      retryAt = nowMs() + NSC_RETRY_MS;
      console.warn('[lightspeed] the nuclear star cluster’s field did not load:', e);
      changed();
      throw e;
    },
  );
  return pending;
}

/** Loading state, for the scenes' status and the layer card. */
export function nscStatus(): Status {
  return status;
}

// ─── Shares ──────────────────────────────────────────────────────────────────────────────────

/** Each component's light per unit ln r at the share table's radii (the laws averaged over spheres), for pointShare. */
let shells: { nsc: Float64Array; nsd: Float64Array; young: Float64Array } | null = null;

function shellTables() {
  if (shells) return shells;
  const laws = nuclearGlow.laws;
  const n = laws.shareNsc[0].length;
  const out = { nsc: new Float64Array(n), nsd: new Float64Array(n), young: new Float64Array(n) };
  const MU = 256;
  for (let i = 0; i < n; i++) {
    const r = Math.exp(laws.shareLnR0 + i / laws.shareInvDLnR);
    let a = 0;
    let b = 0;
    for (let k = 0; k < MU; k++) {
      const mu = (k + 0.5) / MU;
      const R = r * Math.sqrt(1 - mu * mu);
      a += nscLaw(laws, R, r * mu);
      b += nsdLaw(laws, R, r * mu);
    }
    const w = (4 * Math.PI * r * r * r) / MU;
    out.nsc[i] = a * w;
    out.nsd[i] = b * w;
    out.young[i] = youngLaw(laws, r) * 4 * Math.PI * r * r * r;
  }
  return (shells = out);
}

/**
 * Share of the V luminosity density at radius r (pc) from Sgr A* carried by the point stars (the cluster's and
 * the disc's by their point shares, the young stars all), averaged over the sphere of that radius: 0 outside
 * the field. `table`: the count of points drawn (0: all 60,000; nscTableFor(rung)).
 */
export function pointShare(rPc: number, table = 0): number {
  const laws = nuclearGlow.laws;
  if (!(rPc >= laws.innerPc && rPc <= laws.outerPc)) return 0;
  const t = shellTables();
  const u = (Math.log(rPc) - laws.shareLnR0) * laws.shareInvDLnR;
  const i = Math.min(Math.max(0, Math.floor(u)), t.nsc.length - 2);
  const f = u - i;
  const lerp = (a: Float64Array) => a[i] + (a[i + 1] - a[i]) * f;
  const nsc = lerp(t.nsc);
  const nsd = lerp(t.nsd);
  const young = lerp(t.young);
  const all = nsc + nsd + young;
  return all > 0 ? (nsc * nuclearShare(laws, 0, rPc, table) + nsd * nuclearShare(laws, 1, rPc, table) + young) / all : 0;
}

const fade = (d: number, [a, b]: readonly [number, number]): number => {
  const t = Math.min(1, Math.max(0, (d - a) / (b - a)));
  return 1 - t * t * (3 - 2 * t);
};

/** The points' share w at a distance d (pc) from Sgr A*: 1 within 30 pc, 0 beyond 60. */
export const nscFieldShare = (dPc: number): number => fade(dPc, NSC_FADE_PC);

/** The field's share u of the cluster's and disc's light at a distance d (pc) from Sgr A*: 1 within 500 pc, 0 beyond 1 kpc. */
export const nscGlowShare = (dPc: number): number => fade(dPc, NSC_GLOW_FADE_PC);

// ─── The layer card ──────────────────────────────────────────────────────────────────────────

/**
 * The field's layer card (docs/data/blackholes.md §3, label 14), for the interface's layer cards (ui/viewport/LayerCards.tsx):
 * shown while the field is drawn, nuclear.w > 0. `sources` goes under the card's Sources, closed. Its sources and numbers
 * in full: docs/data/blackholes.md §6.
 */
export const NSC_LAYER_CARD = {
  title: 'The stars round Sgr A*',
  line: 'A statistical model of the nuclear star cluster and disc: its brightest stars drawn one by one, the rest a smooth glow.',
  caveat:
    'Their numbers, brightness and colours follow published fits, but none is a real individual star except S2, S29, S38 and S55; the glow holds the stars fainter than those drawn and any within 0.01 pc of you.',
  more: [
    'From near the hole the whole sky is some ten thousand times as bright as all the stars of Earth’s night sky together (V −17 against −6.5): the cluster’s millions of stars all round.',
    'No dust is drawn inside the cluster. Most of the 30 magnitudes that hide it from Earth lie in the Galaxy’s disc on the way.',
  ],
  sources: [
    'The cluster follows the light profile Schödel and colleagues measured (2014, 2018), the disc the Galaxy model’s own law; the stars’ ages, brightness and colours come from the star-formation histories of Schödel et al. (2020) and Nogueras-Lara et al. (2020) with the stellar-evolution formulae of Hurley, Pols and Tout (2000), and the young stars of the central half parsec from Lu et al. (2013) and Yelda et al. (2014).',
  ],
} as const;

// ─── Uniforms ────────────────────────────────────────────────────────────────────────────────

/** Linear sRGB of luminance 1 and ln of the colour temperature of a population of colour B − V. */
function colourOf(bv: number): { rgb: Vector3; lnT: number } {
  const T = bvToTemperature(bv);
  const c = blackbodyRgb(T);
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return { rgb: new Vector3(c[0] / lum, c[1] / lum, c[2] / lum), lnT: Math.log(T) };
}

/** The share table as the shader reads it: 64 × 1, r the cluster's point share, g the disc's (table 0 until updateNuclear picks another). */
const shareData = new Float32Array(4 * nuclearGlow.laws.shareNsc[0].length);
function fillShares(table: number): void {
  const laws = nuclearGlow.laws;
  const a = laws.shareNsc[table];
  const b = laws.shareNsd[table];
  for (let i = 0; i < a.length; i++) {
    shareData[4 * i] = a[i];
    shareData[4 * i + 1] = b[i];
  }
}
function shareTexture(): DataTexture {
  fillShares(0);
  const t = new DataTexture(shareData, shareData.length / 4, 1, RGBAFormat, FloatType);
  t.minFilter = t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** M87's table as the shader reads it: 64 × 1, ln of the column (L☉/pc²) at ln ψ uniform from ln M87_PSI_MIN to ln π. */
const m87Data = new Float32Array(M87_TABLE_SIZE).fill(-80);
function m87Texture(): DataTexture {
  const t = new DataTexture(m87Data, M87_TABLE_SIZE, 1, RedFormat, FloatType);
  t.minFilter = t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * Uniforms of the nuclear cluster's glow march and of M87's own starlight in galaxyGlow.frag.glsl, shared by
 * reference with the Galaxy glow's material (render/materials.ts spreads them in when it is made).
 */
export interface NuclearGlowUniforms {
  /** x: the points' share w near Sgr A*; y: M87's starlight on (0/1); z: the Milky Way discs' glow on (0/1); w: the field's share u (0: no march). */
  uNscGlowOn: { value: Vector4 };
  /** Camera relative to Sgr A*, pc, frame G's axes (z to the north galactic pole), as hi + lo (float64 split). */
  uNscCamHi: { value: Vector3 };
  uNscCamLo: { value: Vector3 };
  /** Cells of the logarithmic march (16; 8 at rung 1). */
  uNscSteps: { value: number };
}

/** Everything the glow shader reads for the nuclear field and M87 (the interface's four and the laws, tables and colours). */
const c0 = colourOf(NUCLEAR_GLOW.share.bvNsc[0]);
const c1 = colourOf(NUCLEAR_GLOW.share.bvNsd[0]);
const cm = colourOf(NUCLEAR_GLOW.m87.bv);
const L = nuclearGlow.laws;
export const nscGlowUniforms = {
  uNscGlowOn: { value: new Vector4(0, 0, 1, 0) },
  uNscCamHi: { value: new Vector3() },
  uNscCamLo: { value: new Vector3() },
  uNscSteps: { value: NUCLEAR_GLOW_STEPS[0] },
  /** The cluster's law: ρ0 (L☉/pc³), r_b (pc), γ, β. */
  uNscLaw: { value: new Vector4(L.nsc.rho0, L.nsc.rbPc, L.nsc.gamma, L.nsc.beta) },
  /** α, 1/q, m_max (pc), the field's inner radius (pc). */
  uNscLaw2: { value: new Vector4(L.nsc.alpha, 1 / L.nsc.q, L.nsc.mMaxPc, L.innerPc) },
  /** The disc's law: ρ0, r_b, 1/h_z (pc⁻¹), R_min (pc). */
  uNsdLaw: { value: new Vector4(L.nsd.rho0, L.nsd.rbPc, 1 / L.nsd.hzPc, L.nsd.rMinPc) },
  /** R_edge (pc), the field's outer radius (pc), the inner and outer slopes. */
  uNsdLaw2: { value: new Vector4(L.nsd.edgePc, L.outerPc, L.nsd.slopeIn, L.nsd.slopeOut) },
  /** The points' shares (r cluster, g disc) at 64 radii; ln r of node 0 and nodes per unit ln r. */
  uNscShare: { value: shareTexture() },
  uNscShareAxis: { value: new Vector2(L.shareLnR0, L.shareInvDLnR) },
  /** The column that stands in for the points within 0.01 pc of the camera (L☉/pc²), added to every line of sight. */
  uNscLocal: { value: 0 },
  /** The glow's colours (linear sRGB of luminance 1) and ln of their colour temperatures (x cluster, y disc). */
  uNscRgb: { value: c0.rgb },
  uNsdRgb: { value: c1.rgb },
  uNscLnT: { value: new Vector2(c0.lnT, c1.lnT) },
  /** M87: the unit direction from the camera to its centre (world axes), its table, the table's axis (ln ψ of node 0, nodes per unit ln ψ), its colour. */
  uM87Dir: { value: new Vector3(0, 0, -1) },
  uM87Table: { value: m87Texture() },
  uM87Axis: { value: new Vector2(Math.log(M87_PSI_MIN), (M87_TABLE_SIZE - 1) / Math.log(Math.PI / M87_PSI_MIN)) },
  uM87Rgb: { value: cm.rgb },
  uM87LnT: { value: cm.lnT },
} satisfies NuclearGlowUniforms & Record<string, { value: unknown }>;

/**
 * Where the points are drawn from and how bright (scene/NuclearCluster.tsx gives its star material these in
 * place of the star field's): the camera relative to Sgr A*, pc, J2000 ecliptic axes, as hi + lo; the stars
 * stand still (no years, no light-time); and the exposure, which that component sets before each draw to the
 * view's own plus ln w.
 */
export const nscPointUniforms = {
  uCamHi: { value: new Vector3() },
  uCamLo: { value: new Vector3() },
  uYears: { value: 0 },
  uRetarded: { value: 0 },
  uLnExposure: { value: 0 },
};

// ─── Each frame ──────────────────────────────────────────────────────────────────────────────

/** World axes → frame G's axes (a rotation). */
const WORLD_TO_G: Mat3 = mul(GAL_TO_G_ROT, WORLD_TO_GAL);

/** The field this frame, for scene/NuclearCluster.tsx. */
export const nuclear = {
  /** The points' share w (0: none drawn). */
  w: 0,
  /** The field's share u of the cluster's and disc's light (the Galaxy model's particles draw 1 − u). */
  u: 0,
  /** The camera's distance from Sgr A*, pc (Infinity when unknown). */
  dPc: Infinity,
  /** The camera relative to Sgr A*, pc, world axes (for the order-1 lists). */
  camWorldPc: new Vector3(),
  /** Points drawn (60,000; 30,000 at rung 1, 10,000 at rung 2), and their share table. */
  points: 0,
  table: 0,
  /** M87's starlight is drawn. */
  m87: false,
};

const camG: [number, number, number] = [0, 0, 0];

/**
 * The points' camera this frame (scene/NuclearCluster.tsx, before they are drawn): from the camera relative to
 * Sgr A* (world axes, km; null when unknown), the field's share w, the camera in the points' frame (J2000
 * ecliptic, pc, hi + lo) and how many points are drawn at the lens's quality rung `rung`. Starts the field's
 * load within 3 kpc. Returns w.
 */
export function updateNuclearPoints(camSgrKm: Vector3 | null, rung: number): number {
  const dPc = camSgrKm ? camSgrKm.length() / PARSEC_KM : Infinity;
  nuclear.dPc = dPc;
  if (camSgrKm && dPc < NSC_LOAD_PC && (status === 'idle' || (status === 'failed' && nowMs() >= retryAt))) void loadNuclearStars().catch(() => undefined);
  const w = camSgrKm ? nscFieldShare(dPc) : 0;
  nuclear.w = w;
  if (w > 0 && camSgrKm) {
    const x = camSgrKm.x / PARSEC_KM;
    const y = camSgrKm.y / PARSEC_KM;
    const z = camSgrKm.z / PARSEC_KM;
    nuclear.camWorldPc.set(x, y, z);
    // J2000 ecliptic (world (x, y, z) = ecliptic (x, z, −y)).
    const p = nscPointUniforms;
    const hi = p.uCamHi.value.set(Math.fround(x), Math.fround(-z), Math.fround(y));
    p.uCamLo.value.set(x - hi.x, -z - hi.y, y - hi.z);
    const table = nscTableFor(rung);
    nuclear.table = table;
    nuclear.points = field ? Math.min(NSC_POINTS_BY_RUNG[table], field.count) : 0;
  } else nuclear.points = 0;
  return w;
}

/**
 * Whether the renderer can draw the points yet: their lensed star program has compiled (render/lens/lensState.ts
 * lensProgramsReady, which scene/NuclearCluster.tsx waits for too). scene/SimDriver.tsx sets it; sim does not
 * import the renderer's list of programs. Until then (and until the field has loaded, or if it failed to: it is
 * tried again every NSC_RETRY_MS) the glow keeps the light the points would hold, so the cluster's and the disc's
 * stars are never missing from both; only the young stars of the central half parsec, which are all points,
 * wait for them.
 */
export const nscPointsGate = { programsReady: (): boolean => true };

/**
 * The glow's uniforms this frame (scene/GalaxyModel.tsx): the shares u and w, the camera in frame G's axes, the
 * local term and the march's steps from the camera relative to Sgr A* (world axes, km; null when unknown), and
 * M87's starlight from the camera relative to M87's centre (null when it is not wanted). `rung`: the lens's
 * quality rung. The points' share w is taken out of the glow only while the points are drawn (the field loaded
 * and nscPointsGate open). Returns u, the field's share of the two components' light (the Galaxy model's
 * particles of them are drawn × (1 − u)).
 */
export function updateNuclear(camSgrKm: Vector3 | null, rung: number, m87: { camKm: Vector3; near: M87TemplateNear } | null): number {
  const u = nscGlowUniforms;
  const dPc = camSgrKm ? camSgrKm.length() / PARSEC_KM : Infinity;
  const fieldW = camSgrKm ? nscFieldShare(dPc) : 0;
  const w = fieldW > 0 && field !== null && nscPointsGate.programsReady() ? fieldW : 0;
  const share = camSgrKm ? nscGlowShare(dPc) : 0;
  u.uNscGlowOn.value.x = w;
  u.uNscGlowOn.value.w = share;
  nuclear.u = share;
  if (share > 0 && camSgrKm) {
    const x = camSgrKm.x / PARSEC_KM;
    const y = camSgrKm.y / PARSEC_KM;
    const z = camSgrKm.z / PARSEC_KM;
    const M = WORLD_TO_G;
    camG[0] = M[0][0] * x + M[0][1] * y + M[0][2] * z;
    camG[1] = M[1][0] * x + M[1][1] * y + M[1][2] * z;
    camG[2] = M[2][0] * x + M[2][1] * y + M[2][2] * z;
    const gh = u.uNscCamHi.value.set(Math.fround(camG[0]), Math.fround(camG[1]), Math.fround(camG[2]));
    u.uNscCamLo.value.set(camG[0] - gh.x, camG[1] - gh.y, camG[2] - gh.z);
    u.uNscSteps.value = NUCLEAR_GLOW_STEPS[rung >= 1 ? 1 : 0];
    const table = nscTableFor(rung);
    if (table !== glowTable) setGlowTable(table);
    u.uNscLocal.value = w > 0 ? nuclearLocalColumn(nuclearGlow.laws, camG, NSC_EXCLUDE_PC, table) : 0;
  } else u.uNscLocal.value = 0;
  updateM87(m87);
  return share;
}

/** The share table the glow holds now (the points drawn at the current rung take the rest). */
let glowTable = 0;
function setGlowTable(table: number): void {
  glowTable = table;
  fillShares(table);
  const u = nscGlowUniforms;
  u.uNscShare.value.needsUpdate = true;
  const a = colourOf(NUCLEAR_GLOW.share.bvNsc[table]);
  const b = colourOf(NUCLEAR_GLOW.share.bvNsd[table]);
  u.uNscRgb.value.copy(a.rgb);
  u.uNsdRgb.value.copy(b.rgb);
  u.uNscLnT.value.set(a.lnT, b.lnT);
}

let m87D = NaN;
let m87Px = NaN;
let m87Near: M87TemplateNear | null = null;

/** M87's table, rebuilt when the camera's distance from the centre or the Galaxy layer's scale changes by 1 %. */
function updateM87(m87: { camKm: Vector3; near: M87TemplateNear } | null): void {
  const u = nscGlowUniforms;
  // The template's particles fade only within s = h pxPerRad / (σ_max / 2) of the camera, h ≤ half a unit: beyond
  // the template's reach plus that, the glow holds nothing.
  const reach = m87 ? m87.near.rMax * m87.near.unitPc + (0.5 * m87.near.splatPc * m87.near.pxPerRad) / (0.5 * m87.near.sigmaMax) : 0;
  const dPc = m87 ? m87.camKm.length() / PARSEC_KM : Infinity;
  const on = !!m87 && dPc < reach;
  nuclear.m87 = on;
  u.uNscGlowOn.value.y = on ? 1 : 0;
  if (!on || !m87) return;
  const k = m87.camKm;
  const inv = -1 / Math.max(k.length(), 1e-300);
  u.uM87Dir.value.set(k.x * inv, k.y * inv, k.z * inv);
  const near = m87.near;
  if (near === m87Near && Math.abs(Math.log(dPc / m87D)) < 0.01 && Math.abs(Math.log(near.pxPerRad / m87Px)) < 0.01) return;
  m87Near = near;
  m87D = dPc;
  m87Px = near.pxPerRad;
  m87ColumnTable(nuclearGlow.m87, near, Math.max(dPc, 1e-9), m87Data);
  u.uM87Table.value.needsUpdate = true;
}

/** Development and tests: M87's table as last built (ln of the column at each node). */
export const m87TableNow = (): Float32Array => m87Data;
