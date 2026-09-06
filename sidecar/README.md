# Auto-takeoff sidecar (Python)

First-pass member counts (and experimental draft lengths) from bid PDFs,
delivered as Revu-readable annotations. See `docs/auto-takeoff-pipeline.md`
for the plan, build order and findings from real sets.

```
pip install -r sidecar/requirements.txt          # PyMuPDF; numpy+OpenCV for raster; RapidOCR for stroke-font sheets
node scripts/export-aisc-shapes.mjs              # refresh aisc-shapes.json after editing lib/estimating/aisc-shapes.js
python sidecar/auto_takeoff.py "C:\path\to\bid.pdf" [-o out.pdf] [--sheets S2.11] [--lengths] [--ocr off]
```

Outputs next to the input (or `-o`): `<name>_AUTO.pdf`, `<name>_AUTO.report.md`, `<name>_AUTO.hits.csv`.
Revu locks an open PDF, so close the previous output or use a new `-o` name.

## What the output contains

Auto markups carry no Item_Number or Item_Description (Todd, 2026-09-06): the
estimator groups them into items by scope in Revu before exporting; the
importer skips rows with a blank Item_Number.

- One annotation per shape callout on every structural framing plan, under
  the toolkit's subject and colour, with the v1.7 custom columns filled
  (Item_Number, Item_Description, Shape_Size, Quantity, Drawing_Ref, Notes).
- A **rectangle** over the callout (count only) is the default product. Notes
  say `AUTO COUNT ONLY`, plus `OCR 0.99` when the callout was read by OCR and
  any draft length/reason when `--lengths` ran.
- With `--lengths` (experimental, off by default), a **PolyLine measurement**
  (feet-inches, calibrated via a page viewport) when the length step is
  confident. On the Weslayan set 1 of 18 hit its member; keep it off for real work.
- A red dashed **Auto Exception** rectangle for callouts that resolve to no
  size in the estimator's table.
- Page labels set to sheet numbers; `/BSIAnnotColumns` installed so Revu maps
  the column data without any profile tricks.

## How callouts are read

1. The PDF text layer (any rotation). Works when the engineer's export keeps
   real fonts (Weslayan / SCA: Arial).
2. **OCR fallback** (`ocr.py`, RapidOCR on overlapping 1000 px tiles at 300 dpi,
   0 and 90 degree passes) when a plan's text layer holds no callouts. Needed
   when AutoCAD stroke fonts export as line paths (San Esteban / RDP: 44 callouts
   read at 0.95-0.99 confidence, ~3.5 min per sheet). The title-block sheet
   number is OCR'd the same way. `--ocr off` disables it.

## Scoping (what steel is on this set?)

```
python sidecar/scope.py "C:\path\to\bid.pdf" [-o report.md] [--all-sheets] [--ocr off]
```

Writes `<name>_SCOPE.md`: a one-screen rollup of steel members, connections
and anchorage, finish and grade, miscellaneous/ornamental items, things that
are not ours (existing, concrete, wood, aluminum), document status and scope
notes, then shape callout counts per size, a per-sheet table and the matched
lines. Vocabulary lives in `scope_vocab.py`; the review copy is
`docs/scoping-vocabulary.md` (`python sidecar/scope_vocab.py --doc`). Meant
for Samantha's go/no-go read of a bid set before any takeoff.

**Stairs (2026-09-06):** riser and tread counts noted on stair plans, sections and
elevations ("11 EQ RISERS", "13 TREADS AT 11\"") are boxed and tallied per sheet;
the summary page, the JSON and the Drawings page show "risers / treads in N
flights" with the per-sheet breakdown. Counts repeat where a stair shows on
more than one sheet (plan treads + section risers), so the per-sheet list is
the number to read. Sets that only dimension the flights graphically (Moody)
report nothing.

## Modules

- `auto_takeoff.py` — CLI: classify sheets from the title block, find AISC
  callouts, resolve them, (optionally) measure, write annotations + report.
- `shapes.py` — callout regex + resolution to `aisc-shapes.json` keys.
- `revu_profile.py` — reads the `.bpx` (column contract, Shape_Size choice
  list) and `.btx` (tool subjects/colours); writes `/BSIAnnotColumns` and
  `/BSIColumnData`.
- `ocr.py` — tiled RapidOCR callout and sheet-number reading.
- `lengths.py` — experimental length step: vector paths (and raster strokes)
  become ordered chains; a callout anchors to the nearest parallel chain or to
  its leader arrow's target; the member runs along the chain until a crossing
  by an equal-or-heavier member or an unlabelled drawn line; each callout owns
  the stretch nearest it; a confidence gate decides polyline vs count-only.
- `raster.py` — strokes from image tiles: draws only the page's images onto a
  canvas, keeps near-black pixels (new steel is pure black on these exports,
  existing work grey), OpenCV LSD segments, collinear merge, end-to-end
  linking into polylines. Extraction is clean; turning strokes into member
  extents that match an estimator's judgment is not solved yet.

## One label, many members (2026-09-05)

- **TYP**: a label saying TYP on a member-weight line lends its size to every
  unlabelled stroke of the same line weight and similar length within 60 ft
  (plan-scale regions only). Polylines carry an `AUTO TYP` note; the report
  lists them under "Typical members".
- **Tag legends**: `... DESIGNATED AS "J.S."` makes every "J.S." on the sheet a
  callout of that size.
- **Riders**: an HSS/angle/channel labelled right on a heavier member's line
  takes that member's stretch (collectors on a beam). Columns, posts, kickers,
  braces and hangers never ride.

## Columns (2026-09-05, `columns.py`)

Counted from COLUMN SCHEDULE marks on the plan or from "COLUMN TYP." labels
beside drawn squares; height = the highest elevation note within 80 ft on the
structural plans (or the one T.O. elevation on the sections) + 1'-0" for the
pier cap below the finished slab. Drawn as a polyline from the column centre
at 45 degrees (the z-axis convention: it goes up, not along a grid) with an `AUTO COL` note naming the elevation used; the report lists them
under "Columns".

**2026-09-06 (Todd's review of S-20100):** the markup now lands on the drawn
column symbol (the square of the section's size nearest the mark bubble,
within 12 ft) instead of on the bubble, so every column shows its 45-degree
leg, plate box and rod dot at the column itself; a drawn symbol of a scheduled
size that no mark claims is counted as that size with a CHECK note. Anchor
rods are a translucent circle (Revu ellipse), not a box.

## Connections (2026-09-05, `connections.py`)

The typical connection details (titles with SHEAR / BEAM TO BEAM / BEAM TO
COLUMN CONNECTION) vote the set's shear connection Bolted or Welded by the
words in the detail body; a typical moment detail is only reported. Every
measured W or C beam then carries Todd's generic markup: `End_1/End_2
Straight`, `Connection_Type "WF Bolted"` (or `C Bolted`, `WF Welded`) x 2.
A solid black triangle drawn on the member line just short of its support
is the drafter's moment mark: that end becomes `WF CJP` (one triangle: CJP
x1 and the note says the other end is the typical shear connection). Web holes
follow the AISC Part 10 default (one bolt row per ~3" of depth, minimum 2:
W8-10 2, W12-14 3, W16-18 4, W21 5, W24 6 ... C6-8 2, C9-12 3, C15 4) times
the shear ends; a CJP end adds none. Todd, 2026-09-06: this is the default
until the W / C connection category templates carry Berger's own counts. HSS, angles, WT and pipe are `Loose`; joists get nothing. The end-snap step records what each
end frames into (a crossing member, a grid line, an unlabelled line, or
nothing) and the note says so; an end that frames into nothing drawn is a
CHECK. The report lists the details read and the connection counts.

## Base plates (2026-09-05, `baseplates.py`)

The typical column base plate detail ("TYPICAL COLUMN BASE PLATE",
"COLUMN BASEPLATE - PLAN/SECTION") gives thickness, plan size, anchor rod
diameter / grade / embedment and the column-to-plate weld. Every column gets
a plate nested under it in Revu: the column row carries `Member_Mark C7`,
`Part_Label COLUMN` and `Weld_Type Fillet`; the plate is a small box at the
column with `Member_Mark C7.1`, `Shape_Size "PL 1 x 14"` (thickness x width, a
custom width the app prices as such), `Length_Ft` the other plan dimension,
`Holes Drill` x rod count (assumed 4 with a CHECK note unless written), and
an `AUTO BASE PL` note naming the detail and the rods. Braced-frame base
details are recognised and left alone. Beside the plate a count markup carries the
anchor rods with their hardware catalog label (`3/4" F1554 Gr55 x 18"`,
`1/2" Kwik Bolt x 5-1/2"`; length = the smallest standard length covering
embedment + plate + projection, from the seed sheets in docs/hardware-seed),
Quantity = rod count, Part_Label ANCHOR RODS; the app's import turns any
Shape_Size that names a catalog item into a priced Hardware row, so a rod
counted by hand with the Revu count tool lands the same way. The pier-cap
allowance under a column comes from the drawings too: a `T/PLINTH -1'-8"` note at the column, else the
set's `TOP OF FOOTING EL -1'-0" UNO` note, else 1'-0".

## Z-axis members (kickers, posts, braces, hangers, struts)

Anything that stands up out of the plan is drawn from its origin (the
label's leader tip, else the text) at 45 degrees, never along its plan line:
columns and posts get the column height rule; a kicker/brace/hanger whose
label states a length ("x 6'-0\"", "6'-0\" LONG") is drawn to it; one with no
stated length stays a count-only box that says the length lives on the section.

## Known limits (2026-09-05)

- Assemblies defined in a detail and only located on the plan (a "LOAD
  DISTRIBUTION TRUSS TYP." whose chords are sized in detail 3/S-101) are not
  expanded.
- Column heights follow the highest note nearby, so a canopy column under a
  lower `(B/ STL ...)` note gets the roof height; the note says which
  elevation was used.

- Lengths: per-piece agreement with a human takeoff is ~10-20% on the Weslayan
  set under every rule tried, vector or raster. Continuous edge members are one
  CAD polyline that the estimator splits by shipping judgment; beams that pass
  over other members are continuous in one estimator's eyes and cut in the
  drawing's geometry. Counts are the reliable product.
- OCR does not read 45-degree text reliably (only 0/90 passes); adding passes
  costs time linearly.
- Plates, angles taken off sections, deck, pipe and connections stay manual.

Bid drawings are client data: keep them outside the repo (e.g. `C:\Projects\bid-samples`).
