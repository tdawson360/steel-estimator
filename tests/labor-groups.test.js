// Labor groups engine: family keys, rate application, summaries,
// auto-grouping, and family sort. Pure-module tests, no DB.

import { describe, it, expect } from 'vitest';
import {
  familyKeyForSize,
  fabGroupKey,
  isGroupableFab,
  applyGroupRates,
  computeGroupSummaries,
  familyBlocks,
  groupAnchors,
  buildAutoGroups,
  sortMaterialsByFamily,
  nextColorIndex,
  GROUP_COLOR_COUNT,
} from '../lib/estimating/labor-groups.js';
import { recomputeEstimate } from '../lib/estimating/recompute.js';
import { DEFAULT_PRICING_RATES } from '../lib/estimating/rates.js';
import { mat, fab, item, id } from './helpers/fixtures.js';

describe('familyKeyForSize', () => {
  it.each([
    // [category, size, expected]
    ['W Shape', 'W12x26', 'W12'],
    ['W Shape', 'W12x14', 'W12'],
    ['W Shape', 'W 12 x 26', 'W12'],
    ['W Shape', 'W8x10', 'W8'],
    ['WT Shape', 'WT5x11', 'WT5'],
    ['Channel', 'C15x33.9', 'C15'],
    ['Channel', 'C 12 x 20.7', 'C12'],
    ['MC Channel', 'MC18x42.7', 'MC18'],
    ['Angle', 'L3x3x1/4', 'L 3x3'],
    ['Angle', 'L 3 x 3 x 3/8', 'L 3x3'],
    ['Angle', 'L3-1/2x3x1/4', 'L 3-1/2x3'],
    ['Angle', 'L4x4x3/8', 'L 4x4'],
    ['HSS Square', 'HSS4x4x1/4', 'HSS 4x4'],
    ['HSS Square', 'HSS 4 x 4 x 1/2', 'HSS 4x4'],
    ['HSS Rect', 'HSS8x6x1/2', 'HSS 8x6'],
    ['HSS Round', 'HSS4.500x0.237', 'HSS 4.500'],
    ['Pipe', 'PIPE 4 STD', 'PIPE 4'],
    ['Pipe', 'PIPE 1-1/2 XS', 'PIPE 1-1/2'],
    ['Round Bar', 'RD 3/4', 'RD 3/4'],
    ['Round Bar', 'RD 1-1/4', 'RD 1-1/4'],
  ])('%s %s → %s', (category, size, expected) => {
    expect(familyKeyForSize(category, size)).toBe(expected);
  });

  it.each([
    ['Plate', 'PL 1/2 x 6'],
    ['Plate', ''],
    ['Flats', 'FB 1/4 x 2'],
    ['Custom', 'BENT PL 10GA'],
    ['W Shape', ''],
    ['W Shape', null],
    ['Angle', '   '],
  ])('%s %s is ungroupable (null)', (category, size) => {
    expect(familyKeyForSize(category, size)).toBe(null);
  });

  it('same family across different weights/walls/thicknesses', () => {
    expect(familyKeyForSize('W Shape', 'W12x14')).toBe(familyKeyForSize('W Shape', 'W12x26'));
    expect(familyKeyForSize('HSS Square', 'HSS4x4x1/4')).toBe(familyKeyForSize('HSS Square', 'HSS4x4x1/2'));
    expect(familyKeyForSize('Angle', 'L3x3x1/4')).toBe(familyKeyForSize('Angle', 'L3x3x3/8'));
    // ...but not across genuinely different leading dims
    expect(familyKeyForSize('W Shape', 'W12x26')).not.toBe(familyKeyForSize('W Shape', 'W8x10'));
    expect(familyKeyForSize('HSS Rect', 'HSS8x6x1/2')).not.toBe(familyKeyForSize('HSS Square', 'HSS4x4x1/4'));
  });
});

describe('fabGroupKey / isGroupableFab', () => {
  const beam = mat({ size: 'W12x26', category: 'W Shape' });
  it('keys family|operation and excludes galv rows by flags', () => {
    expect(fabGroupKey(beam, fab({ operation: 'Cut- Straight' }))).toBe('W12|Cut- Straight');
    expect(fabGroupKey(beam, { operation: 'Galvanizing', isAutoGalv: true })).toBe(null);
    expect(fabGroupKey(beam, { operation: 'Galvanizing', isConnGalv: true, id: 'galv-123' })).toBe(null);
    expect(fabGroupKey(beam, { operation: 'X', isGalvLine: true })).toBe(null);
    expect(isGroupableFab({ operation: 'WF Connx' })).toBe(true);
  });
  it('custom operations key on customOperation', () => {
    expect(fabGroupKey(beam, fab({ operation: 'Custom', customOperation: 'Bend' }))).toBe('W12|Bend');
  });
  it('plate materials produce no key', () => {
    const plate = mat({ category: 'Plate', size: 'PL 1/2 x 6', plateThickness: 0.5, plateWidth: 6 });
    expect(fabGroupKey(plate, fab({ operation: 'Drill Holes' }))).toBe(null);
  });
});

function groupedItem() {
  // Two W12 beams (different weights) + one HSS, with a cope group and a
  // connection group over the W12s. Rates on the rows are STALE on purpose —
  // the group rate must win.
  const g1 = { id: 501, operation: 'Cut- Single Cope End', familyKey: 'W12', unit: 'EA', rate: 8.5, collapsed: false, colorIndex: 0, sortOrder: 0 };
  const g2 = { id: 502, operation: 'WF Connx', familyKey: 'W12', unit: 'EA', rate: 42, collapsed: false, colorIndex: 1, sortOrder: 1 };
  const beamA = mat({ size: 'W12x26', category: 'W Shape', pieces: 2, length: 30, priceBy: 'LB', unitPrice: 0.85 });
  beamA.fabrication = [
    fab({ operation: 'Cut- Single Cope End', quantity: 2, unit: 'EA', unitPrice: 999, laborGroupId: 501 }),
    fab({ operation: 'WF Connx', quantity: 2, unit: 'LB', unitPrice: 999, connWeight: 30, laborGroupId: 502 }),
    fab({ operation: 'Drill Holes', quantity: 8, unit: 'EA', unitPrice: 2.5 }), // ungrouped
  ];
  const beamB = mat({ size: 'W12x14', category: 'W Shape', pieces: 1, length: 22, priceBy: 'LB', unitPrice: 0.85 });
  beamB.fabrication = [
    fab({ operation: 'Cut- Single Cope End', quantity: 1, unit: 'EA', unitPrice: 999, laborGroupId: 501 }),
    fab({ operation: 'Welding- Fillet', quantity: 2, unit: 'IN', length: 8, unitPrice: 1.25, laborGroupId: 999 }), // dangling group
  ];
  const hss = mat({ size: 'HSS4x4x1/4', category: 'HSS Square', pieces: 1, length: 10, priceBy: 'LB', unitPrice: 1.1 });
  hss.fabrication = [fab({ operation: 'Cut- Miter', quantity: 2, unit: 'EA', unitPrice: 6 })];
  return item({
    itemNumber: '001', itemName: 'GROUPED',
    materials: [beamA, beamB, hss],
    laborGroups: [g1, g2],
  });
}

describe('applyGroupRates', () => {
  it('stamps the group rate onto member rows, leaves others untouched, preserves order', () => {
    const it1 = groupedItem();
    const out = applyGroupRates(it1);
    const [a, b] = out.materials;
    // EA member: group rate wins over the stale 999
    expect(a.fabrication[0].unitPrice).toBe(8.5);
    expect(a.fabrication[0].rate).toBe(8.5);
    // Connection member: rate stamped; connWeight untouched
    expect(a.fabrication[1].unitPrice).toBe(42);
    expect(a.fabrication[1].connWeight).toBe(30);
    // Ungrouped row untouched (same reference)
    expect(a.fabrication[2]).toBe(it1.materials[0].fabrication[2]);
    // Dangling laborGroupId untouched
    expect(b.fabrication[1]).toBe(it1.materials[1].fabrication[1]);
    // Order and length preserved everywhere
    expect(out.materials.map(m => m.id)).toEqual(it1.materials.map(m => m.id));
    expect(a.fabrication.map(f => f.id)).toEqual(it1.materials[0].fabrication.map(f => f.id));
  });

  it('is a no-op (identity) for items without groups', () => {
    const plain = item({ materials: [mat({})] });
    expect(applyGroupRates(plain)).toBe(plain);
  });
});

describe('computeGroupSummaries', () => {
  it('sums member quantities and line totals at the group rate', () => {
    const summaries = computeGroupSummaries(groupedItem());
    const cope = summaries.find(s => s.id === 501);
    const connx = summaries.find(s => s.id === 502);
    // Cope: EA group — 2 + 1 = 3 EA, total 3 × 8.50
    expect(cope.totalQty).toBe(3);
    expect(cope.totalCost).toBeCloseTo(3 * 8.5, 6);
    expect(cope.memberCount).toBe(2);
    // Connection group in LB: qty × connWeight × rate, NOT count × rate
    expect(connx.totalQty).toBe(2);
    expect(connx.totalCost).toBeCloseTo(2 * 30 * 42, 6);
  });
});

describe('recomputeEstimate with labor groups', () => {
  it('persisted line totals use the group rate, not the row rate', () => {
    const result = recomputeEstimate({ items: [groupedItem()] }, DEFAULT_PRICING_RATES);
    const [a, b] = result.items[0].materials;
    expect(a.fabrication[0].totalCost).toBeCloseTo(2 * 8.5, 6);      // cope, group rate
    expect(a.fabrication[1].totalCost).toBeCloseTo(2 * 30 * 42, 6);  // connx LB, group rate
    expect(a.fabrication[2].totalCost).toBeCloseTo(8 * 2.5, 6);      // ungrouped, own rate
    expect(b.fabrication[1].totalCost).toBeCloseTo(2 * 8 * 1.25, 6); // dangling group → own rate
    // laborGroups ride through on the item
    expect(result.items[0].laborGroups.length).toBe(2);
  });

  it('item totals equal the sum of group totals plus ungrouped lines', () => {
    const result = recomputeEstimate({ items: [groupedItem()] }, DEFAULT_PRICING_RATES);
    const summaries = computeGroupSummaries(result.items[0]);
    const groupTotal = summaries.reduce((s, g) => s + g.totalCost, 0);
    const allFabTotal = result.items[0].materials
      .flatMap(m => m.fabrication)
      .reduce((s, f) => s + (f.totalCost || 0), 0);
    const ungrouped = 8 * 2.5 + 2 * 8 * 1.25 + 2 * 6;
    expect(groupTotal + ungrouped).toBeCloseTo(allFabTotal, 6);
  });
});

describe('familyBlocks / groupAnchors', () => {
  it('blocks follow first-appearance order; children never open blocks', () => {
    const w1 = mat({ id: 1, size: 'W12x26', category: 'W Shape' });
    const child = { ...mat({ id: 2, size: 'L3x3x1/4', category: 'Angle' }), parentMaterialId: 1 };
    const w2 = mat({ id: 3, size: 'W12x14', category: 'W Shape' });
    const hss = mat({ id: 4, size: 'HSS4x4x1/4', category: 'HSS Square' });
    const blocks = familyBlocks([w1, child, w2, hss]);
    expect(blocks.map(b => b.familyKey)).toEqual(['W12', 'HSS 4x4']);
    expect(blocks[0].parentIds).toEqual([1, 3]);
  });

  it('anchors each group to the LAST matching parent in array order', () => {
    const w1 = mat({ id: 1, size: 'W12x26', category: 'W Shape' });
    const hss = mat({ id: 4, size: 'HSS4x4x1/4', category: 'HSS Square' });
    const w2 = mat({ id: 3, size: 'W12x14', category: 'W Shape' });
    const g = { id: 501, familyKey: 'W12', operation: 'Cut- Straight' };
    const anchors = groupAnchors([w1, hss, w2], [g]);
    expect(anchors.get(501)).toBe(3);
  });
});

describe('buildAutoGroups', () => {
  let seq = 9000;
  const makeId = () => ++seq;

  function importShapedMaterials(rateB = 8.5) {
    const beamA = mat({ size: 'W12x26', category: 'W Shape' });
    beamA.fabrication = [
      fab({ operation: 'Cut- Single Cope End', quantity: 2, unit: 'EA', unitPrice: 8.5 }),
      fab({ operation: 'Drill Holes', quantity: 4, unit: 'EA', unitPrice: 2.5 }),
    ];
    const beamB = mat({ size: 'W12x14', category: 'W Shape' });
    beamB.fabrication = [
      fab({ operation: 'Cut- Single Cope End', quantity: 1, unit: 'EA', unitPrice: rateB }),
    ];
    const lonely = mat({ size: 'HSS4x4x1/4', category: 'HSS Square' });
    lonely.fabrication = [fab({ operation: 'Cut- Miter', quantity: 2, unit: 'EA', unitPrice: 6 })];
    const plate = mat({ category: 'Plate', size: 'PL 1/2 x 6', plateThickness: 0.5, plateWidth: 6 });
    plate.fabrication = [fab({ operation: 'Drill Holes', quantity: 4, unit: 'EA', unitPrice: 2.5 })];
    return { beamA, beamB, lonely, plate, materials: [beamA, beamB, lonely, plate] };
  }

  it('forms a group only when ≥ minMembers rows share a key; uniform rates prefill', () => {
    const { beamA, beamB, lonely, plate, materials } = importShapedMaterials(8.5);
    const { groups, assignments } = buildAutoGroups(materials, [], { makeId });
    expect(groups.length).toBe(1);
    const g = groups[0];
    expect(g.familyKey).toBe('W12');
    expect(g.operation).toBe('Cut- Single Cope End');
    expect(g.rate).toBe(8.5); // uniform → prefilled
    expect(assignments.get(beamA.fabrication[0].id)).toBe(g.id);
    expect(assignments.get(beamB.fabrication[0].id)).toBe(g.id);
    // Single-row keys and plate rows never group
    expect(assignments.has(beamA.fabrication[1].id)).toBe(false);
    expect(assignments.has(lonely.fabrication[0].id)).toBe(false);
    expect(assignments.has(plate.fabrication[0].id)).toBe(false);
  });

  it('mixed member rates start the group at 0 (needs pricing)', () => {
    const { materials } = importShapedMaterials(9.75);
    const { groups } = buildAutoGroups(materials, [], { makeId });
    expect(groups.length).toBe(1);
    expect(groups[0].rate).toBe(0);
  });

  it('rows matching an existing group join it instead of forming a new one', () => {
    const existing = { id: 700, familyKey: 'W12', operation: 'Cut- Single Cope End', rate: 7, colorIndex: 0 };
    const { beamA, beamB, materials } = importShapedMaterials();
    const { groups, assignments } = buildAutoGroups(materials, [existing], { makeId });
    expect(groups.length).toBe(0);
    expect(assignments.get(beamA.fabrication[0].id)).toBe(700);
    expect(assignments.get(beamB.fabrication[0].id)).toBe(700);
  });

  it('already-grouped and galv rows are skipped', () => {
    const beam = mat({ size: 'W12x26', category: 'W Shape' });
    beam.fabrication = [
      fab({ operation: 'Cut- Straight', quantity: 1, unit: 'EA', unitPrice: 5, laborGroupId: 700 }),
      { id: id(), operation: 'Galvanizing', quantity: 100, unit: 'LB', unitPrice: 0.28, isAutoGalv: true },
      fab({ operation: 'Cut- Straight', quantity: 1, unit: 'EA', unitPrice: 5 }),
    ];
    const { groups, assignments } = buildAutoGroups([beam], [], { makeId });
    expect(groups.length).toBe(0); // only ONE eligible row shares the key
    expect(assignments.size).toBe(0);
  });
});

describe('sortMaterialsByFamily', () => {
  it('sorts parents into family runs, children glued, unfamilied last', () => {
    const w26 = mat({ id: 1, size: 'W12x26', category: 'W Shape', length: 20 });
    const clip = { ...mat({ id: 2, size: 'L3x3x1/4', category: 'Angle' }), parentMaterialId: 1 };
    const plate = mat({ id: 3, category: 'Plate', size: 'PL 1/2 x 6', plateThickness: 0.5, plateWidth: 6 });
    const hss = mat({ id: 4, size: 'HSS4x4x1/4', category: 'HSS Square' });
    const w14 = mat({ id: 5, size: 'W12x14', category: 'W Shape', length: 30 });
    const w26b = mat({ id: 6, size: 'W12x26', category: 'W Shape', length: 35 });
    const sorted = sortMaterialsByFamily([w26, clip, plate, hss, w14, w26b]);
    const ids = sorted.map(m => m.id);
    // HSS 4x4 < W12 alphabetically; within W12: W12x14 before W12x26, longest first;
    // children ride behind their parent; the plate (no family) goes last.
    expect(ids).toEqual([4, 5, 6, 1, 2, 3]);
  });
});

describe('nextColorIndex', () => {
  it('fills the smallest unused slot, then cycles', () => {
    expect(nextColorIndex([])).toBe(0);
    expect(nextColorIndex([{ colorIndex: 0 }, { colorIndex: 2 }])).toBe(1);
    const full = Array.from({ length: GROUP_COLOR_COUNT }, (_, i) => ({ colorIndex: i }));
    expect(nextColorIndex(full)).toBe(GROUP_COLOR_COUNT % GROUP_COLOR_COUNT);
  });
});
