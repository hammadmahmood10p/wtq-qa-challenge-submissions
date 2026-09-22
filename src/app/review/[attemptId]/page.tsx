import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Challenge1ReadOnly } from "@/components/challenge/challenge1-readonly";
import {
  Challenge2ReadOnly,
  Challenge3ReadOnly,
} from "@/components/challenge/challenge23-readonly";
import { ReviewTabs } from "@/components/submissions/review-tabs";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getSubmissionDetail } from "@/lib/submissions";

export const metadata: Metadata = { title: "Review submission — WTQ 2026" };

const LOCATION_LABELS: Record<string, string> = {
  KARACHI: "Karachi",
  LAHORE: "Lahore",
  ISLAMABAD: "Islamabad",
};

/**
 * Everything one participant submitted, in one place.
 *
 * Opened in a new tab from the submissions table. The three panels reuse the
 * read-only renderers written alongside the participant forms on Days 6 and 7, which
 * is what makes this page assembly rather than a second implementation of the same
 * rendering (DELIVERY_PLAN §1.1a).
 *
 * The score fields and the Submit Final Score button arrive on Day 10; the total
 * banner is here now because the brief puts it at the top of the page and it reads
 * as zero until a review begins.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await requireRole("JUDGE", "SUPER_ADMIN");
  const { attemptId } = await params;

  const submission = await getSubmissionDetail(attemptId);
  if (!submission) notFound();

  const evaluation = submission.evaluation;
  const reviewed = evaluation?.status === "SUBMITTED";
  const assignedToMe = evaluation?.judgeId === user.id;

  const bugReports = submission.challenge1Items.filter((i) => i.kind === "BUG_REPORT");
  const testCases = submission.challenge1Items.filter((i) => i.kind === "TEST_CASE");

  const backHref = user.role === "SUPER_ADMIN" ? "/admin/submissions" : "/judge";

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="text-muted hover:text-text inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        Back to submissions
      </Link>

      <header className="border-border bg-surface shadow-(--shadow-card) rounded-(--radius-card) border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold">
              {submission.participant.user.fullName}
            </h1>
            <p className="text-muted mt-1.5 font-mono text-xs">
              {submission.idCardNumber} · {LOCATION_LABELS[submission.participant.location]}
            </p>
            <p className="text-muted mt-1 text-xs">
              {submission.submittedAt
                ? `Submitted ${submission.submittedAt.toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}`
                : "Not submitted"}
              {submission.autoSubmitted && " · submitted automatically when time ran out"}
            </p>
          </div>

          {/*
            Requirement 5 for judges: the total sits at the top and starts at zero.
            It stays zero until Day 10's per-task scores are saved.
          */}
          <div className="text-right">
            <p className="text-muted font-mono text-[10px] tracking-[0.18em] uppercase">
              Total score
            </p>
            <p className="font-display tabular mt-1 text-4xl font-bold">
              {evaluation?.totalScore ? Number(evaluation.totalScore) : 0}
            </p>
            <div className="mt-2 flex justify-end">
              {reviewed ? (
                <Badge className="border-success/30 bg-success/10 text-success">Reviewed</Badge>
              ) : (
                <Badge>Not reviewed</Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {!evaluation && (
        <Alert variant="warning" title="Not assigned to a judge yet">
          This submission arrived before a judge was available. It is assigned
          automatically when a judge is approved or opens their queue.
        </Alert>
      )}

      {evaluation && !assignedToMe && user.role === "JUDGE" && (
        <Alert variant="info" title={`Assigned to ${evaluation.judge.fullName}`}>
          You can read this submission, but only the assigned judge can score it.
        </Alert>
      )}

      {user.role === "SUPER_ADMIN" && (
        <Alert variant="info">
          You are viewing this as a super admin. Scoring is done by the assigned judge.
        </Alert>
      )}

      <ReviewTabs
        panels={{
          c1: <Challenge1ReadOnly bugReports={bugReports} testCases={testCases} />,
          c2: (
            <Challenge2ReadOnly attemptId={submission.id} submission={submission.challenge2} />
          ),
          c3: <Challenge3ReadOnly submission={submission.challenge3} />,
        }}
      />
    </div>
  );
}
