-- CreateTable
CREATE TABLE "ItemSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "imageData" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "itemId" INTEGER NOT NULL,
    CONSTRAINT "ItemSnapshot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
