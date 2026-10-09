/**
 * The real black holes besides Sagittarius A*'s place (sim/galaxy): their data file's types, their records
 * and their registration. Import them from here.
 */
export type { BlackHolesFile, CatalogueGalaxyJson, CompanionJson, EhtImageJson, HoleJson, HoleOrbitJson, HoleSystemJson, Sourced } from './types';
export { blackHoleIds, blackHoleStatus, registerBinaryHoles, registerGalaxyHoles, registerIsolatedHoles, registerM87Star } from './load';
export {
  BLACK_HOLES,
  HOVER_FLOOR_RADIUS_RS,
  SGR_A_BLACK_HOLE,
  binaryHoleRecords,
  blackHoleInfoFrom,
  catalogueGalaxyHoleRecord,
  galaxyHoleRecord,
  holeCompanionIndices,
  holeJson,
  holeSystemRecords,
  horizonRadiusKm,
  isolatedHoleRecord,
  m87StarRecord,
  sgrABlackHole,
} from './records';
