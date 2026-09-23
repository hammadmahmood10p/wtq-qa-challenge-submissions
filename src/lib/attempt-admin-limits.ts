/**
 * The rules around reopening an attempt, with no server dependencies.
 *
 * Kept apart from attempt-admin.ts, which is `server-only` and pulls in the database
 * and the storage adapter. The admin console needs these to fill in and validate its
 * own form, and importing them from there would drag `pg` into the browser bundle —
 * the same split as challenge1-limits.ts, for the same reason.
 */

export const MIN_REOPEN_MINUTES = 5;
export const MAX_REOPEN_MINUTES = 240;

/**
 * Offered when there is nothing sensible to restore — an attempt that ran out of time
 * rather than being submitted early had, by definition, nothing left on its clock.
 */
export const FALLBACK_REOPEN_MINUTES = 30;

/**
 * What was left on the clock when the attempt sealed, in whole minutes.
 *
 * This is the number the admin is offered when handing an attempt back, so it is
 * deliberately conservative at the edges. Null means "there is nothing to restore":
 * either the attempt never ran, or it ran out of time rather than being submitted
 * early, and in both cases the admin has to decide how long this person actually
 * needs rather than being handed a figure that looks authoritative and means nothing.
 *
 * A sub-minute remainder rounds up to 1 rather than down to 0, because 0 is not a
 * grant anyone would intend to make.
 */
export function remainingMinutesAtSubmit(attempt: {
  endsAt: Date | null;
  submittedAt: Date | null;
}): number | null {
  if (!attempt.endsAt || !attempt.submittedAt) return null;

  const ms = attempt.endsAt.getTime() - attempt.submittedAt.getTime();
  if (ms <= 0) return null;

  return Math.max(1, Math.round(ms / 60_000));
}
