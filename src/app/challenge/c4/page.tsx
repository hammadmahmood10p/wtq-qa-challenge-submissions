import type { Metadata } from "next";
import { ChallengeAnswers } from "@/components/challenge/challenge-answers";
import {
  ChallengeClosedNotice,
  ChallengeNotChosenNotice,
  ChallengePageChrome,
  loadChallengePage,
} from "@/components/challenge/challenge-page-shell";
import { GithubLinkForm } from "@/components/challenge/github-link-form";
import { Alert } from "@/components/ui/alert";
import { getChallenge4Csv } from "@/lib/event-config";

export const metadata: Metadata = { title: "Challenge 4 submission — WTQ 2026" };

export default async function Challenge4Page() {
  const { attempt, definition, open, submission } = await loadChallengePage("C4");
  const csv = await getChallenge4Csv();

  return (
    <ChallengePageChrome
      remainingMs={attempt.remainingMs}
      totalMs={attempt.durationMinutes * 60_000}
    >
        <header>
          <p className="text-muted font-mono text-[11px] tracking-[0.18em] uppercase">
            Challenge {definition.number}
          </p>
          <h1 className="font-display mt-1.5 text-2xl font-bold">{definition.title}</h1>
          <p className="text-muted mt-2">{definition.summary}</p>
        </header>

      {!open &&
        (attempt.chosenTrack ? <ChallengeClosedNotice chosen="C3" /> : <ChallengeNotChosenNotice />)}

      {open && (
        <>
          {csv ? (
            <a
              href="/api/files/challenge4-csv"
              className="border-border bg-surface hover:border-violet/50 inline-flex items-center gap-2 rounded-(--radius-control) border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Download the test case CSV
              <span className="text-muted font-mono text-xs">({csv.filename})</span>
            </a>
          ) : (
            <Alert variant="warning" title="CSV pending">
              The starting test case CSV will be available here before the event begins.
            </Alert>
          )}

          <GithubLinkForm
            existing={
              submission?.githubUrl
                ? { githubUrl: submission.githubUrl, verifiedPublic: submission.verifiedPublic }
                : null
            }
          />

          <ChallengeAnswers
            challenge="C4"
            questions={definition.questions}
            initialAnswers={submission?.answers ?? {}}
          />
        </>
      )}
    </ChallengePageChrome>
  );
}
