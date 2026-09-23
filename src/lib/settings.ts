import "server-only";

import { db } from "@/lib/db";

/**
 * Run-time switches, held in app_settings rather than in the users table.
 *
 * The participant login gate is the interesting one. The obvious implementation —
 * setting a thousand rows to BLOCKED — is wrong in a way that only shows up when you
 * try to undo it: BLOCKED is also what an admin sets on one person for cause, and
 * SUBMITTED_LOCKED is what a finished attempt sets. Once those three meanings are
 * mixed into one column, "turn everyone back on" cannot tell them apart, and the
 * person who was blocked for cause quietly gets their account back.
 *
 * A single flag consulted at login keeps every account's own status intact, is
 * instant either way regardless of roster size, and cannot be half-applied.
 */

export const PARTICIPANT_LOGINS_DISABLED = "participant_logins_disabled";

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Defaults to false: a missing row means logins are open, never closed. */
export async function participantLoginsDisabled(): Promise<boolean> {
  return (await getSetting(PARTICIPANT_LOGINS_DISABLED)) === "true";
}

export async function setParticipantLoginsDisabled(disabled: boolean): Promise<void> {
  await setSetting(PARTICIPANT_LOGINS_DISABLED, disabled ? "true" : "false");
}
