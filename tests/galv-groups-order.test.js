// Galv group presentation + rate seeding rules (Todd, 2026-09-02):
//  - a galv group's Qty (pounds) shows rounded UP to a whole number
//  - galv groups always sit last among an item's group lines (drill/cut above)
//  - unpriced ($0) galv lines and galv groups pick up the class rate from
//    Global Pricing Data instead of sitting at $0

import { describe, it, expect } from 'vitest';
import { DEFAULT_GALV_CLASSES } from '../lib/estimating/galv-classes.js';
import { normalizeGalvLines } from '../lib/estimating/galv.js';
import {
  computeGroupSummaries, groupAnchors, buildAutoGroups, joinGalvGroups, seedGalvGroupRates, applyGroupRates,
} from '../lib/estimating/labor-groups.js';
import { mat, fab, item } from './helpers/fixtures.js';

function galvItemWithCutGroup() {
  const a = mat({ size: 'W12x26', category: 'W Shape', pieces: 2, length: 20.3, galvanized: true });
  const b = mat({ size: 'W12x26', category: 'W Shape', pieces: 1, length: 11.7, galvanized: true });
  a.fabrication = [fab({ operation: 'Cut- Straight', quantity: 2, unit: 'EA', unitPrice: 5, laborGroupId: 701 })];
  b.fabrication = [fab({ operation: 'Cut- Straight', quantity: 1, unit: 'EA', unitPrice: 5, laborGroupId: 701 })];
  const materials = normalizeGalvLines([a, b], { galvClasses: DEFAULT_GALV_CLASSES });
  const cut = { id: 701, operation: 'Cut- Straight', familyKey: 'W12x26', unit: 'EA', rate: 5, collapsed: true, colorIndex: 0, sortOrder: 0 };
  const galv = { id: 702, operation: 'Galvanizing', familyKey: 'KDS', unit: 'LB', rate: 0, collapsed: true, colorIndex: 1, sortOrder: 1 };
  return joinGalvGroups(item({ materials, laborGroups: [cut, galv] }));
}

describe('galv group presentation', () => {
  it('Qty rounds pounds UP to a whole number; ordinary groups untouched', () => {
    const it1 = galvItemWithCutGroup();
    const sums = computeGroupSummaries(it1);
    const galv = sums.find(s => s.operation === 'Galvanizing');
    const cut = sums.find(s => s.operation === 'Cut- Straight');
    const rawLb = it1.materials.reduce((s, m) => s + m.fabrication.filter(f => f.isAutoGalv).reduce((x, f) => x + f.quantity, 0), 0);
    expect(rawLb % 1).not.toBe(0);                 // fixture weights are fractional
    expect(galv.totalQty).toBe(Math.ceil(rawLb));
    expect(cut.totalQty).toBe(3);
  });

  it('galv groups come last in the summaries and anchor to the last parent', () => {
    const it1 = galvItemWithCutGroup();
    // Put the galv group first in the array and make its last member the FIRST material
    const flipped = { ...it1, laborGroups: [...it1.laborGroups].reverse(),
      materials: it1.materials.map((m, i) => i === 1
        ? { ...m, fabrication: m.fabrication.map(f => f.isAutoGalv ? { ...f, laborGroupId: null } : f) }
        : m) };
    const sums = computeGroupSummaries(flipped);
    expect(sums.map(s => s.operation)).toEqual(['Cut- Straight', 'Galvanizing']);
    const anchors = groupAnchors(flipped.materials, flipped.laborGroups);
    expect(anchors.get(702)).toBe(flipped.materials[1].id);   // last parent, not its only member (index 0)
    expect(anchors.get(701)).toBe(flipped.materials[1].id);
  });
});

describe('galv rate seeding from the class table', () => {
  it('an existing $0 galv line picks up the class rate on normalize; a priced line keeps its rate', () => {
    const a = mat({ size: 'W12x26', category: 'W Shape', pieces: 1, length: 10, galvanized: true });
    a.fabrication = [{ id: 'g1', operation: 'Galvanizing', unit: 'LB', quantity: 0, unitPrice: 0, totalCost: 0, isAutoGalv: true, galvClass: 'KDS' }];
    const b = mat({ size: 'W12x26', category: 'W Shape', pieces: 1, length: 10, galvanized: true });
    b.fabrication = [{ id: 'g2', operation: 'Galvanizing', unit: 'LB', quantity: 0, unitPrice: 0.5, totalCost: 0, isAutoGalv: true, galvClass: 'KDS' }];
    const [oa, ob] = normalizeGalvLines([a, b], { galvClasses: DEFAULT_GALV_CLASSES });
    const la = oa.fabrication.find(f => f.isAutoGalv);
    const lb = ob.fabrication.find(f => f.isAutoGalv);
    expect(la.unitPrice).toBe(0.27);
    expect(la.totalCost).toBeCloseTo(la.quantity * 0.27, 6);
    expect(lb.unitPrice).toBe(0.5);
  });

  it('buildAutoGroups seeds a $0 galv group from the class', () => {
    let seq = 1;
    const a = mat({ size: 'W12x26', category: 'W Shape', pieces: 1, length: 10, galvanized: true });
    const b = mat({ size: 'C6x8.2', category: 'Channel', pieces: 1, length: 10, galvanized: true });
    const materials = normalizeGalvLines([a, b]).map(m => ({ ...m, fabrication: m.fabrication.map(f => f.isAutoGalv ? { ...f, unitPrice: 0, totalCost: 0 } : f) }));
    const { groups } = buildAutoGroups(materials, [], { makeId: () => ++seq, galvClasses: DEFAULT_GALV_CLASSES });
    expect(groups.find(g => g.operation === 'Galvanizing')).toMatchObject({ familyKey: 'KDS', rate: 0.27 });
  });

  it('seedGalvGroupRates prices a $0 galv group from the class and stamps its members', () => {
    const it1 = galvItemWithCutGroup();          // galv group 702 at rate 0
    const seeded = applyGroupRates(seedGalvGroupRates(it1, DEFAULT_GALV_CLASSES));
    expect(seeded.laborGroups.find(g => g.id === 702).rate).toBe(0.27);
    expect(seeded.laborGroups.find(g => g.id === 701).rate).toBe(5);
    for (const m of seeded.materials) {
      const line = m.fabrication.find(f => f.isAutoGalv);
      expect(line.unitPrice).toBe(0.27);
    }
    expect(seedGalvGroupRates(seeded, DEFAULT_GALV_CLASSES)).toBe(seeded); // identity when nothing to seed
  });
});
