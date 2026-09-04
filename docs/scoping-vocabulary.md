# Scoping vocabulary (draft, 2026-09-04)

What the scoping tool looks for on a drawing set, by category. Patterns run on every text line
(text layer or OCR) of every sheet. Edit `sidecar/scope_vocab.py`; this file is generated from it
with `python sidecar/scope_vocab.py --doc > docs/scoping-vocabulary.md`.

Kinds: **member** = fabricated item, **connect** = connection/anchorage labor, **finish** = coating/grade,
**misc** = ornamental/miscellaneous metals, **exclude** = looks like steel but is not ours,
**status** = document status, **note** = scope language.

| Category | Kind | Catches (examples) | Patterns |
|---|---|---|---|
| Wide flange / beams | member | `W8X21`, `W 10X33`, `STEEL BEAM - SEE PLAN`, `WT5X11` | `\bW\s?\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s*[xX×]\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\b`<br>`\b(?:WT|WF|HP|S|M)\s?\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s*[xX×]\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\b`<br>`\bSTEEL BEAM\b`<br>`\bWIDE FLANGE\b` |
| Channels | member | `C15X33.9`, `MC18X42.7`, `C 3X5` | `\b(?:MC|C)\s?\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s*[xX×]\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\b`<br>`\bCHANNEL\b` |
| Angles | member | `L4X4X1/4`, `2 ANG. 2X3X1/4 LLB`, `ANGLE 3x3x1/4`, `DECK SUPPORT ANGLE` | `\b(?:\d\s*)?(?:L|ANG\.?|ANGLE)\s?\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s*[xX×]\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s*[xX×]\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?`<br>`\bANGLES?\b`<br>`\bLLB\b|\bSLB\b|\bLLV\b|\bLLH\b`<br>`\b2L\s?{NUM}` |
| HSS / tube | member | `HSS6X6X3/8`, `NEW HSS COLUMN`, `TS4x4x1/4` | `\bHSS\s?\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s*[xX×]\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?`<br>`\bTS\s?\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s*[xX×]\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?`<br>`\bTUBE\s?STEEL\b`<br>`\bHSS\s+COLUMN\b`<br>`\bSQUARE TUBE\b|\bRECT(?:ANGULAR)?\.?\s+TUBE\b` |
| Pipe | member | `3" DIA. STD PIPE`, `PIPE 4 STD`, `6" SCH 40 PIPE BOLLARD` | `\b\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s?(?:\"|″|”|\?|IN\.?|DIA\.?|Ø|⌀)?\s*(?:DIA\.?\s*)?(?:STD|XS|XXS|SCH\.?\s?\d+)?\s*PIPE\b`<br>`\bPIPE\s?\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s?(?:STD|XS|XXS|SCH\.?\s?\d+)\b`<br>`\bSTD\.?\s+PIPE\b|\bPIPE\s+COLUMN\b|\bPIPE\s+BOLLARD\b` |
| Plate | member | `PL3/4"x6 1/2"x1'-0"`, `PL3/8"X4"X2'-0"`, `TOP PLATE`, `BASE PL`, `3/8" PLATE` | `\bPL\.?\s?\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?(?:\"|″|”|\?|IN\.?|DIA\.?|Ø|⌀)?\s?\s*[xX×]\s*`<br>`\b\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?(?:\"|″|”|\?|IN\.?|DIA\.?|Ø|⌀)?\s*(?:THK\.?\s*)?(?:PL|PLATE)\b`<br>`\b(?:BASE|CAP|GUSSET|BENT|STIFFENER|SHEAR|END|TOP|WELD|EMBED(?:DED)?|CONT(?:INUOUS)?\.?|BEARING|SPLICE|COVER|CLIP)\s+PL(?:ATE)?S?\b`<br>`\bSTIFFENERS?\b|\bGUSSETS?\b` |
| Bar | member | `FB 1/2 x 2`, `BAR 3/8 x 3`, `3/4" RD BAR` | `\b(?:FB|FLAT BAR|BAR)\s?\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?\s*[xX×]\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?`<br>`\b\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?(?:\"|″|”|\?|IN\.?|DIA\.?|Ø|⌀)?\s*(?:RD|ROUND|SQ|SQUARE)\s*(?:BAR|ROD)\b`<br>`\bFLAT BARS?\b|\bROUND BARS?\b|\bSQUARE BARS?\b` |
| Metal deck | member | `1.5B 22 DECK`, `3VLI20`, `DECK TO BE 7.2 - 0.04 INCH THICK`, `ROOF DECK` | `\b\d(?:\.\d)?\s?(?:B|F|N|VL|VLI|W|C|CD|PLB|PLN)\s?-?\s?\d\d\b`<br>`\b(?:ROOF|FLOOR|COMPOSITE|FORM|METAL|MTL\.?)\s+DECK(?:ING)?\b`<br>`\bDECK\s+SPAN\b|\bDECK TO BE\b`<br>`\bVERCO\b|\bVULCRAFT\b|\bCANAM\b|\bNEW MILLENNIUM\b`<br>`\b(?:16|18|20|22)\s?GA\.?\b` |
| Joists | member | `24K7`, `JOIST GIRDER`, `BRIDGING` | `\b\d\d\s?(?:K|LH|DLH|KCS)\s?\d+\b`<br>`\bJOIST GIRDER\b|\bOPEN WEB\b|\bBAR JOIST\b|\bSTEEL JOISTS?\b|\bBRIDGING\b` |
| Headed studs / DBA | connect | `3/4" DIA x 4" HEADED STUDS`, `NELSON STUDS`, `DBA` | `\b(?:HEADED|SHEAR|NELSON)\s+STUDS?\b`<br>`\bDBA\b|\bDEFORMED BAR ANCHORS?\b`<br>`\b\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?(?:\"|″|”|\?|IN\.?|DIA\.?|Ø|⌀)?\s*(?:DIA\.?\s*)?\s*[xX×]\s*?\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?(?:\"|″|”|\?|IN\.?|DIA\.?|Ø|⌀)??\s+(?:HEADED\s+)?STUDS?\b` |
| Anchor bolts / rods | connect | `(6) 3/4" DIA. x 4 1/2" ... ANCHORS`, `ANCHOR BOLTS`, `F1554 GR 36` | `\bANCHOR\s+(?:BOLTS?|RODS?)\b`<br>`\bA\.?B\.?\s?\d|\b\(\d+\)\s*A\.?B\.?\b`<br>`\bF1554\b|\bA307\b`<br>`\(\d+\)\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?(?:\"|″|”|\?|IN\.?|DIA\.?|Ø|⌀)?\s*(?:DIA\.?)?\s*[xX]\s*\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?(?:\"|″|”|\?|IN\.?|DIA\.?|Ø|⌀)??(?=.*\bANCHORS?\b)` |
| Post-installed anchors / epoxy | connect | `DRILL AND EPOXY`, `HILTI HY200 EPOXY`, `DIA. X 6" EMBEDMENT` | `\bHILTI\b|\bKWIK\s?BOLT\b|\bHY\s?-?\s?200\b|\bRE\s?-?\s?500\b|\bHIT-?\w*\b`<br>`\bEPOXY\b|\bADHESIVE ANCHORS?\b|\bEXPANSION ANCHORS?\b|\bWEDGE ANCHORS?\b|\bDRILL AND EPOXY\b`<br>`\bEMBEDMENT\b|\bEMBED\.?\b` |
| High-strength bolts | connect | `A325 BOLTS`, `SLIP-CRITICAL`, `TC BOLTS` | `\bA325\b|\bA490\b|\bF3125\b|\bTC\s?BOLTS?\b|\bTENSION CONTROL\b|\bSLIP[- ]CRITICAL\b|\bSNUG[- ]TIGHT\b`<br>`\bBOLTED\b` |
| Moment connections | connect | `INDICATES MOMMENT CONNECTION`, `INDICATE MEMBER END MOMENT CONNECTION`, `CJP` | `\bMOM+ENT\s+CONN?(?:ECTION)?S?\b`<br>`\bCJP\b|\bPJP\b|\bFULL[- ]PEN(?:ETRATION)?\b|\bCOMPLETE JOINT\b`<br>`\bMOMENT FRAME\b|\bSMF\b|\bIMF\b|\bOMF\b` |
| Shear / standard connections | connect | `STANDARD AISC CONNECTION`, `SHEAR TAB`, `CLIP ANGLE` | `\bSHEAR\s+(?:TAB|PLATE|CONN)`<br>`\bSTANDARD AISC\b|\bAISC\s+(?:STANDARD|TYPICAL)\b|\bTYP(?:ICAL)?\.?\s+CONN(?:ECTION)?\b`<br>`\bSINGLE\s+PLATE\b|\bDOUBLE ANGLE\b|\bCLIP ANGLE\b|\bSEATED\b` |
| Welding | connect | `FIELD WELDED`, `E70XX`, `AWS D1.1` | `\bFIELD WELD(?:ED)?\b|\bSHOP WELD(?:ED)?\b|\bWELDED\b`<br>`\bFILLET WELD\b|\bE70XX\b|\bAWS D1\.\d\b`<br>`\bBEVEL\b|\bGRIND\s+SMOOTH\b` |
| Galvanizing | finish | `ALL STEEL TO BE HOT DIP GALVANIZED AFTER FABRICATION`, `HDG`, `GALV.` | `\bHOT[- ]DIP(?:PED)?\s+GALV(?:ANIZED)?\b`<br>`\bGALV(?:ANIZED|ANIZE|\.)?\b`<br>`\bHDG\b`<br>`\bA123\b|\bA153\b` |
| Paint / coating | finish | `SHOP PRIMER`, `POWDER COAT`, `INTUMESCENT` | `\bSHOP\s+PRIM(?:E|ER|ED)\b|\bPRIMED?\b|\bPRIMER\b`<br>`\bPAINT(?:ED)?\b|\bPOWDER[- ]COAT(?:ED)?\b|\bTNEMEC\b|\bSHERWIN\b|\bEPOXY COATING\b|\bURETHANE\b`<br>`\bINTUMESCENT\b|\bFIREPROOF(?:ING)?\b|\bSPRAY[- ]APPLIED\b` |
| Architecturally exposed | finish | `AESS`, `ARCHITECTURALLY EXPOSED STRUCTURAL STEEL` | `\bAESS\b|\bARCHITECTURALLY EXPOSED\b|\bEXPOSED (?:STRUCTURAL )?STEEL\b`<br>`\bGRIND (?:ALL )?WELDS? SMOOTH\b|\bSEAL WELD(?:ED)?\b` |
| Material grades | finish | `A992 GR 50`, `A500 GR B`, `STAINLESS STEEL 316` | `\bA992\b|\bA36\b|\bA500\b|\bA53\b|\bA572\b|\bGR(?:ADE)?\.?\s?50\b|\bA588\b|\bCOR-?TEN\b|\bWEATHERING\b`<br>`\bSTAINLESS\b|\b(?:304|316)\s?(?:SS|S\.S\.)\b|\bS\.?S\.?\s+STEEL\b` |
| Railings | misc | `HANDRAIL`, `GUARDRAIL`, `PICKET` | `\bHAND\s?RAIL(?:ING)?S?\b|\bGUARD\s?RAIL(?:ING)?S?\b|\bRAILINGS?\b|\bBALUSTERS?\b|\bPICKETS?\b|\bTOP RAIL\b|\bCABLE RAIL\b` |
| Stairs / ladders | misc | `STAIR STRINGER`, `SHIP LADDER`, `LANDING` | `\bSTAIRS?\b|\bSTRINGERS?\b|\bTREADS?\b|\bRISERS?\b|\bLANDINGS?\b|\bSTAIR NOSING\b`<br>`\bLADDERS?\b|\bSHIPS? LADDER\b|\bROOF ACCESS\b|\bCAGE\b` |
| Grating / checker plate | misc | `BAR GRATING`, `CHECKER PLATE`, `W-19-4` | `\bBAR GRATING\b|\bGRATING\b|\bW-?19-?4\b|\bSERRATED\b`<br>`\bCHECKER(?:ED)?\s+PL(?:ATE)?\b|\bDIAMOND PL(?:ATE)?\b|\bTREAD PL(?:ATE)?\b|\bFLOOR PL(?:ATE)?\b` |
| Canopies / awnings / screens | misc | `CANOPY FRAMING PLAN`, `TRELLIS`, `ROOF SCREEN` | `\bCANOPY\b|\bCANOPIES\b|\bAWNINGS?\b|\bTRELLIS\b|\bPERGOLA\b|\bSUN\s?SHADES?\b|\bLOUVERS?\b|\bSCREEN WALL\b|\bROOF SCREEN\b|\bEQUIPMENT SCREEN\b` |
| Gates / fences / bollards | misc | `BOLLARD`, `GATE`, `CORNER GUARD` | `\bGATES?\b|\bFENC(?:E|ING)\b|\bBOLLARDS?\b|\bCORNER GUARDS?\b|\bWHEEL STOPS?\b` |
| Platforms / supports / frames | misc | `MEZZANINE`, `EQUIPMENT SUPPORT FRAME`, `DUNNAGE` | `\bMEZZANINE\b|\bPLATFORMS?\b|\bCATWALKS?\b|\bDUNNAGE\b|\bEQUIPMENT (?:SUPPORT|FRAME|RAIL)S?\b|\bROOF FRAMES?\b|\bCURB\b|\bSLEEPERS?\b|\bUNIT SUPPORT\b|\bRTU\b` |
| Lintels / misc angles | misc | `LOOSE LINTEL`, `SHELF ANGLE`, `POUR STOP` | `\bLINTELS?\b|\bLOOSE LINTEL\b|\bSHELF ANGLE\b|\bRELIEVING ANGLE\b|\bDECK SUPPORT ANGLE\b|\bEDGE ANGLE\b|\bPOUR STOP\b|\bCLOSURE\b` |
| Elevator / pit | misc | `ELEVATOR PIT LADDER`, `HOIST BEAM`, `SILL ANGLE` | `\bELEVATOR\b|\bELEV\.?\s+(?:PIT|SILL|DIVIDER|HOIST)\b|\bPIT LADDER\b|\bSILL ANGLE\b|\bDIVIDER BEAM\b|\bHOIST BEAM\b` |
| Embeds | connect | `EMBED PLATE`, `WELD PLATE`, `EMBEDS` | `\bEMBED(?:DED)?\s+PL(?:ATE)?S?\b|\bEMBEDS?\b|\bWELD PL(?:ATE)?S?\b|\bEDGE PL(?:ATE)?\b` |
| Existing / not in contract | exclude | `EXISTING CONCRETE COLUMN`, `BY OTHERS`, `N.I.C.` | `\bEXISTING\b|\bEXIST\.?\b|\(E\)`<br>`\bBY OTHERS\b|\bN\.?I\.?C\.?\b|\bNOT IN CONTRACT\b|\bOWNER FURNISHED\b|\bDEMO(?:LISH|LITION)?\b|\bREMOVE\b|\bTO REMAIN\b` |
| Wood / cold-formed / other trades | exclude | `8" DIA. WOOD GUN BARREL POST`, `COLD-FORMED`, `PRECAST` | `\bWOOD\b|\bLUMBER\b|\bGLU-?LAM\b|\bLVL\b|\bPSL\b|\bTIMBER\b|\bPLYWOOD\b`<br>`\bCOLD[- ]FORMED\b|\bCFS\b|\bLIGHT[- ]GA(?:UGE)?\b|\bMETAL STUDS?\b|\bTRACK\b`<br>`\bHOLLOW METAL\b|\bH\.?M\.?\s+(?:DOOR|FRAME)\b`<br>`\bPRECAST\b|\bREBAR\b|\bREINF(?:ORCING)?\b|\b#\d\s?(?:BARS?|@)\b|\bCMU\b|\bMASONRY\b` |
| Concrete / foundations | exclude | `SLAB-ON-GRADE`, `PIER BELL`, `T.O.GB`, `EXISTING CONCRETE` | `\bSLAB[- ]ON[- ]GRADE\b|\bELEVATED SLAB\b|\bSLAB\b|\bFOOTINGS?\b|\bPIERS?\b|\bPIER (?:BELL|SHAFT)\b|\bGRADE BEAMS?\b|\bT\.?O\.?\s?(?:GB|SLAB|CONC|FTG|PIER)\b|\bCAISSONS?\b|\bDRILLED (?:PIER|SHAFT)S?\b|\bCONCRETE\b|\bCONC\.?\b` |
| Aluminum | exclude | `ALUMINUM ASSOCIATION`, `ASTM B 209`, `6061-T6` | `\bALUMIN(?:UM|IUM)\b|\bALUM\.?\b|\bASTM B\s?209\b|\b6061\b|\b6063\b` |
| Document status | status | `PROGRESS SET`, `PRELIMINARY PRICING`, `NOT FOR CONSTRUCTION` | `\bPROGRESS SET\b|\bNOT FOR CONSTRUCTION\b|\bPRELIMINARY\b|\bFOR REVIEW\b|\bPERMIT SET\b|\bBID SET\b|\bISSUE(?:D)? FOR (?:BID|CONSTRUCTION|PERMIT|PRICING)\b|\bIFC\b|\bADDENDUM\b|\bREVISION\b|\bDD\b|\bCD\b|\b\d\d% (?:DD|CD|SD)\b` |
| Scope notes | note | `ALL STEEL TO BE ...`, `RE: ARCH.`, `SEE PLAN` | `\bALL STEEL\b|\bSTRUCTURAL STEEL\b|\bMISC(?:ELLANEOUS)?\.?\s+(?:STEEL|METALS?)\b|\bORNAMENTAL\b|\bSTEEL FABRICATOR\b|\bSHOP DRAWINGS?\b|\bERECT(?:ION|OR)\b`<br>`\bSEE (?:PLAN|ARCH(?:ITECTURAL)?\.?|STRUCT(?:URAL)?\.?|DETAIL)\b|\bRE:\s?(?:ARCH|STRUCT)` |

## Open questions for Todd / Samantha

- Which misc categories does Berger actually bid (railings, stairs, grating, canopies, gates, elevator)? Drop the rest to cut noise.
- Is aluminum ever ours (ornamental)? Today it is flagged as an exclusion.
- Deck: flag only, or count squares? The plan hatches give area if we ever want it.
- Anything you routinely find on architectural sheets that structural sheets never show (canopy fascia, screen walls, signage supports)?
- Words your engineers use that are missing here: send examples and they go straight into the table.
