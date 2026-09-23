"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "retrying" | "error";

/**
 * "Not saved" is reserved for a save the server refused, which is the only kind the
 * participant can do anything about. A save that could not reach the server says so
 * differently, because it is still going to happen.
 */
const LABELS: Record<SaveState, string> = {
  idle: "",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  retrying: "Reconnecting — your work is kept",
  error: "Not saved",
};

/**
 * The autosave indicator (DESIGN_LANGUAGE.md §4.1, signature moment 3).
 *
 * Small, frequent, and the entire basis of a participant's trust that three hours of
 * work is safe. It is announced politely rather than assertively: a screen reader
 * user should hear it when they pause, not have every keystroke interrupted.
 */
export function SaveIndicator({ state, className }: { state: SaveState; className?: string }) {
  if (state === "idle") return null;

  const color =
    state === "error"
      ? "text-danger-strong"
      : state === "retrying"
        ? "text-warning-strong"
        : state === "saved"
          ? "text-success-strong"
          : "text-muted";

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-1.5 text-xs", color, className)}
    >
      {(state === "saving" || state === "retrying") && (
        <Loader2 size={12} className="animate-spin" />
      )}
      {/* Keyed on the state so React remounts the tick and the animation runs
          again on every save, rather than only the first. */}
      {state === "saved" && <Check key="saved" size={12} className="save-pulse" />}
      {state === "error" && <AlertCircle size={12} />}
      {LABELS[state]}
    </span>
  );
}
