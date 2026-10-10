# Space weather: coronal mass ejections, their hit on Earth, and the measured Kp

Real coronal mass ejections (CMEs) fly out from the Sun on the date as faint fronts (View › Solar eruptions, on by
default), in their measured directions, speeds and widths, slowed by the solar wind as the drag-based model has it.
When one reaches Earth its sheath presses the magnetopause in (drawn with View › Magnetic field lines), and the
aurora follows the Kp index measured at the date (View › Aurora › Auto, the default). Code: `src/sim/spaceWeather/`
(pure, with `spaceWeather.test.ts`), `src/scene/SpaceWeather.tsx` and `src/render/spaceWeatherMaterials.ts` (a chunk
of their own), `scripts/build-space-weather.mjs` (the data); the latest build's numbers are in
`space-weather-build-log.txt`.

## 1. What is shown

- **The fronts.** Each CME in flight on the date, from the moment it leaves the Sun until its apex is 3 au out
  (fading from 1.8 au), as a soft cap: four nested layers a per cent apart, brightest where seen edge-on (a thin
  shell's line of sight is longest there), fainter as it spreads, faded towards the cone's edge and where the camera is
  near it for its size (closer than about a quarter of its distance from the Sun: from close by, a real sheath some
  0.1 au thick would surround the camera, and at a planet's scale it would only be a wall across the view). At most
  eight are drawn, the largest on the screen. They are guides, drawn in the classical view: a real CME is seen only in
  coronagraphs and heliospheric imagers, by sunlight scattered off its electrons, millions of times fainter.
- **A card for each front in view** (the layer cards, top left; up to two, those heading for Earth first): when and
  where it left the Sun (DONKI's source and NOAA active region), its speed and width, when its shock reached Earth and
  the largest Kp in the two days after, and under More how the model was fitted and how far the typical model was
  off. Sources link to the CME's DONKI page.
- **The hit.** Earth's magnetopause (sim/fields/magnetopause.ts, Shue et al. 1998) moves with the estimated pressure
  of the sheath passing Earth; Earth's field lines are cut again whenever it moves by half a per cent.
- **The aurora.** Kp "Auto (measured)" (the new default) draws the ovals for GFZ's Kp at the date, eased across each
  three-hour boundary; Kp 3 where there is none (before 1932, after the table's last day). Above Kp 6 the ovals are
  stretched towards the equator (§5).
- **Two journeys**, also found by searching "CME", "solar storm", "geomagnetic storm", "space weather", "Gannon storm"
  or "Carrington event": *The Gannon storm, May 2024* (8 May 04:00 UT from 1.7 au above the planets at an hour a
  second; at 14:00 UT on 10 May to Earth with the field lines at ten minutes a second, the shock at 16:36; at 21:00 UT
  over the night side's oval at five minutes a second) and *The Carrington event, 1859* (the same three stops, Kp 9 set
  by hand, labelled a model). A Learn note, *Storms from the Sun*.

## 2. The data

**NASA DONKI** (Database Of Notifications, Knowledge, Information; NASA's Community Coordinated Modeling Center and,
since 2020, the Moon to Mars Space Weather Analysis Office, GSFC), its public API
(`https://ccmc.gsfc.nasa.gov/DONKI-API/get/CME|IPS|GST`, 60 days a request; the old `kauai.ccmc.gsfc.nasa.gov/DONKI/WS`
base moved on 30 September 2026), 1 January 2010 to 9 October 2026: 10,265 CMEs, 683 interplanetary shocks at Earth,
201 geomagnetic storms. Terms: a US government work, public; CCMC's rules of the road ask that DONKI's real-time
analyses be treated as prototyping quality, in a research context, and that CCMC be acknowledged ("We acknowledge the
Community Coordinated Modeling Center (CCMC) at Goddard Space Flight Center for the use of DONKI,
https://ccmc.gsfc.nasa.gov/tools/DONKI/"); the data come "as is", without warranty.

Of each CME the **most accurate analysis** is used: the time its leading edge reached 21.5 solar radii, its direction
(Stonyhurst latitude and longitude, west positive), its half-width and its speed (DONKI's analysts fit a cone to
coronagraph images, mostly with SWPC's CAT tool). Kept: every CME whose analysis has a direction and a width and that is
fast (1,000 km/s or more: 619) or linked to a shock at Earth or a storm (571 linked to 453 shocks): **1,086 CMEs**, and
the Carrington event (§3.4). 1,485 analyses with no longitude (DONKI's 999) are left out. Each shock is linked by DONKI
(either way round) when it comes within a week of the CME.

The direction is turned into the app's world frame (sim/frames.ts) with Earth's heliocentric position at the time
(astronomy-engine) and the Sun's rotation axis (RA 286.13°, Dec 63.87°; Archinal et al. 2018): x towards Earth
projected on the Sun's equator, z the Sun's axis, y = z × x, the heliocentric Earth equatorial frame of which
Stonyhurst coordinates are the spherical form (Thompson 2006, A&A 449, 791).

**The Kp index** of the GFZ Helmholtz Centre for Geosciences (Matzka et al. 2021, Space Weather 19, e2020SW002641;
doi:10.5880/Kp.0001), `Kp_ap_since_1932.txt`, **CC BY 4.0**: 276,920 three-hour values, 1 January 1932 to
8 October 2026 (the last 64 preliminary), none missing. Stored as Kp in thirds, one byte a value
(`public/data/space-weather/kp.bin.gz`, 134 kB, loaded only once the aurora is drawn with Kp Auto).

Files: `public/data/space-weather/cmes.json.gz` (49 kB; 193 kB of JSON; columns named in the file, read by
sim/spaceWeather/cmes.ts), `public/data/space-weather/kp.bin.gz` (format in sim/spaceWeather/kp.ts). The raw
downloads stay in `data-raw/space-weather/` (not committed).

## 3. The flight: the drag-based model

### 3.1 The model

Vršnak et al. 2013 (Solar Phys. 285, 295): beyond about 20 solar radii a CME is no longer driven, and the ambient wind
drags it towards its own speed, a = −γ (v − w)|v − w|, with γ constant (the cross-section grows as r², the wind's
density falls as 1/r²). With S = sign(v₀ − w):

    r(t) = (S/γ) ln[1 + S γ (v₀ − w) t] + w t + r₀,    v(t) = (v₀ − w) / [1 + S γ (v₀ − w) t] + w.

It starts at 21.5 solar radii at DONKI's time for that height, at DONKI's speed. Before that, the front flies at its
starting speed from the Sun's surface. **The cone**: the leading edge is a semicircle spanning the full width 2ω (the
model documentation's option b, oh.geof.unizg.hr/DBM/docs/DBM.pdf §1.2), an element at φ from the axis starting at
f r₀ with f v₀, f = (cos φ + √(tan²ω − sin²φ)) / (1 + tan ω), and each element flown by the drag law on its own
(alternative ii), so the flanks lag and the front flattens as their speeds converge. The GPU places the cap's vertices
with the same closed form.

### 3.2 Fitted to the measured arrivals

Each shock at Earth is fitted by one of the CMEs DONKI links to it, the one whose typical-model arrival is nearest the
measured one (the fastest when none reaches Earth by the model); the others merged with it on the way and fly with the
typical values. For that CME, the element facing Earth at the measured time is made to arrive at Earth's distance then:
of the (γ, w) pairs that do so to within a minute (γ in 0.005–5 × 10⁻⁷ km⁻¹, w from 250 to 900 km/s), the one nearest
the typical values. For 124 shocks the wind stays at 400 km/s; 329 needed another wind. 164 fronts are drawn wider than
analysed so that they reach Earth (Earth lay outside the analysed cone; a CME's shock is wider than the CME). 440 of
the 453 arrive within an hour of the measured shock; 13 cannot (a catalogued speed too low or too high for any pair;
the largest miss 14.1 h). Elsewhere: γ = 0.2 × 10⁻⁷ km⁻¹, w = 400 km/s (Vršnak et al. 2013's typical values).

### 3.3 How good the model is without the fit

The typical model (γ = 0.2 × 10⁻⁷ km⁻¹, w = 400 km/s, the analysed width) against the 453 measured shocks, each from its
best CME: Earth lies inside the analysed cone for 282; for those the arrival error is on average 10.3 h late, 15.8 h
absolute (median 11.4 h); 27 % within 6 h, 53 % within 12 h, 77 % within a day. By speed: under 500 km/s (80) 25.4 h
late on average (26.8 h absolute; many slow CMEs are linked to shocks another structure drove); 500–800 km/s (102),
8.3 h late (13.5 h absolute); 800–1,000 km/s (40), 0.1 h (9.0 h absolute); 1,000–1,500 km/s (45), 0.7 h (9.6 h
absolute); faster (15), −0.6 h (10.2 h absolute). Forecasts of CME arrival, by this model and by MHD models alike, are
typically off by about 10 hours (Riley et al. 2018, Space Weather 16, 1245, for the models of CCMC's CME Scoreboard).

| Event | CME (DONKI, UT) | Speed, half-width | Shock at Earth | Typical model | Fitted γ, w | Kp (GFZ) |
| --- | --- | --- | --- | --- | --- | --- |
| St Patrick's Day 2015 | 15 Mar 02:00 | 750 km/s, 45° | 17 Mar 04:05 | 21.3 h late | 2.03 × 10⁻⁷, 900 km/s | 8− |
| September 2017 | 6 Sep 12:24 | 1,238 km/s, 44° | 7 Sep 22:30 | 20.8 h late | 0.005, 900 (4.8 h late: not reachable) | 8+ |
| Gannon storm, May 2024 | 8 May 05:36 | 870 km/s, 43° | 10 May 16:36 | 2.4 h late | 0.155, 400 | 9 |
| | 9 May 09:24 | 1,330 km/s, 45° | 11 May 09:30 | 1.7 h late | 0.177, 400 | 9 |
| | 9 May 18:23 | 895 km/s, 44° | 11 May 20:30 | 14.6 h late | 0.611, 900 | 8− |
| | 10 May 07:12 | 1,018 km/s, 41° | 12 May 08:55 | 11.8 h late | 0.0235, 400 | 6+ |
| October 2024 | 9 Oct 02:12 | 1,509 km/s, 45° | 10 Oct 14:46 | 8.0 h late | 0.102, 400 | 9− |

Three more of May 2024's CMEs (8 May 12:24, 19:12 and 22:24) are linked by DONKI to the first two shocks and fly with
the typical values (they arrive 13.2 and 23.4 h after the first shock, and 9.4 h before the second).

**23 July 2012**, the fastest CME in the catalogue (3,435 km/s, 80° half-width), left the far side of the Sun as seen
from Earth (W144) and missed; its shock reached STEREO-A at 20:55 UT the same day (Temmer & Nitta 2015, Solar Phys.
290, 919, from Russell et al. 2013, ApJ 770, 38). Had it left a week earlier it would have hit Earth (Baker et al.
2013, Space Weather 11, 585). The card says so.

### 3.4 The Carrington event, 1859

No catalogue has it; quoted values, labelled a model on its card and in its journey. The flare: 1 September 1859,
11:18–11:23 UT (Carrington 1859, MNRAS 20, 13; Hodgson 1859, MNRAS 20, 15), in the sunspot group Carrington placed at
N12.4°–N27.5°, W6.6°–W28.7° that day (Hayakawa et al. 2019, Space Weather 17, 1553, from Carrington 1863): the
direction is taken at N20 W18. The storm began 17.6 hours later (Cliver & Svalgaard 2004, Solar Phys. 224, 407),
consistent with Bombay's magnetogram falling from 4.3 h UT on 2 September (Hayakawa et al. 2019). Not measured: the
width (taken as 45°) and the speed: 2,650 km/s, the speed that with the weak drag Temmer & Nitta (2015) found for the
extreme CME of July 2012 (γ = 0.01 × 10⁻⁷ km⁻¹, w = 450 km/s), flying at that speed from the Sun's surface to 21.5
solar radii, brings the front to Earth in 17.6 h. Its Dst was about −850 to −1,050 nT and the oval reached 28.5–30.8°
invariant latitude (Hayakawa et al. 2019); Kp was not measured (the journey draws Kp 9).

## 4. The hit at Earth

The pressure is **estimated, not measured**: a sheath of 15 protons per cm³ (between the medians, 10.8 and 19.8 cm⁻³,
that Kilpua et al. 2019, Space Weather 17, 1257, found in 89 sheaths behind fast and slow CMEs) moving at the drawn
front's modelled speed at Earth: P = n m_p v², 9.0 nPa at 600 km/s against the quiet wind's 2 nPa
(sim/fields/magnetopause.ts). It rises within half an hour of the front's arrival, holds for the sheaths' mean 10.2 h
(Kilpua et al. 2019) and eases back over the next ten hours. The sheath's field is taken to point south at 8 nT (the
median |B_z| of those sheaths behind fast CMEs was 7.7 nT; it varies, and south is what lets a storm in). The
magnetopause is Shue et al. 1998's for that pressure and B_z: for 10 May 2024, 590 km/s at Earth, 8.7 nPa, it comes in
from 10.25 to 7.4 Earth radii. The real one came in to about 5 (Hayakawa et al. 2025, ApJ 979, 49): the true sheath
was denser and its field stronger than typical.

## 5. Kp and the ovals

`kpAt` reads GFZ's three-hour Kp at the date and eases from one value to the next over the hour either side of each
boundary (so the ovals breathe smoothly while time runs fast); the ovals' table is redrawn when Kp moves by a ninth.
Starkov's ovals (sim/phenomena/aurora.ts) hardly move above Kp 6 (his AL from Kp levels off near 650 nT; at Kp 9 the
equatorward edge is still at 59.7° at midnight), while in great storms the oval comes much further south. So above
Kp 6 the ovals are those of Kp 6, their colatitudes stretched linearly in Kp so that at Kp 9 the equatorward edge
reaches 35.5° at midnight: the edge of the northern oval reconstructed from naked-eye reports on 10–11 May 2024, when
Kp was 9 (Hayakawa et al. 2025; 29.8° in the south). Kp 7 puts it at about 52°. A model of the stretch, anchored on
that storm. The rays are rejected below the oval's lowest latitude less 3° (50° until then). The View menu's selector:
Auto, Quiet (1), 3, 5, 7, 9.

## 6. Cost

Always loaded: the update in sim/spaceWeather/index.ts, a binary search and a few comparisons a frame once the table has
loaded (nothing before). The table loads (49 kB) once the camera is among the planets (within 60 au of the Sun) at a
date it covers (31 August–8 September 1859 and 2010–October 2026); the Kp index (134 kB) once the aurora is drawn with
Auto. The fronts' chunk loads the first time a CME is in flight near the camera; each front is one draw of a
4,100-vertex cap, its pixels shaded three or four times at most with a few operations; at most eight. Nothing is drawn
when none is in flight, nor with the switch off.

Measured (Intel integrated GPU, the owner's laptop, `__ls.perf.ab`, the layer on against off, 1600 × 900): see the
numbers in the report of 9 October 2026 below.

## 7. Not modelled

- The fronts' brightness and the sheath's thickness (a drawn surface; real CMEs are clouds seen in scattered sunlight).
- CMEs' interaction: merged CMEs fly on their own; DONKI's links say which merged.
- Deflection and rotation in the corona and the heliosphere, the wind's structure (fast streams, the current sheet),
  and γ and w varying along the way; the flanks' delay follows the cone geometry only.
- The measured solar wind at Earth (density, speed, B_z): the magnetopause's pressure is an estimate (§4), and the
  magnetosphere's compression by the quiet wind's own changes is not drawn.
- Storms before 1932 have no Kp (the Carrington event is drawn at Kp 9 by hand); CMEs before 2010 other than the
  Carrington event are not in the table (DONKI starts in 2010; the Halloween storms of 2003 are not included).

## 8. Tests

`src/sim/spaceWeather/spaceWeather.test.ts`: the closed form against a numerical integration (RK4) of the drag law,
faster and slower than the wind; the documentation's flank delays (2ω = 60°, γ = 0.2, w = 400, 1,000 km/s at 20 R☉:
about 10 h for alternative ii, 30 h for i; the model gives 11.5 and 27.4); Temmer & Nitta 2015's run for 23 July 2012
(206 R☉ at 20:04 UT against their 19:45, 2,129 km/s against their 2,210); the fits; the Stonyhurst frame; the table's
famous events (the drawn fronts within 0.1 h of the measured shocks, the typical model's errors as listed above, the
front facing Earth at Earth's distance); the Carrington crossing; the CMEs in flight at a date; the card's text; the
sheath's pressure and Shue's stand-off for given pressure and B_z; May 2024's squeeze; GFZ's Kp at known storms (13
March 1989, 29 October 2003, 17 March 2015, 10–11 May 2024), its easing and its notation; the ovals' stretch.
