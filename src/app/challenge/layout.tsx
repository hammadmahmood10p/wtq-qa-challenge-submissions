import { requireRole } from "@/lib/auth";

/**
 * Authorisation boundary for every participant route.
 *
 * Deliberately renders no header: the briefing shows the normal app header, while the
 * workspace replaces it with the sticky countdown. Stacking both would push the clock
 * down the page, and requirement 3 says it must always be visible.
 */
export default async function ChallengeLayout({ children }: { children: React.ReactNode }) {
  await requireRole("PARTICIPANT");
  return <div className="min-h-dvh">{children}</div>;
}
