import type { Metadata } from "next";
import { AddPersonDialog } from "@/components/admin/add-person-dialog";
import { BulkDeleteDialog } from "@/components/admin/bulk-delete-dialog";
import { BulkImportDialog } from "@/components/admin/bulk-import-dialog";
import { PasswordCell, PasswordReveal } from "@/components/admin/password-column";
import { Pagination } from "@/components/admin/pagination";
import { ParticipantAccessControls } from "@/components/admin/participant-access";
import { RosterFilters } from "@/components/admin/roster-filters";
import { RowActions } from "@/components/admin/row-actions";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, TableShell, Td, Th, Thead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { listParticipants } from "@/lib/roster";
import { participantLoginsDisabled } from "@/lib/settings";
import { rosterQuerySchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Manage Participants — WTQ 2026" };

const STATUSES = [
  { value: "ALL", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "SUBMITTED_LOCKED", label: "Submitted" },
  { value: "REMOVED", label: "Removed" },
];

const LOCATION_LABELS: Record<string, string> = {
  KARACHI: "Karachi",
  LAHORE: "Lahore",
  ISLAMABAD: "Islamabad",
};

export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("SUPER_ADMIN");

  const raw = await searchParams;
  // Falls back to defaults rather than erroring: a hand-edited URL should not be able
  // to break the admin console mid-event.
  const query = rosterQuerySchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    location: typeof raw.location === "string" ? raw.location : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });

  const [{ rows, total, pageCount }, loginsDisabled] = await Promise.all([
    listParticipants(query),
    participantLoginsDisabled(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Manage Participants</h1>
          <p className="text-muted mt-1 text-sm">
            Add, block or remove participants, and reopen or clear a submitted attempt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkImportDialog kind="participant" />
          <BulkDeleteDialog kind="participant" query={query} />
          <AddPersonDialog kind="participant" />
        </div>
      </div>

      <ParticipantAccessControls disabled={loginsDisabled} />

      <RosterFilters
        statuses={STATUSES}
        showLocation
        searchHint="Name and email match partially. ID card and phone numbers are stored encrypted, so they only match in full."
      />

      <PasswordReveal count={rows.filter((r) => r.derivedPassword).length}>
      <TableShell>
        <Thead>
          <Tr>
            <Th>ID card number</Th>
            <Th>Full name</Th>
            <Th>Contact</Th>
            <Th>Location</Th>
            <Th>Status</Th>
            <Th>Password</Th>
            <Th className="text-right">Actions</Th>
          </Tr>
        </Thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={7}>
              No participants match these filters.
            </EmptyRow>
          ) : (
            rows.map((row) => (
              <Tr key={row.id}>
                <Td className="font-mono text-xs whitespace-nowrap">{row.idCardNumber}</Td>
                <Td className="font-medium">{row.fullName}</Td>
                <Td>
                  <span className="block text-xs">{row.email}</span>
                  <span className="text-muted block font-mono text-xs">{row.phone}</span>
                </Td>
                <Td className="whitespace-nowrap">
                  {row.location ? LOCATION_LABELS[row.location] : "—"}
                </Td>
                <Td>
                  <StatusBadge status={row.status} />
                  {/* An attempt handed back reads as ACTIVE, which on its own hides the
                      fact that a submission is currently withheld from judging. */}
                  {row.attempt?.reopenedAt && (
                    <span className="text-warning-strong mt-1 block text-[11px]">
                      Reopened — awaiting resubmission
                    </span>
                  )}
                </Td>
                <Td>
                  <PasswordCell value={row.derivedPassword ?? null} />
                </Td>
                <Td>
                  <RowActions
                    userId={row.id}
                    fullName={row.fullName}
                    status={row.status}
                    kind="participant"
                    attempt={row.attempt}
                  />
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </TableShell>
      </PasswordReveal>

      <Pagination page={query.page} pageCount={pageCount} total={total} noun="participants" />
    </div>
  );
}
