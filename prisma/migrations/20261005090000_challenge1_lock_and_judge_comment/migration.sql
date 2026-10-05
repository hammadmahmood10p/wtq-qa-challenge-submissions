-- Challenge 1 locking, and a judge's comment on a submission.
--
-- challenge1LockedAt is the current state: null means Challenge 1 is open for editing.
-- challenge1LockCount is how many times it has been sealed, and exists because the two
-- answer different questions — "is it editable now" against "may Challenges 2 to 4 be
-- opened". Once it has been locked once the others stay open, so a super admin
-- unlocking Challenge 1 for a correction does not also hide work already done on the
-- rest.
--
-- comment hangs off the evaluation rather than the attempt so it travels with the
-- review: it survives a handover, and the judge who picks up a released submission
-- sees what the previous one thought.
--
-- Safe on existing data: every column is nullable or has a default, so rows written
-- before this migration read as "Challenge 1 never locked" and "no comment", which is
-- true of all of them.

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "challenge1LockCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "challenge1LockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "evaluations" ADD COLUMN     "comment" TEXT;
