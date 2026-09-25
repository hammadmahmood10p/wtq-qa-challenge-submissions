"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * Shows a temporary password exactly once.
 *
 * There is no email service, so this screen is the only time anyone will see it. If
 * the admin closes the dialog without passing it on, the only recovery is another
 * reset — which the copy says plainly, because on event day this will happen.
 */
export function TempPasswordDialog({
  password,
  personName,
  onClose,
}: {
  password: string | null;
  personName?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!password) return;
    try {
      // The dashes are for reading aloud; what gets copied is the actual password.
      await navigator.clipboard.writeText(password.replace(/-/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked by permissions — the password is on screen anyway.
    }
  }

  return (
    <Dialog
      open={password !== null}
      onClose={onClose}
      title="Temporary password"
      description={personName ? `For ${personName}` : undefined}
    >
      <div className="space-y-4">
        <Alert variant="warning" title="This is shown only once">
          Pass it on now. If it is lost, the only way to recover is to reset the
          password again. They will be asked to choose their own at first login.
        </Alert>

        <div className="border-border bg-surface-raised flex items-center justify-between gap-3 rounded-(--radius-control) border px-4 py-3">
          <code className="font-mono text-lg font-semibold tracking-wider break-all">
            {password}
          </code>
          <Button variant="secondary" size="sm" onClick={copy} className="shrink-0">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        {/* Copy already strips them, but somebody reading this aloud in a noisy hall
            has only what is on the screen. Without this line they dictate the dashes,
            the other person types them, and the login fails for a reason neither of
            them can see. */}
        <p className="text-muted text-xs">
          The dashes are only there to make it easier to read aloud — they are{" "}
          <strong className="text-text">not part of the password</strong>. Typed out, it
          is <code className="font-mono">{password?.replace(/-/g, "")}</code>.
        </p>

        <Button variant="primary" full onClick={onClose}>
          I have passed this on
        </Button>
      </div>
    </Dialog>
  );
}
