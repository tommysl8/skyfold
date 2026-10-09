/**
 * The stars: the 3D catalogue (the 329,770 stars of AT-HYG v4.0 to V = 10 with Gaia DR3 distances and
 * velocities, the pinned stars of its head, and some 3.4 million more in band files loaded as the camera goes),
 * the star systems and named stars as registry bodies, star names for search, and the constellation figures.
 * See docs/data/stars.md and docs/bodies.md.
 */
export * from './catalogue';
export * from './constants';
export * from './constellations';
export * from './frames';
export * from './motion';
export * from './names';
export * from './orbits';
export * from './photometry';
export * from './visibility';
export {
  appStarId,
  barycentreId,
  catalogueStarId,
  catalogueStarRecord,
  linearStarProvider,
  mergeCoreProxima,
  namedStarRecords,
  orbitStarProvider,
  starAvailability,
  starColour,
  starKindText,
  plausibleSpectralType,
  starLabelRank,
  starRecords,
  systemRecords,
  STAR_APP_IDS,
} from './records';
export { STAR_FACTS, REF_LINKS, type StarFacts } from './facts';
export { PROMOTE_PC, RELEASE_PC, updateNearbyStars } from './nearby';
export { updateStarTime, variableNow } from './variability';
export { extData, extensionStar, ensureExtensionStar, loadStarIndex, subscribeExtension, extensionVersion } from './extensionLoad';
export { CELL_STARS, type StarCells } from './cells';
export {
  bodyOfCatalogueStar,
  ensureCatalogueStar,
  loadConstellations,
  loadStarExtra,
  loadStarNames,
  loadStars,
  onDemandStars,
  registerCatalogueStar,
  registerStars,
  releaseCatalogueStars,
  starData,
  starIds,
  starStatus,
  starsVersion,
  subscribeStars,
  type StarStatus,
} from './load';
