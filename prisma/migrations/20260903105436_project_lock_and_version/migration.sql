-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
INSERT INTO "new_Project" ("architect", "bidAmount", "bidDate", "bidTime", "billingAddress", "createdAt", "createdById", "customerContact", "customerEmail", "customerId", "customerName", "customerPhone", "dashboardStatus", "deliveryFobJobsite", "deliveryInstalled", "deliveryWillCall", "description", "drawingDate", "drawingRevision", "estimateDate", "estimatedBy", "estimatorId", "id", "isArchived", "isTemplate", "nestEndCropIn", "nestKerfIn", "nestingEnabled", "newOrCo", "notes", "parentProjectId", "projectAddress", "projectName", "publishedAt", "publishedById", "startDate", "status", "stockLengthOverrides", "taxCategory", "typeMiscellaneous", "typeOrnamental", "typeStructural", "updatedAt") SELECT "architect", "bidAmount", "bidDate", "bidTime", "billingAddress", "createdAt", "createdById", "customerContact", "customerEmail", "customerId", "customerName", "customerPhone", "dashboardStatus", "deliveryFobJobsite", "deliveryInstalled", "deliveryWillCall", "description", "drawingDate", "drawingRevision", "estimateDate", "estimatedBy", "estimatorId", "id", "isArchived", "isTemplate", "nestEndCropIn", "nestKerfIn", "nestingEnabled", "newOrCo", "notes", "parentProjectId", "projectAddress", "projectName", "publishedAt", "publishedById", "startDate", "status", "stockLengthOverrides", "taxCategory", "typeMiscellaneous", "typeOrnamental", "typeStructural", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");
CREATE INDEX "Project_estimatorId_idx" ON "Project"("estimatorId");
CREATE INDEX "Project_customerId_idx" ON "Project"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
