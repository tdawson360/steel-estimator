// DB → engine input mapping (lib/estimating/load-fields.js): plate dims,
// typed custom weight, and galv-line identity must survive a reload.
// Before these existed, plates and Custom lines reloaded at 0 lb / $0 and
// connection-galv lines came back as assembly lines, were dropped by
// normalizeGalvLines, and were recreated at a $0 rate (mismatch.log 2026-09-01).

import { describe, it, expect } from 'vitest';
import { materialCalcInputsFromDb, galvLineFieldsFromDb, parsePlateSize } from '../lib/estimating/load-fields.js';
import { calculateMaterial } from '../lib/estimating/material-calc.js';
import { normalizeGalvLines } from '../lib/estimating/galv.js';
import { reconcileItems } from '../lib/estimating/reconcile.js';

describe('materialCalcInputsFromDb', () => {
  it('maps DB thickness/width to the plate calculator inputs', () => {
    const inputs = materialCalcInputsFromDb({ category: 'Plate', thickness: 0.5, width: 6, weightPerFt: 10.2 });
    expect(inputs).toEqual({ plateThickness: 0.5, plateWidth: 6, customWeight: null });
    const calc = calculateMaterial({ category: 'Plate', size: '', pieces: 2, length: 10, priceBy: 'LB', unitPrice: 1, ...inputs });
    expect(calc.weightPerFoot).toBeCloseTo(10.21, 1);   // 0.5 × 6 × 490/144
    expect(calc.fabWeight).toBeCloseTo(204.2, 0);
  });

  it('recovers a legacy plate (null dims) from its own size string', () => {
    expect(parsePlateSize('PL 1/2" × 6"')).toEqual({ thickness: 0.5, width: 6 });
    expect(parsePlateSize('PL 10 ga × 12"')).toEqual({ thickness: 0.135, width: 12 });
    expect(parsePlateSize('W12x26')).toBeNull();
    const inputs = materialCalcInputsFromDb({ category: 'Plate', thickness: null, width: null, shape: 'PL 1/2" × 6"' });
    expect(inputs.plateThickness).toBe(0.5);
    expect(inputs.plateWidth).toBe(6);
  });

  it('the size string beats stale importer columns (San Esteban rows: cols 1/2×6, size 1/2×9)', () => {
    const inputs = materialCalcInputsFromDb({ category: 'Plate', thickness: 0.5, width: 6, shape: 'PL 1/2" × 9"' });
    expect(inputs).toMatchObject({ plateThickness: 0.5, plateWidth: 9 });
    // Columns only matter when the size string is not the calculator's format
    expect(materialCalcInputsFromDb({ category: 'Plate', thickness: 0.25, width: 4, shape: 'Gusset' }))
      .toMatchObject({ plateThickness: 0.25, plateWidth: 4 });
  });

  it('maps weightPerFt back to customWeight for Custom/Hardware only', () => {
    expect(materialCalcInputsFromDb({ category: 'Custom', weightPerFt: 500 }).customWeight).toBe(500);
    expect(materialCalcInputsFromDb({ category: 'Hardware', weightPerFt: 0 }).customWeight).toBe(0);
    expect(materialCalcInputsFromDb({ category: 'W Shape', weightPerFt: 26 }).customWeight).toBeNull();
    const calc = calculateMaterial({ category: 'Custom', size: 'BENT PL 10GA', pieces: 1, length: 1, priceBy: 'LB', unitPrice: 0.9, customWeight: 500 });
    expect(calc.fabWeight).toBe(500);
  });
});

describe('galvLineFieldsFromDb', () => {
  const connOp = { id: 7, operation: 'WF Bolted', galvanized: true, galvWeight: 40, isGalvLine: false, galvKind: null };

  it('auto line: isAutoGalv with the owner description', () => {
    const f = { id: 8, isGalvLine: true, galvKind: 'auto', quantity: 100 };
    expect(galvLineFieldsFromDb(f, { galvanized: true, description: 'W12x26' }, [f]))
      .toEqual({ isAutoGalv: true, description: 'Galv - W12x26', multiplyByPieces: false, galvClass: null });
    expect(galvLineFieldsFromDb({ ...f, galvClass: 'KDS' }, { galvanized: true, description: 'W12x26' }, [f]).galvClass).toBe('KDS');
  });

  it('conn line: isConnGalv, parentFabId, parent op name', () => {
    const f = { id: 9, isGalvLine: true, galvKind: 'conn', parentFabId: 7, quantity: 40 };
    expect(galvLineFieldsFromDb(f, { galvanized: false }, [connOp, f]))
      .toEqual({ isConnGalv: true, parentFabId: 7, description: 'Galv - WF Bolted' });
  });

  it('ordinary ops get no galv fields', () => {
    expect(galvLineFieldsFromDb(connOp, { galvanized: false }, [connOp])).toEqual({});
  });

  it('legacy rows (no galvKind): galvanized member → auto, otherwise conn matched by galv weight', () => {
    const legacyAuto = { id: 3, isGalvLine: true, galvKind: null, quantity: 500 };
    expect(galvLineFieldsFromDb(legacyAuto, { galvanized: true, shape: 'W8x10' }, [legacyAuto]).isAutoGalv).toBe(true);

    const op2 = { id: 11, operation: 'C Welded', galvanized: true, galvWeight: 40, isGalvLine: false, galvKind: null };
    const l1 = { id: 20, isGalvLine: true, galvKind: null, parentFabId: null, quantity: 40 };
    const l2 = { id: 21, isGalvLine: true, galvKind: null, parentFabId: null, quantity: 40 };
    const sibs = [connOp, op2, l1, l2];
    expect(galvLineFieldsFromDb(l1, { galvanized: false }, sibs)).toMatchObject({ isConnGalv: true, parentFabId: 7 });
    expect(galvLineFieldsFromDb(l2, { galvanized: false }, sibs)).toMatchObject({ isConnGalv: true, parentFabId: 11 });
  });

  it('a loaded conn line survives normalizeGalvLines with its rate', () => {
    const raw = { id: 9, operation: 'Galvanizing', unit: 'LB', quantity: 40, unitPrice: 0.55, totalCost: 22, isGalvLine: true, galvKind: 'conn', parentFabId: 7 };
    const mat = {
      id: 1, galvanized: false, fabWeight: 100,
      fabrication: [{ ...connOp }, { ...raw, ...galvLineFieldsFromDb(raw, { galvanized: false }, [connOp, raw]) }],
    };
    const [out] = normalizeGalvLines([mat]);
    const lines = out.fabrication.filter(x => x.isConnGalv);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: 9, quantity: 40, unitPrice: 0.55, totalCost: 22 });
  });
});

describe('reconcileItems keeps conn-galv parent links across a save', () => {
  it('remaps parentFabId from the op temp id to its DB id', () => {
    const items = [{
      id: 1, laborGroups: [], fabrication: [], snapshots: [], recapCosts: {},
      materials: [{ id: 1, fabrication: [
        { id: 'tmp-op', operation: 'WF Bolted', quantity: 1, totalCost: 10 },
        { id: 'galv-tmp-op', operation: 'Galvanizing', quantity: 40, totalCost: 22, isConnGalv: true, parentFabId: 'tmp-op' },
      ] }],
    }];
    const saved = [{
      id: 1, laborGroups: [], fabrication: [], snapshots: [], recapCosts: [],
      materials: [{ id: 1, totalCost: 0, stockWeight: 0, fabWeight: 0, fabrication: [
        { id: 501, quantity: 1, totalCost: 10 },
        { id: 502, quantity: 40, totalCost: 22 },
      ] }],
    }];
    const [out] = reconcileItems(items, saved);
    expect(out.materials[0].fabrication[0].id).toBe(501);
    expect(out.materials[0].fabrication[1]).toMatchObject({ id: 502, parentFabId: 501 });
  });
});
