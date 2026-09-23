import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { ChallengeTabs } from "@/components/challenge/challenge-tabs";
import { SubmitButton } from "@/components/challenge/submit-button";
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

  return (
    <>
      <ChallengeHeader initialRemainingMs={attempt.remainingMs}>
        <SubmitButton />
      </ChallengeHeader>

      <main className="app-gutter pb-16">
        <ChallengeTabs chosenTrack={attempt.chosenTrack} />
      </main>
    </>
  );
}
