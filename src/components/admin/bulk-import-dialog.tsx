"use client";

import { AlertTriangle, CheckCircle2, Download, Upload, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  createBulkBatch,
  finishBulkImport,
  previewBulkImport,
  type ImportPreview,
} from "@/app/actions/bulk-import";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  BATCH_SIZE,
  JUDGE_TEMPLATE,
  PARTICIPANT_TEMPLATE,
  problemsToCsv,
  type RowProblem,
} from "@/lib/bulk-import";

/**
 * Bulk account creation, in two steps: look, then commit.
 *
 * The preview is not decoration. Importing a thousand accounts is not something to
 * discover the shape of afterwards, and a file assembled from three cities will have
 * faults in it — this says how many and which before anything is written.
 *
 * Creation is then done in batches, because hashing a password costs tens of
 * milliseconds by design and a thousand of them is well over a minute. Driving it from
 * here gives a progress bar and means a dropped connection costs one batch rather than
 * the whole import.
 */

type Phase = "choose" | "previewing" | "preview" | "creating" | "done";

function downloadCsv(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function BulkImportDialog({ kind }: { kind: "participant" | "judge" }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("choose");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [created, setCreated] = useState(0);
  const [failures, setFailures] = useState<RowProblem[]>([]);
  const [pending, startTransition] = useTransition();

  const noun = kind === "participant" ? "participants" : "judges";
  const template = kind === "participant" ? PARTICIPANT_TEMPLATE : JUDGE_TEMPLATE;
  const columns =
    kind === "participant" ? "fullName, email, phone, cnic, location" : "fullName, email, phone";

  function reset() {
    setPhase("choose");
    setPreview(null);
    setProgress({ done: 0, total: 0 });
    setCreated(0);
    setFailures([]);
    formRef.current?.reset();
  }

  function onPreview(formData: FormData) {
    setPhase("previewing");
    startTransition(async () => {
      const result = await previewBulkImport(kind, formData);
      setPreview(result);
      setPhase("preview");
    });
  }

  async function runImport() {
    if (!preview) return;

    const rows = preview.accepted;
    setPhase("creating");
    setProgress({ done: 0, total: rows.length });

    // Failures found while reading the file carry into the final report, so the
    // organiser ends up with one list rather than two.
    let madeCount = 0;
    const allProblems: RowProblem[] = [...preview.problems];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const result = await createBulkBatch(kind, batch, i + 2);

      madeCount += result.created;
      allProblems.push(...result.problems);

      setCreated(madeCount);
      setFailures([...allProblems]);
      setProgress({ done: Math.min(i + BATCH_SIZE, rows.length), total: rows.length });
    }

    await finishBulkImport(kind, {
      created: madeCount,
      failed: allProblems.length,
      totalDataRows: preview.totalDataRows,
    });

    setPhase("done");
    router.refresh();
  }

  const percent =
    progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Users size={15} />
        Bulk create
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          if (phase !== "creating") setOpen(false);
        }}
        title={`Bulk create ${noun}`}
        description={
          phase === "done"
            ? undefined
            : `Upload a CSV and every row becomes an account, ready to sign in.`
        }
      >
        <div className="space-y-4">
          {/* ---------- choose a file ---------- */}
          {(phase === "choose" || phase === "previewing") && (
            <form ref={formRef} action={onPreview} className="space-y-4">
              <div className="border-border bg-surface-raised space-y-2 rounded-(--radius-control) border p-3">
                <p className="text-xs font-medium">Columns: {columns}</p>
                <p className="text-muted text-xs">
                  Order does not matter, and common spellings are accepted —{" "}
                  <code className="font-mono">Full Name</code>,{" "}
                  <code className="font-mono">Mobile</code> and{" "}
                  <code className="font-mono">City</code> all work.
                </p>
                <button
                  type="button"
                  onClick={() => downloadCsv(`${kind}-template.csv`, template)}
                  className="text-violet inline-flex items-center gap-1 text-xs font-medium hover:underline"
                >
                  <Download size={12} />
                  Download a template
                </button>
              </div>

              <Alert variant="info" title="Passwords are set automatically">
                {kind === "participant"
                  ? "Each participant's password is their first name followed by the last five digits of their ID card number — so nobody has to be told it."
                  : "Each judge's password is their first name followed by the last five digits of their phone number. Imported judges do not need approval."}
              </Alert>

              <div className="space-y-1.5">
                <label htmlFor={`bulk-${kind}`} className="block text-sm font-medium">
                  CSV file
                </label>
                <input
                  id={`bulk-${kind}`}
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  className="text-muted file:border-border file:bg-surface-raised file:text-text hover:file:border-violet/40 block w-full text-xs file:mr-3 file:cursor-pointer file:rounded-(--radius-control) file:border file:px-3 file:py-1.5 file:text-xs file:font-medium"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={phase === "previewing" || pending}>
                  <Upload size={14} />
                  Check the file
                </Button>
              </div>
            </form>
          )}

          {/* ---------- what the file contains ---------- */}
          {phase === "preview" && preview && (
            <>
              {preview.error && <Alert variant="error">{preview.error}</Alert>}

              {preview.missingColumns.length > 0 && (
                <Alert variant="error" title="Some columns are missing">
                  This file has no {preview.missingColumns.join(", ")} column. Nothing was
                  read. Download the template above and match its headings.
                </Alert>
              )}

              {!preview.error && preview.missingColumns.length === 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border-success/30 bg-success/8 rounded-(--radius-control) border p-3">
                      <p className="font-display tabular text-2xl font-bold">
                        {preview.accepted.length}
                      </p>
                      <p className="text-success-strong text-xs">ready to create</p>
                    </div>
                    <div
                      className={
                        preview.problems.length > 0
                          ? "border-warning/30 bg-warning/8 rounded-(--radius-control) border p-3"
                          : "border-border bg-surface-raised rounded-(--radius-control) border p-3"
                      }
                    >
                      <p className="font-display tabular text-2xl font-bold">
                        {preview.problems.length}
                      </p>
                      <p className="text-muted text-xs">will be skipped</p>
                    </div>
                  </div>

                  {preview.problems.length > 0 && (
                    <div className="border-border max-h-44 overflow-y-auto rounded-(--radius-control) border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface-raised text-muted sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-medium">Line</th>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Problem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.problems.slice(0, 50).map((p) => (
                            <tr key={p.line} className="border-border border-t">
                              <td className="text-muted px-3 py-1.5 font-mono">{p.line}</td>
                              <td className="px-3 py-1.5">{p.name || "—"}</td>
                              <td className="text-warning-strong px-3 py-1.5">
                                {p.problems.join("; ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {preview.problems.length > 50 && (
                        <p className="text-muted border-border border-t px-3 py-2 text-xs">
                          …and {preview.problems.length - 50} more. Download the report for
                          the full list.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    {preview.problems.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          downloadCsv(`${kind}-import-problems.csv`, problemsToCsv(preview.problems))
                        }
                      >
                        <Download size={14} />
                        Download problems
                      </Button>
                    )}
                    <Button variant="secondary" onClick={reset}>
                      Choose another file
                    </Button>
                    <Button
                      variant="brand"
                      onClick={runImport}
                      disabled={preview.accepted.length === 0}
                    >
                      Create {preview.accepted.length} {noun}
                    </Button>
                  </div>
                </>
              )}

              {(preview.error || preview.missingColumns.length > 0) && (
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={reset}>
                    Choose another file
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ---------- creating ---------- */}
          {phase === "creating" && (
            <div className="space-y-3 py-2">
              <p className="text-sm font-medium">
                Creating accounts — {progress.done} of {progress.total}
              </p>
              <div className="bg-surface-raised h-2 overflow-hidden rounded-full">
                <div
                  className="bg-violet h-full transition-all duration-(--duration-standard)"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-muted text-xs">
                Please keep this window open. Passwords are hashed one at a time, which is
                deliberate and takes a moment each.
              </p>
            </div>
          )}

          {/* ---------- the report ---------- */}
          {phase === "done" && (
            <>
              <Alert
                variant={failures.length === 0 ? "success" : "warning"}
                title={
                  failures.length === 0
                    ? `All ${created} ${noun} created`
                    : `${created} created, ${failures.length} skipped`
                }
              >
                {failures.length === 0
                  ? "Everyone in the file can now sign in."
                  : "Everything that could be created was. The rows below were skipped and nothing else was affected."}
              </Alert>

              {failures.length > 0 && (
                <div className="border-border max-h-52 overflow-y-auto rounded-(--radius-control) border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-raised text-muted sticky top-0">
                      <tr>
                        <th className="px-3 py-2 font-medium">Line</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.map((p) => (
                        <tr key={`${p.line}-${p.email}`} className="border-border border-t">
                          <td className="text-muted px-3 py-1.5 font-mono">{p.line}</td>
                          <td className="px-3 py-1.5">{p.name || "—"}</td>
                          <td className="text-warning-strong px-3 py-1.5">
                            {p.problems.join("; ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                {failures.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      downloadCsv(`${kind}-import-report.csv`, problemsToCsv(failures))
                    }
                  >
                    <Download size={14} />
                    Download the report
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                >
                  <CheckCircle2 size={15} />
                  Done
                </Button>
              </div>
            </>
          )}

          {phase === "choose" && (
            <p className="text-muted flex items-start gap-1.5 text-xs">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Nothing is created until you have seen what the file contains.
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
