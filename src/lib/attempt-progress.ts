import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { ChallengeKey, ChallengeTrack } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { evaluateProgress, type Progress, type ProgressSubmission } from "@/lib/challenge-progress";
import { getAllSubmissions } from "@/lib/challenge-submissions";

/**
 * Reading progress out of the database.
 *
 * Split from challenge-progress.ts, which holds the rule itself and stays pure so the
 * browser can use it. This file gathers the rows and hands them over.
 *
 * Both queries below answer their question in SQL and return almost nothing. That is
 * the point: the Challenges Accepted filter has to know the count for *every* attempt
 * matching the other filters, not just the twenty-five on screen, because you cannot
 * paginate by a number until you know it for everyone. Loading a thousand
 * participants' descriptions and answers to count them would be tens of megabytes a
 * judge pays for on every page change.
 */

/**
 * How many findings in each attempt are worth judging.
 *
 * `btrim` is what makes this agree with `isEntryComplete` — a title holding one space
 * is blank on the participant's screen, and must be blank here too, or a judge sees a
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

interface SubmissionFactsRow {
  attemptId: string;
  challenge: ChallengeKey;
  hasFile: boolean;
  hasRepo: boolean;
  /** The answer keys that actually hold something, never the answers themselves. */
  answered: string[];
}

/**
 * Whether each saved challenge has its document and which of its questions are
 * answered — as facts, not as text.
 *
 * The blank test lives in SQL so that the megabytes of prose stay in the database,
 * but the *rule* about which questions matter stays in challenge-progress.ts. This
 * returns key names; the caller reassembles a shape the pure rule already understands,
 * so there is still only one definition of a finished challenge.
 */
async function submissionFacts(attemptIds: string[]): Promise<Map<string, ProgressSubmission[]>> {
  const byAttempt = new Map<string, ProgressSubmission[]>();
  if (attemptIds.length === 0) return byAttempt;

  const rows = await db.$queryRaw<SubmissionFactsRow[]>`
    SELECT
      "attemptId",
      "challenge"::text AS challenge,
      ("fileKey" IS NOT NULL) AS "hasFile",
      (btrim(coalesce("githubUrl", '')) <> '') AS "hasRepo",
      ARRAY(
        SELECT key FROM jsonb_each_text("answers") AS entry(key, value)
        WHERE btrim(value) <> ''
      ) AS answered
    FROM "challenge_submissions"
    WHERE "attemptId" IN (${Prisma.join(attemptIds)})
  `;

  for (const row of rows) {
    const list = byAttempt.get(row.attemptId) ?? [];

    list.push({
      challenge: row.challenge,
      // Presence is all the rule reads, so a marker stands in for the real value.
      fileKey: row.hasFile ? "present" : null,
      githubUrl: row.hasRepo ? "present" : null,
      answers: Object.fromEntries(row.answered.map((key) => [key, "present"])),
    });

    byAttempt.set(row.attemptId, list);
  }

  return byAttempt;
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
 * How many challenges each of these attempts finished, in two queries however many
 * attempts are passed.
 */
export async function progressForAttempts(
  attempts: { id: string; chosenTrack: ChallengeTrack | null }[],
): Promise<Map<string, number>> {
  const completed = new Map<string, number>();
  if (attempts.length === 0) return completed;

  const ids = attempts.map((a) => a.id);

  const [counts, facts] = await Promise.all([
    completeEntryCounts(ids),
    submissionFacts(ids),
  ]);

  for (const attempt of attempts) {
    const progress = evaluateProgress({
      track: attempt.chosenTrack,
      completeEntryCount: counts.get(attempt.id) ?? 0,
      submissions: facts.get(attempt.id) ?? [],
    });
    completed.set(attempt.id, progress.completed);
  }

  return completed;
}
