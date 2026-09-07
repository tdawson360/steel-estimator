"""Typical-detail members: sized in a detail, counted by what they attach to.

"L3X3X1/4 TYP AT EA JOIST", "HSS5x2x3/16 BTWN EA OUTRIGGER", "L2x2x1/4 AT
EACH BRIDGING LINE", "L3x3x1/4 @ 8'-0" OC" live on the detail sheets and
never on the plan, yet they are a third of the pieces on a set like KISD or
Veterans.  The estimator's own convention (Doggett) is one markup with the
Quantity set, so that is what the tool writes: a count-only box on the
detail sheet, Quantity = the plan count of the thing the note names when the
tool measured it (joists, columns), otherwise blank, always with a CHECK note.

detail_members(page) -> [{text, fam, dims, raw, key, each, per, length_ft, bbox}]
"""
import re

import pymupdf

import shapes

EACH_RE = re.compile(r"(?:AT|@|PER)\s+(?:EA(?:CH|\.)?\s+)?(JOIST|JST|COL(?:UMN)?|BEAM|BM|BAY|OUTRIGGER|BRIDGING LINE|PURLIN|GIRT|POST|PANEL POINT|BRACE|HSS\s*\d+X\d+)", re.I)
BTWN_RE = re.compile(r"(?:BTWN|BETWEEN)\s+(?:EA(?:CH|\.)?\s+)?(JOISTS?|JSTS?|OUTRIGGERS?|BEAMS?|BMS?|COLUMNS?|COLS?|PURLINS?|POSTS?)", re.I)
SPACING_RE = re.compile(r"(?:AT|@|SPACED AT)\s*(\d{1,2})'\s*-?\s*(\d{1,2})?\"?\s*O\.?\s*C\.?", re.I)
PIECE_LEN_RE = re.compile(r"[xX]\s*(\d{1,2})'\s*-?\s*(\d{1,2})?(?:\s+(\d)/(\d))?\s*\"", re.I)
SKIP_RE = re.compile(r"\bEX\.?\s|\(E\)|EXIST|HOLES?\b.*@|BOLTS?\s+(?:AT|@)|STUDS?\s+(?:AT|@)|SLOTTED|WELD", re.I)
KINDS = {"JOIST": "joists", "JST": "joists", "COL": "columns", "COLUMN": "columns", "BEAM": "beams", "BM": "beams",
         "BAY": "bays", "OUTRIGGER": "outriggers", "BRIDGING LINE": "bridging lines", "PURLIN": "purlins", "GIRT": "girts",
         "POST": "posts", "PANEL POINT": "panel points", "BRACE": "braces"}


def _kind(word):
    w = word.upper().rstrip("S").replace("JSTS", "JST")
    for k, v in KINDS.items():
        if w.startswith(k):
            return v
    return word.lower()


def detail_members(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        text = " ".join("".join(s["text"] for s in l["spans"]).strip() for l in b["lines"])
        if len(text) > 160 or SKIP_RE.search(text):
            continue
        m_each, m_btwn, m_sp = EACH_RE.search(text), BTWN_RE.search(text), SPACING_RE.search(text)
        if not (m_each or m_btwn or m_sp):
            continue
        hits = list(shapes.find_callouts(text))
        if not hits:
            continue
        fam, dims, raw = hits[0]
        key = shapes.resolve(fam, dims)[0]
        if not key:
            continue
        each = per = None
        if m_each:
            each = _kind(m_each.group(1))
        elif m_btwn:
            each = _kind(m_btwn.group(1))
            per = "between"
        spacing = None
        if m_sp:
            spacing = int(m_sp.group(1)) + (int(m_sp.group(2)) if m_sp.group(2) else 0) / 12
        length = None
        m_len = PIECE_LEN_RE.search(text)
        if m_len:
            length = int(m_len.group(1)) + (int(m_len.group(2)) if m_len.group(2) else 0) / 12 + ((int(m_len.group(3)) / int(m_len.group(4))) if m_len.group(3) else 0) / 12
        out.append({"text": text[:140], "fam": fam, "dims": dims, "raw": raw.strip(), "key": key, "each": each,
                    "per": per, "spacing_ft": spacing, "length_ft": length, "bbox": pymupdf.Rect(b["bbox"])})
    return out


def quantity(member, counts):
    """(qty or None, how) from the set's plan counts {"joists": n, "columns": n, ...}."""
    if member["each"] and counts.get(member["each"]):
        n = counts[member["each"]]
        return n, f"{n} {member['each']} on the plans"
    if member["each"]:
        return None, f"count the {member['each']} on the plans"
    if member["spacing_ft"]:
        return None, f"spaced at {member['spacing_ft']:g} ft o.c.: divide the run by the spacing"
    return None, "count from the plan"
