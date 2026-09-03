'use server';

import prisma from './db';
import { DEFAULT_PRICING_RATES } from './estimating/rates';
import { normalizeBeamSizeKey, getShapeTypeFromKey, getConnxCost, getAllInConnxCost } from './estimating/connection-pricing';

export async function getCustomOps() {
  return prisma.customFabOperation.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

// Key normalization + shape typing now come from the single engine
// implementation (lib/estimating/connection-pricing.js).
const normalizeKey = normalizeBeamSizeKey;
const getShapeType = getShapeTypeFromKey;

// Returns a flat pricing object for a given beam size string (e.g. "W 16 x 26").
// Always returns global operation rates (drilling/prep/welding).
// Returns beam-specific cut/connection costs only for W-shape and C/MC shapes; null for others.
export async function getFabPricingForSize(rawSize) {
  const key = normalizeKey(rawSize);
  const shapeType = key ? getShapeType(key) : null;

  const rates = await prisma.pricingRates.findUnique({ where: { id: 1 } });
  const shopLaborRate = rates?.shopLaborRatePerHr ?? DEFAULT_PRICING_RATES.shopLaborRatePerHr;

  // Global operation rates (always returned regardless of shape type)
  const opRates = {
    drillHolesRate:  rates?.drillHolesRate  ?? null,
    drillCSinkRate:  rates?.drillCSinkRate  ?? null,
    drillTapRate:    rates?.drillTapRate    ?? null,
    easeRate:        rates?.easeRate        ?? null,
    spliceRate:      rates?.spliceRate      ?? null,
    ninetyRate:      rates?.ninetyRate      ?? null,
    camberRate:      rates?.camberRate      ?? null,
    rollRate:        rates?.rollRate        ?? null,
    prepCjpRate:     rates?.prepCjpRate     ?? null,
    taperRate:       rates?.taperRate       ?? null,
    weldFilletRate:  rates?.weldFilletRate  ?? null,
    weldBevelRate:   rates?.weldBevelRate   ?? null,
    weldPjpRate:     rates?.weldPjpRate     ?? null,
    weldCjpRate:     rates?.weldCjpRate     ?? null,
    preheatWeldRate:      rates?.preheatWeldRate      ?? null,
    preheatWeldGrindRate: rates?.preheatWeldGrindRate ?? null,
  };

  // For shapes without connection/cut pricing, return only op rates
  if (!shapeType || !key) {
    return { ...opRates };
  }

  // Try exact beam match first (includes parent category via relation)
  let row = await prisma.beamConnectionData.findUnique({
    where: { beamSize: key },
    include: { category: true },
  });

  // Fall back to category by shape prefix
  if (!row) {
    const m = key.match(/^(MC\d+|W\d+|C\d+)/);
    if (m) {
      const cats = await prisma.connectionCategory.findMany({ where: { shapeType } });
      for (const cat of cats) {
        const prefixes = cat.shapesIncluded.split(',').map(s => s.trim());
        if (prefixes.includes(m[1])) { row = cat; break; }
      }
    }
  }

  if (!row) {
    return { ...opRates };
  }

  // Connection cost via the single engine implementation
  // (lib/estimating/connection-pricing.js getConnxCost).
  const connxCost = (isMoment) => getConnxCost(row, isMoment, shopLaborRate);

  return {
    ...opRates,
    straightCutCost:      row.straightCutCost      ?? null,
    miterCutCost:         row.miterCutCost          ?? null,
    doubleMiterCost:      row.doubleMiterCost       ?? null,
    singleCopeCost:       row.singleCopeCost        ?? null,
    doubleCopeCost:       row.doubleCopeCost        ?? null,
    singleCopeMiterCost:  row.singleCopeMiterCost   ?? null,
    doubleCopeMiterCost:  row.doubleCopeMiterCost   ?? null,
    connxCost:            connxCost(false),
    momentConnxCost:      connxCost(true),
    boltedConnxCost:      getAllInConnxCost(row, 'boltedConnxCost'),
    weldedConnxCost:      getAllInConnxCost(row, 'weldedConnxCost'),
    connxWeightLbs:       row.connxWeightLbs        ?? null,
    momentConnxWeightLbs: row.momentConnxWeightLbs  ?? null,
  };
}
