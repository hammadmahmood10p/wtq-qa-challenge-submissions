import { describe, expect, it } from "vitest";
import {
  detectIdentifier,
  formatCnic,
  isJudgeEmail,
  isValidCnic,
  maskCnic,
  normalizeCnic,
  normalizeEmail,
  normalizePhone,
} from "./normalize";

/**
 * D5 is the decision these tests exist to protect.
 *
 * If normalisation drifts, two things break at once and neither is obvious: duplicate
 * detection stops catching the same person registering twice, and participants who
 * type their CNIC or phone in a different format at login than at signup are locked
 * out of their own account — at 10am on event day, with no self-service reset.
 */

describe("normalizeCnic", () => {
  it("reduces every format of the same CNIC to one value", () => {
    const expected = "4210112345678";
    expect(normalizeCnic("42101-1234567-8")).toBe(expected);
    expect(normalizeCnic("4210112345678")).toBe(expected);
    expect(normalizeCnic("42101 1234567 8")).toBe(expected);
    expect(normalizeCnic("  42101-1234567-8  ")).toBe(expected);
  });

  it("rejects anything that is not 13 digits", () => {
    expect(isValidCnic("42101-1234567-8")).toBe(true);
    expect(isValidCnic("421011234567")).toBe(false); // 12
    expect(isValidCnic("42101123456789")).toBe(false); // 14
    expect(isValidCnic("")).toBe(false);
  });

  it("formats and masks for display", () => {
    expect(formatCnic("4210112345678")).toBe("42101-1234567-8");
    expect(maskCnic("4210112345678")).toBe("42101*****678");
  });
});

describe("normalizePhone", () => {
  it("reduces every format of the same number to E.164", () => {
    const expected = "+923001234567";
    expect(normalizePhone("03001234567")).toBe(expected);
    expect(normalizePhone("0300-1234567")).toBe(expected);
    expect(normalizePhone("3001234567")).toBe(expected);
    expect(normalizePhone("+923001234567")).toBe(expected);
    expect(normalizePhone("923001234567")).toBe(expected);
    expect(normalizePhone("00923001234567")).toBe(expected);
    expect(normalizePhone("+92 300 1234567")).toBe(expected);
  });

  it("returns null for numbers it cannot understand", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("02112345678")).toBeNull(); // landline, not a mobile
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Someone@Example.COM ")).toBe("someone@example.com");
  });
});

describe("isJudgeEmail", () => {
  it("accepts the 10Pearls domain in any case", () => {
    expect(isJudgeEmail("judge@10pearls.com")).toBe(true);
    expect(isJudgeEmail("Judge@10Pearls.com")).toBe(true);
  });

  it("rejects other domains, including lookalikes", () => {
    expect(isJudgeEmail("judge@gmail.com")).toBe(false);
    expect(isJudgeEmail("judge@10pearls.com.attacker.io")).toBe(false);
    expect(isJudgeEmail("judge@not10pearls.com")).toBe(false);
  });
});

describe("detectIdentifier", () => {
  it("tells the three identifier types apart from one input box", () => {
    expect(detectIdentifier("someone@example.com")).toEqual({
      kind: "email",
      value: "someone@example.com",
    });
    expect(detectIdentifier("42101-1234567-8")).toEqual({
      kind: "cnic",
      value: "4210112345678",
    });
    expect(detectIdentifier("0300-1234567")).toEqual({
      kind: "phone",
      value: "+923001234567",
    });
  });

  it("does not confuse a 13-digit CNIC with a phone number", () => {
    // The lengths never collide: a CNIC is exactly 13 digits, a Pakistani mobile
    // is 10, 11 or 12 depending on how it is written.
    expect(detectIdentifier("4210112345678")?.kind).toBe("cnic");
    expect(detectIdentifier("923001234567")?.kind).toBe("phone");
    expect(detectIdentifier("+923001234567")?.kind).toBe("phone");
  });

  it("returns null for junk rather than guessing", () => {
    expect(detectIdentifier("")).toBeNull();
    expect(detectIdentifier("   ")).toBeNull();
    expect(detectIdentifier("hello")).toBeNull();
  });
});
