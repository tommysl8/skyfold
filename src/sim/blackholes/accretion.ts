/**
 * Sagittarius A*'s accretion flow: its fitted model (sgraFlow.json, written by scripts/sgra-flow/flow_tables.py), its
 * axis, and the flow as a point of light while it is too small to resolve.
 *
 * What (docs/data/blackholes.md §7): the hot, thin flow of model A (a RIAF of the Broderick & Loeb 2006 type,
 * fitted to Sgr A*'s spectrum from radio to near infrared) turned like the flares GRAVITY saw (a model choice). Seen
 * from far away it is a point: a power law F_ν ∝ ν^−0.5 of V = m₈₂₇₇(i) + 5 log10(d / 8,277 pc) − 2.5 log10 g^(1 − α)
 * (about V −11 from 4,000 au), where m₈₂₇₇(i) is the model's V magnitude seen from 8,277 pc at the angle i between
 * the flow's axis and the camera (the file's byAngle table, interpolated in log flux), d the camera's distance and
 * g the blueshift of a hovering observer there (a power law's flux scales as g^(1 − α): g^(3 − α) in intensity, g^−2
 * in solid angle). Its colour is the power law's, the same at any shift. As the camera comes closer its bright ring
 * (radius 5.33 M in impact parameter) grows past 1.5 device px and the point fades out by 3 px (pointShare), while
 * the lens passes draw the resolved flow from the flow map (render/flow/flowMap.ts). With the lens off only the
 * point shows, and only while unresolved: a resolved flow is a lensed image, and drawn straight it would be wrong.
 *
 * Within about 1,000 M (where the flow is resolved and the point has faded) the magnitude written here is still the
 * far-away law carried in; the numbers a scene may quote from close by are the file's `scenes` block, from the
 * reference ray tracer at that camera.
 *
 * Also here: the constants of the model's emission for the ray march (flowEmission, from the file's `emission`
 * block, so the app uses the reference's own numbers), and the flow's colour.
 *
 * Cost: flowPoint about a microsecond, nothing allocated; it is called for every black hole each frame
 * (sim/lensBodies.ts placeBlackHoles), and only Sagittarius A* has a flow.
 *
 * Twins: scripts/sgra-flow/riaf_model.py (the model), render/flow/flowRay.ts (one ray of the map),
 * render/shaders/flowMap.frag.glsl and flowLookup.glsl (the map and its reading).
 */
import flowJson from './sgraFlow.json';
import type { BodyId } from '../bodies/types';
import { getBody } from '../bodies';
import { blackHoleGm, gravity } from '../gravity';
import { sim } from '../sim';
import { useUI } from '../../state/ui';
import { C_KM_S, PARSEC_KM } from '../../physics/constants';
import { blackbody, cieOnGrid, SPECTRAL_GRID_NM, WHITE_POINT_K, xyzToLinearSrgb } from '../../physics/blackbody';

/** The flow drawn in visible light, or in false colour at 1.3 mm as the Event Horizon Telescope sees it. */
export type AccretionBand = 'visible' | 'mm';

/** The unresolved flow as a point (a glint of the hole). */
export interface FlowPoint {
  /** Apparent V magnitude from the camera (magnification and shifts included), 99 when off or when lensing is off and resolved. */
  magnitude: number;
  /** Spectral index α of F_ν ∝ ν^α (−0.5): its colour is the same at any shift. */
  spectralIndex: number;
  /** Linear-sRGB colour of luminance 1 (B − V = +0.24). */
  rgb: [number, number, number];
  /** 1 while unresolved, → 0 as the resolved map takes over (the hole's glint fades by this, not by radiusPx). */
  pointShare: number;
}

/** The only hole with a flow. */
export const FLOW_HOLE: BodyId = 'sgr-a-star';

/** sgraFlow.json as written by flow_tables.py. */
export interface SgraFlowFile {
  format: string;
  version: number;
  model: {
    name: string;
    n0Cm3: number;
    t0K: number;
    n0NonThermalCm3: number;
    p: number;
    beta: number;
    pitchDeg: number;
    massMsun: number;
    distancePc: number;
    rgCm: number;
  };
  emission: {
    sinPitch: number;
    bSquared: number;
    powerLawJ: number;
    powerLawA: number;
    thermalJ: number;
    nuS: number;
    thetaPerK: number;
    hOverK: number;
    twoHOverC2: number;
    c2Over2k: number;
    rgCm: number;
    vHz: number;
    mmHz: number[];
    vZeroJy: number;
    arcsec2PerSr: number;
    gClip: number[];
  };
  axis: { world: number[]; eastNorthAway: number[]; eclipticJ2000: number[]; sunAngleDeg: number; source: string };
  fit: {
    vMag8277: number;
    bMinusV: number;
    spectralIndex: number;
    vRingRadiusM: number;
    tb230PeakK: number;
    modelCVJy: number;
    modelCVMag8277: number;
    vSurfaceBrightness: { mean_sb_50: number; peak_sb: number };
  };
  byAngle: { deg: number[]; vJy: number[]; mm230Jy: number[]; rays: string; mirror: { tracedDeg: number; vRatio: number; mm230Ratio: number } };
  scenes: Record<string, { rM: number; inclinationDeg: number; vMag: number; ringRadiusDeg: number; shadowRadiusDeg: number }>;
  limits: string[];
  refs: Record<string, string>;
}

/** The flow's data. */
export const SGRA_FLOW = flowJson as unknown as SgraFlowFile;

/** Model A's parameters. */
export const flowModel = SGRA_FLOW.model;

/** The flow's axis (its angular momentum), unit, in the app's world axes: the only home of this vector. */
export const flowAxisWorld: readonly [number, number, number] = [SGRA_FLOW.axis.world[0], SGRA_FLOW.axis.world[1], SGRA_FLOW.axis.world[2]];

/** Spectral index of the visible light, α in F_ν ∝ ν^α. */
export const FLOW_SPECTRAL_INDEX = SGRA_FLOW.fit.spectralIndex;

/** Radius of the visible ring in impact parameter, units of M (the model seen from far away). */
export const FLOW_RING_M = SGRA_FLOW.fit.vRingRadiusM;

/** The point fades out as the ring's radius grows from this to FLOW_RESOLVED_PX, device px. */
export const FLOW_UNRESOLVED_PX = 1.5;
export const FLOW_RESOLVED_PX = 3;

/** V = 0 in Jy (Bessell et al. 1998): the model's V zero point. */
export const V_ZERO_JY = SGRA_FLOW.emission.vZeroJy;

/**
 * Linear-sRGB colour (luminance 1, white-balanced to 6,500 K as the stars are) of the power law F_ν ∝ ν^−0.5, i.e.
 * F_λ ∝ λ^−1.5, integrated against the CIE 1931 observer: the flow's colour at any shift (B − V = +0.24).
 */
export const FLOW_V_RGB: readonly [number, number, number] = powerLawRgb(FLOW_SPECTRAL_INDEX);

function powerLawRgb(alphaNu: number): [number, number, number] {
  const cie = cieOnGrid();
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let k = 0; k < SPECTRAL_GRID_NM.length; k++) {
    // F_λ ∝ F_ν / λ² ∝ λ^(−α − 2)
    const w = Math.pow(SPECTRAL_GRID_NM[k] / 550, -alphaNu - 2);
    X += w * cie[k][0];
    Y += w * cie[k][1];
    Z += w * cie[k][2];
  }
  const rgb = xyzToLinearSrgb(X / Y, 1, Z / Y);
  const wx = blackbody(WHITE_POINT_K).xyz;
  const wb = xyzToLinearSrgb(wx[0], wx[1], wx[2]);
  const r = Math.max(0, rgb[0] / wb[0]);
  const g = Math.max(0, rgb[1] / wb[1]);
  const b = Math.max(0, rgb[2] / wb[2]);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r / lum, g / lum, b / lum];
}

/**
 * The emission's constants for the ray march (render/flow/flowRay.ts and flowMap.frag.glsl), from the file's
 * `emission` block. Visible light (optically thin, the power-law electrons only: the thermal ones give 0.003 %):
 * each emission sample adds W · exp(lnV + cRho ln ρ² + cR ln r + cZ z²/ρ² + gExp ln g) to the ray's intensity at
 * infinity, in V = 0 stars per square arcsecond (10^(−0.4 μ_V)), W the sample's length of the affine parameter in M,
 * g = ν_∞/ν_emit; this is Σ g^(2 − α) j_V Δλ with j_V ∝ n_nt B^((p+1)/2) ν^(−(p−1)/2). The 1.3 mm
 * view's thermal and power-law emissivities and absorption keep their natural logarithms here (float32 cannot hold
 * 2h/c² = 1.5e−47).
 */
export const flowEmission = deriveEmission();

function deriveEmission() {
  const m = SGRA_FLOW.model;
  const e = SGRA_FLOW.emission;
  const p = m.p;
  const eB = (p + 1) / 2;
  // n_nt B^eB = n0nt ρ^−2.9 e^(−z²/2ρ²) (bSquared ρ^−1.1 e^(−z²/2ρ²) / r)^(eB/2)
  const lnV =
    Math.log(e.powerLawJ) +
    Math.log(m.n0NonThermalCm3) +
    (eB / 2) * Math.log(e.bSquared) -
    ((p - 1) / 2) * Math.log(e.vHz) +
    Math.log(e.rgCm) +
    Math.log(1e23 / (e.vZeroJy * e.arcsec2PerSr));
  return {
    /** Visible light: ln of the constant, and the powers of ρ², r, the factor of z²/ρ² and the power of g. */
    lnV,
    cRho: (-2.9 - 1.1 * (eB / 2)) / 2,
    cR: -eB / 2,
    cZ: -0.5 * (1 + eB / 2),
    gExp: 2 + (p - 1) / 2,
    /** 1.3 mm: ln n0, ln n0nt, ln T0, ln(k/m_e c²). */
    lnN0: Math.log(m.n0Cm3),
    lnN0Nt: Math.log(m.n0NonThermalCm3),
    lnT0: Math.log(m.t0K),
    lnThetaPerK: Math.log(e.thetaPerK),
    /** ln of B²'s constant, ν_s's, the thermal emissivity's, the power law's emissivity and absorption. */
    lnBSquared: Math.log(e.bSquared),
    lnNuS: Math.log(e.nuS),
    lnThermalJ: Math.log(e.thermalJ),
    lnPowerLawJ: Math.log(e.powerLawJ),
    lnPowerLawA: Math.log(e.powerLawA),
    /** ln(2h/c²), h/k, ln(c²/2k) − ln 1e10 (brightness temperatures in units of 1e10 K), ln r_g (cm). */
    lnTwoHOverC2: Math.log(e.twoHOverC2),
    hOverK: e.hOverK,
    lnTbUnit: Math.log(e.c2Over2k) - Math.log(1e10),
    lnRg: Math.log(e.rgCm),
    /** The power law's exponents of B and ν in j and in the absorption. */
    pjB: eB,
    pjNu: -(p - 1) / 2,
    paB: (p + 2) / 2,
    paNu: -(p + 4) / 2,
    /** The three frequencies of the 1.3 mm map (Hz), and the clip of g. */
    mmHz: [e.mmHz[0], e.mmHz[1], e.mmHz[2]] as const,
    gMin: e.gClip[0],
    gMax: e.gClip[1],
  };
}

/** The flow's V magnitude seen from 8,277 pc at angle `deg` from its axis (the byAngle table, linear in log flux). */
export function flowMag8277(deg: number): number {
  const t = SGRA_FLOW.byAngle;
  const n = t.deg.length;
  const step = t.deg[1] - t.deg[0];
  const x = Math.min(n - 1, Math.max(0, (deg - t.deg[0]) / step));
  const i = Math.min(n - 2, Math.floor(x));
  const f = x - i;
  const lnF = (1 - f) * Math.log(t.vJy[i]) + f * Math.log(t.vJy[i + 1]);
  return -2.5 * (lnF / Math.LN10) + 2.5 * Math.log10(V_ZERO_JY);
}

/**
 * Device px per radian at the screen's centre, as the lens has it (render/flow/flowMap.ts copies lens.pxPerRad here
 * each frame; the flow's point crossfades by the ring's size in these px). Before the first frame: the CSS scale.
 */
export const flowPixelScale = { devicePxPerRad: 0 };

function pxPerRad(): number {
  if (flowPixelScale.devicePxPerRad > 0) return flowPixelScale.devicePxPerRad;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return (Math.max(1, sim.viewport.height) * dpr) / 2 / Math.tan((sim.camera.fovDeg * Math.PI) / 360);
}

/** Whether View › Accretion flow is on. */
export function flowVisible(): boolean {
  return useUI.getState().accretionFlow;
}

/** The camera relative to Sgr A* this frame: r in units of M and the cosine of its angle from the flow's axis. */
export interface FlowView {
  rM: number;
  cosI: number;
  distKm: number;
}
const viewScratch: FlowView = { rM: Infinity, cosI: 1, distKm: Infinity };

/**
 * The camera seen from the flow's hole: exactly from the gravity state when it is the active hole (the heliocentric
 * difference is 32 km coarse there), else from the positions. False when the hole is not present.
 */
export function flowView(out: FlowView = viewScratch): boolean {
  let x: number;
  let y: number;
  let z: number;
  let mKm: number;
  if (gravity.hole === FLOW_HOLE && gravity.mKm > 0) {
    const c = gravity.camRelHoleKm;
    x = c.x;
    y = c.y;
    z = c.z;
    mKm = gravity.mKm;
  } else {
    const b = sim.bodies[FLOW_HOLE];
    if (!b || !b.present) return false;
    const cam = sim.camera.pos;
    x = cam.x - b.apparentPos.x;
    y = cam.y - b.apparentPos.y;
    z = cam.z - b.apparentPos.z;
    mKm = blackHoleGm(FLOW_HOLE) / (C_KM_S * C_KM_S);
    if (!(mKm > 0)) return false;
  }
  const d = Math.sqrt(x * x + y * y + z * z);
  if (!(d > 0)) return false;
  out.distKm = d;
  out.rM = d / mKm;
  out.cosI = (x * flowAxisWorld[0] + y * flowAxisWorld[1] + z * flowAxisWorld[2]) / d;
  return true;
}

/**
 * The share of the flow drawn as a point, from its ring's radius in device px (1 below 1.5 px, 0 above 3 px): the
 * ring's look angle for a hovering observer, sin α = b √(1 − 2/r)/r.
 */
export function flowPointShare(rM: number, devicePxPerRad: number): number {
  const s = rM > 2 ? (FLOW_RING_M * Math.sqrt(1 - 2 / rM)) / rM : 1;
  const ringPx = (s >= 1 ? Math.PI / 2 : Math.asin(s)) * devicePxPerRad;
  if (ringPx <= FLOW_UNRESOLVED_PX) return 1;
  if (ringPx >= FLOW_RESOLVED_PX) return 0;
  return (FLOW_RESOLVED_PX - ringPx) / (FLOW_RESOLVED_PX - FLOW_UNRESOLVED_PX);
}

/** The flow's point from the camera now, written into `out` (nothing allocated). Holes without a flow: V 99. */
export function flowPoint(holeId: BodyId, out: FlowPoint): FlowPoint {
  out.spectralIndex = FLOW_SPECTRAL_INDEX;
  out.rgb[0] = FLOW_V_RGB[0];
  out.rgb[1] = FLOW_V_RGB[1];
  out.rgb[2] = FLOW_V_RGB[2];
  out.magnitude = 99;
  out.pointShare = 1;
  if (holeId !== FLOW_HOLE || !getBody(FLOW_HOLE)?.blackHole?.flow) return out;
  const ui = useUI.getState();
  if (!ui.accretionFlow || !flowView(viewScratch)) return out;
  const v = viewScratch;
  const share = flowPointShare(v.rM, pxPerRad());
  out.pointShare = share;
  // With the lens off a resolved flow is not drawn at all (straight, its image would be wrong).
  if (!ui.lensing && share <= 0) return out;
  const deg = (Math.acos(Math.max(-1, Math.min(1, v.cosI))) * 180) / Math.PI;
  // A hovering observer's blueshift of light from far away (x = 2/r: −½ ln(1 − x)).
  const lnG = v.rM > 2 ? -0.5 * Math.log1p(-2 / v.rM) : 0;
  const dPc = v.distKm / PARSEC_KM;
  out.magnitude = flowMag8277(deg) + 5 * Math.log10(dPc / flowModel.distancePc) - 2.5 * (1 - FLOW_SPECTRAL_INDEX) * (lnG / Math.LN10);
  return out;
}

/** Texts for the interface (ui/): the card's model line, the EHT figure's caption, the View menu's hint. */
export const FLOW_TEXTS = {
  card: 'The glow at the centre is a model of the hot gas falling in (a thin, hot flow fitted to its radio-to-infrared spectrum): never seen in visible light, uncertain about three times either way, and smooth where the real one flickers.',
  menuHint: 'A model of the hot gas falling into Sgr A*. Off: the black hole shows against the sky alone.',
  figureCaption:
    'The Event Horizon Telescope’s 2017 image: a reconstruction at 1.3 mm, ring 51.8 ± 2.3 µas across. Skyfold’s 1.3 mm view is a model, not this image.',
  bandVisible: 'Visible light',
  bandMm: '1.3 mm, as the EHT sees it',
  bandMmHint: 'The model’s brightness at the EHT’s wavelength in false colour (black, red, yellow, white up to 6 × 10¹⁰ K): not light the eye could see.',
  blur: 'Blur to the EHT’s resolution',
  blurHint: 'The EHT’s 20 µas beam as seen from Earth, carried into this view.',
  radio: 'Radio eyes',
  radioHint: 'Radio light (1.3 mm), like the EHT: the model of Sgr A*’s gas in false colour.',
} as const;

/** How a thin disc's brightness is drawn: its visible light, or all of its light (bolometric, mostly X-rays). */
export type DiskLight = 'visible' | 'all';

/** The words of a thin accretion disc (Cygnus X-1's: render/disk/diskMap.ts) where the interface names it. */
export const DISK_TEXTS = {
  menu: 'Accretion discs',
  menuHint: 'Thin discs of hot gas where one really shines (Cygnus X-1, LMC X-1, LMC X-3, M33 X-7, GRS 1915+105): models of a typical state, turning 1,000 times slower than real.',
} as const;
