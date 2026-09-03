-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HardwareItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "diameter" TEXT NOT NULL DEFAULT '',
    "diameterIn" REAL NOT NULL DEFAULT 0,
    "length" TEXT NOT NULL DEFAULT '',
    "lengthIn" REAL NOT NULL DEFAULT 0,
    "finish" TEXT NOT NULL DEFAULT 'Plain',
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "weightEach" REAL NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "bitDiaIn" REAL,
    "embedMinIn" REAL,
    "embedMaxIn" REAL,
    "adhesiveId" INTEGER,
    "cartridgeMl" REAL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HardwareItem_adhesiveId_fkey" FOREIGN KEY ("adhesiveId") REFERENCES "HardwareItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_HardwareItem" ("active", "adhesiveId", "bitDiaIn", "cartridgeMl", "createdAt", "diameter", "diameterIn", "embedMaxIn", "embedMinIn", "family", "finish", "id", "isDefault", "kind", "length", "lengthIn", "sortOrder", "unitPrice", "updatedAt", "weightEach") SELECT "active", "adhesiveId", "bitDiaIn", "cartridgeMl", "createdAt", "diameter", "diameterIn", "embedMaxIn", "embedMinIn", "family", "finish", "id", "isDefault", "kind", "length", "lengthIn", "sortOrder", "unitPrice", "updatedAt", "weightEach" FROM "HardwareItem";
DROP TABLE "HardwareItem";
ALTER TABLE "new_HardwareItem" RENAME TO "HardwareItem";
CREATE INDEX "HardwareItem_kind_active_idx" ON "HardwareItem"("kind", "active");
CREATE UNIQUE INDEX "HardwareItem_family_name_diameter_length_finish_key" ON "HardwareItem"("family", "name", "diameter", "length", "finish");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
