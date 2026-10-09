/**
 * The paths of the visitors from other stars (sim/solarSystem/interstellar.ts) through the Solar System: each one's
 * own track (fitted to JPL Horizons), sampled once over forty years either side of its perihelion, so the far ends of
 * the line are its incoming and outgoing asymptotes, straight to within a fraction of a degree. The part already
 * travelled is drawn brighter than the part to come. A faint line shows by itself for a few years round each
 * visit (3I/ATLAS's in 2025–2027); all three show while any of them is chosen. Like the orbit lines a guide: it follows
 * View › Orbits, and the relativistic view leaves it out.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Line, ShaderMaterial } from 'three';
import { AU_KM } from '../physics/constants';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { bodyPositionAt, isBody, registryVersion, subscribeRegistry } from '../sim/bodies';
import { solarSystemHidden } from '../sim/derived';
import { sim } from '../sim/sim';
import { VISITORS } from '../sim/solarSystem/interstellar';
import { astroTimeAt } from '../lib/time';
import { useUI } from '../state/ui';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aDays;
attribute float aAu;
varying float vDays;
varying float vAu;
void main() {
  vDays = aDays;
  vAu = aAu;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
uniform float uNow;
varying float vDays;
varying float vAu;
void main() {
  #include <logdepthbuf_fragment>
  // Travelled: full; to come: a third. Fading out far from the Sun, where the path is only its asymptote.
  float done = vDays <= uNow ? 1.0 : 0.33;
  float far = 1.0 - smoothstep(60.0, 220.0, vAu);
  gl_FragColor = vec4(uColor * uOpacity * done * far, 1.0);
}
`;

/** Years either side of perihelion sampled, and the samples (crowded towards perihelion). */
const SPAN_YEARS = 40;
const SAMPLES = 801;
/** A visit's line shows by itself within this many years of its perihelion (full within the first number). */
const NEAR_YEARS: readonly [number, number] = [1.5, 3];
/** Brightness of a line by itself, and when a visitor is chosen. */
const QUIET = 0.28;
const CHOSEN = 0.75;
const COLOUR = new Color('#b9a6ee');

const IDS = Object.keys(VISITORS) as (keyof typeof VISITORS)[];
const JD_UNIX = 2440587.5;
const msOfJd = (jd: number) => (jd - JD_UNIX) * 86_400_000;

function pathGeometry(id: keyof typeof VISITORS): BufferGeometry {
  const v = VISITORS[id];
  const tp = msOfJd(v.tpJd);
  const pos = new Float32Array(3 * SAMPLES);
  const days = new Float32Array(SAMPLES);
  const au = new Float32Array(SAMPLES);
  const p = bodyPositionAt(id, astroTimeAt(tp));
  const sun = bodyPositionAt('sun', astroTimeAt(tp));
  for (let k = 0; k < SAMPLES; k++) {
    const u = (2 * k) / (SAMPLES - 1) - 1;
    const dt = Math.sign(u) * u * u * SPAN_YEARS * 365.25 * 86_400_000;
    const t = astroTimeAt(tp + dt);
    bodyPositionAt(id, t, p);
    bodyPositionAt('sun', t, sun);
    p.sub(sun);
    pos[3 * k] = p.x;
    pos[3 * k + 1] = p.y;
    pos[3 * k + 2] = p.z;
    days[k] = dt / 86_400_000;
    au[k] = p.length() / AU_KM;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aDays', new BufferAttribute(days, 1));
  g.setAttribute('aAu', new BufferAttribute(au, 1));
  return g;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function VisitorPaths() {
  const version = useSyncExternalStore(subscribeRegistry, registryVersion);
  const group = useMemo(() => new Group(), []);
  const lines = useMemo(() => {
    void version;
    return IDS.filter((id) => isBody(id)).map((id) => {
      const material = new ShaderMaterial({
        uniforms: { uColor: { value: COLOUR }, uOpacity: { value: 0 }, uNow: { value: 0 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        blending: AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        transparent: true,
      });
      const line = new Line(pathGeometry(id), material);
      line.frustumCulled = false;
      line.layers.set(GUIDES_LAYER);
      line.renderOrder = 2;
      line.visible = false;
      return { id, line, material, tpMs: msOfJd(VISITORS[id].tpJd) };
    });
  }, [version]);

  useEffect(() => {
    for (const l of lines) group.add(l.line);
    return () => {
      for (const l of lines) {
        group.remove(l.line);
        l.line.geometry.dispose();
        l.material.dispose();
      }
    };
  }, [group, lines]);

  useFrame(() => {
    const ui = useUI.getState();
    const sun = sim.bodies.sun;
    const on = ui.showOrbits && !solarSystemHidden() && !!sun;
    group.visible = on;
    if (!on) return;
    group.position.copy(sun.pos).sub(sim.camera.pos);
    const chosen = IDS.some((id) => id === ui.selected || id === ui.focus);
    for (const l of lines) {
      const years = Math.abs(sim.timeMs - l.tpMs) / (365.25 * 86_400_000);
      const own = l.id === ui.selected || l.id === ui.focus;
      const opacity = Math.max(own ? 1 : chosen ? CHOSEN : 0, QUIET * (1 - smoothstep(NEAR_YEARS[0], NEAR_YEARS[1], years)));
      l.line.visible = opacity > 0.002;
      l.material.uniforms.uOpacity.value = opacity;
      l.material.uniforms.uNow.value = (sim.timeMs - l.tpMs) / 86_400_000;
    }
  });

  return <primitive object={group} />;
}
