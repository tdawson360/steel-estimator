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
    // from `honest` — plateThickness/plateWidth, customWeight, and fab-line
    // length have no DB columns, so those lines lose their inputs across a
    // save/load round-trip (see FINDINGS.md #9).
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
