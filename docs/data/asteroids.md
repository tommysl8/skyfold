# The asteroids and comets

The asteroids and comets of JPL's Small-Body Database (SBDB) worth a card: 32,569 of the 1,465,911 with an orbit good
enough to draw (as of 1 October 2026), and a sample of the rest (§2a). Each moves on its two-body Kepler orbit, solved per point in the vertex shader, and is as bright as
it really is from the camera. Code in `scripts/build-asteroids.mjs` (the build; `scripts/asteroids/fetch.mjs` the
download, `scripts/asteroids/horizons-fixtures.mjs` the accuracy check's data), `src/sim/asteroids/` (the format, the
orbits, the brightness and the choice of what to draw, the loading, the near search, the bodies a click makes),
`src/scene/Asteroids.tsx` and `src/scene/asteroidPick.ts` (the drawing and the picking),
`src/render/shaders/asteroids.vert.glsl`, `src/content/asteroidDestinations.ts` (search) and `src/ui/asteroidCard.ts`
(the layer's card). It replaces `public/data/belts.bin` (31,930 bodies, the H < 14 asteroids, Trojans and TNOs).

## 1. Source

The [SBDB Query API](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html) (NASA/JPL-Caltech, US public domain), every
row of `sb-kind=a` (1,569,207 asteroids) and `sb-kind=c` (4,077 comets), in chunks of 50,000 sorted by SPK-ID, with
`full-prec=true` (the default rounds a to four figures, which drifts by degrees in decades). Fields: SPK-ID, names and
designations, q, e, i, Ω, ω, mean anomaly and time of perihelion at the epoch, the epoch, H, the comets' M1 and K1,
diameter and geometric albedo where measured, the orbit class and the orbit condition code. The elements are
heliocentric osculating elements in the J2000 ecliptic. The raw chunks (about 450 MB of JSON) go to a folder given to
the build (`npm run data:asteroids -- <folder>` or `ASTEROIDS_RAW`, default `data-raw/asteroids`) and are fetched
only when missing.

## 2. What is kept

| | Rows | Why |
| --- | --- | --- |
| read | 1,573,284 | |
| orbit condition code 8 or 9 | −106,941 | the code (the MPC's U, 0 best to 9 worst) is how far the body's place along its orbit is uncertain after ten years: 7 is up to 9°, 8 up to 41°, 9 more. 8 and 9 are mostly orbits from arcs of days; 0–7 keeps every orbit whose uncertainty is no worse than two-body motion's own error (§5) |
| comets with perihelion before 1900 | −343 | orbits from visual or early photographic positions, parabolas fitted to a few weeks |
| comets lost or defunct (D/, X/) | −39 | the body is gone, or the orbit was never reliable |
| asteroids without a condition code or H | −23 | no measure of the orbit, or no brightness |
| drawn by the registry | −18 | Ceres, Vesta, Pluto, Eris, Haumea, Makemake, Gonggong, Quaoar, Sedna, Orcus, Arrokoth, 1P, 2P, 67P, Hale–Bopp, ʻOumuamua, Borisov and 3I/ATLAS have accurate tracks of their own (`docs/data/tracks.md`): they are not drawn twice |
| periodic comets with elements from before 1990 | −9 | Jupiter has moved them since |
| **kept** | **1,465,911** | |

JPL gives comets on single apparitions no condition code; they are kept (C/2020 F3, C/2023 A3 among them). By group
(colour on screen): near-Earth asteroids 30,127 (amber), main belt 1,405,193 (sand), Hildas 6,694 (gold), Jupiter
Trojans 14,855 (olive), Centaurs 806 (lilac), trans-Neptunian objects 4,636 (blue-grey), comets 3,600 (ice). The
groups are JPL's classes (IEO, ATE, APO, AMO; IMB, MBA, OMB, MCA; TJN; CEN and AST beyond 5 au; TNO), with the Hildas
taken out of the outer belt by their orbits (a 3.7–4.2 au, e < 0.3, i < 20°), and the few asteroids on open orbits
with the comets.

## 2a. Only the notable ones, and a sample

A card for each of 1.47 million bodies was more than anyone uses, and 28 MB to fetch. `scripts/asteroids/notable.mjs`
(run after the build: `npm run data:asteroids` does both) keeps as bodies with a card, a label and a place in "Where
to?" only:

| Group | Kept | Rule |
| --- | --- | --- |
| near-Earth | 1,161 | named, or H ≤ 18 (about a kilometre and up) |
| main belt | 25,776 | named, or H ≤ 11 (about 15 km and up) |
| Hildas, Trojans | 181, 393 | as the main belt |
| Centaurs, beyond Neptune | 31, 1,427 | named, or H ≤ 7 |
| comets | 3,600 | all |

26,554 of them have names. Of the others, one in 20 (by a fixed hash of its number or designation: 71,676) is drawn as
a sample, in sections flagged `sample` (`src/sim/asteroids/format.ts`): the same points, as bright as they really
are, so the belts keep their shape and their grain from afar, but never picked, labelled or found. The layer is now
2.1 MB (was 28 MB).

## 3. Orbits

Every orbit is carried from its own epoch to one reference epoch (JD 2461200.5, 2026 July 26, SBDB's standard epoch
for nearly all of them) along its own two-body orbit: nothing changes but the numbers. Orbits wholly beyond Jupiter
(q ≥ 7 au, 4,880 of them: Centaurs, the Kuiper belt, distant comets) are re-fitted about the Solar System's barycentre
from their state at the epoch, with the mass of the Sun and planets, and drawn about the barycentre: out there the
Sun's own wobble (0.01 au) is the larger error, and JPL Horizons agrees (§5). The rest stay about the Sun.

Ellipses carry a, e, i, Ω, ω and the mean anomaly at the reference epoch; comets and orbits with e ≥ 0.98 carry q,
e, i, Ω, ω and the time of perihelion. The shader writes positions about perihelion, x = q − 2a sin²(E/2) and
y = √(a q (1 + e)) sin E (the same with sinh on hyperbolas), which float32 keeps exact as e → 1; e = 1 exactly is
Barker's parabola in closed form. Kepler's equation: for e < 0.35 (nearly all) a second-order start and two Newton
steps, converged to 1e-9 rad; otherwise Newton from Danby's start until converged. The float64 twin is
`src/sim/asteroids/conic.ts`, used for picking, for the body a click makes, and by the tests.

## 4. Files

| File | Size | What |
| --- | --- | --- |
| `public/data/asteroids/index.json` | 6 kB | each file's sections: group, shape, frame, count, H range, least perihelion and greatest aphelion |
| `public/data/asteroids/00.bin.gz` | 451 kB | each group's brightest (main belt, Hildas and Trojans to H 14, near-Earth to H 18, TNOs to H 9), every Centaur and every comet: 34,234 bodies, loaded at start as `belts.bin` was |
| `public/data/asteroids/01–18.bin.gz` | 17.6 MB in all, each under 1.2 MB | the rest, 87,000 bodies a file, by H |
| `public/data/asteroids/labels/<section>.txt.gz` | 41 files, 9.7 MB in all | each body's number, name, designation, diameter, albedo and class, fetched when one is clicked or found |
| `public/data/asteroids/names.bin.gz` | 638 kB | every number's section, the 26,555 names and the 3,600 comet designations, fetched when "Where to?" opens |
| `docs/data/asteroids-build-log.txt` | | the build's counts, cuts and sizes |

Format in `src/sim/asteroids/format.ts`: little-endian columns, each split into byte planes for gzip. An ellipse
takes 15 bytes before gzip (f32 a; 16 bits each of e, i/π, Ω/2π, ω/2π and M/2π; a byte of H in its section's range),
12.3 after. The rounding moves a main-belt asteroid by at most 40,000 km. Sections are cut by group, frame and H, at
most 90,000 bodies each; each group's orbits beyond its central 99.6 % in perihelion or aphelion (Mars-crossers out to
8 au, scattered TNOs) have sections of their own, so the others' bounds stay tight (§6). In each section the numbered
bodies come first by number, so a number's place is found from the names file alone.

First load: 451 kB for `00.bin.gz` and 6 kB for the index, against 511 kB for `belts.bin` before. Nothing else is
fetched in the first five seconds after it, nor near a planet (within 0.05 au) but the near-Earth file (368 kB).

## 5. How good the positions are

Planets' pulls are left out. Checked against JPL Horizons (which integrates the same orbit solutions with the planets,
the big asteroids and the comets' non-gravitational forces), for 16 bodies at their epoch and 1, 5, 10, 20 and 30
years either side, with the elements as shipped (`src/sim/asteroids/conic.test.ts`, data in
`src/sim/asteroids/__fixtures__/horizons.json`). Error as seen from the Sun:

| Body | ±1 yr | ±10 yr | ±30 yr |
| --- | --- | --- | --- |
| 2 Pallas | 0.01° | 0.6° | 4.2° |
| 10 Hygiea | 0.07° | 3.6° | 7.9° |
| 153 Hilda | 0.01° | 1.9° | 3.7° |
| 433 Eros | 0.01° | 0.2° | 0.7° |
| 3200 Phaethon | 0.04° | 0.4° | 2.4° |
| 99942 Apophis | 0.02° | 1.5° before 2029; 60–85° after its pass 32,000 km above Earth on 2029 April 13 | |
| 624 Hektor (Trojan) | 0.01° | 1.4° | 10.1° |
| 2060 Chiron (Centaur, about the barycentre) | 0.00° | 0.01° | 0.18° |
| 28978 Ixion, 15760 Albion (TNOs, about the barycentre) | 0.00° | 0.00° | 0.00° (0.3 million km) |
| 12P/Pons-Brooks | 0.01° | 0.14° | 0.54° |
| 29P/Schwassmann-Wachmann 1 | 0.01° | 1.3° | 16–23° after it nears Jupiter in 2038 |
| C/2020 F3 (NEOWISE), e = 0.9992 | 0.00° | 0.12° | 0.27° |
| C/2023 A3 (Tsuchinshan-ATLAS), e = 1.0001 | 0.01° | 0.07° | 0.07° |
| C/2017 K2 (PANSTARRS), e = 1.0006 | 0.02° | 0.23° | 0.49° |
| C/1980 E1 (Bowell), e = 1.058 | 0.10° | 0.19° after; 2.7° before its 1980 pass by Jupiter | |

So: within about 0.1° of its orbit a year either side of its epoch (for most, mid-2026), a few degrees over a decade,
about 10° over three; far worse after a close pass by a planet. The layer's card says so in one line, and each body's
card under Sources. Heliocentric elements were also tried for the distant bodies, and barycentric ones for the inner:
each is worse where the other is used (Chiron 2.4° against 0.18° at 30 years; Eros 17.9° against 0.1° at 10).

## 6. Brightness, and what is drawn

Each body's apparent magnitude is real: V = H + 5 log10(r Δ) + the IAU H, G phase term with G = 0.15 (Bowell et al.
1989) for asteroids, M1 + 5 log10 Δ + K1 log10 r for comets (M1 = 15, K1 = 10 where JPL has none), with the
observer's Doppler shift and aberration like every point source. It is drawn as a long exposure would show it: at full
strength at V = 24 and brighter (growing up to 1.5 times across), in proportion to its light below that, so a swarm
seen from afar keeps its true surface brightness, faded out over the last 0.75 mag before V = 28. The exposure follows
the camera's distance d from the Sun: both magnitudes move by 5 log10(d / 8 au), from −5 inside 0.8 au to +8 beyond
320 au, so the bright bodies near the Sun do not swamp the view from Earth, and the Kuiper belt, a thousand times
fainter than the main belt, still shows from out there (`src/sim/asteroids/lod.ts`).

At most 200,000 bodies are drawn a frame (the GPU budget, §7). Each section has a bound, the brightest any of its
bodies could look from the camera: H_min + 5 log10 of the least r Δ over the shell between its least perihelion and
greatest aphelion (the phase only dims). The sections are drawn brightest-bounded first (those whose shell holds the
camera by their H), whole, until the budget is spent, and a section whose bound is fainter than the limit is neither
drawn nor fetched. Inside a shell (in the main belt, at Ceres) the bound says nothing, so the sections left out there
are searched body by body, in float64, in a worker (`src/sim/asteroids/near.ts`), for any that could be brighter than
the limit as the camera and the bodies move by a margin (0.01 au, more at fast clock rates); up to 20,000 of those are
drawn too, through an index on the same buffers, and the search runs again before either has moved that far.

What is promised (`src/sim/asteroids/lod.test.ts`, on every body of five files from six views): every body brighter
than the layer's current limit is drawn. The limit is the display's, or the bound of the first section the budget left
out, or the near search's when it had to stop at 20,000. From the views of §8: V 19.9 above the inner Solar System,
21.3 at 12 au, 16.2 at Ceres, 11.7 near Earth (the faint near-Earth asteroids passing close are the near search's).
The budget draws far deeper than that: the brightest 200,000 by H from above the belt (to H ≈ 16), with the faintest
fading out as the exposure's limit is reached.

Where the faintest bodies are now is not uniform: most of the H > 18 asteroids were found in the last decade near
opposition, and their longitudes still crowd the sky surveys' recent fields (up to 1.8 to 1 between octants of
longitude in the faintest file). The layer draws what is known.

## 7. Cost

On the reference laptop (Intel Core 5 320, integrated graphics, Chrome with ANGLE on D3D11, pixel ratio 2, canvas
2560 × 1384), `window.__ls.perf.ab` with the layer off and on, three rounds:

| View | Layer's cost (median of the rounds' differences) | Drawn | Promised limit |
| --- | --- | --- | --- |
| 7 au above the Sun, the whole belt on screen | 1.48 ms (1.52 with the comets' program in, on a later run) | 200,000 | V 19.9 |
| 12 au above the Sun, the Trojans | 1.34 ms | 200,000 | V 21.3 |
| at Ceres, inside the belt | 1.24 ms | 200,000 and 20,000 near | V 16.2 |
| 0.3 au from Earth | 0.77 ms | 200,000 and 12,455 near | V 11.7 |
| 70 au out, the Kuiper belt | 1.07 ms | 200,000 | V 25.4 |

Single rounds swing by half a millisecond either way on this GPU; the frame without the layer was 8.5–9.2 ms.

A drawn body costs about 3.5 ns for its orbit and brightness and 3.4 ns for its point. All 1.47 million at once cost
13.9 ms; that is why there is a budget. The near search costs about 0.1 µs a body in the worker, once a second or
less, and the first answer waits for the worker's own copy of the files (a few seconds). Picking draws the visible
sections once more into a 13 × 13 target round the pointer, about 5 ms on a click; its two programs compile in the
background once the first file is in.

## 8. Pictures

The views checked while building it, in the development build: from 7 au above the Sun (the main belt, a hint of
the Kirkwood gaps as thinner rings: in positions, unlike in semi-major axes, the eccentricities blur them), from
12 au (the belt, with the Trojans' two thin clouds 60° ahead of and behind Jupiter), from 0.3 au off Earth (the
near-Earth asteroids round Earth's orbit, the belt beyond the Sun), at Ceres (inside the belt: points on every side),
and from 70 and 110 au (the Kuiper belt beyond Neptune's orbit, clumped where the surveys looked, with the inner
Solar System a bright knot round the Sun).

## 9. In the app

The layer follows View › Small bodies (B). Clicking a point opens its card: name or designation, class, size (measured,
or the range its H allows for albedos from 0.05 to 0.25), orbit (a, e, i, period, or perihelion for open orbits),
with the SBDB page and the position note under Sources; Go there and Fly here work as for any body. "Where to?" finds
any named or numbered body by name or number and any comet by designation; the names file loads when the palette
opens. A body chosen either way becomes a body of the registry (`src/sim/asteroids/bodies.ts`), drawn by it while it
is registered and left out of the layer's points meanwhile, and released when something else is chosen.

## 10. Comets' tails

Every comet the app draws as a body (Halley, Encke, 67P, Hale–Bopp, Borisov, 3I/ATLAS, and a comet of the layer once
it is clicked or found) and the layer's six comets with the strongest tails at the date get a coma and two tails
(`src/render/cometTail.ts` the model, `src/scene/CometTails.tsx` the drawing, `src/sim/asteroids/activeComets.ts` the
choice of the layer's). The tails are a model of the shape: their directions are physics, their brightness is gentle
and illustrative.

- **Ion tail:** straight, along the solar wind as the comet sees it, v_sw r̂ − v with v_sw = 400 km/s (Biermann 1951):
  anti-sunward, swept back a few degrees against the comet's motion (atan(v⊥ / 400 km/s): 7.8° for Halley at
  perihelion). Blue.
- **Dust tail:** grains of radiation-pressure parameter β = 0.06, 0.15, 0.35, 0.65 and 1 (5 µm to 0.5 µm or so),
  each released from where the nucleus was (traced back along its two-body orbit) and moved forward on its own orbit
  under μ☉(1 − β), exactly (universal variables). Grains of one β make a syndyne, grains of one age a synchrone
  (Finson & Probstein 1968): the fan curves back along the orbit, in the orbit's plane. Yellow-white, fading with
  age.
- **How strong and how long:** from each comet's magnitude law, total magnitude m = M1 + 5 log10 Δ + K1 log10 r (JPL
  SBDB; M1 = 15, K1 = 10 where it has none). M1 + K1 log10 r is the comet's light as seen from 1 au, the measure of
  how much gas and dust it makes at r au from the Sun. The tails' strength is that magnitude on a linear scale from
  17 (nothing) to 3 (a great comet), times a smooth step from 1 inside 3 au to 0 at 5 au, where water ice stops
  sublimating (the CO and CO₂ activity of some comets further out is left out). The ion tail's length goes as the
  square root of the light, 5 × 10⁷ km at magnitude 5, kept to 3 × 10⁶–1.5 × 10⁸ km; the oldest dust drawn as its
  fourth root, 30 days at magnitude 5, kept to 10–60 days.

| Comet | M1, K1 (JPL SBDB) | At perihelion | Strength | Ion tail |
| --- | --- | --- | --- | --- |
| 1P/Halley, 9 February 1986 | 5.5, 8.0 (ICQ Comet Handbook 2005) | 0.587 au | 0.95 | 9.3 × 10⁷ km |
| C/1995 O1 Hale–Bopp, 1 April 1997 | 4.8, 4.0 (solution 226) | 0.914 au | 0.88 | 5.9 × 10⁷ km |
| C/1996 B2 Hyakutake, 1 May 1996 | 7.4, 10.75 | 0.230 au | 1 | 1.5 × 10⁸ km |
| C/2020 F3 NEOWISE, 3 July 2020 | 12.1, 12.25 | 0.295 au | 0.81 | 3.8 × 10⁷ km |
| C/2023 A3 Tsuchinshan–ATLAS, 27 September 2024 | 8.9, 5.5 | 0.391 au | 0.74 | 2.3 × 10⁷ km |
| 2P/Encke | 15.7, 4.5 | 0.340 au | 0.24 | 3 × 10⁶ km |
| 2I/Borisov, 8 December 2019 | 13.8, 4.5 | 2.01 au | 0.13 | 3 × 10⁶ km |

The layer's comets with tails are chosen twice a second while the layer shows (and at once when the date jumps by
two days): of the comets about the Sun with a magnitude law, those inside 5 au, strongest first, at most six, none
weaker than 2 % (`src/sim/asteroids/activeComets.test.ts` finds Hyakutake, NEOWISE, Tsuchinshan–ATLAS and 12P at
their perihelia). A tail is computed and drawn only while it is at least 2 px long on screen. Each costs 115 grain
orbits and 23 release states a frame on the CPU (0.09 ms in Node), and one draw of 193 vertices; Halley's in the
1986 scene cost 0.38 ms of GPU time (`window.__ls.perf.ab` with `__ls.tails.look.on`, two rounds, 0.21 and 0.55 ms,
canvas 3200 × 1584, development build). Tests: `src/render/cometTail.test.ts`
(anti-sunward ion tail with its aberration, dust in the orbit plane behind the comet, ½βgt² for fresh dust, the
magnitude law's scaling), and the two scenes' dates in `src/content/scenes.test.ts`.

Not modelled: jets, striae, the gas coma's chemistry and colours (C₂'s green), anti-tails seen edge-on, outbursts,
sodium tails, and the comets' real surface brightness. Journeys: "Halley's Comet in 1986", "Comet Hale–Bopp, 1997";
the Learn article's "Halley comes back" (2061) is a scene.
