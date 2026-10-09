/**
 * The famous galaxies' photographs (src/sim/cosmos/pictures.json and public/images/galaxies/<id>.jpg, built by
 * scripts/build-galaxy-pictures.py; docs/data/cosmos.md, "Pictures of the galaxies"): the file's types, where a
 * picture lies in space, and how much of a galaxy's light it draws (scene/GalaxyPictures.tsx).
 *
 * A photograph is the galaxy as seen from the Solar System. It is laid on the galaxy's own plane as we see it: each
 * point of the picture goes where our line of sight through it meets the disc, so that from Earth the picture covers
 * the sky exactly as the photograph does, and from nearby (a few degrees off our line of sight) the disc is seen
 * foreshortened as the model's is. A disc seen nearly edge-on, an elliptical or an irregular has no plane to lay it
 * on that would help: its picture is a card across our line of sight. Away from our line of sight a photograph is
 * wrong (it would show the far side of a galaxy we cannot see), and close in its pixels show: there it gives way to
 * the particle model (scene/Galaxies.tsx), its light handed over so that the sum stays the galaxy's light.
 */
import type { DeepSkyImage } from '../bodies/types';
import { add, cross, dot, eclToWorld, ICRS_TO_ECL, apply, norm, scale, skyBasis, type Vec3 } from './frames';

export interface GalaxyPicture {
  /** The body it shows (its main galaxy). */
  id: string;
  /** Bodies whose light is in the picture besides the main one (M32 and M110 in Andromeda's): their model fades with it. */
  includes: string[];
  /** Path from public/ ("images/galaxies/m51.jpg"). */
  image: string;
  /** Centre of the shipped image (after its crop), ICRS degrees. */
  centerRaDeg: number;
  centerDecDeg: number;
  widthArcmin: number;
  heightArcmin: number;
  /** North on the image is this many degrees counterclockwise from image-up (east 90° counterclockwise from north). */
  northAngleDeg: number;
  pixels: [number, number];
  /** Mean linear luminance of the shipped image (its light map, sampled as the GPU samples it), 0–1. */
  meanLight: number;
  bytes: number;
  imageSource: { archive: string; id: string; title: string; page: string; file: string; band: string; cropped: boolean };
  credit: string;
  licence: string;
  licenceUrl: string;
  modificationNote: string;
}

export interface PicturesDoc {
  schema: 'lightspeed.galaxy-pictures/1';
  note: string;
  imageProcessing: string;
  pictures: GalaxyPicture[];
}

/** Each picture's card entry (sim/bodies DeepSkyImage), by body id. */
export function pictureImages(doc: PicturesDoc): Map<string, DeepSkyImage> {
  return new Map(
    doc.pictures.map((p) => [
      p.id,
      {
        file: p.image,
        credit: p.credit,
        modificationNote: p.modificationNote,
        page: p.imageSource.page,
        source: `${p.imageSource.archive} ${p.imageSource.id}`,
        licence: p.licence,
        licenceUrl: p.licenceUrl,
        band: p.imageSource.band,
      },
    ]),
  );
}

// ─── Where a picture lies ───────────────────────────────────────────────────────────────────

/**
 * Where a picture lies, relative to its galaxy's centre (world axes, in the unit of the galaxy's distance): the
 * photograph's sky rectangle on the tangent plane at the galaxy's distance (its centre `sky` and half-sides `right`
 * and `up`), the plane it is laid on (`normal`) and our line of sight to the galaxy (`los`, unit; `dist` its length).
 * Each point of the rectangle goes where the line of sight from the Sun through it meets the plane (picturePoint).
 */
export interface PicturePlane {
  sky: Vec3;
  right: Vec3;
  up: Vec3;
  normal: Vec3;
  los: Vec3;
  dist: number;
  /** Laid on the galaxy's disc (false: a card across our line of sight). */
  onDisc: boolean;
}

/** A disc tilted more than this from face-on (deg) has its picture as a card across our line of sight instead. */
export const MAX_DISC_TILT_DEG = 70;

/**
 * The picture's sky-plane half-sides at its centre, world axes, unit length per radian of sky: image-right and image-up.
 * North is northAngleDeg counterclockwise from image-up and east 90° counterclockwise from north (the sky as seen from
 * inside, not mirrored): image-up is at position angle −northAngle (east of north), image-right 90° clockwise of it,
 * towards the west.
 */
export function skyHalfSides(p: Pick<GalaxyPicture, 'centerRaDeg' | 'centerDecDeg' | 'widthArcmin' | 'heightArcmin' | 'northAngleDeg'>): { r: Vec3; right: Vec3; up: Vec3 } {
  const { r, e, n } = skyBasis(p.centerRaDeg, p.centerDecDeg);
  const a = (-p.northAngleDeg * Math.PI) / 180;
  const upIcrs = add(scale(n, Math.cos(a)), scale(e, Math.sin(a)));
  const rightIcrs = add(scale(n, Math.cos(a - Math.PI / 2)), scale(e, Math.sin(a - Math.PI / 2)));
  const w = (p.widthArcmin / 2) * (Math.PI / 10800);
  const h = (p.heightArcmin / 2) * (Math.PI / 10800);
  const toWorld = (v: Vec3): Vec3 => eclToWorld(apply(ICRS_TO_ECL, v));
  return { r: toWorld(r), right: scale(toWorld(rightIcrs), w), up: scale(toWorld(upIcrs), h) };
}

/**
 * The plane a picture is laid on, for a galaxy whose centre is `galaxy` (world axes, any length unit, the Sun at the
 * origin) with disc normal `discNormal` (world, unit; null for a galaxy without a disc): its disc, unless it is
 * tilted more than MAX_DISC_TILT_DEG, when the picture is a card across our line of sight.
 */
export function picturePlane(
  p: Pick<GalaxyPicture, 'centerRaDeg' | 'centerDecDeg' | 'widthArcmin' | 'heightArcmin' | 'northAngleDeg'>,
  galaxy: Readonly<Vec3>,
  discNormal: Readonly<Vec3> | null,
): PicturePlane {
  const dist = norm(galaxy as Vec3);
  const los = scale(galaxy as Vec3, 1 / dist);
  const sky = skyHalfSides(p);
  const cosTilt = discNormal ? Math.abs(dot(discNormal as Vec3, los)) : 1;
  const onDisc = !!discNormal && cosTilt >= Math.cos((MAX_DISC_TILT_DEG * Math.PI) / 180);
  return {
    sky: add(scale(sky.r, dist), scale(los, -dist)),
    right: scale(sky.right, dist),
    up: scale(sky.up, dist),
    normal: onDisc ? [...(discNormal as Vec3)] : los,
    los,
    dist,
    onDisc,
  };
}

/**
 * The point of the picture at image coordinates (x, y) ∈ [−1, 1]² (right, up), relative to the galaxy's centre: where
 * the line of sight from the Sun through its place on the sky meets the plane through the centre. With s its place on
 * the sky relative to the centre and r, d, n as in PicturePlane, the point is k (s − r (s·n)/(r·n)) with
 * k = 1 / (1 + (s·n) / (d r·n)), in small numbers only (no |G| − |G| cancels). Twin: shaders/galaxyPicture.vert.glsl.
 */
export function picturePoint(pl: PicturePlane, x: number, y: number): Vec3 {
  const s = add(pl.sky, add(scale(pl.right, x), scale(pl.up, y)));
  const sn = dot(s, pl.normal);
  const rn = dot(pl.los, pl.normal);
  const k = 1 / (1 + sn / (pl.dist * rn));
  return scale(add(s, scale(pl.los, -sn / rn)), k);
}

/** The picture's area on its plane (in the square of its unit): its corners' quadrilateral. */
export function planeArea(pl: PicturePlane): number {
  const a = picturePoint(pl, -1, -1);
  const b = picturePoint(pl, 1, -1);
  const c = picturePoint(pl, 1, 1);
  const d = picturePoint(pl, -1, 1);
  const sub = (u: Vec3, v: Vec3): Vec3 => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  return 0.5 * norm(cross(sub(c, a), sub(d, b)));
}

/** Half its width on its plane, from its left edge to its right through the middle. */
export function planeHalfWidth(pl: PicturePlane): number {
  const l = picturePoint(pl, -1, 0);
  const r = picturePoint(pl, 1, 0);
  return 0.5 * Math.hypot(r[0] - l[0], r[1] - l[1], r[2] - l[2]);
}

// ─── How much of the light it draws ────────────────────────────────────────────────────────

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The picture's share of its galaxy's light, 0–1 (the model draws the rest):
 *  - by the angle between our line of sight to the galaxy and the camera's (both from the galaxy): all of it within
 *    ANGLE_DEG[0], none beyond ANGLE_DEG[1]: a photograph is right only from about where it was taken;
 *  - by how many CSS pixels one of its pixels covers on screen: all of it up to TEXEL_PX[0], none from TEXEL_PX[1],
 *    where its resolution runs out and the model's fine template shows more;
 *  - by its size on screen (its half-width, CSS px): none below SIZE_PX[0], all from SIZE_PX[1]: a galaxy a few pixels
 *    across shows no more in a photograph than in its model, and its picture need not be loaded.
 */
export const ANGLE_DEG: readonly [number, number] = [6, 20];
export const TEXEL_PX: readonly [number, number] = [1.5, 4];
export const SIZE_PX: readonly [number, number] = [6, 16];

export interface PictureView {
  /** The galaxy's centre from the Sun and from the camera (world axes, one unit). */
  fromSun: Readonly<Vec3>;
  fromCamera: Readonly<Vec3>;
  /** The picture's half-width in the same unit. */
  halfWidth: number;
  /** Its pixels across. */
  pixelsAcross: number;
  /** CSS pixels per radian at the centre of the view. */
  pxPerRad: number;
}

export function pictureWeights(v: PictureView): { angle: number; texel: number; size: number; weight: number } {
  const ds = norm(v.fromSun as Vec3);
  const dc = norm(v.fromCamera as Vec3);
  // Both directions from the galaxy: to the Sun, −fromSun; to the camera, −fromCamera.
  const cos = dc > 0 && ds > 0 ? dot(v.fromSun as Vec3, v.fromCamera as Vec3) / (ds * dc) : 1;
  const angleDeg = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  const angle = 1 - smooth(ANGLE_DEG[0], ANGLE_DEG[1], angleDeg);
  // Seen from inside its own extent the picture is all pixels: none of it.
  const halfPx = dc > v.halfWidth ? (v.halfWidth / dc) * v.pxPerRad : Infinity;
  const texelPx = (2 * halfPx) / Math.max(1, v.pixelsAcross);
  const texel = 1 - smooth(TEXEL_PX[0], TEXEL_PX[1], texelPx);
  const size = smooth(SIZE_PX[0], SIZE_PX[1], halfPx);
  return { angle, texel, size, weight: angle * texel * size };
}

// ─── The model's own dust, seen from the Sun ──────────────────────────────────────────────

/**
 * The share of a galaxy model's light that its dust lets through towards a distant observer looking along `view`
 * (world, unit, from the observer to the galaxy), the same thin layer as shaders/galaxies.vert.glsl: a particle behind
 * the plane is dimmed by the face-on optical depth where the line of sight crosses it, over |cos| of the crossing angle
 * (at most 8 mag). The picture is given its galaxy's light times this, so that it and the model it crossfades with are
 * equally bright where they meet (the photograph shows the galaxy's dust in its own way).
 *
 * position: the template's particles (template units, xyz); share: each one's share of the light; axes: the template's
 * x, y, z in world axes (unit lengths × stretch, as GalaxyShape.axes); unitKpc: one template unit.
 */
export function dustTransmission(
  position: Float32Array,
  share: (i: number) => number,
  count: number,
  axes: readonly [Vec3, Vec3, Vec3],
  unitKpc: number,
  normal: Readonly<Vec3>,
  dust: { tau0: number; scaleKpc: number; ringKpc: number; ringWidthKpc: number },
  view: Readonly<Vec3>,
): number {
  if (dust.tau0 <= 0) return 1;
  const n = normal as Vec3;
  const vn = dot(view as Vec3, n);
  const mu = Math.abs(vn);
  if (mu < 1e-9) return 1;
  let total = 0;
  let through = 0;
  for (let i = 0; i < count; i++) {
    const w = share(i);
    total += w;
    const x = position[3 * i];
    const y = position[3 * i + 1];
    const z = position[3 * i + 2];
    const p: Vec3 = [
      (axes[0][0] * x + axes[1][0] * y + axes[2][0] * z) * unitKpc,
      (axes[0][1] * x + axes[1][1] * y + axes[2][1] * z) * unitKpc,
      (axes[0][2] * x + axes[1][2] * y + axes[2][2] * z) * unitKpc,
    ];
    // Behind the plane as seen along `view`: the line of sight from the particle back towards the observer crosses it.
    const s = dot(p, n) / vn;
    if (s <= 0) {
      through += w;
      continue;
    }
    const cross = add(p, scale(view as Vec3, -s));
    const r = norm(cross);
    let tau: number;
    if (dust.scaleKpc > 0) tau = dust.tau0 * Math.exp(-r / dust.scaleKpc);
    else {
      const spread = (-dust.scaleKpc * Math.sqrt(Math.max(1 - mu * mu, 0))) / Math.max(mu, 0.05);
      const ww = Math.hypot(dust.ringWidthKpc, spread);
      tau = dust.tau0 * (dust.ringWidthKpc / ww) * Math.exp(-0.5 * ((r - dust.ringKpc) / Math.max(ww, 1e-6)) ** 2);
    }
    const av = Math.min((1.0857362 * tau) / Math.max(mu, 0.05), 8);
    through += w * 10 ** (-0.4 * av);
  }
  return total > 0 ? through / total : 1;
}
