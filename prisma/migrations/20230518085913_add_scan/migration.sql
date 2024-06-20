/*
  Warnings:

  - Added the required column `createdAt` to the `ScanData` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScanData" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "isDefect" BOOLEAN NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL
);
INSERT INTO "new_ScanData" ("amount", "id", "isDefect") SELECT "amount", "id", "isDefect" FROM "ScanData";
DROP TABLE "ScanData";
ALTER TABLE "new_ScanData" RENAME TO "ScanData";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
