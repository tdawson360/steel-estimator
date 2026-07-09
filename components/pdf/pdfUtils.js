// pdfUtils.js — thin re-export layer over the estimating engine.
// The former local copies of roundCustom/fmt*/getItemTotal/getItemCostBreakdown
// are collapsed into lib/estimating/ (single implementations); the export
// surface here is unchanged so PDF components keep importing from this file.

export { roundCustom, fmtPrice, fmtRate, fmtQuotePrice, fmtRate4 } from '../../lib/estimating/format';
export { getItemTotal, getItemCostBreakdown } from '../../lib/estimating/totals';

// Return visible fab ops for a material (filter galv rows) — display concern,
// stays here.
export const visibleFabOps = (fab) => {
  return (fab || []).filter(f => !f.isAutoGalv && !f.isConnGalv);
};
