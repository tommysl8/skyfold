/**
 * The ordered magnetic field threading a black hole, drawn with View › Magnetic field lines (scene/HoleFieldLines.tsx;
 * material: render/holeFieldMaterial.ts). A model consistent with what the Event Horizon Telescope's polarisation
 * shows, not a measured three-dimensional field (docs/data/blackholes.md §14).
 *
 * What is measured:
 *  - M87*: its ring is polarised in a spiral; the phase of the pattern's rotationally symmetric mode, ∠β₂, lies
 *    between −163° and −129° (|β₂| 0.04–0.07), and of the simulations only magnetically arrested discs (MAD), whose
 *    ordered field threading the hole is strong enough to hold the gas back, pass all the constraints; the field in
 *    the emitting gas is about 1–30 G (EHT Collaboration 2021, ApJL 910, L12 and L13, Papers VII and VIII). Passing
 *    models have spins a = 0 and ±0.5; the jet's power rules out a = 0 (EHT 2019, Paper V): drawn for a = 0.5.
 *  - Sgr A*: its ring is polarised by 24–28 % on average, up to about 40 %, in a strongly ordered spiral; ∠β₂ lies
 *    between −168° and −85° once the mean Faraday rotation is taken off, |β₂| 0.14–0.24; MAD is again favoured, and
 *    the one model passing every constraint is a MAD with a = 0.94 seen at i = 150° (EHT Collaboration 2024, ApJL
 *    964, L25 and L26, Papers VII and VIII): drawn for a = 0.94, its axis the flow model's (GRAVITY 2023's flares).
 *
 * The model: the paraboloidal field of Blandford & Znajek (1977, MNRAS 179, 433), the stream function
 * ψ = r(1 − cos θ) + 2M(1 + cos θ)(1 − ln(1 + cos θ)) − 4M(1 − ln 2) (units of M; the hole drawn without spin, its
 * horizon at 2M): the lines with ψ < 4M ln 2 thread the horizon and open into the jet's funnel (the paraboloid
 * z ∝ ϖ² far out, as M87's jet's ϖ ∝ z^0.58 is nearly: Asada & Nakamura 2012, ApJL 745, L28); those beyond start
 * on the disc. Field lines threading a spinning hole turn at about Ω_F = Ω_H/2, Ω_H = a c³/(2GM r₊),
 * r₊ = M(1 + √(1 − a²)): the rate that carries the most power out (Blandford & Znajek 1977), close to what force-free
 * simulations find (Komissarov 2001; McKinney & Gammie 2004); those on the disc turn with its gas, Ω_K = 1/(r^1.5 + a).
 * Turning, each is wound back into a helix, B_φ = −(Ω_F ϖ/c) B_p, i.e. dφ/ds = −Ω_F along its poloidal length (the
 * flat-space relation; near the horizon the lapse and frame dragging change it, not drawn). The field reverses
 * across the disc's plane (out of the hole in the north, in at the south: the polarity colours).
 *
 * The pitch against the EHT: if the polarisation is at right angles to the field (optically thin synchrotron),
 * ∠β₂ = 2η, η the polarisation's angle from radial, puts the field's sky-projected angle from radial at 90° − |η|:
 * 8.5–25.5° (M87*), 6–47.5° (Sgr A*). The drawn field, seen face-on where the funnel's wall passes ϖ = 3.5M (whose
 * light a face-on observer sees near b = ϖ/√(1 − 2M/ϖ) = 5.3M, the ring's radius), lies 22° (M87*, a = 0.5) and
 * 46° (Sgr A*, a = 0.94) from radial: inside both. A geometrical reading only: the gas's motion (aberration) and
 * Faraday rotation also turn the polarisation, which is why the EHT compares simulations' images, not fields.
 *
 * The other holes with a drawn disc or jet (Cygnus X-1, GRS 1915+105, LMC X-1, LMC X-3, M33 X-7; Centaurus A's):
 * the same field scaled by their mass (everything is in units of M) and drawn for their estimated spins (Centaurus
 * A's, not measured, for 0.5), illustrative: nothing measures their fields' shape.
 *
 * Pure functions; tests in holeField.test.ts. Cost: a hole's set, about 6,000 segments, built in a few ms once.
 */

/** ψ at the horizon's equator, 4 ln 2 (units of M): the last line threading the horizon. */
export const PSI_HORIZON = 4 * Math.LN2;

/** The paraboloidal stream function ψ(r, θ), units of M, for 0 ≤ θ ≤ π/2 (mirrored below the disc). */
export function paraboloidPsi(r: number, theta: number): number {
  const c = Math.cos(theta);
  return r * (1 - c) + 2 * (1 + c) * (1 - Math.log(1 + c)) - 4 * (1 - Math.LN2);
}

/** The colatitude where the line ψ0 is at radius r (NaN if it does not reach r in the upper half). ψ grows with θ. */
export function paraboloidTheta(r: number, psi0: number): number {
  if (paraboloidPsi(r, Math.PI / 2) < psi0 - 1e-9) return NaN;
  let lo = 0;
  let hi = Math.PI / 2;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (paraboloidPsi(r, m) < psi0) lo = m;
    else hi = m;
  }
  return 0.5 * (lo + hi);
}

/** The outer horizon of a Kerr hole, units of M. */
export const horizonKerr = (a: number): number => 1 + Math.sqrt(1 - a * a);

/** The hole's angular velocity Ω_H = a/(2r₊), units of c³/GM. */
export const omegaHole = (a: number): number => a / (2 * horizonKerr(a));

/** The horizon-threading field lines' angular velocity, Ω_H/2 (Blandford & Znajek 1977). */
export const omegaField = (a: number): number => 0.5 * omegaHole(a);

/** A disc's gas at radius r turns at Ω_K = 1/(r^1.5 + a) (Bardeen, Press & Teukolsky 1972), units of c³/GM. */
export const omegaDisc = (r: number, a: number): number => 1 / (r ** 1.5 + a);

/** What the EHT measured of a hole's polarised ring. */
export interface EhtPolarisation {
  /** ∠β₂, deg: the range of the phase of the rotationally symmetric mode. */
  argBeta2: readonly [number, number];
  absBeta2: readonly [number, number];
  /** Mean resolved linear polarisation, %. */
  meanPol: readonly [number, number];
  source: string;
}

export const EHT_M87: EhtPolarisation = { argBeta2: [-163, -129], absBeta2: [0.04, 0.07], meanPol: [5.7, 10.7], source: 'EHT Collaboration 2021, Papers VII and VIII' };
export const EHT_SGRA: EhtPolarisation = { argBeta2: [-168, -85], absBeta2: [0.14, 0.24], meanPol: [24, 28], source: 'EHT Collaboration 2024, Papers VII and VIII (∠β₂ with the mean Faraday rotation taken off)' };

/**
 * The sky-projected field's angle from radial, deg, that a β₂ phase implies if the polarisation is at right angles to
 * the field: η = ∠β₂/2 is the polarisation's angle from radial, the field's is 90° − |η|. Returns [min, max].
 */
export function ehtFieldAngleFromRadial(e: EhtPolarisation): [number, number] {
  const a = 90 - Math.abs(e.argBeta2[0] / 2);
  const b = 90 - Math.abs(e.argBeta2[1] / 2);
  return [Math.min(a, b), Math.max(a, b)];
}

/** A point on the funnel's wall (the last horizon-threading line) at cylindrical radius ϖ: its height and dϖ/ds there. */
export function wallAt(varpi: number): { r: number; z: number; dVarpiDs: number } {
  // Walk out the wall until it passes ϖ, then difference.
  let prev: [number, number] | null = null;
  for (let r = 2; r < 1e4; r *= 1.0005) {
    const th = paraboloidTheta(r, PSI_HORIZON);
    const w = r * Math.sin(th);
    const z = r * Math.cos(th);
    if (prev && prev[0] < varpi && w >= varpi) {
      const dw = w - prev[0];
      const dz = z - prev[1];
      return { r, z, dVarpiDs: dw / Math.hypot(dw, dz) };
    }
    prev = [w, z];
  }
  return { r: NaN, z: NaN, dVarpiDs: NaN };
}

/** The drawn field's sky-projected angle from radial, deg, seen face-on on the funnel's wall at ϖ, for spin a. */
export function modelFieldAngleFromRadial(a: number, varpi = 3.5): number {
  const w = wallAt(varpi);
  return (Math.atan((omegaField(a) * varpi) / w.dVarpiDs) * 180) / Math.PI;
}

/** A hole's field as drawn. */
export interface HoleFieldSpec {
  /** Spin drawn for the winding (the lens draws every hole without spin). */
  spin: number;
  spinNote: string;
  /** 'eht': matched to the EHT's polarisation; 'illustrative': the same model, scaled. */
  basis: 'eht' | 'illustrative';
  eht?: EhtPolarisation;
  /** Where the field's axis comes from. */
  axis: 'flow' | 'jet' | 'disc';
  /** The jet's position angle and angle from our line of sight, deg (axis 'jet'): the axis's direction towards us. */
  jet?: { paDeg: number; thetaDeg: number };
  /** The spin points away from us along the jet (the EHT's i > 90°): M87*. */
  spinAway?: boolean;
}

/** The holes drawn with a field, and how. */
export const HOLE_FIELDS: Readonly<Record<string, HoleFieldSpec>> = {
  'sgr-a-star': { spin: 0.94, spinNote: 'a = 0.94, the one model passing all the EHT’s constraints (Paper VIII); not measured', basis: 'eht', eht: EHT_SGRA, axis: 'flow' },
  'm87-star': {
    spin: 0.5,
    spinNote: 'a = 0.5, among the EHT’s passing MAD models (Paper VIII), the jet ruling out a = 0 (Paper V); not measured',
    basis: 'eht',
    eht: EHT_M87,
    axis: 'jet',
    // The approaching jet at PA 290°, 17° from our line of sight (phenomena/jets.ts); the spin points away from us (i = 163°).
    jet: { paDeg: 290, thetaDeg: 17 },
    spinAway: true,
  },
  'cen-a-bh': { spin: 0.5, spinNote: 'not measured: drawn for a = 0.5', basis: 'illustrative', axis: 'jet', jet: { paDeg: 55, thetaDeg: 50 } },
  'cyg-x-1': { spin: 0.9985, spinNote: 'its estimate, above 0.9985 (continuum fitting)', basis: 'illustrative', axis: 'disc' },
  'grs-1915': { spin: 0.98, spinNote: 'its estimate, above 0.98', basis: 'illustrative', axis: 'disc' },
  'lmc-x-1': { spin: 0.92, spinNote: 'its estimate, 0.92', basis: 'illustrative', axis: 'disc' },
  'lmc-x-3': { spin: 0.21, spinNote: 'its estimate, 0.21', basis: 'illustrative', axis: 'disc' },
  'm33-x-7': { spin: 0.84, spinNote: 'its estimate, 0.84', basis: 'illustrative', axis: 'disc' },
};

/** Field lines as segments in the hole's frame (z its spin axis), units of M, with what the material needs. */
export interface HoleFieldSet {
  positions: Float32Array;
  /** The segment's other end, per vertex (the lensed shader drops a segment whose ends' images fall either side of the lens's caustic). */
  other: Float32Array;
  /** Distance along its line, M (dashes). */
  arc: Float32Array;
  /** +1 out of the hole (north), −1 in (south). */
  pol: Float32Array;
  /** +1 where the field runs the way the line is drawn. */
  flow: Float32Array;
  weight: Float32Array;
}

/** Shares of the horizon's flux the jet's lines start at, and the disc radii (M) the disc's lines start at. */
export const HORIZON_SHARES: readonly number[] = [0.1, 0.3, 0.55, 0.8, 0.98];
export const DISC_RADII: readonly number[] = [6, 9, 14, 22];

/** One line of the paraboloidal field from r0 out to rMax: points (ϖ, z) and the poloidal length along it, M. */
export function paraboloidLine(psi0: number, r0: number, rMax: number, n = 96): { varpi: number[]; z: number[]; s: number[] } {
  const varpi: number[] = [];
  const z: number[] = [];
  const s: number[] = [];
  for (let i = 0; i <= n; i++) {
    const r = r0 * (rMax / r0) ** (i / n);
    const th = paraboloidTheta(r, psi0);
    if (!Number.isFinite(th)) break;
    varpi.push(r * Math.sin(th));
    z.push(r * Math.cos(th));
    const k = varpi.length - 1;
    s.push(k === 0 ? 0 : s[k - 1] + Math.hypot(varpi[k] - varpi[k - 1], z[k] - z[k - 1]));
  }
  return { varpi, z, s };
}

/**
 * The hole's field lines: the jet's (threading the horizon, wound at Ω_H/2) out to rMax, and the disc's (wound at its
 * gas's Ω_K) out to half that, both hemispheres, `azimuths` round the axis. Drawn from rIn (the lensed shader cannot
 * place points inside the photon sphere, 3M), in units of M.
 */
export function holeFieldLines(spin: number, rMax = 60, azimuths = 8, rIn = 2.0): HoleFieldSet {
  const pos: number[] = [];
  const oth: number[] = [];
  const arcs: number[] = [];
  const pols: number[] = [];
  const flows: number[] = [];
  const ws: number[] = [];
  const add = (psi0: number, r0: number, reach: number, omega: number, w: number, phase: number) => {
    const line = paraboloidLine(psi0, r0, reach);
    for (const hemi of [1, -1])
      for (let k = 0; k < azimuths; k++) {
        const ph0 = (2 * Math.PI * (k + phase)) / azimuths;
        const pts: [number, number, number][] = [];
        for (let i = 0; i < line.varpi.length; i++) {
          // Wound back as it turns: dφ/ds = −Ω_F (the hole's spin about +z).
          const ph = ph0 - omega * line.s[i];
          pts.push([line.varpi[i] * Math.cos(ph), line.varpi[i] * Math.sin(ph), hemi * line.z[i]]);
        }
        let arc = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          const fade = (j: number) => w * (1 - Math.max(0, Math.min(1, (line.s[j] / line.s[line.s.length - 1] - 0.6) / 0.4)));
          pos.push(...a, ...b);
          oth.push(...b, ...a);
          arcs.push(arc, arc + d);
          pols.push(hemi, hemi);
          flows.push(hemi, hemi);
          ws.push(fade(i - 1), fade(i));
          arc += d;
        }
      }
  };
  for (const [j, f] of HORIZON_SHARES.entries()) add(f * PSI_HORIZON, Math.max(2.0001, rIn), rMax, omegaField(spin), 1, 0.5 * (j % 2));
  for (const [j, r] of DISC_RADII.entries()) add(r - 2 + PSI_HORIZON, r, rMax / 2, omegaDisc(r, spin), 0.45, 0.25 + 0.5 * (j % 2));
  return {
    positions: new Float32Array(pos),
    other: new Float32Array(oth),
    arc: new Float32Array(arcs),
    pol: new Float32Array(pols),
    flow: new Float32Array(flows),
    weight: new Float32Array(ws),
  };
}

/** The card's line on a hole's field (Sgr A*'s card adds it in sim/galaxy/records.ts), with its source. */
export function fieldFact(id: string): { text: string; source: string; label: string } | null {
  const spec = HOLE_FIELDS[id];
  if (!spec) return null;
  if (id === 'sgr-a-star')
    return {
      text: 'The Event Horizon Telescope found its ring strongly polarised, 24–28 % on average, in a spiral: the mark of an ordered magnetic field threading the hole, as in a magnetically arrested disc. View › Magnetic field lines draws such a field, a model consistent with that polarisation, not a measured 3D field.',
      source: 'https://doi.org/10.3847/2041-8213/ad2df1',
      label: 'EHT Collaboration 2024 (Paper VIII)',
    };
  if (id === 'm87-star')
    return {
      text: 'The Event Horizon Telescope found its ring’s polarisation turning in a spiral (the phase of its pattern, ∠β₂, between −163° and −129°), best matched by a strong, ordered field threading the hole (a magnetically arrested disc), about 1–30 gauss in the glowing gas. View › Magnetic field lines draws such a field, a model consistent with that polarisation, not a measured 3D field.',
      source: 'https://doi.org/10.3847/2041-8213/abe4de',
      label: 'EHT Collaboration 2021 (Paper VIII)',
    };
  return {
    text: `View › Magnetic field lines draws a field threading it, wound by its spin (${spec.spinNote}) into a funnel along its axis: an illustration of how a spinning hole drives a jet (Blandford & Znajek 1977), scaled to its mass. Nothing measures its field’s shape.`,
    source: 'https://doi.org/10.1093/mnras/179.3.433',
    label: 'Blandford & Znajek 1977',
  };
}
