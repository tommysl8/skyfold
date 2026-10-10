import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PlaneGeometry, Vector3, type Mesh, type PerspectiveCamera, type ShaderMaterial } from 'three';
import { createNebulaMaterial, nebulaUniforms, psfUniforms } from '../render/materials';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { lensDrawn, swapLensVariant } from '../render/lensVariants';
import { lens } from '../render/lens/lensState';
import { acquireTexture, releaseTexture } from '../render/textures';
import { PARSEC_KM } from '../physics/constants';
import { MW_MU_FADE, NEBULA_MU_PEAK, surfaceScale } from '../sim/galaxy/background';
import { galaxyState, galaxyVersion, subscribeGalaxy } from '../sim/galaxy/load';
import { apparentCard, nebulaCard, type CardLens, type CardMotion, type CardView, type NebulaCard } from '../sim/galaxy/cards';
import { relView } from '../render/relativisticView';
import { remnantOpacity, remnantScale } from '../sim/phenomena';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

/** Grid of the card: enough for aberration to bend a card that fills the view. */
const GRID = 8;
/** A picture loads once its card is this many CSS pixels wide (or its nebula is selected). */
const LOAD_PX = 3;
/** And is let go after this long below a pixel. */
const RELEASE_MS = 8000;

/**
 * The pictures drawn in the view, largest first, each of which must carry its credit (the
 * view's Credits button lists them: ui/viewport/PictureCredits.tsx). A picture counts from the
 * moment any of it is drawn: its card at least MIN_PX across, some of it in the view, and not
 * seen so nearly edge-on that it has faded out.
 */
export const shownPictures = { ids: [] as string[], version: 0 };
const listeners = new Set<() => void>();
export function subscribeShownPictures(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
export const shownPicturesVersion = (): number => shownPictures.version;
/** Each source's pictures on screen (the nebulae here, the galaxies' in scene/GalaxyPictures.tsx), largest first. */
const bySource = new Map<string, { id: string; px: number }[]>();
/** Report one source's pictures drawn this frame: the list is theirs and the others', largest first. */
export function reportShownPictures(source: string, shown: { id: string; px: number }[]): void {
  bySource.set(source, shown);
  const ids = [...bySource.values()].flat().sort((a, b) => b.px - a.px).map((c) => c.id);
  if (ids.join() === shownPictures.ids.join()) return;
  shownPictures.ids = ids;
  shownPictures.version++;
  listeners.forEach((f) => f());
}
/** A card is drawn once it is this many CSS pixels across (faint at first, in full from FULL_PX). */
export const MIN_PX = 0.5;
export const FULL_PX = 6;
/** Seen more nearly edge-on than this (|cos| of the angle to its face), a card has faded out (shaders/nebula.frag.glsl). */
const EDGE_ON = 0.05;

interface Slot {
  card: NebulaCard;
  mesh: Mesh | null;
  material: ShaderMaterial;
  held: boolean;
  loaded: boolean;
  smallSince: number;
}

const cam = new Vector3();
const rel: [number, number, number] = [0, 0, 0];
const view: CardView = { forward: new Vector3(), halfDiagonal: 1, pxPerRad: 1 };
const motion: CardMotion = { velDir: new Vector3(), phi: 0 };
const cardLens: CardLens = { inv: null as unknown as CardLens['inv'], holeM: new Vector3(), mPerUnit: 1, pxPerRad: 1 };

/**
 * The 45 nebulae as their pictures, each a card at its distance and true size (sim/galaxy,
 * nebulae.json). The pictures are how the nebulae look from Earth; from anywhere else the card
 * stays facing the Sun, so flying past shows it foreshortened, edge-on it fades away, and from
 * the far side it shows the picture mirrored. Each picture loads when its card is a few pixels
 * wide, and goes again when it has been out of sight. Near a black hole each card draws with its
 * lensed variant (render/lensVariants.ts: every vertex of its grid at its primary image), and its
 * size and place for the credit line follow the lens too (sim/galaxy/cards.ts apparentCard).
 */
export function Nebulae() {
  // Re-render when the nebulae arrive.
  useSyncExternalStore(subscribeGalaxy, galaxyVersion);
  const file = galaxyState.nebulae;
  const geometry = useMemo(() => new PlaneGeometry(1, 1, GRID, GRID), []);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const slots = useMemo<Slot[]>(
    () => (file ? file.objects.map((n) => ({ card: nebulaCard(n), mesh: null, material: createNebulaMaterial(), held: false, loaded: false, smallSince: 0 })) : []),
    [file],
  );
  const shown = useRef<string[]>([]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      for (const s of slots) {
        s.material.dispose();
        if (s.held) releaseTexture(s.card.json.billboard.image);
      }
    },
    [slots],
  );

  useFrame(() => {
    if (!slots.length) return;
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const cssPixel = (2 * tanHalf) / Math.max(1, sim.viewport.height);
    const pxPerRad = 1 / cssPixel;
    const gain = psfUniforms.uStarGain.value;
    const m0 = psfUniforms.uMagZero.value;
    nebulaUniforms.uPeakScale.value = surfaceScale(NEBULA_MU_PEAK, cssPixel, gain, m0);
    nebulaUniforms.uFadeL.value.set(10 ** (-0.4 * (MW_MU_FADE[1] - NEBULA_MU_PEAK)), 10 ** (-0.4 * (MW_MU_FADE[0] - NEBULA_MU_PEAK)));
    cam.copy(sim.camera.pos).divideScalar(PARSEC_KM);
    camera.getWorldDirection(view.forward as Vector3);
    const aspect = sim.viewport.width / Math.max(1, sim.viewport.height);
    view.halfDiagonal = Math.atan(tanHalf * Math.hypot(1, aspect));
    view.pxPerRad = pxPerRad;
    // In flight the ship sees each card aberrated (and in the split view the rest frame's too).
    const moving = relView.active && !relView.suspended && relView.phi > 0;
    motion.velDir = relView.velDir;
    motion.phi = relView.phi;
    // Near a black hole: each card drawn lensed, and judged where its lens puts it.
    const lensOn = lensDrawn() && lens.inv !== null;
    if (lensOn) {
      cardLens.inv = lens.inv!;
      (cardLens.holeM as Vector3).copy(lens.holeM);
      cardLens.mPerUnit = PARSEC_KM / lens.mKm;
      cardLens.pxPerRad = lens.pxPerRad;
    }
    for (const s of slots) swapLensVariant(s.mesh, lensOn);
    const selected = useUI.getState().selected;
    const now = performance.now();
    const credits: { id: string; px: number }[] = [];
    for (const s of slots) {
      const { card } = s;
      const x = card.centre[0] - cam.x;
      const y = card.centre[1] - cam.y;
      const z = card.centre[2] - cam.z;
      rel[0] = x;
      rel[1] = y;
      rel[2] = z;
      // A supernova's remnant seen before it had grown to its picture's size (sim/phenomena): the card as large as it
      // then was, and none before the explosion was seen; nor once the picture no longer shows it (the Crab's after its
      // pulsar has spun down, SN 1987A's after its ring has gone).
      const grown = remnantScale(card.json.id, sim.timeMs);
      const radiusPc = card.radiusPc * grown;
      let { px, inView } = apparentCard(rel, radiusPc, view, moving ? motion : null, lensOn ? cardLens : null);
      if (moving && relView.split) {
        const still = apparentCard(rel, radiusPc, view, null, lensOn ? cardLens : null);
        px = Math.max(px, still.px);
        inView ||= still.inView;
      }
      const wanted = px >= LOAD_PX || selected === card.json.id;
      if (wanted) {
        s.smallSince = 0;
        if (!s.held) {
          s.held = true;
          void acquireTexture(card.json.billboard.image).then((t) => {
            if (!s.held) return;
            s.material.uniforms.uMap.value = t;
            s.loaded = !!t;
          });
        }
      } else if (s.held) {
        if (!s.smallSince) s.smallSince = now;
        else if (now - s.smallSince > RELEASE_MS) {
          s.held = false;
          s.loaded = false;
          s.material.uniforms.uMap.value = null;
          releaseTexture(card.json.billboard.image);
        }
      }
      // How squarely the card faces the camera (it fades out edge-on).
      const facing = Math.abs(x * card.normal[0] + y * card.normal[1] + z * card.normal[2]) / Math.max(1e-30, Math.hypot(x, y, z));
      const visible = s.loaded && px >= MIN_PX && facing > EDGE_ON && grown > 0;
      if (s.mesh) s.mesh.visible = visible;
      if (!visible) continue;
      const u = s.material.uniforms;
      u.uRel.value.set(x, y, z);
      u.uRight.value.set(card.right[0] * grown, card.right[1] * grown, card.right[2] * grown);
      u.uUp.value.set(card.up[0] * grown, card.up[1] * grown, card.up[2] * grown);
      u.uNormal.value.set(card.normal[0], card.normal[1], card.normal[2]);
      // Faint when it is only a few pixels (the picture is then a smudge), full from FULL_PX.
      u.uOpacity.value = Math.min(1, Math.max(0, (px - MIN_PX) / (FULL_PX - MIN_PX))) * remnantOpacity(card.json.id, sim.timeMs);
      // Every picture drawn in the view carries its credit, however small.
      if (inView) credits.push({ id: card.json.id, px });
    }
    credits.sort((a, b) => b.px - a.px);
    const ids = credits.map((c) => c.id);
    if (ids.join() !== shown.current.join()) {
      shown.current = ids;
      reportShownPictures('nebulae', credits);
    }
  });

  return (
    <>
      {slots.map((s) => (
        <mesh
          key={s.card.json.id}
          geometry={geometry}
          material={s.material}
          frustumCulled={false}
          renderOrder={-95}
          visible={false}
          ref={(o) => {
            s.mesh = o;
            o?.layers.set(POINTS_LAYER);
          }}
        />
      ))}
    </>
  );
}
