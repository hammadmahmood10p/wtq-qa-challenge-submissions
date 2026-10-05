import "server-only";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { MAX_REOPEN_MINUTES, MIN_REOPEN_MINUTES } from "@/lib/attempt-admin-limits";
import { canSealChallenge1 } from "@/lib/challenge1-limits";
import { rubricFor } from "@/lib/scoring";

/**
 * Sealing Challenge 1.
 *
 * The organisers want the manual testing done before the AI challenges are visible, so
 * Challenge 1 is the only one open at the start and the rest unlock when it is sealed.
 * Sealing is one-way for the participant: they can read their findings afterwards but
 * not change them, which is the point — otherwise a participant could revisit their
 * manual bug reports after seeing what the AI found in Challenge 2.
 *
 * Only a super admin can reopen it, and deliberately *not* as part of reopening the
 * attempt. Handing a submission back and reopening finished manual work are different
 * decisions with different reasons, and an admin giving someone twenty more minutes
 * because their laptop died should not silently also reopen the one thing the whole
 * sequence exists to protect.
 */

export interface LockResult {
  ok: boolean;
  message?: string;
}

/** Refuses to seal Challenge 1 with nothing worth judging in it — see `canSealChallenge1`. */
export async function canLockChallenge1(attemptId: string): Promise<LockResult> {
  const entries = await db.challenge1Entry.findMany({
    where: { attemptId },
    select: {
      bugTitle: true,
      bugDescription: true,
      testTitle: true,
      testDescription: true,
    },
  });

  if (canSealChallenge1(entries)) return { ok: true };

  return {
    ok: false,
    message:
      "Write at least one finding with its bug report and test case both complete before locking.",
  };
}

export async function lockChallenge1(participantId: string): Promise<LockResult> {
  const attempt = await db.attempt.findUnique({
    where: { participantId },
    select: { id: true, state: true, challenge1LockedAt: true },
  });

  if (!attempt) return { ok: false, message: "No attempt to lock." };
  if (attempt.challenge1LockedAt) return { ok: true };

  if (attempt.state !== "IN_PROGRESS") {
    return { ok: false, message: "Your challenge is no longer open." };
  }

  const allowed = await canLockChallenge1(attempt.id);
  if (!allowed.ok) return allowed;

  // The WHERE clause is the guard, as everywhere else that changes attempt state: two
  // tabs pressing Lock together must produce one lock, not two increments of the count.
  const { count } = await db.attempt.updateMany({
    where: { id: attempt.id, challenge1LockedAt: null },
    data: {
      challenge1LockedAt: new Date(),
      challenge1LockCount: { increment: 1 },
    },
  });

  if (count === 0) return { ok: true };

  await audit({
    action: "challenge1.locked",
    actorId: participantId,
    actorRole: "PARTICIPANT",
    entityType: "attempt",
    entityId: attempt.id,
  });

  return { ok: true };
}

/**
 * Reopens Challenge 1 for one participant. Super admin only.
 *
 * Everything they wrote is still there — this clears the seal, it does not clear the
 * work. `challenge1LockCount` is deliberately left alone, so Challenges 2 to 4 stay
 * open: the participant is being allowed to correct something, not sent back to the
 * beginning.
 */
export async function unlockChallenge1(
  participantId: string,
  adminId: string,
  options: { minutes?: number } = {},
): Promise<LockResult> {
  const attempt = await db.attempt.findUnique({
    where: { participantId },
    select: { id: true, state: true, challenge1LockedAt: true },
  });

  if (!attempt) return { ok: false, message: "That participant has no attempt." };
  if (!attempt.challenge1LockedAt) {
    return { ok: false, message: "Challenge 1 is not locked for this participant." };
  }

  const sealed = attempt.state === "SUBMITTED" || attempt.state === "EXPIRED";

  // Still running: nothing to hand back, so this is only the seal coming off.
  if (!sealed) {
    await db.attempt.update({
      where: { id: attempt.id },
      data: { challenge1LockedAt: null },
    });

    await audit({
      action: "challenge1.unlocked",
      actorId: adminId,
      actorRole: "SUPER_ADMIN",
      entityType: "attempt",
      entityId: attempt.id,
      metadata: { reopenedAttempt: false },
    });

    return { ok: true };
  }

  return reopenForChallenge1(participantId, attempt.id, adminId, options.minutes);
}

/**
 * Reopening Challenge 1 on an attempt that has already been handed in.
 *
 * Clearing the seal is not enough once someone has submitted: their account is
 * SUBMITTED_LOCKED, so they cannot log in to use it, and the attempt is sealed, so
 * every write would be refused. That was the blocker — the button appeared and did
 * nothing a participant could feel.
 *
 * So this grants the three things together, and nothing more:
 *
 *   - the account can sign in again
 *   - the attempt runs again, on a clock the admin sets
 *   - Challenge 1 is editable
 *
 * `reopenedForChallenge1` is what keeps it to Challenge 1. Challenges 2 to 4 were
 * handed in and stay handed in — they are closed on the server, not merely hidden, and
 * the work in them is untouched. Submitting again re-seals Challenge 1 and clears the
 * flag.
 *
 * Nothing is duplicated by a second submission. `ChallengeSubmission` is keyed on
 * (attemptId, challenge) and `Evaluation` on attemptId, and the attempt id never
 * changes — so the resubmission overwrites rather than accumulating, and a judge sees
 * one row, the latest.
 */
async function reopenForChallenge1(
  participantId: string,
  attemptId: string,
  adminId: string,
  minutes: number | undefined,
): Promise<LockResult> {
  const requested = Math.round(minutes ?? 0);

  if (
    !Number.isFinite(requested) ||
    requested < MIN_REOPEN_MINUTES ||
    requested > MAX_REOPEN_MINUTES
  ) {
    return {
      ok: false,
      message: `Give them between ${MIN_REOPEN_MINUTES} and ${MAX_REOPEN_MINUTES} minutes.`,
    };
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + requested * 60_000);

  const result = await db.$transaction(async (tx) => {
    // The guard is the WHERE clause, as everywhere else that moves attempt state: two
    // admins pressing this together must produce one reopening, not two deadlines.
    const { count } = await tx.attempt.updateMany({
      where: { id: attemptId, state: { in: ["SUBMITTED", "EXPIRED"] } },
      data: {
        state: "IN_PROGRESS",
        endsAt,
        submittedAt: null,
        autoSubmitted: false,
        reopenedAt: now,
        reopenCount: { increment: 1 },
        challenge1LockedAt: null,
        reopenedForChallenge1: true,
      },
    });

    if (count === 0) return { ok: false as const };

    // Only lift the lock that submitting put on them. Someone blocked for cause stays
    // blocked — reopening Challenge 1 is not a pardon.
    await tx.user.updateMany({
      where: { id: participantId, status: "SUBMITTED_LOCKED" },
      data: { status: "ACTIVE" },
    });

    const evaluation = await tx.evaluation.findUnique({
      where: { attemptId },
      select: { id: true, judgeId: true },
    });

    let clearedCriteria = 0;

    if (evaluation) {
      // Only Challenge 1's marks go. A full reopen clears everything because
      // everything can change; here nothing but Challenge 1 can, and throwing away a
      // judge's work on the other three would be destroying marks that are still
      // accurate. The evaluation still has to be finalised again, because its total
      // described a Challenge 1 that is about to be rewritten.
      const challenge1Criteria = rubricFor("C1").criteria.map((criterion) => criterion.key);

      const removed = await tx.evaluationScore.deleteMany({
        where: { evaluationId: evaluation.id, criterion: { in: challenge1Criteria } },
      });
      clearedCriteria = removed.count;

      await tx.evaluation.update({
        where: { id: evaluation.id },
        data: {
          status: "ASSIGNED",
          totalScore: null,
          submittedAt: null,
          claimedAt: null,
        },
      });
    }

    return { ok: true as const, judgeId: evaluation?.judgeId ?? null, clearedCriteria };
  });

  if (!result.ok) {
    return { ok: false, message: "That attempt changed while you were reopening it. Try again." };
  }

  await audit({
    action: "challenge1.unlocked",
    actorId: adminId,
    actorRole: "SUPER_ADMIN",
    entityType: "attempt",
    entityId: attemptId,
    metadata: {
      participantId,
      reopenedAttempt: true,
      minutesGranted: requested,
      endsAt: endsAt.toISOString(),
      judgeId: result.judgeId,
      clearedChallenge1Criteria: result.clearedCriteria,
    },
  });

  return { ok: true };
}
