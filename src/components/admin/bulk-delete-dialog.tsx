"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  bulkDelete,
  previewBulkDelete,
  type DeletePreview,
} from "@/app/actions/bulk-delete";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import type { RosterQuery } from "@/lib/validation/admin";

/**
 * Bulk remove, for clearing test data.
 *
 * Deliberately awkward. It acts on the filter currently applied to the table rather
 * than on a selection, so what gets deleted is what the admin can see; it shows the
 * count and a sample of names before anything happens; and it will not proceed until
 * the count has been typed in by hand. Typing "412" is a poor confirmation of intent
 * in general, but it is an excellent one here, because the number is the thing most
 * likely to be wrong — an admin who means to clear last week's test batch and has left
 * a filter off will see 1,043 and stop.
 */

const NOUN = {
  participant: { one: "participant", many: "participants" },
  judge: { one: "judge", many: "judges" },
} as const;

type Stage =
  | { name: "closed" }
  | { name: "loading" }
  | { name: "confirm"; preview: DeletePreview }
  | { name: "done"; deleted: number; filesRemoved: number };

export function BulkDeleteDialog({
  kind,
  query,
}: {
  kind: "participant" | "judge";
  query: RosterQuery;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>({ name: "closed" });
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const noun = NOUN[kind];

  function open() {
    setError(null);
    setTyped("");
    setStage({ name: "loading" });

    startTransition(async () => {
      const preview = await previewBulkDelete(kind, query);
      setStage({ name: "confirm", preview });
    });
  }

  function close() {
    setStage({ name: "closed" });
    setTyped("");
    setError(null);
  }

  function confirm(preview: DeletePreview) {
    setError(null);

    startTransition(async () => {
      const result = await bulkDelete(kind, query, preview.total);

      if (result.error) {
        setError(result.error);
        // The count moved under us, so the typed confirmation no longer means
        // anything. Take it back and make them look again.
        const fresh = await previewBulkDelete(kind, query);
        setStage({ name: "confirm", preview: fresh });
        setTyped("");
        return;
      }

      setStage({ name: "done", deleted: result.deleted, filesRemoved: result.filesRemoved });
      router.refresh();
    });
  }

  const preview = stage.name === "confirm" ? stage.preview : null;
  const matches = preview ? typed.trim() === String(preview.total) : false;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={open}
        disabled={pending}
        className="hover:text-danger-strong"
      >
        <Trash2 size={14} />
        Bulk Remove
      </Button>

      <Dialog
        open={stage.name !== "closed"}
        onClose={close}
        title={stage.name === "done" ? "Accounts deleted" : `Delete ${noun.many}?`}
      >
        {stage.name === "loading" && (
          <p className="text-muted text-sm">Counting what this filter matches…</p>
        )}

        {stage.name === "done" && (
          <div className="space-y-4">
            <Alert variant="success">
              {stage.deleted.toLocaleString()} {stage.deleted === 1 ? noun.one : noun.many}{" "}
              deleted
              {stage.filesRemoved > 0 &&
                `, along with ${stage.filesRemoved.toLocaleString()} uploaded ${
                  stage.filesRemoved === 1 ? "file" : "files"
                }`}
              .
            </Alert>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={close}>
                Close
              </Button>
            </div>
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            {preview.total === 0 ? (
              <>
                <p className="text-muted text-sm">
                  No {noun.many} match the filters on the table right now, so there is
                  nothing to delete.
                </p>
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={close}>
                    Close
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Alert variant="warning" title="This cannot be undone">
                  <strong>{preview.total.toLocaleString()}</strong>{" "}
                  {preview.total === 1 ? noun.one : noun.many} matching the filters on
                  this table will be permanently deleted, together with their accounts,
                  saved work and uploaded files. This is not the same as Remove on a
                  single row, which keeps the record.
                </Alert>

                {preview.withWork > 0 && (
                  <Alert variant="error" title="Submitted work will be destroyed">
                    {preview.withWork.toLocaleString()} of them{" "}
                    {kind === "participant"
                      ? "have already submitted or run out of time. Their answers and uploads go too, and judges will no longer see them."
                      : "are holding reviews. Those reviews are deleted and the submissions go back to unclaimed."}
                  </Alert>
                )}

                <div>
                  <p className="text-muted text-xs font-medium tracking-wide uppercase">
                    Including
                  </p>
                  <ul className="text-muted mt-2 space-y-1 text-sm">
                    {preview.sample.map((person) => (
                      <li key={person.email} className="truncate">
                        {person.fullName}{" "}
                        <span className="text-muted/70 font-mono text-xs">
                          {person.email}
                        </span>
                      </li>
                    ))}
                    {preview.total > preview.sample.length && (
                      <li className="text-muted/70">
                        and {(preview.total - preview.sample.length).toLocaleString()} more
                      </li>
                    )}
                  </ul>
                </div>

                <Field
                  label={`Type ${preview.total} to confirm`}
                  hint="The number of accounts about to be deleted."
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={String(preview.total)}
                    />
                  )}
                </Field>

                {error && <Alert variant="error">{error}</Alert>}

                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={close} disabled={pending}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => confirm(preview)}
                    disabled={!matches || pending}
                    loading={pending}
                  >
                    Delete {preview.total.toLocaleString()}{" "}
                    {preview.total === 1 ? noun.one : noun.many}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
