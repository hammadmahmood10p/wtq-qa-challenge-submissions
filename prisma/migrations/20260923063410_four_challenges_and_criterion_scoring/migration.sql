/*
  Warnings:

  - You are about to drop the column `scoreC1` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `scoreC1SavedAt` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `scoreC2` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `scoreC2Bonus` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `scoreC2SavedAt` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `scoreC3` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `scoreC3SavedAt` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the `challenge2_submissions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `challenge3_submissions` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ChallengeKey" AS ENUM ('C1', 'C2', 'C3', 'C4');

-- CreateEnum
CREATE TYPE "ChallengeTrack" AS ENUM ('C3', 'C4');

-- DropForeignKey
ALTER TABLE "challenge2_submissions" DROP CONSTRAINT "challenge2_submissions_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "challenge3_submissions" DROP CONSTRAINT "challenge3_submissions_attemptId_fkey";

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "chosenTrack" "ChallengeTrack",
ADD COLUMN     "chosenTrackAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "evaluations" DROP COLUMN "scoreC1",
DROP COLUMN "scoreC1SavedAt",
DROP COLUMN "scoreC2",
DROP COLUMN "scoreC2Bonus",
DROP COLUMN "scoreC2SavedAt",
DROP COLUMN "scoreC3",
DROP COLUMN "scoreC3SavedAt",
ADD COLUMN     "bonusPoints" DECIMAL(6,2);

-- DropTable
DROP TABLE "challenge2_submissions";

-- DropTable
DROP TABLE "challenge3_submissions";

-- CreateTable
CREATE TABLE "challenge_submissions" (
    "attemptId" UUID NOT NULL,
    "challenge" "ChallengeKey" NOT NULL,
    "fileKey" TEXT,
    "originalFilename" TEXT,
    "sizeBytes" INTEGER,
    "contentType" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "githubUrl" TEXT,
    "verifiedPublic" BOOLEAN,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_submissions_pkey" PRIMARY KEY ("attemptId","challenge")
);

-- CreateTable
CREATE TABLE "evaluation_scores" (
    "evaluationId" UUID NOT NULL,
    "criterion" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_scores_pkey" PRIMARY KEY ("evaluationId","criterion")
);

-- AddForeignKey
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
