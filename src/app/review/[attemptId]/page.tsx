import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { Challenge1ReadOnly } from "@/components/challenge/challenge1-readonly";
import { Challenge1Criteria } from "@/components/review/challenge1-criteria";
import { ChallengeBrief } from "@/components/challenge/challenge-brief";
import { WhatToReview } from "@/components/review/what-to-review";
import { getKnownBugsPdf } from "@/lib/event-config";
import {
  Challenge2ReadOnly,
  Challenge3ReadOnly,
} from "@/components/challenge/challenge23-readonly";
import { AnswersReadOnly } from "@/components/submissions/answers-readonly";
import { ChallengeScoreCard } from "@/components/review/challenge-scorecard";
import { ClaimBar } from "@/components/review/claim-bar";
import { FinalScoreBar } from "@/components/review/final-score-bar";
import { ScoringProvider } from "@/components/review/scoring-context";
import { TotalBanner } from "@/components/review/total-banner";
import { ReviewTabs, type ReviewPanel } from "@/components/submissions/review-tabs";
import { Alert } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth";
import { CHALLENGES, challengeById } from "@/lib/challenge-content";
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
 * Opened in a new tab from the submissions table. The panels reuse the read-only
 * renderers written alongside the participant forms, so this page is assembly rather
 * than a second implementation of the same rendering.
 *
 * The score fields and the Submit Final Score button arrive next; the total banner is
 * here because the brief puts it at the top, and it reads as zero until scoring begins.
 */
export default async function ReviewPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireRole("JUDGE", "SUPER_ADMIN");
  const { attemptId } = await params;

  const submission = await getSubmissionDetail(attemptId);
  if (!submission) notFound();

  // Only whether one exists. The file itself is fetched through its own route, which
  // re-checks the role — this page must not become a second place that decides who may
  // read the answer key.
  const knownBugs = Boolean(await getKnownBugsPdf());

  const evaluation = submission.evaluation;
  const assignedToMe = evaluation?.judgeId === user.id;
  const track = submission.chosenTrack;

  // A judge may score only their own assignment; a super admin is the escalation path
  // and may score any of them. The server enforces both — this only decides whether
  // the fields are drawn as editable.
  const canScore = Boolean(evaluation) && (user.role === "SUPER_ADMIN" || assignedToMe);

  const initialScores: Record<string, number> = {};
  for (const row of evaluation?.scores ?? []) initialScores[row.criterion] = Number(row.score);

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
      content = (
        <div className="space-y-6">
          <Challenge1Criteria knownBugs={knownBugs} />
          <Challenge1ReadOnly entries={submission.challenge1Entries} />
        </div>
      );
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
      content: (
        <>
          {/* The brief this participant was working to, one click away. Rendered here
              on the server and handed to the dialog as children, so the judge reads
              exactly the text the participant read — the same source, not a second
              copy that would drift from it.

              `chosenTrack` is deliberately null: the participant-facing copy would
              otherwise tell the judge that a challenge is "closed to you", which is
              true of the participant and nonsense here. */}
          <WhatToReview challengeNumber={challenge.number}>
            <ChallengeBrief challenge={challenge} chosenTrack={null} />
          </WhatToReview>

          {/* Above the submission, not below it: the score is why the judge is here,
              and Challenge 1 can run to dozens of findings. */}
          {evaluation && <ChallengeScoreCard challenge={challenge.id} />}
          {content}
        </>
      ),
    };
  });

  const backHref = user.role === "SUPER_ADMIN" ? "/admin/submissions" : "/judge";
  const chosen = track ? challengeById(track) : null;

  return (
    <ScoringProvider
      attemptId={submission.id}
      track={track}
      status={evaluation?.status ?? "ASSIGNED"}
      canScore={canScore}
      canUnlock={user.role === "SUPER_ADMIN"}
      initialScores={initialScores}
      initialBonus={
        evaluation?.bonusPoints === null || evaluation?.bonusPoints === undefined
          ? null
          : Number(evaluation.bonusPoints)
      }
    >
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
            <TotalBanner />
          </div>
        </header>

        {/*
        Unclaimed: a judge can take it from here rather than going back to the list.

        The condition is the *judge*, not the row. Since a super admin can release a
        submission or reopen a finalised one, an evaluation full of scores with nobody
        against it is now an ordinary state — and it is exactly the state where the
        claim offer belongs.

        A super admin is shown the state but never offered the claim: judging is not
        their job, and they can no longer put somebody else's name on anyway.
      */}
        {!evaluation?.judgeId && user.role === "JUDGE" && (
          <ClaimBar attemptId={submission.id} judgeName={user.fullName} />
        )}

        {!evaluation?.judgeId && user.role === "SUPER_ADMIN" && (
          <Alert variant="info" title="No judge has taken this yet">
            Judges pick submissions up from the shared table themselves. You can reopen or unassign
            one from Participants Submission Details, but not assign it.
          </Alert>
        )}

        {evaluation?.judge && !assignedToMe && user.role === "JUDGE" && (
          <Alert variant="info" title={` is reviewing this`}>
            You can read this submission, but only the judge who took it can score it.
          </Alert>
        )}

        <ReviewTabs panels={panels} />

        {evaluation && <FinalScoreBar judgeName={evaluation.judge?.fullName ?? "Unassigned"} />}
      </div>
    </ScoringProvider>
  );
}
