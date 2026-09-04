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
    """(sheet_number, title, kind) from the title block; falls back to the
    PDF page label when the block yields nothing."""
    clip = title_block_clip(page)
    lines = []
    for b in page.get_text("dict", clip=clip)["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"]).strip()
            if t:
                lines.append((l["bbox"][3], t))
    lines.sort()
    number, number_y = "", None
    for y, t in lines:
        if SHEET_NO.match(t.upper()) and not t.isdigit():
            number, number_y = t.upper(), y          # keep the lowest one on the page
    # Title: a short line naming a plan/section/etc., nearest the sheet number.
    # Boilerplate (copyright, disclaimers) is long and ends in a period.
    cands = []
    for y, t in lines:
        if len(t) > 45 or t.endswith("."):
            continue
        for rank, (_, pat) in enumerate(KINDS):
            if re.search(pat, t.upper()):
                dist = abs(y - number_y) if number_y is not None else y
                cands.append((rank, dist, t))
                break
    title = min(cands)[2] if cands else ""
    # A PDF page label of the form "S-61003 - STEEL FRAMING DETAILS - ROOF"
    # (Bluebeam-combined sets) names the sheet better than title-block
    # heuristics, which can latch onto a note like "EL COLUMN, RE: PLAN".
    lab = page.get_label() or ""
    m = re.match(r"^\s*([A-Z]{1,3}-?\d{1,5}(?:\.\d{1,2})?)\s*[-:]\s*(.+)$", lab.upper())
    if m:
        number = number or m.group(1)
        title = m.group(2).strip()
    elif not number:
        m = re.match(r"^\s*([A-Z]{1,3}-?\d{1,3}(?:\.\d{1,2})?)", lab.upper())
        if m:
            number = m.group(1)
            title = title or lab.split("-", 1)[-1].strip()
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
        for l in b["lines"]:
            bbox = pymupdf.Rect(l["bbox"])
            if bbox.intersects(tb):
                continue
            text = "".join(s["text"] for s in l["spans"])
            dx, dy = l["dir"]
            angle = round(math.degrees(math.atan2(-dy, dx)))
            for fam, dims, raw in shapes.find_callouts(text):
                out.append({"raw": raw.strip(), "fam": fam, "dims": dims, "bbox": bbox,
                            "angle": angle, "line": text.strip()})
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
    doc.xref_set_key(x, "IT", "/PolyLineDimension")
    doc.xref_set_key(x, "Measure", f"{measure_xref} 0 R")
    doc.xref_set_key(x, "MeasurementTypes", "130")
    doc.xref_set_key(x, "DS", pdf_string("font: bold Helvetica 12pt; text-align:center; line-height:13.8pt; color:#800000"))
    doc.xref_set_key(x, "DepthUnit", f"[<< /Type /NumberFormat /U (') /C {TARGET_UNIT} /D 100 /FD true /SS () >>]")
    doc.xref_set_key(x, "BSIColumnData", column_data(columns, values))
    return nm


# ── main ───────────────────────────────────────────────────────────────────

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
    for pno, page in enumerate(doc):
        number, title, kind = sheet_info(page)
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
        if args.lengths and resolved:
            extra = None
            if args.raster != "off":
                import raster                            # OpenCV, only when needed
                if raster.has_raster_linework(page):
                    extra, _, _ = raster.raster_polylines(page, dpi=args.raster_dpi)
                    rec["raster"] = len(extra)
            # one pass per scaling window, like Bluebeam's per-plan viewports
            for rect, rppf in (regions or [(None, None)]):
                group = [h for h in resolved if rect is None or rect.contains(
                    pymupdf.Point((h["bbox"].x0 + h["bbox"].x1) / 2, (h["bbox"].y0 + h["bbox"].y1) / 2))]
                if not group:
                    continue
                lengths.measure(page, group, weights, rppf, extra_segments=extra)
                for h in group:
                    h["ppf"] = rppf
        xrefs = scale.install_viewports(page, regions) if (regions and args.lengths) else {}
        for h in found:
            row = {**rec, **h}
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
                notes = "AUTO LEN" + (f" CHECK: {len_note}" if len_note else "")
                lbft = weights.get(h["key"], 0)
                values = {**base, "Shape_Size": label, "Quantity": "1", "Notes": notes,
                          "Measured_Length": f"{ft:.2f}", "Weight_Per_Ft": f"{lbft:g}",
                          "Total_Length_Ft": f"{ft:.1f}", "Total_Weight_Lbs": f"{ft * lbft:.0f}"}
                row["nm"] = add_polyline(doc, page, h["seg"], subject, labeler.color(subject), ft,
                                         columns, values, measure_xref)
            else:
                draft = f"draft {ft:.1f} ft" if ft else ""
                why = "; ".join(n for n in (draft, len_note) if n)
                notes = "AUTO COUNT ONLY" + (f": {why}" if why else "")
                values = {**base, "Shape_Size": label, "Quantity": "1", "Notes": notes}
                row["nm"] = add_box(doc, page, h["bbox"], subject, labeler.color(subject), label,
                                    columns, values, dashed=h["conf"] < 1)
            hits.append(row)

    install_columns(doc, columns)
    try:
        doc.set_page_labels([{"startpage": i, "prefix": lab, "style": "", "firstpagenum": 1}
                             for i, lab in enumerate(labels)])
    except Exception as e:                       # labels are a convenience only
        print(f"page labels not set: {e}", file=sys.stderr)
    doc.save(out, garbage=3, deflate=True)

    write_report(out, src, pname, tname, sheets, hits, exceptions, weights)
    write_csv(out, hits + exceptions)
    return out, sheets, hits, exceptions


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
    checks = [h for h in hits if h.get("len_note") or h["conf"] < 1]
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
