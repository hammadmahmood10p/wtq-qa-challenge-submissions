import { ExternalLink } from "lucide-react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Challenge1Workspace } from "@/components/challenge/challenge1-workspace";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { SubmitButton } from "@/components/challenge/submit-button";
import { Alert } from "@/components/ui/alert";
import { getAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import { APPLICATION_UNDER_TEST_URL, challengeById } from "@/lib/challenge-content";
import { groupByKind, listChallenge1Items } from "@/lib/challenge1";

export const metadata: Metadata = { title: "Challenge 1 submission — WTQ 2026" };

/**
 * Challenge 1's submission page, opened in its own browser tab.
 *
 * The countdown is here too (requirement 3): a participant may spend most of their
 * three hours on this page, and losing sight of the clock because they are in a
 * different tab would be the interface's fault, not theirs.
 */
export default async function Challenge1Page() {
  const user = await requireRole("PARTICIPANT");
  const attempt = await getAttempt(user.id);

  if (attempt.state === "NOT_STARTED") redirect("/challenge");
  if (attempt.state === "SUBMITTED" || attempt.state === "EXPIRED") redirect("/submitted");

  const challenge = challengeById("c1")!;
  const items = await listChallenge1Items(attempt.id);
  const { BUG_REPORT, TEST_CASE } = groupByKind(items);

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

        {APPLICATION_UNDER_TEST_URL ? (
          <a
            href={APPLICATION_UNDER_TEST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border bg-surface hover:border-violet/50 inline-flex items-center gap-2 rounded-(--radius-control) border px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Open the application you are testing
            <ExternalLink size={14} />
          </a>
        ) : (
          <Alert variant="warning" title="Application link pending">
            The link to the application under test will appear here before the event
            begins.
          </Alert>
        )}

        <Alert variant="info">
          Everything you type is saved automatically as you go. The Save button on each
          entry confirms it immediately if you would rather not wait.
        </Alert>

        <Challenge1Workspace
          bugReports={BUG_REPORT.map(({ id, title, description }) => ({ id, title, description }))}
          testCases={TEST_CASE.map(({ id, title, description }) => ({ id, title, description }))}
        />
      </main>
    </>
  );
}
