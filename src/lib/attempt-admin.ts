import "server-only";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { MAX_REOPEN_MINUTES, MIN_REOPEN_MINUTES } from "@/lib/attempt-admin-limits";
import { storage } from "@/lib/storage";

/**
 * The two ways a super admin can undo a sealed attempt.
 *
 * `reopenAttempt` hands the work back: everything the participant saved is still
 * there, and they carry on from where they stopped. `resetAttempt` throws it away and
 * gives them a clean run. They look similar from the admin console and are entirely
 * different operations, which is why they are separate functions with separate audit
 * actions rather than one call with a flag.
 *
 * What makes both safe against a second judge picking the work up mid-repair is the
 * state machine, not a new column: every judging query filters on
 * `state IN (SUBMITTED, EXPIRED)`, so an attempt handed back to a participant drops
 * out of the queues the moment it returns to IN_PROGRESS, and reappears — as the same
 * attempt, overwriting itself — when they submit again. There is no second submission
 * row to collide with, because `ChallengeSubmission` is keyed on (attemptId,
 * challenge) and the attempt id never changes.
 */

export interface AttemptAdminResult {
  ok: boolean;
  message?: string;
}

export {
  FALLBACK_REOPEN_MINUTES,
  MAX_REOPEN_MINUTES,
  MIN_REOPEN_MINUTES,
  remainingMinutesAtSubmit,
} from "@/lib/attempt-admin-limits";

/**
 * Hands a sealed attempt back to the participant with their work intact.
 *
 * The clock is set fresh from `minutes` rather than resumed from a stored remainder.
 * An attempt that sealed by mistake and one that sealed because a laptop died need
 * different amounts of time, and only the person dealing with the participant knows
 * which this is — so the amount is an input, defaulted from what they had left.
 *
 * `startedAt` is deliberately not touched. It records when this person began, which is
 * still true; rewriting it would make the audit trail lie about the morning.
 */
export async function reopenAttempt(
  participantId: string,
  options: { minutes: number; adminId: string },
): Promise<AttemptAdminResult> {
  const minutes = Math.round(options.minutes);

  if (!Number.isFinite(minutes) || minutes < MIN_REOPEN_MINUTES || minutes > MAX_REOPEN_MINUTES) {
    return {
      ok: false,
      message: `Give them between ${MIN_REOPEN_MINUTES} and ${MAX_REOPEN_MINUTES} minutes.`,
    };
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + minutes * 60_000);

  const result = await db.$transaction(async (tx) => {
    // The guard is the WHERE clause, as everywhere else that changes attempt state:
    // two admins reaching for the same row must not produce two reopenings and two
    // different deadlines.
    const { count } = await tx.attempt.updateMany({
      where: { participantId, state: { in: ["SUBMITTED", "EXPIRED"] } },
      data: {
        state: "IN_PROGRESS",
        endsAt,
        submittedAt: null,
        autoSubmitted: false,
        reopenedAt: now,
        reopenCount: { increment: 1 },
      },
    });

    if (count === 0) return { ok: false as const };

    const attempt = await tx.attempt.findUniqueOrThrow({
      where: { participantId },
      select: { id: true, evaluation: { select: { id: true, judgeId: true } } },
    });

    // Only lift the lock that submitting put on them. Someone blocked for cause
    // stays blocked — reopening an attempt is not a pardon.
    await tx.user.updateMany({
      where: { id: participantId, status: "SUBMITTED_LOCKED" },
      data: { status: "ACTIVE" },
    });

    // Any scores describe work that is about to change, so they go. The assignment
    // itself stays: when this comes back it should reach the judge who already has
    // the context, not the back of someone else's queue.
    if (attempt.evaluation) {
      await tx.evaluationScore.deleteMany({
        where: { evaluationId: attempt.evaluation.id },
      });
      await tx.evaluation.update({
        where: { id: attempt.evaluation.id },
        data: {
          status: "ASSIGNED",
          totalScore: null,
          bonusPoints: null,
          submittedAt: null,
          claimedAt: null,
        },
      });
    }

    return {
      ok: true as const,
      attemptId: attempt.id,
      judgeId: attempt.evaluation?.judgeId ?? null,
      clearedScores: attempt.evaluation !== null,
    };
  });

  if (!result.ok) {
    return { ok: false, message: "That participant has no submitted attempt to reopen." };
  }

  await audit({
    action: "admin.attempt_reopened",
    actorId: options.adminId,
    actorRole: "SUPER_ADMIN",
    entityType: "attempt",
    entityId: result.attemptId,
    metadata: {
      participantId,
      minutesGranted: minutes,
      endsAt: endsAt.toISOString(),
      judgeId: result.judgeId,
      clearedScores: result.clearedScores,
    },
  });

  return { ok: true };
}

/**
 * Wipes a sealed attempt so the participant starts again from nothing.
 *
 * Everything they submitted is deleted: findings, evidence, uploads, links, answers
 * and any scoring. This is the destructive one, and it is not recoverable — the
 * schema holds one attempt per participant, so there is nowhere for the old run to go.
 *
 * Files are removed after the transaction commits, not inside it. Object storage is
 * not transactional, so deleting first would risk destroying a file for a database
 * change that then rolls back; this way the worst case is an orphaned blob, which
 * costs storage and nothing else.
 */
export async function resetAttempt(
  participantId: string,
  options: { adminId: string },
): Promise<AttemptAdminResult> {
  const attempt = await db.attempt.findUnique({
    where: { participantId },
    select: {
      id: true,
      state: true,
      submissions: { select: { fileKey: true } },
      challenge1Entries: { select: { attachments: { select: { fileKey: true } } } },
    },
  });

  if (!attempt || (attempt.state !== "SUBMITTED" && attempt.state !== "EXPIRED")) {
    return { ok: false, message: "That participant has no submitted attempt to clear." };
  }

  // Read the keys before anything deletes the rows that hold them.
  const fileKeys = [
    ...attempt.submissions.map((s) => s.fileKey),
    ...attempt.challenge1Entries.flatMap((e) => e.attachments.map((a) => a.fileKey)),
  ].filter((key): key is string => Boolean(key));

  const cleared = await db.$transaction(async (tx) => {
    const { count } = await tx.attempt.updateMany({
      where: { id: attempt.id, state: { in: ["SUBMITTED", "EXPIRED"] } },
      data: {
        state: "NOT_STARTED",
        startedAt: null,
        endsAt: null,
        submittedAt: null,
        autoSubmitted: false,
        chosenTrack: null,
        chosenTrackAt: null,
        reopenedAt: null,
        resetCount: { increment: 1 },
      },
    });

    if (count === 0) return false;

    // Attachments and evaluation scores go with their parents by cascade.
    await tx.evaluation.deleteMany({ where: { attemptId: attempt.id } });
    await tx.challenge1Entry.deleteMany({ where: { attemptId: attempt.id } });
    await tx.challengeSubmission.deleteMany({ where: { attemptId: attempt.id } });

    await tx.user.updateMany({
      where: { id: participantId, status: "SUBMITTED_LOCKED" },
      data: { status: "ACTIVE" },
    });

    return true;
  });

  if (!cleared) {
    return { ok: false, message: "That attempt changed while you were clearing it. Try again." };
  }

  let filesDeleted = 0;
  const adapter = storage();

  for (const key of fileKeys) {
    try {
      await adapter.delete(key);
      filesDeleted++;
    } catch {
      // An orphaned object is untidy; failing the reset over it would be worse,
      // because the database is already consistent by this point.
    }
  }

  await audit({
    action: "admin.attempt_reset",
    actorId: options.adminId,
    actorRole: "SUPER_ADMIN",
    entityType: "attempt",
    entityId: attempt.id,
    metadata: {
      participantId,
      filesFound: fileKeys.length,
      filesDeleted,
    },
  });

  return { ok: true };
}
