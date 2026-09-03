// Hardware rows in the material engine: bought per each, weight = pieces ×
// weight-each (customWeight), never nested. Shared by the UI and the server
// recompute, so this pins the numbers both sides must agree on.

import { describe, it, expect } from 'vitest';
import { calculateMaterial } from '../lib/estimating/material-calc.js';

const bolts = (over = {}) => ({
  id: 1, category: 'Hardware', size: '3/4" A325 x 2"', description: 'Anchor bolts',
  pieces: 12, length: 1, customWeight: 0.632, priceBy: 'EA', unitPrice: 4.25,
  ...over,
});

describe('Hardware rows', () => {
  it('weigh pieces × weight-each and price per each', () => {
    const m = calculateMaterial(bolts());
    expect(m.fabWeight).toBeCloseTo(12 * 0.632, 6);
    expect(m.stockWeight).toBeCloseTo(m.fabWeight, 6);
    expect(m.totalCost).toBeCloseTo(12 * 4.25, 6);
    expect(m.weightPerFoot).toBe(0.632);   // persisted as weightPerFt, reloaded as customWeight
  });

  it('carry no stock figures', () => {
    const m = calculateMaterial(bolts({ length: 20 }));
    expect(m.stocksRequired).toBe(0);
    expect(m.stockLength).toBe(0);
    expect(m.piecesPerStock).toBe(0);
    expect(m.totalLength).toBe(0);         // length is not a cut length for hardware
    expect(m.fabWeight).toBeCloseTo(12 * 0.632, 6);
  });

  it('still honour a $/lb rate against the weight-each total', () => {
    const m = calculateMaterial(bolts({ priceBy: 'LB', unitPrice: 2 }));
    expect(m.totalCost).toBeCloseTo(12 * 0.632 * 2, 6);
    const c = calculateMaterial(bolts({ priceBy: 'CWT', unitPrice: 200 }));
    expect(c.totalCost).toBeCloseTo((12 * 0.632 / 100) * 200, 6);
  });

  it('free-text hardware with no weight is $-only', () => {
    const m = calculateMaterial(bolts({ customWeight: 0, hardwareItemId: null }));
    expect(m.fabWeight).toBe(0);
    expect(m.totalCost).toBeCloseTo(12 * 4.25, 6);
  });
});
