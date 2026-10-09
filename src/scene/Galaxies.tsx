import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferAttribute,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Sphere,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { createGalaxiesMaterial } from '../render/materials';
import { GALAXY_LAYER, galaxyLayer } from '../render/galaxyLayer';
import { KPC_KM } from '../physics/constants';
import { modelShare } from '../sim/galaxy/background';
import { cosmosState, cosmosVersion, subscribeCosmos } from '../sim/cosmos/load';
import { TEMPLATE_UNIT_R25, type GalaxyShape } from '../sim/cosmos/records';
import type { Template, TemplateId } from '../sim/cosmos/templates';
import { sim } from '../sim/sim';
import { cosmicSky } from '../sim/cosmos/expansion';
import { pictureShares } from './GalaxyPictures';

/** Floats per instance: centre (3), axes x, y, z (9), normal (3), luminosity and splat scale (2), dust (4), ln(1 + z) (1). */
const STRIDE = 22;

/**
 * A galaxy is drawn with its template's particles once its radius on screen passes DETAIL_PX[0]
 * CSS px, fully from DETAIL_PX[1]; below that it is one splat of all its light. The two crossfade.
 */
export const DETAIL_PX: readonly [number, number] = [2, 6];

/**
 * A galaxy with a fine template (sim/cosmos/templates.ts HD_DETAIL: eight times the particles, smaller splats) is drawn
 * with it once its radius on screen passes FINE_PX[0] CSS px, fully from FINE_PX[1]; the two crossfade. Only a few
 * galaxies are ever that large at once, so the extra particles cost little.
 */
export const FINE_PX: readonly [number, number] = [90, 180];

/** A batch's key: the template, and whether it is the fine one. */
const batchKey = (id: TemplateId, fine: boolean): string => (fine ? `${id}+fine` : id);

/** Galaxies fainter than this as a whole, seen from the camera, are skipped (nothing of them could show). */
const FAINTEST_MAG = 28;

interface Batch {
  key: string;
  template: TemplateId;
  geometry: InstancedBufferGeometry;
  buffer: InstancedInterleavedBuffer;
  capacity: number;
}

/** A shape's constants for the frame loop: its axes in kpc and its splat scale. */
interface Prepared {
  shape: GalaxyShape;
  axes: Float32Array;
  splatKpc: number;
  radiusKpc: number;
  absMag: number;
}

function prepare(s: GalaxyShape): Prepared {
  const axes = new Float32Array(9);
  let stretch = 1;
  s.axes.forEach((a, k) => {
    axes.set([a[0] * s.scaleKpc, a[1] * s.scaleKpc, a[2] * s.scaleKpc], 3 * k);
    stretch *= Math.hypot(a[0], a[1], a[2]);
  });
  const radiusKpc = TEMPLATE_UNIT_R25.has(s.template) ? s.scaleKpc : 2 * s.halfLightKpc;
  return { shape: s, axes, splatKpc: s.scaleKpc * Math.cbrt(stretch), radiusKpc, absMag: 4.83 - 2.5 * Math.log10(Math.max(s.lumV, 1e-30)) };
}

function batch(t: Template, capacity: number): Batch {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(t.position, 3));
  g.setAttribute('aColor', new BufferAttribute(t.colour, 3));
  g.setAttribute('aAttr', new BufferAttribute(t.attrs, 4));
  const buffer = new InstancedInterleavedBuffer(new Float32Array(Math.max(1, capacity) * STRIDE), STRIDE, 1);
  buffer.setUsage(DynamicDrawUsage);
  const at = (name: string, size: number, offset: number) => g.setAttribute(name, new InterleavedBufferAttribute(buffer, size, offset));
  at('iCentre', 3, 0);
  at('iAxX', 3, 3);
  at('iAxY', 3, 6);
  at('iAxZ', 3, 9);
  at('iNormal', 3, 12);
  at('iLum', 2, 15);
  at('iDust', 4, 17);
  at('iLn1pz', 1, 21);
  g.instanceCount = 0;
  // Never culled or sorted: skip three.js's bounding sphere.
  g.boundingSphere = new Sphere(new Vector3(), Infinity);
  return { key: batchKey(t.id, t.detail > 1), template: t.id, geometry: g, buffer, capacity: Math.max(1, capacity) };
}

const cam = new Vector3();

/**
 * The galaxies beyond the Milky Way (sim/cosmos): each one near enough for its shape to show is its
 * morphological template of a few thousand particles, scaled to its measured size, tilted as it
 * lies and as bright as it is, one instanced draw per template; the others are one splat each of
 * all their light. All of it goes into the Galaxy's own target (render/galaxyLayer.ts), where it is
 * added up and shown with the same law as the Milky Way's light. The Milky Way's satellites are part
 * of the sky map from the Sun, so near the Sun they fade out with the model of the Galaxy.
 *
 * Each galaxy's light is the light that reaches the camera (sim/cosmos/expansion.ts): redshifted by
 * the expansion of space between its bound structure and the camera's, ln(1 + z) per instance, and
 * in the shader shifted by the ship's own motion too (as a black body seen at T D / (1 + z)).
 * Drawn where it was when the light left (light-delayed positions), its distance is the
 * angular-diameter distance a_e χ rather than a_o χ, so its flux takes (a_e / a_o)² here to stay the
 * flux that arrives.
 */
export function Galaxies() {
  const version = useSyncExternalStore(subscribeCosmos, cosmosVersion);
  const material = useMemo(createGalaxiesMaterial, []);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const [set, setSet] = useState<{ batches: Map<string, Batch>; prepared: Prepared[]; templates: Template[] } | null>(null);

  useEffect(() => {
    const templates = cosmosState.templates;
    const shapes = cosmosState.shapes;
    if (!templates || !shapes.length || set?.templates === templates) return;
    const counts = new Map<TemplateId, number>();
    for (const s of shapes) counts.set(s.template, (counts.get(s.template) ?? 0) + 1);
    const batches = new Map<string, Batch>();
    for (const t of templates) {
      const n = t.id === 'point' ? shapes.length : (counts.get(t.id) ?? 0);
      if (n > 0) {
        const b = batch(t, n);
        batches.set(b.key, b);
      }
    }
    setSet({ batches, prepared: shapes.map(prepare), templates });
    // `version` stands for cosmosState.templates.
  }, [version]);
  useEffect(() => () => set?.batches.forEach((b) => b.geometry.dispose()), [set]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ gl }) => {
    if (!set) {
      galaxyLayer.wants.galaxies = false;
      return;
    }
    const counts = new Map<string, number>();
    set.batches.forEach((b) => counts.set(b.key, 0));
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const pxPerRadCss = sim.viewport.height / 2 / tanHalf;
    cam.copy(sim.camera.pos);
    const skyShare = modelShare(cam.length());
    let any = false;
    const point = set.batches.get('point')!;
    const retarded = cosmicSky.retarded;
    for (const p of set.prepared) {
      const s = p.shape;
      const b = sim.bodies[s.id];
      if (!b?.present) continue;
      const ln1pz = cosmicSky.byId.get(s.id)?.ln1pz ?? 0;
      if (ln1pz === Infinity) continue; // none of its light has reached the camera
      const gain = (s.inSkyMap ? skyShare : 1) * (retarded && ln1pz > 0 ? Math.exp(-2 * ln1pz) : 1);
      if (gain <= 1e-3 && s.inSkyMap) continue;
      const x = (b.apparentPos.x - cam.x) / KPC_KM;
      const y = (b.apparentPos.y - cam.y) / KPC_KM;
      const z = (b.apparentPos.z - cam.z) / KPC_KM;
      const d = Math.sqrt(x * x + y * y + z * z);
      if (p.absMag - 2.5 * Math.log10(gain) + 5 * Math.log10(Math.max(d, 1e-9) * 100) > FAINTEST_MAG) continue;
      const rPx = d > p.radiusKpc ? (p.radiusKpc / d) * pxPerRadCss : 1e4;
      const t = Math.min(1, Math.max(0, (rPx - DETAIL_PX[0]) / (DETAIL_PX[1] - DETAIL_PX[0])));
      const wd = t * t * (3 - 2 * t);
      // A photograph near our line of sight draws its share of the light (scene/GalaxyPictures.tsx): the model the rest.
      const lum = s.lumV * gain * (1 - (pictureShares.get(s.id) ?? 0));
      const detailed = s.template !== 'point' ? set.batches.get(s.template) : undefined;
      if (wd > 0 && detailed) {
        // Large on screen: the fine template, crossfaded in.
        const fine = set.batches.get(batchKey(s.template, true));
        const tf = fine ? Math.min(1, Math.max(0, (rPx - FINE_PX[0]) / (FINE_PX[1] - FINE_PX[0]))) : 0;
        const wf = tf * tf * (3 - 2 * tf);
        if (wf < 1) {
          const k = counts.get(detailed.key)!;
          write(detailed.buffer.array as Float32Array, k, x, y, z, p.axes, s.normal, lum * wd * (1 - wf), p.splatKpc, s.dust, ln1pz);
          counts.set(detailed.key, k + 1);
        }
        if (fine && wf > 0) {
          const k = counts.get(fine.key)!;
          write(fine.buffer.array as Float32Array, k, x, y, z, p.axes, s.normal, lum * wd * wf, p.splatKpc, s.dust, ln1pz);
          counts.set(fine.key, k + 1);
        }
        any = true;
      }
      if (wd < 1 || !detailed) {
        const k = counts.get('point')!;
        write(point.buffer.array as Float32Array, k, x, y, z, null, s.normal, lum * (detailed ? 1 - wd : 1), s.halfLightKpc, null, ln1pz);
        counts.set('point', k + 1);
        any = true;
      }
    }
    set.batches.forEach((bt) => {
      const n = counts.get(bt.key) ?? 0;
      bt.geometry.instanceCount = n;
      if (n > 0) {
        bt.buffer.clearUpdateRanges();
        bt.buffer.addUpdateRange(0, n * STRIDE);
        bt.buffer.needsUpdate = true;
      }
    });
    galaxyLayer.wants.galaxies = any;
    if (any) galaxyLayer.display(tanHalf, sim.viewport.height, gl.getPixelRatio());
  });

  if (!set) return null;
  return (
    <>
      {[...set.batches.values()].map((b) => (
        <points key={b.key} geometry={b.geometry} material={material} frustumCulled={false} ref={(o) => o?.layers.set(GALAXY_LAYER)} />
      ))}
    </>
  );
}

const NO_AXES = new Float32Array(9);

function write(
  a: Float32Array,
  k: number,
  x: number,
  y: number,
  z: number,
  axes: Float32Array | null,
  normal: readonly number[],
  lum: number,
  splatKpc: number,
  dust: { tau0: number; scaleKpc: number; ringKpc: number; ringWidthKpc: number } | null,
  ln1pz: number,
): void {
  const o = k * STRIDE;
  a[o] = x;
  a[o + 1] = y;
  a[o + 2] = z;
  a.set(axes ?? NO_AXES, o + 3);
  a[o + 12] = normal[0];
  a[o + 13] = normal[1];
  a[o + 14] = normal[2];
  a[o + 15] = lum;
  a[o + 16] = splatKpc;
  a[o + 17] = dust ? dust.tau0 : 0;
  a[o + 18] = dust ? dust.scaleKpc : 0;
  a[o + 19] = dust ? dust.ringKpc : 0;
  a[o + 20] = dust ? dust.ringWidthKpc : 0;
  a[o + 21] = ln1pz;
}
