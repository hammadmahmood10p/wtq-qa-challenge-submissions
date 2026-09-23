import { AlertTriangle, ExternalLink, Eye, FileText, FolderGit2 } from "lucide-react";
import type { ChallengeKey } from "@/generated/prisma/enums";

/**
 * Challenges 2 and 3 as a judge sees them.
 *
 * Built alongside the participant-facing forms rather than on Day 9, so the judge's
 * review page is assembly rather than a second implementation (DELIVERY_PLAN §1.1a).
 *
 * Both are server components with no interactivity: a judge cannot alter a
 * participant's submission, and the surest way to guarantee that is for no editing
 * code to exist here.
 */

export function Challenge2ReadOnly({
  attemptId,
  challenge,
  submission,
}: {
  attemptId: string;
  challenge: ChallengeKey;
  submission: { originalFilename: string; sizeBytes: number; uploadedAt: Date } | null;
}) {
  if (!submission) {
    return (
      <EmptyState icon={FileText} message="This participant did not upload a report." />
    );
  }

  return (
    <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-4 rounded-(--radius-card) border p-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="bg-violet/10 text-violet flex size-10 shrink-0 items-center justify-center rounded-(--radius-control)">
          <FileText size={19} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm">{submission.originalFilename}</p>
          <p className="text-muted text-xs">
            {(submission.sizeBytes / 1024 / 1024).toFixed(1)} MB · uploaded{" "}
            {submission.uploadedAt.toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
      </div>

      {/*
        Requirement: the PDF opens in the browser for reading, not as a download. The
        route issues a short-lived signed URL with an inline disposition; the object
        key never reaches the browser.
      */}
      <a
        href={`/api/files/submission/${attemptId}/${challenge.toLowerCase()}`}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-violet hover:bg-violet-hover inline-flex shrink-0 items-center gap-2 rounded-(--radius-control) px-4 py-2.5 text-sm font-medium text-white transition-colors"
      >
        <Eye size={15} />
        View File
      </a>
    </div>
  );
}

export function Challenge3ReadOnly({
  submission,
}: {
  submission: { githubUrl: string; verifiedPublic: boolean | null } | null;
}) {
  if (!submission) {
    return (
      <EmptyState icon={FolderGit2} message="This participant did not submit a repository link." />
    );
  }

  return (
    <div className="space-y-3">
      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-4 rounded-(--radius-card) border p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-violet/10 text-violet flex size-10 shrink-0 items-center justify-center rounded-(--radius-control)">
            <FolderGit2 size={19} />
          </span>
          <p className="min-w-0 truncate font-mono text-sm">{submission.githubUrl}</p>
        </div>

        <a
          href={submission.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-violet hover:bg-violet-hover inline-flex shrink-0 items-center gap-2 rounded-(--radius-control) px-4 py-2.5 text-sm font-medium text-white transition-colors"
        >
          Open repository
          <ExternalLink size={15} />
        </a>
      </div>

      {/*
        Recorded at save time and shown as context, not as a verdict. The check is
        unauthenticated and best-effort, so a false here may mean the repository is
        private, renamed, or simply that GitHub rate-limited us.
      */}
      {submission.verifiedPublic === false && (
        <p className="text-warning flex items-center gap-1.5 text-xs">
          <AlertTriangle size={13} />
          This repository was not reachable when the participant saved it.
        </p>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: typeof FileText;
  message: string;
}) {
  return (
    <div className="border-border text-muted rounded-(--radius-card) border border-dashed p-8 text-center text-sm">
      <Icon size={18} className="mx-auto mb-2 opacity-50" />
      {message}
    </div>
  );
}
