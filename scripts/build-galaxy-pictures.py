"""Builds the galaxies' pictures: public/images/galaxies/<id>.jpg and src/sim/cosmos/pictures.json.

Images: ESA/Hubble, ESO and NSF NOIRLab public image archives, which publish their images under Creative Commons
Attribution 4.0 International, to be reproduced with the full credit line shown next to them
(https://esahubble.org/copyright/, https://www.eso.org/public/outreach/copyright/,
https://noirlab.edu/public/copyright/). Each picture below records its image id, page URL and the exact credit line
from its page (scripts/build-nebulae.py reads the pages the same way; its helpers are reused).

Geometry: each archive page gives the image centre (RA, Dec), field of view and "North is X deg left/right of
vertical". The picture is cropped to its galaxy (a box on the sky), and placed in the app on the galaxy's plane
(src/sim/cosmos/pictures.ts): no resampling of the sky, so the shipped image keeps the page's orientation.

Processing, so that the picture adds as light and holds only its galaxy:
  1. resized so its longer side is at most MAX_PX (Lanczos), in linear light (sRGB decoded);
  2. the sky's level, the median of each channel outside the galaxy's ellipse, subtracted;
  3. stars: compact sources standing STAR_SIGMA above a median-filtered copy of the picture and nearly white are
     replaced by that copy (the Milky Way's foreground stars; the galaxy's own H II regions are coloured and kept),
     outside the galaxy's core;
  4. everything outside the galaxy's ellipse (its D25 ellipse, MASK_MARGIN times larger, faded to nothing at
     MASK_FADE times; plus circles round the companions it holds) faded to black, and the outer EDGE_FADE of each side;
  5. stored as a light map: the photograph's colours times its luminance, so that the app's display law (luminance
     as the square root of the light, as for the Milky Way and the galaxies' particles) shows the photograph's own
     tones; meanLight, the map's mean luminance in linear light as decoded from the JPEG, lets the app give the whole
     picture its galaxy's measured light. Saved as sRGB JPEG (quality JPEG_Q).

Inputs (downloaded once, cached): data-raw/galaxies/pictures/<imageId>_<size>.jpg and the archive pages beside them.
Run: python scripts/build-galaxy-pictures.py   (Python 3.10+, numpy, Pillow, scipy; network only for what is not cached)
"""

from __future__ import annotations

import gzip
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data-raw" / "galaxies" / "pictures"
OUT_IMG = ROOT / "public" / "images" / "galaxies"
OUT_JSON = ROOT / "src" / "sim" / "cosmos" / "pictures.json"
MAX_PX = 1024
JPEG_Q = 90
EDGE_FADE = 0.04
MASK_MARGIN = 1.15
MASK_FADE = 1.45
STAR_SIGMA = 6.0
Image.MAX_IMAGE_PIXELS = None

_spec = importlib.util.spec_from_file_location("nebulae", Path(__file__).with_name("build-nebulae.py"))
neb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(neb)
neb.RAW = RAW  # cache the pages beside the images

ARCHIVE = {"hubble": "ESA/Hubble", "eso": "ESO", "noirlab": "NSF NOIRLab", "webb": "ESA/Webb"}

# The galaxy's ellipse (centre, D25 major axis in arcmin, axis ratio b/a, PA deg E of N), from OpenNGC (via
# public/data/more-galaxies.json.gz) or named.json's RC3 values; companions it holds as circles (centre, radius ′).
# crop: a box on the sky (centre, width and height in arcmin, along the image's axes), or None for the full frame;
# stars: False to leave the stars as they are (Hubble's narrow fields).
# Centres are the image centres derived from each page's WorldWide Telescope link (its reference pixel, scale and
# rotation for the screen JPEG): on many NOIRLab pages "Position" is that reference pixel, not the centre (on
# noao-m101ubviha it is 12' off), so the page's Position is not used.
PICTURES: list[dict] = [
    dict(id="andromeda", site="hubble", img="heic1502b", center=(10.75223, 41.26087), size="large",
         crop=dict(ra=10.55, dec=41.30, w=230, h=160), includes=["lg-m-032", "lg-ngc-0205"], starPx=0.004,
         companions=[dict(ra=10.674125, dec=40.865111, r=4.0), dict(ra=10.09375, dec=41.686389, r=9.0)]),
    dict(id="triangulum", site="eso", img="eso1424a", center=(23.46714, 30.67394), size="large"),
    dict(id="whirlpool", site="noirlab", img="noao-noao-m51-kpno-09m-2", center=(202.46924, 47.21047), size="large",
         companions=[dict(ra=202.4983, dec=47.2661, r=2.6)]),
    dict(id="m101", site="noirlab", img="noao-m101ubviha", center=(210.84227, 54.35173), size="large"),
    dict(id="sombrero", site="hubble", img="heic2506a", center=(189.99717, -11.62131), size="large", stars=False),
    dict(id="m81", site="noirlab", img="noao-m81m82", center=(148.82378, 69.31915), size="large",
         crop=dict(ra=148.8882, dec=69.0653, w=31, h=31)),
    dict(id="m82", site="noirlab", img="noao-m82final", center=(148.9772, 69.6759), size="large"),
    dict(id="centaurus-a", site="eso", img="eso1221a", center=(201.38705, -43.00085), size="large"),
    dict(id="m64", site="noirlab", img="noao-m64", center=(194.18007, 21.68395), size="large"),
    dict(id="m63", site="noirlab", img="noao-m63", center=(198.93893, 42.03705), size="large"),
    dict(id="m65", site="eso", img="eso1126a", center=(169.96034, 13.27114), size="large", crop=dict(ra=169.733, dec=13.0924, w=13, h=13)),
    dict(id="m66", site="eso", img="eso1126a", center=(169.96034, 13.27114), size="large", crop=dict(ra=170.0623, dec=12.9915, w=14, h=14)),
    dict(id="ngc-3628", site="eso", img="eso1126a", center=(169.96034, 13.27114), size="large", crop=dict(ra=170.0707, dec=13.5897, w=18, h=18)),
    dict(id="ngc-1300", site="noirlab", img="noao-ngc1300", center=(49.92271, -19.40857), size="large"),
    dict(id="ngc-4038", site="noirlab", img="noao-n4038twardy", center=(180.48432, -18.87258), size="large", includes=["ngc-4039"],
         galaxy=dict(ra=180.4740, dec=-18.8770, major=7.5, q=0.75, pa=0), companions=[dict(ra=180.4775, dec=-18.8855, r=2.6)]),
    dict(id="m87", site="noirlab", img="noao-m87block", center=(187.70187, 12.38102), size="large"),
    dict(id="m83", site="noirlab", img="noirlab2429a", center=(204.24613, -29.87514), size="large", crop=dict(ra=204.254, dec=-29.8654, w=19, h=19)),
    dict(id="ngc-253", site="eso", img="eso1152a", center=(11.88114, -25.30102), size="large", crop=dict(ra=11.888, dec=-25.2882, w=33, h=33)),
    dict(id="ngc-4565", site="noirlab", img="noao-02286", center=(189.072, 25.99435), size="large"),
    dict(id="m100", site="noirlab", img="noao-m100", center=(185.73271, 15.83268), size="large"),
    dict(id="m60", site="noirlab", img="noao-m60", center=(190.90142, 11.57271), size="large", includes=["ngc-4647"],
         companions=[dict(ra=190.8846, dec=11.5847, r=1.6)]),
    dict(id="m90", site="noirlab", img="noao-m90", center=(189.20799, 13.18279), size="large"),
    dict(id="m61", site="noirlab", img="noao-m61", center=(185.4797, 4.47396), size="large"),
    dict(id="m88", site="noirlab", img="noao-m88quinn", center=(187.99857, 14.4334), size="large"),
    dict(id="ngc-4921", site="hubble", img="heic0901a", center=(195.36244, 27.8833), size="large", stars=False),
]


def galaxy_ellipse(body: str) -> dict:
    """The galaxy's D25 ellipse: RC3's (named.json) for the named galaxies, OpenNGC's (more-galaxies.json.gz) for the rest."""
    named = json.loads((ROOT / "src" / "sim" / "cosmos" / "named.json").read_text(encoding="utf8"))
    for o in named["objects"]:
        if o["id"] == body and o.get("size"):
            s = o["size"]
            return dict(ra=o["ra"], dec=o["dec"], major=s["d25Arcmin"], q=s["axisRatio"] or 1, pa=s["pa"] or 0)
    more = json.loads(gzip.decompress((ROOT / "public" / "data" / "more-galaxies.json.gz").read_bytes()))
    for g in more["galaxies"]:
        if g["id"] == body:
            q = g["minArcmin"] / g["majArcmin"] if g["minArcmin"] and g["majArcmin"] else 1
            return dict(ra=g["ra"], dec=g["dec"], major=g["majArcmin"], q=q, pa=g["pa"] or 0)
    raise KeyError(body)


def srgb_to_linear(a: np.ndarray) -> np.ndarray:
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(a: np.ndarray) -> np.ndarray:
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


def lum(a: np.ndarray) -> np.ndarray:
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def ellipse_rho(meta: dict, W: int, H: int, s: float, ra: float, dec: float, major: float, q: float, pa: float) -> np.ndarray:
    """Elliptical radius (1 on the ellipse of semi-major axis major/2 arcmin) of every pixel of a W x H image whose
    pixels are s arcmin, about (ra, dec), on the sky as the page orients it."""
    cx, cy = neb.sky_to_pixel(dict(meta, fov=[s * W, s * H]), W, H, ra, dec)
    th = math.radians(meta["north"])
    north = np.array([-math.sin(th), math.cos(th)])  # (right, up) components of north on the image
    east = np.array([-math.cos(th), -math.sin(th)])
    yy, xx = np.mgrid[0:H, 0:W]
    right = (xx + 0.5 - cx) * s
    up = (cy - (yy + 0.5)) * s
    # Offsets east and north (arcmin) of each pixel.
    e = right * east[0] + up * east[1]
    n = right * north[0] + up * north[1]
    p = math.radians(pa)
    along = n * math.cos(p) + e * math.sin(p)
    across = -n * math.sin(p) + e * math.cos(p)
    a = major / 2
    return np.hypot(along / a, across / (a * max(q, 0.05)))


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def process(src: Path, meta: dict, spec: dict, out: Path) -> dict:
    im = Image.open(src).convert("RGB")
    W0, H0 = im.size
    s0 = meta["fov"][0] / W0
    crop = spec.get("crop")
    if crop:
        cx, cy = neb.sky_to_pixel(meta, W0, H0, crop["ra"], crop["dec"])
        w_px, h_px = crop["w"] / s0, crop["h"] / s0
        x0 = min(max(0.0, cx - w_px / 2), W0 - w_px)
        y0 = min(max(0.0, cy - h_px / 2), H0 - h_px)
        box = (int(round(x0)), int(round(y0)), int(round(x0 + w_px)), int(round(y0 + h_px)))
        box = (max(0, box[0]), max(0, box[1]), min(W0, box[2]), min(H0, box[3]))
        im = im.crop(box)
        cra, cdec = neb.pixel_to_sky(meta, W0, H0, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
        fov = [(box[2] - box[0]) * s0, (box[3] - box[1]) * s0]
    else:
        cra, cdec = meta["ra"], meta["dec"]
        fov = list(meta["fov"])
    scale = min(1.0, MAX_PX / max(im.size))
    im = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.LANCZOS)
    W, H = im.size
    s = fov[0] / W
    m = dict(meta, ra=cra, dec=cdec)
    a = srgb_to_linear(np.asarray(im).astype(np.float64) / 255.0)

    g = spec.get("galaxy") or galaxy_ellipse(spec["id"])
    rho = ellipse_rho(m, W, H, s, g["ra"], g["dec"], g["major"], g["q"], g["pa"])
    keep = 1 - smoothstep(MASK_MARGIN, MASK_FADE, rho)
    core = rho < 0.12
    for c in spec.get("companions", []):
        rc = ellipse_rho(m, W, H, s, c["ra"], c["dec"], 2 * c["r"], 1, 0)
        keep = np.maximum(keep, 1 - smoothstep(1.0, 1.4, rc))
        core |= rc < 0.3
    # 2. The sky's level: the median outside the ellipse (or the 2nd percentile if the galaxy fills the frame).
    outside = keep < 0.01
    floor = np.median(a[outside], axis=0) if outside.sum() > 0.05 * a.shape[0] * a.shape[1] else np.percentile(a.reshape(-1, 3), 2, axis=0)
    a = np.clip(a - floor, 0, None)
    # 3. Foreground stars: compact, nearly white, well above the local median; not in the cores.
    L = lum(a)
    k = max(5, int(round(spec.get("starPx", 0.006) * max(W, H))) | 1)
    med = np.stack([ndimage.median_filter(a[..., i], size=k) for i in range(3)], axis=-1)
    Lm = lum(med)
    resid = L - Lm
    noise = 1.4826 * np.median(np.abs(resid - np.median(resid))) + 1e-6
    chroma = a.max(axis=-1) / np.maximum(a.min(axis=-1), 1e-6)
    # Hubble's fields of a few arcminutes hold few foreground stars, and their smooth haloes would be blotched: stars=False.
    star = spec.get("stars", True) & (resid > STAR_SIGMA * noise) & (resid > spec.get("starMin", 0.02)) & (chroma < spec.get("starChroma", 1.6)) & ~core
    star = ndimage.binary_dilation(star, iterations=2)
    lab, nlab = ndimage.label(star)
    if nlab:
        sizes = ndimage.sum(star, lab, index=np.arange(1, nlab + 1))
        big = np.isin(lab, np.nonzero(sizes > (k * k * 2.5))[0] + 1)
        star &= ~big
    a = np.where(star[..., None], med, a)
    # 4. Only the galaxy (and its companions), and no hard edges.
    def taper(n: int) -> np.ndarray:
        x = (np.arange(n) + 0.5) / n
        e = np.clip(np.minimum(x, 1 - x) / EDGE_FADE, 0, 1)
        return e * e * (3 - 2 * e)
    a *= (keep * taper(H)[:, None] * taper(W)[None, :])[..., None]
    # 5. The light map: the photograph's colours times its luminance (white point: its 99.95th percentile).
    peak = max(np.percentile(lum(a), 99.95), 1e-4)
    a = np.clip(a / peak, 0, 1)
    light = a * lum(a)[..., None]
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((linear_to_srgb(light) * 255 + 0.5).astype(np.uint8)).save(out, "JPEG", quality=JPEG_Q, optimize=True)
    back = srgb_to_linear(np.asarray(Image.open(out).convert("RGB")).astype(np.float64) / 255.0)
    return dict(
        centerRaDeg=round(cra, 5), centerDecDeg=round(cdec, 5), widthArcmin=round(fov[0], 3), heightArcmin=round(fov[1], 3),
        northAngleDeg=meta["north"], pixels=[W, H], meanLight=float(f"{lum(back).mean():.6g}"), bytes=out.stat().st_size,
        starsRemovedPx=int(star.sum()),
    )


def main() -> None:
    rows = []
    for p in PICTURES:
        meta = neb.page_meta(p["site"], p["img"])
        # The image centre (see PICTURES), not the page's Position.
        meta["ra"], meta["dec"] = p["center"]
        size = p.get("size", "large")
        url = meta["downloads"].get(size) or meta["downloads"].get("publicationjpg") or meta["downloads"].get("screen")
        src = neb.fetch(url, RAW / f"{p['img']}_{size}.jpg")
        r = process(src, meta, p, OUT_IMG / f"{p['id']}.jpg")
        stars = r.pop("starsRemovedPx")
        rows.append(dict(
            id=p["id"], includes=p.get("includes", []), image=f"images/galaxies/{p['id']}.jpg", **r,
            imageSource=dict(archive=ARCHIVE[p["site"]], id=p["img"], title=meta["title"], page=meta["url"], file=url,
                             band=p.get("band", "visible"), cropped=bool(p.get("crop"))),
            credit=meta["credit"], licence="CC BY 4.0", licenceUrl="https://creativecommons.org/licenses/by/4.0/",
            modificationNote="Image modified for Skyfold: " + ("cropped, " if p.get("crop") else "") +
                             "resized, sky subtracted, foreground stars and the sky beyond the galaxy removed, tones squared into a light map",
        ))
        print(f"{p['id']:12s} {p['img']:16s} {r['widthArcmin']:7.2f}' x {r['heightArcmin']:6.2f}'  {r['pixels']}  {r['bytes']//1024} KB  meanLight {r['meanLight']:.4g}  star px {stars}")
    doc = dict(
        schema="lightspeed.galaxy-pictures/1",
        note="Each picture's centre (after its crop), size on the sky and orientation as its archive page gives it: north on the image is northAngleDeg counterclockwise from image-up, east 90 deg counterclockwise from north (the sky as seen, not mirrored). The app lays it on its galaxy's plane as seen from the Sun (src/sim/cosmos/pictures.ts).",
        imageProcessing=__doc__.split("Processing, so that the picture adds as light and holds only its galaxy:")[1].split("Inputs")[0].strip(),
        pictures=rows,
    )
    OUT_JSON.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf8", newline="\n")
    total = sum(r["bytes"] for r in rows)
    print(f"{len(rows)} pictures, {total/1e6:.2f} MB")


if __name__ == "__main__":
    main()
