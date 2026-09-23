import { MessageSquareText } from "lucide-react";
import type { ChallengeQuestion } from "@/lib/challenge-content";

/**
 * A participant's written answers, as a judge reads them.
 *
 * Answers render in a pre block: participants write steps, lists and indentation, and
 * reflowing that destroys the structure they intended. An unanswered required question
 * is called out rather than left blank, because "they did not answer this" is part of
 * what the Mandatory Fields criterion is scoring.
 */
export function AnswersReadOnly({
  questions,
  answers,
}: {
  questions: ChallengeQuestion[];
  answers: Record<string, string>;
}) {
  if (questions.length === 0) return null;

  return (
    <section className="space-y-4">
      <h3 className="font-display flex items-center gap-2 text-sm font-semibold">
        <MessageSquareText size={15} className="text-violet" />
        Written answers
      </h3>

      {questions.map((question) => {
        const answer = (answers[question.key] ?? "").trim();

        return (
          <div
            key={question.key}
            className="border-border bg-surface rounded-(--radius-card) border p-4"
          >
            <p className="text-sm font-medium">{question.label}</p>

            {answer ? (
              <pre className="text-muted mt-2.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                {answer}
              </pre>
            ) : (
              <p className="text-warning-strong mt-2.5 text-sm italic">
                {question.required ? "Not answered — this was a required question." : "Not answered."}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
