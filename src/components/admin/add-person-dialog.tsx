"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { adminCreateJudge, adminCreateParticipant, type AdminState } from "@/app/actions/admin";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { RadioCards } from "@/components/ui/radio-cards";
import { JUDGE_EMAIL_DOMAIN } from "@/lib/normalize";
import { TempPasswordDialog } from "./temp-password-dialog";

const INITIAL: AdminState = {};

const LOCATIONS = [
  { value: "KARACHI", label: "Karachi" },
  { value: "LAHORE", label: "Lahore" },
  { value: "ISLAMABAD", label: "Islamabad" },
];

export function AddPersonDialog({ kind }: { kind: "participant" | "judge" }) {
  const action = kind === "participant" ? adminCreateParticipant : adminCreateJudge;
  const [state, formAction, pending] = useActionState(action, INITIAL);

  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [createdName, setCreatedName] = useState("");
  const [dismissed, setDismissed] = useState(false);

  // Derived rather than copied into state by an effect: on success the form dialog
  // gives way to the once-only password, and `dismissed` is what closes that.
  const tempPassword = state.ok && state.tempPassword && !dismissed ? state.tempPassword : null;
  const formOpen = open && tempPassword === null;

  const error = (field: string) => state.errors?.[field];
  const label = kind === "participant" ? "participant" : "judge";

  return (
    <>
      <Button
        variant="brand"
        onClick={() => {
          setDismissed(true); // clear any previous result before reopening
          setOpen(true);
        }}
      >
        <UserPlus size={15} />
        Add {label}
      </Button>

      <Dialog
        open={formOpen}
        onClose={() => setOpen(false)}
        title={`Add a ${label}`}
        description="They will get a temporary password, shown once, and choose their own at first login."
      >
        <form
          action={(formData) => {
            setCreatedName(String(formData.get("fullName") ?? ""));
            setDismissed(false); // a new result is about to arrive
            formAction(formData);
          }}
          className="space-y-4"
          noValidate
        >
          {state.message && <Alert variant="error">{state.message}</Alert>}
          {state.errors?.form && <Alert variant="error">{state.errors.form}</Alert>}

          {kind === "participant" && (
            <Field
              label="ID card number"
              required
              error={error("idCardNumber")}
              hint="13 digits. Dashes optional."
            >
              {({ id, describedBy, invalid, required }) => (
                <Input
                  id={id}
                  name="idCardNumber"
                  inputMode="numeric"
                  placeholder="42101-1234567-8"
                  required={required}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
          )}

          <Field label="Full name" required error={error("fullName")}>
            {({ id, describedBy, invalid, required }) => (
              <Input
                id={id}
                name="fullName"
                placeholder="Their full name"
                required={required}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field
            label="Email"
            required
            error={error("email")}
            hint={kind === "judge" ? `Must end in ${JUDGE_EMAIL_DOMAIN}` : undefined}
          >
            {({ id, describedBy, invalid, required }) => (
              <Input
                id={id}
                name="email"
                type="email"
                placeholder={kind === "judge" ? `them${JUDGE_EMAIL_DOMAIN}` : "them@example.com"}
                required={required}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          {kind === "participant" && (
            <>
              <Field label="Phone number" required error={error("phone")}>
                {({ id, describedBy, invalid, required }) => (
                  <Input
                    id={id}
                    name="phone"
                    type="tel"
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
                    onChange={setLocation}
                    required={required}
                    describedBy={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={pending}>
              Create {label}
            </Button>
          </div>
        </form>
      </Dialog>

      <TempPasswordDialog
        password={tempPassword}
        personName={createdName}
        onClose={() => {
          setDismissed(true);
          setOpen(false);
          setLocation("");
        }}
      />
    </>
  );
}
