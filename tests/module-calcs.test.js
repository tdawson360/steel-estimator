// Characterization: module-scope calculation primitives.
// These freeze CURRENT behavior — including oddities — see tests/FINDINGS.md.

import { describe, it, expect } from 'vitest';
import { componentModuleEnv } from './helpers/extract.js';

const env = componentModuleEnv();

describe('roundCustom (≤0.29 floors, >0.29 ceils)', () => {
  it('applies the 0.29 rule', () => {
    expect(env.roundCustom(10.29)).toBe(10);
    expect(env.roundCustom(10.291)).toBe(11);
    expect(env.roundCustom(10.3)).toBe(11);
    expect(env.roundCustom(10.0)).toBe(10);
    expect(env.roundCustom(0.29)).toBe(0);
    expect(env.roundCustom(0.3)).toBe(1);
  });
  it('handles null/undefined/NaN as 0', () => {
    expect(env.roundCustom(null)).toBe(0);
    expect(env.roundCustom(undefined)).toBe(0);
    expect(env.roundCustom(NaN)).toBe(0);
  });
  it('FINDING #7: negative values round toward zero asymmetrically', () => {
    // decimal for -1.5 computes as 0.5 (>0.29) → Math.ceil(-1.5) = -1
    expect(env.roundCustom(-1.5)).toBe(-1);
    // decimal for -1.8 computes as 0.2 (≤0.29) → Math.floor(-1.8) = -2
    expect(env.roundCustom(-1.8)).toBe(-2);
  });
});

describe('formatting on top of roundCustom', () => {
  it('fmtPrice / fmtWt round to whole units', () => {
    expect(env.fmtPrice(1234.29)).toBe('$1,234');
    expect(env.fmtPrice(1234.30)).toBe('$1,235');
    expect(env.fmtWt(999.291)).toBe('1,000');
  });
  it('fmtRate keeps 2 decimals without custom rounding', () => {
    expect(env.fmtRate(1.069)).toBe('$1.07');
    expect(env.fmtRate(null)).toBe('$0.00');
  });
  it('fmtQuotePrice custom-rounds then shows 2 decimals', () => {
    expect(env.fmtQuotePrice(1234.29)).toBe('$1,234.00');
    expect(env.fmtQuotePrice(1234.31)).toBe('$1,235.00');
  });
});

describe('calcPlateWeightPerFoot', () => {
  it('computes steel plate lb/ft as t × w × 0.2836 lb/in³ × 12', () => {
    expect(env.calcPlateWeightPerFoot(0.5, 6)).toBeCloseTo(10.2096, 6);
    expect(env.calcPlateWeightPerFoot(0.25, 8)).toBeCloseTo(6.8064, 6);
    expect(env.calcPlateWeightPerFoot(1, 12)).toBeCloseTo(40.8384, 6);
  });
  it('snapshot across the gauge table', () => {
    const out = env.plateThicknesses.map(t => ({
      label: t.label,
      wpfAt6in: +env.calcPlateWeightPerFoot(t.value, 6).toFixed(6),
    }));
    expect(out).toMatchSnapshot();
  });
});

describe('AISC steelDatabase weights (spot checks)', () => {
  it('W / C / MC / HSS / L / PIPE weights', () => {
    expect(env.steelDatabase['W12x26']).toEqual({ weight: 26, category: 'W Shape' });
    expect(env.steelDatabase['W18x35'].weight).toBe(35);
    expect(env.steelDatabase['C15x33.9'].weight).toBe(33.9);
    expect(env.steelDatabase['MC18x42.7']).toEqual({ weight: 42.7, category: 'MC Channel' });
    expect(env.steelDatabase['L3x3x1/4'].weight).toBeCloseTo(4.9, 1);
    expect(env.steelDatabase['PIPE 4 STD'].weight).toBeCloseTo(10.79, 2);
  });
  it('MC catalog is the complete AISC v16 set (40 shapes)', () => {
    const mc = Object.keys(env.steelDatabase).filter(k => k.startsWith('MC'));
    expect(mc.length).toBe(40);
  });
});

describe('stock length tables', () => {
  it('per-category lengths', () => {
    expect(env.getStockLengthsForCategory('W Shape')).toEqual([20, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(env.getStockLengthsForCategory('Pipe')).toEqual([21, 42]);
    expect(env.getStockLengthsForCategory('Angle')).toEqual([20, 40]);
    expect(env.getStockLengthsForCategory('HSS Square')).toEqual([20, 24, 40, 48]);
    expect(env.getStockLengthsForCategory('Plate')).toEqual([4, 8, 10, 12, 20]);
    expect(env.getStockLengthsForCategory('Round Bar')).toEqual([12, 20]);
  });
});

describe('calculateOptimalStock', () => {
  const std = env.getStockLengthsForCategory('W Shape');
  it('picks least waste, shorter stick on ties', () => {
    // 3 × 8' → 25' stick holds 3 with 1' waste (beats 24' not offered; 20' holds 2)
    expect(env.calculateOptimalStock(3, 8, std)).toEqual({
      optimalLength: 25, stocksRequired: 1, waste: 1, efficiency: 96, piecesPerStock: 3,
    });
    // exact fit: 2 × 10 → 20' stick, zero waste, 100%
    expect(env.calculateOptimalStock(2, 10, std)).toMatchObject({
      optimalLength: 20, stocksRequired: 1, waste: 0, efficiency: 100,
    });
  });
  it('single long piece takes exact-length match when available', () => {
    expect(env.calculateOptimalStock(1, 40, std)).toMatchObject({ optimalLength: 40, stocksRequired: 1, waste: 0 });
  });
  it('zero pieces/length → zero stocks at first available length', () => {
    expect(env.calculateOptimalStock(0, 10, std)).toEqual({ optimalLength: 20, stocksRequired: 0, waste: 0, efficiency: 0 });
  });
  it('FINDING #6: piece longer than every stock returns waste=Infinity and stocksRequired=pieces', () => {
    expect(env.calculateOptimalStock(1, 62, std)).toEqual({
      optimalLength: 20, stocksRequired: 1, waste: Infinity, efficiency: 0, piecesPerStock: 1,
    });
  });
});

describe('sequence letters (bijective base-26)', () => {
  it('parents: A…Z, AA…, letters only', () => {
    expect([1, 26, 27, 28, 52, 53, 702, 703].map(env.toAlphaSeq))
      .toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    for (let i = 1; i <= 500; i++) {
      expect(env.parseAlphaSeq(env.toAlphaSeq(i))).toBe(i);
    }
  });
  it('children: lowercase suffix, distinct from parent letters', () => {
    expect([1, 26, 27].map(env.toChildAlphaSuffix)).toEqual(['a', 'z', 'aa']);
    expect(env.toAlphaSeq(27)).not.toBe('A' + env.toChildAlphaSuffix(1));
  });
});

describe('getConnectionWeight (fallback maps)', () => {
  it('W-shape and MC lookups by uppercase key', () => {
    expect(env.getConnectionWeight('MC18x42.7', 'MC Channel')).toBe(23);
    expect(env.getConnectionWeight('W12x26', 'W Shape')).toBe(env.wfConnectionWeights['W12X26']);
  });
  it('unknown size or category → 0', () => {
    expect(env.getConnectionWeight('HSS4x4x1/4', 'HSS Square')).toBe(0);
    expect(env.getConnectionWeight('', 'W Shape')).toBe(0);
  });
  it('snapshot of both weight maps', () => {
    expect({ wf: env.wfConnectionWeights, c: env.cConnectionWeights }).toMatchSnapshot();
  });
});

describe('legacy Revu import (parseRevuCSV + aggregateImportData)', () => {
  const csv = [
    'Item #,Item Description,Qty,(Non-Flat) Mat Size,Page Label,Part Label,Fab Length',
    '4,CANOPY SUPPORT FRAMING,1,W 8 x 21,S-100,COLUMN,24.75',
    '4,CANOPY SUPPORT FRAMING,1,HSS 4 x 4 x 1/4,A-102,HORIZ,3.58',
    '4,CANOPY SUPPORT FRAMING,2,HSS 4 x 4 x 1/4,A-102,HORIZ,3.58',
    '3,PARAPET SUPPORT POSTS,1,HSS 6 x 2 x 3/8,A-102,POST,3.17',
    '3,PARAPET SUPPORT POSTS,,BAD ROW NO LENGTH,A-102,POST,',
  ].join('\n');

  it('rows parse with 1-inch length tolerance (2-dec ft) and skip lengthless rows', () => {
    const { rows, error } = env.parseRevuCSV(csv);
    expect(error).toBeNull();
    expect(rows).toHaveLength(4);
    expect(rows[0].fabLength).toBe(24.75);
    expect(rows[1].fabLength).toBe(3.58);
  });

  it('aggregates qty by item + size + length, sorts items numerically', () => {
    const { rows } = env.parseRevuCSV(csv);
    const { items, unmatchedSizes } = env.aggregateImportData(rows);
    expect(items.map(i => i.itemNumber)).toEqual(['3', '4']);
    const item4 = items.find(i => i.itemNumber === '4');
    const hss = item4.materials.find(m => m.size === 'HSS4x4x1/4');
    expect(hss.pieces).toBe(3); // 1 + 2 summed
    expect(unmatchedSizes).toEqual([]);
  });

  it('unmatched sizes surface with row locations', () => {
    const bad = [
      'Item #,Item Description,Qty,Mat Size,Page Label,Part Label,Fab Length',
      '1,FRAMING,1,WEIRD 9 x 9,S-1,BEAM,10',
    ].join('\n');
    const { rows } = env.parseRevuCSV(bad);
    const { unmatchedSizes } = env.aggregateImportData(rows);
    expect(unmatchedSizes).toHaveLength(1);
    expect(unmatchedSizes[0].size).toBe('WEIRD 9 x 9'); // original text preserved for the banner
  });
});

describe('translateSizeToAISC (drives weight lookups on import)', () => {
  const cases = [
    'W 18 x 35', 'W18x35 (A992)', 'MC 18 x 42.7', 'MC12x10.6 GALV', 'MC 12 x 10.6#',
    'HSS 4 x 4 x 1/4', 'HSS8x2x11ga', 'L 3 x 3 x 1/4', 'C 10 x 15.3',
    'PL 3/8 x 6', 'PIPE 4', 'PIPE 1-1/2', 'PIPE 3 XS',
    'C 12 x 10.6', 'M 12 x 10.6', 'BENT PL 10GA', 'W 18 x 999',
  ];
  it('matrix snapshot', () => {
    const out = cases.map(c => {
      const r = env.translateSizeToAISC(env.normalizeShapeSize(c));
      return `${c} -> ${r.matched ? `${r.size} [${r.category}]` : `CUSTOM(${r.size})`}`;
    });
    expect(out).toMatchSnapshot();
  });
  it('mojibake and unicode × normalize', () => {
    expect(env.normalizeShapeSize('MC 12 × 10.6')).toBe('MC 12 x 10.6');
  });
});
