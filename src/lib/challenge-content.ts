/**
 * The three challenge briefings, rewritten from the event brief.
 *
 * Participants read these under time pressure, so each one answers three questions in
 * the same order: what you are being asked to do, how you will be judged, and what to
 * hand in. Kept as data rather than JSX so the same text can appear on the information
 * page, inside the workspace tabs, and on each submission page without drifting apart.
 */

export interface ChallengeSection {
  heading: string;
  items: string[];
}

export interface Challenge {
  id: "c1" | "c2" | "c3";
  number: 1 | 2 | 3;
  title: string;
  summary: string;
  /** Route of the submission page, opened in a new browser tab. */
  href: string;
  submitLabel: string;
  sections: ChallengeSection[];
  notes?: string[];
}

/**
 * Placeholder until the organisers supply the real link (Q8). Deliberately obvious:
 * if this ever reaches a participant, it should be unmistakable rather than a
 * plausible-looking dead URL.
 */
export const APPLICATION_UNDER_TEST_URL: string | null = null;
export const CHALLENGE3_CSV_URL: string | null = null;

export const CHALLENGES: Challenge[] = [
  {
    id: "c1",
    number: 1,
    title: "Manual QA",
    summary:
      "Test a deliberately broken e-commerce application, report what you find, and write the test cases that go with it.",
    href: "/challenge/c1",
    submitLabel: "Open Challenge 1 submission",
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
  },
  {
    id: "c2",
    number: 2,
    title: "AI Chatbot Quality Evaluation",
    summary:
      "Assess the quality of an AI chatbot and report your findings as a PDF. Worth a +5 bonus.",
    href: "/challenge/c2",
    submitLabel: "Open Challenge 2 submission",
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
          "A single PDF containing your observations and the risks you identified.",
          "Your recommendations.",
          "A final quality assessment.",
        ],
      },
    ],
    notes: ["Completing this challenge successfully earns a +5 bonus."],
  },
  {
    id: "c3",
    number: 3,
    title: "AI-Assisted Automation Readiness",
    summary:
      "Turn twenty thin test cases into something automatable, then automate one of them and push it to GitHub.",
    href: "/challenge/c3",
    submitLabel: "Open Challenge 3 submission",
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
          "Submit the repository link, along with your thought process and user story, through the portal.",
        ],
      },
    ],
  },
];

export function challengeById(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
