import type { Metadata } from "next";
import { Pagination } from "@/components/admin/pagination";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import { SubmissionsTable } from "@/components/submissions/submissions-table";
import { Alert } from "@/components/ui/alert";
import { assignUnassignedSubmissions } from "@/lib/attempt-submit";
import { requireRole } from "@/lib/auth";
import { judgeQueueCounts, listSubmissions } from "@/lib/submissions";
import { parseSubmissionsQuery } from "@/lib/validation/submissions";

export const metadata: Metadata = { title: "Submissions — WTQ 2026" };

/**
 * Participants Submission Details, as a judge sees it.
 *
 * Defaults to this judge's own queue rather than the full list. Submissions are
 * auto-assigned (D3), so there is a right answer to "what should I be working on" and
 * a judge under time pressure should not have to construct it from filters. The whole
 * list is one click away.
 */
export default async function JudgeSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("JUDGE");

  // Catches anything submitted before this judge — or any judge — was approved.
  await assignUnassignedSubmissions();

  const query = parseSubmissionsQuery(await searchParams);
  const mine = query.scope !== "all";

  const [{ rows, total, pageCount }, counts] = await Promise.all([
    listSubmissions({ ...query, assignedTo: mine ? user.id : undefined }),
    judgeQueueCounts(user.id),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Participants Submission Details</h1>
        <p className="text-muted mt-1 text-sm">
          {counts.assigned > 0
            ? `${counts.assigned} submission${counts.assigned === 1 ? "" : "s"} waiting for you, ${counts.reviewed} reviewed.`
            : counts.reviewed > 0
              ? `Your queue is clear — ${counts.reviewed} reviewed.`
              : "Submissions will appear here as participants finish."}
        </p>
      </div>

      {counts.assigned === 0 && counts.reviewed === 0 && total === 0 && (
        <Alert variant="info" title="Nothing submitted yet">
          Submissions are assigned to you automatically as participants finish, so there
          is nothing to pick from a shared list.
        </Alert>
      )}

      <SubmissionFilters showScope />

      <SubmissionsTable
        rows={rows}
        emptyMessage={
          mine
            ? "Nothing is assigned to you that matches these filters."
            : "No submissions match these filters."
        }
      />

      <Pagination page={query.page} pageCount={pageCount} total={total} noun="submissions" />
    </div>
  );
}
