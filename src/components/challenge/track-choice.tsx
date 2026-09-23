"use client";

import { Check, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chooseTrack } from "@/app/actions/track";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ChallengeTrack } from "@/generated/prisma/enums";

/**
 * Committing to Challenge 3 or Challenge 4.
 *
 * Deliberate and confirmed, never a side effect of opening a page: this closes the
 * other challenge permanently, and a participant who clicked a tab to see what was in
 * it would have no way back.
 *
 * The dialog says both consequences out loud — what closes, and what the choice is
 * worth — because +5 for one route and not the other is exactly the sort of thing
 * someone would want to know before deciding rather than after.
 */
export function TrackChoice({
  track,
  challengeNumber,
  chosenTrack,
  bonus,
}: {
  track: ChallengeTrack;
  challengeNumber: number;
  chosenTrack: ChallengeTrack | null;
  bonus?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isChosen = chosenTrack === track;
  const other = chosenTrack && chosenTrack !== track;

  if (isChosen) {
    return (
      <p className="text-success-strong flex items-center gap-1.5 text-sm font-medium">
        <Check size={15} />
        You chose this challenge.
      </p>
    );
  }

  if (other) {
    return (
      <p className="text-muted flex items-center gap-1.5 text-sm">
        <Lock size={14} />
        Closed — you chose Challenge {chosenTrack === "C3" ? 3 : 4}.
      </p>
    );
  }

  function confirm() {
    setError(null);

    startTransition(async () => {
      const result = await chooseTrack(track);

      if (!result.ok) {
        setError(result.error ?? "Could not record your choice.");
        if (result.closed) router.refresh();
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  const otherNumber = track === "C3" ? 4 : 3;

  return (
    <>
      <Button variant="brand" onClick={() => setOpen(true)}>
        Choose Challenge {challengeNumber}
      </Button>

      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={`Choose Challenge ${challengeNumber}?`}
      >
        <div className="space-y-5">
          {error && <Alert variant="error">{error}</Alert>}

          <p className="text-muted text-sm">
            Challenges {challengeNumber} and {otherNumber} are alternatives. Choosing this
            one closes Challenge {otherNumber} for the rest of your attempt, and the
            choice cannot be undone.
          </p>

          {bonus ? (
            <Alert variant="success">
              Choosing this challenge adds {bonus} bonus points to your score. The judges
              may adjust this on review.
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="brand" onClick={confirm} loading={pending}>
              {pending ? "Saving…" : `Choose Challenge ${challengeNumber}`}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
