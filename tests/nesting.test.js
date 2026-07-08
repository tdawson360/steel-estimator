// Characterization: cross-item nesting engine — FFD packing, kerf/end-crop,
// supplier caps, yield allocation, over-length/shortfall flags, piece cap.

import { describe, it, expect } from 'vitest';
import { componentModuleEnv } from './helpers/extract.js';

const env = componentModuleEnv();
const { computeProjectNest, nestCutsFFD, compressGroupSticks, MAX_NEST_PIECES } = env;

const mkMat = (id, size, pieces, length, wpf, cat = 'W Shape') => ({
  id, size, category: cat, pieces, length, weightPerFoot: wpf,
  fabWeight: pieces * length * wpf, priceBy: 'LB', unitPrice: 1,
});
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const items = [
  { id: 1, itemNumber: '1', materials: [mkMat('a', 'W16x26', 2, 32, 26)] },
  { id: 2, itemNumber: '2', materials: [mkMat('b', 'W16x26', 3, 8, 26)] },
  { id: 3, itemNumber: '3', priceStandalone: true, materials: [mkMat('c', 'W16x26', 1, 10, 26)] },
  { id: 4, itemNumber: '4', materials: [mkMat('d', 'PL 1/2 x 6', 4, 2, 10.2, 'Plate')] },
];

describe('pooling scope', () => {
  const nest = computeProjectNest(items, 0.25 / 12, 0);
  it('one group; plate and standalone excluded', () => {
    expect(nest.groups).toHaveLength(1);
    expect(nest.byMaterial.has('c')).toBe(false);
    expect(nest.byMaterial.has('d')).toBe(false);
  });
  it('cross-item sharing: 8-footers ride the 32-footer stick', () => {
    const g = nest.groups[0];
    expect(g.sticks.map(s => ({ len: s.stockLength, cuts: s.cuts.map(c => c.length) }))).toEqual([
      { len: 60, cuts: [32, 8, 8, 8] },
      { len: 35, cuts: [32] },
    ]);
  });
  it('allocation sums exactly to the buy', () => {
    const g = nest.groups[0];
    expect(near(g.netLengthFt, 88)).toBe(true);
    expect(near(g.yield, g.buyLengthFt / 88)).toBe(true);
    const aA = nest.byMaterial.get('a');
    const aB = nest.byMaterial.get('b');
    expect(near(aA.allocStockLengthFt + aB.allocStockLengthFt, g.buyLengthFt)).toBe(true);
    expect(near(aA.allocStockLengthFt, 64 * g.yield)).toBe(true);
  });
});

describe('kerf and end crop (n−1 kerfs per stick)', () => {
  const angle = (pieces, length) => [{ id: 1, itemNumber: '1', materials: [mkMat('y', 'L3x3x1/4', pieces, length, 4.9, 'Angle')] }];
  it('no kerf: 2×20 fits one 40', () => {
    expect(computeProjectNest(angle(2, 20), 0, 0).groups[0].buyLengthFt).toBe(40);
  });
  it('kerf: 2×20 needs two 20s (separating cut loses kerf)', () => {
    const g = computeProjectNest(angle(2, 20), 0.25 / 12, 0).groups[0];
    expect(g.buyLengthFt).toBe(40);
    expect(g.sticks.every(s => s.stockLength === 20)).toBe(true);
  });
  it('lone full-length piece fits exact mill length despite kerf', () => {
    const g = computeProjectNest(
      [{ id: 1, itemNumber: '1', materials: [mkMat('z', 'W18x35', 1, 20, 35)] }], 0.25 / 12, 0
    ).groups[0];
    expect(g.buyLengthFt).toBe(20);
  });
  it('end crop upsizes cropped sticks', () => {
    expect(computeProjectNest(angle(2, 20), 0, 4 / 12).groups[0].buyLengthFt).toBe(80);
  });
});

describe('over-length and supplier caps', () => {
  it('piece longer than catalog max flags over-length, carried at exact length', () => {
    const nest = computeProjectNest([{ id: 1, itemNumber: '1', materials: [mkMat('x', 'W16x26', 1, 62, 26)] }], 0, 0);
    expect(nest.groups[0].overLengthCuts).toHaveLength(1);
    expect(nest.byMaterial.get('x').overLength).toBe(true);
    expect(near(nest.byMaterial.get('x').yield, 1)).toBe(true);
  });
  it('supplier length overrides restrict sticks', () => {
    const nest = computeProjectNest(items, 0.25 / 12, 0,
      (cat, size) => size === 'W16x26' ? [40, 60] : env.getStockLengthsForCategory(cat));
    expect(nest.groups[0].buyLengthFt).toBe(100); // 60 + 40
  });
  it('caps: 15 needed, 9 supplied → 9 bought + 6 shortfall at exact length', () => {
    const nest = computeProjectNest(
      [{ id: 1, itemNumber: '1', materials: [mkMat('q', 'W18x35', 15, 55, 35)] }],
      0, 0, () => [60], () => ({ 60: 9 })
    );
    const g = nest.groups[0];
    expect(g.sticks).toHaveLength(9);
    expect(g.shortfallCuts).toHaveLength(6);
    expect(nest.byMaterial.get('q').shortfall).toBe(true);
    expect(near(g.buyLengthFt, 9 * 60 + 6 * 55)).toBe(true);
  });
  it('caps: remainder repacks onto smaller in-supply lengths', () => {
    const nest = computeProjectNest(
      [{ id: 1, itemNumber: '1', materials: [mkMat('r', 'W18x35', 20, 8, 35)] }],
      0, 0, () => [20, 60], () => ({ 60: 1 })
    );
    const g = nest.groups[0];
    expect(g.shortfallCuts).toHaveLength(0);
    expect(g.sticks.filter(s => s.stockLength === 60)).toHaveLength(1);
    expect(near(g.buyLengthFt, 60 + 7 * 20)).toBe(true);
  });
  it('caps: upsizes when the preferred short length runs out', () => {
    const nest = computeProjectNest(
      [{ id: 1, itemNumber: '1', materials: [mkMat('s', 'W18x35', 3, 35, 35)] }],
      0, 0, () => [40, 60], () => ({ 40: 2 })
    );
    expect(nest.groups[0].sticks.map(s => s.stockLength).sort((a, b) => a - b)).toEqual([40, 40, 60]);
  });
});

describe('scale guards', () => {
  it('40k pieces nests fast with exact allocation', () => {
    const t0 = Date.now();
    const nest = computeProjectNest(
      [{ id: 1, itemNumber: '1', materials: [mkMat('t', 'W18x35', 40000, 8, 35)] }], 0.25 / 12, 0);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(near(nest.byMaterial.get('t').allocStockLengthFt, nest.groups[0].buyLengthFt, 1e-6)).toBe(true);
  });
  it(`suspends above ${MAX_NEST_PIECES} pieces instead of freezing`, () => {
    const nest = computeProjectNest(
      [{ id: 1, itemNumber: '1', materials: [mkMat('u', 'W18x35', MAX_NEST_PIECES + 1, 8, 35)] }], 0, 0);
    expect(nest.tooManyPieces).toBe(MAX_NEST_PIECES + 1);
    expect(nest.groups).toHaveLength(0);
    expect(nest.byMaterial.size).toBe(0);
  });
});

describe('cut ticket compression', () => {
  it('identical sticks collapse into one row × N', () => {
    const nest = computeProjectNest(
      [{ id: 1, itemNumber: '1', materials: [mkMat('v', 'W16x26', 4, 32, 26)] }], 0, 0);
    const rows = compressGroupSticks(nest.groups[0]);
    expect(rows).toEqual([
      { stockLength: 35, parts: [{ len: 32, itemNo: '1', n: 1 }], usedFt: 32, count: 4 },
    ]);
  });
});

describe('golden snapshot: mixed multi-item nest', () => {
  it('freezes groups and allocations', () => {
    const mix = [
      { id: 1, itemNumber: '1', materials: [mkMat('m1', 'W16x26', 4, 28.08, 26), mkMat('m2', 'C15x33.9', 3, 17.67, 33.9, 'Channel')] },
      { id: 2, itemNumber: '2', materials: [mkMat('m3', 'W16x26', 6, 9.5, 26), mkMat('m4', 'C15x33.9', 2, 11.42, 33.9, 'Channel')] },
    ];
    const nest = computeProjectNest(mix, 0.25 / 12, 2 / 12);
    const shape = nest.groups.map(g => ({
      size: g.size,
      buy: +g.buyLengthFt.toFixed(4),
      net: +g.netLengthFt.toFixed(4),
      yield: +g.yield.toFixed(6),
      sticks: g.sticks.map(s => ({ len: s.stockLength, cuts: s.cuts.map(c => `${c.length}@${c.itemNumber}`) })),
    }));
    const allocs = [...nest.byMaterial.entries()].map(([id2, a]) => ({
      id: id2, yield: +a.yield.toFixed(6), alloc: +a.allocStockLengthFt.toFixed(4),
    }));
    expect({ shape, allocs }).toMatchSnapshot();
  });
});
