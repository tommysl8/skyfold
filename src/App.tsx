import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { Canvas } from '@react-three/fiber';
import { SimDriver } from './scene/SimDriver';
import { Starfield } from './scene/Starfield';
import { MilkyWayBackground } from './scene/MilkyWay';
import { GalaxyModel } from './scene/GalaxyModel';
import { Nebulae } from './scene/Nebulae';
import { GalaxyPictures } from './scene/GalaxyPictures';
import { Galaxies } from './scene/Galaxies';
import { CosmicWeb } from './scene/CosmicWeb';
import { Surveys } from './scene/Surveys';
import { CmbMap } from './scene/CmbMap';
import { Constellations } from './scene/Constellations';
import { PlanetHosts } from './scene/PlanetHosts';
import { Bodies } from './scene/Bodies';
import { StellarNebulae } from './scene/StellarNebulae';
import { Orbits } from './scene/Orbits';
import { Asteroids } from './scene/Asteroids';
import { CometTails } from './scene/CometTails';
import { Glints } from './scene/Glints';
import { NuclearCluster } from './scene/NuclearCluster';
import { LensRings } from './scene/LensRings';
import { AccretionFlow } from './scene/AccretionFlow';
import { AccretionDisk } from './scene/AccretionDisk';
import { BlackHoleLens } from './scene/BlackHoleLens';
import { LightPulses } from './scene/LightPulses';
import { EclipticGrid } from './scene/EclipticGrid';
import { RenderPipeline } from './render/RenderPipeline';
import { AdaptiveQuality } from './render/AdaptiveQuality';
import { LabelSync, LabelsLayer } from './ui/Labels';
import { HoverSync, HoverTagLayer } from './ui/HoverTag';
import { ConstellationNameSync, ConstellationNamesLayer } from './ui/ConstellationNames';
import { Header } from './ui/layout/Header';
import { Footer } from './ui/layout/Footer';
import { ReferenceDock } from './ui/reference/ReferenceDock';
import { InstrumentsDock } from './ui/instruments/InstrumentsDock';
import { OverlaySync, ViewportInstruments } from './ui/viewport/Overlays';
import { ViewportChrome } from './ui/viewport/ViewportChrome';
import { TrajectoryPlanner } from './ui/flight/TrajectoryPlanner';
import { FlightStrip } from './ui/flight/FlightStrip';
import { HoleStrip } from './ui/flight/HoleStrip';
import { RoamTouchPad } from './ui/flight/RoamPanel';
import { CleanHint } from './ui/viewport/CleanHint';
import { appClass, leaveClean } from './ui/cleanMode';
import { Welcome } from './ui/overlays/Welcome';
import { Tour } from './ui/overlays/Tour';
import { Journeys } from './ui/overlays/Journeys';
import { KeysSheet } from './ui/overlays/KeysSheet';
import { Search } from './ui/overlays/Search';
import { PlacePrompt } from './ui/overlays/PlacePrompt';
import { useShortcuts } from './ui/useShortcuts';
import { useExplainerTriggers } from './ui/useExplainerTriggers';
import { useUI } from './state/ui';
import { useDocRoute } from './state/route';
import { deepSkyGate, subscribeDeepSky } from './sim/deepsky';
import { phenomena, subscribePhenomena } from './sim/phenomena';
import { spaceWeather, subscribeSpaceWeather } from './sim/spaceWeather';

// The reading pages (with KaTeX) load on first use.
const DocView = lazy(() => import('./ui/docs/DocView'));
// So do the deep-sky catalogues' markers, with their runtime, once a catalogue is first wanted (sim/deepsky).
const DeepSky = lazy(() => import('./scene/DeepSky'));
// And the phenomena's models (supernovae, the kilonova, the jets, the aurora), once one is first near (sim/phenomena).
const Phenomena = lazy(() => import('./scene/Phenomena'));
// And the field lines threading the black holes, while View › Magnetic field lines is on (sim/blackholes/holeField.ts).
const HoleFieldLines = lazy(() => import('./scene/HoleFieldLines'));

function HoleFieldLayer() {
  const on = useUI((s) => s.fieldLines);
  return on ? (
    <Suspense fallback={null}>
      <HoleFieldLines />
    </Suspense>
  ) : null;
}

// And the Milky Way's magnetic field, while View › Magnetic field lines is on (nothing of it loads or runs before).
const GalacticField = lazy(() => import('./scene/GalacticField'));

function GalacticFieldLayer() {
  const on = useUI((s) => s.fieldLines);
  return on ? (
    <Suspense fallback={null}>
      <GalacticField />
    </Suspense>
  ) : null;
}
// And the magnetic field lines, the first time View › Magnetic field lines is turned on (sim/fields).
const FieldLines = lazy(() => import('./scene/FieldLines'));

// And the fronts of the coronal mass ejections, the first time one is in flight near the camera (sim/spaceWeather).
const SpaceWeather = lazy(() => import('./scene/SpaceWeather'));

function SpaceWeatherLayer() {
  const started = useSyncExternalStore(subscribeSpaceWeather, () => spaceWeather.started);
  return started ? (
    <Suspense fallback={null}>
      <SpaceWeather />
    </Suspense>
  ) : null;
}

function PhenomenaLayer() {
  const started = useSyncExternalStore(subscribePhenomena, () => phenomena.started);
  return started ? (
    <Suspense fallback={null}>
      <Phenomena />
    </Suspense>
  ) : null;
}

/** Mounted only while the view is on: off, nothing of it draws (what it traced is kept for next time). */
function FieldLinesLayer() {
  const on = useUI((s) => s.fieldLines);
  return on ? (
    <Suspense fallback={null}>
      <FieldLines />
    </Suspense>
  ) : null;
}

function DeepSkyLayer() {
  const started = useSyncExternalStore(subscribeDeepSky, () => deepSkyGate.started);
  return started ? (
    <Suspense fallback={null}>
      <DeepSky />
    </Suspense>
  ) : null;
}

/**
 * Below 900 px the docks overlay the viewport. Show one at a time, and clear them away when the
 * planner opens or a trip starts, so neither hides under a dock.
 */
function useNarrowDocks() {
  useEffect(
    () =>
      useUI.subscribe((s, prev) => {
        if (window.innerWidth >= 900) return;
        if ((s.plannerOpen && !prev.plannerOpen) || (s.tripActive && !prev.tripActive)) {
          if (s.leftOpen || s.rightOpen) useUI.setState({ leftOpen: false, rightOpen: false });
        } else if (s.leftOpen && s.rightOpen) {
          useUI.setState(prev.leftOpen ? { leftOpen: false } : { rightOpen: false });
        }
      }),
    [],
  );
}

/** A reading page or a dialog over the view brings the interface back from clean full screen. */
function useCleanLeaves(covered: boolean) {
  useEffect(() => {
    if (covered) leaveClean();
  }, [covered]);
}

export default function App() {
  useShortcuts();
  useExplainerTriggers();
  useNarrowDocks();
  const leftOpen = useUI((s) => s.leftOpen);
  const rightOpen = useUI((s) => s.rightOpen);
  const clean = useUI((s) => s.clean);
  const dialog = useUI((s) => s.welcomeOpen || s.tourStep !== null || s.journeysOpen || s.searchOpen || s.keysOpen);
  const doc = useDocRoute();
  useCleanLeaves(!!doc || dialog);
  return (
    // Clean full screen hides everything but the view's canvas (index.css, .app-clean): nothing is closed, so all comes back as it was.
    <div className={appClass(clean)}>
      <Header />
      {leftOpen && <ReferenceDock />}
      <main className="app-view select-none" aria-label="Simulation view" data-tour="view">
        <Canvas
          // While a reading page covers the screen the simulation pauses and nothing is drawn.
          frameloop={doc ? 'never' : 'always'}
          flat
          dpr={[1, 2]}
          gl={{
            logarithmicDepthBuffer: true,
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false,
          }}
          // Near 1 m, far 10²⁵ km (beyond the observable universe). The logarithmic depth buffer
          // spreads its 24 bits over log2(10²⁵) = 83 octaves of distance: a relative depth
          // resolution of 3.4 × 10⁻⁶ (34 m at 10,000 km, 3,400 km at a billion km).
          camera={{ fov: 50, near: 0.001, far: 1e25, position: [0, 0, 0] }}
          className="app-canvas !absolute inset-0"
        >
          <SimDriver />
          <MilkyWayBackground />
          <CmbMap />
          <GalaxyModel />
          <Galaxies />
          <GalaxyPictures />
          <Nebulae />
          <Starfield />
          <NuclearCluster />
          <CosmicWeb />
          <Surveys />
          <DeepSkyLayer />
          <PhenomenaLayer />
          <SpaceWeatherLayer />
          <GalacticFieldLayer />
          <FieldLinesLayer />
          <Constellations />
          <PlanetHosts />
          <EclipticGrid />
          <Bodies />
          <StellarNebulae />
          <Orbits />
          <CometTails />
          <Asteroids />
          <Glints />
          <LensRings />
          <AccretionFlow />
          <AccretionDisk />
          <HoleFieldLayer />
          <BlackHoleLens />
          <LightPulses />
          <LabelSync />
          <HoverSync />
          <ConstellationNameSync />
          <OverlaySync />
          <AdaptiveQuality />
          <RenderPipeline />
        </Canvas>
        <ConstellationNamesLayer />
        <LabelsLayer />
        <HoverTagLayer />
        <ViewportInstruments />
        <ViewportChrome />
        <TrajectoryPlanner />
        <FlightStrip />
        <HoleStrip />
        <RoamTouchPad />
        <CleanHint />
        <PlacePrompt />
      </main>
      {rightOpen && <InstrumentsDock />}
      <Footer />
      <Welcome />
      <Tour />
      <Journeys />
      <Search />
      <KeysSheet />
      {doc && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] bg-bg" />}>
          <DocView route={doc} />
        </Suspense>
      )}
    </div>
  );
}
