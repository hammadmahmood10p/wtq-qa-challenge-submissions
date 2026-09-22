import { describe, expect, it } from "vitest";
import { UserStatus } from "@/generated/prisma/enums";
import { INVALID_CREDENTIALS, loginRefusalMessage } from "./auth-messages";

describe("loginRefusalMessage", () => {
  it("permits ACTIVE accounts", () => {
    expect(loginRefusalMessage("ACTIVE")).toBeNull();
  });

  /**
   * The failure this guards against: someone adds a status to the schema, forgets the
   * message, and an account silently falls through to a blank or missing explanation
   * on event day. Every non-ACTIVE status must say something useful.
   */
  it("refuses every non-ACTIVE status with a non-empty message", () => {
    const statuses = Object.values(UserStatus).filter((s) => s !== "ACTIVE");
    expect(statuses.length).toBeGreaterThan(0);

    for (const status of statuses) {
      const message = loginRefusalMessage(status);
      expect(message, `no refusal message for ${status}`).toBeTruthy();
      expect(message!.length).toBeGreaterThan(20);
    }
  });

  it("explains pending approval, blocking and post-submission lockout specifically", () => {
    expect(loginRefusalMessage("PENDING_APPROVAL")).toMatch(/approval/i);
    expect(loginRefusalMessage("BLOCKED")).toMatch(/blocked/i);
    expect(loginRefusalMessage("SUBMITTED_LOCKED")).toMatch(/already submitted/i);
  });

  it("does not confirm that a removed account ever existed", () => {
    const removed = loginRefusalMessage("REMOVED");
    expect(removed).not.toMatch(/removed|deleted/i);
  });

  /**
   * The property that matters is ambiguity: the message must cover "no such account"
   * and "wrong password" without indicating which occurred.
   */
  it("keeps the credential failure message ambiguous", () => {
    // Names both possibilities together rather than singling one out.
    expect(INVALID_CREDENTIALS).toMatch(/username or password/i);

    // None of these would be sayable without revealing which branch failed.
    expect(INVALID_CREDENTIALS).not.toMatch(
      /not found|does not exist|doesn't exist|no account|not registered|unregistered|incorrect password|wrong password/i,
    );
  });
});
