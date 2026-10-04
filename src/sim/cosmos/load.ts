/**
 * Loads the galaxies beyond the Milky Way and registers them.
 *
 *  1. Once the browser is idle after start-up: the Local Group and its surroundings
 *     (local-galaxies.json.gz, 31 kB) and the named galaxies, clusters and young galaxies
 *     (named.json, a chunk of its own, 8 kB gzipped) become bodies, with the Local Group itself
 *     and M87's black hole, M87* (sim/blackholes).
 *  2. Then the galaxies' particle templates and the cosmology's emission table (the redshifts of
 *     their light, sim/cosmos/expansion.ts) are built in the cosmos worker.
 *  3. The cosmic web (cosmic-web.bin.gz, 870 kB) loads only when it is wanted: the camera leaves
 *     the Local Group, a scene needs it or its layer is turned on. It is inflated, decoded and
 *     placed in the worker.
 *
 * Where workers are missing (the tests) the same work runs here.
 */
import { isBody, registerBodies } from '../bodies';
import { assetUrl } from '../../render/textures';
import { fetchGzip } from '../stars/catalogue';
import { registerGalaxyCore, SSTARS } from '../galaxy/load';
import { sgrAFrom, sgrAPositionEcl } from '../galaxy/records';
import { MPC_KM } from '../../physics/constants';
import { buildSkyTable, buildTemplates, buildWeb, type CosmosWorkerReply, type CosmosWorkerRequest } from './cosmosData';
import type { WebBound, WebBuffers } from './cosmicWeb';
import { cosmicSky, LOCAL_GROUP_SPHERE, setBoundSpheres, setExpansionMembers, setSkyTable, type SkyTable } from './expansion';
import type { LocalGalaxiesDoc, NamedDoc } from './localGalaxies';
import { bodyIdOf, CLUSTER_RADIUS_MPC, cosmosRecords, type GalaxyShape } from './records';
import { registerM87Star } from '../blackholes/load';
import type { Template } from './templates';
import type { Vec3 } from './frames';

export type CosmosStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** What has loaded so far. Read it; subscribe to hear of changes. */
export const cosmosState = {
  /** The galaxies as bodies. */
  status: 'idle' as CosmosStatus,
  shapes: [] as GalaxyShape[],
  named: null as NamedDoc | null,
  local: null as LocalGalaxiesDoc | null,
  /** The particle templates. */
  templates: null as Template[] | null,
  /** The cosmic web. */
  webStatus: 'idle' as CosmosStatus,
  web: null as WebBuffers | null,
  version: 0,
};

const listeners = new Set<() => void>();
function changed(): void {
  cosmosState.version++;
  listeners.forEach((f) => f());
}
export const cosmosVersion = (): number => cosmosState.version;
export function subscribeCosmos(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** Where loading the galaxies stands. */
export const cosmosStatus = (): CosmosStatus => cosmosState.status;
/** Where loading the cosmic web stands. */
export const webStatus = (): CosmosStatus => cosmosState.webStatus;

// ─── Registration ────────────────────────────────────────────────────────────────────────

/** Register the galaxies (once). The Milky Way must be a body first: its satellites orbit it. */
export function registerCosmos(local: LocalGalaxiesDoc, named: NamedDoc): void {
  registerGalaxyCore();
  const s = sgrAFrom(SSTARS as Parameters<typeof sgrAFrom>[0]);
  const { records, shapes, anchors } = cosmosRecords(local, named, { milkyWayEclKm: sgrAPositionEcl(s) });
  const fresh = records.filter((r) => !isBody(r.id));
  if (fresh.length) registerBodies(fresh);
  setExpansionMembers(anchors);
  setBoundSpheres(clusterCores());
  // M87*, at the centre of M87 (sim/blackholes), in the expanding universe with its galaxy.
  registerM87Star();
  cosmosState.shapes = shapes;
  cosmosState.named = named;
  cosmosState.local = local;
  cosmosState.status = 'ready';
  changed();
}

/**
 * The galaxy clusters' cores, for the camera's own anchor (expansion.ts setBoundSpheres): each cluster's anchor and
 * the radius holding half its measured galaxies (CLUSTER_RADIUS_MPC), well inside the region its gravity holds
 * together (a cluster's bound region reaches beyond a megaparsec).
 */
function clusterCores(): { id: string; anchorWorldKm: Vec3; radiusKm: number }[] {
  const out: { id: string; anchorWorldKm: Vec3; radiusKm: number }[] = [];
  for (const [id, mpc] of Object.entries(CLUSTER_RADIUS_MPC)) {
    const m = cosmicSky.byId.get(id);
    if (m && !m.home) out.push({ id, anchorWorldKm: [m.anchorKm.x, m.anchorKm.y, m.anchorKm.z], radiusKm: mpc * MPC_KM });
  }
  return out;
}

/** The rows of the cosmic web drawn as bodies of their own (the named galaxies): left out of the web's points. */
export function webRowsOfBodies(named: NamedDoc | null, local: LocalGalaxiesDoc | null): number[] {
  const rows = new Set<number>();
  for (const o of named?.objects ?? []) if (o.cosmicWeb?.index !== undefined) rows.add(o.cosmicWeb.index);
  for (const g of local?.galaxies ?? []) if (g.cosmicWeb?.index !== undefined) rows.add(g.cosmicWeb.index);
  return [...rows].sort((a, b) => a - b);
}

/**
 * The bound structures, for the cosmic web's anchors (world Mpc, comoving): the Local Group's
 * sphere, the places of the galaxies drawn as bodies (each anchors the group its row is in) and the
 * clusters' places (anchoring their members' rows).
 */
export function webBound(named: NamedDoc | null, local: LocalGalaxiesDoc | null): WebBound {
  const anchorOf = (id: string): Vec3 | null => {
    const m = cosmicSky.byId.get(id);
    return m ? [m.anchorKm.x / MPC_KM, m.anchorKm.y / MPC_KM, m.anchorKm.z / MPC_KM] : null;
  };
  const rowAnchors: { row: number; anchor: Vec3 }[] = [];
  for (const o of named?.objects ?? []) {
    const a = anchorOf(o.id);
    if (!a || !o.cosmicWeb) continue;
    if (o.cosmicWeb.members) for (let r = o.cosmicWeb.members.first; r < o.cosmicWeb.members.first + o.cosmicWeb.members.count; r++) rowAnchors.push({ row: r, anchor: a });
    else if (o.cosmicWeb.index !== undefined) rowAnchors.push({ row: o.cosmicWeb.index, anchor: a });
  }
  for (const g of local?.galaxies ?? []) {
    const a = anchorOf(bodyIdOf(g.id));
    if (a && g.cosmicWeb?.index !== undefined) rowAnchors.push({ row: g.cosmicWeb.index, anchor: a });
  }
  const c = LOCAL_GROUP_SPHERE.centreKm;
  // The Local Volume Database's galaxies the file does not link to a row: their rows are found on the sky.
  const bodies = (local?.galaxies ?? []).filter((g) => g.cosmicWeb?.index === undefined).map((g) => ({ ra: g.ra, dec: g.dec, mpc: g.distanceKpc / 1000 }));
  return { localGroup: { centre: [c.x / MPC_KM, c.y / MPC_KM, c.z / MPC_KM], radius: LOCAL_GROUP_SPHERE.radiusKm / MPC_KM }, rowAnchors, bodies };
}

// ─── The worker ──────────────────────────────────────────────────────────────────────────

const absolute = (path: string): string => (typeof location !== 'undefined' ? new URL(assetUrl(path), location.href).href : assetUrl(path));

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (r: CosmosWorkerReply) => void; reject: (e: Error) => void }>();

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

function workerCall(req: WithoutId<CosmosWorkerRequest>): Promise<CosmosWorkerReply> | null {
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'cosmos' });
    } catch {
      return null;
    }
    worker.onmessage = (e: MessageEvent<CosmosWorkerReply>) => {
      const w = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      w?.resolve(e.data);
    };
    // A worker that failed (its script did not load, or it threw outside a request) is dropped with what
    // it owed: the requests waiting on it are refused, and the next call starts a new one.
    worker.onerror = (e) => {
      worker?.terminate();
      worker = null;
      for (const w of waiting.values()) w.reject(new Error(e.message || 'cosmos worker failed'));
      waiting.clear();
    };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ ...req, id } as CosmosWorkerRequest);
  });
}

async function templates(fine = false): Promise<Template[]> {
  const call = workerCall({ kind: 'templates', fine });
  if (!call) return buildTemplates(fine);
  const r = await call;
  if (!r.ok) throw new Error(r.error);
  if (r.kind !== 'templates') throw new Error('cosmos worker: unexpected reply');
  return r.templates;
}

async function web(url: string, skip: number[], bound: WebBound): Promise<WebBuffers> {
  const call = workerCall({ kind: 'web', url, skip, bound });
  if (!call) return buildWeb(url, skip, bound);
  const r = await call;
  if (!r.ok) throw new Error(r.error);
  if (r.kind !== 'web') throw new Error('cosmos worker: unexpected reply');
  return r.web;
}

async function sky(): Promise<SkyTable> {
  const call = workerCall({ kind: 'sky' });
  if (!call) return buildSkyTable();
  const r = await call;
  if (!r.ok) throw new Error(r.error);
  if (r.kind !== 'sky') throw new Error('cosmos worker: unexpected reply');
  return r.sky;
}

let skyPending: Promise<boolean> | null = null;

/** The cosmology's emission table for the galaxies' redshifts (once; later calls return the same promise). */
export function loadSky(): Promise<boolean> {
  skyPending ??= (async () => {
    try {
      setSkyTable(await sky());
      changed();
      return true;
    } catch (err) {
      console.warn(`[lightspeed] the redshifts of the galaxies' light were not computed (${err})`);
      skyPending = null;
      return false;
    }
  })();
  return skyPending;
}

/** Resolves once the browser is idle, or after `ms` at the latest. */
function whenIdle(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const idle = typeof window !== 'undefined' ? window.requestIdleCallback : undefined;
    if (idle) idle(() => resolve(), { timeout: ms });
    else setTimeout(resolve, Math.min(ms, 300));
  });
}

let pending: Promise<boolean> | null = null;

/** Register the galaxies and build their templates (once; later calls return the same promise). */
export function loadCosmos(opts: { idle?: boolean } = {}): Promise<boolean> {
  if (pending) return pending;
  cosmosState.status = 'loading';
  changed();
  pending = (async () => {
    try {
      if (opts.idle) await whenIdle(1500);
      const [buf, named] = await Promise.all([fetchGzip(absolute('data/local-galaxies.json.gz')), import('./named.json')]);
      const local = JSON.parse(new TextDecoder().decode(buf)) as LocalGalaxiesDoc;
      if (local.format !== 'lightspeed-local-galaxies') throw new Error('local-galaxies.json: unexpected format');
      registerCosmos(local, named.default as unknown as NamedDoc);
    } catch (err) {
      console.warn(`[lightspeed] the galaxies beyond the Milky Way did not load (${err})`);
      cosmosState.status = 'failed';
      pending = null;
      changed();
      return false;
    }
    const redshifts = loadSky();
    try {
      cosmosState.templates = await templates();
      changed();
      // The fine templates (galaxies large on screen: scene/Galaxies.tsx) after, in the background.
      void templates(true)
        .then((fine) => {
          cosmosState.templates = [...(cosmosState.templates ?? []), ...fine];
          changed();
        })
        .catch((err) => console.warn(`[lightspeed] the galaxies' fine shapes were not built; their plain ones are drawn (${err})`));
    } catch (err) {
      console.warn(`[lightspeed] the galaxies' shapes were not built; they are drawn as points (${err})`);
    }
    await redshifts;
    return true;
  })();
  return pending;
}

let webPending: Promise<boolean> | null = null;
let webFailedAt = -Infinity;
/** After a failed load the web is tried again when next wanted, but not sooner than this (ms). */
const WEB_RETRY_MS = 20_000;

/** Whether the cosmic web should be loaded now that it is wanted: not yet tried, or failed a while ago. */
export const webLoadDue = (): boolean =>
  !cosmosState.web && (cosmosState.webStatus === 'idle' || (cosmosState.webStatus === 'failed' && performance.now() - webFailedAt > WEB_RETRY_MS));

/** Load the cosmic web (once; after the galaxies, whose rows it leaves out). */
export function loadCosmicWeb(): Promise<boolean> {
  webPending ??= (async () => {
    cosmosState.webStatus = 'loading';
    changed();
    try {
      await loadCosmos();
      cosmosState.web = await web(absolute('data/cosmic-web.bin.gz'), webRowsOfBodies(cosmosState.named, cosmosState.local), webBound(cosmosState.named, cosmosState.local));
      cosmosState.webStatus = 'ready';
      changed();
      return true;
    } catch (err) {
      console.warn(`[lightspeed] the cosmic web did not load (${err})`);
      cosmosState.webStatus = 'failed';
      webFailedAt = performance.now();
      webPending = null;
      changed();
      return false;
    }
  })();
  return webPending;
}
