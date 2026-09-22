-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'JUDGE', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'BLOCKED', 'SUBMITTED_LOCKED', 'REMOVED');

-- CreateEnum
CREATE TYPE "Location" AS ENUM ('KARACHI', 'LAHORE', 'ISLAMABAD');

-- CreateEnum
CREATE TYPE "AttemptState" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Challenge1ItemKind" AS ENUM ('BUG_REPORT', 'TEST_CASE');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdById" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_profiles" (
    "userId" UUID NOT NULL,
    "idCardHash" TEXT NOT NULL,
    "idCardEncrypted" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "location" "Location" NOT NULL,

    CONSTRAINT "participant_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "judge_profiles" (
    "userId" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "judge_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 180,
    "state" "AttemptState" NOT NULL DEFAULT 'NOT_STARTED',
    "submittedAt" TIMESTAMP(3),
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge1_items" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "kind" "Challenge1ItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge1_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge2_submissions" (
    "attemptId" UUID NOT NULL,
    "fileKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge2_submissions_pkey" PRIMARY KEY ("attemptId")
);

-- CreateTable
CREATE TABLE "challenge3_submissions" (
    "attemptId" UUID NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "verifiedPublic" BOOLEAN,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge3_submissions_pkey" PRIMARY KEY ("attemptId")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "judgeId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "scoreC1" DECIMAL(6,2),
    "scoreC1SavedAt" TIMESTAMP(3),
    "scoreC2" DECIMAL(6,2),
    "scoreC2Bonus" DECIMAL(6,2),
    "scoreC2SavedAt" TIMESTAMP(3),
    "scoreC3" DECIMAL(6,2),
    "scoreC3SavedAt" TIMESTAMP(3),
    "totalScore" DECIMAL(6,2),
    "status" "EvaluationStatus" NOT NULL DEFAULT 'ASSIGNED',
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_unlocks" (
    "id" UUID NOT NULL,
    "evaluationId" UUID NOT NULL,
    "unlockedById" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "participant_profiles_idCardHash_key" ON "participant_profiles"("idCardHash");

-- CreateIndex
CREATE UNIQUE INDEX "participant_profiles_phoneE164_key" ON "participant_profiles"("phoneE164");

-- CreateIndex
CREATE INDEX "participant_profiles_location_idx" ON "participant_profiles"("location");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_participantId_key" ON "attempts"("participantId");

-- CreateIndex
CREATE INDEX "attempts_state_idx" ON "attempts"("state");

-- CreateIndex
CREATE INDEX "attempts_endsAt_idx" ON "attempts"("endsAt");

-- CreateIndex
CREATE INDEX "challenge1_items_attemptId_kind_position_idx" ON "challenge1_items"("attemptId", "kind", "position");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_attemptId_key" ON "evaluations"("attemptId");

-- CreateIndex
CREATE INDEX "evaluations_judgeId_status_idx" ON "evaluations"("judgeId", "status");

-- CreateIndex
CREATE INDEX "evaluations_status_idx" ON "evaluations"("status");

-- CreateIndex
CREATE INDEX "evaluation_unlocks_evaluationId_idx" ON "evaluation_unlocks"("evaluationId");

-- CreateIndex
CREATE INDEX "audit_log_actorId_idx" ON "audit_log"("actorId");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "rate_limits_windowStart_idx" ON "rate_limits"("windowStart");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_profiles" ADD CONSTRAINT "participant_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_profiles" ADD CONSTRAINT "judge_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_profiles" ADD CONSTRAINT "judge_profiles_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participant_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge1_items" ADD CONSTRAINT "challenge1_items_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge2_submissions" ADD CONSTRAINT "challenge2_submissions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge3_submissions" ADD CONSTRAINT "challenge3_submissions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_unlocks" ADD CONSTRAINT "evaluation_unlocks_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_unlocks" ADD CONSTRAINT "evaluation_unlocks_unlockedById_fkey" FOREIGN KEY ("unlockedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
