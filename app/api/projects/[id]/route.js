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
      snapshots: { orderBy: { sortOrder: 'asc' } }
    }
  },
  breakoutGroups: true,
  adjustments: true,
  exclusions: true,
  qualifications: true,
  customRecapColumns: true
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

    const updatedProject = await prisma.$transaction(async (tx) => {

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

      const breakoutGroupMap = {};

      if (data.breakoutGroups && data.breakoutGroups.length > 0) {
        for (const group of data.breakoutGroups) {
          const created = await tx.breakoutGroup.create({
            data: {
              projectId,
              name: group.name || '',
              type: group.type || 'base',
            }
          });
          breakoutGroupMap[group.id] = created.id;
        }
      }

      if (data.items && data.items.length > 0) {
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];

          const createdItem = await tx.item.create({
            data: {
              projectId,
              itemNumber: item.itemNumber || '001',
              itemName: item.itemName || 'New Item',
              drawingRef: item.drawingRef || '',
              sortOrder: i,
              materialMarkup: item.materialMarkup || 0,
              fabMarkup: item.fabMarkup || 0,
              breakoutGroupId: item.breakoutGroupId
                ? (breakoutGroupMap[item.breakoutGroupId] || null)
                : null,
            }
          });

          if (item.materials && item.materials.length > 0) {
            for (let mi = 0; mi < item.materials.length; mi++) {
              const mat = item.materials[mi];

              const createdMat = await tx.material.create({
                data: {
                  itemId: createdItem.id,
                  sortOrder: mi,
                  category: mat.category || '',
                  shape: mat.shape || '',
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
                }
              });

              if (mat.fabrication && mat.fabrication.length > 0) {
                for (let fi = 0; fi < mat.fabrication.length; fi++) {
                  const fab = mat.fabrication[fi];
                  await tx.materialFabrication.create({
                    data: {
                      materialId: createdMat.id,
                      sortOrder: fi,
                      operation: fab.operation || '',
                      quantity: fab.quantity || 0,
                      unit: fab.unit || 'ea',
                      rate: fab.rate || 0,
                      totalCost: fab.totalCost || 0,
                      connWeight: fab.connWeight || 0,
                      isGalvLine: fab.isGalvLine || false,
                    }
                  });
                }
              }

              if (mat.children && mat.children.length > 0) {
                for (let ci = 0; ci < mat.children.length; ci++) {
                  const child = mat.children[ci];

                  const createdChild = await tx.childMaterial.create({
                    data: {
                      parentId: createdMat.id,
                      sortOrder: ci,
                      category: child.category || '',
                      shape: child.shape || '',
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
                    }
                  });

                  if (child.fabrication && child.fabrication.length > 0) {
                    for (let cfi = 0; cfi < child.fabrication.length; cfi++) {
                      const cfab = child.fabrication[cfi];
                      await tx.childMaterialFabrication.create({
                        data: {
                          childMaterialId: createdChild.id,
                          sortOrder: cfi,
                          operation: cfab.operation || '',
                          quantity: cfab.quantity || 0,
                          unit: cfab.unit || 'ea',
                          rate: cfab.rate || 0,
                          totalCost: cfab.totalCost || 0,
                          connWeight: cfab.connWeight || 0,
                          isGalvLine: cfab.isGalvLine || false,
                        }
                      });
                    }
                  }
                }
              }
            }
          }

          if (item.fabrication && item.fabrication.length > 0) {
            for (let ifi = 0; ifi < item.fabrication.length; ifi++) {
              const ifab = item.fabrication[ifi];
              await tx.itemFabrication.create({
                data: {
                  itemId: createdItem.id,
                  sortOrder: ifi,
                  operation: ifab.operation || '',
                  quantity: ifab.quantity || 0,
                  unit: ifab.unit || 'ea',
                  rate: ifab.rate || 0,
                  totalCost: ifab.totalCost || 0,
                }
              });
            }
          }

          if (item.recapCosts) {
            const recapEntries = typeof item.recapCosts === 'object' && !Array.isArray(item.recapCosts)
              ? Object.entries(item.recapCosts)
              : [];

            for (const [costType, costData] of recapEntries) {
              await tx.recapCost.create({
                data: {
                  itemId: createdItem.id,
                  costType,
                  cost: costData.cost || 0,
                  markup: costData.markup || 0,
                  total: costData.total || 0,
                  hours: costData.hours || 0,
                  rate: costData.rate || 0,
                }
              });
            }
          }

          if (item.snapshots && item.snapshots.length > 0) {
            for (let si = 0; si < item.snapshots.length; si++) {
              const snap = item.snapshots[si];
              await tx.itemSnapshot.create({
                data: {
                  itemId: createdItem.id,
                  sortOrder: si,
                  imageData: snap.imageData || '',
                  caption: snap.caption || '',
                }
              });
            }
          }
        }
      }

      if (data.adjustments && data.adjustments.length > 0) {
        for (const adj of data.adjustments) {
          await tx.adjustment.create({
            data: {
              projectId,
              description: adj.description || '',
              amount: parseFloat(adj.amount) || 0,
            }
          });
        }
      }

      if (data.selectedExclusions && data.selectedExclusions.length > 0) {
        for (const exc of data.selectedExclusions) {
          await tx.exclusion.create({
            data: { projectId, text: exc, isCustom: false }
          });
        }
      }
      if (data.customExclusions && data.customExclusions.length > 0) {
        for (const exc of data.customExclusions) {
          await tx.exclusion.create({
            data: { projectId, text: exc, isCustom: true }
          });
        }
      }

      if (data.selectedQualifications && data.selectedQualifications.length > 0) {
        for (const qual of data.selectedQualifications) {
          await tx.qualification.create({
            data: { projectId, text: qual, isCustom: false }
          });
        }
      }
      if (data.customQualifications && data.customQualifications.length > 0) {
        for (const qual of data.customQualifications) {
          await tx.qualification.create({
            data: { projectId, text: qual, isCustom: true }
          });
        }
      }

      if (data.customRecapColumns && data.customRecapColumns.length > 0) {
        for (const col of data.customRecapColumns) {
          await tx.customRecapColumn.create({
            data: {
              projectId,
              key: col.key,
              name: col.name,
            }
          });
        }
      }

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
      await tx.project.delete({ where: { id: projectId } });
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
