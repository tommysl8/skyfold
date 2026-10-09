import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { _roots, addAfterEffect, addEffect } from '@react-three/fiber';
import './index.css';
import App from './App';
import { dismissBootWhenDrawn } from './ui/boot';
import { loadSolarSystem } from './sim/solarSystem';
import { loadStars } from './sim/stars';
import { loadFeaturedExoplanets } from './sim/exoplanets';
import { loadGalaxy } from './sim/galaxy';
import { loadCosmos } from './sim/cosmos';
import { registerPhenomena } from './sim/phenomena';
import { registerSatellites } from './sim/satellites';
import { startPlaces } from './ui/resume';

if (import.meta.env.DEV) {
  // When the first frame begins and each of the first 30 ends, for __ls.perf.compiles() (dev/perf.ts):
  // the start-up total, which shader compiles stop. Recorded here because the debug modules load too late.
  const startup = { firstStartMs: NaN, endsMs: [] as number[] };
  Object.assign(window, { __lsStartup: startup });
  const stopStart = addEffect(() => {
    if (_roots.size === 0) return; // no canvas yet: nothing is drawn
    startup.firstStartMs = performance.now();
    stopStart();
  });
  const stopEnds = addAfterEffect(() => {
    if (Number.isNaN(startup.firstStartMs)) return;
    startup.endsMs.push(performance.now());
    if (startup.endsMs.length >= 30) stopEnds();
  });

  // Debug handle for development only (tree-shaken from production builds).
  Promise.all([
    import('./sim/sim'),
    import('./controls/cameraController'),
    import('./state/ui'),
    import('@react-three/fiber'),
    import('./ui/tripActions'),
    import('./render/relativisticView'),
    import('./sim/travel'),
    import('./sim/chronometer'),
    import('./sim/pulses'),
    import('./sim/solarSystem'),
    import('./sim/bodies/registry'),
    import('./ui/navigation'),
    import('./sim/stars'),
    import('./content/scenes'),
    import('./sim/exoplanets'),
    import('./render/materials'),
    import('./sim/galaxy'),
    import('./render/galaxyLayer'),
    import('./sim/cosmos'),
    import('./sim/gravity'),
    import('./render/lens/lensState'),
    import('./sim/fall'),
    import('./sim/blackholes'),
    import('./sim/galaxy/nuclearCluster'),
    import('./render/gpuBudget'),
    import('./dev/lensTest'),
    import('./dev/perf'),
    import('./sim/surveys/load'),
    import('./scene/Surveys'),
    import('./sim/surveys/lod'),
    import('./sim/asteroids/load'),
    import('./sim/asteroids/bodies'),
    import('./scene/asteroidPick'),
    import('./scene/Asteroids'),
    import('./sim/deepsky'),
    import('./scene/GalaxyPictures'),
    import('./sim/phenomena'),
    import('./sim/satellites'),
  ]).then(([s, c, u, fiber, trip, rel, travel, chrono, pulses, solarSystem, registry, navigation, stars, scenes, exoplanets, materials, galaxy, galaxyLayer, cosmos, gravity, lens, fall, blackholes, nsc, gpuBudget, lensTest, perf, surveyLoad, surveyScene, surveyLod, smallLoad, smallBodies, smallPick, smallScene, deepSky, pictures, phen, sats]) =>
    Object.assign(window, {
      __ls: {
        sim: s.sim,
        controller: c.controller,
        ui: u.useUI,
        trip,
        travel: travel.travel,
        relView: rel.relView,
        chrono: chrono.chrono,
        pulses: pulses.pulses,
        solarSystem,
        registry,
        navigation,
        stars,
        scenes,
        exoplanets,
        materials,
        galaxy,
        galaxyLayer: galaxyLayer.galaxyLayer,
        cosmos,
        /** The black hole that matters from here (sim/gravity.ts). */
        gravity: gravity.gravity,
        /** The lens this frame (render/lens/lensState.ts). */
        lens: lens.lens,
        /** A fall into a black hole (sim/fall.ts). */
        fall,
        /** The real black holes besides Sgr A* (sim/blackholes). */
        blackholes,
        /** The nuclear star cluster's field and glow (sim/galaxy/nuclearCluster.ts). */
        nsc,
        /** The GPU-time controller (render/gpuBudget.ts). */
        gpuBudget: gpuBudget.gpuBudget,
        /** The lens's checks on the GPU (dev/lensTest.ts). */
        lensTest: lensTest.lensTest,
        /** Whole-frame GPU timing (dev/perf.ts). */
        perf: perf.perf,
        /** The galaxy surveys: what has loaded (bytes, files) of the surveys and of Quaia, this frame's draw, and the point budget (sim/surveys, scene/Surveys.tsx). */
        surveys: { state: surveyLoad.survey, quaia: surveyLoad.quaia, frame: surveyScene.surveyFrame, budget: gpuBudget.surveyBudget, reset: surveyLoad.resetSurvey, glow: surveyLod.glowSettings },
        /** The deep-sky catalogues: the gate, and through it the runtime once loaded (sim/deepsky). */
        deepSky: deepSky.deepSkyGate,
        /** The supernovae, the kilonova, the jets and the aurora: what is wanted and each one's state this frame (sim/phenomena). */
        phenomena: phen.phenomena,
        /** The ISS, Tiangong, Hubble and the satellite swarm: what has loaded and what shows (sim/satellites). */
        satellites: sats.satellites,
        /** The galaxies' photographs mounted, and each galaxy's share of light they draw this frame (scene/GalaxyPictures.tsx). */
        pictures: { mounted: pictures.galaxyPictures, shares: pictures.pictureShares },
        /** The asteroids and comets: what has loaded, the drawn sections, picking and registering one (sim/asteroids, scene/Asteroids.tsx). */
        asteroids: { state: smallLoad.smallBodies, sections: smallPick.layerSections, pick: smallPick.pickSmallBody, ensure: smallBodies.ensureSmallBody, look: smallScene.asteroidLook, frame: smallScene.asteroidFrame },
        /** Render n frames with a fixed timestep (works while the tab is hidden). */
        step(n = 60, dt = 1 / 60) {
          s.sim.debugDt = dt;
          for (let i = 0; i < n; i++) fiber.advance(performance.now());
          s.sim.debugDt = 0;
        },
      },
    }),
  );
}

// A link's place (?at=…) is gone to, or a returning visitor offered the last one, and the view is saved from now on
// (ui/resume.ts). Before the first render: a link skips the welcome screen.
startPlaces();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The loading screen goes once the view is drawn (ui/boot.ts).
dismissBootWhenDrawn();

// The moons, dwarf planets, comets and spacecraft: their data load in the background once the
// first frames are up, and they join the scene, the lists and search when they arrive
// (sim/solarSystem).
void loadSolarSystem({ idle: true });

// The 3D stars: the naked-eye ones within a second, then the whole catalogue and the star
// systems, decoded in a worker (sim/stars).
void loadStars({ idle: true });

// The planets of other stars: the eleven featured systems once the stars are in (sim/exoplanets);
// the archive's 6,372 planets load when they are first wanted.
void loadFeaturedExoplanets();

// The Milky Way: Sagittarius A* and its stars at once, the nebulae soon after, and the model of the
// Galaxy and the star clusters once the stars are in (sim/galaxy).
void loadGalaxy({ idle: true });

// The galaxies beyond: the Local Group and the named galaxies, clusters and young galaxies once the
// browser is idle, their shapes built in a worker; the cosmic web loads when it is first wanted
// (sim/cosmos).
void loadCosmos({ idle: true });

// The historical supernovae and the kilonova of GW170817: six records and one, registered at once; their models load
// when one is first near (sim/phenomena).
registerPhenomena();

// The ISS, Tiangong and Hubble: registered at once, placed by SGP4 once their elements arrive from CelesTrak (when the
// browser is idle); every other satellite only when the View menu's switch is turned on (sim/satellites).
registerSatellites({ idle: true });
