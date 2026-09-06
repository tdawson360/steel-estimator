"""Keynotes: a numbered note list on the sheet, tags on the plan.

"16. HSS6X6X1/4 CARRIED COLUMN. WELD HSS TO TOP OF ..." in the sheet's note
column, and a hexagon (or circle) with "16" wherever it applies.  Each tag is
one instance of every member the note names, so the plan carries members
that are never labelled beside a line (Harris Health S4: notes 4, 13, 16, 18
give HSS4x4 hangers, HSS6x6 carried columns, L3x3 braces).

keynotes(page) -> {number: {"text", "shapes": [(fam, dims, raw, key)], "bbox"}}
tags(page, numbers) -> [(number, Rect)]  hexagon/circle-enclosed number tokens
"""
import math
import re

import pymupdf

import shapes

NOTE_RE = re.compile(r"^(\d{1,2})\.\s+(\S.*)$")
LENGTH_RE = re.compile(r"(\d{1,3})'\s*-?\s*(\d{1,2})?(?:\s+(\d)/(\d{1,2}))?\s*\"?\s*(?:LONG|LG\.?)|[xX]\s*(\d{1,3})'\s*-?\s*(\d{1,2})?\"?", re.I)
# a note about steel with no resolvable size ("HSS BRACE PER DETAIL, TYP."):
# worth a tag on the plan so the estimator sees it, priced from the detail
STEEL_WORD_RE = re.compile(r"\b(HSS|PIPE|ANGLE|CHANNEL|BRACE|KICKER|HANGER|POST|COLUMN|BEAM|LINTEL|PLATE|PL\b|EMBED|BENT PL|STRUT|OUTRIGGER|CANOPY|STAIR|LADDER|RAIL(?:ING)?|GRATING|FRAME)", re.I)
NOT_STEEL_RE = re.compile(r"SEPARATION JOINT|SEE (?:MECHANICAL|PLUMBING|ELECTRICAL|CIVIL|ARCH)|ROOF DRAIN|EXHAUST FAN|RTU|MINI-SPLIT", re.I)
EXISTING_RE = re.compile(r"(?:\bEX\.?(?=\s|$)|\(E\)|\bEXIST(?:ING)?\b)", re.I)


def _lines(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"]).strip()
            if t:
                out.append((t, pymupdf.Rect(l["bbox"])))
    return out


def keynotes(page):
    """The sheet's numbered notes with the shapes each one names.  A note
    continues on the following lines of the same column until the next
    number; existing-work notes carry nothing."""
    lines = _lines(page)
    starts = [(i, int(m.group(1)), m.group(2)) for i, (t, r) in enumerate(lines) if (m := NOTE_RE.match(t))]
    if len(starts) < 3:
        return {}
    # notes live in one column: keep the biggest run of numbered lines that
    # share a left edge and read top to bottom
    cols = {}
    for i, n, rest in starts:
        cols.setdefault(round(lines[i][1].x0 / 15), []).append((i, n, rest))
    col = max(cols.values(), key=len)
    if len(col) < 3:
        return {}
    x0 = lines[col[0][0]][1].x0
    out = {}
    for k, (i, n, rest) in enumerate(col):
        # continuation lines: below this note, same column, before the next note
        y_end = lines[col[k + 1][0]][1].y0 if k + 1 < len(col) else lines[i][1].y1 + 60
        body = [rest]
        for t, r in lines[i + 1:]:
            if r.y0 >= y_end - 1:
                break
            if abs(r.x0 - x0) <= 30 and r.y0 > lines[i][1].y0:
                body.append(t)
        text = " ".join(body)
        found = []
        # a shape is existing only when EX / (E) / EXISTING precedes it in the
        # note ("4. HSS4X4X1/4. CONNECT ... TO EXISTING HSS BEAM" is new work)
        for m in shapes.CALLOUT.finditer(shapes.clean(text)):
            fam = m.group(1).upper()
            dims = [d.strip() for d in m.groups()[1:] if d]
            key, conf, note = shapes.resolve(fam, dims)
            if not key or key in [f[3] for f in found]:
                continue
            before = text[max(0, m.start() - 12):m.start()]
            if EXISTING_RE.search(before) or text.upper().startswith(("EXISTING", "EX.", "EX ")):
                continue
            found.append((fam, dims, m.group(0).strip(), key))
        steel = bool(STEEL_WORD_RE.search(text)) and not text.upper().startswith(("EXISTING", "EX.", "EX "))             and not NOT_STEEL_RE.search(text)
        out[n] = {"text": text[:160], "shapes": found, "steel": steel, "bbox": lines[i][1], "length_ft": _stated_length(text)}
    return out


def _stated_length(text):
    m = LENGTH_RE.search(text)
    if not m:
        return None
    ft = m.group(1) or m.group(5)
    inch = m.group(2) or m.group(6)
    if not ft:
        return None
    v = int(ft) + (int(inch) if inch else 0) / 12 + ((int(m.group(3)) / int(m.group(4))) if m.group(3) else 0) / 12
    return v if 0.5 <= v <= 80 else None


def tags(page, numbers):
    """Keynote tags on the plan: a bare number token with a hexagon or circle
    drawn around it (five or more short strokes / four curves ringing the
    text).  Grid bubbles are circles too but their numbers are not keynotes,
    so only numbers in `numbers` count."""
    paths = page.get_drawings()
    rings = []
    for p in paths:
        r = p["rect"]
        if p.get("fill") is not None or max(r.width, r.height) > 30 or max(r.width, r.height) < 8:
            continue
        kinds = [it[0] for it in p["items"]]
        if kinds.count("l") >= 5 or kinds.count("c") >= 4:
            rings.append(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, max(r.width, r.height)))
    seg_paths = [(p["rect"], sum(1 for it in p["items"] if it[0] == "l")) for p in paths
                 if p.get("fill") is None and max(p["rect"].width, p["rect"].height) <= 12]
    out = []
    for t, r in _lines(page):
        if not re.fullmatch(r"\d{1,2}", t) or int(t) not in numbers:
            continue
        cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
        ringed = any(math.hypot(x - cx, y - cy) <= 6 for x, y, _ in rings)
        if not ringed:
            # hexagon drawn as six separate strokes around the text
            n = sum(k for pr, k in seg_paths if 5 <= math.hypot((pr.x0 + pr.x1) / 2 - cx, (pr.y0 + pr.y1) / 2 - cy) <= 14)
            ringed = n >= 5
        if ringed:
            out.append((int(t), r))
    return out


def instances(page):
    """[(number, note, Rect)] one entry per keynote tag whose note names a
    steel shape (note["shapes"]) or talks about steel without a size
    (note["steel"], an exception for the estimator)."""
    notes = keynotes(page)
    if not notes:
        return []
    want = {n for n, v in notes.items() if v["shapes"] or v.get("steel")}
    if not want:
        return []
    return [(n, notes[n], r) for n, r in tags(page, want)]
