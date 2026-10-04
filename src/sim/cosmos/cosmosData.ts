/**
 * The heavy work of the galaxies beyond the Milky Way, done in the cosmos worker (worker.ts), or
 * on the main thread where there is none: the particle templates of the galaxies (a few hundred
 * milliseconds of neighbour searches), the cosmic web inflated, decoded and placed in the
 * Planck 2018 cosmology (building the cosmology's tables takes about 40 ms, placing 55,877
 * galaxies another 50), and the cosmology's emission table for the redshifts of the galaxies'
 * light (about 20 ms more).
 */
import { buildEmissionTable } from '../../physics/cosmology/appearance';
import { fetchGzip } from '../stars/catalogue';
import { cosmology } from './cosmology';
import { decodeCosmicWeb, webBuffers, webTransfer, type WebBound, type WebBuffers } from './cosmicWeb';
import type { SkyTable } from './expansion';
import { buildTemplates, templateTransfer, type Template } from './templates';

export type CosmosWorkerRequest =
  | { id: number; kind: 'templates'; fine?: boolean }
  | { id: number; kind: 'web'; url: string; skip: number[]; bound?: WebBound }
  | { id: number; kind: 'sky' };

export type CosmosWorkerReply =
  | { id: number; ok: true; kind: 'templates'; templates: Template[] }
  | { id: number; ok: true; kind: 'web'; web: WebBuffers }
  | { id: number; ok: true; kind: 'sky'; sky: SkyTable }
  | { id: number; ok: false; error: string };

/** Fetch, inflate, decode and place the cosmic web (galaxies drawn as bodies of their own are left out). */
export async function buildWeb(url: string, skip: readonly number[], bound?: WebBound): Promise<WebBuffers> {
  const buf = await fetchGzip(url);
  return webBuffers(decodeCosmicWeb(buf), cosmology(), new Set(skip), bound);
}

/** The cosmology's emission table (1,024 cubic nodes, docs/data/cosmology.md section 4) and η∞. */
export function buildSkyTable(): SkyTable {
  const c = cosmology();
  return { table: buildEmissionTable(c), etaInfMpc: c.etaInf * c.dH };
}

export const skyTransfer = (s: SkyTable): ArrayBuffer[] => [s.table.data.buffer as ArrayBuffer, s.table.data64.buffer as ArrayBuffer];

export { buildTemplates, templateTransfer, webTransfer };
