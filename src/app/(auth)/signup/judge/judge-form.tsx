"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUpJudge, type SignupState } from "@/app/actions/signup";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { JUDGE_EMAIL_DOMAIN } from "@/lib/normalize";

const INITIAL: SignupState = { ok: false };

export function JudgeForm() {
  const [state, formAction, pending] = useActionState(signUpJudge, INITIAL);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const error = (field: string) => state.errors?.[field];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.message && <Alert variant="error">{state.message}</Alert>}
      {state.errors?.form && <Alert variant="error">{state.errors.form}</Alert>}

      <Alert variant="info">
        Judge accounts need super admin approval. You will not be able to log in until
        yours is approved.
      </Alert>

      <Field
        label="10Pearls email"
        required
        error={error("email")}
        hint={`Must end in ${JUDGE_EMAIL_DOMAIN}`}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            placeholder={`you${JUDGE_EMAIL_DOMAIN}`}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Full name" required error={error("fullName")}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="fullName"
            autoComplete="name"
            placeholder="Your full name"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field
        label="Create password"
        required
        error={error("password")}
        hint="At least 10 characters, with upper and lower case letters and a number."
      >
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            name="password"
            autoComplete="new-password"
            value={password}
            onValueChange={setPassword}
            showStrength
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Confirm password" required error={error("confirmPassword")}>
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onValueChange={setConfirmPassword}
            aria-describedby={describedBy}
            invalid={invalid || (confirmPassword.length > 0 && confirmPassword !== password)}
          />
        )}
      </Field>

      <Button type="submit" variant="aurora" size="lg" full loading={pending}>
        {pending ? "Creating your account…" : "Request an account"}
      </Button>

      <p className="text-muted text-center text-sm">
        Already approved?{" "}
        <Link href="/login" className="text-violet font-medium hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
