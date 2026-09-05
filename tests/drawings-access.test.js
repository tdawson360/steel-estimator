import { describe, it, expect } from 'vitest';
import { canManageDrawings, canViewDrawingSet } from '../lib/drawings/access.js';

describe('drawings access', () => {
  const admin = { role: 'ADMIN' };
  const est = { role: 'ESTIMATOR' };
  const pm = { role: 'PM' };
  const shop = { role: 'FIELD_SHOP' };

  it('only admins and estimators manage drawings', () => {
    expect(canManageDrawings(admin)).toBe(true);
    expect(canManageDrawings(est)).toBe(true);
    expect(canManageDrawings(pm)).toBe(false);
    expect(canManageDrawings(shop)).toBe(false);
    expect(canManageDrawings(null)).toBe(false);
  });

  it('PM and shop see a set only through a published project', () => {
    const prospect = { project: null };
    const draft = { project: { status: 'DRAFT' } };
    const published = { project: { status: 'PUBLISHED' } };
    expect(canViewDrawingSet(pm, prospect)).toBe(false);
    expect(canViewDrawingSet(pm, draft)).toBe(false);
    expect(canViewDrawingSet(pm, published)).toBe(true);
    expect(canViewDrawingSet(shop, published)).toBe(true);
    expect(canViewDrawingSet(est, prospect)).toBe(true);
    expect(canViewDrawingSet(admin, draft)).toBe(true);
  });
});
