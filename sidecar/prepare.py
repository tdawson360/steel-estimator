"""Prepare a bid set before any auto markup (Todd, 2026-09-08).

1. Flatten: contract sets often arrive carrying other authors' comments,
   which Revu shows as live markups next to ours.  Every existing
   annotation is baked into the page content, with no recovery.
2. Page labels: Revu's Markups List shows the page LABEL, and an unlabelled
   set shows the sheet's position in the set instead of its number.  Each
   page whose label carries no sheet number gets "S-20900 - STRUCTURAL ROOF
   FRAMING PLAN" style labels from its title block (`sheet_info`).

prepare(doc) does both in memory and returns a summary; the CLI rewrites a
file in place (or to -o).  Corrected takeoffs uploaded for the improvement
loop are never prepared: their markups are the data.
"""
import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent))

LABEL_NO_RE = re.compile(r"^\s*(?:\[\d+\]\s*)?[A-Z]{1,3}-?\d{1,5}(?:\.\d{1,2})?[A-Z]?\b", re.I)


def flatten(doc):
    """Bake every annotation (and form widget) into the page content. Returns the count."""
    n = sum(1 for page in doc for _ in page.annots()) + sum(1 for page in doc for _ in page.widgets())
    if n:
        doc.bake(annots=True, widgets=True)
    return n


def label_pages(doc):
    """Set page labels from the title blocks where the existing label names
    no sheet.  Returns (pages relabelled, [(page, label)])."""
    from auto_takeoff import sheet_info          # lazy: auto_takeoff imports this module
    existing = [(p.get_label() or "").strip() for p in doc]
    if all(LABEL_NO_RE.match(l) for l in existing if l) and all(existing):
        return 0, []
    entries, done = [], []
    for i, page in enumerate(doc):
        if existing[i] and LABEL_NO_RE.match(existing[i]):
            entries.append({"startpage": i, "prefix": existing[i], "style": "", "firstpagenum": 1})
            continue
        # the number comes from the title block; a text-only label ("PECIAL
        # INSPECTIONS": an export that drops the first letter) is the title,
        # repaired against the page's own text when it is a truncation
        number, title, _kind = sheet_info(page, use_label=False)
        if existing[i]:
            title = repair_truncation(page, existing[i])
        if number:
            label = f"{number} - {title}" if title else number
            entries.append({"startpage": i, "prefix": label[:80], "style": "", "firstpagenum": 1})
            done.append((i + 1, label[:80]))
        elif existing[i]:
            entries.append({"startpage": i, "prefix": existing[i], "style": "", "firstpagenum": 1})
        else:
            entries.append({"startpage": i, "prefix": "", "style": "D", "firstpagenum": i + 1})
    if done:
        doc.set_page_labels(entries)
    return len(done), done


def repair_truncation(page, label):
    """"PECIAL INSPECTIONS" -> "SPECIAL INSPECTIONS" when a line of the page
    ends with the label and is at most two characters longer."""
    up = label.upper()
    best = None
    for line in page.get_text("text").splitlines():
        t = line.strip()
        if 0 < len(t) - len(label) <= 2 and t.upper().endswith(up):
            if best is None or len(t) < len(best):
                best = t
    return best or label


def prepare(doc):
    """Flatten, then label. Returns {"flattened": n, "labelled": n, "labels": [...]}."""
    n_flat = flatten(doc)
    n_lab, labels = label_pages(doc)
    return {"flattened": n_flat, "labelled": n_lab, "labels": labels}


def write_back(doc, target):
    """Save doc over target: written beside it first, then swapped in. The
    caller must not hold target open (open it from a byte stream)."""
    target = str(target)
    fd, tmp = tempfile.mkstemp(suffix=".pdf", dir=os.path.dirname(os.path.abspath(target)))
    os.close(fd)
    try:
        doc.save(tmp, garbage=3, deflate=True)
        os.replace(tmp, target)
    except OSError:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def prepare_file(src, out=None):
    """Prepare a PDF on disk; in place when out is None. Returns the summary."""
    doc = pymupdf.open(stream=Path(src).read_bytes(), filetype="pdf")
    info = prepare(doc)
    if not (info["flattened"] or info["labelled"]):
        doc.close()
        info["written"] = False
        return info
    write_back(doc, out or src)
    doc.close()
    info["written"] = True
    return info


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("-o", "--output", help="write here instead of rewriting the input in place")
    ap.add_argument("--json", help="write the summary JSON here")
    args = ap.parse_args()
    info = prepare_file(args.pdf, args.output)
    print(f"flattened {info['flattened']} markup(s); labelled {info['labelled']} page(s)"
          + ("" if info["written"] else " (nothing to do)"))
    if args.json:
        Path(args.json).write_text(json.dumps(info, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
