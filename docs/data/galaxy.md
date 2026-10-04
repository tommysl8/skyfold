# The Milky Way layer

The Galaxy in Skyfold: a parametric model of the Milky Way with a particle rendering of it, the real Milky Way
sky as seen from the Sun, 1,664 star clusters with measured distances, 45 nebulae with images and distances, and the
stars orbiting the Galaxy's central black hole. Sections 1 to 11 describe the data and how they were made; section 12
describes how the app draws them. The black hole itself (its lens, its accretion flow) and the model of the nuclear
star cluster round it are written up in `docs/data/blackholes.md`. The evaluators in `src/sim/galaxy/` are plain
TypeScript with no three.js dependency (the renderer is in `src/scene/MilkyWay.tsx`, `GalaxyModel.tsx`, `Nebulae.tsx`
and `src/render/galaxyLayer.ts`).

## Contents

| Path | What it is | Size |
| --- | --- | --- |
| `src/sim/galaxy/model.json` | Parametric Galaxy: every number with its reference key | 24 KB |
| `src/sim/galaxy/sstars.json` | Orbits of the 4 stars around Sgr A* with openly licensed elements (GRAVITY 2022), frame and conventions | 7 KB |
| `src/sim/galaxy/nebulae.json` | 45 nebulae: position, distance, size, billboard geometry, image credit and modification note | 89 KB |
| `src/sim/galaxy/frames.ts` | ICRS / ecliptic J2000 / app world / galactic / galactocentric transforms, SVS sky lookup | |
| `src/sim/galaxy/model.ts` | Spiral arms, warp, dust (extinction) model, column integrals, GPU dust maps | |
| `src/sim/galaxy/sstars.ts` | Kepler orbits with optional Schwarzschild precession, sky frame to app frames | |
| `src/sim/galaxy/particles.ts` | Decoder of the particle file, and the arrays the GPU takes | |
| `src/sim/galaxy/*.test.ts` | the data's own tests, and the app's (`npx vitest run src/sim/galaxy`) | |
| `public/data/galaxy-particles.bin.gz` | 199,500 particles sampled from the model | 1.68 MB |
| `public/textures/milkyway-bg.jpg` | Milky Way sky from the Sun, 4096 x 2048, log-encoded | 3.58 MB |
| `public/textures/milkyway-bg-2k.jpg` | Same, 2048 x 1024 (fallback / first load) | 0.97 MB |
| `public/textures/milkyway-bg.json` | Projection, decoding and photometric calibration of the two textures (and the detail map's checks) | 3 KB |
| `public/textures/milkyway-detail-8k.jpg` | The sky's fine structure: the 8K map's luminance, one channel, log-encoded | 7.7 MB |
| `public/textures/galaxy-face-young.png`, `galaxy-face-bar.png`, `galaxy-face-dust.png` | The model seen face-on from outside: its young arm stars, its long bar and its dust, 4096², 8-bit log | 2.1 MB |
| `public/data/clusters.json.gz` | 1,500 open clusters and 164 globular clusters | 111 KB |
| `public/images/nebulae/<id>.jpg` | 45 billboard images, at most 512 px | 2.83 MB total |
| `scripts/build-galaxy.mjs` | Particle generator (Node, fixed seed, byte-identical reruns) | |
| `scripts/build-clusters.mjs` | Cluster catalogue builder (Node) | |
| `scripts/build-milkyway-bg.py` | Sky texture converter and calibration (Python: numpy, scipy, Pillow, OpenEXR) | |
| `scripts/build-milkyway-detail.py` | The 8K detail map (Python: numpy, scipy, Pillow, OpenEXR; the 137 MB source is fetched once and not kept) | |
| `scripts/build-galaxy-face.mjs` | The face-on maps (Node, through Vite for the model's TypeScript; about 20 minutes, `--only=bar,dust` for some) | |
| `scripts/build-nebulae.py` | Nebula image and metadata builder (Python: numpy, Pillow) | |

The two Python scripts exist because the project's Node dependencies include no EXR reader or JPEG encoder and
`package.json` must not change. Everything else is Node 24 ESM.

### What is data and what is a model

Label these differently in the UI.

- **Measured data.** The sky texture (real starlight, rendered by NASA SVS from Gaia DR2), cluster positions,
  distances, ages, masses and sizes, nebula positions, distances and photographs, Sgr A*'s mass and distance, the
  S-star orbits and the frame definitions.
- **Model.** The 3D Galaxy made of particles. Its density laws and parameters are fitted to data by the cited papers,
  but each particle is a random draw, not a star. Within a few parsecs of Sgr A* the stars are a statistical model of
  the nuclear star cluster and disc (`docs/data/blackholes.md` §6), and the gas falling into it a fitted model (§7
  there). The spiral arms are traced by parallaxes over about a third of the disc and extrapolated elsewhere. The
  dust, the colours and the split of light between components are also model.
  Suggested wording: "Model of the Milky Way built from published measurements. Individual points are not real
  stars. The far side of the Galaxy has never been mapped directly."

## 1. Frames and units

All matrices are in `model.json` (`frames`) and `src/frames.ts`.

| Frame | Definition |
| --- | --- |
| ICRS / EQJ | Heliocentric equatorial J2000 (the 23 mas frame bias between ICRS and J2000 is ignored, as astronomy-engine does). |
| ECL | Ecliptic J2000, obtained from EQJ by a rotation of the mean obliquity 84381.448 arcsec about x. This is the app's convention. |
| WORLD | The app's scene axes: `world = (x_ecl, z_ecl, -y_ecl)`. |
| GAL | Heliocentric galactic Cartesian: x towards (l, b) = (0, 0), y towards (90, 0), z towards the north galactic pole. IAU definition as realised by Hipparcos/Gaia: NGP at RA 192.85948, Dec +27.12825, longitude of the north celestial pole 122.93192 deg (ESA 1997, SP-1200 vol. 1, sec. 1.5.3). |
| G | Galactocentric model frame. Origin at Sgr A*, x from the Sun's projection towards Sgr A*, y towards l = 90 (the rotation direction at the Sun), z towards the NGP. The Sun is at (-8.27697, 0, +0.0208) kpc. Built like astropy's `Galactocentric` frame with roll 0, R0 = 8.277 kpc (GRAVITY 2022), z0 = 20.8 pc (Bennett & Bovy 2019), Sgr A* at ICRS (266.4168371, -29.0078106) deg (Reid & Brunthaler 2004). |

Conversions (all verified by tests; astropy was used to derive the G frame):

```
v_gal   = ICRS_TO_GAL  v_icrs          (Hipparcos matrix, rows = galactic axes)
v_gal   = ECL_TO_GAL   v_ecl
v_gal   = WORLD_TO_GAL v_world         GAL_TO_WORLD = transpose(WORLD_TO_GAL)
x_G     = GAL_TO_G_ROT x_gal + SUN_G   x_gal = GAL_TO_G_ROT^T (x_G - SUN_G)
```

`GAL_TO_WORLD` =

```
[ -0.05487556041621555   0.49410942787558360  -0.86766614901900474 ]
[ -0.09647662612782904   0.86228587509011301   0.49714719171596361 ]
[  0.99382137906164869   0.11099073341744095   0.00035158990483141 ]
```

`GAL_TO_G_ROT` is a 0.113 deg rotation: the galactic plane b = 0 was defined in 1958 and is tilted slightly
relative to the true midplane through Sgr A* with the Sun 20.8 pc above it. Checks in `frames.test.ts`: Sgr A* comes
out at (l, b) = (359.9443, -0.0462) deg, the north ecliptic pole at (96.384, +29.811) deg, and the Galactic centre
direction lies 5.54 deg south of the ecliptic.

Galactocentric azimuth beta (used by the spiral arms and the warp): 0 towards the Sun, increasing in the direction
of Galactic rotation, so a point at radius R is at `(x, y) = (-R cos beta, R sin beta)` in frame G. Rotation is
clockwise seen from the north galactic pole.

Scale: 1 kpc = 3.0856775814913673e16 km. The app works in float64 km with a floating origin; the Galaxy layer is
best kept in kpc (or pc) in its own group and scaled when drawn.

## 2. The parametric Galaxy (`model.json`)

Each parameter is an object `{ value, unc, ref, note }`. `ref` is a key into `references` (full citation and DOI),
or `"model"` for our own choices, which are explained in their `note`. Lengths are in kpc.

### Components

| Component | Law | Parameters | Source |
| --- | --- | --- | --- |
| Sun | position | R0 = 8.277 +- 0.009 (stat) +- 0.030 (sys) kpc; z0 = 20.8 +- 0.3 pc | GRAVITY 2022; Bennett & Bovy 2019 |
| Sgr A* | point mass | 4.297 +- 0.012 +- 0.040 x 10^6 M_sun | GRAVITY 2022 |
| Thin disc | exp(-R/hR) exp(-\|z - zwarp\|/hz) | hR = 2.6 +- 0.5, hz = 0.30 +- 0.05; M = 3.5 x 10^10 M_sun | BHG16 |
| Thick disc | same law | hR = 2.0 +- 0.2, hz = 0.90 +- 0.18; local density 4% of the thin disc | BHG16 |
| Box/peanut bulge | exp(-sqrt((x/0.70)^2 + (y/0.44)^2)) exp(-\|z\|/hz(x)) | bar angle 27 +- 2 deg; axis ratios 10 : 6.3 : 2.6; hz(x) = 0.18, 0.25, 0.56, 0.46 kpc at x = 0, 0.525, 1.125, 1.725 kpc | Wegg & Gerhard 2013; BHG16 |
| Long bar | two components (thin, super-thin), the long-bar function of Wegg et al. 2015 | angles 29.1 and 30.0 deg; x0, y0, z0, cutoffs, c_perp from their Table 1; half-length 5.0 +- 0.2 kpc | Wegg, Gerhard & Portail 2015; BHG16 |
| Nuclear stellar disc | R^-1.3 inside 90 pc, R^-3 to 230 pc, exp(-\|z\|/45 pc) | M = 1.4 x 10^9 M_sun | BHG16; Launhardt et al. 2002 |
| Nuclear star cluster | flattened Plummer | r_h = 4.2 pc, q = 0.71, M = 1.8 x 10^7 M_sun | BHG16 |
| Stellar halo | broken power law in ellipsoidal radius | slopes -2.5 / -4.5, break 25 kpc, flattening 0.65 rising to 0.8 | BHG16 |
| Spiral arms | log-periodic segments with one kink each | Table 2 of Reid et al. 2019 (below) | Reid et al. 2019 |
| Warp | a (R - Rw)^b sin(beta - betaW) | Rw = 7.72 kpc, betaW = 17.5 deg, a = 0.060, b = 1.33 | Chen et al. 2019 (Cepheids) |
| Dust | disc + arm lanes as V-band extinction per kpc | Drimmel & Spergel 2001 Tables 1 and 3 | Drimmel & Spergel 2001 |

Spiral arms (Reid et al. 2019, Table 2; R0 = 8.15 kpc in their fit, radii scaled by 8.277/8.15 here):

| Arm | beta range of the parallax data | beta_kink | R_kink (kpc) | pitch below / above kink (deg) | width (kpc) |
| --- | --- | --- | --- | --- | --- |
| 3-kpc (near) | 15 to 18 | 15 | 3.52 | -4.2 / -4.2 | 0.18 |
| Norma | 5 to 54 | 18 | 4.46 | -1.0 / 19.5 | 0.14 |
| Scutum-Centaurus | 0 to 104 | 23 | 4.91 | 14.1 / 12.1 | 0.23 |
| Sagittarius-Carina | 2 to 97 | 24 | 6.04 | 17.1 / 1.0 | 0.27 |
| Local (Orion) | -8 to 34 | 9 | 8.26 | 11.4 / 11.4 | 0.31 |
| Perseus | -23 to 115 | 40 | 8.87 | 10.3 / 8.7 | 0.35 |
| Outer | -16 to 71 | 18 | 12.24 | 3.0 / 9.4 | 0.65 |

`ln(R / R_kink) = -(beta - beta_kink) tan(psi)`; widths are Gaussian 1-sigma and grow by 42 pc per kpc of radius.
The four major arms are Norma-Outer, Scutum-Centaurus, Sagittarius-Carina and Perseus; the Local arm is a shorter
segment between Sagittarius and Perseus, and the 3-kpc arm hugs the end of the bar.

Modelling choices, stated in `model.json`:

- **Arm extrapolation.** Each arm continues beyond its data range with the pitch angle of the nearest segment for up
  to 150 deg of azimuth (90 deg for the 3-kpc arm, far enough to reach its tangent at l = 337 deg, which the fit used
  as a prior), inside 3 to 16 kpc. The arm's strength drops from 0.6 at the data edge to 0 at the end. Without this
  the far side of a face-on view has no arms at all. That would be accurate as a map of what has been measured, but
  it is misleading as a picture of the Galaxy.
- **R0 scaling.** The geometric models were fitted with other values of R0 (Reid 8.15, Drimmel & Spergel 8.0, Chen
  8.0 kpc). Their geometry is scaled by R0/R0_source so it stays centred on Sgr A*. Near the Sun this moves the arms by
  less than 2%. Wegg et al. (8.3 kpc) and BHG16 (8.2 kpc) are used unscaled because the effect (under 1%) is far
  below their uncertainties.
- **Super-thin bar.** Wegg et al. give x0 = -32.66 kpc, meaning a density that rises gently outwards. Their formula
  is undefined for a negative x0 with a fractional exponent, so the in-plane term is evaluated as
  `|y|/y0 - |x|/|x0|`. Their Gaussian cutoff `Cut(u) = exp(-u^2) for u > 1` is read as `u > 0`. As printed, it would
  make the density jump by a factor e at the cutoff radius, and their bar-length definition L = R_out + sigma_out
  (the 1/e point) assumes the continuous form.
- **Bulge X-shape.** The peanut appears in side views through hz(x). The X-shaped lobes above 400 pc (WG13) are not
  modelled explicitly.
- **Luminosity budget.** The total M_V = -21.37 (Licquia et al. 2015 via BHG16) gives L_V = 3.02 x 10^10 L_sun. It is
  split by stellar mass divided by assumed M/L_V ratios: thin disc (smooth) 52.2%, young arm stars 10%, H II regions
  1.5%, thick disc 5.8%, bulge 16%, thin bar 4.4%, super-thin bar 7.3%, nuclear disc 1.5%, nuclear cluster 0.06%,
  halo 1.2%. The implied thin-disc M/L_V is 1.8, close to 1.70 for the whole Galaxy (BHG16).
- **Young stars and H II regions.** These sit on the arm ridges with the fitted widths. Scale heights are 60 pc for
  young stars (Wegg et al. 2015, citing Joshi 2007) and 19 pc for high-mass star-forming regions (Reid et al. 2019).
  70% of the young-star particles come in clumps of 8 (sigma 30 pc), standing in for OB associations. H II region
  radii follow a log-normal (median 8 pc).
- **Colours** come from B-V per population through the same blackbody and CIE pipeline the app uses for stars:
  thin disc 0.80, young arms -0.10, thick disc 0.85, bulge 1.00, bars 0.95 / 0.75, halo 0.70, with scatter. H II
  regions use a Case B emission-line mix (H-alpha, H-beta = H-alpha/2.86, [N II], [O III], H-gamma, [S II]).

### Dust model and checks

The extinction coefficient is `a_V = 1.086 kappa_V rho` (mag per kpc), where `rho` is Drimmel & Spergel's dust
density. The disc is `rho0 exp(-r/hr) sech^2(z/hd(r))` with hr = 2.26, hd = 134 pc flaring by 14.8 pc per kpc beyond
4.4 kpc, and a Gaussian hole inside 4 kpc. The arm lanes use D&S's Gaussian cross-section (width 64 pc per kpc of
radius), height (80 pc, flaring beyond 5.48 kpc) and fall-off beyond 6.71 kpc, but lie on the Reid et al. ridges
instead of D&S's older Taylor & Cordes arms. kappa_V = 0.0180 (MJy/sr)^-1. Values from `model.ts`:

| Quantity | Model | Literature |
| --- | --- | --- |
| a_V in the plane at the Sun | 0.97 mag/kpc (0.60 disc + 0.38 Local-arm lane) | about 0.7 to 1 mag/kpc is the usual local average |
| A_V from the Sun to the north / south galactic pole | 0.16 / 0.21 mag | about 0.05 mag from far-infrared dust maps: the Sun sits in the Local Bubble, which the model does not have |
| A_V from the Sun to Sgr A* | 14.8 mag | about 40 mag (A_K about 2.6; Fritz et al. 2011, Nishiyama et al. 2008, via BHG16): the central molecular zone and inner-disc dust inside D&S's hole are missing |
| A_V to l = 30 deg, b = 0 (through the inner Galaxy) | 37 mag | the Galactic centre region is opaque in the visible, as observed |

So the model is too dusty towards high latitudes near the Sun and not dusty enough towards the centre. It is good
enough to render the Galaxy from outside, with dark lanes in the plane and a midplane dust band seen edge-on. Near the
Sun, use the real sky texture (section 4), which has the real extinction built in.

For display colours use `A_R : A_G : A_B = 0.89 : 1.00 : 1.23` times A_V. These are Cardelli, Clayton & Mathis
(1989) with R_V = 3.1, evaluated at 0.61, 0.55 and 0.465 microns.

### Arm geometry checks (`model.test.ts`)

- The fourth-quadrant tangent longitudes of the model arms are 3-kpc 337.0, Norma 327.6, Scutum 306.2 and
  Sagittarius 285.8 deg. Reid et al. give 337.0, 327.5, 306.1 and 285.6 deg. This confirms the sign and azimuth
  conventions.
- From the Sun, the Local arm ridge is 0.37 kpc outwards, Sagittarius-Carina 1.24 kpc inwards and Perseus 1.92 kpc
  outwards.
- The TypeScript evaluator and the generator agree to 1e-12.

## 3. Particles: `public/data/galaxy-particles.bin.gz`

Generated by `node scripts/build-galaxy.mjs [model.json]` (default `src/sim/galaxy/model.json`). The seed is
20260925 and the generator is xoshiro128**, so reruns give byte-identical output. It takes about 5 s.

| Population | id | Particles | Share of L_V |
| --- | --- | --- | --- |
| thinDisc | 0 | 80,000 | 52.2% |
| youngArmStars | 1 | 50,000 | 10% |
| hiiRegions | 2 | 3,500 | 1.5% |
| thickDisc | 3 | 15,000 | 5.8% |
| bulge | 4 | 24,000 | 16% |
| barThin | 5 | 8,000 | 4.4% |
| barSuperThin | 6 | 6,000 | 7.3% |
| nuclearStellarDisc | 7 | 2,500 | 1.5% |
| nuclearStarCluster | 8 | 500 | 0.06% |
| stellarHalo | 9 | 10,000 | 1.2% |

Format (little-endian). The file is gzip; inflate it with `DecompressionStream('gzip')` via
`src/sim/stars/catalogue.ts#fetchGzip`, which also copes with a host that has already inflated it. Vercel serves `.gz` as opaque
bytes.

```
Header, 64 bytes
  0  "LSGP"             4  uint32 version = 1    8  uint32 count N      12 uint32 stride = 12
 16  float32 kpc per int16 unit (0.002)          20 float32 luminosity unit (1 L_sun)
 24  float32 size unit (1 pc)                    28 float32 R0 (kpc)    32 float32 z0 (kpc)
 36  uint32 seed      40 uint32 flags (bit 0: heliocentric galactic)    44 uint32 populations (10)
Record, 12 bytes (N records, globally shuffled)
  0  int16 x, y, z     heliocentric galactic, kpc = value * 0.002 (range +-65.5 kpc, 2 pc steps)
  6  uint8 r, g, b     linear sRGB, largest channel = 255
  9  uint8 population  index into the table above
 10  uint8 lum code    L = 2^(code/8) L_sun (V band)
 11  uint8 size code   h = 2^(code/16) pc, Gaussian splat radius (1 sigma)
```

Sizes are the distance to the 8th nearest neighbour in the same population (clamped to 1 pc to 3 kpc). H II
regions use their own radius. Because the records are shuffled, the first k records are an unbiased subsample. For
a cheaper level of detail, draw k of them and multiply each luminosity by N/k.

### How to render it on an Intel iGPU

**Recommended: additive point sprites, with dust extinction computed per vertex.**

1. **Buffers.** Use one `THREE.Points` with position (world axes, via `galacticToWorld`, in scene units), colour
   (normalized uint8), luminosity and size. That is about 5 MB of GPU memory. Keep it in a group placed at the Sun's
   floating-origin position.
2. **Brightness.** The apparent V magnitude of a particle at distance r is
   `m = 4.83 - 2.5 log10(L) + 5 log10(r / 10 pc) + A_V`, the same scale as the app's stars. Convert it to flux
   with the exposure the star renderer uses. Spread the flux over the sprite (Gaussian of 1-sigma radius
   `h / r` radians) and clamp the sprite to 1 to 48 px. The clamp is what keeps fill rate bounded on an iGPU.
3. **Blending.** Use `AdditiveBlending`, `depthWrite: false` and `depthTest: true` against planets. No sorting is
   needed.
4. **Dust.** Emission is additive, so each particle can be dimmed by its own line of sight, and the order stays
   irrelevant. Once, at load, build the face-on dust map with `dustMaps(model, 512, 20)`: RGBA float, 4 MB, about
   0.35 s in JS. It holds the disc midplane a_V, the disc scale height, the arm-lane midplane a_V and the lane height.
   In the vertex shader, split the camera-to-particle segment into 6 to 8 pieces. For each piece, sample the map at
   the piece's midpoint (x, y) in frame G, compute the warp height analytically, and integrate the vertical profiles
   exactly. This is what `columnAV` does in TypeScript:

   ```glsl
   // za, zb: heights above the warped midplane at the piece's ends; L: piece length (kpc)
   float piece(vec4 m, float za, float zb, float L) {
     float dz = zb - za;
     if (abs(dz) < 1e-4 * L) {                       // horizontal piece
       float s = 1.0 / cosh(za / m.y);
       return L * (m.x * s * s + m.z * exp(-za * za / (m.w * m.w)));
     }
     float disc = m.x * m.y * (tanh(zb / m.y) - tanh(za / m.y));              // sech^2 layer
     float arms = m.z * m.w * 0.8862269 * (erf_(zb / m.w) - erf_(za / m.w));  // Gaussian layer
     return (L / dz) * (disc + arms);
   }
   ```

   Here `erf_` is the Abramowitz and Stegun 7.1.26 polynomial, the same one as in `model.ts`. The work is
   200k vertices x 8 texture fetches, trivial for any GPU. A 16-piece version agrees with a 256-piece reference to
   2% on steep paths (test).
5. **Near the camera.** Multiply alpha by `smoothstep(h, 4h, distance)`, so the particle you fly through fades out
   instead of filling the screen.
6. **Near the Sun.** Crossfade with the real sky. Let `w = smoothstep(0.3 kpc, 1.5 kpc, |camera - Sun|)`. Draw the
   SVS background with weight `1 - w` and the particles with weight `w`. At the Sun the sky is the photograph plus
   the real 3D stars. Leaving the Sun's neighbourhood, the model takes over. Both are calibrated in V (section 4).
   In the app the two pictures, not their light, are blended: the model's summed light is kept in the alpha channel
   of the galaxy layer, and its composite (`render/galaxyLayer.ts`) crossfades the finished images. Seen from the
   Sun the model is within 0.5 mag of the real sky towards the anticentre and the galactic poles, and 1.2 to 1.3 mag
   fainter towards the Sagittarius and Scutum star clouds, where its smooth dust has none of the real windows
   (`src/sim/galaxy/glow.test.ts`; section 10).
7. **Tone mapping.** The Galaxy spans about 10 magnitudes from bulge to halo. Use the app's existing tone-mapping
   curve (Reinhard or ACES), with bloom on the bulge.

**Alternative: a ray-marched volume.** A 128^3 or 256 x 256 x 64 float texture of emissivity and dust, marched per
pixel. It gives soft dust lanes and correct self-absorption. But a 1080p frame at 64 steps is about 130M texture
fetches, too heavy for an iGPU at 60 fps. It is also blurry near the camera, and the Galaxy's thin structures (a
60-pc young disc, 19-pc H II regions) would need an impractical resolution. Do not use it for the main view. A small
low-resolution volume can be worth it as a "far away" impostor, drawn only when the camera is more than about 50 kpc
out.

## 4. The sky from the Sun: `public/textures/milkyway-bg.*`

**Source:** NASA SVS "Deep Star Maps 2020", the **Milky Way background** layer in **celestial coordinates**,
`milkyway_2020_4k.exr` (4096 x 2048, half-float linear RGB), at https://svs.gsfc.nasa.gov/4851. SVS rendered this
layer from Gaia DR2 with the Hipparcos and Tycho-2 stars left out. It is the summed light of stars fainter than
V ~ 11, with the real dust lanes, the Magellanic Clouds and bright clusters.

**Licence and credit.** The SVS help page says "All of our content is in the public domain (unless otherwise
noted)". The 4851 page notes only its credit lines. Show:
"NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC."

**Projection (verified).** Plate carree in ICRS/J2000. Pixel (i, j), with column i from the left and row j from
the top, covers `RA = 360 (0.5 - (i + 0.5)/W) mod 360`, `Dec = 90 - 180 (j + 0.5)/H`. RA = 0 is the centre column,
RA increases to the left, and north is up. We checked the centres against 5,804 HYG stars in the bright-star layer:
the median offset is 0.002 px in x and 0.012 px in y. `frames.ts#svsCelestialUVFromWorld` gives the lookup from an
app world direction. In GLSL:

```glsl
// d: unit direction in app world axes; eps = 84381.448 arcsec
vec3 ecl = vec3(d.x, -d.z, d.y);
vec3 eq  = vec3(ecl.x, cosEps * ecl.y - sinEps * ecl.z, sinEps * ecl.y + cosEps * ecl.z);
float ra = atan(eq.y, eq.x), dec = asin(clamp(eq.z, -1.0, 1.0));
vec2 uv  = vec2(fract(0.5 - ra / 6.2831853), 0.5 + dec / 3.1415927);   // flipY = true
vec3 e   = texture(tex, uv).rgb;                  // load with colorSpace = THREE.NoColorSpace
vec3 p   = 2e-4 * (exp(e * 8.517393) - 1.0);      // SVS linear value, 0..1
```

Because the u coordinate wraps at RA = 180 deg, compute mip levels from the unwrapped direction (`textureGrad` with
derivatives of a continuous angle), or use `LinearFilter` without mipmaps on the 4K texture. Otherwise a one-pixel
seam shows.

**Encoding.** Each channel stores `e = ln(1 + p/P0) / ln(1 + 1/P0)` with P0 = 2 x 10^-4, as an 8-bit baseline JPEG
(4:2:0, no ICC profile). The encoding follows the data's 3.5-decade range (1st percentile 7.5 x 10^-4, maximum 1)
with 3.4% steps. After decoding, the error at a 1024-pixel scale has a median of 1.2% and a 95th percentile of 3.9%.
The 4K file is quality 92 and 3.58 MB; the 2K file is quality 95 and 0.97 MB (averaged 2 x 2 in linear light before
encoding). Load the 2K first and swap to the 4K when it arrives.

**Photometric calibration** (`milkyway-bg.json`, computed by the script):

- The full SVS star map equals 0.5 x this layer plus the bright-star layer. The ratio is 0.5000, measured on
  star-free pixels. So the physically consistent background is 0.5 p.
- Aperture sums of 5,804 isolated unsaturated HYG stars (5.5 < V < 7.8) in the bright-star layer, times cos(Dec)
  because SVS renders per unit solid angle, give V = 5.19 - 2.5 log10(sum), with a MAD of 0.33 mag.
- Hence a texel's V-band surface brightness is **mu_V = 18.44 - 2.5 log10(p) mag/arcsec^2**. Examples: north
  galactic pole 24.5, anticentre 21.9, Galactic centre and Scutum star cloud 20.2. The uncertainty is about 0.3 mag,
  mostly the colour transformation between HYG V and the SVS rendering.
- In the app's star units, a texel emits `1790 p` times the flux of a V = 0 star per steradian. Use this to put the
  background and the point stars on one exposure. Both formulas already include the factor 0.5; apply them to p as
  decoded.

**What it is not.** It has no nebular emission (H-alpha), zodiacal light or airglow. Stars brighter than about V = 11
are missing on purpose, because the app draws them as points. The app draws the catalogue's stars as points only down
to the eye's limit (V 6.5), so the light of those from V 6.5 to 11 (the core catalogue's, and its extension's
brighter than V = 11: docs/data/stars.md §12) is in `public/textures/faint-stars.png`
(`scripts/build-faint-stars.mjs`: each star's share of light the star field does not draw, spread over a Gaussian of
0.5°, in the sky map's projection and encoding), which the shader adds to the map. The extension's stars from V 10 to
11 add about a third to that light (143 stars of V = 0 in all, against 106 from the core). The galactic-coordinate version (`milkyway_2020_4k_gal.exr`) was not used, because the celestial one maps
straight to the app's frame.

## 5. Star clusters: `public/data/clusters.json.gz`

Built by `node scripts/build-clusters.mjs`. The structure is `{ meta, openClusters: { columns, rows },
globularClusters: { columns, rows } }` (columns are listed in the file). Positions are ICRS RA/Dec, plus heliocentric
galactic x, y, z in pc from the adopted distance.

**Open clusters (1,500)** come from Hunt & Reffert (2024, A&A 686, A42), which extends their 2023 Gaia DR3
catalogue (A&A 673, A114) with photometric masses, Jacobi radii and a bound/unbound classification. Selection:
objects classified as bound open clusters (type o), with astrometric S/N (CST) of at least 5. Within that, we keep
60 named showpieces always (Pleiades, Hyades, Praesepe, Double Cluster, Jewel Box, the Messier clusters, the
clusters inside the Rosette, Eagle, Lagoon and Carina nebulae, and so on). Then come the most massive clusters with
CMD class of at least 0.5 within 1 kpc (602 end up within 1 kpc), and then the most massive high-quality clusters
beyond, up to 1,500. Moving groups are excluded. Columns: name, common name, RA/Dec (densest point, epoch 2016.0),
l/b, distance with 16th/84th percentiles (pc), x/y/z, r50 (radius holding half the members), Jacobi and tidal radii
(pc), members, log age with percentiles, A_V, total and Jacobi-radius mass (M_sun), CST and CMD class.

Caveats: the distance percentiles are statistical only. Add about 0.015 mas of parallax systematic, which is 3.5% at
2.3 kpc and 10% at 6.8 kpc (Lindegren et al. 2021). Masses count only the stars Gaia sees, corrected for completeness by the authors.
Heavily embedded young clusters have low CMD classes but real distances.

**Globular clusters (164).**

- Positions: Vasiliev & Baumgardt (2021, MNRAS 505, 5978, CC BY 4.0).
- Distances: Baumgardt & Vasiliev (2021, MNRAS 505, 5957), from the arXiv version (CC BY 4.0). 159 clusters use
  these; 5 fall back to Harris.
- Integrated magnitudes, half-light and core radii, concentration, [Fe/H] and E(B-V): Harris (1996, 2010 edition).
  M_V is rescaled to the adopted distance.
- Mass: an estimate, `1.9 x L_V`, with M_V,sun = 4.83. Baumgardt et al. (2020) find 1.4 < M/L_V < 2.5, so expect
  about 0.15 dex scatter.

The dynamical masses of the Baumgardt online database were not used: its licence could not be confirmed (it carries
only a copyright line). 12 clusters lack r_h and 8 lack M_V (faint, recently found or heavily reddened ones). Give
them a default look (r_h = 3 pc, M_V = -6). Ten recently found clusters with no position or distance in these
sources are listed in `meta.globularSkipped`.

## 6. Nebulae: `src/sim/galaxy/nebulae.json` and `public/images/nebulae/<id>.jpg`

Built by `python scripts/build-nebulae.py`. It downloads each image once into `data-raw/galaxy/nebulae/`. For each
object:

- `position`: SIMBAD ICRS coordinates.
- `distance`: `{ pc, minusPc, plusPc, method, ref, doi }`. Gaia-based values include a 0.015 mas parallax systematic
  in quadrature.
- `helioGalacticPc`.
- `billboard`: `{ image, centerRaDeg, centerDecDeg, widthArcmin, heightArcmin, northAngleDeg, widthPc, heightPc,
  helioGalacticPc }`.
- `imageSource`: archive, id, page, file, band (visible or near-infrared), crop.
- `credit`: the exact credit line from the image page, which must be shown with the image. It is the whole credit,
  including any team lists the page gives with it (Westerlund 2, heic1509a, continues its credit line with the
  science and Hubble Heritage teams; the first version of the file dropped that part).
- `modificationNote`: "Image modified for Skyfold: [cropped,] resized, black level subtracted and edges faded".
  CC BY 4.0 (section 3(a)(1)(B)) requires saying that the material was modified, so show it after the credit.
- `licence` and a one-line `blurb`.

**Placing a billboard.** Put its centre at `billboard.helioGalacticPc`, which is the image centre at the object's
distance, not the SIMBAD position. Size it `widthPc x heightPc`. Orient it so image-up is rotated `northAngleDeg`
clockwise from celestial north as seen from the Sun; east is 90 deg counterclockwise from north (not mirrored). The
image is the view from Earth. For a correct parallax, keep the plane facing the Sun, so flying past shows it edge-on.
Or keep it camera-facing and let it fade as the viewing angle moves more than about 60 deg from the Earth
direction. The second is kinder to the eye; the first is honest. Use `AdditiveBlending` and sRGB textures. The 2nd
percentile black level has already been subtracted and the outer 8% of each side fades to black, so edges do not
show.

**Licences.** ESA/Hubble, ESA/Webb, ESO and NSF NOIRLab all publish their images under CC BY 4.0, with the full
credit line required, unaltered, next to the image (their copyright pages are cited in the script header). The
shipped images are modified (resized, black level subtracted, edges faded, three cropped), which the on-screen credit
must say: show `credit`, then `modificationNote`, with links to the image page and to the licence. All 45
images come from those four archives. Mentions of other organisations inside a credit (NASA, CSA, STScI, Hubble
Heritage) are part of that credit line and stay in it.

| Object | Kind | Image | Distance (pc) | Distance source | Billboard (pc) |
| --- | --- | --- | --- | --- | --- |
| Orion Nebula | HII region | ESO eso1723a | 388 (-5/+5) | Kounkel et al. 2017, VLBA | 6.77 x 5.25 |
| Horsehead Nebula | dark nebula | ESO eso0202a | 396 (-2/+2) | Hunt & Reffert 2024 (sigma Ori cluster) | 0.75 x 0.77 |
| Flame Nebula | HII region (near-IR image) | ESO eso0949a | 420 (-20/+20) | Kounkel et al. 2017 | 5.24 x 6.42 |
| M78 | reflection nebula | ESO eso1105a | 404 (-2/+2) | Hunt & Reffert 2024 (NGC 2068) | 4.05 x 3.92 |
| Rosette Nebula | HII region | NOIRLab noirlab2424a | 1,415 (-30/+30) | Hunt & Reffert 2024 (NGC 2244) | 39.0 x 33.2 |
| NGC 2264 (Cone, Christmas Tree) | HII region | ESO eso0848a | 700 (-8/+8) | Hunt & Reffert 2024 | 6.79 x 7.76 |
| Cone Nebula | dark nebula | ESO eso2215a | 700 (-8/+8) | Hunt & Reffert 2024 (NGC 2264) | 1.40 x 1.44 |
| Eagle Nebula | HII region | ESO eso0926a | 1,698 (-44/+44) | Hunt & Reffert 2024 (NGC 6611) | 15.9 x 15.9 |
| Pillars of Creation | dark nebula | ESA/Hubble heic1501a | 1,698 (-44/+44) | Hunt & Reffert 2024 (NGC 6611) | 2.24 x 2.33 |
| Lagoon Nebula | HII region | ESO eso1403a | 1,230 (-23/+23) | Hunt & Reffert 2024 (NGC 6530) | 20.8 x 14.2 |
| Trifid Nebula | HII region | ESO eso0930a | 1,264 (-68/+76) | Kuhn et al. 2019, Gaia DR2 | 5.11 x 8.39 |
| Omega Nebula | HII region | ESO eso1119a | 1,680 (-110/+130) | Kuhn et al. 2019, Gaia DR2 | 26.1 x 26.1 |
| Carina Nebula | HII region | ESO eso1250a | 2,297 (-79/+79) | Hunt & Reffert 2024 (Trumpler 16) | 41.3 x 44.3 |
| Cosmic Cliffs (NGC 3324) | HII region (near-IR) | ESA/Webb weic2205a | 2,419 (-90/+90) | Hunt & Reffert 2024 (NGC 3324) | 5.13 x 2.97 |
| Homunculus (Eta Carinae) | LBV nebula | ESA/Hubble opo9623a | 2,350 (-50/+50) | Smith 2006, expansion parallax | 0.29 x 0.29 |
| Cat's Paw Nebula | HII region | ESO eso1003a | 1,650 (-41/+41) | Hunt & Reffert 2024 (NGC 6334) | 14.7 x 15.3 |
| Lobster Nebula | HII region | ESO eso1705a (cropped) | 1,672 (-42/+42) | Hunt & Reffert 2024 (NGC 6357) | 29.2 x 29.2 |
| NGC 3603 | HII region | ESO eso1005a | 6,775 (-695/+696) | Hunt & Reffert 2024 | 17.7 x 17.8 |
| Westerlund 2 and Gum 29 | HII region | ESA/Hubble heic1509a | 4,533 (-318/+319) | Hunt & Reffert 2024 | 9.81 x 7.34 |
| Running Chicken Nebula | HII region | ESO eso2320a (cropped) | 2,363 (-86/+86) | Hunt & Reffert 2024 (IC 2944) | 61.9 x 55.0 |
| North America and Pelican | HII region | NOIRLab noao-n7000mosblock | 795 (-25/+25) | Kuhn et al. 2020, Gaia DR2 | 58.0 x 39.6 |
| Bubble Nebula | wind bubble | ESA/Hubble heic1608a | 2,830 (-156/+180) | Bailer-Jones et al. 2021 (BD+60 2522) | 4.27 x 4.06 |
| Thor's Helmet | Wolf-Rayet nebula | ESO eso1238a | 4,118 (-474/+598) | Bailer-Jones et al. 2021 (WR 7) | 8.64 x 8.67 |
| Seagull Nebula | HII region | ESO eso1913a | 1,105 (-18/+18) | Hunt & Reffert 2024 (vdBergh 92) | 57.9 x 38.5 |
| Prawn Nebula | HII region | ESO eso1340a | 1,593 (-39/+39) | Hunt & Reffert 2024 (ESO 332-13) | 29.2 x 21.1 |
| Crescent Nebula | Wolf-Rayet nebula | NOIRLab noao-04494 | 1,669 (-56/+59) | Bailer-Jones et al. 2021 (WR 136) | 29.5 x 28.2 |
| Iris Nebula | reflection nebula | NOIRLab noao-ngc7023 | 352 (-5/+5) | Bailer-Jones et al. 2021 (HD 200775) | 2.46 x 2.27 |
| Pleiades reflection nebula | reflection nebula | NOIRLab noao-m45 | 134.8 (-0.3/+0.3) | Hunt & Reffert 2024 (Melotte 22) | 2.69 x 1.97 |
| Tarantula Nebula (LMC) | HII region | ESO eso0650a (cropped) | 49,590 (+-544) | Pietrzynski et al. 2019 | 577 x 577 |
| NGC 346 (SMC) | HII region (near-IR) | ESA/Webb weic2301a | 62,440 (+-934) | Graczyk et al. 2020 | 74.7 x 108 |
| SN 1987A (LMC) | supernova remnant | ESA/Hubble heic1704a | 49,590 (+-544) | Pietrzynski et al. 2019 | 34.6 x 37.9 |
| Ring Nebula | planetary nebula | ESA/Hubble heic1310a | 782 (-33/+30) | Bailer-Jones et al. 2021 | 0.48 x 0.48 |
| Helix Nebula | planetary nebula | ESO eso0907a | 199 (-2/+2) | Bailer-Jones et al. 2021 | 1.62 x 1.50 |
| Dumbbell Nebula | planetary nebula | ESO eso9846a | 387 (-7/+8) | Bailer-Jones et al. 2021 | 0.76 x 0.77 |
| Cat's Eye Nebula | planetary nebula | ESA/Hubble heic0414a | 1,317 (-50/+61) | Bailer-Jones et al. 2021 | 0.45 x 0.45 |
| Butterfly Nebula | planetary nebula | ESA/Hubble heic0910h | 1,170 (-140/+140) | Meaburn et al. 2008, expansion parallax | 0.80 x 0.93 |
| Southern Ring Nebula | planetary nebula (near-IR) | ESA/Webb weic2207b | 754 (-20/+17) | Bailer-Jones et al. 2021 (bright companion) | 0.53 x 0.49 |
| Hourglass Nebula | planetary nebula | ESA/Hubble opo9607a | 4,813 (-1,511/+4,305) | Bailer-Jones et al. 2021, poorly constrained | 0.57 x 0.57 |
| Saturn Nebula | planetary nebula | ESO eso1731a | 1,182 (-69/+82) | Bailer-Jones et al. 2021 | 0.42 x 0.42 |
| Spirograph Nebula | planetary nebula | ESA/Hubble opo0028a | 1,321 (-58/+68) | Bailer-Jones et al. 2021 | 0.14 x 0.15 |
| Egg Nebula | pre-planetary nebula | ESA/Hubble heic2604a | 420 (-60/+60) | Ueta et al. 2006, expansion parallax | 0.13 x 0.13 |
| Crab Nebula | supernova remnant | ESA/Hubble heic0515a | 2,000 (-500/+500) | Trimble 1973 | 3.73 x 3.73 |
| Cygnus Loop (Veil) | supernova remnant | NOIRLab noao1209a | 725 (-15/+15) | Fesen et al. 2021, Gaia EDR3 | 36.5 x 36.7 |
| Cassiopeia A | supernova remnant | ESA/Hubble heic0609a | 3,400 (-100/+300) | Reed et al. 1995 | 8.46 x 6.08 |
| Pencil Nebula (Vela SNR) | supernova remnant | ESO eso1236a | 293 (-17/+19) | Dodson et al. 2003, pulsar parallax | 2.83 x 2.83 |

Where a distance's uncertainty was not quoted, the value is marked in `ref`. That applies to Kounkel's "roughly
~420 pc" for NGC 2024 and Ueta's "about 420 pc" for the Egg; the plus or minus there is our allowance. Where two
good measurements disagree, the other one is in the blurb. For example, the Cat's Paw has a water-maser parallax of
0.752 +- 0.069 mas, or 1.33 kpc (Reid et al. 2019, Table 1), against Gaia's 1.65 kpc. Candidates dropped for unreliable distances: Boomerang
Nebula (Gaia 0.37 kpc with RUWE 3.5, literature 1.5 kpc), Red Rectangle, NGC 2440, Barnard 68, Tycho's SNR and
Kepler's SNR (no field-of-view data for the image).

## 7. The Galactic Centre: `src/sim/galaxy/sstars.json` and `src/sim/galaxy/sstars.ts`

**Sgr A*.** Mass 4.297 +- 0.012 (stat) +- 0.040 (sys) x 10^6 M_sun and distance 8277 +- 9 +- 30 pc, from the
four-star fit of GRAVITY Collaboration 2022 (A&A 657, L12). Earlier values are kept in `model.json#sgrA`: GRAVITY
2019, 8178 pc and 4.152 x 10^6; GRAVITY 2020, 8246.7 pc and 4.261 x 10^6; GRAVITY 2021, 8275 pc and 4.297 x 10^6.
Position (Reid & Brunthaler 2004): RA 17h45m40.0409s, Dec -29d00m28.118s.

**Orbits (4 stars).**

- S2, S29, S38 and S55 come from GRAVITY 2022 Table 1 (osculating near apocentre: 2010.35, 1977, 2000 and 2012),
  CC BY 4.0. Their periods follow from Kepler's third law in that paper's potential; S2 gives 16.045 yr against the
  published 16.0455.
- The first version of the file also carried 16 orbits from Gillessen et al. 2017 (ApJ 837, 30), Table 3 (S1, S4,
  S6, S8, S9, S12, S13, S14, S17, S18, S21, S24, S31, S175, S67, S96). That article predates the AAS journals'
  open-access licence, it is AAS copyright, and no licence for reusing its table could be confirmed, so those orbits
  were removed. The paper is kept in `sstars.json` → `furtherReading` for anyone who wants the other 36 stars.

**Frame and conventions.** The sky frame at Sgr A* has x east (Delta RA cos Dec), y north and z along the line of
sight away from the observer, so radial velocity is dz/dt. The elements use the visual-orbit convention: Omega is
measured from north through east, the ascending node is where the star recedes, and i > 90 deg means clockwise on the
sky. Semi-major axes are angles; `a[au] = a[arcsec] x R0[pc]`. Epochs are decimal Julian years at the observer. The
27,000-year light-travel time is not removed, and the up to 8-day Roemer delay across the orbit is ignored.
`skyToIcrs`, `skyToGalactic` and `skyToWorld` rotate the offsets into the app's frames. Add them to Sgr A*'s
position, which is 8.277 kpc along (l, b) = (359.9443, -0.0462).

**Precession.** GR advances the periapsis by 6 pi G M / (c^2 a (1 - e^2)) per orbit, 12.2 arcmin for S2 (GRAVITY
quote about 12 arcmin).
GRAVITY measured f_SP = 1.10 +- 0.19 (2020) and 0.997 +- 0.144 (2022), where 1 is general relativity. With
`{ fSP: 1 }`, the evaluator advances omega in proportion to the swept true anomaly. That is the first-order 1PN
orbit, and it puts about 70% of each step within a few months of pericentre, as observed. At the elements' osculation
epoch the published omega is recovered exactly. The default `fSP: 0` gives the plain Kepler orbit the elements
describe. The orbits leave out the gravitational redshift and the transverse Doppler shift of the radial velocity
(about 200 km/s together at pericentre): they change what a spectrograph reads, not where the star is. The colours and
magnitudes drawn near Sgr A* include both: `sim/lensBodies.ts` gives each image the star's gravitational shift where it
is and its orbital Doppler factor along the ray that reaches the camera (`docs/data/blackholes.md` §10).

**Tests** (`sstars.test.ts`, all derived from the papers):

- S2's pericentre falls in May 2018 (published: 19 May, MJD 58257.7) at 119.5 au, within 115 to 125 au.
- The period is 16.035 to 16.055 yr.
- Pericentre speed is 7,750 km/s. GRAVITY 2018 quotes 7,650 km/s for its smaller mass and distance, and v scales
  as sqrt(M/R0).
- The radial velocity peaks near +3,960 km/s before pericentre and falls to about -1,880 km/s after.
- Apocentre is 0.176 arcsec north of Sgr A*, and the motion is clockwise.
- The precession is 12.2 arcmin per orbit.
- S29 reaches 101 au and 8,620 km/s in 2021.4; GRAVITY 2022 quote about 100 au and 8,740 km/s.
- S55's period is 12.25 yr.
- The Kepler solver is accurate to 1e-12 up to e = 0.9999.

**Licence note on the orbits.** Only the GRAVITY 2022 values (CC BY 4.0, confirmed through Crossref's licence
metadata) are included. The Gillessen et al. 2017 orbits were removed (see above); a test checks that only the four
GRAVITY 2022 stars remain.

## 8. Running the code

```
npx vitest run src/sim/galaxy              # the data's and the app's tests
node scripts/build-galaxy.mjs               # particles (reads src/sim/galaxy/model.json)
node scripts/build-clusters.mjs             # clusters
python scripts/build-milkyway-bg.py         # sky texture (needs: pip install numpy scipy pillow OpenEXR)
python scripts/build-nebulae.py             # nebula images and nebulae.json (needs: numpy pillow)
```

`model.test.ts` imports `scripts/build-galaxy.mjs`, to check that the generator and the evaluator agree.

Raw inputs are cached in `data-raw/galaxy/` (gitignored, never re-downloaded):

| File | Source |
| --- | --- |
| `milkyway_2020_4k.exr`, `hiptyc_2020_4k.exr`, `starmap_2020_4k.exr` | https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/ |
| `HR24_clusters.dat.gz`, `HR24_ReadMe.txt` | https://cdsarc.cds.unistra.fr/ftp/J/A+A/686/A42/ |
| `HR23_clusters.dat.gz`, `HR23_ReadMe.txt` | https://cdsarc.cds.unistra.fr/ftp/J/A+A/673/A114/ (reference only) |
| `VB21_tablea1.dat`, `VB21_ReadMe.txt` | https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/505/5978/ |
| `BV21_arXiv2105.09526_findis_tab.tex` | arXiv:2105.09526 source (CC BY 4.0) |
| `harris_mwgc2010.dat` | https://physics.mcmaster.ca/~harris/mwgc.dat |
| `nebulae/*.jpg`, `nebulae/page_*.html` | the archive pages listed in `nebulae.json` |
| `../hyg_v44.csv.gz` (existing) | HYG v4.4, used only to verify and calibrate the sky texture |

## 9. Sources and licences

Papers whose numbers are used, with the reference keys used in the JSON files:

- GRAVITY Collaboration 2018, A&A 615, L15, doi:10.1051/0004-6361/201833718 (S2 redshift; pericentre date and speed)
- GRAVITY Collaboration 2019, A&A 625, L10, doi:10.1051/0004-6361/201935656
- GRAVITY Collaboration 2020, A&A 636, L5, doi:10.1051/0004-6361/202037813 (Schwarzschild precession)
- GRAVITY Collaboration 2021, A&A 647, A59, doi:10.1051/0004-6361/202040208
- GRAVITY Collaboration 2022, A&A 657, L12, doi:10.1051/0004-6361/202142465 (R0, mass, S2/S29/S38/S55; CC BY 4.0)
- Gillessen S. et al. 2017, ApJ 837, 30, doi:10.3847/1538-4357/aa5c41 (40 S-star orbits; further reading only, not used)
- Meyer L. et al. 2012, Science 338, 84, doi:10.1126/science.1225506 (S55 = S0-102)
- Reid M.J., Brunthaler A. 2004, ApJ 616, 872, doi:10.1086/424960; 2020, ApJ 892, 39, doi:10.3847/1538-4357/ab76cd
- Bennett M., Bovy J. 2019, MNRAS 482, 1417, doi:10.1093/mnras/sty2813
- Schoenrich R., Binney J., Dehnen W. 2010, MNRAS 403, 1829, doi:10.1111/j.1365-2966.2010.16253.x
- Bland-Hawthorn J., Gerhard O. 2016, ARA&A 54, 529, doi:10.1146/annurev-astro-081915-023441
- Licquia T.C., Newman J.A., Brinchmann J. 2015, ApJ 809, 96, doi:10.1088/0004-637X/809/1/96 (via BHG16)
- Reid M.J. et al. 2019, ApJ 885, 131, doi:10.3847/1538-4357/ab4a11
- Wegg C., Gerhard O. 2013, MNRAS 435, 1874, doi:10.1093/mnras/stt1376
- Wegg C., Gerhard O., Portail M. 2015, MNRAS 450, 4050, doi:10.1093/mnras/stv745
- Launhardt R., Zylka R., Mezger P.G. 2002, A&A 384, 112, doi:10.1051/0004-6361:20020017
- Chen X. et al. 2019, Nature Astronomy 3, 320, doi:10.1038/s41550-018-0686-7
- Drimmel R., Spergel D.N. 2001, ApJ 556, 181, doi:10.1086/321556
- Cardelli J.A., Clayton G.C., Mathis J.S. 1989, ApJ 345, 245 (extinction curve for display colours)
- Ballesteros F.J. 2012, EPL 97, 34008; Wyman C., Sloan P.-P., Shirley P. 2013, JCGT 2(2), 1 (colour pipeline)
- ESA 1997, The Hipparcos and Tycho Catalogues, SP-1200 (galactic frame)
- Lindegren L. et al. 2021, A&A 649, A4, doi:10.1051/0004-6361/202039653 (parallax zero point, systematic floor)
- Hunt E.L., Reffert S. 2023, A&A 673, A114, doi:10.1051/0004-6361/202346285; 2024, A&A 686, A42,
  doi:10.1051/0004-6361/202348662 (CC BY 4.0)
- Vasiliev E., Baumgardt H. 2021, MNRAS 505, 5978, doi:10.1093/mnras/stab1475 (CC BY 4.0)
- Baumgardt H., Vasiliev E. 2021, MNRAS 505, 5957, doi:10.1093/mnras/stab1474 (arXiv:2105.09526, CC BY 4.0)
- Baumgardt H., Sollima A., Hilker M. 2020, PASA 37, e046, doi:10.1017/pasa.2020.38 (M/L_V range)
- Harris W.E. 1996, AJ 112, 1487, doi:10.1086/118116 (2010 edition, catalogue website)
- Bailer-Jones C.A.L. et al. 2021, AJ 161, 147, doi:10.3847/1538-3881/abd806 (distances of 12 central/ionising stars)
- Kounkel M. et al. 2017, ApJ 834, 142, doi:10.3847/1538-4357/834/2/142
- Kuhn M.A. et al. 2019, ApJ 870, 32, doi:10.3847/1538-4357/aaef8c; 2020, ApJ 899, 128, doi:10.3847/1538-4357/aba19a
- Smith N. 2006, ApJ 644, 1151, doi:10.1086/503766
- Meaburn J. et al. 2008, MNRAS 385, 269, doi:10.1111/j.1365-2966.2007.12782.x
- Ueta T., Murakawa K., Meixner M. 2006, ApJ 641, 1113, doi:10.1086/500642
- Trimble V. 1973, PASP 85, 579, doi:10.1086/129507
- Fesen R.A., Weil K.E., Cisneros I. 2021, MNRAS 507, 244, doi:10.1093/mnras/stab2066
- Reed J.E. et al. 1995, ApJ 440, 706, doi:10.1086/175308
- Dodson R. et al. 2003, ApJ 596, 1137, doi:10.1086/378089
- Pietrzynski G. et al. 2019, Nature 567, 200, doi:10.1038/s41586-019-0999-4
- Graczyk D. et al. 2020, ApJ 904, 13, doi:10.3847/1538-4357/abbb2b
- Positions: SIMBAD, Wenger M. et al. 2000, A&AS 143, 9

Licence status of each shipped file:

| File | Licence | Confirmed from |
| --- | --- | --- |
| `galaxy-particles.bin.gz` | the project's own (generated by our code from published parameters) | n/a |
| `milkyway-bg*.jpg/.json` | public domain (NASA SVS), with credit lines | svs.gsfc.nasa.gov/help ("public domain unless otherwise noted"), page 4851 credits |
| `clusters.json.gz`, open clusters | CC BY 4.0 | Crossref licence metadata for both Hunt & Reffert papers; arXiv:2303.13424 CC BY 4.0 |
| `clusters.json.gz`, globular positions | CC BY 4.0 | Crossref licence metadata for doi:10.1093/mnras/stab1475 |
| `clusters.json.gz`, globular distances | CC BY 4.0 | arXiv:2105.09526 licence |
| `clusters.json.gz`, Harris parameters | free of charge; redistributors must refer to the original website and charge no fee | header of mwgc.dat |
| `images/nebulae/*.jpg` | CC BY 4.0, full credit line required, modification to be indicated | copyright pages of ESA/Hubble, ESA/Webb, ESO, NOIRLab |
| `src/sim/galaxy/sstars.json` (bundled) | GRAVITY 2022 values, CC BY 4.0 (the Gillessen 2017 orbits were removed, section 7) | Crossref licence metadata |

The rows for these files are in `CREDITS.md`, and the About page lists the sources.

## 10. Known limitations

- The dust model has no Local Bubble (too much extinction towards high latitudes near the Sun) and no central
  molecular zone (too little towards the centre). See the table in section 2.
- The arms are extrapolations away from the parallax data (`betaData` in `model.json`). The warp and arm widths
  beyond about 15 kpc are poorly constrained.
- The disc has no flare, and the X-shaped bulge lobes are not explicit.
- Globular cluster masses are photometric estimates (M/L_V = 1.9), not dynamical masses.
- Hunt & Reffert distance uncertainties are statistical; a 0.015 mas systematic is added only in `nebulae.json`.
- The SVS background lacks stars brighter than V ~ 11; the star catalogue's stars from V 6.5 to 11 (Tycho-2's
  completeness near V 11 aside) are in `public/textures/faint-stars.png` (section 4).
- The dust is smooth: it has no gaps like the windows towards the Sagittarius and Scutum star clouds, so seen from
  the Sun the model is 1.2 to 1.3 mag fainter than the real sky there (within 0.5 mag towards the anticentre and the
  poles; `glow.test.ts`).
- The bar is 2.5 times brighter along it than across it at R = 2.5 to 4.5 kpc in the particles (27°, near end at
  positive longitude), but the round thin disc continues through it, so it is hard to see from outside. A hole in the
  thin disc inside the bar would be a modelling choice that Bland-Hawthorn & Gerhard (2016) do not make; a
  Besançon-style hole (Robin et al. 2003, 1.3 kpc) would not change 2.5 to 4.5 kpc. Left for the author to decide.
- The S-star evaluator ignores the Roemer delay and the relativistic redshift terms of the radial velocity (the
  colours drawn near Sgr A* include them, section 7). It is not a replacement for a full orbit fit.

## 11. Changes after the independent verification (25 September 2026)

The model parameters, particle file, Milky Way background, clusters, nebula distances and orientations, and the S2
orbit were confirmed against their sources. Fixed here:

- **S-star orbits.** The 16 orbits from Gillessen et al. 2017 were removed from `sstars.json`: the article is AAS
  copyright and no licence for reusing its table could be confirmed. The four GRAVITY 2022 orbits (CC BY 4.0) remain.
- **Westerlund 2 credit.** The credit line now includes the science and Hubble Heritage teams, as the ESA/Hubble page
  gives it (the script used to cut it after the first sentence).
- **Modified images.** Every nebula now has a `modificationNote` to show after its credit, as CC BY 4.0 requires.
- **Stale text.** The gap between the Milky Way background and the 3D stars is now V 10–11, not V 6.5–11.

## 12. In the app

### Bodies

Registered by `src/sim/galaxy/load.ts` from the records of `records.ts`:

- `milky-way` (kind `galaxy`, at Sgr A*), labelled "Model built from published measurements (Reid et al. 2019 arms,
  Wegg et al. bar, Drimmel and Spergel dust)". Its framing is the view from 100,000 light-years (`frameMilkyWay`,
  20° off the north galactic pole towards the Sun): the scene `milky-way-outside`, and the trail's "Milky Way" link.
- `sgr-a-star` (kind `black-hole`): the GRAVITY 2022 mass and distance at the Reid & Brunthaler position, held fixed.
  Its radius is the horizon's, r_s = 2GM/c² = 0.0848 au, and it has renderer `lens`: no mesh and no point of light of
  its own, but a Schwarzschild lens that bends everything in view round its shadow (√27 GM/c² = 0.220 au in impact
  parameter), the model of its accretion flow (a point from far away, a ring close in) and the nuclear star cluster
  round it. Its camera hovers in height above the horizon down to r_s(1 + 10⁻⁶). All of it is in
  `docs/data/blackholes.md`.
- `s2`, `s29`, `s38`, `s55` (kind `star`, parent Sgr A*): the GRAVITY 2022 orbits with the Schwarzschild precession
  (f_SP = 1). The app places a body where it is at the date shown, and the orbits' epochs are when their light
  reaches us, so each orbit is evaluated a light-time D/c after the date: where the star is now is 27,000 years of
  orbits beyond what we see, and the regime is `illustrative` except within 40 years of 2010 as seen. Brightness is
  estimated from the K magnitude with A_K = 2.42 (Fritz et al. 2011) and a colour typical of the star's class; the
  cards say so, and that other published orbits exist but are not licensed for reuse. The scene
  `galactic-centre-orbits` frames S2's orbit face-on and sets the rate so that S2 goes round in 30 s.
- The 45 nebulae (kind `nebula`; one inside another is its child: the Pillars of Creation under the Eagle Nebula),
  each with its picture, credit line, modification note, licence and page (`deepSky.image`). The card shows the
  picture with them, and so does the corner of the view for every picture drawn in the view, however small, one
  entry each whatever the readouts setting (the list scrolls when long): in flight where aberration puts it and 1/D
  times its size (`ui/viewport/PictureCredits.tsx`, `apparentCard`). A card seen from the far side shows its picture
  mirrored.
- The 60 famous open clusters and the globulars with a Messier number or a proper name (kind `cluster`), with ids
  clear of the nebulae's (`ngc-3603-cluster`, `westerlund-2-cluster`). Globulars carry their measured M_V as
  `physical.luminous`; open clusters have no light of their own (their stars are the star catalogue's).
- Renderer `layer` (`BodyVisual.renderer`): drawn by a layer of its own, never as a mesh or a point of light.
- Groups in the Bodies list and search: The Milky Way (the Galaxy and Sgr A* with its stars), Star clusters (open,
  globular), Nebulae (where stars are born, shed by dying stars, in the Magellanic Clouds).
- Articles: nebulae made by dying stars go to what-stars-are-made-of, everything else to our-galaxy.

### The sky from the Sun

`scene/MilkyWay.tsx` and `render/shaders/milkyway.glsl`. In the classical view the map is a full-screen pass behind
everything, on a layer of its own that the relativistic cube map and point pass leave out. In the relativistic view
it is part of the remap pass: sampled in the rest-frame direction, and brightened and recoloured with the same
Doppler transform as the surfaces (the Milky Way's integrated light, B−V about 0.7 to 0.8, is close to sunlight in
colour; a blackbody's radiance seen with Doppler factor D is that of a blackbody at D T).

- Only the 2K map is loaded: nothing is drawn finer than its 10.5′ texels (finer, the map resolves the faint stars
  into dots), and it was averaged from the 4K master in linear light, which the GPU's mipmaps of log-encoded values
  would not be. The 4K file is kept as the master. The light of the catalogue's stars too faint to draw as points
  (V 6.5 to 11) is added from `public/textures/faint-stars.png` (section 4).
- The map is filtered with its screen-space derivatives and the hardware's anisotropic filter, which the poles of the
  plate carrée need (there the rows are tiny rings and the texels slivers along the meridians). The footprint is
  taken on the sky (right ascension shrunk by cos Dec) and made no thinner than a quarter of its length, which
  removes the streaks at the poles.
- Display law, the same for every kind of diffuse light (the map, the model's summed light, the nebulae): a patch of
  sky the size of a faint star's image (a Gaussian of σ = 0.5 CSS px) is drawn as bright as a star holding the same
  light, so a surface of V-band brightness S per steradian shows at luminance uStarGain √(S Ω_psf). The Galactic
  Centre's star clouds (20.2 mag/arcsec²) come out about half as bright as a V = 6 star's peak.
- The eye's threshold: the glow fades out between 22 and 24 mag/arcsec² (the darkest skies on Earth are about 22),
  judged over 4 texels (about 0.7°), as the star field fades out at V = 6.5. The galactic poles stay black.
- Handover: the map has weight 1 − w and the model w, with w = smoothstep(100 pc, 500 pc, distance from the Sun),
  blended as pictures (the model's light carried in the layer's alpha: `render/galaxyLayer.ts`). The model is drawn
  only once its share reaches 1 % (within about 124 pc of the Sun it is left out, which changes no pixel by more than
  1/255 at the Pleiades' 0.66 % and saves its whole pass there, 2.5 to 2.9 ms: `docs/data/blackholes.md` §11).
- Near a black hole the map, and the relativistic remap's copy of it, are bent by its lens inside the region where the
  lens moves light by half a pixel or more (`docs/data/blackholes.md` §10), with the pixel's footprint taken from the
  lens's own Jacobian; light from inside the shadow is none.
- Cost on the target laptop (1936 × 1376 px): 2.7 ms a frame as a full-screen pass, of which about 1 ms is the faint
  stars' map. The map and the faint stars' map are each read twice (the pixel's footprint and the eye's), with
  gradients, which this GPU does slowly (four such reads cost 2.1 ms, four plain ones 0.6 ms). In the handover both
  the map and the model are drawn, with every star, and the frame there (9.3 to 10.3 ms with a warm GPU) is over the
  ~8 ms budget. Measured again on 29 September 2026 (2,048 × 1,320 px, medians of batch medians): 480 pc from the Sun
  6.98 ms with the processor 20–40 % busy and 8.7 to 9.0 busier, against 9.2 the evening before; the sky map's own
  pass there costs 1.8 to 2.9 ms for 0.7 % of the sky, and drawing it at half resolution would save 0.6 to 2.1 ms
  anywhere near the Sun (proposed in `docs/data/blackholes.md` §11, not done).

**Fine structure.** The colour comes from the 2K map, no finer than its 10.5′ texels; where a pixel is finer than
that, the 8K map's luminance (`milkyway-detail-8k.jpg`, fetched after the 2K map where the GPU takes an 8K texture)
over the pixel against its luminance over the 2K footprint scales it, so the dust lanes and star clouds are as sharp
as 2.6′ and the picture is unchanged wherever the 2K map was already fine enough (the ratio is then 1). The 8K map's
log luminance is smoothed by a Gaussian of 0.8 pixel first: its single-pixel speckle (faint stars a texel each)
read as grain. 45 MB on the GPU as one channel with its mipmaps; two more texture reads a sky pixel.

### The model

`scene/GalaxyModel.tsx`, `render/shaders/galaxy.vert.glsl`, `render/galaxyLayer.ts`. The particles and the globular
clusters' clumps are Gaussian splats of linear light, drawn into a half-float target at a quarter of the view's
resolution in each direction and added to the view by one pass that applies the display law and the eye's threshold
to their sum. Summing linear light is what makes overlapping splats add up to the right surface brightness (applying
the square-root law splat by splat would make a smooth disc several times too bright).

- Positions are kpc (heliocentric galactic), the camera hi + lo floats.
- Per vertex: the magnitude from L and distance; the dust column in 6 pieces, each with the face-on dust maps and the
  warp map sampled where the piece comes closest to the midplane and integrated exactly through the sech² and
  Gaussian layers (pieces more than 2 kpc from the plane are skipped); reddening A_R : A_G : A_B = 0.89 : 1 : 1.23;
  the aberration and Doppler shift of a point source (the splat's size shrinks by 1/D).
- Fill rate: a splat larger than 8 target px is drawn with probability (8/σ)² and that much brighter, fixed per
  particle (a hash of its index) and eased in and out, which keeps the number of pixels bounded near the camera
  (inside the bulge, or the disc) while keeping the glow's brightness; one larger than 256 px fades out. On an
  integrated GPU the first half of the (shuffled) particles is drawn, each twice as bright (a quarter, four times as
  bright, in the split view, which draws the Galaxy once for each half).
- Every splat over 4 target px (1σ, half the budget) is drawn into a second target at half the resolution, where it
  costs a quarter as much and looks the same. Where such splats crowd the view (the bulge seen from inside the disc,
  the flight to the centre, where the whole sky crowds ahead) this saves up to 3 ms a frame on the target laptop;
  elsewhere the second pass over every particle costs up to 0.8 ms. Each half of the split view draws only its own
  columns, all its splats in one pass, and the glow near the camera into the coarse target on its own, as the whole
  view does (drawn into the finer target with the splats it cost four times as much, about 1 ms a half, and looked
  the same: at most 1/255 apart in 3% of the pixels); the classical half is drawn only in its own columns.
- Near the camera the model's discs (2 to 4 kpc around it) and its young arm stars (1 to 2 kpc) are not points but a
  smooth glow worked out from the model's own laws (`src/sim/galaxy/glow.ts`): a 32-step integration along each
  pixel's line of sight through the discs and the dust maps, the young arm stars' density read from the G channel of
  the warp map, with the particles further out (`glow.test.ts`: the discs within 10% of the particles' light about
  the Sun, the young stars within 25%). The sampling lot of the particles (above) no longer applies to the H II
  regions and the globulars, and the H II regions are always drawn on integrated GPUs.
- The glow near the camera is the costliest thing the layer draws per pixel (32 steps through the discs and the dust
  maps): 0.5 ms a frame in the coarse target. Its shader and the particles' take 270 and 240 ms to compile the first
  time on the target laptop: once start-up's loading is over they are compiled in the background
  (`src/render/precompile.ts`), not on the frame that first draws them.
- The globulars' clumps: a glow of σ = r_h / 1.177 (a projected Gaussian's half-light radius) with 60% of the
  cluster's light, and 48 points from a Plummer sphere of the same half-light radius with the rest (illustrative).
- The worker (`worker.ts`, `galaxyData.ts`) inflates and decodes the particles and clusters and works out the dust
  and warp maps (512 × 512 half floats over ±20 kpc).
- Before its dust each particle is tested against the view's frustum (with a margin of four of its widths and 2 px),
  which changes no pixel and saves 0.27 to 0.46 ms a frame (measured near Sgr A*, the particles filling the view).
- Near Sgr A* the model's nuclear disc and cluster (a few hundred particles on a 2-pc lattice there) hand over to the
  nuclear star cluster's own field of 60,000 stars and a glow, from 1 kpc in and wholly within 30 pc, so that the three
  always add up to the same light (`docs/data/blackholes.md` §6). Near a black hole the layer's two targets (and a
  third holding the glow alone) are resampled through the lens in a box round the hole, and carry mipmaps within 3,000
  M of it (`docs/data/blackholes.md` §10).

**Seen from outside.** From a few kiloparsecs above the disc (`sim/galaxy/faceOn.ts` faceShare: fully from 3 kpc
above the midplane and an elevation of sin 0.4 seen from the centre, none below 1.5 kpc or sin 0.25) the discs and
the young arm stars and the long bar are drawn from face-on maps instead of their particles, which blur the structure over their
8th neighbours: `shaders/galaxyFace.frag.glsl`, a quad into the fine target that finds where each pixel's line of
sight crosses the midplane. The thin and thick discs are their laws (as the glow near the camera); the young arm
stars' map is 8 million of the model's own young arm stars, 160 times the app's, each spread over its 8th neighbours
(so their clumps show, at 9.8 pc a texel), and the bar's 2.2 million of its stars the same way; the dust is the model's, A_V face-on. The column is S / μ through the
disc (μ = |cos i|), the discs half in front of the dust layer and half behind ((1 + e^−τ) / 2 gets out), the young
stars mixed with it ((1 − e^−τ) / τ), reddened as the particles are. Their particles and the glow near the camera
hold 1 − that share (`uFaceShare`), so the light is the same; not drawn in flight or near a black hole (no Doppler
shift, and the lens resamples the layer as it is). The layer is drawn at full resolution there and among
the galaxies beyond 40 kpc from the centre, at a quarter inside the Galaxy
(`layerResolution`, with a margin so it does not flip). The outer disc is brighter than its particles drew it:
their sparse splats each fell below the threshold of the eye there.

### Clusters and nebulae

- The famous open clusters get a thin ring of their r50 while labels show.
- Nebulae (`scene/Nebulae.tsx`, `sim/galaxy/cards.ts`): a card of 9 × 9 vertices at the picture's centre, facing the
  Sun, image-up `northAngleDeg` clockwise from north as seen from the Sun and east to the left, aberrated vertex by
  vertex in flight. The brightest part of every picture is drawn as 19.5 mag/arcsec² with the display law (the
  pictures are photographs, stretched for display: their brightness is not calibrated, and the cards say so). A card
  fades when seen edge-on. Pictures load when their card is 3 px wide and are released after 8 s out of sight.

### Where you are

`src/ui/location.ts` and `src/sim/galaxy/arms.ts`: Milky Way › arm › Solar neighbourhood › …, with the arm named
where the place is within two Gaussian widths of a Reid et al. ridge, within 400 pc of the midplane, and on the stretch
the parallaxes trace or that reaches to the fit's fourth-quadrant tangency priors (the Carina part of the
Sagittarius–Carina Arm, whose tangent is at l = 285.8° in the model). The Sun is in the Orion Arm (1.2 widths inside
its ridge); the Orion and North America nebulae are too, Carina and the Eagle in the Sagittarius–Carina Arm, the Crab
in the Perseus Arm. Objects in the Magellanic Clouds name their galaxy instead. On narrow screens the footer leaves
the Galaxy's levels out.

### Flights

Inside the Galaxy flights are special relativity in static space; the intercept solver gives up beyond ten million
years. At 1 g Sgr A* takes 19.8 years aboard and 27,000 years at home. A flight to a nebula or a star cluster goes all
the way in, to its closest approach (it has no surface to stop short of), and the view then pulls back to frame it
(`controls/framing.ts` `flightStandoff`).
