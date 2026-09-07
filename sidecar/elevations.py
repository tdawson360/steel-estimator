"""Elevations: measured only where the members are sized (braced frames,
bracing, truss elevations), chord to chord, times the frames on the plan.

Todd's rules (2026-09-07):
- An elevation is measured only when its members carry sizes; sections and
  details never are.
- A brace runs from chord to chord (or column to column), not to where the
  drafter stopped the stroke: the end snap reaches farther here.
- The frames are located on the plan; the elevation title says where
  ("BRACED FRAME AT GRID 7 BETWEEN GRIDS E AND D", "TRUSS ELEVATION AT GRID
  1,2,3 & 4", 'BRACE "1-A.4"'), so every member in that elevation carries
  Quantity = the number of grids the title lists (1 when it names one place).
- Every member is highlighted; the quantity rides on the member, never on a
  single representative line.
"""
import re

import pymupdf

TITLE_RE = re.compile(r"\b(BRACED?\s*FRAME|BRACE|BRACING|TRUSS|FRAME|ELEVATION)\b", re.I)
GRIDS_RE = re.compile(r"AT\s+GRIDS?\s+([A-Z0-9.]+(?:\s*(?:,|&|AND)\s*[A-Z0-9.]+)*)", re.I)
BETWEEN_RE = re.compile(r"BETWEEN\s+GRIDS?", re.I)
NOISE_RE = re.compile(r"^\d+\.\s|SHALL|SEE\b|REFER|NOTE|KEYPLAN|KEY PLAN|SHEET|TOP OF|BOTTOM OF|B/|T/|CONNECTION|DETAIL\s+AT", re.I)
EXTEND_FT = 9.0         # ft: chord-to-chord reach for a brace end (plans use 6; 12 over-reached on Veterans)


def sized_elevation(kind, callouts):
    """Measure this sheet: an elevation whose members carry sizes."""
    return kind == "elevation" and sum(1 for c in callouts if c.get("key")) >= 2


def frame_titles(page):
    """[(title, Rect, count)] detail titles on an elevation sheet with the
    number of frames each one stands for."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"]).strip()
            t = re.sub(r"^\s*[\d/\"' =-]+\s*/\s*", "", t).strip()
            t = re.sub(r"^\d+\s+(?=[A-Z])", "", t)
            if not TITLE_RE.search(t) or len(t) > 70 or NOISE_RE.search(t):
                continue
            located = re.search(r"AT\s+GRID|BETWEEN|\"|ELEVATION\s+\d|FRAME\s+\d|BRACE\s+\d|TRUSS\s+[A-Z0-9-]+$|-\s*[A-Z]$", t, re.I)
            # a short generic title ("Brace Elevation", "Brace Frame", "Truss
            # Elevation") is one typical unit: the plan supplies the count
            generic = len(t.split()) <= 4 and re.search(r"BRACE|TRUSS|FRAME", t, re.I) and re.search(r"ELEVATION|FRAME", t, re.I)
            if not (located or generic):
                continue
            out.append((t, pymupdf.Rect(l["bbox"]), frame_count(t)))
    return out


UNIT_TITLE_RE = re.compile(r"\b(SECTION|TRUSS|FRAMING|TYPICAL|TYP\.?)\b", re.I)


def unit_titles(page):
    """[(title, Rect, 1)] section / typical-unit titles on a sheet ("New
    Parapet Framing Section"): the drawing of the unit a plan counts."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"]).strip()
            t = re.sub(r"^\s*[\d/\"' =-]+\s*/\s*", "", t).strip()
            t = re.sub(r"^\d+\s+(?=[A-Z])", "", t)
            if not UNIT_TITLE_RE.search(t) or len(t) > 70 or len(t.split()) > 6 or NOISE_RE.search(t):
                continue
            if not re.search(r"SECTION|ELEVATION|FRAME|TRUSS", t, re.I):
                continue
            out.append((t, pymupdf.Rect(l["bbox"]), 1))
    return out


def frame_count(title):
    """How many frames a title stands for: the grids it lists after AT GRID
    ("1,2,3 & 4" -> 4); "AT GRID 7 BETWEEN GRIDS E AND D" -> 1."""
    m = GRIDS_RE.search(title)
    if not m:
        return 1
    if BETWEEN_RE.search(title[m.end():]):
        return 1
    grids = [g for g in re.split(r"\s*(?:,|&|AND)\s*", m.group(1), flags=re.I) if g]
    return max(1, len(grids))


def title_for(cluster, titles):
    """The title just below a drawing cluster (elevation titles sit under the
    drawing, left-aligned or centred)."""
    best = None
    for t, r, n in titles:
        if r.y0 < cluster.y1 - 10 or r.y0 > cluster.y1 + 140:
            continue
        if r.x1 < cluster.x0 - 40 or r.x0 > cluster.x1 + 40:
            continue
        d = r.y0 - cluster.y1
        if best is None or d < best[0]:
            best = (d, t, n)
    return (best[1], best[2]) if best else (None, 1)
