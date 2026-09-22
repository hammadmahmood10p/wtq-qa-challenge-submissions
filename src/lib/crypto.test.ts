import { describe, expect, it } from "vitest";
import { decryptCnic, encryptCnic, hashCnic, safeEqual } from "./crypto";

/**
 * §3.1: the CNIC is stored twice, and each half has to hold up its own property.
 * The hash must be deterministic or the unique index and login-by-CNIC stop working;
 * the ciphertext must not be, or identical CNICs would be identifiable by eye.
 */

describe("hashCnic", () => {
  it("is deterministic — this is what makes the unique index work", () => {
    expect(hashCnic("4210112345678")).toBe(hashCnic("4210112345678"));
  });

  it("normalises first, so formatting cannot create a duplicate account", () => {
    expect(hashCnic("42101-1234567-8")).toBe(hashCnic("4210112345678"));
    expect(hashCnic("42101 1234567 8")).toBe(hashCnic("4210112345678"));
  });

  it("separates different CNICs", () => {
    expect(hashCnic("4210112345678")).not.toBe(hashCnic("4210112345679"));
  });

  it("does not leak the input", () => {
    expect(hashCnic("4210112345678")).not.toContain("4210112345678");
  });
});

describe("encryptCnic / decryptCnic", () => {
  it("round-trips", () => {
    expect(decryptCnic(encryptCnic("4210112345678"))).toBe("4210112345678");
  });

  it("normalises before storing, so display is consistent", () => {
    expect(decryptCnic(encryptCnic("42101-1234567-8"))).toBe("4210112345678");
  });

  it("produces different ciphertext each time, so equal CNICs are not visibly equal", () => {
    expect(encryptCnic("4210112345678")).not.toBe(encryptCnic("4210112345678"));
  });

  it("rejects tampered ciphertext rather than returning wrong data", () => {
    const valid = encryptCnic("4210112345678");
    const bytes = Buffer.from(valid, "base64");
    bytes[bytes.length - 1] ^= 0xff; // corrupt the GCM auth tag
    expect(() => decryptCnic(bytes.toString("base64"))).toThrow();
  });
});

describe("safeEqual", () => {
  it("compares correctly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
