/**
 * Quiet quality signals on a Challenge 1 finding, for the judge's eye only.
 *
 * The organisers' standard for a finding is fixed: a bug report carries a title, steps
 * to reproduce, the actual result, the expected result and evidence; a test case
 * carries a title, steps to execute and an expected result. A judge marking two
 * hundred findings in an afternoon will apply that standard unevenly by the end of it,
 * not through carelessness but because nobody holds a checklist in their head for four
 * hours.
 *
 * So this reads each finding and says what it could not find. Three rules keep it
 * honest:
 *
 *   1. **It reports absence, never quality.** "No steps found" is a fact about the
 *      text. "Poorly written" would be a judgement, and the judgement is the judge's.
 *   2. **It never scores.** Nothing here reaches the rubric, the total, or the
 *      participant's result. A judge who disagrees ignores it and moves on.
 *   3. **It errs towards saying nothing.** A false "no evidence attached" on a report
 *      that has evidence would cost a participant marks, so every rule below is
 *      deliberately generous. Missing a weak report is a cost worth paying to never
 *      accuse a good one.
 *
 * Participants never see any of this. Challenge 1 measures unaided work, and a live
 * checklist telling someone their report has no expected result is coaching.
 *
 * Nothing here imports anything server-only: it is a pure function over text, which is
 * also what makes it testable without a database.
 */

export interface Challenge1SignalInput {
  bugTitle: string;
  bugDescription: string;
  testTitle: string;
  testDescription: string;
  /** How many screenshots are attached against the bug report. */
  bugEvidenceCount: number;
}

export interface Challenge1Signal {
  key: string;
  /** What is missing, in the judge's words rather than the schema's. */
  label: string;
  /** Which half of the finding it belongs to. */
  part: "bug" | "test";
}

/**
 * Words that mean somebody is describing a sequence of actions.
 *
 * Generous on purpose. "Open the cart, apply the code, look at the total" has no
 * numbered list and no word "step" in it, but it is plainly steps — so the verbs count
 * too, and any numbered or bulleted list counts regardless of its wording.
 */
const STEP_WORDS =
  /\b(step|steps|reproduce|reproduction|repro|navigate|click|tap|open|go to|select|enter|type|login|log in|add to cart|checkout|search|scroll|press|submit)\b/i;

/** A numbered or bulleted list, in any of the forms people actually type. */
const LIST_SHAPE = /(^|\n)\s*(\d+[.)]\s|[-*•]\s)/;

// "should" on its own, rather than "should" followed by one of a handful of verbs.
// The narrower version flagged "the total should drop by 10%" as having no expected
// result, which is the exact false positive these rules exist to avoid.
const EXPECTED_WORDS = /\b(expected|expect|should|ought to|must)\b/i;
const ACTUAL_WORDS = /\b(actual|actually|instead|but it|however|observed|result(?:s|ed)? in)\b/i;

/** Whether the text reads as a sequence of actions rather than a single sentence. */
function describesSteps(text: string): boolean {
  if (LIST_SHAPE.test(text)) return true;
  if (STEP_WORDS.test(text)) return true;

  // Several short lines is the other shape steps take — one action per line, no
  // numbering. Two lines is a sentence that wrapped; four is a procedure.
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  return lines.length >= 4;
}

/**
 * What this finding appears to be missing. An empty array means nothing stood out.
 *
 * Only complete findings reach a judge, so emptiness is not checked here — a blank
 * field would have been filtered out long before this.
 */
export function challenge1Signals(entry: Challenge1SignalInput): Challenge1Signal[] {
  const signals: Challenge1Signal[] = [];
  const bug = entry.bugDescription;

  // The one certainty on the page: we counted the attachments, so this is a fact
  // rather than a guess about prose.
  if (entry.bugEvidenceCount === 0) {
    signals.push({ key: "bug-evidence", label: "No evidence attached", part: "bug" });
  }

  if (!describesSteps(bug)) {
    signals.push({ key: "bug-steps", label: "No steps to reproduce found", part: "bug" });
  }

  if (!EXPECTED_WORDS.test(bug)) {
    signals.push({ key: "bug-expected", label: "No expected result found", part: "bug" });
  }

  if (!ACTUAL_WORDS.test(bug)) {
    signals.push({ key: "bug-actual", label: "No actual result found", part: "bug" });
  }

  const test = entry.testDescription;

  if (!describesSteps(test)) {
    signals.push({ key: "test-steps", label: "No steps to execute found", part: "test" });
  }

  if (!EXPECTED_WORDS.test(test)) {
    signals.push({ key: "test-expected", label: "No expected result found", part: "test" });
  }

  return signals;
}

/** The signals for one half of a finding, for rendering beside it. */
export function signalsFor(signals: Challenge1Signal[], part: "bug" | "test"): Challenge1Signal[] {
  return signals.filter((signal) => signal.part === part);
}
