"use client";

import { CheckCircle2, ExternalLink, FileSpreadsheet, Globe, Trash2, Upload } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  adminClearApplicationUrl,
  adminRemoveChallenge4Csv,
  adminSetApplicationUrl,
  adminUploadChallenge4Csv,
  type EventConfigState,
} from "@/app/actions/event-config";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { inputClasses } from "@/components/ui/field";
import type { Challenge4Csv } from "@/lib/event-config";

/**
 * The two things the organisers hand over late, editable while the event is running.
 *
 * On the Overview page because that is the screen an administrator has open on the
 * morning of the event, and because both of these are things you check rather than
 * things you go looking for. Each one states plainly what participants can see right
 * now, so the answer to "did that save?" is on screen rather than in another tab.
 */
export function EventConfig({
  applicationUrl,
  csv,
}: {
  applicationUrl: string | null;
  csv: Challenge4Csv | null;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">Event configuration</h2>
        <p className="text-muted mt-1 text-sm">
          Both take effect immediately — participants see the change on their next page
          load, with no restart.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ApplicationUrlCard applicationUrl={applicationUrl} />
        <CsvCard csv={csv} />
      </div>
    </section>
  );
}

function Card({
  icon,
  title,
  ready,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  ready: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-surface shadow-(--shadow-card) space-y-4 rounded-(--radius-card) border p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </p>
        <span
          className={
            ready
              ? "border-success/30 bg-success/10 text-success-strong inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
              : "border-warning/30 bg-warning/10 text-warning-strong inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
          }
        >
          {ready ? <CheckCircle2 size={12} /> : null}
          {ready ? "Live" : "Not set"}
        </span>
      </div>
      {children}
    </div>
  );
}

function ApplicationUrlCard({ applicationUrl }: { applicationUrl: string | null }) {
  const [value, setValue] = useState(applicationUrl ?? "");
  const [state, setState] = useState<EventConfigState | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmingClear, setConfirmingClear] = useState(false);

  function save() {
    startTransition(async () => setState(await adminSetApplicationUrl(value)));
  }

  function clear() {
    startTransition(async () => {
      setState(await adminClearApplicationUrl());
      setValue("");
      setConfirmingClear(false);
    });
  }

  return (
    <Card
      icon={<Globe size={15} className="text-violet" />}
      title="Application under test"
      ready={Boolean(applicationUrl)}
    >
      <p className="text-muted text-xs">
        The e-commerce site participants open for Challenges 1 and 2. Shown on the
        briefing and on both challenge pages.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="app-url" className="block text-sm font-medium">
          Address
        </label>
        <input
          id="app-url"
          type="text"
          inputMode="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://shop.example.com"
          className={inputClasses()}
        />
        <p className="text-muted text-xs">
          A bare address such as <code>shop.example.com</code> is fine — https is
          assumed.
        </p>
      </div>

      {applicationUrl && (
        <p className="text-muted text-xs">
          Participants currently open{" "}
          <a
            href={applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet inline-flex items-center gap-1 font-medium hover:underline"
          >
            {applicationUrl}
            <ExternalLink size={11} />
          </a>
        </p>
      )}

      {state?.message && (
        <Alert variant={state.ok ? "success" : "error"}>{state.message}</Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {applicationUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmingClear(true)}
            disabled={pending}
            className="hover:text-danger-strong"
          >
            Clear
          </Button>
        )}
        <Button size="sm" onClick={save} loading={pending}>
          Save link
        </Button>
      </div>

      <Dialog
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        title="Remove the application link?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            Participants will see &ldquo;Application link pending&rdquo; instead, on the
            briefing and on Challenges 1 and 2. Anyone part-way through keeps whatever
            they have already saved.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmingClear(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={clear} loading={pending}>
              Remove link
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CsvCard({ csv }: { csv: Challenge4Csv | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, uploading] = useActionState(adminUploadChallenge4Csv, {});
  const [removing, startRemoving] = useTransition();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removeState, setRemoveState] = useState<EventConfigState | null>(null);

  function remove() {
    startRemoving(async () => {
      setRemoveState(await adminRemoveChallenge4Csv());
      setConfirmingRemove(false);
    });
  }

  const notice = state.message ? state : removeState;

  return (
    <Card
      icon={<FileSpreadsheet size={15} className="text-violet" />}
      title="Challenge 4 starting CSV"
      ready={Boolean(csv)}
    >
      <p className="text-muted text-xs">
        The test-case file participants download for Challenge 4. Replacing it takes
        effect at once — anyone who already downloaded the old one will need to fetch it
        again.
      </p>

      {csv && (
        <div className="border-border bg-surface-raised rounded-(--radius-control) border p-3">
          <p className="truncate font-mono text-xs font-medium">{csv.filename}</p>
          <p className="text-muted mt-1 text-xs">
            {formatBytes(csv.sizeBytes)}
            {csv.uploadedAt
              ? ` · uploaded ${csv.uploadedAt.toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}`
              : ""}
          </p>
          <a
            href="/api/files/challenge4-csv"
            className="text-violet mt-2 inline-block text-xs font-medium hover:underline"
          >
            Download what participants get
          </a>
        </div>
      )}

      <form ref={formRef} action={formAction} className="space-y-2">
        <label htmlFor="csv-file" className="block text-sm font-medium">
          {csv ? "Replace with" : "Choose a file"}
        </label>
        <input
          id="csv-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="text-muted file:border-border file:bg-surface-raised file:text-text hover:file:border-violet/40 block w-full text-xs file:mr-3 file:cursor-pointer file:rounded-(--radius-control) file:border file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />

        {notice?.message && (
          <Alert variant={notice.ok ? "success" : "error"}>{notice.message}</Alert>
        )}

        {/* Showing the first lines back is the only guard against the one mistake no
            validator can catch: uploading the wrong CSV. */}
        {state.ok && state.preview && state.preview.length > 0 && (
          <div className="border-border bg-surface-raised rounded-(--radius-control) border p-3">
            <p className="text-muted mb-1.5 font-mono text-[10px] tracking-wide uppercase">
              First lines — check this is the right file
            </p>
            <pre className="text-muted overflow-x-auto font-mono text-[11px] leading-relaxed">
              {state.preview.join("\n")}
            </pre>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {csv && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingRemove(true)}
              disabled={uploading || removing}
              className="hover:text-danger-strong"
            >
              <Trash2 size={14} />
              Remove
            </Button>
          )}
          <Button type="submit" size="sm" loading={uploading}>
            <Upload size={14} />
            {csv ? "Replace CSV" : "Upload CSV"}
          </Button>
        </div>
      </form>

      <Dialog
        open={confirmingRemove}
        onClose={() => setConfirmingRemove(false)}
        title="Remove the Challenge 4 CSV?"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            Participants on the Challenge 4 route will see &ldquo;CSV pending&rdquo;
            instead, and the file will be deleted from storage. Anything they have
            already submitted is unaffected.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmingRemove(false)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} loading={removing}>
              Remove CSV
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
