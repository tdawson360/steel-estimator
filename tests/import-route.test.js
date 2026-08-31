// Characterization: server-side takeoff import (app/api/import-csv/route.js)
// — quantity handling, length tolerance, labor-op generation, consolidation.

import { describe, it, expect } from 'vitest';
import { routeEnv } from './helpers/extract.js';

const env = routeEnv();

describe('parseFeetInches', () => {
  it('parses drawn dimensions', () => {
    expect(env.parseFeetInches(`28'-1"`)).toBeCloseTo(28 + 1 / 12, 10);
    expect(env.parseFeetInches(`23'-0"`)).toBe(23);
    expect(env.parseFeetInches(`17'-8 1/2"`)).toBeCloseTo(17 + 8.5 / 12, 10);
    expect(env.parseFeetInches(`23'`)).toBe(23);
  });
  it('rejects non-dimension text', () => {
    expect(env.parseFeetInches('HORIZ')).toBeNull();
    expect(env.parseFeetInches('')).toBeNull();
    expect(env.parseFeetInches('28.07')).toBeNull();
  });
});

const HEADER = 'Item_Number,Item_Description,Quantity,Shape_Size,Comments,Measured_Length,Part_Label,Member_Mark';
const csv = (rows) => [HEADER, ...rows].join('\n');

describe('parseTakeoffCSV quantity + length rules', () => {
  it('blank or zero Quantity counts as one drawn piece', () => {
    const { rawRows } = env.parseTakeoffCSV(csv([
      '1,FRAMING,,W 8 x 21,"23\'-0""",23.01,HORIZ,',
      '1,FRAMING,0,W 8 x 21,"22\'-6""",22.53,HORIZ,',
      '1,FRAMING,4,W 8 x 21,"22\'-6""",22.53,HORIZ,',
    ]));
    expect(rawRows.map(r => r.quantity)).toEqual([1, 1, 4]);
  });
  it('prefers the drawn dimension when within 2" of the measurement', () => {
    const { rawRows } = env.parseTakeoffCSV(csv([
      '1,FRAMING,1,MC 18 x 42.7,"28\'-1""",28.07,,OUTRIGGER',
      '1,FRAMING,1,MC 18 x 42.7,"28\'-1""",28.05,,OUTRIGGER',
    ]));
    expect(rawRows.map(r => r.lengthFt)).toEqual([28.08, 28.08]); // both 28'-1", 2dp
  });
  it('falls back to nearest-inch rounding when Comments is not a dimension', () => {
    const { rawRows } = env.parseTakeoffCSV(csv([
      '1,FRAMING,1,W 8 x 21,note text,22.53,HORIZ,',
    ]));
    expect(rawRows[0].lengthFt).toBe(22.5); // 270.36" → nearest inch 270" = 22.5'
  });
  it('ignores a drawn dimension more than 2" from the measurement', () => {
    const { rawRows } = env.parseTakeoffCSV(csv([
      `1,FRAMING,1,W 8 x 21,"10'-0""",22.53,HORIZ,`,
    ]));
    expect(rawRows[0].lengthFt).toBeCloseTo(22.5, 10); // rounded, drawn ignored
  });
  it('"None" in Weld_Type / Coating / Connection_Type / Prep_Ops imports as blank (profile v1.7 explicit no-op choice)', () => {
    const HDR = 'Item_Number,Item_Description,Quantity,Shape_Size,Measured_Length,Weld_Type,Coating,Connection_Type,Prep_Ops,Member_Mark';
    const { rawRows } = env.parseTakeoffCSV([
      HDR,
      '1,FRAMING,1,W 8 x 21,23.01,None,None,None,None,',
      '1,FRAMING,1,W 8 x 21,23.01,Fillet,Prime Paint,WF Connx,Ease,',
    ].join('\n'));
    expect(rawRows[0].weldType).toBe('');
    expect(rawRows[0].coating).toBe('');
    expect(rawRows[0].connectionType).toBe('');
    expect(rawRows[0].prepOps).toBe('');
    expect(rawRows[1].weldType).toBe('Fillet');
    expect(rawRows[1].coating).toBe('Prime Paint');
    expect(rawRows[1].connectionType).toBe('WF Connx');
    expect(rawRows[1].prepOps).toBe('Ease');
  });
  it('missing required columns errors', () => {
    const { error } = env.parseTakeoffCSV('Foo,Bar\n1,2');
    expect(error).toMatch(/Missing required columns/);
  });
});

describe('length fallback: Length_Ft OR Measured_Length suffices', () => {
  // Profiles export both columns by design: users either type a known
  // dimension into Length_Ft or measure only (Measured_Length formula).
  const BOTH = 'Item_Number,Item_Description,Quantity,Shape_Size,Length_Ft,Measured_Length,Part_Label,Member_Mark';
  const csvBoth = (rows) => [BOTH, ...rows].join('\n');

  it('typed Length_Ft overrides the measurement', () => {
    const { rawRows } = env.parseTakeoffCSV(csvBoth([
      '1,FRAMING,1,W 8 x 21,20,22.53,HORIZ,',
    ]));
    expect(rawRows[0].lengthFt).toBe(20);
  });
  it('blank Length_Ft falls through to Measured_Length instead of 0', () => {
    const { rawRows } = env.parseTakeoffCSV(csvBoth([
      '1,FRAMING,1,W 8 x 21,,22.53,HORIZ,',
    ]));
    expect(rawRows[0].lengthFt).toBe(22.5); // nearest-inch rounding still applies
  });
  it("built-in Length feet-inches string parses as last resort", () => {
    const HDR = 'Item_Number,Item_Description,Quantity,Shape_Size,Length,Part_Label,Member_Mark';
    const { rawRows } = env.parseTakeoffCSV([HDR, `1,FRAMING,1,W 8 x 21,"28'-1""",HORIZ,`].join('\n'));
    expect(rawRows[0].lengthFt).toBe(28.08); // parsed as a dimension, not parseFloat -> 28
  });
});

describe('generateEndLabor / generateRowFabOps', () => {
  it('maps and splits compound operations', () => {
    expect(env.generateEndLabor('Straight')).toEqual([{ operation: 'Cut- Straight', quantity: 1, unit: 'EA' }]);
    expect(env.generateEndLabor('Single Cope + Miter')).toEqual([
      { operation: 'Cut- Single Cope End', quantity: 1, unit: 'EA' },
      { operation: 'Cut- Miter', quantity: 1, unit: 'EA' },
    ]);
    expect(env.generateEndLabor('Nonsense')).toEqual([]);
  });
  it('full row generates ends, holes (Hole_Qty), weld, connection (Connection_Qty), prep', () => {
    const ops = env.generateRowFabOps({
      end1Labor: 'Straight', end2Labor: 'Double Cope',
      holes: 'Drill', holeQty: 4,
      weldType: 'Fillet',
      connectionType: 'WF Connx', connectionQty: 2,
      prepOps: "90's",
    });
    expect(ops).toEqual([
      { operation: 'Cut- Straight', quantity: 1, unit: 'EA' },
      { operation: 'Cut- Double Cope End', quantity: 1, unit: 'EA' },
      { operation: 'Drill Holes', quantity: 4, unit: 'EA' },
      { operation: 'Welding- Fillet', quantity: 1, unit: 'EA' },
      { operation: 'WF Connx', quantity: 2, unit: 'EA' },
      { operation: "90's", quantity: 1, unit: 'EA' },
    ]);
  });
});

describe('mergeFabOps', () => {
  it('accumulates drill/connection quantities, dedupes cuts/welds', () => {
    const a = [
      { operation: 'Cut- Straight', quantity: 1, unit: 'EA' },
      { operation: 'Drill Holes', quantity: 4, unit: 'EA' },
    ];
    const b = [
      { operation: 'Cut- Straight', quantity: 1, unit: 'EA' },
      { operation: 'Drill Holes', quantity: 3, unit: 'EA' },
      { operation: 'Welding- Fillet', quantity: 1, unit: 'EA' },
    ];
    expect(env.mergeFabOps(a, b)).toEqual([
      { operation: 'Cut- Straight', quantity: 1, unit: 'EA' },   // deduped, NOT summed
      { operation: 'Drill Holes', quantity: 7, unit: 'EA' },     // accumulated
      { operation: 'Welding- Fillet', quantity: 1, unit: 'EA' },
    ]);
  });
});

describe('consolidateMembers', () => {
  const member = (mark, pieces, fabrication = [], extras = {}) => ({
    mark, isParent: true, base: mark, description: 'HORIZ', size: 'W 8 x 21',
    length: 23, pieces, galvanized: false, fabrication, children: [], ...extras,
  });
  it('sums pieces and fab quantities for identical members', () => {
    const out = env.consolidateMembers([
      member('A', 2, [{ operation: 'Drill Holes', quantity: 4, unit: 'EA' }]),
      member('B', 3, [{ operation: 'Drill Holes', quantity: 4, unit: 'EA' }]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pieces).toBe(5);
    expect(out[0].fabrication[0].quantity).toBe(8);
    expect(out[0].consolidatedMarks).toEqual(['A', 'B']);
  });
  it('FINDING #4: fab accumulation is positional — order comes from generation, fingerprint sorts', () => {
    // Two members with the same SORTED fab signature but different array order
    // still merge (fingerprint sorts), and quantities sum by INDEX.
    const m1 = member('A', 1, [
      { operation: 'Drill Holes', quantity: 2, unit: 'EA' },
      { operation: 'Cut- Straight', quantity: 1, unit: 'EA' },
    ]);
    const m2 = member('B', 1, [
      { operation: 'Cut- Straight', quantity: 1, unit: 'EA' },
      { operation: 'Drill Holes', quantity: 2, unit: 'EA' },
    ]);
    const out = env.consolidateMembers([m1, m2]);
    expect(out).toHaveLength(1);
    // CURRENT behavior: Drill(2)+Cut(1)=3 and Cut(1)+Drill(2)=3 — cross-op sums
    expect(out[0].fabrication.map(f => `${f.operation}:${f.quantity}`)).toEqual([
      'Drill Holes:3', 'Cut- Straight:3',
    ]);
  });
  it('does not merge when description differs', () => {
    const out = env.consolidateMembers([
      member('A', 1), { ...member('B', 1), description: 'BRACE' },
    ]);
    expect(out).toHaveLength(2);
  });
  it('pools children from merged parents', () => {
    const child = { mark: 'A.1', isParent: false, base: 'A', description: 'PL', size: 'PL 1/2 x 6', length: 1, pieces: 2, galvanized: false, fabrication: [], children: [] };
    const out = env.consolidateMembers([
      { ...member('A', 1), children: [child] },
      { ...member('B', 1), children: [{ ...child, mark: 'B.1', base: 'B' }] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].children).toHaveLength(1);       // identical children consolidate too
    expect(out[0].children[0].pieces).toBe(4);
  });
});

describe('aggregateTakeoffData member keying and coating', () => {
  it('reused descriptive mark with different size/length stays separate; same key sums', () => {
    const { rawRows } = env.parseTakeoffCSV(csv([
      '1,FRAMING,1,C 15 x 33.9,"15\'-4""",15.34,HORIZ,OUTRIGGER',
      '1,FRAMING,1,MC 18 x 42.7,"28\'-1""",28.07,,OUTRIGGER',
      '1,FRAMING,1,MC 18 x 42.7,"28\'-1""",28.05,,OUTRIGGER',
    ]));
    const { items } = env.aggregateTakeoffData(rawRows);
    const flat = [];
    const walk = (ms) => ms.forEach(m => { flat.push(m); walk(m.children || []); });
    items.forEach(i => walk(i.members));
    const summary = flat.map(m => `${m.size}@${m.length}x${m.pieces}`).sort();
    expect(summary).toEqual(['C 15 x 33.9@15.33x1', 'MC 18 x 42.7@28.08x2']);
  });
  it('blank mark rows get per-line placeholder keys (never merge across rows)', () => {
    const { rawRows } = env.parseTakeoffCSV(csv([
      '1,FRAMING,1,W 8 x 21,"23\'-0""",23.01,HORIZ,',
      '1,FRAMING,1,W 8 x 21,"23\'-0""",23.01,HORIZ,',
    ]));
    const { items } = env.aggregateTakeoffData(rawRows);
    // separate placeholder marks → 2 members, then consolidation merges them
    expect(items[0].members).toHaveLength(1);
    expect(items[0].members[0].pieces).toBe(2);
  });
  it('coating: uniform vs mixed vs blank', () => {
    const rowsUniform = [
      { itemNumber: '1', memberMark: 'X', shapeSize: 'W 8 x 21', lengthFt: 10, quantity: 1, coating: 'Prime Paint', partLabel: '', itemDescription: '', pageLabel: '', drawingRef: '', galvanized: false, lineNum: 2 },
      { itemNumber: '1', memberMark: 'Y', shapeSize: 'W 8 x 21', lengthFt: 12, quantity: 1, coating: 'Prime Paint', partLabel: '', itemDescription: '', pageLabel: '', drawingRef: '', galvanized: false, lineNum: 3 },
    ];
    const agg1 = env.aggregateTakeoffData(rowsUniform);
    expect(agg1.items[0].coatingUniform).toBe('Prime Paint');
    expect(agg1.items[0].coatingMixed).toBe(false);

    const rowsMixed = [
      { ...rowsUniform[0] },
      { ...rowsUniform[1], coating: 'TNEMEC' },
    ];
    const agg2 = env.aggregateTakeoffData(rowsMixed);
    expect(agg2.items[0].coatingUniform).toBeNull();
    expect(agg2.items[0].coatingMixed).toBe(true);
    expect(agg2.items[0].coatingMixedValues.sort()).toEqual(['Prime Paint', 'TNEMEC']);

    const rowsPartial = [
      { ...rowsUniform[0] },
      { ...rowsUniform[1], coating: '' },
    ];
    const agg3 = env.aggregateTakeoffData(rowsPartial);
    expect(agg3.items[0].coatingUniform).toBeNull();
    expect(agg3.items[0].coatingMixed).toBe(true);
  });
});

describe('size → pricing key', () => {
  it('normalizeToBeamSizeKey and shape type', () => {
    expect(env.normalizeToBeamSizeKey('W 16 x 26')).toBe('W16X26');
    expect(env.normalizeToBeamSizeKey('MC18x42.7')).toBe('MC18X42.7');
    expect(env.getShapeTypeFromKey('W16X26')).toBe('WF');
    expect(env.getShapeTypeFromKey('MC18X42.7')).toBe('C');
    expect(env.getShapeTypeFromKey('C15X33.9')).toBe('C');
    expect(env.getShapeTypeFromKey('HSS4X4X1/4')).toBeNull();
  });
});
