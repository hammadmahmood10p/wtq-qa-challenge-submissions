"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "c1", label: "Task 1", sub: "Manual QA" },
  { id: "c2", label: "Task 2", sub: "Chatbot Evaluation" },
  { id: "c3", label: "Task 3", sub: "Automation Readiness" },
] as const;

/**
 * The three review sub-tabs (judge requirement 4).
 *
 * All three panels are rendered and kept mounted, with the inactive ones hidden. Once
 * Day 10 adds a score field per task, switching tabs must not discard a number a judge
 * has typed but not yet saved — and unmounting the panel would do exactly that.
 */
export function ReviewTabs({
  panels,
}: {
  panels: { c1: React.ReactNode; c2: React.ReactNode; c3: React.ReactNode };
}) {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("c1");

  function onKeyDown(event: React.KeyboardEvent) {
    const index = TABS.findIndex((t) => t.id === active);
    const last = TABS.length - 1;

    if (event.key === "ArrowRight") setActive(TABS[index === last ? 0 : index + 1].id);
    else if (event.key === "ArrowLeft") setActive(TABS[index === 0 ? last : index - 1].id);
    else if (event.key === "Home") setActive(TABS[0].id);
    else if (event.key === "End") setActive(TABS[last].id);
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
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`review-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`review-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                "relative shrink-0 px-4 py-3 text-left text-sm whitespace-nowrap transition-colors",
                selected ? "text-violet font-semibold" : "text-muted hover:text-text",
              )}
            >
              {tab.label}
              <span className="text-muted ml-2 hidden font-normal sm:inline">{tab.sub}</span>
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

      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`review-panel-${tab.id}`}
          aria-labelledby={`review-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="py-8"
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
