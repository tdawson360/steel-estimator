"""The Markups List of a takeoff PDF as the app's import CSV.

    python sidecar/markups_csv.py <takeoff.pdf> [-o rows.csv]

Revu's Markups List export is what the estimator normally feeds to Import
CSV.  This writes the same thing straight from the file: every annotation
that carries Bluebeam column data (/BSIColumnData, in the order of the
catalog's /BSIAnnotColumns) becomes one row under the profile's column
names, plus the standard columns the importer also reads:

    Subject, Page Label, Page Index, Comments (the markup's text, which is
    the drawn dimension on a length), Author

so the auto takeoff (takeoff.pdf) or the estimator's corrected copy
(corrected.pdf) can go into an estimate without a trip through Revu's
export dialog (Todd, 2026-09-17: "pivot right into the dashboard").

Rows with neither an Item_Number nor a Shape_Size are skipped: scope
rectangles and notes are not material.
"""
import argparse
import csv
import io
import re
import sys
from pathlib import Path

import pymupdf

STANDARD = ["Subject", "Page Label", "Page Index", "Comments", "Author"]
CELL = re.compile(r"\(((?:[^()\\]|\\.)*)\)")


def _unescape(s):
    return (s.replace("\\(", "(").replace("\\)", ")").replace("\\\\", "\\")
            .replace("\\r", "").replace("\\n", " "))


def column_names(doc):
    """Custom column names in /BSIColumnData order (the array order of the
    catalog's /BSIAnnotColumns; DisplayOrder is only how Revu shows them)."""
    ref = doc.xref_get_key(doc.pdf_catalog(), "BSIAnnotColumns")
    if ref[0] == "xref":
        obj = doc.xref_object(int(ref[1].split()[0]))
    elif ref[0] == "array":
        obj = ref[1]
    else:
        return []
    return [_unescape(n) for n in re.findall(r"/Name\s*\(((?:\\.|[^)\\])*)\)", obj)]


def rows(doc, cols):
    out = []
    for pno, page in enumerate(doc):
        try:
            label = (page.get_label() or "").strip()
        except Exception:
            label = ""
        for a in page.annots():
            raw = doc.xref_get_key(a.xref, "BSIColumnData")[1] or ""
            if not raw:
                continue
            data = [_unescape(d).strip() for d in CELL.findall(raw)]
            rec = {c: (data[i] if i < len(data) else "") for i, c in enumerate(cols)}
            if not (rec.get("Item_Number") or rec.get("Shape_Size")):
                continue
            info = a.info or {}
            rec["Subject"] = info.get("subject", "") or ""
            rec["Page Label"] = label or str(pno + 1)
            rec["Page Index"] = str(pno + 1)
            rec["Comments"] = re.sub(r"\s+", " ", info.get("content", "") or "").strip()
            rec["Author"] = info.get("title", "") or ""
            out.append(rec)
    return out


def to_csv(doc):
    cols = column_names(doc)
    header = list(cols) + STANDARD
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    n = 0
    for rec in rows(doc, cols):
        w.writerow([rec.get(c, "") for c in header])
        n += 1
    return buf.getvalue(), n, cols


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("-o", "--output", help="CSV path (default: stdout)")
    args = ap.parse_args()
    doc = pymupdf.open(args.pdf)
    text, n, cols = to_csv(doc)
    if not cols:
        print("no Bluebeam custom columns in this file", file=sys.stderr)
        sys.exit(2)
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8-sig")
        print(f"{n} rows -> {args.output}", file=sys.stderr)
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
