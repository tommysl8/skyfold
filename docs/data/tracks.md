# Tracks: Chebyshev trajectories for small bodies and spacecraft

Task D2. Positions of 10 dwarf planets and TNOs, 4 comets, 3 interstellar objects and 10 spacecraft,
fitted to JPL Horizons with adaptive Chebyshev segments, plus the evaluator that reads them.

| File | What |
| --- | --- |
| `scripts/build-tracks.mjs` | Fetches Horizons (cached in `data-raw/tracks/`), fits, validates, writes everything below. |
| `public/data/tracks.bin` | Segment table and float64 Chebyshev coefficients. 1,552,880 bytes (1.48 MiB); 1,453,894 bytes with zlib level 9 (1,089,536 before Juno, Europa Clipper and SOHO were added, 9 October 2026). |
| `public/data/tracks.json` | Index: bodies, pieces, centres, fallbacks, jumps, provenance, measured accuracy. 102,302 bytes (19.5 kB gzipped). |
| `src/sim/tracks.ts` | Parser and evaluator. Pure TypeScript, no dependencies. |
| `src/sim/tracks.test.ts` | 91 tests (vitest). |
| `src/sim/__fixtures__/track-checkpoints.json` | 961 independent Horizons checkpoints used by the tests. |

### Changes after the independent verification (2026-09-25)

An independent check against fresh Horizons vectors found four problems. All are fixed in the files
above, and the same check, re-run on the new files, now passes everywhere.

1. **Comet and Arrokoth solution hand-overs broke the bound.** Encke, 67P and Arrokoth switch between
   JPL orbit solutions that differ by 770–65,000 km, and the old ±60-day (Arrokoth ±180-day) position
   cross-fades sat up to 32,600 km from both solutions. No continuous path can stay within 1,000 km of
   two solutions that far apart, so each hand-over is now an **exact switch**: before it the track is
   the fit to the earlier solution, from it the fit to the later one, and the difference is a listed
   jump (`cause: 'solution-switch'`). Re-checked: at most 193 km from the solution in force, on both
   sides of every switch.
2. **The default output broke the bound inside jump ramps** (up to 63,000 km for Pioneer 10).
   `evalTrack`, `evalState` and `evalHelio` now return the fit to Horizons **exactly by default**,
   jumps included. Smoothing is opt-in (`{ smoothJumps: true }`), uses a ramp centred on the jump, never
   moves a position more than half the jump, and reports the shift as `adjustedKm`.
3. **Positions froze beyond ±10⁷ days.** Elliptic fallbacks now reduce the time modulo the period and
   keep moving at any finite date (Ceres moves 3.3–3.7 au a year at years ±1 million and 1 billion).
   Hyperbolic fallbacks run to ±10¹⁵ days (2.7 trillion years); only beyond that do they stop, purely to
   keep numbers finite.
4. **The `ssb` centre needs a TT-based time.** Documented below and in `evalHelio`: build
   astronomy-engine's time with `AstroTime.FromTerrestrialTime(tdbDays)`.

## Conventions

- **Frame:** ecliptic and mean equinox of J2000. This is Horizons' `REF_PLANE=ECLIPTIC`,
  `REF_SYSTEM=ICRF`, with obliquity 84381.448″. It's the same rotation `src/sim/frames.ts` uses. Outputs are
  plain ecliptic x, y, z. To get the app's world axes, use world = (x, z, −y).
- **Time:** TDB days since J2000.0 (JD 2451545.0 TDB). astronomy-engine's `AstroTime.tt` can be
  passed straight in, since TT and TDB differ by under 2 ms.
- **Units:** km. Velocities from `evalState` are in km/s. Fallback `v` is in km/s and `mu` is in km³/s².
- **Centres** (see `tracks.json → centres`). A position is always relative to a named centre:

| Centre | Horizons | Resolve in the app with |
| --- | --- | --- |
| `sun` | `@10` Sun body centre | the origin |
| `ssb` | `@0` Solar System barycentre | `HelioVector(Body.SSB)`. Only extrapolated states use it (see below). |
| `earth` | `@399` geocentre | `HelioVector(Body.Earth)` |
| `venus` | `@299` | `HelioVector(Body.Venus)` |
| `mars` | `@499`, Mars's body centre (Europa Clipper's 2025 flyby) | `HelioVector(Body.Mars)` |
| `jupiter`, `saturn`, `uranus`, `neptune` | `@599`, `@699`, `@799`, `@899`, the planet's **body** centre | `HelioVector(Body.Jupiter)` etc. |
| `pluto` | `@9`, the Pluto–Charon **barycentre** | `HelioVector(Body.Pluto)`, which is also the barycentre |
| `arrokoth` | `@2486958`, the New Horizons flight-project ephemeris | this file's own `arrokoth` track (the evaluator resolves it) |

All astronomy-engine vectors are heliocentric EQJ in au. Rotate them to ecliptic
(y′ = cos ε·y + sin ε·z, z′ = −sin ε·y + cos ε·z) and scale by 149,597,870.7.

**Build the astronomy-engine time from TT.** The evaluator's time is TDB days since J2000. Pass it to
astronomy-engine as `AstroTime.FromTerrestrialTime(tdbDays)` (TT and TDB differ by under 2 ms), not
`MakeTime(tdbDays)`, which reads its argument as UT. Read as UT, the time is off by ΔT (about a minute
now, several minutes near 2200 and far more in the past), and every centre moves by ΔT times its speed:
for `ssb` about 4 km near 2200, which shows as a step where a barycentric fallback takes over. The app
already holds `AstroTime` objects, so pass `time.tt` to the evaluator and the same `time` to
astronomy-engine.

## Using it

```ts
import { loadTracks, parseTracks } from './tracks';

const tracks = await loadTracks(`${import.meta.env.BASE_URL}data/`); // or parseTracks(indexJson, arrayBuffer)
const r = tracks.evalTrack('voyager2', time.tt);          // { pos, centre, regime, blend? }
const h = tracks.evalHelio('voyager2', time.tt, centreHelio); // heliocentric, blends applied
const s = tracks.evalState('parker-solar-probe', time.tt); // adds vel (km/s)
tracks.evalTrack('voyager1', t, { smoothJumps: true });   // display option: jumps spread over ramps, adds adjustedKm
```

The default output is the fit to Horizons with nothing moved: every position is within the stated
bound of the Horizons solution in force at that instant, including right next to a jump. `raw: true`
from the first version is still accepted and is now the same as the default.

`centreHelio(centre, tdbDays)` returns the heliocentric ecliptic km position of `ssb`, `earth`,
`venus`, `jupiter`, `saturn`, `uranus`, `neptune` or `pluto`, computed with astronomy-engine as the app
already does. `sun` and track centres such as `arrokoth` are handled inside the evaluator. Evaluation takes about
0.3 µs per call (Node 24).

### Regimes

| `regime` | When | Position |
| --- | --- | --- |
| `precise` | Inside the Horizons span (`precise` in the index) | Chebyshev fit, error bounds below |
| `extrapolated` | Outside it, for bodies that keep existing | Two-body conic from the edge state, `centre` `sun` or `ssb` |
| `before-launch` | Before a spacecraft's first Horizons state | Fixed at that first state, relative to Earth. **Hide the craft.** |
| `unknown` | JWST after 2031-09-21 | Fixed at the last state, relative to Earth. **Hide it.** |

Every finite time, up to ±`Number.MAX_VALUE`, returns a finite position and velocity. NaN throws a
`RangeError`. An unknown body id throws. How far the fallbacks run:

- **Ellipses** (Ceres, Vesta, the TNOs, Halley, Encke, 67P, Hale–Bopp, Parker after 2030): no limit.
  Two-body motion on an ellipse repeats every period, so the time since the edge state is reduced
  modulo the period (`%`, exact) before Kepler's equation is solved. The body keeps moving at any date.
  Beyond about 10¹⁶ days the rounding of t itself (a day or more) blurs the phase along the orbit, but
  the position stays on the ellipse. (The two-body orbit is itself only plausible, not precise, beyond a
  few years from the edge: see "Outside the precise span".)
- **Hyperbolas** (the interstellar objects, the escaping spacecraft): evaluated up to ±10¹⁵ days
  (2.7 trillion years) from the edge state, then held there, only so the numbers stay finite. The
  hyperbolic solver is tested to |M| = 10¹² and e from 1.0001 to 50.
- **Near-parabolic** (|e − 1| < 10⁻⁶, none in the current file): universal variables up to 10⁶ days,
  then straight along the tangent, because the universal-variable functions overflow further out.

Extrapolation:

- `sun`, a heliocentric orbit about GM☉: Ceres, Vesta, Encke, 67P and Parker Solar Probe (after
  2030).
- `ssb`, an orbit about the barycentre with the whole Solar System's GM, which is the method
  `src/sim/voyager.ts` already uses: TNOs, Halley, Hale–Bopp, the interstellar objects, and
  Voyager 1/2, New Horizons and Pioneer 10 after their data end.

The barycentric edge position is stored relative to **astronomy-engine's** barycentre. That
barycentre includes only the Sun and the four giant planets, and it sits 90–1,400 km from the DE440 one
(the offset is recorded per fallback as `ssbOffsetKm`). Adding `HelioVector(Body.SSB)` back therefore
reproduces the edge position exactly, so the handover is seamless in the app. The edge velocity is
Horizons' barycentric velocity. The conics use robust solvers: a safeguarded Newton method for the
elliptic equation, and for the hyperbolic equation a bracketed Newton–bisection on
0 ≤ H ≤ asinh(M/(e−1)). The hyperbolic solver is tested to |M| = 10¹² and e from 1.0001 to 50 (3I/ATLAS has e ≈ 6.1).
Near-parabolic orbits (|e − 1| < 10⁻⁶) use universal variables.

### Blends (planet-centred flybys)

Near a planet, a spacecraft is stored relative to that planet, so the flyby geometry is exact
against the app's planet. That planet comes from astronomy-engine and is **tens of thousands of km** off JPL's for the giant
planets (measured at the switch times: Jupiter 22,600–31,500 km, Saturn 55,000–60,000, Uranus
105,000–106,000, Neptune 99,000–104,000, Pluto 73,000–74,000, Venus 960–2,700, Earth 250–1,600). The
planet-centred track inherits that offset, so the handover has to be gradual. The planet-centred piece and the
heliocentric piece therefore overlap by `blendIn` days at the start and `blendOut` days at the end. In the overlap, `evalTrack`
returns the heliocentric representation as `pos`/`centre` and the planet-centred one as
`blend: { pos, centre, weight }`. Display
(1 − weight)·(centre + pos) + weight·(blend.centre + blend.pos). The weight is a smoothstep from 0 at the
switch to 1 after `blendIn` days, and back again at the end. `evalHelio` does this for you. Both
representations are within the error bounds of Horizons. The blend only moves the app's planet offset
from one to the other.

How the switch is placed:

- **Where:** at the larger of the Laplace sphere of influence and offset/0.002, so the offset is at most 0.2% of the
  distance to the planet.
- **How long:** the blend lasts offset/(0.01·v_rel), so fading the offset in adds at most 1% to the speed
  relative to the planet. It's between 0.02 days and a quarter of the window.

Launch is handled the same way. Each craft starts relative to Earth and hands over to heliocentric at
the Earth's sphere of influence (929,200 km).

### Jumps

The data contain two kinds of position jump, both listed in their piece as
`jumps: [{ t, iso, cause, from?, to?, jump, jumpKm, rampDays }]`:

- `cause: 'source'`: Horizons stitches some spacecraft trajectories together from separately fitted
  files and keeps the discontinuities between them. The fit keeps them too.
- `cause: 'solution-switch'`: where this file moves from one JPL orbit solution of a comet (or of
  Arrokoth) to the next, `from` → `to` (Horizons record numbers or commands). See Method, items 5 and 6.

`jump` is the position just after `t` minus just before (km, in the piece's centre). The segment join
at `t` is flagged (bit 0) and the segments meet with no gap for solution switches, or a gap under 2 s
for source jumps, which the evaluator bridges with the earlier segment.

**The default output keeps every jump exactly.** A position just before a jump is within the bound of
the data before it, and one just after is within the bound of the data after it, so the bound holds at
every instant. Any continuous path from one side of a jump of D km to the other passes through a point
at least D/2 from both sides, so no smoothing can keep the bound across a jump more than twice the
bound: that is every source jump except New Horizons' two of 193 km, and every solution switch except
Encke's of 772 km and 1,211 km. One rule for all jumps keeps the default simple: exact.

**Optional smoothing, for display.** `{ smoothJumps: true }` spreads each jump over a smoothstep ramp
centred on it, `[t − rampDays/2, t + rampDays/2]`: before `t` the position moves towards the later side
by w·jump, after it back towards the earlier side by (1 − w)·jump. The path is then continuous in
position and velocity, the ramp adds at most 1% to the speed (`rampDays` = 1.5·jumpKm / (0.01·speed)),
and no position moves more than half the jump. Inside a ramp `adjustedKm` reports the displacement;
such positions do not meet the stated accuracy.

**For the app.** A jump in the default output is a step in the drawn position: at most 126,500 km
(0.00085 au; Pioneer 10, 1983), up to about four hours of the body's own motion. Break trail polylines
at listed jump times, or use `smoothJumps` for the moving marker only.

Source jumps:

| Body | Centre | Jump at (TDB) | Size (km) | Ramp (d) | Cause (Horizons notes) |
| --- | --- | --- | ---: | ---: | --- |
| Voyager 1 | sun | 1981-01-01 00:00:00 | 65,180 | 5.27 | Mission-design conics join the 2022 refit |
| Voyager 2 | neptune | 1989-08-29 08:00:00 | 610 | 0.063 | Mission-design conics join the 2022 refit |
| New Horizons | sun | 2007-01-01 00:00:00 | 1,205 | 0.104 | Trajectory file boundary |
| New Horizons | sun | 2012-05-01 13:47:11 | 194 | 0.022 | File boundary (od070 → od117) |
| New Horizons | sun | 2014-11-29 19:48:13 | 193 | 0.023 | File boundary |
| New Horizons | sun | 2016-02-17 19:44:17 | 332 | 0.040 | File boundary |
| New Horizons | sun | 2021-10-01 00:00:00 | 4,719 | 0.592 | File boundary (alleph od151 → od165) |
| Pioneer 10 | sun | 1972-03-24 11:30:42 | 6,478 | 0.297 | PN10 file boundary |
| Pioneer 10 | sun | 1972-09-19 22:00:49 | 743 | 0.062 | PN10 file boundary |
| Pioneer 10 | sun | 1973-04-24 15:00:00 | 754 | 0.098 | PN10 file boundary |
| Pioneer 10 | jupiter | 1973-11-24 02:00:00 | 2,531 | 0.445 | PN10 file boundary |
| Pioneer 10 | jupiter | 1973-12-24 00:00:00 | 19,360 | 3.62 | PN10 file boundary |
| Pioneer 10 | sun | 1983-06-12 00:00:53 | 126,500 | 16.1 | PN10 file boundary |
| Pioneer 10 | sun | 1990-01-02 00:00:57 | 31,020 | 4.19 | PN10 file boundary |
| Parker Solar Probe | sun | 2025-06-25 06:01:09 | 79,880 | 2.19 | Reconstruction (v041) joins the od242 prediction |
| Parker Solar Probe | sun | 2026-06-17 00:01:09 | 492 | 0.017 | Prediction joins the reference planning trajectory |
| Europa Clipper | earth | 2024-10-14 17:09:43 | 50 | 0.008 | Navigation file boundary |
| Europa Clipper | sun | 2024-11-23 00:01:09 | 164 | 0.008 | Navigation file boundary |
| Europa Clipper | sun | 2026-07-09 00:01:09 | 8,843 | 0.593 | Navigation file boundary |
| Europa Clipper | sun | 2026-08-08 00:01:09 | 8,467 | 0.494 | Reconstruction joins the prediction |
| Europa Clipper | sun | 2027-01-23 00:01:09 | 3,993 | 0.217 | Prediction joins the mission's reference trajectory |
| SOHO | earth | 1998-08-19 00:01:00 | 25,790 | 83.1 | Horizons' ballistic filler for the lost months begins |

Five more flagged joins sit under a second before some of these jumps: New Horizons 2012-05-01, Pioneer 10
1973-11-24 and 1983-06-12, Parker 2025-06-25 and 2026-06-17. At each, Horizons' velocity disagrees
with its positions at the file boundary. The segments meet there without the velocity constraint
(flag bit 0 in the table below), and the positions agree, so they are not listed as jumps.

Solution switches (all in the heliocentric piece; the switch sits at the aphelion between two
perihelion passages for the comets, and at the ends of 1995–2033 for Arrokoth):

| Body | Switch at (TDB) | From → to (Horizons) | Size (km) | Ramp (d) |
| --- | --- | --- | ---: | ---: |
| Encke | 1982-08-04 | 90000082 (SAO/1980) → 90000083 (SAO/1984) | 13,320 | 4.01 |
| Encke | 1985-11-24 | 90000083 → 90000084 (SAO/1987) | 772 | 0.234 |
| Encke | 1989-03-08 | 90000084 → 90000085 (SAO/1990) | 3,023 | 0.92 |
| Encke | 1992-06-20 | 90000085 → 90000086 (SAO/1994) | 5,047 | 1.54 |
| Encke | 1995-10-03 | 90000086 → 90000088 (JPL J974/1) | 3,748 | 1.14 |
| Encke | 2002-05-07 | 90000088 → 90000089 (JPL K105/6) | 2,054 | 0.62 |
| Encke | 2008-12-13 | 90000089 → 90000090 (JPL K204/20) | 2,412 | 0.728 |
| Encke | 2018-11-03 | 90000090 → 90000091 (JPL K273/17) | 1,211 | 0.366 |
| 67P | 1986-03-04 | 90000697 (SAO/1982) → 90000698 (SAO/1989) | 8,355 | 1.91 |
| 67P | 1992-10-02 | 90000698 → 90000699 (SAO/1996) | 11,350 | 2.60 |
| 67P | 1999-05-07 | 90000699 → 90000700 (SAO/2002) | 12,460 | 2.86 |
| 67P | 2005-11-27 | 90000700 → 90000701 (JPL K097/1) | 10,110 | 2.33 |
| 67P | 2012-05-22 | 90000701 → 90000703 (JPL K284/1) | 2,813 | 0.653 |
| Arrokoth | 1995-01-01 | 486958 (JPL#3, ground-based) → 2486958 (NH project, od159) | 47,930 | 18.5 |
| Arrokoth | 2033-01-01 | 2486958 → 486958 | 65,450 | 24.6 |

Arrokoth's two solutions drift apart almost linearly, about 3,000 km a year either side of 2011 (where
they are closest, 1,700 km): 22,000 km at the 2019 flyby. They never come close enough after 2011 for a
seamless hand-over, and the project ephemeris is the better one near the flyby, so it is kept for its
whole 1995–2033 span as before.

## `tracks.bin` (little-endian)

| Offset | Type | Field |
| --- | --- | --- |
| 0 | 4 × u8 | magic `LTRK` |
| 4 | u32 | version = 1 |
| 8 | u32 | segment count S (3,756) |
| 12 | u32 | coefficient count C (182,838 float64) |
| 16 | u32 | segment table offset (32) |
| 20 | u32 | coefficient offset (32 + 24·S, a multiple of 8) |
| 24 | u32 | total byte length |
| 28 | u32 | reserved (0) |

Segment table, 24 bytes per segment:

| Offset | Type | Field |
| --- | --- | --- |
| 0 | f64 | t0 (TDB days since J2000) |
| 8 | f64 | t1 |
| 16 | u32 | index of the first coefficient (in float64s) |
| 20 | u16 | degree n (3–31) |
| 22 | u16 | flags. Bit 0: the next segment starts after a jump (a source jump or a solution switch; no continuity). |

Each segment stores 3(n+1) float64 coefficients: x₀…xₙ, y₀…yₙ, z₀…zₙ, in km. With
x = (2t − t0 − t1)/(t1 − t0), position = Σ cₖ Tₖ(x). The velocity is the derivative times 2/(t1 − t0), per day.
A piece's segments are contiguous in the table and sorted by time. Consecutive segments share their
end time. The only exception is a source jump, which leaves a gap of under 2 s that the evaluator
bridges with the earlier segment. At a solution switch the two segments share the switch time, and the
later one is used from that instant.

## `tracks.json`

```jsonc
{
  "format": "lightspeed-tracks", "version": 1, "binary": "tracks.bin",
  "frame": "...", "time": "...", "units": {...}, "centres": { "jupiter": { "horizons": "@599", "label": "..." }, ... },
  "bodies": {
    "voyager2": {
      "name": "Voyager 2", "kind": "spacecraft",       // dwarf-planet | asteroid | tno | comet | interstellar | spacecraft
      "horizons": { "command": "-32", "target": "...", "ephemeris": "Voyager_2_ST+refit2022_m", "coverage": [...] },
      "precise": [t0, t1], "preciseIso": [...],
      "pieces": [ {
        "centre": "neptune", "role": "inner",           // outer = heliocentric; inner = planet-centred
        "t0": ..., "t1": ..., "seg0": 1873, "segCount": 17,
        "blendIn": 6.99, "blendOut": 6.99,              // days
        "tolKm": 100, "fineRadiusKm": 43854, "fineTolKm": 1,
        "switchRadiusKm": 86600000, "appPlanetOffsetKm": 101000,
        "closestApproach": { "t": ..., "iso": "1989-08-25 03:56:36", "distanceKm": 29235.9 },
        "jumps": [ { "t": ..., "iso": "1989-08-29 08:00:00", "cause": "source", "jump": [dx, dy, dz], "jumpKm": 610, "rampDays": 0.063 } ],
        // comets and Arrokoth: { ..., "cause": "solution-switch", "from": "90000082", "to": "90000083", ... }
        "accuracy": { "fitSamples": ..., "fitMaxKm": ..., "independent": { "points", "maxKm", "rmsKm" }, "flyby": {...} }
      }, ... ],
      "before": { "regime": "before-launch", "centre": "earth", "epoch": ..., "pos": [...] },
      "after":  { "regime": "extrapolated", "model": "two-body", "centre": "ssb", "epoch": ..., "r": [...], "v": [...], "mu": ..., "ssbOffsetKm": ... },
      "accuracy": { "requirementKm": 100, "maxKm": 25, "rmsKm": 10.5, "flyby": { "requirementKm": 1, "maxKm": 0.267 }, ... },
      "appSwitchOffsetsKm": [ { "centre": "neptune", "iso": "...", "offsetKm": 104000 }, ... ],
      "solutions": [...],                                // comets and Arrokoth: which Horizons solution covers which dates,
                                                         // with handoverToNextKm = the jump at the switch
      "notes": ["..."]
    }
  }
}
```

The pieces of a body tile its `precise` span. Outer pieces only overlap inner ones, and only inside
the blend intervals.

## Method

1. **Horizons queries.** `EPHEM_TYPE=VECTORS`, `VEC_TABLE=2` (state), `VEC_CORR=NONE` (geometric),
   `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `OUT_UNITS=KM-S`, `CSV_FORMAT=YES`, with TDB times.
   - Grids use `STEP_SIZE` as a number of equal intervals. Each sample is tagged with the epoch
     Horizons prints: Horizons accumulates its step, so the printed epoch drifts from the ideal grid by up to a few ms
     over 40,000 steps.
   - Discrete epochs use `TLIST` in batches of 50, because longer query strings are rejected
     with HTTP 502.
   - Requests go one at a time with a 1.5 s pause and back off on 429 and 5xx. Grids are chunked at 40,000 steps.
   - Every response is cached under `data-raw/tracks/`. A full build from an empty cache takes
     about 1,250 requests and 30–40 minutes; with the cache, a rebuild takes about 30 s.
2. **Sampling.**
   - Each piece starts on a coarse grid: 16 days for TNOs and interstellar objects, 4–8 for
     Ceres, Vesta and comets, 1 for spacecraft in cruise (0.5 for Parker), 0.25 or less in planet
     windows.
   - The grid is then densified until every interval is at most 1/16 of the local time scale r/|v|
     about the piece's centre. That time scale is set by perihelia and closest approaches.
   - Contiguous intervals needing refinement are fetched as one grid.
3. **Fit.** Segments are built greedily.
   - From each start, every degree in {3, 5, 7, 9, 11, 13, 16, 19, 23, 27, 31} is stretched as far
     as the tolerance allows. The degree covering the most days per stored byte wins.
   - The fit is least squares on positions and velocities. The end positions **and** velocities are
     matched exactly, so the path is C¹ across segment joins.
   - A candidate passes only if its error is within the target at every sample. It must also pass at every
     interval midpoint, measured against the cubic Hermite interpolant of the two neighbouring samples.
     That check catches a polynomial that wiggles between samples.
   - If even a two-interval segment fails, the build fetches 8× denser samples there. Below 2 s it
     declares a jump in the source (see above).
   - Where a body switches solution, the samples of each solution are fitted separately, and the two
     fits meet at the switch time, where both solutions are sampled.
   - **Targets are a quarter of the bound:** 250 km for small bodies (bound 1,000), 25 km for spacecraft (bound
     100), and 0.25 km inside the flyby radius (bound 1). The flyby radius is max(10 planet radii, 1.5 × closest
     approach).
4. **Independent validation.** Each piece is checked against 100 random Horizons epochs that the
   fit never saw. Flyby pieces get 60 more inside the flyby radius, plus the closest approach itself. The table below
   reports these, together with the error at all fit samples.
5. **Comets.** Horizons keeps one solution per apparition for periodic comets.
   - Each perihelion passage in the window uses the solution whose element epoch is closest to
     it.
   - Solutions hand over at the aphelion between two passages (snapped to the 4-day grid), where the
     comet is slowest and the solutions' along-track difference is small in km. The hand-over is an
     **exact switch**: the solutions still differ there by 770–13,300 km (Encke) and 2,800–12,500 km
     (67P), and no blend can stay within 1,000 km of both. The first version cross-faded them over
     ±60 days, which put the track up to 6,600 km from either solution; that is gone. Each body's
     `solutions` lists records, arcs, dates and the jump at each switch, and the jumps are listed in
     the piece (see "Jumps").
   - Encke uses records 90000082–86 (SAO, 1980–1994), 90000088 (JPL J974/1), 90000089 (K105/6),
     90000090 (K204/20) and 90000091 (K273/17, 2020 onwards).
   - 67P uses 90000697–700 (SAO) for 1982–2002, 90000701 (K097/1) for 2009, and 90000703 (K284/1)
     from 2015 on.
   - Halley uses the single record 90000030 (JPL#75, arc 1835–1994, with non-gravitational terms). Its next perihelion in the
     fit is **2061-07-28 17:17 TDB**, matching JPL's prediction; a test checks it.
   - Hale–Bopp uses the single record 90002256 (JPL#226).
6. **Arrokoth** follows the New Horizons flight-project ephemeris (Horizons target `2486958`,
   NavSBE_2014MU69_od159) from 1995 to 2033. Horizons calls it more accurate than the
   ground-based orbit (`486958;`), which is used outside that span. The two differ by ~22,000 km at the flyby,
   ~48,000 km in 1995 and ~65,000 km in 2033, so the switches at 1995-01-01 and 2033-01-01 are exact
   jumps (the first version's ±180-day cross-fades were up to 32,600 km from both). New Horizons'
   Arrokoth-relative track and the Arrokoth track agree to within 50 km at the flyby blend
   (`appSwitchOffsetsKm`), so the 3,537 km flyby is exact in the app.
7. **Interstellar objects** cover Horizons' whole small-body span, 1600–2500. Horizons integrates a grid
   from the solution epoch back to its start, and then forward across the whole span. For these
   hyperbolic orbits with non-gravitational forces, that forward pass drifts from a direct integration after
   perihelion: about 51,000 km by 2476 for 1I, 7,000 km for 2I and 14,000 km for 3I. Its own TLIST answers
   disagree with it by those amounts. Each span is therefore fetched as two legs that meet at the solution
   epoch, after which grid and TLIST values agree to within 20 km.

## Accuracy

All errors below are measured against Horizons, for the default output (which is the fit itself).
"Max" is the larger of the worst error at the 402,000 fit samples and the worst of the independent
epochs; "RMS" is over the independent epochs only (100 random epochs per piece, plus 60 in each flyby
zone). Planet-centred pieces are measured relative to their planet. For Encke, 67P and Arrokoth the
truth at each instant is the Horizons solution in force then (see the switch table under "Jumps").
With `smoothJumps`, positions inside a ramp depart from these figures by up to `adjustedKm`.

These are observed maxima, not proofs, but the fit targets are a quarter of the bound, and every
independent check so far has come in under the target: the build's own 798 checkpoints, and a separate
verification against 257 fresh Horizons requests (at least 40 random epochs per body plus edges, blend
midpoints, closest approaches, ramps and both sides of every switch), re-run on these files for all 23
bodies: small bodies at most 246 km (bound 1,000), within 193 km on both sides of every solution
switch; spacecraft at most 24.9 km (bound 100); inside the flyby radii at most 0.254 km (bound 1). The
interstellar objects must be checked with one epoch per Horizons request (at most 233 km that way): a
long TLIST batch starting in 1600 reproduces the forward-integration drift described under Method,
item 7, and shows false errors of 1,800–11,800 km.

| Body | Precise span (TDB) | Centres | Segments | Bytes | Max (km) | RMS (km) | Bound (km) | Flyby max (km) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ceres (`ceres`) | 1981-01-01 – 2200-01-01 | sun | 49 | 26,976 | 250 | 138 | 1000 | – |
| Vesta (`vesta`) | 1981-01-01 – 2200-01-01 | sun | 59 | 28,296 | 250 | 132 | 1000 | – |
| Eris (`eris`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 143 | 1000 | – |
| Haumea (`haumea`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 134 | 1000 | – |
| Makemake (`makemake`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 142 | 1000 | – |
| Gonggong (`gonggong`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 134 | 1000 | – |
| Quaoar (`quaoar`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 147 | 1000 | – |
| Sedna (`sedna`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 144 | 1000 | – |
| Orcus (`orcus`) | 1981-01-01 – 2200-01-01 | sun | 50 | 27,528 | 250 | 138 | 1000 | – |
| Arrokoth (`arrokoth`) | 1981-01-01 – 2200-01-01 | sun | 53 | 27,888 | 249 | 136 | 1000 | – |
| Halley (`halley`) | 1981-01-01 – 2200-01-01 | sun | 49 | 30,312 | 249 | 127 | 1000 | – |
| Encke (`encke`) | 1981-01-01 – 2200-01-01 | sun | 293 | 118,104 | 250 | 116 | 1000 | – |
| 67P (`churyumov-gerasimenko`) | 1981-01-01 – 2200-01-01 | sun | 109 | 51,048 | 250 | 129 | 1000 | – |
| Hale–Bopp (`hale-bopp`) | 1981-01-01 – 2200-01-01 | sun | 48 | 28,152 | 250 | 143 | 1000 | – |
| 1I/ʻOumuamua (`oumuamua`) | 1600-01-01 – 2500-01-01 | sun | 215 | 115,032 | 250 | 141 | 1000 | – |
| 2I/Borisov (`borisov`) | 1600-01-01 – 2500-01-01 | sun | 213 | 113,616 | 250 | 142 | 1000 | – |
| 3I/ATLAS (`atlas-3i`) | 1600-01-01 – 2500-01-01 | sun | 216 | 114,408 | 250 | 144 | 1000 | – |
| Voyager 1 (`voyager1`) | 1977-09-05 – 2099-12-31 | earth, sun, jupiter, saturn | 75 | 31,776 | 25.2 | 11.0 | 100 | 0.223 |
| Voyager 2 (`voyager2`) | 1977-08-20 – 2099-12-31 | earth, sun, jupiter, saturn, uranus, neptune | 101 | 40,992 | 25.0 | 10.5 | 100 | 0.267 |
| New Horizons (`new-horizons`) | 2006-01-19 – 2049-12-31 | earth, sun, jupiter, pluto, arrokoth | 92 | 24,552 | 24.9 | 8.35 | 100 | 0.192 |
| Pioneer 10 (`pioneer10`) | 1972-03-03 – 2050-01-01 | earth, sun, jupiter | 79 | 24,624 | 25.0 | 9.58 | 100 | 0.237 |
| Parker Solar Probe (`parker-solar-probe`) | 2018-08-12 – 2030-01-01 | earth, sun, venus | 255 | 96,432 | 25.5 | 8.73 | 100 | 0.243 |
| JWST (`jwst`) | 2021-12-25 – 2031-09-21 | earth | 38 | 24,600 | 24.9 | 9.05 | 100 | 0.077 |
| Juno (`juno`) | 2011-08-05 – 2028-09-02 | earth, sun, jupiter | 601 | 219,864 | 250 | 45 | 1000 | 0.239 |
| Europa Clipper (`europa-clipper`) | 2024-10-14 – 2034-09-03 | earth, sun, mars, jupiter | 337 | 103,968 | 250 | 43.1 | 1000 | 0.242 |
| SOHO (`soho`) | 1995-12-02 – 2026-11-02 | earth | 524 | 139,512 | 25 | 9.59 | 100 | 0.221 |

Spacecraft spans start 60 s after Horizons' first state and end 60 s before its last. The small bodies
end at 2200-01-01 00:00 TDB, to within the 2 ms by which Horizons' printed epochs drift. The bytes column includes each segment's 24-byte table entry. The heliocentric
dwarf planets and TNOs need about 20 coefficients per 4 years. They aren't simply smooth: the Sun's reflex
motion around the barycentre includes the Earth's (≈450 km, yearly) and Venus's (≈265 km)
contributions, which exceed the 250 km target.

### Flybys

| Craft | Centre | Planet-centred window (TDB) | Switch radius (km) | Blend (d) | Closest approach (TDB) | Distance (km) | Max error in flyby radius (km) |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: |
| Voyager 1 | jupiter | 1979-01-16 12:32 → 1979-04-22 10:56 | 48,220,000 | 2.72 | 1979-03-05 12:05:25 | 348,435 | 0.223 |
| Voyager 1 | saturn | 1980-10-02 18:24 → 1980-12-24 08:57 | 54,810,000 | 4.21 | 1980-11-12 23:46:28 | 184,030 | 0.202 |
| Voyager 2 | jupiter | 1979-05-06 11:24 → 1979-09-12 20:50 | 48,220,000 | 4.33 | 1979-07-09 22:29:51 | 721,375 | 0.267 |
| Voyager 2 | saturn | 1981-06-29 07:38 → 1981-10-22 23:05 | 54,810,000 | 6.24 | 1981-08-26 03:24:56 | 160,691 | 0.227 |
| Voyager 2 | uranus | 1985-12-14 09:06 → 1986-03-07 02:15 | 52,810,000 | 8.29 | 1986-01-24 17:59:46 | 107,154 | 0.216 |
| Voyager 2 | neptune | 1989-06-26 10:05 → 1989-10-23 21:53 | 86,600,000 | 6.99 | 1989-08-25 03:56:36 | 29,236 | 0.232 |
| New Horizons | jupiter | 2007-01-29 15:44 → 2007-03-29 19:47 | 48,220,000 | 1.54 | 2007-02-28 05:44:45 | 2,304,505 | 0.075 |
| New Horizons | pluto (barycentre) | 2015-06-13 16:29 → 2015-08-14 07:12 | 36,690,000 | 6.16 | 2015-07-14 11:51:08 | 15,382 | 0.192 |
| New Horizons | arrokoth | 2018-12-30 05:34 → 2019-01-03 05:34 | – | 0.25 | 2019-01-01 05:34:31 | 3,537 | 0.088 |
| Pioneer 10 | jupiter | 1973-10-06 16:01 → 1974-01-31 15:40 | 48,220,000 | 3.07 | 1973-12-04 02:26:08 | 203,122 | 0.237 |
| Parker Solar Probe | venus | 2018-10-02 23:24 → 2018-10-03 18:07 | 775,200 | 0.08 | 2018-10-03 08:45:36 | 8,480 | 0.239 |
| Parker Solar Probe | venus | 2019-12-26 10:49 → 2019-12-27 01:41 | 616,300 | 0.05 | 2019-12-26 18:15:54 | 9,056 | 0.216 |
| Parker Solar Probe | venus | 2020-07-10 14:45 → 2020-07-11 16:04 | 1,049,000 | 0.11 | 2020-07-11 03:24:49 | 6,885 | 0.229 |
| Parker Solar Probe | venus | 2021-02-20 12:41 → 2021-02-21 03:32 | 616,300 | 0.05 | 2021-02-20 20:06:54 | 8,437 | 0.243 |
| Parker Solar Probe | venus | 2021-10-15 17:22 → 2021-10-17 01:40 | 1,337,000 | 0.13 | 2021-10-16 09:31:58 | 9,860 | 0.231 |
| Parker Solar Probe | venus | 2023-08-21 04:38 → 2023-08-21 19:29 | 616,300 | 0.05 | 2023-08-21 12:04:03 | 10,057 | 0.228 |
| Parker Solar Probe | venus | 2024-11-06 07:12 → 2024-11-07 06:16 | 956,500 | 0.10 | 2024-11-06 18:44:49 | 6,428 | 0.243 |
| Juno | earth | 2013-10-08 18:56 → 2013-10-10 19:48 | 929,200 | 0.05 | 2013-10-09 19:22:32 | 6,932 | 0.239 |
| Europa Clipper | mars | 2025-02-28 15:34 → 2025-03-02 20:21 | 973,300 | 0.22 | 2025-03-01 17:58:03 | 4,274 | 0.242 |
| Europa Clipper | earth | 2026-12-02 22:12 → 2026-12-04 18:17 | 929,200 | 0.06 | 2026-12-03 20:15:20 | 9,605 | 0.136 |

**Orbiters.** Juno and Europa Clipper stay at Jupiter once there, so their last piece (`orbit` in the build's
configuration) is Jupiter-centred from where they cross Jupiter's switch radius on the way in (Juno 2016-04-12, Europa
Clipper 2030-01-22; 48.2 million km, Jupiter's sphere of influence, with a 5.0 and 2.7 day blend) to the end of
the data. These pieces are fitted to the small bodies' tolerance (target 250 km, bound 1,000 km): at the cruise
tolerance each of Juno's 70 close passes would need many more segments. Europa Clipper's flybys of Europa and the
other moons are inside this piece, relative to Jupiter, not to the moons.

Launch pieces (Earth-centred until 929,200 km) are accurate to 0.14 km within 10 Earth radii.
Closest approaches are to the centre listed. New Horizons' 15,382 km is to the Pluto–Charon barycentre; the
distance to Pluto's centre was about 13,700 km.

**Planet body vs barycentre.** The giant-planet tracks are relative to the planet's body centre,
the frame in which moons are usually given. astronomy-engine's Jupiter–Neptune positions are
system barycentres. At these flybys the two differ by 190–213 km (Jupiter), 276–295 km (Saturn),
28 km (Uranus) and 74 km (Neptune). If the app draws the planet at astronomy-engine's point and its
moons relative to that point, the geometry is exact as stored. If the app ever offsets the planet body
from the barycentre, apply the same offset to these tracks' centre. Pluto is the opposite case: its tracks use `@9`, which
matches `HelioVector(Body.Pluto)`, and Pluto's body is 2,132 km from it.

### Outside the precise span

Two-body errors against Horizons, taken from the fixture's `extrapolated` checkpoints:

| Body | −10 yr | −1 yr | +1 yr | +10 yr |
| --- | ---: | ---: | ---: | ---: |
| Ceres | 3.9 million km | 57,000 | 568,000 | 5.1 million |
| Vesta | 2.3 million | 96,000 | 150,000 | 2.3 million |
| TNOs (8 bodies) | 800–27,000 | 310–530 | 270–590 | 1,200–50,000 |
| Halley | 160,000 | 2,000 | 750 | 2.4 million |
| Encke | 10.2 million | 38,000 | 1.9 million | 7.4 million |
| 67P | 10.7 million | 71,000 | 89,000 | 26.5 million |
| Hale–Bopp | 18,000 | 430 | 305 | 1,350 |

These positions are plausible, not precise. Inner-system bodies drift fastest, because planetary
perturbations and the comets' outgassing are not modelled. There is no truth to compare against
after a spacecraft's data end. The fallbacks never stop: at years ±1 million and 1 billion Ceres still
moves 3.3–3.7 au a year along its ellipse (see "Regimes" for the limits).

## Known limits

- **Voyager 1 before 1981 and Voyager 2 before 1989-08-29** come from patched-conic
  *mission-design* trajectories. JPL calls their accuracy "rough". So the Voyager flybys of Jupiter,
  Saturn, Uranus and Neptune are design conics matched to encounter events, not reconstructions. They
  are fitted to 0.3 km, but their fidelity to where the spacecraft actually flew is JPL's, not ours.
  Horizons joins them to the 2022 refits with jumps of 65,180 km (Voyager 1) and 610 km (Voyager 2).
- **After 1992 the Voyagers are predictions.** They are refits of the 1981–1992 tracking data. JPL
  quotes ±1.7″ and ±4.7″ (RA) of pointing uncertainty on 2030-01-01.
- **Pioneer 10** is JPL's "historical" trajectory (pfile10.nio, merged PN10A–G on DE118). JPL
  says it is suitable for general historical purposes, not high precision. It contains seven position jumps of up
  to 126,500 km. Its Jupiter flyby geometry against modern satellite ephemerides may differ from the original
  solution.
- **Predictions**, none of them tracking reconstructions:
  - New Horizons after its tracking cut-off on 2026-07-20.
  - Parker Solar Probe after 2026-01-27. From 2026-06-17 it follows the reference planning trajectory.
  - JWST after 2026-09-20, following Goddard's station-keeping schedule to 2031-09-21.
  - Juno after 2026-09-23 (JPL's plan to September 2028), Europa Clipper after 2026-09-22 (the mission's planned
    cruise and tour to its Ganymede impact in September 2034), SOHO after 2026-08-26.
- **SOHO in 1998**: contact was lost from June to September; Horizons fills 1998-08-19 to 09-25 with a ballistic arc,
  and the trajectory steps by 25,790 km where that filler begins (a listed jump).
- **Comets and Arrokoth switch solutions with a jump.** At each switch the track steps from one JPL
  solution to the next, by 770–65,450 km (table under "Jumps"). That is the honest picture: JPL's
  solutions themselves disagree by that much there. The Encke, 67P and Halley JPL solutions include
  non-gravitational parameters; the SAO records do not.
- **Source jumps are kept.** The default output steps at every jump in Horizons' spacecraft data (up to
  126,500 km); `smoothJumps` hides them for display at the cost of accuracy inside the ramps.
- **Interstellar objects** far from their observed arcs rest on assumed non-gravitational
  accelerations. JPL itself warns about this for 1I. 3I/ATLAS is an early solution (arc to
  2026-02-19) and will be revised.
- **Accuracy is relative to Horizons.** It doesn't include the real uncertainty of JPL's orbits, which is far larger for
  Sedna or 3I than the 250 km fit.
- **Pluto (`@9`)** is the barycentre. See the barycentre note above.

## Sources and credits

| Data | Source | Licence / credit |
| --- | --- | --- |
| All positions and velocities | JPL Horizons On-Line Ephemeris System, https://ssd.jpl.nasa.gov/horizons/ (Giorgini et al. 1996, BAAS 28, 1158), queried 2026-09-25 | NASA/JPL-Caltech. US Government-funded data, freely usable with credit. |
| Small-body solutions | JPL Small-Body Database solutions as served by Horizons. Ceres JPL#48, Vesta JPL#36, Eris JPL#103, Haumea JPL#132, Makemake JPL#130, Gonggong JPL#25, Quaoar JPL#51, Sedna JPL#51, Orcus JPL#61, Arrokoth JPL#3, Halley JPL#75, Hale–Bopp JPL#226, 1I JPL#16, 2I JPL#54, 3I JPL#54, plus the comet apparition records listed under Method | NASA/JPL-Caltech |
| 1I/ʻOumuamua non-gravitational model | Micheli et al. 2018, Nature 559, 223, doi:10.1038/s41586-018-0254-4 | cited by JPL in the solution |
| Arrokoth flight-project ephemeris | New Horizons mission (SwRI/JHUAPL), NavSBE_2014MU69_od159, via Horizons | NASA/JHUAPL/SwRI |
| Voyager 1 and 2 | Voyager_1_ST+refit2022_m, Voyager_2_ST+refit2022_m (R. Jacobson, 2022 refit, DE440) via Horizons | NASA/JPL-Caltech |
| New Horizons | NH_merged (KinetX navigation; Pluto system per Brozović & Jacobson 2024, AJ) via Horizons | NASA/JHUAPL/SwRI |
| Pioneer 10 | pioneer_10_merged (PN10A–G, JPL Navigation) via Horizons | NASA/JPL-Caltech; NASA Ames |
| Parker Solar Probe | psp_merged (JHUAPL) via Horizons | NASA/JHUAPL |
| JWST | JWST_merged (Goddard Flight Dynamics Facility) via Horizons | NASA/GSFC |
| GM values (Sun, planetary systems) | DE440: Park et al. 2021, AJ 161, 105 | published constants |
| Barycentre and planet positions in the build (switch sizing, `ssb` edge states) | Astronomy Engine 2.1.19 by Don Cross, already a dependency | MIT |

Suggested row for `CREDITS.md`: `public/data/tracks.bin`, `public/data/tracks.json` — trajectories
fitted to [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (spacecraft ephemerides from
NASA/JPL, NASA/JHUAPL/SwRI and NASA/GSFC) — NASA/JPL-Caltech.

## Rebuilding and testing

```sh
node scripts/build-tracks.mjs                   # cached responses in data-raw/tracks/ are reused
node scripts/build-tracks.mjs --only=halley     # partial build, written to data-raw/tracks/partial/
npx vitest run src/sim/tracks.test.ts
```

The tests read `public/data/tracks.{json,bin}` and the fixture. Their coverage:

- Every Horizons checkpoint is within its bound, relative to the right centre. The checkpoints
  include random epochs, flyby-zone epochs, every closest approach, launch and end-of-data edges, both
  sides of every blend, and window edges.
- Regimes are labelled correctly outside the data.
- Extrapolation stays plausible where Horizons still has data.
- Halley's 2061-07-28 perihelion.
- C⁰/C¹ continuity at every segment join. Continuity across fit-to-extrapolation edges in the app
  frame.
- Both sides of every jump and solution switch, with the default output (`jump-side` checkpoints).
- Jumps: every listed jump sits on a flagged join; the default output keeps it exactly; `smoothJumps`
  is continuous, moves no position more than half the jump, stays inside its piece, and has a velocity
  that matches its position.
- Blend weights.
- Finite position and velocity at every finite time, including ±1e300 and ±`Number.MAX_VALUE` days.
- No freeze: extrapolated bodies keep moving at years ±30,000, ±1 million and ±1 billion; elliptic
  fallbacks stay on their ellipse; near-parabolic fallbacks (synthetic) stay finite and recede.
- The Kepler solvers, and budget and accuracy-table consistency.
