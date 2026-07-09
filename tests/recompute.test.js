// Server-authoritative recompute: parity with client-computed fixtures, and
// correction of tampered client assertions.

import { describe, it, expect } from 'vitest';
import { recomputeEstimate, diffAssertedTotals, MONEY_TOLERANCE } from '../lib/estimating/recompute.js';
import { projectTotals } from '../lib/estimating/totals.js';
import { DEFAULT_PRICING_RATES, resolvePricingRates } from '../lib/estimating/rates.js';
import { standardFixture, bigFixture } from './helpers/fixtures.js';

const rates = DEFAULT_PRICING_RATES;

describe('parity: recompute over client-computed state is a fixed point', () => {
  it.each([['standard', standardFixture], ['large-330', bigFixture]])('%s fixture', (_, fx) => {
    const { items, adjustments } = fx();
    const clientTotals = projectTotals(items, adjustments, 'fob', rates).totals;

    const r = recomputeEstimate(
      { items, adjustments, taxCategory: 'fob' },
      rates
    );

    // grandTotal (bidAmount) identical to what the client computed
    expect(r.totals.grandTotal).toBeCloseTo(clientTotals.grandTotal, 8);
    // every material line reproduces the stored numbers exactly
    r.items.forEach((item, i) => {
      item.materials.forEach((mat, j) => {
        const orig = items[i].materials[j];
        expect(mat.totalCost).toBeCloseTo(orig.totalCost || 0, 8);
        expect(mat.stockWeight).toBeCloseTo(orig.stockWeight || 0, 8);
        expect(mat.fabWeight).toBeCloseTo(orig.fabWeight || 0, 8);
      });
    });
    // and the diff detector reports agreement
    expect(diffAssertedTotals({ items }, r, clientTotals.grandTotal)).toEqual([]);
  });

  it('resolvePricingRates over the (taxRate-less) PricingRates row equals the client defaults', () => {
    // The DB PricingRates table has no taxRate column, so the server's
    // resolved rates match the client's DEFAULT_PRICING_RATES — identical
    // inputs on both sides by construction.
    const dbRow = { id: 1, shopLaborRatePerHr: 65, drillHolesRate: 4.5, taxRate: undefined };
    const resolved = resolvePricingRates(dbRow);
    expect(resolved.taxRate).toBe(DEFAULT_PRICING_RATES.taxRate);
  });
});

describe('tampered client values are corrected and reported', () => {
  it('zeroed and inflated totals both come back as engine numbers', () => {
    const { items, adjustments } = standardFixture();
    const honest = recomputeEstimate({ items, adjustments, taxCategory: 'fob' }, rates);

    // Tamper: zero one line, inflate another, corrupt a fab total and a recap
    const tampered = JSON.parse(JSON.stringify(items));
    tampered[0].materials[0].totalCost = 0;
    tampered[0].materials[0].stockWeight = 0;
    tampered[1].materials[0].totalCost = 999999;
    tampered[0].materials[0].fabrication[0].totalCost = 12345;
    tampered[0].recapCosts.installation.total = 777777;

    const r = recomputeEstimate({ items: tampered, adjustments, taxCategory: 'fob' }, rates);

    // Server output is unaffected by the client's asserted numbers
    expect(r.totals.grandTotal).toBeCloseTo(honest.totals.grandTotal, 8);
    expect(r.items[0].materials[0].totalCost).toBeCloseTo(honest.items[0].materials[0].totalCost, 8);
    expect(r.items[0].recapCosts.installation.total).toBeCloseTo(honest.items[0].recapCosts.installation.total, 8);

    // The diff detector names every lie
    const diffs = diffAssertedTotals({ items: tampered }, r, 5);
    const fields = diffs.map(d => d.field).sort();
    expect(fields).toContain('material.totalCost');
    expect(fields).toContain('material.stockWeight');
    expect(fields).toContain('materialFab.totalCost');
    expect(fields).toContain('recap.installation.total');
    expect(fields).toContain('bidAmount');
    const bid = diffs.find(d => d.field === 'bidAmount');
    expect(bid.client).toBe(5);
    expect(bid.server).toBeCloseTo(honest.totals.grandTotal, 8);
  });

  it('sub-cent noise stays under the one-cent tolerance', () => {
    const { items, adjustments } = standardFixture();
    const nudged = JSON.parse(JSON.stringify(items));
    nudged[0].materials[0].totalCost += MONEY_TOLERANCE * 0.4; // 0.4¢
    const r = recomputeEstimate({ items: nudged, adjustments, taxCategory: null }, rates);
    expect(diffAssertedTotals({ items: nudged }, r, r.totals.grandTotal)).toEqual([]);
  });
});

describe('nesting-enabled recompute mirrors the client overlay', () => {
  it('pooled lines carry allocation-based stock weight and cost', () => {
    const { items, adjustments } = standardFixture();
    const r = recomputeEstimate(
      { items, adjustments, taxCategory: null, nestingEnabled: true, nestKerfIn: 0.25, nestEndCropIn: 0 },
      rates
    );
    const pooled = r.items.flatMap(i => i.materials).filter(m => m.pooled);
    expect(pooled.length).toBeGreaterThan(0);
    // allocation identity: pooled stock weight = fabWeight × yield
    for (const m of pooled) {
      expect(m.stockWeight).toBeCloseTo((m.fabWeight || 0) * m.nestYield, 6);
    }
    // and totals reconcile
    const t = r.totals;
    expect(t.grandTotal).toBeCloseTo(t.subtotal + t.totalAdjustments, 6);
  });

  it('priceStandalone items keep standalone numbers under nesting', () => {
    const { items, adjustments } = standardFixture();
    const marked = JSON.parse(JSON.stringify(items));
    marked[0].priceStandalone = true;
    const r = recomputeEstimate(
      { items: marked, adjustments, taxCategory: null, nestingEnabled: true, nestKerfIn: 0.25, nestEndCropIn: 0 },
      rates
    );
    expect(r.items[0].materials.every(m => !m.pooled)).toBe(true);
  });
});
