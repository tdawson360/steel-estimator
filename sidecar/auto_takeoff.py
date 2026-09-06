"""Auto-takeoff: count AISC member callouts on structural framing plans, draft
their lengths from the plan's line work, and write both back as Revu-readable
annotations.

    python sidecar/auto_takeoff.py "bid.pdf" [-o out.pdf] [--sheets S2.11,S2.12]
                                   [--item 1] [--desc "STRUCTURAL FRAMING"] [--lengths]

For every framing-plan sheet the script finds each shape designation in the
PDF's text layer (any rotation), validates it against the estimator's own AISC
table, and measures the member under it (sidecar/lengths.py).  A callout with
a length becomes a PolyLine measurement in the toolkit's subject and colour,
calibrated to the sheet scale so Revu shows feet-inches and the estimator can
drag its ends; a callout without one becomes a rectangle over the text (count
only).  Every annotation carries the v1.7 profile's custom columns so Revu's
Markups List and CSV export work unchanged.  Unresolved callouts get a red
dashed "Auto Exception" rectangle whose Notes say why.

Outputs, next to the annotated PDF: a Markdown report and a CSV of every hit.
"""
import argparse
import csv
import datetime as dt
import math
import re
import sys
import uuid
from collections import Counter
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
import baseplates                   # noqa: E402  (run() has a local named columns)
import columns as column_step                   # noqa: E402  (run() has a local named columns)
import connections                   # noqa: E402  (run() has a local named columns)
import lengths                                  # noqa: E402
import shapes                                   # noqa: E402
from revu_profile import (column_data, install_columns, load_profile,      # noqa: E402
                          load_toolkit, pdf_string)

ROOT = Path(__file__).resolve().parent.parent
SHEET_NO = re.compile(r"^[A-Z]{1,3}-?\d{1,3}(?:\.\d{1,2})?[A-Z]?$")
KINDS = [("plan", r"\bPLAN"), ("section", r"\bSECTION|\bDETAIL"), ("schedule", r"\bSCHEDULE"),
         ("elevation", r"\bELEVATION"), ("notes", r"\bNOTES\b|\bSPECIFICATIONS?\b")]
FAMILY_SUBJECT = {"W": "Stl W Beam", "WT": "Stl WT", "C": "Stl C", "MC": "Stl MC", "PIPE": "Stl Pipe"}
EXCEPTION_SUBJECT = "Auto Exception"
AUTHOR = "Auto Takeoff"
TARGET_UNIT = 0.001157407          # Revu's pt -> ft constant (1 / 864)


def latest(pattern):
    files = sorted(ROOT.glob(pattern))
    if not files:
        sys.exit(f"no {pattern} in {ROOT}")
    return files[-1]


# ── sheet classification ───────────────────────────────────────────────────

def title_block_clip(page):
    r = page.rect
    return pymupdf.Rect(r.x0 + r.width * 0.85, r.y0 + r.height * 0.55, r.x1, r.y1)


def sheet_info(page):
    """(sheet_number, title, kind).

    The sheet number is the largest sheet-like token on the page (title
    blocks print it big, wherever the block sits and however the page is
    rotated).  The title comes from a Bluebeam page label when one names the
    sheet, else from the largest plan/section/... line near the number."""
    lines = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"]).strip()
            if t:
                size = max(s["size"] for s in l["spans"])
                x0, y0, x1, y1 = l["bbox"]
                lines.append((t, size, (x0 + x1) / 2, (y0 + y1) / 2))
    number, num_pos, num_size = "", None, 0.0
    for t, size, x, y in lines:
        u = t.upper()
        # bubbles ("S3", "C3", "L1") are big too: a sheet number has 2+ digits
        if SHEET_NO.match(u) and not t.isdigit() and len(re.sub(r"\D", "", u)) >= 2 \
                and size > num_size and size >= 12:
            number, num_pos, num_size = u, (x, y), size
    if not number:                                   # small title blocks: lowest-placed token
        for t, size, x, y in sorted(lines, key=lambda l: l[3]):
            if SHEET_NO.match(t.upper()) and not t.isdigit():
                number, num_pos = t.upper(), (x, y)
    # Title: a plan/section/... line, largest font first, nearest the number
    # second; boilerplate is long and ends in a period.
    W, H = max(l[2] for l in lines) if lines else 1, max(l[3] for l in lines) if lines else 1
    cands = []
    for t, size, x, y in lines:
        if len(t) > 45 or t.endswith(".") or size < 7:
            continue
        for rank, (_, pat) in enumerate(KINDS):
            if re.search(pat, t.upper()):
                near = 0 if num_pos is None else math.hypot((x - num_pos[0]) / W, (y - num_pos[1]) / H)
                cands.append((near > 0.35, -size, rank, near, t))
                break
    title = min(cands)[4] if cands else ""
    # A PDF page label of the form "S-61003 - STEEL FRAMING DETAILS - ROOF"
    # (Bluebeam-combined sets) names the sheet better than title-block
    # heuristics, which can latch onto a note like "EL COLUMN, RE: PLAN".
    lab = (page.get_label() or "").strip()
    lab_u = re.sub(r"^\[\d+\]\s*", "", lab.upper())          # "[1] C1.00 CIVIL SITE ..." (Revu index prefix)
    m = re.match(r"^\s*([A-Z]{1,3}-?\d{1,5}(?:\.\d{1,2})?)\s*[-:]?\s*(.*)$", lab_u)
    if m:
        number = m.group(1)                                # a labelled set names its sheets reliably
        if m.group(2).strip():
            title = m.group(2).strip()
    elif lab and not lab.isdigit() and re.search(r"[A-Z]{3,}", lab_u):
        title = lab_u                                      # label is the sheet title itself
    kind = "other"
    up = title.upper()
    for k, pat in KINDS:
        if re.search(pat, up):
            kind = k
            break
    if kind == "plan" and "DEMO" in up:
        kind = "demo"
    return number, title, kind


# ── callout extraction ─────────────────────────────────────────────────────

def page_callouts(page):
    """Every AISC-looking designation on the page outside the title block:
    dicts with raw, fam, dims, bbox, angle (degrees, y-up)."""
    tb = title_block_clip(page)
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        block = " / ".join("".join(s["text"] for s in l["spans"]).strip() for l in b["lines"])
        for l in b["lines"]:
            bbox = pymupdf.Rect(l["bbox"])
            if bbox.intersects(tb):
                continue
            text = "".join(s["text"] for s in l["spans"])
            dx, dy = l["dir"]
            angle = round(math.degrees(math.atan2(-dy, dx)))
            for fam, dims, raw in shapes.find_callouts(text):
                out.append({"raw": raw.strip(), "fam": fam, "dims": dims, "bbox": bbox,
                            "angle": angle, "line": text.strip(), "block": block})
    return out


# ── labels / tools ─────────────────────────────────────────────────────────

class Labeler:
    """Maps a resolved shape key to the profile's Shape_Size choice label and
    the toolkit subject/colour Revu should show it under."""

    def __init__(self, columns, tools):
        col = next(c for c in columns if c.name == "Shape_Size")
        self.by_norm = {shapes.norm(v): (v, subj) for v, subj, _ in col.items}
        self.tools = tools

    def label(self, key, fam, dims):
        hit = self.by_norm.get(shapes.norm(key))
        if hit and hit[1]:
            return hit
        if fam == "JOIST":
            return key, "Stl Joist"
        label = re.sub(r"^([A-Z]+)", r"\1 ", key).replace("x", " x ")
        if fam == "L":
            subj = "Stl L Eq Legs" if len(dims) == 3 and dims[0] == dims[1] else "Stl L UnEq Legs"
        elif fam == "HSS":
            subj = "Stl HSS Sq" if len(dims) == 3 and dims[0] == dims[1] else "Stl HSS Rect"
        else:
            subj = FAMILY_SUBJECT.get(fam, "Stl W Beam")
        return label, subj

    def color(self, subject):
        t = self.tools.get(subject)
        return t.color if t else (1, 0, 0)


def feet_inches(ft):
    total_in = int(round(ft * 12))
    return f"{total_in // 12}'-{total_in % 12}\""


def round_up_inch(seg, ft, ppf):
    """Estimating rule (Todd): every length rounds UP to the next inch.  The
    polyline itself is stretched so Revu's own [Length] agrees: its last
    vertex moves outward along the final segment by the rounding gap."""
    ft_r = math.ceil(ft * 12 - 1e-6) / 12.0
    d = (ft_r - ft) * ppf
    if d <= 0 or len(seg) < 2:
        return seg, ft_r
    (ax, ay), (bx, by) = seg[-2], seg[-1]
    L = math.hypot(bx - ax, by - ay) or 1.0
    return seg[:-1] + [(bx + (bx - ax) / L * d, by + (by - ay) / L * d)], ft_r


def new_name():
    return "AUTO-" + uuid.uuid4().hex[:12].upper()


def add_box(doc, page, rect, subject, color, content, columns, values, dashed=False):
    r = pymupdf.Rect(rect) + (-6, -6, 6, 6)
    annot = page.add_rect_annot(r)
    annot.set_border(width=2, dashes=[6, 3] if dashed else None)
    annot.set_colors(stroke=color, fill=None)
    annot.set_info(title=AUTHOR, subject=subject, content=content)
    annot.update()
    nm = new_name()
    doc.xref_set_key(annot.xref, "NM", pdf_string(nm))
    doc.xref_set_key(annot.xref, "BSIColumnData", column_data(columns, values))
    return nm


class Scale:
    """One /Measure dictionary per sheet scale, plus a page viewport."""

    def __init__(self, doc):
        self.doc = doc
        self.by_ppf = {}

    def measure_xref(self, ppf):
        if ppf in self.by_ppf:
            return self.by_ppf[ppf]
        inch_per_ft = ppf / 72.0                      # 9 pt/ft -> 0.125 in = 1 ft
        r = pdf_string(f"{inch_per_ft:g} in = 1 ft' in\"")
        nf = "/Type /NumberFormat /F /F /D 1 /FD true"
        obj = (f"<< /Type /Measure /Subtype /RL /R {r}"
               f" /X [ << {nf} /U (') /C {1.0 / ppf:.7f} /SS () >> ]"
               f" /D [ << {nf} /U (') /C 1 /PS () /SS (-) >> << {nf} /U (\") /C 12 /PS () /SS () >> ]"
               f" /A [ << /Type /NumberFormat /U (sf) /C 1 /D 1 /FD true /SS () >> ]"
               f" /TargetUnitConversion {TARGET_UNIT} >>")
        xref = self.doc.get_new_xref()
        self.doc.update_object(xref, obj)
        self.by_ppf[ppf] = xref
        return xref

    def install_viewports(self, page, regions):
        """One Bluebeam-style scaling window per drawing region; returns
        {ppf: measure xref} for the annotations to reference."""
        H = page.rect.height
        refs, out = [], {}
        for rect, ppf in regions:
            mx = self.measure_xref(ppf)
            out[ppf] = mx
            vp = self.doc.get_new_xref()
            bbox = f"[{rect.x0:g} {H - rect.y1:g} {rect.x1:g} {H - rect.y0:g}]"     # PDF y-up
            self.doc.update_object(vp, f"<< /Type /Viewport /BBox {bbox} /Measure {mx} 0 R "
                                       f"/Name (Viewport) /NM {pdf_string(new_name())} >>")
            refs.append(f"{vp} 0 R")
        if refs:
            self.doc.xref_set_key(page.xref, "VP", "[" + " ".join(refs) + "]")
        return out


def scale_text(ppf):
    """9 pt/ft -> '1/8" = 1\\'-0"'."""
    from fractions import Fraction
    f = Fraction(ppf / 72.0).limit_denominator(64)
    inch = f"{f.numerator}/{f.denominator}" if f.denominator > 1 else str(f.numerator)
    return f"{inch}\" = 1'-0\""


def add_polyline(doc, page, pts, subject, color, ft, columns, values, measure_xref):
    annot = page.add_polyline_annot([pymupdf.Point(x, y) for x, y in pts])
    annot.set_border(width=3)
    annot.set_colors(stroke=color, fill=color)
    annot.set_info(title=AUTHOR, subject=subject, content=feet_inches(ft))
    annot.update()
    nm = new_name()
    x = annot.xref
    doc.xref_set_key(x, "NM", pdf_string(nm))
    doc.xref_set_key(x, "BM", "/Multiply")               # Revu "highlight" blend: the drawn line shows through
    doc.xref_set_key(x, "IT", "/PolyLineDimension")
    doc.xref_set_key(x, "Measure", f"{measure_xref} 0 R")
    doc.xref_set_key(x, "MeasurementTypes", "130")
    doc.xref_set_key(x, "DS", pdf_string("font: bold Helvetica 12pt; text-align:center; line-height:13.8pt; color:#800000"))
    doc.xref_set_key(x, "DepthUnit", f"[<< /Type /NumberFormat /U (') /C {TARGET_UNIT} /D 100 /FD true /SS () >>]")
    doc.xref_set_key(x, "BSIColumnData", column_data(columns, values))
    return nm


# ── main ───────────────────────────────────────────────────────────────────

PLATE_SUBJECT = "Stl Pl/Bar"


def column_fields(h, base_spec):
    """Member_Mark / Part_Label / weld for a column row (the plate nests
    under the mark)."""
    if not h.get("column"):
        return {}
    out = {"Member_Mark": h.get("mark", ""), "Part_Label": "COLUMN"}
    if base_spec and base_spec.get("weld_in"):
        out["Weld_Type"] = "Fillet"
    return out


def run(args):
    profile = Path(args.profile) if args.profile else latest("Steel_Estimator_Takeoff_v*.bpx")
    toolkit = Path(args.toolkit) if args.toolkit else latest("BIW_Steel_Tool_Kit_v*.btx")
    pname, columns = load_profile(profile)
    tname, tools = load_toolkit(toolkit)
    labeler = Labeler(columns, tools)
    weights = shapes.all_weights()

    src = Path(args.pdf)
    out = Path(args.output) if args.output else src.with_name(src.stem + "_AUTO.pdf")
    doc = pymupdf.open(src)
    scale = Scale(doc)
    wanted = {s.strip().upper() for s in args.sheets.split(",")} if args.sheets else None

    sheets, hits, exceptions, labels = [], [], [], []
    infos = [sheet_info(page) for page in doc]
    # columns: the schedule and the elevation notes live on other sheets
    def disc(n):
        return re.match(r"[A-Z]*", n).group(0)[-1:]
    plan_pages = [i for i, (n, t, k) in enumerate(infos) if k == "plan" and disc(n) == "S"]
    other_s = [i for i, (n, t, k) in enumerate(infos) if k != "plan" and disc(n) == "S"]
    col_schedule, col_blocks = column_step.column_schedule(doc, plan_pages)
    notes_by_page = {i: column_step.elevation_notes(doc[i]) for i in plan_pages}
    section_heights = column_step.section_elevations(doc, other_s)
    piers_by_page = {i: column_step.pier_notes(doc[i]) for i in plan_pages + other_s}
    # the typical column base plate detail: one nested plate per column
    base_details = baseplates.find_details(doc, plan_pages + other_s, {i: n for i, (n, t, k) in enumerate(infos)})
    base_spec = baseplates.choose(base_details)
    col_marks = 0
    # how this engineer connects beams: every framed end of a W or C is one
    # connection of the typical kind (Todd keeps the takeoff generic)
    conn_spec = connections.typical(doc, other_s + plan_pages, {i: n for i, (n, t, k) in enumerate(infos)})
    for pno, page in enumerate(doc):
        number, title, kind = infos[pno]
        print(f"PROGRESS {pno + 1}/{doc.page_count} {number or ''}", flush=True)
        chars = len(page.get_text().strip())
        labels.append(number or page.get_label() or str(pno + 1))
        discipline = re.match(r"[A-Z]*", number).group(0)[-1:]      # "LRS2.11" -> "S"
        structural = discipline == "S"
        # Plans with no readable sheet number (stroke-font title blocks) are
        # scanned too; they cost nothing unless callouts turn up.
        annotate = (number in wanted) if wanted else ((structural or not number) and kind == "plan")
        scan = annotate or structural
        found = page_callouts(page) if (scan and chars) else []
        source = "text"
        if annotate and not found and args.ocr != "off":
            import ocr                                   # heavy import, only when needed
            found = ocr.ocr_callouts(page, dpi=args.ocr_dpi)
            source = "ocr"
            for h in found:
                h["note_extra"] = f"OCR {h['ocr_conf']:.2f}"
            if found and not number:
                number = ocr.ocr_sheet_number(page, title_block_clip(page))
                labels[-1] = number or labels[-1]
        regions = lengths.scale_regions(page) if annotate else []
        ppf = regions[0][1] if regions else None
        rec = {"page": pno + 1, "sheet": number or "?", "title": title, "kind": kind,
               "chars": chars, "hits": len(found), "annotated": annotate, "source": source,
               "scale": "; ".join(sorted({scale_text(p) for _, p in regions})) if regions else ""}
        sheets.append(rec)
        if not annotate:
            continue
        for h in found:
            h["key"], h["conf"], h["note"] = shapes.resolve(h["fam"], h["dims"])
        resolved = [h for h in found if h["key"]]
        chains = None
        if args.lengths and resolved:
            extra = None
            if args.raster != "off":
                import raster                            # OpenCV, only when needed
                if raster.has_raster_linework(page):
                    extra, _, _ = raster.raster_polylines(page, dpi=args.raster_dpi)
                    rec["raster"] = len(extra)
            # one pass per scaling window, like Bluebeam's per-plan viewports
            chains = lengths.extract_chains(page, extra)
            groups = {}
            for h in resolved:
                centre = ((h["bbox"].x0 + h["bbox"].x1) / 2, (h["bbox"].y0 + h["bbox"].y1) / 2)
                rect, rppf = lengths.region_for(regions, centre) if regions else (None, None)
                groups.setdefault((id(rect), rppf), (rect, rppf, []))[2].append(h)
            for rect, rppf, group in groups.values():
                lengths.measure(page, group, weights, rppf, chains=chains)
                # members drawn but not labelled: tags defined by a legend
                # line, and strokes covered by a "TYP" label
                typ = lengths.tag_instances(page, group, weights, rppf, chains)
                typ += lengths.typ_instances(page, group + typ, weights, rppf, chains, all_callouts=resolved)
                for h in group + typ:
                    h["ppf"] = rppf
                found.extend(typ)
                rec["typ"] = rec.get("typ", 0) + len(typ)
        # columns: schedule marks / "COLUMN TYP." squares on this plan, heights
        # from the elevation notes (+1 ft pier cap), drawn as vertical polylines
        if structural and (col_schedule or any(column_step.COLUMN_LABEL_RE.search(h.get("line", "")) for h in resolved)):
            if chains is None:
                chains = lengths.extract_chains(page)
            ppf0 = regions[0][1] if regions else None
            cols, consumed = column_step.columns_on_page(page, pno, number, resolved, chains, ppf0, col_schedule,
                                                     col_blocks.get(pno), notes_by_page, plan_pages, section_heights,
                                                     piers_by_page)
            if consumed:
                found = [h for h in found if id(h) not in consumed]
            for h in cols:
                rect, rppf = lengths.region_for(regions, h["at"]) if regions else (None, None)
                h["ppf"] = rppf
                col_marks += 1
                h["mark"] = f"C{col_marks}"
                if not args.lengths:
                    h["length_ft"], h["seg"], h["confident"] = None, None, False
            found.extend(cols)
            rec["columns"] = len(cols)
        xrefs = scale.install_viewports(page, regions) if (regions and args.lengths) else {}
        triangles = connections.moment_triangles(page, chains) if args.lengths else []
        for h in found:
            row = {**rec, **h, "conn_spec": conn_spec}
            base = {"Item_Number": args.item, "Item_Description": args.desc, "Drawing_Ref": number}
            if not h["key"]:
                row["label"], row["subject"], row["length_ft"] = h["raw"], EXCEPTION_SUBJECT, None
                values = {**base, "Shape_Size": h["raw"], "Notes": f"AUTO EXCEPTION: {h['note']}"}
                row["nm"] = add_box(doc, page, h["bbox"], EXCEPTION_SUBJECT, (1, 0, 0), h["raw"],
                                    columns, values, dashed=True)
                exceptions.append(row)
                continue
            label, subject = labeler.label(h["key"], h["fam"], h["dims"])
            row["label"], row["subject"] = label, subject
            ft = h.get("length_ft")
            len_note = h.get("len_note", "")
            if h["conf"] < 1:
                len_note = "; ".join(n for n in (f"size {h['note']}", len_note) if n)
            if h.get("note_extra"):
                len_note = "; ".join(n for n in (h["note_extra"], len_note) if n)
            row["length_ft"] = ft
            measure_xref = xrefs.get(h.get("ppf"))
            if ft and measure_xref and h.get("seg") and h.get("confident"):
                h["seg"], ft = round_up_inch(h["seg"], ft, h.get("ppf") or ppf)
                row["length_ft"] = ft
                tag = "AUTO COL" if h.get("column") else "AUTO TYP" if h.get("typ_from") or h.get("tag_from") else "AUTO LEN"
                # a column's note explains its height; it is a CHECK only when flagged
                sep = ": " if h.get("column") and not h.get("col_only_plan") else " CHECK: "
                notes = tag + (f"{sep}{len_note}" if len_note else "")
                lbft = weights.get(h["key"], 0)
                connx = connections.assign(h, conn_spec, triangles)
                if connx.get("Connection_Type") and connx.get("Connection_Qty"):
                    notes += f" | connx: {connx['Connection_Type']} x{connx['Connection_Qty']} (ends: {connections.describe_ends(h)})"
                    if h.get("moment_ends") == 1:
                        notes += " | other end: typical shear connection, add by hand"
                    if h.get("free_ends"):
                        notes += f" CHECK: {h['free_ends']} end(s) frame into nothing drawn"
                    row["connx"] = f"{connx['Connection_Type']} x{connx['Connection_Qty']}"
                values = {**base, "Shape_Size": label, "Quantity": "1", "Notes": notes,
                          "Measured_Length": f"{ft:.2f}", "Weight_Per_Ft": f"{lbft:g}",
                          "Total_Length_Ft": f"{ft:.1f}", "Total_Weight_Lbs": f"{ft * lbft:.0f}",
                          **connx, **column_fields(h, base_spec)}
                row["nm"] = add_polyline(doc, page, h["seg"], subject, labeler.color(subject), ft,
                                         columns, values, measure_xref)
            else:
                draft = f"draft {ft:.1f} ft" if ft else ""
                why = "; ".join(n for n in (draft, len_note) if n)
                notes = ("AUTO COL COUNT ONLY" if h.get("column") else "AUTO COUNT ONLY") + (f": {why}" if why else "")
                values = {**base, "Shape_Size": label, "Quantity": "1", "Notes": notes, **column_fields(h, base_spec)}
                row["nm"] = add_box(doc, page, h["bbox"], subject, labeler.color(subject), label,
                                    columns, values, dashed=h["conf"] < 1)
            hits.append(row)
            if h.get("column") and base_spec:
                # the base connection: a plate nested under the column
                # (Member_Mark C7 -> C7.1) with holes for the anchor rods
                pv, plate_lb = baseplates.plate_row(base_spec, h["mark"])
                checks = [] if base_spec.get("rod_n_stated") else ["rod count assumed 4 (drawn, not written)"]
                pnotes = (f"AUTO BASE PL: {baseplates.describe(base_spec)} from '{base_spec['title']}' on "
                          f"{base_spec.get('sheet') or 'p' + str(base_spec['page'] + 1)}"
                          + (f" CHECK: {'; '.join(checks)}" if checks else ""))
                x, y = h["at"]
                prow = {**rec, "raw": pv["Shape_Size"], "fam": "PL", "dims": [], "key": pv["Shape_Size"], "conf": 1.0,
                        "note": "", "label": pv["Shape_Size"], "subject": PLATE_SUBJECT, "length_ft": float(pv["Length_Ft"]),
                        "base_plate": True, "plate_lb": plate_lb, "line": pnotes, "bbox": pymupdf.Rect(x - 8, y - 8, x + 8, y + 8),
                        "column_mark": h["mark"], "angle": 0, "anchor": "column", "len_note": "", "confident": True}
                prow["nm"] = add_box(doc, page, prow["bbox"], PLATE_SUBJECT, labeler.color(PLATE_SUBJECT), pv["Shape_Size"],
                                     columns, {**base, **pv, "Notes": pnotes})
                hits.append(prow)

    install_columns(doc, columns)
    try:
        doc.set_page_labels([{"startpage": i, "prefix": lab, "style": "", "firstpagenum": 1}
                             for i, lab in enumerate(labels)])
    except Exception as e:                       # labels are a convenience only
        print(f"page labels not set: {e}", file=sys.stderr)
    doc.save(out, garbage=3, deflate=True)

    write_report(out, src, pname, tname, sheets, hits, exceptions, weights)
    write_csv(out, hits + exceptions)
    if getattr(args, "json", None):
        write_json(Path(args.json), src, sheets, hits, exceptions, weights)
    return out, sheets, hits, exceptions


def write_json(path, src, sheets, hits, exceptions, weights):
    """Machine summary for the estimator app's job runner."""
    import json
    groups = {}
    for h in hits:
        g = groups.setdefault(h["label"], {"size": h["label"], "key": h["key"], "count": 0, "drawn": 0, "drawn_lf": 0.0,
                                           "draft": 0, "draft_lf": 0.0, "lbft": weights.get(h["key"])})
        g["count"] += 1
        if h.get("length_ft") and h.get("confident"):
            g["drawn"] += 1
            g["drawn_lf"] += h["length_ft"]
        elif h.get("length_ft"):
            g["draft"] += 1
            g["draft_lf"] += h["length_ft"]
    tons = sum((g["drawn_lf"] + g["draft_lf"]) * (g["lbft"] or 0) for g in groups.values()) / 2000
    summary = {
        "file": src.name, "run": dt.datetime.now().isoformat(timespec="minutes"),
        "sheets": [{k: v for k, v in s.items() if k != "raster"} for s in sheets if s["annotated"] or s["hits"]],
        "members": len(hits), "exceptions": len(exceptions), "tons_measured": round(tons, 1),
        "sizes": sorted(groups.values(), key=lambda g: -g["count"]),
    }
    path.write_text(json.dumps(summary, indent=1), encoding="utf-8")


def collections_counter(it):
    return dict(Counter(v for v in it if v))


def write_report(out, src, pname, tname, sheets, hits, exceptions, weights):
    lines = [f"# Auto takeoff: {src.name}", "",
             f"Run {dt.datetime.now():%Y-%m-%d %H:%M}. Profile {pname}. Tools {tname}. Output `{out.name}`.", "",
             "## Sheets", "", "| Page | Sheet | Kind | Title | Scale | Text | Callouts | Read by | Annotated |",
             "|---|---|---|---|---|---|---|---|---|"]
    for s in sheets:
        if s["sheet"] == "?" and not s["annotated"] and not s["hits"]:
            continue
        src = s.get("source", "text") if s["hits"] else ""
        if s.get("raster"):
            src += f" + {s['raster']} raster strokes"
        lines.append(f"| {s['page']} | {s['sheet']} | {s['kind']} | {s['title']} | {s['scale']} | "
                     f"{'yes' if s['chars'] else 'NO TEXT'} | {s['hits']} | {src} | {'yes' if s['annotated'] else ''} |")
    notext = [s for s in sheets if not s["chars"]]
    if notext:
        lines += ["", f"Pages with no text layer (need OCR): {', '.join(str(s['page']) for s in notext)}"]
    lines += ["", "## Members (annotated sheets)", "",
              "Drawn = polyline written to the PDF (confident). Draft = length only in the box's Notes, for you to draw.", "",
              "| Sheet | Shape | Count | Drawn | Drawn LF | Draft | Draft LF | lb/ft |", "|---|---|---|---|---|---|---|---|"]
    groups = {}
    for h in hits:
        if h.get("base_plate"):
            continue                                     # listed under "Base plates"
        g = groups.setdefault((h["sheet"], h["label"], h["key"]), [0, 0, 0.0, 0, 0.0])
        g[0] += 1
        if h.get("length_ft") and h.get("confident"):
            g[1] += 1
            g[2] += h["length_ft"]
        elif h.get("length_ft"):
            g[3] += 1
            g[4] += h["length_ft"]
    tot_lb = 0.0
    for (sheet, label, key), (n, nd, lfd, nr, lfr) in sorted(groups.items()):
        lbft = weights.get(key) or 0
        tot_lb += (lfd + lfr) * lbft
        lines.append(f"| {sheet} | {label} | {n} | {nd} | {lfd:.1f} | {nr} | {lfr:.1f} | {lbft:g} |")
    lines += ["", f"Total members counted: {len(hits)}. Drawn + draft tonnage: {tot_lb / 2000:.1f} tons (excludes members with no length)."]
    typ = {}
    for h in hits:
        lab = h.get("typ_from") or h.get("tag_from")
        if lab:
            g = typ.setdefault((h["sheet"], lab.get("line", "")[:50], h["label"]), [0, 0.0])
            g[0] += 1
            g[1] += h.get("length_ft") or 0.0
    if typ:
        lines += ["", "## Typical members", "",
                  "Unlabelled strokes of the same line weight and rough length as a member whose label says TYP; "
                  "each is drawn as its own polyline with an AUTO TYP note.", "",
                  "| Sheet | TYP label | Shape | Instances | LF |", "|---|---|---|---|---|"]
        for (sheet, line, label), (n, lf) in sorted(typ.items()):
            lines.append(f"| {sheet} | {line} | {label} | {n} | {lf:.1f} |")
    cols = {}
    for h in hits:
        if h.get("column"):
            g = cols.setdefault((h["sheet"], h["label"]), [0, 0, 0.0, set()])
            g[0] += 1
            if h.get("length_ft") and h.get("confident"):
                g[1] += 1
                g[2] += h["length_ft"]
            m = re.search(r"from '(.*?)' \(", h.get("len_note", ""))
            if m:
                g[3].add(m.group(1)[:30])
    if cols:
        lines += ["", "## Columns", "",
                  "Counted from schedule marks or COLUMN TYP. labels on the plan; height = the highest elevation note "
                  "near the column + 1'-0\" (columns bolt to the pier cap below the finished slab). "
                  "Drawn as vertical polylines with an AUTO COL note naming the elevation used.", "",
                  "| Sheet | Shape | Columns | Drawn | LF | Elevations used |", "|---|---|---|---|---|---|"]
        for (sheet, label), (n, nd, lf, srcs) in sorted(cols.items()):
            lines.append(f"| {sheet} | {label} | {n} | {nd} | {lf:.1f} | {'; '.join(sorted(srcs))[:80]} |")
    connx = collections_counter(h.get("connx") for h in hits if h.get("connx"))
    if connx:
        spec = hits[0].get("conn_spec") if hits else None
        lines += ["", "## Connections", "",
                  "Every framed end of a measured W or C beam is one connection of the set's typical kind; "
                  "ends are read from what the member frames into (a crossing member, a grid line). "
                  "End labor Straight, 2 drilled holes per framed end; HSS / angles / WT shipped Loose.", ""]
        if spec:
            lines.append(f"Typical connection details read: {'; '.join(f'{s0} {t} -> {k}' for s0, t, k in spec['sources'][:8])}"
                         if spec.get("sources") else "No typical connection detail found: Bolted assumed.")
            lines.append("")
        lines += ["| Connection | Members |", "|---|---|"]
        for k, n in sorted(connx.items()):
            lines.append(f"| {k} | {n} |")
    plates = [h for h in hits if h.get("base_plate")]
    if plates:
        by = {}
        for h in plates:
            g = by.setdefault((h["sheet"], h["label"]), [0, 0.0])
            g[0] += 1
            g[1] += h.get("plate_lb", 0.0)
        lines += ["", "## Base plates", "",
                  "One plate nested under every column (Member_Mark C7 -> C7.1) from the typical column base plate detail; "
                  "holes drilled for the anchor rods, the column-to-plate weld on the column row. "
                  f"Spec: {plates[0]['line']}", "",
                  "| Sheet | Plate | Count | lb |", "|---|---|---|---|"]
        for (sheet, label), (n, lb) in sorted(by.items()):
            lines.append(f"| {sheet} | {label} | {n} | {lb:.0f} |")
    checks = [h for h in hits if (h.get("len_note") or h["conf"] < 1) and not (h.get("typ_from") or h.get("tag_from") or h.get("column") or h.get("base_plate"))]
    if checks:
        lines += ["", "## Needs a look", ""]
        for h in checks:
            what = f"{h['length_ft']:.1f} ft" if h.get("length_ft") else "count only"
            why = "; ".join(n for n in (h["note"] if h["conf"] < 1 else "", h.get("len_note", "")) if n)
            lines.append(f"- p{h['page']} {h['sheet']}: `{h['raw']}` as **{h['label']}**, {what}: {why}")
    lines += ["", "## Exceptions (red dashed boxes)", ""]
    if exceptions:
        for r in exceptions:
            lines.append(f"- p{r['page']} {r['sheet']}: `{r['raw']}` in \"{r['line'][:60]}\" -> {r['note']}")
    else:
        lines.append("none")
    skipped = [s for s in sheets if s["hits"] and not s["annotated"]]
    if skipped:
        lines += ["", "## Callouts on sheets that were not counted", ""]
        lines += [f"- p{s['page']} {s['sheet']} ({s['kind']}): {s['hits']} callouts" for s in skipped]
    out.with_suffix(".report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_csv(out, rows):
    cols = ["page", "sheet", "subject", "label", "key", "conf", "length_ft", "anchor", "len_note", "note",
            "raw", "line", "angle", "x0", "y0", "x1", "y1", "nm"]
    with open(out.with_suffix(".hits.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            b = r["bbox"]
            w.writerow([r["page"], r["sheet"], r["subject"], r["label"], r["key"] or "", r["conf"],
                        f"{r['length_ft']:.2f}" if r.get("length_ft") else "", r.get("anchor", ""),
                        r.get("len_note", ""), r["note"], r["raw"], r["line"], r["angle"],
                        round(b.x0, 1), round(b.y0, 1), round(b.x1, 1), round(b.y1, 1), r["nm"]])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("-o", "--output")
    ap.add_argument("--sheets", help="comma-separated sheet numbers to annotate (default: structural plans)")
    ap.add_argument("--item", default="1", help="Item_Number for every auto row")
    ap.add_argument("--desc", default="STRUCTURAL FRAMING", help="Item_Description for every auto row")
    ap.add_argument("--lengths", action="store_true",
                    help="also draft member lengths from the line work (experimental; off by default)")
    ap.add_argument("--ocr", choices=["auto", "off"], default="auto",
                    help="read callouts by OCR when a plan's text layer has none (stroke-font sheets)")
    ap.add_argument("--ocr-dpi", type=int, default=300)
    ap.add_argument("--raster", choices=["auto", "off"], default="auto",
                    help="with --lengths: also measure strokes recovered from image tiles")
    ap.add_argument("--raster-dpi", type=int, default=200)
    ap.add_argument("--json", help="write a machine summary here (for the estimator app)")
    ap.add_argument("--profile", help=".bpx to take the column contract from (default: newest in repo)")
    ap.add_argument("--toolkit", help=".btx to take subjects/colours from (default: newest in repo)")
    args = ap.parse_args()
    out, sheets, hits, exceptions = run(args)
    print(f"wrote {out}")
    print(f"annotated sheets: {', '.join(s['sheet'] for s in sheets if s['annotated']) or 'none'}")
    by = {}
    for h in hits:
        g = by.setdefault(h["label"], [0, 0, 0.0])
        g[0] += 1
        if h.get("length_ft"):
            g[1] += 1
            g[2] += h["length_ft"]
    for label, (n, nl, lf) in sorted(by.items(), key=lambda kv: -kv[1][0]):
        print(f"  {n:4d}  {label:20} {nl:3d} with length  {lf:8.1f} LF")
    print(f"members: {len(hits)}   exceptions: {len(exceptions)}   report: {out.with_suffix('.report.md').name}")


if __name__ == "__main__":
    main()
