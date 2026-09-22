import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth";

export default async function ChallengeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("PARTICIPANT");

  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
