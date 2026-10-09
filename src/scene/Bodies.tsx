/**
 * Body meshes, for every body in the registry, at a cost that stays near zero for the many that
 * are specks.
 *
 * A body gets a mesh (a React component) only while it is about a pixel wide or more; below
 * that it is only its point of light (Glints.tsx). Mounted bodies hide their mesh under a pixel
 * (visible = false: not drawn at all, not even into the relativistic cube map), use a low-poly
 * sphere under 50 px, and unmount after a couple of seconds as specks. Textures load once a
 * body is a few pixels wide, are held while its mesh is mounted, and live in an LRU cache with
 * a memory budget (render/textures.ts); the Sun's, Earth's and the focused system's stay
 * pinned. A body with rings counts as wide as its rings.
 *
 * A black hole (renderer 'lens') has no mesh: its lens draws it (render/lens/, scene/BlackHoleLens.tsx). A star the
 * lens draws exactly as a sphere seen through it (lens.spheres: a stellar hole's companion near the axis) hides its
 * own mesh while it is listed, so it is neither drawn twice nor put into the relativistic cube map.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  type DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  type Group,
  LatheGeometry,
  type Mesh,
  Quaternion,
  type ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { blackbodyRgb } from '../physics/blackbody';
import { SUN_TEFF_K } from '../physics/constants';
import {
  bodyRecords,
  displayRadiusKm,
  getBody,
  isWithin,
  recordSerial,
  registryVersion,
  subscribeRegistry,
  systemOf,
  type BodyId,
  type BodyRecord,
  type RingArcs,
  type RingSpec,
} from '../sim/bodies';
import { bodyEntries } from '../sim/bodies/registry';
import { eqjToWorld, raDecToWorld } from '../sim/frames';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { createOrbitMaterial, createPlanetMaterial, createRingMaterial, createStarSurfaceMaterial, createSunMaterial, SUN_CENTRE_RADIANCE } from '../render/materials';
import { roundStarGeometry, starShapeGeometry } from '../render/starShape';
import { StarCells } from '../render/starCells';
import { bandsExtent, bandsTexture, extentFactor } from '../render/rings';
import { loadShape } from '../render/shapes';
import { acquireTexture, pumpTextureUploads, releaseTexture, setPinnedTextures, type TextureOptions } from '../render/textures';
import { lens } from '../render/lens/lensState';

/** Full sphere for bodies drawn large; a low-poly one below LOD_PX. */
const SPHERE_HI = new SphereGeometry(1, 128, 64);
const SPHERE_LO = new SphereGeometry(1, 32, 16);
/** On-screen radius below which the low-poly sphere is used, CSS px. */
export const LOD_PX = 50;
/** Below a pixel a body is its point of light only: no mesh is drawn. */
export const MESH_MIN_PX = 1;
/** A body's component mounts from this size (a little before it is drawn, so its material is ready)… */
const MOUNT_PX = 0.8;
/** …and unmounts after this many frames below UNMOUNT_PX. */
const UNMOUNT_PX = 0.5;
const UNMOUNT_FRAMES = 120;

const tmp = new Vector3();
const tmp2 = new Vector3();
const UP = new Vector3(0, 1, 0);
const qInv = new Quaternion();

/**
 * Sun position relative to the camera, in world axes. Lighting uses camera-relative world space,
 * so it is the same for the main camera and for the relativistic cube-map faces.
 */
function sunRelative(out: Vector3): Vector3 {
  const s = sim.bodies.sun;
  return s ? out.copy(s.apparentPos).sub(sim.camera.pos) : out.set(0, 0, 0).sub(sim.camera.pos);
}

/** The position of the star that lights a body (its record's `litBy`, else the Sun), relative to the camera. */
function lightRelative(rec: BodyRecord, out: Vector3): Vector3 {
  const s = rec.litBy ? sim.bodies[rec.litBy] : undefined;
  return s ? out.copy(s.apparentPos).sub(sim.camera.pos) : sunRelative(out);
}

/** The colour of a star's light (luminance 1, as the Sun's), from its temperature. */
function lightColour(id: BodyId): Color {
  return new Color(...blackbodyRgb(getBody(id)?.physical.luminous?.teffK ?? SUN_TEFF_K));
}

/**
 * Textures a mesh holds while mounted (so the cache never disposes them under it), released
 * when it unmounts. Returns the function that loads and holds one.
 */
function useHeldTextures() {
  const held = useRef<[string, TextureOptions][]>([]);
  useEffect(
    () => () => {
      for (const [file, opts] of held.current) releaseTexture(file, opts);
      held.current = [];
    },
    [],
  );
  return (file: string, opts: TextureOptions = {}) => {
    held.current.push([file, opts]);
    return acquireTexture(file, opts);
  };
}

/** Should this body's textures load yet? (Lazy: only once it is more than a few pixels wide.) */
function wantsTextures(id: BodyId): boolean {
  const b = sim.bodies[id];
  const ui = useUI.getState();
  return !!b && (b.radiusPx > 2 || ui.selected === id || ui.focus === id);
}

/** How a record is drawn. */
export function rendererOf(r: BodyRecord): NonNullable<NonNullable<BodyRecord['visual']>['renderer']> {
  const v = r.visual?.renderer;
  if (v) return v;
  switch (r.kind) {
    case 'star':
      return 'star';
    case 'spacecraft':
      return 'spacecraft';
    case 'galaxy':
    case 'cluster':
    case 'nebula':
    case 'barycentre':
      return 'point';
    default:
      return 'planet';
  }
}

/** The texture files a body's visuals use (for pinning). */
function textureFiles(r: BodyRecord | undefined): string[] {
  const v = r?.visual;
  if (!v) return [];
  const out = [v.map, v.night, v.clouds].filter((f): f is string => !!f);
  if (v.rings?.kind === 'texture') out.push(v.rings.texture);
  return out;
}

// ─── Planets, moons and small bodies ─────────────────────────────────────────────────────

export function Planet({ id }: { id: BodyId }) {
  const group = useRef<Group>(null!);
  const mesh = useRef<Mesh>(null!);
  const rec = getBody(id)!;
  const vis = rec.visual ?? {};
  const material = useMemo(
    () =>
      createPlanetMaterial({
        baseColor: new Color(rec.physical.colour),
        banded: vis.banded,
        atmoColor: vis.atmo ? new Color(vis.atmo) : undefined,
        atmoStrength: vis.atmoStrength,
        lonOffset: vis.lonOffset,
        fillBlack: vis.fillBlack,
        mapTint: vis.mapTint ? new Color(vis.mapTint) : undefined,
        mapMix: vis.mapMix,
        // A shape model with no map: its own relief shades it (procedural noise would pinch at its
        // poles); a body no image shows (a planet of another star) is its plain colour.
        flat: vis.flat || (!vis.map && !!vis.shape),
        // Lit by its own star, in that star's colour (the Sun's otherwise).
        lightColor: rec.litBy ? lightColour(rec.litBy) : undefined,
      }),
    [rec],
  );
  useEffect(() => () => material.dispose(), [material]);
  const requested = useRef(false);
  const hold = useHeldTextures();
  const shape = useRef<BufferGeometry | null>(null);
  const extent = extentFactor(rec);

  useEffect(() => {
    if (!vis.shape) return;
    let live = true;
    loadShape(vis.shape).then((s) => {
      if (live && s) shape.current = s.geometry;
    });
    return () => {
      live = false;
    };
  }, [vis.shape]);

  useFrame(() => {
    const b = sim.bodies[id];
    if (!b) return;
    // The group (body and rings) while either is a pixel wide; the body itself only while it is.
    const visible = b.present && b.radiusPx * extent >= MESH_MIN_PX;
    group.current.visible = visible;
    if (!visible) return;
    mesh.current.visible = b.radiusPx >= MESH_MIN_PX;
    // Floating origin: float64 world position minus float64 camera position.
    group.current.position.copy(b.apparentPos).sub(sim.camera.pos);
    group.current.quaternion.copy(b.apparentQuat);
    const p = rec.physical;
    const eq = displayRadiusKm(rec);
    const k = b.displayRadius / eq;
    const m = mesh.current;
    const geometry = shape.current ?? (b.radiusPx < LOD_PX ? SPHERE_LO : SPHERE_HI);
    if (m.geometry !== geometry) m.geometry = geometry;
    if (shape.current) m.scale.setScalar(k);
    else if (p.triaxialRadiiKm) m.scale.set(p.triaxialRadiiKm[0] * k, p.triaxialRadiiKm[2] * k, p.triaxialRadiiKm[1] * k);
    else m.scale.set(eq * k, (p.polarRadiusKm ?? eq) * k, eq * k);
    lightRelative(rec, material.uniforms.uSunRel.value);

    if (!requested.current && wantsTextures(id)) {
      requested.current = true;
      const u = material.uniforms;
      const assign = (file: string | undefined, tex: string, flag: string, opts: TextureOptions = {}) => {
        if (!file) return;
        hold(file, opts).then((t) => {
          if (!t) return;
          u[tex].value = t;
          u[flag].value = 1;
          if (tex === 'uMap') u.uMapGrey.value = opts.grey ? 1 : 0;
        });
      };
      assign(vis.map, 'uMap', 'uHasMap', { grey: vis.mapChannels === 1 });
      assign(vis.night, 'uNight', 'uHasNight');
      assign(vis.clouds, 'uClouds', 'uHasClouds', { color: false });
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={mesh} geometry={SPHERE_LO} material={material} />
      {vis.rings && <Rings id={id} spec={vis.rings} planetMaterial={material} />}
    </group>
  );
}

function ringGeometry(inner: number, outer: number, segments: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Slightly oversized outer rim so the (curved) outer edge is covered by the flat segments.
    pos.push(inner * c, 0, inner * s, outer * 1.001 * c, 0, outer * 1.001 * s);
    if (i < segments) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const ICRF_NORTH = eqjToWorld(0, 0, 1);
const arcNode = new Vector3();
const arcQ = new Quaternion();
const arcRot = new Quaternion();

/**
 * Where the arcs' longitude origin is, in the ring mesh's own frame (the shader measures
 * longitudes there). The origin turns about the ring's pole at the arcs' mean motion from the
 * ascending node of the ring plane on the ICRF equator, which does not turn with the planet.
 */
function placeArcs(arcs: RingArcs, normal: Vector3, ring: Mesh, bodyQuat: Quaternion, u: ShaderMaterial['uniforms']): void {
  arcNode.crossVectors(ICRF_NORTH, normal);
  if (arcNode.lengthSq() < 1e-12) arcNode.set(1, 0, 0);
  arcNode.normalize();
  const deg = arcs.phaseDeg + ((sim.astroTime.tt * arcs.meanMotionDegPerDay) % 360);
  arcNode.applyQuaternion(arcRot.setFromAxisAngle(normal, (deg * Math.PI) / 180));
  // World → mesh: the body's orientation, then the ring's own within it.
  arcQ.copy(bodyQuat).multiply(ring.quaternion).invert();
  arcNode.applyQuaternion(arcQ);
  u.uArcOrigin.value = Math.atan2(-arcNode.z, arcNode.x);
}

/**
 * A ring system: Saturn's photographic strip, or bands (rings.json) drawn into a strip, with
 * Neptune's arcs on top. The ring plane is the body's equator unless the spec gives a pole. The
 * rings can shade the body.
 */
function Rings({ id, spec, planetMaterial }: { id: BodyId; spec: RingSpec; planetMaterial: ShaderMaterial }) {
  const mesh = useRef<Mesh>(null!);
  const material = useMemo(createRingMaterial, []);
  const { inner, outer, strip } = useMemo(() => {
    if (spec.kind === 'texture') return { inner: spec.innerKm, outer: spec.outerKm, strip: null as DataTexture | null };
    const ext = bandsExtent(spec.bands);
    return { inner: ext.innerKm, outer: ext.outerKm, strip: bandsTexture(spec.bands, ext.innerKm, ext.outerKm) };
  }, [spec]);
  const geometry = useMemo(() => ringGeometry(inner, outer, 256), [inner, outer]);
  const pole = useMemo(() => (spec.kind === 'bands' && spec.pole ? raDecToWorld(spec.pole.raDeg, spec.pole.decDeg) : null), [spec]);
  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
      strip?.dispose();
    },
    [material, geometry, strip],
  );
  const requested = useRef(false);
  const hold = useHeldTextures();
  const eq = displayRadiusKm(getBody(id)!);
  const arcs = spec.kind === 'bands' ? spec.arcs : undefined;
  useEffect(() => {
    const u = material.uniforms;
    u.uArcCount.value = arcs ? Math.min(8, arcs.spans.length) : 0;
    if (!arcs) return;
    arcs.spans.slice(0, 8).forEach(([a, b], i) => u.uArcSpans.value[i].set((a * Math.PI) / 180, (b * Math.PI) / 180));
    u.uArcInner.value = arcs.innerKm;
    u.uArcOuter.value = arcs.outerKm;
    u.uArcOpacity.value = arcs.opacity;
    u.uArcColor.value.set(arcs.colour);
  }, [arcs, material]);

  useFrame(() => {
    const b = sim.bodies[id];
    if (!b) return;
    const k = b.displayRadius / eq;
    mesh.current.scale.setScalar(k);
    mesh.current.visible = b.radiusPx * (outer / eq) >= MESH_MIN_PX;

    const u = material.uniforms;
    sunRelative(u.uSunRel.value);
    const center = tmp.copy(b.apparentPos).sub(sim.camera.pos);
    let normal: Vector3;
    if (pole) {
      // The mesh sits in the body's frame: turn a ring with a pole of its own back into it.
      qInv.copy(b.apparentQuat).invert();
      mesh.current.quaternion.setFromUnitVectors(UP, tmp2.copy(pole).applyQuaternion(qInv));
      normal = tmp2.copy(pole);
    } else normal = tmp2.set(0, 1, 0).applyQuaternion(b.apparentQuat);
    u.uCenterW.value.copy(center);
    u.uNormalW.value.copy(normal);
    u.uPlanetRadius.value = b.displayRadius;
    u.uInner.value = inner;
    u.uOuter.value = outer;
    if (arcs) placeArcs(arcs, normal, mesh.current, b.apparentQuat, u);

    // Ring shadow on the body (radii in displayed units).
    const shadow = spec.shadow === true;
    const p = planetMaterial.uniforms;
    if (shadow) {
      p.uCenterW.value.copy(center);
      p.uRingNormalW.value.copy(normal);
      p.uRingInner.value = inner * k;
      p.uRingOuter.value = outer * k;
    }

    if (!requested.current && wantsTextures(id)) {
      requested.current = true;
      const use = (t: typeof u.uMap.value) => {
        u.uMap.value = t;
        u.uHasMap.value = 1;
        if (shadow) {
          p.uRingMap.value = t;
          p.uRingShadow.value = 1;
        }
      };
      if (strip) use(strip);
      else if (spec.kind === 'texture')
        hold(spec.texture).then((t) => {
          if (t) use(t);
        });
    }
  });

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={5} />;
}

// ─── The Sun and other stars ─────────────────────────────────────────────────────────────

export function Sun() {
  const mesh = useRef<Mesh>(null!);
  const material = useMemo(createSunMaterial, []);
  const requested = useRef(false);
  const hold = useHeldTextures();
  const map = getBody('sun')?.visual?.map;
  useFrame(() => {
    const b = sim.bodies.sun;
    if (!b) return;
    const m = mesh.current;
    m.visible = b.radiusPx >= MESH_MIN_PX;
    if (!m.visible) return;
    m.position.copy(b.apparentPos).sub(sim.camera.pos);
    m.quaternion.copy(b.apparentQuat);
    m.scale.setScalar(b.displayRadius);
    const geometry = b.radiusPx < LOD_PX ? SPHERE_LO : SPHERE_HI;
    if (m.geometry !== geometry) m.geometry = geometry;
    // Simple auto-exposure: at its true radiance when small (the disc then averages a 5,772 K
    // surface, as the stars and the CMB assume), and dimmer up close so limb darkening and
    // granulation show.
    const t = Math.min(1, Math.max(0, (b.radiusPx - 30) / 170));
    material.uniforms.uIntensity.value = SUN_CENTRE_RADIANCE * (1 - 0.575 * t * t * (3 - 2 * t));
    if (map && !requested.current && wantsTextures('sun')) {
      requested.current = true;
      hold(map).then((tex) => {
        if (!tex) return;
        material.uniforms.uMap.value = tex;
        material.uniforms.uHasMap.value = 1;
      });
    }
  });
  return <mesh ref={mesh} geometry={SPHERE_LO} material={material} visible={false} />;
}

/** Shared round star meshes (aTemp = 1), never disposed. */
const STAR_SPHERE_HI = roundStarGeometry(128, 64);
const STAR_SPHERE_LO = roundStarGeometry(32, 16);
const qPole = new Quaternion();
const qSpin = new Quaternion();
const poleVec = new Vector3();

/** Numbers in [0, 1) from a string and a counter, the same every time (a star's spots and flares). */
function hash01(s: string, n: number): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A unit vector from two numbers in [0, 1), within ±maxLat of the equator (+Y the pole). */
function unitAt(u: number, v: number, maxLatRad = Math.PI / 2, out = new Vector3()): Vector3 {
  const lat = (2 * v - 1) * maxLatRad;
  const lon = 2 * Math.PI * u;
  return out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
}

/**
 * A star other than the Sun: its close-up (sim/stars/closeup.ts) drawn by the star-surface material: its shape
 * (a Roche surface for a fast rotator, its pole where interferometry puts it), limb darkening for its type,
 * gravity darkening, convection cells, starspots and flares. Cells fade out below a couple of pixels, so from
 * afar it is the plain limb-darkened disc it always was.
 */
export function StarBody({ id }: { id: BodyId }) {
  const mesh = useRef<Mesh>(null!);
  const rec = getBody(id);
  const teff = rec?.physical.luminous?.teffK ?? SUN_TEFF_K;
  const surface = rec?.starSurface;
  const material = useMemo(() => {
    const m = createStarSurfaceMaterial(new Color(...blackbodyRgb(teff)), teff);
    const u = m.uniforms;
    if (surface) {
      u.uTPole.value = teff * surface.poleTeffRatio;
      u.uLimbU.value.set(...surface.limbU);
      u.uGranFreq.value = Math.sqrt(surface.granules / (4 * Math.PI));
      // Granules finer than the baked map holds are left out (they would be under a pixel unless very close).
      u.uGranContrast.value = StarCells.holds(u.uGranFreq.value) ? surface.granuleContrast : 0;
      u.uGiantFreq.value = Math.sqrt(surface.giantCells / (4 * Math.PI));
      u.uGiantContrast.value = surface.giantContrast;
      const spots = surface.spots;
      if (spots) {
        u.uSpotCount.value = Math.min(6, spots.count);
        u.uSpotDT.value = spots.deltaTK;
        for (let i = 0; i < u.uSpotCount.value; i++) {
          const d = unitAt(hash01(id, 2 * i), hash01(id, 2 * i + 1), (60 * Math.PI) / 180);
          u.uSpots.value[i].set(d.x, d.y, d.z, spots.radiusRad * (0.6 + 0.8 * hash01(id, 100 + i)));
        }
      }
    }
    return m;
  }, [id, teff, surface]);
  // How much brighter than its mean surface its hottest part is at 550 nm (Planck): a fast rotator’s pole.
  const hottest = useMemo(() => {
    const t = teff * (surface?.poleTeffRatio ?? 1);
    const x = (T: number) => 14388 / (0.55 * T);
    return t > teff ? (Math.exp(x(teff)) - 1) / (Math.exp(x(t)) - 1) : 1;
  }, [teff, surface]);
  const shapes = useMemo(() => {
    const hi = surface ? starShapeGeometry(surface, 128, 64) : null;
    const lo = surface ? starShapeGeometry(surface, 48, 24) : null;
    return { hi: hi ?? STAR_SPHERE_HI, lo: lo ?? STAR_SPHERE_LO, own: !!hi };
  }, [surface]);
  // The baked convection cells (render/starCells.ts), made while the disc is large.
  const cells = useRef<StarCells | null>(null);
  useEffect(
    () => () => {
      cells.current?.dispose();
      cells.current = null;
      material.dispose();
      if (shapes.own) {
        shapes.hi.dispose();
        shapes.lo.dispose();
      }
    },
    [material, shapes],
  );
  useFrame(({ gl }) => {
    const b = sim.bodies[id];
    if (!b) return;
    const m = mesh.current;
    // Hidden while the lens draws it exactly (lens.spheres).
    m.visible = b.present && b.radiusPx >= MESH_MIN_PX && !(lens.spheres.length > 0 && lens.spheres.includes(id));
    if (!m.visible) return;
    m.position.copy(b.apparentPos).sub(sim.camera.pos);
    if (surface) {
      // +Y is the pole; a star with a rotation period turns about it on the simulation's clock.
      qPole.setFromUnitVectors(UP, poleVec.set(...surface.pole));
      const turn = surface.rotationDays > 0 ? ((sim.timeMs / 86_400_000 / surface.rotationDays) % 1) * 2 * Math.PI : 0;
      m.quaternion.copy(qPole).multiply(qSpin.setFromAxisAngle(UP, turn));
    } else m.quaternion.copy(b.apparentQuat);
    m.scale.setScalar(b.displayRadius);
    const geometry = b.radiusPx < LOD_PX ? shapes.lo : shapes.hi;
    if (m.geometry !== geometry) m.geometry = geometry;
    const u = material.uniforms;
    // Auto-exposure: at full radiance while small (the disc then averages the point's light), stopped down up close
    // so the surface's colour, limb darkening and cells show rather than burning out to white.
    const t = Math.min(1, Math.max(0, (b.radiusPx - 30) / 170));
    const k = t * t * (3 - 2 * t);
    // Up close, its hottest part (a fast rotator’s pole) at the same level as any other star’s centre.
    u.uIntensity.value = (6 - 5.2 * k) / Math.pow(hottest, 1.4 * k);
    // AgX tone mapping compresses a stop to a few per cent of the screen’s range: up close the disc’s contrast is
    // stretched to 2.4 stops a stop (the card says so), from afar it is exact.
    u.uContrast.value = 1 + 1.4 * k;
    if (!surface) return;
    // The surface's own clock: the wall clock sped up (closeup.ts surfaceSpeedup), in turnovers. Its cells are
    // baked while the disc is over 40 px (one cube face a frame), dropped below 20 px.
    const shownS = (performance.now() / 1000) * surface.speedup;
    const hasCells = u.uGranContrast.value > 0 || u.uGiantContrast.value > 0;
    if (hasCells && !cells.current && b.radiusPx > 40) cells.current = new StarCells(u.uGranFreq.value, u.uGiantFreq.value);
    else if (cells.current && b.radiusPx < 20) {
      cells.current.dispose();
      cells.current = null;
    }
    if (cells.current) {
      cells.current.update(gl, (shownS / surface.turnoverS) % 1000);
      u.uCells.value = cells.current.target.texture;
      u.uHasCells.value = cells.current.ready ? 1 : 0;
    } else u.uHasCells.value = 0;
    const flares = surface.flares;
    if (flares) {
      // One flare in each slot of a day's share; it rises in a twentieth of its length and decays over the rest.
      const slotS = 86_400 / flares.perDay;
      const slot = Math.floor(shownS / slotS);
      const start = (slot + 0.6 * hash01(id, 1000 + (slot % 100_000))) * slotS;
      const dt = shownS - start;
      const d = flares.durationS;
      const rise = 0.05 * d;
      const k = dt < 0 ? 0 : dt < rise ? dt / rise : Math.exp(-(dt - rise) / (0.25 * d));
      const dir = unitAt(hash01(id, 2000 + (slot % 100_000)), hash01(id, 3000 + (slot % 100_000)), (70 * Math.PI) / 180, poleVec);
      u.uFlare.value.set(dir.x, dir.y, dir.z, k > 0.01 ? k : 0);
    }
  });
  return <mesh ref={mesh} geometry={STAR_SPHERE_LO} material={material} visible={false} />;
}

// ─── Spacecraft ──────────────────────────────────────────────────────────────────────────

/** Radius of the probe model as built (Voyager's, km): it is scaled from this to each spacecraft's radius. */
export const PROBE_MODEL_RADIUS_KM = 0.00185;

/** Radius of each craft model as built (km): it is scaled from this to the spacecraft's radius. */
const CRAFT_RADIUS_KM = { probe: PROBE_MODEL_RADIUS_KM, jwst: 0.0106, parker: 0.00115 } as const;

type Craft = keyof typeof CRAFT_RADIUS_KM;

const flatMaterial = (hex: string, side = false) => {
  const m = createPlanetMaterial({ baseColor: new Color(hex), flat: true, ambient: 0.02 });
  if (side) m.side = DoubleSide;
  return m;
};

/** A flat polygon in the model's XZ plane (normal +Y), from (x, z) corners in km. */
function flatPolygon(points: [number, number][]): BufferGeometry {
  const shape = new Shape(points.map(([x, z]) => new Vector2(x, -z)));
  const g = new ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}

interface CraftPart {
  geometry: BufferGeometry;
  material: ShaderMaterial;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * The parts of each model, at true size in km, +Y the axis that is pointed:
 *  probe  Voyager: the 3.7 m high-gain antenna (at Earth), the ten-sided bus, the RTG and
 *         science booms, and the 13 m magnetometer boom
 *  jwst   Webb: the 21.2 × 14.2 m sunshield (at the Sun), the bus and solar array on the sunny
 *         side, and the 6.5 m gold primary mirror on the cold side, facing across the shield
 *  parker Parker Solar Probe: the 2.3 m heat shield (at the Sun), the bus and the solar arrays
 *         tucked in its shadow
 */
function craftParts(craft: Craft): CraftPart[] {
  if (craft === 'jwst') {
    const shield = flatPolygon([
      [0, 0.0106],
      [0.0071, 0.0042],
      [0.0071, -0.0042],
      [0, -0.0106],
      [-0.0071, -0.0042],
      [-0.0071, 0.0042],
    ]);
    const box = new BoxGeometry(1, 1, 1);
    const mirror = new CircleGeometry(0.00325, 6);
    const strut = new CylinderGeometry(0.00003, 0.00003, 1, 5);
    const gold = flatMaterial('#d9b44a', true);
    const shieldMat = flatMaterial('#c7b9d6', true);
    const grey = flatMaterial('#8d8a86');
    const panel = flatMaterial('#2c3550', true);
    return [
      // Five layers, drawn as two: the one facing the Sun and the one facing the telescope.
      { geometry: shield, material: shieldMat, position: [0, 0.0004, 0] },
      { geometry: shield, material: shieldMat, position: [0, 0, 0] },
      { geometry: box, material: grey, position: [0, 0.0011, 0], scale: [0.0022, 0.0012, 0.0022] },
      { geometry: box, material: panel, position: [0, 0.0017, 0.0035], scale: [0.0025, 0.00004, 0.0052] },
      // The telescope: primary mirror standing on the cold side, its secondary on struts.
      { geometry: mirror, material: gold, position: [0, -0.0042, -0.0012], rotation: [0.1, 0, Math.PI / 6] },
      { geometry: strut, material: grey, position: [0, -0.0045, 0.0022], rotation: [Math.PI / 2 + 0.25, 0, 0], scale: [1, 0.0072, 1] },
      { geometry: new CircleGeometry(0.00037, 16), material: gold, position: [0, -0.0053, 0.0056], rotation: [Math.PI, 0, 0] },
    ];
  }
  if (craft === 'parker') {
    const white = flatMaterial('#f2f2f2');
    const grey = flatMaterial('#9a9a9a');
    const panel = flatMaterial('#2c3550', true);
    return [
      { geometry: new CylinderGeometry(0.00115, 0.00115, 0.000114, 48), material: white, position: [0, 0.0008, 0] },
      { geometry: new CylinderGeometry(0.0005, 0.0005, 0.001, 6), material: grey, position: [0, -0.0001, 0] },
      { geometry: new BoxGeometry(1, 1, 1), material: panel, position: [0.0009, -0.0002, 0], rotation: [0, 0, -0.35], scale: [0.0007, 0.00003, 0.0006] },
      { geometry: new BoxGeometry(1, 1, 1), material: panel, position: [-0.0009, -0.0002, 0], rotation: [0, 0, 0.35], scale: [0.0007, 0.00003, 0.0006] },
      { geometry: new CylinderGeometry(0.00003, 0.00003, 0.0014, 5), material: grey, position: [0, -0.0012, 0] },
    ];
  }
  const dish = new LatheGeometry(
    Array.from({ length: 12 }, (_, i) => {
      const r = (i / 11) * 0.00183;
      return new Vector2(r, (r * r) / (4 * 0.0012));
    }),
    48,
  );
  const dishMat = flatMaterial('#e9e6df', true);
  const bus = new CylinderGeometry(0.00089, 0.00089, 0.00047, 10);
  const busMat = flatMaterial('#9b8f7a');
  const boom = new CylinderGeometry(0.00004, 0.00004, 1, 6);
  const boomMat = flatMaterial('#b9b4aa');
  const rtg = new CylinderGeometry(0.0002, 0.0002, 0.0005, 12);
  const rtgMat = flatMaterial('#5f5a52');
  return [
    { geometry: dish, material: dishMat },
    { geometry: bus, material: busMat, position: [0, -0.0003, 0] },
    // RTG boom with three generators
    { geometry: boom, material: boomMat, position: [-0.0019, -0.0004, 0], rotation: [0, 0, Math.PI / 2], scale: [1, 0.0026, 1] },
    ...[0.0012, 0.0019, 0.0026].map((x): CraftPart => ({ geometry: rtg, material: rtgMat, position: [-x - 0.0006, -0.0004, 0], rotation: [0, 0, Math.PI / 2] })),
    // Science boom
    { geometry: boom, material: boomMat, position: [0.00165, -0.0004, 0], rotation: [0, 0, Math.PI / 2], scale: [1, 0.0023, 1] },
    { geometry: bus, material: busMat, position: [0.0029, -0.0004, 0], scale: [0.35, 1.2, 0.35] },
    // Magnetometer boom, 13 m
    { geometry: boom, material: boomMat, position: [0, -0.0004, 0.0066], rotation: [Math.PI / 2, 0, 0], scale: [0.6, 0.013, 0.6] },
  ];
}

/**
 * A spacecraft at true size (metres, in km units), scaled to the body's radius: Voyager's shape
 * for the probes, with the high-gain antenna always pointed at Earth; Webb and Parker Solar Probe
 * with their shields towards the Sun. Their attitudes are not modelled beyond that (the card
 * says so). Simplified geometry.
 */
export function Spacecraft({ id }: { id: BodyId }) {
  const group = useRef<Group>(null!);
  const craft: Craft = getBody(id)?.visual?.craft ?? 'probe';
  const parts = useMemo(() => craftParts(craft), [craft]);
  const materials = useMemo(() => [...new Set(parts.map((p) => p.material))], [parts]);
  useEffect(
    () => () => {
      for (const g of new Set(parts.map((p) => p.geometry))) g.dispose();
      for (const m of materials) m.dispose();
    },
    [parts, materials],
  );

  useFrame(() => {
    const b = sim.bodies[id];
    // The dish points at Earth; Webb's sunshield and Parker's heat shield at the Sun.
    const target = craft === 'probe' ? sim.bodies.earth : sim.bodies.sun;
    if (!b) return;
    const g = group.current;
    g.visible = b.present && b.radiusPx >= MESH_MIN_PX;
    if (!g.visible) return;
    g.position.copy(b.apparentPos).sub(sim.camera.pos);
    if (target) {
      tmp.copy(target.pos).sub(b.apparentPos).normalize();
      g.quaternion.setFromUnitVectors(tmp2.set(0, 1, 0), tmp);
    }
    // The model is built at its craft's size: scale it to this craft's (displayed) radius.
    g.scale.setScalar(b.displayRadius / CRAFT_RADIUS_KM[craft]);
    for (const mat of materials) sunRelative(mat.uniforms.uSunRel.value);
  });

  return (
    <group ref={group} visible={false}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} position={p.position} rotation={p.rotation} scale={p.scale} />
      ))}
    </group>
  );
}

// ─── Shader programs kept compiled ───────────────────────────────────────────────────────

/**
 * One material of each body shader (and the orbit lines'), drawn once (invisibly: a speck at
 * the camera, inside the near plane) and never disposed. three.js frees a shader program when
 * the last material using it is disposed, so without these, zooming out until every planet has
 * unmounted would recompile the planet shader on the way back in (6 ms warm, 80 ms cold), and
 * leaving the relativistic view would recompile the orbit lines'. Drawing them once in the real
 * render gives them exactly the programs the bodies and lines use.
 */
function ShaderKeeper() {
  const materials = useMemo(
    () => [createPlanetMaterial({ baseColor: new Color('#808080') }), createRingMaterial(), createSunMaterial(), createStarSurfaceMaterial(), createOrbitMaterial(new Color('#808080'))],
    [],
  );
  return (
    <>
      {materials.map((m, i) => (
        <mesh
          key={i}
          geometry={SPHERE_LO}
          material={m}
          frustumCulled={false}
          scale={1e-9}
          ref={(o) => {
            if (o)
              o.onAfterRender = () => {
                o.visible = false;
              };
          }}
        />
      ))}
    </>
  );
}

// ─── Which bodies have meshes ────────────────────────────────────────────────────────────

function BodyMesh({ id }: { id: BodyId }) {
  const rec = getBody(id);
  if (!rec) return null;
  switch (rendererOf(rec)) {
    case 'star':
      return <StarBody id={id} />;
    case 'spacecraft':
      return <Spacecraft id={id} />;
    case 'planet':
      return <Planet id={id} />;
    default:
      return null;
  }
}

/**
 * Decides, each frame, which bodies have mesh components: those about a pixel wide or more,
 * with a couple of seconds' grace before a shrinking body loses its mesh. Only a change of that
 * set re-renders anything.
 */
export function Bodies() {
  const version = useSyncExternalStore(subscribeRegistry, registryVersion);
  const [mounted, setMounted] = useState<readonly BodyId[]>([]);
  const live = useRef({ set: new Set<BodyId>(), small: new Map<BodyId, number>(), focus: '', version: -1 });

  useFrame(({ gl }) => {
    // One texture upload a frame (render/textures.ts).
    pumpTextureUploads(gl);
    const st = live.current;
    let changed = false;
    const list = bodyEntries();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.id === 'sun') continue;
      const b = e.state;
      const has = st.set.has(e.id);
      // A ringed body counts as wide as its rings.
      const px = b.radiusPx * extentFactor(e.record);
      if (b.present && px >= MOUNT_PX) {
        if (!has) {
          const how = rendererOf(e.record);
          // A black hole has no mesh: its lens draws it.
          if (how === 'point' || how === 'layer' || how === 'lens') continue;
          st.set.add(e.id);
          changed = true;
        }
        st.small.delete(e.id);
      } else if (has) {
        const n = b.present && px >= UNMOUNT_PX ? 0 : (st.small.get(e.id) ?? 0) + 1;
        if (n > UNMOUNT_FRAMES || !b.present) {
          st.set.delete(e.id);
          st.small.delete(e.id);
          changed = true;
        } else st.small.set(e.id, n);
      }
    }
    // Bodies that left the registry.
    if (st.version !== version) {
      for (const id of st.set) {
        if (!sim.bodies[id]) {
          st.set.delete(id);
          changed = true;
        }
      }
    }
    if (changed) setMounted([...st.set]);

    // Pin the textures of the Sun, Earth and the system in focus.
    const focus = useUI.getState().focus;
    if (focus !== st.focus || version !== st.version) {
      st.focus = focus;
      st.version = version;
      const system = systemOf(focus)?.id;
      const files = [...textureFiles(getBody('sun')), ...textureFiles(getBody('earth'))];
      if (system && system !== 'sun') for (const r of bodyRecords()) if (isWithin(r.id, system)) files.push(...textureFiles(r));
      setPinnedTextures(files);
    }
  });

  return (
    <>
      <ShaderKeeper />
      <Sun />
      {mounted.map((id) => (
        // A record registered again (new data for the body) remounts its mesh.
        <BodyMesh key={`${id}:${recordSerial(id)}`} id={id} />
      ))}
    </>
  );
}
