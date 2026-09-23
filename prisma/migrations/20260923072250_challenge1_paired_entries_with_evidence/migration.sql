/*
  Warnings:

  - You are about to drop the `challenge1_items` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Challenge1Slot" AS ENUM ('BUG', 'TEST');

-- DropForeignKey
ALTER TABLE "challenge1_items" DROP CONSTRAINT "challenge1_items_attemptId_fkey";

-- DropTable
DROP TABLE "challenge1_items";

-- DropEnum
DROP TYPE "Challenge1ItemKind";

-- CreateTable
CREATE TABLE "challenge1_entries" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "bugTitle" TEXT NOT NULL DEFAULT '',
    "bugDescription" TEXT NOT NULL DEFAULT '',
    "testTitle" TEXT NOT NULL DEFAULT '',
    "testDescription" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge1_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge1_attachments" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "slot" "Challenge1Slot" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge1_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challenge1_entries_attemptId_position_idx" ON "challenge1_entries"("attemptId", "position");

-- CreateIndex
CREATE INDEX "challenge1_attachments_entryId_slot_position_idx" ON "challenge1_attachments"("entryId", "slot", "position");

-- AddForeignKey
ALTER TABLE "challenge1_entries" ADD CONSTRAINT "challenge1_entries_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge1_attachments" ADD CONSTRAINT "challenge1_attachments_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "challenge1_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
