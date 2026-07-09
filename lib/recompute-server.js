// Server-side recompute glue shared by the project PUT route and the
// duplicate route. Lives OUTSIDE lib/estimating (it touches Prisma and the
// filesystem); the math itself is lib/estimating/recompute.js.

import fs from 'node:fs';
import path from 'node:path';
import prisma from './db';
import { recomputeEstimate } from './estimating/recompute';
import { resolvePricingRates } from './estimating/rates';

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
