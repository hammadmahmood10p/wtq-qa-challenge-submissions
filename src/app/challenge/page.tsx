import { Clock, FileText, Info } from "lucide-react";
import type { Metadata } from "next";
import { beginChallenge } from "@/app/actions/attempt";
import { ChallengeBrief } from "@/components/challenge/challenge-brief";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { APPLICATION_UNDER_TEST_URL, CHALLENGES } from "@/lib/challenge-content";

export const metadata: Metadata = { title: "Challenge briefing — WTQ 2026" };

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours && rest) return `${hours} hours ${rest} minutes`;
  if (hours) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${rest} minutes`;
}

/**
 * The information page (participant requirement 1).
 *
 * It serves two audiences at once: someone about to start, and someone already
 * mid-attempt who has opened it in a second tab for reference. Requirement 2 says the
 * begin button must not appear in the second case — and that is decided here from the
 * attempt's server-side state, not from a query parameter or a referrer, because
 * either of those would be trivial for this audience to forge.
 */
export default async function ChallengeBriefingPage() {
  const user = await requireRole("PARTICIPANT");
  const attempt = await getAttempt(user.id);

  const notStarted = attempt.state === "NOT_STARTED";
  const inProgress = attempt.state === "IN_PROGRESS";
  const finished = attempt.state === "SUBMITTED" || attempt.state === "EXPIRED";

  return (
    <>
      <AppHeader user={user} />

      <div className="app-gutter space-y-8 py-8">
        <header>
          <p className="text-muted font-mono text-[11px] tracking-[0.2em] uppercase">
            Women Tech Quest 2026
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold sm:text-4xl">
            <span className="brand-text">Your QA challenge</span>
          </h1>
          {/* Capped for line length, not for page width: prose set across the full
              width of a laptop is unreadable, and this page is read in a hurry. */}
          <p className="text-muted mt-3 max-w-2xl">
            Everything you need to know before you begin. This page stays available
            throughout — you can open it in a new tab at any point during the challenge.
          </p>
        </header>

        {inProgress && (
          <Alert variant="info" title="Your challenge is already running">
            This is your reference copy. Return to the tab with your challenge workspace
            to carry on working.
          </Alert>
        )}

        {finished && (
          <Alert variant="info" title="Your challenge has ended">
            This briefing is here for reference only.
          </Alert>
        )}

        {/* Two columns once there is room for them: the rules and the start button on
            one side, the four briefs on the other. Stacked full-bleed instead, the
            rules would scroll away long before Challenge 4 came into view. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start xl:gap-8">
          <div className="space-y-6">
            <section className="border-border bg-surface shadow-(--shadow-card) space-y-4 rounded-(--radius-card) border p-6">
              <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
                <Info size={18} className="text-violet" />
                How it works
              </h2>

              <ul className="text-muted space-y-2.5 text-sm">
                <li className="flex gap-2.5">
                  <Clock size={15} className="text-violet mt-0.5 shrink-0" />
                  <span>
                    You have{" "}
                    <strong className="text-text">
                      {formatDuration(attempt.durationMinutes)}
                    </strong>{" "}
                    in total, counted from the moment you begin. The clock runs on our
                    servers, so closing your laptop or losing your connection does not
                    pause it.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <FileText size={15} className="text-violet mt-0.5 shrink-0" />
                  <span>
                    There are four challenges. Challenges 1 and 2 are for everyone;
                    Challenges 3 and 4 are alternatives, so you choose one of those two.
                    You can work in any order and move between them as often as you like.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="bg-violet mt-2 size-1 shrink-0 rounded-full"
                  />
                  <span>
                    Your work saves as you go. You do not need to finish one challenge
                    before starting another.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="bg-violet mt-2 size-1 shrink-0 rounded-full"
                  />
                  <span>
                    Nothing is handed in until you press{" "}
                    <strong className="text-text">Submit</strong>. That can only be done
                    once, and it cannot be undone.
                  </span>
                </li>
              </ul>
            </section>

            {!APPLICATION_UNDER_TEST_URL && notStarted && (
              <Alert variant="warning" title="Application link pending">
                The link to the application you will be testing in Challenge 1 will
                appear here before the event begins.
              </Alert>
            )}

            {/* Requirement 2: shown only before the attempt starts. During the test
                this page is reference material and must not offer a way to restart
                anything. */}
            {notStarted && (
              <section className="border-border bg-surface shadow-(--shadow-raised) space-y-4 rounded-(--radius-card) border p-6 text-center">
                <h2 className="font-display text-lg font-semibold">Ready?</h2>
                <p className="text-muted mx-auto max-w-md text-sm">
                  Your timer starts the moment you press this button, and it cannot be
                  paused or restarted. Make sure you are settled before you begin.
                </p>
                <form action={beginChallenge}>
                  <Button type="submit" variant="brand" size="lg">
                    Let&apos;s begin with the challenge
                  </Button>
                </form>
              </section>
            )}
          </div>

          <div className="space-y-6">
            {CHALLENGES.map((challenge) => (
              <div
                key={challenge.id}
                className="border-border bg-surface shadow-(--shadow-card) rounded-(--radius-card) border p-6"
              >
                <ChallengeBrief challenge={challenge} chosenTrack={attempt.chosenTrack} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
