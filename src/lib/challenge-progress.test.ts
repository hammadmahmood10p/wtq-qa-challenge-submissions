import { describe, expect, it } from "vitest";
import { TOTAL_CHALLENGES, evaluateProgress, type ProgressSubmission } from "./challenge-progress";
import { challengeById } from "./challenge-content";

/**
 * These decide two things that must never disagree: whether a participant may finish
 * early, and what number a judge reads in the Challenges Accepted column.
 */

/** A C2 submission with everything the rule asks for. */
function completeC2(): ProgressSubmission {
  const answers: Record<string, string> = {};
  for (const question of challengeById("C2")!.questions) {
    if (question.required) answers[question.key] = "written";
  }
  return { challenge: "C2", fileKey: "uploads/report.pdf", githubUrl: null, answers };
}

function completeC4(): ProgressSubmission {
  const answers: Record<string, string> = {};
  for (const question of challengeById("C4")!.questions) {
    if (question.required) answers[question.key] = "written";
  }
  return {
    challenge: "C4",
    fileKey: null,
    githubUrl: "https://github.com/someone/repo",
    answers,
  };
}

describe("evaluateProgress", () => {
  it("counts nothing for an untouched attempt", () => {
    const progress = evaluateProgress({ track: null, completeEntryCount: 0, submissions: [] });

    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(TOTAL_CHALLENGES);
    expect(progress.mandatoryComplete).toBe(false);
  });

  it("always counts out of three, even before a track is chosen", () => {
    // "1 out of 3" is the honest reading of someone who did Challenge 1 and stopped.
    // Shrinking the denominator would flatter it.
    const progress = evaluateProgress({
      track: null,
      completeEntryCount: 4,
      submissions: [completeC2()],
    });

    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(3);
  });

  it("treats one finished finding as enough for Challenge 1", () => {
    // The number of findings is what a judge scores; it is not a bar to clear.
    const progress = evaluateProgress({ track: null, completeEntryCount: 1, submissions: [] });

    expect(progress.items.find((i) => i.key === "C1")?.complete).toBe(true);
  });

  it("does not count half-written findings", () => {
    const progress = evaluateProgress({ track: null, completeEntryCount: 0, submissions: [] });
    const c1 = progress.items.find((i) => i.key === "C1");

    expect(c1?.complete).toBe(false);
    expect(c1?.missing).toHaveLength(1);
  });

  it("needs both the PDF and the written answers for Challenge 2", () => {
    const withoutFile = evaluateProgress({
      track: null,
      completeEntryCount: 1,
      submissions: [{ ...completeC2(), fileKey: null }],
    });
    expect(withoutFile.items.find((i) => i.key === "C2")?.complete).toBe(false);
    expect(withoutFile.items.find((i) => i.key === "C2")?.missing).toContain("a PDF report");

    const withoutAnswers = evaluateProgress({
      track: null,
      completeEntryCount: 1,
      submissions: [{ ...completeC2(), answers: {} }],
    });
    expect(withoutAnswers.items.find((i) => i.key === "C2")?.complete).toBe(false);
  });

  it("treats whitespace answers as unwritten", () => {
    const answers = Object.fromEntries(
      challengeById("C2")!.questions.filter((q) => q.required).map((q) => [q.key, "   "]),
    );

    const progress = evaluateProgress({
      track: null,
      completeEntryCount: 1,
      submissions: [{ ...completeC2(), answers }],
    });

    expect(progress.items.find((i) => i.key === "C2")?.complete).toBe(false);
  });

  it("asks Challenge 4 for a repository rather than a PDF", () => {
    const progress = evaluateProgress({
      track: "C4",
      completeEntryCount: 1,
      submissions: [completeC2(), completeC4()],
    });

    expect(progress.completed).toBe(3);
    expect(progress.items.map((i) => i.key)).toEqual(["C1", "C2", "C4"]);
  });

  it("does not show the track they did not choose", () => {
    // Showing Challenge 3 in the third slot before they pick would read as a decision
    // already made on their behalf.
    const progress = evaluateProgress({
      track: "C4",
      completeEntryCount: 1,
      submissions: [completeC2()],
    });

    expect(progress.items.some((i) => i.key === "C3")).toBe(false);
  });

  it("still refuses submission when no track has been chosen", () => {
    // Challenges 1 and 2 finished is not enough. A participant who never opened the
    // third would otherwise hand in two thirds of an attempt without ever making the
    // one choice the event puts in front of them — and that choice is irreversible
    // and carries a bonus, so it has to be made deliberately rather than by running
    // out of time.
    const progress = evaluateProgress({
      track: null,
      completeEntryCount: 2,
      submissions: [completeC2()],
    });

    expect(progress.trackChosen).toBe(false);
    expect(progress.mandatoryComplete).toBe(false);
    expect(progress.completed).toBe(2);
  });

  it("unlocks submission once the compulsory two are done and a track is chosen", () => {
    // Chosen, not finished: committing to Challenge 3 or 4 is what the gate asks for.
    // Insisting the third be complete as well would trap someone who ran out of time
    // on it, and the clock already submits for them.
    const progress = evaluateProgress({
      track: "C4",
      completeEntryCount: 2,
      submissions: [completeC2()],
    });

    expect(progress.trackChosen).toBe(true);
    expect(progress.mandatoryComplete).toBe(true);
    expect(progress.completed).toBe(2);
  });

  it("keeps the gate closed while either compulsory challenge is unfinished", () => {
    const noC1 = evaluateProgress({
      track: "C3",
      completeEntryCount: 0,
      submissions: [completeC2()],
    });
    expect(noC1.mandatoryComplete).toBe(false);
    expect(noC1.mandatory.filter((i) => !i.complete).map((i) => i.key)).toEqual(["C1"]);

    const noC2 = evaluateProgress({ track: null, completeEntryCount: 9, submissions: [] });
    expect(noC2.mandatoryComplete).toBe(false);
    expect(noC2.mandatory.filter((i) => !i.complete).map((i) => i.key)).toEqual(["C2"]);
  });

  it("names what is missing in words a participant can act on", () => {
    const progress = evaluateProgress({ track: null, completeEntryCount: 0, submissions: [] });

    for (const item of progress.items) {
      for (const reason of item.missing) {
        expect(reason.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
