-- CreateIndex
CREATE INDEX "ChildMaterial_parentId_sortOrder_idx" ON "ChildMaterial"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "ChildMaterialFabrication_childMaterialId_sortOrder_idx" ON "ChildMaterialFabrication"("childMaterialId", "sortOrder");

-- CreateIndex
CREATE INDEX "Item_projectId_sortOrder_idx" ON "Item"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "ItemFabrication_itemId_sortOrder_idx" ON "ItemFabrication"("itemId", "sortOrder");

-- CreateIndex
CREATE INDEX "ItemSnapshot_itemId_sortOrder_idx" ON "ItemSnapshot"("itemId", "sortOrder");

-- CreateIndex
CREATE INDEX "Material_itemId_sortOrder_idx" ON "Material"("itemId", "sortOrder");

-- CreateIndex
CREATE INDEX "MaterialFabrication_materialId_sortOrder_idx" ON "MaterialFabrication"("materialId", "sortOrder");

-- CreateIndex
CREATE INDEX "Notification_recipientId_isRead_idx" ON "Notification"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- CreateIndex
CREATE INDEX "Project_estimatorId_idx" ON "Project"("estimatorId");
