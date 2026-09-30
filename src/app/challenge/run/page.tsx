import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { ChallengeTabs } from "@/components/challenge/challenge-tabs";
import { SubmitButton } from "@/components/challenge/submit-button";
import { attemptProgress } from "@/lib/attempt-progress";
import { getAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Your challenge — WTQ 2026" };

/**
 * The timed workspace (requirement 3).
 *
 * Reached only by starting the attempt. Arriving here with a NOT_STARTED attempt —
 * by typing the URL, say — sends the participant back to the briefing rather than
 * quietly starting their clock for them.
 */
export default async function ChallengeRunPage() {
  const user = await requireRole("PARTICIPANT");
  const attempt = await getAttempt(user.id);

  if (attempt.state === "NOT_STARTED") redirect("/challenge");
  if (attempt.state === "SUBMITTED" || attempt.state === "EXPIRED") redirect("/submitted");

  // Read on every load rather than held in client state: the participant edits their
  // work on other pages, and a stale "nothing finished yet" would lock the button
  // against someone who has in fact finished.
  const progress = await attemptProgress(attempt.id, attempt.chosenTrack);

  return (
    <>
      <ChallengeHeader
        initialRemainingMs={attempt.remainingMs}
        totalMs={attempt.durationMinutes * 60_000}
      >
        <SubmitButton progress={progress} />
      </ChallengeHeader>

      <main className="app-gutter pb-16">
        <ChallengeTabs chosenTrack={attempt.chosenTrack} />
      </main>
    </>
  );
}
