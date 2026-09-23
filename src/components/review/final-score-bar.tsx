"use client";

import { CheckCircle2, Lock, Unlock } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { inputClasses } from "@/components/ui/field";
import { useScoring } from "./scoring-context";

/**
 * Submit Final Score, and the super admin's way back out of it.
 *
 * Submitting locks the evaluation: the fields go read-only and the total is frozen on
 * the row, so a later change to the rubric cannot quietly restate a declared result.
 *
 * Reopening is deliberately more work than submitting — a dialog, a written reason,
 * and a record of both. Judging under time pressure produces mistakes, and the answer
 * to that is a door that is visibly used rather than one that is left unlocked.
 */
export function FinalScoreBar({ judgeName }: { judgeName: string | null }) {
  const { status, canScore, canUnlock, complete, total, maxTotal, submitFinal, unlock, error } =
    useScoring();

  const [confirming, setConfirming] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const submitted = status === "SUBMITTED";

  return (
    <section className="border-border bg-surface shadow-(--shadow-card) flex flex-wrap items-center justify-between gap-4 rounded-(--radius-card) border p-5">
      <div className="min-w-0">
        {submitted ? (
          <>
            <p className="font-display flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 size={15} className="text-success" />
              Final score submitted
            </p>
            <p className="text-muted mt-1 text-xs">
              Locked at {total} / {maxTotal}
              {judgeName ? ` by ${judgeName}` : ""}. Reopening it needs a super admin and a
              reason.
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-sm font-semibold">Finished with this submission?</p>
            <p className="text-muted mt-1 text-xs">
              {complete
                ? "Submitting locks the score. It cannot be changed afterwards without a super admin."
                : "Every criterion needs a score before you can submit the final score."}
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!submitted && canScore && (
          <Button variant="brand" onClick={() => setConfirming(true)} disabled={!complete}>
            <Lock size={15} />
            Submit Final Score
          </Button>
        )}

        {submitted && canUnlock && (
          <Button variant="secondary" onClick={() => setUnlocking(true)}>
            <Unlock size={14} />
            Reopen this score
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="error" className="w-full">
          {error}
        </Alert>
      )}

      <Dialog
        open={confirming}
        onClose={() => !pending && setConfirming(false)}
        title="Submit this final score?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            The total will be locked at{" "}
            <strong className="text-text">
              {total} / {maxTotal}
            </strong>
            . You will not be able to change it afterwards — a super admin would have to
            reopen it, with a reason recorded.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="brand"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  if (await submitFinal()) setConfirming(false);
                })
              }
            >
              Submit Final Score
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={unlocking}
        onClose={() => !pending && setUnlocking(false)}
        title="Reopen this submitted score?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            The score becomes editable again and the frozen total is cleared. This is
            recorded against the evaluation with your name and the reason below.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="unlock-reason" className="block text-sm font-medium">
              Why are you reopening it?
            </label>
            <textarea
              id="unlock-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Judge entered Challenge 2 scores against the wrong criterion"
              className={inputClasses()}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUnlocking(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  if (await unlock(reason)) {
                    setUnlocking(false);
                    setReason("");
                  }
                })
              }
            >
              Reopen
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
