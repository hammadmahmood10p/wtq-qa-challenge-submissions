"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface Props {
  name: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  required?: boolean;
  describedBy?: string;
  legend: string;
}

/**
 * Radio buttons rendered as selectable cards.
 *
 * Still native radios underneath — the input is visually hidden rather than replaced —
 * so keyboard arrow navigation and screen readers behave exactly as expected. The card
 * is only presentation.
 *
 * **Do not rely on these radios to carry the value into a server action.** They are
 * controlled, and the tick and border are drawn from `value` rather than from the
 * input's `:checked`. React resets a form once its action returns, which unchecks every
 * radio in the DOM; React's state has not changed, so nothing re-renders and `checked`
 * is never re-applied. The group then goes on looking selected while submitting
 * nothing, which is a convincing impression of a broken validator.
 *
 * Both callers set the field on the FormData from their own state instead — see
 * participant-form.tsx and add-person-dialog.tsx. Any new caller must do the same.
 */
export function RadioCards({
  name,
  options,
  value,
  onChange,
  invalid,
  required,
  describedBy,
  legend,
}: Props) {
  return (
    <fieldset
      // A fieldset alone cannot take aria-required or aria-invalid — axe rightly
      // flags it. role="radiogroup" is what makes this a single required control
      // rather than a box with radios in it, and it permits both.
      role="radiogroup"
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={required || undefined}
    >
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex cursor-pointer items-center justify-between gap-2 rounded-(--radius-control) border px-3.5 py-3 text-sm transition-all duration-(--duration-micro)",
                "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--brand-indigo)",
                selected
                  ? "border-violet bg-violet/8 font-medium"
                  : invalid
                    ? "border-danger hover:border-muted/50"
                    : "border-border hover:border-muted/50",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
              {selected && <Check size={15} className="text-violet shrink-0" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
