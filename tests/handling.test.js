// Per-piece handling (lib/estimating/handling.js): auto line per member,
// class from piece weight incl. attachments, rate = minutes × shop rate,
// exclusions, hardware never handled, grouping key, engine parity.

import { describe, it, expect } from 'vitest';
import {
  normalizeHandlingLines, defaultHandlingClassCode, handlingRatePerPiece, pieceHandlingWeight,
  handlesAsPiece, HANDLING_OP, configureHandling,
} from '../lib/estimating/handling.js';
import { fabGroupKey, isGroupableFab, computeGroupSummaries } from '../lib/estimating/labor-groups.js';
import { recomputeEstimate } from '../lib/estimating/recompute.js';
import { DEFAULT_PRICING_RATES } from '../lib/estimating/rates.js';

const classes = [
  { code: 'HL1', name: 'Light',  minLb: 0,    maxLb: 50,   minutesPerPiece: 3,  sortOrder: 1, active: true },
  { code: 'HL2', name: 'Medium', minLb: 50,   maxLb: 250,  minutesPerPiece: 6,  sortOrder: 2, active: true },
  { code: 'HL3', name: 'Heavy',  minLb: 250,  maxLb: null, minutesPerPiece: 15, sortOrder: 3, active: true },
];
const shopRate = 60; // $1/min keeps the arithmetic obvious
const opts = { enabled: true, classes, shopRate };

const beam = { id: 1, parentMaterialId: null, category: 'W Shape', size: 'W12x26', pieces: 4, fabWeight: 4 * 520, fabrication: [] };
const clip = { id: 2, parentMaterialId: 1, category: 'Angle', size: 'L3x3x1/4', pieces: 8, fabWeight: 8 * 6, fabrication: [] };
const bolts = { id: 3, parentMaterialId: null, category: 'Hardware', size: '3/4" A325 x 2"', pieces: 40, fabWeight: 25, fabrication: [] };
const light = { id: 4, parentMaterialId: null, category: 'Angle', size: 'L2x2x1/4', pieces: 10, fabWeight: 10 * 20, fabrication: [] };

describe('class selection and rate', () => {
  it('brackets by piece weight, last class is open-ended', () => {
    expect(defaultHandlingClassCode(20, classes)).toBe('HL1');
    expect(defaultHandlingClassCode(50, classes)).toBe('HL2');     // lower bound inclusive
    expect(defaultHandlingClassCode(249.9, classes)).toBe('HL2');
    expect(defaultHandlingClassCode(5000, classes)).toBe('HL3');
    expect(defaultHandlingClassCode(0, classes)).toBe('HL1');
  });
  it('rate = minutes ÷ 60 × shop rate, 0 when unpriced', () => {
    expect(handlingRatePerPiece(classes, 'HL2', 60)).toBe(6);
    expect(handlingRatePerPiece(classes, 'HL2', 65)).toBeCloseTo(6.5, 2);
    expect(handlingRatePerPiece(classes, 'HL2', 0)).toBe(0);
    expect(handlingRatePerPiece([{ ...classes[0], minutesPerPiece: 0 }], 'HL1', 60)).toBe(0);
  });
  it('piece weight = member per piece + attachments per parent piece', () => {
    expect(pieceHandlingWeight(beam, [beam, clip])).toBe(520 + 48 / 4);   // 532
    expect(pieceHandlingWeight(light, [light])).toBe(20);
    expect(handlesAsPiece(bolts)).toBe(false);
    expect(handlesAsPiece(clip)).toBe(false);
    expect(handlesAsPiece(beam)).toBe(true);
  });
});

describe('normalizeHandlingLines', () => {
  it('adds one line per main member, none for attachments or hardware', () => {
    const out = normalizeHandlingLines([beam, clip, bolts, light], opts);
    const line = (m) => m.fabrication.find(f => f.isAutoHandling);
    expect(line(out[0])).toMatchObject({ operation: HANDLING_OP, quantity: 4, handlingClass: 'HL3', unitPrice: 15, totalCost: 60, unit: 'EA' });
    expect(line(out[1])).toBeUndefined();
    expect(line(out[2])).toBeUndefined();
    expect(line(out[3])).toMatchObject({ handlingClass: 'HL1', quantity: 10, unitPrice: 3, totalCost: 30 });
    expect(out[0].fabrication[0].description).toBe('Handling — Heavy');
  });
  it('is identity-preserving and re-derives quantity/class from edits until pinned', () => {
    const first = normalizeHandlingLines([beam, light], opts);
    expect(normalizeHandlingLines(first, opts)).toBe(first);
    const lighter = first.map(m => m.id === 1 ? { ...m, fabWeight: 4 * 100 } : m);   // 100 lb/pc → Medium
    const again = normalizeHandlingLines(lighter, opts);
    expect(again[0].fabrication[0]).toMatchObject({ handlingClass: 'HL2' });
    // priced line keeps its rate, only class/desc move
    expect(again[0].fabrication[0].unitPrice).toBe(15);
    const pinned = again.map(m => m.id === 1 ? { ...m, fabWeight: 4 * 520, fabrication: [{ ...m.fabrication[0], handlingClassPinned: true }] } : m);
    expect(normalizeHandlingLines(pinned, opts)[0].fabrication[0].handlingClass).toBe('HL2');
  });
  it('a $0 line takes the class rate; a priced line keeps the estimator rate', () => {
    const zeroed = normalizeHandlingLines([light], opts).map(m => ({ ...m, fabrication: [{ ...m.fabrication[0], unitPrice: 0 }] }));
    expect(normalizeHandlingLines(zeroed, opts)[0].fabrication[0].unitPrice).toBe(3);
    const custom = normalizeHandlingLines([light], opts).map(m => ({ ...m, fabrication: [{ ...m.fabrication[0], unitPrice: 9 }] }));
    expect(normalizeHandlingLines(custom, opts)[0].fabrication[0]).toMatchObject({ unitPrice: 9, totalCost: 90 });
  });
  it('drops lines when disabled or when the member is excluded', () => {
    const on = normalizeHandlingLines([beam, light], opts);
    const off = normalizeHandlingLines(on, { ...opts, enabled: false });
    expect(off.every(m => !m.fabrication.some(f => f.isAutoHandling))).toBe(true);
    const excluded = normalizeHandlingLines(on.map(m => m.id === 4 ? { ...m, handlingExcluded: true } : m), opts);
    expect(excluded[1].fabrication.some(f => f.isAutoHandling)).toBe(false);
    expect(excluded[0].fabrication.some(f => f.isAutoHandling)).toBe(true);
  });
  it('uses the module config when no options are passed', () => {
    configureHandling({ enabled: true, classes, shopRate });
    expect(normalizeHandlingLines([light])[0].fabrication[0].unitPrice).toBe(3);
    configureHandling({ enabled: false });
    expect(normalizeHandlingLines([light])[0].fabrication.length).toBe(0);
  });
});

describe('grouping and engine parity', () => {
  it('handling lines group by class and sort after ordinary ops, before galv', () => {
    const [m] = normalizeHandlingLines([light], opts);
    const line = m.fabrication[0];
    expect(isGroupableFab(line)).toBe(true);
    expect(fabGroupKey(m, line)).toBe(`HL1|${HANDLING_OP}`);
    const item = {
      materials: [{ ...m, fabrication: [{ ...line, laborGroupId: 'h' }, { id: 'c', operation: 'Cut- Straight', quantity: 10, unit: 'EA', unitPrice: 2, laborGroupId: 'x' }] }],
      laborGroups: [
        { id: 'g', operation: 'Galvanizing', familyKey: 'KDS', rate: 0.5, unit: 'lb' },
        { id: 'h', operation: HANDLING_OP, familyKey: 'HL1', rate: 4, unit: 'ea' },
        { id: 'x', operation: 'Cut- Straight', familyKey: 'L2x2x1/4', rate: 2, unit: 'ea' },
      ],
    };
    const s = computeGroupSummaries(item);
    expect(s.map(g => g.id)).toEqual(['x', 'h', 'g']);
    expect(s[1]).toMatchObject({ totalQty: 10, totalCost: 40 });
  });
  it('the engine re-derives quantity = pieces and prices at the line (or group) rate', () => {
    const [m] = normalizeHandlingLines([{ ...light, unitPrice: 0.8, priceBy: 'LB', length: 10 }], opts);
    const res = recomputeEstimate({ items: [{ id: 1, itemNumber: '001', materials: [{ ...m, pieces: 12 }], fabrication: [], recapCosts: {}, laborGroups: [] }], adjustments: [], taxCategory: 'fob' }, DEFAULT_PRICING_RATES);
    const hl = res.items[0].materials[0].fabrication.find(f => f.isAutoHandling);
    expect(hl.quantity).toBe(12);
    expect(hl.totalCost).toBeCloseTo(12 * 3, 6);
    const grouped = recomputeEstimate({ items: [{ id: 1, itemNumber: '001', materials: [{ ...m, fabrication: [{ ...m.fabrication[0], laborGroupId: 'h' }] }], fabrication: [], recapCosts: {}, laborGroups: [{ id: 'h', operation: HANDLING_OP, familyKey: 'HL1', rate: 5 }] }], adjustments: [], taxCategory: 'fob' }, DEFAULT_PRICING_RATES);
    expect(grouped.items[0].materials[0].fabrication.find(f => f.isAutoHandling).totalCost).toBeCloseTo(50, 6);
  });
});
