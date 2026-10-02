"use client";

import { AlertTriangle, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  deleteSelected,
  listDeletable,
  type DeletableRow,
} from "@/app/actions/bulk-delete";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { inputClasses } from "@/components/ui/field";

/**
 * Bulk remove, for clearing test data.
 *
 * Deliberately a two-step dialog. The list is where the choice is made and can be
 * changed freely; the confirmation does nothing but ask, and offers a way back that
 * keeps the selection — because a confirmation you can only accept or abandon makes
 * people accept it rather than lose five minutes of ticking.
 *
 * The whole roster loads at once rather than a page at a time. A cleanup tool that
 * showed you twenty-five rows would have you deleting in twenty-five-row instalments,
 * and the account you cannot see is the one left behind. A thousand rows of this markup
 * is unremarkable for a browser; the search box is there for finding, not for paging.
 */

const NOUN = {
  participant: { one: "Participant", many: "Participants" },
  judge: { one: "Judge", many: "Judges" },
} as const;

type Stage = "closed" | "loading" | "select" | "confirm" | "done";

export function BulkDeleteDialog({ kind }: { kind: "participant" | "judge" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [stage, setStage] = useState<Stage>("closed");
  const [rows, setRows] = useState<DeletableRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deleted: number; filesRemoved: number } | null>(null);

  const noun = NOUN[kind];

  function open() {
    setError(null);
    setSearch("");
    setSelected(new Set());
    setStage("loading");

    startTransition(async () => {
      try {
        setRows(await listDeletable(kind));
        setStage("select");
      } catch {
        setError("Could not load the list. Please try again.");
        setStage("select");
      }
    });
  }

  function close() {
    setStage("closed");
    setRows([]);
    setSelected(new Set());
    setSearch("");
    setError(null);
    setResult(null);
  }

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.fullName.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle),
    );
  }, [rows, search]);

  const chosen = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const chosenWithWork = chosen.filter((row) => row.hasWork).length;

  // "Select all" acts on what is on screen, not on the whole roster. Searching for
  // "test" and ticking the header box should select the test accounts — selecting a
  // thousand others invisibly would be a trap.
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const row of visible) next.delete(row.id);
      else for (const row of visible) next.add(row.id);
      return next;
    });
  }

  function confirm() {
    setError(null);

    startTransition(async () => {
      const outcome = await deleteSelected(kind, [...selected]);

      if (outcome.error) {
        setError(outcome.error);
        setStage("select");
        return;
      }

      setResult({ deleted: outcome.deleted, filesRemoved: outcome.filesRemoved });
      setStage("done");
      router.refresh();
    });
  }

  const title =
    stage === "done"
      ? `${noun.many} deleted`
      : stage === "confirm"
        ? `Delete ${chosen.length} ${chosen.length === 1 ? noun.one.toLowerCase() : noun.many.toLowerCase()}?`
        : `Remove ${noun.many.toLowerCase()}`;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={open}
        disabled={pending && stage === "closed"}
        className="hover:text-danger-strong"
      >
        <Trash2 size={14} />
        Bulk Remove
      </Button>

      <Dialog
        open={stage !== "closed"}
        onClose={() => !pending && close()}
        title={title}
        className="max-w-3xl"
      >
        {stage === "loading" && (
          <p className="text-muted text-sm">Loading {noun.many.toLowerCase()}…</p>
        )}

        {stage === "select" && (
          <div className="space-y-4">
            {error && <Alert variant="error">{error}</Alert>}

            <div className="relative">
              <Search
                size={15}
                className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${noun.many.toLowerCase()} by name or email…`}
                aria-label={`Search ${noun.many.toLowerCase()}`}
                className={`${inputClasses()} pl-9`}
              />
            </div>

            <div className="border-border overflow-hidden rounded-(--radius-card) border">
              <label className="border-border bg-surface-raised flex cursor-pointer items-center gap-3 border-b px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={visible.length === 0}
                  className="size-4 shrink-0 accent-[var(--violet)]"
                />
                <span className="text-sm font-medium">
                  {search.trim() ? `Select all ${visible.length} shown` : "Select all"}
                </span>
                <span className="text-muted ml-auto text-xs tabular-nums">
                  {selected.size} of {rows.length} selected
                </span>
              </label>

              <div className="max-h-[22rem] overflow-y-auto">
                {visible.length === 0 ? (
                  <p className="text-muted px-4 py-8 text-center text-sm">
                    No {noun.many.toLowerCase()} match that search.
                  </p>
                ) : (
                  <ul>
                    {visible.map((row) => (
                      <li key={row.id} className="border-border border-b last:border-b-0">
                        <label className="hover:bg-surface-raised flex cursor-pointer items-center gap-3 px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggle(row.id)}
                            className="size-4 shrink-0 accent-[var(--violet)]"
                          />

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {row.fullName}
                            </span>
                            <span className="text-muted block truncate text-xs">{row.email}</span>
                          </span>

                          {/* Said against the row, not totalled in the next dialog:
                              the consequence belongs where the decision is made. */}
                          {row.hasWork && (
                            <span className="border-warning/40 bg-warning/10 text-warning-strong shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium">
                              {kind === "participant" ? "has submitted" : "holds reviews"}
                            </span>
                          )}

                          <span className="text-muted shrink-0 text-[11px]">{row.status}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => setStage("confirm")}
                disabled={selected.size === 0 || pending}
              >
                <Trash2 size={14} />
                Delete {selected.size}{" "}
                {selected.size === 1 ? noun.one : noun.many}
              </Button>
            </div>
          </div>
        )}

        {stage === "confirm" && (
          <div className="space-y-4">
            {error && <Alert variant="error">{error}</Alert>}

            <Alert variant="warning" title="This cannot be undone">
              <strong>{chosen.length}</strong>{" "}
              {chosen.length === 1 ? noun.one.toLowerCase() : noun.many.toLowerCase()} will be
              permanently deleted, together with their accounts, saved work and uploaded
              files. This is not the same as Remove on a single row, which keeps the
              record.
            </Alert>

            {chosenWithWork > 0 && (
              <Alert variant="error" title="Submitted work will be destroyed">
                {chosenWithWork} of them{" "}
                {kind === "participant"
                  ? "have already submitted or run out of time. Their answers and uploads go too, and judges will no longer see them."
                  : "are holding reviews. Those reviews are deleted and the submissions go back to unclaimed."}
              </Alert>
            )}

            <div>
              <p className="text-muted text-xs font-medium tracking-wide uppercase">
                About to be deleted
              </p>
              <div className="border-border mt-2 max-h-[14rem] overflow-y-auto rounded-(--radius-control) border">
                <ul className="divide-border divide-y">
                  {chosen.map((row) => (
                    <li key={row.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <AlertTriangle size={13} className="text-danger-strong shrink-0" />
                      <span className="truncate">{row.fullName}</span>
                      <span className="text-muted ml-auto shrink-0 truncate font-mono text-[11px]">
                        {row.email}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {/* Back, not cancel. The selection survives, because losing it is what
                  makes someone click Confirm on a list they are no longer sure of. */}
              <Button variant="secondary" onClick={() => setStage("select")} disabled={pending}>
                Back to selection
              </Button>
              <Button variant="danger" onClick={confirm} loading={pending}>
                Confirm
              </Button>
            </div>
          </div>
        )}

        {stage === "done" && result && (
          <div className="space-y-4">
            <Alert variant="success">
              {result.deleted.toLocaleString()}{" "}
              {result.deleted === 1 ? noun.one.toLowerCase() : noun.many.toLowerCase()} deleted
              {result.filesRemoved > 0 &&
                `, along with ${result.filesRemoved.toLocaleString()} uploaded ${
                  result.filesRemoved === 1 ? "file" : "files"
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
      </Dialog>
    </>
  );
}
