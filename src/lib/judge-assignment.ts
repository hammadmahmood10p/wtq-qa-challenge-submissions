import "server-only";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { BONUS_DEFAULT } from "@/lib/scoring";

/**
 * Who is reviewing what.
 *
 * Submissions arrive unassigned. A judge takes one by putting their name against it in
 * the shared table, and every other judge sees that the moment they look — which is
 * the whole point of the change: the list is a shared worktray, not a set of private
 * queues, and the name in the Judge column is how a panel of people avoid doing the
 * same submission twice.
 *
 * The evaluation row is created at that moment rather than at submission, so "no row"
 * and "nobody has taken this" are the same state and cannot drift apart.
 *
 * Two judges reaching for the same submission at the same moment is expected, not
 * exceptional — the table is refreshed by hand, so both may be looking at a view that
 * says nobody has it. UNIQUE(attemptId) settles the race in the database, and the
 * judge who loses is told plainly rather than silently overwriting a colleague.
 */

export interface AssignmentResult {
  ok: boolean;
  message?: string;
}

export interface JudgeOption {
  id: string;
  fullName: string;
}

/** Everyone who may be put against a submission: approved judges, in name order. */
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

/**
 * Puts a judge against a submission, or takes one off it.
 *
 * Anybody may take an unassigned submission — for themselves, or on someone else's
 * behalf, which is why the dropdown lists the whole panel. Once it is taken, only the
 * judge holding it or a super admin may change it: a claim that any passer-by could
 * overwrite would not be worth showing.
 */
export async function assignSubmission(
  attemptId: string,
  judgeId: string | null,
  actor: AssignmentActor,
): Promise<AssignmentResult> {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, state: { in: ["SUBMITTED", "EXPIRED"] } },
    select: {
      id: true,
      chosenTrack: true,
      evaluation: {
        select: { id: true, judgeId: true, status: true, _count: { select: { scores: true } } },
      },
    },
  });

  if (!attempt) return { ok: false, message: "That submission no longer exists." };

  const current = attempt.evaluation;

  if (current) {
    if (current.status === "SUBMITTED" && actor.role !== "SUPER_ADMIN") {
      return { ok: false, message: "This score has been submitted. Only a super admin can change it." };
    }

    if (current.judgeId !== actor.id && actor.role !== "SUPER_ADMIN") {
      return {
        ok: false,
        message: "Someone else has already taken this submission. Refresh to see who.",
      };
    }
  }

  // ---- releasing ---------------------------------------------------------
  if (judgeId === null) {
    if (!current) return { ok: true };

    // Deleting the row would take any scores with it. Handing it to somebody else is
    // the move here, not throwing the work away.
    if (current._count.scores > 0 || current.status === "SUBMITTED") {
      return {
        ok: false,
        message: "This submission has been scored. Choose another judge rather than clearing it.",
      };
    }

    await db.evaluation.deleteMany({ where: { id: current.id, status: { not: "SUBMITTED" } } });

    await audit({
      action: "evaluation.unassigned",
      actorId: actor.id,
      actorRole: actor.role,
      entityType: "attempt",
      entityId: attemptId,
      metadata: { from: current.judgeId },
    });

    return { ok: true };
  }

  // ---- assigning ---------------------------------------------------------
  const judge = await db.user.findFirst({
    where: { id: judgeId, role: "JUDGE", status: "ACTIVE" },
    select: { id: true },
  });

  if (!judge) return { ok: false, message: "That judge is not available." };

  if (current) {
    if (current.judgeId === judgeId) return { ok: true };

    await db.evaluation.update({
      where: { id: current.id },
      data: { judgeId, assignedAt: new Date(), claimedAt: null },
    });
  } else {
    try {
      await db.evaluation.create({
        data: {
          attemptId,
          judgeId,
          status: "ASSIGNED",
          // The Challenge 3 bonus is granted by taking that route, not by the judge
          // deciding to give it. Seeding it here means the judge sees +5 already
          // applied and has to choose to reduce it, which is the way round the
          // organisers described.
          bonusPoints: attempt.chosenTrack === "C3" ? BONUS_DEFAULT : null,
        },
      });
    } catch {
      // Another judge got there between our read and our write.
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
    metadata: { judgeId, previous: current?.judgeId ?? null, self: judgeId === actor.id },
  });

  return { ok: true };
}
