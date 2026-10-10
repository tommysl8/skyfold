/**
 * Comets' comae and tails: the ion tail straight down the solar wind, the dust tail curving back
 * along the orbit, and a faint coma, stronger and longer near the Sun by each comet's own
 * magnitude law and gone beyond about 5 au (render/cometTail.ts has the physical model). One
 * small mesh per comet of the registry (Halley, Hale–Bopp, 67P, the interstellar comets, and a
 * comet of the small-body layer once it is clicked or found), and a few more for the layer's
 * comets with the strongest tails at the time (sim/asteroids/activeComets.ts: NEOWISE in July
 * 2020, Hyakutake in 1996), chosen twice a second while the layer is on. Each mesh is rewritten
 * each frame only while its tail is active and at least a couple of pixels long on screen;
 * otherwise nothing is computed or drawn.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, type Mesh } from 'three';
import { AU_KM, C_KM_S, J2000_JD } from '../physics/constants';
import { bodyRecords, getBody, recordSerial, registryVersion, subscribeRegistry, type BodyId } from '../sim/bodies';
import { pixelsPerRadian, solarSystemHidden } from '../sim/derived';
import { sim } from '../sim/sim';
import { createTailMaterial } from '../render/materials';
import { DUST_BETAS, dustAgeS, grainOffset, ionTailDirection, ionTailKm, releaseState, tailBrightness, type V3 } from '../render/cometTail';
import { activeComets, cometConic, LAYER_TAILS, type ActiveComet } from '../sim/asteroids/activeComets';
import { conicPosition, type Conic } from '../sim/asteroids/conic';
import { hiddenSmallBody } from '../sim/asteroids/bodies';
import { smallBodies } from '../sim/asteroids/load';
import type { ConicColumns } from '../sim/asteroids/format';
import { useUI } from '../state/ui';

/** Dust samples along each syndyne (release ages), ion-tail samples, coma rim points. */
const K = 24;
const M = 24;
const RIM = 24;
const J = DUST_BETAS.length;
const DUST_V = J * K;
const ION_V = 2 * M;
const COMA_V = 1 + RIM;
const VERTS = DUST_V + ION_V + COMA_V;

/** Peak brightness (additive, at full strength) of each part: subtle by design. */
const DUST_GAIN = 0.32;
const ION_GAIN = 0.13;
const COMA_GAIN = 0.4;
/** Relative weight of each syndyne across the dust fan (large grains and the finest are fewer: soft edges). */
const BETA_WEIGHT = [0.12, 0.75, 1, 0.7, 0.15];
/** Dust dims with age as it spreads: e-folding time, as a fraction of the oldest drawn. */
const DUST_FADE = 1 / 3;
/** Coma radius at full strength, km. */
const COMA_KM = 3e5;

const DUST = new Color('#fff0d8');
const ION = new Color('#7aa6ff');
const COMA = new Color('#e4ecff');

function tailGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const dyn = (n: number, size: number) => new BufferAttribute(new Float32Array(n * size), size).setUsage(DynamicDrawUsage);
  g.setAttribute('position', dyn(VERTS, 3));
  g.setAttribute('aColor', dyn(VERTS, 3));
  const side = new Float32Array(VERTS);
  for (let i = 0; i < M; i++) {
    side[DUST_V + 2 * i] = -1;
    side[DUST_V + 2 * i + 1] = 1;
  }
  g.setAttribute('aSide', new BufferAttribute(side, 1));
  const idx: number[] = [];
  // Dust: quads between neighbouring syndynes and ages.
  for (let j = 0; j < J - 1; j++)
    for (let k = 0; k < K - 1; k++) {
      const a = j * K + k;
      const b = (j + 1) * K + k;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  // Ion ribbon.
  for (let i = 0; i < M - 1; i++) {
    const a = DUST_V + 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // Coma: a fan around the head.
  const c = DUST_V + ION_V;
  for (let i = 0; i < RIM; i++) idx.push(c, c + 1 + i, c + 1 + ((i + 1) % RIM));
  g.setIndex(idx);
  return g;
}

// Scratch, shared by every comet (they are updated one after another).
const r = { x: 0, y: 0, z: 0 };
const v = { x: 0, y: 0, z: 0 };
const rel = { x: 0, y: 0, z: 0 };
const relR = { x: 0, y: 0, z: 0 };
const relV = { x: 0, y: 0, z: 0 };
const grain = { x: 0, y: 0, z: 0 };
const dir = { x: 0, y: 0, z: 0 };
const side = { x: 0, y: 0, z: 0 };
const u1 = { x: 0, y: 0, z: 0 };
const u2 = { x: 0, y: 0, z: 0 };

function cross(a: V3, b: V3, out: V3): V3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  const n = Math.hypot(x, y, z) || 1;
  out.x = x / n;
  out.y = y / n;
  out.z = z / n;
  return out;
}

/** A comet's state for one frame: from the Sun (km, world axes), its velocity (km/s), the head from the camera (km), its magnitude law. */
interface TailState {
  r: V3;
  v: V3;
  rel: V3;
  distCamera: number;
  m1: number;
  k1: number;
}

const state: TailState = { r, v, rel, distCamera: 0, m1: NaN, k1: NaN };

/** Write a comet's coma and tails into its geometry; false when there is nothing worth drawing (inactive, or under 2 px long). */
function writeTail(geometry: BufferGeometry, s: TailState): boolean {
  if (!tailLook.on) return false;
  const rAu = Math.hypot(s.r.x, s.r.y, s.r.z) / AU_KM;
  const bright = tailBrightness(rAu, s.m1, s.k1);
  if (bright < 0.003) return false;
  const ionKm = ionTailKm(rAu, s.m1, s.k1);
  // Worth drawing only if the tail would be a couple of pixels long.
  if ((ionKm / Math.max(s.distCamera, 1)) * pixelsPerRadian() < 2) return false;
  const ageMax = dustAgeS(rAu, s.m1, s.k1);
  const fadeS = ageMax * DUST_FADE;

  const P = (geometry.attributes.position as BufferAttribute).array as Float32Array;
  const C = (geometry.attributes.aColor as BufferAttribute).array as Float32Array;

  // Dust: syndynes of each β, sampled at ages that crowd towards the head (the points of one age make a synchrone).
  for (let k = 0; k < K; k++) {
    const f = k / (K - 1);
    const age = ageMax * f * f;
    if (age > 0) releaseState(s.r, s.v, age, relR, relV);
    const fade = Math.exp(-age / fadeS) * (k === 0 ? 1 : 1 - 0.3 * f);
    for (let j = 0; j < J; j++) {
      const i = j * K + k;
      if (age > 0) grainOffset(s.r, relR, relV, DUST_BETAS[j], age, grain);
      else grain.x = grain.y = grain.z = 0;
      P[3 * i] = s.rel.x + grain.x;
      P[3 * i + 1] = s.rel.y + grain.y;
      P[3 * i + 2] = s.rel.z + grain.z;
      const a = DUST_GAIN * bright * BETA_WEIGHT[j] * fade;
      C[3 * i] = DUST.r * a;
      C[3 * i + 1] = DUST.g * a;
      C[3 * i + 2] = DUST.b * a;
    }
  }

  // Ion tail: straight down the solar wind, widening and fading away from the head.
  ionTailDirection(s.r, s.v, dir);
  cross(dir, s.rel, side);
  // Narrow: a few hundred thousand km, widening down the tail (wider for the longer tails of the more active comets).
  const widen = Math.sqrt(ionKm / 5e7);
  for (let i = 0; i < M; i++) {
    const t = i / (M - 1);
    const along = ionKm * t ** 1.3;
    const half = (8e4 + 6e5 * t) * widen;
    const x = s.rel.x + dir.x * along;
    const y = s.rel.y + dir.y * along;
    const z = s.rel.z + dir.z * along;
    const a = ION_GAIN * bright * (1 - t) ** 1.6;
    for (let e = 0; e < 2; e++) {
      const n = DUST_V + 2 * i + e;
      const sgn = e === 0 ? -1 : 1;
      P[3 * n] = x + sgn * side.x * half;
      P[3 * n + 1] = y + sgn * side.y * half;
      P[3 * n + 2] = z + sgn * side.z * half;
      C[3 * n] = ION.r * a;
      C[3 * n + 1] = ION.g * a;
      C[3 * n + 2] = ION.b * a;
    }
  }

  // Coma: a disc facing the camera, bright at the head and fading to its rim.
  const c = DUST_V + ION_V;
  const rc = COMA_KM * Math.sqrt(bright);
  cross(s.rel, dir, u1);
  cross(s.rel, u1, u2);
  P[3 * c] = s.rel.x;
  P[3 * c + 1] = s.rel.y;
  P[3 * c + 2] = s.rel.z;
  const a0 = COMA_GAIN * bright;
  C[3 * c] = COMA.r * a0;
  C[3 * c + 1] = COMA.g * a0;
  C[3 * c + 2] = COMA.b * a0;
  for (let i = 0; i < RIM; i++) {
    const t = (2 * Math.PI * i) / RIM;
    const n = c + 1 + i;
    const cs = Math.cos(t) * rc;
    const sn = Math.sin(t) * rc;
    P[3 * n] = s.rel.x + u1.x * cs + u2.x * sn;
    P[3 * n + 1] = s.rel.y + u1.y * cs + u2.y * sn;
    P[3 * n + 2] = s.rel.z + u1.z * cs + u2.z * sn;
    C[3 * n] = C[3 * n + 1] = C[3 * n + 2] = 0;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.aColor.needsUpdate = true;
  return true;
}

/** Development: on false leaves every tail out (to time them). */
export const tailLook = { on: true };

/** A tail's geometry and material, made once and disposed with the component. */
function useTailParts() {
  const geometry = useMemo(tailGeometry, []);
  const material = useMemo(createTailMaterial, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return { geometry, material };
}

function CometTail({ id }: { id: BodyId }) {
  const mesh = useRef<Mesh>(null!);
  const { geometry, material } = useTailParts();
  const law = getBody(id)?.visual?.tailMagnitudes;

  useFrame(() => {
    const m = mesh.current;
    const b = sim.bodies[id];
    const sun = sim.bodies.sun;
    m.visible = false;
    if (!b || !sun || !b.present || solarSystemHidden()) return;
    r.x = b.apparentPos.x - sun.apparentPos.x;
    r.y = b.apparentPos.y - sun.apparentPos.y;
    r.z = b.apparentPos.z - sun.apparentPos.z;
    v.x = b.vel.x;
    v.y = b.vel.y;
    v.z = b.vel.z;
    // The head, relative to the camera (float64 until here: the floating origin).
    const cam = sim.camera.pos;
    rel.x = b.apparentPos.x - cam.x;
    rel.y = b.apparentPos.y - cam.y;
    rel.z = b.apparentPos.z - cam.z;
    state.distCamera = b.distCamera;
    state.m1 = law?.m1 ?? NaN;
    state.k1 = law?.k1 ?? NaN;
    m.visible = writeTail(geometry, state);
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={4} visible={false} />;
}

// ─── The small-body layer's comets ───────────────────────────────────────────────────────

/** How often the layer's active comets are chosen again, ms of wall time (at once when the date moves by more than CHOOSE_DAYS). */
const CHOOSE_MS = 500;
const CHOOSE_DAYS = 2;

/** The layer's comets with tails now, their orbits, and when they were chosen. */
const chosen = { list: [] as ActiveComet[], conics: [] as Conic[], at: -Infinity, days: NaN };

const pa = { x: 0, y: 0, z: 0 };
const pb = { x: 0, y: 0, z: 0 };

/** One of the layer's tails: slot `k` of the chosen comets. */
function LayerTail({ k }: { k: number }) {
  const mesh = useRef<Mesh>(null!);
  const { geometry, material } = useTailParts();

  useFrame(() => {
    const m = mesh.current;
    m.visible = false;
    const c = chosen.list[k];
    const el = chosen.conics[k];
    const sun = sim.bodies.sun;
    const ix = smallBodies.index;
    if (!c || !el || !sun || !ix) return;
    let days = sim.astroTime.tt + J2000_JD - ix.refEpochJd;
    // Where the layer draws its point: where it is now, or where it was when the light seen left it (View › retarded).
    conicPosition(el, days, pa);
    if (useUI.getState().retarded) {
      const cam = sim.camera.pos;
      const d = Math.hypot(sun.pos.x + pa.x * AU_KM - cam.x, sun.pos.y + pa.z * AU_KM - cam.y, sun.pos.z - pa.y * AU_KM - cam.z);
      days -= d / C_KM_S / 86_400;
      conicPosition(el, days, pa);
    }
    // Velocity by a central difference over a minute.
    const h = 60 / 86_400;
    conicPosition(el, days + h, pb);
    const vx = pb.x;
    const vy = pb.y;
    const vz = pb.z;
    conicPosition(el, days - h, pb);
    const kv = AU_KM / (2 * h * 86_400);
    // Ecliptic (x, y, z) to world (x, z, −y).
    r.x = pa.x * AU_KM;
    r.y = pa.z * AU_KM;
    r.z = -pa.y * AU_KM;
    v.x = (vx - pb.x) * kv;
    v.y = (vz - pb.z) * kv;
    v.z = -(vy - pb.y) * kv;
    const cam = sim.camera.pos;
    rel.x = sun.pos.x + r.x - cam.x;
    rel.y = sun.pos.y + r.y - cam.y;
    rel.z = sun.pos.z + r.z - cam.z;
    state.distCamera = Math.hypot(rel.x, rel.y, rel.z);
    state.m1 = c.M1;
    state.k1 = c.K1;
    m.visible = writeTail(geometry, state);
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={4} visible={false} />;
}

/** Chooses the layer's comets with the strongest tails while the layer shows, and draws them. */
function LayerTails() {
  useFrame(() => {
    const ix = smallBodies.index;
    if (!useUI.getState().showBelts || solarSystemHidden() || !ix) {
      chosen.list.length = 0;
      chosen.conics.length = 0;
      chosen.at = -Infinity;
      return;
    }
    const now = performance.now();
    const days = sim.astroTime.tt + J2000_JD - ix.refEpochJd;
    if (now - chosen.at < CHOOSE_MS && Math.abs(days - chosen.days) < CHOOSE_DAYS) return;
    chosen.at = now;
    chosen.days = days;
    chosen.list = activeComets(smallBodies.sections.values(), days, LAYER_TAILS, hiddenSmallBody());
    chosen.conics = chosen.list.map((c) => cometConic(smallBodies.sections.get(c.section)!.cols as ConicColumns, c.index));
  });
  return (
    <>
      {Array.from({ length: LAYER_TAILS }, (_, k) => (
        <LayerTail key={k} k={k} />
      ))}
    </>
  );
}

/** A tail for every registered body whose visual asks for one, and for the layer's most active comets. */
export function CometTails() {
  const version = useSyncExternalStore(subscribeRegistry, registryVersion);
  const ids = useMemo(() => bodyRecords().filter((r) => r.visual?.tails).map((r) => r.id), [version]);
  return (
    <>
      {ids.map((id) => (
        <CometTail key={`${id}:${recordSerial(id)}`} id={id} />
      ))}
      <LayerTails />
    </>
  );
}
