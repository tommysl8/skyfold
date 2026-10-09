import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Group, type PerspectiveCamera, Points, type ShaderMaterial, Vector3 } from 'three';
import { AU_KM, J2000_JD } from '../physics/constants';
import { asteroidUniforms, createAsteroidMaterial, relativityUniforms } from '../render/materials';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { sim } from '../sim/sim';
import { solarSystemHidden } from '../sim/derived';
import { barycentreFromSun } from '../sim/voyager';
import { shaderDays } from '../lib/time';
import { useUI } from '../state/ui';
import { BARY_MU, orientation } from '../sim/asteroids/conic';
import { FRAME_BARY, GROUP_COLOURS, GROUPS, SHAPE_CONIC } from '../sim/asteroids/format';
import { DRAW_BUDGET, exposureShift, FADE_MAG, FULL_MAG, LIMIT_MAG, limitWithNear, planDraw, type PlanSection } from '../sim/asteroids/lod';
import { near, updateNear } from '../sim/asteroids/nearClient';
import { ASTEROID_BASE_URL, boundsOf, smallBodies, STREAM_FROM_PLANET_KM, subscribeSmallBodies, updateAsteroidLoads, type LoadedSection } from '../sim/asteroids/load';
import { hiddenSmallBody } from '../sim/asteroids/bodies';
import { layerSections, warmPick, type LayerSection } from './asteroidPick';

/** The planets: near one of them the full catalogue does not stream in (load.ts). */
const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

type Drawn = LayerSection & { section: LoadedSection; plan: PlanSection; near: Points<BufferGeometry, ShaderMaterial> | null };

/** Each orbit's P and Q (conic.ts orientation), as normalised int16 for the shader. */
function orientations(s: LoadedSection): { p: Int16Array; q: Int16Array } {
  const n = s.count;
  const p = new Int16Array(3 * n);
  const q = new Int16Array(3 * n);
  const o = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0 };
  const k = (x: number) => Math.round(x * 32767);
  const { i, node, peri } = s.cols;
  for (let j = 0; j < n; j++) {
    orientation((i[j] / 65535) * Math.PI, (node[j] / 65535) * 2 * Math.PI, (peri[j] / 65535) * 2 * Math.PI, o);
    p[3 * j] = k(o.px);
    p[3 * j + 1] = k(o.py);
    p[3 * j + 2] = k(o.pz);
    q[3 * j] = k(o.qx);
    q[3 * j + 1] = k(o.qy);
    q[3 * j + 2] = k(o.qz);
  }
  return { p, q };
}

function makePoints(s: LoadedSection): Drawn {
  const g = new BufferGeometry();
  if (s.shape === SHAPE_CONIC) {
    const c = s.cols;
    g.setAttribute('aPerihelion', new BufferAttribute(c.q, 1));
    g.setAttribute('aE', new BufferAttribute(c.e, 1));
    g.setAttribute('aTp', new BufferAttribute(c.tp, 1));
    g.setAttribute('aM1', new BufferAttribute(c.M1, 1, true));
    g.setAttribute('aK1', new BufferAttribute(c.K1, 1, true));
  } else {
    const c = s.cols;
    g.setAttribute('aA', new BufferAttribute(c.a, 1));
    g.setAttribute('aE', new BufferAttribute(c.e, 1, true));
    g.setAttribute('aM', new BufferAttribute(c.M, 1, true));
    g.setAttribute('aH', new BufferAttribute(c.H, 1, true));
  }
  const { p, q } = orientations(s);
  g.setAttribute('aP', new BufferAttribute(p, 3, true));
  g.setAttribute('aQ', new BufferAttribute(q, 3, true));
  g.setDrawRange(0, s.count);
  const material = createAsteroidMaterial(s.shape === SHAPE_CONIC);
  const u = material.uniforms;
  u.uColor.value = new Color(GROUP_COLOURS[GROUPS[s.group]]);
  u.uHRange.value.set(s.hMin, s.hMax);
  u.uSqrtMu.value = s.frame === FRAME_BARY ? Math.sqrt(BARY_MU) : 1;
  const points = new Points(g, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  points.layers.set(POINTS_LAYER);
  return { id: s.id, conic: s.shape === SHAPE_CONIC, sample: !!s.sample, section: s, points, material, plan: { ...boundsOf(s), id: s.id, count: s.count }, near: null };
}

const ssbWorld = new Vector3();

/**
 * The look: the point size (CSS px), the budget (lod.ts DRAW_BUDGET) and a gain (magnitudes added to FULL_MAG), which
 * development builds can change through window.__ls.asteroids.look to try another.
 */
export const asteroidLook = { pointSizeCss: 1.0, budget: DRAW_BUDGET, gain: 0 };

/**
 * This frame's draw: bodies drawn by the plan and added by the near search, and the magnitude every body brighter
 * than which is drawn (lod.ts planDraw, limitWithNear).
 */
export const asteroidFrame = { drawn: 0, near: 0, limit: 0 };

let nearSeen = -1;

/**
 * Section d's near picks (an index list) as a second draw of its points: its own geometry, sharing the section's
 * attributes, with an index buffer kept and refilled (grown only when too small, so nothing is left behind on the GPU).
 */
function setNear(d: Drawn, picks: Uint32Array | undefined, group: Group): void {
  const n = picks?.length ?? 0;
  if (!d.near) {
    if (!n) return;
    const g = new BufferGeometry();
    for (const [name, attr] of Object.entries(d.points.geometry.attributes)) g.setAttribute(name, attr);
    d.near = new Points(g, d.material);
    d.near.frustumCulled = false;
    d.near.renderOrder = 2;
    d.near.layers.set(POINTS_LAYER);
    group.add(d.near);
  }
  const g = d.near.geometry;
  let index = g.getIndex();
  if (!index || index.count < n) {
    index = new BufferAttribute(new Uint32Array(Math.max(1024, 2 * n)), 1).setUsage(DynamicDrawUsage);
    g.setIndex(index);
  }
  if (n) {
    (index.array as Uint32Array).set(picks!);
    index.clearUpdateRanges();
    index.addUpdateRange(0, n);
    index.needsUpdate = true;
  }
  g.setDrawRange(0, n);
}

/** The loaded orbit files' URLs, absolute (the near search's worker fetches them again). */
function loadedUrls(): string[] {
  const ix = smallBodies.index;
  if (!ix) return [];
  const out: string[] = [];
  for (const [k, st] of smallBodies.files) if (st === 'ready') out.push(new URL(ASTEROID_BASE_URL + ix.files[k].file, location.href).href);
  return out;
}

/**
 * The asteroids and comets of JPL's Small-Body Database worth a card, about 33,000 (every named one, the large ones,
 * every comet), and a drawn-only sample of one in 20 of the rest (scripts/asteroids/notable.mjs; sim/asteroids):
 * one draw per section, each of tens of thousands of bodies whose orbits are solved in the vertex shader
 * (render/shaders/asteroids.vert.glsl), coloured by group and as bright as each really is from the camera (lod.ts).
 * A section that cannot hold a body bright enough to show is not drawn, and its file not fetched (load.ts). The
 * bodies the registry draws (Ceres, Vesta, the dwarf planets, the comets with tails…) are not in the files; a body
 * clicked or found is drawn by the registry while it is registered, and hidden here (sim/asteroids/pick.ts).
 */
export function Asteroids() {
  const group = useMemo(() => new Group(), []);

  useEffect(() => {
    const drawn = layerSections as Map<number, Drawn>;
    const sync = () => {
      for (const [id, s] of smallBodies.sections) {
        if (drawn.has(id)) continue;
        const d = makePoints(s);
        drawn.set(id, d);
        group.add(d.points);
      }
    };
    sync();
    const off = subscribeSmallBodies(sync);
    return () => {
      off();
      for (const d of drawn.values()) {
        group.remove(d.points);
        if (d.near) group.remove(d.near);
        d.points.geometry.dispose();
        d.material.dispose();
      }
      nearSeen = -1;
      drawn.clear();
    };
  }, [group]);

  useFrame(({ gl, camera }) => {
    const ui = useUI.getState();
    // Hidden once the Solar System is below a pixel: the shader's camera-relative positions would overflow float32
    // from far enough away.
    const on = ui.showBelts && !solarSystemHidden();
    const camAu = sim.camera.pos.length() / AU_KM;
    let nearPlanet = false;
    for (const id of PLANETS) {
      const b = sim.bodies[id];
      if (b && b.distCamera < STREAM_FROM_PLANET_KM) nearPlanet = true;
    }
    updateAsteroidLoads(on, !nearPlanet, camAu);
    group.visible = on;
    if (!on || !smallBodies.index) return;
    // A few seconds after the first file, the picking programs compile in the background.
    if (performance.now() > smallBodies.firstAt + 3000) warmPick(gl, camera as PerspectiveCamera);
    const u = asteroidUniforms;
    // Wrapped far from the elements' epoch so float32 keeps resolving the motion (see shaderDays).
    u.uDays.value = shaderDays(sim.astroTime.tt + J2000_JD - smallBodies.index.refEpochJd);
    u.uCamAU.value.copy(sim.camera.pos).divideScalar(AU_KM);
    u.uPointSize.value = asteroidLook.pointSizeCss * gl.getPixelRatio();
    u.uRetarded.value = ui.retarded ? 1 : 0;
    // The exposure lengthens as the camera goes out (lod.ts exposureShift).
    const shift = exposureShift(camAu);
    u.uFullMag.value = FULL_MAG + shift + asteroidLook.gain;
    u.uLimitMag.value = LIMIT_MAG + shift;
    u.uFadeMag.value = FADE_MAG;
    barycentreFromSun(sim.astroTime, ssbWorld).divideScalar(AU_KM);
    // Moving fast, light ahead is brightened (up to 8 times in the shader), and the relativistic view's exposure can
    // brighten everything: the plan allows for both.
    const margin = (sim.ship.beta > 1e-3 ? 2.3 : 0) + MAG_PER_LN * Math.max(0, relativityUniforms.uLnExposure.value);
    const hidden = hiddenSmallBody();
    const list = layerSections as Map<number, Drawn>;
    planList.length = 0;
    for (const d of list.values()) planList.push(d.plan);
    const plan = planDraw(planList, camAu, asteroidLook.budget, margin);
    // Inside the shell of a section the budget left out, the near search adds the bodies close by (near.ts).
    const c = sim.camera.pos;
    const ix = smallBodies.index;
    updateNear(
      plan,
      sim.astroTime.tt + J2000_JD - ix.refEpochJd,
      sim.paused ? 0 : sim.warp / 86_400,
      { x: c.x / AU_KM, y: -c.z / AU_KM, z: c.y / AU_KM },
      { x: ssbWorld.x, y: -ssbWorld.z, z: ssbWorld.y },
      loadedUrls(),
    );
    if (near.version !== nearSeen) {
      nearSeen = near.version;
      for (const d of list.values()) setNear(d, near.picks.get(d.id), group);
    }
    asteroidFrame.drawn = plan.drawn;
    asteroidFrame.near = near.fresh ? [...near.picks.values()].reduce((n, a) => n + a.length, 0) : 0;
    asteroidFrame.limit = near.fresh ? limitWithNear(plan, near.searched, near.limit) : plan.limit;
    for (const d of list.values()) {
      const s = d.section;
      const n = plan.counts.get(s.id) ?? 0;
      d.points.visible = n > 0;
      if (d.near) d.near.visible = d.near.geometry.drawRange.count > 0;
      if (!n && !d.near?.visible) continue;
      d.points.geometry.setDrawRange(0, n);
      d.material.uniforms.uCentreAU.value.copy(s.frame === FRAME_BARY ? ssbWorld : ZERO);
      d.material.uniforms.uHidden.value = hidden && hidden.section === s.id ? hidden.index : -1;
    }
  });

  return <primitive object={group} />;
}

const ZERO = new Vector3();
const planList: PlanSection[] = [];
/** 2.5 / ln 10: magnitudes per unit of ln flux. */
const MAG_PER_LN = 1.0857362;
