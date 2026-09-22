import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, TableShell, Td, Th, Thead, Tr } from "@/components/ui/table";
import type { SubmissionRow } from "@/lib/submissions";
import { SortableHeader } from "./sortable-header";

const LOCATION_LABELS: Record<string, string> = {
  KARACHI: "Karachi",
  LAHORE: "Lahore",
  ISLAMABAD: "Islamabad",
};

/**
 * Participants Submission Details.
 *
 * The same table for judges and the super admin, with the columns the brief lists in
 * the order it lists them. Both roles are answering the same question — who submitted
 * what, has it been looked at, and what did it score — so they get the same answer.
 */
export function SubmissionsTable({
  rows,
  emptyMessage,
}: {
  rows: SubmissionRow[];
  emptyMessage: string;
}) {
  return (
    <TableShell>
      <Thead>
        <Tr>
          <Th>ID card number</Th>
          <SortableHeader column="name">Full name</SortableHeader>
          <SortableHeader column="location">Location</SortableHeader>
          <Th>Submission</Th>
          <Th>Review status</Th>
          {/* Requirement 7. Descending first: the interesting end of a score column
              is the top, not the bottom. */}
          <SortableHeader column="score" defaultDirection="desc" className="text-right">
            Score
          </SortableHeader>
          <Th>Judge</Th>
        </Tr>
      </Thead>

      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={7}>{emptyMessage}</EmptyRow>
        ) : (
          rows.map((row) => (
            <Tr key={row.attemptId}>
              <Td className="font-mono text-xs whitespace-nowrap">{row.idCardNumber}</Td>
              <Td className="font-medium">{row.fullName}</Td>
              <Td className="whitespace-nowrap">{LOCATION_LABELS[row.location] ?? row.location}</Td>

              <Td>
                {/*
                  Requirement: opens in a new tab and shows everything this participant
                  submitted. A new tab so a judge working through a list does not lose
                  their place in it.
                */}
                <a
                  href={`/review/${row.attemptId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                >
                  View submission
                  <ExternalLink size={12} />
                </a>
              </Td>

              <Td className="whitespace-nowrap">
                {row.reviewed ? (
                  <Badge className="border-success/30 bg-success/10 text-success">Reviewed</Badge>
                ) : (
                  <Badge>Not reviewed</Badge>
                )}
              </Td>

              {/* Empty before review, per the brief — not a zero, which would read as
                  a score of nought rather than as an absence. */}
              <Td className="text-right font-mono tabular-nums">
                {row.totalScore === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className="font-semibold">{row.totalScore}</span>
                )}
              </Td>

              <Td className="whitespace-nowrap">
                {row.judgeName ?? <span className="text-muted text-xs">Unassigned</span>}
              </Td>
            </Tr>
          ))
        )}
      </tbody>
    </TableShell>
  );
}
