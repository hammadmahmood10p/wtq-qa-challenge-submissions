import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { BrandLockup } from "@/components/brand/logos";
import type { SessionUser } from "@/lib/session";

const ROLE_LABELS: Record<SessionUser["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  JUDGE: "Judge",
  PARTICIPANT: "Participant",
};

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="border-border bg-surface/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <BrandLockup wtqSize={36} className="shrink-0" />

          <span
            aria-hidden="true"
            className="bg-border hidden h-6 w-px shrink-0 sm:block"
          />

          <span className="hidden min-w-0 sm:block">
            <span className="text-muted block font-mono text-[10px] tracking-[0.18em] uppercase">
              WTQ26 Challenge Portal
            </span>
            <span className="font-display block truncate text-sm font-semibold">
              {ROLE_LABELS[user.role]}
            </span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <p className="text-muted hidden truncate text-sm md:block">{user.fullName}</p>

          {/* A plain form post, so logging out works without client JavaScript. */}
          <form action={logout}>
            <button
              type="submit"
              className="border-border text-muted hover:text-text hover:border-violet/40 flex items-center gap-1.5 rounded-(--radius-control) border px-3 py-1.5 text-sm transition-colors"
            >
              <LogOut size={14} />
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
