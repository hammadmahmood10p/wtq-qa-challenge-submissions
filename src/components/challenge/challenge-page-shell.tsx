import { redirect } from "next/navigation";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { SubmitButton } from "@/components/challenge/submit-button";
import { Alert } from "@/components/ui/alert";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { getAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import { challengeById, isChallengeOpen } from "@/lib/challenge-content";
import { getSubmission } from "@/lib/challenge-submissions";
import { cn } from "@/lib/utils";

/**
 * The shared guard and chrome for every challenge submission page.
 *
 * Four pages ran the same six checks, and the sixth — whether this challenge is open
 * to this participant at all — is new and easy to forget. Somewhere central is the
 * only place it belongs.
 */
export async function loadChallengePage(challenge: ChallengeKey) {
  const user = await requireRole("PARTICIPANT");
  const attempt = await getAttempt(user.id);

  if (attempt.state === "NOT_STARTED") redirect("/challenge");
  if (attempt.state === "SUBMITTED" || attempt.state === "EXPIRED") redirect("/submitted");

  const definition = challengeById(challenge)!;
  const open = isChallengeOpen(definition, attempt.chosenTrack);
  const submission = await getSubmission(attempt.id, challenge);

  return { attempt, definition, open, submission };
}

export function ChallengePageChrome({
  remainingMs,
  wide,
  children,
}: {
  remainingMs: number;
  /** Challenge 1 holds two columns and needs the room. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <ChallengeHeader initialRemainingMs={remainingMs}>
        <SubmitButton />
      </ChallengeHeader>
      <main className={cn("mx-auto space-y-8 px-4 py-8 sm:px-6", wide ? "max-w-5xl" : "max-w-3xl")}>
        {children}
      </main>
    </>
  );
}

export function ChallengeClosedNotice({ chosen }: { chosen: "C3" | "C4" }) {
  return (
    <Alert variant="warning" title="This challenge is closed to you">
      You chose Challenge {chosen === "C3" ? 3 : 4}, and that choice cannot be changed.
      Go back to your challenge workspace to carry on there.
    </Alert>
  );
}

export function ChallengeNotChosenNotice() {
  return (
    <Alert variant="warning" title="You have not chosen this challenge yet">
      Challenges 3 and 4 are alternatives — choose one from your challenge workspace
      before submitting to it.
    </Alert>
  );
}
