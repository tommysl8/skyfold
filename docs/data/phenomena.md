# Phenomena: supernovae, a kilonova, jets and the aurora

Things that happen rather than things that are: the six supernovae seen from Earth with known dates and places, the
neutron-star merger GW170817 and its kilonova, the relativistic jets of M87 and Centaurus A, and Earth's aurora. No data
files: every number is in the code with its citation. Code in `src/sim/phenomena/` (the pure parts, the records and the
small gate that comes with the app), `src/scene/Phenomena.tsx` (the models, a chunk of their own), `src/render/
phenomenaMaterials.ts` and `src/render/shaders/aurora.frag.glsl`; scenes and journeys in `src/content/scenes.ts` and
`journeys.ts`. Tests: `src/sim/phenomena/phenomena.test.ts`.

What is measured and what is a model is said on each card (its `modelNotes` and `deepSky.cardNote`) and below.

## 1. The supernovae

Six bodies of kind `transient`: SN 1006, SN 1054, SN 1181, SN 1572 (Tycho's), SN 1604 (Kepler's) and Supernova 1987A,
each at its remnant's place and distance, a point of light whose V magnitude and colour are its light curve's at the
date shown (`supernovae.ts`, read by `lightCurve.ts`; rewritten every frame into the record's `luminous`, which the
point-of-light pass (`scene/Glints.tsx`) draws like a star's, colour included). From Earth, near the date, the new star
appears where it was seen, rises, peaks and fades as recorded.

| | First seen (calendar as recorded; app's Gregorian date) | Peak V | Light curve | Distance used |
| --- | --- | --- | --- | --- |
| SN 1006 | 30 April 1006 Julian (6 May) | −7.5 ± 0.4 (Winkler, Gupta & Long 2003) | Tycho's shape (Ruiz-Lapuente 2004) scaled to the peak: its own records are too sparse | 2.18 kpc (Winkler et al. 2003, as the deep-sky remnant; 1.57 kpc with a revised shock speed) |
| SN 1054 | 4 July 1054 Julian (10 July) | ≈ −4.5, "as bright as Venus" (Stephenson & Green 2002; estimates −3.5 to −5) | three recorded points (4 July, −3 when it left the daytime sky on 27 July, +6 on 6 April 1056) joined by a model: a plateau, a drop, cobalt-56's tail | 2.0 kpc (Trimble 1973, as the Crab Nebula) |
| SN 1181 | 6 August 1181 Julian (13 August) | ≈ −0.5 (Ritter et al. 2021: −0.5 to +1; Schaefer 2023: 0 to −1.4) | a type Iax template over its 185 days | 2.3 kpc (Gaia, Pa 30's central star) |
| SN 1572 | 6 November 1572 Julian (16 November) | −4.0 ± 0.3 (Baade 1945; Ruiz-Lapuente 2004) | Ruiz-Lapuente 2004 table 1: Tycho's and his contemporaries' estimates; colours from table 2 | 4 kpc (Hayato et al. 2010, as the deep-sky remnant; others 2.5–3) |
| SN 1604 | 9 October 1604 Gregorian | ≈ −3 (Ruiz-Lapuente 2017; −3.02, Schaefer 1996) | Ruiz-Lapuente 2017 tables 1–2: European and Korean records | 5.1 kpc (Sankrit et al. 2016, as the deep-sky remnant) |
| SN 1987A | 24 February 1987 (neutrinos 23 February 07:35:35 UT) | 2.98 on 19 May 1987 (Hamuy & Suntzeff 1990) | measured V, 28 points to day 1046 (Menzies, Catchpole, Suntzeff, Whitelock, Walker & Suntzeff; compiled by the Open Supernova Catalog) | 49.59 kpc (the LMC's, as the app places it; 51.4 from the ring's light echo) |

Julian dates are converted with the Julian Day Number (`msFromJulianCalendar`; checked: 4 October 1582 Julian is 14
October Gregorian). Colours are the light curve's observed B − V (reddened by the dust in front, as the star catalogue's
colours are), through Ballesteros's law; for the type Ia without recorded colours a normal Ia's (the Lira law; Phillips
et al. 1999) plus its E(B − V). Before the first point the light rises from nothing over a few days (a model; nobody saw
the rises), and after the last it falls at the tail's slope.

**Up close (a model).** The age counts from when the explosion's light reached Earth (`explosionMs`: 18 days before a
type Ia's maximum, a type Iax's 15, two weeks for SN 1054, the neutrinos for 1987A), as the app draws the deep sky as
Earth sees it: at the remnant itself the explosion happened earlier by its light's travel time (6,500 years for the
Crab), which the cards say. The model (`Phenomena.tsx`, `SHELL_FRAG`):

- the fireball: an opaque sphere of the photosphere's radius (10,000 km/s for a type Ia, a few thousand for the others,
  times the age), its surface as bright as the light curve's luminosity spread over it (with the dust in front taken
  out: A_V = 3.1 E(B − V)), limb-darkened, fading over the first months as the ejecta thin;
- then the nebula: the same light spread through the ejecta;
- the debris: the forward shock runs out freely at the outermost ejecta's speed (20,000 km/s for a type Ia: Mazzali et
  al. 2007; 1,100 km/s for Pa 30's ballistic filaments: Ritter et al. 2021, Cunningham et al. 2024), then slows as
  R = R₀ (t/t₀)^m, R₀ today's radius (angular radius × distance) and m the expansion parameter of its measured proper
  motions (m = μ t₀/θ, which needs no distance: about 0.5 for SN 1006 and Tycho's, 0.6 for Kepler's), the smaller of the
  two laws (`shockRadiusKm`; at the reference epoch the shock is today's remnant, which the tests check). SN 1987A's
  shock follows its measured radii (Gaensler et al. 1997's radio shell, then Frank et al. 2016's X-ray radii). The shell
  behind the shock and the hot ejecta inside it are drawn in false colour (remnants shine mostly in X-rays), mottled by
  noise, at a brightness chosen to be seen (21.3 mag/arcsec² at the rim);
- SN 1987A's equatorial ring: 0.808″ in radius (Panagia 1999), tilted 43°, long axis at position angle 81° (Sugerman et
  al. 2005; which side is nearer is assumed), in 28 knots; its brightness over the years is a model (lit by the flash,
  fading, then from 1995 by the blast in hot spots, peaking about 2009);
- the Crab's remnant is its picture: drawn at the size its filaments' expansion gives for the date (R ∝ t^1.06: their
  speeds are 1.06 times their age's average, Martin et al. 2025), none before 1054 (`remnantScale`, read by
  `scene/Nebulae.tsx`); SN 1987A's picture (Hubble's) is hidden before 1987 and while its model is drawn up close.
  While a model is drawn, the deep-sky catalogue's ring for its remnant is hidden.

A blinding explosion (a fireball millions of times the Sun's surface brightness) is drawn with the view stopped down to
its glare (`PEAK_Y`): its structure and colour show, as they would to an eye or a camera adapted to it.

## 2. GW170817 and the kilonova AT 2017gfo

A body `at2017gfo`, at the gravitational-wave catalogue's place for GW170817 (NGC 4993 at the waves' comoving distance,
carried by the expansion; the tests check it against `gw-events.json.gz`).

- **The inspiral** (`chirp.ts`, `kilonova.ts inspiralAt`): the quadrupole chirp of the measured masses (1.46 and 1.27
  M☉, chirp mass 1.1975 M☉ as observed: Abbott et al. 2019): τ(f) = (5/256)(G𝓜/c³)^(−5/3)(πf)^(−8/3), the waves' phase
  Φ(τ) and the separation from Kepler's law at the source's frequency (1 + z) f. About 100 s from 24 Hz and 2,650 cycles
  from 30 Hz, as LIGO and Virgo report (tests). The separation shrinks at its real pace; the orbit is drawn turning 100
  times slower than it did (12 to 800 orbits a second at the end). The stars touch about a millisecond before τ = 0
  (`merged`). The orbit's axis is θ_JN = 151° from our line of sight (Abbott et al. 2019); its position angle is not
  known. The stars' look (white-hot) is a model.
- **The kilonova** (`kilonovaAt`): blackbody fits of Waxman et al. 2018 (table B2): L, T and the photosphere's radius
  from 0.5 to 10.5 days, read in ln between; L ∝ t^−2.8 after. Its V-band magnitude is that blackbody's through a V
  filter (`vMagnitudeOf`, anchored on the Sun: M_V = 4.81 at 5,772 K): about −16 at half a day, as Drout et al. 2017
  measured (−16.04 ± 0.23), and about magnitude 17 from Earth. Blue then red: 10,300 K at half a day, 3,750 K at 2.5
  days, 2,500–3,000 K after a week.
- **Its debris (a model)**: a fast blue part towards the poles (0.27c) and a slower red one round the waist (0.13c) (Kasen
  et al. 2017; Villar et al. 2017), blue's share of the light falling from 85 % to 15 % over four days. One-part models
  fit the light too (Waxman et al. 2018): the card says the shape is a model. The hypermassive neutron star of the first
  moment (a model, under a second) most likely collapsed to a black hole (Margalit & Metzger 2017; not observed).
- **Precision**: 40 Mpc from the Sun a world coordinate is 10⁵ km coarse, more than the inspiral is wide. The model is
  drawn from the camera's exact offset from the body it orbits (`controller.orbitOffsetKm`), not from world positions.
- The scene (`kilonova-gw170817`) puts the clock 45 s before the merger at real time; from the merger the clock runs
  faster and faster (each 2.5 s of the view the age grows e times) while the camera eases out with the debris
  (`sim/phenomena/pace.ts`); touching the clock or the camera hands both back.

## 3. Relativistic jets

Each jet is a set of elongated Gaussian clouds of light ("blobs"), drawn exactly (a Gaussian's line integral is closed
form) in one instanced draw (`BlobSet`), each beamed by its speed along its axis as seen from the camera:
δ = 1/(Γ(1 − β cos θ)), the light × δ^(2+α) relative to Earth's view (`beaming.ts`, `jets.ts beamingFrom`).

- **M87** (visible light, at its real brightness): position angle 290° (Meyer et al. 2013), 17° from our line of sight
  (Mertens et al. 2016: 17.2 ± 3.3°), so its 20″ (1.6 kpc on the sky) are 5.6 kpc along the jet. Knots HST-1, D, E, F, I,
  A, B, C at their distances from the core (Marshall et al. 2002) with their 1998 HST fluxes at 606 nm (Perlman et al.
  2001; knot A 1,086 µJy, V ≈ 16.3); G at its X-ray place with a model flux; a faint continuous jet between (5 %, a
  model). Γ = 6 in HST-1 and D (Biretta et al. 1999), β = 0.85 beyond (knot A's 1.32c on the sky); α = 0.9. The
  counter-jet is the same blobs going the other way, 700 times fainter from Earth (over 450: Stiavelli et al. 1992). Its
  width (an opening of about 1°, 1″ across at knot A) is from Walker et al. 2018 and Marshall et al. 2002. Within
  0.02–0.1 pc of M87* the jet fades out: there the black hole's lens would bend its light, which this model does not
  trace (the M87* scenes are unchanged).
- **Centaurus A** (radio and X-rays in false colour, at a brightness chosen to be seen): the inner jet at position
  angle 55°, 50° from our line of sight, at 0.57c (Snios et al. 2019), traced to 4 kpc; the counter-jet dimmer by
  the beaming ratio (observed: over 50, so the real counter-jet is fainter still); the inner lobes (Neff et al. 2015); the
  north middle lobe at 30 kpc (Israel 1998); the giant lobes, about 600 kpc end to end (Israel 1998; Feain et al. 2011),
  drawn across the sky (how they lie along our line of sight is not known; their position angles are approximate).
- Both show only once the camera has left the Milky Way (30 kpc from the Sun) and the system is a few pixels across;
  View › Relativistic jets turns them off.

## 4. The aurora

Earth's two auroral ovals, on the night side (`aurora.ts`; `shaders/aurora.frag.glsl`):

- the geomagnetic poles of the date from IGRF-14's dipole (g₁⁰, g₁¹, h₁¹ from NOAA NCEI's coefficient file, linear
  between the 5-year epochs, the secular variation to 2030; held at 1900's before and 2030's after): 80.59° N 72.68° W
  in 2020, 80.79° N 72.76° W in 2025 (geocentric), as NCEI gives them (tests);
- the oval's poleward and equatorward edges from Starkov's model (Starkov 1994; coefficients as Sigernes et al. 2011
  give them, appendix A; Sigernes' 1.61 kept for the equatorward A₀ b₀ where the ocbpy package has 1.16), as a Fourier
  series in magnetic local time with each coefficient a cubic in log₁₀|AL| and AL from Kp. At Kp 3: 63.8°–71.9° at
  midnight, 73.3°–75.7° at noon (tests). Starkov's latitudes are corrected geomagnetic ones, laid here about the centred
  dipole (a degree or two off in places);
- the green 557.7 nm line peaking at 114 km (Whiter et al. 2023), the red 630.0 nm line near 250 km (Hayakawa et al.
  2018), the blue N₂⁺ band with the green; arcs of about 12 kR at Kp 3 (15 kR on average: Knudsen et al. 2001), the red
  0.12 to 0.27 of the green (a model of the activity); each line's light turned into V-band flux by its
  luminous efficacy, and its colour from the CIE observer;
- storms: above Kp 3 the arcs' brightness rolls off softly towards 30 kR and the red share is held at Kp 3's, and above
  Kp 6 the oval is stretched south (to May 2024's 35.5° at Kp 9: `docs/data/space-weather.md` §5). The arcs keep a
  quiet night's width (a third to half a degree) and the diffuse glow its brightness per degree however wide the oval
  grows, so a storm's oval is wider and holds more room between its arcs, not a brighter blanket; seen from above, the
  red glow is mostly kept off the arcs' own columns (they show the green line's colour, with the red as a fringe above
  them towards the limb). Before the display law, a soft roll-off from a column of 20 kR towards 60 kR keeps the
  brightest columns (a storm's arcs, the limb seen edge-on) from saturating into an opaque band; a quiet night's arcs
  are below it. (A model: the brightest storm arcs do reach 100 kR and more, over a small part of the oval.)
- the curtains (where the arcs lie in the oval, their gentle folds of up to about 2°, their rays and their slow motion on
  the wall clock) are a model; the arcs are strongest in the evening and midnight sectors. The noise along the oval
  repeats a whole number of times round the clock of magnetic local time, so it has no seam at magnetic midnight.

View › Aurora turns it on or off and sets the activity: Auto (the default: the Kp measured at the date, GFZ, since 1932;
`docs/data/space-weather.md`), Quiet (Kp 1), 3 (a moderate night, somewhat above the median, Kp 2, of 1932–2026 in
GFZ's record), 5, 7 or 9. Each pixel's ray is marched through the shell from 90 to 320 km,
with the oval's state worked out at three points of the ray.

## 5. Cost

Nothing of the models is downloaded until one is near (the chunk `Phenomena`); the gate costs six light curves a frame.
GPU time measured with `window.__ls.perf.measure(6, 3)`, on and off interleaved three times, on the development machine
(the browser pane shared with other work, so the frame times are noisy; a 3,200 × 1,584 canvas at pixel ratio 2), 9
October 2026:

| View | Frame, on | Cost (median of the differences) |
| --- | --- | --- |
| Tycho's remnant (1750) filling a quarter of the view | 12.6 ms | 0.95 ms |
| The aurora scene (Earth 680 px across) | 29 ms | about 1.8 ms (0.3–3.1) |
| M87's jet from 10 kpc, instanced blobs | 12.9 ms | under the noise (−2.9 to +0.3 ms) |
| (the same, the first single-pass draw) | 23.4 ms | 8 ms |

The first jet draw evaluated every blob on every pixel of one sphere round the system and cost 8 ms; the blobs are now one
instanced draw, each on its own ellipsoid's pixels, and cost nothing measurable. The first
aurora shader computed the oval, its noise and the magnetic local time at every sample and cost about 4.5 ms; it now
does so at three points of each ray.
