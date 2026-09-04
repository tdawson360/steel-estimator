# Auto-takeoff sidecar (Python)

First-pass member counts from bid PDFs, delivered as Revu-readable annotations.
See `docs/auto-takeoff-pipeline.md` for the plan and build order.

```
pip install -r sidecar/requirements.txt          # PyMuPDF only (step 1 needs no OCR)
node scripts/export-aisc-shapes.mjs              # refresh aisc-shapes.json after editing lib/estimating/aisc-shapes.js
python sidecar/auto_takeoff.py "C:\path\to\bid.pdf"
```

Outputs next to the input (or `-o`): `<name>_AUTO.pdf`, `<name>_AUTO.report.md`, `<name>_AUTO.hits.csv`.

- `auto_takeoff.py` — CLI: classify sheets from the title block, find AISC callouts
  in the text layer (any rotation), validate against the estimator's shape table,
  draw one rectangle per callout with the v1.7 profile columns filled.
- `revu_profile.py` — reads the `.bpx` (column contract, Shape_Size choice list)
  and `.btx` (tool subjects/colours); writes `/BSIAnnotColumns` + `/BSIColumnData`.
- `shapes.py` — callout regex + resolution to `aisc-shapes.json` keys.

Bid drawings are client data: keep them outside the repo (e.g. `C:\Projects\bid-samples`).
