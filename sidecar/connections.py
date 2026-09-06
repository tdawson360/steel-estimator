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

# Holes in the member web per shear connection: the AISC Manual Part 10
# convention of one bolt row per ~3" of depth, minimum 2 (Berger Standard
# Connections draft A, 2026-08-31; Todd 2026-09-06: default to this table
# until the connection category templates carry Berger's own counts).
# (max depth, rows)
BOLT_ROWS_W = [(10, 2), (14, 3), (18, 4), (21, 5), (24, 6), (27, 7), (30, 8), (33, 9), (36, 10), (40, 11), (99, 12)]
BOLT_ROWS_C = [(8, 2), (13, 3), (99, 4)]


def bolt_rows(key):
    """Bolt rows (= member web holes) per connection for a W / S / C / MC key."""
    m = re.match(r"(W|S|HP|MC|C)\s*(\d+)", str(key or ""), re.I)
    if not m:
        return 0
    depth = int(m.group(2))
    table = BOLT_ROWS_C if m.group(1).upper() in ("C", "MC") else BOLT_ROWS_W
    for max_depth, rows in table:
        if depth <= max_depth:
            return rows
    return table[-1][1]


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


MOMENT_TRI_PT = (5.0, 14.0)     # pt: side of the solid triangle drawn at a moment-connected beam end


def moment_triangles(page, chains=None):
    """Centroids of the solid black triangles drafters draw at a beam end to
    mark a moment connection (Todd, 2026-09-06).  Leader arrowheads look the
    same, so a blob with a short single stroke ending at it (the leader) is
    dropped; the caller keeps only those sitting on a measured member's end."""
    import math
    leaders = [ch for ch in (chains or []) if ch.pieces == 1 and 12 <= ch.length <= 250 and len(ch.pts) <= 3]
    out = []
    for p in page.get_drawings():
        if p.get("fill") is None:
            continue
        kinds = [it[0] for it in p["items"]]
        r = p["rect"]
        # Revit exports the solid triangle as a clipped filled square ('re')
        # or as three line segments; either way a small filled black blob
        small = MOMENT_TRI_PT[0] <= max(r.width, r.height) <= MOMENT_TRI_PT[1] and             min(r.width, r.height) >= 0.4 * max(r.width, r.height)
        if small and (kinds == ["re"] or 2 <= kinds.count("l") <= 4):
            cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
            if any(min(math.hypot(ch.pts[i][0] - cx, ch.pts[i][1] - cy) for i in (0, -1)) <= 7 for ch in leaders):
                continue                                  # an arrowhead on a leader
            out.append((cx, cy))
    return out


MOMENT_ALONG_FT = 2.5   # ft: the triangle sits at the beam end, which the snap may have carried to the support line
MOMENT_LATERAL = 8.0    # pt: on the member line


def moment_ends(c, triangles):
    """How many of this member's ends carry a moment triangle: a blob on the
    member's line within a couple of feet of the end point."""
    seg = c.get("seg")
    if not seg or len(seg) < 2 or not triangles:
        return 0
    ppf = c.get("ppf") or 9.0
    n = 0
    for pt, prev in ((seg[0], seg[1]), (seg[-1], seg[-2])):
        ux, uy = pt[0] - prev[0], pt[1] - prev[1]
        L = (ux * ux + uy * uy) ** 0.5 or 1.0
        ux, uy = ux / L, uy / L
        for tx, ty in triangles:
            dx, dy = tx - pt[0], ty - pt[1]
            along = dx * ux + dy * uy
            lateral = abs(dx * uy - dy * ux)
            # inside the member, short of the support: a filled square right at
            # the tip is the column symbol at the grid intersection, not a
            # moment mark
            if -MOMENT_ALONG_FT * ppf <= along <= -0.25 * ppf and lateral <= MOMENT_LATERAL:
                n += 1
                break
    return n


def framed(end):
    """An end that lands on something to connect to.  Only a free end (the
    snap found nothing to frame into: a cantilever tip) has no connection;
    a piece boundary on a continuous girder counts, as the estimator marks
    every piece between labels with its two connections."""
    return bool(end) and end.get("kind") != "free"


def assign(c, spec, triangles=None):
    """Revu column values for a measured member: end labor, holes and the
    connection, from the family, what each end frames into, and the moment
    triangles drawn at its ends."""
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
        prefix = "WF" if fam in ("W", "S", "HP") else "C"
        m = moment_ends(c, triangles or [])
        c["moment_ends"] = m
        if m or re.search(r"MOMENT", c.get("block", "") or c.get("line", ""), re.I):
            # a solid triangle at the end = moment connection (CJP pricing);
            # one triangle: that end CJP, the other the typical shear
            kind, n = "CJP", (m or 2)
        c["free_ends"] = sum(1 for e in (lo, hi) if e and e.get("kind") == "free")
        out = {"End_1_Labor": "Straight", "End_2_Labor": "Straight",
               "Connection_Type": f"{prefix} {kind}", "Connection_Qty": str(n)}
        # web holes: AISC rows x shear connections (a CJP end has no standard holes)
        shear_ends = 2 - (m if kind == "CJP" else 0)
        rows = bolt_rows(c.get("key"))
        if rows and shear_ends:
            out.update({"Holes": "Drill", "Hole_Qty": str(rows * shear_ends)})
            c["holes_note"] = f"{rows} rows x {shear_ends} shear end(s), AISC Part 10 default"
        return out
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
