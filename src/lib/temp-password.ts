import { randomInt } from "node:crypto";

/**
 * Generates a temporary password for an admin-issued reset.
 *
 * There is no email service (your decision on D-password-reset), so this password is
 * read off a screen and spoken or typed to someone — probably at 10:05 on event day,
 * possibly over a noisy hall. So it avoids characters that are ambiguous out loud or
 * on screen: no O/0, no I/l/1, no punctuation to describe.
 *
 * It is deliberately not memorable-word-based: the account is forced to change it at
 * next login, so it only has to survive one use.
 */
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, O
const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l, o
const DIGITS = "23456789"; // no 0, 1

const GROUPS = [UPPER, LOWER, DIGITS];
const LENGTH = 12; // comfortably over the 10-character policy minimum

export function generateTempPassword(): string {
  // One from each group first, so the result always satisfies the password policy
  // rather than satisfying it by luck.
  const chars = GROUPS.map((group) => group[randomInt(group.length)]);

  const all = GROUPS.join("");
  while (chars.length < LENGTH) {
    chars.push(all[randomInt(all.length)]);
  }

  // Fisher-Yates, so the guaranteed characters are not always in the first positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

/** Groups of four, easier to read aloud: `A7bK-m3Pq-rT9x`. */
export function formatTempPassword(password: string): string {
  return password.replace(/(.{4})(?=.)/g, "$1-");
}
