/**
 * Challenge 1's rules: the caps, and what makes a finding count.
 *
 * Deliberately separate from src/lib/challenge1.ts, which touches the database. The
 * drawer components are client components and need these; importing them from a module
 * that also imports Prisma drags the Postgres driver — and its `dns` and `fs` requires
 * — into the browser bundle, where the build fails.
 *
 * Nothing in this file may import anything server-only.
 */

/**
 * Caps, per decision D8.
 *
 * 1000 participants times unlimited free-text drawers is a real payload and abuse
 * surface, and an accidental paste of a 40MB log would otherwise be accepted. Generous
 * enough that nobody working in good faith will meet them.
 */
export const MAX_ENTRIES = 50;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;

/** The four fields that decide whether a finding counts. Evidence is optional. */
export interface Challenge1EntryFields {
  bugTitle: string;
  bugDescription: string;
  testTitle: string;
  testDescription: string;
}

/**
 * A finding counts only when all four parts are written.
 *
 * The organisers' rule: a bug report without its test case, or a title with nothing
 * under it, is not a finding — and an empty drawer someone opened and never filled is
 * certainly not one. Half-written drawers still autosave, because a participant
 * mid-sentence must not lose their text; they simply do not count, and are not handed
 * to a judge.
 *
 * Whitespace does not count as written. Someone who types a space into a title has not
 * reported a bug, and the count on their screen must agree with the count a judge sees.
 */
export function isEntryComplete(entry: Challenge1EntryFields): boolean {
  return (
    entry.bugTitle.trim() !== "" &&
    entry.bugDescription.trim() !== "" &&
    entry.testTitle.trim() !== "" &&
    entry.testDescription.trim() !== ""
  );
}

/**
 * Whether Challenge 1 holds enough to be sealed.
 *
 * Not politeness — it closes a trap. Submitting requires at least one finding with its
 * bug report and test case both written, and a sealed Challenge 1 cannot be edited. A
 * participant who locked after typing a single word would be unable to satisfy that
 * requirement and unable to fix it, stuck until an admin rescued them.
 *
 * The same function decides whether the Lock button is live and whether the server
 * accepts the lock, so the button is never offered for a press that will be refused.
 */
export function canSealChallenge1(entries: Challenge1EntryFields[]): boolean {
  return entries.some(isEntryComplete);
}

/**
 * Whether a challenge other than the first is reachable.
 *
 * Two different rules close Challenges 2 to 4, at opposite ends of an attempt.
 *
 * **Before:** the organisers want the manual testing done before the AI challenges are
 * visible, so Challenge 1 is the only one open at the start. That gate reads
 * `everLocked`, not "is locked now" — a participant whose Challenge 1 a super admin
 * reopened mid-attempt keeps Challenges 2 to 4, because they are being allowed to
 * correct something, not sent back to the start.
 *
 * **After:** a super admin can reopen Challenge 1 on an attempt that was already
 * handed in. Then only Challenge 1 is editable, and the other three are closed because
 * they have been submitted — the opposite situation, the same appearance.
 */
export function isChallengeReachable(
  challengeId: string,
  everLockedChallenge1: boolean,
  reopenedForChallenge1 = false,
): boolean {
  if (challengeId === "C1") return true;
  if (reopenedForChallenge1) return false;
  return everLockedChallenge1;
}

/** Which of the four are still blank, in reading order, for telling someone why. */
export function missingEntryParts(entry: Challenge1EntryFields): string[] {
  const missing: string[] = [];

  if (entry.bugTitle.trim() === "") missing.push("bug title");
  if (entry.bugDescription.trim() === "") missing.push("bug description");
  if (entry.testTitle.trim() === "") missing.push("test case title");
  if (entry.testDescription.trim() === "") missing.push("test case description");

  return missing;
}
