import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { AppHeader } from "@/components/app-header";
import { Alert } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth";
import { masterPasswordState } from "@/lib/master-password";
import { rosterCounts } from "@/lib/roster";

/**
 * The real authorisation boundary for every /admin route. Middleware only checks that
 * a token is validly signed; this checks the session is live and the role is right.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("SUPER_ADMIN");
  const [counts, masterPassword] = await Promise.all([rosterCounts(), masterPasswordState()]);

  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      <AdminNav pendingJudges={counts.judgesPending} />
      <main className="app-gutter space-y-6 py-8">
        {/* Follows the admin around on purpose. A master password left switched on
            after the hall has emptied is the realistic failure here, and it will not
            announce itself — so the console does. */}
        {masterPassword.enabled && (
          <Alert variant="warning" title="The master password is switched on">
            Any participant or judge account will open with it.{" "}
            <Link href="/admin" className="underline">
              Switch it off
            </Link>{" "}
            once you no longer need it.
          </Alert>
        )}
        {children}
      </main>
    </div>
  );
}
