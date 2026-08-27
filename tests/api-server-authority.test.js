// API-level characterization of the server-authority regime, against a real
// (temporary) SQLite database with auth mocked:
//   - tamper test: PUT with zeroed and inflated client totals on a priced
//     fixture stores/returns ENGINE numbers and fires the mismatch warning
//   - duplicate test: a copy of a project whose stored rows were corrupted
//     (pre-regime stale totals) is engine-correct immediately

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { recomputeEstimate } from '../lib/estimating/recompute.js';
import { DEFAULT_PRICING_RATES } from '../lib/estimating/rates.js';
import { standardFixture, mat, fab, item, recap, withGalv, id } from './helpers/fixtures.js';

const dbPath = path.join(process.cwd(), 'tests', '.tmp-api-authority.db');

vi.mock('next-auth', () => ({
  getServerSession: async () => ({ user: { id: '1', role: 'ADMIN' } }),
}));
vi.mock('../lib/auth', () => ({ authOptions: {} }));

let prisma, PUT, DUPLICATE_POST, dbProjectToEngineTree, projectId;
const { items, adjustments } = standardFixture();
const honest = recomputeEstimate({ items, adjustments, taxCategory: 'fob' }, DEFAULT_PRICING_RATES);

function putRequest(payload) {
  return { json: async () => payload };
}

const basePayload = () => ({
  projectName: 'Tamper Fixture',
  taxCategory: 'fob',
  items: JSON.parse(JSON.stringify(items)),
  adjustments: JSON.parse(JSON.stringify(adjustments)),
});

async function loadStored(id) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      adjustments: true,
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          materials: {
            orderBy: { sortOrder: 'asc' },
            include: {
              fabrication: { orderBy: { sortOrder: 'asc' } },
              children: { orderBy: { sortOrder: 'asc' }, include: { fabrication: { orderBy: { sortOrder: 'asc' } } } },
            },
          },
          fabrication: { orderBy: { sortOrder: 'asc' } },
          recapCosts: true,
        },
      },
    },
  });
}

// Assert a stored DB tree carries exactly the numbers of a recomputed result.
function expectEngineNumbers(stored, engine) {
  expect(stored.bidAmount).toBeCloseTo(engine.totals.grandTotal, 6);
  stored.items.forEach((dbItem, i) => {
    dbItem.materials.forEach((dbMat, j) => {
      const eng = engine.items[i].materials[j];
      expect(dbMat.totalCost).toBeCloseTo(eng.totalCost || 0, 6);
      expect(dbMat.stockWeight).toBeCloseTo(eng.stockWeight || 0, 6);
      expect(dbMat.fabWeight).toBeCloseTo(eng.fabWeight || 0, 6);
      dbMat.fabrication.forEach((dbFab, k) => {
        expect(dbFab.totalCost).toBeCloseTo(eng.fabrication[k].totalCost || 0, 6);
      });
    });
    dbItem.fabrication.forEach((dbFab, k) => {
      expect(dbFab.totalCost).toBeCloseTo(engine.items[i].fabrication[k].totalCost || 0, 6);
    });
    for (const rc of dbItem.recapCosts) {
      expect(rc.total).toBeCloseTo(engine.items[i].recapCosts[rc.costType]?.total || 0, 6);
    }
  });
}

beforeAll(async () => {
  try { fs.unlinkSync(dbPath); } catch {}
  process.env.DATABASE_URL = `file:${dbPath}`;
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  });

  prisma = (await import('../lib/db.js')).default;
  ({ PUT } = await import('../app/api/projects/[id]/route.js'));
  ({ POST: DUPLICATE_POST } = await import('../app/api/dashboard/projects/[id]/duplicate/route.js'));
  ({ dbProjectToEngineTree } = await import('../lib/recompute-server.js'));

  await prisma.user.create({ data: { id: 1, email: 'test@bergeriron.local', role: 'ADMIN', password: 'x' } });
  const project = await prisma.project.create({ data: { createdById: 1, projectName: 'Tamper Fixture' } });
  projectId = project.id;
}, 120000);

afterAll(async () => {
  await prisma?.$disconnect();
  try { fs.unlinkSync(dbPath); } catch {}
});

describe('tamper test: PUT persists engine numbers, never client assertions', () => {
  it('zeroed client totals are stored as engine numbers and the warning fires', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = basePayload();
    payload.bidAmount = 0;
    for (const item of payload.items) {
      for (const m of item.materials) { m.totalCost = 0; m.stockWeight = 0; m.fabWeight = 0; }
    }

    const res = await PUT(putRequest(payload), { params: { id: String(projectId) } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serverTotals.grandTotal).toBeCloseTo(honest.totals.grandTotal, 6);
    expect(body.bidAmount).toBeCloseTo(honest.totals.grandTotal, 6);

    expectEngineNumbers(await loadStored(projectId), honest);

    const mismatchCalls = warn.mock.calls.filter(c => c[0] === '[TOTALS-MISMATCH]');
    expect(mismatchCalls.length).toBeGreaterThan(0);
    const entry = JSON.parse(mismatchCalls[0][1]);
    expect(entry.projectId).toBe(projectId);
    expect(entry.diffs.some(d => d.field === 'bidAmount')).toBe(true);
    expect(entry.diffs.some(d => d.field === 'material.totalCost')).toBe(true);
    warn.mockRestore();
  });

  it('inflated client totals are also corrected and reported', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = basePayload();
    payload.bidAmount = 9999999;
    payload.items[0].materials[0].totalCost = 888888;
    payload.items[0].fabrication[0].totalCost = 77777;

    const res = await PUT(putRequest(payload), { params: { id: String(projectId) } });
    expect(res.status).toBe(200);

    expectEngineNumbers(await loadStored(projectId), honest);

    const mismatchCalls = warn.mock.calls.filter(c => c[0] === '[TOTALS-MISMATCH]');
    expect(mismatchCalls.length).toBeGreaterThan(0);
    const entry = JSON.parse(mismatchCalls[0][1]);
    expect(entry.diffs.some(d => d.field === 'bidAmount' && d.client === 9999999)).toBe(true);
    expect(entry.diffs.some(d => d.field === 'itemFab.totalCost')).toBe(true);
    warn.mockRestore();
  });

  it('an honest save produces no mismatch warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = basePayload();
    payload.bidAmount = honest.totals.grandTotal;

    const res = await PUT(putRequest(payload), { params: { id: String(projectId) } });
    expect(res.status).toBe(200);

    expect(warn.mock.calls.filter(c => c[0] === '[TOTALS-MISMATCH]')).toEqual([]);
    warn.mockRestore();
  });
});

describe('FINDINGS #9 fix: length-based fab lines survive persistence', () => {
  it('an IN-unit fab line round-trips its length and stays qty × len × rate', async () => {
    const beam = mat({ size: 'W16x26', category: 'W Shape', pieces: 2, length: 24, priceBy: 'LB', unitPrice: 0.85 });
    beam.fabrication = [
      fab({ operation: 'Welding- Fillet', quantity: 3, unit: 'IN', length: 12, unitPrice: 1.5 }), // 3 × 12 × 1.5 = 54
    ];
    const payload = {
      projectName: 'Length Fixture',
      taxCategory: 'fob',
      items: [item({ itemNumber: '001', itemName: 'LENGTH', materials: [beam] })],
      adjustments: [],
    };
    const engine = recomputeEstimate({ items: payload.items, adjustments: [], taxCategory: 'fob' }, DEFAULT_PRICING_RATES);

    const project = await prisma.project.create({ data: { createdById: 1, projectName: 'Length Fixture' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await PUT(
      putRequest({ ...payload, bidAmount: engine.totals.grandTotal }),
      { params: { id: String(project.id) } }
    );
    expect(res.status).toBe(200);
    expect(warn.mock.calls.filter(c => c[0] === '[TOTALS-MISMATCH]')).toEqual([]);
    warn.mockRestore();

    // The length column persisted, and the stored total is the length-based one
    const stored = await loadStored(project.id);
    const storedFab = stored.items[0].materials[0].fabrication[0];
    expect(storedFab.length).toBe(12);
    expect(storedFab.totalCost).toBeCloseTo(54, 6);

    // Recomputing over the DB tree reproduces the same number — the
    // save/load round-trip is no longer lossy for length-based lines.
    const reloaded = recomputeEstimate(dbProjectToEngineTree(stored), DEFAULT_PRICING_RATES);
    expect(reloaded.items[0].materials[0].fabrication[0].totalCost).toBeCloseTo(54, 6);
  });
});

describe('labor groups: PUT persistence round-trip', () => {
  // Two W12 beams with a cope group (temp id). Member rates deliberately
  // stale — the group rate must drive the persisted totals.
  function groupedPayload(tempGroupId) {
    const beamA = mat({ size: 'W12x26', category: 'W Shape', pieces: 2, length: 30, priceBy: 'LB', unitPrice: 0.85 });
    beamA.fabrication = [
      fab({ operation: 'Cut- Single Cope End', quantity: 2, unit: 'EA', unitPrice: 8.5, laborGroupId: tempGroupId }),
      fab({ operation: 'Drill Holes', quantity: 4, unit: 'EA', unitPrice: 2.5 }),
    ];
    const beamB = mat({ size: 'W12x14', category: 'W Shape', pieces: 1, length: 22, priceBy: 'LB', unitPrice: 0.85 });
    beamB.fabrication = [
      fab({ operation: 'Cut- Single Cope End', quantity: 1, unit: 'EA', unitPrice: 8.5, laborGroupId: tempGroupId }),
    ];
    return {
      projectName: 'Group Fixture',
      taxCategory: 'fob',
      items: [item({
        itemNumber: '001', itemName: 'GROUPED',
        materials: [beamA, beamB],
        laborGroups: [{
          id: tempGroupId, operation: 'Cut- Single Cope End', familyKey: 'W12',
          unit: 'EA', rate: 8.5, collapsed: true, colorIndex: 3,
        }],
      })],
      adjustments: [],
    };
  }

  async function loadWithGroups(id) {
    return prisma.project.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            laborGroups: { orderBy: { sortOrder: 'asc' } },
            materials: {
              orderBy: { sortOrder: 'asc' },
              include: { fabrication: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    });
  }

  let groupProjectId;

  it('creates the group, links member fabs, and persists group-rate totals', async () => {
    const tempGroupId = Date.now() + Math.random();
    const payload = groupedPayload(tempGroupId);
    const engine = recomputeEstimate({ items: payload.items, adjustments: [], taxCategory: 'fob' }, DEFAULT_PRICING_RATES);

    const project = await prisma.project.create({ data: { createdById: 1, projectName: 'Group Fixture' } });
    groupProjectId = project.id;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await PUT(
      putRequest({ ...payload, bidAmount: engine.totals.grandTotal }),
      { params: { id: String(project.id) } }
    );
    expect(res.status).toBe(200);
    expect(warn.mock.calls.filter(c => c[0] === '[TOTALS-MISMATCH]')).toEqual([]);
    warn.mockRestore();

    // Response carries the created group and remapped fab references
    const body = await res.json();
    const savedGroup = body.items[0].laborGroups[0];
    expect(typeof savedGroup.id).toBe('number');
    expect(savedGroup.operation).toBe('Cut- Single Cope End');
    expect(savedGroup.familyKey).toBe('W12');
    expect(savedGroup.rate).toBe(8.5);
    expect(savedGroup.collapsed).toBe(true);
    expect(savedGroup.colorIndex).toBe(3);

    const stored = await loadWithGroups(project.id);
    const dbGroup = stored.items[0].laborGroups[0];
    expect(stored.items[0].materials[0].fabrication[0].laborGroupId).toBe(dbGroup.id);
    expect(stored.items[0].materials[1].fabrication[0].laborGroupId).toBe(dbGroup.id);
    expect(stored.items[0].materials[0].fabrication[1].laborGroupId).toBe(null);
    // Grouped line totals persisted at the group rate
    expect(stored.items[0].materials[0].fabrication[0].totalCost).toBeCloseTo(2 * 8.5, 6);
    expect(stored.items[0].materials[1].fabrication[0].totalCost).toBeCloseTo(1 * 8.5, 6);
  });

  it('a group-rate change re-persists member totals at the new rate, no drift', async () => {
    const stored = await loadWithGroups(groupProjectId);
    const tree = dbProjectToEngineTree(stored);
    // Client edits the group rate and stamps members (what updateLaborGroupRate does)
    tree.items[0].laborGroups[0].rate = 10;
    for (const m of tree.items[0].materials) {
      for (const f of m.fabrication) {
        if (f.laborGroupId != null) {
          f.unitPrice = 10; f.rate = 10;
          f.totalCost = (f.quantity || 0) * 10;
        }
      }
    }
    const engine = recomputeEstimate(tree, DEFAULT_PRICING_RATES);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await PUT(
      putRequest({ projectName: 'Group Fixture', taxCategory: 'fob', items: tree.items, adjustments: [], bidAmount: engine.totals.grandTotal }),
      { params: { id: String(groupProjectId) } }
    );
    expect(res.status).toBe(200);
    expect(warn.mock.calls.filter(c => c[0] === '[TOTALS-MISMATCH]')).toEqual([]);
    warn.mockRestore();

    const after = await loadWithGroups(groupProjectId);
    expect(after.items[0].laborGroups[0].rate).toBe(10);
    expect(after.items[0].materials[0].fabrication[0].totalCost).toBeCloseTo(2 * 10, 6);
    expect(after.items[0].materials[1].fabrication[0].totalCost).toBeCloseTo(1 * 10, 6);
  });

  it('dissolving the group deletes its row and nulls member references', async () => {
    const stored = await loadWithGroups(groupProjectId);
    const tree = dbProjectToEngineTree(stored);
    tree.items[0].laborGroups = [];
    // Rows keep their (stamped) rates — dissolve leaves pricing in place
    const engine = recomputeEstimate(tree, DEFAULT_PRICING_RATES);

    const res = await PUT(
      putRequest({ projectName: 'Group Fixture', taxCategory: 'fob', items: tree.items, adjustments: [], bidAmount: engine.totals.grandTotal }),
      { params: { id: String(groupProjectId) } }
    );
    expect(res.status).toBe(200);

    const after = await loadWithGroups(groupProjectId);
    expect(after.items[0].laborGroups).toEqual([]);
    for (const m of after.items[0].materials) {
      for (const f of m.fabrication) expect(f.laborGroupId).toBe(null);
    }
    // Rates survived the dissolve
    expect(after.items[0].materials[0].fabrication[0].rate).toBe(10);
  });

  it('deleting an item that has groups does not FK-fail', async () => {
    const tempGroupId = Date.now() + Math.random();
    const payload = groupedPayload(tempGroupId);
    const project = await prisma.project.create({ data: { createdById: 1, projectName: 'Group Delete Fixture' } });
    let res = await PUT(putRequest(payload), { params: { id: String(project.id) } });
    expect(res.status).toBe(200);

    // Save again with the item removed entirely
    res = await PUT(
      putRequest({ projectName: 'Group Delete Fixture', taxCategory: 'fob', items: [], adjustments: [] }),
      { params: { id: String(project.id) } }
    );
    expect(res.status).toBe(200);
    const remaining = await prisma.laborGroup.findMany({ where: { item: { projectId: project.id } } });
    expect(remaining).toEqual([]);
  });

  it('duplicating a grouped project carries groups and membership', async () => {
    const tempGroupId = Date.now() + Math.random();
    const payload = groupedPayload(tempGroupId);
    const engine = recomputeEstimate({ items: payload.items, adjustments: [], taxCategory: 'fob' }, DEFAULT_PRICING_RATES);
    const project = await prisma.project.create({ data: { createdById: 1, projectName: 'Group Dup Fixture' } });
    const putRes = await PUT(
      putRequest({ ...payload, bidAmount: engine.totals.grandTotal }),
      { params: { id: String(project.id) } }
    );
    expect(putRes.status).toBe(200);

    const res = await DUPLICATE_POST({}, { params: { id: String(project.id) } });
    expect(res.status).toBe(201);
    const { id: copyId } = await res.json();

    const copy = await loadWithGroups(copyId);
    const copyGroup = copy.items[0].laborGroups[0];
    expect(copyGroup.operation).toBe('Cut- Single Cope End');
    expect(copyGroup.rate).toBe(8.5);
    expect(copy.items[0].materials[0].fabrication[0].laborGroupId).toBe(copyGroup.id);
    expect(copy.items[0].materials[1].fabrication[0].laborGroupId).toBe(copyGroup.id);
  });
});

describe('duplicate test: the copy is engine-correct immediately', () => {
  it('duplicating a project with corrupted stored totals yields engine-over-DB-tree numbers', async () => {
    // Simulate a pre-regime project: corrupt stored rows directly in the DB
    const stored = await loadStored(projectId);
    await prisma.material.update({
      where: { id: stored.items[0].materials[0].id },
      data: { totalCost: 0, stockWeight: 0 },
    });
    await prisma.project.update({ where: { id: projectId }, data: { bidAmount: 12345 } });

    // The copy's expected numbers: the engine over the SAVED tree (what the
    // client would compute after loading this project). Note this differs
    // from `honest` — plateThickness/plateWidth and customWeight have no DB
    // columns, so those lines lose their inputs across a save/load
    // round-trip (see FINDINGS.md #9; fab-line length DOES persist now).
    const expected = recomputeEstimate(dbProjectToEngineTree(await loadStored(projectId)), DEFAULT_PRICING_RATES);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await DUPLICATE_POST({}, { params: { id: String(projectId) } });
    expect(res.status).toBe(201);
    const { id: copyId } = await res.json();

    expectEngineNumbers(await loadStored(copyId), expected);

    // The stale original values were reported as drift
    const mismatchCalls = warn.mock.calls.filter(c => c[0] === '[TOTALS-MISMATCH]');
    expect(mismatchCalls.length).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it('duplicating an authoritative round-trip-stable project copies exact numbers with no mismatch', async () => {
    // Build a project from lines whose engine inputs all survive DB
    // persistence: AISC shapes (LB/LF/CWT/EA), an auto-galv line, connection
    // ops with connWeight, LS item fab, recap costs, adjustments. No plates
    // with dims, no customWeight, no length-based fab lines (FINDINGS.md #9).
    const beam = mat({ size: 'W12x26', category: 'W Shape', pieces: 4, length: 32, priceBy: 'LB', unitPrice: 0.85 });
    beam.fabrication = [fab({ operation: 'WF Connx', quantity: 2, unit: 'EA', unitPrice: 85, connWeight: 30 })];
    const stable = {
      projectName: 'Stable Fixture',
      taxCategory: 'fob',
      items: [item({
        itemNumber: '001', itemName: 'STABLE', materialMarkup: 12, fabMarkup: 8,
        materials: [
          beam,
          mat({ size: 'C15x33.9', category: 'Channel', pieces: 3, length: 17.67, priceBy: 'LF', unitPrice: 34.25 }),
          mat({ size: 'W18x35', category: 'W Shape', pieces: 2, length: 28.08, priceBy: 'CWT', unitPrice: 47.85 }),
          withGalv(mat({ size: 'W16x26', category: 'W Shape', pieces: 2, length: 24, priceBy: 'LB', unitPrice: 0.85 }), 0.28),
          mat({ size: 'L3x3x1/4', category: 'Angle', pieces: 6, length: 10, priceBy: 'EA', unitPrice: 45 }),
        ],
        fabrication: [fab({ operation: 'Handling', quantity: 1, unit: 'LS', unitPrice: 250 })],
        recapCosts: recap({ installation: [1000, 10], pm: [8, 60] }),
      })],
      adjustments: [{ id: id(), description: 'adj', amount: -250 }],
    };
    const stableEngine = recomputeEstimate(
      { items: stable.items, adjustments: stable.adjustments, taxCategory: 'fob' },
      DEFAULT_PRICING_RATES
    );

    const project2 = await prisma.project.create({ data: { createdById: 1, projectName: 'Stable Fixture' } });
    const putRes = await PUT(
      putRequest({ ...stable, bidAmount: stableEngine.totals.grandTotal }),
      { params: { id: String(project2.id) } }
    );
    expect(putRes.status).toBe(200);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await DUPLICATE_POST({}, { params: { id: String(project2.id) } });
    expect(res.status).toBe(201);
    const { id: copyId } = await res.json();

    // Copy carries the exact engine numbers and produced no drift warning
    expectEngineNumbers(await loadStored(copyId), stableEngine);
    expect(warn.mock.calls.filter(c => c[0] === '[TOTALS-MISMATCH]')).toEqual([]);
    warn.mockRestore();
  });
});
