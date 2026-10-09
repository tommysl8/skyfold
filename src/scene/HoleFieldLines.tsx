/**
 * The ordered magnetic field threading a black hole (sim/blackholes/holeField.ts; material: render/holeFieldMaterial.ts),
 * with View › Magnetic field lines on: Sgr A*'s and M87*'s, matched to the EHT's polarisation, and the other holes
 * with a drawn disc or jet, illustrative. A chunk of its own, mounted only while the switch is on (App.tsx).
 *
 * Which hole: the one whose lens is drawn, when it has a field; with the lens off, the nearest such hole. Drawn while
 * the camera is within 3,000 M of it (fully within 400 M). With the lens drawn the lines are lensed by the exact point
 * lens, both images; its program is compiled in the background the first time it is wanted (about a second), and until
 * it has, or where the exact solver does not apply (a fall's raindrop frame, a camera inside the photon sphere), the
 * lines are not drawn rather than drawn where no light comes from. With the lens off they are drawn straight.
 *
 * The lines are guides (false colour, not light), on the orbit lines' layer: in flight's relativistic view they are left
 * out, as the orbit lines are.
 *
 * Cost: nothing far from these holes (a distance test a frame); near one, one line set of about 12,000 vertices, two
 * images, each vertex one exact solve (docs/data/blackholes.md §14).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, LineSegments, Matrix3, Vector3, type ShaderMaterial } from 'three';
import { createHoleFieldMaterial, holeFieldUniforms } from '../render/holeFieldMaterial';
import { lens } from '../render/lens/lensState';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { variantCompiled } from '../render/lensVariants';
import { fieldAxisWorld } from '../sim/blackholes/fieldAxis';
import { HOLE_FIELDS, holeFieldLines } from '../sim/blackholes/holeField';
import { getBody, type BodyId } from '../sim/bodies';
import { smoothstep } from '../sim/deepsky/markers';
import { sim } from '../sim/sim';

/** Drawn fully within this many M of the hole, and not beyond the next. */
const SHOW_M: readonly [number, number] = [400, 3000];
/** Not drawn inside this radius while lensed (the exact solver's photon-sphere limit, with a margin), M. */
const LENSED_INNER_M = 3.2;
/** The jet's lines run out to this radius, M (the disc's to half of it). */
const REACH_M = 60;

const IDS = Object.keys(HOLE_FIELDS) as BodyId[];

interface Built {
  id: BodyId;
  rot: Matrix3;
  mKm: number;
}

export default function HoleFieldLines() {
  const uniforms = useMemo(holeFieldUniforms, []);
  const mats = useMemo(
    () => ({ plain: createHoleFieldMaterial(uniforms, false), exact0: createHoleFieldMaterial(uniforms, true, 0), exact1: createHoleFieldMaterial(uniforms, true, 1) }),
    [uniforms],
  );
  const lines = useMemo(() => {
    const a = new LineSegments(new BufferGeometry(), mats.plain);
    const b = new LineSegments(a.geometry, mats.exact1);
    for (const l of [a, b]) {
      l.frustumCulled = false;
      l.visible = false;
      l.renderOrder = 1;
      // A guide, as the orbit lines are: drawn in the view itself, not in the scene pass's cube (where it would be
      // aberrated and Doppler shifted as light, and would make the cube live near a hole).
      l.layers.set(GUIDES_LAYER);
    }
    return [a, b] as const;
  }, [mats]);
  const built = useRef<Built | null>(null);
  useEffect(
    () => () => {
      lines[0].geometry.dispose();
      for (const m of Object.values(mats)) (m as ShaderMaterial).dispose();
    },
    [lines, mats],
  );

  useFrame(({ gl, camera }) => {
    const [l0, l1] = lines;
    // The hole: the lens's, if it has a field; else the nearest with one.
    let id: BodyId | null = null;
    const lensed = lens.active && lens.hole !== null;
    if (lensed) id = HOLE_FIELDS[lens.hole!] ? lens.hole : null;
    else {
      let best = Infinity;
      for (const h of IDS) {
        const b = sim.bodies[h];
        const rs = getBody(h)?.blackHole?.rsKm;
        if (!b?.present || !rs) continue;
        const dM = b.distCamera / (rs / 2);
        if (dM < best) {
          best = dM;
          id = h;
        }
      }
    }
    const rec = id ? getBody(id)?.blackHole : undefined;
    const b = id ? sim.bodies[id] : undefined;
    const mKm = rec ? rec.rsKm / 2 : 0;
    const distM = b && mKm > 0 ? (lensed ? lens.holeM.length() : b.distCamera / mKm) : Infinity;
    const o = 1 - smoothstep(SHOW_M[0], SHOW_M[1], distM);
    if (!id || !rec || !b || !(o > 0)) {
      l0.visible = l1.visible = false;
      return;
    }
    if (built.current?.id !== id) {
      const spec = HOLE_FIELDS[id];
      const z = fieldAxisWorld(id, new Vector3());
      if (!z) {
        l0.visible = l1.visible = false;
        return;
      }
      const f = holeFieldLines(spec.spin, REACH_M);
      const g = l0.geometry;
      g.setAttribute('position', new BufferAttribute(f.positions, 3));
      g.setAttribute('aOther', new BufferAttribute(f.other, 3));
      g.setAttribute('aArc', new BufferAttribute(f.arc, 1));
      g.setAttribute('aPol', new BufferAttribute(f.pol, 1));
      g.setAttribute('aFlow', new BufferAttribute(f.flow, 1));
      g.setAttribute('aW', new BufferAttribute(f.weight, 1));
      g.computeBoundingSphere();
      const x = new Vector3(1, 0, 0).cross(z);
      if (x.lengthSq() < 1e-6) x.set(0, 1, 0).cross(z);
      x.normalize();
      const y = new Vector3().crossVectors(z, x);
      built.current = { id, rot: new Matrix3().set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z), mKm };
    }
    const u = uniforms;
    u.uRot.value.copy(built.current.rot);
    u.uMKm.value = mKm;
    // The hole from the camera: the lens's float64 vector near it, else the bodies'.
    if (lensed) u.uHoleCam.value.copy(lens.holeM).multiplyScalar(lens.mKm);
    else u.uHoleCam.value.copy(b.apparentPos).sub(sim.camera.pos);
    u.uTime.value = (performance.now() / 1000) % 3600;
    u.uOpacity.value = o;
    if (lensed) {
      // The exact program once compiled, and only where its solver applies; else nothing (not straight lines).
      const applies = lens.obs.frame === 'static' && lens.obs.r > 3;
      const ready = applies && variantCompiled(gl, camera, mats.exact0, 'lines');
      u.uInnerM.value = LENSED_INNER_M;
      l0.material = mats.exact0;
      l0.visible = l1.visible = ready;
    } else {
      u.uInnerM.value = 2;
      l0.material = mats.plain;
      l0.visible = true;
      l1.visible = false;
    }
  });

  return (
    <>
      <primitive object={lines[0]} />
      <primitive object={lines[1]} />
    </>
  );
}
