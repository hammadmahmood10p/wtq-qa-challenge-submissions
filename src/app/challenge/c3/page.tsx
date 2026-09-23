import type { Metadata } from "next";
import { ChallengeAnswers } from "@/components/challenge/challenge-answers";
import {
  ChallengeClosedNotice,
  ChallengeNotChosenNotice,
  ChallengePageChrome,
  loadChallengePage,
} from "@/components/challenge/challenge-page-shell";
import { PdfUpload } from "@/components/challenge/pdf-upload";
import { Alert } from "@/components/ui/alert";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Challenge 3 submission — WTQ 2026" };

export default async function Challenge3Page() {
  const { attempt, definition, open, submission } = await loadChallengePage("C3");

  return (
    <ChallengePageChrome remainingMs={attempt.remainingMs}>
        <header>
          <p className="text-muted font-mono text-[11px] tracking-[0.18em] uppercase">
            Challenge {definition.number}
          </p>
          <h1 className="font-display mt-1.5 text-2xl font-bold">{definition.title}</h1>
          <p className="text-muted mt-2">{definition.summary}</p>
        </header>

      {!open &&
        (attempt.chosenTrack ? <ChallengeClosedNotice chosen="C4" /> : <ChallengeNotChosenNotice />)}

      {open && (
        <>
          <Alert variant="info" title="What to upload">
            A PDF containing your observations and risks, your recommendations, and your
            final quality assessment.
          </Alert>

          <PdfUpload
            challenge="C3"
            attemptId={attempt.id}
            maxUploadMb={env.MAX_UPLOAD_MB}
            existing={
              submission?.fileKey && submission.originalFilename
                ? { filename: submission.originalFilename, sizeBytes: submission.sizeBytes ?? 0 }
                : null
            }
          />

          <ChallengeAnswers
            challenge="C3"
            questions={definition.questions}
            initialAnswers={submission?.answers ?? {}}
          />
        </>
      )}
    </ChallengePageChrome>
  );
}
