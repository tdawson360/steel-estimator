"""Auto-takeoff step 1: count AISC member callouts on structural framing plans
and write them back as Revu-readable annotations.

    python sidecar/auto_takeoff.py "bid.pdf" [-o out.pdf] [--sheets S2.11,S2.12]
                                   [--item 1] [--desc "STRUCTURAL FRAMING"]

For every framing-plan sheet the script finds each shape designation in the
PDF's text layer (any rotation), validates it against the estimator's own AISC
table, and draws a rectangle annotation over the callout.  Each rectangle
carries the v1.7 profile's custom columns (Shape_Size, Drawing_Ref, Notes, ...)
so Revu's Markups List shows them immediately and the normal CSV export feeds
the estimator's importer.  Unresolved callouts get a red "Auto Exception"
rectangle whose Notes say why.  Lengths are NOT measured yet (step 4).

Outputs, next to the annotated PDF: a Markdown report and a CSV of every hit.
"""
import argparse
import csv
import datetime as dt
import math
import re
import sys
import uuid
from collections import Counter, defaultdict
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
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
    if not number:
        lab = page.get_label() or ""
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
    dicts with raw, fam, dims, bbox, angle."""
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


def add_box(doc, page, rect, subject, color, content, columns, values, dashed=False):
    r = pymupdf.Rect(rect) + (-6, -6, 6, 6)
    annot = page.add_rect_annot(r)
    annot.set_border(width=2, dashes=[6, 3] if dashed else None)
    annot.set_colors(stroke=color, fill=None)
    annot.set_info(title=AUTHOR, subject=subject, content=content)
    annot.update()
    nm = "AUTO-" + uuid.uuid4().hex[:12].upper()
    doc.xref_set_key(annot.xref, "NM", pdf_string(nm))
    doc.xref_set_key(annot.xref, "BSIColumnData", column_data(columns, values))
    return nm


# ── main ───────────────────────────────────────────────────────────────────

def run(args):
    profile = Path(args.profile) if args.profile else latest("Steel_Estimator_Takeoff_v*.bpx")
    toolkit = Path(args.toolkit) if args.toolkit else latest("BIW_Steel_Tool_Kit_v*.btx")
    pname, columns = load_profile(profile)
    tname, tools = load_toolkit(toolkit)
    labeler = Labeler(columns, tools)
    shapes.load_db()

    src = Path(args.pdf)
    out = Path(args.output) if args.output else src.with_name(src.stem + "_AUTO.pdf")
    doc = pymupdf.open(src)
    wanted = {s.strip().upper() for s in args.sheets.split(",")} if args.sheets else None

    sheets, hits, exceptions, labels = [], [], [], []
    for pno, page in enumerate(doc):
        number, title, kind = sheet_info(page)
        chars = len(page.get_text().strip())
        labels.append(number or page.get_label() or str(pno + 1))
        discipline = re.match(r"[A-Z]*", number).group(0)[-1:]      # "LRS2.11" -> "S"
        structural = discipline == "S"
        annotate = (number in wanted) if wanted else (structural and kind == "plan")
        scan = annotate or structural
        found = page_callouts(page) if (scan and chars) else []
        rec = {"page": pno + 1, "sheet": number or "?", "title": title, "kind": kind,
               "chars": chars, "hits": len(found), "annotated": annotate}
        sheets.append(rec)
        if not annotate:
            continue
        for h in found:
            key, conf, note = shapes.resolve(h["fam"], h["dims"])
            row = {**rec, **h, "key": key, "conf": conf, "note": note}
            if key:
                label, subject = labeler.label(key, h["fam"], h["dims"])
                row["label"], row["subject"] = label, subject
                notes = f"AUTO {conf:.2f}" + (f" CHECK: {note}" if note else "")
                values = {"Item_Number": args.item, "Item_Description": args.desc,
                          "Shape_Size": label, "Quantity": "1", "Drawing_Ref": number,
                          "Notes": notes}
                row["nm"] = add_box(doc, page, h["bbox"], subject, labeler.color(subject),
                                    label, columns, values, dashed=conf < 1)
                hits.append(row)
            else:
                row["label"], row["subject"] = h["raw"], EXCEPTION_SUBJECT
                values = {"Item_Number": args.item, "Item_Description": args.desc,
                          "Shape_Size": h["raw"], "Drawing_Ref": number,
                          "Notes": f"AUTO EXCEPTION: {note}"}
                row["nm"] = add_box(doc, page, h["bbox"], EXCEPTION_SUBJECT, (1, 0, 0),
                                    h["raw"], columns, values, dashed=True)
                exceptions.append(row)

    install_columns(doc, columns)
    try:
        doc.set_page_labels([{"startpage": i, "prefix": lab, "style": "", "firstpagenum": 1}
                             for i, lab in enumerate(labels)])
    except Exception as e:                       # labels are a convenience only
        print(f"page labels not set: {e}", file=sys.stderr)
    doc.save(out, garbage=3, deflate=True)

    write_report(out, src, pname, tname, sheets, hits, exceptions)
    write_csv(out, hits + exceptions)
    return out, sheets, hits, exceptions


def write_report(out, src, pname, tname, sheets, hits, exceptions):
    lines = [f"# Auto takeoff: {src.name}", "",
             f"Run {dt.datetime.now():%Y-%m-%d %H:%M}. Profile {pname}. Tools {tname}. Output `{out.name}`.", "",
             "## Sheets", "", "| Page | Sheet | Kind | Title | Text | Callouts | Annotated |", "|---|---|---|---|---|---|---|"]
    for s in sheets:
        if s["sheet"] == "?" and not s["annotated"] and not s["hits"]:
            continue
        lines.append(f"| {s['page']} | {s['sheet']} | {s['kind']} | {s['title']} | "
                     f"{'yes' if s['chars'] else 'NO TEXT'} | {s['hits']} | {'yes' if s['annotated'] else ''} |")
    notext = [s for s in sheets if not s["chars"]]
    if notext:
        lines += ["", f"Pages with no text layer (need OCR): {', '.join(str(s['page']) for s in notext)}"]
    lines += ["", "## Counts (annotated sheets)", "", "| Sheet | Shape | Count | lb/ft |", "|---|---|---|---|"]
    counts = Counter((h["sheet"], h["label"], h["key"]) for h in hits)
    for (sheet, label, key), n in sorted(counts.items()):
        lines.append(f"| {sheet} | {label} | {n} | {shapes.weight(key) or ''} |")
    lines += ["", f"Total members counted: {len(hits)}"]
    checks = [h for h in hits if h["conf"] < 1]
    if checks:
        lines += ["", "## Needs a look (fuzzy matches, dashed boxes)", ""]
        lines += [f"- p{h['page']} {h['sheet']}: `{h['raw']}` read as **{h['label']}** ({h['note']})" for h in checks]
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
    cols = ["page", "sheet", "subject", "label", "key", "conf", "note", "raw", "line", "angle",
            "x0", "y0", "x1", "y1", "nm"]
    with open(out.with_suffix(".hits.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            b = r["bbox"]
            w.writerow([r["page"], r["sheet"], r["subject"], r["label"], r["key"] or "", r["conf"],
                        r["note"], r["raw"], r["line"], r["angle"],
                        round(b.x0, 1), round(b.y0, 1), round(b.x1, 1), round(b.y1, 1), r["nm"]])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("-o", "--output")
    ap.add_argument("--sheets", help="comma-separated sheet numbers to annotate (default: structural plans)")
    ap.add_argument("--item", default="1", help="Item_Number for every auto row")
    ap.add_argument("--desc", default="STRUCTURAL FRAMING", help="Item_Description for every auto row")
    ap.add_argument("--profile", help=".bpx to take the column contract from (default: newest in repo)")
    ap.add_argument("--toolkit", help=".btx to take subjects/colours from (default: newest in repo)")
    args = ap.parse_args()
    out, sheets, hits, exceptions = run(args)
    print(f"wrote {out}")
    print(f"annotated sheets: {', '.join(s['sheet'] for s in sheets if s['annotated']) or 'none'}")
    by = Counter(h["label"] for h in hits)
    for label, n in by.most_common():
        print(f"  {n:4d}  {label}")
    print(f"members: {len(hits)}   exceptions: {len(exceptions)}   report: {out.with_suffix('.report.md').name}")


if __name__ == "__main__":
    main()
