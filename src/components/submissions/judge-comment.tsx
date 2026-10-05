"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveJudgeCommentAction } from "@/app/actions/evaluation";
import { SaveIndicator, type SaveState } from "@/components/challenge/save-indicator";
import { MAX_JUDGE_COMMENT } from "@/lib/evaluation-limits";
import { retrySave, type RetryHandle } from "@/lib/retry-save";
import { cn } from "@/lib/utils";

const AUTOSAVE_DELAY_MS = 900;

/**
 * The Comments column.
 *
 * One box per submission, autosaving on the same debounce the participants' fields
 * use, so a judge typing a paragraph costs one write rather than one per keystroke.
 *
 * Who may type in it is decided on the server (src/lib/evaluation.ts) and reflected
 * here: the judge holding the submission gets the box, everybody else gets the text.
 * It stays editable after the score is submitted — unlike every other field on a
 * finalised evaluation — because a note explaining a mark is most often wanted once
 * the mark is in.
 *
 * Other people's comments arrive on refresh rather than live. There is no push channel
 * on this table, and inventing one so a judge can watch a colleague type would be a
 * lot of machinery for something nobody asked for.
 */
export function JudgeComment({
  attemptId,
  initialComment,
  canEdit,
  judgeName,
}: {
  attemptId: string;
  initialComment: string | null;
  /** True only for the judge who currently holds this submission. */
  canEdit: boolean;
  /** Whoever holds it, for the empty state. */
  judgeName: string | null;
}) {
  const [value, setValue] = useState(initialComment ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retry = useRef<RetryHandle | null>(null);
  const pending = useRef<string | null>(null);

  // A comment saved by somebody else — or by this judge in another tab — arrives as a
  // new prop on refresh. Taking it would delete whatever is half-typed here, so it is
  // only taken while this box is clean.
  useEffect(() => {
    if (pending.current === null && state !== "error") setValue(initialComment ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialComment]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flush = useCallback(async () => {
    const next = pending.current;
    if (next === null) return;

    pending.current = null;
    clearTimeout(timer.current);

    retry.current?.cancel();
    setState("saving");

    let refused: string | null = null;

    retry.current = retrySave({
      attempt: async () => {
        const result = await saveJudgeCommentAction(attemptId, next);
        if (!result.ok) refused = result.message ?? "Could not save this comment.";
        // Answered either way, so the matter is settled. Only an unreachable server —
        // which throws — is worth repeating.
        return true;
      },
      onSettled: () => {
        retry.current = null;

        if (refused) {
          setState("error");
          setError(refused);
          pending.current = next;
          return;
        }

        setState("saved");
        setError(null);
      },
      onRetryScheduled: () => {
        setState("retrying");
        pending.current = next;
      },
    });
  }, [attemptId]);

  if (!canEdit) {
    return (
      <div className="min-w-[14rem] max-w-[20rem]">
        {value ? (
          <p className="text-sm whitespace-pre-wrap">{value}</p>
        ) : (
          <span className="text-muted text-sm">{judgeName ? "No comment yet" : "—"}</span>
        )}
      </div>
    );
  }

  function onChange(next: string) {
    setValue(next);
    pending.current = next;
    setState("dirty");

    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }

  return (
    <div className="min-w-[14rem] max-w-[20rem] space-y-1">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => void flush()}
        maxLength={MAX_JUDGE_COMMENT}
        rows={2}
        placeholder="Your note on this submission…"
        aria-label="Your comment on this submission"
        className={cn(
          "border-border bg-surface focus:border-violet/60 focus:ring-violet/20 w-full",
          "resize-y rounded-(--radius-control) border px-2.5 py-1.5 text-[13px]",
          "leading-relaxed transition-colors outline-none focus:ring-2",
        )}
      />

      <div className="flex items-baseline justify-between gap-2">
        {error ? (
          <span className="text-danger-strong text-xs">{error}</span>
        ) : (
          <SaveIndicator state={state} />
        )}
        {value.length > MAX_JUDGE_COMMENT * 0.8 && (
          <span className="text-muted text-xs tabular-nums">
            {value.length} / {MAX_JUDGE_COMMENT}
          </span>
        )}
      </div>
    </div>
  );
}
