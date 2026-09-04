"""Member lengths from the plan's vector line work (auto-takeoff step 4).

CAD exports draw a run of framing as one continuous (often dashed, often
curved) polyline that may carry several callouts, so lengths come from
splitting drawn chains rather than from reading individual entities:

  1. Every vector path becomes ordered *chains* (dashes joined when the gap
     is short, curves sampled), each with an arc-length parameter s.
  2. A callout anchors to the nearest chain running parallel to its text, or
     to the chain under its leader arrow when it has one.
  3. The callout's member runs along the chain from its anchor until a cut:
     the chain's end, a through-crossing by a chain that is unknown or that
     carries an equal-or-heavier callout (lighter members frame in and are
     ignored), or the midpoint to the next callout on the same chain (each
     callout owns the stretch nearest it, so total feet on a run are right
     even when the drawing gives no piece breaks).
  4. Lengths are arc length / points-per-foot from the sheet's scale note.

Callouts whose only nearby line is their own leader (HSS kicker/column
labels, for instance) get no length: those come from sections.
"""
import math
import re
from dataclasses import dataclass, field

import pymupdf

SCALE_RE = re.compile(r"""(\d+(?:/\d+)?(?:\.\d+)?)\s*"\s*=\s*(\d+)'\s*-?\s*(\d+)?"?""")
PARALLEL_TOL = 8.0      # deg: callout text vs chain direction at the anchor
FALLBACK_TOL = 30.0     # deg: accepted with a note when nothing parallel is near
LATERAL_FT = 12.0       # ft: how far a label may sit from its member line
LEADER_TIP_MAX = 12.0   # pt: arrow tip to chain
CHAIN_GAP = 30.0        # pt: max gap between consecutive pieces of one path
MIN_CHAIN = 8.0         # pt
CUT_MARGIN = 3.0        # pt: ignore crossings this close to the anchor


# ── scale ─────────────────────────────────────────────────────────────

def eval_frac(s):
    if "/" in s:
        a, b = s.split("/")
        return float(a) / float(b)
    return float(s)


def sheet_scale(page):
    """Points per foot from a '1/8" = 1'-0"' style note, or None."""
    for m in SCALE_RE.finditer(page.get_text()):
        inch = eval_frac(m.group(1))
        feet = int(m.group(2)) + (int(m.group(3) or 0)) / 12.0
        if inch > 0 and feet > 0:
            return inch * 72.0 / feet
    return None


# ── chains ────────────────────────────────────────────────────────────

@dataclass
class Chain:
    pts: list                    # [(x, y), ...] ordered
    width: float
    pieces: int                  # drawn pieces joined (dashes)
    path: int
    callouts: list = field(default_factory=list)   # (s, weight, key, callout)
    cum: list = field(default_factory=list)        # cumulative s per point

    def __post_init__(self):
        s, self.cum = 0.0, [0.0]
        for (x0, y0), (x1, y1) in zip(self.pts, self.pts[1:]):
            s += math.hypot(x1 - x0, y1 - y0)
            self.cum.append(s)

    @property
    def length(self):
        return self.cum[-1]

    def segments(self):
        for i in range(len(self.pts) - 1):
            yield i, self.pts[i], self.pts[i + 1]

    def nearest(self, x, y):
        """(distance, s, direction_deg) of the nearest point on the chain."""
        best = None
        for i, (x0, y0), (x1, y1) in self.segments():
            vx, vy = x1 - x0, y1 - y0
            L2 = vx * vx + vy * vy
            if L2 == 0:
                continue
            t = max(0.0, min(1.0, ((x - x0) * vx + (y - y0) * vy) / L2))
            px, py = x0 + t * vx, y0 + t * vy
            d = math.hypot(x - px, y - py)
            if best is None or d < best[0]:
                best = (d, self.cum[i] + t * math.sqrt(L2), math.degrees(math.atan2(vy, vx)) % 180)
        return best

    def point_at(self, s):
        s = max(0.0, min(self.length, s))
        for i in range(len(self.pts) - 1):
            if self.cum[i + 1] >= s:
                seg = self.cum[i + 1] - self.cum[i] or 1.0
                f = (s - self.cum[i]) / seg
                (x0, y0), (x1, y1) = self.pts[i], self.pts[i + 1]
                return (x0 + f * (x1 - x0), y0 + f * (y1 - y0))
        return self.pts[-1]

    def slice(self, s0, s1):
        """Vertices of the chain between s0 and s1 (inclusive ends)."""
        out = [self.point_at(s0)]
        for i, s in enumerate(self.cum):
            if s0 < s < s1:
                out.append(self.pts[i])
        out.append(self.point_at(s1))
        return _simplify(out)

    def is_straight(self):
        if len(self.pts) < 3:
            return True
        (x0, y0), (x1, y1) = self.pts[0], self.pts[-1]
        L = math.hypot(x1 - x0, y1 - y0) or 1.0
        return all(abs((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) / L < 1.5 for x, y in self.pts[1:-1])


def _simplify(pts, tol=1.0):
    if len(pts) <= 2:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        (ax, ay), (bx, by), (cx, cy) = out[-1], pts[i], pts[i + 1]
        L = math.hypot(cx - ax, cy - ay) or 1.0
        if abs((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / L > tol:
            out.append(pts[i])
    out.append(pts[-1])
    return out


def _bezier(p0, p1, p2, p3, n=6):
    pts = []
    for k in range(1, n + 1):
        t = k / n
        u = 1 - t
        x = u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x
        y = u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y
        pts.append((x, y))
    return pts


def chains_from_segments(items, path_base=100000):
    """Solid chains from strokes recovered off a rasterised sheet
    (sidecar/raster.py): each item is either (x0, y0, x1, y1, width) or
    (points, width) for an already-linked polyline."""
    out = []
    for i, it in enumerate(items):
        if len(it) == 2:
            pts, w = it
        else:
            x0, y0, x1, y1, w = it
            pts = [(x0, y0), (x1, y1)]
        if len(pts) >= 2:
            ch = Chain(list(pts), w, 1, path_base + i)
            if ch.length >= MIN_CHAIN:
                out.append(ch)
    return out


def text_boxes(page):
    """Bounding boxes of every text line on the page (label gaps live here)."""
    boxes = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") == 0:
            for l in b["lines"]:
                boxes.append(pymupdf.Rect(l["bbox"]))
    return boxes


def extract_chains(page, extra_segments=None):
    chains = _raw_chains(page, extra_segments)
    return merge_collinear_chains(chains, text_boxes(page))


def _raw_chains(page, extra_segments=None):
    chains = chains_from_segments(extra_segments) if extra_segments else []
    for pid, p in enumerate(page.get_drawings()):
        w = p.get("width") or 0.0
        cur, pieces = [], 0

        def flush():
            nonlocal cur, pieces
            if len(cur) >= 2:
                c = Chain(cur, w, pieces, pid)
                if c.length >= MIN_CHAIN:
                    chains.append(c)
            cur, pieces = [], 0

        for it in p["items"]:
            if it[0] == "re":
                flush()
                r = it[1]
                cur = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]
                pieces = 1
                flush()
                continue
            if it[0] == "l":
                a, b = it[1], it[2]
                new = [(a.x, a.y), (b.x, b.y)]
            elif it[0] == "c":
                a = it[1]
                new = [(a.x, a.y)] + _bezier(it[1], it[2], it[3], it[4])
            else:
                continue
            if cur and math.hypot(new[0][0] - cur[-1][0], new[0][1] - cur[-1][1]) > CHAIN_GAP:
                flush()
            if cur and math.hypot(new[0][0] - cur[-1][0], new[0][1] - cur[-1][1]) <= 0.5:
                cur += new[1:]
            else:
                if cur:
                    pieces += 1
                    cur.append(new[0])
                    cur += new[1:]
                else:
                    cur = list(new)
                    pieces = 1
        flush()
    return chains


LABEL_GAP = 70.0        # pt: a member line broken around its own label rejoins across this


def merge_collinear_chains(chains, boxes, gap=LABEL_GAP, off_tol=1.5, ang_tol=1.0):
    """Join straight chains that lie on one line with a short gap between
    them when a text label sits in that gap (CAD breaks a member line where
    its label is placed).  Same width only; gaps without text stay gaps, so
    collinear beams in adjacent bays are not glued together."""
    def gap_has_text(ux, uy, rho, ta, tb):
        tm = (ta + tb) / 2
        mx, my = tm * ux - rho * uy, tm * uy + rho * ux
        p = pymupdf.Point(mx, my)
        return any((bx + (-4, -4, 4, 4)).contains(p) for bx in boxes)

    straight = [c for c in chains if c.is_straight()]
    other = [c for c in chains if not c.is_straight()]
    groups = {}
    for c in straight:
        (x0, y0), (x1, y1) = c.pts[0], c.pts[-1]
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180
        ux, uy = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        rho = -uy * x0 + ux * y0
        key = (round(ang / ang_tol) % round(180 / ang_tol), round(rho / off_tol), round(c.width, 1))
        t0, t1 = x0 * ux + y0 * uy, x1 * ux + y1 * uy
        groups.setdefault(key, []).append((min(t0, t1), max(t0, t1), ux, uy, rho, c))
    merged = []
    for items in groups.values():
        items.sort(key=lambda it: it[0])
        cur = None
        for t0, t1, ux, uy, rho, c in items:
            if cur and t0 - cur[1] <= gap and (t0 - cur[1] <= 2 or gap_has_text(ux, uy, rho, cur[1], t0)):
                cur[1] = max(cur[1], t1)
                cur[5].append(c)
            else:
                if cur:
                    merged.append(cur)
                cur = [t0, t1, ux, uy, rho, [c]]
        if cur:
            merged.append(cur)
    out = list(other)
    for t0, t1, ux, uy, rho, members in merged:
        if len(members) == 1:
            out.append(members[0])
            continue
        p0 = (t0 * ux - rho * uy, t0 * uy + rho * ux)
        p1 = (t1 * ux - rho * uy, t1 * uy + rho * ux)
        out.append(Chain([p0, p1], members[0].width, sum(m.pieces for m in members), members[0].path))
    return out


# ── leaders ───────────────────────────────────────────────────────────

def arrowheads(paths):
    tips = []
    for p in paths:
        if p.get("fill") is None:
            continue
        r = p["rect"]
        if r.width <= 14 and r.height <= 14 and 2 <= sum(1 for it in p["items"] if it[0] == "l") <= 4:
            tips.append(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
    return tips


def leader_tip(bbox, tips, paths):
    """Arrow tip of a leader that starts at the callout text, or None."""
    box = pymupdf.Rect(bbox) + (-45, -14, 45, 14)      # shoulder ends beside the text
    for p in paths:
        segs = [it for it in p["items"] if it[0] == "l"]
        if not 1 <= len(segs) <= 3 or p.get("fill") is not None:
            continue
        total = sum(math.hypot(s[2].x - s[1].x, s[2].y - s[1].y) for s in segs)
        if not 15 <= total <= 250:
            continue
        ends = [pt for s in segs for pt in (s[1], s[2])]     # segments need not be in drawing order
        if not any(box.contains(pt) for pt in ends):
            continue
        for pt in ends:
            if box.contains(pt):
                continue
            if any(math.hypot(pt.x - tx, pt.y - ty) <= 8 for tx, ty in tips):
                return (pt.x, pt.y)
    return None


def looks_like_leader(chain, bbox):
    """A single straight solid piece that starts at the text and is short."""
    if chain.pieces != 1 or chain.length > 200 or not chain.is_straight():
        return False
    box = pymupdf.Rect(bbox) + (-8, -8, 8, 8)
    return box.contains(pymupdf.Point(*chain.pts[0])) or box.contains(pymupdf.Point(*chain.pts[-1]))


# ── anchoring ─────────────────────────────────────────────────────────

def anchor_chain(chains, pt, angle, max_lateral, bbox=None, skip=frozenset()):
    """Nearest chain to pt running parallel to angle: (chain, s, dist, note).
    Solid strokes win over dashed ones at equal distance (dashed is usually
    existing or hidden work).  Falls back to the nearest multi-piece chain of
    any direction (curved edges, labels aligned to the curve)."""
    best, fallback = None, None
    for ch in chains:
        if id(ch) in skip or (bbox is not None and looks_like_leader(ch, bbox)):
            continue
        n = ch.nearest(*pt)
        if n is None or n[0] > max_lateral:
            continue
        d, s, direction = n
        # member lines are drawn heavier than grid, dimension and hidden work
        thin = 30 if ch.width < 0.5 else 0
        score = d + thin + (15 if ch.width > 2.5 else 0) + (40 if ch.pieces > 1 else 0)
        if angle is not None:
            da = abs(direction - (angle % 180))
            da = min(da, 180 - da)
            if da > PARALLEL_TOL:
                if da <= FALLBACK_TOL and ch.pieces > 1 and (fallback is None or score < fallback[0]):
                    fallback = (score, ch, s, d)
                continue
        if best is None or score < best[0]:
            best = (score, ch, s, d)
    if best:
        return best[1], best[2], best[3], ""
    if fallback:
        return fallback[1], fallback[2], fallback[3], "line not parallel to label"
    return None, None, None, "no member line near callout"


# ── crossings ─────────────────────────────────────────────────────────

def _seg_x(a0, a1, b0, b1):
    """Intersection params (ta, tb) of segments a and b, or None."""
    ax, ay = a1[0] - a0[0], a1[1] - a0[1]
    bx, by = b1[0] - b0[0], b1[1] - b0[1]
    den = ax * by - ay * bx
    if abs(den) < 1e-9:
        return None
    dx, dy = b0[0] - a0[0], b0[1] - a0[1]
    ta = (dx * by - dy * bx) / den
    tb = (dx * ay - dy * ax) / den
    return ta, tb


def crossings(chain, chains):
    """[(s, other, through)] for every chain meeting this one."""
    out = []
    bx0 = min(x for x, _ in chain.pts) - 6
    bx1 = max(x for x, _ in chain.pts) + 6
    by0 = min(y for _, y in chain.pts) - 6
    by1 = max(y for _, y in chain.pts) + 6
    for o in chains:
        if o is chain:
            continue
        if max(x for x, _ in o.pts) < bx0 or min(x for x, _ in o.pts) > bx1:
            continue
        if max(y for _, y in o.pts) < by0 or min(y for _, y in o.pts) > by1:
            continue
        for i, a0, a1 in chain.segments():
            La = math.hypot(a1[0] - a0[0], a1[1] - a0[1])
            if La == 0:
                continue
            for j, b0, b1 in o.segments():
                r = _seg_x(a0, a1, b0, b1)
                if r is None:
                    continue
                ta, tb = r
                Lb = math.hypot(b1[0] - b0[0], b1[1] - b0[1])
                if ta < -6 / La or ta > 1 + 6 / La:
                    continue
                if tb < -6 / Lb or tb > 1 + 6 / Lb:
                    continue
                s = chain.cum[i] + max(0.0, min(1.0, ta)) * La
                # how far the other chain extends past this point, either side
                sb = o.cum[j] + max(0.0, min(1.0, tb)) * Lb
                through = sb - o.cum[0] > 4 and o.length - sb > 4
                out.append((s, o, through, sb))
    out.sort(key=lambda c: c[0])
    return out


def local_weight(chain, s, reach):
    """Heaviest callout on the chain within `reach` points of s, or None."""
    ws = [w for cs, w, _, _ in chain.callouts if abs(cs - s) <= reach]
    return max(ws) if ws else None


def own_weight_cuts(chain, s_anchor, xs, own_weight, reach, page_dim=None):
    """A through-crossing cuts the member when the crossing line is, at that
    point, an equal-or-heavier member, or an unlabelled drawn (multi-piece)
    line.  Lighter members frame in; plain single strokes (grid, dimension,
    wall lines) are ignored, as are sheet-spanning lines (grids) and lines
    drawn much thinner than the member itself."""
    lo, hi = 0.0, chain.length
    for s, other, through, sb in xs:
        if not through:
            continue
        if page_dim and other.length > 0.6 * page_dim:
            continue                                   # grid / section line
        w = local_weight(other, sb, reach)
        if w is None:
            if other.pieces < 2:
                continue
            if chain.width > 0 and other.width < 0.5 * chain.width:
                continue                               # hidden/grid work, not a member
        elif w < own_weight - 1e-6:
            continue
        if s < s_anchor - CUT_MARGIN:
            lo = max(lo, s)
        elif s > s_anchor + CUT_MARGIN:
            hi = min(hi, s)
    return lo, hi


# ── main entry ────────────────────────────────────────────────────────

def measure(page, callouts, weights, ppf, extra_segments=None):
    """Attach chain/extent/length to each callout dict (in place).

    callouts: dicts with bbox, angle (deg, y-up as page_callouts gives), key.
    extra_segments: (x0, y0, x1, y1, width) strokes recovered from raster
    tiles, treated as solid drawn lines alongside the vector paths.
    Sets c['length_ft'], c['seg'] (vertex list), c['len_note'], c['anchor']."""
    paths = page.get_drawings()
    chains = extract_chains(page, extra_segments)
    tips = arrowheads(paths)
    lateral_max = LATERAL_FT * ppf if ppf else 100.0
    # any short single stroke ending at an arrowhead is a leader, never a member
    leaders = frozenset(id(ch) for ch in chains if ch.pieces == 1 and ch.length <= 250 and any(
        math.hypot(px - tx, py - ty) <= 8 for px, py in (ch.pts[0], ch.pts[-1]) for tx, ty in tips))
    for c in callouts:
        bb = pymupdf.Rect(c["bbox"])
        tip = leader_tip(bb, tips, paths)
        if tip:
            c["anchor"], c["anchor_pt"] = "leader", tip
            ch, s, d, note = anchor_chain(chains, tip, None, LEADER_TIP_MAX, bb, leaders)
        else:
            centre = ((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2)
            c["anchor"], c["anchor_pt"] = "text", centre
            ch, s, d, note = anchor_chain(chains, centre, -c["angle"], lateral_max, bb, leaders)
        # HSS labels on a plan are usually columns or kickers seen end-on:
        # only trust a drawn line that is parallel and right beside the text.
        if str(c.get("key", "")).upper().startswith("HSS") and \
                (ch is None or note or d > 4 * (ppf or 9) or ch.pieces < 2):
            ch, s, d, note = None, None, None, "HSS: length from sections, not plan"
        c["chain"], c["s"], c["lateral"], c["anchor_note"] = ch, s, d, note
        if ch is not None:
            ch.callouts.append((s, weights.get(c.get("key"), 0.0), c.get("key"), c))
    xcache = {}
    reach = 30 * (ppf or 9)
    for c in callouts:
        ch = c["chain"]
        c["length_ft"], c["seg"], c["len_note"] = None, None, c["anchor_note"]
        if ch is None:
            continue
        if id(ch) not in xcache:
            xcache[id(ch)] = crossings(ch, chains)
        lo, hi = own_weight_cuts(ch, c["s"], xcache[id(ch)], weights.get(c.get("key"), 0.0), reach,
                                 page_dim=min(page.rect.width, page.rect.height))
        c["cuts"] = (lo, hi, [(round(s), round(o.length), o.pieces, thr, local_weight(o, sb, reach)) for s, o, thr, sb in xcache[id(ch)] if abs(s - c["s"]) < 300])
        # each callout owns the stretch nearest it
        for s_other, _, _, other in ch.callouts:
            if other is c:
                continue
            mid = (s_other + c["s"]) / 2
            if s_other < c["s"]:
                lo = max(lo, mid)
            else:
                hi = min(hi, mid)
        if hi - lo < 1:
            c["len_note"] = "zero-length extent"
            continue
        c["seg"] = ch.slice(lo, hi)
        if not ppf:
            c["len_note"] = "no sheet scale found"
            continue
        c["length_ft"] = (hi - lo) / ppf
        # Confidence gate: only a clean, close, parallel, sane, unshared line
        # becomes a drawn polyline; anything else stays count-only with the
        # draft length in its note, so the estimator never deletes a bad line.
        doubts = [c["anchor_note"]] if c["anchor_note"] else []
        if c["lateral"] > 6 * ppf and c["anchor"] == "text":
            doubts.append(f"label {c['lateral'] / ppf:.0f} ft from line")
        if c["anchor"] == "leader" and ch.pieces > 1:
            doubts.append("arrow lands on a dashed line, member itself probably raster")
        if c["length_ft"] < 2:
            doubts.append("under 2 ft")
        elif c["length_ft"] > 60:
            doubts.append("over 60 ft")
        for s_other, _, k_other, other in ch.callouts:
            if other is not c and k_other != c.get("key") and abs(s_other - c["s"]) <= 40 * ppf:
                doubts.append(f"line shared with {k_other}")
                break
        c["confident"] = not doubts
        c["len_note"] = "; ".join(doubts)
    return callouts
