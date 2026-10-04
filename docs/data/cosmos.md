# Galaxies, the cosmic web and the CMB

Data and evaluator code for the extragalactic layer: the Local Group and its neighbours, named galaxies and
clusters (the ones the Learn articles use), 55,877 galaxies with measured distances for the cosmic web, and
an all-sky CMB texture. Everything here is heliocentric. Built 25 September 2026. Sections up to "Changes after
the independent verification" describe the data; the last section, "In the app", how the app uses them (code in
`src/sim/cosmos/`, `src/scene/Galaxies.tsx`, `CosmicWeb.tsx` and `CmbMap.tsx`).

## Outputs

| File | Size (bytes) | What |
| --- | --- | --- |
| `public/data/local-galaxies.json.gz` | 30,810 gz / 142,211 raw | 169 galaxies within 3 Mpc: every confirmed dwarf in the Local Volume Database v1.1.1 (CC0) + M31 and M33 |
| `src/sim/cosmos/named.json` | 31,417 (7,711 gz) | 15 named galaxies, clusters and redshift-record galaxies, with sources |
| `public/data/cosmic-web.bin.gz` | 867,446 gz / 1,285,235 raw | 55,877 Cosmicflows-4 galaxies: position, velocity, measured distance, Ks |
| `public/textures/cmb.png` | 874,361 | CMB anisotropy, colour, 2048 x 1024 palette PNG, galactic equirectangular |
| `public/textures/cmb-data.png` | 289,676 | same map as a linear temperature code, 1024 x 512 greyscale PNG |

Build scripts (Node 24, no dependencies; they read `data-raw/cosmos/` and fetch a raw file only if it is
missing):

```
node scripts/build-cosmic-web.mjs      # writes cosmic-web.bin.gz and data-raw/cosmos/cosmic-web-index.json
node scripts/build-local-galaxies.mjs  # needs the index above; writes local-galaxies.json.gz and named.json
node scripts/build-cmb.mjs             # writes cmb.png and cmb-data.png
```

All three are deterministic: a rerun from the cache reproduces the files byte for byte. Suggested
`package.json` scripts for the integration team: `data:cosmic-web`, `data:local-galaxies`, `data:cmb`.

Raw inputs in `data-raw/cosmos/` (gitignored):

| File | Origin |
| --- | --- |
| `lvdb/lvdb_v1.1.1_comb_all.ecsv`, `lvdb/LICENSE`, `lvdb/README.md`, `lvdb/*.rst` | Local Volume Database release v1.1.1 (https://github.com/apace7/local_volume_database/releases/tag/v1.1.1), its CC0 1.0 licence, README and column descriptions |
| `NearbyGalaxies_Jan2021_PUBLIC.fits`, `table1_OCT2019.pdf`, `References.dat`, `Comments.dat`, `Update.log`, `table1_OCT2019.txt` | the McConnachie (2012) updated catalogue from the CADC, used by the first version only (no longer read; see "Not shipped") |
| `J_ApJ_944_94/table2.dat.gz`, `table4.dat.gz`, `ReadMe` | https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ |
| `J_AJ_144_4/*` | McConnachie (2012) original tables from CDS (reference only; not read) |
| `cf4_2masx_xmatch.csv.gz` | CDS XMatch (http://cdsxmatch.u-strasbg.fr/xmatch/api/v1/sync) of the CF4 positions against `vizier:VII/233/xsc`, 6" radius |
| `rc3_named.json` | VizieR VII/155 rows nearest each named galaxy (cone search, 2') |
| `wmap_ilc_9yr_v5.fits` | https://lambda.gsfc.nasa.gov/data/map/dr5/dfp/ilc/wmap_ilc_9yr_v5.fits |
| `cosmic-web-index.json` | written by `build-cosmic-web.mjs` (PGC -> row, group) for `build-local-galaxies.mjs` |

Evaluator code in `src/sim/cosmos/` (pure TypeScript, no three.js):

| Module | Contents |
| --- | --- |
| `frames.ts` | ICRS, ecliptic J2000, galactic, supergalactic and app-world rotations; sky basis |
| `cosmology.ts` | a thin adapter to the app's one cosmology module (Planck 2018 flat Lambda-CDM, `src/physics/cosmology`), and distance moduli |
| `cosmicWeb.ts` | decoder for `cosmic-web.bin.gz`, distance modes, world positions for a point cloud, group runs |
| `localGalaxies.ts` | types for both JSON files, loader, disc geometry (`discAxes`, `discPoint`) |
| `cmb.ts` | CMB texture u,v <-> (l, b) <-> ecliptic direction, code <-> microkelvin, a GLSL snippet |
| (gzip) | files are inflated with `fetchGzip` of `src/sim/stars/catalogue.ts` (`DecompressionStream('gzip')`, skipped if the server already decoded) |

Tests: `npx vitest run src/sim/cosmos` (the data tests in `data.test.ts`, the templates, and the app's bodies in
`cosmos.test.ts`). They read the shipped files, so rebuild first if the data change.

## Frames and units

- RA/Dec: ICRS (J2000), degrees. The 23 mas frame bias between J2000 and ICRS is ignored.
- Ecliptic: J2000 mean ecliptic and equinox, obliquity eps = 84381.448" (IAU 1976; the value JPL,
  astronomy-engine, `scripts/build-stars.mjs` and the rest of the app use). `v_ecl = R_x(+eps) v_icrs`.
- Galactic: IAU 1958 system realised in the ICRS (Hipparcos, ESA 1997, SP-1200 vol. 1, sect. 1.5.3):
  north galactic pole at (RA, Dec) = (192.85948, +27.12825), l of the north celestial pole = 122.93192.
  Same matrix as the Milky Way layer (`src/sim/galaxy/frames.ts`). Agrees with astropy's frame to 0.02".
- Supergalactic: pole at (l, b) = (47.37, +6.32), SGL = 0 at (137.37, 0) (de Vaucouleurs et al. 1991;
  Lahav et al. 2000, MNRAS 312, 166).
- App world: `world = (x_ecl, z_ecl, -y_ecl)`.
- Positions are heliocentric. Lengths: kpc in `local-galaxies.json.gz`, Mpc in `named.json` and the cosmic
  web. Velocities km/s. Proper motions mas/yr with `pmra` = mu_alpha cos(dec).

Rotation matrices (`v_target = M v_source`, rows are the target axes written in source components):

```
ICRS_TO_ECL = [[ 1,                  0,                  0                 ],
               [ 0,                  0.9174820620691818, 0.3977771559319137],
               [ 0,                 -0.3977771559319137, 0.9174820620691818]]

ICRS_TO_GAL = [[-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
               [ 0.4941094278755837, -0.4448296299600112,  0.7469822444972189],
               [-0.8676661490190047, -0.1980763734312015,  0.4559837761750669]]

GAL_TO_ECL  = [[-0.0548755604162154,  0.4941094278755837, -0.8676661490190047],
               [-0.9938213790616487, -0.1109907334174410, -0.0003515899048316],
               [-0.0964766261278292,  0.8622858750901130,  0.4971471917159637]]
             (= ICRS_TO_ECL * transpose(ICRS_TO_GAL); ECL_TO_GAL is its transpose)

GAL_TO_WORLD = [[-0.0548755604162154,  0.4941094278755837, -0.8676661490190047],
                [-0.0964766261278292,  0.8622858750901130,  0.4971471917159637],
                [ 0.9938213790616487,  0.1109907334174410,  0.0003515899048316]]

GAL_TO_SGAL = [[-0.7357425748043749,  0.6772612964138942,  0                 ],
               [-0.0745537783652337, -0.0809914713069767,  0.9939225903997749],
               [ 0.6731453021092076,  0.7312711658169645,  0.1100812622247821]]
```

Checks in `frames.test.ts`: the galactic centre lands on (266.40499, -28.93617), the ecliptic pole on
(270, 90 - eps), and M87 on SGB = -2.35 (as Cosmicflows-4 lists it).

## Cosmology

Flat Lambda-CDM with the Planck 2018 TT,TE,EE+lowE+lensing+BAO parameters (Planck Collaboration 2020,
A&A 641, A6, table 2, last column): H0 = 67.66 km/s/Mpc, Omega_m = 0.3111, T_CMB = 2.7255 K (Fixsen 2009,
ApJ 707, 916), N_eff = 3.046. Radiation is photons plus two massless neutrino species (Omega_r =
7.893e-5); the 0.06 eV neutrino counts as matter, which is exact enough below z ~ 100. Omega_Lambda =
1 - Omega_m - Omega_r. Integrals are done in the scale factor with Gauss-Legendre quadrature. Against
astropy 8.0.1 `Planck18`: comoving distance within 0.003 % for z < 15, age today 13.7867 Gyr (astropy
13.7869, Planck 13.787 +/- 0.020), age at z = 14.44 is 283 Myr. If the app's cosmology module
(`src/physics/cosmology`) is used instead, it should reproduce the reference values in `cosmology.test.ts`. The app
uses only that module; `data.test.ts` checks that it reproduces named.json's derived numbers (comoving
distances to 1e-5, lookback times and ages to 1e-3 Gyr).

CMB frame. The Sun moves at 369.82 +/- 0.11 km/s toward (l, b) = (264.021, 48.253) relative to the CMB
(Planck Collaboration 2020, A&A 641, A1; dipole 3362.08 +/- 0.99 uK). Heliocentric to CMB-frame redshift:
`1 + z_cmb = (1 + z_hel) * gamma * (1 + beta cos theta)`, theta the angle to the apex. The CMB seen by an
observer moving at velocity beta: `T = T0 / (gamma (1 - beta . n))`, with `n` the direction looked at, in
the observer's frame (`cmbTemperatureSeenK`; at beta = 0.99 the sky ahead is 38.5 K, behind 0.19 K).

## local-galaxies.json.gz

Source: the **Local Volume Database** (LVDB; Pace, A. B. 2025, "The Local Volume Database: a library of the
observed properties of nearby dwarf galaxies and star clusters", The Open Journal of Astrophysics 8, 142,
doi:10.33232/001c.144859, arXiv:2411.07424), release **v1.1.1** (12 August 2026), file `comb_all.ecsv`,
released under **CC0 1.0** (the repository's LICENSE, checked 25 September 2026; the build refuses to run if the
cached licence is not CC0). The LVDB compiles every value from the literature and cites it per value (author +
ADS bibcode), and those citations are carried into this file.

The first version of this file was built from the updated catalogue of McConnachie (2012) hosted by the CADC.
That page asks users to cite the paper but states no licence or redistribution terms, and none could be confirmed,
so the file was rebuilt from the LVDB. The LVDB is also more recent: it adds the dwarfs discovered since the
catalogue's last update and uses homogeneous RR Lyrae distances for the M31 system (Savino et al. 2022).

Selection: every row of the LVDB dwarf tables (`dwarf_mw`, `dwarf_m31`, `dwarf_local_field`,
`dwarf_local_field_distant`) within 3 Mpc of the Sun and marked `confirmed_real` (167 rows; unconfirmed candidates
are left out), plus M31 and M33, which the dwarf tables do not list: **169 galaxies**. 11 are not confirmed as
galaxies (they may be star clusters) and carry `ambiguous: true`.

JSON, gzipped (decode with `loadLocalGalaxies()`), top-level fields `format` (`"lightspeed-local-galaxies"`),
`version` (1), `generated`, `description`, `credit`, `licence`, `frames`, `units`, `references` (LVDB reference key
-> ADS bibcode, for every key used by the rows) and `galaxies`, sorted by distance (Draco II, 21.6 kpc, first;
NGC 1560, 2.99 Mpc, last). Per galaxy (fields omitted when unknown):

| Field | Meaning |
| --- | --- |
| `id`, `name`, `catalogueName`, `aliases` | `id` is `lg-<LVDB key>` except the four big ones (`andromeda`, `triangulum`, `lmc`, `smc`, matching `named.json`); `catalogueName` is `LVDB <key>` |
| `subgroup` | `MW` (LVDB host `mw`, `lmc` or `smc`), `M31` (host `m_031` or `m_033`), `LG` (inside the Local Group's zero-velocity surface, radius 0.96 Mpc about the barycentre at 0.55 of the way to M31, Karachentsev et al. 2009, the same rule as the cosmology policy), `nearby` (outside it). Counts: 65, 43, 12, 49 |
| `morphology`, `class` | The LVDB lists no morphological types, so the render class follows the neutral-gas content: HI mass of 10^6 M_sun or more -> `dwarf-irregular` (24), HI detected but less -> `transition` (10), no HI detected -> `dwarf-spheroidal` (116), not confirmed as a galaxy -> `unknown` (11); M32 is `compact-elliptical` and NGC 147, 185 and 205 `dwarf-elliptical` by name; the big four have their RC3 types. `morphology` states the basis ("gas-rich dwarf (HI 2.0e+8 Msun)") |
| `ambiguous` | true when the LVDB does not confirm the object as a galaxy (may be a star cluster) |
| `ra`, `dec`, `l`, `b` | LVDB centre (ICRS), deg |
| `distanceKpc`, `dmod`, `dmodErr`, `distanceRef` | heliocentric distance; `dmodErr` is [+, -] mag; `distanceRef` is the LVDB reference key of the distance (or the named entry's reference) |
| `positionEclKpc` | heliocentric ecliptic J2000 position, kpc |
| `vHelio`, `vHelioErr` | heliocentric systemic radial velocity, km/s |
| `vmag`, `absMagV`, `lumV` | V magnitude corrected for extinction (LVDB), M_V = V - dmod, L_V in L_sun with M_V,sun = 4.83 |
| `pa`, `ellipticity`, `rhArcmin`, `rhPc` | major-axis position angle (deg E of N), 1 - b/a, half-light (or Plummer) radius along the major axis |
| `muVHalf`, `sigmaStar`, `mHI`, `feh`, `fehType` | mean V surface brightness inside the half-light radius (mag/arcsec^2), line-of-sight velocity dispersion (km/s), HI mass (10^6 M_sun), [Fe/H] and whether it is spectroscopic or photometric |
| `pmra`, `pmdec`, `pmraErr`, `pmdecErr`, `pmRef`, `velocityHelioEclKmS` | systemic proper motion and the implied heliocentric 3D velocity (`v_r r + 4.74047 D (pmra e + pmdec n)`), ecliptic axes; it includes the reflex of the Sun's motion. 78 galaxies |
| `disc`, `size`, `cosmicWeb` | for the big four, as in `named.json` |
| `refs` | LVDB reference keys of every value in the row (texts via ADS: `references[key]` is the bibcode) |

The four big galaxies use the distances of their named entries: M31 761 +/- 11 kpc (Li et al. 2021), M33 840 kpc
(mu = 24.622 +/- 0.030, Breuval et al. 2023), LMC 49.59 kpc (Pietrzynski et al. 2019), SMC 62.44 kpc (Graczyk et
al. 2020). The Milky Way is not in this file (it comes from the Milky Way layer, `src/sim/galaxy`).

**One distance scale around M31.** Savino et al. (2022, ApJ 938, 101, "The Hubble Space Telescope Survey of M31
Satellite Galaxies I") measured M31 and its satellites homogeneously with RR Lyrae stars and anchored their relative
geometry on their own M31 distance, mu = 24.45 +/- 0.06 (776.2 kpc). This file places M31 at the Cepheid distance of
Li et al. (2021, mu = 24.407 +/- 0.032, 761 kpc; the two agree within their errors), so the 33 satellites whose
LVDB distance is Savino et al.'s are scaled by 761/776.2 (-0.043 mag) and keep Savino et al.'s positions relative
to M31. M32 is then 6.4 kpc from M31 in 3D (3.4 kpc nearer to us), as in Savino et al.; mixing the two scales
unscaled would put it 11.7 kpc behind M31 (and the first version, which mixed McConnachie's scale with 761 kpc, put
it 44 kpc behind). M33 on the scaled RR Lyrae distance, 842 kpc, agrees with its Cepheid distance, 840 kpc.
Andromeda XXXVI has no distance of its own and sits at M31's, as in the LVDB. Satellites whose distances come from
other studies (TRGB and others) are left as published; each carries its own zero-point (typically 2-5%).

## named.json

Top level: `format` (`"lightspeed-named-extragalactic"`), `version`, `generated`, `frames`, `cosmology`
(the parameters above and the age), `cmbDipole`, `redshiftRecord` and `objects`. Each object:

| Field | Meaning |
| --- | --- |
| `id` | `andromeda`, `triangulum`, `lmc`, `smc`, `m81`, `m87`, `centaurus-a`, `sombrero`, `whirlpool`, `virgo-cluster`, `coma-cluster`, `bullet-cluster`, `gn-z11`, `jades-gs-z14-0`, `mom-z14` |
| `kind` | `galaxy`, `cluster`, `high-z-galaxy`; `recordHolder: true` on MoM-z14 |
| `ra`, `dec`, `positionRef` | SIMBAD position (via CDS Sesame) and the bibcode SIMBAD gives for it; MoM-z14 from its discovery paper |
| `galactic`, `ecliptic` | derived angles |
| `morphology` | `{type, class, ref}`; types from RC3 for the galaxies |
| `vHelio` or `zHelio` | measured heliocentric velocity or redshift with its source |
| `zCmb` | derived CMB-frame redshift (not for Local Group members, which do not take part in the Hubble flow) |
| `distance` | measured distance: `mpc`, errors, `dmod`, `method`, `ref` (and `note`) |
| `cosmology` | for z > 0.01: comoving, luminosity and angular-diameter distances (Mpc), lookback time and age at emission (Gyr), light-travel distance (Gly), from z_cmb |
| `positionEclMpc`, `positionBasis` | heliocentric ecliptic position: for Local Group members the measured distance as it is; beyond the Local Group the measured distance / (1 + z_cmb) when both exist, else the comoving distance from z_cmb. (The first version divided the LMC and SMC distances by 1 + z_helio, placing the LMC at 49.547 instead of 49.59 kpc.) |
| `disc` | see below |
| `size` | RC3: `d25Arcmin` (B = 25 mag/arcsec^2 isophotal diameter), `axisRatio`, `pa`, `bT`, `aG`; derived `r25Kpc` and `absMagB = B_T - A_g - dmod` |
| `cosmicWeb` | `index` of the galaxy in `cosmic-web.bin.gz`, its Cosmicflows-4 group (`groupPgc`), and for clusters `members: {first, count}`, a contiguous row range |

Values used (every one is in the file with its source):

| Object | Distance or redshift | Source |
| --- | --- | --- |
| Andromeda (M31) | 761 +/- 11 kpc | Li et al. 2021, ApJ 920, 84 (HST Cepheids) |
| Triangulum (M33) | mu = 24.622 +/- 0.030 (840 kpc) | Breuval et al. 2023, ApJ 951, 118 |
| LMC | 49.59 +/- 0.09 +/- 0.54 kpc | Pietrzynski et al. 2019, Nature 567, 200 |
| SMC | 62.44 +/- 0.47 +/- 0.81 kpc | Graczyk et al. 2020, ApJ 904, 13 |
| M81 | mu = 27.797 +/- 0.116 (3.63 Mpc) | Cosmicflows-4 group distance, Tully et al. 2023 |
| M87 | 16.8 +0.8/-0.7 Mpc; z = 0.004283 +/- 0.000017 (1284 km/s) | EHT Collaboration 2019, ApJL 875, L6; NED's preferred redshift, from Cappellari et al. 2011, MNRAS 413, 813 (ATLAS3D) |
| Centaurus A | mu = 27.804 +/- 0.038 (3.64 Mpc); z = 0.0018246 +/- 0.0000167 (547 km/s) | Cosmicflows-4, Tully et al. 2023; NED's preferred redshift (Baer-Way et al. 2024, ApJ 964, 172) |
| Sombrero (M104) | 9.55 +/- 0.13 +/- 0.31 Mpc | McQuinn et al. 2016, AJ 152, 144 (TRGB) |
| Whirlpool (M51) | 8.58 +/- 0.10 Mpc | McQuinn et al. 2016, ApJ 826, 21 (TRGB) |
| Virgo Cluster | 16.5 +/- 0.1 +/- 1.1 Mpc | Mei et al. 2007, ApJ 655, 144 (SBF) |
| Coma Cluster | 98.5 +/- 2.2 Mpc; z = 0.0234 | Scolnic et al. 2025, ApJL 979, L9 (SNe Ia); SIMBAD (Rines et al. 2016) |
| Bullet Cluster | z = 0.296 | Clowe et al. 2006, ApJ 648, L109 |
| GN-z11 | z = 10.603 | Bunker et al. 2023, A&A 677, A88 |
| JADES-GS-z14-0 | z = 14.1796 +/- 0.0007 | Carniani et al. 2025, A&A 696, A87 (ALMA [OIII]); discovery Carniani et al. 2024, Nature 633, 318 |
| MoM-z14 | z = 14.44 +/- 0.02 | Naidu et al. 2026, Open Journal of Astrophysics 9, doi:10.33232/001c.156033 |

Redshift record, checked on 25 September 2026 against the literature and news: MoM-z14 (z = 14.44,
JWST/NIRSpec, arXiv May 2025, published January 2026) is the most distant spectroscopically confirmed
galaxy, 283 Myr after the Big Bang in this cosmology. JADES-GS-z14-0 held the record from May 2024. No
later confirmation beyond z = 14.44 was found. Candidates at higher photometric redshift are not
confirmations.

Coma note for the Learn articles: the same supernova data calibrated to the Planck value H0 = 67.4 put
Coma at 111.8 +/- 1.8 Mpc instead of 98.5 (Scolnic et al. 2025): the Hubble tension on a single cluster.

### Disc orientation

For each disc galaxy the file gives the inclination i (0 = face-on), the position angle of the major axis
(`recedingPA` when the receding half is known, else `majorAxisPA`), `nearSidePA` when known, and
`rotationOnSky` when a source states it. From these, `axesEcl` holds unit vectors in the ecliptic frame:

- `major`: in the disc plane along the major axis (toward the receding end when known);
- `minor`: in the disc plane, perpendicular, projecting onto the sky toward PA + 90 deg;
- `normal`: the disc normal on the observer's side (`normal . lineOfSight = -cos i`);
- `spin`: the angular-momentum direction, or null if the sense of rotation is unknown.

Construction (ICRS; `n`, `e`, `r` = north, east, line of sight at the galaxy; `a` = the PA direction,
`b` = PA + 90 deg on the sky): `m = cos(i) b - s sin(i) r` with `s = +1` if the side at PA + 90 deg is
near, else -1; `normal = a x m`; `spin = -s normal` when the receding end and the near side are known,
`+normal` for counterclockwise and `-normal` for clockwise rotation on the sky (north up, east left).
A point of the disc at radius R and in-plane azimuth phi from the major axis is
`centre + R (cos(phi) major + sin(phi) minor)` (`discPoint`). Without a known near side the plane is
ambiguous (its mirror image in the sky plane fits the same ellipse); the side at PA + 90 deg is then
assumed near and `nearSideAssumed` is true. The app should draw these discs the same way from Earth
either way, but the tilt seen from elsewhere in 3D is a model choice for those galaxies.

| Galaxy | i, PA | Near side / rotation | Source |
| --- | --- | --- | --- |
| M31 | 77.7, receding 37.7 (NE) | west half near; spin (l, b) = (240.9, -30.2) | Corbelli et al. 2010, A&A 511, A89; agrees within 4 deg with Banik & Zhao 2017 (238.65, -26.89) |
| M33 | 52, receding 202 | not established (assumed) | Kam et al. 2017, AJ 154, 41 (optical i from Warner, Wright & Baldwin 1973) |
| LMC | 34.0, line of nodes 139.1 | NE near (PA 49.1), clockwise | van der Marel & Kallivayalil 2014, ApJ 781, 121 |
| SMC | 51, receding 66 (HI) | not established (assumed) | Di Teodoro et al. 2019, MNRAS 483, 392 |
| M81 | 59.0, receding 330.2 | not established (assumed) | de Blok et al. 2008, AJ 136, 2648 (THINGS) |
| M104 | ~84 (approximate), PA 90 | not established (assumed) | PA from RC3; "very close to 90 deg" per Jardel et al. 2011, ApJ 739, 21; 84 deg is a modelling choice |
| M51 | 22, PA 173 | not established (assumed) | Colombo et al. 2014, ApJ 784, 4 (PAWS) |

M87 and Centaurus A are given as ellipticals (RC3 axis ratio and size); Centaurus A's warped dust disc
is not modelled here.

## cosmic-web.bin.gz

Gzipped little-endian binary, structure of arrays (decode with `loadCosmicWeb()` / `decodeCosmicWeb()`).

Header, 64 bytes:

| Offset | Type | Value |
| --- | --- | --- |
| 0 | char[4] | `LSCW` |
| 4 | uint16 | format version, 1 |
| 6 | uint16 | header size, 64 |
| 8 | uint32 | N = 55,877 |
| 12 | uint32 | number of columns, 12 |
| 16 | uint32[12] | byte offset of each column from the start of the (decompressed) file |

Columns, each N long, in this order:

| Column | Type | Unit / scale | Missing |
| --- | --- | --- | --- |
| `ra` | float32 | deg, ICRS | |
| `dec` | float32 | deg, ICRS | |
| `vcmb` | int16 | km/s: cz of the galaxy in the CMB frame (CF4 `Vcmb`) | -32768 (46 dwarfs without a velocity) |
| `vgroup` | int16 | km/s: CMB-frame velocity of its group (CF4 table 4 `V3k`) | -32768 |
| `dm` | uint16 | distance modulus x 1000, all methods (CF4 `DM`) | 0 |
| `dmgroup` | uint16 | group distance modulus x 1000 on the calibrated scale (CF4 `DMzp`) | 0 |
| `ks` | uint16 | 2MASS Ks total magnitude x 1000 (`k_m_ext`), no extinction correction | 0 (5,316 galaxies) |
| `edm` | uint8 | uncertainty of `dm` x 100 (mag) | 0 |
| `edmgroup` | uint8 | uncertainty of `dmgroup` x 100 (mag) | 0 |
| `methods` | uint8 | bits: 1 SN Ia, 2 Tully-Fisher, 4 Fundamental Plane, 8 SBF, 16 SN II, 32 TRGB, 64 Cepheids, 128 maser | |
| `axisratio` | uint8 | 2MASS b/a x 100 (`sup_ba`) | 255 |
| `pa` | uint8 | 2MASS major-axis PA, deg E of N, [0, 180) (`sup_phi`) | 255 |

Rows are sorted by group distance (then group, then own distance), so the nearest galaxies come first
(row 0 is the LMC) and each group is a contiguous run (`groupRuns()`; Virgo and Coma ranges are in
`named.json`). Content: 438 galaxies within 10 Mpc, 2,219 within 30, 12,459 within 100, 55,373 within
500 (by group distance). The largest CMB-frame redshift is z = 0.109 (32,575 km/s); the farthest
measured group distance is ~700 Mpc comoving. Distances come from eight methods:
Fundamental Plane 42,223 galaxies, Tully-Fisher 12,222, SN Ia 1,004, SBF 469, TRGB 446, SN II 94,
Cepheids 69, masers 6.

Which distance to plot (`makeDistanceFn`, `worldPositions`):

| Mode | Distance | Use |
| --- | --- | --- |
| `measured` | `dmToMpc(dm) / (1 + z_cmb)` | true positions, but 15-25 % scatter per galaxy for TF and FP |
| `group` | same with `dmgroup` | errors averaged within groups; members share one distance |
| `redshift` | comoving D_C(z_cmb), Planck 2018 | the classic redshift-survey view, with fingers of God |
| `group-redshift` | D_C(z of the group) | fingers of God collapsed |
| `recommended` | `group` inside 30 Mpc, `group-redshift` beyond 60, blended between (the measured distance brought to the Planck scale, ×74.6/67.66, as the blend goes) | default for the fly-through |

"Distance estimate" stored per galaxy: the measured distance moduli (`dm`, `dmgroup`); the redshift
distance is computed from `vcmb` with the cosmology above (not stored, to keep the file under 1 MB). The
luminosity distance from a distance modulus is `10^((dm - 25)/5)` Mpc and the comoving distance
`D_L / (1 + z)`; using the observed z_cmb instead of the cosmological redshift errs by ~v_pec/c (~0.1 %).

## CMB textures

Source: WMAP nine-year Internal Linear Combination map (`wmap_ilc_9yr_v5.fits`, LAMBDA; Bennett et al.
2013, ApJS 208, 20). HEALPix NESTED, Nside = 512, galactic, 1 degree resolution, thermodynamic mK,
monopole and dipole removed. Resampled with 4 x 4 samples per output pixel using a HEALPix `ang2pix`
(checked against astropy-healpix on 20,000 random directions).

Layout of both images: equirectangular in galactic coordinates, as CMB maps are published (seen from
inside the sky): Galactic centre in the middle, l increasing to the left. For texture coordinates u (0 =
left edge) and v (0 = top row): `l = (180 - 360 u) mod 360`, `b = 90 - 180 v`. For a three.js texture
loaded with the default `flipY = true`, sample at `(u, 1 - v)`; `CMB_UV_GLSL` and
`worldToGalacticColumnMajor()` in `cmb.ts` do this from a world-space view direction.

Temperature -> pixel: `k = clamp(round(127.5 + dT / 1.9608 uK), 0, 255)`; decode `dT = (k - 127.5) x
500/255 uK` (`cmbCodeToMicroK`), so 0 = -250 uK and 255 = +250 uK. The quantisation step is 1.96 uK
(error <= 0.98 uK); 0.06 % of the sky lies beyond +/-250 uK and is clipped. The map rms is 71 uK.

- `cmb.png`: 8-bit palette PNG, 2048 x 1024; palette entry k is Moreland's cool-warm diverging colour
  map at k/255 (Moreland 2009, "Diverging Color Maps for Scientific Visualization", ISVC 2009, LNCS 5876),
  blue (59, 76, 192) through light grey to red (180, 4, 38), interpolated in Msh space. Load as sRGB.
- `cmb-data.png`: 8-bit greyscale, 1024 x 512, the code k itself, for shaders that apply their own colour
  map or contrast. Load as linear data (`NoColorSpace`), not sRGB. 1024 columns still give ~3 pixels per
  1-degree beam.

Both PNGs carry `tEXt` chunks with the title, credit and decoding rule.

The app must label the map "contrast enhanced": the colours span +/-250 uK around a mean of 2.7255 K, so
the real sky varies by about 1 part in 10^4 to 10^5. Seen without enhancement the CMB is uniform to the
eye. The kinematic dipole (+/-3.36 mK, the Sun's motion) was removed by WMAP; `cmbTemperatureSeenK` can
put it back, or add the much larger effect of the ship's own velocity.

## Sources, licences and credits

| Data | Source | Licence / terms | How used |
| --- | --- | --- | --- |
| Local Group and Local Volume dwarfs | Local Volume Database v1.1.1 (Pace 2025, The Open Journal of Astrophysics 8, 142, doi:10.33232/001c.144859; https://github.com/apace7/local_volume_database) | **CC0 1.0** (repository LICENSE, checked 25 September 2026). The author asks users to cite the overview paper, link the repository, and cite the input references, which the file does per value | 167 rows (positions, distances, velocities, proper motions, structure, luminosities, HI masses, metallicities) with their references |
| Cosmicflows-4 | Tully, R. B. et al. 2023, ApJ 944, 94, via CDS/VizieR J/ApJ/944/94 | CC BY 4.0 (article licence, confirmed on the IOP page) | all 55,877 galaxies of table 2 and group values of table 4; distances of M81 and Centaurus A |
| 2MASS Extended Source Catalog | Skrutskie et al. 2006, AJ 131, 1163; Jarrett et al. 2000; VizieR VII/233, matched with CDS XMatch | NASA/IPAC data, public with the required 2MASS acknowledgement | Ks, b/a, PA per cosmic-web galaxy (nearest XSC source within 6", 50,568 matches, 50,561 with a Ks magnitude; median offset 0.4") |
| WMAP 9-year ILC map | Bennett et al. 2013, ApJS 208, 20; NASA LAMBDA | NASA data, not subject to US copyright; credit "NASA / WMAP Science Team" | the CMB textures |
| RC3 | de Vaucouleurs et al. 1991, Third Reference Catalogue of Bright Galaxies, via VizieR VII/155 | individual catalogue values quoted with citation | D25, R25, PA, B_T, A_g and types of the 9 named galaxies |
| SIMBAD positions | Wenger et al. 2000, A&AS 143, 9, via CDS Sesame | free use with acknowledgement | positions of the named objects |
| Literature values | the papers listed in the tables above | facts quoted with citation | distances, redshifts, disc angles |
| NED | NASA/IPAC Extragalactic Database, preferred redshifts of M87 and Centaurus A | NASA/IPAC data, free with the NED acknowledgement | two redshifts |
| Colour map | Moreland 2009 | algorithm from the paper, implemented here | CMB palette |

Required acknowledgements (for the About page or the credits screen):

- "This research has made use of the SIMBAD database and the VizieR catalogue access tool, CDS,
  Strasbourg, France (DOI 10.26093/cds/vizier)."
- "This publication makes use of data products from the Two Micron All Sky Survey, which is a joint
  project of the University of Massachusetts and the Infrared Processing and Analysis Center/California
  Institute of Technology, funded by the National Aeronautics and Space Administration and the National
  Science Foundation."
- "CMB map: NASA / WMAP Science Team."
- "This work has made use of the Local Volume Database (https://github.com/apace7/local_volume_database;
  Pace 2025, The Open Journal of Astrophysics 8, 142)."
- "This research has made use of the NASA/IPAC Extragalactic Database (NED), which is funded by the National
  Aeronautics and Space Administration and operated by the California Institute of Technology."
- "Galaxy distances: Cosmicflows-4, Tully, R. B. et al. 2023, ApJ, 944, 94 (CC BY 4.0)."

Rows to add to `CREDITS.md`:

```
| `public/data/cosmic-web.bin.gz` | Derived from [Cosmicflows-4](https://doi.org/10.3847/1538-4357/ac94d8) (Tully et al. 2023, ApJ 944, 94) via CDS/VizieR, with Ks magnitudes, axis ratios and position angles from the [2MASS Extended Source Catalog](https://irsa.ipac.caltech.edu/Missions/2mass.html) (UMass/IPAC-Caltech, NASA, NSF) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (Cosmicflows-4); 2MASS data products with the 2MASS acknowledgement. This derived file is released under CC BY 4.0. |
| `public/data/local-galaxies.json.gz` | Derived from the [Local Volume Database](https://github.com/apace7/local_volume_database) v1.1.1 ([Pace 2025, The Open Journal of Astrophysics 8, 142](https://doi.org/10.33232/001c.144859)), every value with its original reference, plus published distances and disc angles of M31, M33 and the Magellanic Clouds cited in each row and RC3 sizes | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (Local Volume Database); the added values are facts quoted with citation |
| `public/textures/cmb.png`, `public/textures/cmb-data.png` | [WMAP 9-year ILC map](https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_get.html), NASA / WMAP Science Team, colour map after Moreland (2009) | NASA data, public domain |
```

And under "Other sources used by the code":

```
- Named galaxies and clusters (src/sim/cosmos/named.json): positions from SIMBAD (CDS); distances, redshifts
  and disc angles from the papers cited in the file; cosmology Planck 2018 (A&A 641, A6); CMB dipole
  Planck 2018 (A&A 641, A1).
```

### Not shipped, and why

- The updated nearby-galaxy catalogue of McConnachie (2012, AJ 144, 4), hosted by the CADC: the first version of
  `local-galaxies.json.gz` was derived from it, but its page only asks for the paper to be cited and states no
  licence or redistribution terms, and none could be confirmed. That file was removed and rebuilt from the Local
  Volume Database (CC0). The paper's tables on VizieR (J/AJ/144/4) are an AAS article from 2012 and have the same
  problem.
- 2MASS Redshift Survey (Huchra et al. 2012, ApJS 199, 26). Its README says "Please do not redistribute any
  of these files", and the ApJS article (2012) is AAS copyright, so reproducing its table needs permission.
  A point file derived from it would redistribute the survey. Cosmicflows-4 is used instead.
- Updated Nearby Galaxy Catalog (Karachentsev et al. 2013, AJ 145, 101): published before October 2021, so
  the AAS holds the copyright and table reproduction requires permission; no separate licence for the
  data could be confirmed. Cosmicflows-4 already covers the Local Volume with TRGB distances (446 galaxies).
- Planck SMICA map: the Planck Legacy Archive states no licence for the data products that could be
  confirmed. (A Zenodo record of the SMICA map labelled CC BY 4.0 appears to be a third-party upload,
  and an uploader cannot relicense ESA data.) WMAP's public-domain ILC map is used.
- No Gaia tables are used.

## Caveats (for the app's labels and the Learn articles)

- Redshift-space distortions. In `redshift` mode, galaxies in a cluster spread along the line of sight by
  their orbital speeds (~1000 km/s in Coma, 15 Mpc of false depth for a cluster ~3 Mpc across): the
  "fingers of God", all pointing at the observer. On large scales infall squashes structures along the line
  of sight (Kaiser 1987). The `group-redshift` mode removes the fingers; the test suite checks it on Coma.
- Local peculiar velocities. Within ~30 Mpc peculiar velocities (several hundred km/s) are comparable to
  the Hubble flow, and CMB-frame velocities include the Local Group's own ~630 km/s motion; redshift
  distances there are wrong. The `recommended` mode uses measured group distances inside 30 Mpc and redshift
  distances beyond 60, blended between: a hard switch at 30 Mpc left a shell about 3 Mpc deep nearly empty, since the
  two scales differ by 10% (below; `data.test.ts` checks the density just past 30 Mpc).
- Two distance scales. Measured distances (Cosmicflows-4, zero point set by Cepheids, TRGB and the NGC
  4258 maser) imply H0 = 74.6 +/- 0.8 (stat) +/- ~3 (sys) km/s/Mpc; redshift distances here use Planck's
  67.66. At large distance the two placements differ by ~10 %. This is the Hubble tension, not a bug.
- Measured-distance errors. Single Tully-Fisher or Fundamental Plane distances have 15-25 % errors; at
  200 Mpc that is 30-50 Mpc along the line of sight. Group averages are better.
- Selection. Cosmicflows-4 is a distance catalogue, not a complete census. 80 % of its galaxies are in the
  northern galactic hemisphere because the SDSS Fundamental Plane sample (34,000 galaxies to 30,000 km/s)
  covers the quadrant that is celestial north and galactic north; the south relies on 6dFGS to
  ~16,000 km/s. The density of points reflects surveys as well as structure.
- Zone of Avoidance. Dust and stars of the Milky Way hide galaxies within ~10 deg of the Galactic plane:
  only 312 of the 55,877 galaxies (0.6 %) are at |b| < 10 deg. Structures behind the plane (for example
  the Great Attractor region around the Norma cluster, l ~ 325, b ~ -7) are under-represented.
- 2MASS Ks magnitudes are not corrected for Galactic extinction (A_Ks ~ 0.3 E(B-V), below 0.05 mag for
  most of the sky) or K-corrected (< 0.1 mag at z < 0.1). 5,316 galaxies have no 2MASS Ks (faint or
  low surface brightness).
- The Cosmicflows-4 tables 3 and 4 list the Virgo group (1PGC 41220) at RA 220.8, Dec -23.9, which is not
  where Virgo is (its galaxies are at RA ~187, Dec ~12). Group positions are therefore not used; each
  galaxy keeps its own position.
- CMB. The ILC map is reliable on scales above ~10 deg; on smaller scales the bias correction is
  uncertain (LAMBDA), and residual foregrounds remain along the Galactic plane (visible as small spots at
  b ~ 0). The colours are contrast enhanced and 8-bit quantised (1.96 uK steps).
- Local Group. E(B-V) toward the LMC, SMC and M31 comes from far-infrared maps that include those
  galaxies' own dust. Many faint Milky Way satellites are flagged `ambiguous` (possibly star clusters).
  `velocityHelioEclKmS` is heliocentric: subtract the Sun's motion for Galactocentric speeds (the LMC is
  at ~520 km/s heliocentric, ~320 km/s Galactocentric).
- Discs are thin-disc models with one inclination; real discs warp (M31, M33) and the SMC is not a disc.
  M104's inclination is approximate. Where the near side is unknown the 3D tilt is one of two mirror
  solutions.
- The high-redshift galaxies are placed at their comoving distance "now". The light we see left them when
  they were 0.28-0.43 Gyr old and 11.6-15.5 times closer in proper distance (1 + z) (`angularDiameterDistanceMpc` is
  the proper distance at emission).

## Changes after the independent verification (25 September 2026)

The cosmic-web file, CMB maps, positions of the named objects, high-redshift distances and Cosmicflows-4 values were
confirmed against NED, VizieR and the papers. Fixed here:

- **Local Group catalogue licence.** `local-galaxies.json.gz` was derived from McConnachie's updated catalogue, whose
  licence could not be confirmed. It was removed and rebuilt from the Local Volume Database v1.1.1 (CC0 1.0): 169
  galaxies instead of 145, every value cited.
- **Mixed distance scales around M31.** The M31 satellites are now on one scale with M31 (M32 6.4 kpc from M31, not
  44 kpc behind it).
- **LMC and SMC positions** are no longer divided by 1 + z (Local Group members do not expand with the universe).
- **Redshifts of M87 and Centaurus A** are NED's preferred values (0.004283 and 0.0018246) instead of coarser ones.
- **Count.** 5,316 cosmic-web galaxies have no 2MASS Ks (the text said 5,309).

## In the app

### Loading

`src/sim/cosmos/load.ts`. Once the browser is idle after start-up, `loadCosmos` fetches `local-galaxies.json.gz`
(31 kB) and imports `named.json` (a chunk of its own, 8 kB gzipped) and registers 181 bodies in one call: the 169
galaxies of the Local Group's file, the 11 named objects it does not have, and the Local Group itself. The cosmos
worker (`worker.ts`, `cosmosData.ts`) then builds the particle templates (about 150 ms). The cosmic web loads only
when it is first wanted (the camera 1.5 Mpc from the Sun with the layer on 'auto', the layer turned on, or a scene
that shows it): the worker fetches, inflates and decodes it and places every galaxy in the Planck 2018 cosmology
(about 100 ms, the cosmology's tables included). A scene naming a galaxy target says "Loading the galaxies…" until
the bodies are in.

### Bodies

| What | Registry |
| --- | --- |
| Ids | named.json's ids; the Local Group's file's ids with the database key's underscores as hyphens (`lg-draco-2`, `lg-m-032`, `lg-ngc-0205`); `andromeda`, `triangulum`, `lmc`, `smc`; `local-group` |
| Kind | `galaxy`; the Virgo, Coma and Bullet clusters `cluster` with `kindText` "Cluster of galaxies"; the Local Group `cluster`, "Group of galaxies". All have renderer `layer`: no mesh, no point of light |
| Parent | the Milky Way's satellites (subgroup `MW`, the Magellanic Clouds included) `milky-way`; Andromeda's (subgroup `M31`, Triangulum included) `andromeda`; M87 `virgo-cluster`; the rest none |
| Position | the file's heliocentric place at the present (relative to the parent's), `approximate` within a million years of J2000 (a galaxy moves under a kiloparsec in that time), `illustrative` beyond. The Local Group's members (the satellites, and every galaxy inside its zero-velocity surface) and M87 in the Virgo cluster are held there; the rest take part in the expansion, at a(t) times their comoving places (see The expanding universe), and are not shown before 283 million years after the Big Bang. The four big galaxies take the Local Volume Database's centres; the young galaxies and the Bullet Cluster their comoving places |
| The Local Group | its barycentre, 0.55 of the way from the Milky Way's centre to Andromeda's; radius 0.96 Mpc, its zero-velocity surface (Karachentsev et al. 2009) |
| Brightness | `physical.luminous` from M_V: the database's L_V; for the named galaxies B_T − A_g − dmod − (B − V), with a B − V typical of the type (Fukugita, Shimasaku & Ichikawa 1995: M31 comes out at V = 3.4 from Earth, as observed); for the young galaxies their ultraviolet M_UV stands in for M_V (their spectra are nearly flat) |
| Size | discs: R25 (RC3); the others: the half-light radius (the database's, along the major axis; ellipticals known only by R25: 0.35 R25; a dwarf without a size: the median of those within a magnitude, and the card says so); the young galaxies: their measured half-light radii (Tacchella et al. 2023, Carniani et al. 2024, Naidu et al. 2026); Virgo and Coma: the radius within which half their Cosmicflows-4 members lie on the sky (0.91 and 1.36 Mpc, checked by the tests) |
| Label rank | the brightest first; dwarfs fainter than M_V = −8 after everything else, so they do not crowd the view from Earth |
| Cards | facts with sources (hand-written for the big and named ones; for the dwarfs from the database, with the dark-matter share from the stars' speeds, M½ ≈ 930 σ² R_e, Wolf et al. 2010); a model note on every galaxy; distances in millions and billions of light-years; the young galaxies' distance "now" (`deepSky.distanceNow`) with the lookback time, the age of the universe then and the distance when the light set out, as seen from the Solar System at the present; and, for every galaxy beyond the camera's own bound structure, a line computed for the camera's place and the clock's time (`sight.ts`): how long ago the light arriving now left it, the universe's age then, how much space stretched it, and with the ship's motion the frequency it arrives at |
| Articles | galaxies, the Bullet Cluster and the Local Group: island-universes; Virgo and Coma, the cosmic web and the CMB map (their cards' Read): the-expanding-universe; GN-z11, JADES-GS-z14-0 and MoM-z14: the-edge-of-reach |
| M87* | the black hole at M87's centre (`m87-star`, kind `black-hole`, renderer `lens`, parent `m87`), registered at the end of `registerCosmos` by `src/sim/blackholes/` with the EHT's mass, 6.5 × 10⁹ M☉ (stellar dynamics give 5.4–8.7 × 10⁹, on its card). It is given M87's anchor in the expanding universe, so its light-time, redshift and drawn place are its galaxy's; framed from 50 horizon radii (6,400 au), hovered over down to 19,196 km above its horizon, and a fall into it is offered (`docs/data/blackholes.md`). Search: "M87" finds the galaxy, "M87*" the hole |

### The galaxies as models

`src/sim/cosmos/templates.ts`, `records.ts`, `scene/Galaxies.tsx`, `render/shaders/galaxies.vert.glsl`. Each galaxy
is drawn with a particle template of its type, scaled, tilted and brightened to its measurements:

| Template | Particles | Used for |
| --- | --- | --- |
| early spiral, spiral, late spiral | 4,096 | Sa–Sab (M81), Sb–Sbc (M31, M51), Sc–Sd (M33): bulge, old disc, two logarithmic arms of young stars with H II regions; bulge share and pitch by type |
| barred | 4,096 | SB spirals (none of the named ones today) |
| Magellanic | 3,170 | the LMC: an off-centre bar, one main arm, clumps of young stars |
| lenticular | 4,100 | the Sombrero Galaxy: a big bulge, a thin smooth disc, a ring of dust |
| irregular | 2,048 | dwarf irregulars, transition dwarfs, the SMC |
| spheroidal | 1,024 | dwarf spheroidals and dwarf ellipticals (a Plummer sphere) |
| elliptical | 2,048 | M87, Centaurus A, M32 (a Hernquist sphere) |
| compact | 1,024 | the young galaxies (a compact blue body with clumps) |
| cluster | 3,072 | the Bullet Cluster: two groups of elliptical galaxies about 0.7 Mpc apart (illustrative) |

- **Orientation.** A disc with angles in named.json (M31, M33, the Magellanic Clouds, M81, M104, M51) takes its
  `axesEcl`; where the sense of rotation is known (M31, the LMC) the template is turned so that its arms trail it,
  elsewhere the winding is the template's. Where the near side is not known the plane drawn is one of two mirror
  images (the card says so). Galaxies known only as an ellipse on the sky take its position angle and axis ratio,
  with a depth along our line of sight equal to their width (said on the card); those without a measured
  orientation are round. The tests check that Andromeda seen from Earth is a 3.2°-long oval at position angle 37.7°
  with its minor axis foreshortened by cos 77.7°.
- **Light.** Each particle carries its share of the galaxy's L_V and is a Gaussian splat as wide as the distance to
  its eighth-nearest neighbour, drawn into the Milky Way's quarter-resolution target (`render/galaxyLayer.ts`) with
  the same display law and eye threshold as the Milky Way (22–24 mag/arcsec²), the same fill budget for large
  splats, and aberration and Doppler shift in flight. From far off most galaxies are faint smudges or nothing, as
  they would be to the eye: from 3 Mpc the Milky Way and Andromeda are about magnitude 6.
- **Dust.** A thin layer in the disc's plane dims each particle behind it by the face-on optical depth where the line
  of sight crosses it over |cos| of the crossing angle, and reddens it (Cardelli et al. 1989): spirals τ_V = 1 at the
  centre with a scale length of 0.35 R25 (Xilouris et al. 1999: dust scale lengths about 1.4 times the stars'), late
  spirals 0.6, the LMC 0.3, irregulars 0.15; the Sombrero's ring at half the disc's radius, widened by its thickness
  when seen at a grazing angle.
- **Detail only where it shows.** A galaxy is drawn with its template once its radius on screen passes 2 CSS px
  (fully from 6 px); below that it is one splat holding all its light, as wide as its half-light radius. From 90 px
  (fully from 180) a disc galaxy or an irregular is drawn with a fine version of its template (`HD_DETAIL`: 16
  times the particles, eight for the irregulars, as many H II regions), whose splats are correspondingly smaller; the
  two crossfade. The 8th neighbours are found with a k-d tree (exact); the fine templates are built after the plain ones, in the background (a few seconds). One
  instanced draw per template and one for the single splats; each galaxy's centre and axes are sent per frame, in
  kiloparsecs relative to the camera, worked out in float64 (float32 kilometres overflow at these distances).
- **M87's own starlight.** Inside M87 its template's particles near the camera fade out as their splats grow (they
  would be seen from inside), which would leave the sky round M87* dark and make its lens's Einstein disc read as a
  shadow twice its true size. A spherical model of M87's V-band light (the core-Sérsic fit of Ferrarese et al. 2006
  inside 25″, the Sérsic fit of Kormendy et al. 2009 outside, deprojected) fills in exactly the light those particles
  no longer draw, as part of the Milky Way layer's glow: from M87* at 1,000 au its sky is μ_V 14.0 mag/arcsec² all
  round and the shadow reads at its true radius, 18.1°. It costs 0.04 ms there (`docs/data/blackholes.md` §6).
- **Near a black hole** the galaxies are not bent one by one: their light, in the Milky Way layer's target, is
  resampled through the lens per pixel (`docs/data/blackholes.md` §10). Each keeps the look it has unbent, a single
  splat or its template, while its light is moved and magnified.
- **The sky map.** The Milky Way's sky from the Sun (NASA SVS, from Gaia DR2) holds the light of the Milky Way's
  satellites whose stars Gaia saw: measured on the map, the LMC comes out at V ≈ −0.4, the SMC 1.3 and Fornax 7.7,
  while M31 is absent (V ≈ 9 of excess) and M33 mostly so. The satellites (subgroup `MW`) are therefore faded in with
  the model of the Galaxy (the model's share, 100 to 500 pc from the Sun); every other galaxy is drawn from the Sun
  too.

### The cosmic web

`scene/CosmicWeb.tsx`, `render/shaders/cosmicWeb.vert.glsl`. The 55,877 galaxies, less those drawn as bodies of
their own (the named ones, linked by row, and 67 more of the Local Volume Database's, found on the sky: within 0.05°
of one and at a like distance, `duplicateRows`), at their 'recommended' comoving places (group distances inside
30 Mpc, group redshift distances beyond 60, blended between), in
megaparsecs with the camera as hi + lo floats, one draw call on the points layer (aberrated in flight). At the
clock's time each point is at its place plus (a − 1) times its anchor, and its map colour and brightness are those of
its light as it arrives, redshifted by the expansion and shifted by the ship's motion (see The expanding universe).
Colour by the kind of galaxy the distance method implies: orange for the Fundamental Plane and
surface-brightness fluctuations (ellipticals and lenticulars), blue for the Tully–Fisher relation (spirals and
irregulars), grey for the rest; size and brightness by Ks luminosity (L/L* with M*_Ks = −24.2, Kochanek et al.
2001), a little dimmer with distance, and faded out within 1.5 Mpc of the camera, where the bodies take over. Ahead
of a fast ship the sky is squeezed by 1/D and the whole web crowds into a few degrees: each point is drawn 1/D as
large (a faint one smaller still) and as much brighter, its light kept, and beyond four points to a pixel they are
drawn by lot (the same ones every frame, at least 48), each as bright as those left out, as the galaxy model draws its
large splats. The View
menu turns it on or off; 'auto' shows it from 3 Mpc from the Sun, fully from 8. The Virgo and Coma clusters are their
members' points: with the web turned off, the members of the cluster in focus or selected are still drawn (their rows
are one run of the file: `memberRange`), and the web's card with them. The web is not drawn once a − 1 passes 10³⁰
(some 1,500 billion years on), where its shader's positions would overflow float32; a web that failed to load is
tried again, 20 s later at the earliest, when next wanted. Its card (`ui/viewport/LayerCards.tsx`)
says it is a map, what the colours mean, and the survey's footprint: the northern galactic sky best covered, the zone
of avoidance, 15–25% errors on single distances, the two distance scales.

Since the galaxy surveys (30 September 2026; `docs/data/surveys.md`) the web draws with the display law the surveys
share (`render/shaders/galaxyMap.glsl`): a point's light is mapLight(L) × mapDepth(d), a product, and its size only
shapes it (alpha = light / area), where before its alpha and its size each depended on both L and d. The two laws agree
within about 25% for any one point (exactly for a point 3 px across) and the web looks as it did from home. The depth
cue's knee, 180 Mpc before, now follows the camera out (its distance from the Sun beyond 180 Mpc), and the expansion's
dimming is held to at most a factor of 100 beyond the ship's own shift, so from gigaparsecs away the web and the
surveys dim with distance alike and stay visible. Nothing else
about the web changed: the survey layer leaves out the galaxies that are in Cosmicflows-4, so none is drawn twice.

Near a black hole the web is bent point by point (a `LENS` variant of its shader, used only while a lens is drawn):
each galaxy at its primary image, magnified, with the gravitational blueshift in its colour. While the hole's Einstein
ring is more than 2° in radius (near M87*) a second draw of the same points shows their images bent round the far side
of the hole, so that the ring is filled with the web behind it rather than left dark.

### The CMB map

`scene/CmbMap.tsx`, `render/shaders/cmbMap.frag.glsl`. A layer of the sky, off unless the View menu or the scene
`cmb-map` turns it on: `cmb-data.png` (the linear temperature code) sampled along each pixel's direction turned from
world axes into galactic ones, and coloured black at the mean temperature, towards Moreland's blue below it and red
above it, with linear light as t² so that lightness grows about evenly with |ΔT|. Drawn in the plain view and the
plain half of the split view; the relativistic view shows the real background as the ship sees it. Its card always
shows its label: "Cosmic microwave background, contrast enhanced about 10,000 times; WMAP 9-year ILC, NASA/WMAP
Science Team". (`cmb.png`, the published colour version, is shipped with it and not drawn.) The pattern is the one
seen from the Solar System at the present: the sphere of last scattering about us, 13,900 Mpc away (comoving), with
most of its structure on the 147 Mpc scale of the sound horizon. Seen from elsewhere, or at another time (its radius
grows by the comoving distance light covers meanwhile, 307 Mpc per billion years now), the sky shows a different shell
of the early universe, whose pattern nobody can know, so the map fades out as the shell moves by 30 to 150 Mpc
(`cmbPatternShare` in `sim/cosmos/cmb.ts`), and its card gives the mean temperature then, 2.72548 K / a.

### The expanding universe

`src/sim/cosmicTime.ts`, `src/sim/cosmos/expansion.ts`, `sight.ts`, and the shaders above. The clock is cosmic time at
home, so the universe expands with it (docs/data/cosmology.md), with or without a flight.

- **World coordinates.** Proper positions at the clock's time, with home the origin of comoving coordinates (a = 1 at
  the present). An observer outside every bound structure at world position p is at comoving place p / a; inside the
  Local Group's zero-velocity surface the camera's comoving place is home.
- **Bound and unbound.** Every galaxy has an anchor, a comoving place: home for the Local Group's members (the
  satellites, and every galaxy inside the zero-velocity surface of Karachentsev et al. 2009, the flight planner's
  policy); the Virgo cluster's place for M87 and Virgo's members in the web; for the web's other points, the place of
  the named galaxy in their Cosmicflows-4 group if there is one, else the mean place of the group's members (groups of
  two or more are bound, being defined as collapsed haloes); its own place for a galaxy alone. A galaxy at comoving
  place x with anchor c is at a c + (x − c): unbound separations grow with a, bound ones do not. The tests check
  both, and that every group keeps its size.
- **Redshift and dimming.** For each galaxy the comoving distance χ between its anchor and the camera's gives the
  emission scale factor a_e from η(a_e) = η(a_o) − χ, by the cosmology module's emission table (1,024 cubic nodes,
  built in the cosmos worker, about 20 ms): on the CPU for the bodies (`emissionLnAFast`), on the GPU for the web (the
  module's GLSL, `texelFetch` from an R32F texture). The camera's horizons η(a_o) and χ_EH(a_o) come from the table
  itself (η + χ_EH = η∞ at every epoch, and ln a rises with ln(η / χ_EH)): 10⁻⁷ from the exact values at any epoch,
  ln(1 + z) to 2 × 10⁻⁷ (tested against `appearance`). The light that arrives is a black body at T seen at
  T D / (1 + z), D the ship's Doppler factor: colour from the black-body table at that temperature, and flux from its
  change in visible brightness and the solid angle (D⁻² from aberration, (1 + z)² from the angular-diameter
  distance), which with the bolometric radiance is exactly the module's D² L / 4π D_L² (tested for γ up to 10⁹, ahead
  and behind). Inside the camera's own bound structure there is no cosmological redshift.
- **Where it is seen.** With light-delayed positions on, a galaxy is drawn where its light left it: a_e χ along the
  comoving direction, the angular-diameter distance, so its size on the sky is the one really seen, and its flux
  takes (a_e / a_o)² to stay the flux that arrives. Otherwise it is drawn where it is now, a_o χ away.
- **Cards.** Each galaxy beyond the camera's bound structure says, for the camera's place and the clock's time,
  how long ago its light left, the universe's age then, the stretch, and in flight the frequency ratio D / (1 + z)
  (exact functions of the module); far from the present, that the distance line is the present one.
- **The background.** Its temperature is 2.72548 K / a at the clock's time (1.45 K ten billion years from now),
  seen ahead of the ship at that times the Doppler factor. Inside the Local Group the ship's motion is measured in
  the Sun's frame and composed with the Sun's own motion through the CMB (the dipole); beyond it, against the local
  comoving frame, the CMB's rest frame there.
- **Before the galaxies.** Galaxies taking part in the expansion, and the web, are not shown earlier than 283 million
  years after the Big Bang (MoM-z14, the earliest seen): where they were before is not modelled.

### Where you are

`src/ui/location.ts`: above every place, the levels of the universe it is in: "Observable universe › Local Universe ›
Local Group › Milky Way › …" for anything in the Galaxy, "… › Local Group › Andromeda Galaxy › M32", "Observable
universe › Local Universe › Virgo Cluster › M87", "Observable universe › GN-z11". The Local Group is what lies within
its zero-velocity surface (NGC 3109 at 1.3 Mpc is outside it); the local universe reaches redshift 0.1 (432.6 Mpc
comoving, about as far as distances are measured galaxy by galaxy); the rest is the observable universe. The Local
Group and the local universe are links to their views (`frameLocalGroup`, `frameCosmicWeb`). The footer shows only
the innermost level of the universe below 1,536 px and none below 1,280 px. Nebulae in the Magellanic Clouds come
under their galaxy.

### Lists, search and scenes

- The Bodies list: Galaxies (The Local Group, Beyond the Local Group, The most distant known), each satellite under
  its galaxy (the Milky Way's under the Milky Way); "Clusters, the cosmic web and the CMB" holds the Local Group, the
  three clusters, and two views that are not bodies: the cosmic web and the CMB map. Search finds all of them by name
  and alias ("M31", "LMC", "Cen A", "M104", "CMB", "cosmic web", "most distant galaxy").
- Scenes (`src/content/scenes.ts`): `local-group` (the Local Group from 3 Mpc, side-on to the line from the Milky Way
  to Andromeda, labels on), `cosmic-web` (200 Mpc out, above the supergalactic plane, the camera turning once in four
  minutes: `controller.spin`, stopped by any touch of the controls) and `cmb-map` (the map on, the view turning).
  `go:` works for every galaxy target; MoM-z14 joins `KNOWN_TARGETS`.
- Flights: the planner resolves every galaxy (the flights through the expanding universe are the flight planner's:
  `docs/data/cosmology.md`).

### Honest labels

- Every galaxy's shape is a model built from its measured size, orientation and brightness and the light profile
  typical of its type; its arms, clumps and dust are not a map of that galaxy.
- The young galaxies are placed at their comoving places, and drawn as JWST saw them, 13.4–13.5 billion years
  ago, redshifted and dimmed as a hot black body's light would be; in truth hydrogen absorbed everything bluer than
  121.6 nm, which the redshift has carried into the infrared, so to the eye they would be dark.
- Galaxies beyond the Local Group are held at their comoving places (their own motions, a few hundred km/s, are not
  followed), groups and clusters keep their size, and their light's redshift is drawn as a black body's; the
  cosmology is Planck 2018's.
- The CMB map is the pattern seen from the Solar System at the present.
- The cosmic web is a survey, not a census, drawn as a map; its distances are Cosmicflows-4's.
- The CMB map is contrast enhanced about 10,000 times.
- The Bullet Cluster's galaxies are illustrative.
- M87* is drawn without spin (not measured; a fast spin would make its shadow a few per cent smaller and shift it by
  about half its horizon's radius at the angle we see it from); its jet is not drawn; M87's own starlight round it is a smooth model of its
  measured light profile, not stars. Near a black hole the web follows its main image (and its second near M87*), and
  galaxies keep their unbent look while their light is bent.

### Performance

GPU timer queries in the development build (Intel Graphics, Chrome, 1936 × 1376 px, pixel ratio 2, best of 8 to 10
batches of 20 frames, the machine otherwise quiet): at Earth 4.8 ms (the galaxy layer now runs there for Andromeda and
Triangulum), the same with the CMB map; the `local-group` scene with the cosmic web on 4.4 ms; the `cosmic-web`
scene 4.1 ms; Andromeda face-on from 80 kpc 4.8 ms, from 25 kpc just above its disc 4.7 ms, inside its disc 4.7 ms;
the LMC face-on from 15 kpc 5.9 ms, inside it 5.8 ms; the Virgo Cluster 4.3 ms; the Sombrero 4.6 ms; the 1 g flight
to Andromeda at γ ≈ 10⁶ 5.6 ms, and 6.9 ms in the split view.

The expanding universe (26 September 2026, the same laptop at 1600 × 816 px, pixel ratio 2, with the processor at 100%
from other work, so all numbers are high): the web's own draw call, timed alone, costs 0.5 ms at rest, the redshift
lookup and black-body colours included (0.02 ms more than before). Before the crowding rules above it cost 6 to 10 ms
in flight from γ ≈ 100 to 10⁶ (every point blended over a hundred pixels in one small patch); now 0.4 to 0.5 ms at
every speed. Whole frames (best of three or four batches, 996 × 1084 px): 60 Mpc out with the web on, 1.9 ms at the
present and ten billion years ahead, 2.1 ms with light-delayed positions, 2.9 to 3.3 ms in the relativistic view from
γ = 2 to 10⁹, 4.4 ms in the split view at γ = 10⁴; at Earth 1.9 ms at the present and 4.0 ms ten billion years ahead,
where the star field drew all its stars (their motion is frozen beyond a million years; since the review below it
draws the 15,729 that can show then, docs/data/stars.md §11). With the processor busy (a file sync running) the
same scenes measured 0.5 to 1 ms more: the integrated GPU shares the laptop's power budget. The Milky Way model's
particles are no longer drawn into the galaxy layer while the model has no share of the sky (near the Sun).

Review of the whole universe (26 September 2026, evening; the same laptop, 1936 × 1376 px, pixel ratio 2, no
multisampling, GPU timer queries, best of batch medians, each change measured against the code before it in the same
minutes; the GPU ran warm, so whole frames read up to 15% higher than earlier in the day): at Earth 6.5 to 7.0 ms, ten
billion years ahead 7.3 (9.3 before: every star was drawn); the Milky Way from outside 5.5 to 6.5; the Local Group 4.1
to 4.5; the cosmic web 4.1 to 4.6, the same five billion years ahead, 3.5 with the clock racing at 30 Myr a second;
the CMB map 4.2 to 4.8; the Carina Nebula 6.5 (7.4); Sgr A* 6.4 (7.1). The 1 g flights: to Sgr A* 7.6 at the start
(8.0), 6.5 at the turnover, and 8.2, 7.2 and 8.0 in the split view at the start, the turnover and near the end (10.5,
9.3 and 10.2); to Andromeda 7.9 at the start (8.3) and 9.3 in the split view (10.5), 5.9 to 6.0 in the split view
later (6.7 to 6.8); to the Virgo Cluster 7.6 at the start (8.0), 5.3 at the turnover, 9.1 at the start of the split
view (10.6) and 5.8 later (6.1). CPU, development build: 2.3 to 5 ms a frame. What changed: the split view's classical
half is drawn only in its own columns; the Milky Way model's glow is drawn into the coarse target in the split view as
in the whole view (docs/data/galaxy.md §12); the remap pass no longer recolours an empty cube map; the star field
draws only the stars that can show away from the Sun and in the far past and future (docs/data/stars.md §11); and the
shaders drawn later are compiled in the background (`src/render/precompile.ts`). Still over the budget: the classical
view 100 to 500 pc from the Sun, where the sky map and the model hand over and both are drawn with every star (the
Pleiades, Betelgeuse, Rigel, the Helix and Orion nebulae: 9.3 to 10.3 ms warm), and the first seconds of a flight in
the split view (8.2 to 9.3 ms warm).

With the black holes (29 September 2026; 2,048 × 1,320 px, pixel ratio 2, no multisampling, medians of batch medians,
the processor 20–40 % busy; `docs/data/blackholes.md` §11): Earth 5.2 ms; hovering 1,000 au from M87*, its lens, the
web's second image and M87's starlight drawn, 5.6 ms (6.5 busier; M87 from 284.5 pc the evening before, 4.4), of which
the lens is 2.95 ms and M87's starlight 0.04; 480 pc from the Sun in the handover 7.0 (9.2 the evening before; 8.7 to
9.0 busier); the start of the 1 g flight's split view 7.5 (8.5 before; 8.2 to 8.8 busier), inside 8 ms on a quiet
machine and over it under load, for reasons outside the lens (every star drawn in both halves, the remap and the sky
map). The Pleiades end of the handover no longer draws the model below 1 % of the sky (2.5 to 2.9 ms saved); at the
other end the sky map is still drawn for its last 1 %, and drawing it at half resolution, which would save 0.6 to 2.1
ms anywhere near the Sun, is proposed there and not done.
