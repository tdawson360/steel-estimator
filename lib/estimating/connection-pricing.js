// Connection & operation pricing rules — THE single implementation of the
// connection-cost rule that previously existed twice (inside
// enrichItemsWithPricing in app/api/import-csv/route.js, and inside
// getFabPricingForSize in lib/fab-pricing.js). The characterization suite
// proved both copies agreed across the pricing-row matrix before the merge.
//
// FINDINGS.md #2 (no moment premium on the laborHours path) and #8 (half-cent
// toFixed loss on fractional laborHours) live here, frozen as-is.
//
// Pure: rows, rates, and the shop labor rate all arrive as parameters.

// Convert "W 16 x 26" or "W16x26" to the DB key format "W16X26"
export function normalizeBeamSizeKey(shapeSize) {
  if (!shapeSize) return null;
  return shapeSize.replace(/\s+/g, '').replace(/x/g, 'X').toUpperCase();
}

// Determine DB shapeType ("WF" or "C") from a normalized beam size key
export function getShapeTypeFromKey(key) {
  if (!key) return null;
  if (/^W\d/.test(key)) return 'WF';
  if (/^(C|MC)\d/.test(key)) return 'C';
  return null;
}

// Cut operation → cost field name on BeamConnectionData / ConnectionCategory
export const CUT_COST_FIELD = {
  'Cut- Straight':           'straightCutCost',
  'Cut- Miter':              'miterCutCost',
  'Cut- Double Miter':       'doubleMiterCost',
  'Cut- Single Cope End':    'singleCopeCost',
  'Cut- Double Cope End':    'doubleCopeCost',
  'Cut- Single Cope + Miter':'singleCopeMiterCost',
  'Cut- Double Cope + Miter':'doubleCopeMiterCost',
};

// Connection operation → cost + weight field names
export const CONN_PRICING = {
  'WF Connx':        { costField: 'connxCost',       weightField: 'connxWeightLbs' },
  'WF Moment Connx': { costField: 'momentConnxCost',  weightField: 'momentConnxWeightLbs' },
  'C Connx':         { costField: 'connxCost',        weightField: 'connxWeightLbs' },
  'C Moment Connx':  { costField: 'momentConnxCost',  weightField: 'momentConnxWeightLbs' },
};

// Global op rate field (from PricingRates) for drilling/prep/welding operations
export const GLOBAL_OP_FIELD = {
  'Drill Holes':           'drillHolesRate',
  "Drill & C'sink Holes":  'drillCSinkRate',
  'Drill & Tap Holes':     'drillTapRate',
  'Ease':                  'easeRate',
  'Splice':                'spliceRate',
  "90's":                  'ninetyRate',
  'Camber':                'camberRate',
  'Roll':                  'rollRate',
  'Welding- Fillet':       'weldFilletRate',
  'Welding- Bevel/Grind':  'weldBevelRate',
  'Welding- PJP':          'weldPjpRate',
  'Welding- CJP':          'weldCjpRate',
};

// Resolve connection cost from a pricing row (BeamConnectionData or
// ConnectionCategory).
// WF categories store no connxCost — cost is laborHours × shopLaborRate.
// C/MC categories store an explicit connxCost.
// "Provide T/O" beams (W44/W40/W36/W33) return null — estimator fills in manually.
export function getConnxCost(row, isMoment, shopLaborRate) {
  const costField = isMoment ? 'momentConnxCost' : 'connxCost';

  // Explicit dollar value present (C/MC beams/categories, or beam-level override)
  if (row[costField] != null) return row[costField];

  // Check "provide T/O" flag — beam rows have per-type flags, categories have one flag
  const provideTO = isMoment
    ? (row.momentConnxCostProvideTO ?? row.providesTakeoffCost ?? false)
    : (row.connxCostProvideTO ?? row.providesTakeoffCost ?? false);
  if (provideTO) return null;

  // Compute from laborHours (WF connections — beam row defers to its category)
  const laborHours = row.laborHours ?? row.category?.laborHours;
  if (laborHours != null) return parseFloat((laborHours * shopLaborRate).toFixed(2));

  return null;
}

// Add rate and connWeight to a fabrication op given the pricing row + global
// rates. `rates` is the PricingRates row (global op rates); `pricingRow` is
// the beam/category connection row (may be null).
export function enrichOp(op, pricingRow, rates, shopLaborRate) {
  // Global op rates (drilling/prep/welding) — applied regardless of shape type
  const globalField = GLOBAL_OP_FIELD[op.operation];
  if (globalField && rates?.[globalField] != null) {
    return { ...op, rate: rates[globalField] };
  }

  if (!pricingRow) return op;

  // Cut operations — direct field lookup
  const cutField = CUT_COST_FIELD[op.operation];
  if (cutField) {
    const cost = pricingRow[cutField];
    if (cost != null) return { ...op, rate: cost };
    return op;
  }

  // Connection operations — computed cost + weight
  const connFields = CONN_PRICING[op.operation];
  if (connFields) {
    const isMoment = op.operation.includes('Moment');
    const cost = getConnxCost(pricingRow, isMoment, shopLaborRate);
    const weight = pricingRow[connFields.weightField];
    return {
      ...op,
      ...(cost != null ? { rate: cost } : {}),
      ...(weight != null ? { connWeight: weight } : {}),
    };
  }

  return op;
}
