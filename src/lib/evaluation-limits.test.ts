import { describe, expect, it } from "vitest";
import { canCommentOnSubmission, MAX_JUDGE_COMMENT } from "./evaluation-limits";

const JUDGE_A = "judge-a";
const JUDGE_B = "judge-b";
const ADMIN = "super-admin";

describe("canCommentOnSubmission", () => {
  it("lets the judge holding the submission write the comment", () => {
    expect(canCommentOnSubmission({ holdingJudgeId: JUDGE_A, viewerId: JUDGE_A })).toBe(true);
  });

  it("does not let another judge write it", () => {
    // They still see it — the table renders the text for everyone. What they cannot
    // do is change what a colleague said about a submission they do not hold.
    expect(canCommentOnSubmission({ holdingJudgeId: JUDGE_A, viewerId: JUDGE_B })).toBe(false);
  });

  it("does not let a super admin write it either", () => {
    // Deliberate, and the one rule here that surprises people. The column says what
    // the judge who reviewed this thought; a second hand writing into it under the
    // same name would make it say something else. Unassign and take it instead.
    expect(canCommentOnSubmission({ holdingJudgeId: JUDGE_A, viewerId: ADMIN })).toBe(false);
  });

  it("refuses everybody while the submission is back in the pool", () => {
    // Nobody holds it, so there is no name the comment would be written under.
    for (const viewer of [JUDGE_A, JUDGE_B, ADMIN]) {
      expect(canCommentOnSubmission({ holdingJudgeId: null, viewerId: viewer })).toBe(false);
    }
  });

  it("follows the submission when it changes hands", () => {
    // Judge A claimed it, an admin unassigned it, judge B took it. B answers for it
    // now — comment included — and A no longer does.
    expect(canCommentOnSubmission({ holdingJudgeId: JUDGE_B, viewerId: JUDGE_B })).toBe(true);
    expect(canCommentOnSubmission({ holdingJudgeId: JUDGE_B, viewerId: JUDGE_A })).toBe(false);
  });

  it("never treats a null viewer id as a match for an unheld submission", () => {
    // Defensive: a bug upstream that passed an empty id must not hand everybody the
    // edit box on every unassigned row.
    expect(canCommentOnSubmission({ holdingJudgeId: null, viewerId: "" })).toBe(false);
  });
});

describe("MAX_JUDGE_COMMENT", () => {
  it("leaves room for a paragraph", () => {
    expect(MAX_JUDGE_COMMENT).toBeGreaterThanOrEqual(1000);
  });
});
