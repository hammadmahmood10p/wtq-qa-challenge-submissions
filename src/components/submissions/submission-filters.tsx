"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { inputClasses } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const REVIEW_OPTIONS = [
  { value: "ALL", label: "All submissions" },
  { value: "NOT_REVIEWED", label: "Not reviewed" },
  { value: "REVIEWED", label: "Reviewed" },
];

export function SubmissionFilters({ showScope }: { showScope?: boolean }) {
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
    updated.delete("page");
    router.push(`${pathname}?${updated.toString()}`);
  }

  // Debounced: the database is a couple of hundred milliseconds away (R1b), so a
  // query per keystroke would feel worse than no search at all.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;

    const timer = setTimeout(() => apply({ q }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const scope = params.get("scope") === "all" ? "all" : "mine";

  return (
    <div className="space-y-2">
      {/*
        A judge's own queue first. With submissions auto-assigned there is a right
        answer to "what should I work on", and it should not have to be found.
      */}
      {showScope && (
        <div className="border-border inline-flex rounded-(--radius-control) border p-0.5">
          {[
            { value: "mine", label: "My queue" },
            { value: "all", label: "All submissions" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => apply({ scope: option.value === "mine" ? "" : "all" })}
              aria-pressed={scope === option.value}
              className={cn(
                "rounded-[6px] px-3 py-1.5 text-sm transition-colors",
                scope === option.value
                  ? "bg-violet font-medium text-white"
                  : "text-muted hover:text-text",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

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
            placeholder="Search by participant name or email…"
            aria-label="Search submissions"
            className={`${inputClasses()} pl-9`}
          />
        </div>

        <select
          aria-label="Filter by review status"
          value={params.get("review") ?? "ALL"}
          onChange={(e) => apply({ review: e.target.value })}
          className={inputClasses()}
          style={{ width: "auto" }}
        >
          {REVIEW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

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
      </div>

      <p className="text-muted text-xs">
        Search matches participant name and email. ID card numbers are stored encrypted,
        so they cannot be searched here.
      </p>
    </div>
  );
}
