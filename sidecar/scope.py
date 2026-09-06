"""Project scoping: what steel is on this drawing set, sheet by sheet, before
anyone does a takeoff.

    python sidecar/scope.py "bid.pdf" [-o scope.pdf] [--json summary.json]
                            [--all-sheets] [--ocr off] [--md report.md]

Reads every sheet's text (text layer; OCR when a structural sheet's text
layer is too thin to be real, i.e. stroke-font exports), runs the scoping
vocabulary (scope_vocab.py) over it and writes:

  - a Revu-readable copy of the set: a summary page inserted at the front and
    a box on every high-level scope item (stairs, rails, canopies, counter
    supports, finish notes, exclusions, document status ...) with the category
    as the annotation subject and the matched text in its comment.  Member
    callouts (W, HSS, C ...) are counted per size on the summary, not boxed;
  - a JSON summary the estimator app shows on the prospects card;
  - optionally the Markdown report.

Prints `PROGRESS i/n <sheet>` per sheet for the app's job runner.
"""
import argparse
import collections
import datetime as dt
import json
import re
import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
import scope_vocab                       # noqa: E402
import shapes                            # noqa: E402
from auto_takeoff import sheet_info      # noqa: E402

KIND_ORDER = ["misc", "material", "connect", "finish", "exclude", "status", "note", "member"]
KIND_TITLE = {"member": "Steel members", "connect": "Connections & anchorage", "finish": "Finish & coating",
              "material": "Material", "misc": "Miscellaneous / ornamental", "exclude": "Not ours (existing, other trades)",
              "status": "Document status", "note": "Scope notes"}
BOXED_KINDS = ("misc", "material", "finish", "exclude", "status", "note", "connect")
KIND_COLOR = {"misc": (0.85, 0.2, 0.55), "material": (0.55, 0.3, 0.85), "finish": (0.1, 0.55, 0.75),
              "connect": (0.95, 0.55, 0.1), "exclude": (0.5, 0.5, 0.5), "status": (0.8, 0.1, 0.1), "note": (0.2, 0.6, 0.3)}
THIN_TEXT = 60          # words: below this a structural sheet is probably stroke-font -> OCR


def page_lines(page, use_ocr, ocr_dpi, label=""):
    """([{text, bbox}] in reading order, [block strings], source, callouts-or-None).
    OCR (slow: minutes per sheet) only when use_ocr and the text layer is too
    thin to be real; the caller restricts that to structural plans."""
    lines, blocks = [], []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        btxt = []
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"]).strip()
            if t:
                lines.append({"text": t, "bbox": pymupdf.Rect(l["bbox"])})
                btxt.append(t)
        if len(btxt) > 1:
            blocks.append(" ".join(btxt))
    if not (use_ocr and len(" ".join(l["text"] for l in lines).split()) < THIN_TEXT):
        return lines, blocks, "text", None
    print(f"PROGRESS {label} (reading with OCR, a few minutes)", flush=True)
    import ocr
    callouts, reads = ocr.ocr_callouts(page, dpi=ocr_dpi, return_reads=True)
    lines += [{"text": r["text"], "bbox": r["bbox"]} for r in reads if r["conf"] >= 0.7]
    return lines, blocks, "text+ocr", callouts


# ── stairs: riser / tread counts ──────────────────────────────────────
# "11 EQ RISERS", "13 TREADS AT 11\"", "14 RISERS @ 7\"" on stair plans,
# sections and elevations (Todd, 2026-09-06: the count is what scoping
# needs).  Seat risers, drain risers, "per riser", "one tread" are not counts.
STAIR_RE = re.compile(r"(?<![\d/.-])(\d{1,2})\s*(?:EQ(?:UAL)?\.?\s*)?(RISERS?|TREADS?|RSRS?\.?)\b(?:\s*(?:@|AT|=)\s*(\d[\d\s/\-]*(?:\"|”|″)?))?", re.I)
STAIR_SKIP = re.compile(r"SEAT\s+RISER|DRAIN\s+RISER|PER\s+RISER|ONE\s+TREAD|RISER\s+HEIGHT|TREAD\s+WIDTH|MIN\.?\s+TREAD|PLF|PSF", re.I)


def stair_counts(page):
    """[{n, what: 'risers'|'treads', size, text, bbox}] from every text block
    on the page; one entry per count in a block (a section's dimension string
    lists every flight: "9 EQ RISERS 5'-2\" 11 EQ RISERS ...")."""
    out, seen = [], set()
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        text = " ".join("".join(sp["text"] for sp in l["spans"]).strip() for l in b["lines"])
        if not re.search(r"RISER|TREAD|RSR", text, re.I):
            continue
        for m in STAIR_RE.finditer(text):
            n = int(m.group(1))
            ctx = text[max(0, m.start() - 12):m.end() + 12]
            if not 2 <= n <= 40 or STAIR_SKIP.search(ctx):
                continue
            what = "risers" if m.group(2).upper().startswith("R") else "treads"
            key = (n, what, m.start(), tuple(round(v) for v in b["bbox"]))
            if key in seen:
                continue
            seen.add(key)
            out.append({"n": n, "what": what, "size": (m.group(3) or "").strip(), "text": m.group(0).strip(),
                        "bbox": pymupdf.Rect(b["bbox"])})
    return out


def title_block_facts(page):
    """Big text in the title-block strip: project name, owner, address lines.
    Display only (the app never autofills a project from it)."""
    r = page.rect
    clip = pymupdf.Rect(r.x0 + r.width * 0.8, r.y0, r.x1, r.y1)
    facts = []
    for b in page.get_text("dict", clip=clip)["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"]).strip()
            size = max(s["size"] for s in l["spans"])
            if len(t) >= 4 and size >= 10 and not re.fullmatch(r"[A-Z]{1,3}-?\d[\d.]*[A-Z]?", t.upper()) \
                    and not re.search(r"SHEET|SCALE|DATE|DRAWN|CHECK|PROJECT NO|REVISION|©|COPYRIGHT", t.upper()):
                facts.append((size, t))
    facts.sort(key=lambda f: -f[0])
    seen, out = set(), []
    for _, t in facts:
        if t.upper() not in seen:
            seen.add(t.upper())
            out.append(t)
    return out[:8]


def run(args):
    src = Path(args.pdf)
    out = Path(args.output) if args.output else src.with_name(src.stem + "_SCOPE.pdf")
    doc = pymupdf.open(src)
    sheets, boxes, facts = [], 0, []
    n = doc.page_count
    wanted = {d.strip().upper() for d in args.disciplines.split(",") if d.strip()}
    for pno, page in enumerate(doc):
        number, title, kind = sheet_info(page)
        print(f"PROGRESS {pno + 1}/{n} {number or 'unnumbered'}", flush=True)
        discipline = re.match(r"[A-Z]*", number).group(0)[-1:]
        structural = discipline == "S"
        # Default: architectural + structural only (M/E/P/C/L are never steel
        # scope); unnumbered pages are read from their text layer but never
        # OCR'd; OCR is reserved for structural plans with no readable callouts.
        if not (args.all_sheets or discipline in wanted or not number):
            continue
        use_ocr = args.ocr != "off" and structural and kind == "plan"
        lines, blocks, source, callouts = page_lines(page, use_ocr, args.ocr_dpi, f"{pno + 1}/{n} {number}")
        found = scope_vocab.scan([l["text"] for l in lines], extra=blocks)
        if structural and not facts and kind == "plan":
            facts = title_block_facts(page)
        sizes = collections.Counter()
        if callouts is not None:
            for h in callouts:
                key = shapes.resolve(h["fam"], h["dims"])[0]
                sizes[key or h["raw"]] += 1
        else:
            for l in lines:
                for fam, dims, raw in shapes.find_callouts(scope_vocab.clean(l["text"])):
                    key = shapes.resolve(fam, dims)[0]
                    sizes[key or raw.strip()] += 1
        # boxes on the high-level items
        by_text = {}
        for l in lines:
            by_text.setdefault(l["text"], l["bbox"])
        for cat, info in found.items():
            if info["kind"] not in BOXED_KINDS:
                continue
            done = set()
            for text, match in info["hits"]:
                bb = by_text.get(text)
                if bb is None or (cat, tuple(round(v) for v in bb)) in done:
                    continue
                done.add((cat, tuple(round(v) for v in bb)))
                annot = page.add_rect_annot(bb + (-4, -4, 4, 4))
                annot.set_border(width=1.5)
                annot.set_colors(stroke=KIND_COLOR.get(info["kind"], (1, 0, 0)), fill=None)
                annot.set_info(title="Auto Scope", subject=f"Scope: {cat}", content=match)
                annot.update()
                boxes += 1
        # stairs: riser / tread counts, boxed and tallied per sheet
        stairs = stair_counts(page) if re.search(r"STAIR|RISER|TREAD", " ".join(l["text"] for l in lines), re.I) else []
        boxed = set()
        for st in stairs:
            key = tuple(round(v) for v in st["bbox"])
            if key in boxed:
                continue
            boxed.add(key)
            annot = page.add_rect_annot(st["bbox"] + (-4, -4, 4, 4))
            annot.set_border(width=1.5)
            annot.set_colors(stroke=KIND_COLOR["misc"], fill=None)
            counts = ", ".join(f"{x['n']} {x['what']}" for x in stairs if tuple(round(v) for v in x["bbox"]) == key)
            annot.set_info(title="Auto Scope", subject="Scope: Stairs / ladders", content=f"Stairs: {counts}")
            annot.update()
            boxes += 1
        sheets.append({"page": pno + 1, "sheet": number or f"p{pno + 1}", "title": title, "kind": kind,
                       "discipline": discipline, "source": source, "lines": len(lines), "found": found, "sizes": sizes,
                       "stairs": stairs})
    summary = build_summary(src, doc.page_count, sheets, facts, boxes)
    summary["scanned"] = "entire set" if args.all_sheets else f"disciplines {args.disciplines}"
    insert_summary_page(doc, summary)
    doc.save(out, garbage=3, deflate=True)
    if args.json:
        Path(args.json).write_text(json.dumps(summary, indent=1), encoding="utf-8")
    if args.md:
        Path(args.md).write_text(markdown(summary), encoding="utf-8")
    return out, summary


def build_summary(src, pages, sheets, facts, boxes):
    cats = collections.OrderedDict()
    for s in sheets:
        for cat, info in s["found"].items():
            c = cats.setdefault(cat, {"kind": info["kind"], "sheets": [], "mentions": 0, "examples": []})
            if s["sheet"] not in c["sheets"]:
                c["sheets"].append(s["sheet"])
            c["mentions"] += len(info["hits"])
            for line, m in info["hits"]:
                if len(c["examples"]) < 3 and line not in c["examples"]:
                    c["examples"].append(line[:80])
    sizes = collections.Counter()
    for s in sheets:
        sizes.update(s["sizes"])
    size_rows = []
    for k, cnt in sorted(sizes.items(), key=lambda kv: (-kv[1], kv[0])):
        size_rows.append({"size": k, "callouts": cnt, "lbft": shapes.weight(k)})
    plans = [s["sheet"] for s in sheets if s["kind"] == "plan" and s.get("discipline") == "S"]
    doc_status = [e for c, v in cats.items() if v["kind"] == "status" for e in v["examples"]]
    stair_sheets = []
    for s in sheets:
        if not s.get("stairs"):
            continue
        stair_sheets.append({"sheet": s["sheet"], "kind": s["kind"], "title": s["title"][:40],
                             "risers": [x["n"] for x in s["stairs"] if x["what"] == "risers"],
                             "treads": [x["n"] for x in s["stairs"] if x["what"] == "treads"],
                             "sizes": sorted({x["size"] for x in s["stairs"] if x["size"]})})
    stairs = {"sheets": stair_sheets,
              "risers": sum(sum(x["risers"]) for x in stair_sheets),
              "treads": sum(sum(x["treads"]) for x in stair_sheets),
              "flights": sum(max(len(x["risers"]), len(x["treads"])) for x in stair_sheets)}
    return {
        "stairs": stairs,
        "file": src.name, "pages": pages, "run": dt.datetime.now().isoformat(timespec="minutes"),
        "structural_sheets": len(sheets), "plans": plans, "boxes": boxes,
        "title_block": {"lines": facts},
        "document_status": doc_status[:4],
        "categories": {cat: v for cat, v in cats.items()},
        "kinds_present": [k for k in KIND_ORDER if any(v["kind"] == k for v in cats.values())],
        "sizes": size_rows,
        "sheets": [{"page": s["page"], "sheet": s["sheet"], "kind": s["kind"], "discipline": s.get("discipline", ""), "title": s["title"], "read": s["source"],
                    "lines": s["lines"], "hits": {k: len(v["hits"]) for k, v in s["found"].items()}} for s in sheets],
    }


def summary_lines(summary):
    L = [f"SCOPE SUMMARY  {summary['file']}", f"{summary['pages']} pages, {summary['structural_sheets']} sheets scanned "
         f"({summary.get('scanned', 'architectural + structural')}), structural plans: {', '.join(summary['plans'][:12]) or 'none'}", ""]
    if summary["title_block"]["lines"]:
        L += ["Title block: " + " | ".join(summary["title_block"]["lines"][:5]), ""]
    if summary["document_status"]:
        L += ["Document status: " + "; ".join(summary["document_status"]), ""]
    st = summary.get("stairs") or {}
    if st.get("sheets"):
        L += [f"Stairs as noted: {st['risers']} risers / {st['treads']} treads in {st['flights']} flights "
              f"(counts repeat where a stair shows on more than one sheet):"]
        for x in st["sheets"][:12]:
            parts = []
            if x["risers"]:
                parts.append("risers " + "+".join(str(n) for n in x["risers"]))
            if x["treads"]:
                parts.append("treads " + "+".join(str(n) for n in x["treads"]))
            L.append(f"  {x['sheet']} ({x['kind']}): " + "; ".join(parts) + (f" @ {', '.join(x['sizes'])}" if x["sizes"] else ""))
        L.append("")
    for kind in KIND_ORDER:
        rows = [(cat, v) for cat, v in summary["categories"].items() if v["kind"] == kind]
        if not rows:
            continue
        L.append(KIND_TITLE[kind].upper())
        for cat, v in rows:
            L.append(f"  {cat}: {v['mentions']} on {', '.join(v['sheets'][:6])}  e.g. {'; '.join(v['examples'][:2])}")
        L.append("")
    if summary["sizes"]:
        L.append("SHAPE CALLOUTS (label count, not pieces)")
        for r in summary["sizes"][:25]:
            L.append(f"  {r['size']:16} {r['callouts']:4d}   {r['lbft'] if r['lbft'] is not None else 'not in table'} lb/ft")
    return L


def insert_summary_page(doc, summary):
    page = doc.new_page(pno=0, width=612, height=792)
    y = 40
    for i, line in enumerate(summary_lines(summary)):
        size = 13 if i == 0 else (9 if line.startswith("  ") else 10)
        if y > 760:
            page = doc.new_page(pno=doc.page_count, width=612, height=792)
            y = 40
        page.insert_text((36, y), line[:118], fontsize=size, fontname="helv")
        y += size + 4
    page.set_rotation(0)


def markdown(summary):
    return "\n".join(["# " + l if i == 0 else l for i, l in enumerate(summary_lines(summary))]) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("-o", "--output", help="Revu-readable scope PDF (default: <name>_SCOPE.pdf)")
    ap.add_argument("--json", help="write the summary JSON here")
    ap.add_argument("--md", help="also write a Markdown report here")
    ap.add_argument("--all-sheets", action="store_true", help="scan every sheet of every discipline")
    ap.add_argument("--disciplines", default="S,A", help="discipline letters to scan (default S,A)")
    ap.add_argument("--ocr", choices=["auto", "off"], default="auto")
    ap.add_argument("--ocr-dpi", type=int, default=300)
    args = ap.parse_args()
    out, summary = run(args)
    print(f"wrote {out}  ({summary['structural_sheets']} sheets, {summary['boxes']} boxes)")


if __name__ == "__main__":
    main()
