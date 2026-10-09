/**
 * A star seen up close: the shape and the surface its close-up disc is drawn with (render/starSurfaceMaterial.ts,
 * scene/Bodies.tsx StarBody). Pure functions of the numbers: the tests check them against the papers they come from.
 * docs/data/stars.md §13.
 *
 *  - Shape. A fast rotator is a Roche surface, the equipotential of a point mass turning rigidly (the model the
 *    CHARA and VLTI papers fit): with x = r/R_pole and k = Ω²R_pole³/GM, 1/x + ½ k x² sin²θ = 1, and k = (8/27) ω²
 *    for ω = Ω/Ω_crit. Every other star is a sphere.
 *  - Gravity darkening. von Zeipel (1924): the local flux goes as the effective gravity, T ∝ g^β, β = 0.25 for a
 *    radiative envelope; the interferometric fits find smaller β (0.17–0.23), which is what is used where measured.
 *  - Limb darkening. I(μ)/I(1) = 1 − u (1 − μ) in B, V and R from Claret & Bloemen 2011 (ATLAS), by temperature and
 *    gravity: much darker limbs on red supergiants (u_V ≈ 0.9) than on hot stars (≈ 0.3).
 *  - Granulation. A model: bright cells about ten pressure scale heights H_p = kT/(μ m_H g) across, as the Sun's
 *    granules are (about 1,300 km at H_p ≈ 130 km), so millions of them on a Sun-like star and ever fewer and bigger
 *    ones as gravity falls; red supergiants also carry a few giant cells, each a sizeable fraction of the star, as
 *    their interferometric images and 3D models show (Haubois et al. 2009; Chiavassa et al. 2010; Ohnaka et al.
 *    2017). Stars hotter than about 8,000 K have no convection at the surface to show.
 *  - Time. Cells turn over in about a cell's size over a few km/s: minutes on the Sun, about a year on Betelgeuse.
 *    They are shown on the wall clock, sped up by a power of ten until a turnover takes under a minute (labelled).
 */
import { Vector3 } from 'three';
import { raDecToWorld } from '../frames';
import LIMB from './limb-darkening.json';

const DEG = Math.PI / 180;

// ─── Roche shape and gravity darkening ──────────────────────────────────────────────────

/** k = Ω²R_pole³/GM of the Roche model for ω = Ω/Ω_crit (at break-up the equator is 1.5 polar radii out). */
export const rocheK = (omega: number): number => (8 / 27) * omega * omega;

/**
 * The Roche surface's radius at colatitude θ (0 at the pole), in polar radii: the root of 1/x + ½ k x² sin²θ = 1
 * between 1 and the potential's turning point (Newton's method from x = 1, which converges from below: the
 * function is convex there).
 */
export function rocheRadius(colatitudeRad: number, omega: number): number {
  const s2 = Math.sin(colatitudeRad) ** 2;
  const a = 0.5 * rocheK(Math.min(omega, 0.999_999)) * s2;
  if (a <= 0) return 1;
  let x = 1;
  for (let i = 0; i < 60; i++) {
    const f = 1 / x + a * x * x - 1;
    const df = -1 / (x * x) + 2 * a * x;
    const dx = f / df;
    x -= dx;
    if (Math.abs(dx) < 1e-14) break;
  }
  return x;
}

/** R_eq/R_pole of a Roche star turning at ω = Ω/Ω_crit. */
export const rocheFlattening = (omega: number): number => rocheRadius(Math.PI / 2, omega);

/** ω = Ω/Ω_crit of a Roche star whose equatorial radius is `ratio` polar radii (1 ≤ ratio < 1.5). */
export function omegaFromFlattening(ratio: number): number {
  const k = (2 * (ratio - 1)) / ratio ** 3;
  return Math.sqrt((27 / 8) * k);
}

/**
 * Effective gravity (gravity plus the centrifugal term) on the Roche surface at colatitude θ, in units of GM/R_pole²:
 * its size, and the outward surface normal it defines (an equipotential is everywhere at right angles to it) as
 * radial and colatitude components.
 */
export function rocheGravity(colatitudeRad: number, omega: number): { g: number; nr: number; nt: number; x: number } {
  const x = rocheRadius(colatitudeRad, omega);
  const k = rocheK(omega);
  const s = Math.sin(colatitudeRad);
  const c = Math.cos(colatitudeRad);
  // −∇Φ: radial −1/x² + k x s², colatitude k x s c (outward and towards the equator).
  const gr = -1 / (x * x) + k * x * s * s;
  const gt = k * x * s * c;
  const g = Math.hypot(gr, gt);
  return { g, nr: -gr / g, nt: -gt / g, x };
}

/** T(θ)/T_pole by von Zeipel's law T ∝ g^β (gravity at the pole is GM/R_pole², 1 in these units). */
export const gravityDarkening = (colatitudeRad: number, omega: number, beta: number): number => rocheGravity(colatitudeRad, omega).g ** beta;

/**
 * The polar temperature of a Roche star whose surface-averaged T⁴ (the effective temperature over its whole area)
 * is `meanK`⁴: for a star whose papers give the mean and not the poles (Achernar).
 */
export function poleTemperatureFromMean(meanK: number, omega: number, beta: number): number {
  let area = 0;
  let flux = 0;
  const n = 400;
  for (let i = 0; i < n; i++) {
    const th = ((i + 0.5) / n) * Math.PI;
    const { x, nr } = rocheGravity(th, omega);
    // Surface element ∝ x² sinθ dθ / (n · r̂).
    const dA = (x * x * Math.sin(th)) / nr;
    area += dA;
    flux += dA * gravityDarkening(th, omega, beta) ** 4;
  }
  return meanK / (flux / area) ** 0.25;
}

/**
 * The direction of a star's visible rotation pole in world axes, from its place on the sky (ICRS) and the
 * orientation interferometry measures: the inclination i of the axis to the line of sight and the position angle
 * (east of north) of the pole on the sky.
 */
export function poleWorld(raDeg: number, decDeg: number, inclinationDeg: number, poleAngleDeg: number): Vector3 {
  return poleFromDirection(raDecToWorld(raDeg, decDeg), inclinationDeg, poleAngleDeg);
}

/** The same from the star's direction from the Sun in world axes (a unit vector). */
export function poleFromDirection(dirWorld: Readonly<Vector3>, inclinationDeg: number, poleAngleDeg: number): Vector3 {
  const toEarth = dirWorld.clone().normalize().negate();
  const celestialPole = raDecToWorld(0, 90);
  const north = celestialPole.clone().addScaledVector(toEarth, -celestialPole.dot(toEarth)).normalize();
  // East on the sky (towards increasing RA), as an observer at Earth sees it.
  const east = new Vector3().crossVectors(celestialPole, toEarth).negate().normalize();
  const i = inclinationDeg * DEG;
  const pa = poleAngleDeg * DEG;
  return new Vector3()
    .addScaledVector(toEarth, Math.cos(i))
    .addScaledVector(north, Math.sin(i) * Math.cos(pa))
    .addScaledVector(east, Math.sin(i) * Math.sin(pa))
    .normalize();
}

// ─── Limb darkening ─────────────────────────────────────────────────────────────────────

/**
 * Linear limb-darkening coefficients [R, V, B] (the red, green and blue channels) for a temperature and log g (cgs),
 * interpolated in Claret & Bloemen's (2011) table; outside it, its edge (white dwarfs take log g = 5).
 */
export function limbDarkening(teffK: number, loggCgs: number): [number, number, number] {
  const T = LIMB.teffK;
  const G = LIMB.logg;
  const t = Math.min(T[T.length - 1], Math.max(T[0], teffK));
  const g = Math.min(G[G.length - 1], Math.max(G[0], loggCgs));
  let i = 0;
  while (i < T.length - 2 && T[i + 1] < t) i++;
  let j = 0;
  while (j < G.length - 2 && G[j + 1] < g) j++;
  const ft = (t - T[i]) / (T[i + 1] - T[i]);
  const fg = (g - G[j]) / (G[j + 1] - G[j]);
  const at = (band: number): number => {
    const u = LIMB.u[band];
    const a = u[i][j] * (1 - fg) + u[i][j + 1] * fg;
    const b = u[i + 1][j] * (1 - fg) + u[i + 1][j + 1] * fg;
    return a * (1 - ft) + b * ft;
  };
  // The table's bands are B, V, R.
  return [at(2), at(1), at(0)];
}

// ─── Granulation ────────────────────────────────────────────────────────────────────────

const K_B = 1.380649e-23;
const M_H = 1.6735575e-27;
/** Mean molecular weight of the neutral gas at the photosphere of a cool star. */
const MU = 1.3;
const G_SI = 6.674_30e-11;
const M_SUN_KG = 1.988_41e30;
const R_SUN_M = 6.957e8;

/** Surface gravity, log10 of cm/s², of a star of mass M (M☉) and radius R (R☉). */
export const loggCgs = (massMsun: number, radiusRsun: number): number => Math.log10(((G_SI * massMsun * M_SUN_KG) / (radiusRsun * R_SUN_M) ** 2) * 100);

/** The photosphere's pressure scale height kT/(μ m_H g), km. */
export function pressureScaleHeightKm(teffK: number, logg: number): number {
  const g = 10 ** logg / 100;
  return (K_B * teffK) / (MU * M_H * g) / 1000;
}

/** Granules are about this many pressure scale heights across (the Sun's: ≈ 1,300 km at H_p ≈ 130 km). */
export const GRANULE_SCALE_HEIGHTS = 10;

/** About how many cells of diameter d cover a sphere of radius R: its area over a cell's, 16 R²/d². */
export const cellsOnSphere = (radiusKm: number, cellKm: number): number => (16 * radiusKm * radiusKm) / (cellKm * cellKm);

/** How strongly granulation shows by temperature: full below 6,500 K, gone above 8,500 K (radiative surfaces). */
export function granulationStrength(teffK: number): number {
  const t = Math.min(1, Math.max(0, (teffK - 6500) / 2000));
  return 1 - t * t * (3 - 2 * t);
}

/** The Sun's granules live about eight minutes (Nordlund, Stein & Asplund 2009, Living Rev. Sol. Phys. 6, 2). */
export const SUN_GRANULE_LIFETIME_S = 480;
/** …and are about this wide, km. */
export const SUN_GRANULE_KM = 1300;

/**
 * How many times faster than real a surface is shown: the least power of ten (at least 1) that brings its turnover
 * under SHOWN_TURNOVER_S, so a red supergiant's year-long cells move and the Sun's minutes-long granules are near real time.
 */
export const SHOWN_TURNOVER_S = 60;
export function surfaceSpeedup(turnoverS: number): number {
  let k = 1;
  while (turnoverS / k > SHOWN_TURNOVER_S && k < 1e12) k *= 10;
  return k;
}

// ─── The close-up of one star ───────────────────────────────────────────────────────────

/** A rapid rotator's measured orientation and shape (the CHARA/VLTI fits). */
export interface RotatorSpec {
  /** ω = Ω/Ω_crit, as fitted (or derived from the fitted R_eq/R_pole). */
  omega: number;
  /** Gravity-darkening exponent β. */
  beta: number;
  /** Temperatures at the pole and equator, K, as fitted (the equator's follows from von Zeipel's law). */
  teffPoleK: number;
  inclinationDeg: number;
  /** Position angle of the visible pole on the sky, degrees east of north. */
  poleAngleDeg: number;
  /** Equatorial rotation speed, km/s (for the rotation period: 2πR_eq/v). */
  vEqKms?: number;
  periodDays?: number;
  /** The paper behind these. */
  ref: string;
}

/** What a star's close-up adds to the generic look: shape, cells, spots, flares; each item with its source. */
export interface CloseUpSpec {
  rotator?: RotatorSpec;
  /** A red supergiant's giant convection cells: how many over the whole star, and their turnover time, s. */
  giantCells?: { count: number; turnoverS: number; ref: string };
  /** Starspots: how many, their angular radius (rad) and how much cooler than the surface, K. */
  spots?: { count: number; radiusRad: number; deltaTK: number; periodDays: number; ref: string };
  /** Flares: how often (per day of real time) and how long each lasts, s. */
  flares?: { perDay: number; durationS: number; ref: string };
  /** An optically thick wind rather than a surface (Eta Carinae): prolate along its pole, no cells. */
  wind?: { elongation: number; inclinationDeg: number; poleAngleDeg: number; ref: string };
}

/** Everything the close-up material needs, worked out once per star. */
export interface StarSurface {
  /** Mean (surface-averaged) effective temperature, K: the colour the disc averages to. */
  teffK: number;
  logg: number;
  /** Limb darkening [R, V, B]. */
  limbU: [number, number, number];
  /** Roche ω (0: a sphere) and β; the polar temperature as a multiple of teffK. */
  omega: number;
  beta: number;
  poleTeffRatio: number;
  /** Prolate wind (> 1: longer along the pole). */
  elongation: number;
  /** Pole in world axes, and whether it is measured (else chosen). */
  pole: [number, number, number];
  poleMeasured: boolean;
  /** Rotation period, days (0: not known; the surface is then shown not turning). */
  rotationDays: number;
  /** Granules over the whole star, their contrast (0–1), and the giant cells' count and contrast. */
  granules: number;
  granuleContrast: number;
  giantCells: number;
  giantContrast: number;
  /** Turnover time of the cells shown, s, and how much faster than real they are shown. */
  turnoverS: number;
  speedup: number;
  spots: CloseUpSpec['spots'] | null;
  flares: CloseUpSpec['flares'] | null;
  /** The card's lines on how it is drawn (model notes). */
  notes: string[];
}

/** Temperature contrast of granules (± a fraction of T), Sun-like stars and red supergiants: a model. On a red
 * supergiant the giant cells dominate and the granules on them are fainter. */
const GRANULE_CONTRAST = 0.035;
const GIANT_CELL_CONTRAST = 0.07;

/** Inputs: the record's numbers and, for the stars that have one, its close-up spec. */
export interface SurfaceInput {
  teffK: number;
  radiusRsun: number;
  /** Mass, M☉, if known (else estimated: notes say so). */
  massMsun?: number;
  /** The star's direction from the Sun, world axes (for a measured pole). */
  dirWorld?: readonly [number, number, number];
  spec?: CloseUpSpec;
  /** Radius only estimated (the card already says so). */
  white?: boolean;
}

/** A mass for a star whose mass is not known, for its surface gravity only: dwarfs by R^1.25, bigger stars 1–15 M☉. */
export const massGuess = (radiusRsun: number): number => (radiusRsun < 1.5 ? Math.max(0.08, radiusRsun ** 1.25) : Math.min(15, Math.max(1, radiusRsun / 20)));

const fmt = (x: number): string => (x >= 100 ? Math.round(x).toLocaleString('en-GB') : x.toPrecision(2));

/** The close-up of a star: a sphere with the generic look, or its spec's shape, cells, spots and flares. */
export function starSurface(input: SurfaceInput): StarSurface {
  const spec = input.spec;
  const mass = input.massMsun ?? massGuess(input.radiusRsun);
  const logg = loggCgs(mass, input.radiusRsun);
  const notes: string[] = [];
  let omega = 0;
  let beta = 0.25;
  let poleTeffRatio = 1;
  let pole: [number, number, number] = [0, 1, 0];
  let poleMeasured = false;
  let rotationDays = 0;
  let elongation = 1;
  const rot = spec?.rotator;
  if (rot) {
    omega = rot.omega;
    beta = rot.beta;
    poleTeffRatio = rot.teffPoleK / input.teffK;
    if (input.dirWorld) {
      const p = poleFromDirection(new Vector3(...input.dirWorld), rot.inclinationDeg, rot.poleAngleDeg);
      pole = [p.x, p.y, p.z];
      poleMeasured = true;
    }
    const eq = rocheFlattening(omega);
    const tEq = rot.teffPoleK * gravityDarkening(Math.PI / 2, omega, beta);
    // The mean radius is (R_eq² R_pole)^⅓, so R_eq is the mean times (R_eq/R_pole)^⅓.
    rotationDays = rot.periodDays ?? (rot.vEqKms ? (2 * Math.PI * input.radiusRsun * 695_700 * Math.cbrt(eq)) / rot.vEqKms / 86_400 : 0);
    notes.push(
      `Up close: its shape is the Roche model of a star spinning at ${Math.round(omega * 100)}% of break-up, ${((eq - 1) * 100).toFixed(0)}% wider at the equator than pole to pole, its poles ${fmt(rot.teffPoleK)} K and its equator ${fmt(tEq)} K by von Zeipel’s law with β = ${beta} (${rot.ref}); its tilt and the pole’s direction on the sky are measured.`,
    );
  }
  const wind = spec?.wind;
  if (wind) {
    elongation = wind.elongation;
    if (input.dirWorld) {
      const p = poleFromDirection(new Vector3(...input.dirWorld), wind.inclinationDeg, wind.poleAngleDeg);
      pole = [p.x, p.y, p.z];
      poleMeasured = true;
    }
  }
  // Granules: about ten scale heights across.
  const radiusKm = input.radiusRsun * 695_700;
  const hp = pressureScaleHeightKm(input.teffK, logg);
  const cellKm = GRANULE_SCALE_HEIGHTS * hp;
  const strength = wind ? 0 : granulationStrength(input.teffK);
  const granules = Math.min(4e7, cellsOnSphere(radiusKm, cellKm));
  const giant = spec?.giantCells;
  const turnoverS = giant ? giant.turnoverS : SUN_GRANULE_LIFETIME_S * (cellKm / SUN_GRANULE_KM);
  const speedup = surfaceSpeedup(turnoverS);
  if (strength > 0) {
    const shown = speedup === 1 ? 'at their real pace' : `${speedup.toLocaleString('en-GB')} times faster than real`;
    if (giant)
      notes.push(
        `Its surface is a model: a few giant convection cells, each a good fraction of the star across, as interferometric images and 3D models of red supergiants show (${giant.ref}), with smaller granules on them; they turn over in about ${giant.turnoverS >= 2e7 ? `${fmt(giant.turnoverS / 3.156e7)} year${giant.turnoverS >= 4.5e7 ? 's' : ''}` : `${fmt(giant.turnoverS / 86_400)} days`} and are shown ${shown}.`,
      );
    else
      notes.push(
        `Its granulation is a model: about ${granules >= 1e6 ? `${fmt(granules / 1e6)} million` : fmt(granules)} convection cells, each about ten pressure scale heights (${fmt(cellKm)} km) across as on the Sun, living about ${turnoverS < 3600 ? `${fmt(turnoverS / 60)} minutes` : turnoverS < 2 * 86_400 ? `${fmt(turnoverS / 3600)} hours` : `${fmt(turnoverS / 86_400)} days`}; shown ${shown}.`,
      );
  } else if (!wind) notes.push(`Up close its surface is smooth: a star this hot has no convection at the surface to show; its limb darkening is Claret & Bloemen’s (2011) for its temperature.`);
  if (spec?.spots)
    notes.push(
      `Its starspots are a model: ${spec.spots.count} patches about ${Math.round(Math.abs(spec.spots.deltaTK))} K cooler than the surface, turning with the star every ${fmt(spec.spots.periodDays)} days on the simulation’s clock (${spec.spots.ref}); where they lie is not known.`,
    );
  if (spec?.flares)
    notes.push(
      `Flares are drawn at the rate measured, about ${Math.round(spec.flares.perDay)} a day (${spec.flares.ref}), each a brief brightening at a chosen place, on the same sped-up clock as its surface.`,
    );
  if (input.massMsun === undefined && strength > 0) notes.push('Its mass is not known: the size of its granules uses a rough mass for its radius.');
  if (rot || giant || spec?.spots)
    notes.push('Up close the brightness differences across its disc are shown stretched, each stop of real contrast as about two, so they survive the display’s tone curve; from afar the disc is exact.');
  return {
    teffK: input.teffK,
    logg,
    limbU: limbDarkening(input.teffK, logg),
    omega,
    beta,
    poleTeffRatio,
    elongation,
    pole,
    poleMeasured,
    rotationDays: spec?.spots?.periodDays ?? rotationDays,
    granules,
    granuleContrast: (giant ? 0.3 : 1) * GRANULE_CONTRAST * strength,
    giantCells: giant ? giant.count : 0,
    giantContrast: giant ? GIANT_CELL_CONTRAST * strength : 0,
    turnoverS,
    speedup,
    spots: spec?.spots ?? null,
    flares: spec?.flares ?? null,
    notes,
  };
}
