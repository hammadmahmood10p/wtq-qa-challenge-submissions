"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Th } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A sortable column heading.
 *
 * Requirement 7 asks for sorting on Score; the same component serves the other
 * columns for free. Sorting lives in the URL rather than component state so a judge
 * can bookmark or share a particular view, and so the server does the ordering —
 * sorting one page of 25 rows client-side would be a lie when there are 1000.
 */
export function SortableHeader({
  column,
  children,
  className,
  defaultDirection = "asc",
}: {
  column: string;
  children: React.ReactNode;
  className?: string;
  defaultDirection?: "asc" | "desc";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activeSort = params.get("sort");
  const activeDir = params.get("dir") === "desc" ? "desc" : "asc";
  const active = activeSort === column;

  function toggle() {
    const next = new URLSearchParams(params.toString());
    next.set("sort", column);
    next.set("dir", active && activeDir === defaultDirection ? invert(defaultDirection) : defaultDirection);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const Icon = !active ? ArrowUpDown : activeDir === "asc" ? ArrowUp : ArrowDown;

  return (
    <Th className={className} aria-sort={active ? (activeDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "hover:text-text inline-flex items-center gap-1.5 transition-colors",
          active && "text-violet",
        )}
      >
        {children}
        <Icon size={12} className={cn(!active && "opacity-40")} />
      </button>
    </Th>
  );
}

function invert(direction: "asc" | "desc"): "asc" | "desc" {
  return direction === "asc" ? "desc" : "asc";
}
