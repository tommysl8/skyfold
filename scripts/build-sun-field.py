"""Builds the Sun's photospheric field harmonics for the field lines: public/data/fields/sun-hmi-pfss.bin.

What. For every Carrington rotation that SDO's Helioseismic and Magnetic Imager (HMI) has mapped (CR 2097, May 2010,
onwards), the Schmidt semi-normalised spherical-harmonic coefficients g, h (gauss, degrees 1 to 15) of the radial
field at the photosphere, from HMI's synoptic map of the rotation. The app evaluates the potential field to a source
surface of 2.5 solar radii from them (src/sim/fields/harmonics.ts), as the Wilcox Solar Observatory's coronal model
does with its own coefficients (Zhao & Hoeksema 1993), and traces the field lines (src/sim/fields/lines.ts).

Input. The 0.5-degree synoptic maps of the radial field, hmi.Synoptic_Mr_small.<CR>.fits (720 x 360, Carrington
longitude by sine latitude, Mx/cm^2 = gauss), from the JSOC (http://jsoc.stanford.edu/data/hmi/synoptic/), downloaded
into data-raw/hmi/ (about 220 MB for CR 2096-2315):
    for cr in $(seq 2096 2315); do curl -sSLO http://jsoc.stanford.edu/data/hmi/synoptic/hmi.Synoptic_Mr_small.$cr.fits; done
The JSOC has no small map for CR 2119-2127; for those the full 0.1-degree map hmi.Synoptic_Mr.<CR>.fits (3600 x 1440,
21 MB each) is used instead (the sums below work on either grid).
SDO data are NASA's, free to use with the credit "Courtesy of NASA/SDO and the HMI science team".

How. The map is equal-area, so each coefficient is a plain sum over pixels:
    g_n^m = (2n + 1) / (4 pi) * sum B_r P_n^m(sin lat) cos(m phi) dA,   h_n^m likewise with sin(m phi),
P_n^m Schmidt semi-normalised (the recursion of src/sim/fields/harmonics.ts), dA = (2 / 360) (2 pi / 720) sr. The
monopole (the map's net flux, a measurement artefact) is dropped. Pixels the map leaves empty (a pole turned away from
the Sun-Earth line, a gap in the data) are filled with the mean of their row, or of the nearest row with data: a simple
polar fill, cruder than HMI's own polar-field product (Sun 2018), whose maps are not in this small format. A rotation
with more than 10 % of its map empty is left out. Each rotation's start is the map's T_START (TAI, turned into UTC).

Output. Little-endian: 'SFPF', uint16 version (1), uint16 degree L (15), uint32 count K; then K float64 start times
(ms since 1970, UTC), K int32 rotation numbers, K float32 scales (gauss per unit); then K blocks of 2 (L+1)(L+2)/2
int16, g then h in the order n(n+1)/2 + m, each times its rotation's scale. Plus a log of each rotation's dipole
(docs/data/sun-field-build-log.txt).

Run with Python 3 and numpy:  python scripts/build-sun-field.py [data-raw/hmi]
"""
import calendar
import math
import os
import struct
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data-raw', 'hmi')
OUT = os.path.join(ROOT, 'public', 'data', 'fields', 'sun-hmi-pfss.bin')
LOG = os.path.join(ROOT, 'docs', 'data', 'sun-field-build-log.txt')
L = 15
EMPTY_LIMIT = 0.10


def read_fits(path):
    """The first uncompressed image of a FITS file: (header dict, float64 array)."""
    with open(path, 'rb') as f:
        raw = f.read()
    pos = 0
    while pos < len(raw):
        hdr = {}
        done = False
        while not done:
            block = raw[pos:pos + 2880]
            pos += 2880
            for i in range(36):
                card = block[i * 80:(i + 1) * 80].decode('ascii', 'replace')
                key = card[:8].strip()
                if key == 'END':
                    done = True
                    break
                if card[8:10] == '= ':
                    v = card[10:].split(' /')[0].strip()
                    if v.startswith("'"):
                        v = v.strip("'").strip()
                    else:
                        try:
                            v = float(v) if ('.' in v or 'E' in v.upper()) else int(v)
                        except ValueError:
                            pass
                    hdr[key] = v
        bitpix = hdr.get('BITPIX', 8)
        naxis = hdr.get('NAXIS', 0)
        shape = [hdr.get('NAXIS%d' % i, 0) for i in range(1, naxis + 1)]
        n = int(np.prod(shape)) if naxis else 0
        nbytes = n * abs(bitpix) // 8
        if n and 'ZIMAGE' not in hdr:
            dt = {8: '>u1', 16: '>i2', 32: '>i4', -32: '>f4', -64: '>f8'}[bitpix]
            a = np.frombuffer(raw[pos:pos + nbytes], dtype=dt).reshape(shape[::-1]).astype(np.float64)
            return hdr, a * hdr.get('BSCALE', 1.0) + hdr.get('BZERO', 0.0)
        pos += ((nbytes + 2879) // 2880) * 2880
    raise ValueError('no image in ' + path)


# TAI - UTC (s) from these dates on (IERS Bulletin C).
LEAPS = [((2009, 1, 1), 34), ((2012, 7, 1), 35), ((2015, 7, 1), 36), ((2017, 1, 1), 37)]


def tai_to_utc_ms(s):
    """'2025.07.16_17:08:58_TAI' -> ms since 1970, UTC."""
    d, t = s.replace('_TAI', '').split('_')
    y, mo, da = (int(x) for x in d.split('.'))
    hh, mm, ss = t.split(':')
    ms = calendar.timegm((y, mo, da, int(hh), int(mm), 0)) * 1000 + float(ss) * 1000
    off = 33
    for (ly, lm, ld), v in LEAPS:
        if (y, mo, da) >= (ly, lm, ld):
            off = v
    return ms - off * 1000


def schmidt(N, z):
    """Schmidt semi-normalised P_n^m(z), shape (count, len(z)), index n(n+1)/2 + m (as src/sim/fields/harmonics.ts)."""
    s = np.sqrt(np.maximum(0, 1 - z * z))
    P = np.zeros(((N + 1) * (N + 2) // 2, z.size))
    P[0] = 1
    P[1] = z
    P[2] = s
    for n in range(2, N + 1):
        base, b1, b2 = n * (n + 1) // 2, (n - 1) * n // 2, (n - 2) * (n - 1) // 2
        for m in range(n):
            k = math.sqrt(n * n - m * m)
            P[base + m] = (2 * n - 1) / k * z * P[b1 + m]
            if m <= n - 2:
                P[base + m] -= math.sqrt((n - 1) ** 2 - m * m) / k * P[b2 + m]
        P[base + n] = math.sqrt((2 * n - 1) / (2 * n)) * s * P[b1 + n - 1]
    return P


def fill(br):
    """Empty pixels: the mean of their row, or of the nearest row with data."""
    br = br.copy()
    rows = br.shape[0]
    means = np.array([np.nanmean(r) if np.isfinite(r).sum() > r.size // 2 else np.nan for r in br])
    good = np.where(np.isfinite(means))[0]
    for j in range(rows):
        bad = ~np.isfinite(br[j])
        if not bad.any():
            continue
        m = means[j] if np.isfinite(means[j]) else means[good[np.argmin(np.abs(good - j))]]
        br[j, bad] = m
    return br


def coefficients(hdr, br):
    ny, nx = br.shape
    i = np.arange(1, nx + 1)
    lon = 360.0 * hdr['CAR_ROT'] - hdr['CRVAL1'] - (i - hdr['CRPIX1']) * hdr['CDELT1']
    # Sine latitude from the row count (equal-area rows from pole to pole): the maps of 2010-11 give CDELT2 = 1/144
    # for 360 rows, a slip in their headers (the rows span 2 / 360 each).
    j = np.arange(1, ny + 1)
    z = -1 + (j - 0.5) * 2 / ny
    phi = np.radians(lon)
    dA = (2 / ny) * abs(math.radians(hdr['CDELT1']))
    P = schmidt(L, z)
    cnt = (L + 1) * (L + 2) // 2
    g = np.zeros(cnt)
    h = np.zeros(cnt)
    for m in range(L + 1):
        c = br @ np.cos(m * phi)  # per row
        s = br @ np.sin(m * phi)
        for n in range(max(1, m), L + 1):
            k = n * (n + 1) // 2 + m
            g[k] = (2 * n + 1) / (4 * math.pi) * dA * (P[k] @ c)
            h[k] = (2 * n + 1) / (4 * math.pi) * dA * (P[k] @ s) if m > 0 else 0
    return g, h, lon, z, P


def main():
    small = {f.split('.')[2]: f for f in os.listdir(RAW) if f.startswith('hmi.Synoptic_Mr_small.') and f.endswith('.fits')}
    full = {f.split('.')[2]: f for f in os.listdir(RAW) if f.startswith('hmi.Synoptic_Mr.') and f.endswith('.fits')}
    files = [small.get(cr) or full[cr] for cr in sorted(set(small) | set(full))]
    rows = []
    log = ['Sun field harmonics from HMI synoptic maps (scripts/build-sun-field.py). Degree %d, source surface 2.5 Rsun.' % L,
           'CR  start (UTC)        empty%  dipole B0 (G)  tilt (deg)  round trip (rms, of the coefficients)']
    for f in files:
        hdr, br = read_fits(os.path.join(RAW, f))
        empty = 1 - np.isfinite(br).mean()
        if empty > EMPTY_LIMIT:
            print('skip', f, 'empty %.1f%%' % (100 * empty))
            continue
        br = fill(br)
        g, h, lon, z, P = coefficients(hdr, br)
        # Check: the coefficients' own map, summed again, gives them back (the quadrature is orthogonal on this grid).
        recon = np.zeros_like(br)
        phi = np.radians(lon)
        for n in range(1, L + 1):
            for m in range(n + 1):
                k = n * (n + 1) // 2 + m
                recon += np.outer(P[k], g[k] * np.cos(m * phi) + h[k] * np.sin(m * phi))
        g2, h2, _, _, _ = coefficients(hdr, recon)
        trip = math.sqrt((np.sum((g2 - g) ** 2) + np.sum((h2 - h) ** 2)) / (np.sum(g ** 2) + np.sum(h ** 2)))
        b0 = math.sqrt(g[1] ** 2 + g[2] ** 2 + h[2] ** 2)
        tilt = math.degrees(math.acos(min(1, abs(g[1]) / b0)))
        start = tai_to_utc_ms(hdr['T_START'])
        rows.append((hdr['CAR_ROT'], start, g, h))
        log.append('%d  %s  %5.2f  %6.3f  %6.1f  %.1e' % (hdr['CAR_ROT'], hdr['T_START'][:16], 100 * empty, b0, tilt, trip))
    rows.sort(key=lambda r: r[0])
    K = len(rows)
    cnt = (L + 1) * (L + 2) // 2
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'wb') as f:
        f.write(b'SFPF' + struct.pack('<HHI', 1, L, K))
        f.write(np.array([r[1] for r in rows], '<f8').tobytes())
        f.write(np.array([r[0] for r in rows], '<i4').tobytes())
        scales = []
        blocks = []
        for _, _, g, h in rows:
            v = np.concatenate([g, h])
            sc = np.abs(v).max() / 32767
            scales.append(sc)
            blocks.append(np.round(v / sc).astype('<i2'))
        f.write(np.array(scales, '<f4').tobytes())
        for b in blocks:
            f.write(b.tobytes())
    with open(LOG, 'w', newline='\n') as f:
        f.write('\n'.join(log) + '\n')
    print('wrote', OUT, os.path.getsize(OUT), 'bytes,', K, 'rotations, CR', rows[0][0], '-', rows[-1][0], '; per rotation', 2 * cnt, 'int16')


if __name__ == '__main__':
    main()
