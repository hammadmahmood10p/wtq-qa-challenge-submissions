"use client";

import { AlertCircle } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
    required: boolean;
  }) => React.ReactNode;
}

/**
 * Label, control, hint and error as one unit.
 *
 * The wiring here is the accessibility contract: the error is linked by
 * aria-describedby and announced via role="alert", so a screen-reader user hears what
 * went wrong instead of just being refused. Errors are never colour-only.
 */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className={cn("block text-sm font-medium", required && "required-mark")}
      >
        {label}
      </label>

      {children({ id, describedBy, invalid: Boolean(error), required: Boolean(required) })}

      {hint && !error && (
        <p id={hintId} className="text-muted text-xs">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-danger flex items-center gap-1.5 text-xs">
          <AlertCircle size={13} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClasses = (invalid?: boolean) =>
  cn(
    "w-full rounded-(--radius-control) border bg-surface px-3.5 py-2.5 text-sm transition-colors",
    "placeholder:text-muted/60",
    invalid ? "border-danger" : "border-border hover:border-muted/50",
  );

export function Input({
  invalid,
  className,
  ...props
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={cn(inputClasses(invalid), className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
