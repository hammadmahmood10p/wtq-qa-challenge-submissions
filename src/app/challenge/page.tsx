import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Challenge — WTQ 2026" };

/**
 * Placeholder. The information page, the 3-hour timer and the three challenges land
 * on Days 5-8 — the critical path.
 */
export default async function ChallengeHome() {
  const user = await requireRole("PARTICIPANT");

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Welcome, {user.fullName}</h1>
      <p className="text-muted text-sm">
        Your challenge briefing and the three challenges will appear here.
      </p>
      <p className="text-muted text-sm">
        The timed challenge runtime arrives on Days 5 to 8.
      </p>
    </div>
  );
}
