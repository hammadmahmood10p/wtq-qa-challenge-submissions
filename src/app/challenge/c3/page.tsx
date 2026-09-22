import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { SubmitButton } from "@/components/challenge/submit-button";
import { Challenge3Form } from "@/components/challenge/challenge3-form";
import { Alert } from "@/components/ui/alert";
import { getAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import { CHALLENGE3_CSV_URL, challengeById } from "@/lib/challenge-content";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Challenge 3 submission — WTQ 2026" };

export default async function Challenge3Page() {
  const user = await requireRole("PARTICIPANT");
  const attempt = await getAttempt(user.id);

  if (attempt.state === "NOT_STARTED") redirect("/challenge");
  if (attempt.state === "SUBMITTED" || attempt.state === "EXPIRED") redirect("/submitted");

  const challenge = challengeById("c3")!;
  const existing = await db.challenge3Submission.findUnique({
    where: { attemptId: attempt.id },
    select: { githubUrl: true, verifiedPublic: true },
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

        {CHALLENGE3_CSV_URL ? (
          <a
            href={CHALLENGE3_CSV_URL}
            className="border-border bg-surface hover:border-violet/50 inline-flex items-center gap-2 rounded-(--radius-control) border px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Download the test case CSV
          </a>
        ) : (
          <Alert variant="warning" title="CSV pending">
            The starting test case CSV will be available here before the event begins.
          </Alert>
        )}

        <Challenge3Form existing={existing} />
      </main>
    </>
  );
}
