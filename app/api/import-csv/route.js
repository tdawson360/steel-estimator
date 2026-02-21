import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import prisma from '../../../lib/db';

// ── SHAPE SIZE NORMALIZATION ──────────────────────────────────────────────────

// Fixes UTF-8 mojibake (× encoded as Windows-1252 → "Ã—") and strips inch marks.
// Preserves industry conventions: fractions for plates (3/4), decimals for HSS (.25).
function normalizeShapeSize(raw) {
  if (!raw) return raw;
  let s = raw;
  // Fix mojibake: × (U+00D7) mis-decoded as Windows-1252 produces "Ã" + 0x97
  s = s.replace(/Ã[\u0097\u00d7×—]/g, 'x');
  // Replace any remaining true Unicode multiplication sign
  s = s.replace(/[×\u00d7]/g, 'x');
  // Strip inch marks
  s = s.replace(/"/g, '');
  return s.trim();
}

// ── LABOR OPERATION MAPS ─────────────────────────────────────────────────────

const END_LABOR_MAP = {
  'Straight':     'Cut- Straight',
  'Miter':        'Cut- Miter',
  'Double Miter': 'Cut- Double Miter',
  'Single Cope':  'Cut- Single Cope End',
  'Double Cope':  'Cut- Double Cope End',
  'Profile':      'Cut- Profile',
};

const HOLE_MAP = {
  'Drill':       'Drill Holes',
  'Drill & C\'sink': 'Drill & C\'sink Holes',
  'Drill & Tap': 'Drill & Tap Holes',
  'Drill Thru':  'Drill Thru Holes',
};

const WELD_MAP = {
  'Fillet':      'Welding- Fillet',
  'Bevel/Grind': 'Welding- Bevel/Grind',
  'PJP':         'Welding- PJP',
  'CJP':         'Welding- CJP',
};

const CONNECTION_MAP = {
  'WF Connx':        'WF Connx',
  'C Connx':         'C Connx',
  'WF Moment Connx': 'WF Moment Connx',
  'C Moment Connx':  'C Moment Connx',
  'Loose':           'Loose',
};

const PREP_MAP = {
  "Ease":   "Ease",
  "Splice": "Splice",
  "90's":   "90's",
  "Camber": "Camber",
  "Roll":   "Roll",
};

// ── CSV PARSING ──────────────────────────────────────────────────────────────

// Parse a single CSV line handling quoted fields (mirrors client-side parseCSVLine)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse the 19-column takeoff CSV
function parseTakeoffCSV(text) {
  // Strip BOM
  let clean = text;
  if (clean.charCodeAt(0) === 0xFEFF || clean.startsWith('\uFEFF')) {
    clean = clean.slice(1);
  }

  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    return { error: 'CSV file is empty or has no data rows', rawRows: [] };
  }

  const headers = parseCSVLine(lines[0]).map(h => h.trim());

  // Build column index map by header name (case-insensitive)
  const colIndex = {};
  headers.forEach((h, i) => { colIndex[h.toLowerCase().replace(/\s+/g, '_')] = i; });

  // Helper to get a value by one of the possible column name variants
  const col = (row, ...names) => {
    for (const name of names) {
      const key = name.toLowerCase().replace(/\s+/g, '_');
      if (key in colIndex) return (row[colIndex[key]] || '').trim();
    }
    return '';
  };

  // Validate required columns
  const requiredCols = ['item_number', 'shape_size', 'quantity', 'length_ft'];
  const missing = requiredCols.filter(c => !(c in colIndex));
  if (missing.length > 0) {
    return {
      error: `Missing required columns: ${missing.join(', ')}. Found: ${headers.join(', ')}`,
      rawRows: []
    };
  }

  const rawRows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.every(v => !v)) continue; // skip blank lines

    const qty = parseInt(col(values, 'Quantity') || '0') || 0;
    const lengthFt = parseFloat(col(values, 'Length_Ft', 'Length') || '0') || 0;

    rawRows.push({
      lineNum:        i + 1,
      itemNumber:     col(values, 'Item_Number', 'Item #', 'Item Number'),
      itemDescription: col(values, 'Item_Description', 'Item Description'),
      memberMark:     col(values, 'Member_Mark', 'Member Mark'),
      partLabel:      col(values, 'Part_Label', 'Part Label'),
      drawingRef:     col(values, 'Drawing_Ref', 'Drawing Ref'),
      shapeSize:      normalizeShapeSize(col(values, 'Shape_Size', 'Shape Size', '(Non-Flat) Mat Size', 'Mat Size')),
      quantity:       qty,
      lengthFt:       lengthFt,
      end1Labor:      col(values, 'End_1_Labor', 'End 1 Labor'),
      end2Labor:      col(values, 'End_2_Labor', 'End 2 Labor'),
      holes:          col(values, 'Holes'),
      holeQty:        parseInt(col(values, 'Hole_Qty', 'Hole Qty') || '0') || 0,
      weldType:       col(values, 'Weld_Type', 'Weld Type'),
      connectionType: col(values, 'Connection_Type', 'Connection Type'),
      connectionQty:  parseInt(col(values, 'Connection_Qty', 'Connection Qty') || '0') || 1,
      prepOps:        col(values, 'Prep_Ops', 'Prep Ops'),
      coating:        col(values, 'Coating'),
      galvanized:     col(values, 'Galvanized').toLowerCase() === 'yes',
      notes:          col(values, 'Notes'),
    });
  }

  if (rawRows.length === 0) {
    return { error: 'No valid data rows found in CSV', rawRows: [] };
  }

  return { error: null, rawRows };
}

// ── LABOR OPERATION GENERATORS ───────────────────────────────────────────────

// Generate cut operations for one end labor value (handles compound " + " ops)
function generateEndLabor(value) {
  if (!value) return [];
  const ops = [];
  // Check for compound operations first
  if (value.includes(' + ')) {
    const parts = value.split(' + ');
    for (const part of parts) {
      const mapped = END_LABOR_MAP[part.trim()];
      if (mapped) ops.push({ operation: mapped, quantity: 1, unit: 'EA' });
    }
  } else {
    const mapped = END_LABOR_MAP[value];
    if (mapped) ops.push({ operation: mapped, quantity: 1, unit: 'EA' });
  }
  return ops;
}

// Generate all fab ops for a single CSV row
function generateRowFabOps(row) {
  const ops = [];

  // End cuts
  for (const endOp of generateEndLabor(row.end1Labor)) ops.push(endOp);
  for (const endOp of generateEndLabor(row.end2Labor)) ops.push(endOp);

  // Drilling
  if (row.holes && row.holeQty > 0) {
    const mapped = HOLE_MAP[row.holes];
    if (mapped) ops.push({ operation: mapped, quantity: row.holeQty, unit: 'EA' });
  }

  // Welding
  if (row.weldType) {
    const mapped = WELD_MAP[row.weldType];
    if (mapped) ops.push({ operation: mapped, quantity: 1, unit: 'EA' });
  }

  // Connection
  if (row.connectionType) {
    const mapped = CONNECTION_MAP[row.connectionType];
    if (mapped) {
      ops.push({ operation: mapped, quantity: row.connectionQty || 1, unit: 'EA' });
    }
  }

  // Prep operations
  if (row.prepOps) {
    const mapped = PREP_MAP[row.prepOps];
    if (mapped) ops.push({ operation: mapped, quantity: 1, unit: 'EA' });
  }

  // Coating is NOT added here — handled at item level in aggregation

  return ops;
}

// ── MEMBER MARK HELPERS ──────────────────────────────────────────────────────

// A mark is a parent if it has no dot OR ends in ".0"
function parseMarkIsParent(mark) {
  if (!mark) return true;
  if (!mark.includes('.')) return true;
  if (mark.endsWith('.0')) return true;
  return false;
}

// Get the base key (part before first dot) for parent/child grouping
function getMarkBase(mark) {
  if (!mark) return mark;
  const dotIdx = mark.indexOf('.');
  return dotIdx === -1 ? mark : mark.slice(0, dotIdx);
}

// ── AGGREGATION ──────────────────────────────────────────────────────────────

// Merge fab ops arrays: accumulate quantities for drill/connection ops,
// deduplicate cuts/welds (keep first occurrence)
function mergeFabOps(existing, incoming) {
  const ACCUMULATE_OPS = new Set([
    'Drill Holes', "Drill & C'sink Holes", 'Drill & Tap Holes', 'Drill Thru Holes',
    'WF Connx', 'C Connx', 'WF Moment Connx', 'C Moment Connx', 'Loose',
  ]);

  const result = [...existing];
  for (const op of incoming) {
    const idx = result.findIndex(e => e.operation === op.operation);
    if (idx !== -1) {
      if (ACCUMULATE_OPS.has(op.operation)) {
        result[idx] = { ...result[idx], quantity: result[idx].quantity + op.quantity };
      }
      // else deduplicate — skip
    } else {
      result.push({ ...op });
    }
  }
  return result;
}

function aggregateTakeoffData(rawRows) {
  // itemsMap: itemNumber -> { itemName, drawingRef, membersMap, coatingValues[] }
  const itemsMap = new Map();

  for (const row of rawRows) {
    if (!row.itemNumber) continue;

    // Get or create item bucket
    if (!itemsMap.has(row.itemNumber)) {
      itemsMap.set(row.itemNumber, {
        itemNumber:   row.itemNumber,
        itemName:     row.itemDescription || '',
        drawingRef:   row.drawingRef || '',
        membersMap:   new Map(), // memberMark -> member object
        coatingValues: [],       // one entry per row (including blank)
      });
    }
    const item = itemsMap.get(row.itemNumber);

    // Update item name / drawing ref from first non-blank occurrence
    if (!item.itemName && row.itemDescription) item.itemName = row.itemDescription;
    if (row.drawingRef && !item.drawingRef.split(',').map(s => s.trim()).includes(row.drawingRef)) {
      item.drawingRef = item.drawingRef
        ? item.drawingRef + ', ' + row.drawingRef
        : row.drawingRef;
    }

    // Track coating for aggregation
    item.coatingValues.push(row.coating || '');

    // Generate fab ops for this row
    const rowFabOps = generateRowFabOps(row);

    // Member mark (default to a placeholder if blank)
    const mark = row.memberMark || `${row.itemNumber}-${row.lineNum}`;
    const isParent = parseMarkIsParent(mark);
    const base = getMarkBase(mark);

    if (!item.membersMap.has(mark)) {
      item.membersMap.set(mark, {
        mark,
        isParent,
        base,
        description: row.partLabel || '',
        size: row.shapeSize || '',
        length: row.lengthFt,
        pieces: row.quantity,
        galvanized: row.galvanized,
        fabrication: [],
        children: [],
      });
    }

    const member = item.membersMap.get(mark);
    // Accumulate pieces if the same mark appears multiple times
    member.pieces += row.quantity;
    // Merge fab ops
    member.fabrication = mergeFabOps(member.fabrication, rowFabOps);
    // Update galvanized if any row says yes
    if (row.galvanized) member.galvanized = true;
  }

  // Build output items array
  const items = [];
  let totalMembers = 0;
  let totalFabOps = 0;

  for (const [, item] of itemsMap) {
    // Coating aggregation
    const nonBlank = item.coatingValues.filter(c => c !== '');
    const uniqueCoatings = [...new Set(nonBlank)];
    let coatingUniform = null;
    let coatingMixed = false;
    const coatingMixedValues = [];

    if (nonBlank.length === item.coatingValues.length && uniqueCoatings.length === 1) {
      // All rows have the same non-blank coating
      coatingUniform = uniqueCoatings[0];
    } else if (nonBlank.length > 0) {
      // Some blank or multiple different values
      coatingMixed = true;
      coatingMixedValues.push(...uniqueCoatings);
    }

    // Build member hierarchy: nest children under parents
    const parents = [];      // { member, children[] }
    const orphans = [];      // children whose parent mark isn't found

    // Separate parents and children
    const allMembers = [...item.membersMap.values()];
    const parentMap = new Map(); // base -> parent member

    for (const member of allMembers) {
      if (member.isParent) {
        member.children = [];
        parents.push(member);
        parentMap.set(member.base, member);
      }
    }

    for (const member of allMembers) {
      if (!member.isParent) {
        const parent = parentMap.get(member.base);
        if (parent) {
          parent.children.push(member);
        } else {
          // Promote orphan to parent
          member.isParent = true;
          member.children = [];
          parents.push(member);
        }
      }
    }

    // Count stats
    const memberCount = allMembers.length;
    let fabOpCount = 0;
    for (const m of allMembers) fabOpCount += m.fabrication.length;
    totalMembers += memberCount;
    totalFabOps += fabOpCount;

    items.push({
      itemNumber:         item.itemNumber,
      itemName:           item.itemName,
      drawingRef:         item.drawingRef,
      members:            parents,
      coatingUniform,
      coatingMixed,
      coatingMixedValues,
    });
  }

  // Sort items numerically
  items.sort((a, b) => {
    const na = parseFloat(a.itemNumber) || 0;
    const nb = parseFloat(b.itemNumber) || 0;
    return na - nb || a.itemNumber.localeCompare(b.itemNumber);
  });

  return {
    items,
    stats: {
      totalItems:   items.length,
      totalMembers,
      totalFabOps,
    },
  };
}

// ── CONNECTION PRICING ENRICHMENT ─────────────────────────────────────────────

// Convert "W 16 x 26" or "W16x26" to the DB key format "W16X26"
function normalizeToBeamSizeKey(shapeSize) {
  if (!shapeSize) return null;
  return shapeSize.replace(/\s+/g, '').replace(/x/g, 'X').toUpperCase();
}

// Determine DB shapeType ("WF" or "C") from a normalized beam size key
function getShapeTypeFromKey(key) {
  if (!key) return null;
  if (/^W\d/.test(key)) return 'WF';
  if (/^(C|MC)\d/.test(key)) return 'C';
  return null;
}

// Cut operation → cost field name on BeamConnectionData / ConnectionCategory
const CUT_COST_FIELD = {
  'Cut- Straight':           'straightCutCost',
  'Cut- Miter':              'miterCutCost',
  'Cut- Double Miter':       'doubleMiterCost',
  'Cut- Single Cope End':    'singleCopeCost',
  'Cut- Double Cope End':    'doubleCopeCost',
  'Cut- Single Cope + Miter':'singleCopeMiterCost',
  'Cut- Double Cope + Miter':'doubleCopeMiterCost',
};

// Connection operation → cost + weight field names
const CONN_PRICING = {
  'WF Connx':        { costField: 'connxCost',       weightField: 'connxWeightLbs' },
  'WF Moment Connx': { costField: 'momentConnxCost',  weightField: 'momentConnxWeightLbs' },
  'C Connx':         { costField: 'connxCost',        weightField: 'connxWeightLbs' },
  'C Moment Connx':  { costField: 'momentConnxCost',  weightField: 'momentConnxWeightLbs' },
};

// Enrich each member's fabrication ops with rate and connWeight from the DB.
// Uses BeamConnectionData for exact beam matches; falls back to ConnectionCategory.
async function enrichItemsWithPricing(items) {
  // Collect all unique normalized beam size keys
  const sizeKeys = new Set();
  const walkMembers = (members) => {
    for (const m of members) {
      const key = normalizeToBeamSizeKey(m.size);
      if (key) sizeKeys.add(key);
      if (m.children?.length) walkMembers(m.children);
    }
  };
  for (const item of items) walkMembers(item.members);
  if (sizeKeys.size === 0) return;

  // Fetch shop labor rate (needed to compute WF connection costs from laborHours)
  const rates = await prisma.pricingRates.findUnique({ where: { id: 1 } });
  const shopLaborRate = rates?.shopLaborRatePerHr ?? 65;

  // Batch-fetch beam-specific records, including their parent category (for laborHours)
  const beamRows = await prisma.beamConnectionData.findMany({
    where: { beamSize: { in: [...sizeKeys] } },
    include: { category: true },
  });
  const beamMap = new Map(beamRows.map(b => [b.beamSize, b]));

  // Fetch all categories for fallback (small table, always cheap)
  const cats = await prisma.connectionCategory.findMany();
  const catByPrefix = new Map();
  for (const cat of cats) {
    for (const prefix of cat.shapesIncluded.split(',').map(s => s.trim())) {
      catByPrefix.set(`${cat.shapeType}:${prefix}`, cat);
    }
  }

  // Look up pricing data for a given normalized size key
  const getPricing = (key) => {
    if (beamMap.has(key)) return beamMap.get(key);
    const shapeType = getShapeTypeFromKey(key);
    if (!shapeType) return null;
    const m = key.match(/^(MC\d+|W\d+|C\d+)/);
    if (!m) return null;
    return catByPrefix.get(`${shapeType}:${m[1]}`) ?? null;
  };

  // Resolve connection cost from a pricing row.
  // WF categories store no connxCost — cost is laborHours × shopLaborRate.
  // C/MC categories store an explicit connxCost.
  // "Provide T/O" beams (W44/W40/W36/W33) return null — estimator fills in manually.
  const getConnxCost = (row, isMoment) => {
    const costField = isMoment ? 'momentConnxCost' : 'connxCost';

    // Explicit dollar value present (C/MC beams/categories, or beam-level override)
    if (row[costField] != null) return row[costField];

    // Check "provide T/O" flag — beam rows have per-type flags, categories have one flag
    const provideTO = isMoment
      ? (row.momentConnxCostProvideTO ?? row.providesTakeoffCost ?? false)
      : (row.connxCostProvideTO ?? row.providesTakeoffCost ?? false);
    if (provideTO) return null;

    // Compute from laborHours (WF connections — beam row defers to its category)
    const laborHours = row.laborHours ?? row.category?.laborHours;
    if (laborHours != null) return parseFloat((laborHours * shopLaborRate).toFixed(2));

    return null;
  };

  // Add rate and connWeight to a fabrication op given the pricing row
  const enrichOp = (op, pricingRow) => {
    if (!pricingRow) return op;

    // Cut operations — direct field lookup
    const cutField = CUT_COST_FIELD[op.operation];
    if (cutField) {
      const cost = pricingRow[cutField];
      if (cost != null) return { ...op, rate: cost };
      return op;
    }

    // Connection operations — computed cost + weight
    const connFields = CONN_PRICING[op.operation];
    if (connFields) {
      const isMoment = op.operation.includes('Moment');
      const cost = getConnxCost(pricingRow, isMoment);
      const weight = pricingRow[connFields.weightField];
      return {
        ...op,
        ...(cost != null ? { rate: cost } : {}),
        ...(weight != null ? { connWeight: weight } : {}),
      };
    }

    return op;
  };

  // Walk all members and enrich fabrication ops in-place
  const enrichMember = (member) => {
    const key = normalizeToBeamSizeKey(member.size);
    const pricingRow = key ? getPricing(key) : null;
    if (pricingRow) {
      member.fabrication = member.fabrication.map(op => enrichOp(op, pricingRow));
    }
    if (member.children?.length) member.children.forEach(enrichMember);
  };

  for (const item of items) item.members.forEach(enrichMember);
}

// ── ROUTE HANDLER ─────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const { error, rawRows } = parseTakeoffCSV(text);

    if (error) {
      return NextResponse.json({ error }, { status: 422 });
    }

    const result = aggregateTakeoffData(rawRows);
    await enrichItemsWithPricing(result.items);

    return NextResponse.json({ success: true, ...result });

  } catch (err) {
    console.error('import-csv error:', err);
    return NextResponse.json({ error: 'Failed to process CSV file' }, { status: 500 });
  }
}
