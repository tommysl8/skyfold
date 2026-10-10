/**
 * The phenomena's models (sim/phenomena; materials: render/phenomenaMaterials.ts), a chunk of its own mounted once one is
 * first near (App.tsx):
 *  - Aurora: Earth's two ovals on the night side, at the geomagnetic poles of the date and the activity chosen in the
 *    View menu (Kp; by default the Kp measured at the date, sim/spaceWeather), their curtains folding slowly on the
 *    wall clock.
 *  - Supernovae: each one's fireball and debris up close, from the moment its light reached Earth to today's remnant;
 *    SN 1987A's ring of gas lit by its flash and then its blast.
 *  - The kilonova of GW170817: the two neutron stars spiralling in (the chirp's real pace, the orbit drawn slowed), then
 *    the glowing debris, blue then red; with View › Magnetic field lines, their fields (scene/MergerField.tsx).
 *  - The jets of M87 (visible light) and Centaurus A (radio and X-rays, false colour), beamed as seen from the camera.
 * Each draws nothing (its mesh not even visible) until it is near and wanted; the meshes are bounding spheres, so the
 * cost is the pixels each covers: measured in docs/data/phenomena.md §5.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Mesh, SphereGeometry, Vector3, type PerspectiveCamera, type ShaderMaterial } from 'three';
import { blackbodyRgb, bvToTemperature } from '../physics/blackbody';
import { KPC_KM, PARSEC_KM } from '../physics/constants';
import { BlobSet, createAuroraMaterial, createOvalTexture, createShellMaterial, MAX_BLOBS } from '../render/phenomenaMaterials';
import { psfUniforms } from '../render/materials';
import { MW_MU_FADE, psfSolidAngle } from '../sim/galaxy/background';
import { eqjToWorld } from '../sim/frames';
import { getBody } from '../sim/bodies';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';
import { MODEL_REACH, phenomena, remnantShown } from '../sim/phenomena';
import { auroraBrightness, bodyFixedDir, BLUE_NM, fluxPerKr, geomagneticPole, GREEN_NM, lineColour, ovalTable, RED_NM } from '../sim/phenomena/aurora';
import { auroraKpNow, wantKp } from '../sim/spaceWeather';
import { RING_1987A, SUPERNOVAE, type Supernova, type SupernovaState } from '../sim/phenomena/supernovae';
import { inspiralAt, NS_RADIUS_KM, THETA_JN_DEG, vLuminosityUnits, type Inspiral } from '../sim/phenomena/kilonova';
import { KILONOVA_ID } from '../sim/phenomena/records';
import { beamingFrom, blobReachKpc, cenABlobs, m87JetBlobs, type Blob } from '../sim/phenomena/jets';
import { NONE } from '../sim/phenomena/lightCurve';
import { MergerField, mergerView } from './MergerField';

const ARCSEC2_PER_SR = 4.2545e10;
const SPHERE = new SphereGeometry(1, 48, 24);
const tmp = new Vector3();
const tmp2 = new Vector3();

/** The law of the sky this frame: uScale, and S at the eye's fade (MW_MU_FADE) — shared by every material here. */
const law = { scale: 1, fadeLo: 1, fadeHi: 2 };
function updateLaw(camera: PerspectiveCamera): void {
  const cssPixel = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, sim.viewport.height);
  const gain = psfUniforms.uStarGain.value;
  law.scale = gain * gain * psfSolidAngle(cssPixel) * 10 ** (0.4 * psfUniforms.uMagZero.value);
  law.fadeLo = 10 ** (-0.4 * MW_MU_FADE[1]) * ARCSEC2_PER_SR;
  law.fadeHi = 10 ** (-0.4 * MW_MU_FADE[0]) * ARCSEC2_PER_SR;
}
/**
 * The law's uniforms, and the exposure: an explosion up close is blinding (a kilonova's or a supernova's photosphere is
 * millions of times the Sun's surface brightness), so where the brightest part (S at its peak, flux per sr) would be
 * drawn above PEAK_Y the view of the model is stopped down to it, as the eye or a camera would be, and its structure
 * and colour show. The stars round it are left as they are: next to it they would be lost in its glare anyway.
 */
const PEAK_Y = 2.5;
function applyLaw(m: ShaderMaterial, opacity: number, peakS = 0): void {
  m.uniforms.uScale.value = law.scale;
  m.uniforms.uFadeS.value.set(law.fadeLo, law.fadeHi);
  m.uniforms.uOpacity.value = opacity;
  const y = Math.sqrt(law.scale * peakS);
  m.uniforms.uExposure.value = y > PEAK_Y ? PEAK_Y / y : 1;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** World axes: celestial north. */
const POLE = eqjToWorld(0, 0, 1);

/** The frame (east, north, towards Earth) at a place seen from Earth, world axes. */
function skyFrame(at: Vector3, east: Vector3, north: Vector3, toEarth: Vector3): void {
  const e = sim.bodies.earth;
  toEarth.copy(e ? e.pos : tmp.set(0, 0, 0)).sub(at).normalize();
  tmp2.copy(toEarth).negate();
  east.crossVectors(POLE, tmp2).normalize();
  north.crossVectors(tmp2, east);
}

// ─── Aurora ───────────────────────────────────────────────────────────────────────────

/** The ovals are redrawn when Kp moves by this much (a ninth: the eased measured Kp changes smoothly). */
const KP_STEP = 1 / 9;

function Aurora() {
  const texture = useMemo(() => createOvalTexture(ovalTable(3)), []);
  const material = useMemo(() => createAuroraMaterial(texture), [texture]);
  const drawnKp = useRef(3);
  phenomena.materials.aurora = material;
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => texture.dispose(), [texture]);
  const mesh = useRef<Mesh>(null);
  const green = useMemo(() => lineColour(GREEN_NM), []);
  const red = useMemo(() => lineColour(RED_NM), []);
  const blue = useMemo(() => lineColour(BLUE_NM), []);
  const flux = useMemo(() => ({ g: fluxPerKr(GREEN_NM), r: fluxPerKr(RED_NM), b: fluxPerKr(BLUE_NM) }), []);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const e = sim.bodies.earth;
    const sun = sim.bodies.sun;
    const on = phenomena.want.aurora && !!e && !!sun;
    m.visible = on;
    if (!on) return;
    updateLaw(camera);
    // The activity: the visitor's, or the Kp measured at the date (its table loaded the first time it is wanted).
    if (useUI.getState().auroraKp === 'auto') wantKp();
    const kp = auroraKpNow();
    if (Math.abs(kp - drawnKp.current) >= KP_STEP || (kp !== drawnKp.current && Number.isInteger(kp))) {
      const table = ovalTable(kp);
      (texture.image.data as Float32Array).set(table);
      texture.needsUpdate = true;
      drawnKp.current = kp;
      // Rays are rejected below the oval's lowest latitude, less 3° (50° but in great storms).
      let colat = 0;
      for (let i = 1; i < table.length; i += 4) colat = Math.max(colat, table[i] * 90);
      material.uniforms.uMinSinLat.value = Math.sin((Math.min(50, 87 - colat) * Math.PI) / 180);
    }
    const rec = getBody('earth')!;
    const R = e.displayRadius;
    const scale = R / (rec.physical.equatorialRadiusKm ?? rec.physical.radiusKm);
    m.position.copy(e.apparentPos).sub(sim.camera.pos);
    m.scale.setScalar(R + 340 * scale);
    const u = material.uniforms;
    u.uCentre.value.copy(m.position);
    u.uRadiusKm.value = R;
    u.uScaleKm.value = scale;
    const year = 1970 + sim.timeMs / (365.2425 * 86_400_000);
    const pole = geomagneticPole(year);
    const d = bodyFixedDir(pole.latDeg, pole.lonDeg);
    u.uDipole.value.set(d[0], d[1], d[2]).applyQuaternion(e.apparentQuat).normalize();
    u.uSun.value.copy(sun.apparentPos).sub(e.apparentPos).normalize();
    const { greenKr, redShare } = auroraBrightness(drawnKp.current);
    u.uKr.value = greenKr;
    u.uRedShare.value = redShare;
    u.uFluxPerKr.value = flux.g;
    // The display's roll-off: from a column of 20 kR of the green line (a bright quiet-night arc seen overhead is 15)
    // towards 60 kR.
    u.uSoftS.value.set(20 * flux.g, 60 * flux.g);
    u.uEffRed.value = flux.r / flux.g;
    u.uEffBlue.value = flux.b / flux.g;
    u.uGreen.value.setRGB(green[0], green[1], green[2]);
    u.uRed.value.setRGB(red[0], red[1], red[2]);
    u.uBlue.value.setRGB(blue[0], blue[1], blue[2]);
    u.uScale.value = law.scale;
    u.uTime.value = (performance.now() / 1000) % 10_000;
    u.uOpacity.value = smooth(1.5, 5, e.radiusPx);
  });
  return <mesh ref={mesh} geometry={SPHERE} material={material} frustumCulled={false} renderOrder={5} visible={false} />;
}

// ─── Supernovae ───────────────────────────────────────────────────────────────────────

/** The dust between a supernova and us, E(B − V): its light curve's colours and magnitudes are as Earth saw them through it. */
const EBV: Record<string, number> = { 'sn-1006': 0.11, 'sn-1054': 0.52, 'sn-1181': 0.84, 'sn-1572': 0.6, 'sn-1604': 0.9, 'supernova-1987a': 0.19 };

/** B − V of a colour temperature (the inverse of Ballesteros's law, by bisection over its range). */
function bvOf(teffK: number): number {
  let lo = -0.4;
  let hi = 2.0;
  for (let i = 0; i < 30; i++) {
    const mid = 0.5 * (lo + hi);
    if (bvToTemperature(mid) > teffK) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** The remnant's false colours: the shocked shell (X-ray-bright, blue-white) and the hot ejecta within (iron-rich, amber). */
const SHELL_COLOUR = blackbodyRgb(14000);
const EJECTA_COLOUR = [1.45, 0.82, 0.42] as const;
/** The false-colour remnant's brightness at the rim, mag/arcsec² (chosen to be seen, faint). */
const REMNANT_MU = 21.3;

interface SnSlot {
  sn: Supernova;
  mesh: Mesh;
  material: ShaderMaterial;
  ring: BlobSet | null;
}

/** SN 1987A's ring's V magnitude from Earth against days (a model of its light: lit by the flash, fading, then by the blast). */
function ring1987aMag(days: number): number {
  if (days < 80) return NONE;
  const pts: [number, number][] = [
    [80, 18],
    [400, 15.6],
    [2900, 17],
    [8000, 15],
    [13000, 16],
  ];
  if (days >= pts[pts.length - 1][0]) return 16 + (days - 13000) * 0.0002;
  for (let i = 0; i < pts.length - 1; i++) {
    if (days <= pts[i + 1][0]) return pts[i][1] + ((days - pts[i][0]) / (pts[i + 1][0] - pts[i][0])) * (pts[i + 1][1] - pts[i][1]);
  }
  return NONE;
}

const RING_BLOBS = 28;

function placeRing(slot: SnSlot, st: SupernovaState, centre: Vector3, opacity: number): void {
  const { ring } = slot;
  if (!ring) return;
  const days = st.days;
  const mag = ring1987aMag(days);
  if (mag >= NONE || opacity <= 0) {
    ring.mesh.visible = false;
    return;
  }
  const sn = slot.sn;
  const rKm = RING_1987A.radiusArcsec * sn.distancePc * (PARSEC_KM / 206_264.806);
  const unit = rKm;
  const east = new Vector3();
  const north = new Vector3();
  const toEarth = new Vector3();
  skyFrame(sim.bodies[sn.id].pos, east, north, toEarth);
  const pa = (RING_1987A.majorAxisPaDeg * Math.PI) / 180;
  const inc = (RING_1987A.inclinationDeg * Math.PI) / 180;
  const major = east.clone().multiplyScalar(Math.sin(pa)).addScaledVector(north, Math.cos(pa));
  const minorSky = east.clone().multiplyScalar(Math.sin(pa - Math.PI / 2)).addScaledVector(north, Math.cos(pa - Math.PI / 2));
  const minor = minorSky.multiplyScalar(Math.cos(inc)).addScaledVector(toEarth, Math.sin(inc));
  const L = 10 ** (-0.4 * (mag - 3.1 * EBV[sn.id])) * (sn.distancePc * PARSEC_KM) ** 2;
  // Hot spots: from 1995 the blast lit the ring in knots; before, the flash lit it evenly.
  const spots = smooth(2900, 6000, days);
  const col = blackbodyRgb(9000);
  let total = 0;
  const w: number[] = [];
  for (let i = 0; i < RING_BLOBS; i++) {
    const v = 1 - spots + spots * (0.15 + 1.7 * Math.abs(Math.sin(i * 2.399 + 0.7)) ** 3);
    w.push(v);
    total += v;
  }
  for (let i = 0; i < RING_BLOBS; i++) {
    const a = (2 * Math.PI * i) / RING_BLOBS;
    const p = major.clone().multiplyScalar(Math.cos(a)).addScaledVector(minor, Math.sin(a));
    const t = major.clone().multiplyScalar(-Math.sin(a)).addScaledVector(minor, Math.cos(a));
    ring.pos[i].copy(p);
    ring.axis[i].copy(t.normalize());
    ring.sig[i].set(spots > 0.5 ? 0.07 : 0.12, 0.04);
    const l = (L * w[i]) / total / (unit * unit);
    ring.lum[i].set(col[0] * l, col[1] * l, col[2] * l);
  }
  ring.count = RING_BLOBS;
  ring.unitKm = unit;
  ring.centre.copy(centre).divideScalar(unit);
  ring.sync();
  // The brightest knot's centre, S: the view is stopped down to it when it would blind (applyLaw).
  let peak = 0;
  for (let i = 0; i < RING_BLOBS; i++) peak = Math.max(peak, (0.2126 * ring.lum[i].x + 0.7152 * ring.lum[i].y + 0.0722 * ring.lum[i].z) / (2 * Math.PI * ring.sig[i].x * ring.sig[i].y));
  applyLaw(ring.material, opacity, peak);
  ring.mesh.visible = true;
}

function Supernovae() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const group = useRef<import('three').Group>(null);
  const slots = useRef(new Map<string, SnSlot>());
  useEffect(
    () => () => {
      for (const s of slots.current.values()) {
        s.material.dispose();
        s.ring?.dispose();
      }
      slots.current.clear();
      remnantShown.ids = [];
    },
    [],
  );
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const shown: string[] = [];
    if (phenomena.want.supernovae) updateLaw(camera);
    for (const sn of SUPERNOVAE) {
      const st = phenomena.sn.get(sn.id);
      const b = sim.bodies[sn.id];
      const size = st ? Math.max(st.shockKm, st.photosphereKm) : 0;
      const near = phenomena.want.supernovae && !!st && !!b && st.ageS > 0 && size > 0 && b.distCamera < MODEL_REACH * size;
      let slot = slots.current.get(sn.id);
      if (!near) {
        if (slot) slot.mesh.visible = false;
        if (slot?.ring) slot.ring.mesh.visible = false;
        continue;
      }
      if (!slot) {
        const material = createShellMaterial();
        phenomena.materials[sn.id] = material;
        const mesh = new Mesh(SPHERE, material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 4;
        g.add(mesh);
        let ring: BlobSet | null = null;
        if (sn.id === 'supernova-1987a') {
          ring = new BlobSet(SPHERE);
          g.add(ring.mesh);
        }
        slot = { sn, mesh, material, ring };
        slots.current.set(sn.id, slot);
      }
      drawSupernova(slot, st!, b!.apparentPos, b!.distCamera, size);
      if (sn.remnant.snrId) shown.push(sn.remnant.snrId);
    }
    if (shown.join() !== remnantShown.ids.join()) remnantShown.ids = shown;
  });
  return <group ref={group} />;
}

const centreScratch = new Vector3();

function drawSupernova(slot: SnSlot, st: SupernovaState, at: Vector3, dist: number, size: number): void {
  const { sn, mesh, material } = slot;
  const unit = Math.max(st.shockKm, st.photosphereKm);
  const centre = centreScratch.copy(at).sub(sim.camera.pos);
  // Fades in as the camera comes within a few hundred of its sizes (beyond, it is the point of light).
  const opacity = 1 - smooth(0.25 * MODEL_REACH * size, MODEL_REACH * size, dist);
  mesh.visible = opacity > 0;
  mesh.position.copy(centre);
  mesh.scale.setScalar(1.05 * unit);
  const u = material.uniforms;
  u.uCentre.value.copy(centre).divideScalar(unit);
  u.uUnitKm.value = unit;
  // Its light up close: as Earth saw it, without the dust in front (A_V = 3.1 E(B−V)).
  const ebv = EBV[sn.id] ?? 0;
  const dKm = sn.distancePc * PARSEC_KM;
  const lum = st.vmag < NONE ? 10 ** (-0.4 * (st.vmag - 3.1 * ebv)) * dKm * dKm : 0;
  const tInt = bvToTemperature(bvOf(st.teffK) - ebv);
  const days = st.ageS / 86_400;
  // The photosphere until the ejecta thin out (a type Ia's after about two months, a type II's after about four).
  const ia = sn.kind === 'Ia' || sn.kind === 'Iax';
  const wPhot = 1 - smooth(ia ? 50 : 100, ia ? 200 : 400, days);
  const phKm = st.photosphereKm;
  u.uPhot.value = phKm / unit;
  u.uPhotS.value = phKm > 0 ? (wPhot * lum) / (Math.PI * phKm * phKm) : 0;
  const pc = blackbodyRgb(tInt);
  u.uPhotCol.value.setRGB(pc[0], pc[1], pc[2]);
  // The nebular light after: the same luminosity, spread through the ejecta.
  const coreR = 0.75;
  const coreKm = coreR * unit;
  const coreVisible = ((1 - wPhot) * lum) / ((4 / 3) * Math.PI * coreKm ** 3) * unit;
  // The remnant (false colour): grows in over its first decades, but not where its picture shows it (the Crab).
  const sTarget = 10 ** (-0.4 * REMNANT_MU) * ARCSEC2_PER_SR;
  const wRem = sn.pictureRemnant ? 0 : smooth(0.5 * 365, 30 * 365, days);
  const coreFalse = (wRem * 0.35 * sTarget) / (2 * coreR);
  u.uCoreR.value = coreR;
  u.uCoreS.value = coreVisible + coreFalse;
  const nb = blackbodyRgb(Math.max(3000, tInt * 0.8));
  const wv = coreVisible / Math.max(1e-30, coreVisible + coreFalse);
  u.uCoreCol.value.setRGB(nb[0] * wv + EJECTA_COLOUR[0] * (1 - wv), nb[1] * wv + EJECTA_COLOUR[1] * (1 - wv), nb[2] * wv + EJECTA_COLOUR[2] * (1 - wv));
  u.uShellIn.value = 0.86;
  u.uShellS.value = (wRem * sTarget) / 0.6;
  u.uShellCol.value.setRGB(SHELL_COLOUR[0], SHELL_COLOUR[1], SHELL_COLOUR[2]);
  u.uSeed.value = sn.raDeg;
  applyLaw(material, opacity, Math.max(u.uPhotS.value, u.uCoreS.value * 2 * coreR, u.uShellS.value * 1.05));
  if (sn.id === 'supernova-1987a') placeRing(slot, st, centre, opacity);
}

// ─── The kilonova ─────────────────────────────────────────────────────────────────────

/** The neutron stars drawn white-hot: their surface brightness, mag/arcsec² (a model: their temperature is not known). */
const NS_MU = 9;
/** The orbit drawn this many times slower than it turned. */
export const ORBIT_SLOWDOWN = 100;

function Kilonova() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const set = useMemo(() => new BlobSet(SPHERE), []);
  const material = set.material;
  phenomena.materials.kilonova = material;
  useEffect(() => () => set.dispose(), [set]);
  const insp = useRef<Inspiral | null>(null);
  const frame = useMemo(() => ({ n: new Vector3(), e1: new Vector3(), e2: new Vector3(), east: new Vector3(), north: new Vector3(), toEarth: new Vector3() }), []);
  useFrame(() => {
    const m = set.mesh;
    const b = sim.bodies[KILONOVA_ID];
    const kn = phenomena.kilonova;
    if (!phenomena.want.kilonova || !b || !kn) {
      m.visible = false;
      mergerView.on = false;
      return;
    }
    updateLaw(camera);
    const ins = (insp.current = inspiralAt(sim.timeMs, insp.current ?? undefined));
    // The orbit's axis: θ_JN = 151° from the line of sight (its position angle is not known: taken as north).
    skyFrame(b.pos, frame.east, frame.north, frame.toEarth);
    const th = (THETA_JN_DEG * Math.PI) / 180;
    frame.n.copy(frame.toEarth).multiplyScalar(Math.cos(th)).addScaledVector(frame.north, Math.sin(th)).normalize();
    frame.e1.copy(frame.east);
    frame.e2.crossVectors(frame.n, frame.e1).normalize();
    let count = 0;
    const add = (p: Vector3, axis: Vector3, sa: number, sp: number, lum: number, col: readonly number[]) => {
      if (count >= MAX_BLOBS || !(lum > 0)) return;
      set.pos[count].copy(p);
      set.axis[count].copy(axis);
      set.sig[count].set(sa, sp);
      set.lum[count].set(col[0] * lum, col[1] * lum, col[2] * lum);
      count++;
    };
    // Its centre from the camera: exactly from the orbit when the camera orbits it (a world coordinate 40 Mpc out is
    // 10⁵ km coarse, the inspiral a few hundred km across), else from the world positions.
    const centre = controller.orbitOffsetKm(KILONOVA_ID, tmp) ? tmp.negate() : tmp.copy(b.apparentPos).sub(sim.camera.pos);
    let unit: number;
    const sNs = 10 ** (-0.4 * NS_MU) * ARCSEC2_PER_SR;
    const white = blackbodyRgb(25000);
    if (!ins.merged) {
      unit = Math.max(ins.separationKm, 4 * NS_RADIUS_KM);
      const phi = ins.orbitPhase / ORBIT_SLOWDOWN;
      const dir = tmp2.copy(frame.e1).multiplyScalar(Math.cos(phi)).addScaledVector(frame.e2, Math.sin(phi));
      const sig = NS_RADIUS_KM / 1.6 / unit;
      const lum = sNs * 2 * Math.PI * sig * sig;
      add(dir.clone().multiplyScalar(ins.r1Km / unit), frame.n, sig, sig, lum, white);
      add(dir.clone().multiplyScalar(-ins.r2Km / unit), frame.n, sig, sig, lum, white);
      mergerView.dir.copy(dir);
    } else {
      const R = Math.max(kn.blueKm, 30);
      unit = R;
      // The merged remnant's first moment: a hot, heavy neutron star that lasts well under a second (a model).
      const t = kn.days * 86_400;
      if (t < 1) {
        const sig = 20 / unit;
        add(new Vector3(), frame.n, sig, sig, sNs * 2 * Math.PI * sig * sig * (1 - t), white);
      }
      // The debris: the fast blue part towards the poles, the slower red part round the waist (Kasen et al. 2017).
      const L = kn.absV < 90 ? vLuminosityUnits(kn.absV) / (unit * unit) : 0;
      const blueShare = 0.15 + 0.7 * (1 - smooth(0.5, 4, kn.days));
      const tb = blackbodyRgb(kn.teffK * 1.12);
      const tr = blackbodyRgb(Math.max(2000, kn.teffK * 0.85));
      const rb = 1;
      add(frame.n.clone().multiplyScalar(0.5 * rb), frame.n, 0.32 * rb, 0.42 * rb, (L * blueShare) / 2, tb);
      add(frame.n.clone().multiplyScalar(-0.5 * rb), frame.n, 0.32 * rb, 0.42 * rb, (L * blueShare) / 2, tb);
      const rr = kn.redKm / unit;
      for (let i = 0; i < 10; i++) {
        const a = (2 * Math.PI * i) / 10;
        const p = frame.e1.clone().multiplyScalar(Math.cos(a) * 0.62 * rr).addScaledVector(frame.e2, Math.sin(a) * 0.62 * rr);
        const tang = frame.e1.clone().multiplyScalar(-Math.sin(a)).addScaledVector(frame.e2, Math.cos(a));
        add(p, tang, 0.36 * rr, 0.24 * rr, (L * (1 - blueShare)) / 10, tr);
      }
    }
    // The fields' model draws in the same place and frame (scene/MergerField.tsx).
    mergerView.on = true;
    mergerView.centre.copy(centre);
    mergerView.n.copy(frame.n);
    mergerView.sepKm = ins.separationKm;
    set.count = count;
    set.unitKm = unit;
    set.centre.copy(centre).divideScalar(unit);
    set.sync();
    m.visible = count > 0;
    // The brightest blob's centre, S (its luminosity over 2π σ_a σ_p, units cancel: lum is per unit²).
    let peak = 0;
    for (let i = 0; i < count; i++) {
      const l = set.lum[i];
      const sig = set.sig[i];
      peak = Math.max(peak, (0.2126 * l.x + 0.7152 * l.y + 0.0722 * l.z) / (2 * Math.PI * sig.x * sig.y));
    }
    applyLaw(material, 1, peak);
  });
  return <primitive object={set.mesh} />;
}

// ─── Jets ─────────────────────────────────────────────────────────────────────────────

const M87_COLOUR = blackbodyRgb(bvToTemperature(0.3));
const CEN_A_JET = blackbodyRgb(30000);
const CEN_A_LOBE: [number, number, number] = [1.5, 0.72, 0.3];

interface JetSystem {
  /** The body at its centre, and the galaxy it belongs to (for the camera's distance). */
  centre: string;
  galaxy: string;
  blobs: Blob[];
  reachKpc: number;
  /** Not drawn within this distance of the centre, km (a black hole's lens bends its light there). */
  fadeNearKm: [number, number];
}

function JetMesh({ sys }: { sys: JetSystem }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const set = useMemo(() => new BlobSet(SPHERE), []);
  phenomena.materials[`jets-${sys.galaxy}`] = set;
  useEffect(() => () => set.dispose(), [set]);
  const f = useMemo(() => ({ east: new Vector3(), north: new Vector3(), toEarth: new Vector3(), cam: new Vector3() }), []);
  useFrame(() => {
    const m = set.mesh;
    const c = sim.bodies[sys.centre] ?? sim.bodies[sys.galaxy];
    const gal = sim.bodies[sys.galaxy];
    if (!phenomena.want.jets || !c?.present || !gal) {
      m.visible = false;
      return;
    }
    const centre = tmp.copy(c.apparentPos).sub(sim.camera.pos);
    const dist = centre.length();
    // Big enough to see: its reach over a few pixels.
    const px = ((sys.reachKpc * KPC_KM) / Math.max(dist, 1)) * (sim.viewport.height / 2 / Math.tan((camera.fov * Math.PI) / 360));
    const opacity = smooth(2, 8, px) * smooth(sys.fadeNearKm[0], sys.fadeNearKm[1], dist);
    if (opacity <= 0) {
      m.visible = false;
      return;
    }
    updateLaw(camera);
    skyFrame(c.pos, f.east, f.north, f.toEarth);
    // The camera in the jet's frame, kpc: each blob beamed towards it.
    const camW = f.cam.copy(centre).negate().divideScalar(KPC_KM);
    const cx = camW.dot(f.east);
    const cy = camW.dot(f.north);
    const cz = camW.dot(f.toEarth);
    const kpc2 = KPC_KM * KPC_KM;
    const dirn = [0, 0, 0];
    sys.blobs.forEach((bl, i) => {
      set.pos[i].copy(f.east).multiplyScalar(bl.pos[0]).addScaledVector(f.north, bl.pos[1]).addScaledVector(f.toEarth, bl.pos[2]);
      set.axis[i].copy(f.east).multiplyScalar(bl.axis[0]).addScaledVector(f.north, bl.axis[1]).addScaledVector(f.toEarth, bl.axis[2]);
      set.sig[i].set(bl.sigAlong, bl.sigAcross);
      dirn[0] = cx - bl.pos[0];
      dirn[1] = cy - bl.pos[1];
      dirn[2] = cz - bl.pos[2];
      const l = Math.hypot(dirn[0], dirn[1], dirn[2]) || 1;
      dirn[0] /= l;
      dirn[1] /= l;
      dirn[2] /= l;
      const lum = (bl.lumEarth * beamingFrom(bl, dirn)) / kpc2;
      set.lum[i].set(bl.colour[0] * lum, bl.colour[1] * lum, bl.colour[2] * lum);
    });
    set.count = sys.blobs.length;
    set.unitKm = KPC_KM;
    set.centre.copy(centre).divideScalar(KPC_KM);
    set.sync();
    m.visible = true;
    applyLaw(set.material, opacity);
  });
  return <primitive object={set.mesh} />;
}

function Jets() {
  const systems = useMemo<JetSystem[]>(() => {
    const m87 = m87JetBlobs(M87_COLOUR);
    const cen = cenABlobs(CEN_A_JET, CEN_A_LOBE);
    return [
      // Within 0.02–0.1 pc of M87* (a few hundred of its radii) its lens bends the jet's light: not drawn there.
      { centre: 'm87-star', galaxy: 'm87', blobs: m87, reachKpc: blobReachKpc(m87), fadeNearKm: [0.02 * PARSEC_KM, 0.1 * PARSEC_KM] },
      { centre: 'centaurus-a', galaxy: 'centaurus-a', blobs: cen, reachKpc: blobReachKpc(cen), fadeNearKm: [0, 1e-9] },
    ];
  }, []);
  return (
    <>
      {systems.map((s) => (
        <JetMesh key={s.galaxy} sys={s} />
      ))}
    </>
  );
}

/** The phenomena's models. */
export default function Phenomena() {
  return (
    <>
      <Aurora />
      <Supernovae />
      <Kilonova />
      <MergerField />
      <Jets />
    </>
  );
}

