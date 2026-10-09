/**
 * The data layers beyond the Galaxy: the cosmic web (the 55,877 galaxies of Cosmicflows-4 as a map),
 * the galaxy surveys (13.5 million galaxies and quasars of DESI and the SDSS, and Quaia's all-sky quasars: sim/surveys) and the map
 * of the cosmic microwave background. What each is, in the words its card and the Guide use, and when
 * the web and the surveys show: like the constellation figures they are on by themselves where they
 * help ('auto': the web beyond the Local Group, the surveys beyond the local universe) and the View
 * menu turns them on or off for good.
 */
import { MPC_KM } from '../physics/constants';
import { sim } from '../sim/sim';
import { useUI, type UIState } from '../state/ui';
import { CMB_LABEL } from '../sim/cosmos/cmb';

/** 'auto' starts to show the web this far from the Sun (the Local Group's edge is about 1 Mpc from its centre)… */
export const WEB_AUTO_FROM_KM = 3 * MPC_KM;
/** …and shows it fully from here. */
export const WEB_AUTO_FULL_KM = 8 * MPC_KM;
/** The web's data are fetched once the camera is this far out (or the layer is turned on). */
export const WEB_LOAD_KM = 1.5 * MPC_KM;

/** How much of the web shows (0 to 1) for a setting and the camera's distance from the Sun (km). */
export function cosmicWebShare(mode: UIState['cosmicWeb'], distSunKm: number): number {
  if (mode === 'off') return 0;
  if (mode === 'on') return 1;
  const t = Math.min(1, Math.max(0, (distSunKm - WEB_AUTO_FROM_KM) / (WEB_AUTO_FULL_KM - WEB_AUTO_FROM_KM)));
  return t * t * (3 - 2 * t);
}

/**
 * The web's points are drawn with the layer off too, for a cluster in focus or selected (its members:
 * scene/CosmicWeb.tsx sets this each frame), and its card goes with them.
 */
export const webMembersShown = { now: false };

/**
 * The galaxy surveys load once the camera is this far from the Sun ('auto'), and show from there, fully by
 * SURVEY_AUTO_FULL_KM. Why 30 Mpc: within it the cosmic web draws the galaxies at their measured distances, while a
 * survey can only place a galaxy by its redshift, and there a galaxy's own motion (300 km/s and more, over 1,000 in the
 * Virgo cluster) is a large share of the expansion's (2,000 km/s at 30 Mpc), so redshift places would be off by 15 %
 * or more; from 30 to 60 Mpc the web itself goes over to redshift distances (sim/cosmos/cosmicWeb.ts). And everything
 * the tour and the journeys visit nearby, the Local Group, the nearby galaxies and the Virgo cluster (16.5 Mpc), lies
 * inside it, so most visits download none of the surveys' 62 MB; the cosmic web's scene (200 Mpc out), Coma and the
 * flights to the far universe do.
 */
export const SURVEY_LOAD_KM = 30 * MPC_KM;
export const SURVEY_AUTO_FROM_KM = 30 * MPC_KM;
export const SURVEY_AUTO_FULL_KM = 60 * MPC_KM;

/** Whether the surveys' files should load for a setting and the camera's distance from the Sun (km). */
export const surveyLoadWanted = (mode: UIState['surveys'], distSunKm: number): boolean => mode === 'on' || (mode === 'auto' && distSunKm >= SURVEY_LOAD_KM);

/** How much of the surveys shows (0 to 1) for a setting and the camera's distance from the Sun (km). */
export function surveyShare(mode: UIState['surveys'], distSunKm: number): number {
  if (mode === 'off') return 0;
  if (mode === 'on') return 1;
  const t = Math.min(1, Math.max(0, (distSunKm - SURVEY_AUTO_FROM_KM) / (SURVEY_AUTO_FULL_KM - SURVEY_AUTO_FROM_KM)));
  return t * t * (3 - 2 * t);
}

/**
 * Quaia's quasars (the survey layer's all-sky part: sim/surveys/quaia.ts) load once the camera is QUAIA_LOAD_KM from
 * the Sun, whatever the setting while the layer is on, and fade in to show fully by QUAIA_FULL_KM. Why 500 Mpc: 95 % of
 * them are farther than 1.76 Gpc (z = 0.45), and their distances are uncertain by about 200 Mpc. Nearer home they would
 * be a faint sprinkle far behind the survey's own galaxies, and what they are for, the sky the surveys could not see,
 * shows as gaps only once the camera is far enough out to see the survey's footprint as fans with empty wedges between;
 * 500 Mpc out it does. So the cosmic web's scene (200 Mpc out), Coma and everything nearer download none of Quaia's
 * 4.8 MB, and the flights to the far universe do.
 */
export const QUAIA_LOAD_KM = 500 * MPC_KM;
export const QUAIA_FULL_KM = 1000 * MPC_KM;

/** Whether Quaia's files should load for the surveys' setting and the camera's distance from the Sun (km). */
export const quaiaLoadWanted = (mode: UIState['surveys'], distSunKm: number): boolean => mode !== 'off' && distSunKm >= QUAIA_LOAD_KM;

/** How much of Quaia shows (0 to 1): as much as of the surveys, times its own fade in by distance. */
export function quaiaShare(mode: UIState['surveys'], distSunKm: number): number {
  const t = Math.min(1, Math.max(0, (distSunKm - QUAIA_LOAD_KM) / (QUAIA_FULL_KM - QUAIA_LOAD_KM)));
  return surveyShare(mode, distSunKm) * t * t * (3 - 2 * t);
}

/** Whether the surveys show now (at all). */
export const surveysNow = (): boolean => surveyShare(useUI.getState().surveys, sim.camera.pos.length()) > 0;

/** Turn the surveys the other way from how they show now (and keep it so). */
export function toggleSurveys(): void {
  useUI.setState({ surveys: surveysNow() ? 'off' : 'on' });
}

/** What the survey layer is, for its card and the View menu. Short: the details are in docs/data/surveys.md. */
export const SURVEY_CARD = {
  title: 'Galaxy surveys',
  line: '13.5 million galaxies and quasars from DESI and the SDSS, out to 23 billion light-years: a map, not what the eye would see.',
  caveat: 'Placed by redshift: a galaxy’s own motion moves it along our line of sight, which stretches clusters into spikes pointing at us. The empty wedges are sky the surveys could not see: behind the Milky Way’s disc, and much of the south.',
  more: [
    'Orange: red galaxies, mostly old stars. Blue: galaxies forming stars. Violet: quasars, gas falling into a supermassive black hole and outshining its galaxy; paler, bluer violet streaks are Quaia’s, grey streaks Gaia’s galaxies. Glows hold the light of galaxies too small to draw from here.',
    'Quaia’s and Gaia’s redshifts come from Gaia’s low-resolution spectra, not a spectrograph: a typical one is uncertain by 4 % of 1 + z, about 200 Mpc in distance, and a tenth of the quasars’ by over 700 Mpc. Each streak runs over its object’s likely distances, holding the light of one point, and the least certain are fainter. What DESI or the SDSS measured is drawn from those surveys instead. Behind the Milky Way’s plane no survey sees galaxies: that band is empty because it is hidden, not because nothing is there.',
    'A survey, not a census: far away only the brightest galaxies were seen, and each survey chose different kinds, so the map thins and changes colour with distance. Two thirds of the sky has not been mapped this way: blank is unobserved, not empty.',
  ],
  /** Shown under the caveat while Quaia's quasars show (from QUAIA_LOAD_KM). */
  quaia: 'Quasars (Quaia) and nearer galaxies over the whole sky from Gaia, in the wedges too: their distances are rough, so they are drawn stretched along the line of sight.',
  credit: 'DESI Data Release 1 (CC BY 4.0) and SDSS DR17 (public domain); acknowledgements in the About page’s sources. Quaia: Storey-Fisher et al. 2024, ApJ 964, 69 (CC BY 4.0). Gaia DR3 galaxies: ESA/Gaia/DPAC (CC BY-NC 3.0 IGO)',
} as const;

/** Whether the web shows now (at all). */
export const cosmicWebNow = (): boolean => cosmicWebShare(useUI.getState().cosmicWeb, sim.camera.pos.length()) > 0;

/** Turn the web the other way from how it shows now (and keep it so). */
export function toggleCosmicWeb(): void {
  useUI.setState({ cosmicWeb: cosmicWebNow() ? 'off' : 'on' });
}

/** What the cosmic web layer is, for its card, the View menu and the Guide. */
export const COSMIC_WEB_CARD = {
  title: 'The cosmic web',
  // The survey's paper is in `credit`, under the card's Sources.
  line: 'The 55,877 galaxies with measured distances of Cosmicflows-4, where they are now, the nearest drawn as galaxies of their own: a map, not what the eye would see.',
  key: 'Orange: elliptical and lenticular galaxies (measured by the Fundamental Plane or surface-brightness fluctuations). Blue: spirals and irregulars (the Tully–Fisher relation). Grey: either. Bigger and brighter points are more luminous in infrared light (2MASS). The colours are then shifted as the light arrives: redder and dimmer as the expansion of space stretches it (and bluer ahead of a fast ship), so at other times the map reddens, dims and spreads out, while each group keeps its size.',
  caveat:
    'A survey, not a census: most galaxies are in the northern galactic sky that the SDSS covered, almost none lie behind the Milky Way’s disc (the zone of avoidance), and single distances are 15–25% uncertain. Inside 30 Mpc galaxies sit at their groups’ measured distances, beyond 60 Mpc at their groups’ redshift distances (Planck 2018), and between the two a blend of both.',
  credit: 'Tully et al. 2023, ApJ 944, 94 (CC BY 4.0); 2MASS (UMass/IPAC-Caltech, NASA, NSF)',
} as const;

/** What the CMB map layer is. */
export const CMB_CARD = {
  title: 'The cosmic microwave background',
  line: CMB_LABEL,
  key: 'Black is the mean temperature, 2.7255 K; blue is colder and red warmer, by up to 250 millionths of a kelvin. The real sky is uniform to the eye to one part in 10,000; the Sun’s motion (the dipole) and the Milky Way’s own glow have been removed.',
  caveat: 'The oldest light there is, released about 370,000 years after the Big Bang. The map is the pattern seen from the Solar System at the present. Drawn whenever the relativistic view is off (at rest, in classical optics, or on the classical side of the split screen): in the relativistic view the sky shows the real background as a moving ship would see it, at 2.72548 K divided by how much the universe has grown.',
  credit: 'NASA/WMAP Science Team; the colours are the end colours of Moreland’s (2009) cool–warm map',
} as const;
