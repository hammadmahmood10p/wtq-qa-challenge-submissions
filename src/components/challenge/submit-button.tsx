"use client";

import { AlertTriangle, Check, Loader2, Lock, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { currentProgress } from "@/app/actions/attempt";
import { submitEverything } from "@/app/actions/submit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { announceAttemptClosed } from "@/lib/attempt-channel";
import type { Progress } from "@/lib/challenge-progress";

/**
 * Requirement 5: the Submit button, beside the clock.
 *
 * It used to be active from the first second, on the reasoning that someone who has
 * run out of ideas should still be able to finish. The organisers have since made
 * Challenges 1 and 2 compulsory, so it now refuses until both are done — and says
 * which one is missing, because a disabled button that will not explain itself is the
 * single most frustrating thing a timed interface can do.
 *
 * Nothing here can trap anyone: the clock submits for them when it runs out (D1),
 * whatever state their work is in. This gate only governs finishing early.
 */
export function SubmitButton({ progress }: { progress: Progress }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Progress as of opening the dialog, which is the only moment it is read.
   *
   * The prop is a snapshot from the last page render, and every autosave since has
   * aged it — a participant who finished Challenge 3 on this screen would otherwise be
   * shown Challenges 1 and 2 and told the third was unfinished, until they refreshed.
   * Null until the first fetch returns, after which the fresh answer wins.
   */
  const [latest, setLatest] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(false);

  const live = latest ?? progress;

  function openDialog() {
    setOpen(true);
    setError(null);
    setLoading(true);

    // Not a transition: this must not be interrupted or batched away, and the dialog
    // waits on it rather than showing a count that may be about to change.
    currentProgress()
      .then(setLatest)
      .catch(() => {
        // Keep the snapshot and carry on. The server re-checks everything on submit,
        // so a failed refresh costs accuracy in the list, never correctness.
      })
      .finally(() => setLoading(false));
  }

  const blocked = !live.mandatoryComplete;
  const outstanding = live.mandatory.filter((item) => !item.complete);
  const ready = live.items.filter((item) => item.complete);

  function confirm() {
    setError(null);

    startTransition(async () => {
      const result = await submitEverything();

      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Tell this participant's other tabs before navigating. They are showing a
      // running clock and editable forms; the server would refuse their next write,
      // but they should not have to discover that by trying (D13).
      announceAttemptClosed();

      // replace, not push: there is no going back to the challenge, and the back
      // button should not pretend otherwise.
      router.replace("/submitted?reason=submitted");
    });
  }

  return (
    <>
      {/* The hint sits beside the button rather than under it so the sticky header
          keeps its height and stays aligned with the Information link; two lines of
          11px are shorter than the button itself. */}
      <div className="flex items-center gap-2.5">
        {blocked && (
          <p
            id="submit-blocked-reason"
            className="text-muted max-w-[15rem] text-right text-[11px] leading-snug"
          >
            Finish Challenges 1 and 2 and choose Challenge 3 or 4 to submit. If time runs out first,
            everything you have saved is submitted automatically — nothing is lost.
          </p>
        )}

        <Button
          variant={blocked ? "secondary" : "brand"}
          onClick={openDialog}
          // aria-disabled, not disabled. It reads as inactive and refuses to submit,
          // but stays focusable so it can still explain itself — a truly disabled
          // control cannot be reached by keyboard or announced, which would leave a
          // screen-reader user with no way to find out what is missing.
          aria-disabled={blocked}
          aria-describedby={blocked ? "submit-blocked-reason" : undefined}
          className={blocked ? "cursor-not-allowed opacity-60" : undefined}
        >
          {blocked ? <Lock size={15} /> : <Send size={15} />}
          Submit
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={
          loading
            ? "Checking your work…"
            : blocked
              ? "Not ready to submit yet"
              : "Submit your work?"
        }
      >
        {/* Waits rather than showing the snapshot first and correcting it. A list that
            appears, then rewrites itself under someone about to press an irreversible
            button, is worse than a short pause. */}
        {loading ? (
          <div className="text-muted flex items-center gap-2.5 py-6 text-sm">
            <Loader2 size={16} className="animate-spin shrink-0" />
            Checking everything you have saved…
          </div>
        ) : blocked ? (
          <div className="space-y-5">
            <p className="text-muted text-sm">
              Challenges 1 and 2 are compulsory, and you must commit to either Challenge 3 or
              Challenge 4, before you can hand everything in. Still outstanding:
            </p>

            <ul className="space-y-2">
              {outstanding.map((item) => (
                <li
                  key={item.key}
                  className="border-warning/40 bg-warning/8 rounded-(--radius-control) border px-3.5 py-2.5"
                >
                  <p className="text-warning-strong text-sm font-semibold">
                    Challenge {item.number} — {item.title}
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    Needs {item.missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.
                  </p>
                </li>
              ))}

              {/* Not a challenge, so it is not in `items` — but it blocks Submit just
                  as hard, and a list that showed only the two compulsory challenges
                  would leave someone who had finished both staring at a button that
                  still refuses them. */}
              {!progress.trackChosen && (
                <li className="border-warning/40 bg-warning/8 rounded-(--radius-control) border px-3.5 py-2.5">
                  <p className="text-warning-strong text-sm font-semibold">
                    Choose Challenge 3 or Challenge 4
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    They are alternatives and you must commit to one. The choice cannot be changed
                    afterwards.
                  </p>
                </li>
              )}
            </ul>

            <p className="text-muted text-xs">
              If the clock runs out first, everything you have saved is submitted automatically —
              you will not lose it.
            </p>

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Back to my work
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {error && <Alert variant="error">{error}</Alert>}

            <div>
              <p className="text-muted text-sm">
                You are about to hand in{" "}
                <strong className="text-text">
                  {ready.length} of {progress.total}
                </strong>{" "}
                challenges:
              </p>

              <ul className="mt-3 space-y-2">
                {ready.map((item) => (
                  <li
                    key={item.key}
                    className="border-success/50 bg-success/10 flex items-start gap-2.5 rounded-(--radius-control) border px-3.5 py-2.5"
                  >
                    <Check size={15} className="text-success-strong mt-0.5 shrink-0" />
                    <span className="text-success-strong text-sm font-semibold">
                      Challenge {item.number} — {item.title}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Named rather than left as a silent gap. Someone who chose Challenge 3
                  and did not finish it should see that fact here, while there is still
                  time to go back to it. */}
              {ready.length < progress.total && (
                <p className="text-muted mt-3 text-xs">
                  Anything not listed above is unfinished and will not be reviewed.
                </p>
              )}
            </div>

            <div className="border-danger/40 bg-danger/8 rounded-(--radius-control) border px-4 py-3">
              <p className="text-danger-strong flex items-center gap-2 text-sm font-bold">
                <AlertTriangle size={16} className="shrink-0" />
                This cannot be undone
              </p>
              <p className="text-danger-strong mt-1.5 text-sm font-medium">
                Submitting closes your attempt for good. You will be signed out, you will not be
                able to log in again, and nothing can be changed or added afterwards.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Keep working
              </Button>
              <Button variant="brand" onClick={confirm} loading={pending}>
                {pending ? "Submitting…" : "Submit and finish"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
