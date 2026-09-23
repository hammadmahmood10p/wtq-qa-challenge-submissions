"use client";

import { Badge } from "@/components/ui/badge";
import { useScoring } from "./scoring-context";

/**
 * The running total, at the top of the review page.
 *
 * Requirement: it starts at zero and counts up as the judge scores. It tracks what is
 * typed rather than what is saved — a judge who has entered nine of ten criteria
 * wants to see where the submission stands, not where it stood at the last save.
 *
 * Once the score is submitted it shows the frozen figure instead, which is the same
 * number but now means something different: a result rather than a running tally.
 */
export function TotalBanner() {
  const { total, maxTotal, status, complete } = useScoring();
  const submitted = status === "SUBMITTED";

  return (
    <div className="text-right">
      <p className="text-muted font-mono text-[10px] tracking-[0.18em] uppercase">
        {submitted ? "Final score" : "Total score"}
      </p>

      <p
        className="font-display tabular mt-1 text-4xl font-bold transition-colors"
        style={{ color: submitted ? "var(--success)" : undefined }}
        aria-live="polite"
      >
        {total}
        <span className="text-muted ml-1 text-lg font-normal">/ {maxTotal}</span>
      </p>

      <div className="mt-2 flex justify-end">
        {submitted ? (
          <Badge className="border-success/30 bg-success/10 text-success">Reviewed</Badge>
        ) : complete ? (
          <Badge className="border-violet/30 bg-violet/10 text-violet">Ready to submit</Badge>
        ) : (
          <Badge>In progress</Badge>
        )}
      </div>
    </div>
  );
}
