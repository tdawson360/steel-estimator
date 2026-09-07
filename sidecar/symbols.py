"""Symbols counted at the pixel level on raster plans.

x_symbols(page, ppf): centres (page points) of the solid X drawn where a
braced unit sits (Weslayan crown: 31 braced parapet trusses marked by an X
between the chords).  The sheet is rendered at 300 dpi, thin linework is
eroded away so only heavy strokes remain, Hough finds the diagonal strokes,
and two diagonals of similar length crossing near their midpoints are one X.
Scored 29 of Todd's 31 with 2 false on the crown plan (2026-09-07).
"""
import math

import numpy as np
import pymupdf

X_MIN_FT, X_MAX_FT = 2.0, 8.0     # a brace stroke on a plan symbol
DARK = 120                        # grey level below which a pixel is a heavy stroke


def x_symbols(page, ppf, dpi=300):
    import cv2
    if not ppf:
        return []
    sc = dpi / 72.0
    pxft = ppf * sc
    pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY, annots=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    dark = (img < DARK).astype(np.uint8) * 255
    k = np.ones((3, 3), np.uint8)
    thick = cv2.dilate(cv2.erode(dark, k), k)
    hl = cv2.HoughLinesP(thick, 1, np.pi / 180, threshold=60, minLineLength=int(X_MIN_FT * pxft), maxLineGap=int(0.3 * pxft))
    if hl is None:
        return []
    segs = [tuple(float(v) for v in l.ravel()) for l in hl]

    def L(s):
        return math.hypot(s[2] - s[0], s[3] - s[1]) / sc

    def mid(s):
        return ((s[0] + s[2]) / 2 / sc, (s[1] + s[3]) / 2 / sc)

    def ang(s):
        return math.degrees(math.atan2(s[3] - s[1], s[2] - s[0])) % 180

    diag = []
    for s in segs:
        a = ang(s)
        if X_MIN_FT * ppf <= L(s) <= X_MAX_FT * ppf and 15 <= a <= 165 and not 75 < a < 105:
            diag.append((s, mid(s), a, L(s)))
    xs = []
    for i, (s1, m1, a1, l1) in enumerate(diag):
        for s2, m2, a2, l2 in diag[i + 1:]:
            if abs(l1 - l2) > 0.5 * l1 or math.hypot(m1[0] - m2[0], m1[1] - m2[1]) > 0.35 * l1:
                continue
            d = abs(a1 - a2)
            d = min(d, 180 - d)
            if 40 <= d <= 140:
                xs.append(((m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2, l1))
    out = []
    for x in xs:
        if not any(math.hypot(x[0] - y[0], x[1] - y[1]) < 2 * ppf for y in out):
            out.append(x)
    return out


TICK_MIN_FT, TICK_MAX_FT = 3.0, 5.0   # a truss / joist drawn across a band on a plan
SPACING_MIN_FT, SPACING_MAX_FT = 2.0, 6.0


def tick_lines(page, ppf, dpi=300, lo=TICK_MIN_FT, hi=TICK_MAX_FT):
    """Typical units drawn as one short line each across a band (Weslayan
    crown: ~150 parapet trusses at 4 ft o.c. around the roof).  Black
    strokes only (the band's own lines are coloured), Hough, then the comb
    rule: a tick has a parallel neighbour 2-6 ft away and nothing crossing
    its middle (that would be an X brace).  -> [(x, y, angle_deg, len_pt)]"""
    import cv2
    if not ppf:
        return []
    sc = dpi / 72.0
    pxft = ppf * sc
    pix = page.get_pixmap(dpi=dpi, annots=False)   # boxes already written must not hide strokes
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n >= 3:
        r, g, b = (img[:, :, i].astype(np.int16) for i in range(3))
        dark = ((r < 110) & (g < 110) & (b < 110)).astype(np.uint8) * 255
    else:
        dark = (img[:, :, 0] < 110).astype(np.uint8) * 255
    hl = cv2.HoughLinesP(dark, 1, np.pi / 360, threshold=int(0.8 * lo * pxft),
                         minLineLength=int(lo * pxft), maxLineGap=int(0.15 * pxft))
    if hl is None:
        return []
    segs = [tuple(float(v) / sc for v in l.ravel()) for l in hl]

    def L(s):
        return math.hypot(s[2] - s[0], s[3] - s[1])

    def ang(s):
        return math.degrees(math.atan2(s[3] - s[1], s[2] - s[0])) % 180

    def mid(s):
        return ((s[0] + s[2]) / 2, (s[1] + s[3]) / 2)

    def dang(a, b):
        d = abs(a - b)
        return min(d, 180 - d)

    segs = [s for s in segs if lo * ppf <= L(s) <= hi * ppf]
    segs.sort(key=lambda s: -L(s))
    keep = []
    for s in segs:                       # one segment per stroke
        m, a = mid(s), ang(s)
        if not any(dang(a, ang(k)) < 20 and math.hypot(m[0] - mid(k)[0], m[1] - mid(k)[1]) < 1.5 * ppf for k in keep):
            keep.append(s)
    ticks = []
    for s in keep:
        a = math.radians(ang(s))
        nx, ny = -math.sin(a), math.cos(a)
        par, crossed = 0, False
        for k in keep:
            if k is s:
                continue
            dx, dy = mid(k)[0] - mid(s)[0], mid(k)[1] - mid(s)[1]
            po, al = abs(dx * nx + dy * ny) / ppf, abs(dx * math.cos(a) + dy * math.sin(a)) / ppf
            d = dang(ang(s), ang(k))
            if d < 20 and SPACING_MIN_FT <= po <= SPACING_MAX_FT and al < 2.0:
                par += 1
            if 40 <= d <= 140 and math.hypot(dx, dy) < 0.35 * L(s):
                crossed = True
        if par and not crossed:
            ticks.append((mid(s)[0], mid(s)[1], ang(s), L(s)))
    # a comb: most ticks share one spacing, else these are stray strokes
    if len(ticks) < 10:
        return []
    nn = []
    for i, t in enumerate(ticks):
        nn.append(min(math.hypot(t[0] - u[0], t[1] - u[1]) for j, u in enumerate(ticks) if j != i) / ppf)
    common = max(set(round(v * 2) / 2 for v in nn), key=lambda v: sum(1 for d in nn if round(d * 2) / 2 == v))
    if sum(1 for d in nn if abs(d - common) <= 0.75) < 0.5 * len(ticks):
        return []
    return ticks
