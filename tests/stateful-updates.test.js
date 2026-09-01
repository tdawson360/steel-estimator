// Characterization: state-mutating cost rules — recap totals, item-level fab,
// and material-fab totalCost rules (connections by LB, length-based ops).
// Each updater instance is used for a single call (the extracted functions
// close over a point-in-time `items`).

import { describe, it, expect } from 'vitest';
import { makeStatefulUpdaters } from './helpers/extract.js';
import { item, mat, fab, emptyRecap, id } from './helpers/fixtures.js';

const baseItems = () => {
  const m = mat({ size: 'W12x26', category: 'W Shape', pieces: 2, length: 20, priceBy: 'LB', unitPrice: 0.85 });
  m.fabrication = [
    fab({ id: 501, operation: 'WF Connx', quantity: 2, unit: 'EA', unitPrice: 85, connWeight: 30 }),
    fab({ id: 502, operation: 'Apply- Fillet Weld', quantity: 2, unit: 'IN', length: 8, unitPrice: 1.25 }),
    fab({ id: 503, operation: 'Handling', quantity: 1, unit: 'EA', unitPrice: 40 }),
  ];
  return [item({ id: 900, itemNumber: '001', materials: [m], fabrication: [fab({ id: 601, operation: 'Shop Load-out', quantity: 2, unit: 'LS', unitPrice: 175 })], recapCosts: emptyRecap() })];
};

describe('updateRecapCost', () => {
  it('cost + markup%: total = cost × (1 + markup/100)', () => {
    let u = makeStatefulUpdaters(baseItems());
    u.updateRecapCost(900, 'installation', 'cost', '2000');
    let state = u.getState();
    expect(state[0].recapCosts.installation.total).toBe(2000);

    u = makeStatefulUpdaters(state);
    u.updateRecapCost(900, 'installation', 'markup', '15');
    state = u.getState();
    expect(state[0].recapCosts.installation).toEqual({ cost: 2000, markup: 15, total: 2300 });
  });
  it('projectManagement: total = hours × rate', () => {
    let u = makeStatefulUpdaters(baseItems());
    u.updateRecapCost(900, 'projectManagement', 'hours', '8');
    let state = u.getState();
    expect(state[0].recapCosts.projectManagement.total).toBe(8 * 60);

    u = makeStatefulUpdaters(state);
    u.updateRecapCost(900, 'projectManagement', 'rate', '72.5');
    expect(u.getState()[0].recapCosts.projectManagement.total).toBe(580);
  });
  it('non-numeric input coerces to 0', () => {
    const u = makeStatefulUpdaters(baseItems());
    u.updateRecapCost(900, 'drafting', 'cost', 'abc');
    expect(u.getState()[0].recapCosts.drafting).toEqual({ cost: 0, markup: 0, total: 0 });
  });
});

describe('updateFabrication (item-level): totalCost = qty × unitPrice', () => {
  it('recomputes on quantity change', () => {
    const u = makeStatefulUpdaters(baseItems());
    u.updateFabrication(900, 601, 'quantity', 3);
    expect(u.getState()[0].fabrication[0].totalCost).toBe(525);
  });
  it('length plays no role at item level', () => {
    const u = makeStatefulUpdaters(baseItems());
    u.updateFabrication(900, 601, 'length', 10);
    expect(u.getState()[0].fabrication[0].totalCost).toBe(350); // still 2 × 175
  });
});

describe('updateMaterialFab totalCost rules', () => {
  const matId = () => baseItems()[0].materials[0].id;

  it('connection op with EA unit: qty × rate', async () => {
    const items = baseItems();
    const u = makeStatefulUpdaters(items);
    await u.updateMaterialFab(900, items[0].materials[0].id, 501, 'quantity', 3);
    const f = u.getState()[0].materials[0].fabrication.find(x => x.id === 501);
    expect(f.totalCost).toBe(255); // 3 × 85
  });

  it('connection op with LB unit: qty × connWeight × rate', async () => {
    const items = baseItems();
    const u = makeStatefulUpdaters(items);
    await u.updateMaterialFab(900, items[0].materials[0].id, 501, 'unit', 'LB');
    const f = u.getState()[0].materials[0].fabrication.find(x => x.id === 501);
    expect(f.totalCost).toBe(2 * 30 * 85); // 5100 — rate treated as $/lb after unit switch
  });

  it('length-based op (IN): qty × length × rate', async () => {
    const items = baseItems();
    const u = makeStatefulUpdaters(items);
    await u.updateMaterialFab(900, items[0].materials[0].id, 502, 'length', 12);
    const f = u.getState()[0].materials[0].fabrication.find(x => x.id === 502);
    expect(f.totalCost).toBe(2 * 12 * 1.25); // 30
  });

  it('standard op: qty × rate', async () => {
    const items = baseItems();
    const u = makeStatefulUpdaters(items);
    await u.updateMaterialFab(900, items[0].materials[0].id, 503, 'quantity', 4);
    const f = u.getState()[0].materials[0].fabrication.find(x => x.id === 503);
    expect(f.totalCost).toBe(160);
  });

  it('galvanized connection: galvWeight = qty × connWeight, galv line quantity follows', async () => {
    const items = baseItems();
    const u = makeStatefulUpdaters(items);
    await u.updateMaterialFab(900, items[0].materials[0].id, 501, 'galvanized', true);
    const fabs = u.getState()[0].materials[0].fabrication;
    const conn = fabs.find(x => x.id === 501);
    expect(conn.galvWeight).toBe(60); // 2 × 30
    const galvLine = fabs.find(x => x.isConnGalv);
    expect(galvLine).toMatchObject({ operation: 'Galvanizing', quantity: 60, unit: 'LB', parentFabId: 501 });
  });

  it('operation change applies DB pricing (stubbed) and connection defaults', async () => {
    const pricing = {
      straightCutCost: 18, connxCost: 120, connxWeightLbs: 30,
      momentConnxCost: 300, momentConnxWeightLbs: 75,
      drillHolesRate: 4.5,
    };
    const items = baseItems();
    const u = makeStatefulUpdaters(items, { pricing });
    await u.updateMaterialFab(900, items[0].materials[0].id, 503, 'operation', 'WF Connx');
    const f = u.getState()[0].materials[0].fabrication.find(x => x.id === 503);
    expect(f).toMatchObject({ operation: 'WF Connx', unitPrice: 120, connWeight: 30, quantity: 1, unit: 'EA', totalCost: 120 });
  });

  it('operation change to a global-rate op uses the rate field', async () => {
    const pricing = { drillHolesRate: 4.5 };
    const items = baseItems();
    const u = makeStatefulUpdaters(items, { pricing });
    await u.updateMaterialFab(900, items[0].materials[0].id, 503, 'operation', 'Drill Holes');
    const f = u.getState()[0].materials[0].fabrication.find(x => x.id === 503);
    expect(f.unitPrice).toBe(4.5);
    expect(f.totalCost).toBe(4.5); // qty stays 1
  });

  it('operation change with NO pricing available zeroes the rate', async () => {
    const items = baseItems();
    const u = makeStatefulUpdaters(items, { pricing: null });
    await u.updateMaterialFab(900, items[0].materials[0].id, 503, 'operation', 'Cut- Miter');
    const f = u.getState()[0].materials[0].fabrication.find(x => x.id === 503);
    expect(f.unitPrice).toBe(0);
    expect(f.totalCost).toBe(0);
  });
});
