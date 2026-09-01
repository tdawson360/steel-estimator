// Server-side recompute glue shared by the project PUT route and the
// duplicate route. Lives OUTSIDE lib/estimating (it touches Prisma and the
// filesystem); the math itself is lib/estimating/recompute.js.

import fs from 'node:fs';
import path from 'node:path';
import prisma from './db';
import { recomputeEstimate } from './estimating/recompute';
import { resolvePricingRates } from './estimating/rates';
import { steelDatabase } from './estimating/aisc-shapes';

// ── SERVER-AUTHORITATIVE TOTALS ──────────────────────────────────────────────
// On save, totals are recomputed server-side with lib/estimating and the
// SERVER's numbers are persisted. Client-asserted values are compared and any
// disagreement beyond one cent ($0.01) is logged loudly — greppable via the
// [TOTALS-MISMATCH] prefix and appended to mismatch.log — but the save is NOT
// failed during the shakeout period.
export function logTotalsMismatch(projectId, diffs) {
  const entry = {
    at: new Date().toISOString(),
    projectId,
    count: diffs.length,
    diffs,
  };
  console.warn('[TOTALS-MISMATCH]', JSON.stringify(entry));
  try {
    fs.appendFileSync(path.join(process.cwd(), 'mismatch.log'), JSON.stringify(entry) + '\n');
  } catch (e) {
    console.warn('[TOTALS-MISMATCH] failed to write mismatch.log:', e.message);
  }
}

// Map a Prisma project tree (DB column names) to the engine/payload shape.
// This mirrors the client loader in SteelEstimator.jsx exactly — shape→size,
// rate→unitPrice with the derived-rate fallback, isGalvLine→isAutoGalv,
// recapCosts array→object — so recomputing a DB tree (e.g. on duplicate)
// runs the engine over the same inputs the client would see after loading it.
function dbFabToEngine(f, ownerDescription) {
  const derivedRate = f.rate || (f.quantity > 0 && f.totalCost > 0 ? f.totalCost / f.quantity : 0);
  const isGalv = f.isGalvLine || false;
  return {
    id: f.id,
    operation: f.operation || '',
    quantity: f.quantity || 0,
    unit: f.unit || 'ea',
    rate: derivedRate,
    unitPrice: derivedRate,
    totalCost: f.totalCost || 0,
    connWeight: f.connWeight || 0,
    isGalvLine: isGalv,
    length: (typeof f.length === 'number' && isFinite(f.length)) ? f.length : null,
    galvanized: f.galvanized || false,
    galvWeight: (typeof f.galvWeight === 'number' && isFinite(f.galvWeight)) ? f.galvWeight : null,
    applyTo: f.applyTo ?? null,
    laborGroupId: f.laborGroupId ?? null,
    ...(isGalv ? {
      isAutoGalv: true,
      description: f.operation === 'Galvanizing' ? `Galv - ${ownerDescription}` : (f.operation || ''),
      multiplyByPieces: false,
    } : {}),
  };
}

function dbMaterialToEngine(mat) {
  return {
    id: mat.id,
    parentMaterialId: mat.parentMaterialId ?? null,
    category: mat.category || '',
    shape: mat.shape || '',
    size: mat.shape || '',
    description: mat.description || '',
    length: mat.length || 0,
    pieces: mat.pieces || 0,
    stockLength: mat.stockLength || 0,
    stocksRequired: mat.stocksRequired || 0,
    waste: mat.waste || 0,
    weightPerFoot: mat.weightPerFt || (mat.shape && steelDatabase[mat.shape]?.weight) || 0,
    fabWeight: mat.fabWeight || 0,
    stockWeight: mat.stockWeight || 0,
    priceBy: mat.priceBy || 'LB',
    unitPrice: mat.unitPrice || 0,
    pricePerFt: mat.pricePerFt || 0,
    pricePerLb: mat.pricePerLb || 0,
    totalCost: mat.totalCost || 0,
    galvanized: mat.galvanized || false,
    galvRate: mat.galvRate || 0,
    width: mat.width || null,
    thickness: mat.thickness || null,
    fabrication: (mat.fabrication || []).map(f => dbFabToEngine(f, mat.description || mat.shape)),
    // children never enter the totals engine; pass through untouched
    children: mat.children || [],
  };
}

export function dbProjectToEngineTree(project) {
  return {
    items: (project.items || []).map(item => ({
      id: item.id,
      itemNumber: item.itemNumber || '001',
      itemName: item.itemName || 'New Item',
      materialMarkup: item.materialMarkup || 0,
      fabMarkup: item.fabMarkup || 0,
      priceStandalone: item.priceStandalone || false,
      breakoutGroupId: item.breakoutGroupId || null,
      recapCosts: Object.fromEntries((item.recapCosts || []).map(rc => [
        rc.costType,
        { cost: rc.cost || 0, markup: rc.markup || 0, total: rc.total || 0, hours: rc.hours || 0, rate: rc.rate || 0 },
      ])),
      materials: (item.materials || []).map(dbMaterialToEngine),
      laborGroups: (item.laborGroups || []).map(g => ({
        id: g.id,
        operation: g.operation || '',
        familyKey: g.familyKey || '',
        unit: g.unit || 'ea',
        rate: g.rate || 0,
        collapsed: !!g.collapsed,
        colorIndex: g.colorIndex || 0,
        sortOrder: g.sortOrder || 0,
      })),
      fabrication: (item.fabrication || []).map(f => {
        const derivedRate = f.rate || (f.quantity > 0 && f.totalCost > 0 ? f.totalCost / f.quantity : 0);
        return {
          id: f.id,
          operation: f.operation || '',
          quantity: f.quantity || 0,
          unit: f.unit || 'ea',
          rate: derivedRate,
          unitPrice: derivedRate,
          totalCost: f.totalCost || 0,
        };
      }),
    })),
    adjustments: (project.adjustments || []).map(a => ({ id: a.id, description: a.description, amount: a.amount })),
    taxCategory: project.taxCategory ?? null,
    nestingEnabled: project.nestingEnabled ?? false,
    nestKerfIn: project.nestKerfIn ?? 0,
    nestEndCropIn: project.nestEndCropIn ?? 0,
    stockLengthOverrides: project.stockLengthOverrides,
    bidAmount: project.bidAmount,
  };
}

// Recompute a payload-shaped project tree with the same engine + rate
// resolution the client uses (resolvePricingRates over the PricingRates row —
// the table has no taxRate column, so both sides land on the config default).
export async function recomputePayload(data) {
  const pricingRatesRow = await prisma.pricingRates.findUnique({ where: { id: 1 } });
  const rates = resolvePricingRates(pricingRatesRow);
  let overrides = {};
  try {
    overrides = (typeof data.stockLengthOverrides === 'object' && data.stockLengthOverrides !== null)
      ? data.stockLengthOverrides
      : JSON.parse(data.stockLengthOverrides || '{}');
  } catch { overrides = {}; }
  return recomputeEstimate({
    items: data.items || [],
    adjustments: data.adjustments || [],
    taxCategory: data.taxCategory ?? null,
    nestingEnabled: data.nestingEnabled ?? false,
    nestKerfIn: data.nestKerfIn ?? 0,
    nestEndCropIn: data.nestEndCropIn ?? 0,
    stockLengthOverrides: overrides,
  }, rates);
}
