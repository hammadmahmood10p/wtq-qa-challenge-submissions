"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitEverything } from "@/app/actions/submit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { announceAttemptClosed } from "@/lib/attempt-channel";

/**
 * Requirement 5: the Submit button, always active, beside the clock.
 *
 * Always active on purpose, even with nothing saved. A participant who has run out of
 * ideas should be able to finish, and a disabled button with no explanation is worse
 * than a confirmation dialog that says plainly what is about to happen.
 */
export function SubmitButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      <Button variant="aurora" onClick={() => setOpen(true)}>
        <Send size={15} />
        Submit
      </Button>

      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Are you sure you want to submit everything?"
      >
        <div className="space-y-5">
          {error && <Alert variant="error">{error}</Alert>}

          <p className="text-muted text-sm">
            Once you submit, you will not be able to submit again, and there is no way
            back to the challenges. Everything you have saved will be sent for review.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="aurora" onClick={confirm} loading={pending}>
              {pending ? "Submitting…" : "Confirm"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
