# Near Earth: satellites, more spacecraft, L1 and L2, eclipses

What is round Earth and near it: the satellites (the ISS, Tiangong and Hubble as bodies; every active satellite and
the tracked debris behind a View switch), Juno, Europa Clipper and SOHO on JPL Horizons trajectories, the Sun–Earth
L1 and L2 points, and the shadows of solar and lunar eclipses. Also a fix to Earth's drawn rotation that all of
these needed.

| File | What |
| --- | --- |
| `src/sim/satellites/sgp4.ts` | SGP4/SDP4 (Vallado et al. 2006), WGS-72, improved mode; `meanElements` (SGP4 up to its periodic terms) |
| `src/sim/satellites/teme.ts` | TEME of date → J2000 ecliptic; TEME → geodetic (for the tests) |
| `src/sim/satellites/omm.ts` | CelesTrak's OMM CSV, kinds of orbit, orbit summaries |
| `src/sim/satellites/celestrak.ts` | Fetching GP data at run time, the browser's cache, CelesTrak's usage policy |
| `src/sim/satellites/swarm.ts`, `swarm.worker.ts` | The swarm's packed mean elements (worker) and their float64 twin of the shader |
| `src/sim/satellites/records.ts`, `index.ts`, `named.ts` | The ISS, Tiangong and Hubble: records, provider, loading |
| `src/scene/Satellites.tsx`, `src/render/satelliteMaterials.ts`, `src/render/shaders/satellites.vert.glsl` | The swarm, the selected satellite's trace, picking, the L1/L2 marks (one lazy chunk) |
| `src/ui/satelliteCard.ts` | The swarm's note in the view (what it is, from when, why it is hidden) |
| `src/sim/eclipses.ts`, `src/render/shaders/planet.frag.glsl` | Eclipse geometry (tests, journeys) and the shadows on every body with eclipsers |
| `src/sim/lagrange.ts` | The Sun–Earth L1 and L2 points |
| `scripts/build-tracks.mjs`, `scripts/build-bodies.mjs` | Juno, Europa Clipper and SOHO added to the tracks and the body data (docs/data/tracks.md) |
| `scripts/satellites/build-sgp4-fixture.mjs` → `src/sim/satellites/__fixtures__/sgp4-verification.json` | The SGP4 test cases |

## 1. Satellites

### The data, and why it is fetched rather than shipped

The positions come from the US Space Force's general perturbations (GP) mean elements, as
[CelesTrak](https://celestrak.org/) (Dr T. S. Kelso) serves them, in the CSV form of the CCSDS OMM. TLEs cannot
carry the six-digit catalogue numbers given since July 2026; the OMM can, and holds the same mean elements.

CelesTrak redistributes the data freely, but states no licence for passing it on, and the data come from Space-Track,
whose user agreement restricts redistribution. So Skyfold ships none of it: each visitor's browser fetches what it
needs from CelesTrak (which answers browsers from any site: `Access-Control-Allow-Origin: *`) and keeps it in its own
Cache Storage. CelesTrak's [usage policy](https://celestrak.org/usage-policy.php) and
[GP documentation](https://celestrak.org/NORAD/documentation/gp-data-formats.php) ask that each set be downloaded at
most once per two-hourly update, and that a client stop at once on any answer but 200. `celestrak.ts`:

- a set less than two hours old is read from the cache and not asked for again;
- an older one is asked for once; if CelesTrak refuses (403 also means "you already have this update"), the server
  fails or the network is down, the cached copy is used however old it is, and that set is not asked for again until
  the page is reloaded;
- nothing is fetched before it is wanted: `GROUP=stations` and `CATNR=20580` (Hubble) once the app is idle after
  start-up, about 9 kB; `GROUP=active` (about 16,700 satellites, a few MB) only when View › Satellites is first turned on;
  the four debris groups (`cosmos-1408-debris`, `fengyun-1c-debris`, `iridium-33-debris`, `cosmos-2251-debris`, about
  2,700 pieces) only with View › Satellites › Debris.

Offline, or refused with nothing cached, the three named craft are hidden with the reason on their card ("…its
orbital elements could not be fetched from CelesTrak"), and the swarm's note says why it is empty.

Limitation: CelesTrak counts downloads per network address, so a second browser behind the same address (a school,
an office) within the same two hours is refused and falls back on its own cache, if it has one.

### SGP4

`sgp4.ts` is a port of Vallado's reference implementation (sgp4unit.cpp, 2015 revision, as also carried by
python-sgp4, MIT), with the same equations in the same order: near-Earth SGP4 with its drag terms, and for periods of
225 minutes or more the lunar-solar secular and long-period terms and the 12- and 24-hour geopotential resonances.
WGS-72 constants and the "improved" operation mode, which are what the GP elements are fitted with and what the
verification output uses.

Check: the 33 test cases of the paper (`SGP4-VER.TLE`, 667 states printed by the reference program in `tcppver.out`)
are reproduced to under a millimetre and a micrometre per second (the printed precision), including the deep-space,
resonant, low-perigee and Lyddane-choice cases; the two bad element sets fail where the reference fails.

Frames: SGP4 gives TEME (true equator, mean equinox of date). `teme.ts` turns it about the pole by the equation of the
equinoxes into astronomy-engine's true equator and equinox of date, then precesses and nutates to J2000 and rotates
to the ecliptic, one cached matrix per moment.

### The three craft that are always there

The ISS (25544), Tiangong (48274, the Tianhe core module's elements) and Hubble (20580) are registry bodies
(`kind: 'spacecraft'`, `parent: 'earth'`), placed by full SGP4 every frame, with cards (NASA's and CMSA's facts, the
mission, launch and status) and simple shapes at true size (scene/Bodies.tsx: the ISS's 94 m truss across the orbit,
its modules along it and eight 35 × 12 m arrays turning to the Sun; Tiangong's T; Hubble's tube and two arrays), flying
a local-vertical attitude that is assumed, not tracked. The card says how good the position is: approximate within
3 days of the element set's epoch (a few km), illustrative to 30 days (drag and reboosts move a station by tens to
hundreds of km a day from its old elements), hidden beyond, with the reason.

### The swarm

View › Satellites (off by default, saved like the other switches), and Debris inside it. About 16,700 points, one
draw call, no per-frame CPU work:

- the worker runs SGP4's secular part (`meanElements`: secular gravity, drag, and for deep-space orbits the
  Sun's and Moon's pull and the resonances) for every satellite at a reference time and packs its mean elements and
  their rates per minute (12 floats each, 0.8 MB on the GPU);
- the vertex shader carries them on linearly for the minutes since, and from there runs SGP4's own tail: the J3
  long-period terms, Kepler's equation in SGP4's equinoctial form, the J2 short-period terms;
- the reference time moves on (the worker asked again) once the clock is four hours from it, so the shader's float32
  time stays small.

Against full SGP4 (`swarm.test.ts`) that is within 0.3 km in low orbit over the five hours a reference set is used,
under 1 km for geosynchronous and Molniya orbits, and 2.5 km for the paper's four-day orbit, whose inclination the
Moon turns fastest.

Colours by kind, muted: low orbit grey-white, Starlink blue (the shells and, when the data show one, a fresh launch's
string of beads), the navigation satellites of medium orbit sand, the geostationary ring amber, elliptical orbits
lilac, debris rust. A satellite in Earth's shadow (a cylinder with a soft edge) is dimmed to 14%. The swarm shows within
4 million km of Earth (fading from 1.5 million), and within 30 days of the median element epoch (fading from 14 days);
beyond, the note in the view says why it is hidden. The points are a map of the orbits people use, not what the
eye would see (the note says so).

Clicking a point (picking runs the same arithmetic in float64 on the CPU, only on a click) makes that satellite a
body (`sat-<NORAD number>`, released when another is picked) with a card: its name, catalogue number and
international designator, orbit (perigee × apogee, inclination, period) and the epoch of its elements.

The selected satellite's orbit is a short trace (half an orbit, at most two hours, centred on it, fading towards both
ends) computed by SGP4, in place of a full orbit line.

## 2. More spacecraft on JPL Horizons trajectories

Juno, Europa Clipper and SOHO join the tracks (docs/data/tracks.md, same pipeline, same fit and checks):

- **Juno** (`-61`): launch, the Earth flyby of 9 October 2013 (Earth-centred piece), cruise, then one Jupiter-centred
  piece from where it crossed Jupiter's switch radius on 12 April 2016 to the end of Horizons' data (30 September
  2028; a plan after 23 September 2026). An orbiter has no way out, so `build-tracks.mjs` gained an `orbit` mode: the
  last piece stays planet-centred to the end. It is fitted to the small bodies' tolerance (250 km target, 1,000 km
  bound) rather than the spacecraft's 25 km, to keep the file small: even so it adds 220 kB, and its 70 close passes
  would need many more segments at 25 km. In all the three craft add 463 kB to `tracks.bin` (now 1.48 MiB).
- **Europa Clipper** (`-159`): launch, the Mars flyby of 1 March 2025 (a new `mars` centre), the Earth flyby of
  3 December 2026, cruise, and Jupiter-centred from 22 January 2030 to the end of the data (3 September 2034: the
  planned Ganymede impact; all a plan after 22 September 2026). Horizons stitches its trajectory from many
  navigation files: the jumps between them are kept and listed (docs/data/tracks.md).
- **SOHO** (`-21`): Earth-centred, like Webb, from its launch on 2 December 1995 to the end of the data (2 November
  2026), through its 1998 loss and recovery (Horizons fills the gap with a ballistic arc).

Each has a card from `build-bodies.mjs` (NASA and ESA facts with sources, launch, mission and status) and is drawn as
a point of light and a label, as their shapes are not modelled.

**L1 and L2** (`sim/lagrange.ts`): the collinear points of the Sun and the Earth–Moon barycentre (the restricted
three-body equations, Murray & Dermott 1999 §3.5), about 1.50 and 1.51 million km from it. Marked quietly (a faint ring
and its name) while Webb or SOHO is selected or in focus, or the camera is within 600,000 km of a point.

## 3. Eclipses

Every body with eclipsers (`sim/eclipses.ts eclipsersOf`: the planet a moon goes round, and a body's moons of 500 km
and more; at most four) has them in the planet shader. Each point of the surface (on the true-size body, when it is
drawn enlarged) sees how much of the Sun's disc each eclipser leaves uncovered: the exact area of overlap of two discs,
from their angular radii and separation (taken from its sine and cosine, which keeps float32 precise near zero).
That one number is the umbra, the penumbra and the antumbra of an annular eclipse. The CPU leaves an eclipser out
unless its penumbra can reach the body that frame, so outside eclipse seasons the shader does nothing more.

- **Solar eclipses**: the Moon's shadow on Earth (and, the same way, the Galilean moons' shadows on Jupiter, Titan's on
  Saturn, Charon's on Pluto…).
- **Lunar eclipses**: Earth's shadow on the Moon, with Earth's radius taken by Danjon's rule (the radius at 45°
  latitude, enlarged by 1/85 for the atmosphere), as NASA's predictions take it. In the umbra the Moon is lit by the
  sunlight Earth's atmosphere bends into the shadow, red, brightest near the umbra's edge: drawn a few hundred times
  brighter than it is (totality is about 10⁻⁴ of the full Moon), so it can be seen at the view's exposure. The Moon's
  card says so.
- The Sun is an evenly bright disc: limb darkening is left out, which slightly changes how fast a partial phase deepens
  near its edge (Earth's card says so).

`sim/eclipses.ts` is the same geometry in float64, with each body where it was when the light passed it (the Moon
1.3 s earlier, which moves the Moon's shadow on Earth by about 40 km). Against NASA (F. Espenak, GSFC):

| Eclipse | NASA | Skyfold | Difference |
| --- | --- | --- | --- |
| 2017-08-21 total solar, greatest | 18:25:31.8 UT, 36°58.0′ N 87°40.3′ W | 18:25:32.4 | 0.6 s, 1.2 km |
| 2024-04-08 total solar, greatest | 18:17:18.3 UT, 25°17.2′ N 104°08.3′ W | 18:17:20.5 | 2.2 s, 0.8 km |
| Both, central line every 20–30 min | the SEpath tables | | under 10 km |
| 2025-09-07 total lunar, P1 U1 U2 greatest U3 U4 P4 | 15:28:21 16:27:02 17:30:41 18:11:43 18:52:47 19:56:26 20:55:00 | 15:28:19 16:27:00 17:30:37 18:11:42 18:52:49 19:56:27 20:55:01 | within 4 s |
| 2025-09-07 umbral magnitude | 1.3619 | 1.3628 | |

(NASA computed the lunar contacts in 2009 with ΔT = 75 s; it was about 69 s, which moves its UT times by about 6 s.)

**Journeys**: "The next total solar eclipse" (from the date shown: on 9 October 2026, 2 August 2027, greatest in
Egypt), from the Sun's side, a minute a second; "A total lunar eclipse" (the next total one: 31 December 2028),
from Earth's side of the Moon. Both find their eclipse with astronomy-engine's search and say where and when.

### Earth's prime meridian (a fix)

Checking the 2024 track showed Earth's map turned 0.9° (100 km at the equator) from where it should be.
astronomy-engine's `RotationAxis(Earth)` gives the pole of date correctly but a spin measured as if from the node of
the equator of date on the J2000 equator, while the Earth rotation angle it uses is measured from the celestial
intermediate origin, which stays near the J2000 equinox's meridian. The two differ by about the pole's right ascension
of date: 0.9° in 2024, 0.7° in 2026, and far more before 2000, where that right ascension is near 12 hours (Earth's map
was turned by tens of degrees in 1979). `engine.ts earthAxis` now puts the prime meridian where astronomy-engine's own
Greenwich sidereal time and precession–nutation put it (as its Observer functions do). A test checks Greenwich and two
other meridians against astronomy-engine's `ObserverVector` from 1700 to 2199 to 10⁻⁶°; the equivalence fixture's
Earth orientations were regenerated (its note says so). Lighting never depended on it; the map, the aurora's place,
the eclipse shadows over the map and the satellites' ground tracks did.

## 4. Cost

- Off (the default) the swarm costs nothing: its worker, data and draw exist only once the switch is first turned on
  near Earth.
- On, near Earth, 16,695 satellites: −0.13 ms median difference against off (6 interleaved rounds, spread 1.2 ms:
  within the noise), 3,200 × 1,584 px, pixel ratio 2 (`perf.ab`, 9 October 2026, processor busy). Setting them up takes
  the worker about a third of a second once, and packing all of them about 40–70 ms every four simulated hours (measured
  on 3,297 sets in Node: 66 ms and 7–13 ms), off the main thread.
- The ISS, Tiangong and Hubble: three SGP4 calls a frame, and 97 for the selected one's trace (about 0.05 ms).
- Eclipses: nothing outside eclipse seasons (the shader's loop runs zero times); while one is under way, a few dozen
  operations per pixel of the body shaded.

## 5. Limits

- GP elements and SGP4 are good to a few km near the elements' epoch; Skyfold has only the current elements, so
  satellites are shown within 30 days of them, and the past and future of the ISS, Tiangong and Hubble are not.
- Swarm positions leave out the change of SGP4's secular rates over the hours a reference set is used: under 0.3 km
  in low orbit, a few km for the most perturbed deep-space orbits.
- The attitudes of the ISS, Tiangong and Hubble are assumed (local vertical, arrays to the Sun), and their shapes are
  simple.
- CelesTrak may refuse a browser on a network that has already fetched the current update (see above).
- Juno and Europa Clipper at Jupiter are fitted to 250 km (1,000 km bound), not 25; Europa Clipper's flybys of
  Europa are not modelled relative to Europa.
- The umbra's red light is brightened a few hundred times; the Sun's limb darkening is left out of partial phases.
