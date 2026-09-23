-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "reopenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "resetCount" INTEGER NOT NULL DEFAULT 0;
