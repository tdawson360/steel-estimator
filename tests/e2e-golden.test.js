// End-to-end golden masters: fixture in → project totals and bidAmount out,
// asserted to the penny. Includes the 330-material large fixture.

import { describe, it, expect } from 'vitest';
import { makeCalculateTotals, makeGetItemTotal, makeBuildStockListExport, componentModuleEnv } from './helpers/extract.js';
import { getItemTotal as pdfGetItemTotal } from '../components/pdf/pdfUtils.js';
import { standardFixture, bigFixture } from './helpers/fixtures.js';

const env = componentModuleEnv();
const round2 = (v) => Math.round(v * 100) / 100;
const round2All = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'number' ? round2(v) : v]));

describe('standard fixture end-to-end', () => {
  const { items, adjustments } = standardFixture();

  it('grandTotal (bidAmount) per tax category — to the penny', () => {
    const byCategory = {};
    for (const cat of ['newConstruction', 'fob', 'resale', 'noTax', null]) {
      const totals = makeCalculateTotals({ items, adjustments, taxCategory: cat })();
      byCategory[String(cat)] = round2(totals.grandTotal);
    }
    expect(byCategory).toMatchSnapshot();
    // resale, noTax and none agree (tax is the only difference)
    expect(byCategory['resale']).toBe(byCategory['null']);
    expect(byCategory['noTax']).toBe(byCategory['null']);
    // fob ≥ newConstruction ≥ untaxed
    expect(byCategory['fob']).toBeGreaterThan(byCategory['newConstruction']);
    expect(byCategory['newConstruction']).toBeGreaterThan(byCategory['null']);
  });

  it('full totals object snapshot (fob)', () => {
    const totals = makeCalculateTotals({ items, adjustments, taxCategory: 'fob' })();
    expect(round2All(totals)).toMatchSnapshot();
  });

  it('per-item totals snapshot, both implementations agreeing', () => {
    const componentGetItemTotal = makeGetItemTotal();
    const perItem = items.map(i => ({
      item: i.itemNumber,
      component: round2(componentGetItemTotal(i)),
      pdf: round2(pdfGetItemTotal(i)),
    }));
    for (const p of perItem) expect(p.component).toBe(p.pdf);
    expect(perItem).toMatchSnapshot();
  });

  it('every material line snapshot (weights, stock, cost)', () => {
    const lines = items.flatMap(i => i.materials.map(m => ({
      item: i.itemNumber,
      size: m.size || m.description,
      pieces: m.pieces,
      length: m.length,
      priceBy: m.priceBy,
      wpf: round2(m.weightPerFoot || 0),
      fabWeight: round2(m.fabWeight || 0),
      stockLength: m.stockLength,
      stocksRequired: m.stocksRequired,
      stockWeight: round2(m.stockWeight || 0),
      totalCost: round2(m.totalCost || 0),
    })));
    expect(lines).toMatchSnapshot();
  });
});

describe('large fixture (330 materials) end-to-end', () => {
  const { items, adjustments } = bigFixture();

  it('has the promised scale', () => {
    expect(items.length).toBe(30);
    expect(items.reduce((s, i) => s + i.materials.length, 0)).toBe(330);
  });

  it('grandTotal to the penny, per tax category', () => {
    const out = {};
    for (const cat of ['newConstruction', 'fob', null]) {
      const totals = makeCalculateTotals({ items, adjustments, taxCategory: cat })();
      out[String(cat)] = {
        material: round2(totals.totalMaterialCost),
        fab: round2(totals.totalFabricationCost),
        markup: round2(totals.totalMarkup),
        recap: round2(totals.totalRecapCosts),
        tax: round2(totals.totalTax),
        adjustments: round2(totals.totalAdjustments),
        grandTotal: round2(totals.grandTotal),
        fabWeight: round2(totals.totalFabWeight),
        stockWeight: round2(totals.totalStockWeight),
      };
      // reconciliation identity holds at scale
      const t = totals;
      expect(t.subtotal).toBeCloseTo(
        t.totalMaterialCost + t.totalFabricationCost + t.totalMarkup + t.totalRecapCosts + t.totalTax, 6);
      expect(t.grandTotal).toBeCloseTo(t.subtotal + t.totalAdjustments, 6);
    }
    expect(out).toMatchSnapshot();
  });

  it('material cost equals the line-by-line sum', () => {
    const totals = makeCalculateTotals({ items, adjustments, taxCategory: null })();
    const lineSum = items.flatMap(i => i.materials).reduce((s, m) => s + (m.totalCost || 0), 0);
    expect(totals.totalMaterialCost).toBeCloseTo(lineSum, 6);
  });

  it('nest allocation over the large fixture stays exact', () => {
    const nest = env.computeProjectNest(items, 0.25 / 12, 0);
    for (const g of nest.groups) {
      const allocSum = [...nest.byMaterial.values()]
        .filter(a => a.groupKey === g.key)
        .reduce((s, a) => s + a.allocStockLengthFt, 0);
      expect(allocSum).toBeCloseTo(g.buyLengthFt, 4);
    }
    const summary = nest.groups.map(g => ({
      size: g.size, sticks: g.sticks.length,
      buy: round2(g.buyLengthFt), yield: +g.yield.toFixed(6),
      over: g.overLengthCuts.length, short: g.shortfallCuts.length,
    }));
    expect(summary).toMatchSnapshot();
  });
});

describe('buildStockListExport (priced buy list feeding CSV/PDF)', () => {
  it('est cost per unit basis and totals', () => {
    const displayedStockList = [
      { itemNumber: '001', itemName: 'A', size: 'W12x26', stockLength: 40, totalStocks: 2, weightPerFoot: 26, totalWeight: 2080, pooled: false },
      { itemNumber: 'Pooled', itemName: 'Items 1, 2', size: 'W18x35', stockLength: 60, totalStocks: 1, weightPerFoot: 35, totalWeight: 2100, pooled: true },
      { itemNumber: '002', itemName: 'B', size: 'C15x33.9', stockLength: 30, totalStocks: 3, weightPerFoot: 33.9, totalWeight: 3051, pooled: false },
      { itemNumber: '003', itemName: 'C', size: 'L3x3x1/4', stockLength: 20, totalStocks: 1, weightPerFoot: 4.9, totalWeight: 98, pooled: false },
    ];
    const sizePricing = new Map([
      ['W12x26', { priceBy: 'LB', unitPrice: 0.85, mixed: false }],
      ['W18x35', { priceBy: 'CWT', unitPrice: 47.85, mixed: false }],
      ['C15x33.9', { priceBy: 'LF', unitPrice: 34.25, mixed: false }],
      ['L3x3x1/4', { priceBy: 'LB', unitPrice: 0.9, mixed: true }], // mixed → no est cost
    ]);
    const build = makeBuildStockListExport({ displayedStockList, sizePricing, projectNest: null, stockListFilter: '' });
    const out = build();
    expect(out.rows.map(r => ({ size: r.size, rate: r.rate, priceBy: r.priceBy, est: r.estCost == null ? null : round2(r.estCost) })))
      .toEqual([
        { size: 'W12x26', rate: 0.85, priceBy: 'LB', est: 1768 },          // 2080 × 0.85
        { size: 'W18x35', rate: 47.85, priceBy: 'CWT', est: 1004.85 },     // 21 cwt × 47.85
        { size: 'C15x33.9', rate: 34.25, priceBy: 'LF', est: 3082.5 },     // 30 × 3 × 34.25
        { size: 'L3x3x1/4', rate: null, priceBy: 'mixed', est: null },
      ]);
    expect(round2(out.totalCost)).toBe(5855.35);
    expect(out.totalWeight).toBe(7329);
    expect(out.shortfalls).toEqual([]);
  });

  it('shortfalls carried from the nest into the export', () => {
    const projectNest = {
      groups: [{
        key: 'W Shape|W18x35', size: 'W18x35', weightPerFoot: 35,
        shortfallCuts: [{ length: 32, itemNumber: '001' }, { length: 32, itemNumber: '001' }],
        overLengthCuts: [], sticks: [], purchase: [], buyLengthFt: 0, netLengthFt: 0, yield: 1,
      }],
      byMaterial: new Map(),
    };
    const build = makeBuildStockListExport({ displayedStockList: [], sizePricing: new Map(), projectNest, stockListFilter: '' });
    const out = build();
    expect(out.shortfalls).toEqual([
      { size: 'W18x35', cuts: 2, totalFt: 64, lbs: 2240, detail: "32' (Item 001), 32' (Item 001)" },
    ]);
  });
});
