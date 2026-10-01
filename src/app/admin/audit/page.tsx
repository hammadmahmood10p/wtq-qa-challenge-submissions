import type { Metadata } from "next";
import { z } from "zod";
import { AuditFilters } from "@/components/admin/audit-filters";
import { Pagination } from "@/components/admin/pagination";
import { RefreshButton } from "@/components/submissions/refresh-button";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, TableShell, Td, Th, Thead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { AUDIT_CATEGORIES, type AuditTone } from "@/lib/audit-labels";
import { auditSummary, listAuditEvents } from "@/lib/audit-log";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit Log — WTQ 2026" };

/**
 * The audit log (rule 4, §3.1).
 *
 * Rows have been written since the first release; this is the screen that finally
 * reads them. It exists to answer one question quickly — *did the system do that, or
 * did someone?* — so it defaults to the people who can act on others: judges and super
 * admins. Participants are a filter away rather than mixed in, because a thousand
 * `attempt.started` rows would bury the twenty that matter.
 */

const querySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  q: z.string().trim().max(120).optional(),
  who: z.enum(["STAFF", "SUPER_ADMIN", "JUDGE", "PARTICIPANT", "ALL"]).catch("STAFF"),
  category: z.enum([...(AUDIT_CATEGORIES as [string, ...string[]]), "ALL"]).catch("ALL"),
});

const TONE: Record<AuditTone, string> = {
  neutral: "border-border text-muted",
  info: "border-info/30 bg-info/10 text-info-strong",
  success: "border-success/30 bg-success/10 text-success-strong",
  warning: "border-warning/30 bg-warning/10 text-warning-strong",
  danger: "border-danger/30 bg-danger/10 text-danger-strong",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  JUDGE: "Judge",
  PARTICIPANT: "Participant",
};

const timestamp = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "medium",
});

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("SUPER_ADMIN");

  const raw = await searchParams;
  const first = (key: string) => (typeof raw[key] === "string" ? raw[key] : undefined);

  const query = querySchema.parse({
    page: first("page"),
    q: first("q"),
    who: first("who"),
    category: first("category"),
  });

  const [{ rows, total, pageCount }, summary] = await Promise.all([
    listAuditEvents(query as Parameters<typeof listAuditEvents>[0]),
    auditSummary(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Audit Log</h1>
          <p className="text-muted mt-1 text-sm">
            {summary.total.toLocaleString()} entries · {summary.last24h.toLocaleString()} in
            the last 24 hours
          </p>
        </div>

        <RefreshButton />
      </div>

      {/* Two counts worth seeing without going looking for them. A run of failed
          sign-ins is what a brute-force attempt looks like from in here, and any use
          of the master password is by definition someone signing in as somebody
          else. */}
      {(summary.failedLogins > 0 || summary.masterPasswordUses > 0) && (
        <div className="flex flex-wrap gap-3">
          {summary.failedLogins > 0 && (
            <div className="border-warning/30 bg-warning/8 rounded-(--radius-card) border px-4 py-2.5">
              <p className="text-warning-strong text-sm font-semibold">
                {summary.failedLogins.toLocaleString()} failed sign-in
                {summary.failedLogins === 1 ? "" : "s"} in the last 24 hours
              </p>
              <p className="text-muted mt-0.5 text-xs">
                Normal in small numbers on event day. A burst from one account is not.
              </p>
            </div>
          )}

          {summary.masterPasswordUses > 0 && (
            <div className="border-danger/30 bg-danger/8 rounded-(--radius-card) border px-4 py-2.5">
              <p className="text-danger-strong text-sm font-semibold">
                Master password used {summary.masterPasswordUses.toLocaleString()} time
                {summary.masterPasswordUses === 1 ? "" : "s"}
              </p>
              <p className="text-muted mt-0.5 text-xs">
                Each one is somebody signing in as another person. Filter to Security to
                see whose accounts.
              </p>
            </div>
          )}
        </div>
      )}

      <AuditFilters />

      <TableShell>
        <Thead>
          <Tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Did what</Th>
            <Th>To whom</Th>
            <Th>Details</Th>
            <Th>IP</Th>
          </Tr>
        </Thead>

        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={6}>No activity matches these filters.</EmptyRow>
          ) : (
            rows.map((row) => (
              <Tr key={row.id}>
                <Td className="text-muted font-mono text-xs whitespace-nowrap">
                  {timestamp.format(row.at)}
                </Td>

                <Td className="whitespace-nowrap">
                  {row.actorName ? (
                    <>
                      <span className="block text-sm font-medium">{row.actorName}</span>
                      <span className="text-muted block text-[11px]">
                        {row.actorRole ? ROLE_LABEL[row.actorRole] ?? row.actorRole : "—"}
                      </span>
                    </>
                  ) : (
                    // Timer auto-submits and other unattended work. Saying so is the
                    // point of the log: it distinguishes the system acting from a
                    // person acting.
                    <span className="text-muted text-sm italic">The system</span>
                  )}
                </Td>

                <Td>
                  <Badge className={cn("whitespace-nowrap", TONE[row.tone])}>{row.label}</Badge>
                </Td>

                <Td className="text-sm">
                  {row.targetName ?? <span className="text-muted">—</span>}
                </Td>

                <Td className="text-muted max-w-[22rem] text-xs">
                  {row.detail ?? <span className="text-muted/60">—</span>}
                </Td>

                <Td className="text-muted font-mono text-[11px] whitespace-nowrap">
                  {row.ip ?? "—"}
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </TableShell>

      <Pagination
        page={query.page}
        pageCount={pageCount}
        total={total}
        noun="entries"
      />
    </div>
  );
}
