import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { Challenge1Workspace } from "@/components/challenge/challenge1-workspace";
import {
  ChallengePageChrome,
  loadChallengePage,
} from "@/components/challenge/challenge-page-shell";
import { Alert } from "@/components/ui/alert";
import { APPLICATION_UNDER_TEST_URL } from "@/lib/challenge-content";
import { listChallenge1Entries } from "@/lib/challenge1";

export const metadata: Metadata = { title: "Challenge 1 submission — WTQ 2026" };

export default async function Challenge1Page() {
  const { attempt, definition } = await loadChallengePage("C1");
  const entries = await listChallenge1Entries(attempt.id);

  return (
    <ChallengePageChrome remainingMs={attempt.remainingMs} wide>
      <header>
        <p className="text-muted font-mono text-[11px] tracking-[0.18em] uppercase">
          Challenge {definition.number}
        </p>
        <h1 className="font-display mt-1.5 text-2xl font-bold">{definition.title}</h1>
        <p className="text-muted mt-2">{definition.summary}</p>
      </header>

      {APPLICATION_UNDER_TEST_URL ? (
        <a
          href={APPLICATION_UNDER_TEST_URL}
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

      <Alert variant="info">
        Write each bug report alongside the test case that covers it. Everything saves
        automatically, and you can paste a screenshot straight into either description.
      </Alert>

      <Challenge1Workspace
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
