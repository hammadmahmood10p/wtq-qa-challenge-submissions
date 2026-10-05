"use server";

import { redirect } from "next/navigation";
import { getAttempt, startAttempt } from "@/lib/attempt";
import { attemptProgress } from "@/lib/attempt-progress";
import { requireRole } from "@/lib/auth";
import type { Progress } from "@/lib/challenge-progress";

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

/**
 * Progress as it stands right now, for the Submit dialog.
 *
 * The header is rendered once per page load and its `progress` prop ages from that
 * moment: every autosave after it changes what has been finished without the page
 * being re-rendered. A participant who filled in Challenge 3 and pressed Submit was
 * shown the state from whenever they last navigated — Challenges 1 and 2 only — and a
 * refresh "fixed" it, which is the signature of stale props rather than a counting bug.
 *
 * Revalidating the route on every autosave would fix it too, and would be worse: the
 * saves are debounced keystrokes, and re-rendering the page under someone mid-sentence
 * to correct a number they are not looking at is a poor trade. Reading it once, when
 * the dialog opens, costs two queries at the only moment the answer is read.
 */
export async function currentProgress(): Promise<Progress> {
  const user = await requireRole("PARTICIPANT");
  const attempt = await getAttempt(user.id);
  return attemptProgress(attempt.id, attempt.chosenTrack);
}
