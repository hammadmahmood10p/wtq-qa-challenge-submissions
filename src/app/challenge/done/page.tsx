import { CheckCircle2, Clock } from "lucide-react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Challenge complete — WTQ 2026" };

/**
 * Terminal page for an attempt that has ended, whether it was submitted or ran out of
 * time. Day 8 adds the full submission semantics; this is where both paths land.
 */
export default async function ChallengeDonePage() {
  const user = await requireRole("PARTICIPANT");
  const attempt = await getAttempt(user.id);

  if (attempt.state === "NOT_STARTED") redirect("/challenge");
  if (attempt.state === "IN_PROGRESS") redirect("/challenge/run");

  const expired = attempt.state === "EXPIRED";

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="border-border bg-surface shadow-(--shadow-raised) w-full max-w-md rounded-(--radius-card) border p-8 text-center">
        <span
          className={`mx-auto flex size-14 items-center justify-center rounded-full ${
            expired ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
          }`}
        >
          {expired ? <Clock size={26} /> : <CheckCircle2 size={26} />}
        </span>

        <h1 className="font-display mt-5 text-2xl font-bold">
          {expired ? "Time is up" : "Thank you"}
        </h1>

        <p className="text-muted mt-3 text-sm">
          {expired
            ? "Your three hours have ended and everything you saved has been kept. There is nothing further to do."
            : "Your challenges have been submitted. Thank you for taking part in Women Tech Quest 2026."}
        </p>

        <p className="text-muted mt-6 text-xs">
          Results will be shared by the organising team.
        </p>
      </div>
    </div>
  );
}
