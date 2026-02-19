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
    "dashboardStatus" TEXT,
    "newOrCo" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "bidDate" DATETIME,
    "startDate" DATETIME,
    "bidAmount" REAL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "estimatorId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" INTEGER NOT NULL,
    "publishedById" INTEGER,
    "parentProjectId" INTEGER,
    CONSTRAINT "Project_estimatorId_fkey" FOREIGN KEY ("estimatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("architect", "billingAddress", "createdAt", "createdById", "customerContact", "customerEmail", "customerName", "customerPhone", "deliveryFobJobsite", "deliveryInstalled", "deliveryWillCall", "drawingDate", "drawingRevision", "estimateDate", "estimatedBy", "id", "parentProjectId", "projectAddress", "projectName", "publishedAt", "publishedById", "status", "taxCategory", "typeMiscellaneous", "typeOrnamental", "typeStructural", "updatedAt") SELECT "architect", "billingAddress", "createdAt", "createdById", "customerContact", "customerEmail", "customerName", "customerPhone", "deliveryFobJobsite", "deliveryInstalled", "deliveryWillCall", "drawingDate", "drawingRevision", "estimateDate", "estimatedBy", "id", "parentProjectId", "projectAddress", "projectName", "publishedAt", "publishedById", "status", "taxCategory", "typeMiscellaneous", "typeOrnamental", "typeStructural", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
