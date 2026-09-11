"""Compare an auto takeoff with the estimator's corrected copy of it.

    python sidecar/compare.py <auto.pdf> <corrected.pdf> [--json out.json] [-o report.md]

Every auto markup carries a persistent /NM name ("AUTO-...") that survives
editing in Revu, so the diff is exact, not by proximity:

    kept     the markup is still there with the same size and length
    edited   same name, but the size, the length (> 1"), the quantity or the
             position changed
    deleted  the name is gone
    added    a markup in the corrected file the tool never wrote

The JSON summary feeds the Drawings page; the pair goes to the training
folder so the next rule is built from what the estimator actually changed.
"""
import argparse
import collections
import json
import math
import re
from pathlib import Path

import pymupdf

import shapes

AUTO = "AUTO-"


def columns_of(doc):
    """Column names from the file's /BSIAnnotColumns, in Index order."""
    cat = doc.pdf_catalog()
    ref = doc.xref_get_key(cat, "BSIAnnotColumns")
    names = []
    if ref[0] in ("xref", "array"):
        arr = doc.xref_object(int(ref[1].split()[0])) if ref[0] == "xref" else ref[1]
        for x in re.findall(r"(\d+) 0 R", arr):
            try:
                names.append((doc.xref_get_key(int(x), "Name")[1].strip("()"), int(doc.xref_get_key(int(x), "Index")[1] or len(names))))
            except Exception:
                pass
    names.sort(key=lambda t: t[1])
    return [n for n, _ in names]


def annots(doc, cols):
    """{nm: record} per page for every annotation with column data."""
    out = {}
    size_i = cols.index("Shape_Size") if "Shape_Size" in cols else 4
    qty_i = cols.index("Quantity") if "Quantity" in cols else 5
    len_i = cols.index("Length_Ft") if "Length_Ft" in cols else 6
    item_i = cols.index("Item_Number") if "Item_Number" in cols else 0
    for pno, page in enumerate(doc):
        for a in page.annots():
            nm = doc.xref_get_key(a.xref, "NM")[1].strip("()")
            data = re.findall(r"\(((?:[^()\\]|\\.)*)\)", doc.xref_get_key(a.xref, "BSIColumnData")[1] or "")
            data = [d.replace("\\(", "(").replace("\\)", ")") for d in data]
            v = a.vertices or []
            length = sum(math.hypot(v[i + 1][0] - v[i][0], v[i + 1][1] - v[i][1]) for i in range(len(v) - 1)) if v else 0.0
            r = a.rect
            rec = {"page": pno + 1, "type": a.type[1], "subject": a.info.get("subject", ""),
                   "size": data[size_i] if len(data) > size_i else "", "qty": data[qty_i] if len(data) > qty_i else "",
                   "item": data[item_i] if len(data) > item_i else "",
                   "len_pt": length, "len_ft": _num(data[len_i]) if len(data) > len_i else None,
                   "centre": ((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), "auto": nm.startswith(AUTO),
                   "ends": ((v[0][0], v[0][1]), (v[-1][0], v[-1][1])) if len(v) >= 2 else None}
            out[nm or f"?{pno}:{a.xref}"] = rec
    return out


def _num(s):
    """A number from a Revu column, or None.  Never NaN: Python's json
    writes NaN, which is not JSON and broke the app's parse of the summary
    (OXY corrections, 2026-09-11)."""
    t = str(s or "").strip()
    if not t:
        return None
    try:
        v = float(t)
    except ValueError:
        return None
    return None if v != v else v


def norm_size(s):
    return shapes.norm(s or "")


def compare(auto_pdf, corrected_pdf):
    a_doc, c_doc = pymupdf.open(auto_pdf), pymupdf.open(corrected_pdf)
    a_cols, c_cols = columns_of(a_doc), columns_of(c_doc)
    A, C = annots(a_doc, a_cols), annots(c_doc, c_cols or a_cols)
    ppf_by_page = {}
    for pno, page in enumerate(c_doc):
        try:
            import lengths
            regs = lengths.scale_regions(page)
            ppf_by_page[pno + 1] = regs[0][1] if regs else None
        except Exception:
            ppf_by_page[pno + 1] = None
    rows = []
    for nm, a in A.items():
        if not a["auto"]:
            continue
        c = C.get(nm)
        if c is None:
            rows.append({**a, "nm": nm, "verdict": "deleted"})
            continue
        why = []
        if norm_size(a["size"]) != norm_size(c["size"]):
            why.append(f"size {a['size']} -> {c['size']}")
        ppf = ppf_by_page.get(a["page"]) or 9.0
        if a["len_pt"] and c["len_pt"] and abs(a["len_pt"] - c["len_pt"]) / ppf > 1 / 12:
            why.append(f"length {a['len_pt'] / ppf:.2f} -> {c['len_pt'] / ppf:.2f} ft")
        if (a["qty"] or "1") != (c["qty"] or "1"):
            why.append(f"qty {a['qty']} -> {c['qty']}")
        if math.hypot(a["centre"][0] - c["centre"][0], a["centre"][1] - c["centre"][1]) > 6:
            why.append("moved")
        rows.append({**a, "nm": nm, "verdict": "edited" if why else "kept", "why": "; ".join(why),
                     "new_size": c["size"], "new_len_ft": c["len_pt"] / ppf if c["len_pt"] else None})
    for nm, c in C.items():
        if nm not in A and c["type"] in ("PolyLine", "Square", "Circle", "Polygon", "Line") and c["size"]:
            rows.append({**c, "nm": nm, "verdict": "added"})
    pair_replaced(rows, ppf_by_page)
    return rows, ppf_by_page


REPLACE_LATERAL_FT = 2.0     # the estimator's copy lies along the tool's line within this
REPLACE_ANGLE_DEG = 12.0


def _along_lateral(ends, pt):
    """(along, lateral) of pt against the line through ends, in points; along
    is measured from the first end."""
    (ax, ay), (bx, by) = ends
    ux, uy = bx - ax, by - ay
    L = math.hypot(ux, uy) or 1.0
    ux, uy = ux / L, uy / L
    dx, dy = pt[0] - ax, pt[1] - ay
    return dx * ux + dy * uy, abs(dx * uy - dy * ux)


def pair_replaced(rows, ppf_by_page):
    """Todd's workflow (2026-09-11): keep one of the tool's polylines, fix
    it, delete the rest and copy the fixed one onto every place it belongs.
    By name that reads as one deletion plus one addition per member.  A
    deleted tool polyline and an added one of the same size on the same
    sheet, parallel and overlapping along the tool's line, are one
    'replaced' member: the tool found it, the estimator re-drew it.  The
    pair records the length change and the sideways / lengthwise offset,
    which is what the alignment work has to learn from."""
    deleted = [r for r in rows if r["verdict"] == "deleted" and r["type"] == "PolyLine" and r.get("ends")]
    added = [r for r in rows if r["verdict"] == "added" and r["type"] == "PolyLine" and r.get("ends")]
    by_key = collections.defaultdict(list)
    for r in added:
        by_key[(r["page"], norm_size(r["size"]))].append(r)
    cands = []
    for d in deleted:
        ppf = ppf_by_page.get(d["page"]) or 9.0
        (ax, ay), (bx, by) = d["ends"]
        d_ang = math.degrees(math.atan2(by - ay, bx - ax)) % 180
        for c in by_key.get((d["page"], norm_size(d["size"])), []):
            (cx0, cy0), (cx1, cy1) = c["ends"]
            c_ang = math.degrees(math.atan2(cy1 - cy0, cx1 - cx0)) % 180
            da = abs(d_ang - c_ang)
            da = min(da, 180 - da)
            if da > REPLACE_ANGLE_DEG:
                continue
            s0, l0 = _along_lateral(d["ends"], c["ends"][0])
            s1, l1 = _along_lateral(d["ends"], c["ends"][1])
            lateral = (l0 + l1) / 2
            if lateral > REPLACE_LATERAL_FT * ppf:
                continue
            lo, hi = min(s0, s1), max(s0, s1)
            overlap = min(hi, d["len_pt"]) - max(lo, 0.0)
            if overlap <= 0.25 * min(d["len_pt"], c["len_pt"] or d["len_pt"]):
                continue
            centre_d = math.hypot(d["centre"][0] - c["centre"][0], d["centre"][1] - c["centre"][1])
            cands.append((centre_d, id(d), id(c), d, c, lateral / ppf, (lo - 0.0) / ppf, (hi - d["len_pt"]) / ppf))
    cands.sort(key=lambda t: t[0])
    used_d, used_c = set(), set()
    for centre_d, di, ci, d, c, lateral_ft, start_shift, end_shift in cands:
        if di in used_d or ci in used_c:
            continue
        used_d.add(di)
        used_c.add(ci)
        ppf = ppf_by_page.get(d["page"]) or 9.0
        d_len, c_len = d["len_pt"] / ppf, (c["len_pt"] or 0) / ppf
        d["verdict"], c["verdict"] = "replaced", "replacement"
        d["why"] = (f"length {d_len:.2f} -> {c_len:.2f} ft; sideways {lateral_ft:.2f} ft; "
                    f"ends shifted {start_shift:+.1f} / {end_shift:+.1f} ft")
        d["new_len_ft"], d["len_delta_ft"], d["lateral_ft"] = c_len, c_len - d_len, lateral_ft
        d["end_shift_ft"] = max(abs(start_shift), abs(end_shift))
        d["new_size"] = c["size"]


def summarize(rows, auto_pdf, corrected_pdf):
    rows = [r for r in rows if r["verdict"] != "replacement"]      # the estimator's copy is counted through its pair
    by = collections.Counter(r["verdict"] for r in rows)
    kept, edited, deleted, added, replaced = by["kept"], by["edited"], by["deleted"], by["added"], by["replaced"]
    judged = kept + edited + deleted + replaced
    rep = [r for r in rows if r["verdict"] == "replaced"]
    deltas = sorted(abs(r["len_delta_ft"]) for r in rep)
    lateral = sorted(r["lateral_ft"] for r in rep)
    shifts = sorted(r["end_shift_ft"] for r in rep)
    med = lambda xs: xs[len(xs) // 2] if xs else None
    sheets = collections.defaultdict(collections.Counter)
    for r in rows:
        sheets[r["page"]][r["verdict"]] += 1
    sizes = collections.defaultdict(collections.Counter)
    for r in rows:
        sizes[norm_size(r.get("new_size") or r["size"]) or "?"][r["verdict"]] += 1
    why = collections.Counter()
    for r in rows:
        if r["verdict"] == "edited":
            for w in r["why"].split("; "):
                why[w.split(" ")[0]] += 1
    added_sizes = collections.Counter(norm_size(r["size"]) for r in rows if r["verdict"] == "added")
    deleted_sizes = collections.Counter(norm_size(r["size"]) for r in rows if r["verdict"] == "deleted")
    return {
        "auto": Path(auto_pdf).name, "corrected": Path(corrected_pdf).name,
        "kept": kept, "edited": edited, "deleted": deleted, "added": added, "replaced": replaced,
        "agreement": round(100 * kept / judged) if judged else None,
        # the tool put a markup of the right size on the right member (kept, edited or re-drawn on top)
        "found": round(100 * (kept + edited + replaced) / judged) if judged else None,
        "replaced_stats": {"n": replaced, "length_within_1ft": sum(1 for d in deltas if d <= 1.0),
                           "length_within_2ft": sum(1 for d in deltas if d <= 2.0),
                           "median_length_delta_ft": med(deltas), "median_sideways_ft": med(lateral),
                           "median_end_shift_ft": med(shifts)} if rep else None,
        "edit_kinds": dict(why),
        "sheets": [{"page": p, **{k: v for k, v in c.items()}} for p, c in sorted(sheets.items())],
        "sizes": [{"size": s, **{k: v for k, v in c.items()}} for s, c in sorted(sizes.items(), key=lambda kv: -sum(kv[1].values()))[:40]],
        "added_top": added_sizes.most_common(10), "deleted_top": deleted_sizes.most_common(10),
        "rows": [{k: v for k, v in r.items() if k not in ("centre",)} for r in rows if r["verdict"] != "kept"][:2000],
    }


def markdown(s):
    L = [f"# Takeoff corrections: {s['corrected']} vs {s['auto']}", "",
         f"Kept {s['kept']}, edited {s['edited']}, re-drawn on top {s.get('replaced', 0)}, deleted {s['deleted']}, added {s['added']}. "
         f"Members found (kept + edited + re-drawn): {s['found'] if s.get('found') is not None else '-'}%; "
         f"kept untouched: {s['agreement'] if s['agreement'] is not None else '-'}%.", ""]
    rs = s.get("replaced_stats")
    if rs:
        L += [f"Re-drawn members: {rs['n']}; the tool's length was within 1 ft on {rs['length_within_1ft']} and within 2 ft on "
              f"{rs['length_within_2ft']}; median length change {rs['median_length_delta_ft']:.2f} ft, median sideways offset "
              f"{rs['median_sideways_ft']:.2f} ft, median end shift {rs['median_end_shift_ft']:.2f} ft.", ""]
    if s["edit_kinds"]:
        L += ["Edits by kind: " + ", ".join(f"{k} {v}" for k, v in s["edit_kinds"].items()), ""]
    L += ["| Page | kept | edited | re-drawn | deleted | added |", "|---|---|---|---|---|---|"]
    for sh in s["sheets"]:
        L.append(f"| {sh['page']} | {sh.get('kept', 0)} | {sh.get('edited', 0)} | {sh.get('replaced', 0)} | {sh.get('deleted', 0)} | {sh.get('added', 0)} |")
    L += ["", "| Size | kept | edited | re-drawn | deleted | added |", "|---|---|---|---|---|---|"]
    for sz in s["sizes"][:30]:
        L.append(f"| {sz['size']} | {sz.get('kept', 0)} | {sz.get('edited', 0)} | {sz.get('replaced', 0)} | {sz.get('deleted', 0)} | {sz.get('added', 0)} |")
    if s["added_top"]:
        L += ["", "Added by hand (the tool missed these): " + ", ".join(f"{k} x{v}" for k, v in s["added_top"])]
    if s["deleted_top"]:
        L += ["", "Deleted (the tool was wrong here): " + ", ".join(f"{k} x{v}" for k, v in s["deleted_top"])]
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("auto")
    ap.add_argument("corrected")
    ap.add_argument("--json")
    ap.add_argument("-o", "--output")
    args = ap.parse_args()
    print("PROGRESS 1/2 reading", flush=True)
    rows, _ = compare(args.auto, args.corrected)
    print("PROGRESS 2/2 comparing", flush=True)
    s = summarize(rows, args.auto, args.corrected)
    if args.json:
        Path(args.json).write_text(json.dumps(s, indent=1, allow_nan=False), encoding="utf-8")
    md = markdown(s)
    if args.output:
        Path(args.output).write_text(md, encoding="utf-8")
    print(md.split("\n")[2])


if __name__ == "__main__":
    main()
