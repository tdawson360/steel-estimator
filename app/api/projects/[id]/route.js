import prisma from '../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { diffAssertedTotals } from '../../../../lib/estimating/recompute';
import { recomputePayload, logTotalsMismatch } from '../../../../lib/recompute-server';

async function getUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

const FULL_PROJECT_INCLUDE = {
  items: {
    orderBy: { sortOrder: 'asc' },
    include: {
      materials: {
        orderBy: { sortOrder: 'asc' },
        include: {
          fabrication: { orderBy: { sortOrder: 'asc' } },
          children: {
            orderBy: { sortOrder: 'asc' },
            include: {
              fabrication: { orderBy: { sortOrder: 'asc' } }
            }
          }
        }
      },
      fabrication: { orderBy: { sortOrder: 'asc' } },
      laborGroups: { orderBy: { sortOrder: 'asc' } },
      recapCosts: true,
      snapshots: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, sortOrder: true, caption: true, itemId: true }
      }
    }
  },
  breakoutGroups: true,
  adjustments: true,
  exclusions: true,
  qualifications: true,
  customRecapColumns: true,
  customProjectTypes: true,
  customDeliveryOptions: true,
};

function canViewProject(user, project) {
  if (user.role === 'ADMIN' || user.role === 'ESTIMATOR') return true;
  if ((user.role === 'PM' || user.role === 'FIELD_SHOP') && project.status === 'PUBLISHED') return true;
  return false;
}

function canEditProject(user, project) {
  // Template projects (e.g. "Connx Template") feed company pricing via sync:
  // only admins and the template's assigned estimator may edit.
  if (project.isTemplate) {
    if (user.role === 'ADMIN') return true;
    return user.role === 'ESTIMATOR'
      && project.estimatorId != null
      && Number(project.estimatorId) === Number(user.id);
  }
  if (user.role === 'ADMIN') return true;
  if (user.role === 'ESTIMATOR' && (project.status === 'DRAFT' || project.status === 'IN_REVIEW' || project.status === 'REOPENED')) return true;
  return false;
}

export async function GET(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const projectId = parseInt(id);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: FULL_PROJECT_INCLUDE
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!canViewProject(user, project)) {
      return NextResponse.json({ error: 'You do not have permission to view this estimate' }, { status: 403 });
    }

    return NextResponse.json(project);

  } catch (error) {
    console.error('Error loading project:', error);
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

// =============================================================================
// DIFFERENTIAL UPDATE HELPERS
// =============================================================================
// Instead of deleting everything and recreating on every save, we compare the
// incoming payload against the current DB state and only INSERT / UPDATE / DELETE
// rows that actually changed. This preserves stable IDs and reduces write volume.
//
// "isExistingId" distinguishes DB-assigned autoincrement IDs (small integers)
// from client-generated temporary IDs (Date.now() + Math.random()).
// =============================================================================

function isExistingId(id, existingIds) {
  return existingIds.has(Number(id));
}

// Diff a flat list: returns { toCreate, toUpdate, toDelete }
// - incoming items with IDs in existingIds → update
// - incoming items without IDs in existingIds → create
// - existingIds not in incoming → delete
function diffList(incoming, existingIds) {
  const incomingById = new Map();
  const toCreate = [];
  const toUpdate = [];

  for (const item of incoming) {
    if (item.id != null && isExistingId(item.id, existingIds)) {
      toUpdate.push(item);
      incomingById.set(Number(item.id), item);
    } else {
      toCreate.push(item);
    }
  }

  const toDelete = [];
  for (const id of existingIds) {
    if (!incomingById.has(id)) {
      toDelete.push(id);
    }
  }

  return { toCreate, toUpdate, toDelete };
}

export async function PUT(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const projectId = parseInt(id);
    const data = await request.json();

    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true, isTemplate: true, estimatorId: true }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!canEditProject(user, existing)) {
      return NextResponse.json({ error: 'You do not have permission to edit this estimate' }, { status: 403 });
    }

    // ── Fetch current state for diffing ──────────────────────────────────────
    // One query to load the full project tree so we know what exists in the DB.
    const current = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        items: {
          include: {
            materials: {
              orderBy: { sortOrder: 'asc' },
              include: {
                fabrication: true,
                children: { include: { fabrication: true } }
              }
            },
            fabrication: true,
            laborGroups: true,
            recapCosts: true,
            snapshots: { select: { id: true } },
          }
        },
        breakoutGroups: true,
        adjustments: true,
        exclusions: true,
        qualifications: true,
        customRecapColumns: true,
        customProjectTypes: true,
        customDeliveryOptions: true,
      }
    });

    // ── Server-authoritative recompute ────────────────────────────────────
    // Run the engine over the incoming tree and persist the SERVER's numbers;
    // client-asserted totals are received but only used for drift detection.
    // If the engine itself throws on unexpected data, fall back to client
    // values rather than failing the save (shakeout behavior) — but log it
    // under the same greppable prefix.
    let recomputed = null;
    try {
      recomputed = await recomputePayload(data);
      const diffs = diffAssertedTotals(data, recomputed, data.bidAmount ?? null);
      if (diffs.length > 0) {
        logTotalsMismatch(projectId, diffs);
      }
    } catch (err) {
      console.warn('[TOTALS-MISMATCH]', JSON.stringify({
        at: new Date().toISOString(),
        projectId,
        error: 'recompute-failed',
        message: err.message,
      }));
    }

    const updatedProject = await prisma.$transaction(async (tx) => {

      // ── 1. Update project-level fields ───────────────────────────────────
      await tx.project.update({
        where: { id: projectId },
        data: {
          projectName: data.projectName ?? '',
          projectAddress: data.projectAddress ?? '',
          customerName: data.customerName ?? '',
          customerId: data.customerId !== undefined ? (data.customerId || null) : undefined,
          billingAddress: data.billingAddress ?? '',
          customerContact: data.customerContact ?? '',
          customerPhone: data.customerPhone ?? '',
          customerEmail: data.customerEmail ?? '',
          estimateDate: data.estimateDate ?? '',
          bidDate: data.bidDate ? new Date(data.bidDate) : null,
          bidTime: data.bidTime ?? '',
          estimatedBy: data.estimatedBy ?? '',
          drawingDate: data.drawingDate ?? '',
          drawingRevision: data.drawingRevision ?? '',
          architect: data.architect ?? '',
          estimatorId: data.estimatorId ?? null,
          dashboardStatus: data.dashboardStatus ?? null,
          newOrCo: data.newOrCo ?? null,
          notes: data.notes ?? null,
          // Server-computed grand total; the client's asserted bidAmount is
          // never the stored value (drift is logged above).
          bidAmount: recomputed ? recomputed.totals.grandTotal : (data.bidAmount ?? null),
          typeStructural: data.typeStructural ?? false,
          typeMiscellaneous: data.typeMiscellaneous ?? false,
          typeOrnamental: data.typeOrnamental ?? false,
          deliveryInstalled: data.deliveryInstalled ?? false,
          deliveryFobJobsite: data.deliveryFobJobsite ?? false,
          deliveryWillCall: data.deliveryWillCall ?? false,
          taxCategory: data.taxCategory ?? null,
          nestingEnabled: data.nestingEnabled ?? false,
          nestKerfIn: (typeof data.nestKerfIn === 'number' && isFinite(data.nestKerfIn)) ? data.nestKerfIn : 0.25,
          nestEndCropIn: (typeof data.nestEndCropIn === 'number' && isFinite(data.nestEndCropIn)) ? data.nestEndCropIn : 0,
          stockLengthOverrides: typeof data.stockLengthOverrides === 'object' && data.stockLengthOverrides !== null
            ? JSON.stringify(data.stockLengthOverrides)
            : (typeof data.stockLengthOverrides === 'string' ? data.stockLengthOverrides : '{}'),
        }
      });

      // ── 2. Diff breakout groups ──────────────────────────────────────────
      // Breakout groups have IDs and are referenced by items via breakoutGroupId.
      // We build an old→new ID map so new breakout groups get proper references.
      const existingBgIds = new Set(current.breakoutGroups.map(g => g.id));
      const incomingBgs = data.breakoutGroups || [];
      const bgDiff = diffList(incomingBgs, existingBgIds);
      const breakoutGroupMap = {};

      for (const id of bgDiff.toDelete) {
        await tx.breakoutGroup.delete({ where: { id } });
      }
      for (const group of bgDiff.toUpdate) {
        await tx.breakoutGroup.update({
          where: { id: Number(group.id) },
          data: { name: group.name || '', type: group.type || 'base' },
        });
        breakoutGroupMap[group.id] = Number(group.id);
      }
      for (const group of bgDiff.toCreate) {
        const created = await tx.breakoutGroup.create({
          data: { projectId, name: group.name || '', type: group.type || 'base' },
        });
        breakoutGroupMap[group.id] = created.id;
      }

      // ── 3. Diff items and all nested entities ────────────────────────────
      const existingItemIds = new Set(current.items.map(it => it.id));
      const incomingItems = data.items || [];
      const itemDiff = diffList(incomingItems, existingItemIds);

      // Build lookup of current items by ID for nested diffing
      const currentItemMap = new Map(current.items.map(it => [it.id, it]));

      // Delete removed items (cascade handles nested rows via FK indexes)
      for (const itemId of itemDiff.toDelete) {
        // Must delete children in dependency order since SQLite onDelete:Cascade
        // is enforced by Prisma, not the DB engine.
        const curItem = currentItemMap.get(itemId);
        if (curItem) {
          for (const mat of curItem.materials) {
            for (const child of mat.children) {
              await tx.childMaterialFabrication.deleteMany({ where: { childMaterialId: child.id } });
            }
            await tx.childMaterial.deleteMany({ where: { parentId: mat.id } });
            await tx.materialFabrication.deleteMany({ where: { materialId: mat.id } });
          }
          await tx.material.deleteMany({ where: { itemId } });
          // Labor groups go after the fab rows that reference them are gone
          await tx.laborGroup.deleteMany({ where: { itemId } });
          await tx.itemFabrication.deleteMany({ where: { itemId } });
          await tx.recapCost.deleteMany({ where: { itemId } });
          await tx.itemSnapshot.deleteMany({ where: { itemId } });
        }
        await tx.item.delete({ where: { id: itemId } });
      }

      // Process all incoming items in payload order to maintain sortOrder
      for (let i = 0; i < incomingItems.length; i++) {
        const item = incomingItems[i];
        const isNew = !isExistingId(item.id, existingItemIds);
        const resolvedBgId = item.breakoutGroupId
          ? (breakoutGroupMap[item.breakoutGroupId] || null)
          : null;

        const itemData = {
          itemNumber: item.itemNumber || '001',
          itemName: item.itemName || 'New Item',
          drawingRef: item.drawingRef || '',
          sortOrder: i,
          materialMarkup: item.materialMarkup || 0,
          fabMarkup: item.fabMarkup || 0,
          priceStandalone: item.priceStandalone || false,
          breakoutGroupId: resolvedBgId,
        };

        let activeItemId;

        if (isNew) {
          const createdItem = await tx.item.create({
            data: { ...itemData, projectId },
          });
          activeItemId = createdItem.id;
        } else {
          activeItemId = Number(item.id);
          await tx.item.update({ where: { id: activeItemId }, data: itemData });
        }

        // ── 3a-pre. Diff labor groups ──────────────────────────────────────
        // Creates/updates happen BEFORE the materials loop so fab rows can
        // resolve laborGroupId through the temp→DB map (breakoutGroupMap
        // pattern). Deletes are DEFERRED until after the materials loop so no
        // fab write ever references a just-deleted group.
        const curItem = currentItemMap.get(activeItemId);
        const existingLgIds = new Set((curItem?.laborGroups || []).map(g => g.id));
        const incomingLgs = item.laborGroups || [];
        const lgDiff = diffList(incomingLgs, existingLgIds);
        const laborGroupMap = {};

        for (let gi = 0; gi < incomingLgs.length; gi++) {
          const g = incomingLgs[gi];
          const gData = {
            sortOrder: gi,
            operation: g.operation || '',
            familyKey: g.familyKey || '',
            unit: g.unit || 'ea',
            rate: g.rate || 0,
            collapsed: !!g.collapsed,
            colorIndex: g.colorIndex || 0,
          };
          if (isExistingId(g.id, existingLgIds)) {
            await tx.laborGroup.update({ where: { id: Number(g.id) }, data: gData });
            laborGroupMap[g.id] = Number(g.id);
          } else {
            const createdLg = await tx.laborGroup.create({
              data: { ...gData, itemId: activeItemId },
            });
            laborGroupMap[g.id] = createdLg.id;
          }
        }

        // ── 3a. Diff materials within this item ────────────────────────────
        const existingMatIds = new Set((curItem?.materials || []).map(m => m.id));
        const curMatMap = new Map((curItem?.materials || []).map(m => [m.id, m]));
        const incomingMats = item.materials || [];
        const matDiff = diffList(incomingMats, existingMatIds);
        // payload id → DB id, for resolving subpart parent links (children
        // follow their parent in array order, so the parent is always mapped
        // by the time its subpart is processed)
        const matIdMap = new Map();

        // Delete removed materials (and their nested children/fab)
        for (const matId of matDiff.toDelete) {
          const curMat = curMatMap.get(matId);
          if (curMat) {
            for (const child of curMat.children) {
              await tx.childMaterialFabrication.deleteMany({ where: { childMaterialId: child.id } });
            }
            await tx.childMaterial.deleteMany({ where: { parentId: matId } });
            await tx.materialFabrication.deleteMany({ where: { materialId: matId } });
          }
          await tx.material.delete({ where: { id: matId } });
        }

        for (let mi = 0; mi < incomingMats.length; mi++) {
          const mat = incomingMats[mi];
          const matIsNew = !isExistingId(mat.id, existingMatIds);
          // Server-recomputed counterpart (index-aligned with the payload)
          const rMat = recomputed?.items?.[i]?.materials?.[mi];

          const matData = {
            sortOrder: mi,
            category: mat.category || '',
            shape: mat.size || mat.shape || '',
            description: mat.description || '',
            length: mat.length || 0,
            pieces: mat.pieces || 0,
            stockLength: mat.stockLength || 0,
            stocksRequired: mat.stocksRequired || 0,
            waste: mat.waste || 0,
            weightPerFt: (mat.weightPerFoot ?? mat.weightPerFt ?? 0),
            fabWeight: (rMat ? rMat.fabWeight : mat.fabWeight) || 0,
            stockWeight: (rMat ? rMat.stockWeight : mat.stockWeight) || 0,
            priceBy: mat.priceBy || 'LB',
            unitPrice: mat.unitPrice || 0,
            pricePerFt: mat.pricePerFt || 0,
            pricePerLb: mat.pricePerLb || 0,
            totalCost: (rMat ? rMat.totalCost : mat.totalCost) || 0,
            galvanized: mat.galvanized || false,
            galvRate: mat.galvRate || 0,
            // Plate dims come from the UI's plateThickness/plateWidth (the
            // importer is the only writer of thickness/width); the loaders
            // read them back through materialCalcInputsFromDb.
            width: (mat.plateWidth ?? mat.width) || null,
            thickness: (mat.plateThickness != null && mat.plateThickness !== ''
              ? parseFloat(mat.plateThickness) : mat.thickness) || null,
            // Subpart linkage: resolve through this save's temp→DB map first,
            // else accept an existing DB id; anything unresolvable is top-level.
            parentMaterialId: mat.parentMaterialId != null
              ? (matIdMap.get(mat.parentMaterialId)
                 ?? (isExistingId(mat.parentMaterialId, existingMatIds) ? Number(mat.parentMaterialId) : null))
              : null,
          };

          let activeMatId;

          if (matIsNew) {
            const createdMat = await tx.material.create({
              data: { ...matData, itemId: activeItemId },
            });
            activeMatId = createdMat.id;
          } else {
            activeMatId = Number(mat.id);
            await tx.material.update({ where: { id: activeMatId }, data: matData });
          }
          matIdMap.set(mat.id, activeMatId);

          // ── 3b. Diff material fabrication ──────────────────────────────
          const curMat = curMatMap.get(activeMatId);
          const existingMatFabIds = new Set((curMat?.fabrication || []).map(f => f.id));
          const incomingMatFabs = mat.fabrication || [];
          const matFabDiff = diffList(incomingMatFabs, existingMatFabIds);

          if (matFabDiff.toDelete.length > 0) {
            await tx.materialFabrication.deleteMany({
              where: { id: { in: matFabDiff.toDelete } },
            });
          }
          // Two passes: ordinary ops and auto-galv lines first, so a conn-galv
          // line (pass 2) can resolve parentFabId through this save's temp→DB
          // map when its connection op is new in the same payload.
          const fabIdMap = new Map();
          const isConnLine = (f) => !!(f.isConnGalv || f.galvKind === 'conn');
          const indexedFabs = incomingMatFabs.map((f, fi) => [f, fi]);
          const fabPasses = [
            indexedFabs.filter(([f]) => !isConnLine(f)),
            indexedFabs.filter(([f]) => isConnLine(f)),
          ];
          for (const pass of fabPasses) for (const [fab, fi] of pass) {
            const fabIsNew = !isExistingId(fab.id, existingMatFabIds);
            const rFab = rMat?.fabrication?.[fi];
            const conn = isConnLine(fab);
            const fabData = {
              sortOrder: fi,
              operation: fab.operation || '',
              // quantity too: the auto-galv line's qty is the recomputed fabWeight
              quantity: (rFab ? rFab.quantity : fab.quantity) || 0,
              unit: fab.unit || 'ea',
              rate: fab.unitPrice || fab.rate || 0,
              totalCost: (rFab ? rFab.totalCost : fab.totalCost) || 0,
              connWeight: fab.connWeight || 0,
              isGalvLine: fab.isGalvLine || fab.isAutoGalv || fab.isConnGalv || false,
              galvKind: fab.isAutoGalv ? 'auto' : (conn ? 'conn' : (fab.galvKind ?? null)),
              parentFabId: (conn && fab.parentFabId != null)
                ? (fabIdMap.get(fab.parentFabId)
                   ?? (isExistingId(fab.parentFabId, existingMatFabIds) ? Number(fab.parentFabId) : null))
                : null,
              length: (typeof fab.length === 'number' && isFinite(fab.length)) ? fab.length : null,
              galvanized: fab.galvanized || false,
              galvWeight: (typeof fab.galvWeight === 'number' && isFinite(fab.galvWeight)) ? fab.galvWeight : null,
              applyTo: fab.applyTo != null ? String(fab.applyTo) : null,
              // Resolve through the temp→DB map; a reference to a group not in
              // this payload (deleted) nulls out rather than dangling.
              laborGroupId: fab.laborGroupId != null ? (laborGroupMap[fab.laborGroupId] ?? null) : null,
            };
            let activeFabId;
            if (fabIsNew) {
              const createdFab = await tx.materialFabrication.create({
                data: { ...fabData, materialId: activeMatId },
              });
              activeFabId = createdFab.id;
            } else {
              activeFabId = Number(fab.id);
              await tx.materialFabrication.update({
                where: { id: activeFabId }, data: fabData,
              });
            }
            fabIdMap.set(fab.id, activeFabId);
          }

          // ── 3c. Diff child materials ───────────────────────────────────
          const existingChildIds = new Set((curMat?.children || []).map(c => c.id));
          const curChildMap = new Map((curMat?.children || []).map(c => [c.id, c]));
          const incomingChildren = mat.children || [];
          const childDiff = diffList(incomingChildren, existingChildIds);

          // Delete removed children (and their fab ops)
          for (const childId of childDiff.toDelete) {
            await tx.childMaterialFabrication.deleteMany({ where: { childMaterialId: childId } });
            await tx.childMaterial.delete({ where: { id: childId } });
          }

          for (let ci = 0; ci < incomingChildren.length; ci++) {
            const child = incomingChildren[ci];
            const childIsNew = !isExistingId(child.id, existingChildIds);

            const childData = {
              sortOrder: ci,
              category: child.category || '',
              shape: child.size || child.shape || '',
              description: child.description || '',
              length: child.length || 0,
              pieces: child.pieces || 0,
              stockLength: child.stockLength || 0,
              stocksRequired: child.stocksRequired || 0,
              waste: child.waste || 0,
              weightPerFt: (child.weightPerFoot ?? child.weightPerFt ?? 0),
              fabWeight: child.fabWeight || 0,
              stockWeight: child.stockWeight || 0,
              priceBy: child.priceBy || 'LB',
              unitPrice: child.unitPrice || 0,
              pricePerFt: child.pricePerFt || 0,
              pricePerLb: child.pricePerLb || 0,
              totalCost: child.totalCost || 0,
              galvanized: child.galvanized || false,
              galvRate: child.galvRate || 0,
              width: child.width || null,
              thickness: child.thickness || null,
            };

            let activeChildId;

            if (childIsNew) {
              const createdChild = await tx.childMaterial.create({
                data: { ...childData, parentId: activeMatId },
              });
              activeChildId = createdChild.id;
            } else {
              activeChildId = Number(child.id);
              await tx.childMaterial.update({ where: { id: activeChildId }, data: childData });
            }

            // ── 3d. Diff child material fabrication ──────────────────────
            const curChild = curChildMap.get(activeChildId);
            const existingChildFabIds = new Set((curChild?.fabrication || []).map(f => f.id));
            const incomingChildFabs = child.fabrication || [];
            const childFabDiff = diffList(incomingChildFabs, existingChildFabIds);

            if (childFabDiff.toDelete.length > 0) {
              await tx.childMaterialFabrication.deleteMany({
                where: { id: { in: childFabDiff.toDelete } },
              });
            }
            for (let cfi = 0; cfi < incomingChildFabs.length; cfi++) {
              const cfab = incomingChildFabs[cfi];
              const cfabIsNew = !isExistingId(cfab.id, existingChildFabIds);
              const cfabData = {
                sortOrder: cfi,
                operation: cfab.operation || '',
                quantity: cfab.quantity || 0,
                unit: cfab.unit || 'ea',
                rate: cfab.unitPrice || cfab.rate || 0,
                totalCost: cfab.totalCost || 0,
                connWeight: cfab.connWeight || 0,
                isGalvLine: cfab.isGalvLine || cfab.isAutoGalv || cfab.isConnGalv || false,
                length: (typeof cfab.length === 'number' && isFinite(cfab.length)) ? cfab.length : null,
                galvanized: cfab.galvanized || false,
                galvWeight: (typeof cfab.galvWeight === 'number' && isFinite(cfab.galvWeight)) ? cfab.galvWeight : null,
                applyTo: cfab.applyTo != null ? String(cfab.applyTo) : null,
              };
              if (cfabIsNew) {
                await tx.childMaterialFabrication.create({
                  data: { ...cfabData, childMaterialId: activeChildId },
                });
              } else {
                await tx.childMaterialFabrication.update({
                  where: { id: Number(cfab.id) }, data: cfabData,
                });
              }
            }
          }
        }

        // ── 3a-post. Deferred labor group deletes ────────────────────────
        // All fab writes above resolved laborGroupId through the map, so
        // nothing references these rows any more.
        if (lgDiff.toDelete.length > 0) {
          await tx.laborGroup.deleteMany({ where: { id: { in: lgDiff.toDelete } } });
        }

        // ── 3e. Diff item-level fabrication ──────────────────────────────
        const existingItemFabIds = new Set((curItem?.fabrication || []).map(f => f.id));
        const incomingItemFabs = item.fabrication || [];
        const itemFabDiff = diffList(incomingItemFabs, existingItemFabIds);

        if (itemFabDiff.toDelete.length > 0) {
          await tx.itemFabrication.deleteMany({
            where: { id: { in: itemFabDiff.toDelete } },
          });
        }
        for (let ifi = 0; ifi < incomingItemFabs.length; ifi++) {
          const ifab = incomingItemFabs[ifi];
          const ifabIsNew = !isExistingId(ifab.id, existingItemFabIds);
          const rIfab = recomputed?.items?.[i]?.fabrication?.[ifi];
          const ifabData = {
            sortOrder: ifi,
            operation: ifab.operation || '',
            quantity: ifab.quantity || 0,
            unit: ifab.unit || 'ea',
            rate: ifab.unitPrice || ifab.rate || 0,
            totalCost: (rIfab ? rIfab.totalCost : ifab.totalCost) || 0,
          };
          if (ifabIsNew) {
            await tx.itemFabrication.create({
              data: { ...ifabData, itemId: activeItemId },
            });
          } else {
            await tx.itemFabrication.update({
              where: { id: Number(ifab.id) }, data: ifabData,
            });
          }
        }

        // ── 3f. Diff recap costs (keyed by costType, not by ID) ──────────
        // RecapCosts use @@unique([itemId, costType]) so we upsert by composite key.
        const existingRecapMap = new Map(
          (curItem?.recapCosts || []).map(rc => [rc.costType, rc])
        );
        const incomingRecapEntries = typeof item.recapCosts === 'object' && !Array.isArray(item.recapCosts)
          ? Object.entries(item.recapCosts)
          : [];
        const incomingCostTypes = new Set(incomingRecapEntries.map(([ct]) => ct));

        // Delete recap costs not in the incoming payload
        const recapToDelete = [...existingRecapMap.keys()].filter(ct => !incomingCostTypes.has(ct));
        if (recapToDelete.length > 0) {
          await tx.recapCost.deleteMany({
            where: { itemId: activeItemId, costType: { in: recapToDelete } },
          });
        }

        for (const [costType, costData] of incomingRecapEntries) {
          const rRecap = recomputed?.items?.[i]?.recapCosts?.[costType];
          const rcData = {
            cost: costData.cost || 0,
            markup: costData.markup || 0,
            total: (rRecap ? rRecap.total : costData.total) || 0,
            hours: costData.hours || 0,
            rate: costData.rate || 0,
          };
          if (existingRecapMap.has(costType)) {
            await tx.recapCost.update({
              where: { itemId_costType: { itemId: activeItemId, costType } },
              data: rcData,
            });
          } else {
            await tx.recapCost.create({
              data: { ...rcData, itemId: activeItemId, costType },
            });
          }
        }

        // ── 3g. Diff snapshots ───────────────────────────────────────────
        // Snapshots may not include imageData in the payload (excluded from
        // default include per Fix 2). Only update caption/sortOrder for
        // existing snapshots; only set imageData on new snapshots.
        const existingSnapIds = new Set((curItem?.snapshots || []).map(s => s.id));
        const incomingSnaps = item.snapshots || [];
        const snapDiff = diffList(incomingSnaps, existingSnapIds);

        if (snapDiff.toDelete.length > 0) {
          await tx.itemSnapshot.deleteMany({
            where: { id: { in: snapDiff.toDelete } },
          });
        }
        for (let si = 0; si < incomingSnaps.length; si++) {
          const snap = incomingSnaps[si];
          const snapIsNew = !isExistingId(snap.id, existingSnapIds);
          if (snapIsNew) {
            await tx.itemSnapshot.create({
              data: {
                itemId: activeItemId,
                sortOrder: si,
                imageData: snap.imageData || '',
                caption: snap.caption || '',
              },
            });
          } else {
            // Only update metadata; preserve existing imageData in the DB
            const snapUpdate = { sortOrder: si, caption: snap.caption || '' };
            // If the client sends imageData (e.g. replacement), apply it
            if (snap.imageData) {
              snapUpdate.imageData = snap.imageData;
            }
            await tx.itemSnapshot.update({
              where: { id: Number(snap.id) }, data: snapUpdate,
            });
          }
        }
      }

      // ── 4. Diff adjustments ──────────────────────────────────────────────
      const existingAdjIds = new Set(current.adjustments.map(a => a.id));
      const incomingAdjs = data.adjustments || [];
      const adjDiff = diffList(incomingAdjs, existingAdjIds);

      if (adjDiff.toDelete.length > 0) {
        await tx.adjustment.deleteMany({ where: { id: { in: adjDiff.toDelete } } });
      }
      for (const adj of adjDiff.toUpdate) {
        await tx.adjustment.update({
          where: { id: Number(adj.id) },
          data: { description: adj.description || '', amount: parseFloat(adj.amount) || 0 },
        });
      }
      for (const adj of adjDiff.toCreate) {
        await tx.adjustment.create({
          data: { projectId, description: adj.description || '', amount: parseFloat(adj.amount) || 0 },
        });
      }

      // ── 5. Replace text-only collections (no IDs in payload) ─────────────
      // Exclusions, qualifications, custom project types, custom delivery
      // options, and custom recap columns are sent as plain text arrays
      // without stable IDs, so we delete-and-recreate them. These are small
      // flat sets with no nested children — the cost is negligible.

      await tx.exclusion.deleteMany({ where: { projectId } });
      const allExclusions = [
        ...(data.selectedExclusions || []).map(text => ({ projectId, text, isCustom: false })),
        ...(data.customExclusions || []).map(text => ({ projectId, text, isCustom: true })),
      ];
      if (allExclusions.length > 0) {
        await tx.exclusion.createMany({ data: allExclusions });
      }

      await tx.qualification.deleteMany({ where: { projectId } });
      const allQualifications = [
        ...(data.selectedQualifications || []).map(text => ({ projectId, text, isCustom: false })),
        ...(data.customQualifications || []).map(text => ({ projectId, text, isCustom: true })),
      ];
      if (allQualifications.length > 0) {
        await tx.qualification.createMany({ data: allQualifications });
      }

      await tx.customProjectType.deleteMany({ where: { projectId } });
      const cptData = (data.customProjectTypes || []).map(text => ({ projectId, text }));
      if (cptData.length > 0) {
        await tx.customProjectType.createMany({ data: cptData });
      }

      await tx.customDeliveryOption.deleteMany({ where: { projectId } });
      const cdoData = (data.customDeliveryOptions || []).map(opt => ({
        projectId, text: opt.text, isSelected: opt.isSelected || false,
      }));
      if (cdoData.length > 0) {
        await tx.customDeliveryOption.createMany({ data: cdoData });
      }

      await tx.customRecapColumn.deleteMany({ where: { projectId } });
      const crcData = (data.customRecapColumns || []).map(col => ({
        projectId, key: col.key, name: col.name,
      }));
      if (crcData.length > 0) {
        await tx.customRecapColumn.createMany({ data: crcData });
      }

      // ── 6. Return the full updated project tree ──────────────────────────
      return await tx.project.findUnique({
        where: { id: projectId },
        include: FULL_PROJECT_INCLUDE
      });
    }, {
      // Large estimates issue hundreds of sequential writes; Prisma's 5 s
      // default rolled the whole save back with a generic failure.
      maxWait: 10_000,
      timeout: 60_000,
    });

    // The persisted tree already holds the server's numbers; serverTotals
    // gives the client the recomputed roll-up for reconciliation.
    return NextResponse.json(
      recomputed ? { ...updatedProject, serverTotals: recomputed.totals } : updatedProject
    );

  } catch (error) {
    console.error('Error saving project:', error);
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 });
  }
}

// Bid-board pipeline values (mirrors DASHBOARD_STATUSES in app/dashboard/page.js
// and the schema comment on Project.dashboardStatus).
const DASHBOARD_STATUSES = new Set([
  'Bidding',
  'Quoted - Pending Award from GC',
  'Quoted - Budget Only',
  'Awarded to BIW',
  'Redesign omitted scope',
]);

export async function PATCH(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'ADMIN' && user.role !== 'ESTIMATOR') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const projectId = parseInt(id);
    if (!Number.isInteger(projectId)) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }
    const { dashboardStatus } = await request.json();
    if (dashboardStatus != null && dashboardStatus !== '' && !DASHBOARD_STATUSES.has(dashboardStatus)) {
      return NextResponse.json({ error: 'Invalid dashboard status' }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, isTemplate: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (project.isTemplate) {
      return NextResponse.json({ error: 'Template projects are not on the bid board' }, { status: 400 });
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { dashboardStatus: dashboardStatus || null },
      select: { id: true, dashboardStatus: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating project status:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can delete estimates' }, { status: 403 });
    }

    const { id } = await params;
    const projectId = parseInt(id);

    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, isTemplate: true, isArchived: true }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Two-step protection: only archived projects can be deleted, so a delete
    // is always a deliberate archive-then-delete and never a one-click accident.
    if (!existing.isArchived) {
      return NextResponse.json({
        error: 'Archive the project first — only archived projects can be deleted.',
      }, { status: 409 });
    }

    // A template whose items still back pricing cells must not be deleted —
    // it would orphan the Global Pricing Data links.
    if (existing.isTemplate) {
      const items = await prisma.item.findMany({ where: { projectId }, select: { id: true } });
      const itemIds = items.map(i => i.id);
      const linkedCount = itemIds.length === 0 ? 0 : await prisma.connectionCategory.count({
        where: {
          OR: [
            { boltedTemplateItemId: { in: itemIds } },
            { weldedTemplateItemId: { in: itemIds } },
          ],
        },
      });
      if (linkedCount > 0) {
        return NextResponse.json({
          error: `This template backs ${linkedCount} pricing cell${linkedCount === 1 ? '' : 's'} on the Global Pricing Data page. Unlink them first, then delete.`,
        }, { status: 409 });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.recapCost.deleteMany({ where: { item: { projectId } } });
      await tx.itemSnapshot.deleteMany({ where: { item: { projectId } } });
      await tx.childMaterialFabrication.deleteMany({ where: { childMaterial: { parent: { item: { projectId } } } } });
      await tx.childMaterial.deleteMany({ where: { parent: { item: { projectId } } } });
      await tx.materialFabrication.deleteMany({ where: { material: { item: { projectId } } } });
      await tx.material.deleteMany({ where: { item: { projectId } } });
      await tx.itemFabrication.deleteMany({ where: { item: { projectId } } });
      await tx.item.deleteMany({ where: { projectId } });
      await tx.breakoutGroup.deleteMany({ where: { projectId } });
      await tx.adjustment.deleteMany({ where: { projectId } });
      await tx.exclusion.deleteMany({ where: { projectId } });
      await tx.qualification.deleteMany({ where: { projectId } });
      await tx.customRecapColumn.deleteMany({ where: { projectId } });
      await tx.customProjectType.deleteMany({ where: { projectId } });
      await tx.customDeliveryOption.deleteMany({ where: { projectId } });
      await tx.project.delete({ where: { id: projectId } });
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
