import type { Metadata } from "next";
import { Pagination } from "@/components/admin/pagination";
import { RefreshButton } from "@/components/submissions/refresh-button";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import { SubmissionsTable } from "@/components/submissions/submissions-table";
import { requireRole } from "@/lib/auth";
import { listActiveJudges } from "@/lib/judge-assignment";
import { listSubmissions, submissionCounts } from "@/lib/submissions";
import { parseSubmissionsQuery } from "@/lib/validation/submissions";

export const metadata: Metadata = { title: "Submissions — WTQ 2026" };

/**
 * The same table the judges work from — this is the screen that answers "how is
 * judging going" on the day, and who is on what.
 */
export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("SUPER_ADMIN");

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
            {counts.total} submitted · {counts.reviewed} reviewed · {counts.unassigned} not
            yet taken
          </p>
        </div>

        <RefreshButton />
      </div>

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
