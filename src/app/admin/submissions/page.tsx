import type { Metadata } from "next";
import { Pagination } from "@/components/admin/pagination";
import { ExportSubmissionPdfs } from "@/components/submissions/export-pdfs";
import { RefreshButton } from "@/components/submissions/refresh-button";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import { SubmissionsTable } from "@/components/submissions/submissions-table";
import { requireRole } from "@/lib/auth";
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
  const admin = await requireRole("SUPER_ADMIN");

  const query = parseSubmissionsQuery(await searchParams);

  const [{ rows, total, pageCount }, counts] = await Promise.all([
    listSubmissions(query),
    submissionCounts(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Participants Submission Details</h1>
          <p className="text-muted mt-1 text-sm">
            {counts.total} submitted · {counts.reviewed} reviewed · {counts.unassigned} not yet
            taken
          </p>
        </div>

        <RefreshButton />
      </div>

      {/* Bulk export, for marking offline. Only Challenges 2 and 3 take an uploaded
          report — Challenge 4 is a repository link, and Challenge 1 is written into
          the application itself, so neither has a file to collect. */}
      <div className="border-border bg-surface rounded-(--radius-card) border p-5">
        <h2 className="font-display text-sm font-semibold">Export submitted reports</h2>
        <p className="text-muted mt-1.5 max-w-2xl text-xs">
          Every uploaded PDF for a challenge, in one archive, named{" "}
          <span className="font-mono">
            &lt;last 5 of CNIC&gt;-&lt;FullName&gt;-Challenge-&lt;n&gt;.pdf
          </span>
          . Participants who did not upload anything are skipped.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <ExportSubmissionPdfs challenge={2} />
          <ExportSubmissionPdfs challenge={3} />
        </div>
      </div>

      <SubmissionFilters />

      <SubmissionsTable
        rows={rows}
        role="SUPER_ADMIN"
        viewerId={admin.id}
        emptyMessage="No submissions match these filters."
      />

      <Pagination page={query.page} pageCount={pageCount} total={total} noun="submissions" />
    </div>
  );
}
