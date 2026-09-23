import "server-only";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Sealing an attempt — the one genuinely irreversible operation in the product.
 *
 * Three things have to happen together, or the result is incoherent: the attempt is
 * closed, the account is locked, and every open session dies. Half of that applied
 * would mean a participant who has "submitted" but can still type.
 *
 * Both routes in — the participant pressing Submit, and the clock running out (D1) —
 * come through here, because they must produce exactly the same state. The only
 * difference is a flag recording which it was.
 *
 * Nothing is assigned to a judge here. Submissions arrive unassigned and a judge takes
 * one by putting their name against it (see judge-assignment.ts). That is the
 * organisers' decision: with judges picking work off a shared list, an automatic
 * assignment would only be a suggestion that has to be undone.
 */

export interface FinalizeResult {
  /** False when the attempt was already closed — a replay, or two tabs racing. */
  changed: boolean;
}

export async function finalizeAttempt(
  participantId: string,
  options: { auto: boolean },
): Promise<FinalizeResult> {
  const result = await db.$transaction(async (tx) => {
    // The guard is the WHERE clause. A double-tapped Confirm, a replayed request, or
    // the clock expiring at the same moment someone presses Submit must all end with
    // one sealed attempt.
    const { count } = await tx.attempt.updateMany({
      where: { participantId, state: "IN_PROGRESS" },
      data: {
        state: "SUBMITTED",
        submittedAt: new Date(),
        autoSubmitted: options.auto,
        // If this attempt had been handed back by an admin, it is no longer withdrawn:
        // the replacement work has arrived and judging can see it again.
        reopenedAt: null,
      },
    });

    if (count === 0) return { changed: false };

    const attempt = await tx.attempt.findUniqueOrThrow({
      where: { participantId },
      select: { id: true, evaluation: { select: { id: true } } },
    });

    // Requirement 5: the account is closed. They cannot log in again.
    await tx.user.update({
      where: { id: participantId },
      data: { status: "SUBMITTED_LOCKED" },
    });

    // Every other tab dies with it, so nothing can keep writing against a sealed
    // attempt while its interface still looks alive.
    await tx.session.updateMany({
      where: { userId: participantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // A reopened attempt coming back keeps whichever judge had already taken it —
    // their scores were cleared at the reopen, but the claim is still theirs.
    if (attempt.evaluation) {
      await tx.evaluation.update({
        where: { id: attempt.evaluation.id },
        data: { status: "ASSIGNED", assignedAt: new Date(), claimedAt: null },
      });
    }

    return { changed: true };
  });

  if (result.changed) {
    await audit({
      action: options.auto ? "attempt.auto_submitted" : "attempt.submitted",
      actorId: options.auto ? null : participantId,
      actorRole: options.auto ? null : "PARTICIPANT",
      entityType: "attempt",
      entityId: participantId,
      metadata: { auto: options.auto },
    });
  }

  return result;
}
