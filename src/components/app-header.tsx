import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/session";

const ROLE_LABELS: Record<SessionUser["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  JUDGE: "Judge",
  PARTICIPANT: "Participant",
};

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="border-border bg-surface/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-muted font-mono text-[10px] tracking-[0.18em] uppercase">
            Women Tech Quest 2026
          </p>
          <p className="font-display truncate text-sm font-semibold">
            {ROLE_LABELS[user.role]}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-muted hidden truncate text-sm sm:block">{user.fullName}</p>

          {/* A plain form post, so logging out works without client JavaScript. */}
          <form action={logout}>
            <button
              type="submit"
              className="border-border text-muted hover:text-text flex items-center gap-1.5 rounded-(--radius-control) border px-3 py-1.5 text-sm transition-colors"
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
