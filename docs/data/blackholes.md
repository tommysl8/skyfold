# Black holes

Eleven real black holes, each drawn as general relativity says a black hole that does not spin looks and behaves:
Sagittarius A* at the centre of the Milky Way, M87* at the centre of M87, and nine of 6.6 to 32.7 solar masses,
eight of them in binaries with their companion stars on the published orbits. Near the black hole whose lens is
largest where the camera is, light is bent exactly (every star, glow, body and galaxy in view), clocks slow and the
camera hovers in height above the horizon; scenes add orbits and moments seen at speed, and the camera can fall
through the horizons of Sgr A* and M87*. Round Sgr A* two labelled models fill in what cannot be seen from Earth: the
nuclear star cluster, and the gas falling into the hole, which "Radio eyes" shows at 1.3 mm as the Event Horizon
Telescope sees it. Cygnus X-1 has its thin accretion disc, a labelled model, with every image the lens makes of it.
The second table (§13) adds twenty-nine more: thirteen X-ray binaries of the Milky Way with dynamically measured
masses, LMC X-1 and LMC X-3 in the Large Magellanic Cloud and M33 X-7 in M33, each with its companion, four of them with
thin discs of a typical state, and the supermassive black holes at the centres of thirteen nearby galaxies: forty in all.

Sections 1 to 3 say what ships, how it is rebuilt and what is data rather than model; 4 is the physics and how it is
checked; 5 the black holes' data; 6 the nuclear star cluster; 7 the accretion flow; 8 the sources and licences; 9 the
known limitations; 10 how the app uses it all; 11 the measured cost and the checks on the GPU; 12 Cygnus X-1's thin
disc and the 1.3 mm "Radio eyes"; 13 the second table: the X-ray binaries of BlackCAT, the Magellanic Clouds and M33,
the galaxies' black holes, their discs and the tour.

## 1. Outputs

| Path | What it is | Size | Used |
| --- | --- | --- | --- |
| `src/sim/blackholes/blackholes.json` | The forty black holes, the 24 companion stars and the 24 binaries: masses, distances, astrometry, orbits, spins, notes, the EHT pictures' credits, the catalogue galaxies' places, every value with the key of its paper (§5, §13) | 224 kB, 42 kB gzipped | bundled |
| `src/sim/blackholes/sgraFlow.json` | Sgr A*'s accretion flow: the model's parameters and emission constants, its axis, the fitted fluxes, the flux against viewing angle, the numbers the scene of the gas may quote (§7) | 7 kB | bundled |
| `public/data/nsc-stars.bin.gz` | 60,000 stars of the model of the nuclear star cluster and disc, brightest first as seen from Sgr A* (§6) | 876 kB | loaded within 3 kpc of Sgr A* |
| `src/sim/galaxy/nuclearGlow.json` | The cluster's and disc's laws, their point-share tables for 60,000, 30,000 and 10,000 points, M87's light profile, the build's checks (§6) | 23 kB | bundled |
| `src/physics/__fixtures__/schwarzschild.json` | The physics fixtures from the independent reference (§4) | 424 kB | tests |
| `src/physics/__fixtures__/thinDisk.json` | The thin disc's fixtures from its independent reference: 198 rays' crossings, the flux, the shift at known points (§12) | 121 kB | tests |
| `scripts/sgra-flow/ref/` | The flow's reference pictures: far away at 30° from its axis; hovering at 20, 6 and 2.02 M; a raindrop at 1 M, inside the horizon (§7) | 1.2 MB | tests |
| `scripts/lens-check/ref/` | Camera maps of the 8 fixture cameras at 30 digits and 16 reference pictures, for the checks on the GPU (§11) | 2.4 MB | development |
| `public/images/eht/sgra-2017.jpg`, `m87-2017.jpg` | The Event Horizon Telescope's pictures, named by the records: not in the tree (§8, §9); until they are, the two cards link to ESO's pages. A card shows a picture only once its file is listed in `EHT_SHIPPED` (`src/ui/viewport/EhtFigure.tsx`), which a test keeps equal to the folder | — | — |

The code, each module with a header saying what it does, how, why, what it costs and its twins:

| Where | What |
| --- | --- |
| `src/physics/schwarzschild.ts`, `schwarzschildTables.ts`, `lensPoint.ts`, `geodesics.ts` | The physics in float64 (§4): paths of light, the tables the GPU reads, point images, clocks, orbits and falls |
| `src/physics/lensMirror32.ts` | The lens shader's arithmetic in float32, line by line, with this GPU's own arctangent error, for the tests |
| `src/sim/gravity.ts`, `fall.ts`, `lensBodies.ts` | Each frame: which hole, the camera exactly relative to it and the clocks' rates; falls; the bodies' images and the holes' shadows on screen (§10) |
| `src/sim/blackholes/` | The records and their registration (§5); the accretion flow's point and constants (`accretion.ts`, §7) |
| `src/sim/galaxy/nuclearCluster.ts`, `glow.ts` | The nuclear cluster's field and glow, and M87's starlight (§6) |
| `src/sim/stars/lensCandidates.ts`, `visibility.ts` | The stars that can show extra images, and the draw lists near a hole |
| `src/render/lens/`, `src/render/shaders/lens*.glsl`, `dopplerColour.glsl`, `galaxyComposite.glsl` | The lens on the GPU: the tables' textures, zones and boxes, the per-pixel composite, the photon ring's band, the sky cube, the lensed spheres |
| `src/render/lensVariants.ts`, `lensRingMaterial.ts`, `gpuBudget.ts` | Lensed variants of the point layers; rings of light; the GPU-time controller |
| `src/render/flow/`, `src/render/shaders/flowMap.frag.glsl`, `flowLookup.glsl` | The flow's map, its exposure meter and its blur (§7) |
| `src/physics/thinDisk.ts`, `src/render/disk/`, `src/render/shaders/diskLookup.glsl` | Cygnus X-1's thin disc: its temperatures and shifts, the table of every orbit of light, where each ray crosses the disc, its exposure and turning (§12) |
| `src/scene/BlackHoleLens.tsx`, `AccretionFlow.tsx`, `AccretionDisk.tsx`, `NuclearCluster.tsx`, `LensRings.tsx` | Their scene components |
| `src/ui/flight/HoleStrip.tsx`, `src/ui/viewport/EhtFigure.tsx`, `FlowControls.tsx`, `DiskControls.tsx` | The panel near a hole; the EHT's picture and the flow's switches on Sgr A*'s card; the disc's line and switch on Cygnus X-1's |
| `src/dev/perf.ts`, `lensTest.ts` | Development only: `window.__ls.perf` (timing) and `window.__ls.lensTest` (the lens's own hooks) |
| `scripts/blackholes-more.mjs` | The second table: the X-ray binaries of BlackCAT, the Magellanic Clouds and M33, and the galaxies' black holes (§13) |
| `scripts/build-blackholes.mjs`, `build-nsc.py`, `schwarzschild/`, `sgra-flow/`, `thin-disk/`, `lens-check/`, `check-shaders.mjs` | The builders and the independent references |

## 2. Build commands

Every builder is deterministic: run again, it writes the same bytes.

```
node scripts/build-blackholes.mjs                  # blackholes.json from the table in the script (instant; no download)
npm run data:nsc                                   # python scripts/build-nsc.py: nsc-stars.bin.gz and nuclearGlow.json
                                                   #   (numpy; about a minute; downloads the MIST isochrones once, 160 MB,
                                                   #   into data-raw/nsc/)
python scripts/build-nsc.py --verify               # rebuild both in memory and compare with the files on disk
python scripts/sgra-flow/flow_tables.py            # sgraFlow.json and scripts/sgra-flow/ref/ (numpy, scipy; about 33
                                                   #   minutes on three processes; --quick two minutes; --angles-from-json)
python scripts/sgra-flow/fit_riaf.py riaf_results.json  # from scripts/sgra-flow/: re-image the three fitted models
npm run data:disk-fixtures                         # python scripts/thin-disk/disk_ref.py: thinDisk.json (mpmath, numpy,
                                                   #   scipy; about 90 s)
npm run data:blackhole-fixtures                    # python scripts/schwarzschild/make_fixtures.py --subset (mpmath;
                                                   #   about 4 minutes on four cores)
python scripts/schwarzschild/render_views.py --out DIR  # the eight fixture cameras' pictures
python scripts/lens-check/reference.py             # scripts/lens-check/ref/ (numpy, mpmath; 3-6 minutes)
```

The checks:

```
npx vitest run                                     # every unit test (the black holes' among them: §10)
npm run check:shaders                              # every material and lensed variant compiled cold in a headless
                                                   #   Chrome, and the start-up time (a development server on :5190)
node scripts/lens-check/lens-check.js --self-test  # the GPU checks' comparisons against the references and spoiled copies
node scripts/lens-check/run-perf.mjs [--visible]   # frame times of the standard views in a Chrome of its own
node scripts/lens-check/run-budgets.mjs            # each part's cost by whole-frame A/B
```

In a tab of the development server: `await import('/scripts/lens-check/lens-check.js'); await lensCheck.run('all');
lensCheck.report()` runs the checks of the lens on the GPU against the references (§11).

## 3. What is data and what is a model

- **Measured data**, with their uncertainties on the cards and data sheets: the black holes' masses and distances,
  the binaries' orbits and the companions' sizes and temperatures, positions and motions (§5); the sizes of the rings
  the Event Horizon Telescope imaged; the spectrum of Sgr A* the flow is fitted to (§7); the fits the nuclear cluster
  is drawn from (§6).
- **Exact physics**, not fitted: the Schwarzschild geometry, and everything that follows from it: the paths of light,
  the shadow, every image with its magnification and frequency shift, the clocks, hovering, circular orbits and falls
  (§4). Its idealisations are that nothing spins, that the hole is alone in space, and that only one hole bends light
  at a time.
- **Models**, labelled wherever they show: the accretion flow (§7); the nuclear cluster's stars and glow, and M87's
  starlight (§6); the orbital elements marked assumed; the companions drawn without dust; one donor's radius taken as
  its Roche lobe's, another's temperature estimated from its type (§5).

The labels, and where the app shows each (a black hole's card carries at most three one-line notes, under its
Sources, closed until asked for; the rest are on its data sheet, which the card's **What is modelled here**, always in
view, opens, beside the Guide's section):

| # | Label | Shown in the app |
| --- | --- | --- |
| 1 | **Drawn without spin** (Schwarzschild). No spin is measured well enough to draw (Sgr A*: estimates from under 0.1 to 0.9; M87*: not measured; Cygnus X-1: claimed above 0.998). Spin makes a shadow smaller by less than about 8 % (the Event Horizon Telescope's figure): at the angle we see Sgr A* from, about 25° from its axis, a spin of 0.9–0.94 would make its shadow about 5–7 % smaller and shift it by about 1 M (a = 0.9: 5.0 %, 0.87 M; a = 0.998: 6.8 %, 1.03 M); seen edge-on a fast spin makes a shadow up to about 12 % narrower and 2.4 M off-centre, one side flattened | every black hole's card; data sheet; Guide (What is a model; The lens); About (Model limitations); README |
| 2 | **Nothing inside the shadow.** A black hole formed by collapse has no white hole: rays traced back into it end on the collapsed matter, whose light has faded away | Sgr A*'s data sheet; Guide; About |
| 3 | **Where spacetime is curved.** Near the one black hole whose lens matters most, light is bent exactly (Schwarzschild) and clocks slow; everywhere else, and for every other hole at the same moment, gravity bends neither light nor flights (apart from the expansion of the universe and the S-stars' precession), and no other gravitational time dilation is applied | Guide; About (item 1); README (Physics notes) |
| 4 | **Diffuse light near the ring** is resampled from quarter-resolution pictures as if it came from very far away (the nuclear cluster's own glow partly does not) and, in flight, recoloured with an approximate spectral model; stars keep exact colours | every black hole's data sheet; Guide |
| 5 | **Guides** (constellation figures, planet-host and cluster rings, orbit lines) follow the primary image only; the ecliptic grid is not bent | Guide |
| 6 | **A star exactly behind a hole**: its own disc caps the brightening; the ring is drawn for the Sun, the S-stars and the companions, while catalogue stars show as two points | Guide |
| 7 | **Nebula pictures** bend only as their 9 × 9 grids allow and have no second image; **the cosmic web** is a map and follows its primary image (and its second near M87*); **galaxies** keep the look they have unlensed (a single splat or a template) while their light is bent | Guide |
| 8 | **The engine holds the ship**: near a hole its motion is measured against observers hovering there; falling, against observers falling from rest far away | the panel near a hole (its tooltip); instruments (section A); Guide; About |
| 9 | **Time near a hole**: the warp paces a clock hovering there; home's clock is one far from every mass; only the black hole's gravity is included (the Sun's and the Galaxy's, parts in 10⁸ and 10⁶, are left out), and only where it passes 5 parts in 10¹⁰ | the footer's rate (its tooltip); Guide; About |
| 10 | **The fall**: home's clock is shown on the free-fallers' clocks (Painlevé–Gullstrand), a convention; hovering observers would say you never cross; what you would see of home overhead is shown too. The first stretch plays in 20 s and the last 80 s in real time at Sgr A* (25 minutes aboard a second at M87*). It ends where tides pull a ship apart, 0.03 s before the centre, where general relativity predicts a singularity and stops working; stopping puts you back where you let go. Falls into stellar-mass holes are not offered (tides tear a ship apart 27–78 r_s out, from Gaia BH3 to A0620-00) | Sgr A*'s and M87*'s data sheets; the fall's scene note and end card; Guide |
| 11 | **The flight planner ignores gravity**: flights from within 30 r_s of a hole are refused ("Climb out first") | the planner's refusal; Guide; About |
| 12 | **The accretion flow is a model**: a hot, thin flow (a RIAF of the Broderick & Loeb 2006 type) fitted to Sgr A*'s radio-to-infrared spectrum, oriented like the flares GRAVITY saw (a model choice), drawn outside the horizon only. Its visible light has never been seen (30 magnitudes of dust) and is extrapolated from the infrared: uncertain by about ×3 (×8 fainter in a pessimistic model). It is smooth and steady; the real flow flickers by ×10 within hours. Scenes that show the lens switch it off | Sgr A*'s card; data sheet; the View menu's hint; the layer card; the lens scenes' notes; Guide; About |
| 13 | **The 1.3 mm view** is the model's brightness at the EHT's wavelength in false colour (blurred to the EHT's 20 µas as seen from Earth when asked), not the EHT's reconstruction, which the card shows | the figure's caption and the switches on Sgr A*'s card; Sgr A*'s data sheet; Guide |
| 14 | **The stars round Sgr A*** within a few parsecs are a statistical model of the nuclear star cluster and disc: their numbers, brightness and colours follow published fits, but none is a real individual star except S2, S29, S38 and S55; stars fainter than those drawn, and any within 0.01 pc of you, are a smooth glow | Sgr A*'s card; the Milky Way's data sheet; the layer card; Guide; About |
| 15 | **Assumed orbital elements**: Cygnus X-1's Ω from its jet; the orientation on the sky, sense and circular orbit of V404 Cygni, A0620-00, MAXI J1820+070 and XTE J1118+480; donor radii and temperatures marked estimated | each binary's card and data sheet |
| 16 | **Not drawn**: the quiet X-ray binaries' accretion discs (faint, cool, cut off far from the hole and not in a steady state between outbursts: no thin-disc model applies), Cygnus X-1's jet and wind, M87*'s jet, V404 Cygni's wide third star | each one's card (the discs) and data sheet; Guide |
| 17 | **M87's own starlight** is a smooth model of its light profile (and its model galaxy from outside), not stars | M87*'s card and data sheet; Guide |
| 18 | **No dust near the black holes**: the Sun seen past Sgr A* would really be dimmed by about 30 magnitudes | Sgr A*'s data sheet; the `sky-from` scene's note; Guide; About (the dust item) |
| 19 | **Positions**: Sgr A* held fixed; OGLE-2011-BLG-0462's position known to 0.1″ and its motion not followed | OGLE-2011-BLG-0462's card and data sheet |
| 20 | **One lens at a time**: only the black hole with the largest effect bends light; the others' effects are then far below a pixel | Guide; About |
| 21 | **Lensing off**: light drawn straight; the black hole and its resolved gas cannot be seen (the gas's point remains while unresolved) | the View menu's hint |
| 22 | **Contested masses**: Cygnus X-1 21.2 or 17.5 M☉; M87* 6.5 × 10⁹ (EHT) with stellar dynamics 5.4–8.7 × 10⁹; Gaia BH1 9.27 (9.62 in the discovery paper); Sgr A*'s mass 7.5 % lower in the Keck group's fit (Do et al. 2019) | each one's card (the mass line) and data sheet |
| 23 | **Hovering where tides would tear a ship apart** is allowed (the physics of hovering holds there); the panel says so in red | the panel near a hole; Guide |
| 24 | **The classical view near a moving hole** shows an observer at rest relative to the Sun, as the classical view does everywhere (hovering there differs by the hole's speed, at most 0.19 % of c: Gaia BH3, 570 km/s) | the split view's label; Guide |
| 25 | **Cygnus X-1's disc is a model**: a thin Novikov–Thorne disc at 2 % of its Eddington luminosity, from the innermost stable orbit of a hole that does not spin to 10¹¹ cm (a model choice), in the orbit's plane, each ring a blackbody, drawn with all its light (bolometric, on its own scale with its contrast raised, γ = 2, so the screen shows its falloff) or its visible light; turning 1,000 times slower than real; its swirls illustrative; its exposure metered on its peak (§12) | Cygnus X-1's card (the disc's line beside its switch, and a note under Sources); data sheet; the View menu's hint; the disc scenes' notes |
| 26 | **Radio eyes** is the flow model's 1.3 mm view (label 13) chosen from the View menu: "Radio light (1.3 mm), like the EHT"; the sky goes dark behind it (starlight does not show at 1.3 mm); Sgr A* only (§12) | the View menu; the radio scene's note |
| 27 | **The other discs are models of a typical state, not live**: LMC X-1, LMC X-3, M33 X-7 and GRS 1915+105 (whose drawn disc is its bright years', 1992–2018), as label 25, each at its paper's share of its Eddington luminosity or a choice inside its thin-disc range (§13) | each one's card (its disc line and the disc's switch); data sheet; the disc scenes' and the tour's notes |
| 28 | **Assumed phase** (GRS 1915+105: its ephemeris does not say which conjunction it marks): its companion is put nearest to us at J2000.0 and its place is illustrative | its card and data sheet |
| 29 | **Ranges drawn at a stated value**: GX 339−4's mass, tilt and distance at the middles of their ranges; XTE J1650−500's mass at the middle of its limits, with the tilt it needs; Nova Velorum 1993 for a normal donor | each one's card and data sheet |
| 30 | **The galaxies' black holes**: masses scaled from their papers' distances to the app's; no gas round them and none of their galaxy's starlight close by (the sky there is darker than it would be); no fall offered | each one's card and data sheet |

Labels 1, 2, 10, 12, 13, 14, 18 and 22 are also in the captions and text of the Learn article *Black holes*
(`src/content/learn/articles/black-holes.md`), where the lensing hint's **Read more** leads.

## 4. The physics

**The model.** Every hole is a Schwarzschild black hole: the exact geometry of a mass that does not spin, with no
charge, alone in space. Lengths are in units of M = GM/c² (6,345,058 km for Sgr A*, 64.16 au for M87*), times in GM/c³
(21.165 s for Sgr A*), and inside the physics modules G = c = M = 1. None of the real holes' spins is measured well
enough to draw, so none is drawn. Spin makes a shadow smaller by less than about 8 % (EHT 2022): at the angle we see
Sgr A* from (about 25° from its axis) a spin of 0.9–0.94 would make it about 5–7 % smaller and shift it by about 1 M; a
hole seen edge-on with a fast spin is up to about 12 % narrower across one axis, one side flattened, while the radius of
a circle of the same area shrinks by only about 5 % (the area itself by about 10 %; computed from Bardeen's critical
curve of a spinning hole).

**Light.** A ray near the hole stays in a plane through it, so what it does is one number: the azimuth Δφ it sweeps in
that plane. The app traces rays backwards from the camera, so the whole lens, for every pixel and every star, is Δφ
against the look angle α from the hole's direction, for the camera's r and frame:

- The camera's frame is the static observer's (hovering at fixed r), or, only in a fall below r = 3M (inside the horizon
  included), the raindrop's (falling from rest far away), whose view is regular through the horizon. In the static frame
  the impact parameter is b = r sin α/√(1 − 2/r); in the raindrop's, b = r sin α/(1 − v cos α), v = √(2/r).
- Rays whose backward extension ends in the hole draw black: the shadow (Synge 1966: sin α_sh = (b_c/r)√(1 − 2/r),
  b_c = 3√3 M, a hemisphere at r = 3M, the whole sky but a disc overhead at the horizon), or the raindrop's dark region
  (42.10° in radius at the horizon, 86° at 0.01 M: never more than a hemisphere).
- Δφ comes from closed forms: Carlson's symmetric elliptic integral R_F with arguments built from differences of the
  roots of the orbit equation, the roots from forms in d = b/b_c − 1 with no cancellation, d itself from the gap to the
  shadow's edge (so a ray 10⁻¹² of the span from the edge is still exact), and the shadow as
  atan2(b_c √(r − 2), (r − 3)√(r + 6)). Frequencies: light from far away is blueshifted by g = 1/√(1 − 2/r) at a hovering
  camera, and by 1/((1 − v) + 2v sin²(α/2)) at a falling one (½ straight up at the horizon, 3.875 at the dark region's
  edge).

`src/physics/schwarzschild.ts` (float64, exact to 10⁻¹⁴ rad of look angle), `schwarzschildTables.ts`, `lensPoint.ts` and
`geodesics.ts` hold it; the GPU reads the tables below with the same arithmetic in float32 (`render/shaders/lens.glsl`,
mirrored in `physics/lensMirror32.ts`).

**The tables, rebuilt whenever the camera's r changes.** A frame's whole lens is two small textures:

| Table | Holds | Read by | Accuracy (float64, measured) |
| --- | --- | --- | --- |
| Forward, 512 nodes (+2) | the deflection δ = Δφ − (π − α), uniform in s = ln g + 3g, g = α − α_edge, from g = 10⁻⁹ of the span π − α_edge (or 10⁻⁵ of α_edge for a camera beyond about 6 × 10⁴ M) to straight out | Catmull–Rom in s: every pixel of diffuse light | 2.4 × 10⁻⁴ device px of look angle (15 static radii from the hover floor to 10⁸ M, 8 raindrop radii from 3 M to 0.02 M; the budget is 0.004 px) |
| Inverse, 512 + 64 nodes (+2 each) | for a wanted sweep D, ln(α − α_edge) and m = −ln\|dΔφ/dα\|, over asinh((π − D)/2θ_E) for orders 0–1 and uniform in D ∈ [2π, 4π) for orders 2–3, derived from the forward spline alone | y by cubic Hermite with the nodes' own slopes (dy/dD = −e^(m − y)), m by Catmull–Rom: every star and point | 0.0029 px, m within 7 × 10⁻⁴ (budget 0.01 px, 0.002) |
| Magnification bound, 16 nodes | the largest order-0 magnification against the source's straight-line angle ψ from the axis, ψ from θ_E/64 to π | the stars' pre-cull | bounds the table's own μ at 10⁴ sources a node |

Both builds take 0.31–0.44 ms of processor time (the fastest of batches, measured while three other test suites ran on
the same laptop; the budget is 0.4 ms), the bound 5 µs, and allocate nothing (V8 boxes a double at each call it does
not inline, so the kernels pass numbers through typed arrays). They rebuild when the frame changes or ln r or
ln(r − 2M) moves by more than 10⁻⁷ (at the hover floor a 10⁻⁷ change of r is a 10 % change of the height).

**Point sources.** A star, a point of the cosmic web or a body's image is the backward ray that meets the source's
sphere; images of orders 0–3 (primary, secondary, and each further turn) are the solutions of Δφ = D_k with
D_k = γ, 2π − γ, 2π + γ, 4π − γ (γ the angle at the hole between camera and source).

- Tier 1 (every point shader; the CPU for bodies far from the hole) meets the source on the outgoing leg through the
  inverse table and the parallax Λ, the part of the sweep beyond the source: with 0, 1 or 3 fixed-point passes when the
  source is more than 20 times farther than the camera (the flat Λ = asin(b/r_s), exact to 10⁻⁶ rad there), and Newton
  steps otherwise, where Λ comes from the first-order orbit, rescaled so its slope at infinity is exact, which stays
  regular through the foot of the perpendicular from the hole to the line of sight (the flat Λ is 0.048 px off there
  at 10⁵ M and has no solution in a band just beyond it). Sources in front of the hole are drawn straight (within
  0.011 px, measured: the deflection between them and the camera). Against the 34-digit reference: 0.0023 px and
  7 × 10⁻⁴ in ln μ for sources ten or more times farther than the camera; 1.3 × 10⁻⁶ px next to the foot.
- Tier 2 (bodies near the hole, the orbit guides there) solves the lens equation exactly on all four branches (outward,
  through periapsis, and the two met on the way in, inside the shadow's outline included), with the emitter's own
  gravitational shift and the direction the light leaves the source: 4 × 10⁻¹⁶ rad and 10⁻⁸ in μ against the reference,
  about 10 µs an image.
- Magnification is |μ| = d² sin α/(r_s² |sin D_k| |cos ψ_s dD_s/dα|) (the image's solid angle over the one it would have
  with no hole), and brightness F = F_flat |μ| g⁴. Behind the hole (and, for orders 1 and 3, in front of the camera) the
  point magnification diverges; there a star's own disc caps it by Gould's (1994) finite-source factor B0(z),
  z = |D_k − nπ| r_s/R★, carried as ln(zμ) + ln(B0(z)/z) so it stays finite at exact alignment. R★ comes from the star's
  absolute magnitude and temperature, exact for a blackbody (the Sun: 1.000 R☉) and an estimate for a real star.

**Clocks and motion.** A clock hovering at r runs at α = √(1 − 2M/r) of a distant one (home's clock runs 1/α faster:
1.054 at 10 r_s, 100 at 10⁻⁴ r_s above the horizon, 1,000 at the hover floor 10⁻⁶ r_s above it); the chronometer's lag
rate is 1 − α/cosh φ, φ the ship's rapidity relative to home. Hovering takes GM/(r²α) (3,806 g at 10 r_s from Sgr A*);
moving at a steady speed past the hovering observers takes the proper acceleration of that motion (γ times the hover
thrust moving radially, nothing on a circular orbit, 72 times it moving sideways at 0.9c at 20 M). Circular orbits
exist down to 3M (stable from 6M, where they move at c/2 and a clock runs at √½; 32.6 minutes round Sgr A*). Tides
stretch a 2-m ship by 2GM·L/r³ (1.1 × 10⁻³ m/s² at Sgr A*'s horizon; 1,000 m/s² at 0.0104 r_s, where a fall ends).

**Falls.** A radial fall is Newton's radial Kepler problem in proper time: from rest far away (rain),
r^{3/2} = r₀^{3/2} − (3/√2)τ; let go from a hover (a drip) the cycloid r = R cos²(η/2), τ = √(R³/8M)(η + sin η).
Home's clock during a fall is the free-fallers' (Painlevé–Gullstrand) time T, which runs at the faller's Lorentz factor
against the local raindrop and is tabulated at the start of a fall at 2,000 samples of η (spaced evenly in
ln(1 + η/2e), which resolves both a drip from far out and one let go just above the horizon), with T − τ as its own
column. At Sgr A*: rain from 10 r_s reaches the horizon after 864.2 s and the centre 28.2 s later; a drip from 10 r_s takes
2,102.6 s, crosses at 2,073.5 s while home's free-faller clock reads 2,153.7 s at the centre; nobody spends more than
πM = 66.5 s inside.

**How it is checked.** An independent reference in `scripts/schwarzschild/` computes everything in 34–50 digits with
mpmath two ways (the closed forms; and a numerical integration of the geodesic equations that never uses them), which
agree to 10⁻¹⁷ or better. `npm run data:blackhole-fixtures` (`python scripts/schwarzschild/make_fixtures.py --subset`,
about four minutes on four cores; mpmath needed) writes `src/physics/__fixtures__/schwarzschild.json` (424 kB, the same
bytes on every run): Carlson's R_F, 30 deflections, 81 sweeps, 28 shadow radii, 12 static and 10 raindrop escape maps,
5 circular orbits, 40 lens configurations with all six images, 108 images next to the foot, 30 near the forward caustic,
an 8 × 8 lattice of each of 8 camera maps, and the falls' times and T(τ) along two drips. The unit tests
(`schwarzschild.test.ts`, `schwarzschildTables.test.ts`, `lensPoint.test.ts`, `geodesics.test.ts`) hold the float64 code
to it: R_F 10⁻¹⁵, deflections 10⁻¹⁴ rad, sweeps 2 × 10⁻¹², shadow radii 10⁻¹⁵ rad, escape maps 10⁻¹⁴ rad of look
angle, lens images 10⁻¹³ rad and 3 × 10⁻⁸ in μ, falls 10⁻¹² relative, and the photon count over a sphere of observers
(0.942718866 against the escaping fraction 0.942718872: the rest are images beyond the second turn).
`python scripts/schwarzschild/render_views.py --out DIR` draws the reference pictures of the eight cameras.

**Three refinements made while building it**, each measured against the simpler scheme it replaced: the forward table starts
closer to the edge for cameras beyond about 6 × 10⁴ M (so the table reaches Δφ = 4π and its m stays within 0.002); the
inverse table's y is read by cubic Hermite with the slopes it already stores (24 times more accurate than Catmull–Rom for
a raindrop at 0.02 M, where the sky crowds into one hemisphere); and tier 1's Newton regime uses the rescaled first-order
orbit for Λ from b = 30 M (above).

## 5. The holes' data

**File.** `src/sim/blackholes/blackholes.json` (66 kB, 14 kB gzipped; format `lightspeed.black-holes`, version 1;
types in `src/sim/blackholes/types.ts`), written by `node scripts/build-blackholes.mjs` from the table kept in that
script. The build reads nothing else and downloads nothing; it is deterministic, and prints its checks (kept in each
system's `checks`). Every value carries the key of its paper (`refs` holds the citations); an uncertainty is one
number, `[below, above]` where the paper gives them unequal, or `{ stat, sys }`.

**The black holes.**

| Id (name) | Placement | Mass (M☉) | Distance | Companion | Orbit (P, e, i, Ω, ω★, T_p) | Assumed |
| --- | --- | --- | --- | --- | --- | --- |
| `sgr-a-star` (Sagittarius A*) | `src/sim/galaxy/sstars.json`, as before | 4.297 × 10⁶ ± 0.012 ± 0.040 (GRAVITY 2022; the file repeats it, a test holds the two equal) | 8,277 ± 9 ± 30 pc | — | — | — |
| `m87-star` (M87*) | at the centre of `m87` | 6.5 × 10⁹ ± 0.2 ± 0.7 (EHT 2019 VI); 5.4–8.7 × 10⁹ from stellar dynamics (Liepold et al. 2023; Simon et al. 2024) in `massNote` | its galaxy's placed distance | — | — | — |
| `gaia-bh1` (Gaia BH1) | binary `gaia-bh1-system` | 9.27 ± 0.10 (Nagarajan et al. 2024; 9.62 ± 0.18 in El-Badry et al. 2023) | 480 ± 5 pc | `gaia-bh1-star`: G dwarf, 0.93 M☉, 0.99 R☉, 5,850 K, 1.06 L☉ | 185.387 d, 0.4323, 126.6°, 97.8°, 16.509°, JD 2457391.07 | nothing |
| `gaia-bh2` (Gaia BH2) | binary | 8.94 ± 0.34 (El-Badry et al. 2023b) | 1,160 ± 20 pc | `gaia-bh2-star`: red giant, 1.07 M☉, 7.77 R☉, 4,604 K, 24.6 L☉ | 1,276.7 d, 0.5176, 34.87°, 266.9°, 130.9°, JD 2457438.3 | nothing |
| `gaia-bh3` (Gaia BH3) | binary | 32.70 ± 0.82 (Gaia Collaboration 2024) | 590.6 ± 5.8 pc | `gaia-bh3-star`: metal-poor giant, 0.76 M☉, 4.936 R☉, 5,212 K, 16.1 L☉ | 4,253.1 d, 0.7291, 110.58°, 136.236°, 77.34°, JD 2458177.39 | nothing |
| `cyg-x-1` (Cygnus X-1) | binary; its star is catalogue star 111021 | 21.2 ± 2.2 (Miller-Jones et al. 2021; 17.5 +2 −1 in Ramachandran et al. 2025) | 2,220 +180 −170 pc | `hde-226868`: O9.7 Iab, 40.6 M☉, 22.3 R☉, 31,138 K, log L = 5.625 | 5.599829 d, 0.0189, 152.9°, 64.1°, 305°, JD 2441875.317 | Ω (from the jet) |
| `v404-cygni` (V404 Cygni) | binary | 9.0 +0.2 −0.6 (Khargharia et al. 2010) | 2,390 ± 140 pc | `v404-cygni-star`: K3 III, 0.54 M☉, 5.51 R☉ (its Roche lobe), 4,300 K | 6.471170 d, T0 = HJD 2457200.514, i = 67° | Ω, sense, e = 0 |
| `a0620-00` (A0620-00) | binary | 6.61 +0.23 −0.17 (González Hernández et al. 2014) | 1,060 ± 120 pc | `a0620-00-star`: K5 V, 0.40 M☉, 0.67 R☉, 4,600 K | 0.32301415 d, T0 = HJD 2446082.6671, i = 51.0° | Ω, sense, e = 0 |
| `maxi-j1820` (MAXI J1820+070) | binary | 8.48 +0.79 −0.72 (Torres et al. 2020) | 2,960 ± 330 pc | `maxi-j1820-star`: K3–5 subgiant, 0.49 M☉, 1.19 R☉, 4,350 K | 0.68549 d, T0 = HJD 2458540.043, i = 63° | Ω, sense, e = 0 |
| `xte-j1118` (XTE J1118+480) | binary | 7.46 +0.34 −0.69 (González Hernández et al. 2014) | 1,720 ± 100 pc | `xte-j1118-star`: K7–M1 V, 0.18 M☉, 0.34 R☉, about 4,000 K (estimated for its type) | 0.16993404 d, T0 = HJD 2451868.8921, i = 73.5° | Ω, sense, e = 0, T_eff |
| `ogle-2011-blg-0462` (OGLE-2011-BLG-0462) | alone, held fixed | 7.15 ± 0.83 (Sahu et al. 2025; 7.1 ± 1.3 in Sahu et al. 2022, 1.6–4.4 in Lam et al. 2022) | 1,520 ± 150 pc | none | — | position to 0.1″; its 51 km/s not followed |

Left out of the first table: GRO J1655-40, GRS 1915+105 and LMC X-1, now in the second (§13), and VFTS 243. Not black holes, and nowhere called one: HR 6819
(Frost et al. 2022; catalogue star 2446) and LB-1 (Shenar et al. 2020).

**The binaries.** Each is a barycentre in straight-line motion (heliocentric, J2000 ecliptic, pc and km/s) from its
astrometry at the adopted distance (the parallax field is 1000 / distance), carried to J2000 by the code path
`scripts/build-stars3d.mjs` uses for `src/sim/stars/systems.json`, and one orbit in that file's form: the star (group 2)
about the black hole (group 1), `pHat`/`qHat` from the Campbell elements by the Thiele–Innes constants at the
barycentre's direction (Ω is the position angle of the node where the **star recedes**, ω the **star's** argument of
periastron, i < 90° anticlockwise on the sky: the convention of Gaia's orbital solutions, of El-Badry et al., of the
S-star frame and of `systems.json`, checked once on Alpha Centauri AB). The semi-major axis is Kepler's
third law with the two masses drawn, so the drawn orbit and the drawn gravity agree. The app places both members with
the stars' own providers (`orbitStarProvider`), the published orbit evaluated a light-time on, as for every star system.

| System | Astrometry (epoch) | Systemic RV (km/s) | Adopted distance |
| --- | --- | --- | --- |
| Gaia BH1 | Gaia DR3 orbital solution (J2016.0): −7.70, −25.85 mas/yr | 48.379 (Nagarajan et al. 2024) | 480 pc (ϖ = 2.09 ± 0.02 mas) |
| Gaia BH2 | Gaia DR3 orbital solution (J2016.0): −10.48, −4.61 | −4.22 (El-Badry et al. 2023b) | 1,160 pc (ϖ = 0.859 mas) |
| Gaia BH3 | combined solution, barycentre (J2017.5): −28.317, −155.221 | −357.31 | 590.6 pc |
| Cygnus X-1 | VLBA radio core (MJD 56198): −3.804, −6.283 | −7.0 ± 0.5 (Gies et al. 2003, who note it is probably a little low) | 2,220 pc |
| V404 Cygni | VLBA (MJD 54322): −5.04, −7.64 | −2.0 ± 0.4 (Casares et al. 2019) | 2,390 pc |
| A0620-00 | Gaia DR3 via SIMBAD (J2000): −0.439, −5.138 | 8.5 ± 1.8 (González Hernández & Casares 2010) | 1,060 pc (light-curve model) |
| MAXI J1820+070 | Gaia DR3 via SIMBAD (J2000): −3.093, −6.286 | −21.6 ± 2.3 (Torres et al. 2019) | 2,960 pc (radio parallax) |
| XTE J1118+480 | Gaia DR3 via SIMBAD (J2000): −18.105, −6.687 | 2.7 ± 1.1 (González Hernández et al. 2008) | 1,720 pc |

**The X-ray binaries' phase.** Their ephemerides give T0, the donor's inferior conjunction (nearest to us; its radial
velocity crossing from approach to recession). With e = 0 and ω★ = 90° assumed, the donor is nearest at ν = 180°, so the
periastron time is **T_p = T0 − P/2**. Ω and the sense of revolution are unknown: the node is put due north and the orbit
turns anticlockwise (i < 90°), which the card says ("The orientation of its orbit on the sky is not known: one is
assumed, turning anticlockwise as we see it, and the orbit is taken as circular"; the card also says that the disc of hot
gas pulled off the companion is not drawn). `records.test.ts` checks that at T0 each donor's distance behind the hole is
−a sin i and its radial velocity goes from negative to positive. Cygnus X-1 has a measured orbit (Miller-Jones et al.
2021: e = 0.0189, ω★ = 305°, i = 152.9°; Ω taken from its jet): its periastron is derived as T0 + 0.094 P, the time that
puts the supergiant exactly in front of the hole (ω + ν = 270.0°) at Brocksopp et al.'s conjunction, 0.109 au nearer to us
than the hole (tested). Where the published period's uncertainty, carried over the light-time, adds up to a quarter of
an orbit or more (Gaia BH2, Gaia BH3, Cygnus X-1, A0620-00, MAXI J1820+070 and XTE J1118+480), the hole's position note
calls the present phase illustrative (`records.ts`; tested).

**Checks** (from the build; tested in `records.test.ts`):

| System | Kepler a (au) | Published | Other checks |
| --- | --- | --- | --- |
| Gaia BH1 | 1.3799 | 1.40 ± 0.01 (with the discovery paper's 9.62 M☉ and 185.59 d, which give 1.3965) | the star's orbit on the sky 2.613 mas against the photocentre's 2.67 ± 0.02 (2.661 with the discovery masses: the revised mass explains it); K 65.52 km/s against 65.3785 |
| Gaia BH2 | 4.9637 | 4.96 ± 0.08 | 3.822 mas against 3.719 ± 0.014: the known 2 % tension with Gaia's parallax (placed at the published 1,160 pc); K 25.24 against 25.23 |
| Gaia BH3 | 16.554 | a₁ = 16.17 ± 0.27 (the star's; 16.178 here) | 27.393 mas against 27.39 ± 0.49 |
| Cygnus X-1 | 0.24399 | 0.244 ± 0.012 | K 74.09 against 75.21 km/s |
| V404 Cygni | 0.14414 | — | K 210.4 against 208.4; the donor's Roche lobe 5.51 R☉ (Eggleton 1983) |
| A0620-00 | 0.01763 | 0.01763 ± 0.00019 (3.79 R☉) | K 435.2 against 435.4 |
| MAXI J1820+070 | 0.03161 | — | K 422.6 against 417.7 (Torres et al. 2020's mass assumed a 0.61 M☉ donor; 0.49 is drawn) |
| XTE J1118+480 | 0.01183 | 0.01181 ± 0.00028 (2.54 R☉) | K 708.8 against 708.8 |

The orbit vectors agree with those computed independently with numpy when the data were prepared (from the astrometric
epochs' directions) to 2 × 10⁻⁵, and with the Thiele–Innes constants recomputed in the test to 10⁻⁹.

**The companions' brightness.** Bodies are drawn without dust. Each companion shines with its paper's luminosity (or, where
none is given, 4πR²σT⁴ from its radius and temperature), turned into M_V with Flower's bolometric correction as the star
records do (M_V = 4.73 − 2.5 log L − BC_V(T)). HDE 226868 is catalogue star 111021, whose catalogue colour temperature
(5,540 K) comes from its dust-reddened colour: its record uses Miller-Jones et al.'s 31,138 K and log L = 5.625 instead,
and its catalogue point gives way to it. Its card says it is drawn unreddened: from Earth it is V 8.91, about 3.5
magnitudes fainter than drawn (E(B−V) ≈ 1). The other companions' cards give their observed V or G.

**The records** (`src/sim/blackholes/records.ts`). A hole's size is its horizon, r_s = 2GM/c² (no spin: Schwarzschild);
its renderer is `'lens'` (no mesh and no point of its own); its closest approach is r_s(1 + 10⁻⁶) (27 mm above Gaia BH1's
horizon), framing 10⁴ r_s for a stellar hole (2.7 × 10⁵ km at Gaia BH1) and 50 r_s for M87* (6,400 au); label rank 12
(13.2 for M87*); kind text "Stellar-mass black hole" or "Supermassive black hole"; no article of its own (the kind
decides). Its `blackHole` block carries the mass with its uncertainties and note, GM, r_s, the spin (none measured but
Cygnus X-1's claimed > 0.9985), whether a fall is offered (Sgr A*; M87* only once M87's own starlight is drawn round it,
switched by `M87_STARLIGHT` in the build script; never a stellar hole, whose tides tear a ship apart 27–78 r_s out), the companion, the assumed elements, the EHT's picture (Sgr A*, M87*), at most three card notes (the
record's `modelNotes`) and the rest for the data sheet (`sheetNotes`). The binaries and OGLE-2011-BLG-0462 are registered
at the end of the synchronous `registerStars`, M87* at the end of `registerCosmos`, their ids in a list of their own.
M87* is given M87's anchor in the expanding universe, so its light-time, redshift and drawn place are its galaxy's.

**Refreshing.** Gaia's fourth data release (due December 2026) will revise every Gaia BH orbit and probably add black
holes: edit the table in `scripts/build-blackholes.mjs`, run it, and run `npx vitest run src/sim/blackholes`.

## 6. The nuclear cluster model

**Files.** `public/data/nsc-stars.bin.gz` (876 kB; 60,000 stars) and `src/sim/galaxy/nuclearGlow.json` (21 kB; format
`lightspeed.nuclear-glow`, version 1), both written by `python scripts/build-nsc.py` (Python 3.10+ and numpy; about a
minute). The script downloads the MIST isochrones once (160 MB, from mist.science, into `data-raw/nsc/`, which git
ignores and nothing redistributes), is deterministic (numpy's PCG64 stream, seed 20260929, gzip with no timestamp), and
`--verify` rebuilds both files in memory and compares them with those on disk. The JSON holds the laws, the share
tables, M87's light profile, the SHA-256 of the unzipped star file and every check below.

**What it is.** A statistical model of the stars round Sagittarius A*, not a catalogue: no star in it is a real,
individual star (the four S-stars GRAVITY follows, S2, S29, S38 and S55, are bodies of their own and lie inside its
inner hole). It stands in, within 60 pc of the hole, for the Galaxy model's own nuclear cluster and disc, which are a
few hundred particles on a 2-pc lattice there.

| Component | Law (pc from Sgr A*, frame G: z to the north galactic pole) | Light (V) | Sources |
| --- | --- | --- | --- |
| Nuclear star cluster | Nuker law in m² = R² + (z/q)²: r_b 3.1, γ 1.13, β 3.5, α 10, q 0.71; from r = 0.04 to m = 50 | 1.318 × 10⁷ L☉ (the Galaxy model's cluster share, 1.812 × 10⁷, less the young stars') | Schödel et al. 2018 (mean model), Schödel et al. 2014 (flattening) |
| Nuclear stellar disc | the Galaxy model's own: (R/90)^−1.3 inside 90, (R/90)^−3 to 230, e^(−\|z\|/45), R ≥ 3, r ≤ 300 | 4.53 × 10⁸ L☉ (the model's share) | `model.json`; Launhardt et al. 2002; Sormani et al. 2022 |
| Young stars of the central half parsec | every star above 1 M☉ of 2.5 × 10⁴ M☉ drawn from dN/dm ∝ m^−1.7 (to 150 M☉), aged 3.2 or 3.5 Myr; 20 % in the clockwise disc (normal i 130°, Ω 96°, ±10°, surface density ∝ R^−1.9), the rest isotropic (∝ R^−1.14), 0.04–0.5 pc | 4.94 × 10⁶ L☉: 3,140 stars alive (671 in the disc), 30 of them Wolf–Rayet stars, the brightest M_V −7.24 | Lu et al. 2013, Yelda et al. 2014, Paumard et al. 2006 |

The stars' ages, brightness and colours come from MIST v1.2 isochrones (Choi et al. 2016; Dotter 2016; v/v_crit 0.4,
[Fe/H] +0.25 for the old stars after Feldmeier-Krause et al. 2017, 0.00 for the young) with a Kroupa (2001) mass function,
over the star-formation histories of Schödel et al. 2020 for the cluster (82 % 13 Gyr old, 13 % 3 Gyr, the rest
30 Myr–1 Gyr; M/L_V 3.76 per solar mass formed, B − V 0.56) and after Nogueras-Lara et al. 2020 for the disc (90 %
older than 8 Gyr, 5 % about 1 Gyr, the rest in the last 500 Myr; M/L_V 2.05, B − V 0.28). The two ages of the young
stars make MIST's Wolf–Rayet count match the thirty or so seen there (at 4 Myr MIST gives a dozen yellow supergiants the
Galactic Centre does not have).

**Points and glow.** A star at r from the hole looks as bright from it as m_hole = M_V + 5 log10(r / 10 pc). The file
holds every young star and every old star brighter than m_hole = −2.446, 60,000 in all (53,805 of the cluster, 3,055
of the disc), sampled exactly from each law times its luminosity function's count of stars bright enough at each
radius, sorted brightest first as seen from the hole. The nearest is 0.040 pc from the hole, the farthest 44.4 pc (no
disc star beyond that is bright enough from the hole); 72 are brighter than m_hole = −15, 763 than −10 and 8,241 than
−5. Everything else is a glow: each law times 1 − s(r), with s(r) the share of its light in the points, tabulated at 64
radii from 0.04 to 300 pc. The app draws the first 60,000, 30,000 or 10,000 points (the lens's quality rungs 0, 1 and
2), and each count has its own share table, so the light is the same at every rung:

| Points drawn | Split (m_hole) | Cluster: realised / expected light in points, share of its light | Disc: the same | Young stars left out | Glow B − V (cluster, disc) |
| --- | --- | --- | --- | --- | --- |
| 60,000 | −2.446 | 0.951, 21.1 % | 1.027, 2.8 % | none | 0.620, 0.278 |
| 30,000 | −3.307 | 0.941, 14.2 % | 1.044, 1.4 % | 478 (540 L☉, 0.011 %) | 0.603, 0.278 |
| 10,000 | −4.725 | 0.903, 7.3 % | 1.140, 0.4 % | 899 (1,560 L☉, 0.032 %) | 0.581, 0.278 |

Each table is scaled by its realised-to-expected ratio (a few per cent, the brightest stars being rare), so points and
glow add up to each law's light exactly; the faint young stars a smaller count leaves out are not moved into the glow
(their light is in the table above).

**Checks** (the build prints them and keeps them in the JSON's `checks`; `nuclearCluster.test.ts` repeats the first).

| Check | Result |
| --- | --- |
| V light within 50 pc, points and glow against the Galaxy model's cluster and disc | × 1.000 (the test: within 1 % at each count) |
| Within 5 pc | × 0.984 (the model's cluster is a Plummer sphere of half-light radius 4.2 pc; this one Schödel's cusp) |
| μ_V seen from Earth without dust, in the plane and across it | at 0.1 pc 11.47 and 11.57 against the model's 11.58 and 11.58; at 1 pc 12.34 and 12.54 against 11.76 and 11.93 (the cusp holds less light at 1 pc and more at 0.1); from 10 pc out within 0.03 |
| Stars of observed K_s 17.5–18.5 per pc² at 0.5 and 1 pc, against Gallego-Cano et al. 2018's fit | × 0.92 and 0.99 for A_Ks 2.7; × 1.09 and 1.16 for 2.5; × 0.71 and 0.76 for 2.9: within the stated × 1.5 |
| Stars brighter than V = 6.5 seen from Sgr A* (points and glow, no dust) | 1.6 × 10⁷ |
| No point within 0.04 pc of the hole | 0.0400 pc |

**In the app** (`src/sim/galaxy/nuclearCluster.ts`, `src/scene/NuclearCluster.tsx`, the glow in
`render/shaders/galaxyGlow.frag.glsl` with its twin in `src/sim/galaxy/glow.ts`). The field is loaded once the camera
comes within 3 kpc of Sgr A*. It takes over from the Galaxy model's particles of its nuclear disc and cluster in two
steps, u = 1 − smoothstep(500 pc, 1 kpc, distance from Sgr A*) and w = 1 − smoothstep(30 pc, 60 pc, distance): the
particles are drawn × (1 − u), the points × w, and the glow is each law times u − w s(r), so the three always add up
to the laws' light. The first step is needed because the particles, 5–160 pc across, fade as the camera comes within
2.8 of their sizes (they would be seen from inside): measured in the app's own frames (linear light, before bloom and
tone mapping), the particles show 0.94–1.11 of the laws' light from 500 pc to 1.3 kpc from the hole (1.19 at
300 pc), but 0.75 at 100 pc, 0.46 at 60 pc and 0.24 at 30 pc, where the field first took over; with the two steps the light
drawn of the two components falls smoothly with distance, 0.54, 0.46, 0.40, 0.30, 0.097, 0.034, 0.019, 0.012 and
0.0068 (the frame's mean, in the scene's linear units) at 30, 45, 60, 100, 300, 500, 650, 800 and 1,000 pc, within 2 %
of the laws' own throughout the points' fade. The points are the star field's own lensed
program (so each has its lensed images, and the order-1 images bent round the far side of the hole are a second draw
over a candidate list), in their own frame: the camera relative to Sgr A*, exact near the hole. Points within 0.01 pc of
the camera are not drawn (a model K giant 100 au away would be a V −21.6 point with no disc, label or pick); a column
standing in for their expected light is added to every line of sight of the glow. The glow is marched along each
pixel's straight line of sight, 16 cells (8 at rungs 1 and 2) in t with s = s0 + a sinh t about the ray's closest
approach to the hole (a the distance there, or from the galactic pole's axis where the ray passes that closer, at
least 3 pc), cut where the light jumps (the field's inner hole, the disc's inner cylinder) and ended at its edge.
Against a fine quadrature, over 180 random rays from 0.02 to 55 pc: 16 cells, median error 0.09 %, nine rays in ten
within 0.53 %, the worst 3.1 %, each camera's whole sky within 0.4 %; 8 cells, median 0.7 %, nine in ten within 5.4 %.
The lens resamples the glow as if it came from far away, which near the hole it partly does not (label 4, §3). Neither
points nor glow are dimmed by dust: the 30 magnitudes that hide the Galactic Centre from Earth lie mostly in the
Galaxy's disc on the way, and inside the cluster there is some the model leaves out.

From near the hole the sky is bright. The glow alone has a mean surface brightness μ_V of 13.7 mag/arcsec² at
4,000 au from Sgr A*, 11.2 at 0.1 pc, 13.9 at 1 pc, 15.2 at 10 pc and 16.0 at 30 pc (the Milky Way's brightest parts
seen from Earth are about 20–21); on it the points, whose flux at 4,000 au is that of a sky of μ_V 7.7, most of it from a
few young stars 0.03–0.05 pc away, each as bright as V −19 to −20.

**M87's own starlight.** Inside M87 its model galaxy's particles near the camera fade out as their splats grow (they
would be seen from inside), and the sky there would be dark, so that from M87* the lens's Einstein disc would read as a
shadow twice its true size. A spherical model of M87's V-band light fills in exactly the light those particles no longer
draw. The profile: inside 25″ the core-Sérsic fit of Ferrarese et al. 2006 (ApJS 164, 334, VCC 1316, g band: μ_e 23.45,
γ 0.322, n 6.094, r_e 163.83″, r_b 7.15″), taken to V by −0.527 mag (the median difference from Kormendy et al. 2009's V
photometry between 0.5″ and 150″); outside it the Sérsic fit of Kormendy et al. 2009 (ApJS 182, 216, NGC 4486: n 11.84,
r_e 703.91″, μ_e 25.71); circularised with the measured ellipticity (0.05 inside 10″ to 0.45 beyond 1,000″), less the
Milky Way's extinction A_V 0.072, at the app's distance of 16.71 Mpc, and deprojected by Abel's integral to a luminosity
density tabulated from 10⁻³ to 3 × 10⁵ pc. Projected again it matches the fits to 0.003 mag from 1 pc to 10 kpc; its
total, M_V −23.12, is Kormendy et al.'s −22.95 at their 17.14 Mpc (−23.01 at ours). Inside 0.1″ (8 pc) the core's power
law is an extrapolation, and inside 1,000 au the density is held constant. Its colour is the elliptical template's,
B − V 0.96.

In the app (`m87ColumnTable` in `glow.ts`) the light along 64 directions from the direction of M87's centre (ψ from
10⁻⁴ rad to π, log-spaced), from the camera out to where the template's particles are drawn in full again, of the
profile times the share of the template's light its particles no longer draw at each point (their splat sizes read
from the app's own template, and the galaxies shader's fade), is a table the glow pass reads; rebuilt on the processor
when the camera's distance from the centre changes by 1 %, in about 0.06–0.1 ms of processor time (24 steps a
direction, each exact for a power law), within 0.9 % of a fine integration. From M87* at 1,000 au its sky is μ_V 14.0 all round, and the shadow
reads at its true radius, 18.1° (measured in the app: dark to 17–18°, the starlight from there out; without it the whole
sky is dark). `m87-star` offers a fall (its `fallAllowed` follows this: `M87_STARLIGHT` in `scripts/build-blackholes.mjs`).

**Performance** (the target laptop, whole-frame A/B medians of five interleaved rounds with `window.__ls.perf` in a
Chrome of our own at 2,048 × 1,320, pixel ratio 2, no multisampling, the lens rung pinned; 29 September 2026,
04:28–04:33, the rounds' spread 0.02–0.27 ms; earlier runs with the processor 70–100 % busy agreed within their
± 0.2 ms).

| Piece | Rung 0 | Rung 1 | Rung 2 | Budget |
| --- | --- | --- | --- | --- |
| Points (60,000 / 30,000 / 10,000) and their order-1 draw, at 4,000 au and at 10 pc | 1.30, 1.30 | 0.64, 0.67 | 0.2–0.4 (busy machine) | 0.2 / 0.1 |
| Order-1 draw alone | 0.01 at 4,000 au (301 stars), 0.18 at 10 pc (its list at its cap of 20,000, all culled by the GPU) | | | 0.03 (the star field's) |
| Glow march | 0.24 at 4,000 au (0.3–0.4 before its loop was rewritten without arrays indexed by a variable), 0.12 at 100 pc, 0.11 at 300 pc, 0.06 at 700 pc | 0.20 at 4,000 au | | 0.25 / 0.13 |
| M87's starlight at 1,000 au from M87* | 0.04 | | | 0.1 |

The points are over their budget: each costs about 20 ns of vertex work in the lensed star program (none is pre-culled,
every field star being bright), nearly all of it vertex work: on a canvas of a quarter of the pixels it costs the same,
and with the stars dimmed by 6 magnitudes, which shrinks their sprites, still 80 % of it. The estimate before it was built was
3.2 ns a star. The whole frame at 4,000 au is 5.8 ms with them (4.5 without); the GPU-time controller takes rungs 1 and
2 (30,000 and 10,000 points) when a frame's median passes 8.5 ms. The glow is inside its budget at rung 0 and 0.07 ms
over it at rung 1 (halving its cells saves less than half: part of its cost is each pixel's set-up).

**Limitations.** A model, as above. No dust inside the cluster. Which stars are points is chosen by their brightness
from the hole, the right choice near it; tens of parsecs away a faint star next to the camera stays in the glow. The
glow is resampled by the lens as if from infinity. Its stars stand still: in the cluster they move at about 100 km/s (a
thousandth of a parsec a decade), faster near the hole. M87's light is taken as spherical (round in its inner parts; its
outer halo, of ellipticity up to 0.45, circularised) and is only its stars' light: its jet and hot gas are not drawn.

**Tests.** `src/sim/galaxy/nuclearCluster.test.ts`: the file decodes and is the one the JSON names, is sorted, holds no
star within 0.04 pc, is flattened as its law; points and glow hold the model's light within 50 pc at each count (1 %);
the points' law holds the points' light (2 %); the crossfade keeps the light seen from 45 pc (5 %); the stand-in for the
points beside the camera keeps their light (2 %). `src/sim/galaxy/glow.test.ts`: the march against a fine quadrature
(16 and 8 cells); M87's model projected back onto both fits (0.01 mag to 200″, 0.03 at 1,000″); its table against a fine
integration (2 %), bright all round from M87* and empty far off; the table built in under 0.1 ms of processor time.

## 7. The flow model

**What it is.** Sagittarius A*'s accretion flow is drawn as a model: a hot, thin flow of the kind Broderick & Loeb (2006,
MNRAS 367, 905) and Broderick et al. (2009, ApJ 697, 45) describe, with its radial structure from Yuan, Quataert &
Narayan (2003, ApJ 598, 301), fitted to Sgr A*'s quiescent spectrum (`scripts/sgra-flow/fit_riaf.py`). Lengths in M, ρ
the distance from the flow's axis, z the height above its mid-plane, r the distance from the hole:

| Quantity | Law | Model A |
| --- | --- | --- |
| Thermal electrons | n_th = n₀ ρ^−1.1 exp(−z²/2ρ²) | n₀ = 2.613 × 10⁶ cm⁻³ |
| Their temperature | T_e = T₀ r^−0.84 | T₀ = 1.876 × 10¹² K |
| Power-law electrons | n_nt = n₀,nt ρ^−2.9 exp(−z²/2ρ²), N(γ) ∝ γ^−p, γ ≥ 100 | n₀,nt = 4.081 × 10⁵ cm⁻³, p = 2 |
| Magnetic field | B²/8π = n_th m_p c²/(6βr) | β = 10, pitch angle 60° |
| Gas velocity | Keplerian (Ω = r^−3/2 about the axis) from 6 M out; inside, the plunge from the innermost stable orbit | — |

Its light: thermal synchrotron (the fit of Leung, Gammie & Noble 2011, ApJ 737, 21) and power-law synchrotron (Pandya et
al. 2016, ApJ 822, 34), with self-absorption, followed along exact light rays of the Schwarzschild geometry with the
full frequency shift of the moving gas (I_ν/ν³ carried along each ray). Fitted jointly to 230 GHz (2.4 ± 0.2 Jy, EHT
2017), 678 and 868 GHz (Bower et al. 2019's ratios), the median near-infrared 1.1 mJy at 2.2 µm (GRAVITY 2020,
dereddened) and its spectral index −0.50 ± 0.19 (Paugnat et al. 2024). The fit's three models:

| Model | Viewing angle | V at 8,277 pc (no dust) | B − V | 230 GHz | Notes |
| --- | --- | --- | --- | --- | --- |
| **A** (drawn) | 30° | **17.15** (0.50 mJy) | +0.24 | 2.54 Jy | near-infrared slope fitted |
| B | 60° | 17.19 | +0.24 | 2.44 Jy | the same refitted at Broderick et al. 2016's angle |
| C | 30° | 19.37 (0.065 mJy) | +0.28 | 2.73 Jy | slope left free: the near infrared then comes from the hottest thermal electrons, the pessimistic case for visible light |

Its visible light has never been seen (about 30 magnitudes of dust are in the way) and is carried over from the near
infrared by the power law the measured slope says: uncertain by about three times either way, eight times fainter in
model C. Seen from far away it is a thin, lopsided ring hugging the shadow (radius 5.33 M in impact parameter; the
lensed inner flow, brightest where the gas comes towards the camera), 1/690 of the Sun's surface brightness over its
brightest half (μ_V −3.5 mag/arcsec²; −5.4 at its peak) and 560 times the full Moon's. Its known shortcomings: the
simple profiles make the outer flow (20–40 M) too bright (86 GHz comes out twice the measured 2.0 Jy), the
submillimetre spectrum comes out 1–2σ steeper than measured, the real flow flickers tenfold within hours, and it is
drawn outside the horizon only (it is fitted to light that leaves).

**Its axis.** The flares GRAVITY saw orbiting Sgr A* (GRAVITY Collaboration 2023, A&A 677, L10, Table 2: i = 154.9°,
Ω = 177.3°) set the flow's axis, a model choice: (east, north, away) = (−0.424, −0.020, +0.906), 25.1° from our line of
sight and tipped away from us; in J2000 ecliptic axes (−0.47179, −0.87366, −0.11890). `sgraFlow.json`'s `axis` is the
only place it is kept (`accretion.ts` `flowAxisWorld`).

**Files.** `scripts/sgra-flow/`: `riaf_model.py` (the model and the ray tracer the fit used, unchanged
since the fit), `fit_riaf.py` (re-images the three fitted models into `riaf_results.json`), `flow_camera.py` (the same model
seen from a camera at a finite distance, hovering or falling as a raindrop, inside the horizon included: the reference
the app's own ray march is checked against) and `flow_tables.py`, which writes `src/sim/blackholes/sgraFlow.json` and
the references in `scripts/sgra-flow/ref/`. `python scripts/sgra-flow/flow_tables.py` takes about 33 minutes on three
processes (numpy and scipy); `--quick` runs a coarse version in two minutes, and `--angles-from-json` reuses the
viewing-angle table. It is deterministic.

| `sgraFlow.json` | Holds |
| --- | --- |
| `model`, `emission` | model A's parameters, and the emissivities' constants computed by `riaf_model.py`'s own functions (so the app's arithmetic uses the reference's numbers) |
| `axis` | the flow's axis (above) and its angle to the Sun seen from Sgr A* (154.9°) |
| `fit` | the fitted fluxes, B − V, the visible surface brightness, the ring's radius, the 1.3 mm ring and peak brightness temperature, model C's visible flux |
| `byAngle` | the visible and 230 GHz flux seen from 8,277 pc every 5° from the axis, 0–180° (400 × 400 rays over ±30 M each; 0–90° traced, the rest mirrored, the mirror checked at 150° to 10⁻¹³): V from 17.37 face-on to 16.72 edge-on, 17.22 from the Sun's side |
| `scenes` | the numbers the scene *The gas round Sgr A\** may quote, from its camera (hovering 20 M from Sgr A* on the line to the Sun): the flow's total V magnitude −29.47, the brightest ring's radius 14.43° (the shadow's 14.27°) |
| `limits`, `refs` | the shortcomings above, as text; the papers |

**As a point.** Beyond about 5,300 M (225 au) from Sgr A* the ring is under 1.5 device px across and the flow is the
hole's glint: V = m₈₂₇₇(i) + 5 log₁₀(d/8,277 pc) − 2.5 log₁₀ g^1.5, with m₈₂₇₇(i) from `byAngle` at the camera's angle
from the axis (log flux interpolated), d its distance and g a hovering observer's blueshift there (a power law's flux
scales as g^(1 − α)); its colour the power law's, the same at any shift. From 4,000 au at 30° from the axis it is V
−11.0; from the app's framing camera (115° from the axis) −11.35. Between 1.5 and 3 px of ring radius (225 to 112 au) it
fades out as the resolved picture fades in (`flowPointShare`); with the lens switched off only the point shows, and only
while unresolved (a resolved flow is a lensed image, which drawn straight would be wrong).

**Resolved: the flow map.** For the camera's r and frame, the flow's picture is a function of two angles, the look
angle α from the hole and the azimuth ω about the camera–hole axis. A 256 × 64 half-float map holds it: 64 rows inside
the shadow's edge and 192 outside, uniform in the lens tables' own variable s = ln g + 3g (g the gap to the edge, from
10⁻⁶ of the span), so both crowd at the photon ring; 64 columns in ω from the flow's axis projected across the view.
Each texel is one backward ray, traced from the camera on the GPU (`flowMap.frag.glsl`; its float64 twin
`render/flow/flowRay.ts`):

- a row table (float64, on the processor) gives each row's impact parameter and where its ray starts: on the camera, or
  for a camera beyond 400 M where the ray first crosses 400 M, with the azimuth it has swept by then (the orbit's
  integral by 16-point Gauss–Legendre quadrature in a variable that removes the turning point's square root; within
  10⁻⁶ rad of Carlson's sweep);
- the orbit: the Cartesian form of the orbit equation, ẍ = −3b²x/|x|⁵ (exact for photon energy 1), RK4 in steps that
  move the point by 0.07 r (0.07 r/max(1, |ẋ|); a share falling to 0.025 r inside the horizon, where a raindrop's rays
  leave at |ẋ| up to 40; growing as r/40 beyond 40 M), at most 128 steps, ending into the horizon or out beyond 400 M (the
  reference's own reach: a cut at 40 M showed as an edge in the sky's display law);
- the light: at one point of every second step (placed by a frame's jitter along the pair; eight jittered frames are
  averaged while the camera is still, which integrates each pair as eight samples would), outside the horizon only, with
  the fluid's frequency factor from its Keplerian rotation or the plunge and the photon's angular momentum about the
  flow's axis. Visible light is the power-law electrons' alone, optically thin (Σ g^2.5 j_V Δλ); at 1.3 mm the thermal
  and power-law emission and absorption at 150, 230 and 345 GHz, front to back, so the pixel's own shift can be applied.

The lens passes read the map at each ray's (g, ω) (`flowLookup.glsl`, called by the lens box's composite and the band)
and multiply it by the ray's k^3.5 (k: the observer's blueshift of light from far away and the view's Doppler factor).
The map is rebuilt when the camera's r (by 10⁻⁴), the lens frame, the flow's angle to the view (by 10⁻³ rad), the band,
the blur or the quality rung changes; rung 1 draws 192 × 48 texels and, while moving, one sample every fourth step.

**How bright it is drawn.** The first version drew the resolved flow as a surface of the Sun's calibration (radiance
8·S_V/S_V,☉, as the Sun's disc and the CMB are drawn). Next to the sky round it, which the app draws with the eye's √
law (the nuclear cluster's glow, the Milky Way, the stars), that put the flow a million times too faint: it showed only
against the shadow, and its glare vanished as it resolved. It is drawn instead with the sky's own law (the Galaxy layer's:
the √ of the light in a faint star's image), which keeps its place among the sky's lights and hands over smoothly from
its point (drawn with the stars' matching law), and the view's exposure follows its glare the way a camera's averaging
meter does: the flow's mean displayed brightness over the look angles the view holds (its axis's angle from the hole ±
the half-diagonal; reduced on the GPU and read back without waiting) is brought to 0.3 display units (AgX's middle grey
is 0.18), and everything else, the cluster's glow and the stars with it, dims by the same factor. A ring a few pixels
across hardly moves the meter, so it glares as its point did; as the flow fills the view the exposure falls (ln E = −0.7
at 110 au, −3.9 at 50 au, −7.5 at 20 au, −9.0 at 300 M, −12.4 at 100 M, −16.9 at 20 M, looking at the hole), the sky
darkens to its brightest stars, and the instruments' Auto-exposure row shows it. The exposure fades in with the resolved
picture's share and eases over a few frames (an eye adapts over a fraction of a second). The √ law is not additive: the
same light spread over the picture's many pixels shows as more in all than as one point. So across the handover the
picture is drawn dimmer, **a display choice** (labelled in `flowMap.ts` `flowHandoverGain`): its gain times κ =
min(1, P_point / P_picture)^(1 − h), P_point the point's light as the screen shows it, P_picture the picture's in the
sky's law, h rising smoothly from 0 at a ring of 3 px to 1 at 30 px. The light on the screen is then continuous where the
point hands over, and the sky's own law holds from a ring of 30 px in: measured at one exposure (the screen's light within
128 px of the hole, the flow on less the flow off), within a factor 1.35 from 300 au in to 60 au, where with the sky's
law in full it grew 34 times. In linear light it still grows about 5.8 times across the handover. The Sun's-calibration
surface is kept as a switch for comparison (`flowMap.ts` `flowDisplay.law`).

**The 1.3 mm view** (on Sgr A*'s card: "1.3 mm, as the EHT sees it") draws the model's brightness temperature at 230 GHz
as the camera would receive it, I(ν) = k³ I_∞(ν/k) from the three stored frequencies (log-log), in false colour at a fixed
brightness: black, red, yellow and white for 0 to 6 × 10¹⁰ K on a square-root stretch. It is the model, not the EHT's
reconstruction, which the card links to beside it (the pictures are not in the tree, §8). **"Blur to the EHT's resolution"** convolves the map with the EHT's
20 µas beam seen from Earth, 3.90 M FWHM in impact parameter at Sgr A*'s distance, carried into this camera's view:
along the look angle σ_α = σ_b/|db/dα| summed over every row (each weighted by its own width in look angle: taps between
the uneven rows drew rings), along the azimuth σ_ω = σ_b/b.

**Checked** (`src/render/flow/flowRay.test.ts`, `src/sim/blackholes/accretion.test.ts`; the references are
`flow_camera.py`'s, traced with steps ten times finer and every step's light, and the fit's own images for the
distant camera):

| Check | Result (tolerance) |
| --- | --- |
| The orbit against Carlson's sweeps, 10⁴ random rays from cameras at 2.5–100 M, float64 and float32 | within 10⁻⁴ of r across the orbit (10⁻⁴); 3 × 10⁻⁴ from 1 % above the horizon; leaving the horizon from inside within 0.01 rad of azimuth (rays within 3 % of the critical impact parameter, which circle the photon sphere, left out) |
| The entry sweep from beyond 400 M | within 10⁻⁶ rad of Carlson's |
| Far camera at 30°, visible / 230 GHz (the fit's 200 × 200 images, `riaf_model.py`) | flux 0.9993 / 0.9997 (3 %), ring radius 1.0004 / 1.0002 (1 %), correlation 0.99996 / 0.99988 (0.98), peak 1.0005 / 1.0000 (10 %), the brighter side on the approaching gas |
| Hovering at 20 M, 30° | flux 1.0002 / 1.0001, correlation 0.9999993, peak 1.0006 |
| Hovering at 6 M, 60° | flux 0.99998 / 0.99997, correlation 0.9999999 |
| Hovering at 2.02 M (1 % above the horizon), 30° | flux 0.9992 / 0.9998, peak 0.998 |
| A raindrop at 1 M, inside the horizon, 30° | flux 0.9988 / 0.9995, correlation 0.9998, peak 0.973 |
| The GPU's map against its float64 twin (20 M, eight frames averaged) | every texel within 0.36 % (median 0.15 %), visible and 1.3 mm |
| The point from 4,000 au at 30° | V −11.0 (−11.0 ± 0.1) |

The visible map leaves out the thermal electrons' visible light, by choice (0.003 % of it seen from far away,
3.5 × 10⁻⁵ from 20 M, 0.13 % from 6 M, but 9.4 % hovering 1 % above the horizon and 4.5 % for a raindrop at 1 M, whose
blueshift brings the thermal electrons' far-infrared peak towards the visible): near the horizon the flow is drawn up to
a tenth fainter than the model makes it.

**Cost** (target laptop, 2,048 × 1,320, pixel ratio 2, no multisampling, whole-frame A/B medians of 6–8 interleaved
rounds, measured while other work shared the machine): rebuilding the visible map every frame 0.31–0.37 ms at rung 0 (budget
0.3) and 0.15–0.19 ms at rung 1 (budget 0.15), nothing once the camera has been still for eight frames; the 1.3 mm map about
twice the visible one; the blur about 0.3 ms on the frames it runs. The lens passes' reads over a full-screen box cost
0.66 ms (budget 0.05): 0.49 ms of it is the lens pixel's own work to find each ray's gap and azimuth for the flow
(`lensPixel.glsl` `lensFlow`), 0.19 ms the read itself; with the flow on, the exposure dims the sky and the frame as a
whole was 1.1–1.3 ms cheaper than with it off (7.5 against 8.8 ms at 100 M, 7.4 against 8.5 at 300 M). Through the
crossfade from point to picture, drawn with the sky's law in full, the flow's own light grew 74- to 146-fold (an earlier
reading of at most 16 % measured the whole frame, whose light near Sgr A* is mostly the sky's, and is withdrawn); with the
handover's κ (above) it stays within a factor 1.35 on the screen, inside the factor 1.5 its check allows (§11). At 4,000 au the flow costs nothing (5.83 ms either way). The row table takes about 0.03 ms of processor
time when rebuilt; `flowPoint` about a microsecond.

## 8. Sources and licences

**The values.** Every number in `blackholes.json`, `sgraFlow.json` and `nuclearGlow.json` carries the key of its
paper, and each file's `refs` (or `references`) holds the citations with where in the paper each value is. They are
single measured values for named objects (a mass, a distance, an orbit), quoted with citation, not a reproduced table.
Where the paper is open access under CC BY (the GRAVITY and Gaia Collaboration papers in A&A, the AAS journals' papers
from 2022 on, the Event Horizon Telescope's Sgr A* series among them) that removes any doubt; for the others (Science,
MNRAS, and ApJ before its switch) no licence was confirmed, and only single values are used.

The main sources:

- **The physics** (§4): Synge 1966 (MNRAS 131, 463), the shadow; Darwin 1959 (Proc. R. Soc. A 249, 180), the paths of
  light; Carlson 1987, 1991, 1995 (Math. Comp. 49, 595; 56, 267; Numer. Algorithms 10, 13) and the NIST DLMF chapter
  19, the elliptic integrals; Perlick 2004 (Living Rev. Relativ. 7, 9; Phys. Rev. D 69, 064017), the exact lens
  equation; Gould 1994 (ApJ 421, L71), a source's own disc at a caustic; Hamilton & Lisle 2008 (Am. J. Phys. 76, 519),
  the raindrop and the free-fallers' time; Gralla, Holz & Wald 2019 (Phys. Rev. D 100, 024018), photon rings; Bardeen
  1973 (in *Black Holes*, Les Houches, 215), the shadow of a spinning hole, from which the spin note's percentages
  were computed for Sgr A*'s viewing angle; Misner, Thorne & Wheeler 1973 (*Gravitation*) and Chandrasekhar 1983 (*The
  Mathematical Theory of Black Holes*).
- **Sagittarius A\* and M87\*** (§5): GRAVITY Collaboration 2022 (A&A 657, L12; CC BY 4.0), Sgr A*'s mass and
  distance; Reid & Brunthaler 2004 (ApJ 616, 872), its position; Do et al. 2019 (Science 365, 664), the Keck group's
  mass; Event Horizon Telescope Collaboration 2019 (ApJL 875, L1, L5, L6), 2022 (ApJL 930, L12–L17) and 2025
  (arXiv:2509.24593), the rings and M87*'s mass; Liepold, Ma & Walsh 2023 (ApJL 945, L35) and Simon, Cappellari &
  Hartke 2024 (MNRAS 527, 2341), M87*'s mass from stellar dynamics; Walker et al. 2018 (ApJ 855, 128), M87's jet.
- **The stellar-mass black holes** (§5): El-Badry et al. 2023a, b (MNRAS 518, 1057; 521, 4323); Nagarajan et al. 2024
  (PASP 136, 014202); Gaia Collaboration, Panuzzo et al. 2024 (A&A 686, L2); Miller-Jones et al. 2021 (Science 371,
  1046), Brocksopp et al. 1999 (A&A 343, 861), Gies et al. 2003 (ApJ 583, 424), Ramachandran et al. 2025 (A&A 698,
  A37); Miller-Jones et al. 2009 (ApJL 706, L230), Casares et al. 2019 (MNRAS 488, 1356), Khargharia, Froning &
  Robinson 2010 (ApJ 716, 1105), Burdge et al. 2024 (Nature 635, 316); González Hernández et al. 2008, 2014 (ApJ 679,
  732; MNRAS 438, L21), González Hernández & Casares 2010 (A&A 516, A58), Cantrell et al. 2010 (ApJ 710, 1127), Gelino
  et al. 2006 (ApJ 642, 438); Torres et al. 2019, 2020 (ApJL 882, L21; 893, L37), Atri et al. 2020 (MNRAS 493, L81),
  Mikołajewska et al. 2022 (ApJ 930, 9); Sahu et al. 2022, 2025 (ApJ 933, 83; arXiv:2503.07820), Lam et al. 2022 (ApJL
  933, L23); Eggleton 1983 (ApJ 268, 368); Pecaut & Mamajek 2013 (ApJS 208, 9). Positions and proper motions of five
  systems from Gaia DR3 (Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1) via SIMBAD (CDS), retrieved 28
  September 2026.
- **The second table's X-ray binaries** (§13): Corral-Santana et al. 2016 (A&A 587, A61; BlackCAT, CDS
  J/A+A/587/A61), the guide; Reid et al. 2014 (ApJ 796, 2), Steeghs et al. 2013 (ApJ 768, 185), McClintock et al. 2006
  (ApJ 652, 518), Mills et al. 2021 (ApJ 914, 6), Motta et al. 2021 (MNRAS 503, 152), Miller et al. 2020 (ApJ 904, 30):
  GRS 1915+105; Greene, Bailyn & Orosz 2001 (ApJ 554, 1290), González Hernández, Rebolo & Israelian 2008 (A&A 478, 203),
  Orosz & Bailyn 1997 (ApJ 477, 876), Beer & Podsiadlowski 2002 (MNRAS 331, 351), Foellmi et al. 2006 (A&A 457, 249),
  Shafee et al. 2006 (ApJ 636, L113): GRO J1655−40; Heida et al. 2017 (ApJ 846, 132), Zdziarski et al. 2019 (MNRAS 488,
  1026), Miller et al. 2008 (ApJ 679, L113), Zdziarski et al. 2025 (ApJL 981, L15): GX 339−4; Orosz et al. 1998 (ApJ
  499, 375), Orosz 2003 (IAU Symp. 212, 365), Jonker & Nelemans 2004 (MNRAS 354, 355), Morningstar & Miller 2014 (ApJL
  793, L33): 4U 1543−475; Orosz et al. 2002, 2011 (ApJ 568, 845; 730, 75), Steiner et al. 2011 (MNRAS 416, 941), Corbel
  et al. 2002 (Science 298, 196): XTE J1550−564; MacDonald et al. 2014 (ApJ 784, 2), Orosz et al. 2001 (ApJ 555, 489):
  V4641 Sgr; Wu et al. 2015, 2016 (ApJ 806, 92; 825, 46), Chen et al. 2016 (ApJ 825, 45), González Hernández et al.
  2017 (MNRAS 465, L15): Nova Muscae 1991; Filippenko et al. 1999 (PASP 111, 969), Shahbaz et al. 1996 (MNRAS 282, L47):
  Nova Velorum 1993; Harlaftis, Horne & Filippenko 1996 (PASP 108, 762), Casares et al. 2022 (MNRAS 516, 2023),
  Rodriguez et al. 2020 (ApJ 889, 58): GS 2000+25; Orosz et al. 2004 (ApJ 616, 376), Homan et al. 2003, 2006 (ApJ 586,
  1262; MNRAS 366, 235), Miller et al. 2009 (ApJ 697, 900), Casares 2016 (ApJ 822, 99): XTE J1650−500; Harlaftis et al.
  1997 (AJ 114, 1170), Remillard et al. 1996 (ApJ 459, 226), Dashwood Brown, Gandhi & Zhao 2024 (MNRAS 527, L82):
  H1705−250; Webb et al. 2000 (MNRAS 317, 528), Gelino & Harrison 2003 (ApJ 599, 1254): GRO J0422+32; Yanes-Rizo et al.
  2022 (MNRAS 517, 1476), Motta et al. 2022 (MNRAS 517, 1469), Mall et al. 2024 (MNRAS 527, 12053), Hynes et al. 2002
  (MNRAS 331, 169): XTE J1859+226; Orosz et al. 2007, 2009, 2014 (Nature 449, 872; ApJ 697, 573; 794, 154), Gou et al.
  2009 (ApJ 701, 1076), Song et al. 2010 (AJ 140, 794), Steiner et al. 2010, 2014 (ApJL 718, L117; 793, L29), Liu et al.
  2008, 2010 (ApJL 679, L37; 719, L109), Ramachandran et al. 2022 (A&A 667, A77), Pietrzyński et al. 2019 (Nature 567,
  200), Duflot, Figon & Meyssonnier 1995 (A&AS 114, 269): LMC X-1, LMC X-3 and M33 X-7; Bailer-Jones et al. 2021 (AJ 161,
  147), Gaia's distances. Positions, Gaia DR3 proper motions and magnitudes via SIMBAD (CDS), retrieved 9 October 2026.
- **The galaxies' black holes** (§13): Kormendy & Ho 2013 (ARA&A 51, 511), Tables 2–3; Bender et al. 2005 (ApJ 631,
  280); van den Bosch & de Zeeuw 2010 (MNRAS 401, 1770); Nguyen et al. 2017, 2018 (ApJ 836, 237; 858, 118); Cappellari et
  al. 2009 (MNRAS 394, 660); Neumayer 2010 (PASA 27, 449); Jardel et al. 2011 (ApJ 739, 21); Reid, Pesce & Riess 2019
  (ApJL 886, L27); Humphreys et al. 2013 (ApJ 775, 13); Walsh, Barth & Sarzi 2010 (ApJ 721, 762); Shen & Gebhardt 2010
  (ApJ 711, 484); Rusli et al. 2013 (AJ 146, 45); Emsellem, Dejonghe & Bacon 1999 (MNRAS 303, 495); McConnell et al.
  2011, 2012 (Nature 480, 215; ApJ 756, 179); Davis et al. 2020 (MNRAS 496, 4061); and, as Kormendy & Ho quote them,
  Bower et al. 2000 (BAAS 32, 1566) and Devereux et al. 2003 (AJ 125, 1226). The catalogue galaxies' places are the
  app's own NGC file's (OpenNGC, CC BY-SA 4.0; Cosmicflows-4, CC BY 4.0).
- **The nuclear star cluster and M87's light** (§6): Schödel et al. 2014, 2018, 2020 (A&A 566, A47; 609, A27; 641,
  A102); Gallego-Cano et al. 2018 (A&A 609, A26); Feldmeier-Krause et al. 2017 (MNRAS 464, 194); Nogueras-Lara et al.
  2020 (Nature Astronomy 4, 377); Launhardt, Zylka & Mezger 2002 (A&A 384, 112); Sormani et al. 2022 (MNRAS 512,
  1857); Lu et al. 2013 (ApJ 764, 155); Yelda et al. 2014 (ApJ 783, 131); Paumard et al. 2006 (ApJ 643, 1011); the
  MIST v1.2 isochrones (Choi et al. 2016, ApJ 823, 102; Dotter 2016, ApJS 222, 8); Kroupa 2001 (MNRAS 322, 231);
  Ferrarese et al. 2006 (ApJS 164, 334) and Kormendy et al. 2009 (ApJS 182, 216).
- **The accretion flow** (§7): Broderick & Loeb 2006 (MNRAS 367, 905); Broderick et al. 2009 (ApJ 697, 45); Yuan,
  Quataert & Narayan 2003 (ApJ 598, 301); Leung, Gammie & Noble 2011 (ApJ 737, 21); Pandya et al. 2016 (ApJ 822, 34);
  GRAVITY Collaboration 2020 (A&A 638, A2) and 2023 (A&A 677, L10); Paugnat et al. 2024 (ApJ 977, 228); Bower et al.
  2019 (ApJL 881, L2); Event Horizon Telescope Collaboration 2022 (ApJL 930, L13); Bessell, Castelli & Plez 1998 (A&A
  333, 231).

**The files' licences:**

| File | Licence | Why |
| --- | --- | --- |
| `src/sim/blackholes/blackholes.json` | published values quoted with citation; **non-commercial use only**, with the Gaia credit | the astrometry of Gaia BH1, BH2, A0620-00, MAXI J1820+070 and XTE J1118+480 is from Gaia DR3 ([CC BY-NC 3.0 IGO](https://www.cosmos.esa.int/web/gaia-users/license), ESA/Gaia/DPAC), as for the star and exoplanet files |
| `src/sim/blackholes/sgraFlow.json`, `scripts/sgra-flow/ref/`, `riaf_results.json` | the project's own (MIT) | a model fitted for Skyfold; the measured fluxes it is fitted to are quoted with citation |
| `public/data/nsc-stars.bin.gz`, `src/sim/galaxy/nuclearGlow.json` | the project's own (MIT) | generated by `scripts/build-nsc.py` from published fits; the MIST isochrones it reads are downloaded at build time and not redistributed |
| `src/physics/__fixtures__/schwarzschild.json`, `scripts/lens-check/ref/` | the project's own (MIT) | computed by the project's own reference |
| The Event Horizon Telescope's pictures (ESO [eso2208-eht-mwa](https://www.eso.org/public/images/eso2208-eht-mwa/), [eso1907a](https://www.eso.org/public/images/eso1907a/)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), credit "EHT Collaboration" ([ESO's terms](https://www.eso.org/public/outreach/copyright/)) | not in the tree: the records name `public/images/eht/sgra-2017.jpg` and `m87-2017.jpg`, to be resized copies ("Image modified for Skyfold: resized."); until then the cards give the credit and link to ESO's pages, without the modification note |

The build-time tools (mpmath, numpy and scipy, all BSD licences) are not shipped. `CREDITS.md` has a row for each
file, and the About page lists the sources ([29]–[33] and [40]).

## 9. Known limitations

**The physics.** Every black hole is drawn without spin (§3, label 1), alone in space (no host galaxy's potential, no
companion's gravity on the light), and only the one with the largest lens bends light at a time (switching when
another's is 10 % larger); the others' lenses are then far below a pixel. Only the black hole's own gravity is
included, and only where r_s/r ≥ 5 × 10⁻¹⁰ (beyond 823 pc of Sgr A* and 366 au of Gaia BH1 every clock and every light
path is exactly the app's flat one). A fall ends 0.03 s before the centre, where general relativity stops working;
home's clock during a fall is a convention (label 10). The flight planner ignores gravity (label 11).

**The rendering.** Diffuse light near the ring is resampled from quarter-resolution pictures as if from far away,
which the nuclear cluster's glow partly is not (label 4); in flight it is recoloured with an approximate spectral
model. Guides, nebula pictures, the cosmic web and galaxies are bent only in part (labels 5–7). A catalogue star
exactly behind a hole shows as two points, not a ring (label 6). The glow and the particles of the Galaxy layer keep
their existing conventions for surface brightness towards the screen's corners (up to 2.3 times apart there); the lens
resamples each by its own. The visible map of the flow leaves out its thermal electrons' visible light (under 0.2 %
of it from 6 M out, but up to 9 % hovering 1 % above the horizon, §7).

**The models and the data.** The accretion flow (label 12), the nuclear cluster (label 14) and M87's starlight (label
17) are models; no dust is drawn near the holes (label 18); several orbital elements are assumed (label 15) and some
masses are contested (label 22); OGLE-2011-BLG-0462 is held fixed (label 19); Cygnus X-1's disc is a model drawn
without the hole's spin and with illustrative swirls (label 25, §12); the quiet binaries' discs, jets and V404 Cygni's
third star are not drawn (label 16). Gaia's fourth data release (due December 2026) will revise every Gaia black hole's orbit (§5).

**What the checks found and is not fixed** (§11, measured on the target laptop):

- **The flow's handover is a display choice.** The point is capped as a star's is, while the resolved picture's faint
  outer flow, drawn with the diffuse sky's √ law, would spread a glow some 280 px across round it (74- to 146-fold the
  light by 112 au). The picture is drawn dimmer across the handover (κ, §7), so its light on the screen stays within a
  factor 1.35 of the point's from 300 to 60 au; in linear light it still grows about 5.8 times.
- **Over their budgets** (whole-frame A/B, rung 0): the lens box's composite over the whole screen, 1.6–2.1 ms over the
  plain composite it replaces (0.8 at rest, 1.05 in flight allowed); the nuclear cluster's points, 0.7–2.4 ms against
  0.2 (the lensed star program's vertex work, about 20 ns a star); the flow's reads in the lens passes, 0.14–0.19 ms
  against 0.05; the band's early-out where no band is drawn, 0.14–0.19 ms against 0.1 (a test on the chord instead of
  the angle, since adopted, measured −0.01 ms that evening: fixed); `lensBodies`, 1.0–1.3 ms of processor time at 100 M
  and closer under full load, against 0.5. The Galaxy particles' frustum test saves 0.27–0.46 ms of the 0.5 it was to
  save.
- **Frame times.** On a quieter machine every standard view is inside 8 ms at rung 0 except 100 M with the flow (9.0
  ms), free flight at 500 au (8.6), a fall at 6 M (9.5; 8.1–8.2 after the evening's fixes, §11) and the arriving
  flight's split view (8.2, which starts at rung 1: 6.7); the GPU-time controller takes the first two to rung 1 (7.4,
  7.7), but the fall at 6 M read 8.5 at rung 1 and needed rung 2 and a pixel-ratio step to hold 8 ms. Busier, the close views read 8–12 ms. At the panel's full 2,560 ×
  1,600 no view near a hole is inside 8 ms at rung 0.
- **The sky near Sgr A\* is stopped down, a display choice.** The nuclear cluster gives it a glow of μ_V 13.7
  mag/arcsec² at 4,000 au and stars whose flux is that of a sky of μ_V 7.7: at the exposure used everywhere else it was
  drawn nearly white. The sky's averaging meter (`render/lens/skyMeter.ts`) now stops the view down near a hole, as a
  camera would, to a key of 0.18 over the lit pixels (in full once 40 % of the frame is lit, none under 10 %, holding
  still for changes under 0.05); the instruments' Auto-exposure row shows it. The sky there now shows mid-grey (mean
  128/255 at 4,000 au, 116 at 20 M with the shadow black, 131 in `sky-from:sgr-a-star`), but the cluster's glow is even
  all round, so the Milky Way's band shows no ring, and the Sun's ring of `sky-from:sgr-a-star` (V −4.3) shows only a
  few levels above the sky (135 against 130/255): that scene is not among the article's see-it buttons.
- **Start-up and the first minute** (fixed that evening, not re-measured against the base). The Milky Way sky's, the CMB
  map's and the relativistic view's remap programs had carried the lens code behind a uniform (a cold start linked the
  sky's in 269–481 ms instead of 57–93), and the remap was queued behind the lens programs (ready 48 s after a cold load
  instead of 10, so a fast flight started sooner stalled 0.7–1.0 s on its first frame). The lens code is now in `LENS`
  blocks compiled only near a hole, so those three plain programs are their `d17e6d1` sources again (`npm run
  check:shaders`), and the remap compiles before the lens list (`render/precompile.ts`), which waits for it; the
  production-build comparison against `d17e6d1` (§11, the compiles check) has not been repeated.
- **Bloom's luminance at half resolution** saves under 0.4 ms in four of five views and changes 6–7 % of the pixels
  near Sgr A*: it stays off (`quality.bloomHalfLuminance`).
- **The Event Horizon Telescope's pictures** are not in the tree (§8): the cards link to them on ESO's pages.

## 10. In the app

### The frame, in order

`src/scene/SimDriver.tsx` runs, each frame: the clock (paced near a hole, below); `updateFall` (a fall's radius and
direction from its own clock, before the camera moves); the ephemeris and trips; the camera controller (the new modes
`'fall'`, `'circular'` and `'hold'`, and the camera relative to a hole in float64); the ship's motion;
**`updateGravity`** (`src/sim/gravity.ts`: which hole, where the camera is relative to it, its clocks' rate and the
frames); apparent positions; **`updateLens`** (`src/render/lens/lensState.ts`: the tables, zones, boxes and uniforms);
the relativistic view's observers and exposure; and `updateDerived`, which calls **`lensBodies`**
(`src/sim/lensBodies.ts`: bodies' images, the holes' shadows on screen). The GPU-time controller then reads the last
frame's timing, the scene components write their uniforms (`NuclearCluster`, `LensRings`, `AccretionFlow` and
`BlackHoleLens` among them) and the render pipeline draws.

### Which hole, and where the camera is

Every registered body of kind `black-hole` is a candidate; the lens is the one with the largest x = r_s/r, and it
changes only when another's x is 10 % larger. Below x = 5 × 10⁻¹⁰ (beyond 823 pc of Sgr A*, 1.24 Mpc of M87*, 366 au
of Gaia BH1; the Sun is at 4.97 × 10⁻¹¹ of Sgr A*) there is no hole: every clock and every shader runs its old code,
and a test holds a year of clocks at Earth byte for byte. Near a hole the camera's position relative to it comes from
float64 kept relative to the hole (`controller.holeRelative`, or the fall), never from the difference of heliocentric
positions, whose rounding is 2 km at Gaia BH1 and 32 km at Sgr A* against hover floors of 27 mm and 12.7 km; outside a
fall r is held at r_s(1 + 10⁻⁶) or more. The state also carries α = √(1 − r_s/r) and 1 − α without cancellation, the
frame the lens is built for (the observer hovering there; during a fall below r = 3M the raindrop falling from rest far
away), the boost from the Sun's frame to a moving hole's (Gaia BH3's 570 km/s), and the ship's speed past the hovering
observers.

### The lens

- **Tables and uniforms.** When r (or ln(r − 2M), or the frame) changes by more than 10⁻⁷, the forward and inverse
  tables are rebuilt in place (§4; about 0.3 ms) and uploaded as float textures the same frame; `updateLens` itself
  takes 0.0005–0.06 ms. It finds the zones where the lens moves light by 0.5 device px (diffuse light) or 0.02 px
  (points), the box on screen round the first (the whole screen within about 424 au of Sgr A*, or whenever the
  blueshift needs the whole screen recoloured), the shadow's edge as a circle in each half of the view, and the photon
  ring's band. The lens is drawn only while the hole's Einstein ring is at least 0.05 device px (from about 720 pc of
  Sgr A*, 1.1 Mpc of M87*, 320 au of Gaia BH1), View › Gravitational lensing is on and every lensed program has
  compiled in the background.
- **Diffuse light** (`render/lens/`, `lensPixel.glsl`, `lensComposite.frag.glsl`): inside the box the Galaxy layer's
  light (the Milky Way model's particles and glow, the nuclear cluster's glow, the galaxies, M87's starlight) is read at
  each pixel's source through `lensRay`: from the layer's own quarter- and eighth-resolution targets where the source is
  on screen (their mipmaps within 3,000 M, or when the ring is over 100 px), else from the hole's sky cube (the unlensed
  sky round the camera, built one face every other frame from 5,000 M in, read within 3,000 M), with the
  surface-brightness factors of the pixels involved (cos³ of their angles off the view's axis), recoloured for the
  shift between the source's direction and the pixel's, and nothing where the ray is captured. The Galaxy layer's own
  composite draws the frame round the box. The photon ring's band, ±4 px about the shadow's edge, is its own pass with 8
  rays a pixel stratified in the tables' variable (4 at rung 1). The Milky Way seen from the Sun, the CMB map and the
  relativistic remap test each pixel against the zone first and bend the rest (`uLensOn`: free far from holes).
- **Points** (`render/lensVariants.ts`): the stars, the nuclear cluster's stars, the cosmic web, the nebula cards'
  corners, the constellation figures, the planet-host and cluster rings and the orbit lines each have a `LENS` variant
  of their shader, compiled in the background and swapped in only while a lens is drawn. A star's image is found from
  the inverse table and the parallax of its true distance (tier 1, §4), culled first by a bound on its magnification,
  magnified and capped by its own disc at the caustics, and shifted in colour by gravity and the frame boost; stars in
  front of the hole are drawn straight. Second images (and third and fourth while the band is a pixel or more and the
  rung below 2) are extra draws of the same program over lists of the stars that can show them
  (`sim/stars/lensCandidates.ts`, at most 20,000). Orbit lines within 10⁵ M of the hole use the exact solver (tier 2)
  once its program has compiled.
- **Bodies** (`sim/lensBodies.ts`): the bodies near the lens's axis or near the hole (the S-stars, a companion, the Sun,
  the planets) get their images of orders 0–2 on the CPU, exactly (tier 2) within 1,000 times the camera's distance of
  the hole and from the GPU's own tables beyond, with the S-stars' orbital and gravitational shifts in their colours;
  the glints draw three slots a body. Where a body lines up almost exactly behind the hole its two images fade into a
  ring of light (`scene/LensRings.tsx`, as the Sun seen from beyond Sgr A* in `sky-from:sgr-a-star`). A companion seen
  near the axis is drawn as an exactly lensed sphere instead of its mesh (`render/lens/lensSpheres.ts`: Gaia BH1's star
  from 10⁶ km). The active hole's shadow is an exact circle on screen in each half, for its label and for picking; a
  second image can be picked and its hover tag says so ("S2 · second image, bent round Sgr A*").
- **Frames and exposure.** The lens is applied between the boost from the Sun's frame to the hole's and its inverse,
  so the classical view is the observer at rest in the Sun's frame, as everywhere; in a fall the views are the
  raindrop's and the faller's. Near a hole the exposure follows the observer's blueshift in the classical view too
  (`relativisticView.ts`), and the flow's glare (§7).
- **Quality** (`render/gpuBudget.ts`): one timer query a frame near a hole; when the median of 60 frames passes 8.5 ms
  the lens steps a rung down (after 300 frames under 6.5 ms, up). Rung 1: the band with 4 rays, 30,000 of the cluster's
  points and 8 steps of its glow, the flow's map at 192 × 48, sky-cube faces every third frame. Rung 2: recolouring only
  above a 1 % shift, no third and fourth images, no mipmaps, the sky cube frozen, 10,000 points. Then the pixel ratio
  steps down. Without the timer extension an integrated GPU starts at rung 1 near a hole; the split view does too.

### Time and motion

- **Clocks** (`sim/tick.ts`, `sim/chronometer.ts`). With a hole selected the chronometers' lag rate is 1 − α/cosh φ,
  φ the ship's rapidity relative to home. Where 1 − α passes 10⁻⁴ (within 5,000 r_s: 424 au of Sgr A*, 3.11 pc of
  M87*, 1.4 × 10⁵ km of Gaia BH1) the time warp paces a hovering clock and home runs 1/α faster; the date turns amber,
  and Now cannot keep the computer's time. Measured in a tab 1.0001 r_s from Sgr A*: 60 frames gave τ = 1 s and home
  100.005 s.
- **Hovering** (`controls/cameraController.ts`). Orbit mode about a hole is hovering: zoom and ± act on ln(r − r_s),
  down to r_s(1 + 10⁻⁶) (12.69 km above Sgr A*'s horizon and 27.4 mm above Gaia BH1's, held with no jitter). Free flight
  near a hole moves at the throttle's speed past the hovering observers (the engine holds the ship). `hoverAt` places a
  scene's camera exactly; `go:` to a binary's hole frames it from beyond, on the line from its star through it.
- **Circular orbits and snapshots** (scenes only): a geodesic orbit from 3M out (the innermost stable one at 6M, 0.5c
  past the hovering observers, 23.0 minutes a turn aboard and 32.6 at home), and a moment held still and seen at a
  scheduled velocity, ended by any touch of the controls.
- **Falls** (`sim/fall.ts`): from rest far away (the journey, from 10 r_s) or let go from a hover over Sgr A* or M87*
  (one confirmation); refused for stellar-mass holes. The fall runs on its own clock, 20 s of real time to 2 r_s and 80 s
  from there to the tidal end (at Sgr A* that stretch is real time within 0.3 %); rain from 10 r_s reaches the horizon
  after 864.2 s and the end 28.2 s later, a drip from 10 r_s ends after 2,102.6 s by your clock while home's
  free-faller clock reads 2,153.7 s. Above 3M the picture is computed from the hovering observer's tables with the
  raindrop's motion as an aberration, below it from the raindrop's own (the two agree to 2 × 10⁻¹⁶). A fall holds every
  gate a trip holds; "Stop the fall", or the end, puts the camera back hovering where it let go, with home's clock kept
  and an end card.
- **The panel** (`ui/flight/HoleStrip.tsx`), shown within 5,000 r_s or in a hole's mode and never in a trip: hovering,
  how much slower your clock runs than home's ("1.054×"; within 1 % as the card says it, "0.013 %"), both clocks, the
  height, the thrust hovering takes ("3,806 g"), the tides across 2 m, a gauge from the horizon to 10⁴ r_s and "Let go";
  the same for free flight and for the camera centred on another body near the hole (S2), with the thrust the present
  motion takes and no "Let go"; an orbit, a snapshot and a fall (your clock, home's, the radius, the time left, your
  speed past the hovering observers, home as you see it overhead). It holds a scene's note, which can be dismissed; beside
  an open body card on a screen too narrow for both it moves to the left, and in a narrow panel the numbers go two by
  two and the note scrolls. The card after a fall stays for a minute near that hole, until a scene brings its own note.
  Heights are written as the card writes them ("4000 au") here, in the instruments, under the label and in the RANGE
  readout. The instruments' section A adds whom your motion is measured against, the height, α, the thrust (none on a
  circular orbit) and the tides; section D the exposure once it moves by a twentieth of a stop. Lamps: "Home ×N" (from
  ×1.01) and "Falling". The split view's halves read HOVERING (FALLING FROM REST in a fall, AT REST (SUN) beside a
  moving hole) and SHIP. Since the Roam release the panel is closed by default: in its place a chip ("Sagittarius A* ·
  your clock 1.054× slower · Details") opens it, and Hide closes it; it opens by itself for a black-hole scene or a fall
  (and always during one, for "Stop the fall"), or everywhere with View › Open the black-hole panel automatically (saved,
  off by default). The choice lasts until the camera leaves the hole; the "Home ×N" lamp shows only with the panel open
  (`holeStripForm`, tested). Roam near a hole (within 5,000 r_s) moves the exact hole-relative place, hovers wherever it
  stops, and stops at the same floor; its face reads "Roaming near …", without "Let go".

### The interface

- **View menu** (`ui/layout/Header.tsx`): "Gravitational lensing" (under the optics), "Accretion flow", "Radio eyes"
  (the flow at 1.3 mm, off) and "Accretion discs", on at every visit but Radio eyes (`state/ui.ts`: none is saved, so a
  switch forgotten off cannot hide every black hole next time), each with its hint (labels 12, 21, 25, 26). No new
  keys; the keys sheet's View-menu row names them.
- **Cards** (`ui/viewport/BodyCard.tsx`): for the black hole whose gravity is modelled, the height above the horizon
  instead of the distance and light-time, and no look-back through the expanding universe (far away, its distance like
  any body's); "From here" (the shadow's and the Einstein ring's size, your clock's rate, the thrust hovering takes; from
  far away the shadow in µas); the mass with its uncertainties and any other published mass; at most three one-line
  notes and **What is modelled here**, which opens the data sheet (`ui/dataSheet.ts`: "Horizon radius", and every note
  the card leaves out, each subject once) and the Guide's section; on Sgr A*'s and M87*'s cards the Event Horizon
  Telescope's picture with its credit (`EhtFigure.tsx`; a link to it on ESO's page until the pictures ship), and on Sgr
  A*'s the flow's switches (`FlowControls.tsx`: visible light or 1.3 mm, as the EHT sees it; the blur to the EHT's
  resolution, for the 1.3 mm view only); on Cygnus X-1's the disc's switch (`DiskControls.tsx`: all its light or
  visible light) and its one-line label.
- **Layer cards** (`ui/viewport/LayerCards.tsx`): near Sgr A*, the stars round it (a model, label 14) and the gas
  falling in (label 12), each opening to say more.
- **Physics hints** (`content/explainers.ts`, appended so no section changes its number): the blueshift and slow
  clocks, doubled stars, and the shadow's size, each shown once near a hole with physics hints on, with its section in
  the physics reference (View › Physics reference).
- **The Guide** (What is out there › Black holes; Time › Near a black hole; Journeys and flights › Near a black hole;
  What you are seeing › The lens; What is a model; the lamps, the readings, troubleshooting and nine glossary entries)
  and **About** (the principles, the references [29]–[33] and [40], Model limitations 1–3).

### Scenes and the journey

`src/content/scenes.ts` adds the targets `m87-star`, `gaia-bh1`, `gaia-bh2`, `gaia-bh3`, `cyg-x-1` and
`ogle-2011-blg-0462`; `sky-from:` a black hole hovers on the line from the Sun through the hole, looking back, where
the Sun's light is bent into a ring (Sgr A*: from 10,000 au, the ring 0.47° across; Gaia BH1: from 2.68 × 10⁶ km, the
ring the size of the full Moon), drawn by `LensRings`, with the clock paused where the hole's motion would soon carry
the line off the Sun. The named scenes, whose numbers `src/content/blackHoleScenes.test.ts` checks against the physics
with the Galaxy registered (the scenes made to show the lens switch the flow off and say so; the next scene puts back
what the visitor has not changed):

| Scene | Where | What it shows |
| --- | --- | --- |
| `sgr-a-star-shadow` | hovering at 10 r_s (0.85 au) | the shadow 28.5° across, the Einstein ring 59.7°, the second ring at 14.61°; clock 0.9487; 3,806 g |
| `photon-ring` | 3 r_s, looking at the shadow's edge (45.00°) | light that went round once within 0.64° of it, the next within 0.03° |
| `sgr-a-star-einstein-ring` | 50 r_s (4.24 au) | the ring 24.6° across, the mirrored sky inside down to 3.035°, the shadow's edge at 2.949° |
| `hover-at-the-horizon` | 1.01 r_s, looking straight up | the sky a disc 14.8° in radius overhead, ten times bluer; clock 0.0995; 3.6 million g |
| `isco-orbit` | the innermost stable orbit, 3 r_s | 0.5c; 23.0 minutes a turn aboard, 32.6 at home; the shadow 81.8° across, 22.2° forward |
| `fall-into-sgr-a-star` (the journey *Fall into a black hole*) | from rest far away, from 10 r_s | 864 s to the horizon; the dark patch 84.2° across there, 107° halfway in; the end 28.2 s later, 0.03 s before the centre |
| `dive-and-climb` | 10 r_s, one moment at three speeds | the shadow 28.5°, 6.6° diving in at 0.9c, 114° climbing out |
| `sgr-a-star-flyby` | 5 r_s at 0.9c across the line to the hole | the shadow 25.8° across, 28.7° from straight ahead |
| `s2-behind-sgr-a-star` | 300 au out, S2 120 au behind the hole at its closest | two images 0.81° and 0.68° from the centre, 5.4 times brighter together |
| `sgr-a-star-flow` | 10 r_s on the line to the Sun, the flow on | the model's ring 14.43° in radius outside the shadow's 14.27°, magnitude −29.5 in all |
| `m87-star-close` | 1,000 au from M87* (7.8 r_s) | the shadow 36.3° across, the ring 69°; clock 0.9336; 4.2 g; M87's starlight round it |
| `sgr-a-star-radio` (the journey *Sagittarius A\* in radio light*) | 30 r_s (2.5 au) on the line to the Sun, the flow at 1.3 mm | the model's orange ring round the shadow, against a dark sky (§12) |
| `cyg-x-1-disk` (the journey *The disc of Cygnus X-1*) | 30 r_s (1,900 km) from Cygnus X-1, 8° above its disc, the disc's axis up, orbit lines off | the inner rings blazing, the far side bent over the shadow, the thin ring at the shadow's edge, the approaching side far brighter, dark space and stars round it (§12) |
| `cyg-x-1-from-above` | 75 r_s (4,700 km) on the line to the Sun: the disc at our own angle, 27° from its axis | the inner edge, the underside's ring round the shadow, the approaching side brighter |

The Guide's Try buttons open `sgr-a-star-shadow`, `fall-into-sgr-a-star`, `isco-orbit`, `sgr-a-star-einstein-ring`
and `photon-ring`; the journey *Fall into a black hole* runs `fall-into-sgr-a-star`.

### Tests

135 test files and 1,712 tests (111 and 1,328 before this work), all in Node without a GPU: the physics against the
fixtures (`src/physics/*.test.ts`), the float32 mirror of the lens shader, the tables' cost and allocation, the gravity
state (a year of clocks at Earth byte-identical to the flat code with every hole registered), falls, `lensBodies`,
candidate lists, the records, the flow (its orbits against Carlson's sweeps and its pictures against the references),
the nuclear cluster, the shaders expanded through their includes (no declaration twice, no built-in `atan`, `asin` or
`acos` in the lens chunk), the lensed variants, the controller, the scenes' numbers, the card, the data sheet's notes
(each subject once) and the panel's faces and words. The checks on the GPU
itself are §11's.

## 11. Performance

**How it is measured.** `window.__ls.perf` (`src/dev/perf.ts`, development build only): whole frames driven by
`__ls.step`, a `TIME_ELAPSED` timer query round each (`EXT_disjoint_timer_query_webgl2`), batches of 20 frames, the
best and the median of 8 batch medians, disjoint batches dropped; pixel ratio 2, no multisampling, the lens rung pinned
and the GPU-time controller paused; each view warmed for 150 frames. A piece drawn inside one render is costed only by
whole frames with and without it, interleaved (`perf.ab`: A, B, A, B, … three rounds, the median of the rounds'
differences), because per-object queries misattribute on this GPU; `perf.passes` times only what render-target switches
separate (the Galaxy layer's targets, the rest of the scene pass, bloom and tone mapping, the sky cube's faces, the flow
map). The standard views are `perf.view`'s (`framing` is `go:sgr-a-star` at 4,000 au, `500au` and `100M` keep
its direction, `arriving` is the 1 g flight from Earth held at 4,050 au from Sgr A* (β 0.040), `flight-start-split` at β
0.77, `free-500au` free flight at 0.1c towards the hole). `scripts/lens-check/run-perf.mjs` runs the same in a Chrome of
its own (headless, or a normal window with `--visible`, at any canvas size). Laptop: Intel Core 5 320 with its integrated
Intel Graphics (ANGLE D3D11), Chrome 152 (the desktop app's pane) and 153 (standalone); canvas 2,048 × 1,320.

**Today's frame times, before the lens** (28 September 2026, only this work's empty stubs in place, every shader as at
`d17e6d1`). Run 1 at 22:29–22:31 in a hidden tab of the desktop app's pane, the processor 50–75 % busy with other work;
run 2 at 22:54–22:56, after 27 minutes of continuous measuring, the processor 70–100 % busy. GPU ms, best and median of
the batch medians of each of two measurements; the passes are run 1's.

| View | Run 1 best | Run 1 median | Run 2 best | Run 2 median | Scene pass / Galaxy targets / bloom and tone mapping |
| --- | --- | --- | --- | --- | --- |
| Earth | 5.78, 5.85 | 5.96, 5.91 | 5.79, 6.39 | 6.41, 6.62 | 3.63 / 0.25 / 2.16 |
| Sgr A* at 4,000 au (`framing`) | 5.05, 5.06 | 5.25, 5.26 | 5.41, 5.43 | 5.49, 5.49 | 0.54 / 2.66 / 1.97 |
| 500 au | 5.10, 5.06 | 5.13, 5.09 | 5.07, 5.36 | 5.24, 5.48 | 0.53 / 2.63 / 1.96 |
| 100 M (4.24 au) | 5.03, 5.03 | 5.08, 5.06 | 4.89, 4.92 | 4.95, 5.00 | 0.53 / 2.61 / 1.96 |
| `galactic-centre-orbits` (6,000 au) | 4.91, 4.93 | 4.95, 4.95 | 4.98, 5.06 | 5.83, 5.72 | 0.70 / 2.98 / 2.75 |
| 1 g flight, β 0.33 | 6.63, 6.69 | 6.79, 6.72 | | | 4.64 / 0.26 / 1.89 |
| the same, split view | 7.15, 6.86 | 7.40, 6.93 | | | 5.08 / 0.30 / 2.00 |
| 1 g flight, β 0.77 | 7.78, 7.21 | 8.60, 8.05 | 7.01, 7.13 | 7.24, 7.81 | 5.32 / 0.51 / 2.69 |
| the same, split view (`flight-start-split`) | 8.28, 8.21 | 8.50, 8.50 | 8.91, 9.16 | 9.52, 9.27 | 6.22 / 0.30 / 2.04 |
| 1 g flight, β 0.97 | 6.97, 6.98 | 8.19, 7.10 | | | 4.84 / 0.30 / 1.96 |
| the same, split view | 8.03, 8.09 | 8.18, 8.22 | | | 5.96 / 0.29 / 1.96 |
| arriving, 4,499 au (β 0.127) | 6.41, 6.43 | 6.48, 6.61 | | | 1.67 / 3.27 / 2.34 |
| the same, split view | 6.38, 6.35 | 7.94, 6.42 | | | 1.89 / 2.62 / 1.95 |
| arriving, 4,050 au (β 0.040) (`arriving`) | 6.34, 6.39 | 6.48, 6.47 | 6.33, 6.26 | 6.47, 6.74 | 1.52 / 2.96 / 1.99 |
| the same, split view (`arriving-split`) | 8.03, 8.20 | 8.60, 8.58 | 6.82, 6.56 | 6.91, 6.76 | 2.68 / 3.87 / 3.41 |
| free flight at 0.1c, 500 au (`free-500au`) | 6.74, 6.95 | 8.29, 8.83 | 6.20, 6.36 | 6.76, 7.11 | 1.80 / 3.85 / 3.10 |

Run 3, at 23:11–23:13 (55 minutes of continuous measuring, the processor 92–100 % busy), best / median: 4,000 au 5.95,
5.94 / 5.99, 5.97; 500 au 5.98, 5.99 / 6.17, 6.15; 100 M 6.34, 7.01 / 6.74, 7.17; arriving 7.44, 7.43 / 7.72, 7.92, split
8.59, 8.48 / 8.90, 8.83; the start of the 1 g flight's split view 10.69, 9.62 / 10.76, 10.04; Earth 6.77, 7.40 / 7.50,
7.79; M87 from 284.5 pc (its closest approach before M87* exists; the figure expected for M87* below is estimated from here) at 23:23:
4.34, 4.25 / 4.43, 4.38. Bloom and tone mapping had crept from 2.0 to 2.7–3.7 ms: the start of the slowdown under sustained load that an
earlier measurement on the same laptop saw reach 2.3 times.

Where it is measured makes no difference that shows: Earth, the same code, one after the other at 23:10–23:12, reads
6.74–7.36 best and 6.86–7.94 median in the desktop app's hidden pane, 6.24–7.00 / 6.90–7.14 in a headless Chrome 153 and
6.90–6.97 / 7.10–7.49 in a normal Chrome 153 window (`run-perf.mjs --visible`), three measurements each; at 2,560 × 1,600
a normal window reads 10.81, 11.21 / 11.28, 11.25 (23:28) against the pane's 11.14, 11.43 / 11.31, 11.61 (23:05).

At the panel's full 2,560 × 1,600 (51 % more pixels; 23:04–23:06, the processor 70–100 % busy) the same views cost
60–80 % more, most of it in bloom and tone mapping (4.7–5.5 ms against 2.0–2.6): Earth 11.14, 11.43 best / 11.31, 11.61
median; 4,000 au 8.99, 8.72 / 9.12, 9.13; 500 au 9.05, 8.76 / 9.27, 9.09; 100 M 9.42, 9.67 / 9.74, 9.86; arriving
9.97, 9.70 / 10.39, 9.73, split 11.11, 11.53 / 11.44, 11.66; the start of the 1 g flight's split view 13.50, 13.87 /
13.66, 14.79; free flight at 500 au 10.28, 10.19 / 10.71, 10.82. Back at 2,048 × 1,320 straight after: 4,000 au 5.84 /
6.05, Earth 6.46 / 6.48. At that size nothing is inside 8 ms before the lens adds anything: the pixel-ratio steps of the
GPU-time controller are what hold it.

These are 1.5–2 ms below an earlier measurement's first-hour figures that morning on the same laptop (4,000 au: 7.15–7.19 median),
almost all of it in bloom and tone mapping (2.0 ms here against 3.3 then): the full-resolution passes that the
earlier measurement saw run up to 2.3 times slower under sustained load. The processor's load moved single medians by up to 1.5 ms
(the split view arriving: 8.6 in run 1, 6.8 in run 2), so a part's cost is only ever read from an interleaved A/B, never
from two runs. The first measurements of the day (22:17–22:18, with that earlier measurement's own harness pasted into
the same tab) read 5.7–6.2 best and 5.9–6.6 median at 4,000 au, 6.4–6.5 / 6.5–6.7 at 500 au and at 100 M.

**The start of the 1 g flight's split view** (β 0.77, 0.17 pc from the Sun; over budget
before this work). Interleaved A/B of each piece at 23:16–23:18 (frames 9.6–12 ms, the processor busy), GPU ms
saved by leaving it out: the star field 2.61 (every star is drawn in both halves: the relativistic half always does,
and the classical half has no shorter list between 0.05 and 500 pc from the Sun), the relativistic half's remap pass
1.46, the classical half's sky map 1.33, the constellation figures 0.26, the galaxies 0.24. A control in the same run,
hiding the model's layers, which are not drawn there at all, read 1.06: the noise of that run was about ±1 ms, so only
the first three are clearly real. The two levers of the handover below (the sky map at half resolution, a star list
within 500 pc) are the ones that reach it.

**Shader compiles and start-up.** `npm run check:shaders` (`scripts/check-shaders.mjs`) compiles every material the app
builds, each lensed variant and the background list in a headless Chrome 153 with a fresh profile (ANGLE D3D11), each
shader with a unique marker comment so no cache answers: at the start of this work 26 programs, no errors (the control
shader fails, as it must), the background list 3 programs and 408–664 ms cold (the Galaxy glow 212–220 ms, the Galaxy
particles 167–272, the CMB map 18–23; the star shader 98 ms). It then opens the development server's page in another
fresh profile and reads the first 30 frames' total from `window.__lsStartup` (`src/main.tsx`): 1,266, 1,364, 1,424 and
1,552 ms in four runs (median 1,394 ms; the longest frame 577–715 ms, the first), canvas 1,996 × 1,152, the processor busy
with other work. The script prints each later run against that median. It also checks, from the sources alone, that
far from a hole no lens code runs: every shader that now holds `LENS` blocks must, with them taken out as the
preprocessor does without the define, be its source at `d17e6d1` line for line (whole-frame timing cannot
see 0.01 ms: the star field's whole draw, hidden in an A/B, reads 0.07 ms at Earth and 0.24 ms at 4,000 au with rounds
spread over ±0.5 ms under this load).

**The sky map's handover, 100 to 500 pc from the Sun (the region of Gaia BH1).** The classical view there has been over
the 8 ms budget since the sky from the Sun and the model of the Galaxy were blended (`docs/data/cosmos.md`, Performance:
9.3–10.3 ms warm). Measured on 28 September 2026 (22:34–22:48, the processor 50–100 % busy; GPU ms):

| Where | Distance from the Sun | Sky map's share (1 − w) | Best | Median | Scene pass / Galaxy targets / post |
| --- | --- | --- | --- | --- | --- |
| Pleiades (`go:pleiades`) | 118.6 pc | 0.994 | 8.54, 8.81 | 8.92, 9.00 | 4.16 / 2.79 / 2.12 |
| Betelgeuse | 152.7 pc | 0.952 | 9.31, 9.08 | 9.73, 9.49 | 4.62 / 2.77 / 2.49 |
| Helix Nebula | 196.6 pc | 0.853 | 7.88, 7.87 | 7.89, 8.19 | 3.44 / 2.72 / 2.28 |
| Rigel | 264.6 pc | 0.631 | 8.90, 8.89 | 9.33, 9.30 | 4.52 / 2.88 / 2.70 |
| Orion Nebula | 379.5 pc | 0.218 | 7.78, 7.91 | 8.00, 7.96 | 3.51 / 2.67 / 2.18 |
| Carina Nebula (beyond the handover) | 2,242 pc | 0 | 5.57, 5.49 | 5.66, 5.57 | 0.88 / 2.68 / 2.02 |
| Gaia BH1's place, looking outwards | 480 pc | 0.007 | 8.91, 8.74 | 9.20, 9.20 | 3.42 / 2.91 / 2.81 |
| the same, looking back at the Sun | 480 pc | 0.007 | 9.34, 9.40 | 9.39, 9.70 | 4.40 / 2.86 / 2.84 |
| the same, looking at the Galactic Centre | 480 pc | 0.007 | 8.68, 8.66 | 8.77, 9.02 | 3.35 / 3.00 / 2.77 |

(Gaia BH1's place measured at 23:03 with the processor 73–100 % busy, before its record was drawn; at 2,560 × 1,600
the view back at the Sun reads 14.08–15.19 best, 14.69–15.42 median.)

The cause is that the handover draws both skies in full, plus every star: the sky map from the Sun is a full-screen pass
with four anisotropic texture reads a pixel (2.0–2.9 ms, the most looking along the band), the model's particles and
glow fill the Galaxy targets (2.3–2.9 ms), and between 0.05 and 500 pc from the Sun the star field has no shorter draw
list and draws all 329,770 stars (0.5–1.1 ms, depending on how many are in view). Interleaved A/B of each piece (its
material hidden), GPU ms saved:

| Where | Sky map | Model (particles and glow) | All the stars | Other pieces |
| --- | --- | --- | --- | --- |
| Betelgeuse, 152.7 pc | 2.46 | — | 1.13 | constellations 0.18, planet-host rings 0.31, the Galaxy composite 0.50, nebula cards 0.03 |
| 300 pc, towards the Galactic Centre / towards the Sun | 2.04 / 2.27 | 2.26 / 2.50 | 0.50 / 0.84 | |
| 480 pc (Gaia BH1's distance), outwards / towards the Sun / towards the Galactic Centre | 1.79 / 2.86 / 1.98 | 2.46 / 2.48 / 2.92 | 0 / 1.07 / 0.52 | |

At each end of the handover one of the two skies is drawn in full for a sliver of the picture. Leaving it out there
changes almost nothing (two frames of the same view differ by at most 1/255 on no pixel; below, the largest change of any
channel and the share of pixels changed by more than 2/255, over the whole 2,048 × 1,320 frame):

| Left out | Its share | Largest change | Pixels changed by more than 2/255 |
| --- | --- | --- | --- |
| the sky map at 480 pc (Gaia BH1) | 0.73 % | 1–2 | 0 (four directions) |
| the sky map at 470 pc | 1.6 % | 2–4 | 0–0.20 % |
| the sky map at 460 pc | 2.8 % | 4–7 | 4.6–7.1 % |
| the model at 110 pc | 0.18 % | 1 | 0 |
| the model at 119 pc (the Pleiades) | 0.66 % | 1 | 0 |
| the model at 130 pc | 1.6 % | 3 | 0.001 % |
| the model at 150 pc | 4.3 % | 6 | 0.35–4.6 % |

Proposed, and adopted that evening (`src/scene/MilkyWay.tsx` and `src/scene/GalaxyModel.tsx`, `share >= 0.01`; each
was drawn down to a share of 0.1 %): draw each sky only while its share is at least 1 %. Beyond about 474 pc and within about 124 pc from the Sun this saves the whole of the other sky's pass:
1.8–2.9 ms at Gaia BH1 (480 pc), 2.5–2.9 ms at the Pleiades, for a change of at most 2/255 on no more than about 0.1 % of
the pixels. Between those distances both skies are needed, and the lever is the sky map's own pass: its texels are 10.5′,
4.5 device px, so it can be drawn into a target of half the resolution and filtered up. Tried at run time (the same
material drawn into a 1,024 × 660 half-float target, added by a full-screen quad in its place; interleaved A/B, three
rounds): at Betelgeuse −2.07 ms (10.94 → 8.87), at 300 pc looking at the Galactic Centre −0.61 ms, at Earth −1.29 ms
(7.05 → 5.76), changing 0.0008–0.0012 % of the pixels by more than 2/255 (largest 4–6/255; 22 pixels at Earth by more, on
the frame's edge). It pays everywhere near the Sun, not only in the handover. A draw list for the star field within
500 pc would take up to 1.1 ms more there. Lowering the sky map's anisotropic filtering from 8 to 1 saves 0.17 ms, within
the noise, and changes 0.2 % of the pixels by more than 1/255: not a lever.

**The references for the GPU checks** (`scripts/lens-check/`). `reference.py` writes, from the independent Python
reference in `scripts/schwarzschild/`: `ref/camera-maps.json` (1.06 MB: the 8 fixture cameras' full 48 × 32 maps by the
closed forms at 30 digits, every escaping pixel also traced by numerical integration, which agrees to 1.4 × 10⁻²¹ rad;
per pixel the captured flag, n∞, ln g, the look angle in the lens frame and dΔφ/dθ, and each camera's edge angle) and
`ref/views/` (360 × 240 pictures of the 8 fixture cameras and of 8 cameras of the app's scenes: the shadow from 20 M, the
photon ring from 6 M, the Einstein ring from 100 M, the fall at 10 M, at the horizon and at 0.5 r_s, the fly-by at 0.9c;
the checkerboard sky, ln g in false colour for the eye and as 16-bit grey for the check). `lens-check.js` runs the checks
below in a tab of the development server; `node scripts/lens-check/lens-check.js --self-test` checks its comparisons
against the references themselves and against spoiled copies (36 of 36 pass).

### The finished work (29 September 2026)

All of the work together, measured the next morning on the same laptop, in Chrome 153 of our own
(`scripts/lens-check/run-perf.mjs` and `run-budgets.mjs`: a fresh profile and a fresh page each run, headless unless
said) and in a tab of the desktop app's pane (Chrome 152); canvas 2,048 × 1,320 at pixel ratio 2, no multisampling, the
lens rung pinned at 0 unless said and the GPU-time controller paused; each view entered only once the background
compiles had finished, so that its lens is drawn (`perf.view` waits for them: an earlier run that did not measured
three of the views without their lens). The machine was never quiet: other development work, a file sync and other
programs ran throughout, the processor 20–100 % busy. Three times (07:08–08:10, 08:53–08:57, and from 10:40 until the
end of the morning, 11:20, with no other program using the GPU) the GPU slowed as the earlier measurement saw it after
an hour of measuring: Earth read 11.5–16.6 ms instead of 5.2–5.4, bloom and tone mapping 5.9–8.7 ms instead of
1.6–1.8, in the pane and in fresh headless Chromes alike; the first two times it recovered after 10–20 minutes without
measuring. From 09:14 to about 10:30 a headless Chrome left running by an interrupted check held 84 % of the GPU.
Nothing timed in those windows is used below; the checks of pictures made then do not depend on time.

**The lens checked on the GPU.** `scripts/lens-check/lens-check.js` against the Python references
(`ref/`), in fresh headless Chromes (10:09–11:02; the last run of every check at 10:57–11:02) and first in the pane's tab
(06:33–06:51):

| Check | Result | Target | |
| --- | --- | --- | --- |
| Camera maps (`maps`): the 8 fixture cameras, 48 × 32, through the real `lightspeed_lens` | captured flags: 0 wrong; escape direction as a look angle: along the sweep 0.00025–0.00064 px, across it ≤ 0.00033 px; ln g where light arrives ≤ 6.3 × 10⁻⁷ | 0; 0.006 px; 10⁻⁵ | pass |
| the same, ln g along captured rays | ≤ 2.3 × 10⁻⁷, except 4 pixels of the raindrop at 1 M looking sideways: 3.8 × 10⁻⁵ at ln g 6.2–6.6, where ln g changes by 720 a radian of look angle (towards g → ∞ inside the horizon): the float32 look direction's own error, worth 8 × 10⁻⁵ px; it colours only the flow in front of the shadow | 10⁻⁵, or 0.006 px of look angle | pass (the second reading) |
| Camera maps, the per-vertex path (`lensTest.pointImagesCheck`: a source at infinity in each pixel's reference direction, orders 0–3) | 10,186 pixels; per camera the worst image 0.0005–0.0042 px from its pixel, none over 0.01 | 0.01 px | pass |
| Pictures (`pictures`): 16 views at 360 × 240 (the 8 fixture cameras and 8 of the app's scenes) | pixels away from a class boundary in the reference's class: 99.99–100 %; ln g, mean difference: 0.0003–0.0015 read back as half floats from the lens passes, 0–3 × 10⁻⁵ through the chunk alone (0.0004–0.0076 on the 8-bit canvas, whose steps are 0.0059) | 99.5 %; 0.005 | pass |
| The article's horizon views (below) | 42.1035° and 53.2703° against 42.1034° and 53.2703°; in the app's own fall 42.132° and 53.323° against 42.146° and 53.357° at the r reached | within 0.1° | confirmed |
| Continuity (`continuity`): the lens box's edge at 4,000 au and 1,000 au | steps across it 0.06–0.67 %, none larger than between neighbouring lines by more than the 1 % allowed | 1 % | pass |
| Continuity: the band's edges at 100 M and 20 M (the flow off) | the step across each edge beyond the neighbouring steps: inner 0.39 % and 0.38 %, outer 0.09 % and 0.12 % | 1 % | pass |
| Continuity: lensing off and on at Gaia BH3 (the clock paused, each frame taken once 30 more frames leave it unchanged) | nothing moves outside the point zone (163.9° of sources about the axis); with the stars and glints hidden, nothing outside the diffuse zone (31.6°); outside the diffuse zone the stars move by less than 0.5 px, as designed (1,414 pixels change, by up to 65/255) | nothing outside the lensed region | pass, after one fix (below) |
| Fades (`fades`): the nuclear cluster's fade, 45 pc from Sgr A* (w = 0.5) | the frame's light with w forced to 0 (all glow) over w forced to 1 (full points): 0.9961; as shipped over w = 1: 1.0103 | within 5 % | pass |
| Fades: the flow's point and picture (90–300 au) | the flow's light drawn round the hole (the frame without it, at the same exposure, subtracted) grows 74- to 146-fold in linear light from 225 au (the point) to 90–112 au (the picture), 101- to 110-fold on the screen (three runs); at 200 au, with 7 % of the picture drawn, already 4-fold. That evening, with the handover's κ (§7, a display choice): within a factor 1.35 on the screen from 300 to 60 au at one exposure; 5.8-fold in linear light. `lens-check.js` still reads its paired frames at the exposure each settles to, which the two meters now move between them, so its own figure there is spoiled until it holds them (`skyMeter.hold`) | within a factor 1.5 | fail as first built; on the screen, pass with κ (below) |
| Fades: a ring of light (the Sun from 10,000 au beyond Sgr A*, moved sideways 0–40 km through z = 3.5 → 2.5) | the light drawn over the light `lensBodies` gives the images, inside the crossfade, within 0.19 % of the line through its neighbours outside it | nothing jumps | pass |
| Compiles (`npm run check:shaders`, headless, fresh profile; 06:51 and again at 10:53 after every edit) | 61 programs, no errors, the control fails; 28 lensed programs among them; the background list 17 programs, 6.2 s cold at 06:51 and 25–28 s with the processor busy (08:38, 10:53); the exact orbit program 16.8–37 s, compiled only when first wanted; start-up, first 30 frames: 990 and 996 ms (1,394 ms before this work, median of 4, measured on another day); no lensed program in start-up. Measured again that evening against the commit before this work, interleaved (production builds, fresh profiles, four runs each, the processor 80–100 % busy): a cold start is slower, 1,169 ms of stalled frames in the first 8 s against 836 (the 30th frame 2,069 ms after navigation against 1,811), all of it the Milky Way sky's program, whose lens code sits behind a uniform: 269–481 ms to link against 57–93 (a clean compile 416 against 74). The relativistic view's program, queued behind the lens programs, was ready 48 s after a cold load against 10 s, and a 0.9c flight started 12 s in stalled 0.7–1.0 s on its first frame while it compiled. Fixed that night (the lens code of the Milky Way sky, the CMB map and the remap in `LENS` blocks; the remap compiled before the lens list); `npm run check:shaders` at 22:07 and 22:25, the processor busy: 64 programs, no errors, 30 lensed; the 11 shaders with `LENS` blocks their base sources without them; the Milky Way sky 46 ms cold, the CMB map 13–17 ms (190 before the fix), the remap 89 ms (860), the exact orbit program 1.5 s (16.8–37 s); the background list 20 programs, 9.4–11.2 s; start-up on the development server 948 and 1,050 ms | 0 errors; start-up unchanged | fail as measured that evening; fixed, the production-build comparison not repeated |
| Brightness (`brightness`): the uniform sky (debug sky 4, read back as floats), 20 M and 10 M | at rest: the box and the band uniform to the half-float step (spread 0); the split view moving at 0.3c straight at the hole: the classical half 0, the relativistic half uniform on every ring about the centre to 0.07–0.09 % with no step between rings | 1 % | pass, after one fix to the debug sky (below) |
| Regressions (`regressions`): the sky cube | on the way in from 4,000 au to 20 M: 6 faces and one mipmap pass (7 in all); hovering 600 frames: 0; a fall from 20 M to 4 M, 1,200 frames: 0 | 7 an approach | pass |
| Regressions: the band's early-out compiled into the composite, where no band is drawn (500 au) | 0.14–0.19 ms more than the composite compiled without it (five rounds each, 08:23, 08:49, 10:39; 0.11 at 11:02 with the GPU in its slow state); tested on the chord instead (below), −0.01 ms that evening | 0.1 ms | pass, after the fix (below) |
| Regressions: the lens code in the plain fragment passes far from holes (the sky map, the CMB map, the remap, the Galaxy glow's nuclear march and M87's light, compiled with their gates false in B) | Earth 0.02 ms, in flight at β 0.77 −0.01, 480 pc −0.16 (rounds spread ±0.6: nothing measurable) | 0 | pass |
| Regressions: the plain programs | the 8 shaders with `LENS` blocks are, without them, their `d17e6d1` sources line for line; 9 others changed on purpose (the frustum test, the exposure near a hole, the nuclear glow); that evening 11 shaders with `LENS` blocks (the Milky Way sky, the CMB map and the remap among them), each its base source without them, and 6 others listed for review (the frustum test, the exposure near a hole, the nuclear glow and M87's light) | | pass |

Two fixes came out of these checks. **Lensing switched off and on again while the camera stays put drew the lens as seen
from infinitely far away**: switching it off sets every lens uniform to the identity (`render/lens/lensState.ts`
`noLens`), and switching it back on rebuilt the tables, and wrote their uniforms, only if the hole or the observer had
changed, so the distance, the shadow's edge, the observer's blueshift and the magnification bound stayed at their
"no lens" values until the camera moved. `noLens` now forgets the hole it last built for, so the next lens builds its
tables and writes them again (once, 0.3 ms). Found at Gaia BH3, where the first frame on arrival and the frame after
lensing off and on differed in 30,000 pixels near the hole (the second drawn as if from infinitely far away); they are
now the same to the last bit. The first run of this check (06:48, in the pane) had passed only because both of its frames
came after such a toggle and neither had a real lens. **The uniform debug
sky's moving half**: in debug sky 4 the synthetic targets hold a uniform sky at rest, while the real targets hold the
view's own Doppler-shifted light; the composite recolours target reads by the shift between the source's unlensed
direction and the pixel's, which is right for the real targets and made the moving half of the split view
non-uniform by up to 160 % in the debug sky only. `lensPixel.glsl` now recolours the debug sky's target reads from
rest, as its cube reads are; nothing else changed. With it the relativistic half is uniform on every ring: the lens
conserves surface brightness in both halves.

**The flow's point and picture do not hand over (the fades check).** The point is the hole's glint, drawn with the stars' law,
whose peak is capped (24, then a core at most 1.6 times wider): from 300 au in to 225 au it is already at its cap, and
its drawn light stays the same (8,233 in the scene pass's units). The picture is drawn with the diffuse sky's law, the
√ of the light in a faint star's image at every pixel, which is not additive: the flow's faint light out to 400 M, a
negligible share of its flux, covers thousands of such images and dominates what is drawn. Measured on the scene pass's
own light (before bloom and tone mapping, no exposure) about the hole, in rings: at 170 au (the ring 1.9 px in radius,
74 % still the point) 4 % of the flow's drawn light lies within 2 px, 42 % within 16 px and 98 % within 128 px
(the 400-M edge is at 141 px, and shows as a rim); the total is 18 times the point's at 170 au, 54 times at 140 au and
190 times at 112 au. So as the camera comes in from 225 to 112 au a glow 280 px across appears round the point, and the
exposure meter answers it only once it fills the view. The first check (at most 16 % change) measured the whole frame
with the sky's own light in it, not the flow's light alone, and is withdrawn. That evening the picture was drawn dimmer
across the handover (κ, §7, a display choice): at one exposure the flow's light on the screen then stays within a factor
1.35 from 300 to 60 au; in linear light it grows about 5.8 times.

**The views the Learn article quotes.** Falling from rest far away, the dark patch ahead is arccos(23/31) = 42.10° in
radius at the horizon and 53.27° at 0.5 r_s (two independent derivations; `raindropDarkRadius` in `physics/schwarzschild.ts`). Measured on the app's
own frames at 2,048 × 1,320 (debug sky 1, 0.041° a pixel at the centre): fixture cameras in the raindrop's frame at r = 2
M and 1 M, turned so the edge crosses the middle of the screen, 42.1035° and 53.2703°; the app's own fall into Sgr A* from
20 M, held just inside the horizon (r = 1.995 M) and at r = 0.994 M, looking along the edge by the fall's free look,
42.132° and 53.323° against 42.146° and 53.357° expected at those radii (within a pixel). The pictures check's views at the
horizon and at 0.5 r_s agree with the Python ray tracer on 99.99–100 % of their pixels away from a class boundary. The
renderer is confirmed: the
article may state 84° across at the horizon and 107° across halfway in.

**Frame times of the finished work.** GPU ms, the median of the batch medians of each of two measurements.
Before: 28 September, before the lens was built (run 1, 22:29, and in brackets run 2, 22:54). After: run A 06:56–06:59
(the processor 20–40 % busy), run B 08:40–08:44 (36–40 % busy, and noisier); at 10:38, the GPU quiet again, Earth 5.20
and 500 au 7.38. Rungs 1 and 2 at 08:18. The last column at the panel's full 2,560 × 1,600 (08:45–08:49, busy).

| View | Before | Expected (rung 0) | After, run A | After, run B | Rung 1 | Rung 2 | 2,560 × 1,600 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Earth (no hole) | 5.96, 5.91 | — | 5.15, 5.16 | 5.40, 5.40 | | | 9.28, 10.94 |
| Sgr A* at 4,000 au (`framing`) | 5.25, 5.26 | 7.2 | 5.85, 5.83 | 6.84, 6.36 | | | 8.18, 7.67 |
| 1,000 au | | | 6.78, 6.79 | 7.03, 7.03 | | | |
| 500 au | 5.13, 5.09 | 7.9 | 7.31, 7.32 | 9.41, 7.94 | 7.15 | 6.81 | 9.65, 12.21 |
| 100 M, the flow off | 5.08, 5.06 | 8.5 | 7.96, 7.97 | 7.95, 8.00 | 7.76 | 7.48 | 12.54, 11.90 |
| 100 M, the flow on | | 8.8 | 8.99, 8.99 | 9.36, 7.82 | 7.42 | 8.37 | 12.24, 11.17 |
| 20 M, the flow on | | | 7.44, 7.42 | 7.39, 8.76 | | | |
| `galactic-centre-orbits` (6,000 au) | 4.95, 4.95 | | 5.73, 5.78 | 6.44, 6.71 | | | |
| arriving, 4,050 au (β 0.040) | 6.48, 6.47 | 8.0 | 6.80, 6.68 | 7.75, 7.73 | | | 11.33, 10.50 |
| the same, split view | 8.60, 8.58 (6.91, 6.76) | 9.3; 8.9 at rung 1 | 8.11, 8.21 | 8.03, 8.32 | 6.68 | 5.92 | 12.60, 11.29 |
| free flight at 0.1c, 500 au | 8.29, 8.83 (6.76, 7.11) | 7.8 | 8.65, 8.64 | 9.67, 9.51 | 7.74 | 7.35 | 12.32, 12.06 |
| falling, 6 M (the raindrop 0.58c: the relativistic path) | | 9.4 | 9.56, 9.54 | 11.39, 12.08 | 8.46 | 8.10 | 11.90, 12.47 |
| falling, inside the horizon (1.8 M) | | 8.8 | 6.69, 6.67 | 8.75, 8.54 | | | 8.35, 8.35 |
| Gaia BH1, 10⁶ km from the hole, its companion beyond | 8.8–9.7 (its place, 480 pc, before its record) | 9.0–10.4 | 6.77, 6.76 | 7.06, 8.40 | | | 9.91, 9.87 |
| M87* at 1,000 au | 4.43, 4.38 (M87 from 284.5 pc) | ≈ 6.3 | 5.59, 5.60 | 6.56, 6.52 | | | 7.86, 7.95 |
| the start of the 1 g flight, split (β 0.77, no lens) | 8.50, 8.50 (9.52, 9.27) | 10.5 | 7.53, 7.52 | 8.84, 8.23 | | | 10.47, 13.02 |
| 480 pc from the Sun towards Gaia BH1 (no hole in view) | 9.20 | | 6.98, 6.98 | 8.96, 8.69 | | | |

On the quieter machine (run A) every view is inside 8 ms at rung 0 but four: 100 M with the flow (9.0; 7.7 and 7.8 in
other runs, as the flow's exposure had settled or not: settled, it dims the stars and the frame is cheaper), free flight
at 500 au (8.6), the fall at 6 M (9.5) and the arriving flight's split view (8.2, which the controller starts at rung 1:
6.7). The GPU-time controller steps a rung only while the median is over 8.5 ms: it takes 100 M with the flow and free
flight at 500 au to rung 1 (7.4, 7.7), and the fall at 6 M to rung 1 (8.46), where it stays, over 8 ms: that view needs
rung 2 and a pixel-ratio step to hold 8 (8.10 at rung 2). Busier (run B) the close views read 8–12 ms and the controller's
pixel-ratio steps are what hold them. At 2,560 × 1,600 nothing near a hole is inside 8 ms at rung 0. Against the
expectations set before it was built (the rung-0 column), every view but three is inside them because the day's base is lower: 100 M with
the flow +0.2, free flight at 500 au +0.85, the fall at 6 M +0.16. A normal Chrome window (`run-perf.mjs --visible`) was
not measured again: its one attempt at 08:44 ended when the window closed nine seconds in, and the GPU was not free again
until the end of the morning; the first half's comparison at Earth (pane, headless and window within 0.3 ms) stands.

**After the evening's fixes** (the sky meter, the handover's κ, the programs' compiles; 29 September, 22:50–22:51, a tab
of the desktop app's pane, rung 0, the median of the batch medians of each of two measurements; the GPU had been in its
slow state at 22:08, when Earth read 13.9 ms with bloom and tone mapping at 8.3, and was back by 22:28): Earth 5.51,
5.53 and 5.57, 5.58; 4,000 au 5.80, 5.82 and 5.86, 5.85; 500 au 7.17, 7.22 and 7.19, 7.20; falling at 6 M 8.13, 8.16 and
8.16, 8.19; falling inside the horizon (1.8 M) 6.85, 6.86. Against run A: the fall at 6 M is 1.4 ms cheaper, the rest
within 0.4 ms.

**Each part against its budget.** Whole frames, A/B interleaved three rounds (five where said), the median of
the rounds' differences, headless 07:16–07:22 (the rounds agreed within 0.05 ms for most pieces) unless said
(`scripts/lens-check/budgets.js`; a piece is left out in B by taking its object off every layer, by compiling a shader
without it or by switching it off; the lens box's composite hidden leaves no Galaxy light under the box at all, so its
figure is the composite's whole cost, of which the plain composite it replaces cost 0.2–0.6 ms).

| Part | Budget (ms) | Measured (ms) | |
| --- | --- | --- | --- |
| The lens, and what lensing switches (the lensed stars, the glints, the nuclear points' lens) | | the whole lens: 0.68 (4,000 au), 2.67 (500 au), 3.05 (100 M), 0.90 (arriving), 1.83 (arriving, split), 2.86 (free flight 500 au), 3.52 (6 M), 3.12 (1.8 M), 1.31 (Gaia BH1), 2.95 (M87* 1,000 au) | |
| Lens: the box at 4,000 au | 0.1 | 0.10 | at the limit |
| Lens: the composite over the whole screen | 0.8 at rest, 1.05 in flight (over the plain composite) | whole cost 2.27 (500 au), 2.16 (100 M), 2.2 (free flight, 09:06, noisy): 1.6–2.1 over the plain composite; of it the lens ray about 0.9 and the display law about 0.4, the flow's call 0.01, the rest not resolved (rounds spread ±0.7; 08:30) | **over by 0.8–1.3** |
| Lens: the band | 0.15 | 0.10 (100 M), 0.34 (20 M, a ring 720 px across) | over at 20 M |
| Lens: the band's early-out where no band is drawn | 0 (the regressions check allows 0.1) | 0.14–0.19; the same annulus tested on the chord \|d − c\|² instead of the angle: 0.08 (below), and −0.01 once adopted (that evening) | inside, after the fix |
| Lens: the luminous spheres | 0.05 | 0.01 (Gaia BH1's companion) | inside |
| Lens: sky layers near a stellar hole | 0.1 | the lens's own addition to the sky map near Gaia BH1, measured alone: 0.021; the whole map, still drawn there for its 0.7 % share of the sky: 0.85 at 480 pc from the Sun (08:15) and 1.3–2.0 beside Gaia BH1 (09:04, noisy) | inside (the map's own cost is the handover's, above) |
| Lens: far from holes | 0 | nothing measurable (the regressions check above) | inside |
| Lens: the glow target, the mipmaps, a cube face, the controller's query | 0.05, 0.45, 0.45, 0.01 | not separable by whole frames (the cube's faces are drawn once an approach, as the regressions check found) | |
| Stars: lensed over plain | 0.05 | the whole star draw near Sgr A*: −0.01 (4,000 au), 0.02 (100 M) | inside |
| Galaxy particles: the frustum test | must save 0.5 | saves 0.44 (4,000 au), 0.30–0.45 (500 au), 0.46 (100 M), 0.27 (arriving) | short by 0.05–0.2 |
| Nuclear cluster: its points | 0.2 (×2 in the split view) | 0.71 (4,000 au), 1.59 (500 au), 1.22 (100 M), 1.40 (arriving), 2.39 (split), 1.56 (6 M); at 500 au (08:30) 1.24 in all, of it the lens 0.52 (the same points compiled without it) and the sprites' fill 0.35 (clamped to 1 px) | **over, 4–8×** |
| Nuclear cluster: its glow | 0.25 (×2 split) | 0.13–0.27 | inside |
| Accretion flow | 0.3 rebuilt, 0.05 reads | the flow with the camera still (the map no longer rebuilt) and every star hidden in both halves, so that the exposure it sets cannot change their cost: 0.19 (100 M), 0.14 (20 M); with the stars in, the frame is 0.44–1.08 cheaper with the flow on (its exposure dims them) | **reads over, 3–4×** |
| Bodies: glints and rings | 0.02 | glints 0.00 (100 M); the ring sprite not isolated | inside |
| Bodies, processor: `lensBodies` | 0.5 worst case | measured as the app calls it, `updateDerived` (which puts every body's flat magnitude back first) with lensing on against off, interleaved, 9 batches of 40 calls (10:06, the processor 100 % busy), best and median: 0.11 and 0.23 at 4,000 au (4 bodies lensed), 0.96–1.12 and 1.17–1.27 at 100 M, 20 M and 6 M (402 bodies), 0.14 and 0.18 at Gaia BH1 (22) | **over, 2×, under load** |
| Lens, processor: `updateLens` (no table build) | 0.1 | 0.0005–0.023; 0.06 at Gaia BH1 | inside |
| Gravity and falls, processor: `updateGravity` + `updateFall` | 0.05 | 0–0.0025 | inside |

The totals stay near the expected ones because the day's base is 1.5–2 ms lower than the earlier measurement's (above): the
lens box's composite and the nuclear cluster's points cost about 2 ms more between them than budgeted at 500 au and
100 M, and the controller's rungs and the frustum test absorb part of it.

The band's early-out costs what it does because the composite works out the angle from the shadow's centre, an
arctangent of two lengths, at every pixel of the screen, whether or not a band is drawn (the compiler does not skip it
behind the uniform's test; nesting the test, or writing nothing instead of discarding, did not help in repeated runs).
The same annulus is the set of pixels whose chord |d − c|² to the edge's centre lies between 4 sin²((R − w)/2) and
4 sin²((R + w)/2), the chord growing with the angle: tested that way (the bounds from the uniforms), five interleaved
rounds against the composite without the band's code at 10:39 on a quiet GPU cost 0.08 ms (rounds 0.06–0.09), against
0.17–0.18 for the angle in the same minutes. Later repeats ran in the GPU's slow state and were inconclusive. It was
adopted that evening (`lens.glsl`, the bounds `uLensBandChord2` worked out in float64 in `lensState.ts`), and the
early-out then measured −0.01 ms against the composite without it.

**Bloom's luminance pass at half resolution** (`quality.bloomHalfLuminance`, the rule chosen: on only if it saves at least
0.4 ms and changes at most 0.1 % of the pixels by more than 2/255). Measured in five standard views (headless 08:17–08:18,
A/B three rounds; the pixels with the clock paused, two frames of each setting identical to 1/255):

| View | Saves (ms) | Pixels changed by more than 2/255 | Largest change |
| --- | --- | --- | --- |
| Earth | 0.01 | 0.0011 % | 28/255 |
| Sgr A* at 4,000 au | 0.22 | 5.87 % | 16/255 |
| 100 M, the flow on | 0.54 (rounds −0.61, 0.95, 0.54) | 0.016 % | 16/255 |
| arriving at 4,050 au | 0.26 | 6.67 % | 13/255 |
| the start of the 1 g flight, split | 0.15 | 0 | 0 |

It saves under 0.4 ms in four views of five and changes 6–7 % of the pixels near Sgr A* (the halos of the nuclear
cluster's thousands of bright stars move): it stays off.

**The start of the 1 g flight's split view** (over budget before this work, above). Before this work 8.50 ms (run 1) and
9.52 (run 2), the earlier measurement's 10.85; now 7.52–7.53 on the quieter machine and 8.23–8.84 busier, the scene pass 5.58
against 6.22: inside 8 ms when the machine is quiet, over it under load, for reasons outside the lens (the star field
draws all its stars in both halves; the remap and the sky map, above).

**The sky near Sgr A*.** Mean luminance over the whole frame, in the scene pass's own light (before bloom and tone
mapping) and on the screen (0–1), the exposure 0 in each (09:53): Earth 0.047 and 0.11; 4,000 au from Sgr A* 1.46 and
0.81 (31 times Earth's light); 1,000 au 1.42 and 0.81; the scene `sky-from:sgr-a-star` (10,000 au, the flow off) 8.1 and
0.99; 45 pc out 0.59 and 0.70. The nuclear cluster and disc give the sky there a glow of μ_V 13.7 mag/arcsec² at 4,000
au and points whose flux is that of a sky of μ_V 7.7 (§6); drawn with the eye's √ law at the fixed exposure used
everywhere else, that is nearly white, and the stars and the Sun's ring of `sky-from:sgr-a-star` (V −4.3, 6 px) are
lost in it. The view's exposure then adapted only to motion, to the observer's gravitational blueshift and to the flow's
glare. That evening the sky's averaging meter was added (`render/lens/skyMeter.ts`, §9, a display choice): measured on
the screen on 29 September at 22:10–22:30 (0–255, the flow off unless said), the mean is 128 at 4,000 au (ln E −3.7), 116
at 20 M (`sgr-a-star-shadow`, the shadow black; ln E −4.0), 174 at 100 M (`sgr-a-star-einstein-ring`, where bloom from the
crowded edge lifts the 5.9°-wide shadow's centre to 82 although the scene pass draws it exactly black) and 131 in
`sky-from:sgr-a-star` (ln E −7.4), where the Sun's ring shows at 135 against the sky's 130.

## 12. The thin disc

**What is drawn, and where.** Only Cygnus X-1 is drawn with an accretion disc: it is a persistent X-ray binary whose
disc shines all the time (its thermal disc is measured at about 2 % of its Eddington luminosity in its softer states).
The other black holes get none, each for its own reason:

| Black hole | Disc | Why |
| --- | --- | --- |
| Cygnus X-1 | **drawn** (a model, label 25) | a persistent disc, its luminosity measured (Zhao et al. 2021) |
| V404 Cygni, A0620-00, XTE J1118+480, MAXI J1820+070 | not drawn (label 16) | quiet between outbursts: their discs are cool (a few thousand kelvin), cut off far from the hole (the inner flow a hot, thin gas out to ~10³–10⁴ r_s in the models of their quiescent spectra) and not in a steady state, so no thin-disc model applies and neither the truncation radius nor the accretion rate is measured well enough to draw one honestly |
| Gaia BH1–3, OGLE-2011-BLG-0462 | none | dormant: nothing is falling in |
| LMC X-1, LMC X-3, M33 X-7, GRS 1915+105 | **drawn** (models of a typical state, label 27) | persistent, or bright for 26 years; their thermal discs measured by continuum fitting (§13) |
| the second table's transients (GRO J1655−40, GX 339−4, …) | not drawn (label 16) | quiet between outbursts, as V404 Cygni |
| the galaxies' black holes | none | not thin discs of the kind modelled here, or not measured |
| Sgr A*, M87* | the hot flow (§7) for Sgr A*; nothing for M87* | not thin discs |

**The model** (`src/physics/thinDisk.ts`). A geometrically thin, optically thick Novikov–Thorne disc (Novikov & Thorne
1973) round a hole that does not spin, in its equatorial plane, from the innermost stable circular orbit (6 GM/c²) out,
its gas on circular Keplerian orbits. Each ring is a blackbody at T = (F/σ)^(1/4), with the flux of Page & Thorne
(1974) in the closed form for no spin (Luminet 1979, eq. 15):

F(r) = (3GMṀ / 8π r_g³) f(r),  f(r) = [√r − √6 + (√3/2) ln((√r + √3)(√6 − √3) / ((√r − √3)(√6 + √3)))] / ((r − 3) r^(5/2)),

r in units of r_g = GM/c²: zero at the inner edge (no torque there), peaking at 9.5509 M, 1/r³ far out. The real hole
spins fast (claimed above 0.9985, label 1): its disc would reach in to about 1.2 GM/c², five times closer, and be
hotter; the app is Schwarzschild only, and the card says so in one line.

**Its numbers** (`blackholes.json`, the hole's `disk` block; derived in `src/sim/blackholes/records.ts diskInfo`):

| Quantity | Value | Source |
| --- | --- | --- |
| Mass | 21.2 M☉ (GM/c² = 31.3 km) | Miller-Jones et al. 2021 |
| Luminosity | 0.02 L_Edd (0.02–0.03 over six spectra), L_Edd = 2.8 × 10³⁹ erg/s: L = 5.6 × 10³⁷ erg/s | Zhao et al. 2021, Table 2 |
| Accretion rate | Ṁ = L / (η c²) = 1.089 × 10¹⁸ g/s, with the efficiency of a disc of no spin, η = 1 − √(8/9) = 5.72 % (the luminosity is what is measured; the spinning hole of the fit needs less, 0.17–0.23 × 10¹⁸ g/s) | derived |
| Temperatures | T* = 2.142 × 10⁷ K; the hottest ring 2.216 × 10⁶ K (0.19 keV) at 9.55 M | derived |
| Inner and outer edge | 6 M (188 km); 10¹¹ cm = 31,900 M, a model choice: the scale its wind-fed flow is modelled out to (Palit, Janiuk & Czerny 2020), within the tidal limit for a disc in a close binary (Paczyński 1977) | as said |
| Plane | the binary's orbit (its axis p̂ × q̂ of the drawn orbit, `normalWorld`), so 27.1° from our line of sight (Miller-Jones et al.: 27.5 +0.8 −0.6° from the light curve; the drawn orbit's 152.9° astrometric inclination); its orientation on the sky follows the orbit's assumed Ω (label 15); the gas turns with the orbit | Miller-Jones et al. 2021 |
| Turning | the inner edge goes round in 9.64 ms; drawn 1,000 times slower (9.6 s) | the record's `slowdown` |

**The light.** A blackbody of temperature T seen with the frequency shift g = ν_obs/ν_em is a blackbody of temperature
g T (I_ν/ν³ is conserved along a ray), so each pixel is a blackbody at g T(r): g = √(1 − 3/r) / (1 − Ω L_z) for gas on
a circular orbit (Ω = r^(−3/2), L_z the photon's angular momentum about the disc's axis per unit energy) seen from far
away, times the ray's own shift to the camera (the hovering observer's blueshift, the hole frame's boost, the view's
Doppler factor: as the sky's light in `lensPixel.glsl`). Its colour is always the visible colour of that blackbody (the
app's blackbody table); its brightness is drawn one of two ways, chosen on the card:

- **All its light** (the default): σ(g T)⁴, the bolometric brightness (I ∝ g⁴), mostly X-rays: what Luminet's and the
  published pictures of such discs show. The approaching side outshines the receding one by g⁴ (several times at our
  27°, tens of times edge-on), and the disc fades from its hot inner rings outward as r⁻³.
- **Visible light**: its visible luminance, as a surface of the Sun's calibration (radiance 8 is a 5,772 K surface).
  Every ring within thousands of M is millions of kelvin hot, so its visible light is the Rayleigh–Jeans tail: one
  pale blue everywhere, brighter only as g T, and the disc looks nearly even. That is what an eye would see.

**The images** (`src/render/shaders/diskLookup.glsl`, called by the lens box's composite, the photon ring's band and the
lensed spheres). Every pixel's backward ray already has its look angle and gap to the shadow's edge; the disc's chunk
finds where it crosses the disc's plane. A ray stays in a plane through the hole, whose orbit u(ψ) = 1/r is a function of
its impact parameter b alone if ψ is the sweep from infinity along its incoming leg; so one table of every orbit (512
rows in b, crowding at b_c on both sides, out to b = 10⁵ M; 512 columns uniform in ψ to the periapsis or the horizon;
v = b u, 1 MB of float32, made once by RK4 from a point known in closed form, the periapsis or the crossing of the
photon sphere, within 3 × 10⁻⁸ in u of Carlson's sweeps) serves every camera. The camera's place on each orbit (ψ_c,
512 closed-form sweeps, 0.08 ms) is rebuilt when its r changes. The ray reaches the disc's plane after the sweeps
Δ_k = Δ_0 + kπ (Δ_0 where the ray's plane cuts the disc's): k = 0 is the direct image, k = 1 the disc's far side bent up
over the shadow and under it (and its underside inside its inner edge seen from above), k = 2 a thin ring at the photon
ring. A crossing before the ray's periapsis is read from the camera's place on its orbit, one past it from the far end
(Δφ − Δ_k, Δφ the lens's own sweep to infinity: anchored at the far end throughout, the near side's direct image was
2–5 × 10⁻⁴ out in r; at the camera throughout, a ray near 90° from the hole was 9 % out past its periapsis, where the
camera sits at the periapsis and the sweep to it has a square root), on the two rows either side, linear in b. The disc
is opaque and seen from both faces: the first crossing between its edges ends the ray, and hides the sky behind it
(and the companion star in the lensed spheres' pass). The band supersamples the thin rings as it does the sky's.
Beyond the diffuse zone the rays are still traced (the table costs the same); while a disc is drawn the lens box
covers its whole image (`lensState.ts lensBoxExtra`).

**The swirl** (illustrative, label 25): two layers of a tiling noise in (ln r, φ − Ω τ), streaked along the orbit,
sheared by the gas's own differential rotation, each restarted every two inner orbits and crossfaded with the other so
the shear never winds up, its light varied by about ±20 % (±40 % on the screen with all its light, after γ); faded out where its streaks would be under a few pixels,
and not drawn on the thinnest ring. The light-travel time across the disc is left out of it. Its clock is real time
slowed 1,000 times, at the hovering camera's own rate (faster by 1/√(1 − 2M/r)), and stands still with the simulation.

**Exposure and contrast** (`src/render/disk/diskMap.ts`, display choices, label 25). The disc is metered on its peak:
the ring it resolves best (the hottest, at 9.55 M, or the innermost ring 10 px across from farther away) on its
approaching side, the gas coming towards the camera as nearly as the tilt allows (L_z = sin i · r/√(1 − 2/r)).

- **All its light** is drawn on the disc's own scale: the peak's (g T)⁴ at 4 display units (the view's tone mapping,
  AgX, reaches white at 16), and every other pixel as its light relative to the peak to the power **γ = 2**. AgX is
  logarithmic over 16½ stops: a ring five stops below the peak still shows at a fifth of white, so drawn linearly the
  r⁻³ falloff and the approaching side's lead were flattened into an evenly lit plate reaching the frame's edge (the
  first version, measured on its pictures). With γ = 2 the inner tens of M blaze, the disc is near black by about
  100 M, and the g⁴ asymmetry survives the tone curve (at 30 px tilts and below the approaching side clearly outshines
  the receding one). The view keeps the exposure the sky and the stars call for, so dark space and stars show round the
  disc (a camera exposed for the disc's visible glare would show none); the companion star, drawn through the lens
  beside it, keeps its brightness relative to the disc's visible light (`uDiskStarLnE`).
- **Visible light** is drawn linearly, as a surface of the Sun's calibration, its peak at 1 display unit, and the view's
  exposure follows it (about e^−11: the stars drop out, as in a photograph), weighted by the disc's share of the view.

The disc's share of the view (its outer edge from 3 to 30 px in radius) fades it in; a disc a few pixels across never
shows as a white blot.

**The 1.3 mm view as "Radio eyes."** The View menu's **Radio eyes** ("Radio light (1.3 mm), like the EHT: the model of
Sgr A*'s gas in false colour") switches the flow to its 1.3 mm view (§7, label 13), the same as the card's band switch;
turning it on brings the flow back if it was off. Starlight does not show at 1.3 mm, so the view then stops down to at
least e^−20 (`flowMap.ts FLOW_MM_LN_EXPOSURE`): the false-colour ring shows against a dark sky even for a camera that
arrived with Radio eyes on and never metered the visible flow (its pictures were washed in the sky's glow before).
**M87\* is not given one**: the flow model is Sgr A*'s own fit (its densities, temperatures and field fitted to Sgr
A*'s spectrum, §7); M87*'s ring is made by a different flow (a magnetically arrested, jet-launching one, fitted
nowhere in the app), so any 1.3 mm picture of it would not be supported by the model.

**Checked** (`src/physics/thinDisk.test.ts`, `src/render/disk/diskMap.test.ts`, `src/content/blackHoleScenes.test.ts`;
the reference is `scripts/thin-disk/disk_ref.py`, `npm run data:disk-fixtures`, about 90 s, which writes
`src/physics/__fixtures__/thinDisk.json`):

| Check | Result (tolerance) |
| --- | --- |
| The reference's two methods for 198 rays (cameras at 30, 100 and 1,000 M; tilts of 27.1°, 60° and 80°; inside and outside the shadow, orders 0–2: 287 crossings): the sweep by tanh-sinh quadrature and root-finding in 30 digits, against the geodesic integrated in three dimensions with events on the plane | 1.9 × 10⁻¹⁰ in r, 1.7 × 10⁻¹⁰ in g (10⁻⁹) |
| The app's crossings against it: every crossing outside the photon sphere found, in order, with its swept angle, place and L_z; on the disc (103 crossings) | r within 8.9 × 10⁻⁵ (median 2.4 × 10⁻⁶; 10⁻⁴), g within 6.3 × 10⁻⁶ (3 × 10⁻⁵) |
| The orbit table against Carlson's closed forms | within 3 × 10⁻⁸ in u (10⁻⁷) |
| The flux's closed form against the Page–Thorne integral (quadrature in 30 digits) at six radii; its peak | to 17 digits; 9.550928 M |
| The shift at known points: face-on (√(1 − 3/r)); light leaving the inner edge along and against the gas (√2 and √2/3) | 10⁻¹³ |
| The disc's numbers, uniforms, spot exposure, box, share, clock and noise | `diskMap.test.ts` |
| The scenes: camera, tilt, views turned on and put back | `blackHoleScenes.test.ts` |

**Cost** (target laptop, 2,048 × 1,104 at pixel ratio 2, rung 0, whole-frame A/B medians of 4–5 interleaved rounds,
the disc on against off in the same view; other work on the machine, its noisiest rounds left aside): `cyg-x-1-disk`
(60 M, 8° up) 0.55–0.83 ms, `cyg-x-1-from-above` 0.2–0.4 ms, 30 M from the hole 6° above the plane 0.73 ms, 15 M at 3°
(the shadow filling the view, the band at its widest) 0.90 ms; scaled to 2,048 × 1,320 about 1.1 ms at most (budget
1.5). The processor: the orbit table once, 19 ms; the camera's rows
0.08 ms when r changes. Compiles (`npm run check:shaders`, cold, the machine busy, the same hour against the shaders
before the disc): the composite 2.3–2.4 s against 1.2, the band 8.0 s against 3.4, the spheres 1.0 against 0.65; the
background list 33.8 s against 29.8 (with a quieter machine earlier, the band 3.5–4.1 s). The band's sub-ray loop has
a bound the compiler cannot see, so Direct3D's compiler keeps it a loop rather than inlining the lens and the disc
eight times (unrolled it took longer still). The lens waits for these near a hole, in the background, as before.

**Not drawn, or simplified** (the data sheet's note): the corona that makes its hard X-rays; the hardening of the
disc's spectrum (its colour temperature about 1.6 times its effective one in X-rays; the visible light of a
diluted blackbody would be about four times fainter); X-ray heating of the outer disc; the disc's thickness (it is drawn
infinitely thin, so seen exactly edge-on it vanishes); its own gravity; the light-travel time across it; the jet and the
companion's wind; and stars drawn as points behind it, which it does not hide (at the disc's exposure they are far
below it). From far away, where its outer edge is under 3 px, it is not drawn at all: its light there is outshone by
its companion's and is not added to the hole's point.

## 13. The second table: more X-ray binaries, the Magellanic Clouds and M33, and the galaxies' black holes

**What.** Twenty-nine more black holes, from `scripts/blackholes-more.mjs` (the second table, which
`scripts/build-blackholes.mjs` imports and writes into the same `blackholes.json`; the first table's eleven are
unchanged to the byte, and a rebuild reproduces them):

- **Thirteen X-ray binaries of the Milky Way with dynamically measured masses** that the first table did not have: the
  confirmed black holes of BlackCAT (Corral-Santana et al. 2016, A&A 587, A61; its VizieR table was the guide, the
  values are the original papers' and newer ones'), less the four the first table has and GS 1354−64 (left out, below).
- **Three persistent X-ray binaries in other galaxies**: LMC X-1 and LMC X-3 in the Large Magellanic Cloud, M33 X-7 in
  the Triangulum Galaxy.
- **Thirteen supermassive black holes** at the centres of nearby galaxies the app has: ten whose galaxies it
  registers with the others (M31*, M32's, M81*, Centaurus A's, the Sombrero's, NGC 404's, and those of M84, M60, M49
  and NGC 4889, galaxies of `public/data/more-galaxies.json.gz`) and three at the centres of galaxies only in the NGC
  catalogue, which the app registers on demand (M106, M105, the Spindle Galaxy). M87* and Sgr A* are the first
  table's and are not repeated.

Every number was read from its paper (the arXiv full text, the journal's table, or VizieR) and carries the key of that
paper; the research notes recorded where each was read (abstract, Table N, Sect. N). Where a paper gives a 95 %
interval, the 1σ drawn and shown is half of it over 1.96 and the note says so (GRO J1655−40).

**The binaries** (masses M☉; the companion's radius is its Roche lobe's, Eggleton 1983, where none is published, and
its temperature, where none is measured, that of a dwarf of its type from Pecaut & Mamajek 2013, said on its card):

| Id (name) | Black hole | Distance (method in the record) | Companion | Orbit | Phase | Disc |
| --- | --- | --- | --- | --- | --- | --- |
| `grs-1915` (GRS 1915+105) | 12.4 +2.0 −1.8 (Reid et al. 2014) | 8,600 +2,000 −1,600 pc, radio parallax (Reid et al. 2014) | K III, 0.47 M☉, 16.0 R☉ (lobe), 4,300 K (estimated) | 33.85 d, i = 60° (its jet) | assumed | **20 %** |
| `gro-j1655` (GRO J1655−40) | 6.3 ± 0.26 (Greene et al. 2001; ± 0.5 at 95 %) | 3,270 +560 −410 pc, Gaia DR3 (Bailer-Jones et al. 2021) | F6 IV, 2.4 M☉, 5.0 R☉, 6,100 K | 2.6212 d, 70.2° | T0 JD 2453110.5637 | — |
| `gx-339-4` (GX 339−4) | 5.9, the middle of 2.3–9.5 (Heida et al. 2017) | 10,000 pc, the middle of 8–12 kpc (Zdziarski et al. 2019) | K1–K2 IV, 0.95 M☉ (middle of 0.5–1.4), 2.76 R☉ (lobe), 4,700 K (middle) | 1.7587 d, 57.5° (middle of 37–78°) | T0 MJD 57529.397 | — |
| `4u-1543` (4U 1543−475) | 9.4 ± 1.0 (Orosz 2003) | 7,500 ± 500 pc, from its donor (Jonker & Nelemans 2004) | A2 V, 2.45 M☉, 2.84 R☉, 9,000 K | 1.116407 d, 20.7° | T0 HJD 2450629.37 | — |
| `xte-j1550` (XTE J1550−564) | 9.10 ± 0.61 (Orosz et al. 2011) | 4,380 +580 −410 pc, its dynamical model | K3 III, 0.30 M☉, 1.75 R☉, 4,450 K | 1.5420333 d, 74.69° | T0 HJD 2452053.9306 | — |
| `v4641-sgr` (V4641 Sgr) | 6.4 ± 0.6 (MacDonald et al. 2014) | 6,200 ± 700 pc, its light-curve model | B9 III, 2.9 M☉, 5.3 R☉, 10,250 K | 2.8173 d, 72.3° | T0 HJD 2451441.8187 | — |
| `gs-1124` (Nova Muscae 1991) | 11.0 +2.1 −1.4 (Wu et al. 2016) | 4,950 +690 −650 pc, its light-curve model | K5 V, 0.89 M☉, 1.06 R☉, 4,400 K | 0.43260249 d, 43.2° | T0 HJD 2454946.7946 | — |
| `grs-1009` (Nova Velorum 1993) | 4.4, for a normal donor (Filippenko et al. 1999) | 5,700 ± 700 pc, from its donor | K7–M0 V, 0.6 M☉ (assumed), 0.71 R☉ (lobe), 3,990 K (estimated) | 0.285206 d, 78° (for that donor) | T0 HJD 2450834.9948 | — |
| `gs-2000` (GS 2000+25) | 7.82 ± 0.89 (Casares et al. 2022) | 2,700 ± 700 pc, from its donor | K5 V, 0.33 M☉ (q M), 0.67 R☉ (lobe), 4,440 K (estimated) | 0.3440915 d, 67.5° | T0 HJD 2449920.8549 | — |
| `xte-j1650` (XTE J1650−500) | 5.0, the middle of its limits 2.73–7.3 (Orosz et al. 2004) | 2,600 ± 700 pc, its change of state (Homan et al. 2006) | K4 V, 0.13 M☉ (q M), 0.47 R☉ (lobe), 4,600 K (estimated) | 0.3205 d, 56° (what that mass needs) | T0 HJD 2452436.51988 | — |
| `h1705` (H1705−250) | 6.4 ± 1.5 (Dashwood Brown et al. 2024) | 8,600 ± 2,000 pc, from its donor | K5 V, 0.34 M☉, 0.88 R☉ (lobe), 4,440 K (estimated) | 0.5228 d, 70 ± 10° | T0 HJD 2450212.98 | — |
| `gro-j0422` (GRO J0422+32) | 2.7 +0.7 −0.5 (Casares et al. 2022) | 2,490 ± 300 pc, from its donor (Gelino & Harrison 2003) | M1 V, 0.31 M☉ (q M), 0.47 R☉ (lobe), 3,900 K (adopted) | 0.21216 d, 55.6° | T0 HJD 2450274.4156 | — |
| `xte-j1859` (XTE J1859+226) | 7.8 ± 1.9 (Yanes-Rizo et al. 2022) | 6,300 ± 1,700 pc, its outburst's disc (Hynes et al. 2002) | K5–K7 V, 0.55 M☉, 0.68 R☉ (lobe), 4,300 K (estimated) | 0.276 d, 66.6° | T0 HJD 2457957.593 | — |
| `lmc-x-1` (LMC X-1) | 10.91 ± 1.41 (Orosz et al. 2009) | 49,590 ± 550 pc, the Cloud's (Pietrzyński et al. 2019) | O7–O8 III, 31.79 M☉, 17.0 R☉, 33,200 K, log L 5.50 | 3.90917 d, 36.38° | T0 HJD 2453391.3436 | **16 %** |
| `lmc-x-3` (LMC X-3) | 6.98 ± 0.56 (Orosz et al. 2014) | 49,590 ± 550 pc, the Cloud's | B3–B5 V, 3.63 M☉, 4.25 R☉, 15,250 K | 1.7048089 d, 69.24° | T0 HJD 2454454.9964 (Song et al. 2010) | **10 %** |
| `m33-x-7` (M33 X-7) | 15.65 ± 1.45 (Orosz et al. 2007) | 840,000 ± 20,000 pc, M33's (Orosz et al. 2007) | O7–O8 III, 70.0 M☉, 19.6 R☉, 35,000 K, log L 5.72 | 3.453014 d, 74.6° | mid-eclipse HJD 2453967.157 | **9 %** |

Contested values are on each card's mass line and data sheet: GRS 1915+105 10.1 ± 0.6 before its parallax; GRO
J1655−40 5.4 to 7.02 in other analyses, and a distance below 1.7 kpc argued; GX 339−4 only ranges, its spin 0.93 from
its iron line but model-dependent; 4U 1543−475's distance 5.2 kpc from Gaia; XTE J1550−564 8.9–13.9 across models;
V4641 Sgr 9.61 earlier and 4.7 kpc from Gaia; Nova Muscae 1991 6.95 earlier; Nova Velorum 1993's mass ratio and tilt;
GRO J0422+32 3.97 ± 0.95 at 45°; XTE J1859+226's spin 0.149 or 0.986; M33 X-7 11.4 M☉ with a 38 M☉ companion
(Ramachandran et al. 2022). Spins where estimated are on the card ("drawn without").

**Phase.** Each ephemeris T0 used is the donor's inferior conjunction (the donor nearest to us, its radial velocity
crossing from approach to recession), as in §5: where the paper's T0 is the donor's greatest recession (4U 1543−475,
V4641 Sgr, Nova Velorum 1993, XTE J1650−500) the build is given that time less a quarter period, and M33 X-7's is the
mid-eclipse of its X-rays (the O star in front). GRS 1915+105's paper calls its T0 only "donor star conjunction", so its
phase is **assumed** (`phaseAssumed`): the donor is put nearest to us at J2000.0, the card says so ("its companion's place
is illustrative") and the position note ends with it; the test checks the donor in front there. With a period's
uncertainty carried over the light-time, almost every new binary's present phase is illustrative anyway, and its
position note says so as in §5.

**Places and motions.** Positions are SIMBAD's (retrieved 9 October 2026; Gaia DR3 positions at J2000 where the star is
in Gaia), proper motions Gaia DR3's where Gaia measured them; where it did not (GRS 1915+105, Nova Velorum 1993,
GS 2000+25, XTE J1650−500, GRO J0422+32, XTE J1859+226, M33 X-7) the motion across the sky is taken as none and the
data sheet says so, and the systemic velocity is the paper's (taken as none for XTE J1650−500 and GRO J0422+32, whose
papers give none). LMC X-1 and LMC X-3 are placed at the Cloud's distance, 49.59 kpc (Pietrzyński et al. 2019, as the
app places the Cloud; their papers adopt 48.1 kpc), the Cloud's depth and tilt left out; M33 X-7 at M33's 840 kpc. A
binary in another galaxy carries its galaxy (`host`, `hostName`): its record's `blackHole.hostGalaxy`, its card's
"in the Large Magellanic Cloud", and "Where to?" lists it with the galaxies. No new companion is a star of the catalogue
(their Gaia DR3 ids are in none of the catalogue's source lists), so none needs a pinned index.

**Discs.** Four systems get a thin Novikov–Thorne disc as Cygnus X-1 has (§12), in the binary's orbital plane, each
labelled a model of a **typical state, not live**:

| Hole | L / L_Edd drawn | Source | Why a disc |
| --- | --- | --- | --- |
| LMC X-1 | 0.16 (0.145–0.171 over 18 spectra) | Gou et al. 2009, Sect. 5.1, Table 2 | persistent since 1969, its disc thermal and steady |
| LMC X-3 | 0.10, a choice inside the 5–30 % of the thermal-state spectra fitted | Steiner et al. 2014, Sect. 2 | persistent; its inner edge constant over 26 years (Steiner et al. 2010) |
| M33 X-7 | 0.09 (0.07–0.11 over 15 spectra) | Liu et al. 2008, Sect. 3, Table 1 | persistent, eclipsing |
| GRS 1915+105 | 0.20, a choice below the 30 % limit of the thin-disc spectra fitted | McClintock et al. 2006, Sect. 5 | bright from August 1992 to July 2018; faint and hidden by its own gas since 2019 (Motta et al. 2021; Miller et al. 2020): the drawn disc is its bright years' |

L_Edd is each paper's own, 1.3 × 10³⁸ (M/M☉) erg/s. The outer edge is 10¹¹ cm, as Cygnus X-1's (a model choice; inside
each hole's Roche lobe, 4.0–46.5 × 10¹¹ cm, which the build checks; beyond a few hundred GM/c² the disc is too faint to
show at its contrast). GX 339−4 and the other transients get none: between outbursts their discs are cool and truncated
(§12), and GX 339−4's mass and tilt are only ranges. The card's spin line says where a fast spin is estimated (LMC X-1
0.92, M33 X-7 0.84, GRS 1915+105 above 0.98): the disc would then reach closer in.

**The galaxies' black holes.** A mass from motions seen on the sky (stars, gas, masers) grows in proportion to the
distance assumed, so each published mass (`massPublished`, at its paper's or Kormendy & Ho's distance) is scaled by the
build to the distance the app places the galaxy at (`mass`, whose note gives both); the 1σ ranges are Kormendy & Ho's
(their Tables 2 and 3) where the mass is theirs:

| Id (name) | Galaxy | Published | Drawn (M☉, at the app's distance) | Weighed by |
| --- | --- | --- | --- | --- |
| `m31-star` (M31*) | Andromeda Galaxy | 1.43 (1.12–2.34) × 10⁸ at 0.774 Mpc (K&H, Bender et al. 2005) | 1.41 × 10⁸ (0.761 Mpc) | its stars' motions |
| `m32-bh` | M32 | 2.45 (1.43–3.46) × 10⁶ at 0.805 Mpc (K&H, van den Bosch & de Zeeuw 2010) | 2.31 × 10⁶ | its stars' motions |
| `m81-star` (M81*) | Bode's Galaxy | 6.5 (5–9) × 10⁷ at 3.604 Mpc (K&H, stars and gas averaged) | 6.54 × 10⁷ | its stars and its gas |
| `cen-a-bh` | Centaurus A | 5.69 (4.65–6.73) × 10⁷ at 3.62 Mpc (K&H, Cappellari et al. 2009) | 5.70 × 10⁷ | its stars' motions |
| `m104-bh` | Sombrero Galaxy | 6.65 (6.24–7.05) × 10⁸ at 9.87 Mpc (K&H, Jardel et al. 2011) | 6.40 × 10⁸ | its stars' motions |
| `ngc-404-bh` | NGC 404 | 5.5 +1.6 −0.8 × 10⁵ at 3.06 Mpc (Davis et al. 2020) | 5.35 × 10⁵ | molecular gas (ALMA); contested |
| `ngc-4258-bh` | M106 (NGC 4258) | 3.98 ± 0.04 × 10⁷ at 7.576 Mpc (Reid et al. 2019) | 4.01 × 10⁷ | water masers |
| `m84-bh` | M84 | 9.25 (8.38–10.23) × 10⁸ at 18.51 Mpc (K&H, Walsh et al. 2010) | 9.17 × 10⁸ (18.35 Mpc) | a disc of ionised gas |
| `m60-bh` | M60 | 4.72 (3.67–5.76) × 10⁹ at 16.46 Mpc (K&H, Shen & Gebhardt 2010) | 4.93 × 10⁹ (17.21 Mpc) | its stars' motions |
| `m49-bh` | M49 | 2.5 (2.4–2.8) × 10⁹ at 17.14 Mpc (Rusli et al. 2013, as published) | 2.49 × 10⁹ (17.05 Mpc) | its stars' motions |
| `m105-bh` | M105 | 4.16 (3.12–5.20) × 10⁸ at 10.70 Mpc (K&H, van den Bosch & de Zeeuw 2010) | 4.19 × 10⁸ | its stars' motions |
| `ngc-3115-bh` | Spindle Galaxy | 8.97 (6.20–9.54) × 10⁸ at 9.54 Mpc (K&H, Emsellem et al. 1999) | 8.99 × 10⁸ | its stars' motions |
| `ngc-4889-bh` | NGC 4889 | 2.08 (0.49–3.66) × 10¹⁰ at 102.0 Mpc (K&H, McConnell et al. 2012) | 1.96 × 10¹⁰ (96.16 Mpc, the Coma cluster's) | its stars' motions |

M49's is Rusli et al.'s published value, not Kormendy & Ho's (theirs, from the preprint, does not rescale to the
published table). NGC 1277, asked for, is left out: the app has no galaxy for it (the NGC file holds NGC 1275 and its
Perseus neighbours, not NGC 1277). A galaxy registered with the others (named.json's, the Local Volume Database's, or
more-galaxies.json.gz's, whose Virgo and Coma members are placed within their clusters by their own distances: M84 at
18.35 Mpc, M60 17.21, M49 17.05, NGC 4889 at the Coma cluster's 96.16) gives its hole its record as parent, its place,
its anchor in the expanding universe and its id as `hostGalaxy` (as M87*, `galaxyHoleRecord`); the build reads each
such galaxy's placed distance from those files to scale the mass. A galaxy only in the NGC catalogue is copied by the
build from `public/data/deepsky/ngc-galaxies.json.gz` (its comoving place and its group's anchor, Cosmicflows-4's
distance; the hole's `galaxy`), and its hole is a body of its own at that place (`catalogueGalaxyHoleRecord`; no parent,
since the galaxy comes and goes), with that anchor and its galaxy's deep-sky id as `hostGalaxy` for "Where to?". All
are framed from 50 r_s, labelled just ahead of their galaxy, offer no fall (no starlight of their galaxy is drawn round
them: M87's alone has a model, §6), and their cards say so. From inside a galaxy the app's sky is dark (its particles
fade near the camera) and the NGC catalogue's other galaxies are markers, so the lens there has little to bend: the tour
looks back at the Milky Way from beyond M31* instead (below).

**Registration.** The binaries register with the stars (`registerBinaryHoles`), the galaxies' holes at the end of
`registerCosmos` (`registerGalaxyHoles`, after M87*). `blackHoleStatus` says which data each waits for. Registration
is once; nothing per frame but the gravity state's loop over the holes (40 now; a few comparisons each).

**The card.** Every new hole's card gives its mass with its uncertainty and source and, for these, a line "weighed by
…" (`massMethod`); the data sheet a row "Weighed by". The binaries' cards say what is assumed (orientation, and phase
where it is), the gas not drawn, or the disc's model line (DiskControls, as Cygnus X-1's).

**Scenes and journeys** (`src/content/scenes.ts`; tested in `src/content/moreBlackHoles.test.ts`):

| Scene | Camera | What it shows |
| --- | --- | --- |
| `lmc-x-1-disk` (journey *A black hole in another galaxy*) | 30 r_s from LMC X-1, 10° above its disc, the disc's axis up | its disc, the far side bent over the shadow; its note worded from the record (mass, distance, the disc's share of Eddington) |
| `grs-1915-disk` | 60 r_s on the line to the Sun: the disc at our own angle, 60° from its axis | the disc of its bright years, nearly edge-on |
| `black-hole-tour` (journey *A tour of black holes*) | five stops, 16 s each, moving on while the camera is not moved: GRO J0422+32 from 10⁴ r_s; GRS 1915+105 as above; LMC X-1 as above; M33 X-7 at 50 r_s on the line to the Sun; M31* from 8,100 au beyond it on the line from the Milky Way's centre, where the Milky Way behind it closes into a ring 3° across (r = 4M/θ²) | the lightest hole, three discs, and a supermassive hole's Einstein ring of our own Galaxy |

**Checked** (`src/sim/blackholes/more.test.ts`, `src/content/moreBlackHoles.test.ts`, and the first table's tests run
over the whole file): spot checks of the transcribed numbers against their papers (LMC X-1, LMC X-3, M33 X-7, GRS
1915+105, XTE J1550−564, NGC 4258, Kormendy & Ho's M31, NGC 4889 and Centaurus A with their ranges); each galaxy's hole's
mass equal to its published mass scaled by the placed distance over the paper's; the holes of M84, M60, M49 and NGC 4889
children of those galaxies' bodies, at their places, with them as host; the three other catalogue galaxies' places equal
to the NGC file's rows, and their records there; every binary's donor in front of its hole at T0 (at J2000.0 where the
phase is assumed) with its radial velocity crossing from approach to recession; the radial-velocity amplitudes from the
drawn orbits against the published K (within 6 %; 0.03 % for LMC X-1; GX 339−4, drawn at the middles of its ranges,
within 12 %); the discs physical (L/L_Edd between 0.01 and 0.3, L_Edd = 1.3 × 10³⁸ M, Ṁ = l L_Edd/ηc² to 10⁻⁹ and
between 10¹⁷ and 10¹⁹ g/s, the inner edge at 6 M, the hottest ring 1–10 × 10⁶ K, the outer edge inside the Roche lobe
and the orbit table's reach); every new hole registered, found by "Where to?" under its names and listed where it lives,
and framed by Go there with the lens about it at 10⁴ or 50 r_s; the two disc scenes' cameras and notes; the tour stop by
stop. The card tests (`bodyCard.test.ts`) run over all forty.

**Cost.** Measured in a Chrome tab of the development server on the target laptop, at 3,200 × 1,584 device px (pixel
ratio 2), whole-frame GPU medians (`window.__ls.perf.measure`), the disc on against off in `lmc-x-1-disk`, interleaved
rounds, with other work on the machine (the rounds spread by about ±2 ms): on 20.7, 24.3, 21.0, 21.6, 21.6 ms against off
20.0, 20.0, 23.1, 22.2, 20.9 ms, a median difference of about 0.7 ms (an earlier pair, 1.3–1.6 ms). It is Cygnus X-1's
disc shader with other numbers (§12: 0.55–0.83 ms at 2,048 × 1,104), and costs nothing away from a disc. The data file
is now 224 kB (42 kB gzipped), bundled.

**Left out, and why.** GS 1354−64 (BW Cir): its mass is only a lower limit (7.6 M☉), its inclination unknown, and its
distance, at least 25 kpc from its spectrum, is contradicted by Gaia's parallax (about 1 kpc). Swift J1357.2−0933: a
lower limit only. VFTS 243, a dormant black hole in the Large Magellanic Cloud: not researched for this table. NGC 1277:
no galaxy for it in the app.

**Limitations.** Masses that are ranges or model-dependent are drawn at a stated value (GX 339−4, XTE J1650−500, Nova
Velorum 1993). Many distances are photometric and disputed (said on each card). Positions of the faint counterparts
without Gaia motions do not move across the sky. The galaxies' holes have no starlight of their galaxy round them and
no gas. The discs are a typical state, not today's (GRS 1915+105 has been hidden since 2019).

**Refreshing.** Edit the second table (`scripts/blackholes-more.mjs`), run `node scripts/build-blackholes.mjs` and
`npx vitest run src/sim/blackholes src/content/moreBlackHoles.test.ts`. A new galaxy's hole needs only its galaxy's id
or NGC designation; the build finds its place and distance.
