"use client";

import { Check, Save } from "lucide-react";
import { inputClasses } from "@/components/ui/field";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BONUS_CHOICES, BONUS_MAX, BONUS_MIN, rubricFor } from "@/lib/scoring";
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
    bonus,
    setBonus,
    saveBonusValue,
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
            Two choices, not a range.

            The bonus is a verdict — the Challenge 3 work either bore out the decision
            to take it on, or it did not. A free number invited judges to split the
            difference at +2 or +3, which is a distinction none of them could defend
            and which made two judges' scores incomparable. Rendered as a radio group
            so the keyboard and a screen reader get the same two options the mouse does.
          */}
          <fieldset disabled={!canScore} className="space-y-3">
            <legend className="text-sm font-medium">
              Challenge 3 bonus
              <span className="text-muted ml-1 font-normal">
                / +{BONUS_MAX} or {BONUS_MIN}
              </span>
            </legend>

            <p className="text-muted max-w-md text-xs">
              Granted at +{BONUS_MAX} for taking Challenge 3 on. Change it to {BONUS_MIN}{" "}
              where the work does not bear that choice out. There is nothing in between.
            </p>

            <div className="flex flex-wrap gap-2">
              {BONUS_CHOICES.map((choice) => {
                const selected = bonus === String(choice);

                return (
                  <label
                    key={choice}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3.5 py-2 text-sm transition-colors",
                      selected
                        ? choice > 0
                          ? "border-success/50 bg-success/10 text-success-strong font-semibold"
                          : "border-danger/50 bg-danger/10 text-danger-strong font-semibold"
                        : "border-border hover:bg-surface-raised",
                      !canScore && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="score-bonus"
                      value={choice}
                      checked={selected}
                      onChange={() => setBonus(String(choice))}
                      className="size-4 accent-[var(--violet)]"
                    />
                    <span className="tabular">
                      {choice > 0 ? `+${choice}` : choice}
                    </span>
                    <span className="text-muted text-xs font-normal">
                      {choice > 0 ? "the work bears it out" : "it does not"}
                    </span>
                  </label>
                );
              })}
            </div>

            {canScore && (
              <Button variant="secondary" size="sm" onClick={saveBonusValue} disabled={pending}>
                <Save size={14} />
                Save bonus
              </Button>
            )}
          </fieldset>
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
