"""Project scoping: what steel is on this drawing set, sheet by sheet, before
anyone does a takeoff.

    python sidecar/scope.py "bid.pdf" [-o report.md] [--all-sheets] [--ocr off]

Reads every sheet's text (text layer; OCR when a structural sheet's text
layer is too thin to be real, i.e. stroke-font exports), runs the scoping
vocabulary (scope_vocab.py) over it, and writes a Markdown report: a
one-screen summary of members, connections, finishes, misc metals,
exclusions and document status, then a per-sheet table and the matched
lines for anything the estimator wants to check.  Shape callouts are counted
per size with the same resolver the takeoff uses.
"""
import argparse
import collections
import datetime as dt
import re
import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
import scope_vocab                       # noqa: E402
import shapes                            # noqa: E402
from auto_takeoff import sheet_info      # noqa: E402

KIND_ORDER = ["member", "connect", "finish", "misc", "exclude", "status", "note"]
KIND_TITLE = {"member": "Steel members", "connect": "Connections & anchorage", "finish": "Finish & material",
              "misc": "Miscellaneous / ornamental", "exclude": "Not ours (existing, other trades)",
              "status": "Document status", "note": "Scope notes"}
THIN_TEXT = 60          # words: below this a structural sheet is probably stroke-font -> OCR


def page_lines(page, use_ocr, ocr_dpi):
    """(lines in reading order, source, callouts-or-None).  Text-layer pages
    give each line, then each multi-line block joined, so notes that wrap
    ("(6) 3/4\" DIA. x 4 1/2\"" over "ANCHORS") match as one phrase."""
    lines = [l.strip() for l in page.get_text().split("\n") if l.strip()]
    blocks = []
    for b in page.get_text("blocks"):
        if b[6] == 0 and "\n" in b[4].strip():       # multi-line text block
            blocks.append(" ".join(s.strip() for s in b[4].split("\n") if s.strip()))
    if not (use_ocr and len(" ".join(lines).split()) < THIN_TEXT):
        return lines, blocks, "text", None
    import ocr
    callouts, reads = ocr.ocr_callouts(page, dpi=ocr_dpi, return_reads=True)
    lines += [r["text"] for r in reads if r["conf"] >= 0.7]
    return lines, blocks, "text+ocr", callouts


def run(args):
    src = Path(args.pdf)
    out = Path(args.output) if args.output else src.with_name(src.stem + "_SCOPE.md")
    doc = pymupdf.open(src)
    sheets = []
    for pno, page in enumerate(doc):
        number, title, kind = sheet_info(page)
        discipline = re.match(r"[A-Z]*", number).group(0)[-1:]
        structural = discipline == "S" or not number
        if not (structural or args.all_sheets):
            continue
        lines, blocks, source, callouts = page_lines(page, args.ocr != "off" and structural, args.ocr_dpi)
        found = scope_vocab.scan(lines, extra=blocks)
        sizes = collections.Counter()
        if callouts is not None:                 # OCR pages: geometry-deduplicated callouts
            for h in callouts:
                key = shapes.resolve(h["fam"], h["dims"])[0]
                sizes[key or h["raw"]] += 1
        else:
            for l in lines:
                for fam, dims, raw in shapes.find_callouts(scope_vocab.clean(l)):
                    key = shapes.resolve(fam, dims)[0]
                    sizes[key or raw.strip()] += 1
        sheets.append({"page": pno + 1, "sheet": number or f"p{pno + 1}", "title": title, "kind": kind,
                       "source": source, "lines": len(lines), "found": found, "sizes": sizes})
    write_report(out, src, sheets)
    return out, sheets


def write_report(out, src, sheets):
    L = [f"# Scope: {src.name}", "", f"Run {dt.datetime.now():%Y-%m-%d %H:%M}. {len(sheets)} sheets scanned.", ""]
    # set-level rollup
    cats = collections.OrderedDict()
    for s in sheets:
        for cat, info in s["found"].items():
            c = cats.setdefault(cat, {"kind": info["kind"], "sheets": set(), "n": 0, "ex": []})
            c["sheets"].add(s["sheet"])
            c["n"] += len(info["hits"])
            for line, m in info["hits"]:
                if len(c["ex"]) < 3 and line not in c["ex"]:
                    c["ex"].append(line)
    L += ["## What is on this set", ""]
    for kind in KIND_ORDER:
        rows = [(cat, c) for cat, c in cats.items() if c["kind"] == kind]
        if not rows:
            continue
        L += [f"**{KIND_TITLE[kind]}**", ""]
        for cat, c in rows:
            ex = "; ".join(f"`{e[:60]}`" for e in c["ex"])
            L.append(f"- {cat} ({c['n']} mentions on {', '.join(sorted(c['sheets']))}): {ex}")
        L.append("")
    sizes = collections.Counter()
    for s in sheets:
        sizes.update(s["sizes"])
    if sizes:
        L += ["**Shape callouts across the set** (label count, not pieces)", "", "| Size | Callouts | lb/ft |", "|---|---|---|"]
        for k, n in sorted(sizes.items(), key=lambda kv: (-kv[1], kv[0])):
            w = shapes.weight(k)
            L.append(f"| {k} | {n} | {w if w is not None else 'not in table'} |")
        L.append("")
    missing = [k for k in KIND_ORDER if not any(c["kind"] == k for c in cats.values())]
    if missing:
        L += ["Nothing found for: " + ", ".join(KIND_TITLE[k] for k in missing), ""]
    L += ["## Sheets", "", "| Page | Sheet | Kind | Title | Read | Lines | Members | Connections | Finish | Misc | Excluded |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for s in sheets:
        by = collections.Counter(info["kind"] for info in s["found"].values())
        L.append(f"| {s['page']} | {s['sheet']} | {s['kind']} | {s['title'][:40]} | {s['source']} | {s['lines']} | "
                 f"{by.get('member', 0)} | {by.get('connect', 0)} | {by.get('finish', 0)} | {by.get('misc', 0)} | {by.get('exclude', 0)} |")
    L += ["", "## Matched lines (for checking the vocabulary)", ""]
    for s in sheets:
        if not s["found"]:
            continue
        L.append(f"### {s['sheet']} {s['title']}")
        for cat, info in s["found"].items():
            seen = []
            for line, m in info["hits"]:
                if line not in seen and len(seen) < 6:
                    seen.append(line)
            L.append(f"- **{cat}**: " + " | ".join(f"`{x[:70]}`" for x in seen))
        L.append("")
    out.write_text("\n".join(L) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("-o", "--output")
    ap.add_argument("--all-sheets", action="store_true", help="scan every sheet, not just structural")
    ap.add_argument("--ocr", choices=["auto", "off"], default="auto")
    ap.add_argument("--ocr-dpi", type=int, default=300)
    args = ap.parse_args()
    out, sheets = run(args)
    print(f"wrote {out}  ({len(sheets)} sheets)")


if __name__ == "__main__":
    main()
