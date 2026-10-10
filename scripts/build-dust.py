"""Builds the Sun's neighbourhood in 3D dust from the map of Edenhofer et al. (2024, A&A 685, A82).

Source: "A Parsec-Scale Galactic 3D Dust Map out to 1.25 kpc from the Sun", Zenodo record 10658339
(doi:10.5281/zenodo.8187942), licence CC BY 4.0 (the record's licence field, checked 9 October 2026).
Credit: Edenhofer, G., Zucker, C., Frank, P., Saydjari, A. K., Speagle, J. S., Finkbeiner, D., Ensslin, T. A.

The file used is the posterior mean, `mean_and_std_healpix.fits` (3.25 GB; only its first HDU, the mean, 1.62 GB, is
read): 516 HEALPix spheres (Nside 256, nested, 14' pixels) at logarithmically spaced distances from 69 to 1,250 pc,
holding the differential extinction in the unitless E of Zhang, Green & Rix (2023) per parsec. The paper converts to
the Johnson V band (540 nm) by multiplying E by 2.8 (section 7); so does this script. The innermost 69 pc are left
out, as in the map (the paper's appendix C: that extinction is mostly spurious).

Fetching (once, into data-raw/dust/; the full file is not needed): `--fetch` downloads the mean's bytes and the
radial tables with ranged requests (16 at a time), about 1.6 GB.

Outputs (public/data/dust/), each a 64-byte header and nx * ny * nz bytes, x fastest, gzip-compressed:
  dust-outer.bin.gz   |x|, |y| <= 1,250 pc, |z| <= 400 pc, 10 pc voxels (250 x 250 x 80): the whole map within 400 pc
                      of the plane (the box of the paper's figure 5), each voxel the mean of 2 x 2 x 2 samples
  dust-inner.bin.gz   |x|, |y| <= 400 pc, |z| <= 200 pc, 4 pc voxels (200 x 200 x 100): the nearby clouds (Taurus,
                      Ophiuchus, Perseus, Orion, Chamaeleon, Lupus, Musca, Cepheus), mean of 2 x 2 x 2 samples
Heliocentric galactic axes: x towards l = 0, y towards l = 90 deg, z towards the north galactic pole (pc).

Header (little-endian): 0 "LSDU", 4 uint32 version 1, 8 uint32 nx, 12 ny, 16 nz, 20 float32 voxel (pc),
24/28/32 float32 the first voxel's centre x, y, z (pc), 36 float32 RHO0, 40 float32 LN_RANGE, 44 float32 the
A_V per E factor (2.8), 48 uint32 flags (0), 52..63 zero.
Encoding: a voxel's code c (0..255) holds the V-band extinction density rho (mag/pc) as
c = round(255 ln(1 + rho / RHO0) / LN_RANGE); decode rho = RHO0 (exp(c LN_RANGE / 255) - 1). src/sim/dust/volume.ts
is the decoder (and its tests).

Sampling: as the authors' interp2box.py does, the log of the density is interpolated bilinearly on each HEALPix
sphere (astropy-healpix's bilinear weights, the same scheme as healpy's get_interp_weights) and linearly in distance
between the two spheres either side; each voxel then averages its 8 samples in linear density, so a voxel holds its
mean extinction density.

Run: python scripts/build-dust.py [--fetch]   (Python 3.10+ with numpy, astropy and astropy-healpix)
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import struct
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data-raw" / "dust"
OUT = ROOT / "public" / "data" / "dust"

URL = "https://zenodo.org/api/records/10658339/files/mean_and_std_healpix.fits/content"
FILE_SIZE = 3_252_715_200
NSIDE = 256
NPIX = 12 * NSIDE * NSIDE
NSHELL = 516
# The mean's data start after the primary header and the MEAN extension's header (one 2,880-byte block each).
MEAN_OFFSET = 5760
MEAN_BYTES = NSHELL * NPIX * 4
# The radial tables lie in the last 8 MiB of the file (after the standard deviation).
TAIL_BYTES = 8 * 1024 * 1024

AV_PER_E = 2.8
RHO0 = 2.0e-4  # mag/pc: the least density kept (0.2 mag/kpc); below about half of it a voxel is 0
RHO_MAX = 1.0  # mag/pc: above any voxel of the mean map at these resolutions
LN_RANGE = math.log1p(RHO_MAX / RHO0)

GRIDS = {
    "outer": dict(half=(1250.0, 1250.0, 400.0), voxel=10.0, sub=2),
    "inner": dict(half=(400.0, 400.0, 200.0), voxel=4.0, sub=2),
}


def fetch() -> None:
    """The mean's bytes and the file's tail, in 16 MiB ranges, 16 at a time (resumable)."""
    parts = RAW / "parts"
    parts.mkdir(parents=True, exist_ok=True)
    size = 16 * 1024 * 1024
    end = MEAN_OFFSET + MEAN_BYTES
    jobs = [(a, min(end, a + size), parts / f"p{i:04d}") for i, a in enumerate(range(0, end, size))]
    jobs.append((FILE_SIZE - TAIL_BYTES, FILE_SIZE, parts / "tail"))

    def get(job):
        a, b, path = job
        if path.exists() and path.stat().st_size == b - a:
            return
        for attempt in range(30):
            try:
                req = urllib.request.Request(URL, headers={"Range": f"bytes={a}-{b - 1}"})
                with urllib.request.urlopen(req, timeout=300) as r:
                    data = r.read()
                if len(data) == b - a:
                    path.write_bytes(data)
                    return
            except Exception:
                pass
            time.sleep(2 + attempt)
        raise RuntimeError(f"could not fetch {path.name}")

    with ThreadPoolExecutor(16) as ex:
        list(ex.map(get, jobs))
    with open(RAW / "mean_head.fits", "wb") as f:
        for _, _, path in jobs[:-1]:
            f.write(path.read_bytes())


def header_cards(block: bytes) -> list[str]:
    return [block[i : i + 80].decode("latin1") for i in range(0, len(block), 80)]


def radii_centres() -> np.ndarray:
    """The spheres' radii (pc), from the 'RADIAL PIXEL CENTERS' table in the file's tail."""
    tail = (RAW / "parts" / "tail").read_bytes()
    at = tail.find(b"EXTNAME = 'RADIAL PIXEL CENTERS'")
    if at < 0:
        sys.exit("radial table not found in data-raw/dust/parts/tail (run with --fetch)")
    # The table's header (one block) starts at its XTENSION card; the tail is not block-aligned.
    start = tail.rfind(b"XTENSION", 0, at) + 2880
    r = np.frombuffer(tail, dtype=">f4", count=NSHELL, offset=start).astype(np.float64)
    assert np.all(np.diff(r) > 0) and 60 < r[0] < 75 and 1240 < r[-1] < 1260, (r[0], r[-1])
    return r


def open_mean() -> np.memmap:
    path = RAW / "mean_head.fits"
    with open(path, "rb") as f:
        head = f.read(MEAN_OFFSET)
    cards = header_cards(head[2880:])
    assert cards[0].startswith("XTENSION= 'IMAGE"), cards[0]
    keys = {c[:8].strip(): c[10:].split("/")[0].strip().strip("'").strip() for c in cards if "=" in c[:10]}
    assert keys["EXTNAME"] == "MEAN" and int(keys["NSIDE"]) == NSIDE and keys["ORDERING"] == "NEST", keys
    assert int(keys["NAXIS1"]) == NPIX and int(keys["NAXIS2"]) == NSHELL, keys
    return np.memmap(path, dtype=">f4", mode="r", offset=MEAN_OFFSET, shape=(NSHELL, NPIX))


def build_grid(name: str, mean: np.memmap, radii: np.ndarray) -> tuple[np.ndarray, dict]:
    from astropy_healpix import bilinear_interpolation_weights
    import astropy.units as u

    g = GRIDS[name]
    hx, hy, hz = g["half"]
    vox = g["voxel"]
    sub = g["sub"]
    n = [int(round(2 * h / vox)) for h in (hx, hy, hz)]
    fine = vox / sub
    nf = [k * sub for k in n]
    # Sample positions: the centres of the fine cells.
    xs = -hx + fine * (np.arange(nf[0]) + 0.5)
    ys = -hy + fine * (np.arange(nf[1]) + 0.5)
    zs = -hz + fine * (np.arange(nf[2]) + 0.5)
    X, Y = np.meshgrid(xs, ys, indexing="xy")  # [iy, ix]
    rho2 = (X * X + Y * Y).ravel()
    order = np.argsort(rho2, kind="stable")
    rho2_sorted = rho2[order]
    # Longitude in [0, 360): astropy-healpix's bilinear weights come out infinite for negative longitudes.
    lon_plane = np.mod(np.degrees(np.arctan2(Y, X)), 360.0).ravel()
    acc = np.zeros(nf[2] * nf[1] * nf[0], dtype=np.float32)  # fine samples, z-major, x fastest
    plane = nf[0] * nf[1]
    r2 = radii * radii
    log_prev = None
    t0 = time.time()
    count = 0
    for i in range(NSHELL - 1):
        ra2, rb2 = r2[i], r2[i + 1]
        # Each sample with ra <= r < rb, plane by plane (sorted in-plane radius gives the annulus).
        idx_list = []
        for k, z in enumerate(zs):
            lo = ra2 - z * z
            hi = rb2 - z * z
            if hi <= 0:
                continue
            a = np.searchsorted(rho2_sorted, max(lo, 0.0) if lo > 0 else -1.0, side="left")
            b = np.searchsorted(rho2_sorted, hi, side="left")
            if b > a:
                idx_list.append(order[a:b].astype(np.int64) + k * plane)
        if log_prev is None:
            log_prev = np.log(np.maximum(np.asarray(mean[i], dtype=np.float32), 1e-30))
        log_next = np.log(np.maximum(np.asarray(mean[i + 1], dtype=np.float32), 1e-30))
        if idx_list:
            idx = np.concatenate(idx_list)
            ix = idx % nf[0]
            iy = (idx // nf[0]) % nf[1]
            iz = idx // plane
            x = xs[ix]
            y = ys[iy]
            z = zs[iz]
            r = np.sqrt(x * x + y * y + z * z)
            lon = lon_plane[iy * nf[0] + ix]
            lat = np.degrees(np.arcsin(np.clip(z / r, -1, 1)))
            pix, w = bilinear_interpolation_weights(lon * u.deg, lat * u.deg, nside=NSIDE, order="nested")
            va = np.sum(log_prev[pix] * w, axis=0)
            vb = np.sum(log_next[pix] * w, axis=0)
            t = (r - radii[i]) / (radii[i + 1] - radii[i])
            acc[idx] = np.exp((1 - t) * va + t * vb).astype(np.float32)
            count += idx.size
        log_prev = log_next
        if i % 100 == 0:
            print(f"  {name}: sphere {i}/{NSHELL}, {count:,} samples, {time.time() - t0:.0f} s", flush=True)
    # The mean of each voxel's sub^3 samples, in V-band extinction (mag/pc).
    a = acc.reshape(n[2], sub, n[1], sub, n[0], sub).mean(axis=(1, 3, 5)) * AV_PER_E
    meta = dict(n=n, voxel=vox, first=[-hx + vox / 2, -hy + vox / 2, -hz + vox / 2], samples=int(count))
    return a.astype(np.float32), meta


def encode(rho: np.ndarray) -> np.ndarray:
    c = np.rint(255 * np.log1p(np.maximum(rho, 0) / RHO0) / LN_RANGE)
    return np.clip(c, 0, 255).astype(np.uint8)


def decode(c: np.ndarray) -> np.ndarray:
    return RHO0 * np.expm1(c.astype(np.float64) * LN_RANGE / 255)


def write(name: str, codes: np.ndarray, meta: dict) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    nx, ny, nz = meta["n"]
    head = struct.pack("<4sIIII4f3fII8x", b"LSDU", 1, nx, ny, nz, meta["voxel"], *meta["first"], RHO0, LN_RANGE, AV_PER_E, 0, 0)
    assert len(head) == 64
    raw = head + codes.tobytes(order="C")
    path = OUT / f"dust-{name}.bin.gz"
    with open(path, "wb") as f:
        f.write(gzip.compress(raw, compresslevel=9, mtime=0))
    return path.stat().st_size


def column(grid: np.ndarray, meta: dict, l_deg: float, b_deg: float, d_pc: float, step: float = 0.5) -> float:
    """A_V (mag) from the Sun to d_pc along (l, b), from a decoded grid (nearest voxel; a check only)."""
    nx, ny, nz = meta["n"]
    l, b = math.radians(l_deg), math.radians(b_deg)
    e = np.array([math.cos(b) * math.cos(l), math.cos(b) * math.sin(l), math.sin(b)])
    s = np.arange(step / 2, d_pc, step)
    p = s[:, None] * e[None, :]
    f = (p - np.array(meta["first"])) / meta["voxel"]
    i = np.rint(f).astype(int)
    ok = (i[:, 0] >= 0) & (i[:, 0] < nx) & (i[:, 1] >= 0) & (i[:, 1] < ny) & (i[:, 2] >= 0) & (i[:, 2] < nz)
    i = i[ok]
    return float(grid[i[:, 2], i[:, 1], i[:, 0]].sum() * step)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--only", choices=list(GRIDS), default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch()
    radii = radii_centres()
    mean = open_mean()
    report = {}
    for name in GRIDS if args.only is None else [args.only]:
        rho, meta = build_grid(name, mean, radii)
        codes = encode(rho)
        back = decode(codes)
        nz_mask = rho > RHO0
        rel = np.abs(back[nz_mask] - rho[nz_mask]) / rho[nz_mask]
        size = write(name, codes, meta)
        report[name] = dict(
            **meta,
            bytes_gz=size,
            rho_percentiles_mag_per_pc={p: float(np.percentile(rho, p)) for p in (50, 90, 99, 99.9, 99.99)},
            rho_max=float(rho.max()),
            zero_share=float((codes == 0).mean()),
            encode_rel_err_median=float(np.median(rel)) if rel.size else 0.0,
            encode_rel_err_max=float(rel.max()) if rel.size else 0.0,
            # Checks against the paper (figure 3: integrated A_V) and well-known sightlines.
            av_to_taurus_b_minus_16=column(rho, meta, 172.0, -16.0, 250.0),
            av_to_ngp=column(rho, meta, 0.0, 90.0, 400.0 if name == "outer" else 200.0),
            av_in_plane_l_90=column(rho, meta, 90.0, 0.0, 1249.0 if name == "outer" else 399.0),
        )
        print(json.dumps(report[name], indent=1), flush=True)
    (RAW / "build-report.json").write_text(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
