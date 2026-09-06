"""Beam connections and end conditions, applied as the members are measured.

The typical connection details on the S-4xx/5xx/6xx sheets say how this
engineer connects beams (bolted double angles / shear tabs, welded, moment
frames).  Berger keeps the takeoff generic (Todd, 2026-09-05): every framed
end of a beam is one connection of the set's typical kind, and the end labor
is a straight cut.  The end-snap step already knows what each measured
member frames into, so the connection count is the number of ends that land
on another member, a grid line or a column.

typical(doc, pages) -> {"shear": "Bolted" | "Welded", "moment": bool, "sources": [...]}
assign(callout, spec) -> Revu column values for the member row
"""
import re

TITLE_RE = re.compile(r"\bCONN(?:ECTION|X)?\.?S?\b", re.I)
TYPICAL_RE = re.compile(r"TYP(?:ICAL)?\.?|STANDARD|AISC", re.I)
SHEAR_RE = re.compile(r"SHEAR|BEAM\s*(?:-|TO)\s*BEAM|BEAM\s*(?:-|TO)\s*(?:GIRDER|COL)|(?:WF|W\.F\.|WIDE FLANGE)?\s*(?:BEAM|BM)\s+CONN", re.I)
MOMENT_RE = re.compile(r"MOMENT", re.I)
NOISE_RE = re.compile(r"^\d+\.|SHALL|SEE\b|REFER|NOTE|DESIGN|WHERE|PRIOR|HARDWARE|CONCRETE|BRACE|HANGER|ANGLE|JOIST|DECK|COLLECTOR|CAP|CANOPY|STAIR|RAIL", re.I)
BOLT_RE = re.compile(r"\bBOLT|A325|A490|SHEAR\s*TAB|SINGLE\s*PL|DOUBLE\s*ANGLE|CLIP\s*L|\bL\s*\d\s*X", re.I)
WELD_RE = re.compile(r"\bWELD|\bCJP\b|\bPJP\b|FILLET|E70", re.I)

# Todd's generic conventions per family (IAH100 markups, 2026-09-05)
HOLES_PER_END = 2


def _title_blocks(page):
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        lines = ["".join(s["text"] for s in l["spans"]).strip() for l in b["lines"]]
        for l in lines:
            t = re.sub(r"^\s*[\d/\"' =-]+\s*/\s*", "", l).strip()      # strip "3/4\" = 1'-0\" / 5 /"
            t = re.sub(r"^\d+\s+", "", t)
            if TITLE_RE.search(t) and len(t) <= 60 and not NOISE_RE.search(t):
                yield b["bbox"], t
                break


def typical(doc, pages, sheet_numbers=None):
    """How this set connects its beams, from the typical connection details.
    Shear details vote Bolted or Welded by the words in the detail body;
    a typical moment detail is only reported (moment frames are located on
    the plan, not applied to every beam)."""
    votes = {"Bolted": 0, "Welded": 0}
    sources, moment = [], False
    for pno in pages:
        page = doc[pno]
        blocks = [(b["bbox"], " ".join("".join(s["text"] for s in l["spans"]) for l in b["lines"]))
                  for b in page.get_text("dict")["blocks"] if b.get("type") == 0]
        for (x0, y0, x1, y1), title in _title_blocks(page):
            is_shear = bool(SHEAR_RE.search(title)) and not MOMENT_RE.search(title)
            is_moment = bool(MOMENT_RE.search(title))
            if not (is_shear or is_moment):
                continue
            body = " ".join(t for (bx0, by0, bx1, by1), t in blocks if x0 - 420 <= bx0 <= x1 + 420 and y0 - 700 <= by0 <= y1)
            if is_moment:
                moment = True
                sources.append((sheet_numbers.get(pno, f"p{pno + 1}") if sheet_numbers else f"p{pno + 1}", title, "moment"))
                continue
            b, w = len(BOLT_RE.findall(body)), len(WELD_RE.findall(body))
            kind = "Bolted" if b >= w else "Welded"
            weight = 2 if TYPICAL_RE.search(title) else 1
            votes[kind] += weight
            sources.append((sheet_numbers.get(pno, f"p{pno + 1}") if sheet_numbers else f"p{pno + 1}", title, f"{kind} ({b} bolt / {w} weld words)"))
    shear = "Bolted" if votes["Bolted"] >= votes["Welded"] else "Welded"
    return {"shear": shear, "moment": moment, "votes": votes, "sources": sources,
            "found": votes["Bolted"] + votes["Welded"] > 0}


def framed(end):
    """An end that lands on something to connect to.  Only a free end (the
    snap found nothing to frame into: a cantilever tip) has no connection;
    a piece boundary on a continuous girder counts, as the estimator marks
    every piece between labels with its two connections."""
    return bool(end) and end.get("kind") != "free"


def assign(c, spec):
    """Revu column values for a measured member: end labor, holes and the
    connection, from the family and what each end frames into."""
    fam = str(c.get("fam", "")).upper()
    if c.get("column") or c.get("base_plate") or c.get("z_axis"):
        return {}
    ends = c.get("ends") or {}
    lo, hi = ends.get("lo"), ends.get("hi")
    if fam == "JOIST":
        return {}
    if fam in ("W", "S", "HP", "C", "MC"):
        # generic rule (Todd's markups): every beam gets two connections and
        # four holes; a free end is only flagged, since a piece of a
        # continuous girder or a beam ending at an unlabelled column still
        # connects at both ends
        n = 2
        kind = spec["shear"] if spec else "Bolted"
        if fam in ("W", "S", "HP") and re.search(r"MOMENT", c.get("block", "") or c.get("line", ""), re.I):
            kind = "CJP"
        prefix = "WF" if fam in ("W", "S", "HP") else "C"
        c["free_ends"] = sum(1 for e in (lo, hi) if e and e.get("kind") == "free")
        return {"End_1_Labor": "Straight", "End_2_Labor": "Straight",
                "Holes": "Drill", "Hole_Qty": str(HOLES_PER_END * n),
                "Connection_Type": f"{prefix} {kind}", "Connection_Qty": str(n)}
    if fam in ("HSS", "L", "WT", "PIPE"):
        return {"End_1_Labor": "Straight", "End_2_Labor": "Straight", "Connection_Type": "Loose"}
    return {}


def describe_ends(c):
    ends = c.get("ends") or {}
    parts = []
    for side in ("lo", "hi"):
        e = ends.get(side)
        if not e:
            parts.append("?")
        elif e["kind"] == "member":
            parts.append(e.get("key") or "member")
        else:
            parts.append(e["kind"])
    return " / ".join(parts)
