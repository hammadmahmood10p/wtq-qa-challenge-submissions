"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Downloading every uploaded report for one challenge as a single archive.
 *
 * A plain link would be simpler, and wrong. These archives can run to gigabytes and
 * take minutes to build, and a browser given a link shows nothing at all until the
 * first byte arrives — so an admin presses the button, sees no change, and presses it
 * again, and now the VM is building two archives. Fetching it here means the button
 * can say it is working and refuse to start a second one.
 *
 * The trade is that the whole archive lands in the browser's memory before it is
 * written to disk, because that is what a blob download does. For a few hundred
 * reports that is the right trade; if the event ever grows to the point where it is
 * not, the answer is to export per location rather than to go back to a bare link.
 */
export function ExportSubmissionPdfs({ challenge }: { challenge: 2 | 3 }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    setDone(null);

    try {
      const response = await fetch(`/api/files/export/c${challenge}`);

      if (!response.ok) {
        setError(
          response.status === 403
            ? "Only a super admin can export submissions."
            : "Could not build that export. Please try again.",
        );
        return;
      }

      const count = response.headers.get("X-Submission-Count");
      const filename =
        filenameFromDisposition(response.headers.get("Content-Disposition")) ??
        `challenge-${challenge}-submissions.zip`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      // Revoked on the next tick rather than immediately: revoking while the browser
      // is still reading the blob cancels the download in some of them.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setDone(
        count === null
          ? "Download started."
          : count === "0"
            ? `No Challenge ${challenge} reports have been submitted yet — the archive is empty.`
            : `${count} report${count === "1" ? "" : "s"} downloading.`,
      );
    } catch {
      setError("The download did not finish. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="secondary" onClick={download} disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        {busy ? "Preparing…" : `Export All Submitted PDFs of Challenge ${challenge}`}
      </Button>

      {busy && (
        <p className="text-muted mt-1.5 max-w-xs text-xs">
          Collecting every Challenge {challenge} report. Large exports take a few minutes — leave
          this tab open.
        </p>
      )}

      {error && (
        <Alert variant="error" className="mt-2">
          {error}
        </Alert>
      )}
      {done && !busy && <p className="text-success-strong mt-1.5 text-xs">{done}</p>}
    </div>
  );
}

/** Reads the server's filename so the download is named the same as the archive. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? null;
}
