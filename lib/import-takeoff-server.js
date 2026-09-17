// Server side of the takeoff import: CSV text in, priced items out.
//
// Shared by POST /api/import-csv (a file the estimator uploads, usually
// Revu's Markups List export) and POST /api/drawings/[id]/jobs/[jobId]/import
// (the same rows read straight out of a takeoff PDF by sidecar/markups_csv.py).
// The pure parsing/aggregation lives in lib/estimating/import-takeoff.js; this
// module only adds what needs the database: the hardware catalog and the
// connection pricing rows.
import prisma from './db';
import { DEFAULT_PRICING_RATES } from './estimating/rates';
import { normalizeBeamSizeKey as normalizeToBeamSizeKey, getShapeTypeFromKey, enrichOp } from './estimating/connection-pricing';
import { parseTakeoffCSV, aggregateTakeoffData, annotateHardware } from './estimating/import-takeoff';

// Enrich each member's fabrication ops with rate and connWeight from the DB.
// Uses BeamConnectionData for exact beam matches; falls back to ConnectionCategory.
export async function enrichItemsWithPricing(items) {
  // Collect all unique normalized beam size keys
  const sizeKeys = new Set();
  const walkMembers = (members) => {
    for (const m of members) {
      const key = normalizeToBeamSizeKey(m.size);
      if (key) sizeKeys.add(key);
      if (m.children?.length) walkMembers(m.children);
    }
  };
  for (const item of items) walkMembers(item.members);

  // Fetch shop labor rate (needed to compute WF connection costs from laborHours)
  const rates = await prisma.pricingRates.findUnique({ where: { id: 1 } });
  const shopLaborRate = rates?.shopLaborRatePerHr ?? DEFAULT_PRICING_RATES.shopLaborRatePerHr;

  // Batch-fetch beam-specific records, including their parent category (for laborHours)
  const beamRows = await prisma.beamConnectionData.findMany({
    where: { beamSize: { in: [...sizeKeys] } },
    include: { category: true },
  });
  const beamMap = new Map(beamRows.map(b => [b.beamSize, b]));

  // Fetch all categories for fallback (small table, always cheap)
  const cats = await prisma.connectionCategory.findMany();
  const catByPrefix = new Map();
  for (const cat of cats) {
    for (const prefix of cat.shapesIncluded.split(',').map(s => s.trim())) {
      catByPrefix.set(`${cat.shapeType}:${prefix}`, cat);
    }
  }

  // Look up pricing data for a given normalized size key
  const getPricing = (key) => {
    if (beamMap.has(key)) return beamMap.get(key);
    const shapeType = getShapeTypeFromKey(key);
    if (!shapeType) return null;
    const m = key.match(/^(MC\d+|W\d+|C\d+)/);
    if (!m) return null;
    return catByPrefix.get(`${shapeType}:${m[1]}`) ?? null;
  };

  // Walk all members and enrich fabrication ops in-place using the single
  // engine implementation (lib/estimating/connection-pricing.js)
  const enrichMember = (member) => {
    const key = normalizeToBeamSizeKey(member.size);
    const pricingRow = key ? getPricing(key) : null;
    // Always enrich — global rates apply even when no beam-specific pricing exists
    member.fabrication = member.fabrication.map(op => enrichOp(op, pricingRow, rates, shopLaborRate));
    if (member.children?.length) member.children.forEach(enrichMember);
  };

  for (const item of items) item.members.forEach(enrichMember);
}

// Takeoff CSV text → { success, items, stats, ... } or { error }.
// The caller maps { error } to a 422: the text was readable but not a takeoff.
export async function importTakeoffText(text) {
  const { error, rawRows } = parseTakeoffCSV(text);
  if (error) return { error };
  const result = aggregateTakeoffData(rawRows);
  // Shape_Size naming a hardware catalog item (anchor rods, bolts, anchors)
  // imports as a priced Hardware row instead of a zero-weight Custom row
  const catalog = await prisma.hardwareItem.findMany({ where: { active: true } });
  result.stats.hardwareRows = annotateHardware(result.items, catalog);
  await enrichItemsWithPricing(result.items);
  return { success: true, ...result };
}
