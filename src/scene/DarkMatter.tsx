/**
 * The dark-matter layer (sim/galaxy/darkLayer.ts decides what shows; materials: render/darkMatterMaterials.ts), a chunk of
 * its own mounted once View › Dark matter is first turned on (App.tsx):
 *  - The Milky Way's dark halo (McMillan 2017's NFW halo, cut off at r_200 = 224 kpc): its projected density as a faint
 *    cool fog, seen from outside the disc.
 *  - Tracer stars on four spokes from 2 to 30 kpc, each going round at the model's circular speed (gold) and, beside it,
 *    at the speed the stars and gas alone would give (grey): time winds the spokes, the grey ones falling behind.
 *  - The Bullet Cluster's hot gas (Chandra's X-ray image) and its lensing mass (a model of Clowe et al.'s 2006 map), as a
 *    card on the sky at the cluster.
 * Nothing is drawn (no mesh even visible) while its share is 0; the halo is one bounding sphere, so its cost is the pixels
 * it covers (docs/data/dark-matter.md §5).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DataUtils,
  DynamicDrawUsage,
  HalfFloatType,
  LinearFilter,
  type LineSegments,
  Matrix4,
  type Mesh,
  PlaneGeometry,
  type Points,
  RedFormat,
  Sphere,
  SphereGeometry,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { KPC_KM } from '../physics/constants';
import { createBulletMaterial, createHaloMaterial, createTracerMaterials, fillHaloTable, HALO_TABLE_SIZE } from '../render/darkMatterMaterials';
import { acquireTexture, releaseTexture } from '../render/textures';
import { DARK_COLOURS, darkLayer, tracerMyr } from '../sim/galaxy/darkLayer';
import { haloColumn, haloRadius, makeTracers, SPOKES, tracerAt, TRACERS_PER_SPOKE, type Tracers } from '../sim/galaxy/darkMatter';
import { GAL_TO_G_ROT, GAL_TO_WORLD, type Vec3 } from '../sim/galaxy/frames';
import { SGR_A_ID } from '../sim/galaxy/records';
import { BULLET_CENTRE, BULLET_KPC_PER_ARCSEC, BULLET_XRAY, KAPPA_CONTOURS, KAPPA_CORE_ARCSEC, kappaPeaks } from '../sim/cosmos/bulletCluster';
import { skyDirectionWorld } from '../sim/cosmos/frames';
import { sim } from '../sim/sim';

/** The colours of the two sets of tracers (and of the curves in the layer's chart, ui/viewport/DarkMatterChart.tsx). */
const WITH_HALO_COLOUR = new Color(...DARK_COLOURS.withHalo);
const VISIBLE_ONLY_COLOUR = new Color(...DARK_COLOURS.visibleOnly);

const SPHERE = new SphereGeometry(1, 48, 24);
const QUAD = new PlaneGeometry(1, 1);

// ─── The halo ──────────────────────────────────────────────────────────────────────────

/** The halo is cut off at r_200 (McMillan's virial radius): about 224 kpc. */
const R200 = haloRadius(200);
/**
 * Its display scale: Σ0 = 10 M☉/pc² (about the column 100 kpc from the centre); the brightest shown, at 1, is
 * 600 M☉/pc² (the column 1 kpc from the centre): 1 / ln(61).
 */
const SIGMA0 = 10;
const NORM = 1 / Math.log(61);

function Halo() {
  const table = useMemo(() => {
    // Half floats: filterable wherever WebGL2 runs (full floats need an extension).
    const t = new DataTexture(new Uint16Array(HALO_TABLE_SIZE), HALO_TABLE_SIZE, 1, RedFormat, HalfFloatType);
    t.minFilter = t.magFilter = LinearFilter;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    return t;
  }, []);
  const material = useMemo(() => createHaloMaterial(table), [table]);
  useEffect(
    () => () => {
      material.dispose();
      table.dispose();
    },
    [material, table],
  );
  const mesh = useRef<Mesh>(null);
  /** The camera's distance from the centre the table was last worked out for, kpc. */
  const tableFor = useRef(-1);
  const scratch = useMemo(() => new Float32Array(HALO_TABLE_SIZE), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const sgr = sim.bodies[SGR_A_ID];
    const on = darkLayer.halo > 0 && !!sgr?.present;
    m.visible = on;
    if (!on) return;
    m.position.copy(sgr.pos).sub(sim.camera.pos);
    m.scale.setScalar(R200 * KPC_KM);
    const d = m.position.length() / KPC_KM;
    material.uniforms.uCentreDir.value.copy(m.position).normalize();
    // The table, when the distance has changed by more than 0.2 % (about 0.1 ms: 256 columns).
    if (Math.abs(d - tableFor.current) > 0.002 * d) {
      fillHaloTable(scratch, d, R200, haloColumn, SIGMA0, NORM);
      const data = table.image.data as Uint16Array;
      for (let i = 0; i < HALO_TABLE_SIZE; i++) data[i] = DataUtils.toHalfFloat(scratch[i]);
      table.needsUpdate = true;
      tableFor.current = d;
    }
    material.uniforms.uOpacity.value = darkLayer.halo;
  });
  return (
    <mesh
      ref={(o) => {
        mesh.current = o;
        darkLayer.meshes.halo = o;
      }}
      geometry={SPHERE}
      material={material}
      frustumCulled={false}
      renderOrder={-80}
      visible={false}
    />
  );
}

// ─── The tracers ───────────────────────────────────────────────────────────────────────

const N = SPOKES * TRACERS_PER_SPOKE;

/**
 * A place in frame G (kpc) as an offset from the Galaxy's centre, Sgr A* (frame G's origin), in world axes: x_gal =
 * R^T (x_G − sun), so the offset from the centre is R^T x_G, then turned into world axes.
 */
const toWorld = (d: Vec3, out: Vector3): Vector3 => {
  const R = GAL_TO_G_ROT;
  const x = R[0][0] * d[0] + R[1][0] * d[1] + R[2][0] * d[2];
  const y = R[0][1] * d[0] + R[1][1] * d[1] + R[2][1] * d[2];
  const z = R[0][2] * d[0] + R[1][2] * d[1] + R[2][2] * d[2];
  const W = GAL_TO_WORLD;
  return out.set(W[0][0] * x + W[0][1] * y + W[0][2] * z, W[1][0] * x + W[1][1] * y + W[1][2] * z, W[2][0] * x + W[2][1] * y + W[2][2] * z);
};

interface TracerSet {
  points: BufferGeometry;
  lines: BufferGeometry;
}

function makeSet(): TracerSet {
  const points = new BufferGeometry();
  points.setAttribute('position', new BufferAttribute(new Float32Array(3 * N), 3).setUsage(DynamicDrawUsage));
  points.boundingSphere = new Sphere(new Vector3(), Infinity);
  // Each spoke a polyline outwards: segments (first, second), (second, third) … (a segment whose ends
  // have drifted far apart in azimuth is left out: fill).
  const lines = new BufferGeometry();
  lines.setAttribute('position', new BufferAttribute(new Float32Array(3 * 2 * N), 3).setUsage(DynamicDrawUsage));
  lines.boundingSphere = new Sphere(new Vector3(), Infinity);
  return { points, lines };
}

const g: Vec3 = [0, 0, 0];
const w = new Vector3();
const prev = new Vector3();
/** Neighbours on a spoke further apart than this in azimuth (rad) are not joined: the inner spokes wind into dots. */
const JOIN_RAD = 0.35;

function fill(set: TracerSet, t: Tracers, myr: number, all: boolean, origin: Vector3): void {
  const p = set.points.attributes.position as BufferAttribute;
  const l = set.lines.attributes.position as BufferAttribute;
  // Placed about Sgr A*'s body (`origin`: from the camera, km).
  for (let s = 0; s < SPOKES; s++) {
    prev.copy(origin);
    let prevBeta = NaN;
    for (let j = 0; j < TRACERS_PER_SPOKE; j++) {
      const i = s * TRACERS_PER_SPOKE + j;
      tracerAt(t, i, myr, all, g);
      toWorld(g, w).multiplyScalar(KPC_KM).add(origin);
      p.setXYZ(i, w.x, w.y, w.z);
      const beta = Math.atan2(g[1], -g[0]);
      let d = Math.abs(beta - prevBeta) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      // Between neighbours still close in azimuth; otherwise a segment of no length.
      const join = j > 0 && d < JOIN_RAD;
      const a = join ? prev : w;
      l.setXYZ(2 * i, a.x, a.y, a.z);
      l.setXYZ(2 * i + 1, w.x, w.y, w.z);
      prev.copy(w);
      prevBeta = beta;
    }
  }
  p.needsUpdate = true;
  l.needsUpdate = true;
}

function TracerSets() {
  const tracers = useMemo(makeTracers, []);
  const sets = useMemo(() => ({ all: makeSet(), visible: makeSet() }), []);
  const mats = useMemo(() => ({ all: createTracerMaterials(WITH_HALO_COLOUR), visible: createTracerMaterials(VISIBLE_ONLY_COLOUR) }), []);
  useEffect(
    () => () => {
      for (const s of [sets.all, sets.visible]) {
        s.points.dispose();
        s.lines.dispose();
      }
      for (const m of [mats.all, mats.visible]) {
        m.points.dispose();
        m.lines.dispose();
      }
    },
    [sets, mats],
  );
  const refs = useRef<(Points | LineSegments | null)[]>([]);
  const origin = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const sgr = sim.bodies[SGR_A_ID];
    const on = darkLayer.tracers > 0 && !!sgr?.present;
    for (const o of refs.current) if (o) o.visible = on;
    if (!on) return;
    origin.copy(sgr.pos).sub(sim.camera.pos);
    const myr = tracerMyr();
    fill(sets.all, tracers, myr, true, origin);
    fill(sets.visible, tracers, myr, false, origin);
    const a = darkLayer.tracers;
    mats.all.points.uniforms.uOpacity.value = 0.85 * a;
    mats.visible.points.uniforms.uOpacity.value = 0.45 * a;
    mats.all.lines.uniforms.uOpacity.value = 0.2 * a;
    mats.visible.lines.uniforms.uOpacity.value = 0.1 * a;
    const px = Math.max(2.5, Math.min(4, (3 * sim.viewport.height) / 900)) * window.devicePixelRatio;
    mats.all.points.uniforms.uSize.value = 1.25 * px;
    mats.visible.points.uniforms.uSize.value = px;
  });
  const keep = (k: number) => (o: Points | LineSegments | null) => {
    refs.current[k] = o;
  };
  return (
    <>
      <lineSegments ref={keep(0)} geometry={sets.visible.lines} material={mats.visible.lines} frustumCulled={false} renderOrder={-70} visible={false} />
      <lineSegments ref={keep(1)} geometry={sets.all.lines} material={mats.all.lines} frustumCulled={false} renderOrder={-70} visible={false} />
      <points ref={keep(2)} geometry={sets.visible.points} material={mats.visible.points} frustumCulled={false} renderOrder={-69} visible={false} />
      <points ref={keep(3)} geometry={sets.all.points} material={mats.all.points} frustumCulled={false} renderOrder={-69} visible={false} />
    </>
  );
}

// ─── The Bullet Cluster ────────────────────────────────────────────────────────────────

const BULLET_ID = 'bullet-cluster';
/** The sky's east and north at the cluster, world axes. */
const EAST = new Vector3(...skyDirectionWorld(BULLET_CENTRE.raDeg, BULLET_CENTRE.decDeg, 90));
const NORTH = new Vector3(...skyDirectionWorld(BULLET_CENTRE.raDeg, BULLET_CENTRE.decDeg, 0));
const KM_PER_ARCSEC = BULLET_KPC_PER_ARCSEC * KPC_KM;

function BulletCluster() {
  const [xray, setXray] = useState<Texture | null>(null);
  // The X-ray picture is fetched the first time the card would show (the cluster near and the switch on).
  const [wanted, setWanted] = useState(false);
  useFrame(() => {
    if (!wanted && darkLayer.bullet > 0) setWanted(true);
  });
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void acquireTexture(BULLET_XRAY.file).then((t) => {
      if (live && t) setXray(t);
    });
    return () => {
      live = false;
      releaseTexture(BULLET_XRAY.file);
    };
  }, [wanted]);
  const size = useMemo(() => new Vector2(BULLET_XRAY.widthPx * BULLET_XRAY.arcsecPerPx, BULLET_XRAY.heightPx * BULLET_XRAY.arcsecPerPx), []);
  const material = useMemo(() => {
    if (!xray) return null;
    const [a, b] = kappaPeaks();
    return createBulletMaterial(xray, {
      centre: new Vector2(...BULLET_XRAY.centre),
      size,
      peaks: [new Vector4(a.at[0], a.at[1], a.amplitude, KAPPA_CORE_ARCSEC), new Vector4(b.at[0], b.at[1], b.amplitude, KAPPA_CORE_ARCSEC)],
      contours: new Vector2(KAPPA_CONTOURS.first, KAPPA_CONTOURS.step),
    });
  }, [xray, size]);
  useEffect(() => () => material?.dispose(), [material]);
  const mesh = useRef<Mesh>(null);
  const basis = useMemo(() => new Matrix4(), []);
  const xAxis = useMemo(() => new Vector3(), []);
  const yAxis = useMemo(() => new Vector3(), []);
  const zAxis = useMemo(() => new Vector3(), []);
  const at = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m || !material) return;
    const b = sim.bodies[BULLET_ID];
    const on = darkLayer.bullet > 0 && !!b?.present;
    m.visible = on;
    if (!on) return;
    // The card in the sky's plane at the cluster: its x towards the west (u = 0 at the east edge), y north.
    const [ce, cn] = BULLET_XRAY.centre;
    at.copy(b.apparentPos).sub(sim.camera.pos).addScaledVector(EAST, ce * KM_PER_ARCSEC).addScaledVector(NORTH, cn * KM_PER_ARCSEC);
    xAxis.copy(EAST).multiplyScalar(-size.x * KM_PER_ARCSEC);
    yAxis.copy(NORTH).multiplyScalar(size.y * KM_PER_ARCSEC);
    zAxis.crossVectors(EAST, NORTH).negate();
    basis.makeBasis(xAxis, yAxis, zAxis).setPosition(at);
    m.matrix.copy(basis);
    m.matrixWorldNeedsUpdate = true;
    material.uniforms.uOpacity.value = darkLayer.bullet;
  });
  if (!material) return null;
  return (
    <mesh
      ref={(o) => {
        mesh.current = o;
        darkLayer.meshes.bullet = o;
      }}
      geometry={QUAD}
      material={material}
      frustumCulled={false}
      matrixAutoUpdate={false}
      renderOrder={-60}
      visible={false}
    />
  );
}

export default function DarkMatter() {
  return (
    <>
      <Halo />
      <TracerSets />
      <BulletCluster />
    </>
  );
}

