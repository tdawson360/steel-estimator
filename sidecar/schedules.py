"""Positional schedule tables: COLUMN SCHEDULE and BASE PLATE SCHEDULE laid
out as real tables (a MARK column, a COLUMN TYPE column, ...), where the
text layer reads column by column ("C1 C2 C3 W12X45 W14X283 HSS8X8X5/16
BP1 BP2 BP3") and the line-by-line reader in columns.py sees no pairs.

OXY Hanger S302 (2026-09-12, Todd: "there is clear markings on the plan
view to identify the column type ... and a drawing with base plate and
anchor bolt schedules"): the header cells are found by their labels, each
row by the y of its MARK cell, and every other cell by the header column
its x falls under.
"""
import re

import pymupdf

import shapes

MARK_RE = re.compile(r"^[A-Z]{1,2}\d{1,2}[A-Z]?$")
BP_RE = re.compile(r"^BP-?\d+[A-Z]?$", re.I)
HEADER_ABOVE_PT = 16     # a stacked header ("COLUMN" over "TYPE") starts this far above MARK
HEADER_BELOW_PT = 8
TABLE_WIDTH_PT = 900     # a schedule is never wider than this; the next table starts beyond a gap
COLUMN_GAP_PT = 220
ROW_TOL_PT = 9           # cells of one row share a baseline within this


def _words(page):
    return [(pymupdf.Rect(w[:4]), w[4]) for w in page.get_text("words")]


def _columns_from_header(words, mark):
    """Header cells around a MARK word -> [(label, x_centre)] sorted by x."""
    band = [(r, t) for r, t in words
            if mark.y0 - HEADER_ABOVE_PT <= r.y0 <= mark.y1 + HEADER_BELOW_PT and mark.x0 - 12 <= r.x0 <= mark.x0 + TABLE_WIDTH_PT
            and not (MARK_RE.match(t.upper()) or BP_RE.match(t) or re.match(r"^[\d/'\"-]+$", t))]
    band.sort(key=lambda rt: rt[0].x0)
    cols = []                      # [[x0, x1, [(y0, x0, text)]]]
    for r, t in band:
        for c in cols:
            overlap = min(r.x1, c[1]) - max(r.x0, c[0])
            stacked = overlap > 0.3 * min(r.width, c[1] - c[0]) or abs((r.x0 + r.x1) / 2 - (c[0] + c[1]) / 2) <= 10
            # "B (IN)", "LENGTH, L (IN)": the next word of the same label on the same line
            same_line = any(abs(y0 - r.y0) < 6 for y0, _, _ in c[2]) and 0 <= r.x0 - c[1] <= 5
            if stacked or same_line:
                c[0], c[1] = min(c[0], r.x0), max(c[1], r.x1)
                c[2].append((r.y0, r.x0, t))
                break
        else:
            cols.append([r.x0, r.x1, [(r.y0, r.x0, t)]])
    cols.sort(key=lambda c: c[0])
    out = []
    for x0, x1, texts in cols:
        if out and x0 - out[-1][2] > COLUMN_GAP_PT:
            break                                       # the next table on the sheet
        label = " ".join(t for _, _, t in sorted(texts)).upper()
        out.append((label, (x0 + x1) / 2, x1))
    return [(label, x) for label, x, _ in out]


def tables(page):
    """Every positional table on the page keyed by a MARK header:
    [(columns [(label, x)], rows [{label: cell text}])]."""
    words = _words(page)
    out = []
    for mark, mtext in words:
        if mtext.upper() != "MARK":
            continue
        cols = _columns_from_header(words, mark)
        if len(cols) < 3:
            continue
        # rows: mark-like words in the MARK column below the header
        mark_col = next((x for label, x in cols if label.startswith("MARK")), None)
        if mark_col is None:
            continue
        keys = [(r, t) for r, t in words if abs((r.x0 + r.x1) / 2 - mark_col) <= 30 and r.y0 > mark.y1 + 8
                and (MARK_RE.match(t.upper()) or BP_RE.match(t))]
        keys.sort(key=lambda rt: rt[0].y0)
        rows = []
        last_y = None
        for r, t in keys:
            if last_y is not None and r.y0 - last_y > 90:
                break                                   # a different table further down
            last_y = r.y0
            yc = (r.y0 + r.y1) / 2
            cells = {}
            for wr, wt in words:
                if abs((wr.y0 + wr.y1) / 2 - yc) > ROW_TOL_PT:
                    continue
                xc = (wr.x0 + wr.x1) / 2
                label, cx = min(cols, key=lambda c: abs(c[1] - xc))
                if abs(cx - xc) > 70:
                    continue
                cells.setdefault(label, []).append((wr.x0, wt))
            rows.append({label: " ".join(t for _, t in sorted(v)) for label, v in cells.items()})
        if rows:
            out.append((cols, rows))
    return out


def _col(row, *needles):
    for label, text in row.items():
        if all(n in label for n in needles):
            return text
    return ""


def column_schedule(doc, pages):
    """{mark: (key, raw, fam, dims)}, {mark: base plate tag} from positional
    COLUMN SCHEDULE tables (a MARK column beside a COLUMN TYPE / SIZE column)."""
    marks, bp_of = {}, {}
    for pno in pages:
        page = doc[pno]
        if not re.search(r"COLUMN\s+SCHEDULE", page.get_text(), re.I):
            continue
        for cols, rows in tables(page):
            labels = [l for l, _ in cols]
            if not any(("COLUMN" in l and ("TYPE" in l or "SIZE" in l)) or l in ("SIZE", "SECTION", "SHAPE") for l in labels):
                continue
            for row in rows:
                mark = _col(row, "MARK").upper()
                size = _col(row, "COLUMN", "TYPE") or _col(row, "COLUMN", "SIZE") or _col(row, "SIZE") or _col(row, "SECTION") or _col(row, "SHAPE")
                if not (mark and MARK_RE.match(mark) and size):
                    continue
                hits = list(shapes.find_callouts(size.upper()))
                if not hits:
                    continue
                fam, dims, raw = hits[0]
                key = shapes.resolve(fam, dims)[0]
                if not key:
                    continue
                marks[mark] = (key, raw.strip(), fam, dims)
                bp = _col(row, "BASE", "TYPE") or _col(row, "BASEPLATE") or _col(row, "BASE PLATE")
                m = BP_RE.match(bp.strip()) if bp else None
                if m:
                    bp_of[mark] = bp.strip().upper().replace(" ", "")
    return marks, bp_of


def _inches(text):
    """Inches from '3/4"', '1 1/2"', '2\'-0"', '20', '6'."""
    t = (text or "").strip().replace("”", '"').replace("″", '"')
    if not t:
        return None
    m = re.match(r"^(\d+)'\s*-?\s*(\d+)?(?:\s+(\d)/(\d+))?\"?$", t)
    if m:
        return int(m.group(1)) * 12 + (int(m.group(2)) if m.group(2) else 0) + ((int(m.group(3)) / int(m.group(4))) if m.group(3) else 0)
    m = re.match(r"^(\d+)?\s*(?:(\d+)/(\d+))?\s*\"?$", t)
    if m and (m.group(1) or m.group(2)):
        return (int(m.group(1)) if m.group(1) else 0) + ((int(m.group(2)) / int(m.group(3))) if m.group(2) else 0)
    return None


def base_plate_schedule(doc, pages, sheet_numbers=None):
    """{BP1: spec} from positional BASE PLATE SCHEDULE tables: plate B x N x
    tp, anchor rod quantity / diameter / length / projection, weld size.
    Spec keys match baseplates.parse_spec so the plate row, the rod label and
    the column fields work unchanged."""
    out = {}
    for pno in pages:
        page = doc[pno]
        text = page.get_text()
        if not re.search(r"BASE\s*PLATE\s+SCHEDULE", text, re.I):
            continue
        grade = re.search(r"F1554\D{0,20}(?:GRADE|GR\.?)\s*(\d+)", text, re.I)
        rod_spec = f"F1554 GR {grade.group(1)}" if grade else "F1554"
        galv = bool(re.search(r"ANCHOR\s+RODS?[^.\n]{0,80}(GALV|HDG)", text, re.I))
        for cols, rows in tables(page):
            labels = [l for l, _ in cols]
            if not any(l.startswith("TP") or l.startswith("T (") or "THICK" in l for l in labels):
                continue
            for row in rows:
                tag = _col(row, "MARK").strip().upper().replace(" ", "")
                if not BP_RE.match(tag):
                    continue
                tp = _inches(_col(row, "TP") or _col(row, "THICK") or _col(row, "T ("))
                b = _inches(_col(row, "B (") or _col(row, "B"))
                n = _inches(_col(row, "N (") or _col(row, "N"))
                if not tp:
                    continue
                spec = {"thick_in": tp, "w_in": b or n, "l_in": n or b, "rod_n": 4, "rod_n_stated": False,
                        "rod_dia_in": None, "rod_spec": rod_spec, "embed_in": None, "weld_in": None,
                        "rod_len_in": None, "page": pno, "sheet": (sheet_numbers or {}).get(pno, ""),
                        "title": tag, "typical": False, "braced": False,
                        "text": f"{tag} base plate schedule: PL {tp}\" x {b} x {n}" + (" GALV" if galv else "")}
                qty = _col(row, "QUANTITY") or _col(row, "QTY") or _col(row, "NO.")
                if qty and qty.strip().isdigit():
                    spec["rod_n"], spec["rod_n_stated"] = int(qty), True
                spec["rod_dia_in"] = _inches(_col(row, "DIAMETER") or _col(row, "DIA"))
                spec["rod_len_in"] = _inches(_col(row, "LENGTH"))
                proj = _inches(_col(row, "PROJECTION"))
                if spec["rod_len_in"] and proj is not None:
                    spec["embed_in"] = max(spec["rod_len_in"] - proj - tp, 0)
                spec["weld_in"] = _inches(_col(row, "W (") or _col(row, "WELD"))
                if spec["rod_dia_in"]:
                    spec["text"] += f" w/ ({spec['rod_n']}) {spec['rod_dia_in']}\" dia {rod_spec} anchor rods"
                    if spec["rod_len_in"]:
                        spec["text"] += f" x {spec['rod_len_in']:g}\" long"
                out.setdefault(tag, spec)
    return out
