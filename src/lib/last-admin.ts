/**
 * The one account that must never be removable: the last super admin who can still
 * log in.
 *
 * Super admins can now create each other, which makes this necessary rather than
 * theoretical. Blocking or removing the wrong row when only one is left locks
 * everybody out of the console — no approving judges, no reopening an attempt, no
 * setting the application URL — and the only way back in is a database edit by
 * somebody with server access, on the morning of the event.
 *
 * Kept as a pure predicate so the rule can be tested without a database, and so the
 * question it answers reads the same at every call site.
 */

export interface LastAdminCheck {
  /** The account about to be blocked, removed or demoted. */
  targetRole: "SUPER_ADMIN" | "JUDGE" | "PARTICIPANT";
  targetStatus: string;
  /** Super admins other than the target who are ACTIVE and not soft-deleted. */
  otherActiveSuperAdmins: number;
}

/**
 * True when this action would leave nobody able to administer the event.
 *
 * Only counts a target that is currently able to log in: blocking an already-blocked
 * admin changes nothing, and refusing that would be a confusing obstacle rather than
 * a safeguard.
 */
export function wouldStrandTheEvent({
  targetRole,
  targetStatus,
  otherActiveSuperAdmins,
}: LastAdminCheck): boolean {
  if (targetRole !== "SUPER_ADMIN") return false;
  if (targetStatus !== "ACTIVE") return false;
  return otherActiveSuperAdmins === 0;
}

export const LAST_ADMIN_MESSAGE =
  "This is the only super admin who can still sign in. Create another one first — " +
  "otherwise nobody can administer the event, and getting back in needs database access.";
