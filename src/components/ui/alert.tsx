import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same reasoning as the badges: tinted panel, darker text. */
const STYLES = {
  error: { icon: AlertCircle, cls: "border-danger/30 bg-danger/8 text-danger-strong" },
  warning: { icon: AlertTriangle, cls: "border-warning/30 bg-warning/8 text-warning-strong" },
  success: { icon: CheckCircle2, cls: "border-success/30 bg-success/8 text-success-strong" },
  info: { icon: Info, cls: "border-info/30 bg-info/8 text-info-strong" },
} as const;

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: keyof typeof STYLES;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, cls } = STYLES[variant];

  return (
    <div
      // Errors interrupt; confirmations and hints wait their turn.
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-(--radius-control) border px-4 py-3 text-sm", cls, className)}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {/* No opacity here. Fading the body under a title that is already bolder
            adds nothing visually and takes the text back under AA — the colours
            above were chosen to pass at full strength, not at 90% of it. */}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}
