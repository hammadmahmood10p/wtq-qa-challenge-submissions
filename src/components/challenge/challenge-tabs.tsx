"use client";

import { Check, Lock } from "lucide-react";
import { useState } from "react";
import { ChallengeBrief } from "@/components/challenge/challenge-brief";
import { TrackChoice } from "@/components/challenge/track-choice";
import { Alert } from "@/components/ui/alert";
import type { ChallengeTrack } from "@/generated/prisma/enums";
import { CHALLENGES, isChallengeOpen } from "@/lib/challenge-content";
import { isChallengeReachable } from "@/lib/challenge1-limits";
import { BONUS_DEFAULT } from "@/lib/scoring";
import { cn } from "@/lib/utils";

/**
 * The four challenges, listed down the side.
 *
 * A vertical list rather than a row of tabs: four titles do not fit across a laptop
 * without scrolling, and a scrollbar hides whichever challenge is off the end — which
 * is a poor way to present a choice a participant has to make. Down the side they are
 * all visible at once, with room for their state.
 *
 * Challenges 1 and 2 are compulsory. Challenges 3 and 4 are alternatives: both stay
 * visible so a participant can read each before deciding, but only the one they commit
 * to can be submitted to.
 */
export function ChallengeTabs({
  chosenTrack,
  challenge1Locked,
  reopenedForChallenge1 = false,
}: {
  chosenTrack: ChallengeTrack | null;
  /**
   * Whether Challenge 1 has been sealed, which is what opens the rest.
   *
   * The sequence is the organisers' design: the manual testing is done before the AI
   * challenges are visible, so a participant cannot go back and improve their own bug
   * reports after seeing what the AI found.
   */
  challenge1Locked: boolean;
  /**
   * Set while a super admin has reopened a submitted attempt for Challenge 1 alone.
   *
   * Shuts Challenges 2 to 4 for the opposite reason to the one above: not "you have not
   * got there yet" but "you already handed those in".
   */
  reopenedForChallenge1?: boolean;
}) {
  const [active, setActive] = useState(0);

  const reachable = (index: number) =>
    isChallengeReachable(CHALLENGES[index].id, challenge1Locked, reopenedForChallenge1);

  /**
   * The tab actually shown.
   *
   * Never a challenge the participant cannot reach yet. Reading `active` directly
   * would let a stale selection survive — and the panel it opens carries the "Open
   * Challenge N submission" link, which is how a participant ended up on Challenge 1
   * after pressing Challenge 2.
   */
  const current = reachable(active) ? active : 0;

  /** Steps over the challenges still waiting on Challenge 1 rather than landing on one. */
  function step(from: number, delta: number): number {
    const count = CHALLENGES.length;
    for (let i = 1; i <= count; i++) {
      const next = (from + delta * i + count * count) % count;
      if (reachable(next)) return next;
    }
    return from;
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Up and down, because the list runs vertically.
    if (event.key === "ArrowDown") setActive((i) => step(i, 1));
    else if (event.key === "ArrowUp") setActive((i) => step(i, -1));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(step(0, -1));
    else return;
    event.preventDefault();
  }

  return (
    <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
      <div className="lg:sticky lg:top-28 lg:self-start">
        {!chosenTrack && (
          <Alert variant="info" className="mb-4 hidden lg:flex">
            Challenges 3 and 4 are alternatives — choose one and the other closes.
          </Alert>
        )}

        <div
          role="tablist"
          aria-label="Challenges"
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
          className="border-border flex gap-1 overflow-x-auto border-b lg:flex-col lg:gap-1.5 lg:overflow-visible lg:border-0"
        >
          {CHALLENGES.map((challenge, index) => {
            const selected = index === current;
            // Shut because the track was not chosen, or because Challenge 1 has not
            // been sealed yet — two different reasons that look alike but behave
            // differently. A track-closed challenge stays readable, because a
            // participant who has committed is owed the explanation. One still waiting
            // on Challenge 1 is not openable at all: opening it was what led to the
            // "Open Challenge 2 submission" link bouncing them back to Challenge 1.
            const closedByTrack = Boolean(
              challenge.track && chosenTrack && !isChallengeOpen(challenge, chosenTrack),
            );
            const waitingOnChallenge1 = !reachable(index);
            const closed = closedByTrack || waitingOnChallenge1;
            const chosen = Boolean(challenge.track && chosenTrack === challenge.track);

            return (
              <button
                key={challenge.id}
                role="tab"
                id={`tab-${challenge.id}`}
                aria-selected={selected}
                aria-controls={`panel-${challenge.id}`}
                disabled={waitingOnChallenge1}
                tabIndex={selected ? 0 : -1}
                title={
                  waitingOnChallenge1
                    ? reopenedForChallenge1
                      ? "Already submitted — only Challenge 1 was reopened for you"
                      : "Lock Challenge 1 to open this one"
                    : undefined
                }
                onClick={() => setActive(index)}
                className={cn(
                  "relative shrink-0 px-4 py-3 text-left transition-colors lg:rounded-(--radius-control) lg:border",
                  selected
                    ? "text-violet lg:border-violet/40 lg:bg-violet/5 font-semibold"
                    : "text-muted lg:border-transparent",
                  !selected &&
                    !waitingOnChallenge1 &&
                    "hover:text-text lg:hover:bg-surface-raised/60",
                  closed && !selected && "opacity-50",
                  waitingOnChallenge1 && "cursor-not-allowed",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {closed && <Lock size={11} className="shrink-0" />}
                  {chosen && <Check size={12} className="text-success-strong shrink-0" />}
                  <span className="font-mono text-[11px] tracking-wider">
                    Challenge {challenge.number}
                  </span>
                </span>

                <span className="mt-0.5 hidden text-sm lg:block">{challenge.title}</span>

                <span className="ml-1 text-sm lg:hidden">{challenge.title}</span>

                {/* Underline on narrow screens, left bar on wide ones. */}
                {selected && (
                  <span
                    aria-hidden="true"
                    className="bg-violet absolute inset-x-2 -bottom-px h-0.5 rounded-full lg:inset-x-auto lg:inset-y-2 lg:left-0 lg:h-auto lg:w-0.5"
                  />
                )}

                {challenge.track === "C3" && !chosenTrack && (
                  <span className="text-success-strong mt-1 hidden text-[11px] font-medium lg:block">
                    +{BONUS_DEFAULT} bonus
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {/* Said once, at the top, rather than on each shut tab: a participant who has
            not locked yet is looking at three greyed-out challenges and needs one
            explanation, not three. */}
        {reopenedForChallenge1 ? (
          <Alert
            variant="warning"
            title="Challenge 1 has been reopened for you"
            className="mt-6 lg:mt-0"
          >
            Everything you wrote is still there. Challenges 2, 3 and 4 were already submitted and
            cannot be changed — only Challenge 1 is editable. When you are finished, press Submit
            again; your new Challenge 1 replaces the old one and nothing is submitted twice.
          </Alert>
        ) : (
          !challenge1Locked && (
            <Alert variant="info" title="Start with Challenge 1" className="mt-6 lg:mt-0">
              Challenges 2, 3 and 4 open once you have locked Challenge 1. Do your manual testing
              first — that is the point of the order.
            </Alert>
          )
        )}

        {challenge1Locked && !chosenTrack && !reopenedForChallenge1 && (
          <Alert
            variant="info"
            title="Challenges 3 and 4 are alternatives"
            className="mt-6 lg:hidden"
          >
            Read both, then choose one — the other closes, and the choice cannot be undone.
            Challenge 3 carries a {BONUS_DEFAULT}-point bonus.
          </Alert>
        )}

        {CHALLENGES.map((challenge, index) => (
          <div
            key={challenge.id}
            role="tabpanel"
            id={`panel-${challenge.id}`}
            aria-labelledby={`tab-${challenge.id}`}
            hidden={index !== current}
            tabIndex={0}
            className="py-8 lg:pt-0"
          >
            {index === current && (
              <ChallengeBrief
                challenge={challenge}
                showSubmitLink
                chosenTrack={chosenTrack}
                choiceControl={
                  challenge.track ? (
                    <TrackChoice
                      track={challenge.track}
                      challengeNumber={challenge.number}
                      chosenTrack={chosenTrack}
                      bonus={challenge.track === "C3" ? BONUS_DEFAULT : undefined}
                    />
                  ) : undefined
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
