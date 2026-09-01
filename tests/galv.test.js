// Galvanizing assembly rules: one dipped assembly, one line, one rate.

import { describe, it, expect } from 'vitest';
import { galvLineQty, normalizeGalvLines, isCoveredByParent, projectGalvTotal, GALV_MINIMUM_CHARGE } from '../lib/estimating/galv.js';
import { recomputeEstimate } from '../lib/estimating/recompute.js';
import { DEFAULT_PRICING_RATES } from '../lib/estimating/rates.js';

const beam = (over = {}) => ({
  id: 1, parentMaterialId: null, category: 'W Shape', size: 'W12x26', shape: 'W12x26',
  description: 'BEAM', pieces: 2, length: 20, weightPerFoot: 26, fabWeight: 1040,
  priceBy: 'LB', unitPrice: 0, galvanized: true, galvRate: 0.35, fabrication: [], ...over,
});
const clip = (over = {}) => ({
  id: 2, parentMaterialId: 1, category: 'Angle', size: 'L3x3x1/4', shape: 'L3x3x1/4',
  description: 'CLIP', pieces: 4, length: 0.75, weightPerFoot: 4.9, fabWeight: 14.7,
  priceBy: 'LB', unitPrice: 0, galvanized: true, galvRate: 0, fabrication: [], ...over,
});

describe('galvLineQty', () => {
  it('parent assembly = own weight + galvanized children', () => {
    expect(galvLineQty(beam(), [beam(), clip()])).toBeCloseTo(1054.7, 5);
  });
  it('non-galvanized children stay out', () => {
    expect(galvLineQty(beam(), [beam(), clip({ galvanized: false })])).toBe(1040);
  });
  it('galvanized connection weights fold in (parent and covered child)', () => {
    const b = beam({ fabrication: [{ id: 10, operation: 'WF Connx', quantity: 2, unit: 'EA', galvanized: true, galvWeight: 28 }] });
    const c = clip({ fabrication: [{ id: 11, operation: 'C Connx', quantity: 1, unit: 'EA', galvanized: true, galvWeight: 13 }] });
    expect(galvLineQty(b, [b, c])).toBeCloseTo(1040 + 28 + 14.7 + 13, 5);
  });
  it('child dipping alone carries its own weight + its conn galv', () => {
    const c = clip({ fabrication: [{ id: 11, operation: 'C Connx', quantity: 1, unit: 'EA', galvanized: true, galvWeight: 13 }] });
    expect(galvLineQty(c, [beam({ galvanized: false }), c])).toBeCloseTo(27.7, 5);
  });
});

describe('normalizeGalvLines', () => {
  it('creates the parent assembly line and strips the covered child line', () => {
    const childWithLine = clip({ fabrication: [
      { id: 'autogalv-2', operation: 'Galvanizing', quantity: 14.7, unit: 'LB', unitPrice: 0.5, totalCost: 7.35, isAutoGalv: true },
    ]});
    const out = normalizeGalvLines([beam(), childWithLine]);
    const parentGalv = out[0].fabrication.filter(f => f.isAutoGalv);
    expect(parentGalv).toHaveLength(1);
    expect(parentGalv[0].quantity).toBeCloseTo(1054.7, 5);
    expect(parentGalv[0].unitPrice).toBe(0.35);            // seeded from galvRate
    expect(parentGalv[0].description).toContain('+ attachments');
    expect(out[1].fabrication.filter(f => f.isAutoGalv)).toHaveLength(0); // covered
  });
  it('keeps an existing line rate and just resyncs quantity', () => {
    const b = beam({ fabrication: [
      { id: 'autogalv-1', operation: 'Galvanizing', quantity: 999, unit: 'LB', unitPrice: 0.42, totalCost: 0, isAutoGalv: true, description: 'x' },
    ]});
    const out = normalizeGalvLines([b, clip()]);
    const line = out[0].fabrication.find(f => f.isAutoGalv);
    expect(line.unitPrice).toBe(0.42);
    expect(line.quantity).toBeCloseTo(1054.7, 5);
    expect(line.totalCost).toBeCloseTo(1054.7 * 0.42, 2);
  });
  it('un-galvanized parent: galvanized child keeps its own line', () => {
    const out = normalizeGalvLines([beam({ galvanized: false }), clip()]);
    expect(out[0].fabrication.filter(f => f.isAutoGalv)).toHaveLength(0);
    const childLine = out[1].fabrication.find(f => f.isAutoGalv);
    expect(childLine.quantity).toBeCloseTo(14.7, 5);
  });
  it('conn-galv lines fold away on galvanized materials, stay on plain ones', () => {
    const galvMat = beam({ fabrication: [
      { id: 10, operation: 'WF Connx', quantity: 2, unit: 'EA', galvanized: true, galvWeight: 28 },
      { id: 'galv-10', operation: 'Galvanizing', quantity: 28, unit: 'LB', unitPrice: 0, totalCost: 0, isConnGalv: true, parentFabId: 10 },
    ]});
    const outGalv = normalizeGalvLines([galvMat]);
    expect(outGalv[0].fabrication.filter(f => f.isConnGalv)).toHaveLength(0);
    expect(outGalv[0].fabrication.find(f => f.isAutoGalv).quantity).toBeCloseTo(1068, 5);

    const plainMat = beam({ galvanized: false, fabrication: [
      { id: 10, operation: 'WF Connx', quantity: 2, unit: 'EA', galvanized: true, galvWeight: 28 },
    ]});
    const outPlain = normalizeGalvLines([plainMat]);
    const connLine = outPlain[0].fabrication.find(f => f.isConnGalv);
    expect(connLine.quantity).toBe(28);
    expect(connLine.parentFabId).toBe(10);
  });
  it('isCoveredByParent respects both flags', () => {
    expect(isCoveredByParent(clip(), [beam(), clip()])).toBe(true);
    expect(isCoveredByParent(clip(), [beam({ galvanized: false }), clip()])).toBe(false);
    expect(isCoveredByParent(clip({ galvanized: false }), [beam(), clip({ galvanized: false })])).toBe(false);
  });
});

describe('recomputeEstimate galv assembly quantities', () => {
  it('server recompute prices the parent line at assembly weight', () => {
    const project = {
      items: [{
        id: 1, materialMarkup: 0, fabMarkup: 0, recapCosts: {}, laborGroups: [], fabrication: [],
        materials: [
          beam({ fabrication: [
            { id: 'autogalv-1', operation: 'Galvanizing', quantity: 1, unit: 'LB', unitPrice: 0.4, totalCost: 0, isAutoGalv: true },
          ]}),
          clip(),
        ],
      }],
      adjustments: [], taxCategory: null,
    };
    const { items } = recomputeEstimate(project, DEFAULT_PRICING_RATES);
    const line = items[0].materials[0].fabrication.find(f => f.isAutoGalv);
    const expectedQty = items[0].materials[0].fabWeight + items[0].materials[1].fabWeight;
    expect(line.quantity).toBeCloseTo(expectedQty, 5);
    expect(line.totalCost).toBeCloseTo(expectedQty * 0.4, 2);
  });
});

describe('projectGalvTotal + minimum', () => {
  it('sums every galv line flavor', () => {
    const items = [{ materials: [
      { fabrication: [{ isAutoGalv: true, totalCost: 120 }, { operation: 'Cut- Straight', totalCost: 50 }] },
      { fabrication: [{ isConnGalv: true, totalCost: 30 }] },
    ]}];
    expect(projectGalvTotal(items)).toBe(150);
    expect(GALV_MINIMUM_CHARGE).toBe(300);
  });
});
