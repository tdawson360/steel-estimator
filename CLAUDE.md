# Steel Estimator - Project Context

## Project Overview

**Company:** Berger Iron Works (Houston, TX)  
**Industry:** Structural steel fabrication and ornamental metals  
**Project Owner:** Todd (Contract review, project management, estimating)

This is a web-based Steel Estimator application built with Next.js that processes steel fabrication takeoffs from our vendor Neilsoft and generates detailed material and labor estimates.

**Current Status:**
- Phase 0: Frontend UI - COMPLETE
- Phase 1: Backend API & CSV Importer - IN PROGRESS
- Using Replit for development, deploying to production environment TBD

---

## Architecture

**Tech Stack:**
- Next.js 14+ (App Router)
- React
- TypeScript
- API routes for backend logic

**Key Features:**
- Item-based estimating with hierarchical material selection
- Configurable labor components
- CSV import from Neilsoft takeoff data
- Material weight calculations based on AISC steel database
- Labor rate lookup and cost extensions

---

## CSV Importer Specification

### Overview
Import steel takeoff data from Neilsoft in CSV format. Each row represents one piece. The app aggregates rows by Item_Number and generates material + labor line items.

### Input CSV Structure (19 Columns)

#### Core Identification
1. **Item_Number** - Bid item number (e.g., "1", "2", "3")
2. **Item_Description** - Description of work package (e.g., "STRUCTURAL FRAMING")
3. **Member_Mark** - Unique piece mark with parent/child logic (e.g., "45", "45.1", "45.2")
4. **Part_Label** - Member type (e.g., "BEAM", "COLUMN", "CLIP ANGLE", "END PLATE")
5. **Drawing_Ref** - Drawing reference (e.g., "S-502", "A-102")

#### Material Data
6. **Shape_Size** - Steel shape and size (e.g., "W 16 x 26", "HSS 4 x 4 x 1/4", "L 3 x 3 x 1/4", "PL 3/8 x 6")
7. **Quantity** - Number of pieces (integer)
8. **Length_Ft** - Length in feet (decimal)

#### Labor Modifiers
9. **End_1_Labor** - First end preparation (dropdown values below)
10. **End_2_Labor** - Second end preparation (dropdown values below)
11. **Holes** - Hole type (dropdown values below)
12. **Hole_Qty** - Number of holes (integer)
13. **Weld_Type** - Welding type (dropdown values below)
14. **Connection_Type** - Connection assembly type (dropdown values below)
15. **Connection_Qty** - Number of connections (integer)
16. **Prep_Ops** - Prep operations (dropdown values below)
17. **Coating** - Coating type (dropdown values below)
18. **Galvanized** - Yes/No (triggers galv weight tracking in app)

#### Notes
19. **Notes** - Free text field

---

## Labor Operation Mapping

### End Labor (End_1_Labor / End_2_Labor)
**Template Values → App Operations:**
- "Straight" → "Cut- Straight"
- "Miter" → "Cut- Miter"
- "Double Miter" → "Cut- Double Miter"
- "Single Cope" → "Cut- Single Cope End"
- "Double Cope" → "Cut- Double Cope End"
- "Profile" → "Cut- Profile"
- **"Single Cope + Miter"** → generates TWO operations: "Cut- Single Cope End" + "Cut- Miter"
- **"Double Cope + Miter"** → generates TWO operations: "Cut- Double Cope End" + "Cut- Miter"

**Parsing Rule:** If End_Labor contains " + ", split on " + " and create separate operations for each.

**Quantity:** Each operation gets Qty = 1

---

### Drilling Operations (Holes)
**Template Values → App Operations:**
- "Drill" → "Drill Holes"
- "Drill & C'sink" → "Drill & C'sink Holes"
- "Drill & Tap" → "Drill & Tap Holes"
- "Drill Thru" → "Drill Thru Holes"

**Quantity:** Use Hole_Qty from template

---

### Welding Operations (Weld_Type)
**Template Values → App Operations:**
- "Fillet" → "Welding- Fillet"
- "Bevel/Grind" → "Welding- Bevel/Grind"
- "PJP" → "Welding- PJP"
- "CJP" → "Welding- CJP"

**Quantity:** Qty = 1 (flat per piece)

---

### Prep Operations (Prep_Ops)
**Template Values → App Operations:**
- "Ease" → "Ease"
- "Splice" → "Splice"
- "90's" → "90's"

**Quantity:** Qty = 1 (flat per piece)

---

### Connection Operations (Connection_Type)
**Template Values → App Operations:**
- "WF Connx" → "WF Connx"
- "C Connx" → "C Connx"
- "WF Moment Connx" → "WF Moment Connx" *(NEW - needs to be added to app)*
- "C Moment Connx" → "C Moment Connx" *(NEW - needs to be added to app)*
- "Loose" → "Loose" *(NEW - needs to be added to app)*

**Quantity:** Use Connection_Qty from template

---

### Coating Operations (Coating)
**Template Values → App Operations:**
- "Prime Paint" → "Prime Paint"
- "Blast & Prime" → "Blast & Prime"
- "Finish Paint" → "Finish Paint"
- "TNEMEC" → "TNEMEC"
- "Std. Shop Coat" → "Std. Shop Coat"
- "Speciality Coating" → "Speciality Coating"
- "Powder Coat" → "Powder Coat"
- "Anodized" → "Anodized"
- "Glass Bead Blast" → "Glass Bead Blast"

**CRITICAL AGGREGATION LOGIC:**
- **IF** all rows within an Item_Number have the same Coating value → Create ONE coating operation at the Item level (not per piece)
- **IF** rows have different Coatings or some are blank → Create separate operations or flag for review

**Quantity:** Qty = 1 (item-level application when aggregated)

---

### Galvanized
**Template Value:** "Yes" / "No"

**App Behavior:**
- When "Yes" → Trigger existing galv checkbox in app
- App creates weight-tracking line (NOT a labor operation)
- Used for material sourcing and outsourced galvanizing cost tracking

---

## NOT Captured in Template (Estimator-Only)

### Finishes (primarily ornamental work)
- #4 Satin
- #8 Mirror
- Non-Directional
- Speciality Finish

### Handling Operations
- Handling
- Fit up/Assembly
- Shop Inspection
- Shop Load-out
- Hotshot

**These are added manually by the estimator in the app, not captured during Neilsoft takeoff.**

---

## Parent/Child Member Logic

**Member_Mark Pattern:**
- Parent member: "45" (main beam/column)
- Child connections: "45.1", "45.2" (connection plates, angles, etc.)

**Example from Sample Data:**
```
Item 1 - STRUCTURAL FRAMING
├─ Member 45.0 (W 16 x 26 beam)
│   ├─ Material: W 16 x 26, Length 57.17', Qty 1
│   ├─ Labor: Cut- Straight (Qty 2) - both ends
│   ├─ Labor: Drill Holes (Qty 4)
│   ├─ Labor: WF Connx (Qty 2)
│   └─ Labor: Prime Paint (item-level if uniform)
├─ Member 45.1 (L 3 x 3 x 1/4 clip angle)
│   ├─ Material: L 3 x 3 x 1/4, Length 0.75', Qty 2
│   ├─ Labor: Cut- Straight (Qty 2)
│   ├─ Labor: Drill Holes (Qty 3)
│   └─ Labor: Welding- Fillet (Qty 1)
└─ Member 45.2 (PL 3/8 x 6 end plate)
    ├─ Material: PL 3/8 x 6, Length 0.83', Qty 1
    ├─ Labor: Drill Holes (Qty 4)
    └─ Labor: Welding- Fillet (Qty 1)
```

**App Display:** All members nest under their Item_Number. All costs roll up to Item total.

---

## Material Weight Calculation

**App Handles Automatically:**
1. Parse Shape_Size to determine shape type and dimensions
2. Lookup weight per foot from AISC steel database
3. Calculate total weight: `Weight_Per_Ft × Length_Ft × Quantity`
4. Extend material cost: `Total_Weight × Material_Rate_Per_Lb`

**Steel Grades:** Default to A36 unless estimator overrides. Grade affects material rate lookup.

**DO NOT include weight columns in CSV** - the app calculates this.

---

## Labor Rate Database

**Separate spreadsheet (coming soon)** will define:
- Labor operation rates ($/hour or $/occurrence)
- Complexity modifiers
- Shop overhead factors

**For now:** Importer generates labor line items with Qty. Rates can be filled in manually or via lookup.

---

## Import Workflow

1. **Upload CSV** → Parse 19 columns
2. **Group by Item_Number** → Aggregate rows
3. **For each row:**
   - Create material line item (Shape_Size, Length, Qty)
   - Parse labor modifiers and generate labor operations
   - Handle compound operations (split on " + ")
   - Apply coating aggregation logic
   - Trigger galv checkbox if needed
4. **Calculate weights** → Lookup from steel database
5. **Display in app** → Nested by Item_Number with parent/child structure
6. **Apply labor rates** → From separate database or manual entry
7. **Extend costs** → Material + Labor = Item Total

---

## Sample CSV Data (from Rothko project)

```csv
Item #,Item Description,Qty,(Non-Flat) Mat Size,Page Label,Part Label,Fab Length
4,CANOPY SUPPORT FRAMING,1,W 8 x 21,S-100,COLUMN,24.75
4,CANOPY SUPPORT FRAMING,1,HSS 4 x 4 x 1/4,A-102,HORIZ,3.58
4,CANOPY SUPPORT FRAMING,1,HSS 4 x 4 x 1/4,A-102,HORIZ,7.33
3,PARAPET SUPPORT POSTS,1,HSS 6 x 2 x 3/8,A-102,POST,3.17
```

**This is the OLD format (7 columns).** The new Neilsoft template has 19 columns with labor modifiers.

---

## Next Steps (Phase 1 Backend)

1. **Build CSV Importer API Route**
   - `/api/import-csv` endpoint
   - Parse 19-column CSV
   - Validate data
   - Generate material + labor line items

2. **Implement Labor Operation Parsing**
   - Compound operation splitting logic
   - Prefix/suffix transformation (Cut-, Welding-, etc.)
   - Coating aggregation by Item_Number

3. **Weight Calculation Service**
   - AISC steel database lookup
   - Shape parsing (W, HSS, L, PL, etc.)
   - Weight per foot calculation

4. **Labor Rate Integration**
   - Prepare for separate rate database
   - Apply rates to labor operations
   - Cost extension logic

5. **Data Model Updates**
   - Item → Material → Labor hierarchy
   - Parent/child member relationships
   - Galvanized tracking

---

## Important Notes

- **One row = one piece** in the CSV
- **The app aggregates** by Item_Number and shape
- **Labor rates are separate** from the import (coming in separate database)
- **Material grade defaults to A36** unless specified
- **Build files (.next/) should NOT be committed** to git
- **Branch structure:** `main` (original), `replit-phase1` (current work)

---

## Contact & Context

**Project Lead:** Todd  
**Company:** Berger Iron Works  
**Vendor:** Neilsoft (provides takeoff data)  
**Goal:** Automate steel estimating by importing structured takeoff data and applying intelligent labor/material calculations

---

## Development Environment

**Current Setup:**
- Developed in Replit
- Pushed to GitHub: `https://github.com/tdawson360/steel-estimator`
- Working branch: `replit-phase1`
- Local development with Claude Code

**To Run Locally:**
```bash
npm install
npm run dev
```

**To Build:**
```bash
npm run build
```

---

*Last Updated: February 2026*
