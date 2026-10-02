"use client";

import { Check, Minus, Plus, Save } from "lucide-react";
import { inputClasses } from "@/components/ui/field";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BONUS_AMOUNT, BONUS_GRANTED, BONUS_WITHDRAWN, rubricFor } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { useScoring } from "./scoring-context";

/**
 * The score fields for one task, with its own Save button.
 *
 * Saving per task rather than per page is what the brief asks for, and it matches how
 * a panel works: read one task, score it, save, move on. It also means a judge who
 * loses their connection halfway through loses one task's numbers at worst.
 *
 * The card sits at the top of its tab, above the submission it is scoring. A judge
 * scrolling a long Challenge 1 with forty findings should not have to scroll back to
 * find the box — and the numbers are the reason they are on this page.
 */
export function ChallengeScoreCard({ challenge }: { challenge: ChallengeKey }) {
  const {
    values,
    setValue,
    canScore,
    pending,
    error,
    dirty,
    savedAt,
    saveChallenge,
    bonusGranted,
    setBonusTo,
    maxTotal,
    track,
    status,
  } = useScoring();

  const rubric = rubricFor(challenge);
  const criteria = rubric.criteria;
  const unsaved = criteria.some((c) => dirty.has(c.key));
  const justSaved = savedAt[challenge] !== undefined && !unsaved;

  // The bonus belongs to the Challenge 3 tab: it exists because of that choice, and
  // putting it anywhere else makes it look like a free-floating adjustment.
  const showBonus = challenge === "C3" && track === "C3";

  return (
    <section className="border-violet/25 bg-violet/4 mb-8 rounded-(--radius-card) border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Score this task</h2>
        <p className="text-muted text-xs">
          {rubric.title} · {criteria.reduce((sum, c) => sum + c.max, 0)} points
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {criteria.map((criterion) => (
          <div key={criterion.key} className="space-y-1.5">
            <label
              htmlFor={`score-${criterion.key}`}
              className="block text-sm font-medium"
            >
              {criterion.label}
              <span className="text-muted ml-1 font-normal">/ {criterion.max}</span>
            </label>

            {criterion.hint && <p className="text-muted text-xs">{criterion.hint}</p>}

            <input
              id={`score-${criterion.key}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={criterion.max}
              step={0.5}
              disabled={!canScore}
              value={values[criterion.key] ?? ""}
              onChange={(e) => setValue(criterion.key, e.target.value)}
              placeholder="—"
              className={cn(inputClasses(), "tabular max-w-28 disabled:opacity-60")}
            />
          </div>
        ))}
      </div>

      {showBonus && (
        <div className="border-border mt-5 border-t pt-4">
          {/* The button sits beside its field rather than at the far edge of the card:
              at laptop width those are a thousand pixels apart, and a save control
              that far from what it saves reads as belonging to something else. */}
          {/*
            A switch, not a score.

            The five points are already on the participant's total — they were granted
            by choosing Challenge 3, before any judge saw the work. So the only
            question here is whether to take them away, and the only two states are
            "still has them" and "does not".

            Each button is disabled when it would change nothing, which makes the
            current state readable without a separate label: the greyed-out one is
            where the bonus already is. Clicking saves immediately, because an action
            phrased as a movement and then parked behind a Save button reads as though
            it has not happened.
          */}
          <div className="space-y-3">
            <p className="text-sm font-medium">
              Challenge 3 bonus
              <span
                className={cn(
                  "ml-2 rounded-full border px-2 py-0.5 text-xs font-semibold",
                  bonusGranted
                    ? "border-success/40 bg-success/10 text-success-strong"
                    : "border-muted/30 text-muted",
                )}
              >
                {bonusGranted ? `+${BONUS_AMOUNT} applied` : "withdrawn"}
              </span>
            </p>

            <p className="text-muted max-w-md text-xs">
              {BONUS_AMOUNT} points the participant already holds for taking Challenge 3
              on. They are counted on top of the {maxTotal}, so full marks here reads as{" "}
              {maxTotal + BONUS_AMOUNT}/{maxTotal}. Withdraw them where the work does not
              bear the choice out.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canScore || pending || !bonusGranted}
                onClick={() => setBonusTo(BONUS_WITHDRAWN)}
              >
                <Minus size={14} />
                {BONUS_AMOUNT} — withdraw the bonus
              </Button>

              <Button
                variant="secondary"
                size="sm"
                disabled={!canScore || pending || bonusGranted}
                onClick={() => setBonusTo(BONUS_GRANTED)}
              >
                <Plus size={14} />
                {BONUS_AMOUNT} — give it back
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      {canScore && (
        <div className="mt-5 flex items-center justify-end gap-3">
          <span
            role="status"
            className={cn(
              "text-xs transition-opacity",
              justSaved ? "text-success-strong" : unsaved ? "text-muted" : "opacity-0",
            )}
          >
            {justSaved ? (
              <span className="inline-flex items-center gap-1">
                <Check size={13} />
                Saved
              </span>
            ) : unsaved ? (
              "Unsaved changes"
            ) : (
              " "
            )}
          </span>

          <Button onClick={() => saveChallenge(challenge)} loading={pending} size="sm">
            <Save size={14} />
            Save Task {rubric.challenge.slice(1)}
          </Button>
        </div>
      )}

      {/* Two quite different reasons the fields are dead, and a judge needs to know
          which: one is fixed by a super admin, the other by the right judge. */}
      {!canScore && (
        <p className="text-muted mt-4 text-xs">
          {status === "SUBMITTED"
            ? "This score has been submitted and is locked."
            : "Only the judge this submission is assigned to can score it."}
        </p>
      )}
    </section>
  );
}
