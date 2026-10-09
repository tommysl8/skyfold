/**
 * The edge of the Solar System (sim/heliosphere.ts has the models and their sources): the termination shock and the
 * heliopause as two faint, translucent shells, brighter towards their rims where the line of sight grazes them, and
 * the Oort cloud as a sparse cloud of faint points. Each shows only at its own scale, fading in with the camera's
 * distance from the Sun (hundreds of au for the heliosphere, thousands for the cloud) and out again once it is small
 * on screen; otherwise it is not drawn, and its geometry is not even built until first needed. Guides, not light
 * anyone could see: the relativistic view leaves them out.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { AU_KM } from '../physics/constants';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { pixelsPerRadian } from '../sim/derived';
import { sim } from '../sim/sim';
import {
  DOWNSTREAM_FADE_AU,
  heliopauseAu,
  HELIOPAUSE,
  heliosphereFade,
  HILLS_OUTER_AU,
  HP_MAX_THETA_DEG,
  NOSE,
  noseFrameDir,
  OORT_OUTER_AU,
  oortCloudPoints,
  oortFade,
  TS_CENTRE,
  TS_RADIUS_AU,
} from '../sim/heliosphere';

const SHELL_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aFade;
varying float vFade;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vFade = aFade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const SHELL_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  #include <logdepthbuf_fragment>
  // A thin shell seen through: the path through it grows as 1/|cos| towards the rim (capped).
  float grazing = 1.0 / max(abs(dot(normalize(vNormal), normalize(vView))), 0.12);
  gl_FragColor = vec4(uColor * uOpacity * vFade * grazing, 1.0);
}
`;

const POINT_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uSize;
attribute float aWeight;
varying float vWeight;
void main() {
  vWeight = aWeight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
  #include <logdepthbuf_vertex>
}
`;

const POINT_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying float vWeight;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.25, 0.0, dot(c, c));
  gl_FragColor = vec4(uColor * uOpacity * vWeight * a, 1.0);
}
`;

/** Peak brightness of each shell (additive, before the rim's brightening) and of the cloud's points: very faint by design. */
const HP_GAIN = 0.005;
const TS_GAIN = 0.003;
const OORT_GAIN = 0.09;
const HP_COLOUR = new Color('#7d9be0');
const TS_COLOUR = new Color('#b9a2e6');
const OORT_COLOUR = new Color('#a9bcd6');
/** The cloud's points, CSS px across. */
const OORT_POINT_PX = 1.6;

/** Ecliptic au to world km (world = x, z, −y). */
function put(arr: Float32Array, i: number, x: number, y: number, z: number): void {
  arr[3 * i] = x * AU_KM;
  arr[3 * i + 1] = z * AU_KM;
  arr[3 * i + 2] = -y * AU_KM;
}

/** The heliopause out to HP_MAX_THETA_DEG from the nose, fading out down the tail. */
function heliopauseGeometry(): BufferGeometry {
  const NT = 56;
  const NP = 72;
  const pos = new Float32Array(3 * (NT + 1) * (NP + 1));
  const fade = new Float32Array((NT + 1) * (NP + 1));
  for (let i = 0; i <= NT; i++) {
    // Denser towards the nose, where the shell bends most.
    const t = HP_MAX_THETA_DEG * (i / NT) ** 1.15;
    for (let j = 0; j <= NP; j++) {
      const k = i * (NP + 1) + j;
      const d = noseFrameDir(t, (360 * j) / NP);
      const r = heliopauseAu(d);
      put(pos, k, d.x * r, d.y * r, d.z * r);
      const down = -(d.x * NOSE.x + d.y * NOSE.y + d.z * NOSE.z) * r;
      const f = Math.min(1, Math.max(0, (down - DOWNSTREAM_FADE_AU[0]) / (DOWNSTREAM_FADE_AU[1] - DOWNSTREAM_FADE_AU[0])));
      fade[k] = 1 - f * f * (3 - 2 * f);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < NT; i++)
    for (let j = 0; j < NP; j++) {
      const a = i * (NP + 1) + j;
      const b = a + NP + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aFade', new BufferAttribute(fade, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The termination shock: its sphere, in world km. */
function shockGeometry(): BufferGeometry {
  const g = new SphereGeometry(TS_RADIUS_AU * AU_KM, 64, 40);
  g.translate(TS_CENTRE.x * AU_KM, TS_CENTRE.z * AU_KM, -TS_CENTRE.y * AU_KM);
  const n = g.attributes.position.count;
  g.setAttribute('aFade', new BufferAttribute(new Float32Array(n).fill(1), 1));
  return g;
}

function oortGeometry(): BufferGeometry {
  const pts = oortCloudPoints();
  const n = pts.length / 3;
  const pos = new Float32Array(pts.length);
  const weight = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    put(pos, i, pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]);
    // Points of the dense inner cloud dimmer, so that it does not pile up into a glare round the Sun: the number of
    // points follows the model, their brightness only the outline.
    weight[i] = Math.min(1, Math.hypot(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]) / HILLS_OUTER_AU);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aWeight', new BufferAttribute(weight, 1));
  return g;
}

function shellMaterial(colour: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: colour }, uOpacity: { value: 0 } },
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthTest: true,
    depthWrite: false,
    transparent: true,
  });
}

function pointMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: OORT_COLOUR }, uOpacity: { value: 0 }, uSize: { value: 2 } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    transparent: true,
  });
}

/** Development: on false leaves the layer out (to time it). */
export const heliosphereLook = { on: true };

export function Heliosphere() {
  const group = useMemo(() => new Group(), []);
  const parts = useRef<{ hp: Mesh; ts: Mesh; oort: Points } | null>(null);
  const mats = useMemo(() => ({ hp: shellMaterial(HP_COLOUR), ts: shellMaterial(TS_COLOUR), oort: pointMaterial() }), []);

  useEffect(
    () => () => {
      const p = parts.current;
      if (p) for (const o of [p.hp, p.ts, p.oort]) o.geometry.dispose();
      mats.hp.dispose();
      mats.ts.dispose();
      mats.oort.dispose();
    },
    [mats],
  );

  useFrame(({ gl }) => {
    const sun = heliosphereLook.on ? sim.bodies.sun : undefined;
    const camKm = sun ? sim.camera.pos.distanceTo(sun.pos) : 0;
    const camAu = camKm / AU_KM;
    const ppr = pixelsPerRadian();
    const shells = sun ? heliosphereFade(camAu, (HELIOPAUSE.L0 * AU_KM * ppr) / Math.max(camKm, 1)) : 0;
    const cloud = sun ? oortFade(camAu, (OORT_OUTER_AU * AU_KM * ppr) / Math.max(camKm, 1)) : 0;
    group.visible = shells > 0 || cloud > 0;
    if (!group.visible || !sun) return;
    // Built the first time they are wanted.
    if (!parts.current) {
      const make = <T extends Mesh | Points>(o: T): T => {
        o.frustumCulled = false;
        o.layers.set(GUIDES_LAYER);
        group.add(o);
        return o;
      };
      parts.current = {
        hp: make(new Mesh(heliopauseGeometry(), mats.hp)),
        ts: make(new Mesh(shockGeometry(), mats.ts)),
        oort: make(new Points(oortGeometry(), mats.oort)),
      };
      parts.current.hp.renderOrder = 3;
      parts.current.ts.renderOrder = 3;
      parts.current.oort.renderOrder = 3;
    }
    const p = parts.current;
    // Floating origin: the Sun from the camera.
    group.position.copy(sun.pos).sub(sim.camera.pos);
    p.hp.visible = p.ts.visible = shells > 0;
    p.oort.visible = cloud > 0;
    mats.hp.uniforms.uOpacity.value = HP_GAIN * shells;
    mats.ts.uniforms.uOpacity.value = TS_GAIN * shells;
    mats.oort.uniforms.uOpacity.value = OORT_GAIN * cloud;
    mats.oort.uniforms.uSize.value = OORT_POINT_PX * gl.getPixelRatio();
  });

  return <primitive object={group} />;
}
