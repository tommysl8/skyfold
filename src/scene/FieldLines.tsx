/**
 * Magnetic field lines (View › Magnetic field lines; docs/data/fields.md), a chunk of its own mounted while the view
 * is on (App.tsx): the Sun's and the planets' measured fields (sim/fields/), traced in a worker (sim/fields/worker.ts)
 * when a body is first near enough to show them, and drawn as glowing lines turned with the body
 * (render/fieldLineMaterials.ts).
 *
 *  - A planet's lines (and Ganymede's) show once its magnetopause's stand-off is 10 px across the screen and are full
 *    at 40. Its lines are cut where they leave the magnetopause, the shape facing the Sun (Ganymede's facing the
 *    plasma that overtakes it), whenever the Sun's direction in the planet's frame has moved by 0.3° (a pass over its
 *    vertices; nothing allocated): a closed line that leaves it is drawn from both its feet up to the boundary. Earth's are traced again for each half year of the date (IGRF-14).
 *  - The Sun's: the potential field of the Carrington rotation of the date (its map fetched once, 120 kB) out to the
 *    source surface, shown once the Sun is a few pixels across; the Parker spirals and the current sheet out to 3 au,
 *    while that reach is 20 px or more across, from within 0.3 au of the Sun or from 4 to 60 au (among the inner
 *    planets their lines would only cross the view).
 *
 * Guides, not light: drawn in the classical view (GUIDES_LAYER), as the orbit lines are. Cost: one draw of line
 * segments per body shown (15,000–25,000 vertices each, the Sun's about 40,000); measured in docs/data/fields.md §6.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, LineSegments, Quaternion, Vector3, type ShaderMaterial } from 'three';
import { AU_KM, SUN_RADIUS_KM } from '../physics/constants';
import { createFieldLinesMaterial } from '../render/fieldLineMaterials';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { assetUrl } from '../render/textures';
import { sim } from '../sim/sim';
import { fieldLinesDebug } from '../sim/fields';
import { FIELD_MODELS, type FieldModel } from '../sim/fields/models';
import { MagnetopauseTest, standoff } from '../sim/fields/magnetopause';
import { CLOSED, OPEN, SHEET, SOURCE_SURFACE, SPIRAL, SPIRAL_END_RSUN, type LineSet } from '../sim/fields/lines';
import { parseSunRotations, rotationAt, type SunRotations } from '../sim/fields/sun';
import type { FieldWorkerReply, FieldWorkerRequest } from '../sim/fields/worker';

// ─── The worker ───────────────────────────────────────────────────────────────────────

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (s: LineSet | null) => void>();

type Ask = { kind: 'planet'; body: string; year: number } | { kind: 'sun'; degree: number; coeffs: Float32Array };

function trace(q: Ask): Promise<LineSet | null> {
  if (!worker) {
    worker = new Worker(new URL('../sim/fields/worker.ts', import.meta.url), { type: 'module', name: 'field-lines' });
    worker.onmessage = (e: MessageEvent<FieldWorkerReply>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (e.data.error) console.warn('[field lines]', e.data.error);
      done?.(e.data.set);
    };
  }
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker!.postMessage({ id, ...q } as FieldWorkerRequest);
  });
}

/** Line sets traced so far (kept while the page lives, so turning the view off and on again is instant). */
const traced = new Map<string, LineSet>();
const tracing = new Set<string>();

function want(key: string, q: () => Ask): LineSet | null {
  const s = traced.get(key);
  if (s || tracing.has(key)) return s ?? null;
  tracing.add(key);
  void trace(q()).then((set) => {
    tracing.delete(key);
    if (set) traced.set(key, set);
  });
  return null;
}

let sunData: Promise<SunRotations | null> | null = null;
let sunRotations: SunRotations | null = null;
function loadSun(): SunRotations | null {
  sunData ??= fetch(assetUrl('data/fields/sun-hmi-pfss.bin'))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
    .then((b) => (sunRotations = parseSunRotations(b)))
    .catch((err) => {
      console.warn('[field lines] the Sun’s map did not load', err);
      return null;
    });
  return sunRotations;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────────────

const KIND_VIS = { [CLOSED]: 1, [OPEN]: 2, [SPIRAL]: 2, [SHEET]: 3 } as Record<number, number>;

/** A line set's geometry: positions, (phase, along, polarity), whether each vertex is drawn, and the segments. */
function geometryOf(s: LineSet): BufferGeometry {
  const n = s.positions.length / 3;
  const data = new Float32Array(3 * n);
  const vis = new Float32Array(n);
  let segs = 0;
  for (let l = 0; l < s.count; l++) {
    const a = s.starts[l];
    const b = s.starts[l + 1];
    segs += b - a - 1;
    for (let i = a; i < b; i++) {
      data[3 * i] = s.phase[i];
      data[3 * i + 1] = s.along[i];
      data[3 * i + 2] = s.polarity[l];
      vis[i] = KIND_VIS[s.kind[l]];
    }
  }
  const index = n > 65535 ? new Uint32Array(2 * segs) : new Uint16Array(2 * segs);
  let k = 0;
  for (let l = 0; l < s.count; l++)
    for (let i = s.starts[l]; i < s.starts[l + 1] - 1; i++) {
      index[k++] = i;
      index[k++] = i + 1;
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(s.positions, 3));
  g.setAttribute('aData', new BufferAttribute(data, 3));
  g.setAttribute('aVis', new Float32BufferAttribute(vis, 1));
  g.setIndex(new BufferAttribute(index, 1));
  return g;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Pixels per km at a distance (the camera's vertical field). */
const pxPerKm = (dist: number) => sim.viewport.height / 2 / Math.tan((sim.camera.fovDeg * Math.PI) / 360) / Math.max(dist, 1e-9);

const yearOf = (ms: number) => 1970 + ms / (365.2425 * 86_400_000);

interface Drawn {
  key: string;
  set: LineSet;
  geometry: BufferGeometry;
}

/** A line mesh that swaps its geometry for a new set (and disposes the old). */
function useLineMesh(): { mesh: LineSegments; material: ShaderMaterial; drawn: { current: Drawn | null }; show: (key: string, set: LineSet) => Drawn } {
  const material = useMemo(() => createFieldLinesMaterial(), []);
  const mesh = useMemo(() => {
    const m = new LineSegments(new BufferGeometry(), material);
    m.frustumCulled = false;
    m.visible = false;
    m.renderOrder = 3;
    m.layers.set(GUIDES_LAYER);
    return m;
  }, [material]);
  const drawn = useRef<Drawn | null>(null);
  useEffect(
    () => () => {
      drawn.current?.geometry.dispose();
      material.dispose();
    },
    [material],
  );
  const show = (key: string, set: LineSet): Drawn => {
    drawn.current?.geometry.dispose();
    const geometry = geometryOf(set);
    mesh.geometry = geometry;
    drawn.current = { key, set, geometry };
    return drawn.current;
  };
  return { mesh, material, drawn, show };
}

// ─── A planet ─────────────────────────────────────────────────────────────────────────

const toCam = new Vector3();
const nose = new Vector3();
const inv = new Quaternion();
const UP = new Vector3(0, 1, 0);
const ax = new Vector3();
const ay = new Vector3();
const az = new Vector3();

/** Cut a planet's lines at its magnetopause, the boundary's nose along `n` (body frame): rewrites aVis. */
function cut(d: Drawn, test: MagnetopauseTest, n: Vector3): void {
  const s = d.set;
  const p = s.positions;
  ax.copy(n);
  az.copy(UP).addScaledVector(ax, -UP.dot(ax));
  if (az.lengthSq() < 1e-9) az.set(1, 0, 0).addScaledVector(ax, -ax.x);
  az.normalize();
  ay.crossVectors(az, ax);
  const vis = d.geometry.getAttribute('aVis') as BufferAttribute;
  const v = vis.array as Float32Array;
  const inside = (i: number) => {
    const x = p[3 * i];
    const y = p[3 * i + 1];
    const z = p[3 * i + 2];
    return test.inside(x * ax.x + y * ax.y + z * ax.z, x * ay.x + y * ay.y + z * ay.z, x * az.x + y * az.y + z * az.z);
  };
  for (let l = 0; l < s.count; l++) {
    const a = s.starts[l];
    const b = s.starts[l + 1];
    let out = a;
    while (out < b && inside(out)) out++;
    if (out === b && s.kind[l] === CLOSED) {
      for (let i = a; i < b; i++) v[i] = 1;
      continue;
    }
    // Cut: drawn open from its first foot to where it first leaves, and (a closed line) from where it last comes back
    // to its other foot, coloured by that foot's polarity (4).
    let back = b;
    if (s.kind[l] === CLOSED) while (back > out + 1 && inside(back - 1)) back--;
    for (let i = a; i < b; i++) v[i] = i < out ? 2 : i >= back ? 4 : 0;
  }
  vis.needsUpdate = true;
}

function PlanetField({ model }: { model: FieldModel }) {
  const { mesh, material, drawn, show } = useLineMesh();
  fieldLinesDebug.meshes[model.id] = mesh;
  const test = useMemo(() => new MagnetopauseTest(model.magnetopause, model.limit), [model]);
  const reach = useMemo(() => standoff(model.magnetopause), [model]);
  const last = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const b = sim.bodies[model.id];
    const sun = sim.bodies.sun;
    if (!b?.present || !sun) {
      mesh.visible = false;
      return;
    }
    toCam.copy(b.apparentPos).sub(sim.camera.pos);
    const dist = toCam.length();
    const opacity = smooth(10, 40, reach * model.radiusKm * pxPerKm(dist));
    if (opacity <= 0) {
      mesh.visible = false;
      return;
    }
    const year = yearOf(sim.timeMs);
    const key = model.id === 'earth' ? `earth:${Math.round(Math.min(2030, Math.max(1900, year)) * 2) / 2}` : model.id;
    let d = drawn.current;
    if (d?.key !== key) {
      const set = want(key, () => ({ kind: 'planet', body: model.id, year: model.id === 'earth' ? Number(key.split(':')[1]) : year }));
      if (set) {
        d = show(key, set);
        last.set(0, 0, 0);
      }
    }
    if (!d) {
      mesh.visible = false;
      return;
    }
    if (model.noseBody) nose.set(model.noseBody[0], model.noseBody[1], model.noseBody[2]);
    else nose.copy(sun.apparentPos).sub(b.apparentPos).normalize().applyQuaternion(inv.copy(b.apparentQuat).invert());
    if (nose.dot(last) < Math.cos((0.3 * Math.PI) / 180)) {
      cut(d, test, nose);
      last.copy(nose);
    }
    mesh.position.copy(toCam);
    mesh.quaternion.copy(b.apparentQuat);
    mesh.scale.setScalar(model.radiusKm);
    const u = material.uniforms;
    u.uOpacity.value = opacity;
    u.uUnitKm.value = model.radiusKm;
    u.uTime.value = (performance.now() / 1000) % 10_000;
    mesh.visible = true;
  });
  return <primitive object={mesh} />;
}

// ─── The Sun ──────────────────────────────────────────────────────────────────────────

function SunField() {
  const { mesh, material, drawn, show } = useLineMesh();
  fieldLinesDebug.meshes.sun = mesh;
  useFrame(() => {
    const b = sim.bodies.sun;
    if (!b?.present) {
      mesh.visible = false;
      return;
    }
    toCam.copy(b.apparentPos).sub(sim.camera.pos);
    const dist = toCam.length();
    const k = pxPerKm(dist);
    const near = smooth(2, 10, SUN_RADIUS_KM * k);
    // The spirals pass the inner planets: from among them their lines would only cross the view. They show near the Sun
    // (within 0.3 au) and from beyond 4 au, where the pattern is seen whole.
    const where = Math.max(1 - smooth(0.15 * AU_KM, 0.3 * AU_KM, dist), smooth(3 * AU_KM, 5 * AU_KM, dist));
    const far = where * smooth(20, 80, 3 * AU_KM * k) * (1 - smooth(30 * AU_KM, 60 * AU_KM, dist));
    if (near <= 0 && far <= 0) {
      mesh.visible = false;
      return;
    }
    const data = loadSun();
    if (!data) {
      mesh.visible = false;
      return;
    }
    const at = rotationAt(data, sim.timeMs);
    const key = `sun:${data.rotation[at.index]}`;
    let d = drawn.current;
    if (d?.key !== key) {
      const set = want(key, () => ({ kind: 'sun', degree: data.degree, coeffs: data.coeffs[at.index].slice() }));
      if (set) d = show(key, set);
    }
    if (!d) {
      mesh.visible = false;
      return;
    }
    mesh.position.copy(toCam);
    mesh.quaternion.copy(b.apparentQuat);
    mesh.scale.setScalar(SUN_RADIUS_KM);
    const u = material.uniforms;
    u.uOpacity.value = 1;
    u.uNearOpacity.value = near;
    u.uFarOpacity.value = far;
    u.uFarFrom.value = SOURCE_SURFACE * 1.0001;
    // Seen from near the Sun, the spirals are drawn out to three times the camera's distance (beyond, their lines would
    // only run off to vanishing points across the view); from afar, to 3 au.
    u.uFarEnd.value = Math.min(SPIRAL_END_RSUN, (3 * dist) / SUN_RADIUS_KM);
    u.uUnitKm.value = SUN_RADIUS_KM;
    u.uTime.value = (performance.now() / 1000) % 10_000;
    mesh.visible = true;
  });
  return <primitive object={mesh} />;
}

// For the development tools: window.__fieldLines.meshes.
if (import.meta.env.DEV) Object.assign(window, { __fieldLines: fieldLinesDebug });

/** The field lines of every body with a model. */
export default function FieldLines() {
  return (
    <>
      <SunField />
      {FIELD_MODELS.map((m) => (
        <PlanetField key={m.id} model={m} />
      ))}
    </>
  );
}
