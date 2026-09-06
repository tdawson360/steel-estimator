"""Decking and grating: type from the notes, area as a starting polygon.

Deck type is written once, in a legend or general note ("1.5B 22 DECK",
"TYPE 1.5B18 BY VULCRAFT", "3\" COMPOSITE DECK 20 GA", "0.6C FORM DECK");
its extent is the framed footprint of the plan.  footprint() traces that
footprint from the member-weight linework (rasterize, close the bays, take
the outer contour) so Revu gets an area markup the estimator trims, never a
claimed exact area (Todd, 2026-09-06).
"""
import math
import re

import numpy as np
import pymupdf

# "1.5B 22", "1.5B22", "TYPE 1.5 B 18", "3N22", "2VLI20", "0.6C", "1-1/2\" TYPE B 20 GA"
DECK_DESIG_RE = re.compile(r"(?<![\w.])(\d(?:\.\d)?)\s*-?\s*([ABCFNW]|VLI|VLR|VL)\s*-?\s*(\d{2})\b", re.I)
DECK_WORD_RE = re.compile(r"\b(?:METAL|MTL|COMPOSITE|ROOF|FLOOR|FORM|STEEL)?\s*DECK(?:ING)?\b", re.I)
GRATING_RE = re.compile(r"\b(?:BAR\s+)?GRATING\b", re.I)
DECK_TYPE_RE = re.compile(r"(?<![\w.])(\d(?:\.\d)?)?\s*(?:TYPE\s*)?([ABCFNW])\s+(?:FORM|COMPOSITE|ROOF|FLOOR|METAL)\s+DECK", re.I)
GAGE_RE = re.compile(r"\b(\d{2})\s*GA(?:UGE|GE)?\.?\b", re.I)
DEPTH_RE = re.compile(r"(\d(?:\s*-\s*\d/\d|\s+\d/\d)?|\d\.\d)\s*\"\s*(?:x\s*\d{2}\s*GA\s*)?(?:TYPE\s*[ABCFNW]\s*)?(?:METAL|MTL|COMPOSITE|ROOF|FLOOR|FORM)?\s*DECK", re.I)
SPEC_RE = re.compile(r"WASHER|KSI|OR LESS|LIGHTER|THICKER|MINIMUM|SHALL BE (?:ATTACHED|FASTENED|WELDED)|INSTITUTE|PER SDI", re.I)
NOISE_RE = re.compile(r"B/\s*DECK|BOTTOM OF DECK|T/\s*DECK|TOP OF DECK|DECK EDGE|EDGE OF DECK|EXIST(?:ING)?|DECK INSTITUTE|BOD\b|EOD\b|DECK SUPPORT|DECK FLUTES|DECK BEARING|DECK INTERSECTION", re.I)


def deck_notes(text):
    """[(label, raw)] deck designations found in text, most specific first:
    label is the profile's naming ("1.5 B22 Roof Deck")."""
    out, seen = [], set()
    for line in re.split(r"[\n|]", text):
        # a designation only counts on a line that says DECK ("2B44" is a
        # concrete beam mark); gauge alone ("22 GA OR LESS") is a spec note
        if NOISE_RE.search(line) or not DECK_WORD_RE.search(line) or SPEC_RE.search(line):
            continue
        for m in DECK_DESIG_RE.finditer(line):
            depth, typ, ga = m.group(1), m.group(2).upper(), m.group(3)
            label = f"{depth} {typ}{ga} Roof Deck" if typ in ("A", "B", "F", "N") else f"{depth} {typ}{ga} Deck"
            if label not in seen:
                seen.add(label)
                out.append((label, line.strip()[:80]))
        if not DECK_DESIG_RE.search(line):
            # "0.6C FORM DECK", "TYPE B DECK": profile letter without a gauge
            t = DECK_TYPE_RE.search(line)
            if t:
                label = f"{t.group(1) + ' ' if t.group(1) else ''}{t.group(2).upper()} Deck (gauge per notes)"
                if label not in seen:
                    seen.add(label)
                    out.append((label, line.strip()[:80]))
                continue
            d, g = DEPTH_RE.search(line), GAGE_RE.search(line)
            if d:
                label = f"{(d.group(1).replace(' ', '') if d else '?')}\" {'x ' + g.group(1) + ' GA ' if g else ''}Deck".replace('"" ', '" ')
                if label not in seen:
                    seen.add(label)
                    out.append((label, line.strip()[:80]))
    return out


def page_deck_notes(page):
    return deck_notes(page.get_text())


def page_has_grating(page):
    t = page.get_text()
    return bool(GRATING_RE.search(t)) and not re.search(r"GRATING\s*(?:-|SCHEDULE|:)\s*-", t)


# ── framed footprint ──────────────────────────────────────────────────

EXISTING_RE = re.compile(r"\b(EX\.?|EXIST(?:ING)?)\b", re.I)


def member_chains(chains):
    """The strokes that carry a measured member (a label anchored to them),
    new work only: existing members ("EX. W16X26") carry no new deck."""
    out = []
    for ch in chains:
        if not ch.callouts:
            continue
        lines = [t[3].get("line", "") for t in ch.callouts if isinstance(t[3], dict)]
        if lines and all(EXISTING_RE.search(l) for l in lines):
            continue
        out.append(ch)
    return out


def plan_footprints(page, regions, chains, ppf_for):
    """[(pts, sf, ppf)] one starting polygon per drawing on the sheet, traced
    from the measured members only (so a foundation plan with columns but no
    framing, or an existing roof, yields nothing)."""
    import lengths
    members = member_chains(chains)
    if not members:
        return []
    out = []
    for rect in lengths.drawing_clusters(page):
        ppf = ppf_for(rect)
        if not ppf or ppf >= 50 or rect.width < 100 or rect.height < 100:
            continue
        inside = [c for c in members if all(rect.contains(pymupdf.Point(x, y)) for x, y in c.pts)]
        if len(inside) < 3:
            continue
        for pts, sf in footprint(page, rect, inside, 0.0, ppf)[:3]:
            if sf >= 100:
                out.append((pts, sf, ppf))
    return out

def footprint(page, region, chains, min_width, ppf, px_per_pt=0.25, close_ft=12.0):
    """Outer polygon(s) of the framing inside `region` (a Rect), in page
    points: member-weight strokes are rasterized, dilated enough to close a
    bay, the largest components' outer contours taken and eroded back.
    Returns [[(x, y), ...], ...] (page coordinates, clockwise) and the area
    of each in square feet."""
    import cv2
    x0, y0 = region.x0, region.y0
    W, H = int(math.ceil(region.width * px_per_pt)) + 2, int(math.ceil(region.height * px_per_pt)) + 2
    img = np.zeros((H, W), dtype=np.uint8)
    for c in chains:
        if c.width < min_width or c.is_closed():
            continue
        pts = [(int((x - x0) * px_per_pt), int((y - y0) * px_per_pt)) for x, y in c.pts]
        if not all(0 <= px < W and 0 <= py < H for px, py in pts):
            continue
        cv2.polylines(img, [np.array(pts, dtype=np.int32)], False, 255, 2)
    if not img.any():
        return []
    k = max(3, int(close_ft * ppf * px_per_pt) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    closed = cv2.morphologyEx(img, cv2.MORPH_CLOSE, kernel)
    filled = closed.copy()
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(filled, contours, -1, 255, thickness=cv2.FILLED)
    # the closing's own erosion already puts the outline back on the
    # perimeter members (within a stroke width)
    contours, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    total = filled.sum() / 255
    for cnt in contours:
        area_px = cv2.contourArea(cnt)
        if area_px < 0.05 * total:
            continue                                     # stray detail / note box
        eps = 0.01 * cv2.arcLength(cnt, True)
        poly = cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2)
        pts = [(x0 + float(px) / px_per_pt, y0 + float(py) / px_per_pt) for px, py in poly]
        area_ft = area_px / (px_per_pt * ppf) ** 2
        out.append((pts, area_ft))
    out.sort(key=lambda t: -t[1])
    return out
