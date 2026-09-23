"use client";

import { LockKeyhole, LogOut, Unlock } from "lucide-react";
import { useState, useTransition } from "react";
import {
  adminSetParticipantLogins,
  adminSignOutAllParticipants,
  type AdminState,
} from "@/app/actions/admin";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Pending = "disable" | "enable" | "signout" | null;

/**
 * The two blunt instruments, kept apart on purpose.
 *
 * Closing logins and throwing everyone out are different decisions with different
 * consequences, and the second one cannot be undone — an hour into a three-hour
 * attempt, a mistaken sign-out costs a thousand people whatever they had typed since
 * their last autosave. One button doing both would mean an admin reaching for the
 * harmless one and getting the other.
 */
export function ParticipantAccessControls({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(action: Exclude<Pending, null>) {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result: AdminState =
        action === "signout"
          ? await adminSignOutAllParticipants()
          : await adminSetParticipantLogins(action === "disable");

      setConfirming(null);
      if (result.ok && result.message) setNotice(result.message);
      else if (result.message) setError(result.message);
    });
  }

  return (
    <div className="space-y-3">
      <div className="border-border bg-surface shadow-(--shadow-card) flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border p-4">
        <div className="min-w-0">
          <p className="font-display flex items-center gap-2 text-sm font-semibold">
            {disabled ? (
              <LockKeyhole size={15} className="text-danger-strong" />
            ) : (
              <Unlock size={15} className="text-success-strong" />
            )}
            Participant logins are {disabled ? "closed" : "open"}
          </p>
          <p className="text-muted mt-1 text-xs">
            {disabled
              ? "No participant can sign in. Anyone already working is unaffected and can still submit."
              : "Participants can sign in normally. Accounts blocked individually, or already submitted, stay closed either way."}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant={disabled ? "primary" : "secondary"}
            size="sm"
            onClick={() => setConfirming(disabled ? "enable" : "disable")}
            disabled={pending}
          >
            {disabled ? <Unlock size={14} /> : <LockKeyhole size={14} />}
            {disabled ? "Enable All" : "Disable All"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming("signout")}
            disabled={pending}
            className="hover:text-danger-strong"
          >
            <LogOut size={14} />
            Sign everyone out
          </Button>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <Dialog
        open={confirming === "disable"}
        onClose={() => setConfirming(null)}
        title="Close participant logins?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            No participant will be able to sign in until you open them again. Anyone
            already signed in keeps working and can still submit — their clocks are not
            affected. Judges and admins are unaffected.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => run("disable")} loading={pending}>
              Disable All
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirming === "enable"}
        onClose={() => setConfirming(null)}
        title="Open participant logins?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            Participants will be able to sign in again. Anyone blocked individually, or
            who has already submitted, stays closed — this only lifts the event-wide
            switch.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => run("enable")} loading={pending}>
              Enable All
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirming === "signout"}
        onClose={() => setConfirming(null)}
        title="Sign every participant out?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            Every participant is signed out immediately, wherever they are working.
            Everything they have saved is kept, but anything typed since their last
            autosave is lost.
          </p>
          <p className="text-muted text-sm">
            This does not pause anybody&apos;s clock, and it does not close logins — if
            you want them kept out, use Disable All as well.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => run("signout")} loading={pending}>
              Sign everyone out
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
