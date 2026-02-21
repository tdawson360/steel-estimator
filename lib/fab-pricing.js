'use server';

import prisma from './db';

function normalizeKey(rawSize) {
  if (!rawSize) return null;
  return rawSize.replace(/\s+/g, '').replace(/x/g, 'X').toUpperCase();
}

function getShapeType(key) {
  if (!key) return null;
  if (/^W\d/.test(key)) return 'WF';
  if (/^(C|MC)\d/.test(key)) return 'C';
  return null;
}

// Returns a flat pricing object for a given beam size string (e.g. "W 16 x 26").
// Returns null for shapes with no connection pricing (HSS, angle, plate, etc.).
export async function getFabPricingForSize(rawSize) {
  const key = normalizeKey(rawSize);
  if (!key) return null;
  const shapeType = getShapeType(key);
  if (!shapeType) return null;

  const rates = await prisma.pricingRates.findUnique({ where: { id: 1 } });
  const shopLaborRate = rates?.shopLaborRatePerHr ?? 65;

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

  if (!row) return null;

  // Compute connection cost — WF connections derive cost from laborHours × shopLaborRate;
  // C/MC connections store it directly. "Provide T/O" beams (W44/W40/W36/W33) return null.
  const connxCost = (isMoment) => {
    const field = isMoment ? 'momentConnxCost' : 'connxCost';
    if (row[field] != null) return row[field];
    const provideTO = isMoment
      ? (row.momentConnxCostProvideTO ?? row.providesTakeoffCost ?? false)
      : (row.connxCostProvideTO ?? row.providesTakeoffCost ?? false);
    if (provideTO) return null;
    const hrs = row.laborHours ?? row.category?.laborHours;
    return hrs != null ? parseFloat((hrs * shopLaborRate).toFixed(2)) : null;
  };

  return {
    straightCutCost:      row.straightCutCost      ?? null,
    miterCutCost:         row.miterCutCost          ?? null,
    doubleMiterCost:      row.doubleMiterCost       ?? null,
    singleCopeCost:       row.singleCopeCost        ?? null,
    doubleCopeCost:       row.doubleCopeCost        ?? null,
    singleCopeMiterCost:  row.singleCopeMiterCost   ?? null,
    doubleCopeMiterCost:  row.doubleCopeMiterCost   ?? null,
    connxCost:            connxCost(false),
    momentConnxCost:      connxCost(true),
    connxWeightLbs:       row.connxWeightLbs        ?? null,
    momentConnxWeightLbs: row.momentConnxWeightLbs  ?? null,
  };
}
