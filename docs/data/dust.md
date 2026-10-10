# The Sun's neighbourhood in 3D dust

The real dust clouds within 1.25 kpc of the Sun, from the 3D dust map of Edenhofer et al. (2024): they dim the stars,
the Milky Way from the Sun and the model of the Galaxy behind them, so that leaving home the dark clouds of Taurus,
Orion, Ophiuchus, Perseus, Chamaeleon and the walls of the Local Bubble stand where they are and move against the sky
as you fly among them, and they faintly scatter the Galaxy's starlight. Nine named clouds and the Radcliffe Wave are
bodies with quiet labels near them, and two journeys show them. Sections 1 to 4 describe the data and how they were
made; 5 to 8 how the app draws them and what it costs; 9 and 10 the tests and the limitations.

| Path | What it is | Size |
| --- | --- | --- |
| `public/data/dust/dust-outer.bin.gz` | \|x\|, \|y\| ≤ 1,250 pc, \|z\| ≤ 400 pc in 10 pc voxels (250 × 250 × 80) | 1.77 MB |
| `public/data/dust/dust-inner.bin.gz` | \|x\|, \|y\| ≤ 400 pc, \|z\| ≤ 200 pc in 4 pc voxels (200 × 200 × 100) | 1.84 MB |
| `scripts/build-dust.py` | Fetches the map (ranged requests, the mean only) and resamples it (Python: numpy, astropy, astropy-healpix) | |
| `src/sim/dust/volume.ts` | The grids' format, decoder, trilinear sampling, columns, knots, coordinates | |
| `src/sim/dust/light.ts` | Extinction colours, single scattering of the interstellar radiation field, the thin disc's light along a line | |
| `src/sim/dust/clouds.ts`, `radcliffe.ts` | The named clouds and the Radcliffe Wave: places, records, the Wave's model | |
| `src/sim/dust/load.ts` | Registers the bodies at once; fetches the grids when wanted | |
| `src/render/dustLayer.ts`, `localDustUniforms.ts` | The GPU side: textures, the dust skies, the view's lookup | |
| `src/render/shaders/localDust.frag.glsl` | The ray march | |
| `src/render/shaders/localDustView.frag.glsl` | The camera's dust sky turned into the view | |
| `src/render/shaders/localDustRead.glsl` | Chunk `lightspeed_localdust`: what the readers apply | |
| `src/scene/DustClouds.tsx` | Per frame: what is fetched, how strong the dust is, the Radcliffe Wave's line | |

Heliocentric galactic axes throughout (x towards l = 0, y towards l = 90°, z towards the north galactic pole), in
parsecs; `docs/data/galaxy.md` §1 has the frames.

## 1. Source and licence

Edenhofer, G., Zucker, C., Frank, P., Saydjari, A. K., Speagle, J. S., Finkbeiner, D., Enßlin, T. A. 2024, "A
parsec-scale Galactic 3D dust map out to 1.25 kpc from the Sun", A&A 685, A82, doi:10.1051/0004-6361/202347628. Data:
Zenodo record 10658339 (doi:10.5281/zenodo.10658339; the paper cites the concept doi:10.5281/zenodo.8187942),
**CC BY 4.0**, as the record's licence field says (checked through the Zenodo API on 9 October 2026; the paper itself is
CC BY 4.0 too, per Crossref). The shipped grids are a modified, derived work: resampled, converted to A_V and encoded,
as `CREDITS.md` says, with the credit above.

The map: the extinction of 54 million stars with distances and extinctions from their Gaia BP/RP spectra (Zhang, Green &
Rix 2023), modelled as a Gaussian process on 516 HEALPix spheres (Nside 256, 14′ pixels) at logarithmically spaced
distances from 69 to 1,250 pc (0.4 pc apart at the inside, 7 pc at the outside). Its unit is the unitless E of Zhang,
Green & Rix (2023) per parsec; the paper converts it to the Johnson V band (540 nm) by multiplying by 2.8 (its section
7), and so do we. The innermost 69 pc are left out of the map; the paper's appendix C judges that extinction mostly
spurious (it publishes it apart), and so it is left out here.

The file used is the posterior mean, `mean_and_std_healpix.fits` (3.25 GB). Only its first image (the mean, 1.62 GB)
and the radial tables at the end are fetched (`--fetch`: 16 ranged requests at a time), into `data-raw/dust/`
(gitignored). The 12 posterior samples (19.5 GB) are not used: the map is drawn, not analysed.

## 2. Resampling

`python scripts/build-dust.py` (about 4 minutes; under 0.5 GB of memory: it reads the spheres in order, two at a
time). For each grid the fine sample points are the centres of 2 × 2 × 2 sub-cells of each voxel; as the authors'
`interp2box.py` does, the log of the density is interpolated bilinearly on each sphere (astropy-healpix's bilinear
weights) and linearly in distance between the two spheres either side; each voxel is the mean of its 8 samples in
linear density, so it holds its mean extinction density. Points nearer than 69 pc or beyond 1,250 pc are 0.

| | outer | inner |
| --- | --- | --- |
| Box (pc) | ±1,250 × ±1,250 × ±400 | ±400 × ±400 × ±200 |
| Voxel | 10 pc | 4 pc |
| Samples inside the map | 30.1 million | 31.8 million |
| Density, median / 99th / 99.99th percentile (mag/pc) | 3.6 × 10⁻⁵ / 0.0050 / 0.025 | 1.3 × 10⁻⁴ / 0.0086 / 0.065 |
| Densest voxel (mag/pc) | 0.118 | 0.323 |
| Voxels holding 0 | 28 % (beyond the sphere) | 0.5 % |
| Encoding error, median / largest (voxels above RHO0) | 1.1 % / 3.3 % | 1.1 % / 3.3 % |
| gzip | 1.77 MB | 1.84 MB |

The outer box is that of the paper's figure 5 (the whole map within 400 pc of the plane). The inner box holds the
nearby clouds the labels name, Orion included. A third, finer level (2 pc within 250 pc) would sharpen Taurus, Ophiuchus
and Lupus, at about 3 MB more; it was left out to keep the download small.

Checks printed by the build (nearest voxel, 0.5 pc steps from the Sun): A_V towards Taurus (l 172°, b −16°) to 250 pc,
1.07 mag (outer) and 1.27 (inner); towards the north galactic pole to 400 pc, 0.02 mag; in the plane towards l = 90°
across the map, 1.93 mag.

## 3. Format

Little-endian. Header, 64 bytes: `0` "LSDU", `4` uint32 version 1, `8/12/16` uint32 nx, ny, nz, `20` float32 voxel (pc),
`24/28/32` float32 the first voxel's centre (pc), `36` float32 RHO0 = 2 × 10⁻⁴ mag/pc, `40` float32 LN_RANGE =
ln(1 + 1 / RHO0 · 1 mag/pc), `44` float32 A_V per E (2.8), `48` uint32 flags (0). Then nx · ny · nz bytes, x fastest,
then y, then z (a WebGL 3D texture's layout). A byte c holds ρ = RHO0 (exp(c · LN_RANGE / 255) − 1) mag/pc:
logarithmic, steps of 3.4 % well above RHO0 (0.2 mag/kpc), coarser below it, 0 empty. `src/sim/dust/volume.ts` decodes
it.

## 4. The named clouds and the Radcliffe Wave

Each place is the median galactic longitude, latitude and distance of the cloud's sightlines in Table A.1 of Zucker et
al. (2020, A&A 633, A51), whose distances come from Gaia DR2 parallaxes and stellar photometry; Orion's sightlines are
split at b = −17.5° into Orion A and Orion B. Musca, not in that table, is at 171 pc (Zucker et al. 2021, ApJ 919, 35,
quoted by Bonne et al. 2023, ApJ 948, 109), at the galactic place of its filament's centre (12h 28m, −71° 18′). The
dust map agrees: along each line of sight its densest point lies within 25 pc (9 %) of the place (`clouds.test.ts`).

| Cloud | l, b (°) | Distance (pc) | Sightlines | The map's densest point (pc, mag/kpc) |
| --- | --- | --- | --- | --- |
| Taurus Molecular Cloud | 171.6, −15.1 | 148 (129–170) | 10 | 152, 81 |
| Perseus Molecular Cloud | 159.6, −19.3 | 285 (234–347) | 18 | 306, 89 |
| Orion A | 209.4, −19.6 | 417 (394–473) | 8 | 426, 135 |
| Orion B | 205.7, −14.8 | 433 (399–522) | 9 | 416, 75 |
| Rho Ophiuchi Cloud | 353.9, 15.8 | 139 (109–167) | 16 | 150, 153 |
| Lupus Clouds | 340.1, 12.4 | 158 (108–239) | 6 | 172, 31 |
| Chamaeleon Clouds | 303.0, −15.3 | 190 (161–210) | 3 | 190, 49 |
| Musca Cloud | 301.0, −8.5 | 171 | — | 186, 48 |
| Cepheus Flare | 111.5, 17.6 | 346 (331–377) | 15 | 354, 13 |

**The Radcliffe Wave** (Alves et al. 2020, Nature 578, 237; Konietzka et al. 2024, Nature 628, 62): Konietzka et al.'s
model (their Methods, equations (4), (6) and (9)) with their best fit to the clouds and the star clusters together
(Extended Data Table 2, column 6): in the plane, a quadratic curve through the anchor points (−853.0, −807.9), (−275.1,
30.5) and (293.8, 1387.4) pc (taken here as the parabola through all three, the middle one half-way in its parameter: the
paper does not say how it runs through them); s the distance along it from the Canis Major end; and
z(s) = ζ(s) sin(2π Λ(s) + φ) with ζ(s) = −A / (1 + ((s − s0)/δ)²), Λ(s) = s / (p − γ s), A = 218.64 pc,
s0 = 544.99 pc, δ = 740.01 pc, p = 4,779.9 pc, γ = 1.46, φ = −0.15 rad (B = 1 and ω0t = 0: the wave as it is now, which
is all its clouds' places constrain). Its baseline is 2.49 kpc long; its line passes within 66 pc of Orion A (in its
trough, 185 pc below the plane), 34 pc of Perseus, 46 pc of the North America Nebula and 100 pc of Canis Major OB1, its
first end (`radcliffe.test.ts`; its clouds scatter about it by 47 pc, the paper's "radius").

The bodies (`src/sim/dust/clouds.ts`; kind nebula, kind text "Dark cloud" or "Wave of clouds", drawn by the dust layer,
not as points): registered at start, so search finds them and they are places to go. A cloud's label shows only within
0.7 of its distance from the Sun (at most 120 pc) of it, so never from home, and fades as the cloud fills the view (its
record's radius is a tenth of its size; its framing is its whole extent); the Wave's only from beyond 1 kpc of its middle
(to 8 kpc), with its model line drawn faintly (a guide, at 0.3 opacity, fading at its ends) while labels are on
(`BodyRecord.labelRange`, read by `ui/Labels.tsx`). Each card says what the cloud is, where its place comes from, and
that the cloud drawn is the map's.

## 5. How the app draws it

**Where the dust's effect is drawn.** `scene/DustClouds.tsx` sets a strength each frame: 0 within 2 pc of the Sun,
rising to 1 by 10 pc, falling again from 8 to 14 kpc away (where the neighbourhood is a few degrees across), eased in over
1.5 s when the map arrives. From home nothing is fetched or drawn: the sky from Earth already has the real dust in it
(the SVS map is starlight from Gaia, dimmed as we see it; the stars' magnitudes are as seen from Earth). The outer grid is
fetched once the camera is 3 pc out (to 16 kpc), the inner within 300 pc of its box.

**The camera's dust sky.** What the dust does depends on where the camera is, not where it looks. So the ray march
(`localDust.frag.glsl`) fills a "dust sky" round the camera: a galactic plate carrée of 1,024 × 512 (0.35° texels), two
half-float targets, marched from about where the camera is. For each texel, along its line from the camera through the
two grids (3D textures of mag/kpc with mipmaps; the inner grid where it covers), clipped to the map's box and its
1,250 pc sphere: steps of max(voxel, 0.02 · distance), the density read at each step's middle from the mip level of the
step's length (an average over it, so long steps lose no dust); a block of 8³ voxels whose largest density is under
0.02 mag/kpc is stepped over at once; the march stops past 12 mag; at most 128 steps. It writes the column at four
distances (geometric from where the line enters the map, at least 10 pc, to where it leaves: `cameraKnots`), where the
line enters and leaves the map, the share of the mean starlight scattered back, and the model's correction (below).
It is marched 16 rows a frame (a whole sky in 32 frames, half a second), only when the camera has moved by more than
0.4 % of its distance to the nearest cloud (a block over 10 mag/kpc; or of 2 pc if nearer): a parallax of at most about
a quarter of a degree, under a texel. It is marched from where the camera will be when the last band is done (its
velocity carries it on), and the finished sky fades in over 250 ms from the one before. Three skies are kept (shown,
fading out, being marched): 25 MB.

**The Sun's sky.** The same march from the Sun once each grid arrives (in bands too: in one draw it stalled the GPU
long enough for Windows to reset it), with the column at eight distances (100, 150, 200, 300, 450, 650, 900 and 1,250 pc:
`SUN_KNOTS_PC`).

**The view.** Each frame a plain lookup (`localDustView.frag.glsl`) reads the camera's dust sky along each pixel's
rest-frame ray (the remap pass's aberration, so in flight the clouds are aberrated as the sky is), in each half of the
split view with its own observer, into three targets at a quarter of the view's resolution each way: the four knots'
columns; t0, t1 and the scattered share; A_sky and A_model. The readers take them with bilinear filtering at their pixel
(the clouds are smooth over a few of its pixels, and lie behind every surface).

## 6. The split with the Milky Way model and the sky maps

Three things already drew the Galaxy's dust near the Sun, and each takes the map differently, so nothing is counted twice:

- **The sky from the Sun** (NASA SVS map, with the faint stars' map; drawn within about 500 pc of the Sun, handing over
  to the model: `docs/data/galaxy.md` §12) is a picture of the sky seen through the Sun's dust. It is dimmed by
  A_sky = (the camera's column in that direction) − (the Sun's column in the same direction), each through the 3D map:
  the map's dust is moved from where the Sun sees it to where the camera sees it, not added. Where the camera sees less
  dust than the Sun did the map is lightened, by at most 1.5 mag (the SVS map holds noise and its own finer dust, which
  the 4 pc map cannot take out exactly). At the Sun A_sky is 0 by construction.
- **The model of the Galaxy** (its particles, the glow near the camera, the face-on maps) is dimmed by its own smooth
  dust (Drimmel & Spergel), which near the Sun has no Local Bubble and no clouds (`docs/data/galaxy.md` §10). Inside the
  map that smooth dust is taken out along each pixel's line and the map's put in: A_model = −2.5 log10(T_map / T_DS),
  where each T is the transmission of the model's light along the line, weighted by where that light is emitted: as the
  model's thin disc, exp(−|z − z_mid| / 300 pc) (z_mid 20.8 pc below the Sun), from the camera to 1 kpc past the map's
  far side (the model's own dust hides what lies further). So a cloud dims only the light from behind it: seen along the
  plane most of the light is behind the clouds; seen from above the disc about half of it is in front. The smooth
  column across the map is the model's own (`columnAV` with four pieces, galaxy.vert.glsl's twin), taken to grow evenly
  across it. The shaders of the model are not changed: the correction is applied in the Galaxy layer's display law, to
  the summed linear light, before the eye's threshold (`galaxyComposite.glsl`, so the lens's composites take it too).
- **The stars** keep their catalogue magnitudes, which are as seen from Earth, through the Sun's dust. A star is dimmed
  by its column from the camera (the view's four knots, linear between them, read at its place on the screen) less its
  column from the Sun (the Sun's sky at its direction from the Sun, eight knots): its own dust moved, not added. It is
  brightened by at most 1.5 mag, and reddened (A_R : A_G : A_B = 0.89 : 1 : 1.23 of A_V, Cardelli et al. 1989 with
  R_V = 3.1, as the model's particles).

Beyond the map (more than 1,250 pc from the Sun, or more than 400 pc from the plane) nothing changes: the model's own
dust is the dust there.

## 7. The scattered light

A grain removes light from a beam and scatters a share of it, the albedo: 0.5 in the V band (Draine 2003, ARA&A 41, 241:
0.5 to 0.6 for Milky Way dust). Lit evenly from every side by the Galaxy's starlight of mean intensity J, a line of sight
through dust glows by single scattering with ω J Σ e^{−τ_before} (1 − e^{−Δτ}) along it, ω J (1 − e^{−τ}) at most: at
most half the average sky. Lit from every side, the phase function (forward-throwing, g ≈ 0.6) does not matter. J is the
local interstellar radiation field of Mathis, Mezger & Panagia (1983, A&A 128, 212, Table A3, as reproduced by Mauron,
de Laverny & Lopez 2003, A&A 401, 985): 4πJ_λ = 1.57 × 10⁻⁶ erg cm⁻² s⁻¹ Å⁻¹ at 0.55 µm, a whole sky of V = −6.54, so
32.9 stars of V = 0 per steradian and a mean surface brightness of 22.78 mag/arcsec². (The sky Skyfold draws from the
Sun, the SVS map plus the catalogue's stars, averages about twice that: 64 per steradian; `light.test.ts`.) Its colour
is the SVS map's mean colour over the sky, a little yellow; seen through dust, what lies behind is reddened, so the clouds
read as brownish. The scattered light is added to the sky map's light and to the model's (counted as the model's, so the
handover between them shows it once), in their own units, before their display law.

How it looks: an opaque cloud glows at about 23.5 mag/arcsec², within the eye's threshold (the glow between the stars
fades out between 22 and 24 mag/arcsec²): faint brown light on the clouds where they are thick, and nothing where they
are thin. From far outside the neighbourhood (2 kpc above it) the disc's own light there is below the eye's threshold,
so the clouds, which can only dim it or glow faintly, are barely seen: as they would be.

## 8. Cost

Measured on the owner's laptop (Intel Core 5 320 with its integrated GPU, 1,600 × 900 CSS px at a pixel ratio of 1.25
to 2) with timer queries round the dust's passes (`window.__ls.dust.layer`: `alwaysRedo` marches every frame,
`forceStrength` 0 turns it off), the GPU shared with several other development servers at the time, so the figures are
the quiet frames' (the noisy ones read up to 1–2 ms for any pass):

| | GPU time a frame |
| --- | --- |
| Near the Sun (within 2 pc), or beyond 14 kpc, or before the map has loaded | 0 (nothing is drawn or read) |
| Camera at rest, or only turning | about 0.05 ms (the view's lookup) |
| Camera moving (a band of the dust sky a frame) | about 0.25–0.35 ms (in the plane, 300 pc from the Sun) |
| A first try marching every pixel of the view each frame at a quarter resolution | about 23 ms more, under the same load: why the dust sky exists |

The readers add two texture reads a pixel to the sky map's and the Galaxy layer's composites, and four vertex texture
reads to each star that could still be seen (only while the strength is above 0). Whole-frame `perf.measure` A/B at
rest near Taurus: within its noise (+0.4 ms on frames of 14–22 ms that day).

Memory: 1.8 + 1.8 MB to download, each fetched only when wanted; on the GPU, once the camera has left home, the grids as
half floats with mipmaps (≈ 20 MB), the three camera dust skies (25 MB), the Sun's (8 MB) and the view's targets
(≈ 1 MB): about 55 MB.

## 9. Tests

`npx vitest run src/sim/dust`:

- `volume.test.ts`: the files decode to the build's boxes; the encoding round-trips within half a step; trilinear
  sampling as a GPU's; columns through the nested grids; the blocks' maxima; world km ↔ galactic pc ↔ (l, b, d); the
  knots and the column read back from them; the map against the paper (the Local Bubble nearly empty towards the poles,
  over a magnitude through Taurus by 250 pc, one to four across the plane, nothing inside 60 pc).
- `clouds.test.ts`: every named cloud's place within 25 pc (9 %) of the map's densest point along its line of sight,
  denser than 10 mag/kpc there; Orion A below the plane and the Cepheus Flare above it; labels out of range from home.
- `radcliffe.test.ts`: the baseline through the anchors; length 2.3–2.8 kpc; greatest height 150–219 pc; closest
  approach to the Sun 200–330 pc (Alves et al.: about 300); within about two radii of Orion A, Perseus, North America and
  Canis Major OB1; Orion in its trough near s0.
- `light.test.ts`: J and its surface brightness; the app's own sky (its stars brighter than V = 11 sum to 14–18 stars of
  V = 0 per steradian); single scattering's limits; reddening; the thin disc's light along a line against a fine sum.

## 10. Known limitations

- The map is the posterior mean, at 4 pc within 400 pc of the Sun and 10 pc beyond (the map's own resolution is finer:
  14′, 0.6 pc at Taurus): the clouds are soft up close, and the SVS map's finer dust lanes, which the map cannot take
  out exactly, can show faintly where they were from the Sun's place (the lightening is held to 1.5 mag). Its
  uncertainty (about 10 % of the mean) and its samples are not drawn.
- Nothing inside 69 pc (the map's own choice), nothing beyond 1,250 pc or more than 400 pc from the plane.
- The scattered light is single scattering of an even radiation field: no bright reflection nebulae round young stars
  (Orion's, the Pleiades' are photographs where they exist), no shadowing of a cloud's inside by its outside, no
  stronger light near the plane.
- The model's light along a line is taken to be spread as its thin disc to correct it; its bulge, bar and young stars
  are spread differently, and the smooth dust's column is taken to grow evenly across the map.
- The stars' correction reads the view's knots, linear between four distances; a star the catalogue made faint by the
  Sun's dust and the camera sees through less is brightened by 1.5 mag at most, and one brighter than the eye's limit
  only then is not in the star field's lists (it was culled as too faint).
- Inside a black hole's lens box the dust is applied at the pixel, not along the bent ray.
- The Radcliffe Wave's line is a model fitted to clouds and young clusters, with its baseline's parameterisation
  assumed (above); its oscillation is not animated (its period is tens of millions of years).
