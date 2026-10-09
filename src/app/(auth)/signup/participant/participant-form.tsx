"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUpParticipant, type SignupState } from "@/app/actions/signup";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { RadioCards } from "@/components/ui/radio-cards";

const INITIAL: SignupState = { ok: false };

const LOCATIONS = [
  { value: "KARACHI", label: "Karachi" },
  { value: "LAHORE", label: "Lahore" },
  { value: "ISLAMABAD", label: "Islamabad" },
];

export function ParticipantForm() {
  const [state, formAction, pending] = useActionState(signUpParticipant, INITIAL);

  // Controlled only where a component needs the value: the radio group and the two
  // password fields.
  //
  // The rest are uncontrolled, and get their value back from the action rather than
  // from the browser. React resets the form once the action returns, which emptied
  // every one of them — so a mistyped phone number was costing someone their ID card
  // number, name and email too. defaultValue is what the reset restores them to.
  const [location, setLocation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // True once they have picked a city since the last refusal, so the "Please select
  // your city" message goes the moment they do rather than sitting under a city they
  // can plainly see is selected.
  const [locationPicked, setLocationPicked] = useState(false);

  const error = (field: string) =>
    field === "location" && locationPicked ? undefined : state.errors?.[field];

  /**
   * Posts the city from React state rather than from the radio's DOM state.
   *
   * React resets the form once the action returns, which unchecks every radio in the
   * DOM. React's own state is unchanged, so nothing re-renders and the `checked` prop
   * is never re-applied — the card goes on looking selected while the input underneath
   * is not. The next submission then carried no city at all, and the form said "Please
   * select your city" to someone staring at a selected city.
   *
   * Setting it here cannot drift: what is posted is exactly what the screen shows.
   */
  function submit(formData: FormData) {
    formData.set("location", location);
    setLocationPicked(false);
    formAction(formData);
  }

  return (
    <form action={submit} className="space-y-5" noValidate>
      {state.message && <Alert variant="error">{state.message}</Alert>}
      {state.errors?.form && <Alert variant="error">{state.errors.form}</Alert>}

      <Field
        label="ID card number"
        required
        error={error("idCardNumber")}
        hint="13 digits. Dashes are fine — we will tidy them up."
      >
        {({ id, describedBy, invalid, required }) => (
          <Input
            id={id}
            name="idCardNumber"
            defaultValue={state.values?.idCardNumber}
            inputMode="numeric"
            autoComplete="off"
            placeholder="42101-1234567-8"
            required={required}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Full name" required error={error("fullName")}>
        {({ id, describedBy, invalid, required }) => (
          <Input
            id={id}
            name="fullName"
            defaultValue={state.values?.fullName}
            autoComplete="name"
            placeholder="Your full name"
            required={required}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field
        label="Registered email"
        required
        error={error("email")}
        hint="Use the email address you registered for the event with."
      >
        {({ id, describedBy, invalid, required }) => (
          <Input
            id={id}
            name="email"
            defaultValue={state.values?.email}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required={required}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field
        label="Registered phone number"
        required
        error={error("phone")}
        hint="Any format — 0300-1234567 or +92 300 1234567."
      >
        {({ id, describedBy, invalid, required }) => (
          <Input
            id={id}
            name="phone"
            defaultValue={state.values?.phone}
            type="tel"
            autoComplete="tel"
            placeholder="0300-1234567"
            required={required}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Location" required error={error("location")}>
        {({ describedBy, invalid, required }) => (
          <RadioCards
            legend="Location"
            name="location"
            options={LOCATIONS}
            value={location}
            onChange={(next) => {
              setLocation(next);
              setLocationPicked(true);
            }}
            required={required}
            describedBy={describedBy}
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
        {({ id, describedBy, invalid, required }) => (
          <PasswordInput
            id={id}
            name="password"
            autoComplete="new-password"
            value={password}
            onValueChange={setPassword}
            showStrength
            required={required}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Confirm password" required error={error("confirmPassword")}>
        {({ id, describedBy, invalid, required }) => (
          <PasswordInput
            id={id}
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onValueChange={setConfirmPassword}
            required={required}
            aria-describedby={describedBy}
            invalid={invalid || (confirmPassword.length > 0 && confirmPassword !== password)}
          />
        )}
      </Field>

      <Button type="submit" variant="brand" size="lg" full loading={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </Button>

      <p className="text-muted text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-violet font-medium hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
