import prisma from '../../../../lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

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
      select: { status: true }
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
              include: {
                fabrication: true,
                children: { include: { fabrication: true } }
              }
            },
            fabrication: true,
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

    const updatedProject = await prisma.$transaction(async (tx) => {

      // ── 1. Update project-level fields ───────────────────────────────────
      await tx.project.update({
        where: { id: projectId },
        data: {
          projectName: data.projectName ?? '',
          projectAddress: data.projectAddress ?? '',
          customerName: data.customerName ?? '',
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
          bidAmount: data.bidAmount ?? null,
          typeStructural: data.typeStructural ?? false,
          typeMiscellaneous: data.typeMiscellaneous ?? false,
          typeOrnamental: data.typeOrnamental ?? false,
          deliveryInstalled: data.deliveryInstalled ?? false,
          deliveryFobJobsite: data.deliveryFobJobsite ?? false,
          deliveryWillCall: data.deliveryWillCall ?? false,
          taxCategory: data.taxCategory ?? null,
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

        // ── 3a. Diff materials within this item ────────────────────────────
        const curItem = currentItemMap.get(activeItemId);
        const existingMatIds = new Set((curItem?.materials || []).map(m => m.id));
        const curMatMap = new Map((curItem?.materials || []).map(m => [m.id, m]));
        const incomingMats = item.materials || [];
        const matDiff = diffList(incomingMats, existingMatIds);

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

          const matData = {
            sortOrder: mi,
            category: mat.category || '',
            shape: mat.shape || '',
            description: mat.description || '',
            length: mat.length || 0,
            pieces: mat.pieces || 0,
            stockLength: mat.stockLength || 0,
            stocksRequired: mat.stocksRequired || 0,
            waste: mat.waste || 0,
            weightPerFt: mat.weightPerFt || 0,
            fabWeight: mat.fabWeight || 0,
            stockWeight: mat.stockWeight || 0,
            pricePerFt: mat.pricePerFt || 0,
            pricePerLb: mat.pricePerLb || 0,
            totalCost: mat.totalCost || 0,
            galvanized: mat.galvanized || false,
            galvRate: mat.galvRate || 0,
            width: mat.width || null,
            thickness: mat.thickness || null,
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
          for (let fi = 0; fi < incomingMatFabs.length; fi++) {
            const fab = incomingMatFabs[fi];
            const fabIsNew = !isExistingId(fab.id, existingMatFabIds);
            const fabData = {
              sortOrder: fi,
              operation: fab.operation || '',
              quantity: fab.quantity || 0,
              unit: fab.unit || 'ea',
              rate: fab.unitPrice || fab.rate || 0,
              totalCost: fab.totalCost || 0,
              connWeight: fab.connWeight || 0,
              isGalvLine: fab.isGalvLine || false,
            };
            if (fabIsNew) {
              await tx.materialFabrication.create({
                data: { ...fabData, materialId: activeMatId },
              });
            } else {
              await tx.materialFabrication.update({
                where: { id: Number(fab.id) }, data: fabData,
              });
            }
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
              shape: child.shape || '',
              description: child.description || '',
              length: child.length || 0,
              pieces: child.pieces || 0,
              stockLength: child.stockLength || 0,
              stocksRequired: child.stocksRequired || 0,
              waste: child.waste || 0,
              weightPerFt: child.weightPerFt || 0,
              fabWeight: child.fabWeight || 0,
              stockWeight: child.stockWeight || 0,
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
                isGalvLine: cfab.isGalvLine || false,
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
          const ifabData = {
            sortOrder: ifi,
            operation: ifab.operation || '',
            quantity: ifab.quantity || 0,
            unit: ifab.unit || 'ea',
            rate: ifab.unitPrice || ifab.rate || 0,
            totalCost: ifab.totalCost || 0,
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
          const rcData = {
            cost: costData.cost || 0,
            markup: costData.markup || 0,
            total: costData.total || 0,
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
    });

    return NextResponse.json(updatedProject);

  } catch (error) {
    console.error('Error saving project:', error);
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const projectId = parseInt(id);
    const { dashboardStatus } = await request.json();

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
      select: { id: true }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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
