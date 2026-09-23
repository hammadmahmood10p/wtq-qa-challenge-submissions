import type { UserStatus } from "@/generated/prisma/enums";

/**
 * Deliberately identical for "no such account" and "wrong password".
 *
 * Signup tells you when an identifier is already taken, because you cannot complete
 * the form otherwise. Login makes the opposite choice: with 1000 CNICs in a
 * predictable numeric format, a login that distinguished the two cases would be a
 * membership oracle for anyone willing to iterate.
 */
export const INVALID_CREDENTIALS = "Incorrect username or password. Please try again.";

const FALLBACK =
  "Your account is not currently active. Please contact the Women Tech Quest organising team.";

/**
 * Why an otherwise-valid account cannot sign in.
 *
 * Only ever shown *after* the password has been verified. Someone who knows the
 * password already knows the account exists, so nothing is leaked — and a judge
 * waiting on approval needs to be told why, rather than left assuming their signup
 * silently failed.
 *
 * REMOVED is absent on purpose: a removed account gets the generic fallback, because
 * confirming "this account was deleted" tells an outsider it once existed.
 */
const STATUS_MESSAGES: Partial<Record<UserStatus, string>> = {
  PENDING_APPROVAL:
    "Your judge account is still awaiting super admin approval. You will be able to log in once it is approved.",
  BLOCKED: "Your account has been blocked. Please contact the Women Tech Quest organising team.",
  SUBMITTED_LOCKED:
    "You have already submitted your challenges. Thank you for taking part — your account is now closed.",
};

/** Returns null when the status permits login. */
export function loginRefusalMessage(status: UserStatus): string | null {
  if (status === "ACTIVE") return null;
  return STATUS_MESSAGES[status] ?? FALLBACK;
}

/**
 * Shown when a super admin has closed participant logins for everyone.
 *
 * Phrased as a state of the event rather than a state of the account, because that is
 * what it is — nothing is wrong with the person reading it, and telling them their
 * account is blocked would send them to the help desk for no reason.
 */
export const PARTICIPANT_LOGINS_CLOSED =
  "Participant logins are closed at the moment. Please check with the Women Tech Quest organising team.";
