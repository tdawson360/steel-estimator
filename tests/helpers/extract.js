// Characterization-test source harness.
//
// Most calculation functions live INSIDE the SteelEstimator React component
// closure and can't be imported. This harness slices their exact source text
// out of the production files and re-evaluates it with injected stand-ins for
// the closure variables (state, memos, sibling functions). Production code is
// never modified — if a slice marker breaks, the suite fails loudly rather
// than silently testing something else.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readSource = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

export const componentSrc = readSource('components/SteelEstimator.jsx');
export const routeSrc = readSource('app/api/import-csv/route.js');
export const fabPricingSrc = readSource('lib/fab-pricing.js');
export const pdfUtilsPath = path.join(root, 'components', 'pdf', 'pdfUtils.js');

export function sliceBetween(src, start, end) {
  const a = src.indexOf(start);
  if (a === -1) throw new Error(`slice start marker not found: ${start}`);
  const b = src.indexOf(end, a);
  if (b === -1) throw new Error(`slice end marker not found: ${end}`);
  return src.slice(a, b);
}

// Extract a full `const NAME = …;` declaration with a string/template-aware
// balanced scanner. Suitable for the component functions we slice (none of
// them contain regex literals, which this scanner does not parse).
export function declSource(src, name) {
  const marker = `const ${name} = `;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`declaration not found: ${name}`);
  let depth = 0;
  let quote = null;            // "'", '"', '`' when inside a string
  const templateDepths = [];   // depths at which `${` opened inside a template
  for (let i = start + marker.length; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (quote === '`' && c === '$' && src[i + 1] === '{') {
        depth++;
        templateDepths.push(depth);
        quote = null;
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (c === '}' && templateDepths.length && templateDepths[templateDepths.length - 1] === depth) {
        templateDepths.pop();
        quote = '`';
      }
      depth--;
      continue;
    }
    if (c === ';' && depth === 0) {
      return src.slice(start, i + 1);
    }
  }
  throw new Error(`declaration end not found: ${name}`);
}

// Evaluate source with named injections; returns the requested bindings.
export function evalWith(code, returns, injections = {}) {
  const names = Object.keys(injections);
  const fn = new Function(...names, `${code}\nreturn { ${returns.join(', ')} };`);
  return fn(...names.map((n) => injections[n]));
}

// ── Component module scope ───────────────────────────────────────────────────
// Data modules and pure helpers have been extracted to lib/estimating/ — the
// env composes real imports with per-declaration slices of whatever still
// lives in the component. As extraction proceeds, names migrate from the
// sliced list to the imports; test assertions and snapshots never change.
import * as libAisc from '../../lib/estimating/aisc-shapes.js';
import * as libFabOps from '../../lib/estimating/fab-operations.js';
import * as libPlates from '../../lib/estimating/plates.js';
import * as libStockLengths from '../../lib/estimating/stock-lengths.js';
import * as libFormat from '../../lib/estimating/format.js';
import * as libSizes from '../../lib/estimating/sizes.js';
import * as libStockOpt from '../../lib/estimating/stock-optimization.js';
import * as libNesting from '../../lib/estimating/nesting.js';
import * as libSequence from '../../lib/estimating/sequence.js';
import * as libSorting from '../../lib/estimating/sorting.js';

const LIB_ENV = {
  ...libAisc, ...libFabOps, ...libPlates, ...libStockLengths, ...libFormat, ...libSizes,
  ...libStockOpt, ...libNesting, ...libSequence, ...libSorting,
};

import * as libRevu from '../../lib/estimating/import-revu.js';
import * as libRfq from '../../lib/estimating/import-rfq.js';
import * as libFabCosts from '../../lib/estimating/fab-costs.js';
import * as libLaborGroups from '../../lib/estimating/labor-groups.js';
import * as libGalv from '../../lib/estimating/galv.js';
import { parseCSVLine as libParseCSVLine } from '../../lib/estimating/import-takeoff.js';

// Everything the tests need from the former component module scope now lives
// in lib/estimating/ — no slicing remains at module level.
export function componentModuleEnv() {
  return { ...LIB_ENV, ...libRevu, parseCSVLine: libParseCSVLine };
}

// TAX_RATE now lives in lib/estimating/rates.js (the component consumes
// DEFAULT_PRICING_RATES.taxRate) — characterized from the rates source.
import { DEFAULT_PRICING_RATES } from '../../lib/estimating/rates.js';
export function componentTaxRate() {
  return DEFAULT_PRICING_RATES.taxRate;
}

// ── Component-scope function factories ───────────────────────────────────────

// calculateMaterial now lives in lib/estimating/material-calc.js — the maker
// keeps its old shape (availableLengthsFor override) for the existing tests.
import { calculateMaterial as libCalculateMaterial } from '../../lib/estimating/material-calc.js';
export function makeCalculateMaterial({ availableLengthsFor } = {}) {
  return (material) => libCalculateMaterial(
    material,
    availableLengthsFor ? { stockLengthsFor: availableLengthsFor } : {}
  );
}

// Tax / item totals / breakout / project totals now live in
// lib/estimating/totals.js (single implementations). The makers keep their
// old signatures so test files and golden masters are untouched.
import * as libTotals from '../../lib/estimating/totals.js';

export function makeTaxFns(taxCategory) {
  const rates = DEFAULT_PRICING_RATES;
  return {
    calculateItemTax: (item) => libTotals.calculateItemTax(item, taxCategory, rates),
    getItemTaxBreakdown: (item) => libTotals.itemTaxBreakdown(item, taxCategory, rates),
  };
}

export function makeGetItemTotal() {
  return libTotals.getItemTotal;
}

export function makeBreakoutTotals({ items, breakoutGroups, adjustments }) {
  return () => libTotals.calculateBreakoutTotals(items, breakoutGroups, adjustments);
}

export function makeCalculateTotals({ items, adjustments, taxCategory }) {
  return () => libTotals.projectTotals(items, adjustments, taxCategory, DEFAULT_PRICING_RATES).totals;
}

export function makeBuildStockListExport({ displayedStockList, sizePricing, projectNest, stockListFilter = '' }) {
  const code = declSource(componentSrc, 'buildStockListExport');
  return evalWith(code, ['buildStockListExport'], {
    displayedStockList, sizePricing, projectNest, stockListFilter,
    stockRowEstCost: libFabCosts.stockRowEstCost,
  }).buildStockListExport;
}

// State-mutating component functions: run against a captured setItems.
// Returns { fn..., getState } — call the update fn, then read getState().
export function makeStatefulUpdaters(initialItems, { pricing = null } = {}) {
  const env = componentModuleEnv();
  let state = initialItems;
  const setItems = (next) => { state = typeof next === 'function' ? next(state) : next; };
  const code = [
    declSource(componentSrc, 'pruneEmptyLaborGroups'),
    declSource(componentSrc, 'updateRecapCost'),
    declSource(componentSrc, 'updateFabrication'),
    declSource(componentSrc, 'updateMaterialFab'),
  ].join('\n');
  const bound = evalWith(code, ['updateRecapCost', 'updateFabrication', 'updateMaterialFab'], {
    get items() { return state; },
    setItems,
    getPricingForSize: async () => pricing,
    customOpRateMap: {},
    getConnectionWeight: env.getConnectionWeight,
    CONNECTION_WEIGHT_OPS: env.CONNECTION_WEIGHT_OPS,
    OP_PRICING_FIELD: env.OP_PRICING_FIELD,
    OP_WEIGHT_FIELD: env.OP_WEIGHT_FIELD,
    OP_DEFAULT_UNIT: env.OP_DEFAULT_UNIT,
    computeFabLineTotal: libFabCosts.computeFabLineTotal,
    recapEntryTotal: libTotals.recapEntryTotal,
    isGroupableFab: libLaborGroups.isGroupableFab,
    fabGroupKey: libLaborGroups.fabGroupKey,
    normalizeGalvLines: libGalv.normalizeGalvLines,
  });
  return { ...bound, getState: () => state };
}

// RFQ vendor-CSV pricing upload: the parsing/weighted-average/apply logic
// lives in a FileReader onload closure. Slice the onload body and drive it
// with a fake event; capture setItems / setRfqUploadResult.
export function makeRfqUpload(initialItems, calculateMaterialFn) {
  const env = componentModuleEnv();
  let state = initialItems;
  let result = null;
  const setItems = (next) => { state = typeof next === 'function' ? next(state) : next; };
  const setRfqUploadResult = (r) => { result = r; };
  const code =
    'const reader = {};\n' +
    sliceBetween(componentSrc, 'reader.onload = (evt) => {', 'reader.readAsText(file);') +
    '\nconst __onload = reader.onload;';
  const { __onload } = evalWith(code, ['__onload'], {
    items: initialItems,
    setItems,
    setRfqUploadResult,
    normalizeShapeSize: env.normalizeShapeSize,
    calculateMaterial: calculateMaterialFn,
    // engine functions the thinned onload now calls
    parseVendorPricingCsv: libRfq.parseVendorPricingCsv,
    vendorPricingFor: libRfq.vendorPricingFor,
    matchVendorPricing: libRfq.matchVendorPricing,
  });
  return {
    upload: (csvText) => __onload({ target: { result: csvText } }),
    getState: () => state,
    getResult: () => result,
  };
}

// ── Import route (app/api/import-csv/route.js) ──────────────────────────────
// The takeoff-import pure functions now live in
// lib/estimating/import-takeoff.js; connection pricing is the single engine
// implementation in lib/estimating/connection-pricing.js. The dual tests keep
// running against both ENTRY POINTS, which now provably share one
// implementation.
import * as libConnx from '../../lib/estimating/connection-pricing.js';
import * as libTakeoff from '../../lib/estimating/import-takeoff.js';
import { normalizeShapeSize as libNormalizeShapeSize } from '../../lib/estimating/sizes.js';

export function routeEnv() {
  return {
    ...libTakeoff,
    normalizeShapeSize: libNormalizeShapeSize,
    normalizeToBeamSizeKey: libConnx.normalizeBeamSizeKey,
    getShapeTypeFromKey: libConnx.getShapeTypeFromKey,
    CUT_COST_FIELD: libConnx.CUT_COST_FIELD,
    CONN_PRICING: libConnx.CONN_PRICING,
    GLOBAL_OP_FIELD: libConnx.GLOBAL_OP_FIELD,
  };
}

// getConnxCost — entry point A (import route path)
export function makeRouteGetConnxCost(shopLaborRate) {
  return (row, isMoment) => libConnx.getConnxCost(row, isMoment, shopLaborRate);
}

// enrichOp — attaches rate/connWeight to an op from a pricing row + global rates
export function makeRouteEnrichOp({ rates, shopLaborRate }) {
  return (op, pricingRow) => libConnx.enrichOp(op, pricingRow, rates, shopLaborRate);
}

// ── lib/fab-pricing.js ───────────────────────────────────────────────────────
export function fabPricingKeyFns() {
  return {
    normalizeKey: libConnx.normalizeBeamSizeKey,
    getShapeType: libConnx.getShapeTypeFromKey,
  };
}

// connxCost — entry point B (lib/fab-pricing.js path)
export function makeLibConnxCost(row, shopLaborRate) {
  return (isMoment) => libConnx.getConnxCost(row, isMoment, shopLaborRate);
}
