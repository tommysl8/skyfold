/**
 * Relativistic jets (docs/data/phenomena.md §3): M87's, in its own visible light, and Centaurus A's jets and lobes, in
 * radio and X-rays shown in false colour. Each is a set of elongated Gaussian clouds of light ("blobs", drawn exactly
 * by render/phenomenaMaterials.ts) in a frame about the galaxy's centre, kpc; each blob beamed by its speed along its
 * axis (beaming.ts) as seen from wherever the camera is, so from Earth each knot is as bright as it was measured and
 * from elsewhere as bright as relativity says.
 *
 * M87: the jet leaves M87* at position angle 290° (Meyer et al. 2013, ApJL 774, L21) and 17° from our line of sight
 * (Mertens et al. 2016, A&A 595, A54: 17.2 ± 3.3°; Walker et al. 2018, ApJ 855, 128), so its 20″ (1.6 kpc on the sky)
 * are 5.6 kpc along the jet. Its knots, at their distances from the core along the jet (Marshall et al. 2002, ApJ 564,
 * 683; knot G's X-ray place), shine with their 1998 HST fluxes at 606 nm (Perlman et al. 2001, ApJ 551, 206, table 2;
 * G's optical flux is a model); colour B − V ≈ 0.3, their spectral index α ≈ 0.9 (Perlman et al. 2001). Speeds: Γ ≥ 6
 * in HST-1 and knot D (Biretta, Sparks & Macchetto 1999, ApJ 520, 621: 6c on the sky), β = 0.85 beyond (knot A's 1.32c
 * on the sky: Meyer et al. 2013), which with α makes the counter-jet over 700 times fainter, as it is (over 450 times:
 * Stiavelli et al. 1992). Width: an intrinsic opening of about 1°, 1″ across at knot A (Walker et al. 2018; Marshall
 * et al. 2002). Between the knots a faint continuous jet, 5 % of the light (a model).
 *
 * Centaurus A (false colour; brightness chosen to be seen, not measured): the inner jet at position angle 55°, 50° from
 * our line of sight, moving at 0.57c (Snios et al. 2019, ApJ 871, 248), traced to about 4 kpc where it feeds the north
 * inner lobe (Neff, Eilek & Owen 2015, ApJ 802, 87); the counter-jet and the south inner lobe; the north middle lobe 30
 * kpc out at position angle 36° (Israel 1998, A&ARv 8, 237); the giant outer lobes, 8° of sky north and south, about
 * 600 kpc from end to end (Israel 1998; Feain et al. 2011, ApJ 740, 17). How the lobes lie along our line of sight is
 * not known: they are drawn across the sky.
 */
import { KPC_KM, PARSEC_KM } from '../../physics/constants';
import { betaOf } from './beaming';

export interface Blob {
  /** Centre from the galaxy's centre, kpc, in the frame (east, north, towards Earth). */
  pos: [number, number, number];
  /** Long axis (unit), same frame: the direction its plasma moves, for beaming. */
  axis: [number, number, number];
  /** σ along the axis and across, kpc. */
  sigAlong: number;
  sigAcross: number;
  /** Its light as seen from Earth, as V-band flux × km² (a source of V = m at d km has 10^(−0.4 m) d²). */
  lumEarth: number;
  /** Speed along its axis (0: not beamed) and its spectral index α (S_ν ∝ ν^−α). */
  beta: number;
  alpha: number;
  /** Colour, linear sRGB of luminance 1. */
  colour: [number, number, number];
}

const D2R = Math.PI / 180;

/** A direction at position angle PA (east of north) on the sky and `thetaDeg` from the line of sight towards Earth. */
export function skyDirection(paDeg: number, thetaDeg: number): [number, number, number] {
  const s = Math.sin(thetaDeg * D2R);
  return [s * Math.sin(paDeg * D2R), s * Math.cos(paDeg * D2R), Math.cos(thetaDeg * D2R)];
}

/** V magnitude of a flux density in µJy (AB; V ≈ AB within 0.02 mag). */
export const abMagnitude = (microJy: number): number => 23.9 - 2.5 * Math.log10(microJy);

/** Doppler factor's ratio to the power 2 + α, for a blob seen along unit vector `toObserver` against how Earth sees it. */
export function beamingFrom(b: Blob, toObserver: readonly number[]): number {
  if (!(b.beta > 0)) return 1;
  const g = 1 / Math.sqrt(1 - b.beta * b.beta);
  const cosObs = b.axis[0] * toObserver[0] + b.axis[1] * toObserver[1] + b.axis[2] * toObserver[2];
  const cosEarth = b.axis[2];
  const dObs = 1 / (g * (1 - b.beta * cosObs));
  const dEarth = 1 / (g * (1 - b.beta * cosEarth));
  return (dObs / dEarth) ** (2 + b.alpha);
}

// ─── M87 ──────────────────────────────────────────────────────────────────────────────

export const M87_DISTANCE_MPC = 16.8;
export const M87_JET_PA_DEG = 290;
export const M87_JET_THETA_DEG = 17;
/** pc per arcsec at M87. */
export const M87_PC_PER_ARCSEC = (M87_DISTANCE_MPC * 1e6) / 206_264.806;
/** Spectral index in the optical (Perlman et al. 2001). */
export const M87_ALPHA = 0.9;

/**
 * The knots: distance from the core on the sky ″, 606 nm flux µJy (1998), length on the sky ″ (σ), and speed. D's place
 * is the middle of its parts (2.8–4.0″); G's optical flux is a model (its X-ray place, 19.3″).
 */
export const M87_KNOTS: readonly { name: string; arcsec: number; microJy: number; lengthArcsec: number; beta: number }[] = [
  { name: 'HST-1', arcsec: 0.92, microJy: 19.8, lengthArcsec: 0.06, beta: betaOf(6) },
  { name: 'D', arcsec: 3.3, microJy: 117, lengthArcsec: 0.45, beta: betaOf(6) },
  { name: 'E', arcsec: 6.15, microJy: 33.4, lengthArcsec: 0.3, beta: 0.85 },
  { name: 'F', arcsec: 8.65, microJy: 123, lengthArcsec: 0.35, beta: 0.85 },
  { name: 'I', arcsec: 11.01, microJy: 54.2, lengthArcsec: 0.3, beta: 0.85 },
  { name: 'A', arcsec: 12.43, microJy: 1086, lengthArcsec: 0.35, beta: 0.85 },
  { name: 'B', arcsec: 14.45, microJy: 623, lengthArcsec: 0.7, beta: 0.85 },
  { name: 'C', arcsec: 17.7, microJy: 311, lengthArcsec: 0.45, beta: 0.85 },
  { name: 'G', arcsec: 19.5, microJy: 60, lengthArcsec: 0.5, beta: 0.85 },
];

/** The jet's half-opening: σ across is this many radians of the distance along it (1″ across at knot A). */
const M87_HALF_OPENING = 0.6 * D2R;

/** M87's jet and counter-jet as blobs (frame: east, north, towards Earth; kpc). */
export function m87JetBlobs(colour: [number, number, number]): Blob[] {
  const axis = skyDirection(M87_JET_PA_DEG, M87_JET_THETA_DEG);
  const sinT = Math.sin(M87_JET_THETA_DEG * D2R);
  const dKm = M87_DISTANCE_MPC * 1e6 * PARSEC_KM;
  const kpcOf = (arcsecOnSky: number) => (arcsecOnSky * M87_PC_PER_ARCSEC) / sinT / 1000;
  const out: Blob[] = [];
  const add = (sKpc: number, sigAlong: number, lum: number, beta: number, side: 1 | -1) => {
    const ax: [number, number, number] = [side * axis[0], side * axis[1], side * axis[2]];
    const b: Blob = {
      pos: [ax[0] * sKpc, ax[1] * sKpc, ax[2] * sKpc],
      axis: ax,
      sigAlong,
      sigAcross: Math.max(0.002, sKpc * Math.tan(M87_HALF_OPENING)),
      lumEarth: lum,
      beta,
      alpha: M87_ALPHA,
      colour,
    };
    out.push(b);
  };
  let total = 0;
  for (const k of M87_KNOTS) {
    const lum = 10 ** (-0.4 * abMagnitude(k.microJy)) * dKm * dKm;
    total += lum;
    add(kpcOf(k.arcsec), Math.max(0.004, kpcOf(k.lengthArcsec)), lum, k.beta, 1);
  }
  // The faint continuous jet between the knots: 5 % of the light, in six pieces along it.
  for (let i = 0; i < 6; i++) {
    const a = 1.5 + i * 3.2;
    add(kpcOf(a), kpcOf(1.4), (0.05 * total) / 6, 0.85, 1);
  }
  // The counter-jet: the same blobs going the other way, each as bright intrinsically; seen from Earth it is the
  // approaching side's light times the ratio of their Doppler factors.
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const b = out[i];
    const g = 1 / Math.sqrt(1 - b.beta * b.beta);
    const c = b.axis[2];
    const ratio = ((1 / (g * (1 + b.beta * c))) / (1 / (g * (1 - b.beta * c)))) ** (2 + b.alpha);
    out.push({ ...b, pos: [-b.pos[0], -b.pos[1], -b.pos[2]], axis: [-b.axis[0], -b.axis[1], -b.axis[2]], lumEarth: b.lumEarth * ratio });
  }
  return out;
}

// ─── Centaurus A ──────────────────────────────────────────────────────────────────────

export const CEN_A_JET_PA_DEG = 55;
export const CEN_A_JET_THETA_DEG = 50;
export const CEN_A_BETA = 0.57;

/** A blob whose peak surface brightness, seen broadside, is μ mag/arcsec² (its luminosity follows: L = S 2π σ₁ σ₂). */
function brightAt(mu: number, sig1Kpc: number, sig2Kpc: number): number {
  const s = 10 ** (-0.4 * mu) * 4.2545e10; // flux per sr
  return s * 2 * Math.PI * sig1Kpc * KPC_KM * sig2Kpc * KPC_KM;
}

/** Centaurus A's jets and lobes as blobs (false colour), frame and units as M87's. */
export function cenABlobs(jetColour: [number, number, number], lobeColour: [number, number, number]): Blob[] {
  const jet = skyDirection(CEN_A_JET_PA_DEG, CEN_A_JET_THETA_DEG);
  const sinT = Math.sin(CEN_A_JET_THETA_DEG * D2R);
  const out: Blob[] = [];
  // The inner jet: five pieces to 4 kpc on the sky, and the counter-jet the same, dimmer by the beaming ratio.
  for (let i = 0; i < 5; i++) {
    const s = (0.4 + i * 0.85) / sinT;
    const sa = 0.45 / sinT;
    const sc = 0.12 + 0.05 * i;
    const lum = brightAt(20.5, sa * sinT, sc);
    const b: Blob = { pos: [jet[0] * s, jet[1] * s, jet[2] * s], axis: jet, sigAlong: sa, sigAcross: sc, lumEarth: lum, beta: CEN_A_BETA, alpha: 0.6, colour: jetColour };
    out.push(b);
    const g = 1 / Math.sqrt(1 - CEN_A_BETA * CEN_A_BETA);
    const c = jet[2];
    const ratio = ((1 / (g * (1 + CEN_A_BETA * c))) / (1 / (g * (1 - CEN_A_BETA * c)))) ** 2.6;
    out.push({ ...b, pos: [-b.pos[0], -b.pos[1], -b.pos[2]], axis: [-jet[0], -jet[1], -jet[2]], lumEarth: lum * ratio });
  }
  const lobe = (paDeg: number, onSkyKpc: number, thetaDeg: number, sigAlong: number, sigAcross: number, mu: number) => {
    const d = skyDirection(paDeg, thetaDeg);
    const s = onSkyKpc / Math.sin(thetaDeg * D2R);
    out.push({ pos: [d[0] * s, d[1] * s, d[2] * s], axis: d, sigAlong, sigAcross, lumEarth: brightAt(mu, sigAlong * Math.sin(thetaDeg * D2R) || sigAlong, sigAcross), beta: 0, alpha: 0.6, colour: lobeColour });
  };
  // The inner lobes, at the jets' ends (7 kpc north-east, 5.5 kpc south-west on the sky).
  lobe(CEN_A_JET_PA_DEG, 6.5, CEN_A_JET_THETA_DEG, 1.6, 1.4, 20.8);
  lobe(CEN_A_JET_PA_DEG + 180, 5.5, 180 - CEN_A_JET_THETA_DEG, 1.6, 1.4, 21.0);
  // The north middle lobe, 30 kpc out at position angle 36° (no southern twin).
  lobe(36, 28, 90, 8, 4.5, 21.6);
  // The giant outer lobes, across the sky: 4.5° (300 kpc) north and 3.5° (230 kpc) south.
  lobe(5, 160, 90, 75, 55, 22.0);
  lobe(195, 125, 90, 65, 50, 22.0);
  return out;
}

/** The farthest any blob reaches from its galaxy's centre, kpc (3σ along). */
export function blobReachKpc(blobs: readonly Blob[]): number {
  let r = 0;
  for (const b of blobs) r = Math.max(r, Math.hypot(b.pos[0], b.pos[1], b.pos[2]) + 3 * Math.max(b.sigAlong, b.sigAcross));
  return r;
}
