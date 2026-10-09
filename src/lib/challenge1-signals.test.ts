import { describe, expect, it } from "vitest";
import { challenge1Signals, signalsFor, type Challenge1SignalInput } from "./challenge1-signals";

/**
 * The expensive mistake here is a false positive. Telling a judge that a good report
 * has no steps costs a participant marks on work that deserved them, so most of these
 * tests are about the rules staying quiet when they should.
 */

/** A finding that does everything the organisers asked for. */
const good: Challenge1SignalInput = {
  bugTitle: "Discount code is ignored on the cart total",
  bugDescription: [
    "Steps to reproduce:",
    "1. Add any item to the cart",
    "2. Open the cart",
    "3. Enter the code WTQ10 and apply it",
    "",
    "Actual result: the total is unchanged and no error is shown.",
    "Expected result: the total should drop by 10%.",
  ].join("\n"),
  testTitle: "A valid discount code reduces the cart total",
  testDescription: [
    "1. Add an item priced at 1000 to the cart",
    "2. Apply the code WTQ10",
    "Expected: the total shows 900.",
  ].join("\n"),
  bugEvidenceCount: 2,
};

const signal = (entry: Partial<Challenge1SignalInput>) =>
  challenge1Signals({ ...good, ...entry }).map((s) => s.key);

describe("challenge1Signals", () => {
  it("says nothing about a finding that has everything", () => {
    expect(challenge1Signals(good)).toEqual([]);
  });

  it("notices when no screenshot is attached", () => {
    expect(signal({ bugEvidenceCount: 0 })).toEqual(["bug-evidence"]);
  });

  it("notices a bug report with no steps", () => {
    expect(
      signal({ bugDescription: "Actual: the total is wrong. Expected: it should be right." }),
    ).toEqual(["bug-steps"]);
  });

  it("notices a bug report with no expected result", () => {
    expect(
      signal({ bugDescription: "1. Open the cart\n2. Apply WTQ10\nActual: nothing happens." }),
    ).toEqual(["bug-expected"]);
  });

  it("notices a bug report with no actual result", () => {
    expect(
      signal({ bugDescription: "1. Open the cart\n2. Apply WTQ10\nExpected: the total drops." }),
    ).toEqual(["bug-actual"]);
  });

  it("notices a test case with no steps and no expected result", () => {
    expect(signal({ testDescription: "The discount works." })).toEqual([
      "test-steps",
      "test-expected",
    ]);
  });

  it("reports several things at once when several are missing", () => {
    expect(signal({ bugDescription: "It is broken.", bugEvidenceCount: 0 })).toEqual([
      "bug-evidence",
      "bug-steps",
      "bug-expected",
      "bug-actual",
    ]);
  });
});

describe("the rules stay quiet on prose that does not look like a template", () => {
  it("accepts steps written as a sentence, with no numbering", () => {
    // Plenty of good testers write this way, and flagging it would be wrong.
    expect(
      signal({
        bugDescription:
          "Open the product page and click Add to cart, then enter WTQ10. Actual: the total does not change. Expected: it should fall by 10%.",
      }),
    ).toEqual([]);
  });

  it("accepts a bulleted list as steps", () => {
    expect(
      signal({
        bugDescription:
          "- Visit the cart\n- Apply WTQ10\nActually nothing changes; it should have dropped.",
      }),
    ).toEqual([]);
  });

  it("accepts one action per line with no numbering at all", () => {
    expect(
      signal({
        testDescription: "Sign in\nFind a product\nPut it in the basket\nThe basket should show 1",
      }),
    ).toEqual([]);
  });

  it("accepts 'should' in place of the word 'expected'", () => {
    expect(
      signal({
        bugDescription: "1. Apply WTQ10\nInstead the total stays the same; it should drop by 10%.",
      }),
    ).toEqual([]);
  });

  it("accepts 'instead' and 'however' in place of the word 'actual'", () => {
    expect(
      signal({ bugDescription: "1. Apply WTQ10\nExpected a discount. However, nothing happened." }),
    ).toEqual([]);
  });

  it("is not fooled by the words appearing in the title alone", () => {
    // The title is not where the detail lives, so a keyword there must not excuse a
    // description that has none of it.
    expect(
      signal({
        bugTitle: "Expected discount not applied — steps to reproduce below",
        bugDescription: "It is broken.",
      })
        // Evidence is unrelated to this point.
        .filter((k) => k !== "bug-evidence"),
    ).toEqual(["bug-steps", "bug-expected", "bug-actual"]);
  });
});

describe("signalsFor", () => {
  it("splits the signals by which half of the finding they belong to", () => {
    const all = challenge1Signals({
      ...good,
      bugEvidenceCount: 0,
      testDescription: "It works.",
    });

    expect(signalsFor(all, "bug").map((s) => s.key)).toEqual(["bug-evidence"]);
    expect(signalsFor(all, "test").map((s) => s.key)).toEqual(["test-steps", "test-expected"]);
  });

  it("returns nothing for a half with nothing to say", () => {
    expect(signalsFor(challenge1Signals(good), "bug")).toEqual([]);
  });
});
