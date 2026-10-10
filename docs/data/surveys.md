# The galaxy surveys

13,453,215 galaxies and quasars from DESI Data Release 1 and the SDSS, as a map of where they are, to redshift 3.5
(6,951 Mpc comoving, 22.7 billion light-years). Built 30 September 2026. The data are the surveys' own catalogues,
merged without duplicates and placed by redshift in the app's Planck 2018 universe; the app streams them as an octree
of small files once the camera leaves the local universe, and draws a budget of them as points with the light of the
rest as glows. Code in `scripts/build-surveys.mjs` (the build), `src/sim/surveys/` (the format, the octree, the
matching, the loading and the choice of nodes), `src/scene/Surveys.tsx` and `src/render/surveyGlow.ts` (the drawing),
`src/render/shaders/galaxyMap.glsl`, `survey.vert.glsl` and `surveyGlow.vert.glsl`.

With them, from 500 Mpc out, 866,298 quasars over the whole sky from Quaia, the Gaia–unWISE quasar catalogue: those the
surveys do not have, with distances from Gaia's rough redshifts, drawn as streaks along the line of sight as long as
the distances are uncertain (§10); and beside them 810,059 galaxies of Gaia DR3 with redshifts from their low-resolution
spectra, out to z = 0.6, drawn the same way (§11). The Milky Way's plane stays empty: no survey sees through it.

## 1. Outputs

| File | Size | What |
| --- | --- | --- |
| `public/data/survey/hierarchy.bin.gz` | 81.7 kB | the octree's 2,699 nodes: children, galaxy counts, file sizes, bounding boxes, and each node's own galaxies' summed light, centroid and spread |
| `public/data/survey/r<octants>.bin.gz` | 2,699 files, 63.7 MB in all; median 11 kB, largest 102 kB | one node each: its galaxies (position, kind, luminosity) and its eight octants' glows |
| `docs/data/surveys-build-log.txt` | | the build's counts, cuts and sizes |
| `public/data/survey-quaia/hierarchy.bin.gz`, `r<octants>.bin.gz` | 10.5 kB; 364 files, 9.37 MB in all, median 10 kB, largest 106 kB | Quaia's quasars and Gaia DR3's galaxies in the same format, each with its distance error (§10, §11) |
| `docs/data/quaia-build-log.txt` | | that build's counts and sizes (both parts) |

4.73 bytes a galaxy. Every file is under 1 MB (the build refuses otherwise). The files' base URL is one constant,
`SURVEY_BASE_URL` in `src/sim/surveys/load.ts` (default the site's own `/data/survey/`): to serve the tiles from
another host, set it to that host's URL (ending in `/`; the host must allow this site to fetch from it) and copy the
directory there.

Galaxies per catalogue as shipped (after the merge and the removal of the Cosmicflows-4 galaxies):

| Catalogue | Rows read | Kept | Left out |
| --- | --- | --- | --- |
| DESI DR1 Bright Galaxy Survey (BGS_ANY) | 5,522,353 | 5,509,541 | 12,812 in Cosmicflows-4 |
| DESI DR1 luminous red galaxies (LRG) | 2,138,627 | 2,079,804 | 58,823 also BGS (same TARGETID) |
| DESI DR1 emission-line galaxies (ELG_LOPnotqso) | 2,432,072 | 2,431,320 | 752 also BGS or LRG |
| DESI DR1 quasars (QSO) | 1,223,391 | 1,223,110 | 281 also another tracer |
| SDSS-I/II galaxies (DR17 SkyServer) | 861,062 | 556,494 | 747 at z ≤ 0.002; 277,928 in DESI; 25,893 in Cosmicflows-4 |
| SDSS-III BOSS DR12 LOWZ + CMASS | 1,325,856 | 867,953 | 174,534 with IMATCH = 2; 282,583 in DESI or SDSS-I/II; 665 in Cosmicflows-4 |
| SDSS-IV eBOSS DR16 LRG | 174,816 | 142,974 | 31,842 already in |
| SDSS-IV eBOSS DR16 ELG | 173,736 | 172,537 | 1,199 already in |
| SDSS-IV eBOSS DR16 QSO | 343,708 | 210,892 | 132,816 already in |
| SDSS DR16Q | 750,414 | 258,590 | 665 not IS_QSO_FINAL = 1; 10,348 beyond z = 3.5; 480,803 already in; 1 in Cosmicflows-4 |
| **All** | | **13,453,215** | |

By class: red 5,991,286, blue 5,764,538, grey (no colour) 4,799, quasars 1,692,592. By comoving distance: 4,581 within
50 Mpc, 28,546 within 100, 386,082 within 300, 2,234,065 within 750, 5,561,514 within 1,500, 8,823,419 within 3,000,
the rest to 6,951 Mpc.

The research estimated 13.76 million: that included 254,866 galaxies of 6dFGS and 2dFGRS, which are not shipped (their
pages give no licence), and the 48,235 Cosmicflows-4 matches it counted included 6dFGS's; without those two surveys the
same merge gives 13.50 million, and the z ≤ 3.5 cut and the Cosmicflows-4 removal (39,371) bring it to 13.45.

## 2. The build

```
npm run data:surveys      # node --max-old-space-size=8000 scripts/build-surveys.mjs; about 3 minutes, 1.5 GB of memory
```

Node 24, no dependencies: a small FITS reader (`scripts/surveys/fits.mjs`, streaming, so the 478 MB BGS file is never
held whole), and the app's own modules imported directly (Node strips their types): the cosmology
(`src/physics/cosmology`), and `src/sim/surveys/format.ts`, `match.ts` and `tile.ts`, which the tests exercise too.
Seeded, so a rerun from the same inputs writes the same files.

Inputs, in `data-raw/surveys/` (git-ignored; fetched only when missing, about 1.9 GB):

| File | Origin |
| --- | --- |
| `desi/{BGS_ANY,LRG,ELG_LOPnotqso,QSO}_{NGC,SGC}_clustering.dat.fits` | https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/ |
| `sdss/galaxy_DR12v5_CMASSLOWZTOT_{North,South}.fits.gz` | https://data.sdss.org/sas/dr12/boss/lss/ |
| `sdss/eBOSS_{LRG,ELG,QSO}_clustering_data-{NGC,SGC}-vDR16.fits` | https://data.sdss.org/sas/dr17/eboss/lss/catalogs/DR16/ |
| `sdss/dr16q_vizier.csv` | VizieR TAP, VII/289 (RAJ2000, DEJ2000, z, r_z, QSO, zPipe, q_zPipe) |
| `sdss/legacy_dr17_ra{0-150,150-200,200-360}.csv` | SkyServer DR17 SQL: `SpecObj` with `survey = 'sdss'`, `class = 'GALAXY'`, `zWarning = 0`, `sciencePrimary = 1`, joined to `PhotoObj` for modelMag g, r, petroMag r and extinction g, r (the query is in the script) |
| `licences/*.html` | the DESI data licence and acknowledgement page, SDSS's image-use policy and the SDSS-I/II, III and IV acknowledgement pages |

The build checks the licences before it writes anything: DESI's page must still say CC BY 4.0 and its acknowledgement
paragraph must be the one `CREDITS.md` quotes word for word; SDSS's must still say its data are in the public domain.

## 3. Sources and licences

| Data | Source | Licence / terms |
| --- | --- | --- |
| DESI DR1 large-scale-structure catalogues v1.5 | DESI Collaboration et al. 2026, "Data Release 1 of the Dark Energy Spectroscopic Instrument", AJ 171, 285 (arXiv:2503.14745); Ross et al. 2025, JCAP 01, 125 | CC BY 4.0: cite the DR1 paper, indicate changes (below and in `CREDITS.md`), include DESI's acknowledgement text (`CREDITS.md` and the About page's sources, verbatim) |
| SDSS DR17 | Abdurro'uf et al. 2022, ApJS 259, 35; the SDSS-I/II main sample (Strauss et al. 2002, AJ 124, 1810), BOSS DR12 (Reid et al. 2016, MNRAS 455, 1553), eBOSS DR16 (Ross et al. 2020, MNRAS 498, 2354; Raichoor et al. 2021, MNRAS 500, 3254), DR16Q (Lyke et al. 2020, ApJS 250, 8) | "considered in the public domain" (sdss.org image-use policy); the SDSS-I/II, SDSS-III and SDSS-IV acknowledgements requested (`CREDITS.md`, the About page) |

The changes made (as CC BY asks): rows selected (below); duplicates removed; galaxies in Cosmicflows-4 removed;
redshifts taken to the CMB frame and turned into comoving positions in the Planck 2018 cosmology; a class and an r-band
luminosity added; positions rounded to 5″ and 0.125 Mpc; tiled into an octree with summed glows.

Not used: 6dFGS, 2dFGRS and GAMA (no licence found on their pages), targets not yet observed, and any model of the
unobserved universe. Quaia (CC BY 4.0) is used, as a part of its own whose distances are shown as rough (§10), and with
it Gaia DR3's galaxies with redshifts (CC BY-NC 3.0 IGO, as the star catalogue's Gaia values; §11). The other whole-sky
catalogues weighed for the sky beyond DESI and the SDSS, and why they are not used, are in §11.

## 4. What is done to the catalogues

**Kept.** The DESI and eBOSS clustering catalogues as delivered (their own quality cuts: good redshifts, vetoed areas
removed). SDSS-I/II galaxies with `zWarning = 0`, `sciencePrimary = 1`, class GALAXY and z > 0.002. BOSS rows with
`IMATCH = 1` (IMATCH = 2 are SDSS-I/II spectra re-used). DR16Q rows with `IS_QSO_FINAL = 1` and z > 0. Everything to
z = 3.5: DESI's quasar sample stops there, and above it DESI's Lyman-alpha quasar redshifts are biased (DR1 known
issues); it leaves out 10,348 DR16Q quasars (to z = 7.0), one constant in the script (`Z_MAX`) to change.

**Merged.** DESI's tracers by TARGETID, in the order BGS, LRG, ELG, QSO (the first keeps the galaxy). Then each SDSS
catalogue in turn, SDSS-I/II, BOSS, eBOSS LRG, ELG, QSO, DR16Q, against everything before it on the sky: an entry within
1.5″ of an earlier one is the same galaxy, whatever the redshifts say, and the earlier survey keeps it (DESI's
redshifts are newer and more precise: 12 km/s median difference from SDSS-I/II spectra, 27 from BOSS, 169 from DR16Q,
as the research measured). The matching (`src/sim/surveys/match.ts`) sorts the points into cells of declination bands
and right-ascension runs as wide as the radius, so a query looks in a few cells and checks the true angle, across 0h/24h
and at the poles too. Then the galaxies that are in Cosmicflows-4 (`public/data/cosmic-web.bin.gz`): within 6″ (its PGC
positions are coarser) and within 800 km/s in CMB-frame velocity, so a background galaxy behind a nearby one stays.
39,371 are left out, so no galaxy is drawn twice; the cosmic web keeps its measured distances and groups.

**Placed.** Each heliocentric redshift is taken to the CMB frame, 1 + z_cmb = (1 + z_hel) γ (1 + β cos θ) (the Sun's
369.82 km/s toward galactic (264.021°, 48.253°), Planck 2018 I), and turned into a comoving distance by the app's own
cosmology module (Planck 2018; tabulated every 0.0001 in z, within 0.001 Mpc of the module), along the galaxy's ICRS
direction in the app's world axes (world = (x_ecl, z_ecl, −y_ecl), obliquity 84,381.448″). The tests check these
constants against the app's.

These are **redshift-space** positions: a galaxy is placed as if all of its redshift came from the expansion. Its own
motion (a few hundred km/s, over 1,000 in a rich cluster) moves it along our line of sight by about 1.6 Mpc per
100 km/s at any redshift the surveys reach, so clusters are drawn as spikes pointing at the Solar System (the "fingers
of God", Jackson 1972) and walls look thinner than they are (Kaiser 1987). From anywhere else the spikes still point
at us: it is a map made from Earth. The layer's card says so in one line.

**Classed.** Four classes, coloured as the cosmic web's (orange, blue, grey) plus a pale violet for quasars:
red for LRG, BOSS and eBOSS LRG; blue for ELG and eBOSS ELG; quasar for the QSO samples and DR16Q; and for the BGS and
SDSS-I/II galaxies, red or blue by their observed g − r (dereddened), at the trough of the colour distribution
measured in each redshift bin of 0.02: 0.65 at z = 0.03 rising to 1.59 at z = 0.47 (the K-correction reddens the red
sequence with redshift), with a straight line fitted to the measured troughs beyond z = 0.5. The SDSS-I/II galaxies'
own troughs, measurable only below z = 0.1, agree with BGS's within 0.04 mag, so BGS's cut parts both. 4,799 SDSS
galaxies without photometry are grey.

**Luminosity.** In the r band where the catalogue has photometry (BGS: its dereddened flux; SDSS-I/II: petroMag r less
extinction; BOSS: MODELFLUX r less extinction): M_r = m_r − DM(z) + 2.5 log10(1 + z), with only the bandwidth term of
the K-correction, relative to M*_r = −21.2 (Blanton et al. 2003, h = 0.7, the convention of the web's Ks L*), kept in
0.05 dex. 6,929,146 have one. The rest (DESI LRG, ELG, eBOSS, the quasars) take the median of the measured ones of their
class beyond z = 0.4 (log L/L* = 0.23 red, 0.24 blue), quasars that of an L* galaxy: a class median, so their points
are all one size. Joining DESI's photometry by TARGETID (NOIRLab's Astro Data Lab) would give them their own; not done.

## 5. The octree

(`src/sim/surveys/format.ts`, `tile.ts`.) A cube of 32,768 Mpc (it holds the whole observable universe, 14,165 Mpc in
radius), the Sun at one third of each axis, so that no level puts a boundary near the Sun (1/3 is 0.0101… in binary);
the research measured that this draws 82 % of the galaxies within 100 Mpc of a camera at the Sun where a centred cube
drew 16 %. Each node keeps up to 16,384 galaxies: the galaxies are taken in one seeded random order and each goes down
from the root to the first node on its way with room. So each node is a random sample of its cube's galaxies that no
ancestor kept, a fair sample of where galaxies are at every level, and every galaxy is stored once. 2,699 nodes, 9 levels
below the root.

**A node's file.** A 16-byte header; the eight octants' glows (per octant the summed display light of each class, the
light-weighted centroid from the node's centre and the rms radius, float32); then the galaxies grouped by precision
tier, each group quantised to the node's corner at a step of 0.125 Mpc / 2^k, sorted along a Morton curve on the first
17 bits of each axis and stored as LEB128 varint differences, with any bits below packed after; then a kind byte (class,
catalogue) and a luminosity byte per galaxy. A galaxy's tier is the coarsest whose worst error (half a cell's diagonal)
keeps its direction from the Sun within 5″ and its distance within 0.125 Mpc; the tests decode nodes and check every
galaxy against both. The app decodes a node in its worker into float32 positions from the node's centre and draws them
with the node's centre as seen from the camera computed in float64, so neither a camera 14 Gpc out nor a galaxy 7 Gpc
away loses precision.

**The hierarchy.** Per node: its children, its galaxy count and its subtree's, its file's size, its subtree's galaxies'
bounding box (65,535ths of its side, rounded outwards), and its own galaxies' summed light per class, centroid and rms
radius (16 bits each; light in 1,024 steps an octave). Decoding combines these into each subtree's summary. 44 bytes a
node.

## 6. Light: the display law and the glows

A galaxy's light on the screen is the product mapLight(L) × mapDepth(d) × (what the expansion and the ship do to its
light), `render/shaders/galaxyMap.glsl`, shared with the cosmic web. mapLight is the web's gentle luminosity law (0.6
(L/L*)^0.3 within 0.08 to 1, times (L/L*)^0.36 within 0.5 to 4); mapDepth the depth cue (1.4 × min(1 + 90 / d, 9) / (1 +
(d/D)²), falling as 1/d nearer than D and as 1/d² beyond); the rest, as the web's points, is the light of a black body
of the class's colour temperature seen at T D / (1 + z) (redshift from the cosmology's emission table at the camera's
epoch, the ship's Doppler factor), with Tolman's dimming and aberration, the expansion's dimming held to at most a
factor of 100 in flux beyond what the ship's own shift does (MAP_DIM_FLOOR, applied from z = 0.65 on, to the web's
points too): with all of it the galaxies seen from gigaparsecs away, whose light left them billions of years ago, came
out thousands of times fainter than those near the camera and the survey's far shells were black. The point's size only
shapes it: its alpha is its light over its area.

Because the law is a product, a cell of the octree can carry the sum of mapLight of all its galaxies, and a glow for the
cell with the other factors applied once holds the light of all of them. **The glows are a faint fill, not the light's
full account.** Each wholly drawn node's octants whose child is not drawn at all are glows holding that child's
subtree's light (the tests check it to 1 % on synthetic catalogues, and that splitting never changes it), drawn at the
share of the catalogue the points draw, at most GLOW_FILL (0.2): where points are drawn at 1.5 % of the galaxies the
glows show the rest at 1.5 % too, as a faint tint where the points thin out, not a haze over them. A first version drew
the glows with all of the undrawn galaxies' light, as the points' sum would suggest; from gigaparsecs out those hold 98
% of it and the survey was a fog with a sprinkle of points.

The glows are drawn as soft splats (a Gaussian 1.6 times as wide as the octant's spread seen from here: an octant's
light fills its cube, flat-topped, and narrower splats summed to a visible lattice) into a target of one sixteenth of
the view's resolution in each direction, added to the view in linear light. A glow that looks wide is split, largest
first, into its node's own galaxies and its children's subtrees, from the hierarchy's summaries (no download), until the
splats are narrower than 24 device pixels or 1,000 of them are drawn; the light is only divided, never changed. A glow
wider than 12 device pixels (1σ) fades out by 48 (render/galaxyMap.ts glowFade): a region that large on the screen is
drawn in points. The depth cue is averaged over each glow's spread (three points along the line of sight), since near
the camera an octant's galaxies are both near and far and the cue falls as 1/d²: at its centroid alone the octant round
the camera came out several times too bright.

**The depth scale** D (`render/galaxyMap.ts` mapDepthMpc) is 180 Mpc near home, as the web always had, and the camera's
distance from the Sun beyond that: the knee moves out with the camera, so from outside the survey the cue dims the
galaxies round home by a factor of 2, not by their distance squared, and nearer than 90 Mpc a galaxy is brightened as it
is from home (mapNear, 1 + 90 / d, at most 9). With the web's fixed 180 Mpc everything beyond about 1 Gpc was invisible
from out there.

**Looking back from far away.** The map shows where the surveys' galaxies are, from anywhere: a galaxy is left out only
beyond the particle horizon, where none of its light has arrived. (A first version also left out galaxies whose light,
reaching the camera, left before the earliest galaxy seen, MoM-z14 at z = 14.44; from 10 Gpc and more that emptied the
survey entirely, and the fans of its footprint are what the view from out there is for.) Nodes whose every galaxy would
be fainter than 1 % alpha even at its best (nearest, most luminous, hottest colour) are not drawn or fetched. Glows
whose brightest pixel could not reach 10⁻⁵ are left out, and with none left the glow target and its full-screen pass
are not drawn.

## 7. In the app

**When.** `ui/cosmicLayers.ts`: in the default 'auto' setting nothing is fetched until the camera is 30 Mpc from the
Sun; the layer then fades in, fully shown by 60 Mpc. Why 30 Mpc: within it the cosmic web draws the galaxies at their
measured distances, while a survey can only place a galaxy by its redshift, and there a galaxy's own motion (300 km/s
and more, over 1,000 in the Virgo cluster) is a large share of the expansion's (2,000 km/s at 30 Mpc), so redshift places
would be off by 15 % or more; from 30 to 60 Mpc the web itself goes over to redshift distances. And everything the tour
and the journeys visit nearby, the Local Group, the nearby galaxies and the Virgo cluster (16.5 Mpc), lies inside it:
most visits download none of it. The cosmic web's scene (200 Mpc out), Coma and the flights to the far universe do. The
View menu's "Galaxy surveys" turns it on (loading wherever the camera is) or off for good; its card says what the
points are, in two lines, and that they are placed by redshift. The layer fades out while a black hole's lens is drawn,
and is not drawn before the earliest galaxies or once a − 1 passes 10³⁰, as the web. Quaia's part loads only from 500 Mpc
out (§10).

**Loading** (`src/sim/surveys/load.ts`). The hierarchy once, then the nodes the frame's selection asks for, most wanted
first, six at a time, each fetched, inflated and decoded in a worker. A failed download is tried again after 2 s,
doubling each time to at most a minute (`lib/retry.ts`, shared with the star files), for as long as it is wanted: it
never gives up for the session. Up to 2.5 million galaxies stay decoded; beyond, the nodes least recently drawn go.

**Which nodes, and how much of each** (`src/sim/surveys/lod.ts`). The budget is spread over the whole visible volume,
not spent on the few nodes that look largest (a first version drew 6 nodes from 2 Gpc; now 16–25 from any view).
Each part of the sky draws a share k (pixels / galaxies)^0.3 of its galaxies, by its subtree's bounding box seen from
the ship (in flight its direction aberrated and its size divided by the Doppler factor there): the dense nearby survey
seen from afar gets more points, so its walls and filaments show, the thin far shells not so few that they vanish.
Going down from the root, a node draws what its ancestors' points leave missing of that share: all its galaxies (and
then its children are considered) or a part, at least a tenth, and nothing below it. k is the largest that fits the
budget (a bisection, 0.1–0.3 ms). A part is a fair sample: the worker puts each node's galaxies in a bit-reversed
order of the file's space-filling curve, so every prefix is spread evenly over the node, and the draw takes the first
so many (a draw range: nothing is copied). The choice is made over the whole hierarchy, loaded or not, so it does not
change as files arrive and no file is fetched that the view would not draw.

**The point budget** (`render/gpuBudget.ts` surveyBudget): 200,000 galaxies to start with, between 80,000 and 300,000.
The frame's GPU time is measured by the timer the black hole's lens uses (one query a frame, only while the layer is
drawn): after each 30 measured frames a median over 8.5 ms takes a fifth off the budget, one under 6.5 ms adds a tenth.
Only frames drawn as the laptop draws them count: while the page is hidden or frames are stepped by hand
(`window.__ls.step`, the perf tools) the GPU idles between frames and times them several times too slow, so the samples
are ignored and the budget is 200,000. Without the timer extension it stays there too. For a measurement,
`__ls.surveys.budget.pin(300000)` (or `pin = 300000`) holds it, and `pin(null)` lets it move again.

## 8. Performance and downloads

Measured on the target laptop (Intel Core 5 320, Intel Graphics, Chrome with ANGLE on Direct3D 11) in the development
build, 30 September 2026, with `window.__ls.perf`: pixel ratio 2, a 2,880 × 1,584 canvas (larger than the laptop's own
1,936 × 1,384, so the costs are on the high side), no multisampling, the point budget held at 200,000. The cost is
`perf.ab` with the layer on against off, interleaved, five rounds of four batches of 20 frames, the median of the
rounds' differences (they agreed within 0.15 ms); the frame is the whole frame's GPU time with the layer on. Downloads
are the bytes as stored (gzip; what Vercel sends) from a cold start of the layer at each view: the hierarchy (81.7 kB)
and the nodes the view draws. "Looking home" is from the direction of right ascension 318°, declination +48°, which
shows the northern and southern footprints as two fans.

| View | Downloaded | Files | Drawn: nodes, galaxies, glows | Survey's GPU cost | Whole frame |
| --- | --- | --- | --- | --- | --- |
| At Earth, and anywhere within 30 Mpc (default setting) | 0 | 0 | nothing | 0 | unchanged |
| 50 Mpc out (towards the north galactic pole, looking home) | 2.09 MB | 23 | 21, 200,000, 0 | | |
| 500 Mpc out (the same way) | 1.90 MB | 21 | 20, 200,000, 6 | 1.33 ms | 8.7 ms |
| The `cosmic-web` scene (200 Mpc out) | 2.07 MB | 23 | 16, 198,934, 0 | | |
| 2 Gpc out (`controller.placeAt('local-group', 6.2e22)`) | 1.84 MB | 21 | 20, 200,000, 51 | 1.62 ms | 9.3 ms |
| 5 Gpc out, looking home | 1.89 MB | 23 | 22, 200,000, 115 | 1.55 ms | 9.4 ms |
| 10 Gpc out, looking home | 2.12 MB | 26 | 25, 200,000, 327 | | |
| The edge of the observable universe (14 Gpc), looking home | 1.97 MB | 24 | 23, 200,000, 170 | | |

The whole frame read 7.4–7.8 ms without the layer in these runs (4.6–5.9 ms in earlier ones on a 2,560 × 1,224 canvas):
the machine was busier. The points cost about as much as their pixels: 200,000 sprites of 4 to 5 device pixels across at
these distances. The glows add their full-screen pass (0.5–0.9 ms, whatever their number), and none at all where no glow
is bright enough to show. On the processor, choosing the nodes takes 0.1–0.3 ms a frame; the glows are chosen again (0.5
ms for 1,000) only when the drawn nodes change or the camera moves or turns.

The point budget's controller could not be checked in this harness, whose frames are stepped by hand in a hidden pane
(such frames are now ignored, above). In a visible tab at 60 frames a second it should read the real frame time; that
is to be checked on the laptop.

## 9. Caveats and later

- Two thirds of the sky is not in these surveys (everything south of declination −20° and the Milky Way's plane; from
  500 Mpc out Quaia's quasars and Gaia's galaxies fill it, with rough distances, all but the 10° nearest the plane: §11),
  and
  the map thins with distance: flux-limited surveys see only the brighter galaxies far away, and each chose different
  kinds, so the density and colour change with distance (BGS to z ≈ 0.4, then LRGs, then ELGs and quasars) because of
  selection, not structure. DR1 is one year of five: its footprint is mottled on the scale of DESI's tiles.
- Redshift space (above), and redshift errors: about 0.2–0.7 Mpc for galaxies, a few Mpc for quasars, and a few
  hundred catastrophic quasar redshifts thousands of Mpc off.
- The distances depend on the cosmology: at z = 1 a 1 % change in H0 moves a galaxy about 34 Mpc. Changing the app's
  cosmology needs the tiles built again (the build uses its module).
- Survey galaxies belong to no group the tiles know of: in the expanding universe each moves with the expansion on its
  own, so clusters stretch as the clock runs ahead (the web's groups keep their size).
- Luminosities: the class median for 6.5 million galaxies (above); a K-correction of the bandwidth term only.
- The glows are a tint at the points' own sampling rate, not the undrawn galaxies' light: the layer is a map of where
  the surveyed galaxies are, not a photometric image (and holds nothing of the fainter galaxies no survey saw).
- Not yet: points cannot be picked (a card per galaxy); the survey has no lensed variant near a black hole; DESI DR2
  (expected early 2027) would replace DR1 with the same pipeline.
- Hosting: 63.7 MB in 2,700 files in the repository, served by Vercel. A first view costs about 1.8–2.1 MB in 21–26
  files. If traffic grows, move `public/data/survey/` to another host and change `SURVEY_BASE_URL`.

## 10. Quaia: quasars over the whole sky

866,298 quasars from Quaia, the Gaia–unWISE quasar catalogue (Storey-Fisher et al. 2024, ApJ 964, 69; data
doi:10.5281/zenodo.10403370, version 1.0.0, CC BY 4.0): the 1,295,502 quasars with Gaia G < 20.5 over the whole sky but
the Milky Way's plane, less those DESI or the SDSS have. Their redshifts come from Gaia's low-resolution BP/RP spectra
refined with unWISE colours, not from a spectrograph: the quoted error has a median of 4 % of 1 + z, and against the
spectroscopic surveys 62 % agree within 1 % and 91 % within 20 % (the research's match). So their distances are rough, a
few hundred megaparsecs, and they are drawn as streaks along our line of sight as long as that error, not as points.
Built in a minute by `npm run data:quaia` (`scripts/build-quaia.mjs`; log in `docs/data/quaia-build-log.txt`) into
`public/data/survey-quaia/`, the surveys' own format; code in `src/sim/surveys/quaia.ts` (what the build, the app and
the tests share), `src/scene/Surveys.tsx` and `src/render/shaders/quaiaStreak.vert.glsl`. The survey's own tiles are
not rebuilt or changed.

**Inputs.** `data-raw/quaia/quaia_G20.5.fits` (171 MB) and its Zenodo record (the build stops if the record no longer
says CC BY 4.0 or the file's MD5 differs from the record's), and the surveys' inputs in `data-raw/surveys/` (positions,
redshifts and the same cuts as their build).

**Left to the surveys.** Each of the surveys' catalogues is indexed on the sky (`src/sim/surveys/match.ts`), quasars first,
and a Quaia quasar within 1.5″ of an entry is the same object: it is left out, and its spectroscopic redshift, in the
survey's tiles, is the one drawn. Gaia's positions are good to milliarcseconds; matched again with every quasar moved 30″
north, 261 (0.02 %) found a neighbour, so chance matches are negligible.

| Matched first in | Quaia quasars left out |
| --- | --- |
| DESI DR1 quasars | 231,404 |
| SDSS-IV eBOSS DR16 quasars | 75,244 |
| SDSS DR16Q (z ≤ 3.5) | 112,726 |
| SDSS DR16Q beyond z = 3.5 (the survey leaves these out; with a spectroscopic redshift known, Quaia's is not drawn either) | 2,312 |
| DESI DR1 BGS, LRG, ELG galaxies (low-redshift quasars and AGN DESI classed with its galaxies) | 5,281, 1,959, 28 |
| SDSS-I/II and BOSS galaxies | 169, 81 |
| **All** | **429,204**; 866,298 kept |

All 412,968 of Quaia's quasars south of declination −20° are kept (none is in the surveys). 150,998 of those kept lie
within 20° of the Galactic plane, but Quaia too is nearly empty within 10° of it (2.2 quasars a square degree, against
45 at high latitude: Gaia's crowding and the dust), so the middle of the survey's wedges stays empty: blank there is
unobserved by either. All redshifts are kept (to z = 4.62): the survey's z = 3.5 cut is for DESI's quasar redshifts.

**Placed** as the survey's galaxies: the redshift taken to the CMB frame, the comoving distance from the app's cosmology,
along Gaia's direction. Median z 1.43, distances 1.76 Gpc (5 %) to 6.26 Gpc (95 %). Each quasar's error becomes a
comoving distance error, half the span of its redshift's 1σ range, σχ = (χ(z + σz) − χ(z − σz)) / 2: median 206 Mpc,
75 % 445, 90 % 705, 99 % 1,389. It is kept in a byte, log-coded (4 to 6,200 Mpc in steps of 2.9 %), as one extra byte a
point (the node format's header byte 13 counts a point's extra bytes; 0 in the survey's tiles, which decode as before).
Class: the survey's quasar class; catalogue code 10; luminosity that of an L* galaxy, as the survey's quasars (none has
a measured one). 166 nodes, depth 5; 4.83 MB, 5.57 bytes a quasar; the hierarchy 4.7 kB.

**Drawn as streaks** (`quaiaStreak.vert.glsl`, one quad a quasar, instanced). The quasar's place and the places 1σ
nearer and farther along the line from the Sun are each seen as the survey's points are (redshifted, light-delayed if
that is on, aberrated in flight) and projected; the quasar's point (its profile a Gaussian a sixth of its width) is
smeared between them by a Gaussian of σ half that span, cut at 1.5σ each way: a line about two device pixels wide
running over its quasar's ±1σ distances, soft at the ends. Seen end on, or with a small error, it is the point it would
be. From where the camera usually is, far out, that is long: a quasar 4 Gpc away with the median error spans a few
degrees. So, with the reasons measured:

- Its light grows with its length as (σ along / σ across)^0.65 (`STREAK_LENGTH_GAIN`), and is less per pixel the longer it
  is. With a point's light spread along it a streak was invisible from gigaparsecs out (each a hundredth of a point per
  pixel); with all of it per pixel (0.8 tried) the streaks swamped the survey's fans from 5 and 10 Gpc.
- One whose half length on the screen passes 30 CSS px fades out by 90 (`STREAK_LONG_PX`): a quasar whose likely
  distances run across a large part of the view (near the camera, or with the largest errors) says little of where it
  is, and such lines, crossing the whole view, were most of what showed from 2 Gpc and most of what the streaks cost.
- The least certain are fainter: fully drawn to an error of 300 Mpc, fading to 0.15 by 1,000 Mpc (`quaiaFade`; 322,911
  are faded, 32,453 to the floor). The glows hold the same faded light (the build weights each quasar's light by it).
- Colour: the survey quasars' violet a little bluer and paler (`QUAIA_COLOR`), at their colour temperature. From far out
  every point is reddened by the expansion as the survey's are, so there the shape tells the two apart.

**The budget.** A streak's vertices cost less than the survey point it replaces (measured: with every streak culled in its
vertex shader, 31,000 streaks and 107,000 points cost 0.5 ms less than 200,000 points), but its pixels cost: 31,000
full-length streaks added 2.5 ms at 2 Gpc. So a Quaia quasar counts against the point budget as its streak's pixels over
a point's (`streakCost`: the median error, two thirds across the line of sight, at its node's distance; 0.5 when too
long to draw), and Quaia takes at most a quarter of the budget (`QUAIA_BUDGET_SHARE`; 0.4 since §11); the survey has the rest, all of it
when Quaia uses less. Chosen by one law over both octrees (`lod.ts selectNodesOf`, which can), Quaia's sparse, costly
streaks took two thirds of the budget from 2 Gpc and left the survey's own map a third of its points. From 2 Gpc Quaia
draws about 3,500 quasars and the survey 150,000 points; from 14 Gpc 13,500 and 150,000.

**When.** Quaia's files load only once the camera is 500 Mpc from the Sun, whatever the setting while the layer is on,
and it fades in to show fully by 1 Gpc (`ui/cosmicLayers.ts`). 95 % of the quasars are farther than 1.76 Gpc and their
distances uncertain by about 200 Mpc: nearer home they would be a faint sprinkle far behind the survey's own galaxies, and
what they are for, the sky the surveys could not see, shows as gaps only once the camera is far enough out to see the
survey's footprint as fans with empty wedges between. So the cosmic web's scene (200 Mpc), Coma and everything nearer
download none of it. The files share the surveys' worker and their six downloads in flight (the survey's first), and
retry as theirs do (`lib/retry.ts`). The layer's card adds one line while Quaia shows: "Quasars over the whole sky from
Gaia (Quaia), in the wedges too: their distances are rough, so they are drawn stretched along the line of sight."

**Performance and downloads**, as §8 (the same laptop and harness, `perf.ab` with the layer on against off, five rounds;
the point budget held at 200,000; looking home from right ascension 318°, declination +48°, except at 2 Gpc):

| View | Downloaded from a cold start: the survey's, Quaia's | Drawn: survey points, Quaia streaks | The layer's GPU cost (rounds) | The survey alone, same minutes | Whole frame |
| --- | --- | --- | --- | --- | --- |
| Within 500 Mpc of the Sun | Quaia: nothing | as §8, 200,000 points | as §8 | | unchanged |
| 2 Gpc out (`controller.placeAt('local-group', 6.2e22)`) | 1.37 MB in 15 files; 109 kB in 2 | 150,000; 3,400 | 2.07 ms (1.22–2.56) | 1.90 ms, 200,000 points | 9.1 ms |
| 5 Gpc out, looking home | 1.40 MB in 16 files; 109 kB in 2 | 150,000; 5,000 | 1.56 ms (1.31–1.86; one round 6.1) | 1.46 ms | 8.5 ms |
| 10 Gpc out, looking home | Quaia 109 kB in 2 files | 150,000; 10,100 | | | |
| 14 Gpc out, looking home | Quaia 109 kB in 2 files | 150,000; 11,700 | | | |

The canvas was 2,880 × 1,368 at pixel ratio 2; the frame read 6.6–6.9 ms with the layer off. The machine was busier than
for §8 (the survey alone read 1.90 ms at 2 Gpc where §8 has 1.62), and single rounds swung by a millisecond or more; Quaia
adds 0.1–0.2 ms to the survey's cost at the same budget, within the noise. Every far view draws a part of Quaia's root
node only (16,384 quasars, a fair sample of the whole sky), so a first view downloads its hierarchy and that one file,
109 kB, and nothing more. Nothing is added to the first load of the app: the files load from 500 Mpc out, and the code
adds 4.4 kB (gzip) to the main script.

**Caveats.** Quaia's redshift errors are not Gaussian: about 9 % are off by more than 20 % in 1 + z (a wrong line taken
for another), and a streak shows the quoted 1σ only. Its selection is uneven on the sky (dust, Gaia's scanning), so its
density there is not structure. Quasars inside the surveys' footprint that DR1 has not yet observed are drawn as Quaia's:
DESI's later releases will turn many of them into spectroscopic points. Quaia's root node is drawn only in part from
every view, so its glows are rarely drawn.

## 11. Gaia DR3's galaxies, and the sky beyond DESI and the SDSS

Seen from far out (the view home from 9.4 billion light-years, say), DESI and the SDSS are two fans with the rest of the
sky empty, and from some such views Quaia's quasars did not show at all (below). Two things were done: the galaxies of
Gaia DR3 with a redshift were added to Quaia's tiles, and the streaks were made to draw from everywhere.

**What was weighed** (read 9 October 2026; the rule, as for 6dFGS, 2dFGRS and GAMA in §3: shipped only where the terms
allow redistribution; where none are stated, not):

| Catalogue | Coverage | Terms found | Used |
| --- | --- | --- | --- |
| Gaia DR3 galaxy candidates with redshifts (Gaia Collaboration, Bailer-Jones et al. 2023; Delchambre et al. 2023) | whole sky outside the Milky Way's plane, z < 0.6 | Gaia data are CC BY-NC 3.0 IGO (https://www.cosmos.esa.int/web/gaia-users/license): redistribution with credit, non-commercially, as the star catalogue's Gaia values already are | yes |
| DESI Legacy Imaging Surveys DR9/DR10 photometric redshifts (Zhou et al. 2021) | DECaLS, BASS, MzLS and DES footprints, far south too | only the Sky Viewer's images carry a licence (CC BY 4.0, https://www.legacysurvey.org/acknowledgment/); the catalogues ask for an acknowledgement but state no licence; and billions of rows | no |
| DES Y6 Gold photometric redshifts | the DES footprint, 5,000 deg² of the south | the DES data-access page (https://www.darkenergysurvey.org/the-des-project/data-access/) asks for an acknowledgement; its terms page (https://des.ncsa.illinois.edu/terms) states no licence that could be read | no |
| WISE × SuperCOSMOS photometric redshifts (Bilicki et al. 2016) | whole sky outside the plane, 18.5 million galaxies, z ≈ 0.2 | the SuperCOSMOS Science Archive page (http://ssa.roe.ac.uk/WISExSCOS.html) asks to cite the paper and acknowledge the WFAU; the archive's data are "subject to the copyright" of the plates' owners; no licence | no |
| 2MPZ (Bilicki et al. 2014) | whole sky outside the plane, about a million galaxies, z ≈ 0.07 | as WISE × SuperCOSMOS (http://ssa.roe.ac.uk/TWOMPZ.html) | no |
| 2MRS (Huchra et al. 2012) | whole sky beyond 5–8° of the plane, 44,599 spectroscopic redshifts to about 300 Mpc | the catalogue's page (http://tdc-www.harvard.edu/2mrs/) gives the paper and the files, no licence | no |
| GLADE+ (Dálya et al. 2022) | whole sky, 22.5 million galaxies (2MPZ, WISE × SuperCOSMOS, HyperLEDA and others) | the page (https://glade.elte.hu) asks for a citation, no licence; and it is built of the catalogues above | no |
| CDS VizieR copies of any of these | | VizieR's rules: free for scientific use with citation, copyright as the catalogue's origin; no licence of its own | no |

**Which galaxies.** `scripts/surveys/gaia-galaxies.mjs` fetches from the Gaia archive, in 48 slices of the sky by source
id, the "purer" galaxy candidates of Bailer-Jones et al. 2023 §9 (a Sérsic profile fitted, or both of the discrete
source classifier's models say galaxy, or the variability classifier does: about 95 % galaxies) that the Unresolved
Galaxy Classifier gave a redshift from their BP/RP spectra (`redshift_ugc`): 1,139,455 rows (81 MB gzipped, kept in
`data-raw/gaia-galaxies/`). `scripts/build-quaia.mjs` then:

- leaves out the redshifts the classifier gets least right, as the Gaia DR3 data model says (its galaxy_candidates
  table): below 0.02, 0.28 to 0.30 and above 0.58, and the interval 0.070–0.071, which holds several thousand bright
  galaxies whose redshifts are probably below 0.04 (15,859 in all; `quaia.ts gaiaRedshiftKept`);
- leaves to Quaia the 6 that Quaia has as quasars (by source id), and to DESI and the SDSS the 313,531 within 1.5″ of one
  of their objects, matched as Quaia's are (DESI's Bright Galaxy Survey 162,636, SDSS-I/II 137,832, BOSS 12,874, the rest
  a few hundred): their spectroscopic redshifts win. Matched again with every galaxy moved 30″ north, 275 (0.02 %) found
  a neighbour;
- places the other 810,059 as the survey's galaxies and Quaia's quasars (CMB frame, the app's cosmology), each
  redshift's error half its quoted prediction interval (`gaiaSigmaZ`, the estimate the data model gives; typically
  ±0.03) turned into a comoving distance error: median 123 Mpc, 95 % 175, 99 % 265; 860 are drawn fainter for theirs
  (`quaiaFade`);
- classes them grey, the survey's class for a galaxy without a measured colour (Gaia's BP and RP of an extended source
  are taken in windows of a few arcseconds, not a galaxy's colour), catalogue code 11 (`GAIA_GALAXY_SOURCE`);
- gives each a luminosity from its G as the survey's from r (`gaiaLogL`: M = G − DM + 2.5 log10(1 + z) against
  M*_r = −21.2): median log L/L* −1.05, low because Gaia's G, measured in its window, misses a large galaxy's outer light.

Median z 0.13 (CMB frame), distances 289 Mpc (5 %) to 986 Mpc (95 %); 417,995 lie south of declination −20°, where the
surveys have almost nothing. They go into Quaia's tiles beside its quasars (the quasars exactly as before: every step of
§10 is unchanged, and the build log's numbers for them are the same), drawn the same way, as streaks along the line of
sight, in grey. The tiles: 1,676,357 objects in 364 nodes, depth 8, 9.37 MB (5.59 bytes an object), files median 10 kB,
largest 106 kB, hierarchy 10.5 kB (were 4.83 MB in 166 nodes). The hierarchy's header grows past 64 bytes for more than
eleven catalogues' counts (`format.ts hierarchyHeaderBytes`; the decoder reads its size from the file, so the survey's
own tiles read as before). Up to 2 million of them stay decoded (`load.ts QUAIA_MAX_CACHED_POINTS`). A far view still
downloads the hierarchy and the root node only (now 117 kB: 10.5 and 106).

**Why the streaks did not show, and the fix.** A node's model matrix carries its numbers, not a transform
(scene/Surveys.tsx), and three.js flips a mesh's winding where that matrix's determinant is negative: with the
material's default front side, every streak of such a node was culled. The sign depends on the node and on where the
camera is, so from some views (the view home from 9.4 billion light-years among them) none of Quaia showed, while §10's
measurements, from other places, saw them. The streak material is now double-sided (`materials.ts
createQuaiaStreakMaterial`; a test checks it).

**The budget share.** With the streaks drawn and Gaia's galaxies among them, Quaia's tiles take at most 0.4 of the point
budget (`QUAIA_BUDGET_SHARE`, was a quarter): from the 9.4-billion-light-year view home about 5,000 streaks against
120,000 survey points (a quarter gave about 3,300 against 150,000, and left the wedges thin). The streaks cost what
§10's do per pixel: there, with the point budget at 200,000, 0.96 ms of GPU time (0.88–1.61 over three rounds of
`perf.ab`, streaks hidden against drawn, a 3,200 × 1,584 canvas in a hidden pane, where every timing reads high), within
the point budget the survey layer already keeps.

**The Milky Way's plane stays empty.** Behind the Galaxy's dust and crowded stars no optical or infrared survey finds
galaxies: the Zone of Avoidance, about 10° either side of the plane. Gaia's galaxy candidates, like Quaia's quasars and
like DESI and the SDSS, are nearly absent there, and nothing is put there: blank is hidden, not empty. The layer's card
and the About page say so.

**Caveats.** Gaia's redshifts come from low-resolution spectra: about ±0.03 in z (0.008 ± 0.037 on a clean validation
set, Gaia DR3 documentation), with outliers; a streak shows the quoted interval only. The purer sample is about 95 %
galaxies, so a few in a hundred grey streaks are stars or quasars. Their density on the sky follows Gaia's scanning and
the dust, not structure. Inside DESI's and the SDSS's footprints, the galaxies those surveys did not observe are drawn as
Gaia's.
