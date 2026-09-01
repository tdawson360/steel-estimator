// New engine outputs (Session B): per-material and per-item cost breakdowns.
// These are ADDITIVE — they must reconcile exactly with the frozen totals.

import { describe, it, expect } from 'vitest';
import { projectTotals, itemBreakdown, materialBreakdown, getItemTotal } from '../lib/estimating/totals.js';
import { DEFAULT_PRICING_RATES } from '../lib/estimating/rates.js';
import { standardFixture, bigFixture } from './helpers/fixtures.js';

const rates = DEFAULT_PRICING_RATES;

describe('line-item breakdowns reconcile to project totals', () => {
  it.each(['fob', 'newConstruction', null])('category %s (standard fixture)', (cat) => {
    const { items, adjustments } = standardFixture();
    const { totals, items: breakdowns } = projectTotals(items, adjustments, cat, rates);

    expect(breakdowns).toHaveLength(items.length);
    const matSum = breakdowns.reduce((s, b) => s + b.materialCost, 0);
    const fabSum = breakdowns.reduce((s, b) => s + b.fabricationCost, 0);
    const muSum = breakdowns.reduce((s, b) => s + b.materialMarkupAmt + b.fabMarkupAmt, 0);
    const recapSum = breakdowns.reduce((s, b) => s + b.recapTotal, 0);
    const taxSum = breakdowns.reduce((s, b) => s + b.tax, 0);
    expect(matSum).toBeCloseTo(totals.totalMaterialCost, 8);
    expect(fabSum).toBeCloseTo(totals.totalFabricationCost, 8);
    expect(muSum).toBeCloseTo(totals.totalMarkup, 8);
    expect(recapSum).toBeCloseTo(totals.totalRecapCosts, 8);
    expect(taxSum).toBeCloseTo(totals.totalTax, 8);
    expect(breakdowns.reduce((s, b) => s + b.fabWeight, 0)).toBeCloseTo(totals.totalFabWeight, 8);
    expect(breakdowns.reduce((s, b) => s + b.stockWeight, 0)).toBeCloseTo(totals.totalStockWeight, 8);
    expect(breakdowns.reduce((s, b) => s + b.connectionWeight, 0)).toBeCloseTo(totals.totalConnectionWeight, 8);
  });

  it('itemTotal matches getItemTotal; itemTotalWithTax adds exactly the item tax', () => {
    const { items } = standardFixture();
    for (const item of items) {
      const b = itemBreakdown(item, 'fob', rates);
      expect(b.itemTotal).toBeCloseTo(getItemTotal(item), 10);
      expect(b.itemTotalWithTax - b.itemTotal).toBeCloseTo(b.tax, 10);
    }
  });

  it('material breakdown answers "what does this member cost and why"', () => {
    const { items } = standardFixture();
    const beam = items[0].materials[0]; // W12x26 with WF Connx + fillet weld
    const b = materialBreakdown(beam);
    expect(b.materialCost).toBeCloseTo(beam.totalCost, 10);
    expect(b.fabLines.map(f => f.operation)).toEqual(['WF Connx', 'Apply- Fillet Weld']);
    expect(b.fabCost).toBeCloseTo(170 + 20, 10);
    expect(b.connectionWeight).toBe(60); // 2 × 30 lb
    expect(b.lineTotal).toBeCloseTo(b.materialCost + b.fabCost, 10);
  });

  it('holds at scale (330 materials)', () => {
    const { items, adjustments } = bigFixture();
    const { totals, items: breakdowns } = projectTotals(items, adjustments, 'fob', rates);
    const lineSum = breakdowns.flatMap(b => b.materials).reduce((s, m) => s + m.materialCost, 0);
    expect(lineSum).toBeCloseTo(totals.totalMaterialCost, 6);
    expect(breakdowns.flatMap(b => b.materials)).toHaveLength(330);
  });
});
