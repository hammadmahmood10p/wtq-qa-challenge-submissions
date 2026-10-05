/**
 * Scoring limits the browser needs to know too.
 *
 * Its own file for the same reason attempt-admin-limits.ts is: src/lib/evaluation.ts
 * is `server-only`, and the comment box has to enforce the same ceiling the server
 * does. A number duplicated into a client component is a number that drifts.
 */

/** Long enough for a paragraph of reasoning, short enough to stay a note. */
export const MAX_JUDGE_COMMENT = 2000;

/**
 * Who may write the comment on a submission.
 *
 * Here rather than inline because it is asked twice — once by the table, to decide
 * between a box and a paragraph, and once by the server on every save. Two copies of
 * this rule is two chances for the screen to offer an edit the server then refuses.
 *
 * The holder is whoever holds it *now*. A submission unassigned and picked up by
 * someone else belongs to the new judge, comment included: they are the one answering
 * for it. And a super admin is not an exception — they read it like everyone else,
 * because the column says what the judge who reviewed this thought, and a second hand
 * writing into it under the same name would make it say something else.
 */
export function canCommentOnSubmission({
  holdingJudgeId,
  viewerId,
}: {
  /** The judge currently assigned, or null when it is back in the pool. */
  holdingJudgeId: string | null;
  viewerId: string;
}): boolean {
  return holdingJudgeId !== null && holdingJudgeId === viewerId;
}
