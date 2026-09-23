"use client";

import { BookOpen, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { WtqLogo } from "@/components/brand/logos";
import { onAttemptClosed } from "@/lib/attempt-channel";
import { cn } from "@/lib/utils";
import { useCountdown, type TimerPhase } from "./use-countdown";

const PHASE_COLOR: Record<TimerPhase, string> = {
  calm: "var(--timer-calm)",
  caution: "var(--timer-caution)",
  warning: "var(--timer-warning)",
  critical: "var(--timer-critical)",
  expired: "var(--timer-critical)",
};

const PHASE_LABEL: Record<TimerPhase, string> = {
  calm: "Time remaining",
  caution: "30 minutes remaining",
  warning: "10 minutes remaining",
  critical: "Less than 5 minutes remaining",
  expired: "Time is up",
};

/**
 * The sticky header: always visible during the test, on every tab of the workspace
 * and on each submission page (requirement 3).
 *
 * Every instance is anchored to the same server-supplied remaining time, so two tabs
 * cannot drift apart about how long is left.
 */
export function ChallengeHeader({
  initialRemainingMs,
  children,
}: {
  initialRemainingMs: number;
  children?: React.ReactNode;
}) {
  const router = useRouter();

  /**
   * Three ways this attempt can end under a tab's feet, all landing here:
   *   - the clock reaching zero in this tab (onExpire)
   *   - the server reporting it closed at the next poll (onClosed)
   *   - another tab submitting (the BroadcastChannel below)
   *
   * `replace` rather than `push`, because there is nothing to go back to.
   */
  const leave = useCallback(
    (reason: "submitted" | "expired") => router.replace(`/submitted?reason=${reason}`),
    [router],
  );

  const onExpire = useCallback(() => leave("expired"), [leave]);
  const onClosed = useCallback(() => leave("submitted"), [leave]);

  useEffect(() => onAttemptClosed(() => leave("submitted")), [leave]);

  const { formatted, phase, remainingMs } = useCountdown({
    initialRemainingMs,
    onExpire,
    onClosed,
  });

  const color = PHASE_COLOR[phase];
  const urgent = phase === "critical" || phase === "expired";

  return (
    <header className="border-border bg-surface/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <WtqLogo size={34} className="hidden shrink-0 sm:block" />

          <div>
            <p className="text-muted font-mono text-[10px] tracking-[0.18em] uppercase">
              {PHASE_LABEL[phase]}
            </p>
            <p
              className={cn(
                "font-display tabular text-3xl leading-tight font-bold sm:text-4xl",
                urgent && "animate-pulse",
              )}
              style={{ color }}
            >
              {formatted}
            </p>
          </div>

          {/* Announced at intervals rather than every second, which would make a
              screen reader unusable (DESIGN_LANGUAGE.md §5). */}
          <p aria-live="polite" className="sr-only">
            {PHASE_LABEL[phase]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Requirement 1: the briefing stays reachable during the test, in a new
              tab so nothing in progress is lost. */}
          <a
            href="/challenge"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-muted hover:text-text flex items-center gap-1.5 rounded-(--radius-control) border px-3 py-2 text-sm transition-colors"
          >
            <BookOpen size={14} />
            <span className="hidden sm:inline">Information</span>
          </a>

          {children}
        </div>
      </div>

      {/* The final minute is when people panic and do something destructive. The
          interface should be reassuring them, not only alarming them. */}
      {remainingMs > 0 && remainingMs <= 60_000 && (
        <div className="bg-danger/10 text-danger border-danger/20 border-t px-4 py-2 text-center text-sm font-medium">
          <ShieldCheck size={14} className="mr-1.5 inline" />
          Less than a minute left — everything you have saved is already stored.
        </div>
      )}
    </header>
  );
}
