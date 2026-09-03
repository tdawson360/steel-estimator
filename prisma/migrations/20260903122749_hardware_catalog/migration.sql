-- CreateTable
CREATE TABLE "HardwareItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "family" TEXT NOT NULL,
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

-- CreateIndex
CREATE INDEX "HardwareItem_kind_active_idx" ON "HardwareItem"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HardwareItem_family_diameter_length_finish_key" ON "HardwareItem"("family", "diameter", "length", "finish");
