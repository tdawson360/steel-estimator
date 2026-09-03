'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import prisma from '../../../lib/db';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'ADMIN') throw new Error('Unauthorized');
  return session.user;
}

export async function updatePricingRates(data) {
  const user = await requireAdmin();
  await prisma.pricingRates.update({
    where: { id: 1 },
    data: { ...data, updatedBy: user.id },
  });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

export async function updateConnectionCategory(id, data) {
  await requireAdmin();
  await prisma.connectionCategory.update({ where: { id }, data });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

export async function getBeamBySize(beamSize) {
  await requireAdmin();
  return prisma.beamConnectionData.findUnique({
    where: { beamSize: beamSize.trim().toUpperCase() },
    include: { category: true },
  });
}

export async function updateBeamOverride(beamSize, data) {
  await requireAdmin();
  await prisma.beamConnectionData.update({
    where: { beamSize: beamSize.trim().toUpperCase() },
    data,
  });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

// ── Connx Template sync ──────────────────────────────────────────────────────
// Bolted/Welded per-each prices come from linked items in a template project
// ("Connx Template"): the item's shop total (materials + fabrication, no recap)
// IS the all-in price for one connection. Sync is snapshot-based: prices are
// stamped onto the category rows with provenance, never read live.

const SYNC_OPS = ['WF Bolted', 'WF Welded', 'C Bolted', 'C Welded'];
const OP_COST_FIELD = {
  'WF Bolted': 'boltedConnxCost', 'C Bolted': 'boltedConnxCost',
  'WF Welded': 'weldedConnxCost', 'C Welded': 'weldedConnxCost',
};

// Shop total of a template item: everything the shop does, nothing from recap.
function templateItemTotal(item) {
  let total = 0;
  for (const fab of item.fabrication) total += fab.totalCost || 0;
  for (const mat of item.materials) {
    total += mat.totalCost || 0;
    for (const fab of mat.fabrication) total += fab.totalCost || 0;
    for (const child of mat.children) {
      total += child.totalCost || 0;
      for (const fab of child.fabrication) total += fab.totalCost || 0;
    }
  }
  return parseFloat(total.toFixed(2));
}

const TEMPLATE_ITEM_INCLUDE = {
  fabrication: true,
  materials: { include: { fabrication: true, children: { include: { fabrication: true } } } },
};

// List template-project items for the link picker (with computed shop totals).
export async function getTemplateItems() {
  await requireAdmin();
  const projects = await prisma.project.findMany({
    where: { isTemplate: true },
    include: { items: { include: TEMPLATE_ITEM_INCLUDE, orderBy: { sortOrder: 'asc' } } },
  });
  return projects.flatMap(p => p.items.map(item => ({
    id: item.id,
    projectId: p.id,
    projectName: p.projectName,
    itemNumber: item.itemNumber,
    itemName: item.itemName,
    total: templateItemTotal(item),
  })));
}

// Link (or unlink with itemId=null) a template item to a category's price column.
export async function linkTemplateItem(categoryId, kind, itemId) {
  await requireAdmin();
  if (kind !== 'bolted' && kind !== 'welded') throw new Error('kind must be bolted or welded');
  await prisma.connectionCategory.update({
    where: { id: categoryId },
    data: { [`${kind}TemplateItemId`]: itemId ?? null },
  });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

// Resolve which category a stored fab row's beam size belongs to.
// Mirrors getFabPricingForSize: exact beam match first, then shapesIncluded prefix.
function buildCategoryResolver(beams, categories) {
  const beamToCategory = new Map(beams.map(b => [b.beamSize, b.categoryId]));
  const prefixToCategory = new Map();
  for (const cat of categories) {
    for (const p of cat.shapesIncluded.split(',').map(s => s.trim()).filter(Boolean)) {
      prefixToCategory.set(p, cat.id);
    }
  }
  return (rawSize) => {
    if (!rawSize) return null;
    const key = rawSize.replace(/\s+/g, '').replace(/x/g, 'X').toUpperCase();
    if (beamToCategory.has(key)) return beamToCategory.get(key);
    const m = key.match(/^(MC\d+|W\d+|C\d+)/);
    return m ? (prefixToCategory.get(m[1]) ?? null) : null;
  };
}

// Load the estimate fab rows a sync would touch. Grouped rows are excluded —
// their rate belongs to their labor group, not the category table.
async function loadSyncableFabRows(statuses) {
  return prisma.materialFabrication.findMany({
    where: {
      operation: { in: SYNC_OPS },
      laborGroupId: null,
      material: { item: { project: { isTemplate: false, status: { in: statuses } } } },
    },
    include: {
      material: {
        select: { shape: true, item: { select: { project: { select: { id: true, status: true } } } } },
      },
    },
  });
}

// Preview: per-category old→new prices from linked template items, plus how
// many estimate rows each status bucket would reprice.
export async function previewTemplateSync() {
  await requireAdmin();
  const [categories, beams] = await Promise.all([
    prisma.connectionCategory.findMany(),
    prisma.beamConnectionData.findMany({ select: { beamSize: true, categoryId: true } }),
  ]);

  const linkedIds = categories
    .flatMap(c => [c.boltedTemplateItemId, c.weldedTemplateItemId])
    .filter(id => id != null);
  const items = linkedIds.length
    ? await prisma.item.findMany({ where: { id: { in: linkedIds } }, include: TEMPLATE_ITEM_INCLUDE })
    : [];
  const itemById = new Map(items.map(i => [i.id, i]));

  const rows = [];
  const nextCost = new Map(); // categoryId → { boltedConnxCost?, weldedConnxCost? }
  for (const cat of categories) {
    const row = { categoryId: cat.id, name: cat.name, shapeType: cat.shapeType };
    for (const kind of ['bolted', 'welded']) {
      const itemId = cat[`${kind}TemplateItemId`];
      const item = itemId != null ? itemById.get(itemId) : null;
      if (!item) continue;
      const next = templateItemTotal(item);
      const current = cat[`${kind}ConnxCost`];
      row[kind] = { itemName: item.itemName, current, next, changed: current == null || Math.abs(current - next) > 0.005 };
      if (!nextCost.has(cat.id)) nextCost.set(cat.id, {});
      nextCost.get(cat.id)[`${kind}ConnxCost`] = next;
    }
    if (row.bolted || row.welded) rows.push(row);
  }

  // Count estimate rows that would actually change, per status bucket.
  const fabRows = await loadSyncableFabRows(['DRAFT', 'REOPENED', 'IN_REVIEW']);
  const resolveCategory = buildCategoryResolver(beams, categories);
  const counts = { DRAFT: { rows: 0, projects: new Set() }, REOPENED: { rows: 0, projects: new Set() }, IN_REVIEW: { rows: 0, projects: new Set() } };
  for (const fab of fabRows) {
    const catId = resolveCategory(fab.material.shape);
    const next = catId != null ? nextCost.get(catId)?.[OP_COST_FIELD[fab.operation]] : undefined;
    if (next == null || Math.abs((fab.rate || 0) - next) <= 0.005) continue;
    const { id, status } = fab.material.item.project;
    counts[status].rows++;
    counts[status].projects.add(id);
  }

  return {
    rows,
    affected: Object.fromEntries(
      Object.entries(counts).map(([s, c]) => [s, { rows: c.rows, projects: c.projects.size }])
    ),
  };
}

// Apply: stamp the new prices on category rows, then reprice matching fab rows
// on live estimates. DRAFT and REOPENED always; IN_REVIEW only when opted in;
// PUBLISHED never (that's the record of what was quoted). Row totals update
// here; item/bid roll-ups refresh on the project's next open/save.
export async function applyTemplateSync({ includeInReview = false } = {}) {
  const user = await requireAdmin();
  const preview = await previewTemplateSync();
  const now = new Date();

  const [categories, beams] = await Promise.all([
    prisma.connectionCategory.findMany(),
    prisma.beamConnectionData.findMany({ select: { beamSize: true, categoryId: true } }),
  ]);
  const catById = new Map(categories.map(c => [c.id, c]));

  // 1. Stamp category prices + provenance
  const nextCost = new Map();
  for (const row of preview.rows) {
    const data = {};
    if (row.bolted) { data.boltedConnxCost = row.bolted.next; data.boltedSyncedAt = now; }
    if (row.welded) { data.weldedConnxCost = row.welded.next; data.weldedSyncedAt = now; }
    nextCost.set(row.categoryId, data);
    await prisma.connectionCategory.update({ where: { id: row.categoryId }, data });
  }

  // 2. Reprice live-estimate fab rows
  const statuses = includeInReview ? ['DRAFT', 'REOPENED', 'IN_REVIEW'] : ['DRAFT', 'REOPENED'];
  const fabRows = await loadSyncableFabRows(statuses);
  const resolveCategory = buildCategoryResolver(beams, categories);
  let updatedRows = 0;
  const touchedProjects = new Set();
  for (const fab of fabRows) {
    const catId = resolveCategory(fab.material.shape);
    const costField = OP_COST_FIELD[fab.operation];
    const next = catId != null
      ? (nextCost.get(catId)?.[costField] ?? catById.get(catId)?.[costField])
      : null;
    if (next == null || Math.abs((fab.rate || 0) - next) <= 0.005) continue;
    await prisma.materialFabrication.update({
      where: { id: fab.id },
      data: { rate: next, totalCost: parseFloat(((fab.quantity || 0) * next).toFixed(2)) },
    });
    updatedRows++;
    touchedProjects.add(fab.material.item.project.id);
  }

  // Repriced estimates changed underneath anyone who has them open: bump the
  // content version so their next autosave is refused with a reload prompt
  // instead of silently writing the stale rates back.
  if (touchedProjects.size > 0) {
    await prisma.project.updateMany({
      where: { id: { in: [...touchedProjects] } },
      data: { version: { increment: 1 }, lastSavedById: Number(user.id), lastSavedAt: now },
    });
  }

  revalidatePath('/admin/connection-pricing');
  return { success: true, categoriesUpdated: preview.rows.length, updatedRows, projectsTouched: touchedProjects.size, syncedBy: user.id };
}

export async function createCustomOp({ name, category, defaultUnit, rate }) {
  await requireAdmin();
  const op = await prisma.customFabOperation.create({
    data: { name: name.trim(), category, defaultUnit, rate: parseFloat(rate) || 0 },
  });
  revalidatePath('/admin/connection-pricing');
  return op;
}

export async function updateCustomOp(id, data) {
  await requireAdmin();
  await prisma.customFabOperation.update({ where: { id }, data });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

// ── Galvanizing rate classes ────────────────────────────────────────────────
export async function updateGalvClass(id, data) {
  await requireAdmin();
  const patch = {};
  if (typeof data?.name === 'string' && data.name.trim()) patch.name = data.name.trim();
  if (data?.ratePerCwt != null && Number.isFinite(Number(data.ratePerCwt))) patch.ratePerCwt = Math.max(0, Number(data.ratePerCwt));
  if (typeof data?.active === 'boolean') patch.active = data.active;
  if (Object.keys(patch).length === 0) return { success: false };
  await prisma.galvRateClass.update({ where: { id: Number(id) }, data: patch });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

export async function updateGalvMinimum(value) {
  const user = await requireAdmin();
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) throw new Error('Invalid minimum');
  await prisma.pricingRates.update({ where: { id: 1 }, data: { galvMinimumCharge: v, updatedBy: user.id } });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

// ── Hardware catalog (lib/hardware.js) ──────────────────────────────────────
const HW_KINDS = new Set(['BOLT_SET', 'EXPANSION_ANCHOR', 'ADHESIVE_ANCHOR', 'ADHESIVE']);
const HW_FINISHES = new Set(['Plain', 'Zinc', 'HDG', 'SS']);
const HW_NUM_FIELDS = ['unitPrice', 'weightEach', 'bitDiaIn', 'embedMinIn', 'embedMaxIn', 'cartridgeMl', 'sortOrder', 'diameterIn', 'lengthIn'];

// Validate an admin payload into Prisma data. `partial` = update (only the
// fields present are returned); create requires kind + family.
function cleanHardware(data, { partial = false } = {}) {
  const out = {};
  if (data?.kind !== undefined || !partial) {
    if (!HW_KINDS.has(data?.kind)) throw new Error('Invalid hardware kind');
    out.kind = data.kind;
  }
  if (data?.family !== undefined || !partial) {
    const fam = String(data?.family ?? '').trim();
    if (!fam) throw new Error('Family is required');
    out.family = fam;
  }
  for (const f of ['name', 'diameter', 'length']) {
    if (data?.[f] !== undefined) out[f] = String(data[f]).trim();
  }
  if (data?.finish !== undefined) {
    if (!HW_FINISHES.has(data.finish)) throw new Error('Invalid finish');
    out.finish = data.finish;
  }
  for (const f of HW_NUM_FIELDS) {
    if (data?.[f] === undefined) continue;
    if (data[f] === null || data[f] === '') { out[f] = f === 'sortOrder' ? 0 : (['unitPrice', 'weightEach', 'diameterIn', 'lengthIn'].includes(f) ? 0 : null); continue; }
    const n = Number(data[f]);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${f}`);
    out[f] = n;
  }
  if (data?.adhesiveId !== undefined) out.adhesiveId = data.adhesiveId == null || data.adhesiveId === '' ? null : Number(data.adhesiveId);
  for (const f of ['isDefault', 'active']) {
    if (typeof data?.[f] === 'boolean') out[f] = data[f];
  }
  return out;
}

// One default per family: flagging an item clears its siblings.
async function clearFamilyDefault(tx, family, keepId) {
  await tx.hardwareItem.updateMany({
    where: { family, isDefault: true, ...(keepId ? { id: { not: keepId } } : {}) },
    data: { isDefault: false },
  });
}

export async function createHardwareItem(data) {
  await requireAdmin();
  const clean = cleanHardware(data);
  if (clean.adhesiveId != null) {
    const adhesive = await prisma.hardwareItem.findUnique({ where: { id: clean.adhesiveId } });
    if (!adhesive || adhesive.kind !== 'ADHESIVE') throw new Error('Adhesive must be an ADHESIVE catalog item');
  }
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.hardwareItem.create({ data: clean });
    if (created.isDefault) await clearFamilyDefault(tx, created.family, created.id);
    return created;
  });
  revalidatePath('/admin/connection-pricing');
  return item;
}

export async function updateHardwareItem(id, data) {
  await requireAdmin();
  const patch = cleanHardware(data, { partial: true });
  if (Object.keys(patch).length === 0) return { success: false };
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.hardwareItem.update({ where: { id: Number(id) }, data: patch });
    if (patch.isDefault === true) await clearFamilyDefault(tx, updated.family, updated.id);
    return updated;
  });
  revalidatePath('/admin/connection-pricing');
  return item;
}

export async function deleteHardwareItem(id) {
  await requireAdmin();
  const itemId = Number(id);
  const anchors = await prisma.hardwareItem.count({ where: { adhesiveId: itemId } });
  if (anchors > 0) throw new Error(`${anchors} anchor rod(s) use this adhesive — deactivate it instead`);
  await prisma.hardwareItem.delete({ where: { id: itemId } });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}

export async function deleteCustomOp(id) {
  await requireAdmin();
  await prisma.customFabOperation.delete({ where: { id } });
  revalidatePath('/admin/connection-pricing');
  return { success: true };
}
