"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { passwordStrength } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";
import { inputClasses } from "./field";

const LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;
const COLORS = [
  "",
  "var(--danger)",
  "var(--warning)",
  "var(--info)",
  "var(--success)",
] as const;

interface Props extends Omit<React.ComponentProps<"input">, "type"> {
  invalid?: boolean;
  showStrength?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}

export function PasswordInput({
  invalid,
  showStrength,
  value,
  onValueChange,
  className,
  ...props
}: Props) {
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={cn(inputClasses(invalid), "pr-11", className)}
          aria-invalid={invalid || undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-muted hover:text-text absolute inset-y-0 right-0 flex items-center px-3.5 transition-colors"
          aria-label={visible ? "Hide password" : "Show password"}
          // Not a form control — keep it out of the tab order between fields.
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className="h-1 flex-1 rounded-full transition-colors duration-(--duration-micro)"
                style={{
                  background: step <= strength ? COLORS[strength] : "var(--border)",
                }}
              />
            ))}
          </div>
          {/* Announced politely: useful feedback, not an interruption while typing. */}
          <span className="text-muted w-12 text-right text-xs" aria-live="polite">
            {LABELS[strength]}
          </span>
        </div>
      )}
    </div>
  );
}
