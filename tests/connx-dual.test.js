// Characterization: the TWO connection-cost implementations —
//   copy A: getConnxCost inside enrichItemsWithPricing (app/api/import-csv/route.js)
//   copy B: connxCost inside getFabPricingForSize (lib/fab-pricing.js)
// Both are driven over the same matrix of pricing rows. Any disagreement is
// captured with BOTH outputs and belongs at the top of the findings list.

import { describe, it, expect } from 'vitest';
import {
  makeRouteGetConnxCost, makeLibConnxCost, makeRouteEnrichOp, routeEnv, fabPricingKeyFns,
} from './helpers/extract.js';

const SHOP_RATE = 65;

// Matrix of pricing-row shapes seen in the wild:
//  - beam rows (BeamConnectionData): per-type provide-T/O flags, own costs,
//    laborHours absent but category relation present
//  - category rows (ConnectionCategory): laborHours, single providesTakeoffCost
const ROWS = {
  'beam: explicit costs': {
    connxCost: 120, momentConnxCost: 310,
    connxCostProvideTO: false, momentConnxCostProvideTO: false,
    laborHours: null, category: { laborHours: 2.5 },
  },
  'beam: provide-T/O both': {
    connxCost: null, momentConnxCost: null,
    connxCostProvideTO: true, momentConnxCostProvideTO: true,
    laborHours: null, category: { laborHours: 2.5 },
  },
  'beam: null costs, falls to category laborHours': {
    connxCost: null, momentConnxCost: null,
    connxCostProvideTO: false, momentConnxCostProvideTO: false,
    laborHours: null, category: { laborHours: 2.5 },
  },
  'beam: zero-dollar explicit cost': {
    connxCost: 0, momentConnxCost: 0,
    connxCostProvideTO: false, momentConnxCostProvideTO: false,
    laborHours: null, category: { laborHours: 2.5 },
  },
  'category: laborHours drives cost (WF style)': {
    laborHours: 1.75, providesTakeoffCost: false,
    connxCost: null, momentConnxCost: null,
  },
  'category: explicit costs (C/MC style)': {
    laborHours: 1.2, providesTakeoffCost: false,
    connxCost: 95, momentConnxCost: 240,
  },
  'category: provide-T/O': {
    laborHours: 1.2, providesTakeoffCost: true,
    connxCost: null, momentConnxCost: null,
  },
  'category: nothing usable': {
    laborHours: null, providesTakeoffCost: false,
    connxCost: null, momentConnxCost: null,
  },
  'beam: fractional laborHours rounding to cents': {
    connxCost: null, momentConnxCost: null,
    connxCostProvideTO: false, momentConnxCostProvideTO: false,
    laborHours: 1.333, category: null,
  },
};

describe('getConnxCost copy A (route) vs copy B (lib) over the row matrix', () => {
  const entries = Object.entries(ROWS);
  it.each(entries.map(([name]) => name))('%s', (name) => {
    const row = ROWS[name];
    const routeFn = makeRouteGetConnxCost(SHOP_RATE);
    for (const isMoment of [false, true]) {
      const a = routeFn(row, isMoment);
      const b = makeLibConnxCost(row, SHOP_RATE)(isMoment);
      // Characterization: they CURRENTLY agree. If this ever fails, capture
      // both values and move the case to the findings list.
      expect({ impl: 'route', isMoment, value: a }).toEqual({ impl: 'route', isMoment, value: b });
    }
  });

  it('golden values across the matrix (both copies)', () => {
    const routeFn = makeRouteGetConnxCost(SHOP_RATE);
    const out = {};
    for (const [name, row] of Object.entries(ROWS)) {
      out[name] = {
        connx: routeFn(row, false),
        moment: routeFn(row, true),
      };
    }
    expect(out).toMatchSnapshot();
    // hand-checked spot values
    expect(out['beam: explicit costs']).toEqual({ connx: 120, moment: 310 });
    expect(out['beam: provide-T/O both']).toEqual({ connx: null, moment: null });
    expect(out['beam: null costs, falls to category laborHours']).toEqual({ connx: 162.5, moment: 162.5 }); // 2.5 × 65
    expect(out['beam: zero-dollar explicit cost']).toEqual({ connx: 0, moment: 0 }); // 0 is honored, not treated as missing
    expect(out['category: laborHours drives cost (WF style)']).toEqual({ connx: 113.75, moment: 113.75 });
    // FINDING #8: 1.333 × 65 = 86.645 exactly in decimal, but IEEE float
    // representation makes toFixed(2) round DOWN to 86.64 (half-cent loss).
    expect(out['beam: fractional laborHours rounding to cents']).toEqual({ connx: 86.64, moment: 86.64 });
  });

  it('FINDING #2 context: moment and non-moment cost are IDENTICAL when derived from laborHours', () => {
    // Both copies compute laborHours × rate with no moment premium — a moment
    // connection prices the same as a standard one on the laborHours path.
    const routeFn = makeRouteGetConnxCost(SHOP_RATE);
    const row = ROWS['category: laborHours drives cost (WF style)'];
    expect(routeFn(row, true)).toBe(routeFn(row, false));
  });
});

describe('size → key normalization agrees between route and lib', () => {
  const { normalizeKey, getShapeType } = fabPricingKeyFns();
  const env = routeEnv();
  it.each(['W 16 x 26', 'MC18x42.7', 'C 15 x 33.9', 'HSS 4x4x1/4', 'w12X26'])('%s', (size) => {
    expect(env.normalizeToBeamSizeKey(size)).toBe(normalizeKey(size));
    expect(env.getShapeTypeFromKey(env.normalizeToBeamSizeKey(size)))
      .toBe(getShapeType(normalizeKey(size)));
  });
});

describe('enrichOp (route): rate/weight attachment rules', () => {
  const rates = {
    drillHolesRate: 4.5, weldFilletRate: 1.25, easeRate: 12,
    straightCutCost: 999, // decoy: global rates must not read cut fields
  };
  const pricingRow = {
    straightCutCost: 18, miterCutCost: 27, doubleCopeCost: 44,
    connxCost: 120, momentConnxCost: null,
    connxCostProvideTO: false, momentConnxCostProvideTO: false,
    laborHours: null, category: { laborHours: 2 },
    connxWeightLbs: 30, momentConnxWeightLbs: 75,
  };
  const enrichOp = makeRouteEnrichOp({ rates, shopLaborRate: SHOP_RATE });

  it('global op rates apply regardless of pricing row', () => {
    expect(enrichOp({ operation: 'Drill Holes', quantity: 4, unit: 'EA' }, null))
      .toEqual({ operation: 'Drill Holes', quantity: 4, unit: 'EA', rate: 4.5 });
    expect(enrichOp({ operation: 'Welding- Fillet', quantity: 1, unit: 'EA' }, pricingRow).rate).toBe(1.25);
  });
  it('cut ops read the beam-specific field', () => {
    expect(enrichOp({ operation: 'Cut- Straight', quantity: 2, unit: 'EA' }, pricingRow).rate).toBe(18);
    expect(enrichOp({ operation: 'Cut- Miter', quantity: 1, unit: 'EA' }, pricingRow).rate).toBe(27);
  });
  it('connection ops get cost + weight; laborHours fallback for moment', () => {
    const wf = enrichOp({ operation: 'WF Connx', quantity: 2, unit: 'EA' }, pricingRow);
    expect(wf.rate).toBe(120);
    expect(wf.connWeight).toBe(30);
    const moment = enrichOp({ operation: 'WF Moment Connx', quantity: 1, unit: 'EA' }, pricingRow);
    expect(moment.rate).toBe(130); // category laborHours 2 × 65
    expect(moment.connWeight).toBe(75);
  });
  it('no pricing row → op returned untouched (no rate attached)', () => {
    const op = { operation: 'Cut- Straight', quantity: 2, unit: 'EA' };
    expect(enrichOp(op, null)).toBe(op);
  });
  it('unknown op with pricing row → untouched', () => {
    const op = { operation: 'Handling', quantity: 1, unit: 'LS' };
    expect(enrichOp(op, pricingRow)).toBe(op);
  });
});
