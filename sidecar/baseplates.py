"""Column base plates from the typical base plate detail.

Todd adds base plates by hand today; the drawings state them once, in a
"TYPICAL COLUMN BASE PLATE" detail (plan + section): plate thickness and plan
size, anchor rod diameter / grade / embedment, the column-to-plate weld.
This module reads that detail and hands back one plate spec per set so the
column step can nest a plate row under every column:

    Shape_Size "PL 1 x 14" (thickness x width, custom width priced as such),
    Length_Ft = the other plan dimension, Holes Drill x rod count, the weld on
    the column row, anchor rods in the note until the hardware catalog has
    F1554 rods.

Rod count is drawn, not written, so it defaults to 4 with a CHECK note unless
the text says "(4)".  Braced-frame / per-location base details are reported
but not applied.
"""
import math
import re

import pymupdf

import lengths

# a detail title: "TYPICAL COLUMN BASE PLATE", "HSS COLUMN BASE PLAN",
# "COLUMN BASEPLATE - PLAN", "TYPICAL BASE PLATE DETAIL"
TITLE_RE = re.compile(r"^(?:\d+\s*/\s*)?(?:TYP(?:ICAL)?\.?\s+)?(?:HSS\s+|STEEL\s+|STL\s+|W\s+)?(?:COL(?:UMN)?\.?\s+)?BASE\s*PL(?:ATE)?(?:\s+DETAIL)?(?:\s*[-–]\s*(?:PLAN|SECTION|ELEVATION))?\.?$", re.I)
SKIP_RE = re.compile(r"EXIST|BRACED?\s*FRAME|\bBF\b|SCHEDULE|REFER|SEE\b|SECURITY|POLE|MANUFACTURER|ALTERNAT", re.I)
FRAC = r"\d+(?:\s*-\s*\d+/\d+|\s+\d+/\d+|/\d+)?"
FEET_IN_RE = re.compile(rf"(?<![\d/.])(\d{{1,2}})'\s*-?\s*({FRAC})?\s*(?:\"|'')?(?![\dx/])")
INCH_RE = re.compile(rf"(?<![\d/.'])({FRAC})\s*\"")
THICK_RE = re.compile(rf"({FRAC})\s*\"\s*(?:THICK|THK)?\.?\s*(?:BASE\s*)?PL(?:ATE)?\b|PL(?:ATE)?\s*({FRAC})\s*\"?\s*(?:THICK|THK)\b", re.I)
PL_DIMS_RE = re.compile(rf"(?:BASE\s*)?PL(?:ATE)?\.?\s*({FRAC})\s*\"?\s*[xX]\s*({FRAC})\s*\"?\s*[xX]\s*({FRAC})\s*\"?", re.I)
ROD_RE = re.compile(rf"(?:\((\d+)\)\s*|(\d+)\s*-\s*)?({FRAC})\s*\"?\s*(?:DIA\.?|Ø|⌀|∅)?\s*(?:\(MIN\.?\)\s*)?(?:(ASTM\s*)?(F1554(?:[- ]?(?:GR\.?\s*)?\d+)?|A307|A36|A325N?)\s*)?(HILTI\s+KWIK\s+BOLT(?:\s+TZ2?)?|KWIK\s+BOLT(?:\s+TZ2?)?|ANCHOR\s+RODS?|ANCHOR\s+BOLTS?|ANCHORS\b|EXPANSION\s+ANCHORS?)", re.I)
ROD_RE2 = re.compile(rf"(?:\((\d+)\)\s*)?({FRAC})\s*\"\s*(?:DIA\.?|Ø|⌀)\s*(?:ASTM\s*)?(F1554(?:[- ]?(?:GR\.?\s*)?\d+)?)", re.I)
EMBED_RE = re.compile(rf"(\d{{1,2}}'\s*-?\s*(?:{FRAC})?\s*\"?|{FRAC}\s*\")\s*(?:MIN\.?\s*)?EMBED|EMBED(?:MENT)?\s*(?:DEPTH\s*)?=?\s*(\d{{1,2}}'\s*-?\s*(?:{FRAC})?\s*\"?|{FRAC}\s*\")", re.I)
WELD_RE = re.compile(rf"({FRAC})\s*(?:/|\s)\s*(?:TYP\s*)?(?:HSS\s+|W\s+)?COL(?:UMN)?\.?\s+TO\s+(?:BASE\s+)?PL", re.I)


def frac(s):
    s = s.strip().replace(" - ", "-")
    m = re.fullmatch(r"(\d+)(?:[\s-]+(\d+)/(\d+))?", s)
    if m:
        v = int(m.group(1))
        if m.group(2):
            v += int(m.group(2)) / int(m.group(3))
        return v
    m = re.fullmatch(r"(\d+)/(\d+)", s)
    if m:
        return int(m.group(1)) / int(m.group(2))
    try:
        return float(s)
    except ValueError:
        return None


def inches(text):
    """A feet-inch or inch dimension string -> inches."""
    m = FEET_IN_RE.fullmatch(text.strip())
    if m:
        return int(m.group(1)) * 12 + (frac(m.group(2)) or 0)
    m = INCH_RE.fullmatch(text.strip())
    if m:
        return frac(m.group(1))
    return None


def fmt_in(v):
    """14 -> 1'-2", 9.5 -> 9-1/2\", 0.75 -> 3/4\"."""
    if v is None:
        return "?"
    from fractions import Fraction
    if v >= 12:
        ft, rem = int(v // 12), v - 12 * int(v // 12)
        f = Fraction(rem).limit_denominator(16)
        r = str(f.numerator // f.denominator) if f.denominator == 1 else f"{f.numerator // f.denominator}-{f.numerator % f.denominator}/{f.denominator}" if f.numerator // f.denominator else f"{f.numerator}/{f.denominator}"
        return f"{ft}'-{r}\""
    f = Fraction(v).limit_denominator(16)
    if f.denominator == 1:
        return f"{f.numerator}\""
    whole, num = divmod(f.numerator, f.denominator)
    return (f"{whole}-{num}/{f.denominator}" if whole else f"{num}/{f.denominator}") + "\""


def _blocks(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        lines = ["".join(s["text"] for s in l["spans"]).strip() for l in b["lines"]]
        text = " / ".join(l for l in lines if l)
        out.append((pymupdf.Rect(b["bbox"]), text.replace("⌀", "Ø").replace("∅", "Ø"), lines))
    return out


def find_details(doc, pages, sheet_numbers=None):
    """Base plate details on the given pages: [{page, sheet, title, box,
    thick_in, w_in, l_in, rod_n, rod_n_stated, rod_dia_in, rod_spec,
    embed_in, weld_in, typical, text}]."""
    out = []
    for pno in pages:
        page = doc[pno]
        blocks = _blocks(page)
        titles = []
        for r, text, lines in blocks:
            for l in lines:
                t = re.sub(r"^\s*[\d/\"' =-]+\s*/\s*", "", l).strip()      # "1" = 1'-0" / 1 / COLUMN BASEPLATE - PLAN"
                if TITLE_RE.match(t) and not SKIP_RE.search(text):
                    titles.append((r, t))
                    break
        for r, title in titles:
            # the detail sits above its title: same column of the sheet, up to
            # the next title-like block above
            box = pymupdf.Rect(r.x0 - 420, max(0, r.y0 - 760), r.x1 + 420, r.y1)
            texts = [(br, bt) for br, bt, _ in blocks if box.intersects(br) and br.y1 <= r.y1 + 2]
            joined = "  |  ".join(bt for _, bt in texts).replace(" / ", " ")
            spec = parse_spec(joined)
            spec["braced"] = bool(re.search(r"BRACE|GUSSET|BF\b", joined, re.I))
            spec.update({"page": pno, "sheet": (sheet_numbers or {}).get(pno, ""), "title": title,
                         "box": box, "typical": bool(re.search(r"\bTYP", title, re.I) or re.search(r"\bTYP", joined[:0], re.I)),
                         "text": joined[:400]})
            out.append(spec)
    # merge PLAN + SECTION halves of one detail (same sheet, titles side by side)
    merged = []
    for s in out:
        twin = next((m for m in merged if m["page"] == s["page"] and abs(m["box"].y1 - s["box"].y1) < 40
                     and re.sub(r"\s*[-–]\s*(PLAN|SECTION|ELEVATION)$", "", m["title"], flags=re.I).upper()
                     == re.sub(r"\s*[-–]\s*(PLAN|SECTION|ELEVATION)$", "", s["title"], flags=re.I).upper()), None)
        if twin:
            for k in ("thick_in", "w_in", "l_in", "rod_n_stated", "rod_dia_in", "rod_spec", "embed_in", "weld_in"):
                if twin.get(k) in (None, False, "") and s.get(k) not in (None, False, ""):
                    twin[k] = s[k]
            if s.get("rod_n_stated"):
                twin["rod_n"] = s["rod_n"]
            twin["text"] += "  ||  " + s["text"]
            twin["title"] = re.sub(r"\s*[-–]\s*(PLAN|SECTION|ELEVATION)$", "", twin["title"], flags=re.I)
            continue
        merged.append(s)
    return [m for m in merged if m.get("thick_in")]


def choose(details):
    """The typical column base plate: the one titled TYP, else the only
    non-braced one, else None (braced-frame details are per location)."""
    plain = [d for d in details if not d.get("braced")]
    typ = [d for d in plain if d.get("typical")]
    if typ:
        return typ[0]
    return plain[0] if len(plain) == 1 else None


def parse_spec(text):
    spec = {"thick_in": None, "w_in": None, "l_in": None, "rod_n": 4, "rod_n_stated": False,
            "rod_dia_in": None, "rod_spec": "", "embed_in": None, "weld_in": None}
    m = PL_DIMS_RE.search(text)
    if m:
        dims = sorted(frac(g) for g in m.groups())
        spec["thick_in"], spec["w_in"], spec["l_in"] = dims[0], dims[1], dims[2]
    else:
        m = THICK_RE.search(text)
        if m:
            spec["thick_in"] = frac(m.group(1) or m.group(2))
        # plan size: the feet-inch dimensions in the detail (6" to 3'-0"),
        # the two largest distinct values; one value -> square plate
        vals = []
        for mm in FEET_IN_RE.finditer(text):
            v = int(mm.group(1)) * 12 + (frac(mm.group(2)) or 0)
            if 6 <= v <= 36:
                vals.append(round(v, 3))
        if vals:
            distinct = sorted(set(vals), reverse=True)
            spec["l_in"] = distinct[0]
            spec["w_in"] = distinct[1] if len(distinct) > 1 and vals.count(distinct[1]) >= 1 and distinct[0] - distinct[1] <= 12 else distinct[0]
            if len(distinct) > 1 and vals.count(distinct[0]) >= 2:
                spec["w_in"] = distinct[0]          # the same dimension twice = square
    m = ROD_RE.search(text) or ROD_RE2.search(text)
    if m:
        g = m.groups()
        n = g[0] or g[1] if len(g) > 3 else g[0]
        if n:
            spec["rod_n"], spec["rod_n_stated"] = int(n), True
        spec["rod_dia_in"] = frac(g[2] if len(g) > 3 else g[1])
        parts = [p for p in (g[4] if len(g) > 4 else g[2], g[5] if len(g) > 5 else "") if p]
        spec["rod_spec"] = " ".join(p.strip() for p in parts).upper().replace("  ", " ")
    m = EMBED_RE.search(text)
    if m:
        spec["embed_in"] = inches((m.group(1) or m.group(2)).strip())
    m = WELD_RE.search(text)
    if m:
        spec["weld_in"] = frac(m.group(1))
    return spec


def describe(spec):
    s = f"PL {fmt_in(spec['thick_in'])} x {fmt_in(spec['w_in'])} x {fmt_in(spec['l_in'])}"
    rods = ""
    if spec.get("rod_dia_in"):
        rods = f", ({spec['rod_n']}) {fmt_in(spec['rod_dia_in'])} {spec.get('rod_spec') or 'anchor rods'}".rstrip()
        if spec.get("embed_in"):
            rods += f" x {fmt_in(spec['embed_in'])} embed"
    return s + rods


def plate_row(spec, mark):
    """Revu column values for the nested plate under column `mark`."""
    t, w, l = spec["thick_in"], spec["w_in"], spec["l_in"]
    from fractions import Fraction
    def tok(v):
        f = Fraction(v).limit_denominator(16)
        if f.denominator == 1:
            return str(f.numerator)
        whole, num = divmod(f.numerator, f.denominator)
        return f"{whole}-{num}/{f.denominator}" if whole else f"{num}/{f.denominator}"
    width = min(w, l)
    length_ft = max(w, l) / 12
    lbft = 3.4 * t * width                                   # lb per ft of a t x width strip
    return {"Shape_Size": f"PL {tok(t)} x {tok(width)}", "Quantity": "1", "Length_Ft": f"{length_ft:.2f}",
            "Member_Mark": f"{mark}.1", "Part_Label": "BASE PL", "Holes": "Drill", "Hole_Qty": str(spec["rod_n"]),
            "Weight_Per_Ft": f"{lbft:.1f}", "Total_Length_Ft": f"{length_ft:.2f}",
            "Total_Weight_Lbs": f"{lbft * length_ft:.0f}"}, lbft * length_ft
