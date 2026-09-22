import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Judge — WTQ 2026" };

/**
 * Placeholder. The submission table and the three-tab review page land on Days 9-10.
 */
export default async function JudgeHome() {
  const user = await requireRole("JUDGE");

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Welcome, {user.fullName}</h1>
      <p className="text-muted text-sm">
        Your review queue will appear here. Submissions are assigned automatically as
        participants submit, so there is nothing to pick from a shared list.
      </p>
      <p className="text-muted text-sm">Evaluation screens arrive on Days 9 and 10.</p>
    </div>
  );
}
