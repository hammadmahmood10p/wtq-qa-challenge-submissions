"use client";

import { KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import {
  adminClearMasterPassword,
  adminSetMasterPassword,
  adminSetMasterPasswordEnabled,
  type MasterPasswordActionState,
} from "@/app/actions/master-password";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import type { MasterPasswordState } from "@/lib/master-password";

/**
 * The master password, and an honest account of what it costs.
 *
 * The card leads with whether it is live, because that is the only thing anyone needs
 * to know at a glance, and the warning while it is on is loud on purpose: a single
 * password that opens a thousand accounts is not a setting to leave on and forget
 * after the hall has emptied. Switching it off is one click and needs no confirmation,
 * which is the right asymmetry — the safe direction should be the easy one.
 */
export function MasterPasswordCard({ state }: { state: MasterPasswordState }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState<MasterPasswordActionState | null>(null);

  function toggle(enabled: boolean) {
    setNotice(null);
    startTransition(async () => {
      setNotice(await adminSetMasterPasswordEnabled(enabled));
    });
  }

  function clear() {
    setNotice(null);
    startTransition(async () => {
      setNotice(await adminClearMasterPassword());
      setClearing(false);
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">Master password</h2>
        <p className="text-muted mt-1 text-sm">
          A fallback for the help desk: one password that signs in as any participant or
          judge, for someone who cannot remember the ID card number their own password
          was built from.
        </p>
      </div>

      {state.enabled && (
        <Alert variant="warning" title="The master password is live right now">
          Anyone who knows it can sign in as any participant or judge, from anywhere.
          Switch it off once the queue has cleared.
        </Alert>
      )}

      <div className="border-border bg-surface shadow-(--shadow-card) space-y-4 rounded-(--radius-card) border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display flex items-center gap-2 text-sm font-semibold">
              {state.enabled ? (
                <ShieldAlert size={15} className="text-warning-strong" />
              ) : (
                <ShieldCheck size={15} className="text-success-strong" />
              )}
              {state.enabled
                ? "Accepted at the login form"
                : state.isSet
                  ? "Set, but switched off"
                  : "Not set"}
            </p>
            <p className="text-muted mt-1 text-xs">
              {state.enabled
                ? "Every use is recorded in the audit log against the account it opened."
                : state.isSet
                  ? "Stored and ready. Nothing accepts it until you switch it on."
                  : "Set one now and it stays switched off until you need it."}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {state.isSet && (
              <Button
                variant={state.enabled ? "secondary" : "primary"}
                size="sm"
                onClick={() => toggle(!state.enabled)}
                disabled={pending}
              >
                {state.enabled ? "Switch off" : "Switch on"}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={pending}>
              <KeyRound size={14} />
              {state.isSet ? "Change" : "Set password"}
            </Button>
            {state.isSet && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setClearing(true)}
                disabled={pending}
                className="hover:text-danger-strong"
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        <ul className="text-muted space-y-1 text-xs">
          <li>It never opens a super admin account, only participants and judges.</li>
          <li>
            It replaces the password and nothing else — a blocked account stays blocked,
            someone who has already submitted stays locked out, and it does not reopen
            logins you have closed.
          </li>
          <li>
            Stored hashed, like any other password. Nobody can read it back out of the
            database, so if it is forgotten, set a new one.
          </li>
        </ul>

        {notice?.message && (
          <Alert variant={notice.ok ? "success" : "error"}>{notice.message}</Alert>
        )}
      </div>

      <SetDialog open={editing} onClose={() => setEditing(false)} isSet={state.isSet} />

      <Dialog
        open={clearing}
        onClose={() => setClearing(false)}
        title="Delete the master password?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            It is removed and switched off. Everyone signs in with their own password
            again — nobody is locked out by this, and you can set a new one at any time.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setClearing(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={clear} loading={pending}>
              Delete it
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}

function SetDialog({
  open,
  onClose,
  isSet,
}: {
  open: boolean;
  onClose: () => void;
  isSet: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, action, pending] = useActionState<MasterPasswordActionState, FormData>(
    adminSetMasterPassword,
    {},
  );

  function close() {
    setPassword("");
    setConfirm("");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={isSet ? "Change the master password" : "Set a master password"}
      description="Saving it does not switch it on."
    >
      <form action={action} className="space-y-4">
        {state.message && (
          <Alert variant={state.ok ? "success" : "error"}>{state.message}</Alert>
        )}

        <Field
          label="Master password"
          required
          hint="At least 12 characters. Someone may have to read this out across a noisy hall, so avoid characters that sound alike."
        >
          {({ id, describedBy, invalid }) => (
            <PasswordInput
              id={id}
              name="password"
              aria-describedby={describedBy}
              invalid={invalid}
              showStrength
              value={password}
              onValueChange={setPassword}
              autoComplete="new-password"
            />
          )}
        </Field>

        <Field label="Confirm master password" required>
          {({ id, describedBy, invalid }) => (
            <PasswordInput
              id={id}
              name="confirm"
              aria-describedby={describedBy}
              invalid={invalid}
              value={confirm}
              onValueChange={setConfirm}
              autoComplete="new-password"
            />
          )}
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={pending}>
            {state.ok ? "Close" : "Cancel"}
          </Button>
          <Button type="submit" loading={pending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
