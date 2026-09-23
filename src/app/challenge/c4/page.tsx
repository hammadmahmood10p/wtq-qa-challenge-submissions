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
import { CHALLENGE4_CSV_URL } from "@/lib/challenge-content";

export const metadata: Metadata = { title: "Challenge 4 submission — WTQ 2026" };

export default async function Challenge4Page() {
  const { attempt, definition, open, submission } = await loadChallengePage("C4");

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
        (attempt.chosenTrack ? <ChallengeClosedNotice chosen="C3" /> : <ChallengeNotChosenNotice />)}

      {open && (
        <>
          {CHALLENGE4_CSV_URL ? (
            <a
              href={CHALLENGE4_CSV_URL}
              className="border-border bg-surface hover:border-violet/50 inline-flex items-center gap-2 rounded-(--radius-control) border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Download the test case CSV
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
