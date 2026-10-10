/**
 * Coronal mass ejections in flight on the date (sim/spaceWeather; View › Solar eruptions), a chunk of its own mounted
 * the first time one is in flight near the camera (App.tsx): each front a faint, soft cap flying out along its
 * measured direction at its modelled distance (render/spaceWeatherMaterials.ts places the vertices by the same drag
 * model), fading in as it leaves the corona, out between 1.8 and 3 au, and where the camera is near it for its size.
 *
 * Guides, not light: drawn in the classical view (GUIDES_LAYER), far brighter than a real CME (see the material).
 * Cost: one draw of a 3,100-vertex cap per front shown (at most MAX_FRONTS), the pixels it covers added three times at most;
 * nothing while none is in flight (the meshes not even visible). Measured in docs/data/space-weather.md §6.
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, type ShaderMaterial } from 'three';
import { SUN_RADIUS_KM } from '../physics/constants';
import { createFrontGeometry, createFrontMaterial } from '../render/spaceWeatherMaterials';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { sim } from '../sim/sim';
import { spaceWeather } from '../sim/spaceWeather';
import { frontKm, frontShare, type Cme } from '../sim/spaceWeather/cmes';
import { R0_KM } from '../sim/spaceWeather/dbm';

/** The most fronts drawn at once (the nearest and largest on the screen). */
const MAX_FRONTS = 6;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Pixels per km at a distance (the camera's vertical field). */
const pxPerKm = (dist: number) => sim.viewport.height / 2 / Math.tan((sim.camera.fovDeg * Math.PI) / 360) / Math.max(dist, 1e-9);

const sunRel = new Vector3();
const axis = new Vector3();
const e1 = new Vector3();
const e2 = new Vector3();
const UP = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);

/** A CME's seed for its mottling, from its id. */
function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h / 97;
}

interface Candidate {
  c: Cme;
  share: number;
  px: number;
}

export default function SpaceWeather() {
  const geometry = useMemo(() => createFrontGeometry(), []);
  const meshes = useMemo(() => {
    const list: Mesh<typeof geometry, ShaderMaterial>[] = [];
    for (let i = 0; i < MAX_FRONTS; i++) {
      const m = new Mesh(geometry, createFrontMaterial());
      m.frustumCulled = false;
      m.visible = false;
      m.renderOrder = 3;
      m.layers.set(GUIDES_LAYER);
      list.push(m);
    }
    return list;
  }, [geometry]);
  useEffect(
    () => () => {
      geometry.dispose();
      for (const m of meshes) m.material.dispose();
    },
    [geometry, meshes],
  );
  const picks = useMemo<Candidate[]>(() => [], []);
  // For the development tools: window.__cmeFronts.
  if (import.meta.env.DEV) Object.assign(window, { __cmeFronts: meshes });

  useFrame(() => {
    const sun = sim.bodies.sun;
    spaceWeather.shown.clear();
    picks.length = 0;
    if (spaceWeather.want && sun) {
      sunRel.copy(sun.apparentPos).sub(sim.camera.pos);
      const k = pxPerKm(sunRel.length());
      for (const c of spaceWeather.flying) {
        const share = frontShare(c, sim.timeMs);
        const px = frontKm(c, 0, sim.timeMs) * k;
        // In as the front grows past a few tens of pixels from the Sun.
        const s = share * smooth(12, 50, px);
        if (s > 0.01) picks.push({ c, share: s, px });
      }
      picks.sort((a, b) => b.share * Math.min(b.px, 400) - a.share * Math.min(a.px, 400));
    }
    const ms = sim.timeMs;
    for (let i = 0; i < MAX_FRONTS; i++) {
      const m = meshes[i];
      const p = picks[i];
      if (!p) {
        m.visible = false;
        continue;
      }
      const { c } = p;
      spaceWeather.shown.set(c.id, p.share);
      axis.set(c.axis[0], c.axis[1], c.axis[2]);
      e1.crossVectors(axis, Math.abs(axis.y) < 0.9 ? UP : X).normalize();
      e2.crossVectors(axis, e1);
      const u = m.material.uniforms;
      u.uSun.value.copy(sunRel);
      u.uAxis.value.copy(axis);
      u.uE1.value.copy(e1);
      u.uE2.value.copy(e2);
      u.uOmega.value = c.halfWidth;
      u.uT.value = (ms - c.t21Ms) / 1000;
      u.uR0.value = R0_KM;
      u.uV0.value = c.speed;
      u.uGamma.value = c.gamma;
      u.uW.value = c.w;
      u.uRsun.value = SUN_RADIUS_KM;
      u.uOpacity.value = p.share;
      u.uSeed.value = seedOf(c.id);
      m.visible = true;
    }
  });
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
