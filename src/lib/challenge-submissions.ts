import "server-only";

import type { ChallengeKey, ChallengeTrack } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { challengeById, type Challenge } from "@/lib/challenge-content";

/**
 * Reading and writing the per-challenge submissions.
 *
 * Answers live in a JSON column keyed by question id. The questions differ per
 * challenge and are expected to be reworded between events — as they were this week —
 * and a column each would mean a migration every time.
 */

export interface SubmissionView {
  challenge: ChallengeKey;
  fileKey: string | null;
  originalFilename: string | null;
  sizeBytes: number | null;
  uploadedAt: Date | null;
  githubUrl: string | null;
  verifiedPublic: boolean | null;
  answers: Record<string, string>;
  savedAt: Date | null;
}

function toAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const answers: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") answers[key] = entry;
  }
  return answers;
}

export async function getSubmission(
  attemptId: string,
  challenge: ChallengeKey,
): Promise<SubmissionView | null> {
  const row = await db.challengeSubmission.findUnique({
    where: { attemptId_challenge: { attemptId, challenge } },
  });

  if (!row) return null;

  return {
    challenge: row.challenge,
    fileKey: row.fileKey,
    originalFilename: row.originalFilename,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt,
    githubUrl: row.githubUrl,
    verifiedPublic: row.verifiedPublic,
    answers: toAnswers(row.answers),
    savedAt: row.savedAt,
  };
}

export async function getAllSubmissions(attemptId: string): Promise<SubmissionView[]> {
  const rows = await db.challengeSubmission.findMany({ where: { attemptId } });

  return rows.map((row) => ({
    challenge: row.challenge,
    fileKey: row.fileKey,
    originalFilename: row.originalFilename,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt,
    githubUrl: row.githubUrl,
    verifiedPublic: row.verifiedPublic,
    answers: toAnswers(row.answers),
    savedAt: row.savedAt,
  }));
}

/**
 * Merges answers rather than replacing the object.
 *
 * Each question autosaves on its own, so a write carrying one answer must not wipe the
 * other two. Read-modify-write is safe enough here: the only writer is one participant,
 * and the alternative — a jsonb merge in raw SQL — buys nothing against a single
 * author.
 */
export async function saveAnswers(
  attemptId: string,
  challenge: ChallengeKey,
  patch: Record<string, string>,
): Promise<void> {
  const existing = await getSubmission(attemptId, challenge);
  const answers = { ...(existing?.answers ?? {}), ...patch };

  await db.challengeSubmission.upsert({
    where: { attemptId_challenge: { attemptId, challenge } },
    create: { attemptId, challenge, answers },
    update: { answers, savedAt: new Date() },
  });
}

/** Which required questions still have nothing in them. */
export function missingAnswers(challenge: Challenge, answers: Record<string, string>): string[] {
  return challenge.questions
    .filter((question) => question.required && !(answers[question.key] ?? "").trim())
    .map((question) => question.label);
}

/**
 * What a participant still has outstanding, for the submit confirmation.
 *
 * Reported, never enforced. A participant who runs out of time with half a challenge
 * written must still be able to hand in what they have — and the clock submits for
 * them regardless (D1), so a blocking rule here would only punish the people who
 * pressed the button themselves.
 */
export async function outstandingWork(
  attemptId: string,
  track: ChallengeTrack | null,
): Promise<string[]> {
  const [submissions, itemCount] = await Promise.all([
    getAllSubmissions(attemptId),
    db.challenge1Entry.count({ where: { attemptId } }),
  ]);

  const outstanding: string[] = [];
  if (itemCount === 0) outstanding.push("Challenge 1 — nothing submitted");

  const required: ChallengeKey[] = track ? ["C2", track] : ["C2"];

  for (const key of required) {
    const challenge = challengeById(key)!;
    const submission = submissions.find((entry) => entry.challenge === key);

    if (!submission) {
      outstanding.push(`Challenge ${challenge.number} — nothing submitted`);
      continue;
    }

    if (key !== "C4" && !submission.fileKey) {
      outstanding.push(`Challenge ${challenge.number} — no PDF uploaded`);
    }
    if (key === "C4" && !submission.githubUrl) {
      outstanding.push(`Challenge ${challenge.number} — no repository link`);
    }

    for (const label of missingAnswers(challenge, submission.answers)) {
      outstanding.push(`Challenge ${challenge.number} — ${label}`);
    }
  }

  if (!track) {
    outstanding.push("You have not chosen between Challenge 3 and Challenge 4");
  }

  return outstanding;
}
