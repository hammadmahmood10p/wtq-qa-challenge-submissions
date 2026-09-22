"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { inputClasses } from "@/components/ui/field";

interface Props {
  showLocation?: boolean;
  statuses: { value: string; label: string }[];
  /** Explains what search can match — see the note in src/lib/roster.ts. */
  searchHint: string;
}

export function RosterFilters({ showLocation, statuses, searchHint }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");

  function apply(next: Record<string, string>) {
    const updated = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "ALL") updated.delete(key);
      else updated.set(key, value);
    }
    // Any filter change invalidates the current page number.
    updated.delete("page");
    router.push(`${pathname}?${updated.toString()}`);
  }

  // Debounced, so typing a name does not fire a query per keystroke against a
  // database that is a couple of hundred milliseconds away (R1b).
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;

    const timer = setTimeout(() => apply({ q }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={15}
            className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            aria-label="Search the roster"
            className={`${inputClasses()} pl-9`}
          />
        </div>

        <select
          aria-label="Filter by status"
          value={params.get("status") ?? "ALL"}
          onChange={(e) => apply({ status: e.target.value })}
          className={inputClasses()}
          style={{ width: "auto" }}
        >
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {showLocation && (
          <select
            aria-label="Filter by location"
            value={params.get("location") ?? "ALL"}
            onChange={(e) => apply({ location: e.target.value })}
            className={inputClasses()}
            style={{ width: "auto" }}
          >
            <option value="ALL">All cities</option>
            <option value="KARACHI">Karachi</option>
            <option value="LAHORE">Lahore</option>
            <option value="ISLAMABAD">Islamabad</option>
          </select>
        )}
      </div>

      <p className="text-muted text-xs">{searchHint}</p>
    </div>
  );
}
