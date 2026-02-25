import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import prisma from '../../../../../../lib/db';

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins and estimators can duplicate projects
  const user = await prisma.user.findUnique({ where: { id: parseInt(session.user.id) } });
  if (!user || (user.role !== 'ADMIN' && user.role !== 'ESTIMATOR')) {
    return NextResponse.json({ error: 'You do not have permission to duplicate projects' }, { status: 403 });
  }

  const id = parseInt(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });

  try {
    // ── 1. FETCH FULL PROJECT WITH ALL NESTED DATA ──────────────────────────
    const original = await prisma.project.findUnique({
      where: { id },
      include: {
        breakoutGroups: true,
        adjustments: true,
        exclusions: true,
        qualifications: true,
        customRecapColumns: true,
        customProjectTypes: true,
        customDeliveryOptions: true,
        items: {
          include: {
            recapCosts: true,
            fabrication: true,
            snapshots: true,
            materials: {
              include: {
                fabrication: true,
                children: {
                  include: {
                    fabrication: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!original) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // ── 2. DEEP COPY IN A SINGLE TRANSACTION ────────────────────────────────
    // Uses createMany for flat relation sets and Promise.all to parallelize
    // independent creates within the same parent entity.
    const newProject = await prisma.$transaction(async (tx) => {

      // Create the new project record
      const proj = await tx.project.create({
        data: {
          projectName:      `${original.projectName || 'Untitled'} (Copy)`,
          projectAddress:   original.projectAddress,
          customerName:     original.customerName,
          billingAddress:   original.billingAddress,
          customerContact:  original.customerContact,
          customerPhone:    original.customerPhone,
          customerEmail:    original.customerEmail,
          estimateDate:     original.estimateDate,
          estimatedBy:      original.estimatedBy,
          drawingDate:      original.drawingDate,
          drawingRevision:  original.drawingRevision,
          architect:        original.architect,
          typeStructural:   original.typeStructural,
          typeMiscellaneous: original.typeMiscellaneous,
          typeOrnamental:   original.typeOrnamental,
          deliveryInstalled:  original.deliveryInstalled,
          deliveryFobJobsite: original.deliveryFobJobsite,
          deliveryWillCall:   original.deliveryWillCall,
          taxCategory:      original.taxCategory,
          description:      original.description,
          notes:            original.notes,
          bidDate:          original.bidDate,
          bidTime:          original.bidTime,
          startDate:        original.startDate,
          bidAmount:        original.bidAmount,
          newOrCo:          original.newOrCo,
          estimatorId:      original.estimatorId,
          // Reset workflow fields for the copy
          status:           'DRAFT',
          dashboardStatus:  'Bidding',
          isArchived:       false,
          publishedAt:      null,
          publishedById:    null,
          parentProjectId:  null,
          createdById:      parseInt(session.user.id),
        },
      });

      // Copy breakout groups — build old→new ID map for item remapping
      // (must be sequential since we need the returned IDs for the map)
      const bgIdMap = new Map();
      for (const bg of original.breakoutGroups) {
        const newBg = await tx.breakoutGroup.create({
          data: { name: bg.name, type: bg.type, projectId: proj.id },
        });
        bgIdMap.set(bg.id, newBg.id);
      }

      // Batch-create flat project-level collections in parallel
      // (these don't need returned IDs and are independent of each other)
      await Promise.all([
        original.adjustments.length > 0
          ? tx.adjustment.createMany({
              data: original.adjustments.map(a => ({
                description: a.description, amount: a.amount, projectId: proj.id,
              })),
            })
          : Promise.resolve(),
        original.exclusions.length > 0
          ? tx.exclusion.createMany({
              data: original.exclusions.map(e => ({
                text: e.text, isCustom: e.isCustom, projectId: proj.id,
              })),
            })
          : Promise.resolve(),
        original.qualifications.length > 0
          ? tx.qualification.createMany({
              data: original.qualifications.map(q => ({
                text: q.text, isCustom: q.isCustom, projectId: proj.id,
              })),
            })
          : Promise.resolve(),
        original.customRecapColumns.length > 0
          ? tx.customRecapColumn.createMany({
              data: original.customRecapColumns.map(c => ({
                key: c.key, name: c.name, projectId: proj.id,
              })),
            })
          : Promise.resolve(),
        (original.customProjectTypes || []).length > 0
          ? tx.customProjectType.createMany({
              data: original.customProjectTypes.map(t => ({
                text: t.text, projectId: proj.id,
              })),
            })
          : Promise.resolve(),
        (original.customDeliveryOptions || []).length > 0
          ? tx.customDeliveryOption.createMany({
              data: original.customDeliveryOptions.map(o => ({
                text: o.text, isSelected: o.isSelected, projectId: proj.id,
              })),
            })
          : Promise.resolve(),
      ]);

      // Copy items (must be sequential — each item needs its returned ID
      // for nested material/fab creates)
      for (const item of original.items) {
        const newItem = await tx.item.create({
          data: {
            itemNumber:     item.itemNumber,
            itemName:       item.itemName,
            drawingRef:     item.drawingRef,
            sortOrder:      item.sortOrder,
            materialMarkup: item.materialMarkup,
            fabMarkup:      item.fabMarkup,
            projectId:      proj.id,
            breakoutGroupId: item.breakoutGroupId
              ? (bgIdMap.get(item.breakoutGroupId) ?? null)
              : null,
          },
        });

        // Batch-create recap costs and item-level fab in parallel
        // (both are flat sets that only need newItem.id, not returned IDs)
        await Promise.all([
          item.recapCosts.length > 0
            ? tx.recapCost.createMany({
                data: item.recapCosts.map(rc => ({
                  costType: rc.costType, cost: rc.cost, markup: rc.markup,
                  total: rc.total, hours: rc.hours, rate: rc.rate,
                  itemId: newItem.id,
                })),
              })
            : Promise.resolve(),
          item.fabrication.length > 0
            ? tx.itemFabrication.createMany({
                data: item.fabrication.map(fab => ({
                  sortOrder: fab.sortOrder, operation: fab.operation,
                  quantity: fab.quantity, unit: fab.unit, rate: fab.rate,
                  totalCost: fab.totalCost, itemId: newItem.id,
                })),
              })
            : Promise.resolve(),
          (item.snapshots || []).length > 0
            ? tx.itemSnapshot.createMany({
                data: item.snapshots.map(snap => ({
                  sortOrder: snap.sortOrder, imageData: snap.imageData,
                  caption: snap.caption, itemId: newItem.id,
                })),
              })
            : Promise.resolve(),
        ]);

        // Materials (must be sequential — each material needs its returned ID
        // for children and material-level fabrication)
        for (const mat of item.materials) {
          const newMat = await tx.material.create({
            data: {
              sortOrder: mat.sortOrder, category: mat.category, shape: mat.shape,
              description: mat.description, length: mat.length, pieces: mat.pieces,
              stockLength: mat.stockLength, stocksRequired: mat.stocksRequired,
              waste: mat.waste, weightPerFt: mat.weightPerFt,
              fabWeight: mat.fabWeight, stockWeight: mat.stockWeight,
              pricePerFt: mat.pricePerFt, pricePerLb: mat.pricePerLb,
              totalCost: mat.totalCost, galvanized: mat.galvanized,
              galvRate: mat.galvRate, width: mat.width, thickness: mat.thickness,
              itemId: newItem.id,
            },
          });

          // Batch-create material fab ops (flat, no returned IDs needed)
          const matFabPromise = mat.fabrication.length > 0
            ? tx.materialFabrication.createMany({
                data: mat.fabrication.map(fab => ({
                  sortOrder: fab.sortOrder, operation: fab.operation,
                  quantity: fab.quantity, unit: fab.unit, rate: fab.rate,
                  totalCost: fab.totalCost, connWeight: fab.connWeight,
                  isGalvLine: fab.isGalvLine, materialId: newMat.id,
                })),
              })
            : Promise.resolve();

          // Child materials (must be sequential — each child needs its ID
          // for child fabrication, but children are independent of mat fab)
          const childrenPromise = (async () => {
            for (const child of mat.children) {
              const newChild = await tx.childMaterial.create({
                data: {
                  sortOrder: child.sortOrder, category: child.category,
                  shape: child.shape, description: child.description,
                  length: child.length, pieces: child.pieces,
                  stockLength: child.stockLength, stocksRequired: child.stocksRequired,
                  waste: child.waste, weightPerFt: child.weightPerFt,
                  fabWeight: child.fabWeight, stockWeight: child.stockWeight,
                  pricePerFt: child.pricePerFt, pricePerLb: child.pricePerLb,
                  totalCost: child.totalCost, galvanized: child.galvanized,
                  galvRate: child.galvRate, width: child.width,
                  thickness: child.thickness, parentId: newMat.id,
                },
              });

              // Batch-create child fab ops
              if (child.fabrication.length > 0) {
                await tx.childMaterialFabrication.createMany({
                  data: child.fabrication.map(fab => ({
                    sortOrder: fab.sortOrder, operation: fab.operation,
                    quantity: fab.quantity, unit: fab.unit, rate: fab.rate,
                    totalCost: fab.totalCost, connWeight: fab.connWeight,
                    isGalvLine: fab.isGalvLine, childMaterialId: newChild.id,
                  })),
                });
              }
            }
          })();

          // Material fab and child material creation run in parallel
          await Promise.all([matFabPromise, childrenPromise]);
        }
      }

      return proj;
    });

    return NextResponse.json({ id: newProject.id }, { status: 201 });

  } catch (error) {
    console.error('Duplicate project error:', error);
    return NextResponse.json({ error: 'Failed to duplicate project' }, { status: 500 });
  }
}
