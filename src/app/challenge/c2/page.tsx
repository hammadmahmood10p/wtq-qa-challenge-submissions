import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Challenge2Form } from "@/components/challenge/challenge2-form";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { SubmitButton } from "@/components/challenge/submit-button";
import { Alert } from "@/components/ui/alert";
import { getAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import { challengeById } from "@/lib/challenge-content";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Challenge 2 submission — WTQ 2026" };

export default async function Challenge2Page() {
  const user = await requireRole("PARTICIPANT");
  const attempt = await getAttempt(user.id);

  if (attempt.state === "NOT_STARTED") redirect("/challenge");
  if (attempt.state === "SUBMITTED" || attempt.state === "EXPIRED") redirect("/submitted");

  const challenge = challengeById("c2")!;
  const existing = await db.challenge2Submission.findUnique({
    where: { attemptId: attempt.id },
    select: { originalFilename: true, sizeBytes: true, uploadedAt: true },
  });

  return (
    <>
      <ChallengeHeader initialRemainingMs={attempt.remainingMs}>
        <SubmitButton />
      </ChallengeHeader>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <header>
          <p className="text-muted font-mono text-[11px] tracking-[0.18em] uppercase">
            Challenge {challenge.number}
          </p>
          <h1 className="font-display mt-1.5 text-2xl font-bold">{challenge.title}</h1>
          <p className="text-muted mt-2">{challenge.summary}</p>
        </header>

        <Alert variant="info" title="What to upload">
          One PDF containing your observations and risks, your recommendations, and your
          final quality assessment.
        </Alert>

        <Challenge2Form
          attemptId={attempt.id}
          maxUploadMb={env.MAX_UPLOAD_MB}
          existing={
            existing
              ? {
                  filename: existing.originalFilename,
                  sizeBytes: existing.sizeBytes,
                  uploadedAt: existing.uploadedAt.toISOString(),
                }
              : null
          }
        />
      </main>
    </>
  );
}
