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
    "itemId" INTEGER NOT NULL,
    "parentMaterialId" INTEGER,
    CONSTRAINT "Material_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Material_parentMaterialId_fkey" FOREIGN KEY ("parentMaterialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Material" ("category", "description", "fabWeight", "galvRate", "galvanized", "id", "itemId", "length", "pieces", "priceBy", "pricePerFt", "pricePerLb", "shape", "sortOrder", "stockLength", "stockWeight", "stocksRequired", "thickness", "totalCost", "unitPrice", "waste", "weightPerFt", "width") SELECT "category", "description", "fabWeight", "galvRate", "galvanized", "id", "itemId", "length", "pieces", "priceBy", "pricePerFt", "pricePerLb", "shape", "sortOrder", "stockLength", "stockWeight", "stocksRequired", "thickness", "totalCost", "unitPrice", "waste", "weightPerFt", "width" FROM "Material";
DROP TABLE "Material";
ALTER TABLE "new_Material" RENAME TO "Material";
CREATE INDEX "Material_itemId_sortOrder_idx" ON "Material"("itemId", "sortOrder");
CREATE INDEX "Material_parentMaterialId_idx" ON "Material"("parentMaterialId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
