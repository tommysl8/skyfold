/**
 * The deep-sky catalogues' markers (sim/deepsky): one draw each for the NGC/IC clusters and nebulae, the supernova
 * remnants and the pulsars (shaders/deepSkyMarker.vert.glsl), the NGC/IC galaxies (deepSkyGalaxy.vert.glsl) and the
 * gravitational-wave events (gwRegion.vert.glsl). Faint guides that fade by distance and size (sim/deepsky/markers.ts),
 * each catalogue eased in and out with its View menu setting (ui/deepSkyLayers.ts), and none drawn while a black hole's
 * lens is (its images are the stars' and the galaxies', not a map's). The selected object's marker always shows.
 *
 * A chunk of its own (App.tsx mounts it once a catalogue is first wanted), with the catalogues' runtime.
 * Cost: a few thousand points at most, each culled in the vertex shader unless near or big enough; the regions'
 * discs are kept under 250 px across.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Group, Matrix3, Points, Scene, Sphere, Vector3, type PerspectiveCamera, type ShaderMaterial } from 'three';
import { MPC_KM, PARSEC_KM } from '../physics/constants';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { lensDrawn } from '../render/lensVariants';
import { updateSkyUniforms, withEmission } from '../render/materials';
import {
  createDeepSkyGalaxyMaterial,
  createDeepSkyMarkerMaterial,
  createGwRegionMaterial,
  DEEP_SKY_GALAXY_VERT,
  GW_REGION_VERT,
  MARKER_OPACITY,
} from '../render/deepSkyMaterials';
import { deepSkyGate, deepSkyVersion, subscribeDeepSky, type DeepSkySetId } from '../sim/deepsky';
import { deepSky, type LoadedSet } from '../sim/deepsky/runtime';
import { REGION_SPRITES } from '../sim/deepsky/markers';
import { GAL_TO_WORLD, WORLD_TO_GAL } from '../sim/galaxy/frames';
import { cosmicSky } from '../sim/cosmos/expansion';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { PulsarModel, pulsarShown } from './PulsarModel';
import { remnantShown } from '../sim/phenomena';

const camGal = new Vector3();
const camMpc = new Vector3();
const selRel = new Vector3();
const galToWorld = new Matrix3().set(...(GAL_TO_WORLD.flat() as [number, number, number, number, number, number, number, number, number]));

/** Galactic catalogues: positions are heliocentric galactic pc. */
function galacticGeometry(set: LoadedSet): BufferGeometry {
  const g = set.galactic!;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(g.galPc, 3));
  geo.setAttribute('aRadius', new BufferAttribute(g.radiusPc, 1));
  geo.setAttribute('aStyle', new BufferAttribute(new Float32Array(g.style), 1));
  geo.setAttribute('aPulse', new BufferAttribute(g.pulseS, 1));
  geo.boundingSphere = new Sphere(new Vector3(), Infinity);
  return geo;
}

function galaxyGeometry(set: LoadedSet): BufferGeometry {
  const x = set.extragalactic!;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(x.posMpc), 3));
  geo.setAttribute('aAnchor', new BufferAttribute(new Float32Array(x.anchorMpc), 3));
  geo.setAttribute('aRadius', new BufferAttribute(x.size, 1));
  geo.boundingSphere = new Sphere(new Vector3(), Infinity);
  return geo;
}

/** A merger's REGION_SPRITES discs: its direction, where along its distance range each sits, the range and its sky radius. */
function regionGeometry(set: LoadedSet): BufferGeometry {
  const x = set.extragalactic!;
  const n = x.count * REGION_SPRITES;
  const dir = new Float32Array(3 * n);
  const t = new Float32Array(n);
  const range = new Float32Array(2 * n);
  const theta = new Float32Array(n);
  const kind = new Float32Array(n);
  for (let i = 0; i < x.count; i++) {
    const px = x.posMpc[3 * i];
    const py = x.posMpc[3 * i + 1];
    const pz = x.posMpc[3 * i + 2];
    const d = Math.hypot(px, py, pz);
    const k = x.kind[i];
    for (let s = 0; s < REGION_SPRITES; s++) {
      const v = i * REGION_SPRITES + s;
      dir[3 * v] = px / d;
      dir[3 * v + 1] = py / d;
      dir[3 * v + 2] = pz / d;
      t[v] = s / (REGION_SPRITES - 1);
      range[2 * v] = x.nearMpc[i];
      range[2 * v + 1] = x.farMpc[i];
      theta[v] = x.size[i];
      kind[v] = k;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(dir, 3));
  geo.setAttribute('aT', new BufferAttribute(t, 1));
  geo.setAttribute('aRange', new BufferAttribute(range, 2));
  geo.setAttribute('aTheta', new BufferAttribute(theta, 1));
  geo.setAttribute('aKind', new BufferAttribute(kind, 1));
  geo.boundingSphere = new Sphere(new Vector3(), Infinity);
  return geo;
}

/** Each catalogue's layer: which View menu setting shows it. */
const shownNow = (id: DeepSkySetId): boolean => {
  const s = deepSkyGate.shown;
  return id === 'pulsars' ? s.pulsars : id === 'gw-events' ? s.gw : id === 'ngc-galaxies' ? s.ngcGalaxies : s.ngc;
};

interface Layer {
  id: DeepSkySetId;
  geometry: BufferGeometry;
  material: ShaderMaterial;
  points: Points;
  /** The unprocessed vertex shader of an extragalactic layer (the emission lookup goes in). */
  vert?: string;
}

function makeLayer(set: LoadedSet): Layer {
  let geometry: BufferGeometry;
  let material: ShaderMaterial;
  let vert: string | undefined;
  if (set.galactic) {
    geometry = galacticGeometry(set);
    material = createDeepSkyMarkerMaterial();
    material.uniforms.uGalToWorld.value.copy(galToWorld);
  } else if (set.id === 'ngc-galaxies') {
    geometry = galaxyGeometry(set);
    material = createDeepSkyGalaxyMaterial();
    vert = DEEP_SKY_GALAXY_VERT;
  } else {
    geometry = regionGeometry(set);
    material = createGwRegionMaterial(REGION_SPRITES);
    vert = GW_REGION_VERT;
  }
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.layers.set(POINTS_LAYER);
  // Over the stars and the web, under the bodies (the planet-host rings are at −97).
  points.renderOrder = set.id === 'gw-events' ? -96 : -93;
  points.visible = false;
  return { id: set.id, geometry, material, points, vert };
}

export default function DeepSky() {
  const version = useSyncExternalStore(subscribeDeepSky, deepSkyVersion);
  const group = useRef<Group | null>(null);
  const layers = useRef(new Map<DeepSkySetId, Layer>());
  const compiled = useRef(new Set<DeepSkySetId>());

  // A layer for each catalogue as it arrives.
  const sets = useMemo(() => [...deepSky.sets.values()], [version]);
  useEffect(() => {
    for (const set of sets) {
      if (layers.current.has(set.id)) continue;
      const l = makeLayer(set);
      layers.current.set(set.id, l);
      group.current?.add(l.points);
    }
  }, [sets]);
  useEffect(
    () => () => {
      for (const l of layers.current.values()) {
        l.geometry.dispose();
        l.material.dispose();
      }
      layers.current.clear();
    },
    [],
  );

  useFrame(({ gl, camera }, dt) => {
    if (!layers.current.size) return;
    const cam = camera as PerspectiveCamera;
    const pxPerRad = sim.viewport.height / 2 / Math.tan((cam.fov * Math.PI) / 360);
    const lens = lensDrawn();
    const selected = useUI.getState().selected;
    // The camera in each frame: heliocentric galactic pc, and world Mpc (hi + lo).
    const p = sim.camera.pos;
    const w = WORLD_TO_GAL;
    camGal.set(w[0][0] * p.x + w[0][1] * p.y + w[0][2] * p.z, w[1][0] * p.x + w[1][1] * p.y + w[1][2] * p.z, w[2][0] * p.x + w[2][1] * p.y + w[2][2] * p.z).divideScalar(PARSEC_KM);
    camMpc.copy(p).divideScalar(MPC_KM);
    let skyUpdated = false;
    for (const l of layers.current.values()) {
      const u = l.material.uniforms;
      const want = shownNow(l.id) && !lens && (l.vert ? cosmicSky.galaxiesShown : true) ? MARKER_OPACITY : 0;
      // Eased in and out over a third of a second.
      u.uOpacity.value += (want - u.uOpacity.value) * Math.min(1, dt * 3);
      if (Math.abs(want - u.uOpacity.value) < 0.002) u.uOpacity.value = want;
      l.points.visible = u.uOpacity.value > 0.002;
      if (!l.points.visible) continue;
      const set = deepSky.sets.get(l.id)!;
      u.uPxPerRad.value = pxPerRad;
      u.uSelected.value = selected ? (set.indexById.get(selected) ?? -1) : -1;
      if (u.uHidden) {
        const h = l.id === 'pulsars' ? pulsarShown.ids : l.id === 'snrs' ? remnantShown.ids : [];
        u.uHidden.value.set(h[0] ? (set.indexById.get(h[0]) ?? -1) : -1, h[1] ? (set.indexById.get(h[1]) ?? -1) : -1);
      }
      // The selected one's place from the camera in float64, where it is a body (galactic catalogues).
      const sb = selected && u.uSelectedRel && u.uSelected.value >= 0 ? sim.bodies[selected] : undefined;
      if (sb) {
        const r = selRel.copy(sb.pos).sub(sim.camera.pos);
        u.uSelectedRel.value.set(w[0][0] * r.x + w[0][1] * r.y + w[0][2] * r.z, w[1][0] * r.x + w[1][1] * r.y + w[1][2] * r.z, w[2][0] * r.x + w[2][1] * r.y + w[2][2] * r.z).divideScalar(PARSEC_KM);
      } else if (u.uSelectedRel && u.uSelected.value >= 0) {
        const g = set.galactic!.galPc;
        const i = u.uSelected.value;
        u.uSelectedRel.value.set(g[3 * i] - camGal.x, g[3 * i + 1] - camGal.y, g[3 * i + 2] - camGal.z);
      }
      const c = l.vert ? camMpc : camGal;
      const hi = u.uCamHi.value.set(Math.fround(c.x), Math.fround(c.y), Math.fround(c.z));
      u.uCamLo.value.set(c.x - hi.x, c.y - hi.y, c.z - hi.z);
      if (u.uTime) u.uTime.value = (performance.now() / 1000) % 3600;
      if (l.vert) {
        // The expanding sky's uniforms and its emission lookup, as the cosmic web takes them.
        if (!skyUpdated) {
          updateSkyUniforms();
          skyUpdated = true;
        }
        const src = withEmission(l.vert);
        if (l.material.vertexShader !== src) {
          l.material.vertexShader = src;
          l.material.needsUpdate = true;
        }
      }
      if (!compiled.current.has(l.id)) {
        // Compiled in the background the first time it shows, rather than stalling a frame.
        compiled.current.add(l.id);
        const scene = new Scene();
        scene.add(new Points(l.geometry, l.material));
        void gl.compileAsync(scene, camera).catch(() => {});
      }
    }
  });

  return (
    <>
      <group ref={group} />
      <PulsarModel />
    </>
  );
}
