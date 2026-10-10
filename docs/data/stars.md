# 3D stars, star systems and constellations

What the star files contain, their byte layouts, frames and units, how every number was made, how accurate it is,
where it came from, and (§11) how the app uses them. §12 is the catalogue's extension: 3,421,099 more stars in band
files fetched as the camera goes, and 3,972 pinned stars appended to the core (3,754,841 stars in all). §13 is how stars
look up close, the extreme stars and the two nebulae drawn in 3D. §14–17 are stars in time: the Sun's life (and any star's
track) from the stellar-evolution formulae of Hurley, Pols & Tout (2000), the variable stars, and the journey that shows the constellations drifting.

| File | Size | What it is |
| --- | --- | --- |
| `public/data/stars3d.bin.gz` | 5,262,589 B (7,914,544 B raw) | 329,770 stars: 3D position, space velocity, absolute magnitude, temperature, quality flags |
| `public/data/stars3d-extra.bin.gz` | 641,325 B (989,374 B raw) | Per-star spectral type and constellation, for body cards (load lazily) |
| `public/data/star-names.json.gz` | 1,625,107 B | Proper names (IAU flagged), Bayer, Flamsteed, variable-star, Gliese, HR, HIP and HD designations of every star, the extension's included (§12.6); spectral-type and constellation dictionaries (load when search opens) |
| `public/data/constellations.json` | 50,461 B (14.7 kB gzipped by the host) | 88 IAU constellations; stick figures as polylines of `stars3d` indices |
| `src/sim/stars/systems.json` | 56,284 B | Alpha Centauri (A, B, Proxima), Sirius, Procyon, 61 Cygni and Capella as orbiting systems; the measured radius, temperature, luminosity and mass (whichever the papers give) of 38 stars, the Sun among them, each value with its reference |
| `src/sim/stars/*.ts` | | Decoders and evaluators (positions at any epoch, retarded positions for any observer, Kepler orbits, magnitudes, name search), the registry records and the loader, with their tests |
| `public/data/stars3d-bright.bin.gz` | 171,542 B (239,088 B raw) | The first 9,959 stars of `stars3d.bin.gz` (V ≤ 6.6), in the same layout: the sky for the first second |
| `public/data/stars3d-head.bin.gz` | 74,077 B | 3,972 pinned stars appended to the core in the app (indices 329,770–333,741): §12.4 |
| `public/data/stars3d-index.bin.gz` | 192,844 B | The extension's 1,074 band files and their 22,600 cells: §12.5 |
| `public/data/stars3d/NNNN.bin.gz` | 53,417,944 B in 1,074 files (median 32 kB, largest 252 kB) | The extension's 3,421,099 stars by absolute-magnitude band and place, in cells sorted by M_V: §12.5 |
| `scripts/build-stars3d-ext.mjs`, `scripts/star-ext-sources.mjs` | | The extension's build and its inputs (§12.8) |
| `scripts/build-stars3d.mjs`, `scripts/star-literature.mjs`, `scripts/build-constellations.mjs`, `scripts/build-stars3d-bright.mjs` | | Build scripts (Node 24) |
| `docs/data/stars-build-log.txt`, `docs/data/stars-tycho-calibration.json` | | Build diagnostics and the photometric calibration actually used |

Vercel serves `.gz` files as `application/gzip` without `Content-Encoding`, so the browser receives gzip bytes.
`fetchGzip(url)` in `src/sim/stars/catalogue.ts` checks for the gzip magic (1f 8b) and decompresses with
`DecompressionStream('gzip')`; if a host ever decodes it on the way (Content-Encoding: gzip), the bytes pass
through unchanged. `constellations.json` is plain JSON, which Vercel compresses itself.

---

## 1. Which stars, and why

**Catalogue: AT-HYG v4.0, "reduced m10" subset** (David Nash / astronexus; `athyg_40_reduced_m10.csv.gz`, 332,178 rows,
sha256 `a9ec5d515d1222d5bf86e8e84e762cbd325938cc6bd4b0d8760327386fa7c151`). AT-HYG is Tycho-2 (complete to V ≈ 11; Høg et al. 2000) merged with Gaia DR3
astrometry and the HYG catalogue's names and identifiers. The m10 subset is every AT-HYG star brighter than V = 10
(V for Hipparcos and Gliese stars, VT for Tycho-2 stars) plus every AT-HYG star within 100 light-years regardless of
brightness.

Why this subset: it is a clean, physical selection (magnitude-limited plus a local volume) rather than the mixed
selection of HYG (Hipparcos + Yale + Gliese); it keeps every naked-eye star and every star with a classical name
(of 317,175 AT-HYG stars with a proper, Bayer, Flamsteed, HIP, HD, HR or Gliese designation, only three proper names
fall outside it: Intan, Campbell's Hydrogen Star and the quasar 3C 273); and it fits the budget. The next subset
(to V = 11, 875,292 stars) would be about 14 MB.

What was removed or changed (all logged in `stars-build-log.txt`):

- The Sun (it is at the origin; the app already draws it).
- 2,406 stars with no usable distance: AT-HYG's "no distance" rows (Gaia parallax smaller than its error) and the
  89 HYG rows carrying HYG's 100,000 pc placeholder, unless the Hipparcos new reduction gives a parallax with at
  least 5σ significance (none did).
- One prominent star with no usable parallax, μ Sagittarii (Polis, V = 3.8, in the Sagittarius figure), is kept at
  an upper-limit distance and flagged (distance source 7, §4.2).
- One spurious row: Tycho-2 1472-1436-2, labelled "Arcturus B" in AT-HYG. A companion was suggested by Hipparcos and
  by Verhoelst et al. (2005, arXiv:astro-ph/0501669) but has not been confirmed, and Tycho photometry next to a V = −0.05 star is
  unreliable.
- One star whose poor parallax implied M_V < −10 (brighter than any known star) and which is not a prominent star.
- Added from the literature: TRAPPIST-1 (V = 18.8, too faint for Tycho-2), from its Gaia DR3 astrometry.

**Completeness.** The file is complete to V ≈ 10 as seen from the Sun. Beyond 100 light-years it is therefore a
magnitude-limited sample: a Sun-like star (M_V = 4.8) is included out to ~110 pc, a K giant (M_V ≈ 0.5) to ~800 pc,
an M dwarf (M_V ≈ 10–15) only within 1–10 pc. Inside 100 light-years it has what AT-HYG has, which is not
everything: 305 stars lie within 10 pc, where the census of Reylé et al. (2021, A&A 650, A201) lists 540 stars,
brown dwarfs and exoplanets in 339 systems. Missing are most brown dwarfs, many white dwarfs and a share of the
faintest M dwarfs. Counts by distance: 58 within 5 pc, 305 within 10, 1,779 within 20, 4,219 within 100 ly
(30.66 pc), 30,512 within 100 pc, 226,898 within 500 pc, 308,554 within 1 kpc; the farthest points are tens of kpc
away and have poor parallaxes (flagged). The extension (§12) fills in what this selection leaves out: the rest of
Tycho-2, every star of the Gaia Catalogue of Nearby Stars within 100 pc, and the Galaxy's luminous stars to several
kpc. With it, 377 stars lie within 10 pc, 301,430 within 100 pc, 1,384,420 within 500 pc, 2,255,044 within 1 kpc and
3,669,082 within 5 kpc.

---

## 2. Frames, epoch and units

- **Axes: J2000 ecliptic.** x toward the J2000 equinox, z toward the north ecliptic pole, right-handed. Obtained from
  ICRS by a rotation about x by the obliquity ε = 84381.448″ (IAU 1976; the value JPL uses for "ecliptic of J2000" and
  the app uses for its Solar System). The ~23 mas frame bias between ICRS and the dynamical J2000 equator is below the
  file's precision and is ignored.
- **App world axes** are world = (x_ecl, z_ecl, −y_ecl): `eclipticToWorld()` in `src/frames.ts`.
- **Origin: the Sun** (strictly the Solar System barycentre; the difference, < 0.01 au, is below float32 precision at
  parsec scale).
- **Epoch: J2000.0 (JD 2451545.0 TT)** for positions, for every star (AT-HYG rows that carried positions at other
  epochs are corrected, §4.1). Positions are **astrometric**: the direction light arrives from at J2000, placed at
  the parallax distance (moved to J2000 along the line of sight, §4.2). Where a star *is* at
  J2000 differs by v·d/c; see §6.
- **Units:** positions in parsecs (1 pc = 648000/π au, au = 149,597,870.7 km exactly); velocities in km/s,
  heliocentric; magnitudes in Johnson V; temperatures in kelvin; masses, radii and luminosities in the IAU 2015 B3
  nominal solar units (R☉ = 695,700 km, L☉ = 3.828 × 10²⁶ W, T☉ = 5,772 K). Times are Julian years (TT).

---

## 3. File formats

### 3.1 `stars3d.bin` (inside `stars3d.bin.gz`)

Little-endian. A 64-byte header, then five column sections. Each section starts at the byte offset given in the
header (4-byte aligned) and is **byte-shuffled**: for a column of n elements that are w bytes wide, byte k of element
i is stored at `offset + k·n + i`. (Shuffling puts the similar high-order bytes together and saves ~10% after gzip.)
Undo it with `out[i·w + k] = in[k·n + i]`, then view the result as the typed array.

| Offset | Type | Value |
| --- | --- | --- |
| 0 | char[4] | `LSS3` |
| 4 | uint16 | version = 1 |
| 6 | uint16 | header size = 64 |
| 8 | uint32 | N, number of stars (329,770) |
| 12 | float32 | epoch, Julian year = 2000.0 |
| 16 | float32 | velocity unit, km/s per int16 step = 0.1 |
| 20 | float32 | absolute-magnitude unit, mag per int16 step = 0.01 |
| 24 | uint32 | number of sections = 5 |
| 28 | uint32 × 5 | byte offset of each section |
| 48 | | zero padding to 64 |

| # | Column | Type × count | Content |
| --- | --- | --- | --- |
| 0 | position | float32 × 3N | x, y, z per star, pc, J2000 ecliptic, at J2000. Stored with 19 of 23 mantissa bits (rounded): ≤ 0.20″ direction error, ≤ 1 ppm distance error |
| 1 | velocity | int16 × 3N | vx, vy, vz per star × 0.1 km/s, same axes, heliocentric. 0 when unknown (flags) |
| 2 | absMag | int16 × N | M_V × 0.01 mag (Johnson V at the Sun, parallax distance, no extinction correction) |
| 3 | teff | uint16 × N | temperature in K, rounded to 10 K; 0 = unknown (671 stars) |
| 4 | flags | uint16 × N | see 3.2 |

Stars are sorted by apparent V as seen from the Sun at J2000, brightest first (index 0 is Sirius A). A renderer can
draw the first k stars for a cheaper sky. Decoded with `decodeStars3D()`; per-section gzip sizes: position 2.94 MB,
velocity 1.30 MB, absMag 0.37 MB, teff 0.49 MB, flags 0.17 MB.

### 3.2 Flags (uint16)

| Bits | Meaning |
| --- | --- |
| 0–2 | Distance source: 0 Gaia DR3 with per-star zero-point (318,230 stars); 1 Gaia DR3, zero-point extrapolated (G ≤ 6 or colour outside the recipe's range) or global (8,028); 2 Gaia DR2 + global zero-point (1,320, including ξ UMa A and B, §4.1); 3 Hipparcos new reduction (2,003); 4 Gliese–Jahreiß (170); 5 literature / system model, see `systems.json` (12); 6 other AT-HYG source (6); 7 no usable parallax, placed at the M_V = −10 upper limit (1: μ Sgr) |
| 3–4 | Distance precision σ_d/d: 0 < 1% (200,067); 1 1–5% (116,647); 2 5–20% (9,380); 3 ≥ 20% or unknown (3,676). Class 3 positions are indicative only (1/parallax is biased at low signal-to-noise); consider fading or hiding them |
| 5–6 | Velocity: 0 full 3D (290,974); 1 proper motion only, radial velocity unknown and set to 0 (38,771); 2 unknown, set to 0 (21); 3 rejected as implausible (> 1000 km/s heliocentric, the signature of a bad parallax), set to 0 (4) |
| 7 | Radial velocity from Gaia DR3 (282,366), with the recommended magnitude corrections |
| 8–9 | Temperature source: 0 Johnson B−V from ground-based photometry (36,581); 1 Tycho-2 BT−VT converted to B−V (292,309); 2 B−V of the spectral type's main-sequence value (177); 3 literature Teff from `systems.json`, or unknown when teff = 0 |
| 10 | Star has an entry in `systems.json` (orbit and/or literature parameters) |
| 11 | Gaia RUWE > 1.4: astrometry probably perturbed by an unresolved companion (65,114; common among bright stars) |
| 12 | V corrected for a companion inside Hipparcos' combined photometry (2,491, §4.3) |
| 13 | Variable star (Hipparcos variability flag or HYG variable designation; 10,921) |
| 14 | Added from the literature, not in AT-HYG (TRAPPIST-1) |
| 15 | V from Tycho-2 converted to Johnson; otherwise Johnson V from Hipparcos, Gliese or the literature |

Accessors are in `src/sim/stars/catalogue.ts` (`distanceSource`, `distancePrecision`, `velocityStatus`, …).

### 3.3 `stars3d-extra.bin` (inside `stars3d-extra.bin.gz`)

Same header layout with magic `LSX1` (floats unused) and two sections: uint16 × N byte-shuffled index into
`star-names.json` `spectralTypes` (0 = none; types are as printed in AT-HYG, mostly from the Tycho-2 Spectral Type
Catalog of Wright et al. 2003 and the HD), and uint8 × N (not shuffled) 1-based index into `constellations`
(the IAU constellation containing the star, from AT-HYG; 0 = unknown). Decoded with `decodeStars3DExtra()`.

### 3.4 `star-names.json` (inside `star-names.json.gz`)

```jsonc
{
  "format": "lightspeed.star-names", "version": 1, "count": 329770,
  "constellations": [["And", "Andromeda", "Andromedae"], …],   // 88, IAU abbreviation, name, genitive
  "spectralTypes": ["", "A1V", …],
  "proper":    [[starIndex, "Sirius", 1], …],     // 1 = on the IAU WGSN list, 0 = other (e.g. "Wolf 359")
  "bayer":     [[starIndex, "α", 0, "CMa"], …],   // Greek letter, superscript (0 = none), constellation
  "flamsteed": [[starIndex, 9, "CMa"], …],
  "variable":  [[starIndex, "V645 Cen"], …],
  "gliese":    [[starIndex, "244A"], …],          // as written in the Gliese–Jahreiß catalogue
  "hr":  { "indexDelta": [...], "id": [...] },    // star index = running sum of indexDelta
  "hip": { "indexDelta": [...], "id": [...] },
  "hd":  { "indexDelta": [...], "id": [...] }
}
```

Counts: 689 proper names (67 of them IAU names approved after AT-HYG v4.0 or on components, attached by HIP, HR, HD
or GJ number), 1,539 Bayer, 2,737 Flamsteed, 4,899 variable, 3,547 Gliese, 9,033 HR, 107,249 HIP and 225,225 HD
designations. The 65 IAU names without a catalogue star are exoplanet hosts fainter than V = 10, protostars, nebulae
and pulsars (listed in `stars-build-log.txt`). Gaia DR3 and Tycho-2 identifiers are not included (they would add ~3 MB).
System members also carry their system name ("Alpha Centauri A", "61 Cygni B", "Capella Aa", "TRAPPIST-1").

`buildNameTable()` in `src/sim/stars/names.ts` builds the search table (sorted keys for the names and designations, numeric columns for HR, HIP and HD): "sirius", "alpha canis majoris", "α CMa", "alp cma",
"9 CMa", "9 canis majoris", "HIP 32349", "HD 48915", "HR 2491", "GJ 244A", "V645 Cen"… and a display name per star
(IAU name first, then other proper names, Bayer, Flamsteed, variable, GJ, HR, HIP, HD).

### 3.5 `constellations.json`

```jsonc
{
  "format": "lightspeed.constellations", "version": 1, "catalogue": "stars3d.bin.gz",
  "match": { "vertices": 893, "failures": 0, "medianArcsec": 0.15, "maxArcsec": 30.56, "segments": 743 },
  "constellations": [
    { "abbr": "Ori", "name": "Orion", "genitive": "Orionis", "english": "Hunter", "rank": 1,
      "label": [ra, dec],                   // J2000 degrees, d3-celestial's label position
      "lines": [[i, i, i, …], …],           // polylines of stars3d indices
      "stars": [{ "i": 12, "hip": 27989, "name": "Betelgeuse", "v": 0.45 }, …] }
  ]
}
```

Every figure vertex of d3-celestial was resolved to a catalogue star by position (J2000, within 90″; among stars
within 15″ of the vertex the brightest is taken, so close pairs such as α Cen A/B or Dubhe A/B use the bright
component). All 893 vertices matched, median offset 0.15″ (the source gives 0.0001° coordinates); the largest
offsets (up to 31″) are high-proper-motion stars. Draw each polyline between the stars' 3D positions; from far away
the figures come apart, as they should. Serpens keeps its two parts as separate polylines.

One vertex is resolved by HIP number instead of position (`match.overrides` in the file): d3-celestial places the end
of the Canes Venatici line exactly on α¹ CVn (HIP 63121, V 5.6), 19.4″ from the star the figure means, Cor Caroli
(α² CVn, HIP 63125, V 2.9); in 3D the two are about 2 pc apart.

### 3.6 `systems.json`

```jsonc
{
  "format": "lightspeed.star-systems", "version": 1,
  "frame": "...", "epoch": "...", "orbitModel": "...", "refs": { "akeson2021": "Akeson R. et al. 2021, AJ 162, 14 …", … },
  "systems": [{
    "id": "alpha-centauri", "name": "Alpha Centauri", "note": "...",
    "members": ["alpha-cen-a", "alpha-cen-b", "proxima"],
    "barycentre": { "posPc": [x, y, z], "velKms": [vx, vy, vz], "distancePc": 1.3305522, "massMsun": 2.1101,
                    "astrometry": { …inputs as published… }, "refs": [...] },
    "orbits": [{
      "id": "alpha-cen-ab", "primary": ["alpha-cen-a"], "secondary": ["alpha-cen-b"],
      "massPrimaryMsun": 1.0788, "massSecondaryMsun": 0.9092,
      "aAu": 23.299, "e": 0.51947, "periodDays": 29133.07, "tPeriJD": 2435278.8,
      "pHat": [..], "qHat": [..],             // unit vectors, J2000 ecliptic: periastron direction and 90° ahead
      "eclipticAngles": { "iDeg", "OmegaDeg", "omegaDeg" },   // same orbit as classical angles w.r.t. the ecliptic
      "source": "published visual orbit",
      "published": { …the elements exactly as published, uncertainties, grade, refs… } }],
    "checks": ["…comparisons with independent measurements, see §4.7…"] }],
  "stars": [{ "id": "vega", "name": "Vega", "catalogueIndex": 4, "hip": 91262, "spectralType": "A0 V",
              "catalogueDistancePc": 7.6786, "radiusRsun": 2.726, "radiusPolarRsun": 2.418, "teffK": 9360,
              "teffPolarK": 10070, "teffEquatorK": 8910, "luminosityLsun": 47.2, "massMsun": 2.15,
              "refs": { "all": "monnier2012" }, "notes": "..." }, …]
}
```

Barycentres move in straight lines from J2000. **Orbit model:** each orbit links two groups of members. The relative
position of group 2 about group 1 is r = a[(cos E − e) p̂ + √(1−e²) sin E q̂], with E − e sin E = 2π(JD − tPeriJD)/P.
Members of group 1 move by −m₂/(m₁+m₂) r and members of group 2 by +m₁/(m₁+m₂) r; a member's position is the
barycentre plus the sum over its orbits. For Alpha Centauri this nests A–B inside (A+B)–Proxima. `systemMembersAt()`
in `src/sim/stars/orbits.ts` implements it; `orbitEllipse()` samples an orbit for drawing. The catalogue entries of members
(flag bit 10) hold the J2000 model position and the barycentre velocity, so a renderer that only moves catalogue
stars linearly still has them in the right place near J2000; replace them with the orbit model when available.

---

## 4. Methods

### 4.1 Positions

Right ascension and declination are AT-HYG's J2000 positions (Tycho-2 mean positions at epoch J2000, errors ~7 mas
for bright to ~60 mas for faint stars; Hipparcos positions where Tycho-2 had none), except for 1,623 stars whose
AT-HYG position is not a J2000 mean position: Tycho-2 "non-mean" positions (observed epoch ~1991; median error 0.26″)
and Gliese positions inherited from HYG (median error 5.2″, 432 stars off by more than 10″, and some grossly wrong —
GJ 94 by 31.6°, GJ 3885 by 15°, confirmed against SIMBAD). For these the Gaia DR3 position of the linked source is
moved to J2000 with its proper motion and radial velocity and used instead. 225 such stars have no Gaia link and keep
their AT-HYG position (most have Gliese distances, distance source 4).

**Hipparcos stars whose AT-HYG position is not a J2000 position.** Stars missing from Tycho-2 proper come into
AT-HYG from the Tycho-2 supplement, which carries the Hipparcos position at epoch **J1991.25**, and some positions
inherited from HYG (pos_src `HIP_X`) are off by up to several arcseconds. The first version of this catalogue kept
them, so Arcturus was 19.9″ from its J2000 position, Altair 5.8″, Pollux 5.5″, Vega 3.1″, and 20 of the 40 brightest
such stars were off by more than 1″. Now, for every star with a Hipparcos number, the Hipparcos new-reduction
position (epoch J1991.25) is carried to J2000 along the star's own 3D motion (its proper motion, distance and radial
velocity); wherever AT-HYG's position differs from that by more than 0.1″ the corrected position is used. That
applies to **4,493 stars**, 539 of which were at the Hipparcos epoch (the build log lists all brighter than V = 3.5).
Before choosing this rule it was checked against Gaia DR3 positions carried to J2000 for 2,480 of the affected stars
(G > 6, RUWE < 1.4): the Hipparcos-based positions agree with Gaia to 0.02″ (median; 90% within 0.09″ for the
J1991.25 group and within 0.37–0.44″ for the others), the AT-HYG positions to 0.05–0.8″
(median by group) with 90th percentiles of 0.7–4″.

**ξ Ursae Majoris (Alula Australis, a vertex of the Ursa Major figure).** AT-HYG gave A and B the same position
(Tycho-2's photocentre of the pair) and A the Gliese distance 10.42 pc while B had 8.73 pc; A also had no velocity and
no HIP number (HIP 55203 is the pair). Neither Hipparcos nor Gaia DR3 has a parallax for A, and Gaia DR3 gives both
stars two-parameter solutions only. Now both sit at B's Gaia DR2 parallax, 114.4867 ± 0.4316 mas (via SIMBAD) with
the DR2 zero-point, i.e. 8.732 pc (the pair's dynamical mass with the orbit below is then 2.9 M☉, as expected for two
G0 V spectroscopic binaries). Their J2000 positions split the Tycho-2 photocentre (169.54548201°, +31.52919433°;
Høg et al. 2000, flag "P") along the grade-1 orbit of the Sixth Orbit Catalog (Izmailov 2019, Astron. Lett. 45, 30: P = 59.8903 yr,
a = 2.50442″, i = 122.187°, Ω = 100.939°, T = 1935.17, e = 0.40432, ω = 126.964°) with B's V-band light fraction
0.393: they are 1.770″ apart at J2000. Both move with the pair's centre, so that straight-line motion keeps them
together: proper motion (−414.1, −556.9) mas/yr from the Tycho-2 photocentre at J2000 and the light-weighted centre
of the Gaia DR3 positions at J2016.0 (Tycho-2's own photocentre proper motion, biased by the 60-year orbit, differs
by ~50 mas/yr), radial velocity −18.2 km/s (Nordström et al. 2004, via SIMBAD). Carried to J2016.0 the model
reproduces Gaia DR3's positions of A and B to 0.01″ and their separation to 0.005″. A is findable as HIP 55203.
Uncertainty: ~0.3″ in position (photocentre versus centre of mass), ~20 mas/yr (0.8 km/s) in the motion.

Position = unit vector × distance, rotated to the ecliptic.

### 4.2 Distances

- **Gaia DR3** parallaxes (queried from the Gaia archive for the source ids AT-HYG links; AT-HYG's own distances are
  1/parallax with no zero-point correction) are corrected for the parallax zero-point of **Lindegren et al. (2021,
  A&A 649, A4)**: the Z₅/Z₆ functions of magnitude, colour (ν_eff or pseudocolour) and ecliptic latitude, coefficient
  tables of 2020-07-20 as in the reference implementation. Typical corrections for these stars are +0.02 to
  +0.04 mas. The recipe is defined for 6 < G < 21; for brighter stars its table edge is used and the star is flagged
  (distance source 1). Where the archive returned no row, or for solutions the recipe does not cover, the global
  offset −0.017 mas (the quasar median of Lindegren et al. 2021) is used (at most 107 stars).
- **Hipparcos instead of Gaia** when the Hipparcos new-reduction parallax (van Leeuwen 2007) has the smaller
  relative error (490 bright stars, where Gaia saturates).
- **Gaia DR2** distances (1,318, from AT-HYG) get the DR2 global zero-point −0.029 mas (Lindegren et al. 2018).
- **Hipparcos** distances listed by AT-HYG use the new reduction; where that failed (some binaries, e.g. β Phe) HYG's
  Hipparcos distance is kept; HYG's 100,000 pc placeholder is treated as "no parallax".
- Distance = 1/parallax. It is unbiased only for precise parallaxes; the precision class (bits 3–4) says when not.
- **Epoch:** parallaxes refer to J2016.0 (DR3), J2015.5 (DR2) or J1991.25 (Hipparcos). Where the radial velocity is
  known the distance is moved to J2000 along the line of sight (Barnard's Star +0.0018 pc; negligible elsewhere).
- **Implausible distances:** a star whose parallax is consistent with zero can come out more luminous than any
  star (M_V < −10). Prominent ones (V ≤ 4.5; only μ Sgr) are placed at the distance where M_V = −10, an upper limit,
  and flagged 7; others are dropped (1).

### 4.3 Photometry: V and B−V

**V:** the Hipparcos Catalogue V (ESA 1997, field H5; ground-based Johnson or derived from Hp) for Hipparcos stars,
unless that value was itself derived from Tycho photometry and Tycho-2 has usable photometry; otherwise Tycho-2 VT
converted to Johnson V; otherwise the Gliese V. **B−V:** Hipparcos B−V when it is ground-based Johnson photometry
(field H37 with source flag G); otherwise Tycho-2 BT−VT converted to Johnson B−V; otherwise the Hipparcos B−V (which
was derived from Tycho-1 photometry); otherwise Gliese; finally, for 177 stars with no colour at all, the B−V of the
spectral type's main-sequence value from Pecaut & Mamajek (2013, table v2022.04.16).

**Tycho-2 → Johnson.** Tycho BT and VT are not Johnson B and V. The conversion is empirical, calibrated in this build
on 28,059 single Hipparcos stars that have both Tycho-2 photometry and ground-based Johnson photometry (median B−V
and V−VT in 0.1-mag bins of BT−VT, linear interpolation; `stars-tycho-calibration.json`; scatter per bin 0.015–0.03 mag).
It replaces the linear ESA (1997) relation B−V = 0.850 (BT−VT), which against these data is biased by up to
−0.057 mag for F stars and +0.06 mag for M stars; V − VT agrees with the ESA relation −0.090 (BT−VT) to ~0.005 mag.
Tycho-2 photometry is not used for VT < 1.9, where it saturates.

**Combined light of close pairs.** Hipparcos often measured close doubles as one object, while AT-HYG (from Tycho-2 or
Gliese) also lists the companion. Where a Hipparcos star has companions without their own HIP number within 10″, their
flux is subtracted from the Hipparcos V (2,491 stars, flag bit 12). Examples: Castor A 1.58 → 1.93,
γ Vir (Porrima) 2.74 → 3.49, ζ¹ Aqr 3.65 → 4.35. For stars saturated in Tycho-2 the companion's Tycho photometry
is less reliable: Acrux A comes out 1.50, about 0.2 mag fainter than usually quoted.

**Absolute magnitude** M_V = V − 5 log₁₀(d / 10 pc), with no correction for interstellar extinction (see §7).

### 4.4 Temperature

Colour temperature from Johnson B−V with Ballesteros (2012, EPL 97, 34008),
T = 4600 [1/(0.92(B−V) + 1.7) + 1/(0.92(B−V) + 0.62)] with B−V clamped to [−0.4, 2.0] — the same function as
`bvToTemperature()` in `src/physics/blackbody.ts`, so the app's Doppler recolouring stays consistent. It is the
temperature of the blackbody with the star's colour, which is what a renderer needs. For the 38 stars in
`systems.json` with a measured effective temperature, that value replaces it (bits 8–9 = 3). Hot stars saturate in
B−V: an O star's colour temperature is ~20,000 K while its effective temperature is 30,000–45,000 K.

### 4.5 Velocities

Space velocity = radial velocity along the line of sight + 4.740470 (km/s)/(au/yr) × proper motion × distance, from
AT-HYG's proper motions (Gaia DR3 for 99%) and the corrected distance. AT-HYG rows whose proper motion has no
recorded source (pm_src "N"; mostly original Hipparcos values inherited from HYG, or a primary's values copied to its
companion) were first treated as having no velocity, which left 454 stars at rest, among them Castor A and B, Mintaka
A and B, γ Lup and β Phe. Now their proper motion comes from the Hipparcos new reduction where it has the star (309;
Castor −191.45, −145.19 mas/yr), else Gaia DR3 (3), else AT-HYG's unsourced value is kept (120; for Castor it would
have been the 1997 value −206.3, −148.2); 22 rows have no proper motion anywhere.

- **Radial velocities:** Gaia DR3 (282,342 stars) wherever the archive has one, including stars where AT-HYG had
  discarded it because its error exceeded its size. Corrections recommended by the Gaia team are applied: for
  rv_template_teff < 8500 K and grvs_mag ≥ 11, subtract 0.02755 g² − 0.55863 g + 2.81129 km/s (Katz et al. 2023,
  A&A 674, A5, eq. 5; 150 stars); for 8500 ≤ rv_template_teff ≤ 14500 K and 6 ≤ grvs_mag ≤ 12, use
  rv − 7.98 + 1.135 g (Blomme et al. 2023, A&A 674, A7; 25,429 stars). Otherwise AT-HYG's radial velocity from
  older compilations (via HYG); HYG's 0.0 placeholders are treated as unknown.
- Radial velocities are spectroscopic: they include each star's gravitational redshift and convective blueshift
  (+0.3 to +0.6 km/s for Sun-like stars, more for white dwarfs). The systems use corrected values where the papers
  give them.
- 38,771 stars have no radial velocity (flag), 21 no proper motion (at rest, flagged); 4 speeds above 1000 km/s
  were rejected.

### 4.6 Names

AT-HYG proper names (HYG, which follows the IAU list plus a few traditional names), Bayer (converted to Greek
letters with superscripts), Flamsteed, HR, HD, HIP and Gliese numbers; variable-star designations from HYG v4.4.
The IAU Working Group on Star Names list was read from exopla.net ("Modern IAU star names", maintained by the WGSN;
snapshot 2026-09-25, 640 names, latest approvals 2026-09-22) to flag IAU names and to attach the 67 newer ones.

### 4.7 Systems

| System | Orbit | Barycentre | Checks (in `systems.json` → `checks`) |
| --- | --- | --- | --- |
| Alpha Centauri A–B | Akeson et al. 2021, Table 8: P = 79.762 yr, a = 17.4930″ (23.30 au), e = 0.51947, i = 79.243°, Ω = 205.073°, ω = 231.519°, T = 1955.564, ϖ = 750.81 mas, M = 1.0788 + 0.9092 M☉ (ORB6 grade 2) | Akeson et al. 2021 Table 9 (J2019.5); RV −22.3796 km/s (their V₀) + 0.0614 km/s gravitational-redshift correction of Kervella et al. 2017 | ORB6 ephemeris 2025–2029 reproduced to ≤ 0.02° and ≤ 0.0013″; Hipparcos 1991.25 positions of A and B to 0.04″ and 0.11″ |
| Proxima – (A+B) | Osculating Kepler orbit from present-day data: Proxima's Gaia DR3 astrometry, the AB barycentre above, absolute RVs of Kervella et al. 2017 (−22.204 km/s for Proxima), M_P = 0.1221 M☉. Result: a = 8,042 au, e = 0.506, P = 496 kyr, now 12,061 au from AB near apastron, last periastron 230 kyr ago, next in 266 kyr; relative speed 279 m/s against 557 m/s escape speed | system barycentre includes Proxima | Kervella et al. 2017 (Table 3) published a = 8.7 (+0.7/−0.4) kau, e = 0.50, P = 547 (+66/−40) kyr with older parallaxes (747.17 mas for AB, 768.77 for Proxima); recomputing from their Table B.1 state vector reproduces their numbers exactly (a = 8,652 au, e = 0.496, P = 547 kyr), so the difference comes from Akeson et al.'s 0.49%-larger AB parallax. Both are listed; the model places Proxima exactly at its Gaia DR3 position in 2016 |
| Sirius A–B | Bond et al. 2017, Table 4: P = 50.1284 yr, a = 7.4957″, e = 0.59142, i = 136.336°, Ω = 45.400°, ω = 149.161°, T = 1994.5715; ϖ = 378.9 mas; M = 2.063 + 1.018 M☉ | Hipparcos (van Leeuwen 2007) orbital-binary solution of HIP 32349 at 1991.25 (the centre of mass, as used by Bond et al.); RV −8.47 km/s (gravitational-redshift corrected) | ORB6 ephemeris to ≤ 0.04°, ≤ 0.0007″. Gaia DR3 puts Sirius B 0.52″ from the model in 2016 and measures its proper motion 21 mas/yr different in declination; Gaia flags that source (RUWE 2.4, parallax 3σ from Bond's), so the Hipparcos centre of mass is kept |
| Procyon A–B | Bond et al. 2015, Table 8: P = 40.840 yr, a = 4.3075″, e = 0.39785, i = 31.408°, Ω = 100.683°, ω = 89.23°, T = 1968.076; ϖ = 285.0 mas; M = 1.478 + 0.592 M☉ | Hipparcos HIP 37279 orbital solution; RV −4.115 km/s (Irwin et al. 1992, as adopted by Bond et al.) | ORB6 to ≤ 0.05°; the HST measurements of 2013.0947 and 2014.7038 to 0.03° and 0.0014″ |
| 61 Cygni A–B | Shakht, Gorshanov & Vasilkova 2017 as listed in ORB6 (grade 4, **preliminary**): P = 664.37 ± 26.84 yr, a = 24.36″, e = 0.457, i = 53.29°, Ω = 174.88°, ω = 149.32°, T = 1700.37; masses 0.69 + 0.61 M☉ (models, Kervella et al. 2008) | mass-weighted Gaia DR3 astrometry of both stars (J2016.0) | Separation and position angle in 2016 against Gaia DR3: 31.576″/152.59° vs 31.593″/152.58°; relative velocity radial 1.48 vs 1.38 km/s, tangential 1.81 vs 1.82 km/s — the preliminary orbit and its node agree with Gaia. Kepler's law with this orbit gives 1.40 M☉ against 1.30 from models (within the orbit's ~10%) |
| Capella Aa–Ab | Torres et al. 2015, Table 1: P = 104.02128 d, a = 56.442 mas (0.74272 au), e = 0.00089, i = 137.156°, Ω = 40.522°, ω_A = 342.6° (relative orbit ω = 162.6°), T = HJD 2448147.6; M = 2.5687 + 2.4828 M☉ | Hipparcos position at 1991.25, Torres et al.'s proper motion, orbital parallax 75.994 mas and γ = +29.9387 km/s | ORB6 lists this orbit with ω = 342.6° as if it were the relative orbit's, so its ephemeris is exactly 180° from this model; the model uses ω_A + 180°, which reproduces Torres et al.'s radial-velocity curves. The wide pair Capella H–L is not modelled |

All visual-orbit comparisons with ORB6 use ORB6's conventions (Besselian epochs; position angles for the equinox of
date, 20.04″/yr · sin α · sec δ). Visual-orbit elements are converted to 3D with the Thiele–Innes constants in the
standard convention (x north, y east, z away from the observer; Ω is the node where the secondary recedes), then to
ecliptic unit vectors p̂, q̂. Decimal-year epochs are read as Julian years; the Besselian difference (< 1 day) is below
every quoted uncertainty.

### 4.8 Named stars (`systems.json` → `stars`)

Values are copied from the cited papers. Where a paper gives a limb-darkened angular diameter θ and bolometric flux F
instead (Heiter et al. 2015; Boyajian et al. 2013), the build derives R = θ/2 · d, L = 4πd²F and
Teff = (4F/σθ²)^¼ at the catalogue distance and records how (`derived`). Uncertainties are the papers'.

| Star | d (pc, catalogue) | Radius (R☉) | Teff (K) | L (L☉) | Mass (M☉) | Sources |
| --- | --- | --- | --- | --- | --- | --- |
| Sun | — | 1 | 5772 | 1 | 1 | IAU 2015 B3 |
| Alpha Centauri A | 1.3323 | 1.2175 ± 0.0055 | 5792 ± 16 | 1.5059 | 1.0788 | Akeson 2021; Heiter 2015 |
| Alpha Centauri B | 1.3324 | 0.8591 ± 0.0036 | 5231 ± 20 | 0.4981 | 0.9092 | Akeson 2021; Heiter 2015 |
| Proxima Centauri | 1.3023 | 0.1542 ± 0.0045 | 3042 ± 117 | — | 0.1221 | Kervella 2017 (Mann 2015 relations); Ségransan 2003 |
| Sirius A | 2.6392 | 1.7144 ± 0.009 | 9845 ± 64 | 24.74 | 2.063 | Bond 2017 |
| Sirius B | 2.6391 | 0.008098 | 25369 ± 46 | 0.02448 | 1.018 | Bond 2017 |
| Procyon A | 3.5087 | 2.033 | 6554 ± 84 | 6.87 | 1.478 | Bond 2015; Heiter 2015 (θ = 5.390 mas) |
| Procyon B | 3.5087 | 0.01232 | 7740 ± 50 | — | 0.592 | Bond 2015 |
| 61 Cygni A | 3.4977 | 0.6675 | 4374 ± 22 | 0.147 | 0.69 | Kervella 2008 (θ); Heiter 2015 |
| 61 Cygni B | 3.4974 | 0.5945 | 4044 ± 32 | 0.0852 | 0.61 | Kervella 2008 (θ); Heiter 2015 |
| Capella Aa | 13.159 | 11.98 ± 0.57 | 4970 ± 50 | 78.7 | 2.5687 | Torres 2015 |
| Capella Ab | 13.159 | 8.83 ± 0.33 | 5730 ± 60 | 72.7 | 2.4828 | Torres 2015 |
| Canopus | 94.79 | 73.3 ± 5.2 | 7657 ± 161 | 16,600 | 9.8 ± 1.8 | Domiciano de Souza 2021 |
| Arcturus | 11.257 | 25.48 | 4286 ± 30 | 170 ± 8 | 1.08 ± 0.06 | Heiter 2015 (θ); Ramírez & Allende Prieto 2011 |
| Vega | 7.679 | 2.726 eq., 2.418 pole | 9360 mean (10,070 pole, 8,910 eq.) | 47.2 ± 2.0 | 2.15 | Monnier 2012 |
| Rigel | 264.6 | — | — | 123,000 (adopted) | — | de Almeida 2022 |
| Betelgeuse | 152.7 | 764 (+116/−62) at 168 pc | 3600 ± 25 | — | 16.5–19 | Joyce 2020; Levesque & Massey 2020 |
| Altair | 5.129 | 2.029 eq., 1.634 pole | 8450 pole, 6860 eq. | — | 1.791 (model input) | Monnier 2007 |
| Aldebaran | 20.43 | 45.2 | 3927 ± 40 | 438 | 0.96 ± 0.41 | Heiter 2015 |
| Antares | 169.8 | 682 (±17% from distance) | 3660 ± 120 | 76,000 | 15 ± 5 | Ohnaka 2013 |
| Spica A (+ B) | 76.57 | 7.47 (3.74) | 25,300 (20,900) | — | 11.43 (7.21) | Tkachenko 2016 |
| Pollux | 10.358 | 8.89 | 4858 ± 60 | 39.6 | 2.3 ± 0.4 | Heiter 2015 |
| Fomalhaut | 7.704 | 1.842 ± 0.019 | 8590 ± 73 | 16.63 | 1.92 | Mamajek 2012 |
| Deneb | 432.9 | 203 ± 17 at 802 pc | 8525 ± 75 | 196,000 at 802 pc | 19 ± 3 | Schiller & Przybilla 2008 |
| Regulus | 24.31 | 4.21 eq., 3.22 pole | 14,520 pole, 11,010 eq. | 341 | 4.15 | Che 2011 |
| Polaris | 132.6 | 46.27 at 136.9 pc | — | — | 5.13 ± 0.28 | Evans 2024 |
| Tau Ceti | 3.650 | 0.791 | 5414 ± 21 | 0.484 | 0.783 ± 0.012 | Heiter 2015; Teixeira 2009 |
| Epsilon Eridani | 3.219 | 0.736 | 5076 ± 30 | 0.324 | 0.80 | Heiter 2015 |
| 51 Pegasi | 15.52 | 1.143 | 5749 (derived) | 1.29 | — | Boyajian 2013 (θ, F) |
| HR 8799 | 40.81 | 1.44 ± 0.06 | 7193 ± 87 | 5.05 | 1.516 | Baines 2012 |
| Barnard's Star | 1.8299 | 0.178 ± 0.011 | 3278 ± 51 | 0.00329 | 0.163 | Ribas 2018 |
| Wolf 359 | 2.408 | 0.1348 | 2818 ± 60 | — | 0.0997 | Mann 2015 |
| Lalande 21185 | 2.547 | 0.389 | 3563 ± 60 | — | 0.386 | Mann 2015 |
| Ross 128 | 3.375 | 0.1967 | 3192 ± 60 | — | 0.168 | Mann 2015 |
| Luyten's Star | 3.785 | 0.315 | 3317 ± 60 | — | 0.283 | Mann 2015 |
| Gliese 581 | 6.299 | 0.311 | 3395 ± 60 | — | 0.292 | Mann 2015 |
| Lacaille 9352 | 3.288 | 0.468 | 3688 ± 86 | — | 0.495 | Mann 2015 |
| TRAPPIST-1 | 12.468 | 0.1192 ± 0.0013 | 2566 ± 26 | 0.000553 | 0.0898 | Agol 2021 |

Rigel's and Polaris's temperatures, and Altair's and Regulus's mean temperatures, are not given because no source was
verified for this file; the catalogue colour temperature applies to them.

---

## 5. Evaluator code (`src/sim/stars`)

| Module | Main exports |
| --- | --- |
| `catalogue.ts` | `decodeStars3D`, `decodeStars3DExtra`, `fetchGzip`, `gunzipIfNeeded`, flag enums and accessors |
| `motion.ts` | `positionSeenFromSun(stars, i, jy)`, `positionAt(stars, i, jy)` (coordinate position), `positionSeenFrom(stars, i, observer, jy)` (retarded position, exact for linear motion), `positionsSeenFromSun` (bulk), `closestApproachToSun`, `motionQuality` |
| `photometry.ts` | `distanceModulus`, `apparentMagnitude`, `apparentMagnitudeFrom(stars, i, observer, jy)`, `sunApparentMagnitudeFrom(observer)` (M_V☉ = 4.81, Willmer 2018), `bolometricCorrection` (Flower 1996 as corrected by Torres 2010), `luminosityFromAbsMag`, `radiusFromLuminosity` |
| `orbits.ts` | `solveKepler`, `orbitRelativeState`, `barycentreAt`, `systemMembersAt`, `systemMembersAtCoordinateTime`, `systemMembersSeenFrom`, `orbitEllipse`, types for `systems.json` |
| `names.ts` | `buildNameTable`, `findStar`, `searchStars`, `starLabels`, `starDisplayName`, `catalogueNumber`, `normalizeName` |
| `frames.ts`, `constants.ts` | frame rotations (`eclipticToWorld` etc.), sky bases, units and epochs |
| `cells.ts`, `extension.ts`, `extensionLoad.ts`, `catalogueDecode.ts`, `workerClient.ts` | the catalogue's extension (§12): cells and their prefixes, the index and band-file decoders, the loader, the head's decoding in the worker, the worker's client |
| `records.ts`, `facts.ts`, `load.ts`, `worker.ts`, `nearby.ts`, `constellations.ts`, `visibility.ts` | the app's side: registry records and providers, facts with sources, loading in a worker, nearby-star promotion, constellation segments, the near-Sun draw counts (§11) |

Run the tests with `npx vitest run src/sim/stars` (they read the shipped files). They check, among
other things: Sirius first at 2.639 pc; ecliptic axes (Polaris 0.736° from the celestial pole); agreement with the
existing `stars.bin` directions for the 100 brightest stars; Hipparcos V of eight bright stars reproduced from the
Sun; the Sun at V ≈ 0.4 from α Cen; α Cen A at V ≈ −6.8 from Proxima; Barnard's Star's closest approach (1.157 pc in
9,711 yr); Gliese 710 passing 0.071 pc (14,700 au) from the Sun in 1.29 Myr (flagged beyond the ±1 Myr validity;
Berski & Dybczyński 2016 found 13,366 au in 1.35 Myr from Gaia DR1); the ORB6 ephemerides and HST measurements
above; Proxima at its Gaia position; the Kepler solver to 10⁻¹² for e ≤ 0.99; name lookups; every constellation
vertex a naked-eye catalogue star. The code type-checks under the app's compiler settings (strict,
`verbatimModuleSyntax`, `noUnusedLocals`).

**GPU use.** Upload `positions` (float32 × 3) and `velocitiesInt16` (int16 × 3, un-normalised) and move stars in the
vertex shader: `p = position + velocity * 0.1 * (t − 2000) * 1.0227121650537077e-6` (pc). In float32 this is exact
enough for |t − 2000| ≤ 1 Myr (displacements ≤ ~1 kpc). For a floating origin subtract the camera position (in
float64 on the CPU) from the star's position before converting to float32.

---

## 6. Time: epochs and light travel

- **Linear motion** from J2000: r(t) = r₀ + v (t − 2000). Validity about ±1 Myr: after 1 Myr the Galactic tide has
  moved a star 100 pc away by only ~0.04 pc relative to the straight line (tidal acceleration ≈ Ω² r with
  Ω ≈ 26 km/s/kpc), less than the effect of a 1 km/s velocity error (≈ 1 pc per Myr). Beyond that the errors grow quadratically (Bailer-Jones 2015, A&A 575, A35, shows linear motion
  biases encounter predictions over Myr timescales). `motionQuality()` returns `beyond-validity` past ±1 Myr and
  warns for stars without radial velocity (their line-of-sight motion is missing: typically 20–30 pc of error per Myr).
- **What you see vs. where it is.** The catalogue gives where each star *appears* at J2000. Its light left d/c
  earlier, so its actual position at J2000 is r₀ + v·d/c: 0.0046 pc for Arcturus, ~0.2 pc for a fast star 1 kpc
  away. `positionAt()` gives the actual (coordinate) position; `positionSeenFrom(observer, t)` solves
  |r(t_e) − observer| = c (t − t_e) exactly for linear motion, which is what an observer at rest at that point sees
  (the ship's own aberration and Doppler shift are applied by the app on top). From the Sun at J2000 it returns the
  catalogue position. The systems have the same three views (`systemMembersAt`, `…AtCoordinateTime`, `…SeenFrom`).

---

## 7. Accuracy and known limits

- **Directions:** ≤ 0.2″ storage error on top of the catalogue's 0.007–0.06″. Exception: 225 stars with Gliese
  positions and no Gaia link keep HYG's positions, which can be several arcseconds off (§4.1). Checked after the
  rebuild against SIMBAD's J2000 positions for all 505 stars brighter than V = 4 with a HIP number: median 0.054″,
  90th percentile 0.15″, 99th 0.46″. The three largest differences, α Cen B 2.0″, Sirius 1.5″ and Procyon 1.2″, are
  orbiting-system members whose positions here come from their orbits; SIMBAD carries their 1991 Hipparcos positions
  forward in a straight line, which the orbital motion invalidates.
- **Distances:** 61% of stars better than 1%, 96% better than 5% (Gaia DR3 formal errors). Systematic: the
  zero-point recipe is thought to over-correct stars brighter than G ≈ 11 by roughly 0.01–0.015 mas (checks with
  Cepheids and asteroseismic giants: Riess et al. 2021, arXiv:2012.08534; Zinn 2021, AJ 161, arXiv:2101.07252,
  who finds 15 ± 3 µas for G ≲ 10.8): distances of such stars may be ~1.5% too short per kpc. 3,678 stars (1.1%) have ≥ 20% or unknown errors; they include the
  farthest points (tens of kpc), which are not real distances.
- **Uncertain distances of famous stars** (the catalogue keeps the measured parallax; alternatives in `systems.json`):
  Betelgeuse — Hipparcos 6.55 ± 0.83 mas (153 pc), Harper et al. (2017) 222 (+48/−34) pc, Joyce et al. (2020)
  168 (+27/−15) pc from seismology; its radius scales with whichever is adopted. Deneb — Hipparcos 433 pc versus
  802 ± 66 pc from its association (Schiller & Przybilla 2008). Rigel — 265 pc (Hipparcos), luminosity uncertain.
  Polaris — 133 pc (Hipparcos) versus 136.90 ± 0.34 pc (Gaia DR3 parallax of its bound companion Polaris B with the
  Lindegren offset, used by Evans et al. 2024). μ Sgr —
  no usable parallax (upper-limit placement). Antares — Hipparcos 5.89 ± 1.00 mas (170, +35/−25 pc).
- **Magnitudes:** V to 0.01–0.02 mag for Hipparcos stars, 0.02–0.1 mag for Tycho-2 stars (VT errors grow toward
  V = 10); split pairs ±0.2 mag. Variable stars have catalogue mean values (Betelgeuse 0.0–1.6, Mira 2–10).
- **Temperatures:** colour temperatures; ±100–200 K for FGK stars from the B−V errors, plus the difference between
  colour and effective temperature (large for O/B stars and cool giants).
- **No interstellar extinction** anywhere: every magnitude and colour is as seen from the Sun, with the dust in
  between (the cards say so for stars beyond 100 pc). Seen from the Sun the catalogue is exact by construction;
  approached closely, a star that is dimmed by dust (typically 0.5–1 mag per kpc in the disc, more in the arms) will
  look too faint and too red. The extension (§12) reaches 2–8 kpc, where this shows most.
- **Binaries:** most unresolved pairs are one point (RUWE flag marks 65,114 stars whose astrometry suggests a
  companion). Only the five systems above are modelled with orbits.
- **Brown dwarfs, white dwarfs, faint M dwarfs:** within 100 pc now as complete as Gaia makes them (GCNS, §12);
  brown dwarfs later than about L5 without a measured V are left out (100 of the 10-pc census's objects).
- **Radial-velocity zero point:** spectroscopic velocities include gravitational redshift and convective shifts
  (≲ 0.6 km/s for main-sequence stars).
- **ξ UMa A and B:** see §4.1 (position ~0.3″, motion ~0.8 km/s).
- **61 Cygni** orbit is preliminary; positions more than a few decades from now are uncertain by several percent of
  the orbit. **Sirius:** Gaia DR3 disagrees with the model's centre of mass by 0.5″ (discussed in §4.7).
- **Proxima's orbit** depends strongly on the α Cen AB parallax (5σ disagreements between published values); the
  period is 496 kyr with present data and 547 kyr in Kervella et al. (2017).

---

## 8. Sources and licences

| Input | Use | Licence / terms |
| --- | --- | --- |
| AT-HYG v4.0, subset `athyg_40_reduced_m10` (David Nash, astronexus; https://codeberg.org/astronexus/athyg) | Star list, positions, identifiers, names, proper motions, Tycho photometry, spectral types, constellations | **CC BY-SA 4.0** (verified in the repository's LICENSE and README). Share-alike applies to the derived files; see "Licence of the derived files" below |
| Gaia DR3 (ESA/Gaia/DPAC; Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1), `gaiadr3.gaia_source` columns queried from https://gea.esac.esa.int/tap-server/tap for the AT-HYG source ids | Parallaxes and errors, zero-point inputs, radial velocities, RUWE, positions of 1,623 stars | **CC BY-NC 3.0 IGO** (https://www.cosmos.esa.int/web/gaia-users/license): free to use with credit to ESA/Gaia/DPAC, non-commercial. The raw query result is not shipped; the shipped files contain values derived from it (as AT-HYG itself does) |
| Hipparcos Catalogue (ESA 1997, SP-1200; VizieR I/239) and Hipparcos new reduction (van Leeuwen 2007, A&A 474, 653; VizieR I/311), via CDS | V, B−V and their source flags; parallaxes and errors; positions (J1991.25) and proper motions for the 4,493 corrected positions and 309 filled proper motions | ESA mission data, free with acknowledgement; retrieved through VizieR (CDS, Strasbourg), which asks for acknowledgement |
| Tycho-2 (Høg et al. 2000, A&A 355, L27; VizieR I/259) and SIMBAD (Wenger et al. 2000) | ξ UMa: Tycho-2 photocentre position; B's Gaia DR2 parallax and the systemic radial velocity of Nordström et al. (2004, A&A 418, 989) as listed by SIMBAD | Catalogue values quoted with citation; CDS asks for acknowledgement |
| HYG v4.4 (astronexus, https://codeberg.org/astronexus/hyg) | Variable-star designations | CC BY-SA 4.0 |
| IAU WGSN star names, "Modern IAU star names" at https://exopla.net/star-names/modern-iau-star-names/ (maintained for the WGSN; snapshot 2026-09-25) | Which names are IAU-approved; names approved after AT-HYG v4.0 | Names are facts; the IAU asks users to cite https://www.iau.org/public/themes/naming_stars/ . No etymology text is copied |
| Pecaut & Mamajek (2013, ApJS 208, 9), table "A Modern Mean Dwarf Stellar Color and Effective Temperature Sequence" v2022.04.16 (E. Mamajek) | B−V from spectral type for 177 stars | Numbers from a published table, cited as the author requests |
| Lindegren et al. (2021, A&A 649, A4) Tables 9–10 (via the reference code `gaiadr3_zeropoint`, LGPL-3.0; only the published coefficients were reimplemented, the code is not shipped) | Parallax zero-point | Published coefficients |
| Katz et al. (2023, A&A 674, A5); Blomme et al. (2023, A&A 674, A7) | RV corrections | Published formulas |
| d3-celestial (Olaf Frohn), `data/constellations.lines.json`, `data/constellations.json`, https://github.com/ofrohn/d3-celestial | Constellation figures, names, genitives, English meanings, label positions | **BSD 3-Clause** (verified: repository LICENSE, GitHub licence metadata). Figures after the IAU/Sky & Telescope charts with modifications by Frohn. The copyright notice must be reproduced (below) |
| Sixth Catalog of Orbits of Visual Binary Stars (Hartkopf, Mason, Matson et al.; https://www.astro.gsu.edu/wds/orb6.html), orbits and ephemerides retrieved 2026-09-25 | 61 Cygni orbit listing; ξ UMa AB orbit (Izmailov 2019, Astron. Lett. 45, 30, as listed in ORB6); test ephemerides | Catalogue of published orbits; each orbit is credited to its paper |
| Papers in `systems.json` → `refs` (Akeson 2021; Kervella 2016, 2017, 2008; Bond 2015, 2017; Irwin 1992; Shakht 2017; Torres 2015; Heiter 2015; Mann 2015 via VizieR J/ApJ/804/64; Ségransan 2003; Monnier 2007, 2012; Che 2011; Joyce 2020; Levesque & Massey 2020; Harper 2017; Ohnaka 2013; Schiller & Przybilla 2008; Mamajek 2012; Ramírez & Allende Prieto 2011; Tkachenko 2016; Domiciano de Souza 2021; Evans 2024; de Almeida 2022; Teixeira 2009; Ribas 2018; Agol 2021; Costa 2006; Boyajian 2013 via VizieR J/ApJ/771/40; Baines 2012; Soubiran 2018; IAU 2015 B3) | Orbits, barycentres, stellar parameters | Facts from the literature, cited per value |
| AT-HYG v4.0, the whole catalogue (`athyg_40.csv.gz`) | The extension's Tycho-2 stars (§12) | **CC BY-SA 4.0**, as above |
| Gaia Catalogue of Nearby Stars (Gaia Collaboration, Smart et al. 2021, A&A 649, A6; CDS J/A+A/649/A6) | The extension's stars within 100 pc | Gaia data, **CC BY-NC 3.0 IGO**; cite the paper and ESA/Gaia/DPAC |
| The 10 parsec sample (Reylé et al. 2021, A&A 650, A201, update of 2023; CDS J/A+A/650/A201) | Nearby objects Gaia lacks | Values from the literature; cite the paper |
| Zari et al. (2021, A&A 650, A112; CDS J/A+A/650/A112), filtered sample | Which luminous hot stars to include | The selection is the authors'; values are Gaia DR3 |
| Hunt & Reffert (2023, A&A 673, A114; VizieR J/A+A/673/A114) | Which open-cluster members to include | CC BY 4.0 article; values are Gaia DR3 |
| NASA Exoplanet Archive hosts with Gaia DR3 ids (`gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz`, cached by the exoplanet build) | Every planet host pinned in the head | As the exoplanet files |
| Riello et al. (2021, A&A 649, A3), Table C.2 | V from Gaia G and BP−RP | Published formula |
| Ballesteros (2012, EPL 97, 34008) | B−V → temperature | Published formula |
| Willmer (2018, ApJS 236, 47) | M_V of the Sun = 4.81 | Published value |

d3-celestial notice (required by its licence for redistribution):

> Copyright (c) 2015, Olaf Frohn. All rights reserved. Redistribution and use in source and binary forms, with or
> without modification, are permitted provided that the following conditions are met: 1. Redistributions of source
> code must retain the above copyright notice, this list of conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the
> following disclaimer in the documentation and/or other materials provided with the distribution. 3. Neither the
> name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived
> from this software without specific prior written permission. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS
> AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
> WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
> HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
> (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
> BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
> TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
> POSSIBILITY OF SUCH DAMAGE.

Gaia acknowledgement (as ESA requests): "This work has made use of data from the European Space Agency (ESA) mission
Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC,
https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been provided by national
institutions, in particular the institutions participating in the Gaia Multilateral Agreement."

### Licence of the derived files

`stars3d.bin.gz`, `stars3d-extra.bin.gz` and `star-names.json.gz` combine two licences that must both be honoured:

- AT-HYG v4.0 is **CC BY-SA 4.0**: credit David Nash (astronexus), indicate changes, and share adaptations under
  the same licence.
- The files also contain values derived from Gaia DR3 (distances, radial velocities, positions), and ESA states on
  https://www.cosmos.esa.int/web/gaia-users/license (checked 25 September 2026) that "Gaia data are distributed under
  the CC BY-NC 3.0 IGO license": credit ESA/Gaia/DPAC, **non-commercial use only**.

CC BY-SA forbids adding restrictions and CC BY-NC forbids commercial use, so the two cannot be merged into a single
licence, and the files cannot be offered under CC BY-SA 4.0 alone (the first version of this document said they
could; that was wrong). What is permitted, and what the CREDITS row below says: the files may be used and shared
**non-commercially**, with credit to AT-HYG/David Nash and to ESA/Gaia/DPAC, and adaptations must keep the same
terms. Skyfold is non-commercial, so it can ship them. Any commercial reuse would need ESA's permission for the
Gaia-derived values (AT-HYG itself redistributes Gaia DR3 values and carries the same tension). Hipparcos, Tycho-2 and
SIMBAD values are ESA/CDS data free with acknowledgement and add no further restriction.

### Rows to add to `CREDITS.md`

| Files | Source | Licence |
| --- | --- | --- |
| `public/data/stars3d.bin.gz`, `public/data/stars3d-bright.bin.gz`, `public/data/stars3d-extra.bin.gz`, `public/data/stars3d-head.bin.gz`, `public/data/stars3d-index.bin.gz`, `public/data/stars3d/*.bin.gz`, `public/data/star-names.json.gz` | Derived from [AT-HYG v4.0](https://codeberg.org/astronexus/athyg) by David Nash (astronexus), with distances, motions and photometry from [Gaia DR3](https://www.cosmos.esa.int/gaia) (ESA/Gaia/DPAC), the Gaia Catalogue of Nearby Stars (Gaia Collaboration, Smart et al. 2021), the 10 parsec sample (Reylé et al. 2021), the luminous hot stars of Zari et al. (2021), the open-cluster members of Hunt & Reffert (2023) and the exoplanet hosts of the NASA Exoplanet Archive, photometry and parallaxes from the Hipparcos Catalogue (ESA 1997) and its new reduction (van Leeuwen 2007) via [VizieR](https://vizier.cds.unistra.fr/) (CDS, Strasbourg), variable-star names from [HYG v4.4](https://codeberg.org/astronexus/hyg), and the [IAU list of star names](https://www.iau.org/public/themes/naming_stars/) | Non-commercial use only. The AT-HYG content is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (credit David Nash / astronexus; share alike); the Gaia DR3-derived values are [CC BY-NC 3.0 IGO](https://www.cosmos.esa.int/web/gaia-users/license) (credit ESA/Gaia/DPAC; non-commercial). Both sets of terms apply to these files, so they may be shared and adapted only non-commercially, with both credits, under the same terms. |
| `public/data/constellations.json` | Constellation figures and names from [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (after the IAU / Sky & Telescope charts), linked to the stars above | [BSD 3-Clause](https://github.com/ofrohn/d3-celestial/blob/master/LICENSE), Copyright (c) 2015, Olaf Frohn |
| `src/sim/stars/systems.json` (star systems and named-star parameters) | Compiled for Skyfold from the papers cited in the file (orbits: Akeson et al. 2021, Bond et al. 2015 and 2017, Shakht et al. 2017, Torres et al. 2015; Proxima: Kervella et al. 2017 and Gaia DR3) | Values from the literature, each with its reference; the Proxima state uses Gaia DR3 (ESA/Gaia/DPAC, CC BY-NC 3.0 IGO) |

Add to the "Other sources used by the code" list: the Gaia DR3 parallax zero-point of Lindegren et al. (2021) and
radial-velocity corrections of Katz et al. (2023) and Blomme et al. (2023); the Sixth Catalog of Orbits of Visual
Binary Stars (USNO/GSU) for checks; Pecaut & Mamajek (2013) for colours of spectral types.

---

## 9. Rebuilding

```
node scripts/build-stars3d.mjs --fetch   # downloads missing inputs into data-raw/ (never re-downloads)
node scripts/build-stars3d.mjs           # writes stars3d*.bin.gz, star-names.json.gz, src/sim/stars/systems.json
node scripts/build-constellations.mjs    # after the above: writes public/data/constellations.json
node scripts/build-stars3d-bright.mjs    # after the above: writes public/data/stars3d-bright.bin.gz
node --max-old-space-size=10000 scripts/build-stars3d-ext.mjs --fetch   # the extension (§12.8)
node scripts/build-faint-stars.mjs       # the faint stars' glow, which counts the extension's stars to V = 11
npx vitest run src/sim/stars
```

Inputs in `data-raw/` (sha256):

| File | sha256 | Origin |
| --- | --- | --- |
| `athyg_40_reduced_m10.csv.gz` | a9ec5d515d1222d5bf86e8e84e762cbd325938cc6bd4b0d8760327386fa7c151 | Codeberg LFS, astronexus/athyg `data/subsets/` |
| `gaia_dr3_athyg40_m10.csv.gz` | 70ae87957619dbb88c0aefa3bdbeaf35b4c88731f04846942691b2ee2f6b92dd | Gaia archive TAP, 329,938 rows, 5,000 ids per request, columns in the script |
| `gaia_dr3_positions_athyg40_m10.csv.gz` | 9c01327d86d64c3a584941f32ceca2624736d12bdb88442b036cbf668ac6b0e0 | Gaia archive TAP: positions for the 1,678 Gaia-linked stars with non-mean AT-HYG positions |
| `hip1_phot.csv.gz` | 5b4abab2ab97145a5b02d063c3844c5a721be5f635bbedd0472ab237e61daa42 | VizieR I/239: HIP, Vmag, r_Vmag, B−V, e_B−V, r_B−V, VarFlag, MultFlag |
| `hip2_plx.csv.gz` | d7dd83dce22bfba5a7c7baad1002fb4d258b4b1b0d2497f13687082484251470 | VizieR I/311: HIP, Plx, e_Plx, pmRA, pmDE, Hpmag |
| `hip2_pos.csv.gz` | 59b25398cffd1b7fa5ddeb4058e1d2619bc9cae4d09a463515d8f8cea76f397c | VizieR I/311: HIP, RArad, DErad (epoch J1991.25), pmRA, pmDE; 117,955 rows (added 25 September 2026) |
| `hyg_v44.csv.gz` | 00b349893b9a53106dd488d8371e8d2fa586043e500bb3cdb8bff3931682197d | HYG v4.4 (https://codeberg.org/astronexus/hyg) |
| `exopla_modern_iau_star_names_2026-09-25.html` | 7484ecee58c1af9e4b3c2a576fee4fad46a3a1f62d9722a6bb043bcaf54c65d8 | exopla.net snapshot |
| `EEM_dwarf_UBVIJHK_colors_Teff.txt` | 1de2edeec17bb3346e0e4e70b999de5ee29947df38474e64cddb7cfacc164b7f | E. Mamajek, v2022.04.16 |
| `d3celestial_constellations.lines.json` | 294f66bef5d5cf50b1e17f16d2efa1d97a15131612c68dd935adef6e7373e13c | d3-celestial master |
| `d3celestial_constellations.json` | ab4ae692027cbc042c0d6791a84456a65eb7c55656107fd00c58ff6e55d4d8b2 | d3-celestial master |
| `d3celestial_LICENSE`, `orb6orbits_2026-09-25.txt`, `orb6ephem_2026-09-25.txt` | | licence text; ORB6 (reference and test values, and the ξ UMa orbit) |

The build takes about 80 s and is deterministic. `build-stars3d.mjs` reads `d3celestial_constellations.json` for constellation
names; `build-constellations.mjs` must run after it because star indices depend on the sort order.

---

## 10. Changes after the independent verification (25 September 2026)

A check against SIMBAD, VizieR and the cited papers confirmed the file layouts, the ecliptic rotation, the distances
and velocities, the visual orbits against the Sixth Orbit Catalog and every other constellation vertex, and found
the following, all fixed here (details in the sections named):

1. **Epoch of positions (§4.1).** Stars from the Tycho-2 supplement carried their Hipparcos J1991.25 positions
   (Arcturus 19.9″ off, Altair 5.8″, Pollux 5.5″, Vega 3.1″), and some HYG-derived positions were off by several
   arcseconds. 4,493 positions are now the Hipparcos new reduction carried to J2000; bright stars agree with
   SIMBAD's J2000 positions to 0.054″ (median). New cached input: `data-raw/hip2_pos.csv.gz`.
2. **Zero velocities (§4.5).** 454 stars had no velocity because AT-HYG gives their proper motion no source; 21
   remain (309 filled from Hipparcos, 3 from Gaia DR3, 120 keep AT-HYG's value). Castor now moves.
3. **ξ UMa A (§4.1).** Was 1.7 pc behind its companion, at the same sky position, without a velocity or HIP number.
4. **Canes Venatici (§3.5).** The figure now ends on Cor Caroli (α² CVn), not its faint companion α¹ CVn.
5. **Licence (§8).** The files cannot be released under CC BY-SA 4.0 alone because they contain Gaia-derived
   values (CC BY-NC 3.0 IGO); the CREDITS row now says non-commercial use, with both credits.

---

## 11. In the app

**Loading** (`src/sim/stars/load.ts`, `worker.ts`). Once the first frames are up, a worker fetches, decompresses
(DecompressionStream) and decodes `stars3d-bright.bin.gz` (the 9,959 stars to V = 6.6, 172 kB), then
`stars3d.bin.gz` with `stars3d-head.bin.gz` appended (the pinned stars, §12.4; the head's cells are made then too,
about 0.2 s in the worker); the typed arrays come back without copying. The subset is the head of the full file, so
the swap changes nothing on screen. The extension's index and band files follow as the camera goes (§12.5). `constellations.json` follows the subset (its figures use naked-eye stars only).
`star-names.json.gz` is fetched and indexed in the worker when "Where to?" first opens (or a star needs a name),
and `stars3d-extra.bin.gz` when a catalogue star is registered or its data sheet opens.

**Drawing** (`src/scene/Starfield.tsx`, `src/render/shaders/stars.vert.glsl`). One draw call for all stars. The
attributes are the file's own arrays: positions (float32 pc), velocities (int16, un-normalised), M_V (int16) and
temperature (uint16). Per vertex: the star's place at the date (§6: its J2000 place carried for t − 2000 plus the
light-time |r0|/c, i.e. where it is), relative to the camera, which comes as two float32s (hi + lo) so the
difference keeps its precision far from the Sun; with the light-time correction on (View menu), where the camera
sees it (first order in v/c); then its apparent magnitude M_V + 5 log10(d / 10 pc), its blackbody colour, and the
ship's exact aberration and Doppler shift (`relativity.glsl`), as for every point source. Stars fade out over
V = 6.0–7.0, the eye's limit (`STAR_MAG_LIMIT` = 6.5), so the sky from Earth keeps the look of the 8,920 naked-eye
stars it had before (the tests compare the magnitude and colour histograms and the 100 brightest positions with a
fixture of the old catalogue). Fainter stars appear as you approach them. Beyond ±1 Myr from J2000 the stars stand
still (and the registered ones say their positions are illustrative). No dust: see §7.

Near the Sun only the head of the file can pass that cut, so the draw call stops there (`visibility.ts`): the
worker bounds, for every star, how bright it could be from anywhere within 0.05 pc of the Sun within 1,000 (or
3,000) years of J2000, with the shader's own motion and light-time, and keeps the index after the last one that
could show (15,977 stars for ±1,000 years, 16,189 for ±3,000). What is drawn is exactly what drawing all 329,770
shows; the draw call takes 0.2 ms instead of 1.3 ms a frame on an Intel Xe laptop. The tests check the counts
against the shader's arithmetic from points 0.05 pc out in every direction.

Where no first stretch will do, the worker also keeps lists of the only stars that can show, in catalogue order
(`starDrawLists`), which the star field draws through an index (`Starfield.tsx`), so what is drawn is again exactly
what drawing them all shows. Away from the Sun: a star can be seen from r parsecs out only if
r < p + v (10⁶ yr + p / c) + d / (1 − v / c), p its distance from the Sun, v its speed and d its reach (the shader moves
a star by at most a million years, and draws it where its light left it, at most v/c of the distance nearer); the lists
for 500 pc, 1, 2, 4 and 8 kpc hold 174,832, 54,282, 7,892, 1,218 and 101 stars. Near the Sun once the stars stand still
(a million years or more from 2000, where the clock goes to watch the universe expand): each star is where the shader
holds it, and 15,549 (before) and 15,729 (after) can show. The lists take 34 ms in the worker and 1 MB, and replace a
26 ms pass over the catalogue that the star field used to make on the main thread when it arrived (the test of whether
any star at all shows from outside the Milky Way). GPU time on the Intel Xe laptop: at Earth billions of years ahead
or behind 1 to 2 ms less a frame; at the Carina Nebula (2.3 kpc) 1 ms less; at Sgr A* 0.7 to 0.9 ms less. Between 0.05 pc
and 500 pc from the Sun, and in the relativistic view (beaming brightens faint stars ahead), the head is now drawn
through its cells (§12.7) wherever they draw fewer stars than these (all 333,742 before; 19,000–30,000 now); in
the split view the classical half draws the short lists too. The tests check the lists against the shader's
arithmetic from their distances in four directions, and from 0.05 pc out while the stars stand still, with and
without the light-time correction.

**Bodies** (`records.ts`). The five systems are registered as barycentres (`<system>-barycentre`, in straight-line
motion) with their stars on the Kepler orbits of `systems.json`, one barycentre per inner pair
(`alpha-centauri-ab-barycentre`), so each star's orbit line is drawn about the right centre. The 26 other named
stars of `systems.json` move in straight lines from their catalogue row. Ids follow the articles' targets:
`alpha-centauri-a`, `alpha-centauri-b`, `proxima` (the built-in record is replaced, keeping its detector and
aliases), `sirius` (Sirius A) and `sirius-b`, `procyon`, `procyon-b`, `61-cygni` (61 Cygni A), `61-cygni-b`,
`capella` (Capella Aa), `capella-ab`, and the `systems.json` ids for the rest. A star registered as a body hides
its point in the star field (its magnitude attribute is set to a sentinel); the registry draws it instead: a point
of light at the same magnitude and colour, and a limb-darkened blackbody sphere once it is more than a pixel wide.

- *Orbits and light-time.* Published orbits are fitted to what Earth sees, so their times are times of observation.
  A star's provider evaluates each orbit at t + D(t)/c, D the pair's distance from the Sun at t (the system's
  barycentre in straight-line motion, plus the pair's offset from it: 369 au for Alpha Centauri A and B). With the
  light-time correction the stars then appear from the Sun exactly on their published orbits (a test checks
  Alpha Centauri A–B against the model to 10⁻⁴ of their separation).
- *Sizes.* The literature radius where `systems.json` has one (the mean radius of a fast rotator, which is drawn as
  a sphere), else √L (T☉/T)² from the literature luminosity, or from M_V with the bolometric correction of Flower
  (1996) as corrected by Torres (2010, Table 1; M_bol☉ = 4.73 with it), clamped to 3,100–50,000 K. Estimates are
  marked "≈" on the card and "(estimate)" on the data sheet, with a model note. Checked on Sirius A: the estimate
  from its catalogue M_V is within 2% of Bond et al. (2017).
- *Cards.* `BodyRecord.star` carries the spectral type, temperature (measured, or the colour temperature),
  luminosity, radius, mass, M_V, V from the Sun, the distance with its source and precision class, the designations
  and the constellation; `facts.ts` gives the named stars two or three facts each, with the paper's DOI.
- *Spectral types that contradict the star.* 64 of the 9,890 typed stars to V = 6.6 carry a catalogue type two or more
  classes from their colour temperature, or a dwarf class for a star far too luminous for one: often the companion's
  type given to the primary (Dubhe "F7V comp", Almach "B8V"), or a cross-match slip (Bunda "K0 III" at 8,360 K, the
  carbon star 19 Psc "F8/G0 V"). The card leaves such a type out and says so (`plausibleSpectralType` in
  `records.ts`); supergiants and bright giants may be up to three classes cooler than their type (dust reddens
  them). The file itself is unchanged; fixing the type at its source (the component split of the build) would need
  a rebuild.
- *Companions with no colour.* 13 stars among the first 20,000 (12 to V = 6.6: Mintaka B, Hadar B, Algieba B, Avior B,
  Sargas B …) have `teff = 0`, their light having been split from their primary's. The loader gives each the
  temperature of the star within 0.005 pc it pairs with (`borrowCompanionTemperatures` in `catalogue.ts`, in the
  worker), instead of the Sun's 5,772 K, and the card says the temperature is borrowed. A companion can differ
  from its primary (Avior B is a hot B star beside a cool giant): the pair's colour is only the best measure the
  catalogue has.
- *Nearby stars* (`nearby.ts`). The catalogue is scanned 40,000 stars a frame, and the extension's loaded files
  through the cells whose box comes within 0.1 pc; a star within 0.1 pc (about 20,000 au) of the camera is registered (`star-<index>`, named from the names table) so it is placed in float64
  and drawn as a sphere; past 0.15 pc it is released, unless it is the focus, the selection or a flight's
  destination. Stars found by search become bodies the same way when chosen.

**Search** (`src/content/starDestinations.ts`). "Where to?" searches the names table as you type (proper names,
Bayer, Flamsteed, variable-star and Gliese designations by prefix; HR, HIP and HD numbers exactly), after the
registry's own matches. A star that is a body already comes back as that body; a star of the extension is registered
once its band file has arrived (a fraction of a second).

**Constellations** (`src/scene/Constellations.tsx`, `src/ui/ConstellationNames.tsx`). Each figure segment is cut
into twelve pieces along the straight 3D segment between its two stars, each drawn at its true place, so figures
stay right however close you come, and are aberrated like the stars in flight. A segment stretched over more than
40° of sky (seen from far from the Sun, or from beside one of its stars) fades out by 90°: it no longer outlines
anything. From the Sun the longest segment is 25.6° (in Carina), so every figure is whole from Earth. A name fades
when its figure's stars no longer gather on the sky (the length of the mean of their unit vectors below 0.8). Names sit at the mean direction of each figure's stars (near the
Sun, d3-celestial's own label place). They show from 0.2 pc from the Sun on ('auto'); the View menu and the Y key
turn them on or off for good; `sky-from:<star>` turns them on.

**The sky from a star.** `sky-from:<star>` puts the camera beside the star on the Sun's side (100 radii or 1 au,
whichever is larger), looking back at the Sun, which is labelled "Sun (home)" once the Solar System is under a pixel.

---

## 12. The catalogue's extension

3,425,071 stars beyond the 329,770 above (3,754,841 in all), chosen as the stars that matter most to an explorer:
the rest of the Tycho-2 sky, every known star within 100 pc, the Galaxy's luminous stars to several kiloparsecs,
the members of the nearby open clusters and every exoplanet host. The core file is not touched: its stars keep their
indices, names, figures, systems and lists. 3,972 of the new stars are pinned to the core (the head, loaded with it);
the rest are in 1,074 band files that are fetched as the camera comes near them.

### 12.1 Which stars

| Group | Source | Rule | New stars |
| --- | --- | --- | --- |
| The Tycho-2 sky | AT-HYG v4.0, the rows beyond the core (2,226,476) | a usable parallax; distance error under 20% unless the star has a name or an HD, HIP or Gliese number (20,185 dropped); not implausibly luminous | 2,181,093 |
| Every known star within 100 pc | Gaia Catalogue of Nearby Stars (Gaia Collaboration, Smart et al. 2021): its 300,567 objects with a median distance ≤ 100 pc | parallax/error ≥ 5 after the zero-point (§4.2) | 249,488 (16,287 of them white dwarf candidates) |
| … and what Gaia lacks | The 10 parsec sample (Reylé et al. 2021): 456 stars and brown dwarfs | a V measured or tabulated for its type (brown dwarfs later than about L5 have none: 100 left out) | 16 |
| Young luminous stars | Zari et al. (2021), filtered sample (417,535 OBA stars chosen with colours dust does not change) | parallax/error ≥ 5 | 302,952 |
| Luminous stars to 5–8 kpc | Gaia DR3: M_G < 0 as seen from the Sun within 5 kpc, or M_G < −1 with parallax/error ≥ 10 within 8 kpc; all with parallax/error ≥ 5 and RUWE < 1.4 (883,627 rows) | as for the others | 589,901 |
| Open-cluster members | Hunt & Reffert (2023): members with probability ≥ 0.7 of the 1,603 open clusters within 1 kpc (119,326) | parallax/error ≥ 5 | 99,068 (the Pleiades gain 439, Praesepe 345, α Persei 273) |
| Exoplanet hosts | The 4,413 hosts of the NASA Exoplanet Archive with Gaia DR3 astrometry (`data-raw/gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz`) | any positive parallax | 2,550 (and 863 found in the groups above; all pinned) |
| Black-hole companions | The visible stars of Gaia BH1, BH2 and BH3 | any positive parallax | 3 (pinned) |

Why these: measured as the share of the naked-eye sky (G < 6.5 from the viewpoint, every Gaia DR3 star with
parallax/error ≥ 3 as the truth) that the catalogue holds, the core alone holds 98.6% of it 100 pc from the Sun but
80% at the Orion Nebula, 33% at Cygnus X (1.4 kpc), 15% at the Carina Nebula (2.3 kpc) and 7% 3 kpc toward the inner
Galaxy; with the extension 99.7%, 91%, 86%, 64% and 57%. The Tycho-2 sky is the big step out to 2 kpc, the Gaia
luminous stars fill 2–4 kpc, and the hot stars trace the spiral arms (chosen by colours dust does not change, so the
reddened ones of the arms are in); GCNS adds nothing to distant views but completes the neighbourhood (the nearest
stars, red and white dwarfs, Roam's pace, search). What is still missing far away is mostly cluster members fainter
than Tycho-2 in crowded, nebulous fields.

Duplicates (each rule counted in `stars-ext-build-log.txt`): by Gaia DR3 source id against AT-HYG's links and between
the groups (the first group keeps a star); by position for new Gaia stars brighter than V = 12.5 from the Sun: within
3″ (plus 16 years of proper motion) of a catalogue star with V within 1.5 mag it is the same star under another id and
is dropped (817), a fainter neighbour is kept as a resolved companion (origin bit 0x40); and any new star brighter than
V = 7.52 from the Sun is dropped as a probable duplicate (6: Tycho-2 is complete far fainter). 1,045 AT-HYG rows repeat
a Gaia id already used; 24,152 have no usable parallax.

### 12.2 Values

As the core's (§4), with these differences:

- **Positions:** where Gaia DR3 has the star, its J2016.0 place carried back to J2000 along the star's own motion
  (Gaia's positions are better than Tycho-2's at these magnitudes); otherwise AT-HYG's J2000 place.
- **Distances:** Gaia DR3 parallaxes with the Lindegren et al. (2021) zero-point (§4.2); Hipparcos where more
  precise; a Gaia DR2 distance (from AT-HYG) only for designated stars without any other.
- **V and colour:** for AT-HYG stars fainter than V_T = 10.5, where Tycho-2's photometry grows noisy, V from Gaia G and
  BP−RP (Riello et al. 2021, Table C.2; for BP−RP > 2.75 the G−V of the Pecaut & Mamajek dwarf sequence) and B−V
  from BP−RP, calibrated in the build on 538,862 AT-HYG stars with 10 < V_T < 11 (the median Tycho-2 B−V per 0.05 mag
  of BP−RP, 81 knots; beyond them the dwarf sequence). Where Gaia's V and Tycho-2's differ by 0.75 mag or more (35,123
  stars: the linked Gaia source is a blend or a neighbour) Tycho-2's are kept. On 208,475 stars with 9 < V_T < 10.5, V
  from Tycho-2 minus V from Gaia: median −0.006 mag, MAD 0.044. Hipparcos V only where it agrees with the Tycho-2 star
  to 1 mag (a faint companion can carry its primary's HIP number). Gaia-only stars take V and B−V from Gaia; 2,058
  GCNS stars without BP/RP from G and 2MASS Ks along the dwarf sequence, 3,398 others without a colour get V = G and
  no temperature (flagged).
- **Dust:** as in the core, every magnitude and colour is as seen from the Sun, with the dust in between (§7).
- **Velocities:** Gaia DR3 radial velocities with the Katz and Blomme corrections (§4.5), else GCNS's adopted one,
  else AT-HYG's.
- **Flags:** as §3.2 (bit 14: not in AT-HYG); what they have no room for is in the origin byte (§12.3).

### 12.3 The origin byte

Low 4 bits, the group: 0 core, 1 AT-HYG, 2 GCNS, 3 10-pc census, 4 Zari et al., 5 Gaia luminous, 6 cluster member,
7 exoplanet host, 8 black-hole companion. Bits: 0x10 V from Gaia photometry, 0x20 colour from Gaia BP−RP, 0x40 a
fainter star within 3″ of a brighter catalogue star (its light may be in that star's V too), 0x80 GCNS white dwarf
candidate (probability > 0.5). `originText` in `catalogue.ts` puts it into words for the card's data line.

### 12.4 The head: `stars3d-head.bin.gz`

3,972 stars in the core's LSS3 layout (§3.1) plus three sections: origin (uint8), spectral type (uint16, index into
`star-names.json`'s `spectralTypes`, byte-shuffled) and constellation (uint8, as `stars3d-extra.bin`). The worker
appends them to the core (`appendStars3D`), so they are stars 329,770–333,741 of `starData.stars`, sorted by V from
the Sun. They are every exoplanet host of the groups above (3,413), so the exoplanet module's matcher finds them among
the catalogue's stars as it always has; the 16 census objects; the 227 Gliese-numbered AT-HYG stars; the 3 black-hole
companions (`blackholes.json` points at them: the build writes their indices there); and the 315 new stars that can be
seen from within 0.05 pc of the Sun at some date within ±1 Myr (the closest approach of each star's straight-line
path, the shader's light-time allowance and 0.5 mag of margin), so the Sun's sky at any date needs no band file. None
of them can be seen from near the Sun within ±3,000 years, so the near-Sun counts (§11) are unchanged (a test checks
it).

### 12.5 Band files and their index

**Band files** `stars3d/NNNN.bin.gz` (magic `LSB1`, the core's 64-byte header layout): the stars of one
absolute-magnitude band in one region. Bands of M_V: below −3, −3 to 0, 0 to 3, 3 to 6, 6 to 9, 9 and fainter (a
band's stars reach from the camera over at most a factor 4 in distance). Regions: an octree over each band's stars with
at most 16,384 stars a leaf (a file); inside each file an octree with at most 512 stars a leaf (a **cell**), each cell
sorted by M_V, brightest first. Sections: the cells' star counts (uint16), then positions (float32, 19-bit mantissa
as §3.1), velocities (int16 × 0.1 km/s), M_V (int16 × 0.01, delta-coded within each cell: the first absolute, then the
differences), temperature (uint16), flags (uint16), all byte-shuffled; origin (uint8); spectral type (uint16,
shuffled); constellation (uint8; 0 for Gaia-only stars). `decodeBandFile` (`extension.ts`) decodes one and works out
its cells' boxes (§12.7). The global index of a file's star k is the file's base + k.

| Band (M_V) | Stars | Files | Bytes |
| --- | --- | --- | --- |
| below −3 | 521 | 1 | 11,271 |
| −3 to 0 | 302,577 | 118 | 4,834,732 |
| 0 to 3 | 1,798,922 | 520 | 28,156,006 |
| 3 to 6 | 963,199 | 284 | 15,015,676 |
| 6 to 9 | 83,006 | 42 | 1,291,994 |
| 9 and fainter | 272,874 | 109 | 4,108,265 |
| all | 3,421,099 | 1,074 (22,600 cells) | 53,417,944 (15.6 B a star; median file 32 kB, largest 252 kB) |

**Index** `stars3d-index.bin.gz` (magic `LSI1`, a 128-byte header: at 8 the number of files, at 24 the number of
sections and from 28 their offsets, at 72 the head's star count, at 76 the total, at 80 the number of cells, at 84 the
core's count). Sections: per file its base index, star count, cell count and gzipped size (uint32, shuffled), band
(uint8), brightest M_V (int16 × 0.01, rounded down), fastest star (float32, km/s) and three boxes (float32 × 18,
rounded outward: lo x y z, hi x y z at J2000 with each star's light-time motion, then at +1 Myr and −1 Myr); per cell,
files in order, its brightest M_V (int16 × 0.01, rounded down), star count (uint16) and box at J2000, quantised outward
to 8 bits a coordinate inside its file's box (uint8 × 6). `decodeStarIndex` checks that the counts add up.

**Loading** (`extensionLoad.ts`): nothing while the camera is within 0.05 pc of the Sun (the head holds every star
that can be seen there at any date). Elsewhere the index is fetched once, then each file one of whose cells passes
M_min + 5 log10(d_min / 10 pc) < 7.02 + 0.5 (the shader's cut and a prefetch margin), d_min the distance to the cell's
box at the date (the index's J2000 box grown by the file's fastest star's travel; beyond 20,000 years from 2000 the
file's own boxes, exact at any date), or one of whose cells lies within 2 pc of the camera (so nearby promotion and
Roam's nearest star see every star around). Brightest first, four at a time; the loader looks again when the camera
has moved 0.2% of its distance from the Sun, or every 30 frames. Beyond 1,500,000 loaded stars the files least
recently needed are dropped. A search or a flight that asks for a star fetches its file (`ensureCatalogueStar`).
In the app, reached in turn: 15 files (62,118 stars) at Sirius, 34 (194,000) at the Orion Nebula, 55 (292,000) at
Carina. Modelled before the build: arriving anywhere in the disc within 3 kpc needs 0.8–2.6 MB (median 0.9); a flight
from the Sun to Carina about 9 MB in all.

### 12.6 Names

`star-names.json.gz` holds the core's entries as before (`coreCount` 329,770, `coreSpectralTypes`), then the new
stars' HD, HIP and Gliese numbers, HYG's variable-star names and the census objects' names (349,825 HD, 117,705 HIP,
3,774 Gliese and 5,729 variable names in all); `count` is 3,754,841. Search finds them as it finds the core's (§11);
an extension star becomes a body once its file has arrived.

### 12.7 Drawing: cells

`cells.ts`. Every star of a cell is at least as far from the camera as the nearest point of the cell's box, so of a
cell sorted by M_V only the first stars, those with M_V ≤ cut − 5 log10(d_min / 10 pc), can pass the shader's cut
(the eye's limit + 0.52, raised by any brightening): the rest are never drawn, and what is drawn is exactly what
drawing all of them shows. The box moves with the date as the shader moves the stars: with linear motion each
coordinate at a date is the same blend of its values at J2000 and at ±1 Myr, so the box at any date lies within the
same blend of the two boxes (exact bounds from three boxes a cell); d_min is shrunk by the cell's fastest v/c for the
light-time correction from the camera. The tests check, by the shader's own arithmetic, that no star that shows from
eight places (the Sun to the Galactic Centre) at five dates (to ±3 Myr), with and without the light-time correction
and with the cut raised by 3 mag, is left out, over the head and over band files of every band.

- **The head** has cells too (2,345, built in the worker, about 0.2 s): the star field draws through them where they
  draw fewer stars than the near-Sun stretch, a far list or all of them (§11). From 0.05 to 500 pc from the Sun that
  was every star, 333,742; now 19,000–30,000. Not while a black hole's lens is drawn (its order-0 list merges with the
  plain lists).
- **Each loaded band file** is one points object with the star material and its lensed variant (primary images are
  exact; near a hole each cell's cut is raised by the magnification bound at the cell's least angle from the lens axis
  and by the Doppler and gravity bound, as in the shader's pre-cull). Far-side images (orders 1–3) come from the head
  only.
- **Index buffers** are made again only when a cell's count changes (two per catalogue, one for each half of the split
  view).
- **Budget:** 600,000 stars a frame at most (about 2.3 ms of vertex work on the target laptop; a half and a third of
  that on the GPU-time controller's lower lens rungs). Over it, the cut is lowered by the same amount for every cell
  until the draws fit: the faintest brightened stars go first. At rest it is never approached.

Stars drawn a frame (head + extension) and the star field's GPU time on the target laptop (Intel Graphics, ANGLE
D3D11, 2,048 × 1,320 at pixel ratio 2, no multisampling; whole frames with and without the star field, interleaved,
`__ls.perf.ab`, 7 rounds, spreads 0.1–0.9 ms), before (the core drawn as before the cells) and now:

| Camera | Drawn before | Drawn now | GPU before | GPU now |
| --- | --- | --- | --- | --- |
| Earth | 15,977 | 15,977 + 0 | 0.05 ms | 0.05 ms |
| Sirius (2.6 pc) | 333,742 (all) | 29,811 + 2,500 | 0.49 ms | 0.06 ms |
| Orion Nebula (380 pc) | 333,742 (all) | 19,780 + 9,267 | 0.30 ms | 0.17 ms |
| Carina Nebula (2.2 kpc) | 7,970 | 7,970 + 12,351 | 0.18 ms | 0.20 ms |
| 3 kpc toward l = 30° | 7,970 | 7,970 + 4,097 | ~0 | ~0 |
| Flying from the Sun toward Carina at 0.999c (rapidity 3.8) | up to 333,742 | 280,000–320,000 + 100,000–170,000 | | under the budget |

### 12.8 Rebuilding

```
node --max-old-space-size=10000 scripts/build-stars3d-ext.mjs --fetch   # after build-stars3d.mjs; about 5 minutes
node scripts/build-faint-stars.mjs
npx vitest run src/sim/stars src/sim/galaxy/faintStars.test.ts src/sim/blackholes
```

`--fetch` downloads what is missing (resumably): the whole AT-HYG from Codeberg LFS, the CDS tables, Hunt & Reffert's
members through TAPVizieR, Gaia DR3 columns for every candidate by IN lists of 5,000 ids (592 queries, about an hour),
and the luminous stars in 48 slices of the sky by source id (synchronous queries of a few seconds each: the archive's
asynchronous jobs could wait in its queue for hours). The build needs the core's outputs (`stars3d.bin.gz`,
`star-names.json.gz`, `stars-tycho-calibration.json`); it writes the head, the index, the band files (the old ones
removed first), the names file (the core's entries as they are; an earlier extension stripped first), the black-hole
companions' indices in `src/sim/blackholes/blackholes.json` and `stars-ext-build-log.txt`. It is deterministic and
needs about 4 GB of memory.

| Input (`data-raw/`) | Bytes | sha256 | Origin |
| --- | --- | --- | --- |
| `athyg_40.csv.gz` | 199,688,001 | 69ad04dd33d7c7bb4f5e1b4682798075811547ea9fb8d0e802e5b319c46818a6 | AT-HYG v4.0, Codeberg LFS `data/athyg_40.csv.gz` |
| `gcns_table1c.dat.gz` | 75,193,892 | 299f7c15025780df96d5f73fc299e89c81b76fe3de2231981d92ffde11f20ab1 | CDS J/A+A/649/A6 |
| `reyle2021_tablea1.dat.gz` | 78,205 | 934d2af754d2792ca1142fd63233b7292c2374c5fc6144167337f3d36746216c | CDS J/A+A/650/A201 (update of 2023-08-25) |
| `zari2021_filtered.dat.gz` | 78,176,297 | eaeda2661771eef8c3a4633147ac5d1e259c40b84b5a744f6784401ef6129971 | CDS J/A+A/650/A112 |
| `hr23_members_1kpc.csv.gz` | 3,454,779 | ff328d554b9a9b83b84195916931c7a7b6f047b9506b1b08bbb3238208885516 | TAPVizieR, J/A+A/673/A114 members joined to clusters (the query is in `star-ext-sources.mjs`) |
| `gaia_dr3_luminous.csv.gz` | 93,790,084 | 7f5cbb43d0b1e04f6737cad6d1d7c20257b06d7bc2991accfb9c1a494575f80d | Gaia archive, 883,627 rows |
| `gaia_dr3_ext_columns.csv.gz` | 306,952,342 | c6319613a8b68aa49e68e075a7b766c5136d933cbd092c5993ac3184f77678a5 | Gaia archive, 2,958,229 rows (several gzip members) |

Licences and credits: §8 (the new sources add citations, not restrictions; everything stays non-commercial, with the
AT-HYG and Gaia credits). VizieR asks for: "This research has made use of the VizieR catalogue access tool, CDS,
Strasbourg Astronomical Observatory, France (DOI: 10.26093/cds/vizier)."

### 12.9 Known limits

- Every magnitude and colour is as seen from the Sun (§7): a reddened star 2 kpc away stays faint and yellow when flown
  to.
- Parallaxes far away: at 0.2 mas a 0.015 mas zero-point residual is 7.5% of the distance, and 1/ϖ at parallax/error 5
  is biased by about 4%; the precision class says so.
- Tycho-2 is incomplete in crowded, nebulous fields; only the Gaia groups fill those.
- A resolved companion's light may also be inside the Tycho-2 V of its primary (not subtracted).
- Brown dwarfs later than about L5 without a measured V are not in (they would show only from a few hundred au).
- Far-side lensed images come from the head's stars only.

---

## 13. The stars up close

A star near the camera is drawn as a disc of its own shape and surface (`src/sim/stars/closeup.ts`, the per-star
numbers in `src/sim/stars/extremeStars.ts`, the mesh in `src/render/starShape.ts`, the material
`createStarSurfaceMaterial` in `src/render/materials.ts` with `shaders/starSurface.*.glsl`, drawn by
`scene/Bodies.tsx` StarBody). From afar it is the limb-darkened disc it was before, at the same radiance; the cells,
spots and contrast below appear only once the disc is large on screen. Every star gets the generic look; the stars of
§13.3 get their measured shapes and the extreme ones of §13.4 are added.

### 13.1 What every star gets

- **Limb darkening for its type.** I(μ)/I(1) = 1 − u (1 − μ) in the red, green and blue channels with the linear
  coefficients u of Claret & Bloemen (2011, A&A 529, A75; VizieR J/A+A/529/A75, ATLAS models, solar metallicity,
  ξ = 2 km/s, least-squares) in R, V and B, interpolated in temperature and log g (`limb-darkening.json`, 19
  temperatures × 6 gravities, built by `scripts/build-limb-darkening.mjs`; where ATLAS has no model at low gravity the
  nearest gravity at that temperature stands in, listed by the script). u_V runs from 0.91 for a red supergiant to
  0.47 for an A star and 0.30 for a 30,000 K star. Log g from the record's mass and radius; a star with no mass takes
  R^1.25 M☉ under 1.5 R☉ and R/20 (1–15) M☉ above, and its card says so. White dwarfs (log g ≈ 8) use the table's
  edge, log g = 5.
- **Colour by Planck's law.** Each point's temperature sets its brightness and colour by B_λ(T)/B_λ(T_mean) at 610,
  550 and 465 nm, times the blackbody colour of the star's mean temperature, so the disc averages to the colour of the
  star's point of light.
- **Granulation (a model).** Bright cells about ten pressure scale heights H_p = kT/(μ m_H g) across (μ = 1.3), as
  on the Sun (H_p ≈ 130 km, granules ≈ 1,300 km): about 3.5 million on the Sun, 2 million on Altair, 6,000 on
  Betelgeuse. Their temperature contrast is ±3.5% (a model), fading out between 6,500 and 8,500 K, above which stars
  have no surface convection to show. Each cell lives about 8 minutes (the Sun's granules: Nordlund, Stein & Asplund
  2009, Living Rev. Sol. Phys. 6, 2) times its size over the Sun's. Cells smaller than about two pixels fade to their
  mean, so nothing aliases. The cells are baked into a 256² cube map while the disc is over 40 px wide, one face a
  frame (`render/starCells.ts`): evaluated per pixel they cost 21 ms a frame on the target laptop with Betelgeuse
  filling the view. The map holds cells down to four texels (up to about 13,000 over the star): red supergiants'
  granules are in it, a Sun-like star's millions are not drawn.
- **Time.** The cells are shown on the wall clock, sped up by the least power of ten that brings a turnover under a
  minute (`surfaceSpeedup`): the Sun's granules 10 times, Betelgeuse's giant cells a million times. Cards say how much.
- **Contrast.** The display's AgX tone curve compresses a stop of brightness to a few per cent of its range, and the
  bloom flares anything over its threshold (1.15): up close the disc's own brightness differences are stretched (each
  stop as 2.4) and its brightest parts roll off below the bloom's threshold, so limb darkening, gravity darkening and
  cells read as an eye adapted to the surface would see them. The cards of the stars where this matters say so. From
  afar (under about 30 pixels) the disc is exact.
- **Shape.** Every star is a sphere of its mean radius, except the fast rotators (§13.3) and Eta Carinae's wind.

### 13.2 Equations

Roche model of a rigidly rotating star (the model of every paper below): with x = r/R_pole and k = Ω²R_pole³/GM,
1/x + ½ k x² sin²θ = 1 and k = (8/27) ω² for ω = Ω/Ω_crit; R_eq/R_pole = 1.5 at break-up. The surface normal is along
the effective gravity g = −∇(−GM/r − ½Ω²r² sin²θ), and von Zeipel's law gives T(θ) = T_pole (g/g_pole)^β. The mean
temperature of a Roche star is (∫T⁴ dA / A)^¼ (`poleTemperatureFromMean`). The rotation pole points at the inclination
i from our line of sight, at position angle PA (east of north) on the sky (`poleWorld`). The mesh has the volume of the
star's mean radius (R_eq² R_pole)^⅓, the radius its record keeps.

### 13.3 Fast rotators

| Star | ω = Ω/Ω_crit | β | T_pole (K) | i (°) | Pole PA (°) | Period | R_eq/R_pole (model / paper) | T_eq (model / paper) | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Altair | 0.923 | 0.190 | 8,450 | 57.2 | −61.8 | 8.6 h (from v sin i = 240 km/s) | 1.2415 / 1.2417 | 6,866 / 6,860 ± 150 | Monnier et al. 2007, Science 317, 342, Table 1 (β free) |
| Vega | 0.774 | 0.231 | 10,070 | 6.2 | −58 | 0.71 d | 1.127 / 1.127 | 8,905 / 8,910 ± 130 | Monnier et al. 2012, ApJL 761, L3, Table 2 (concordance) |
| Regulus | 0.962 | 0.188 | 14,520 | 86.3 | 258 | 0.61 d (1.64 turns a day) | 1.304 / 1.307 | 11,019 / 11,010 | Che et al. 2011, ApJ 732, 68, Table 4 |
| Achernar | 0.9805 (from R_eq/R_pole = 1.352) | 0.166 | 17,130 (from a mean of 15,000 K) | 60.6 | 216.9 | from v_eq = 298.8 km/s and R_eq = 9.16 R☉ | 1.352 | 12,660 | Domiciano de Souza et al. 2014, A&A 569, A10; mean temperature and mass 6.1 M☉ as adopted by Domiciano de Souza et al. 2012 (A&A 545, A130) |

The tests check the first three against their papers' flattening and equatorial temperatures. Vega's pole angle is
fragile (the paper says so: epochs differ by up to 90°). Achernar's polar and equatorial temperatures are worked out
here, not measured. The interferometric images found the equators darker than any single von Zeipel law; those
departures are not drawn.

### 13.4 The extreme stars

Registered as named stars (`EXTREME_STARS`) alongside systems.json's, searchable by the names given:

| Star (also found as) | Placed at | Radius | Teff | Source |
| --- | --- | --- | --- | --- |
| Mu Cephei (Garnet Star, μ Cep, HIP 107259) | 641 (+148/−144) pc, scaled from Betelgeuse by the size of the molecular layers; catalogue star 660 moved there (its Hipparcos parallax, 0.55 ± 0.20 mas, gave 1,818 pc) | 972 ± 228 R☉ | 3,551 ± 136 K | Montargès et al. 2019, MNRAS 485, 2417, Table 2; photosphere 14.11 ± 0.60 mas (Perrin et al. 2005, A&A 436, 317) |
| VY Canis Majoris (VY CMa, HIP 35793) | 1.17 ± 0.08 kpc (maser parallaxes, the mean of Choi et al. 2008 and Zhang et al. 2012 as the paper adopts); catalogue star 50094 moved there (Gaia's 2.2 kpc is poor) | 1,420 ± 120 R☉ (Rosseland diameter 11.3 ± 0.3 mas) | 3,490 ± 90 K | Wittkowski et al. 2012, A&A 540, L12, Table 2 |
| UY Scuti (UY Sct, BD−12 5055) | Gaia DR3 4152993273702130432, 1/(ϖ + 0.017 mas) = 1,874 pc (ϖ = 0.517 ± 0.049 mas; the catalogue's global zero-point, §4.2) | 1,104 R☉: 5.48 ± 0.10 mas at that distance (1,708 ± 192 R☉ at the 2.9 kpc then assumed) | 3,365 ± 134 K | Arroyo-Torres et al. 2013, A&A 554, A76, Tables 2–3; its V = 9.0 sets its point |
| Stephenson 2-18 (St2-18, Stephenson 2 DFK 1, RSGC2-01) | Gaia DR3 4253084565963481856's position at the kinematic distance of Stephenson 2, 5.83 (+1.91/−0.78) kpc (Davies et al. 2007, ApJ 671, 781) | 2,150 R☉, **disputed** | 3,200 K (a dust model's input) | Fok et al. 2012, ApJ 760, 65 (log L = 5.64, T = 3,200 K at the cluster's distance); Humphreys et al. 2020, AJ 160, 145; Siebert et al. 2026, arXiv:2609.31362; its G = 15.30 stands in for V |
| Eta Carinae (η Car, HD 93308, Homunculus) | 2,350 ± 50 pc from the Homunculus (Smith 2006, ApJ 644, 1151); catalogue star 52994 moved there | its wind, 1,263 R☉: half its K-band light within 5 mas (van Boekel et al. 2003, A&A 410, L37), stretched 1.5 to 1 along the Homunculus's axis | catalogue colour (reddened) | luminosity ≈ 5 × 10⁶ L☉ (Davidson & Humphreys 1997, ARA&A 35, 1); a binary of 5.5 years (Damineli 1996, ApJ 460, L49) |
| Achernar (α Eri) | its catalogue place | 9.16 R☉ at the equator, 6.78 at the poles | 15,000 K mean | §13.3 |
| WR 104 (Pinwheel Nebula) | Gaia DR3 4069167258796371712's position at 2.6 ± 0.7 kpc (Tuthill et al. 2008, ApJ 675, 698) | not measured: drawn 5 R☉ | not measured: drawn 40,000 K, typical of late WC stars (Crowther 2007, ARA&A 45, 177) | its G = 12.90 stands in for V |

**Stephenson 2-18's size is disputed**, and its card says so. The 2,150 R☉ follows by Stefan–Boltzmann from Fok et
al.'s 3,200 K and 10^5.64 L☉; both rest on a dust model of its infrared light at the cluster's distance, and 3,200 K is
that model's input rather than a measured temperature. Humphreys et al. (2020) integrate its light to 6.3 × 10⁵ L☉ at
the cluster's distance but find its near-infrared colours need more extinction than the cluster's and consider its
membership doubtful; Siebert et al. (2026) could not model its CO lines at the cluster's distance (nor at 4–5 kpc) and
note it may be a foreground star. Nearer, it would be smaller in proportion to its distance. It is drawn at 2,150 R☉,
the cluster-distance figure. (The 2,150 R☉ is sometimes attributed to Davies et al. 2010; the paper behind it is Fok
et al. 2012.)

The stars moved to a paper's distance keep their brightness from the Sun (M_V shifted by 5 log₁₀ of the distance
ratio) and are held still: their catalogue velocities rest on the poor parallaxes.

Red supergiants (Betelgeuse, Antares, Mu Cephei, VY CMa, UY Sct, Stephenson 2-18) carry about 30 giant convection cells
over the whole star (a dozen or so on the side we see), with the granules on them at a third of the usual contrast,
turning over in about a year: a model after the interferometric images and 3D models of red supergiants (Haubois et
al. 2009, A&A 508, 923; Chiavassa et al. 2010, A&A 515, A12; Ohnaka et al. 2017, Nature 548, 310), with a
temperature contrast of ±7% (a model).

Active dwarfs. Proxima Centauri carries five starspots 400 K cooler than its surface (a model: spot contrasts of a few
hundred kelvin, Berdyugina 2005, Living Rev. Sol. Phys. 2, 8), turning with its 83.5-day rotation (Benedict et al.
1998, AJ 116, 429) on the simulation's clock, and flares: 63 a day, the rate Davenport et al. (2016, ApJL 829, L31)
extrapolate down to 0.5% in brightness from 66 flares in 37.6 days, each a patch heated towards 10,000 K that rises in
30 s and decays over ten minutes (shape and place a model), on the surface's clock. Epsilon Eridani has four spots on
its 11.68-day rotation (Donahue, Saar & Baliunas 1996, ApJ 466, 384).

### 13.5 Two nebulae in 3D (`sim/stars/stellarNebulae.ts`, `scene/StellarNebulae.tsx`, `render/stellarNebulaMaterials.ts`)

**The Homunculus.** A lathe of Smith's (2006) Table 1, the radius of the outer H₂ shell at 47 latitudes, 2,100 au at
the equator to 22,014 au at 69.5° (the lobes are widest short of their poles) and 21,690 au at the pole, for 2,350 pc
and an age of 160 years in March 2005. The outflow is a Hubble flow (Smith's expansion speeds are the radii over 160
years: 648 km/s at the pole), so the shape is scaled by (year − 1845.2)/160 for the simulation's date; before 1845 it
is not drawn. Its axis is tilted 41° from our line of sight, the south-east lobe towards us at position angle 130°
(Smith 2006). The skin's light is the star's scattered by dust (a model): 1/r² from the star, a Henyey–Greenstein phase
function with g = 0.45 (so the near lobe, between us and the star, is the brighter, as in Hubble's pictures) and the
path length through a thin shell, 1/|n·v|; the colour is the reddish brown of its pictures. Not drawn: the thicker
[Fe II] inner shell, the Little Homunculus, the equatorial skirt, and the dimming of the star seen through the near
lobe. It shows within 8–30 times its size of the star.

**WR 104's pinwheel.** Tuthill et al. (2008): an Archimedean spiral turning once every 241.5 ± 0.5 days, expanding at
0.28 ± 0.02 mas a day (1,260 km/s at 2.6 kpc: 176 au between coils; they quote 170), its dust beginning 13.3 mas (35
au) from the centre, its position angle 269° on 1998 April 14 (JD 2450918), turning clockwise on the sky (position
angle falling: the images at longer wavelengths are "advanced … (clockwise)", §2.2), in a plane tilted 12° (0–16°)
from the sky at position angle 84°. 24,000 dust particles carry their age in coils and are placed on the spiral in the
vertex shader for the date (`wr104ArmAngleDeg` is its pure twin), so the pattern turns on the simulation's clock. The
arm's width (9% of its radius, after the shock cone's ≈ 20° half-angle) and the dust's fading outwards (∝ r^−1.6, over
2.6 coils) are a model; the dust shines in the infrared, where the spiral was imaged, and is shown in false colour. It
shows within 40–160 coil spacings of the star.

### 13.6 Journeys and search

"Monsters among the stars" (Journeys; scene `monsters-among-the-stars` in `src/content/scenes.ts`) visits Betelgeuse,
Stephenson 2-18, UY Scuti, VY Canis Majoris, Altair, Achernar, Eta Carinae with the Homunculus and WR 104 (time a
million times faster there), each with a line comparing its size with the Sun's and the planets' orbits. Every star
above is found in "Where to?" by the names in §13.4.

### 13.7 Tests

`src/sim/stars/closeup.test.ts`: the Roche flattening of Altair, Vega and Regulus from their fitted ω; the equipotential
and its normal; their equatorial temperatures from their poles by von Zeipel's law; the pole on the sky; Claret's table
at grid points; the Sun's granule count and Betelgeuse's; the speed-up; the extreme stars' radii from the cited angular
diameters and luminosities; every fact and value has its reference. `src/sim/stars/stellarNebulae.test.ts`: the
Homunculus's table, expansion and speeds; the pinwheel's coil spacing, standoff, speed and turning.

### 13.8 Sources and licences

| Input | Use | Licence / terms |
| --- | --- | --- |
| Claret & Bloemen 2011, A&A 529, A75, via VizieR J/A+A/529/A75 (`data-raw/claret2011_tableu_Z0_xi2_LSM_ATLAS.tsv`, sha256 22cf9b02c4398db9e844c910f1d26c92c80cea117efee4ac2c2535f1cfcc1484) | Limb darkening (`limb-darkening.json`) | Numbers from a published table, cited; VizieR asks for acknowledgement |
| The papers of §13.3–13.5 | Shapes, temperatures, sizes, distances, the nebulae's geometry | Values from the literature, each cited in `extremeStars.ts`, `stellarNebulae.ts` and the cards |
| Gaia DR3 (positions and UY Scuti's parallax) | Placing UY Scuti, Stephenson 2-18 and WR 104 | CC BY-NC 3.0 IGO, credit ESA/Gaia/DPAC (as §8) |

---

## 14. Stars in time: the Sun's life and any star's track

**The formulae** (`src/sim/stars/sse.ts`). No data file: a star's life is worked out from the analytic single-star
evolution formulae of Hurley, Pols & Tout 2000 (MNRAS 315, 543; "HPT"), implemented from the paper's equations (numbered
as there in the code) and the coefficients of its Appendix, with the zero-age main sequence of Tout, Pols, Eggleton & Han
1996 (MNRAS 281, 257, Tables 1–2), all at Z = 0.02. There ζ = log(Z/0.02) = 0, so each coefficient is its table's first
column, followed by the Appendix's clamps (which fix, for example, a17 = 1.4, a66 = a68 = 0.8, a79 = 2 and b17 = 0.612).
Luminosity, radius and core mass follow the paper through the main sequence (eqs. 4–24, with the hook above 1.02 M☉),
the Hertzsprung gap (25–30), the giant branch on the core mass–luminosity relation (31–48), core helium burning (49–67),
the early and thermally pulsing AGB with second and third dredge-up (68–74), and the end of the AGB (75): a white dwarf
(eqs. 90–91 at its birth) once the wind has taken the envelope, a supernova (where the track stops) if the core reaches
M_c,SN first. Mass loss is §7.1's: Reimers' law with η = 0.5 on the GB and beyond, Vassiliadis & Wood (1993) with its
superwind cap on the AGB, Nieuwenhuijzen & de Jager (1990) above 4,000 L☉, the Wolf–Rayet-like and LBV-like winds. As the
paper prescribes, timescales and luminosities use the initial mass (reset to the current mass at a low-mass star's helium
flash) and radii the current mass, and the small-envelope perturbation (eqs. 97–105) carries the star from the AGB to the
white dwarf as its envelope runs out. A life is sampled as it is integrated (about 100 points on the main sequence, 40
across the Hertzsprung gap, 150 up the giant branch, 100 through core helium burning, then the AGB step by step, mass loss
in sub-steps short against the envelope's life in the wind), in a few milliseconds, once per mass.

Left out: naked helium stars (a star stripped to its helium core before the AGB, HPT §6.1, ends its track there), winds on
the main sequence and in the Hertzsprung gap (HPT's re-ageing with M0 = Mt; negligible for the Sun, but it reshapes stars
above about 20 M☉, so cards draw tracks for 0.5–20 M☉), neutron stars and black holes, rotation. One reading: eq. (21) as
printed has no '+' in its denominator; it is read as a59 + M^a61, like the paper's other rational fits (a single power law
would not need four coefficients). The powers of the negative logarithms in eq. (58) keep their sign, so that τ_bl = 1 at
M_HeF as the paper requires. The paper's own white-dwarf cooling (eq. 90) is not used beyond the white dwarf's birth: it
cools far faster than Sirius B does (§ below).

**Evaluation** (`src/sim/stars/evolution.ts`). Between the points of a track every quantity is linear in the point's index
(its life coordinate, which gives each stage room). Stages: main sequence; subgiant (the Hertzsprung gap); red giant (the
GB); helium flash (the first few points of a low-mass star's core helium burning, the flash itself being instantaneous in
the formulae); horizontal branch (the red clump, at this metallicity); AGB; thermally pulsing AGB while cooler than 6,000 K;
leaving the AGB; planetary nebula (hotter than 25,000 K, for 30,000 years); white dwarf.

**The Sun.** The 1 M☉ track, scaled so that at the Sun's age today (4.567 Gyr, Bouvier & Wadhwa 2010) it has exactly
the nominal radius, luminosity and temperature (the formulae give 0.96 L☉, 0.98 R☉ and 5,751 K then). Along it: about 10%
brighter per billion years; the end of the main sequence at 11.0 Gyr (2.2 L☉, 1.65 R☉); the tip of the red-giant branch at
12.33 Gyr, 189 R☉ (0.88 au), 2,900 L☉, 3,080 K, having lost 23% of its mass to Reimers' wind; the red clump at 11 R☉ and
54–78 L☉; the AGB, where the Vassiliadis–Wood wind takes most of what is left, so that the star reaches 238 R☉ (1.11 au)
at 0.54 M☉ when its thermal pulses begin; then the last of the envelope goes, and it crosses from 6,000 K to 25,000 K in
about 40,000 years and on to 190,000 K, leaving a 0.519 M☉ white dwarf at 123,000 K and 41 L☉ about 190,000 years after
the pulses began. Beyond the track the white dwarf cools by Mestel's law, t ∝ M^(5/7) L^(−5/7), anchored to Sirius B
(1.018 M☉, 0.0565 L☉ after 126 Myr: Bond et al. 2017), its radius easing to the cold radius of its mass (Nauenberg 1972:
0.0136 R☉) over 30 Myr: a model; the slider follows it two billion years (6 × 10⁻⁴ L☉, 7,800 K). Its V comes from Flower's
bolometric corrections as corrected by Torres (2010) (§11), so its point of light from the planets follows it.

**A check against detailed models** (not shipped). The MIST v1.2 1 M☉ track (Choi et al. 2016; [Fe/H] = 0, v/v_crit = 0.4),
read locally from its EEP file, against the formulae, both scaled to today's Sun:

| | MIST v1.2 | Hurley et al. 2000 |
| --- | --- | --- |
| End of the main sequence | 9.9 Gyr | 11.0 Gyr |
| Tip of the red-giant branch | 11.34 Gyr, 173 R☉ (0.80 au), 0.95 M☉ | 12.33 Gyr, 189 R☉ (0.88 au), 0.77 M☉ |
| Largest radius on the AGB | 352 R☉ (1.64 au) at 0.74 M☉ | 238 R☉ (1.11 au) at 0.54 M☉ |
| White dwarf | 0.540 M☉ | 0.519 M☉ |

The formulae's red giant is about as large; the difference is the mass loss. MIST uses Reimers' law with η = 0.1 on the
red-giant branch, HPT η = 0.5, so the formulae's Sun loses five times more there and much of the rest early on the AGB,
which keeps it smaller in its last pulses.

**The planets.** Mass is lost over many orbits, so each orbit widens keeping a·M constant (a ∝ 1/M, speed ∝ M; Jeans's
adiabatic invariant, as Sackmann et al. 1993 and Schröder & Smith 2008 apply it): `bodies/world.ts` `solarAge.scale`
multiplies every heliocentric body's place (not its moons' about it) and divides its speed, in the per-frame pass, at
other times, and in the light-time groups, so the orbit lines (two-body conics from the state, with the Sun's GM scaled
by its mass) widen with them. A planet is swallowed when the Sun's radius first reaches its widened mean distance. Here
only Mercury is, at 12.32 Gyr, just before the tip of the red-giant branch; Venus, its orbit widened to 0.94 au by then,
escapes by 0.06 au, and Earth (1.30 au) and Mars by more. Swallowed planets and their moons are absent from then on. Tides
and the drag of the Sun's wind are not modelled; they pull planets in: Schröder & Smith (2008), with a tip at 1.2 au,
find Mercury, Venus and Earth engulfed there, while others find Earth survives (Sackmann et al. 1993; Rybicki & Denis
2001). The card says so.

**Drawing.** While the Sun is shown at another age, `scene/Bodies.tsx` draws it with the star-surface material every star
has (§13.1): limb darkening and granules for its temperature and gravity (a red giant's granules number in the hundreds
and are baked into the cell map while the disc is large), its colour by Planck's law. Its planetary nebula
(`scene/StellarNebulae.tsx`, `render/stellarNebulaMaterials.ts`) is a shell from 0.6 to 1 of a radius growing at 25 km/s
since the star left the AGB (hotter than 10,000 K; typical of planetary nebulae: a model), lit once the core passes
25,000 K and fading out 30,000 years later; its light is the path length through it along each ray, [O III] teal inside
and Hα/[N II] red at the rim. That a 1 M☉ star makes a visible nebula at all is Gesicki et al.'s (2018, Nature Astronomy 2,
580) finding.

**Interaction.** The simulation clock is not moved: the Sun has an age of its own (`sim/stars/sunFuture.ts`). The Sun's
card shows its age and stage, the planets swallowed and how much wider the orbits are, a small HR diagram with the track
and the Sun on it, and a slider over its life (90% of it in the track's points, so each stage has room; the last 10% the
white dwarf's cooling, logarithmically), with Today and Watch its future. The Sun is back to today when Today is pressed,
when its card is closed or another body chosen, and when any scene starts. The journey "The Sun's future" (`sun-future`)
frames the inner Solar System from 3.2 au and plays the life through keyframes in the track's points (about 85 s), easing
out to frame the nebula (to 700,000 au) and in to the white dwarf (60,000 km); a camera move hands the view back with the
age where it is.

**Any star.** A star whose card has a measured mass (the named stars of `systems.json`, Algol's three) shows the formulae's
track for a star of its mass (0.5–20 M☉; outside, the nearest), with the star at its measured temperature and luminosity.

**Tests** (`sse.test.ts`, `evolution.test.ts`): the coefficients and worked values the paper quotes (eq. 48's GB radius,
b2 = 0.383, b3 = 0.76; the 1 M☉ AGB coefficient 0.95; the Appendix's clamps; M_HeF, M_FGB = 13.03; Table 1's rate constants,
t_BGB and GB lifetimes); Tout et al.'s ZAMS (0.698 L☉, 0.888 R☉ at 1 M☉, rising with mass); the main sequence from the ZAMS;
the Mc–L relation and its inverse; eq. (66) and M_c,BGB ≈ 0.098 M^1.35; Reimers' rate; white dwarfs of eq. (91) radius from
1–4 M☉ and supernovae above; rising ages and ordered stages; lifetimes (11.0 Gyr at 1 M☉, 0.378 Gyr at 3 M☉); the initial–
final masses; the Sun today exact; 7–13% brighter a billion years on; the tip at 0.8–0.95 au having lost 18–28% of its mass;
the red clump; 1.0–1.25 au on the AGB; a 0.50–0.55 M☉ white dwarf; the crossing's timing; Mestel's law through Sirius B
and Nauenberg's radii; a·M constant; Mercury swallowed by the tip, Venus narrowly spared, Earth and Mars never; the stages
in order; the planetary nebula's timing and size.

## 15. Stars in time: variable stars

Variables vary by default, with no switch: their records' light (`luminous.vmag`), colour temperature and, for the
pulsators with measured sizes, radius are rewritten each frame (`sim/stars/variability.ts`), so the point of light from
afar (Glints) and the disc up close (StarBody) both follow. What the camera sees is the light that left the star a
light-time ago: the phase shown is the date's minus the camera's light-time plus the Sun's, so from Earth the curves keep
their published times. Each card gets a line on how the star varies and its V from Earth at the date.

| Star | Type | Period, epoch | Light | Colour, size | Sources |
| --- | --- | --- | --- | --- | --- |
| Algol (β Per), as A, B and C | Eclipsing triple | 2.8673043 d from HJD 2445641.5135 (GCVS; within about 0.2 d over 236 years, Jetsu 2021) | Geometry: each star's limb-darkened disc hidden by the others as seen from the camera; 2.10 out of eclipse, 3.26 at primary minimum, 2.13 at secondary from the Sun (GCVS 2.12–3.39); about 10 hours | A 2.73 R☉, 3.17 M☉, 12,550 K; B 3.48 R☉, 0.70 M☉, 4,900 K; C 1.73 R☉, 1.76 M☉, 7,550 K | Baron et al. 2012 (radii, masses, both orbits: inner a = 2.15 mas, i = 98.70°, Ω = 43.43°; outer 680.168 d, a = 93.43 mas, e = 0.227, i = 83.66°, Ω = 132.66°, ω = 310.02°; parallax 34.7 mas); Kolbas et al. 2015 (temperatures) |
| β Lyrae (Sheliak) | Eclipsing (β Lyr type) | HJD 2408247.966 + 12.913780 E + 3.87196 × 10⁻⁶ E² (Harmanec & Scholz 1993): 12.944 d now, growing 19 s a year | Two-term cosine curve through the GCVS maximum 3.25 and minima 4.36 and 3.85 | Unchanged; drawn as one star | GCVS; Harmanec & Scholz 1993; Harmanec 2002 |
| δ Cephei | Classical Cepheid | 5.366208 d from HJD 2455479.905, rising in 25% | V 3.48–4.37, a smooth curve through the GCVS range and rise time (a model) | 6,900 K at maximum light to 5,600 K; 44.8 R☉ ± 2.9%, largest at phase 0.45 | GCVS; Nardetto et al. 2016 (1.450 and 1.535 mas at phases 0.05 and 0.48, the temperatures their model atmospheres adopt) |
| Polaris | Cepheid of small amplitude | 3.9696 d from HJD 2431495.813 (GCVS) | ±0.02 mag sinusoid (a few hundredths now: Bruntt et al. 2008); its period grows 4.5 s a year (Turner et al. 2005), so the phase is not today's | Unchanged | GCVS; Bruntt et al. 2008; Turner et al. 2005 |
| Mira (ο Cet) | Mira | 331.96 d from JD 2444839 (GCVS), rising in 38% | A typical cycle, V 3.5–9.5 (GCVS extremes 2.0 and 10.1; a model) | 3,200 K near maximum to 2,900 K; 314 R☉ ± 9.5%, largest at phase 0.4 | GCVS; Woodruff et al. 2004 (VLTI diameters and temperatures at a few phases, scaled to the catalogue distance) |
| RR Lyrae | RR Lyrae (RRab) | 0.56686776 d from HJD 2442923.4193, rising in 19% | V 7.06–8.12 (GCVS; a smooth model); no Blazhko cycle | Unchanged | GCVS |
| Betelgeuse | Semi-regular | 416 d (Joyce et al. 2020) and 2,335 d (GCVS) | 0.55 ± 0.2 ± 0.1 (a model), with the Great Dimming through V = 1.12 on 2019 Dec 7 (ATel 13341), 1.614 on 2020 Feb 7–13 and 1.522 on Feb 22 (ATel 13512), 0.93 on Mar 31 (ATel 13601, visual), joined smoothly | Unchanged: the dimming was dust (Montargès et al. 2021), its temperature nearly constant (Levesque & Massey 2020) | as listed |

Algol is registered as the triple (`records.ts` `algolRecords`, through `systemRecords`): its centre of mass in
straight-line motion from catalogue row 61, the inner pair's orbit timed so that B is straight in front of A at the GCVS
epoch (e = 0, ω = 270°), each star with its own M_V from its radius and temperature (shifted together by a few
hundredths so the three add up to the catalogue's V). Up close the eclipse is the meshes themselves; the discs of B and C
are exposed against A's by their V-band surface brightness (`luminous.discRadiance`, Planck at 550 nm: B is 3.4% of A),
so B shows as the dim star it is. Algol B fills its Roche lobe (CHARA saw it elongated 1.04–1.22): drawn round. The
reflection effect and B's ellipsoidal variation are left out (the secondary eclipse comes out 0.03 mag, about half the
measured). β Lyrae's Roche-distorted pair and its disc are not drawn.

**The journey "Stars that change"** (`stars-that-change`): Algol up close through an eclipse (4,000 times faster), δ
Cephei pulsing (40,000 times), Mira (2 million times), and Betelgeuse's Great Dimming from beside the Sun, September 2019
to spring 2020 (a million times), Orion's figure drawn.

**Tests** (`variables.test.ts`): eclipses of limb-darkened discs (none apart, all behind a larger disc, p² for a small
uniform disc, 1/(1 − u/3) at the centre, growing as the disc moves in); Algol out of eclipse 2.0–2.2, primary minimum at
the GCVS time to 5 minutes, 1.0–1.6 mag deep, a 0.01–0.15 mag secondary, 8–11 hours long; Baron et al.'s orbit sizes,
mass ratio, orthonormal bases, B in front at the epoch 2.0 R☉ off centre; the pulsators' GCVS ranges, maxima at their
epochs and rise times; δ Cep's temperatures and Nardetto's diameter ratio, Mira's range and size; Polaris's amplitude;
each catalogue row is its HIP number's; Betelgeuse through every measured point of the Great Dimming and inside its usual
range otherwise; β Lyrae's quadratic ephemeris, its period now and its growth, the GCVS maximum and minima; every fact's
source is listed.

## 16. Stars in time: the constellations drift

The stars already move with the date (§6, §11): each star of the field, each figure's segment end (constellation.vert.glsl)
and each registered star goes in a straight line from its catalogue place with its space velocity, light-time included,
for a million years either side of 2000 (Gaia and Hipparcos proper motions and parallaxes, Gaia DR3 or literature radial
velocities; `motion.ts` and `motion.test.ts`). Over a human lifetime that is invisible; the journey "The constellations
drift" (`constellations-drift`, `sim/stars/drift.ts`) shows it: the camera held still in Roam 4,000 au from the
Sun towards the Big Dipper (beyond the Kuiper belt's bodies, the Sun behind the view, the stars shifted by under 0.1°),
celestial north up, the figures drawn, the clock jumps to 100,000 years ago and runs at about 5,500 years a second to
100,000 years ahead; then the same for Orion, then back to today. (Orbiting a galaxy would not do: in the expanding
universe M101 recedes by 50 pc in 100,000 years, and the camera with it.) Nearby stars cross whole constellations in that
time (Arcturus moves 2.3″ a year, 64° in 100,000 years), so neighbouring figures fly apart. Five stars of the Dipper (Merak, Phecda, Megrez, Alioth, Mizar) belong
to the Ursa Major moving group and drift together; Dubhe and Alkaid do not, and the dipper bends. A camera move or another
rate hands the clock back. `drift.test.ts` checks the premise on the catalogue: the five group stars keep their
separations within a quarter, Dubhe–Alkaid changes by more than a degree either way, and by under 0.01° in 80 years.

## 17. Sources and licences (§14–16)

| Input | Use | Licence / terms |
| --- | --- | --- |
| Hurley, Pols & Tout 2000, MNRAS 315, 543 (arXiv:astro-ph/0001295), and Tout, Pols, Eggleton & Han 1996, MNRAS 281, 257 | The stellar-evolution formulae and their coefficients (`sse.ts`) | Equations and coefficients quoted from the papers, cited; implemented here from the papers |
| MIST v1.2 (Choi et al. 2016) | Only the checks in §14 and in blackholes.md §6 (the nuclear cluster's populations, also from `sse.ts`), read locally; nothing shipped | — |
| GCVS (Samus et al. 2017, VizieR B/gcvs) | Ephemerides and ranges | Catalogue values, cited; VizieR asks for acknowledgement |
| The papers of §14–15 (Baron et al. 2012; Kolbas et al. 2015; Harmanec & Scholz 1993; Harmanec 2002; Nardetto et al. 2016; Woodruff et al. 2004; Bruntt et al. 2008; Turner et al. 2005; Jetsu 2021; Joyce et al. 2020; Montargès et al. 2021; Levesque & Massey 2020; ATel 13341, 13512, 13601; Bond et al. 2017; Nauenberg 1972; Schröder & Smith 2008; Sackmann et al. 1993; Gesicki et al. 2018; Bouvier & Wadhwa 2010) | Values and facts | Values from the literature, each cited in `variables.ts`, `evolution.ts` and the cards |
