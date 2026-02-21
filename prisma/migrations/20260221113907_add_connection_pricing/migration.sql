-- CreateTable
CREATE TABLE "PricingRates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "shopLaborRatePerHr" REAL NOT NULL DEFAULT 65.00,
    "materialAvgPricePerLb" REAL NOT NULL DEFAULT 0.789,
    "quantityDiscountOver20Pct" REAL NOT NULL DEFAULT 5.0,
    "quantityDiscountOver100Pct" REAL NOT NULL DEFAULT 7.5,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);

-- CreateTable
CREATE TABLE "ConnectionCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shapeType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shapesIncluded" TEXT NOT NULL,
    "beamSizeRange" TEXT,
    "laborHours" REAL NOT NULL,
    "connxWeightLbs" INTEGER NOT NULL,
    "momentConnxWeightLbs" INTEGER NOT NULL,
    "providesTakeoffCost" BOOLEAN NOT NULL DEFAULT false,
    "connxCost" REAL,
    "momentConnxCost" REAL,
    "singleCopeCost" REAL NOT NULL,
    "doubleCopeCost" REAL NOT NULL,
    "straightCutCost" REAL NOT NULL,
    "miterCutCost" REAL NOT NULL,
    "doubleMiterCost" REAL NOT NULL,
    "singleCopeMiterCost" REAL NOT NULL,
    "doubleCopeMiterCost" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BeamConnectionData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "beamSize" TEXT NOT NULL,
    "shapeType" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "connxWeightLbs" INTEGER NOT NULL,
    "momentConnxWeightLbs" INTEGER NOT NULL,
    "connxCostProvideTO" BOOLEAN NOT NULL DEFAULT false,
    "connxCost" REAL,
    "momentConnxCostProvideTO" BOOLEAN NOT NULL DEFAULT false,
    "momentConnxCost" REAL,
    "singleCopeCost" REAL NOT NULL,
    "doubleCopeCost" REAL NOT NULL,
    "straightCutCost" REAL,
    "miterCutCost" REAL,
    "doubleMiterCost" REAL,
    "singleCopeMiterCost" REAL,
    "doubleCopeMiterCost" REAL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BeamConnectionData_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ConnectionCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionCategory_name_key" ON "ConnectionCategory"("name");

-- CreateIndex
CREATE INDEX "ConnectionCategory_shapeType_idx" ON "ConnectionCategory"("shapeType");

-- CreateIndex
CREATE UNIQUE INDEX "BeamConnectionData_beamSize_key" ON "BeamConnectionData"("beamSize");

-- CreateIndex
CREATE INDEX "BeamConnectionData_shapeType_idx" ON "BeamConnectionData"("shapeType");
