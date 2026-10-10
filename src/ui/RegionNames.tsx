/**
 * Quiet names for the edge of the Solar System (scene/Heliosphere.tsx): the heliopause at the top of its outline and
 * the termination shock at the bottom of its own, as seen from where the camera is, only from hundreds of au out and
 * while the bubble is large on screen; "Oort cloud (model)" from tens of thousands of au. Styled like the
 * constellations' names, under the body labels, and shown with View › Labels; positioned straight in the DOM, never
 * through React state.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type PerspectiveCamera, Vector3 } from 'three';
import { AU_KM } from '../physics/constants';
import { pixelsPerRadian, screenOf } from '../sim/derived';
import type { ScreenPoint } from '../sim/sim';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { heliopauseAu, HELIOPAUSE, heliosphereNameFade, OORT_OUTER_AU, oortNameFade, terminationShockAu } from '../sim/heliosphere';

const NAMES = ['Heliopause', 'Termination shock', 'Oort cloud (model)'] as const;
const TITLES = [
  'Where the Sun’s wind meets the interstellar gas: a model through the Voyagers’ crossings',
  'Where the Sun’s wind slows from supersonic to subsonic: a model fitted to the Voyagers’ crossings',
  'A model of the cloud of comets thought to surround the Sun, 2,000 to 100,000 au out: no member has been seen there',
];

let host: HTMLDivElement | null = null;
const els: HTMLSpanElement[] = [];

const up = new Vector3();
const toSun = new Vector3();
const rel = new Vector3();
const screen: ScreenPoint = { x: 0, y: 0, onScreen: false, inFront: false };
const ecl = { x: 0, y: 0, z: 0 };

/** Put name `k` at `au` along the world direction `dir` from the Sun, at `opacity`. */
function place(k: number, dir: Vector3, au: number, opacity: number, camera: PerspectiveCamera): void {
  const el = els[k];
  if (!el) return;
  if (opacity <= 0.01) {
    if (el.style.opacity !== '0') el.style.opacity = '0';
    return;
  }
  const sun = sim.bodies.sun!;
  rel.copy(dir).multiplyScalar(au * AU_KM).add(sun.pos).sub(sim.camera.pos);
  screenOf(rel, camera, screen);
  if (!screen.onScreen) {
    if (el.style.opacity !== '0') el.style.opacity = '0';
    return;
  }
  el.style.opacity = opacity.toFixed(2);
  el.style.transform = `translate3d(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px, 0) translate(-50%, ${k === 1 ? '20%' : '-120%'})`;
}

/** World direction to ecliptic, for the shape models. */
function toEcl(d: Vector3) {
  ecl.x = d.x;
  ecl.y = -d.z;
  ecl.z = d.y;
  return ecl;
}

/** Positions the names each frame. */
export function RegionNameSync() {
  useFrame(({ camera }) => {
    const sun = sim.bodies.sun;
    if (!sun || !els.length) return;
    toSun.copy(sun.pos).sub(sim.camera.pos);
    const camKm = toSun.length();
    const camAu = camKm / AU_KM;
    const ppr = pixelsPerRadian();
    // Names follow View › Labels.
    const shown = useUI.getState().showLabels ? 1 : 0;
    const hp = shown * heliosphereNameFade(camAu, (HELIOPAUSE.L0 * AU_KM * ppr) / Math.max(camKm, 1));
    const oort = shown * oortNameFade(camAu, (OORT_OUTER_AU * AU_KM * ppr) / Math.max(camKm, 1));
    // The screen's up, square to the line of sight to the Sun: the names sit on the outlines' top (and bottom).
    up.set(0, 1, 0).applyQuaternion(sim.camera.quat);
    toSun.normalize();
    up.addScaledVector(toSun, -up.dot(toSun)).normalize();
    const cam = camera as PerspectiveCamera;
    place(0, up, heliopauseAu(toEcl(up)), hp, cam);
    up.negate();
    place(1, up, terminationShockAu(toEcl(up)), hp * 0.85, cam);
    up.negate();
    place(2, up, 0.62 * OORT_OUTER_AU, oort, cam);
  });
  return null;
}

/** The layer the names live in (over the view, under the body labels). */
export function RegionNamesLayer() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host = root.current;
    if (!host) return;
    NAMES.forEach((name, k) => {
      const el = document.createElement('span');
      el.className = 'constellation-name';
      el.textContent = name;
      el.title = TITLES[k];
      el.style.opacity = '0';
      host!.appendChild(el);
      els.push(el);
    });
    return () => {
      for (const el of els) el.remove();
      els.length = 0;
      host = null;
    };
  }, []);
  return <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" />;
}
