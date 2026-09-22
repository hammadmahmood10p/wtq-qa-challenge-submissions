import "server-only";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Sealing an attempt — the one genuinely irreversible operation in the product.
 *
 * Four things have to happen together, or the result is incoherent: the attempt is
 * closed, the account is locked, every open session dies, and the work is handed to a
 * judge. Half of that applied would mean a participant who has "submitted" but can
 * still type, or an account locked out of a submission nobody will ever review.
 *
 * Both routes in — the participant pressing Submit, and the clock running out (D1) —
 * come through here, because they must produce exactly the same state. The only
 * difference is a flag recording which it was.
 */

export interface FinalizeResult {
  /** False when the attempt was already closed — a replay, or two tabs racing. */
  changed: boolean;
  assignedJudgeId: string | null;
}

/**
 * Picks the judge with the lightest outstanding queue.
 *
 * Assignment on submission rather than a shared list to pick from (D3, revised): with
 * judging happening the same afternoon, a judge should open the app to their own
 * balanced queue and start reading, not negotiate with colleagues over who takes what.
 *
 * Two simultaneous submissions can choose the same judge, which costs a little
 * balance and nothing else. UNIQUE(attemptId) on evaluations is what actually
 * prevents a submission being reviewed twice.
 */
async function pickJudge(tx: Pick<typeof db, "$queryRaw">): Promise<string | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id
    FROM users u
    LEFT JOIN evaluations e
      ON e."judgeId" = u.id AND e.status <> 'SUBMITTED'
    WHERE u.role = 'JUDGE' AND u.status = 'ACTIVE'
    GROUP BY u.id, u."createdAt"
    ORDER BY COUNT(e.id) ASC, u."createdAt" ASC
    LIMIT 1
  `;

  return rows[0]?.id ?? null;
}

export async function finalizeAttempt(
  participantId: string,
  options: { auto: boolean },
): Promise<FinalizeResult> {
  const result = await db.$transaction(async (tx) => {
    // The guard is the WHERE clause. A double-tapped Confirm, a replayed request, or
    // the clock expiring at the same moment someone presses Submit must all end with
    // one sealed attempt and one evaluation.
    const { count } = await tx.attempt.updateMany({
      where: { participantId, state: "IN_PROGRESS" },
      data: { state: "SUBMITTED", submittedAt: new Date(), autoSubmitted: options.auto },
    });

    if (count === 0) return { changed: false, assignedJudgeId: null };

    const attempt = await tx.attempt.findUniqueOrThrow({
      where: { participantId },
      select: { id: true },
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

    const judgeId = await pickJudge(tx);

    if (judgeId) {
      await tx.evaluation.create({
        data: { attemptId: attempt.id, judgeId, status: "ASSIGNED" },
      });
    }

    return { changed: true, assignedJudgeId: judgeId };
  });

  if (result.changed) {
    await audit({
      action: options.auto ? "attempt.auto_submitted" : "attempt.submitted",
      actorId: options.auto ? null : participantId,
      actorRole: options.auto ? null : "PARTICIPANT",
      entityType: "attempt",
      entityId: participantId,
      metadata: {
        auto: options.auto,
        assignedJudgeId: result.assignedJudgeId,
        // Worth recording: it means nobody was available to review this yet, and it
        // has to be picked up by assignUnassignedSubmissions later.
        unassigned: result.assignedJudgeId === null,
      },
    });
  }

  return result;
}

/**
 * Assigns any submission that arrived while no judge was approved.
 *
 * On event day judges may well be approved after the first participants finish, and a
 * submission with no evaluation row is invisible to the judging screens. Called when
 * a judge is approved and when a judge opens their queue, so the gap closes itself
 * rather than needing someone to notice.
 */
export async function assignUnassignedSubmissions(): Promise<number> {
  const orphans = await db.attempt.findMany({
    where: {
      state: { in: ["SUBMITTED", "EXPIRED"] },
      evaluation: null,
    },
    select: { id: true },
    take: 500,
  });

  let assigned = 0;

  for (const attempt of orphans) {
    const judgeId = await pickJudge(db);
    if (!judgeId) break; // still no judges — nothing to do

    try {
      await db.evaluation.create({
        data: { attemptId: attempt.id, judgeId, status: "ASSIGNED" },
      });
      assigned++;
    } catch {
      // Another request assigned it first; UNIQUE(attemptId) settled the race.
    }
  }

  if (assigned > 0) {
    await audit({
      action: "evaluation.assigned",
      entityType: "attempt",
      metadata: { count: assigned, reason: "backfill" },
    });
  }

  return assigned;
}
