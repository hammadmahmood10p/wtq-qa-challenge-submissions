import { describe, expect, it } from "vitest";
import {
  BONUS_DEFAULT,
  BONUS_MAX,
  BONUS_MIN,
  RUBRIC,
  computeTotal,
  criterionByKey,
  isComplete,
  maxScoreFor,
  rubricFor,
  scorableChallenges,
} from "./scoring";

const keysFor = (track: "C3" | "C4" | null) =>
  scorableChallenges(track).flatMap((c) => rubricFor(c).criteria.map((k) => k.key));

const allScored = (track: "C3" | "C4" | null, value = 1) =>
  new Map(keysFor(track).map((k) => [k, value]));

describe("the rubric matches what the organisers specified", () => {
  it("has the stated maximums", () => {
    const max = Object.fromEntries(
      RUBRIC.flatMap((r) => r.criteria).map((c) => [c.key, c.max]),
    );

    expect(max).toEqual({
      "c1.bug_hunting": 10,
      "c1.bug_reporting": 10,
      "c1.test_cases": 10,
      "c2.tasks": 10,
      "c2.comparison": 10,
      "c2.mandatory_fields": 10,
      "c3.evaluate": 20,
      "c3.approach": 20,
      "c4.automation": 30,
      "c4.thinking": 10,
    });
  });

  it("uses unique criterion keys, since they are the database key", () => {
    const keys = RUBRIC.flatMap((r) => r.criteria).map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("scorableChallenges", () => {
  it("always includes the two mandatory challenges", () => {
    expect(scorableChallenges(null)).toEqual(["C1", "C2"]);
  });

  it("adds whichever alternative the participant committed to", () => {
    expect(scorableChallenges("C3")).toEqual(["C1", "C2", "C3"]);
    expect(scorableChallenges("C4")).toEqual(["C1", "C2", "C4"]);
  });
});

describe("maxScoreFor", () => {
  it("is 105 on the Challenge 3 route, because of the bonus", () => {
    // 30 (C1) + 30 (C2) + 40 (C3) + 5 bonus
    expect(maxScoreFor("C3")).toBe(105);
  });

  it("is 100 on the Challenge 4 route, which carries no bonus", () => {
    // 30 (C1) + 30 (C2) + 40 (C4)
    expect(maxScoreFor("C4")).toBe(100);
  });

  it("is 60 for someone who chose neither", () => {
    expect(maxScoreFor(null)).toBe(60);
  });
});

describe("computeTotal", () => {
  it("adds the bonus only on the Challenge 3 route", () => {
    const c3 = allScored("C3", 0);
    const c4 = allScored("C4", 0);

    expect(computeTotal(c3, "C3", 5)).toBe(5);
    // A bonus on a C4 attempt is meaningless and must not leak into the total, even
    // if a stale value is sitting on the row.
    expect(computeTotal(c4, "C4", 5)).toBe(0);
  });

  it("subtracts a negative bonus", () => {
    expect(computeTotal(allScored("C3", 0), "C3", BONUS_MIN)).toBe(-5);
  });

  it("ignores scores for a challenge the participant did not take", () => {
    // A C4 score left behind by an unlock-and-rescore must not count towards a
    // participant who is on the C3 route.
    const scores = new Map([...allScored("C3", 2), ["c4.automation", 30]]);
    expect(computeTotal(scores, "C3", 0)).toBe(computeTotal(allScored("C3", 2), "C3", 0));
  });

  it("treats an unscored criterion as nothing, not as a gap", () => {
    expect(computeTotal(new Map([["c1.bug_hunting", 7]]), "C4", null)).toBe(7);
  });

  it("reaches the stated maximum when every criterion is full", () => {
    const full = new Map(
      scorableChallenges("C3")
        .flatMap((c) => rubricFor(c).criteria)
        .map((c) => [c.key, c.max] as const),
    );
    expect(computeTotal(full, "C3", BONUS_MAX)).toBe(maxScoreFor("C3"));
  });
});

describe("isComplete", () => {
  it("is false until every applicable criterion is scored", () => {
    const partial = new Set(keysFor("C3").slice(0, -1));
    expect(isComplete("C3", partial)).toBe(false);
  });

  it("is true once they all are", () => {
    expect(isComplete("C3", new Set(keysFor("C3")))).toBe(true);
  });

  it("does not require the challenge the participant did not choose", () => {
    // The C4 criteria are absent, and must not hold up a C3 submission.
    expect(isComplete("C3", new Set(keysFor("C3")))).toBe(true);
    expect(keysFor("C3")).not.toContain("c4.automation");
  });

  it("is satisfiable for a participant who chose neither alternative", () => {
    expect(isComplete(null, new Set(keysFor(null)))).toBe(true);
  });
});

describe("bonus bounds", () => {
  it("defaults inside its own range", () => {
    expect(BONUS_DEFAULT).toBeGreaterThanOrEqual(BONUS_MIN);
    expect(BONUS_DEFAULT).toBeLessThanOrEqual(BONUS_MAX);
  });

  it("is signed, so it can be taken away as well as given", () => {
    expect(BONUS_MIN).toBeLessThan(0);
  });
});

describe("criterionByKey", () => {
  it("finds a criterion across any challenge", () => {
    expect(criterionByKey("c4.thinking")?.max).toBe(10);
  });

  it("returns undefined for anything else, so a forged key cannot be scored", () => {
    expect(criterionByKey("c1.made_up")).toBeUndefined();
  });
});
