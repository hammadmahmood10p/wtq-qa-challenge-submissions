"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveChallengeAnswer } from "@/app/actions/challenge-submission";
import { Alert } from "@/components/ui/alert";
import { inputClasses } from "@/components/ui/field";
import type { ChallengeKey } from "@/generated/prisma/enums";
import type { ChallengeQuestion } from "@/lib/challenge-content";
import { cn } from "@/lib/utils";
import { SaveIndicator, type SaveState } from "./save-indicator";

const AUTOSAVE_DELAY_MS = 900;

/**
 * The written answers a challenge asks for.
 *
 * Each question autosaves independently, on the same debounce as Challenge 1's
 * drawers, so a long answer costs one write rather than one per keystroke.
 *
 * Required questions are marked and counted, but never block a save. A participant who
 * has written two of three answers must keep both, and the clock submits for them
 * regardless (D1) — so refusing to save would only punish the people who finish early
 * enough to press the button themselves.
 */
export function ChallengeAnswers({
  challenge,
  questions,
  initialAnswers,
}: {
  challenge: ChallengeKey;
  questions: ChallengeQuestion[];
  initialAnswers: Record<string, string>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const question of questions) seeded[question.key] = initialAnswers[question.key] ?? "";
    return seeded;
  });

  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState<string | null>(null);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, string>());

  useEffect(() => {
    const queued = timers.current;
    return () => queued.forEach(clearTimeout);
  }, []);

  const flush = useCallback(
    async (key: string) => {
      const value = pending.current.get(key);
      if (value === undefined) return;

      pending.current.delete(key);
      clearTimeout(timers.current.get(key));
      timers.current.delete(key);

      setStates((prev) => ({ ...prev, [key]: "saving" }));
      const result = await saveChallengeAnswer(challenge, key, value);

      if (result.closed) {
        router.refresh();
        return;
      }

      if (!result.ok) {
        setStates((prev) => ({ ...prev, [key]: "error" }));
        setError(result.error ?? "Could not save. Please try again.");
        pending.current.set(key, value);
        return;
      }

      setStates((prev) => ({ ...prev, [key]: "saved" }));
      setError(null);
    },
    [challenge, router],
  );

  function onChange(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    pending.current.set(key, value);
    setStates((prev) => ({ ...prev, [key]: "dirty" }));

    clearTimeout(timers.current.get(key));
    timers.current.set(
      key,
      setTimeout(() => void flush(key), AUTOSAVE_DELAY_MS),
    );
  }

  const answered = questions.filter((q) => (answers[q.key] ?? "").trim()).length;
  const required = questions.filter((q) => q.required).length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Your answers</h2>
        <p className="text-muted text-xs tabular-nums">
          {answered} of {required} answered
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {questions.map((question) => {
        const value = answers[question.key] ?? "";
        const empty = question.required && !value.trim();

        return (
          <div key={question.key} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor={`q-${question.key}`}
                className={cn("block text-sm font-medium", question.required && "required-mark")}
              >
                {question.label}
              </label>
              <SaveIndicator state={states[question.key] ?? "idle"} />
            </div>

            {question.hint && <p className="text-muted text-xs">{question.hint}</p>}

            <textarea
              id={`q-${question.key}`}
              value={value}
              onChange={(e) => onChange(question.key, e.target.value)}
              onBlur={() => void flush(question.key)}
              maxLength={question.maxLength}
              rows={question.rows}
              placeholder={question.placeholder}
              className={cn(inputClasses(), "resize-y text-[13px] leading-relaxed")}
            />

            <div className="flex items-baseline justify-between gap-2">
              {empty ? (
                <p className="text-warning text-xs">This answer is required.</p>
              ) : (
                <span />
              )}
              {value.length > question.maxLength * 0.8 && (
                <span className="text-muted text-xs tabular-nums">
                  {value.length.toLocaleString()} / {question.maxLength.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
