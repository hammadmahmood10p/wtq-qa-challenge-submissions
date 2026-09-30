import type { ChallengeKey, ChallengeTrack } from "@/generated/prisma/enums";
import { challengeById } from "@/lib/challenge-content";
import type { Challenge } from "@/lib/challenge-content";

/**
 * How far through the challenge a participant is.
 *
 * There has to be exactly one answer to "has this challenge been done", because three
 * screens now show it and they must agree: the participant's Submit button, which
 * refuses until the compulsory two are finished; the confirmation dialog, which lists
 * what is about to be handed in; and the Challenges Accepted column a judge reads. Two
 * definitions that drifted would mean a participant told they had finished and a judge
 * told they had not.
 *
 * Pure, so the client can use it too. Nothing here touches the database — the callers
 * gather the rows and pass the shapes in.
 */

/**
 * Three, always: Challenges 1 and 2, plus whichever of 3 and 4 was chosen.
 *
 * The denominator does not move when somebody declines to choose a track. "1 out of 3"
 * is the honest reading of a participant who did Challenge 1 and stopped; "1 out of 2"
 * would flatter it by pretending the third was never on offer.
 */
export const TOTAL_CHALLENGES = 3;

export interface ChallengeStatus {
  key: ChallengeKey;
  number: 1 | 2 | 3 | 4;
  title: string;
  complete: boolean;
  /** Why it is not complete, in words a participant can act on. */
  missing: string[];
}

export interface ProgressInput {
  /** The chosen track, or null if they never committed to one. */
  track: ChallengeTrack | null;
  /** Findings that pass `isEntryComplete`. Half-written drawers are not counted. */
  completeEntryCount: number;
  /** What has been saved for Challenges 2, 3 and 4. */
  submissions: ProgressSubmission[];
}

export interface ProgressSubmission {
  challenge: ChallengeKey;
  fileKey: string | null;
  githubUrl: string | null;
  answers: Record<string, string>;
}

export interface Progress {
  /** The three that apply to this participant, in order. */
  items: ChallengeStatus[];
  completed: number;
  total: number;
  /** Challenges 1 and 2, which the organisers made compulsory. */
  mandatory: ChallengeStatus[];
  mandatoryComplete: boolean;
}

function missingFor(
  definition: Challenge,
  submission: ProgressSubmission | undefined,
): string[] {
  if (!submission) {
    return definition.id === "C4"
      ? ["a repository link", "the written answers"]
      : ["a PDF report", "the written answers"];
  }

  const missing: string[] = [];

  // Challenge 4 hands in a repository; the others hand in a document.
  if (definition.id === "C4") {
    if (!submission.githubUrl?.trim()) missing.push("a repository link");
  } else if (!submission.fileKey) {
    missing.push("a PDF report");
  }

  for (const question of definition.questions) {
    if (question.required && !(submission.answers[question.key] ?? "").trim()) {
      missing.push(question.label);
    }
  }

  return missing;
}

export function evaluateProgress(input: ProgressInput): Progress {
  const items: ChallengeStatus[] = [];

  // Challenge 1 is done when there is at least one finding worth judging. One is
  // enough deliberately: the count of findings is what a judge scores, not a bar to
  // clear before the button unlocks.
  const c1 = challengeById("C1")!;
  items.push({
    key: "C1",
    number: c1.number,
    title: c1.title,
    complete: input.completeEntryCount > 0,
    missing:
      input.completeEntryCount > 0
        ? []
        : ["at least one finding with its bug report and test case both written"],
  });

  const c2 = challengeById("C2")!;
  const c2Missing = missingFor(c2, input.submissions.find((s) => s.challenge === "C2"));
  items.push({
    key: "C2",
    number: c2.number,
    title: c2.title,
    complete: c2Missing.length === 0,
    missing: c2Missing,
  });

  // The third slot is whichever of 3 and 4 they committed to. Before they choose, it
  // stands empty rather than guessing — showing Challenge 3 there would read as a
  // decision already made.
  if (input.track) {
    const chosen = challengeById(input.track)!;
    const missing = missingFor(chosen, input.submissions.find((s) => s.challenge === input.track));
    items.push({
      key: chosen.id,
      number: chosen.number,
      title: chosen.title,
      complete: missing.length === 0,
      missing,
    });
  }

  const mandatory = items.filter((item) => item.key === "C1" || item.key === "C2");

  return {
    items,
    completed: items.filter((item) => item.complete).length,
    total: TOTAL_CHALLENGES,
    mandatory,
    mandatoryComplete: mandatory.every((item) => item.complete),
  };
}
