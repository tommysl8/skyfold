# Dark matter

Where the mass is, in a universe whose light shows only a sixth of it. View › Dark matter (off by default, not saved)
draws three things, none of them light: dark matter gives out none, so each is a diagnostic picture of where the mass
is, added faintly over the view at a fixed display level.

1. The Milky Way's dark halo, as a faint blue fog of its projected density, seen from outside the Galaxy.
2. Tracer stars that go round the Galaxy at the circular speed of its whole mass, beside tracers going round at the
   speed its stars and gas alone would give: the rotation curve, shown.
3. The Bullet Cluster's hot gas (Chandra's X-ray picture) and its lensing mass (a model of Clowe et al.'s map), at the
   cluster.

| Path | What it is |
| --- | --- |
| `src/sim/galaxy/darkMatter.ts` | McMillan's (2017) mass model: the halo, the bulge and the discs; the rotation curve with and without the halo; Eilers et al.'s (2019) measured curve; the tracers |
| `src/sim/cosmos/bulletCluster.ts` | Clowe et al.'s (2006) places of the galaxies, gas and mass; the lensing-mass model; where the X-ray picture lies |
| `src/sim/galaxy/darkLayer.ts` | What shows, decided once a frame from the switch and the camera; the card's text; the colours |
| `src/scene/DarkMatter.tsx`, `src/render/darkMatterMaterials.ts` | The layer itself: a chunk of its own, fetched the first time the switch is on |
| `src/ui/viewport/DarkMatterChart.tsx` | The card's chart of the rotation curve (a chunk of its own) |
| `public/images/dark-matter/bullet-xray.jpg` | Chandra's X-ray picture of the Bullet Cluster, 540 × 437, 99 KB, unmodified |
| `src/sim/galaxy/darkMatter.test.ts`, `src/sim/cosmos/bulletCluster.test.ts` | The checks below |

## 1. The Milky Way's mass model

**Choice.** McMillan 2017 (MNRAS 465, 76; doi:10.1093/mnras/stw2759), his best-fitting model (Table 3). It is a full
mass model, stars and gas as well as the halo, so the speed the visible mass alone would give comes from the same
fit, and it is the one most used for orbits in the Galaxy (his GalPot). Its parts:

| Part | Law | Parameters |
| --- | --- | --- |
| Bulge | ρ0 / (1 + r′/r0)^α exp(−(r′/r_cut)²), r′ = √(R² + (z/q)²) | ρ0 = 98.4 M☉/pc³, r0 = 0.075 kpc, r_cut = 2.1 kpc, α = 1.8, q = 0.5 |
| Thin disc | Σ0/(2z_d) exp(−\|z\|/z_d − R/R_d) | Σ0 = 896 M☉/pc², R_d = 2.50 kpc, z_d = 0.3 kpc |
| Thick disc | the same | Σ0 = 183 M☉/pc², R_d = 3.02 kpc, z_d = 0.9 kpc |
| H I disc | Σ0/(4z_d) exp(−R_m/R − R/R_d) sech²(z/2z_d) | Σ0 = 53.1 M☉/pc², R_d = 7 kpc, R_m = 4 kpc, z_d = 85 pc |
| H2 disc | the same | Σ0 = 2180 M☉/pc², R_d = 1.5 kpc, R_m = 12 kpc, z_d = 45 pc |
| Dark halo (NFW) | ρ0 / (x (1 + x)²), x = r/r_h | ρ0 = 0.00854 M☉/pc³, r_h = 19.6 kpc |

He puts the Sun at R0 = 8.21 kpc with v0 = 233.1 km/s and 0.0101 M☉/pc³ (0.38 GeV/cm³) of dark matter round it, and
gives a virial mass (inside the sphere of 200 times the critical density, H = 70.4 km/s/Mpc) of 1.37 × 10¹² M☉.

**How the curve is worked out.** v_c² = R ∂Φ/∂R in the plane, summed over the parts (Φ is linear in the density). The
halo's from its enclosed mass, 4πρ0 r_h³ [ln(1 + x) − x/(1 + x)]; the flattened bulge's from the oblate-spheroid
formula v² = 4πG q ∫₀^R ρ(m) m² dm / √(R² − m² e²) (Binney & Tremaine 2008, eq. 2.132); each disc's from rings (50 pc
wide within 20 kpc, 200 pc to 80 kpc), the exact in-plane force of a ring from the complete elliptic integrals K and E,
its mass spread over the disc's thickness at three Gauss–Laguerre heights and softened by the ring's own width. It is
tabulated at 56 radii from 0.05 to 300 kpc (about 20 ms, once, when the layer's chunk or its chart first wants it).
Beyond 60 kpc the discs act as a point.

**What comes out** (the tests check each):

| Quantity | This model | Paper |
| --- | --- | --- |
| v_c at 8.21 kpc | 233.1 km/s | 233.1 km/s (Table 3) |
| ρ_DM at 8.21 kpc | 0.0101 M☉/pc³ | 0.0101 |
| Bulge mass | 8.88 × 10⁹ M☉ | 8.9 × 10⁹ for ρ0 = 99.3 (section 2.1), so 8.82 × 10⁹ for 98.4 |
| Stars (bulge and discs) | 5.4 × 10¹⁰ M☉ | 5.43 × 10¹⁰ |
| H I, H2 | 1.1 × 10¹⁰, 1.2 × 10⁹ M☉ | the same (Table 1) |
| r_200, and the mass within it | 224 kpc; 1.29 × 10¹² (halo) + 0.066 × 10¹² (stars and gas) | M_v = 1.37 × 10¹² |
| Dark share within 200 kpc / 50 kpc | 95 % / 87 % | |
| v_c at 25 kpc: whole model, stars and gas alone | 220 km/s, 111 km/s | |

A razor-thin exponential disc computed the same way gives Freeman's curve (y²[I0K0 − I1K1]) to 1–2 % in v² (the
rings' softening; a disc of real thickness hides it).

**Against the measurements.** Eilers, Hogg, Rix & Ness 2019 (ApJ 871, 120; doi:10.3847/1538-4357/aaf648) measured
the circular speed from 5 to 25 kpc from 23,000 red giants with APOGEE spectra and Gaia DR2: 229.0 ± 0.2 km/s at their
R0 = 8.122 kpc, falling by 1.7 km/s per kpc, with systematic errors of 2–5 % out to 20 kpc. Their 38 points (Table 1)
are in `EILERS_2019` and on the card's chart. The model is within 3 % of them to 13 kpc and within 6.5 % to 18 kpc;
from 19 to 25 kpc the measured curve falls faster, 8 to 14 % below the model's. McMillan's fit predates Gaia DR2.

**The spread.** How heavy the halo is, is not settled. Ou, Eilers, Necib & Frebel 2024 (MNRAS 528, 693;
doi:10.1093/mnras/stae034), with Gaia DR3 and APOGEE DR17 out to 30 kpc, find a curve falling off beyond 20 kpc that a
cored Einasto halo of only 1.8 × 10¹¹ M☉ fits better than an NFW one; Jiao et al. 2023 find a Keplerian decline and
about 2 × 10¹¹ M☉ in all; Watkins et al. 2019, from the motions of distant globular clusters, about
1.5 × 10¹² (1.1 to 2.3). The card, the Milky Way's data sheet and the scenes say so, and that the halo drawn is one
model's.

## 2. The halo, drawn

A sphere of r_200 = 224 kpc about Sgr A* (frame G's origin), drawn from inside or out (its back faces), each pixel the
halo's column density along its ray from the camera to the sphere's edge. With r = b cosh u along a ray passing b from
the centre, ρ ds = ρ0 r_h du / (1 + x)², a smooth function of u, so a few dozen Simpson steps in u integrate it to
well under 0.1 % (`haloColumn`, 48 steps; the test checks it against a brute-force sum). The halo is spherical, so the column along a ray depends only on the ray's angle θ from the direction of the
centre: the CPU works it out at 256 angles (spaced in √sin(θ/2), to resolve the cusp) whenever the camera's distance
from the centre changes by 0.2 % (about 0.1 ms), into a half-float texture each pixel reads. It is shown on a logarithmic scale,
ln(1 + Σ/Σ0) / ln(61) with Σ0 = 10 M☉/pc² (the column about 100 kpc from the centre) and 600 M☉/pc² (1 kpc from it) at
full scale, in a cool blue at a fixed, faint level, with a little dither against banding. It is not light and follows
no photometric law. The halo is drawn spherical and smooth: its shape is not well measured, and the subhaloes and
streams it holds are not drawn.

It shows with the switch on and the camera beyond 10–25 kpc of the Galaxy's centre (it fades in there: from inside
the disc it would be a haze over the whole sky), and goes between 1.5 and 5 Mpc, where the whole halo is a few pixels.

## 3. The rotation, shown

Four spokes of tracers through the Galaxy's centre, one every kpc from 2 to 30 kpc, in the midplane (the warp left
out), starting towards the Sun and at right angles. Each spoke is drawn twice: gold, each tracer going round at the
model's circular speed v_c(R)/R (the speed the measured curve has, within the differences above), and pale grey-blue,
each going round at the speed the stars and gas alone would give. The spokes wind into trailing spirals as the inner
tracers lap the outer ones; the grey ones fall behind further out, where the halo's pull is most of the total.
Neighbours on a spoke are joined by a faint line while they are within 0.35 rad of each other in azimuth, so the
inner, fast-winding parts become dots rather than a tangle.

They are not stars of the catalogue or of the Galaxy model: they stand for stars on circular orbits in the model.
Time turns them: home's clock from when they last lay on the spokes (J2000, or the start of the scene), and, in the
rotation scene, a clock of their own at 30 Myr a second. The scene does not run home's clock that fast: hundreds of
millions of years on, the Magellanic Clouds and the other galaxies of the Local Group, which move, would have flown
through the view. The tracers show with the switch on and the camera between 10–25 and 150–250 kpc of the centre.
The model's R0 is McMillan's 8.21 kpc; the app's Sun is at 8.277 kpc (GRAVITY 2022): 0.8 % apart, below what the
picture shows.

The card's chart (`DarkMatterChart.tsx`, the app's figure style) plots both curves from 0 to 30 kpc and Eilers et al.'s
points.

## 4. The Bullet Cluster

**The numbers.** Clowe et al. 2006 (ApJ 648, L109; doi:10.1086/508162), Table 2: the main cluster's and the
subcluster's brightest galaxies (BCGs) and the peaks of their X-ray gas, with the mean convergence κ (the surface
density over the critical density) in 100 kpc about each, after the other peak's share is taken off: 0.36 and 0.20 at
the BCGs, 0.05 and 0.02 at the gas peaks. Section 3: the main cluster's κ peak lies 2.5″ east and 11.5″ south of its
(northern) BCG, the subcluster's 7.1″ east and 6.5″ north of its BCG; both are 8σ from the centres of their gas.
Places are offsets east and north of the cluster's catalogued place (named.json, SIMBAD: 104.612°, −55.9725°), turned
into kpc with the angular-diameter distance of z = 0.296 in Planck 2018, 940.7 Mpc (4.561 kpc per arcsecond; Clowe et
al.'s cosmology gives 4.413). The BCGs are 0.74 Mpc apart. The catalogued place lies about 1.5′ south of the BCGs, so
the cluster's galaxies are now drawn about the BCGs (the cosmos `cluster` template's two groups, which were on a line
through the catalogued place; a test keeps the template and these places together).

**The mass.** The lensing map itself (the paper's figure, and the blue of NASA's composites, credited to Clowe et al.
with Magellan, ESO and STScI data) is not openly licensed, so the mass is drawn as a smooth two-peak model of it: each
peak κ = A / √(1 + (r/r_c)²), r_c = 13″ (about 60 kpc, of the order of the map's smoothing; a model choice), its A set
so that the mean κ in the paper's 100 kpc aperture about its BCG is the paper's (A = 0.59 and 0.32). The paper's
contours are drawn on it: κ = 0.16, then every 0.07. The gas's own share of κ (about a tenth) is left out.

**The gas.** Chandra's X-ray picture (NASA/CXC/CfA/M. Markevitch et al., 2006; the 540 × 437 JPEG of the photo
album's "Chandra X-ray Image", unmodified). Chandra's policy: "no claim to copyright is being asserted", with the
credit requested. The composites with the lensing map are not used. The picture is north up and east left. It is placed
by its two gas peaks: the centroids of its brightest (saturated) pixels, measured once in the image at (253.0, 197.0)
and (338.3, 201.6) px, set on Table 2's gas peaks. Their east–west separation gives the scale, 0.886″ a pixel (the
picture is 8.0′ × 6.5′), and their mean the centre. The bullet's brightest pixels then lie 10″ south of the paper's
aperture centre, which is the cloud's centre of mass, not its brightest point. Its brightness is drawn as a pink
added to the view, the mass as blue: the colours of NASA's composites.

The card lies in the plane of the sky at the cluster, so it is right from our side and a flat card from elsewhere, as
the nebulae's pictures are. It shows with the switch on once the cluster is 8 to 30 px across, so from Earth it is
never there.

## 5. Cost

Nothing until the switch is first on: the chunk (the layer, its materials and the mass model) is fetched then, and the
X-ray picture when the cluster is near. With the switch off, `updateDarkLayer` returns at once and no mesh is visible.

With it on, measured with `window.__ls.perf.measure(8, 2)` (`gpuMed`, ms), alternating three times between the switch
on and off in the same view, on the development machine's GPU (an integrated one, shared with other work while
measured, so single readings scatter by a millisecond or more), at 1600 × 900 CSS px and a pixel ratio of 2
(3200 × 1584):

| View | Off (median of 3) | On (median of 3) | Difference |
| --- | --- | --- | --- |
| The halo scene (300 kpc out: the sphere covers the whole view) | 25.95 | 25.41 | none measurable (under 1 ms) |
| The rotation scene (100 kpc out: the halo and the tracers) | 16.55 | 16.82 | +0.3 (under the scatter) |
| The Bullet Cluster scene (the card about a third of the view) | 18.03 | 18.34 | +0.3 (under the scatter) |

A first version integrated the column in every pixel (16 Simpson steps, about 150 operations a pixel): +6 to 7 ms in
the halo's view at this size. The halo is spherical, so the column depends only on a ray's angle from the centre, and
the table in §2 makes it a dozen operations and one fetch a pixel. The tracers are 232 points and 232 line segments,
placed on the CPU each frame (464 sines and cosines); the card is one quad, a texture fetch and two square roots a
pixel.

## 6. Scenes, journeys, cards

- Scenes (`content/scenes.ts`): `milky-way-dark-halo` (300 kpc out, tipped 35° from the pole), `galaxy-rotation`
  (100 kpc above the north pole, the tracers' clock at 30 Myr a second), `bullet-cluster-mass` (2.2 Mpc out on our
  side). Each turns the switch on; the next scene turns it off again if the visitor has not touched it (SCENE_VIEWS).
- Journeys: "How the Galaxy turns" and "Where the mass is: the Bullet Cluster".
- Where to?: "The Milky Way's dark halo" (dark matter, dark halo), "How the Galaxy turns" (rotation curve), "Where the
  mass is: the Bullet Cluster".
- Learn: Our galaxy's "The weight of what we cannot see" opens the halo and rotation scenes; Island universes'
  Bullet Cluster section opens its scene.
- Cards: the Milky Way's facts and data sheet (its mass within 200 kpc, with the spread), and a model note; the Bullet
  Cluster's model notes. The layer's own card (top left) says what shows, with the chart, its sources and Hide.

## 7. Limits

- One mass model. Its halo is spherical, smooth and NFW; the real halo's shape, its subhaloes, the Large Magellanic
  Cloud's own halo (perhaps 1.4 × 10¹¹ M☉; Erkal et al. 2019) and the disturbance it causes are not drawn. Its mass is uncertain by a factor of
  several (§1).
- The model's rotation curve is flatter than the measured one beyond 18 kpc (§1).
- The tracers are on circular orbits in the midplane of an axisymmetric model: no bar, arms, warp or random motions.
- The Bullet Cluster's mass is a two-peak model fitted to four published numbers and two published offsets, not the
  map; the gas picture is a press image, its brightness a display, not a calibrated flux.
- The card is flat on the sky.
