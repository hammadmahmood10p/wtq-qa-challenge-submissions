"use client";

import { HandGrab, RotateCcw, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  claimSubmissionAction,
  reEvaluateSubmissionAction,
  releaseSubmissionAction,
} from "@/app/actions/evaluation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * The Actions column.
 *
 * Replaces the dropdown that used to live in the Judge column. That control listed the
 * whole panel, which meant any judge could put any colleague's name against any
 * submission — and judges found it confusing, which is a fair reaction to a control
 * whose most obvious use is the one nobody wants.
 *
 * So the two roles get two different sets of verbs:
 *
 *   judge        — Assign to me, and only while nobody holds it
 *   super admin  — Unassign, and Re-Evaluate once a score is final
 *
 * A judge can no longer move work between people at all. Handing over is a super
 * admin's job, done by putting the submission back in the pool for whoever picks it
 * up, rather than by choosing someone.
 */
export function AssignmentActions({
  attemptId,
  judgeName,
  reviewed,
  role,
}: {
  attemptId: string;
  /** Whoever currently holds it, or null when it is in the pool. */
  judgeName: string | null;
  /** The score has been finalised. */
  reviewed: boolean;
  role: "JUDGE" | "SUPER_ADMIN";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"release" | "reEvaluate" | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);

    startTransition(async () => {
      const result = await action();
      setConfirming(null);

      if (!result.ok) {
        setError(result.message ?? "Could not do that.");
        return;
      }

      // The whole table is stale the moment anyone claims or releases anything.
      router.refresh();
    });
  }

  const held = judgeName !== null;

  return (
    <div className="min-w-[9rem]">
      {role === "JUDGE" ? (
        held ? (
          // Somebody has it. Nothing to offer — not even to the judge holding it,
          // whose way in is the submission link itself.
          <span className="text-muted text-xs">—</span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            loading={pending}
            onClick={() => run(() => claimSubmissionAction(attemptId))}
          >
            <HandGrab size={14} />
            Assign to me
          </Button>
        )
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {held && !reviewed && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming("release")}
              className="hover:text-warning-strong"
            >
              <UserMinus size={14} />
              Unassign
            </Button>
          )}

          {reviewed && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming("reEvaluate")}
              className="hover:text-warning-strong"
            >
              <RotateCcw size={14} />
              Re-Evaluate
            </Button>
          )}

          {!held && !reviewed && <span className="text-muted text-xs">—</span>}
        </div>
      )}

      {error && <p className="text-danger-strong mt-1 text-xs">{error}</p>}

      <Dialog
        open={confirming === "release"}
        onClose={() => !pending && setConfirming(null)}
        title="Unassign this submission?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            It goes back into the shared list and any judge can take it.{" "}
            <strong className="text-text">
              Anything {judgeName} has already scored is kept
            </strong>{" "}
            — whoever picks it up continues from there rather than starting again.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => run(() => releaseSubmissionAction(attemptId))}
            >
              Unassign
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirming === "reEvaluate"}
        onClose={() => !pending && setConfirming(null)}
        title="Reopen this score for re-evaluation?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            The final score is withdrawn and the submission returns to the shared list,
            where any judge can take it — including a different one from{" "}
            {judgeName ?? "the original reviewer"}.
          </p>
          <p className="text-muted text-sm">
            <strong className="text-text">Every mark already given is kept.</strong> The
            judge who picks it up sees the previous scoring and changes only what they
            disagree with.
          </p>
          <p className="text-muted text-xs">
            Recorded against this submission, with who reopened it and when.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => run(() => reEvaluateSubmissionAction(attemptId))}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
