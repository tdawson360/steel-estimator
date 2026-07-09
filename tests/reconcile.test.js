// Client save-reconcile: server IDs and server-authoritative numbers are
// applied to state; steady-state merges preserve object identity so the
// autosave effect does not re-fire.

import { describe, it, expect } from 'vitest';
import { serverIdMap, applyIdMap, reconcileItems } from '../lib/estimating/reconcile.js';

const clientItems = () => ([
  {
    id: 1719500000000.42, // temp ID (new item this save)
    itemNumber: '001',
    breakoutGroupId: 1719500000001.7, // temp breakout group reference
    recapCosts: {
      installation: { cost: 100, markup: 10, total: 110 },
      drafting: { cost: 0, markup: 0, total: 0 },
    },
    materials: [
      {
        id: 1719500000002.9, // temp
        size: 'W8X10', totalCost: 500, stockWeight: 200, fabWeight: 180,
        fabrication: [
          { id: 1719500000003.1, operation: 'Galvanizing', quantity: 180, totalCost: 63, isAutoGalv: true },
        ],
        children: [],
      },
    ],
    fabrication: [{ id: 1719500000004.5, operation: 'Handling', quantity: 1, totalCost: 25 }],
    snapshots: [],
  },
]);

// PUT response tree (DB shape: ints, sortOrder order, recapCosts as rows)
const savedItems = () => ([
  {
    id: 41,
    itemNumber: '001',
    breakoutGroupId: 7,
    recapCosts: [
      { costType: 'installation', total: 110 },
      { costType: 'drafting', total: 0 },
    ],
    materials: [
      {
        id: 90, totalCost: 512.34, stockWeight: 205, fabWeight: 180,
        fabrication: [{ id: 300, operation: 'Galvanizing', quantity: 180, totalCost: 63 }],
        children: [],
      },
    ],
    fabrication: [{ id: 400, operation: 'Handling', quantity: 1, totalCost: 25 }],
    snapshots: [],
  },
]);

describe('serverIdMap / applyIdMap', () => {
  it('maps existing IDs to themselves and temp IDs positionally onto created rows', () => {
    const list = [{ id: 3, name: 'a' }, { id: 1719500000001.7, name: 'b' }, { id: 1719500000009.2, name: 'c' }];
    const saved = [{ id: 3, name: 'a' }, { id: 7, name: 'b' }, { id: 8, name: 'c' }];
    const map = serverIdMap(list, saved);
    expect(map.get(3)).toBe(3);
    expect(map.get(1719500000001.7)).toBe(7);
    expect(map.get(1719500000009.2)).toBe(8);
    const applied = applyIdMap(list, map);
    expect(applied.map(e => e.id)).toEqual([3, 7, 8]);
    expect(applied[0]).toBe(list[0]); // untouched entry keeps identity
  });

  it('is identity-preserving when all IDs already match', () => {
    const list = [{ id: 3 }, { id: 7 }];
    const map = serverIdMap(list, [{ id: 3 }, { id: 7 }]);
    expect(applyIdMap(list, map)).toBe(list);
  });
});

describe('reconcileItems', () => {
  it('applies server IDs, server numbers, and remapped breakout references', () => {
    const items = clientItems();
    const bgMap = new Map([[1719500000001.7, 7]]);
    const merged = reconcileItems(items, savedItems(), bgMap);

    expect(merged).not.toBe(items);
    expect(merged[0].id).toBe(41);
    expect(merged[0].breakoutGroupId).toBe(7);
    expect(merged[0].materials[0].id).toBe(90);
    expect(merged[0].materials[0].totalCost).toBe(512.34); // server number wins
    expect(merged[0].materials[0].stockWeight).toBe(205);
    expect(merged[0].materials[0].fabrication[0].id).toBe(300);
    expect(merged[0].fabrication[0].id).toBe(400);
    expect(merged[0].recapCosts.installation.total).toBe(110);
    // input fields untouched
    expect(merged[0].materials[0].size).toBe('W8X10');
    expect(merged[0].recapCosts.installation.cost).toBe(100);
  });

  it('returns the SAME references when state already matches the server (steady state)', () => {
    const items = clientItems();
    const bgMap = new Map([[1719500000001.7, 7]]);
    const once = reconcileItems(items, savedItems(), bgMap);
    // Second save of reconciled state returns the same response → no-op merge
    const twice = reconcileItems(once, savedItems(), bgMap);
    expect(twice).toBe(once);
    expect(twice[0]).toBe(once[0]);
    expect(twice[0].materials).toBe(once[0].materials);
  });

  it('leaves rows without a server counterpart untouched', () => {
    const items = clientItems();
    const merged = reconcileItems(items, [], new Map());
    expect(merged).toBe(items);
  });
});
