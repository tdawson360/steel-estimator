// Galvanizer rate classes (lib/estimating/galv-classes.js) and their wiring:
// default class per assembly, class-seeded rates on new galv lines,
// class-keyed galv labor groups, and the server recompute honouring a galv
// group's rate. Sheet: docs/galv-rate-sheet.pdf (AZZ Houston, eff. 10/01/2025).

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GALV_CLASSES, defaultGalvClassCode, galvClassRatePerLb, galvClassLabel,
} from '../lib/estimating/galv-classes.js';
import { normalizeGalvLines } from '../lib/estimating/galv.js';
import {
  isGroupableFab, fabGroupKey, joinGalvGroups, groupAnchors, splitGroupsBySize, buildAutoGroups, applyGroupRates,
} from '../lib/estimating/labor-groups.js';
import { recomputeEstimate } from '../lib/estimating/recompute.js';
import { DEFAULT_PRICING_RATES } from '../lib/estimating/rates.js';
import { mat, fab, item, id } from './helpers/fixtures.js';

describe('defaultGalvClassCode', () => {
  it('structural shapes → KDS', () => {
    expect(defaultGalvClassCode({ category: 'W Shape', size: 'W12x26' }, 800)).toBe('KDS');
    expect(defaultGalvClassCode({ category: 'Channel', size: 'C6x8.2' }, 100)).toBe('KDS');
    expect(defaultGalvClassCode({ category: 'Angle', size: 'L3x3x1/4' }, 40)).toBe('KDS');
  });
  it('under 20 lb dipped → MLT regardless of shape', () => {
    expect(defaultGalvClassCode({ category: 'W Shape', size: 'W12x26' }, 19)).toBe('MLT');
    expect(defaultGalvClassCode({ category: 'Plate', size: 'PL 1/4" × 4"' }, 12)).toBe('MLT');
    expect(defaultGalvClassCode({ category: 'W Shape', size: 'W12x26' }, 20)).toBe('KDS');
  });
  it('pipe tiers by nominal diameter', () => {
    expect(defaultGalvClassCode({ category: 'Pipe', size: 'PIPE 2 STD' }, 50)).toBe('FPIP1');
    expect(defaultGalvClassCode({ category: 'Pipe', size: 'PIPE 3 STD' }, 50)).toBe('FPIP2');
    expect(defaultGalvClassCode({ category: 'Pipe', size: 'PIPE 12 STD' }, 500)).toBe('FPIP5');
    expect(defaultGalvClassCode({ category: 'Pipe', size: 'PIPE 16 STD' }, 900)).toBe('MSC'); // off the sheet
  });
  it('tube tiers by largest side (wall ignored)', () => {
    expect(defaultGalvClassCode({ category: 'HSS Square', size: 'HSS3x3x1/4' }, 60)).toBe('FTUB1');
    expect(defaultGalvClassCode({ category: 'HSS Rect', size: 'HSS 6x4x1/4' }, 200)).toBe('FTUB2');
    expect(defaultGalvClassCode({ category: 'HSS Rect', size: 'HSS10x6x3/8' }, 600)).toBe('FTUB3');
    expect(defaultGalvClassCode({ category: 'HSS Round', size: 'HSS4.5x0.237' }, 100)).toBe('FTUB2');
    expect(defaultGalvClassCode({ category: 'HSS Square', size: 'HSS12x12x1/2' }, 900)).toBe('MSC');
  });
  it('plate, bar, custom, hardware → MSC', () => {
    expect(defaultGalvClassCode({ category: 'Plate', size: 'PL 1/2" × 12"' }, 400)).toBe('MSC');
    expect(defaultGalvClassCode({ category: 'Round Bar', size: 'RD 3/4' }, 60)).toBe('MSC');
    expect(defaultGalvClassCode({ category: 'Custom', size: 'BENT PL' }, 500)).toBe('MSC');
  });
});

describe('class rates', () => {
  it('rate per lb is $/cwt ÷ 100; unknown class → null', () => {
    expect(galvClassRatePerLb(DEFAULT_GALV_CLASSES, 'KDS')).toBe(0.27);
    expect(galvClassRatePerLb(DEFAULT_GALV_CLASSES, 'MLT')).toBe(0.65);
    expect(galvClassRatePerLb(DEFAULT_GALV_CLASSES, 'NOPE')).toBeNull();
    expect(galvClassRatePerLb(null, 'KDS')).toBeNull();
    expect(galvClassLabel(DEFAULT_GALV_CLASSES, 'FTUB2')).toBe('Fabricated Tube < 8"');
  });
});

describe('normalizeGalvLines with classes', () => {
  it('a new assembly line gets the default class and the class rate', () => {
    const beam = mat({ size: 'W12x26', category: 'W Shape', pieces: 2, length: 20, galvanized: true });
    const [out] = normalizeGalvLines([beam], { galvClasses: DEFAULT_GALV_CLASSES });
    const line = out.fabrication.find(f => f.isAutoGalv);
    expect(line.galvClass).toBe('KDS');
    expect(line.unitPrice).toBe(0.27);
    expect(line.totalCost).toBeCloseTo(line.quantity * 0.27, 6);
  });
  it('without classes the rate falls back to galvRate; the class is still assigned', () => {
    const beam = mat({ size: 'W12x26', category: 'W Shape', pieces: 1, length: 10, galvanized: true, galvRate: 0.31 });
    const [out] = normalizeGalvLines([beam]);
    const line = out.fabrication.find(f => f.isAutoGalv);
    expect(line.unitPrice).toBe(0.31);
    expect(line.galvClass).toBe('KDS');
  });
  it('an existing line keeps its class and rate when its weight changes', () => {
    const beam = mat({ size: 'W12x26', category: 'W Shape', pieces: 1, length: 10, galvanized: true });
    const [first] = normalizeGalvLines([beam], { galvClasses: DEFAULT_GALV_CLASSES });
    const line = first.fabrication.find(f => f.isAutoGalv);
    const reclassed = { ...first, fabrication: first.fabrication.map(f => f === line ? { ...f, galvClass: 'MSC', unitPrice: 0.5 } : f) };
    const heavier = { ...reclassed, fabWeight: reclassed.fabWeight * 2 };
    const [out] = normalizeGalvLines([heavier], { galvClasses: DEFAULT_GALV_CLASSES });
    const l2 = out.fabrication.find(f => f.isAutoGalv);
    expect(l2.galvClass).toBe('MSC');
    expect(l2.unitPrice).toBe(0.5);
    expect(l2.quantity).toBe(heavier.fabWeight);
  });
});

function galvItem() {
  const a = mat({ size: 'W12x26', category: 'W Shape', pieces: 2, length: 20, galvanized: true });
  const b = mat({ size: 'L3x3x1/4', category: 'Angle', pieces: 4, length: 8, galvanized: true });
  const c = mat({ size: 'HSS4x4x1/4', category: 'HSS Square', pieces: 1, length: 12, galvanized: true });
  const materials = normalizeGalvLines([a, b, c], { galvClasses: DEFAULT_GALV_CLASSES });
  return item({ materials, laborGroups: [] });
}

describe('galv labor groups', () => {
  it('assembly galv lines are groupable by class; conn-galv never', () => {
    expect(isGroupableFab({ operation: 'Galvanizing', isAutoGalv: true, galvClass: 'KDS' })).toBe(true);
    expect(isGroupableFab({ operation: 'Galvanizing', isConnGalv: true })).toBe(false);
    expect(fabGroupKey(mat({ size: 'W12x26', category: 'W Shape' }), { isAutoGalv: true, galvClass: 'KDS' })).toBe('KDS|Galvanizing');
    expect(fabGroupKey(mat({ size: 'W12x26', category: 'W Shape' }), { isAutoGalv: true })).toBeNull();
  });

  it('buildAutoGroups puts the W12 and the L3x3 assemblies in one KDS group, the tube apart', () => {
    let seq = 9000;
    const it1 = galvItem();
    const { groups, assignments } = buildAutoGroups(it1.materials, [], { makeId: () => ++seq });
    const kds = groups.find(g => g.familyKey === 'KDS');
    expect(kds).toMatchObject({ operation: 'Galvanizing', unit: 'LB', rate: 0.27, collapsed: true });
    const [a, b, c] = it1.materials;
    expect(assignments.get(a.fabrication.find(f => f.isAutoGalv).id)).toBe(kds.id);
    expect(assignments.get(b.fabrication.find(f => f.isAutoGalv).id)).toBe(kds.id);
    expect(assignments.has(c.fabrication.find(f => f.isAutoGalv).id)).toBe(false); // lone FTUB2
  });

  it('joinGalvGroups attaches an ungrouped line to its class group at the group rate', () => {
    const it1 = galvItem();
    const g = { id: 501, operation: 'Galvanizing', familyKey: 'KDS', unit: 'LB', rate: 0.33, collapsed: true, colorIndex: 0, sortOrder: 0 };
    const out = joinGalvGroups({ ...it1, laborGroups: [g] });
    const [a, b, c] = out.materials;
    expect(a.fabrication.find(f => f.isAutoGalv)).toMatchObject({ laborGroupId: 501, unitPrice: 0.33 });
    expect(b.fabrication.find(f => f.isAutoGalv).laborGroupId).toBe(501);
    expect(c.fabrication.find(f => f.isAutoGalv).laborGroupId).toBeUndefined();
    expect(joinGalvGroups(out)).toBe(out); // identity-preserving
  });

  it('anchors a class group at the last member, not by size', () => {
    const it1 = galvItem();
    const g = { id: 501, operation: 'Galvanizing', familyKey: 'KDS', unit: 'LB', rate: 0.27 };
    const joined = joinGalvGroups({ ...it1, laborGroups: [g] });
    expect(groupAnchors(joined.materials, [g]).get(501)).toBe(joined.materials[1].id); // the L3x3
  });

  it('splitGroupsBySize keys galv members by class, not size', () => {
    const it1 = galvItem();
    const g = { id: 501, operation: 'Galvanizing', familyKey: 'KDS', unit: 'LB', rate: 0.27, collapsed: true, colorIndex: 0, sortOrder: 0 };
    const joined = joinGalvGroups({ ...it1, laborGroups: [g] });
    expect(splitGroupsBySize(joined, { makeId: () => 1 })).toBe(joined); // W12 + L3x3 share KDS → no split
  });

  it('server recompute prices a grouped galv line at the group rate', () => {
    const it1 = galvItem();
    const g = { id: 501, operation: 'Galvanizing', familyKey: 'KDS', unit: 'LB', rate: 0.40, collapsed: true, colorIndex: 0, sortOrder: 0 };
    const joined = applyGroupRates(joinGalvGroups({ ...it1, laborGroups: [g] }));
    // Stale per-row rate sent by a client must lose to the group
    const tampered = { ...joined, materials: joined.materials.map(m => ({
      ...m, fabrication: m.fabrication.map(f => f.laborGroupId === 501 ? { ...f, unitPrice: 999 } : f) })) };
    const re = recomputeEstimate({ items: [tampered], adjustments: [], taxCategory: 'fob' }, DEFAULT_PRICING_RATES);
    const [a] = re.items[0].materials;
    const line = a.fabrication.find(f => f.isAutoGalv);
    expect(line.unitPrice).toBe(0.40);
    expect(line.totalCost).toBeCloseTo(line.quantity * 0.40, 6);
  });
});
