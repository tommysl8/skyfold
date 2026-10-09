/**
 * Satellites (sim/satellites, docs/data/near-earth.md). A chunk of its own, mounted once the app is idle after
 * start-up (App.tsx):
 *  - the swarm, behind the View menu's Satellites switch (off by default): every active satellite in CelesTrak's
 *    GP data, about 15,000, and with the Debris sub-switch the tracked debris of four break-ups; one point each,
 *    moved on the GPU (render/shaders/satellites.vert.glsl) from mean elements a worker packs (sim/satellites/
 *    swarm.worker.ts), shown only near Earth and within 30 days of the elements' epoch;
 *  - a short trace of the selected satellite's orbit (the ISS, Tiangong, Hubble or one picked from the swarm), half
 *    an orbit at most, fading towards both ends;
 *  - picking a satellite from the swarm, which makes it a body with a card (released when another is picked).
 * Costs nothing while the switch is off and nothing is selected.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  CanvasTexture,
  BufferGeometry,
  DynamicDrawUsage,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Line,
  type PerspectiveCamera,
  Points,
  ShaderMaterial,
  Sphere,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { BODIES } from '../physics/constants';
import { L1_FRACTION, L2_FRACTION } from '../sim/lagrange';
import type { AstroTime } from 'astronomy-engine';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { relView } from '../render/relativisticView';
import { createSatelliteMaterial, createTraceMaterial } from '../render/satelliteMaterials';
import { sim } from '../sim/sim';
import { updateEphemeris } from '../sim/ephemeris';
import { useUI } from '../state/ui';
import { getBody, isBody, registerBodies, unregisterBodies, type Availability, type BodyRecord, type Vec3Like } from '../sim/bodies';
import { screenOf } from '../sim/derived';
import { notifySatellites, satellites, GOOD_DAYS, SHOWN_DAYS } from '../sim/satellites';
import { fetchGp, isFailure } from '../sim/satellites/celestrak';
import { sgp4Placer } from '../sim/satellites/named';
import { type GpRecord, type SatClass } from '../sim/satellites/omm';
import { epochText, swarmRecordText } from '../sim/satellites/records';
import { propagate, sgp4init, type SatRec } from '../sim/satellites/sgp4';
import { PACK, packedPosition, REBASE_MIN } from '../sim/satellites/swarm';
import { temeToEcliptic } from '../sim/satellites/teme';

/** Debris of the four break-ups CelesTrak lists as groups. */
const DEBRIS_GROUPS = ['cosmos-1408-debris', 'fengyun-1c-debris', 'iridium-33-debris', 'cosmos-2251-debris'];
/** The swarm shows within this distance of Earth's centre (km) and fades out over the last part. */
const SHOW_KM = 4e6;
const FADE_FROM_KM = 1.5e6;

type Placer = (time: AstroTime, pos: Vec3Like, vel?: Vec3Like | null) => void;
/** Satellites picked from the swarm and registered as bodies: id → placer and swarm index. */
const picked = new Map<string, { rec: SatRec; index: number; periodMin: number }>();

/** The world axes from the J2000 ecliptic: (x, z, −y). TEME → world, row-major, for the shader's mat3. */
function temeToWorld(time: AstroTime, out: Float64Array): Float64Array {
  const m = temeToEcliptic(time);
  // world.x = ecl.x, world.y = ecl.z, world.z = −ecl.y
  out[0] = m[0];
  out[1] = m[1];
  out[2] = m[2];
  out[3] = m[6];
  out[4] = m[7];
  out[5] = m[8];
  out[6] = -m[3];
  out[7] = -m[4];
  out[8] = -m[5];
  return out;
}

const jdNow = () => sim.astroTime.ut + 2451545;

// ─── The worker ───────────────────────────────────────────────────────────────────────────

interface SwarmData {
  worker: Worker;
  packed: Float32Array | null;
  refJd: number;
  pending: boolean;
  seq: number;
  count: number;
  loaded: Set<string>;
  info: Map<number, (gp: GpRecord | null, cls: SatClass) => void>;
  onPacked: (() => void) | null;
}

let swarm: SwarmData | null = null;

function startWorker(): SwarmData {
  const worker = new Worker(new URL('../sim/satellites/swarm.worker.ts', import.meta.url), { type: 'module', name: 'satellites' });
  const s: SwarmData = { worker, packed: null, refJd: NaN, pending: false, seq: 0, count: 0, loaded: new Set(), info: new Map(), onPacked: null };
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'added') {
      s.count = m.count;
      satellites.swarm.count = m.count - m.debrisCount;
      satellites.swarm.debrisCount = m.debrisCount;
      satellites.swarm.epochJd = m.epochJd;
      satellites.swarm.status = 'ready';
      s.refJd = NaN; // repack with the new sets
      notifySatellites();
    } else if (m.type === 'packed') {
      s.pending = false;
      if (m.seq !== s.seq) return;
      s.packed = m.data;
      s.refJd = m.jd;
      s.onPacked?.();
    } else if (m.type === 'info') {
      s.info.get(m.index)?.(m.gp, m.cls);
      s.info.delete(m.index);
    }
  };
  return s;
}

/** Fetch a set once (from CelesTrak or the browser's cache) and hand it to the worker. */
async function addSet(s: SwarmData, group: string, debris: boolean): Promise<void> {
  if (s.loaded.has(group)) return;
  s.loaded.add(group);
  if (!debris) {
    satellites.swarm.status = 'loading';
    notifySatellites();
  }
  const r = await fetchGp({ group });
  if (isFailure(r)) {
    if (!debris) {
      satellites.swarm.status = 'error';
      satellites.swarm.message = r.error;
      notifySatellites();
    }
    return;
  }
  if (!debris) {
    satellites.swarm.fetchedAt = r.fetchedAt;
    satellites.swarm.stale = r.stale;
  }
  s.worker.postMessage({ type: 'add', text: r.text, debris });
}

// ─── Picking a satellite of the swarm ─────────────────────────────────────────────────────

const scratch = { x: 0, y: 0, z: 0 };
const rel = new Vector3();
const screenPt = { x: 0, y: 0, inFront: false, onScreen: false };
const pickMat = new Float64Array(9);

function availabilityOf(name: string, epochJd: number): (timeMs: number) => Availability {
  const approximate: Availability = { available: true, reason: null, regime: 'approximate' };
  const illustrative: Availability = { available: true, reason: null, regime: 'illustrative' };
  const far: Availability = {
    available: false,
    reason: `${name} is placed from its orbital elements of ${epochText(epochJd)}; SGP4 cannot place it months from them.`,
    regime: 'unknown',
  };
  return (timeMs) => {
    const days = Math.abs(timeMs / 86400000 + 2440587.5 - epochJd);
    return days > SHOWN_DAYS ? far : days > GOOD_DAYS ? illustrative : approximate;
  };
}

function titleCase(name: string): string {
  return name.replace(/\b([A-Z])([A-Z0-9]*)\b/g, (_, a: string, b: string) => (/\d/.test(b) || b.length < 2 ? a + b : a + b.toLowerCase()));
}

function swarmRecord(gp: GpRecord, cls: SatClass, placer: Placer): BodyRecord {
  const text = swarmRecordText(gp, cls);
  const name = titleCase(gp.name);
  return {
    id: `sat-${gp.norad}`,
    name,
    aliases: [gp.name, `NORAD ${gp.norad}`, gp.cosparId].filter(Boolean),
    kind: 'spacecraft',
    kindText: text.kindText,
    parent: 'earth',
    physical: { radiusKm: 0.002, radiusRough: true, geometricAlbedo: 0.2, colour: '#cfd6e2' },
    visual: { renderer: 'point' },
    facts: text.facts,
    factSources: [`https://celestrak.org/NORAD/elements/gp.php?CATNR=${gp.norad}`, `https://celestrak.org/satcat/table-satcat.php?CATNR=${gp.norad}`],
    factSourceLabels: ['CelesTrak GP data', 'CelesTrak SATCAT'],
    dataSource: 'CelesTrak GP elements (US Space Force), SGP4.',
    positionNote: `Position: SGP4 from its element set of ${epochText(gp.epochJd)} (via CelesTrak); within a few km near that date.`,
    modelNotes: ['Its size and shape are not modelled: it is a point.', 'Its orbit is drawn as a short trace while it is selected.'],
    orbitLine: false,
    detector: false,
    onDemand: true,
    labelRank: 45,
    framing: { distanceKm: 2, minKm: 0.05 },
    provider: {
      label: 'SGP4 from CelesTrak’s GP elements',
      availability: availabilityOf(name, gp.epochJd),
      positionAt: placer,
    },
  };
}

function releasePicked(keep: string): void {
  const ui = useUI.getState();
  const gone = [...picked.keys()].filter((id) => id !== keep && id !== ui.selected && id !== ui.focus);
  for (const id of gone) picked.delete(id);
  if (gone.length) unregisterBodies(gone);
}

function ensureSatellite(index: number): Promise<string | null> {
  const s = swarm;
  if (!s) return Promise.resolve(null);
  return new Promise((resolve) => {
    s.info.set(index, (gp, cls) => {
      if (!gp) return resolve(null);
      const id = `sat-${gp.norad}`;
      if (isBody(id)) return resolve(picked.has(id) ? id : null);
      if (getBody(id)) return resolve(null);
      const rec = sgp4init(gp);
      if (rec.error) return resolve(null);
      const placer = sgp4Placer(rec);
      picked.set(id, { rec, index, periodMin: 1440 / gp.meanMotion });
      registerBodies([swarmRecord(gp, cls, placer)]);
      updateEphemeris();
      releasePicked(id);
      resolve(id);
    });
    s.worker.postMessage({ type: 'info', index });
  });
}

// ─── The scene ────────────────────────────────────────────────────────────────────────────

function Swarm() {
  const { gl, camera } = useThree();
  const material = useMemo(createSatelliteMaterial, []);
  const points = useMemo(() => {
    const p = new Points(new BufferGeometry(), material);
    p.frustumCulled = false;
    p.renderOrder = 2;
    p.layers.set(POINTS_LAYER);
    return p;
  }, [material]);
  const mat = useMemo(() => new Float64Array(9), []);
  const built = useRef(0);

  useEffect(
    () => () => {
      points.geometry.dispose();
      material.dispose();
    },
    [points, material],
  );

  useEffect(() => {
    satellites.pick = (x, y) => {
      const s = swarm;
      const earth = sim.bodies.earth;
      if (!s?.packed || !points.visible || !earth) return null;
      const dt = (jdNow() - s.refJd) * 1440;
      temeToWorld(sim.astroTime, pickMat);
      const debris = useUI.getState().satelliteDebris;
      let best = -1;
      let bestPx = 7;
      const n = s.packed.length / PACK;
      for (let k = 0; k < n; k++) {
        if (!debris && s.packed[PACK * k + 10] > 5.5) continue;
        if (!packedPosition(s.packed, k, dt, scratch)) continue;
        rel.set(
          pickMat[0] * scratch.x + pickMat[1] * scratch.y + pickMat[2] * scratch.z,
          pickMat[3] * scratch.x + pickMat[4] * scratch.y + pickMat[5] * scratch.z,
          pickMat[6] * scratch.x + pickMat[7] * scratch.y + pickMat[8] * scratch.z,
        );
        rel.add(earth.apparentPos).sub(sim.camera.pos);
        screenOf(rel, camera as PerspectiveCamera, screenPt);
        if (!screenPt.onScreen) continue;
        const px = Math.hypot(screenPt.x - x, screenPt.y - y);
        if (px < bestPx) {
          bestPx = px;
          best = k;
        }
      }
      return best >= 0 ? { index: best, px: bestPx } : null;
    };
    satellites.ensure = ensureSatellite;
    return () => {
      satellites.pick = null;
      satellites.ensure = null;
    };
  }, [points, camera]);

  useFrame(() => {
    const ui = useUI.getState();
    const earth = sim.bodies.earth;
    const sun = sim.bodies.sun;
    const dEarth = earth ? earth.apparentPos.distanceTo(sim.camera.pos) : Infinity;
    const wanted = ui.satellites && !!earth?.present && dEarth < SHOW_KM;
    if (wanted && !swarm) swarm = startWorker();
    const s = swarm;
    if (s && ui.satellites) {
      void addSet(s, 'active', false);
      if (ui.satelliteDebris) for (const g of DEBRIS_GROUPS) void addSet(s, g, true);
    }
    // Shown within SHOWN_DAYS of the elements (fading out from 14 days), near Earth.
    const days = s ? Math.abs(jdNow() - satellites.swarm.epochJd) : Infinity;
    const timeShare = Number.isFinite(days) ? 1 - Math.min(1, Math.max(0, (days - 14) / (SHOWN_DAYS - 14))) : 0;
    const distShare = 1 - Math.min(1, Math.max(0, (dEarth - FADE_FROM_KM) / (SHOW_KM - FADE_FROM_KM)));
    const share = wanted ? timeShare * distShare : 0;
    if (Math.abs(share - satellites.swarm.shown) > 0.02 || (share === 0) !== (satellites.swarm.shown === 0)) {
      satellites.swarm.shown = share;
      notifySatellites();
    }
    points.visible = share > 0 && !!s?.packed;
    if (!s || !earth || !sun || share === 0) return;

    // New reference elements when the clock has moved REBASE_MIN from the last, or a set was added.
    const jd = jdNow();
    if (!s.pending && (!(Math.abs(jd - s.refJd) * 1440 < REBASE_MIN) || !s.packed)) {
      s.pending = true;
      s.seq++;
      s.worker.postMessage({ type: 'pack', jd, seq: s.seq });
    }
    if (!s.packed) return;
    const g = points.geometry;
    const n = s.packed.length / PACK;
    if (built.current !== s.seq || !g.getAttribute('aEl0')) {
      // Upload the new elements (the array is replaced, so the old buffer goes with the attribute).
      const ib = new InterleavedBuffer(s.packed, PACK);
      ib.setUsage(DynamicDrawUsage);
      g.setAttribute('aEl0', new InterleavedBufferAttribute(ib, 4, 0));
      g.setAttribute('aEl1', new InterleavedBufferAttribute(ib, 4, 4));
      g.setAttribute('aEl2', new InterleavedBufferAttribute(ib, 4, 8));
      // three.js wants a position to size the draw; the shader never reads it.
      if (!g.getAttribute('position') || g.getAttribute('position').count !== n) g.setAttribute('position', new BufferAttribute(new Float32Array(3 * n), 3));
      g.boundingSphere = new Sphere(new Vector3(), 1e9);
      g.setDrawRange(0, n);
      built.current = s.seq;
    }
    const u = material.uniforms;
    u.uDtMin.value = (jd - s.refJd) * 1440;
    temeToWorld(sim.astroTime, mat);
    u.uTemeToWorld.value.set(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5], mat[6], mat[7], mat[8]);
    u.uEarthRel.value.copy(earth.apparentPos).sub(sim.camera.pos);
    u.uSunDir.value.copy(sun.apparentPos).sub(earth.apparentPos).normalize();
    u.uPointSize.value = 1.7 * gl.getPixelRatio();
    u.uOpacity.value = 0.5 * share;
    u.uDebris.value = ui.satelliteDebris ? 1 : 0;
    const sel = ui.selected ? picked.get(ui.selected) : undefined;
    u.uHidden.value = sel ? sel.index : -1;
  });

  return <primitive object={points} />;
}

const TRACE_N = 97;

/** The selected satellite's orbit near it: half an orbit (at most two hours) centred on it, fading at both ends. */
function Trace() {
  const material = useMemo(createTraceMaterial, []);
  const line = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(3 * TRACE_N), 3).setUsage(DynamicDrawUsage));
    const fade = new Float32Array(TRACE_N);
    for (let i = 0; i < TRACE_N; i++) {
      const x = (2 * i) / (TRACE_N - 1) - 1;
      fade[i] = Math.pow(1 - x * x, 1.5);
    }
    g.setAttribute('aFade', new BufferAttribute(fade, 1));
    g.boundingSphere = new Sphere(new Vector3(), 1e9);
    const l = new Line(g, material);
    l.frustumCulled = false;
    l.visible = false;
    return l;
  }, [material]);
  const scratch = useMemo(() => ({ r: new Float64Array(3), v: new Float64Array(3), m: new Float64Array(9) }), []);

  useEffect(
    () => () => {
      line.geometry.dispose();
      material.dispose();
    },
    [line, material],
  );

  useFrame(() => {
    const ui = useUI.getState();
    const id = ui.selected;
    const b = id ? sim.bodies[id] : undefined;
    const earth = sim.bodies.earth;
    const named = id ? satellites.named.get(id) : undefined;
    const pick = id ? picked.get(id) : undefined;
    const rec = named?.rec ?? pick?.rec;
    line.visible = !!rec && !!b?.present && !!earth && ui.showOrbits && !(relView.active && !relView.split);
    if (!line.visible || !rec || !earth || !b) return;
    // Half an orbit, but no more than two hours: an orbit's own scale, not the whole ring.
    const periodMin = pick?.periodMin ?? (2 * Math.PI) / rec.noKozai;
    const spanMin = Math.min(periodMin / 2, 120);
    const { r, v, m } = scratch;
    // One rotation for the whole trace (precession moves TEME by 0.01″ in an hour), about Earth where it is drawn now.
    temeToWorld(sim.astroTime, m);
    const tNow = (jdNow() - rec.epochJd) * 1440;
    const ex = earth.apparentPos.x - sim.camera.pos.x;
    const ey = earth.apparentPos.y - sim.camera.pos.y;
    const ez = earth.apparentPos.z - sim.camera.pos.z;
    const pos = line.geometry.getAttribute('position') as BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < TRACE_N; i++) {
      propagate(rec, tNow + ((2 * i) / (TRACE_N - 1) - 1) * (spanMin / 2), r, v);
      arr[3 * i] = ex + m[0] * r[0] + m[1] * r[1] + m[2] * r[2];
      arr[3 * i + 1] = ey + m[3] * r[0] + m[4] * r[1] + m[5] * r[2];
      arr[3 * i + 2] = ez + m[6] * r[0] + m[7] * r[1] + m[8] * r[2];
    }
    pos.needsUpdate = true;
  });

  return <primitive object={line} />;
}

// ─── The Sun–Earth L1 and L2 points ───────────────────────────────────────────────────────

/** The craft that live there: while one is selected or in focus, its points are marked. */
const LAGRANGE_CRAFT = new Set(['jwst', 'soho']);
/** Marked also while the camera is within this distance of one (km; Earth is 1.5 million km away), fading out over the last half. */
const LAGRANGE_NEAR_KM = 6e5;
const MOON_SHARE = BODIES.moon.gmKm3S2! / (BODIES.earth.gmKm3S2! + BODIES.moon.gmKm3S2!);

const RING_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uSize;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
  #include <logdepthbuf_vertex>
}
`;
const RING_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(0.62, 0.72, r) * (1.0 - smoothstep(0.86, 0.96, r));
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
}
`;

/** A small text label that keeps its size on screen. */
function textSprite(text: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.font = '500 20px "IBM Plex Sans Variable", system-ui, sans-serif';
  g.fillStyle = '#9fb0c8';
  g.textBaseline = 'middle';
  g.fillText(text, 4, 16);
  const m = new SpriteMaterial({ map: new CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: false });
  const sp = new Sprite(m);
  sp.center.set(-0.12, 0.5);
  sp.scale.set(0.08, 0.02, 1);
  return sp;
}

/**
 * Quiet marks at the Sun–Earth L1 and L2 points (sim/lagrange.ts): a faint ring and its name, shown while Webb or
 * SOHO is selected or in focus, or the camera is near a point. Nothing else draws them.
 */
function LagrangeMarkers() {
  const { gl } = useThree();
  const parts = useMemo(() => {
    const material = new ShaderMaterial({
      uniforms: { uSize: { value: 14 }, uColor: { value: new Vector3(0.62, 0.7, 0.82) }, uOpacity: { value: 0 } },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const make = (label: string) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
      const p = new Points(g, material);
      p.frustumCulled = false;
      const t = textSprite(label);
      return { p, t };
    };
    return { material, l1: make('Sun–Earth L1'), l2: make('Sun–Earth L2') };
  }, []);
  const emb = useMemo(() => new Vector3(), []);
  const out = useMemo(() => new Vector3(), []);

  useEffect(
    () => () => {
      parts.material.dispose();
      for (const k of [parts.l1, parts.l2]) {
        k.p.geometry.dispose();
        (k.t.material as SpriteMaterial).map?.dispose();
        k.t.material.dispose();
      }
    },
    [parts],
  );

  useFrame(() => {
    const ui = useUI.getState();
    const earth = sim.bodies.earth;
    const moon = sim.bodies.moon;
    const sun = sim.bodies.sun;
    let share = 0;
    if (earth && moon && sun) {
      emb.copy(moon.pos).sub(earth.pos).multiplyScalar(MOON_SHARE).add(earth.pos);
      const wanted = LAGRANGE_CRAFT.has(ui.selected ?? '') || LAGRANGE_CRAFT.has(ui.focus);
      for (const [k, f] of [
        [parts.l1, -L1_FRACTION],
        [parts.l2, L2_FRACTION],
      ] as const) {
        out.copy(emb).sub(sun.pos).multiplyScalar(f).add(emb);
        const d = out.distanceTo(sim.camera.pos);
        const near = 1 - Math.min(1, Math.max(0, (d - LAGRANGE_NEAR_KM / 2) / (LAGRANGE_NEAR_KM / 2)));
        share = Math.max(share, wanted ? 1 : near);
        out.sub(sim.camera.pos);
        const pos = k.p.geometry.getAttribute('position') as BufferAttribute;
        pos.setXYZ(0, out.x, out.y, out.z);
        pos.needsUpdate = true;
        k.t.position.copy(out);
      }
    }
    const on = share > 0.01 && !relView.active;
    parts.material.uniforms.uOpacity.value = 0.5 * share;
    parts.material.uniforms.uSize.value = 14 * gl.getPixelRatio();
    for (const k of [parts.l1, parts.l2]) {
      k.p.visible = on;
      k.t.visible = on && ui.showLabels;
      (k.t.material as SpriteMaterial).opacity = 0.8 * share;
    }
  });

  return (
    <>
      <primitive object={parts.l1.p} />
      <primitive object={parts.l2.p} />
      <primitive object={parts.l1.t} />
      <primitive object={parts.l2.t} />
    </>
  );
}

export default function Satellites() {
  return (
    <>
      <Swarm />
      <Trace />
      <LagrangeMarkers />
    </>
  );
}
