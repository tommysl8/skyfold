/**
 * The body registry's public face. Import bodies from here (not from registry.ts): this module
 * registers the built-in bodies before anyone can ask for them.
 */
import { registerCoreBodies } from './core';

registerCoreBodies();

export type {
  Availability,
  BodyDiscovery,
  BodyId,
  BodyKind,
  BodyMission,
  BodyPhysical,
  BodyRecord,
  BodyVisual,
  DeepSkyImage,
  DeepSkyInfo,
  ExoplanetInfo,
  IauRotationSpec,
  OrbitLineSpec,
  PhaseAngleSystem,
  PositionProvider,
  Regime,
  RelativeState,
  RingArcs,
  RingSpec,
  RotationProvider,
  RotationSpec,
  StarInfo,
  Vec3Like,
} from './types';
export {
  bodyIds,
  bodyName,
  bodyRecord,
  bodyRecords,
  childrenOf,
  displayRadiusKm,
  getBody,
  isBody,
  isPlaced,
  isWithin,
  kindName,
  kindText,
  lineage,
  recordSerial,
  registerBodies,
  registerBody,
  registryVersion,
  replaceBodies,
  rootOf,
  subscribeRegistry,
  systemOf,
  unregisterBodies,
  unregisterBody,
} from './registry';
export {
  bodyAvailability,
  bodyOrientation,
  bodyPositionAt,
  bodyStateAt,
  heliocentricEclAt,
  heliocentricEclStateAt,
  isBodyAvailable,
  updateWorld,
} from './world';
export { compileRotation, iauAngles, orientationFromPole } from './rotation';
export { PLUTO_BARYCENTRE, coreBodyRecords } from './core';
export { engineRotation, moonGeocentric, planetProvider, moonProvider, sunProvider, policyAvailability } from './providers/engine';
export {
  ALWAYS,
  OPEN_ORBIT_YEARS,
  VOYAGER1_LAUNCH_MS,
  VOYAGER1_MODEL_START_MS,
  atCentreProvider,
  beyondOpenOrbit,
  fixedOffsetProvider,
  fixedStarProvider,
  keplerProvider,
  openOrbitEnded,
  twoBodyProvider,
  voyager1Provider,
  type KeplerElements,
} from './providers/simple';
export {
  jupiterMoonProvider,
  relativeOrbitProvider,
  trackProvider,
  ttDaysFromMs,
  type GalileanMoon,
  type RelativeOrbitModel,
  type RelativeOrbitOptions,
  type TrackOptions,
  type TrackSample,
  type TrackSource,
} from './providers/adapters';
export { moonState, type FittedMoonModel } from './providers/moonState';
