"""Builds the nuclear star cluster's statistical star field round Sagittarius A*, the laws of its glow, and M87's own
starlight: public/data/nsc-stars.bin.gz and src/sim/galaxy/nuclearGlow.json.

What. From Sgr A* the star catalogue has a handful of stars and the Galaxy model's nuclear cluster is 500 particles on
a 2-pc lattice, while an observer there would see millions of stars brighter than the eye's limit. This script draws
a model of the nuclear star cluster (NSC), the nuclear stellar disc (NSD) and the young stars of the central half
parsec from published density laws, star-formation histories and stellar isochrones, keeps as points the 60,000
stars that look brightest from the black hole (every young star among them), and writes the laws the app needs to
draw the light of all the others as a smooth glow (src/sim/galaxy/glow.ts, render/shaders/galaxyGlow.frag.glsl).
None of the stars is a real, individual star: it is a statistical field, and the app says so.

Components (lengths in pc from Sgr A*, frame G of src/sim/galaxy/frames.ts: z towards the north galactic pole):
  NSC   3D Nuker law of the stellar light (Schoedel et al. 2018, A&A 609, A27, their mean model: break radius
        r_b = 3.1 pc, inner slope gamma = 1.13, outer beta = 3.5, sharpness alpha = 10), flattened with axis ratio
        q = 0.71 along z (Schoedel et al. 2014, A&A 566, A47) in m^2 = R^2 + (z/q)^2, truncated at m = 50 pc as the
        Galaxy model's cluster is (model.json nuclearStarCluster.rmax). Old and intermediate-age stars: the
        star-formation history of Schoedel et al. 2020 (A&A 641, A102; Table 3, 1.5 times solar metallicity, young
        stars excluded: 82 % 13 Gyr, 13 % 3 Gyr, the rest 30 Myr to 1 Gyr).
  NSD   the Galaxy model's law (model.json nuclearStellarDisc: (R/90 pc)^-1.3 inside 90 pc, (R/90 pc)^-3 to 230 pc,
        exp(-|z|/45 pc), R >= 3 pc), so that it replaces the model's particles exactly; star-formation history after
        Nogueras-Lara et al. 2020 (Nature Astronomy 4, 377): 90 % older than 8 Gyr, 5 % about 1 Gyr ago, about 5 % in
        the last 500 Myr, 1.7 % of it in the last 30 Myr (0.2-0.8 Msun/yr).
  Young the 3-4 Myr old stars of the central half parsec (Lu et al. 2013, ApJ 764, 155: IMF dN/dm ~ m^-1.7 from 1 to
        150 Msun, 1.4-3.7 x 10^4 Msun above 1 Msun; 2.5 x 10^4 used), 20 % in the clockwise disc (Yelda et al. 2014,
        ApJ 783, 131: normal (i, Omega) = (130, 96) deg, surface density ~ R^-1.9; Paumard et al. 2006, ApJ 643, 1011)
        and 80 % in an isotropic cusp with surface density ~ R^-1.14 (Do et al. 2013 via Yelda et al. 2014), from 0.04
        to 0.5 pc. Ages spread over 4.0 and 4.2 Myr (10^6.60 and 10^6.62 yr, equal masses), by Lu et al.'s solution
        of 3.9 Myr (inside their 2.5-5.8 Myr): there the formulae below have stripped the stars above ~60 Msun to
        some 45 naked helium stars (the Galactic Centre shows ~30 Wolf-Rayet stars and blue supergiants, Paumard et
        al. 2006); a little younger they leave those stars on the main sequence, brighter in V than any seen there,
        and from 4.3 Myr they make red supergiants, of which the central half parsec has one (IRS 7).
  Normalisation: the V luminosity of NSC + young stars equals the Galaxy model's NSC share (0.06 % of the Galaxy's
        L_V, model.json luminosity) and the NSD's the model's NSD share (1.5 %), so the field hands over from the model's
        particles without a jump (the app cross-fades them between 30 and 60 pc from Sgr A*). The young stars are a
        realisation (every one of them is a point); the NSC's old light is the model's share less theirs.

Stellar populations: isochrones from the single-star formulae of Hurley, Pols & Tout 2000 (MNRAS 315, 543;
src/sim/stars/sse.ts, the app's own, at Z = 0.02), with their main-sequence winds and naked helium stars, made by
scripts/nsc-isochrones.mjs (see its header); Kroupa (2001) IMF (0.08-150 Msun) for all but the young stars. The
formulae are solar in metallicity: the old stars' +0.26 dex (Feldmeier-Krause et al. 2017, MNRAS 464, 194) is not
modelled, which leaves them some 0.05 mag bluer in B - V and 15-20 % brighter per solar mass than metal-rich models.
Magnitudes: M_V = 4.73 - 2.5 log L - BC_V with Flower's (1996, ApJ 469, 355) bolometric corrections as corrected by
Torres (2010, AJ 140, 1158, Table 1; as src/sim/stars/photometry.ts), held below 3,100 K and continued above 50,000 K
by a blackbody's V flux; B - V from Flower's colour-temperature relation for dwarfs, subgiants and giants (Torres 2010,
Table 2), inverted; V - Ks from Pecaut & Mamajek's (2013, ApJS 208, 9, Table 5) dwarf sequence (it serves only the
star-count check below). Each isochrone segment is split into 16 mass bins, each with its number of stars per solar
mass formed, M_V, M_B, M_Ks and T_eff (linear in initial mass along the segment). Nothing is downloaded.

Points. A star at distance r from Sgr A* looks as bright from the hole as m_hole = M_V + 5 log10(r / 10 pc). The
points are every young star plus the old stars with m_hole < m_split, m_split set so that there are 60,000 points in
all: for each component the density of points is its luminosity density times the number of stars brighter than
M_lim(r) = m_split - 5 log10(r / 10 pc) per solar luminosity (from the binned luminosity function), sampled exactly
(radius by the inverse of its cumulative distribution on a fine grid, direction by rejection against the flattened
law, M_V from the luminosity function below M_lim). No star lies within 0.04 pc of Sgr A* (only GRAVITY's four
S-stars are drawn there, as bodies), none beyond 300 pc. The file is sorted by m_hole, brightest first: the app draws
the first 60,000, 30,000 or 10,000 (the lens's quality rungs 0, 1 and 2).

Glow. The rest of the light: each component's luminosity density times 1 - s(r), s(r) = the share of its light in
stars brighter than M_lim(r), tabulated at 64 radii from 0.04 to 300 pc, one table for each count of points drawn
(for a count N, the split is halfway between the last old star among the first N and the next), each scaled by the
realisation's ratio of the points' light to its expectation, so that the points and the glow add up to each
component's law exactly at every count; the checks below measure the realisation. The glow's colour, the summed
colour of the stars it holds, is written for each count too.

M87's starlight (for the view from M87*). A spherical model of M87's V-band light: inside 25 arcsec the core-Sersic
fit of Ferrarese et al. 2006 (ApJS 164, 334, Table 3, VCC 1316, g band: mu_e = 23.45, gamma = 0.322, n = 6.094,
r_e = 163.83", r_b = 7.15"), shifted to V by -0.527 mag (the median difference from Kormendy et al. 2009's V
photometry between 0.5 and 150 arcsec); outside it the Sersic fit of Kormendy et al. 2009 (ApJS 182, 216, Table 1,
NGC 4486: n = 11.84, r_e = 703.91", mu_e = 25.71). Circularised with the measured ellipticity (0.05 inside 10",
0.14 at 100", 0.33 at 400", 0.45 beyond 1000"), less Galactic extinction A_V = 0.072, at the app's distance of
16.71 Mpc, and deprojected by Abel's integral into a luminosity density j(r) tabulated from 10^-3 to 3 x 10^5 pc.
Inside 0.1" (8 pc) the core's power law is an extrapolation; inside 1,000 au (0.00485 pc) j is held constant.
The app leaves to this glow only the light that M87's model galaxy (its elliptical template's particles,
src/sim/cosmos/templates.ts) no longer draws near the camera, reading the template's splat sizes itself.

Checks (printed and written to the JSON's "checks"): the points' realised light against its expectation; L_V within
5 and 50 pc against the Galaxy model's; the projected surface brightness from Earth (no dust) against the model's
NSC + NSD; the number density at 4.9 pc of NSC stars with observed 17.5 <= Ks <= 18.5 (A_Ks = 2.6 +- 0.2) against
Gallego-Cano et al. 2018 (A&A 609, A26: 52 +- 12 pc^-3, their Nuker fit at the break radius), within x1.5; the
apparent-magnitude distribution of the points from Sgr A*; no point inside 0.04 pc; M87's model against both fits.

Output file (little-endian; gzip with mtime 0, so the same seed gives the same bytes): header 'NSC1', uint32 count,
float32 splitAbsMag (m_split), float32 innerPc, float32 outerPc, uint32 seed, 8 float32 reserved (0); then count x
float32[3] positions (pc from Sgr A*, J2000 ecliptic axes), count x int16 M_V x 100, count x uint16 T_eff (K,
clamped to 65,535). nuclearGlow.json records the SHA-256 of the uncompressed bytes.

Determinism: numpy's PCG64 bit generator (its raw 64-bit stream is fixed across numpy versions) with seed 20260929,
turned into doubles and normal deviates here. `--verify` rebuilds in memory and compares with the files on disk.

Run: python scripts/build-nsc.py [--verify]   (Python 3.10+, numpy, and Node for the isochrones; no network). About
half a minute, most of it the isochrones.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import math
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ISO_SCRIPT = ROOT / "scripts" / "nsc-isochrones.mjs"
MODEL_JSON = ROOT / "src" / "sim" / "galaxy" / "model.json"
OUT_BIN = ROOT / "public" / "data" / "nsc-stars.bin.gz"
OUT_JSON = ROOT / "src" / "sim" / "galaxy" / "nuclearGlow.json"

SEED = 20260929
COUNT = 60000
INNER_PC = 0.04
OUTER_PC = 300.0
M_V_SUN = 4.83
M_B_SUN = 5.44
DM_GC = 5 * math.log10(8277.0 / 10.0)  # distance modulus of Sgr A* (GRAVITY 2022, R0 = 8.277 kpc)
MU_OF_SIGMA = 26.402  # mu_V (mag/arcsec^2) of 1 Lsun/pc^2 with M_V,sun = 4.83

# The Nuker law of the NSC's light (Schoedel et al. 2018, mean model) and its flattening (Schoedel et al. 2014).
NSC_RB, NSC_GAMMA, NSC_BETA, NSC_ALPHA, NSC_Q, NSC_MMAX = 3.1, 1.13, 3.5, 10.0, 0.71, 50.0

# Old and intermediate-age populations: log10(age/yr) -> fraction of the initially formed mass.
NSC_SFH = {10.10: 0.821, 9.50: 0.131, 9.00: 0.002, 8.90: 0.005, 8.70: 0.035, 8.40: 0.002, 7.90: 0.003, 7.50: 0.002}
NSD_SFH = {10.10: 0.900, 9.00: 0.050, 8.70: 0.017, 8.30: 0.008, 8.00: 0.008, 7.50: 0.017}
YOUNG_AGES = (6.60, 6.62)
YOUNG_MASS = 2.5e4
YOUNG_SLOPE = 1.7
YOUNG_MRANGE = (1.0, 150.0)
YOUNG_DISC_SHARE = 0.20
YOUNG_DISC_I, YOUNG_DISC_OMEGA = 130.0, 96.0  # deg, sky frame (Yelda et al. 2014)
YOUNG_DISC_SPREAD_DEG = 10.0  # the disc's intrinsic thickness as a tilt of each star's orbit (h/R ~ 0.18)
YOUNG_R = (0.04, 0.5)
SUB = 16  # mass bins per isochrone segment

SHARE_RADII = 64
# The app draws the first 60,000, 30,000 or 10,000 points (the lens's quality rungs 0, 1 and 2): a share table for each.
SHARE_COUNTS = (60000, 30000, 10000)
EXCLUDE_PC = 0.01  # the app leaves points within this of the camera in the glow

# Frames (src/sim/galaxy/frames.ts, the same numbers).
ICRS_TO_GAL = np.array([
    [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
    [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
    [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
])
EPS = math.radians(84381.448 / 3600.0)
RX = np.array([[1, 0, 0], [0, math.cos(EPS), -math.sin(EPS)], [0, math.sin(EPS), math.cos(EPS)]])
ECL_TO_GAL = ICRS_TO_GAL @ RX
GAL_TO_G_ROT = np.array([
    [0.9999980695118587, -0.0009727463073357, 0.0017072601380173],
    [0.0009729203334801, 0.9999995216017424, -0.0001011054434291],
    [-0.0017071609713203, 0.0001027662763491, 0.9999985375191858],
])
G_TO_ECL = ECL_TO_GAL.T @ GAL_TO_G_ROT.T
SGRA_RA, SGRA_DEC = 266.4168370833, -29.0078105556  # Reid & Brunthaler 2004 (model.json sgrA_icrs)

# M87's light profile.
M87_DIST_MPC = 16.71  # where the app places M87 (docs/data/cosmos.md: 16.8 Mpc / (1 + z_cmb))
M87_FERRARESE = dict(mue=23.45, gamma=0.322, n=6.094, re=163.83, rb=7.15)
M87_G_TO_V = 0.527
M87_KORMENDY = dict(n=11.84, re=703.91, mue=25.71)
M87_JOIN_ARCSEC = 25.0
M87_AV = 0.072
M87_ELL = [(0.01, 0.05), (10.0, 0.05), (100.0, 0.14), (400.0, 0.33), (1000.0, 0.45), (1e6, 0.45)]
M87_R_FLAT_PC = 1000 * 4.8481368e-6  # 1,000 au
M87_TABLE = (1e-3, 3e5, 256)
M87_BV = 0.96  # the elliptical template's colour (src/sim/cosmos/templates.ts), typical of giant ellipticals


# ─── Random numbers ───────────────────────────────────────────────────────────────────────────────────────────────


class Rng:
    """Uniform doubles from PCG64's raw stream (fixed across numpy versions) and Box-Muller normals."""

    def __init__(self, seed: int):
        self.bg = np.random.PCG64(seed)

    def uniform(self, n: int) -> np.ndarray:
        raw = self.bg.random_raw(n).astype(np.uint64)
        return ((raw >> np.uint64(11)).astype(np.float64) + 0.5) * (1.0 / 9007199254740992.0)

    def normal(self, n: int) -> np.ndarray:
        u1 = self.uniform(n)
        u2 = self.uniform(n)
        return np.sqrt(-2.0 * np.log(u1)) * np.cos(2 * np.pi * u2)


# ─── Isochrones and luminosity functions ──────────────────────────────────────────────────────────────────────────


# Flower 1996's bolometric correction BC_V(log T_eff) with Torres 2010's coefficients (Table 1), as
# src/sim/stars/photometry.ts has it, and M_bol,sun = 4.73 to go with it (Torres 2010).
BC_COEFFS = (
    (-0.190537291496456e5, 0.155144866764412e5, -0.421278819301717e4, 0.381476328422343e3),
    (-0.370510203809015e5, 0.385672629965804e5, -0.150651486316025e5, 0.261724637119416e4, -0.170623810323864e3),
    (-0.118115450538963e6, 0.137145973583929e6, -0.636233812100225e5, 0.147412923562646e5, -0.170587278406872e4, 0.788731721804990e2),
)
# Flower 1996's log T_eff(B - V) for main-sequence stars, subgiants and giants (Torres 2010, Table 2).
BV_COEFFS = (3.979145106714099, -0.654992268598245, 1.740690042385095, -4.608815154057166, 6.792599779944473, -5.396909891322525, 2.192970376522490, -0.359495739295671)
M_BOL_SUN = 4.73
T_LO, T_HI = 3100.0, 50000.0  # where Flower's polynomials hold (photometry.ts clamps to the same)
# V - Ks against T_eff of dwarfs, Pecaut & Mamajek 2013 (ApJS 208, 9, Table 5; Mamajek's v2022.04.16), O9V to M6V.
VKS_TABLE = (
    (2810, 7.10), (3060, 5.95), (3210, 5.25), (3430, 4.60), (3560, 4.23), (3850, 3.65), (4100, 3.35), (4440, 2.88),
    (4830, 2.40), (5270, 1.953), (5660, 1.635), (5930, 1.437), (6550, 1.079), (7220, 0.734), (8100, 0.403),
    (9700, 0.041), (12300, -0.254), (15700, -0.380), (17000, -0.492), (20600, -0.602), (26000, -0.874), (33300, -1.000),
)


def _poly(c, x):
    return sum(ci * x**i for i, ci in enumerate(c))


def bc_v(logt: np.ndarray) -> np.ndarray:
    """Flower's BC_V between 3,100 and 50,000 K, held below; above, a blackbody's V flux against its total."""
    lt = np.clip(logt, math.log10(T_LO), math.log10(T_HI))
    bc = np.where(lt < 3.70, _poly(BC_COEFFS[0], lt), np.where(lt < 3.90, _poly(BC_COEFFS[1], lt), _poly(BC_COEFFS[2], lt)))
    x = 1.4388e-2 / 0.55e-6  # h c / (k lambda_V), K

    def planck_over_t4(t):
        return 1.0 / (np.expm1(x / t) * t**4)

    hot = np.maximum(10**logt, T_HI)
    return bc + 2.5 * np.log10(planck_over_t4(hot) / planck_over_t4(T_HI))


_BV_GRID = np.linspace(-0.40, 1.80, 2201)
_LT_GRID = _poly(BV_COEFFS, _BV_GRID)
assert np.all(np.diff(_LT_GRID) < 0), "Flower's colour-temperature relation should fall monotonically over the grid"


def b_minus_v(logt: np.ndarray) -> np.ndarray:
    """B - V from Flower's relation, inverted; held at the ends of its grid (-0.40 to 1.80) and outside 3,100-50,000 K."""
    lt = np.clip(logt, math.log10(T_LO), math.log10(T_HI))
    return np.interp(-lt, -_LT_GRID, _BV_GRID)


def v_minus_ks(logt: np.ndarray) -> np.ndarray:
    t = np.array(VKS_TABLE)
    return np.interp(logt, np.log10(t[:, 0]), t[:, 1])


def read_isochrones(ages: set[float]) -> dict[float, np.ndarray]:
    """Isochrones at the wanted log ages from Hurley, Pols & Tout's formulae (scripts/nsc-isochrones.mjs), with Flower's
    bolometric corrections and colours: rows of initial mass, log T_eff, M_B, M_V, M_Ks, phase (HPT's type k)."""
    keys = sorted(f"{a:.2f}" for a in ages)
    run = subprocess.run(["node", str(ISO_SCRIPT), *keys], capture_output=True, text=True, check=True, cwd=ROOT)
    raw = json.loads(run.stdout)
    out = {}
    for a in ages:
        r = np.array(raw[f"{a:.2f}"], dtype=float)
        logl, logt = r[:, 1], r[:, 2]
        mv = M_BOL_SUN - 2.5 * logl - bc_v(logt)
        out[a] = np.stack([r[:, 0], logt, mv + b_minus_v(logt), mv, mv - v_minus_ks(logt), r[:, 3]], axis=1)
    return out


def kroupa(m: np.ndarray) -> np.ndarray:
    return np.where(m < 0.5, (m / 0.5) ** -1.3, (m / 0.5) ** -2.3)


def imf_mass_norm(imf, lo: float, hi: float) -> float:
    m = np.geomspace(lo, hi, 200001)
    return float(np.trapezoid(imf(m) * m, m))


def lf_bins(iso: np.ndarray, imf, norm: float, fraction: float) -> np.ndarray:
    """Mass bins of one isochrone: stars per solar mass formed (times fraction), M_V, M_B, M_Ks, log T_eff, phase."""
    rows = []
    m = iso[:, 0]
    for i in range(len(iso) - 1):
        m0, m1 = m[i], m[i + 1]
        if not m1 > m0:
            continue  # repeated or backward initial masses: no stars
        for k in range(SUB):
            a = m0 + (m1 - m0) * k / SUB
            b = m0 + (m1 - m0) * (k + 1) / SUB
            t = (k + 0.5) / SUB
            mm = np.linspace(a, b, 5)
            n = float(np.trapezoid(imf(mm), mm)) / norm * fraction
            r = iso[i] * (1 - t) + iso[i + 1] * t
            rows.append((n, r[3], r[2], r[4], r[1], iso[i, 5]))
    return np.array(rows)


class Lf:
    """A population's luminosity function, sorted brightest first, per solar luminosity of V light."""

    def __init__(self, bins: np.ndarray):
        o = np.argsort(bins[:, 1], kind="stable")
        self.b = bins[o]
        self.lum = self.b[:, 0] * 10 ** (-0.4 * (self.b[:, 1] - M_V_SUN))
        self.lv_per_msun = float(self.lum.sum())
        self.cum_n = np.cumsum(self.b[:, 0]) / self.lv_per_msun  # stars brighter than bin i, per Lsun
        self.cum_l = np.cumsum(self.lum) / self.lv_per_msun  # share of the light in them
        self.mv = self.b[:, 1]

    def n_brighter(self, mlim: np.ndarray) -> np.ndarray:
        k = np.searchsorted(self.mv, mlim, side="left")
        return np.where(k > 0, self.cum_n[np.maximum(k - 1, 0)], 0.0)

    def share_brighter(self, mlim: np.ndarray) -> np.ndarray:
        k = np.searchsorted(self.mv, mlim, side="left")
        return np.where(k > 0, self.cum_l[np.maximum(k - 1, 0)], 0.0)

    def colour_bv(self, weight: np.ndarray | None = None) -> float:
        w = self.b[:, 0] if weight is None else self.b[:, 0] * weight
        fb = np.sum(w * 10 ** (-0.4 * self.b[:, 2]))
        fv = np.sum(w * 10 ** (-0.4 * self.b[:, 1]))
        return float(-2.5 * np.log10(fb / fv))

    def draw(self, mlim: np.ndarray, u: np.ndarray) -> np.ndarray:
        """Bin indices of stars drawn below each limit (u uniform in (0, 1))."""
        k = np.searchsorted(self.mv, mlim, side="left")
        top = np.where(k > 0, self.cum_n[np.maximum(k - 1, 0)], 0.0)
        idx = np.searchsorted(self.cum_n, u * top, side="right")
        return np.minimum(idx, np.maximum(k - 1, 0))


# ─── Density laws (luminosity per pc^3 up to a constant; frame G, pc) ─────────────────────────────────────────────


def nuker(m: np.ndarray) -> np.ndarray:
    x = m / NSC_RB
    return x ** -NSC_GAMMA * (1 + x**NSC_ALPHA) ** ((NSC_GAMMA - NSC_BETA) / NSC_ALPHA)


class Laws:
    def __init__(self, model: dict):
        c = model["components"]["nuclearStellarDisc"]
        v = lambda p: p["value"] if isinstance(p, dict) else p  # noqa: E731
        self.nsd_rb = v(c["rb"]) * 1000
        self.nsd_edge = v(c["Redge"]) * 1000
        self.nsd_hz = v(c["hz"]) * 1000
        self.nsd_rmin = v(c["Rmin"]) * 1000
        self.nsc_rho0 = 1.0
        self.nsd_rho0 = 1.0

    def nsc(self, R: np.ndarray, z: np.ndarray) -> np.ndarray:
        m = np.sqrt(R * R + (z / NSC_Q) ** 2)
        r = np.sqrt(R * R + z * z)
        return np.where((m <= NSC_MMAX) & (r >= INNER_PC), self.nsc_rho0 * nuker(np.maximum(m, 1e-9)), 0.0)

    def nsd(self, R: np.ndarray, z: np.ndarray) -> np.ndarray:
        x = R / self.nsd_rb
        rad = np.where(R < self.nsd_rb, x**-1.3, x**-3.0)
        ok = (R >= self.nsd_rmin) & (R < self.nsd_edge) & (R * R + z * z <= OUTER_PC**2)
        return np.where(ok, self.nsd_rho0 * rad * np.exp(-np.abs(z) / self.nsd_hz), 0.0)


# Shell tables: dL/dln r on a fine grid, and the angular profile for rejection sampling.
LNR = np.linspace(math.log(INNER_PC), math.log(OUTER_PC), 6001)
MU = (np.arange(4000) + 0.5) / 4000  # cos(theta) in (0, 1): both laws are symmetric in z


def shell(law, lnr: np.ndarray = LNR) -> np.ndarray:
    r = np.exp(lnr)[:, None]
    R = r * np.sqrt(1 - MU[None, :] ** 2)
    z = r * MU[None, :]
    j = law(R, z)
    return 4 * np.pi * r[:, 0] ** 3 * j.mean(axis=1)  # dL/dln r = r^3 * integral over the sphere


def integrate_lnr(y: np.ndarray, lnr: np.ndarray = LNR) -> float:
    return float(np.trapezoid(y, lnr))


# ─── Frames ───────────────────────────────────────────────────────────────────────────────────────────────────────


def sky_to_ecl(v: np.ndarray) -> np.ndarray:
    a, d = math.radians(SGRA_RA), math.radians(SGRA_DEC)
    east = np.array([-math.sin(a), math.cos(a), 0.0])
    north = np.array([-math.sin(d) * math.cos(a), -math.sin(d) * math.sin(a), math.cos(d)])
    away = np.array([math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)])
    icrs = v[:, 0:1] * east + v[:, 1:2] * north + v[:, 2:3] * away
    return icrs @ RX  # v_ecl = RX^T v_icrs


# ─── The field ────────────────────────────────────────────────────────────────────────────────────────────────────


def sample_old(rng: Rng, law, lf: Lf, n: int, msplit: float, shell_l: np.ndarray):
    """n points of one old component: positions (frame G, pc) and LF bin indices."""
    mlim = msplit - 5 * (LNR / math.log(10) - 1)
    dens = shell_l * lf.n_brighter(mlim)
    cdf = np.concatenate([[0], np.cumsum(0.5 * (dens[1:] + dens[:-1]) * np.diff(LNR))])
    cdf /= cdf[-1]
    lnr = np.interp(rng.uniform(n), cdf, LNR)
    r = np.exp(lnr)
    # Direction: cos(theta) by rejection against the law's angular profile at that radius (both halves of z alike).
    mu = np.empty(n)
    todo = np.arange(n)
    peak = np.empty(n)
    grid = (np.arange(512) + 0.5) / 512
    for c0 in range(0, n, 4096):
        rc = r[c0 : c0 + 4096, None]
        # the grid, and just inside the edge of the NSD's inner cut (R = its R_min), where its maximum can sit
        edge = np.sqrt(np.clip(1 - (3.0 / rc) ** 2, 0, 1)) * (1 - 1e-9)
        mus = np.concatenate([np.broadcast_to(grid, (rc.shape[0], grid.size)), edge], axis=1)
        peak[c0 : c0 + 4096] = law(rc * np.sqrt(1 - mus**2), rc * mus).max(axis=1) * 1.05
    while todo.size:
        m = rng.uniform(todo.size)
        y = rng.uniform(todo.size) * peak[todo]
        rr = r[todo]
        ok = law(rr * np.sqrt(1 - m * m), rr * m) >= y
        mu[todo[ok]] = m[ok]
        todo = todo[~ok]
    sign = np.where(rng.uniform(n) < 0.5, -1.0, 1.0)
    phi = 2 * np.pi * rng.uniform(n)
    s = np.sqrt(1 - mu * mu)
    pos = np.stack([r * s * np.cos(phi), r * s * np.sin(phi), r * mu * sign], axis=1)
    bins = lf.draw(msplit - 5 * (np.log10(r) - 1), rng.uniform(n))
    return pos, bins


def interp_iso(iso: np.ndarray, m: np.ndarray):
    """Rows of the isochrone at initial masses m (NaN where the star has died), over segments of rising mass."""
    mi = iso[:, 0]
    keep = np.concatenate([[True], np.diff(mi) > 0])
    iso = iso[keep]
    mi = iso[:, 0]
    out = np.full((m.size, iso.shape[1]), np.nan)
    ok = (m >= mi[0]) & (m <= mi[-1])
    for c in range(iso.shape[1]):
        out[ok, c] = np.interp(m[ok], mi, iso[:, c])
    return out


def sample_young(rng: Rng, isos: dict[float, np.ndarray]):
    """Every star of the young cluster from 1 to 150 Msun (the dead ones dropped): positions (sky frame, pc) and rows."""
    lo, hi = YOUNG_MRANGE
    k = 1 - YOUNG_SLOPE
    masses: list[float] = []
    total = 0.0
    while total < YOUNG_MASS:
        u = float(rng.uniform(1)[0])
        m = (lo**k + u * (hi**k - lo**k)) ** (1 / k)
        masses.append(m)
        total += m
    m = np.array(masses)
    n = m.size
    age = np.where(rng.uniform(n) < 0.5, YOUNG_AGES[0], YOUNG_AGES[1])
    rows = np.full((n, 6), np.nan)
    for a in YOUNG_AGES:
        sel = age == a
        rows[sel] = interp_iso(isos[a], m[sel])
    disc = rng.uniform(n) < YOUNG_DISC_SHARE
    a, b = YOUNG_R
    # Disc: dN/dR ~ R^-0.9 in its plane; the rest isotropic with dN/dr ~ r^-0.14.
    ud = rng.uniform(n)
    Rd = (a**0.1 + ud * (b**0.1 - a**0.1)) ** 10
    ri = (a**0.86 + ud * (b**0.86 - a**0.86)) ** (1 / 0.86)
    phi = 2 * np.pi * rng.uniform(n)
    tilt = np.radians(YOUNG_DISC_SPREAD_DEG) * rng.normal(n)
    cz = 2 * rng.uniform(n) - 1
    i, O = math.radians(YOUNG_DISC_I), math.radians(YOUNG_DISC_OMEGA)
    e1 = np.array([math.sin(O), math.cos(O), 0.0])  # the ascending node (sstars.ts's orbit at u = 0)
    e2 = np.array([math.cos(O) * math.cos(i), -math.sin(O) * math.cos(i), math.sin(i)])  # u = 90 deg
    nrm = np.cross(e1, e2)
    inplane = np.cos(phi)[:, None] * e1 + np.sin(phi)[:, None] * e2
    pd = Rd[:, None] * (np.cos(tilt)[:, None] * inplane + np.sin(tilt)[:, None] * nrm)
    sz = np.sqrt(1 - cz * cz)
    pi_ = ri[:, None] * np.stack([sz * np.cos(phi), sz * np.sin(phi), cz], axis=1)
    pos = np.where(disc[:, None], pd, pi_)
    alive = ~np.isnan(rows[:, 1])
    return pos[alive], rows[alive], n, float(m.sum()), int(np.sum(alive)), int(np.sum(disc & alive))


# ─── M87 ──────────────────────────────────────────────────────────────────────────────────────────────────────────


def bn(n: float) -> float:
    return 2 * n - 1 / 3 + 4 / (405 * n) + 46 / (25515 * n * n)


def mu_sersic(R, n, re, mue):
    return mue + 2.5 * bn(n) / math.log(10) * ((R / re) ** (1 / n) - 1)


def mu_m87(R_arcsec: np.ndarray) -> np.ndarray:
    """M87's V surface brightness along its major axis (mag/arcsec^2), Galactic extinction removed."""
    f = M87_FERRARESE
    mb = mu_sersic(f["rb"], f["n"], f["re"], f["mue"])
    core = np.where(R_arcsec < f["rb"], mb + 2.5 * f["gamma"] * np.log10(np.maximum(R_arcsec, 1e-12) / f["rb"]), mu_sersic(R_arcsec, f["n"], f["re"], f["mue"]))
    k = M87_KORMENDY
    return np.where(R_arcsec < M87_JOIN_ARCSEC, core - M87_G_TO_V, mu_sersic(R_arcsec, k["n"], k["re"], k["mue"])) - M87_AV


def m87_model():
    pc_per_arcsec = M87_DIST_MPC * 1e6 * math.pi / 180 / 3600
    E = np.array(M87_ELL)
    Rm = np.geomspace(1e-7, 3e4, 40000)
    eps = np.interp(np.log10(Rm), np.log10(E[:, 0]), E[:, 1])
    Rc = Rm * np.sqrt(1 - eps) * pc_per_arcsec
    lnR = np.log(Rc)
    lnS = np.log(10 ** (-0.4 * (mu_m87(Rm) - MU_OF_SIGMA)))
    dlnS = np.gradient(lnS, lnR)
    total = float(np.trapezoid(np.exp(lnS) * 2 * np.pi * Rc * Rc, lnR))
    u = np.linspace(1e-7, 14, 12000)
    lo, hi, n = M87_TABLE
    rr = np.geomspace(lo, hi, n)
    j = np.empty(n)
    for i, r in enumerate(rr):
        R = r * np.cosh(u)
        lr = np.log(R)
        S = np.exp(np.interp(lr, lnR, lnS, right=-np.inf))
        g = np.interp(lr, lnR, dlnS)
        j[i] = -1 / math.pi * float(np.trapezoid(S * g / R, u))
    # j = -1/pi ∫ dS/dR dR / sqrt(R^2 - r^2); with R = r cosh u, dR / sqrt(R^2 - r^2) = du and dS/dR = S (dln S/dln R) / R.
    j = np.where(rr < M87_R_FLAT_PC, np.interp(math.log(M87_R_FLAT_PC), np.log(rr), j), j)
    return rr, j, total, (lnR, lnS)


# ─── Build ────────────────────────────────────────────────────────────────────────────────────────────────────────


def build() -> tuple[bytes, dict, list[str]]:
    log: list[str] = []
    say = lambda s: (log.append(s), print(s, flush=True))  # noqa: E731
    model = json.loads(MODEL_JSON.read_text(encoding="utf-8"))
    lum = model["luminosity"]
    total_lv = lum["totalLV"]["value"]
    l_nsc_model = total_lv * lum["fractions"]["nuclearStarCluster"]
    l_nsd_model = total_lv * lum["fractions"]["nuclearStellarDisc"]
    rng = Rng(SEED)

    old_isos = read_isochrones(set(NSC_SFH) | set(NSD_SFH))
    young_isos = read_isochrones(set(YOUNG_AGES))
    knorm = imf_mass_norm(kroupa, 0.08, 150)
    lf_nsc = Lf(np.vstack([lf_bins(old_isos[a], kroupa, knorm, f) for a, f in NSC_SFH.items()]))
    lf_nsd = Lf(np.vstack([lf_bins(old_isos[a], kroupa, knorm, f) for a, f in NSD_SFH.items()]))
    say(f"NSC light: {lf_nsc.lv_per_msun:.4f} Lsun per Msun formed (M/L_V {1 / lf_nsc.lv_per_msun:.2f}), B-V {lf_nsc.colour_bv():.3f}")
    say(f"NSD light: {lf_nsd.lv_per_msun:.4f} Lsun per Msun formed (M/L_V {1 / lf_nsd.lv_per_msun:.2f}), B-V {lf_nsd.colour_bv():.3f}")

    # Young stars: a realisation; every one of them is a point.
    ypos_sky, yrows, y_drawn, y_mass, y_alive, y_disc = sample_young(rng, young_isos)
    ypos = sky_to_ecl(ypos_sky)
    y_mv = yrows[:, 3]
    y_lv = float(np.sum(10 ** (-0.4 * (y_mv - M_V_SUN))))
    say(f"young: {y_drawn} stars drawn ({y_mass:.0f} Msun), {y_alive} alive ({y_disc} in the disc), L_V {y_lv:.3e} Lsun, brightest M_V {y_mv.min():.2f}, naked helium stars {int(np.sum(np.round(yrows[:, 5]) == 7))}, red supergiants {int(np.sum((yrows[:, 5] >= 2) & (yrows[:, 5] <= 6) & (yrows[:, 1] < math.log10(4000))))}")

    laws = Laws(model)
    sh_nsc = shell(laws.nsc)
    sh_nsd = shell(laws.nsd)
    l_nsc_old = l_nsc_model - y_lv
    laws.nsc_rho0 = l_nsc_old / integrate_lnr(sh_nsc)
    laws.nsd_rho0 = l_nsd_model / integrate_lnr(sh_nsd)
    sh_nsc = sh_nsc * laws.nsc_rho0
    sh_nsd = sh_nsd * laws.nsd_rho0
    say(f"NSC old light {l_nsc_old:.4e} Lsun (model NSC share {l_nsc_model:.4e} less the young stars'), NSD {l_nsd_model:.4e} Lsun")

    # m_split: the old points number COUNT less the young ones.
    n_old = COUNT - y_alive
    mlim_of = lambda ms: ms - 5 * (LNR / math.log(10) - 1)  # noqa: E731
    expect = lambda ms: (integrate_lnr(sh_nsc * lf_nsc.n_brighter(mlim_of(ms))), integrate_lnr(sh_nsd * lf_nsd.n_brighter(mlim_of(ms))))  # noqa: E731
    lo, hi = -15.0, 10.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if sum(expect(mid)) < n_old:
            lo = mid
        else:
            hi = mid
    msplit = 0.5 * (lo + hi)
    e_nsc, e_nsd = expect(msplit)
    k_nsc = int(round(e_nsc))
    k_nsd = n_old - k_nsc
    say(f"m_split {msplit:.4f}: expected NSC {e_nsc:.1f}, NSD {e_nsd:.1f}; drawn {k_nsc} + {k_nsd} + young {y_alive}")

    p_nsc, b_nsc = sample_old(rng, laws.nsc, lf_nsc, k_nsc, msplit, sh_nsc)
    p_nsd, b_nsd = sample_old(rng, laws.nsd, lf_nsd, k_nsd, msplit, sh_nsd)
    pos = np.vstack([p_nsc @ G_TO_ECL.T, p_nsd @ G_TO_ECL.T, ypos])
    mv = np.concatenate([lf_nsc.b[b_nsc, 1], lf_nsd.b[b_nsd, 1], y_mv])
    logt = np.concatenate([lf_nsc.b[b_nsc, 4], lf_nsd.b[b_nsd, 4], yrows[:, 1]])
    mks = np.concatenate([lf_nsc.b[b_nsc, 3], lf_nsd.b[b_nsd, 3], yrows[:, 4]])
    comp = np.concatenate([np.zeros(k_nsc, int), np.ones(k_nsd, int), np.full(y_alive, 2)])
    r = np.linalg.norm(pos, axis=1)
    mhole = mv + 5 * (np.log10(r) - 1)
    o = np.argsort(mhole, kind="stable")
    pos, mv, logt, mks, comp, r, mhole = pos[o], mv[o], logt[o], mks[o], comp[o], r[o], mhole[o]

    # Where each count of points ends among the old stars: the first N of the file are the points when N are drawn,
    # which for each old component are its stars brighter, seen from the hole, than halfway between the last old
    # star among them and the next (every count here includes every young star but a few; see the checks).
    old_idx = np.nonzero(comp < 2)[0]
    splits = []
    for n_pts in SHARE_COUNTS:
        if n_pts >= len(mhole):
            splits.append(msplit)
            continue
        k = int(np.searchsorted(old_idx, n_pts))  # old stars among the first n_pts
        splits.append(0.5 * (float(mhole[old_idx[k - 1]]) + float(mhole[old_idx[k]])))
    say("split magnitudes (from the hole) for " + ", ".join(f"{n:,} points: {m:.3f}" for n, m in zip(SHARE_COUNTS, splits)))

    # The point share s(r) of each old component at 64 radii, for each count.
    share_r = np.geomspace(INNER_PC, OUTER_PC, SHARE_RADII)

    # The glow's colour: the light of the stars it holds, weighted over each component's glow.
    def glow_bv(lf: Lf, sh: np.ndarray, ms: float) -> float:
        mlim = mlim_of(ms)
        # weight of each LF bin in the glow: sum over radii of shell light x [bin fainter than M_lim(r)]
        order = np.searchsorted(lf.mv, mlim, side="left")
        dl = sh * np.gradient(LNR)
        acc = np.zeros(len(lf.b) + 1)
        np.add.at(acc, order, dl)
        wb = np.cumsum(acc)[:-1]  # bins i >= order(r) are in the glow
        return lf.colour_bv(wb / max(wb.max(), 1e-300))

    bv_glow_nsc = glow_bv(lf_nsc, sh_nsc, msplit)
    bv_glow_nsd = glow_bv(lf_nsd, sh_nsd, msplit)
    say(f"glow colours: NSC B-V {bv_glow_nsc:.3f}, NSD B-V {bv_glow_nsd:.3f}")

    # ─── Checks ───
    checks: dict = {}
    L_pts = 10 ** (-0.4 * (mv - M_V_SUN))
    # For each count: each old component's points' light against its expectation. The glow holds the rest of each
    # component's light exactly: its point share is scaled by the realisation's ratio (a few per cent, the
    # brightest stars being rare), so points + glow = the law's light at every count.
    share_tables = []
    for n_pts, ms in zip(SHARE_COUNTS, splits):
        first = np.arange(len(mhole)) < n_pts
        row = {"count": n_pts, "splitMag": ms}
        tables = {}
        for name, c, sh, lf in (("nsc", 0, sh_nsc, lf_nsc), ("nsd", 1, sh_nsd, lf_nsd)):
            expected = integrate_lnr(sh * lf.share_brighter(mlim_of(ms)))
            real = float(L_pts[(comp == c) & first].sum())
            row[name] = {"expectedLsun": expected, "realisedLsun": real, "ratio": real / expected, "shareOfComponent": expected / integrate_lnr(sh)}
            tables[name] = np.minimum(lf.share_brighter(ms - 5 * (np.log10(share_r) - 1)) * (real / expected), 1.0)
            say(f"check: {n_pts:,} points: {name} points' light {real:.4e} Lsun, expected {expected:.4e} (x{real / expected:.4f}); share of the component {expected / integrate_lnr(sh):.4f}")
        left = (comp == 2) & ~first
        row["youngLeftOut"] = int(left.sum())
        row["youngLeftOutLsun"] = float(L_pts[left].sum())
        say(f"check: {n_pts:,} points: {row['youngLeftOut']} young stars left out ({row['youngLeftOutLsun']:.3e} Lsun, of {y_lv:.3e})")
        row["bvNsc"] = round(glow_bv(lf_nsc, sh_nsc, ms), 3)
        row["bvNsd"] = round(glow_bv(lf_nsd, sh_nsd, ms), 3)
        share_tables.append((row, tables))
    checks["pointsByCount"] = [row for row, _ in share_tables]
    checks["youngLightLsun"] = y_lv

    # Within 5 and 50 pc: field (laws) against the model (flattened Plummer NSC, r_h 4.2 pc, q 0.71, 50 pc; the NSD law).
    a_pl = 4.2 / 1.305

    def plummer(R, z):
        m = np.sqrt(R * R + (z / NSC_Q) ** 2)
        return np.where(m <= NSC_MMAX, (1 + (m / a_pl) ** 2) ** -2.5, 0.0)

    lnr_all = np.linspace(math.log(1e-3), math.log(OUTER_PC), 6001)
    sh_pl = shell(plummer, lnr_all)
    pl_norm = l_nsc_model / integrate_lnr(sh_pl, lnr_all)
    sh_pl *= pl_norm
    for rmax in (5.0, 50.0):
        k = LNR <= math.log(rmax)
        kk = lnr_all <= math.log(rmax)
        field = integrate_lnr(sh_nsc[k], LNR[k]) + integrate_lnr(sh_nsd[k], LNR[k]) + float(np.sum(10 ** (-0.4 * (y_mv[np.linalg.norm(ypos, axis=1) <= rmax] - M_V_SUN))))
        mod = integrate_lnr(sh_pl[kk], lnr_all[kk]) + integrate_lnr(sh_nsd[k], LNR[k])
        checks[f"lightWithin{int(rmax)}pc"] = {"fieldLsun": field, "modelLsun": mod, "ratio": field / mod}
        say(f"check: L_V within {rmax:g} pc: field {field:.4e}, model {mod:.4e} (x{field / mod:.3f})")

    # Projected surface brightness from Earth (no dust), along the plane (y) and across it (z), line of sight along x.
    sb = []
    xs = np.concatenate([-np.geomspace(1e-3, 400, 3000)[::-1], np.geomspace(1e-3, 400, 3000)])
    for Rp in (0.1, 0.3, 1, 3, 10, 30, 100):
        row = {"Rpc": Rp}
        for axis in ("plane", "polar"):
            y, z = (Rp, 0.0) if axis == "plane" else (0.0, Rp)
            Rcyl = np.sqrt(xs**2 + y * y)
            fld = float(np.trapezoid(laws.nsc(Rcyl, np.full_like(xs, z)) + laws.nsd(Rcyl, np.full_like(xs, z)), xs))
            mdl = float(np.trapezoid(plummer(Rcyl, np.full_like(xs, z)) * pl_norm + laws.nsd(Rcyl, np.full_like(xs, z)), xs))
            row[axis] = {"fieldMu": MU_OF_SIGMA - 2.5 * math.log10(fld), "modelMu": MU_OF_SIGMA - 2.5 * math.log10(mdl)}
        sb.append(row)
        say(f"check: mu_V at {Rp:g} pc (no dust): plane field {row['plane']['fieldMu']:.2f} model {row['plane']['modelMu']:.2f}; polar field {row['polar']['fieldMu']:.2f} model {row['polar']['modelMu']:.2f}")
    checks["surfaceBrightness"] = sb

    # Ks star counts in the central parsec against Gallego-Cano et al. 2018's Nuker model of the stars with observed
    # 17.5 <= Ks <= 18.5 (their mean parameters: r_b 4.9 pc, gamma 1.41, beta 3.7, alpha 10, 52 stars pc^-3 at r_b),
    # both projected on the sky: NSC stars only (they subtracted the nuclear disc), A_Ks 2.7 +- 0.2 (their field's
    # mean; Lu et al. 2013 assume 2.7).
    def gc_density(rr):
        x = rr / 4.9
        return 52 * 2 ** ((3.7 - 1.41) / 10) * x**-1.41 * (1 + x**10) ** ((1.41 - 3.7) / 10)

    def projected(dens, Rp):
        t = np.linspace(0, 9, 12000)
        rr = Rp * np.cosh(t)
        return 2 * float(np.trapezoid(dens(rr) * rr, t))

    jsph = lambda rr: np.interp(np.log(rr), LNR, sh_nsc, left=0, right=0) / (4 * math.pi * rr**3)  # noqa: E731
    kres = {}
    for aks in (2.5, 2.7, 2.9):
        mk = lf_nsc.b[:, 3] + DM_GC + aks
        sel = (mk >= 17.5) & (mk <= 18.5)
        n_per_l = float(np.sum(lf_nsc.b[sel, 0])) / lf_nsc.lv_per_msun
        row = {}
        for Rp in (0.5, 1.0):
            ours = n_per_l * projected(jsph, Rp)
            theirs = projected(gc_density, Rp)
            row[f"R{Rp:g}pc"] = {"fieldPerPc2": ours, "gallegoCanoPerPc2": theirs, "ratio": ours / theirs}
        kres[f"{aks:.1f}"] = row
        say(f"check: Ks 17.5-18.5 stars (A_Ks {aks}) projected at 0.5 / 1 pc: {row['R0.5pc']['fieldPerPc2']:.0f} / {row['R1pc']['fieldPerPc2']:.0f} pc^-2 against Gallego-Cano's {row['R0.5pc']['gallegoCanoPerPc2']:.0f} / {row['R1pc']['gallegoCanoPerPc2']:.0f} (x{row['R0.5pc']['ratio']:.2f}, x{row['R1pc']['ratio']:.2f})")
    checks["ksCounts"] = kres
    checks["ksCountsWithin1p5"] = bool(all(1 / 1.5 <= v["ratio"] <= 1.5 for v in kres["2.7"].values()))

    # Apparent magnitudes from Sgr A*.
    hist = {str(m): int(np.sum(mhole < m)) for m in (-15, -10, -5, -2, 0, 3, 6.5)}
    checks["pointsBrighterThan"] = hist
    checks["innermostPc"] = float(r.min())
    checks["outermostPc"] = float(r.max())
    say(f"check: points brighter than m (from Sgr A*): {hist}; nearest {r.min():.4f} pc, farthest {r.max():.1f} pc")
    # All stars brighter than 6.5 from the hole (points and glow): expected count.
    n65 = integrate_lnr(sh_nsc * lf_nsc.n_brighter(6.5 - 5 * (LNR / math.log(10) - 1))) + integrate_lnr(sh_nsd * lf_nsd.n_brighter(6.5 - 5 * (LNR / math.log(10) - 1))) + int(np.sum(y_mv + 5 * (np.log10(np.linalg.norm(ypos, axis=1)) - 1) < 6.5))
    checks["starsBrighterThan6p5FromSgrA"] = n65
    say(f"check: stars brighter than V = 6.5 seen from Sgr A* (no dust, points and glow): {n65:.3e}")

    # ─── M87 ───
    rr, jm, m87_total, (lnRc, lnSc) = m87_model()
    say(f"M87: total L_V {m87_total:.4e} Lsun (M_V {M_V_SUN - 2.5 * math.log10(m87_total):.2f}; Kormendy et al. M_VT -22.95 at 17.14 Mpc = {-22.95 + 5 * math.log10(M87_DIST_MPC / 17.14):.2f} here)")
    # Projection of the deprojected j back to Sigma, against the fits (circularised radii).
    m87_checks = []
    for Rpc in (1.0, 10.0, 100.0, 1000.0, 10000.0):
        t = np.linspace(0, 12, 20000)
        rs = Rpc * np.cosh(t)
        col = 2 * float(np.trapezoid(np.exp(np.interp(np.log(rs), np.log(rr), np.log(jm), right=-np.inf)) * rs, t))
        want = float(np.exp(np.interp(math.log(Rpc), lnRc, lnSc)))
        m87_checks.append({"Rpc": Rpc, "projectedMu": MU_OF_SIGMA - 2.5 * math.log10(col), "fitMu": MU_OF_SIGMA - 2.5 * math.log10(want)})
        say(f"check: M87 at R = {Rpc:g} pc: projected model {m87_checks[-1]['projectedMu']:.3f}, fit {m87_checks[-1]['fitMu']:.3f} mag/arcsec^2")
    checks["m87Projection"] = m87_checks

    # ─── Files ───
    n = pos.shape[0]
    assert n == COUNT, n
    teff = np.clip(np.round(10**logt), 1, 65535).astype("<u2")
    mv100 = np.clip(np.round(mv * 100), -32000, 32000).astype("<i2")
    head = b"NSC1" + struct.pack("<IfffI", n, msplit, INNER_PC, OUTER_PC, SEED) + b"\0" * 32
    raw = head + pos.astype("<f4").tobytes() + mv100.tobytes() + teff.tobytes()
    sha = hashlib.sha256(raw).hexdigest()
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0, filename="") as g:
        g.write(raw)
    gz = buf.getvalue()

    r6 = lambda x: float(f"{x:.6g}")  # noqa: E731
    doc = {
        "format": "lightspeed.nuclear-glow",
        "version": 1,
        "about": "The nuclear star cluster's field round Sgr A* (public/data/nsc-stars.bin.gz) and the laws of its glow; M87's starlight. Written by scripts/build-nsc.py: do not edit.",
        "seed": SEED,
        "count": n,
        "sha256": sha,
        "splitAbsMag": r6(msplit),
        "innerPc": INNER_PC,
        "outerPc": OUTER_PC,
        "excludePc": EXCLUDE_PC,
        "nsc": {
            "law": "nuker",
            "rbPc": NSC_RB,
            "gamma": NSC_GAMMA,
            "beta": NSC_BETA,
            "alpha": NSC_ALPHA,
            "q": NSC_Q,
            "mMaxPc": NSC_MMAX,
            "rho0": r6(laws.nsc_rho0),
            "lightLsun": r6(l_nsc_old),
            "bv": round(bv_glow_nsc, 3),
            "refs": ["Schoedel2018", "Schoedel2014", "Schoedel2020", "Feldmeier-Krause2017", "Hurley2000", "Flower1996"],
        },
        "nsd": {
            "law": "model",
            "rbPc": laws.nsd_rb,
            "edgePc": laws.nsd_edge,
            "rMinPc": laws.nsd_rmin,
            "hzPc": laws.nsd_hz,
            "slopeIn": 1.3,
            "slopeOut": 3.0,
            "rho0": r6(laws.nsd_rho0),
            "lightLsun": r6(l_nsd_model),
            "bv": round(bv_glow_nsd, 3),
            "refs": ["model.json", "Nogueras-Lara2020", "Launhardt2002", "Sormani2022", "Hurley2000", "Flower1996"],
        },
        "young": {
            "count": y_alive,
            "discCount": y_disc,
            "massMsun": round(y_mass),
            "lightLsun": r6(y_lv),
            # Where they are (for the app's smooth stand-in for any of them within 0.01 pc of the camera): from rInPc to
            # rOutPc, dN/dr ~ r^(isoIndex - 1) for the isotropic cusp and dN/dR ~ R^(discIndex - 1) in the disc.
            "rInPc": YOUNG_R[0],
            "rOutPc": YOUNG_R[1],
            "isoIndex": 0.86,
            "discIndex": 0.1,
            "refs": ["Lu2013", "Yelda2014", "Paumard2006", "Hurley2000", "Flower1996"],
        },
        "modelShares": {"nscLsun": r6(l_nsc_model), "nsdLsun": r6(l_nsd_model)},
        "share": {
            "rPc": [r6(x) for x in share_r],
            "counts": list(SHARE_COUNTS),
            "splitMag": [r6(row["splitMag"]) for row, _ in share_tables],
            "bvNsc": [row["bvNsc"] for row, _ in share_tables],
            "bvNsd": [row["bvNsd"] for row, _ in share_tables],
            "nsc": [[r6(x) for x in t["nsc"]] for _, t in share_tables],
            "nsd": [[r6(x) for x in t["nsd"]] for _, t in share_tables],
        },
        "m87": {
            "distanceMpc": M87_DIST_MPC,
            "profile": {"ferrarese": M87_FERRARESE, "gToV": M87_G_TO_V, "kormendy": M87_KORMENDY, "joinArcsec": M87_JOIN_ARCSEC, "av": M87_AV, "ellipticity": M87_ELL},
            "flatInsidePc": r6(M87_R_FLAT_PC),
            "lightLsun": r6(m87_total),
            "bv": M87_BV,
            "lnRPc": [r6(math.log(x)) for x in rr],
            "lnJ": [r6(math.log(x)) for x in jm],
            "refs": ["Ferrarese2006", "Kormendy2009"],
        },
        "checks": checks,
        "references": {
            "Schoedel2014": "Schoedel R. et al. 2014, A&A 566, A47: Surface brightness profile of the Milky Way's nuclear star cluster",
            "Schoedel2018": "Schoedel R. et al. 2018, A&A 609, A27: The distribution of stars around the Milky Way's central black hole II. Diffuse light from sub-giants and dwarfs",
            "Gallego-Cano2018": "Gallego-Cano E. et al. 2018, A&A 609, A26: The distribution of stars around the Milky Way's central black hole I. Deep star counts",
            "Schoedel2020": "Schoedel R. et al. 2020, A&A 641, A102: The Milky Way's nuclear star cluster: old, metal-rich, and cuspy",
            "Feldmeier-Krause2017": "Feldmeier-Krause A. et al. 2017, MNRAS 464, 194: KMOS view of the Galactic Centre II. Metallicity distribution of late-type stars",
            "Nogueras-Lara2020": "Nogueras-Lara F. et al. 2020, Nature Astronomy 4, 377: Early formation and recent starburst activity in the nuclear disc of the Milky Way",
            "Launhardt2002": "Launhardt R., Zylka R. & Mezger P. G. 2002, A&A 384, 112: The nuclear bulge of the Galaxy III",
            "Sormani2022": "Sormani M. C. et al. 2022, MNRAS 512, 1857: Self-consistent modelling of the Milky Way's nuclear stellar disc",
            "Lu2013": "Lu J. R. et al. 2013, ApJ 764, 155: Stellar populations in the central 0.5 pc of the Galaxy II. The initial mass function",
            "Yelda2014": "Yelda S. et al. 2014, ApJ 783, 131: Properties of the remnant clockwise disk of young stars in the Galactic Center",
            "Paumard2006": "Paumard T. et al. 2006, ApJ 643, 1011: The two young star disks in the central parsec of the Galaxy",
            "Hurley2000": "Hurley J. R., Pols O. R. & Tout C. A. 2000, MNRAS 315, 543: Comprehensive analytic formulae for stellar evolution as a function of mass and metallicity (the isochrones, from src/sim/stars/sse.ts)",
            "Flower1996": "Flower P. J. 1996, ApJ 469, 355, with the coefficients of Torres G. 2010, AJ 140, 1158 (bolometric corrections and B - V)",
            "Pecaut2013": "Pecaut M. J. & Mamajek E. E. 2013, ApJS 208, 9 (V - Ks of dwarfs, for the star-count check)",
            "Kroupa2001": "Kroupa P. 2001, MNRAS 322, 231: On the variation of the initial mass function",
            "Ferrarese2006": "Ferrarese L. et al. 2006, ApJS 164, 334: The ACS Virgo Cluster Survey VI. Isophotal analysis and the structure of early-type galaxies",
            "Kormendy2009": "Kormendy J. et al. 2009, ApJS 182, 216: Structure and formation of elliptical and spheroidal galaxies",
        },
    }
    return gz, doc, log


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--verify", action="store_true", help="rebuild in memory and compare with the files on disk")
    args = ap.parse_args()
    gz, doc, _ = build()
    text = json.dumps(doc, indent=1, ensure_ascii=False) + "\n"
    if args.verify:
        same_bin = OUT_BIN.exists() and OUT_BIN.read_bytes() == gz
        same_json = OUT_JSON.exists() and OUT_JSON.read_text(encoding="utf-8") == text
        print(f"verify: {OUT_BIN.relative_to(ROOT)} {'same' if same_bin else 'DIFFERENT'}, {OUT_JSON.relative_to(ROOT)} {'same' if same_json else 'DIFFERENT'}")
        sys.exit(0 if same_bin and same_json else 1)
    OUT_BIN.write_bytes(gz)
    OUT_JSON.write_text(text, encoding="utf-8")
    print(f"wrote {OUT_BIN.relative_to(ROOT)} ({len(gz):,} bytes) and {OUT_JSON.relative_to(ROOT)} ({len(text):,} bytes)")


if __name__ == "__main__":
    main()
