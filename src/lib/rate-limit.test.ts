import { describe, expect, it } from "vitest";
import { LIMITS, accountRateLimitKey } from "./rate-limit";

/**
 * Found on Day 4, from a rate_limits table that had three separate counters for one
 * person: `0300-5555551`, `+923005555551` and `4210155555551`.
 *
 * Keying on the typed string rather than the normalised identity hands an attacker one
 * budget per format they can think of — and this system accepts six ways of naming the
 * same participant. The per-account limit is the real credential-stuffing defence
 * (the per-IP one has to stay loose for venue NAT), so diluting it defeats the point.
 */
describe("accountRateLimitKey", () => {
  it("gives every way of naming one participant the same counter", () => {
    const keys = new Set([
      accountRateLimitKey("0300-5555551"),
      accountRateLimitKey("+923005555551"),
      accountRateLimitKey("923005555551"),
      accountRateLimitKey("03005555551"),
    ]);
    expect(keys.size).toBe(1);
  });

  it("collapses ID card formats to one counter", () => {
    const keys = new Set([
      accountRateLimitKey("42101-5555555-1"),
      accountRateLimitKey("4210155555551"),
      accountRateLimitKey("42101 5555555 1"),
    ]);
    expect(keys.size).toBe(1);
  });

  it("collapses email casing to one counter", () => {
    expect(accountRateLimitKey("Someone@Example.com")).toBe(
      accountRateLimitKey("someone@example.com"),
    );
  });

  it("still separates genuinely different people", () => {
    expect(accountRateLimitKey("0300-5555551")).not.toBe(accountRateLimitKey("0300-5555552"));
    expect(accountRateLimitKey("a@example.com")).not.toBe(accountRateLimitKey("b@example.com"));
  });

  it("gives unrecognised input a counter of its own rather than none", () => {
    expect(accountRateLimitKey("not an identifier")).toMatch(/^login:account:raw:/);
  });

  it("does not put a raw phone number in the key used for an email", () => {
    // Guards against a lazy future refactor that keys everything on the raw string.
    expect(accountRateLimitKey("0300-5555551")).toContain("+92");
  });
});

describe("LIMITS", () => {
  /**
   * All three cities start together and each venue is behind one NAT address, so from
   * the server several hundred people look like one client. A per-IP limit sized for a
   * single user would lock out a whole city at 10am.
   */
  it("keeps the per-IP login allowance large enough for a venue behind one address", () => {
    expect(LIMITS.loginPerIp.limit).toBeGreaterThanOrEqual(200);
  });

  it("keeps the per-account allowance tight, since that is the real defence", () => {
    expect(LIMITS.loginPerAccount.limit).toBeLessThanOrEqual(15);
  });

  it("is stricter per account than per address", () => {
    expect(LIMITS.loginPerAccount.limit).toBeLessThan(LIMITS.loginPerIp.limit);
  });
});
