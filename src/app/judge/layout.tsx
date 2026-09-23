import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth";

export default async function JudgeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("JUDGE");

  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      <main className="app-gutter py-8">{children}</main>
    </div>
  );
}
