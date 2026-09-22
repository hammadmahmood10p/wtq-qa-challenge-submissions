"use server";

import { redirect } from "next/navigation";
import { startAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";

/**
 * Requirement 3: begins the timed run.
 *
 * The only irreversible click before final submission, so the guard against starting
 * twice lives in the database write (see startAttempt), not in the button.
 */
export async function beginChallenge(): Promise<void> {
  const user = await requireRole("PARTICIPANT");
  await startAttempt(user.id);
  redirect("/challenge/run");
}
