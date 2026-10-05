import { describe, expect, it } from "vitest";
import {
  canSealChallenge1,
  isChallengeReachable,
  isEntryComplete,
  missingEntryParts,
} from "./challenge1-limits";

const full = {
  bugTitle: "Cart total ignores the discount",
  bugDescription: "Apply WTQ10 and the total does not change.",
  testTitle: "Discount applies to the cart total",
  testDescription: "Given a discount code, when applied, the total drops by 10%.",
};

describe("isEntryComplete", () => {
  it("accepts a finding with all four parts written", () => {
    expect(isEntryComplete(full)).toBe(true);
  });

  it("rejects an untouched drawer", () => {
    expect(
      isEntryComplete({ bugTitle: "", bugDescription: "", testTitle: "", testDescription: "" }),
    ).toBe(false);
  });

  it("rejects a bug report with no test case", () => {
    // The pairing is the point of Challenge 1: a bug without the test that covers it
    // is not a finding the judges are asked to score.
    expect(isEntryComplete({ ...full, testTitle: "", testDescription: "" })).toBe(false);
  });

  it("rejects a title with nothing under it", () => {
    expect(isEntryComplete({ ...full, bugDescription: "" })).toBe(false);
    expect(isEntryComplete({ ...full, testDescription: "" })).toBe(false);
  });

  it("does not accept whitespace as written", () => {
    // Otherwise the count on the participant's screen and the count a judge sees would
    // disagree, and the database filter behind the column trims too.
    expect(isEntryComplete({ ...full, bugTitle: "   " })).toBe(false);
    expect(isEntryComplete({ ...full, testDescription: "\n\t " })).toBe(false);
  });
});

describe("missingEntryParts", () => {
  it("says nothing about a finished finding", () => {
    expect(missingEntryParts(full)).toEqual([]);
  });

  it("lists the blanks in reading order", () => {
    expect(
      missingEntryParts({ bugTitle: "", bugDescription: "", testTitle: "", testDescription: "" }),
    ).toEqual(["bug title", "bug description", "test case title", "test case description"]);
  });

  it("names only what is actually missing", () => {
    expect(missingEntryParts({ ...full, testTitle: "" })).toEqual(["test case title"]);
  });
});

const blank = { bugTitle: "", bugDescription: "", testTitle: "", testDescription: "" };

describe("canSealChallenge1", () => {
  it("refuses an empty Challenge 1", () => {
    expect(canSealChallenge1([])).toBe(false);
  });

  it("refuses one made entirely of half-written drawers", () => {
    // This is the trap the rule exists to close. Sealing is read-only afterwards and
    // Submit requires a complete finding, so a participant who locked this would be
    // unable to satisfy the requirement and unable to fix it.
    expect(canSealChallenge1([blank, { ...full, testDescription: "" }])).toBe(false);
  });

  it("accepts as soon as one finding is finished", () => {
    expect(canSealChallenge1([full])).toBe(true);
  });

  it("ignores the unfinished ones sitting beside a finished one", () => {
    // Those drawers still autosave and still belong to the participant; they simply
    // are not handed to a judge, and they do not stand in the way of locking.
    expect(canSealChallenge1([blank, full, { ...full, bugTitle: "  " }])).toBe(true);
  });
});

describe("isChallengeReachable", () => {
  it("opens Challenge 1 from the start", () => {
    expect(isChallengeReachable("C1", false)).toBe(true);
  });

  it("keeps the rest shut until Challenge 1 has been sealed", () => {
    for (const id of ["C2", "C3", "C4"]) {
      expect(isChallengeReachable(id, false)).toBe(false);
    }
  });

  it("opens the rest once it has been sealed", () => {
    for (const id of ["C2", "C3", "C4"]) {
      expect(isChallengeReachable(id, true)).toBe(true);
    }
  });

  it("does not shut them again when an admin reopens Challenge 1", () => {
    // The gate reads "has ever been locked", not "is locked now". A participant being
    // allowed to correct a finding is not being sent back to the beginning — and
    // taking Challenges 2 to 4 away mid-attempt would lose them work.
    expect(isChallengeReachable("C2", true)).toBe(true);
    expect(isChallengeReachable("C1", true)).toBe(true);
  });
});

describe("isChallengeReachable — reopened for Challenge 1 only", () => {
  it("keeps Challenge 1 open, which is the whole point of the grant", () => {
    expect(isChallengeReachable("C1", true, true)).toBe(true);
  });

  it("shuts the other three even though Challenge 1 has been locked before", () => {
    // The opposite situation to the start of an attempt, with the same appearance:
    // not "you have not got there yet" but "you already handed those in".
    for (const id of ["C2", "C3", "C4"]) {
      expect(isChallengeReachable(id, true, true)).toBe(false);
    }
  });

  it("leaves the normal sequence alone when the flag is not set", () => {
    expect(isChallengeReachable("C2", true, false)).toBe(true);
    expect(isChallengeReachable("C2", false, false)).toBe(false);
  });

  it("defaults to the normal sequence when the flag is not passed at all", () => {
    // Every existing caller relies on this, so it is worth pinning down.
    expect(isChallengeReachable("C2", true)).toBe(true);
    expect(isChallengeReachable("C2", false)).toBe(false);
  });
});
