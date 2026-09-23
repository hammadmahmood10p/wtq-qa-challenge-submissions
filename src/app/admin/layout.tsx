import { AdminNav } from "@/components/admin/admin-nav";
import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth";
import { rosterCounts } from "@/lib/roster";

/**
 * The real authorisation boundary for every /admin route. Middleware only checks that
 * a token is validly signed; this checks the session is live and the role is right.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("SUPER_ADMIN");
  const counts = await rosterCounts();

  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      <AdminNav pendingJudges={counts.judgesPending} />
      <main className="app-gutter py-8">{children}</main>
    </div>
  );
}
