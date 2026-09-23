"use server";

import { revalidatePath } from "next/cache";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { AttemptClosedError, requireWritableAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import { challengeById, isChallengeOpen } from "@/lib/challenge-content";
import { saveAnswers } from "@/lib/challenge-submissions";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { REPO_PROBLEM_MESSAGES, isRepoPublic, parseGithubRepo } from "@/lib/github";
import { pdfProblemMessage, safeFilename, validatePdf } from "@/lib/pdf";
import { buildObjectKey, storage } from "@/lib/storage";

export interface SubmissionResult {
  ok: boolean;
  closed?: boolean;
  error?: string;
  warning?: string;
  savedAt?: string;
}

const CLOSED: SubmissionResult = {
  ok: false,
  closed: true,
  error: "Your challenge has ended. Nothing more can be saved.",
};

/**
 * Every write to a challenge submission passes through here.
 *
 * Two guards, not one. The attempt must still be open, and the challenge must actually
 * be open to this participant — Challenges 3 and 4 are alternatives, and the one they
 * did not choose is closed on the server, not merely greyed out in the interface.
 */
async function withOpenChallenge(
  challenge: ChallengeKey,
  work: (ctx: { attemptId: string }) => Promise<SubmissionResult>,
): Promise<SubmissionResult> {
  const user = await requireRole("PARTICIPANT");

  try {
    const attempt = await requireWritableAttempt(user.id);
    const definition = challengeById(challenge);

    if (!definition) return { ok: false, error: "That challenge does not exist." };

    if (!isChallengeOpen(definition, attempt.chosenTrack)) {
      return {
        ok: false,
        error: attempt.chosenTrack
          ? `You chose Challenge ${attempt.chosenTrack === "C3" ? 3 : 4}, so this one is closed to you.`
          : "Choose this challenge before submitting to it.",
      };
    }

    return await work({ attemptId: attempt.id });
  } catch (error) {
    if (error instanceof AttemptClosedError) return CLOSED;
    console.error("[challenge-submission]", challenge, error);
    return { ok: false, error: "Could not save. Please try again." };
  }
}

/** Autosaved as the participant types, one question at a time. */
export async function saveChallengeAnswer(
  challenge: ChallengeKey,
  key: string,
  value: string,
): Promise<SubmissionResult> {
  return withOpenChallenge(challenge, async ({ attemptId }) => {
    const definition = challengeById(challenge)!;
    const question = definition.questions.find((q) => q.key === key);

    if (!question) return { ok: false, error: "Unknown question." };
    if (value.length > question.maxLength) {
      return { ok: false, error: `That answer is too long (limit ${question.maxLength}).` };
    }

    await saveAnswers(attemptId, challenge, { [key]: value });
    return { ok: true, savedAt: new Date().toISOString() };
  });
}

export async function uploadChallengeFile(
  challenge: ChallengeKey,
  _prev: SubmissionResult,
  formData: FormData,
): Promise<SubmissionResult> {
  return withOpenChallenge(challenge, async ({ attemptId }) => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a PDF file to upload." };
    }

    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;

    // Read before validating: the only trustworthy evidence of what this file is are
    // its own bytes. The declared type and the name both came from the client.
    const bytes = Buffer.from(await file.arrayBuffer());
    const problem = validatePdf(bytes, maxBytes);
    if (problem) return { ok: false, error: pdfProblemMessage(problem, maxBytes) };

    const filename = safeFilename(file.name);
    const key = buildObjectKey(challenge.toLowerCase(), attemptId, ".pdf");

    await storage().put(key, bytes, "application/pdf");

    const previous = await db.challengeSubmission.findUnique({
      where: { attemptId_challenge: { attemptId, challenge } },
      select: { fileKey: true },
    });

    // Row first, then remove the old object. An orphaned file is harmless; a row
    // pointing at a file that no longer exists is not.
    await db.challengeSubmission.upsert({
      where: { attemptId_challenge: { attemptId, challenge } },
      create: {
        attemptId,
        challenge,
        fileKey: key,
        originalFilename: filename,
        sizeBytes: bytes.length,
        contentType: "application/pdf",
        uploadedAt: new Date(),
      },
      update: {
        fileKey: key,
        originalFilename: filename,
        sizeBytes: bytes.length,
        contentType: "application/pdf",
        uploadedAt: new Date(),
        savedAt: new Date(),
      },
    });

    if (previous?.fileKey && previous.fileKey !== key) {
      await storage()
        .delete(previous.fileKey)
        .catch(() => {});
    }

    revalidatePath(`/challenge/${challenge.toLowerCase()}`);
    return { ok: true, savedAt: new Date().toISOString() };
  });
}

/** Challenge 4's repository link. */
export async function saveChallengeLink(
  _prev: SubmissionResult,
  formData: FormData,
): Promise<SubmissionResult> {
  return withOpenChallenge("C4", async ({ attemptId }) => {
    const parsed = parseGithubRepo(String(formData.get("githubUrl") ?? ""));
    if ("problem" in parsed) {
      return { ok: false, error: REPO_PROBLEM_MESSAGES[parsed.problem] };
    }

    // Checked, never a reason to refuse the save. GitHub's rate limit is not the
    // participant's fault and must not cost them their submission (D10).
    const reachable = await isRepoPublic(parsed.repo);

    await db.challengeSubmission.upsert({
      where: { attemptId_challenge: { attemptId, challenge: "C4" } },
      create: {
        attemptId,
        challenge: "C4",
        githubUrl: parsed.repo.url,
        verifiedPublic: reachable,
      },
      update: {
        githubUrl: parsed.repo.url,
        verifiedPublic: reachable,
        savedAt: new Date(),
      },
    });

    revalidatePath("/challenge/c4");

    return {
      ok: true,
      savedAt: new Date().toISOString(),
      warning:
        reachable === false
          ? "Saved — but we could not reach that repository. Check the name and that it is public."
          : undefined,
    };
  });
}
