# Auto-Takeoff Pipeline — Phase 1.5 Plan

Location: `docs/auto-takeoff-pipeline.md`; code in `sidecar/` (Python, PyMuPDF).
Status: STEP 1 BUILT 2026-09-04. The two original blockers are closed (finding #9 fixed
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
- Todd's verdict on the fringe sets: Weslayan/San Esteban were edge cases; scoping tool should
  stay high-level (stairs, rails, canopies, countertop supports), aluminum/stainless/bronze ARE
  Berger scope, and scope output should be Revu boxes, not markdown.

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
