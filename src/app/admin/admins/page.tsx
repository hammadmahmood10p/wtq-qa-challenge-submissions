import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { AddPersonDialog } from "@/components/admin/add-person-dialog";
import { RowActions } from "@/components/admin/row-actions";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyRow, TableShell, Td, Th, Thead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { listSuperAdmins } from "@/lib/roster";

export const metadata: Metadata = { title: "Super Admins — WTQ 2026" };

/**
 * Who can administer the event.
 *
 * Deliberately its own screen rather than a section of Overview. This is the account
 * that can block every participant, read every ID card and reopen any result — adding
 * one should be a place you go to, not something you pass on a dashboard.
 *
 * Listing them matters as much as creating them: an account nobody recognises is
 * visible here rather than buried in the audit log.
 */
export default async function SuperAdminsPage() {
  const user = await requireRole("SUPER_ADMIN");
  const admins = await listSuperAdmins();

  const active = admins.filter((a) => a.status === "ACTIVE").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Super Admins</h1>
          <p className="text-muted mt-1 text-sm">
            Everyone who can administer the event. {active} can sign in.
          </p>
        </div>
        <AddPersonDialog kind="admin" />
      </div>

      <Alert variant="info" title="What a super admin can do">
        Approve judges, add and block participants, reopen a sealed attempt, reopen a
        submitted score, close logins for everyone, and set the application link and
        Challenge 4 file. Give it only to people running the event.
      </Alert>

      {active === 1 && (
        <Alert variant="warning" title="Only one person can administer this event">
          If that account is lost or locked out, getting back in needs database access.
          Add a second before the day.
        </Alert>
      )}

      <TableShell>
        <Thead>
          <Tr>
            <Th>Full name</Th>
            <Th>Email</Th>
            <Th>Status</Th>
            <Th>Added by</Th>
            <Th>Last signed in</Th>
            <Th className="text-right">Actions</Th>
          </Tr>
        </Thead>
        <tbody>
          {admins.length === 0 ? (
            <EmptyRow colSpan={6}>No super admins.</EmptyRow>
          ) : (
            admins.map((row) => (
              <Tr key={row.id}>
                <Td className="font-medium">
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-violet shrink-0" />
                    {row.fullName}
                    {row.id === user.id && (
                      <span className="text-muted text-xs font-normal">(you)</span>
                    )}
                  </span>
                </Td>
                <Td className="text-xs">{row.email}</Td>
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
                <Td className="text-muted text-xs">
                  {row.createdByName ?? "Seeded at setup"}
                </Td>
                <Td className="text-muted text-xs whitespace-nowrap">
                  {row.lastLoginAt
                    ? row.lastLoginAt.toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Never"}
                </Td>
                <Td>
                  {/* Nothing to act on for your own row: the server refuses to let an
                      admin block or remove themselves, so offering it would be a
                      button that only ever produces an error. */}
                  {row.id === user.id ? (
                    <p className="text-muted text-right text-xs">—</p>
                  ) : (
                    <RowActions
                      userId={row.id}
                      fullName={row.fullName}
                      status={row.status}
                      kind="admin"
                    />
                  )}
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
