import type { ChallengeKey, ChallengeTrack } from "@/generated/prisma/enums";

/**
 * The four challenge briefings and the questions each one asks.
 *
 * Participants read these under time pressure, so each brief answers the same three
 * questions in the same order: what you are being asked to do, how you will be judged,
 * and what to hand in. Kept as data rather than JSX so the same text appears on the
 * information page, in the workspace tabs and on each submission page without drifting
 * apart.
 *
 * Challenges 1 and 2 are compulsory. Challenges 3 and 4 are alternatives — a
 * participant commits to one, and the other closes.
 */

export interface ChallengeSection {
  heading: string;
  items: string[];
}

export interface ChallengeQuestion {
  /** Stable key, stored in the answers JSON. Never renamed once answers exist. */
  key: string;
  label: string;
  hint?: string;
  required: boolean;
  maxLength: number;
  rows: number;
  placeholder?: string;
}

export interface Challenge {
  id: ChallengeKey;
  number: 1 | 2 | 3 | 4;
  title: string;
  summary: string;
  href: string;
  sections: ChallengeSection[];
  /** Written answers collected on the submission page. */
  questions: ChallengeQuestion[];
  /** Which of the optional pair this is, if either. */
  track?: ChallengeTrack;
  notes?: string[];
}

/**
 * The application under test and the Challenge 4 CSV used to live here as constants,
 * which made supplying them a code change and a redeploy. They are now event
 * configuration a super admin sets from the Overview page, read per request — see
 * src/lib/event-config.ts.
 */

const LONG = 4000;

export const CHALLENGES: Challenge[] = [
  {
    id: "C1",
    number: 1,
    title: "Manual QA",
    summary:
      "Test a deliberately broken e-commerce application, report what you find, and write the test cases that go with it.",
    href: "/challenge/c1",
    sections: [
      {
        heading: "What you are testing",
        items: [
          "You will be given an e-commerce application that contains a number of known defects.",
          "How you test is entirely your choice — exploratory, ad hoc, or something more structured.",
          "Find as many genuine bugs as you can.",
        ],
      },
      {
        heading: "What to submit",
        items: [
          "Report each bug through the submission portal, with a clear title and enough detail for someone else to reproduce it.",
          "Write test cases covering the bugs you identify. These carry forward into your Phase 2 testing checklist, so they are worth writing properly.",
        ],
      },
      {
        heading: "Using AI",
        items: [
          "You may use AI to format a bug report or reword what you have already written.",
          "You may not use AI to find bugs or to write your test cases. That is the part we are assessing.",
        ],
      },
    ],
    questions: [],
  },

  {
    id: "C2",
    number: 2,
    title: "AI-Assisted Application Evaluation",
    summary:
      "Go back over the same application with AI, and compare what it finds against what you found by hand.",
    href: "/challenge/c2",
    sections: [
      {
        heading: "The task",
        items: [
          "Test the same application you used in Challenge 1.",
          "Validate the bugs you found during manual testing.",
          "Use AI to revalidate those known bugs, or to discover new ones — with whatever tools and techniques you are comfortable with.",
        ],
      },
      {
        heading: "What to compare",
        items: [
          "Bugs the AI identified.",
          "Bugs you found manually.",
          "Defects your manual testing missed.",
          "The strengths and the limitations of testing this way.",
        ],
      },
      {
        heading: "What to submit",
        items: [
          "A single PDF containing both your findings report and your comparison of manual against AI.",
          "Answers to the three questions on the submission page.",
        ],
      },
    ],
    questions: [
      {
        key: "approach",
        label: "Which AI tool or technique did you choose, and why?",
        hint: "Name what you used and what made it the right choice for this application.",
        required: true,
        maxLength: LONG,
        rows: 6,
        placeholder: "The tool or technique, and the reasoning behind picking it.",
      },
      {
        key: "process",
        label: "What steps did you follow, and what was your thought process?",
        hint: "Enough detail that someone else could repeat what you did and understand why.",
        required: true,
        maxLength: LONG,
        rows: 8,
        placeholder: "How you went about it, in the order you did it.",
      },
      {
        key: "alternatives",
        label: "What alternatives did you consider but not use, and why not?",
        hint: "What you ruled out matters as much as what you chose.",
        required: true,
        maxLength: LONG,
        rows: 6,
        placeholder: "Other tools or approaches you weighed up, and what decided against them.",
      },
    ],
  },

  {
    id: "C3",
    number: 3,
    title: "AI Chatbot Quality Evaluation",
    summary: "Assess the quality of an AI chatbot and report your findings.",
    href: "/challenge/c3",
    track: "C3",
    sections: [
      {
        heading: "What to evaluate",
        items: [
          "Consistency — does it give the same answer to the same question?",
          "Hallucinations — does it state things that are simply untrue?",
          "Prompt sensitivity — how much does small rewording change the result?",
          "Context handling — does it hold on to what was said earlier?",
          "Accuracy — is it right, and how would you know?",
          "Safety and reliability — how does it behave when pushed?",
          "Model comparison, where more than one is available to you.",
        ],
      },
      {
        heading: "How to approach it",
        items: [
          "Decide on a QA strategy and an evaluation methodology before you start.",
          "Choose whatever tools and techniques suit your approach.",
          "Validate the responses critically — an answer that looks confident is not evidence that it is correct.",
        ],
      },
      {
        heading: "What to submit",
        items: [
          "A PDF containing your observations and the risks you identified, your recommendations, and a final quality assessment.",
          "Answers to the three questions on the submission page.",
        ],
      },
    ],
    questions: [
      {
        key: "strategy",
        label: "What QA strategy and evaluation methodology did you use?",
        hint: "How you decided what to test, and how you judged whether a response was good.",
        required: true,
        maxLength: LONG,
        rows: 8,
        placeholder: "Your strategy, and the methodology you evaluated against.",
      },
      {
        key: "tools",
        label: "Which tools and techniques did you select, and why those?",
        hint: "What you used to run and record the evaluation, and what made them suitable.",
        required: true,
        maxLength: LONG,
        rows: 6,
        placeholder: "The tools and techniques, and your reasoning.",
      },
      {
        key: "validation",
        label: "How did you critically validate the chatbot's responses?",
        hint: "What you checked answers against, and how you separated a confident answer from a correct one.",
        required: true,
        maxLength: LONG,
        rows: 8,
        placeholder: "How you verified the responses rather than taking them at face value.",
      },
    ],
    notes: ["Choosing this challenge earns a +5 bonus, which the judges may adjust on review."],
  },

  {
    id: "C4",
    number: 4,
    title: "AI-Assisted Automation Readiness",
    summary:
      "Turn twenty thin test cases into something automatable, then automate one of them and push it to GitHub.",
    href: "/challenge/c4",
    track: "C4",
    sections: [
      {
        heading: "Transform",
        items: [
          "You start from roughly twenty short test cases, provided as a CSV file.",
          "Expand them into detailed descriptions with preconditions, test data, steps and expected results.",
          "Write the corresponding Gherkin scenarios.",
        ],
      },
      {
        heading: "Think critically",
        items: [
          "Document the assumptions you had to make.",
          "Identify the ambiguities you found in the originals.",
          "Write detailed user stories that support the scenarios in your Gherkin feature files.",
        ],
      },
      {
        heading: "Execute and submit",
        items: [
          "Create a public GitHub repository whose name contains the phrase wtq26 — for example, storeTask-wtq26.",
          "Pick any one of your feature files, automate it, and push both the automation code and the feature file to that repository.",
          "Submit the repository link, together with your thought process and user story, through the portal.",
        ],
      },
    ],
    questions: [
      {
        key: "thought_process",
        label: "What was your thought process in building this automation?",
        hint: "Why you picked that feature file, the assumptions you made, and the ambiguities you had to resolve.",
        required: true,
        maxLength: LONG,
        rows: 8,
        placeholder: "How you approached it, and the decisions you had to make along the way.",
      },
      {
        key: "user_story",
        label: "What is the user story behind the feature file you automated?",
        hint: "The story your Gherkin scenarios serve, with its acceptance criteria.",
        required: true,
        maxLength: LONG,
        rows: 8,
        placeholder: "As a … I want … so that … , with the acceptance criteria.",
      },
    ],
  },
];

/** Compulsory for everyone. */
export const CORE_CHALLENGES = CHALLENGES.filter((c) => !c.track);

/** The pair a participant chooses between. */
export const OPTIONAL_CHALLENGES = CHALLENGES.filter((c) => c.track);

export function challengeById(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id.toLowerCase() === id.toLowerCase());
}

/**
 * Which challenges are open to this participant.
 *
 * Before a choice is made both optional challenges are visible but neither is open;
 * afterwards only the chosen one is. Decided here, and re-checked on the server for
 * every write — the other challenge being greyed out is a courtesy, not the rule.
 */
export function isChallengeOpen(challenge: Challenge, track: ChallengeTrack | null): boolean {
  if (!challenge.track) return true;
  return challenge.track === track;
}
