-- CreateTable
CREATE TABLE "LaborGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operation" TEXT NOT NULL DEFAULT '',
    "familyKey" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" REAL NOT NULL DEFAULT 0,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "colorIndex" INTEGER NOT NULL DEFAULT 0,
    "itemId" INTEGER NOT NULL,
    CONSTRAINT "LaborGroup_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChildMaterialFabrication" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operation" TEXT NOT NULL DEFAULT '',
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "connWeight" REAL NOT NULL DEFAULT 0,
    "isGalvLine" BOOLEAN NOT NULL DEFAULT false,
    "length" REAL,
    "galvanized" BOOLEAN NOT NULL DEFAULT false,
    "galvWeight" REAL,
    "applyTo" TEXT,
    "childMaterialId" INTEGER NOT NULL,
    CONSTRAINT "ChildMaterialFabrication_childMaterialId_fkey" FOREIGN KEY ("childMaterialId") REFERENCES "ChildMaterial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChildMaterialFabrication" ("childMaterialId", "connWeight", "id", "isGalvLine", "operation", "quantity", "rate", "sortOrder", "totalCost", "unit") SELECT "childMaterialId", "connWeight", "id", "isGalvLine", "operation", "quantity", "rate", "sortOrder", "totalCost", "unit" FROM "ChildMaterialFabrication";
DROP TABLE "ChildMaterialFabrication";
ALTER TABLE "new_ChildMaterialFabrication" RENAME TO "ChildMaterialFabrication";
CREATE INDEX "ChildMaterialFabrication_childMaterialId_sortOrder_idx" ON "ChildMaterialFabrication"("childMaterialId", "sortOrder");
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
    "length" REAL,
    "galvanized" BOOLEAN NOT NULL DEFAULT false,
    "galvWeight" REAL,
    "applyTo" TEXT,
    "laborGroupId" INTEGER,
    "materialId" INTEGER NOT NULL,
    CONSTRAINT "MaterialFabrication_laborGroupId_fkey" FOREIGN KEY ("laborGroupId") REFERENCES "LaborGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaterialFabrication_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MaterialFabrication" ("connWeight", "id", "isGalvLine", "materialId", "operation", "quantity", "rate", "sortOrder", "totalCost", "unit") SELECT "connWeight", "id", "isGalvLine", "materialId", "operation", "quantity", "rate", "sortOrder", "totalCost", "unit" FROM "MaterialFabrication";
DROP TABLE "MaterialFabrication";
ALTER TABLE "new_MaterialFabrication" RENAME TO "MaterialFabrication";
CREATE INDEX "MaterialFabrication_materialId_sortOrder_idx" ON "MaterialFabrication"("materialId", "sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LaborGroup_itemId_sortOrder_idx" ON "LaborGroup"("itemId", "sortOrder");
