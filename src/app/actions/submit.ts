"use server";

import { getAttempt } from "@/lib/attempt";
import { finalizeAttempt } from "@/lib/attempt-submit";
import { requireRole } from "@/lib/auth";

export interface SubmitResult {
  ok: boolean;
  /** True when this call did the sealing; false when it was already closed. */
  sealed?: boolean;
  error?: string;
}

/**
 * Requirement 5: submits everything, once.
 *
 * It does not redirect. The client navigates itself, so it can first tell the
 * participant's other tabs that the attempt is over — those tabs are already showing
 * a running clock and a live form, and leaving them that way for up to a minute until
 * the next poll would be alarming.
 *
 * Nothing is validated before sealing. Whatever was saved is what gets submitted,
 * including nothing at all: refusing an empty submission would trap a participant who
 * ran out of time on a page they cannot leave.
 */
export async function submitEverything(): Promise<SubmitResult> {
  const user = await requireRole("PARTICIPANT");

  try {
    const attempt = await getAttempt(user.id);

    if (attempt.state === "NOT_STARTED") {
      return { ok: false, error: "You have not started the challenge yet." };
    }

    // Already sealed — by the clock, or by another tab a moment ago. Reported as
    // success: the participant asked for it to be submitted, and it is.
    if (attempt.state !== "IN_PROGRESS") {
      return { ok: true, sealed: false };
    }

    const result = await finalizeAttempt(user.id, { auto: false });
    return { ok: true, sealed: result.changed };
  } catch (error) {
    console.error("[submit]", error);
    return {
      ok: false,
      error: "Something went wrong submitting your work. Please try again.",
    };
  }
}
