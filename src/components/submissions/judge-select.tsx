"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignSubmissionAction } from "@/app/actions/evaluation";
import type { JudgeOption } from "@/lib/judge-assignment";
import { cn } from "@/lib/utils";

/**
 * The Judge column: who has taken this submission.
 *
 * A judge puts their own name here to start reviewing, and every other judge sees it
 * on their next refresh — which is how a panel working from one shared list avoids two
 * people reading the same submission.
 *
 * The whole panel is listed rather than just "me", because on the day someone will
 * need to hand a submission over, and a super admin will need to move one off a judge
 * who has gone home. Taking one that somebody else already holds is refused by the
 * server, so the worst a mis-click can do is produce a message.
 */
export function JudgeSelect({
  attemptId,
  judgeId,
  judges,
  locked,
}: {
  attemptId: string;
  judgeId: string | null;
  judges: JudgeOption[];
  /** The score is submitted; only a super admin may move it now. */
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Held locally so the box shows the new name immediately, rather than snapping back
  // until the server round trip and revalidation have both finished.
  const [value, setValue] = useState(judgeId ?? "");

  function change(next: string) {
    const previous = value;
    setValue(next);
    setError(null);

    startTransition(async () => {
      const result = await assignSubmissionAction(attemptId, next === "" ? null : next);

      if (!result.ok) {
        setValue(previous);
        setError(result.message ?? "Could not change this.");
        return;
      }

      // Somebody else's row may have changed too — the whole table is stale the
      // moment anyone claims anything.
      router.refresh();
    });
  }

  return (
    <div className="min-w-[10rem]">
      <div className="relative">
        <select
          aria-label="Assigned judge"
          value={value}
          disabled={pending || locked}
          onChange={(e) => change(e.target.value)}
          className={cn(
            "border-border bg-surface w-full rounded-(--radius-control) border py-1.5 pr-8 pl-2.5 text-sm transition-colors",
            "hover:border-muted/50 disabled:opacity-60",
            value === "" && "text-muted",
          )}
        >
          <option value="">Unassigned</option>
          {judges.map((judge) => (
            <option key={judge.id} value={judge.id}>
              {judge.fullName}
            </option>
          ))}
        </select>

        {pending && (
          <Loader2
            size={14}
            className="text-muted pointer-events-none absolute top-1/2 right-8 -translate-y-1/2 animate-spin"
          />
        )}
      </div>

      {error && <p className="text-danger-strong mt-1 text-xs">{error}</p>}
    </div>
  );
}
