"""Columns: counted on the plan, measured from elevation notes.

A column is noted on the plan (a schedule mark like "S2" in a bubble, or a
"HSS 4X4X3/8 COLUMN TYP." label beside a drawn square) but its length lives
elsewhere: the top-of-steel / bottom-of-deck elevation on the framing plan
above, or a section.  The estimator draws one vertical polyline per column
whose length is the column height, so that is what this module produces:

    columns_on_page(...) -> callout dicts with seg (vertical), length_ft,
    len_note "AUTO COL: <note> on <sheet> + 1'-0\"", or count-only when no
    elevation note is near.

Height rule (Todd, 2026-09-05): columns bolt to the top of the pier cap and
the slab is poured around them, so they run about 1 ft taller than the
elevations show.  Carry +1'-0" and say so in the note.
"""
import math
import re

import pymupdf

import lengths
import shapes

PIER_ALLOWANCE_FT = 1.0
OTHER_SHEET_PENALTY_FT = 10.0   # a note on another plan sheet at the same spot counts as this much farther
MIN_HEIGHT_FT, MAX_HEIGHT_FT = 6.0, 80.0

MARK_RE = re.compile(r"^[A-Z]{1,2}\d{1,2}[A-Z]?$")
COLUMN_LABEL_RE = re.compile(r"\b(COL(?:UMN|S|\.)?|POST)\b", re.I)
# an elevation is named as such; a bare "MEZZANINE 60'-9"" is a plan dimension
ELEV_KEY_RE = re.compile(r"(\bT/|T\.O\.?\s|\bTOS\b|TOP OF|\bB/|B\.O\.?\s|BOT(?:TOM)? OF|\bEL\b|\bEL\.|ELEV)", re.I)
NEAR_FT = 80.0                  # ft: the highest elevation note this close is the column top (IAH100: 28/40 within 2 ft of Todd)
FAR_FT = 120.0                  # ft: beyond NEAR, the highest note within reach is only a draft
FEET_RE = re.compile(r"""(?<![\d.])(\d{1,3})'\s*-?\s*(?:(\d{1,2})(?:\s+(\d)/(\d{1,2}))?\s*(?:"|'')?)?(?![\dx])""", re.I)
SCHEDULE_RE = re.compile(r"COLUMN\s+SCHEDULE", re.I)
# the table's own title, not a sentence that mentions one ("REFER TO S-61X FOR CONCRETE COLUMN SCHEDULE.")
SCHEDULE_TITLE_RE = re.compile(r"^(?:STEEL\s+)?COLUMN\s+SCHEDULE\.?$", re.I)


def feet(m):
    ft = int(m.group(1))
    if m.group(2):
        ft += int(m.group(2)) / 12
    if m.group(3):
        ft += int(m.group(3)) / int(m.group(4)) / 12
    return ft


def fmt_feet(ft):
    whole = int(ft)
    inches = round((ft - whole) * 12)
    if inches == 12:
        whole, inches = whole + 1, 0
    return f"{whole}'-{inches}\""


# ── schedule ──────────────────────────────────────────────────────────

def column_schedule(doc, pages=None):
    """{mark: (size_key, raw_size)} from every COLUMN SCHEDULE table in the
    set, plus {page_index: [Rect]} of the table blocks (their size texts are
    not members on the plan)."""
    marks, blocks = {}, {}
    for pno in (pages if pages is not None else range(doc.page_count)):
        page = doc[pno]
        text = page.get_text()
        if not SCHEDULE_RE.search(text):
            continue
        lines = []
        for b in page.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            for l in b["lines"]:
                t = "".join(s["text"] for s in l["spans"]).strip()
                if t:
                    lines.append((t, pymupdf.Rect(l["bbox"])))
        # the table: from the heading down to the next heading or the end
        heads = [i for i, (t, _) in enumerate(lines) if SCHEDULE_TITLE_RE.match(t.strip())]
        for h in heads:
            hx, hy = lines[h][1].x0, lines[h][1].y0
            rows = []
            for t, r in lines[h + 1:]:
                if re.search(r"SCHEDULE|NOTES?:", t, re.I) and not SCHEDULE_RE.search(t):
                    break
                if abs(r.x0 - hx) > 400 or r.y0 < hy - 5:
                    continue
                rows.append((t, r))
            # marks and sizes alternate row by row ("S1", "HSS4X4X3/8", "S2", ...)
            pending, found_here = None, 0
            for t, r in rows:
                u = t.strip().upper()
                if MARK_RE.match(u) and u not in ("TYPE", "MARK"):
                    pending = u
                    continue
                if pending:
                    hits = list(shapes.find_callouts(u))
                    if hits:
                        fam, dims, raw = hits[0]
                        key = shapes.resolve(fam, dims)[0]
                        if key:
                            marks[pending] = (key, raw.strip(), fam, dims)
                            found_here += 1
                    pending = None
            if rows and found_here:
                box = pymupdf.Rect(lines[h][1])
                for _, r in rows:
                    box |= r
                blocks.setdefault(pno, []).append(box)
    return marks, blocks


# ── elevation notes ───────────────────────────────────────────────────

def elevation_notes(page):
    """[(feet, text, x, y)] for every note that names an elevation
    ("B/DECK GRID E 17' - 3 5/8\"", "T.O. MEZZANINE / 11' - 10\"")."""
    out, keys, vals_only = [], [], []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        text = " ".join("".join(s["text"] for s in l["spans"]).strip() for l in b["lines"])
        r = pymupdf.Rect(b["bbox"])
        if re.search(r"\d\s*[xX]\s*\d", text):
            continue
        vals = [feet(m) for m in FEET_RE.finditer(text)]
        keyed = bool(ELEV_KEY_RE.search(text))
        if keyed and len(vals) == 1 and MIN_HEIGHT_FT <= vals[0] <= MAX_HEIGHT_FT:
            out.append((vals[0], text[:60], (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
        elif keyed and not vals and len(text) <= 40:
            keys.append((text, r))
        elif not keyed and len(vals) == 1 and FEET_RE.fullmatch(text.strip()) and MIN_HEIGHT_FT <= vals[0] <= MAX_HEIGHT_FT:
            vals_only.append((vals[0], text, r))
    # "T.O. MEZZANINE" on one line, "11' - 10\"" on the next (Revit tags)
    for v, text, r in vals_only:
        for ktext, kr in keys:
            if abs(kr.y1 - r.y0) <= 6 and kr.x0 - 10 <= r.x1 and r.x0 <= kr.x1 + 10:
                out.append((v, f"{ktext} {text}"[:60], (r.x0 + r.x1) / 2, (kr.y0 + r.y1) / 2))
                break
    return out


# ── top of pier / footing below the slab ──────────────────────────────

PIER_KEY_RE = re.compile(r"(?:\bT/\s*|TOP OF\s+|T\.O\.?\s*)(PLINTH|FDN|FTG|FOOTING|PIER(?:\s*CAP)?|PEDESTAL)", re.I)
SIGNED_FT_RE = re.compile(r"""(\(?-\)?|MINUS\s*)?\s*(\d{1,2})'\s*-?\s*(\d{1,2})?(?:\s+(\d)/(\d{1,2}))?\s*(?:"|'')?""")


def pier_notes(page):
    """[(depth_ft, text, x, y)]: how far the top of pier / footing / plinth
    sits below the slab, from notes like "T/PLINTH -1' - 8\"" or
    "TOP OF FOOTING EL -1'-0\" UNLESS INDICATED OTHERWISE"."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        text = " ".join("".join(s["text"] for s in l["spans"]).strip() for l in b["lines"])
        m = PIER_KEY_RE.search(text)
        if not m:
            continue
        tail = text[m.end():m.end() + 40]
        v = SIGNED_FT_RE.search(tail)
        if not v or not v.group(2):
            continue
        ft = int(v.group(2)) + (int(v.group(3)) if v.group(3) else 0) / 12 + ((int(v.group(4)) / int(v.group(5))) if v.group(4) else 0) / 12
        if not 0.25 <= ft <= 6:
            continue
        r = pymupdf.Rect(b["bbox"])
        general = bool(re.search(r"UNLESS|U\.?N\.?O|UON|TYP", text, re.I))
        snippet = text[m.start():m.end() + v.end() + 2].strip()
        out.append((ft, snippet[:70], (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, general))
    return out


def pier_allowance(at, pno, piers_by_page, ppf, reach_ft=15.0):
    """(ft, source) for one column: the nearest pier/plinth note on its own
    sheet, else the set's general top-of-footing note, else 1'-0\"."""
    x, y = at
    best = None
    for ft, text, nx, ny, general in piers_by_page.get(pno, []):
        if general:
            continue
        d = math.hypot(nx - x, ny - y) / (ppf or 9)
        if d <= reach_ft and (best is None or d < best[0]):
            best = (d, ft, text)
    if best:
        return best[1], f"{best[2]} at this column"
    for p, notes in piers_by_page.items():
        for ft, text, nx, ny, general in notes:
            if general:
                return ft, f"{text} (page {p + 1})"
    return PIER_ALLOWANCE_FT, "default: top of slab to top of pier cap not noted"


# ── drawn column symbols ──────────────────────────────────────────────

def squares(paths, min_width, side_pt, tol=0.25):
    """Centres of squares drawn as four heavy strokes of side ~side_pt.
    Reads the raw drawing paths: at 1/8" scale an HSS6x6 is a 4.5 pt square,
    below the chain builder's minimum stroke length."""
    segs = []
    for p in paths:
        if (p.get("width") or 0) < min_width or p.get("fill") is not None:
            continue
        for it in p["items"]:
            if it[0] != "l":
                continue
            (x0, y0), (x1, y1) = (it[1].x, it[1].y), (it[2].x, it[2].y)
            if abs(abs(x1 - x0) - side_pt) <= tol * side_pt and abs(y1 - y0) < 1:
                segs.append(("h", min(x0, x1), max(x0, x1), y0))
            elif abs(abs(y1 - y0) - side_pt) <= tol * side_pt and abs(x1 - x0) < 1:
                segs.append(("v", min(y0, y1), max(y0, y1), x0))
    hs = [s for s in segs if s[0] == "h"]
    vs = [s for s in segs if s[0] == "v"]
    found = []
    for _, x0, x1, y in hs:
        L = x1 - x0
        for _, bx0, bx1, by in hs:
            if abs(bx0 - x0) > 1.5 or abs(bx1 - x1) > 1.5 or not (L * (1 - tol) <= by - y <= L * (1 + tol)):
                continue
            left = any(abs(vx - x0) <= 1.5 and abs(vy0 - y) <= 1.5 and abs(vy1 - by) <= 1.5 for _, vy0, vy1, vx in vs)
            right = any(abs(vx - x1) <= 1.5 and abs(vy0 - y) <= 1.5 and abs(vy1 - by) <= 1.5 for _, vy0, vy1, vx in vs)
            if left and right:
                found.append(((x0 + x1) / 2, (y + by) / 2, L))
    return found


# ── per page ──────────────────────────────────────────────────────────

def section_elevations(doc, pages):
    """Distinct top-of-steel style elevations on section/elevation sheets:
    [(ft, text, pno)] — the fallback when the plans carry no notes."""
    seen = {}
    for pno in pages:
        for ft, text, x, y in elevation_notes(doc[pno]):
            if re.search(r"\bT/|T\.O\.?\s|\bTOS\b|TOP OF", text, re.I):
                seen.setdefault(round(ft, 2), (ft, text, pno))
    return sorted(seen.values(), key=lambda t: -t[0])


def columns_on_page(page, pno, sheet, callouts, chains, ppf, schedule, schedule_blocks, notes_by_page, plan_pages,
                    section_heights=(), piers_by_page=None):
    """Column callouts for one plan page.

    schedule: column_schedule() marks; schedule_blocks: its table rects on
    this page; notes_by_page: {pno: elevation_notes()} for every plan page
    (same-sheet notes preferred, other plan sheets at the same spot next);
    plan_pages: the plan page indexes.  Returns (columns, consumed) where
    consumed is the set of id()s of ordinary callouts the columns replace
    (schedule size texts, the COLUMN TYP. label)."""
    columns, consumed = [], set()
    paths = page.get_drawings()
    tips = lengths.arrowheads(paths)
    blocks = [pymupdf.Rect(b) for b in (schedule_blocks or [])]
    for c in callouts:
        if any(b.intersects(pymupdf.Rect(c["bbox"])) for b in blocks):
            consumed.add(id(c))
    claimed = set()
    # 1. schedule marks on the plan
    if schedule:
        for b in page.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            for l in b["lines"]:
                t = "".join(s["text"] for s in l["spans"]).strip().upper()
                if t not in schedule:
                    continue
                r = pymupdf.Rect(l["bbox"])
                if any(bl.intersects(r) for bl in blocks):
                    continue
                key, raw, fam, dims = schedule[t]
                tip = lengths.leader_tip(r, tips, paths)
                x, y = tip if tip else ((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
                # the mark bubble sits beside the column: put the origin on the
                # drawn column symbol (a square of the section's size) when one
                # is within reach, so the markup lands on the column itself
                sym = _nearest_symbol(paths, dims, ppf, (x, y), thin_w=1.0)
                if sym:
                    x, y = sym
                    claimed.add((round(x), round(y)))
                columns.append({"raw": raw, "fam": fam, "dims": dims, "key": key, "conf": 1.0, "note": "",
                                "bbox": r, "angle": 0, "line": f"{t} = {raw} (column schedule)",
                                "column": True, "col_mark": t, "at": (x, y), "on_symbol": bool(sym)})
    # 1b. drawn column symbols of a scheduled size that no mark claimed: a
    # column the plan shows but never bubbled (or a bubble the text layer
    # lost).  Counted as that size with a CHECK note.
    if schedule and ppf:
        by_size = {}
        for mk, (key, raw, fam, dims) in schedule.items():
            by_size.setdefault(key, (mk, raw, fam, dims))
        for key, (mk, raw, fam, dims) in by_size.items():
            try:
                side = float(lengths.eval_frac(dims[0])) / 12 * ppf
            except Exception:
                continue
            for x, y, L in squares(paths, 1.0, side):
                if any(abs(x - cx) <= 3 and abs(y - cy) <= 3 for cx, cy in claimed):
                    continue
                claimed.add((round(x), round(y)))
                columns.append({"raw": raw, "fam": fam, "dims": dims, "key": key, "conf": 1.0, "note": "",
                                "bbox": pymupdf.Rect(x - L / 2, y - L / 2, x + L / 2, y + L / 2), "angle": 0,
                                "line": f"{raw} column symbol without a mark ({mk} size)", "column": True,
                                "col_mark": "", "at": (x, y), "on_symbol": True, "unmarked": True})
    # 2. "HSS 4X4X3/8 COLUMN TYP." beside drawn squares
    thin = max(0.5 * lengths.member_width(chains, callouts), lengths.mode_width(chains) + 0.01)
    labels = [c for c in callouts if c.get("key") and COLUMN_LABEL_RE.search(c.get("line", ""))
              and lengths.TYP_RE.search(c.get("line", "")) and id(c) not in consumed]
    if labels and ppf:
        used = set()
        clusters = lengths.drawing_clusters(page)
        def cluster_of(pt):
            hits = [r for r in clusters if r.contains(pymupdf.Point(*pt))]
            return min(hits, key=lambda r: r.width * r.height) if hits else None
        for lab in labels:
            try:
                nominal_in = float(lengths.eval_frac(lab["dims"][0]))
            except Exception:
                continue
            side = nominal_in / 12 * ppf
            bb = lab["bbox"]
            home = cluster_of(((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2))
            sq = [s for s in squares(paths, thin, side) if (round(s[0]), round(s[1])) not in used
                  and (home is None or cluster_of((s[0], s[1])) == home)]
            if not sq:
                continue
            consumed.add(id(lab))
            for x, y, L in sq:
                used.add((round(x), round(y)))
                columns.append({"raw": lab["raw"], "fam": lab["fam"], "dims": lab["dims"], "key": lab["key"],
                                "conf": lab.get("conf", 1.0), "note": "",
                                "bbox": pymupdf.Rect(x - L / 2, y - L / 2, x + L / 2, y + L / 2), "angle": 0,
                                "line": lab.get("line", ""), "column": True, "col_label": lab, "at": (x, y)})
    # 2b. a POST / COLUMN label with no drawn squares and no stated length is
    # one column where its leader points (a canopy post, a lone column)
    for lab in callouts:
        if id(lab) in consumed or not lab.get("key") or lab.get("column"):
            continue
        if not re.search(r"\b(COL(?:UMN|S|\.)?|POST)\b", lab.get("line", ""), re.I):
            continue
        if lengths.explicit_length(lab.get("line", "").replace(lab.get("raw", ""), " ", 1)):
            continue
        r = pymupdf.Rect(lab["bbox"])
        tip = lengths.leader_tip(r, tips, paths)
        x, y = tip if tip else ((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
        consumed.add(id(lab))
        columns.append({"raw": lab["raw"], "fam": lab["fam"], "dims": lab["dims"], "key": lab["key"],
                        "conf": lab.get("conf", 1.0), "note": "", "bbox": r, "angle": 0,
                        "line": lab.get("line", ""), "column": True, "col_label": None, "at": (x, y)})
    # the same columns drawn on two plans of one sheet (framing above,
    # foundation below) count once: sets that are translations of each other
    columns = _dedupe_plans(columns, ppf or 9)
    # 3. heights from elevation notes
    for c in columns:
        x, y = c["at"]
        near, far = [], None
        same_sheet = bool(notes_by_page.get(pno))
        for p in plan_pages:
            for ft, text, nx, ny in notes_by_page.get(p, []):
                d = math.hypot(nx - x, ny - y) / (ppf or 9)
                if p != pno and same_sheet:
                    d += OTHER_SHEET_PENALTY_FT
                if d <= NEAR_FT:
                    near.append((ft, d, text, p))
                elif d <= FAR_FT:
                    far = max(far, (ft, -d, text, p)) if far else (ft, -d, text, p)
        if far:
            far = (far[0], -far[1], far[2], far[3])
        c["anchor"], c["anchor_pt"], c["anchor_note"] = "column", (x, y), ""
        c["length_ft"], c["seg"], c["confident"] = None, None, False
        c["pier_ft"], c["pier_src"] = pier_allowance((x, y), pno, piers_by_page or {}, ppf)
        if not ppf:
            c["len_note"] = "column: no sheet scale"
            continue
        if near:
            # the column carries the highest steel around it
            ft, d, text, p = max(near, key=lambda t: t[0])
            _set_height(c, ft, ppf, f"'{text}' ({_where(p, pno)})", True)
        elif far:
            ft, d, text, p = far
            _set_height(c, ft, ppf, f"'{text}' ({_where(p, pno)}, {d:.0f} ft away)", False)
        elif section_heights:
            if len(section_heights) == 1:
                (ft, text, p), = section_heights
                _set_height(c, ft, ppf, f"'{text}' ({_where(p, pno)})", True)
            else:
                opts = "; ".join(f"{fmt_feet(ft)} {text[:24]} p{p + 1}" for ft, text, p in section_heights[:3])
                c["len_note"] = f"column: no elevation note on the plans; sections show {opts}"
        else:
            c["len_note"] = "column: no elevation note found; height from sections / column schedule"
        if c.get("col_only_plan"):
            c["confident"] = False
            c["len_note"] = "drawn on one of the two plans only: check; " + c["len_note"]
        if c.get("unmarked"):
            c["confident"] = False
            c["len_note"] = "column symbol with no schedule mark: check the size; " + c["len_note"]
    return columns, consumed


def _nearest_symbol(paths, dims, ppf, pt, thin_w=1.0, reach_ft=12.0):
    """The drawn column square of this section size nearest a mark, within reach."""
    if not ppf:
        return None
    try:
        side = float(lengths.eval_frac(dims[0])) / 12 * ppf
    except Exception:
        return None
    best = None
    for x, y, L in squares(paths, thin_w, side):
        d = math.hypot(x - pt[0], y - pt[1])
        if d <= reach_ft * ppf and (best is None or d < best[0]):
            best = (d, x, y)
    return (best[1], best[2]) if best else None


def _where(p, pno):
    return "this sheet" if p == pno else f"page {p + 1}"


def _set_height(c, ft, ppf, src, confident):
    pier = c.get("pier_ft", PIER_ALLOWANCE_FT)
    h = ft + pier
    x, y = c["at"]
    c["length_ft"], c["confident"] = h, confident
    # origin on the column, leg at 45 degrees: reads as "this one goes up",
    # never mistaken for a beam along a grid line (Todd, 2026-09-05)
    c["seg"] = lengths.z_axis_seg((x, y), h, ppf)
    c["len_note"] = (f"column {fmt_feet(ft)} from {src} + {fmt_feet(pier)} pier cap below finished slab "
                     f"({c.get('pier_src', 'default')})")


def _dedupe_plans(columns, ppf, tol_ft=1.0):
    """Label-found columns come per drawing cluster; when one cluster's set is
    a translation of another's, keep one copy.  Columns on only one of the
    two plans stay, flagged for a check."""
    by_lab = {}
    for c in columns:
        by_lab.setdefault(id(c.get("col_label")) if c.get("col_label") else None, []).append(c)
    groups = [g for k, g in by_lab.items() if k is not None]
    keep = [c for c in columns if not c.get("col_label")]
    dropped = set()
    for i, a in enumerate(groups):
        if id(a) in dropped:
            continue
        for b in groups[i + 1:]:
            if id(b) in dropped or a[0]["key"] != b[0]["key"]:
                continue
            offs = [(bc["at"][0] - ac["at"][0], bc["at"][1] - ac["at"][1]) for ac in a for bc in b]
            offs.sort()
            best = None
            for ox, oy in offs:
                n = sum(1 for ac in a if any(math.hypot(bc["at"][0] - ac["at"][0] - ox, bc["at"][1] - ac["at"][1] - oy) <= tol_ft * ppf for bc in b))
                if best is None or n > best[0]:
                    best = (n, ox, oy)
            if best and best[0] >= 0.7 * min(len(a), len(b)):
                n, ox, oy = best
                matched_a = [ac for ac in a if any(math.hypot(bc["at"][0] - ac["at"][0] - ox, bc["at"][1] - ac["at"][1] - oy) <= tol_ft * ppf for bc in b)]
                matched_b = [bc for bc in b if any(math.hypot(bc["at"][0] - ac["at"][0] - ox, bc["at"][1] - ac["at"][1] - oy) <= tol_ft * ppf for ac in a)]
                for ac in a:
                    if ac not in matched_a:
                        ac["col_only_plan"] = True
                for bc in b:
                    if bc not in matched_b:
                        bc["col_only_plan"] = True
                # keep every column of a, plus b's unmatched ones (flagged)
                a[:] = a + [bc for bc in b if bc not in matched_b]
                dropped.add(id(b))
    for g in groups:
        if id(g) not in dropped:
            keep.extend(g)
    return keep
