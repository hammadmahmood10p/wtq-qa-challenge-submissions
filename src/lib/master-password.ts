import "server-only";

import { cache } from "react";
import { getSetting, setSetting } from "@/lib/settings";
import { hashPassword, verifyPassword } from "@/lib/password";

/**
 * A single password that opens any participant or judge account.
 *
 * It exists for one situation the organisers described: someone arrives without their
 * ID card and cannot remember the number, so cannot work out the password that was
 * derived from it, and there is a queue behind her.
 *
 * It is, unavoidably, a master key. Anyone who learns it can sign in as any
 * participant — read their work, or submit on their behalf — from anywhere, for as
 * long as it is switched on. So the design is shaped entirely around limiting that:
 *
 *   - It is **off** until someone turns it on, and turning it on is one click to undo.
 *   - It never opens a **super admin** account. A leaked master password must not be
 *     able to become control of the event.
 *   - It does not bypass anything else. A blocked account stays blocked, a submitted
 *     participant stays locked out, and closed logins stay closed — it substitutes for
 *     the password and for nothing else.
 *   - Every use is recorded as its own audit action, naming the account opened, so
 *     "who used this and on whose account" is answerable afterwards.
 *   - It is stored as an Argon2 hash like any other password, so the database does not
 *     hold a readable key to every account in the event.
 *
 * The safer tool for the same problem already exists: a super admin can look someone
 * up and read their derived password back to them, or issue a temporary one. This is
 * for when a queue makes that too slow.
 */

export const MASTER_PASSWORD_HASH = "master_password_hash";
export const MASTER_PASSWORD_ENABLED = "master_password_enabled";

/** Long enough that it is not guessed, short enough to read out over a hall. */
export const MASTER_PASSWORD_MIN = 12;

export interface MasterPasswordState {
  /** Whether a password has ever been set. */
  isSet: boolean;
  /** Whether it will currently be accepted at the login form. */
  enabled: boolean;
}

export const masterPasswordState = cache(async (): Promise<MasterPasswordState> => {
  const [hash, enabled] = await Promise.all([
    getSetting(MASTER_PASSWORD_HASH),
    getSetting(MASTER_PASSWORD_ENABLED),
  ]);

  return {
    isSet: Boolean(hash?.trim()),
    // Enabled only when a password exists to enable: a flag on its own must never
    // leave the login form checking an empty credential.
    enabled: Boolean(hash?.trim()) && enabled === "true",
  };
});

export async function setMasterPassword(password: string): Promise<void> {
  await setSetting(MASTER_PASSWORD_HASH, await hashPassword(password));
}

export async function clearMasterPassword(): Promise<void> {
  await Promise.all([
    setSetting(MASTER_PASSWORD_HASH, ""),
    setSetting(MASTER_PASSWORD_ENABLED, "false"),
  ]);
}

export async function setMasterPasswordEnabled(enabled: boolean): Promise<void> {
  await setSetting(MASTER_PASSWORD_ENABLED, enabled ? "true" : "false");
}

/**
 * Whether this attempt is the master password being used on an account it may open.
 *
 * Read fresh rather than through the request cache: a super admin switching this off
 * mid-event is doing it because something is wrong, and it has to take effect on the
 * very next attempt rather than at the end of some cache window.
 */
export async function isMasterPassword(
  role: "SUPER_ADMIN" | "JUDGE" | "PARTICIPANT",
  password: string,
): Promise<boolean> {
  // The line that keeps a leak survivable.
  if (role === "SUPER_ADMIN") return false;

  const [hash, enabled] = await Promise.all([
    getSetting(MASTER_PASSWORD_HASH),
    getSetting(MASTER_PASSWORD_ENABLED),
  ]);

  if (!hash?.trim() || enabled !== "true") return false;

  return verifyPassword(hash, password);
}

/** Returns the reason a proposed master password is unacceptable, or null. */
export function masterPasswordProblem(password: string): string | null {
  const trimmed = password.trim();

  if (trimmed.length === 0) return "Enter a master password.";
  if (trimmed !== password) return "The master password cannot start or end with a space.";

  if (password.length < MASTER_PASSWORD_MIN) {
    return `The master password must be at least ${MASTER_PASSWORD_MIN} characters. It opens every participant and judge account.`;
  }

  return null;
}
