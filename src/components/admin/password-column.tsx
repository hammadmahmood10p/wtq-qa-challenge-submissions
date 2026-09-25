"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The Password column.
 *
 * It can only ever show a password that is *derivable* — one a bulk import built from
 * the person's own name and number, which the server recomputes from the record. A
 * password somebody chose, or a random temporary one, is an Argon2 hash and is gone.
 * Those rows say so rather than showing a blank, because "we cannot show you this" and
 * "this person has no password" are very different things to read at speed.
 *
 * Hidden until asked for. These pages are already behind a super admin check, so the
 * toggle is not access control — it is there because a roster of a thousand live
 * passwords should not be on screen behind someone giving a demo, or in the
 * screenshot they paste into a chat afterwards.
 */

const RevealContext = createContext(false);

/**
 * Wraps a table so its password cells share one toggle.
 *
 * The table itself stays a server component — it is passed straight through as
 * children — so nothing about the roster query moves to the browser.
 */
export function PasswordReveal({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <RevealPasswordsToggle
          revealed={revealed}
          onToggle={() => setRevealed((v) => !v)}
          count={count}
        />
      </div>
      <RevealContext.Provider value={revealed}>{children}</RevealContext.Provider>
    </div>
  );
}

function RevealPasswordsToggle({
  revealed,
  onToggle,
  count,
}: {
  revealed: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <Button variant="secondary" size="sm" onClick={onToggle} disabled={count === 0}>
      {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      {revealed ? "Hide passwords" : "Show passwords"}
      {count > 0 && <span className="text-muted">({count})</span>}
    </Button>
  );
}

export function PasswordCell({ value }: { value: string | null }) {
  const revealed = useContext(RevealContext);
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <span className="text-muted text-xs" title="Set by the account holder, or a temporary password shown once">
        —
      </span>
    );
  }

  if (!revealed) {
    return <span className="text-muted font-mono text-xs tracking-widest">••••••••</span>;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permissions can refuse; the value is on screen regardless.
    }
  }

  return (
    <span className="flex items-center gap-1.5">
      <code className="font-mono text-xs">{value}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy password for this account`}
        className="text-muted hover:text-text transition-colors"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  );
}
