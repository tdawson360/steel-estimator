# Auto-takeoff sidecar (Python)

First-pass member counts and draft lengths from bid PDFs, delivered as
Revu-readable annotations. See `docs/auto-takeoff-pipeline.md` for the plan,
build order and findings from real sets.

```
pip install -r sidecar/requirements.txt          # PyMuPDF only (no OCR needed so far)
node scripts/export-aisc-shapes.mjs              # refresh aisc-shapes.json after editing lib/estimating/aisc-shapes.js
python sidecar/auto_takeoff.py "C:\path\to\bid.pdf" [-o out.pdf] [--sheets S2.11] [--lengths]
```

Outputs next to the input (or `-o`): `<name>_AUTO.pdf`, `<name>_AUTO.report.md`, `<name>_AUTO.hits.csv`.
Revu locks an open PDF, so close the previous output or use a new `-o` name.

## What the output contains

- One annotation per shape callout on every structural framing plan, under
  the toolkit's subject and colour, with the v1.7 custom columns filled
  (Item_Number, Item_Description, Shape_Size, Quantity, Drawing_Ref, Notes).
- With `--lengths` (experimental, off by default: 1 of 18 polylines hit its member on the
  Weslayan set, the rest traced grid lines through columns), a **PolyLine measurement**
  (feet-inches, calibrated via a page viewport) when the length step is confident. Notes = `AUTO LEN`.
- A **rectangle** over the callout otherwise (count only). Notes say why and
  carry the draft length when one was computed: `AUTO COUNT ONLY: draft 17.3 ft; label 7 ft from line`.
- A red dashed **Auto Exception** rectangle for callouts that resolve to no
  size in the estimator's table.
- Page labels set to sheet numbers; `/BSIAnnotColumns` installed so Revu maps
  the column data without any profile tricks.

## Modules

- `auto_takeoff.py` — CLI: classify sheets from the title block, find AISC
  callouts in the text layer (any rotation), resolve them, measure, write.
- `lengths.py` — length step: vector paths become ordered chains (dashes
  joined, curves sampled); a callout anchors to the nearest parallel chain or
  to its leader arrow's target; the member runs along the chain until a
  crossing by an equal-or-heavier member or an unlabelled drawn line, and each
  callout owns the stretch nearest it. A confidence gate decides polyline vs
  count-only. HSS labels never get a plan length (columns/kickers).
- `revu_profile.py` — reads the `.bpx` (column contract, Shape_Size choice
  list) and `.btx` (tool subjects/colours); writes `/BSIAnnotColumns` and
  `/BSIColumnData`.
- `shapes.py` — callout regex + resolution to `aisc-shapes.json` keys.

## Known limits (2026-09-04)

- Only **vector** line work is measured. Sheets whose new-steel linework is
  rasterised (the Weslayan set embeds ~200 image tiles at ~400 dpi; the solid
  beams live only there) yield count-only boxes for those members. Reading
  lines out of the tiles is a separate build (OpenCV-style line extraction).
- Continuous edge members drawn as one CAD polyline are split per callout by
  nearest-stretch, not by the estimator's shipping-piece judgment; total feet
  come out right, piece counts may not.
- Plates, angles taken off sections, deck and connections stay manual.

Bid drawings are client data: keep them outside the repo (e.g. `C:\Projects\bid-samples`).
