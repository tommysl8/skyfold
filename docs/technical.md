# How Skyfold works

The technical side of [Skyfold](../README.md): what is simulated and how, the physics, where every data set comes
from and how to rebuild it, and how the code is laid out. How each data set was made is written up in more detail in
[data/](data/), and how bodies are added to the app in [bodies.md](bodies.md).

## Simulation

- **True scale, floating origin.** Positions are float64 kilometres. The camera never leaves the origin, and orbit
  lines are computed on the GPU relative to each body, so they stay exact from 1 m to 50 AU and beyond. A
  logarithmic depth buffer covers metres to light-years; the Galaxy's layers reach the GPU in kiloparsecs and the
  galaxies beyond in megaparsecs, relative to the camera, so single precision holds out to the observable universe.
- **Real sky and real bodies.** Positions of the Sun, the 8 planets, the Pluto–Charon barycentre and the Moon come
  from Astronomy Engine, which also supplies the IAU rotation models, so Earth's day side is correct for the current
  moment. The scene also has Saturn's rings (with shadows both ways), 1.47 million real asteroids and comets from
  JPL (every one with a good orbit, each as bright as it really is from the camera), and the stars.
- **The stars in 3D.** 3,754,841 stars: the 329,770 of every star to V ≈ 10 and every catalogued star within 100
  light-years, loaded at start; the rest of AT-HYG (Tycho-2, to V ≈ 12), every star of the Gaia Catalogue of Nearby
  Stars within 100 pc, the luminous hot stars of Zari et al. (2021), Gaia DR3's luminous stars out to 5–8 kpc,
  open-cluster members within 1 kpc and every exoplanet host, fetched in small files as the camera comes near
  (docs/data/stars.md §12). All from AT-HYG v4.0 and Gaia DR3 distances and velocities, each at its own distance, moving in a straight line with its
  measured space velocity (good for about a million years either side of 2000; the stars are held still beyond), as
  bright as it looks from wherever the camera is and coloured by temperature. From Earth the sky is the familiar
  one, to the eye's limit of magnitude 6.5; fly away and the 88 constellation figures come apart. Alpha Centauri
  (with Proxima), Sirius, Procyon, 61 Cygni and Capella orbit on their published orbits about barycentres that move
  with the systems; of the 37 named stars and members of those systems, 36 have sizes and 32 temperatures from their
papers (the cards label the others as estimates or colour temperatures); any star within a third of a light-year
  becomes a sphere you can orbit. Search finds any star by name or catalogue number (Betelgeuse, α Ori, HIP 27989).
- **The complete Solar System.** 25 moons (the Galilean four included) and Pluto about its barycentre follow orbit
  models fitted to JPL Horizons over 1981–2199, within 0.6 km (Pluto) to 1,500 km (Nereid, on its long, eccentric
  orbit); each card gives the figure.
  Ceres, Vesta, the dwarf planets and large trans-Neptunian objects, Arrokoth, four comets (with dust and ion tails
  from a simple physical model), the three interstellar visitors, and Voyager 1 and 2, New Horizons, Pioneer 10,
  Parker Solar Probe, JWST, Juno, Europa Clipper and SOHO follow Chebyshev fits to JPL Horizons (spacecraft within 25 km, and under a km near
  their flybys). Moons are textured with USGS and NASA mosaics and turn by the IAU rotation models; eight
  irregular bodies, 67P and Arrokoth among them, use real shape models, and Nix, Hydra and Haumea their measured
  ellipsoids; Jupiter, Uranus, Neptune, Haumea and Quaoar
  have their rings. Where the data end or no model exists (a rotation, a surface map, a ring plane), the card says so.
- **Planets of other stars.** All 6,372 confirmed planets of the NASA Exoplanet Archive can be found by name (K2-18 b,
  51 Pegasi b) and visited: each goes round its star on a Kepler orbit, timed so that, seen from the Sun, transiting
  planets cross their stars at the published times. Eleven systems are built from their papers: TRAPPIST-1's seven planets, Proxima b
  and d, Barnard's Star, 51 Pegasi b, HR 8799's four giants on their measured orbit plane, Kepler-90, TOI-700,
  Kepler-16's two suns, ε Eridani b, the τ Ceti candidates and the candidate around α Centauri A. Nobody has seen
  their surfaces, so their colours are illustrative, chosen by a stated rule from size and temperature; where an
  orbit's orientation or a planet's place along it is not measured, the card says it is assumed. Stars with known
  planets carry a small ring once you are among the stars.
- **The Milky Way.** From near the Sun the glow behind the stars is the real sky (NASA SVS, from Gaia, with the light of
  the catalogue's stars too faint to draw added from the star files), with its dust lanes where they are, drawn as
  bright for its size as the faint stars are and aberrated and Doppler shifted in flight. A few hundred parsecs out it
  hands over to a model of the whole Galaxy built from published measurements (Reid et al. 2019 arms, Wegg et al. bar,
  Drimmel and Spergel dust): 200,000 particles dimmed by the dust along each line of sight, with a smooth glow worked
  out from the same laws near the camera, a barred spiral seen from 100,000 light-years, labelled as a model (its far
  side is extrapolated). 1,664 star clusters (1,500 open clusters with Gaia DR3 distances; 164 globulars glowing with
  their measured brightness), 45 nebulae as their
  photographs at their measured distances and true sizes (each credited on its card and on screen; seen from anywhere
  but Earth they are flat cards), and Sagittarius A*, the black hole at the centre (below), with the four stars whose
  published orbits are openly licensed (S2 every 16 years, with general relativity's precession). Within 1.25 kpc of the Sun the dust is the real one in 3D (the map of Edenhofer et al. 2024): leaving home its
  clouds (Taurus, Orion, Ophiuchus, the walls of the Local Bubble) dim the stars and the Milky Way behind them and move
  against the sky, faintly lit by the Galaxy's starlight; nine named clouds and the Radcliffe Wave are labelled near
  them (docs/data/dust.md). The trail names
  the spiral arm you are in where the arms are measured. A 1 g flight to the centre takes about 20 years aboard and
  27,000 at home.
- **Black holes.** Sagittarius A* (4.3 million solar masses, GRAVITY 2022), M87* (6.5 billion, at the centre of M87),
  Gaia BH1, BH2 and BH3, Cygnus X-1, V404 Cygni, A0620-00, MAXI J1820+070 and XTE J1118+480 with their companion stars
  on their published orbits, and OGLE-2011-BLG-0462, found alone by microlensing. Each is an exact Schwarzschild
  black hole (drawn without spin, since none is measured well enough): its lens bends the light of everything in view,
  stars, the Milky Way's glow, galaxies, the cosmic web, nebulae and bodies, into its shadow, its Einstein ring and
  the thin photon ring, with each star's second image (and, close to the shadow's edge, its third and fourth) and rings
  of light where a body lines up behind it, in the classical and the relativistic view alike. Near a black hole
  clocks slow (home runs 1.054 times faster than you ten horizon radii from Sgr A*, a thousand times at the closest you
  can hover), the camera hovers in height above the horizon down to a millionth of its radius, and a panel gives the
  thrust hovering takes and the tides; scenes add a circular orbit and snapshots at 0.9c, and you can fall into Sgr A*
  or M87* through the horizon to where tides would tear a ship apart, with home's clock kept on the free-fallers'
  clocks. Round Sgr A* two
  labelled models fill in what cannot be seen from Earth: the hot gas falling in (a fitted accretion-flow model, ray
  traced along exact light paths, bright as a point from afar and a lopsided ring close in; its card offers the same
  model at 1.3 mm to compare with the Event Horizon Telescope's picture) and a statistical nuclear star cluster of
  60,000 stars and a glow. Eleven scenes show the shadow, the Einstein and photon rings, hovering at the horizon, the
  innermost stable orbit, the same place at three speeds, a fly-by at 0.9c, S2 passing behind the hole, the gas, the
  fall and M87* from 1,000 au. `docs/data/blackholes.md` writes it all up, with the checks.
- **Beyond the Milky Way.** The 169 galaxies of the Local Group and its surroundings out to 3 Mpc (the CC0 Local
  Volume Database), M81, M87, Centaurus A, the Sombrero and the Whirlpool, the Virgo, Coma and Bullet clusters, and
  three of the most distant galaxies confirmed (GN-z11, JADES-GS-z14-0 and MoM-z14, the record at redshift 14.44), each
  at its measured place. Every galaxy is drawn as a model: a few thousand particles following the light of its type
  (spiral, barred, Magellanic, irregular, dwarf spheroidal, elliptical, the Sombrero as a lenticular), scaled to its
  measured size and brightness and tilted as it lies, with its own dust; from Earth Andromeda is a 3°-long oval at
  its real position angle, from above a spiral. The young galaxies stand where they are now, their cards explaining
  that what you would see there is their light of 13.5 billion years ago. The cosmic web shows the 55,877 galaxies of
  Cosmicflows-4 as a map (coloured by kind, sized by infrared luminosity, with the survey's gaps on its card), and a
  layer of the sky shows the cosmic microwave background (WMAP), contrast enhanced about 10,000 times. The trail goes
  up to the Local Group, the local universe and the observable universe.
- **Flights across expanding space.** Inside the Local Group, which gravity holds together, space is static and a
  flight is special relativity: a 1 g flight to Andromeda takes 28.6 years aboard and 2.5 million years at home.
  Beyond it the expansion of the universe is modelled, not zoomed through: flights cross a flat ΛCDM universe with the
  Planck 2018 parameters, the destination recedes while you travel, billions of years can pass at home, and galaxies
  beyond the edge of reach can never be reached at all. These flights assume a perfect engine and a destination that
  moves with the expansion. A flight to a galaxy or a cluster goes in almost to its centre, and the view then pulls
  back to show the whole of it.
- **Things that happen.** The six supernovae seen from Earth with known dates and places (SN 1006, 1054, 1181, 1572,
  1604 and 1987A) shine where and as they were seen when the clock is near their dates, following their recorded light
  curves; up close a model shows the fireball and the debris growing to today's remnant at the measured speeds (the
  Crab's picture grows with it). GW170817's two neutron stars spiral together in NGC 4993 at the chirp's real pace and
  its kilonova glows blue, then red, as AT 2017gfo was measured. M87's jet (in its own light, its knots where Hubble sees
  them) and Centaurus A's jets and lobes (false colour) are beamed by their speeds as seen from the camera. Earth's
  auroral ovals glow on the night side about the date's geomagnetic poles (IGRF-14), where Starkov's model puts them for
  the activity chosen in the View menu (Kp). What is a model is said on each card; `docs/data/phenomena.md` writes it up.
- **Round Earth.** The ISS, Tiangong and Hubble as bodies with cards and simple shapes, placed by SGP4 (Vallado et al.
  2006, checked against its test cases) from the current GP elements, fetched from CelesTrak by the browser and kept
  in its cache; with View › Satellites every active satellite (about 16,700, and the tracked debris of four break-ups)
  moved on the GPU from SGP4's mean elements, dimmed in Earth's shadow, within 30 days of the elements. Eclipses are
  drawn per pixel from the share of the Sun's disc each point sees: the Moon's shadow on Earth (the 2017 and 2024
  eclipses within 3 s and 2 km of NASA's greatest eclipse) and Earth's on the Moon, red in the umbra (Danjon's rule;
  NASA's contacts to 4 s). `docs/data/near-earth.md` writes it up.
- **The Milky Way's magnetic field.** View › Magnetic field lines draws the Galaxy's regular field as field lines of
  the UF23 model (Unger & Farrar 2024) in 3D, traced through the disc, the halo and the X-field, coloured by their sense
  and dimmed by the model's dust behind the disc; from the Solar System it shows instead the field's direction across the
  sky, measured from WMAP's polarisation maps, as faint streaks. A chunk of its own, loaded only when switched on;
  `docs/data/galactic-field.md` writes it up.
- **Magnetic fields.** View › Magnetic field lines draws the measured fields of the Sun and the planets: Earth's from
  IGRF-14 for the date, Jupiter's from Juno (JRM33), Saturn's from Cassini's Grand Finale (Cassini 11+), Uranus's and
  Neptune's tipped, off-centre fields from Voyager 2 (AH5, O8), Mercury's offset dipole (MESSENGER) and Ganymede's
  dipole, traced in a worker and turned with each body, cut at published magnetopauses (Shue, Joy, Arridge) for a
  typical solar wind; the Sun's corona as a potential field to 2.5 solar radii from SDO/HMI's map of the date's
  Carrington rotation (2010–2026), with Parker spirals and the current sheet out to 3 au. The tails and the currents in
  space are not modelled; `docs/data/fields.md` writes it up.
- **Space weather.** View › Solar eruptions (on by default) draws the coronal mass ejections in flight on the date
  as faint fronts: 1,086 from NASA's DONKI catalogue (2010–2026: every one of 1,000 km/s or more, and every one
  linked to a shock at Earth or a storm) and the Carrington event of 1859 (a model on published values), each in its
  measured direction, width and speed and flown by the drag-based model (Vršnak et al. 2013), fitted to the measured
  shock at Earth where there is one. As a front passes Earth its sheath's estimated pressure pushes the magnetopause
  in (Shue et al. 1998), and the aurora follows the Kp index measured at the date (GFZ, since 1932; Kp "Auto", the
  default), its ovals stretched south in great storms as far as May 2024's. `docs/data/space-weather.md` writes it
  up.
- **Where the mass is.** View › Dark matter (off by default) draws what gives out no light: the Milky Way's dark halo as a
  faint fog of its projected density (McMillan's 2017 mass model), tracer stars going round with its pull and, beside
  them, as fast as the stars and gas alone would carry them, with the measured rotation curve (Eilers et al. 2019) on
  its card, and the Bullet Cluster's X-ray gas (Chandra) apart from its lensing mass (a model of Clowe et al.'s 2006
  map). `docs/data/dark-matter.md` writes it up, with the spread in the halo's mass.
- **Two size modes.** *True scale* shows specks, as reality does (planets still shine at their real apparent
  magnitude). *Enlarged* draws bodies at least a few pixels across while keeping every distance true.
- **Travel.** Enter β exactly, or use a logit-scaled fader (0.00001c to 0.99999c) and presets (Voyager 1, Parker
  Solar Probe's record, 0.1c … 0.9999c). The course intercepts where the destination *will* be. The planner
  predicts Δt, Δτ and the contracted length and previews the worldline. The flight recorder shows both clocks and
  the distance left in both frames.
- **1 g rocket.** A realistic flip-and-burn at constant proper acceleration. To Proxima Centauri: 3.54 years
  aboard, 5.87 years on Earth, peak 0.95c.
- **Time.** Real time by default. The simulation rate runs from 10⁰ to 10¹⁶ (320 million years a second), plus
  pause. Above 1 an annunciator lights and the viewport is framed. Click the date to go to any instant from
  10,000 BCE to 9999 CE, with presets for the next oppositions of Mars, Jupiter and Saturn. The clock is cosmic time
  at home: the universe's age, how far space has stretched and the temperature of the background radiation follow
  from it (`src/sim/cosmicTime.ts`), so running it billions of years ahead expands the universe, with or without a
  flight.
- **Light pulses.** Emit a pulse from any body. Its wavefront is drawn in the ecliptic and on the sky, and every
  body's detector records the exact crossing time, solved from the ephemeris.
- **Light delay.** The age of Earth's image and the signal time to Earth, plus an optional mode that draws every
  body at its light-delayed (retarded) position.
- **Relativistic optics.** Aberration, Doppler shift and beaming, with a split screen that compares the classical
  and relativistic views.
- **Superluminal drive (fiction).** Faster-than-light travel, marked non-physical throughout. The relativistic
  optics are switched off, τ is flagged undefined, and a physics section explains why it would break causality.
- **Readouts.** Observer kinematics (v, β, γ, rapidity, dτ/dt); a pair of chronometers (coordinate time t and
  proper time τ, with their difference kept to sub-nanosecond precision); a data sheet for the selected body;
  relativistic-optics readouts; light-time; a live spacetime diagram of the current trip; an ephemeris table; a
  strip-chart recorder; and in the view a reticle whose spectrometer reads θ′ and D, APEX and ANTAPEX markers, a
  scale bar, an ecliptic axis triad, annunciator lamps and an event log.

## How it works

**Floating origin.** All simulation state lives in float64 (plain JS numbers) in a heliocentric frame aligned with
the J2000 ecliptic. Each frame, every object's render position is `world − camera`, subtracted in float64 before
anything reaches the GPU. Near objects therefore get sub-metre precision, and far objects only lose precision far
below a pixel. Orbit lines use an anomaly offset from the body (`r(E₀+ΔE) − r(E₀)`, written with half-angle
identities) so they pass exactly through each planet at any zoom. The asteroids and comets solve Kepler's equation
per point in the vertex shader (two-body orbits about the Sun, or the barycentre beyond 7 au; good to a few degrees
over a decade against JPL Horizons), at most 200,000 a frame, the brightest from the camera and any passing close
(docs/data/asteroids.md).

**Relativistic rendering** (`src/render/LightspeedScenePass.ts`) replaces the usual scene render before bloom and
tone mapping:

1. Everything except point sources is rendered into an HDR cube map from the ship's position. Alpha records
   surface coverage.
2. Stars, planet glints and belt objects are drawn directly in the ship frame. Each gets its exact aberrated
   direction and its Doppler-shifted blackbody temperature T′ = D·T, from a Planck/CIE lookup, with the matching
   change in visible brightness.
3. A full-screen pass takes each pixel's ship-frame direction θ′, finds the rest-frame direction with
   `tan(θ/2) = k tan(θ′/2)`, where `k = √((1+β)/(1−β))`, and samples the cube map. That is the same law as
   `cos θ = (cos θ′ − β)/(1 − β cos θ′)`, but stable in float32 up to 0.99999c. The sample uses a mip level set by
   the aberration Jacobian, and the result is recoloured for Doppler shift and beaming.
4. Bloom and AgX tone mapping are applied last, in the observer's frame, with automatic exposure.

**Black holes** (`src/physics/schwarzschild.ts`, `src/render/lens/`, `docs/data/blackholes.md`). A ray near a
Schwarzschild black hole stays in a plane through it, so the whole lens is one function: the azimuth a backward ray
sweeps against its angle from the hole, for the camera's distance and frame. Whenever that distance changes, the CPU
tabulates it in float64 (512 nodes, from Carlson's elliptic integral R_F, in about 0.3 ms and without allocating),
with an inverse table for the images of orders 0 to 3; the GPU reads both with `texelFetch` and its own accurate
arctangent (Chrome's built-in one is too coarse here). Diffuse light is lensed per pixel in a box round the hole: the
Galaxy layer's targets (and, for sources off the screen, a sky cube built on the way in) resampled at each ray's
source, with the photon ring's band in a pass of its own with several rays a pixel. Point sources are lensed per
vertex in `LENS` variants of their shaders, compiled in the background and used only while a lens is drawn, so far
from every black hole every shader runs its old program. Bodies near the hole are solved exactly on the CPU, so labels,
picking and the hover tag sit on the drawn images. A GPU-time controller steps the lens's quality rungs, and then the
pixel ratio, when frames take over 8.5 ms.

**Places, saving and links** (`src/state/place.ts`, `src/ui/places.ts`, `src/ui/resume.ts`,
`src/ui/savedPlaces.ts`). A place is the view as data: the body the camera orbits, the unit vector from it to the
camera (world axes) and the distance from its centre (over a black hole, the height above the horizon instead), the
date or "now", the pace of time, whether the clock is paused, and the body selected. It is captured exactly: in orbit
from the orbit's own offset (world − world is 10⁵ km coarse at 40 Mpc), about a black hole from the hole-relative
place and the exact height; Roam and the ship are kept as an orbit pose about the nearest body, a slew as its end, and
a trip as its destination at its framing distance. It is written as a query, the same in the browser and in a link:

```
?at=betelgeuse&r=4.50923e9&dir=0.333333,0.666667,0.666667&t=2031-03-03T12:00:00Z&w=1000&p=1&sel=betelgeuse
```

`at` is the body's id; `r` the distance in km to 6 significant figures, or `h` a black hole's height above the
horizon in km to 12 (so a hover at the floor, r_s·10⁻⁶ up, comes back on the floor); `dir` the direction to 6
decimals; `t` the date in ISO 8601 UTC (ms since 1970 beyond the years 0 to 9999), absent for "now"; `w` the pace,
absent for real time; `p=1` when paused; `sel` the selected body. Absent `r` and `dir` frame the body as Go there
does. Each malformed or out-of-range value is dropped and its default used; an id the app does not know (renamed since)
leaves the view where it is, with a short note. Opening a link goes straight there (no welcome screen, which is not
marked as seen, and no offer to resume), then takes the place's keys out of the address; the `#/…` reading-page
routes are kept. A body still loading is waited for (a minute at most, at once given up if its data failed), one
registered on demand (a catalogue star, an asteroid, an NGC object, an archive planet) is registered as Where to? does,
and near a black hole the lens's programs are waited for. What is stored, all in localStorage under `lightspeed.`
(Reset layout and preferences clears it): `lightspeed.place`, the place last seen, saved at most every 2 s while it
changes and when the page is hidden (not before the first frame, during a slew, or while the last place is on offer),
and offered again on the next visit when it is not the opening view; `lightspeed.places`, the saved places, newest
first, at most 50.

## Physics notes

- Constants and body data live in `src/physics/constants.ts`, each with its source. All physics is pure,
  unit-tested TypeScript in `src/physics/`: Lorentz factor, time dilation, aberration, Doppler, beaming,
  light-time solvers, Kepler and universal-variable propagation, the relativistic rocket, blackbody colour and
  the Doppler colour matrices. `src/physics/cosmology/` is the expanding universe (flat ΛCDM, Planck 2018, with the
  massive neutrino integrated exactly): ages and distances, horizons, the rocket's equations of motion in expanding
  space, what a traveller sees, and what has happened at home by the time they arrive; `docs/data/cosmology.md`
  writes it up, with its checks against an independent implementation and astropy. `schwarzschild.ts`,
  `schwarzschildTables.ts`, `lensPoint.ts` and `geodesics.ts` are the black holes' general relativity (the paths and
  images of light, the shadow, clocks, hovering, orbits and falls), checked against an independent reference in 30–50
  digit arithmetic (`scripts/schwarzschild/`, mpmath) through committed fixtures, and the lens on the GPU against the
  same reference pixel by pixel (`scripts/lens-check/`; `docs/data/blackholes.md`).
- **Beaming:** radiance (surface brightness) scales as D⁴. A point source's flux, seen by a *moving observer*,
  scales as D², because aberration also compresses its solid angle. The tests check this against the textbook
  energy-density boost γ²(1+β²/3) of an isotropic radiation field. The rendered brightness is visible-band: the
  shifted Planck curve seen through the CIE observer.
- **Approximations** (also noted in the app):
  - Planets and other rendered surfaces use an approximate spectral model for Doppler colour: sunlight times a
    smooth reflectance. Stars are exact blackbodies.
  - Constant-speed trips boost and stop instantly.
  - Stars move in straight lines (the Galaxy's pull is left out: good for about a million years); the dust between the
    camera and a star is drawn only within 1.25 kpc of the Sun (the 3D map: docs/data/dust.md), so beyond it distant
    stars look slightly too bright when approached; sizes of stars without a measured
    radius are estimated from their brightness and colour; most double stars are one point.
  - Planets are lit without 1/r² dimming, as if your eyes adapt.
  - Spacetime is curved only near one black hole at a time: near the black hole whose lens matters most, light is
    bent exactly (Schwarzschild) and clocks slow; everywhere else, and for every other black hole at the same moment,
    gravity bends neither light nor flights (apart from the expansion of the universe and the S-stars' precession),
    and no other gravitational time dilation is applied. Only the black hole's own gravity is included.
  - Trips ignore gravity, so the planner will not leave from within 30 horizon radii of a black hole. Beyond the Local
    Group they follow the expanding universe, with a perfect engine and a destination that moves with the expansion.
  - Every black hole is drawn without spin (none is measured well enough to draw; at the angle we see Sgr A* from, a
    spin of 0.9–0.94 would make its shadow about 5–7 % smaller and shift it by about half its horizon's radius). The gas
    falling into Sgr A* is a fitted model, its visible light uncertain by about three times and steady where the real
    flow flickers; the stars round it are a statistical model of the nuclear star cluster; M87's own light is a smooth
    model of its profile. The cards and `docs/data/blackholes.md` §3 list every such label.
  - The Milky Way seen from outside is a model built from published measurements, its spiral arms extrapolated beyond
    the parallax data; other galaxies' shapes are modelled from their measured size and orientation, with the near
    side of a disc assumed where it is not known; the cosmic web is a survey with an uneven footprint; the CMB map is
    contrast enhanced. The cards say so.
- **Voyager 1** follows its JPL Horizons trajectory from launch to 2099 (a Chebyshev fit, within 25 km), then a
  two-body hyperbola around the Solar System's total mass. Around 18 November 2026 it becomes one light-day from
  Earth.

## Data and credits

| What | Source | Licence |
| --- | --- | --- |
| Planet, Moon, Pluto positions and rotation | [Astronomy Engine](https://github.com/cosinekitty/astronomy) (Don Cross) | MIT |
| Physical data | [NASA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) | US Government work |
| Voyager 1 state vectors | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | NASA/JPL-Caltech |
| Moon orbit models (`public/data/moons.json`) | Fitted to [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) satellite ephemerides (MAR099, JUP365, SAT441, URA182/URA184, NEP097/NEP105, PLU060) and the [JPL satellite mean elements](https://ssd.jpl.nasa.gov/sats/elem/) | NASA/JPL-Caltech |
| Trajectories of dwarf planets, comets, interstellar objects and spacecraft (`public/data/tracks.bin`, `tracks.json`) | Fitted to [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (spacecraft ephemerides from NASA/JPL, NASA/JHUAPL/SwRI and NASA/GSFC) | NASA/JPL-Caltech |
| Satellites' orbital elements (fetched at run time, not shipped) | [CelesTrak](https://celestrak.org/) GP data of the US Space Force's catalogue; SGP4 after Vallado et al. 2006 (python-sgp4, MIT) | Not redistributed; CelesTrak's usage policy |
| Physical data, rotation models, facts and rings (`public/data/bodies.json`, `rings.json`) | JPL Solar System Dynamics and Small-Body Database; IAU WGCCRE 2015 rotation models (Archinal et al. 2018) via NAIF `pck00011.tpc`; PDS Small Bodies Node and Rings Node; NASA and ESA mission pages; the papers cited in each file | US Government works and published values |
| Moon, Ceres and Vesta maps (`public/textures/{io,europa,ganymede,callisto,enceladus,tethys,dione,rhea,iapetus,titan,triton,charon,ceres,vesta,phobos,mimas,deimos}.jpg`) | Global mosaics from [USGS Astrogeology](https://astrogeology.usgs.gov/) (Voyager, Galileo, Cassini, New Horizons, Dawn and Viking data: NASA/JPL-Caltech, SSI, DLR, JHUAPL/SwRI, UCLA/MPS/IDA, LPI; Mimas by T. Roatsch, DLR; Triton by P. Schenk; Phobos and Deimos by P. Stooke) | Public domain / no use constraints |
| Uranian moon maps (`public/textures/{miranda,ariel,umbriel,titania,oberon}.jpg`) | Voyager 2 maps from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) | NASA, free and without copyright |
| Shape models (`public/models/{phobos,deimos,hyperion,proteus,halley,arrokoth,vesta}.bin`) | Gaskell (Phobos), Thomas (Deimos, Hyperion) and Stooke (Proteus, Halley) models from the PDS Small Bodies Node; Porter et al. 2024 (Arrokoth); DLR Dawn terrain model (Vesta, via USGS Astrogeology) | NASA PDS, public; Vesta public domain |
| Ellipsoids of Nix, Hydra and Haumea (`public/models/{nix,hydra,haumea}.bin`) | Generated from the triaxial sizes of Weaver et al. 2016 and Ortiz et al. 2017 | Generated; MIT with the source code |
| Comet 67P shape (`public/models/churyumov-gerasimenko.bin`) | SHAP5 model by R. Gaskell, L. Jorda et al. (ESA/Rosetta/MPS for OSIRIS Team) | **[CC BY-SA 3.0 IGO](https://creativecommons.org/licenses/by-sa/3.0/igo/)**; this derived file is CC BY-SA 3.0 IGO too |
| Asteroids and comets (`public/data/asteroids/`) | [JPL Small-Body Database](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html), checked against [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | NASA/JPL-Caltech |
| Stars (`public/data/stars3d.bin.gz`, `stars3d-bright.bin.gz`, `stars3d-extra.bin.gz`, `stars3d-head.bin.gz`, `stars3d-index.bin.gz`, `stars3d/`, `star-names.json.gz`) | [AT-HYG v4.0](https://codeberg.org/astronexus/athyg) (David Nash) with [Gaia DR3](https://www.cosmos.esa.int/gaia) distances and radial velocities (ESA/Gaia/DPAC), the Gaia Catalogue of Nearby Stars (Gaia Collaboration, Smart et al. 2021), the 10 parsec sample (Reylé et al. 2021), the luminous hot stars of Zari et al. (2021) and the open-cluster members of Hunt & Reffert (2023) via VizieR (CDS), Hipparcos photometry and parallaxes (ESA 1997; van Leeuwen 2007), [HYG v4.4](https://codeberg.org/astronexus/hyg) variable-star names and the [IAU star names](https://www.iau.org/public/themes/naming_stars/) | **Non-commercial use only**: AT-HYG is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), the Gaia-derived values [CC BY-NC 3.0 IGO](https://www.cosmos.esa.int/web/gaia-users/license); both apply (see `CREDITS.md`) |
| Constellation figures (`public/data/constellations.json`) | [d3-celestial](https://github.com/ofrohn/d3-celestial) (Olaf Frohn), after the IAU / Sky & Telescope charts | [BSD 3-Clause](https://github.com/ofrohn/d3-celestial/blob/master/LICENSE) |
| Star systems and named stars (`src/sim/stars/systems.json`) | Orbits and stellar parameters from the papers cited in the file (Akeson et al. 2021, Kervella et al. 2017, Bond et al. 2015 and 2017, Shakht et al. 2017, Torres et al. 2015 and others) and Gaia DR3 | Published values, each with its reference |
| Exoplanets (`public/data/exoplanets.json.gz`) | [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/), Planetary Systems Composite Parameters (doi:[10.26133/NEA13](https://doi.org/10.26133/NEA13); Christiansen et al. 2025), retrieved 25 September 2026: "This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program." Host positions at J2000 from Gaia DR3 (ESA/Gaia/DPAC) and the Hipparcos new reduction | NASA/Caltech-IPAC data, freely available with that acknowledgement; **non-commercial use only** because of the Gaia-derived positions ([CC BY-NC 3.0 IGO](https://www.cosmos.esa.int/web/gaia-users/license)) |
| Eleven featured planetary systems (`public/data/exoplanets-featured.json.gz`) | Orbital solutions from the papers cited in the file (Agol et al. 2021, Suárez Mascareño et al. 2025, Basant et al. 2025, Cont et al. 2026, Wang et al. 2018, Cabrera et al. 2014, Shaw et al. 2025, Pass et al. 2026, Doyle et al. 2011, Thompson et al. 2025, Feng et al. 2017, Beichman et al. 2025 and others), plus NASA Exoplanet Archive values; sizes from masses by Chen & Kipping (2017) | Published values, each with its reference; host positions from Gaia DR3 (non-commercial, with credit) |
| Planet, Sun and ring textures | [Solar System Scope](https://www.solarsystemscope.com/textures/) (INOVE) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Pluto map | [NASA/JHUAPL/SwRI](https://www.nasa.gov/image-article/pluto-global-color-map/) (New Horizons) | NASA media, public domain |
| Proxima Centauri (before the star catalogue loads) | Gaia DR3 (distance), Boyajian et al. 2012 (radius), Ségransan et al. 2003 (temperature) | — |
| Star sizes estimated from brightness | Bolometric corrections of Flower (1996) as corrected by Torres (2010); M_V of the Sun from Willmer (2018) | — |
| Colour science | CIE 1931 fit by Wyman, Sloan & Shirley (2013); B−V→T by Ballesteros (2012) | — |
| Milky Way background (`public/textures/milkyway-bg.jpg`, `milkyway-bg-2k.jpg`, `milkyway-bg.json`) | [NASA/Goddard Space Flight Center Scientific Visualization Studio](https://svs.gsfc.nasa.gov/4851), Deep Star Maps 2020 (Gaia DR2: ESA/Gaia/DPAC) | Public domain (NASA SVS), with that credit |
| Light of the faint stars (`public/textures/faint-stars.png`) | Built from the star files above: the catalogue's stars too faint to draw one by one (V 6.5 to about 10), seen from the Sun, in the Milky Way background's projection. Derived from [AT-HYG v4.0](https://codeberg.org/astronexus/athyg) (David Nash) and [Gaia DR3](https://www.cosmos.esa.int/gaia) (ESA/Gaia/DPAC) | **Non-commercial use only**, as the star files: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and [CC BY-NC 3.0 IGO](https://www.cosmos.esa.int/web/gaia-users/license), with both credits |
| Milky Way model (`public/data/galaxy-particles.bin.gz`, `src/sim/galaxy/model.json`) | Generated from published parameters (GRAVITY Collaboration 2022, Bland-Hawthorn & Gerhard 2016, Reid et al. 2019 and others; see `CREDITS.md`) | Part of this project (MIT) |
| Sagittarius A* and the S-stars (`src/sim/galaxy/sstars.json`) | [GRAVITY Collaboration 2022](https://doi.org/10.1051/0004-6361/202142465) (mass, distance, orbits of S2, S29, S38, S55); Reid & Brunthaler 2004 (position) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Black holes and their companion stars (`src/sim/blackholes/blackholes.json`) | Masses, distances, orbits and companions from the papers cited in the file (GRAVITY Collaboration 2022, EHT Collaboration 2019 and 2022, El-Badry et al. 2023, Nagarajan et al. 2024, Gaia Collaboration 2024, Miller-Jones et al. 2021, Sahu et al. 2025 and others); positions and proper motions of five systems from Gaia DR3 (ESA/Gaia/DPAC), via SIMBAD | Published values, each with its reference; **non-commercial use only** because of the Gaia DR3 astrometry ([CC BY-NC 3.0 IGO](https://www.cosmos.esa.int/web/gaia-users/license)), with the Gaia credit |
| Sgr A*'s accretion flow (`src/sim/blackholes/sgraFlow.json`, `scripts/sgra-flow/ref/`) | A model of the Broderick & Loeb (2006) type fitted for Skyfold to published fluxes (EHT Collaboration 2022, Bower et al. 2019, GRAVITY Collaboration 2020, Paugnat et al. 2024), traced by `scripts/sgra-flow/` | Part of this project (MIT); the measured fluxes are quoted with citation |
| The stars round Sgr A* (`public/data/nsc-stars.bin.gz`, `src/sim/galaxy/nuclearGlow.json`) | A statistical model generated by `scripts/build-nsc.py` from published fits (Schödel et al. 2014, 2018, 2020, Gallego-Cano et al. 2018, Launhardt et al. 2002, Paumard et al. 2006, Lu et al. 2013 and others) with MIST v1.2 isochrones (Choi et al. 2016, Dotter 2016; not redistributed); M87's light profile from Ferrarese et al. 2006 and Kormendy et al. 2009 | Part of this project (MIT); the fits are quoted with citation |
| Black-hole physics fixtures (`src/physics/__fixtures__/schwarzschild.json`, `scripts/lens-check/ref/`) | Computed by the project's own reference in 30–50 digit arithmetic (`scripts/schwarzschild/`, with mpmath) | Part of this project (MIT) |
| The Sun's neighbourhood in 3D dust (`public/data/dust/`) | Resampled from the 3D dust map of [Edenhofer et al. 2024](https://doi.org/10.1051/0004-6361/202347628) (A&A 685, A82; [Zenodo 10658339](https://doi.org/10.5281/zenodo.10658339)); named clouds' places from Zucker et al. 2020 and 2021; the Radcliffe Wave from Alves et al. 2020 and Konietzka et al. 2024 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); facts quoted with citation |
| Nebula positions and distances (`src/sim/galaxy/nebulae.json`) | SIMBAD (CDS); Hunt & Reffert 2024, Bailer-Jones et al. 2021 and the papers named in each entry | Facts quoted with citation |
| Star clusters (`public/data/clusters.json.gz`) | Open clusters: [Hunt & Reffert 2023, 2024](https://doi.org/10.1051/0004-6361/202348662) (Gaia DR3). Globular clusters: Vasiliev & Baumgardt 2021, Baumgardt & Vasiliev 2021, and the [Harris catalogue](https://physics.mcmaster.ca/~harris/mwgc.dat) (2010 edition) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the Harris catalogue free of charge, with a reference to its website |
| Nebula images (`public/images/nebulae/*.jpg`, 45) | ESA/Hubble, ESA/Webb, ESO and NSF NOIRLab; each image's credit line is in `CREDITS.md`. Modified: resized, black level subtracted, edges faded (three cropped) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Galaxies of the cosmic web (`public/data/cosmic-web.bin.gz`) | [Cosmicflows-4](https://doi.org/10.3847/1538-4357/ac94d8) (Tully et al. 2023) via CDS/VizieR, with the [2MASS Extended Source Catalog](https://irsa.ipac.caltech.edu/Missions/2mass.html) (UMass/IPAC-Caltech, NASA, NSF) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with the 2MASS acknowledgement |
| Nearby galaxies (`public/data/local-galaxies.json.gz`) | [Local Volume Database](https://github.com/apace7/local_volume_database) v1.1.1 (Pace 2025), with the papers cited per row | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); added values quoted with citation |
| Cosmic microwave background (`public/textures/cmb.png`, `cmb-data.png`) | [WMAP 9-year ILC map](https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_get.html), NASA / WMAP Science Team | NASA data, public domain |
| Named galaxies, clusters and young galaxies (`src/sim/cosmos/named.json`) | SIMBAD (CDS) positions; distances, redshifts, disc angles and sizes from the papers cited in each entry and RC3 | Facts quoted with citation |
| Cosmology and the home clock (`src/physics/cosmology/`, `future.json`) | Planck 2018 parameters (Planck Collaboration 2020) and the CMB temperature of Fixsen (2009); the future of the Sun, the Milky Way, Andromeda and the universe from Schröder & Connon Smith (2008), van der Marel et al. (2012), [Sawala et al. (2025)](https://doi.org/10.1038/s41550-025-02563-1) (survival curve read from their figure 3), Cautun et al. (2019), Loeb (2002), Krauss & Scherrer (2007), Adams & Laughlin (1997) and the others cited in the file | Facts quoted with citation; the Sawala et al. figure is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| The supernovae, the kilonova, the jets and the aurora (`src/sim/phenomena/`) | Light curves, speeds and sizes from the papers cited in the code and `docs/data/phenomena.md`; the IGRF-14 dipole (IAGA, via NOAA NCEI); Starkov's auroral oval (Starkov 1994, via Sigernes et al. 2011) | Facts quoted with citation; IGRF free to use; the code MIT |
| The Milky Way's magnetic field (`src/sim/galaxy/magneticField.ts`, `public/textures/field-sky-wmap.png`) | The UF23 "base" model of [Unger & Farrar 2024](https://doi.org/10.3847/1538-4357/ad4a54); WMAP nine-year K-band polarisation, NASA / WMAP Science Team | Numbers quoted with citation; NASA data, public domain; the derived texture CC BY 4.0 |
| The Sun's field harmonics and the planets' field models (`public/data/fields/sun-hmi-pfss.bin`, `src/sim/fields/`) | Computed from SDO/HMI synoptic maps (NASA/SDO and the HMI science team); IGRF-14 (IAGA, NOAA NCEI); JRM33, Cassini 11+, AH5, O8 and the other papers in `docs/data/fields.md` | NASA data with credit; coefficients quoted with citation |
| Coronal mass ejections and the Kp index (`public/data/space-weather/`, `src/sim/spaceWeather/`) | NASA DONKI (CCMC; Moon to Mars Space Weather Analysis Office), acknowledged as CCMC asks; GFZ Potsdam's Kp index (Matzka et al. 2021); the drag-based model of Vršnak et al. 2013 and the other papers in `docs/data/space-weather.md` | US Government work, public; Kp [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); facts quoted with citation |
| Dark matter (`src/sim/galaxy/darkMatter.ts`, `src/sim/cosmos/bulletCluster.ts`, `public/images/dark-matter/bullet-xray.jpg`) | McMillan 2017 (mass model), Eilers et al. 2019 (rotation curve), Clowe et al. 2006 (the Bullet Cluster's galaxies, gas and lensing peaks); X-ray picture NASA/CXC/CfA/M. Markevitch et al. | Facts quoted with citation; the Chandra image without asserted copyright, with its credit; the code MIT |
| Typefaces | IBM Plex Sans (IBM), JetBrains Mono (JetBrains), Source Serif 4 (Adobe) | SIL OFL 1.1 |


Libraries: three.js, React Three Fiber and postprocessing (pmndrs), zustand, KaTeX, Tailwind CSS, Vite, Vitest.

### Regenerating the data files

```bash
# Stars (docs/data/stars.md): downloads its inputs into data-raw/ with --fetch, then builds the star files,
# the constellation figures, the naked-eye subset and the catalogue's extension (§12; its --fetch downloads about
# 0.7 GB of AT-HYG, GCNS, Zari, cluster and Gaia DR3 tables), then the faint stars' glow
node scripts/build-stars3d.mjs --fetch
node --max-old-space-size=10000 scripts/build-stars3d-ext.mjs --fetch
npm run data:stars
npm run data:faint-stars
# Asteroids and comets (docs/data/asteroids.md): downloads the JPL SBDB in chunks (about 450 MB) to the folder given,
# default data-raw/asteroids, then builds public/data/asteroids/
npm run data:asteroids -- <raw folder>
# Exoplanets (docs/data/exoplanets.md): from the NASA Exoplanet Archive table in data-raw/ (the download command is in
# the script's header; --fetch downloads the Gaia DR3 host astrometry once), then the eleven featured systems
node scripts/build-exoplanets.mjs --fetch
npm run data:exoplanets-featured
# Moons and tracks: fitted to JPL Horizons (responses cached in data-raw/; docs/data/moons.md, tracks.md)
node scripts/build-moons.mjs
node scripts/build-tracks.mjs
# Maps, shapes and body data (docs/data/assets.md): needs sharp and manifold-3d in a tools folder
LIGHTSPEED_TOOLS=<tools folder> node scripts/build-shapes.mjs
LIGHTSPEED_TOOLS=<tools folder> node scripts/build-textures.mjs
node scripts/build-bodies.mjs
# The Milky Way (docs/data/galaxy.md): particles, clusters, the sky from the Sun, the faint stars' light (from the
# star files) and the nebulae
node scripts/build-galaxy.mjs
node scripts/build-clusters.mjs
python scripts/build-milkyway-bg.py
node scripts/build-faint-stars.mjs
python scripts/build-nebulae.py
# The Sun's neighbourhood in 3D dust (docs/data/dust.md): --fetch downloads the map's mean (1.6 GB) into data-raw/dust/
# once; numpy, astropy and astropy-healpix; about 4 minutes
python scripts/build-dust.py --fetch
# Galaxies beyond the Milky Way, the cosmic web and the CMB map (docs/data/cosmos.md): raw inputs cached in data-raw/cosmos/
npm run data:cosmic-web
npm run data:local-galaxies
npm run data:cmb
# Cosmology (docs/data/cosmology.md): the home clock's literature values, and the reference values for the tests
node scripts/build-cosmology-future.mjs
python scripts/cosmology-fixtures.py
# Black holes (docs/data/blackholes.md): the records (from the table in the script), the stars round Sgr A*
# (downloads the MIST isochrones once into data-raw/nsc/; numpy), the accretion flow's tables and references (numpy,
# scipy; about 33 minutes), and the physics fixtures (mpmath; about 4 minutes)
node scripts/build-blackholes.mjs
npm run data:nsc
python scripts/sgra-flow/flow_tables.py
npm run data:blackhole-fixtures
# The Sun's magnetic field (docs/data/fields.md): HMI's synoptic maps downloaded into data-raw/hmi/ (the command is in
# the script's header), then the harmonics (numpy)
python scripts/build-sun-field.py
# Space weather (docs/data/space-weather.md): DONKI's CMEs, shocks and storms (60-day requests) and GFZ's Kp file
# downloaded into data-raw/space-weather/ when missing, then the CME table and the Kp index
node scripts/build-space-weather.mjs
# Checks on the GPU (a development server on port 5190): every shader compiled cold in a headless Chrome, and the
# standard views' frame times; the lens's pictures against the references are scripts/lens-check/lens-check.js, run
# in a tab (docs/data/blackholes.md §11)
npm run check:shaders
node scripts/lens-check/run-perf.mjs
```

How each data set was made, from the Solar System to the cosmic web, and how accurate it is, is written up in
`docs/data/`; how bodies are added to the app is in `docs/bodies.md`.

## Project layout

```
src/physics/   pure, unit-tested physics (constants, relativity, light time, Kepler, rocket, colour, black holes)
src/physics/cosmology/ the expanding universe: ages, distances, the rocket in expanding space, the home clock
src/sim/       simulation core: clock, chronometers, cosmic time, ephemeris, Voyager, trips, light pulses, light delay
src/sim/bodies/ the body registry: every body's record, position provider, rotation, and the per-frame pass
src/sim/solarSystem/ the moons, dwarf planets, comets, interstellar objects and spacecraft, from their data files
src/sim/stars/ the 3D star catalogue, star systems, star names and constellations (decoded in a worker)
src/sim/exoplanets/ planets of other stars: the archive's catalogue, eleven featured systems, Kepler orbits on the sky
src/sim/galaxy/ the Milky Way: its model, the sky from the Sun, star clusters, nebulae, Sgr A* and its stars, the
               nuclear star cluster
src/sim/dust/  the Sun's neighbourhood in 3D dust: the map's grids, its named clouds and the Radcliffe Wave
src/sim/blackholes/ the black holes' records and the accretion flow's model; src/sim/gravity.ts, fall.ts and
               lensBodies.ts: the hole's gravity each frame, falls, and bodies seen through the lens
src/sim/cosmos/ beyond it: the Local Group and named galaxies, their particle templates, the cosmic web, the CMB map
src/sim/phenomena/ the supernovae and their light curves, GW170817's chirp and kilonova, the jets' beaming, the aurora
src/sim/fields/ magnetic fields: spherical harmonics, the field-line tracer, the Sun's and the planets' models
src/lib/       number formatting (significant figures, SI grouping, units) and least-squares statistics
src/render/    shaders, materials, the relativistic scene pass, post-processing, adaptive quality; render/lens/ the
               black hole's lens and render/flow/ the accretion flow's map
src/scene/     React Three Fiber scene components (bodies, stars, constellations, asteroids, orbits, glints)
src/controls/  camera: orbit, Roam, the ship, smooth zoom-and-pan flights
src/ui/        interface: header and footer, body card, journeys, panels, instruments, plots, planner, recorder
src/ui/docs/   the guide and About pages, and their figures
src/content/   journeys, destinations, scenes, Learn articles, physics sections, author and version details
scripts/       data builders; the independent references (schwarzschild/, sgra-flow/) and the GPU checks (lens-check/)
docs/          how bodies are added (bodies.md); how each data set was made, from the moons to the cosmic web (data/)
```

## Citing

If you use Skyfold in teaching or written work:

> Liu, T. (2026). *Skyfold: A relativistic explorer of the real universe* (Version 0.3.0) [Computer software].
> https://skyfold-space.vercel.app

```bibtex
@software{liu_skyfold_2026,
  author  = {Liu, Tommy S.},
  title   = {Skyfold: A Relativistic Explorer of the Real Universe},
  year    = {2026},
  version = {0.3.0},
  url     = {https://skyfold-space.vercel.app}
}
```

The About page in the app gives the same citation with the address of the site it is served from.

## Licence

Code: [MIT](../LICENSE), © 2026 Tommy S. Liu. The star catalogue, maps, shape models and other data keep their own
licences, listed under Data and credits above and in [CREDITS.md](../CREDITS.md). In particular, the star and exoplanet files, the map of the
faint stars' light built from them and the black holes' file are for **non-commercial use only**, because of their Gaia
DR3 values (CC BY-NC 3.0 IGO; the star files are also CC BY-SA 4.0); the 67P shape model is CC BY-SA 3.0 IGO; the Solar System Scope
textures, the nebula images, the star clusters (the Harris catalogue apart), the S-stars' orbits, the Cosmicflows-4 galaxies and the figure read
from Sawala et al. (2025) are CC BY 4.0; the Local Volume Database is CC0; the Pluto map, the NASA SVS sky and the
WMAP map are NASA public domain.
