import { describe, expect, it } from "vitest";
import { isEntryComplete, missingEntryParts } from "./challenge1-limits";

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
