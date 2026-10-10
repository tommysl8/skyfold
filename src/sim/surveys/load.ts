/**
 * Loading the galaxy surveys (the tiles of sim/surveys/format.ts) as the camera goes: DESI and the SDSS
 * (public/data/survey/) and Quaia's quasars with Gaia DR3's galaxies (public/data/survey-quaia/: quaia.ts), each an octree of its own with a
 * store of its own (SurveyStore), sharing one worker and the downloads in flight.
 *
 * Nothing is fetched until the layer is wanted (ui/cosmicLayers.ts surveyLoadWanted: 'auto' only once the camera is
 * SURVEY_LOAD_KM from the Sun, beyond the local universe, and Quaia only from QUAIA_LOAD_KM; most visits never go there
 * and download none of it). Then each one's hierarchy once, and the nodes the frame's selection asks for (lod.ts), most
 * wanted first, FETCHES at a time in all, each fetched, inflated and decoded in a worker. A failed download is tried
 * again after 2 s, then 4, 8… up to a minute (lib/retry.ts), for as long as it is wanted: the layer never gives up for
 * the session. Beyond a store's cap (MAX_CACHED_POINTS for the surveys) the nodes least recently drawn are dropped
 * (their GPU buffers with them: scene/Surveys.tsx).
 *
 * Where workers are missing (the tests) the same work runs here; each store's `io` lets the tests replace the
 * downloads and the clock (surveyIO is the surveys' own).
 */
import { retryAfterMs } from '../../lib/retry';
import { decodeHierarchy, decodeNode, HIERARCHY_FILE, nodeFile, type SurveyHierarchy } from './format.ts';
import { fetchTile } from './fetchTile.ts';
import type { SurveyWorkerReply, SurveyWorkerRequest } from './worker';

/**
 * Where the surveys' files are: the one place to change to serve them from another host (a URL ending in '/', whose
 * server lets this site fetch from it). By default the site's own public/data/survey/.
 */
export const SURVEY_BASE_URL: string = `${import.meta.env.BASE_URL}data/survey/`;
/** Where Quaia's tiles are: beside the surveys' (public/data/survey-quaia/ by default), and moved with them. */
export const QUAIA_BASE_URL: string = SURVEY_BASE_URL.replace(/survey\/$/, 'survey-quaia/');

/** Files fetched at once, by all the stores together. */
export const FETCHES = 6;
/** Galaxies kept decoded at most (about 35 MB of GPU buffers). */
export const MAX_CACHED_POINTS = 2_500_000;
/** Quaia's quasars and Gaia's galaxies (their tiles: quaia.ts) kept decoded at most: about 2 million (about 30 MB). */
export const QUAIA_MAX_CACHED_POINTS = 2_000_000;

/** A node's galaxies, decoded. */
export interface SurveyNodeData {
  id: number;
  count: number;
  /** Mpc from the node's centre, 3 a galaxy. */
  position: Float32Array;
  /** Kind and luminosity bytes, 2 a galaxy. */
  attrs: Uint8Array;
  /** Any more bytes of each, extraPer a galaxy (Quaia: its distance error's code). */
  extra: Uint8Array;
  extraPer: number;
  /** The octants' glows (format.ts GLOW_FLOATS each). */
  glows: Float32Array;
  /** The frame it was last drawn or wanted in. */
  lastUsed: number;
}

export type SurveyStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** A node's file as it arrives, decoded. */
export interface SurveyNodeReply {
  count: number;
  position: Float32Array;
  attrs: Uint8Array;
  extra?: Uint8Array;
  extraPer?: number;
  glows: Float32Array;
  bytes: number;
}

/** The downloads and the clock of a store (the tests replace them). */
export interface SurveyIO {
  hierarchy(): Promise<{ hierarchy: SurveyHierarchy; bytes: number }>;
  node(path: string, side: number): Promise<SurveyNodeReply>;
  now(): number;
}

const absolute = (base: string, file: string): string => (typeof location !== 'undefined' ? new URL(base + file, location.href).href : base + file);

// ─── The worker ──────────────────────────────────────────────────────────────────────────

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (r: SurveyWorkerReply) => void; reject: (e: Error) => void }>();

function surveyWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  try {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'surveys' });
    w.onmessage = (e: MessageEvent<SurveyWorkerReply>) => {
      const p = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      p?.resolve(e.data);
    };
    // A worker that failed outside a request is dropped with what it owed; the next request starts a new one.
    w.onerror = (e) => {
      w.terminate();
      worker = undefined;
      for (const p of waiting.values()) p.reject(new Error(e.message || 'surveys worker failed'));
      waiting.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

type Req = SurveyWorkerRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never;

async function call(req: Req): Promise<SurveyWorkerReply> {
  const w = surveyWorker();
  if (!w) {
    const { buffer, bytes } = await fetchTile(req.url);
    if (req.kind === 'hierarchy') return { id: 0, ok: true, kind: 'hierarchy', buffer, bytes };
    const n = decodeNode(buffer, req.side);
    return { id: 0, ok: true, kind: 'node', ...n, bytes };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ ...req, id } as SurveyWorkerRequest);
  });
}

/** The downloads of the files under `base`, and the clock. */
function filesAt(base: string): SurveyIO {
  return {
    async hierarchy() {
      const r = await call({ kind: 'hierarchy', url: absolute(base, HIERARCHY_FILE) });
      if (!r.ok) throw new Error(r.error);
      if (r.kind !== 'hierarchy') throw new Error('surveys worker: unexpected reply');
      return { hierarchy: decodeHierarchy(r.buffer), bytes: r.bytes };
    },
    async node(path, side) {
      const r = await call({ kind: 'node', url: absolute(base, nodeFile(path)), side });
      if (!r.ok) throw new Error(r.error);
      if (r.kind !== 'node') throw new Error('surveys worker: unexpected reply');
      return r;
    },
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };
}

// ─── A store ─────────────────────────────────────────────────────────────────────────────

/** Every store, for the downloads they share (FETCHES). */
const stores: SurveyStore[] = [];
const downloadsOpen = (): number => stores.reduce((s, x) => s + x.loading.size, 0);

/** One catalogue's octree and what of it has loaded. Read it; subscribe to hear of changes. */
export class SurveyStore {
  hierarchy: SurveyHierarchy | null = null;
  status: SurveyStatus = 'idle';
  hierarchyFailures = 0;
  hierarchyRetryAt = 0;
  nodes = new Map<number, SurveyNodeData>();
  loading = new Set<number>();
  /** Failures in a row of each node, and when it may be asked for again (io.now ms). */
  failures = new Map<number, number>();
  retryAt = new Map<number, number>();
  loadedPoints = 0;
  /** Bytes downloaded (as sent, gzip) and files fetched this session. */
  bytes = 0;
  files = 0;
  frame = 0;
  version = 0;
  readonly label: string;
  readonly maxPoints: number;
  readonly io: SurveyIO;
  private pending: Promise<boolean> | null = null;
  private readonly listeners = new Set<() => void>();

  /** `label` names it in warnings; its files are under `base`; at most `maxPoints` of its galaxies stay decoded. */
  constructor(label: string, base: string, maxPoints: number) {
    this.label = label;
    this.maxPoints = maxPoints;
    this.io = filesAt(base);
    stores.push(this);
  }

  private changed(): void {
    this.version++;
    this.listeners.forEach((f) => f());
  }

  subscribe(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** Whether the hierarchy should be asked for now: not yet tried, or failed and its wait is over. */
  hierarchyDue(): boolean {
    return !this.hierarchy && !this.pending && (this.status === 'idle' || (this.status === 'failed' && this.io.now() >= this.hierarchyRetryAt));
  }

  /** Fetch the hierarchy (once; after a failure, again when hierarchyDue says so). */
  loadHierarchy(): Promise<boolean> {
    if (this.pending) return this.pending;
    if (this.hierarchy) return Promise.resolve(true);
    this.status = 'loading';
    this.pending = this.io
      .hierarchy()
      .then(({ hierarchy, bytes }) => {
        this.hierarchy = hierarchy;
        this.status = 'ready';
        this.hierarchyFailures = 0;
        this.bytes += bytes;
        this.files++;
        this.pending = null;
        this.changed();
        return true;
      })
      .catch((err) => {
        this.hierarchyFailures++;
        const wait = retryAfterMs(this.hierarchyFailures);
        this.hierarchyRetryAt = this.io.now() + wait;
        this.status = 'failed';
        this.pending = null;
        console.warn(`[lightspeed] the index of ${this.label} did not load (${err}); trying again in ${wait / 1000} s`);
        this.changed();
        return false;
      });
    return this.pending;
  }

  /** Whether node i failed and is still waiting to be tried again. */
  nodeWaiting(i: number): boolean {
    return (this.retryAt.get(i) ?? -Infinity) > this.io.now();
  }

  /** Fetch node i (once at a time); resolves true once it is loaded. */
  loadNode(i: number): Promise<boolean> {
    const h = this.hierarchy;
    if (!h || this.nodes.has(i) || this.loading.has(i)) return Promise.resolve(this.nodes.has(i));
    const node = h.nodes[i];
    this.loading.add(i);
    return this.io
      .node(node.path, node.side)
      .then((n) => {
        this.loading.delete(i);
        this.failures.delete(i);
        this.retryAt.delete(i);
        // The file's size as stored (gzip), which is what a server that sends it as it is transfers (the development
        // server inflates it on the way).
        this.bytes += node.fileBytes || n.bytes;
        this.files++;
        if (this.hierarchy !== h) return false;
        this.nodes.set(i, {
          id: i,
          count: n.count,
          position: n.position,
          attrs: n.attrs,
          extra: n.extra ?? new Uint8Array(0),
          extraPer: n.extraPer ?? 0,
          glows: n.glows,
          lastUsed: this.frame,
        });
        this.loadedPoints += n.count;
        this.changed();
        return true;
      })
      .catch((err) => {
        this.loading.delete(i);
        const f = (this.failures.get(i) ?? 0) + 1;
        this.failures.set(i, f);
        const wait = retryAfterMs(f);
        this.retryAt.set(i, this.io.now() + wait);
        console.warn(`[lightspeed] the file ${nodeFile(node.path)} of ${this.label} did not load (${err}); trying again in ${wait / 1000} s`);
        return false;
      });
  }

  /**
   * Ask for the nodes in `want` (most wanted first) that are not here, not on their way and not waiting after a
   * failure, while fewer than FETCHES downloads of all the stores are open.
   */
  requestNodes(want: readonly number[]): void {
    for (const i of want) {
      if (downloadsOpen() >= FETCHES) return;
      if (this.nodes.has(i) || this.loading.has(i) || this.nodeWaiting(i)) continue;
      void this.loadNode(i);
    }
  }

  /** Mark nodes drawn or wanted this frame, so they are kept. */
  touchNodes(ids: readonly number[]): void {
    for (const i of ids) {
      const n = this.nodes.get(i);
      if (n) n.lastUsed = this.frame;
    }
  }

  /** Beyond `max`, drop the nodes least recently used (never those of this frame): returns their ids. */
  evictNodes(max = this.maxPoints): number[] {
    if (this.loadedPoints <= max) return [];
    const old = [...this.nodes.values()].filter((n) => n.lastUsed < this.frame).sort((a, b) => a.lastUsed - b.lastUsed);
    const out: number[] = [];
    for (const n of old) {
      if (this.loadedPoints <= max) break;
      this.nodes.delete(n.id);
      this.loadedPoints -= n.count;
      out.push(n.id);
    }
    if (out.length) this.changed();
    return out;
  }

  /** Back to nothing loaded. */
  reset(): void {
    this.hierarchy = null;
    this.status = 'idle';
    this.hierarchyFailures = 0;
    this.hierarchyRetryAt = 0;
    this.nodes.clear();
    this.loading.clear();
    this.failures.clear();
    this.retryAt.clear();
    this.loadedPoints = 0;
    this.bytes = 0;
    this.files = 0;
    this.frame = 0;
    this.pending = null;
    this.changed();
  }
}

/** The galaxy surveys: DESI and the SDSS. */
export const survey = new SurveyStore('the galaxy surveys', SURVEY_BASE_URL, MAX_CACHED_POINTS);
/** Quaia's quasars, the rest of the survey layer. */
export const quaia = new SurveyStore('Quaia', QUAIA_BASE_URL, QUAIA_MAX_CACHED_POINTS);

// The surveys' own store under the names the rest of the app and the tests use.
export const surveyIO = survey.io;
export const surveyVersion = (): number => survey.version;
export const subscribeSurvey = (f: () => void): (() => void) => survey.subscribe(f);
export const surveyHierarchyDue = (): boolean => survey.hierarchyDue();
export const loadSurveyHierarchy = (): Promise<boolean> => survey.loadHierarchy();
export const surveyNodeWaiting = (i: number): boolean => survey.nodeWaiting(i);
export const loadSurveyNode = (i: number): Promise<boolean> => survey.loadNode(i);
export const requestSurveyNodes = (want: readonly number[]): void => survey.requestNodes(want);
export const touchSurveyNodes = (ids: readonly number[]): void => survey.touchNodes(ids);
export const evictSurveyNodes = (max = MAX_CACHED_POINTS): number[] => survey.evictNodes(max);
/** Back to nothing loaded, both stores (the tests, the dev tools). */
export function resetSurvey(): void {
  survey.reset();
  quaia.reset();
}
