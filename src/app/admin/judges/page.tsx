import type { Metadata } from "next";
import { AddPersonDialog } from "@/components/admin/add-person-dialog";
import { Pagination } from "@/components/admin/pagination";
import { RosterFilters } from "@/components/admin/roster-filters";
import { RowActions } from "@/components/admin/row-actions";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, TableShell, Td, Th, Thead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { listJudges, rosterCounts } from "@/lib/roster";
import { rosterQuerySchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Manage Judges — WTQ 2026" };

const STATUSES = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING_APPROVAL", label: "Awaiting approval" },
  { value: "ACTIVE", label: "Approved" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "REMOVED", label: "Removed" },
];

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function JudgesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("SUPER_ADMIN");

  const raw = await searchParams;
  const query = rosterQuerySchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });

  const [{ rows, total, pageCount }, counts] = await Promise.all([
    listJudges(query),
    rosterCounts(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Manage Judges</h1>
          <p className="text-muted mt-1 text-sm">
            Approve accounts, add judges, and block or remove them.
          </p>
        </div>
        <AddPersonDialog kind="judge" />
      </div>

      {/* Requirement 7: judges cannot log in until approved, so an unattended queue
          means judges sitting idle on the day. Surfaced rather than left to a filter. */}
      {counts.judgesPending > 0 && (
        <Alert variant="warning" title={`${counts.judgesPending} judge account(s) awaiting approval`}>
          They cannot log in until you approve them.
        </Alert>
      )}

      <RosterFilters statuses={STATUSES} searchHint="Search matches name and email." />

      <TableShell>
        <Thead>
          <Tr>
            <Th>Full name</Th>
            <Th>Email</Th>
            <Th>Status</Th>
            <Th>Approved</Th>
            <Th className="text-right">Actions</Th>
          </Tr>
        </Thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={5}>No judges match these filters.</EmptyRow>
          ) : (
            rows.map((row) => (
              <Tr key={row.id}>
                <Td className="font-medium">{row.fullName}</Td>
                <Td className="text-xs">{row.email}</Td>
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
                <Td className="text-muted text-xs whitespace-nowrap">
                  {row.approvedAt ? dateFormat.format(row.approvedAt) : "—"}
                </Td>
                <Td>
                  <RowActions
                    userId={row.id}
                    fullName={row.fullName}
                    status={row.status}
                    kind="judge"
                  />
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </TableShell>

      <Pagination page={query.page} pageCount={pageCount} total={total} noun="judges" />
    </div>
  );
}
