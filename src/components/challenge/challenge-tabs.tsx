"use client";

import { Check, Lock } from "lucide-react";
import { useState } from "react";
import { ChallengeBrief } from "@/components/challenge/challenge-brief";
import { TrackChoice } from "@/components/challenge/track-choice";
import { Alert } from "@/components/ui/alert";
import type { ChallengeTrack } from "@/generated/prisma/enums";
import { CHALLENGES, isChallengeOpen } from "@/lib/challenge-content";
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
export function ChallengeTabs({ chosenTrack }: { chosenTrack: ChallengeTrack | null }) {
  const [active, setActive] = useState(0);

  function onKeyDown(event: React.KeyboardEvent) {
    const last = CHALLENGES.length - 1;
    // Up and down, because the list runs vertically.
    if (event.key === "ArrowDown") setActive((i) => (i === last ? 0 : i + 1));
    else if (event.key === "ArrowUp") setActive((i) => (i === 0 ? last : i - 1));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(last);
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
            const selected = index === active;
            const closed = Boolean(
              challenge.track && chosenTrack && !isChallengeOpen(challenge, chosenTrack),
            );
            const chosen = Boolean(challenge.track && chosenTrack === challenge.track);

            return (
              <button
                key={challenge.id}
                role="tab"
                id={`tab-${challenge.id}`}
                aria-selected={selected}
                aria-controls={`panel-${challenge.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(index)}
                className={cn(
                  "relative shrink-0 px-4 py-3 text-left transition-colors lg:rounded-(--radius-control) lg:border",
                  selected
                    ? "text-violet lg:border-violet/40 lg:bg-violet/5 font-semibold"
                    : "text-muted hover:text-text lg:border-transparent lg:hover:bg-surface-raised/60",
                  closed && !selected && "opacity-50",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {closed && <Lock size={11} className="shrink-0" />}
                  {chosen && <Check size={12} className="text-success shrink-0" />}
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
                  <span className="text-success mt-1 hidden text-[11px] font-medium lg:block">
                    +{BONUS_DEFAULT} bonus
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {!chosenTrack && (
          <Alert variant="info" title="Challenges 3 and 4 are alternatives" className="mt-6 lg:hidden">
            Read both, then choose one — the other closes, and the choice cannot be
            undone. Challenge 3 carries a {BONUS_DEFAULT}-point bonus.
          </Alert>
        )}

        {CHALLENGES.map((challenge, index) => (
          <div
            key={challenge.id}
            role="tabpanel"
            id={`panel-${challenge.id}`}
            aria-labelledby={`tab-${challenge.id}`}
            hidden={index !== active}
            tabIndex={0}
            className="py-8 lg:pt-0"
          >
            {index === active && (
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
