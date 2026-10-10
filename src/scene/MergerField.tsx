/**
 * GW170817's magnetic fields (sim/deepsky/mergerField.ts; material: render/mergerFieldMaterial.ts), with View ›
 * Magnetic field lines on: the two stars' dipoles carried round their orbit and meeting as they close in, the burst
 * of reconnection at the merger, and the remnant's wound field and jet funnel. A model throughout (the stars' fields
 * were not measured), on the kilonova's card and in docs/data/phenomena.md.
 *
 * The kilonova's model (scene/Phenomena.tsx) fills `mergerView` each frame with the place, the orbit's frame and
 * phase it draws the stars with; this draws after it. Built the first time the switch is on near GW170817; nothing is
 * made or drawn while it is off.
 *
 * Cost: a few thousand segments while near GW170817 with the switch on; nothing otherwise.
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, LineSegments, Vector3 } from 'three';
import { GM_SUN_KM3_S2, C_KM_S } from '../physics/constants';
import { createMergerFieldMaterial } from '../render/mergerFieldMaterial';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { inspiralField, mergerStage, REMNANT_MASS_MSUN, remnantField } from '../sim/deepsky/mergerField';
import type { FieldLineSet } from '../sim/deepsky/magnetosphere';
import { M1_MSUN, M2_MSUN, MERGER_MS, NS_RADIUS_KM } from '../sim/phenomena/kilonova';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

/** What the kilonova's model draws this frame (Phenomena.tsx fills it). */
export const mergerView = {
  on: false,
  /** The centre of mass from the camera, km. */
  centre: new Vector3(),
  /** The orbit's axis, and the direction to the heavier star now (world, unit). */
  n: new Vector3(0, 1, 0),
  dir: new Vector3(1, 0, 0),
  /** The separation, km (0 once merged). */
  sepKm: 0,
};

/** The separation the burst starts from: the stars touching, km. */
const CONTACT_KM = 2 * NS_RADIUS_KM;
/** The remnant's M, km. */
const REMNANT_M_KM = (GM_SUN_KM3_S2 * REMNANT_MASS_MSUN) / (C_KM_S * C_KM_S);

function geometry(f: FieldLineSet): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(f.positions, 3));
  g.setAttribute('aArc', new BufferAttribute(f.arc, 1));
  g.setAttribute('aPol', new BufferAttribute(f.pol, 1));
  g.setAttribute('aFlow', new BufferAttribute(f.flow, 1));
  g.setAttribute('aW', new BufferAttribute(f.weight, 1));
  return g;
}

const y = new Vector3();

export function MergerField() {
  const parts = useMemo(() => {
    const mats = [createMergerFieldMaterial(0), createMergerFieldMaterial(1)] as const;
    const lines = mats.map((m) => {
      const l = new LineSegments(new BufferGeometry(), m);
      l.frustumCulled = false;
      l.visible = false;
      l.renderOrder = 1;
      // A guide, on the orbit lines' layer (scene/HoleFieldLines.tsx says why).
      l.layers.set(GUIDES_LAYER);
      return l;
    });
    return { mats, lines, built: false };
  }, []);
  useEffect(
    () => () => {
      for (const l of parts.lines) l.geometry.dispose();
      for (const m of parts.mats) m.dispose();
    },
    [parts],
  );

  useFrame(() => {
    const [insp, rem] = parts.lines;
    const on = mergerView.on && useUI.getState().fieldLines;
    const t = (sim.timeMs - MERGER_MS) / 1000;
    const st = mergerStage(t);
    if (!on || !(st.fade > 0)) {
      insp.visible = rem.visible = false;
      return;
    }
    if (!parts.built) {
      insp.geometry.dispose();
      rem.geometry.dispose();
      insp.geometry = geometry(inspiralField(M1_MSUN, M2_MSUN));
      rem.geometry = geometry(remnantField());
      parts.built = true;
    }
    const v = mergerView;
    y.crossVectors(v.n, v.dir);
    for (const l of parts.lines) {
      l.position.copy(v.centre);
      const u = (l.material as typeof parts.mats[0]).uniforms;
      u.uRot.value.set(v.dir.x, y.x, v.n.x, v.dir.y, y.y, v.n.y, v.dir.z, y.z, v.n.z);
      u.uTime.value = (performance.now() / 1000) % 3600;
    }
    // The inspiral, then the burst from the stars touching.
    const sep = st.stage === 'inspiral' ? Math.max(v.sepKm, CONTACT_KM) : CONTACT_KM;
    const ui = insp.material as typeof parts.mats[0];
    const mTot = M1_MSUN + M2_MSUN;
    ui.uniforms.uScale.value = sep;
    ui.uniforms.uStar1.value.set(M2_MSUN / mTot, 0, 0);
    ui.uniforms.uStar2.value.set(-M1_MSUN / mTot, 0, 0);
    ui.uniforms.uStarR.value = NS_RADIUS_KM / sep;
    // The orbit's light cylinder c/Ω, Ω from Kepler's law at this separation.
    ui.uniforms.uLc.value = C_KM_S / Math.sqrt((GM_SUN_KM3_S2 * mTot) / sep ** 3) / sep;
    ui.uniforms.uBurst.value = st.stage === 'burst' ? st.burst : 0;
    ui.uniforms.uOpacity.value = st.stage === 'remnant' ? 0 : 1;
    insp.visible = st.stage !== 'remnant';
    // The remnant: its torus and funnel fading in through the burst, the funnel growing after 60 ms.
    const ur = (rem.material as typeof parts.mats[1]).uniforms;
    // The funnel's lines reach 60 M; once it grows, the whole is drawn scaled up with it (its shape kept).
    ur.uScale.value = REMNANT_M_KM * Math.max(1, st.funnelKm / (60 * REMNANT_M_KM));
    ur.uOpacity.value = st.remnant * st.fade;
    rem.visible = st.remnant > 0;
  });

  return (
    <>
      <primitive object={parts.lines[0]} />
      <primitive object={parts.lines[1]} />
    </>
  );
}
