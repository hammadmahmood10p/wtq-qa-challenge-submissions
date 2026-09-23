import type { Metadata } from "next";
import { Pagination } from "@/components/admin/pagination";
import { RefreshButton } from "@/components/submissions/refresh-button";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import { SubmissionsTable } from "@/components/submissions/submissions-table";
import { Alert } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth";
import { listActiveJudges } from "@/lib/judge-assignment";
import { listSubmissions, submissionCounts } from "@/lib/submissions";
import { parseSubmissionsQuery } from "@/lib/validation/submissions";

export const metadata: Metadata = { title: "Submissions — WTQ 2026" };

/**
 * Participants Submission Details, as a judge sees it.
 *
 * One list, identical for every judge. Nothing is assigned in advance: a judge takes a
 * submission by putting their name in its Judge column, and the rest of the panel sees
 * that on their next refresh. That is what keeps two people off the same submission —
 * so the shared, unfiltered view is the feature, not a simplification of one.
 */
export default async function JudgeSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("JUDGE");

  const query = parseSubmissionsQuery(await searchParams);

  const [{ rows, total, pageCount }, counts, judges] = await Promise.all([
    listSubmissions(query),
    submissionCounts(),
    listActiveJudges(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Participants Submission Details</h1>
          <p className="text-muted mt-1 text-sm">
            {counts.total === 0
              ? "Submissions will appear here as participants finish."
              : `${counts.total} submitted · ${counts.reviewed} reviewed · ${counts.unassigned} not yet taken`}
          </p>
        </div>

        <RefreshButton />
      </div>

      {counts.total === 0 && (
        <Alert variant="info" title="Nothing submitted yet">
          When submissions arrive, put your name in the Judge column against one to
          start reviewing it. Everyone else will see that you have taken it.
        </Alert>
      )}

      <SubmissionFilters />

      <SubmissionsTable
        rows={rows}
        judges={judges}
        emptyMessage="No submissions match these filters."
      />

      <Pagination page={query.page} pageCount={pageCount} total={total} noun="submissions" />
    </div>
  );
}
