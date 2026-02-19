-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'ESTIMATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME
);

-- CreateTable
CREATE TABLE "Project" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" INTEGER NOT NULL,
    "publishedById" INTEGER,
    "parentProjectId" INTEGER,
    CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BreakoutGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'base',
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "BreakoutGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemNumber" TEXT NOT NULL DEFAULT '001',
    "itemName" TEXT NOT NULL DEFAULT 'New Item',
    "drawingRef" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "materialMarkup" REAL NOT NULL DEFAULT 0,
    "fabMarkup" REAL NOT NULL DEFAULT 0,
    "projectId" INTEGER NOT NULL,
    "breakoutGroupId" INTEGER,
    CONSTRAINT "Item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Item_breakoutGroupId_fkey" FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Material" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "shape" TEXT NOT NULL DEFAULT '',
    "length" REAL NOT NULL DEFAULT 0,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "stockLength" REAL NOT NULL DEFAULT 0,
    "stocksRequired" INTEGER NOT NULL DEFAULT 0,
    "waste" REAL NOT NULL DEFAULT 0,
    "weightPerFt" REAL NOT NULL DEFAULT 0,
    "fabWeight" REAL NOT NULL DEFAULT 0,
    "stockWeight" REAL NOT NULL DEFAULT 0,
    "pricePerFt" REAL NOT NULL DEFAULT 0,
    "pricePerLb" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "galvanized" BOOLEAN NOT NULL DEFAULT false,
    "galvRate" REAL NOT NULL DEFAULT 0,
    "width" REAL,
    "thickness" REAL,
    "itemId" INTEGER NOT NULL,
    CONSTRAINT "Material_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialFabrication" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operation" TEXT NOT NULL DEFAULT '',
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "connWeight" REAL NOT NULL DEFAULT 0,
    "isGalvLine" BOOLEAN NOT NULL DEFAULT false,
    "materialId" INTEGER NOT NULL,
    CONSTRAINT "MaterialFabrication_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChildMaterial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "shape" TEXT NOT NULL DEFAULT '',
    "length" REAL NOT NULL DEFAULT 0,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "stockLength" REAL NOT NULL DEFAULT 0,
    "stocksRequired" INTEGER NOT NULL DEFAULT 0,
    "waste" REAL NOT NULL DEFAULT 0,
    "weightPerFt" REAL NOT NULL DEFAULT 0,
    "fabWeight" REAL NOT NULL DEFAULT 0,
    "stockWeight" REAL NOT NULL DEFAULT 0,
    "pricePerFt" REAL NOT NULL DEFAULT 0,
    "pricePerLb" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "galvanized" BOOLEAN NOT NULL DEFAULT false,
    "galvRate" REAL NOT NULL DEFAULT 0,
    "width" REAL,
    "thickness" REAL,
    "parentId" INTEGER NOT NULL,
    CONSTRAINT "ChildMaterial_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChildMaterialFabrication" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operation" TEXT NOT NULL DEFAULT '',
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "connWeight" REAL NOT NULL DEFAULT 0,
    "isGalvLine" BOOLEAN NOT NULL DEFAULT false,
    "childMaterialId" INTEGER NOT NULL,
    CONSTRAINT "ChildMaterialFabrication_childMaterialId_fkey" FOREIGN KEY ("childMaterialId") REFERENCES "ChildMaterial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemFabrication" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operation" TEXT NOT NULL DEFAULT '',
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "itemId" INTEGER NOT NULL,
    CONSTRAINT "ItemFabrication_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecapCost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "costType" TEXT NOT NULL,
    "cost" REAL NOT NULL DEFAULT 0,
    "markup" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "hours" REAL NOT NULL DEFAULT 0,
    "rate" REAL NOT NULL DEFAULT 0,
    "itemId" INTEGER NOT NULL,
    CONSTRAINT "RecapCost_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomRecapColumn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "CustomRecapColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" REAL NOT NULL DEFAULT 0,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "Adjustment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exclusion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "Exclusion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "Qualification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RecapCost_itemId_costType_key" ON "RecapCost"("itemId", "costType");
