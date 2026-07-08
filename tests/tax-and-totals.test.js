// Characterization: tax rules, item totals (both copies), breakout totals,
// and full project totals (grandTotal = bidAmount).

import { describe, it, expect } from 'vitest';
import {
  makeTaxFns, makeGetItemTotal, makeBreakoutTotals, makeCalculateTotals,
  componentTaxRate,
} from './helpers/extract.js';
import { getItemTotal as pdfGetItemTotal, getItemCostBreakdown } from '../components/pdf/pdfUtils.js';
import { standardFixture, breakoutFixture } from './helpers/fixtures.js';

const TAX_RATE = componentTaxRate();
const { items, adjustments } = standardFixture();
const [item1, item2] = items;

describe('TAX_RATE constant', () => {
  it('is 8.25%', () => expect(TAX_RATE).toBe(0.0825));
});

describe('calculateItemTax per category', () => {
  const matCost = item1.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
  const matMU = matCost * 0.12;
  const fabCost =
    item1.materials.reduce((s, m) => s + (m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0), 0) +
    item1.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
  const fabMU = fabCost * 0.08;

  it('newConstruction: (materials + material markup) × rate', () => {
    const { calculateItemTax } = makeTaxFns('newConstruction');
    expect(calculateItemTax(item1)).toBeCloseTo((matCost + matMU) * TAX_RATE, 8);
  });
  it('fob: (materials + matMU + fab + fabMU) × rate', () => {
    const { calculateItemTax } = makeTaxFns('fob');
    expect(calculateItemTax(item1)).toBeCloseTo((matCost + matMU + fabCost + fabMU) * TAX_RATE, 8);
  });
  it('resale / noTax / none: zero', () => {
    for (const cat of ['resale', 'noTax', null]) {
      const { calculateItemTax } = makeTaxFns(cat);
      expect(calculateItemTax(item1)).toBe(0);
    }
  });
  it('recap costs are never taxed in any category', () => {
    const { calculateItemTax } = makeTaxFns('fob');
    const recapTotal = Object.values(item1.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
    expect(recapTotal).toBeGreaterThan(0);
    // fob tax excludes recap: asserting the formula above already proves it,
    // this locks it against the breakdown too.
    const { getItemTaxBreakdown } = makeTaxFns('fob');
    expect(getItemTaxBreakdown(item1).taxableBase).toBeCloseTo(matCost + matMU + fabCost + fabMU, 8);
  });
});

describe('DUPLICATE MATH: calculateItemTax vs getItemTaxBreakdown', () => {
  it.each(['newConstruction', 'fob', 'resale', 'noTax', null])('agree for category %s', (cat) => {
    const { calculateItemTax, getItemTaxBreakdown } = makeTaxFns(cat);
    for (const it2 of items) {
      expect(getItemTaxBreakdown(it2).taxAmount).toBeCloseTo(calculateItemTax(it2), 10);
    }
  });
});

describe('DUPLICATE MATH: getItemTotal (component) vs getItemTotal (pdfUtils)', () => {
  const componentGetItemTotal = makeGetItemTotal();
  it('agree on every fixture item', () => {
    for (const it2 of items) {
      expect(pdfGetItemTotal(it2)).toBeCloseTo(componentGetItemTotal(it2), 10);
    }
  });
  it('item1 total to the penny: markups on mat and fab, recap flat, NO tax', () => {
    const matCost = item1.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
    const fabCost =
      item1.materials.reduce((s, m) => s + (m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0), 0) +
      item1.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
    const recapTotal = Object.values(item1.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
    const expected = matCost * 1.12 + fabCost * 1.08 + recapTotal;
    expect(componentGetItemTotal(item1)).toBeCloseTo(expected, 8);
  });
  it('getItemCostBreakdown components reconcile to the total', () => {
    const b = getItemCostBreakdown(item1);
    expect(b.material + b.matMarkupAmt + b.fabrication + b.fabMarkupAmt + b.recapCost).toBeCloseTo(b.total, 8);
    expect(b).toMatchSnapshot();
  });
});

describe('calculateBreakoutTotals (Quote tab)', () => {
  const fx = breakoutFixture();
  const breakout = makeBreakoutTotals(fx);
  const componentGetItemTotal = makeGetItemTotal();
  const t = (i) => componentGetItemTotal(fx.items[i]);

  it('base bid = base + ungrouped + DEDUCT items + adjustments; ADD items excluded', () => {
    const r = breakout();
    expect(r.baseBid).toBeCloseTo(t(0) + t(1) + t(2) + 750, 8);
    expect(r.deducts).toHaveLength(1);
    expect(r.deducts[0].total).toBeCloseTo(t(2), 8);
    expect(r.adds).toHaveLength(1);
    expect(r.adds[0].total).toBeCloseTo(t(3), 8);
  });
  it('FINDING #3: base bid excludes tax entirely (getItemTotal has no tax term)', () => {
    // Whatever the project tax category, the quote's base bid never includes
    // tax, while grandTotal (bidAmount) does — see totals test below.
    const r = breakout();
    const noTaxSum = t(0) + t(1) + t(2) + 750;
    expect(r.baseBid).toBeCloseTo(noTaxSum, 8);
  });
});

describe('calculateTotals → grandTotal (= bidAmount on save)', () => {
  const expectTotalsShape = (totals) => {
    const subtotal = totals.totalMaterialCost + totals.totalFabricationCost + totals.totalMarkup + totals.totalRecapCosts + totals.totalTax;
    expect(totals.subtotal).toBeCloseTo(subtotal, 8);
    expect(totals.grandTotal).toBeCloseTo(subtotal + totals.totalAdjustments, 8);
  };

  it.each(['newConstruction', 'fob', 'resale', 'noTax', null])('category %s reconciles and snapshots', (cat) => {
    const calculateTotals = makeCalculateTotals({ items, adjustments, taxCategory: cat });
    const totals = calculateTotals();
    expectTotalsShape(totals);
    // tax equals the sum of per-item tax
    const { calculateItemTax } = makeTaxFns(cat);
    const taxSum = items.reduce((s, i) => s + calculateItemTax(i), 0);
    expect(totals.totalTax).toBeCloseTo(taxSum, 8);
    expect(round2(totals)).toMatchSnapshot();
  });

  it('penny-exact spot check (fob)', () => {
    const totals = makeCalculateTotals({ items, adjustments, taxCategory: 'fob' })();
    // material cost = sum of every material totalCost
    const matSum = items.flatMap(i => i.materials).reduce((s, m) => s + (m.totalCost || 0), 0);
    expect(totals.totalMaterialCost).toBeCloseTo(matSum, 8);
    // adjustments: -500 + 125.50
    expect(totals.totalAdjustments).toBeCloseTo(-374.5, 10);
  });

  it('connection weight = fab quantity × connWeight for connection ops', () => {
    const totals = makeCalculateTotals({ items, adjustments, taxCategory: null })();
    expect(totals.totalConnectionWeight).toBe(60); // WF Connx qty 2 × 30 lb
  });

  it('stock vs fab weight totals include galv and children', () => {
    const totals = makeCalculateTotals({ items, adjustments, taxCategory: null })();
    const fabSum = items.flatMap(i => i.materials).reduce((s, m) => s + (m.fabWeight || 0), 0);
    const stockSum = items.flatMap(i => i.materials).reduce((s, m) => s + (m.stockWeight || 0), 0);
    expect(totals.totalFabWeight).toBeCloseTo(fabSum, 8);
    expect(totals.totalStockWeight).toBeCloseTo(stockSum, 8);
  });
});

// Round every numeric field to 2dp for stable, penny-accurate snapshots
function round2(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v]));
}
