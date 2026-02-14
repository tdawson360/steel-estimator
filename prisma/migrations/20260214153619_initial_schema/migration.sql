-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ESTIMATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER NOT NULL,
    "parentProjectId" INTEGER,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakoutGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'base',
    "projectId" INTEGER NOT NULL,

    CONSTRAINT "BreakoutGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "itemNumber" TEXT NOT NULL DEFAULT '001',
    "itemName" TEXT NOT NULL DEFAULT 'New Item',
    "drawingRef" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "materialMarkup" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fabMarkup" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projectId" INTEGER NOT NULL,
    "breakoutGroupId" INTEGER,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "shape" TEXT NOT NULL DEFAULT '',
    "length" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "stockLength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stocksRequired" INTEGER NOT NULL DEFAULT 0,
    "waste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightPerFt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fabWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricePerFt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricePerLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "galvanized" BOOLEAN NOT NULL DEFAULT false,
    "galvRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION,
    "thickness" DOUBLE PRECISION,
    "itemId" INTEGER NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialFabrication" (
    "id" SERIAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operation" TEXT NOT NULL DEFAULT '',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "connWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isGalvLine" BOOLEAN NOT NULL DEFAULT false,
    "materialId" INTEGER NOT NULL,

    CONSTRAINT "MaterialFabrication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildMaterial" (
    "id" SERIAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "shape" TEXT NOT NULL DEFAULT '',
    "length" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "stockLength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stocksRequired" INTEGER NOT NULL DEFAULT 0,
    "waste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightPerFt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fabWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricePerFt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricePerLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "galvanized" BOOLEAN NOT NULL DEFAULT false,
    "galvRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION,
    "thickness" DOUBLE PRECISION,
    "parentId" INTEGER NOT NULL,

    CONSTRAINT "ChildMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildMaterialFabrication" (
    "id" SERIAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operation" TEXT NOT NULL DEFAULT '',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "connWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isGalvLine" BOOLEAN NOT NULL DEFAULT false,
    "childMaterialId" INTEGER NOT NULL,

    CONSTRAINT "ChildMaterialFabrication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemFabrication" (
    "id" SERIAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operation" TEXT NOT NULL DEFAULT '',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itemId" INTEGER NOT NULL,

    CONSTRAINT "ItemFabrication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecapCost" (
    "id" SERIAL NOT NULL,
    "costType" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "markup" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itemId" INTEGER NOT NULL,

    CONSTRAINT "RecapCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRecapColumn" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,

    CONSTRAINT "CustomRecapColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projectId" INTEGER NOT NULL,

    CONSTRAINT "Adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exclusion" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "projectId" INTEGER NOT NULL,

    CONSTRAINT "Exclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "projectId" INTEGER NOT NULL,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RecapCost_itemId_costType_key" ON "RecapCost"("itemId", "costType");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakoutGroup" ADD CONSTRAINT "BreakoutGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_breakoutGroupId_fkey" FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialFabrication" ADD CONSTRAINT "MaterialFabrication_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildMaterial" ADD CONSTRAINT "ChildMaterial_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildMaterialFabrication" ADD CONSTRAINT "ChildMaterialFabrication_childMaterialId_fkey" FOREIGN KEY ("childMaterialId") REFERENCES "ChildMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemFabrication" ADD CONSTRAINT "ItemFabrication_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapCost" ADD CONSTRAINT "RecapCost_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRecapColumn" ADD CONSTRAINT "CustomRecapColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exclusion" ADD CONSTRAINT "Exclusion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
