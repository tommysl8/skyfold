// Builds src/sim/blackholes/blackholes.json: the real black holes the app draws besides the Galaxy's own (Sgr A*'s
// mass and place stay in src/sim/galaxy/sstars.json; its entry here carries only what a black hole's record adds),
// their companion stars and the binaries' orbits, every value with the key of the paper it comes from. The tables are
// this file's (the first eleven holes) and scripts/blackholes-more.mjs's (the X-ray binaries of BlackCAT and of the
// Magellanic Clouds and M33, and the black holes at the centres of nearby galaxies).
//
// Run from the repo root (no downloads; the output is deterministic):
//
//   node scripts/build-blackholes.mjs
//
// Its inputs besides the two tables: public/data/deepsky/ngc-galaxies.json.gz, for the place of a galaxy of the NGC
// catalogue with a black hole at its centre (as the deep-sky layer places that galaxy); and the file it writes, whose
// companions' catalogue indices scripts/build-stars3d-ext.mjs fills in (the Gaia black holes' stars, pinned in the
// catalogue's head) and which a rebuild keeps.
//
// What it computes from the hand-kept table below:
//  - each binary's barycentre: position (pc) and velocity (km/s) at J2000, heliocentric, J2000 ecliptic axes, from its
//    astrometry (position, proper motion, systemic radial velocity) at the adopted distance, carried to J2000 in a
//    straight line. The same code path as scripts/build-stars3d.mjs uses for src/sim/stars/systems.json
//    (stateFromAstrometry, propagate, eqToEcl): its twin, kept identical.
//  - each orbit in the systems.json form (orbitModel): the relative orbit of the star (group 2) about the black hole
//    (group 1), pHat and qHat from the Campbell elements (Thiele-Innes: Omega is the position angle of the node where
//    the star recedes, omega the star's argument of periastron, i < 90 deg anticlockwise on the sky; the convention of
//    systems.json and of the S-star frame, checked once on Alpha Centauri AB with an independent numpy script), and the
//    semi-major axis from Kepler's third law with the masses drawn (so the orbit and the drawn gravity agree).
//  - the X-ray binaries, whose ephemerides give T0, the donor's inferior conjunction (the donor nearest to us, its
//    radial velocity crossing from approach to recession): e = 0 and omega_star = 90 deg are assumed, so the donor is
//    nearest at true anomaly 180 deg and the periastron time is T0 - P/2. Omega (the orientation on the sky) and the
//    sense of revolution are unknown: the node is put due north and the orbit turns anticlockwise (assumed, labelled).
//  - checks, printed and kept in each system's `checks`: Kepler's a against the published a, the Gaia photocentre
//    orbits, the donor in front at T0, Cygnus X-1's O star in front at its T0.
//
// Julian dates are used as given (TCB for Gaia, HJD/BJD UTC for ground spectroscopy: the differences, under 70 s, are
// far below every uncertainty here). Cost: a few milliseconds.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as MORE from './blackholes-more.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'sim', 'blackholes', 'blackholes.json');
const NGC_GALAXIES = join(ROOT, 'public', 'data', 'deepsky', 'ngc-galaxies.json.gz');

// ─── Constants (as scripts/build-stars3d.mjs and src/physics/constants.ts) ───────────────────────────────────────

const DEG = Math.PI / 180;
const AU_KM = 149597870.7;
const PC_KM = (AU_KM * 648000) / Math.PI;
const JYEAR_S = 365.25 * 86400;
const KMS_TO_PC_PER_YR = JYEAR_S / PC_KM;
const K_PM = AU_KM / JYEAR_S; // km/s per (mas/yr × kpc), i.e. v_t = K · µ[mas/yr] / ϖ[mas]
const GM_SUN_KM3S2 = 1.3271244e11; // IAU 2015 B3 nominal, as the app
const EPS = (84381.448 / 3600) * DEG;
const COS_E = Math.cos(EPS);
const SIN_E = Math.sin(EPS);
const JD_J2000 = 2451545.0;

const mjdToJy = (mjd) => 2000 + (mjd + 2400000.5 - JD_J2000) / 365.25;

// ─── The same helpers as scripts/build-stars3d.mjs ───────────────────────────────────────────────────────────────

const unitFromRaDec = (raDeg, decDeg) => {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};
/** ICRS equatorial -> J2000 ecliptic (rotation about x by the J2000 obliquity). */
const eqToEcl = (v) => [v[0], COS_E * v[1] + SIN_E * v[2], -SIN_E * v[1] + COS_E * v[2]];

/** Heliocentric position (pc) and velocity (km/s), ICRS axes, from astrometry. */
function stateFromAstrometry({ raDeg, decDeg, parallaxMas, pmRaMasYr, pmDecMasYr, rvKms }) {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const r = unitFromRaDec(raDeg, decDeg);
  const east = [-Math.sin(a), Math.cos(a), 0];
  const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const dist = 1000 / parallaxMas;
  const va = (K_PM * pmRaMasYr) / parallaxMas;
  const vd = (K_PM * pmDecMasYr) / parallaxMas;
  return {
    pos: r.map((x) => x * dist),
    vel: [0, 1, 2].map((k) => rvKms * r[k] + va * east[k] + vd * north[k]),
  };
}

const propagate = (s, dtYr) => ({ pos: s.pos.map((x, k) => x + s.vel[k] * dtYr * KMS_TO_PC_PER_YR), vel: [...s.vel] });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

function solveKepler(M, e) {
  let m = M % (2 * Math.PI);
  if (m > Math.PI) m -= 2 * Math.PI;
  if (m < -Math.PI) m += 2 * Math.PI;
  let E = e < 0.8 ? m : Math.PI * Math.sign(m || 1);
  for (let i = 0; i < 50; i++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-15) break;
  }
  return E;
}

/** Campbell (visual-binary) elements -> orbit basis vectors P, Q in ICRS for a system at (ra, dec). */
function campbellBasis({ iDeg, OmegaDeg, omegaDeg }, raDeg, decDeg) {
  const i = iDeg * DEG;
  const O = OmegaDeg * DEG;
  const w = omegaDeg * DEG;
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const s = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; // away from the observer
  const east = [-Math.sin(a), Math.cos(a), 0];
  const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  // Thiele-Innes constants per unit semi-major axis (x = north, y = east, z = away from the observer)
  const A = Math.cos(w) * Math.cos(O) - Math.sin(w) * Math.sin(O) * Math.cos(i);
  const B = Math.cos(w) * Math.sin(O) + Math.sin(w) * Math.cos(O) * Math.cos(i);
  const F = -Math.sin(w) * Math.cos(O) - Math.cos(w) * Math.sin(O) * Math.cos(i);
  const G = -Math.sin(w) * Math.sin(O) + Math.cos(w) * Math.cos(O) * Math.cos(i);
  const C = Math.sin(w) * Math.sin(i);
  const H = Math.cos(w) * Math.sin(i);
  const P = [0, 1, 2].map((k) => A * north[k] + B * east[k] + C * s[k]);
  const Q = [0, 1, 2].map((k) => F * north[k] + G * east[k] + H * s[k]);
  return { P, Q, s };
}

/** Relative position (au) and velocity (km/s) of the orbit {aAu, e, periodDays, tPeriJD, P, Q} at jd. */
function orbitState(o, jd) {
  const n = (2 * Math.PI) / o.periodDays;
  const E = solveKepler(n * (jd - o.tPeriJD), o.e);
  const cE = Math.cos(E);
  const sE = Math.sin(E);
  const b = Math.sqrt(1 - o.e * o.e);
  const x = o.aAu * (cE - o.e);
  const y = o.aAu * b * sE;
  const Edot = n / (1 - o.e * cE);
  const k = AU_KM / 86400;
  return {
    pos: [0, 1, 2].map((j) => x * o.P[j] + y * o.Q[j]),
    vel: [0, 1, 2].map((j) => (-o.aAu * sE * Edot * o.P[j] + o.aAu * b * cE * Edot * o.Q[j]) * k),
  };
}

/** Classical angles of an orbit basis in the frame whose z axis is the reference pole (here: the ecliptic). */
function anglesFromBasis(P, Q) {
  const h = cross(P, Q);
  const i = Math.acos(Math.max(-1, Math.min(1, h[2])));
  const node = [-h[1], h[0], 0];
  const nn = norm(node);
  const Omega = nn > 1e-12 ? Math.atan2(node[1], node[0]) : 0;
  const nhat = nn > 1e-12 ? node.map((x) => x / nn) : [1, 0, 0];
  const omega = Math.atan2(dot(cross(nhat, P), h), dot(nhat, P));
  const wrap = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { iDeg: i / DEG, OmegaDeg: wrap(Omega) / DEG, omegaDeg: wrap(omega) / DEG };
}

/** Kepler's third law: the relative semi-major axis, au, of masses m1 + m2 (M☉) on a period of P days. */
const keplerAu = (massMsun, periodDays) => Math.cbrt((GM_SUN_KM3S2 * massMsun * (periodDays * 86400) ** 2) / (4 * Math.PI * Math.PI)) / AU_KM;

/** Eggleton (1983): the Roche lobe's volume-equivalent radius as a share of the separation, for q = M_donor / M_accretor. */
const eggleton = (q) => (0.49 * q ** (2 / 3)) / (0.6 * q ** (2 / 3) + Math.log(1 + q ** (1 / 3)));

// ─── References ──────────────────────────────────────────────────────────────────────────────────────────────────
// Key → "citation — what is taken from it". The app shows the citation (the part before " — ").

const REFS = {
  GRAVITY2022: 'GRAVITY Collaboration 2022, A&A 657, L12 — mass and distance of Sgr A* from four S-star orbits (Sect. 4; Table B.1)',
  ReidBrunthaler2004: 'Reid & Brunthaler 2004, ApJ 616, 872 — the radio position of Sgr A*',
  ReidBrunthaler2020: 'Reid & Brunthaler 2020, ApJ 892, 39 — Sgr A*’s apparent motion across our sky, 6.411 mas/yr (the reflex of the Sun’s orbit), and its own motion, a few km/s at most',
  Do2019: 'Do et al. 2019, Science 365, 664 — the Keck group’s mass of Sgr A*, 3.975 × 10⁶ M☉ (Table 1)',
  EHTSgrA_I: 'Event Horizon Telescope Collaboration 2022, ApJL 930, L12 — Sgr A*’s ring, 51.8 ± 2.3 µas (Table 1)',
  EHTSgrA_V: 'Event Horizon Telescope Collaboration 2022, ApJL 930, L16 — models of Sgr A*’s flow, spin and viewing angle',
  EHTSgrA_VI: 'Event Horizon Telescope Collaboration 2022, ApJL 930, L17 — Sgr A*’s shadow, 48.7 ± 7.0 µas, and its deviation from a non-spinning hole',
  EHTM87_I: 'Event Horizon Telescope Collaboration 2019, ApJL 875, L1 — M87*’s ring, 42 ± 3 µas (Table 1)',
  EHTM87_V: 'Event Horizon Telescope Collaboration 2019, ApJL 875, L5 — models of M87*’s ring and jet, spin not zero',
  EHTM87_VI: 'Event Horizon Telescope Collaboration 2019, ApJL 875, L6 — M87*’s mass, 6.5 ± 0.2 ± 0.7 × 10⁹ M☉',
  EHTM87_2025: 'Event Horizon Telescope Collaboration 2025, A&A (arXiv:2509.24593) — M87*’s ring over 2017–2021, 43.9 ± 0.6 µas',
  Liepold2023: 'Liepold, Ma & Walsh 2023, ApJL 945, L35 — M87’s black hole from stellar dynamics, 5.37 × 10⁹ M☉',
  Simon2024: 'Simon, Cappellari & Hartke 2024, MNRAS 527, 2341 — M87’s black hole from stellar dynamics, 8.7 × 10⁹ M☉ (5.5 with an earlier stellar density)',
  Walker2018: 'Walker et al. 2018, ApJ 855, 128 — M87’s jet: 17° from our line of sight, position angle 288°',
  ElBadry2023a: 'El-Badry et al. 2023, MNRAS 518, 1057 — Gaia BH1 (Table 1)',
  Nagarajan2024: 'Nagarajan et al. 2024, PASP 136, 014202 — Gaia BH1’s orbit from ESPRESSO radial velocities (Table 1)',
  ElBadry2023b: 'El-Badry et al. 2023, MNRAS 521, 4323 — Gaia BH2 (Table 2, Gaia and radial velocities)',
  GaiaBH3: 'Gaia Collaboration, Panuzzo et al. 2024, A&A 686, L2 — Gaia BH3 (Tables 1–3)',
  MillerJones2021: 'Miller-Jones et al. 2021, Science 371, 1046 — Cygnus X-1’s distance, masses and orbit (Table 1; Table S3)',
  Brocksopp1999: 'Brocksopp et al. 1999, A&A 343, 861 — Cygnus X-1’s ephemeris (period, conjunction)',
  Gies2003: 'Gies et al. 2003, ApJ 583, 424 — Cygnus X-1’s radial-velocity orbit (Table 2: V0 = −7.0 ± 0.5 km/s)',
  Bolton1972: 'Bolton 1972, Nature 235, 271 — HDE 226868 found to orbit an unseen massive companion, Cygnus X-1',
  Ramachandran2025: 'Ramachandran et al. 2025, A&A 698, A37 — Cygnus X-1 re-analysed: the black hole 12.7–17.8 M☉, depending on the orbit’s inclination',
  MillerJones2009: 'Miller-Jones et al. 2009, ApJL 706, L230 — V404 Cygni’s radio parallax and proper motion',
  Casares2019: 'Casares et al. 2019, MNRAS 488, 1356 — V404 Cygni’s ephemeris and systemic velocity (Table 3)',
  CasaresCharles1994: 'Casares & Charles 1994, MNRAS 271, L5 — V404 Cygni’s mass ratio, q = 0.060',
  Khargharia2010: 'Khargharia, Froning & Robinson 2010, ApJ 716, 1105 — V404 Cygni’s inclination and mass',
  Burdge2024: 'Burdge et al. 2024, Nature 635, 316 — V404 Cygni is a wide triple',
  Eggleton1983: 'Eggleton 1983, ApJ 268, 368 — the Roche lobe’s radius',
  GonzalezHernandez2014: 'González Hernández et al. 2014, MNRAS 438, L21 — A0620-00 and XTE J1118+480: ephemerides, masses, donors (Table 1)',
  GonzalezHernandez2010: 'González Hernández & Casares 2010, A&A 516, A58 — A0620-00’s systemic velocity, 8.5 ± 1.8 km/s',
  GonzalezHernandez2008: 'González Hernández et al. 2008, ApJ 679, 732 — XTE J1118+480’s systemic velocity, 2.7 ± 1.1 km/s',
  Cantrell2010: 'Cantrell et al. 2010, ApJ 710, 1127 — A0620-00’s inclination, mass and distance',
  Gelino2006: 'Gelino et al. 2006, ApJ 642, 438 — XTE J1118+480’s distance',
  Torres2019: 'Torres et al. 2019, ApJL 882, L21 — MAXI J1820+070’s ephemeris and systemic velocity',
  Torres2020: 'Torres et al. 2020, ApJL 893, L37 — MAXI J1820+070’s mass ratio and mass',
  Atri2020: 'Atri et al. 2020, MNRAS 493, L81 — MAXI J1820+070’s radio parallax, distance and jet inclination',
  Mikolajewska2022: 'Mikołajewska et al. 2022, ApJ 930, 9 — MAXI J1820+070’s donor star',
  PecautMamajek2013: 'Pecaut & Mamajek 2013, ApJS 208, 9 — temperatures of dwarf stars by spectral type',
  Sahu2022: 'Sahu et al. 2022, ApJ 933, 83 — the first isolated black hole, from astrometric microlensing: 7.1 ± 1.3 M☉',
  Lam2022: 'Lam et al. 2022, ApJL 933, L23 — the same lens at 1.6–4.4 M☉',
  Sahu2025: 'Sahu et al. 2025, ApJ (arXiv:2503.07820) — OGLE-2011-BLG-0462: 7.15 ± 0.83 M☉ at 1.52 ± 0.15 kpc, moving 51.1 ± 7.5 km/s',
  GaiaDR3: 'Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1 — Gaia DR3 positions and proper motions (via SIMBAD)',
  SIMBAD: 'SIMBAD (CDS) — positions and magnitudes, retrieved 28 September 2026',
  Kerr: 'Bardeen 1973, in Black Holes (Les Houches), 215 — the shadow of a spinning (Kerr) black hole; the percentages computed here for Sgr A*’s viewing angle',
  ZhaoGou2021: 'Zhao et al. 2021, ApJ 908, 117 — Cygnus X-1’s thermal disc at 2 % of its Eddington luminosity (L_Edd = 2.8 × 10³⁹ erg/s for 21.2 M☉; l = 0.02–0.03 over six soft-state spectra, Table 2)',
  NovikovThorne1973: 'Novikov & Thorne 1973, in Black Holes (Les Houches), 343 — the thin accretion disc in general relativity',
  PageThorne1974: 'Page & Thorne 1974, ApJ 191, 499 — the flux from a thin disc’s surface',
  Luminet1979: 'Luminet 1979, A&A 75, 228 — the image of a thin disc round a Schwarzschild black hole; its flux in closed form (eq. 15)',
  Paczynski1977: 'Paczyński 1977, ApJ 216, 822 — the largest disc tides allow in a close binary',
  Palit2020: 'Palit, Janiuk & Czerny 2020, ApJ 904, 21 — Cygnus X-1’s wind-fed flow modelled out to about 10¹¹ cm, within Paczyński’s limit for its disc',
};

// ─── The black holes ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * M87's own starlight round M87* (a glow from a published light profile, src/sim/galaxy/nuclearGlow.json). A fall
 * into M87* (and its close-up scene) is offered only with that starlight drawn: without it the hole's Einstein disc
 * would be empty and read as a shadow twice its size. With it (true), M87* offers a fall and its card says what its
 * starlight is; set false and run this script again to take both away.
 */
const M87_STARLIGHT = true;

/**
 * The line on every stellar hole's card about spin (label 1 of docs/data/blackholes.md §3): the Kerr shadow's largest
 * change, seen edge-on at a = 0.998: up to 12 % narrower, shifted by up to 2.4 GM/c² (1.2 horizon radii).
 */
const STELLAR_SPIN_LINE =
  'Drawn without spin (Schwarzschild): its spin is not measured; a fast spin would make its shadow up to 12 % narrower and shift it by up to 1.2 horizon radii, depending on the angle.';
const XRB_ORIENTATION_LINE = 'The orientation of its orbit on the sky is not known: one is assumed, turning anticlockwise as we see it, and the orbit is taken as circular.';
/**
 * The quiet X-ray binaries' card line on what is not drawn (label 16 of docs/data/blackholes.md §3): between outbursts
 * their discs are cool, cut off far from the hole and not in a steady state, so no thin-disc model applies.
 */
const XRB_GAS_LINE = 'Its disc of gas, pulled off its companion, is not drawn: between outbursts it is faint, cool and far from the hole, with no steady model to draw.';
const GAIA_DR4 = 'Its orbit is Gaia DR3’s with ground-based radial velocities; Gaia’s fourth data release (due December 2026) will refine it.';

const HOLES = [
  {
    id: 'sgr-a-star',
    name: 'Sagittarius A*',
    shortName: 'Sgr A*',
    aliases: [],
    class: 'supermassive',
    placement: 'sstars',
    constellation: 'Sagittarius',
    mass: { value: 4.297e6, unc: { stat: 12000, sys: 40000 }, ref: 'GRAVITY2022', note: 'as sstars.json (the S-star orbits are fitted in this potential)' },
    massNote: 'The Keck group’s fit gives 3.975 × 10⁶, 7.5 % less (Do et al. 2019): a difference between the two teams not yet resolved.',
    spin: {
      value: null,
      status: 'unknown',
      note:
        'Not measured: models of its ring and flow point to 0.5–0.9, but depend on their assumptions. Seen as we see it, about 25° from its axis, a spin of 0.9–0.94 would make the shadow about 5–7 % smaller and shift it by about half its horizon’s radius; seen edge-on a fast spin makes a shadow up to about 12 % narrower. That agrees with the Event Horizon Telescope’s finding that spin changes the shadow’s size by less than about 8 %.',
      ref: 'EHTSgrA_V',
    },
    facts: [],
    modelNotes: [
      'Drawn without spin (Schwarzschild): its spin is not measured; a spin of 0.9–0.94 would make the shadow about 5–7 % smaller as we see it and shift it by about half its horizon’s radius.',
      'The glow round it is a model of the hot gas falling in, fitted to its radio and infrared light: nobody has seen it in visible light.',
      'The stars within a few parsecs of it are a statistical model of the nuclear star cluster: of those, only S2, S29, S38 and S55 are real stars.',
    ],
    sheetNotes: [
      'Nothing comes from inside the shadow: a black hole formed by collapse has no white hole, so rays traced back into it end on the collapsed matter, whose light has faded away.',
      'The accretion flow is a model: a hot, thin flow (of the type of Broderick & Loeb 2006) fitted to Sgr A*’s spectrum from radio to infrared and turned like the flares GRAVITY saw (a model choice), drawn outside the horizon only. Its visible light has never been seen (30 magnitudes of dust) and is carried over from the infrared: uncertain by about three times either way, and eight times fainter in a pessimistic model. It is smooth and steady, while the real flow flickers tenfold within hours. The scenes made to show the lens switch it off.',
      'The 1.3 mm view is the model’s brightness at the Event Horizon Telescope’s wavelength in false colour (blurred to the EHT’s 20 µas as seen from Earth when asked), not the EHT’s own reconstruction, which the card links to beside it.',
      'The stars round it within a few parsecs are a statistical model of the nuclear star cluster and disc: their numbers, brightness and colours follow published fits, but none is a real star except S2, S29, S38 and S55; stars fainter than those drawn, and any within 0.01 pc of you, are a smooth glow.',
      'A fall into it is offered: home’s clock is shown on the clocks of observers falling freely (Painlevé–Gullstrand), a convention; the fall ends where tides pull a ship apart, 0.03 s before the centre, where general relativity stops working. Stopping puts you back where you let go.',
      'No dust is drawn near it: the Sun seen past Sgr A* would really be dimmed by about 30 magnitudes.',
      'Held fixed at its radio position, at rest relative to the Sun, the app’s frame. It hardly moves relative to the Galaxy (a few km/s at most), but the Sun’s orbit round the Galaxy carries it across our sky at 6.4 milliarcseconds a year, about 250 km/s (Reid & Brunthaler 2020): that motion is left out, and with it the aberration of up to 3′ it would give the sky seen from beside the hole.',
    ],
    refs: ['GRAVITY2022', 'ReidBrunthaler2004', 'ReidBrunthaler2020', 'EHTSgrA_I', 'EHTSgrA_V', 'EHTSgrA_VI', 'Do2019', 'Kerr'],
    fallAllowed: true,
    orbitLine: false,
    flow: 'sgr-a-star-riaf',
    ehtImage: {
      file: 'images/eht/sgra-2017.jpg',
      credit: 'EHT Collaboration',
      modificationNote: 'Image modified for Skyfold: resized.',
      page: 'https://www.eso.org/public/images/eso2208-eht-mwa/',
      source: 'ESO eso2208-eht-mwa',
      licence: 'CC BY 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      band: '1.3 mm (radio, 230 GHz)',
      ringDiameterUas: 51.8,
      ringSource: 'Event Horizon Telescope Collaboration 2022, ApJL 930, L12, Table 1 (51.8 ± 2.3 µas)',
    },
  },
  {
    id: 'm87-star',
    name: 'M87*',
    aliases: ['M87 black hole', 'Messier 87 black hole', 'Pōwehi', 'Virgo A black hole'],
    class: 'supermassive',
    placement: 'galaxy-centre',
    host: 'm87',
    constellation: 'Virgo',
    mass: { value: 6.5e9, unc: { stat: 0.2e9, sys: 0.7e9 }, ref: 'EHTM87_VI' },
    massNote: 'From the motions of M87’s stars: 5.4 × 10⁹ (Liepold et al. 2023) to 8.7 × 10⁹ (Simon et al. 2024).',
    spin: {
      value: null,
      status: 'unknown',
      note: 'Not measured: the power of its jet rules out no spin at all (EHT 2019, Paper V). A fast spin would make its shadow a few per cent smaller and shift it by about half its horizon’s radius at the angle we see it from.',
      ref: 'EHTM87_V',
    },
    facts: [
      {
        text: 'The first black hole ever pictured: in 2019 the Event Horizon Telescope showed a ring of light 42 ± 3 millionths of an arcsecond across round its shadow.',
        source: 'https://doi.org/10.3847/2041-8213/ab0ec7',
        label: 'EHT Collaboration 2019 (Paper I)',
      },
      {
        text: '6.5 billion times the mass of the Sun: its event horizon, 128 au in radius, would hold the orbits of all the planets four times over.',
        source: 'https://doi.org/10.3847/2041-8213/ab1141',
        label: 'EHT Collaboration 2019 (Paper VI)',
      },
      {
        text: 'From 2017 to 2021 its ring stayed the same size, 43.9 ± 0.6 millionths of an arcsecond, while its brightest part moved round it.',
        source: 'https://arxiv.org/abs/2509.24593',
        label: 'EHT Collaboration 2025',
      },
    ],
    modelNotes: [
      'Drawn without spin (Schwarzschild): its spin is not measured; a fast spin would make the shadow a few per cent smaller and shift it by about half its horizon’s radius.',
      'Its jet, a beam of plasma moving at nearly the speed of light and aimed 17° from us, is not drawn.',
      ...(M87_STARLIGHT ? ['M87’s own starlight round it is drawn as a smooth model of the galaxy’s measured light, not as its stars.'] : []),
    ],
    sheetNotes: [
      'Its mass is contested: 6.5 × 10⁹ M☉ from the size of its ring (EHT 2019), 5.4–8.7 × 10⁹ from the motions of M87’s stars.',
      'No gas round it is drawn: the hot flow that makes its ring and the jet it launches are left out.',
      ...(M87_STARLIGHT
        ? ['A fall into it is offered: its last stretch plays in 80 s of real time, where it would take 33.5 hours aboard; home’s clock is shown on the clocks of observers falling freely (a convention).']
        : ['No fall into it is offered until M87’s own starlight is drawn round it: without that its Einstein ring would frame an empty sky.']),
    ],
    refs: ['EHTM87_I', 'EHTM87_V', 'EHTM87_VI', 'EHTM87_2025', 'Liepold2023', 'Simon2024', 'Walker2018'],
    fallAllowed: M87_STARLIGHT,
    orbitLine: false,
    ehtImage: {
      file: 'images/eht/m87-2017.jpg',
      credit: 'EHT Collaboration',
      modificationNote: 'Image modified for Skyfold: resized.',
      page: 'https://www.eso.org/public/images/eso1907a/',
      source: 'ESO eso1907a',
      licence: 'CC BY 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      band: '1.3 mm (radio, 230 GHz)',
      ringDiameterUas: 42,
      ringSource: 'Event Horizon Telescope Collaboration 2019, ApJL 875, L1, Table 1 (42 ± 3 µas)',
    },
  },
  {
    id: 'gaia-bh1',
    name: 'Gaia BH1',
    aliases: ['Gaia BH 1', 'Gaia DR3 4373465352415301632'],
    class: 'stellar',
    placement: 'binary',
    constellation: 'Ophiuchus',
    mass: { value: 9.27, unc: 0.1, ref: 'Nagarajan2024' },
    massNote: '9.62 ± 0.18 in the discovery paper (El-Badry et al. 2023)',
    spin: { value: null, status: 'unknown', note: 'Not measured: it takes in no gas, so no X-rays show its spin.' },
    facts: [
      {
        text: 'The nearest black hole known, 480 parsecs (1,570 light-years) away in Ophiuchus. It gives off no light: Gaia found it from the wobble of the Sun-like star that circles it every six months.',
        source: 'https://doi.org/10.1093/mnras/stac3140',
        label: 'El-Badry et al. 2023',
      },
      {
        text: 'Its mass, 9.27 times the Sun’s, comes from that star’s orbit: its speed along our line of sight swings by 65 km/s either way.',
        source: 'https://doi.org/10.1088/1538-3873/ad1ba7',
        label: 'Nagarajan et al. 2024',
      },
    ],
    modelNotes: [STELLAR_SPIN_LINE],
    sheetNotes: [GAIA_DR4],
    refs: ['ElBadry2023a', 'Nagarajan2024'],
    fallAllowed: false,
    orbitLine: true,
  },
  {
    id: 'gaia-bh2',
    name: 'Gaia BH2',
    aliases: ['Gaia BH 2', 'Gaia DR3 5870569352746779008'],
    class: 'stellar',
    placement: 'binary',
    constellation: 'Centaurus',
    mass: { value: 8.94, unc: 0.34, ref: 'ElBadry2023b' },
    spin: { value: null, status: 'unknown', note: 'Not measured: it takes in no gas, so no X-rays show its spin.' },
    facts: [
      {
        text: 'A black hole of 8.9 solar masses with a red giant circling it every 3.5 years, 1,160 parsecs (3,800 light-years) away in Centaurus: found, like Gaia BH1, from the giant’s wobble on the sky.',
        source: 'https://doi.org/10.1093/mnras/stad799',
        label: 'El-Badry et al. 2023',
      },
    ],
    modelNotes: [STELLAR_SPIN_LINE],
    sheetNotes: [
      GAIA_DR4,
      'The size of the star’s orbit on the sky implies a parallax about 2 % smaller than Gaia’s; the system is placed at the published 1,160 pc.',
    ],
    refs: ['ElBadry2023b'],
    fallAllowed: false,
    orbitLine: true,
  },
  {
    id: 'gaia-bh3',
    name: 'Gaia BH3',
    aliases: ['Gaia BH 3', 'Gaia DR3 4318465066420528000', 'LS II +14 13'],
    class: 'stellar',
    placement: 'binary',
    constellation: 'Aquila',
    mass: { value: 32.7, unc: 0.82, ref: 'GaiaBH3' },
    spin: { value: null, status: 'unknown', note: 'Not measured: it takes in no gas, so no X-rays show its spin.' },
    facts: [
      {
        text: 'At 32.7 solar masses the most massive stellar black hole known in the Milky Way, 590 parsecs (1,930 light-years) away in Aquila.',
        source: 'https://doi.org/10.1051/0004-6361/202449763',
        label: 'Gaia Collaboration 2024',
      },
      {
        text: 'Its companion is an old giant star with 1/360 of the Sun’s iron, on an 11.6-year orbit that swings it from 4.5 to 29 au of the hole.',
        source: 'https://doi.org/10.1051/0004-6361/202449763',
        label: 'Gaia Collaboration 2024',
      },
    ],
    modelNotes: [STELLAR_SPIN_LINE],
    sheetNotes: [GAIA_DR4],
    refs: ['GaiaBH3'],
    fallAllowed: false,
    orbitLine: true,
  },
  {
    id: 'cyg-x-1',
    name: 'Cygnus X-1',
    shortName: 'Cyg X-1',
    aliases: ['Cyg X-1', 'Cygnus X1'],
    class: 'stellar',
    placement: 'binary',
    constellation: 'Cygnus',
    mass: { value: 21.2, unc: 2.2, ref: 'MillerJones2021' },
    massNote: '12.7–17.8, depending on the tilt of the orbit, in a 2025 re-analysis of its companion (Ramachandran et al. 2025)',
    spin: {
      value: 0.9985,
      status: 'estimated',
      note: 'Claimed above 0.9985 of the maximum from its X-ray spectrum (continuum fitting), assuming the spin is aligned with the orbit (Miller-Jones et al. 2021); drawn without.',
      ref: 'MillerJones2021',
    },
    facts: [
      {
        text: 'The first X-ray source to be taken for a black hole (1972): the blue supergiant HDE 226868 circles a heavy companion that gives off no light every 5.6 days.',
        source: 'https://doi.org/10.1038/235271b0',
        label: 'Bolton 1972',
      },
      {
        text: 'Radio parallax puts it 2.22 kiloparsecs (7,200 light-years) away, which makes the hole 21 times the Sun’s mass and its companion about 41.',
        source: 'https://doi.org/10.1126/science.abb3363',
        label: 'Miller-Jones et al. 2021',
      },
    ],
    modelNotes: [
      'Drawn without spin (Schwarzschild), though it is claimed to spin at over 99.8 % of the maximum: its disc would then reach about five times closer in, and its shadow be up to 12 % narrower.',
      'Its disc is a model: a thin Novikov–Thorne disc at 2 % of its Eddington luminosity, in the orbit’s plane, turning 1,000 times slower than real; its swirls are illustrative.',
      'The orientation of its orbit on the sky is assumed: taken from the direction of its jet.',
    ],
    sheetNotes: [
      'Its jet and its companion’s wind are not drawn. The disc is drawn as a blackbody ring by ring, without the corona that makes its hard X-rays and without the hardening of its spectrum (about 1.6 times the temperature in X-rays), out to 10¹¹ cm (a model choice within the tidal limit); the light-travel time across it is left out of its turning pattern.',
    ],
    disk: {
      model: 'novikov-thorne',
      eddingtonFraction: { value: 0.02, unc: [0, 0.01], ref: 'ZhaoGou2021', note: 'the thermal disc’s bolometric luminosity, 0.02–0.03 of Eddington over six soft-state spectra' },
      lEddErgS: { value: 2.8e39, ref: 'ZhaoGou2021', note: 'for 21.2 M☉' },
      rOutCm: { value: 1e11, ref: 'Palit2020', note: 'a model choice: the scale its wind-fed flow is modelled out to, within the tidal limit for its disc (Paczyński 1977)' },
      plane: 'orbit',
      slowdown: 1000,
      refs: ['ZhaoGou2021', 'NovikovThorne1973', 'PageThorne1974', 'Luminet1979', 'Paczynski1977', 'Palit2020'],
    },
    refs: ['MillerJones2021', 'Brocksopp1999', 'Gies2003', 'Ramachandran2025', 'Bolton1972', 'ZhaoGou2021'],
    fallAllowed: false,
    orbitLine: true,
  },
  {
    id: 'v404-cygni',
    name: 'V404 Cygni',
    aliases: ['V404 Cyg', 'GS 2023+338'],
    class: 'stellar',
    placement: 'binary',
    constellation: 'Cygnus',
    mass: { value: 9.0, unc: [0.6, 0.2], ref: 'Khargharia2010' },
    spin: { value: null, status: 'unknown', note: 'Not used: estimates from its X-ray spectrum depend on models.' },
    facts: [
      {
        text: 'An X-ray binary that flares up every few decades (1938, 1989, 2015) as gas from its orange giant companion floods onto the hole. At 2.39 kiloparsecs (7,800 light-years) it was the first black hole whose distance was measured by parallax.',
        source: 'https://arxiv.org/abs/0910.5253',
        label: 'Miller-Jones et al. 2009',
      },
    ],
    modelNotes: [STELLAR_SPIN_LINE, XRB_ORIENTATION_LINE, XRB_GAS_LINE],
    sheetNotes: [
      'The third star, of about 1.2 solar masses, that orbits the pair at least 3,500 au out is not drawn (Burdge et al. 2024).',
      'Its companion’s radius is that of its Roche lobe (Eggleton 1983), which it fills.',
    ],
    refs: ['Khargharia2010', 'Casares2019', 'CasaresCharles1994', 'MillerJones2009', 'Burdge2024'],
    fallAllowed: false,
    orbitLine: true,
  },
  {
    id: 'a0620-00',
    name: 'A0620-00',
    aliases: ['V616 Monocerotis', 'V616 Mon', 'Nova Monocerotis 1975'],
    class: 'stellar',
    placement: 'binary',
    constellation: 'Monoceros',
    mass: { value: 6.61, unc: [0.17, 0.23], ref: 'GonzalezHernandez2014' },
    massNote: '5.86 ± 0.24 with another model of its light curve (van Grunsven et al. 2017)',
    spin: { value: null, status: 'unknown', note: 'Not used: estimates from its X-ray spectrum depend on models.' },
    facts: [
      {
        text: 'The nearest black hole in an X-ray binary, 1,060 parsecs (3,500 light-years) away in Monoceros; in 1975 it flared up as one of the brightest X-ray sources in the sky.',
        source: 'https://arxiv.org/abs/1001.0261',
        label: 'Cantrell et al. 2010',
      },
      {
        text: 'Its orange dwarf companion circles it every 7.75 hours, moving 435 km/s along our line of sight.',
        source: 'https://arxiv.org/abs/1311.5412',
        label: 'González Hernández et al. 2014',
      },
    ],
    modelNotes: [STELLAR_SPIN_LINE, XRB_ORIENTATION_LINE, XRB_GAS_LINE],
    refs: ['GonzalezHernandez2014', 'GonzalezHernandez2010', 'Cantrell2010'],
    fallAllowed: false,
    orbitLine: true,
  },
  {
    id: 'maxi-j1820',
    name: 'MAXI J1820+070',
    aliases: ['MAXI J1820', 'ASASSN-18ey'],
    class: 'stellar',
    placement: 'binary',
    constellation: 'Ophiuchus',
    mass: { value: 8.48, unc: [0.72, 0.79], ref: 'Torres2020' },
    massNote: '5.7–8.3 if its orbit is tilted 66–81° rather than along its jet (Torres et al. 2020)',
    spin: { value: null, status: 'unknown', note: 'Not used: estimates from its X-ray spectrum depend on models.' },
    facts: [
      {
        text: 'Found in 2018 when it burst out in X-rays, one of the brightest X-ray novae seen; its companion circles the hole every 16.5 hours, 2.96 kiloparsecs (9,700 light-years) away.',
        source: 'https://arxiv.org/abs/1907.00938',
        label: 'Torres et al. 2019',
      },
    ],
    modelNotes: [STELLAR_SPIN_LINE, XRB_ORIENTATION_LINE, 'Its disc of gas, pulled off its companion, and its jet are not drawn: between outbursts the disc is faint, cool and far from the hole.'],
    refs: ['Torres2019', 'Torres2020', 'Atri2020', 'Mikolajewska2022'],
    fallAllowed: false,
    orbitLine: true,
  },
  {
    id: 'xte-j1118',
    name: 'XTE J1118+480',
    aliases: ['XTE J1118', 'KV Ursae Majoris', 'KV UMa'],
    class: 'stellar',
    placement: 'binary',
    constellation: 'Ursa Major',
    mass: { value: 7.46, unc: [0.69, 0.34], ref: 'GonzalezHernandez2014' },
    spin: { value: null, status: 'unknown', note: 'Not used: estimates from its X-ray spectrum depend on models.' },
    facts: [
      {
        text: 'A black hole far out of the Galaxy’s disc, about 1.5 kiloparsecs above it, with a small cool star circling it every 4 hours 5 minutes; 1.72 kiloparsecs (5,600 light-years) away.',
        source: 'https://arxiv.org/abs/1311.5412',
        label: 'González Hernández et al. 2014',
      },
    ],
    modelNotes: [STELLAR_SPIN_LINE, XRB_ORIENTATION_LINE, XRB_GAS_LINE],
    refs: ['GonzalezHernandez2014', 'GonzalezHernandez2008', 'Gelino2006'],
    fallAllowed: false,
    orbitLine: true,
  },
  {
    id: 'ogle-2011-blg-0462',
    name: 'OGLE-2011-BLG-0462',
    aliases: ['MOA-2011-BLG-191', 'OGLE-2011-BLG-0462L', 'lone black hole', 'isolated black hole'],
    class: 'stellar',
    placement: 'isolated',
    constellation: 'Sagittarius',
    astrometry: {
      raDeg: 267.91729167,
      decDeg: -29.89059722,
      epochJyr: 2011.5,
      distancePc: { value: 1520, unc: 150, ref: 'Sahu2025' },
      positionNote: 'Where its lensing event was seen in 2011 (SIMBAD), to about 0.1″',
    },
    mass: { value: 7.15, unc: 0.83, ref: 'Sahu2025' },
    massNote: '7.1 ± 1.3 in the discovery paper (Sahu et al. 2022); another analysis of the same event found 1.6–4.4 (Lam et al. 2022)',
    spin: { value: null, status: 'unknown', note: 'Not measured: nothing but its lensing is seen.' },
    facts: [
      {
        text: 'The only black hole known with no companion: found because in 2011 it passed in front of a far star, whose light it bent and brightened for months, while Hubble saw that star’s image shift.',
        source: 'https://doi.org/10.3847/1538-4357/ac739e',
        label: 'Sahu et al. 2022',
      },
      {
        text: '7.15 times the Sun’s mass, 1.52 kiloparsecs (5,000 light-years) away, drifting at about 51 km/s past the stars around it.',
        source: 'https://arxiv.org/abs/2503.07820',
        label: 'Sahu et al. 2025',
      },
    ],
    modelNotes: [STELLAR_SPIN_LINE, 'Its position is known to about 0.1″ (150 au at its distance), and its motion is not followed.'],
    sheetNotes: ['Its mass was disputed: 7.1 ± 1.3 M☉ (Sahu et al. 2022) against 1.6–4.4 (Lam et al. 2022); the newer data give 7.15 ± 0.83 (Sahu et al. 2025).'],
    refs: ['Sahu2025', 'Sahu2022', 'Lam2022'],
    fallAllowed: false,
    orbitLine: false,
  },
];

// ─── The binaries ────────────────────────────────────────────────────────────────────────────────────────────────
// Each: the barycentre's astrometry at the adopted distance, the companion star, and the published orbit.
//  kind 'full': Campbell elements (P, e, i, Omega, omega of the star, periastron time) as published.
//  kind 'xrb':  an X-ray binary's ephemeris (P, T0 = the donor's inferior conjunction) and |i|: e = 0, omega_star =
//               90 deg, Omega = 0 (north), i < 90 deg (anticlockwise), all assumed.

const XRB_ASSUMED = ['Ω, the orientation on the sky: drawn with the node due north', 'the sense of revolution: drawn anticlockwise', 'a circular orbit (e = 0)'];

/**
 * The first periastron (JD) after the conjunction T0 at which the star is exactly in front of the hole (ω★ + ν =
 * 270°: nearest to us), for an orbit of period P (days), eccentricity e and the star's argument of periastron ω★ (deg).
 */
function periastronAfterConjunction(T0, P, e, omegaStarDeg) {
  const nu = ((270 - omegaStarDeg) * DEG + 2 * Math.PI) % (2 * Math.PI);
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  const M = E - e * Math.sin(E);
  // The mean anomaly at T0, as a fraction of the orbit in [0, 1): the next periastron is (1 − that) P later.
  const f = (((M / (2 * Math.PI)) % 1) + 1) % 1;
  return T0 + ((1 - f) % 1) * P;
}
/** Cygnus X-1's periastron: its conjunction (Brocksopp et al. 1999) with Miller-Jones et al. 2021's ω★ and e. */
const CYG_X1_T0_JD = 2441874.707;
const CYG_X1_P_D = 5.599829;
const CYG_X1_PERI_JD = periastronAfterConjunction(CYG_X1_T0_JD, CYG_X1_P_D, 0.0189, 305);

const SYSTEMS = [
  {
    id: 'gaia-bh1-system',
    name: 'Gaia BH1 system',
    hole: 'gaia-bh1',
    astrometry: { raDeg: 262.17120816, decDeg: -0.58109202, epochJyr: 2016.0, pmRaMasYr: -7.7, pmDecMasYr: -25.85, rvKms: 48.379 },
    distance: { value: 480, unc: 5, ref: 'ElBadry2023a', note: 'Gaia DR3 orbital-solution parallax 2.09 ± 0.02 mas' },
    astrometryRefs: ['ElBadry2023a', 'Nagarajan2024'],
    star: {
      id: 'gaia-bh1-star',
      name: 'Gaia BH1’s star',
      aliases: ['2MASS J17284110-0034514'],
      designations: ['Gaia DR3 4373465352415301632', '2MASS J17284110−0034514'],
      catalogueIndex: null,
      spectralType: 'G V',
      kindText: 'Sun-like star',
      massMsun: { value: 0.93, unc: 0.05, ref: 'ElBadry2023a' },
      radiusRsun: { value: 0.99, unc: 0.05, ref: 'ElBadry2023a' },
      teffK: { value: 5850, unc: 50, ref: 'ElBadry2023a' },
      luminosityLsun: { value: 1.06, unc: 0.04, ref: 'ElBadry2023a' },
      gMag: { value: 13.77, ref: 'ElBadry2023a', note: 'E(B−V) = 0.30' },
    },
    orbit: {
      kind: 'full',
      periodDays: { value: 185.387, unc: 0.003, ref: 'Nagarajan2024' },
      e: { value: 0.4323, unc: 0.00002, ref: 'Nagarajan2024' },
      iDeg: { value: 126.6, unc: 0.4, ref: 'ElBadry2023a' },
      OmegaDeg: { value: 97.8, unc: 1.0, ref: 'ElBadry2023a' },
      omegaStarDeg: { value: 16.509, unc: 0.003, ref: 'Nagarajan2024' },
      tPeriJD: { value: 2457391.07, unc: 0.04, ref: 'Nagarajan2024' },
      publishedAAu: { value: 1.4, unc: 0.01, ref: 'ElBadry2023a', note: 'with the discovery paper’s 9.62 M☉ and 185.59 d' },
      publishedA0Mas: { value: 2.67, unc: 0.02, ref: 'ElBadry2023a' },
      KstarKms: { value: 65.3785, unc: 0.0009, ref: 'Nagarajan2024' },
    },
  },
  {
    id: 'gaia-bh2-system',
    name: 'Gaia BH2 system',
    hole: 'gaia-bh2',
    astrometry: { raDeg: 207.56971624, decDeg: -59.239005, epochJyr: 2016.0, pmRaMasYr: -10.48, pmDecMasYr: -4.61, rvKms: -4.22 },
    distance: { value: 1160, unc: 20, ref: 'ElBadry2023b', note: 'Gaia DR3 orbital-solution parallax 0.859 ± 0.018 mas' },
    astrometryRefs: ['ElBadry2023b'],
    star: {
      id: 'gaia-bh2-star',
      name: 'Gaia BH2’s star',
      aliases: ['2MASS J13501675-5914203'],
      designations: ['Gaia DR3 5870569352746779008', '2MASS J13501675−5914203'],
      catalogueIndex: null,
      spectralType: 'lower red-giant branch',
      kindText: 'Red giant',
      massMsun: { value: 1.07, unc: 0.19, ref: 'ElBadry2023b' },
      radiusRsun: { value: 7.77, unc: 0.25, ref: 'ElBadry2023b' },
      teffK: { value: 4604, unc: 87, ref: 'ElBadry2023b' },
      luminosityLsun: { value: 24.6, unc: 1.6, ref: 'ElBadry2023b' },
      vMag: { value: 12.71, ref: 'SIMBAD' },
    },
    orbit: {
      kind: 'full',
      periodDays: { value: 1276.7, unc: 0.6, ref: 'ElBadry2023b' },
      e: { value: 0.5176, unc: 0.0009, ref: 'ElBadry2023b' },
      iDeg: { value: 34.87, unc: 0.34, ref: 'ElBadry2023b' },
      OmegaDeg: { value: 266.9, unc: 0.5, ref: 'ElBadry2023b' },
      omegaStarDeg: { value: 130.9, unc: 0.4, ref: 'ElBadry2023b' },
      tPeriJD: { value: 2457438.3, unc: 1.4, ref: 'ElBadry2023b' },
      publishedAAu: { value: 4.96, unc: 0.08, ref: 'ElBadry2023b' },
      publishedA0Mas: { value: 3.719, unc: 0.014, ref: 'ElBadry2023b' },
      KstarKms: { value: 25.23, unc: 0.04, ref: 'ElBadry2023b' },
    },
  },
  {
    id: 'gaia-bh3-system',
    name: 'Gaia BH3 system',
    hole: 'gaia-bh3',
    astrometry: { raDeg: 294.8278502301, decDeg: 14.9309190869, epochJyr: 2017.5, pmRaMasYr: -28.317, pmDecMasYr: -155.221, rvKms: -357.31 },
    distance: { value: 590.6, unc: 5.8, ref: 'GaiaBH3', note: 'parallax 1.6933 ± 0.0164 mas (a₀/a₁)' },
    astrometryRefs: ['GaiaBH3'],
    star: {
      id: 'gaia-bh3-star',
      name: 'Gaia BH3’s star',
      aliases: ['2MASS J19391872+1455542'],
      designations: ['Gaia DR3 4318465066420528000', 'LS II +14 13', '2MASS J19391872+1455542'],
      catalogueIndex: null,
      spectralType: 'metal-poor giant',
      kindText: 'Metal-poor giant',
      massMsun: { value: 0.76, unc: 0.05, ref: 'GaiaBH3' },
      radiusRsun: { value: 4.936, unc: 0.016, ref: 'GaiaBH3' },
      teffK: { value: 5212, unc: 80, ref: 'GaiaBH3' },
      luminosityLsun: { value: 16.1, unc: 1.1, ref: 'GaiaBH3', note: 'log L = 1.208 ± 0.030' },
      gMag: { value: 11.23, ref: 'GaiaBH3', note: 'A₀ = 0.71' },
    },
    orbit: {
      kind: 'full',
      periodDays: { value: 4253.1, unc: 98.5, ref: 'GaiaBH3' },
      e: { value: 0.7291, unc: 0.0048, ref: 'GaiaBH3' },
      iDeg: { value: 110.58, unc: 0.095, ref: 'GaiaBH3' },
      OmegaDeg: { value: 136.236, unc: 0.128, ref: 'GaiaBH3' },
      omegaStarDeg: { value: 77.34, unc: 0.76, ref: 'GaiaBH3', note: 'the (ω, Ω) pair checked against the published radial velocities' },
      tPeriJD: { value: 2458177.39, unc: 0.88, ref: 'GaiaBH3' },
      publishedA0Mas: { value: 27.39, unc: 0.49, ref: 'GaiaBH3' },
      publishedA1Au: { value: 16.17, unc: 0.27, ref: 'GaiaBH3' },
    },
  },
  {
    id: 'cyg-x-1-system',
    name: 'Cygnus X-1 system',
    hole: 'cyg-x-1',
    // The black hole's radio core (VLBA); it moves 0.16 au (0.07 mas) about the barycentre.
    astrometry: { raDeg: 299.59029908, decDeg: 35.20158486, epochJyr: mjdToJy(56198.0), pmRaMasYr: -3.804, pmDecMasYr: -6.283, rvKms: -7.0 },
    distance: { value: 2220, unc: [170, 180], ref: 'MillerJones2021', note: 'VLBA parallax 0.458 ± 0.035 mas' },
    astrometryRefs: ['MillerJones2021', 'Gies2003'],
    rvNote: 'Gies et al. 2003: V0 = −7.0 ± 0.5 km/s from He I 6678, which they note is probably a little below the true systemic velocity',
    star: {
      id: 'hde-226868',
      name: 'HDE 226868',
      aliases: ['V1357 Cyg', 'V1357 Cygni', 'HD 226868', 'HIP 98298'],
      designations: ['HDE 226868', 'V1357 Cyg', 'HIP 98298', 'Gaia DR3 2059383668236814720'],
      catalogueIndex: 111021,
      spectralType: 'O9.7 Iab',
      kindText: 'Blue supergiant, Cygnus X-1’s companion',
      massMsun: { value: 40.6, unc: [7.1, 7.7], ref: 'MillerJones2021' },
      radiusRsun: { value: 22.3, unc: [1.7, 1.8], ref: 'MillerJones2021' },
      teffK: { value: 31138, unc: [740, 702], ref: 'MillerJones2021' },
      luminosityLsun: { value: 421700, ref: 'MillerJones2021', note: 'log L = 5.625 (+0.073 −0.078)' },
      vMag: { value: 8.91, ref: 'SIMBAD' },
    },
    orbit: {
      kind: 'full',
      periodDays: { value: 5.599829, unc: 0.000016, ref: 'Brocksopp1999' },
      e: { value: 0.0189, unc: [0.0026, 0.0028], ref: 'MillerJones2021' },
      iDeg: { value: 152.9, unc: 0.7, ref: 'MillerJones2021', note: 'astrometric (clockwise); 27.5° from the optical light curve' },
      OmegaDeg: { value: 64.1, unc: 1.0, ref: 'MillerJones2021', note: 'assumed: the jet’s position angle, taking the jet along the orbit’s axis' },
      omegaStarDeg: { value: 305, unc: 5, ref: 'MillerJones2021', note: 'the astrometric ω of the black hole, 125 ± 5°, plus 180°; the optical fit gives 306.6°' },
      tPeriJD: {
        value: Number(CYG_X1_PERI_JD.toFixed(4)),
        ref: 'MillerJones2021',
        note: `T0 + ${((CYG_X1_PERI_JD - CYG_X1_T0_JD) / CYG_X1_P_D).toFixed(3)} P, derived: the periastron that puts the O star exactly in front of the hole at Brocksopp et al. 1999’s conjunction (JD 2441874.707) with ω★ = 305° and e = 0.0189`,
      },
      T0JD: { value: 2441874.707, unc: 0.009, ref: 'Brocksopp1999', note: 'superior conjunction of the black hole: the O star in front' },
      publishedAAu: { value: 0.244, unc: 0.012, ref: 'MillerJones2021' },
      KstarKms: { value: 75.21, unc: [0.41, 0.42], ref: 'MillerJones2021' },
    },
    assumed: ['Ω, the orientation on the sky: taken from the direction of its jet'],
  },
  {
    id: 'v404-cygni-system',
    name: 'V404 Cygni system',
    hole: 'v404-cygni',
    astrometry: { raDeg: 306.01592263, decDeg: 33.86719482, epochJyr: mjdToJy(54322.0), pmRaMasYr: -5.04, pmDecMasYr: -7.64, rvKms: -2.0 },
    distance: { value: 2390, unc: 140, ref: 'MillerJones2009', note: 'VLBA parallax 0.418 ± 0.024 mas' },
    astrometryRefs: ['MillerJones2009', 'Casares2019'],
    star: {
      id: 'v404-cygni-star',
      name: 'V404 Cygni’s star',
      aliases: ['Gaia DR3 2056188624872569088'],
      designations: ['Gaia DR3 2056188624872569088', '2MASS J20240382+3352021'],
      catalogueIndex: null,
      spectralType: 'K3 III',
      kindText: 'Orange giant',
      massMsun: { value: 0.54, ref: 'Khargharia2010', note: 'q × M_BH = 0.060 × 9.0 (Casares & Charles 1994)' },
      radiusRsun: { value: null, ref: 'Eggleton1983', note: 'the Roche lobe’s radius, computed below' },
      teffK: { value: 4300, ref: 'Khargharia2010', note: 'the light-curve model’s value (4,200–4,600 K)' },
      gMag: { value: 17.22, ref: 'SIMBAD' },
      estimated: ['radius: its Roche lobe’s (Eggleton 1983)'],
    },
    orbit: {
      kind: 'xrb',
      periodDays: { value: 6.47117, unc: 0.000002, ref: 'Casares2019' },
      T0JD: { value: 2457200.514, unc: 0.002, ref: 'Casares2019', note: 'HJD of the donor’s inferior conjunction' },
      iDeg: { value: 67, unc: [1, 3], ref: 'Khargharia2010' },
      KstarKms: { value: 208.4, unc: 0.5, ref: 'Casares2019' },
      q: { value: 0.06, unc: [0.005, 0.004], ref: 'CasaresCharles1994' },
    },
    assumed: XRB_ASSUMED,
  },
  {
    id: 'a0620-00-system',
    name: 'A0620-00 system',
    hole: 'a0620-00',
    astrometry: { raDeg: 95.68559327, decDeg: -0.34563624, epochJyr: 2000.0, pmRaMasYr: -0.439, pmDecMasYr: -5.138, rvKms: 8.5 },
    distance: { value: 1060, unc: 120, ref: 'Cantrell2010', note: 'from its light-curve model; Gaia DR3’s parallax, 0.70 ± 0.12 mas, agrees within 2σ' },
    astrometryRefs: ['GaiaDR3', 'GonzalezHernandez2010'],
    star: {
      id: 'a0620-00-star',
      name: 'A0620-00’s star',
      aliases: ['Gaia DR3 3118721026600835328'],
      designations: ['Gaia DR3 3118721026600835328', '2MASS J06224454−0020442'],
      catalogueIndex: null,
      spectralType: 'K5 V',
      kindText: 'Orange dwarf',
      massMsun: { value: 0.4, unc: 0.01, ref: 'GonzalezHernandez2014' },
      radiusRsun: { value: 0.67, unc: 0.02, ref: 'GonzalezHernandez2014' },
      teffK: { value: 4600, ref: 'Cantrell2010', note: 'the value adopted in its light-curve model' },
      gMag: { value: 17.47, ref: 'SIMBAD' },
    },
    orbit: {
      kind: 'xrb',
      periodDays: { value: 0.32301415, unc: 0.00000007, ref: 'GonzalezHernandez2014' },
      T0JD: { value: 2446082.6671, unc: 0.0005, ref: 'GonzalezHernandez2014', note: 'HJD of the donor’s inferior conjunction' },
      iDeg: { value: 51.0, unc: 0.9, ref: 'Cantrell2010' },
      KstarKms: { value: 435.4, unc: 0.5, ref: 'GonzalezHernandez2014' },
      publishedAAu: { value: 0.01763, unc: 0.00019, ref: 'GonzalezHernandez2014', note: '3.79 ± 0.04 R☉' },
    },
    assumed: XRB_ASSUMED,
  },
  {
    id: 'maxi-j1820-system',
    name: 'MAXI J1820+070 system',
    hole: 'maxi-j1820',
    astrometry: { raDeg: 275.09142659, decDeg: 7.18535691, epochJyr: 2000.0, pmRaMasYr: -3.093, pmDecMasYr: -6.286, rvKms: -21.6 },
    distance: { value: 2960, unc: 330, ref: 'Atri2020', note: 'from its radio parallax, 0.348 ± 0.033 mas' },
    astrometryRefs: ['GaiaDR3', 'Atri2020', 'Torres2019'],
    star: {
      id: 'maxi-j1820-star',
      name: 'MAXI J1820+070’s star',
      aliases: ['Gaia DR3 4477902563164690816'],
      designations: ['Gaia DR3 4477902563164690816', '2MASS J18202194+0711073'],
      catalogueIndex: null,
      spectralType: 'K3–5 IV',
      kindText: 'Subgiant',
      massMsun: { value: 0.49, unc: 0.1, ref: 'Mikolajewska2022' },
      radiusRsun: { value: 1.19, unc: 0.08, ref: 'Mikolajewska2022' },
      teffK: { value: 4350, unc: 150, ref: 'Mikolajewska2022', note: 'above 4,200 K, about 4,200–4,500 K' },
      gMag: { value: 17.39, ref: 'SIMBAD' },
    },
    orbit: {
      kind: 'xrb',
      periodDays: { value: 0.68549, unc: 0.00001, ref: 'Torres2019' },
      T0JD: { value: 2458540.043, unc: 0.002, ref: 'Torres2019', note: 'HJD of the donor’s closest approach to us' },
      iDeg: { value: 63, unc: 3, ref: 'Atri2020', note: 'its jet’s inclination' },
      KstarKms: { value: 417.7, unc: 3.9, ref: 'Torres2019' },
      q: { value: 0.072, unc: 0.012, ref: 'Torres2020' },
    },
    assumed: XRB_ASSUMED,
  },
  {
    id: 'xte-j1118-system',
    name: 'XTE J1118+480 system',
    hole: 'xte-j1118',
    astrometry: { raDeg: 169.54497101, decDeg: 48.03675409, epochJyr: 2000.0, pmRaMasYr: -18.105, pmDecMasYr: -6.687, rvKms: 2.7 },
    distance: { value: 1720, unc: 100, ref: 'Gelino2006', note: 'from its companion’s infrared light and a model of its light curve' },
    astrometryRefs: ['GaiaDR3', 'GonzalezHernandez2008'],
    star: {
      id: 'xte-j1118-star',
      name: 'XTE J1118+480’s star',
      aliases: ['Gaia DR3 789430249033567744'],
      designations: ['Gaia DR3 789430249033567744', '2MASS J11181079+4802126'],
      catalogueIndex: null,
      spectralType: 'K7–M1 V',
      kindText: 'Red dwarf',
      massMsun: { value: 0.18, unc: 0.06, ref: 'GonzalezHernandez2014' },
      radiusRsun: { value: 0.34, unc: 0.05, ref: 'GonzalezHernandez2014' },
      teffK: { value: 4000, ref: 'PecautMamajek2013', note: 'estimated for a K7–M1 dwarf; not measured' },
      gMag: { value: 19.31, ref: 'SIMBAD' },
      estimated: ['temperature: about 4,000 K for its spectral type (Pecaut & Mamajek 2013), not measured'],
    },
    orbit: {
      kind: 'xrb',
      periodDays: { value: 0.16993404, unc: 0.00000005, ref: 'GonzalezHernandez2014' },
      T0JD: { value: 2451868.8921, unc: 0.0002, ref: 'GonzalezHernandez2014', note: 'HJD of the donor’s inferior conjunction' },
      iDeg: { value: 73.5, unc: 5.5, ref: 'GonzalezHernandez2014' },
      KstarKms: { value: 708.8, unc: 1.4, ref: 'GonzalezHernandez2014' },
      publishedAAu: { value: 0.01181, unc: 0.00028, ref: 'GonzalezHernandez2014', note: '2.54 ± 0.06 R☉' },
    },
    assumed: XRB_ASSUMED,
  },
];

// ─── The second table: scripts/blackholes-more.mjs ───────────────────────────────────────────────────────────────

for (const [k, v] of Object.entries(MORE.REFS)) {
  if (REFS[k] && REFS[k] !== v) throw new Error(`reference ${k} defined twice, differently`);
  REFS[k] = v;
}
HOLES.push(...MORE.HOLES);
const MORE_IDS = new Set(MORE.SYSTEMS.map((S) => S.id));
SYSTEMS.push(...MORE.SYSTEMS);

// ─── Build ───────────────────────────────────────────────────────────────────────────────────────────────────────

const R_SUN_AU = 695700 / AU_KM;
const r = (x, digits) => Number(x.toPrecision(digits));
const holeById = new Map(HOLES.map((h) => [h.id, h]));
const log = [];
const say = (s) => {
  log.push(s);
  console.log(s);
};

function buildSystem(S) {
  const hole = holeById.get(S.hole);
  if (!hole) throw new Error(`${S.id}: no hole ${S.hole}`);
  const mBh = hole.mass.value;
  const mStar = S.star.massMsun.value;
  const checks = [];

  // Barycentre at J2000 (the astrometry at the adopted distance, carried along its straight line).
  const astro = { ...S.astrometry, parallaxMas: 1000 / S.distance.value };
  const at = stateFromAstrometry(astro);
  const j2000 = propagate(at, 2000 - S.astrometry.epochJyr);
  const posPc = eqToEcl(j2000.pos);
  const velKms = eqToEcl(j2000.vel);
  const dirPc = norm(j2000.pos);
  const raDeg = ((Math.atan2(j2000.pos[1], j2000.pos[0]) / DEG) % 360 + 360) % 360;
  const decDeg = Math.asin(j2000.pos[2] / dirPc) / DEG;

  // The orbit.
  const o = S.orbit;
  const P = o.periodDays.value;
  const full = o.kind === 'full';
  const e = full ? o.e.value : 0;
  const iDeg = o.iDeg.value;
  const OmegaDeg = full ? o.OmegaDeg.value : 0;
  const omegaDeg = full ? o.omegaStarDeg.value : 90;
  // An X-ray binary with no ephemeris used for its phase: the donor nearest to us at J2000.0 (assumed, labelled).
  const phaseAssumed = !full && !o.T0JD;
  const T0 = full ? null : phaseAssumed ? JD_J2000 : o.T0JD.value;
  const tPeriJD = full ? o.tPeriJD.value : T0 - P / 2;
  const aAu = keplerAu(mBh + mStar, P);
  const basis = campbellBasis({ iDeg, OmegaDeg, omegaDeg }, raDeg, decDeg);
  const orbitIcrs = { aAu, e, periodDays: P, tPeriJD, P: basis.P, Q: basis.Q };
  const pHat = eqToEcl(basis.P);
  const qHat = eqToEcl(basis.Q);
  if (Math.abs(norm(pHat) - 1) > 1e-12 || Math.abs(dot(pHat, qHat)) > 1e-12) throw new Error(`${S.id}: pHat/qHat not orthonormal`);

  // Checks.
  const aStarAu = (aAu * mBh) / (mBh + mStar);
  checks.push(`Kepler's third law with ${mBh} + ${mStar} M☉ and P = ${P} d: a = ${aAu.toFixed(5)} au (the star's orbit ${aStarAu.toFixed(5)} au, the black hole's ${(aAu - aStarAu).toFixed(5)} au)`);
  if (o.publishedAAu) checks.push(`published a = ${o.publishedAAu.value} ± ${o.publishedAAu.unc} au${o.publishedAAu.note ? ` (${o.publishedAAu.note})` : ''}`);
  if (o.publishedA1Au) checks.push(`published a₁ (the star about the barycentre) = ${o.publishedA1Au.value} ± ${o.publishedA1Au.unc} au`);
  if (o.publishedA0Mas) {
    const plx = 1000 / S.distance.value;
    checks.push(`the star's orbit on the sky at ${S.distance.value} pc: ${(aStarAu * plx).toFixed(3)} mas (published photocentre a₀ = ${o.publishedA0Mas.value} ± ${o.publishedA0Mas.unc} mas)`);
  }
  if (o.KstarKms) {
    const kModel = (2 * Math.PI * aStarAu * AU_KM * Math.sin(iDeg * DEG)) / (P * 86400 * Math.sqrt(1 - e * e));
    checks.push(`the star's radial-velocity semi-amplitude from this orbit: ${kModel.toFixed(2)} km/s (published K = ${o.KstarKms.value} km/s)`);
  }
  const away = basis.s;
  const awayAt = (jd) => dot(orbitState(orbitIcrs, jd).pos, away);
  const rvAt = (jd) => dot(orbitState(orbitIcrs, jd).vel, away);
  if (!full) {
    const z = awayAt(T0);
    const dt = P * 1e-3;
    checks.push(
      `at ${phaseAssumed ? 'the assumed T0, J2000.0' : 'T0'} (JD ${T0}) the donor is ${(-z).toFixed(6)} au in front of the hole (a sin i = ${(aAu * Math.sin(iDeg * DEG)).toFixed(6)} au); its radial velocity goes from ${rvAt(T0 - dt).toFixed(2)} to ${rvAt(T0 + dt).toFixed(2)} km/s across it`,
    );
    if (!(Math.abs(z + aAu * Math.sin(iDeg * DEG)) < 1e-9 * aAu && rvAt(T0 - dt) < 0 && rvAt(T0 + dt) > 0)) throw new Error(`${S.id}: donor not in front at T0`);
  } else if (o.T0JD) {
    // Cygnus X-1: the O star in front at the conjunction of Brocksopp et al.
    const T0 = o.T0JD.value;
    const E = solveKepler(((2 * Math.PI) / P) * (T0 - tPeriJD), e);
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    const argLat = (((omegaDeg + nu / DEG) % 360) + 360) % 360;
    checks.push(`at the published conjunction (JD ${T0}) the star is at ω + ν = ${argLat.toFixed(1)}° (270°: exactly in front), ${(-awayAt(T0)).toFixed(4)} au nearer to us than the hole`);
    if (!(argLat > 250 && argLat < 290)) throw new Error(`${S.id}: the star is not in front at T0`);
  }

  // The companion: the Roche lobe's radius where none is published.
  const star = structuredClone(S.star);
  if (star.radiusRsun.value === null) {
    const q = mStar / mBh;
    const rl = eggleton(q) * aAu;
    star.radiusRsun = { value: r(rl / R_SUN_AU, 4), ref: 'Eggleton1983', note: `the Roche lobe of q = ${r(q, 3)} at a = ${aAu.toFixed(4)} au` };
    checks.push(`the donor fills its Roche lobe: R = ${(rl / R_SUN_AU).toFixed(2)} R☉ (Eggleton 1983)`);
  }
  // A disc drawn in the binary's plane must lie inside the hole's Roche lobe (Eggleton 1983, for q = M_BH / M_star).
  if (hole.disk) {
    const rlCm = eggleton(mBh / mStar) * aAu * AU_KM * 1e5;
    const rOut = hole.disk.rOutCm.value;
    // (said in the checks of the second table's systems; Cygnus X-1's are kept as they were)
    if (MORE_IDS.has(S.id))
      checks.push(`the disc's outer edge, ${rOut.toExponential(2)} cm, inside the hole's Roche lobe, ${rlCm.toExponential(2)} cm (Eggleton 1983)`);
    if (!(rOut < rlCm)) throw new Error(`${S.id}: the disc reaches beyond the hole's Roche lobe`);
  }
  for (const c of checks) say(`  ${S.id}: ${c}`);

  const published = full
    ? {
        kind: 'Campbell elements of the star about the black hole',
        periodDays: o.periodDays,
        e: o.e,
        iDeg: o.iDeg,
        OmegaDeg: o.OmegaDeg,
        omegaStarDeg: o.omegaStarDeg,
        tPeriJD: o.tPeriJD,
        ...(o.T0JD ? { T0JD: o.T0JD } : {}),
        ...(o.KstarKms ? { KstarKms: o.KstarKms } : {}),
        ...(o.publishedAAu ? { aAu: o.publishedAAu } : {}),
        ...(o.publishedA1Au ? { a1Au: o.publishedA1Au } : {}),
        ...(o.publishedA0Mas ? { a0Mas: o.publishedA0Mas } : {}),
      }
    : phaseAssumed
      ? {
          kind: 'period of the donor’s orbit (no ephemeris used for its phase)',
          periodDays: o.periodDays,
          iDeg: o.iDeg,
          ...(o.KstarKms ? { KstarKms: o.KstarKms } : {}),
          ...(o.q ? { q: o.q } : {}),
          rule: 'e = 0 and ω★ = 90° assumed; the donor put nearest to us at J2000.0 (JD 2451545.0), so tPeriJD = 2451545.0 − P/2; Ω = 0° (north) and i < 90° (anticlockwise) assumed',
        }
      : {
        kind: 'spectroscopic ephemeris of the donor (T0: its inferior conjunction)',
        periodDays: o.periodDays,
        T0JD: o.T0JD,
        iDeg: o.iDeg,
        ...(o.KstarKms ? { KstarKms: o.KstarKms } : {}),
        ...(o.q ? { q: o.q } : {}),
        ...(o.publishedAAu ? { aAu: o.publishedAAu } : {}),
        rule: 'e = 0 and ω★ = 90° assumed, so tPeriJD = T0 − P/2 (the donor nearest to us at T0); Ω = 0° (north) and i < 90° (anticlockwise) assumed',
      };

  const angles = anglesFromBasis(pHat, qHat);
  return {
    star,
    system: {
      id: S.id,
      name: S.name,
      members: [S.hole, S.star.id],
      barycentre: {
        astrometry: { raDeg: S.astrometry.raDeg, decDeg: S.astrometry.decDeg, epochJyr: r(S.astrometry.epochJyr, 8), parallaxMas: r(astro.parallaxMas, 6), pmRaMasYr: S.astrometry.pmRaMasYr, pmDecMasYr: S.astrometry.pmDecMasYr, rvKms: S.astrometry.rvKms },
        ...(S.rvNote ? { rvNote: S.rvNote } : {}),
        distance: S.distance,
        refs: S.astrometryRefs,
        posPc: posPc.map((x) => r(x, 12)),
        velKms: velKms.map((x) => r(x, 10)),
        distancePc: r(norm(posPc), 8),
        massMsun: r(mBh + mStar, 8),
      },
      ...(phaseAssumed ? { phaseAssumed: true } : {}),
      orbits: [
        {
          id: `${S.hole}-orbit`,
          primary: [S.hole],
          secondary: [S.star.id],
          massPrimaryMsun: mBh,
          massSecondaryMsun: mStar,
          aAu: r(aAu, 10),
          e,
          periodDays: P,
          tPeriJD,
          pHat: pHat.map((x) => r(x, 12)),
          qHat: qHat.map((x) => r(x, 12)),
          eclipticAngles: Object.fromEntries(Object.entries(angles).map(([k, v]) => [k, r(v, 8)])),
          source: full ? 'published orbit' : phaseAssumed ? 'published period, phase and orientation assumed' : 'published ephemeris, orientation assumed',
          published,
          assumed: S.assumed ?? [],
        },
      ],
      checks,
    },
  };
}

say('Black holes in binaries:');
const built = SYSTEMS.map(buildSystem);
const usedRefs = new Set();
const note = (k) => {
  if (!REFS[k]) throw new Error(`unknown reference ${k}`);
  usedRefs.add(k);
};
const walk = (x) => {
  if (Array.isArray(x)) x.forEach(walk);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) (k === 'ref' ? note(v) : k === 'refs' && Array.isArray(v) ? v.forEach(note) : walk(v));
};
// The galaxies of the NGC catalogue with a black hole at the centre: their place as the deep-sky layer has it.
const ngc = (() => {
  if (!HOLES.some((h) => h.placement === 'catalogue-galaxy')) return null;
  const f = JSON.parse(gunzipSync(readFileSync(NGC_GALAXIES)).toString('utf8'));
  const col = Object.fromEntries(f.columns.map((c, i) => [c, i]));
  return new Map(f.rows.map((row) => [row[col.name], (k) => row[col[k]]]));
})();
function catalogueGalaxy(h) {
  const g = ngc?.get(h.ngc);
  if (!g) throw new Error(`${h.id}: ${h.ngc} is not in ${NGC_GALAXIES}`);
  if (g('source') !== 'cf4') throw new Error(`${h.id}: ${h.ngc} has no Cosmicflows-4 distance`);
  const pos = [g('x'), g('y'), g('z')];
  const anchor = g('ax') === null ? pos : [g('ax'), g('ay'), g('az')];
  return {
    designation: h.ngc,
    name: h.hostName,
    aliases: g('aliases'),
    raDeg: g('raDeg'),
    decDeg: g('decDeg'),
    distMpc: g('distMpc'),
    distLoMpc: g('distLoMpc'),
    distHiMpc: g('distHiMpc'),
    methods: g('methods'),
    edm: g('edm'),
    posMpc: pos,
    anchorMpc: anchor,
  };
}
// The galaxies the app registers with the others, where it places them (Mpc from the Sun): named.json's and the Local
// Volume Database's positions.
const placedMpc = (() => {
  const out = new Map();
  const named = JSON.parse(readFileSync(join(ROOT, 'src', 'sim', 'cosmos', 'named.json'), 'utf8'));
  for (const o of named.objects) if (o.positionEclMpc) out.set(o.id, Math.hypot(...o.positionEclMpc));
  const local = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'public', 'data', 'local-galaxies.json.gz'))).toString('utf8'));
  for (const g of local.galaxies) if (!out.has(g.id.replace(/_/g, '-').toLowerCase())) out.set(g.id.replace(/_/g, '-').toLowerCase(), Math.hypot(...g.positionEclKpc) / 1000);
  return out;
})();

/** "1.43 × 10⁸": a mass in the first table's words. */
const sci = (x) => {
  const p = Math.floor(Math.log10(x));
  return `${Number((x / 10 ** p).toPrecision(3))} × 10${String(p).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`;
};

/**
 * A supermassive hole's mass at the distance its galaxy is placed at: a mass from motions seen on the sky (stars, gas,
 * masers) grows in proportion to the distance assumed, M ∝ D, so the published mass is scaled from the paper's distance
 * to the app's (as Kormendy & Ho 2013 scale theirs to their adopted distances).
 */
function scaledMass(h, dMpc) {
  const p = h.massPublished;
  const k = dMpc / p.distMpc;
  const s = (x) => Number((x * k).toPrecision(3));
  const unc = typeof p.unc === 'number' ? s(p.unc) : Array.isArray(p.unc) ? p.unc.map(s) : undefined;
  const note = `${sci(p.value)} M☉ at the ${p.distMpc} Mpc the paper assumed, scaled to the ${Number(dMpc.toPrecision(4))} Mpc its galaxy is placed at (a mass from motions grows with the distance assumed)`;
  say(`  ${h.id}: ${sci(p.value)} M☉ at ${p.distMpc} Mpc → ${sci(s(p.value))} M☉ at ${dMpc.toFixed(4)} Mpc`);
  return { value: s(p.value), ...(unc !== undefined ? { unc } : {}), ref: p.ref, note };
}

say('Black holes at the centres of galaxies:');
const holes = HOLES.map((h) => {
  if (h.placement === 'galaxy-centre' && h.massPublished) {
    const d = placedMpc.get(h.host);
    if (!d) throw new Error(`${h.id}: no placed distance for ${h.host}`);
    return { ...h, mass: scaledMass(h, d) };
  }
  if (h.placement !== 'catalogue-galaxy') return { ...h };
  const { ngc: _designation, ...rest } = h;
  const galaxy = catalogueGalaxy(h);
  say(`  ${h.id}: at the centre of ${h.ngc}, ${galaxy.distMpc} Mpc (Cosmicflows-4)`);
  return { ...rest, galaxy, mass: scaledMass(h, Math.hypot(...galaxy.posMpc)) };
});
walk(holes);
walk(built);

// The companions' catalogue indices that scripts/build-stars3d-ext.mjs filled in (stars pinned in the head): kept.
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
for (const b of built) {
  const old = previous?.companions?.find((c) => c.id === b.star.id);
  if (b.star.catalogueIndex === null && typeof old?.catalogueIndex === 'number') b.star.catalogueIndex = old.catalogueIndex;
}

const file = {
  format: 'lightspeed.black-holes',
  version: 1,
  generatedBy: 'scripts/build-blackholes.mjs',
  frame:
    'Positions: parsecs from the Sun, J2000 ecliptic axes (x to the J2000 equinox, z to the ecliptic north pole; ICRS rotated by the IAU 1976 obliquity 84381.448"). Velocities: km/s, same axes, heliocentric.',
  orbitModel:
    'As src/sim/stars/systems.json: the relative position of the star (group 2) about the black hole (group 1) is r = aAu*[(cos E - e) pHat + sqrt(1-e^2) sin E qHat], E - e sin E = 2 pi (JD - tPeriJD) / periodDays; the black hole moves by -m2/(m1+m2) r and the star by +m1/(m1+m2) r about their barycentre.',
  refs: Object.fromEntries(Object.entries(REFS).filter(([k]) => usedRefs.has(k))),
  holes,
  companions: built.map((b) => b.star),
  systems: built.map((b) => b.system),
};
writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
console.log(`wrote ${OUT}: ${holes.length} black holes, ${built.length} binaries, ${usedRefs.size} references`);
