"""OCR fallback for sheets whose callouts are not in the text layer (AutoCAD
SHX stroke fonts export as line paths, not glyphs).

Renders the page at `dpi`, runs RapidOCR (PaddleOCR models on onnxruntime,
pip-only) on overlapping tiles at native resolution in 0 and 90 degree
passes, and returns callout dicts shaped like auto_takeoff.page_callouts():
raw, fam, dims, bbox (page points), angle (deg, y-up), line, plus
ocr_conf.  Whole-page OCR is useless here: the engine downsamples the page
and 6 pt callouts vanish, so tiling is essential.
"""
import logging
import re

import numpy as np
import pymupdf

import shapes

TILE = 1000
OVERLAP = 120
_ENGINE = None


def engine():
    global _ENGINE
    if _ENGINE is None:
        logging.getLogger("RapidOCR").setLevel(logging.WARNING)
        from rapidocr import RapidOCR
        _ENGINE = RapidOCR()
    return _ENGINE


def render(page, dpi):
    scale = dpi / 72.0
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), colorspace=pymupdf.csRGB)
    return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3), scale


SHEET_NO = re.compile(r"\b([A-Z]{1,3})\s?-?\s?(\d{1,3}(?:\.\d{1,2})?)[A-Z]?\b")


def ocr_sheet_number(page, clip, dpi=300):
    """Sheet number read off a title-block region, e.g. 'S 2.10' -> 'S2.10',
    or ''.  Takes the lowest-placed match, which is where title blocks put it."""
    scale = dpi / 72.0
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, colorspace=pymupdf.csRGB)
    img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3)
    # Title blocks like to print the sheet number in a pale grey display font:
    # darken everything that is not white before reading.
    img = boost_contrast(img)
    best = None
    for rot in (0, 90):
        src = np.ascontiguousarray(np.rot90(img)) if rot else img
        res = engine()(src)
        if not res or not res.txts:
            continue
        items = list(zip(res.boxes, res.txts, res.scores))
        # a lone letter followed (to its right) by a bare number is one token
        texts = []
        for box, txt, sc in items:
            t = txt.strip().upper()
            if len(t) == 1 and t.isalpha():
                bx = np.array(box)
                right = bx[:, 0].max()
                cy = bx[:, 1].mean()
                for box2, txt2, sc2 in items:
                    b2 = np.array(box2)
                    if re.fullmatch(r"\d{1,3}(?:\.\d{1,2})?", txt2.strip()) and 0 <= b2[:, 0].min() - right <= b2[:, 1].ptp() * 3 \
                            and abs(b2[:, 1].mean() - cy) <= b2[:, 1].ptp():
                        t = t + " " + txt2.strip()
                        break
            texts.append((box, t, sc))
        for box, txt, sc in texts:
            m = SHEET_NO.search(txt.replace(",", "."))
            if not m or sc < 0.5 or ("." not in m.group(2) and len(m.group(2)) < 2):
                continue
            y = max(pt[1] for pt in box) if not rot else max(pt[0] for pt in box)
            cand = (y, sc, m.group(1) + m.group(2))
            if best is None or cand[0] > best[0]:
                best = cand
    return best[2] if best else ""


def boost_contrast(img, gain=4, thicken=3):
    """Darken pale ink and fatten hairline strokes (display fonts in title
    blocks are often one pixel wide at 300 dpi, invisible to the detector)."""
    import cv2
    inv = np.clip((255 - img.astype(np.int16)) * gain, 0, 255).astype(np.uint8)
    if thicken:
        inv = cv2.dilate(inv, np.ones((thicken, thicken), np.uint8))
    return (255 - inv).astype(np.uint8)


def ocr_callouts(page, dpi=300, rotations=(0, 90), clip=None, min_conf=0.6, return_reads=False):
    """Shape callouts read off the rendered page. Duplicates from overlapping
    tiles or rotation passes collapse to the best-confidence read.
    With return_reads=True also returns every text read (deduplicated,
    in reading order) for vocabulary scanning."""
    img, scale = render(page, dpi)
    img = boost_contrast(img)           # stroke fonts are hairlines at 300 dpi
    eng = engine()
    hits = {}
    reads = []
    H, W = img.shape[:2]
    for rot in rotations:
        for ty in range(0, H, TILE - OVERLAP):
            for tx in range(0, W, TILE - OVERLAP):
                if clip is not None:
                    r = pymupdf.Rect(tx / scale, ty / scale, (tx + TILE) / scale, (ty + TILE) / scale)
                    if not r.intersects(clip):
                        continue
                tile = img[ty:ty + TILE, tx:tx + TILE]
                if tile.size == 0 or tile.min() > 200:
                    continue
                src = np.ascontiguousarray(np.rot90(tile)) if rot else tile
                res = eng(src)
                if not res or not res.txts:
                    continue
                for box, txt, sc in zip(res.boxes, res.txts, res.scores):
                    if sc < min_conf:
                        continue
                    bx = np.array(box, dtype=float)
                    if rot:                          # undo np.rot90: (x', y') -> (W-1-y', x')
                        bx = np.stack([tile.shape[1] - 1 - bx[:, 1], bx[:, 0]], axis=1)
                    x0 = (bx[:, 0].min() + tx) / scale
                    y0 = (bx[:, 1].min() + ty) / scale
                    x1 = (bx[:, 0].max() + tx) / scale
                    y1 = (bx[:, 1].max() + ty) / scale
                    if return_reads:
                        reads.append({"text": txt.strip(), "conf": float(sc), "bbox": pymupdf.Rect(x0, y0, x1, y1)})
                    for fam, dims, raw in shapes.find_callouts(txt):
                        hits.setdefault(shapes.norm(raw), []).append({
                            "raw": raw.strip(), "fam": fam, "dims": dims,
                            "bbox": pymupdf.Rect(x0, y0, x1, y1),
                            "angle": 90 if rot else 0, "line": txt.strip(),
                            "ocr_conf": float(sc)})
    # The same label is read by overlapping tiles and by both rotation passes:
    # keep the best read among boxes that overlap or nearly touch.
    out = []
    for group in hits.values():
        group.sort(key=lambda h: -h["ocr_conf"])
        kept = []
        for h in group:
            grown = h["bbox"] + (-8, -8, 8, 8)
            if any(grown.intersects(k["bbox"]) for k in kept):
                continue
            kept.append(h)
        out += kept
    if not return_reads:
        return out
    # dedupe reads the same way (same text, overlapping box), then reading order
    by_text = {}
    for r in reads:
        by_text.setdefault(r["text"].upper(), []).append(r)
    uniq = []
    for group in by_text.values():
        group.sort(key=lambda r: -r["conf"])
        kept = []
        for r in group:
            grown = r["bbox"] + (-8, -8, 8, 8)
            if any(grown.intersects(k["bbox"]) for k in kept):
                continue
            kept.append(r)
        uniq += kept
    uniq.sort(key=lambda r: (round(r["bbox"].y0 / 12), r["bbox"].x0))
    return out, uniq
