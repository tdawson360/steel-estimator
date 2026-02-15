// =============================================================================
// API: /api/projects/[id]
// =============================================================================
// GET    → Load a full project with ALL nested data (items, materials, fab, etc.)
// PUT    → Save/update an entire project
// DELETE → Delete a project and everything inside it
//
// The [id] in the folder name is a dynamic parameter — when someone requests
// /api/projects/5, the id variable equals 5.
//
// GET is like pulling a project folder out of the cabinet and spreading
// every sheet on the table. PUT is stuffing everything back in after changes.
// =============================================================================

import prisma from '../../../../lib/prisma';
import { NextResponse } from 'next/server';

// ── LOAD FULL PROJECT ────────────────────────────────────────────────────────
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);

    // Load everything — this is one big query that grabs the project
    // and every nested piece inside it, all the way down to child material fab ops
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
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
            recapCosts: true
          }
        },
        breakoutGroups: true,
        adjustments: true,
        exclusions: true,
        qualifications: true,
        customRecapColumns: true
      }
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
    
  } catch (error) {
    console.error('Error loading project:', error);
    return NextResponse.json(
      { error: 'Failed to load project' },
      { status: 500 }
    );
  }
}

// ── SAVE/UPDATE PROJECT ──────────────────────────────────────────────────────
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);
    const data = await request.json();

    // First, check the project exists and isn't locked
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true }
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (existing.status === 'LOCKED') {
      return NextResponse.json(
        { error: 'This estimate is locked and cannot be edited' },
        { status: 403 }
      );
    }

    // ── UPDATE PROJECT FIELDS ──────────────────────────────────────────────
    // We do this in a transaction so everything saves or nothing saves.
    // Like a bank transfer — you don't want money to leave one account
    // without arriving in the other.
    
    const updatedProject = await prisma.$transaction(async (tx) => {
      
      // Update the project-level fields
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
          estimatedBy: data.estimatedBy ?? '',
          drawingDate: data.drawingDate ?? '',
          drawingRevision: data.drawingRevision ?? '',
          architect: data.architect ?? '',
          typeStructural: data.typeStructural ?? false,
          typeMiscellaneous: data.typeMiscellaneous ?? false,
          typeOrnamental: data.typeOrnamental ?? false,
          deliveryInstalled: data.deliveryInstalled ?? false,
          deliveryFobJobsite: data.deliveryFobJobsite ?? false,
          deliveryWillCall: data.deliveryWillCall ?? false,
          taxCategory: data.taxCategory ?? null,
        }
      });

      // ── REPLACE NESTED DATA ────────────────────────────────────────────
      // Strategy: delete all existing nested records and recreate them.
      // This is simpler than trying to figure out which items changed,
      // which were added, which were removed. With cascade deletes,
      // removing an item automatically removes its materials, fab ops, etc.

      // Delete existing nested data (order matters — children before parents)
      await tx.recapCost.deleteMany({ where: { item: { projectId } } });
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

      // ── RECREATE BREAKOUT GROUPS ─────────────────────────────────────
      // We need to create these first so items can reference them.
      // Map old IDs to new IDs so item assignments carry over.
      const breakoutGroupMap = {}; // oldId → newId
      
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

      // ── RECREATE ITEMS WITH ALL NESTED DATA ──────────────────────────
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

          // Materials
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

              // Material fabrication ops
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

              // Child materials
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

                  // Child material fabrication ops
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

          // Item-level fabrication
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

          // Recap costs
          if (item.recapCosts) {
            // recapCosts comes from the front-end as an object: { installation: {...}, drafting: {...}, ... }
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
        }
      }

      // ── RECREATE OTHER PROJECT-LEVEL DATA ────────────────────────────

      // Adjustments
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

      // Exclusions (both standard selected and custom)
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

      // Qualifications
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

      // Custom recap columns
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

      // Return the fully loaded project
      return await tx.project.findUnique({
        where: { id: projectId },
        include: {
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
              recapCosts: true
            }
          },
          breakoutGroups: true,
          adjustments: true,
          exclusions: true,
          qualifications: true,
          customRecapColumns: true
        }
      });
    });

    return NextResponse.json(updatedProject);
    
  } catch (error) {
    console.error('Error saving project:', error);
    return NextResponse.json(
      { error: 'Failed to save project: ' + error.message },
      { status: 500 }
    );
  }
}

// ── DELETE PROJECT ───────────────────────────────────────────────────────────
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);

    // Check it exists
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true }
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Delete everything in the right order (children before parents)
    // Prisma cascade should handle this, but being explicit is safer
    await prisma.$transaction(async (tx) => {
      await tx.recapCost.deleteMany({ where: { item: { projectId } } });
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
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
