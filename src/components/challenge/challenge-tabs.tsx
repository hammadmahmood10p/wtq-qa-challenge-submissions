"use client";

import { useState } from "react";
import { ChallengeBrief } from "@/components/challenge/challenge-brief";
import { CHALLENGES } from "@/lib/challenge-content";
import { cn } from "@/lib/utils";

/**
 * The three challenge tabs (requirement 4).
 *
 * A note on the brief: it says the submission page "opens in a new browser tab" when
 * the tab is clicked. Taken literally that would mean clicking a tab navigates away
 * from the workspace, which loses the briefing and the clock. So the tab shows the
 * challenge details, and each one carries an explicit link that opens its submission
 * page in a new browser tab — which satisfies both halves of the requirement and
 * keeps the countdown on screen. Worth confirming.
 *
 * Implemented as a proper ARIA tablist with arrow-key navigation, because a
 * participant working for three hours should not have to reach for the mouse.
 */
export function ChallengeTabs() {
  const [active, setActive] = useState(0);

  function onKeyDown(event: React.KeyboardEvent) {
    const last = CHALLENGES.length - 1;
    if (event.key === "ArrowRight") setActive((i) => (i === last ? 0 : i + 1));
    else if (event.key === "ArrowLeft") setActive((i) => (i === 0 ? last : i - 1));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(last);
    else return;
    event.preventDefault();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Challenges"
        onKeyDown={onKeyDown}
        className="border-border flex gap-1 overflow-x-auto border-b"
      >
        {CHALLENGES.map((challenge, index) => {
          const selected = index === active;
          return (
            <button
              key={challenge.id}
              role="tab"
              id={`tab-${challenge.id}`}
              aria-selected={selected}
              aria-controls={`panel-${challenge.id}`}
              // Roving tabindex: the tablist is one stop, arrows move within it.
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              className={cn(
                "relative shrink-0 px-4 py-3 text-sm whitespace-nowrap transition-colors",
                selected ? "text-violet font-semibold" : "text-muted hover:text-text",
              )}
            >
              <span className="font-mono text-[11px] tracking-wider">
                Challenge {challenge.number}
              </span>
              <span className="ml-2 hidden sm:inline">{challenge.title}</span>
              {selected && (
                <span
                  aria-hidden="true"
                  className="bg-violet absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>

      {CHALLENGES.map((challenge, index) => (
        <div
          key={challenge.id}
          role="tabpanel"
          id={`panel-${challenge.id}`}
          aria-labelledby={`tab-${challenge.id}`}
          hidden={index !== active}
          tabIndex={0}
          className="py-8"
        >
          {index === active && <ChallengeBrief challenge={challenge} showSubmitLink />}
        </div>
      ))}
    </div>
  );
}
