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
