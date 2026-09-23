"use client";

import { useActionState, useState } from "react";
import { changePassword, type AuthState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";

const INITIAL: AuthState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, INITIAL);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.message && <Alert variant="error">{state.message}</Alert>}

      <Field label="Current password" required error={state.errors?.currentPassword}>
        {({ id, describedBy, invalid, required }) => (
          <PasswordInput
            id={id}
            name="currentPassword"
            autoComplete="current-password"
            autoFocus
            value={currentPassword}
            onValueChange={setCurrentPassword}
            required={required}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field
        label="New password"
        required
        error={state.errors?.newPassword}
        hint="At least 10 characters, with upper and lower case letters and a number."
      >
        {({ id, describedBy, invalid, required }) => (
          <PasswordInput
            id={id}
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onValueChange={setNewPassword}
            showStrength
            required={required}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Confirm new password" required error={state.errors?.confirmPassword}>
        {({ id, describedBy, invalid, required }) => (
          <PasswordInput
            id={id}
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onValueChange={setConfirmPassword}
            required={required}
            aria-describedby={describedBy}
            invalid={invalid || (confirmPassword.length > 0 && confirmPassword !== newPassword)}
          />
        )}
      </Field>

      <Button type="submit" variant="brand" size="lg" full loading={pending}>
        {pending ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}
