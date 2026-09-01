// Server-authoritative recompute: run the full estimating pipeline over a
// project tree exactly the way the client does, so persisted totals are the
// ENGINE's numbers regardless of what a client asserted.
//
// Pipeline mirror of the component:
//  1. per-material base calc (calculateMaterial with the shared supplier-length
//     resolution), stripping any stale pooled-overlay fields first — the same
//     destructure the client's write-back effect performs
//  2. fabrication line totals (computeFabLineTotal); auto-galv line quantity
//     re-synced to the recomputed fabWeight (client behavior)
//  3. cross-item nesting overlay when enabled (computeProjectNest +
//     pooledLineCost), skipping priceStandalone items
//  4. recap entry totals (recapEntryTotal)
//  5. projectTotals → totals + per-item/per-material breakdowns
//
// Pure: rates and the whole tree arrive as arguments.

import { calculateMaterial } from './material-calc';
import { galvLineQty } from './galv';
import { computeFabLineTotal, pooledLineCost } from './fab-costs';
import { computeProjectNest } from './nesting';
import { availableLengthsForOverrides, lengthCapsForOverrides } from './supplier-lengths';
import { projectTotals, recapEntryTotal } from './totals';

export function recomputeEstimate(project, rates) {
  const {
    items = [],
    adjustments = [],
    taxCategory = null,
    nestingEnabled = false,
    nestKerfIn = 0,
    nestEndCropIn = 0,
    stockLengthOverrides = {},
  } = project;

  const stockLengthsFor = (category, size) =>
    availableLengthsForOverrides(stockLengthOverrides, category, size);
  const capsFor = (category, size) =>
    lengthCapsForOverrides(stockLengthOverrides, category, size);

  // 1 + 2: base material calc and fabrication line totals.
  // Labor groups: a grouped fab row's rate is the GROUP's rate (stamped here
  // before the line total), so the persisted numbers can never drift from the
  // group price even if a client sent stale per-row rates. Pure per-row map —
  // never filters or reorders (index alignment with the PUT depends on it).
  let calcItems = items.map((item) => {
    const groupById = new Map((item.laborGroups || []).map((g) => [g.id, g]));
    // Two passes: base-calc every material first, THEN fab lines — a parent's
    // auto-galv assembly quantity needs its children's recomputed fabWeights.
    const bases = (item.materials || []).map((mat) => {
      const { pooled, nestYield, overLength, shortfall, standaloneStockWeight, ...rest } = mat;
      return calculateMaterial(rest, { stockLengthsFor });
    });
    return {
    ...item,
    materials: bases.map((base) => {
      const fabrication = (base.fabrication || []).map((f) => {
        if (f.isAutoGalv) {
          // Assembly rule: a galvanized parent's line carries its own weight
          // plus galvanized children and galvanized connection weights.
          const quantity = galvLineQty(base, bases);
          return { ...f, quantity, totalCost: quantity * (f.unitPrice || 0) };
        }
        const g = f.laborGroupId != null ? groupById.get(f.laborGroupId) : null;
        const eff = g ? { ...f, unitPrice: g.rate || 0, rate: g.rate || 0 } : f;
        return { ...eff, totalCost: computeFabLineTotal(eff) };
      });
      return { ...base, fabrication };
    }),
    // 4: recap entry totals per the single rule
    recapCosts: Object.fromEntries(
      Object.entries(item.recapCosts || {}).map(([costType, entry]) => [
        costType,
        { ...entry, total: recapEntryTotal(costType, entry || {}) },
      ])
    ),
    // item-level fabrication: qty × rate (updateFabrication rule)
    fabrication: (item.fabrication || []).map((f) => ({
      ...f,
      totalCost: (f.quantity || 0) * (f.unitPrice || 0),
    })),
    };
  });

  // 3: nesting overlay (mirrors the component's write-back effect)
  if (nestingEnabled) {
    const kerfFt = (parseFloat(nestKerfIn) || 0) / 12;
    const endCropFt = (parseFloat(nestEndCropIn) || 0) / 12;
    const nest = computeProjectNest(calcItems, kerfFt, endCropFt, stockLengthsFor, capsFor);
    calcItems = calcItems.map((item) => ({
      ...item,
      materials: item.materials.map((mat) => {
        const alloc = !item.priceStandalone ? nest.byMaterial.get(mat.id) : null;
        if (!alloc) return mat;
        const { stockWeight, totalCost } = pooledLineCost(mat, alloc);
        return {
          ...mat,
          pooled: true,
          nestYield: alloc.yield,
          overLength: alloc.overLength,
          shortfall: alloc.shortfall,
          standaloneStockWeight: mat.stockWeight,
          stockWeight,
          totalCost,
        };
      }),
    }));
  }

  // 5: totals + line-item breakdowns
  const { totals, items: breakdowns } = projectTotals(calcItems, adjustments, taxCategory, rates);

  return { items: calcItems, totals, breakdowns };
}

// Compare client-asserted values against the recomputed tree.
// Money tolerance: one cent ($0.01). Weight tolerance: 0.01 lb (diagnostic).
// Returns an array of structured diffs (empty = agreement).
export const MONEY_TOLERANCE = 0.01;
export const WEIGHT_TOLERANCE = 0.01;

export function diffAssertedTotals(clientProject, recomputed, clientBidAmount) {
  const diffs = [];
  const moneyOff = (a, b) => Math.abs((a || 0) - (b || 0)) > MONEY_TOLERANCE;
  const weightOff = (a, b) => Math.abs((a || 0) - (b || 0)) > WEIGHT_TOLERANCE;

  (clientProject.items || []).forEach((item, i) => {
    const rItem = recomputed.items[i];
    if (!rItem) return;
    (item.materials || []).forEach((mat, j) => {
      const rMat = rItem.materials[j];
      if (!rMat) return;
      const where = `item ${item.itemNumber} / material ${mat.sequence || mat.id} (${mat.size || mat.description || '?'})`;
      if (moneyOff(mat.totalCost, rMat.totalCost)) {
        diffs.push({ field: 'material.totalCost', where, client: mat.totalCost ?? null, server: rMat.totalCost });
      }
      if (weightOff(mat.stockWeight, rMat.stockWeight)) {
        diffs.push({ field: 'material.stockWeight', where, client: mat.stockWeight ?? null, server: rMat.stockWeight });
      }
      if (weightOff(mat.fabWeight, rMat.fabWeight)) {
        diffs.push({ field: 'material.fabWeight', where, client: mat.fabWeight ?? null, server: rMat.fabWeight });
      }
      (mat.fabrication || []).forEach((f, k) => {
        const rF = rMat.fabrication[k];
        if (rF && moneyOff(f.totalCost, rF.totalCost)) {
          diffs.push({ field: 'materialFab.totalCost', where: `${where} / ${f.operation}`, client: f.totalCost ?? null, server: rF.totalCost });
        }
      });
    });
    (item.fabrication || []).forEach((f, k) => {
      const rF = rItem.fabrication[k];
      if (rF && moneyOff(f.totalCost, rF.totalCost)) {
        diffs.push({ field: 'itemFab.totalCost', where: `item ${item.itemNumber} / ${f.operation}`, client: f.totalCost ?? null, server: rF.totalCost });
      }
    });
    Object.entries(item.recapCosts || {}).forEach(([costType, entry]) => {
      const rEntry = rItem.recapCosts[costType];
      if (rEntry && moneyOff(entry?.total, rEntry.total)) {
        diffs.push({ field: `recap.${costType}.total`, where: `item ${item.itemNumber}`, client: entry?.total ?? null, server: rEntry.total });
      }
    });
  });

  if (clientBidAmount !== null && clientBidAmount !== undefined &&
      moneyOff(clientBidAmount, recomputed.totals.grandTotal)) {
    diffs.push({ field: 'bidAmount', where: 'project', client: clientBidAmount, server: recomputed.totals.grandTotal });
  }

  return diffs;
}
