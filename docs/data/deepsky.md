# The deep-sky catalogues

Objects you can find in "Where to?", pick in the view, visit and read about on a short card, from four catalogues: the
NGC and IC objects that have a measured distance (OpenNGC), the pulsars of the ATNF Pulsar Catalogue, the Milky Way's
supernova remnants with distances (Ranasinghe & Leahy 2022, after Green's catalogue), and the mergers of black holes
and neutron stars heard in gravitational waves (GWTC, via GWOSC). Built 1 October 2026. Code in `scripts/build-ngc.mjs`,
`build-pulsars.mjs`, `build-magnetars.mjs`, `build-snrs.mjs`, `build-gw-events.mjs` and `scripts/deepsky/` (the builds), `src/sim/deepsky/`
(the formats, the records, the loading, search and picking), `src/scene/DeepSky.tsx`, `src/render/deepSkyMaterials.ts`
and the shaders `deepSkyMarker.vert.glsl`, `deepSkyGalaxy.vert.glsl` and `gwRegion.vert.glsl`. Counts of each run are in
`docs/data/deepsky-build-log.txt`.

## 1. Outputs

| File | Size (gzip) | What |
| --- | --- | --- |
| `public/data/deepsky/ngc-galaxies.json.gz` | 295 kB | 6,411 NGC/IC galaxies, pairs and groups placed where the cosmic web or the galaxy surveys place them |
| `public/data/deepsky/ngc-galactic.json.gz` | 37 kB | 794 NGC/IC clusters and nebulae of the Milky Way and the Magellanic Clouds |
| `public/data/deepsky/ngc-existing.json.gz` | 2 kB | 366 NGC/IC/Messier designations of 139 objects the app already has, and which of its bodies each leads to |
| `public/data/deepsky/pulsars.json.gz` | 175 kB | 4,179 pulsars |
| `public/data/deepsky/magnetars.json.gz` | 2.7 kB | 25 magnetars of the McGill catalogue, merged into the pulsars when they load (§2, Magnetars) |
| `public/data/deepsky/snrs.json.gz` | 10 kB | 205 supernova remnants |
| `public/data/deepsky/gw-events.json.gz` | 22 kB | 282 gravitational-wave mergers |

Each is gzipped JSON of `{ meta, columns, rows }`: the column names once, a row's values in their order
(`src/sim/deepsky/format.ts` reads them and checks the schema). None is part of the first load: see section 4.

```
npm run data:deepsky     # all four builds; each fetches its raw files into data-raw/ only when missing
```

## 2. Distances: nothing is placed without one

A 3D map needs a distance, and OpenNGC gives none. An object is placed only where an openly licensed source measured
how far it is; everything else is counted in the log and left out. Nothing is placed at a guessed distance.

### NGC and IC (OpenNGC, 13,319 objects once its 651 duplicate entries are folded into their masters)

| Kind | Placed | From | Left out |
| --- | --- | --- | --- |
| Galaxies, pairs, triplets, groups (10,750) | 3,902 | Cosmicflows-4 (matched by PGC number) | 4,312 with no measured distance in either source; 56 with two survey galaxies within 6″, 25 whose redshifts disagree |
| | 778 | DESI DR1 redshift (matched on the sky) | |
| | 1,731 | SDSS DR17 redshift (matched on the sky) | |
| Open clusters, globulars, clusters with nebulae (923) | 309 | Hunt & Reffert 2024 (Gaia DR3; matched by name, astrometric S/N ≥ 5, type "open") | 145 |
| | 74 | Baumgardt & Vasiliev 2021 (the app's globular clusters) | |
| | 271 + 41 | the Large and Small Magellanic Clouds' distances | |
| Planetary nebulae (130) | 55 | the Gaia EDR3 parallax of the central star (SIMBAD's identification), S/N ≥ 5 | 67 |
| Other nebulae (233) | 44 | the Magellanic Clouds' distances | 163 |
| Stars, double stars, associations, novae, "other", nonexistent (1,283) | | | not deep-sky objects |
| Already in the app | 144 (27 galaxies, 83 clusters, 34 nebulae) | kept their own records | |

- **Galaxies, Cosmicflows-4.** OpenNGC's cross-identifications give each galaxy's PGC number; Cosmicflows-4's table 2
  is keyed by it. The galaxy is placed exactly where the cosmic web draws the same row (the web's own columns and its
  `recommended` distance: its group's measured distance within 30 Mpc, its group's redshift beyond 60, blended
  between; `src/sim/cosmos/cosmicWeb.ts`), and anchored as its group is in the expanding universe. The tests check every
  one against the web. The card's range is the distance modulus's own uncertainty.
- **Galaxies, DESI and SDSS.** The rest are matched to the galaxy surveys as built (`public/data/survey/`): a single
  survey galaxy within 6″ of OpenNGC's position (median separation 1.6″, 95th percentile 3.3″: the tiles keep
  directions to 5″), and, where OpenNGC gives a redshift, at a distance within 500 km/s of it. Placed where the survey
  layer draws it; the card says a redshift distance is blurred by about 4 Mpc (300 km/s of peculiar motion).
- **Open clusters** by name in Hunt & Reffert 2024 (its `Name` and `AllNames`), with its 16th–84th percentile range.
- **Globular clusters** from the app's own `clusters.json.gz` (Baumgardt & Vasiliev 2021; Harris 2010 for five), so
  the marker sits on the cluster's glow.
- **Planetary nebulae:** SIMBAD gives many planetary nebulae the parallax of their central star; only Gaia EDR3's
  (I/350) are used, only at 5σ or better, with the global zero point of Lindegren et al. (2021, −0.017 mas), as
  1/parallax with the ±1σ range. No published catalogue of planetary-nebula distances was found under a licence that
  allows redistribution (Frew et al. 2016 is MNRAS copyright; González-Santamaría et al. 2021 and Chornay & Walton 2021
  are A&A 2021 papers without an open licence), so those were not used.
- **The Magellanic Clouds:** a cluster or nebula within 8° of the LMC's centre (3.5° of the SMC's) that is not found in
  the Milky Way's catalogues first (NGC 1901 is a Galactic cluster in front of the LMC; 47 Tucanae and NGC 362 are
  Galactic globulars in front of the SMC) is placed at its Cloud: on the LMC's tilted disc (49.59 kpc, Pietrzyński et
  al. 2019; the disc of van der Marel & Kallivayalil 2014, as `src/sim/cosmos/named.json` has them), at the SMC's
  distance (62.44 kpc, Graczyk et al. 2020). The card says where it lies within the Cloud is not measured.
- **Other nebulae** of the Milky Way (HII regions, reflection nebulae) have no open distance catalogue and are left out.
- **Already in the app:** an object whose designation, Messier number or common name is the name or an alias of one of
  the app's own bodies (`named.json`, the Local Volume Database's galaxies, `nebulae.json`, the famous clusters), or a
  galaxy within an arcminute of one, is not written again; its designations go to `ngc-existing.json.gz`, and "Where
  to?" takes "NGC 224" to the Andromeda Galaxy.

### Pulsars (ATNF Pulsar Catalogue 2.8.1, 4,393 pulsars)

The catalogue's own best distance (psrcat's `DIST`, as `defineParams.c` works it out): an independent distance first
(`DIST_A`: a globular cluster's, an association's, HI absorption, 458), then a parallax at more than 3σ (49), then
published limits (30), then the dispersion measure through the YMW16 model of the Galaxy's free electrons (3,642). Left
out: 140 whose dispersion measure is more than YMW16 can account for (the model then returns 25 kpc, a stand-in rather
than a distance) and 74 with no distance at all. A card whose distance comes from the dispersion measure says so in its
one plain line: such distances are often off by a quarter and sometimes by a factor of two (Yao, Manchester & Wang
2017).

### Magnetars (McGill Online Magnetar Catalog, 30 entries; 25 placed)

The magnetars of the McGill Online Magnetar Catalog (Olausen & Kaspi 2014, ApJS 212, 6;
https://www.physics.mcgill.ca/~pulsar/magnetar/main.html), its main table `TabO1.csv` retrieved 9 October 2026, built
into `public/data/deepsky/magnetars.json.gz` (2.7 kB) by `scripts/build-magnetars.mjs`. The catalogue page allows the
information to be used freely provided the paper is cited and the page's address given; the numbers are quoted with
that citation. Each keeps the catalogue's spin period P and its derivative Ṗ (an upper limit where it says so), the
surface dipole field it infers from them (B = 3.2 × 10¹⁹ (P Ṗ)^½ G), the spin-down power, the characteristic age, the
2–10 keV luminosity, its associations, the bands it is seen in and its activity, and its distance with the reference the
catalogue gives (its reference code turned into the ADS bibcode linked on the catalogue's page). Placed: the 24 with a
period and a distance, and SGR 1935+2154, whose distance the catalogue leaves blank, at 6.6 ± 0.7 kpc from its remnant
G57.2+0.8 (Zhou et al. 2020, ApJ 905, 99). Left out: SGR 1833−0832 (no distance) and five candidates with no period.

The magnetars are loaded with the pulsars and merged into them (`mergeMagnetars`): the 15 that the ATNF catalogue also
lists (matched by position within 30″, or 1.5 times the McGill position error where larger: Swift J1818.0−1607's
position is a burst's) keep their ATNF entry and id, gain the McGill values and the McGill distance, and are named by
their usual names ("SGR 1806−20", the ATNF J name an alias); the 10 others are added (ids `magnetar-…`). Each is a body
while the pulsars are loaded (there are few), with its own marker (magenta, a dot in a faint ring, beating with its
spin, shown from 1.5–6 kpc), and a card: its field, Ṗ, spin-down power, X-ray luminosity and age; a line when its X-ray
light outshines its spin-down power (the field's decay powers it); and the story of the four known for an event:
SGR 1806−20's giant flare of 27 December 2004 (Hurley et al. 2005, Nature 434, 1098; Palmer et al. 2005, Nature 434,
1107), SGR 1935+2154's fast radio burst of 28 April 2020 (CHIME/FRB Collaboration 2020, Nature 587, 54; Bochenek et
al. 2020, Nature 587, 59), SGR 0526−66's flare of 5 March 1979 (Mazets et al. 1979, Nature 282, 587) and SGR 1900+14's
of 27 August 1998 (Hurley et al. 1999, Nature 397, 41).

Up close (`scene/PulsarModel.tsx`, `pulsarModel.ts`) a magnetar is the pulsar model with a twisted magnetosphere: five
shells of closed dipole loops from 1.8 to 12 star radii, each turned about the magnetic axis along its length so its
footpoints differ by one radian, the twist that carries the currents thought to power magnetars' X-rays (Thompson,
Lyutikov & Kulkarni 2002, ApJ 574, 332); the loops and the size of the twist are a model, drawn in false colour. Its hot
spots are where loops of four star radii meet the surface, 30° from the magnetic poles. It has radio beams, and the
pulsar model's outer field out to its light cylinder, only if it has been seen pulsing in radio (the catalogue's bands include R: 1E 1547.0−5408, PSR J1622−4950, SGR J1745−2900,
XTE J1810−197, Swift J1818.0−1607, SGR 1935+2154). It is framed by its loops, not its light cylinder.

### Supernova remnants (Ranasinghe & Leahy 2022, 215 remnants)

Their table 1 (CC BY 4.0, via VizieR J/ApJ/940/63) gives each remnant of Green's catalogue with a distance, recalculated
on one rotation curve where it rests on a velocity. The revised distance where given, else the literature's (the middle
of a range); left out: 7 with only a limit; 3 kept their own records (the Crab Nebula, Cassiopeia A, the Cygnus Loop,
which the app shows with pictures). 18 rest on a model's estimate or an inference (Sedov models, diameters, spiral-arm
membership), which their card says. **Green's catalogue itself** (Green 2025, J. Astrophys. Astron. 46, 14; copyright
D. A. Green, with no licence for redistribution) is not copied: a remnant's place is the galactic longitude and
latitude its Green name carries (to 0.1°), and its size, flux and type are left out, so its marker is a ring of fixed
size. Common names (W44, IC 443, Vela…) are added for 44 well-known remnants.

### Gravitational-wave events (GWTC via GWOSC, 391 entries)

Every entry of the cumulative GWTC list with a parameter estimate: 282 (273 black hole + black hole, 7 black hole +
neutron star, 2 neutron star + neutron star). The masses, final mass, luminosity distance and effective spin are the
preferred estimate's, with their 90 % intervals; the kind follows the masses' medians (a component under 3 M☉ counts as
a neutron star, as the catalogue's papers class them). Each sky map (multi-order HEALPix, from the parameter-estimation
releases of GWTC-2.1, GWTC-3, GWTC-4.1 and GWTC-5.0 on Zenodo) gives three numbers: its most probable direction, the
area of its 90 % credible region (median 1,474 deg², from 6 to 31,574) and how much of that region lies within 1.5
radii of the peak (under 75 % for 189 maps: two or more patches). GW170817 is placed on its kilonova's galaxy NGC 4993
with the catalogue's 16 deg². The luminosity distance and its 90 % interval are turned into comoving distances in the
app's Planck 2018 cosmology.

## 3. How they show

- **Markers** (`src/sim/deepsky/markers.ts`, twinned by the shaders and by picking, so what is drawn is what can be
  clicked). An extended object (a cluster, a nebula, a galaxy) is a thin ring of its true size once that is a pixel or
  two across, and fades as the camera comes up to it; a compact one is a small mark within a distance of its kind (a
  planetary nebula within 0.6–2 kpc, a remnant 1.5–4 kpc, a pulsar 0.4–1.2 kpc). From home a few hundred show, not
  thousands. The selected object's marker always shows. In flight the markers are aberrated like stars; near a black
  hole they fade out while its lens is drawn.
- **Pulsars** beat with their spin: at the real period if it is 0.25 s or longer, else slowed by the least power of ten
  that makes it so (the Crab ten times, a millisecond pulsar a thousand), and the card says by how much. The beat is a
  narrow brightening from a dim floor, not a flash.
- **Mergers** are soft regions, not points: five faint discs along the line of sight from the near to the far end of
  the distance's 90 % interval, each as wide as the 90 % sky region at its distance, together a cone's frustum. A region
  shows while it is a few to a hundred pixels across (the selected one to 250: wider would outgrow the largest point many
  GPUs draw), so from near home only the best-localised show. They take part in the expansion like the galaxies.
- **Labels** only for the selected object and the best-known: bodies are registered while their catalogue is loaded
  for objects with a common name or a Messier number, eleven famous pulsars (labelled within 30 pc) and six famous
  mergers. Any other object becomes a body only when chosen (picked, found, flown to) and is released a few seconds
  after nothing holds it.
- **Cards** are short: what it is, the distance with its range, one sentence with the key numbers, one plain line where
  the place is a model or uncertain; the sources are under the folded "Sources".
- **The View menu** has "Deep-sky objects", "Pulsars" and "Gravitational-wave events", each 'auto' by default: the
  Milky Way's catalogues from among the stars (0.2 pc from the Sun) out to 150 kpc, the galaxies and mergers from 30 kpc.

## 4. Loading and cost

Nothing of this is in the first load: the code (the runtime, the records, the scene and the shaders) is a chunk of its
own, fetched with the first catalogue that is wanted, and each catalogue's file when its layer first shows, when
"Where to?" opens (it searches them all) or when its layer is turned on. A failed fetch is tried again after 2 s, 4, 8…
up to a minute (`src/lib/retry.ts`).

GPU cost, measured with `window.__ls.perf.ab` on the reference laptop's GPU (Intel integrated, Chrome with ANGLE
Direct3D 11), a 2,880 × 1,620 canvas at pixel ratio 2, all three layers on against all off, five interleaved rounds,
1 October 2026:

| View | Frame, layers on | Cost (median of the rounds' differences) |
| --- | --- | --- |
| NGC 1850 in the LMC (every catalogue showing) | 8.35 ms | 0.17 ms |
| The Vela Pulsar, 280 pc out | 14.5 ms | 0.10 ms |
| M101, 7 Mpc out | 7.97 ms | 0.12 ms |
| GW190814's region, 260 Mpc out | 8.57 ms | 0.15 ms |

The first version drew rings and regions up to 400 px across and cost 0.68 ms in the LMC view (at 996 × 1,084): fill
is the cost of point sprites on this GPU, so no marker is drawn wider than 200 px (a region 70 px, the selected one
250), and the framing of the objects keeps theirs within that. The markers are a few thousand points culled in the
vertex shader unless near or big enough.

## 5. Magnetic field lines: pulsars, magnetars, the Double Pulsar and GW170817

With View › Magnetic field lines on (off by default), the close-up of a pulsar, a magnetar or a pair of neutron stars
draws the star's whole magnetosphere in place of its few loops, and GW170817's model draws the two stars' fields as they
merge. With the switch off nothing of this is made or drawn: the close-ups are as in §2. Everything here is a **model**:
no neutron star's field has been mapped. What is measured is each pulsar's spin period and its slowing, which give its
light cylinder and the strength of its dipole; the shapes come from published solutions. The cards say so, and give the
numbers.

Code: `src/sim/deepsky/magnetosphere.ts` (the pulsars' and magnetars' lines, the striped wind's sheet, the Double
Pulsar's magnetopause) and `mergerField.ts` (GW170817), with their tests; `src/render/pulsarMaterials.ts`
(`createMagnetosphereMaterial`, `createSheetMaterial`) and `src/render/mergerFieldMaterial.ts`; `src/scene/PulsarModel.tsx`
and `src/scene/MergerField.tsx`.

**Measured, per pulsar** (ATNF; McGill for the magnetars): the spin period P, which sets the light cylinder
R_LC = cP/2π (the Crab's 1,590 km, a millisecond pulsar's under 100 km, a magnetar's 10⁵ km), and its slowing Ṗ, which
sets the dipole field the catalogues quote, B = 3.2 × 10¹⁹ (PṖ)^½ G (the Crab's 3.8 × 10¹²). The card gives both where
it has room, the data sheet always. The tilt of the magnetic axis α and of the spin axis to us ζ are the close-up's own
(§2): measured for the Crab, Vela and the Double Pulsar, chosen for the rest.

**A pulsar's magnetosphere**, in the frame turning with the star; it turns with the beams' spin phase, so lines and
beams keep step:

- *The closed zone*: dipole loops r = L sin²θ about the magnetic axis, nine shells from 0.07 R_LC to the last closed
  line, L = R_LC, which touches the light cylinder at the "Y-point" where the force-free aligned rotator's closed zone
  ends (Contopoulos, Kazanas & Fendt 1999, ApJ 511, 351). The force-free solutions are near a dipole inside about half
  the light cylinder; nearer it their closed lines bulge out, which is not drawn.
- *The open lines*: from the polar cap, sin²θ_pc = R/R_LC (Goldreich & Julian 1969; the Crab's cap is 5° in radius),
  dipolar out to three-quarters of the light cylinder, then bending over to run radially at the split monopole's angle
  θ∞ = acos(1 − f) for a footpoint holding a share f of the cap's flux (Michel 1973, ApJ 180, L133: a monopole's flux is
  uniform in cos θ), so the last open line runs into the equator at the Y-point, as in CKF 1999 and Spitkovsky 2006
  (ApJ 648, L51). The force-free solutions open somewhat more flux than the dipole's cap; the cap here is the dipole's.
- *The winding*: each open line is wound back about the spin axis as the Goldreich–Julian current makes it,
  B_φ/B_p = −ϖΩ/c, one radian per light-cylinder radius of poloidal length: the split monopole's Archimedean spiral
  beyond the light cylinder (Michel 1973). Drawn out to five light-cylinder radii.
- *The striped wind*: an oblique rotator's open field reverses across a current sheet that follows the magnetic equator
  outwards at about c, m̂(t − r/c)·r̂ = 0: an undulating spiral sheet reaching exactly the latitudes ±α (Bogovalov
  1999, A&A 349, 1017; Spitkovsky 2006 found it in the force-free oblique rotator). It is drawn as a faint surface,
  brightest where seen edge-on, with ridges where it folds; the wind's lines take the sign of m̂(t − r/c)·r̂, so at a
  fixed latitude within ±α they alternate in stripes half a wavelength (πR_LC) apart.
- *Spin-down*: the force-free oblique rotator loses L = (μ²Ω⁴/c³)(1 + sin²α) (Spitkovsky 2006), twice as much at
  α = 90° as aligned. Used by the tests only (with the catalogue's field convention the Crab's comes within a factor of
  three of its measured 4.5 × 10³⁸ erg/s).

**Magnetars**: the close-up's twisted loops (§2), denser (nine shells, twenty azimuths), reaching out to where the
dipole field has fallen to B_1keV = 8.6 × 10¹⁰ G, the field at which the electrons' cyclotron energy is 1 keV and the
twisted field's currents scatter the star's X-rays (Thompson, Lyutikov & Kulkarni 2002's resonant scattering zone):
r = R (B/B_1keV)^⅓, so each magnetar's measured spin-down field sets the size of its drawn field, from 4 star radii for
SGR 0418+5729 (6 × 10¹² G) to 28 for SGR 1806−20 (2 × 10¹⁵ G). The twist, about a radian between a loop's footpoints,
is TLK 2002's; its size in any one magnetar is not measured. The cards say their fields are 100 to 1,000 times a normal
pulsar's.

**Binary pulsars**: both stars of a pair get their magnetospheres. The companion of a pulsar that is not itself seen
pulsing is drawn with the close-up's chosen 1 s spin, so the size of its field is an illustration (its spin and field
are not measured). **The Double Pulsar** is the exception, and measured: pulsar A's wind presses on B's magnetosphere,
and the eclipses of A's pulses by B's closed field, flickering at B's spin, were modelled by Lyutikov & Thompson (2005,
ApJ 634, 1223). B's field ends at the magnetopause where A's wind pressure Ė_A/(4πcD²) equals B's magnetic pressure,
B's dipole written through its own spin-down: R = (cD/Ω_B)^½ (Ė_B/Ė_A)^¼, 4 × 10⁹ cm at D = 8 × 10¹⁰ cm (their eq. 4,
with Ė_A = 5.8 × 10³³ and Ė_B = 1.6 × 10³⁰ erg/s), worked out each frame at the stars' separation. B's dipole loops (out
to 2.5 R_mp) are moved in as r′ = r_lim tanh(r/r_lim), r_lim = R_mp towards A growing to six times that straight
downwind (in the vertex shader; `confinedField` is its CPU twin, for the tests): compressed on the day side, drawn out
into a tail, as Earth's field is by the solar wind. The tail's length is illustrative.

**GW170817** (`mergerField.ts`): the stars' fields were not measured; about 10¹² G each is assumed, typical of the old
neutron stars of the binary pulsars.

- *Inspiral*: each star's dipole carried round with it, the moments chosen anti-parallel with one tilted 30° (their
  orientations are not known). Drawn as the vacuum field of the two dipoles, traced once in units of the separation
  (its shape is the same at every separation; RK4 from seeds round each star, both ways along the field) and scaled to
  the separation each frame. Lines that join the two stars are twisted a radian about the line between them: the
  force-free simulations find the flux tube joining them twisted by the orbit and released in flares (Palenzuela et al.
  2013, PRL 111, 061105; Most & Philippov 2020, ApJL 893, L6; Most & Philippov 2023, PRL 130, 245201). The whole is
  swept back beyond the orbit's light cylinder c/Ω (Ω from Kepler's law: seven separations out 12 s before the merger,
  2.4 at contact).
- *Merger*: the joined field reconnects in a burst, its lines torn and flung outwards at nearly c with a white flash,
  to about 1,000 km: really over a few milliseconds, shown over a quarter of a second (the scene runs the first three
  seconds at their real pace).
- *Remnant*: the field amplified a thousandfold or more within milliseconds by the shear between the stars (the
  Kelvin–Helmholtz instability: Kiuchi et al. 2015, PRD 92, 124034, from 10¹³ G by at least 10³ in 4–5 ms), wound
  round the axis, and about 60 ms after the merger an ordered helical field along the axis, the funnel of an incipient
  jet (Ruiz et al. 2016, ApJL 824, L6: about 4,000 M after the merger for stars of 1.625 M☉, around a black hole of spin
  0.74 with a disc lasting about 0.1 s, the field above its poles about 10¹⁶ G, the funnel's flow mildly relativistic,
  Γ ≈ 1.1–1.25). Drawn as the paraboloidal field of a hole of that spin and 2.6 M☉ (`sim/blackholes/holeField.ts`),
  drawn scaled up with the funnel's head as it grows at half the speed of light, its shape kept (a choice: GRB
  170817A's jet had broken out of the debris by the time of the gamma rays, 1.74 s after the merger). The field fades
  out between 1.5 and 3 s. The burst is smaller than the debris's glare: from a few thousand km it shows only as the
  inspiral's lines vanishing into the merger's flash.

**Look**: thin lines in false colour, cyan where the field points out of the star, amber where it points in, violet
across the tops of the closed loops; dashes flow along the field, the way it points. Added light, no depth writes.

**Scenes** (`content/scenes.ts`; each turns the switch on, and the next scene turns it back): "The Crab pulsar's
magnetosphere", "A magnetar's twisted field" (SGR 1806−20), "The Double Pulsar's magnetic fields" and "Two neutron
stars merge: their magnetic fields", also in Journeys. A pulsar's scene waits for the pulsar catalogue, which it asks
for.

**Cost**: nothing while the switch is off (nothing is even built). With it on, near a pulsar: its lines (about 25,000
segments for a pulsar, 11,500 for a magnetar, 9,000 for the Double Pulsar's B) built once in a few milliseconds, and the
wind's sheet (96 × 128 quads). GPU time measured on this machine is in the table below.
