import { describe, expect, it } from "vitest";
import { formatRemaining, phaseFor } from "./use-countdown";

const MIN = 60_000;

/**
 * The countdown is the most emotionally charged element in the product, and the
 * thresholds are a promise: a participant learns after the first warning that the
 * colour means something. Getting a boundary wrong shifts every later warning.
 */
describe("phaseFor", () => {
  it("stays calm for most of the run", () => {
    expect(phaseFor(180 * MIN)).toBe("calm");
    expect(phaseFor(31 * MIN)).toBe("calm");
  });

  it("changes phase exactly at 30, 10 and 5 minutes", () => {
    expect(phaseFor(30 * MIN)).toBe("caution");
    expect(phaseFor(30 * MIN + 1)).toBe("calm");

    expect(phaseFor(10 * MIN)).toBe("warning");
    expect(phaseFor(10 * MIN + 1)).toBe("caution");

    expect(phaseFor(5 * MIN)).toBe("critical");
    expect(phaseFor(5 * MIN + 1)).toBe("warning");
  });

  it("is critical through the final minute and expired at zero", () => {
    expect(phaseFor(60_000)).toBe("critical");
    expect(phaseFor(1)).toBe("critical");
    expect(phaseFor(0)).toBe("expired");
    // Clock skew can briefly produce a negative remainder.
    expect(phaseFor(-5_000)).toBe("expired");
  });
});

describe("formatRemaining", () => {
  it("always shows hours, minutes and seconds", () => {
    expect(formatRemaining(3 * 60 * MIN)).toBe("03:00:00");
    expect(formatRemaining(59 * 1000)).toBe("00:00:59");
    expect(formatRemaining(0)).toBe("00:00:00");
  });

  it("does not go negative past the deadline", () => {
    expect(formatRemaining(-10_000)).toBe("00:00:00");
  });

  it("floors rather than rounds, so it never shows more time than remains", () => {
    // 59.9s must read 00:00:59, not 00:01:00 — the last second should not
    // flatter the participant.
    expect(formatRemaining(59_900)).toBe("00:00:59");
  });
});
