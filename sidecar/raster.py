"""Strokes from a sheet's raster content (auto-takeoff, rasterised sheets).

Some engineers' PDF exports rasterise the new-steel linework into image
tiles while keeping text, grid and hidden lines as vectors.  This module
pulls near-black strokes out of the page's images and returns polylines in
page coordinates that the chain builder in lengths.py consumes.

Pipeline per page:
  1. draw only the page's image tiles onto a white canvas through their
     placement matrices (vector text/grid never leaks in);
  2. keep pixels darker than BLACK on every channel (new steel is pure black;
     existing work is grey, architecture blue);
  3. detect straight pieces (OpenCV LSD), merge collinear pieces across small
     gaps (arrowheads, ticks), then link end-to-end pieces into polylines so
     curved members come through as one chain.
"""
import math

import cv2
import numpy as np
import pymupdf

BLACK = 25          # 0..255, per channel. Weslayan tiles: new steel is 0-9, existing work 80-89
MIN_SEG_PX = 12     # drop specks shorter than this (pixels at render dpi)
MERGE_GAP = 12.0    # pt: collinear pieces closer than this are one stroke (arrowheads, ticks)
LINK_GAP = 4.0      # pt: end-to-end pieces closer than this join into a polyline
LINK_TURN = 35.0    # deg: max direction change at a join


def page_images_canvas(page, dpi=200):
    """Render only the page's image tiles onto a white canvas at `dpi`.
    Returns (canvas BGR uint8, scale px/pt)."""
    scale = dpi / 72.0
    W, H = int(math.ceil(page.rect.width * scale)), int(math.ceil(page.rect.height * scale))
    canvas = np.full((H, W, 3), 255, np.uint8)
    doc = page.parent
    for info in page.get_image_info(xrefs=True):
        xref = info.get("xref")
        if not xref:
            continue
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n - pix.alpha not in (1, 3):
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR if pix.n == 1 else cv2.COLOR_RGB2BGR)
        a, b, c, d, e, f = info["transform"]          # unit square -> page (y-down)
        h, w = img.shape[:2]
        src = np.float32([[0, 0], [w, 0], [0, h]])
        dst = np.float32([[e + c, f + d], [e + a + c, f + b + d], [e, f]]) * scale
        M = cv2.getAffineTransform(src, dst)
        bb = pymupdf.Rect(info["bbox"]) * scale
        x0, y0 = max(int(bb.x0) - 1, 0), max(int(bb.y0) - 1, 0)
        x1, y1 = min(int(math.ceil(bb.x1)) + 1, W), min(int(math.ceil(bb.y1)) + 1, H)
        if x1 <= x0 or y1 <= y0:
            continue
        M[0, 2] -= x0
        M[1, 2] -= y0
        warped = cv2.warpAffine(img, M, (x1 - x0, y1 - y0), flags=cv2.INTER_AREA,
                                borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))
        region = canvas[y0:y1, x0:x1]
        np.minimum(region, warped, out=region)          # darkest wins where tiles overlap
    return canvas, scale


def has_raster_linework(page, min_cover=0.25):
    """True when image tiles cover a good share of the sheet (rasterised
    drawing content), not when the page merely carries logos, hatch pattern
    cells or a thousand tiny symbol bitmaps."""
    page_area = page.rect.get_area() or 1.0
    covered = 0.0
    for info in page.get_image_info():
        r = pymupdf.Rect(info["bbox"])
        if r.width >= 100 and r.height >= 100:
            covered += r.get_area()
    return covered / page_area >= min_cover


def ink_mask(canvas, black=BLACK):
    """Binary mask of near-black pixels (new steel), ignoring grey and colour."""
    b, g, r = cv2.split(canvas)
    mask = ((b < black) & (g < black) & (r < black)).astype(np.uint8) * 255
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))


def detect_segments(mask, scale, min_len_px=MIN_SEG_PX):
    """Straight pieces (x0, y0, x1, y1, width_pt) in page points."""
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    lines = lsd.detect(mask)[0]
    segs = []
    if lines is not None:
        for x0, y0, x1, y1 in lines.reshape(-1, 4):
            if math.hypot(x1 - x0, y1 - y0) >= min_len_px:
                segs.append((float(x0) / scale, float(y0) / scale, float(x1) / scale, float(y1) / scale, 1.0))
    return segs


def merge_collinear(segs, ang_tol=2.0, gap=MERGE_GAP, off_tol=1.5):
    """Join pieces on the same line across small gaps (page points)."""
    groups = {}
    for x0, y0, x1, y1, w in segs:
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180
        ux, uy = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        rho = -uy * x0 + ux * y0
        key = (round(ang / ang_tol), round(rho / off_tol))
        ta, tb = x0 * ux + y0 * uy, x1 * ux + y1 * uy
        groups.setdefault(key, []).append((min(ta, tb), max(ta, tb), ux, uy, rho, w))
    out = []
    for items in groups.values():
        items.sort()
        cur = list(items[0])
        for ta, tb, ux, uy, rho, w in items[1:]:
            if ta - cur[1] <= gap:
                cur[1] = max(cur[1], tb)
            else:
                out.append(_to_xy(cur))
                cur = [ta, tb, ux, uy, rho, w]
        out.append(_to_xy(cur))
    return out


def _to_xy(c):
    ta, tb, ux, uy, rho, w = c
    return (ta * ux - rho * uy, ta * uy + rho * ux, tb * ux - rho * uy, tb * uy + rho * ux, w)


def link_polylines(segs, gap=LINK_GAP, turn=LINK_TURN):
    """Chain pieces end-to-end into polylines: [(points, width), ...].
    A piece joins the polyline whose free end is within `gap` and whose
    direction differs by less than `turn` degrees; curves come out whole."""
    pieces = [((x0, y0), (x1, y1), w) for x0, y0, x1, y1, w in segs]
    used = [False] * len(pieces)
    # index endpoints on a coarse grid for neighbour lookup
    grid = {}
    for i, (a, b, _) in enumerate(pieces):
        for pt in (a, b):
            grid.setdefault((int(pt[0] // gap), int(pt[1] // gap)), []).append(i)

    def near(pt):
        gx, gy = int(pt[0] // gap), int(pt[1] // gap)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((gx + dx, gy + dy), ()):
                    yield j

    def direction(p, q):
        return math.degrees(math.atan2(q[1] - p[1], q[0] - p[0]))

    def turn_ok(d1, d2):
        d = abs((d1 - d2 + 180) % 360 - 180)
        return d <= turn

    out = []
    for i in range(len(pieces)):
        if used[i]:
            continue
        used[i] = True
        a, b, w = pieces[i]
        pts = [a, b]
        # grow forward from the tail, then backward from the head
        for end in ("tail", "head"):
            while True:
                if end == "tail":
                    last, prev = pts[-1], pts[-2]
                else:
                    last, prev = pts[0], pts[1]
                heading = direction(prev, last)
                best = None
                for j in near(last):
                    if used[j]:
                        continue
                    pa, pb, _ = pieces[j]
                    for s, t in ((pa, pb), (pb, pa)):
                        d = math.hypot(s[0] - last[0], s[1] - last[1])
                        if d <= gap and turn_ok(heading, direction(s, t)):
                            if best is None or d < best[0]:
                                best = (d, j, t)
                if best is None:
                    break
                _, j, t = best
                used[j] = True
                if end == "tail":
                    pts.append(t)
                else:
                    pts.insert(0, t)
        out.append((pts, w))
    return out


def raster_polylines(page, dpi=200, black=BLACK):
    """[(points, width)] of black strokes in page coordinates, plus the canvas and mask."""
    canvas, scale = page_images_canvas(page, dpi)
    mask = ink_mask(canvas, black)
    segs = merge_collinear(detect_segments(mask, scale))
    return link_polylines(segs), canvas, mask


def raster_segments(page, dpi=200, black=BLACK):
    """Back-compat: straight pieces only."""
    canvas, scale = page_images_canvas(page, dpi)
    mask = ink_mask(canvas, black)
    return merge_collinear(detect_segments(mask, scale)), canvas, mask
