/**
 * The Sun's neighbourhood in 3D dust (sim/dust, render/dustLayer.ts; docs/data/dust.md): each frame, where the camera
 * is decides what is fetched and how much of the dust's effect is drawn, and the Radcliffe Wave's line is drawn faintly
 * when the camera is out there and labels are on.
 *
 * Strength: 0 within 2 pc of the Sun, rising to 1 by 10 pc (from home the sky map and the stars' magnitudes already
 * hold the real dust, so the march would change nothing: near the Sun its numbers, the camera's column less the Sun's,
 * are all but 0), and falling again from 8 to 14 kpc away, where the neighbourhood is a few degrees across; eased in over
 * 1.5 s when the map arrives, so nothing pops in. The outer grid is fetched from 3 pc out (to 16 kpc), the inner one
 * within 300 pc of its box.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Matrix3, type PerspectiveCamera, ShaderMaterial, Vector3 } from 'three';
import { PARSEC_KM } from '../physics/constants';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { dustLayer } from '../render/dustLayer';
import { localDustUniforms } from '../render/localDustUniforms';
import { psfUniforms } from '../render/materials';
import { MW_FLUX_PER_SR, patchFlux } from '../sim/galaxy/background';
import { GAL_TO_WORLD } from '../sim/galaxy/frames';
import { dustState, wantDustGrid } from '../sim/dust/load';
import { ISRF_FLUX_PER_SR, ISRF_MU_V } from '../sim/dust/light';
import { radcliffeLine, radcliffePoint } from '../sim/dust/radcliffe';
import { RADCLIFFE_LABEL_KM, RADCLIFFE_MID_S } from '../sim/dust/clouds';
import { worldKmToGalPc } from '../sim/dust/volume';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The strength of the dust's effect at a distance from the Sun (pc), before easing in. */
export function dustStrength(dPc: number): number {
  return smoothstep(2, 10, dPc) * (1 - smoothstep(8000, 14000, dPc));
}

/** How long the dust takes to ease in once its map has arrived, ms. */
const EASE_IN_MS = 1500;
/** The inner grid is fetched within this margin of its box, pc. */
const INNER_MARGIN_PC = 300;
/** The Radcliffe Wave's line: its colour and greatest opacity (a guide, quieter than the ecliptic). */
const WAVE_COLOUR = '#c8a77e';
const WAVE_OPACITY = 0.3;

const WAVE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uOffsetPc;  // the line's origin less the camera, heliocentric galactic pc
uniform mat3 uGalToWorld;
varying float vAlong;
attribute float aAlong;
void main() {
  vec3 dir = normalize(uGalToWorld * (position + uOffsetPc));
  vAlong = aAlong;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dir, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const WAVE_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlong;
void main() {
  #include <logdepthbuf_fragment>
  // Fainter towards its ends, where the model is least constrained.
  float a = uOpacity * smoothstep(0.0, 0.12, vAlong) * smoothstep(1.0, 0.88, vAlong);
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;

function waveGeometry(): { geometry: BufferGeometry; originPc: Vector3 } {
  const mid = radcliffePoint(RADCLIFFE_MID_S);
  const pts = radcliffeLine(256);
  const pos: number[] = [];
  const along: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (const k of [i, i + 1]) {
      pos.push(pts[k][0] - mid[0], pts[k][1] - mid[1], pts[k][2] - mid[2]);
      along.push(k / (pts.length - 1));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aAlong', new Float32BufferAttribute(along, 1));
  return { geometry, originPc: new Vector3(...mid) };
}

const camPc = new Vector3();
const lastPc = new Vector3();
const velocity = new Vector3();

export function DustClouds() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const arrived = useRef(0);
  const { geometry, originPc } = useMemo(waveGeometry, []);
  const waveMat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uOffsetPc: { value: new Vector3() },
          uGalToWorld: { value: new Matrix3().set(...GAL_TO_WORLD[0], ...GAL_TO_WORLD[1], ...GAL_TO_WORLD[2]) },
          uColor: { value: new Color(WAVE_COLOUR) },
          uOpacity: { value: 0 },
        },
        vertexShader: WAVE_VERT,
        fragmentShader: WAVE_FRAG,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: false,
      }),
    [],
  );
  const wave = useRef<{ visible: boolean } | null>(null);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => waveMat.dispose(), [waveMat]);

  useFrame((_, delta) => {
    const p = worldKmToGalPc(sim.camera.pos);
    camPc.set(p[0], p[1], p[2]);
    // The camera's velocity (pc/s, smoothed): the dust sky is marched from where it will be (render/dustLayer.ts).
    const dt = Math.min(Math.max(delta, 1e-3), 0.25);
    velocity.lerp(lastPc.sub(camPc).multiplyScalar(-1 / dt), 0.3);
    lastPc.copy(camPc);
    dustLayer.dt = dt;
    dustLayer.velPcS.copy(velocity);
    dustLayer.frame++;
    // The grids as they arrive (uploaded once each).
    const { outer, inner } = dustState.grids;
    if (outer && !arrived.current) arrived.current = performance.now();
    dustLayer.setGrids(outer, inner);
    const dPc = camPc.length();
    const away = dPc > 3 && dPc < 16_000;
    if (away) wantDustGrid('outer');
    if (away && Math.abs(p[0]) < 400 + INNER_MARGIN_PC && Math.abs(p[1]) < 400 + INNER_MARGIN_PC && Math.abs(p[2]) < 200 + INNER_MARGIN_PC) wantDustGrid('inner');
    const ease = arrived.current ? smoothstep(0, EASE_IN_MS, performance.now() - arrived.current) : 0;
    dustLayer.strength = dustState.grids.outer ? (dustLayer.forceStrength ?? dustStrength(dPc) * ease) : 0;
    dustLayer.camPc.copy(camPc);
    // The scattered light's units: the sky map's p, and the Galaxy layer's flux in a faint star's image.
    const cssPixel = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, sim.viewport.height);
    localDustUniforms.uLocalDustLight.value.set(ISRF_FLUX_PER_SR / MW_FLUX_PER_SR, patchFlux(ISRF_MU_V, cssPixel, psfUniforms.uMagZero.value), 0, 0);

    // The Radcliffe Wave's line: from out there (its label's range), with labels on.
    const toMid = camPc.distanceTo(originPc) * PARSEC_KM;
    const range = RADCLIFFE_LABEL_KM;
    const want = useUI.getState().showLabels ? smoothstep(range.minKm, 1.5 * range.minKm, toMid) * (1 - smoothstep(0.75 * range.maxKm, range.maxKm, toMid)) : 0;
    const u = waveMat.uniforms;
    u.uOpacity.value += (WAVE_OPACITY * want - u.uOpacity.value) * 0.1;
    if (Math.abs(u.uOpacity.value - WAVE_OPACITY * want) < 1e-3) u.uOpacity.value = WAVE_OPACITY * want;
    u.uOffsetPc.value.copy(originPc).sub(camPc);
    if (wave.current) wave.current.visible = u.uOpacity.value > 1e-3;
  });

  return (
    <lineSegments
      geometry={geometry}
      material={waveMat}
      frustumCulled={false}
      renderOrder={-88}
      visible={false}
      ref={(o) => {
        wave.current = o;
        o?.layers.set(GUIDES_LAYER);
      }}
    />
  );
}
