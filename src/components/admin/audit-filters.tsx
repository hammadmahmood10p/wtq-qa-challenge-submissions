"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { inputClasses } from "@/components/ui/field";
import { AUDIT_CATEGORIES } from "@/lib/audit-labels";

const WHO = [
  { value: "STAFF", label: "Judges and admins" },
  { value: "SUPER_ADMIN", label: "Super admins only" },
  { value: "JUDGE", label: "Judges only" },
  { value: "PARTICIPANT", label: "Participants only" },
  { value: "ALL", label: "Everyone" },
];

export function AuditFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");

  function apply(next: Record<string, string>) {
    const updated = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      // STAFF is the default view, so it stays out of the URL like every other
      // "unset" value — a clean address bar means a shareable link.
      if (!value || value === "ALL" || (key === "who" && value === "STAFF")) updated.delete(key);
      else updated.set(key, value);
    }
    updated.delete("page");
    router.push(`${pathname}?${updated.toString()}`);
  }

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
            placeholder="Search by the name or email of who acted…"
            aria-label="Search the audit log"
            className={`${inputClasses()} pl-9`}
          />
        </div>

        <select
          aria-label="Filter by role"
          value={params.get("who") ?? "STAFF"}
          onChange={(e) => apply({ who: e.target.value })}
          className={inputClasses()}
          style={{ width: "auto" }}
        >
          {WHO.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by activity type"
          value={params.get("category") ?? "ALL"}
          onChange={(e) => apply({ category: e.target.value })}
          className={inputClasses()}
          style={{ width: "auto" }}
        >
          <option value="ALL">All activity</option>
          {AUDIT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <p className="text-muted text-xs">
        Search matches the person who performed the action, not the person it was
        performed on. The log is append-only — entries are never edited or deleted.
      </p>
    </div>
  );
}
