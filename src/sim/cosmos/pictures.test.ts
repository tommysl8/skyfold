import { describe, expect, it } from 'vitest';
import { add, dot, eclToWorld, ICRS_TO_ECL, apply, norm, scale, skyBasis, type Vec3 } from './frames';
import { discAxesEcl } from './localGalaxies';
import { ANGLE_DEG, dustTransmission, MAX_DISC_TILT_DEG, picturePoint, pictureWeights, picturePlane, planeArea, skyHalfSides, TEXEL_PX } from './pictures';
import { loadPictures } from '../../test/cosmos';

const world = (v: Vec3): Vec3 => eclToWorld(apply(ICRS_TO_ECL, v));
const ARCMIN = Math.PI / 10800;

/** Where a point at world position p (from the Sun) shows on the sky about (ra, dec): east and north offsets, arcmin. */
function onSky(p: Vec3, ra: number, dec: number): [number, number] {
  const { r, e, n } = skyBasis(ra, dec);
  const [rw, ew, nw] = [world(r), world(e), world(n)];
  const along = dot(p, rw);
  return [dot(p, ew) / along / ARCMIN, dot(p, nw) / along / ARCMIN];
}

describe('a picture on the sky', () => {
  const pic = { centerRaDeg: 10.68, centerDecDeg: 41.27, widthArcmin: 200, heightArcmin: 120, northAngleDeg: 0 };

  it('with north up, image-up points north and image-right west', () => {
    const s = skyHalfSides(pic);
    const { e, n } = skyBasis(pic.centerRaDeg, pic.centerDecDeg);
    expect(dot(s.up, world(n)) / norm(s.up)).toBeCloseTo(1, 9);
    expect(dot(s.right, world(e)) / norm(s.right)).toBeCloseTo(-1, 9);
    expect(norm(s.right)).toBeCloseTo(100 * ARCMIN, 12);
    expect(norm(s.up)).toBeCloseTo(60 * ARCMIN, 12);
  });

  it('north 30° to the left of up turns image-up 30° west of north', () => {
    const s = skyHalfSides({ ...pic, northAngleDeg: 30 });
    const { e, n } = skyBasis(pic.centerRaDeg, pic.centerDecDeg);
    const u = scale(s.up, 1 / norm(s.up));
    expect(dot(u, world(n))).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(dot(u, world(e))).toBeCloseTo(-Math.sin(Math.PI / 6), 9);
  });
});

describe('a picture laid on its galaxy', () => {
  const ra = 10.6847;
  const dec = 41.269;
  const pic = { centerRaDeg: ra, centerDecDeg: dec, widthArcmin: 200, heightArcmin: 120, northAngleDeg: 12 };
  const dKpc = 761;
  const g = scale(world(skyBasis(ra, dec).r), dKpc);
  // Andromeda's disc (77.7° from face-on would be a card: a 50° tilt here, to test the plane).
  const disc = discAxesEcl(ra, dec, { inclination: 50, recedingPA: 37.7, nearSidePA: 307.7 });
  const normal = eclToWorld(disc.normal);

  it('covers the sky from the Sun exactly as the photograph does', () => {
    const pl = picturePlane(pic, g, normal);
    expect(pl.onDisc).toBe(true);
    for (const [i, j] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const corner = add(g, picturePoint(pl, i, j));
      const sky = skyHalfSides(pic);
      const want = add(world(skyBasis(ra, dec).r), add(scale(sky.right, i), scale(sky.up, j)));
      const [e1, n1] = onSky(corner, ra, dec);
      const [e2, n2] = onSky(want, ra, dec);
      expect(e1).toBeCloseTo(e2, 6);
      expect(n1).toBeCloseTo(n2, 6);
    }
  });

  it('lies in the disc’s plane through the galaxy’s centre', () => {
    const pl = picturePlane(pic, g, normal);
    for (const [x, y] of [[0, 0], [1, 1], [-1, 0.3], [0.5, -1]]) expect(dot(picturePoint(pl, x, y), normal)).toBeCloseTo(0, 6);
  });

  it('is foreshortened by cos i back to the photograph’s area', () => {
    const pl = picturePlane(pic, g, normal);
    const skyArea = 200 * 120 * (dKpc * ARCMIN) ** 2;
    // To within the few per cent the perspective of a 3° picture makes.
    expect((planeArea(pl) * Math.cos((50 * Math.PI) / 180)) / skyArea).toBeCloseTo(1, 1);
  });

  it(`is a card across our line of sight for a disc tilted more than ${MAX_DISC_TILT_DEG}°, and for an elliptical`, () => {
    const edge = discAxesEcl(ra, dec, { inclination: 84, pa: 90 });
    const a = picturePlane(pic, g, eclToWorld(edge.normal));
    const b = picturePlane(pic, g, null);
    for (const pl of [a, b]) {
      expect(pl.onDisc).toBe(false);
      expect(Math.abs(dot(pl.normal, scale(g, 1 / dKpc)))).toBeCloseTo(1, 9);
    }
  });
});

describe('how much of the light the picture draws', () => {
  const base = { fromSun: [0, 0, -1000] as Vec3, halfWidth: 20, pixelsAcross: 1024, pxPerRad: 900 / 2 / Math.tan((25 * Math.PI) / 180) };

  it('all of it from the Solar System, none 20° away', () => {
    const home = pictureWeights({ ...base, fromCamera: [0, 0, -1000] });
    expect(home.weight).toBeCloseTo(1, 9);
    const t = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return pictureWeights({ ...base, fromCamera: [500 * Math.sin(a), 0, -500 * Math.cos(a)] }).angle;
    };
    expect(t(ANGLE_DEG[0] - 0.1)).toBe(1);
    expect(t((ANGLE_DEG[0] + ANGLE_DEG[1]) / 2)).toBeCloseTo(0.5, 6);
    expect(t(ANGLE_DEG[1] + 0.1)).toBe(0);
    // Smooth: no step anywhere between.
    for (let d = 0; d < 25; d += 0.5) expect(Math.abs(t(d + 0.5) - t(d))).toBeLessThan(0.1);
  });

  it('gives way to the model as its pixels grow on screen', () => {
    const at = (d: number) => pictureWeights({ ...base, fromSun: [0, 0, -1000], fromCamera: [0, 0, -d] });
    // A texel covers 2 halfWidth / d pxPerRad / 1024 CSS px.
    const dFor = (texelPx: number) => (2 * base.halfWidth * base.pxPerRad) / (1024 * texelPx);
    expect(at(dFor(TEXEL_PX[0] * 0.9)).texel).toBe(1);
    expect(at(dFor(TEXEL_PX[1] * 1.1)).texel).toBe(0);
    expect(at(10).weight).toBe(0);
  });

  it('none of it while the galaxy is a speck', () => {
    expect(pictureWeights({ ...base, fromSun: [0, 0, -1e6], fromCamera: [0, 0, -1e6] }).size).toBe(0);
  });
});

describe('the model’s dust seen from the Sun', () => {
  // A ring of particles in the plane z = 0 and one above and below it, each a third of the light.
  const position = new Float32Array([0.5, 0, 0.2, 0.5, 0, -0.2, 0.5, 0, 0]);
  const axes: [Vec3, Vec3, Vec3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const dust = { tau0: 1, scaleKpc: 1e9, ringKpc: 0, ringWidthKpc: 0 };

  it('dims only what lies behind the plane, by its optical depth over |cos|', () => {
    const face = dustTransmission(position, () => 1 / 3, 3, axes, 1, [0, 0, 1], dust, [0, 0, -1]);
    // From above (looking down −z) the particle below the plane is behind it: τ = 1, A = 1.086 mag.
    expect(face).toBeCloseTo((2 + 10 ** (-0.4 * 1.0857362)) / 3, 6);
    const slant = dustTransmission(position, () => 1 / 3, 3, axes, 1, [0, 0, 1], dust, [Math.sin(1), 0, -Math.cos(1)]);
    expect(slant).toBeCloseTo((2 + 10 ** ((-0.4 * 1.0857362) / Math.cos(1))) / 3, 6);
  });

  it('lets everything through without dust', () => {
    expect(dustTransmission(position, () => 1 / 3, 3, axes, 1, [0, 0, 1], { ...dust, tau0: 0 }, [0, 0, -1])).toBe(1);
  });
});

describe('the shipped pictures', () => {
  const doc = loadPictures();

  it('each carries its credit, licence, page and a sensible size', () => {
    for (const p of doc.pictures) {
      expect(p.credit.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.licence).toBe('CC BY 4.0');
      expect(p.imageSource.page).toMatch(/^https:\/\//);
      expect(p.meanLight, p.id).toBeGreaterThan(0);
      expect(p.meanLight, p.id).toBeLessThan(1);
      expect(Math.max(...p.pixels), p.id).toBeLessThanOrEqual(1024);
      expect(p.bytes, p.id).toBeLessThan(400_000);
    }
  });
});
