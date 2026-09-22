import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { ChallengeTabs } from "@/components/challenge/challenge-tabs";
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
  if (attempt.state === "SUBMITTED" || attempt.state === "EXPIRED") redirect("/challenge/done");

  return (
    <>
      <ChallengeHeader initialRemainingMs={attempt.remainingMs}>
        {/* The Submit button and its confirmation modal land on Day 8, together with
            the transactional seal and the account lock. Shipping the button before
            the action behind it would be worse than shipping neither. */}
      </ChallengeHeader>

      <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <ChallengeTabs />
      </main>
    </>
  );
}
