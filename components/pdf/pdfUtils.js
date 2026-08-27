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

// ── Labor groups (grouped fab-op pricing) ───────────────────────────────────
export { computeGroupSummaries, groupAnchors } from '../../lib/estimating/labor-groups';

// Like visibleFabOps, but also drops member rows of COLLAPSED groups —
// prints follow the on-screen collapse state.
export const visibleFabOpsForGroups = (fab, groupById) => {
  return (fab || []).filter(f => !f.isAutoGalv && !f.isConnGalv &&
    !(f.laborGroupId != null && groupById?.get(f.laborGroupId)?.collapsed));
};

// @react-pdf needs hex, not Tailwind classes. Aligned by colorIndex with
// LABOR_GROUP_STYLES in components/laborGroupStyles.js (violet/sky/rose/teal/amber).
export const LABOR_GROUP_PDF_COLORS = [
  { fill: '#F5F3FF', text: '#7C3AED' }, // violet
  { fill: '#F0F9FF', text: '#0284C7' }, // sky
  { fill: '#FFF1F2', text: '#E11D48' }, // rose
  { fill: '#F0FDFA', text: '#0D9488' }, // teal
  { fill: '#FFFBEB', text: '#D97706' }, // amber
];
export const laborGroupPdfColor = (colorIndex) =>
  LABOR_GROUP_PDF_COLORS[(colorIndex || 0) % LABOR_GROUP_PDF_COLORS.length];
