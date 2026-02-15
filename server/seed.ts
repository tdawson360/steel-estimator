import { db } from "./db";
import { projects, estimateItems, materials, recapCosts } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { FabOperation } from "@shared/schema";

export async function seedDatabase() {
  const existing = await db.select().from(projects);
  if (existing.length > 0) return;

  const [proj] = await db.insert(projects).values({
    projectName: "Downtown Office Tower — Level 2 Steel",
    customerCompany: "Pacific Coast Construction",
    customerContact: "Mark Sullivan",
    customerAddress: "4200 Harbor Blvd, Suite 300, Costa Mesa, CA 92626",
    customerPhone: "(714) 555-0198",
    customerEmail: "msullivan@paccoast.com",
    projectAddress: "1800 Main Street, Irvine, CA 92614",
    drawingDate: "01/15/2026",
    drawingRevision: "Rev B",
    architect: "Thornton Architects",
    estimateDate: "02/10/2026",
    estimatedBy: "Jim Berger",
    projectType: "structural",
    deliveryOption: "installed",
    taxCategory: "new_construction",
    exclusions: [
      "Anchor bolts by others",
      "Engineering and shop drawings by others",
      "Metal deck by others",
      "Fireproofing by others",
      "Open web steel joists by others",
    ],
    qualifications: [
      "Based on drawings and specifications provided",
      "Prices valid for 30 days",
      "Standard shop coat included unless noted otherwise",
      "Fabrication per AISC standards",
      "Normal working hours — overtime not included",
    ],
    status: "draft",
  }).returning();

  const fabOp = (name: string, hours: number, rate: number): FabOperation => ({
    id: Math.random().toString(36).substring(2, 10),
    category: "connections",
    name,
    hours,
    rate,
    cost: hours * rate,
  });

  const [item1] = await db.insert(estimateItems).values({
    projectId: proj.id,
    name: "Level 2 Framing Beams",
    description: "W-shape beams for second floor framing",
    drawingRef: "S-201",
    breakoutGroup: "base",
    materialMarkupPercent: 15,
    fabMarkupPercent: 10,
    generalFabOps: [
      fabOp("Std. Shop Coat", 2, 45),
      fabOp("Shop Inspection", 1, 55),
    ],
    sortOrder: 0,
  }).returning();

  await db.insert(materials).values([
    {
      itemId: item1.id,
      shapeCategory: "W",
      shape: "W18x50",
      weightPerFoot: 50,
      length: 28,
      quantity: 12,
      unitPrice: 0.85,
      stockLength: 30,
      fabOps: [fabOp("Shear Tab", 1.5, 55), fabOp("Cope", 0.5, 55), fabOp("Bolt Holes", 0.25, 45)],
      sortOrder: 0,
    },
    {
      itemId: item1.id,
      shapeCategory: "W",
      shape: "W16x36",
      weightPerFoot: 36,
      length: 24,
      quantity: 8,
      unitPrice: 0.82,
      stockLength: 40,
      fabOps: [fabOp("Shear Tab", 1.5, 55), fabOp("Bolt Holes", 0.25, 45)],
      sortOrder: 1,
    },
    {
      itemId: item1.id,
      shapeCategory: "W",
      shape: "W12x26",
      weightPerFoot: 26,
      length: 18,
      quantity: 6,
      unitPrice: 0.80,
      stockLength: 20,
      fabOps: [fabOp("End Plate", 1, 55)],
      sortOrder: 2,
    },
  ]);

  await db.insert(recapCosts).values({
    itemId: item1.id,
    installationHours: 40,
    installationRate: 85,
    draftingHours: 16,
    draftingRate: 65,
    engineeringHours: 8,
    engineeringRate: 95,
    projectMgmtHours: 4,
    projectMgmtRate: 75,
    shippingCost: 1200,
    markupPercent: 5,
  });

  const [item2] = await db.insert(estimateItems).values({
    projectId: proj.id,
    name: "Level 2 Columns",
    description: "HSS columns at grid intersections",
    drawingRef: "S-202",
    breakoutGroup: "base",
    materialMarkupPercent: 15,
    fabMarkupPercent: 10,
    generalFabOps: [fabOp("Std. Shop Coat", 1.5, 45)],
    sortOrder: 1,
  }).returning();

  await db.insert(materials).values([
    {
      itemId: item2.id,
      shapeCategory: "HSS",
      shape: "HSS8x8x1/2",
      weightPerFoot: 48.85,
      length: 14,
      quantity: 8,
      unitPrice: 1.15,
      stockLength: 40,
      fabOps: [fabOp("Base Plate", 2, 55), fabOp("Cap Plate", 1.5, 55), fabOp("Bolt Holes", 0.5, 45)],
      sortOrder: 0,
    },
    {
      itemId: item2.id,
      shapeCategory: "HSS",
      shape: "HSS6x6x3/8",
      weightPerFoot: 27.48,
      length: 14,
      quantity: 4,
      unitPrice: 1.10,
      stockLength: 40,
      fabOps: [fabOp("Base Plate", 1.5, 55), fabOp("Cap Plate", 1, 55)],
      sortOrder: 1,
    },
  ]);

  await db.insert(recapCosts).values({
    itemId: item2.id,
    installationHours: 24,
    installationRate: 85,
    draftingHours: 8,
    draftingRate: 65,
    engineeringHours: 4,
    engineeringRate: 95,
    projectMgmtHours: 2,
    projectMgmtRate: 75,
    shippingCost: 800,
    markupPercent: 5,
  });

  const [item3] = await db.insert(estimateItems).values({
    projectId: proj.id,
    name: "Misc. Framing Angles",
    description: "Angle bracing and kickers",
    drawingRef: "S-203",
    breakoutGroup: "base",
    materialMarkupPercent: 12,
    fabMarkupPercent: 8,
    generalFabOps: [],
    sortOrder: 2,
  }).returning();

  await db.insert(materials).values([
    {
      itemId: item3.id,
      shapeCategory: "Angle",
      shape: "L4x4x3/8",
      weightPerFoot: 9.8,
      length: 6,
      quantity: 24,
      unitPrice: 0.75,
      stockLength: 20,
      fabOps: [fabOp("Bolt Holes", 0.25, 45), fabOp("Weld", 0.5, 55)],
      sortOrder: 0,
    },
    {
      itemId: item3.id,
      shapeCategory: "Angle",
      shape: "L3x3x1/4",
      weightPerFoot: 4.9,
      length: 4,
      quantity: 16,
      unitPrice: 0.70,
      stockLength: 20,
      fabOps: [fabOp("Bolt Holes", 0.15, 45)],
      sortOrder: 1,
    },
  ]);

  await db.insert(recapCosts).values({
    itemId: item3.id,
    installationHours: 12,
    installationRate: 85,
    draftingHours: 4,
    draftingRate: 65,
    shippingCost: 400,
    markupPercent: 0,
  });

  // Second project
  await db.insert(projects).values({
    projectName: "Parking Structure Repairs — Phase 1",
    customerCompany: "Golden State Builders",
    customerContact: "Lisa Chen",
    customerAddress: "9100 Wilshire Blvd, Beverly Hills, CA 90212",
    customerPhone: "(310) 555-0234",
    customerEmail: "lchen@goldenstate.com",
    projectAddress: "500 N. Brand Blvd, Glendale, CA 91203",
    drawingDate: "12/20/2025",
    drawingRevision: "Rev A",
    architect: "HGA Architects",
    estimateDate: "01/28/2026",
    estimatedBy: "Tom Reilly",
    projectType: "structural",
    deliveryOption: "f.o.b._jobsite",
    taxCategory: "fob",
    exclusions: [
      "Anchor bolts by others",
      "Shoring and bracing by others",
      "Permits by others",
    ],
    qualifications: [
      "Based on drawings and specifications provided",
      "Prices valid for 30 days",
      "Access to job site assumed clear and level",
    ],
    status: "draft",
  });

  await db.insert(projects).values({
    projectName: "Retail Storefront Canopy",
    customerCompany: "Summit Development Group",
    customerContact: "Dave Kowalski",
    customerAddress: "1500 S. Coast Hwy, Laguna Beach, CA 92651",
    customerPhone: "(949) 555-0176",
    customerEmail: "dave@summitdev.com",
    projectAddress: "2100 Newport Blvd, Newport Beach, CA 92663",
    estimateDate: "02/05/2026",
    estimatedBy: "Jim Berger",
    projectType: "ornamental",
    deliveryOption: "installed",
    taxCategory: "new_construction",
    status: "draft",
  });

  console.log("Seed data inserted successfully");
}
