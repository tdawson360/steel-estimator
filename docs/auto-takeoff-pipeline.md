# Auto-Takeoff Pipeline — Phase 1.5 Plan

Location: `docs/auto-takeoff-pipeline.md`; code in `sidecar/` (Python, PyMuPDF).
Status: STEP 1 BUILT 2026-09-04; lengths + TYP/tag/rider rules 2026-09-05; columns scoped (see 2026-09-05 section). The two original blockers are closed (finding #9 fixed
2026-09-02 in 587a85c/840aa13; calc-extraction and main now ship together, no merge gate).

## 2026-09-04 findings from the first real set (2929 Weslayan, SCA Engineers)

- All 57 pages carry a real text layer (Arial fonts, no outlines). No OCR needed on this set.
- Rotated callouts (-90, -45, odd angles on the curved canopy) extract with their rotation.
- PDF page labels are useless for S sheets; the title-block strip (right 15%, bottom 45%)
  carries sheet number and title, and that is what `sheet_info` classifies from.
- Counts on S2.11 vs the human takeoff: HSS 14/14, W8 12/12, W16 10/10, MC18 6/6 exact;
  C15 49/58 and W18 2/3 short (one callout serving parallel members: the length step fixes
  this); L4x4x1/4 0/37 (came off the section and judgment, never called out on the plan).
- Revu keeps the takeoff contract inside the PDF: catalog `/BSIAnnotColumns` (column defs,
  Index order) and per-annotation `/BSIColumnData` (values, same order). The sidecar writes
  both from the v1.7 .bpx, so annotations land straight in the custom columns.
- Decision (Todd, 2026-09-04): delivery is the annotated, Revu-readable PDF, not a CSV into
  the importer. Review = normal Markups List + CSV export. No app upload route for now.
- Drift fixed: the profile is v1.7 with 23 custom columns (the "20-column schema" below was
  the old profile); AISC validation uses the app's own table (`sidecar/aisc-shapes.json`,
  1,578 sizes: W, WT, rect HSS, L, C, MC, pipe, round bar, flats; no HP/S/M/round HSS).
- Step 1 output is a rectangle over each callout (counts only, `Length_Ft` blank, Notes =
  `AUTO <confidence>`); unresolved callouts get a red dashed "Auto Exception" box.

## 2026-09-04 afternoon: length step (build step 4) first pass

- `sidecar/lengths.py` measures members from vector chains; `auto_takeoff.py` writes
  PolyLine measurements (viewport + /Measure at the sheet scale, Contents in ft-in,
  Measured_Length/Weight/Total columns filled) when confident, rectangles otherwise.
- Scale comes from the sheet's `1/8" = 1'-0"` text (9 pt/ft on a 42x30 sheet).
- Ground truth: Todd's markup PDF keeps every polyline with vertices and BSIColumnData,
  so per-callout and total-LF scoring is scripted (scratch harness, not in repo).
- What the Weslayan sheet taught us:
  - Members are one continuous CAD polyline per run (dash phase never resets at member
    ends), so only crossings and per-callout nearest-stretch can split them. Todd's
    piece breaks on the edge channels are shipping judgment, not geometry.
  - Hierarchy by lb/ft is wrong here (C15 edge channels are heavier than the W8 beams
    that frame into them); judging a crossing by the label nearest that point on the
    other line, and ignoring lighter members, matches Todd's cuts.
  - HSS labels are kickers/columns with 45-degree leaders: no plan length, ever.
  - Labels sit up to 11 ft from their lines; W16 stubs are only reachable via their
    leader arrows (shoulder + filled triangle).
  - BIG ONE: the solid new-steel linework on S2.11 is RASTER (205 image tiles, ~400 dpi).
    Only dashed hidden lines, grid, text and leaders are vectors. Vector-only lengths
    therefore cover ~20 of 93 members on this sheet; the rest are count-only with a
    draft length in Notes. Next decision: image-based line extraction from the tiles,
    or accept count-only for rasterised sheets.
- Confidence gate (polyline vs count-only): parallel anchor, label within 4 ft of the
  line, 2-60 ft, no different-shape label within 40 ft on the same line, and a leader
  must land on a solid vector line.

## 2026-09-04 late: tile extraction + OCR fallback

- Todd's Revu verdict on the vector length pass: 1 of 18 polylines hit its member, the rest
  traced grid lines through columns; count-only boxes "work great". Lengths are now opt-in
  (`--lengths`), count-only is the product.
- `sidecar/raster.py`: draws only the page's image tiles onto a canvas, keeps pure-black
  pixels (new steel 0-9, existing work 80-89 on the Weslayan tiles), OpenCV LSD segments,
  collinear merge, end-to-end linking. Extraction is clean (overlay checked visually), but
  member extents from those strokes still disagree with Todd's pieces (~10-20% per callout,
  drawn LF a fraction of his). Same root cause as vector: piece breaks are estimator
  judgment; beams continuous over other members in his eyes are cut by geometry.
- San Esteban (RDP Engineers, 1 page): fully VECTOR steel, but callouts are AutoCAD stroke
  fonts exported as line paths -> zero text-layer callouts. `sidecar/ocr.py` (RapidOCR,
  pip-only, tiled 1000 px at 300 dpi, 0/90 passes) reads 44 callouts at 0.95-0.99
  (C3x5 x18, W6x9 x11, C6x8.2 x9, C12x20.7 x4, W10x33, W12x30) in ~3.5 min. Whole-page OCR
  finds 1. Misses: two vertical W6x9, "2 ANG 2X2X1/4" (not our regex), pipe. Title-block
  sheet number is OCR'd too. OCR runs automatically when a plan's text layer has no callouts.
- So the two sets are mirror images: Weslayan = vector text + raster steel; San Esteban =
  vector steel + stroke-font text. Both need one raster path. Count-only now works on both.
- Python deps: numpy, opencv-python-headless, rapidocr, onnxruntime (all pip on 3.14).

## 2026-09-04 evening: CAB IAH100 (Walter P Moore) - the standard case

- Fully vector, real text, scale note on every plan. Todd's markups: 419 polylines on S-209.
- Vector length step, no set-specific tuning: 34% of callouts within 2 ft. After this round:
  58%. Changes: SJI joist callouts (152/152 exact count), rejoin member lines broken around
  their label (only when a text box sits in the gap), never cut at sheet-spanning grids or
  lines much thinner than the member, penalise thin strokes when anchoring, 6 ft label gate.
- W-shape totals on S-209 mostly within 10-15% of Todd's (W27x84 517/560, W12x14 182/191,
  W16x36 159/198, W12x16 132/141). Joists 3,900 LF vs 5,030: drawn joist lines stop 1-3 ft
  short of the girder centerlines Todd snaps to -> next fix is snapping member ends to the
  nearest heavier crossing within ~3 ft.
- "TYP" items Todd multiplies by hand (86 HSS5x5 kickers from 12 labels, 52 L6x6x1/2 RTU curb
  angles from 1 label, 13 HSS14x6x5/8 canopy beams) are the other big gap: needs pattern
  counting (repeated symbols/rectangles per label), not length logic.
- Later the same evening: Todd's rule adopted - measure to the nearest intersecting line
  (girder/grid centerline), not the drawn stroke end. Free member ends now extend up to 6 ft
  to the nearest equal-or-heavier member, else a grid line, else any drawn line. Plus: labels
  never anchor to fills/closed outlines; unlabelled strokes under 10 ft (curb angles, opening
  frames) cannot cut a member; two different-size labels on one spot of a line are resolved by
  moving the cheaper-to-move label to its second-best line. S-209: 67% within 2 ft, 166 of 286
  within 1 ft; joists 4,380 of 5,030 LF; W21x48 30/30, W16x50 66/66, W36x135 51/52.
  Still open: W24x68 264/360, W21x62 52/120, W18x60 17/30 (beams around the RTU openings),
  L5x5 and W8x10 over-measured (kicker labels / penthouse detail at a different scale),
  and the TYP multiplication problem (HSS5x5 x86, L6x6x1/2 x52, HSS14x6 x13 from few labels).

- Later still (Todd's RTU/kicker feedback): L5x5x3/8 is a horizontal beam-to-beam (~5'-9")
  plus a kicker shown dashed (section only); the horizontal now measures (its short parallel
  line beside the label had been mistaken for a leader shoulder). HSS labelled along a line are
  beams (13 HSS14x6 canopy beams measured). Per-plan scaling windows: scale notes under plan
  titles -> rows -> viewports at each scale (matches Todd's two on S-209). Lengths are measured
  on PLAN sheets only (Todd), via Bluebeam page labels. S-209: 75% within 2 ft, 194 within 1 ft.
  Open: W24x68 with HSS5x5 collectors labelled on top of them (labels stacked; 3 of 9 lost),
  W21x62 66/120, TYP multiplication (HSS5x5 x86, L6x6 x52).

- Todd's verdict on the fringe sets: Weslayan/San Esteban were edge cases; scoping tool should
  stay high-level (stairs, rails, canopies, countertop supports), aluminum/stainless/bronze ARE
  Berger scope, and scope output should be Revu boxes, not markdown.

## 2026-09-05: TYP members, tag legends, riders; columns scoped

Three rules now turn one label into every member it stands for (`lengths.py`):

- **TYP propagation** (`typ_instances`): a label whose text says TYP/TYPICAL and sits on a
  member-weight line lends its size to every unlabelled single stroke of the *same line
  weight* and 0.4-2.5x its length within 60 ft, on plan-scale regions only (finer than
  1/2" = 1'-0" is a detail). Line weight is the drafter's signature for a member class (IAH100:
  0.24 hairline, 1.2 joists/angles/light HSS, 1.68 beams, 2.04 girders). Duplicate strokes and
  labels on hairline work are skipped. IAH100 S-209: L6x6x1/2 curb angle 58 -> 185 LF of Todd's
  219 (20 instances, notes `AUTO TYP`). The rest of his 52 pieces sit on hairline strokes inside
  the MAU/exhaust openings, which nothing distinguishes from dimension lines.
- **Tag legends** (`tag_instances`): `2.5K3 JOIST SUBSTITUTION DESIGNATED AS "J.S."` makes
  every "J.S." on the sheet a 2.5K3 callout at the tag's position. MKT S-100: 15 tags,
  103/103 LF; S-100 82% within 1 ft, 89% within 2 ft.
- **Riders** (`_riders`): an HSS/angle/channel label sitting right on a heavier member's line
  with no line of its own runs with that member and takes the same stretch (HSS5x5 collectors
  on W24x68: 282 -> 402 LF of Todd's 435; Todd cuts collectors into 5 ft pieces per joist bay,
  the tool gives the run). Column/post/kicker/brace/hanger labels never ride.

Benchmarks after: IAH100 74% (S-209 75%), MKT 85%, PAC 66% (unchanged). Not solved:
assemblies defined in a detail and only located on the plan (MKT "LOAD DISTRIBUTION TRUSS
TYP." = HSS2-1/2 chords 299 LF + L2x2 chords 336 LF taken from detail 3/S-101), curb angles
on hairline strokes, HSS4x4 columns.

**Columns (how Todd takes them off, from the markups):** one vertical polyline per column on
the foundation/framing plan whose *length is the column height*, not anything drawn on the
plan. IAH100 S-20100: 40 columns (39 `S2` marks = HSS6x6x3/8, 3 `S3` = HSS7x5x1/2 from the
COLUMN SCHEDULE table on the same sheet); heights 18.1 / 18.8 / 19.5 ft = the nearest
`B/DECK 16'-7"` / `17'-3 5/8"` note on the roof framing plan above + ~1.5 ft (top of footing
EL -1'-0" plus base). MKT S-100: 14 HSS4x4x3/8 columns (label says COLUMN TYP., a square
symbol at each), heights 10.8 / 11.8 ft from the T.O. MEZZANINE 11'-10" section on S-300.
**Columns BUILT 2026-09-05 (`sidecar/columns.py`).** Todd's rule: columns bolt to the top of
the pier cap and the slab is poured around them, so they run taller than the elevations show;
carry +1'-0" with a note saying why. (1) `column_schedule`: the COLUMN SCHEDULE table
(mark -> size) anywhere in the set; marks on a plan ("S2" bubbles, located at the leader tip)
become columns; the table's own size texts are dropped from the callouts. (2) "HSS 4X4X3/8
COLUMN TYP." labels: every square of four heavy strokes with the HSS's side in the label's
drawing cluster is a column; the same set drawn on two plans of one sheet counts once
(translation match), odd ones are flagged "drawn on one plan only". (3) Height = the highest
elevation note within 80 ft on any structural plan (B/DECK, T/STL, T.O. xxx; two-line Revit
tags joined) + 1 ft; beyond 80 ft a draft; no plan notes -> the single T.O. elevation on the
section sheets; else count only. Drawn from the column centre at 45 degrees (Todd's z-axis
convention, 2026-09-05: anything standing up out of the plan is drawn at 45 so it never reads as
a beam), note `AUTO COL`
naming the elevation used; report section "Columns". IAH100 S-20100: 40/40 columns, 72%
within 2 ft (highest-note rule: 28 of 40 heights match; the rest sit where only the canopy's
`(B/ STL 10'-1")` notes are within reach, and the 4 S1 canopy columns on S-209 get the roof
height instead of Todd's 10 ft). MKT S-100: 14 columns + 2 flagged, 12'-10" from the S-300
`T.O. MEZZANINE 11'-10"` (Todd 10'-10" / 11'-10").

## 2026-09-04 night: five sets, batch benchmark (`sidecar/benchmark.py` -> bid-samples/BENCHMARK.md)

Within 2 ft of Todd's polylines, structural plans: CAB IAH100 77%, PAC 66%, Moody 60%
(S-102C 65%, S-105A 80%, counter S-210 72%, elevation S-300 71% with no elevation logic),
Rothko 39%, OXY Hanger 6% (raster canopy details, consistent +3 ft overshoot). HTX2 = misc-only
markups on a 518-page permit set (scoping example). Fixes this round: sheet number = largest
sheet-like token (2+ digits), Bluebeam labels override; markup files' own column order read
for size; scaling windows from drawing clusters (PAC 19% -> 66%); raster test = tiles cover
25% of sheet. Moody lesson: ~200 of 1,800 polylines are on framing plans; the rest are
decorative WT columns on elevations (850), lintels/shelf angles on arch plans (358), stairs,
countertop supports, elevator, partition supports -> elevations and arch-sheet misc are next.

## Goal

First-pass structural steel takeoff from bid PDFs — member counts, tonnage, then lengths — ingested into the estimator through the existing importer. Bluebeam Revu remains the human review surface. This is not a new app and not a Bluebeam replacement.

## Input reality

- Bid PDFs arrive flattened (markups baked in) but with the engineer's text layer intact. Revu native search finds callouts.
- Primary path is vector text extraction, not OCR.
- OCR fallback only for sheets that return no text layer. Order of fallback: Revu batch OCR → PaddleOCR with angle classification → Azure Document Intelligence.
- Open check before build: confirm rotated callouts on column lines are extractable. If not, some layers are text-as-outlines and need the OCR fallback.

## Architecture

**Python sidecar** (PyMuPDF). FastAPI service or CLI shelled out from a Next.js route — pick whichever is less ceremony. Do not attempt this in Node/pdf.js; vector-path work is painful there.

Pipeline per PDF:

1. **Extract** — `page.get_text("dict")` for every string with bbox and rotation. `page.get_drawings()` for vector segments. Flag pages with no text.
2. **Classify sheets** — framing plans get counted; sections, details, typical notes do not. Heuristics: title block text, sheet number prefix (S-2xx plans vs S-4xx/5xx details), callout density. Column schedules are tables → pdfplumber table extraction.
3. **Match callouts** — regex for AISC designations: W, HSS, C, MC, L, WT, HP, PL, pipe. Handle fractions, `X`/`x`/`×`, spacing noise. Normalize before matching.
4. **Validate** — every hit resolved against the AISC v16 shapes table. Fuzzy match resolving to exactly one real shape → accept. Otherwise → exception queue. Reject false positives like `W/ 1/2`.
5. **Lengths (later)** — nearest vector segment to callout, parallel to callout rotation, × sheet scale (title block or known grid bay). Flag if < 2 ft or > 60 ft. Grid-dimension inference is a follow-on.
6. **Output** —
   - Rows in the 20-column BPX schema for importer v1.11, with added columns: `source=auto`, `confidence`, `page`, `bbox`.
   - Annotated PDF with rectangle annotations per member (subject = shape, custom properties = weight/length/source page) written by PyMuPDF. Revu reads standard PDF annotations, so review happens in Revu with no new UI.

**App side:**

- New ingestion route: upload PDF → sidecar → rows into importer with `source=auto`.
- Reconcile on re-import: corrected BPX export from Revu matched to auto rows by page+bbox, or Member_Mark once auto assigns them. Log what was corrected — this is the tuning dataset.
- Exception queue view: unknown shapes, suspicious lengths, no-text sheets, unresolved fuzzy matches.
- Claude vision only on crops sent from the exception queue (schedules, "typ" notes, rejected callouts). Never whole sheets.

## Build order

1. Extraction + regex + AISC validation + sheet classification → counts and tonnage, CSV into importer. Target: one weekend.
2. Annotated PDF output for Revu review.
3. Reconcile-on-reimport + exception queue.
4. Scaled line lengths with review flags.
5. Grid-dimension lengths.

Out of scope, stays manual: connections, plates off details, misc off architectural set.

## Not doing

- Bluebeam Max MCP integration — PyMuPDF annotations give the same review workflow without the subscription.
- Any UI for reviewing boxes — Revu is the UI.

## Benchmark

Run the ugliest real bid set through this pipeline, SteelFlo, and The Takeoff AI free first estimate on the same day. Compare member counts and tonnage against the human takeoff. Decide whether to continue past step 3 based on that, not on demos.
