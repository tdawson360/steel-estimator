// Fabrication-line and derived cost rules extracted from component handlers.
// All formulas moved as-is from SteelEstimator.jsx.

import { CONNECTION_WEIGHT_OPS } from './fab-operations';

// Material-fab line totalCost (from updateMaterialFab):
//  - connection ops: unit LB → qty × connWeight × rate; else qty × rate
//  - length-based (IN/LF with a length): qty × length × rate
//  - standard: qty × rate
export function computeFabLineTotal(fab) {
  const qty = fab.quantity || 0;
  const len = fab.length || 0;
  const rate = fab.unitPrice || 0;

  if (fab.connWeight && CONNECTION_WEIGHT_OPS.has(fab.operation)) {
    if (fab.unit === 'LB') {
      return qty * fab.connWeight * rate;
    }
    return qty * rate;
  } else if ((fab.unit === 'IN' || fab.unit === 'LF') && len > 0) {
    return qty * len * rate;
  }
  return qty * rate;
}

// Pooled (nested) line stock weight + cost by pricing basis
// (from the nest write-back effect).
export function pooledLineCost(base, alloc) {
  const stockWeight = (base.fabWeight || 0) * alloc.yield;
  const unitPrice = base.unitPrice || 0;
  let totalCost = base.totalCost;
  if (base.priceBy === 'LB') totalCost = stockWeight * unitPrice;
  else if (base.priceBy === 'CWT') totalCost = (stockWeight / 100) * unitPrice;
  else if (base.priceBy === 'LF') totalCost = alloc.allocStockLengthFt * unitPrice;
  else if (base.priceBy === 'EA') totalCost = (base.pieces || 0) * unitPrice;
  return { stockWeight, totalCost };
}

// Buy-list row cost extension for a size's uniform pricing
// (Stock List Est Cost column, CSV/PDF exports). Returns null when the size
// has no uniform rate or the basis can't extend from a buy row (EA).
export function stockRowEstCost(row, sp) {
  if (!sp || sp.mixed || !sp.unitPrice) return null;
  if (sp.priceBy === 'LB') return row.totalWeight * sp.unitPrice;
  if (sp.priceBy === 'CWT') return (row.totalWeight / 100) * sp.unitPrice;
  if (sp.priceBy === 'LF') return row.stockLength * row.totalStocks * sp.unitPrice;
  return null;
}

// Estimating length tolerance: nearest 1" (never below 1"), stored as
// 2-decimal feet.
export function roundLengthToInch(lengthFt) {
  return +(Math.max(Math.round(lengthFt * 12), 1) / 12).toFixed(2);
}
