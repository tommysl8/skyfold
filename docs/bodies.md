# Bodies: the registry, and how to add to it

Everything Skyfold draws, labels, lists, flies to or measures is a **body in the registry**
(`src/sim/bodies/`). The Sun, the planets, the Moon, Pluto, Voyager 1 and Proxima Centauri are
registered at start-up (`core.ts`). The rest of the Solar System (25 moons, the dwarf planets and
trans-Neptunian objects, comets, interstellar objects and spacecraft) is registered from its data
once that has loaded (`src/sim/solarSystem/`, below), and so are the star systems and named stars
(`src/sim/stars/`, below), and so are the planets of other stars (`src/sim/exoplanets/`, below) and the Milky Way's
bodies: the Galaxy itself, Sagittarius A* and its stars, the nebulae and the famous star clusters (`src/sim/galaxy/`,
below), and so are the galaxies beyond it: the Local Group and its neighbours, the named galaxies and clusters and
the most distant galaxies known (`src/sim/cosmos/`, below), and the other black holes with their companion stars
(`src/sim/blackholes/`, below). The rest of the app picks them up by itself:

| Where | What a new body gets without further work |
| --- | --- |
| Scene | a mesh while it (or its rings) is about a pixel wide or more (low-poly under 50 px), a point of light always, an orbit line once its orbit is a few pixels across (asteroids, comets and interstellar objects only while selected, in focus or flown to; at most 48 lines at once) |
| Labels | a label from the pool of 40 when it is among the most important on screen (stars rank by how bright they look from the camera; one fainter than the eye's limit gets none unless selected, in focus or in the system in focus; the stars of a pair closer than 12 px on screen share one label, the pair's barycentre's name: `ui/labelPairs.ts`) |
| Picking | click or double-click it |
| Where to? and the Bodies list | a destination, found by name and aliases, listed by kind, moons under their planet, planets under their star; a star system (a root barycentre) gets a row of its own with its stars under it, and the Stars sit under sub-headings (within 16 light-years, with planets, bright, found in search or nearby) |
| Location trail | "Observable universe › Local Universe › Local Group › Milky Way › Orion Arm › Solar neighbourhood › Solar System › Saturn › Titan"; "… › Milky Way › Orion Arm › Solar neighbourhood › Alpha Centauri › Proxima Centauri"; "… › Milky Way › Orion Arm › Betelgeuse" beyond 100 light-years; the spiral arm only where the arms are measured (`src/sim/galaxy/arms.ts`); a planet on its star's barycentre (circumbinary) straight under the system; "… › Milky Way › Large Magellanic Cloud › Tarantula Nebula" for a body whose `deepSky.hostGalaxy` is another galaxy; a galaxy or a cluster of galaxies under the level of the universe it is in (the Local Group within its zero-velocity surface, the local universe to redshift 0.1, the observable universe beyond: `ui/location.ts`) |
| Scenes | `go:`, `fly:` and `sky-from:` resolve its id (`KNOWN_TARGETS` stays the contract list) |
| Flights | the planner's searchable destination list; the standoff is its framing distance, except for a galaxy, a cluster or a nebula, where the flight goes all the way in to its closest approach and the view then pulls back (`controls/framing.ts` `flightStandoff`); beyond the Local Group flights cross expanding space (`docs/data/cosmology.md` section 12) |
| Roam | a say in the pace of the camera flown by hand (F), by its kind (`controls/roamScale.ts` `roamClassOf`): a body with a surface slows it towards its closest approach (`framing.minKm`, which Roam never crosses), a black hole towards its hover floor, a galaxy, star cluster or nebula towards its edge and then its centre, a group or cluster of galaxies (`kindText` saying "galaxies") only from outside; the readout names it when it is the nearest thing that matters, and leaving Roam orbits it |
| Body card and instruments | name, kind, facts, the data sheet from whatever physical fields it has, the ephemeris table while its system is in focus |
| Light pulses | a detector (its label lights up as a pulse passes) if it is a planet, a dwarf planet, a spacecraft or a moon of 1,000 km or more (`detector: true` for others) |

Import from `src/sim/bodies` (the index), never from `registry.ts` directly: the index registers
the built-in bodies before anyone can ask for them.

## Frames, units and time

- **Provider positions** are J2000 ecliptic (the frame of JPL Horizons' "Ecliptic of J2000.0" and
  of every staging dataset), in km, **relative to the body's centre** (its parent, or a
  barycentre). Velocities are km/s.
- **World positions** (`sim.bodies[id].pos`) are heliocentric, float64 km, in world axes
  `(x, z, −y)` of the ecliptic: three.js has Y up. The registry does the conversion (a
  permutation and a sign: exact).
- **Time** is an astronomy-engine `AstroTime`. `time.tt` is TT days since J2000, which is what the
  staging evaluators call "TDB days" (TT and TDB differ by under 2 ms). `time.ut` gives the civil
  date the astronomy-engine providers and the date policy need. Availability takes UTC ms.

## Ids, kinds, parents and centres

- **Id**: lower-case words joined by hyphens (`churyumov-gerasimenko`, `atlas-3i`). Use the
  staging ids, which are also the scene target ids in `src/content/scenes.ts`.
- **Kind**: `star`, `planet`, `dwarf-planet`, `moon`, `asteroid`, `comet`, `interstellar`,
  `spacecraft`, `exoplanet`, `galaxy`, `cluster`, `nebula`, `black-hole`, or `barycentre` (a point, not a body:
  never drawn, labelled, listed or visited).
- **Parent** is what the body orbits *as people put it*: the Moon → Earth, Charon → Pluto,
  Pluto → the Sun, Proxima b → Proxima. Roots (the Sun, a star, a star system's barycentre) have
  `parent: null`. The parent decides the trail, the Bodies list, the label and ephemeris
  groupings, and the orbit line.
- **Centre** (optional) is what the provider's positions are measured from when that is not the
  parent: a barycentre. Pluto and Charon both have `centre: 'pluto-barycentre'`.
- **Dependencies** (`dependsOn`, optional) are other bodies the provider reads at the same time
  (a track's centres): they are evaluated first each frame.

The registry refuses a record (and registers nothing of its call) with a malformed or taken id,
an unknown parent, centre or dependency, a cycle, a `key` another body already has (keys are
matched case-insensitively), or a destination without a positive `radiusKm` (a barycentre, or a
record with `destination: false`, may have 0).

Registration keeps three orders: registration order; **display order** (a depth-first walk of the
parents, so Jupiter's moons follow Jupiter: `bodyIds()`, `sim.bodyList`); and **evaluation order**
(every body after its centre and dependencies). Within one `registerBodies` call records may come
in any order; everything they reference must be registered already or be in the same call.

## Adding a body

```ts
import { registerBodies, keplerProvider } from '../sim/bodies';

registerBodies([
  {
    id: 'titan',
    name: 'Titan',
    aliases: ['Saturn VI'],
    kind: 'moon',
    parent: 'saturn',
    physical: {
      radiusKm: 2574.76,
      triaxialRadiiKm: [2575.15, 2574.78, 2574.47],
      gmKm3S2: 8978.1371,
      geometricAlbedo: 0.2,
      semiMajorAxisKm: 1_221_900, // helps orbit lines and system framing
      colour: '#927f60',
    },
    rotation: { model: 'synchronous' },
    visual: { map: 'textures/titan.jpg', mapTint: '#ffdeab', atmo: '#e0a050', atmoStrength: 0.5 },
    facts: ['…', '…', '…'],
    factSources: ['https://…', '…', '…'],
    dataSource: 'JPL SSD satellite physical parameters; SAT441 via the fitted orbit model',
    provider: myProvider, // see below
  },
]);
```

Record fields (`src/sim/bodies/types.ts` has them all, documented):

| Field | Notes |
| --- | --- |
| `physical.radiusKm` | mean (equal-volume) radius; required |
| `physical.radiusSigmaKm`, `radiusRough` | the radius's 1σ, and a radius that is only an order of magnitude: the data sheet rounds to the one and marks the other "≈ … (rough)" (it never pads a value to six figures: `ui/dataSheet.ts`) |
| `physical.equatorialRadiusKm`, `polarRadiusKm` | an oblate spheroid (the planets) |
| `physical.triaxialRadiiKm` | `[a, b, c]` along body-fixed x (prime meridian), y (90° E), z (north pole) |
| `physical.maxRadiusKm` | largest distance of the surface from the centre (irregular bodies: a shape's header, or half the longest of `dimensionsKm`); the camera stays outside it |
| `physical.gmKm3S2`, `massKg` | GM feeds orbit lines (the parent's GM plus the body's; about a barycentre, the system's: see "A whole system") |
| `physical.semiMajorAxisKm`, `orbitalPeriodD` | orbit lines about a star with no GM use 4π²a³/P²; system framing uses the moons' `a` |
| `physical.geometricAlbedo` | reflected-light magnitude of the point of light (default 0.3) |
| `physical.luminous` | a star: `{ vmag, atKm, teffK }` (V magnitude seen from `atKm`, effective temperature); catalogue stars give M_V at 10 pc |
| `star` | a star's catalogue and physical data for the card and data sheet (`StarInfo`: spectral type, temperature, luminosity, radius, mass, M_V, distance with its source and precision, and which values are estimates); `star.catalogueIndex` hides the star's point in the star field while the body is registered |
| `factSourceLabels` | short names of the fact sources ("Akeson et al. 2021"), when they all link to one site (doi.org) |
| `physical.colour` | display tint (markers, orbit line, procedural surface, point colour) |
| `rotation` | see "Rotation" |
| `visual` | see "Textures, shapes and rings" |
| `key` | a navigation key, unique; the built-in bodies own 0–9, M and V |
| `labelRank` | label priority (lower wins; the Sun is 0, Proxima 12). Default: by kind, bigger bodies first |
| `framing` | `{ radii }` (default 4, stars 5, spacecraft 16), `{ distanceKm }`, `{ minKm }` for the closest approach (default 1.015 × the largest radius; spacecraft 2.2 radii, clear of the probe model) |
| `orbitLine` | `false`, or `{ muKm3S2, trailFromMs, onDemand }` (a hyperbola drawn back to a date, or to the latest of several dates before the one shown; `onDemand`: drawn only while selected, in focus or flown to) |
| `detector` | light-pulse detector; default on for planets, dwarf planets, spacecraft and moons of 1,000 km radius or more (each detection lights up its label: small moons and small bodies say `true` to have one) |
| `destination` | `false` keeps it out of Where to? and the Bodies list |
| `onDemand` | registered on demand and released again (a catalogue star found in search or approached, an archive host): listed under "Found in search or nearby", left out of the ephemeris table unless it is the target, and its planets keep the archive's names |
| `article` | Learn article slug (moons default to `worlds-around-worlds`, exoplanets and stars with known planets to `other-worlds`) |
| `litBy` | the star whose light the body reflects, when it is not the Sun (a planet of another star): it lights the mesh and sets the point of light's magnitude |
| `exoplanet` | a planet of another star's catalogue data for the card and data sheet (`ExoplanetInfo`: status, period, size, mass, temperature, discovery, how each orbital element was found, the colour rule) |
| `deepSky` | a cluster's, nebula's, black hole's or galaxy's data for the card and data sheet (`DeepSkyInfo`: what it is, distance with its range and how it was measured, sizes in pc, other rows, references, the galaxy it is in when not the Milky Way, and a nebula's picture with its credit line, modification note, licence and page, which the card shows with the picture) |
| `discovery`, `mission` | who found it and when; a spacecraft's launch and status (the card shows them) |
| `positionNote` | how far to trust the position, one line for the card and the data sheet (every body has one, the built-in ones the date policy in words) |
| `modelNotes` | the other models and approximations in how it is drawn, one line each, for the card and the data sheet |

Replace a body's record with `replaceBodies([record])` (same id; it keeps its place in every
order, its state and everything placed on it; its mesh and orbit line are remade). Remove bodies
with `unregisterBodies(ids)`; everything placed on them goes too.

## Position providers

```ts
interface PositionProvider {
  label?: string;          // for the data sheet
  static?: boolean;        // never moves (saves light-time work)
  exactLightTime?: boolean; // light-time: always evaluate at the retarded time (the built-in bodies)
  availability(timeMs: number): { available: boolean; reason: string | null; regime: Regime };
  positionAt(time: AstroTime, pos: Vec3Like, vel?: Vec3Like | null): void;
}
```

Rules:

1. `positionAt` returns the position **relative to the centre**, ecliptic km, and the velocity in
   km/s when `vel` is given. It must be finite at every finite time, even where the body is absent.
2. **Do not allocate** in `positionAt` or `availability`: the registry calls them for every body
   every frame. Reuse scratch objects; return shared availability objects (`ALWAYS[regime]`).
   Do not return numbers from helper functions in the hot path that are not inlined (V8 boxes
   them); write into objects instead.
3. `regime` says how far to trust the position: `precise`, `approximate`, `illustrative`,
   `extrapolated` or `unknown`. The body card and data sheet show it; an absent body
   (`available: false`, with a `reason` in a sentence) is hidden, unpickable and unreachable.

Ready-made providers (`src/sim/bodies/providers/`):

| Provider | Use |
| --- | --- |
| `planetProvider(id)`, `moonProvider`, `sunProvider` | the built-in bodies: astronomy-engine in 1700–2200, Standish elements to ±3000 years, frozen beyond (ephemerisPolicy.ts) |
| `voyager1Provider` | Voyager 1's two-body hyperbola, from its 1980 Saturn flyby, for a million years (`OPEN_ORBIT_YEARS`) |
| `fixedStarProvider(ra, dec, km)` | a star at its catalogue place (no proper motion): the built-in Proxima until the catalogue loads |
| `linearStarProvider(posPc, velKms)` | a star or a system's barycentre in straight-line motion from its J2000 catalogue place, placed where it is (plus its light-time), frozen beyond ±1 Myr (`src/sim/stars/records.ts`) |
| `orbitStarProvider(terms, system)` | a star's share of Kepler orbits about its barycentre, each evaluated at the observation time t + D(t)/c (`src/sim/stars/records.ts`) |
| `atCentreProvider()`, `fixedOffsetProvider(x, y, z)` | on the centre (Pluto today), or a fixed offset |
| `keplerProvider(elements)` | a fixed Keplerian ellipse (mean elements; allocation-free) |
| `twoBodyProvider(r, v, epochTt, mu)` | a conic from a state vector |
| `jupiterMoonProvider('io' …)` | astronomy-engine's Galilean moons relative to Jupiter (ready, unused: the fitted models are 10–30 times closer to JPL) |
| `relativeOrbitProvider(model, opts)` | any evaluator of a position relative to the centre (the fitted moon models) |
| `trackProvider(source, opts)` | any trajectory whose samples are relative to a centre that changes piece by piece, with blends (the Chebyshev tracks) |

A provider can read other bodies at the same time with `heliocentricEclAt(id, time, out)` (and
`heliocentricEclStateAt` for the velocity too): during the frame's pass this reuses what is
already placed. List those bodies in `dependsOn`.

### The complete Solar System (`src/sim/solarSystem/`, docs/data/)

The moons, dwarf planets, trans-Neptunian objects, comets, interstellar objects and spacecraft come
from five data files, fetched in parallel after start-up (`load.ts`: `bodies.json` 180 kB,
`rings.json` 14 kB, `moons.json` 150 kB, `tracks.json` 90 kB, `tracks.bin` 1 MB) and registered in
one `registerBodies` call, with `replaceBodies` for the built-in bodies they enrich. Until they
arrive, the Solar System is the built-in bodies; a scene naming one of the new bodies says
"Loading the Solar System data…" meanwhile. `records.ts` turns the parsed files into records (a
pure function the tests call with the files read from disk):

| Data | Registry |
| --- | --- |
| `bodies.json` kind `moon` | `kind: 'moon'`, `parent` the planet; Charon, Nix and Hydra `parent: 'pluto', centre: 'pluto-barycentre'` |
| `dwarf-planet` | `dwarf-planet` (Ceres, Eris, Haumea, Makemake) |
| `tno` with `dwarfPlanetCandidate` | `dwarf-planet`, `kindText: 'Dwarf planet candidate'` (Gonggong, Quaoar, Sedna, Orcus): listed with the dwarf planets, and saying what they are |
| `tno` (Arrokoth), `asteroid` (Vesta) | `asteroid` (`kindText: 'Kuiper belt object'` for Arrokoth) |
| `comet`, `interstellar`, `spacecraft` | the same kinds; comets are named as in the track file ("Halley’s Comet"), with their designation as `kindText` |
| `radiusKm`, `triaxialRadiiKm`, `gmKm3S2`, `massKg`, `geometricAlbedo`, `orbit.aKm`, `orbit.periodD` | `physical`; a shape model's largest radius (its LSM1 header, `SHAPE_MAX_RADIUS_KM`, checked by a test) as `maxRadiusKm` |
| `rotation` | see Rotation below |
| `assets.texture`, `textureInfo.channels`, `colourHue` | `visual.map`, `mapChannels`, and `mapTint` for greyscale maps |
| `assets.model`, `assets.rings` | `visual.shape`, `visual.rings` (rings.json as bands) |
| `facts`, `factSources`, `discovery`, `spacecraft` | `facts`, `factSources`, `discovery`, `mission` |
| accuracy of each model and track | `positionNote` ("Position: fitted to JPL Horizons, within ~40 km in 1981–2199; …") |
| what else is a model (no map, a tumble, an assumed ring plane, a partial map, a placeholder size) | `modelNotes` |

**Moons** (`moons.json`, docs/data/moons.md). Each model is wrapped by `fittedMoonProvider`:
`relativeOrbitProvider` with `moonState` for position and velocity in one pass (bit-identical
positions to the evaluator's `evalMoon`, and the exact derivative), `velocityUnit: 'km/day'`, and
`moonRegime` for the regime (precise in 1981–2199, the mean orbit, illustrative, outside). The
Galilean moons use their fitted models, not `jupiterMoonProvider` (10 to 30 times closer to JPL).
Moon orbit lines use the effective GM each fit calibrated (`orbitLine.muKm3S2 = model.mu`): with a
point-mass GM a planet's oblateness would show as a spurious eccentricity. **Pluto** gets its own
model with `replaceBodies`, about 2,130 km from the barycentre, opposite Charon; its availability is
the worse of its model's and the barycentre's date policy.

**Tracks** (`tracks.bin`, `tracks.json`, docs/data/tracks.md). `src/sim/tracks.ts` is the evaluator
built with the data, with an allocation-free path added: `Tracks.sample(id, t, withVelocity)` writes into an
object the body owns (`evalTrack` and `evalState` still return fresh copies), and the coefficients
are viewed in place. Each body is a `trackProvider` (`trackBodyProvider`):

- `centres`: `earth`, `venus`, the giant planets, `arrokoth` (the Arrokoth track body), and the
  tracks' `pluto`, which is the **Pluto–Charon barycentre** (`@9`), mapped to `pluto-barycentre`.
  `ssb` is `barycentreFromSun` (sim/voyager.ts, astronomy-engine's barycentre: the one the
  extrapolated states were stored against), converted to ecliptic axes. `dependsOn` lists the
  registry bodies of every centre the track uses.
- Availability comes from the index alone (`Tracks.regimeAt`), never from evaluating the fit:
  `before-launch` hides a craft ("Voyager 2 had not been launched yet: it left Earth on 20 August
  1977."), `unknown` hides Webb after 21 September 2031, `extrapolated` shows the body, labelled.
- **Open orbits.** A body leaving the Sun on a hyperbola (a track's two-body extension with positive energy, Voyager 1's
  provider, a clicked comet or asteroid with e ≥ 1) is shown for a million years either side of J2000
  (`OPEN_ORBIT_YEARS`, `beyondOpenOrbit`, `openOrbitEnded`) and hidden beyond, with the reason: by then it has run tens
  of parsecs out, where the Galaxy's pull and passing stars bend its path (not modelled) and the stars round the Sun
  are held still (`MOTION_VALID_YEARS`). It is not left running off in a straight line (Voyager 1 would be 17 kpc away
  in a billion years, its orbit line beyond what 32-bit floats can draw).
- **Voyager 1** moves onto its track with `replaceBodies`, keeping its key, label rank and
  framing; after 2099 it follows the track's own two-body extension about the barycentre.
- **Jumps.** The tracks return Horizons' own position jumps exactly (up to 126,500 km, Pioneer 10
  in 1983; comets where JPL's orbit solutions hand over). The app keeps them: nothing uses
  `smoothJumps`. It draws no trails of past positions (orbit lines are osculating conics through
  where the body is now, so a jump moves the line with the body), and a marker's step does not
  show: at the time rates where a step lasts long enough to see, the camera follows the body it
  looks at, and from elsewhere the largest step spans under a pixel beyond about 10⁸ km; the steps
  near planets (at most 19,000 km) come weeks from the flybys.
- Orbit lines: escaping craft are drawn as conics about the whole Solar System's mass, back to
  their last flyby (`orbitLine.trailFromMs` may list dates: the latest before the date shown is
  used); spacecraft and the dwarf planet candidates have `orbitLine.onDemand` (drawn only when
  selected, in focus or flown to, whatever their kind: from inside the Solar System long, tilted
  orbits cross the whole sky); the IAU dwarf planets are drawn like Pluto; Webb has none.
- Planet-centred pieces are relative to astronomy-engine's planet (a system barycentre for the
  giants), which is where the app draws the planet: flybys are exact as stored (Voyager 2 passes
  Neptune at 29,236 km, New Horizons Pluto's barycentre at 15,382 km, as in the data).

**Visuals.** Greyscale maps are tinted with `colourHue` and uploaded as one channel. Titan's map
(938 nm, through the haze) is shown faintly (`visual.mapMix: 0.3`) under its haze colour, because
to the eye Titan is a featureless orange ball. Bodies without a map are drawn in their colour
(albedo-based lightness), and a map-less shape model is shaded by its relief alone (`flat`).
Comets get `visual.tails` (scene/CometTails.tsx, render/cometTail.ts). Spacecraft get
`visual.craft`: `probe` (Voyager's shape, dish at Earth), `jwst` (sunshield at the Sun), `parker`
(heat shield at the Sun); and the craft in Earth orbit (sim/satellites, docs/data/near-earth.md) `iss`, `tiangong`, `hubble`,
flying a local-vertical attitude with their arrays turned to the Sun.

**Rings** (rings.json). Jupiter, Uranus and Neptune get theirs with `replaceBodies`; Haumea and
Quaoar with their records. Bands: a ring given as `radiusKm` ± `widthKm`/2, opacity
1 − e^(−τ) (the apparent τ where only that was measured; 10⁻⁴ where none was). Rings too faint to
see at all (Jupiter's, τ ~ 10⁻⁶; Neptune's dusty rings) are drawn at least 0.1 × √(τ/τ_max)
opaque and lightened to a luminance of 0.22, and the planet's card says so; Uranus's dense rings
and Haumea's keep their real opacity and colour. Neptune's Adams arcs (`RingArcs`) are drawn in
the ring shader with their 1989 spans turning at 820.1194°/day, at an arbitrary phase (labelled).
Quaoar's ring lies in its assumed equator (its pole is not known; labelled).

**Content.** Every Solar System target of `KNOWN_TARGETS` resolves once the data are in. Articles:
moons → worlds-around-worlds (the default); the Pluto system, dwarf planets, TNOs, interstellar
objects, the Voyagers and New Horizons → edges-of-the-solar-system; comets → clockwork-and-chaos;
Parker → rockets-to-the-stars; Webb → other-worlds; Pioneer 10 → how-big-is-the-solar-system.

### Stars and star systems (`src/sim/stars/`, docs/data/stars.md)

The star field is a point cloud of all 329,770 catalogue stars (`scene/Starfield.tsx`), drawn on the GPU from
float32 parsecs relative to the camera (near the Sun only the first ~16,000, the only ones that can show there:
`visibility.ts`); only the stars people visit are bodies:

- **The five systems** of `systems.json` (Alpha Centauri with Proxima, Sirius, Procyon, 61 Cygni, Capella): a
  barycentre root (`<system>-barycentre`, `linearStarProvider`, `gmKm3S2` of the system), a barycentre for each
  inner pair that orbits as one (`alpha-centauri-ab-barycentre`, on the Proxima orbit), and the stars on their
  Kepler orbits (`orbitStarProvider`) with `parent` and `centre` their (inner) barycentre, `gmKm3S2` from their
  masses and `orbitLine: {}` (a star gets an orbit line only when its record asks). The published orbits are in
  observed time: each is evaluated a light-time D(t)/c after the date, so the light-time correction shows exactly
  the published orbit from the Sun. Proxima's built-in record is replaced (`replaceBodies`) and keeps its detector,
  short name and aliases.
- **The named stars** of `systems.json` (Vega, Betelgeuse, TRAPPIST-1 …, 26 in all) on `linearStarProvider`.
- **Any catalogue star on demand**, `star-<index>`: chosen in search (`registerCatalogueStar`,
  `ensureCatalogueStar`), or approached within 0.1 pc (`nearby.ts`; released past 0.15 pc unless it is the focus,
  the selection or a destination). Anything that needs a catalogue star as a body (an exoplanet host) calls
  `ensureCatalogueStar(index)`, or `bodyOfCatalogueStar(index)` to find the body a star already has. A star is
  placed as it is registered (`updateEphemeris`), so a camera move planned at once starts from where it is.
- **Catalogue spectral types** are checked against the star's colour and M_V (`plausibleSpectralType`): a type two
  classes off its colour temperature (three cooler for a supergiant or bright giant, which dust may redden), a dwarf
  class for a star far too luminous for one, or a white dwarf that is not faint is left out, and the card says so
  (Dubhe's "F7V comp" is its companion's). Without a type, `starKindText` says what M_V and colour allow.
- **Companions with no colour** of their own (the catalogue split their light from their primary's: Mintaka B,
  Hadar B) take their pair's temperature at decode time (`borrowCompanionTemperatures`, within 0.005 pc among the
  first 20,000 stars), and the card says the temperature is borrowed.
- Stars are `approximate` within ±1 Myr of J2000 and `illustrative` beyond, where they stand still.
- From beyond the Solar System's pixel the Sun is a point of light with its real magnitude, labelled "Sun (home)",
  and only the Solar System's other labels and orbit lines are hidden; other systems keep theirs.
- Stars start `'loading'` in `starStatus()`; a scene naming a star target says "Loading the star catalogue…"
  meanwhile.

### Planets of other stars (`src/sim/exoplanets/`, docs/data/exoplanets.md)

- **The featured systems** (`exoplanets-featured.json.gz`, 19 kB) are registered once the star catalogue is in: 36
  planets and candidates of TRAPPIST-1, Proxima, Barnard's Star, 51 Pegasi, HR 8799, Kepler-90, TOI-700, Kepler-16,
  ε Eridani, τ Ceti and α Cen A (S1), about the star team's star bodies, plus the three hosts the star catalogue
  lacks (`kepler-90`, `toi-700`, and the Kepler-16 pair on its binary orbit about `kepler-16-barycentre`). Ids are
  `<host id>-<letter>` (`trappist-1-e`); S1 is `alpha-centauri-a-s1` (A and B stay the star team's); the
  circumbinary planet is `kepler-16-ab-b`.
- **The archive** (`exoplanets.json.gz`, 6,372 planets) loads in a worker when first wanted ("Where to?" opens, the
  camera leaves the Sun for the stars, or a star is in focus), matched to the star catalogue there. Every star body
  that is a host then gets its archive planets (`gj-581-c`); any host can be registered by name, from the star
  catalogue (`ensureCatalogueStar`) or, for the 3,779 faint ones it lacks, from the archive's host columns, and
  those are released again past 0.15 pc unless kept. `src/content/exoplanetDestinations.ts` searches all their names.
  A planet of one of the app's named stars takes the star's name with its letter ("Aldebaran b", "Lacaille 9352 b"
  for the archive's "alf Tau b", "GJ 887 b"), so the card, the Bodies list and the trail agree; others keep the
  archive's name with its Bayer abbreviation as a Greek letter ("ι Dra b"). The archive's name stays an alias and
  is on the data sheet (`planetDisplayName`).
- An exoplanet has `kind: 'exoplanet'`, `parent` its star (a barycentre as `centre` for a circumbinary planet),
  `litBy` its star, `detector: false`, `article: 'other-worlds'` and `exoplanet` (its card data). Its provider,
  `skyOrbitProvider`, is a fixed Kepler orbit in the visual-binary conventions, evaluated at `t + D(t)/c` with D the
  host's distance read through `heliocentricEclAt` (published ephemerides are arrival times at the Sun, so with
  light-time on the Sun sees every transit at its published time). It is allocation-free. `orbitLine.muKm3S2` is
  n²a³, so the line is the Kepler ellipse whatever the masses.
- Reflected-light magnitudes use the `litBy` star's `luminous` magnitude (`setMagnitude` in `src/sim/derived.ts`).
- A planet is a plain sphere (`visual.flat`) in a colour from its size and temperature (`appearance.ts`); the card's
  notes start with "No image of this planet exists; colour is illustrative." and say what is assumed.
- `scene/PlanetHosts.tsx` rings the star catalogue's hosts within 40 pc (one draw call).
- In Where to? and the Bodies list an exoplanet goes to its star's whole system with the planet selected
  (`goToPlanetarySystem`); a scene's `go:` to a star with planets frames the system too.

### The Milky Way (`src/sim/galaxy/`, docs/data/galaxy.md)

- **At start-up** `loadGalaxy` registers the Milky Way itself (`milky-way`, kind `galaxy`, renderer `layer`, framed
  from 100,000 light-years: `frameMilkyWay`), Sagittarius A* (`sgr-a-star`, kind `black-hole`, renderer `lens`: no
  mesh, its radius the horizon's, drawn by its lens; see the black holes below) and the four S-stars of GRAVITY 2022
  on their orbits about it (`sStarProvider`: allocation-free,
  evaluated a light-time after the date, general relativity's precession included, `illustrative` away from the
  epochs of the data). The 45 nebulae follow from their own chunk (`nebulae.json`), and once the stars are in, the
  particle model and the clusters load in a worker; the 60 famous open clusters and the named globulars then join the
  registry (ids clear of the nebulae's). A scene naming a cluster or nebula target says "Loading the Milky Way…"
  meanwhile.
- Nebulae, clusters and the Galaxy have renderer `layer`: `scene/Nebulae.tsx` draws each nebula's picture as a card
  facing the Sun at its distance and true size, `scene/GalaxyModel.tsx` the particle model with the globulars' clumps
  (into their own quarter-resolution target, `render/galaxyLayer.ts`) and the open clusters' rings, and
  `scene/MilkyWay.tsx` the sky from the Sun behind everything (`render/shaders/milkyway.glsl`, also in the
  relativistic remap pass). They get no point of light; globulars carry `physical.luminous` from their measured M_V
  for labels and the data sheet.
- Labels: a cluster, nebula or galaxy is labelled when its radius on screen is 4 px or more or it is as bright as a
  star that shows, and never while the camera is inside it; picking skips what the camera is inside. A background
  label behind the body in focus, within its disc on screen, is left out, and so is anything beyond the Solar System
  while a scene of the Solar System runs; with the Local Group in focus its galaxies are labelled down to V = 11.
- Every nebula's picture carries its credit line, unaltered, and its modification note (`deepSky.image`); the card
  keeps them under its Sources, one click from the picture, and `ui/viewport/PictureCredits.tsx` puts a small Credits
  button in the corner of the view that lists every picture drawn in the view (in flight, aberrated and 1/D times its
  size: `apparentCard`), one entry each, whatever the readouts setting.

### Galaxies beyond the Milky Way (`src/sim/cosmos/`, docs/data/cosmos.md)

- **Once the browser is idle** `loadCosmos` registers, in one call, the 169 galaxies of `local-galaxies.json.gz`
  (the CC0 Local Volume Database: ids `lg-<database key>` with hyphens, and `andromeda`, `triangulum`, `lmc`, `smc`),
  the named objects of `named.json` (`m81`, `m87`, `centaurus-a`, `sombrero`, `whirlpool`, the `virgo-cluster`,
  `coma-cluster` and `bullet-cluster`, and `gn-z11`, `jades-gs-z14-0`, `mom-z14`) and the `local-group` (its
  barycentre, radius the zero-velocity surface). The Milky Way must be registered first: its satellites have
  `parent: 'milky-way'`, Andromeda's `parent: 'andromeda'`, M87 `parent: 'virgo-cluster'`. Positions are fixed
  (`approximate` within a million years of J2000); the young galaxies and the Bullet Cluster stand at their comoving
  places now. A scene naming one of them says "Loading the galaxies…" meanwhile.
- They are `kind: 'galaxy'` (clusters and groups of galaxies `kind: 'cluster'` with `kindText` "Cluster of galaxies" or
  "Group of galaxies", which puts them in their own group of the Bodies list), renderer `layer`, with
  `physical.luminous` from their M_V for labels and the data sheet. `scene/Galaxies.tsx` draws them from their
  `GalaxyShape` (`cosmosState.shapes`: template, size, world axes, luminosity, dust): each one large enough on screen
  as its particle template (one instanced draw per template), the others as one splat each, into the Milky Way's
  target. A body registered by another phase with renderer `layer` and no shape is not drawn by it.
- `deepSky.distanceNow` marks a comoving distance ("… light-years from the Sun now"); cards say what is a model.
- Articles: galaxies, the Bullet Cluster and the Local Group → island-universes; Virgo and Coma →
  the-expanding-universe; the young galaxies → the-edge-of-reach.
- The cosmic web (`scene/CosmicWeb.tsx`) and the CMB map (`scene/CmbMap.tsx`) are layers, not bodies: the View menu
  turns them on, their cards show while they do (`ui/viewport/LayerCards.tsx`), and "Where to?" finds them.

### Black holes (`src/sim/blackholes/`, docs/data/blackholes.md)

- **Registration.** `src/sim/blackholes/load.ts` registers, synchronously at the end of `registerStars`, the eight
  binaries (a `barycentre`, the hole and its companion star, placed with the stars' own `orbitStarProvider` on the
  published orbit evaluated a light-time on) and the lone OGLE-2011-BLG-0462 (held fixed at its measured place), and
  at the end of `registerCosmos` M87* (`m87-star`, child of `m87` at its centre, given M87's anchor in the expanding
  universe so its light-time and drawn place are its galaxy's). Sagittarius A* stays the Galaxy's (`sgr-a-star`,
  above). The holes' ids are kept in their own list (`blackHoleIds`), out of the stars' `added`; `blackHoleStatus`
  gives scenes their loading state.
- **The record.** Kind `black-hole` (`kindText` "Supermassive black hole" or "Stellar-mass black hole"), renderer
  `lens` (no mesh and no point of light: the lens draws it), `physical.radiusKm` the horizon r_s = 2GM/c², closest
  approach r_s(1 + 10⁻⁶), framing 10⁴ r_s for a stellar hole and 50 r_s for M87*, no `article` (the kind decides:
  `content/bodyArticles.ts`), and a `blackHole` block (`BlackHoleInfo`: mass with its uncertainties and note, GM, r_s,
  spin, whether a fall is offered, the companion, the assumed elements, the EHT's picture, at most three card notes
  and the notes for the data sheet).
- **What a new black hole gets.** Any registered body of kind `black-hole` with a horizon is a candidate for the lens
  (`sim/gravity.ts` `blackHoles()`, re-read when the registry changes): the one with the largest r_s/r becomes the lens
  from x = r_s/r ≥ 5 × 10⁻¹⁰, with 10 % hysteresis, and brings its clocks, hovering, the HUD and the card's "From here"
  line with it. Each frame `sim/lensBodies.ts` gives the bodies near the lens's axis their images (`BodyState.lens`:
  orders 0–2, screen points, magnitudes, rings), so glints, labels, picking and the hover tag sit on the drawn images,
  and the active hole's shadow is an exact circle on screen (`holeView`) for its label and picking. A body in
  `lens.spheres` (a companion seen near the axis) is drawn by the lensed spheres' pass instead of its mesh.
- **Labels** (`ui/Labels.tsx`): a stellar-mass hole is a label candidate only when in focus, selected, the destination,
  or when its companion's label would show (the pair shares one label while unresolved, `ui/labelPairs.ts`); a lone
  hole within 1 pc or when chosen; M87* from inside M87. A selected hole's sub-line is its height above the horizon.
- **Lists and search** (`content/destinations.ts`): a binary with a hole is a "Black hole and star" row under The
  Milky Way, the hole first; OGLE-2011-BLG-0462 after Sgr A*; M87* under M87. A name ending in `*` scores just below an
  equally good alias unless the query ends in `*` ("M87" finds the galaxy, "M87*" the hole); only Sgr A* answers to a
  bare "black hole".
- **Adding one**: add its row to the table in `scripts/build-blackholes.mjs` (every value with its reference key), run
  it, and run `npx vitest run src/sim/blackholes`; a hole in a binary needs its companion's radius and temperature and
  the orbit in the stars' conventions (`src/sim/stars/systems.json`).

## Rotation

`rotation` is data; the registry compiles it:

| `model` | Use |
| --- | --- |
| `iau` | pole (α₀, δ₀) and prime meridian W as polynomials, with periodic terms in the phase angles of the planet system: exactly the `iau-2015` and `fitted` records of bodies.json (`poleRaDeg`, `poleDecDeg`, `pmDeg`, `raTerms`, `decTerms`, `pmTerms`, and `phaseAngles: bodiesJson.phaseAngles[phaseSystem]`) |
| `spin` | a period about a pole: bodies.json `snapshot` records (Nix, Hydra: the 2015 pole, an arbitrary phase) and `period-only` ones (ecliptic north as the pole); say it is illustrative |
| `tumble` | a spin about the body's own axis while that axis sweeps a cone about the angular momentum (`periodH`, `precessionH`, `coneDeg`): the `chaotic` and `complex` records with a shape (Hyperion, Halley), illustrative |
| `synchronous` | tidally locked: the prime meridian faces the parent, the pole along the orbit normal (moons without an IAU model) |
| `provider` | your own `RotationProvider` (the built-in bodies use astronomy-engine's) |
| `none` or absent | identity (`unknown` records; spacecraft point their antenna at Earth in the renderer) |

Mesh axes: +X the prime meridian, +Y the north pole, −Z longitude 90° E. With the Solar System
maps (prime meridian at the image centre) no extra rotation is needed. `rotationSpice.test.ts`
checks every IAU model compiled from bodies.json against the SPICE Toolkit (3 × 10⁻¹⁰ rad). The
IAU prime meridians of synchronous moons face their planet to within their orbits' eccentricity
and a few degrees (Mimas up to 11°, from its resonant libration term): they define the maps'
longitudes, so the app keeps them rather than pointing the moons at the planet.

## Textures, shapes and rings

- **Texture**: `visual.map` is a file in `public/textures/` (`'2k_mars.jpg'`) or a path from
  `public/` (`'textures/io.jpg'`, as bodies.json gives it). Equirectangular, prime meridian at the
  centre, east to the right (`lonOffset: 0.5` for a map starting at longitude 0). Greyscale maps:
  set `mapTint` to the body's `colourHue` and `mapChannels: 1` (bodies.json `textureInfo.channels`):
  they are then uploaded as one channel, a quarter of the memory, and decoded from sRGB in the
  shader. `fillBlack` fills unimaged black regions procedurally.
  Maps load once the body is a few pixels wide, decoded off the main thread and uploaded one per
  frame, and live in an LRU cache with a 256 MiB budget (160 MiB on an integrated GPU;
  `src/render/textures.ts`). A mounted mesh holds its maps (`acquireTexture` / `releaseTexture`),
  so they are never disposed under it, even while frames are stopped; the Sun's, Earth's and the
  focused system's stay pinned.
- **Shape**: `visual.shape` is an LSM1 mesh from `public/` (`'models/phobos.bin'`,
  `src/render/shapes.ts`). It is drawn in place of the ellipsoid once loaded, oriented by the
  rotation model, with the same maps. Set `physical.triaxialRadiiKm` for the fallback and the
  framing.
- **Rings**: `visual.rings` is either `{ kind: 'texture', texture, innerKm, outerKm, shadow }`
  (Saturn's photographic strip) or `{ kind: 'bands', bands: [{ innerKm, outerKm, opacity, colour }],
  pole?, shadow? }` built from rings.json: a ring given as `radiusKm` and `widthKm` spans
  radius ± width/2; `opacity = 1 − e^(−τ)`. `plane: 'parent-equator'` means no `pole` (the body's
  own equator); a pole gives `pole: { raDeg, decDeg }`. Narrow rings stay visible as partial texels.
  `arcs` (`RingArcs`) adds clumps confined in longitude within one ring, drawn in the ring shader.
- **Map mix**: `visual.mapMix` (0–1) shows only that much of the map over the flat body colour
  (Titan under its haze).
- **Tails**: `visual.tails` draws a comet's coma and its dust and ion tails (scene/CometTails.tsx).
- **Renderer**: `visual.renderer` is `planet` (default for solid bodies), `sun`, `star` (a
  blackbody disc at `luminous.teffK`), `spacecraft` (a model at true size, scaled to the craft's
  radius: `visual.craft` `probe`, Voyager's shape with its antenna to Earth; `jwst` and `parker`,
  their shields to the Sun), `point` (a point of light only) or `layer` (drawn by a layer of its own, never as a mesh
  or a point of light: the Milky Way's model, the star clusters and the nebulae's pictures, `src/sim/galaxy/`; the
  galaxies beyond it, `src/sim/cosmos/` and `scene/Galaxies.tsx`) or `lens` (a black hole: no mesh and no point of
  its own, drawn by its lens, `render/lens/` and `scene/BlackHoleLens.tsx`; its glint slot carries the accretion
  flow's point when there is one).

## A whole system

1. Register the barycentre if there is one (`kind: 'barycentre'`, `destination: false`,
   `orbitLine: false`, `detector: false`), then the bodies on it (`centre`), then their moons.
   Register a system in one `registerBodies` call.
2. Light-time is worked out per system: the body just below the root (a planet, a barycentre,
   a spacecraft) is carried back to its retarded time along its velocity where that is good to
   1 km (half its acceleration times the delay squared), and otherwise placed there with two
   ephemeris steps (the built-in bodies always are: `exactLightTime`); its members are placed
   at that time and carried to their own light-time along their velocities. Hundreds of moons cost
   one evaluation each, and a system that is only its head (an asteroid, a comet) usually none.
3. The system's framing (`systemFramingDistance`) comes from its moons' `semiMajorAxisKm` (or
   their present distance): the trail's "Saturn" link uses it.
4. Orbit lines of moons are drawn about their planet (a body on a barycentre that orbits the
   body's parent is drawn on the barycentre's orbit: Pluto's line is its system's path) and
   mount only once they are a few pixels across. A body placed on a barycentre (Charon) is drawn
   on its orbit about it, under the pull of the rest of the system, whose mass centre is on the
   far side: μ = (GM − GMᵢ)³ / GM², GM the system's (the barycentre record's `gmKm3S2`, else the
   sum over every body placed on it). Give every member its `gmKm3S2`: without them Charon's
   line is not a circle.

## Costs and limits

- Per frame, every registered body is placed (provider + one float64 add), gets its apparent
  position, distance, size, magnitude and screen position, and a slot in the point-of-light
  buffer. `src/sim/bodies/perf.test.ts` registers 500 moons: under 0.3 ms per frame in Node and
  no allocation per body (the built-in bodies' astronomy-engine calls allocate about 170 kB a
  frame; light-time allocates per system).
- Meshes exist only for bodies about a pixel wide or more; orbit lines only for orbits a few
  pixels across, at most 48 (and none in the relativistic view, which leaves guides out); labels
  are a pool of 40. Keep it that way: never give a body a component, a DOM node or a draw call
  just for being registered.
- The relativistic cube map is redrawn only while a mesh is in it (in interstellar flight it is
  cleared once and left, and the remap pass is skipped), and its memory is released half a minute
  after the view is turned off.
- Frame budget on the target laptop (Intel Xe, Chrome, 1936 × 1384 px): 3.7–4.7 ms of GPU a frame
  at Earth, Saturn, TRAPPIST-1, Alpha Centauri and in flight to Sirius without multisampling,
  9.1–9.8 ms with it (render/AdaptiveQuality.tsx drops it at a pixel ratio of 2 on integrated
  GPUs). With the Milky Way (1936 × 1416 px, GPU timer queries, best of batches): 5.1 ms at Earth (1.3 of it the sky
  from the Sun), 5.3 from outside the Galaxy, 5.8 among the S-stars, 6.1 to 7.2 in the disc (Carina and Orion
  nebulae), 6.3 to 6.6 facing the bulge from 1 to 3 kpc, 6.4 to 7.4 all along the 1 g flight to Sgr A*, and 7.6 to
  8.1 for that flight in the split view (render/galaxyLayer.ts: the large splats in a coarser target, and half the
  particles again in the split view). With the galaxies beyond (1936 × 1376 px): 4.8 ms at Earth, 4.4 ms for the
  Local Group from 3 Mpc with the cosmic web on, 4.1 ms for the cosmic web from 200 Mpc, 4.7 to 4.8 ms at and inside
  Andromeda, 5.8 to 5.9 ms at and inside the Large Magellanic Cloud, 5.6 ms in the 1 g flight to Andromeda and 6.9 ms
  in its split view (docs/data/cosmos.md; 0.5 to 1 ms more while the processor is busy). With the faint stars' map
  and the model's glow (evening review, warm GPU): 6.5 to 7.0 ms at Earth, 7.6 to 7.9 at the start of a 1 g flight,
  8.2 to 9.3 at the start of one in the split view, and 9.3 to 10.3 in the classical view 100 to 500 pc from the Sun,
  where the sky map and the model hand over (docs/data/cosmos.md, Performance; docs/data/galaxy.md §12). With the
  black holes (29 September 2026, 2,048 × 1,320 px, pixel ratio 2, no multisampling, GPU timer queries, medians of
  batch medians with the processor 20–40 % busy, the lens's quality rung 0; docs/data/blackholes.md §11): 5.2 ms at
  Earth; from Sgr A* 5.8 at 4,000 au, 6.8 at 1,000 au, 7.3 at 500 au, 8.0 at 100 M (4.2 au) with the accretion flow
  off and 9.0 with it on (7.4 at rung 1, which the GPU-time controller takes), 7.4 at 20 M; arriving at 4,050 au 6.7
  (8.2 in the split view, which starts at rung 1: 6.7); free flight at 0.1c 500 au out 8.6 (7.7 at rung 1); falling,
  at 6 M 9.5 (8.5 at rung 1, 8.1 at rung 2) and inside the horizon 6.7; beside Gaia BH1 and its star 6.8; M87* from
  1,000 au 5.6; 480 pc from the Sun, no hole in view, 7.0; the start of the 1 g flight's split view 7.5. Busier, the
  close views read 8 to 12 ms, and the controller's pixel-ratio steps hold them. The lens itself costs 0.7 ms at
  4,000 au and 2.7 to 3.5 ms close in; far from a black hole every shader runs its old program. A new large
  geometry needs a bounding sphere set by hand, or three.js computes one over every vertex on its first frame (34 ms
  for the star field).
- A shader's first compile stops the frame that first draws it: 100 to 270 ms each for the stars, the galaxies, the
  cosmic web and the Milky Way model and its glow on the target laptop (browsers keep compiled programs, so this is a
  first visit's cost, and an update's). `render/precompile.ts` compiles the ones first drawn on demand (the model and
  its glow, the CMB map, the relativistic remap, the cosmic web once its table is in) in the background, one at a
  time, 8 s after start-up (KHR_parallel_shader_compile); compiled during start-up they held up its own compiles
  (0.95 s of stopped frames instead of 0.75 s, every program compiled afresh). Give it any new large material that
  first shows on demand. The black holes' 28 lensed programs are there too (17 in the background list: 6 s cold on a
  quiet machine, 25–28 s busy; the exact orbit-line program, 17–37 s, only when first wanted), and the lens is drawn
  only once they have compiled, so none compiles mid-flight and none is in start-up (its first 30 frames took 990 and
  996 ms, against a median of 1,394 ms the evening before this work; `npm run check:shaders`).
- Register a system in one `registerBodies` call: every call rebuilds the orders and re-renders
  the scene's lists (500 single calls take 60 ms; one call of 500 takes 2 ms).
- Everything stays float64 until the camera's position is subtracted (the floating origin).

## Tests to keep

- `equivalence.test.ts`: the built-in bodies reproduce the pre-registry positions, velocities,
  orientations, light-time, sizes, magnitudes, screen positions, framing and flights (fixture in
  `__fixtures__/pre-registry.json`).
- `registry.test.ts`: orders, the parent walk, availability, every provider and adapter, rotation
  models, light-time per system, the barycentric Pluto system.
- `perf.test.ts`: the 500-moon benchmark.
- `src/content/registryIntegration.test.ts`: a body registered later reaches search, the Bodies
  list, the trail, scenes, flights, framing and the light-pulse detectors.
- `checks.test.ts`: what the registry refuses (a taken key, a destination without a radius) and
  the camera limits of spacecraft and irregular bodies.
- `adapters.test.ts` and `providers/moonState.test.ts`: the one-pass paths of the adapters, and
  the fitted moons' state against the evaluator (`src/sim/moonModels.ts`).
- `src/sim/solarSystem/solarSystem.test.ts`: the whole Solar System registered from the shipped
  data: every target resolves, moons exactly where their models say, Pluto and Charon about their
  barycentre, the Voyager 2 and New Horizons flybys, Webb near L2, Halley's 2061 perihelion, the
  regimes where the data end, the rotations, rings, notes, lists and search, and the per-frame
  cost of the evaluators.
- `src/sim/moonModels.test.ts`, `src/sim/tracks.test.ts`: the evaluators against independent
  JPL Horizons checkpoints (`src/sim/__fixtures__/`); `rotationSpice.test.ts`: the IAU models
  against SPICE; `src/content/solarSystemData.test.ts`: the data files, maps and meshes;
  `src/render/cometTail.test.ts`: the tails' physics.
- `src/sim/lightDelay.test.ts`: light-time carried along a straight line where it is good to a
  kilometre, and exact where it is not.
- `src/scene/orbitLines.test.ts`: the conic, GM and size of every orbit line (Charon about the
  Pluto–Charon barycentre, planets of other stars).
- `src/sim/exoplanets/*.test.ts`: the evaluator (Kepler, frames and handedness, the visual-binary and RV/transit
  conventions, light-time, the featured systems against their observations, the archive's orbits) and
  (`exoplanets.test.ts`) the planets in the registry: exactly where the evaluator puts them, transits seen from the
  Sun at the published times, HR 8799 on its measured plane, cards, colours, host matching, search, hosts released.
- `src/sim/galaxy/*.test.ts`: the model's arms, warp and dust against the papers and the generator, the particle
  file and its GPU arrays, the S-star orbits against GRAVITY's, the frames, the cards' geometry (not mirrored), the
  clusters' light, the one display law for diffuse light, the sky map's calibration, the spiral arm of a place, and
  (`galaxy.test.ts`) the Milky Way's bodies: every target resolving, S2 in the registry and as its orbit line, the 1 g
  flight to the centre, the trail, the groups and search, the pictures' credits, the named scenes.
- `src/sim/cosmos/*.test.ts`: the extragalactic files and their evaluators (frames, disc orientations rebuilt from
  their angles, the cosmic web's layout and distance modes, the CMB maps), the one cosmology reproducing named.json's
  numbers, the particle templates, and (`cosmos.test.ts`) the galaxies in the registry: every target resolving,
  places and parents, the Local Group's barycentre, Andromeda a 3°-long oval at position angle 37.7° from Earth with
  its arms trailing its spin, the trail up to the observable universe, the lists and search, the articles, the young
  galaxies' cards, the clusters' sizes from their members, and the named scenes.
- The black holes: `src/physics/schwarzschild.test.ts`, `schwarzschildTables.test.ts`, `lensPoint.test.ts` and
  `geodesics.test.ts` (the physics against the committed fixtures of the independent reference), `lensMirror32.test.ts`
  (the shaders' float32 arithmetic, with this GPU's own arctangent error); `src/sim/gravity.test.ts` (the hole chosen,
  and at Earth with every hole registered a year of clocks byte-identical to the flat code), `fall.test.ts`,
  `lensBodies.test.ts`; `src/sim/blackholes/records.test.ts` (every record against its JSON, Kepler, the donors in front
  at conjunction) and `accretion.test.ts`; `src/sim/galaxy/nuclearCluster.test.ts`; `src/render/shaderIncludes.test.ts`
  (every material's shaders expanded, no declaration twice), `lensVariants.test.ts`, `gpuBudget.test.ts`,
  `lens/lensState.test.ts`, `flow/flowRay.test.ts`; `src/sim/stars/lensCandidates.test.ts`;
  `src/content/blackHoleScenes.test.ts` (each scene's numbers against `holeView` with the Galaxy registered);
  `src/controls/cameraController.test.ts`; `src/ui/viewport/bodyCard.test.ts`.
- `src/sim/stars/*.test.ts`: the star files (layout, sorting, distances, velocities, the bright subset, the sky
  from Earth against the catalogue it replaced), motion and light-time, the Sixth Orbit Catalog ephemerides and HST
  measurements, magnitudes and estimated sizes, names and search, constellations, and (`stars.test.ts`) the star
  bodies: every star target resolves, orbits seen from the Sun, frozen stars beyond 1 Myr, cards, orbit lines,
  search, flights and the nearby-star promotion.
