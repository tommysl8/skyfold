# Magnetic field lines: the Sun and the planets

View › Magnetic field lines (off by default) draws the magnetic fields of the Sun, Mercury, Earth, Jupiter, Saturn,
Uranus, Neptune and Ganymede, each from a published model of measurements. Code: `src/sim/fields/` (pure: the
harmonics, the tracer, the models, the magnetopauses, the Sun's map, the line sets; tests in `fields.test.ts`),
`src/sim/fields/worker.ts` (the tracing, off the main thread), `src/scene/FieldLines.tsx` and
`src/render/fieldLineMaterials.ts` (the drawing, a chunk of its own), `scripts/build-sun-field.py` (the Sun's data).
The Milky Way's field is a separate layer, written up with the Galaxy.

Nothing of it is downloaded until the view is turned on; while it is off, nothing draws. Once on, a body's lines are
traced (in the worker, a fraction of a second) the first time the body is near enough to show them.

## 1. The field from its coefficients

Every model gives Schmidt semi-normalised Gauss coefficients g_n^m, h_n^m in the body's own frame. Inside the
current-free space round a planet the field is B = −∇V with

  V = a Σ_n (a/r)^(n+1) Σ_m (g_n^m cos mφ + h_n^m sin mφ) P_n^m(cos θ),

a the model's reference radius, θ the colatitude, φ the east longitude (counterclockwise about the model's north) and
P_n^m the Schmidt semi-normalised associated Legendre functions, made by the same recursion as the IGRF's own code
(`harmonics.ts`). For the Sun (§3) the coefficients describe the radial field at the photosphere and the field is
the potential field to a source surface.

**Tracing** (`trace.ts`): dx/ds = ±B/|B| by the classical fourth-order Runge–Kutta step, its length set by step
doubling (each step taken whole and as two halves; the difference over 15 is the error, held near 2 × 10⁻⁵ of the
distance from the centre, the step capped at 8 % of it). A line starts a hair above the surface, along the field if
the field leaves there and against it if it enters, and stops on the surface (an oblate spheroid of the body's
polar flattening; the last step is cut back to it), on an outer sphere (the source surface, or a drawing limit), or
after a maximum length. Tested on a pure dipole: the traced line keeps to r = L cos²λ within 10⁻³ and lands on the
other foot.

**Summary numbers** for the cards (`index.ts`, checked against the models in the tests): the centred dipole's field
at the equator B₀ = √(g₁⁰² + g₁¹² + h₁¹²), its tilt acos(|g₁⁰| / B₀), and the offset of the eccentric dipole
(Schmidt 1934, as Fraser-Smith 1987 writes it) from the dipole and quadrupole terms.

## 2. The planets

| Body | Model | Degree | Reference radius | Frame | Dipole: B₀, tilt, offset |
| --- | --- | --- | --- | --- | --- |
| Mercury | MESSENGER offset dipole (Anderson et al. 2012, JGR 117, E00L12) | zonal, 4 | 2,440 km | IAU | 190 nT, 0° (measured under 0.8°), 479 km north |
| Earth | IGRF-14 (IAGA; Beggan et al. 2026), at the date | 13 (10 before 2000) | 6,371.2 km | geographic | 29,734 nT, 9.2°, 605 km (2025) |
| Jupiter | JRM33 (Connerney et al. 2022, JGR Planets 127, e2021JE007055) | 13 | 71,492 km | System III (1965) | 4.177 G, 10.25°, 7,800 km |
| Saturn | Cassini 11+ (Cao et al. 2020, Icarus 344, 113541, table 5) | zonal, 14 | 60,268 km | — | 21,141 nT, 0° (under 0.007°), 2,260 km north |
| Uranus | AH5 (Herbert 2009, JGR 114, A11206) | 4 | 25,559 km | ULS | 22,454 nT, 59.9°, 10,000 km |
| Neptune | O8 (Connerney, Acuña & Ness 1991, JGR 96, 19023) | 3 | 24,765 km | NLS | 14,243 nT, 46.9°, 12,000 km |
| Ganymede | permanent dipole (Kivelson, Khurana & Volwerk 2002, Icarus 157, 507) | 1 | 2,631 km | IAU | 719 nT, 4° (axis 176° from the spin axis) |

- **Coefficients** are the papers' own, quoted in `models.ts` with their citations: JRM33's from the paper's
  supporting file (SI-S02) as the community code of Wilson et al. (PSH, doi:10.5281/zenodo.6814109) lists them, to
  degree 13 as recommended there with the authors; Cassini 11+ from Cao et al.'s table 5; AH5 and O8 from their papers'
  tables (in nT; O8's in gauss in the paper); Mercury's zonal terms g₁⁰ = −190, g₂⁰ = −74.6, g₃⁰ = −22.0,
  g₄⁰ = −5.7 nT are the dipole 479 km north written as zonal terms (g_n⁰ = n (d/R)^(n−1) g₁⁰); Ganymede's dipole is
  built from the numbers of Kivelson et al.'s abstract (719 nT at the equator, the axis 176° from the spin axis, its
  southern end turned 24° from the sub-Jovian meridian towards the trailing side). Ganymede's field induced by
  Jupiter's changing field, which Kivelson et al. prefer as part of the fit, is left out.
- **Earth** (`earth.ts`, `igrf14.ts`): IGRF-14's coefficients from NOAA NCEI's file igrf14coeffs.txt, degree 2–13 in
  `igrf14.ts` and the dipole terms in `sim/phenomena/aurora.ts` (the aurora's table, extended rather than copied);
  linear between the 5-year epochs, the secular variation after 2025, held at 1900 before and at 2030 after. The
  lines are traced again for each half year of the date.
- **Frames.** Each model's frame is turned into the app's body-fixed frame (x the prime meridian, y the north pole,
  −z 90° E: `sim/bodies/rotation.ts`), so the field turns with the planet as the app turns it (IAU rotation models via
  Astronomy Engine): Earth by Greenwich, Jupiter by System III (the IAU's), Saturn's field is axisymmetric. Uranus's
  AH5 is in the Uranian Longitude System of Ness et al. 1986: right-handed, its z along the spin (the IAU's south
  pole), placed in the IAU frame as NAIF's frame kernel `vg2_uls_v01.tf` does (180° about x, then −226.46° about z;
  the sub-Voyager IAU longitude 168.46° is ULS 302° W on 24 January 1986, Lamy et al. 2017). Neptune's O8 is in the
  longitude system of Voyager 2's radio period, taken here as the IAU's. **Uranus's and Neptune's longitudes rest on
  Voyager's periods (17.24 ± 0.01 h, 16.11 h), uncertain by about 100° a year since: the shape of each field is
  measured, how it is turned on a date today is not** (Lamy et al. 2025 measured a new period for Uranus,
  17.247864 h; not used here). Ganymede is turned as the app turns it, its sub-Jovian meridian towards Jupiter.

**Footpoints** (`lines.ts`): rings about the centred dipole at the latitudes of dipole shells L = 1.15 … 2.2
stand-offs (λ = acos √(1/L), eight rings even in log L) and two rings nearer the pole, 10 longitudes each (alternate
rings turned half a step), in both hemispheres. A closed line is kept from its outward foot only. 160 lines a planet,
15,000–22,000 vertices.

## 3. The Sun

**Data.** For every Carrington rotation from CR 2097 (from 19 May 2010) to CR 2315 (from 29 August 2026), the
spherical-harmonic coefficients (degrees 1–15, gauss) of the photosphere's radial field, computed by
`scripts/build-sun-field.py` from the 0.5° synoptic maps of the radial field of the Helioseismic and Magnetic Imager
on NASA's Solar Dynamics Observatory (`hmi.Synoptic_Mr_small.<CR>.fits`, JSOC; for CR 2119–2127, which have no small
map, the 0.1° `hmi.Synoptic_Mr`), 219 rotations, 120 kB (`public/data/fields/sun-hmi-pfss.bin`; format in the script).
The maps are equal-area, so each coefficient is a sum over pixels; the monopole (net flux) is dropped; empty pixels (a
pole turned away, gaps) are filled with their row's mean, a simpler polar fill than HMI's own polar-field product.
The quadrature returns its own coefficients to 0.1–0.3 % (the build log, `docs/data/sun-field-build-log.txt`). As a
check (not shipped), the degree ≤ 5 coefficients correlate with the Wilcox Solar Observatory's own for the same
rotations at r = 0.96–0.99 for the three checked, CR 2150, 2200 and 2300 (WSO's are about 40 times smaller in their units, as its magnetograph reads weaker fields).

**Why not WSO's coefficients.** The task asked for the Wilcox Solar Observatory's PFSS coefficients. Its data policy
(wso.stanford.edu/DataPolicy.html) asks users to notify the observatory, acknowledge it and send copies of papers, and
says nothing of redistribution, so their reuse in a public app is unclear; they are not shipped. SDO's data are NASA's
and free to use with credit, so the coefficients were computed from HMI's maps instead (the same method, the same
2.5-radius source surface). The cost: coverage from 2010 rather than 1976.

**The rotation of the date** (`sun.ts`): the one under way; before May 2010 the first map is drawn and after the last
rotation's end (25 September 2026) the latest, and the Sun's card and scene say so.

**Frame.** Carrington longitude is the app's east longitude of the Sun: the app turns the Sun by the IAU's model
(W = 84.176° + 14.1844° a day, the Carrington rotation), and the tests check that at each rotation's start the
sub-Earth point is at Carrington longitude 0 (within 1°).

**The model.** The potential field to a source surface (Altschuler & Newkirk 1969; Schatten, Wilcox & Ness 1969), in
the radial form the Wilcox Solar Observatory uses (Zhao & Hoeksema 1993):
B_r = Σ P (g cos mφ + h sin mφ) [(n+1) r^−(n+2) + n c_n r^(n−1)] / [n+1 + n c_n], c_n = R_ss^−(2n+1), R_ss = 2.5 R☉;
the field is current-free between the photosphere and the source surface and radial on it (tested: no divergence, no
curl, B_r at r = 1 as the coefficients say, B_θ = B_φ = 0 at R_ss).

**Lines** (`lines.ts sunLines`): 340 footpoints drawn by |B_r| on the photosphere (plus a floor of a fifth of the
mean, so the quiet Sun and the polar holes have lines), traced to the surface (closed loops, kept from their outward
feet) or to the source surface (open). Each open line goes on as a Parker spiral (Parker 1958) for a 400 km/s wind:
at fixed latitude, its longitude in the Sun's turning frame falls by Ω (r − R_ss) / v (Ω the Carrington rate), out to
3 au; 47° from the radial at 1 au. The heliospheric current sheet: spirals from points of the source surface's
neutral line (B_r = 0, found by marching over a 2° grid, points 10° apart), drawn white. The spiral pattern turns
rigidly with the Sun, as a steady wind's does.

## 4. Where the lines are cut: magnetopauses

Each planet's lines are cut where they leave a published magnetopause for a typical solar wind (dynamic pressure 2 nPa
at 1 au, falling as 1/r², no southward field), the boundary's nose towards the Sun (`magnetopause.ts`), and beyond
twice the stand-off anywhere (the drawing limit on the night side). Where a closed line is cut, both its ends are
drawn up to the cut, as open lines.

| Body | Shape | Stand-off |
| --- | --- | --- |
| Mercury | Shue's form fitted to MESSENGER (Winslow et al. 2013): r₀ = 1.45 R_M, α = 0.5, centred on the offset dipole | 1.45 R_M |
| Earth | Shue et al. 1998 at 2 nPa, B_z = 0 | 10.25 R_E, α = 0.59 |
| Jupiter | Joy et al. 2002's surface (z² = A + Bx + Cx² + Dy + Ey² + Fxy, units of 120 R_J; dawn–dusk asymmetric, flattened at the poles) at 0.074 nPa | 83 R_J (its two modes, 63 and 92 R_J, at 0.31 and 0.04 nPa: tested) |
| Saturn | Arridge et al. 2006 (as Achilleos et al. 2008 quote it): r₀ = 9.7 P^(−1/4.3), α = 0.77 − 1.5 P, at 0.022 nPa | 23.6 R_S |
| Uranus, Neptune | Shue's form, α = 0.5, stand-off of pressure balance r₀ ∝ (B₀²/P)^(1/6) scaled to Earth's Shue stand-off | 25 R_U, 25 R_N (Voyager 2 found 18 and 26) |
| Ganymede | Shue's form, α = 0.5, about 2 R_G upstream (Kivelson et al. 1998), the nose towards the plasma flowing past (its trailing side) | 2 R_G |

The cut is redone whenever the Sun's direction in the planet's frame moves by 0.3° (a pass over the vertices, about
0.1–0.3 ms; Joy's surface is polynomial, Shue's read from a table in cos θ).

**Not modelled** (said on the cards): the field of the currents outside each planet — on the magnetopause, in the
ring current, in Jupiter's and Saturn's plasma discs, in the tail — so the dayside field is not compressed and the
night side is not stretched into the long tail it really has; the boundary's response to the actual solar wind of the
date; Ganymede's induced field and its link to Jupiter's; time-varying fields within a solar rotation.

## 5. How they are drawn

One draw of line segments per body (`render/fieldLineMaterials.ts`), in the body's frame, scaled to its reference
radius, added light with no depth writes, on the guides layer (left out of the relativistic view, as the orbit lines
are). Lines where the field leaves the body are warm (#ff8a4c), where it enters cool (#4f9dff); closed loops pale,
shading from the outward foot to the inward; the current sheet white and dim. Pulses run along each line in the
field's direction, spaced in proportion to the distance from the centre (each vertex carries ∫ ds / r). A planet's
lines show once its magnetopause's stand-off is 10 px across and are full at 40; the Sun's loops once the Sun is 2 px
across, its spirals while 3 au is 20 px or more across, from within 0.3 au of the Sun (drawn to three times the
camera's distance) or from 4 to 60 au (among the inner planets their lines would only cross the view).

## 6. Cost

Off: nothing. On: the chunk (`FieldLines`, with the models' coefficients and the IGRF table) and the worker, fetched
once; the Sun's 120 kB file once it is near; tracing in the worker (Jupiter about 0.5 s, the Sun about 0.25 s). Per
frame: a few uniforms per body shown, and the magnetopause cut when the Sun's direction has moved. GPU time measured
with `window.__ls.perf.measure(10, 3)`, on and off, on the development machine (§ below).

GPU_TABLE

## 7. Checks (fields.test.ts)

- The Schmidt functions against their closed forms, their derivatives, and their normalisation over the sphere.
- JRM33 against the five published values of the community code's README (to 10⁻⁵ nT); its dipole 4.177 G, 10.25°.
- IGRF-14 against the British Geological Survey's calculator at six places and dates from 1965 to 2027.5, 0–100 km up
  (X, Y, Z within 1.5 nT, the calculator rounding to 1 nT); its dip poles against NOAA NCEI's for 2000 and 2015
  (within 0.2°); its dipole terms against the aurora's table, the interpolation, the secular variation and the holding.
- Mercury's offset 479 km; Saturn's axisymmetry; Neptune's 46.9° tilt and half-radius offset; Uranus's offset dipole
  meeting the surface within 3° of the poles Lamy et al. 2017 give (+15.2°, −44.2°); NAIF's ULS frame; Ganymede's
  dipole; the card facts against the models.
- The potential field: B_r at the photosphere, radial at the source surface, divergence- and curl-free.
- The tracer on a dipole; the magnetopause stand-offs (Shue 10.25 R_E at 2 nPa; Joy's 63 and 92 R_J; Arridge's
  flaring 0.74 at 0.02 nPa); the inside test.
- The Sun's file: 219 consecutive rotations, CR 2300's start and dipole as the build log gives them; the rotation of a
  date and the holding; Carrington longitude 0 facing Earth at each rotation's start; loops ending on the surface,
  spirals ending at 3 au, the current sheet; the spiral's 47° at 1 au.

## Sources and licences

| Data | Source | Licence |
| --- | --- | --- |
| IGRF-14 coefficients (`src/sim/fields/igrf14.ts`, `sim/phenomena/aurora.ts`) | IAGA V-MOD via NOAA NCEI, igrf14coeffs.txt | Free to use, with citation |
| JRM33, Cassini 11+, AH5, O8, Mercury, Ganymede (`src/sim/fields/models.ts`) | Connerney et al. 2022; Cao et al. 2020; Herbert 2009; Connerney, Acuña & Ness 1991; Anderson et al. 2012; Kivelson et al. 2002 | Numbers quoted from papers with citation |
| Uranus's longitude system | NAIF frame kernel vg2_uls_v01.tf (NASA/JPL); Lamy et al. 2017 | NASA, public |
| Magnetopauses | Shue et al. 1998; Joy et al. 2002; Arridge et al. 2006 (via Achilleos et al. 2008); Winslow et al. 2013; Kivelson et al. 1998 | Quoted with citation |
| The Sun's harmonics (`public/data/fields/sun-hmi-pfss.bin`) | Computed from SDO/HMI synoptic maps (JSOC, Stanford), "Courtesy of NASA/SDO and the HMI science team" | NASA data, free to use with that credit; the file and script MIT |
| Check values in the tests | BGS IGRF-14 web service; NOAA NCEI pole files; Wilson et al.'s PSH README | Quoted |
