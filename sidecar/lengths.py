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
import collections
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


def scale_notes(page):
    """[(x, y, ppf)] for every scale note on the page (y-down page points)."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            s = "".join(sp["text"] for sp in l["spans"])
            for m in SCALE_RE.finditer(s):
                inch = eval_frac(m.group(1))
                feet = int(m.group(2)) + (int(m.group(3) or 0)) / 12.0
                if inch > 0 and feet > 0:
                    x0, y0, x1, y1 = l["bbox"]
                    out.append(((x0 + x1) / 2, (y0 + y1) / 2, inch * 72.0 / feet))
    return out


def drawing_clusters(page, gap=24.0, min_size=120.0):
    """Bounding boxes of the separate drawings on a sheet: vector paths
    grouped by proximity (a plan is one big connected cluster of linework,
    each detail its own).  Text is ignored so labels never bridge drawings."""
    rects = [p["rect"] for p in page.get_drawings() if p["rect"].width + p["rect"].height > 2]
    # coarse grid union-find
    cell = gap
    parent = list(range(len(rects)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    grid = {}
    for i, r in enumerate(rects):
        for gx in range(int(r.x0 // cell), int(r.x1 // cell) + 1):
            for gy in range(int(r.y0 // cell), int(r.y1 // cell) + 1):
                grid.setdefault((gx, gy), []).append(i)
    for members in grid.values():
        first = members[0]
        for j in members[1:]:
            a, b = find(first), find(j)
            if a != b:
                parent[b] = a
    boxes = {}
    for i, r in enumerate(rects):
        root = find(i)
        boxes[root] = boxes[root] | r if root in boxes else pymupdf.Rect(r)
    # the title block / border frame spans the sheet: drop clusters that are nearly the page
    W, H = page.rect.width, page.rect.height
    out = [b for b in boxes.values() if b.width >= min_size and b.height >= min_size
           and not (b.width > 0.9 * W and b.height > 0.9 * H)]
    out.sort(key=lambda b: -b.get_area())
    return out


def scale_regions(page):
    """Drawing regions and their scales, the way an estimator sets Bluebeam
    scaling windows: one window per drawing.  Each cluster of linework takes
    the scale note nearest below it (scale notes sit under drawing titles);
    a sheet with a single scale note gets one window over the whole page.
    Returns [(Rect, ppf)] largest first, in page (y-down) coordinates."""
    r = page.rect
    notes = scale_notes(page)
    if not notes:
        return []
    if len({round(n[2], 3) for n in notes}) == 1:
        return [(pymupdf.Rect(r), notes[0][2])]
    regions = []
    for box in drawing_clusters(page):
        best = None
        for x, y, ppf in notes:
            below = y - box.y1
            inside_x = box.x0 - 40 <= x <= box.x1 + 40
            if -20 <= below <= 220 and inside_x:
                d = below + (0 if box.x0 <= x <= box.x1 else 100)
            else:
                d = math.hypot(max(box.x0 - x, 0, x - box.x1), max(box.y0 - y, 0, y - box.y1)) + 500
            if best is None or d < best[0]:
                best = (d, ppf)
        regions.append((box, best[1]))
    return regions


def region_for(regions, pt):
    """Smallest region containing pt (details nest inside nothing, but a
    detail box can overlap a plan box), else the nearest region."""
    p = pymupdf.Point(*pt)
    inside = [(rect.get_area(), rect, ppf) for rect, ppf in regions if rect.contains(p)]
    if inside:
        _, rect, ppf = min(inside, key=lambda t: t[0])
        return rect, ppf
    if not regions:
        return None, None
    return min(regions, key=lambda rp: math.hypot(max(rp[0].x0 - p.x, 0, p.x - rp[0].x1), max(rp[0].y0 - p.y, 0, p.y - rp[0].y1)))


# ── chains ────────────────────────────────────────────────────────────

@dataclass
class Chain:
    pts: list                    # [(x, y), ...] ordered
    width: float
    pieces: int                  # drawn pieces joined (dashes)
    path: int
    callouts: list = field(default_factory=list)   # (s, weight, key, callout)
    cum: list = field(default_factory=list)        # cumulative s per point
    last_snap: object = None                       # (priority, chain, s) of the last snap_end hit

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

    def is_closed(self):
        (x0, y0), (x1, y1) = self.pts[0], self.pts[-1]
        return len(self.pts) > 2 and math.hypot(x1 - x0, y1 - y0) < 2.0

    def is_straight(self):
        if len(self.pts) < 3:
            return True
        (x0, y0), (x1, y1) = self.pts[0], self.pts[-1]
        L = math.hypot(x1 - x0, y1 - y0) or 1.0
        return all(abs((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) / L < 1.5 for x, y in self.pts[1:-1])


def _extend_pts(pts, chain, s_old, s_new, at_start):
    """Move the first/last vertex of a sliced polyline along the chain's end
    tangent to parameter s_new, which may lie beyond the drawn chain."""
    if at_start:
        a, b = chain.pts[1], chain.pts[0]
    else:
        a, b = chain.pts[-2], chain.pts[-1]
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
    u = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
    d = abs(s_new - s_old)
    end = pts[0] if at_start else pts[-1]
    new = (end[0] + u[0] * d, end[1] + u[1] * d)
    return [new] + pts[1:] if at_start else pts[:-1] + [new]


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


LABEL_GAP = 130.0       # pt: a member line broken around a label (its own, or a crossing member's) rejoins across this


def merge_collinear_chains(chains, boxes, gap=LABEL_GAP, off_tol=1.5, ang_tol=1.0):
    """Join straight chains that lie on one line with a short gap between
    them when text sits in that gap (CAD breaks a member line where a label
    is placed: the member's own, or a perpendicular member's label running
    across it).  Same width only; gaps without text stay gaps, so collinear
    beams in adjacent bays are not glued together."""
    def gap_has_text(ux, uy, rho, ta, tb):
        # sample along the gap: a long gap may hold the label near one end
        for f in (0.2, 0.35, 0.5, 0.65, 0.8):
            t = ta + (tb - ta) * f
            p = pymupdf.Point(t * ux - rho * uy, t * uy + rho * ux)
            if any((bx + (-4, -4, 4, 4)).contains(p) for bx in boxes):
                return True
        return False

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

def member_width(chains, callouts):
    """Typical stroke width of labelled member lines on this sheet: the
    median width of the nearest line under each label (labels sit on or
    right beside their member).  Thin is judged relative to this, so a
    sheet drawn entirely in 0.36 pt lines has nothing 'thin'."""
    ws = []
    for c in callouts:
        bb = pymupdf.Rect(c["bbox"])
        pt = ((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2)
        best = None
        for ch in chains:
            if ch.width == 0 or ch.is_closed():
                continue
            n = ch.nearest(*pt)
            if n and n[0] <= 15 and (best is None or n[0] < best[0]):
                best = (n[0], ch.width)
        if best:
            ws.append(best[1])
    if not ws:
        return 0.0
    ws.sort()
    return ws[len(ws) // 2]


def anchor_chain(chains, pt, angle, max_lateral, bbox=None, skip=frozenset(), thin_below=0.5):
    """Nearest chain to pt running parallel to angle: (chain, s, dist, note).
    Solid strokes win over dashed ones at equal distance (dashed is usually
    existing or hidden work).  Falls back to the nearest multi-piece chain of
    any direction (curved edges, labels aligned to the curve)."""
    best, fallback, second = None, None, None
    for ch in chains:
        if id(ch) in skip or ch.width == 0 or ch.is_closed():
            continue                        # leaders, fills, symbols, column/opening outlines
        n = ch.nearest(*pt)
        if n is None or n[0] > max_lateral:
            continue
        d, s, direction = n
        parallel = angle is not None and min(abs(direction - (angle % 180)), 180 - abs(direction - (angle % 180))) <= PARALLEL_TOL
        member_like = parallel and ch.length >= 27 and ch.width >= thin_below       # >= 3 ft at 1/8", member weight
        if bbox is not None and not member_like and looks_like_leader(ch, bbox):
            continue                        # a leader / shoulder ending at the text, not a member beside it
        # member lines are drawn heavier than grid, dimension and hidden work
        thin = 30 if ch.width < thin_below else 0
        if thin and angle is None:
            continue                        # a leader arrow never points at grid work
        score = d + thin + (15 if ch.width > 2.5 else 0) + (40 if ch.pieces > 1 else 0)
        if angle is not None:
            da = abs(direction - (angle % 180))
            da = min(da, 180 - da)
            if da > PARALLEL_TOL:
                if da <= FALLBACK_TOL and ch.pieces > 1 and (fallback is None or score < fallback[0]):
                    fallback = (score, ch, s, d)
                continue
        if best is None or score < best[0]:
            if best is not None and (second is None or best[0] < second[0]):
                second = best
            best = (score, ch, s, d)
        elif second is None or score < second[0]:
            second = (score, ch, s, d)
    if best and second and second[0] - best[0] <= 6 and second[1].length >= 3 * best[1].length:
        best, second = second, best        # a doubled stub beside the real member line
    if best:
        return best[1], best[2], best[3], "", second
    if fallback:
        return fallback[1], fallback[2], fallback[3], "line not parallel to label", None
    return None, None, None, "no member line near callout", None


MOVE_MAX = 40.0     # pt: a label only moves to a second-best line that scored within this


def _move(c, sec, weights, note):
    old = c["chain"]
    old.callouts = [t for t in old.callouts if t[3] is not c]
    c["chain"], c["s"], c["lateral"] = sec[1], sec[2], sec[3]
    c["second"], c["moved"] = None, True
    c["anchor_note"] = "; ".join(n for n in (c["anchor_note"], note) if n)
    sec[1].callouts.append((sec[2], weights.get(c.get("key"), 0.0), c.get("key"), c))


def _detach(c, note):
    old = c["chain"]
    old.callouts = [t for t in old.callouts if t[3] is not c]
    c["rode"], c["rode_s"] = old, c["s"]
    c["chain"], c["s"], c["second"], c["moved"] = None, None, None, True
    c["anchor_note"] = "; ".join(n for n in (c["anchor_note"], note) if n)


def resolve_conflicts(callouts, weights, ppf, near_ft=3.0):
    """Labels that landed on the wrong line.

    1. A label much lighter than the heaviest label on its line is an
       attachment or a neighbour (kicker angle beside a girder, joist label
       beside a beam that replaced a joist): it moves to its second-best
       line if that scored nearly as well, otherwise it becomes count-only
       rather than claiming a stretch of the heavy member.
    2. Two labels of different sizes within a few feet of each other on one
       line: whichever has the better second choice moves there."""
    for _ in range(3):
        moved = False
        by_chain = {}
        for c in callouts:
            if c.get("chain") is not None:
                by_chain.setdefault(id(c["chain"]), []).append(c)
        for group in by_chain.values():
            ws = [weights.get(c.get("key"), 0.0) for c in group]
            heaviest = max(ws) if ws else 0.0
            if heaviest > 0 and len(group) > 1:
                for c, w in zip(group, ws):
                    if c.get("moved") or w >= 0.5 * heaviest:
                        continue
                    sec = c.get("second")
                    if sec and sec[0] - c["lateral"] <= MOVE_MAX and sec[1].length >= 2 * ppf:
                        _move(c, sec, weights, "moved off a heavier member's line")
                    else:
                        _detach(c, f"label sits on a heavier member's line ({max(group, key=lambda g: weights.get(g.get('key'), 0.0)).get('key')}): attachment, count only")
                    moved = True
                if moved:
                    continue
            group.sort(key=lambda c: c["s"])
            for a, b in zip(group, group[1:]):
                if a.get("key") == b.get("key") or abs(a["s"] - b["s"]) > near_ft * ppf:
                    continue
                if a.get("moved") or b.get("moved"):
                    continue
                cands = [(c["second"][0] - c["lateral"], c, c["second"]) for c in (a, b)
                         if c.get("second") and c["second"][0] - c["lateral"] <= MOVE_MAX
                         and c["second"][1].length >= 2 * ppf]
                if not cands:
                    continue
                cost, c, sec = min(cands, key=lambda t: t[0])
                _move(c, sec, weights, "moved off a line another size had claimed")
                moved = True
        if not moved:
            break


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


EXTEND_FT = 6.0     # ft: how far a free member end may reach out to the line it frames into
MIN_CUTTER = 90.0   # pt at 1/8" scale (10 ft): an unlabelled stroke shorter than this cannot cut a member


def ray_hits(p, u, reach, chains, exclude):
    """Chains crossed by the segment p -> p + u*reach: [(dist, other, s_on_other)]."""
    q = (p[0] + u[0] * reach, p[1] + u[1] * reach)
    x0, x1 = sorted((p[0], q[0]))
    y0, y1 = sorted((p[1], q[1]))
    out = []
    for o in chains:
        if o is exclude:
            continue
        if max(x for x, _ in o.pts) < x0 - 1 or min(x for x, _ in o.pts) > x1 + 1:
            continue
        if max(y for _, y in o.pts) < y0 - 1 or min(y for _, y in o.pts) > y1 + 1:
            continue
        for j, b0, b1 in o.segments():
            r = _seg_x(p, q, b0, b1)
            if r is None:
                continue
            ta, tb = r
            if not (0.0 <= ta <= 1.0 and -0.02 <= tb <= 1.02):
                continue
            Lb = math.hypot(b1[0] - b0[0], b1[1] - b0[1])
            out.append((ta * reach, o, o.cum[j] + max(0.0, min(1.0, tb)) * Lb))
    out.sort(key=lambda h: h[0])
    return out


def snap_end(chain, s_end, outward, chains, own_weight, reach_label, extend, page_dim):
    """Where an estimator would end this member: the nearest line it frames
    into, found by extending the member's own line past the drawn end.
    Priority: equal-or-heavier labelled member, then a sheet-spanning grid
    line, then any unlabelled drawn line; lighter members are ignored.
    Returns the new s (may equal s_end)."""
    if len(chain.pts) < 2:
        return s_end
    p = chain.point_at(s_end)
    a, b = (chain.pts[-2], chain.pts[-1]) if outward > 0 else (chain.pts[1], chain.pts[0])
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
    u = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
    best = None                                       # (priority, dist, other, sb)
    for dist, other, sb in ray_hits(p, u, extend, chains, chain):
        if dist < 0.5:
            continue
        w = local_weight(other, sb, reach_label)
        if w is not None:
            if w < own_weight - 1e-6:
                continue
            pri = 0
        elif page_dim and other.length > 0.6 * page_dim:
            pri = 1
        elif other.pieces > 1 or other.width >= 0.5 * max(chain.width, 0.01):
            pri = 2
        else:
            continue
        if best is None or (pri, dist) < best[:2]:
            best = (pri, dist, other, sb)
    chain.last_snap = None if best is None else (best[0], best[2], best[3])
    if best is None:
        return s_end
    return s_end + best[1] if outward > 0 else s_end - best[1]


def end_target(other, sb, reach, page_dim, pri=None):
    """What a member end lands on: {"kind": member|grid|line, "key": ...}."""
    if other is None:
        return {"kind": "free"}
    if other.callouts:
        near = min(other.callouts, key=lambda t: abs(t[0] - sb))
        if abs(near[0] - sb) <= reach:
            return {"kind": "member", "key": near[2]}
    if page_dim and other.length > 0.6 * page_dim:
        return {"kind": "grid"}
    return {"kind": "line"}


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
            if other.length < max(MIN_CUTTER * (page_dim / 240 if page_dim else 9), 0.3 * chain.length):
                continue                               # short attachment (curb angle, opening frame), not a support
        elif w < own_weight - 1e-6:
            continue
        if s < s_anchor - CUT_MARGIN:
            lo = max(lo, s)
        elif s > s_anchor + CUT_MARGIN:
            hi = min(hi, s)
    return lo, hi


# ── main entry ────────────────────────────────────────────────────────

def measure(page, callouts, weights, ppf, extra_segments=None, chains=None):
    """Attach chain/extent/length to each callout dict (in place).

    callouts: dicts with bbox, angle (deg, y-up as page_callouts gives), key.
    extra_segments: (x0, y0, x1, y1, width) strokes recovered from raster
    tiles, treated as solid drawn lines alongside the vector paths.
    chains: prebuilt extract_chains() output (shared across scale regions
    and with typ_instances); built here when not given.
    Sets c['length_ft'], c['seg'] (vertex list), c['len_note'], c['anchor']."""
    paths = page.get_drawings()
    if chains is None:
        chains = extract_chains(page, extra_segments)
    tips = arrowheads(paths)
    lateral_max = LATERAL_FT * ppf if ppf else 100.0
    # any short single stroke ending at an arrowhead is a leader, never a member
    leaders = frozenset(id(ch) for ch in chains if ch.pieces == 1 and ch.length <= 250 and any(
        math.hypot(px - tx, py - ty) <= 8 for px, py in (ch.pts[0], ch.pts[-1]) for tx, ty in tips))
    thin_below = 0.5 * member_width(chains, callouts)
    for c in callouts:
        bb = pymupdf.Rect(c["bbox"])
        tip = leader_tip(bb, tips, paths)
        ch = None
        if tip:
            c["anchor"], c["anchor_pt"] = "leader", tip
            ch, s, d, note, second = anchor_chain(chains, tip, None, LEADER_TIP_MAX, bb, leaders, thin_below)
        if ch is None:                       # no leader, or the arrow we found was not ours
            centre = ((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2)
            c["anchor"], c["anchor_pt"] = "text", centre
            ch, s, d, note, second = anchor_chain(chains, centre, -c["angle"], lateral_max, bb, leaders, thin_below)
        # HSS labels on a plan are usually columns or kickers seen end-on:
        # only trust a drawn line that is parallel and right beside the text.
        # HSS labels with a leader at an angle are columns or kickers seen
        # end-on (length from sections); HSS labelled along a drawn line are
        # beams and measure like any other member.
        if str(c.get("key", "")).upper().startswith("HSS") and \
                (ch is None or note or d > 3 * (ppf or 9)):
            ch, s, d, note = None, None, None, "HSS: length from sections, not plan"
        c["chain"], c["s"], c["lateral"], c["anchor_note"] = ch, s, d, note
        c["second"] = second
        if ch is not None:
            ch.callouts.append((s, weights.get(c.get("key"), 0.0), c.get("key"), c))
    resolve_conflicts(callouts, weights, ppf or 9)
    _extents(page, callouts, chains, weights, ppf)
    _riders(callouts, weights, ppf or 9)
    _z_axis(callouts, tips, paths, ppf)
    return callouts


Z_AXIS_DEG = 45.0   # members standing up out of the plan are drawn at this angle from their origin
# an explicit length in a label: "HSS4x4x1/4 x 6'-0\"", "6'-0\" LONG", "6'-0\" LG."
EXPLICIT_LEN_RE = re.compile(r"""(?:[xX]\s*|\bLENGTH\s*=?\s*)(\d{1,3})'\s*-?\s*(\d{1,2})?(?:\s+(\d)/(\d{1,2}))?\s*(?:"|'')?(?![\dx])|(\d{1,3})'\s*-?\s*(\d{1,2})?(?:\s+(\d)/(\d{1,2}))?\s*(?:"|'')?\s*(?:LONG|LG\b)""", re.I)


def explicit_length(text):
    """Feet from an explicit length written in a label, or None."""
    for m in EXPLICIT_LEN_RE.finditer(text or ""):
        g = m.groups()
        ft, inch, num, den = (g[0], g[1], g[2], g[3]) if g[0] else (g[4], g[5], g[6], g[7])
        val = int(ft) + (int(inch) if inch else 0) / 12 + ((int(num) / int(den)) if num else 0) / 12
        if 0.5 <= val <= 80:
            return val
    return None


def z_axis_seg(origin, ft, ppf):
    """Polyline from origin at 45 degrees, ft long (Todd's z-axis convention)."""
    a = math.radians(Z_AXIS_DEG)
    x, y = origin
    return [(x, y), (x + ft * ppf * math.cos(a), y - ft * ppf * math.sin(a))]


def _z_axis(callouts, tips, paths, ppf):
    """Kickers, posts, braces, hangers and struts stand out of the plan: their
    plan line is not their length.  When the label states the length, draw it
    from the label's leader tip (else the text) at 45 degrees; otherwise the
    member stays count-only and says where its length lives."""
    if not ppf:
        return
    for c in callouts:
        text = c.get("line", "")
        if not VERTICAL_RE.search(text) or c.get("column"):
            continue
        ft = explicit_length(text.replace(c.get("raw", ""), " ", 1))
        bb = pymupdf.Rect(c["bbox"])
        tip = leader_tip(bb, tips, paths)
        origin = tip if tip else ((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2)
        if c.get("chain") is not None:
            c["chain"].callouts = [t for t in c["chain"].callouts if t[3] is not c]
            c["chain"] = None
        c["anchor"], c["anchor_pt"], c["z_axis"] = "z-axis", origin, True
        if ft:
            c["length_ft"], c["seg"], c["confident"] = ft, z_axis_seg(origin, ft, ppf), True
            c["len_note"] = f"z-axis member: {ft:.2f} ft from the label, drawn at 45 degrees"
        else:
            c["length_ft"], c["seg"], c["confident"] = None, None, False
            c["len_note"] = "z-axis member (kicker/post/brace): length from the section, not the plan"


RIDER_FAMS = ("HSS", "L", "C", "MC", "WT")


def _riders(callouts, weights, ppf):
    """A light member labelled right on a heavier member's line, with no
    line of its own, runs with that member: HSS collectors sitting on a
    beam, angles bolted along a girder.  It takes the same stretch the
    heavier label measured.  Joists never ride (a joist label beside a beam
    is a neighbour, not an attachment)."""
    for c in callouts:
        old = c.get("rode")
        if old is None or c.get("chain") is not None or c.get("length_ft"):
            continue
        if str(c.get("fam", "")).upper() not in RIDER_FAMS or VERTICAL_RE.search(c.get("line", "")):
            continue
        if c.get("lateral") is None or c["lateral"] > 1.5 * ppf:
            continue
        heavy = [(abs(s - c["rode_s"]), o) for s, _, _, o in old.callouts if o is not c and o.get("seg")]
        if not heavy:
            continue
        _, o = min(heavy, key=lambda t: t[0])
        c["seg"], c["length_ft"], c["confident"] = list(o["seg"]), o["length_ft"], bool(o.get("confident"))
        c["rider_of"] = o.get("key")
        c["len_note"] = f"rides on {o.get('key')}: same stretch"


TYP_RE = re.compile(r"\bTYP(?:ICAL)?\b", re.I)
TYP_REACH_FT = 60.0     # ft: how far a typical label's rule carries
TYP_RATIO = (0.4, 2.5)  # an instance's drawn length relative to the labelled one
TYP_MAX_PPF = 50.0      # pt/ft: 1/2" = 1'-0" and coarser is a plan; finer is a detail
BAY_REACH_FT = 30.0     # ft: a bay-typical joist/beam stays this close to its labelled twin
# members standing up or leaning out of the plan: their plan line is not their length
VERTICAL_RE = re.compile(r"\b(COL(?:UMN|S|\.)?|POST|KICKER|BRACE|BRACING|HANGER|STRUT)\b", re.I)
# a legend line that names a tag drawn at every instance: DESIGNATED AS "J.S."
TAG_RE = re.compile(r'(?:DESIGNATED|MARKED|NOTED|LABELED|LABELLED|SHOWN)\s+AS\s+"([^"]{1,8})"', re.I)


def mode_width(chains):
    """The sheet's hairline: the most common stroke width among open chains."""
    ws = collections.Counter(round(c.width, 2) for c in chains if c.width > 0 and not c.is_closed() and c.length >= 9)
    return ws.most_common(1)[0][0] if ws else 0.0


def typ_instances(page, callouts, weights, ppf, chains, all_callouts=None):
    """Members drawn but never labelled because one label says TYP.

    Drafters draw every curb angle, kicker and lintel but label one of them
    "L6x6x1/2 TYP".  Line weight is the drafter's own signature for a member
    class, so every unlabelled single stroke of member weight that matches
    the labelled member's weight and rough length, within reach of the
    label, is an instance of it.  Returns new measured callout dicts (with
    'typ_from' pointing at the label) — nothing is written in place."""
    if not ppf or ppf >= TYP_MAX_PPF:
        return []                            # details and sections: never propagate there
    # thin is judged against every label on the sheet, not just this scale
    # region, and the sheet's hairline never counts as member weight
    thin_below = max(0.5 * member_width(chains, all_callouts or callouts), mode_width(chains) + 0.01)
    # only a label sitting on a member-weight line carries a rule; a TYP
    # label on hairline work (a chord inside a truss detail) proves nothing
    labels = [c for c in callouts if c.get("chain") is not None and c.get("length_ft")
              and c["chain"].width >= thin_below and TYP_RE.search(c.get("line", ""))
              and not VERTICAL_RE.search(c.get("line", ""))]
    # bay-typical: a joist or beam labelled once in a bay of identical
    # unlabelled strokes (Veterans "30K7" x4 labels for 15 joists, W5x19 x6
    # for 58 posts).  No TYP word needed, but the match is strict: parallel,
    # same weight, same length within 8%, within 30 ft.
    # (joists only: beams have too many look-alike strokes on a busy plan;
    # IAH100 lost 6 points when W beams were allowed to spawn twins)
    bay = [c for c in callouts if c.get("chain") is not None and c.get("length_ft")
           and c["chain"].width >= thin_below and str(c.get("fam", "")).upper() == "JOIST"]
    if not labels and not bay:
        return []
    page_dim = min(page.rect.width, page.rect.height)
    taken = [c["chain"] for c in callouts if c.get("chain") is not None]
    out = []
    for ch in chains:
        if ch.callouts or ch.is_closed() or ch.width == 0 or ch.width < thin_below or ch.pieces > 2:
            continue
        if ch.pieces > 1 and not bay:
            continue                                     # a broken stroke only counts as a joist twin
        if ch.length < 0.8 * ppf or ch.length > 0.6 * page_dim:
            continue
        if any(_same_stroke(ch, o) for o in taken):
            continue
        mx, my = ch.point_at(ch.length / 2)
        best = None
        for lab in labels:
            if abs(lab["chain"].width - ch.width) > 0.05:
                continue
            ratio = ch.length / max(1.0, lab["length_ft"] * ppf)
            if not TYP_RATIO[0] <= ratio <= TYP_RATIO[1]:
                continue
            bb = lab["bbox"]
            d = math.hypot(mx - (bb.x0 + bb.x1) / 2, my - (bb.y0 + bb.y1) / 2)
            if d <= TYP_REACH_FT * ppf and (best is None or d < best[0]):
                best = (d, lab)
        if best is None and (ch.pieces == 1 or bay):
            n0 = ch.nearest(mx, my)
            for lab in bay:
                if abs(lab["chain"].width - ch.width) > 0.05:
                    continue
                # twins are drawn alike: compare drawn stroke to drawn stroke
                # (the labelled one may have been cut short by a crossing member)
                ratio = ch.length / max(1.0, lab["chain"].length)
                if not 0.92 <= ratio <= 1.08:
                    continue
                n1 = lab["chain"].nearest(*lab["anchor_pt"]) if lab.get("anchor_pt") else None
                if n0 and n1 and min(abs(n0[2] - n1[2]), 180 - abs(n0[2] - n1[2])) > 3:
                    continue
                bb = lab["bbox"]
                d = math.hypot(mx - (bb.x0 + bb.x1) / 2, my - (bb.y0 + bb.y1) / 2)
                if d <= BAY_REACH_FT * ppf and (best is None or d < best[0]):
                    best = (d, lab)
        if best is None:
            continue
        d, lab = best
        taken.append(ch)
        n = ch.nearest(mx, my)
        c = {k: lab[k] for k in ("raw", "fam", "dims", "key", "conf", "note") if k in lab}
        c.update({"bbox": pymupdf.Rect(mx - 2, my - 2, mx + 2, my + 2), "angle": -n[2],
                  "line": lab.get("line", ""), "typ_from": lab, "typ_dist_ft": d / ppf,
                  "anchor": "typ", "anchor_pt": (mx, my), "anchor_note": "",
                  "chain": ch, "s": n[1], "lateral": 0.0, "second": None})
        ch.callouts.append((n[1], weights.get(c.get("key"), 0.0), c.get("key"), c))
        out.append(c)
    _extents(page, out, chains, weights, ppf)
    for c in out:
        c["len_note"] = "; ".join(n for n in (
            f"typical of '{c['typ_from'].get('line', '')[:40]}' {c['typ_dist_ft']:.0f} ft away", c.get("len_note", "")) if n)
    return out


def tag_instances(page, callouts, weights, ppf, chains):
    """A label that defines a tag — '2.5K3 JOIST SUBSTITUTION DESIGNATED AS
    "J.S."' — stands for every "J.S." drawn on the sheet.  Each tag becomes
    a callout of the labelled size at the tag's position and reading
    direction, and measures like a label would.  Returns the new callouts."""
    defs = []
    for c in callouts:
        m = TAG_RE.search(c.get("block", "") or c.get("line", ""))
        if m and c.get("key"):
            defs.append((m.group(1).strip().upper(), c))
    if not defs:
        return []
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            t = "".join(sp["text"] for sp in l["spans"]).strip().strip('"').strip().upper()
            for tag, lab in defs:
                if t != tag:
                    continue
                bbox = pymupdf.Rect(l["bbox"])
                if bbox.intersects(pymupdf.Rect(lab["bbox"])):
                    continue                     # the definition itself
                dx, dy = l["dir"]
                c = {k: lab[k] for k in ("raw", "fam", "dims", "key", "conf", "note") if k in lab}
                c.update({"bbox": bbox, "angle": round(math.degrees(math.atan2(-dy, dx))),
                          "line": f'"{tag}" = {lab.get("line", "")}', "tag_from": lab})
                out.append(c)
    if out:
        measure(page, out, weights, ppf, chains=chains)
        for c in out:
            c["len_note"] = "; ".join(n for n in (
                f"tag of '{c['tag_from'].get('line', '')[:40]}'", c.get("len_note", "")) if n)
    return out


def _same_stroke(a, b, tol=3.0):
    """Both ends of a lie on b: a duplicate or a sub-stroke of the same line."""
    for pt in (a.pts[0], a.pts[-1]):
        n = b.nearest(*pt)
        if n is None or n[0] > tol:
            return False
    return True


def _extents(page, callouts, chains, weights, ppf):
    """Cut, snap and gate each anchored callout's stretch of its chain."""
    xcache = {}
    reach = 30 * (ppf or 9)
    for c in callouts:
        ch = c["chain"]
        c["length_ft"], c["seg"], c["len_note"] = None, None, c["anchor_note"]
        if ch is None:
            continue
        if id(ch) not in xcache:
            xcache[id(ch)] = crossings(ch, chains)
        page_dim = min(page.rect.width, page.rect.height)
        own_w = weights.get(c.get("key"), 0.0)
        lo, hi = own_weight_cuts(ch, c["s"], xcache[id(ch)], own_w, reach, page_dim=page_dim)
        c["cuts"] = (lo, hi, [(round(s), round(o.length), o.pieces, thr, local_weight(o, sb, reach)) for s, o, thr, sb in xcache[id(ch)] if abs(s - c["s"]) < 300])
        free_lo, free_hi = lo == 0.0, hi == ch.length
        # what each end frames into: a crossing member that cut the stretch,
        # a neighbour label sharing the line (continuous), or the line the
        # free end snaps to (below)
        ends = {}
        for side, s_cut, free in (("lo", lo, free_lo), ("hi", hi, free_hi)):
            if free:
                continue
            hit = next((o_ for s_, o_, _, _ in xcache[id(ch)] if abs(s_ - s_cut) < 1.0), None)
            sb_ = next((sb_ for s_, o_, _, sb_ in xcache[id(ch)] if abs(s_ - s_cut) < 1.0), 0.0)
            ends[side] = end_target(hit, sb_, reach, page_dim) if hit is not None else {"kind": "free"}
        # each callout owns the stretch nearest it
        for s_other, _, _, other in ch.callouts:
            if other is c:
                continue
            mid = (s_other + c["s"]) / 2
            if s_other < c["s"] and mid > lo:
                lo, free_lo = mid, False
                ends["lo"] = {"kind": "continuous", "key": other.get("key")}
            elif s_other > c["s"] and mid < hi:
                hi, free_hi = mid, False
                ends["hi"] = {"kind": "continuous", "key": other.get("key")}
        if hi - lo < 1:
            c["len_note"] = "zero-length extent"
            continue
        # Estimators measure to the line a member frames into, not to where
        # the drafter stopped the stroke: reach out from each free end.
        extend = EXTEND_FT * (ppf or 9)
        pts = ch.slice(lo, hi)
        if free_lo:
            lo2 = snap_end(ch, lo, -1, chains, own_w, reach, extend, page_dim)
            snap = getattr(ch, "last_snap", None)
            ends["lo"] = end_target(snap[1], snap[2], reach, page_dim) if snap else {"kind": "free"}
            if lo2 < lo:
                pts = _extend_pts(pts, ch, lo, lo2, at_start=True)
                lo = lo2
        if free_hi:
            hi2 = snap_end(ch, hi, +1, chains, own_w, reach, extend, page_dim)
            snap = getattr(ch, "last_snap", None)
            ends["hi"] = end_target(snap[1], snap[2], reach, page_dim) if snap else {"kind": "free"}
            if hi2 > hi:
                pts = _extend_pts(pts, ch, hi, hi2, at_start=False)
                hi = hi2
        c["ends"] = ends
        c["seg"] = pts
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
