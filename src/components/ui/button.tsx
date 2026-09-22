import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-(--radius-control) font-medium transition-all duration-(--duration-micro) disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // The Aurora gradient is reserved for the few moments that matter
        // (DESIGN_LANGUAGE.md §4.1) — not every primary button in the app.
        aurora: "text-white shadow-(--shadow-card) hover:brightness-110 active:brightness-95",
        primary: "bg-violet text-white hover:bg-violet-hover active:brightness-95",
        secondary: "border border-border bg-surface text-text hover:bg-surface-raised",
        ghost: "text-muted hover:bg-surface-raised hover:text-text",
        danger: "bg-danger text-white hover:brightness-110",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2.5 text-sm",
        lg: "px-6 py-3.5 text-base",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", full: false },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof button> & { loading?: boolean };

export function Button({
  className,
  variant,
  size,
  full,
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(button({ variant, size, full }), className)}
      style={variant === "aurora" ? { background: "var(--aurora-gradient)" } : undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
