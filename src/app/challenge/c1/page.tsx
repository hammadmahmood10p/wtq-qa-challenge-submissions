import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { Challenge1Workspace } from "@/components/challenge/challenge1-workspace";
import {
  ChallengePageChrome,
  loadChallengePage,
} from "@/components/challenge/challenge-page-shell";
import { Alert } from "@/components/ui/alert";
import { getApplicationUrl } from "@/lib/event-config";
import { listChallenge1Entries } from "@/lib/challenge1";

export const metadata: Metadata = { title: "Challenge 1 submission — WTQ 2026" };

export default async function Challenge1Page() {
  const { attempt, definition, progress } = await loadChallengePage("C1");
  const applicationUrl = await getApplicationUrl();
  const entries = await listChallenge1Entries(attempt.id);

  return (
    <ChallengePageChrome
      remainingMs={attempt.remainingMs}
      totalMs={attempt.durationMinutes * 60_000}
      progress={progress}
    >
      <header>
        <p className="text-muted font-mono text-[11px] tracking-[0.18em] uppercase">
          Challenge {definition.number}
        </p>
        <h1 className="font-display mt-1.5 text-2xl font-bold">{definition.title}</h1>
        <p className="text-muted mt-2">{definition.summary}</p>
      </header>

      {applicationUrl ? (
        <a
          href={applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="border-border bg-surface hover:border-violet/50 inline-flex items-center gap-2 rounded-(--radius-control) border px-4 py-2.5 text-sm font-medium transition-colors"
        >
          Open the application you are testing
          <ExternalLink size={14} />
        </a>
      ) : (
        <Alert variant="warning" title="Application link pending">
          The link to the application under test will appear here before the event begins.
        </Alert>
      )}

      {attempt.challenge1LockedAt ? (
        <Alert variant="success" title="Challenge 1 is locked">
          You handed this in on{" "}
          {attempt.challenge1LockedAt.toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          . Your findings are below and are being judged as they stand. If something
          needs changing, a super admin can reopen Challenge 1 for you.
        </Alert>
      ) : (
        <Alert variant="info">
          Write each bug report alongside the test case that covers it. Everything saves
          automatically. Copying and pasting are turned off in these fields — attach
          screenshots with the <strong>Attach evidence</strong> button, or by dragging an
          image onto the strip under each box.
        </Alert>
      )}

      <Challenge1Workspace
        locked={Boolean(attempt.challenge1LockedAt)}
        initialEntries={entries.map((entry) => ({
          id: entry.id,
          bugTitle: entry.bugTitle,
          bugDescription: entry.bugDescription,
          testTitle: entry.testTitle,
          testDescription: entry.testDescription,
          bugEvidence: entry.attachments
            .filter((a) => a.slot === "BUG")
            .map(({ id, originalFilename, sizeBytes }) => ({ id, originalFilename, sizeBytes })),
          testEvidence: entry.attachments
            .filter((a) => a.slot === "TEST")
            .map(({ id, originalFilename, sizeBytes }) => ({ id, originalFilename, sizeBytes })),
        }))}
      />
    </ChallengePageChrome>
  );
}
