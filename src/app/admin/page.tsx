import { ArrowRight, Gavel, Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { EventConfig } from "@/components/admin/event-config";
import { Alert } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth";
import { getApplicationUrl, getChallenge4Csv } from "@/lib/event-config";
import { rosterCounts } from "@/lib/roster";

export const metadata: Metadata = { title: "Super Admin — WTQ 2026" };

export default async function AdminHome() {
  const user = await requireRole("SUPER_ADMIN");
  const [counts, applicationUrl, csv] = await Promise.all([
    rosterCounts(),
    getApplicationUrl(),
    getChallenge4Csv(),
  ]);

  const tiles = [
    { label: "Participants registered", value: counts.participants, href: "/admin/participants" },
    { label: "Participants blocked", value: counts.participantsBlocked, href: "/admin/participants?status=BLOCKED" },
    { label: "Judges awaiting approval", value: counts.judgesPending, href: "/admin/judges?status=PENDING_APPROVAL" },
    { label: "Judges approved", value: counts.judgesActive, href: "/admin/judges?status=ACTIVE" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Welcome, {user.fullName}</h1>
        <p className="text-muted mt-1.5 text-sm">Women Tech Quest 2026 — Saturday 10 October.</p>
      </div>

      {counts.judgesPending > 0 && (
        <Alert variant="warning" title={`${counts.judgesPending} judge account(s) awaiting approval`}>
          <Link href="/admin/judges?status=PENDING_APPROVAL" className="underline">
            Review them now
          </Link>{" "}
          — they cannot log in until approved.
        </Alert>
      )}

      <EventConfig applicationUrl={applicationUrl} csv={csv} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="group border-border bg-surface shadow-(--shadow-card) hover:border-violet/50 rounded-(--radius-card) border p-5 transition-all duration-(--duration-standard) hover:-translate-y-0.5"
          >
            <p className="font-display tabular text-3xl font-bold">{tile.value.toLocaleString()}</p>
            <p className="text-muted mt-1 text-sm">{tile.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/admin/participants", icon: Users, title: "Manage Participants", body: "Add, block, remove or reset a participant's password." },
          { href: "/admin/judges", icon: Gavel, title: "Manage Judges", body: "Approve accounts, add judges, block or remove them." },
        ].map(({ href, icon: Icon, title, body }) => (
          <Link
            key={href}
            href={href}
            className="group border-border bg-surface shadow-(--shadow-card) hover:border-violet/50 flex items-start gap-4 rounded-(--radius-card) border p-5 transition-all duration-(--duration-standard) hover:-translate-y-0.5"
          >
            <span className="bg-violet/10 text-violet flex size-10 shrink-0 items-center justify-center rounded-(--radius-control)">
              <Icon size={19} />
            </span>
            <div className="min-w-0">
              <p className="font-display flex items-center gap-2 font-semibold">
                {title}
                <ArrowRight size={15} className="text-muted transition-transform duration-(--duration-standard) group-hover:translate-x-1" />
              </p>
              <p className="text-muted mt-1 text-sm">{body}</p>
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
