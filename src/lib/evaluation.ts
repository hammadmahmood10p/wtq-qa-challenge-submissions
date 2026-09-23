import "server-only";

import type { ChallengeKey } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  BONUS_MAX,
  BONUS_MIN,
  computeTotal,
  criterionByKey,
  isComplete,
  rubricFor,
  scorableChallenges,
} from "@/lib/scoring";

/**
 * Scoring a submission.
 *
 * Two rules run through everything here, and both are enforced on the server rather
 * than by what the interface happens to offer:
 *
 *   1. Only the judge this submission was assigned to may score it — or a super admin,
 *      who is the escalation path when a judge is unavailable and who the organisers
 *      asked to be able to adjust the bonus.
 *   2. A submitted evaluation is frozen. Reopening it is a super admin action that
 *      records a reason, because a result that can be quietly rewritten is not a
 *      result.
 *
 * Scores are saved per challenge, matching how a judge actually works: read one task,
 * score it, move on. Nothing is required to be complete until the final submission,
 * so a judge interrupted halfway loses nothing.
 */

export interface EvaluationActor {
  id: string;
  role: "JUDGE" | "SUPER_ADMIN";
}

export interface EvaluationResult {
  ok: boolean;
  message?: string;
  /** The recomputed running total, so the caller can reconcile without a round trip. */
  total?: number;
}

interface LoadedEvaluation {
  id: string;
  judgeId: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED";
  bonusPoints: number | null;
  chosenTrack: "C3" | "C4" | null;
  scores: Map<string, number>;
}

async function load(attemptId: string): Promise<LoadedEvaluation | null> {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, state: { in: ["SUBMITTED", "EXPIRED"] } },
    select: {
      chosenTrack: true,
      evaluation: {
        select: {
          id: true,
          judgeId: true,
          status: true,
          bonusPoints: true,
          scores: { select: { criterion: true, score: true } },
        },
      },
    },
  });

  if (!attempt?.evaluation) return null;

  return {
    id: attempt.evaluation.id,
    judgeId: attempt.evaluation.judgeId,
    status: attempt.evaluation.status,
    bonusPoints:
      attempt.evaluation.bonusPoints === null ? null : Number(attempt.evaluation.bonusPoints),
    chosenTrack: attempt.chosenTrack,
    scores: new Map(attempt.evaluation.scores.map((s) => [s.criterion, Number(s.score)])),
  };
}

/**
 * Whether this person may change this evaluation right now.
 *
 * Deliberately returns the reason rather than a bare boolean: "someone else has this
 * one" and "this one is finished" send a judge to different places, and an interface
 * that says only "you cannot" sends them to the organisers.
 */
function guard(evaluation: LoadedEvaluation, actor: EvaluationActor): string | null {
  if (actor.role === "JUDGE" && evaluation.judgeId !== actor.id) {
    return "This submission is assigned to another judge.";
  }

  if (evaluation.status === "SUBMITTED") {
    return "This score has been submitted and is locked. A super admin can reopen it.";
  }

  return null;
}

/**
 * Saves the scores for one challenge.
 *
 * Partial saves are allowed — a blank criterion is removed rather than stored as zero,
 * because "not yet judged" and "judged as worth nothing" are different things and the
 * final submission check depends on being able to tell them apart.
 */
export async function saveChallengeScores(
  attemptId: string,
  challenge: ChallengeKey,
  scores: Record<string, number | null>,
  actor: EvaluationActor,
): Promise<EvaluationResult> {
  const evaluation = await load(attemptId);
  if (!evaluation) return { ok: false, message: "This submission has no judge assigned yet." };

  const refusal = guard(evaluation, actor);
  if (refusal) return { ok: false, message: refusal };

  const allowed = new Set(rubricFor(challenge).criteria.map((c) => c.key));
  const scorable = new Set(scorableChallenges(evaluation.chosenTrack));

  if (!scorable.has(challenge)) {
    return { ok: false, message: "The participant did not take that challenge." };
  }

  const toWrite: { criterion: string; score: number }[] = [];
  const toClear: string[] = [];

  for (const [key, value] of Object.entries(scores)) {
    if (!allowed.has(key)) {
      return { ok: false, message: `"${key}" is not scored under this challenge.` };
    }

    if (value === null) {
      toClear.push(key);
      continue;
    }

    const criterion = criterionByKey(key)!;

    if (!Number.isFinite(value) || value < 0 || value > criterion.max) {
      return { ok: false, message: `${criterion.label} must be between 0 and ${criterion.max}.` };
    }

    // Halves are useful to a panel splitting the difference; finer than that is noise.
    if (Math.round(value * 2) !== value * 2) {
      return { ok: false, message: `${criterion.label} must be a whole or half number.` };
    }

    toWrite.push({ criterion: key, score: value });
  }

  await db.$transaction(async (tx) => {
    for (const row of toWrite) {
      await tx.evaluationScore.upsert({
        where: { evaluationId_criterion: { evaluationId: evaluation.id, criterion: row.criterion } },
        create: { evaluationId: evaluation.id, criterion: row.criterion, score: row.score },
        update: { score: row.score, savedAt: new Date() },
      });
    }

    if (toClear.length > 0) {
      await tx.evaluationScore.deleteMany({
        where: { evaluationId: evaluation.id, criterion: { in: toClear } },
      });
    }

    // First save turns an assignment into work in progress, which is what the judge's
    // own queue counts are built from.
    if (evaluation.status === "ASSIGNED") {
      await tx.evaluation.update({
        where: { id: evaluation.id },
        data: { status: "IN_PROGRESS", claimedAt: new Date() },
      });
    }
  });

  await audit({
    action: "evaluation.score_saved",
    actorId: actor.id,
    actorRole: actor.role,
    entityType: "evaluation",
    entityId: evaluation.id,
    metadata: { challenge, saved: toWrite.length, cleared: toClear.length },
  });

  const merged = new Map(evaluation.scores);
  for (const row of toWrite) merged.set(row.criterion, row.score);
  for (const key of toClear) merged.delete(key);

  return {
    ok: true,
    total: computeTotal(merged, evaluation.chosenTrack, evaluation.bonusPoints),
  };
}

/**
 * Adjusts the Challenge 3 bonus.
 *
 * Granted automatically at +5 when the participant commits to Challenge 3, and signed
 * so it can be taken away as well as given: the organisers were explicit that a judge
 * who finds nothing behind the choice should be able to take it to −5.
 */
export async function saveBonus(
  attemptId: string,
  bonus: number,
  actor: EvaluationActor,
): Promise<EvaluationResult> {
  const evaluation = await load(attemptId);
  if (!evaluation) return { ok: false, message: "This submission has no judge assigned yet." };

  const refusal = guard(evaluation, actor);
  if (refusal) return { ok: false, message: refusal };

  if (evaluation.chosenTrack !== "C3") {
    return { ok: false, message: "The bonus only applies to participants who chose Challenge 3." };
  }

  if (!Number.isFinite(bonus) || bonus < BONUS_MIN || bonus > BONUS_MAX) {
    return { ok: false, message: `The bonus must be between ${BONUS_MIN} and ${BONUS_MAX}.` };
  }

  if (Math.round(bonus * 2) !== bonus * 2) {
    return { ok: false, message: "The bonus must be a whole or half number." };
  }

  await db.evaluation.update({
    where: { id: evaluation.id },
    data: {
      bonusPoints: bonus,
      ...(evaluation.status === "ASSIGNED" ? { status: "IN_PROGRESS" as const } : {}),
    },
  });

  await audit({
    action: "evaluation.bonus_adjusted",
    actorId: actor.id,
    actorRole: actor.role,
    entityType: "evaluation",
    entityId: evaluation.id,
    metadata: { from: evaluation.bonusPoints, to: bonus },
  });

  return { ok: true, total: computeTotal(evaluation.scores, evaluation.chosenTrack, bonus) };
}

/**
 * Freezes the result.
 *
 * Every applicable criterion must have a score first. This is the one place the
 * product insists on completeness, and it is the right one: a partial score submitted
 * by accident would be indistinguishable from a deliberate low one once it is locked.
 *
 * The total is written to the row rather than recomputed on read, so that a later
 * change to the rubric cannot retroactively alter a result that has already been
 * declared.
 */
export async function submitFinalScore(
  attemptId: string,
  actor: EvaluationActor,
): Promise<EvaluationResult> {
  const evaluation = await load(attemptId);
  if (!evaluation) return { ok: false, message: "This submission has no judge assigned yet." };

  const refusal = guard(evaluation, actor);
  if (refusal) return { ok: false, message: refusal };

  if (!isComplete(evaluation.chosenTrack, new Set(evaluation.scores.keys()))) {
    return {
      ok: false,
      message: "Every criterion needs a score before the final score can be submitted.",
    };
  }

  const total = computeTotal(evaluation.scores, evaluation.chosenTrack, evaluation.bonusPoints);

  // The WHERE clause is the guard, as everywhere else: two tabs pressing this at once
  // must produce one submission, not two conflicting totals.
  const { count } = await db.evaluation.updateMany({
    where: { id: evaluation.id, status: { not: "SUBMITTED" } },
    data: { status: "SUBMITTED", totalScore: total, submittedAt: new Date() },
  });

  if (count === 0) {
    return { ok: false, message: "This score was already submitted." };
  }

  await audit({
    action: "evaluation.submitted",
    actorId: actor.id,
    actorRole: actor.role,
    entityType: "evaluation",
    entityId: evaluation.id,
    metadata: { total, bonus: evaluation.bonusPoints, track: evaluation.chosenTrack },
  });

  return { ok: true, total };
}

/**
 * Reopens a locked evaluation. Super admin only, and the reason is not optional.
 *
 * The unlock is recorded as its own row rather than a flag on the evaluation, so a
 * submission reopened twice has two records and neither overwrites the other. The
 * frozen total is cleared, because leaving it would show a result the current scores
 * no longer add up to.
 */
export async function unlockEvaluation(
  attemptId: string,
  reason: string,
  actor: EvaluationActor,
): Promise<EvaluationResult> {
  if (actor.role !== "SUPER_ADMIN") {
    return { ok: false, message: "Only a super admin can reopen a submitted score." };
  }

  const trimmed = reason.trim();
  if (trimmed.length < 4) {
    return { ok: false, message: "Please give a reason for reopening this score." };
  }

  const evaluation = await load(attemptId);
  if (!evaluation) return { ok: false, message: "This submission has no judge assigned yet." };

  if (evaluation.status !== "SUBMITTED") {
    return { ok: false, message: "This score is not locked." };
  }

  await db.$transaction(async (tx) => {
    await tx.evaluation.update({
      where: { id: evaluation.id },
      data: { status: "IN_PROGRESS", totalScore: null, submittedAt: null },
    });

    await tx.evaluationUnlock.create({
      data: { evaluationId: evaluation.id, unlockedById: actor.id, reason: trimmed.slice(0, 500) },
    });
  });

  await audit({
    action: "evaluation.unlocked",
    actorId: actor.id,
    actorRole: actor.role,
    entityType: "evaluation",
    entityId: evaluation.id,
    metadata: { reason: trimmed.slice(0, 500) },
  });

  return { ok: true };
}
