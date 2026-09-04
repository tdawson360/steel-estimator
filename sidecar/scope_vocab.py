"""Scoping vocabulary: the words and patterns on a drawing set that tell an
estimator what kind of steel job it is, before any takeoff.

Each entry names a category, what it signals, the regexes that catch it, and
real examples (the Weslayan and San Esteban sets, plus the usual language of
structural and ornamental sheets).  Patterns run against upper-cased text
lines with OCR noise tolerated (dots, stray punctuation, doubled letters).

Kinds:
  member     - a steel item that gets fabricated (shape, plate, deck ...)
  connect    - connection / anchorage language that drives labor
  finish     - coating, material grade, exposure requirements
  misc       - ornamental / miscellaneous metals scope items
  exclude    - things that look like steel scope but are not ours
  status     - document status that affects whether to chase the job
  note       - general scope notes worth surfacing

`python sidecar/scope_vocab.py --doc` prints the vocabulary as Markdown for
review; `docs/scoping-vocabulary.md` is generated from it.
"""
import re
import sys

NUM = r"\d+(?:[ -]\d+/\d+|/\d+)?(?:\.\d+)?"
X = r"\s*[xX×]\s*"
DIA = r"(?:\"|″|”|\?|IN\.?|DIA\.?|Ø|⌀)?"

VOCAB = [
    # ── rolled shapes (beyond what shapes.py resolves) ─────────────────────
    dict(cat="Wide flange / beams", kind="member", pats=[rf"\bW\s?{NUM}{X}{NUM}\b", rf"\b(?:WT|WF|HP|S|M)\s?{NUM}{X}{NUM}\b", r"\bSTEEL BEAM\b", r"\bWIDE FLANGE\b"],
         ex=["W8X21", "W 10X33", "STEEL BEAM - SEE PLAN", "WT5X11"]),
    dict(cat="Channels", kind="member", pats=[rf"\b(?:MC|C)\s?{NUM}{X}{NUM}\b", r"\bCHANNEL\b"],
         ex=["C15X33.9", "MC18X42.7", "C 3X5"]),
    dict(cat="Angles", kind="member", pats=[rf"\b(?:\d\s*)?(?:L|ANG\.?|ANGLE)\s?{NUM}{X}{NUM}{X}{NUM}", r"\bANGLES?\b", r"\bLLB\b|\bSLB\b|\bLLV\b|\bLLH\b", r"\b2L\s?{NUM}"],
         ex=["L4X4X1/4", "2 ANG. 2X3X1/4 LLB", "ANGLE 3x3x1/4", "DECK SUPPORT ANGLE"]),
    dict(cat="HSS / tube", kind="member", pats=[rf"\bHSS\s?{NUM}{X}{NUM}", rf"\bTS\s?{NUM}{X}{NUM}", r"\bTUBE\s?STEEL\b", r"\bHSS\s+COLUMN\b", r"\bSQUARE TUBE\b|\bRECT(?:ANGULAR)?\.?\s+TUBE\b"],
         ex=["HSS6X6X3/8", "NEW HSS COLUMN", "TS4x4x1/4"]),
    dict(cat="Pipe", kind="member", pats=[rf"\b{NUM}\s?{DIA}\s*(?:DIA\.?\s*)?(?:STD|XS|XXS|SCH\.?\s?\d+)?\s*PIPE\b", rf"\bPIPE\s?{NUM}\s?(?:STD|XS|XXS|SCH\.?\s?\d+)\b", r"\bSTD\.?\s+PIPE\b|\bPIPE\s+COLUMN\b|\bPIPE\s+BOLLARD\b"],
         ex=['3" DIA. STD PIPE', "PIPE 4 STD", "6\" SCH 40 PIPE BOLLARD"]),
    dict(cat="Plate", kind="member", pats=[rf"\bPL\.?\s?{NUM}{DIA}\s?{X}", rf"\b{NUM}{DIA}\s*(?:THK\.?\s*)?(?:PL|PLATE)\b", r"\b(?:BASE|CAP|GUSSET|BENT|STIFFENER|SHEAR|END|TOP|WELD|EMBED(?:DED)?|CONT(?:INUOUS)?\.?|BEARING|SPLICE|COVER|CLIP)\s+PL(?:ATE)?S?\b", r"\bSTIFFENERS?\b|\bGUSSETS?\b"],
         ex=['PL3/4"x6 1/2"x1\'-0"', 'PL3/8"X4"X2\'-0"', "TOP PLATE", "BASE PL", "3/8\" PLATE"]),
    dict(cat="Bar", kind="member", pats=[rf"\b(?:FB|FLAT BAR|BAR)\s?{NUM}{X}{NUM}", rf"\b{NUM}{DIA}\s*(?:RD|ROUND|SQ|SQUARE)\s*(?:BAR|ROD)\b", r"\bFLAT BARS?\b|\bROUND BARS?\b|\bSQUARE BARS?\b"],
         ex=["FB 1/2 x 2", "BAR 3/8 x 3", '3/4" RD BAR']),
    dict(cat="Metal deck", kind="member", pats=[r"\b\d(?:\.\d)?\s?(?:B|F|N|VL|VLI|W|C|CD|PLB|PLN)\s?-?\s?\d\d\b", r"\b(?:ROOF|FLOOR|COMPOSITE|FORM|METAL|MTL\.?)\s+DECK(?:ING)?\b", r"\bDECK\s+SPAN\b|\bDECK TO BE\b", r"\bVERCO\b|\bVULCRAFT\b|\bCANAM\b|\bNEW MILLENNIUM\b", r"\b(?:16|18|20|22)\s?GA\.?\b"],
         ex=["1.5B 22 DECK", "3VLI20", "DECK TO BE 7.2 - 0.04 INCH THICK", "ROOF DECK"]),
    dict(cat="Joists", kind="member", pats=[r"\b\d\d\s?(?:K|LH|DLH|KCS)\s?\d+\b", r"\bJOIST GIRDER\b|\bOPEN WEB\b|\bBAR JOIST\b|\bSTEEL JOISTS?\b|\bBRIDGING\b"],
         ex=["24K7", "JOIST GIRDER", "BRIDGING"]),
    dict(cat="Headed studs / DBA", kind="connect", pats=[r"\b(?:HEADED|SHEAR|NELSON)\s+STUDS?\b", r"\bDBA\b|\bDEFORMED BAR ANCHORS?\b", rf"\b{NUM}{DIA}\s*(?:DIA\.?\s*)?{X}?\s*{NUM}{DIA}?\s+(?:HEADED\s+)?STUDS?\b"],
         ex=['3/4" DIA x 4" HEADED STUDS', "NELSON STUDS", "DBA"]),
    dict(cat="Anchor bolts / rods", kind="connect", pats=[r"\bANCHOR\s+(?:BOLTS?|RODS?)\b", r"\bA\.?B\.?\s?\d|\b\(\d+\)\s*A\.?B\.?\b", r"\bF1554\b|\bA307\b", rf"\(\d+\)\s*{NUM}{DIA}\s*(?:DIA\.?)?\s*[xX]\s*{NUM}{DIA}?(?=.*\bANCHORS?\b)"],
         ex=['(6) 3/4" DIA. x 4 1/2" ... ANCHORS', "ANCHOR BOLTS", "F1554 GR 36"]),
    dict(cat="Post-installed anchors / epoxy", kind="connect", pats=[r"\bHILTI\b|\bKWIK\s?BOLT\b|\bHY\s?-?\s?200\b|\bRE\s?-?\s?500\b|\bHIT-?\w*\b", r"\bEPOXY\b|\bADHESIVE ANCHORS?\b|\bEXPANSION ANCHORS?\b|\bWEDGE ANCHORS?\b|\bDRILL AND EPOXY\b", r"\bEMBEDMENT\b|\bEMBED\.?\b"],
         ex=["DRILL AND EPOXY", "HILTI HY200 EPOXY", 'DIA. X 6" EMBEDMENT']),
    dict(cat="High-strength bolts", kind="connect", pats=[r"\bA325\b|\bA490\b|\bF3125\b|\bTC\s?BOLTS?\b|\bTENSION CONTROL\b|\bSLIP[- ]CRITICAL\b|\bSNUG[- ]TIGHT\b", r"\bBOLTED\b"],
         ex=["A325 BOLTS", "SLIP-CRITICAL", "TC BOLTS"]),
    dict(cat="Moment connections", kind="connect", pats=[r"\bMOM+ENT\s+CONN?(?:ECTION)?S?\b", r"\bCJP\b|\bPJP\b|\bFULL[- ]PEN(?:ETRATION)?\b|\bCOMPLETE JOINT\b", r"\bMOMENT FRAME\b|\bSMF\b|\bIMF\b|\bOMF\b"],
         ex=["INDICATES MOMMENT CONNECTION", "INDICATE MEMBER END MOMENT CONNECTION", "CJP"]),
    dict(cat="Shear / standard connections", kind="connect", pats=[r"\bSHEAR\s+(?:TAB|PLATE|CONN)", r"\bSTANDARD AISC\b|\bAISC\s+(?:STANDARD|TYPICAL)\b|\bTYP(?:ICAL)?\.?\s+CONN(?:ECTION)?\b", r"\bSINGLE\s+PLATE\b|\bDOUBLE ANGLE\b|\bCLIP ANGLE\b|\bSEATED\b"],
         ex=["STANDARD AISC CONNECTION", "SHEAR TAB", "CLIP ANGLE"]),
    dict(cat="Welding", kind="connect", pats=[r"\bFIELD WELD(?:ED)?\b|\bSHOP WELD(?:ED)?\b|\bWELDED\b", r"\bFILLET WELD\b|\bE70XX\b|\bAWS D1\.\d\b", r"\bBEVEL\b|\bGRIND\s+SMOOTH\b"],
         ex=["FIELD WELDED", "E70XX", "AWS D1.1"]),
    dict(cat="Galvanizing", kind="finish", pats=[r"\bHOT[- ]DIP(?:PED)?\s+GALV(?:ANIZED)?\b", r"\bGALV(?:ANIZED|ANIZE|\.)?\b", r"\bHDG\b", r"\bA123\b|\bA153\b"],
         ex=["ALL STEEL TO BE HOT DIP GALVANIZED AFTER FABRICATION", "HDG", "GALV."]),
    dict(cat="Paint / coating", kind="finish", pats=[r"\bSHOP\s+PRIM(?:E|ER|ED)\b|\bPRIMED?\b|\bPRIMER\b", r"\bPAINT(?:ED)?\b|\bPOWDER[- ]COAT(?:ED)?\b|\bTNEMEC\b|\bSHERWIN\b|\bEPOXY COATING\b|\bURETHANE\b", r"\bINTUMESCENT\b|\bFIREPROOF(?:ING)?\b|\bSPRAY[- ]APPLIED\b"],
         ex=["SHOP PRIMER", "POWDER COAT", "INTUMESCENT"]),
    dict(cat="Architecturally exposed", kind="finish", pats=[r"\bAESS\b|\bARCHITECTURALLY EXPOSED\b|\bEXPOSED (?:STRUCTURAL )?STEEL\b", r"\bGRIND (?:ALL )?WELDS? SMOOTH\b|\bSEAL WELD(?:ED)?\b"],
         ex=["AESS", "ARCHITECTURALLY EXPOSED STRUCTURAL STEEL"]),
    dict(cat="Material grades", kind="finish", pats=[r"\bA992\b|\bA36\b|\bA500\b|\bA53\b|\bA572\b|\bGR(?:ADE)?\.?\s?50\b|\bA588\b|\bCOR-?TEN\b|\bWEATHERING\b", r"\bSTAINLESS\b|\b(?:304|316)\s?(?:SS|S\.S\.)\b|\bS\.?S\.?\s+STEEL\b"],
         ex=["A992 GR 50", "A500 GR B", "STAINLESS STEEL 316"]),
    # ── miscellaneous / ornamental ─────────────────────────────────────────
    dict(cat="Railings", kind="misc", pats=[r"\bHAND\s?RAIL(?:ING)?S?\b|\bGUARD\s?RAIL(?:ING)?S?\b|\bRAILINGS?\b|\bBALUSTERS?\b|\bPICKETS?\b|\bTOP RAIL\b|\bCABLE RAIL\b"],
         ex=["HANDRAIL", "GUARDRAIL", "PICKET"]),
    dict(cat="Stairs / ladders", kind="misc", pats=[r"\bSTAIRS?\b|\bSTRINGERS?\b|\bTREADS?\b|\bRISERS?\b|\bLANDINGS?\b|\bSTAIR NOSING\b", r"\bLADDERS?\b|\bSHIPS? LADDER\b|\bROOF ACCESS\b|\bCAGE\b"],
         ex=["STAIR STRINGER", "SHIP LADDER", "LANDING"]),
    dict(cat="Grating / checker plate", kind="misc", pats=[r"\bBAR GRATING\b|\bGRATING\b|\bW-?19-?4\b|\bSERRATED\b", r"\bCHECKER(?:ED)?\s+PL(?:ATE)?\b|\bDIAMOND PL(?:ATE)?\b|\bTREAD PL(?:ATE)?\b|\bFLOOR PL(?:ATE)?\b"],
         ex=["BAR GRATING", "CHECKER PLATE", "W-19-4"]),
    dict(cat="Canopies / awnings / screens", kind="misc", pats=[r"\bCANOPY\b|\bCANOPIES\b|\bAWNINGS?\b|\bTRELLIS\b|\bPERGOLA\b|\bSUN\s?SHADES?\b|\bLOUVERS?\b|\bSCREEN WALL\b|\bROOF SCREEN\b|\bEQUIPMENT SCREEN\b"],
         ex=["CANOPY FRAMING PLAN", "TRELLIS", "ROOF SCREEN"]),
    dict(cat="Gates / fences / bollards", kind="misc", pats=[r"\bGATES?\b|\bFENC(?:E|ING)\b|\bBOLLARDS?\b|\bCORNER GUARDS?\b|\bWHEEL STOPS?\b"],
         ex=["BOLLARD", "GATE", "CORNER GUARD"]),
    dict(cat="Platforms / supports / frames", kind="misc", pats=[r"\bMEZZANINE\b|\bPLATFORMS?\b|\bCATWALKS?\b|\bDUNNAGE\b|\bEQUIPMENT (?:SUPPORT|FRAME|RAIL)S?\b|\bROOF FRAMES?\b|\bCURB\b|\bSLEEPERS?\b|\bUNIT SUPPORT\b|\bRTU\b"],
         ex=["MEZZANINE", "EQUIPMENT SUPPORT FRAME", "DUNNAGE"]),
    dict(cat="Lintels / misc angles", kind="misc", pats=[r"\bLINTELS?\b|\bLOOSE LINTEL\b|\bSHELF ANGLE\b|\bRELIEVING ANGLE\b|\bDECK SUPPORT ANGLE\b|\bEDGE ANGLE\b|\bPOUR STOP\b|\bCLOSURE\b"],
         ex=["LOOSE LINTEL", "SHELF ANGLE", "POUR STOP"]),
    dict(cat="Elevator / pit", kind="misc", pats=[r"\bELEVATOR\b|\bELEV\.?\s+(?:PIT|SILL|DIVIDER|HOIST)\b|\bPIT LADDER\b|\bSILL ANGLE\b|\bDIVIDER BEAM\b|\bHOIST BEAM\b"],
         ex=["ELEVATOR PIT LADDER", "HOIST BEAM", "SILL ANGLE"]),
    dict(cat="Embeds", kind="connect", pats=[r"\bEMBED(?:DED)?\s+PL(?:ATE)?S?\b|\bEMBEDS?\b|\bWELD PL(?:ATE)?S?\b|\bEDGE PL(?:ATE)?\b"],
         ex=["EMBED PLATE", "WELD PLATE", "EMBEDS"]),
    # ── things that are not our steel ──────────────────────────────────────
    dict(cat="Existing / not in contract", kind="exclude", pats=[r"\bEXISTING\b|\bEXIST\.?\b|\(E\)", r"\bBY OTHERS\b|\bN\.?I\.?C\.?\b|\bNOT IN CONTRACT\b|\bOWNER FURNISHED\b|\bDEMO(?:LISH|LITION)?\b|\bREMOVE\b|\bTO REMAIN\b"],
         ex=["EXISTING CONCRETE COLUMN", "BY OTHERS", "N.I.C."]),
    dict(cat="Wood / cold-formed / other trades", kind="exclude", pats=[r"\bWOOD\b|\bLUMBER\b|\bGLU-?LAM\b|\bLVL\b|\bPSL\b|\bTIMBER\b|\bPLYWOOD\b", r"\bCOLD[- ]FORMED\b|\bCFS\b|\bLIGHT[- ]GA(?:UGE)?\b|\bMETAL STUDS?\b|\bTRACK\b", r"\bHOLLOW METAL\b|\bH\.?M\.?\s+(?:DOOR|FRAME)\b", r"\bPRECAST\b|\bREBAR\b|\bREINF(?:ORCING)?\b|\b#\d\s?(?:BARS?|@)\b|\bCMU\b|\bMASONRY\b"],
         ex=['8" DIA. WOOD GUN BARREL POST', "COLD-FORMED", "PRECAST"]),
    dict(cat="Concrete / foundations", kind="exclude", pats=[r"\bSLAB[- ]ON[- ]GRADE\b|\bELEVATED SLAB\b|\bSLAB\b|\bFOOTINGS?\b|\bPIERS?\b|\bPIER (?:BELL|SHAFT)\b|\bGRADE BEAMS?\b|\bT\.?O\.?\s?(?:GB|SLAB|CONC|FTG|PIER)\b|\bCAISSONS?\b|\bDRILLED (?:PIER|SHAFT)S?\b|\bCONCRETE\b|\bCONC\.?\b"],
         ex=["SLAB-ON-GRADE", "PIER BELL", "T.O.GB", "EXISTING CONCRETE"]),
    dict(cat="Aluminum", kind="exclude", pats=[r"\bALUMIN(?:UM|IUM)\b|\bALUM\.?\b|\bASTM B\s?209\b|\b6061\b|\b6063\b"],
         ex=["ALUMINUM ASSOCIATION", "ASTM B 209", "6061-T6"]),
    # ── document status / scope notes ──────────────────────────────────────
    dict(cat="Document status", kind="status", pats=[r"\bPROGRESS SET\b|\bNOT FOR CONSTRUCTION\b|\bPRELIMINARY\b|\bFOR REVIEW\b|\bPERMIT SET\b|\bBID SET\b|\bISSUE(?:D)? FOR (?:BID|CONSTRUCTION|PERMIT|PRICING)\b|\bIFC\b|\bADDENDUM\b|\bREVISION\b|\bDD\b|\bCD\b|\b\d\d% (?:DD|CD|SD)\b"],
         ex=["PROGRESS SET", "PRELIMINARY PRICING", "NOT FOR CONSTRUCTION"]),
    dict(cat="Scope notes", kind="note", pats=[r"\bALL STEEL\b|\bSTRUCTURAL STEEL\b|\bMISC(?:ELLANEOUS)?\.?\s+(?:STEEL|METALS?)\b|\bORNAMENTAL\b|\bSTEEL FABRICATOR\b|\bSHOP DRAWINGS?\b|\bERECT(?:ION|OR)\b", r"\bSEE (?:PLAN|ARCH(?:ITECTURAL)?\.?|STRUCT(?:URAL)?\.?|DETAIL)\b|\bRE:\s?(?:ARCH|STRUCT)"],
         ex=["ALL STEEL TO BE ...", "RE: ARCH.", "SEE PLAN"]),
]

_COMPILED = [(v, [re.compile(p, re.I) for p in v["pats"]]) for v in VOCAB]


def clean(text):
    """Tame OCR/encoding noise before matching."""
    t = text.replace("″", '"').replace("”", '"').replace("′", "'").replace("×", "x")
    t = t.replace("?", '"')          # RapidOCR renders inch marks as '?'
    return t.upper()


def scan(lines, window=2, extra=()):
    """{category: {"kind", "hits": [(line, match)]}} over text lines in reading
    order.  Phrases that wrap ("(6) 3/4\" DIA. x 4 1/2\"" / "ANCHORS") are
    caught by also matching each run of `window` consecutive lines and each
    string in `extra` (whole text blocks); such a hit counts once and only
    when none of its own lines already matched that category."""
    lines = [l for l in lines if l and l.strip()]
    found = {}
    seen = set()

    def note(v, text, m, once=False):
        if once:
            key = (v["cat"], text)
            if key in seen:
                return
            seen.add(key)
        found.setdefault(v["cat"], {"kind": v["kind"], "hits": []})["hits"].append((text.strip(), m))

    single_hits = {}
    for i, raw in enumerate(lines):
        t = clean(raw)
        for v, regs in _COMPILED:
            for r in regs:
                m = r.search(t)
                if m:
                    note(v, raw, m.group(0))          # every occurrence counts
                    single_hits.setdefault(v["cat"], set()).add(i)
                    break
    if window > 1:
        for i in range(len(lines) - window + 1):
            joined = " ".join(lines[i:i + window])
            t = clean(joined)
            for v, regs in _COMPILED:
                if any(j in single_hits.get(v["cat"], ()) for j in range(i, i + window)):
                    continue                      # already caught on a single line
                for r in regs:
                    m = r.search(t)
                    if m:
                        note(v, joined, m.group(0), once=True)
                        break
    for block in extra:
        t = clean(block)
        for v, regs in _COMPILED:
            hit_lines = [lines[j] for j in single_hits.get(v["cat"], ())]
            if any(h and h in block for h in hit_lines):
                continue
            for r in regs:
                m = r.search(t)
                if m:
                    note(v, block, m.group(0), once=True)
                    break
    return found


def as_markdown():
    out = ["# Scoping vocabulary (draft, 2026-09-04)", "",
           "What the scoping tool looks for on a drawing set, by category. Patterns run on every text line",
           "(text layer or OCR) of every sheet. Edit `sidecar/scope_vocab.py`; this file is generated from it",
           "with `python sidecar/scope_vocab.py --doc > docs/scoping-vocabulary.md`.", "",
           "Kinds: **member** = fabricated item, **connect** = connection/anchorage labor, **finish** = coating/grade,",
           "**misc** = ornamental/miscellaneous metals, **exclude** = looks like steel but is not ours,",
           "**status** = document status, **note** = scope language.", "",
           "| Category | Kind | Catches (examples) | Patterns |", "|---|---|---|---|"]
    for v in VOCAB:
        ex = ", ".join(f"`{e}`" for e in v["ex"])
        pats = "<br>".join(f"`{p}`" for p in v["pats"])
        out.append(f"| {v['cat']} | {v['kind']} | {ex} | {pats} |")
    out += ["", "## Open questions for Todd / Samantha", "",
            "- Which misc categories does Berger actually bid (railings, stairs, grating, canopies, gates, elevator)? Drop the rest to cut noise.",
            "- Is aluminum ever ours (ornamental)? Today it is flagged as an exclusion.",
            "- Deck: flag only, or count squares? The plan hatches give area if we ever want it.",
            "- Anything you routinely find on architectural sheets that structural sheets never show (canopy fascia, screen walls, signage supports)?",
            "- Words your engineers use that are missing here: send examples and they go straight into the table."]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    if "--doc" in sys.argv:
        sys.stdout.reconfigure(encoding="utf-8")
        print(as_markdown(), end="")
    else:
        for line in sys.stdin:
            for cat, info in scan([line]).items():
                print(f"{cat:32} {info['hits'][0][1]!r}  <- {line.strip()[:70]}")
