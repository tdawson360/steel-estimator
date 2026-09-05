-- CreateTable
CREATE TABLE "DrawingSet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "markupPath" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "titleBlock" TEXT NOT NULL DEFAULT '{}',
    "prospectStatus" TEXT NOT NULL DEFAULT 'NEW',
    "passedAt" DATETIME,
    "passedById" INTEGER,
    "projectId" INTEGER,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DrawingSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DrawingSet_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DrawingJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "setId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "options" TEXT NOT NULL DEFAULT '{}',
    "progress" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '{}',
    "outputs" TEXT NOT NULL DEFAULT '[]',
    "log" TEXT NOT NULL DEFAULT '',
    "requestedById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "DrawingJob_setId_fkey" FOREIGN KEY ("setId") REFERENCES "DrawingSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DrawingJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DrawingSet_prospectStatus_idx" ON "DrawingSet"("prospectStatus");

-- CreateIndex
CREATE INDEX "DrawingSet_projectId_idx" ON "DrawingSet"("projectId");

-- CreateIndex
CREATE INDEX "DrawingJob_setId_createdAt_idx" ON "DrawingJob"("setId", "createdAt");

-- CreateIndex
CREATE INDEX "DrawingJob_status_idx" ON "DrawingJob"("status");
