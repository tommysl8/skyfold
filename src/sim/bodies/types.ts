/**
 * The body registry's vocabulary: what a body is, where its position comes from, how it turns
 * and how it looks. See docs/bodies.md for how to add bodies, providers, textures, shapes and
 * whole systems.
 *
 * Frames and units, everywhere in the registry:
 *  - Positions from providers are J2000 ecliptic (the frame of JPL Horizons' "Ecliptic of
 *    J2000.0"), kilometres, relative to the body's centre (its parent, or a barycentre).
 *    Velocities are km/s. The world frame is (x, z, −y) of that: see sim/frames.ts.
 *  - Time is an astronomy-engine AstroTime: `time.tt` is TT (≈ TDB to 2 ms) days since J2000,
 *    the argument the data formats take (docs/data/); `time.ut` gives the civil date that the
 *    astronomy-engine providers and the date policy (ephemerisPolicy.ts) need.
 */
import type { PulsarModel } from '../deepsky/pulsarModel';
import type { StarSurface } from '../stars/closeup';
import type { AstroTime } from 'astronomy-engine';
import type { Quaternion, Vector3 } from 'three';

/** Any string: the registry decides which ids exist. */
export type BodyId = string;

export type BodyKind =
  | 'star'
  | 'planet'
  | 'dwarf-planet'
  | 'moon'
  | 'asteroid'
  | 'comet'
  | 'interstellar'
  | 'spacecraft'
  | 'exoplanet'
  | 'galaxy'
  | 'cluster'
  | 'nebula'
  | 'black-hole'
  /** A neutron star seen as a pulsar (sim/deepsky). */
  | 'pulsar'
  /**
   * A merger of black holes or neutron stars heard in gravitational waves (sim/deepsky): a region of space where it
   * probably happened, not a body that can be seen.
   */
  | 'merger'
  /**
   * A star that exploded where Earth saw it: a supernova or a kilonova (sim/phenomena). A place that shines as its
   * light curve says while it was seen, and up close a model of the explosion growing into its remnant.
   */
  | 'transient'
  /** A point, not a body: the centre of mass of a system. Never drawn, labelled or visited. */
  | 'barycentre';

/**
 * How far to trust a position at a date:
 *  precise       fitted to, or checked against, a modern ephemeris at this date
 *  approximate   a good model, less accurate than a modern ephemeris (JPL's approximate elements)
 *  illustrative  the orbit is right, the place along it is not (deep past and future)
 *  extrapolated  a model carried beyond its data (a two-body conic after the data end)
 *  unknown       not modelled at this date (a spacecraft before launch)
 */
export type Regime = 'precise' | 'approximate' | 'illustrative' | 'extrapolated' | 'unknown';

export interface Availability {
  /** Whether the body exists and is modelled at this date. Absent bodies are hidden, unpickable and unreachable. */
  available: boolean;
  /** Why not, in a sentence for the interface (null when available). */
  reason: string | null;
  regime: Regime;
}

/** Anything with x, y, z (a three.js Vector3 is one). */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Where a body is. Providers are plain objects, evaluated in float64 once per frame (and at
 * other times for light-time, flights and detectors). They must not allocate in positionAt:
 * the registry calls it for every body every frame.
 */
export interface PositionProvider {
  /** What the model is, for the data sheet: "VSOP87 (astronomy-engine), Standish elements beyond 1700–2200". */
  readonly label?: string;
  /** Position is the same at every time (the Sun, a star held at its catalogue place). Saves light-time work. */
  readonly static?: boolean;
  /**
   * Light-time: evaluate this body at its retarded time with the provider itself (two calls a
   * frame), even where carrying it back along its velocity would be good to a kilometre. The
   * built-in bodies say so, to match their pre-registry positions to the metre. Only read for
   * the head of a system (a body just below a root).
   */
  readonly exactLightTime?: boolean;
  /** Whether the body is there at `timeMs` (UTC ms since 1970), and how good the model is then. Return shared objects. */
  availability(timeMs: number): Availability;
  /**
   * Position relative to the body's centre (its parent, or the barycentre named by `centre`),
   * J2000 ecliptic km, at `time` (`time.tt`: TT days since J2000). With `vel`, also the velocity
   * relative to the centre, km/s. Always finite, even where `availability` says the body is absent.
   */
  positionAt(time: AstroTime, pos: Vec3Like, vel?: Vec3Like | null): void;
}

/** Relative state handed to rotation models that depend on the orbit (synchronous rotation). World axes, km and km/s. */
export interface RelativeState {
  pos: Vector3;
  vel: Vector3;
}

/**
 * How a body turns. `out` receives the rotation from mesh axes to world axes, where mesh +X is
 * the prime meridian, +Y the north pole and −Z longitude 90° E (three.js SphereGeometry with an
 * equirectangular map centred on longitude 0).
 */
export interface RotationProvider {
  orientationAt(time: AstroTime, out: Quaternion, rel: RelativeState | null): Quaternion;
  /** Needs the body's state relative to its centre (synchronous rotation); others get null outside the frame's pass. */
  readonly usesOrbit?: boolean;
}

/**
 * A rotation model as data; the registry compiles it into a RotationProvider.
 *  iau          IAU WGCCRE style: pole (α₀, δ₀) and prime meridian W as polynomials, with
 *               periodic terms in the planet system's phase angles (the bodies.json format, docs/data/assets.md)
 *  spin         a known period about a pole (or ecliptic north when the pole is unknown)
 *  tumble       a non-principal-axis rotation: the body spins about its own z axis every
 *               `periodH` while that axis sweeps a cone of half-angle `coneDeg` about a fixed
 *               direction (the angular momentum) every `precessionH`. For tumblers with no
 *               predictive model (Hyperion, Halley): illustrative, and labelled so
 *  synchronous  tidally locked: the prime meridian faces the parent, the pole is the orbit normal
 *  provider     anything else (the built-in bodies use astronomy-engine's rotation models)
 *  none         no rotation (identity)
 */
export type RotationSpec =
  | IauRotationSpec
  | { model: 'spin'; periodH: number; poleRaDeg?: number; poleDecDeg?: number; w0Deg?: number }
  | { model: 'tumble'; periodH: number; precessionH: number; coneDeg: number; poleRaDeg?: number; poleDecDeg?: number }
  | { model: 'synchronous' }
  | { model: 'provider'; provider: RotationProvider }
  | { model: 'none' };

export interface PhaseAngleSystem {
  /** Each angle: [A₀ (deg), A₁ (deg per Julian century), A₂ (deg per century²)?]. */
  angles: readonly (readonly number[])[];
}

export interface IauRotationSpec {
  model: 'iau';
  /** α₀ = c₀ + c₁T + c₂T² (degrees, T in Julian centuries of TDB since J2000). */
  poleRaDeg: readonly number[];
  /** δ₀ = c₀ + c₁T + c₂T². */
  poleDecDeg: readonly number[];
  /** W = c₀ + c₁d + c₂d² (degrees, d in days since J2000). */
  pmDeg: readonly number[];
  /** Phase angles θᵢ of the planet system, for the periodic terms. */
  phaseAngles?: PhaseAngleSystem;
  /** Coefficients of sin θᵢ in α₀, cos θᵢ in δ₀ and sin θᵢ in W (degrees). */
  raTerms?: readonly number[];
  decTerms?: readonly number[];
  pmTerms?: readonly number[];
}

export interface BodyPhysical {
  /** Volumetric mean radius (the sphere of equal volume), km. */
  radiusKm: number;
  /** The radius's 1σ uncertainty, km, where the source gives one (the data sheet rounds to it). */
  radiusSigmaKm?: number;
  /** A radius that is only a rough size (an interstellar object's nucleus): the data sheet says so. */
  radiusRough?: boolean;
  /** Equatorial and polar radii, km (the 1-bar level for giant planets). */
  equatorialRadiusKm?: number;
  polarRadiusKm?: number;
  /** Triaxial radii [a, b, c] along body-fixed x (prime meridian), y (90° E) and z (north pole), km. */
  triaxialRadiiKm?: readonly [number, number, number];
  /**
   * Largest distance of the surface from the centre, km, for irregular bodies (a shape model's
   * header gives it; else half the longest dimension). The camera stays outside it.
   */
  maxRadiusKm?: number;
  /** Gravitational parameter, km³/s². */
  gmKm3S2?: number;
  massKg?: number;
  /** Sidereal rotation period, hours; negative is retrograde. */
  siderealRotationH?: number;
  /** Length of the solar day, hours. */
  solarDayH?: number;
  /** Sidereal orbital period, days. */
  orbitalPeriodD?: number;
  /** Semi-major axis of the orbit about the parent, km. */
  semiMajorAxisKm?: number;
  /** Axial tilt to the orbit, degrees. */
  obliquityDeg?: number;
  /** V-band geometric albedo (reflected light). */
  geometricAlbedo?: number;
  /** sRGB display tint (markers, orbit lines, the procedural surface). */
  colour: string;
  /**
   * A body that shines by itself (a star): its apparent V magnitude seen from `atKm`, and its
   * effective temperature for the colour of its light. Without it the body shines by sunlight.
   */
  luminous?: {
    vmag: number;
    atKm: number;
    teffK: number;
    /**
     * Its brightness and colour change with the date (a supernova's light curve): `vmag` and `teffK` are rewritten
     * each frame (sim/phenomena), and the point of light takes the new colour (scene/Glints.tsx).
     */
    variable?: boolean;
  };
}

/** A ring system around the body. */
export type RingSpec =
  | {
      kind: 'texture';
      /** Radial texture (u = 0 at innerKm, 1 at outerKm): colour and opacity. */
      texture: string;
      innerKm: number;
      outerKm: number;
      /** Ring shadow on the body (Saturn). */
      shadow?: boolean;
    }
  | {
      kind: 'bands';
      bands: readonly { innerKm: number; outerKm: number; opacity: number; colour: string }[];
      /** Ring-plane pole in ICRF (RA, Dec in degrees); the body's own equator when absent. */
      pole?: { raDeg: number; decDeg: number };
      shadow?: boolean;
      /** Clumps confined in longitude within one ring (Neptune's Adams arcs), turning with the ring. */
      arcs?: RingArcs;
    };

/**
 * Arcs: denser stretches of one ring that stay bunched in longitude. They are drawn between
 * `innerKm` and `outerKm`, over the longitude spans given (degrees, measured in the direction of
 * orbital motion from an origin that turns at `meanMotionDegPerDay`, starting at `phaseDeg` at
 * J2000). Longitudes are in the ring plane, from the ascending node of that plane on the ICRF
 * equator.
 */
export interface RingArcs {
  innerKm: number;
  outerKm: number;
  opacity: number;
  colour: string;
  /** At most eight [from, to] spans, degrees. */
  spans: readonly (readonly [number, number])[];
  meanMotionDegPerDay: number;
  phaseDeg: number;
}

export interface BodyVisual {
  /**
   *  planet      a lit sphere, ellipsoid or shape model with an optional map (default for solid bodies)
   *  sun         the Sun's limb-darkened, granulated disc
   *  star        a blackbody disc at the star's temperature
   *  spacecraft  a small probe model, antenna towards Earth
   *  point       no mesh at all: only the point of light (galaxies until they have renderers)
   *  layer       drawn by a layer of its own (the Milky Way's particles, the star clusters, the nebulae's
   *              pictures: scene/MilkyWay.tsx, scene/Nebulae.tsx): no mesh and no point of light here
   *  lens        a black hole: no mesh and no point of light of its own; the lens draws it (its shadow is the
   *              light the lens does not bring: render/lens/)
   */
  renderer?: 'planet' | 'sun' | 'star' | 'spacecraft' | 'point' | 'layer' | 'lens';
  /** Surface map: a file in public/textures/, or a path from public/ when it contains a slash. Equirectangular, prime meridian at the centre. */
  map?: string;
  night?: string;
  clouds?: string;
  /** Multiply a greyscale map by this colour (bodies.json colourHue). */
  mapTint?: string;
  /**
   * How much of the map shows, 0–1 (default 1): the rest is the body's flat colour. Titan's map
   * is its surface seen at 938 nm through a haze that hides it in visible light, so it is shown
   * faintly under the haze colour.
   */
  mapMix?: number;
  /**
   * Colour components of the map file (bodies.json textureInfo.channels). 1, a greyscale map, is
   * uploaded as a single channel (a quarter of the memory) and decoded from sRGB in the shader.
   */
  mapChannels?: number;
  atmo?: string;
  atmoStrength?: number;
  /** Procedural fallback: gas-giant bands. */
  banded?: boolean;
  /** Texture longitude offset, fraction of a turn. */
  lonOffset?: number;
  /** Fill unimaged (black) regions of the map procedurally. */
  fillBlack?: boolean;
  /** Triangle mesh (LSM1 format, km, body-fixed axes): a path from public/ ("models/phobos.bin"). */
  shape?: string;
  rings?: RingSpec;
  /**
   * Spacecraft: which model, and which way it faces.
   *  probe  a Voyager-like probe (dish, bus, booms), its dish towards Earth (the default)
   *  jwst   a sunshield with the telescope above it, the sunshield towards the Sun
   *  parker a heat shield on a small bus, the shield towards the Sun
   */
  craft?: 'probe' | 'jwst' | 'parker';
  /** A comet: draw its coma and its dust and ion tails (scene/CometTails.tsx). */
  tails?: boolean;
  /**
   * A plain sphere in the body's colour, with no procedural surface: a body no image shows (the
   * planets of other stars).
   */
  flat?: boolean;
}

/** Who found a natural body, and when (for the card). */
export interface BodyDiscovery {
  by: string;
  /** ISO date, or as much of it as is known ("1705", "2005-06"). */
  date: string;
  place?: string;
  note?: string;
  /** URL. */
  source?: string;
}

/** A spacecraft's launch and status (for the card). */
export interface BodyMission {
  /** ISO date-time (UTC). */
  launch: string;
  vehicle?: string;
  site?: string;
  /** What it did, in a sentence. */
  summary?: string;
  status?: string;
  /** ISO date the status was true on. */
  statusAsOf?: string;
  /** URL. */
  statusSource?: string;
}

/** An orbit line for the body, drawn relative to its parent (or its barycentre). */
export interface OrbitLineSpec {
  /** GM of the two-body orbit, km³/s² (default: parent's GM plus the body's). */
  muKm3S2?: number;
  /**
   * A hyperbolic path is drawn back to this date only (Voyager 1: its Saturn flyby), or to the
   * latest of these dates before the one shown (a spacecraft's flybys: the conic it is on has
   * held only since its last one).
   */
  trailFromMs?: number | readonly number[];
  /**
   * Draw the line only while the body is selected, in focus or flown to, as for asteroids and
   * comets (spacecraft, the dwarf planet candidates: lines that would clutter the view).
   */
  onDemand?: boolean;
}

export interface BodyRecord {
  id: BodyId;
  name: string;
  /** A shorter name where room is tight ("Proxima"). */
  shortName?: string;
  /** Other names people type: "Luna", "Alpha Centauri C". */
  aliases?: readonly string[];
  kind: BodyKind;
  /** What it is, in a word or two, when the kind does not say it well ("Our star"). */
  kindText?: string;
  /** What it orbits, as people put it: the Moon → Earth; Charon → Pluto; Pluto → the Sun. Null for a root (the Sun, a star). */
  parent: BodyId | null;
  /**
   * Where the provider's positions are measured from, when that is not the parent: a
   * barycentre ('pluto-barycentre' for Pluto and Charon alike).
   */
  centre?: BodyId;
  /** Other bodies the provider reads at the same time (track centres): they are evaluated first. */
  dependsOn?: readonly BodyId[];
  physical: BodyPhysical;
  rotation?: RotationSpec;
  visual?: BodyVisual;
  facts?: readonly string[];
  /** Sources of the facts (URLs), in the same order. */
  factSources?: readonly string[];
  /** Short names of those sources ("Akeson et al. 2021"), for links that all go to one site (doi.org). */
  factSourceLabels?: readonly string[];
  /** Where the numbers come from, one line for the data sheet. */
  dataSource?: string;
  /** Who found it and when (natural bodies). */
  discovery?: BodyDiscovery;
  /** Launch and status (spacecraft). */
  mission?: BodyMission;
  /**
   * How far to trust the position, one line for the card and the data sheet: "Position: fitted
   * to JPL Horizons, within ~40 km in 1981–2199; the mean orbit (illustrative) outside".
   */
  positionNote?: string;
  /**
   * The other models and approximations in how the body is shown, one short line each, for the
   * card: "No surface map exists: shown in its measured colour", "Rotation illustrative: …".
   */
  modelNotes?: readonly string[];
  provider: PositionProvider;
  /** Single key that goes there ("6"). */
  key?: string;
  /** Label priority: lower wins (the Sun is 0). Default from the kind and size. */
  labelRank?: number;
  /**
   * Camera framing: distance in radii (default 4; 5 for stars, 16 for spacecraft), or in km; and
   * the closest approach, km (default just outside the body: 1.015 radii, or `maxRadiusKm`, or a
   * spacecraft's model).
   */
  framing?: { radii?: number; distanceKm?: number; minKm?: number };
  /** Orbit line options, or false for none (default: every orbiting body but stars and barycentres). */
  orbitLine?: OrbitLineSpec | false;
  /**
   * Carries a light-pulse detector. Default: the planets, the dwarf planets, spacecraft and moons
   * of 1,000 km radius or more (each detection lights up the body's label, so clusters of small
   * moons and swarms of small bodies are left out unless they say true).
   */
  detector?: boolean;
  /** Listed in "Where to?" and the Bodies list (default true). */
  destination?: boolean;
  /**
   * Registered on demand and released again (a catalogue star found in search or approached, a
   * planet host from the exoplanet archive): listed apart in the Bodies list, and left out of the
   * ephemeris table unless it is the target.
   */
  onDemand?: boolean;
  /** Learn article that tells its story. */
  article?: string;
  /** A star's catalogue and physical data, for the card and the data sheet (sim/stars). */
  star?: StarInfo;
  /**
   * The star whose light the body reflects, when it is not the Sun (a planet of another star):
   * it lights the mesh and sets the point of light's magnitude.
   */
  litBy?: BodyId;
  /** A planet of another star: its catalogue data and how each number was found (sim/exoplanets). */
  exoplanet?: ExoplanetInfo;
  /** A cluster, nebula, black hole or galaxy: its catalogue data for the card and the data sheet (sim/galaxy). */
  deepSky?: DeepSkyInfo;
  /** A black hole's own data, for the lens, the clocks, the card and the data sheet (sim/blackholes). */
  blackHole?: BlackHoleInfo;
  /** A pulsar's model up close: its spin, beams and field, and a neutron-star companion (sim/deepsky/pulsarModel.ts). */
  pulsar?: PulsarModel;
  /** A star's close-up: its shape, limb darkening, cells, spots and flares (sim/stars/closeup.ts). */
  starSurface?: StarSurface;
}

/** A picture of a deep-sky object, with what its licence asks to be shown with it (CC BY 4.0). */
export interface DeepSkyImage {
  /** Path from public/ ("images/nebulae/orion-nebula.jpg"). */
  file: string;
  /** The credit line, exactly as the archive gives it. */
  credit: string;
  /** What was changed (CC BY 4.0 asks for it to be said). */
  modificationNote: string;
  /** The archive's page for the image. */
  page: string;
  /** Archive and image id ("ESO eso1723a"). */
  source: string;
  licence: string;
  licenceUrl: string;
  /** Visible light, or near-infrared. */
  band: string;
}

/**
 * A black hole's thin accretion disc as drawn (physics/thinDisk.ts; docs/data/blackholes.md §12): from the record's
 * luminosity, Eddington luminosity and outer edge, with what follows from them for no spin.
 */
export interface BlackHoleDisk {
  /** Its axis, world axes (unit): the binary orbit's angular momentum, so the gas turns with the orbit. */
  normalWorld: readonly [number, number, number];
  /** L / L_Edd and the Eddington luminosity (erg/s) it is a share of, with their source. */
  eddingtonFraction: number;
  lEddErgS: number;
  luminositySource: string;
  /** The accretion rate a disc of no spin needs for that luminosity, g/s. */
  mdotGs: number;
  /** ln T* (K): each ring's temperature is T* f(r)^(1/4); its hottest ring's, K. */
  lnTStarK: number;
  peakTK: number;
  /** Inner and outer edges, units of M (GM/c²), and the outer edge's source. */
  rInM: number;
  rOutM: number;
  rOutSource: string;
  /** How many times slower than real its gas is drawn turning; the real period at the inner edge, s. */
  slowdown: number;
  innerPeriodS: number;
  refs: readonly string[];
}

/**
 * A black hole's own data, for the lens, the time, the card and the data sheet. Every number carries its
 * source in `refs` (citations) as DeepSkyInfo does. (The accretion flow's axis lives only with the flow's
 * model, sim/blackholes/sgraFlow.json; the record just names the flow.)
 */
export interface BlackHoleInfo {
  class: 'supermassive' | 'stellar';
  massMsun: number;
  /** 1σ statistical and systematic, M☉ (0 when not given). */
  massStatMsun: number;
  massSysMsun: number;
  /** 1σ below and above, M☉, where the paper gives them unequal (massStatMsun is then the larger of the two). */
  massUncMsun?: readonly [number, number];
  massSource: string;
  /** Other published masses for the card ("9.62 in the discovery paper", "5.4–8.7 × 10⁹ from stellar dynamics"). */
  massNote?: string;
  /** How the mass was measured, in a few plain words ("the motions of its stars"), where the card says it. */
  massMethod?: string;
  /**
   * The galaxy it lies in when that is not the Milky Way and not its record's parent: LMC X-1's Large Magellanic Cloud,
   * or the NGC catalogue's galaxy a hole sits at the centre of (registered only on demand). For "Where to?".
   */
  hostGalaxy?: { id: BodyId; name: string };
  /** GM, km³/s² (massMsun × GM☉). */
  gmKm3S2: number;
  /** 2GM/c², km. */
  rsKm: number;
  spin: { value: number | null; status: 'unknown' | 'estimated'; note: string };
  /** Accretion-flow model drawn for it, if any. */
  flow?: 'sgr-a-star-riaf';
  /** A thin accretion disc drawn for it, if any (Cygnus X-1's, and those of the persistent X-ray binaries). */
  disk?: BlackHoleDisk;
  /** The Event Horizon Telescope's picture, shown on the card with its credit (CC BY 4.0). */
  ehtImage?: DeepSkyImage & { ringDiameterUas: number; ringSource: string };
  /** A free fall may be started (supermassive only: tides tear a ship apart far outside a stellar hole). */
  fallAllowed: boolean;
  /** Its companion star's id, for a hole in a binary. */
  companion?: BodyId;
  /** Orbital elements assumed rather than measured (Ω, sense, e), for the card. */
  assumed?: readonly string[];
  /** The model notes the card leaves out (it shows at most three, the record's modelNotes): for the data sheet. */
  sheetNotes?: readonly string[];
  refs: readonly string[];
}

/**
 * What the card and the data sheet say about a deep-sky object (sim/galaxy/records.ts). Every
 * number says where it comes from; what is a model says so.
 */
export interface DeepSkyInfo {
  /** What it is, in a few words ("Star-forming region", "Globular cluster"). */
  type: string;
  /** Distance from the Sun, pc, with its range (1σ or the 16th to 84th percentiles) and source. */
  distancePc?: number;
  distanceLoPc?: number;
  distanceHiPc?: number;
  distanceSource?: string;
  /**
   * The distance is where it is now, measured along expanding space (a comoving distance, from its
   * redshift), not the distance its light has come: the young galaxies and the far clusters.
   */
  distanceNow?: boolean;
  /** Sizes, pc, for the data sheet. */
  sizes?: readonly { label: string; pc: number; title?: string }[];
  /** Other rows of the data sheet. */
  rows?: readonly { l: string; v: string; u?: string; title?: string }[];
  /** Its picture (a nebula), shown on its card with the credit. */
  image?: DeepSkyImage;
  /** The galaxy it lies in, when it is not the Milky Way. */
  hostGalaxy?: string;
  /**
   * The one plain line its card keeps in view where its place or look is a model or uncertain ("Its distance comes
   * from its dispersion measure: …"); every note in full is under Sources.
   */
  cardNote?: string;
  /** References of the values, as citations. */
  refs?: readonly string[];
}

/**
 * What the card and the data sheet say about a star (sim/stars/records.ts). Every number says
 * where it comes from: a paper's measurement, or an estimate from the catalogue.
 */
export interface StarInfo {
  /** Index in stars3d.bin.gz. Its point in the star field is hidden while the body is registered (the body draws it). */
  catalogueIndex?: number;
  /** As printed in the catalogue or the paper ("A1 V", "M5.5 Ve"). */
  spectralType?: string;
  /** Effective temperature, K, and whether a paper measured it or it is the catalogue's colour temperature. */
  teffK: number;
  teffSource: 'literature' | 'colour' | 'unknown';
  /** Luminosity, L☉: a paper's, or estimated from M_V with Flower's bolometric correction. */
  luminosityLsun?: number;
  luminositySource?: 'literature' | 'estimated';
  /** Radius, R☉ (the mean for a flattened star): a paper's, or from L and T by Stefan–Boltzmann. */
  radiusRsun?: number;
  radiusSource?: 'literature' | 'estimated';
  /** Equatorial and polar radii, R☉, of a fast rotator. */
  equatorialRadiusRsun?: number;
  polarRadiusRsun?: number;
  massMsun?: number;
  /** A mass given only as a range, M☉. */
  massRangeMsun?: readonly [number, number];
  /** Absolute visual magnitude M_V (no extinction correction). */
  absMagV: number;
  /** Apparent V from the Sun at J2000. */
  vFromSun: number;
  /** Distance from the Sun at J2000 in the catalogue, pc. */
  distancePc: number;
  /** How the distance was measured, and how precise it is, in words. */
  distanceSource: string;
  distancePrecision: string;
  /** A different distance a paper prefers, pc, with its source (Betelgeuse, Deneb, Polaris). */
  altDistancePc?: number;
  altDistanceNote?: string;
  /** Catalogue designations, most prominent first ("α CMa", "9 CMa", "HIP 32349"). */
  designations?: readonly string[];
  /** The IAU constellation it is in. */
  constellation?: string;
  /** References of the physical values, as citations. */
  refs?: readonly string[];
}

/**
 * What the card and the data sheet say about a planet of another star (sim/exoplanets). Every
 * number says whether it was measured, estimated or assumed.
 */
export interface ExoplanetInfo {
  /** The archive's status, or the featured file's for candidates it does not list. */
  status: 'confirmed' | 'candidate' | 'disputed' | 'refuted';
  /** Why it is a candidate or disputed, in a sentence. */
  statusNote?: string;
  /** The star it orbits (or "Kepler-16 A and B"), as named in the card. */
  hostName: string;
  /** Its name in the NASA Exoplanet Archive, when that differs from the name shown. */
  archiveName?: string;
  /** Orbital period, days; semi-major axis, au; eccentricity; inclination, degrees (90: edge-on). */
  periodD: number;
  smaAu: number;
  ecc: number;
  inclDeg: number;
  /** Radius, Earth radii (6,378.1 km), and how it is known. */
  radiusEarth: number;
  radiusSource: 'measured' | 'estimated' | 'placeholder';
  /** Mass, Earth masses: a true mass, a minimum (m sin i), or a model's estimate. */
  massEarth?: number;
  massKind?: 'true' | 'minimum' | 'estimated';
  /**
   * Its temperature, K: the equilibrium temperature (the warmth of its star's light alone),
   * published or computed here from the star (no albedo, heat spread all round); or, for a young
   * giant photographed directly ('own-heat'), the temperature of its own glow measured from its
   * spectrum, far above what its star alone would give.
   */
  teqK?: number;
  teqSource?: 'published' | 'computed' | 'own-heat';
  /** How it was found: the method, the year, the facility and the paper. */
  method: string;
  year?: number;
  facility?: string;
  reference?: string;
  transits?: boolean;
  circumbinary?: boolean;
  /** How each orbital element was obtained, one short phrase each ("Node: assumed"). */
  provenance: readonly string[];
  /** The rule that chose its illustrative colour. */
  colourRule: string;
}
