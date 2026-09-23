"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export interface ReviewPanel {
  challenge: ChallengeKey;
  label: string;
  sub: string;
  /** False for the alternative the participant did not choose. */
  applicable: boolean;
  content: React.ReactNode;
}

/**
 * The review sub-tabs, one per challenge.
 *
 * All four are shown rather than only the ones that apply, so a judge can see at a
 * glance which alternative the participant took — a missing tab would read as a
 * rendering fault. The one they did not choose is disabled and labelled.
 *
 * Panels stay mounted while hidden: a score typed but not yet saved must survive
 * switching tabs, and unmounting would discard it.
 */
export function ReviewTabs({ panels }: { panels: ReviewPanel[] }) {
  const selectable = panels.filter((p) => p.applicable);
  const [active, setActive] = useState<ChallengeKey>(selectable[0]?.challenge ?? "C1");

  function onKeyDown(event: React.KeyboardEvent) {
    const index = selectable.findIndex((p) => p.challenge === active);
    const last = selectable.length - 1;

    if (event.key === "ArrowRight") setActive(selectable[index === last ? 0 : index + 1].challenge);
    else if (event.key === "ArrowLeft") setActive(selectable[index === 0 ? last : index - 1].challenge);
    else if (event.key === "Home") setActive(selectable[0].challenge);
    else if (event.key === "End") setActive(selectable[last].challenge);
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
        {panels.map((panel) => {
          const selected = panel.challenge === active;

          return (
            <button
              key={panel.challenge}
              role="tab"
              id={`review-tab-${panel.challenge}`}
              aria-selected={selected}
              aria-controls={`review-panel-${panel.challenge}`}
              disabled={!panel.applicable}
              tabIndex={selected ? 0 : -1}
              onClick={() => panel.applicable && setActive(panel.challenge)}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-4 py-3 text-left text-sm whitespace-nowrap transition-colors",
                !panel.applicable && "text-muted/50 cursor-not-allowed",
                panel.applicable && selected && "text-violet font-semibold",
                panel.applicable && !selected && "text-muted hover:text-text",
              )}
              title={panel.applicable ? undefined : "The participant did not choose this challenge"}
            >
              {!panel.applicable && <Lock size={12} />}
              {panel.label}
              <span className="text-muted ml-1 hidden font-normal sm:inline">{panel.sub}</span>
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

      {panels
        .filter((panel) => panel.applicable)
        .map((panel) => (
          <div
            key={panel.challenge}
            role="tabpanel"
            id={`review-panel-${panel.challenge}`}
            aria-labelledby={`review-tab-${panel.challenge}`}
            hidden={panel.challenge !== active}
            tabIndex={0}
            className="py-8"
          >
            {panel.content}
          </div>
        ))}
    </div>
  );
}
