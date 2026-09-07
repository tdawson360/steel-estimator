"""Sloped beams from the elevation notes on a plan (Todd, 2026-09-07).

Elevation notes sit along column lines ("B/DECK AT GRID B 17'-3 5/8"",
"B/DECK AT GRID C 17'-11 1/8"") or at a spot ("(B/ STL 10'-1")" beside a
column).  A beam whose two ends sit at different elevations of the same
kind runs on a slope: its true length is the hypotenuse of the plan length
and the rise, the polyline is drawn that long (Todd's own markups do this),
and its ends are Miter when square in plan, Profile when skewed.

Todd's choices (2026-09-07): the true length is always drawn; the end
labor changes only past 1/4 in per ft (roof drainage stays as it was); an
end with no note takes its elevation by interpolating along the member's
line between the noted grid lines it crosses; a member with no noted line
stays flat.  Kinds never mix: B/DECK compares with B/DECK, T.O.S. with
T.O.S.
"""
import math
import re

import columns

KIND_RE = re.compile(
    r"(B/\s*DECK|B\.?O\.?\s*DECK|BOT(?:TOM)?\s+OF\s+DECK|B/\s*ST(?:L|EEL)|BOT(?:TOM)?\s+OF\s+ST(?:L|EEL)"
    r"|T/\s*ST(?:L|EEL)|T\.?O\.?S\.?\b|\bTOS\b|TOP\s+OF\s+ST(?:L|EEL)|T\.?O\.?\s*DECK|T/\s*DECK|TOP\s+OF\s+DECK"
    r"|T\.?O\.?\s*(?:MEZZ|ROOF|SLAB|STRUCT)[A-Z]*|\bEL\b|\bEL\.|ELEV)", re.I)
GRID_RE = re.compile(r"(?:AT\s+)?GRID(?:\s*LINE)?S?\s+([A-Z]{1,2}(?:\.\d)?|\d{1,2}(?:\.\d)?)\b", re.I)
SLOPE_IN_PER_FT = 0.25     # steeper than this changes the end labor (Miter / Profile)
GRID_NEAR_FT = 3.0         # an end this close to a noted grid line sits on it
NOTE_NEAR_FT = 8.0         # a spot note this close to an end applies to it


def kind_of(text):
    m = KIND_RE.search(text or "")
    if not m:
        return "EL"
    k = re.sub(r"[\s./]", "", m.group(1)).upper().replace("STEEL", "STL").replace("BOTTOM", "BOT")
    k = re.sub(r"^(?:BOTOF|BO)", "B", k)
    k = re.sub(r"^(?:TOPOF|TO)(?=DECK|MEZZ|ROOF|SLAB|STRUCT|STL)", "T", k)
    return {"TSTL": "TOS", "TOS": "TOS", "BSTL": "BSTL", "BDECK": "BDECK", "TDECK": "TDECK"}.get(k, k)


class PlanElevations:
    """The elevation notes of one plan, resolved to grid axes and spots."""

    def __init__(self, page, ppf):
        self.ppf = ppf or 9.0
        self.axes = []      # (vertical, coord, kind, feet, text)
        self.points = []    # (x, y, kind, feet, text)
        notes = columns.elevation_notes(page)
        if not notes:
            return
        xs, ys = columns.grid_axes(page)
        for ft, text, x, y in notes:
            k = kind_of(text)
            m = GRID_RE.search(text)
            if m:
                g = m.group(1).upper()
                if g in xs:
                    self.axes.append((True, xs[g], k, ft, text))
                    continue
                if g in ys:
                    self.axes.append((False, ys[g], k, ft, text))
                    continue
            self.points.append((x, y, k, ft, text))

    def __bool__(self):
        return bool(self.axes or self.points)

    def at(self, pt, kind=None):
        """(feet, kind, text) of the elevation that applies at a point, or None."""
        best = None
        for vertical, c, k, ft, text in self.axes:
            if kind and k != kind:
                continue
            d = abs((pt[0] if vertical else pt[1]) - c)
            if d <= GRID_NEAR_FT * self.ppf and (best is None or d < best[0]):
                best = (d, ft, k, text)
        for x, y, k, ft, text in self.points:
            if kind and k != kind:
                continue
            d = math.hypot(x - pt[0], y - pt[1])
            if d <= NOTE_NEAR_FT * self.ppf and (best is None or d < best[0]):
                best = (d, ft, k, text)
        return best[1:] if best else None

    def along(self, a, b, kind):
        """Noted grid lines the line a->b crosses: [(station_ft from a, feet, text)]."""
        ux, uy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(ux, uy) or 1.0
        ux, uy = ux / L, uy / L
        out = []
        for vertical, c, k, ft, text in self.axes:
            if k != kind:
                continue
            comp = ux if vertical else uy
            if abs(comp) < 0.35:
                continue                     # the member runs along this grid, never across it
            s = (c - a[0]) / ux if vertical else (c - a[1]) / uy
            out.append((s / self.ppf, ft, text))
        return sorted(out)

    def kinds(self):
        return sorted({k for _, _, k, _, _ in self.axes} | {k for _, _, k, _, _ in self.points})


def _interp(stations, s):
    """Piecewise-linear elevation at station s, extrapolated from the end pairs."""
    if len(stations) == 1:
        return stations[0][1]
    if s <= stations[0][0]:
        pair = stations[0], stations[1]
    elif s >= stations[-1][0]:
        pair = stations[-2], stations[-1]
    else:
        pair = next((p, q) for p, q in zip(stations, stations[1:]) if p[0] <= s <= q[0])
    (s0, e0, _), (s1, e1, _) = pair
    return e0 if s1 == s0 else e0 + (e1 - e0) * (s - s0) / (s1 - s0)


def slope_for(seg, plan_ft, elev):
    """Slope of a measured member: {"e1", "e2", "kind", "rise", "true_ft",
    "pitch", "sloped", "how"} or None when the plan gives it no slope."""
    if not elev or not seg or len(seg) < 2 or not plan_ft or plan_ft < 1.0:
        return None
    a, b = seg[0], seg[-1]
    ea, eb = elev.at(a), elev.at(b)
    e1 = e2 = None
    how = ""
    if ea and eb and ea[1] == eb[1]:
        e1, e2, kind, how = ea[0], eb[0], ea[1], f"noted both ends ({ea[2][:24]} / {eb[2][:24]})"
    else:
        # interpolate along the member's line between the noted grid lines it crosses
        kinds = [ea[1]] if ea else ([eb[1]] if eb else elev.kinds())
        best = None
        for kind in kinds:
            st = elev.along(a, b, kind)
            if len(st) >= 2 and (best is None or len(st) > len(best[1])):
                best = (kind, st)
        if best is None:
            return None
        kind, st = best
        e1 = ea[0] if ea and ea[1] == kind else _interp(st, 0.0)
        e2 = eb[0] if eb and eb[1] == kind else _interp(st, plan_ft)
        how = f"interpolated between {st[0][2][:24]} and {st[-1][2][:24]}"
    rise = abs(e2 - e1)
    if rise < 1.0 / 24:                      # under half an inch: flat
        return None
    true_ft = math.hypot(plan_ft, rise)
    pitch = rise * 12.0 / plan_ft
    # a nominal 1/4 in/ft drainage slope measures a hair over it: 15% grace
    return {"e1": e1, "e2": e2, "kind": kind, "rise": rise, "true_ft": true_ft, "pitch": pitch,
            "sloped": pitch > SLOPE_IN_PER_FT * 1.15, "how": how}


def stretch(seg, d):
    """Move the last vertex outward along the final segment by d points so
    Revu's own [Length] reads the true length."""
    if d <= 0 or len(seg) < 2:
        return seg
    (ax, ay), (bx, by) = seg[-2], seg[-1]
    L = math.hypot(bx - ax, by - ay) or 1.0
    return list(seg[:-1]) + [(bx + (bx - ax) / L * d, by + (by - ay) / L * d)]


def feet_inches(v):
    ft = int(v)
    inch = round((v - ft) * 12, 1)
    if inch >= 12:
        ft, inch = ft + 1, 0
    return f"{ft}'-{inch:g}\""


def describe(sl, plan_ft):
    return (f"sloped: {sl['kind']} {feet_inches(sl['e1'])} -> {feet_inches(sl['e2'])}, rise {sl['rise']:.2f} ft over "
            f"{plan_ft:.1f} ft plan ({sl['pitch']:.2f} in/ft), true length {sl['true_ft']:.2f} ft; {sl['how']}")
