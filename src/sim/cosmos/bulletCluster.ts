// The Bullet Cluster (1E 0657-56, z = 0.296) as Clowe et al. (2006, ApJ 648, L109) measured it: where its galaxies'
// brightest members, its hot gas and its mass are on the sky (docs/data/dark-matter.md §4). Pure; no three.js.
//
// Places are offsets on the sky from the cluster's catalogued place (named.json: SIMBAD's, 104.612°, −55.9725°),
// east and north in arcseconds, turned into kiloparsecs at the cluster with the angular-diameter distance of its
// redshift in the Planck 2018 cosmology the app uses (940.7 Mpc: 4.561 kpc per arcsecond; Clowe et al., with H0 = 70,
// Ωm = 0.3, use 4.413). Their Table 2 gives the brightest galaxy (BCG) and the peak of the X-ray gas of each cluster,
// with the mean convergence κ (the lensing mass's surface density over the critical density) in 100 kpc about each,
// after the other peak's share is taken off; their section 3 gives where the two κ peaks lie from the BCGs. The gas
// is drawn from Chandra's X-ray image (NASA/CXC/CfA/M. Markevitch et al.), placed by the gas peaks of Table 2. The
// lensing map itself is not openly licensed, so the mass is drawn as a smooth two-peak model of it fitted to those
// numbers: each peak κ = A / √(1 + (r / r_c)²), its A set so the mean κ in the 100 kpc aperture about its BCG is the
// paper's. The profile's shape and r_c are a model choice (the reconstruction is smoothed on about that scale).

const DEG = Math.PI / 180;

/** The cluster's catalogued place (named.json, SIMBAD), degrees. */
export const BULLET_CENTRE = { raDeg: 104.612, decDeg: -55.9725 };

/** kpc per arcsecond at the cluster: its angular-diameter distance (named.json, Planck 2018), 940.702 Mpc. */
export const BULLET_KPC_PER_ARCSEC = 940_702 * (DEG / 3600);

/** Clowe et al.'s own scale (their cosmology), for their 100 kpc apertures. */
const CLOWE_KPC_PER_ARCSEC = 4.413;

/** "06:58:35.3" → hours or degrees. */
const sexagesimal = (s: string): number => {
  const neg = s.trim().startsWith('-') || s.trim().startsWith('−');
  const [a, b, c] = s.replace(/[−-]/, '').split(':').map(Number);
  return (neg ? -1 : 1) * (a + b / 60 + c / 3600);
};

/** East and north of the catalogued place, arcseconds (tangent plane: small angles). */
export function skyOffset(raHms: string, decDms: string): [number, number] {
  const ra = sexagesimal(raHms) * 15;
  const dec = sexagesimal(decDms);
  const cosD = Math.cos(BULLET_CENTRE.decDeg * DEG);
  return [(ra - BULLET_CENTRE.raDeg) * cosD * 3600, (dec - BULLET_CENTRE.decDeg) * 3600];
}

const REF = 'Clowe et al. 2006, ApJ 648, L109';

/** Clowe et al.'s Table 2: position, X-ray gas mass and stellar mass within 100 kpc (10¹² M☉), mean κ there. */
export const CLOWE_TABLE_2 = {
  ref: `${REF} (Table 2)`,
  mainBcg: { ra: '06:58:35.3', dec: '-55:56:56.3', gas: 5.5, stars: 0.54, kappa: 0.36 },
  mainGas: { ra: '06:58:30.2', dec: '-55:56:35.9', gas: 6.6, stars: 0.23, kappa: 0.05 },
  subBcg: { ra: '06:58:16.0', dec: '-55:56:35.1', gas: 2.7, stars: 0.58, kappa: 0.2 },
  subGas: { ra: '06:58:21.2', dec: '-55:56:30.0', gas: 5.8, stars: 0.12, kappa: 0.02 },
} as const;

type Arcsec2 = [number, number];
const add = (p: Arcsec2, east: number, north: number): Arcsec2 => [p[0] + east, p[1] + north];

const at = (r: { ra: string; dec: string }): Arcsec2 => skyOffset(r.ra, r.dec);

/** The four places of Table 2, arcsec east and north of the catalogued place. */
export const BULLET_PLACES = {
  mainBcg: at(CLOWE_TABLE_2.mainBcg),
  mainGas: at(CLOWE_TABLE_2.mainGas),
  subBcg: at(CLOWE_TABLE_2.subBcg),
  subGas: at(CLOWE_TABLE_2.subGas),
  // Section 3: the main cluster's κ peak 2.5″ east and 11.5″ south of its (northern) BCG, the subcluster's 7.1″ east
  // and 6.5″ north of its BCG.
  mainPeak: add(at(CLOWE_TABLE_2.mainBcg), 2.5, -11.5),
  subPeak: add(at(CLOWE_TABLE_2.subBcg), 7.1, 6.5),
};

/** The κ model's core radius, arcsec (about 60 kpc). */
export const KAPPA_CORE_ARCSEC = 13;
/** Clowe et al.'s Figure 1 contours: κ = 0.16, rising in steps of 0.07. */
export const KAPPA_CONTOURS = { first: 0.16, step: 0.07 };

/** One peak's profile, shape only (A = 1), at r arcsec from it. */
const profile = (r: number): number => 1 / Math.sqrt(1 + (r / KAPPA_CORE_ARCSEC) ** 2);

/** The profile's mean over a disc of radius `ap` (arcsec) centred `d` arcsec from the peak (polar midpoint sum). */
export function apertureMean(d: number, ap: number, n = 64): number {
  let sum = 0;
  let w = 0;
  for (let i = 0; i < n; i++) {
    const r = ((i + 0.5) / n) * ap;
    for (let j = 0; j < n; j++) {
      const t = ((j + 0.5) / n) * 2 * Math.PI;
      sum += r * profile(Math.hypot(d + r * Math.cos(t), r * Math.sin(t)));
      w += r;
    }
  }
  return sum / w;
}

export interface KappaPeak {
  /** East and north of the catalogued place, arcsec. */
  at: Arcsec2;
  /** κ at the peak. */
  amplitude: number;
}

/** The two peaks of the mass model, each fitted to its BCG's mean κ in Clowe et al.'s 100 kpc aperture. */
export function kappaPeaks(): [KappaPeak, KappaPeak] {
  const ap = 100 / CLOWE_KPC_PER_ARCSEC;
  const fit = (peak: Arcsec2, bcg: Arcsec2, kappa: number): KappaPeak => ({
    at: peak,
    amplitude: kappa / apertureMean(Math.hypot(peak[0] - bcg[0], peak[1] - bcg[1]), ap),
  });
  return [fit(BULLET_PLACES.mainPeak, BULLET_PLACES.mainBcg, CLOWE_TABLE_2.mainBcg.kappa), fit(BULLET_PLACES.subPeak, BULLET_PLACES.subBcg, CLOWE_TABLE_2.subBcg.kappa)];
}

/** The model's κ at a place on the sky (arcsec east and north of the catalogued place). */
export function bulletKappa(east: number, north: number, peaks = kappaPeaks()): number {
  let k = 0;
  for (const p of peaks) k += p.amplitude * profile(Math.hypot(east - p.at[0], north - p.at[1]));
  return k;
}

/**
 * Chandra's X-ray image of the cluster (public/images/dark-matter/bullet-xray.jpg, 540 × 437, the site's own JPEG,
 * unmodified), north up and east to the left. It is placed by its two gas peaks: the centroids of its brightest pixels
 * (measured once in the image: the main cloud's at (253.0, 197.0) px, the bullet's at (338.3, 201.6) px from the top
 * left) set on Table 2's gas peaks, the scale from their east–west separation and the centre from their mean. The
 * bullet then lies 10″ south of where the paper's aperture is centred (the paper's centres are the clouds' masses, not
 * their brightest pixels); docs/data/dark-matter.md §4.
 */
export const BULLET_XRAY_PEAKS_PX = { main: [253.0, 197.0] as const, sub: [338.3, 201.6] as const };

function placeXray(): { centre: Arcsec2; arcsecPerPx: number } {
  const { main, sub } = BULLET_XRAY_PEAKS_PX;
  const m = BULLET_PLACES.mainGas;
  const s = BULLET_PLACES.subGas;
  // East is to the left (−x), north up (−y).
  const arcsecPerPx = (m[0] - s[0]) / (sub[0] - main[0]);
  const px = [(main[0] + sub[0]) / 2, (main[1] + sub[1]) / 2];
  const sky = [(m[0] + s[0]) / 2, (m[1] + s[1]) / 2];
  const cx = 540 / 2;
  const cy = 437 / 2;
  return { centre: [sky[0] - (cx - px[0]) * arcsecPerPx, sky[1] - (cy - px[1]) * arcsecPerPx], arcsecPerPx };
}

const xray = placeXray();

export const BULLET_XRAY = {
  file: 'images/dark-matter/bullet-xray.jpg',
  widthPx: 540,
  heightPx: 437,
  /** The image's centre, arcsec east and north of the catalogued place. */
  centre: xray.centre,
  arcsecPerPx: xray.arcsecPerPx,
  credit: 'X-ray: NASA/CXC/CfA/M. Markevitch et al.',
  url: 'https://chandra.harvard.edu/photo/2006/1e0657/',
};

/** A pixel of the X-ray image (from its top left) → arcsec east and north of the catalogued place. */
export function xrayPixelToSky(x: number, y: number): Arcsec2 {
  const k = BULLET_XRAY.arcsecPerPx;
  return [BULLET_XRAY.centre[0] - (x - BULLET_XRAY.widthPx / 2) * k, BULLET_XRAY.centre[1] - (y - BULLET_XRAY.heightPx / 2) * k];
}

/**
 * Where the two clusters' galaxies are drawn (the cosmos 'cluster' template, sim/cosmos/templates.ts): each group about
 * its BCG, in Mpc west and north of the catalogued place (the template's axes: x towards position angle 270°, y north).
 */
export function groupCentresMpc(): { main: [number, number]; sub: [number, number] } {
  const k = BULLET_KPC_PER_ARCSEC / 1000;
  const m = BULLET_PLACES.mainBcg;
  const s = BULLET_PLACES.subBcg;
  return { main: [-m[0] * k, m[1] * k], sub: [-s[0] * k, s[1] * k] };
}
