import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Super Admin — WTQ 2026" };

/**
 * Placeholder. The real console lands on Day 4: Manage Participants, Manage Judges
 * and the audit log (docs/DELIVERY_PLAN.md §4).
 *
 * The counts are live, so it doubles as proof the role boundary and the database
 * wiring both work end to end.
 */
export default async function AdminHome() {
  const user = await requireRole("SUPER_ADMIN");

  const [participants, judgesPending, judgesActive] = await Promise.all([
    db.user.count({ where: { role: "PARTICIPANT", status: { not: "REMOVED" } } }),
    db.user.count({ where: { role: "JUDGE", status: "PENDING_APPROVAL" } }),
    db.user.count({ where: { role: "JUDGE", status: "ACTIVE" } }),
  ]);

  const tiles = [
    { label: "Participants registered", value: participants },
    { label: "Judges awaiting approval", value: judgesPending },
    { label: "Judges approved", value: judgesActive },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Welcome, {user.fullName}</h1>
        <p className="text-muted mt-1.5 text-sm">
          Manage Participants, Manage Judges and Participants Submission Details arrive on Day 4.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="border-border bg-surface shadow-(--shadow-card) rounded-(--radius-card) border p-5"
          >
            <p className="font-display tabular text-3xl font-bold">{tile.value}</p>
            <p className="text-muted mt-1 text-sm">{tile.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
