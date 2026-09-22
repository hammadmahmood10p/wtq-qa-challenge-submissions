import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth";

/**
 * The review area, shared by judges and the super admin.
 *
 * One route rather than a copy under /judge and another under /admin: both roles read
 * exactly the same submission, and duplicating the page would mean two places to get
 * the read-only rendering wrong. Who may *score* is decided on the page itself.
 */
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("JUDGE", "SUPER_ADMIN");

  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
