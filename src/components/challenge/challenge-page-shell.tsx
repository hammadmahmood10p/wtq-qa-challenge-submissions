import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { SubmitButton } from "@/components/challenge/submit-button";
import { Alert } from "@/components/ui/alert";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { getAttempt } from "@/lib/attempt";
import { attemptProgress } from "@/lib/attempt-progress";
import { requireRole } from "@/lib/auth";
import { challengeById, isChallengeOpen } from "@/lib/challenge-content";
import type { Progress } from "@/lib/challenge-progress";
import { isChallengeReachable } from "@/lib/challenge1-limits";
import { getSubmission } from "@/lib/challenge-submissions";

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

  // Challenges 2 to 4 are shut before Challenge 1 is sealed, and shut again if a super
  // admin reopened Challenge 1 on a submitted attempt. The tabs already grey them out;
  // this is the rule behind that hint, for a typed URL or an old bookmark.
  if (
    !isChallengeReachable(challenge, attempt.challenge1EverLocked, attempt.reopenedForChallenge1)
  ) {
    redirect("/challenge/c1");
  }

  const definition = challengeById(challenge)!;
  const open = isChallengeOpen(definition, attempt.chosenTrack);

  // The Submit button lives in this chrome on every challenge page, and it needs to
  // know what is finished — including work done on the other pages.
  const [submission, progress] = await Promise.all([
    getSubmission(attempt.id, challenge),
    attemptProgress(attempt.id, attempt.chosenTrack),
  ]);

  return { attempt, definition, open, submission, progress };
}

export function ChallengePageChrome({
  remainingMs,
  totalMs,
  progress,
  children,
}: {
  remainingMs: number;
  totalMs: number;
  progress: Progress;
  children: React.ReactNode;
}) {
  return (
    <>
      <ChallengeHeader initialRemainingMs={remainingMs} totalMs={totalMs}>
        <SubmitButton progress={progress} />
      </ChallengeHeader>
      {/* Once, at the top. A second copy at the foot was there for the scroll, but two
          identical controls on one page read as two different destinations. */}
      <main className="app-gutter space-y-8 py-8">
        <BackToChallenges />
        {children}
      </main>
    </>
  );
}

/**
 * The way back to the workspace.
 *
 * These pages are opened in a new tab from the challenge list, so a participant who
 * closes the tab is fine — and one who does not had no way back at all, which is how
 * people end up using the browser's Back button on a timed form.
 *
 * A plain anchor, not a `Link`. The workspace shows the clock and what has been
 * finished, and both change while they are on this page; a soft navigation can serve
 * the cached version of a route it has already visited, which would put a stale timer
 * in front of them. A full load costs one render and is always right.
 *
 * Relative, so it works on localhost and in production without either being special.
 */
function BackToChallenges() {
  return (
    <a
      href="/challenge/run"
      className="border-border bg-surface hover:border-violet/50 hover:text-text text-muted inline-flex items-center gap-2 rounded-(--radius-control) border px-4 py-2.5 text-sm font-medium transition-colors"
    >
      <ArrowLeft size={15} />
      Go back to challenges
    </a>
  );
}

export function ChallengeClosedNotice({ chosen }: { chosen: "C3" | "C4" }) {
  return (
    <Alert variant="warning" title="This challenge is closed to you">
      You chose Challenge {chosen === "C3" ? 3 : 4}, and that choice cannot be changed. Go back to
      your challenge workspace to carry on there.
    </Alert>
  );
}

export function ChallengeNotChosenNotice() {
  return (
    <Alert variant="warning" title="You have not chosen this challenge yet">
      Challenges 3 and 4 are alternatives — choose one from your challenge workspace before
      submitting to it.
    </Alert>
  );
}
