"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { login, type AuthState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";

const INITIAL: AuthState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL);
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.message && <Alert variant="error">{state.message}</Alert>}

      {/* Requirement 8: two fields, both required. Requirement 9: any of the three
          identifiers goes in this one box. */}
      <Field
        label="Username"
        required
        error={state.errors?.username}
        hint="Your email, ID card number or phone number."
      >
        {({ id, describedBy, invalid, required }) => (
          <Input
            id={id}
            name="username"
            autoComplete="username"
            autoFocus
            placeholder="you@example.com"
            required={required}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Password" required error={state.errors?.password}>
        {({ id, describedBy, invalid, required }) => (
          <PasswordInput
            id={id}
            name="password"
            autoComplete="current-password"
            value={password}
            onValueChange={setPassword}
            required={required}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Button type="submit" variant="brand" size="lg" full loading={pending}>
        {pending ? "Logging you in…" : "Log in"}
      </Button>

      <p className="text-muted text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-violet font-medium hover:underline">
          Sign up
        </Link>
      </p>

      {/* There is no self-service reset: password resets are handled by the super
          admin (no email service). Saying so here saves a participant hunting for a
          "forgot password" link that does not exist. */}
      <p className="text-muted border-border border-t pt-4 text-center text-xs">
        Forgotten your password? Contact the Women Tech Quest organising team — they can
        reset it for you.
      </p>
    </form>
  );
}
