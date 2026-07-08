// Characterization: calculateMaterial — weight-per-foot resolution, stock
// selection, waste/efficiency, and cost extension per pricing unit.

import { describe, it, expect } from 'vitest';
import { makeCalculateMaterial, componentModuleEnv } from './helpers/extract.js';

const env = componentModuleEnv();
const calc = makeCalculateMaterial();

const base = {
  id: 1, sequence: 'A', parentMaterialId: null, description: '', customWeight: null,
  stockLength: null, galvanized: false, fabrication: [],
};

describe('LB pricing (cost = stockWeight × $/lb)', () => {
  it('4 × 32ft W12x26 at $0.85/lb', () => {
    const m = calc({ ...base, category: 'W Shape', size: 'W12x26', pieces: 4, length: 32, priceBy: 'LB', unitPrice: 0.85 });
    expect(m.weightPerFoot).toBe(26);
    expect(m.totalLength).toBe(128);
    expect(m.fabWeight).toBe(3328);                 // 128 × 26
    // one 32' cut per stick; 35' is optimal (3' drop each)
    expect(m.stockLength).toBe(35);
    expect(m.stocksRequired).toBe(4);
    expect(m.stockWeight).toBe(3640);               // 4 × 35 × 26
    expect(m.wasteLength).toBe(12);
    expect(m.efficiency).toBeCloseTo(91.4285714, 5);
    expect(m.totalCost).toBeCloseTo(3094, 10);      // 3640 × 0.85 — cost is on PURCHASED weight
  });
});

describe('CWT pricing (cost = stockWeight/100 × $/cwt)', () => {
  it('2 × 28.08ft W18x35 at $47.85/cwt', () => {
    const m = calc({ ...base, category: 'W Shape', size: 'W18x35', pieces: 2, length: 28.08, priceBy: 'CWT', unitPrice: 47.85 });
    expect(m.fabWeight).toBeCloseTo(1965.6, 6);
    expect(m.stockLength).toBe(30);
    expect(m.stockWeight).toBeCloseTo(2100, 6);     // 2 × 30 × 35
    expect(m.totalCost).toBeCloseTo(1004.85, 6);    // 21 cwt × 47.85
  });
});

describe('LF pricing (cost = stocksRequired × stockLength × $/ft)', () => {
  it('3 × 17.67ft C15x33.9 at $34.25/ft — pays for full sticks, not net length', () => {
    const m = calc({ ...base, category: 'Channel', size: 'C15x33.9', pieces: 3, length: 17.67, priceBy: 'LF', unitPrice: 34.25 });
    expect(m.stockLength).toBe(55);                  // 3 cuts of 17.67 on one 55' stick
    expect(m.stocksRequired).toBe(1);
    expect(m.totalCost).toBeCloseTo(55 * 34.25, 10); // 1883.75 for 53.01' of net material
  });
});

describe('EA pricing (cost = pieces × $/ea, stock ignored)', () => {
  it('6 × 10ft L3x3x1/4 at $45/ea', () => {
    const m = calc({ ...base, category: 'Angle', size: 'L3x3x1/4', pieces: 6, length: 10, priceBy: 'EA', unitPrice: 45 });
    expect(m.totalCost).toBe(270);
    expect(m.stocksRequired).toBe(3);                // stock math still computed (2 per 20' stick)
  });
});

describe('plate weight paths', () => {
  it('plate with dimensions uses thickness × width and rewrites size/description', () => {
    const m = calc({ ...base, category: 'Plate', size: '', plateThickness: 0.5, plateWidth: 6, pieces: 4, length: 2, priceBy: 'LB', unitPrice: 0.62 });
    expect(m.weightPerFoot).toBeCloseTo(10.2096, 6);
    expect(m.size).toBe('PL 1/2" × 6"');
    expect(m.description).toBe('PL 1/2" × 6"');
    expect(m.fabWeight).toBeCloseTo(81.6768, 6);     // 8 × 10.2096
  });
  it('FINDING #5: plate WITHOUT dimensions gets zero weight and zero cost silently', () => {
    const m = calc({ ...base, category: 'Plate', size: 'PL 1/2 x 6', pieces: 2, length: 3, priceBy: 'LB', unitPrice: 0.62 });
    expect(m.weightPerFoot).toBe(0);
    expect(m.fabWeight).toBe(0);
    expect(m.totalCost).toBe(0);
  });
  it('custom weight override wins', () => {
    const m = calc({ ...base, category: 'Custom', size: 'BENT PL 10GA', customWeight: 12.5, pieces: 5, length: 8, priceBy: 'LB', unitPrice: 0.9 });
    expect(m.weightPerFoot).toBe(12.5);
    expect(m.fabWeight).toBe(500);
  });
  it('unknown size with no custom weight → zero weight', () => {
    const m = calc({ ...base, category: 'W Shape', size: 'W18x999', pieces: 1, length: 10, priceBy: 'LB', unitPrice: 1 });
    expect(m.weightPerFoot).toBe(0);
    expect(m.totalCost).toBe(0);
  });
});

describe('stock length selection', () => {
  it('manual override kept and flagged', () => {
    const m = calc({ ...base, category: 'W Shape', size: 'W10x12', pieces: 2, length: 18, stockLength: 45, priceBy: 'LB', unitPrice: 0.85 });
    expect(m.stockLength).toBe(45);
    expect(m.isManualOverride).toBe(true);
    expect(m.optimalStockLength).toBe(20);           // waste ties (4') → shorter stick wins
    expect(m.stocksRequired).toBe(1);
    expect(m.piecesPerStock).toBe(2);
  });
  it('invalid stored stockLength for category falls back to optimal', () => {
    const m = calc({ ...base, category: 'Pipe', size: 'PIPE 4 STD', pieces: 2, length: 10, stockLength: 40, priceBy: 'LB', unitPrice: 1.2 });
    expect(m.stockLength).toBe(21);                  // 40 not a pipe length; optimal 21 holds 2
    expect(m.isManualOverride).toBe(false);
  });
  it('FINDING #6: over-length piece prices at NET weight with zero sticks', () => {
    const m = calc({ ...base, category: 'W Shape', size: 'W21x44', pieces: 1, length: 62, priceBy: 'LB', unitPrice: 0.85 });
    expect(m.stocksRequired).toBe(0);
    expect(m.stockWeight).toBe(m.fabWeight);         // 2728 — no waste, no purchasable stick
    expect(m.totalCost).toBeCloseTo(2728 * 0.85, 6);
    expect(m.wasteLength).toBe(0);
    expect(m.efficiency).toBe(0);
  });
  it('remnant case: 3 × 7ft HSS on a 24ft stick', () => {
    const m = calc({ ...base, category: 'HSS Square', size: 'HSS4x4x1/4', pieces: 3, length: 7, priceBy: 'LB', unitPrice: 1.1 });
    expect(m.stockLength).toBe(24);
    expect(m.stocksRequired).toBe(1);
    expect(m.wasteLength).toBe(3);
    expect(m.efficiency).toBeCloseTo(87.5, 6);
  });
});

describe('supplier length overrides flow into stock selection', () => {
  it('restricting W lengths to 40/60 changes the pick', () => {
    const restricted = makeCalculateMaterial({
      availableLengthsFor: (category) => category === 'W Shape' ? [40, 60] : env.getStockLengthsForCategory(category),
    });
    const m = restricted({ ...base, category: 'W Shape', size: 'W12x26', pieces: 4, length: 32, priceBy: 'LB', unitPrice: 0.85 });
    expect(m.stockLength).toBe(40);
    expect(m.stockWeight).toBe(4160);                // 4 × 40 × 26
  });
});

describe('golden snapshot: representative material matrix', () => {
  it('freezes full outputs', () => {
    const cases = [
      { category: 'W Shape', size: 'W12x26', pieces: 4, length: 32, priceBy: 'LB', unitPrice: 0.85 },
      { category: 'W Shape', size: 'W18x35', pieces: 2, length: 28.08, priceBy: 'CWT', unitPrice: 47.85 },
      { category: 'Channel', size: 'C15x33.9', pieces: 3, length: 17.67, priceBy: 'LF', unitPrice: 34.25 },
      { category: 'Angle', size: 'L3x3x1/4', pieces: 6, length: 10, priceBy: 'EA', unitPrice: 45 },
      { category: 'Plate', size: '', plateThickness: 0.75, plateWidth: 10, pieces: 2, length: 1.5, priceBy: 'LB', unitPrice: 0.62 },
      { category: 'MC Channel', size: 'MC18x42.7', pieces: 2, length: 28.08, priceBy: 'LB', unitPrice: 1.069 },
      { category: 'Pipe', size: 'PIPE 6 STD', pieces: 42, length: 7, priceBy: 'EA', unitPrice: 95 },
      { category: 'Round Bar', size: 'RB 1', pieces: 10, length: 12, priceBy: 'LB', unitPrice: 0.95 },
    ];
    const out = cases.map(c => {
      const m = calc({ ...base, ...c });
      const { id, sequence, parentMaterialId, fabrication, customWeight, galvanized, ...rest } = m;
      return rest;
    });
    expect(out).toMatchSnapshot();
  });
});
