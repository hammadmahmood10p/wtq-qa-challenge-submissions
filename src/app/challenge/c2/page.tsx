import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { Alert } from "@/components/ui/alert";
import { getAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import { challengeById } from "@/lib/challenge-content";

export const metadata: Metadata = { title: "Challenge 2 submission — WTQ 2026" };

/**
 * Challenge 2 submission page, opened in its own browser tab.
 *
 * The countdown is here too: requirement 3 says it must be visible throughout, and a
 * participant working in this tab would otherwise lose sight of it entirely. Both
 * tabs derive from the same server `endsAt`, so they cannot disagree.
 *
 * The submission controls themselves arrive on Day 7.
 */
export default async function Challenge2Page() {
  const user = await requireRole("PARTICIPANT");
  const attempt = await getAttempt(user.id);
  const challenge = challengeById("c2")!;

  if (attempt.state === "NOT_STARTED") redirect("/challenge");
  if (attempt.state === "SUBMITTED" || attempt.state === "EXPIRED") redirect("/challenge/done");

  return (
    <>
      <ChallengeHeader initialRemainingMs={attempt.remainingMs} />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <header>
          <p className="text-muted font-mono text-[11px] tracking-[0.18em] uppercase">
            Challenge {challenge.number}
          </p>
          <h1 className="font-display mt-1.5 text-2xl font-bold">{challenge.title}</h1>
          <p className="text-muted mt-2">{challenge.summary}</p>
        </header>

        <Alert variant="info" title="Submission form coming">
          The form for this challenge is still being built.
        </Alert>
      </main>
    </>
  );
}
