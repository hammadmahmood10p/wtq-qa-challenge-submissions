"use server";

import { revalidatePath } from "next/cache";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import {
  saveBonus,
  saveChallengeScores,
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
