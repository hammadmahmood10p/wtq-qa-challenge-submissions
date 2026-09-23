import { cn } from "@/lib/utils";

/**
 * Table primitives.
 *
 * Real <table> markup rather than a grid of divs: these are data tables read by
 * screen readers and, later, sorted by column (requirement 7 for judges). Semantics
 * are free here and expensive to retrofit.
 */

export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // `relative` is load-bearing, not decoration. Without a positioned ancestor,
        // any `position: absolute` descendant — and `sr-only` is one — resolves
        // against the initial containing block, escapes this scroll container, and
        // drags the page's own scrollbar out to the table's full width. On a phone
        // that is 600px of blank canvas you can swipe into, on a table whose columns
        // were supposed to scroll inside this box.
        "border-border bg-surface shadow-(--shadow-card) relative overflow-x-auto rounded-(--radius-card) border",
        className,
      )}
    >
      <table className="w-full min-w-[720px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-surface-raised border-border border-b">{children}</thead>;
}

export function Th({
  children,
  className,
  ...props
}: React.ComponentProps<"th"> & { className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "text-muted px-4 py-3 text-left text-xs font-semibold tracking-wide uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={cn("border-border hover:bg-surface-raised/50 border-b transition-colors last:border-0", className)}>
      {children}
    </tr>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-muted px-4 py-14 text-center text-sm">
        {children}
      </td>
    </tr>
  );
}
