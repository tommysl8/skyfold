/**
 * Two nebulae made by their stars, drawn as 3D models round them (sim/stars/stellarNebulae.ts; materials:
 * render/stellarNebulaMaterials.ts):
 *  - Eta Carinae's Homunculus, its two lobes at the shape Smith (2006) measured, growing with the simulation's date
 *    as it has since the 1840s (absent before 1845);
 *  - WR 104's dust pinwheel, turning once every 241.5 days on the simulation's clock.
 *
 * Each is built the first time the camera comes near its star and drawn only while the camera is within a few
 * times its size, fading in; nothing is drawn or allocated otherwise.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, LatheGeometry, Mesh, Points, Quaternion, Vector2, Vector3, type ShaderMaterial } from 'three';
import { createHomunculusMaterial, createPinwheelMaterial } from '../render/stellarNebulaMaterials';
import { psfUniforms } from '../render/materials';
import { sim } from '../sim/sim';
import { smoothstep } from '../sim/deepsky/markers';
import {
  HOMUNCULUS_SHAPE,
  homunculusAxis,
  homunculusScale,
  wr104CoilAu,
  wr104Frame,
  wr104StandoffAu,
  WR104_EPOCH_JD,
  WR104_PA0_DEG,
  WR104_PERIOD_D,
} from '../sim/stars/stellarNebulae';

const AU_KM = 149_597_870.7;
const UP = new Vector3(0, 1, 0);
const DEG = Math.PI / 180;
/** The Homunculus's polar radius in 2005, au (Smith 2006). */
const HOMUNCULUS_POLAR_AU = 21_690;
/** Shown within these multiples of its size, gone beyond the next. */
const HOMUNCULUS_SHOW: readonly [number, number] = [8, 30];
const PINWHEEL_SHOW: readonly [number, number] = [40, 160];
const PINWHEEL_PARTICLES = 24_000;
/** How many coils of the spiral are drawn. */
const PINWHEEL_COILS = 2.6;

/** Both lobes, from the south pole to the north, as a lathe profile in units of the 2005 polar radius. */
function homunculusGeometry(): LatheGeometry {
  const pts: Vector2[] = [];
  const rows = [...HOMUNCULUS_SHAPE];
  for (let i = rows.length - 1; i >= 0; i--) pts.push(new Vector2(Math.cos(rows[i][0] * DEG), -Math.sin(rows[i][0] * DEG)).multiplyScalar(rows[i][1] / HOMUNCULUS_POLAR_AU));
  for (let i = 1; i < rows.length; i++) pts.push(new Vector2(Math.cos(rows[i][0] * DEG), Math.sin(rows[i][0] * DEG)).multiplyScalar(rows[i][1] / HOMUNCULUS_POLAR_AU));
  // Close each lobe at its pole on the axis.
  pts.unshift(new Vector2(0, -1));
  pts.push(new Vector2(0, 1));
  return new LatheGeometry(pts, 96);
}

/** Particles along the spiral: their age in coils and random offsets across the arm. */
function pinwheelGeometry(): BufferGeometry {
  const age = new Float32Array(PINWHEEL_PARTICLES);
  const jit = new Float32Array(3 * PINWHEEL_PARTICLES);
  let seed = 1234567;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  for (let i = 0; i < PINWHEEL_PARTICLES; i++) {
    age[i] = PINWHEEL_COILS * rnd();
    jit[3 * i] = gauss();
    jit[3 * i + 1] = gauss();
    jit[3 * i + 2] = rnd();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(3 * PINWHEEL_PARTICLES), 3));
  g.setAttribute('aAge', new Float32BufferAttribute(age, 1));
  g.setAttribute('aJit', new Float32BufferAttribute(jit, 3));
  return g;
}

const dir = new Vector3();
const q = new Quaternion();

export function StellarNebulae() {
  const homunculus = useRef<{ mesh: Mesh; mat: ShaderMaterial } | null>(null);
  const pinwheel = useRef<{ points: Points; mat: ShaderMaterial } | null>(null);
  const group = useRef<import('three').Group>(null!);
  useEffect(
    () => () => {
      for (const o of [homunculus.current?.mesh, pinwheel.current?.points]) {
        if (!o) continue;
        o.geometry.dispose();
        (o.material as ShaderMaterial).dispose();
      }
    },
    [],
  );

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const year = 1970 + sim.timeMs / (365.25 * 86_400_000);
    // ─── The Homunculus ───
    const eta = sim.bodies['eta-carinae'];
    const scale = homunculusScale(year);
    const sizeKm = HOMUNCULUS_POLAR_AU * AU_KM * scale;
    const oH = eta?.present && scale > 0 ? 1 - smoothstep(HOMUNCULUS_SHOW[0] * sizeKm, HOMUNCULUS_SHOW[1] * sizeKm, eta.distCamera) : 0;
    if (oH > 0 && eta) {
      if (!homunculus.current) {
        const mat = createHomunculusMaterial();
        const mesh = new Mesh(homunculusGeometry(), mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        g.add(mesh);
        homunculus.current = { mesh, mat };
      }
      const { mesh, mat } = homunculus.current;
      mesh.visible = true;
      mesh.position.copy(eta.apparentPos).sub(sim.camera.pos);
      mesh.quaternion.copy(q.setFromUnitVectors(UP, homunculusAxis(dir.copy(eta.pos).normalize())));
      mesh.scale.setScalar(sizeKm);
      const u = mat.uniforms;
      u.uStar.value.copy(mesh.position);
      u.uScale.value = sizeKm;
      u.uGain.value = 0.02 * oH;
    } else if (homunculus.current) homunculus.current.mesh.visible = false;

    // ─── WR 104's pinwheel ───
    const wr = sim.bodies['wr-104'];
    const coilKm = wr104CoilAu() * AU_KM;
    const oP = wr?.present ? 1 - smoothstep(PINWHEEL_SHOW[0] * coilKm, PINWHEEL_SHOW[1] * coilKm, wr.distCamera) : 0;
    if (oP > 0 && wr) {
      if (!pinwheel.current) {
        const mat = createPinwheelMaterial(psfUniforms.uPixelRatio);
        const points = new Points(pinwheelGeometry(), mat);
        points.frustumCulled = false;
        points.renderOrder = 3;
        g.add(points);
        pinwheel.current = { points, mat };
      }
      const { points, mat } = pinwheel.current;
      points.visible = true;
      points.position.copy(wr.apparentPos).sub(sim.camera.pos);
      const f = wr104Frame(dir.copy(wr.pos).normalize());
      const u = mat.uniforms;
      u.uNorth.value.copy(f.north);
      u.uEast.value.copy(f.east);
      u.uNormal.value.copy(f.normal);
      const jd = sim.timeMs / 86_400_000 + 2_440_587.5;
      // The arm's position angle at the standoff now: it turns clockwise (position angle falling) once a period.
      u.uPsi.value = (WR104_PA0_DEG - 360 * ((jd - WR104_EPOCH_JD) / WR104_PERIOD_D)) * DEG;
      u.uStandoff.value = wr104StandoffAu() * AU_KM;
      u.uCoil.value = coilKm;
      u.uViewH.value = sim.viewport.height / 2 / Math.tan((sim.camera.fovDeg * Math.PI) / 360);
      u.uGain.value = 2.4 * oP;
    } else if (pinwheel.current) pinwheel.current.points.visible = false;
  });

  return <group ref={group} />;
}
