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

/** Which of the four are still blank, in reading order, for telling someone why. */
export function missingEntryParts(entry: Challenge1EntryFields): string[] {
  const missing: string[] = [];

  if (entry.bugTitle.trim() === "") missing.push("bug title");
  if (entry.bugDescription.trim() === "") missing.push("bug description");
  if (entry.testTitle.trim() === "") missing.push("test case title");
  if (entry.testDescription.trim() === "") missing.push("test case description");

  return missing;
}
