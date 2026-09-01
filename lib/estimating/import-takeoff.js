// Takeoff CSV import engine (Neilsoft/Bluebeam 19-column template):
// row parsing with quantity defaults and 1" length tolerance, labor-op
// generation, member-mark keying, and consolidation.
//
// FINDINGS.md #4 lives here, frozen: consolidateMembers accumulates fab
// quantities POSITIONALLY (safe because generation order is deterministic).
// Session B evaluated switching to keyed matching — the characterization
// suite proved outputs are NOT identical on order-shuffled inputs (the frozen
// test asserts the positional cross-sum), so per the session rules it stays
// positional.

import { normalizeShapeSize } from './sizes';

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
  'Fillet':      'Apply- Fillet Weld',
  'Bevel/Grind': 'Apply- Bevel/Weld/Grind',
  'PJP':         'Apply- PJP Weld',
  'CJP':         'Apply- CJP Weld',
};

const CONNECTION_MAP = {
  'WF Connx':        'WF Connx',
  'C Connx':         'C Connx',
  'WF Moment Connx': 'WF Moment Connx',
  'C Moment Connx':  'C Moment Connx',
  'Loose':           'Loose',
  // All-in standard connections (v1.8 takeoff values; CJP = Moment pricing)
  'WF Bolted':       'WF Bolted',
  'WF Welded':       'WF Welded',
  'WF CJP':          'WF Moment Connx',
  'C Bolted':        'C Bolted',
  'C Welded':        'C Welded',
  'C CJP':           'C Moment Connx',
};

const PREP_MAP = {
  "Ease":   "Ease",
  "Splice": "Splice",
  "90's":   "90's",
  "Camber": "Camber",
  "Roll":   "Roll",
};

// ── CSV PARSING ──────────────────────────────────────────────────────────────

// Parse a feet-inches dimension string like 28'-1", 23'-0", 17'-8 1/2" into
// decimal feet. Returns null when the string isn't a plain dimension.
function parseFeetInches(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d+)'\s*(?:-\s*(\d+)(?:\s+(\d+)\/(\d+))?\s*"?)?$/);
  if (!m) return null;
  const feet = parseInt(m[1]);
  let inches = m[2] ? parseInt(m[2]) : 0;
  if (m[3] && m[4]) inches += parseInt(m[3]) / parseInt(m[4]);
  return feet + inches / 12;
}

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

  // The Bluebeam profile offers an explicit "None" choice (a whitespace-only
  // choice item isn't reliably selectable in Revu); it means "no operation"
  const noneToBlank = (value) => (value.toLowerCase() === 'none' ? '' : value);

  // Validate required columns. Each entry is a group of acceptable header
  // aliases (normalized to lower_snake) — the group is satisfied if any present.
  const requiredCols = [
    { label: 'Item_Number', aliases: ['item_number', 'item_#', 'item'] },
    { label: 'Shape_Size', aliases: ['shape_size', '(non-flat)_mat_size', 'mat_size'] },
    { label: 'Quantity', aliases: ['quantity'] },
    { label: 'Length_Ft', aliases: ['length_ft', 'length', 'measured_length'] },
  ];
  const missing = requiredCols
    .filter(g => !g.aliases.some(a => a in colIndex))
    .map(g => g.label);
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

    // One row = one drawn piece: Bluebeam profiles often leave Quantity blank
    // for single pieces, so blank/0 counts as 1 (blank-qty rows previously
    // collapsed to a single piece no matter how many rows matched).
    const qty = parseInt(col(values, 'Quantity') || '1') || 1;
    // Length arrives in either of two columns by design: takeoff users type a
    // known dimension into Length_Ft, or measure only and let the profile's
    // Measured_Length formula carry it. A typed Length_Ft wins as an override;
    // a blank cell falls through to the next column instead of importing as 0.
    // Bluebeam's built-in Length (a feet-inches string like 28'-1") is the
    // last resort and needs the dimension parser, not parseFloat.
    let lengthStr = '';
    for (const name of ['Length_Ft', 'Measured Length', 'Length']) {
      lengthStr = col(values, name);
      if (lengthStr) break;
    }
    let lengthFt = parseFeetInches(lengthStr) ?? (parseFloat(lengthStr || '0') || 0);

    // Estimating tolerance is 1", but Bluebeam's measured length carries
    // snap/scale noise (the same 28'-1" piece exports as 28.07 and 28.05).
    // Prefer the drawn dimension string (Comments column, e.g. 28'-1") when it
    // agrees with the measurement within 2"; otherwise round the measurement
    // to the nearest inch. Identical pieces then merge instead of splitting.
    if (lengthFt > 0) {
      const drawnFt = parseFeetInches(col(values, 'Comments'));
      if (drawnFt != null && drawnFt > 0 && Math.abs(drawnFt - lengthFt) <= 2 / 12) {
        lengthFt = drawnFt;
      } else {
        lengthFt = Math.max(Math.round(lengthFt * 12), 1) / 12;
      }
      // Estimators read decimal feet at 2 places (28'-1" → 28.08)
      lengthFt = +lengthFt.toFixed(2);
    }

    rawRows.push({
      lineNum:        i + 1,
      itemNumber:     col(values, 'Item_Number', 'Item #', 'Item Number'),
      itemDescription: col(values, 'Item_Description', 'Item Description'),
      memberMark:     col(values, 'Member_Mark', 'Member Mark'),
      partLabel:      col(values, 'Part_Label', 'Part Label'),
      pageLabel:      col(values, 'Page_Label', 'Page Label'),
      drawingRef:     col(values, 'Drawing_Ref', 'Drawing Ref'),
      shapeSize:      normalizeShapeSize(col(values, 'Shape_Size', 'Shape Size', '(Non-Flat) Mat Size', 'Mat Size')),
      quantity:       qty,
      lengthFt:       lengthFt,
      end1Labor:      col(values, 'End_1_Labor', 'End 1 Labor'),
      end2Labor:      col(values, 'End_2_Labor', 'End 2 Labor'),
      holes:          col(values, 'Holes'),
      holeQty:        parseInt(col(values, 'Hole_Qty', 'Hole Qty') || '0') || 0,
      weldType:       noneToBlank(col(values, 'Weld_Type', 'Weld Type')),
      connectionType: noneToBlank(col(values, 'Connection_Type', 'Connection Type')),
      connectionQty:  parseInt(col(values, 'Connection_Qty', 'Connection Qty') || '0') || 1,
      prepOps:        noneToBlank(col(values, 'Prep_Ops', 'Prep Ops')),
      coating:        noneToBlank(col(values, 'Coating')),
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

// ── CONSOLIDATION ────────────────────────────────────────────────────────────

// Build a canonical fingerprint from a member's data so that identical pieces
// (same size, length, description, galvanized status, and fab ops) can be merged
// regardless of their member marks.
function memberFingerprint(member) {
  const fabKey = member.fabrication
    .map(f => `${f.operation}:${f.quantity}:${f.unit}`)
    .sort()
    .join('|');
  return [
    member.size,
    member.length.toFixed(4),
    member.description,
    member.galvanized ? 'G' : '',
    fabKey,
  ].join('||');
}

// Consolidate identical members within a list, summing their pieces.
// Recursively consolidates children within each consolidated parent.
function consolidateMembers(members) {
  const groups = new Map();   // fingerprint -> consolidated member
  const order = [];           // preserve first-seen order

  for (const member of members) {
    const fp = memberFingerprint(member);
    if (groups.has(fp)) {
      const existing = groups.get(fp);
      existing.pieces += member.pieces;
      existing.consolidatedMarks.push(member.mark);
      // Accumulate fab op quantities from the merged member
      for (let i = 0; i < existing.fabrication.length; i++) {
        if (member.fabrication[i]) {
          existing.fabrication[i] = {
            ...existing.fabrication[i],
            quantity: existing.fabrication[i].quantity + member.fabrication[i].quantity,
          };
        }
      }
      // Pool children from merged parents
      existing.children.push(...(member.children || []));
    } else {
      const consolidated = {
        ...member,
        consolidatedMarks: [member.mark],
        children: [...(member.children || [])],
      };
      groups.set(fp, consolidated);
      order.push(fp);
    }
  }

  // Recursively consolidate children within each consolidated parent
  return order.map(fp => {
    const member = groups.get(fp);
    if (member.children.length > 0) {
      member.children = consolidateMembers(member.children);
    }
    return member;
  });
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
    // Merge both Page_Label and Drawing_Ref into the item drawing ref (deduplicated)
    const refValues = [row.pageLabel, row.drawingRef].filter(Boolean);
    for (const ref of refValues) {
      if (!item.drawingRef.split(',').map(s => s.trim()).includes(ref)) {
        item.drawingRef = item.drawingRef
          ? item.drawingRef + ', ' + ref
          : ref;
      }
    }

    // Track coating for aggregation
    item.coatingValues.push(row.coating || '');

    // Generate fab ops for this row
    const rowFabOps = generateRowFabOps(row);

    // Member mark (default to a placeholder if blank)
    const mark = row.memberMark || `${row.itemNumber}-${row.lineNum}`;
    const isParent = parseMarkIsParent(mark);
    const base = getMarkBase(mark);

    // Takeoffs often reuse a descriptive mark ("OUTRIGGER", "ROLLED") across
    // physically different pieces. A mark only identifies the same member when
    // its size and length agree — otherwise key the row separately so its size
    // and length aren't silently absorbed into the first row with that mark.
    const memberKey = `${mark}||${row.shapeSize}||${row.lengthFt}`;

    if (!item.membersMap.has(memberKey)) {
      item.membersMap.set(memberKey, {
        mark,
        isParent,
        base,
        description: row.partLabel || '',
        size: row.shapeSize || '',
        length: row.lengthFt,
        pieces: 0,
        galvanized: row.galvanized,
        fabrication: [],
        children: [],
      });
    }

    const member = item.membersMap.get(memberKey);
    // Accumulate pieces (works for first row and subsequent rows with same key)
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

    // Consolidate identical members (same size, length, description, fab ops)
    // into single rows with summed quantities to reduce estimate line count
    const consolidatedParents = consolidateMembers(parents);

    // Count stats from consolidated result
    let memberCount = 0;
    let fabOpCount = 0;
    const countMembers = (members) => {
      for (const m of members) {
        memberCount++;
        fabOpCount += m.fabrication.length;
        if (m.children?.length) countMembers(m.children);
      }
    };
    countMembers(consolidatedParents);
    totalMembers += memberCount;
    totalFabOps += fabOpCount;

    items.push({
      itemNumber:         item.itemNumber,
      itemName:           item.itemName,
      drawingRef:         item.drawingRef,
      members:            consolidatedParents,
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

export {
  END_LABOR_MAP, HOLE_MAP, WELD_MAP, CONNECTION_MAP, PREP_MAP,
  parseFeetInches, parseCSVLine, parseTakeoffCSV,
  generateEndLabor, generateRowFabOps,
  parseMarkIsParent, getMarkBase,
  memberFingerprint, consolidateMembers, mergeFabOps, aggregateTakeoffData,
};
