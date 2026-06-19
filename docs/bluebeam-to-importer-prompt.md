# Prompt: Convert Bluebeam Export → Steel Estimator CSV

Paste everything below into Claude in Excel. Have your Bluebeam export open as the active sheet.

---

You are converting a Bluebeam CSV export into the 19-column format required by the Berger Iron Works Steel Estimator import. Produce a new sheet (or new file) with the exact columns and rules below. One row per piece. Do not aggregate — the app handles that.

## Output columns (in this exact order, exact header names)

1. `Item_Number`
2. `Item_Description`
3. `Member_Mark`
4. `Part_Label`
5. `Drawing_Ref`
6. `Shape_Size`
7. `Quantity`
8. `Length_Ft`
9. `End_1_Labor`
10. `End_2_Labor`
11. `Holes`
12. `Hole_Qty`
13. `Weld_Type`
14. `Connection_Type`
15. `Connection_Qty`
16. `Prep_Ops`
17. `Coating`
18. `Galvanized`
19. `Notes`

**Required (importer rejects rows missing these):** `Item_Number`, `Shape_Size`, `Quantity`, `Length_Ft`. Everything else may be blank.

## Field rules

### Item_Number
Bid item number, e.g. `1`, `2`, `3`. Integer-like string. Map from whatever Bluebeam called the item/work-package number.

### Item_Description
Free text describing the work package (e.g. `STRUCTURAL FRAMING`, `CANOPY SUPPORT FRAMING`). Use ALL CAPS to match prior estimates.

### Member_Mark
Unique piece mark. Parent/child convention is critical:
- Parent (main beam/column): `45` or `45.0`
- Child connections under that parent: `45.1`, `45.2`, etc.
- Children inherit grouping from the part before the first dot.
- If Bluebeam has no mark, leave blank — the importer will synthesize one.

### Part_Label
Member type. Examples: `BEAM`, `COLUMN`, `HORIZ`, `POST`, `CLIP ANGLE`, `END PLATE`, `GUSSET`, `STIFFENER`.

### Drawing_Ref
Sheet reference, e.g. `S-502`, `A-102`. If Bluebeam has both a page label and a drawing ref, put either here — the importer merges both.

### Shape_Size
Use these formats exactly. Spaces around `x`. No inch marks.
- Wide flange: `W 16 x 26`
- HSS: `HSS 4 x 4 x 1/4`
- Angle: `L 3 x 3 x 1/4`
- Plate: `PL 3/8 x 6`
- Channel: `C 8 x 11.5` or `MC 12 x 35`

### Quantity
Integer — number of pieces this row represents.

### Length_Ft
Decimal feet, e.g. `57.17`, `0.83`. Convert inches → decimal feet if needed.

### End_1_Labor / End_2_Labor
First/second end prep. Use ONLY these values (blank allowed):
- `Straight`
- `Miter`
- `Double Miter`
- `Single Cope`
- `Double Cope`
- `Profile`

**Compound operations:** join with ` + ` (space-plus-space). The importer will split and create both:
- `Single Cope + Miter`
- `Double Cope + Miter`

### Holes
Drill type. Use ONLY (blank allowed):
- `Drill`
- `Drill & C'sink`
- `Drill & Tap`
- `Drill Thru`

### Hole_Qty
Integer — number of holes on this piece. Required if `Holes` is set.

### Weld_Type
Use ONLY (blank allowed):
- `Fillet`
- `Bevel/Grind`
- `PJP`
- `CJP`

### Connection_Type
Use ONLY (blank allowed):
- `WF Connx`
- `C Connx`
- `WF Moment Connx`
- `C Moment Connx`
- `Loose`

### Connection_Qty
Integer — number of connections. Defaults to 1 if blank but `Connection_Type` is set.

### Prep_Ops
Use ONLY (blank allowed):
- `Ease`
- `Splice`
- `90's`
- `Camber`
- `Roll`

### Coating
Use ONLY (blank allowed):
- `Prime Paint`
- `Blast & Prime`
- `Finish Paint`
- `TNEMEC`
- `Std. Shop Coat`
- `Speciality Coating`
- `Powder Coat`
- `Anodized`
- `Glass Bead Blast`

**Coating aggregation:** If every row in an Item_Number has the same coating, the app collapses it to a single item-level operation. If they differ, the app flags it. Don't pre-aggregate — fill the value on every row.

### Galvanized
`Yes` or `No` (or blank, treated as No). Triggers galv weight tracking in the app.

### Notes
Free text.

## Behavior rules

- **One row per piece in Bluebeam = one row in output.** Do not roll up identical pieces.
- **Do not include weight, weight-per-foot, or material rate columns** — the app calculates from the AISC database via `Shape_Size`.
- **Default material grade is A36** — no column for it.
- **Skip rows that have no `Shape_Size` or no `Length_Ft`** — flag them at the end of your output for me to review.
- **If a Bluebeam field doesn't fit any allowed value**, leave the cell blank and flag the row in a summary at the end. Do not guess or invent new values — the importer rejects unknowns.

## Deliverables

1. The converted sheet with the 19 columns above, headers in row 1.
2. A short summary at the end:
   - Total rows in / rows out
   - Any rows skipped (with reason)
   - Any fields you couldn't map cleanly (with the original Bluebeam value)
