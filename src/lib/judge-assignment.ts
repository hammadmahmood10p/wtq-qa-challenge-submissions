import "server-only";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { BONUS_DEFAULT } from "@/lib/scoring";

/**
 * Who is reviewing what.
 *
 * Submissions arrive unclaimed. A judge takes one for themselves, and every other
 * judge sees their name against it on the next refresh — which is the point: the list
 * is a shared worktray, not a set of private queues, and the name in the Judge column
 * is how a panel avoids two people reading the same submission.
 *
 * **A judge may only ever claim for themselves.** The earlier design offered a dropdown
 * of the whole panel so that work could be handed over, and judges found it confusing:
 * a control that lets you put someone else's name against something invites exactly the
 * mistake it was meant to solve. Handing over is now a super admin's job, done by
 * releasing the submission back to the pool for whoever picks it up.
 *
 * Two judges reaching for the same submission at the same moment is expected, not
 * exceptional — the table is refreshed by hand, so both may be looking at a view that
 * says nobody holds it. The conditional update settles the race in the database, and
 * the judge who loses is told plainly rather than silently overwriting a colleague.
 */

export interface AssignmentResult {
  ok: boolean;
  message?: string;
}

export interface JudgeOption {
  id: string;
  fullName: string;
}

/**
 * Approved judges, in name order.
 *
 * Kept although nothing calls it today. It existed to populate the Judge column's
 * dropdown, which is gone — but "who is on the panel" is a question the console will
 * ask again, and the query is three lines. Delete it if a second release passes
 * without a caller.
 */
export async function listActiveJudges(): Promise<JudgeOption[]> {
  return db.user.findMany({
    where: { role: "JUDGE", status: "ACTIVE" },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
}

export interface AssignmentActor {
  id: string;
  role: "JUDGE" | "SUPER_ADMIN";
}

async function loadAttempt(attemptId: string) {
  return db.attempt.findFirst({
    where: { id: attemptId, state: { in: ["SUBMITTED", "EXPIRED"] } },
    select: {
      id: true,
      chosenTrack: true,
      evaluation: {
        select: {
          id: true,
          judgeId: true,
          status: true,
          judge: { select: { fullName: true } },
        },
      },
    },
  });
}

/**
 * Takes a submission for yourself.
 *
 * The actor is always the new holder — there is no parameter for whose name goes on,
 * because there is no longer a way to put somebody else's there.
 */
export async function claimSubmission(
  attemptId: string,
  actor: AssignmentActor,
): Promise<AssignmentResult> {
  const attempt = await loadAttempt(attemptId);
  if (!attempt) return { ok: false, message: "That submission no longer exists." };

  const current = attempt.evaluation;

  if (current?.judgeId) {
    if (current.judgeId === actor.id) return { ok: true };

    return {
      ok: false,
      message: `${current.judge?.fullName ?? "Another judge"} is already reviewing this. Refresh to see the current list.`,
    };
  }

  if (current) {
    // An unclaimed row with its scoring intact: a super admin released it, or reopened
    // it for a second look. Picking it up keeps whatever is already there.
    //
    // The WHERE clause carries `judgeId: null`, so if somebody claimed it between the
    // read above and this write, zero rows match and nobody is overwritten.
    const { count } = await db.evaluation.updateMany({
      where: { id: current.id, judgeId: null },
      data: { judgeId: actor.id, assignedAt: new Date(), claimedAt: null },
    });

    if (count === 0) {
      return {
        ok: false,
        message: "Someone else took this submission a moment ago. Refresh to see who.",
      };
    }
  } else {
    try {
      await db.evaluation.create({
        data: {
          attemptId,
          judgeId: actor.id,
          status: "ASSIGNED",
          // The Challenge 3 bonus is granted by taking that route, not by the judge
          // deciding to give it. Seeding it here means the judge sees +5 already
          // applied and has to choose to take it away.
          bonusPoints: attempt.chosenTrack === "C3" ? BONUS_DEFAULT : null,
        },
      });
    } catch {
      // UNIQUE(attemptId) — another judge got there between our read and our write.
      return {
        ok: false,
        message: "Someone else took this submission a moment ago. Refresh to see who.",
      };
    }
  }

  await audit({
    action: "evaluation.assigned",
    actorId: actor.id,
    actorRole: actor.role,
    entityType: "attempt",
    entityId: attemptId,
    metadata: { self: true },
  });

  return { ok: true };
}

/**
 * Puts a submission back in the pool, keeping everything scored so far.
 *
 * Super admin only — this is the handover that judges no longer do for themselves. The
 * evaluation row and its scores survive; only the holder is cleared, so the next judge
 * to take it sees the work rather than a blank scorecard.
 */
export async function releaseSubmission(
  attemptId: string,
  actor: AssignmentActor,
): Promise<AssignmentResult> {
  if (actor.role !== "SUPER_ADMIN") {
    return { ok: false, message: "Only a super admin can unassign a submission." };
  }

  const attempt = await loadAttempt(attemptId);
  if (!attempt) return { ok: false, message: "That submission no longer exists." };

  const current = attempt.evaluation;
  if (!current || !current.judgeId) return { ok: true };

  if (current.status === "SUBMITTED") {
    // Unassigning a finalised score would leave a reviewed submission with nobody
    // against it, which reads as an error rather than as a decision. Re-Evaluate is
    // the operation for that, and it says what it does.
    return {
      ok: false,
      message: "This score is final. Use Re-Evaluate to reopen it for another judge.",
    };
  }

  await db.evaluation.update({
    where: { id: current.id },
    data: { judgeId: null, claimedAt: null },
  });

  await audit({
    action: "evaluation.unassigned",
    actorId: actor.id,
    actorRole: actor.role,
    entityType: "attempt",
    entityId: attemptId,
    metadata: { from: current.judge?.fullName ?? null },
  });

  return { ok: true };
}

/**
 * Reopens a finalised score and puts it back in the pool.
 *
 * Super admin only. Everything already scored stays — the point is a second look at a
 * result, not a fresh start, so whichever judge picks it up sees the previous marks
 * and changes only what they disagree with.
 *
 * An unlock row is written as well as an audit entry, because a reopened result is the
 * one thing most likely to be queried weeks later, and the unlock table is where the
 * review page already shows that history.
 */
export async function reEvaluateSubmission(
  attemptId: string,
  actor: AssignmentActor,
): Promise<AssignmentResult> {
  if (actor.role !== "SUPER_ADMIN") {
    return { ok: false, message: "Only a super admin can reopen a submitted score." };
  }

  const attempt = await loadAttempt(attemptId);
  if (!attempt) return { ok: false, message: "That submission no longer exists." };

  const current = attempt.evaluation;
  if (!current) return { ok: false, message: "This submission has not been reviewed yet." };

  if (current.status !== "SUBMITTED") {
    return { ok: false, message: "This score has not been finalised, so there is nothing to reopen." };
  }

  await db.$transaction(async (tx) => {
    await tx.evaluation.update({
      where: { id: current.id },
      data: {
        // Un-finalised. The frozen total goes, because it describes a score that is
        // about to change; the individual criterion scores stay.
        status: "IN_PROGRESS",
        totalScore: null,
        submittedAt: null,
        // And back into the pool, so any judge can take it.
        judgeId: null,
        claimedAt: null,
      },
    });

    await tx.evaluationUnlock.create({
      data: {
        evaluationId: current.id,
        unlockedById: actor.id,
        reason: `Reopened for re-evaluation. Previously finalised by ${current.judge?.fullName ?? "a judge"}.`,
      },
    });
  });

  await audit({
    action: "evaluation.reopened",
    actorId: actor.id,
    actorRole: actor.role,
    entityType: "attempt",
    entityId: attemptId,
    metadata: { from: current.judge?.fullName ?? null },
  });

  return { ok: true };
}
