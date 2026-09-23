"use client";

import { HandGrab } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignSubmissionAction } from "@/app/actions/evaluation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Taking an unassigned submission, from the review page itself.
 *
 * The Judge column in the table is the main way, but a judge who has opened something
 * to see whether it is worth taking should not have to go back to the list to say yes.
 * Both routes call the same action, so the same race check applies: if someone claimed
 * it while this page was open, this one is refused rather than overwriting them.
 */
export function ClaimBar({
  attemptId,
  judgeId,
  judgeName,
}: {
  attemptId: string;
  judgeId: string;
  judgeName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="border-violet/30 bg-violet/5 flex flex-wrap items-center justify-between gap-4 rounded-(--radius-card) border p-5">
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold">Nobody is reviewing this yet</p>
        <p className="text-muted mt-1 text-xs">
          Put your name against it to start scoring. The rest of the panel will see that
          you have taken it.
        </p>
        {error && (
          <Alert variant="error" className="mt-3">
            {error}
          </Alert>
        )}
      </div>

      <Button
        variant="brand"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await assignSubmissionAction(attemptId, judgeId);

            if (!result.ok) {
              setError(result.message ?? "Could not take this submission.");
              return;
            }

            // The page was rendered without any scoring controls; it needs to come
            // back from the server with them.
            router.refresh();
          })
        }
      >
        <HandGrab size={15} />
        Review as {judgeName}
      </Button>
    </section>
  );
}
