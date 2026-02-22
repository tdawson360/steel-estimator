// pdfUtils.js — Pure JS helpers for PDF generation (no JSX, no React)
// Mirrors the formatting + calculation functions from SteelEstimator.jsx

export const roundCustom = (num) => {
  if (num === null || num === undefined || isNaN(num)) return 0;
  const decimal = num - Math.floor(num);
  return decimal <= 0.29 ? Math.floor(num) : Math.ceil(num);
};

export const fmtPrice = (num) => {
  return '$' + roundCustom(num).toLocaleString();
};

export const fmtQuotePrice = (num) => {
  const rounded = roundCustom(num);
  return '$' + rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Mirrors SteelEstimator.jsx getItemTotal (line 2343)
export const getItemTotal = (item) => {
  const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
  const matFabCost = item.materials.reduce((s, m) => {
    return s + (m.fabrication ? m.fabrication.reduce((fs, f) => fs + (f.totalCost || 0), 0) : 0);
  }, 0);
  const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
  const totalFabCost = matFabCost + itemFabCost;
  const markedUpMatCost = matCost * (1 + (item.materialMarkup || 0) / 100);
  const markedUpFabCost = totalFabCost * (1 + (item.fabMarkup || 0) / 100);
  const recapCost = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
  return markedUpMatCost + markedUpFabCost + recapCost;
};

// Returns breakdown used in the Recap table columns
export const getItemCostBreakdown = (item) => {
  const material = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
  const matFabCost = item.materials.reduce((s, m) => {
    return s + (m.fabrication ? m.fabrication.reduce((fs, f) => fs + (f.totalCost || 0), 0) : 0);
  }, 0);
  const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
  const fabrication = matFabCost + itemFabCost;
  const recapCost = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
  const matMarkupAmt = material * (item.materialMarkup || 0) / 100;
  const fabMarkupAmt = fabrication * (item.fabMarkup || 0) / 100;
  const total = getItemTotal(item);
  return { material, matMarkupAmt, fabrication, fabMarkupAmt, recapCost, total };
};

// Return visible fab ops for a material (filter galv rows)
export const visibleFabOps = (fab) => {
  return (fab || []).filter(f => !f.isAutoGalv && !f.isConnGalv);
};
