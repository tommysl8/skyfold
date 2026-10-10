# The heliosphere and the Oort cloud

Two models of the edge of the Solar System, drawn only at their own scale: the heliosphere (the bubble the solar
wind blows in the interstellar gas) from a few hundred au out, the Oort cloud of comets from thousands. Code in
`src/sim/heliosphere.ts` (the models, pure, tested in `src/sim/heliosphere.test.ts`), `src/scene/Heliosphere.tsx`
(the drawing) and `src/ui/RegionNames.tsx` (their names). No data files: every number is quoted from the papers
below, and the Voyager crossings were read from the app's own tracks (`docs/data/tracks.md`).

## 1. The interstellar wind

The Sun moves through the local interstellar gas, which blows past it from ecliptic longitude 255.7°, latitude +5.1°
(J2000), at 25.4 km/s: IBEX's direct sampling of interstellar helium (McComas et al. 2015, ApJS 220, 22, who give
the flow's own direction, 75.7°, −5.1°; Ulysses found 255.4°, +5.2° and 26.3 km/s: Witte 2004, A&A 426, 835). That
upwind direction is the nose. "North" below is ecliptic north made square to it, "port" the left looking upwind
with north up.

## 2. The termination shock

Where the solar wind drops from supersonic to subsonic. Drawn as the sphere McComas, Rankin, Schwadron & Swaczyna
(2019, ApJ 884, 145) fit to four points (the two Voyager crossings, and where each Voyager lost touch with the
anomalous cosmic rays' source): radius 117 au, its centre 32 au tailward of the Sun, 27 au north and 12 au to port.
In the frame of §1 it passes 0.7 au beyond Voyager 1's crossing and 2.1 au short of Voyager 2's, and spans 73 to 161 au
from the Sun, as the paper says (IBEX: nearest about 74 au, farthest about 161 au).

## 3. The heliopause

Where the Sun's plasma meets the interstellar plasma. The shape is Parker's (1961, ApJ 134, 20) for a subsonic
interstellar wind flowing round the solar wind: the Rankine half-body of a source in a uniform stream,
r(θ) = L0 / cos(θ/2), θ the angle from the nose, round at the front and a cylinder of radius 2 L0 down the tail. One
such shape cannot pass through both Voyager crossings (Voyager 2's, 53° from the nose, was nearer the Sun than
Voyager 1's at 30°: the interstellar magnetic field presses the southern side in; Opher et al. 2007, Science 316,
875), so a north–south term is added, r = L0 (1 + A sin β) / cos(θ/2) with β the ecliptic latitude, and L0 and A are
solved to pass exactly through both: L0 = 112.2 au, A = 0.082. It is drawn to 160° from the nose and fades out from
250 to 650 au down the tail.

| Crossing | Date | Distance (tracks) | Direction (ecliptic λ, β) | Model |
| --- | --- | --- | --- | --- |
| Voyager 1, termination shock | 16 December 2004 | 94.0 au | 253.0°, +34.7° | 94.7 au |
| Voyager 2, termination shock | 30 August 2007 | 83.7 au | 288.6°, −31.6° | 81.5 au |
| Voyager 1, heliopause | 25 August 2012 | 121.6 au | 254.9°, +35.0° | 121.6 au (by construction) |
| Voyager 2, heliopause | 5 November 2018 | 119.0 au | 290.1°, −36.5° | 119.0 au (by construction) |

Crossing dates and distances: NASA's Voyager interstellar mission page; Stone et al. 2005 (Science 309, 2017), 2008
(Nature 454, 71), 2013 (Science 341, 150), 2019 (Nature Astronomy 3, 1013). Today (October 2026) Voyager 1 is 172 au
out and Voyager 2 144 au, each some 50 and 25 au beyond the heliopause in its direction (a test checks both).

What is model: everything but the four crossings. The real heliopause is blunter at the nose than a Rankine half-body
(IBEX-Lo helium: Isenberg, Kucharek & Park 2017, arXiv:1711.09823), and the length and shape of the tail are argued
over (Opher et al. 2020, Nature Astronomy 4, 675, find a short, round heliosphere); both boundaries also breathe by
several au with the solar cycle, which is left out. Between them lies the heliosheath; beyond, the interstellar
medium. Nothing is drawn for the bow wave ahead of the nose.

## 4. The Oort cloud

A model: no member has been seen out there. Comets on orbits spread round the Sun from 2,000 to 100,000 au, the
density falling as r^−3.5 (the simulations of Duncan, Quinn & Tremaine 1987, AJ 94, 1330), split at 20,000 au into
the inner (Hills) cloud and the outer (Oort) cloud: about a fifth of the members lie in the outer one (a test checks
the 20 %). The ranges in the literature: inner edge 2,000–5,000 au, outer edge 10,000 to over 100,000 au (NASA's Oort
cloud page; Oort 1950 put it at 50,000–150,000 au); members 10¹¹ (Oort 1950) to about 7–8 × 10¹¹ (Kaib & Volk 2022).
Drawn isotropic, as 24,000 points from a fixed seed, each standing for millions of comets: the inner cloud's likely
flattening and the stretch the galactic tide gives the outer one are left out. Points inside 20,000 au are drawn
dimmer in proportion to their distance, so the dense inner cloud does not pile up into a glare round the Sun: the
number of points follows the model, their brightness only its outline.

## 5. When they show

| | Fades in | Fades out | Name |
| --- | --- | --- | --- |
| Heliosphere | the camera 150 → 400 au from the Sun | the heliopause's nose 24 → 6 px from the Sun on screen | "Heliopause" at the top of its outline, "Termination shock" at the bottom of its own, from 250–500 au, while the nose is 50–90 px or more |
| Oort cloud | 3,000 → 12,000 au | its outer edge 60 → 15 px | "Oort cloud (model)" from 15,000–40,000 au, while its edge is 60–120 px or more |

Both are on by default: the zoom out from the planets passes through them, and they are not drawn nor built until
then. They are guides (the relativistic view leaves them out), the names follow View › Labels.

## 6. Look and cost

Two translucent shells added to the scene, each brighter where the line of sight grazes it (1/|cos| of the angle to
the surface, capped at about 8): the heliopause pale blue, the termination shock lilac, both very faint. The cloud is
additive points 1.6 CSS px across. Geometry: the heliopause 4,100 vertices, the shock 2,700, the cloud 24,000 points,
built the first time they are wanted; nothing is drawn or computed but a distance and two fades a frame otherwise.
Measured with `window.__ls.perf.ab` and `__ls.edge.look.on` (the layer out and in, four rounds, canvas 3200 × 1584,
in the development build on the shared development machine, where single rounds swing by ±1 ms): the bubble side on
from 900 au, filling half the view, 0.2 ms median (best rounds 16.48 against 16.96 ms, 0.5 ms); the cloud from
300,000 au, 0.4 ms median.

## 7. In the app

Journey: "The edge of the Solar System" (the bubble side on from 900 au with both Voyagers outside it, then out to
400,000 au and the cloud). The Learn article "The edges of the Solar System" tells the story.
