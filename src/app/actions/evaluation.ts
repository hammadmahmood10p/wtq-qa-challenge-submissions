"use server";

import { revalidatePath } from "next/cache";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import {
  claimSubmission,
  reEvaluateSubmission,
  releaseSubmission,
} from "@/lib/judge-assignment";
import {
  saveBonus,
  saveChallengeScores,
  saveJudgeComment,
  submitFinalScore,
  unlockEvaluation,
  type EvaluationActor,
  type EvaluationResult,
} from "@/lib/evaluation";

/**
 * Scoring actions.
 *
 * Thin on purpose: every rule about who may score what, and when, lives in
 * src/lib/evaluation.ts. These exist to establish who is calling and to invalidate the
 * pages whose contents change — the judge's queue and the admin's submissions table
 * both show a score that has just moved.
 */

async function actor(): Promise<EvaluationActor> {
  const user = await requireRole("JUDGE", "SUPER_ADMIN");
  return { id: user.id, role: user.role as EvaluationActor["role"] };
}

function refresh(attemptId: string) {
  revalidatePath(`/review/${attemptId}`);
  revalidatePath("/judge");
  revalidatePath("/admin/submissions");
}

export async function saveScoresAction(
  attemptId: string,
  challenge: ChallengeKey,
  scores: Record<string, number | null>,
): Promise<EvaluationResult> {
  const result = await saveChallengeScores(attemptId, challenge, scores, await actor());
  if (result.ok) refresh(attemptId);
  return result;
}

export async function saveBonusAction(
  attemptId: string,
  bonus: number,
): Promise<EvaluationResult> {
  const result = await saveBonus(attemptId, bonus, await actor());
  if (result.ok) refresh(attemptId);
  return result;
}

export async function submitFinalScoreAction(attemptId: string): Promise<EvaluationResult> {
  const result = await submitFinalScore(attemptId, await actor());
  if (result.ok) refresh(attemptId);
  return result;
}

export async function unlockEvaluationAction(
  attemptId: string,
  reason: string,
): Promise<EvaluationResult> {
  const result = await unlockEvaluation(attemptId, reason, await actor());
  if (result.ok) refresh(attemptId);
  return result;
}

/**
 * Takes a submission for yourself.
 *
 * No judge parameter, deliberately: the holder is always whoever called this. The
 * previous version accepted any judge id, which is what made the Judge column a
 * dropdown and let one judge put another's name against work.
 *
 * Refreshes the whole table rather than the one row — the point of the name being
 * there is that the rest of the panel sees it, and a stale list is what causes two
 * judges to open the same submission.
 */
export async function claimSubmissionAction(attemptId: string): Promise<EvaluationResult> {
  const who = await actor();
  const result = await claimSubmission(attemptId, who);
  if (result.ok) refresh(attemptId);
  return result;
}

/**
 * Saves the judge's note against a submission.
 *
 * Deliberately does not call `refresh`. This autosaves while the judge is typing, and
 * revalidating three routes per keystroke-debounce would re-render the table under
 * them — including the box they are typing in. The rest of the panel picks the comment
 * up on their next refresh, which is what was asked for.
 */
export async function saveJudgeCommentAction(
  attemptId: string,
  comment: string,
): Promise<EvaluationResult> {
  return saveJudgeComment(attemptId, comment, await actor());
}

/** Super admin only: puts a submission back in the pool, keeping its scores. */
export async function releaseSubmissionAction(attemptId: string): Promise<EvaluationResult> {
  const who = await actor();
  const result = await releaseSubmission(attemptId, who);
  if (result.ok) refresh(attemptId);
  return result;
}

/** Super admin only: reopens a finalised score for a second look by any judge. */
export async function reEvaluateSubmissionAction(
  attemptId: string,
): Promise<EvaluationResult> {
  const who = await actor();
  const result = await reEvaluateSubmission(attemptId, who);
  if (result.ok) refresh(attemptId);
  return result;
}
