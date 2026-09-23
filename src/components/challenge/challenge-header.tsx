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

/**
 * Phrased as bounds, not as readings.
 *
 * These label a phase the clock has entered, not the time on it. During a normal run
 * they coincide, because the phase changes exactly as the countdown passes each mark.
 * A reopened attempt starts wherever the admin set it — twenty-five minutes, say —
 * so "30 minutes remaining" sat above a clock reading 00:24:37. "Under 30 minutes"
 * is true in both cases.
 */
const PHASE_LABEL: Record<TimerPhase, string> = {
  calm: "Time remaining",
  caution: "Under 30 minutes remaining",
  warning: "Under 10 minutes remaining",
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
  totalMs,
  children,
}: {
  initialRemainingMs: number;
  /** The attempt's full allowance, so the ring has something to deplete against. */
  totalMs: number;
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

  // Signature moment 4. Ambient progress — it says roughly how much of the attempt
  // is left without anyone having to read the digits, and it is never the only
  // signal: the number and the phase label say the same thing in words.
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const RADIUS = 17;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  return (
    <header className="border-border bg-surface/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="app-gutter flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-4">
          <WtqLogo height={30} className="hidden shrink-0 sm:block" />

          <svg
            aria-hidden="true"
            className="countdown-ring hidden shrink-0 -rotate-90 sm:block"
            width={40}
            height={40}
            viewBox="0 0 40 40"
          >
            <circle
              cx={20}
              cy={20}
              r={RADIUS}
              fill="none"
              stroke="var(--border)"
              strokeWidth={3}
            />
            <circle
              cx={20}
              cy={20}
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            />
          </svg>

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
        <div className="bg-danger/10 text-danger-strong border-danger/20 border-t px-4 py-2 text-center text-sm font-medium">
          <ShieldCheck size={14} className="mr-1.5 inline" />
          Less than a minute left — everything you have saved is already stored.
        </div>
      )}
    </header>
  );
}
