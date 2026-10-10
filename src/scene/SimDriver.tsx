import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { controller } from '../controls/cameraController';
import { updateDerived } from '../sim/derived';
import { updateEphemeris } from '../sim/ephemeris';
import { earthLight, updateApparentPositions, updateEarthLight } from '../sim/lightDelay';
import { sim } from '../sim/sim';
import { travel } from '../sim/travel';
import { tickClock, tickTrip } from '../sim/tick';
import { updateFall } from '../sim/fall';
import { updateGravity } from '../sim/gravity';
import { lensProgramsReady, updateLens } from '../render/lens/lensState';
import { updateShipKinematics } from '../sim/shipKinematics';
import { updatePulses } from '../sim/pulses';
import { useUI } from '../state/ui';
import { psfUniforms } from '../render/materials';
import { updateRelativisticView } from '../render/relativisticView';
import { onArrival } from '../ui/tripActions';
import { pickAt, pickedBody } from './picking';
import { pickSmallBody } from './asteroidPick';
import { ensureSmallBody } from '../sim/asteroids/bodies';
import { updateNearbyStars, updateStarTime } from '../sim/stars';
import { updateExoplanets } from '../sim/exoplanets';
import { updateDeepSky } from '../sim/deepsky';
import { deepSkyLayersNow } from '../ui/deepSkyLayers';
import { isWithin } from '../sim/bodies';
import { updateCosmicSky } from '../sim/cosmos/expansion';
import { nscPointsGate } from '../sim/galaxy/nuclearCluster';
import { updatePhenomena } from '../sim/phenomena';
import { updateDarkLayer } from '../sim/galaxy/darkLayer';
import { satellites } from '../sim/satellites';

// The nuclear star cluster's points are drawn only once the lensed programs have compiled (scene/NuclearCluster.tsx):
// until then their light stays in the glow (sim/galaxy/nuclearCluster.ts updateNuclear).
nscPointsGate.programsReady = lensProgramsReady;

/**
 * A star registered on demand stays while it (or a planet of it) is looked at, selected or flown
 * to; so does a host registered from the exoplanet archive.
 */
function keepStar(id: string): boolean {
  const ui = useUI.getState();
  const holds = (x: string | null | undefined) => !!x && (x === id || isWithin(x, id));
  return holds(ui.focus) || holds(ui.selected) || holds(ui.plannerDest) || holds(travel.trip?.dest);
}

/**
 * Runs first every frame: advance the clock, update the ephemeris and any trip, move the
 * camera, then sync the three.js camera. It stays at the origin and only takes the
 * orientation: the floating origin.
 *
 * Near a black hole: the clock is paced by a hovering observer's proper time (sim/tick.ts, from the
 * previous frame's gravity state), a fall sets its exact place right after the clock (sim/fall.ts
 * updateFall, so the camera and the gravity state use the same r), the gravity state follows the
 * camera and the ship's rapidity (sim/gravity.ts), and the lens follows the gravity state
 * (render/lens/lensState.ts) before the view observers are set. Far from every hole each of these
 * steps leaves everything as it was.
 */
export function SimDriver() {
  const { camera, gl, size } = useThree();
  const initialised = useRef(false);

  useEffect(() => {
    controller.attach(gl.domElement);
    // A ring round a star with planets picks that star, registering it (and its planets) if need be.
    const pick = (x: number, y: number) => pickedBody(pickAt(x, y, camera as PerspectiveCamera));
    // A body of the small-body layer nearer the pointer than any body's marker becomes a body (its data fetched
    // first, so it is selected a moment later, unless another click came meanwhile); a resolved disc under the
    // pointer always wins.
    let clicks = 0;
    const pickAny = (x: number, y: number, then: (id: string) => void): string | null => {
      const click = ++clicks;
      const id = pick(x, y);
      const b = id ? sim.bodies[id] : undefined;
      const px = b ? Math.hypot(b.screen.x - x, b.screen.y - y) : Infinity;
      if (b && (px < 2 || (b.radiusPx > 2 && px < b.radiusPx))) return id;
      const small = pickSmallBody(gl, camera as PerspectiveCamera, x, y);
      // A satellite of the swarm (scene/Satellites.tsx), when it is nearer than both.
      const sat = satellites.pick?.(x, y);
      if (sat && sat.px < px && (!small || sat.px < small.px) && satellites.ensure) {
        void satellites.ensure(sat.index).then((sid) => {
          if (sid && click === clicks) then(sid);
        });
        return null;
      }
      if (!small || small.px >= px) return id;
      void ensureSmallBody(small).then((sid) => {
        if (sid && click === clicks) then(sid);
      });
      return null;
    };
    controller.onClick = (x, y) => useUI.getState().select(pickAny(x, y, (sid) => useUI.getState().select(sid)));
    controller.onDoubleClick = (x, y) => {
      const go = (id: string) => {
        useUI.getState().select(id);
        controller.goTo(id);
      };
      const id = pickAny(x, y, go);
      if (id) go(id);
    };
    return () => controller.detach();
  }, [gl, camera]);

  useFrame((_, delta) => {
    const dtReal = sim.debugDt > 0 ? sim.debugDt : Math.min(delta, 0.1);
    const ui = useUI.getState();
    sim.sizeMode = ui.sizeMode;
    sim.viewport.width = size.width;
    sim.viewport.height = size.height;
    const cam = camera as PerspectiveCamera;
    sim.camera.fovDeg = cam.fov;

    // Clock: a real trip plays by ship time and sets the Earth clock from it; a clock showing
    // the present follows the computer's clock (frames are clamped, and stop in a hidden tab or
    // under a reading page); otherwise the clock runs at the time warp. Scripted stepping
    // (debugDt) keeps to its own steps.
    const dtSim = tickClock(dtReal, sim.debugDt > 0 ? undefined : Date.now());
    // A fall into a black hole: its exact radius and direction, before the camera and gravity use them.
    updateFall();

    // World
    updateEphemeris();
    // The supernovae's and the kilonova's light at this date, and which of the phenomena's models are near (sim/phenomena)
    updatePhenomena();
    // The variable stars' light at this date, and the Sun at the age it is shown (sim/stars)
    updateStarTime();
    if (!initialised.current) {
      initialised.current = true;
      controller.placeAt('earth', 26_000);
    }
    // Trip and chronometers (both exact at any frame length)
    const arrived = tickTrip(dtSim);
    if (arrived) onArrival(arrived.dest);

    // Bodies that do not exist at this date (Voyager 1 before 1980) cannot stay targeted.
    if (!sim.bodies[ui.focus]?.present && controller.mode !== 'travel') controller.goTo('earth');
    if (ui.selected && !sim.bodies[ui.selected]?.present) ui.select(null);
    updatePulses();

    // Camera (floating origin: the three.js camera never leaves the origin)
    controller.update(dtReal, dtSim, travel.shipPos);
    camera.position.set(0, 0, 0);
    camera.quaternion.copy(sim.camera.quat);
    camera.updateMatrixWorld();
    // Stars the camera comes close to become bodies (drawn from float64); those left behind go.
    updateNearbyStars(keepStar);
    // The exoplanet archive loads once it is wanted; hosts registered from it go when left behind.
    updateExoplanets(keepStar, ui.focus);
    // The deep-sky catalogues load when their layer first shows; their objects chosen as bodies go when let go of.
    updateDeepSky(keepStar, deepSkyLayersNow());
    // How much of the dark-matter layer shows (View › Dark matter), from the camera (sim/galaxy/darkLayer.ts).
    updateDarkLayer(dtReal);
    // The observer's rapidity, exact at any γ (from the trip model while flying)
    updateShipKinematics();
    // The black hole that matters from here, if any: its exact distance, clocks and frames (sim/gravity.ts)
    updateGravity();

    // What the camera sees
    updateApparentPositions(ui.retarded);
    // The galaxies' light in the expanding universe: redshifts, and where each is seen (sim/cosmos/expansion.ts)
    updateCosmicSky(ui.retarded);
    // Its lens: tables, zones, boxes and uniforms (render/lens/lensState.ts)
    updateLens();
    updateRelativisticView(ui.relMode, ui.splitX, ui.relDoppler, !!travel.trip?.warp);
    // Roaming, no body is in focus (the one last orbited keeps no label from afar, nor a lensed image of its own).
    updateDerived(cam, ui.controlMode === 'roam' ? undefined : ui.focus, ui.selected);
    if (sim.frame - earthLight.frame >= 12) updateEarthLight();
    psfUniforms.uPixelRatio.value = gl.getPixelRatio();
    sim.frame++;
  }, -10);

  return null;
}
