# The Milky Way's magnetic field

View › Magnetic field lines shows the Galaxy's magnetic field in two ways, which hand over as the Galaxy's model and the
sky from the Sun do (100 to 500 pc from the Sun, `sim/galaxy/background.ts` `modelShare`):

- away from the Solar System, **field lines of a model** in 3D: the large-scale regular field of Unger & Farrar (2024),
  "UF23", traced through the disc, the halo and the X-field (§1–2);
- near it, **the field over the sky, measured**: the field's direction on the plane of the sky from the polarisation of
  the Milky Way's microwave emission, drawn as faint streaks (a line-integral-convolution "drapery", §3).

Code: `src/sim/galaxy/magneticField.ts` (the model), `fieldLines.ts` (tracing, seeds, packing), `fieldView.ts` (when and
how much of each picture, the layer's card), `src/scene/GalacticField.tsx` (a chunk of its own, mounted only while the
switch is on), `src/render/galacticFieldMaterials.ts` and `src/render/shaders/galacticField*.glsl`; the drapery's texture
is built by `scripts/build-field-sky.mjs`. Scenes and journeys in `src/content/scenes.ts` and `journeys.ts`
(`galactic-field`, `galactic-field-sky`); the card in `src/ui/viewport/LayerCards.tsx`. Tests:
`src/sim/galaxy/magneticField.test.ts`, `fieldLines.test.ts`, `fieldView.test.ts`.

**Model or measurement.** The 3D lines are a model: a smooth parametric field fitted to the sky's rotation measures and
polarised synchrotron emission, as seen from the Sun; nobody has measured the field at a point across the Galaxy, and the
far side of the disc is constrained by the fit's functional form, not by data. The model is the *regular* field only:
the turbulent field, of about the same strength (UF23's striation factor and the literature's random field of a few µG),
is not drawn. The drapery is a measurement, but a projected one: each streak is the plane-of-sky orientation of the field
weighted along the whole line of sight by the emitting electrons (synchrotron) or dust, with no sense (which way the
field points along the streak is not known from polarisation).

## 1. The model: UF23 "base"

Unger, M. & Farrar, G. R. 2024, "The coherent magnetic field of the Milky Way", ApJ 970, 95 (arXiv:2311.12120). The
paper fits eight variants; "base" is its fiducial model, against which the others are measured (its "Base Model" subsection), and the
one used here. Implemented from the paper's equations (its section 5, "Magnetic Field Models"; no code copied; the authors' own C++ is on Zenodo,
doi:10.5281/zenodo.10627091). Three parts, summed:

| Part | Form (paper section 5) | Parameters (Table 3, "base"; Table 2 fixed) |
| --- | --- | --- |
| Disc | logarithmic spiral of pitch α, B = (sin α, cos α, 0) (r₀/r) B(r₀, φ₀) h_d(z) g_d(r), φ₀ = φ − ln(r/r₀)/tan α; B(r₀, φ₀) = Σ B_m cos(m(φ₀ − φ_m)), m = 1–3 | α = 10.11°; B_m = 1.09, 2.66, 3.12 µG; φ_m = 263°, 97.8°, 35.1°; z_d = 0.794 kpc, w_d = 0.107 kpc; r₀ = 5, r₁ = 5, w₁ = 0.5, r₂ = 20, w₂ = 0.5 kpc |
| Toroidal halo | B_φ = (1 − h_d(z)) e^(−\|z\|/z_t) (1 − σ((r − r_t)/w_t)) × B_N (z > 0) or B_S | B_N = 3.26 µG, B_S = −3.09 µG, z_t = 4.0 kpc, r_t = 10.19 kpc, w_t = 1.7 kpc |
| Poloidal (X-field) | coasting X-field in its two-parameter limit (a_c ≫ a): field lines r = a (1 + \|z/z_p\|^p)^(1/p); from Euler potentials B_z = B₀(a) a²/r², B_r = B₀(a) a² sgn(z)\|z\|^(p−1) / (r (1 + \|z/z_p\|^p) z_p^p); B₀(a) = B_p (1 − σ((a − r_p)/w_p)) | B_p = 0.978 µG, p = 1.43, z_p = 4.5 kpc, r_p = 7.29 kpc, w_p = 0.112 kpc |

with σ(x) = 1/(1 + e^−x), h_d(z) = 1 − σ((\|z\| − z_d)/w_d), g_d(r) = (1 − σ((r − r₂)/w₂)) σ((r − r₁)/w₁) (1 − e^(−r²)).

**Signs.** The paper's frame is right-handed and galactocentric with the Sun at (−r☉, 0, 0) and z to the north galactic
pole, so y points towards l = 90°, the way the Galaxy turns at the Sun; φ = atan2(y, x), so B_φ > 0 is counter-clockwise
seen from the north, against the Galaxy's rotation (the paper's v₀ = −240 km/s for the same reason). Checked against what
the paper says: the field at the Sun runs clockwise, towards l ≈ 90° − α (the classical local field direction, l ≈ 80°),
with the sign of the spur variant's B₁ = −4.3 µG there; the northern halo field is counter-clockwise (B_N > 0) and the
southern clockwise, as the paper's unified model winds them from a northward X-field (B_z > 0). (The caption of the
paper's figure of the disc field names red "clockwise"; its colour bar is B itself, red positive, which in these axes is counter-clockwise:
the values along the x axis below match the colour bar.)

**Frame.** The paper's axes are the app's frame G (`sim/galaxy/frames.ts`: x from the Sun's projection to Sgr A*, y
towards l = 90°, z to the NGP). The paper puts the Sun at r☉ = 8.178 kpc (GRAVITY 2019) and in the plane; the app at
R0 = 8.277 kpc (GRAVITY 2022) and 20.8 pc above it. The model is evaluated at x_paper = (8.178/8.277) x_G in every
length, so the Sun keeps its place among the field's arms (a 1.2 % stretch); field strengths are unchanged; the plane is
G's (the 21 pc offset is 3 % of z_d).

**Checks** (`magneticField.test.ts`), against numbers the paper gives:

| Check | Paper | Here |
| --- | --- | --- |
| Energy of the coherent field within 20 kpc (sphere), 10⁵⁵ erg | disc 0.28, poloidal 0.26, toroidal 0.75; 1.3 in all ("Model Ensemble" subsection) | 0.288, 0.264, 0.745; 1.297 |
| Pitch of the disc field | 10.11° | 10.11° (B_r/B_φ, where the halo is nil) |
| Mid-plane vertical field of the X-field inside r_p | B_p = 0.98 ± 0.03 µG | 0.978 µG, half at r_p |
| Field at the Sun | weak: the Sun sits on a near-zero band of the paper's disc-field figure | 0.28 µG towards l = 79.9° (clockwise) |
| Disc field on the Sun–anticentre line, z = 0 | that figure's colour bar ≈ −2.5 µG at x = −9 kpc, ≈ +3 µG at x = −11 kpc | −2.4 and +2.8 µG; at least three reversals between 5.5 and 19 kpc |
| Toroidal halo above and below the disc | B_N = 3.26, B_S = −3.09 µG | exact (at r = 5 kpc, z = ±2 kpc with the fades) |
| X-field | divergence-free by construction (Euler potentials) | numerical div B < 10⁻⁵ \|B\|/kpc |

The energy integral is the strongest check: it exercises every part's form and every parameter, and agrees to 1–3 %
(the paper rounds to two figures). It also settles that "base" uses the coasting X-field's two-parameter limit (the
paper gives a_c only for the expX variant).

## 2. Field lines in 3D

**Tracing** (`fieldLines.ts`). A field line solves dx/ds = B/\|B\|. Fourth-order Runge–Kutta with step doubling: each
step is taken whole and as two halves, their difference /15 is the error estimate; a step is accepted below 2 × 10⁻⁴
kpc and the next one scaled by (tol/err)^(1/5), and a step that would turn the line by more than 4° is taken shorter,
so the polyline stays smooth on screen (steps 0.001–0.3 kpc). A line ends where the field falls below 0.04 µG, outside
r = 21 kpc or \|z\| = 9 kpc, after 90 kpc each way, or where it closes on itself (the halo's circles beyond r_p). Each
line is traced from its seed both ways and stored in the direction of B, with its arc length.

**Seeds** (deterministic, `fieldLineSeeds`): 48 disc lines from the circle r = 9 kpc (paper frame) at azimuths spread with
density ∝ \|B(r₀, φ₀)\|, so each magnetic arm gets lines in proportion to its flux (every disc line is one of the spirals
φ₀ = const, which the X-field nudges out of the plane inside r_p); half in the plane, half 300 pc above or below; 14
halo lines per hemisphere on a spread of radius (1.5–13 kpc, ∝ r × the radial cut) and height (1.2–9 kpc, ∝ e^(−z/z_t));
24 X-field lines from the plane inside r_p, ∝ the flux through it (a × the logistic profile). 100 lines, about 30,000
points; tracing takes 0.2–0.4 s on the development machine and is done once, the first time the lines are to show.

**Drawing** (`GalacticField.tsx`, `galacticField.vert.glsl`). One draw of indexed line segments, 1 px wide, added light.
Colour is the field's sense: azimuthal field running clockwise seen from the north (with the Galaxy's rotation) amber,
counter-clockwise blue, mostly vertical (\|B_z\|/\|B\| above 0.55–0.85) lilac northwards and teal southwards.
Brightness is strength, ((ln B − ln 0.1 µG)/(ln 6 µG − ln 0.1 µG))³ clipped, so the weak outer halo recedes. Along each
line the brightness ramps up every 1.2 kpc and drops back: each dash is brightest at its forward end and points the way
B points (static: nothing moves).

**Depth with the Galaxy's light.** The Galaxy's light (`render/galaxyLayer.ts`) is drawn into its own low-resolution
targets and added to the view by one full-screen pass under everything, with no depth: stars and glow are transparent
emission, so nothing drawn over them is hidden by them, nor hides them. The lines are added the same way, with the
constellation figures, before the bodies (which cover them), at full resolution (drawn into the Galaxy's quarter-
resolution target they would blur to nothing). Their order with the Galaxy's light therefore does not matter; what puts
them in depth is the dust: each point is dimmed by the Galaxy model's dust column between the camera and it (the same
`columnAV` integral as the particles, through the same face-on dust maps, 4 pieces), to no less than 12 % of its
brightness, so lines behind the disc are seen through its dust lanes as the Galaxy's far side is, and still show.

**Fades** (`fieldView.ts`): nothing within 100 pc of the Sun, all beyond 500 pc (`modelShare`); a third of the
brightness inside the disc, all of it once 4 kpc above or below the plane or 24 kpc from the axis; each point fades
out within 0.3–1.5 kpc of the camera, so from inside the disc the nearest lines do not sweep across the sky; and the
whole set fades out between 400 kpc and 1.5 Mpc from the centre. Not drawn near a black hole while its lens is (no
lensed variant); in flight each point is aberrated like a star (no Doppler colour: a guide).

## 3. The field over the sky: the drapery

`public/textures/field-sky-wmap.png`, 2048 × 1024, 8-bit greyscale, 1.2 MB, built by `scripts/build-field-sky.mjs`;
equirectangular in galactic coordinates laid out as the CMB map's (l = 0 in the middle, l increasing to the left, north
at the top). Fetched the first time the camera is within 500 pc of the Sun with the switch on, and let go when it is
turned off.

**Which map.** The classic drapery (Planck's) is built from **Planck's 353 GHz polarisation** (thermal dust): the script
does that (`--source planck`, from the Planck Legacy Archive's `HFI_SkyMap_353-psb_2048_R3.01_full.fits`), but the
texture is **not shipped**: data in ESA's science archives, Planck's included, are distributed under CC BY-NC 3.0 IGO
(ESA's archive terms; credit "ESA, Planck Collaboration"), and Skyfold redistributes only data free for any use. What
ships is the same processing of **WMAP's nine-year K-band (23 GHz) polarisation**, smoothed to 1° (NASA, public
domain): synchrotron emission of cosmic-ray electrons, also polarised across the field. The two trace the same plane-of-
sky field, weighted differently along the line of sight (dust near the plane within a few kpc; synchrotron further, into
the halo); both show the field along the plane and the North Polar Spur's loop. Built locally, the Planck texture is
`public/textures/field-sky-planck.png` (git-ignored); `FIELD_SKY_SOURCE` in `fieldView.ts` picks which file the app
draws, and the card's wording and credit follow it.

**Processing** (both maps):

1. Each HEALPix pixel's (Q, U) is put in the IAU convention (both maps are COSMO: U_IAU = −U; Planck's header says so,
   WMAP's has no POLCCONV keyword, which means COSMO, as LAMBDA's polarisation-convention page states) and written as a
   tensor in the galactic Cartesian frame, T = Q (n n − e e) + U (n e + e n), n and e the unit vectors north and east.
   Tensors do not depend on the local frame, so they average correctly across pixels and over the poles.
2. Summed into 1024 × 512 bins and smoothed by a Gaussian (separable, its longitude width ∝ 1/cos b, normalised
   convolution): FWHM 1° for Planck (its polarisation is noisy pixel by pixel at high latitude), 0.5° more for WMAP's
   1° map.
3. The field's direction: the polarisation angle ψ = ½ atan2(U, Q) (north through east) turned by 90°.
4. Line-integral convolution on the sphere: white value noise on a 3D lattice of one texel, averaged along the field
   ±3.5° in 0.12° steps with a Hann window.
5. Only the streaks' bright cores are kept (the LIC's excess over its mean in units of 2.5σ, 0–1), times a weight from
   0.2 to 1 with the log of the polarised intensity (between its 5th and 99.5th percentiles), so the noisy high
   latitudes stay dim.

Checks the script prints: Q > 0 (polarisation across the plane) in 94 % (WMAP) and 89 % (Planck) of pixels within 3°
of the plane; the field within 45° of the plane's direction at 88 % of points within 5° of the plane and 60° of the
centre; every 20,000th pixel centre round-trips through HEALPix's ang2pix.

**Drawn** (`galacticFieldSky.frag.glsl`): a full-screen quad added over the sky under everything else, as the CMB map
is, the texture's value × 0.028 in a pale blue (well below the Milky Way's brightest star clouds), faded with the share above; not in the relativistic view (its background
is the sky as the moving ship sees it, which this map is not).

## 4. Cost

Measured on the target laptop's integrated GPU (ANGLE, Intel Graphics 0xFD80, Direct3D 11), 3200 × 1584 device pixels
(pixel ratio 2, pinned, no multisampling), with `window.__ls.perf.ab` interleaving the switch off and on (rounds of 4
batches of 20 frames, `gpuMed`, ms), 9 October 2026, the machine busy with other work (rounds spread by up to 2 ms):

| View | Off | On | Added (median of rounds' differences) |
| --- | --- | --- | --- |
| The Milky Way from 42 kpc, tipped 70° (scene `galactic-field`) | 13.9, 14.7 | 14.2, 14.7 | +0.32 (3 rounds), +0.20 (4 rounds: 0.07, 0.32, −0.21, 0.35) |
| Inside the disc, 5 kpc from the centre, looking at it | 24.1 | 24.5 | +0.51 (4 rounds: 0.87, −5.82 (noise), 0.74, 0.27) |
| The sky from Earth towards the centre (scene `galactic-field-sky`, the drapery) | 17.5, 16.7 | 18.6, 17.6 | +1.06 (4 rounds), +0.72 (5 rounds: 2.09, −0.83, 1.72, 0.27, 0.72) |

The lines cost their vertices (about 30,000, each with a 4-piece dust integral) and 1-pixel segments: 0.2–0.5 ms. The
drapery is one full-screen quad with a texture read, like the CMB map: 0.7–1.1 ms at five million pixels. Tracing the
lines takes 0.2–0.4 s of the main thread, once a visit, when they are first to show.

With the switch off nothing of this loads (the scene component, the model, the tracer and the materials are a chunk of
their own, 16 kB, 7 kB gzipped, mounted only while the switch is on) and nothing runs per frame; the card's text and the
shares (`fieldView.ts`) are in the main bundle (a few kB) and run only while the switch is on.

## 5. Sources and licences

| Source | Used for | Licence |
| --- | --- | --- |
| M. Unger & G. R. Farrar 2024, ApJ 970, 95 (arXiv:2311.12120), Tables 2–3 and sections 5 and 7 | the field model, its parameters and checks | numbers quoted from the paper, with citation |
| WMAP nine-year K-band smoothed I/Q/U map, `wmap_band_smth_iqumap_r9_9yr_K_v5.fits`, NASA LAMBDA; Bennett et al. 2013, ApJS 208, 20 | the shipped drapery | NASA data, public domain; credit "NASA/WMAP Science Team" |
| Planck PR3 353 GHz map, `HFI_SkyMap_353-psb_2048_R3.01_full.fits`, Planck Legacy Archive; Planck Collaboration 2020, A&A 641, A3 | the drapery the script can build (not shipped) | ESA archive terms, CC BY-NC 3.0 IGO; credit "ESA, Planck Collaboration" |
| HEALPix pixelisation, Górski et al. 2005, ApJ 622, 759 | pixel centres (written from the paper) | |
| The Galaxy model's dust (Drimmel & Spergel 2001; `docs/data/galaxy.md`) | dimming the lines behind the disc | already in the app |

## 6. Limitations

- One model of eight: UF23's variants differ most in the inner Galaxy (r < 5 kpc, masked in the data) and in the halo's
  height (z_t 2.9–6.1 kpc); the spur variant replaces the grand-design disc by a single local spur. The lines show "base"
  only.
- The regular field only; the turbulent field (comparable in strength) and local structures (the North Polar Spur's
  shell, the Local Bubble's wall, which dominate the sky from here) are not in the model.
- The model's field has no edge: lines end at an arbitrary floor (0.04 µG) or volume.
- The drapery is the field summed along the line of sight from the Solar System, so it is drawn only near it; it has no
  sense, and the shipped one is synchrotron (WMAP) rather than dust (Planck).
- Line density only roughly follows field strength (lines converge and diverge as the field does); brightness carries
  the strength.
