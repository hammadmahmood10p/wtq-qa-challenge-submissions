import type { Metadata } from "next";
import { Pagination } from "@/components/admin/pagination";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import { SubmissionsTable } from "@/components/submissions/submissions-table";
import { Alert } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth";
import { listSubmissions, submissionCounts } from "@/lib/submissions";
import { parseSubmissionsQuery } from "@/lib/validation/submissions";

export const metadata: Metadata = { title: "Submissions — WTQ 2026" };

/**
 * The same table for the super admin, over every submission rather than one judge's
 * queue — this is the screen that answers "how is judging going" on the day.
 */
export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("SUPER_ADMIN");

  const query = parseSubmissionsQuery(await searchParams);

  const [{ rows, total, pageCount }, counts] = await Promise.all([
    listSubmissions(query),
    submissionCounts(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Participants Submission Details</h1>
        <p className="text-muted mt-1 text-sm">
          {counts.total} submitted · {counts.reviewed} reviewed
        </p>
      </div>

      {/* Only possible when submissions arrived before any judge was approved. It
          resolves itself when a judge is approved or opens their queue, but an admin
          should be able to see that it happened. */}
      {counts.unassigned > 0 && (
        <Alert variant="warning" title={`${counts.unassigned} submission(s) not yet assigned`}>
          These arrived before a judge was available. Approving a judge assigns them
          automatically.
        </Alert>
      )}

      <SubmissionFilters />

      <SubmissionsTable rows={rows} emptyMessage="No submissions match these filters." />

      <Pagination page={query.page} pageCount={pageCount} total={total} noun="submissions" />
    </div>
  );
}
