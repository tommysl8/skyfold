import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deferredStorage } from '../lib/persistStorage';
import type { BodyId } from '../sim/bodies';
import type { SizeMode } from '../sim/sim';
import type { ExplainerId } from '../content/explainers';
import type { AccretionBand, DiskLight } from '../sim/blackholes/accretion';

/**
 * What the camera is doing: orbiting a target, roaming (the camera flown by hand, no speed limit: 'roam'),
 * flying the ship by hand (light-speed limit, relativity on: 'free'), a slew, a trip; and near a black hole
 * a fall ('fall'), a circular geodesic orbit ('circular') or a snapshot at speed with its schedule ('hold').
 */
export type ControlMode = 'orbit' | 'roam' | 'free' | 'transition' | 'travel' | 'fall' | 'circular' | 'hold';

/**
 * The black-hole panel's state near one hole, chosen by the visitor (the chip's Details, the panel's Hide) or by
 * what they started (a black-hole scene, a fall): open or not, for that hole, until the camera leaves it.
 */
export interface HolePanelChoice {
  hole: BodyId;
  open: boolean;
}
export type ScopeChannel = 'beta' | 'gamma' | 'range' | 'dopplerFwd' | 'dtau';

export interface UIState {
  /** Body shown on the body card and the instruments' target data sheet. */
  selected: BodyId | null;
  /** Body the orbit camera is centred on. */
  focus: BodyId;
  controlMode: ControlMode;
  sizeMode: SizeMode;
  showOrbits: boolean;
  showLabels: boolean;
  showBelts: boolean;
  /** Viewport instruments: reticle, scale bar, axis triad, apex markers. */
  showOverlays: boolean;
  /** Ecliptic coordinate grid on the sky. */
  showGrid: boolean;
  /**
   * Constellation figures and names between the 3D stars: on, off, or 'auto', shown only from
   * interstellar distances (the camera more than 0.2 pc from the Sun; ui/constellations.ts).
   */
  constellations: 'auto' | 'on' | 'off';
  /**
   * Rings around the stars with known planets: on, off, or 'auto', shown only from interstellar
   * distances, as the constellations are (ui/planetHosts.ts).
   */
  planetHosts: 'auto' | 'on' | 'off';
  /**
   * The cosmic web (the galaxies of Cosmicflows-4 as points): on, off, or 'auto', shown only from
   * beyond the Local Group (ui/cosmicLayers.ts).
   */
  cosmicWeb: 'auto' | 'on' | 'off';
  /**
   * The galaxy surveys (DESI and the SDSS as points): on, off, or 'auto', loaded and shown only from beyond the local
   * universe (ui/cosmicLayers.ts).
   */
  surveys: 'auto' | 'on' | 'off';
  /**
   * The deep-sky catalogues' markers (sim/deepsky; ui/deepSkyLayers.ts): the NGC and IC objects with measured distances
   * and the supernova remnants; the pulsars; the gravitational-wave events. On, off, or 'auto': shown where they help.
   */
  deepSky: 'auto' | 'on' | 'off';
  pulsars: 'auto' | 'on' | 'off';
  gwEvents: 'auto' | 'on' | 'off';
  /**
   * Earth's auroral ovals (sim/phenomena/aurora.ts), on the night side, and the geomagnetic activity they are drawn
   * for: the Kp index, 0 (quiet) to 9 (an extreme storm), or 'auto', the Kp measured at the date (GFZ; sim/spaceWeather).
   */
  aurora: boolean;
  auroraKp: number | 'auto';
  /** Coronal mass ejections in flight on the date, as faint fronts (sim/spaceWeather). */
  cmes: boolean;
  /** Relativistic jets: M87's and Centaurus A's (sim/phenomena/jets.ts). */
  jets: boolean;
  /**
   * The satellites round Earth (sim/satellites, scene/Satellites.tsx): every active one CelesTrak lists, fetched when
   * first turned on; and within it, the tracked debris of four break-ups. Off by default. The ISS, Tiangong and Hubble
   * are bodies and always there.
   */
  satellites: boolean;
  satelliteDebris: boolean;
  /** Magnetic field lines: the Sun's and the planets' measured fields, and the Milky Way's (sim/fields). */
  fieldLines: boolean;
  /** The map of the cosmic microwave background over the sky (contrast enhanced). */
  showCmb: boolean;
  /**
   * Where the mass is (sim/galaxy/darkLayer.ts): the Milky Way's dark halo as a fog of its projected density, tracer stars
   * orbiting with and without it, and the Bullet Cluster's gas and lensing mass. A diagnostic overlay, off by default and
   * not saved (as the CMB map).
   */
  darkMatter: boolean;
  /** First-visit welcome screen. */
  welcomeOpen: boolean;
  /** Guided tour: index of the step shown, or null. */
  tourStep: number | null;
  /** The list of one-click journeys. */
  journeysOpen: boolean;
  /** The keyboard and mouse sheet. */
  keysOpen: boolean;
  /** The "Where to?" search palette. */
  searchOpen: boolean;
  /** What to look for on the journey under way (shown on the flight recorder). */
  journeyNote: string | null;
  /** Card with facts and actions for the selected body (closable; returns on the next selection). */
  bodyCard: boolean;
  /** Single-key shortcuts (off for users of assistive technology that needs the keys). */
  shortcuts: boolean;
  /** Frame-rate and render-quality readout in the status bar. */
  showFps: boolean;
  /** Free-flight throttle as a fraction of c (mirrors the controller). */
  throttleBeta: number;
  /**
   * Clean full screen: every piece of text and chrome hidden, the view alone (ui/cleanMode.ts); the
   * controls keep working. Never saved: a reload always shows the interface.
   */
  clean: boolean;

  /** Mirrors of the simulation clock, for rendering controls. */
  warp: number;
  paused: boolean;

  /** Draw bodies where they were when the light now reaching you left them. */
  retarded: boolean;

  /** Relativistic optics: off (classical), on, or split screen classical | relativistic. */
  relMode: 'off' | 'on' | 'split';
  /** Split-screen divider position (fraction of the viewport width). */
  splitX: number;
  /** Include Doppler shift and beaming (off: aberration only). */
  relDoppler: boolean;

  /** Docked panels: the physics reference (left) and the instruments (right). */
  leftOpen: boolean;
  rightOpen: boolean;
  /** Dock widths, CSS px (resizable). */
  leftWidth: number;
  rightWidth: number;
  /** Section open in the physics reference. */
  refTopic: ExplainerId;
  /** A reference section suggested by what just happened (shown as a margin note). */
  noteTopic: ExplainerId | null;
  /**
   * Physics margin notes: suggest an explanation the first time something happens (past 0.1c,
   * a change of scale …). Off by default, so nothing pops up unasked.
   */
  hints: boolean;
  scopeChannel: ScopeChannel;

  /** Flight planner. */
  plannerOpen: boolean;
  /** Drive: constant cruise speed, realistic 1 g rocket, or fictional warp beyond c. */
  plannerDrive: 'cruise' | 'rocket' | 'warp';
  /** Warp speed as a multiple of c (fictional). */
  plannerWarpFactor: number;
  plannerDest: BodyId;
  plannerBeta: number;
  tripActive: boolean;

  // Black holes. None of these is saved between visits (savedPrefs leaves them out): a visitor who turned
  // lensing off once must not find every black hole invisible on the next visit.
  /** View › Gravitational lensing. Off: light is drawn straight, only the flow's point shows, and the hole cannot be seen. */
  lensing: boolean;
  /** View › Accretion flow (on: the real flow exists and would be seen). */
  accretionFlow: boolean;
  /** View › Accretion discs: a thin disc where one really shines (Cygnus X-1's; on: it exists and would be seen). */
  accretionDisks: boolean;
  /** Cygnus X-1's card: the disc's brightness in all of its light (bolometric, mostly X-rays) or its visible light alone. */
  diskLight: DiskLight;
  /** Sgr A*'s card: the flow in visible light, or at 1.3 mm as the Event Horizon Telescope sees it (false colour). */
  accretionBand: AccretionBand;
  /** Sgr A*'s card: blur the 1.3 mm view to the Event Horizon Telescope's resolution as seen from Earth. */
  ehtBlur: boolean;
  /** A fall into a black hole is under way (set with tripActive, so every trip's gate holds). */
  fallActive: boolean;
  /**
   * View › Open the black-hole panel automatically (saved; off by default). Off, near a black hole a small chip
   * offers the panel, which opens by itself only for a black-hole scene or a fall (ui/flight/HoleStrip.tsx).
   */
  holePanelAuto: boolean;
  /** The visitor's (or a scene's) choice for the panel near the hole the camera is at; null: the default. Not saved. */
  holePanel: HolePanelChoice | null;
  /**
   * The notes on the data layers put away with their Hide (ui/viewport/LayerCards.tsx: 'cmb', 'web', 'surveys', 'flow',
   * 'belts', 'nsc'): hiding a note leaves its layer as it is. Saved; View › Layer notes brings them all back.
   */
  hiddenNotes: string[];

  select: (id: BodyId | null) => void;
  toggle: (
    key:
      | 'showOrbits'
      | 'showLabels'
      | 'showBelts'
      | 'showOverlays'
      | 'showGrid'
      | 'showCmb'
      | 'retarded'
      | 'showFps'
      | 'leftOpen'
      | 'rightOpen'
      | 'shortcuts'
      | 'hints'
      | 'lensing'
      | 'accretionFlow'
      | 'accretionDisks'
      | 'holePanelAuto'
      | 'aurora'
      | 'cmes'
      | 'jets'
      | 'satellites'
      | 'satelliteDebris'
      | 'fieldLines'
      | 'darkMatter',
  ) => void;
  setSizeMode: (m: SizeMode) => void;
}

export const WELCOME_KEY = 'lightspeed.welcome';

/** Bring preferences saved by an earlier version up to date (see the persist options below). */
export function migrateUI(old: unknown, version: number): Partial<UIState> {
  let s = (old ?? {}) as Partial<UIState>;
  // v4 added the physics margin notes, off; v5 closed the docks again, so neither appears by itself.
  if (version < 4) s = { ...s, hints: false };
  if (version < 5) s = { ...s, rightOpen: false };
  // v6 keeps only what it saves: a key nothing reads any more must not linger in the store.
  if (version < 6) {
    const kept = new Set(Object.keys(savedPrefs({} as UIState)));
    s = Object.fromEntries(Object.entries(s).filter(([k]) => kept.has(k))) as Partial<UIState>;
  }
  return s;
}

/**
 * What is saved between visits: preferences only; the simulation always starts fresh. The black holes'
 * switches (lensing, accretionFlow, accretionDisks, accretionBand, ehtBlur) are left out on purpose: a visitor who turned
 * lensing off once must not find every black hole invisible on the next visit (so no version change either).
 */
export const savedPrefs = (s: UIState) => ({
  showOrbits: s.showOrbits,
  showLabels: s.showLabels,
  showBelts: s.showBelts,
  showOverlays: s.showOverlays,
  showGrid: s.showGrid,
  constellations: s.constellations,
  planetHosts: s.planetHosts,
  cosmicWeb: s.cosmicWeb,
  surveys: s.surveys,
  // New in this version with their default ('auto'): a saved state without them keeps it, so no migration.
  deepSky: s.deepSky,
  pulsars: s.pulsars,
  gwEvents: s.gwEvents,
  // New in this version with their defaults (on, Kp 3): a saved state without them keeps them, so no migration.
  aurora: s.aurora,
  auroraKp: s.auroraKp,
  // New in this version with its default (on), and Kp's new default 'auto': a saved state without them keeps them.
  cmes: s.cmes,
  jets: s.jets,
  // New in this version with their defaults (off): no migration.
  satellites: s.satellites,
  satelliteDebris: s.satelliteDebris,
  // New in this version with its default (off): a saved state without it keeps it, so no migration.
  fieldLines: s.fieldLines,
  showFps: s.showFps,
  // Not leftOpen: the physics reference opens only when asked for, never on a reload.
  rightOpen: s.rightOpen,
  leftWidth: s.leftWidth,
  rightWidth: s.rightWidth,
  refTopic: s.refTopic,
  scopeChannel: s.scopeChannel,
  relDoppler: s.relDoppler,
  shortcuts: s.shortcuts,
  hints: s.hints,
  // New in this version with its default (off) for everyone: a saved state without it keeps the default, so no migration.
  holePanelAuto: s.holePanelAuto,
  // New in this version with its default (none hidden): no migration.
  hiddenNotes: s.hiddenNotes,
});

function welcomed(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true;
  }
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      selected: null,
      focus: 'earth',
      controlMode: 'orbit',
      sizeMode: 'true',
      showOrbits: true,
      showLabels: true,
      showBelts: true,
      showOverlays: true,
      showGrid: false,
      constellations: 'auto',
      planetHosts: 'auto',
      cosmicWeb: 'auto',
      surveys: 'auto',
      deepSky: 'auto',
      pulsars: 'auto',
      gwEvents: 'auto',
      aurora: true,
      auroraKp: 'auto',
      cmes: true,
      jets: true,
      satellites: false,
      satelliteDebris: false,
      fieldLines: false,
      showCmb: false,
      darkMatter: false,
      welcomeOpen: !welcomed(),
      tourStep: null,
      journeysOpen: false,
      keysOpen: false,
      searchOpen: false,
      journeyNote: null,
      bodyCard: true,
      shortcuts: true,
      showFps: false,
      throttleBeta: 0,
      clean: false,
      warp: 1,
      paused: false,
      retarded: false,
      relMode: 'on',
      splitX: 0.5,
      relDoppler: true,
      // Both panels start closed: a first visit opens on the view alone.
      leftOpen: false,
      rightOpen: false,
      leftWidth: 384,
      rightWidth: 312,
      refTopic: 'light-time',
      noteTopic: null,
      hints: false,
      scopeChannel: 'beta',
      plannerOpen: false,
      plannerDrive: 'cruise',
      plannerWarpFactor: 10,
      plannerDest: 'mars',
      plannerBeta: 0.5,
      tripActive: false,
      lensing: true,
      accretionFlow: true,
      accretionDisks: true,
      diskLight: 'all',
      accretionBand: 'visible',
      ehtBlur: false,
      fallActive: false,
      holePanelAuto: false,
      holePanel: null,
      hiddenNotes: [],
      // Selecting a body brings its card back if it was closed.
      select: (id) => set((s) => ({ selected: id, bodyCard: id ? true : s.bodyCard })),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<UIState>),
      setSizeMode: (m) => set({ sizeMode: m }),
    }),
    {
      name: 'lightspeed.ui',
      version: 6,
      storage: deferredStorage,
      // Earlier versions' preferences are brought up to date by migrateUI.
      migrate: (old, version) => migrateUI(old, version) as UIState,
      // Only preferences persist; the simulation always starts fresh.
      partialize: savedPrefs,
    },
  ),
);
