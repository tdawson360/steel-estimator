-- AlterTable
ALTER TABLE "MaterialFabrication" ADD COLUMN "galvClass" TEXT;

-- CreateTable
CREATE TABLE "GalvRateClass" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePerCwt" REAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PricingRates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "shopLaborRatePerHr" REAL NOT NULL DEFAULT 65.00,
    "materialAvgPricePerLb" REAL NOT NULL DEFAULT 0.789,
    "quantityDiscountOver20Pct" REAL NOT NULL DEFAULT 5.0,
    "quantityDiscountOver100Pct" REAL NOT NULL DEFAULT 7.5,
    "drillHolesRate" REAL,
    "drillCSinkRate" REAL,
    "drillTapRate" REAL,
    "easeRate" REAL,
    "spliceRate" REAL,
    "ninetyRate" REAL,
    "camberRate" REAL,
    "rollRate" REAL,
    "weldFilletRate" REAL,
    "weldBevelRate" REAL,
    "weldPjpRate" REAL,
    "weldCjpRate" REAL,
    "preheatWeldRate" REAL,
    "preheatWeldGrindRate" REAL,
    "galvMinimumCharge" REAL NOT NULL DEFAULT 325,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);
INSERT INTO "new_PricingRates" ("camberRate", "drillCSinkRate", "drillHolesRate", "drillTapRate", "easeRate", "id", "materialAvgPricePerLb", "ninetyRate", "preheatWeldGrindRate", "preheatWeldRate", "quantityDiscountOver100Pct", "quantityDiscountOver20Pct", "rollRate", "shopLaborRatePerHr", "spliceRate", "updatedAt", "updatedBy", "weldBevelRate", "weldCjpRate", "weldFilletRate", "weldPjpRate") SELECT "camberRate", "drillCSinkRate", "drillHolesRate", "drillTapRate", "easeRate", "id", "materialAvgPricePerLb", "ninetyRate", "preheatWeldGrindRate", "preheatWeldRate", "quantityDiscountOver100Pct", "quantityDiscountOver20Pct", "rollRate", "shopLaborRatePerHr", "spliceRate", "updatedAt", "updatedBy", "weldBevelRate", "weldCjpRate", "weldFilletRate", "weldPjpRate" FROM "PricingRates";
DROP TABLE "PricingRates";
ALTER TABLE "new_PricingRates" RENAME TO "PricingRates";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GalvRateClass_code_key" ON "GalvRateClass"("code");

-- Seed: AZZ Galvanizing Houston, quote 4112510011147, effective 10/01/2025
-- (docs/galv-rate-sheet.pdf). Rates are the sheet's $/CWT; Berger edits them
-- to all-in numbers on Global Pricing Data.
INSERT INTO "GalvRateClass" ("code", "name", "ratePerCwt", "sortOrder", "active", "updatedAt") VALUES
  ('KDS',   'Knockdown Structural',           27.00, 0, 1, CURRENT_TIMESTAMP),
  ('GR2',   'Grating - Fabricated',           27.00, 1, 1, CURRENT_TIMESTAMP),
  ('MSC',   'Miscellaneous Fabricated Steel', 30.00, 2, 1, CURRENT_TIMESTAMP),
  ('FPIP5', 'Fabricated Pipe < 14" dia',      33.00, 3, 1, CURRENT_TIMESTAMP),
  ('FTUB3', 'Fabricated Tube < 12"',          33.00, 4, 1, CURRENT_TIMESTAMP),
  ('FPIP2', 'Fabricated Pipe < 4" dia',       37.00, 5, 1, CURRENT_TIMESTAMP),
  ('FTUB2', 'Fabricated Tube < 8"',           37.00, 6, 1, CURRENT_TIMESTAMP),
  ('FPIP1', 'Fabricated Pipe < 3" dia',       39.00, 7, 1, CURRENT_TIMESTAMP),
  ('FTUB1', 'Fabricated Tube < 4"',           39.00, 8, 1, CURRENT_TIMESTAMP),
  ('MLT',   'Material less than 20#',         65.00, 9, 1, CURRENT_TIMESTAMP);
