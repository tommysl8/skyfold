/**
 * Camera controller. All state is float64 and lives in world coordinates; the three.js camera
 * itself stays at the origin (floating origin) and only receives the orientation.
 *
 * Modes
 *  - orbit:      orbit a body. Drag rotates, the wheel zooms on a log scale (Shift: five times
 *                faster), motion is damped. Zoom runs from just above the surface out to
 *                10²⁴ km, 100 billion light-years: continuously from a planet to the scale of
 *                the observable universe. Orbiting a black hole is hovering over it (below).
 *  - roam:       the camera flown by hand, with no body in focus and no speed limit (F). WASD
 *                or the arrows move, Space/R and C go up and down, Q/E roll, a drag looks
 *                round (or the mouse, locked on request). The pace is the distance to the
 *                nearest thing that matters here, one and a half times a second (controls/
 *                roam.ts, roamScale.ts), times a multiplier (the wheel, + and −) and four while
 *                Shift is held: the keys ease the camera in and out through a smoothed input, and
 *                it slows by itself near a planet and crosses between galaxies in seconds. It
 *                rides along with the nearest body as time runs, and sees as an observer at
 *                rest in the Sun's frame (near a black hole, hovering there): its own speed
 *                is a camera's, and makes no relativistic optics.
 *  - free:       flying the ship by hand (from Roam): pointer lock, WASD moves, Space/C go up
 *                and down, Q/E roll, the mouse looks around, and the wheel sets the throttle
 *                (0.3 m/s to 0.99999c on a logit scale). Motion is relative to the last body
 *                you orbited (or the one Roam rode along with), combined with relativistic
 *                velocity addition. Releasing the pointer (Esc) goes back to roaming.
 *  - transition: a smooth zoom-and-pan flight to a body (van Wijk & Nuij).
 *  - travel:     riding a trip, looking along the course with free look.
 *  - fall:       a radial fall into a black hole: the camera rides the fall's exact position
 *                (sim/fall.ts), looking ahead, with free look (drag, arrow keys).
 *  - circular:   a circular geodesic orbit round a black hole (scenes).
 *  - hold:       a snapshot at speed: the camera holds its place beside a black hole, the clock
 *                paused, and the view is that of a ship passing there, with a velocity past the
 *                observers hovering there that follows a schedule; any touch of the controls, or
 *                the clock running again, ends it.
 *
 * Near a black hole. One step of a world coordinate (float64) is 32 km at Sgr A*'s distance from
 * the Sun, 2 km at Gaia BH1's and 65,536 km at M87*'s, against hover floors of 12.7 km, 27 mm and
 * 19,196 km above their horizons. So whenever the camera works about a hole (orbiting it, flying
 * with it as the reference body, sliding towards it, or in one of its modes) the controller keeps
 * the camera's position relative to the hole in float64 (holeRelative, and the height above the
 * horizon, holeHeightKm, exact), and the rest of the scene gets the hole's position plus it.
 * Orbiting a hole zooms in ln(height above the horizon), so the horizon is approached smoothly and
 * the floor r_s(1 + 10⁻⁶) is reached without overshoot (α = 10⁻³ there: home's clock runs a
 * thousand times faster). Roam near a hole (within 5,000 r_s, where its clock paces time) moves
 * the hole-relative position itself, hovers wherever it stops and stops at the same floor. Free
 * flight with a hole as the reference body takes the throttle as the speed past the observers
 * hovering there (the engine holds the ship against gravity: a stated model) and moves by the
 * exact coordinate displacement α²w_r r̂ + α w_t per coordinate second; it stops at the same
 * floor. Only a fall goes through.
 *
 * Cost: a few float64 operations a frame; near a hole nothing is allocated but the relativistic
 * velocity composition (addVelocities returns a fresh object), as free flight has always done. Roam
 * measures its surroundings, a pass over the registered bodies (≈ 20 µs), and allocates nothing.
 *
 * Twins: sim/gravity.ts reads holeRelative and holeHeightKm (its camRelHoleKm is the only camera
 * the lens, the bodies' images, the cluster and the flow read near a hole); sim/fall.ts drives the
 * 'fall' mode (setFallPose, enterFall) and ends it through onLeaveFall.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { C_KM_S } from '../physics/constants';
import { getBody, type BodyId, type Vec3Like } from '../sim/bodies';
import { addVelocities } from '../physics/relativity';
import { circularOrbit } from '../physics/geodesics';
import { logitToBeta } from '../physics/speedScale';
import { sim } from '../sim/sim';
import { docRoute } from '../state/route';
import { useUI, type ControlMode } from '../state/ui';
import { easeInOut, zoomPanPath, type ZoomPanPath } from './zoomPan';
import { blackHoleRsKm, framingDistance, minDistance } from './framing';
import { scanSurroundings, surroundings } from './roam';
import { EDGE_KM, ROAM_BOOST, clampMul, followScale, riseRate, roamSpeedKmS, roamStepKm, wheelMul } from './roamScale';

export { blackHoleRsKm, framingDistance };

const UP = new Vector3(0, 1, 0);
/** The up direction when looking straight up or down (world-up would be degenerate). */
const Z_UP = new Vector3(0, 0, 1);
const upScratch = new Vector3();
/** Kinds seen along our line of sight (niceDirection), when this far from the Sun (a light-year) or farther. */
const FROM_EARTH_KINDS: ReadonlySet<string> = new Set(['galaxy', 'cluster', 'nebula', 'pulsar', 'transient']);
const FROM_EARTH_KM = 9.46e12;
const ZERO = new Vector3();
/** Farthest orbit distance, km (about 10¹¹ light-years: beyond the observable universe's 4.4 × 10²³ km radius). */
export const MAX_DIST_KM = 1e24;
/** Wheel and +/− zoom speed-up with Shift held: 46 e-folds separate a planet from the universe. */
const FAST_ZOOM = 5;
/** Roam: radians of turn per pixel dragged (the sky follows the pointer), and per pixel of the locked mouse. */
const ROAM_DRAG_RAD = 0.0035;
const ROAM_MOUSE_RAD = 0.0022;
/** Roam: the input eases in over this time, s, and out over the next. */
const ROAM_EASE_IN_S = 0.18;
const ROAM_EASE_OUT_S = 0.3;
/** Roam: + and − change the multiplier this many e-folds a second (4.5 times). */
const ROAM_MUL_RATE = 1.5;
const FREE_LOGIT_MIN = -9; // ~0.3 m/s
const FREE_LOGIT_MAX = 5; // 0.99999c

/**
 * The closest the camera hovers above a black hole's horizon, as a fraction of its radius r_s: there
 * α = √(10⁻⁶/(1 + 10⁻⁶)) ≈ 10⁻³, so home's clock runs a thousand times faster than yours (12.7 km
 * above Sgr A*'s horizon, 27 mm above Gaia BH1's). Hovering, orbiting and free flight stop here.
 */
export const HOVER_FLOOR_RS = 1e-6;

/**
 * The lowest height above a black hole's horizon the camera hovers at, km: r_s·10⁻⁶ (the record's closest
 * approach, framing.minKm, says the same, r_s(1 + 10⁻⁶); the floor is taken from r_s directly so that it
 * is exact and does not depend on the record).
 */
export function hoverFloorKm(id: BodyId, rsKm = blackHoleRsKm(id)): number {
  return rsKm * HOVER_FLOOR_RS;
}

interface Transition {
  fromBody: BodyId | null;
  fromPoint: Vector3;
  toBody: BodyId;
  w0: number;
  w1: number;
  dir0: Vector3;
  dir1: Vector3;
  rot: Quaternion;
  path: ZoomPanPath;
  t: number;
  duration: number;
  /** The destination's horizon radius when it is a black hole (km; 0 otherwise). */
  rs: number;
  /** The height above that horizon the slew ends at, km (exact: a hover's own when keeping the distance). */
  h1: number;
  /** The start's look point relative to the destination hole, km, when the slew starts in free flight about that same hole. */
  fromRel: Vector3 | null;
}

/** A circular geodesic orbit about a black hole ('circular' mode). */
interface CircularState {
  hole: BodyId;
  rM: number;
  rKm: number;
  /** M = GM/c², km. */
  mKm: number;
  /** Coordinate angular velocity, rad per (home's) second. */
  omega: number;
  /** Speed past the observers hovering there, c. */
  v: number;
  phase: number;
  /** In-plane unit vectors (the start direction and the direction of motion there) and the normal, world axes. */
  e1: Vector3;
  e2: Vector3;
  n: Vector3;
  /** The view direction in the orbit's own frame: components along r̂ (out), the motion and the normal. */
  lookR: number;
  lookT: number;
  lookN: number;
}

/** A snapshot at speed ('hold' mode). */
interface HoldState {
  hole: BodyId;
  schedule: readonly HoldStep[];
  periodS: number;
  /** Real seconds since it started. */
  t: number;
  /** Whether the clock was paused before the snapshot (put back when it ends). */
  wasPaused: boolean;
}

const m4 = new Matrix4();
const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const qa = new Quaternion();
const qb = new Quaternion();
const qc = new Quaternion();

/** One step of a snapshot's schedule: from `atS` (real seconds since it started), this velocity relative to the static observer (c). */
export interface HoldStep {
  atS: number;
  betaVec: Vec3Like;
}

/** What the controller does near a black hole (the scenes, the fall and the gravity state call these). */
export interface ControllerHoleApi {
  /** Writes the camera relative to the hole the controller is working about (exact float64 world km) and returns the hole, or null. No allocation. */
  holeRelative(out: Vec3Like): BodyId | null;
  /** Orbit (hover about) a hole at a height above the horizon (km), keeping the direction. */
  setHoverHeight(heightKm: number): void;
  /** Hover at r (units of M) along dirOut from the hole, looking at `look` (default: at the hole) with `up` towards the top of the view (default: world up); set from float64, exact. */
  hoverAt(hole: BodyId, rM: number, dirOut: Vec3Like, look?: Vec3Like, up?: Vec3Like): boolean;
  /** A circular geodesic orbit at r (units of M), in the plane with unit normal `normal` (world). */
  startCircularOrbit(hole: BodyId, rM: number, normal: Vec3Like, look?: Vec3Like): boolean;
  /** Snapshot at speed: hold the camera here, clock paused, with a velocity schedule relative to the static observer; any camera input or the next scene cancels it. */
  holdWithVelocity(hole: BodyId, schedule: readonly HoldStep[], periodS?: number): void;
  /** Leave 'fall', 'circular' and 'hold' (ending a fall): scenes' ready() and goTo call it. */
  leaveHoleModes(): void;
}

export class CameraController implements ControllerHoleApi {
  mode: ControlMode = 'orbit';
  target: BodyId = 'earth';
  /**
   * Counts camera moves (slews, placements, trips, free flight), so whoever started one can
   * tell whether it is still the latest when it ends.
   */
  moves = 0;

  // Orbit state (azimuth/elevation of the camera around the target, world Y up).
  private az = 0;
  private el = 0.2;
  private logDist = Math.log(26_000);
  private goalAz = 0;
  private goalEl = 0.2;
  private goalLogDist = Math.log(26_000);

  // Hovering over a black hole: the orbit's distance is a height above the horizon.
  /** The orbit target's horizon radius, km, when it is a black hole (0 otherwise). */
  private holeRs = 0;
  /** The lowest height above that horizon, km (hoverFloorKm). */
  private floorKm = 0;
  /** ln of the height above the horizon, km: float64, so that the floor r_s·10⁻⁶ is exact. */
  private logHeight = 0;
  private goalLogHeight = 0;
  /**
   * The height set exactly (a placement, a slew's end, setHoverHeight), km, while the zoom rests on it:
   * exp(ln h) does not give h back to the last bit. NaN while zooming by hand.
   */
  private heightExact = NaN;
  /**
   * The direction from the hole to the camera exactly as placed (hoverAt, a slew's end), until the
   * view is turned by hand: azimuth and elevation cannot hold every direction to the last bit.
   */
  private hoverDir = new Vector3(0, 0, 1);
  private hoverDirExact = false;
  /** The view's turn away from the hole (hoverAt's `look`, or kept from a mode just left), applied after looking at it. */
  private lookRel: Quaternion | null = null;

  /** The camera relative to the hole the controller works about (world km, float64) and that hole. */
  private rel = new Vector3();
  private relHole: BodyId | null = null;
  /** Whether this frame's update wrote `rel` (otherwise the controller works about no hole this frame). */
  private relWritten = false;
  /** Height of the camera above that hole's horizon, km, exact (from the zoom, the fall's closed form or the free-flight vector). */
  holeHeightKm = Infinity;
  /**
   * A black hole whose clock paces time here (set each frame by sim/gravity.ts): free flight that
   * comes this close takes it as the reference body, so the flight is hole-relative and exact.
   */
  nearHole: BodyId | null = null;
  /** Ends the fall under way (registered by sim/fall.ts): the camera then hovers where the fall began. */
  onLeaveFall: (() => void) | null = null;

  // Free flight
  /** Throttle as a slider position in [0, 1] over the free-flight logit range. */
  throttle = (-4 - FREE_LOGIT_MIN) / (FREE_LOGIT_MAX - FREE_LOGIT_MIN); // 1e-4 c ≈ 30 km/s
  private keys = new Set<string>();
  private look = { x: 0, y: 0 };
  private frameBody: BodyId = 'earth';
  /** The reference body's horizon radius when it is a black hole (free flight then moves hole-relative). */
  private frameRs = 0;
  private thrustVel = new Vector3();
  /** Where the reference body was last frame, so free flight rides along its curved path. */
  private frameBodyPrev = new Vector3();
  private frameBodyPrevId: BodyId | null = null;

  // Roam
  /** Roam's multiplier on the pace its surroundings set (the wheel, + and −). */
  roamMul = 1;
  /** The pace's length this frame, km: the surroundings' scale, followed (roamScale.ts followScale). */
  roamScaleKm = NaN;
  /** The speed at full input this frame, km/s (Shift's boost included), and the speed now. */
  roamSpeed = 0;
  roamSpeedNow = 0;
  /** A held on-screen control (touch): +1 forward, −1 back, 0 none. */
  roamTouch = 0;
  /** The input, eased: world axes, |u| ≤ 1. */
  private roamU = new Vector3();
  /** Turns waiting to be applied, rad (a drag, or the locked mouse). */
  private roamLook = { x: 0, y: 0 };
  /** The body Roam rides along with, and where it was last frame. */
  private roamRide: BodyId | null = null;
  private roamRidePrev = new Vector3();
  /** The black hole Roam moves relative to (exactly, through `rel`), or null. */
  private roamHole: BodyId | null = null;
  /** Frames since Roam began. */
  private roamFrames = 0;

  // Travel: free look relative to the direction of motion.
  private lookYaw = 0;
  private lookPitch = 0;
  private travelDir = new Vector3(0, 0, -1);

  // A black hole's own modes.
  /** 'fall': the direction from the hole to where the fall began (the camera looks the other way, ahead). */
  private fallDir = new Vector3(0, 0, 1);
  private circ: CircularState | null = null;
  private hold: HoldState | null = null;

  private tr: Transition | null = null;
  /**
   * A slow turn of the orbit camera about the vertical (a scene's: the cosmic web turning), rad/s,
   * and the move it belongs to: any other camera move or a touch of the controls stops it.
   */
  private spinRate = 0;
  private spinMove = -1;
  private dom: HTMLElement | null = null;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private moved = 0;

  /** Called for a click (not a drag) on the canvas, in CSS px relative to the canvas. */
  onClick: ((x: number, y: number) => void) | null = null;
  onDoubleClick: ((x: number, y: number) => void) | null = null;

  // ── Setup ─────────────────────────────────────────────────────────────────────────────

  /** Put the camera in orbit around a body, facing its sunlit side. */
  placeAt(id: BodyId, dist = framingDistance(id)): void {
    this.moves++;
    this.setTarget(id);
    this.frameBody = id;
    const dir = this.niceDirection(id);
    this.az = this.goalAz = Math.atan2(dir.x, dir.z);
    this.el = this.goalEl = Math.asin(dir.y);
    this.logDist = this.goalLogDist = Math.log(dist);
    if (this.holeRs > 0) {
      this.setHeight(Math.max(this.floorKm, dist - this.holeRs));
      this.setHoverDir(dir);
      this.lookRel = null;
      const b = sim.bodies[id];
      this.placeHover(b.pos, b.vel, this.heightExact);
    }
    this.setMode('orbit');
    useUI.setState({ focus: id });
  }

  attach(dom: HTMLElement): void {
    this.dom = dom;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('dblclick', this.onDblClick);
    dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  detach(): void {
    const dom = this.dom;
    if (!dom) return;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('dblclick', this.onDblClick);
    dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.dom = null;
  }

  // ── Public actions ────────────────────────────────────────────────────────────────────

  /** Fly smoothly to a body and orbit it. Leaves a black hole's own modes first (ending a fall). */
  goTo(
    id: BodyId,
    opts: { keepDistance?: boolean; keepDirection?: boolean; distance?: number; direction?: Vector3 } = {},
  ): void {
    if (this.mode === 'travel' || !sim.bodies[id]?.present) return;
    this.leaveHoleModes();
    this.moves++;
    const eye = sim.camera.pos;
    const B = sim.bodies[id].pos;
    let fromBody: BodyId | null = null;
    const fromPoint = new Vector3();
    let w0: number;
    const dir0 = new Vector3();
    const rs = blackHoleRsKm(id);
    // The camera already works about this hole: its exact position relative to it (not eye − B, 32 km coarse at Sgr A*).
    const exact = rs > 0 && this.relHole === id;
    let fromRel: Vector3 | null = null;

    if (this.mode === 'orbit') {
      fromBody = this.target;
      w0 = this.orbitRadiusKm();
      dir0.copy(this.holeRs > 0 ? this.currentHoverDir(v3) : this.orbitDir(this.az, this.el));
    } else {
      // Look point in front of the camera, at a distance comparable to the destination's scale.
      const fwd = v1.set(0, 0, -1).applyQuaternion(sim.camera.quat);
      const range = exact ? this.rel.length() : eye.distanceTo(B);
      w0 = Math.min(Math.max(range * (opts.keepDistance ? 1 : 0.2), 1), 1e9);
      fromPoint.copy(eye).addScaledVector(fwd, w0);
      if (exact) fromRel = this.rel.clone().addScaledVector(fwd, w0);
      dir0.copy(fwd).negate();
    }

    let h1 = 0;
    let w1: number;
    if (rs > 0 && opts.keepDistance && exact && !opts.distance) {
      h1 = Math.max(hoverFloorKm(id, rs), this.holeHeightKm);
      w1 = rs + h1;
    } else {
      // A black hole's closest approach is its hover floor, r_s(1 + 10⁻⁶).
      const closest = rs > 0 ? rs + hoverFloorKm(id, rs) : minDistance(id);
      w1 = opts.distance
        ? Math.min(MAX_DIST_KM, Math.max(closest, opts.distance))
        : opts.keepDistance
          ? Math.max(closest, eye.distanceTo(B))
          : framingDistance(id);
      if (rs > 0) h1 = Math.max(hoverFloorKm(id, rs), w1 - rs);
    }
    const dir1 = opts.direction
      ? opts.direction.clone().normalize()
      : opts.keepDirection
        ? exact
          ? this.rel.clone().normalize()
          : v2.copy(eye).sub(B).normalize().clone()
        : this.niceDirection(id);
    const A = fromBody ? sim.bodies[fromBody].pos : fromPoint;
    const path = zoomPanPath(A.distanceTo(B), w0, w1);
    // A long zoom-and-pan is disorienting for some people: keep it brief when reduced motion is asked for.
    const duration = reducedMotion() ? 0.35 : Math.min(6, Math.max(1.1, 0.8 + path.S * 0.3));
    const rot = new Quaternion().setFromUnitVectors(dir0, dir1);

    this.tr = { fromBody, fromPoint, toBody: id, w0, w1, dir0, dir1, rot, path, t: 0, duration, rs, h1, fromRel };
    this.lookRel = null;
    this.setMode('transition');
    this.frameBody = id;
    useUI.setState({ focus: id });
  }

  /**
   * Turn the orbit camera slowly about the vertical, rad/s, once the move under way (a slew to the
   * target) has ended; stopped by any other move, a drag, the wheel or a key.
   */
  spin(radPerS: number): void {
    this.spinRate = radPerS;
    this.spinMove = this.moves;
  }

  /**
   * Ease the orbit camera to this distance from its target, km, as the zoom does (a scene's: following a kilonova's
   * ejecta out). Only in orbit about a body that is not a black hole; false otherwise.
   */
  zoomTo(distanceKm: number): boolean {
    if (this.mode !== 'orbit' || this.holeRs > 0 || !(distanceKm > 0)) return false;
    this.goalLogDist = Math.log(distanceKm);
    this.clampGoals();
    return true;
  }

  /**
   * The camera's place relative to the body it orbits, km, exactly as the orbit puts it (not world − world: 40 Mpc out a
   * world coordinate is 10⁵ km coarse, and a kilonova's inspiral is a few hundred km across). False outside orbit mode
   * about `id` (or over a black hole, whose own modes keep their exact place).
   */
  orbitOffsetKm(id: BodyId, out: Vector3): boolean {
    if (this.mode !== 'orbit' || this.target !== id || this.holeRs > 0) return false;
    this.orbitDirInto(this.az, this.el, out).multiplyScalar(Math.exp(this.logDist));
    return true;
  }

  /** The distance the orbit camera is easing to, km (NaN outside orbit mode). */
  get orbitGoalKm(): number {
    return this.mode === 'orbit' ? Math.exp(this.goalLogDist) : NaN;
  }

  /** Whether the camera is turning by itself. */
  get spinning(): boolean {
    return this.spinRate !== 0 && this.spinMove === this.moves;
  }

  /** The hole the camera is on a circular geodesic orbit about (free fall: no thrust), or null. */
  get circularHole(): BodyId | null {
    return this.mode === 'circular' && this.circ ? this.circ.hole : null;
  }

  /**
   * Fly the ship by hand (light-speed limit, relativity on), relative to `frame` (default: the last body
   * orbited; from Roam, the body it rode along with, or the black hole it moved about, exactly).
   */
  enterFreeFlight(frame?: BodyId): void {
    // Not on a trip, nor in a fall (nothing leaves a black hole).
    if (this.mode === 'travel' || this.mode === 'fall') return;
    if (this.mode === 'circular' || this.mode === 'hold') this.toHover();
    this.moves++;
    if (this.mode === 'transition') this.finishTransition();
    this.frameBody = frame && sim.bodies[frame]?.present ? frame : this.target;
    this.frameRs = blackHoleRsKm(this.frameBody);
    this.frameBodyPrevId = null;
    this.setMode('free');
    this.requestLock();
  }

  /**
   * Roam: the camera flown by hand, no body in focus, no speed limit (F). Refused, as free flight is, on a
   * trip and in a fall; a circular orbit or a snapshot ends first, and a slew stops where the camera is. From
   * the ship it takes over where the ship is. False when refused.
   */
  enterRoam(): boolean {
    if (this.mode === 'travel' || this.mode === 'fall') return false;
    if (this.mode === 'roam') return true;
    const fromShip = this.mode === 'free';
    if (this.mode === 'circular' || this.mode === 'hold') this.toHover();
    // Mid-slew: roam from where the camera is (the slew's hole-relative place, if it was bound for a black hole).
    this.tr = null;
    this.moves++;
    this.spinRate = 0;
    // About a black hole already (hovering, or the ship's reference): keep the exact place relative to it.
    this.roamHole = fromShip ? (this.frameRs > 0 ? this.frameBody : null) : this.relHole;
    this.roamRide = null;
    this.roamU.set(0, 0, 0);
    this.roamLook.x = this.roamLook.y = 0;
    this.roamScaleKm = NaN;
    this.roamTouch = 0;
    this.roamFrames = 0;
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock?.();
    this.setMode('roam');
    return true;
  }

  /**
   * Leave Roam and orbit, from where the camera is, the nearest thing that matters (the black hole it moves
   * about, or the body that sets its pace; failing that, the nearest body, as leaving free flight does).
   */
  exitRoam(): void {
    if (this.mode !== 'roam') return;
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock?.();
    this.roamTouch = 0;
    // (The surroundings are this visit's once a frame has measured them.)
    const near = this.roamFrames > 0 ? surroundings.id : null;
    const id = this.roamHole ?? (near && sim.bodies[near]?.present ? near : this.nearestBody());
    this.goTo(id, { keepDistance: true, keepDirection: true });
  }

  /** From Roam, fly the ship where the camera is: relative to the body Roam rode along with (if slow), or its black hole. */
  roamToShip(): void {
    if (this.mode !== 'roam') return;
    const ride = this.roamRide ? sim.bodies[this.roamRide] : undefined;
    // A body that moves fast in the Sun's frame (a galaxy far off in the expanding universe) would lend the ship its speed.
    const slow = !!ride && ride.vel.length() < 1e-3 * C_KM_S;
    this.roamTouch = 0;
    this.enterFreeFlight(this.roamHole ?? (slow ? this.roamRide! : undefined));
  }

  /** From the ship (its pointer released, Esc, or the panel's switch), roam from where it is. */
  shipToRoam(): void {
    if (this.mode !== 'free') return;
    this.enterRoam();
  }

  /** Roam's mouse look: lock the pointer, so the mouse turns the view without a drag (Esc releases it). */
  roamLockPointer(): void {
    if (this.mode === 'roam') this.requestLock();
  }

  /** Capture the pointer for mouse look; a refusal (no user gesture, a frame without permission) leaves it free, silently. */
  private requestLock(): void {
    const asked: unknown = this.dom?.requestPointerLock?.();
    if (asked instanceof Promise) asked.catch(() => {});
  }

  /** Whether the pointer is locked to the view (the ship's mouse look, or Roam's). */
  get pointerLocked(): boolean {
    return typeof document !== 'undefined' && !!this.dom && document.pointerLockElement === this.dom;
  }

  /** Set Roam's multiplier, kept in its range (its panel reads it on the shared clock). */
  setRoamMul(mul: number): void {
    this.roamMul = clampMul(mul);
  }

  /** Leave free flight and orbit the nearest body from where we are. */
  exitFreeFlight(): void {
    if (this.mode !== 'free') return;
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    const id = this.nearestBody();
    this.goTo(id, { keepDistance: true, keepDirection: true });
  }

  /** Ride along with a trip: the camera sits on the ship, looking along the course. */
  startTravel(dir: Vector3): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.moves++;
    this.tr = null;
    this.travelDir.copy(dir).normalize();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.setMode('travel');
  }

  /**
   * After arriving (or stopping), orbit a body from where the ship is. A destination that has
   * left the registry (or this date) meanwhile: orbit the nearest body instead.
   */
  finishTravel(id: BodyId): void {
    if (!sim.bodies[id]?.present) {
      this.exitTravelToNearest();
      return;
    }
    const B = sim.bodies[id].pos;
    const dir = v1.copy(sim.camera.pos).sub(B);
    const dist = Math.max(minDistance(id), dir.length());
    dir.normalize();
    this.setTarget(id);
    this.frameBody = id;
    this.az = this.goalAz = Math.atan2(dir.x, dir.z);
    this.el = this.goalEl = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    this.logDist = Math.log(dist);
    // A flight to a galaxy, cluster or nebula ends near its centre (framing.ts flightStandoff): the
    // view then pulls back along the way the ship came, to show all of it.
    this.goalLogDist = Math.log(Math.max(dist, framingDistance(id)));
    if (this.holeRs > 0) {
      this.setHeight(Math.max(this.floorKm, dist - this.holeRs));
      const goal = Math.max(this.floorKm, Math.max(dist, framingDistance(id)) - this.holeRs);
      if (goal !== this.heightExact) {
        this.goalLogHeight = Math.log(goal);
        this.heightExact = NaN;
      }
      this.setHoverDir(dir);
    }
    this.setMode('orbit');
    this.clampGoals();
    useUI.setState({ focus: id });
  }

  /** Leave travel mode mid-course: orbit the nearest body from where the ship stopped. */
  exitTravelToNearest(): void {
    this.setMode('free');
    const id = this.nearestBody();
    this.goTo(id, { keepDistance: true, keepDirection: true });
  }

  /** Point the travel view: 0 = straight ahead, π = straight back. */
  setTravelLook(yaw: number, pitch = 0): void {
    this.lookYaw = yaw;
    this.lookPitch = pitch;
  }

  get throttleBeta(): number {
    return logitToBeta(FREE_LOGIT_MIN + this.throttle * (FREE_LOGIT_MAX - FREE_LOGIT_MIN));
  }

  // ── Per-frame update ──────────────────────────────────────────────────────────────────

  update(dtReal: number, dtSim: number, shipPos?: Vector3): void {
    // A body can leave the registry (data unloaded): orbit Earth instead.
    if (!sim.bodies[this.target] || !sim.bodies[this.frameBody] || (this.tr && !sim.bodies[this.tr.toBody])) {
      this.tr = null;
      if (this.mode === 'fall') this.onLeaveFall?.();
      this.endHold();
      this.circ = null;
      this.placeAt('earth');
    }
    this.relWritten = false;
    if (this.mode === 'transition') this.updateTransition(dtReal);
    else if (this.mode === 'orbit') this.updateOrbit(dtReal);
    else if (this.mode === 'travel') this.updateTravel(dtReal, shipPos);
    else if (this.mode === 'fall') this.updateFall(dtReal);
    else if (this.mode === 'circular') this.updateCircular(dtReal, dtSim);
    else if (this.mode === 'hold') this.updateHold(dtReal);
    else if (this.mode === 'roam') this.updateRoam(dtReal);
    else this.updateFree(dtReal, dtSim);
    if (!this.relWritten) this.relHole = null;
  }

  /** `rel` now holds the camera relative to `hole`, exactly, this frame. */
  private markRel(hole: BodyId): void {
    this.relHole = hole;
    this.relWritten = true;
  }

  // ── Near a black hole ─────────────────────────────────────────────────────────────────

  /** The camera relative to the hole the controller works about, exact (float64 world km), and that hole; null when it works about none. */
  holeRelative(out: Vec3Like): BodyId | null {
    if (!this.relHole) return null;
    out.x = this.rel.x;
    out.y = this.rel.y;
    out.z = this.rel.z;
    return this.relHole;
  }

  /** Hover about the black hole in orbit at a height above its horizon (km, clamped to the floor), keeping the direction. */
  setHoverHeight(heightKm: number): void {
    if (this.mode !== 'orbit' || this.holeRs <= 0 || !(heightKm > 0)) return;
    this.setHeight(Math.min(MAX_DIST_KM, Math.max(this.floorKm, heightKm)));
  }

  /**
   * Hover at r (units of M = GM/c²) along dirOut from the hole, looking along `look` (world axes;
   * default: at the hole) with `up` (world axes; default: world up, as every view) towards the top of
   * the view, set exactly from float64 relative to the hole. The view keeps its turn away from the
   * hole while the camera is dragged round it. False when the hole is not there or r is not above the
   * horizon.
   */
  hoverAt(hole: BodyId, rM: number, dirOut: Vec3Like, look?: Vec3Like, up?: Vec3Like): boolean {
    const rs = blackHoleRsKm(hole);
    const b = sim.bodies[hole];
    const len = Math.hypot(dirOut.x, dirOut.y, dirOut.z);
    if (!(rs > 0) || !b?.present || !(rM > 2) || !Number.isFinite(rM) || !(len > 0)) return false;
    if (this.mode === 'fall') this.onLeaveFall?.();
    this.moves++;
    this.tr = null;
    this.circ = null;
    this.endHold();
    this.spinRate = 0;
    this.setTarget(hole);
    this.frameBody = hole;
    const h = Math.min(MAX_DIST_KM, Math.max(this.floorKm, (rM - 2) * (rs / 2)));
    this.setHeight(h);
    this.setHoverDir(v1.set(dirOut.x / len, dirOut.y / len, dirOut.z / len));
    this.lookRel = null;
    if (look) {
      const l = Math.hypot(look.x, look.y, look.z);
      if (l > 0) {
        // The turn from looking at the hole to looking along `look`: q_base · lookRel = q_look.
        this.lookAlong(v2.copy(this.hoverDir).negate());
        qa.copy(sim.camera.quat);
        this.lookAlong(v2.set(look.x / l, look.y / l, look.z / l), up);
        this.lookRel = qa.invert().multiply(sim.camera.quat).clone();
      }
    }
    this.placeHover(b.pos, b.vel, h);
    this.setMode('orbit');
    useUI.setState({ focus: hole });
    return true;
  }

  /**
   * A circular geodesic orbit at r (units of M, above the photon sphere r = 3; stable from 6), in the
   * plane with unit normal `normal` (world axes), starting where the camera is (projected into the
   * plane), moving anticlockwise about the normal. The view looks along `look` (world axes, at the
   * start; default: at the hole) and turns with the orbit. False when the hole is not there or r ≤ 3.
   */
  startCircularOrbit(hole: BodyId, rM: number, normal: Vec3Like, look?: Vec3Like): boolean {
    const rs = blackHoleRsKm(hole);
    const b = sim.bodies[hole];
    const nl = Math.hypot(normal.x, normal.y, normal.z);
    if (!(rs > 0) || !b?.present || !(rM > 3) || !Number.isFinite(rM) || !(nl > 0)) return false;
    if (this.mode === 'fall') this.onLeaveFall?.();
    const mKm = rs / 2;
    const orbit = circularOrbit(rM, mKm / C_KM_S);
    const n = new Vector3(normal.x / nl, normal.y / nl, normal.z / nl);
    // Start where the camera is, projected into the plane.
    const d = this.relHole === hole ? v1.copy(this.rel) : v1.copy(sim.camera.pos).sub(b.pos);
    const e1 = new Vector3().copy(d).addScaledVector(n, -d.dot(n));
    if (!(e1.length() > 1e-9 * d.length())) e1.crossVectors(n, Math.abs(n.x) < 0.9 ? v2.set(1, 0, 0) : v2.set(0, 1, 0));
    e1.normalize();
    const e2 = new Vector3().crossVectors(n, e1);
    let lookR = -1;
    let lookT = 0;
    let lookN = 0;
    if (look) {
      const l = Math.hypot(look.x, look.y, look.z);
      if (l > 0) {
        lookR = (look.x * e1.x + look.y * e1.y + look.z * e1.z) / l;
        lookT = (look.x * e2.x + look.y * e2.y + look.z * e2.z) / l;
        lookN = (look.x * n.x + look.y * n.y + look.z * n.z) / l;
      }
    }
    this.moves++;
    this.tr = null;
    this.endHold();
    this.spinRate = 0;
    this.setTarget(hole);
    this.frameBody = hole;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lookRel = null;
    this.circ = { hole, rM, rKm: rM * mKm, mKm, omega: orbit.omegaRadPerS, v: orbit.vRelStatic, phase: 0, e1, e2, n, lookR, lookT, lookN };
    this.setMode('circular');
    this.placeCircular(0);
    useUI.setState({ focus: hole });
    return true;
  }

  /**
   * A snapshot at speed: the camera holds its place by the hole (where it is now), the clock is
   * paused, and the view is that of a ship passing with the schedule's velocity relative to the
   * observers hovering there (c, world axes), each step from its time in real seconds, repeating
   * every `periodS` when given. A drag, the wheel, a view key, the next scene or the clock running
   * again ends it (the camera then hovers there, keeping the view).
   */
  holdWithVelocity(hole: BodyId, schedule: readonly HoldStep[], periodS = 0): void {
    const rs = blackHoleRsKm(hole);
    const b = sim.bodies[hole];
    if (!(rs > 0) || !b?.present || !schedule.length) return;
    if (this.mode === 'fall') this.onLeaveFall?.();
    // Where the camera is, relative to the hole (exactly when it already works about it).
    if (this.relHole !== hole) {
      this.rel.copy(sim.camera.pos).sub(b.pos);
      this.holeHeightKm = this.rel.length() - rs;
    }
    const floor = hoverFloorKm(hole, rs);
    if (!(this.holeHeightKm >= floor)) {
      this.rel.setLength(rs + floor);
      this.holeHeightKm = floor;
    }
    this.markRel(hole);
    const wasPaused = this.hold ? this.hold.wasPaused : sim.paused;
    this.moves++;
    this.tr = null;
    this.circ = null;
    this.spinRate = 0;
    this.setTarget(hole);
    this.frameBody = hole;
    this.hold = { hole, schedule: [...schedule].sort((a, c) => a.atS - c.atS), periodS: periodS > 0 ? periodS : 0, t: 0, wasPaused };
    this.pauseClock(true);
    this.setMode('hold');
    this.applyHold(b.pos, b.vel);
    useUI.setState({ focus: hole });
  }

  /** Leave 'fall' (ending it: the camera hovers where it began), 'circular' and 'hold' (hovering where the camera is, keeping the view). */
  leaveHoleModes(): void {
    if (this.mode === 'fall') {
      if (this.onLeaveFall) this.onLeaveFall();
      if (this.mode === 'fall') this.toHover();
      return;
    }
    if (this.mode === 'circular' || this.mode === 'hold') this.toHover();
  }

  /** Enter the fall (sim/fall.ts startFall): the camera rides it from `dirOut`'s side of the hole, looking ahead. */
  enterFall(hole: BodyId, dirOut: Vec3Like): void {
    if (this.mode === 'fall') return;
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock?.();
    this.moves++;
    this.tr = null;
    this.circ = null;
    this.endHold();
    this.spinRate = 0;
    this.setTarget(hole);
    this.frameBody = hole;
    this.fallDir.set(dirOut.x, dirOut.y, dirOut.z).normalize();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lookRel = null;
    this.setMode('fall');
    useUI.setState({ focus: hole });
  }

  /** The fall's exact position this frame (sim/fall.ts updateFall): relative to the hole, km, and the height above the horizon (negative inside). */
  setFallPose(hole: BodyId, relKm: Vec3Like, heightKm: number): void {
    this.rel.set(relKm.x, relKm.y, relKm.z);
    this.markRel(hole);
    this.holeHeightKm = heightKm;
  }

  /** The snapshot's velocity past the observers hovering there, now (c, world axes), or null outside a snapshot. */
  holdBeta(out: Vec3Like): Vec3Like | null {
    const h = this.hold;
    if (!h || this.mode !== 'hold') return null;
    const step = this.holdStep(h);
    out.x = step.betaVec.x;
    out.y = step.betaVec.y;
    out.z = step.betaVec.z;
    return out;
  }

  /** The circular orbit under way: its radius (M), speed past the hovering observers (c) and coordinate angular velocity; null outside one. */
  circularOrbitNow(): { rM: number; v: number; omega: number } | null {
    const c = this.circ;
    return c && this.mode === 'circular' ? { rM: c.rM, v: c.v, omega: c.omega } : null;
  }

  // ── Updates of the modes ──────────────────────────────────────────────────────────────

  private updateTravel(dt: number, shipPos?: Vector3): void {
    this.freeLookKeys(dt);
    if (shipPos) sim.camera.pos.copy(shipPos);
    // Base orientation looks along the course (world-up where possible), then free look.
    const fwd = this.travelDir;
    m4.lookAt(ZERO, fwd, Math.abs(fwd.y) > 0.9995 ? v2.set(0, 0, 1) : UP);
    sim.camera.quat.setFromRotationMatrix(m4);
    this.applyFreeLook();
  }

  /** Arrow keys turn a view that rides something (a trip, a fall, an orbit round a hole). */
  private freeLookKeys(dt: number): void {
    const k = this.keys;
    const rot = 1.4 * dt;
    if (k.has('ArrowLeft')) this.lookYaw += rot;
    if (k.has('ArrowRight')) this.lookYaw -= rot;
    if (k.has('ArrowUp')) this.lookPitch += rot;
    if (k.has('ArrowDown')) this.lookPitch -= rot;
    this.lookPitch = Math.max(-1.55, Math.min(1.55, this.lookPitch));
  }

  private applyFreeLook(): void {
    qa.setFromAxisAngle(v1.set(0, 1, 0), this.lookYaw);
    qb.setFromAxisAngle(v2.set(1, 0, 0), this.lookPitch);
    sim.camera.quat.multiply(qa).multiply(qb);
  }

  private updateOrbit(dt: number): void {
    // Keyboard orbiting (arrows, +/−) for accessibility.
    const k = this.keys;
    const rot = 1.4 * dt;
    const turning = k.has('ArrowLeft') || k.has('ArrowRight') || k.has('ArrowUp') || k.has('ArrowDown') || this.spinning;
    if (k.has('ArrowLeft')) this.goalAz -= rot;
    if (k.has('ArrowRight')) this.goalAz += rot;
    if (k.has('ArrowUp')) this.goalEl += rot;
    if (k.has('ArrowDown')) this.goalEl -= rot;
    // Shift is fast zoom, except with the + on the main keyboard, which needs Shift to type
    // at all (Shift+= is +): there it would make "in" five times faster than "out".
    const shift = k.has('ShiftLeft') || k.has('ShiftRight');
    const zoomRate = 1.6 * dt;
    const fast = shift ? FAST_ZOOM : 1;
    if (this.holeRs > 0) {
      // Over a black hole the zoom works in ln(height above the horizon).
      if (k.has('Equal')) this.goalLogHeight -= zoomRate;
      else if (k.has('NumpadAdd')) this.goalLogHeight -= zoomRate * fast;
      if (k.has('Minus') || k.has('NumpadSubtract')) this.goalLogHeight += zoomRate * fast;
      if (k.has('Equal') || k.has('NumpadAdd') || k.has('Minus') || k.has('NumpadSubtract')) this.heightExact = NaN;
      if (turning) this.hoverDirExact = false;
    } else {
      if (k.has('Equal')) this.goalLogDist -= zoomRate;
      else if (k.has('NumpadAdd')) this.goalLogDist -= zoomRate * fast;
      if (k.has('Minus') || k.has('NumpadSubtract')) this.goalLogDist += zoomRate * fast;
    }
    if (this.spinning) this.goalAz += this.spinRate * dt;
    this.clampGoals();

    const a = 1 - Math.exp(-dt * 10);
    this.az += (this.goalAz - this.az) * a;
    this.el += (this.goalEl - this.el) * a;
    const target = sim.bodies[this.target];
    if (this.holeRs > 0) {
      if (this.logHeight !== this.goalLogHeight) {
        this.logHeight += (this.goalLogHeight - this.logHeight) * (1 - Math.exp(-dt * 8));
        // Close enough: land on the goal exactly (the floor, or a height that was set), so the camera rests without jitter.
        if (Math.abs(this.goalLogHeight - this.logHeight) < 1e-13) this.logHeight = this.goalLogHeight;
      }
      this.placeHover(target.pos, target.vel, this.currentHeight());
      return;
    }
    this.logDist += (this.goalLogDist - this.logDist) * (1 - Math.exp(-dt * 8));

    const dir = this.orbitDir(this.az, this.el);
    sim.camera.pos.copy(target.pos).addScaledVector(dir, Math.exp(this.logDist));
    this.lookAlong(dir.negate());
    sim.ship.vel.copy(target.vel);
  }

  /** Hovering: the camera at height h above the hole's horizon along the hover direction, looking at the hole (turned by lookRel). */
  private placeHover(holePos: Vector3, holeVel: Vector3, h: number): void {
    const dir = this.currentHoverDir(v3);
    this.rel.copy(dir).multiplyScalar(this.holeRs + h);
    this.markRel(this.target);
    this.holeHeightKm = h;
    sim.camera.pos.copy(holePos).add(this.rel);
    this.lookAlong(v2.copy(dir).negate());
    if (this.lookRel) sim.camera.quat.multiply(this.lookRel);
    // A hovering observer rides with the hole (it holds its place against gravity).
    sim.ship.vel.copy(holeVel);
  }

  private updateFree(dtReal: number, dtSim: number): void {
    const q = sim.camera.quat;
    const k = this.keys;
    // Mouse look (local yaw/pitch) and roll.
    if (this.look.x || this.look.y) {
      qa.setFromAxisAngle(v1.set(0, 1, 0), -this.look.x * 0.0022);
      qb.setFromAxisAngle(v2.set(1, 0, 0), -this.look.y * 0.0022);
      q.multiply(qa).multiply(qb);
      this.look.x = this.look.y = 0;
    }
    const roll = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
    if (roll) q.multiply(qa.setFromAxisAngle(v1.set(0, 0, 1), roll * 1.2 * dtReal));
    q.normalize();

    const input = v1.set(
      (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      (k.has('KeyR') || k.has('Space') ? 1 : 0) - (k.has('KeyC') ? 1 : 0),
      (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0),
    );
    if (input.lengthSq() > 0) {
      input.normalize().applyQuaternion(q).multiplyScalar(this.throttleBeta * C_KM_S);
      this.thrustVel.copy(input);
    } else this.thrustVel.set(0, 0, 0);

    // Close to a black hole whose clock paces time here: fly relative to it, exactly.
    const near = this.nearHole;
    if (near && near !== this.frameBody && sim.bodies[near]?.present) {
      this.frameBody = near;
      this.frameRs = blackHoleRsKm(near);
      this.rel.copy(sim.camera.pos).sub(sim.bodies[near].pos);
      this.holeHeightKm = this.rel.length() - this.frameRs;
    }

    // Velocity relative to the reference body, composed relativistically.
    const body = sim.bodies[this.frameBody];
    const ref = body.vel;
    const w = addVelocities(ref, this.thrustVel);
    sim.ship.vel.set(w.x, w.y, w.z);
    if (this.frameRs > 0) {
      this.freeNearHole(body.pos, dtSim);
      return;
    }
    // Ride along with the reference body: follow its actual displacement this frame, plus the
    // thrust relative to it. The same as vel·dt for small steps, but at a time warp of years a
    // frame, straight-line drift would fling the camera off the body's curved path.
    if (this.frameBodyPrevId !== this.frameBody) {
      this.frameBodyPrev.copy(body.pos);
      this.frameBodyPrevId = this.frameBody;
    }
    sim.camera.pos
      .add(v1.copy(body.pos).sub(this.frameBodyPrev))
      .addScaledVector(v2.set(w.x - ref.x, w.y - ref.y, w.z - ref.z), dtSim);
    this.frameBodyPrev.copy(body.pos);
  }

  /**
   * Roam: turn by the drag (or the locked mouse) and Q/E; + and − set the multiplier; the keys ease the
   * input in and out; the step is the pace (the surroundings' scale per second, times the multiplier, and
   * Shift's boost) along the input, never more than half the way to the nearest thing. Near a black hole
   * whose clock paces time the camera moves its exact place relative to the hole and stops at the hover
   * floor, hovering there (at rest past the observers hovering there); elsewhere it rides along with the
   * nearest body and stays out of the nearest surface, at rest in the Sun's frame for the optics.
   */
  private updateRoam(dt: number): void {
    this.roamFrames++;
    const q = sim.camera.quat;
    const k = this.keys;
    const look = this.roamLook;
    if (look.x || look.y) {
      q.multiply(qa.setFromAxisAngle(v1.set(0, 1, 0), look.x)).multiply(qb.setFromAxisAngle(v2.set(1, 0, 0), look.y));
      look.x = look.y = 0;
    }
    const roll = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
    if (roll) q.multiply(qa.setFromAxisAngle(v1.set(0, 0, 1), roll * 1.2 * dt));
    q.normalize();
    // The multiplier: + (Shift+= on the main keyboard) and −, held.
    const up = k.has('Equal') || k.has('NumpadAdd');
    const down = k.has('Minus') || k.has('NumpadSubtract');
    if (up !== down) this.setRoamMul(this.roamMul * Math.exp((up ? 1 : -1) * ROAM_MUL_RATE * dt));

    // Near a black hole whose clock paces time: move relative to it, exactly, from now on.
    const near = this.nearHole && sim.bodies[this.nearHole]?.present ? this.nearHole : null;
    if (near !== this.roamHole) {
      if (near) {
        if (this.relHole !== near) this.rel.copy(sim.camera.pos).sub(sim.bodies[near].pos);
        this.holeHeightKm = this.rel.length() - blackHoleRsKm(near);
      }
      this.roamHole = near;
    }
    const hole = this.roamHole;

    // The surroundings, and the pace.
    const s = scanSurroundings(sim.camera.pos, hole, this.rel, this.holeHeightKm, hole ?? this.roamRide);
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? ROAM_BOOST : 1;
    this.roamScaleKm = followScale(this.roamScaleKm, s.scaleKm, dt, riseRate(this.roamMul, boost));
    this.roamSpeed = roamSpeedKmS(this.roamScaleKm, this.roamMul, boost);

    // The input, in the view's axes, eased in and out in world axes.
    const input = v1.set(
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      (k.has('KeyR') || k.has('Space') ? 1 : 0) - (k.has('KeyC') ? 1 : 0),
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - this.roamTouch,
    );
    const pressed = input.lengthSq() > 0;
    if (pressed) input.normalize().applyQuaternion(q);
    this.roamU.lerp(input, 1 - Math.exp(-dt / (pressed ? ROAM_EASE_IN_S : ROAM_EASE_OUT_S)));
    if (!pressed && this.roamU.lengthSq() < 1e-8) this.roamU.set(0, 0, 0);
    const u = this.roamU.length();
    const step = u > 0 ? roamStepKm(this.roamSpeed * u, dt, this.roamScaleKm) : 0;
    this.roamSpeedNow = dt > 0 ? step / dt : 0;
    const dir = v2.copy(this.roamU);
    if (u > 0) dir.divideScalar(u);

    if (hole) {
      const b = sim.bodies[hole];
      const rs = blackHoleRsKm(hole);
      const floor = hoverFloorKm(hole, rs);
      if (step > 0) this.rel.addScaledVector(dir, step);
      const r = this.rel.length();
      if (r < rs + floor) {
        if (r > 0) this.rel.multiplyScalar((rs + floor) / r);
        else this.rel.set(0, 0, rs + floor);
        this.holeHeightKm = floor;
      } else this.holeHeightKm = r - rs;
      this.markRel(hole);
      sim.camera.pos.copy(b.pos).add(this.rel);
      // Hovering wherever it stops: at rest past the observers hovering there.
      sim.ship.vel.copy(b.vel);
      this.roamRide = hole;
      this.roamRidePrev.copy(b.pos);
      return;
    }

    // Ride along with the nearest body: follow its displacement this frame (a time warp of years a frame would otherwise leave the camera behind).
    const ride = s.ride;
    const rb = ride ? sim.bodies[ride] : undefined;
    if (ride !== this.roamRide) {
      this.roamRide = ride;
      if (rb) this.roamRidePrev.copy(rb.pos);
    }
    if (rb) {
      sim.camera.pos.add(v3.copy(rb.pos).sub(this.roamRidePrev));
      this.roamRidePrev.copy(rb.pos);
    }
    if (step > 0) sim.camera.pos.addScaledVector(dir, step);
    // Never beyond the edge of the map, nor inside the nearest surface (its closest approach, as the orbit camera's).
    const far = sim.camera.pos.length();
    if (far > EDGE_KM) sim.camera.pos.multiplyScalar(EDGE_KM / far);
    const solid = s.solid ? sim.bodies[s.solid] : undefined;
    if (solid) {
      const m = minDistance(s.solid!);
      const off = v3.copy(sim.camera.pos).sub(solid.pos);
      const d = off.length();
      if (d < m) sim.camera.pos.copy(solid.pos).addScaledVector(d > 0 ? off.divideScalar(d) : off.set(0, 0, 1), m);
    }
    // A camera, not a ship: at rest in the Sun's frame for the optics.
    sim.ship.vel.set(0, 0, 0);
  }

  /**
   * Free flight with a black hole as the reference body: the thrust w is the speed past the observers
   * hovering there, and a coordinate second moves the camera by α²w_r r̂ + α w_t (exact for the
   * static frame: proper radial length is dr/α and the hovering observers' clocks run at α). Stops at
   * the hover floor.
   */
  private freeNearHole(holePos: Vector3, dtSim: number): void {
    const rs = this.frameRs;
    const r = this.rel.length();
    const floor = hoverFloorKm(this.frameBody, rs);
    if (r > 0 && dtSim !== 0) {
      const h = Math.max(floor, r - rs);
      const a2 = h / (rs + h);
      const a = Math.sqrt(a2);
      const w = this.thrustVel;
      const rh = v1.copy(this.rel).divideScalar(r);
      const wr = w.dot(rh);
      // r̂ (r + α² w_r dt) + α (w − w_r r̂) dt: the radial part at α², the tangential at α. The radius never
      // steps below the floor (a long step would otherwise carry the camera through the hole).
      const radius = Math.max(rs + floor, r + a2 * wr * dtSim);
      this.rel.copy(rh).multiplyScalar(radius).addScaledVector(w, a * dtSim).addScaledVector(rh, -a * wr * dtSim);
    }
    const r2 = this.rel.length();
    if (r2 < rs + floor) {
      if (r2 > 0) this.rel.multiplyScalar((rs + floor) / r2);
      else this.rel.set(0, 0, rs + floor);
      this.holeHeightKm = floor;
    } else this.holeHeightKm = r2 - rs;
    this.markRel(this.frameBody);
    sim.camera.pos.copy(holePos).add(this.rel);
  }

  private updateTransition(dt: number): void {
    const tr = this.tr!;
    tr.t = Math.min(1, tr.t + dt / tr.duration);
    const e = easeInOut(tr.t);
    const A = tr.fromBody ? sim.bodies[tr.fromBody].pos : tr.fromPoint;
    const B = sim.bodies[tr.toBody].pos;
    const { u, w } = tr.path.at(e);
    const dir = v1.copy(tr.dir0).applyQuaternion(qa.identity().slerp(tr.rot, e));
    if (tr.rs > 0) {
      // Into a black hole's neighbourhood: relative to the hole in float64, eye = B + (1 − u)(A − B) + dir·w.
      if (tr.fromRel) this.rel.copy(tr.fromRel).multiplyScalar(1 - u);
      else if (tr.fromBody === tr.toBody) this.rel.set(0, 0, 0);
      else this.rel.copy(A).sub(B).multiplyScalar(1 - u);
      this.rel.addScaledVector(dir, w);
      this.markRel(tr.toBody);
      this.holeHeightKm = this.rel.length() - tr.rs;
      sim.camera.pos.copy(B).add(this.rel);
    } else {
      // look point L = A + u (B − A); eye = L + dir · w
      sim.camera.pos.copy(B).sub(A).multiplyScalar(u).add(A).addScaledVector(dir, w);
    }
    this.lookAlong(v2.copy(dir).negate());
    // Blend reference velocity from source to destination (only matters for relativity).
    sim.ship.vel.copy(sim.bodies[tr.toBody].vel);
    if (tr.t >= 1) this.finishTransition();
  }

  private finishTransition(): void {
    const tr = this.tr;
    if (!tr) return;
    this.setTarget(tr.toBody);
    this.az = this.goalAz = Math.atan2(tr.dir1.x, tr.dir1.z);
    this.el = this.goalEl = Math.asin(Math.max(-1, Math.min(1, tr.dir1.y)));
    this.logDist = this.goalLogDist = Math.log(tr.w1);
    if (this.holeRs > 0) {
      // Exactly the height the slew was for (never w1 − r_s formed again).
      this.setHeight(Math.max(this.floorKm, tr.h1));
      this.setHoverDir(tr.dir1);
      const b = sim.bodies[tr.toBody];
      if (b) this.placeHover(b.pos, b.vel, this.heightExact);
    }
    this.tr = null;
    this.setMode('orbit');
    this.clampGoals();
  }

  /** 'fall': the camera at the fall's exact place (setFallPose), looking ahead (inward) with free look. */
  private updateFall(dt: number): void {
    const b = sim.bodies[this.target];
    this.freeLookKeys(dt);
    this.markRel(this.target);
    sim.camera.pos.copy(b.pos).add(this.rel);
    const fwd = v3.copy(this.fallDir).negate();
    m4.lookAt(ZERO, fwd, Math.abs(fwd.y) > 0.9995 ? Z_UP : UP);
    sim.camera.quat.setFromRotationMatrix(m4);
    this.applyFreeLook();
    // Readings in the Sun's frame show no motion during a fall; the fall's own readings (and the view) take its motion.
    sim.ship.vel.copy(b.vel);
  }

  /** 'circular': the orbit's phase advances with home's (coordinate) time. */
  private updateCircular(dt: number, dtSim: number): void {
    const c = this.circ;
    if (!c) {
      this.toHover();
      return;
    }
    this.freeLookKeys(dt);
    c.phase = (c.phase + c.omega * dtSim) % (2 * Math.PI);
    this.placeCircular(dtSim);
  }

  private placeCircular(_dtSim: number): void {
    const c = this.circ!;
    const b = sim.bodies[c.hole];
    const cos = Math.cos(c.phase);
    const sin = Math.sin(c.phase);
    // r̂ = e1 cos φ + e2 sin φ; the motion t̂ = n × r̂ = −e1 sin φ + e2 cos φ.
    const rh = v1.copy(c.e1).multiplyScalar(cos).addScaledVector(c.e2, sin);
    const th = v2.copy(c.e1).multiplyScalar(-sin).addScaledVector(c.e2, cos);
    this.rel.copy(rh).multiplyScalar(c.rKm);
    this.markRel(c.hole);
    this.holeHeightKm = (c.rM - 2) * c.mKm;
    sim.camera.pos.copy(b.pos).add(this.rel);
    const w = addVelocities(b.vel, v3.copy(th).multiplyScalar(c.v * C_KM_S));
    sim.ship.vel.set(w.x, w.y, w.z);
    const fwd = v3.copy(rh).multiplyScalar(c.lookR).addScaledVector(th, c.lookT).addScaledVector(c.n, c.lookN).normalize();
    m4.lookAt(ZERO, fwd, Math.abs(fwd.dot(c.n)) > 0.9995 ? rh : c.n);
    sim.camera.quat.setFromRotationMatrix(m4);
    this.applyFreeLook();
  }

  /** 'hold': the schedule advances by real time; the camera holds its place with the step's velocity. */
  private updateHold(dt: number): void {
    const h = this.hold;
    const b = sim.bodies[this.target];
    if (!h || !b) {
      this.toHover();
      return;
    }
    // The snapshot keeps the clock paused: running it again ends the snapshot.
    if (!sim.paused) {
      h.wasPaused = false;
      this.toHover();
      return;
    }
    h.t += dt;
    this.applyHold(b.pos, b.vel);
  }

  private holdStep(h: HoldState): HoldStep {
    const s = h.periodS > 0 ? h.t % h.periodS : h.t;
    let step = h.schedule[0];
    for (const x of h.schedule) if (x.atS <= s) step = x;
    return step;
  }

  private applyHold(holePos: Vector3, holeVel: Vector3): void {
    const h = this.hold!;
    const step = this.holdStep(h);
    this.markRel(h.hole);
    sim.camera.pos.copy(holePos).add(this.rel);
    const w = addVelocities(holeVel, v1.set(step.betaVec.x * C_KM_S, step.betaVec.y * C_KM_S, step.betaVec.z * C_KM_S));
    sim.ship.vel.set(w.x, w.y, w.z);
  }

  /** Back to hovering where the camera is (from a circular orbit, a snapshot or a fall left early), keeping the view. */
  private toHover(): void {
    const hole = this.relHole ?? this.circ?.hole ?? this.hold?.hole ?? this.target;
    const b = sim.bodies[hole];
    const rs = blackHoleRsKm(hole);
    this.circ = null;
    this.endHold();
    if (!b || !(rs > 0)) {
      this.setMode('orbit');
      return;
    }
    const keep = qc.copy(sim.camera.quat);
    this.setTarget(hole);
    this.frameBody = hole;
    const r = this.rel.length();
    const h = Math.max(this.floorKm, Number.isFinite(this.holeHeightKm) ? this.holeHeightKm : r - rs);
    this.setHeight(h);
    this.setHoverDir(r > 0 ? v1.copy(this.rel).divideScalar(r) : v1.set(0, 0, 1));
    // Keep the view as it was: the turn from looking at the hole to where the camera looked.
    this.lookAlong(v2.copy(this.hoverDir).negate());
    this.lookRel = qa.copy(sim.camera.quat).invert().multiply(keep).clone();
    this.placeHover(b.pos, b.vel, h);
    this.setMode('orbit');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────────

  private setMode(mode: ControlMode): void {
    if (this.mode === 'hold' && mode !== 'hold') this.endHold();
    if (this.mode === 'circular' && mode !== 'circular') this.circ = null;
    this.mode = mode;
    if (useUI.getState().controlMode !== mode) useUI.setState({ controlMode: mode });
  }

  /** The orbit target, and whether it is a black hole (then the orbit is a hover in height above its horizon). */
  private setTarget(id: BodyId): void {
    this.target = id;
    this.holeRs = blackHoleRsKm(id);
    this.floorKm = this.holeRs > 0 ? hoverFloorKm(id, this.holeRs) : 0;
    if (this.holeRs <= 0) {
      this.hoverDirExact = false;
      this.lookRel = null;
    }
  }

  /** The hover direction, exact, with the azimuth and elevation that drag and the keys turn from it. */
  private setHoverDir(dir: Vector3): void {
    this.hoverDir.copy(dir);
    this.hoverDirExact = true;
    this.az = this.goalAz = Math.atan2(dir.x, dir.z);
    this.el = this.goalEl = Math.max(-1.55, Math.min(1.55, Math.asin(Math.max(-1, Math.min(1, dir.y)))));
  }

  private currentHoverDir(out: Vector3): Vector3 {
    if (this.hoverDirExact) return out.copy(this.hoverDir);
    return this.orbitDirInto(this.az, this.el, out);
  }

  /** Distance of the orbit camera from the target's centre, km. */
  private orbitRadiusKm(): number {
    return this.holeRs > 0 ? this.holeRs + this.currentHeight() : Math.exp(this.logDist);
  }

  /** Hover exactly at this height above the horizon (km), the zoom at rest there. */
  private setHeight(h: number): void {
    this.heightExact = h;
    this.logHeight = this.goalLogHeight = Math.log(h);
  }

  /** The hover's height now, km: exact while the zoom rests on a height that was set or on the floor. */
  private currentHeight(): number {
    if (this.logHeight !== this.goalLogHeight) return Math.exp(this.logHeight);
    if (!Number.isNaN(this.heightExact)) return this.heightExact;
    return this.goalLogHeight <= Math.log(this.floorKm) ? this.floorKm : Math.exp(this.goalLogHeight);
  }

  /** Put back the clock's pause after a snapshot. */
  private endHold(): void {
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    if (sim.paused !== h.wasPaused) this.pauseClock(h.wasPaused);
  }

  /** The clock's pause (as sim/clock.ts setPaused, which this module cannot import: clock → chronometer → gravity → here). */
  private pauseClock(p: boolean): void {
    sim.paused = p;
    if (p) sim.live = false;
    useUI.setState({ paused: p });
  }

  private orbitDir(az: number, el: number): Vector3 {
    return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  }

  private orbitDirInto(az: number, el: number, out: Vector3): Vector3 {
    return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  }

  /** Orient the camera to look along `fwd` with world-up where possible. */
  private lookAlong(fwd: Vector3, up?: Vec3Like): void {
    // A given up is used unless it is (nearly) along the view: then, as always, world up (or +z looking straight up or down).
    const u = up ? upScratch.set(up.x, up.y, up.z) : null;
    const ul = u ? u.length() : 0;
    const given = u && ul > 0 && Math.abs(u.dot(fwd)) < 0.9995 * ul * fwd.length();
    m4.lookAt(ZERO, fwd, given ? u : Math.abs(fwd.y) > 0.9995 ? Z_UP : UP);
    sim.camera.quat.setFromRotationMatrix(m4);
  }

  /** Viewing direction (from the body toward the camera) that shows a mostly sunlit disc. */
  /**
   * Where the camera looks at a body from: its sunlit side, 40° round from the Sun and a little
   * above. A galaxy, a cluster or a nebula far from the Sun is seen from our side instead, along our
   * line of sight, so its tilt and its picture are as photographed from Earth. A moon close to a big
   * planet (Phobos, Io, Enceladus) is seen with the planet beyond it rather than behind the camera.
   */
  private niceDirection(id: BodyId): Vector3 {
    const p = sim.bodies[id].pos;
    if (id === 'sun' || p.lengthSq() === 0) return this.orbitDir(0.6, 0.25);
    const toSun = p.clone().negate().normalize();
    const rec = getBody(id);
    // A pulsar up close is seen from our side but nearly side-on to its spin, so its beams sweep across the view (a
    // pair a little above its orbit, so the orbits open out): sim/deepsky/pulsarModel.ts.
    const psr = rec?.pulsar;
    if (psr) {
      const s = psr.spin.axis;
      const d = psr.toEarth.clone().addScaledVector(s, -0.85 * psr.toEarth.dot(s));
      if (psr.pair) d.normalize().addScaledVector(s, 0.55 * Math.sign(psr.toEarth.dot(s) || 1));
      if (d.lengthSq() > 1e-9) return d.normalize();
    }
    // (Not home's own: the Milky Way and the Local Group are seen from outside, off our line of sight.)
    if (rec && FROM_EARTH_KINDS.has(rec.kind) && p.length() > FROM_EARTH_KM && id !== 'milky-way' && id !== 'local-group') return toSun;
    const side = new Vector3().crossVectors(UP, toSun).normalize();
    const nice = toSun.multiplyScalar(Math.cos(0.7)).addScaledVector(side, Math.sin(0.7)).addScaledVector(UP, 0.22).normalize();
    const parent = rec?.kind === 'moon' && rec.parent ? sim.bodies[rec.parent] : undefined;
    const parentRec = parent ? getBody(rec!.parent!) : undefined;
    if (parent && parentRec) {
      const away = p.clone().sub(parent.pos);
      const d = away.length();
      // The planet more than 10° across from the moon: put the camera beyond the moon, the planet in view.
      if (d > 0 && parentRec.physical.radiusKm / d > Math.sin((5 * Math.PI) / 180)) {
        const dir = away.divideScalar(d).multiplyScalar(0.8).addScaledVector(nice, 0.6);
        if (dir.lengthSq() > 0.05) return dir.normalize();
      }
    }
    return nice;
  }

  private clampGoals(): void {
    this.goalEl = Math.max(-1.55, Math.min(1.55, this.goalEl));
    const lo = Math.log(minDistance(this.target));
    this.goalLogDist = Math.max(lo, Math.min(Math.log(MAX_DIST_KM), this.goalLogDist));
    if (this.holeRs > 0) this.goalLogHeight = Math.max(Math.log(this.floorKm), Math.min(Math.log(MAX_DIST_KM), this.goalLogHeight));
  }

  private nearestBody(): BodyId {
    let best: BodyId = 'sun';
    let bestScore = Infinity;
    for (const b of sim.bodyList) {
      if (!b.present) continue;
      // Prefer bodies that are close relative to their size (so a nearby Moon beats a distant Sun).
      const score = b.pos.distanceTo(sim.camera.pos) / Math.sqrt((getBody(b.id)?.physical.radiusKm ?? 0) + 1);
      if (score < bestScore) {
        bestScore = score;
        best = b.id;
      }
    }
    return best;
  }

  // ── Input handlers ────────────────────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 2) return;
    if (this.mode === 'free') {
      if (!document.pointerLockElement) this.requestLock();
      return;
    }
    // Roam's locked mouse only looks (the pointer is not where it points: no click selects).
    if (this.mode === 'roam' && this.pointerLocked) return;
    // A touch of the controls ends a snapshot: the camera hovers there, and the drag turns it.
    if (this.mode === 'hold') this.leaveHoleModes();
    this.dragging = true;
    this.spinRate = 0;
    this.moved = 0;
    this.lastX = this.downX = e.clientX;
    this.lastY = this.downY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.mode === 'free' && document.pointerLockElement === this.dom) {
      this.look.x += e.movementX;
      this.look.y += e.movementY;
      return;
    }
    if (this.mode === 'roam' && document.pointerLockElement === this.dom) {
      this.roamLook.x -= e.movementX * ROAM_MOUSE_RAD;
      this.roamLook.y -= e.movementY * ROAM_MOUSE_RAD;
      return;
    }
    // One finger drags (a second one on a touch screen would make the view jump between them).
    if (!this.dragging || !e.isPrimary) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.moved = Math.max(this.moved, Math.hypot(e.clientX - this.downX, e.clientY - this.downY));
    if (this.mode === 'orbit') {
      this.hoverDirExact = false;
      this.goalAz -= dx * 0.005;
      this.goalEl += dy * 0.005;
      this.clampGoals();
    } else if (this.mode === 'travel' || this.mode === 'fall' || this.mode === 'circular') {
      this.lookYaw += dx * 0.004;
      this.lookPitch = Math.max(-1.55, Math.min(1.55, this.lookPitch + dy * 0.004));
    } else if (this.mode === 'roam') {
      // The sky follows the pointer, as in the other free-look modes.
      this.roamLook.x += dx * ROAM_DRAG_RAD;
      this.roamLook.y += dy * ROAM_DRAG_RAD;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.moved < 5 && e.button === 0 && this.dom) {
      const r = this.dom.getBoundingClientRect();
      this.onClick?.(e.clientX - r.left, e.clientY - r.top);
    }
  };

  private onDblClick = (e: MouseEvent): void => {
    // Not in free flight (the mouse looks), nor in a fall (nothing leaves a black hole: "Stop the fall" does).
    if (!this.dom || this.mode === 'free' || this.mode === 'fall') return;
    const r = this.dom.getBoundingClientRect();
    this.onDoubleClick?.(e.clientX - r.left, e.clientY - r.top);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // With Shift held, browsers on Windows and Linux turn a vertical wheel into a horizontal one.
    const raw = e.shiftKey && e.deltaY === 0 ? e.deltaX : e.deltaY;
    const delta = e.deltaMode === 1 ? raw * 33 : raw;
    this.spinRate = 0;
    if (this.mode === 'hold') this.leaveHoleModes();
    if (this.mode === 'free') {
      this.throttle = Math.min(1, Math.max(0, this.throttle - delta * 0.00035));
      useUI.setState({ throttleBeta: this.throttleBeta });
    } else if (this.mode === 'roam') {
      this.setRoamMul(wheelMul(this.roamMul, delta));
    } else if (this.mode === 'orbit') {
      if (this.holeRs > 0) {
        this.goalLogHeight += delta * 0.0022 * (e.shiftKey ? FAST_ZOOM : 1);
        this.heightExact = NaN;
      } else this.goalLogDist += delta * 0.0022 * (e.shiftKey ? FAST_ZOOM : 1);
      this.clampGoals();
    }
  };

  private onContextMenu = (e: Event): void => e.preventDefault();

  private onKeyDown = (e: KeyboardEvent): void => {
    const ui = useUI.getState();
    if (e.defaultPrevented || isTyping(e) || docRoute()) return;
    // Nor behind a dialog: its arrow keys and +/− are for the dialog.
    if (ui.welcomeOpen || ui.tourStep !== null || ui.journeysOpen || ui.keysOpen || ui.searchOpen) return;
    this.keys.add(e.code);
    const viewKey = e.code.startsWith('Arrow') || e.code === 'Equal' || e.code === 'Minus' || e.code.startsWith('Numpad');
    if (viewKey) this.spinRate = 0;
    // A view key ends a snapshot (the camera then hovers there and the key works as usual).
    if (viewKey && this.mode === 'hold') this.leaveHoleModes();
    if ((this.mode === 'free' || this.mode === 'roam') && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => this.keys.clear();

  private onPointerLockChange = (): void => {
    if (document.pointerLockElement) return;
    this.unlockedAt = performance.now();
    // The ship's pointer released (Esc): back to roaming, where the ship is. Roam's own lock just ends.
    if (this.mode === 'free') this.shipToRoam();
  };

  /** When the pointer was last released, ms (performance.now()). */
  private unlockedAt = -Infinity;

  /** Whether the pointer was released a moment ago: the Esc that released it must not also leave Roam (browsers differ). */
  get justUnlocked(): boolean {
    return performance.now() - this.unlockedAt < 250;
  }
}

const motionQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
const reducedMotion = (): boolean => !!motionQuery?.matches;

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export const controller = new CameraController();
