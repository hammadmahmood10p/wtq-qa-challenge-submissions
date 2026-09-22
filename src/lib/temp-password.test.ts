import { describe, expect, it } from "vitest";
import { formatTempPassword, generateTempPassword } from "./temp-password";
import { passwordSchema } from "./validation/auth";

describe("generateTempPassword", () => {
  /**
   * Generated 200 times because the failure mode is probabilistic: a generator that
   * picks freely from the alphabet satisfies the policy *most* of the time, and the
   * one that does not lands on an admin at 10:05 on event day with a password the
   * system then refuses.
   */
  it("always satisfies the password policy", () => {
    for (let i = 0; i < 200; i++) {
      const result = passwordSchema.safeParse(generateTempPassword());
      expect(result.success, `failed policy: ${generateTempPassword()}`).toBe(true);
    }
  });

  it("omits characters that are ambiguous spoken aloud or on screen", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).not.toMatch(/[O0Il1]/);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 200 }, generateTempPassword));
    expect(seen.size).toBe(200);
  });

  it("does not always place the guaranteed characters in the same positions", () => {
    // Without the shuffle, position 0 would be uppercase every time.
    const firstChars = new Set(Array.from({ length: 100 }, () => generateTempPassword()[0]));
    const allUppercase = [...firstChars].every((c) => /[A-Z]/.test(c));
    expect(allUppercase).toBe(false);
  });
});

describe("formatTempPassword", () => {
  it("groups in fours without a trailing separator", () => {
    expect(formatTempPassword("A7bKm3PqrT9x")).toBe("A7bK-m3Pq-rT9x");
  });
});
