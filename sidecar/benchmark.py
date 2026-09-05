"""Score the auto-takeoff against the estimator's own Bluebeam markups, across
every job folder that has a MARKUPS_ copy.

    python sidecar/benchmark.py [C:\\Projects\\bid-samples] [--jobs "CAB IAH100,PAC"] [--ocr]

For each job: the combined set and its MARKUPS_ twin (same pages).  On every
structural plan sheet the takeoff's callouts are measured (lengths.py, per
scaling window) and each is matched one-to-one to the nearest unused
polyline of the same size in the markup (any size within 25 pt when the
estimator named it differently, e.g. 24K4 vs 24LHSP).  Reports, per job and
overall: callouts vs polylines, share within 1 ft / 2 ft, and LF per size.

Writes <root>/BENCHMARK.md and prints the summary.  OCR is off by default
(slow); pass --ocr to read stroke-font sheets.
"""
import argparse
import collections
import datetime as dt
import math
import re
import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
import columns                                  # noqa: E402
import lengths                                  # noqa: E402
import shapes                                   # noqa: E402
from auto_takeoff import page_callouts, sheet_info   # noqa: E402


SIZE_COLUMNS = ("Shape_Size", "(Non-Flat) Mat Size", "Material Size", "Mat Size")


def size_column_indexes(mdoc):
    """Which custom-column slots hold the member size in this markup file
    (profiles changed over the years: Shape_Size today, '(Non-Flat) Mat
    Size' / 'Material Size' in the older estimating profile)."""
    cols = mdoc.xref_get_key(mdoc.pdf_catalog(), "BSIAnnotColumns")
    if cols[0] != "xref":
        return [4]
    raw = re.findall(r"/Name \(((?:\\.|[^)\\])*)\)", mdoc.xref_object(int(cols[1].split()[0])))
    names = [n.replace("\\(", "(").replace("\\)", ")") for n in raw]
    idx = [names.index(n) for n in SIZE_COLUMNS if n in names]
    return idx or [4]


def markup_polylines(mdoc, pno, ppf_at, size_idx):
    out = []
    page = mdoc[pno]
    for a in page.annots():
        if a.type[1] != "PolyLine":
            continue
        v = a.vertices
        L = sum(math.hypot(v[i + 1][0] - v[i][0], v[i + 1][1] - v[i][1]) for i in range(len(v) - 1))
        cols = re.findall(r"\(([^)]*)\)", mdoc.xref_get_key(a.xref, "BSIColumnData")[1] or "")
        size = next((cols[i] for i in size_idx if i < len(cols) and cols[i].strip()), "")
        out.append({"key": shapes.norm(size), "size": size, "subject": a.info.get("subject", ""),
                    "ft": L / ppf_at(v[0]), "v": v, "used": False})
    return out


def markup_viewports(mdoc, pno):
    """Estimator's scaling windows on the markup page: [(Rect y-down, ppf)]."""
    page = mdoc[pno]
    vps = []
    vp = mdoc.xref_get_key(page.xref, "VP")
    if vp[0] not in ("xref", "array"):
        return vps
    arr = mdoc.xref_object(int(vp[1].split()[0])) if vp[0] == "xref" else vp[1]
    H = page.rect.height
    for ref in re.findall(r"(\d+) 0 R", arr):
        bb = mdoc.xref_get_key(int(ref), "BBox")[1]
        m = mdoc.xref_get_key(int(ref), "Measure")
        if not bb or m[0] != "xref":
            continue
        R = mdoc.xref_get_key(int(m[1].split()[0]), "R")[1] or ""
        mm = re.match(r"([\d.]+) in = (\d+) ft", R)
        b = [float(x) for x in bb.strip("[]").split()]
        if mm and len(b) == 4:
            vps.append((pymupdf.Rect(b[0], H - b[3], b[2], H - b[1]), float(mm.group(1)) * 72 / float(mm.group(2))))
    return vps


def nearest_poly(polys, c, same_size_reach=150, any_size_reach=25):
    ax, ay = c["anchor_pt"]

    def dist(p):
        (x0, y0), (x1, y1) = p["v"][0], p["v"][-1]
        vx, vy = x1 - x0, y1 - y0
        LL = vx * vx + vy * vy or 1
        t = max(0, min(1, ((ax - x0) * vx + (ay - y0) * vy) / LL))
        return math.hypot(ax - (x0 + t * vx), ay - (y0 + t * vy))

    for reach, same in ((same_size_reach, True), (any_size_reach, False)):
        best = None
        for p in polys:
            if p["used"] or (same and p["key"] != shapes.norm(c["key"])):
                continue
            d = dist(p)
            if d < reach and (best is None or d < best[0]):
                best = (d, p)
        if best:
            best[1]["used"] = True
            return best[1]
    return None


_CTX = {}


def _doc_context(doc):
    """Column schedule, plan pages and elevation notes, once per document."""
    key = id(doc)
    if key not in _CTX:
        infos = [sheet_info(p) for p in doc]
        disc = lambda n: (re.match(r"[A-Z]*", n).group(0)[-1:]) if n else ""
        plans = [i for i, (n, t, k) in enumerate(infos) if k == "plan" and disc(n) == "S"]
        others = [i for i, (n, t, k) in enumerate(infos) if k != "plan" and disc(n) == "S"]
        schedule, blocks = columns.column_schedule(doc, plans)
        _CTX[key] = {"plans": plans, "schedule": schedule, "blocks": blocks,
                     "notes": {i: columns.elevation_notes(doc[i]) for i in plans},
                     "sections": columns.section_elevations(doc, others)}
    return _CTX[key]


def score_page(doc, mdoc, pno, weights, use_ocr, size_idx=(4,)):
    page = doc[pno]
    calls = page_callouts(page)
    if not calls and use_ocr:
        import ocr
        calls = ocr.ocr_callouts(page)
    for c in calls:
        c["key"] = shapes.resolve(c["fam"], c["dims"])[0]
    calls = [c for c in calls if c["key"]]
    regions = lengths.scale_regions(page)
    extra = None
    import raster
    if raster.has_raster_linework(page):               # rasterised linework: add strokes from the tiles
        extra, _, _ = raster.raster_polylines(page)
    groups = {}
    for c in calls:
        centre = ((c["bbox"].x0 + c["bbox"].x1) / 2, (c["bbox"].y0 + c["bbox"].y1) / 2)
        rect, ppf = lengths.region_for(regions, centre) if regions else (None, None)
        groups.setdefault((id(rect), ppf), (rect, ppf, []))[2].append(c)
    chains = lengths.extract_chains(page, extra)
    typ_all = []
    for rect, ppf, group in groups.values():
        lengths.measure(page, group, weights, ppf, chains=chains)
        tags = lengths.tag_instances(page, group, weights, ppf, chains)
        typ_all += tags + lengths.typ_instances(page, group + tags, weights, ppf, chains, all_callouts=calls)
    calls = calls + typ_all
    ctx = _doc_context(doc)
    if pno in ctx["plans"]:
        ppf0 = regions[0][1] if regions else None
        cols, consumed = columns.columns_on_page(page, pno, "", calls, chains, ppf0, ctx["schedule"],
                                                 ctx["blocks"].get(pno), ctx["notes"], ctx["plans"], ctx["sections"])
        calls = [c for c in calls if id(c) not in consumed] + cols
        res_columns = len(cols)
    else:
        res_columns = 0
    vps = markup_viewports(mdoc, pno)

    def ppf_at(pt):
        for r, p in vps:
            if r.contains(pymupdf.Point(*pt)):
                return p
        if regions:
            return lengths.region_for(regions, pt)[1]
        return 9.0

    polys = markup_polylines(mdoc, pno, ppf_at, size_idx)
    res = {"callouts": len(calls) - len(typ_all) - res_columns, "typ": len(typ_all) + res_columns, "polylines": len(polys), "measured": 0, "in1": 0, "in2": 0, "matched": 0,
           "lf_auto": collections.defaultdict(float), "lf_todd": collections.defaultdict(float),
           "n_auto": collections.Counter(), "n_todd": collections.Counter()}
    for p in polys:
        res["lf_todd"][p["key"]] += p["ft"]
        res["n_todd"][p["key"]] += 1
    for c in calls:
        c.setdefault("anchor_pt", ((c["bbox"].x0 + c["bbox"].x1) / 2, (c["bbox"].y0 + c["bbox"].y1) / 2))
        ft = c.get("length_ft")
        if ft is None:
            continue
        res["measured"] += 1
        k = shapes.norm(c["key"])
        res["lf_auto"][k] += ft
        res["n_auto"][k] += 1
        p = nearest_poly(polys, c)
        if p:
            res["matched"] += 1
            diff = abs(ft - p["ft"])
            if diff <= 1.0:
                res["in1"] += 1
            if diff <= 2.0:
                res["in2"] += 1
    return res


def run(root, jobs, use_ocr):
    weights = shapes.all_weights()
    lines = [f"# Auto-takeoff benchmark", "", f"Run {dt.datetime.now():%Y-%m-%d %H:%M} over {root}", ""]
    totals = collections.Counter()
    for d in sorted(root.iterdir()):
        if not d.is_dir() or (jobs and d.name not in jobs):
            continue
        marks = [p for p in d.glob("*.pdf") if "MARKUPS_" in p.name.upper()]
        sets = [p for p in d.glob("*.pdf") if p not in marks]
        if not sets or not marks:
            continue
        doc, mdoc = pymupdf.open(sets[0]), pymupdf.open(marks[0])
        size_idx = size_column_indexes(mdoc)
        lines += [f"## {d.name}", "", f"`{sets[0].name}` ({doc.page_count} pages) vs `{marks[0].name}`", "",
                  "| Page | Sheet | Title | Callouts | Typ | Measured | Todd polylines | Matched | ≤1 ft | ≤2 ft |", "|---|---|---|---|---|---|---|---|---|---|"]
        job = collections.Counter()
        per_size_auto, per_size_todd = collections.defaultdict(float), collections.defaultdict(float)
        for pno in range(min(doc.page_count, mdoc.page_count)):
            number, title, kind = sheet_info(doc[pno])
            disc = re.match(r"[A-Z]*", number).group(0)[-1:] if number else ""
            n_marks = sum(1 for a in mdoc[pno].annots() if a.type[1] == "PolyLine")
            is_plan = kind == "plan" and disc == "S"
            # score every sheet the tool calls a structural plan, plus every
            # sheet the estimator actually measured on (classification misses)
            if not is_plan and n_marks < 3:
                continue
            if not doc[pno].get_text().strip() and not use_ocr:
                continue
            r = score_page(doc, mdoc, pno, weights, use_ocr, size_idx)
            if not r["callouts"] and not r["polylines"]:
                continue
            if not is_plan:
                title = f"{title} (NOT classified as plan: {kind}/{disc or '?'})"
            for k in ("callouts", "polylines", "measured", "matched", "in1", "in2"):
                job[k] += r[k]
            for k, v in r["lf_auto"].items():
                per_size_auto[k] += v
            for k, v in r["lf_todd"].items():
                per_size_todd[k] += v
            pct = lambda n: f"{100 * n / r['matched']:.0f}%" if r["matched"] else "-"
            lines.append(f"| {pno + 1} | {number} | {title[:32]} | {r['callouts']} | {r.get('typ', 0)} | {r['measured']} | {r['polylines']} | {r['matched']} | {pct(r['in1'])} | {pct(r['in2'])} |")
        m = job["matched"] or 1
        lines += ["", f"**{d.name}:** {job['callouts']} callouts, {job['measured']} measured, {job['polylines']} of Todd's polylines, "
                      f"{job['matched']} matched, {100 * job['in1'] / m:.0f}% within 1 ft, {100 * job['in2'] / m:.0f}% within 2 ft.", "",
                  "| Size | Auto LF | Todd LF |", "|---|---|---|"]
        for k in sorted(set(per_size_auto) | set(per_size_todd), key=lambda k: -per_size_todd.get(k, 0))[:25]:
            lines.append(f"| {k} | {per_size_auto.get(k, 0):.0f} | {per_size_todd.get(k, 0):.0f} |")
        lines.append("")
        totals.update(job)
    m = totals["matched"] or 1
    lines += ["## Overall", "", f"{totals['callouts']} callouts, {totals['measured']} measured, {totals['polylines']} polylines, {totals['matched']} matched, "
              f"{100 * totals['in1'] / m:.0f}% within 1 ft, {100 * totals['in2'] / m:.0f}% within 2 ft."]
    out = root / "BENCHMARK.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[-3:]))
    print(f"wrote {out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", nargs="?", default=r"C:\Projects\bid-samples")
    ap.add_argument("--jobs", help="comma-separated job folder names")
    ap.add_argument("--ocr", action="store_true")
    args = ap.parse_args()
    run(Path(args.root), set(j.strip() for j in args.jobs.split(",")) if args.jobs else None, args.ocr)


if __name__ == "__main__":
    main()
