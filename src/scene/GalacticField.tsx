/**
 * The Milky Way's magnetic field (sim/galaxy/magneticField.ts, fieldLines.ts, fieldView.ts; materials:
 * render/galacticFieldMaterials.ts), a chunk of its own mounted only while View › Magnetic field lines is on (App.tsx):
 * nothing of it is loaded before, and nothing runs while the switch is off.
 *  - Away from the Solar System: field lines of the UF23 model in 3D, traced once when first shown (about 0.3 s of
 *    work, kept for the rest of the visit), one draw of line segments.
 *  - Near it: the field's direction over the sky, measured (the drapery, a 2048 × 1024 texture, fetched when first
 *    shown and let go when the switch is turned off).
 * The two hand over 100 to 500 pc from the Sun, as the Galaxy's model and the sky from the Sun do. The lines are left
 * out near a black hole while its lens is drawn (they have no lensed variant), and the drapery in the relativistic
 * view (as the CMB map is: its layer is the background's).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, PlaneGeometry, Sphere, Vector3, type LineSegments, type Mesh, type PerspectiveCamera, type Texture } from 'three';
import { createGalacticFieldMaterial, createGalacticFieldSkyMaterial } from '../render/galacticFieldMaterials';
import { BACKGROUND_LAYER, POINTS_LAYER } from '../render/LightspeedScenePass';
import { acquireTexture, releaseTexture } from '../render/textures';
import { galaxyUniforms } from '../render/materials';
import { lens } from '../render/lens/lensState';
import { relView } from '../render/relativisticView';
import { GAL_TO_G_ROT, GAL_TO_WORLD, mul, transpose, WORLD_TO_GAL } from '../sim/galaxy/frames';
import { buildFieldLines, type PackedLines } from '../sim/galaxy/fieldLines';
import { cameraG, fieldLinesShare, fieldSkyShare, fieldSkyTexture, LINES_NEAR_KPC } from '../sim/galaxy/fieldView';
import { sim } from '../sim/sim';

/** Pieces of the line of sight through the dust (galacticField.vert.glsl; the particles use up to 6 too). */
const DUST_PIECES = 4;
/** The drapery's brightness at full share (its texture is 0–1): faint, below the Milky Way's brightest star clouds. */
const SKY_GAIN = 0.028;
/** The lines' brightness at full share: a guide over the Galaxy's light, not brighter than its arms. */
const LINES_GAIN = 0.45;
const SKY_OPTS = { color: false, grey: true } as const;

/** The lines, traced once a visit. */
let packed: PackedLines | null = null;

function lineGeometry(p: PackedLines): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(p.position, 3));
  g.setAttribute('aField', new BufferAttribute(p.field, 3));
  g.setAttribute('aArc', new BufferAttribute(p.arc, 1));
  g.setIndex(new BufferAttribute(p.index, 1));
  // Never culled: skip three.js's bounding sphere over every point.
  g.boundingSphere = new Sphere(new Vector3(), Infinity);
  return g;
}

/** Frame G's axes to world axes: world = GAL_TO_WORLD · Rᵀ · g (frames.ts). */
const G_TO_WORLD = mul(GAL_TO_WORLD, transpose(GAL_TO_G_ROT));

function FieldLines() {
  const material = useMemo(createGalacticFieldMaterial, []);
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  const lines = useRef<LineSegments | null>(null);
  // Traced once the lines are first to be shown (not from the Solar System), after that frame.
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const t = setTimeout(() => {
      packed ??= buildFieldLines();
      setGeometry(lineGeometry(packed));
    }, 0);
    return () => clearTimeout(t);
  }, [wanted]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => {
    const m = G_TO_WORLD;
    material.uniforms.uGToWorld.value.set(m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]);
    material.uniforms.uNear.value.set(LINES_NEAR_KPC[0], LINES_NEAR_KPC[1]);
    return () => material.dispose();
  }, [material]);

  useFrame(() => {
    const p = sim.camera.pos;
    const g = cameraG(p);
    const share = lens.active ? 0 : fieldLinesShare(g, p.length());
    const u = material.uniforms;
    if (!wanted && share > 0) setWanted(true);
    u.uOpacity.value = LINES_GAIN * share;
    u.uCamG.value.set(g[0], g[1], g[2]);
    // The Galaxy model's dust maps, once they are in (scene/GalaxyModel.tsx).
    u.uDustPieces.value = galaxyUniforms.uDust.value && galaxyUniforms.uWarpMap.value ? DUST_PIECES : 0;
    if (lines.current) lines.current.visible = share > 0.002;
  });

  if (!geometry) return null;
  return (
    <lineSegments
      ref={(o) => {
        lines.current = o;
        o?.layers.set(POINTS_LAYER);
      }}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-97}
      visible={false}
    />
  );
}

function useSkyTexture(wanted: boolean): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    const file = fieldSkyTexture();
    // Held at once, loaded or not: let go of it however soon this unmounts.
    void acquireTexture(file, SKY_OPTS).then((t) => {
      if (live && t) setTex(t);
    });
    return () => {
      live = false;
      setTex(null);
      releaseTexture(file, SKY_OPTS);
    };
  }, [wanted]);
  return tex;
}

function FieldSky() {
  const material = useMemo(createGalacticFieldSkyMaterial, []);
  const geometry = useMemo(() => new PlaneGeometry(2, 2), []);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  // Fetched once the camera is first near enough the Solar System to show it.
  const [wanted, setWanted] = useState(false);
  const tex = useSkyTexture(wanted);
  const mesh = useRef<Mesh>(null);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    const m = WORLD_TO_GAL;
    material.uniforms.uWorldToGal.value.set(m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]);
    return () => material.dispose();
  }, [material]);

  useFrame((_, dt) => {
    const share = fieldSkyShare(sim.camera.pos.length());
    if (!wanted && share > 0) setWanted(true);
    const u = material.uniforms;
    u.uSkyTex.value = tex;
    const want = tex && (!relView.active || relView.split) ? SKY_GAIN * share : 0;
    // Fade in over a quarter of a second once the texture has come.
    u.uGain.value += (want - u.uGain.value) * Math.min(1, dt * 4);
    if (Math.abs(want - u.uGain.value) < 1e-4) u.uGain.value = want;
    if (mesh.current) mesh.current.visible = !!tex && u.uGain.value > 1e-4;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-999.4}
      visible={false}
      ref={(o) => {
        mesh.current = o;
        o?.layers.set(BACKGROUND_LAYER);
      }}
    />
  );
}

export default function GalacticField() {
  return (
    <>
      <FieldSky />
      <FieldLines />
    </>
  );
}
