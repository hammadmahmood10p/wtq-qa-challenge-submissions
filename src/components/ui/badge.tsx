import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "border-success/30 bg-success/10 text-success",
  PENDING_APPROVAL: "border-warning/30 bg-warning/10 text-warning",
  BLOCKED: "border-danger/30 bg-danger/10 text-danger",
  SUBMITTED_LOCKED: "border-violet/30 bg-violet/10 text-violet",
  REMOVED: "border-border bg-surface-raised text-muted",
};

/** Plain words, not jargon — these are read by people running an event, not developers. */
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  PENDING_APPROVAL: "Awaiting approval",
  BLOCKED: "Blocked",
  SUBMITTED_LOCKED: "Submitted",
  REMOVED: "Removed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status] ?? STATUS_STYLES.REMOVED,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "border-border bg-surface-raised text-muted inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}
