import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PlaneGeometry, Vector3, type Mesh, type PerspectiveCamera, type ShaderMaterial } from 'three';
import { createGalaxyPictureMaterial, psfUniforms } from '../render/materials';
import { GALAXY_LAYER, galaxyLayer } from '../render/galaxyLayer';
import { lensDrawn } from '../render/lensVariants';
import { acquireTexture, releaseTexture } from '../render/textures';
import { KPC_KM } from '../physics/constants';
import { bvToTemperature } from '../physics/blackbody';
import { psfSolidAngle } from '../sim/galaxy/background';
import { cosmosState, cosmosVersion, subscribeCosmos } from '../sim/cosmos/load';
import { cosmicSky } from '../sim/cosmos/expansion';
import { dustTransmission, pictureWeights, picturePlane, planeArea, planeHalfWidth, type GalaxyPicture, type PicturePlane } from '../sim/cosmos/pictures';
import { typicalBV, type GalaxyShape } from '../sim/cosmos/records';
import type { Vec3 } from '../sim/cosmos/frames';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { reportShownPictures } from './Nebulae';

/** Grid of the picture: enough for aberration to bend one that fills the view. */
const GRID = 8;
/** A picture is let go this long after it was last wanted (ms). */
const RELEASE_MS = 8000;
const M_V_SUN = 4.83;

/**
 * The share of each galaxy's light drawn by a picture this frame (scene/Galaxies.tsx draws the rest with the model),
 * by body id: the picture's main galaxy and the galaxies it holds (Andromeda's picture holds M32 and M110).
 */
export const pictureShares = new Map<string, number>();

/** The pictures mounted now, for the development handle (window.__ls.pictures); `enabled` false draws none (to time them). */
export const galaxyPictures = { slots: [] as readonly Slot[], enabled: true };

interface Slot {
  pic: GalaxyPicture;
  shape: GalaxyShape;
  mesh: Mesh | null;
  material: ShaderMaterial;
  /** Where it lies relative to its galaxy (world axes, kpc). */
  /** Null until the galaxy has been placed (its first frame). */
  plane: PicturePlane | null;
  halfWidthKpc: number;
  areaKpc2: number;
  /** The share of the model's light its dust lets through towards the Sun (null until the templates are in). */
  transmission: number | null;
  held: boolean;
  loaded: boolean;
  wantedAt: number;
}

const cam = new Vector3();
const forward = new Vector3();

/**
 * The famous galaxies' photographs (sim/cosmos/pictures.ts), each laid on its galaxy's plane as we see it and drawn
 * into the Galaxy layer with the galaxies' particles, holding a share of its galaxy's measured light: all of it seen
 * from near our line of sight, none of it 20° away or close enough for its pixels to show, where the model
 * (scene/Galaxies.tsx) draws it instead; the two add up to the galaxy's light, so nothing jumps. Each picture loads
 * when it is first wanted and goes again 8 s after. Not drawn while a black hole's lens is (the model is, and is
 * lensed); in flight each is aberrated and Doppler shifted as the particles are.
 */
export function GalaxyPictures() {
  const version = useSyncExternalStore(subscribeCosmos, cosmosVersion);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const geometry = useMemo(() => new PlaneGeometry(1, 1, GRID, GRID), []);
  const doc = cosmosState.pictures;
  const shapes = cosmosState.shapes;
  const slots = useMemo<Slot[]>(() => {
    if (!doc || !shapes.length) return [];
    const byId = new Map(shapes.map((s) => [s.id, s]));
    const out: Slot[] = [];
    for (const pic of doc.pictures) {
      const shape = byId.get(pic.id);
      if (!shape || !sim.bodies[pic.id]) continue;
      out.push({
        pic,
        shape,
        mesh: null,
        material: createGalaxyPictureMaterial(),
        plane: null,
        halfWidthKpc: 0,
        areaKpc2: 0,
        transmission: null,
        held: false,
        loaded: false,
        wantedAt: 0,
      });
    }
    return out;
    // `version` stands for the bodies' arrival.
  }, [doc, shapes, version]);
  useEffect(() => {
    galaxyPictures.slots = slots;
  }, [slots]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      for (const s of slots) {
        s.material.dispose();
        if (s.held) releaseTexture(s.pic.image);
      }
      pictureShares.clear();
    },
    [slots],
  );

  useFrame(({ gl }) => {
    pictureShares.clear();
    galaxyLayer.wants.pictures = false;
    if (!slots.length) return;
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const pxPerRad = sim.viewport.height / 2 / tanHalf;
    const cssPixel = 1 / pxPerRad;
    const m0 = psfUniforms.uMagZero.value;
    const perSurface = psfSolidAngle(cssPixel) * 10 ** (0.4 * m0);
    cam.copy(sim.camera.pos);
    camera.getWorldDirection(forward);
    const viewHalfDiagonal = Math.atan(tanHalf * Math.hypot(1, sim.viewport.width / Math.max(1, sim.viewport.height)));
    const lensOn = lensDrawn();
    const selected = useUI.getState().selected;
    const now = performance.now();
    const templates = cosmosState.templates;
    const credits: { id: string; px: number }[] = [];
    let any = false;
    for (const s of slots) {
      const { pic, shape } = s;
      const b = sim.bodies[pic.id];
      const ln1pz = cosmicSky.byId.get(pic.id)?.ln1pz ?? 0;
      let w = 0;
      let halfPx = 0;
      const rel: Vec3 = [0, 0, 0];
      if (!s.plane && b && b.pos.lengthSq() > 0) {
        // Where it lies, from the galaxy's place seen from the Sun (its direction does not change).
        const g: Vec3 = [b.pos.x / KPC_KM, b.pos.y / KPC_KM, b.pos.z / KPC_KM];
        const disc = shape.template !== 'elliptical' && shape.template !== 'irregular' && shape.template !== 'spheroidal' ? shape.normal : null;
        s.plane = picturePlane(pic, g, disc);
        s.halfWidthKpc = planeHalfWidth(s.plane);
        s.areaKpc2 = planeArea(s.plane);
      }
      if (s.plane && b?.present && ln1pz !== Infinity && !lensOn && galaxyPictures.enabled) {
        rel[0] = (b.apparentPos.x - cam.x) / KPC_KM;
        rel[1] = (b.apparentPos.y - cam.y) / KPC_KM;
        rel[2] = (b.apparentPos.z - cam.z) / KPC_KM;
        const fromSun: Vec3 = [b.apparentPos.x / KPC_KM, b.apparentPos.y / KPC_KM, b.apparentPos.z / KPC_KM];
        const v = pictureWeights({ fromSun, fromCamera: rel, halfWidth: s.halfWidthKpc, pixelsAcross: pic.pixels[0], pxPerRad });
        w = v.weight;
        const d = Math.hypot(...rel);
        halfPx = d > s.halfWidthKpc ? (s.halfWidthKpc / d) * pxPerRad : Infinity;
      }
      // Wanted (loaded) while it would be drawn in the view, or its galaxy is selected.
      const d = Math.hypot(rel[0], rel[1], rel[2]);
      const ahead = d > 0 ? (forward.x * rel[0] + forward.y * rel[1] + forward.z * rel[2]) / d : 1;
      const inView = Math.acos(Math.min(1, Math.max(-1, ahead))) < viewHalfDiagonal + Math.atan2(s.halfWidthKpc, d);
      if ((w > 0 && inView) || selected === pic.id) s.wantedAt = now;
      if (s.wantedAt === now && !s.held) {
        s.held = true;
        void acquireTexture(pic.image).then((t) => {
          if (!s.held) return;
          s.material.uniforms.uMap.value = t;
          s.loaded = !!t;
        });
      } else if (s.held && now - s.wantedAt > RELEASE_MS) {
        s.held = false;
        s.loaded = false;
        s.material.uniforms.uMap.value = null;
        releaseTexture(pic.image);
      }
      // The model's dust as seen from the Sun, once its template is in (so the two are equally bright where they meet).
      if (s.transmission === null && templates) {
        const t = templates.find((x) => x.id === shape.template && x.detail === 1);
        const g = sim.bodies[pic.id]?.pos;
        if (t && g) {
          const len = g.length();
          s.transmission = dustTransmission(t.position, (i) => t.attrs[4 * i], t.count, shape.axes, shape.scaleKpc, shape.normal, shape.dust, [g.x / len, g.y / len, g.z / len]);
        }
      }
      const visible = s.loaded && w > 0 && s.transmission !== null;
      if (s.mesh) s.mesh.visible = visible;
      if (!visible) continue;
      pictureShares.set(pic.id, w);
      for (const id of pic.includes) pictureShares.set(id, w);
      const gain = cosmicSky.retarded && ln1pz > 0 ? Math.exp(-2 * ln1pz) : 1;
      // Its light: the galaxy's V luminosity (less the model's dust towards us), its share w, spread over the
      // picture's plane as the map's luminance is (mean meanLight), as a surface brightness in the layer's unit.
      const lum = shape.lumV * s.transmission! * gain * w;
      const fluxAt1Kpc = 10 ** (-0.4 * (M_V_SUN - 2.5 * Math.log10(lum) + 10));
      const u = s.material.uniforms;
      u.uSurface.value = (fluxAt1Kpc * perSurface) / (pic.meanLight * s.areaKpc2);
      const pl = s.plane!;
      u.uRel.value.set(rel[0], rel[1], rel[2]);
      u.uSky.value.set(pl.sky[0], pl.sky[1], pl.sky[2]);
      u.uRight.value.set(pl.right[0], pl.right[1], pl.right[2]);
      u.uUp.value.set(pl.up[0], pl.up[1], pl.up[2]);
      u.uNormal.value.set(pl.normal[0], pl.normal[1], pl.normal[2]);
      u.uLos.value.set(pl.los[0], pl.los[1], pl.los[2]);
      u.uDist.value = pl.dist;
      u.uLnT.value = Math.log(bvToTemperature(typicalBV(shape.template)));
      u.uLn1pz.value = ln1pz;
      any = true;
      // Every picture drawn in the view carries its credit.
      if (inView) credits.push({ id: pic.id, px: halfPx });
    }
    reportShownPictures('galaxies', credits);
    galaxyLayer.wants.pictures = any;
    if (any) galaxyLayer.display(tanHalf, sim.viewport.height, gl.getPixelRatio());
  });

  return (
    <>
      {slots.map((s) => (
        <mesh
          key={s.pic.id}
          geometry={geometry}
          material={s.material}
          frustumCulled={false}
          visible={false}
          ref={(o) => {
            s.mesh = o;
            o?.layers.set(GALAXY_LAYER);
          }}
        />
      ))}
    </>
  );
}
