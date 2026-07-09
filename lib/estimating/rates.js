// PricingRates — the single source for rate constants the estimating engine
// consumes. Engine functions receive rates as an INPUT PARAMETER; nothing in
// lib/estimating/ reaches out to a database or global.
//
// Interim decision (2026-07-09): this is a CONFIG MODULE, not a new Prisma
// column. Rationale: a `PricingRates` table already exists (shop labor rate,
// operation rates) and is fetched where connection pricing needs it; the tax
// rate has no DB storage today and adding a column mid-extraction would mix a
// schema migration into a refactor whose contract is "no behavior change".
// The engine's rate parameter makes the swap trivial later — the recommended
// end state is a `taxRate` column on the existing PricingRates singleton
// (id=1) so estimators can change jurisdiction rates without a deploy, with
// `resolvePricingRates(dbRow)` already shaped to merge it.

export const DEFAULT_PRICING_RATES = {
  // Local sales tax applied by the tax-category rules (was the hardcoded
  // TAX_RATE in SteelEstimator.jsx).
  taxRate: 0.0825,
  // Shop labor $/hr fallback when the PricingRates DB row is absent — used to
  // derive WF connection costs from laborHours.
  shopLaborRatePerHr: 65,
};

// Merge a PricingRates DB row (may be null) over the defaults. Null/undefined
// fields in the row do not override defaults.
export function resolvePricingRates(dbRow) {
  const merged = { ...DEFAULT_PRICING_RATES };
  if (dbRow && typeof dbRow === 'object') {
    for (const [k, v] of Object.entries(dbRow)) {
      if (v !== null && v !== undefined) merged[k] = v;
    }
  }
  return merged;
}
