import type { ChallengeKey, ChallengeTrack } from "@/generated/prisma/enums";

/**
 * The scoring rubric — the single source of truth for what can be scored and what it
 * is worth.
 *
 * Judges enter a score per criterion rather than one number per challenge. With a
 * panel working through submissions in an afternoon, named criteria with their own
 * maximums are what keep two judges' 25-out-of-30 meaning roughly the same thing.
 *
 * Changing a maximum here changes what new scores may be, but never what an already
 * submitted evaluation is worth: totalScore is frozen at final submission precisely so
 * a late rubric change cannot rewrite a result.
 */

export interface Criterion {
  /** Stable key, stored in the database. Never renamed once scores exist. */
  key: string;
  label: string;
  /** Shown under the label where the criterion needs explaining. */
  hint?: string;
  max: number;
}

export interface ChallengeRubric {
  challenge: ChallengeKey;
  title: string;
  criteria: Criterion[];
}

export const RUBRIC: ChallengeRubric[] = [
  {
    challenge: "C1",
    title: "Manual QA",
    criteria: [
      { key: "c1.bug_hunting", label: "Bug Hunting", hint: "How much they found, and how significant it was", max: 10 },
      { key: "c1.bug_reporting", label: "Bug Reporting", hint: "Clarity, reproducibility and usefulness of the reports", max: 10 },
      { key: "c1.test_cases", label: "Test Cases", hint: "Coverage and quality of the cases written", max: 10 },
    ],
  },
  {
    challenge: "C2",
    title: "AI-Assisted Application Evaluation",
    criteria: [
      { key: "c2.tasks", label: "Tasks", hint: "Revalidation of known bugs and discovery of new ones using AI", max: 10 },
      { key: "c2.comparison", label: "Comparison", hint: "Depth of the manual-versus-AI comparison", max: 10 },
      { key: "c2.mandatory_fields", label: "Mandatory Fields", hint: "Approach, thought process and alternatives considered", max: 10 },
    ],
  },
  {
    challenge: "C3",
    title: "AI Chatbot Quality Evaluation",
    criteria: [
      { key: "c3.evaluate", label: "Evaluate", hint: "Consistency, hallucinations, prompt sensitivity, context handling, accuracy, safety and reliability", max: 20 },
      { key: "c3.approach", label: "Approach", hint: "QA strategy, methodology, tooling and critical validation", max: 20 },
    ],
  },
  {
    challenge: "C4",
    title: "AI-Assisted Automation Readiness",
    criteria: [
      { key: "c4.automation", label: "Automation", hint: "The feature file automated and pushed to the repository", max: 30 },
      { key: "c4.thinking", label: "Thought Process and User Story", hint: "Reasoning, assumptions and the user story submitted", max: 10 },
    ],
  },
];

/**
 * The bonus for committing to Challenge 3.
 *
 * Granted the moment a participant chooses that track, then adjustable by the judge or
 * a super admin. Signed on purpose: where the work does not justify it, the same field
 * can take it away rather than merely withhold it.
 */
/**
 * The Challenge 3 bonus: five points a participant already holds.
 *
 * It is granted by *choosing* Challenge 3, not by a judge deciding to award it. By the
 * time anyone is marking, the five points are already on the participant's score, and
 * the only question in front of the judge is whether to take them away.
 *
 * That is why there are two values and not a range, and why they are 5 and 0 rather
 * than +5 and -5. "Withdrawn" means the participant keeps their criterion marks and
 * loses the bonus; it has never meant a five-point penalty on top.
 *
 * The buttons are labelled +5 and −5 because those describe the *movement* a judge is
 * making, which is what they are thinking about. The stored value is the state that
 * movement arrives at.
 */
export const BONUS_GRANTED = 5;
export const BONUS_WITHDRAWN = 0;

/** How much is at stake, for labels. */
export const BONUS_AMOUNT = BONUS_GRANTED;

/** Kept for the participant-facing copy, which advertises the bonus before judging. */
export const BONUS_DEFAULT = BONUS_GRANTED;

export const BONUS_VALUES = [BONUS_GRANTED, BONUS_WITHDRAWN] as const;

export type BonusValue = (typeof BONUS_VALUES)[number];

export function isBonusValue(value: number): value is BonusValue {
  return (BONUS_VALUES as readonly number[]).includes(value);
}

export function rubricFor(challenge: ChallengeKey): ChallengeRubric {
  const rubric = RUBRIC.find((r) => r.challenge === challenge);
  if (!rubric) throw new Error(`No rubric for ${challenge}`);
  return rubric;
}

export function criterionByKey(key: string): Criterion | undefined {
  return RUBRIC.flatMap((r) => r.criteria).find((c) => c.key === key);
}

/**
 * Which challenges a given attempt should be scored against.
 *
 * Challenges 1 and 2 always; then whichever of 3 or 4 the participant committed to.
 * A participant who committed to neither is scored on the first two alone — they
 * cannot be marked down for a challenge that was never open to them.
 */
export function scorableChallenges(track: ChallengeTrack | null): ChallengeKey[] {
  const base: ChallengeKey[] = ["C1", "C2"];
  return track ? [...base, track] : base;
}

/**
 * What a submission is marked out of. Always 100, whichever track was taken.
 *
 * The bonus is deliberately *not* in here. It used to be, which made a Challenge 3
 * participant's score read as 88/105 while a Challenge 4 participant's read as 88/100 —
 * two different scales for the same event, and an answer to "what did they get out of"
 * that depended on a choice made three hours earlier.
 *
 * Both tracks' criteria sum to exactly 100 (30 + 30 + 40), so the denominator is the
 * same for everyone and the bonus shows for what it is: five points on top. A
 * Challenge 3 participant who keeps it and scores full marks reads 105/100, which is
 * unusual-looking and correct — it says they did everything and took the harder route.
 */
export function maxScoreFor(track: ChallengeTrack | null): number {
  return scorableChallenges(track)
    .flatMap((c) => rubricFor(c).criteria)
    .reduce((sum, criterion) => sum + criterion.max, 0);
}

export function isComplete(track: ChallengeTrack | null, scored: Set<string>): boolean {
  return scorableChallenges(track)
    .flatMap((c) => rubricFor(c).criteria)
    .every((criterion) => scored.has(criterion.key));
}

/** Sums the criteria plus any bonus. Used live while judging and frozen on submit. */
export function computeTotal(
  scores: Map<string, number>,
  track: ChallengeTrack | null,
  bonus: number | null,
): number {
  const fromCriteria = scorableChallenges(track)
    .flatMap((c) => rubricFor(c).criteria)
    .reduce((sum, criterion) => sum + (scores.get(criterion.key) ?? 0), 0);

  return fromCriteria + (track === "C3" ? (bonus ?? 0) : 0);
}
