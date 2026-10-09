/**
 * Everything the app loads at start-up, registered from the shipped files as the loaders would
 * (in their order): the Solar System, the star catalogue, the featured planetary systems, the
 * Milky Way (Sgr A* and the S-stars, the nebulae, the clusters) and the galaxies beyond it. For
 * tests that need the whole registry, as a visitor has it a few seconds after the page opens.
 */
import { registerSolarSystem, type BodiesFile, type RingsFile } from '../sim/solarSystem';
import { indexMoonCatalog, type MoonCatalog } from '../sim/moonModels';
import { parseTracks, type TracksIndex } from '../sim/tracks';
import { registerStars, starData } from '../sim/stars/load';
import { exoplanetData, registerFeatured } from '../sim/exoplanets/load';
import { galaxyState, registerClusters, registerGalaxyCore, registerNebulae } from '../sim/galaxy/load';
import { parseClusters, type ClustersFile } from '../sim/galaxy/clusters';
import type { NebulaeFile } from '../sim/galaxy/records';
import nebulaeJson from '../sim/galaxy/nebulae.json';
import { registerCosmos } from '../sim/cosmos/load';
import { loadLocalGalaxies, loadMore, loadNamed, loadPictures } from './cosmos';
import { loadFeaturedFile } from './exoplanets';
import { gunzipFile, loadExtra, loadNames, loadStars, loadSystems } from './stars';
import { readBytes, readJson } from './files';
import { registerPhenomena } from '../sim/phenomena';

let done = false;

/** Register every body the app loads at start-up (once per test file). */
export function registerUniverse(): void {
  if (done) return;
  done = true;
  registerSolarSystem({
    bodies: readJson<BodiesFile>('public/data/bodies.json'),
    rings: readJson<RingsFile>('public/data/rings.json'),
    moons: indexMoonCatalog(readJson<MoonCatalog>('public/data/moons.json')),
    tracks: parseTracks(readJson<TracksIndex>('public/data/tracks.json'), readBytes('public/data/tracks.bin')),
  });

  const stars = loadStars();
  starData.stars = stars;
  starData.full = true;
  starData.names = loadNames();
  starData.extra = loadExtra();
  registerStars(loadSystems(), stars);
  starData.status = 'ready';

  registerFeatured(loadFeaturedFile());
  exoplanetData.featuredStatus = 'ready';

  registerGalaxyCore();
  registerNebulae(nebulaeJson as unknown as NebulaeFile);
  registerClusters({ clusters: parseClusters(JSON.parse(new TextDecoder().decode(gunzipFile('public/data/clusters.json.gz'))) as ClustersFile) });
  galaxyState.status = 'ready';
  galaxyState.nebulaStatus = 'ready';

  registerCosmos(loadLocalGalaxies(), loadNamed(), loadMore(), loadPictures());

  registerPhenomena();
}
