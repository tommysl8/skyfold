/**
 * What is under the pointer, in screen space: a body's disc or marker (any of its images near a black hole,
 * a hole by the exact circle of its shadow), or the ring of a star with known planets. With true-scale
 * specks, pick radii of a few pixels work far better than ray casts. Run on a click and a few times a second
 * for the hover tag: one pass over the bodies (and their images), no allocation but the result.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import { getBody, type BodyId } from '../sim/bodies';
import { sim, type ScreenPoint } from '../sim/sim';
import { PARSEC_KM } from '../physics/constants';
import { screenOf } from '../sim/derived';
import { holeShadow, pointerInShadow } from '../sim/lensBodies';
import { ensureHost, exoplanetData } from '../sim/exoplanets';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR, motionYears, starData } from '../sim/stars';
import { HOST_RING_FAR_PC, HOST_RING_NEAR_PC } from '../render/materials';
import { planetHostsNow } from '../ui/planetHosts';
import { useUI } from '../state/ui';
import { ensureDeepSkyBody, pickDeepSky, type DeepSkyPick, type DeepSkySetId } from '../sim/deepsky';

/** Pointer reach around a body too small to hit, CSS px. */
export const PICK_REACH_PX = 14;
/** Each magnitude of brightness counts as this much pointer distance, px (so −5 to 25 spans 6 px)… */
const PX_PER_MAGNITUDE = 0.2;
/**
 * …in full once the pointer is this far from the marker, px, and less as it gets nearer: a
 * marker right under the pointer is picked however faint (a spacecraft by a bright planet).
 */
const ON_TARGET_PX = 2;

/**
 * Which image of the body pickBody last returned: 0 its primary (or a body the lens leaves alone), 1 or 2 an
 * image bent round a black hole (sim/lensBodies.ts), with that image's screen point (CSS px).
 */
export const pickedImage = { image: 0 as 0 | 1 | 2, x: 0, y: 0 };

/**
 * Screen-space picking: the body whose disc (or, when tiny, its marker) is under the pointer.
 * With true-scale specks, pick radii of a few pixels work far better than ray casts.
 *
 * Every registered body can be picked. A resolved disc under the pointer wins; among specks,
 * the nearest to the pointer, with brighter ones preferred where the pointer is about as near
 * to several (Jupiter over its moons from afar), then the nearest to the camera.
 *
 * Near a black hole: a body bent round it is picked on any of its images (which one is
 * in pickedImage); the hole itself by the exact circle of its shadow as drawn in the half under the pointer
 * (the angle between the pointer's direction and the circle's centre against its radius), which holds at any
 * size and inside the horizon, where the small-angle radiusPx is 31 px short at 10 M or meaningless.
 */
export function pickBody(x: number, y: number): BodyId | null {
  let best: BodyId | null = null;
  let bestScore = Infinity;
  let bestImage: 0 | 1 | 2 = 0;
  let bestX = 0;
  let bestY = 0;
  // Inside the active hole's shadow: a disc under the pointer, whatever the shadow's size or where its centre is.
  const inShadow = pointerInShadow(x, y);
  const list = sim.bodyList;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.present) continue;
    if (b.id === inShadow) {
      const d = Math.min(Math.hypot(b.screen.x - x, b.screen.y - y), b.radiusPx);
      const score = d / Math.max(b.radiusPx, PICK_REACH_PX, 1e-9) + b.distCamera * 1e-15;
      if (score < bestScore) {
        bestScore = score;
        best = b.id;
        bestImage = 0;
        bestX = b.screen.x;
        bestY = b.screen.y;
      }
      continue;
    }
    // The active hole outside its shadow: only a small shadow's marker can still be picked.
    if (b.id === holeShadow.hole && b.radiusPx > PICK_REACH_PX) continue;
    // Not what the camera is inside (the Milky Way, a nebula flown into): its centre is not under the pointer.
    if (b.distCamera <= b.displayRadius) continue;
    if (b.screen.inFront) {
      const reach = Math.max(b.radiusPx, PICK_REACH_PX);
      const s = scoreAt(b.screen, x, y, reach, b.radiusPx, b.magnitude, b.distCamera);
      if (s < bestScore) {
        bestScore = s;
        best = b.id;
        bestImage = 0;
        bestX = b.screen.x;
        bestY = b.screen.y;
      }
    }
    // Its other images through the lens (wherever its first is: behind the camera, say): markers, each with its
    // own brightness.
    const L = b.lens;
    if (L) {
      for (let k = 1; k < L.count; k++) {
        const img = L.images[k];
        if (!img.screen.inFront || !img.screen.onScreen) continue;
        const si = scoreAt(img.screen, x, y, PICK_REACH_PX, 0, img.magnitude, b.distCamera);
        if (si < bestScore) {
          bestScore = si;
          best = b.id;
          bestImage = img.order >= 2 ? 2 : 1;
          bestX = img.screen.x;
          bestY = img.screen.y;
        }
      }
    }
  }
  pickedImage.image = bestImage;
  pickedImage.x = bestX;
  pickedImage.y = bestY;
  return best;
}

/**
 * A marker's (or a resolved disc's) score at the pointer, Infinity out of reach: a resolved disc under the
 * cursor first; among markers, the nearest to the cursor, with brighter ones preferred where the pointer is
 * about as near to several (magnitudes clamped to −5…25), then the nearest to the camera.
 */
function scoreAt(p: ScreenPoint, x: number, y: number, reach: number, radiusPx: number, magnitude: number, distCamera: number): number {
  const dx = p.x - x;
  const dy = p.y - y;
  if (dx > reach || dx < -reach || dy > reach || dy < -reach) return Infinity;
  const d = Math.hypot(dx, dy);
  if (d > reach) return Infinity;
  const disc = radiusPx > PICK_REACH_PX && d < radiusPx;
  const faint = disc ? 0 : PX_PER_MAGNITUDE * (Math.max(-5, Math.min(25, magnitude)) + 5) * Math.min(1, d / ON_TARGET_PX);
  return (disc ? 0 : 1) + (d + faint) / reach + distCamera * 1e-15;
}

/** A ring fainter than this (of its full strength) cannot be picked. */
const RING_MIN_ALPHA = 0.25;

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const ringRel = new Vector3();
const ringScreen: ScreenPoint = { x: 0, y: 0, onScreen: false, inFront: false };

/**
 * The ring round a star with known planets (scene/PlanetHosts.tsx) nearest the pointer, within
 * PICK_REACH_PX: its archive host, where it is on screen and how far from the pointer (CSS px). Most of those stars are
 * not bodies (only the stars near the camera are), so pickBody cannot find them. Each ring is
 * placed as hostRing.vert.glsl places it, and shown as strongly.
 */
export function pickHostRing(x: number, y: number, camera: PerspectiveCamera): { host: number; x: number; y: number; px: number } | null {
  const stars = starData.stars;
  const match = exoplanetData.matches?.star;
  if (!stars || !starData.full || !match || !planetHostsNow()) return null;
  const P = stars.positions;
  const V = stars.velocitiesInt16;
  const kv = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
  const years = motionYears(2000 + sim.astroTime.tt / 365.25);
  const retarded = useUI.getState().retarded;
  // The camera in parsecs, J2000 ecliptic (world (x, y, z) = ecliptic (x, z, −y)).
  const c = sim.camera.pos;
  const cx = c.x / PARSEC_KM;
  const cy = -c.z / PARSEC_KM;
  const cz = c.y / PARSEC_KM;
  let host = -1;
  let best = PICK_REACH_PX;
  let bx = 0;
  let by = 0;
  for (let h = 0; h < match.length; h++) {
    const s = match[h];
    if (s < 0 || s >= stars.count) continue;
    const px = P[3 * s];
    const py = P[3 * s + 1];
    const pz = P[3 * s + 2];
    const t = years + Math.hypot(px, py, pz) / C_PC_PER_YR;
    // A cheap test first: no star moves more than ~1 pc per 1,000 years (as in sim/stars/nearby.ts).
    const reach = HOST_RING_FAR_PC + 1.03e-3 * Math.abs(t);
    if (Math.abs(px - cx) > reach || Math.abs(py - cy) > reach || Math.abs(pz - cz) > reach) continue;
    const vx = V[3 * s] * kv;
    const vy = V[3 * s + 1] * kv;
    const vz = V[3 * s + 2] * kv;
    let ex = px + vx * t - cx;
    let ey = py + vy * t - cy;
    let ez = pz + vz * t - cz;
    if (retarded) {
      const lt = Math.hypot(ex, ey, ez) / C_PC_PER_YR;
      ex -= vx * lt;
      ey -= vy * lt;
      ez -= vz * lt;
    }
    const d = Math.hypot(ex, ey, ez);
    if ((1 - smoothstep(HOST_RING_NEAR_PC, HOST_RING_FAR_PC, d)) * smoothstep(0.1, 0.3, d) < RING_MIN_ALPHA) continue;
    screenOf(ringRel.set(ex * PARSEC_KM, ez * PARSEC_KM, -ey * PARSEC_KM), camera, ringScreen);
    if (!ringScreen.onScreen) continue;
    const px2 = Math.hypot(ringScreen.x - x, ringScreen.y - y);
    if (px2 < best) {
      best = px2;
      host = h;
      bx = ringScreen.x;
      by = ringScreen.y;
    }
  }
  return host >= 0 ? { host, x: bx, y: by, px: best } : null;
}

/**
 * What is under the pointer: a body, the ring of a star with planets that is not a body yet, or the marker of a
 * deep-sky catalogue's object that is not one either (sim/deepsky). For an image of a body bent round a black hole
 * other than its primary, which image and where it is (CSS px); these fields are there only then, so a plain pick
 * stays `{ kind: 'body', id }`.
 */
export type Picked =
  | { kind: 'body'; id: BodyId; image?: 1 | 2; x?: number; y?: number }
  | { kind: 'host'; host: number; x: number; y: number }
  | { kind: 'deepsky'; set: DeepSkySetId; index: number; x: number; y: number };

/** The body pick with its image, when a secondary image was picked. */
function bodyPick(id: BodyId): Picked {
  return pickedImage.image > 0 ? { kind: 'body', id, image: pickedImage.image as 1 | 2, x: pickedImage.x, y: pickedImage.y } : { kind: 'body', id };
}

const DEEP_SKY: ReadonlySet<string> = new Set(['cluster', 'nebula', 'galaxy', 'merger', 'transient']);

/**
 * The body or planet-host ring under the pointer. A resolved disc under the pointer wins (not a
 * cluster, nebula or galaxy, whose rings of stars with planets are what the pointer is on);
 * otherwise whichever is nearer the pointer, the body when they are as near (a ring's star that
 * is a body already).
 */
export function pickAt(x: number, y: number, camera: PerspectiveCamera): Picked | null {
  const near = pickNearer(x, y, camera);
  // A deep-sky marker that is not a body yet, where nothing nearer is under the pointer (a body's own disc wins).
  const deep = pickDeepSky(x, y, camera);
  if (!deep) return near;
  if (!near) return deepPick(deep);
  if (near.kind !== 'body') return Math.hypot(near.x - x, near.y - y) <= deep.px + 0.5 ? near : deepPick(deep);
  const b = sim.bodies[near.id];
  const bx = near.image ? (near.x ?? 0) : b.screen.x;
  const by = near.image ? (near.y ?? 0) : b.screen.y;
  const d = Math.hypot(bx - x, by - y);
  const disc = !near.image && b.radiusPx > PICK_REACH_PX && d < b.radiusPx && !DEEP_SKY.has(getBody(near.id)?.kind ?? '');
  return disc || d <= deep.px + 0.5 ? near : deepPick(deep);
}

const deepPick = (p: DeepSkyPick): Picked => ({ kind: 'deepsky', set: p.set, index: p.index, x: p.x, y: p.y });

/** The body or planet-host ring under the pointer (pickAt without the deep-sky markers). */
function pickNearer(x: number, y: number, camera: PerspectiveCamera): Picked | null {
  const id = pickBody(x, y);
  const ring = pickHostRing(x, y, camera);
  if (!ring) return id ? bodyPick(id) : null;
  if (id) {
    const b = sim.bodies[id];
    // (the image picked: a secondary image's own point)
    const bx = pickedImage.image > 0 ? pickedImage.x : b.screen.x;
    const by = pickedImage.image > 0 ? pickedImage.y : b.screen.y;
    const d = Math.hypot(bx - x, by - y);
    const disc = pickedImage.image === 0 && b.radiusPx > PICK_REACH_PX && d < b.radiusPx;
    if (disc ? !DEEP_SKY.has(getBody(id)?.kind ?? '') : d <= ring.px + 0.5) return bodyPick(id);
  }
  return { kind: 'host', host: ring.host, x: ring.x, y: ring.y };
}

/** The body to select for what was picked, registering a ring's star (and its planets), or a deep-sky object, if need be. */
export function pickedBody(p: Picked | null): BodyId | null {
  if (!p) return null;
  if (p.kind === 'body') return p.id;
  if (p.kind === 'deepsky') return ensureDeepSkyBody(p);
  return ensureHost(p.host);
}
