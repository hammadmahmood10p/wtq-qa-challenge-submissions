import { describe, expect, it } from "vitest";
import {
  AI_EVALUATION_CHALLENGES,
  canReadAiEvaluation,
  canReadJudgeOnlyFile,
  canReadKnownBugs,
  isAiEvaluationChallenge,
  normaliseApplicationUrl,
} from "./event-config";

describe("normaliseApplicationUrl", () => {
  it("keeps a full https address", () => {
    expect(normaliseApplicationUrl("https://shop.example.com/")).toBe("https://shop.example.com/");
  });

  it("assumes https for a bare host, because someone will paste one", () => {
    expect(normaliseApplicationUrl("shop.example.com")).toBe("https://shop.example.com/");
  });

  it("keeps a path, a port and a query", () => {
    expect(normaliseApplicationUrl("http://192.168.1.13:3000/store?lang=en")).toBe(
      "http://192.168.1.13:3000/store?lang=en",
    );
  });

  it("allows localhost, for a rehearsal against a machine in the room", () => {
    expect(normaliseApplicationUrl("http://localhost:3000")).toBe("http://localhost:3000/");
  });

  it("trims surrounding whitespace from a paste", () => {
    expect(normaliseApplicationUrl("  https://shop.example.com  ")).toBe(
      "https://shop.example.com/",
    );
  });

  it("refuses anything that is not http or https", () => {
    // This value is rendered as an anchor on a page a thousand people open. An
    // administrator is trusted, but a trusted person can still paste the wrong thing.
    expect(normaliseApplicationUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseApplicationUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normaliseApplicationUrl("file:///etc/passwd")).toBeNull();
  });

  it("refuses an empty or unusable value", () => {
    expect(normaliseApplicationUrl("")).toBeNull();
    expect(normaliseApplicationUrl("   ")).toBeNull();
    expect(normaliseApplicationUrl("not a url at all")).toBeNull();
  });

  it("refuses a bare word that is not a hostname", () => {
    // "shop" would otherwise become https://shop/ and fail only when a participant
    // clicks it.
    expect(normaliseApplicationUrl("shop")).toBeNull();
  });
});

/**
 * The seeded-defect list is the answer key to Challenge 1. If a participant can read
 * it, the challenge measures transcription rather than testing — so this rule is worth
 * pinning down rather than trusting to a comparison in a route handler.
 */
describe("canReadKnownBugs", () => {
  it("lets judges read it, which is what it is for", () => {
    expect(canReadKnownBugs("JUDGE")).toBe(true);
  });

  it("lets a super admin read it", () => {
    expect(canReadKnownBugs("SUPER_ADMIN")).toBe(true);
  });

  it("never lets a participant read it", () => {
    expect(canReadKnownBugs("PARTICIPANT")).toBe(false);
  });

  it("refuses anyone who is not signed in", () => {
    expect(canReadKnownBugs(null)).toBe(false);
    expect(canReadKnownBugs(undefined)).toBe(false);
  });

  it("refuses a role it does not recognise", () => {
    // Defensive: a role added later is denied until somebody decides otherwise, which
    // is the right default for the one document that would spoil the event.
    expect(canReadKnownBugs("")).toBe(false);
    expect(canReadKnownBugs("OBSERVER")).toBe(false);
    expect(canReadKnownBugs("judge")).toBe(false);
  });
});

describe("canReadAiEvaluation", () => {
  it("lets judges and super admins read it", () => {
    expect(canReadAiEvaluation("JUDGE")).toBe(true);
    expect(canReadAiEvaluation("SUPER_ADMIN")).toBe(true);
  });

  it("never lets a participant read it", () => {
    // It says how submissions scored. Not a participant's to see during the event, and
    // not afterwards either.
    expect(canReadAiEvaluation("PARTICIPANT")).toBe(false);
  });

  it("refuses anyone not signed in, and any role it does not recognise", () => {
    expect(canReadAiEvaluation(null)).toBe(false);
    expect(canReadAiEvaluation(undefined)).toBe(false);
    expect(canReadAiEvaluation("")).toBe(false);
    expect(canReadAiEvaluation("OBSERVER")).toBe(false);
  });

  it("is the same rule as the known bugs document, by construction", () => {
    // Both delegate to canReadJudgeOnlyFile. If one is ever loosened, it should be a
    // decision rather than a drift between two copies of the same comparison.
    for (const role of ["JUDGE", "SUPER_ADMIN", "PARTICIPANT", "", null, undefined]) {
      expect(canReadAiEvaluation(role)).toBe(canReadKnownBugs(role));
      expect(canReadAiEvaluation(role)).toBe(canReadJudgeOnlyFile(role));
    }
  });
});

describe("isAiEvaluationChallenge", () => {
  it("accepts the two challenges that take an uploaded report", () => {
    expect(isAiEvaluationChallenge("C2")).toBe(true);
    expect(isAiEvaluationChallenge("C3")).toBe(true);
  });

  it("refuses the ones with nothing for the assessment to read", () => {
    // Challenge 1 is written into the application; Challenge 4 is a repository link.
    // Neither produces a PDF, so neither has reports to assess.
    expect(isAiEvaluationChallenge("C1")).toBe(false);
    expect(isAiEvaluationChallenge("C4")).toBe(false);
  });

  it("refuses anything that could come off a request", () => {
    // The value names the settings that get written and the folder a file lands in,
    // so it must never be whatever the form says it is.
    expect(isAiEvaluationChallenge("")).toBe(false);
    expect(isAiEvaluationChallenge("c2")).toBe(false);
    expect(isAiEvaluationChallenge("../../etc")).toBe(false);
    expect(isAiEvaluationChallenge("C2; DROP TABLE")).toBe(false);
  });

  it("agrees with the list the admin screen renders from", () => {
    for (const challenge of AI_EVALUATION_CHALLENGES) {
      expect(isAiEvaluationChallenge(challenge)).toBe(true);
    }
  });
});
