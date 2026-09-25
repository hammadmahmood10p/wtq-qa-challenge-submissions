"use client";

import { Ban, Check, Eraser, KeyRound, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  adminApproveJudge,
  adminBlockUser,
  adminRejectJudge,
  adminRemoveUser,
  adminReopenAttempt,
  adminResetAttempt,
  adminResetPassword,
  adminUnblockUser,
  type AdminState,
} from "@/app/actions/admin";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import {
  FALLBACK_REOPEN_MINUTES,
  MAX_REOPEN_MINUTES,
  MIN_REOPEN_MINUTES,
} from "@/lib/attempt-admin-limits";
import type { RosterRow } from "@/lib/roster";
import { TempPasswordDialog } from "./temp-password-dialog";

type Action =
  | "block"
  | "unblock"
  | "remove"
  | "reset"
  | "approve"
  | "reject"
  | "restart";

const CONFIRMATIONS: Partial<
  Record<Action, { title: string; body: (name: string) => string; verb: string; danger?: boolean }>
> = {
  block: {
    title: "Block this account?",
    body: (name) =>
      `${name} will be signed out immediately and will not be able to log in again until you unblock them. Any work they have already saved is kept.`,
    verb: "Block",
    danger: true,
  },
  remove: {
    title: "Remove this account?",
    body: (name) =>
      `${name} will be signed out and removed from the roster. Their submissions and history are kept, and you can restore them afterwards.`,
    verb: "Remove",
    danger: true,
  },
  reset: {
    title: "Reset this password?",
    body: (name) =>
      `${name} will be signed out everywhere and given a temporary password, shown once on the next screen. They will choose a new one at their next login.`,
    verb: "Reset password",
  },
  restart: {
    title: "Clear this attempt and let them start again?",
    body: (name) =>
      `Everything ${name} submitted will be permanently deleted — their findings, screenshots, uploaded reports, repository link, written answers, and any scoring a judge has done. This cannot be undone. They will be able to log in and begin a fresh attempt with a full clock. To give them their work back instead, use Reopen.`,
    verb: "Delete their work and restart",
    danger: true,
  },
  reject: {
    title: "Reject this judge?",
    body: (name) =>
      `${name} will not be able to log in. You can restore the account later if this was a mistake.`,
    verb: "Reject",
    danger: true,
  },
};

export function RowActions({
  userId,
  fullName,
  status,
  kind,
  attempt,
}: {
  userId: string;
  fullName: string;
  status: string;
  kind: "participant" | "judge" | "admin";
  attempt?: RosterRow["attempt"];
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reopening asks a question the other actions do not — how long — so it gets its
  // own dialog rather than a confirm.
  const [reopening, setReopening] = useState(false);
  const [minutes, setMinutes] = useState("");

  function run(action: Action) {
    setError(null);
    startTransition(async () => {
      let result: AdminState;
      switch (action) {
        case "block":
          result = await adminBlockUser(userId);
          break;
        case "unblock":
          result = await adminUnblockUser(userId);
          break;
        case "remove":
          result = await adminRemoveUser(userId);
          break;
        case "reset":
          result = await adminResetPassword(userId);
          break;
        case "approve":
          result = await adminApproveJudge(userId);
          break;
        case "reject":
          result = await adminRejectJudge(userId);
          break;
        case "restart":
          result = await adminResetAttempt(userId);
          break;
      }

      setConfirming(null);
      if (result.message) setError(result.message);
      if (result.tempPassword) setTempPassword(result.tempPassword);
    });
  }

  function runReopen() {
    setError(null);
    startTransition(async () => {
      const result = await adminReopenAttempt(userId, Number(minutes));
      if (result.message) {
        setError(result.message);
        return;
      }
      setReopening(false);
    });
  }

  /** Destructive and irreversible-feeling actions confirm; reversible ones do not. */
  function request(action: Action) {
    if (CONFIRMATIONS[action]) setConfirming(action);
    else run(action);
  }

  const confirmation = confirming ? CONFIRMATIONS[confirming] : null;
  const isPending = status === "PENDING_APPROVAL";
  const isRemoved = status === "REMOVED";
  const isBlocked = status === "BLOCKED";

  // Only a sealed attempt can be handed back or cleared. Read from the attempt rather
  // than from the account status: SUBMITTED_LOCKED says they finished, but an admin
  // who has already reopened them once would otherwise still see "Reopen" offered.
  const sealed = attempt?.state === "SUBMITTED" || attempt?.state === "EXPIRED";
  const suggestedMinutes = attempt?.remainingMinutes ?? FALLBACK_REOPEN_MINUTES;

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {kind === "judge" && isPending && (
          <>
            <Button size="sm" variant="primary" onClick={() => request("approve")} disabled={pending}>
              <Check size={14} />
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => request("reject")} disabled={pending}>
              <X size={14} />
              Reject
            </Button>
          </>
        )}

        {kind === "participant" && sealed && (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setMinutes(String(suggestedMinutes));
                setReopening(true);
              }}
              disabled={pending}
              title="Reopen — give the work back"
            >
              <Undo2 size={14} />
              Reopen
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => request("restart")}
              disabled={pending}
              title="Clear their work and let them start again"
              className="hover:text-danger-strong"
            >
              <Eraser size={14} />
              <span className="sr-only">Clear {fullName}&apos;s attempt and restart</span>
            </Button>
          </>
        )}

        {!isPending && !isRemoved && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => request("reset")}
            disabled={pending}
            title="Reset password"
          >
            <KeyRound size={14} />
            <span className="sr-only">Reset password for {fullName}</span>
          </Button>
        )}

        {!isRemoved &&
          (isBlocked ? (
            <Button size="sm" variant="ghost" onClick={() => request("unblock")} disabled={pending}>
              <RotateCcw size={14} />
              Unblock
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => request("block")}
              disabled={pending}
              title="Block"
            >
              <Ban size={14} />
              <span className="sr-only">Block {fullName}</span>
            </Button>
          ))}

        {isRemoved ? (
          <Button size="sm" variant="ghost" onClick={() => request("unblock")} disabled={pending}>
            <RotateCcw size={14} />
            Restore
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => request("remove")}
            disabled={pending}
            title="Remove"
            className="hover:text-danger-strong"
          >
            <Trash2 size={14} />
            <span className="sr-only">Remove {fullName}</span>
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="error" className="mt-2">
          {error}
        </Alert>
      )}

      <Dialog
        open={confirmation !== null}
        onClose={() => setConfirming(null)}
        title={confirmation?.title ?? ""}
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">{confirmation?.body(fullName)}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant={confirmation?.danger ? "danger" : "primary"}
              onClick={() => confirming && run(confirming)}
              loading={pending}
            >
              {confirmation?.verb}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={reopening}
        onClose={() => setReopening(false)}
        title="Reopen this attempt?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            {fullName} will be able to log in again and carry on with everything they
            had saved — findings, uploads, answers and their Challenge 3 or 4 choice
            are all kept. Their submission is withheld from judging until they submit
            again, and the new submission replaces the old one.
          </p>

          <div className="space-y-1.5">
            <label htmlFor={`minutes-${userId}`} className="block text-sm font-medium">
              Minutes on the clock
            </label>
            <Input
              id={`minutes-${userId}`}
              type="number"
              inputMode="numeric"
              min={MIN_REOPEN_MINUTES}
              max={MAX_REOPEN_MINUTES}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <p className="text-muted text-xs">
              {attempt?.remainingMinutes
                ? `They had ${attempt.remainingMinutes} minute(s) left when they submitted.`
                : "Their time had run out, so there is nothing left to restore — choose how long they need."}
            </p>
          </div>

          {attempt && attempt.reopenCount > 0 && (
            <p className="text-warning-strong text-xs">
              This attempt has already been reopened {attempt.reopenCount} time(s).
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReopening(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={runReopen} loading={pending}>
              Reopen
            </Button>
          </div>
        </div>
      </Dialog>

      <TempPasswordDialog
        password={tempPassword}
        personName={fullName}
        onClose={() => setTempPassword(null)}
      />
    </>
  );
}
