import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { Challenge1ReadOnly } from "@/components/challenge/challenge1-readonly";
import {
  Challenge2ReadOnly,
  Challenge3ReadOnly,
} from "@/components/challenge/challenge23-readonly";
import { AnswersReadOnly } from "@/components/submissions/answers-readonly";
import { ReviewTabs, type ReviewPanel } from "@/components/submissions/review-tabs";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { CHALLENGES, challengeById } from "@/lib/challenge-content";
import { getSubmissionDetail } from "@/lib/submissions";
import { maxScoreFor } from "@/lib/scoring";

export const metadata: Metadata = { title: "Review submission — WTQ 2026" };

const LOCATION_LABELS: Record<string, string> = {
  KARACHI: "Karachi",
  LAHORE: "Lahore",
  ISLAMABAD: "Islamabad",
};

/**
 * Everything one participant submitted, in one place.
 *
 * Opened in a new tab from the submissions table. The panels reuse the read-only
 * renderers written alongside the participant forms, so this page is assembly rather
 * than a second implementation of the same rendering.
 *
 * The score fields and the Submit Final Score button arrive next; the total banner is
 * here because the brief puts it at the top, and it reads as zero until scoring begins.
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
  const track = submission.chosenTrack;


  const byChallenge = new Map(submission.submissions.map((s) => [s.challenge, s]));

  const answersFor = (key: ChallengeKey): Record<string, string> => {
    const raw = byChallenge.get(key)?.answers;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") answers[k] = v;
    }
    return answers;
  };

  const fileFor = (key: ChallengeKey) => {
    const row = byChallenge.get(key);
    if (!row?.fileKey || !row.originalFilename || !row.uploadedAt) return null;
    return {
      originalFilename: row.originalFilename,
      sizeBytes: row.sizeBytes ?? 0,
      uploadedAt: row.uploadedAt,
    };
  };

  const panels: ReviewPanel[] = CHALLENGES.map((challenge) => {
    const applicable = !challenge.track || challenge.track === track;

    let content: React.ReactNode = null;

    if (challenge.id === "C1") {
      content = <Challenge1ReadOnly entries={submission.challenge1Entries} />;
    } else if (challenge.id === "C4") {
      const row = byChallenge.get("C4");
      content = (
        <div className="space-y-8">
          <Challenge3ReadOnly
            submission={
              row?.githubUrl
                ? { githubUrl: row.githubUrl, verifiedPublic: row.verifiedPublic }
                : null
            }
          />
          <AnswersReadOnly questions={challenge.questions} answers={answersFor("C4")} />
        </div>
      );
    } else {
      content = (
        <div className="space-y-8">
          <Challenge2ReadOnly
            attemptId={submission.id}
            challenge={challenge.id}
            submission={fileFor(challenge.id)}
          />
          <AnswersReadOnly questions={challenge.questions} answers={answersFor(challenge.id)} />
        </div>
      );
    }

    return {
      challenge: challenge.id,
      label: `Task ${challenge.number}`,
      sub: challenge.title,
      applicable,
      content,
    };
  });

  const backHref = user.role === "SUPER_ADMIN" ? "/admin/submissions" : "/judge";
  const chosen = track ? challengeById(track) : null;

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
            <p className="text-muted mt-2 text-xs">
              {chosen
                ? `Chose Challenge ${chosen.number} — ${chosen.title}`
                : "Did not choose between Challenge 3 and Challenge 4"}
            </p>
          </div>

          {/* Requirement 5 for judges: the total sits at the top and starts at zero. */}
          <div className="text-right">
            <p className="text-muted font-mono text-[10px] tracking-[0.18em] uppercase">
              Total score
            </p>
            <p className="font-display tabular mt-1 text-4xl font-bold">
              {evaluation?.totalScore ? Number(evaluation.totalScore) : 0}
              <span className="text-muted ml-1 text-lg font-normal">/ {maxScoreFor(track)}</span>
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

      <ReviewTabs panels={panels} />
    </div>
  );
}
