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

// Names still sliced out of the component (in declaration-dependency order)
const COMPONENT_SLICED = [
  'parseCSVLine', 'findColumnIndex', 'parseRevuCSV', 'aggregateImportData',
];

let moduleEnvCache = null;
export function componentModuleEnv() {
  if (!moduleEnvCache) {
    const code = COMPONENT_SLICED.map((n) => declSource(componentSrc, n)).join('\n');
    const sliced = evalWith(code, COMPONENT_SLICED, {
      getStockLengthsForCategory: LIB_ENV.getStockLengthsForCategory,
      translateSizeToAISC: LIB_ENV.translateSizeToAISC,
      normalizeShapeSize: LIB_ENV.normalizeShapeSize,
      steelDatabase: LIB_ENV.steelDatabase,
    });
    moduleEnvCache = { ...LIB_ENV, ...sliced };
  }
  return moduleEnvCache;
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

export function makeTaxFns(taxCategory) {
  const env = componentModuleEnv();
  const code = [
    `const TAX_RATE = ${componentTaxRate()};`,
    declSource(componentSrc, 'calculateItemTax'),
    declSource(componentSrc, 'getItemTaxBreakdown'),
  ].join('\n');
  return evalWith(code, ['calculateItemTax', 'getItemTaxBreakdown'], {
    taxCategory,
    fmtPrice: env.fmtPrice,
  });
}

export function makeGetItemTotal() {
  const code = declSource(componentSrc, 'getItemTotal');
  return evalWith(code, ['getItemTotal']).getItemTotal;
}

export function makeBreakoutTotals({ items, breakoutGroups, adjustments }) {
  const code = [
    declSource(componentSrc, 'getItemTotal'),
    declSource(componentSrc, 'calculateBreakoutTotals'),
  ].join('\n');
  return evalWith(code, ['calculateBreakoutTotals'], {
    items, breakoutGroups, adjustments,
  }).calculateBreakoutTotals;
}

export function makeCalculateTotals({ items, adjustments, taxCategory }) {
  const env = componentModuleEnv();
  const code = [
    `const TAX_RATE = ${componentTaxRate()};`,
    declSource(componentSrc, 'calculateItemTax'),
    declSource(componentSrc, 'calculateTotals'),
  ].join('\n');
  return evalWith(code, ['calculateTotals'], {
    items, adjustments, taxCategory,
    CONNECTION_WEIGHT_OPS: env.CONNECTION_WEIGHT_OPS,
    fmtPrice: env.fmtPrice,
  }).calculateTotals;
}

export function makeBuildStockListExport({ displayedStockList, sizePricing, projectNest, stockListFilter = '' }) {
  const code = declSource(componentSrc, 'buildStockListExport');
  return evalWith(code, ['buildStockListExport'], {
    displayedStockList, sizePricing, projectNest, stockListFilter,
  }).buildStockListExport;
}

// State-mutating component functions: run against a captured setItems.
// Returns { fn..., getState } — call the update fn, then read getState().
export function makeStatefulUpdaters(initialItems, { pricing = null } = {}) {
  const env = componentModuleEnv();
  let state = initialItems;
  const setItems = (next) => { state = typeof next === 'function' ? next(state) : next; };
  const code = [
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
  });
  return {
    upload: (csvText) => __onload({ target: { result: csvText } }),
    getState: () => state,
    getResult: () => result,
  };
}

// ── Import route (app/api/import-csv/route.js) ──────────────────────────────
const ROUTE_EXPORTS = [
  'normalizeShapeSize', 'parseFeetInches', 'parseCSVLine', 'parseTakeoffCSV',
  'generateEndLabor', 'generateRowFabOps',
  'parseMarkIsParent', 'getMarkBase',
  'memberFingerprint', 'consolidateMembers', 'mergeFabOps', 'aggregateTakeoffData',
  'normalizeToBeamSizeKey', 'getShapeTypeFromKey',
  'CUT_COST_FIELD', 'CONN_PRICING', 'GLOBAL_OP_FIELD',
  'END_LABOR_MAP', 'HOLE_MAP', 'WELD_MAP', 'CONNECTION_MAP', 'PREP_MAP',
];

let routeEnvCache = null;
export function routeEnv() {
  if (!routeEnvCache) {
    const code = sliceBetween(routeSrc, 'function normalizeShapeSize', '\n// Enrich each member');
    routeEnvCache = evalWith(code, ROUTE_EXPORTS);
  }
  return routeEnvCache;
}

// getConnxCost — copy A, inside enrichItemsWithPricing (route.js)
export function makeRouteGetConnxCost(shopLaborRate) {
  const code = declSource(routeSrc, 'getConnxCost');
  return evalWith(code, ['getConnxCost'], { shopLaborRate }).getConnxCost;
}

// enrichOp — attaches rate/connWeight to an op from a pricing row + global rates
export function makeRouteEnrichOp({ rates, shopLaborRate }) {
  const env = routeEnv();
  const code = [
    declSource(routeSrc, 'getConnxCost'),
    declSource(routeSrc, 'enrichOp'),
  ].join('\n');
  return evalWith(code, ['enrichOp'], {
    rates, shopLaborRate,
    GLOBAL_OP_FIELD: env.GLOBAL_OP_FIELD,
    CUT_COST_FIELD: env.CUT_COST_FIELD,
    CONN_PRICING: env.CONN_PRICING,
  }).enrichOp;
}

// ── lib/fab-pricing.js ───────────────────────────────────────────────────────
export function fabPricingKeyFns() {
  const code = sliceBetween(fabPricingSrc, 'function normalizeKey', '\n// Returns a flat pricing object');
  return evalWith(code, ['normalizeKey', 'getShapeType']);
}

// connxCost — copy B, inside getFabPricingForSize (lib/fab-pricing.js).
// Closure deps are `row` and `shopLaborRate`.
export function makeLibConnxCost(row, shopLaborRate) {
  const code = declSource(fabPricingSrc, 'connxCost');
  return evalWith(code, ['connxCost'], { row, shopLaborRate }).connxCost;
}
