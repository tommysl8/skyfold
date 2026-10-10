/**
 * A small body of the layer as a body of the registry: what a click or a search makes of it, so that it gets a card,
 * a label, its orbit line, Go there and Fly here like any other. Its labels (name, number, size) come from the
 * section's label file, fetched then; its position from the same elements the layer draws, in float64 (conic.ts),
 * about the Sun or the barycentre as the layer has it. While it is registered the layer hides its own point of it
 * (hiddenSmallBody), so it is never drawn twice. Bodies made this way are released once something else is chosen.
 */
import { AU_KM, J2000_JD } from '../../physics/constants';
import { barycentreFromSun } from '../voyager';
import { getBody, isBody, registerBodies, unregisterBodies, type BodyRecord, type PositionProvider } from '../bodies';
import { ALWAYS, beyondOpenOrbit, openOrbitEnded } from '../bodies/providers/simple';
import { updateEphemeris } from '../ephemeris';
import { gunzipIfNeeded } from '../stars/catalogue';
import { useUI } from '../../state/ui';
import { BARY_MU, conicPosition, ellipticPosition, K_GAUSS, type Conic, type Elliptic } from './conic';
import { FRAME_BARY, GROUPS, GROUP_COLOURS, GROUP_TEXT, parseLabels, SHAPE_ELLIPSE, unquantH, unquantK1, unquantM1, unquantU16, type Label } from './format';
import { ASTEROID_BASE_URL, ensureSection, smallBodies, type LoadedSection } from './load';
import { Vector3 } from 'three';

/** One body of the layer: its section and its place there. */
export interface SmallRef {
  section: number;
  index: number;
}

/** What the layer says of how good the positions are (the layer's card, each body's Sources, docs/data/asteroids.md §5). */
export const KEPLER_NOTE =
  'Position: a simple Kepler orbit from its catalogue epoch (JPL SBDB elements), good to about 0.1° along it within a year of that epoch, a few degrees over a decade and about 10° over three (checked against JPL Horizons); planets’ pulls are left out, so a close pass by one (Apophis by Earth in 2029) throws it off.';

/** JPL's orbit classes in words. */
const CLASS_TEXT: Record<string, string> = {
  IEO: 'Near-Earth asteroid (Atira: inside Earth’s orbit)',
  ATE: 'Near-Earth asteroid (Aten: Earth-crossing)',
  APO: 'Near-Earth asteroid (Apollo: Earth-crossing)',
  AMO: 'Near-Earth asteroid (Amor: just outside Earth’s orbit)',
  MCA: 'Mars-crossing asteroid',
  IMB: 'Inner main-belt asteroid',
  MBA: 'Main-belt asteroid',
  OMB: 'Outer main-belt asteroid',
  TJN: 'Jupiter Trojan',
  CEN: 'Centaur',
  TNO: 'Trans-Neptunian object',
  AST: 'Asteroid on an unusual orbit',
  HYA: 'Asteroid on a hyperbolic orbit',
  PAA: 'Asteroid on a parabolic orbit',
  JFc: 'Jupiter-family comet',
  JFC: 'Jupiter-family comet',
  ETc: 'Encke-type comet',
  CTc: 'Chiron-type comet',
  HTC: 'Halley-type comet',
  COM: 'Long-period comet',
  PAR: 'Comet on a parabolic orbit',
  HYP: 'Comet on a hyperbolic orbit',
};

/** What it is, in words: its class, with the Hildas named (JPL counts them as outer main belt). */
export function classText(group: number, orbitClass: string): string {
  const g = GROUPS[group];
  if (g === 'hilda') return 'Hilda asteroid (3:2 with Jupiter)';
  return CLASS_TEXT[orbitClass] ?? GROUP_TEXT[g];
}

// ─── Labels ──────────────────────────────────────────────────────────────────────────────

const labelFiles = new Map<number, Promise<Label[] | null>>();

/** Section `id`'s labels (fetched once; again later after a failure). */
export function sectionLabels(id: number): Promise<Label[] | null> {
  let p = labelFiles.get(id);
  if (!p) {
    p = fetch(`${ASTEROID_BASE_URL}labels/${id}.txt.gz`)
      .then((r) => {
        if (!r.ok) throw new Error(`labels ${id}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(async (raw) => parseLabels(new TextDecoder().decode(await gunzipIfNeeded(raw))))
      .catch((err) => {
        console.warn('[lightspeed] asteroid labels failed to load', err);
        labelFiles.delete(id);
        return null;
      });
    labelFiles.set(id, p);
  }
  return p;
}

// ─── Elements ────────────────────────────────────────────────────────────────────────────

/** Body `index` of a loaded section, as float64 elements (conic.ts), and its H or M1, K1. */
export function elementsOf(s: LoadedSection, index: number): { orbit: Conic | null; ellipse: Elliptic | null; H: number; M1: number; K1: number } {
  const mu = s.frame === FRAME_BARY ? BARY_MU : 1;
  const c = s.cols;
  const i = unquantU16(c.i[index]) * Math.PI;
  const node = unquantU16(c.node[index]) * 2 * Math.PI;
  const peri = unquantU16(c.peri[index]) * 2 * Math.PI;
  if (s.shape === SHAPE_ELLIPSE) {
    const e = s.cols;
    const ellipse: Elliptic = { a: e.a[index], e: unquantU16(e.e[index]), i, node, peri, M0: unquantU16(e.M[index]) * 2 * Math.PI, mu };
    return { orbit: null, ellipse, H: unquantH(e.H[index], s.hMin, s.hMax), M1: NaN, K1: NaN };
  }
  const k = s.cols;
  const orbit: Conic = { q: k.q[index], e: k.e[index], i, node, peri, tp: k.tp[index], mu };
  return { orbit, ellipse: null, H: NaN, M1: unquantM1(k.M1[index]), K1: unquantK1(k.K1[index]) };
}

const ssbW = new Vector3();
const p = { x: 0, y: 0, z: 0 };

/** A provider for the elements: J2000 ecliptic km from the Sun (the barycentre's offset added for orbits about it). */
function smallBodyProvider(s: LoadedSection, index: number, refEpochJd: number): PositionProvider {
  const el = elementsOf(s, index);
  const bary = s.frame === FRAME_BARY;
  const at = (tt: number, out: { x: number; y: number; z: number }) => {
    const days = tt + J2000_JD - refEpochJd;
    if (el.ellipse) ellipticPosition(el.ellipse, days, out);
    else conicPosition(el.orbit!, days, out);
  };
  // On an open orbit (e ≥ 1) it is followed for a million years either side of now only (OPEN_ORBIT_YEARS).
  const open = !!el.orbit && el.orbit.e >= 1;
  const gone = openOrbitEnded('This body');
  return {
    label: `Kepler orbit from JPL SBDB elements (${bary ? 'about the barycentre' : 'about the Sun'})`,
    availability: (ms) => (open && beyondOpenOrbit(ms) ? gone : ALWAYS.approximate),
    positionAt(time, pos, vel) {
      at(time.tt, p);
      let ox = 0;
      let oy = 0;
      let oz = 0;
      if (bary) {
        // The barycentre from the Sun, world axes (x, z, −y of the ecliptic) back to ecliptic km.
        barycentreFromSun(time, ssbW);
        ox = ssbW.x;
        oy = -ssbW.z;
        oz = ssbW.y;
      }
      pos.x = p.x * AU_KM + ox;
      pos.y = p.y * AU_KM + oy;
      pos.z = p.z * AU_KM + oz;
      if (vel) {
        // Velocity by a central difference over a minute (the barycentre's own motion is left out: centimetres a second).
        const h = 60 / 86_400;
        at(time.tt + h, p);
        const x1 = p.x;
        const y1 = p.y;
        const z1 = p.z;
        at(time.tt - h, p);
        const k = AU_KM / (2 * h * 86_400);
        vel.x = (x1 - p.x) * k;
        vel.y = (y1 - p.y) * k;
        vel.z = (z1 - p.z) * k;
      }
    },
  };
}

// ─── Records ─────────────────────────────────────────────────────────────────────────────

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The registry id a body gets: by number where it has one, else by designation. */
export function smallBodyId(group: number, l: Label): string {
  if (l.number) return `asteroid-${l.number}`;
  return `${GROUPS[group] === 'comet' && /\//.test(l.designation) ? 'comet' : 'asteroid'}-${slug(l.designation)}`;
}

/** "433 Eros", "(495924) 2005 WQ185", "2013 NE69", "C/2020 F3 (NEOWISE)". */
export function smallBodyName(l: Label): string {
  if (!l.number) return l.designation;
  return l.name ? `${l.number} ${l.name}` : `(${l.number}) ${l.designation}`;
}

const fmt = (x: number, digits: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(digits).replace(/\.?0+$/, ''));

/** "16.8 km across (geometric albedo 0.25)", or an estimate from H for the many with no measured size. */
export function sizeLine(l: Label, H: number): string | null {
  if (l.diameterKm) return `${fmt(l.diameterKm, 3)} km across${l.albedo ? ` (geometric albedo ${fmt(l.albedo, 2)})` : ''}.`;
  if (!Number.isFinite(H)) return null;
  // D = 1329 km / √p × 10^(−H/5) (Fowler & Chillemi 1992), with albedos from 0.05 (dark) to 0.25 (bright).
  const d = (pAlb: number) => (1329 / Math.sqrt(pAlb)) * Math.pow(10, -H / 5);
  return `About ${fmt(d(0.25), 2)}–${fmt(d(0.05), 2)} km across (from its brightness, H ${H.toFixed(1)}: its size is not measured).`;
}

/** "a = 2.77 au, e = 0.231, i = 34.9°; once round in 4.61 years", or for an open orbit its perihelion. */
export function orbitLine(el: ReturnType<typeof elementsOf>): string {
  const deg = 180 / Math.PI;
  const e = el.ellipse ? el.ellipse.e : el.orbit!.e;
  const i = (el.ellipse ? el.ellipse.i : el.orbit!.i) * deg;
  const q = el.ellipse ? el.ellipse.a * (1 - el.ellipse.e) : el.orbit!.q;
  if (e >= 1) return `Orbit: perihelion ${fmt(q, 3)} au, e = ${e.toFixed(e < 1.01 ? 5 : 3)}, i = ${i.toFixed(1)}°: an open orbit, never to return.`;
  const a = q / (1 - e);
  const mu = el.ellipse ? el.ellipse.mu : el.orbit!.mu;
  const years = (2 * Math.PI) / ((K_GAUSS * Math.sqrt(mu)) / (a * Math.sqrt(a))) / 365.25;
  const period = years < 2 ? `${fmt(years * 365.25, 3)} days` : `${fmt(years, 3)} years`;
  return `Orbit: a = ${fmt(a, 3)} au, e = ${e.toFixed(3)}, i = ${i.toFixed(1)}°; once round in ${period}.`;
}

/** The registry record for body `index` of section `s`, with its label. */
export function smallBodyRecord(s: LoadedSection, index: number, l: Label, refEpochJd: number): BodyRecord {
  const el = elementsOf(s, index);
  const group = GROUPS[s.group];
  const comet = group === 'comet' && /\//.test(l.designation);
  // Size: measured where SBDB has it; otherwise from H at an albedo of 0.14 (a rough middle), said to be rough.
  const albedo = l.albedo ?? (comet ? 0.04 : 0.14);
  const H = el.H;
  const radiusKm = l.diameterKm ? l.diameterKm / 2 : Number.isFinite(H) ? (1329 / Math.sqrt(albedo)) * Math.pow(10, -H / 5) / 2 : 2;
  const lookup = l.number ? String(l.number) : l.designation.replace(/\s*\(.*\)$/, '');
  const facts = [sizeLine(l, H) ?? (comet ? 'The size of its nucleus is not known (its brightness is mostly its coma’s).' : null), orbitLine(el)].filter((f): f is string => !!f);
  return {
    id: smallBodyId(s.group, l),
    name: smallBodyName(l),
    shortName: l.name ?? undefined,
    aliases: [...new Set([l.number ? String(l.number) : '', l.name ?? '', l.designation])].filter((a) => !!a),
    kind: comet ? 'comet' : 'asteroid',
    kindText: classText(s.group, l.orbitClass),
    parent: 'sun',
    physical: {
      radiusKm: Math.max(radiusKm, 0.005),
      radiusRough: !l.diameterKm,
      geometricAlbedo: albedo,
      colour: GROUP_COLOURS[group],
    },
    // A comet's coma and tails, as strong and long as its magnitude law says (scene/CometTails.tsx).
    visual: comet ? { flat: true, tails: true, tailMagnitudes: { m1: el.M1, k1: el.K1 } } : { flat: true },
    facts,
    factSources: [`https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(lookup)}`],
    factSourceLabels: ['JPL Small-Body Database'],
    dataSource: 'JPL Small-Body Database (orbit, H, size where measured)',
    positionNote: KEPLER_NOTE,
    provider: smallBodyProvider(s, index, refEpochJd),
    orbitLine: { onDemand: true },
    onDemand: true,
    detector: false,
  };
}

// ─── Registering ─────────────────────────────────────────────────────────────────────────

/** The small bodies registered now, by id, and the newest's place (the layer hides its point). */
const registered = new Map<string, SmallRef>();
let newest: SmallRef | null = null;

/** The body of the layer the registry draws for now (the layer leaves its point out), or null. */
export const hiddenSmallBody = (): SmallRef | null => newest;

/** Release the small bodies registered earlier that are neither selected nor in focus. */
function release(keep: string): void {
  const ui = useUI.getState();
  const gone: string[] = [];
  for (const id of registered.keys()) if (id !== keep && id !== ui.selected && id !== ui.focus) gone.push(id);
  if (!gone.length) return;
  for (const id of gone) registered.delete(id);
  unregisterBodies(gone);
}

/**
 * Make body `ref` a body of the registry (loading its section and labels if need be) and return its id, or null
 * when its data cannot be had.
 */
export async function ensureSmallBody(ref: SmallRef): Promise<string | null> {
  const s = await ensureSection(ref.section);
  const labels = await sectionLabels(ref.section);
  const ix = smallBodies.index;
  if (!s || !labels || !ix || ref.index < 0 || ref.index >= s.count) return null;
  const l = labels[ref.index];
  const group = s.group;
  const id = smallBodyId(group, l);
  if (isBody(id)) {
    newest = registered.get(id) ?? newest;
    return id;
  }
  if (getBody(id)) return null; // some other body has the id
  registerBodies([smallBodyRecord(s, ref.index, l, ix.refEpochJd)]);
  // Place it now, so the camera can go there this frame.
  updateEphemeris();
  registered.set(id, ref);
  newest = ref;
  release(id);
  return id;
}
