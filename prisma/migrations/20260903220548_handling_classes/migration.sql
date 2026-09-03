-- CreateTable
CREATE TABLE "HandlingClass" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minLb" REAL NOT NULL DEFAULT 0,
    "maxLb" REAL,
    "minutesPerPiece" REAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Material" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "shape" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "length" REAL NOT NULL DEFAULT 0,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "stockLength" REAL NOT NULL DEFAULT 0,
    "stocksRequired" INTEGER NOT NULL DEFAULT 0,
    "waste" REAL NOT NULL DEFAULT 0,
    "weightPerFt" REAL NOT NULL DEFAULT 0,
    "fabWeight" REAL NOT NULL DEFAULT 0,
    "stockWeight" REAL NOT NULL DEFAULT 0,
    "priceBy" TEXT NOT NULL DEFAULT 'LB',
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "pricePerFt" REAL NOT NULL DEFAULT 0,
    "pricePerLb" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "galvanized" BOOLEAN NOT NULL DEFAULT false,
    "galvRate" REAL NOT NULL DEFAULT 0,
    "width" REAL,
    "thickness" REAL,
    "hardwareItemId" INTEGER,
    "handlingExcluded" BOOLEAN NOT NULL DEFAULT false,
    "itemId" INTEGER NOT NULL,
    "parentMaterialId" INTEGER,
    CONSTRAINT "Material_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Material_parentMaterialId_fkey" FOREIGN KEY ("parentMaterialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Material" ("category", "description", "fabWeight", "galvRate", "galvanized", "hardwareItemId", "id", "itemId", "length", "parentMaterialId", "pieces", "priceBy", "pricePerFt", "pricePerLb", "shape", "sortOrder", "stockLength", "stockWeight", "stocksRequired", "thickness", "totalCost", "unitPrice", "waste", "weightPerFt", "width") SELECT "category", "description", "fabWeight", "galvRate", "galvanized", "hardwareItemId", "id", "itemId", "length", "parentMaterialId", "pieces", "priceBy", "pricePerFt", "pricePerLb", "shape", "sortOrder", "stockLength", "stockWeight", "stocksRequired", "thickness", "totalCost", "unitPrice", "waste", "weightPerFt", "width" FROM "Material";
DROP TABLE "Material";
ALTER TABLE "new_Material" RENAME TO "Material";
CREATE INDEX "Material_itemId_sortOrder_idx" ON "Material"("itemId", "sortOrder");
CREATE INDEX "Material_parentMaterialId_idx" ON "Material"("parentMaterialId");
CREATE TABLE "new_MaterialFabrication" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operation" TEXT NOT NULL DEFAULT '',
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "connWeight" REAL NOT NULL DEFAULT 0,
    "isGalvLine" BOOLEAN NOT NULL DEFAULT false,
    "galvKind" TEXT,
    "parentFabId" INTEGER,
    "galvClass" TEXT,
    "length" REAL,
    "handlingKind" TEXT,
    "handlingClass" TEXT,
    "handlingPinned" BOOLEAN NOT NULL DEFAULT false,
    "galvanized" BOOLEAN NOT NULL DEFAULT false,
    "galvWeight" REAL,
    "applyTo" TEXT,
    "laborGroupId" INTEGER,
    "materialId" INTEGER NOT NULL,
    CONSTRAINT "MaterialFabrication_laborGroupId_fkey" FOREIGN KEY ("laborGroupId") REFERENCES "LaborGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaterialFabrication_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MaterialFabrication" ("applyTo", "connWeight", "galvClass", "galvKind", "galvWeight", "galvanized", "id", "isGalvLine", "laborGroupId", "length", "materialId", "operation", "parentFabId", "quantity", "rate", "sortOrder", "totalCost", "unit") SELECT "applyTo", "connWeight", "galvClass", "galvKind", "galvWeight", "galvanized", "id", "isGalvLine", "laborGroupId", "length", "materialId", "operation", "parentFabId", "quantity", "rate", "sortOrder", "totalCost", "unit" FROM "MaterialFabrication";
DROP TABLE "MaterialFabrication";
ALTER TABLE "new_MaterialFabrication" RENAME TO "MaterialFabrication";
CREATE INDEX "MaterialFabrication_materialId_sortOrder_idx" ON "MaterialFabrication"("materialId", "sortOrder");
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" DATETIME,
    "projectName" TEXT NOT NULL DEFAULT '',
    "projectAddress" TEXT NOT NULL DEFAULT '',
    "customerName" TEXT NOT NULL DEFAULT '',
    "billingAddress" TEXT NOT NULL DEFAULT '',
    "customerContact" TEXT NOT NULL DEFAULT '',
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "customerEmail" TEXT NOT NULL DEFAULT '',
    "estimateDate" TEXT NOT NULL DEFAULT '',
    "estimatedBy" TEXT NOT NULL DEFAULT '',
    "drawingDate" TEXT NOT NULL DEFAULT '',
    "drawingRevision" TEXT NOT NULL DEFAULT '',
    "architect" TEXT NOT NULL DEFAULT '',
    "typeStructural" BOOLEAN NOT NULL DEFAULT false,
    "typeMiscellaneous" BOOLEAN NOT NULL DEFAULT false,
    "typeOrnamental" BOOLEAN NOT NULL DEFAULT false,
    "deliveryInstalled" BOOLEAN NOT NULL DEFAULT false,
    "deliveryFobJobsite" BOOLEAN NOT NULL DEFAULT false,
    "deliveryWillCall" BOOLEAN NOT NULL DEFAULT false,
    "taxCategory" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "handlingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nestingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nestKerfIn" REAL NOT NULL DEFAULT 0.25,
    "nestEndCropIn" REAL NOT NULL DEFAULT 0,
    "stockLengthOverrides" TEXT NOT NULL DEFAULT '{}',
    "dashboardStatus" TEXT,
    "newOrCo" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "bidDate" DATETIME,
    "bidTime" TEXT NOT NULL DEFAULT '',
    "startDate" DATETIME,
    "bidAmount" REAL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "estimatorId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" INTEGER NOT NULL,
    "publishedById" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastSavedById" INTEGER,
    "lastSavedAt" DATETIME,
    "lockedById" INTEGER,
    "lockedAt" DATETIME,
    "lockHeartbeatAt" DATETIME,
    "parentProjectId" INTEGER,
    "customerId" INTEGER,
    CONSTRAINT "Project_estimatorId_fkey" FOREIGN KEY ("estimatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_lastSavedById_fkey" FOREIGN KEY ("lastSavedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("architect", "bidAmount", "bidDate", "bidTime", "billingAddress", "createdAt", "createdById", "customerContact", "customerEmail", "customerId", "customerName", "customerPhone", "dashboardStatus", "deliveryFobJobsite", "deliveryInstalled", "deliveryWillCall", "description", "drawingDate", "drawingRevision", "estimateDate", "estimatedBy", "estimatorId", "id", "isArchived", "isTemplate", "lastSavedAt", "lastSavedById", "lockHeartbeatAt", "lockedAt", "lockedById", "nestEndCropIn", "nestKerfIn", "nestingEnabled", "newOrCo", "notes", "parentProjectId", "projectAddress", "projectName", "publishedAt", "publishedById", "startDate", "status", "stockLengthOverrides", "taxCategory", "typeMiscellaneous", "typeOrnamental", "typeStructural", "updatedAt", "version") SELECT "architect", "bidAmount", "bidDate", "bidTime", "billingAddress", "createdAt", "createdById", "customerContact", "customerEmail", "customerId", "customerName", "customerPhone", "dashboardStatus", "deliveryFobJobsite", "deliveryInstalled", "deliveryWillCall", "description", "drawingDate", "drawingRevision", "estimateDate", "estimatedBy", "estimatorId", "id", "isArchived", "isTemplate", "lastSavedAt", "lastSavedById", "lockHeartbeatAt", "lockedAt", "lockedById", "nestEndCropIn", "nestKerfIn", "nestingEnabled", "newOrCo", "notes", "parentProjectId", "projectAddress", "projectName", "publishedAt", "publishedById", "startDate", "status", "stockLengthOverrides", "taxCategory", "typeMiscellaneous", "typeOrnamental", "typeStructural", "updatedAt", "version" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");
CREATE INDEX "Project_estimatorId_idx" ON "Project"("estimatorId");
CREATE INDEX "Project_customerId_idx" ON "Project"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "HandlingClass_code_key" ON "HandlingClass"("code");

-- Seed the five weight brackets (minutes stay 0 until Samantha fills them in)
INSERT INTO "HandlingClass" ("code", "name", "minLb", "maxLb", "minutesPerPiece", "sortOrder", "active", "updatedAt") VALUES
  ('HL1', 'Light (under 50 lb)',         0,    50,   0, 1, 1, CURRENT_TIMESTAMP),
  ('HL2', 'Medium (50-250 lb)',          50,   250,  0, 2, 1, CURRENT_TIMESTAMP),
  ('HL3', 'Heavy (250-1,000 lb)',        250,  1000, 0, 3, 1, CURRENT_TIMESTAMP),
  ('HL4', 'Very heavy (1,000-3,000 lb)', 1000, 3000, 0, 4, 1, CURRENT_TIMESTAMP),
  ('HL5', 'Crane (over 3,000 lb)',       3000, NULL, 0, 5, 1, CURRENT_TIMESTAMP);
