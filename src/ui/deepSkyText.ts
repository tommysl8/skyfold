/**
 * A deep-sky object's numbers in words, for its card and the data sheet: how far it is and how
 * that was measured, and sizes in parsecs and light-years; and a black hole's: its height above
 * the horizon, what it looks like from here, its mass, and the texts of the View menu's lensing
 * switch and the EHT's picture.
 *
 * Pure functions of their arguments (the card passes holeView's numbers), so the tests check the
 * words without a scene. Cost: a few string operations, three times a second while a card shows.
 */
import { AU_KM, LIGHT_YEAR_KM, PARSEC_KM } from '../physics/constants';
import { MINUS, qty, sci, sig, superscript } from '../lib/sci';
import type { DeepSkyInfo } from '../sim/bodies';

const LY_PER_PC = PARSEC_KM / LIGHT_YEAR_KM;

/** A number to `digits` significant figures, with thousands separated: "1,270", "27,000", "0.94". */
export function roundedText(x: number, digits = 3): string {
  if (!(x > 0)) return String(x);
  const step = 10 ** (Math.floor(Math.log10(x)) - digits + 1);
  const r = Math.round(x / step) * step;
  return r.toLocaleString('en-GB', { maximumFractionDigits: Math.max(0, -Math.floor(Math.log10(step))) });
}

/** A length in parsecs as light-years, to `digits` significant figures. */
export const lightYearsText = (pc: number, digits = 3): string => roundedText(pc * LY_PER_PC, digits);

/** A size: "6.8 pc (22 light-years)". */
export function sizeText(pc: number): string {
  if (pc >= 1e5) return `${roundedText(pc / 1e6, 2)} Mpc (${bigLightYears(pc)} light-years)`;
  return `${roundedText(pc, pc < 10 ? 2 : 3)} pc (${lightYearsText(pc, 2)} light-years)`;
}

/**
 * "1,270 light-years (1,250 to 1,280) from the Sun. Distance: VLBA radio parallaxes of young
 * stars (Kounkel et al. 2017)".
 */
export function deepSkyDistanceLine(x: DeepSkyInfo): string | null {
  const words = deepSkyDistanceWords(x);
  return words === null ? null : `${words}. ${deepSkyDistanceSource(x)}`;
}

/** How the distance was measured, for the card's sources: "Distance: VLBA radio parallaxes of young stars (Kounkel et al. 2017)". */
export const deepSkyDistanceSource = (x: DeepSkyInfo): string => `Distance: ${x.distanceSource ?? 'catalogue'}`;

/** The distance alone, for the card: "1,270 light-years (1,250 to 1,280) from the Sun". */
export function deepSkyDistanceWords(x: DeepSkyInfo): string | null {
  if (x.distancePc === undefined) return null;
  // Beyond a million light-years: "2.48 million", "33.9 billion".
  const big = x.distancePc * LY_PER_PC >= 1e6;
  const ly = (pc: number) => (big ? bigLightYears(pc) : lightYearsText(pc));
  // The range, unless it rounds to the distance itself ("440 light-years (440 to 440)").
  const lo = x.distanceLoPc !== undefined ? ly(x.distanceLoPc) : '';
  const hi = x.distanceHiPc !== undefined ? ly(x.distanceHiPc) : '';
  const range = lo && hi && x.distanceHiPc! > x.distanceLoPc! && lo !== hi ? ` (${lo} to ${hi})` : '';
  // "in the Large Magellanic Cloud", but "in Messier 87 (Virgo A)": a galaxy's own name takes no article.
  const where = x.hostGalaxy ? `, in ${/^(Large|Small) |(Galaxy|Cloud)$/.test(x.hostGalaxy) ? 'the ' : ''}${x.hostGalaxy}` : '';
  const now = x.distanceNow ? ' now' : '';
  return `${ly(x.distancePc)} light-years${range} from the Sun${now}${where}`;
}

/** A distance of a million light-years or more in words: "2.48 million", "33.9 billion". */
export function bigLightYears(pc: number): string {
  const l = pc * LY_PER_PC;
  if (l >= 1e9) return `${roundedText(l / 1e9, 3)} billion`;
  if (l >= 1e6) return `${roundedText(l / 1e6, 3)} million`;
  return roundedText(l, 3);
}

/**
 * A picture's credit line to end a sentence with (the card's "Picture: …."): exactly as the archive
 * gives it, its line breaks kept for the page to show (Westerlund 2's has two paragraphs), with a
 * full stop added only where it has none (the Ring Nebula's and Westerlund 2's already end in one).
 */
export function creditSentence(credit: string): string {
  const t = credit.trimEnd();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

// ─── Black holes ─────────────────────────────────────────────────────────────────────────
//
// A black hole's card says how high above its horizon you are rather than how far from you it
// is (the exact height is the gravity state's: the heliocentric difference is kilometres coarse near a hole),
// what it looks like from here (sim/lensBodies.ts holeView: the shadow, the Einstein ring, your clock, the
// thrust it takes to stay), and its mass with the published uncertainties. These are the words; the numbers
// are holeView's and the gravity state's. Twins: ui/flight/HoleStrip.tsx (the HUD's forms of the same numbers)
// and ui/dataSheet.ts (the notes the card leaves out).

/**
 * View › Gravitational lensing's hint (label 21 of docs/data/blackholes.md §3: with lensing off only the gas's point
 * remains).
 */
export const LENSING_HINT =
  'Bends light round black holes exactly (the one that bends it most where you are). Off: light is drawn straight, so a black hole and the gas close round it cannot be seen (from far away its gas still shows as a point).';

/** The card's link to the notes it leaves out (the data sheet) and to the Guide. */
export const MODELLED_HERE = 'What is modelled here';

const RAD_TO_DEG = 180 / Math.PI;

/** An angle on the sky, from radians: "28.5°", "12.3′", "4.11″", "1.57 mas", "53.3 µas". */
export function skyAngleText(rad: number): string {
  if (!(rad > 0)) return '0°';
  const deg = rad * RAD_TO_DEG;
  if (deg >= 1) return `${sig(deg, 3)}°`;
  if (deg * 60 >= 1) return `${sig(deg * 60, 3)}′`;
  const arcsec = deg * 3600;
  if (arcsec >= 1) return `${sig(arcsec, 3)}″`;
  if (arcsec * 1e3 >= 1) return `${sig(arcsec * 1e3, 3)} mas`;
  return `${sig(arcsec * 1e6, 3, { sciBelow: -3 })} µas`;
}

/**
 * A height above a horizon, km, as the readouts write lengths: "27.4 mm", "850 m", "12.69 km", "0.8483 au",
 * "4000 au" (au to 100,000 au, where a black hole's surroundings are measured), then light-years.
 */
export function heightText(km: number): string {
  const p = heightParts(km);
  return `${p.v} ${p.u}`;
}

/** heightText's number and unit apart, for the readouts that set the unit on its own (the HUD, the instruments). */
export function heightParts(km: number): { v: string; u: string } {
  const a = Math.abs(km);
  if (a < 1e-3) return { v: sig(a * 1e6, 3), u: 'mm' };
  if (a < 1) return { v: sig(a * 1e3, 3), u: 'm' };
  if (a < 0.01 * AU_KM) return { v: sig(a, 4), u: 'km' };
  if (a < 1e5 * AU_KM) return { v: sig(a / AU_KM, 4), u: 'au' };
  return qty(a, 'length', 4);
}

/** r in horizon radii, to the digits that show how close to the horizon: "10.00", "1.010", "1 + 1.0 × 10⁻⁶", "47 200". */
export function rsText(rOverRs: number, heightOverRs: number): string {
  if (heightOverRs > 0 && heightOverRs < 1e-3) return `1 + ${sci(heightOverRs, 2)}`;
  return sig(rOverRs, rOverRs < 100 ? 4 : 3);
}

/** What the card needs of a black hole seen from the camera (sim/lensBodies.ts HoleView has all of it). */
export interface HoleViewLike {
  heightKm: number;
  rOverRs: number;
  frame: 'static' | 'rain';
  shadowRadius: number;
  einsteinRadius: number;
  thrustG: number | null;
}

/**
 * "12.69 km above the horizon (r = 1 + 1.0 × 10⁻⁶ r_s)"; inside a fall: "inside the horizon (r = 0.500 r_s)".
 * `rsKm`: the horizon's radius, for the height in its units without cancellation near the floor.
 */
export function holeHeightLine(v: HoleViewLike, rsKm: number): string {
  if (!(v.heightKm > 0)) return `inside the horizon (r = ${sig(Math.max(0, v.rOverRs), 3)} r_s)`;
  return `${heightText(v.heightKm)} above the horizon (r = ${rsText(v.rOverRs, v.heightKm / rsKm)} r_s)`;
}

/** How many times faster home's clock runs than yours, as the card says it: "1.054×", "10.05×", "1.0 × 10⁴ times". */
export function timesSlower(n: number): string {
  if (!Number.isFinite(n)) return 'infinitely';
  if (n < 1e4) return `${sig(n, 4)}×`;
  return `${sci(n, 2)} times`;
}

/** A thrust in Earth gravities for the card: "3,806 g", "3.6 × 10⁶ g", "0.0026 g". */
export function thrustText(g: number): string {
  if (!Number.isFinite(g)) return '—';
  if (g >= 1e6) return `${sci(g, 2)} g`;
  if (g >= 1) return `${roundedText(g, 4)} g`;
  return `${sig(g, 2, { sciBelow: -3 })} g`;
}

/** What the card knows of the camera's own state near the hole (from the gravity state). */
export interface HoleHere {
  /** The hole is the one whose gravity the app models now (gravity.hole): its lens is drawn, its clock felt. */
  near: boolean;
  /** Home's clock against yours: how many times faster (n) and n − 1 without cancellation; null: not shown. */
  clock: { n: number; nMinus1: number } | null;
  /** Hovering (at rest past the observers hovering there), on a circular orbit, moving past them, or falling. */
  motion: 'hover' | 'orbiting' | 'moving' | 'falling';
  /** Inside the horizon (only in a fall). */
  inside: boolean;
}

/**
 * The card's "From here" items: "shadow 28.5° across", "Einstein ring 59.7° across", "your clock
 * runs 1.054× slower than home's", "hovering here takes 3,806 g". Far from the hole only the shadow. A shadow
 * wider than half the sky is told by the sky that is left; a faller's dark region is the "dark patch ahead".
 * The Einstein ring is the hovering observer's (the ring of the sky behind), so it shows only while hovering;
 * below r = 3.52 M it lies more than 90° from the hole, round the point overhead, and is measured there. On a
 * circular orbit (a geodesic) no thrust is needed at all.
 */
export function holeFromHere(v: HoleViewLike, here: HoleHere): string[] {
  const out: string[] = [];
  const r = v.shadowRadius;
  if (Number.isFinite(r) && r > 0) {
    if (here.motion === 'falling' || v.frame === 'rain') out.push(`dark patch ahead ${skyAngleText(2 * r)} across`);
    else if (r > Math.PI / 2) out.push(`shadow over all the sky but ${skyAngleText(2 * (Math.PI - r))} overhead`);
    else out.push(`shadow ${skyAngleText(2 * r)} across`);
  }
  if (here.near && here.motion === 'hover' && Number.isFinite(v.einsteinRadius) && v.einsteinRadius > 0 && v.einsteinRadius < Math.PI) {
    const e = v.einsteinRadius;
    out.push(e > Math.PI / 2 ? `Einstein ring ${skyAngleText(2 * (Math.PI - e))} across overhead` : `Einstein ring ${skyAngleText(2 * e)} across`);
  }
  const c = here.clock;
  if (here.near && c && c.nMinus1 > 0) {
    out.push(c.nMinus1 < 0.01 ? `your clock runs ${sig((100 * c.nMinus1) / c.n, 2)} % slower than home’s` : `your clock runs ${timesSlower(c.n)} slower than home’s`);
  }
  if (here.near) {
    if (here.inside) out.push('inside the horizon nothing can hover');
    else if (here.motion === 'falling') out.push('falling freely: no thrust');
    else if (here.motion === 'orbiting') out.push('falling freely round it: no thrust');
    else if (v.thrustG !== null && Number.isFinite(v.thrustG) && v.thrustG > 0) {
      out.push(here.motion === 'hover' ? `hovering here takes ${thrustText(v.thrustG)}` : `your present motion takes ${thrustText(v.thrustG)} of thrust`);
    }
  }
  return out;
}

/** Decimals of a stored number's shortest form (9.27 → 2, 0.1 → 1, 9 → 0). */
function decimalsOf(x: number): number {
  const s = String(Number(Math.abs(x).toPrecision(12)));
  if (s.includes('e')) return 0;
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** What the card needs of a black hole's record (sim/bodies/types.ts BlackHoleInfo). */
export interface HoleMassLike {
  massMsun: number;
  massStatMsun: number;
  massSysMsun: number;
  massUncMsun?: readonly [number, number];
  massSource: string;
}

/**
 * The mass with its published uncertainties, as the card shows it: "(4.297 ± 0.012 ± 0.040) × 10⁶ M☉",
 * "9.27 ± 0.10 M☉", "8.48 +0.79 −0.72 M☉"; its title says which is which and where it comes from.
 */
export function holeMassText(m: HoleMassLike): { v: string; title: string } {
  const power = m.massMsun >= 1e5 ? Math.floor(Math.log10(m.massMsun)) : 0;
  const k = 10 ** power;
  const x = m.massMsun / k;
  const pair = m.massUncMsun;
  const parts = pair ? [pair[0] / k, pair[1] / k] : [m.massStatMsun / k, m.massSysMsun / k].filter((u) => u > 0);
  const dec = Math.max(decimalsOf(x), ...parts.map(decimalsOf));
  const f = (u: number) => u.toFixed(dec);
  let unc = '';
  let what = '';
  if (pair) {
    unc = ` +${f(pair[1] / k)} ${MINUS}${f(pair[0] / k)}`;
    what = '1σ above and below';
  } else if (m.massStatMsun > 0 && m.massSysMsun > 0) {
    unc = ` ± ${f(m.massStatMsun / k)} ± ${f(m.massSysMsun / k)}`;
    what = '1σ statistical, then systematic';
  } else if (m.massStatMsun > 0) {
    unc = ` ± ${f(m.massStatMsun / k)}`;
    what = '1σ';
  }
  const v = power ? `${unc ? '(' : ''}${f(x)}${unc}${unc ? ')' : ''} × 10${superscript(power)} M☉` : `${f(x)}${unc} M☉`;
  return { v, title: `${what ? `${what}; ` : ''}${m.massSource}` };
}

/** The Event Horizon Telescope's ring as its source gives it: "42 ± 3" from "… (42 ± 3 µas)", else the diameter alone. */
export function ehtRingText(ringDiameterUas: number, ringSource: string): string {
  const m = /\(([\d.]+ ± [\d.]+) µas\)/.exec(ringSource);
  return m ? m[1] : String(ringDiameterUas);
}

/**
 * The caption under an Event Horizon Telescope picture on a black hole's card. Sgr A*'s (with the flow model
 * beside it) is the flow model's own text (sim/blackholes/accretion.ts FLOW_TEXTS.figureCaption); a hole drawn without gas
 * (M87*) says so.
 */
export function ehtCaption(ringDiameterUas: number, ringSource: string, flowCaption: string | null): string {
  if (flowCaption) return flowCaption;
  return `The Event Horizon Telescope’s 2017 image: a reconstruction at 1.3 mm, ring ${ehtRingText(ringDiameterUas, ringSource)} µas across. Skyfold draws no gas round this black hole: only its shadow and the light it bends.`;
}
