/**
 * A pulsar seen up close (sim/deepsky/pulsarModel.ts; materials: render/pulsarMaterials.ts): the neutron star, its two
 * radio beams sweeping round as it turns, its magnetic field lines and, for a pair of neutron stars, the other star
 * and both orbits. Drawn for the pulsar in view (the one focused or selected, else the nearest of those registered)
 * while the camera is within a few hundred times its size (its light cylinder, or its pair's orbit), fading out
 * beyond; its marker (scene/DeepSky.tsx) is hidden meanwhile (pulsarShown).
 *
 * It turns as its marker pulses, on the wall clock (slowed by a power of ten when too fast to watch), its beam towards
 * us at each pulse; a pair moves on the simulation's clock. A magnetar has its twisted close field (loops a few star
 * radii across, in magenta) and wider hot spots, and radio beams only if it has been seen pulsing in radio.
 *
 * With View › Magnetic field lines on, each star's whole magnetosphere replaces its few loops (sim/deepsky/
 * magnetosphere.ts): a pulsar's closed zone, its open lines wound into the wind and the striped wind's current sheet;
 * a magnetar's denser twisted field, as far out as its measured field sets; the Double Pulsar's B confined by A's wind.
 * They turn with the beams' spin phase. Built the first time the switch is on near that pulsar; with it off nothing
 * of them is made or drawn, and the close-up is as it was.
 *
 * Part of the deep-sky chunk (mounted by scene/DeepSky.tsx). Cost: nothing far from a pulsar; near one, up to four
 * beams ray-marched over the pixels they cover (24 samples each way), a few thousand line segments and a sphere; with
 * the field lines on, about 25,000 more segments a star and the wind's sheet (docs/data/deepsky.md §5).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  Points,
  SphereGeometry,
  Vector3,
  AdditiveBlending,
  type ShaderMaterial,
} from 'three';
import { createBeamMaterial, createFieldLineMaterial, createGlowMaterial, createMagnetosphereMaterial, createSheetMaterial, createStarMaterial } from '../render/pulsarMaterials';
import {
  denseTwistedField,
  DOUBLE_PULSAR_A_EDOT,
  DOUBLE_PULSAR_B_EDOT,
  type FieldLineSet,
  magnetopauseKm,
  pulsarMagnetosphere,
  stripedSheet,
  twistedReach,
} from '../sim/deepsky/magnetosphere';
import { psfUniforms } from '../render/materials';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { bodyRecords, getBody, type BodyId } from '../sim/bodies';
import { fieldLines, magneticAxisAt, NS_RADIUS_KM, pairPlaces, rotateAbout, spinPhase, twistedFieldLines, type PulsarModel, type Spin } from '../sim/deepsky/pulsarModel';
import { pulsarId } from '../sim/deepsky/records';
import { smoothstep } from '../sim/deepsky/markers';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

/** The pulsars whose markers are hidden while their model shows (scene/DeepSky.tsx reads it). */
export const pulsarShown: { ids: BodyId[] } = { ids: [] };

/** The model shows fully within this many times its size, and is gone beyond the next. */
const SHOW_SIZES: readonly [number, number] = [60, 250];
/** A beam is drawn this many times the model's size long. */
const BEAM_SIZES = 30;
/** A beam's brightness across, at the model's size from the star. */
const BEAM_REF = 0.12;
/** The beams' bounding cone, in beam half-widths. */
const BOUND = 1.3;
const CONE_SEGMENTS = 32;
const ORBIT_POINTS = 256;
const UP = new Vector3(0, 1, 0);

/** A unit cone, its apex at the origin and its base at y = 1, wide enough to hold a beam of tan half-width 1. */
function unitCone(): ConeGeometry {
  const g = new ConeGeometry(1 / Math.cos(Math.PI / CONE_SEGMENTS), 1, CONE_SEGMENTS, 1, false);
  g.rotateX(Math.PI);
  g.translate(0, 0.5, 0);
  return g;
}

interface Star {
  spin: Spin;
  group: Group;
  sphere: Mesh;
  starMat: ShaderMaterial;
  glow: Points;
  glowMat: ShaderMaterial;
  beams: { mesh: Mesh; mat: ShaderMaterial }[];
  lines: LineSegments | null;
  linesMat: ShaderMaterial | null;
  /** A magnetar's twisted loops. */
  twisted: LineSegments | null;
  twistedMat: ShaderMaterial | null;
  /** The magnetic frame at phase 0: x, y (z is the magnetic axis). */
  x0: Vector3;
  y0: Vector3;
  /** Across the spin axis towards the magnetic axis at phase 0 (the turning frame's x). */
  u0: Vector3;
  /** What its whole magnetosphere is (View › Magnetic field lines), its field (G; a magnetar's), and once built its objects. */
  fieldKind: 'pulsar' | 'magnetar' | 'confined';
  bG: number;
  field: { lines: LineSegments; mat: ShaderMaterial; sheet: Mesh | null; sheetMat: ShaderMaterial | null } | null;
}

interface Built {
  id: BodyId;
  model: PulsarModel;
  root: Group;
  stars: Star[];
  orbits: LineLoop[];
  orbitMat: LineBasicMaterial | null;
  dispose: () => void;
}

/** The Double Pulsar's B, whose field A's wind confines. */
const DOUBLE_PULSAR_B = 'J0737-3039B';

function lineGeometry(f: FieldLineSet): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(f.positions, 3));
  g.setAttribute('aArc', new BufferAttribute(f.arc, 1));
  g.setAttribute('aPol', new BufferAttribute(f.pol, 1));
  g.setAttribute('aFlow', new BufferAttribute(f.flow, 1));
  g.setAttribute('aW', new BufferAttribute(f.weight, 1));
  return g;
}

/** A star's whole magnetosphere, made the first time the switch is on near it. */
function buildField(s: Star): NonNullable<Star['field']> {
  const rlc = s.spin.lightCylinderKm;
  let f: FieldLineSet;
  let dashKm: number;
  if (s.fieldKind === 'magnetar') {
    f = denseTwistedField(s.bG);
    dashKm = 0.12 * twistedReach(s.bG) * NS_RADIUS_KM;
  } else if (s.fieldKind === 'confined') {
    // Dipole loops out to 6 magnetopause radii (2.4 × 10⁵ km); the vertex shader confines them.
    const rmp = magnetopauseKm(DOUBLE_PULSAR_A_EDOT, DOUBLE_PULSAR_B_EDOT, s.spin.periodS, 8.8e5);
    const closed = [0.04, 0.07, 0.11, 0.17, 0.25, 0.36, 0.5, 0.75, 1].map((l) => (l * 6 * rmp) / rlc);
    f = pulsarMagnetosphere(s.spin.periodS, s.spin.alphaRad, NS_RADIUS_KM, { closed, open: [], azimuths: 14 });
    dashKm = 0.08 * rmp;
  } else {
    f = pulsarMagnetosphere(s.spin.periodS, s.spin.alphaRad);
    dashKm = 0.15 * rlc;
  }
  const mat = createMagnetosphereMaterial();
  mat.uniforms.uDashKm.value = dashKm;
  if (s.fieldKind !== 'pulsar') mat.uniforms.uGain.value = s.fieldKind === 'magnetar' ? 2.2 : 1.8;
  const lines = new LineSegments(lineGeometry(f), mat);
  lines.frustumCulled = false;
  lines.renderOrder = 1;
  // Guides, on the orbit lines' layer (scene/HoleFieldLines.tsx says why).
  lines.layers.set(GUIDES_LAYER);
  s.group.add(lines);
  let sheet: Mesh | null = null;
  let sheetMat: ShaderMaterial | null = null;
  if (s.fieldKind === 'pulsar') {
    const sh = stripedSheet(s.spin.periodS, s.spin.alphaRad);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(sh.positions, 3));
    g.setAttribute('aU', new BufferAttribute(sh.u, 1));
    g.setIndex(new BufferAttribute(sh.index, 1));
    sheetMat = createSheetMaterial();
    sheet = new Mesh(g, sheetMat);
    sheet.frustumCulled = false;
    sheet.renderOrder = 1;
    sheet.layers.set(GUIDES_LAYER);
    s.group.add(sheet);
  }
  return { lines, mat, sheet, sheetMat };
}

function buildStar(spin: Spin, sphereGeo: SphereGeometry, coneGeo: ConeGeometry, glowGeo: BufferGeometry, magnetar: PulsarModel['magnetar'] = null, jname = ''): Star {
  const group = new Group();
  const starMat = createStarMaterial();
  const sphere = new Mesh(sphereGeo, starMat);
  sphere.scale.setScalar(NS_RADIUS_KM);
  sphere.frustumCulled = false;
  // The polar caps: where the open field lines meet the star, θ = asin √(R/R_LC).
  // A magnetar's hot spots: where its twisted loops of 4 star radii meet the surface, 30° from the poles.
  starMat.uniforms.uCapCos.value = magnetar ? Math.cos(Math.asin(Math.sqrt(1 / 4))) : Math.cos(Math.asin(Math.sqrt(Math.min(1, NS_RADIUS_KM / spin.lightCylinderKm))));
  const glowMat = createGlowMaterial(psfUniforms.uPixelRatio);
  const glow = new Points(glowGeo, glowMat);
  glow.frustumCulled = false;
  group.add(sphere, glow);
  const beams = spin.beams
    ? [0, 1].map(() => {
        const mat = createBeamMaterial();
        const mesh = new Mesh(coneGeo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        group.add(mesh);
        return { mesh, mat };
      })
    : [];
  let lines: LineSegments | null = null;
  let linesMat: ShaderMaterial | null = null;
  let twisted: LineSegments | null = null;
  let twistedMat: ShaderMaterial | null = null;
  if (magnetar) {
    const f = twistedFieldLines(magnetar.twistRad);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(f.positions, 3));
    g.setAttribute('aS', new Float32BufferAttribute(f.s, 1));
    g.setAttribute('aOpen', new Float32BufferAttribute(f.open, 1));
    twistedMat = createFieldLineMaterial();
    // No sweep-back this close in; brighter than a pulsar's field, magenta (false colour).
    twistedMat.uniforms.uRlc.value = spin.lightCylinderKm;
    twistedMat.uniforms.uTwist.value = 0;
    twistedMat.uniforms.uColor.value.set('#ff7ae0').multiplyScalar(7);
    twisted = new LineSegments(g, twistedMat);
    twisted.frustumCulled = false;
    twisted.renderOrder = 1;
    group.add(twisted);
  }
  if (spin.beams) {
    const f = fieldLines(spin.lightCylinderKm, NS_RADIUS_KM, 5);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(f.positions, 3));
    g.setAttribute('aS', new Float32BufferAttribute(f.s, 1));
    g.setAttribute('aOpen', new Float32BufferAttribute(f.open, 1));
    linesMat = createFieldLineMaterial();
    linesMat.uniforms.uRlc.value = spin.lightCylinderKm;
    lines = new LineSegments(g, linesMat);
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    group.add(lines);
  }
  const x0 = new Vector3().crossVectors(spin.axis, spin.mag0);
  if (x0.lengthSq() < 1e-12) x0.set(spin.axis.y, spin.axis.z, spin.axis.x);
  x0.normalize();
  const y0 = new Vector3().crossVectors(spin.mag0, x0).normalize();
  const u0 = spin.mag0.clone().addScaledVector(spin.axis, -spin.mag0.dot(spin.axis));
  if (u0.lengthSq() < 1e-12) u0.copy(x0);
  u0.normalize();
  const fieldKind = magnetar ? 'magnetar' : jname === DOUBLE_PULSAR_B ? 'confined' : 'pulsar';
  return { spin, group, sphere, starMat, glow, glowMat, beams, lines, linesMat, twisted, twistedMat, x0, y0, u0, fieldKind, bG: magnetar?.bG ?? NaN, field: null };
}

function build(id: BodyId, model: PulsarModel, jname: string): Built {
  const root = new Group();
  const sphereGeo = new SphereGeometry(1, 64, 32);
  const coneGeo = unitCone();
  const glowGeo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
  const stars = [buildStar(model.spin, sphereGeo, coneGeo, glowGeo, model.magnetar, jname)];
  if (model.pair) stars.push(buildStar(model.pair.companion, sphereGeo, coneGeo, glowGeo, null, model.pair.companionJname ?? ''));
  for (const s of stars) root.add(s.group);
  const orbits: LineLoop[] = [];
  let orbitMat: LineBasicMaterial | null = null;
  if (model.pair) {
    orbitMat = new LineBasicMaterial({ color: 0x9aa8c8, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    const p = new Vector3();
    const c = new Vector3();
    const pts = [new Float32Array(3 * ORBIT_POINTS), new Float32Array(3 * ORBIT_POINTS)];
    const ms = model.pair.periodS * 1000;
    for (let i = 0; i < ORBIT_POINTS; i++) {
      pairPlaces(model.pair, (ms * i) / ORBIT_POINTS, p, c);
      pts[0].set([p.x, p.y, p.z], 3 * i);
      pts[1].set([c.x, c.y, c.z], 3 * i);
    }
    for (const a of pts) {
      const loop = new LineLoop(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(a, 3)), orbitMat);
      loop.frustumCulled = false;
      orbits.push(loop);
      root.add(loop);
    }
  }
  const dispose = () => {
    sphereGeo.dispose();
    coneGeo.dispose();
    glowGeo.dispose();
    for (const s of stars) {
      s.starMat.dispose();
      s.glowMat.dispose();
      for (const b of s.beams) b.mat.dispose();
      s.lines?.geometry.dispose();
      s.linesMat?.dispose();
      s.twisted?.geometry.dispose();
      s.twistedMat?.dispose();
      s.field?.lines.geometry.dispose();
      s.field?.mat.dispose();
      s.field?.sheet?.geometry.dispose();
      s.field?.sheetMat?.dispose();
    }
    for (const o of orbits) o.geometry.dispose();
    orbitMat?.dispose();
  };
  return { id, model, root, stars, orbits, orbitMat, dispose };
}

/** The pulsar to draw: the one focused or selected, else the nearest registered. */
function pulsarInView(): { id: BodyId; model: PulsarModel } | null {
  const ui = useUI.getState();
  for (const id of [ui.focus, ui.selected]) {
    const m = id ? getBody(id)?.pulsar : undefined;
    if (id && m) return { id, model: m };
  }
  let best: { id: BodyId; model: PulsarModel } | null = null;
  let bestD = Infinity;
  for (const r of bodyRecords()) {
    if (r.kind !== 'pulsar' || !r.pulsar) continue;
    const d = sim.bodies[r.id]?.distCamera ?? Infinity;
    if (d < bestD) {
      bestD = d;
      best = { id: r.id, model: r.pulsar };
    }
  }
  return best;
}

const centre = new Vector3();
const offsets = [new Vector3(), new Vector3()];
const mag = new Vector3();
const toCam = new Vector3();
const x = new Vector3();
const y = new Vector3();
const neg = new Vector3();
const e1 = new Vector3();
const e2 = new Vector3();
const toOther = new Vector3();

/** The whole magnetosphere this frame: turned with the star (in the spin frame, or the magnetic frame), or hidden. */
function updateField(s: Star, on: boolean, phase: number, wallS: number, o: number, other: Vector3 | null, offset: Vector3): void {
  if (s.lines) s.lines.visible = !on;
  if (s.twisted) s.twisted.visible = !on;
  if (!on) {
    if (s.field) {
      s.field.lines.visible = false;
      if (s.field.sheet) s.field.sheet.visible = false;
    }
    return;
  }
  if (!s.field) s.field = buildField(s);
  const { spin } = s;
  const u = s.field.mat.uniforms;
  if (s.fieldKind === 'pulsar') {
    rotateAbout(s.u0, spin.axis, 2 * Math.PI * phase, e1);
    e2.crossVectors(spin.axis, e1);
    u.uRot.value.set(e1.x, e2.x, spin.axis.x, e1.y, e2.y, spin.axis.y, e1.z, e2.z, spin.axis.z);
  } else {
    magneticAxisAt(spin, phase, mag);
    rotateAbout(s.x0, spin.axis, 2 * Math.PI * phase, x);
    rotateAbout(s.y0, spin.axis, 2 * Math.PI * phase, y);
    u.uRot.value.set(x.x, y.x, mag.x, x.y, y.y, mag.y, x.z, y.z, mag.z);
  }
  if (s.fieldKind === 'confined' && other) {
    // A's wind from A's side: the magnetopause at this moment's separation (Lyutikov & Thompson 2005).
    toOther.copy(other).sub(offset);
    const d = toOther.length();
    toOther.divideScalar(Math.max(d, 1e-9));
    u.uConfine.value.set(toOther.x, toOther.y, toOther.z, magnetopauseKm(DOUBLE_PULSAR_A_EDOT, DOUBLE_PULSAR_B_EDOT, spin.periodS, d));
  }
  u.uTime.value = wallS % 3600;
  u.uOpacity.value = o;
  s.field.lines.visible = true;
  if (s.field.sheet && s.field.sheetMat) {
    s.field.sheetMat.uniforms.uRot.value.copy(u.uRot.value);
    s.field.sheetMat.uniforms.uOpacity.value = o;
    s.field.sheet.visible = true;
  }
}

function updateStar(s: Star, model: PulsarModel, offset: Vector3, wallS: number, o: number, fieldOn = false, other: Vector3 | null = null): void {
  const { spin } = s;
  s.group.position.copy(offset);
  const phase = spinPhase(spin, wallS);
  magneticAxisAt(spin, phase, mag);
  s.starMat.uniforms.uMag.value.copy(mag);
  s.starMat.uniforms.uOpacity.value = o;
  // The star's place from the camera; a beam pointing at the camera flares.
  toCam.copy(centre).add(offset).negate();
  const dCam = toCam.length();
  toCam.divideScalar(Math.max(dCam, 1e-9));
  let flash = 0;
  if (spin.beams) {
    const size = model.sizeKm;
    const tanRho = Math.tan(spin.beamRad);
    const bound = Math.atan(BOUND * tanRho);
    const length = BEAM_SIZES * size;
    s.beams.forEach((b, k) => {
      const axis = k === 0 ? mag : neg.copy(mag).negate();
      const ang = Math.acos(Math.min(1, Math.max(-1, axis.dot(toCam))));
      flash = Math.max(flash, Math.exp(-((ang / spin.beamRad) ** 2)));
      b.mesh.quaternion.setFromUnitVectors(UP, axis);
      b.mesh.scale.set(length * Math.tan(bound), length, length * Math.tan(bound));
      const u = b.mat.uniforms;
      u.uApex.value.copy(centre).add(offset);
      u.uAxis.value.copy(axis);
      u.uTanRho.value = tanRho;
      u.uCos2Bound.value = Math.cos(bound) ** 2;
      u.uLength.value = length;
      u.uK.value = (BEAM_REF * size) / (1.03 * tanRho);
      u.uOpacity.value = o;
    });
  }
  for (const m of [s.linesMat, s.twistedMat]) {
    if (!m) continue;
    const u = m.uniforms;
    rotateAbout(s.x0, spin.axis, 2 * Math.PI * phase, x);
    rotateAbout(s.y0, spin.axis, 2 * Math.PI * phase, y);
    u.uRot.value.set(x.x, y.x, mag.x, x.y, y.y, mag.y, x.z, y.z, mag.z);
    u.uSpin.value.copy(spin.axis);
    u.uTime.value = wallS % 3600;
    u.uOpacity.value = o;
  }
  updateField(s, fieldOn, phase, wallS, o, other, offset);
  // The point of light while the star is small on screen, flaring as a beam sweeps over the camera.
  const px = (NS_RADIUS_KM / Math.max(dCam, 1)) * (sim.viewport.height / 2 / Math.tan((sim.camera.fovDeg * Math.PI) / 360));
  const small = 1 - smoothstep(6, 30, px);
  s.glowMat.uniforms.uIntensity.value = o * (small * (spin.beams ? 0.9 : 0.6) + 2.5 * flash);
  s.glowMat.uniforms.uSizePx.value = 36 * (1 + 1.5 * flash);
}

/** A pulsar body's catalogue name ("J0737-3039B"), from its record's aliases. */
function jnameOf(id: BodyId): string {
  const r = getBody(id);
  return r?.aliases?.find((a) => /^J\d{4}[+-]\d{2,4}[A-Za-z]*$/.test(a)) ?? '';
}

export function PulsarModel() {
  const root = useRef<Group | null>(null);
  const built = useRef<Built | null>(null);
  const dispose = useMemo(
    () => () => {
      if (!built.current) return;
      root.current?.remove(built.current.root);
      built.current.dispose();
      built.current = null;
    },
    [],
  );
  useEffect(() => () => {
    dispose();
    pulsarShown.ids = [];
  }, [dispose]);

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const want = pulsarInView();
    const b = want ? sim.bodies[want.id] : undefined;
    const o = want && b?.present ? 1 - smoothstep(SHOW_SIZES[0] * want.model.sizeKm, SHOW_SIZES[1] * want.model.sizeKm, b.distCamera) : 0;
    if (!want || !b || o <= 0) {
      g.visible = false;
      if (pulsarShown.ids.length) pulsarShown.ids = [];
      return;
    }
    if (built.current?.id !== want.id || built.current.model !== want.model) {
      dispose();
      built.current = build(want.id, want.model, jnameOf(want.id));
      g.add(built.current.root);
    }
    const { model, stars, orbitMat } = built.current;
    g.visible = true;
    const partner = model.pair?.companionJname;
    pulsarShown.ids = partner ? [want.id, pulsarId(partner)] : [want.id];
    centre.copy(b.apparentPos).sub(sim.camera.pos);
    g.position.copy(centre);
    offsets[0].set(0, 0, 0);
    if (model.pair) pairPlaces(model.pair, sim.timeMs, offsets[0], offsets[1]);
    const wallS = performance.now() / 1000;
    const fieldOn = useUI.getState().fieldLines;
    stars.forEach((s, i) => updateStar(s, model, offsets[i], wallS, o, fieldOn, stars.length > 1 ? offsets[1 - i] : null));
    if (orbitMat) orbitMat.opacity = 0.22 * o;
  });

  return <group ref={root} visible={false} />;
}
