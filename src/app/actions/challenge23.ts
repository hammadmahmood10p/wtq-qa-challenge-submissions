"use server";

import { revalidatePath } from "next/cache";
import { AttemptClosedError, requireWritableAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { REPO_PROBLEM_MESSAGES, isRepoPublic, parseGithubRepo } from "@/lib/github";
import { pdfProblemMessage, safeFilename, validatePdf } from "@/lib/pdf";
import { buildObjectKey, storage } from "@/lib/storage";

export interface SubmissionResult {
  ok: boolean;
  closed?: boolean;
  error?: string;
  /** Advisory only — a save always succeeds if the link is well formed. */
  warning?: string;
  savedAt?: string;
  filename?: string;
}

const CLOSED: SubmissionResult = {
  ok: false,
  closed: true,
  error: "Your challenge has ended. Nothing more can be saved.",
};

// ---------------------------------------------------------------------------
// Challenge 2 — the PDF report
// ---------------------------------------------------------------------------

export async function saveChallenge2(
  _prev: SubmissionResult,
  formData: FormData,
): Promise<SubmissionResult> {
  const user = await requireRole("PARTICIPANT");

  try {
    const attempt = await requireWritableAttempt(user.id);

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
    const key = buildObjectKey("challenge2", attempt.id, ".pdf");

    await storage().put(key, bytes, "application/pdf");

    // Replacing an earlier upload: write the new row first, then remove the old
    // object. If the delete fails we have an orphan, which is harmless; doing it the
    // other way round risks a row pointing at a file that no longer exists.
    const previous = await db.challenge2Submission.findUnique({
      where: { attemptId: attempt.id },
      select: { fileKey: true },
    });

    await db.challenge2Submission.upsert({
      where: { attemptId: attempt.id },
      create: {
        attemptId: attempt.id,
        fileKey: key,
        originalFilename: filename,
        sizeBytes: bytes.length,
        contentType: "application/pdf",
      },
      update: {
        fileKey: key,
        originalFilename: filename,
        sizeBytes: bytes.length,
        contentType: "application/pdf",
        uploadedAt: new Date(),
      },
    });

    if (previous?.fileKey && previous.fileKey !== key) {
      await storage()
        .delete(previous.fileKey)
        .catch(() => {});
    }

    revalidatePath("/challenge/c2");
    return { ok: true, savedAt: new Date().toISOString(), filename };
  } catch (error) {
    if (error instanceof AttemptClosedError) return CLOSED;
    console.error("[challenge2]", error);
    return { ok: false, error: "Could not upload that file. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Challenge 3 — the repository link
// ---------------------------------------------------------------------------

export async function saveChallenge3(
  _prev: SubmissionResult,
  formData: FormData,
): Promise<SubmissionResult> {
  const user = await requireRole("PARTICIPANT");

  try {
    const attempt = await requireWritableAttempt(user.id);

    const parsed = parseGithubRepo(String(formData.get("githubUrl") ?? ""));
    if ("problem" in parsed) {
      return { ok: false, error: REPO_PROBLEM_MESSAGES[parsed.problem] };
    }

    // Checked, but never a reason to refuse the save. GitHub's rate limit is not the
    // participant's fault and must not cost them their submission (D10).
    const reachable = await isRepoPublic(parsed.repo);

    await db.challenge3Submission.upsert({
      where: { attemptId: attempt.id },
      create: {
        attemptId: attempt.id,
        githubUrl: parsed.repo.url,
        verifiedPublic: reachable,
      },
      update: {
        githubUrl: parsed.repo.url,
        verifiedPublic: reachable,
        savedAt: new Date(),
      },
    });

    revalidatePath("/challenge/c3");

    return {
      ok: true,
      savedAt: new Date().toISOString(),
      warning:
        reachable === false
          ? "Saved — but we could not reach that repository. Check the name and that it is public."
          : undefined,
    };
  } catch (error) {
    if (error instanceof AttemptClosedError) return CLOSED;
    console.error("[challenge3]", error);
    return { ok: false, error: "Could not save that link. Please try again." };
  }
}
