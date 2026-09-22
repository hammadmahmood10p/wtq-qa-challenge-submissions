"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const LABELS: Record<SaveState, string> = {
  idle: "",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
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
      ? "text-danger"
      : state === "saved"
        ? "text-success"
        : "text-muted";

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-1.5 text-xs", color, className)}
    >
      {state === "saving" && <Loader2 size={12} className="animate-spin" />}
      {state === "saved" && <Check size={12} />}
      {state === "error" && <AlertCircle size={12} />}
      {LABELS[state]}
    </span>
  );
}
