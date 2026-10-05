import "server-only";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { canSealChallenge1 } from "@/lib/challenge1-limits";

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
): Promise<LockResult> {
  const attempt = await db.attempt.findUnique({
    where: { participantId },
    select: { id: true, challenge1LockedAt: true },
  });

  if (!attempt) return { ok: false, message: "That participant has no attempt." };
  if (!attempt.challenge1LockedAt) {
    return { ok: false, message: "Challenge 1 is not locked for this participant." };
  }

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
  });

  return { ok: true };
}
