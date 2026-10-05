-- Reopening a submitted attempt for Challenge 1 alone.
--
-- A normal reopen hands the whole attempt back. This one grants only Challenge 1:
-- Challenges 2 to 4 were submitted and stay submitted. Both unlock the account, so the
-- user status cannot tell them apart — hence a column.
--
-- Cleared when the participant submits again, which re-seals Challenge 1.

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN "reopenedForChallenge1" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: an attempt that was already submitted has, by definition, finished its
-- Challenge 1 — but attempts sealed before the lock existed carry no timestamp, so the
-- Unlock button would not appear for them and a super admin would have no way to
-- reopen Challenge 1 for anyone who submitted before today.
--
-- submittedAt is the honest moment to record, and COALESCE covers an attempt that
-- expired on the clock rather than being submitted by hand.
UPDATE "attempts"
SET "challenge1LockedAt" = COALESCE("submittedAt", "endsAt", "updatedAt"),
    "challenge1LockCount" = GREATEST("challenge1LockCount", 1)
WHERE "state" IN ('SUBMITTED', 'EXPIRED')
  AND "challenge1LockedAt" IS NULL;
