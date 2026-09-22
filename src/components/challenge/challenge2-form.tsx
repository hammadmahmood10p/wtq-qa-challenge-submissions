"use client";

import { Eye, FileText, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveChallenge2, type SubmissionResult } from "@/app/actions/challenge23";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INITIAL: SubmissionResult = { ok: false };

interface Props {
  attemptId: string;
  maxUploadMb: number;
  existing: { filename: string; sizeBytes: number; uploadedAt: string } | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The file chooser, with its own state.
 *
 * Separated so the parent can clear it after a successful upload by changing its
 * `key`, which remounts it and resets both the React state and the native input. The
 * alternative — clearing state from an effect that watches the action result — is the
 * cascading-render pattern React now warns about.
 */
function FilePicker({ maxUploadMb }: { maxUploadMb: number }) {
  const [selected, setSelected] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (!file || !inputRef.current) return;

    // Route the drop through the real input so the form submits it normally.
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    setSelected(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-(--radius-card) border border-dashed p-8 text-center transition-colors",
        dragging ? "border-violet bg-violet/5" : "border-border",
      )}
    >
      <FileText size={22} className="text-muted mx-auto mb-3" />

      <label htmlFor="challenge2-file" className="block cursor-pointer">
        <span className="text-violet text-sm font-medium underline">Choose your PDF</span>
        <span className="text-muted text-sm"> or drag it here</span>
        <input
          ref={inputRef}
          id="challenge2-file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setSelected(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
      </label>

      <p className="text-muted mt-2 text-xs">PDF only, up to {maxUploadMb}MB.</p>

      {selected && (
        <p className="text-text mt-4 font-mono text-xs">
          {selected.name} · {formatSize(selected.size)}
        </p>
      )}
    </div>
  );
}

/**
 * Challenge 2's upload.
 *
 * One file, replaced on re-upload (D9). The already-uploaded state is shown
 * prominently because the commonest anxiety here is "did that work?" — and once the
 * attempt closes there is no way to check, so an ambiguous answer is not good enough.
 */
export function Challenge2Form({ attemptId, maxUploadMb, existing }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveChallenge2, INITIAL);

  useEffect(() => {
    if (state.closed) router.refresh();
  }, [state.closed, router]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert variant="error">{state.error}</Alert>}

      {existing && (
        <Alert variant="success" title="Your report is uploaded">
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs">{existing.filename}</span>
            <span className="text-xs opacity-80">{formatSize(existing.sizeBytes)}</span>
            <a
              href={`/api/files/challenge2/${attemptId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium underline"
            >
              <Eye size={12} />
              View your file
            </a>
          </div>
        </Alert>
      )}

      {/* Remounts after each successful upload, clearing the previous choice. */}
      <FilePicker key={state.savedAt ?? "initial"} maxUploadMb={maxUploadMb} />

      <div className="flex flex-wrap items-center gap-3">
        {/*
          Always enabled. Whether a file was chosen is decided by the server, which has
          to check anyway — a disabled button would only be a second, weaker copy of
          that rule.
        */}
        <Button type="submit" variant="aurora" loading={pending}>
          <Upload size={15} />
          {existing ? "Replace and save" : "Save"}
        </Button>

        {existing && (
          <p className="text-muted text-xs">Uploading a new file replaces the one above.</p>
        )}
      </div>
    </form>
  );
}
