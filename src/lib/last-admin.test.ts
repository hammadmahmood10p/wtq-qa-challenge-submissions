import { describe, expect, it } from "vitest";
import { wouldStrandTheEvent } from "./last-admin";

const check = (over: Partial<Parameters<typeof wouldStrandTheEvent>[0]> = {}) =>
  wouldStrandTheEvent({
    targetRole: "SUPER_ADMIN",
    targetStatus: "ACTIVE",
    otherActiveSuperAdmins: 0,
    ...over,
  });

describe("wouldStrandTheEvent", () => {
  it("refuses the last super admin who can still sign in", () => {
    expect(check()).toBe(true);
  });

  it("allows it once somebody else can administer the event", () => {
    expect(check({ otherActiveSuperAdmins: 1 })).toBe(false);
    expect(check({ otherActiveSuperAdmins: 5 })).toBe(false);
  });

  it("does not stand in the way of judges or participants", () => {
    // Removing the last judge is a perfectly reasonable thing to do; it does not
    // lock anybody out of the console.
    expect(check({ targetRole: "JUDGE" })).toBe(false);
    expect(check({ targetRole: "PARTICIPANT" })).toBe(false);
  });

  it("allows an admin who already cannot sign in to be removed", () => {
    // Blocking an already-blocked admin changes nothing, so refusing it would be an
    // obstacle rather than a safeguard — and it would make a blocked account
    // impossible to tidy away.
    for (const status of ["BLOCKED", "REMOVED", "PENDING_APPROVAL"]) {
      expect(check({ targetStatus: status })).toBe(false);
    }
  });

  it("counts only the others, never the target itself", () => {
    // The caller excludes the target from the count; with one other active admin the
    // action is safe even though the target is active too.
    expect(check({ targetStatus: "ACTIVE", otherActiveSuperAdmins: 1 })).toBe(false);
  });
});
