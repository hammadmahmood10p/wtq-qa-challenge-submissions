import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { ChallengeTrack } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { evaluateProgress, type Progress, type ProgressSubmission } from "@/lib/challenge-progress";
import { getAllSubmissions } from "@/lib/challenge-submissions";

/**
 * Reading progress out of the database.
 *
 * Split from challenge-progress.ts, which holds the rule itself and stays pure so the
 * browser can use it. This file gathers the rows and hands them over.
 */

/**
 * How many findings in each attempt are worth judging.
 *
 * Raw SQL rather than a `findMany` because the alternative is loading every
 * description to count them: fifty findings times five thousand characters times
 * twenty-five rows on a page a judge refreshes all morning. Counting belongs in the
 * database.
 *
 * `btrim` is what makes this agree with `isEntryComplete` — a title holding one space
 * is blank to the participant's screen, and must be blank here too, or a judge sees a
 * count nobody else can see.
 */
async function completeEntryCounts(attemptIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (attemptIds.length === 0) return counts;

  const rows = await db.$queryRaw<{ attemptId: string; n: bigint }[]>`
    SELECT "attemptId", COUNT(*) AS n
    FROM "challenge1_entries"
    WHERE "attemptId" IN (${Prisma.join(attemptIds)})
      AND btrim("bugTitle") <> ''
      AND btrim("bugDescription") <> ''
      AND btrim("testTitle") <> ''
      AND btrim("testDescription") <> ''
    GROUP BY "attemptId"
  `;

  for (const row of rows) counts.set(row.attemptId, Number(row.n));
  return counts;
}

/** One participant's progress, for their own workspace and submit dialog. */
export async function attemptProgress(
  attemptId: string,
  track: ChallengeTrack | null,
): Promise<Progress> {
  const [counts, submissions] = await Promise.all([
    completeEntryCounts([attemptId]),
    getAllSubmissions(attemptId),
  ]);

  return evaluateProgress({
    track,
    completeEntryCount: counts.get(attemptId) ?? 0,
    submissions,
  });
}

/**
 * Progress for a page of submissions, in two queries rather than two per row.
 *
 * Returns only the numerator; the denominator is fixed at three.
 */
export async function progressForAttempts(
  attempts: { id: string; chosenTrack: ChallengeTrack | null }[],
): Promise<Map<string, number>> {
  const ids = attempts.map((a) => a.id);
  const completed = new Map<string, number>();
  if (ids.length === 0) return completed;

  const [counts, rows] = await Promise.all([
    completeEntryCounts(ids),
    db.challengeSubmission.findMany({
      where: { attemptId: { in: ids } },
      // Everything the rule reads, and nothing else. The uploaded file itself is not
      // here — only whether there is one.
      select: { attemptId: true, challenge: true, fileKey: true, githubUrl: true, answers: true },
    }),
  ]);

  const byAttempt = new Map<string, ProgressSubmission[]>();
  for (const row of rows) {
    const list = byAttempt.get(row.attemptId) ?? [];
    list.push({
      challenge: row.challenge,
      fileKey: row.fileKey,
      githubUrl: row.githubUrl,
      answers: toAnswers(row.answers),
    });
    byAttempt.set(row.attemptId, list);
  }

  for (const attempt of attempts) {
    const progress = evaluateProgress({
      track: attempt.chosenTrack,
      completeEntryCount: counts.get(attempt.id) ?? 0,
      submissions: byAttempt.get(attempt.id) ?? [],
    });
    completed.set(attempt.id, progress.completed);
  }

  return completed;
}

/** Same shape-guard challenge-submissions.ts applies; a JSON column can hold anything. */
function toAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const answers: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") answers[key] = entry;
  }
  return answers;
}
