import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, type Object3D } from 'three';
import { blackbodyRgb } from '../physics/blackbody';
import { SUN_TEFF_K } from '../physics/constants';
import { registryVersion, subscribeRegistry, type BodyId } from '../sim/bodies';
import { bodyEntries } from '../sim/bodies/registry';
import { createGlintMaterial } from '../render/materials';
import { lens } from '../render/lens/lensState';
import { gravity } from '../sim/gravity';
import type { FlowPoint } from '../sim/blackholes/accretion';
import { holeFlowPoint, lensOnBodies, MAG_PER_LN, unlensedLnG } from '../sim/lensBodies';
import { sim } from '../sim/sim';
import { POINTS_LAYER } from '../render/LightspeedScenePass';

/**
 * Glints farther than this are drawn at this distance along their true direction (their
 * brightness comes from the float64 magnitude, not the distance). The shader squares the
 * position, and float32 overflows above ~1.8 × 10¹⁹ km; 10¹⁶ km (about 1,000 light-years)
 * leaves a wide margin.
 */
const GLINT_MAX_KM = 1e16;

/**
 * Vertices for the second and third images of bodies bent round a black hole (sim/lensBodies.ts), shared
 * out each frame: a body's first image keeps its own vertex. Near Sgr A* a handful of bodies (the S-stars,
 * the Sun) have them; 32 bodies' worth is far more than any view needs.
 */
const EXTRA_SLOTS = 64;

/** The flow's point of a hole with none: V 99 (nothing), the power law's 1 − α = 1.5 (F_ν ∝ ν^−0.5). */
const FLOW_SPEC_DEFAULT = 1.5;

/**
 * Every body is also drawn as a point source with its real apparent magnitude. At true scale
 * a planet is usually far smaller than a pixel, yet it still shines, just as Jupiter or Venus
 * do in the night sky. The glint fades out once the disc is resolved. One draw for all of
 * them, however many are registered; the buffers are rebuilt when the registry changes.
 *
 * Near a black hole: each body's first vertex draws its primary image, and
 * up to EXTRA_SLOTS more its second and third, all at the directions, magnitudes (aMag with the
 * magnification and gravity folded in) and frequency factors (aLnDx) sim/lensBodies.ts computes
 * exactly; bodies the lens leaves in place get the observer's gravitational blueshift; images at a
 * near-perfect alignment fade as their ring fades in (scene/LensRings.tsx); a star the lens draws as
 * a sphere (lens.spheres) has no glint; a black hole's glint is its accretion flow's unresolved
 * point, a power law (aSpec), fading by the flow's own point share as its resolved image takes over.
 * Far from holes every vertex is what it always was and the extra ones are not drawn.
 *
 * Cost: one draw of the bodies' vertices and at most EXTRA_SLOTS more; per frame one loop over the bodies
 * writing typed arrays, no allocation. Twins: render/shaders/glints.vert.glsl (the shader), sim/lensBodies.ts
 * (the images it draws).
 */
export function Glints() {
  const version = useSyncExternalStore(subscribeRegistry, registryVersion);
  const material = useMemo(createGlintMaterial, []);
  const geometry = useMemo(() => {
    const list = bodyEntries();
    const n = list.length;
    const N = n + EXTRA_SLOTS;
    const g = new BufferGeometry();
    const dyn = (arr: Float32Array, size: number) => new BufferAttribute(arr, size).setUsage(DynamicDrawUsage);
    g.setAttribute('position', dyn(new Float32Array(N * 3), 3));
    g.setAttribute('aMag', dyn(new Float32Array(N).fill(99), 1));
    g.setAttribute('aFade', dyn(new Float32Array(N), 1));
    g.setAttribute('aRadius', dyn(new Float32Array(N), 1));
    g.setAttribute('aLnDx', dyn(new Float32Array(N), 1));
    const color = new Float32Array(N * 3);
    const temp = new Float32Array(N).fill(SUN_TEFF_K); // reflected sunlight has the Sun's spectrum
    const limit = new Float32Array(N);
    const spec = new Float32Array(N);
    // Bodies a layer of their own draws (the Galaxy's clusters, the nebulae) get no point of light here.
    const own = new Uint8Array(n);
    // Black holes: their point is the accretion flow's.
    const hole = new Uint8Array(n);
    const sun = blackbodyRgb(SUN_TEFF_K);
    // Stars whose colour changes with the date (a supernova's light curve): their colour is rewritten when it changes.
    const variable: number[] = [];
    list.forEach((e, i) => {
      if (e.record.visual?.renderer === 'layer') own[i] = 1;
      if (e.record.kind === 'black-hole') {
        hole[i] = 1;
        spec[i] = FLOW_SPEC_DEFAULT;
        limit[i] = 1;
        color.set([1, 1, 1], i * 3);
        return;
      }
      const lum = e.record.physical.luminous;
      if (lum) {
        // A star: its own blackbody spectrum, and the star field's limiting magnitude.
        temp[i] = lum.teffK;
        limit[i] = 1;
        color.set(blackbodyRgb(lum.teffK), i * 3);
        if (lum.variable) variable.push(i);
        return;
      }
      const c = new Color(e.record.physical.colour);
      const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b || 1;
      color.set([(c.r / l) * sun[0], (c.g / l) * sun[1], (c.b / l) * sun[2]], i * 3);
    });
    // The extra vertices take their body's colour, temperature and limit when handed out.
    g.setAttribute('aColor', dyn(color, 3));
    g.setAttribute('aTemp', dyn(temp, 1));
    g.setAttribute('aLimit', dyn(limit, 1));
    g.setAttribute('aSpec', dyn(spec, 1));
    g.setDrawRange(0, n);
    // The registry this geometry was built from: its slots are that registry's bodies, in its order.
    g.userData.registry = registryVersion();
    g.userData.own = own;
    g.userData.hole = hole;
    g.userData.variable = Int32Array.from(variable);
    g.userData.bodies = n;
    // Which body each extra vertex holds (its colours are that body's), −1 for none.
    g.userData.extraOwner = new Int32Array(EXTRA_SLOTS).fill(-1);
    return g;
    // Rebuilt when bodies are registered or removed.
  }, [version]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const points = useRef<Object3D | null>(null);
  useFrame(({ gl }) => {
    const list = bodyEntries();
    const pos = geometry.attributes.position as BufferAttribute;
    const n = geometry.userData.bodies as number;
    // The registry changed since the geometry was built (even if the count did not: a star
    // released and another registered in one tick, a record replaced): its colours and slots are
    // another list's. Draw nothing for the frame until the new geometry is in.
    const current = geometry.userData.registry === registryVersion() && n === list.length;
    if (points.current) points.current.visible = current;
    if (!current) return;
    const mag = geometry.attributes.aMag as BufferAttribute;
    const fade = geometry.attributes.aFade as BufferAttribute;
    const rad = geometry.attributes.aRadius as BufferAttribute;
    const lnDx = geometry.attributes.aLnDx as BufferAttribute;
    // Straight into the typed arrays (setXYZ and setX cost a call and a boxed number each).
    const P = pos.array as Float32Array;
    const M = mag.array as Float32Array;
    const F = fade.array as Float32Array;
    const R = rad.array as Float32Array;
    const X = lnDx.array as Float32Array;
    const cam = sim.camera.pos;
    const own = geometry.userData.own as Uint8Array;
    const hole = geometry.userData.hole as Uint8Array;
    const lensed = lensOnBodies();
    const spheres = lens.spheres;
    let extra = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i].state;
      const fadeR = 1 - Math.min(1, Math.max(0, (b.radiusPx - 1.2) / 2.5));
      if (hole[i]) {
        // The flow's point, at the hole: exactly placed for the active one (the heliocentric difference is
        // 32 km coarse at Sgr A*), faded by the flow's own share as its resolved image takes over.
        const fp = holeFlowPoint(b.id);
        const active = b.id === gravity.hole;
        const c = gravity.camRelHoleKm;
        const x = active ? -c.x : b.apparentPos.x - cam.x;
        const y = active ? -c.y : b.apparentPos.y - cam.y;
        const z = active ? -c.z : b.apparentPos.z - cam.z;
        const d = Math.sqrt(x * x + y * y + z * z);
        const k = d > GLINT_MAX_KM ? GLINT_MAX_KM / d : 1;
        P[3 * i] = x * k;
        P[3 * i + 1] = y * k;
        P[3 * i + 2] = z * k;
        M[i] = b.present ? b.magnitude : 99;
        F[i] = fp ? fp.pointShare : 1;
        R[i] = 0;
        X[i] = 0;
        if (fp) flowLook(i, fp);
        continue;
      }
      const L = lensed ? b.lens : null;
      if (L && L.count > 0) {
        const hidden = own[i] === 1 || isSphere(spheres, b.id);
        const d = b.distCamera;
        for (let j = 0; j < L.count; j++) {
          const img = L.images[j];
          let s = i;
          if (j > 0) {
            if (hidden || extra >= EXTRA_SLOTS) break;
            s = n + extra;
            claimExtra(extra, i);
            extra++;
          }
          const k = d > GLINT_MAX_KM ? GLINT_MAX_KM : d;
          P[3 * s] = img.dir.x * k;
          P[3 * s + 1] = img.dir.y * k;
          P[3 * s + 2] = img.dir.z * k;
          M[s] = hidden ? 99 : img.magLensed;
          F[s] = fadeR * img.share;
          R[s] = b.displayRadius * (k / Math.max(d, 1e-300));
          X[s] = img.lnDx;
        }
        continue;
      }
      // Floating origin: camera-relative position computed in float64.
      const p = b.apparentPos;
      const x = p.x - cam.x;
      const y = p.y - cam.y;
      const z = p.z - cam.z;
      const d = Math.sqrt(x * x + y * y + z * z);
      const k = d > GLINT_MAX_KM ? GLINT_MAX_KM / d : 1;
      P[3 * i] = x * k;
      P[3 * i + 1] = y * k;
      P[3 * i + 2] = z * k;
      if (lensed) {
        // Left where it is by the lens, but blueshifted like all light reaching an observer near a hole: the
        // shader's shift for ln g takes 2 ln g off as a solid angle, which gravity does not change.
        const lnG = unlensedLnG(x, y, z);
        M[i] = own[i] ? 99 : b.magnitude - 2 * MAG_PER_LN * lnG;
        X[i] = lnG;
      } else {
        M[i] = own[i] ? 99 : b.magnitude;
        X[i] = 0;
      }
      F[i] = fadeR;
      R[i] = b.displayRadius * k;
    }
    // Extra vertices no longer in use draw nothing.
    const owner = geometry.userData.extraOwner as Int32Array;
    for (let s = extra; s < EXTRA_SLOTS; s++) {
      if (owner[s] < 0) break;
      owner[s] = -1;
      M[n + s] = 99;
      F[n + s] = 0;
    }
    geometry.setDrawRange(0, n + extra);
    pos.needsUpdate = mag.needsUpdate = fade.needsUpdate = rad.needsUpdate = lnDx.needsUpdate = true;
    const variable = geometry.userData.variable as Int32Array;
    for (let k = 0; k < variable.length; k++) starColour(variable[k], list[variable[k]].record.physical.luminous!.teffK);
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
  });

  /** A hole's point takes its flow's colour and power law, aSpec = 1 − α (uploaded only when they change). */
  function flowLook(i: number, fp: FlowPoint): void {
    const rgb = fp.rgb;
    const spec = 1 - fp.spectralIndex;
    const col = geometry.attributes.aColor as BufferAttribute;
    const sp = geometry.attributes.aSpec as BufferAttribute;
    const C = col.array as Float32Array;
    const S = sp.array as Float32Array;
    if (C[3 * i] === Math.fround(rgb[0]) && C[3 * i + 1] === Math.fround(rgb[1]) && C[3 * i + 2] === Math.fround(rgb[2]) && S[i] === Math.fround(spec)) return;
    C[3 * i] = rgb[0];
    C[3 * i + 1] = rgb[1];
    C[3 * i + 2] = rgb[2];
    S[i] = spec;
    col.needsUpdate = sp.needsUpdate = true;
  }

  /** A star whose temperature changes (sim/phenomena): its colour and temperature (uploaded only when they change by 0.5 % or more). */
  function starColour(i: number, teffK: number): void {
    const temp = geometry.attributes.aTemp as BufferAttribute;
    const T = temp.array as Float32Array;
    if (Math.abs(T[i] - teffK) <= 0.005 * teffK) return;
    const col = geometry.attributes.aColor as BufferAttribute;
    const C = col.array as Float32Array;
    const rgb = blackbodyRgb(teffK);
    T[i] = teffK;
    C[3 * i] = rgb[0];
    C[3 * i + 1] = rgb[1];
    C[3 * i + 2] = rgb[2];
    col.needsUpdate = temp.needsUpdate = true;
  }

  /** Give extra vertex s the colour, temperature and limit of body i (uploaded only when its owner changes). */
  function claimExtra(s: number, i: number): void {
    const owner = geometry.userData.extraOwner as Int32Array;
    if (owner[s] === i) return;
    owner[s] = i;
    const n = geometry.userData.bodies as number;
    const col = geometry.attributes.aColor as BufferAttribute;
    const temp = geometry.attributes.aTemp as BufferAttribute;
    const lim = geometry.attributes.aLimit as BufferAttribute;
    const C = col.array as Float32Array;
    const T = temp.array as Float32Array;
    const Li = lim.array as Float32Array;
    const t = n + s;
    C[3 * t] = C[3 * i];
    C[3 * t + 1] = C[3 * i + 1];
    C[3 * t + 2] = C[3 * i + 2];
    T[t] = T[i];
    Li[t] = Li[i];
    col.needsUpdate = temp.needsUpdate = lim.needsUpdate = true;
  }

  return (
    <points
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={20}
      ref={(o) => {
        points.current = o;
        o?.layers.set(POINTS_LAYER);
      }}
    />
  );
}

/** Whether the lens draws this body as a sphere of its own (its glint is then left out). */
function isSphere(spheres: readonly BodyId[], id: BodyId): boolean {
  for (let i = 0; i < spheres.length; i++) if (spheres[i] === id) return true;
  return false;
}
