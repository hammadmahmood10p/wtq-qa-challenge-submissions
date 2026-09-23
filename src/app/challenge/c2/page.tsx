import type { Metadata } from "next";
import { ChallengeAnswers } from "@/components/challenge/challenge-answers";
import {
  ChallengePageChrome,
  loadChallengePage,
} from "@/components/challenge/challenge-page-shell";
import { PdfUpload } from "@/components/challenge/pdf-upload";
import { Alert } from "@/components/ui/alert";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Challenge 2 submission — WTQ 2026" };

export default async function Challenge2Page() {
  const { attempt, definition, submission } = await loadChallengePage("C2");

  return (
    <ChallengePageChrome remainingMs={attempt.remainingMs}>
        <header>
          <p className="text-muted font-mono text-[11px] tracking-[0.18em] uppercase">
            Challenge {definition.number}
          </p>
          <h1 className="font-display mt-1.5 text-2xl font-bold">{definition.title}</h1>
          <p className="text-muted mt-2">{definition.summary}</p>
        </header>

      <Alert variant="info" title="What to upload">
        One PDF containing both your findings report and your comparison of manual
        testing against AI.
      </Alert>

      <PdfUpload
        challenge="C2"
        attemptId={attempt.id}
        maxUploadMb={env.MAX_UPLOAD_MB}
        existing={
          submission?.fileKey && submission.originalFilename
            ? { filename: submission.originalFilename, sizeBytes: submission.sizeBytes ?? 0 }
            : null
        }
      />

      <ChallengeAnswers
        challenge="C2"
        questions={definition.questions}
        initialAnswers={submission?.answers ?? {}}
      />
    </ChallengePageChrome>
  );
}
