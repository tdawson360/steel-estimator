"""Readers for the Bluebeam Revu profile (.bpx) and tool set (.btx) that
define the takeoff contract, plus the PDF-side column definitions Revu needs
(/BSIAnnotColumns in the catalog, /BSIColumnData on each annotation).

The custom-column order is the profile's Index order.  Revu stores the same
order in /BSIAnnotColumns and reads every annotation's /BSIColumnData
positionally against it, so both must be built from the same list.
"""
import re
import zlib
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Column:
    index: int
    name: str
    subtype: str            # Number | Text | Choice | Formula
    display_order: int
    precision: int = 0
    format: str = "Normal"
    totals: bool = False
    multiline: bool = False
    allow_custom: bool = False
    expression: str = ""
    items: list = field(default_factory=list)   # Choice: list of (value, subject, number)


@dataclass
class Tool:
    subject: str
    subtype: str            # PolyLine | Polygon
    color: tuple            # (r, g, b) floats 0..1


def _text(el, tag, default=""):
    x = el.find(tag)
    return (x.text or "").strip() if x is not None and x.text is not None else default


def _bool(el, tag):
    return _text(el, tag, "False").lower() == "true"


def load_profile(path):
    """Return (profile_name, [Column]) in Index order."""
    root = ET.parse(path).getroot()
    name = root.get("Name", Path(path).stem)
    cols = []
    for rec in root.iter("Record"):
        if rec.get("Key") != "MarkupList":
            continue
        cc = rec.find("CustomColumns")
        for el in cc:
            if _bool(el, "Deleted"):
                continue
            col = Column(
                index=int(el.get("Index")),
                name=_text(el, "Name"),
                subtype=el.get("Subtype"),
                display_order=int(_text(el, "DisplayOrder", "0")),
                precision=int(_text(el, "Precision", "0") or 0),
                format=_text(el, "Format", "Normal") or "Normal",
                totals=_bool(el, "Totals"),
                multiline=_bool(el, "Multiline"),
                allow_custom=_bool(el, "AllowCustom"),
                expression=_text(el, "Expression"),
            )
            items = el.find("Items")
            if items is not None:
                for it in items:
                    v = _text(it, "Value")
                    if not v:
                        continue        # the blank "Index 0" placeholder
                    col.items.append((v, _text(it, "Subject"), _text(it, "Number")))
            cols.append(col)
    cols.sort(key=lambda c: c.index)
    return name, cols


def load_toolkit(path):
    """Return (title, {subject: Tool}) from a .btx tool set."""
    root = ET.parse(path).getroot()
    title = zlib.decompress(bytes.fromhex(root.findtext("Title"))).decode("utf-8", "replace")
    tools = {}
    for item in root.iter("ToolChestItem"):
        raw = zlib.decompress(bytes.fromhex(item.findtext("Raw"))).decode("latin-1")
        subj = re.search(r"/Subj\s*\(([^)]*)\)", raw)
        sub = re.search(r"/Subtype\s*/(\w+)", raw)
        col = re.search(r"/C\s*\[([^\]]*)\]", raw)
        if not subj:
            continue
        rgb = tuple(float(x) for x in col.group(1).split()) if col else (1, 0, 0)
        tools[subj.group(1)] = Tool(subj.group(1), sub.group(1) if sub else "PolyLine", rgb)
    return title, tools


# -- PDF object builders -----------------------------------------------------

def pdf_string(s):
    """Literal PDF string with the three characters that need escaping."""
    s = "" if s is None else str(s)
    for ch in ("\\", "(", ")"):
        s = s.replace(ch, "\\" + ch)
    return "(" + s.encode("latin-1", "replace").decode("latin-1") + ")"


def column_data(columns, values):
    """/BSIColumnData array for one annotation: one string per column in
    Index order, taken from values by column name (missing -> empty)."""
    return "[" + "".join(pdf_string(values.get(c.name, "")) for c in columns) + "]"


def install_columns(doc, columns):
    """Write the profile's custom columns into the PDF catalog so Revu shows
    them in the Markups List and maps every annotation's column data to them.
    Replaces any existing /BSIAnnotColumns."""
    parts = []
    for c in columns:
        d = [f"/Subtype /{c.subtype}", f"/Name {pdf_string(c.name)}", f"/DisplayOrder {c.display_order}"]
        if c.subtype in ("Number", "Choice", "Formula"):
            d += [f"/Format /{c.format}", f"/Precision {c.precision}"]
        if c.subtype in ("Number", "Formula"):
            d.append(f"/Totals {'true' if c.totals else 'false'}")
        if c.subtype == "Text":
            d.append(f"/Multiline {'true' if c.multiline else 'false'}")
        if c.subtype == "Formula":
            d.append(f"/Expression {pdf_string(c.expression)}")
        if c.subtype == "Choice":
            xref = doc.get_new_xref()
            if any(subj or num for _, subj, num in c.items):
                body = "".join(f"[{pdf_string(v)}{pdf_string(subj)}{pdf_string(num)}]" for v, subj, num in c.items)
            else:
                body = "".join(pdf_string(v) for v, _, _ in c.items)
            doc.update_object(xref, f"[{body}]")
            d += [f"/Items {xref} 0 R", "/DefaultValues [ ]", f"/AllowCustom {'true' if c.allow_custom else 'false'}"]
        parts.append("<<" + " ".join(d) + ">>")
    xref = doc.get_new_xref()
    doc.update_object(xref, "[" + "".join(parts) + "]")
    doc.xref_set_key(doc.pdf_catalog(), "BSIAnnotColumns", f"{xref} 0 R")
    return xref
