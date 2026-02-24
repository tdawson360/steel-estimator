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
        items: {
          include: {
            recapCosts: true,
            fabrication: true,
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
      const bgIdMap = new Map();
      for (const bg of original.breakoutGroups) {
        const newBg = await tx.breakoutGroup.create({
          data: { name: bg.name, type: bg.type, projectId: proj.id },
        });
        bgIdMap.set(bg.id, newBg.id);
      }

      // Copy items
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

        // Recap costs
        for (const rc of item.recapCosts) {
          await tx.recapCost.create({
            data: {
              costType: rc.costType,
              cost:     rc.cost,
              markup:   rc.markup,
              total:    rc.total,
              hours:    rc.hours,
              rate:     rc.rate,
              itemId:   newItem.id,
            },
          });
        }

        // Item-level fabrication
        for (const fab of item.fabrication) {
          await tx.itemFabrication.create({
            data: {
              sortOrder: fab.sortOrder,
              operation: fab.operation,
              quantity:  fab.quantity,
              unit:      fab.unit,
              rate:      fab.rate,
              totalCost: fab.totalCost,
              itemId:    newItem.id,
            },
          });
        }

        // Materials
        for (const mat of item.materials) {
          const newMat = await tx.material.create({
            data: {
              sortOrder:      mat.sortOrder,
              category:       mat.category,
              shape:          mat.shape,
              length:         mat.length,
              pieces:         mat.pieces,
              stockLength:    mat.stockLength,
              stocksRequired: mat.stocksRequired,
              waste:          mat.waste,
              weightPerFt:    mat.weightPerFt,
              fabWeight:      mat.fabWeight,
              stockWeight:    mat.stockWeight,
              pricePerFt:     mat.pricePerFt,
              pricePerLb:     mat.pricePerLb,
              totalCost:      mat.totalCost,
              galvanized:     mat.galvanized,
              galvRate:       mat.galvRate,
              width:          mat.width,
              thickness:      mat.thickness,
              itemId:         newItem.id,
            },
          });

          // Material fabrication
          for (const fab of mat.fabrication) {
            await tx.materialFabrication.create({
              data: {
                sortOrder:  fab.sortOrder,
                operation:  fab.operation,
                quantity:   fab.quantity,
                unit:       fab.unit,
                rate:       fab.rate,
                totalCost:  fab.totalCost,
                connWeight: fab.connWeight,
                isGalvLine: fab.isGalvLine,
                materialId: newMat.id,
              },
            });
          }

          // Child materials
          for (const child of mat.children) {
            const newChild = await tx.childMaterial.create({
              data: {
                sortOrder:      child.sortOrder,
                category:       child.category,
                shape:          child.shape,
                length:         child.length,
                pieces:         child.pieces,
                stockLength:    child.stockLength,
                stocksRequired: child.stocksRequired,
                waste:          child.waste,
                weightPerFt:    child.weightPerFt,
                fabWeight:      child.fabWeight,
                stockWeight:    child.stockWeight,
                pricePerFt:     child.pricePerFt,
                pricePerLb:     child.pricePerLb,
                totalCost:      child.totalCost,
                galvanized:     child.galvanized,
                galvRate:       child.galvRate,
                width:          child.width,
                thickness:      child.thickness,
                parentId:       newMat.id,
              },
            });

            // Child material fabrication
            for (const fab of child.fabrication) {
              await tx.childMaterialFabrication.create({
                data: {
                  sortOrder:      fab.sortOrder,
                  operation:      fab.operation,
                  quantity:       fab.quantity,
                  unit:           fab.unit,
                  rate:           fab.rate,
                  totalCost:      fab.totalCost,
                  connWeight:     fab.connWeight,
                  isGalvLine:     fab.isGalvLine,
                  childMaterialId: newChild.id,
                },
              });
            }
          }
        }
      }

      // Adjustments
      for (const adj of original.adjustments) {
        await tx.adjustment.create({
          data: { description: adj.description, amount: adj.amount, projectId: proj.id },
        });
      }

      // Exclusions
      for (const exc of original.exclusions) {
        await tx.exclusion.create({
          data: { text: exc.text, isCustom: exc.isCustom, projectId: proj.id },
        });
      }

      // Qualifications
      for (const qual of original.qualifications) {
        await tx.qualification.create({
          data: { text: qual.text, isCustom: qual.isCustom, projectId: proj.id },
        });
      }

      // Custom recap columns
      for (const col of original.customRecapColumns) {
        await tx.customRecapColumn.create({
          data: { key: col.key, name: col.name, projectId: proj.id },
        });
      }

      return proj;
    });

    return NextResponse.json({ id: newProject.id }, { status: 201 });

  } catch (error) {
    console.error('Duplicate project error:', error);
    return NextResponse.json({ error: 'Failed to duplicate project' }, { status: 500 });
  }
}
