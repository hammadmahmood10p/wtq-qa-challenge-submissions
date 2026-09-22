"use client";

import { Ban, Check, KeyRound, RotateCcw, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  adminApproveJudge,
  adminBlockUser,
  adminRejectJudge,
  adminRemoveUser,
  adminResetPassword,
  adminUnblockUser,
  type AdminState,
} from "@/app/actions/admin";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TempPasswordDialog } from "./temp-password-dialog";

type Action = "block" | "unblock" | "remove" | "reset" | "approve" | "reject";

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
}: {
  userId: string;
  fullName: string;
  status: string;
  kind: "participant" | "judge";
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      }

      setConfirming(null);
      if (result.message) setError(result.message);
      if (result.tempPassword) setTempPassword(result.tempPassword);
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
            className="hover:text-danger"
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

      <TempPasswordDialog
        password={tempPassword}
        personName={fullName}
        onClose={() => setTempPassword(null)}
      />
    </>
  );
}
