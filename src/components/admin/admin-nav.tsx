"use client";

import { ClipboardList, Gavel, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/participants", label: "Participants", icon: Users },
  { href: "/admin/judges", label: "Judges", icon: Gavel },
  { href: "/admin/submissions", label: "Submissions", icon: ClipboardList },
];

export function AdminNav({ pendingJudges }: { pendingJudges: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="border-border border-b">
      <div className="app-gutter flex gap-1 overflow-x-auto">
        {LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2 px-3 py-3 text-sm whitespace-nowrap transition-colors",
                active ? "text-violet font-medium" : "text-muted hover:text-text",
              )}
            >
              <Icon size={15} />
              {label}

              {/* The approval queue is the one thing an admin must not miss: judges
                  cannot log in until it is cleared. */}
              {href === "/admin/judges" && pendingJudges > 0 && (
                <span className="bg-warning/15 text-warning-strong rounded-full px-1.5 py-0.5 text-[11px] font-semibold">
                  {pendingJudges}
                </span>
              )}

              {active && (
                <span
                  aria-hidden="true"
                  className="bg-violet absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
